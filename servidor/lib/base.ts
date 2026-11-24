/*
  Base do servidor (porte para Node/Vercel do sistema delivery-master).
  O que no PHP eram variáveis globais da requisição ($_SERVER, $_SESSION, a transação aberta, os caches estáticos)
  aqui fica num contexto por requisição (AsyncLocalStorage): duas requisições ao mesmo tempo nunca se misturam.
*/
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

/** Erro que pode ser mostrado ao usuário (mensagem clara, sem detalhes internos). */
export class Erro extends Error {
  constructor(mensagem: string, public status = 422, public campo: string | null = null, public extra: Record<string, unknown> = {}) {
    super(mensagem);
  }
}

/** O banco de dados não respondeu (servidor fora do ar, senha trocada, limite do plano). */
export class BancoForaDoAr extends Error {}

/** Resposta pronta: no PHP era o "exit" depois de mandar a página ou o JSON. Sobe até o roteador, que envia. */
export class Fim {
  constructor(public corpo: string | Buffer = '') {}
}

export interface Sessao {
  id: string;
  dados: Record<string, any>;
  enviarCookie: boolean;
  mudou: boolean;
  apagar: string[];
  carregadaEm: number;
}

export interface Ctx {
  metodo: string;
  caminho: string;
  query: URLSearchParams;
  cab: Record<string, string>;
  corpo: Buffer;
  ip: string;
  https: boolean;
  status: number;
  saida: Map<string, string>;
  cookies: string[];
  nonce: string | null;
  sessao: Sessao | null;
  tx: PoolClient | null;
  cache: Record<string, any>;
  depois: Array<() => Promise<void>>;
}

export const als = new AsyncLocalStorage<Ctx>();

export function ctx(): Ctx {
  const c = als.getStore();
  if (!c) throw new Error('fora de uma requisição');
  return c;
}

/** Contexto avulso (instalação por script, testes): sem requisição HTTP. */
export function novoCtx(x: Partial<Ctx> = {}): Ctx {
  return {
    metodo: 'GET', caminho: '/', query: new URLSearchParams(), cab: {}, corpo: Buffer.alloc(0), ip: '0.0.0.0', https: false,
    status: 200, saida: new Map(), cookies: [], nonce: null, sessao: null, tx: null, cache: {}, depois: [], ...x,
  };
}

/* ------------------------------------------------------------------ configuração (variáveis de ambiente) */

/**
  No PHP, app/config.php era escrito pelo instalador. Na Vercel não há disco gravável: a configuração vem das
  variáveis de ambiente do projeto (DATABASE_URL, CHAVE_SISTEMA, CODIGO_INSTALACAO...). Nunca vão para o Git.
*/
export const env = {
  get banco(): string { return process.env.DATABASE_URL || ''; },
  get chave(): string { return process.env.CHAVE_SISTEMA || 'brasa'; },
  get temChave(): boolean { return (process.env.CHAVE_SISTEMA || '').length >= 32; },
  get dev(): boolean { return process.env.AMBIENTE === 'desenvolvimento'; },
  get codigoInstalacao(): string { return process.env.CODIGO_INSTALACAO || ''; },
  get vercel(): boolean { return !!process.env.VERCEL; },
};

/* ------------------------------------------------------------------ utilidades do PHP usadas em todo lugar */

/** mb_strlen: conta letras (pontos de código), não bytes. */
export const mbLen = (s: string): number => [...s].length;
export const mbSub = (s: string, ini: number, n?: number): string => [...s].slice(ini, n === undefined ? undefined : ini + n).join('');
/** trim do PHP: só espaço, tab, quebras, \0 e \x0B. */
export const trim = (s: string): string => s.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
export const ucfirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const ehObjeto = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null;
/** is_array do PHP: lista ou objeto vindo do JSON. */
export const ehArray = (v: unknown): v is any => typeof v === 'object' && v !== null;
export const escHtml = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
/** json_encode do PHP com JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES. */
export const json = (v: unknown): string => JSON.stringify(v);
/** json_decode(…, true) que devolve null quando o texto não é JSON. */
export const jsonOu = (s: unknown, padrao: any = null): any => {
  if (typeof s !== 'string' || s === '') return padrao;
  try { const v = JSON.parse(s); return v ?? padrao; } catch { return padrao; }
};
export const vazio = (v: unknown): boolean =>
  v === undefined || v === null || v === false || v === 0 || v === '' || v === '0' || (Array.isArray(v) && v.length === 0);
