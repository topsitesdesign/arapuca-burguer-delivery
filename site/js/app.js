/*
  Página inicial: cardápio, carrossel "Mais pedidos", filtro por categoria, modal do produto
  e a sacola lateral com o checkout em quatro etapas (pedido, seus dados e entrega, pagamento, revisão).
  O cardápio vem do banco (js/data.js). Na revisão, o servidor calcula o total; no envio, recalcula e grava o pedido.
*/
import { LOJA, AREAS, GRUPOS, PRODUTOS, CATEGORIAS, PAGAMENTOS, BANNERS, produto, img } from './data.js';
import {
  brl, esc, plural, getCarrinho, totais, aoMudar, adicionarItem, mudarQtd, removerItem, removerProduto, setModo, setArea,
  aplicarCupom, removerCupom, precoUnitario, resumoEscolhas, statusLoja, horariosAgendamento, limparCarrinho, linkWhats, hora,
  api, itensParaEnvio, guardarPedido, mascaraFone, foneOk, digitos, itensQueSairam,
} from './store.js';
import { icone } from './icons.js';
import { prepararProva, descartarProva } from './prova.js';
import './apagar-dados.js';
import { comum, aviso, esconderAviso, bump, abrirDialogo, fecharDialogo, registrarDialogo } from './ui.js';

comum();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const suave = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.nome]));

