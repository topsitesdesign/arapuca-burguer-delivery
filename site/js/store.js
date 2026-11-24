/*
  Estado do site no navegador: carrinho, tema, pedidos feitos neste aparelho e conversa com o servidor.
  Os preços aqui servem só para mostrar: o servidor (PHP) recalcula produtos, adicionais, desconto, taxa e total
  a partir do banco antes de gravar o pedido.
*/
import { LOJA, AREAS, PRODUTOS, GRUPOS, AGORA } from './data.js';

const K_CARRINHO = 'brasa:carrinho';
const K_TEMA = 'brasa:tema';
const K_PEDIDOS = 'brasa:pedidos-feitos';

const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado: segue sem salvar */ } };

/* ---------- servidor ---------- */
const csrf = () => document.querySelector('meta[name="csrf"]')?.content || '';
export class ErroApi extends Error {
  constructor(msg, status, dados) { super(msg); this.status = status; this.dados = dados || {}; }
}
export async function api(url, dados, metodo = dados === undefined ? 'GET' : 'POST') {
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: { Accept: 'application/json', ...(metodo === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : {}) },
      body: metodo === 'POST' ? JSON.stringify(dados ?? {}) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi('Sem conexão com a internet. Confira o sinal e tente de novo.', 0);
  }
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok || !j || j.ok === false) throw new ErroApi(j?.erro || 'Não deu certo agora. Tente de novo em instantes.', r.status, j);
  return j;
}

/* ---------- dinheiro e textos ---------- */
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = v => moeda.format(Math.round(v * 100) / 100).replace(/ /g, ' ');
export const r2 = v => Math.round(v * 100) / 100;
const centavos = v => Math.round((Number(v) || 0) * 100);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const digitos = v => String(v || '').replace(/\D/g, '');
export function mascaraFone(v) {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export const foneOk = v => { const n = digitos(v).length; return n === 10 || n === 11; };

/* ---------- horário de funcionamento (fuso de Brasília) ---------- */
export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const minutos = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const hora = hhmm => { const [h, m] = hhmm.split(':'); return `${+h}h${m !== '00' ? m : ''}`; };
// diferença entre o relógio do aparelho e o do servidor (o servidor manda a hora certa em data.js)
const desvio = Number.isFinite(AGORA) ? AGORA - Date.now() : 0;
export const agora = () => Date.now() + desvio;
const partes = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: LOJA.fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
  .formatToParts(d).map(x => [x.type, x.value]));
export function agoraBrasilia(d = new Date(agora())) {
  const p = partes(d);
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), min: (+p.hour % 24) * 60 + +p.minute, iso: `${p.year}-${p.month}-${p.day}` };
}
const isoMais = (iso, k) => { const [a, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(a, m - 1, d + k)); return t.toISOString().slice(0, 10); };
const diaDaSemana = iso => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
/* janela de um dia: [abre, fecha] em minutos desde 00:00 daquele dia (fecha pode passar de 24h) ou null */
function janela(iso) {
  const ex = LOJA.excecoes || {};
  const h = Object.prototype.hasOwnProperty.call(ex, iso) ? ex[iso] : LOJA.horarios[diaDaSemana(iso)];
  if (!h) return null;
  const a = minutos(h[0]);
  let f = minutos(h[1]);
  if (f <= a) f += 1440;
  return [a, f];
}
/* janelas de ontem até daqui a 8 dias, em minutos contados a partir de 00:00 de hoje */
function janelas() {
  const { iso } = agoraBrasilia();
  const lista = [];
  for (let k = -1; k <= 8; k++) {
    const j = janela(isoMais(iso, k));
    if (j) lista.push({ k, iso: isoMais(iso, k), abre: k * 1440 + j[0], fecha: k * 1440 + j[1] });
  }
  return lista;
}
export function statusLoja() {
  const { min } = agoraBrasilia();
  const js = janelas();
  const atual = js.find(j => min >= j.abre && min < j.fecha);
  const prox = js.find(j => j.abre > min);
  const abre = prox ? (() => {
    const as = `${String(Math.floor((prox.abre - prox.k * 1440) / 60)).padStart(2, '0')}:${String((prox.abre - prox.k * 1440) % 60).padStart(2, '0')}`;
    const quando = prox.k === 0 ? 'hoje' : prox.k === 1 ? 'amanhã' : DIAS[diaDaSemana(prox.iso)];
    return { k: prox.k, quando, as };
  })() : null;
  if (LOJA.pausaManual) return { aberto: false, pausado: true, agendar: false, curto: 'Pausado', texto: 'Pedidos pausados por alguns minutos', abre };
  if (atual && !LOJA.fechadaPainel) {
    const f = atual.fecha % 1440;
    const ate = `${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`;
    return { aberto: true, agendar: true, curto: 'Aberto', texto: `Aberto até ${hora(ate)}` };
  }
  if (abre) return { aberto: false, agendar: true, curto: 'Fechado', texto: `Fechado · abre ${abre.quando} às ${hora(abre.as)}`, abre };
  return { aberto: false, agendar: false, curto: 'Fechado', texto: 'Fechado' };
}
/* horários para agendar: de 30 em 30 min, a partir de 45 min, no primeiro dia que ainda tiver horário */
export function horariosAgendamento() {
  const { min } = agoraBrasilia();
  const lead = LOJA.antecedencia || 45;
  const lista = [];
  for (const j of janelas()) {
    if (lista.length && j.k !== lista[0].k) break;
    for (let t = j.abre + 30; t <= j.fecha; t += 30) {
      if (t < min + lead) continue;
      const k = Math.floor(t / 1440), dentro = t - k * 1440;
      const iso = isoMais(agoraBrasilia().iso, k);
      const hh = String(Math.floor(dentro / 60)).padStart(2, '0'), mm = String(dentro % 60).padStart(2, '0');
      const nome = k === 0 ? 'Hoje' : k === 1 ? 'Amanhã' : DIAS[diaDaSemana(iso)][0].toUpperCase() + DIAS[diaDaSemana(iso)].slice(1);
      lista.push({ k: j.k, valor: `${iso} ${hh}:${mm}`, rotulo: `${nome}, ${hora(`${hh}:${mm}`)}` });
    }
    if (lista.length) break;
  }
  return lista;
}

