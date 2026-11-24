/*
  Pedidos (porte de Pedidos.php): criação (site e balcão), acompanhamento público, etapas e pagamento no painel,
  histórico, caixa, novidades e os pedidos do titular (LGPD: exportar e anonimizar).
*/
import crypto from 'node:crypto';
import { ctx, Erro, mbSub } from '../lib/base.js';
import * as Db from '../lib/db.js';
import * as L from '../lib/seguranca.js';
import * as T from '../lib/tempo.js';
import * as V from '../lib/v.js';
import * as Config from './config.js';
import * as Cotacao from './cotacao.js';
import * as Cupons from './cupons.js';
import * as Horarios from './horarios.js';
import * as Usuarios from './usuarios.js';

export const ATIVOS = ['novo', 'confirmado', 'preparo', 'entrega'];
export const ETAPAS = ['novo', 'confirmado', 'preparo', 'entrega', 'concluido'];
export const FINAIS = ['recusado', 'cancelado'];
export const SITE: Record<string, string> = { novo: 'recebido', confirmado: 'confirmado', preparo: 'preparo', entrega: 'saiu', concluido: 'entregue', recusado: 'recusado', cancelado: 'cancelado' };
export const NOMES: Record<string, string> = { novo: 'Novo', confirmado: 'Confirmado', preparo: 'Em preparo', entrega: 'Em entrega', concluido: 'Concluído', recusado: 'Recusado', cancelado: 'Cancelado' };
export const PAGAMENTOS: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito' };
export const SITUACOES_PAGAMENTO = ['pendente', 'recebido', 'estornado', 'sem_registro'];
export const DIAS_LINK = 7;
export const MINUTOS_REPETIDO = 20;

export async function formasAceitas(): Promise<string[]> {
  const cfg = await Config.obj('pagamentos');
  return Object.keys(PAGAMENTOS).filter(f => !!cfg[f]);
}

