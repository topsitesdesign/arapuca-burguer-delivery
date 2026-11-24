/** Quem acessa o painel: login, permissões, proprietário, duas etapas e perfil (porte de Usuarios.php). */
import crypto from 'node:crypto';
import { ctx, Erro, mbLen, mbSub, ucfirst } from '../lib/base.js';
import * as Db from '../lib/db.js';
import * as S from '../lib/sessao.js';
import * as L from '../lib/seguranca.js';
import * as T from '../lib/tempo.js';
import * as Totp from '../lib/totp.js';
import * as V from '../lib/v.js';
import * as Config from './config.js';

export const PERMISSOES = ['pedidos', 'produtos', 'cupons', 'areas', 'banners', 'configuracoes', 'usuarios'];
export const FUNCOES = ['Administrador', 'Gerente', 'Atendente', 'Cozinha'] as const;
export const SENHA_MIN = 12;
const PROIBIDAS = ['123456789012', '1234567890123', '12345678901234', '123456123456', '111111111111', '000000000000', 'qwertyuiop12',
  'qwertyuiopas', 'qwerty123456', 'password1234', 'password123!', 'senha1234567', 'senhasenha12', 'senha@123456', 'mudar123456!', 'abc123abc123',
  'abcdefghijkl', 'iloveyou1234', 'admin1234567', 'administrador', 'adminadmin12', 'brasilbrasil', 'flamengo1234', 'corinthians1', 'palmeiras123',
  'hamburgueria', 'hamburguer12', 'deliverydelivery', '102030405060', '147258369123', '987654321098', 'aaaaaaaaaaaa', 'trocar123456'];
export const ROTA_ACESSOS = 'configuracoes?aba=usuarios';

export interface Usuario {
  id: string; nome: string; email: string; telefone: string; funcao: string; permissoes: string[]; status: string;
  ultimoAcesso: number | null; ordem: number; doisFatores: boolean;
}

const cache = (): Record<string, any> => ctx().cache;

export function linha(r: any): Usuario {
  let perm: unknown;
  try { perm = JSON.parse(r.permissoes); } catch { perm = null; }
  return {
    id: r.id, nome: r.nome, email: r.email, telefone: r.telefone, funcao: r.funcao,
    permissoes: Array.isArray(perm) ? PERMISSOES.filter(p => (perm as unknown[]).includes(p)) : [], status: r.status,
    ultimoAcesso: r.ultimo_acesso === null ? null : Number(r.ultimo_acesso), ordem: Number(r.ordem), doisFatores: !!Number(r.totp_ativo),
  };
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/u).filter(Boolean);
  const ini = partes.slice(0, 2).map(p => [...p][0]).join('');
  return (ini || '?').toUpperCase();
}

export const versaoSenha = (hash: string): string => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 20);
const igual = (a: string, b: string): boolean => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Proprietário da loja: quem instalou o sistema (u1). */
export async function proprietarioId(): Promise<string> {
  const c = cache();
  if (typeof c.dono === 'string') return c.dono;
  let id = String(await Config.obter('proprietario', ''));
  if (id === '' || !Number(await Db.valor("SELECT COUNT(*) FROM usuarios WHERE id = ? AND status <> 'removido'", [id]))) {
    id = '';
    for (const r of await Db.todos("SELECT id, permissoes FROM usuarios WHERE status <> 'removido' ORDER BY (id = 'u1') DESC, criado_em, ordem")) {
      let p: unknown;
      try { p = JSON.parse(r.permissoes); } catch { p = []; }
      if (Array.isArray(p) && p.includes('usuarios')) { id = String(r.id); break; }
    }
    if (id !== '') await Config.gravar('proprietario', id);
  }
  return (c.dono = id);
}

/** Administrador logado (ou null). Usuário desativado ou com a senha trocada perde o acesso na hora. */
export async function atual(): Promise<Usuario | null> {
  const c = cache();
  if (c.usuario) return c.usuario;
  const id = await S.adminId();
  if (id === null) return null;
  const r = await Db.um('SELECT * FROM usuarios WHERE id = ?', [id]);
  if (!r || r.status !== 'ativo') { await S.sairAdmin(); return null; }
  const v = versaoSenha(String(r.senha_hash));
  const s = await S.versaoAdmin();
  if (s === null) await S.definirVersao(v);
  else if (!igual(s, v)) { await S.sairAdmin(); return null; }
  return (c.usuario = linha(r));
}
const esquecerAtual = (): void => { delete cache().usuario; };