/* ---------- carrinho ---------- */
const vazio = () => ({ itens: [], cupom: null, modo: LOJA.entrega === false ? 'retirada' : 'entrega', area: null });
const produtoPorId = id => PRODUTOS.find(p => p.id === id);

/* preço unitário de um item montado: preço base + opções escolhidas (em centavos, sem erro de arredondamento) */
export function precoUnitario(prod, escolhas = {}) {
  let c = centavos(prod.preco);
  for (const gid of prod.grupos) {
    const g = GRUPOS[gid];
    for (const oid of escolhas[gid] || []) {
      const o = g?.opcoes.find(x => x.id === oid);
      if (o) c += centavos(o.preco);
    }
  }
  return c / 100;
}
/* o item ainda vale com o cardápio de agora? (produto à venda e opções que existem) */
function itemValido(i) {
  const p = produtoPorId(i.produtoId);
  if (!p) return false;
  for (const [gid, sel] of Object.entries(i.escolhas || {})) {
    if (!sel?.length) continue;
    const g = GRUPOS[gid];
    if (!g || !p.grupos.includes(gid) || sel.length > g.max || sel.some(oid => !g.opcoes.some(o => o.id === oid))) return false;
  }
  return p.grupos.every(gid => (i.escolhas?.[gid] || []).length >= GRUPOS[gid].min);
}
function carregar() {
  const c = { ...vazio(), ...ler(K_CARRINHO, {}) };
  const antes = c.itens.length;
  c.itens = (Array.isArray(c.itens) ? c.itens : []).filter(itemValido).map(i => {
    const p = produtoPorId(i.produtoId);
    return { ...i, nome: p.nome, foto: p.foto, remover: [], unit: precoUnitario(p, i.escolhas) };
  });
  if (c.area && !AREAS.some(a => a.id === c.area)) c.area = null;
  if (c.modo === 'entrega' && LOJA.entrega === false) c.modo = 'retirada';
  if (c.modo === 'retirada' && LOJA.retirada === false) c.modo = 'entrega';
  if (c.cupom && typeof c.cupom !== 'object') c.cupom = null;
  c.mudou = c.itens.length < antes;
  return c;
}
let carrinho = carregar();
export const itensQueSairam = () => { const m = carrinho.mudou; carrinho.mudou = false; return m; };
const ouvintes = new Set();
export const aoMudar = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const avisar = () => { gravar(K_CARRINHO, { itens: carrinho.itens, cupom: carrinho.cupom, modo: carrinho.modo, area: carrinho.area }); ouvintes.forEach(fn => fn(carrinho)); };
// outra aba mudou o carrinho
window.addEventListener('storage', e => { if (e.key === K_CARRINHO) { carrinho = carregar(); ouvintes.forEach(fn => fn(carrinho)); } });

export const getCarrinho = () => carrinho;

/* resumo legível das escolhas de um item */
export function resumoEscolhas(item) {
  const prod = produtoPorId(item.produtoId);
  const partes = [];
  if (prod) {
    for (const gid of prod.grupos) {
      const g = GRUPOS[gid];
      const nomes = (item.escolhas[gid] || []).map(oid => g.opcoes.find(o => o.id === oid)?.nome).filter(Boolean);
      if (nomes.length) partes.push(nomes.join(', '));
    }
  }
  return partes.join(' · ');
}

