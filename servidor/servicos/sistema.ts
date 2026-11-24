/*
  Atualização do banco (Migracoes.php), limpeza automática (Limpeza.php) e instalação (Instalador.php), em Postgres.
  Instalação na Vercel: banco, chave do sistema e código de instalação vêm das variáveis de ambiente; o formulário
  /instalar pede só o código e o primeiro administrador. Depois de instalado, /instalar responde 404.
*/
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ctx, env, Erro, escHtml } from '../lib/base.js';
import * as Db from '../lib/db.js';
import { raiz } from '../lib/estaticos.js';
import * as Http from '../lib/http.js';
import * as S from '../lib/sessao.js';
import * as L from '../lib/seguranca.js';
import * as T from '../lib/tempo.js';
import { hashSenha } from '../lib/totp.js';
import * as V from '../lib/v.js';
import * as Cardapio from './cardapio.js';
import * as Config from './config.js';
import * as Painel from './painel.js';
import * as Pedidos from './pedidos.js';
import * as Usuarios from './usuarios.js';

/* ================================================================== migrações */

export const VERSAO = 3;

export async function garantir(): Promise<void> {
  if (Math.trunc(Number(await Config.obter('versaoBanco', 1))) >= VERSAO) return;
  await Db.tx(async () => {
    // trava global da migração (o GET_LOCK do MySQL): uma requisição por vez, as outras esperam o fim da transação
    await Db.q("SELECT pg_advisory_xact_lock(hashtext('delivery_migracao'))");
    Config.esquecer();
    if (Math.trunc(Number(await Config.obter('versaoBanco', 1))) < VERSAO) await aplicar();
  });
  Config.esquecer();
}