export function foneExibicao(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function foneMascarado(d: string): string {
  if (d.length < 10) return '';
  return '(' + d.slice(0, 2) + ') ' + '•'.repeat(d.length - 6) + '-' + d.slice(-4);
}

function endereco(e: unknown): Record<string, string> {
  const x: any = typeof e === 'object' && e !== null ? e : {};
  return {
    rua: V.texto(x.rua ?? '', 'a rua da entrega', 3, 120, 'rua'),
    numero: V.texto(x.numero ?? '', 'o número da entrega', 1, 12, 'numero'),
    complemento: V.texto(x.complemento ?? '', 'o complemento', 0, 60, 'complemento'),
    referencia: V.texto(x.referencia ?? '', 'o ponto de referência', 0, 80, 'referencia'),
  };
}

async function troco(v: unknown, forma: string, total: number): Promise<number | null> {
  if (forma !== 'dinheiro' || v === null || v === undefined || v === '' || v === false) return null;
  if (!(await Config.obj('pagamentos')).troco) return null;
  const c = V.centavos(v, 'o troco', 10_000_000, true, 'troco');
  if (c !== null && c < total) throw new Erro('O troco precisa ser de pelo menos ' + T.brl(total) + '.', 422, 'troco');
  return c;
}

/* ------------------------------------------------------------------ revisão (novidades do painel) */

/** Próximo número de revisão: a linha do contador fica travada até o fim da transação (PED-07). */
async function marcarRev(numero: number): Promise<void> {
  let r = await Db.q("UPDATE contadores SET valor = valor + 1 WHERE nome = 'rev' RETURNING valor");
  if (r.rowCount === 0) {
    await Db.q("INSERT INTO contadores (nome, valor) SELECT 'rev', COALESCE(MAX(rev), 0) FROM pedidos ON CONFLICT DO NOTHING");
    r = await Db.q("UPDATE contadores SET valor = valor + 1 WHERE nome = 'rev' RETURNING valor");
  }
  await Db.q('UPDATE pedidos SET rev = ? WHERE numero = ?', [Number(r.rows[0].valor), numero]);
}

export async function revAtual(): Promise<number> {
  return Number(await Db.valor("SELECT valor FROM contadores WHERE nome = 'rev'") ?? 0);
}

/* ------------------------------------------------------------------ números bloqueados */

export async function bloqueado(tel: string): Promise<boolean> {
  return !!Number(await Db.valor('SELECT COUNT(*) FROM bloqueados WHERE telefone = ?', [tel]));
}

export async function bloqueados(): Promise<any[]> {
  return (await Db.todos('SELECT * FROM bloqueados ORDER BY criado_em DESC LIMIT 500')).map(r => ({ telefone: foneExibicao(r.telefone), digitos: r.telefone, motivo: r.motivo, em: Number(r.criado_em) }));
}

export async function bloquear(telB: unknown, motivoB: unknown, u: Usuarios.Usuario): Promise<any[]> {
  const tel = V.telefone(telB, 'o número');
  const motivo = V.texto(motivoB, 'o motivo', 2, 120, 'motivo');
  await Db.q('INSERT INTO bloqueados (telefone, motivo, usuario_id, criado_em) VALUES (?, ?, ?, ?) ON CONFLICT (telefone) DO UPDATE SET motivo = EXCLUDED.motivo, usuario_id = EXCLUDED.usuario_id',
    [tel, motivo, u.id, T.agoraMs()]);
  await L.registrar(u.id, 'bloqueio.criar', 'telefone', tel.slice(-4), { motivo });
  return bloqueados();
}

export async function desbloquear(telB: unknown, u: Usuarios.Usuario): Promise<any[]> {
  const tel = V.telefone(telB, 'o número');
  await Db.q('DELETE FROM bloqueados WHERE telefone = ?', [tel]);
  await L.registrar(u.id, 'bloqueio.remover', 'telefone', tel.slice(-4));
  return bloqueados();
}

/* ------------------------------------------------------------------ criação */

const porChave = async (chave: string): Promise<number> => Number(await Db.valor('SELECT numero FROM pedidos WHERE chave_envio = ?', [chave]) ?? 0);

/** Pedido feito pelo site. Repetir o envio com a mesma chave devolve o mesmo pedido (sem duplicar). */
export async function criarDoSite(d: Record<string, any>): Promise<any> {
  const chave = d.chave ?? null;
  if (typeof chave !== 'string' || !/^[a-f0-9]{32}$/.test(chave)) throw new Erro('Atualize a página e tente de novo.', 400);
  const ja = await porChave(chave);
  if (ja) return publico((await buscar(ja))!, true);

  const ip = L.ip();
  const msgIp = 'Muitos pedidos seguidos deste aparelho. Espere alguns minutos ou chame a loja no WhatsApp.';
  await L.verificar('pedido-ip:' + ip, 10, 900, msgIp);
  await L.contar('pedido-tentativa-ip:' + ip, 30, 900, msgIp);
  if (typeof d.hp === 'string' && d.hp.trim() !== '') throw new Erro('Não conseguimos enviar o pedido. Atualize a página e tente de novo.', 422);
  const sal = L.conferirProva(d.prova ?? null);
  const nome = V.texto(d.nome ?? '', 'o seu nome', 2, 80, 'nome');
  const tel = V.telefone(d.telefone ?? '', 'o seu WhatsApp', 'telefone');
  if (await bloqueado(tel)) throw new Erro('Não conseguimos aceitar pedidos deste número pelo site. Chame a loja no WhatsApp.', 403, 'telefone');
  await L.verificar('pedido-tel:' + tel, 6, 1800, 'Muitos pedidos seguidos com este WhatsApp. Chame a loja no WhatsApp para continuar.');

  const modo = V.opcao(d.modo ?? '', ['entrega', 'retirada'] as const, 'o recebimento', 'modo');
  const end = modo === 'entrega' ? endereco(d.endereco ?? null) : null;
  const forma = V.opcao(d.pagamento ?? '', await formasAceitas(), 'a forma de pagamento', 'pagamento');

  const sit = await Horarios.situacao();
  if (sit.pausada) throw new Erro('Pausamos os pedidos por alguns minutos. Tente de novo daqui a pouco ou chame no WhatsApp.', 409, 'quando', { atualizar: true });
  const quando = V.opcao(d.quando ?? 'agora', ['agora', 'agendar'] as const, 'quando receber', 'quando');
  let agendado: number | null = null;
  if (quando === 'agora') {
    if (!sit.aceitaAgora) throw new Erro('A loja fechou enquanto você pedia. Escolha um horário e deixe o pedido agendado.', 409, 'quando', { atualizar: true });
  } else {
    agendado = await Horarios.validarAgendamento(d.hora ?? null);
  }
  const ass = assinatura(d, modo, end, agendado);
  if (d.repetir !== true) {
    const igual = await pedidoIgual(tel, ass);
    if (igual) {
      if (igual.chave_envio === chave) return publico((await buscar(Number(igual.numero)))!, true);
      const hora = T.hm(Number(igual.criado_em));
      throw new Erro(`Você já fez um pedido igual a este às ${hora} (nº ${igual.numero}).`, 409, 'repetido',
        { repetido: { numero: Number(igual.numero), codigo: String(igual.codigo), hora } });
    }
  }

  let pedido: any;
  try {
    pedido = await Db.tx(async () => {
      await L.usarProva(sal);
      const cot = await Cotacao.calcular(d, tel, true, true);
      const esperado = d.totalEsperado ?? null;
      if (esperado !== null && (!V.numerico(esperado) || Math.round(parseFloat(String(esperado)) * 100) !== cot.total)) {
        throw new Erro('Os valores mudaram desde que você abriu a página. Confira o novo total e confirme de novo.', 409, 'total', { cotacao: Cotacao.publica(cot) });
      }
      const tr = await troco(d.troco ?? null, forma, cot.total);
      const prazo = agendado ? Horarios.rotulo(agendado) : cot.prazo;
      const numero = await gravar({ chave, origem: 'site', nome, telefone: tel, modo, endereco: end, cot, forma, troco: tr, obs: '', prazo, agendado, usuario: null, assinatura: ass });
      return publico((await buscar(numero))!, true);
    });
  } catch (e: any) {
    // dois envios iguais ao mesmo tempo: o segundo encontra o primeiro
    if (Db.duplicada(e)) { const j = await porChave(chave); if (j) return publico((await buscar(j))!, true); }
    // a mesma prova chegou duas vezes ao mesmo tempo (clique duplo): devolve o pedido que a primeira gravou
    if (e instanceof Erro && e.campo === 'prova') { const j = await porChave(chave); if (j) return publico((await buscar(j))!, true); }
    throw e;
  }
  await L.somar('pedido-ip:' + ip, 900);
  await L.somar('pedido-tel:' + tel, 1800);
  return pedido;
}

/** ksort/sort do PHP para a assinatura (textos). */
const ordenar = (a: string[]): string[] => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

function assinatura(d: Record<string, any>, modo: string, end: Record<string, string> | null, agendado: number | null): string {
  const txt = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v).trim().toLowerCase() : '');
  const itens: string[] = [];
  for (const i of Array.isArray(d.itens) ? d.itens : typeof d.itens === 'object' && d.itens ? Object.values(d.itens) : []) {
    if (typeof i !== 'object' || i === null) continue;
    const escolhas: Record<string, string[]> = {};
    const ent = typeof i.escolhas === 'object' && i.escolhas !== null ? Object.entries(i.escolhas) : [];
    for (const [grupo, ops] of ent) {
      const o = Array.isArray(ops) ? ordenar(ops.map(txt)) : [];
      if (o.length) escolhas[String(grupo)] = o;
    }
    const ordenado = Object.fromEntries(ordenar(Object.keys(escolhas)).map(k => [k, escolhas[k]]));
    itens.push(JSON.stringify([txt(i.produtoId ?? ''), V.numerico(i.qtd) ? Math.trunc(Number(i.qtd)) : 0, ordenado, txt(i.obs ?? '')]));
  }
  const local = modo === 'entrega' ? L.chavesEndereco(end, d.area ?? '').endereco : '';
  return crypto.createHash('sha1').update(JSON.stringify([ordenar(itens), modo, local, agendado, Cupons.normalizarCodigo(d.cupom ?? '')])).digest('hex');
}

