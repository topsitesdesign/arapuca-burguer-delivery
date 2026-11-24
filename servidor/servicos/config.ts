/** Configurações da loja (uma linha por assunto, guardada como JSON) — porte de Config.php. */
import { ctx } from '../lib/base.js';
import * as Db from '../lib/db.js';
import { agoraMs } from '../lib/tempo.js';

export const CHAVES = ['loja', 'horarios', 'excecoes', 'pagamentos', 'entrega', 'notif', 'operacao', 'logo', 'proprietario', 'versaoBanco', 'privacidade', 'seguranca', 'hashFalso'];

export async function todas(): Promise<Record<string, any>> {
  const c = ctx().cache;
  if (c.config) return c.config;
  const saida: Record<string, any> = {};
  for (const r of await Db.todos('SELECT chave, valor FROM configuracoes')) {
    try { saida[r.chave] = JSON.parse(r.valor); } catch { saida[r.chave] = null; }
  }
  return (c.config = saida);
}

export async function obter(chave: string, padrao: any = null): Promise<any> {
  const v = (await todas())[chave];
  return v === undefined || v === null ? padrao : v;
}

/** (array) do PHP: objeto ou lista, nunca null. */
export async function obj(chave: string): Promise<Record<string, any>> {
  const v = await obter(chave, {});
  return typeof v === 'object' && v !== null ? v : {};
}

export async function gravar(chave: string, valor: unknown): Promise<void> {
  await Db.q('INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, ?) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = EXCLUDED.atualizado_em',
    [chave, JSON.stringify(valor), agoraMs()]);
  const c = ctx().cache;
  if (c.config) c.config[chave] = valor;
}

export function esquecer(): void {
  delete ctx().cache.config;
}

/** Operação do momento; uma pausa com hora marcada termina sozinha. */
export async function operacao(): Promise<Record<string, any>> {
  let op: Record<string, any> = { aberta: true, pausada: false, motivo: '', pausaAte: null, tempoMin: 30, tempoMax: 45, pedidoMinimo: 0, fecha: '23:30', tempoPreparo: 18, ...(await obj('operacao')) };
  if (op.pausada && op.pausaAte && agoraMs() >= Number(op.pausaAte)) {
    op = { ...op, pausada: false, pausaAte: null, motivo: '' };
    await gravar('operacao', op);
  }
  return op;
}