export function adicionarItem({ produtoId, qtd = 1, escolhas = {}, obs = '' }) {
  const prod = produtoPorId(produtoId);
  if (!prod) return;
  const limpo = Object.fromEntries(Object.entries(escolhas).filter(([, v]) => v?.length));
  const chave = JSON.stringify([produtoId, limpo, obs.trim()]);
  const igual = carrinho.itens.find(i => i.chave === chave);
  if (igual) igual.qtd = Math.min(20, igual.qtd + qtd);
  else carrinho.itens.push({ uid: Math.random().toString(36).slice(2, 9), chave, produtoId, nome: prod.nome, foto: prod.foto, qtd, escolhas: limpo, remover: [], obs: obs.trim(), unit: precoUnitario(prod, limpo) });
  avisar();
}
export function mudarQtd(uid, delta) {
  const it = carrinho.itens.find(i => i.uid === uid);
  if (!it) return;
  it.qtd += delta;
  if (it.qtd <= 0) carrinho.itens = carrinho.itens.filter(i => i.uid !== uid);
  else it.qtd = Math.min(20, it.qtd);
  avisar();
}
export function removerItem(uid) { carrinho.itens = carrinho.itens.filter(i => i.uid !== uid); avisar(); }
export function removerProduto(produtoId) { carrinho.itens = carrinho.itens.filter(i => i.produtoId !== produtoId); avisar(); }
export function limparCarrinho() { carrinho = { ...vazio(), modo: carrinho.modo, area: carrinho.area }; avisar(); }
export function setModo(modo) { carrinho.modo = modo === 'retirada' ? 'retirada' : 'entrega'; avisar(); }
export function setArea(id) { carrinho.area = AREAS.some(a => a.id === id) ? id : null; avisar(); }

/* itens no formato que o servidor recebe */
export const itensParaEnvio = (c = carrinho) => c.itens.map(i => ({ produtoId: i.produtoId, qtd: i.qtd, escolhas: i.escolhas, obs: i.obs }));

/* o servidor confere o cupom com as regras do painel (validade, limite, mínimo, uso por WhatsApp) */
export async function aplicarCupom(codigo, telefone = '') {
  const cod = String(codigo || '').trim().toUpperCase();
  if (!cod) return { ok: false, msg: 'Digite o código do cupom.' };
  try {
    const r = await api('api/cupom', { codigo: cod, telefone, itens: itensParaEnvio(), modo: carrinho.modo, area: carrinho.area });
    carrinho.cupom = r.cupom;
    avisar();
    return { ok: true, msg: `Cupom ${r.cupom.codigo} aplicado: ${r.cupom.rotulo}.`, cupom: r.cupom };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}
export function removerCupom() { carrinho.cupom = null; avisar(); }

/* conta local, só para mostrar (o servidor refaz tudo em centavos) */
export function totais(c = carrinho) {
  const itens = c.itens.reduce((n, i) => n + i.qtd, 0);
  const sub = c.itens.reduce((s, i) => s + centavos(i.unit) * i.qtd, 0);
  const cupom = c.cupom || null;
  const area = AREAS.find(a => a.id === c.area) || null;
  let taxa = c.modo === 'retirada' ? 0 : area ? centavos(area.taxa) : null;
  let desc = 0;
  if (cupom && sub > 0 && sub >= centavos(cupom.minimo || 0)) {
    if (cupom.tipo === 'percentual') desc = Math.round(sub * cupom.valor / 100);
    else if (cupom.tipo === 'fixo') desc = Math.min(centavos(cupom.valor), sub);
    else if (cupom.tipo === 'frete' && c.modo === 'entrega' && taxa !== null) taxa = 0;
  }
  const taxaMin = AREAS.length ? Math.min(...AREAS.map(a => a.taxa)) : 0;
  return { itens, subtotal: sub / 100, cupom, desconto: desc / 100, area, taxa: taxa === null ? null : taxa / 100, total: (sub - desc + (taxa || 0)) / 100, taxaMin };
}

/* ---------- tema ---------- */
export const temaAtual = () => document.documentElement.dataset.theme === 'light' ? 'claro' : 'escuro';
export function aplicarTema(t) {
  document.documentElement.dataset.theme = t === 'claro' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = '#0d0a08'; // o cabeçalho é escuro nos dois temas
  gravar(K_TEMA, t);
}

/* ---------- pedidos feitos neste aparelho (só número, código e total; os dados ficam no servidor) ---------- */
/* a lista do aparelho guarda 30 dias: depois disso o pedido sai daqui (os dados continuam só na loja) */
export const pedidosFeitos = () => Object.values(ler(K_PEDIDOS, {})).filter(p => Date.now() - p.criadoEm < 30 * 86_400_000).sort((a, b) => b.criadoEm - a.criadoEm);
export function guardarPedido(p) {
  const todos = ler(K_PEDIDOS, {});
  todos[p.numero] = { numero: p.numero, codigo: p.codigo, criadoEm: p.criadoEm, total: p.totais.total };
  const lista = Object.values(todos).sort((a, b) => b.criadoEm - a.criadoEm).slice(0, 8);
  gravar(K_PEDIDOS, Object.fromEntries(lista.map(x => [x.numero, x])));
}

/* ---------- WhatsApp ---------- */
export const linkWhats = texto => `https://wa.me/${LOJA.whatsapp}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