async function pedidoIgual(tel: string, ass: string): Promise<any | null> {
  return Db.um("SELECT numero, codigo, chave_envio, criado_em FROM pedidos WHERE cliente_telefone = ? AND assinatura = ? AND criado_em >= ? AND status NOT IN ('recusado', 'cancelado') ORDER BY numero DESC LIMIT 1",
    [tel, ass, T.agoraMs() - MINUTOS_REPETIDO * 60_000]);
}

/** Pedido lançado no painel (PED-08). */
export async function criarNoBalcao(d: Record<string, any>, u: Usuarios.Usuario): Promise<any> {
  const cliente: any = typeof d.cliente === 'object' && d.cliente !== null ? d.cliente : {};
  const nome = V.texto(cliente.nome ?? '', 'o nome do cliente', 2, 80, 'np-nome');
  const tel = V.telefone(cliente.telefone ?? '', 'o telefone do cliente', 'np-fone');
  const modo = V.opcao(d.modalidade ?? '', ['entrega', 'retirada'] as const, 'a modalidade');
  let end: Record<string, string> | null = null;
  let area: unknown = null;
  if (modo === 'entrega') {
    end = endereco(d.endereco ?? null);
    area = d.endereco?.area ?? '';
    if (typeof area !== 'string' || area === '') throw new Erro('Escolha o bairro.', 422, 'np-bairro');
  }
  const forma = V.opcao(d.pagamento?.forma ?? '', Object.keys(PAGAMENTOS), 'a forma de pagamento', 'np-pag');
  const obs = V.texto(d.obs ?? '', 'a observação', 0, 300, 'np-obs');
  const itens = V.lista(d.itens ?? null, 'os itens', Cotacao.MAX_LINHAS).map(i => (typeof i === 'object' && i !== null
    ? { produtoId: i.produtoId ?? null, qtd: i.qtd ?? null, escolhas: typeof i.escolhas === 'object' && i.escolhas !== null ? i.escolhas : [], obs: i.obs ?? '' } : []));
  const cupom = Cupons.normalizarCodigo(d.cupom ?? '');
  return Db.tx(async () => {
    let cot: Cotacao.Cot;
    try {
      cot = await Cotacao.calcular({ itens, modo, area, cupom, endereco: end }, tel, cupom !== '', true, true);
    } catch (e) {
      if (e instanceof Erro && e.campo === 'cupom') throw new Erro(e.message, 422, 'np-cupom');
      throw e;
    }
    const tr = forma === 'dinheiro' ? V.centavos(d.pagamento?.trocoPara ?? null, 'o troco', 10_000_000, true, 'np-troco') : null;
    if (tr !== null && tr < cot.total) throw new Erro('O troco precisa ser de pelo menos ' + T.brl(cot.total) + '.', 422, 'np-troco');
    const numero = await gravar({ chave: null, origem: 'balcao', nome, telefone: tel, modo, endereco: end, cot, forma, troco: tr, obs, prazo: cot.prazo, agendado: null, usuario: u.id, assinatura: null });
    await L.registrar(u.id, 'pedido.criar', 'pedido', String(numero));
    return paraAdmin((await buscar(numero))!);
  });
}

async function gravar(x: any): Promise<number> {
  const cot: Cotacao.Cot = x.cot;
  const agora = T.agoraMs();
  const itens = cot.linhas.map(l => ({ produtoId: l.produtoId, nome: l.nome, qtd: l.qtd, preco: l.preco, adicionais: l.adicionais, obs: l.obs, opcoes: l.opcoes }));
  if (x.obs !== '' && itens.length) itens[0].obs = (itens[0].obs + ' ' + x.obs).trim();
  const end = x.endereco ? { ...x.endereco, bairro: cot.area?.nome ?? '', area: cot.area?.id ?? '' } : null;
  const r = await Db.q(
    `INSERT INTO pedidos (codigo, chave_envio, status, origem, cliente_nome, cliente_telefone, modalidade, area_id, endereco, itens, pagamento_forma, troco_para, cupom_codigo, subtotal, desconto, taxa, total, obs, prazo, agendado_para, usuario_id, criado_em, atualizado_em, pagamento_status, assinatura)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING numero`,
    [crypto.randomBytes(8).toString('hex'), x.chave, 'novo', x.origem, x.nome, x.telefone, x.modo, cot.area?.id ?? null,
      end ? JSON.stringify(end) : null, JSON.stringify(itens), x.forma, x.troco, cot.cupom?.codigo ?? null, cot.subtotal, cot.desconto, Number(cot.taxa ?? 0), cot.total,
      x.obs, x.prazo, x.agendado, x.usuario, agora, agora, 'pendente', x.assinatura ?? null]);
  const numero = Number(r.rows[0].numero);
  await gravarItens(numero, itens, agora);
  await Db.q('INSERT INTO pedido_eventos (pedido_numero, status, motivo, usuario_id, em) VALUES (?, ?, ?, ?, ?)', [numero, 'novo', '', x.usuario, agora]);
  if (cot.cupom) {
    await Db.q('UPDATE cupons SET usos = usos + 1 WHERE id = ?', [cot.cupom.id]);
    const local = L.chavesEndereco(x.endereco, cot.area?.id ?? '');
    await Db.q('INSERT INTO cupom_usos (cupom_id, telefone, pedido_numero, em, endereco_chave, predio_chave) VALUES (?, ?, ?, ?, ?, ?)',
      [cot.cupom.id, x.telefone, numero, agora, local.endereco, local.predio]);
  }
  const quando = x.agendado ? ' · agendado ' + Horarios.rotulo(x.agendado).toLowerCase() : '';
  await Db.q('INSERT INTO notificacoes (icone, cor, titulo, texto, rota, pedido, lida, em) VALUES (?, ?, ?, ?, ?, ?, 0, ?)', [
    'receipt', '', 'Novo pedido #' + numero, mbSub(x.nome + ' · ' + (x.modo === 'entrega' ? 'Entrega' : 'Retirada') + ' · ' + T.brl(cot.total) + quando, 0, 200), 'pedidos', numero, agora,
  ]);
  await marcarRev(numero);
  return numero;
}

