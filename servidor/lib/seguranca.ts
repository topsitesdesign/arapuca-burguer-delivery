/*
  Limite de tentativas, prova anti-robô, registro de auditoria e chaves de endereço
  (porte de Limite.php, Prova.php, Auditoria.php e Endereco.php — mesmas regras, mesmos textos).
*/
import crypto from 'node:crypto';
import { ctx, env, Erro, mbSub } from './base.js';
import * as Db from './db.js';
import { agoraMs, agoraSeg } from './tempo.js';

const hmac = (dado: string, chave = env.chave): string => crypto.createHmac('sha256', chave).update(dado).digest('hex');

/* ================================================================== Limite */

const hashLimite = (chave: string): string => hmac(chave).slice(0, 40);
const MSG_LIMITE = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';

export async function contar(chave: string, maximo: number, janela: number, mensagem = MSG_LIMITE): Promise<void> {
  const k = hashLimite(chave);
  const agora = agoraSeg();
  const r = await Db.um('SELECT contador, inicio FROM tentativas WHERE chave = ?', [k]);
  if (!r || agora - Number(r.inicio) > janela) {
    await Db.q('INSERT INTO tentativas (chave, contador, inicio) VALUES (?, 1, ?) ON CONFLICT (chave) DO UPDATE SET contador = 1, inicio = EXCLUDED.inicio', [k, agora]);
    return;
  }
  if (Number(r.contador) >= maximo) throw new Erro(mensagem, 429);
  await Db.q('UPDATE tentativas SET contador = contador + 1 WHERE chave = ?', [k]);
}

/** Só confere, sem somar: se a chave já chegou ao máximo dentro da janela, recusa (429). */
export async function verificar(chave: string, maximo: number, janela: number, mensagem = MSG_LIMITE): Promise<void> {
  const r = await Db.um('SELECT contador, inicio FROM tentativas WHERE chave = ?', [hashLimite(chave)]);
  if (r && agoraSeg() - Number(r.inicio) <= janela && Number(r.contador) >= maximo) throw new Erro(mensagem, 429);
}

/** Soma uma ocorrência, sem conferir (usado depois que a ação deu certo ou falhou de verdade). */
export async function somar(chave: string, janela: number): Promise<void> {
  const k = hashLimite(chave);
  const agora = agoraSeg();
  const r = await Db.um('SELECT inicio FROM tentativas WHERE chave = ?', [k]);
  if (!r || agora - Number(r.inicio) > janela) {
    await Db.q('INSERT INTO tentativas (chave, contador, inicio) VALUES (?, 1, ?) ON CONFLICT (chave) DO UPDATE SET contador = 1, inicio = EXCLUDED.inicio', [k, agora]);
    return;
  }
  await Db.q('UPDATE tentativas SET contador = contador + 1 WHERE chave = ?', [k]);
}

export async function zerar(chave: string): Promise<void> {
  await Db.q('DELETE FROM tentativas WHERE chave = ?', [hashLimite(chave)]);
}

export const ip = (): string => ctx().ip || '0.0.0.0';

/* ================================================================== Prova (anti-robô por prova de trabalho) */

export const BITS = 16;
export const VALIDADE = 3600;
const MSG_PROVA = 'Não conseguimos confirmar o envio. Atualize a página e envie de novo.';
const segredoProva = (): string => hmac('prova-de-trabalho');
const assinar = (s: string, t: number, b: number): string => hmac(`${s}|${t}|${b}`, segredoProva());
const igual = (a: string, b: string): boolean => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function desafio(): { s: string; t: number; b: number; a: string } {
  const s = crypto.randomBytes(16).toString('hex');
  const t = agoraSeg();
  return { s, t, b: BITS, a: assinar(s, t, BITS) };
}

/** Confere a prova que veio com o pedido e devolve o sal. Lança Erro com o campo "prova". */
export function conferirProva(p: any): string {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new Erro(MSG_PROVA, 422, 'prova');
  const { s, t, b, a, n } = p;
  if (typeof s !== 'string' || !/^[a-f0-9]{32}$/.test(s) || !int(t) || !int(b) || typeof a !== 'string' || !int(n) || n < 0 || n > 999_999_999_999) {
    throw new Erro(MSG_PROVA, 422, 'prova');
  }
  if (b < BITS || !igual(assinar(s, t, b), a)) throw new Erro(MSG_PROVA, 422, 'prova');
  const idade = agoraSeg() - t;
  if (idade < -60 || idade > VALIDADE) throw new Erro('O envio demorou mais que o normal. Envie de novo.', 422, 'prova');
  if (!zeros(crypto.createHash('sha256').update(`${s}:${n}`).digest(), b)) throw new Erro(MSG_PROVA, 422, 'prova');
  return s;
}

