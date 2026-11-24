/* Acompanhamento do pedido: pelo link da confirmação (código) ou pelo número + WhatsApp. Atualiza sozinho a cada 30 s.
   Pelo link, o pedido aparece com o primeiro nome, o WhatsApp escondido e só o bairro; o endereço inteiro
   aparece para quem confirma o WhatsApp do pedido (ou para quem buscou pelo número + WhatsApp). */
import { LOJA, STATUS, STATUS_FINAIS } from './data.js';
import { brl, esc, linkWhats, api, pedidosFeitos, guardarPedido, mascaraFone, foneOk, digitos } from './store.js';
import { icone } from './icons.js';
import { comum } from './ui.js';
import './apagar-dados.js';

comum();

const $ = (s, r = document) => r.querySelector(s);
const caixa = $('[data-pedido]');
const form = $('[data-busca]');
const hm = t => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: LOJA.fuso }).format(t);
const dia = t => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: LOJA.fuso }).format(t);
let atual = null;   // último pedido mostrado
let busca = null;   // como buscar de novo: { c } ou { n, t }
let ultimo = '';
let timer = null;
let revelado = null; // dados completos já confirmados nesta página (o link só traz os mascarados)

function recentes() {
  const lista = pedidosFeitos().slice(0, 4);
  $('[data-recentes]').innerHTML = lista.length
    ? `<p class="t-label">Pedidos feitos neste aparelho</p><ul class="recent__list">${lista.map(p => `<li><a href="pedido.html?c=${encodeURIComponent(p.codigo)}"><span class="recent__num">Nº ${p.numero}</span><span class="muted">${esc(dia(p.criadoEm))}, ${hm(p.criadoEm)} · ${brl(p.total)}</span>${icone('chevron-right')}</a></li>`).join('')}</ul>`
    : `<p class="muted">O número aparece na confirmação do pedido. Ainda não há pedidos feitos neste aparelho.</p><p><a class="link" href="index.html#cardapio">Ver cardápio</a></p>`;
}

const minuscula = s => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
const nomeEtapa = (s, p) => (p.modo === 'retirada' && s.nomeRetirada ? s.nomeRetirada : s.nome);
const textoEtapa = (s, p) => (p.modo === 'retirada' && s.textoRetirada ? s.textoRetirada : s.texto);
const terminou = p => ['entregue', 'cancelado', 'recusado'].includes(p.status);