export async function gravarItens(numero: number, itens: any[], em: number): Promise<void> {
  let k = 0;
  for (const i of itens) {
    if (typeof i !== 'object' || i === null) { k++; continue; }
    const qtd = Math.max(1, Math.trunc(Number(i.qtd ?? 1)) || 0);
    const preco = Math.trunc(Number(i.preco ?? 0)) || 0;
    const adics = Array.isArray(i.adicionais) ? i.adicionais : [];
    const adic = adics.reduce((s: number, a: any) => s + (Math.trunc(Number(a?.preco ?? 0)) || 0), 0);
    const opcoes = String(i.opcoes ?? adics.map((a: any) => String(a?.nome ?? '')).join(' · '));
    await Db.q('INSERT INTO pedido_itens (pedido_numero, linha, produto_id, nome, qtd, preco, adicionais, total, opcoes, obs, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      numero, k, mbSub(String(i.produtoId ?? ''), 0, 60), mbSub(String(i.nome ?? ''), 0, 80), Math.min(qtd, 32000), preco, adic,
      qtd * (preco + adic), mbSub(opcoes, 0, 400), mbSub(String(i.obs ?? ''), 0, 140), em,
    ]);
    k++;
  }
}

/* ------------------------------------------------------------------ leitura */

const jsonOu = (s: unknown, padrao: any): any => { if (typeof s !== 'string' || !s) return padrao; try { return JSON.parse(s) ?? padrao; } catch { return padrao; } };

function montar(r: any, eventos: any[]): any {
  return {
    numero: Number(r.numero), codigo: r.codigo, status: r.status, origem: r.origem,
    nome: r.cliente_nome, telefone: r.cliente_telefone, modo: r.modalidade, area: r.area_id,
    endereco: r.endereco ? jsonOu(r.endereco, null) : null, itens: jsonOu(r.itens, []) || [],
    forma: r.pagamento_forma, troco: r.troco_para === null ? null : Number(r.troco_para), cupom: r.cupom_codigo,
    subtotal: Number(r.subtotal), desconto: Number(r.desconto), taxa: Number(r.taxa), total: Number(r.total),
    obs: r.obs, prazo: r.prazo, agendado: r.agendado_para === null ? null : Number(r.agendado_para),
    criadoEm: Number(r.criado_em), atualizadoEm: Number(r.atualizado_em), eventos, rev: Number(r.rev ?? 0),
    pagamento: {
      status: String(r.pagamento_status ?? 'pendente'), valor: r.pagamento_valor === null || r.pagamento_valor === undefined ? null : Number(r.pagamento_valor),
      forma: r.pagamento_real ?? null, entregador: String(r.pagamento_entregador ?? ''), usuario: r.pagamento_usuario ?? null,
      em: r.pagamento_em === null || r.pagamento_em === undefined ? null : Number(r.pagamento_em), obs: String(r.pagamento_obs ?? ''),
    },
    anonimizado: !!r.anonimizado_em, primeiro: false,
  };
}

/** Vários pedidos com as etapas de cada um e o selo "primeiro pedido deste número" (três consultas no total). */
async function carregar(linhas: any[]): Promise<any[]> {
  if (!linhas.length) return [];
  const nums = linhas.map(r => Number(r.numero));
  const ev: Record<number, any[]> = {};
  for (const e of await Db.todos(`SELECT pedido_numero, status, motivo, usuario_id, em FROM pedido_eventos WHERE pedido_numero IN (${Db.marcas(nums)}) ORDER BY em, id`, nums)) {
    (ev[Number(e.pedido_numero)] ??= []).push({ status: e.status, em: Number(e.em), motivo: e.motivo, usuario: e.usuario_id });
  }
  const fones = [...new Set(linhas.map(r => String(r.cliente_telefone)).filter(Boolean))];
  const primeiro: Record<string, number> = {};
  if (fones.length) {
    for (const x of await Db.todos(`SELECT cliente_telefone AS t, MIN(numero) AS n FROM pedidos WHERE cliente_telefone IN (${Db.marcas(fones)}) AND status <> 'recusado' GROUP BY cliente_telefone`, fones)) {
      primeiro[x.t] = Number(x.n);
    }
  }
  return linhas.map(r => {
    const p = montar(r, ev[Number(r.numero)] ?? []);
    p.primeiro = p.telefone !== '' && (primeiro[p.telefone] ?? 0) === p.numero;
    return p;
  });
}

export async function buscar(numero: number): Promise<any | null> {
  const r = await Db.um('SELECT * FROM pedidos WHERE numero = ?', [numero]);
  return r ? (await carregar([r]))[0] : null;
}

export async function porCodigo(codigo: string): Promise<any | null> {
  if (!/^[a-f0-9]{16}$/.test(codigo)) return null;
  const r = await Db.um('SELECT * FROM pedidos WHERE codigo = ?', [codigo]);
  return r ? (await carregar([r]))[0] : null;
}

export async function porNumeroETelefone(numero: number, telefone: string): Promise<any | null> {
  const r = await Db.um('SELECT * FROM pedidos WHERE numero = ? AND cliente_telefone = ?', [numero, telefone]);
  return r ? (await carregar([r]))[0] : null;
}

/** Pedidos que o painel mostra: os de hoje, os em andamento e os agendados (três consultas indexadas). */
export async function doPainel(): Promise<any[]> {
  const hoje = T.hojeMs();
  const porNumero = new Map<number, any>();
  for (const [sql, p] of [
    ['SELECT * FROM pedidos WHERE criado_em >= ? ORDER BY numero DESC LIMIT 600', [hoje]],
    ["SELECT * FROM pedidos WHERE status IN ('novo', 'confirmado', 'preparo', 'entrega') ORDER BY numero DESC LIMIT 600", []],
    ['SELECT * FROM pedidos WHERE agendado_para >= ? ORDER BY numero DESC LIMIT 600', [hoje]],
  ] as Array<[string, unknown[]]>) {
    for (const r of await Db.todos(sql, p)) porNumero.set(Number(r.numero), r);
  }
  const linhas = [...porNumero.entries()].sort((a, b) => b[0] - a[0]).map(x => x[1]).slice(0, 600);
  return carregar(linhas);
}

export async function novidades(rev: number): Promise<any[]> {
  return carregar(await Db.todos('SELECT * FROM pedidos WHERE rev > ? ORDER BY rev LIMIT 300', [rev]));
}

