/*
  Arapuca Burguer · painel — núcleo.
  Estado salvo no navegador, utilidades, ícones, avisos, janelas, menus, formulários, rotas, cabeçalho e barra lateral.
  Scripts comuns (sem módulos) para o painel abrir também com dois cliques no arquivo.
*/
(function () {
  'use strict';
  const BA = (window.BA = window.BA || {});
  BA.telas = {};

  /* ================================================================== utilidades */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = v => moeda.format(Number(v) || 0);
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const num = v => new Intl.NumberFormat('pt-BR').format(v);
  const lerValor = s => {
    const t = String(s ?? '').replace(/[^\d,.-]/g, '');
    if (!t) return NaN;
    const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    return Number.isFinite(n) ? n : NaN;
  };
  const valorCampo = v => (v == null || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toFixed(2).replace('.', ','));
  const FUSO = 'America/Sao_Paulo';
  const dataLonga = (d = new Date()) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSO }).format(d).toUpperCase();
  const hm = t => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }).format(t);
  const minutosDesde = t => Math.max(0, Math.floor((Date.now() - t) / 6e4));
  const decorrido = t => {
    const m = minutosDesde(t);
    if (m < 1) return 'agora';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  };
  const relativo = t => {
    const m = minutosDesde(t);
    if (m < 1) return 'Agora mesmo';
    if (m < 60) return `Há ${m} min`;
    if (m < 1440) return `Há ${Math.floor(m / 60)} h`;
    return `Há ${Math.floor(m / 1440)} d`;
  };
  const hojeISO = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const dataBR = iso => (iso ? iso.split('-').reverse().join('/') : '—');
  const dataCurta = iso => (iso ? iso.split('-').slice(1).reverse().join('/') : '—');
  const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
  const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const uid = p => `${p}-${Math.random().toString(36).slice(2, 8)}`;
  const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const foto = (id, w = 500) => (id ? `../assets/img/photo-${id}-${w}.webp` : '');
  const fotoProduto = (p, grande) => p.imagem || foto(p.foto, grande && !p.so500 ? 960 : 500);
  const suave = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  Object.assign(BA, { $, $$, esc, brl, r2, num, lerValor, valorCampo, dataLonga, hm, minutosDesde, decorrido, relativo, hojeISO, dataBR, dataCurta, plural, slug, uid, normal, foto, fotoProduto, suave });

  /* ================================================================== ícones (Lucide, licença ISC) */
  const I = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    receipt: '<path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.93.6a1.3 1.3 0 0 0 1.4 0l.94-.6a1.3 1.3 0 0 1 1.4 0l.93.6a1.3 1.3 0 0 0 1.4 0l.93-.6a1.3 1.3 0 0 1 1.4 0l.94.6a1.3 1.3 0 0 0 1.4 0l.93-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.93-.6a1.3 1.3 0 0 0-1.4 0l-.94.6a1.3 1.3 0 0 1-1.4 0l-.93-.6a1.3 1.3 0 0 0-1.4 0l-.93.6a1.3 1.3 0 0 1-1.4 0l-.94-.6a1.3 1.3 0 0 0-1.4 0l-.93.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    burger: '<path d="M4 10.5C4 7 7.6 4 12 4s8 3 8 6.5z"/><path d="M3 14h18"/><path d="M5 17.5h14a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5z"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15M9 3.236v15"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    'volume-on': '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    'volume-off': '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7M19 12H5"/>',
    'arrow-right': '<path d="M5 12h14m-7-7 7 7-7 7"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7M12 19V5"/>',
    'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    'arrow-up-down': '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
    bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    store: '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/><path d="M2.5 7.5 5 3h14l2.5 4.5a2.5 2.5 0 0 1-4.75 1 2.5 2.5 0 0 1-4.75 0 2.5 2.5 0 0 1-4.75 0A2.5 2.5 0 0 1 2.5 7.5"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    pix: '<path d="m12 2.5 3.6 3.6-3.6 3.6-3.6-3.6zM5.5 9l3.6 3.6-3.6 3.6L2 12.6zM18.5 9l3.5 3.6-3.5 3.6-3.6-3.6zM12 15.3l3.6 3.6-3.6 3.6-3.6-3.6z"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    bag: '<path d="M16 10a4 4 0 0 1-8 0M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
    'trending-up': '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
    phone2: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    calendar: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    play: '<path d="M6 3l14 9-14 9z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    logout: '<path d="m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    fail: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12M3.29 7 12 12l8.71-5M7.5 4.27l9 5.15"/>',
    cup: '<path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"/><path d="M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/><path d="m12 8 1-6h2"/>',
    'ice-cream': '<path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11"/><path d="M17 7A5 5 0 0 0 7 7"/><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };
  const icone = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[n] || ''}</svg>`;
  BA.icone = icone;

  /* ================================================================== servidor */
  let csrf = document.querySelector('meta[name="csrf"]')?.content || '';
  class ErroApi extends Error { constructor(msg, status, dados) { super(msg); this.status = status; this.dados = dados || {}; } }
  /* tempo (ms): desiste da resposta depois disso (a consulta de novidades não pode ficar presa) */
  BA.api = async (url, dados, { tempo = 0 } = {}) => {
    const post = dados !== undefined;
    const ctrl = tempo ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), tempo) : null;
    let r;
    try {
      r = await fetch(url, {
        method: post ? 'POST' : 'GET', credentials: 'same-origin', signal: ctrl?.signal,
        headers: { Accept: 'application/json', ...(post ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}) },
        body: post ? JSON.stringify(dados) : undefined,
      });
    } catch { clearTimeout(t); throw new ErroApi('Sem conexão com a internet. A alteração não foi salva.', 0); }
    clearTimeout(t);
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (r.status === 401) { location.reload(); throw new ErroApi('Sua sessão terminou. Entre de novo.', 401); }
    if (r.status === 403 && j?.exige2fa && !document.querySelector('dialog .passos-2fa')) BA.abrir2fa?.({ obrigatorio: true });
    if (!r.ok || !j || j.ok === false) throw new ErroApi(j?.erro || 'Não deu certo agora. Tente de novo em instantes.', r.status, j);
    if (j.csrf) csrf = j.csrf;
    return j;
  };

  /* ================================================================== estado (vem do banco; cada alteração volta para o banco) */
  const K_SOM = 'brasa-admin:som';
  BA.estado = null;
  // coleções que o painel edita: categorias e grupos antes de produtos (os produtos apontam para eles)
  const COLECOES = ['categorias', 'grupos', 'produtos', 'cupons', 'areas', 'banners', 'config', 'logo', 'operacao', 'usuarios', 'notificacoes'];
  const base = {}; // última versão confirmada pelo servidor (texto JSON) de cada coleção
  const retrato = nome => JSON.stringify(BA.estado[nome]);
  const marcarBase = nome => { base[nome] = retrato(nome); };
  const substituir = (alvo, fonte) => { Object.keys(alvo).forEach(k => { if (!(k in fonte)) delete alvo[k]; }); Object.assign(alvo, fonte); };
  /* troca o conteúdo sem trocar os objetos: as telas abertas continuam apontando para o mesmo item */
  function reconciliar(nome, novo) {
    const atual = BA.estado[nome];
    if (Array.isArray(novo) && Array.isArray(atual)) {
      const porId = new Map(atual.filter(x => x && x.id !== undefined).map(x => [x.id, x]));
      atual.splice(0, atual.length, ...novo.map(n => { const v = porId.get(n.id); if (v) { substituir(v, n); return v; } return n; }));
    } else if (novo && atual && typeof novo === 'object' && typeof atual === 'object') substituir(atual, novo);
    else BA.estado[nome] = novo;
  }
  BA.carregar = async () => {
    try {
      const r = await BA.api('api/estado');
      BA.estado = r.estado;
      let som = true;
      try { som = localStorage.getItem(K_SOM) !== '0'; } catch { /* sem armazenamento */ }
      BA.estado.preferencias = { som };
      COLECOES.forEach(marcarBase);
      desde = r.estado.agora;
      rev = r.estado.rev || 0;
      ultimoOk = Date.now();
      iniciar();
      setInterval(novidades, INTERVALO);
      iniciarAvisos();
    } catch (e) {
      // o clique é ligado aqui: a política de segurança da página bloqueia "onclick" escrito no HTML
      $('#conteudo').innerHTML = `<div class="page"><div class="card">${BA.vazio({ icone: 'alert', titulo: 'Não conseguimos abrir o painel', texto: esc(e.message), acao: '<button class="btn btn--primary" type="button" data-recarregar>Tentar de novo</button>' })}</div></div>`;
      $('[data-recarregar]')?.addEventListener('click', () => location.reload());
    }
  };
  BA.salvarSom = on => { try { localStorage.setItem(K_SOM, on ? '1' : '0'); } catch { /* sem armazenamento */ } };

  let fila = Promise.resolve();
  let pedido = false;
  /* chamado pelas telas depois de mudar o estado: envia só as coleções que mudaram.
     Devolve uma promessa que termina quando o envio acaba; BA.salvou(nome) diz se aquela coleção foi aceita. */
  const resultado = {};
  BA.salvou = nome => resultado[nome] !== false;
  BA.esquecerResultado = nome => { delete resultado[nome]; };
  BA.salvar = () => {
    if (!pedido) {
      pedido = true;
      queueMicrotask(() => { pedido = false; fila = fila.then(sincronizar, sincronizar); });
    }
    return new Promise(fim => queueMicrotask(() => fila.then(fim, fim)));
  };
  BA.marcarSalvo = nome => marcarBase(nome);
  BA.reconciliarColecao = (nome, dados) => { reconciliar(nome, dados); marcarBase(nome); };
  /* listas do cardápio, cupons, áreas e banners: vai só o que mudou, com a versão que a pessoa estava vendo (BD-02).
     Se outra pessoa mexeu no mesmo item, o servidor recusa e devolve a lista atual: nada do trabalho dela some. */
  const LISTAS = new Set(['categorias', 'grupos', 'produtos', 'cupons', 'areas', 'banners']);
  function diferenca(nome, enviado) {
    const antes = JSON.parse(base[nome] || '[]');
    const agora = JSON.parse(enviado);
    const mapa = new Map(antes.map(x => [x.id, JSON.stringify(x)]));
    const ids = new Set(agora.map(x => x.id));
    return {
      // item novo (ou cópia de outro) vai sem versão: para o servidor, é um item que ainda não existe
      alterados: agora.filter(x => mapa.get(x.id) !== JSON.stringify(x)).map(x => { if (mapa.has(x.id)) return x; const { versao, ...resto } = x; return resto; }),
      removidos: antes.filter(x => !ids.has(x.id)).map(x => ({ id: x.id, versao: x.versao })),
      ordem: agora.map(x => x.id),
    };
  }
  async function sincronizar() {
    for (const nome of COLECOES) {
      if (!BA.estado || retrato(nome) === base[nome]) continue;
      const enviado = retrato(nome);
      const corpo = LISTAS.has(nome) ? { mudancas: diferenca(nome, enviado) } : { dados: JSON.parse(enviado) };
      // mexer nos acessos pede a senha de quem está mexendo (a tela de usuários pergunta antes de salvar)
      if (nome === 'usuarios') { corpo.senhaAtual = BA.confirmacaoSenha || ''; BA.confirmacaoSenha = ''; }
      try {
        const r = await BA.api(`api/colecao/${nome}`, corpo);
        resultado[nome] = true;
        if (retrato(nome) === enviado) { reconciliar(nome, r.dados); marcarBase(nome); }
        else { base[nome] = JSON.stringify(r.dados); BA.salvar(); } // mudou de novo enquanto salvava: envia outra vez
        if (['produtos', 'categorias', 'banners', 'usuarios', 'config', 'logo'].includes(nome)) BA.emit('salvo', nome);
      } catch (e) {
        resultado[nome] = false;
        if (e.status === 401) return;
        if (e.status === 409 && e.dados?.dados) {
          // outra pessoa mexeu no mesmo item: a tela passa a mostrar a lista atual do servidor
          reconciliar(nome, e.dados.dados);
          marcarBase(nome);
          BA.toast(e.message, 'alerta');
        } else if (e.dados?.recarregar) {
          BA.toast(e.message, 'erro');
          reconciliar(nome, JSON.parse(base[nome]));
        } else {
          BA.toast(e.message || 'Não foi possível salvar. A alteração foi desfeita.', 'erro');
          reconciliar(nome, JSON.parse(base[nome]));
        }
        BA.emit('mudou');
        BA.render();
      }
    }
  }
  /* pedidos novos e mudanças feitas em outro aparelho: o painel pergunta ao servidor a cada 15 s
     (cada pergunta conta no limite diário de acessos da hospedagem; 15 s é o equilíbrio entre aviso rápido e consumo) */
  const INTERVALO = 15_000;
  let desde = 0;
  let rev = 0; // revisão do banco: os pedidos que mudaram depois dela (não depende do relógio: PED-07)
  let buscando = false;
  let ultimoOk = 0, falhas = 0;
  async function novidades() {
    if (buscando || !BA.estado) return;
    buscando = true;
    try {
      const r = await BA.api(`api/novidades?desde=${Math.max(0, desde - 5000)}&rev=${rev}`, undefined, { tempo: 12_000 });
      desde = r.agora;
      if (typeof r.rev === 'number') rev = Math.max(rev, r.rev);
      marcarConexao(true);
      const e = BA.estado;
      const novos = [];
      let mudou = false;
      r.pedidos.forEach(p => {
        const v = e.pedidos.find(x => x.numero === p.numero);
        if (!v) { if (BA.doPainel(p)) { e.pedidos.push(p); novos.push(p); mudou = true; } }
        else if (v.rev !== p.rev || v.atualizadoEm !== p.atualizadoEm) { substituir(v, p); mudou = true; }
      });
      const ids = new Set(e.notificacoes.map(n => n.id));
      const avisos = r.notificacoes.filter(n => !ids.has(n.id));
      if (avisos.length) {
        const pendente = retrato('notificacoes') !== base.notificacoes;
        e.notificacoes.unshift(...avisos.sort((a, b) => b.em - a.em));
        if (!pendente) marcarBase('notificacoes');
        mudou = true;
      }
      if (JSON.stringify(r.operacao) !== retrato('operacao') && retrato('operacao') === base.operacao) {
        substituir(e.operacao, r.operacao);
        marcarBase('operacao');
        mudou = true;
      }
      if (mudou) BA.emit('mudou');
      const doSite = novos.filter(p => p.status === 'novo');
      if (doSite.length) {
        BA.tocarSom();
        BA.toast(doSite.length === 1 ? `Novo pedido #${doSite[0].numero}: ${doSite[0].cliente.nome} · ${brl(doSite[0].total)}` : `${doSite.length} pedidos novos chegaram.`, 'info');
        if (BA.telas.pedidos) BA.telas.pedidos.destacar = doSite[doSite.length - 1].numero;
        document.title = `(${BA.contarPedidos().novo}) ${document.title.replace(/^\(\d+\)\s*/, '')}`;
      }
    } catch { falhas++; /* sem conexão: tenta de novo no próximo ciclo; depois de 30 s, avisa (vigiarConexao) */ }
    buscando = false;
  }
  BA.buscarNovidades = novidades;

  /* ================================================================== avisos que não podem passar despercebidos
     - sem conexão por mais de 30 s: faixa vermelha, alarme e "Sem conexão" no cartão da loja;
     - o navegador só libera o som depois de um clique na página: até lá, uma faixa pede esse clique;
     - enquanto houver pedido novo sem resposta, o som se repete a cada 20 s;
     - em tablets e celulares, a tela fica ligada enquanto o painel está aberto. */
  let semConexao = false, gesto = false, travaTela = null;
  BA.semConexao = () => semConexao;
  function faixa(id, { tipo = 'erro', texto = '', acao = '', aoClicar } = {}) {
    let el = document.getElementById(`faixa-${id}`);
    if (!texto) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = `faixa-${id}`;
      el.className = `faixa faixa--${tipo}`;
      el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
      $('.main').insertBefore(el, $('#conteudo'));
    }
    el.innerHTML = `${icone(tipo === 'erro' ? 'alert' : 'info', 'ic faixa__ic')}<p class="faixa__txt"></p>${acao ? `<button class="btn btn--sm ${tipo === 'erro' ? 'btn--primary' : 'btn--ghost'}" type="button" data-faixa-acao></button>` : ''}`;
    $('.faixa__txt', el).textContent = texto;
    const b = $('[data-faixa-acao]', el);
    if (b) { b.textContent = acao; if (aoClicar) b.addEventListener('click', aoClicar); }
  }
  function marcarConexao(ok) {
    if (!ok) return;
    ultimoOk = Date.now();
    falhas = 0;
    if (!semConexao) return;
    semConexao = false;
    faixa('conexao');
    pintarGlobais();
    BA.toast('Conexão de volta. O painel está atualizado.', 'info');
  }
  function vigiarConexao() {
    // duas falhas seguidas e nada certo há 30 s (aba escondida demora mais, mas não falha: não dispara aqui)
    if (semConexao || falhas < 2 || Date.now() - ultimoOk < 30_000) return;
    semConexao = true;
    faixa('conexao', { tipo: 'erro', texto: 'Sem conexão com o servidor há mais de 30 segundos. Pedidos novos podem não aparecer. Confira a internet e mantenha esta página aberta.', acao: 'Tentar agora', aoClicar: () => novidades() });
    pintarGlobais();
    BA.tocarSom('alarme');
  }
  function pedirSom() {
    if (gesto || !BA.estado?.preferencias?.som || !BA.pode('pedidos')) return;
    faixa('som', { tipo: 'info', texto: 'Para ouvir o aviso de pedido novo, clique uma vez em qualquer lugar do painel: o navegador só libera o som depois de um clique.', acao: 'Ativar som', aoClicar: () => { liberarSom(); BA.tocarSom(); } });
  }
  function liberarSom() {
    if (gesto) return;
    gesto = true;
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* navegador sem áudio */ }
    faixa('som');
    manterTelaLigada();
  }
  async function manterTelaLigada() {
    if (travaTela || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      travaTela = await navigator.wakeLock.request('screen');
      travaTela.addEventListener('release', () => { travaTela = null; });
    } catch { travaTela = null; /* sem permissão ou sem suporte: segue sem */ }
  }
  function repetirAviso() {
    if (BA.estado?.preferencias?.som && BA.contarPedidos().novo > 0) BA.tocarSom();
  }
  function iniciarAvisos() {
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, liberarSom, { capture: true, passive: true }));
    pedirSom();
    setInterval(vigiarConexao, 5_000);
    setInterval(repetirAviso, 20_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { novidades(); manterTelaLigada(); } });
    addEventListener('online', () => novidades());
    manterTelaLigada();
  }
  /* pedido alterado pelo servidor (etapa nova ou pedido de balcão): atualiza a lista no lugar */
  BA.atualizarPedido = p => {
    const v = BA.estado.pedidos.find(x => x.numero === p.numero);
    if (v) substituir(v, p); else if (BA.doPainel(p)) BA.estado.pedidos.push(p);
    return v || p;
  };
  /* o quadro de pedidos mostra os de hoje, os em andamento e os agendados (os outros ficam no Histórico) */
  const inicioHoje = () => { const [a, m, d] = hojeISO().split('-').map(Number); return Date.UTC(a, m - 1, d, 3); }; // 00h de Brasília = 03h UTC
  BA.doPainel = p => ['novo', 'confirmado', 'preparo', 'entrega'].includes(p.status) || p.criadoEm >= inicioHoje() || (p.agendadoPara || 0) >= inicioHoje();
  /* permissões do usuário logado */
  BA.pode = perm => !perm || (BA.estado?.admin?.permissoes || []).includes(perm);

  /* eventos simples entre telas */
  const ouvintes = {};
  BA.on = (ev, fn) => { (ouvintes[ev] = ouvintes[ev] || new Set()).add(fn); return () => ouvintes[ev].delete(fn); };
  BA.emit = (ev, dado) => [...(ouvintes[ev] || [])].forEach(fn => fn(dado)); // cópia: quem ouve pode se re-registrar

  /* ================================================================== avisos */
  let pilha;
  BA.toast = (msg, tipo = 'ok') => {
    if (!pilha) {
      pilha = document.createElement('div');
      pilha.className = 'toasts';
      pilha.setAttribute('role', 'status');
      pilha.setAttribute('aria-live', 'polite');
      if ('popover' in HTMLElement.prototype) pilha.setAttribute('popover', 'manual');
      document.body.append(pilha);
    }
    const t = document.createElement('div');
    t.className = `toast toast--${tipo}`;
    const ic = { ok: 'ok', erro: 'fail', info: 'info', alerta: 'alert' }[tipo] || 'ok';
    t.innerHTML = `${icone(ic, 'ic toast__ic')}<p class="toast__msg"></p><button class="toast__x" type="button" aria-label="Fechar aviso">${icone('x')}</button>`;
    $('.toast__msg', t).textContent = msg;
    const sai = () => { t.classList.add('is-out'); setTimeout(() => t.remove(), 200); };
    $('.toast__x', t).addEventListener('click', sai);
    pilha.append(t);
    while (pilha.children.length > 4) pilha.firstElementChild.remove();
    if (pilha.hasAttribute('popover')) { try { pilha.hidePopover(); } catch { /* já fechado */ } try { pilha.showPopover(); } catch { /* sem suporte */ } }
    setTimeout(sai, tipo === 'erro' ? 5200 : 3800);
  };

  /* ================================================================== janelas: modal, gaveta, confirmação */
  let nJanela = 0;
  BA.janela = ({ tipo = 'modal', tamanho = 'md', titulo, sub = '', corpo = '', rodape = '', classe = '', aoAbrir, aoFechar, fixa = false }) => {
    const id = `jan-${++nJanela}`;
    const d = document.createElement('dialog');
    d.className = `${tipo === 'gaveta' ? 'drawer' : `dlg dlg--${tamanho}`} ${classe}`;
    d.setAttribute('aria-labelledby', `${id}-t`);
    d.innerHTML = `
      <div class="dlg__head">
        <div><h2 class="dlg__title" id="${id}-t" tabindex="-1">${titulo}</h2>${sub ? `<p class="dlg__sub">${sub}</p>` : ''}</div>
        ${fixa ? '' : `<button class="btn-icon btn-icon--sm" type="button" data-fechar aria-label="Fechar">${icone('x')}</button>`}
      </div>
      <div class="dlg__body">${corpo}</div>
      ${rodape ? `<div class="dlg__foot">${rodape}</div>` : ''}`;
    const origem = document.activeElement;
    document.body.append(d);
    d.addEventListener('click', e => { if ((!fixa && e.target === d) || e.target.closest('[data-fechar]')) d.close(); });
    if (fixa) d.addEventListener('cancel', e => { if (!d.dataset.liberada) e.preventDefault(); });
    d.addEventListener('close', () => {
      aoFechar?.(d);
      setTimeout(() => d.remove(), 320);
      if (origem && document.contains(origem) && typeof origem.focus === 'function') origem.focus({ preventScroll: true });
    });
    d.showModal();
    aoAbrir?.(d);
    return d;
  };
  BA.confirmar = ({ titulo, texto, botao = 'Confirmar', perigo = false, extra = '' }) => new Promise(resolve => {
    let resposta = false;
    const d = BA.janela({
      tamanho: 'sm', titulo, classe: 'confirm',
      corpo: `<p class="confirm__txt">${texto}</p>${extra ? `<div style="margin-top:16px">${extra}</div>` : ''}`,
      rodape: `<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn ${perigo ? 'btn--danger-solid' : 'btn--primary'}" type="button" data-ok>${botao}</button>`,
      aoFechar: () => resolve(resposta),
    });
    $('[data-ok]', d).addEventListener('click', () => {
      const campo = $('[data-campo]', d);
      if (campo && campo.hasAttribute('required') && !campo.value.trim()) { erroCampo(campo, campo.dataset.msg || 'Escolha ou escreva um motivo.'); campo.focus(); return; }
      // senha vai como foi digitada (sem cortar espaços)
      resposta = campo ? (campo.type === 'password' ? campo.value : campo.value.trim()) || true : true;
      d.close();
    });
    (perigo ? $('[data-fechar].btn', d) : $('[data-ok]', d)).focus();
  });

  /* ================================================================== menus suspensos */
  let menuAberto = null;
  function fecharMenu(devolver = true) {
    if (!menuAberto) return;
    const { el, botao } = menuAberto;
    menuAberto = null;
    el.remove();
    botao.setAttribute('aria-expanded', 'false');
    if (devolver) botao.focus({ preventScroll: true });
  }
  function posicionar(el, botao, alinhar) {
    const r = botao.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = alinhar === 'esquerda' ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  BA.menu = (botao, itens, { alinhar = 'direita', html, classe = '' } = {}) => {
    if (menuAberto && menuAberto.botao === botao) { fecharMenu(); return null; }
    fecharMenu(false);
    const el = document.createElement('div');
    el.className = `menu ${classe}`;
    if (html) el.innerHTML = html;
    else {
      el.setAttribute('role', 'menu');
      el.innerHTML = itens.map((it, i) => it === '-' ? '<hr class="menu__sep">'
        : `<button type="button" role="menuitem" class="menu__item${it.perigo ? ' is-danger' : ''}" data-i="${i}"${it.desativado ? ' disabled' : ''}>${it.icone ? icone(it.icone) : ''}<span>${esc(it.rotulo)}</span></button>`).join('');
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const it = itens[+b.dataset.i];
        fecharMenu(false);
        botao.focus({ preventScroll: true });
        it.acao?.();
      });
    }
    document.body.append(el);
    posicionar(el, botao, alinhar);
    botao.setAttribute('aria-expanded', 'true');
    menuAberto = { el, botao };
    requestAnimationFrame(() => (el.querySelector('[role="menuitem"]:not([disabled]), button, a') || el).focus?.());
    return el;
  };
  document.addEventListener('pointerdown', e => { if (menuAberto && !menuAberto.el.contains(e.target) && !menuAberto.botao.contains(e.target)) fecharMenu(false); });
  document.addEventListener('keydown', e => {
    if (!menuAberto) return;
    if (e.key === 'Escape') { e.preventDefault(); fecharMenu(); return; }
    if (e.key === 'Tab') { fecharMenu(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const itens = $$('button:not([disabled]), a', menuAberto.el);
      if (!itens.length) return;
      e.preventDefault();
      const i = itens.indexOf(document.activeElement);
      itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length].focus();
    }
  });
  addEventListener('resize', () => fecharMenu(false));
  document.addEventListener('scroll', () => fecharMenu(false), true);
  BA.fecharMenu = fecharMenu;

  /* ================================================================== formulários */
  BA.campo = ({ id, rotulo, tipo = 'text', valor = '', obrigatorio = false, ajuda = '', placeholder = '', attrs = '', pre = '', suf = '', opcoes, linhas, classe = '', opcional = false }) => {
    const req = obrigatorio ? '<span class="req" aria-hidden="true">*</span>' : '';
    const opt = opcional ? ' <span class="opt">(opcional)</span>' : '';
    const desc = `aria-describedby="${id}-err${ajuda ? ` ${id}-help` : ''}"`;
    let ctrl;
    if (opcoes) {
      ctrl = `<select class="sel" id="${id}" name="${id}" ${obrigatorio ? 'required' : ''} ${desc} ${attrs}>${opcoes.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(valor) ? ' selected' : ''}${o.d ? ' disabled' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
    } else if (tipo === 'textarea') {
      ctrl = `<textarea class="txa" id="${id}" name="${id}" rows="${linhas || 3}" placeholder="${esc(placeholder)}" ${obrigatorio ? 'required' : ''} ${desc} ${attrs}>${esc(valor)}</textarea>`;
    } else {
      const inp = `<input class="inp${pre ? ' has-pre' : ''}${suf ? ' has-suf' : ''}" id="${id}" name="${id}" type="${tipo}" value="${esc(valor)}" placeholder="${esc(placeholder)}" ${obrigatorio ? 'required' : ''} ${desc} ${attrs}>`;
      ctrl = pre || suf ? `<div class="affix">${pre ? `<span class="affix__pre">${pre}</span>` : ''}${inp}${suf ? `<span class="affix__suf">${suf}</span>` : ''}</div>` : inp;
    }
    return `<div class="fld ${classe}"><label class="fld__label" for="${id}">${rotulo}${req}${opt}</label>${ctrl}${ajuda ? `<p class="fld__help" id="${id}-help">${ajuda}</p>` : ''}<p class="fld__err" id="${id}-err" hidden></p></div>`;
  };
  BA.interruptor = ({ id, rotulo, desc = '', marcado = false, attrs = '', classe = '' }) =>
    `<label class="switch ${classe}"><input type="checkbox" role="switch" id="${id}" name="${id}" ${marcado ? 'checked' : ''} ${attrs}><span class="switch__track" aria-hidden="true"></span>${rotulo ? `<span class="switch__txt"><span class="switch__label">${rotulo}</span>${desc ? `<span class="switch__desc">${desc}</span>` : ''}</span>` : ''}</label>`;
  BA.linhaInterruptor = ({ id, rotulo, desc = '', marcado = false, attrs = '', classe = '' }) =>
    `<div class="switch-row"><label for="${id}" class="switch__txt" style="cursor:pointer"><span class="switch__label">${rotulo}</span>${desc ? `<span class="switch__desc">${desc}</span>` : ''}</label>${BA.interruptor({ id, rotulo: '', marcado, attrs: `${attrs} aria-label="${esc(rotulo)}"`, classe })}</div>`;
  BA.caixa = ({ nome, valor, rotulo, marcado = false, tipo = 'checkbox', extra = '' }) =>
    `<label class="chk"><input type="${tipo}" name="${nome}" value="${esc(valor)}" ${marcado ? 'checked' : ''}><span class="chk__box" aria-hidden="true">${icone('check')}</span>${extra}<span>${rotulo}</span></label>`;

  function erroCampo(el, msg) {
    const p = document.getElementById(`${el.id}-err`);
    if (msg) { el.setAttribute('aria-invalid', 'true'); if (p) { p.innerHTML = `${icone('alert')}${esc(msg)}`; p.hidden = false; } }
    else { el.removeAttribute('aria-invalid'); if (p) p.hidden = true; }
  }
  BA.erroCampo = erroCampo;
  /* regras: [[id, valor => mensagem de erro ou ''], ...] */
  BA.validar = (raiz, regras) => {
    let primeiro = null;
    for (const [id, teste] of regras) {
      const el = raiz.querySelector(`#${id}`);
      if (!el) continue;
      const msg = teste(el.value.trim(), el) || '';
      erroCampo(el, msg);
      if (msg && !primeiro) primeiro = el;
    }
    if (primeiro) {
      primeiro.focus();
      primeiro.scrollIntoView({ block: 'center', behavior: suave() });
      BA.toast('Confira os campos destacados antes de salvar.', 'erro');
      return false;
    }
    return true;
  };
  BA.obrig = msg => v => (v ? '' : msg);
  document.addEventListener('input', e => { if (e.target.getAttribute?.('aria-invalid') === 'true') erroCampo(e.target, ''); });
  document.addEventListener('change', e => { if (e.target.getAttribute?.('aria-invalid') === 'true') erroCampo(e.target, ''); });
  BA.mascaraFone = v => {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  BA.mascaraCnpj = v => {
    const d = String(v).replace(/\D/g, '').slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  };
  BA.mascaraCep = v => { const d = String(v).replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
  document.addEventListener('input', e => {
    const m = e.target.dataset?.mascara;
    if (!m) return;
    const f = { fone: BA.mascaraFone, cnpj: BA.mascaraCnpj, cep: BA.mascaraCep, codigo: v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) }[m];
    if (f) e.target.value = f(e.target.value);
  });

  /* envio de imagem com pré-visualização (reduzida para caber no navegador) */
  // formato 'png' mantém o fundo transparente (logo); 'jpeg' deixa fotos leves
  BA.upload = (raiz, { valor = '', aoMudar, largo = false, rotulo = 'Imagem', formato = 'jpeg', max: maxLado = 900 }) => {
    const id = uid('upl');
    raiz.innerHTML = `
      <div class="upl${largo ? ' upl--wide' : ''}">
        <div class="upl__drop" data-drop>
          <input type="file" id="${id}" accept="image/png, image/jpeg, image/webp" aria-label="${esc(rotulo)}: escolher arquivo">
          <div class="upl__ph" data-ph>${icone('upload')}<strong>Arraste a imagem ou clique para escolher</strong><span>JPG, PNG ou WebP · até 5 MB</span></div>
          <img class="upl__img" data-img alt="" hidden>
        </div>
        <div class="upl__acts">
          <label class="btn btn--ghost btn--sm" for="${id}">${icone('image')}Trocar imagem</label>
          <button class="btn btn--ghost btn--sm" type="button" data-remover>${icone('trash')}Remover</button>
        </div>
        <p class="fld__err" id="${id}-err" hidden></p>
      </div>`;
    const img = $('[data-img]', raiz), ph = $('[data-ph]', raiz), drop = $('[data-drop]', raiz), input = $('input', raiz), rem = $('[data-remover]', raiz);
    const mostrar = src => { img.hidden = !src; ph.hidden = !!src; rem.disabled = !src; if (src) img.src = src; else img.removeAttribute('src'); };
    mostrar(valor);
    const ler = file => {
      const err = $(`#${id}-err`, raiz);
      err.hidden = true;
      if (!file) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { err.innerHTML = `${icone('alert')}Use uma imagem JPG, PNG ou WebP.`; err.hidden = false; return; }
      if (file.size > 5 * 1024 * 1024) { err.innerHTML = `${icone('alert')}A imagem passa de 5 MB.`; err.hidden = false; return; }
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, maxLado / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const url = formato === 'png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', .82);
          mostrar(url);
          aoMudar?.(url);
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    };
    input.addEventListener('change', () => ler(input.files[0]));
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', e => { e.preventDefault(); ler(e.dataTransfer.files[0]); });
    rem.addEventListener('click', () => { input.value = ''; mostrar(''); aoMudar?.(''); });
  };

  /* entrada de etiquetas (ex.: ingredientes) */
  BA.etiquetas = (raiz, { valores = [], id, placeholder = 'Digite e tecle Enter' }) => {
    const lista = [...valores];
    raiz.innerHTML = `<div class="tags-in" data-box><input id="${id}" type="text" placeholder="${esc(placeholder)}" aria-describedby="${id}-help"></div><p class="fld__help" id="${id}-help">Tecle Enter ou vírgula para adicionar. Backspace apaga o último.</p>`;
    const box = $('[data-box]', raiz), inp = $('input', raiz);
    const pintar = () => {
      $$('.tchip', box).forEach(c => c.remove());
      lista.forEach((v, i) => inp.insertAdjacentHTML('beforebegin', `<span class="tchip">${esc(v)}<button type="button" data-tira="${i}" aria-label="Remover ${esc(v)}">${icone('x')}</button></span>`));
    };
    const add = () => { const v = inp.value.replace(/,/g, '').trim(); if (v && !lista.includes(v)) lista.push(v); inp.value = ''; pintar(); };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
      else if (e.key === 'Backspace' && !inp.value && lista.length) { lista.pop(); pintar(); }
    });
    inp.addEventListener('blur', add);
    box.addEventListener('click', e => { const b = e.target.closest('[data-tira]'); if (b) { lista.splice(+b.dataset.tira, 1); pintar(); inp.focus(); } else inp.focus(); });
    pintar();
    return () => [...lista];
  };

  /* som de novo pedido (Web Audio, sem arquivo) */
  let audio;
  /* tipo 'pedido' (três notas subindo) ou 'alarme' (duas notas alternadas, para falta de conexão) */
  BA.tocarSom = (tipo = 'pedido') => {
    if (!BA.estado.preferencias.som) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume?.();
      if (audio.state !== 'running' && !gesto) pedirSom(); // o navegador ainda não liberou o som: pede um clique
      const t = audio.currentTime;
      (tipo === 'alarme' ? [523, 392, 523, 392] : [880, 1175, 1568]).forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * .12);
        g.gain.linearRampToValueAtTime(.18, t + i * .12 + .02);
        g.gain.exponentialRampToValueAtTime(.001, t + i * .12 + .35);
        o.connect(g).connect(audio.destination);
        o.start(t + i * .12); o.stop(t + i * .12 + .4);
      });
    } catch { /* navegador sem áudio */ }
  };

  /* estados de carregamento */
  BA.esqueleto = tipo => {
    const linha = (w, h = 12) => `<div class="sk sk-line" style="width:${w};height:${h}px"></div>`;
    const bloco = h => `<div class="sk" style="height:${h}px;border-radius:12px"></div>`;
    if (tipo === 'kanban') return `<div class="page" aria-hidden="true"><div class="toolbar">${linha('420px', 38)}${linha('150px', 40)}</div><div class="kanban">${[0, 1, 2, 3].map(() => `<div class="col">${linha('60%', 18)}${bloco(140)}${bloco(140)}${bloco(140)}</div>`).join('')}</div></div>`;
    if (tipo === 'grade') return `<div class="page" aria-hidden="true"><div class="toolbar">${linha('320px', 42)}${linha('260px', 40)}</div><div class="pgrid">${Array.from({ length: 8 }, () => `<div class="card card--flush">${bloco(190)}<div style="padding:16px;display:grid;gap:10px">${linha('40%')}${linha('70%', 20)}${linha('90%')}${linha('35%', 22)}</div></div>`).join('')}</div></div>`;
    if (tipo === 'tabela') return `<div class="page" aria-hidden="true"><div class="toolbar">${linha('320px', 42)}${linha('170px', 40)}</div><div class="card" style="display:grid;gap:18px">${Array.from({ length: 6 }, () => `<div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr 80px;gap:16px;align-items:center">${bloco(40)}${linha('80%')}${linha('60%')}${linha('50%')}${linha('100%', 28)}</div>`).join('')}</div></div>`;
    return `<div class="page" aria-hidden="true"><div>${linha('140px')}<div style="height:12px"></div>${linha('320px', 30)}</div><div class="metrics">${[0, 1, 2, 3].map(() => bloco(132)).join('')}</div><div class="dash"><div class="dash__recent">${bloco(380)}</div><div class="dash__week">${bloco(380)}</div></div></div>`;
  };
  BA.vazio = ({ icone: ic = 'package', titulo, texto, acao = '' }) =>
    `<div class="empty">${`<span class="empty__ic">${icone(ic)}</span>`}<p class="empty__t">${titulo}</p><p class="empty__p">${texto}</p>${acao}</div>`;

  /* ================================================================== rotas, cabeçalho e barra lateral */
  const ROTAS = {
    'visao-geral': 'Visão geral', pedidos: 'Pedidos', historico: 'Histórico', caixa: 'Caixa do dia', produtos: 'Produtos', categorias: 'Categorias', adicionais: 'Adicionais',
    cupons: 'Cupons', areas: 'Áreas de entrega', banners: 'Banners e promoções', configuracoes: 'Configurações',
  };
  BA.ROTAS = ROTAS;
  const conteudo = () => $('#conteudo');
  let rotaAtual = null, timer = null, primeira = true;
  BA.rota = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROTAS[r] ? r : 'visao-geral'; };
  BA.params = () => new URLSearchParams(location.hash.split('?')[1] || '');
  BA.ir = (rota, params) => { const q = params ? `?${new URLSearchParams(params)}` : ''; const alvo = `#/${rota}${q}`; if (location.hash === alvo) render(true); else location.hash = alvo; };

  const PERM_ROTA = { pedidos: 'pedidos', historico: 'pedidos', caixa: 'pedidos', produtos: 'produtos', categorias: 'produtos', adicionais: 'produtos', cupons: 'cupons', areas: 'areas', banners: 'banners', configuracoes: 'configuracoes' };
  BA.PERM_ROTA = PERM_ROTA;
  function render(forcar = false) {
    const r = BA.rota();
    const tela = BA.telas[r];
    if (!tela || !BA.estado) return;
    if (!BA.pode(PERM_ROTA[r])) {
      BA.telas[rotaAtual]?.sair?.();
      rotaAtual = r;
      $('#titulo-pagina').textContent = ROTAS[r];
      conteudo().innerHTML = `<div class="page"><div class="card">${BA.vazio({ icone: 'shield', titulo: 'Sem acesso a esta área', texto: 'Seu usuário não tem permissão para abrir esta parte do painel. Fale com o administrador da loja.', acao: '<a class="btn btn--primary" href="#/visao-geral">Ir para a visão geral</a>' })}</div></div>`;
      return;
    }
    const mesma = r === rotaAtual;
    if (!mesma) BA.telas[rotaAtual]?.sair?.();
    rotaAtual = r;
    document.title = `${ROTAS[r]} · ${BA.estado.config?.loja?.nome || 'Painel'}`;
    $('#titulo-pagina').textContent = ROTAS[r];
    $$('.nav-item').forEach(a => { if (a.dataset.rota === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    fecharMenuLateral(false);
    BA.fecharMenu(false);
    const main = conteudo();
    clearTimeout(timer);
    if (mesma && !forcar) { tela.render(main, BA.params()); return; }
    main.setAttribute('aria-busy', 'true');
    main.innerHTML = BA.esqueleto(tela.esqueleto);
    if (!primeira) scrollTo({ top: 0, behavior: 'auto' });
    timer = setTimeout(() => {
      main.innerHTML = '';
      tela.render(main, BA.params());
      main.removeAttribute('aria-busy');
      if (!primeira) $('#titulo-pagina').focus({ preventScroll: true });
      primeira = false;
      atualizarTempos();
    }, primeira ? 520 : 280);
  }
  BA.render = () => render(true);
  addEventListener('hashchange', () => render());

  /* badge de pedidos, status da loja e notificações sempre em dia */
  BA.contarPedidos = () => {
    const c = { todos: 0, novo: 0, confirmado: 0, preparo: 0, entrega: 0, concluido: 0, recusado: 0 };
    BA.estado.pedidos.forEach(p => { c.todos++; c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  };
  /* situação da loja com a mesma regra do site: pausa > aberta no horário > fechada (com a próxima abertura) */
  BA.situacaoLoja = op => {
    const h = s => { const [a, b] = String(s).split(':'); return `${+a}h${b && b !== '00' ? b : ''}`; };
    if (op.pausada) return { tipo: 'pausa', titulo: 'Pedidos pausados', curto: op.pausaAte ? `Volta às ${hm(op.pausaAte)}` : 'Até você retomar', site: 'O site mostra "Pedidos pausados" e não aceita pedidos.' };
    if (op.aberta && op.noHorario !== false) return { tipo: 'aberta', titulo: 'Aberta agora', curto: op.fecha ? `Recebendo pedidos até ${h(op.fecha)}` : 'Recebendo pedidos', site: 'O site mostra "Aberto" e aceita pedidos para agora.' };
    const abre = op.abre ? `Abre ${op.abre.quando} às ${h(op.abre.as)}` : 'Sem abertura nos próximos dias';
    return { tipo: 'fechada', titulo: 'Fechada agora', curto: abre, abre, painel: !op.aberta, site: op.abre ? 'O site mostra "Fechado" e aceita só pedidos agendados.' : 'O site mostra "Fechado".' };
  };
  function pintarGlobais() {
    const c = BA.contarPedidos();
    const badge = $('[data-badge-pedidos]');
    badge.textContent = c.novo;
    badge.hidden = !c.novo;
    badge.setAttribute('aria-label', `${c.novo} pedidos novos`);
    const op = BA.estado.operacao;
    const card = $('[data-loja-card]');
    const dot = $('.dot', card);
    const off = semConexao;
    const sit = BA.situacaoLoja(op);
    dot.className = `dot ${off || sit.tipo === 'fechada' ? 'dot--red' : sit.tipo === 'pausa' ? 'dot--amber' : 'dot--pulse'}`;
    $('[data-loja-t]', card).textContent = off ? 'Sem conexão' : { aberta: 'Loja aberta', pausa: 'Pedidos pausados', fechada: 'Loja fechada' }[sit.tipo];
    $('[data-loja-s]', card).textContent = off ? 'Pedidos novos podem não aparecer' : sit.curto;
    const nl = BA.estado.notificacoes.filter(n => !n.lida).length;
    const nb = $('[data-badge-notif]');
    nb.textContent = nl;
    nb.hidden = !nl;
    $('[data-notif]').setAttribute('aria-label', nl ? `Notificações, ${nl} não lidas` : 'Notificações');
    const som = $('[data-som]');
    const on = BA.estado.preferencias.som;
    som.setAttribute('aria-pressed', String(on));
    som.setAttribute('aria-label', on ? 'Som de novos pedidos ligado' : 'Som de novos pedidos desligado');
    som.title = on ? 'Som de novos pedidos: ligado' : 'Som de novos pedidos: desligado';
    som.innerHTML = icone(on ? 'volume-on' : 'volume-off');
  }
  BA.on('mudou', pintarGlobais);

  /* pausa automática termina sozinha */
  function verificarPausa() {
    const op = BA.estado.operacao;
    if (op.pausada && op.pausaAte && Date.now() >= op.pausaAte) {
      // o servidor também encerra a pausa sozinho; aqui só atualiza a tela
      const pendente = retrato('operacao') !== base.operacao;
      Object.assign(op, { pausada: false, pausaAte: null, motivo: '' });
      if (!pendente) marcarBase('operacao');
      BA.emit('mudou');
      BA.toast('A pausa terminou. A loja voltou a receber pedidos.', 'info');
      if (rotaAtual === 'visao-geral' || rotaAtual === 'configuracoes') render(true);
    }
  }

  /* tempos que andam sozinhos (decorrido, "agora mesmo") */
  function atualizarTempos() {
    $$('[data-desde]').forEach(el => { el.textContent = decorrido(+el.dataset.desde); el.classList.toggle('is-late', minutosDesde(+el.dataset.desde) >= +(el.dataset.limite || 9999)); });
    $$('[data-relativo]').forEach(el => { el.textContent = relativo(+el.dataset.relativo); });
  }
  BA.atualizarTempos = atualizarTempos;

  /* menu lateral no celular */
  function abrirMenuLateral() { document.documentElement.classList.add('menu-aberto'); $('[data-menu-lateral]').setAttribute('aria-expanded', 'true'); $('.side .nav-item[aria-current="page"], .side .nav-item')?.focus(); }
  function fecharMenuLateral(devolver = true) {
    if (!document.documentElement.classList.contains('menu-aberto')) return;
    document.documentElement.classList.remove('menu-aberto');
    $('[data-menu-lateral]').setAttribute('aria-expanded', 'false');
    if (devolver) $('[data-menu-lateral]').focus();
  }

  /* busca do cabeçalho: filtra pedidos (na tela de pedidos) ou leva até lá */
  BA.busca = '';
  function iniciarBusca() {
    const inp = $('#busca-global');
    inp.addEventListener('input', () => { BA.busca = inp.value.trim(); if (rotaAtual === 'pedidos') BA.emit('busca', BA.busca); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); BA.busca = inp.value.trim(); if (rotaAtual !== 'pedidos') BA.ir('pedidos'); else BA.emit('busca', BA.busca); }
      if (e.key === 'Escape' && inp.value) { inp.value = ''; BA.busca = ''; BA.emit('busca', ''); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        if (getComputedStyle($('.head .search')).display === 'none') abrirBuscaCelular(); else inp.focus();
      }
    });
    $('[data-busca-celular]').addEventListener('click', abrirBuscaCelular);
  }
  function abrirBuscaCelular() {
    const d = BA.janela({
      tamanho: 'sm', titulo: 'Buscar pedido',
      corpo: `<div class="search" style="width:100%">${icone('search')}<input class="inp" id="busca-celular" type="search" placeholder="Buscar pedido, cliente…" aria-label="Buscar pedido ou cliente" value="${esc(BA.busca)}"></div><p class="fld__help" style="margin-top:10px">Busque pelo número (ex.: 1046) ou pelo nome do cliente.</p>`,
      rodape: '<button class="btn btn--primary btn--block" type="button" data-ok>Buscar</button>',
    });
    const i = $('#busca-celular', d);
    i.focus();
    const ir = () => { BA.busca = i.value.trim(); $('#busca-global').value = BA.busca; d.close(); if (rotaAtual !== 'pedidos') BA.ir('pedidos'); else BA.emit('busca', BA.busca); };
    $('[data-ok]', d).addEventListener('click', ir);
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
  }

  /* notificações */
  function abrirNotificacoes(botao) {
    const ns = [...BA.estado.notificacoes].sort((a, b) => b.em - a.em);
    const el = BA.menu(botao, null, {
      classe: 'notif',
      html: `<div class="notif__head"><strong>Notificações</strong><button class="link" type="button" data-lidas>Marcar todas como lidas</button></div>
        <div class="notif__list">${ns.length ? ns.map(n => `<button class="notif__item${n.lida ? '' : ' is-unread'}" type="button" data-n="${n.id}"><span class="notif__ic ${n.cor}">${icone(n.icone)}</span><span><span class="notif__t">${esc(n.titulo)}</span><span class="notif__p" style="display:block">${esc(n.texto)}</span><span class="notif__time" style="display:block" data-relativo="${n.em}">${relativo(n.em)}</span></span></button>`).join('') : `<p class="muted" style="padding:20px">Nenhuma notificação.</p>`}</div>`,
    });
    if (!el) return;
    el.addEventListener('click', e => {
      if (e.target.closest('[data-lidas]')) {
        BA.estado.notificacoes.forEach(n => { n.lida = true; });
        BA.salvar(); BA.emit('mudou');
        $$('.notif__item', el).forEach(b => b.classList.remove('is-unread'));
        BA.toast('Notificações marcadas como lidas.');
        return;
      }
      const b = e.target.closest('[data-n]');
      if (!b) return;
      const n = BA.estado.notificacoes.find(x => x.id === b.dataset.n);
      n.lida = true;
      BA.salvar(); BA.emit('mudou');
      BA.fecharMenu(false);
      if (n.pedido) { BA.ir('pedidos'); setTimeout(() => BA.abrirPedido?.(n.pedido), 420); }
      else BA.ir(n.rota);
    });
  }

  /* perfil */
  function abrirPerfil(botao) {
    const a = BA.estado.admin;
    BA.menu(botao, [
      { rotulo: 'Meu perfil', icone: 'user', acao: editarPerfil },
      { rotulo: 'Configurações', icone: 'settings', acao: () => BA.ir('configuracoes') },
      { rotulo: 'Ver loja', icone: 'external', acao: () => window.open('/', '_blank', 'noopener') },
      '-',
      { rotulo: 'Sair', icone: 'logout', perigo: true, acao: sair },
    ]);
    const m = $('.menu');
    m?.insertAdjacentHTML('afterbegin', `<div class="menu__head"><span class="avatar">${esc(a.iniciais)}</span><span><strong>${esc(a.nome)}</strong><small>${esc(a.email)}</small></span></div><hr class="menu__sep">`);
  }
  function editarPerfil() {
    const a = BA.estado.admin;
    const d = BA.janela({
      titulo: 'Meu perfil', sub: 'Dados de quem acessa o painel.',
      corpo: `<form class="form-grid" novalidate data-form>
        <div class="span-2" style="display:flex;align-items:center;gap:14px"><span class="avatar avatar--lg">${esc(a.iniciais)}</span><div><strong>${esc(a.nome)}</strong><p class="muted">${esc(a.funcao)}</p></div></div>
        ${BA.campo({ id: 'pf-nome', rotulo: 'Nome', valor: a.nome, obrigatorio: true, attrs: 'autocomplete="name"' })}
        ${BA.campo({ id: 'pf-email', rotulo: 'E-mail', tipo: 'email', valor: a.email, obrigatorio: true, attrs: 'autocomplete="email"' })}
        ${BA.campo({ id: 'pf-fone', rotulo: 'Celular', valor: a.telefone, attrs: 'data-mascara="fone" inputmode="tel"' })}
        ${BA.campo({ id: 'pf-funcao', rotulo: 'Função', valor: a.funcao, attrs: 'readonly', ajuda: 'A função é definida em Configurações › Usuários.' })}
        <div class="span-2 form-sec" style="margin-top:6px"><p class="form-sec__t">Trocar senha</p></div>
        ${BA.campo({ id: 'pf-atual', rotulo: 'Senha atual', tipo: 'password', opcional: true, classe: 'span-2', attrs: 'autocomplete="current-password"', ajuda: 'Só para trocar a senha.' })}
        ${BA.campo({ id: 'pf-senha', rotulo: 'Nova senha', tipo: 'password', opcional: true, attrs: 'autocomplete="new-password"', ajuda: 'Mínimo de 12 caracteres. Evite datas, sequências e o nome da loja.' })}
        ${BA.campo({ id: 'pf-senha2', rotulo: 'Repita a nova senha', tipo: 'password', opcional: true, attrs: 'autocomplete="new-password"' })}
        <div class="span-2 form-sec" style="margin-top:6px"><p class="form-sec__t">Verificação em duas etapas</p>
          <div class="switch-row"><span class="switch__txt"><span class="switch__label">${a.doisFatores ? 'Ligada' : 'Desligada'}</span><span class="switch__desc">${a.doisFatores ? 'Para entrar, o painel pede a senha e um código do aplicativo do seu celular.' : 'Com ela ligada, quem descobrir a sua senha ainda não consegue entrar.'}</span></span>
          <button class="btn ${a.doisFatores ? 'btn--ghost' : 'btn--primary'} btn--sm" type="button" data-2fa>${icone('shield')}${a.doisFatores ? 'Desligar' : 'Ativar'}</button></div></div>
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>Salvar perfil</button>',
    });
    $('[data-2fa]', d).addEventListener('click', async () => {
      if (a.doisFatores) { if (await BA.desativar2fa()) d.close(); }
      else { d.close(); BA.abrir2fa(); }
    });
    $('[data-salvar]', d).addEventListener('click', async ev => {
      const ok = BA.validar(d, [
        ['pf-nome', BA.obrig('Escreva seu nome.')],
        ['pf-email', v => (!v ? 'Escreva seu e-mail.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Confira o e-mail.')],
        ['pf-atual', v => ($('#pf-senha', d).value && !v ? 'Para trocar a senha, escreva a senha atual.' : '')],
        ['pf-senha', v => (v && v.length < 12 ? 'Use pelo menos 12 caracteres.' : '')],
        ['pf-senha2', v => ($('#pf-senha', d).value && v !== $('#pf-senha', d).value ? 'As senhas não são iguais.' : '')],
      ]);
      if (!ok) return;
      const b = ev.currentTarget;
      b.disabled = true;
      const trocou = !!$('#pf-senha', d).value;
      try {
        const r = await BA.api('api/perfil', { nome: $('#pf-nome', d).value.trim(), email: $('#pf-email', d).value.trim(), telefone: $('#pf-fone', d).value.trim(), senhaAtual: $('#pf-atual', d).value, senha: $('#pf-senha', d).value });
        Object.assign(a, r.admin);
        const eu = BA.estado.usuarios.find(u => u.id === a.id);
        if (eu) { Object.assign(eu, { nome: a.nome, email: a.email }); marcarBase('usuarios'); }
        pintarPerfil(); d.close();
        BA.toast(trocou ? 'Perfil e senha atualizados.' : 'Perfil atualizado.');
      } catch (e) {
        b.disabled = false;
        const campo = { 'pf-atual': 'pf-atual', 'pf-email': 'pf-email', senha: 'pf-senha', 'pf-nome': 'pf-nome' }[e.dados?.campo];
        if (campo && $('#' + campo, d)) { BA.erroCampo($('#' + campo, d), e.message); $('#' + campo, d).focus(); } else BA.toast(e.message, 'erro');
      }
    });
  }
  function pintarPerfil() {
    const a = BA.estado.admin;
    $('[data-perfil-ini]').textContent = a.iniciais;
    $('[data-perfil-nome]').textContent = a.nome;
    $('[data-perfil-funcao]').textContent = a.funcao;
    $('[data-perfil]').setAttribute('aria-label', `Perfil de ${a.nome}, ${a.funcao}`);
  }
  async function sair() {
    const ok = await BA.confirmar({ titulo: 'Sair do painel', texto: 'Você vai precisar entrar de novo para gerenciar a loja.', botao: 'Sair' });
    if (!ok) return;
    try { await fila; await BA.api('sair', {}); } catch { /* a sessão já tinha terminado */ }
    location.href = '/admin/';
  }

  function pintarLogo() {
    const img = $('.side__logo');
    const src = BA.estado.logo;
    if (!src || src.startsWith('data:')) { if (!src) { img.hidden = true; img.removeAttribute('src'); } return; }
    const probe = new Image();
    probe.onload = () => { img.src = src; img.hidden = false; };
    probe.src = src;
  }


  /* ================================================================== Excluídos (o que sai de uma lista fica guardado e pode voltar) */
  const NOMES_EXCLUIDOS = { produtos: 'Produtos', categorias: 'Categorias', grupos: 'Grupos de adicionais', cupons: 'Cupons', areas: 'Áreas de entrega', banners: 'Banners' };
  BA.abrirExcluidos = async colecao => {
    let itens;
    try { itens = (await BA.api(`api/excluidos?colecao=${encodeURIComponent(colecao)}`)).itens; } catch (e) { BA.toast(e.message, 'erro'); return; }
    const d = BA.janela({
      tamanho: 'md', titulo: `${NOMES_EXCLUIDOS[colecao] || 'Itens'} excluídos`, sub: 'O que foi excluído fica guardado aqui. Restaurar devolve o item para o fim da lista.',
      corpo: `<div class="olist" data-lista>${itens.length ? itens.map(i => `<div class="exc exc--excluido"><strong>${esc(i.nome)}</strong><span class="muted">Excluído em ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: FUSO }).format(i.em)}</span><button class="btn btn--ghost btn--sm" type="button" data-restaurar="${esc(i.id)}">${icone('refresh')}Restaurar</button></div>`).join('')
        : BA.vazio({ icone: 'trash', titulo: 'Nada excluído', texto: 'Quando você excluir um item desta lista, ele aparece aqui.' })}</div>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Fechar</button>',
    });
    d.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-restaurar]');
      if (!b) return;
      b.disabled = true;
      try {
        const r = await BA.api('api/restaurar', { colecao, id: b.dataset.restaurar });
        await fila; // nada pendente da mesma lista
        reconciliar(r.colecao, r.dados);
        marcarBase(r.colecao);
        b.closest('.exc').remove();
        BA.emit('mudou');
        BA.render();
        BA.toast(colecao === 'grupos' ? 'Grupo restaurado. Marque de novo os produtos que usam este grupo.' : 'Item restaurado. Ele voltou para o fim da lista.');
      } catch (e) { b.disabled = false; BA.toast(e.message, 'erro'); }
    });
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-excluidos]'); if (b) BA.abrirExcluidos(b.dataset.excluidos); });

  /* ================================================================== verificação em duas etapas */
  /* obrigatorio: a loja exige para administradores; a janela não fecha até ativar (ou sair do painel) */
  BA.abrir2fa = async ({ obrigatorio = false } = {}) => {
    let r;
    try { r = await BA.api('api/2fa/iniciar', {}); } catch (e) { BA.toast(e.message, 'erro'); return; }
    const d = BA.janela({
      tamanho: 'md', fixa: obrigatorio, titulo: 'Verificação em duas etapas',
      sub: obrigatorio ? 'A loja exige este passo para quem administra o painel.' : 'Além da senha, o painel vai pedir um código do seu celular.',
      corpo: `<ol class="passos-2fa">
          <li><strong>Instale um aplicativo autenticador</strong> no celular, se ainda não tiver um: Google Authenticator, Microsoft Authenticator ou Authy. Todos são gratuitos.</li>
          <li><strong>Adicione esta conta.</strong> No celular, toque em <a class="link" href="${esc(r.uri)}">abrir no aplicativo</a>. No computador, escolha "inserir chave" no aplicativo e digite a chave abaixo.
            <code class="chave-2fa">${esc(r.segredo)}</code></li>
          <li><strong>Digite o código</strong> de 6 números que o aplicativo mostra e confirme com a sua senha.</li>
        </ol>
        <div class="form-grid">
          ${BA.campo({ id: 'tf-codigo', rotulo: 'Código do aplicativo', obrigatorio: true, placeholder: '000000', attrs: 'inputmode="numeric" autocomplete="one-time-code" maxlength="7"' })}
          ${BA.campo({ id: 'tf-senha', rotulo: 'Sua senha', tipo: 'password', obrigatorio: true, attrs: 'autocomplete="current-password"' })}
        </div>`,
      rodape: `${obrigatorio ? '<button class="btn btn--ghost" type="button" data-sair2fa>Sair do painel</button>' : '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button>'}<button class="btn btn--primary" type="button" data-ativar>${icone('shield')}Ativar</button>`,
    });
    $('[data-sair2fa]', d)?.addEventListener('click', async () => { try { await BA.api('sair', {}); } catch { /* já saiu */ } location.href = '/admin/'; });
    $('[data-ativar]', d).addEventListener('click', async ev => {
      if (!BA.validar(d, [['tf-codigo', v => (v.replace(/\D/g, '').length !== 6 ? 'Digite os 6 números do aplicativo.' : '')], ['tf-senha', BA.obrig('Digite a sua senha.')]])) return;
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        const r2 = await BA.api('api/2fa/ativar', { codigo: $('#tf-codigo', d).value, senhaAtual: $('#tf-senha', d).value });
        Object.assign(BA.estado.admin, r2.admin);
        $('.dlg__body', d).innerHTML = `<p class="confirm__txt"><strong>Pronto: a verificação em duas etapas está ligada.</strong> Guarde estes códigos de recuperação num lugar seguro (papel ou gerenciador de senhas). Cada um vale uma vez, para entrar se você perder o celular. Eles não aparecem de novo.</p>
          <ul class="codigos-rec">${r2.recuperacao.map(c => `<li><code>${esc(c)}</code></li>`).join('')}</ul>`;
        $('.dlg__foot', d).innerHTML = '<button class="btn btn--primary" type="button" data-guardei>Guardei os códigos</button>';
        $('[data-guardei]', d).addEventListener('click', () => { d.dataset.liberada = '1'; d.close(); if (obrigatorio) location.reload(); });
        BA.toast('Verificação em duas etapas ativada.');
      } catch (e) {
        b.disabled = false;
        const campo = e.dados?.campo === 'confirmar-senha' ? 'tf-senha' : 'tf-codigo';
        BA.erroCampo($('#' + campo, d), e.message); $('#' + campo, d).focus();
      }
    });
    setTimeout(() => $('#tf-codigo', d)?.focus(), 50);
  };
  BA.desativar2fa = async () => {
    const senha = await BA.confirmar({
      titulo: 'Desligar a verificação em duas etapas?', texto: 'O painel volta a pedir só a senha para entrar. Os códigos de recuperação deixam de valer.',
      botao: 'Desligar', perigo: true,
      extra: `<div class="fld"><label class="fld__label" for="cf-2fa">Sua senha<span class="req" aria-hidden="true">*</span></label><input class="inp" id="cf-2fa" type="password" data-campo required data-msg="Digite a sua senha para confirmar." autocomplete="current-password" aria-describedby="cf-2fa-err"><p class="fld__err" id="cf-2fa-err" hidden></p></div>`,
    });
    if (typeof senha !== 'string' || !senha) return false;
    try {
      const r = await BA.api('api/2fa/desativar', { senhaAtual: senha });
      Object.assign(BA.estado.admin, r.admin);
      BA.toast('Verificação em duas etapas desligada.', 'info');
      return true;
    } catch (e) { BA.toast(e.message, 'erro'); return false; }
  };

  /* ================================================================== início */
  function iniciar() {
    $$('[data-ic]').forEach(el => { el.outerHTML = icone(el.dataset.ic, el.className || 'ic'); });
    const curta = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: FUSO }).format(new Date()).toUpperCase();
    $('[data-data]').innerHTML = `<span class="d-longa">${dataLonga()}</span><span class="d-curta">${curta}</span>`;
    // logo oficial (enviada em Configurações › Dados da loja)
    pintarLogo();
    BA.on('salvo', nome => { if (nome === 'logo') pintarLogo(); });
    // esconde do menu as áreas que este usuário não pode abrir
    $$('.nav-item[data-rota]').forEach(a => { a.hidden = !BA.pode(PERM_ROTA[a.dataset.rota]); });
    $$('.side__label').forEach(l => { let n = l.nextElementSibling, algum = false; while (n && !n.classList.contains('side__label')) { if (!n.hidden) algum = true; n = n.nextElementSibling; } l.hidden = !algum; });
    pintarPerfil();
    pintarGlobais();
    iniciarBusca();
    $('[data-menu-lateral]').addEventListener('click', () => (document.documentElement.classList.contains('menu-aberto') ? fecharMenuLateral() : abrirMenuLateral()));
    $('.side-backdrop').addEventListener('click', () => fecharMenuLateral());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.documentElement.classList.contains('menu-aberto') && !$('.login-screen')) fecharMenuLateral(); });
    $('[data-som]').addEventListener('click', () => {
      const p = BA.estado.preferencias;
      p.som = !p.som;
      BA.salvarSom(p.som); pintarGlobais();
      if (p.som) { BA.tocarSom(); BA.toast('Som de novos pedidos ligado.', 'info'); } else BA.toast('Som de novos pedidos desligado.', 'info');
    });
    $('[data-notif]').addEventListener('click', e => abrirNotificacoes(e.currentTarget));
    $('[data-perfil]').addEventListener('click', e => abrirPerfil(e.currentTarget));
    setInterval(() => { atualizarTempos(); verificarPausa(); }, 15000);
    render();
    // a loja exige duas etapas para administradores e esta pessoa ainda não ativou: a janela abre e não fecha até ativar
    if (BA.estado.admin.precisa2fa) BA.abrir2fa({ obrigatorio: true });
  }
  BA.iniciar = iniciar;
})();