/** Aplica os passos que faltam (só acrescentam; rodar de novo não estraga nada). */
export async function aplicar(): Promise<void> {
  let v = Math.trunc(Number(await Config.obter('versaoBanco', 1)));
  if (v < 2) {
    for (const [c, def] of [['rev', 'BIGINT NOT NULL DEFAULT 0'], ['pagamento_status', "VARCHAR(12) NOT NULL DEFAULT 'pendente'"], ['pagamento_valor', 'INTEGER NULL'],
      ['pagamento_real', 'VARCHAR(10) NULL'], ['pagamento_entregador', "VARCHAR(60) NOT NULL DEFAULT ''"], ['pagamento_usuario', 'VARCHAR(60) NULL'],
      ['pagamento_em', 'BIGINT NULL'], ['pagamento_obs', "VARCHAR(120) NOT NULL DEFAULT ''"], ['anonimizado_em', 'BIGINT NULL']]) {
      await Db.q(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ${c} ${def}`);
    }
    await Db.q("UPDATE pedidos SET pagamento_status = 'sem_registro' WHERE pagamento_status = 'pendente' AND status IN ('concluido', 'recusado', 'cancelado') AND pagamento_em IS NULL");
    await Db.q('UPDATE pedidos SET rev = numero WHERE rev = 0');
    await Db.q("INSERT INTO contadores (nome, valor) SELECT 'rev', COALESCE(MAX(rev), 0) FROM pedidos ON CONFLICT (nome) DO UPDATE SET valor = GREATEST(contadores.valor, EXCLUDED.valor)");
    for (const t of ['categorias', 'produtos', 'grupos', 'cupons', 'areas', 'banners']) {
      await Db.q(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1`);
      await Db.q(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS arquivado_em BIGINT NULL`);
    }
    await Config.gravar('versaoBanco', 2);
    Http.log('banco atualizado para a versão 2');
    v = 2;
  }
  if (v < 3) {
    await Db.q('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS assinatura VARCHAR(40) NULL');
    await Db.q("ALTER TABLE cupom_usos ADD COLUMN IF NOT EXISTS endereco_chave VARCHAR(40) NOT NULL DEFAULT ''");
    await Db.q("ALTER TABLE cupom_usos ADD COLUMN IF NOT EXISTS predio_chave VARCHAR(40) NOT NULL DEFAULT ''");
    const usos = await Db.todos("SELECT u.id, p.endereco, p.area_id FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero WHERE u.predio_chave = '' AND p.endereco IS NOT NULL AND p.anonimizado_em IS NULL");
    for (const r of usos) {
      let e: unknown = null;
      try { e = JSON.parse(r.endereco); } catch { e = null; }
      const ch = L.chavesEndereco(e, String(r.area_id ?? ''));
      if (ch.predio !== '') await Db.q('UPDATE cupom_usos SET endereco_chave = ?, predio_chave = ? WHERE id = ?', [ch.endereco, ch.predio, Number(r.id)]);
    }
    await Config.gravar('versaoBanco', 3);
    Http.log('banco atualizado para a versão 3');
  }
}

/* ================================================================== limpeza (1 de cada 100 visitas) */

export function talvez(): void {
  if (crypto.randomInt(1, 101) !== 1) return;
  ctx().depois.push(async () => {
    try { await rodar(); } catch (e: any) { Http.log('limpeza: ' + e?.message); }
  });
}

/** Também chamada pelos testes. Devolve quantas linhas cada passo tirou. */
export async function rodar(): Promise<Record<string, number>> {
  const agora = T.agoraMs();
  const r: Record<string, number> = {};
  // DELETE … LIMIT não existe no Postgres: apaga por lotes pelo ctid
  const apagar = async (tabela: string, onde: string, p: unknown[]): Promise<number> =>
    (await Db.q(`DELETE FROM ${tabela} WHERE ctid IN (SELECT ctid FROM ${tabela} WHERE ${onde} LIMIT 2000)`, p)).rowCount;
  r.tentativas = await apagar('tentativas', 'inicio < ?', [T.agoraSeg() - 86_400]);
  r.notificacoes = await apagar('notificacoes', 'em < ?', [agora - 30 * 86_400_000]);
  const meses = Math.max(12, Math.trunc(Number((await Config.obj('privacidade')).prazoMeses ?? 24)));
  r.auditoria = await apagar('auditoria', 'criado_em < ?', [T.somarMeses(agora, -meses)]);
  r.anonimizados = await Pedidos.anonimizarAntigos(100);
  r.sessoes = await apagar('sessoes', 'expira < ?', [T.agoraSeg()]);
  return r;
}

/* ================================================================== instalação */

let instaladoMemoria = false;

/** O sistema está instalado? (o PHP olhava se app/config.php existia; aqui, a marca "instalado" no banco) */
export async function instalado(): Promise<boolean> {
  if (instaladoMemoria) return true;
  if (!env.banco) return false;
  try {
    instaladoMemoria = (await Db.valor("SELECT COUNT(*) FROM configuracoes WHERE chave = 'instalado'")) > 0;
  } catch (e: any) {
    if (e?.code === '42P01') return false; // tabela ainda não existe
    throw e;
  }
  return instaladoMemoria;
}
export const esquecerInstalado = (): void => { instaladoMemoria = false; };

export function lerSemente(): any {
  const php = fs.readFileSync(path.join(raiz(), 'site', 'app', 'sql', 'semente.php'), 'utf8');
  const ini = php.indexOf("<<<'JSON'\n");
  const fim = php.lastIndexOf('\nJSON,');
  if (ini < 0 || fim < 0) throw new Error('semente.php sem o bloco JSON');
  return JSON.parse(php.slice(ini + 10, fim));
}

export async function criarTabelas(): Promise<void> {
  const sql = fs.readFileSync(path.join(raiz(), 'servidor', 'sql', 'schema.sql'), 'utf8');
  await Db.q(sql);
}

function requisitos(): Array<[string, boolean, string]> {
  return [
    ['Banco de dados (DATABASE_URL)', !!env.banco, 'Configure a variável DATABASE_URL com a conexão do Supabase (modo sessão).'],
    ['Chave do sistema (CHAVE_SISTEMA)', env.temChave, 'Configure CHAVE_SISTEMA com 32 bytes aleatórios em base64.'],
    ['Código de instalação (CODIGO_INSTALACAO)', env.codigoInstalacao.length >= 8, 'Configure CODIGO_INSTALACAO (está no COMO-PUBLICAR-VERCEL.txt).'],
    ['Fotos do painel (Supabase Storage)', !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) || !env.vercel, 'Sem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, o envio de fotos pelo painel não funciona.'],
  ];
}

export async function pagina(erro: string | null = null, v: Record<string, string> = {}, sucesso: string | null = null): Promise<never> {
  const e = escHtml;
  const req = requisitos();
  const falta = req.filter(r => !r[1] && r[0] !== 'Fotos do painel (Supabase Storage)');
  const lista = req.map(r => `<li class="${r[1] ? 'ok' : 'x'}"><span>${r[1] ? '✓' : '✕'}</span>${e(r[0])}${r[1] || r[2] === '' ? '' : '<small>' + e(r[2]) + '</small>'}</li>`).join('');
  const campo = (id: string, rotulo: string, tipo = 'text', extra = '', ajuda = ''): string =>
    `<label for="${id}">${e(rotulo)}</label><input id="${id}" name="${id}" type="${tipo}" value="${tipo === 'password' ? '' : e(v[id] ?? '')}" ${extra}>${ajuda ? '<small>' + e(ajuda) + '</small>' : ''}`;
  let corpo: string;
  if (sucesso !== null) {
    corpo = `<h1>Tudo pronto</h1><p class="lead">${e(sucesso)}</p><a class="btn" href="/admin/">Entrar no painel</a><p class="nota"><a href="/">Abrir o site</a></p>`;
  } else {
    corpo = '<h1>Instalar o sistema</h1><p class="lead">Preencha uma vez. Depois disso esta página some e tudo é feito pelo painel.</p>'
      + '<ul class="req">' + lista + '</ul>'
      + (erro ? `<p class="erro" role="alert">${e(erro)}</p>` : '')
      + '<form method="post" action="/instalar" autocomplete="off">'
      + `<input type="hidden" name="_csrf" value="${e(env.banco ? await S.tokenCsrf() : '')}">`
      + '<fieldset><legend>Código de instalação</legend>' + campo('codigo', 'Código', 'text', 'required autocomplete="off" spellcheck="false"', 'Está no arquivo COMO-PUBLICAR-VERCEL.txt que veio junto com o site.') + '</fieldset>'
      + '<fieldset><legend>Banco de dados</legend><p class="nota">O banco é o do Supabase, configurado nas variáveis de ambiente do projeto na Vercel (DATABASE_URL). Não precisa digitar nada aqui.</p></fieldset>'
      + '<fieldset><legend>Seu acesso ao painel</legend>'
      + campo('nome', 'Seu nome', 'text', 'required autocomplete="name"')
      + campo('email', 'Seu e-mail (é o login)', 'email', 'required autocomplete="email"')
      + campo('senha', 'Crie uma senha', 'password', 'required minlength="12" autocomplete="new-password"', 'Mínimo de 12 caracteres. Evite senhas óbvias, como datas e o nome da loja.')
      + campo('senha2', 'Repita a senha', 'password', 'required minlength="12" autocomplete="new-password"') + '</fieldset>'
      + `<button class="btn" type="submit"${falta.length ? ' disabled' : ''}>Instalar</button></form>`;
  }
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
    + '<title>Instalação do sistema</title><link rel="icon" href="/favicon.svg"><style>'
    + '*{box-sizing:border-box}body{margin:0;background:#0d0a08;color:#f6eee5;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:32px 16px}'
    + 'main{max-width:560px;margin:0 auto}h1{font-size:30px;margin:0 0 8px}.lead{color:#cbbcae;margin:0 0 20px}'
    + 'fieldset{border:1px solid #3a2e25;border-radius:12px;padding:16px;margin:0 0 16px}legend{padding:0 6px;font-weight:700;color:#f7741d}'
    + 'label{display:block;font-weight:600;margin:12px 0 6px}input{width:100%;padding:12px;border-radius:8px;border:1px solid #4a3b30;background:#181210;color:#f6eee5;font:inherit}'
    + 'input:focus{outline:2px solid #f7741d;outline-offset:1px}small{display:block;color:#a5978b;font-size:13px;margin-top:4px}'
    + '.btn{display:inline-block;width:100%;text-align:center;background:#f7741d;color:#170c04;border:0;padding:14px 20px;border-radius:10px;font:inherit;font-weight:800;cursor:pointer;text-decoration:none}'
    + '.btn[disabled]{opacity:.5;cursor:not-allowed}.erro{background:#3a1410;border:1px solid #7a2a20;color:#ffd5cc;padding:12px;border-radius:10px}'
    + '.nota{color:#a5978b;font-size:14px;margin:6px 0 0}.nota a{color:#f7741d}.req{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:6px;font-size:14px}'
    + '.req span{display:inline-block;width:22px;font-weight:800}.req .ok span{color:#3ccf7c}.req .x span{color:#ff6b5b}.req small{margin-left:22px}'
    + '</style></head><body><main>' + corpo + '</main></body></html>';
  return Http.pagina(html);
}

export async function instalar(post: Record<string, string>): Promise<never> {
  const v = Object.fromEntries(Object.entries(post).map(([k, x]) => [k, typeof x === 'string' ? x.trim() : '']));
  try {
    await S.verificarCsrf(post);
    await L.contar('instalar:' + L.ip(), 8, 900, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
    const codigo = env.codigoInstalacao;
    if (codigo.length < 8) throw new Erro('Falta configurar CODIGO_INSTALACAO nas variáveis de ambiente.');
    const digitado = (v.codigo ?? '').replace(/ /g, '').toUpperCase();
    if (digitado.length !== codigo.length || !crypto.timingSafeEqual(Buffer.from(codigo.toUpperCase()), Buffer.from(digitado))) {
      throw new Erro('Código de instalação incorreto. Confira no arquivo COMO-PUBLICAR-VERCEL.txt.');
    }
    if (!env.temChave) throw new Erro('Falta configurar CHAVE_SISTEMA nas variáveis de ambiente.');
    const nome = V.texto(v.nome ?? '', 'o seu nome', 2, 80);
    const email = V.email(v.email ?? '', 'o seu e-mail');
    const senha = await Usuarios.validarSenha(post.senha ?? '', 'a senha', [], String(lerSemente()?.config?.loja?.nome ?? ''));
    if ((post.senha2 ?? '') !== senha) throw new Erro('As duas senhas não são iguais.');
    const msg = await preparar(nome, email, senha);
    await Config.gravar('instalado', T.isoHm(T.agoraMs()));
    return pagina(null, {}, msg);
  } catch (e) {
    if (e instanceof Erro) return pagina(e.message, v);
    throw e;
  }
}

/** Cria as tabelas, o cardápio inicial e o primeiro administrador (também usado pelo "npm run instalar" e pelos testes). */
export async function preparar(nome: string, email: string, senha: string): Promise<string> {
  await criarTabelas();
  Config.esquecer();
  if (!(await Config.obter('versaoBanco', null))) await Config.gravar('versaoBanco', VERSAO);
  await aplicar();
  const jaTinha = Number(await Db.valor('SELECT COUNT(*) FROM usuarios')) > 0;
  if (Number(await Db.valor('SELECT COUNT(*) FROM categorias')) === 0) await semear();
  if (jaTinha) return 'Este banco já tinha uma instalação. O cardápio, os pedidos e os usuários foram mantidos: entre com o e-mail e a senha de antes.';
  await Db.q('INSERT INTO usuarios (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['u1', nome, email, hashSenha(senha), 'Administrador', JSON.stringify(Usuarios.PERMISSOES), 'ativo', 0, T.agoraMs()]);
  await Config.gravar('proprietario', 'u1');
  await L.registrar('u1', 'instalar', 'sistema');
  return 'O banco foi preparado e o cardápio inicial está no ar. Entre no painel com ' + email + ' e a senha que você criou.';
}

export async function semear(): Promise<void> {
  const s = lerSemente();
  await Painel.salvarCategorias(s.categorias.map((c: any) => ({ ...c, especial: false })));
  for (const c of s.categorias) if (c.especial) await Db.q('UPDATE categorias SET especial = 1 WHERE id = ?', [c.id]);
  await Painel.salvarGrupos(s.grupos);
  await Painel.salvarProdutos(s.produtos);
  await Painel.salvarAreas(s.areas);
  await Painel.salvarCupons(s.cupons);
  await Painel.salvarBanners(s.banners);
  await Painel.salvarConfig(s.config);
  await Painel.operacaoInicial(s.operacao);
  await Config.gravar('logo', '');
  for (const p of s.produtos) if (p.alt !== '') await Db.q('UPDATE produtos SET alt = ? WHERE id = ?', [p.alt, p.id]);
  Cardapio.esquecer();
  Config.esquecer();
}