/* ------------------------------------------------------------------ formatos de saída */

async function nomesUsuarios(): Promise<Record<string, string>> {
  const c = ctx().cache;
  return (c.nomesUsuarios ??= Object.fromEntries((await Db.todos('SELECT id, nome FROM usuarios')).map(r => [r.id, r.nome])));
}

export async function paraAdmin(p: any): Promise<any> {
  const nomes = await nomesUsuarios();
  const pg = p.pagamento;
  return {
    numero: p.numero, status: p.status, origem: p.origem === 'balcao' ? 'balcão' : 'site', rev: p.rev,
    cliente: { nome: p.nome, telefone: foneExibicao(p.telefone) },
    modalidade: p.modo,
    endereco: p.endereco ? {
      rua: p.endereco.rua ?? '', numero: p.endereco.numero ?? '', complemento: p.endereco.complemento ?? '',
      bairro: p.endereco.bairro ?? '', area: p.endereco.area ?? '', referencia: p.endereco.referencia ?? '',
    } : null,
    itens: p.itens.map((i: any) => ({
      produtoId: i.produtoId ?? '', nome: i.nome ?? '', qtd: Math.trunc(Number(i.qtd ?? 1)), preco: T.reais(Math.trunc(Number(i.preco ?? 0))),
      adicionais: (i.adicionais ?? []).map((a: any) => ({ nome: a.nome, preco: T.reais(Math.trunc(Number(a.preco))) })),
      obs: i.obs ?? '',
    })),
    pagamento: {
      forma: p.forma, trocoPara: T.reais(p.troco),
      status: pg.status, valor: T.reais(pg.valor), formaReal: pg.forma, entregador: pg.entregador,
      por: pg.usuario ? (nomes[pg.usuario] ?? 'Usuário removido') : null, em: pg.em, obs: pg.obs,
    },
    cupom: p.cupom, subtotal: T.reais(p.subtotal), desconto: T.reais(p.desconto),
    taxa: T.reais(p.taxa), total: T.reais(p.total), obs: p.obs, prazo: p.prazo,
    agendadoPara: p.agendado, agendadoRotulo: p.agendado ? Horarios.rotulo(p.agendado) : null,
    criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm, primeiroPedido: p.primeiro, anonimizado: p.anonimizado,
    eventos: p.eventos.map((e: any) => Object.fromEntries(Object.entries({ status: e.status, em: e.em, motivo: e.motivo,
      por: e.usuario ? (nomes[e.usuario] ?? 'Usuário removido') : '' }).filter(([, v]) => v !== ''))),
  };
}

export function linkVencido(p: any): boolean {
  if (ATIVOS.includes(p.status) || !p.eventos.length) return false;
  const fim = p.eventos[p.eventos.length - 1].em;
  return T.agoraMs() - fim > DIAS_LINK * 86_400_000;
}

/** O que o cliente vê no acompanhamento (sem "completo": primeiro nome, WhatsApp escondido e só o bairro). */
export function publico(p: any, completo = false): any {
  const ultimo = p.eventos.length ? p.eventos[p.eventos.length - 1] : null;
  const primeiroNome = String(p.nome).trim().split(/\s+/u)[0] ?? '';
  return {
    numero: p.numero, codigo: p.codigo, criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm,
    status: SITE[p.status] ?? 'recebido',
    eventos: p.eventos.map((e: any) => ({ status: SITE[e.status] ?? e.status, em: e.em })),
    motivo: FINAIS.includes(p.status) ? (ultimo?.motivo ?? '') : '',
    agendadoPara: p.agendado ? Horarios.rotulo(p.agendado) : null, agendadoEm: p.agendado,
    cliente: completo ? { nome: p.nome, whats: foneExibicao(p.telefone) } : { nome: primeiroNome, whats: foneMascarado(p.telefone) },
    modo: p.modo, area: p.endereco?.bairro ?? null, prazo: p.prazo,
    endereco: completo && p.endereco ? { rua: p.endereco.rua ?? '', numero: p.endereco.numero ?? '', complemento: p.endereco.complemento ?? '', referencia: p.endereco.referencia ?? '' } : null,
    enderecoOculto: !completo && p.endereco !== null, completo,
    pagamento: { forma: p.forma, nome: PAGAMENTOS[p.forma] ?? p.forma, troco: p.troco ? T.brl(p.troco) : null },
    itens: p.itens.map((i: any) => ({
      nome: i.nome ?? '', qtd: Math.trunc(Number(i.qtd ?? 1)),
      unit: T.reais(Math.trunc(Number(i.preco ?? 0)) + (i.adicionais ?? []).reduce((s: number, a: any) => s + Math.trunc(Number(a.preco)), 0)),
      opcoes: i.opcoes ?? (i.adicionais ?? []).map((a: any) => a.nome).join(' · '), obs: completo ? (i.obs ?? '') : '',
    })),
    cupom: p.cupom,
    totais: { subtotal: T.reais(p.subtotal), desconto: T.reais(p.desconto), taxa: T.reais(p.taxa), total: T.reais(p.total) },
  };
}

/* ------------------------------------------------------------------ etapas */