/* ================================================================== cards */
function preco(p) {
  return p.precoDe ? `<span class="card__de">de <s>${brl(p.precoDe)}</s> por</span> ${brl(p.preco)}` : brl(p.preco);
}
function card(p, { selo = false, nivel = 3, sizes }) {
  return `<article class="card" data-id="${p.id}">
    <div class="card__media">
      ${selo && p.selo ? `<span class="badge">${esc(p.selo)}</span>` : ''}
      <img src="${img(p.foto, 500)}" srcset="${img(p.foto, 500)} 500w, ${img(p.foto, 960)} 960w" sizes="${sizes}" width="500" height="400" alt="${esc(p.alt)}" loading="lazy" decoding="async">
    </div>
    <div class="card__body">
      <p class="card__cat">${esc(CAT[p.categoria] || '')}</p>
      <h${nivel} class="card__name"><button class="card__open" type="button" data-open="${p.id}">${esc(p.nome)}</button></h${nivel}>
      <p class="card__desc">${esc(p.descricao)}</p>
      <div class="card__foot">
        <span class="card__price">${preco(p)}</span>
        <button class="addbtn" type="button" data-open="${p.id}" aria-label="Adicionar ${esc(p.nome)}">${icone('plus')}</button>
      </div>
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ carrossel "Mais pedidos" */
const destaques = PRODUTOS.filter(p => p.destaque).sort((a, b) => a.destaque - b.destaque);
const track = $('[data-rail-track]');
const secDestaques = $('#destaques');
if (!destaques.length && secDestaques) secDestaques.hidden = true;
track.innerHTML = destaques.map(p => card(p, { selo: true, nivel: 3, sizes: '(max-width: 767px) 76vw, (max-width: 1100px) 31vw, 300px' })).join('');
const btnPrev = $('[data-rail-dir="-1"]');
const btnNext = $('[data-rail-dir="1"]');
function railUI() {
  const max = track.scrollWidth - track.clientWidth - 4;
  btnPrev.disabled = track.scrollLeft <= 4;
  btnNext.disabled = track.scrollLeft >= max;
}
$('[data-rail]').addEventListener('click', e => {
  const b = e.target.closest('[data-rail-dir]');
  if (!b) return;
  const passo = (track.firstElementChild?.getBoundingClientRect().width || 300) + 20;
  track.scrollBy({ left: Number(b.dataset.railDir) * passo, behavior: suave() });
});
track.addEventListener('scroll', railUI, { passive: true });
addEventListener('resize', railUI);
railUI();

/* ------------------------------------------------------------------ cardápio por categoria */
const menuBox = $('[data-menu]');
const grupo = (id, nome, itens, selo = false) => `
  <section class="menu-group" data-cat="${id}" aria-labelledby="cat-${id}-h"${id === 'destaques' ? ' hidden' : ''}>
    <div class="menu-group__head"><h3 class="title menu-group__title" id="cat-${id}-h">${esc(nome)}</h3><span class="menu-group__count">${plural(itens.length, 'item', 'itens')}</span></div>
    <div class="grid">${itens.map(p => card(p, { selo, nivel: 4, sizes: '(max-width: 560px) 116px, (max-width: 820px) 46vw, (max-width: 1100px) 31vw, 300px' })).join('')}</div>
  </section>`;
menuBox.innerHTML = (destaques.length ? grupo('destaques', 'Destaques', destaques, true) : '')
  + CATEGORIAS.map(c => grupo(c.id, c.nome, PRODUTOS.filter(p => p.categoria === c.id))).join('')
  + (PRODUTOS.length ? '' : `<div class="empty"><p class="title empty__t">Cardápio em atualização</p><p>Volte em alguns minutos ou chame a loja no WhatsApp.</p></div>`);

const pills = $('[data-pills]');
pills.insertAdjacentHTML('beforeend', CATEGORIAS.map(c => `<button class="pill" type="button" data-filtro="${esc(c.id)}" aria-pressed="false">${esc(c.nome)}</button>`).join(''));
if (!destaques.length) $('[data-filtro="destaques"]', pills)?.remove();
function filtrar(f, rolar = true) {
  $$('[data-filtro]', pills).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filtro === f)));
  $$('.menu-group', menuBox).forEach(g => { g.hidden = f === 'todos' ? g.dataset.cat === 'destaques' : g.dataset.cat !== f; });
  const pill = $(`[data-filtro="${CSS.escape(f)}"]`, pills);
  if (pill) pills.scrollTo({ left: pill.offsetLeft - (pills.clientWidth - pill.offsetWidth) / 2, behavior: suave() });
  if (rolar) $('#cardapio').scrollIntoView({ behavior: suave(), block: 'start' });
}
pills.addEventListener('click', e => { const b = e.target.closest('[data-filtro]'); if (b) filtrar(b.dataset.filtro); });

/* a barra de categorias some depois que o cardápio passa (ela não serve para entrega, dúvidas e rodapé) */
const catbar = $('.catbar');
const secCardapio = $('#cardapio');
if (catbar && secCardapio) {
  const catbarUI = () => catbar.classList.toggle('is-away', secCardapio.getBoundingClientRect().bottom < (parseFloat(getComputedStyle(catbar).top) || 0) + catbar.offsetHeight + 24);
  addEventListener('scroll', catbarUI, { passive: true });
  addEventListener('resize', catbarUI);
  catbarUI();
}

/* ------------------------------------------------------------------ banners do painel (os de cupom viram a linha do cupom no topo) */
const boxBanners = $('[data-banners]');
const celular = matchMedia('(max-width: 767px)');
function pintarBanners() {
  if (!boxBanners) return;
  const lista = (BANNERS || []).filter(b => (celular.matches ? b.mobile : b.desktop));
  boxBanners.hidden = !lista.length;
  boxBanners.innerHTML = lista.map(b => {
    const [tipo, alvo] = String(b.destino || '').split(':');
    const prod = tipo === 'produto' ? produto(alvo) : null;
    const acao = prod ? `<button class="btn btn--primary btn--sm" type="button" data-open="${esc(alvo)}">Ver ${esc(prod.nome)}</button>`
      : tipo === 'categoria' && CATEGORIAS.some(c => c.id === alvo) ? `<button class="btn btn--ghost btn--sm" type="button" data-filtro-banner="${esc(alvo)}">Ver ${esc(CAT[alvo] || 'categoria')}</button>` : '';
    return `<article class="promo-card">${b.foto ? `<img class="promo-card__img" src="${img(b.foto, 500)}" alt="" width="500" height="320" loading="lazy" decoding="async">` : ''}
      <div class="promo-card__body"><h3 class="promo-card__t">${esc(b.titulo)}</h3>${b.texto ? `<p class="promo-card__p">${esc(b.texto)}</p>` : ''}${acao}</div></article>`;
  }).join('');
}
pintarBanners();
celular.addEventListener('change', pintarBanners);
boxBanners?.addEventListener('click', e => { const b = e.target.closest('[data-filtro-banner]'); if (b) filtrar(b.dataset.filtroBanner); });

/* ================================================================== modal do produto */
const dlgProduto = $('#produto');
registrarDialogo(dlgProduto);
const pm = {
  form: $('form', dlgProduto),
  img: $('[data-pm-img]', dlgProduto),
  cat: $('[data-pm-cat]', dlgProduto),
  nome: $('[data-pm-nome]', dlgProduto),
  preco: $('[data-pm-preco]', dlgProduto),
  desc: $('[data-pm-desc]', dlgProduto),
  ingr: $('[data-pm-ingr]', dlgProduto),
  grupos: $('[data-pm-grupos]', dlgProduto),
  remover: $('[data-pm-remover]', dlgProduto),
  removerLista: $('[data-pm-remover-list]', dlgProduto),
  obs: $('#pm-obs', dlgProduto),
  qtd: $('[data-pm-qtd]', dlgProduto),
  total: $('[data-pm-total]', dlgProduto),
  erro: $('[data-pm-erro]', dlgProduto),
  scroll: $('.pm__scroll', dlgProduto),
};
let atual = null; // { p, qtd, escolhas }
const marca = () => `<span class="opt__mark" aria-hidden="true">${icone('check')}</span>`;
const regra = g => {
  if (g.min === 0) return g.max === 1 ? 'Opcional' : `Opcional · até ${g.max}`;
  if (g.min === g.max) return `Obrigatório · escolha ${g.min}`;
  return `Obrigatório · de ${g.min} a ${g.max}`;
};

function abrirProduto(id) {
  const p = produto(id);
  if (!p) return;
  atual = { p, qtd: 1, escolhas: {} };
  pm.img.removeAttribute('src');
  pm.img.srcset = `${img(p.foto, 500)} 500w, ${img(p.foto, 960)} 960w, ${img(p.foto)} 1280w`;
  pm.img.sizes = '(max-width: 860px) 100vw, 590px';
  pm.img.src = img(p.foto, 960);
  pm.img.alt = p.alt;
  pm.cat.textContent = CAT[p.categoria] || '';
  pm.nome.textContent = p.nome;
  pm.preco.innerHTML = preco(p);
  pm.preco.classList.toggle('is-promo', !!p.precoDe);
  pm.preco.hidden = false;
  pm.desc.textContent = p.descricao;
  pm.ingr.textContent = p.ingredientes.length ? p.ingredientes.join(', ') + '.' : '';
  pm.ingr.parentElement.hidden = !p.ingredientes.length;
  pm.grupos.innerHTML = p.grupos.map(gid => {
    const g = GRUPOS[gid];
    const tipo = g.tipo === 'unico' ? 'radio' : 'checkbox';
    return `<fieldset class="opts${g.min ? ' is-required' : ''}" data-grupo="${gid}">
      <legend class="opts__head"><span class="opts__title">${esc(g.nome)}</span><span class="opts__rule">${regra(g)}</span></legend>
      <div>${g.opcoes.map(o => `<label class="opt"><input type="${tipo}" name="g-${gid}" value="${esc(o.id)}">${marca()}<span class="opt__name">${esc(o.nome)}</span>${o.preco ? `<span class="opt__price">+ ${brl(o.preco)}</span>` : ''}</label>`).join('')}</div>
    </fieldset>`;
  }).join('');
  pm.remover.hidden = true;
  pm.removerLista.innerHTML = '';
  pm.obs.value = '';
  pm.erro.hidden = true;
  atualizarProduto();
  abrirDialogo(dlgProduto);
  pm.scroll.scrollTop = 0;
  pm.form.scrollTop = 0;
}

function atualizarProduto() {
  if (!atual) return;
  const escolhas = {};
  $$('[data-grupo]', pm.grupos).forEach(fs => { escolhas[fs.dataset.grupo] = $$('input:checked', fs).map(i => i.value); });
  atual.escolhas = escolhas;
  $$('[data-grupo]', pm.grupos).forEach(fs => {
    const g = GRUPOS[fs.dataset.grupo];
    const n = (escolhas[fs.dataset.grupo] || []).length;
    if (g.tipo === 'multiplo') $$('input', fs).forEach(i => { i.disabled = !i.checked && n >= g.max; });
    fs.classList.toggle('is-done', g.min > 0 && n >= g.min);
    if (n >= g.min) { fs.classList.remove('is-error'); $('.opts__err', fs)?.remove(); }
  });
  pm.total.textContent = brl(precoUnitario(atual.p, escolhas) * atual.qtd);
  pm.qtd.textContent = atual.qtd;
  $('[data-qty="-1"]', pm.form).disabled = atual.qtd <= 1;
  $('[data-qty="1"]', pm.form).disabled = atual.qtd >= 20;
  if (!$('.is-error', pm.grupos)) pm.erro.hidden = true;
}
pm.form.addEventListener('change', atualizarProduto);
$$('[data-qty]', pm.form).forEach(b => b.addEventListener('click', () => {
  atual.qtd = Math.max(1, Math.min(20, atual.qtd + Number(b.dataset.qty)));
  atualizarProduto();
}));
pm.form.addEventListener('submit', e => {
  e.preventDefault();
  if (!atual) return;
  atualizarProduto();
  const faltando = $$('[data-grupo]', pm.grupos).filter(fs => (atual.escolhas[fs.dataset.grupo] || []).length < GRUPOS[fs.dataset.grupo].min);
  if (faltando.length) {
    faltando.forEach(fs => {
      fs.classList.remove('is-error'); void fs.offsetWidth; fs.classList.add('is-error');
      // a mensagem fica dentro do próprio grupo, logo abaixo do título, onde a pessoa está olhando
      const gf = GRUPOS[fs.dataset.grupo];
      const msg = $('.opts__err', fs) || $('.opts__head', fs).insertAdjacentElement('afterend', Object.assign(document.createElement('p'), { className: 'opts__err' }));
      msg.setAttribute('role', 'alert');
      msg.textContent = `Escolha ${gf.min === 1 ? 'uma opção' : gf.min + ' opções'} para continuar.`;
    });
    const g = GRUPOS[faltando[0].dataset.grupo];
    pm.erro.textContent = faltando.length === 1
      ? `Escolha ${g.min === 1 ? 'uma opção' : g.min + ' opções'} em ${g.nome}.`
      : `Faltam ${faltando.length} escolhas obrigatórias: ${new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(faltando.map(fs => GRUPOS[fs.dataset.grupo].nome))}.`;
    pm.erro.hidden = false;
    faltando[0].scrollIntoView({ block: 'center', behavior: suave() });
    $('input', faltando[0])?.focus({ preventScroll: true });
    return;
  }
  const { p, qtd, escolhas } = atual;
  adicionarItem({ produtoId: p.id, qtd, escolhas, obs: pm.obs.value });
  fecharDialogo(dlgProduto);
  bump();
  $$(`.card[data-id="${p.id}"]`).forEach(c => { c.classList.remove('is-added'); void c.offsetWidth; c.classList.add('is-added'); });
  aviso(`${qtd > 1 ? qtd + ' × ' : ''}${p.nome} na sacola.`, { rotulo: 'Ver sacola', fazer: () => abrirSacola() });
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-open]');
  if (b) { e.preventDefault(); abrirProduto(b.dataset.open); }
});

/* ================================================================== sacola e checkout */
const dlgSacola = $('#sacola');
registrarDialogo(dlgSacola);
const corpo = $('[data-sc-body]', dlgSacola);
const boxItens = $('[data-sc-itens]', dlgSacola);
const boxCk = $('[data-sc-ck]', dlgSacola);

/* dados do pedido (nome, WhatsApp, endereço): só ficam no aparelho se a pessoa marcar "Lembrar meus dados" (LGPD-05).
   Sem a marca, valem só enquanto esta aba estiver aberta. Quem já tinha dados guardados vê a caixa marcada e pode desmarcar. */
const K_DADOS = 'brasa:checkout';
let dados = (() => {
  for (const [area, lembrar] of [[localStorage, true], [sessionStorage, false]]) {
    try { const v = JSON.parse(area.getItem(K_DADOS)); if (v) return { ...v, lembrar }; } catch { /* sem armazenamento */ }
  }
  return { lembrar: false };
})();
const gravarDados = () => {
  try {
    const [usar, limpar] = dados.lembrar ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    usar.setItem(K_DADOS, JSON.stringify(dados));
    limpar.removeItem(K_DADOS);
  } catch { /* sem armazenamento */ }
};
const PASSOS = ['Pedido', 'Seus dados', 'Pagamento', 'Revisão'];
let passo = 1;
let feito = null;     // pedido confirmado: a sacola mostra a confirmação até fechar
let msgCupom = null;
let cotacao = null;   // valores calculados pelo servidor na revisão
let avisoRevisao = ''; // recado na revisão (ex.: cupom que deixou de valer)
let repetido = null;  // o servidor achou um pedido igual feito há pouco: a revisão pergunta antes de enviar outro
const novaChave = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

/* chave do envio: identifica este pedido para o servidor, que nunca grava a mesma chave duas vezes.
   Fica guardada no aparelho junto com uma assinatura da sacola e dos dados: se a internet cair depois do envio
   e a pessoa recarregar a página, o mesmo pedido volta com a mesma chave e não é duplicado. */
const K_ENVIO = 'brasa:envio';
const assinatura = p => {
  const s = JSON.stringify([p.itens, p.modo, p.area, p.cupom, p.telefone, p.nome, p.endereco, p.quando, p.hora, p.pagamento, p.troco]);
  let h = 0x811c9dc5; // FNV-1a: só para comparar, sem guardar os dados da pessoa de novo
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
};
function chaveDoEnvio(pedido) {
  const ass = assinatura(pedido);
  let g = null;
  try { g = JSON.parse(localStorage.getItem(K_ENVIO)); } catch { g = null; }
  if (g && g.ass === ass && typeof g.chave === 'string' && Date.now() - g.em < 6 * 3600_000) return g.chave;
  const chave = novaChave();
  try { localStorage.setItem(K_ENVIO, JSON.stringify({ chave, ass, em: Date.now() })); } catch { /* sem armazenamento: vale só nesta página */ }
  return chave;
}
const esquecerEnvio = () => { try { localStorage.removeItem(K_ENVIO); } catch { /* sem armazenamento */ } };

function abrirSacola() {
  esconderAviso();
  pintarSacola();
  abrirDialogo(dlgSacola);
  corpo.scrollTop = 0;
  if (getCarrinho().itens.length) prepararProva().catch(() => {}); // a proteção contra robôs fica pronta enquanto a pessoa preenche
}
dlgSacola.addEventListener('close', () => { if (feito) { feito = null; passo = 1; } msgCupom = null; });
document.addEventListener('click', e => {
  if (e.target.closest('[data-cart-open]')) { e.preventDefault(); abrirSacola(); }
});

function pintarSacola() {
  if (feito) { boxItens.innerHTML = ''; boxCk.innerHTML = htmlFeito(feito); return; }
  pintarItens();
  pintarCk();
}

function pintarItens() {
  const foco = document.activeElement?.dataset?.foco;
  const c = getCarrinho();
  if (!c.itens.length) {
    boxItens.innerHTML = `<div class="empty"><span class="empty__ic">${icone('shopping-bag')}</span><p class="title empty__t">Sua sacola está vazia</p><p>Escolha um item do cardápio para começar.</p><a class="btn btn--primary" href="#cardapio" data-close>Ver cardápio</a></div>`;
    if (foco) $('#sacola-h').focus();
    return;
  }
  boxItens.innerHTML = `<ul class="lines">${c.itens.map(i => {
    const r = resumoEscolhas(i);
    return `<li class="line">
      <img class="line__img" src="${img(i.foto, 500)}" alt="" width="56" height="56" loading="lazy">
      <div><p class="line__name"><span>${i.qtd}×</span> ${esc(i.nome)}</p>${r ? `<p class="line__opts">${esc(r)}</p>` : ''}${i.obs ? `<p class="line__obs">“${esc(i.obs)}”</p>` : ''}</div>
      <span class="line__price">${brl(i.unit * i.qtd)}</span>
      <div class="line__ctrl">
        <div class="qty qty--sm" role="group" aria-label="Quantidade de ${esc(i.nome)}">
          <button type="button" data-q="-1" data-uid="${i.uid}" data-foco="m-${i.uid}" aria-label="Diminuir ${esc(i.nome)}" ${i.qtd <= 1 ? 'disabled' : ''}>${icone('minus')}</button>
          <span class="qty__val" aria-live="polite">${i.qtd}</span>
          <button type="button" data-q="1" data-uid="${i.uid}" data-foco="p-${i.uid}" aria-label="Aumentar ${esc(i.nome)}" ${i.qtd >= 20 ? 'disabled' : ''}>${icone('plus')}</button>
        </div>
        <button class="line__rm" type="button" data-rm="${i.uid}" data-foco="r-${i.uid}" aria-label="Remover ${esc(i.nome)}">Remover</button>
      </div>
    </li>`;
  }).join('')}</ul>
  <button class="btn btn--ghost btn--block keep" type="button" data-close>${icone('arrow-left')}Adicionar itens</button>`;
  if (foco) {
    const el = $(`[data-foco="${foco}"]`, boxItens);
    const uid = foco.slice(2);
    (el && !el.disabled ? el : $(`[data-uid="${uid}"]:not([disabled])`, boxItens) || $('#sacola-h'))?.focus();
  }
}

/* ------------------------------------------------------------------ etapas */
function prazo() {
  const c = getCarrinho();
  if (c.modo === 'retirada') return LOJA.prazoRetirada;
  return AREAS.find(a => a.id === c.area)?.prazo || LOJA.prazoEntrega;
}
const agendado = () => dados.quando === 'agendar' || !statusLoja().aberto;
function horarioEscolhido() {
  const lista = horariosAgendamento();
  return lista.find(h => h.valor === dados.hora) || lista[0] || null;
}
function quandoTexto() {
  if (agendado()) { const r = horarioEscolhido()?.rotulo || ''; return `Para ${r.charAt(0).toLowerCase() + r.slice(1).replace(', ', ', às ')}`; }
  return `Agora · ${prazo()}`;
}

function htmlCupom() {
  const t = totais();
  if (t.cupom) return `<div class="coupon-on"><span>${icone('ticket')}${esc(t.cupom.codigo)} aplicado · ${esc(t.cupom.curto)}</span><button class="linkbtn" type="button" data-cupom-off>Remover</button></div>`;
  return `<div class="field"><label for="sc-cupom">Cupom de desconto</label>
    <div class="coupon-form"><input class="input" id="sc-cupom" autocomplete="off" autocapitalize="characters" placeholder="Código do cupom" aria-describedby="sc-cupom-msg"><button class="btn btn--ghost" type="button" data-cupom-aplicar>Aplicar</button></div>
    ${msgCupom && !msgCupom.ok ? `<p class="coupon-msg is-error" id="sc-cupom-msg" role="alert">${esc(msgCupom.msg)}</p>` : ''}</div>`;
}
/* valores: na revisão, os do servidor; antes disso, a conta local */
function valores() {
  const c = getCarrinho(), t = totais();
  if (passo === 4 && cotacao) return { subtotal: cotacao.subtotal, desconto: cotacao.desconto, taxa: cotacao.taxa, total: cotacao.total, cupom: cotacao.cupom, area: cotacao.area, modo: cotacao.modo, taxaMin: t.taxaMin };
  return { ...t, modo: c.modo };
}
function htmlTotais(final = false) {
  const v = valores();
  const taxa = v.modo === 'retirada' ? 'Grátis' : v.taxa !== null && v.taxa !== undefined ? (v.taxa === 0 && v.cupom?.tipo === 'frete' ? 'Grátis (cupom)' : brl(v.taxa)) : `a partir de ${brl(v.taxaMin)}`;
  return `<dl class="totals">
    <dt>Subtotal</dt><dd>${brl(v.subtotal)}</dd>
    ${v.desconto ? `<dt>Desconto ${esc(v.cupom?.codigo || '')}</dt><dd class="is-discount">− ${brl(v.desconto)}</dd>` : ''}
    <dt>${v.modo === 'retirada' ? 'Retirada no balcão' : `Taxa de entrega${v.area ? ` · ${esc(v.area.nome)}` : ''}`}</dt><dd>${taxa}</dd>
    <dt class="totals__total">${final ? `Total na ${v.modo === 'entrega' ? 'entrega' : 'retirada'}` : 'Total'}</dt><dd class="totals__total">${brl(v.total)}</dd>
  </dl>`;
}
const avancar = (txt = 'Continuar') => `<button class="btn btn--primary btn--block btn--lg" type="submit">${txt} ${icone('arrow-right', 'ic arrow')}</button>`;
const voltar = n => `<button class="btn btn--ghost btn--block" type="button" data-ir="${n}">${icone('arrow-left')}Voltar</button>`;

function passo1() {
  const minimo = LOJA.pedidoMinimo > 0 && getCarrinho().modo === 'entrega' ? `<p class="step__note">Pedido mínimo para entrega: ${brl(LOJA.pedidoMinimo)} em produtos.</p>` : '';
  return `<form class="step" data-step="1" novalidate>
    <p class="step__h" tabindex="-1">Cupom e valores</p>
    <div data-sc-cupom>${htmlCupom()}</div>
    <div data-sc-totais>${htmlTotais()}</div>
    ${minimo}
    <div class="step__nav">${avancar('Informar meus dados')}</div>
  </form>`;
}

function passo2() {
  const c = getCarrinho();
  const entrega = c.modo === 'entrega';
  const loja = statusLoja();
  const agendar = agendado();
  const horarios = horariosAgendamento();
  const opcoesModo = [
    LOJA.entrega !== false ? `<option value="entrega" ${entrega ? 'selected' : ''}>Entrega</option>` : '',
    LOJA.retirada !== false ? `<option value="retirada" ${entrega ? '' : 'selected'}>Retirada no balcão · grátis</option>` : '',
  ].join('');
  return `<form class="step" data-step="2" novalidate>
    <p class="step__h" tabindex="-1">Seus dados e a entrega</p>
    ${loja.pausado ? `<p class="form-msg is-error" role="alert">Pausamos os pedidos por alguns minutos. Tente de novo daqui a pouco ou chame no WhatsApp.</p>` : ''}
    <div class="field"><label for="sc-nome">Seu nome</label>
      <input class="input" id="sc-nome" name="nome" autocomplete="name" maxlength="80" value="${esc(dados.nome || '')}" aria-describedby="sc-nome-err">
      <p class="field__err" id="sc-nome-err" hidden>Escreva o seu nome.</p>
    </div>
    <div class="field"><label for="sc-whats">WhatsApp</label>
      <input class="input" id="sc-whats" name="whats" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 90000-0000" value="${esc(dados.whats || '')}" aria-describedby="sc-whats-help sc-whats-err">
      <p class="field__help muted" id="sc-whats-help">A loja usa este número para falar sobre o pedido.</p>
      <p class="field__err" id="sc-whats-err" hidden>Escreva o WhatsApp com DDD, por exemplo (11) 98765-4321.</p>
    </div>
    <label class="opt lembrar"><input type="checkbox" name="lembrar" ${dados.lembrar ? 'checked' : ''}>${marca()}<span>Lembrar meus dados neste aparelho</span></label>
    <p class="step__note privacidade-nota">Seus dados servem só para preparar, entregar e falar sobre este pedido. <a href="privacidade.html" target="_blank" rel="noopener">Como usamos seus dados</a></p>
    <div class="field"><label for="sc-modo">Recebimento</label>
      <select class="select" id="sc-modo" name="modo">${opcoesModo}</select>
    </div>
    <div class="step" data-entrega ${entrega ? '' : 'hidden'}>
      <div class="field"><label for="sc-bairro">Bairro</label>
        <select class="select" id="sc-bairro" name="bairro" aria-describedby="sc-bairro-err">
          <option value="">Escolha o bairro</option>
          ${AREAS.map(a => `<option value="${esc(a.id)}" ${c.area === a.id ? 'selected' : ''}>${esc(a.nome)} · ${brl(a.taxa)}</option>`).join('')}
        </select>
        <p class="field__err" id="sc-bairro-err" hidden>Escolha o bairro da entrega.</p>
      </div>
      <div class="field"><label for="sc-rua">Endereço</label>
        <input class="input" id="sc-rua" name="rua" autocomplete="address-line1" maxlength="120" placeholder="Rua ou avenida" value="${esc(dados.rua || '')}" aria-describedby="sc-rua-err">
        <p class="field__err" id="sc-rua-err" hidden>Escreva a rua ou avenida.</p>
      </div>
      <div class="row-2">
        <div class="field"><label for="sc-num">Número</label>
          <input class="input" id="sc-num" name="numero" inputmode="numeric" autocomplete="address-line2" maxlength="12" value="${esc(dados.numero || '')}" aria-describedby="sc-num-err">
          <p class="field__err" id="sc-num-err" hidden>Escreva o número.</p>
        </div>
        <div class="field"><label for="sc-comp">Complemento</label>
          <input class="input" id="sc-comp" name="complemento" maxlength="60" placeholder="Apto, bloco, casa" value="${esc(dados.complemento || '')}">
        </div>
      </div>
      <div class="field"><label for="sc-ref">Ponto de referência <span class="muted">(opcional)</span></label>
        <input class="input" id="sc-ref" name="referencia" maxlength="80" placeholder="Ex.: portão azul" value="${esc(dados.referencia || '')}">
      </div>
    </div>
    <div class="box" data-retirada ${entrega ? 'hidden' : ''}><p><strong>Retire no balcão</strong></p><p class="muted">${esc(LOJA.endereco)}. Fica pronto em ${esc(LOJA.prazoRetirada)}.</p>${LOJA.orientacoes ? `<p class="muted">${esc(LOJA.orientacoes)}</p>` : ''}</div>
    <div class="field">
      <span class="field__label" id="sc-quando-l">Quando</span>
      <div class="when" role="radiogroup" aria-labelledby="sc-quando-l">
        <label class="opt"><input type="radio" name="quando" value="agora" ${loja.aberto ? '' : 'disabled'} ${agendar ? '' : 'checked'}>${marca()}<span class="opt__name">${loja.aberto ? 'Agora' : loja.pausado ? 'Agora (pedidos pausados)' : 'Agora (a loja está fechada)'}</span><span class="opt__price" data-prazo>${loja.aberto ? esc(prazo()) : ''}</span></label>
        <label class="opt"><input type="radio" name="quando" value="agendar" ${agendar ? 'checked' : ''} ${horarios.length ? '' : 'disabled'}>${marca()}<span class="opt__name">Agendar</span>${!loja.aberto && loja.abre ? `<span class="opt__price">a gente abre ${loja.abre.quando} às ${hora(loja.abre.as)}</span>` : ''}</label>
      </div>
      <p class="field__err" id="sc-quando-err" hidden></p>
    </div>
    <div class="field" data-agenda ${agendar ? '' : 'hidden'}><label for="sc-hora">Horário</label>
      <select class="select" id="sc-hora" name="hora">${horarios.map(h => `<option value="${h.valor}" ${dados.hora === h.valor ? 'selected' : ''}>${h.rotulo}</option>`).join('')}</select>
    </div>
    <div class="hp" aria-hidden="true"><label for="sc-extra">Deixe este campo vazio</label><input id="sc-extra" name="extra" tabindex="-1" autocomplete="off" value=""></div>
    <div class="step__nav">${avancar('Escolher o pagamento')}${voltar(1)}</div>
  </form>`;
}

function passo3() {
  const c = getCarrinho();
  return `<form class="step" data-step="3" novalidate>
    <p class="step__h" tabindex="-1">Pagamento na ${c.modo === 'entrega' ? 'entrega' : 'retirada'}</p>
    <p class="step__note">Você paga quando o pedido chegar ou no balcão. Nada é cobrado pelo site.</p>
    <div class="pays" role="radiogroup" aria-label="Forma de pagamento" aria-describedby="sc-pag-err" data-pays>
      ${PAGAMENTOS.map(p => `<label class="pay"><input type="radio" name="pagamento" value="${p.id}" ${dados.pagamento === p.id ? 'checked' : ''}><span class="pay__ic">${p.id === 'pix' ? '<img src="assets/icons/pix.svg" alt="" width="20" height="20">' : icone(p.id === 'dinheiro' ? 'banknote' : 'credit-card')}</span><span class="pay__txt"><span class="pay__name">${esc(p.nome)}</span><span class="pay__det">${esc(p.detalhe)}</span></span><span class="opt__mark" aria-hidden="true"></span></label>`).join('')}
    </div>
    <p class="field__err" id="sc-pag-err" hidden>Escolha como você vai pagar.</p>
    <div class="field" data-troco ${dados.pagamento === 'dinheiro' && trocoAceito() ? '' : 'hidden'}><label for="sc-troco">Troco para quanto? <span class="muted">(opcional)</span></label>
      <input class="input" id="sc-troco" name="troco" inputmode="decimal" placeholder="Ex.: R$ 100,00" value="${esc(dados.troco || '')}" aria-describedby="sc-troco-err">
      <p class="field__err" id="sc-troco-err" hidden></p>
    </div>
    <div class="step__nav">${avancar('Revisar o pedido')}${voltar(2)}</div>
  </form>`;
}
const trocoAceito = () => LOJA.troco !== false;

function passo4() {
  const c = getCarrinho();
  const pag = PAGAMENTOS.find(p => p.id === dados.pagamento);
  const area = AREAS.find(a => a.id === c.area);
  const end = c.modo === 'entrega'
    ? `${esc(dados.rua)}, ${esc(dados.numero)}${dados.complemento ? ' · ' + esc(dados.complemento) : ''}<br>${esc(area?.nome || '')}${dados.referencia ? ' · ' + esc(dados.referencia) : ''}`
    : `Retirada no balcão<br>${esc(LOJA.endereco)}`;
  return `<form class="step" data-step="4" novalidate>
    <p class="step__h" tabindex="-1">Confira antes de enviar</p>
    <div class="review">
      <div class="review__box"><p class="t-label">Cliente</p><p>${esc(dados.nome)}<br><span class="muted">${esc(dados.whats)}</span></p><button class="linkbtn review__edit" type="button" data-ir="2">Alterar</button></div>
      <div class="review__box"><p class="t-label">${c.modo === 'entrega' ? 'Entrega' : 'Retirada'}</p><p>${end}<br><span class="muted">${esc(quandoTexto())}</span></p><button class="linkbtn review__edit" type="button" data-ir="2">Alterar</button></div>
      <div class="review__box"><p class="t-label">Pagamento na ${c.modo === 'entrega' ? 'entrega' : 'retirada'}</p><p>${esc(pag?.nome || '')}${dados.pagamento === 'dinheiro' && dados.troco ? `<br><span class="muted">Troco para ${esc(dados.troco)}</span>` : ''}</p><button class="linkbtn review__edit" type="button" data-ir="3">Alterar</button></div>
    </div>
    <div data-sc-totais data-final>${htmlTotais(true)}</div>
    <p class="form-msg${avisoRevisao ? ' is-error' : ''}" data-form-msg role="status">${avisoRevisao ? esc(avisoRevisao) : cotacao ? '' : 'Conferindo os valores com a loja…'}</p>
    ${repetido ? `<div class="repetido" data-repetido tabindex="-1" role="alert">
      <p><strong>${esc(repetido.msg)}</strong> Se enviou de novo sem querer, é só acompanhar esse pedido.</p>
      <a class="btn btn--primary btn--block btn--lg" href="pedido.html?c=${encodeURIComponent(repetido.codigo)}" data-acompanhar-repetido>${icone('locate')}Acompanhar o pedido nº ${repetido.numero}</a>
    </div>` : ''}
    <div class="step__nav">
      <button class="btn ${repetido ? 'btn--ghost' : 'btn--primary'} btn--block btn--lg" type="submit" data-confirmar ${repetido ? 'data-repetir="1"' : ''} ${cotacao ? '' : 'disabled aria-busy="true"'}>${cotacao ? `${repetido ? 'Enviar outro pedido igual' : 'Enviar pedido'} · ${brl(cotacao.total)}` : 'Conferindo valores…'}</button>
      ${voltar(3)}
    </div>
  </form>`;
}

function pintarCk() {
  if (!getCarrinho().itens.length) { boxCk.innerHTML = ''; passo = 1; return; }
  boxCk.innerHTML = `<section class="ck" aria-labelledby="ck-h">
    <h3 class="title ck__title" id="ck-h">Finalizar pedido</h3>
    <ol class="steps">${PASSOS.map((nome, i) => {
      const k = i + 1;
      const cls = k < passo ? 'is-done' : k === passo ? 'is-current' : '';
      return `<li class="${cls}"><button type="button" data-ir="${k}"${k < passo ? '' : ' aria-disabled="true" tabindex="-1"'}${k === passo ? ' aria-current="step"' : ''}>${k} ${nome}</button></li>`;
    }).join('')}</ol>
    ${[passo1, passo2, passo3, passo4][passo - 1]()}
  </section>`;
  // guarda o que a etapa já mostra marcado (quando, horário)
  const q = $('[name="quando"]:checked', boxCk);
  if (q) dados.quando = q.value;
  const h = $('#sc-hora', boxCk);
  if (h && h.value) dados.hora = h.value;
  gravarDados();
}

function irPara(n) {
  if (n !== 4 || passo !== 4) { avisoRevisao = ''; repetido = null; }
  if (n >= 2) prepararProva().catch(() => {});
  passo = n;
  if (n === 4) { cotacao = null; cotar(); }
  pintarCk();
  const ck = $('.ck', boxCk);
  if (ck) corpo.scrollBy({ top: ck.getBoundingClientRect().top - corpo.getBoundingClientRect().top - 8, behavior: suave() });
  $('.step__h', boxCk)?.focus({ preventScroll: true });
}

/* validação: a mensagem aparece embaixo do campo */
function erro(f, id, ruim, msg) {
  const el = $('#' + id, f);
  if (!el) return true;
  const p = $(`#${id}-err`, f);
  if (ruim) { el.setAttribute('aria-invalid', 'true'); if (p) { if (msg) p.textContent = msg; p.hidden = false; } }
  else { el.removeAttribute('aria-invalid'); if (p) p.hidden = true; }
  return !ruim;
}
const val = (f, nome) => ($(`[name="${nome}"]`, f)?.value || '').trim();
const valorBR = v => { const n = parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

function validar2(f) {
  const loja = statusLoja();
  const entrega = getCarrinho().modo === 'entrega';
  const ok = [
    erro(f, 'sc-nome', val(f, 'nome').length < 2),
    erro(f, 'sc-whats', !foneOk(val(f, 'whats'))),
    ...(entrega ? [
      erro(f, 'sc-bairro', !getCarrinho().area),
      erro(f, 'sc-rua', val(f, 'rua').length < 3),
      erro(f, 'sc-num', !val(f, 'numero')),
    ] : []),
  ].every(Boolean);
  if (!ok) { $('[aria-invalid="true"]', f)?.focus(); return false; }
  const errQ = $('#sc-quando-err', f);
  const quando = $('[name="quando"]:checked', f)?.value || (loja.aberto ? 'agora' : 'agendar');
  let msgQ = '';
  if (loja.pausado) msgQ = 'Pausamos os pedidos por alguns minutos. Tente de novo daqui a pouco.';
  else if (quando === 'agendar' && !horariosAgendamento().length) msgQ = 'Não há horários para agendar nos próximos dias. Fale com a loja no WhatsApp.';
  else if (quando === 'agora' && !loja.aberto) msgQ = 'A loja fechou enquanto você pedia. Escolha um horário e deixe o pedido agendado.';
  if (msgQ) { errQ.textContent = msgQ; errQ.hidden = false; $('[name="quando"]', f)?.focus(); return false; }
  errQ.hidden = true;
  Object.assign(dados, {
    nome: val(f, 'nome'), whats: mascaraFone(val(f, 'whats')),
    rua: val(f, 'rua') || dados.rua || '', numero: val(f, 'numero') || dados.numero || '', complemento: val(f, 'complemento'), referencia: val(f, 'referencia'),
    quando, hora: $('#sc-hora', f)?.value || dados.hora || '',
    extra: val(f, 'extra'), // campo escondido: só robô preenche
  });
  gravarDados();
  return true;
}
function validar3(f) {
  const sel = $('[name="pagamento"]:checked', f);
  const pays = $('[data-pays]', f);
  if (!sel) { $('#sc-pag-err', f).hidden = false; pays.classList.add('is-error'); $('[name="pagamento"]', f)?.focus(); return false; }
  if (sel.value === 'dinheiro' && trocoAceito() && val(f, 'troco')) {
    const total = totais().total;
    if (!erro(f, 'sc-troco', !(valorBR(val(f, 'troco')) >= total), `O troco precisa ser de pelo menos ${brl(total)}.`)) { $('#sc-troco', f).focus(); return false; }
  }
  Object.assign(dados, { pagamento: sel.value, troco: sel.value === 'dinheiro' && trocoAceito() ? val(f, 'troco') : '' });
  gravarDados();
  return true;
}

boxCk.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const n = Number(f.dataset.step);
  if (n === 1) irPara(2);
  else if (n === 2 && validar2(f)) irPara(3);
  else if (n === 3 && validar3(f)) irPara(4);
  else if (n === 4) confirmar(f);
});
boxCk.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'sc-modo') {
    setModo(el.value);
    const ent = el.value === 'entrega';
    $('[data-entrega]', boxCk).hidden = !ent;
    $('[data-retirada]', boxCk).hidden = ent;
  }
  if (el.id === 'sc-bairro') { setArea(el.value); if (el.value) erro(boxCk, 'sc-bairro', false); }
  if (el.id === 'sc-modo' || el.id === 'sc-bairro') { const pz = $('[data-prazo]', boxCk); if (pz && statusLoja().aberto) pz.textContent = prazo(); }
  if (el.name === 'quando') { $('[data-agenda]', boxCk).hidden = el.value !== 'agendar'; $('#sc-quando-err', boxCk).hidden = true; }
  if (el.name === 'pagamento') {
    $('[data-troco]', boxCk).hidden = el.value !== 'dinheiro' || !trocoAceito();
    $('#sc-pag-err', boxCk).hidden = true;
    $('[data-pays]', boxCk).classList.remove('is-error');
  }
  guardar(el);
});
boxCk.addEventListener('input', e => {
  if (e.target.id === 'sc-whats') {
    const fim = e.target.selectionStart === e.target.value.length;
    e.target.value = mascaraFone(e.target.value);
    if (fim) e.target.setSelectionRange(e.target.value.length, e.target.value.length);
  }
  guardar(e.target);
  if (e.target.getAttribute('aria-invalid') === 'true') erro(boxCk, e.target.id, false);
});
boxCk.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'sc-cupom') { e.preventDefault(); aplicarCupomCampo(); } });
function guardar(el) {
  if (el.name === 'lembrar') { dados.lembrar = el.checked; gravarDados(); return; }
  if (!el.name || el.name === 'modo' || el.name === 'bairro') return;
  if (el.type === 'radio' && !el.checked) return;
  dados[el.name] = el.value;
  gravarDados();
}

