/* Partes comuns às páginas: aberto/fechado, contador da sacola, tema, menu do celular, janelas, avisos e dados da loja. */
import { LOJA, AREAS, PAGAMENTOS } from './data.js';
import { statusLoja, aoMudar, totais, brl, plural, aplicarTema, temaAtual, linkWhats, hora, esc, DIAS } from './store.js';

/* a logo oficial: o caminho vem do painel (Configurações) */
export function logo() {
  const src = LOJA.logo;
  if (!src) return;
  const probe = new Image();
  probe.onload = () => {
    document.querySelectorAll('.brand__logo').forEach(img => { img.src = src; img.hidden = false; });
    document.documentElement.classList.add('has-logo');
  };
  probe.src = src;
}

export function status() {
  const s = statusLoja();
  document.querySelectorAll('[data-status]').forEach(el => {
    el.classList.toggle('is-open', s.aberto);
    el.classList.toggle('is-closed', !s.aberto);
    const t = el.querySelector('[data-status-text]');
    if (t) t.textContent = s.aberto ? 'Aberto' : s.pausado ? 'Pedidos pausados' : 'Fechado agora';
    const eta = el.querySelector('[data-status-eta]');
    if (eta) eta.textContent = s.aberto ? prazoAgora() : s.pausado ? 'voltamos em instantes' : s.abre ? `abre ${s.abre.quando} às ${hora(s.abre.as)}` : '';
    el.title = s.aberto ? `${s.texto}. ${prazoAgora().replace(/^./, c => c.toUpperCase())}.` : s.pausado ? 'Pausamos os pedidos por alguns minutos.' : 'Você ainda pode deixar o pedido agendado.';
  });
  // botão da primeira dobra: com a loja fechada ele leva ao mesmo cardápio, mas diz que o pedido fica agendado
  document.querySelectorAll('[data-cta-rotulo]').forEach(el => {
    el.textContent = s.aberto ? (LOJA.botao || 'Ver cardápio') : !s.pausado && s.abre ? `Agendar para ${s.abre.quando}` : 'Ver cardápio';
  });
  return s;
}

/* "entrega em 30 a 55 min" (ou o prazo da retirada, quando a loja não entrega) */
function prazoAgora() {
  return LOJA.entrega !== false ? `entrega em ${LOJA.prazoEntrega.replace('–', ' a ')}` : `retirada em ${LOJA.prazoRetirada.replace('–', ' a ')}`;
}

export function contador() {
  const pintar = () => {
    const t = totais();
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = t.itens; });
    document.querySelectorAll('[data-cart-itens]').forEach(el => { el.textContent = plural(t.itens, 'item', 'itens'); });
    document.querySelectorAll('[data-cart-total]').forEach(el => { el.textContent = brl(t.total); });
    document.querySelectorAll('[data-cart-open]').forEach(el => { el.setAttribute('aria-label', `Abrir sacola, ${plural(t.itens, 'item', 'itens')}`); });
    const bar = document.querySelector('[data-cartbar]');
    if (bar) bar.hidden = t.itens === 0;
    document.documentElement.classList.toggle('has-cartbar', !!bar && t.itens > 0);
  };
  pintar();
  aoMudar(pintar);
}

export function bump() {
  document.querySelectorAll('[data-bump]').forEach(b => { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); });
}

export function tema() {
  const btn = document.querySelector('[data-theme-toggle]');
  const rotulo = () => btn?.setAttribute('aria-label', temaAtual() === 'claro' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro');
  rotulo();
  btn?.addEventListener('click', () => {
    aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro');
    rotulo();
  });
}

/* menu do celular */
export function menu() {
  const btn = document.querySelector('[data-menu-toggle]');
  const nav = document.getElementById('menu');
  if (!btn || !nav) return;
  const fechar = () => { nav.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Abrir menu'); };
  btn.addEventListener('click', () => {
    const abrir = nav.hidden;
    nav.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  });
  nav.addEventListener('click', e => { if (e.target.closest('a, button')) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !nav.hidden) { fechar(); btn.focus(); } });
  matchMedia('(min-width: 1024px)').addEventListener('change', fechar);
}

/* janelas (dialog): fechar no fundo, no botão e devolver o foco a quem abriu */
const origem = new WeakMap();
export function registrarDialogo(dlg) {
  if (dlg.dataset.registrado) return;
  dlg.dataset.registrado = '1';
  dlg.addEventListener('click', e => { if (e.target === dlg) fecharDialogo(dlg); });
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) fecharDialogo(dlg); });
  dlg.addEventListener('close', () => {
    const el = origem.get(dlg);
    origem.delete(dlg);
    if (el && document.contains(el) && !document.querySelector('dialog[open]')) el.focus({ preventScroll: true });
  });
}
export function abrirDialogo(dlg) {
  registrarDialogo(dlg);
  if (!origem.has(dlg)) origem.set(dlg, document.activeElement);
  if (!dlg.open) dlg.showModal();
}
export function fecharDialogo(dlg, { semFoco = false } = {}) {
  if (semFoco) origem.delete(dlg);
  if (dlg.open) dlg.close();
}