export async function mudarStatus(numero: number, paraB: unknown, motivo: unknown, u: Usuarios.Usuario): Promise<any> {
  const para = V.opcao(paraB, [...ETAPAS, ...FINAIS], 'a etapa');
  return Db.tx(async () => {
    const r = await Db.um('SELECT numero, status, cupom_codigo FROM pedidos WHERE numero = ? FOR UPDATE', [numero]);
    if (!r) throw new Erro(`Pedido #${numero} não encontrado.`, 404);
    const de = r.status;
    if (de === para) return paraAdmin((await buscar(numero))!);
    if (para === 'cancelado' && de === 'concluido' && !(await Usuarios.gerente(u))) {
      throw new Erro(`Só um gerente pode cancelar o pedido #${numero} depois de concluído.`, 403, null, { pedido: await paraAdmin((await buscar(numero))!) });
    }
    const ok = para === 'recusado' ? de === 'novo'
      : para === 'cancelado' ? ['confirmado', 'preparo', 'entrega', 'concluido'].includes(de)
        : ATIVOS.includes(de) && ETAPAS.indexOf(para) > ETAPAS.indexOf(de);
    if (!ok) throw new Erro(`O pedido #${numero} já está como "${NOMES[de]}". A tela foi atualizada.`, 409, null, { pedido: await paraAdmin((await buscar(numero))!) });
    const mot = FINAIS.includes(para) ? V.texto(motivo, 'o motivo', 2, 120) : '';
    const agora = T.agoraMs();
    await Db.q('UPDATE pedidos SET status = ?, atualizado_em = ? WHERE numero = ?', [para, agora, numero]);
    await Db.q('INSERT INTO pedido_eventos (pedido_numero, status, motivo, usuario_id, em) VALUES (?, ?, ?, ?, ?)', [numero, para, mot, u.id, agora]);
    if (FINAIS.includes(para) && r.cupom_codigo) await Db.q('UPDATE cupons SET usos = GREATEST(usos - 1, 0) WHERE codigo = ? AND arquivado_em IS NULL', [r.cupom_codigo]);
    await L.registrar(u.id, 'pedido.' + para, 'pedido', String(numero), L.filtrar({ motivo: mot, antes: de === 'concluido' ? 'concluido' : '' }));
    await marcarRev(numero);
    return paraAdmin((await buscar(numero))!);
  });
}

/* ------------------------------------------------------------------ pagamento (sem pagamento online) */

export async function registrarPagamento(numero: number, d: Record<string, any>, u: Usuarios.Usuario): Promise<any> {
  const sit = V.opcao(d.situacao ?? '', ['recebido', 'pendente', 'estornado'] as const, 'a situação do pagamento');
  return Db.tx(async () => {
    const r = await Db.um('SELECT * FROM pedidos WHERE numero = ? FOR UPDATE', [numero]);
    if (!r) throw new Erro(`Pedido #${numero} não encontrado.`, 404);
    const de = String(r.pagamento_status);
    const atual = async () => ({ pedido: await paraAdmin((await buscar(numero))!) });
    const agora = T.agoraMs();
    if (sit === 'recebido') {
      if (de === 'recebido') throw new Erro(`O pagamento do pedido #${numero} já está registrado. A tela foi atualizada.`, 409, null, await atual());
      if (r.status === 'recusado') throw new Erro(`O pedido #${numero} foi recusado: não há pagamento para registrar.`, 422);
      const total = Number(r.total);
      const valor = V.centavosN(d.valor ?? null, 'o valor recebido', Math.max(10_000_000, total * 10), 'pg-valor');
      if (valor < 1) throw new Erro('Informe o valor recebido.', 422, 'pg-valor');
      const forma = V.opcao(d.forma ?? '', Object.keys(PAGAMENTOS), 'a forma usada', 'pg-forma');
      const entregador = V.texto(d.entregador ?? '', 'o entregador', 0, 60, 'pg-entregador');
      const obs = V.texto(d.obs ?? '', 'a observação', 0, 120, 'pg-obs');
      if (valor !== total && obs === '') throw new Erro('O valor recebido é diferente do total. Escreva o motivo na observação.', 422, 'pg-obs');
      await Db.q("UPDATE pedidos SET pagamento_status = 'recebido', pagamento_valor = ?, pagamento_real = ?, pagamento_entregador = ?, pagamento_usuario = ?, pagamento_em = ?, pagamento_obs = ?, atualizado_em = ? WHERE numero = ?",
        [valor, forma, entregador, u.id, agora, obs, agora, numero]);
      await L.registrar(u.id, 'pagamento.receber', 'pedido', String(numero), L.filtrar({ valor, forma, entregador, obs }));
    } else {
      if (!(await Usuarios.gerente(u))) throw new Erro(sit === 'estornado' ? 'Só um gerente pode registrar estorno.' : 'Só um gerente pode desfazer um pagamento registrado.', 403);
      if (de !== 'recebido') throw new Erro(`O pagamento do pedido #${numero} não está como recebido. A tela foi atualizada.`, 409, null, await atual());
      const obs = V.texto(d.obs ?? '', 'o motivo', sit === 'estornado' ? 2 : 0, 120, 'pg-obs');
      if (sit === 'estornado') {
        await Db.q("UPDATE pedidos SET pagamento_status = 'estornado', pagamento_usuario = ?, pagamento_em = ?, pagamento_obs = ?, atualizado_em = ? WHERE numero = ?", [u.id, agora, obs, agora, numero]);
      } else {
        await Db.q("UPDATE pedidos SET pagamento_status = 'pendente', pagamento_valor = NULL, pagamento_real = NULL, pagamento_entregador = '', pagamento_usuario = NULL, pagamento_em = NULL, pagamento_obs = '', atualizado_em = ? WHERE numero = ?", [agora, numero]);
      }
      await L.registrar(u.id, sit === 'estornado' ? 'pagamento.estornar' : 'pagamento.desfazer', 'pedido', String(numero), L.filtrar({ motivo: obs }));
    }
    await marcarRev(numero);
    return paraAdmin((await buscar(numero))!);
  });
}

export async function entregadores(): Promise<string[]> {
  return (await Db.todos("SELECT pagamento_entregador AS e, MAX(pagamento_em) AS m FROM pedidos WHERE pagamento_entregador <> '' AND pagamento_em >= ? GROUP BY pagamento_entregador ORDER BY m DESC LIMIT 30",
    [T.agoraMs() - 60 * 86_400_000])).map(r => r.e);
}

/* ------------------------------------------------------------------ caixa do dia */

const janelaDia = (dia: string): [number, number] => [T.inicioDoDiaMs(dia), T.inicioDoDiaMs(T.somarDias(dia, 1))];

function resumo(r: any, nomes: Record<string, string>): any {
  const partes = String(r.cliente_nome).trim().split(/\s+/u);
  return {
    numero: Number(r.numero), status: r.status, cliente: (partes[0] ?? '') + (partes.length > 1 ? ' ' + [...partes[partes.length - 1]][0] + '.' : ''),
    telefone: r.anonimizado_em ? '' : foneExibicao(String(r.cliente_telefone)), modalidade: r.modalidade,
    total: T.reais(Number(r.total)), forma: r.pagamento_forma, criadoEm: Number(r.criado_em),
    pagamento: {
      status: r.pagamento_status, valor: T.reais(r.pagamento_valor === null || r.pagamento_valor === undefined ? null : Number(r.pagamento_valor)),
      forma: r.pagamento_real, entregador: r.pagamento_entregador, em: r.pagamento_em === null ? null : Number(r.pagamento_em),
      por: r.pagamento_usuario ? (nomes[r.pagamento_usuario] ?? 'Usuário removido') : null, obs: r.pagamento_obs,
    },
    anonimizado: !!r.anonimizado_em,
  };
}