async function aplicarCupomCampo() {
  const i = $('#sc-cupom', boxCk);
  const b = $('[data-cupom-aplicar]', boxCk);
  const v = i?.value || '';
  if (!v.trim()) msgCupom = { ok: false, msg: 'Digite o código do cupom.' };
  else {
    if (b) { b.disabled = true; b.textContent = 'Conferindo…'; }
    msgCupom = await aplicarCupom(v, digitos(dados.whats));
  }
  if (msgCupom.ok) { $('[data-cupom-off]', boxCk)?.focus(); return; }
  const box = $('[data-sc-cupom]', boxCk);
  if (!box) return;
  box.innerHTML = htmlCupom();
  const n = $('#sc-cupom', boxCk);
  n.value = v;
  n.setAttribute('aria-invalid', 'true');
  n.focus();
}

dlgSacola.addEventListener('click', e => {
  const q = e.target.closest('[data-q]');
  if (q) { mudarQtd(q.dataset.uid, Number(q.dataset.q)); return; }
  const rm = e.target.closest('[data-rm]');
  if (rm) { removerItem(rm.dataset.rm); return; }
  if (e.target.closest('[data-cupom-off]')) { msgCupom = null; removerCupom(); $('#sc-cupom', boxCk)?.focus(); return; }
  if (e.target.closest('[data-cupom-aplicar]')) { aplicarCupomCampo(); return; }
  const tira = e.target.closest('[data-tirar-produto]');
  if (tira) { removerProduto(tira.dataset.tirarProduto); irPara(1); return; }
  if (e.target.closest('[data-recarregar]')) { location.reload(); return; }
  // pedido igual já feito: quem vai acompanhar não precisa da sacola com os mesmos itens (o link segue normalmente)
  const acomp = e.target.closest('[data-acompanhar-repetido]');
  if (acomp) { e.preventDefault(); const destino = acomp.href; esquecerEnvio(); limparCarrinho(); location.href = destino; return; }
  const ir = e.target.closest('[data-ir]');
  if (ir && ir.getAttribute('aria-disabled') !== 'true' && Number(ir.dataset.ir) !== passo) irPara(Number(ir.dataset.ir));
});

