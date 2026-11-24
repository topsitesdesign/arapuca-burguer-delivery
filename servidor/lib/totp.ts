/*
  Verificação em duas etapas por aplicativo autenticador (TOTP, RFC 6238), segredo cifrado no banco (AES-256-GCM)
  e códigos de recuperação (porte de Totp.php).
*/
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from './base.js';
import { agoraSeg } from './tempo.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO = 30;

export function novoSegredo(): string {
  const bits = [...crypto.randomBytes(20)].map(b => b.toString(2).padStart(8, '0')).join('');
  let s = '';
  for (let i = 0; i < bits.length; i += 5) s += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return s;
}

function binario(b32: string): Buffer {
  const limpo = b32.replace(/[^A-Za-z2-7]/g, '').toUpperCase();
  let bits = '';
  for (const c of limpo) {
    const i = B32.indexOf(c);
    if (i < 0) return Buffer.alloc(0);
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codigo(segredo: string, passo: number): string {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(passo / 2 ** 32), 0);
  msg.writeUInt32BE(passo >>> 0, 4);
  const h = crypto.createHmac('sha1', binario(segredo)).update(msg).digest();
  const o = h[19] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Aceita um passo antes e um depois; devolve o passo usado (para não aceitar o mesmo código duas vezes) ou null. */
export function conferir(segredo: string, cod: string, ultimoUsado = 0): number | null {
  const c = cod.replace(/\D/g, '');
  if (c.length !== 6) return null;
  const agora = Math.floor(agoraSeg() / PASSO);
  for (const d of [0, -1, 1]) {
    const p = agora + d;
    if (p <= ultimoUsado) continue;
    if (crypto.timingSafeEqual(Buffer.from(codigo(segredo, p)), Buffer.from(c))) return p;
  }
  return null;
}

/** rawurlencode do PHP (RFC 3986). */
const rawurlencode = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());

export function uri(segredo: string, conta: string, emissor: string): string {
  return 'otpauth://totp/' + rawurlencode(emissor + ':' + conta) + '?secret=' + segredo + '&issuer=' + rawurlencode(emissor) + '&algorithm=SHA1&digits=6&period=30';
}

const chave = (): Buffer => crypto.createHash('sha256').update(env.chave + '|totp').digest();

export function fechar(segredo: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const cifrado = Buffer.concat([c.update(segredo, 'utf8'), c.final()]);
  return 'g:' + Buffer.concat([iv, c.getAuthTag(), cifrado]).toString('base64');
}

export function abrir(guardado: string | null | undefined): string | null {
  if (!guardado) return null;
  if (guardado.startsWith('p:')) return guardado.slice(2);
  if (!guardado.startsWith('g:')) return null;
  const b = Buffer.from(guardado.slice(2), 'base64');
  if (b.length < 29) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ senhas (password_hash do PHP: bcrypt, custo 10) */

export const hashSenha = (s: string): string => bcrypt.hashSync(s, 10);
export const conferirSenha = (s: string, hash: string): boolean => {
  try { return typeof hash === 'string' && hash.startsWith('$2') && bcrypt.compareSync(s, hash); } catch { return false; }
};
/** password_needs_rehash: muda de custo ou de algoritmo. */
export const precisaRefazer = (hash: string): boolean => !/^\$2[aby]\$10\$/.test(hash);

/* ------------------------------------------------------------------ códigos de recuperação (celular perdido) */

/** 8 códigos de uso único, no formato XXXX-XXXX. Devolve [códigos para mostrar, hashes para guardar]. */
export function codigosRecuperacao(): [string[], string[]] {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const mostrar: string[] = [];
  const guardar: string[] = [];
  for (let i = 0; i < 8; i++) {
    let c = '';
    for (let j = 0; j < 8; j++) c += letras[crypto.randomInt(0, letras.length)];
    c = c.slice(0, 4) + '-' + c.slice(4);
    mostrar.push(c);
    guardar.push(hashSenha(c));
  }
  return [mostrar, guardar];
}

export function usarRecuperacao(hashes: unknown[], cod: string): string[] | null {
  let c = cod.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (c.length !== 8) return null;
  c = c.slice(0, 4) + '-' + c.slice(4);
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i];
    if (typeof h === 'string' && conferirSenha(c, h)) return hashes.filter((_, k) => k !== i) as string[];
  }
  return null;
}