export async function caixa(diaB: unknown): Promise<any> {
  const dia = diaB === null || diaB === undefined || diaB === '' ? T.hojeIso() : V.data(diaB, 'o dia');
  const [ini, fim] = janelaDia(dia);
  const nomes = await nomesUsuarios();
  const recebidos = await Db.todos("SELECT * FROM pedidos WHERE pagamento_status = 'recebido' AND pagamento_em >= ? AND pagamento_em < ? ORDER BY pagamento_em", [ini, fim]);
  const estornos = await Db.todos("SELECT * FROM pedidos WHERE pagamento_status = 'estornado' AND pagamento_em >= ? AND pagamento_em < ? ORDER BY pagamento_em", [ini, fim]);
  const pendentes = await Db.todos("SELECT * FROM pedidos WHERE pagamento_status = 'pendente' AND status NOT IN ('recusado', 'cancelado') AND criado_em >= ? AND criado_em < ? ORDER BY numero", [ini, fim]);
  const antigos = Number(await Db.valor("SELECT COUNT(*) FROM pedidos WHERE pagamento_status = 'pendente' AND status NOT IN ('recusado', 'cancelado') AND criado_em < ? AND criado_em >= ?", [ini, ini - 30 * 86_400_000]));
  const porForma: Record<string, number> = Object.fromEntries(Object.keys(PAGAMENTOS).map(f => [f, 0]));
  const porEntregador = new Map<string, { nome: string; pedidos: number; total: number }>();
  let diferenca = 0;
  for (const r of recebidos) {
    const v = Number(r.pagamento_valor);
    porForma[r.pagamento_real] = (porForma[r.pagamento_real] ?? 0) + v;
    const e = r.pagamento_entregador !== '' ? r.pagamento_entregador : (r.modalidade === 'retirada' ? 'Balcão' : 'Sem entregador');
    if (!porEntregador.has(e)) porEntregador.set(e, { nome: e, pedidos: 0, total: 0 });
    const x = porEntregador.get(e)!;
    x.pedidos++;
    x.total += v;
    diferenca += v - Number(r.total);
  }
  const ents = [...porEntregador.values()].sort((a, b) => b.total - a.total);
  const soma = (l: any[], c: string): number => l.reduce((s, r) => s + Number(r[c]), 0);
  return {
    dia,
    recebido: T.reais(soma(recebidos, 'pagamento_valor')),
    porForma: Object.entries(porForma).map(([f, v]) => ({ forma: f, nome: PAGAMENTOS[f] ?? f, total: T.reais(v) })),
    porEntregador: ents.map(e => ({ nome: e.nome, pedidos: e.pedidos, total: T.reais(e.total) })),
    diferenca: T.reais(diferenca),
    aReceber: T.reais(soma(pendentes, 'total')), pendentesAntigos: antigos,
    estornado: T.reais(soma(estornos, 'pagamento_valor')),
    recebidos: recebidos.map(r => resumo(r, nomes)),
    pendentes: pendentes.map(r => resumo(r, nomes)),
    estornos: estornos.map(r => resumo(r, nomes)),
  };
}

/* ------------------------------------------------------------------ histórico (PED-05) */