/* a sacola acompanha o carrinho sem apagar o que a pessoa está digitando */
aoMudar(() => {
  if (!dlgSacola.open || feito) return;
  pintarItens();
  if (!getCarrinho().itens.length) { boxCk.innerHTML = ''; passo = 1; return; }
  if (!boxCk.firstElementChild) { pintarCk(); return; }
  if (passo === 4) { cotacao = null; repetido = null; pintarCk(); cotar(); return; }
  const cupom = $('[data-sc-cupom]', boxCk);
  if (cupom) cupom.innerHTML = htmlCupom();
  $$('[data-sc-totais]', boxCk).forEach(el => { el.innerHTML = htmlTotais(el.hasAttribute('data-final')); });
});

/* ------------------------------------------------------------------ servidor: conferir valores e enviar */
function pedidoParaEnvio() {
  const c = getCarrinho();
  return {
    itens: itensParaEnvio(), modo: c.modo, area: c.modo === 'entrega' ? c.area : null, cupom: c.cupom?.codigo || '',
    telefone: digitos(dados.whats), nome: dados.nome,
    endereco: c.modo === 'entrega' ? { rua: dados.rua, numero: dados.numero, complemento: dados.complemento || '', referencia: dados.referencia || '' } : null,
    quando: agendado() ? 'agendar' : 'agora', hora: agendado() ? horarioEscolhido()?.valor || '' : '',
    pagamento: dados.pagamento, troco: dados.pagamento === 'dinheiro' ? (dados.troco || '') : '',
  };
}
const msgForm = () => $('[data-form-msg]', boxCk);
function mostrarErro(e) {
  const m = msgForm();
  if (!m) { aviso(e.message); return; }
  m.classList.add('is-error');
  const pid = e.dados?.produtoId;
  const nome = pid ? produto(pid)?.nome : '';
  m.innerHTML = `${esc(e.message)}${pid ? ` <button class="linkbtn" type="button" data-tirar-produto="${esc(pid)}">Tirar ${esc(nome || 'o item')} da sacola</button>` : e.dados?.atualizar ? ' <button class="linkbtn" type="button" data-recarregar>Atualizar o cardápio</button>' : ''}`;
}
async function cotar() {
  const pedido = pedidoParaEnvio();
  try {
    const r = await api('api/cotacao', pedido);
    if (passo !== 4) return;
    cotacao = r.cotacao;
    if (cotacao.avisoCupom && getCarrinho().cupom) {
      avisoRevisao = `Cupom removido: ${cotacao.avisoCupom}`;
      msgCupom = { ok: false, msg: cotacao.avisoCupom };
      removerCupom(); // pinta de novo e cota de novo sem o cupom
      return;
    }
    pintarCk();
    const falta = cotacao.modo === 'entrega' && cotacao.minimo > 0 && cotacao.subtotal < cotacao.minimo;
    if (falta) {
      const m = msgForm(); m.classList.add('is-error');
      m.textContent = `O pedido mínimo de entrega${cotacao.area ? ` para ${cotacao.area.nome}` : ''} é de ${brl(cotacao.minimo)} em produtos. Adicione mais itens ou escolha a retirada.`;
      $('[data-confirmar]', boxCk).disabled = true;
    }
  } catch (e) {
    if (passo !== 4) return;
    cotacao = null;
    pintarCk();
    const b = $('[data-confirmar]', boxCk);
    if (b) { b.textContent = 'Tentar de novo'; b.disabled = false; b.removeAttribute('aria-busy'); b.dataset.recotar = '1'; }
    mostrarErro(e);
  }
}
const PASSO_DO_CAMPO = { nome: 2, telefone: 2, whats: 2, rua: 2, numero: 2, complemento: 2, referencia: 2, bairro: 2, modo: 2, quando: 2, hora: 2, pagamento: 3, troco: 3, cupom: 1, minimo: 1, itens: 1 };
async function confirmar(f) {
  const c = getCarrinho();
  if (!c.itens.length) return;
  const btn = $('[data-confirmar]', f);
  if (btn.dataset.recotar) { delete btn.dataset.recotar; cotacao = null; pintarCk(); cotar(); return; }
  if (!cotacao) return;
  const repetir = btn.dataset.repetir === '1'; // a pessoa viu o aviso de pedido igual e quer outro mesmo
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = 'Enviando o pedido…';
  const pedido = pedidoParaEnvio();
  try {
    let r;
    for (let tentativa = 0; ; tentativa++) {
      const prova = await prepararProva(); // em geral já está pronta: começou quando a sacola abriu
      try {
        r = await api('api/pedidos', { ...pedido, chave: chaveDoEnvio(pedido), totalEsperado: cotacao.total, prova, hp: dados.extra || '', ...(repetir ? { repetir: true } : {}) });
        break;
      } catch (e) {
        // prova vencida ou recusada: pede outra e tenta mais uma vez, sem a pessoa perceber
        if (e.dados?.campo === 'prova' && tentativa === 0) { descartarProva(); continue; }
        throw e;
      }
    }
    descartarProva(); // cada prova vale para um pedido só
    esquecerEnvio();
    repetido = null;
    feito = r.pedido;
    guardarPedido(r.pedido);
    limparCarrinho();
    cotacao = null;
    pintarSacola();
    corpo.scrollTop = 0;
    $('[data-done-num]', dlgSacola)?.focus({ preventScroll: true });
  } catch (e) {
    if (e.status === 409 && e.dados?.repetido) {
      repetido = { ...e.dados.repetido, msg: e.message };
      pintarCk();
      $('[data-repetido]', boxCk)?.focus({ preventScroll: false });
      return;
    }
    if (e.status === 409 && e.dados?.cotacao) {
      cotacao = e.dados.cotacao;
      pintarCk();
      const m = msgForm(); m.classList.add('is-error'); m.textContent = e.message;
      return;
    }
    const alvo = PASSO_DO_CAMPO[e.dados?.campo];
    if (alvo && alvo !== 4 && e.status !== 409) {
      if (e.dados.campo === 'cupom') { msgCupom = { ok: false, msg: e.message }; removerCupom(); }
      irPara(alvo);
      const campo = { nome: 'sc-nome', telefone: 'sc-whats', whats: 'sc-whats', rua: 'sc-rua', numero: 'sc-num', bairro: 'sc-bairro', troco: 'sc-troco' }[e.dados.campo];
      if (campo && erro(boxCk, campo, true, e.message) === false) $('#' + campo, boxCk)?.focus();
      else aviso(e.message);
      return;
    }
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = `${repetir ? 'Enviar outro pedido igual' : 'Enviar pedido'} · ${brl(cotacao.total)}`;
    mostrarErro(e);
  }
}
function textoWhats(p) {
  return [
    `Olá, ${LOJA.nome}! Acabei de fazer o pedido nº ${p.numero}.`,
    ...p.itens.map(i => `• ${i.qtd}× ${i.nome}${i.opcoes ? ` (${i.opcoes})` : ''}`),
    `Total: ${brl(p.totais.total)} · pagamento na ${p.modo === 'entrega' ? 'entrega' : 'retirada'}: ${p.pagamento.nome}`,
    p.modo === 'entrega' ? `Entrega: ${p.endereco.rua}, ${p.endereco.numero} · ${p.area}` : 'Retirada no balcão',
  ].join('\n');
}
function htmlFeito(p) {
  return `<div class="done">
    <span class="done__ic">${icone('check')}</span>
    <p class="eyebrow" style="margin:0">${p.agendadoPara ? 'Pedido agendado' : 'Pedido enviado'}</p>
    <h3 class="title done__num" tabindex="-1" data-done-num>Pedido nº ${p.numero}</h3>
    <p class="done__lead">${p.agendadoPara ? `Marcado para ${esc(p.agendadoPara.charAt(0).toLowerCase() + p.agendadoPara.slice(1))}. A gente começa a preparar perto do horário.` : 'A cozinha já recebeu o seu pedido. Acompanhe cada etapa aqui embaixo.'}</p>
    <div class="box">
      <p class="t-label">${p.modo === 'entrega' ? 'Entrega' : 'Retirada'}</p>
      <p>${p.modo === 'entrega' ? `${esc(p.endereco.rua)}, ${esc(p.endereco.numero)} · ${esc(p.area)}` : esc(LOJA.endereco)}</p>
      <p class="muted">Previsão: ${esc(p.agendadoPara || p.prazo)} · ${esc(p.pagamento.nome)} · ${brl(p.totais.total)}</p>
    </div>
    <a class="btn btn--primary btn--lg" href="pedido.html?c=${encodeURIComponent(p.codigo)}">${icone('locate')}Acompanhar pedido</a>
    <a class="btn btn--ghost" href="${linkWhats(textoWhats(p))}" target="_blank" rel="noopener"><img src="assets/icons/whatsapp.svg" alt="" width="18" height="18">Enviar pelo WhatsApp</a>
    <button class="linkbtn" type="button" data-close>Fazer outro pedido</button>
  </div>`;
}