/** Marca a prova como usada, dentro da transação do pedido (se o pedido não entrar, a marca volta). */
export async function usarProva(sal: string): Promise<void> {
  const k = hmac('prova:' + sal).slice(0, 40);
  const r = await Db.q('INSERT INTO tentativas (chave, contador, inicio) VALUES (?, 1, ?) ON CONFLICT DO NOTHING', [k, agoraSeg()]);
  if (r.rowCount === 0) throw new Erro(MSG_PROVA, 422, 'prova');
}

function zeros(bin: Buffer, bits: number): boolean {
  const inteiros = bits >> 3;
  for (let i = 0; i < inteiros; i++) if (bin[i] !== 0) return false;
  const resto = bits % 8;
  return resto === 0 || bin[inteiros] >> (8 - resto) === 0;
}

/* ================================================================== Auditoria */

export async function registrar(usuarioId: string | null, acao: string, entidade = '', entidadeId = '', detalhes: Record<string, unknown> = {}): Promise<void> {
  const ipHash = hmac(ip()).slice(0, 16);
  await Db.q('INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, detalhes, ip_hash, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [usuarioId, mbSub(acao, 0, 40), mbSub(entidade, 0, 30), mbSub(entidadeId, 0, 60), Object.keys(detalhes).length ? JSON.stringify(detalhes) : null, ipHash, agoraMs()]);
}

/** array_filter do PHP para os detalhes da auditoria (tira vazios, zero e false). */
export const filtrar = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => !(v === '' || v === null || v === undefined || v === 0 || v === false || v === '0')));

/* ================================================================== Endereço (cupom "uma vez por cliente" também pelo endereço) */

const ACENTOS: Record<string, string> = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n', 'º': ' ', 'ª': ' ',
};
const RUA_IGNORAR = ['rua', 'r', 'avenida', 'av', 'avd', 'travessa', 'tv', 'trav', 'alameda', 'al', 'estrada', 'estr', 'rodovia', 'rod',
  'praca', 'pca', 'pc', 'largo', 'lgo', 'viela', 'beco', 'passagem', 'servidao', 'de', 'da', 'do', 'das', 'dos', 'e'];
const ABREVIACOES: Record<string, string> = { dr: 'doutor', dra: 'doutora', prof: 'professor', profa: 'professora', eng: 'engenheiro',
  brig: 'brigadeiro', gen: 'general', gal: 'general', cel: 'coronel', cap: 'capitao', ten: 'tenente', mal: 'marechal', pres: 'presidente',
  sto: 'santo', sta: 'santa', pe: 'padre', dep: 'deputado', sen: 'senador', gov: 'governador', maj: 'major', cons: 'conselheiro', nsa: 'nossa', sr: 'senhor', sra: 'senhora' };
const NUMERO_IGNORAR = ['n', 'no', 'nr', 'num', 'numero'];
const COMPLEMENTO_IGNORAR = ['apto', 'apt', 'ap', 'apartamento', 'bloco', 'bl', 'blc', 'casa', 'cs', 'sala', 'sl', 'conjunto', 'conj', 'cj',
  'lote', 'lt', 'quadra', 'qd', 'torre', 'andar', 'unidade', 'un', 'n', 'no', 'num', 'numero'];

const escalar = (v: unknown): boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const str = (v: unknown): string => (typeof v === 'boolean' ? (v ? '1' : '') : String(v));

function palavras(txt: unknown, ignorar: string[], rua = false): string[] {
  if (!escalar(txt)) return [];
  let s = str(txt).trim().toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüçñºª]/g, ch => ACENTOS[ch]);
  s = s.replace(/[^a-z0-9]+/g, ' ');
  s = s.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
  const todas = s.split(' ').filter(p => p !== '');
  const saida: string[] = [];
  for (let p of todas) {
    if (ignorar.includes(p)) continue;
    if (rua) p = ABREVIACOES[p] ?? p;
    if (/^\d+$/.test(p)) p = p.replace(/^0+/, '') || '0';
    saida.push(p);
  }
  return saida.length ? saida : (rua ? todas : []);
}

const hashEndereco = (s: string): string => hmac('endereco:' + s).slice(0, 40);

export function chavesEndereco(e: any, area: unknown): { endereco: string; predio: string } {
  const vazio = { endereco: '', predio: '' };
  if (typeof e !== 'object' || e === null) return vazio;
  const rua = palavras(e.rua ?? '', RUA_IGNORAR, true);
  if (!rua.length) return vazio;
  const numero = palavras(e.numero ?? '', NUMERO_IGNORAR);
  const comp = palavras(e.complemento ?? '', COMPLEMENTO_IGNORAR).sort();
  const base = rua.join(' ') + '|' + numero.join('') + '|' + (escalar(area) ? str(area) : '');
  const predio = hashEndereco(base);
  return { endereco: comp.length ? hashEndereco(base + '|' + comp.join(' ')) : predio, predio };
}
