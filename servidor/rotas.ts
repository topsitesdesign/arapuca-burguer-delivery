/* Endereços do sistema: páginas do site, API do site, painel e API do painel (porte de rotas.php). */
import fs from 'node:fs';
import path from 'node:path';
import { ctx, env, Erro, escHtml, Fim, mbSub } from './lib/base.js';
import { raiz } from './lib/estaticos.js';
import * as Http from './lib/http.js';
import * as Imagem from './lib/imagem.js';
import * as S from './lib/sessao.js';
import * as L from './lib/seguranca.js';
import * as T from './lib/tempo.js';
import * as V from './lib/v.js';
import * as Cardapio from './servicos/cardapio.js';
import * as Cotacao from './servicos/cotacao.js';
import * as Cupons from './servicos/cupons.js';
import * as Horarios from './servicos/horarios.js';
import * as Painel from './servicos/painel.js';
import * as Pedidos from './servicos/pedidos.js';
import * as Sistema from './servicos/sistema.js';
import * as Usuarios from './servicos/usuarios.js';

const paginas = new Map<string, string>();
function lerPagina(arquivo: string): string {
  if (!paginas.has(arquivo)) paginas.set(arquivo, fs.readFileSync(path.join(raiz(), 'site', 'app', 'paginas', arquivo), 'utf8'));
  return paginas.get(arquivo)!;
}