/* ================================================================== cupom pelos botões da página */
function marcarCupom() {
  const c = getCarrinho().cupom;
  $$('[data-apply-coupon]').forEach(b => b.setAttribute('aria-pressed', String(!!c && c.codigo === b.dataset.applyCoupon)));
  $$('[data-coupon-label]').forEach(b => { b.textContent = c && c.codigo === b.dataset.applyCoupon ? `${b.dataset.applyCoupon} aplicado` : `Aplicar ${b.dataset.applyCoupon}`; });
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-apply-coupon]');
  if (!b || b.getAttribute('aria-busy') === 'true') return;
  b.setAttribute('aria-busy', 'true');
  const r = await aplicarCupom(b.dataset.applyCoupon, digitos(dados.whats));
  b.removeAttribute('aria-busy');
  msgCupom = null;
  aviso(r.ok ? `Cupom ${r.cupom.codigo} aplicado: ${r.cupom.curto}.` : r.msg, r.ok && totais().itens ? { rotulo: 'Ver sacola', fazer: () => abrirSacola() } : null);
});
marcarCupom();
aoMudar(marcarCupom);

/* ================================================================== chegou de outra página pedindo a sacola */
if (itensQueSairam()) aviso('Alguns itens da sua sacola mudaram no cardápio e saíram dela. Confira antes de pedir.');
if (['#sacola', '#carrinho'].includes(location.hash)) {
  history.replaceState(null, '', location.pathname);
  abrirSacola();
}