export async function exigir(permissao: string | null = null): Promise<Usuario> {
  const u = await atual();
  if (!u) throw new Erro('Sua sessão terminou. Entre de novo para continuar.', 401);
  if (permissao !== null && !u.permissoes.includes(permissao)) throw new Erro('Seu usuário não tem permissão para isso. Fale com o administrador da loja.', 403);
  return u;
}

export const pode = (u: Usuario, permissao: string): boolean => u.permissoes.includes(permissao);

export async function gerente(u: Usuario): Promise<boolean> {
  return u.id === (await proprietarioId()) || (['Administrador', 'Gerente'].includes(u.funcao) && pode(u, 'pedidos'));
}

export const administrador = (u: Usuario): boolean => pode(u, 'usuarios') || pode(u, 'configuracoes');

export async function precisa2fa(u: Usuario): Promise<boolean> {
  return !!(await Config.obj('seguranca')).exigir2fa && administrador(u) && !u.doisFatores;
}

export async function entrar(emailBruto: unknown, senhaBruta: unknown): Promise<Record<string, unknown>> {
  const ip = L.ip();
  const msgIp = 'Muitas tentativas de entrar. Espere 15 minutos e tente de novo.';
  const msgEmail = 'Muitas tentativas de entrar com este e-mail. Espere 15 minutos e tente de novo.';
  await L.verificar('login-ip:' + ip, 12, 900, msgIp);
  const email = typeof emailBruto === 'string' ? emailBruto.trim().toLowerCase() : '';
  const senha = typeof senhaBruta === 'string' ? senhaBruta : '';
  if (email === '' || senha === '') throw new Erro('Escreva o e-mail e a senha.', 422);
  await L.verificar('login-email-ip:' + email + '|' + ip, 6, 900, msgEmail);
  await L.verificar('login-email:' + email, 30, 900, msgEmail);
  const r = await Db.um("SELECT * FROM usuarios WHERE email = ? AND status <> 'removido'", [email]);
  // mesma demora com ou sem usuário: o hash falso tem o mesmo custo das senhas reais
  const hash = r?.senha_hash ?? (await hashFalso());
  const ok = Totp.conferirSenha(senha, hash) && r && r.status === 'ativo';
  if (!ok) {
    for (const k of ['login-ip:' + ip, 'login-email-ip:' + email + '|' + ip, 'login-email:' + email]) await L.somar(k, 900);
    await L.registrar(null, 'login.falha', 'usuario', r?.id ?? '');
    throw new Erro('E-mail ou senha incorretos.', 422);
  }
  let hashFinal = String(r.senha_hash);
  if (Totp.precisaRefazer(hashFinal)) {
    hashFinal = Totp.hashSenha(senha);
    await Db.q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hashFinal, r.id]);
  }
  await L.zerar('login-email-ip:' + email + '|' + ip);
  if (Number(r.totp_ativo)) {
    await S.guardarPre2fa(r.id, versaoSenha(hashFinal));
    await L.registrar(r.id, 'login.senha', 'usuario', r.id);
    return { ...linha(r), precisaCodigo: true };
  }
  await Db.q('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', [T.agoraMs(), r.id]);
  await S.entrarAdmin(r.id, versaoSenha(hashFinal));
  await L.registrar(r.id, 'login', 'usuario', r.id);
  return linha(r) as unknown as Record<string, unknown>;
}

async function hashFalso(): Promise<string> {
  let h = String(await Config.obter('hashFalso', ''));
  if (h === '' || Totp.precisaRefazer(h)) {
    h = Totp.hashSenha(crypto.randomBytes(16).toString('hex'));
    await Config.gravar('hashFalso', h);
  }
  return h;
}