function pintar(p) {
  const st = p.status;
  const chave = `${p.numero}|${st}|${p.atualizadoEm}|${p.endereco ? 1 : 0}`;
  if (chave === ultimo) return;
  const final = STATUS_FINAIS[st];
  const idx = Math.max(0, STATUS.findIndex(s => s.id === st));
  const agendado = p.agendadoEm && Date.now() < p.agendadoEm && st === 'recebido';
  caixa.hidden = false;
  $('[data-ord-meta]').textContent = `Feito ${dia(p.criadoEm)}, às ${hm(p.criadoEm)}`;
  $('[data-ord-num]').textContent = `Pedido nº ${p.numero}`;
  const badge = $('[data-ord-badge]');
  badge.textContent = final ? final.nome : nomeEtapa(STATUS[idx], p);
  badge.dataset.estado = final ? st : (st === 'entregue' ? 'fim' : 'andamento');
  $('[data-ord-now]').innerHTML = final
    ? `<p class="order__headline">${final.nome}</p><p>${esc(final.texto)}${p.motivo ? ` Motivo: ${esc(p.motivo)}.` : ''}</p>`
    : `<p class="order__headline">${esc(nomeEtapa(STATUS[idx], p))}</p><p>${agendado ? `Marcado para ${esc(minuscula(p.agendadoPara))}. A gente começa a preparar perto do horário e avisa aqui a cada etapa.` : esc(textoEtapa(STATUS[idx], p))}${!agendado && st !== 'entregue' && p.modo === 'entrega' && !p.agendadoPara ? ` Previsão: ${esc(p.prazo)}.` : ''}</p>`;
  const quando = id => p.eventos.filter(e => e.status === id).pop()?.em;
  $('[data-timeline]').innerHTML = STATUS.map((s, i) => {
    const feito = !final && i < idx, agora = !final && i === idx;
    const t = quando(s.id);
    return `<li class="${feito ? 'is-done' : ''}${agora ? ' is-now' : ''}${final ? ' is-off' : ''}"${agora ? ' aria-current="step"' : ''}>
      <span class="timeline__dot" aria-hidden="true">${feito ? icone('check') : ''}</span>
      <span class="timeline__name">${esc(nomeEtapa(s, p))}</span>
      <span class="timeline__time">${t && (feito || agora) ? hm(t) : ''}</span>
    </li>`;
  }).join('');
  $('[data-ord-info]').innerHTML = `
    <div><p class="t-label">${p.modo === 'entrega' ? 'Entrega' : 'Retirada'}</p><p>${p.modo !== 'entrega' ? `Balcão da ${esc(LOJA.endereco)}`
      : p.endereco ? `${esc(p.endereco.rua)}, ${esc(p.endereco.numero)}${p.endereco.complemento ? ' · ' + esc(p.endereco.complemento) : ''}<br>${esc(p.area)}`
      : `${esc(p.area || '')}<br><button class="linkbtn" type="button" data-ver-endereco>Ver endereço completo</button>`}</p></div>
    <div><p class="t-label">Pagamento na ${p.modo === 'entrega' ? 'entrega' : 'retirada'}</p><p>${esc(p.pagamento.nome)}${p.pagamento.troco ? `<br><span class="muted">Troco para ${esc(p.pagamento.troco)}</span>` : ''}</p></div>
    <div><p class="t-label">Cliente</p><p>${esc(p.cliente.nome)}<br><span class="muted">${esc(p.cliente.whats)}</span></p></div>`;
  $('[data-ord-itens]').innerHTML = `
    <ul class="review__items">${p.itens.map(i => `<li><span class="sum-q">${i.qtd}×</span><div><p>${esc(i.nome)}</p>${i.opcoes ? `<p class="sum-o">${esc(i.opcoes)}</p>` : ''}${i.obs ? `<p class="sum-o">“${esc(i.obs)}”</p>` : ''}</div><span>${brl(i.unit * i.qtd)}</span></li>`).join('')}</ul>
    <dl class="totals review__totals">
      <dt>Subtotal</dt><dd>${brl(p.totais.subtotal)}</dd>
      ${p.totais.desconto ? `<dt>Desconto ${esc(p.cupom || '')}</dt><dd class="is-discount">− ${brl(p.totais.desconto)}</dd>` : ''}
      <dt>${p.modo === 'retirada' ? 'Retirada' : 'Taxa de entrega'}</dt><dd>${p.modo === 'retirada' || !p.totais.taxa ? 'Grátis' : brl(p.totais.taxa)}</dd>
      <dt class="totals__total">Total</dt><dd class="totals__total">${brl(p.totais.total)}</dd>
    </dl>`;
  $('[data-ord-whats]').href = linkWhats(`Olá, ${LOJA.nome}! Quero falar sobre o pedido nº ${p.numero}.`);
  ultimo = chave;
}

/* junta o que veio mascarado com o que a pessoa já confirmou nesta página */
function juntar(p) {
  if (p.completo) {
    revelado = { numero: p.numero, cliente: p.cliente, endereco: p.endereco, obs: p.itens.map(i => i.obs) };
    return p;
  }
  if (!revelado || revelado.numero !== p.numero) return p;
  return { ...p, cliente: revelado.cliente, endereco: revelado.endereco, enderecoOculto: false, itens: p.itens.map((i, k) => ({ ...i, obs: revelado.obs[k] ?? i.obs })) };
}
async function buscar(params, focar) {
  // pelo código do link (GET) ou pelo número + WhatsApp (POST: o telefone não vai no endereço da página)
  const r = params.c ? await api(`api/pedido?c=${encodeURIComponent(params.c)}`) : await api('api/pedido', { n: params.n, t: params.t });
  atual = juntar(r.pedido);
  busca = params;
  pintar(atual);
  if (focar) $('[data-ord-num]').focus({ preventScroll: true });
  guardarSeForDaqui(atual);
  agendar();
  return atual;
}
/* pedidos abertos pelo link da confirmação entram na lista "feitos neste aparelho" */
function guardarSeForDaqui(p) {
  if (busca?.c) { guardarPedido(p); recentes(); }
}
function agendar() {
  clearTimeout(timer);
  if (!atual || terminou(atual)) return;
  timer = setTimeout(async () => {
    if (document.hidden) { agendar(); return; }
    try { await buscar(busca, false); } catch { agendar(); }
  }, 30_000); // a cada 30 s: metade dos acessos de antes (o InfinityFree limita os acessos por dia)
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && atual && !terminou(atual)) { clearTimeout(timer); buscar(busca, false).catch(() => agendar()); } });

