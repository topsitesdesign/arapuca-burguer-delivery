/*
  Cálculo do pedido feito só no servidor (porte de Cotacao.php): preço de cada produto e adicional vem do banco,
  depois desconto do cupom, taxa do bairro e total. O que o navegador mandar como preço é ignorado.
*/
import { Erro } from '../lib/base.js';
import { chavesEndereco } from '../lib/seguranca.js';
import * as T from '../lib/tempo.js';
import * as V from '../lib/v.js';
import * as Cardapio from './cardapio.js';
import * as Config from './config.js';
import * as Cupons from './cupons.js';

export const MAX_LINHAS = 30;
export const MAX_UNIDADES = 60;

export interface Cot {
  linhas: any[]; modo: string; area: any | null; subtotal: number; desconto: number; taxa: number | null; total: number;
  cupom: Cupons.Cupom | null; avisoCupom: string | null; minimo: number; prazo: string;
}

const escalarStr = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : typeof x === 'boolean' ? (x ? '1' : '') : '');

export async function calcular(e: Record<string, any>, telefone: string | null = null, final = false, travarCupom = false, balcao = false): Promise<Cot> {
  const itens = V.lista(e.itens ?? null, 'os itens da sacola', MAX_LINHAS);
  if (!itens.length) throw new Erro('Sua sacola está vazia. Escolha um produto para começar.', 422, 'itens');

  const prods = Cardapio.porId(await Cardapio.produtos());
  const linhas: any[] = [];
  let subtotal = 0;
  let unidades = 0;
  for (const bruto of itens) {
    const it = V.objeto(bruto, 'um item da sacola');
    const pid = V.id(it.produtoId ?? null, 'o produto');
    const p = prods[pid] ?? null;
    if (!p || !(await Cardapio.visivel(p))) {
      throw new Erro('Um item da sacola não está mais disponível' + (p ? ': ' + p.nome : '') + '. Remova-o para continuar.', 409, 'itens', { produtoId: pid, atualizar: true });
    }
    const qtd = V.inteiro(it.qtd ?? null, 'a quantidade de ' + p.nome, 1, 20);
    const escolhas = it.escolhas ?? [];
    if (typeof escolhas !== 'object' || escolhas === null) throw new Erro('Formato inválido nas opções de ' + p.nome + '.', 400);
    const gs = await Cardapio.gruposDo(p);
    const mudou = (): Erro => new Erro('As opções de ' + p.nome + ' mudaram. Remova o item e adicione de novo.', 409, 'itens', { produtoId: pid, atualizar: true });
    const idsGrupos = gs.map(g => g.id);
    for (const [gid, sel] of Object.entries(escolhas)) {
      const temSel = Array.isArray(sel) ? sel.length > 0 : typeof sel === 'object' && sel !== null ? Object.keys(sel).length > 0 : !!sel && sel !== '0';
      if (!idsGrupos.includes(String(gid)) && temSel) throw mudou();
    }
    const base = Cardapio.precoAtual(p);
    let unit = base;
    const adicionais: any[] = [];
    const resumo: string[] = [];
    for (const g of gs) {
      let sel: unknown = (escolhas as any)[g.id] ?? [];
      if (!Array.isArray(sel)) throw new Erro('Formato inválido nas opções de ' + p.nome + '.', 400);
      const lista = [...new Set(sel.map(escalarStr))];
      if (!balcao && lista.length < g.min) {
        throw new Erro('Escolha ' + (g.min === 1 ? 'uma opção' : g.min + ' opções') + ' em ' + g.nome + ' (' + p.nome + ').', 422, 'itens');
      }
      if (lista.length > g.max) throw new Erro('Escolha até ' + g.max + ' em ' + g.nome + ' (' + p.nome + ').', 422, 'itens');
      const ops = Object.fromEntries(g.opcoes.map((o: any) => [o.id, o]));
      const nomes: string[] = [];
      for (const oid of lista) {
        const o = ops[oid];
        if (!o) throw mudou();
        adicionais.push({ nome: o.nome, preco: o.preco });
        nomes.push(o.nome);
        unit += o.preco;
      }
      if (nomes.length) resumo.push(nomes.join(', '));
    }
    const obs = V.texto(it.obs ?? '', 'a observação do item', 0, 140);
    unidades += qtd;
    subtotal += unit * qtd;
    linhas.push({ produtoId: p.id, nome: p.nome, qtd, preco: base, adicionais, obs, unit, opcoes: resumo.join(' · ') });
  }
  if (unidades > MAX_UNIDADES) throw new Erro('Para um pedido desse tamanho, fale com a loja pelo WhatsApp.', 422, 'itens');

  const modo = V.opcao(e.modo ?? 'entrega', ['entrega', 'retirada'] as const, 'o recebimento', 'modo');
  const cfg = await Config.obj('entrega');
  if (modo === 'entrega' && (cfg.entrega ?? true) === false) throw new Erro('A loja não está fazendo entregas agora. Escolha a retirada no balcão.', 422, 'modo');
  if (modo === 'retirada' && (cfg.retirada ?? true) === false) throw new Erro('A retirada no balcão está desligada agora. Escolha a entrega.', 422, 'modo');

  const op = await Config.operacao();
  let area: any = null;
  let taxa: number | null = modo === 'retirada' ? 0 : null;
  if (modo === 'entrega') {
    const aid = e.area ?? null;
    if (aid !== null && aid !== '') {
      const a = Cardapio.porId(await Cardapio.areas())[V.id(aid, 'o bairro')] ?? null;
      if (!a || !a.ativa) throw new Erro('Não estamos entregando nesse bairro agora. Escolha outro bairro ou a retirada.', 422, 'bairro', { atualizar: true });
      area = a;
      taxa = a.taxa;
    } else if (final) {
      throw new Erro('Escolha o bairro da entrega.', 422, 'bairro');
    }
  }
  const minimo = modo === 'entrega' ? Math.max(Math.trunc(Number(op.pedidoMinimo)), Number(area?.minimo ?? 0)) : 0;
  if (final && minimo > 0 && subtotal < minimo) {
    throw new Erro('O pedido mínimo de entrega' + (area ? ' para ' + area.nome : '') + ' é de ' + T.brl(minimo) + ' em produtos.', 422, 'minimo');
  }

  let cupom: Cupons.Cupom | null = null;
  let desconto = 0;
  let aviso: string | null = null;
  const codigo = Cupons.normalizarCodigo(e.cupom ?? '');
  if (codigo !== '') {
    try {
      const c = await Cupons.porCodigo(codigo, travarCupom);
      if (!c) throw new Erro('Cupom não encontrado. Confira as letras e os números.', 422, 'cupom');
      await Cupons.conferir(c, subtotal, modo, telefone, modo === 'entrega' ? chavesEndereco(e.endereco ?? null, area?.id ?? '') : {});
      const r = Cupons.aplicar(c, subtotal, Number(taxa ?? 0));
      desconto = r.desconto;
      if (taxa !== null) taxa = r.taxa;
      cupom = c;
    } catch (err) {
      if (!(err instanceof Erro) || final) throw err;
      aviso = err.message;
    }
  }

  const prazo = modo === 'retirada' ? String(cfg.prazoRetirada ?? '20–30 min') : Cardapio.prazo(op, Number(area?.tempoExtra ?? 0));
  return { linhas, modo, area, subtotal, desconto, taxa, total: subtotal - desconto + Number(taxa ?? 0), cupom, avisoCupom: aviso, minimo, prazo };
}

/** Versão para o site (valores em reais). */
export function publica(c: Cot): Record<string, unknown> {
  return {
    itens: c.linhas.map(l => ({ produtoId: l.produtoId, nome: l.nome, qtd: l.qtd, unit: T.reais(l.unit), total: T.reais(l.unit * l.qtd), opcoes: l.opcoes, obs: l.obs })),
    modo: c.modo, area: c.area ? { id: c.area.id, nome: c.area.nome } : null,
    subtotal: T.reais(c.subtotal), desconto: T.reais(c.desconto), taxa: T.reais(c.taxa), total: T.reais(c.total),
    cupom: c.cupom ? Cupons.publico(c.cupom) : null, avisoCupom: c.avisoCupom, minimo: T.reais(c.minimo), prazo: c.prazo,
  };
}