export async function entrarComCodigo(codigoBruto: unknown): Promise<Usuario> {
  const p = await S.pre2fa();
  if (!p) throw new Erro('O tempo para digitar o código acabou. Entre de novo com o e-mail e a senha.', 422, 'expirou');
  const chave = 'login-codigo:' + p.id;
  await L.verificar(chave, 6, 900, 'Muitos códigos errados. Espere 15 minutos e entre de novo.');
  const r = await Db.um("SELECT * FROM usuarios WHERE id = ? AND status = 'ativo'", [p.id]);
  if (!r || !Number(r.totp_ativo) || !igual(p.v, versaoSenha(String(r.senha_hash)))) {
    await S.limparPre2fa();
    throw new Erro('Entre de novo com o e-mail e a senha.', 422, 'expirou');
  }
  const codigo = typeof codigoBruto === 'string' ? codigoBruto.trim() : '';
  const segredo = Totp.abrir(r.totp_segredo);
  const passo = segredo ? Totp.conferir(segredo, codigo, Number(r.totp_passo)) : null;
  if (passo !== null) {
    await Db.q('UPDATE usuarios SET totp_passo = ? WHERE id = ?', [passo, r.id]);
  } else {
    let lista: unknown;
    try { lista = JSON.parse(r.totp_recuperacao); } catch { lista = []; }
    const resto = Totp.usarRecuperacao(Array.isArray(lista) ? lista : [], codigo);
    if (resto === null) {
      await L.somar(chave, 900);
      await L.registrar(r.id, 'login.codigo-falha', 'usuario', r.id);
      throw new Erro('Código incorreto. Confira no aplicativo e digite os 6 números de agora.', 422, 'codigo');
    }
    await Db.q('UPDATE usuarios SET totp_recuperacao = ? WHERE id = ?', [JSON.stringify(resto), r.id]);
    await L.registrar(r.id, 'login.recuperacao', 'usuario', r.id, { restam: resto.length });
  }
  await L.zerar(chave);
  await Db.q('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', [T.agoraMs(), r.id]);
  await S.entrarAdmin(r.id, p.v);
  await L.registrar(r.id, 'login', 'usuario', r.id);
  return linha(r);
}

/* ------------------------------------------------------------------ duas etapas (Meu perfil) */

export async function iniciar2fa(u: Usuario): Promise<Record<string, string>> {
  const s = Totp.novoSegredo();
  await S.guardarSegredoNovo(s);
  const loja = String((await Config.obj('loja')).nome ?? '');
  return { segredo: (s.match(/.{1,4}/g) || []).join(' ').trim(), uri: Totp.uri(s, u.email, loja !== '' ? loja : 'Painel') };
}

export async function ativar2fa(u: Usuario, codigo: unknown, senha: unknown): Promise<string[]> {
  await confirmarSenha(u, senha, 'para ativar a verificação em duas etapas');
  const s = await S.segredoNovo();
  if (!s) throw new Erro('Comece de novo: toque em Ativar verificação em duas etapas.', 422, 'codigo');
  const passo = Totp.conferir(s, typeof codigo === 'string' ? codigo : '');
  if (passo === null) throw new Erro('Código incorreto. Confira se o aplicativo mostra a conta certa e digite os 6 números de agora.', 422, 'codigo');
  const [mostrar, guardar] = Totp.codigosRecuperacao();
  await Db.q('UPDATE usuarios SET totp_segredo = ?, totp_ativo = 1, totp_passo = ?, totp_recuperacao = ? WHERE id = ?', [Totp.fechar(s), passo, JSON.stringify(guardar), u.id]);
  await S.guardarSegredoNovo(null);
  await L.registrar(u.id, '2fa.ativar', 'usuario', u.id);
  esquecerAtual();
  return mostrar;
}

export async function desativar2fa(u: Usuario, senha: unknown): Promise<void> {
  await confirmarSenha(u, senha, 'para desligar a verificação em duas etapas');
  if ((await Config.obj('seguranca')).exigir2fa && administrador(u)) {
    throw new Erro('A loja exige a verificação em duas etapas para administradores. Só o proprietário pode desligar essa regra, em Configurações › Segurança.', 403);
  }
  await Db.q('UPDATE usuarios SET totp_segredo = NULL, totp_ativo = 0, totp_passo = 0, totp_recuperacao = NULL WHERE id = ?', [u.id]);
  await L.registrar(u.id, '2fa.desativar', 'usuario', u.id);
  esquecerAtual();
}

export async function sair(): Promise<void> {
  const u = await atual();
  if (u) await L.registrar(u.id, 'logout', 'usuario', u.id);
  await S.sairAdmin();
  esquecerAtual();
}

export async function paraPainel(u: Usuario): Promise<Record<string, unknown>> {
  return { id: u.id, nome: u.nome, iniciais: iniciais(u.nome), funcao: u.funcao, email: u.email, telefone: u.telefone, permissoes: u.permissoes,
    proprietario: u.id === (await proprietarioId()), gerente: await gerente(u), doisFatores: !!u.doisFatores, precisa2fa: await precisa2fa(u) };
}