/* "Ver endereço completo": pede o WhatsApp do pedido e mostra o resto */
caixa.addEventListener('click', e => {
  if (!e.target.closest('[data-ver-endereco]')) return;
  const alvo = e.target.closest('p');
  alvo.textContent = atual.area || '';
  alvo.insertAdjacentHTML('afterend', `<form class="confirma" data-confirma novalidate><label for="cf-whats">Confirme o WhatsApp do pedido</label><div class="confirma__linha"><input class="input" id="cf-whats" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 90000-0000" aria-describedby="cf-err"><button class="btn btn--primary btn--sm" type="submit">Ver</button></div><p class="field__err" id="cf-err" hidden></p></form>`);
  $('#cf-whats', caixa).focus();
});
caixa.addEventListener('input', e => { if (e.target.id === 'cf-whats') e.target.value = mascaraFone(e.target.value); });
caixa.addEventListener('submit', async e => {
  const f = e.target.closest('[data-confirma]');
  if (!f) return;
  e.preventDefault();
  const inp = $('#cf-whats', f), err = $('#cf-err', f);
  if (!foneOk(inp.value)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = 'Escreva o WhatsApp com DDD.'; err.hidden = false; inp.focus(); return; }
  const b = $('button', f);
  b.disabled = true;
  try {
    const r = await api('api/pedido/endereco', { c: atual.codigo, t: digitos(inp.value) });
    atual = juntar(r.pedido);
    ultimo = '';
    pintar(atual);
  } catch (er) {
    b.disabled = false;
    inp.setAttribute('aria-invalid', 'true'); err.textContent = er.message; err.hidden = false; inp.focus();
  }
});

const num = $('#tr-num'), wz = $('#tr-whats');
const errNum = $('#tr-num-err'), errWz = $('#tr-whats-err');
const marcar = (el, err, msg) => { el.setAttribute('aria-invalid', 'true'); if (msg) err.textContent = msg; err.hidden = false; el.focus(); };
const limpar = (el, err) => { el.removeAttribute('aria-invalid'); err.hidden = true; };
wz.addEventListener('input', () => { wz.value = mascaraFone(wz.value); });
form.addEventListener('submit', async e => {
  e.preventDefault();
  const n = digitos(num.value);
  if (!n) { marcar(num, errNum, 'Escreva o número do pedido que aparece na confirmação.'); return; }
  limpar(num, errNum);
  if (!foneOk(wz.value)) { marcar(wz, errWz, 'Escreva o WhatsApp usado no pedido, com DDD.'); return; }
  limpar(wz, errWz);
  const btn = $('button[type="submit"]', form);
  btn.disabled = true;
  try {
    const p = await buscar({ n, t: digitos(wz.value) }, true);
    history.replaceState(null, '', `pedido.html?c=${encodeURIComponent(p.codigo)}`);
    busca = { c: p.codigo };
    guardarPedido(p);
    recentes();
  } catch (err) {
    marcar(num, errNum, err.status === 404 ? 'Não achamos um pedido com esse número e esse WhatsApp. Confira os dois.' : err.message);
  } finally {
    btn.disabled = false;
  }
});

recentes();
const qs = new URLSearchParams(location.search);
if (qs.get('c')) {
  buscar({ c: qs.get('c') }, false).catch(e => {
    caixa.hidden = true;
    marcar(num, errNum, e.status === 404 ? 'Esse link de pedido não vale mais. Digite o número e o WhatsApp do pedido.' : e.message);
  });
} else if (qs.get('n')) {
  num.value = qs.get('n');
  wz.focus();
}