/** Endereço público do site (https://dominio), tirado do pedido; só aceita um nome de host válido. */
function base(): string {
  const x = ctx();
  const host = (x.cab['x-forwarded-host'] || x.cab.host || '').split(',')[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return '';
  return (x.https ? 'https://' : 'http://') + host;
}

async function pagina(arquivo: string, daLoja = true): Promise<never> {
  let html = lerPagina(arquivo);
  if (daLoja) html = await Cardapio.preencherPagina(html);
  // prévia no WhatsApp/Facebook pede endereço completo da imagem; o canonical diz ao Google qual é o endereço oficial
  const b = base();
  if (b !== '') {
    html = html.replace(/(<meta property="og:image" content=")(?!https?:)\/?([^"]+)"/, `$1${b}/$2"`);
    const canon = arquivo === 'index.html' ? '/' : '/' + arquivo.replace(/\.html$/, '');
    if (!html.includes('rel="canonical"')) html = html.replace('</head>', `<link rel="canonical" href="${escHtml(b + canon)}">\n<meta property="og:url" content="${escHtml(b + canon)}">\n</head>`);
  }
  return Http.pagina(html);
}

async function post(): Promise<Record<string, any>> {
  if (Http.metodo() !== 'POST') Http.erro('Use POST neste endereço.', 405);
  await S.verificarCsrf();
  return Http.corpo();
}

/** Tela de entrada do painel (e-mail e senha, ou o código do aplicativo). */
async function login(erro: string | null = null, email = '', codigo = false): Promise<never> {
  const e = escHtml;
  const nome = await Cardapio.nomeLoja();
  const csrf = await S.tokenCsrf();
  const topo = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>Entrar · Painel ' + e(nome) + '</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#0d0b0a">'
    + '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/admin/admin.css"></head><body>'
    + '<div class="login-screen">';
  const logo = await Cardapio.logo();
  const marca = '<div class="login-card__brand">' + (logo !== '' ? '<img src="' + e(logo) + '" alt="' + e(nome) + '" style="height:84px;width:auto;max-width:100%;margin:0 auto 4px;object-fit:contain">' : '<span class="side__name">' + e(nome) + '</span>') + '<span class="side__tag">PAINEL DE GESTÃO</span></div>';
  const msgErro = erro ? '<p class="fld__err" role="alert" style="margin:0">' + e(erro) + '</p>' : '';
  let form: string;
  if (codigo) {
    form = '<form class="card login-card" method="post" action="/admin/entrar-codigo" novalidate>'
      + '<input type="hidden" name="_csrf" value="' + e(csrf) + '">' + marca
      + '<div><h1 class="dlg__title">Código de verificação</h1><p class="dlg__sub">Abra o aplicativo autenticador no seu celular e digite os 6 números que aparecem para este painel.</p></div>'
      + msgErro
      + '<div class="fld"><label class="fld__label" for="lg-codigo">Código</label><input class="inp" id="lg-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required autofocus placeholder="000000"></div>'
      + '<button class="btn btn--primary btn--lg btn--block" type="submit">Entrar</button>'
      + '<p class="page-note"><span>Sem o celular? Digite um dos códigos de recuperação que você guardou ao ativar (formato XXXX-XXXX).</span></p>'
      + '</form><form method="post" action="/admin/cancelar-login" style="text-align:center;margin-top:12px"><input type="hidden" name="_csrf" value="' + e(csrf) + '"><button class="link" type="submit">Entrar com outro e-mail</button></form>';
  } else {
    form = '<form class="card login-card" method="post" action="/admin/entrar" novalidate>'
      + '<input type="hidden" name="_csrf" value="' + e(csrf) + '">' + marca
      + '<div><h1 class="dlg__title">Entrar no painel</h1><p class="dlg__sub">Use o e-mail e a senha da sua conta administrativa.</p></div>'
      + msgErro
      + '<div class="fld"><label class="fld__label" for="lg-email">E-mail</label><input class="inp" id="lg-email" name="email" type="email" value="' + e(email) + '" required autocomplete="username"' + (email === '' ? ' autofocus' : '') + '></div>'
      + '<div class="fld"><label class="fld__label" for="lg-senha">Senha</label><input class="inp" id="lg-senha" name="senha" type="password" required autocomplete="current-password"' + (email !== '' ? ' autofocus' : '') + '></div>'
      + '<button class="btn btn--primary btn--lg btn--block" type="submit">Entrar</button>'
      + '<p class="page-note"><span>Esqueceu a senha? Peça para o administrador da loja criar uma nova em Configurações › Usuários.</span></p>'
      + '</form>';
  }
  return Http.pagina(topo + form + '</div></body></html>', erro ? 422 : 200);
}

async function vencido(p: any | null): Promise<void> {
  if (p && Pedidos.linkVencido(p)) Http.erro('Este pedido terminou há mais de ' + Pedidos.DIAS_LINK + ' dias e não aparece mais aqui. Se precisar, fale com a loja no WhatsApp.', 410);
}

const telOuNulo = (v: unknown): string | null => {
  try { return v !== undefined && v !== null && v !== '' ? V.telefone(v) : null; } catch (e) { if (e instanceof Erro) return null; throw e; }
};

/** Fotos enviadas pelo painel (Supabase Storage ou pasta local), servidas pelo próprio site: a política de segurança só libera 'self'. */
async function upload(c: string): Promise<never> {
  const nome = c.slice('/uploads/'.length);
  const dados = await Imagem.lerArquivo(nome);
  if (!dados) return Http.naoEncontrado();
  const x = ctx();
  x.status = 200;
  Http.header('Content-Type', nome.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');
  Http.header('Cache-Control', 'public, max-age=2592000, immutable');
  Http.header('X-Content-Type-Options', 'nosniff');
  throw new Fim(dados);
}

export async function rotas(): Promise<never> {
  const c = Http.caminho();
  const m = Http.metodo();

  /* ------------------------------------------------------------------ ainda não instalado */
  if (!(await Sistema.instalado())) {
    if (c === '/instalar') {
      if (env.banco) await Sistema.criarTabelas();
      return m === 'POST' ? Sistema.instalar(Http.post()) : Sistema.pagina();
    }
    if (Http.ehApi() || c === '/js/data.js') Http.erro('O sistema ainda não foi instalado.', 503);
    Http.redirecionar('/instalar');
  }
  if (c === '/instalar') return Http.naoEncontrado();

  await Sistema.garantir();
  Sistema.talvez();

  if (c.startsWith('/uploads/')) return upload(c);

  /* ------------------------------------------------------------------ site */
  if (['/', '/index.html', '/index.php'].includes(c)) return pagina('index.html');
  if (['/pedido', '/pedido.html'].includes(c)) return pagina('pedido.html');
  if (['/creditos', '/creditos.html'].includes(c)) return pagina('creditos.html');
  if (['/privacidade', '/privacidade.html'].includes(c)) return pagina('privacidade.html');
  if (c === '/sitemap.xml') {
    const b = base();
    const urls = ['/', '/pedido', '/privacidade', '/creditos'].map(u => `  <url><loc>${escHtml(b + u)}</loc></url>`).join('\n');
    Http.header('Content-Type', 'application/xml; charset=utf-8');
    Http.header('Cache-Control', 'public, max-age=3600');
    throw new Fim(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  }

  if (c === '/js/data.js') {
    Http.header('Content-Type', 'text/javascript; charset=utf-8');
    Http.header('Cache-Control', 'no-store');
    Http.cabecalhos();
    throw new Fim(await Cardapio.moduloJs());
  }

  if (c === '/api/loja') Http.json({ ok: true, agora: T.agoraMs(), situacao: await Horarios.situacao() });
  if (c === '/api/desafio') Http.json({ ok: true, desafio: L.desafio() });

  if (c === '/api/cupom') {
    const d = await post();
    await L.contar('cupom:' + L.ip(), 40, 600, 'Muitas tentativas de cupom. Espere alguns minutos e tente de novo.');
    const codigo = Cupons.normalizarCodigo(d.codigo ?? '');
    if (codigo === '') Http.erro('Digite o código do cupom.', 422, { campo: 'cupom' });
    const tel = telOuNulo(d.telefone);
    const cupom = await Cupons.porCodigo(codigo);
    if (!cupom) Http.erro('Cupom não encontrado. Confira as letras e os números.', 422, { campo: 'cupom' });
    const itens = d.itens ?? [];
    if (Array.isArray(itens) ? itens.length : typeof itens === 'object' && itens !== null && Object.keys(itens).length) {
      const cot = await Cotacao.calcular({ itens, modo: d.modo ?? 'entrega', area: d.area ?? null, cupom: codigo }, tel);
      if (cot.avisoCupom) Http.erro(cot.avisoCupom, 422, { campo: 'cupom' });
      Http.json({ ok: true, cupom: Cupons.publico(cupom!), cotacao: Cotacao.publica(cot) });
    }
    await Cupons.conferir(cupom!, Number.MAX_SAFE_INTEGER, 'entrega', tel);
    Http.json({ ok: true, cupom: Cupons.publico(cupom!) });
  }

  if (c === '/api/cotacao') {
    const d = await post();
    await L.contar('cotacao:' + L.ip(), 240, 600);
    const tel = telOuNulo(d.telefone);
    Http.json({ ok: true, cotacao: Cotacao.publica(await Cotacao.calcular(d, tel)), situacao: await Horarios.situacao() });
  }

  if (c === '/api/pedidos') {
    const d = await post();
    Http.json({ ok: true, pedido: await Pedidos.criarDoSite(d) }, 201);
  }

  if (c === '/api/pedido') {
    await L.contar('acompanhar:' + L.ip(), 120, 600, 'Muitas consultas seguidas. Espere alguns minutos.');
    if (m === 'POST') {
      const d = await post();
      await L.contar('acompanhar-num:' + L.ip(), 20, 600, 'Muitas consultas seguidas. Espere alguns minutos.');
      const numero = V.inteiro(d.n ?? null, 'o número do pedido', 1, 99_999_999, 'numero');
      const tel = V.telefone(d.t ?? '', 'o WhatsApp do pedido', 'whats');
      const p = await Pedidos.porNumeroETelefone(numero, tel);
      if (!p) Http.erro('Não achamos esse pedido. Confira o número e o WhatsApp usados no pedido.', 404);
      await vencido(p);
      Http.json({ ok: true, pedido: Pedidos.publico(p, true) });
    }
    const codigo = ctx().query.get('c');
    if (!codigo) Http.erro('Atualize a página e busque pelo número e pelo WhatsApp do pedido.', 400);
    const p = await Pedidos.porCodigo(codigo!);
    if (!p) Http.erro('Não achamos esse pedido. Confira o número e o WhatsApp usados no pedido.', 404);
    await vencido(p);
    Http.json({ ok: true, pedido: Pedidos.publico(p) });
  }
  if (c === '/api/pedido/endereco') {
    const d = await post();
    await L.contar('acompanhar-end:' + L.ip(), 10, 600, 'Muitas tentativas seguidas. Espere alguns minutos.');
    const p = typeof d.c === 'string' ? await Pedidos.porCodigo(d.c) : null;
    const tel = V.telefone(d.t ?? '', 'o WhatsApp do pedido', 'whats');
    if (!p || p.telefone !== tel) Http.erro('Esse WhatsApp não é o do pedido. Confira o número com DDD.', 422, { campo: 'whats' });
    await vencido(p);
    Http.json({ ok: true, pedido: Pedidos.publico(p, true) });
  }

  /* ------------------------------------------------------------------ painel */
  if (c === '/admin') Http.redirecionar('/admin/');

  if (['/admin/', '/admin/index.html', '/admin/index.php'].includes(c)) {
    if (!(await Usuarios.atual())) {
      if (await S.pre2fa()) return login(null, '', true);
      return login();
    }
    return pagina('admin.html');
  }

  if (c === '/admin/entrar') {
    if (m !== 'POST') Http.redirecionar('/admin/');
    const f = Http.post();
    const email = typeof f.email === 'string' ? f.email.trim() : '';
    try {
      await S.verificarCsrf(f);
      await Usuarios.entrar(email, f.senha ?? '');
    } catch (e) {
      if (e instanceof Erro) return login(e.message, mbSub(email, 0, 120));
      throw e;
    }
    Http.redirecionar('/admin/');
  }

  if (c === '/admin/entrar-codigo') {
    if (m !== 'POST') Http.redirecionar('/admin/');
    const f = Http.post();
    try {
      await S.verificarCsrf(f);
      await Usuarios.entrarComCodigo(f.codigo ?? '');
    } catch (e) {
      if (e instanceof Erro) return login(e.message, '', e.campo !== 'expirou');
      throw e;
    }
    Http.redirecionar('/admin/');
  }

  if (c === '/admin/cancelar-login') {
    if (m === 'POST') { const f = Http.post(); await S.verificarCsrf(f); await S.limparPre2fa(); }
    Http.redirecionar('/admin/');
  }

  if (c === '/admin/sair') {
    if (m !== 'POST') Http.redirecionar('/admin/');
    await S.verificarCsrf(Http.post());
    await Usuarios.sair();
    if ((ctx().cab['accept'] || '').includes('application/json')) Http.json({ ok: true });
    Http.redirecionar('/admin/');
  }

  if (c.startsWith('/admin/api/')) {
    const u = await Usuarios.exigir();
    const r = c.slice('/admin/api/'.length);
    if ((await Usuarios.precisa2fa(u)) && !['estado', 'perfil', '2fa/iniciar', '2fa/ativar', 'novidades'].includes(r)) {
      Http.erro('A loja exige a verificação em duas etapas para administradores. Ative no seu perfil para continuar.', 403, { exige2fa: true });
    }
    const q = ctx().query;
    if (r === 'estado') Http.json({ ok: true, estado: await Painel.estado(u), csrf: await S.tokenCsrf() });
    if (r === 'novidades') Http.json({ ok: true, ...(await Painel.novidades(Math.trunc(Number(q.get('desde') ?? 0)) || 0, Math.trunc(Number(q.get('rev') ?? 0)) || 0, u)) });
    let x = /^colecao\/([a-z]+)$/.exec(r);
    if (x) {
      const d = await post();
      Http.json({ ok: true, dados: await Painel.salvarColecao(x[1], d.dados ?? null, u, d) });
    }
    if (r === 'excluidos') Http.json({ ok: true, itens: await Painel.excluidos(String(q.get('colecao') ?? ''), u) });
    if (r === 'restaurar') {
      const d = await post();
      const nome = String(d.colecao ?? '');
      Http.json({ ok: true, colecao: nome, dados: await Painel.restaurar(nome, d.id ?? null, u) });
    }

    /* pedidos */
    if (r === 'pedidos') {
      await Usuarios.exigir('pedidos');
      const d = await post();
      Http.json({ ok: true, pedido: await Pedidos.criarNoBalcao(d, u) }, 201);
    }
    if ((x = /^pedidos\/(\d{1,9})$/.exec(r))) {
      await Usuarios.exigir('pedidos');
      const p = await Pedidos.buscar(Number(x[1]));
      if (!p) Http.erro(`Pedido #${x[1]} não encontrado.`, 404);
      Http.json({ ok: true, pedido: await Pedidos.paraAdmin(p) });
    }
    if ((x = /^pedidos\/(\d{1,9})\/status$/.exec(r))) {
      await Usuarios.exigir('pedidos');
      const d = await post();
      Http.json({ ok: true, pedido: await Pedidos.mudarStatus(Number(x[1]), d.para ?? null, d.motivo ?? '', u) });
    }
    if ((x = /^pedidos\/(\d{1,9})\/pagamento$/.exec(r))) {
      await Usuarios.exigir('pedidos');
      const d = await post();
      Http.json({ ok: true, pedido: await Pedidos.registrarPagamento(Number(x[1]), d, u), entregadores: await Pedidos.entregadores() });
    }
    if (r === 'historico') {
      await Usuarios.exigir('pedidos');
      const d = await post();
      const h = await Pedidos.historico(d);
      if (h.tipo === 'telefone' || h.tipo === 'nome') await L.registrar(u.id, 'historico.buscar', 'pedido', '', { por: h.tipo, resultados: h.total });
      Http.json({ ok: true, ...h });
    }
    if (r === 'caixa') {
      await Usuarios.exigir('pedidos');
      Http.json({ ok: true, caixa: await Pedidos.caixa(q.get('dia')) });
    }
    if (r === 'bloqueados') {
      await Usuarios.exigir('pedidos');
      const d = await post();
      Http.json({ ok: true, bloqueados: await Pedidos.bloquear(d.telefone ?? '', d.motivo ?? '', u) });
    }
    if (r === 'bloqueados/remover') {
      await Usuarios.exigir('pedidos');
      const d = await post();
      Http.json({ ok: true, bloqueados: await Pedidos.desbloquear(d.telefone ?? '', u) });
    }

    /* titular dos dados (LGPD-03) */
    if (r === 'clientes/buscar') {
      await Usuarios.exigir('configuracoes');
      const d = await post();
      const cl = await Pedidos.cliente(d.telefone ?? '');
      await L.registrar(u.id, 'lgpd.consultar', 'cliente', '', { pedidos: cl.pedidos });
      Http.json({ ok: true, cliente: cl });
    }
    if (r === 'clientes/exportar') {
      await Usuarios.exigir('configuracoes');
      const d = await post();
      const dados = await Pedidos.exportar(d.telefone ?? '');
      await L.registrar(u.id, 'lgpd.exportar', 'cliente', '', { pedidos: dados.pedidos.length });
      Http.json({ ok: true, dados });
    }
    if (r === 'clientes/anonimizar') {
      await Usuarios.exigir('configuracoes');
      const d = await post();
      await Usuarios.confirmar(u, d.senhaAtual ?? null, 'para anonimizar os dados do cliente');
      Http.json({ ok: true, ...(await Pedidos.anonimizarCliente(d.telefone ?? '', u)) });
    }

    /* perfil e duas etapas */
    if (r === 'perfil') {
      const d = await post();
      const admin = await Usuarios.salvarPerfil(d, u);
      Http.json({ ok: true, admin, csrf: await S.tokenCsrf() });
    }
    if (r === '2fa/iniciar') {
      await post();
      Http.json({ ok: true, ...(await Usuarios.iniciar2fa(u)) });
    }
    if (r === '2fa/ativar') {
      const d = await post();
      const codigos = await Usuarios.ativar2fa(u, d.codigo ?? '', d.senhaAtual ?? null);
      Http.json({ ok: true, recuperacao: codigos, admin: await Usuarios.paraPainel((await Usuarios.atual()) ?? u) });
    }
    if (r === '2fa/desativar') {
      const d = await post();
      await Usuarios.desativar2fa(u, d.senhaAtual ?? null);
      Http.json({ ok: true, admin: await Usuarios.paraPainel((await Usuarios.atual()) ?? u) });
    }
    return Http.naoEncontrado();
  }

  return Http.naoEncontrado();
}