function acesso(ms: number | null): string {
  if (!ms) return '—';
  const dia = T.iso(ms);
  const hoje = T.hojeIso();
  const ontem = T.somarDias(hoje, -1);
  return (dia === hoje ? 'Hoje' : dia === ontem ? 'Ontem' : T.dmy(ms)) + ', ' + T.hm(ms);
}

export async function lista(): Promise<any[]> {
  const dono = await proprietarioId();
  return (await Db.todos("SELECT * FROM usuarios WHERE status <> 'removido' ORDER BY ordem, criado_em")).map(r => {
    const u = linha(r);
    return { id: u.id, nome: u.nome, email: u.email, funcao: u.funcao, status: u.status, permissoes: u.permissoes, acesso: acesso(u.ultimoAcesso), proprietario: u.id === dono, doisFatores: u.doisFatores };
  });
}

/** Senha nova: 12 caracteres ou mais, fora da lista de senhas vazadas e sem repetir o e-mail ou o nome da loja. */
export async function validarSenha(s: unknown, rotulo = 'a senha', evitar: string[] = [], loja: string | null = null): Promise<string> {
  if (typeof s !== 'string' || mbLen(s) < SENHA_MIN) throw new Erro(ucfirst(rotulo) + ' precisa ter pelo menos ' + SENHA_MIN + ' caracteres.', 422, 'senha');
  if (mbLen(s) > 200) throw new Erro(ucfirst(rotulo) + ' é longa demais.', 422, 'senha');
  const so = (x: string): string => x.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const simples = s.replace(/\s+/gu, '').toLowerCase();
  let fraca = PROIBIDAS.includes(simples) || new Set([...simples]).size < 4;
  loja ??= String((await Config.obj('loja')).nome ?? '');
  for (const x0 of [...evitar, loja, ...loja.split(/\s+/u)]) {
    const x = so(String(x0));
    if (mbLen(x) >= 4 && so(s).includes(x)) fraca = true;
  }
  if (fraca) throw new Erro(ucfirst(rotulo) + ' é fácil de adivinhar. Misture palavras, números e símbolos, sem usar o e-mail ou o nome da loja.', 422, 'senha');
  return s;
}

export async function confirmar(u: Usuario, senha: unknown, para: string): Promise<void> {
  await confirmarSenha(u, senha, para);
}

async function confirmarSenha(eu: Usuario, senha: unknown, para = 'para mudar os acessos'): Promise<void> {
  const chave = 'confirmar-senha:' + eu.id;
  await L.verificar(chave, 5, 900, 'Muitas confirmações de senha erradas. Espere 15 minutos e tente de novo.');
  const hash = String(await Db.valor('SELECT senha_hash FROM usuarios WHERE id = ?', [eu.id]) ?? '');
  if (typeof senha !== 'string' || senha === '') throw new Erro(`Confirme com a sua senha ${para}.`, 422, 'confirmar-senha');
  if (!Totp.conferirSenha(senha, hash)) {
    await L.somar(chave, 900);
    throw new Erro('A senha de confirmação não confere. Nada foi alterado.', 422, 'confirmar-senha');
  }
}

