/*
  Envio seguro de imagens (porte de Imagem.php): confere o tipo pelo conteúdo, refaz a imagem do zero (sem metadados
  nem código escondido) e grava duas versões (500 e 960 px, WebP) com nome aleatório: chave u-xxxxxxxxxxxx.
  Onde fica: Supabase Storage (bucket público "uploads") na Vercel; no computador, uma pasta local (UPLOADS_DIR).
*/
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Erro } from './base.js';

export const PADRAO_CHAVE = /^u-[a-f0-9]{12}(-j)?$/;
const BUCKET = 'uploads';

/* ------------------------------------------------------------------ armazenamento */

const supabase = (): { url: string; chave: string } | null => {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && chave ? { url, chave } : null;
};
/** Chave nova da Supabase ("sb_secret_…") vai só em apikey; a chave antiga (service_role, um JWT) vai nos dois cabeçalhos. */
const auth = (chave: string): Record<string, string> => (chave.startsWith('sb_') ? { apikey: chave } : { Authorization: `Bearer ${chave}`, apikey: chave });
const pastaLocal = (): string => process.env.UPLOADS_DIR || path.resolve('uploads');

export async function gravarArquivo(nome: string, dados: Buffer, tipo: string): Promise<void> {
  const s = supabase();
  if (s) {
    const r = await fetch(`${s.url}/storage/v1/object/${BUCKET}/${nome}`, {
      method: 'POST', body: new Uint8Array(dados),
      headers: { ...auth(s.chave), 'Content-Type': tipo, 'Cache-Control': '2592000', 'x-upsert': 'true' },
    });
    if (!r.ok) throw new Error(`Falha ao gravar a imagem no Supabase Storage (HTTP ${r.status}).`);
    return;
  }
  fs.mkdirSync(pastaLocal(), { recursive: true });
  fs.writeFileSync(path.join(pastaLocal(), nome), dados);
}

export async function lerArquivo(nome: string): Promise<Buffer | null> {
  if (!/^u-[a-f0-9]{12}-(500|960)\.(webp|jpg)$/.test(nome)) return null;
  const s = supabase();
  if (s) {
    const r = await fetch(`${s.url}/storage/v1/object/public/${BUCKET}/${nome}`);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  const f = path.join(pastaLocal(), nome);
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
}

export async function apagarArquivo(nome: string): Promise<void> {
  const s = supabase();
  if (s) {
    await fetch(`${s.url}/storage/v1/object/${BUCKET}/${nome}`, { method: 'DELETE', headers: auth(s.chave) }).catch(() => undefined);
    return;
  }
  try { fs.unlinkSync(path.join(pastaLocal(), nome)); } catch { /* já não existia */ }
}

/* ------------------------------------------------------------------ envio pelo painel */

export async function deDataUrl(url: string): Promise<string> {
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!m) throw new Erro('Use uma imagem JPG, PNG ou WebP.');
  const b64 = m[2].replace(/\s+/g, '');
  const bin = /^[A-Za-z0-9+/]*={0,2}$/.test(b64) ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
  if (!bin.length || bin.length > 6 * 1024 * 1024) throw new Erro('A imagem é grande demais (máximo de 6 MB).');
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(bin).metadata();
  } catch {
    throw new Erro('Não conseguimos abrir essa imagem. Tente outra em JPG, PNG ou WebP.');
  }
  if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || !meta.width || !meta.height) {
    throw new Erro('Não conseguimos abrir essa imagem. Tente outra em JPG, PNG ou WebP.');
  }
  // abrir uma imagem enorme derruba o servidor: confere o tamanho pelo cabeçalho, antes de abrir (SEG-07)
  if (meta.width > 4000 || meta.height > 4000) {
    throw new Erro(`A imagem é grande demais (${meta.width} × ${meta.height} px). Use no máximo 4000 px de largura e de altura.`);
  }
  const base = 'u-' + crypto.randomBytes(6).toString('hex');
  for (const largura of [500, 960]) {
    let saida: Buffer;
    try {
      saida = await sharp(bin, { limitInputPixels: 4000 * 4000 }).rotate().resize({ width: largura, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new Erro('Não conseguimos abrir essa imagem. Tente outra em JPG, PNG ou WebP.');
    }
    await gravarArquivo(`${base}-${largura}.webp`, saida, 'image/webp');
  }
  return base;
}

/** Caminho público (sem barra inicial) de uma foto: banco de fotos do projeto ou envio do painel. */
export function url(foto: string, largura = 960, so500 = false): string {
  if (foto === '') return '';
  if (PADRAO_CHAVE.test(foto)) {
    const jpg = foto.endsWith('-j');
    const base = jpg ? foto.slice(0, -2) : foto;
    return 'uploads/' + base + '-' + (largura <= 500 ? 500 : 960) + (jpg ? '.jpg' : '.webp');
  }
  if (/^f\d{3,12}$/.test(foto)) return 'assets/img/photo-' + foto + '-' + (so500 || largura <= 500 ? 500 : 960) + '.webp';
  return '';
}

export function fotoValida(foto: unknown): string {
  if (foto === '' || foto === null || foto === undefined) return '';
  if (typeof foto === 'string' && (PADRAO_CHAVE.test(foto) || /^f\d{3,12}$/.test(foto))) return foto;
  throw new Erro('Imagem inválida. Envie a imagem de novo.');
}
