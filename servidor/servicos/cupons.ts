/** Cupons de desconto: regras conferidas no servidor (porte de Cupons.php). */
import { Erro } from '../lib/base.js';
import * as Db from '../lib/db.js';
import * as T from '../lib/tempo.js';

export const TIPOS = ['percentual', 'fixo', 'frete'] as const;

export interface Cupom {
  id: string; codigo: string; tipo: string; valor: number; minimo: number; usos: number; limite: number | null; porCliente: number;
  inicio: string; validade: string; habilitado: boolean; descricao: string; ordem: number; versao: number;
}

export function linha(r: any): Cupom {
  return {
    id: r.id, codigo: r.codigo, tipo: r.tipo, valor: Number(r.valor), minimo: Number(r.minimo), usos: Number(r.usos),
    limite: r.limite === null ? null : Number(r.limite), porCliente: Number(r.por_cliente), inicio: String(r.inicio), validade: String(r.validade),
    habilitado: !!Number(r.habilitado), descricao: String(r.descricao), ordem: Number(r.ordem), versao: Number(r.versao ?? 1),
  };
}

export async function todos(): Promise<Cupom[]> {
  return (await Db.todos('SELECT * FROM cupons WHERE arquivado_em IS NULL ORDER BY ordem, codigo')).map(linha);
}

export function normalizarCodigo(c: unknown): string {
  return typeof c === 'string' ? c.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

/** Busca pelo código; com travar = true, segura a linha até o fim da transação (evita passar do limite). */
export async function porCodigo(codigo: string, travar = false): Promise<Cupom | null> {
  const r = await Db.um('SELECT * FROM cupons WHERE codigo = ? AND arquivado_em IS NULL' + (travar ? ' FOR UPDATE' : ''), [codigo]);
  return r ? linha(r) : null;
}

export async function conferir(c: Cupom, subtotal: number, modo: string, telefone: string | null, endereco: { endereco?: string; predio?: string } = {}): Promise<void> {
  const hoje = T.hojeIso();
  if (!c.habilitado) throw new Erro('Esse cupom não está valendo agora.', 422, 'cupom');
  if (c.inicio !== '' && c.inicio > hoje) throw new Erro('Esse cupom começa a valer em ' + T.dataBr(c.inicio) + '.', 422, 'cupom');
  if (c.validade !== '' && c.validade < hoje) throw new Erro('Esse cupom expirou.', 422, 'cupom');
  if (c.limite !== null && c.usos >= c.limite) throw new Erro('Esse cupom já atingiu o limite de usos.', 422, 'cupom');
  if (c.minimo > 0 && subtotal < c.minimo) throw new Erro('Esse cupom vale para pedidos a partir de ' + T.brl(c.minimo) + ' em produtos.', 422, 'cupom');
  if (c.tipo === 'frete' && modo !== 'entrega') throw new Erro('Esse cupom é de frete grátis e vale só para entrega.', 422, 'cupom');
  if (telefone !== null && c.porCliente > 0) {
    const usados = Number(await Db.valor(
      "SELECT COUNT(*) FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero WHERE u.cupom_id = ? AND u.telefone = ? AND p.status NOT IN ('recusado', 'cancelado')",
      [c.id, telefone]));
    if (usados >= c.porCliente) {
      throw new Erro(c.porCliente === 1 ? 'Esse cupom já foi usado neste WhatsApp.' : 'Esse cupom já foi usado ' + c.porCliente + ' vezes neste WhatsApp.', 422, 'cupom');
    }
  }
  const predio = String(endereco.predio ?? '');
  if (c.porCliente > 0 && predio !== '') {
    const casa = String(endereco.endereco ?? '') === predio; // sem complemento
    const usados = Number(await Db.valor(
      `SELECT COUNT(*) FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero
       WHERE u.cupom_id = ? AND u.predio_chave = ? AND (u.endereco_chave = ? OR u.endereco_chave = u.predio_chave OR ?::boolean)
         AND p.status NOT IN ('recusado', 'cancelado')`,
      [c.id, predio, String(endereco.endereco ?? ''), casa]));
    if (usados >= c.porCliente) {
      throw new Erro(c.porCliente === 1 ? 'Esse cupom já foi usado neste endereço.' : 'Esse cupom já foi usado ' + c.porCliente + ' vezes neste endereço.', 422, 'cupom');
    }
  }
}

/** Desconto em centavos sobre os produtos; o cupom de frete zera a taxa. */
export function aplicar(c: Cupom, subtotal: number, taxa: number): { desconto: number; taxa: number } {
  switch (c.tipo) {
    case 'percentual': return { desconto: Math.round(subtotal * Math.min(100, Math.max(0, c.valor)) / 100), taxa };
    case 'fixo': return { desconto: Math.min(c.valor, subtotal), taxa };
    case 'frete': return { desconto: 0, taxa: 0 };
    default: return { desconto: 0, taxa };
  }
}

export function rotulo(c: Cupom): string {
  return c.tipo === 'percentual' ? c.valor + '% de desconto nos produtos' : c.tipo === 'fixo' ? T.brl(c.valor) + ' de desconto nos produtos' : c.tipo === 'frete' ? 'entrega grátis' : 'desconto';
}

export function curto(c: Cupom): string {
  return c.tipo === 'percentual' ? c.valor + '% nos produtos' : c.tipo === 'fixo' ? T.brl(c.valor) + ' nos produtos' : c.tipo === 'frete' ? 'entrega grátis' : 'desconto';
}

export function publico(c: Cupom): Record<string, unknown> {
  return { codigo: c.codigo, tipo: c.tipo, valor: c.tipo === 'percentual' ? c.valor : T.reais(c.valor), minimo: T.reais(c.minimo), rotulo: rotulo(c), curto: curto(c) };
}
