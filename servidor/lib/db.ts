/*
  Banco de dados: PostgreSQL (Supabase) com consultas preparadas (nunca texto do usuário colado no SQL).
  As consultas usam "?" como no PHP; aqui viram $1, $2… Transações seguram uma conexão própria até o fim,
  e FOR UPDATE continua travando as linhas como no MySQL.
  Supabase: use a conexão direta ou o pooler em modo sessão (o modo transação quebra as travas de sessão).
*/
import pg from 'pg';
import { BancoForaDoAr, ctx, env, Erro } from './base.js';

// BIGINT (milissegundos) e NUMERIC chegam como texto no driver: viram número, como o (int) do PHP
pg.types.setTypeParser(20, (v: string) => Number(v));
pg.types.setTypeParser(1700, (v: string) => Number(v));

let pool: pg.Pool | null = null;

function opcoes(url: string): pg.PoolConfig {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const modo = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  const ssl = modo === 'disable' || (local && modo !== 'require') ? false : { rejectUnauthorized: false };
  return {
    connectionString: u.toString(), ssl,
    max: Number(process.env.DB_CONEXOES || (env.vercel ? 2 : 10)),
    connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000,
    application_name: 'delivery',
  };
}

export function conectar(url = env.banco): pg.Pool {
  if (!url) throw new Erro('O sistema ainda não foi instalado.', 503);
  if (!pool) {
    pool = new pg.Pool(opcoes(url));
    pool.on('error', () => { /* conexão ociosa caiu: a próxima consulta abre outra */ });
  }
  return pool;
}

export async function fechar(): Promise<void> {
  if (pool) { const p = pool; pool = null; await p.end(); }
}

const FORA = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', '57P01', '57P02', '57P03', '28P01', '28000', '3D000', '08001', '08004', '08006', '53300']);
function ehForaDoAr(e: any): boolean {
  return FORA.has(e?.code) || /timeout exceeded when trying to connect|Connection terminated|connect ECONN/i.test(String(e?.message || ''));
}

/** "?" → $1, $2… (fora de textos entre aspas). */
export function marcar(sql: string): string {
  let i = 0, q: string | null = null, out = '';
  for (const ch of sql) {
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; out += ch; continue; }
    out += ch === '?' ? '$' + (++i) : ch;
  }
  return out;
}

export interface Resultado { rows: any[]; rowCount: number }

export async function q(sql: string, p: unknown[] = []): Promise<Resultado> {
  const c = ctx();
  const alvo: pg.Pool | pg.PoolClient = c.tx ?? conectar();
  try {
    const r = await alvo.query(marcar(sql), p as any[]);
    return { rows: r.rows, rowCount: r.rowCount ?? 0 };
  } catch (e: any) {
    if (ehForaDoAr(e)) throw new BancoForaDoAr(String(e.message));
    throw e;
  }
}

export async function um(sql: string, p: unknown[] = []): Promise<any | null> {
  return (await q(sql, p)).rows[0] ?? null;
}

export async function todos(sql: string, p: unknown[] = []): Promise<any[]> {
  return (await q(sql, p)).rows;
}

export async function valor(sql: string, p: unknown[] = []): Promise<any> {
  const r = (await q(sql, p)).rows[0];
  if (!r) return null;
  const v = Object.values(r)[0];
  return v === undefined ? null : v;
}

/** Executa tudo ou nada (transação aninhada usa a de fora, como no PHP). */
export async function tx<T>(f: () => Promise<T>): Promise<T> {
  const c = ctx();
  if (c.tx) return f();
  let cliente: pg.PoolClient;
  try {
    cliente = await conectar().connect();
  } catch (e: any) {
    throw ehForaDoAr(e) ? new BancoForaDoAr(String(e.message)) : e;
  }
  c.tx = cliente;
  try {
    await cliente.query('BEGIN');
    const r = await f();
    await cliente.query('COMMIT');
    return r;
  } catch (e) {
    try { await cliente.query('ROLLBACK'); } catch { /* conexão perdida */ }
    throw e;
  } finally {
    c.tx = null;
    cliente.release();
  }
}

/** "?, ?, ?" para listas em IN (...). */
export function marcas(lista: unknown[]): string {
  return Array(Math.max(1, lista.length)).fill('?').join(', ');
}

/** Chave duplicada (o 23000 do MySQL). */
export const duplicada = (e: any): boolean => e?.code === '23505';