export async function historico(f: Record<string, any>): Promise<any> {
  const onde: string[] = [];
  const p: unknown[] = [];
  const de = (f.de ?? '') !== '' ? V.data(f.de, 'a data inicial') : T.somarDias(T.hojeIso(), -30);
  const ate = (f.ate ?? '') !== '' ? V.data(f.ate, 'a data final') : T.hojeIso();
  if (ate < de) throw new Erro('A data final precisa ser depois da inicial.', 422);
  const [ini] = janelaDia(de);
  const [, fim] = janelaDia(ate);
  onde.push('criado_em >= ? AND criado_em < ?');
  p.push(ini, fim);
  const q = (typeof f.q === 'string' ? f.q : '').trim();
  let tipo = '';
  if (q !== '') {
    const dig = q.replace(/\D/g, '');
    if (dig !== '' && dig === q.replace(/[\s#()-]/g, '') && dig.length <= 8) {
      onde.push('numero = ?'); p.push(parseInt(dig, 10)); tipo = 'numero';
    } else if (dig.length >= 10 && dig.length <= 13) {
      onde.push('cliente_telefone = ?'); p.push(V.telefone(dig)); tipo = 'telefone';
    } else {
      // ILIKE: no MySQL a comparação ignorava maiúsculas (colação unicode_ci)
      onde.push("cliente_nome ILIKE ? ESCAPE '\\'"); p.push('%' + mbSub(q, 0, 60).replace(/[\\%_]/g, m => '\\' + m) + '%'); tipo = 'nome';
    }
  }
  const status = String(f.status ?? '');
  if (status !== '' && status !== 'todos') { onde.push('status = ?'); p.push(V.opcao(status, [...ETAPAS, ...FINAIS], 'a etapa')); }
  const pag = String(f.pagamento ?? '');
  if (pag !== '' && pag !== 'todos') { onde.push('pagamento_status = ?'); p.push(V.opcao(pag, SITUACOES_PAGAMENTO, 'a situação do pagamento')); }
  const pagina = Math.max(1, Math.trunc(Number(f.pagina ?? 1)) || 1);
  const por = 25;
  const where = onde.join(' AND ');
  const total = Number(await Db.valor(`SELECT COUNT(*) FROM pedidos WHERE ${where}`, p));
  const somaT = Number(await Db.valor(`SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE ${where} AND status NOT IN ('recusado', 'cancelado')`, p));
  const linhas = await Db.todos(`SELECT * FROM pedidos WHERE ${where} ORDER BY numero DESC LIMIT ${por} OFFSET ${(pagina - 1) * por}`, p);
  const nomes = await nomesUsuarios();
  return { de, ate, tipo, total, soma: T.reais(somaT), pagina, paginas: Math.max(1, Math.ceil(total / por)), itens: linhas.map(r => resumo(r, nomes)) };
}

/* ------------------------------------------------------------------ titular dos dados (LGPD-03) */

export async function cliente(telB: unknown): Promise<any> {
  const tel = V.telefone(telB, 'o WhatsApp do cliente', 'cl-fone');
  const r = await Db.um("SELECT COUNT(*) AS n, MIN(criado_em) AS primeiro, MAX(criado_em) AS ultimo, COALESCE(SUM(CASE WHEN status NOT IN ('recusado', 'cancelado') THEN total ELSE 0 END), 0) AS gasto FROM pedidos WHERE cliente_telefone = ?", [tel]);
  const nomes = (await Db.todos('SELECT DISTINCT cliente_nome FROM pedidos WHERE cliente_telefone = ? LIMIT 10', [tel])).map(x => x.cliente_nome);
  return { telefone: foneExibicao(tel), pedidos: Number(r.n), primeiro: r.primeiro === null ? null : Number(r.primeiro),
    ultimo: r.ultimo === null ? null : Number(r.ultimo), gasto: T.reais(Number(r.gasto)), nomes,
    cupons: Number(await Db.valor('SELECT COUNT(*) FROM cupom_usos WHERE telefone = ?', [tel])), bloqueado: await bloqueado(tel) };
}

export async function exportar(telB: unknown): Promise<any> {
  const tel = V.telefone(telB, 'o WhatsApp do cliente', 'cl-fone');
  const loja = await Config.obj('loja');
  const pedidos = await carregar(await Db.todos('SELECT * FROM pedidos WHERE cliente_telefone = ? ORDER BY numero', [tel]));
  return {
    loja: { nome: String(loja.nome ?? ''), cnpj: String(loja.cnpj ?? '') },
    geradoEm: T.isoHm(T.agoraMs()), whatsapp: foneExibicao(tel),
    pedidos: pedidos.map(p => ({
      numero: p.numero, feitoEm: T.isoHm(p.criadoEm), situacao: NOMES[p.status] ?? p.status,
      nome: p.nome, recebimento: p.modo, endereco: p.endereco,
      itens: p.itens.map((i: any) => ({ qtd: i.qtd ?? 1, nome: i.nome ?? '', opcoes: i.opcoes ?? '', obs: i.obs ?? '' })),
      total: T.brl(p.total), pagamento: PAGAMENTOS[p.forma] ?? p.forma, cupom: p.cupom, observacao: p.obs,
    })),
  };
}

/** Apaga os dados pessoais dos pedidos e mantém os valores para a contabilidade. */
export async function anonimizarLinhas(numeros: number[], usuario: string | null, motivo: string): Promise<number> {
  let n = 0;
  for (let i = 0; i < numeros.length; i += 100) {
    const lote = numeros.slice(i, i + 100);
    await Db.tx(async () => {
      for (const r of await Db.todos(`SELECT numero, endereco, itens FROM pedidos WHERE numero IN (${Db.marcas(lote)}) AND anonimizado_em IS NULL FOR UPDATE`, lote)) {
        const e = r.endereco ? jsonOu(r.endereco, null) : null;
        const end = e && typeof e === 'object' ? JSON.stringify({ rua: '', numero: '', complemento: '', referencia: '', bairro: String(e.bairro ?? ''), area: String(e.area ?? '') }) : null;
        const itens = jsonOu(r.itens, []) || [];
        for (const it of Array.isArray(itens) ? itens : []) if (it && typeof it === 'object') it.obs = '';
        const agora = T.agoraMs();
        await Db.q("UPDATE pedidos SET cliente_nome = 'Cliente anonimizado', cliente_telefone = '', endereco = ?, itens = ?, obs = '', chave_envio = NULL, assinatura = NULL, anonimizado_em = ?, atualizado_em = ? WHERE numero = ?",
          [end, JSON.stringify(itens), agora, agora, Number(r.numero)]);
        await Db.q("UPDATE pedido_itens SET obs = '' WHERE pedido_numero = ?", [Number(r.numero)]);
        await Db.q("UPDATE cupom_usos SET telefone = '', endereco_chave = '', predio_chave = '' WHERE pedido_numero = ?", [Number(r.numero)]);
        await marcarRev(Number(r.numero));
        n++;
      }
    });
  }
  if (n) await L.registrar(usuario, 'lgpd.anonimizar', 'pedido', '', { pedidos: n, motivo });
  return n;
}

export async function anonimizarCliente(telB: unknown, u: Usuarios.Usuario): Promise<{ anonimizados: number }> {
  const tel = V.telefone(telB, 'o WhatsApp do cliente', 'cl-fone');
  const abertos = Number(await Db.valor("SELECT COUNT(*) FROM pedidos WHERE cliente_telefone = ? AND status IN ('novo', 'confirmado', 'preparo', 'entrega')", [tel]));
  if (abertos) throw new Erro('Este WhatsApp tem ' + abertos + ' pedido(s) em andamento. Conclua ou cancele antes de anonimizar.', 422, 'cl-fone');
  const nums = (await Db.todos('SELECT numero FROM pedidos WHERE cliente_telefone = ? AND anonimizado_em IS NULL', [tel])).map(r => Number(r.numero));
  return { anonimizados: await anonimizarLinhas(nums, u.id, 'pedido do titular') };
}

export async function anonimizarAntigos(limite = 100): Promise<number> {
  let meses = Math.trunc(Number((await Config.obj('privacidade')).prazoMeses ?? 24));
  if (meses < 6) meses = 24;
  const corte = T.somarMeses(T.agoraMs(), -meses);
  const nums = (await Db.todos(`SELECT numero FROM pedidos WHERE criado_em < ? AND anonimizado_em IS NULL AND status IN ('concluido', 'recusado', 'cancelado') ORDER BY numero LIMIT ${Math.max(1, limite)}`, [corte])).map(r => Number(r.numero));
  return nums.length ? anonimizarLinhas(nums, null, `prazo de guarda de ${meses} meses`) : 0;
}