let timer;
export function aviso(texto, acao) {
  const el = document.querySelector('[data-toast]');
  if (!el) return;
  el.innerHTML = '';
  const p = document.createElement('span');
  p.textContent = texto;
  el.append(p);
  if (acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = acao.rotulo;
    b.addEventListener('click', () => { el.classList.remove('is-on'); acao.fazer(); });
    el.append(b);
  }
  // o aviso precisa ficar acima de uma janela aberta
  const aberta = [...document.querySelectorAll('dialog[open]')].pop();
  if (aberta && el.parentElement !== aberta) aberta.append(el);
  else if (!aberta && el.parentElement !== document.body) document.body.append(el);
  el.classList.add('is-on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-on'), acao ? 6500 : 4200);
}
export function esconderAviso() { document.querySelector('[data-toast]')?.classList.remove('is-on'); }

export function whats() {
  document.querySelectorAll('[data-whats]').forEach(a => { a.href = linkWhats(a.dataset.whats || ''); });
  document.querySelectorAll('[data-whats-texto]').forEach(el => { el.textContent = `WhatsApp ${LOJA.whatsappExibicao}`; });
}

/* ---------- textos que vêm do painel: horários, bairros, endereço, formas de pagamento ---------- */
const NOMES_DIA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
/* dias seguidos com o mesmo horário viram um grupo ("Terça a domingo · 18h às 23h30"); começa na segunda */
export function gruposHorario() {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const grupos = [];
  for (const d of ordem) {
    const h = LOJA.horarios[d];
    const chave = h ? `${h[0]}-${h[1]}` : 'fechado';
    const ult = grupos[grupos.length - 1];
    if (ult && ult.chave === chave) ult.dias.push(d);
    else grupos.push({ chave, dias: [d], h });
  }
  return grupos.map(g => ({
    dias: g.dias.length === 1 ? NOMES_DIA[g.dias[0]] : `${DIAS[g.dias[0]][0].toUpperCase()}${DIAS[g.dias[0]].slice(1)}${g.dias.length === 2 ? ' e ' : ' a '}${DIAS[g.dias[g.dias.length - 1]]}`,
    faixa: g.h ? `${hora(g.h[0])} às ${hora(g.h[1])}` : 'Fechado',
    aberto: !!g.h,
  }));
}
export function dadosLoja() {
  const grupos = gruposHorario();
  const abertos = grupos.filter(g => g.aberto);
  document.querySelectorAll('[data-horarios]').forEach(ul => {
    ul.innerHTML = grupos.map(g => `<li><span>${esc(g.dias)}</span><b>${esc(g.faixa)}</b></li>`).join('');
  });
  document.querySelectorAll('[data-horarios-rodape]').forEach(ul => {
    ul.innerHTML = grupos.map(g => g.aberto ? `<li>${esc(g.dias)}<br>${esc(g.faixa)}</li>` : `<li>${esc(g.dias)}: fechado</li>`).join('');
  });
  document.querySelectorAll('[data-horario-resumo]').forEach(el => {
    el.textContent = abertos.length ? abertos.map(g => `${g.dias}, ${g.faixa}`).join(' · ') : 'Consulte os horários no WhatsApp';
  });
  document.querySelectorAll('[data-areas]').forEach(ul => {
    ul.innerHTML = AREAS.map(a => `<li><span>${esc(a.nome)}<small>${esc(a.prazo.replace('–', ' a '))}</small></span><b>${brl(a.taxa)}</b></li>`).join('')
      + (LOJA.retirada !== false ? `<li><span>Retirada no balcão<small>${esc(LOJA.prazoRetirada.replace('–', ' a '))}</small></span><b>Grátis</b></li>` : '');
  });
  document.querySelectorAll('[data-pag]').forEach(li => { li.hidden = !PAGAMENTOS.some(p => p.id === li.dataset.pag); });
  document.querySelectorAll('[data-endereco]').forEach(el => { el.textContent = LOJA.rua; });
  document.querySelectorAll('[data-bairro]').forEach(el => { el.textContent = LOJA.bairro; });
  const mapa = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${LOJA.rua}, ${LOJA.bairro}${LOJA.cidade ? ', ' + LOJA.cidade : ''}`)}`;
  document.querySelectorAll('[data-mapa]').forEach(a => { a.href = mapa; });
}

export function comum() {
  logo();
  status();
  setInterval(status, 60_000);
  contador();
  tema();
  menu();
  whats();
  dadosLoja();
}