const mesmas = (a: string[], b: string[]): boolean => a.every(x => b.includes(x)) && b.every(x => a.includes(x));
const mesmaOrdem = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Grava a lista inteira vinda do painel, com a senha de quem altera e as regras do proprietário. */
export async function salvarLista(dados: unknown, eu: Usuario, senhaAtual: unknown = null): Promise<any[]> {
  await confirmarSenha(eu, senhaAtual);
  const itens = V.lista(dados, 'os usuários', 50);
  const atuais = Object.fromEntries((await Db.todos("SELECT * FROM usuarios WHERE status <> 'removido'")).map(r => [r.id, linha(r)])) as Record<string, Usuario>;
  const dono = await proprietarioId();
  const souDono = eu.id === dono;
  const ids = new Set<string>();
  const emails = new Set<string>();
  const novos: Array<[any, Usuario | null]> = [];
  const mudou = { criou: [] as string[], removeu: [] as string[], senha: [] as string[], acesso: [] as string[] };
  let minhaSenha: string | null = null;
  for (let i = 0; i < itens.length; i++) {
    const item = V.objeto(itens[i], 'um usuário');
    const id = V.id(item.id ?? null, 'o usuário');
    if (ids.has(id)) throw new Erro('Há dois usuários com o mesmo identificador.', 422);
    ids.add(id);
    const velho = atuais[id] ?? null;
    const email = velho ? velho.email : V.email(item.email ?? '');
    if (emails.has(email)) throw new Erro(`O e-mail ${email} aparece duas vezes.`, 422);
    emails.add(email);
    const perm = PERMISSOES.filter(p => Array.isArray(item.permissoes) && item.permissoes.includes(p));
    if (!perm.length) throw new Erro('Marque pelo menos uma permissão para ' + (item.nome ?? 'o usuário') + '.', 422);
    let status = V.opcao(item.status ?? 'ativo', ['ativo', 'inativo', 'convite'] as const, 'o status') as string;
    if (status === 'convite') status = 'ativo';
    const u: any = { id, nome: V.texto(item.nome ?? '', 'o nome', 2, 80), email, funcao: V.opcao(item.funcao ?? '', FUNCOES, 'a função'), permissoes: perm, status, ordem: i };
    const senha = item.senha ?? '';
    if (!velho) {
      u.hash = Totp.hashSenha(await validarSenha(senha, 'a senha inicial', [email.split('@')[0]]));
      if (Number(await Db.valor("SELECT COUNT(*) FROM usuarios WHERE email = ? AND status <> 'removido'", [email]))) throw new Erro(`O e-mail ${email} já tem acesso.`, 422);
    } else if (typeof senha === 'string' && senha !== '') {
      u.hash = Totp.hashSenha(await validarSenha(senha, 'a nova senha', [email.split('@')[0]]));
    }
    if (velho && V.bool(item.zerar2fa ?? false) && velho.doisFatores) {
      if (!souDono) throw new Erro('Só o proprietário da loja desliga a verificação em duas etapas de outra pessoa.', 403);
      u.zerar2fa = true;
    }
    const alterou = !!velho && (velho.nome !== u.nome || velho.funcao !== u.funcao || velho.status !== u.status || !mesmas(velho.permissoes, u.permissoes) || u.hash !== undefined || u.zerar2fa !== undefined);
    if (!souDono) {
      if (id === dono && alterou) throw new Erro('Só o proprietário da loja pode alterar o próprio acesso.', 403);
      if (id !== eu.id && alterou && velho!.permissoes.includes('usuarios')) throw new Erro('Só o proprietário da loja altera o acesso de outro administrador.', 403);
      if (u.permissoes.includes('usuarios') && !(velho && velho.permissoes.includes('usuarios'))) throw new Erro('Só o proprietário da loja pode dar a permissão Usuários.', 403);
      if (id === eu.id && u.permissoes.some((p: string) => !(velho?.permissoes ?? []).includes(p))) throw new Erro('Você não pode aumentar as próprias permissões.', 403);
    }
    if (id === dono) {
      u.status = 'ativo';
      u.permissoes = [...PERMISSOES];
    } else if (id === eu.id) {
      u.status = 'ativo';
      if (!u.permissoes.includes('usuarios')) u.permissoes.push('usuarios');
    }
    if (!velho) mudou.criou.push(u.nome);
    else if (u.hash !== undefined) mudou.senha.push(u.nome);
    if (velho && (velho.status !== u.status || !mesmas(velho.permissoes, u.permissoes) || velho.funcao !== u.funcao)) mudou.acesso.push(u.nome);
    if (id === eu.id && u.hash !== undefined) minhaSenha = u.hash;
    novos.push([u, velho]);
  }
  if (!ids.has(eu.id)) throw new Erro('Você não pode remover o seu próprio usuário.', 422);
  if (dono !== '' && !ids.has(dono)) throw new Erro('O proprietário da loja não pode ser removido.', 403);
  const saem = Object.keys(atuais).filter(k => !ids.has(k));
  for (const sai of saem) {
    if (!souDono && atuais[sai].permissoes.includes('usuarios')) throw new Erro('Só o proprietário da loja remove outro administrador.', 403);
    mudou.removeu.push(atuais[sai].nome);
  }
  await Db.tx(async () => {
    for (const sai of saem) {
      await Db.q("UPDATE usuarios SET status = 'removido', removido_em = ?, email = LEFT(CONCAT('#', id, '#', email), 120), totp_segredo = NULL, totp_ativo = 0, totp_recuperacao = NULL WHERE id = ?", [T.agoraMs(), sai]);
      await L.registrar(eu.id, 'usuario.remover', 'usuario', sai, { email: atuais[sai].email });
    }
    for (const [u, velho] of novos) {
      const perm = JSON.stringify(u.permissoes);
      if (!velho) {
        while (Number(await Db.valor('SELECT COUNT(*) FROM usuarios WHERE id = ?', [u.id]))) u.id = mbSub(u.id, 0, 50) + '-' + crypto.randomBytes(3).toString('hex');
        await Db.q('INSERT INTO usuarios (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [u.id, u.nome, u.email, u.hash, u.funcao, perm, u.status, u.ordem, T.agoraMs()]);
        await L.registrar(eu.id, 'usuario.criar', 'usuario', u.id);
        continue;
      }
      await Db.q('UPDATE usuarios SET nome = ?, funcao = ?, permissoes = ?, status = ?, ordem = ? WHERE id = ?', [u.nome, u.funcao, perm, u.status, u.ordem, u.id]);
      if (u.hash !== undefined) {
        await Db.q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [u.hash, u.id]);
        await L.registrar(eu.id, 'usuario.senha', 'usuario', u.id);
      }
      if (u.zerar2fa) {
        await Db.q('UPDATE usuarios SET totp_segredo = NULL, totp_ativo = 0, totp_passo = 0, totp_recuperacao = NULL WHERE id = ?', [u.id]);
        await L.registrar(eu.id, 'usuario.2fa-desligar', 'usuario', u.id);
      }
      if (velho.status !== u.status || !mesmaOrdem(velho.permissoes, u.permissoes) || velho.funcao !== u.funcao) {
        await L.registrar(eu.id, 'usuario.editar', 'usuario', u.id, { status: u.status, funcao: u.funcao });
      }
    }
    const partes = [
      mudou.criou.length ? 'criou ' + mudou.criou.join(', ') : '',
      mudou.removeu.length ? 'removeu ' + mudou.removeu.join(', ') : '',
      mudou.senha.length ? 'trocou a senha de ' + mudou.senha.join(', ') : '',
      mudou.acesso.length ? 'mudou o acesso de ' + mudou.acesso.join(', ') : '',
    ].filter(Boolean);
    if (partes.length) {
      await Db.q('INSERT INTO notificacoes (icone, cor, titulo, texto, rota, pedido, lida, em) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)',
        ['shield', '', 'Acessos alterados', mbSub(eu.nome + ' ' + partes.join('; ') + '.', 0, 200), ROTA_ACESSOS, T.agoraMs()]);
    }
  });
  if (minhaSenha !== null) await S.definirVersao(versaoSenha(minhaSenha));
  esquecerAtual();
  return lista();
}

