/*
  Sessão guardada no banco (tabela sessoes), no lugar dos arquivos de sessão do PHP: na Vercel cada requisição pode
  cair numa máquina diferente. Mesmo comportamento: cookie "brasa" HttpOnly, SameSite=Lax e Secure em HTTPS;
  modo estrito (ID desconhecido vira ID novo); ID novo a cada login; expira em 8 h sem uso.
  Também o token contra formulários forjados (Csrf).
*/
import crypto from 'node:crypto';
import { ctx, Erro, type Sessao } from './base.js';
import * as Db from './db.js';
import { agoraSeg } from './tempo.js';

export const LIMITE_INATIVIDADE = 8 * 3600;
const NOME = 'brasa';
const novoId = (): string => crypto.randomBytes(20).toString('hex');

function lerCookie(nome: string): string | null {
  const bruto = ctx().cab['cookie'] || '';
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export async function iniciar(): Promise<Sessao> {
  const c = ctx();
  if (c.sessao) return c.sessao;
  const id = lerCookie(NOME);
  const agora = agoraSeg();
  if (id && /^[a-f0-9]{40}$/.test(id)) {
    const r = await Db.um('SELECT dados, expira FROM sessoes WHERE id = ?', [id]);
    if (r && Number(r.expira) > agora) {
      let dados: Record<string, any> = {};
      try { dados = JSON.parse(r.dados) || {}; } catch { dados = {}; }
      c.sessao = { id, dados, enviarCookie: false, mudou: false, apagar: [], carregadaEm: Number(r.expira) - LIMITE_INATIVIDADE };
      return c.sessao;
    }
  }
  // sem cookie, cookie inventado ou vencido: sessão nova (modo estrito do PHP)
  c.sessao = { id: novoId(), dados: {}, enviarCookie: true, mudou: true, apagar: [], carregadaEm: agora };
  return c.sessao;
}

export function marcarMudanca(): void {
  const s = ctx().sessao;
  if (s) s.mudou = true;
}

/** session_regenerate_id(true): ID novo, o antigo deixa de valer. */
export async function regenerar(): Promise<void> {
  const s = await iniciar();
  s.apagar.push(s.id);
  s.id = novoId();
  s.enviarCookie = true;
  s.mudou = true;
}

/** Grava a sessão no fim da requisição e põe o cookie na resposta. */
export async function gravar(): Promise<void> {
  const c = ctx();
  const s = c.sessao;
  if (!s) return;
  const agora = agoraSeg();
  if (s.apagar.length) await Db.q(`DELETE FROM sessoes WHERE id IN (${Db.marcas(s.apagar)})`, s.apagar);
  // sem mudança, a validade só é renovada de 5 em 5 minutos (evita uma gravação por requisição)
  if (s.mudou || agora - s.carregadaEm > 300) {
    await Db.q('INSERT INTO sessoes (id, dados, expira) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, expira = EXCLUDED.expira',
      [s.id, JSON.stringify(s.dados), agora + LIMITE_INATIVIDADE]);
  }
  if (s.enviarCookie) c.cookies.push(`${NOME}=${s.id}; path=/; ${c.https ? 'secure; ' : ''}HttpOnly; SameSite=Lax`);
}

/* ------------------------------------------------------------------ administrador */

export async function adminId(): Promise<string | null> {
  const s = await iniciar();
  const a = s.dados.admin;
  if (!a || typeof a !== 'object') return null;
  if (agoraSeg() - Number(a.visto || 0) > LIMITE_INATIVIDADE) {
    await sairAdmin();
    return null;
  }
  a.visto = agoraSeg();
  s.mudou = true;
  return String(a.id);
}

export async function entrarAdmin(id: string, versao: string): Promise<void> {
  await regenerar();
  const s = await iniciar();
  delete s.dados.pre2fa;
  delete s.dados.totp_novo;
  s.dados.admin = { id, visto: agoraSeg(), v: versao };
  await renovarCsrf();
}

export async function versaoAdmin(): Promise<string | null> {
  const s = await iniciar();
  const v = s.dados.admin?.v;
  return typeof v === 'string' ? v : null;
}

export async function definirVersao(versao: string): Promise<void> {
  const s = await iniciar();
  if (s.dados.admin && typeof s.dados.admin === 'object') { s.dados.admin.v = versao; s.mudou = true; }
}

export async function guardarPre2fa(id: string, versao: string): Promise<void> {
  await regenerar();
  const s = await iniciar();
  s.dados.pre2fa = { id, v: versao, em: agoraSeg() };
}

export async function pre2fa(): Promise<{ id: string; v: string; em: number } | null> {
  const s = await iniciar();
  const p = s.dados.pre2fa;
  if (!p || typeof p !== 'object' || agoraSeg() - Number(p.em || 0) > 300) {
    if (s.dados.pre2fa !== undefined) { delete s.dados.pre2fa; s.mudou = true; }
    return null;
  }
  return p;
}

export async function limparPre2fa(): Promise<void> {
  const s = await iniciar();
  delete s.dados.pre2fa;
  s.mudou = true;
}

export async function guardarSegredoNovo(segredo: string | null): Promise<void> {
  const s = await iniciar();
  if (segredo === null) delete s.dados.totp_novo; else s.dados.totp_novo = { s: segredo, em: agoraSeg() };
  s.mudou = true;
}

export async function segredoNovo(): Promise<string | null> {
  const s = await iniciar();
  const t = s.dados.totp_novo;
  return t && typeof t === 'object' && agoraSeg() - Number(t.em || 0) < 900 ? String(t.s) : null;
}

export async function sairAdmin(): Promise<void> {
  const s = await iniciar();
  delete s.dados.admin;
  delete s.dados.pre2fa;
  delete s.dados.totp_novo;
  await regenerar();
  await renovarCsrf();
}

/* ------------------------------------------------------------------ CSRF */

export async function tokenCsrf(): Promise<string> {
  const s = await iniciar();
  if (typeof s.dados.csrf !== 'string' || !s.dados.csrf) { s.dados.csrf = crypto.randomBytes(32).toString('hex'); s.mudou = true; }
  return s.dados.csrf;
}

export async function renovarCsrf(): Promise<void> {
  const s = await iniciar();
  s.dados.csrf = crypto.randomBytes(32).toString('hex');
  s.mudou = true;
}

/** Todo envio precisa trazer o token da sessão (cabeçalho X-CSRF-Token ou campo _csrf do formulário). */
export async function verificarCsrf(post: Record<string, any> = {}): Promise<void> {
  const s = await iniciar();
  const enviado = ctx().cab['x-csrf-token'] ?? post._csrf ?? '';
  const esperado = s.dados.csrf ?? '';
  const ok = typeof enviado === 'string' && typeof esperado === 'string' && esperado !== ''
    && enviado.length === esperado.length && crypto.timingSafeEqual(Buffer.from(enviado), Buffer.from(esperado));
  // 403, e não 419: alguns servidores trocam códigos fora do padrão por 500
  if (!ok) throw new Erro('Sua sessão expirou. Atualize a página e tente de novo.', 403);
}
