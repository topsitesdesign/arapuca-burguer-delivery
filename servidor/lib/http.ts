/** Entrada e saída HTTP: caminho, JSON, páginas, cabeçalhos de segurança e erros (porte de lib/Http.php). */
import crypto from 'node:crypto';
import { BancoForaDoAr, ctx, env, Erro, escHtml, Fim } from './base.js';
import { tokenCsrf } from './sessao.js';
import * as Cardapio from '../servicos/cardapio.js';

export const caminho = (): string => ctx().caminho;
export const metodo = (): string => ctx().metodo;

export function ehApi(): boolean {
  const c = caminho();
  return c.startsWith('/api/') || c.startsWith('/admin/api/');
}

export const https = (): boolean => ctx().https;

export function nonce(): string {
  const c = ctx();
  return (c.nonce ??= crypto.randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

export const header = (nome: string, valor: string): void => { ctx().saida.set(nome, valor); };

export function cabecalhos(pagina = false): void {
  header('X-Content-Type-Options', 'nosniff');
  header('Referrer-Policy', 'strict-origin-when-cross-origin');
  header('X-Frame-Options', 'DENY');
  header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (https()) header('Strict-Transport-Security', 'max-age=15552000');
  if (pagina) {
    const n = nonce();
    header('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${n}'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`);
  }
}

export function json(dados: unknown, status = 200): never {
  const c = ctx();
  c.status = status;
  header('Content-Type', 'application/json; charset=utf-8');
  header('Cache-Control', 'no-store');
  cabecalhos();
  throw new Fim(JSON.stringify(dados));
}

export function erro(mensagem: string, status = 422, extra: Record<string, unknown> = {}): never {
  json({ ok: false, erro: mensagem, ...extra }, status);
}

/** Corpo JSON da requisição (até 8 MB, por causa das imagens enviadas pelo painel). */
export function corpo(): Record<string, any> {
  const b = ctx().corpo;
  if (!b.length) return {};
  let dados: unknown;
  try {
    dados = JSON.parse(b.subarray(0, 8_000_000).toString('utf8'));
  } catch {
    throw new Erro('Não conseguimos ler os dados enviados. Atualize a página e tente de novo.', 400);
  }
  return typeof dados === 'object' && dados !== null ? (dados as Record<string, any>) : {};
}

/** $_POST: corpo de formulário (application/x-www-form-urlencoded). */
export function post(): Record<string, string> {
  const c = ctx();
  if (!(c.cab['content-type'] || '').includes('application/x-www-form-urlencoded')) return {};
  return Object.fromEntries(new URLSearchParams(c.corpo.toString('utf8')));
}

/** Envia uma página HTML: põe o token CSRF e o nonce dos scripts internos. */
export async function pagina(html: string, status = 200): Promise<never> {
  const n = nonce();
  html = html.replace(/<script(?![^>]*\bsrc=)([^>]*)>/gi, `<script nonce="${n}"$1>`);
  html = html.replace('</head>', `<meta name="csrf" content="${await tokenCsrf()}">\n</head>`);
  const c = ctx();
  c.status = status;
  header('Content-Type', 'text/html; charset=utf-8');
  header('Cache-Control', 'no-cache, private');
  cabecalhos(true);
  throw new Fim(html);
}

export function redirecionar(para: string): never {
  const c = ctx();
  c.status = 303;
  header('Location', para);
  throw new Fim('');
}

export async function naoEncontrado(): Promise<never> {
  if (ehApi()) erro('Endereço não encontrado.', 404);
  return pagina(paginaSimples('Página não encontrada', 'O endereço que você abriu não existe ou mudou de lugar.', '/', 'Voltar ao cardápio'), 404);
}

export function paginaSimples(titulo: string, texto: string, link: string, rotulo: string): string {
  const e = escHtml;
  const n = nomeGuardado();
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(titulo) + (n !== '' ? ' · ' + e(n) : '') + '</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a08;color:#f6eee5;font:16px/1.5 system-ui,sans-serif;padding:24px}main{max-width:440px;text-align:center}h1{font-size:28px;margin:0 0 10px}p{color:#a5978b;margin:0 0 24px}a{display:inline-block;background:#f7741d;color:#170c04;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none}</style></head><body><main><h1>' + e(titulo) + '</h1><p>' + e(texto) + '</p><a href="' + e(link) + '">' + e(rotulo) + '</a></main></body></html>';
}

/** Registro de erros: na Vercel, o console vai para os logs do projeto (no lugar de storage/logs). */
export function log(linha: string): void {
  console.error(`[${new Date().toISOString()}] ${linha}`);
}

export const nomeGuardado = (): string => Cardapio.contatoGuardado().nome;

/** Banco fora do ar: em vez de "algo deu errado", um aviso com o WhatsApp da loja (PED-06). */
export function foraDoAr(): never {
  const c = Cardapio.contatoGuardado();
  const msg = 'Estamos com instabilidade no sistema agora.' + (c.exibicao !== '' ? ' Faça seu pedido pelo WhatsApp: ' + c.exibicao + '.' : ' Tente de novo em alguns minutos.');
  if (ehApi()) erro(msg, 503, { foraDoAr: true, whatsapp: c.whatsapp });
  const x = ctx();
  if (caminho() === '/js/data.js') {
    x.status = 200;
    header('Content-Type', 'text/javascript; charset=utf-8');
    header('Cache-Control', 'no-store');
    const j = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003C').replace(/>/g, '\\u003E').replace(/&/g, '\\u0026');
    throw new Fim('export const FORA_DO_AR = true;\nexport const AGORA = ' + Date.now() + ';\n'
      + 'export const LOJA = ' + j({ nome: c.nome, logo: c.logo, whatsapp: c.whatsapp, whatsappExibicao: c.exibicao, fuso: 'America/Sao_Paulo',
        horarios: [], excecoes: {}, pausaManual: true, fechadaPainel: true, pausaAte: null, prazoEntrega: '', prazoRetirada: '',
        pedidoMinimo: 0, entrega: false, retirada: false, orientacoes: '', troco: false, antecedencia: 45, endereco: '', rua: '', bairro: '', cidade: '', botao: 'Ver cardápio' }) + ';\n'
      + 'export const AREAS = [];\nexport const CUPONS = [];\nexport const PAGAMENTOS = [];\nexport const STATUS = [];\nexport const STATUS_FINAIS = {};\nexport const CATEGORIAS = [];\nexport const GRUPOS = {};\nexport const PRODUTOS = [];\nexport const BANNERS = [];\n'
      + "export const img = () => 'assets/img/sem-foto.svg';\nexport const produto = () => undefined;\n");
  }
  const e = escHtml;
  const botao = c.whatsapp !== '' ? '<a href="https://wa.me/' + e(c.whatsapp) + '?text=' + encodeURIComponent('Olá! Quero fazer um pedido.') + '">Pedir pelo WhatsApp</a>' : '<a href="/">Tentar de novo</a>';
  x.status = 503;
  header('Retry-After', '120');
  header('Content-Type', 'text/html; charset=utf-8');
  header('Cache-Control', 'no-store');
  throw new Fim('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(c.nome !== '' ? c.nome : 'Pedidos') + '</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg">'
    + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a08;color:#f6eee5;font:16px/1.5 system-ui,sans-serif;padding:24px}main{max-width:440px;text-align:center}img{max-height:84px;max-width:80%;margin:0 auto 16px;display:block}h1{font-size:26px;margin:0 0 10px}p{color:#cbbcae;margin:0 0 24px}a{display:inline-block;background:#f7741d;color:#170c04;padding:14px 22px;border-radius:8px;font-weight:700;text-decoration:none}</style></head><body><main>'
    + (c.logo !== '' ? '<img src="' + e(c.logo) + '" alt="' + e(c.nome) + '">' : '') + '<h1>' + e(c.nome !== '' ? c.nome : 'Estamos com instabilidade') + '</h1><p>' + e(msg) + '</p>' + botao + '</main></body></html>');
}

/** Qualquer erro não tratado: o usuário vê uma mensagem simples; os detalhes vão para o registro. */
export async function falha(e: unknown): Promise<never> {
  if (e instanceof BancoForaDoAr) {
    log('banco fora do ar: ' + e.message);
    foraDoAr();
  }
  if (e instanceof Erro) {
    if (ehApi()) erro(e.message, e.status, { ...(e.campo ? { campo: e.campo } : {}), ...e.extra });
    return pagina(paginaSimples('Não deu certo', e.message, '/', 'Voltar ao início'), e.status);
  }
  const x = e as Error;
  log(`${x?.name || 'Erro'}: ${x?.message} ${x?.stack?.split('\n')[1]?.trim() || ''}`);
  let msg = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
  if (env.dev) msg += ` [${x?.message}]`;
  if (ehApi()) erro(msg, 500);
  return pagina(paginaSimples('Algo deu errado', msg, '/', 'Voltar ao início'), 500);
}