/** "Meu perfil": nome, e-mail, celular e troca de senha (pede a senha atual). */
export async function salvarPerfil(d: Record<string, any>, u: Usuario): Promise<Record<string, unknown>> {
  const nome = V.texto(d.nome ?? '', 'o seu nome', 2, 80, 'pf-nome');
  const email = V.email(d.email ?? '', 'o seu e-mail');
  const tel = V.texto(d.telefone ?? '', 'o celular', 0, 20, 'pf-fone');
  if (Number(await Db.valor("SELECT COUNT(*) FROM usuarios WHERE email = ? AND id <> ? AND status <> 'removido'", [email, u.id]))) throw new Erro('Esse e-mail já é de outro usuário.', 422, 'pf-email');
  const nova = d.senha ?? '';
  let hash: string | null = null;
  if (typeof nova === 'string' && nova !== '') {
    const atualHash = String(await Db.valor('SELECT senha_hash FROM usuarios WHERE id = ?', [u.id]) ?? '');
    if (!Totp.conferirSenha(typeof d.senhaAtual === 'string' ? d.senhaAtual : '', atualHash)) throw new Erro('A senha atual não confere.', 422, 'pf-atual');
    hash = Totp.hashSenha(await validarSenha(nova, 'a nova senha', [email.split('@')[0], nome]));
  }
  await Db.q('UPDATE usuarios SET nome = ?, email = ?, telefone = ? WHERE id = ?', [nome, email, tel, u.id]);
  if (hash) {
    await Db.q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, u.id]);
    await S.entrarAdmin(u.id, versaoSenha(hash));
  }
  await L.registrar(u.id, hash ? 'perfil.senha' : 'perfil.editar', 'usuario', u.id);
  esquecerAtual();
  return paraPainel((await atual()) ?? u);
}
