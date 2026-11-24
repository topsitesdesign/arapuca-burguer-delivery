/* Arapuca Burguer · painel — Cupons, Áreas de entrega, Banners e promoções, Configurações. */
(function () {
  'use strict';
  const { $, $$, esc, brl, num, icone, plural, normal, dataBR, dataCurta, foto, fotoProduto } = BA;
  const E = () => BA.estado;
  const flash = el => el?.animate([{ boxShadow: '0 0 0 3px rgba(247,116,29,.7)' }, { boxShadow: '0 0 0 0 rgba(247,116,29,0)' }], { duration: 1400 });

  /* ================================================================== cupons */
  const TIPOS = { percentual: ['Percentual', 'percent'], fixo: ['Valor fixo', 'cash'], frete: ['Frete grátis', 'truck'] };
  const STC = { ativo: ['Ativo', 'green'], agendado: ['Agendado', 'blue'], expirado: ['Expirado', 'muted'], desativado: ['Desativado', 'red'], esgotado: ['Limite atingido', 'amber'] };
  const statusCupom = c => {
    const hoje = BA.hojeISO();
    if (!c.habilitado) return 'desativado';
    if (c.limite && c.usos >= c.limite) return 'esgotado';
    if (hoje < c.inicio) return 'agendado';
    if (hoje > c.validade) return 'expirado';
    return 'ativo';
  };
  const valorCupom = c => (c.tipo === 'percentual' ? `${num(c.valor)}%` : c.tipo === 'fixo' ? brl(c.valor) : 'Taxa zerada');

  BA.telas.cupons = {
    esqueleto: 'tabela',
    filtro: 'todos', q: '',
    render(el) {
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="toolbar__l"><div class="chips" role="group" aria-label="Filtrar cupons" data-filtros></div></div>
          <div class="toolbar__r"><div class="search">${icone('search')}<input class="inp" type="search" id="busca-cupom" placeholder="Buscar código" aria-label="Buscar cupom" value="${esc(this.q)}"></div><button class="btn btn--primary" type="button" data-novo>${icone('plus')}Novo cupom</button></div>
        </div>
        <div class="card card--flush"><div class="tbl-wrap"><table class="tbl tbl--cards">
          <thead><tr><th>Código</th><th>Tipo</th><th>Valor</th><th>Pedido mínimo</th><th>Usos</th><th>Validade</th><th>Status</th><th class="r">Ações</th></tr></thead>
          <tbody data-linhas></tbody>
        </table></div></div>
      </div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      $('#busca-cupom', root).addEventListener('input', ev => { this.q = ev.target.value.trim(); this.pintar(); });
      root.addEventListener('click', async ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const e = E();
        if (b.dataset.filtro) { this.filtro = b.dataset.filtro; this.pintar(); return; }
        if (b.matches('[data-novo]')) return formCupom(null, id => this.pintar(id));
        if (b.matches('[data-limpar]')) { this.q = ''; this.filtro = 'todos'; $('#busca-cupom', root).value = ''; this.pintar(); return; }
        const c = e.cupons.find(x => x.id === (b.dataset.copiar || b.dataset.editar || b.dataset.duplicar || b.dataset.alternar));
        if (!c) return;
        if (b.dataset.copiar) {
          try { await navigator.clipboard.writeText(c.codigo); BA.toast(`Código ${c.codigo} copiado.`); }
          catch { BA.toast(`Não deu para copiar. O código é ${c.codigo}.`, 'erro'); }
        } else if (b.dataset.editar) formCupom(c, id => this.pintar(id));
        else if (b.dataset.duplicar) {
          let codigo = `${c.codigo}2`, n = 2;
          while (e.cupons.some(x => x.codigo === codigo)) codigo = `${c.codigo}${++n}`;
          const copia = { ...c, id: BA.uid('c'), codigo, usos: 0, habilitado: false };
          e.cupons.splice(e.cupons.indexOf(c) + 1, 0, copia);
          BA.salvar(); this.pintar(copia.id);
          BA.toast(`Cupom ${codigo} criado como cópia. Ele começa desativado.`);
        } else if (b.dataset.alternar) {
          if (c.habilitado) {
            const ok = await BA.confirmar({ titulo: `Desativar ${c.codigo}?`, texto: 'Clientes não conseguem mais usar este cupom. Você pode ativar de novo quando quiser.', botao: 'Desativar cupom', perigo: true });
            if (!ok) return;
          }
          c.habilitado = !c.habilitado;
          BA.salvar(); this.pintar(c.id);
          BA.toast(c.habilitado ? `Cupom ${c.codigo} ativado.` : `Cupom ${c.codigo} desativado.`, c.habilitado ? 'ok' : 'info');
        }
      });
    },
    pintar(destacar) {
      const root = this.root;
      if (!root?.isConnected) return;
      const e = E();
      const cont = { todos: e.cupons.length, ativo: 0, agendado: 0, inativo: 0 };
      e.cupons.forEach(c => { const s = statusCupom(c); if (s === 'ativo') cont.ativo++; else if (s === 'agendado') cont.agendado++; else cont.inativo++; });
      $('[data-filtros]', root).innerHTML = [['todos', 'Todos'], ['ativo', 'Ativos'], ['agendado', 'Agendados'], ['inativo', 'Expirados e desativados']].map(([v, t]) => `<button class="chip" type="button" data-filtro="${v}" aria-pressed="${this.filtro === v}">${t}<span class="chip__n">${cont[v]}</span></button>`).join('');
      const q = normal(this.q);
      const lista = e.cupons.filter(c => {
        const s = statusCupom(c);
        const f = this.filtro === 'todos' || (this.filtro === 'inativo' ? !['ativo', 'agendado'].includes(s) : s === this.filtro);
        return f && (!q || normal(c.codigo).includes(q) || normal(c.descricao).includes(q));
      });
      $('[data-linhas]', root).innerHTML = lista.length ? lista.map(c => {
        const s = statusCupom(c);
        const pct = c.limite ? Math.min(100, (c.usos / c.limite) * 100) : 0;
        return `<tr data-id="${c.id}" class="${c.habilitado ? '' : 'is-inactive'}">
          <td data-th="Código" class="full"><span class="code">${esc(c.codigo)}<button type="button" data-copiar="${c.id}" aria-label="Copiar código ${esc(c.codigo)}" title="Copiar">${icone('copy')}</button></span>${c.descricao ? `<small class="cell-sub">${esc(c.descricao)}</small>` : ''}</td>
          <td data-th="Tipo" class="nowrap"><span style="display:inline-flex;gap:6px;align-items:center">${icone(TIPOS[c.tipo][1])}${TIPOS[c.tipo][0]}</span></td>
          <td data-th="Valor" class="nowrap"><strong>${valorCupom(c)}</strong></td>
          <td data-th="Pedido mínimo" class="nowrap">${c.minimo ? brl(c.minimo) : 'Sem mínimo'}</td>
          <td data-th="Usos"><div class="usage"><small><strong style="color:var(--ink)">${num(c.usos)}</strong> ${c.limite ? `de ${num(c.limite)}` : 'usos · sem limite'}${c.porCliente ? ` · ${c.porCliente}/cliente` : ''}</small>${c.limite ? `<div class="usage__bar" aria-hidden="true"><span class="${pct >= 80 ? 'is-high' : ''}" style="--w:${pct}%"></span></div>` : ''}</div></td>
          <td data-th="Validade" class="nowrap">${dataCurta(c.inicio)} a ${dataBR(c.validade)}</td>
          <td data-th="Status"><span class="pill pill--${STC[s][1]}">${STC[s][0]}</span></td>
          <td class="row-acts-cell"><div class="row-acts">
            <button class="btn-icon btn-icon--sm" type="button" data-editar="${c.id}" aria-label="Editar ${esc(c.codigo)}" title="Editar">${icone('pencil')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-duplicar="${c.id}" aria-label="Duplicar ${esc(c.codigo)}" title="Duplicar">${icone('copy')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-alternar="${c.id}" aria-label="${c.habilitado ? 'Desativar' : 'Ativar'} ${esc(c.codigo)}" title="${c.habilitado ? 'Desativar' : 'Ativar'}">${icone(c.habilitado ? 'power' : 'play')}</button>
          </div></td>
        </tr>`;
      }).join('') : `<tr><td colspan="8" class="full">${BA.vazio({ icone: 'ticket', titulo: 'Nenhum cupom aqui', texto: q ? `Nada com “${esc(this.q)}”.` : 'Nenhum cupom nesta situação.', acao: '<button class="btn btn--ghost" type="button" data-limpar>Ver todos os cupons</button>' })}</td></tr>`;
      if (destacar) { const tr = $(`tr[data-id="${destacar}"]`, root); tr?.scrollIntoView({ block: 'center', behavior: BA.suave() }); tr?.animate([{ background: 'rgba(247,116,29,.18)' }, { background: 'transparent' }], { duration: 1400 }); }
    },
    sair() {},
  };

  function formCupom(c, depois) {
    const e = E();
    const novo = !c;
    const hoje = BA.hojeISO();
    const d = BA.janela({
      tamanho: 'md', titulo: novo ? 'Novo cupom' : `Editar ${esc(c.codigo)}`, sub: 'O desconto vale sobre os produtos; frete grátis zera a taxa de entrega.',
      corpo: `<form class="form-sec" novalidate>
        <div class="form-grid">
          ${BA.campo({ id: 'cp-codigo', rotulo: 'Código', valor: c?.codigo || '', obrigatorio: true, placeholder: 'Ex.: BEMVINDO10', attrs: 'data-mascara="codigo" maxlength="20" autocomplete="off" style="text-transform:uppercase;font-family:ui-monospace,Consolas,monospace;letter-spacing:.06em"', ajuda: 'Letras e números, sem espaço.' })}
          ${BA.campo({ id: 'cp-desc', rotulo: 'Descrição interna', opcional: true, valor: c?.descricao || '', attrs: 'maxlength="60"' })}
        </div>
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Tipo de desconto<span class="req" aria-hidden="true">*</span></legend>
          <div class="choices">${Object.entries(TIPOS).map(([v, [t, ic]]) => `<label class="choice"><input type="radio" name="cp-tipo" value="${v}"${(c?.tipo || 'percentual') === v ? ' checked' : ''}><span class="choice__ic">${icone(ic)}</span><span><span class="choice__t">${t}</span><span class="choice__d" style="display:block">${{ percentual: 'Ex.: 15% nos produtos', fixo: 'Ex.: R$ 10,00 de desconto', frete: 'Zera a taxa de entrega' }[v]}</span></span></label>`).join('')}</div>
        </fieldset>
        <div class="form-grid">
          <div data-valor-pct>${BA.campo({ id: 'cp-pct', rotulo: 'Percentual', obrigatorio: true, tipo: 'number', suf: '%', valor: c?.tipo === 'percentual' ? c.valor : '', attrs: 'min="1" max="100" inputmode="numeric"' })}</div>
          <div data-valor-fixo>${BA.campo({ id: 'cp-fixo', rotulo: 'Valor do desconto', obrigatorio: true, pre: 'R$', valor: c?.tipo === 'fixo' ? BA.valorCampo(c.valor) : '', placeholder: '0,00', attrs: 'inputmode="decimal"' })}</div>
          ${BA.campo({ id: 'cp-min', rotulo: 'Pedido mínimo', opcional: true, pre: 'R$', valor: c?.minimo ? BA.valorCampo(c.minimo) : '', placeholder: '0,00', attrs: 'inputmode="decimal"' })}
          ${BA.campo({ id: 'cp-limite', rotulo: 'Limite de usos', opcional: true, tipo: 'number', valor: c?.limite ?? '', placeholder: 'Sem limite', attrs: 'min="1" inputmode="numeric"' })}
          ${BA.campo({ id: 'cp-cliente', rotulo: 'Usos por cliente', tipo: 'number', valor: c?.porCliente ?? 1, attrs: 'min="1" max="99" inputmode="numeric"' })}
          ${BA.campo({ id: 'cp-inicio', rotulo: 'Início', tipo: 'date', obrigatorio: true, valor: c?.inicio || hoje })}
          ${BA.campo({ id: 'cp-fim', rotulo: 'Validade', tipo: 'date', obrigatorio: true, valor: c?.validade || '' })}
        </div>
        ${BA.linhaInterruptor({ id: 'cp-ativo', rotulo: 'Cupom ativo', desc: 'Desligado, ninguém consegue usar mesmo dentro da validade.', marcado: c ? c.habilitado : true })}
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>' + icone('check') + 'Salvar cupom</button>',
    });
    const tipo = () => $('[name="cp-tipo"]:checked', d).value;
    const ajustar = () => { $('[data-valor-pct]', d).hidden = tipo() !== 'percentual'; $('[data-valor-fixo]', d).hidden = tipo() !== 'fixo'; };
    ajustar();
    d.addEventListener('change', ev => { if (ev.target.name === 'cp-tipo') ajustar(); });
    $('[data-salvar]', d).addEventListener('click', () => {
      const t = tipo();
      const regras = [
        ['cp-codigo', v => (!v ? 'Escreva o código.' : v.length < 4 ? 'Use pelo menos 4 caracteres.' : e.cupons.some(x => x !== c && x.codigo === v.toUpperCase()) ? 'Já existe um cupom com esse código.' : '')],
        ['cp-min', v => (v && !(BA.lerValor(v) >= 0) ? 'Use um valor como 30,00.' : '')],
        ['cp-limite', v => (v && !(+v >= 1) ? 'Use 1 ou mais, ou deixe vazio.' : '')],
        ['cp-cliente', v => (!(+v >= 1) ? 'Use 1 ou mais.' : '')],
        ['cp-inicio', BA.obrig('Escolha a data de início.')],
        ['cp-fim', v => (!v ? 'Escolha a validade.' : v < $('#cp-inicio', d).value ? 'A validade precisa ser depois do início.' : '')],
      ];
      if (t === 'percentual') regras.splice(1, 0, ['cp-pct', v => (!v ? 'Informe o percentual.' : +v < 1 || +v > 100 ? 'Use de 1 a 100%.' : '')]);
      if (t === 'fixo') regras.splice(1, 0, ['cp-fixo', v => (!v ? 'Informe o valor.' : !(BA.lerValor(v) > 0) ? 'Use um valor como 10,00.' : '')]);
      if (!BA.validar(d, regras)) return;
      const dados = {
        codigo: $('#cp-codigo', d).value.trim().toUpperCase(), descricao: $('#cp-desc', d).value.trim(), tipo: t,
        valor: t === 'percentual' ? +$('#cp-pct', d).value : t === 'fixo' ? BA.r2(BA.lerValor($('#cp-fixo', d).value)) : 0,
        minimo: $('#cp-min', d).value ? BA.r2(BA.lerValor($('#cp-min', d).value)) : 0,
        limite: $('#cp-limite', d).value ? +$('#cp-limite', d).value : null, porCliente: +$('#cp-cliente', d).value,
        inicio: $('#cp-inicio', d).value, validade: $('#cp-fim', d).value, habilitado: $('#cp-ativo', d).checked,
      };
      let id;
      if (novo) { id = BA.uid('c'); e.cupons.unshift({ id, usos: 0, ...dados }); } else { Object.assign(c, dados); id = c.id; }
      BA.salvar(); d.close();
      const st = statusCupom({ ...dados, usos: c?.usos || 0 });
      BA.toast(`Cupom ${dados.codigo} salvo · ${STC[st][0].toLowerCase()}.`);
      depois?.(id);
    });
  }

  /* ================================================================== áreas de entrega */
  const POS = { centro: [262, 182, 88, 66], jardins: [128, 300, 86, 58], 'vila-nova': [394, 98, 94, 62], 'bela-vista': [404, 300, 78, 54] };
  const LIVRES = [[130, 108, 78, 54], [96, 214, 62, 50], [270, 330, 80, 40], [454, 206, 50, 60]];
  function posicao(a, i) {
    if (POS[a.id]) return POS[a.id];
    const extras = E().areas.filter(x => !POS[x.id]);
    return LIVRES[extras.indexOf(a) % LIVRES.length] || LIVRES[i % LIVRES.length];
  }
  function blob(cx, cy, rx, ry, k) {
    // forma orgânica (não um círculo perfeito) desenhada com curvas
    const pts = Array.from({ length: 8 }, (_, i) => {
      const t = (i / 8) * Math.PI * 2;
      const w = 1 + ((k * 7 + i * 13) % 5 - 2) * 0.05;
      return [cx + Math.cos(t) * rx * w, cy + Math.sin(t) * ry * w];
    });
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let dpath = `M${m(pts[7], pts[0]).map(n => n.toFixed(1)).join(' ')}`;
    pts.forEach((p, i) => { const nx = m(p, pts[(i + 1) % 8]); dpath += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${nx[0].toFixed(1)} ${nx[1].toFixed(1)}`; });
    return dpath + 'Z';
  }
  function mapa(areas, quente) {
    const ruas = [];
    for (let x = 30; x < 520; x += 46) ruas.push(`<path d="M${x} 0 L${x + 18} 380" />`);
    for (let y = 22; y < 380; y += 40) ruas.push(`<path d="M0 ${y} L520 ${y - 10}" />`);
    return `<svg viewBox="0 0 520 380" role="img" aria-label="Mapa esquemático das áreas de entrega em volta da loja">
      <rect width="520" height="380" fill="#120f0d"/>
      <g stroke="#1f1915" stroke-width="7" fill="none">${ruas.join('')}</g>
      <g stroke="#2a221d" stroke-width="2" fill="none">${ruas.join('')}</g>
      <path d="M-10 140 C 90 120, 140 180, 230 150 S 380 60, 530 90" stroke="#16222c" stroke-width="16" fill="none"/>
      <path d="M-10 140 C 90 120, 140 180, 230 150 S 380 60, 530 90" stroke="#1d2f3b" stroke-width="2" fill="none" stroke-dasharray="2 8"/>
      <g fill="none" stroke="rgba(255,248,241,.12)" stroke-dasharray="4 6">${[70, 140, 210].map(r => `<circle cx="262" cy="196" r="${r}"/>`).join('')}</g>
      <g fill="rgba(255,248,241,.35)" font-family="DM Sans, sans-serif" font-size="10">${[[70, '2 km'], [140, '4 km'], [210, '6 km']].map(([r, t]) => `<text x="${262 + r * .7 + 4}" y="${196 - r * .7}">${t}</text>`).join('')}</g>
      ${areas.map((a, i) => {
        const [cx, cy, rx, ry] = posicao(a, i);
        const cor = a.ativa ? '#f7741d' : '#7d7068';
        return `<g class="zone${a.ativa ? '' : ' is-off'}${quente === a.id ? ' is-hot' : ''}" data-zona="${a.id}" tabindex="0" role="button" aria-label="${esc(a.nome)}: ${a.ativa ? `taxa ${brl(a.taxa)}` : 'inativa'}. Editar área" stroke="${cor}" stroke-width="1.6">
          <path d="${blob(cx, cy, rx, ry, i)}" fill="${a.ativa ? 'rgba(247,116,29,.16)' : 'rgba(125,112,104,.12)'}" ${a.ativa ? '' : 'stroke-dasharray="5 5"'}/>
          <text x="${cx}" y="${cy - (a.id === 'centro' ? 24 : 2)}" text-anchor="middle" fill="#fff8f1" stroke="none" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="17" letter-spacing=".04em">${esc(a.nome.toUpperCase())}</text>
          <text x="${cx}" y="${cy + (a.id === 'centro' ? -9 : 15)}" text-anchor="middle" fill="${a.ativa ? '#ff944f' : '#a8998e'}" stroke="none" font-family="DM Sans, sans-serif" font-weight="700" font-size="11.5">${a.ativa ? brl(a.taxa) : 'Inativa'}</text>
        </g>`;
      }).join('')}
      <g transform="translate(262 196)" aria-hidden="true">
        <circle r="18" fill="rgba(247,116,29,.22)"><animate attributeName="r" values="12;24;12" dur="2.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0;.9" dur="2.6s" repeatCount="indefinite"/></circle>
        <circle r="9" fill="#f7741d" stroke="#fff8f1" stroke-width="2.5"/>
      </g>
      <text x="262" y="226" text-anchor="middle" fill="#fff8f1" font-family="DM Sans, sans-serif" font-size="11" font-weight="700">Loja · Rua Real da Torre, 807</text>
    </svg>`;
  }

  BA.telas.areas = {
    esqueleto: 'tabela',
    render(el) {
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <p class="count-line" data-resumo></p>
          <div class="toolbar__r"><button class="btn btn--ghost" type="button" data-excluidos="areas">${icone('trash')}Excluídas</button><button class="btn btn--primary" type="button" data-nova>${icone('plus')}Nova área</button></div>
        </div>
        <div class="areas">
          <section class="card card--flush areas__tabela" aria-labelledby="h-areas">
            <div class="card__head" style="padding:18px 20px 0;margin-bottom:12px"><div class="card__titles"><span class="tag">Regiões atendidas</span><h2 class="card__title" id="h-areas">Bairros e taxas</h2></div></div>
            <div class="tbl-wrap"><table class="tbl tbl--cards">
              <thead><tr><th>Região</th><th>Taxa</th><th>Tempo adicional</th><th>Pedido mínimo</th><th>Status</th><th class="r">Ações</th></tr></thead>
              <tbody data-linhas></tbody>
            </table></div>
          </section>
          <section class="card" aria-labelledby="h-mapa">
            <div class="card__head"><div class="card__titles"><span class="tag">Cobertura</span><h2 class="card__title" id="h-mapa">Mapa de entrega</h2></div></div>
            <div class="map" data-mapa></div>
            <div class="map__legend"><span><i style="background:rgba(247,116,29,.4);border:1px solid #f7741d"></i>Área ativa</span><span><i style="border:1px dashed #7d7068"></i>Área inativa</span><span><i style="border-radius:50%;background:#f7741d"></i>Loja</span><span>Círculos: distância da loja</span></div>
          </section>
          <section class="card areas__resumo" aria-labelledby="h-resumo">
            <div class="card__head" style="margin-bottom:0"><div class="card__titles"><span class="tag">Resumo</span><h2 class="card__title" id="h-resumo">Cobertura hoje</h2></div></div>
            <dl class="kv" data-resumo-kv style="margin:0"></dl>
            <p class="page-note">${icone('info')}<span>Mapa esquemático do protótipo. Passe o mouse numa linha da tabela para destacar a área no mapa; clique na área para editar. Na versão final, as áreas usam a faixa de CEP ou o raio a partir do endereço da loja.</span></p>
          </section>
        </div>
      </div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      const quente = id => {
        $$('[data-zona]', root).forEach(z => z.classList.toggle('is-hot', z.dataset.zona === id));
        $$('tr[data-id]', root).forEach(tr => tr.classList.toggle('is-hot', tr.dataset.id === id));
      };
      root.addEventListener('pointerover', ev => { const t = ev.target.closest('tr[data-id], [data-zona]'); quente(t ? (t.dataset.id || t.dataset.zona) : null); });
      root.addEventListener('focusin', ev => { const t = ev.target.closest('tr[data-id], [data-zona]'); if (t) quente(t.dataset.id || t.dataset.zona); });
      root.addEventListener('keydown', ev => { const z = ev.target.closest('[data-zona]'); if (z && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); formArea(E().areas.find(a => a.id === z.dataset.zona), id => this.pintar(id)); } });
      root.addEventListener('change', ev => {
        const t = ev.target.closest('[data-ativa]');
        if (!t) return;
        const a = E().areas.find(x => x.id === t.dataset.ativa);
        a.ativa = t.checked;
        BA.salvar(); this.pintar(null, `ar-${a.id}`);
        BA.toast(a.ativa ? `${a.nome} voltou a receber entregas.` : `${a.nome} desativado. O site não aceita mais esse bairro.`, a.ativa ? 'ok' : 'info');
      });
      root.addEventListener('click', async ev => {
        const z = ev.target.closest('[data-zona]');
        if (z) { formArea(E().areas.find(a => a.id === z.dataset.zona), id => this.pintar(id)); return; }
        const b = ev.target.closest('button');
        if (!b) return;
        const e = E();
        if (b.matches('[data-nova]')) return formArea(null, id => this.pintar(id));
        const a = e.areas.find(x => x.id === (b.dataset.editar || b.dataset.excluir));
        if (!a) return;
        if (b.dataset.editar) formArea(a, id => this.pintar(id));
        else {
          const ok = await BA.confirmar({ titulo: `Excluir ${esc(a.nome)}?`, texto: 'O bairro sai da lista do site. Pedidos já feitos para ele não mudam. A área fica em Excluídas e pode voltar.', botao: 'Excluir área', perigo: true });
          if (!ok) return;
          e.areas.splice(e.areas.indexOf(a), 1);
          BA.salvar(); this.pintar();
          BA.toast(`${a.nome} excluído das áreas de entrega.`, 'info');
        }
      });
    },
    pintar(destacar, focar) {
      const root = this.root;
      if (!root?.isConnected) return;
      const areas = E().areas;
      const ativas = areas.filter(a => a.ativa);
      $('[data-resumo]', root).textContent = `${plural(ativas.length, 'área ativa', 'áreas ativas')} de ${areas.length} · taxas de ${brl(Math.min(...ativas.map(a => a.taxa), Infinity) === Infinity ? 0 : Math.min(...ativas.map(a => a.taxa)))} a ${brl(Math.max(0, ...ativas.map(a => a.taxa)))}`;
      $('[data-linhas]', root).innerHTML = areas.length ? areas.map(a => `<tr data-id="${a.id}" class="area-row${a.ativa ? '' : ' is-inactive'}">
        <td data-th="Região" class="full"><div class="cell-main"><span class="cell-ic">${icone('pin')}</span><div><strong>${esc(a.nome)}</strong><small>${a.cobertura === 'cep' ? `CEP ${esc(a.cepIni)} a ${esc(a.cepFim)}` : `Raio de ${String(a.raio).replace('.', ',')} km da loja`}</small></div></div></td>
        <td data-th="Taxa" class="nowrap"><strong>${brl(a.taxa)}</strong></td>
        <td data-th="Tempo adicional" class="nowrap">${a.tempoExtra ? `+${a.tempoExtra} min` : 'Sem acréscimo'}</td>
        <td data-th="Pedido mínimo" class="nowrap">${a.minimo ? brl(a.minimo) : 'Sem mínimo'}</td>
        <td data-th="Status">${BA.interruptor({ id: `ar-${a.id}`, rotulo: a.ativa ? 'Ativa' : 'Inativa', marcado: a.ativa, attrs: `data-ativa="${a.id}"`, classe: 'switch--green' })}</td>
        <td class="row-acts-cell"><div class="row-acts">
          <button class="btn-icon btn-icon--sm" type="button" data-editar="${a.id}" aria-label="Editar ${esc(a.nome)}" title="Editar">${icone('pencil')}</button>
          <button class="btn-icon btn-icon--sm" type="button" data-excluir="${a.id}" aria-label="Excluir ${esc(a.nome)}" title="Excluir">${icone('trash')}</button>
        </div></td>
      </tr>`).join('') : `<tr><td colspan="6" class="full">${BA.vazio({ icone: 'map', titulo: 'Nenhuma área de entrega', texto: 'Sem áreas, o site só aceita retirada no balcão.', acao: `<button class="btn btn--primary" type="button" data-nova>${icone('plus')}Nova área</button>` })}</td></tr>`;
      $('[data-mapa]', root).innerHTML = mapa(areas);
      const taxas = ativas.map(a => a.taxa);
      $('[data-resumo-kv]', root).innerHTML = `
        <div><dt>${icone('map')}Áreas ativas</dt><dd>${ativas.length} de ${areas.length}</dd></div>
        <div><dt>${icone('wallet')}Taxa média</dt><dd>${taxas.length ? brl(taxas.reduce((s, v) => s + v, 0) / taxas.length) : '—'}</dd></div>
        <div><dt>${icone('target')}Maior raio atendido</dt><dd>${ativas.length ? String(Math.max(...ativas.map(a => a.raio || 0))).replace('.', ',') + ' km' : '—'}</dd></div>
        <div><dt>${icone('clock')}Prazo mais longo</dt><dd>${E().operacao.tempoMax + Math.max(0, ...ativas.map(a => a.tempoExtra))} min</dd></div>
        <div><dt>${icone('bag')}Menor pedido mínimo</dt><dd>${ativas.length ? brl(Math.min(...ativas.map(a => a.minimo || 0))) : '—'}</dd></div>`;
      if (focar) $(`#${focar}`, root)?.focus();
      if (destacar) $(`tr[data-id="${destacar}"]`, root)?.animate([{ background: 'rgba(247,116,29,.18)' }, { background: 'transparent' }], { duration: 1400 });
    },
    sair() {},
  };

  function formArea(a, depois) {
    if (a === undefined) return;
    const e = E();
    const novo = !a;
    const d = BA.janela({
      tamanho: 'md', titulo: novo ? 'Nova área de entrega' : `Editar ${esc(a.nome)}`, sub: 'Taxa, prazo e pedido mínimo valem para quem informar este bairro no site.',
      corpo: `<form class="form-sec" novalidate>
        <div class="form-grid">
          ${BA.campo({ id: 'ar-nome', rotulo: 'Bairro ou região', valor: a?.nome || '', obrigatorio: true, classe: 'span-2', attrs: 'maxlength="40" autocomplete="off"' })}
          ${BA.campo({ id: 'ar-taxa', rotulo: 'Taxa de entrega', obrigatorio: true, pre: 'R$', valor: a ? BA.valorCampo(a.taxa) : '', placeholder: '0,00', attrs: 'inputmode="decimal"', ajuda: 'Use 0,00 para entrega grátis.' })}
          ${BA.campo({ id: 'ar-tempo', rotulo: 'Tempo adicional', tipo: 'number', suf: 'min', valor: a?.tempoExtra ?? 0, attrs: 'min="0" max="90" inputmode="numeric"', ajuda: 'Somado ao tempo médio da loja.' })}
          ${BA.campo({ id: 'ar-min', rotulo: 'Pedido mínimo', opcional: true, pre: 'R$', valor: a?.minimo ? BA.valorCampo(a.minimo) : '', placeholder: '0,00', attrs: 'inputmode="decimal"' })}
        </div>
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Como definir a cobertura</legend>
          <div class="choices" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <label class="choice"><input type="radio" name="ar-cob" value="cep"${(a?.cobertura || 'cep') === 'cep' ? ' checked' : ''}><span class="choice__ic">${icone('mail')}</span><span><span class="choice__t">Faixa de CEP</span><span class="choice__d" style="display:block">Do CEP inicial ao final</span></span></label>
            <label class="choice"><input type="radio" name="ar-cob" value="raio"${a?.cobertura === 'raio' ? ' checked' : ''}><span class="choice__ic">${icone('target')}</span><span><span class="choice__t">Raio da loja</span><span class="choice__d" style="display:block">Distância em quilômetros</span></span></label>
          </div>
        </fieldset>
        <div class="form-grid" data-cep>
          ${BA.campo({ id: 'ar-cep1', rotulo: 'CEP inicial', obrigatorio: true, valor: a?.cepIni || '', placeholder: '00000-000', attrs: 'data-mascara="cep" inputmode="numeric"' })}
          ${BA.campo({ id: 'ar-cep2', rotulo: 'CEP final', obrigatorio: true, valor: a?.cepFim || '', placeholder: '00000-000', attrs: 'data-mascara="cep" inputmode="numeric"' })}
        </div>
        <div data-raio>${BA.campo({ id: 'ar-raio', rotulo: 'Raio de entrega', obrigatorio: true, suf: 'km', valor: a?.raio ? String(a.raio).replace('.', ',') : '', placeholder: '3,5', attrs: 'inputmode="decimal"' })}</div>
        ${BA.linhaInterruptor({ id: 'ar-ativa', rotulo: 'Área ativa', desc: 'Aparece na lista de bairros do site.', marcado: a ? a.ativa : true })}
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>' + icone('check') + 'Salvar área</button>',
    });
    const cob = () => $('[name="ar-cob"]:checked', d).value;
    const ajustar = () => { $('[data-cep]', d).hidden = cob() !== 'cep'; $('[data-raio]', d).hidden = cob() !== 'raio'; };
    ajustar();
    d.addEventListener('change', ev => { if (ev.target.name === 'ar-cob') ajustar(); });
    $('[data-salvar]', d).addEventListener('click', () => {
      const cepOk = v => /^\d{5}-\d{3}$/.test(v);
      const regras = [
        ['ar-nome', v => (!v ? 'Escreva o nome do bairro.' : e.areas.some(x => x !== a && normal(x.nome) === normal(v)) ? 'Esse bairro já está na lista.' : '')],
        ['ar-taxa', v => (v === '' ? 'Informe a taxa (0,00 para grátis).' : !(BA.lerValor(v) >= 0) ? 'Use um valor como 6,90.' : '')],
        ['ar-tempo', v => (v && (+v < 0 || +v > 90) ? 'Use de 0 a 90 minutos.' : '')],
        ['ar-min', v => (v && !(BA.lerValor(v) >= 0) ? 'Use um valor como 20,00.' : '')],
      ];
      if (cob() === 'cep') regras.push(['ar-cep1', v => (!cepOk(v) ? 'Use o formato 00000-000.' : '')], ['ar-cep2', v => (!cepOk(v) ? 'Use o formato 00000-000.' : v.replace('-', '') < $('#ar-cep1', d).value.replace('-', '') ? 'O CEP final precisa ser maior que o inicial.' : '')]);
      else regras.push(['ar-raio', v => (!(BA.lerValor(v) > 0 && BA.lerValor(v) <= 30) ? 'Use de 0,5 a 30 km.' : '')]);
      if (!BA.validar(d, regras)) return;
      const dados = {
        nome: $('#ar-nome', d).value.trim(), taxa: BA.r2(BA.lerValor($('#ar-taxa', d).value)), tempoExtra: +$('#ar-tempo', d).value || 0,
        minimo: $('#ar-min', d).value ? BA.r2(BA.lerValor($('#ar-min', d).value)) : 0, cobertura: cob(),
        cepIni: cob() === 'cep' ? $('#ar-cep1', d).value : '', cepFim: cob() === 'cep' ? $('#ar-cep2', d).value : '',
        raio: cob() === 'raio' ? BA.lerValor($('#ar-raio', d).value) : (a?.raio || 2), ativa: $('#ar-ativa', d).checked,
      };
      let id;
      if (novo) { id = BA.slug(dados.nome) || BA.uid('area'); if (e.areas.some(x => x.id === id)) id = BA.uid(id); e.areas.push({ id, ...dados }); }
      else { Object.assign(a, dados); id = a.id; }
      BA.salvar(); d.close();
      BA.toast(novo ? `${dados.nome} adicionado com taxa de ${brl(dados.taxa)}.` : `${dados.nome} salvo.`);
      depois?.(id);
    });
  }

  /* ================================================================== banners e promoções */
  const STB = { ativo: ['Ativo', 'green'], agendado: ['Agendado', 'blue'], encerrado: ['Encerrado', 'muted'] };
  const destinoTexto = dest => {
    const [tipo, valor] = String(dest || '').split(/:(.*)/s);
    const e = E();
    if (tipo === 'categoria') return `Categoria: ${e.categorias.find(c => c.id === valor)?.nome || 'removida'}`;
    if (tipo === 'produto') return `Produto: ${e.produtos.find(p => p.id === valor)?.nome || 'removido'}`;
    if (tipo === 'cupom') return `Cupom: ${valor}`;
    if (tipo === 'link') return `Link: ${valor}`;
    return 'Sem destino';
  };
  const imgBanner = b => b.imagem || foto(b.foto, 960);

  BA.telas.banners = {
    esqueleto: 'grade',
    filtro: 'todos',
    preview: {},
    render(el) {
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Filtrar campanhas" data-filtros></div>
          <div class="toolbar__r"><button class="btn btn--ghost" type="button" data-excluidos="banners">${icone('trash')}Excluídos</button><button class="btn btn--primary" type="button" data-novo>${icone('plus')}Nova campanha</button></div>
        </div>
        <p class="page-note" style="margin-bottom:14px">${icone('info')}<span>Onde aparece no site: campanha com destino "cupom" vira a linha do cupom no topo da página; as outras aparecem como cartões logo acima do cardápio, com o botão para o produto ou a categoria escolhidos.</span></p>
        <div class="bgrid" data-grade></div>
      </div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      root.addEventListener('click', async ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const e = E();
        if (b.dataset.filtro) { this.filtro = b.dataset.filtro; this.pintar(); return; }
        if (b.matches('[data-novo]')) return formBanner(null, id => this.pintar(id));
        const bn = e.banners.find(x => x.id === (b.dataset.ver || b.dataset.editar || b.dataset.duplicar || b.dataset.excluir || b.dataset.alvo));
        if (!bn) return;
        if (b.dataset.ver) { this.preview[bn.id] = b.dataset.modo; this.pintar(null, `[data-ver="${bn.id}"][data-modo="${b.dataset.modo}"]`); return; }
        if (b.dataset.mover) {
          const lista = [...e.banners].sort((x, y) => x.ordem - y.ordem);
          const i = lista.indexOf(bn), j = i + Number(b.dataset.mover);
          if (j < 0 || j >= lista.length) return;
          [lista[i], lista[j]] = [lista[j], lista[i]];
          lista.forEach((x, k) => { x.ordem = k + 1; });
          BA.salvar(); this.pintar(null, `[data-mover="${b.dataset.mover}"][data-alvo="${bn.id}"]`);
          BA.toast(`${bn.titulo} agora aparece em ${bn.ordem}º no carrossel.`, 'info');
          return;
        }
        if (b.dataset.editar) formBanner(bn, id => this.pintar(id));
        else if (b.dataset.duplicar) {
          const copia = { ...bn, id: BA.uid('b'), titulo: `${bn.titulo} (cópia)`, status: 'agendado', ordem: e.banners.length + 1 };
          e.banners.push(copia);
          BA.salvar(); this.pintar(copia.id);
          BA.toast(`Campanha ${copia.titulo} criada como agendada.`);
        } else if (b.dataset.excluir) {
          const ok = await BA.confirmar({ titulo: 'Excluir campanha?', texto: `<strong>${esc(bn.titulo)}</strong> sai do site. A campanha fica em Excluídos e pode voltar.`, botao: 'Excluir campanha', perigo: true });
          if (!ok) return;
          e.banners.splice(e.banners.indexOf(bn), 1);
          [...e.banners].sort((x, y) => x.ordem - y.ordem).forEach((x, k) => { x.ordem = k + 1; });
          BA.salvar(); this.pintar();
          BA.toast(`Campanha ${bn.titulo} excluída.`, 'info');
        }
      });
    },
    pintar(destacar, focar) {
      const root = this.root;
      if (!root?.isConnected) return;
      const e = E();
      const n = { todos: e.banners.length, ativo: 0, agendado: 0, encerrado: 0 };
      e.banners.forEach(b => { n[b.status]++; });
      $('[data-filtros]', root).innerHTML = [['todos', 'Todas'], ['ativo', 'Ativas'], ['agendado', 'Agendadas'], ['encerrado', 'Encerradas']].map(([v, t]) => `<button class="chip" type="button" data-filtro="${v}" aria-pressed="${this.filtro === v}">${t}<span class="chip__n">${n[v]}</span></button>`).join('');
      const lista = [...e.banners].sort((a, b) => a.ordem - b.ordem).filter(b => this.filtro === 'todos' || b.status === this.filtro);
      const total = e.banners.length;
      $('[data-grade]', root).innerHTML = lista.length ? lista.map(b => {
        const modo = this.preview[b.id] || (b.desktop ? 'desktop' : 'mobile');
        return `<article class="card bc" data-id="${b.id}">
          <div class="bc__prev${modo === 'mobile' ? ' is-mobile' : ''}">
            <div class="ban"><img src="${imgBanner(b)}" alt="" loading="lazy"><div class="ban__txt"><p class="ban__t">${esc(b.titulo)}</p>${b.texto ? `<p class="ban__p">${esc(b.texto)}</p>` : ''}<span class="ban__cta">Pedir agora</span></div></div>
          </div>
          <div class="bc__body">
            <div class="bc__top"><h3 class="bc__name">${esc(b.titulo)}</h3><span class="pill pill--${STB[b.status][1]}">${STB[b.status][0]}</span></div>
            <dl class="bc__meta">
              <div>${icone('calendar')}<dt class="sr-only">Período</dt><dd style="margin:0"><b>${dataCurta(b.inicio)} a ${dataBR(b.fim)}</b></dd></div>
              <div>${icone('link')}<dt class="sr-only">Destino do clique</dt><dd style="margin:0">${esc(destinoTexto(b.destino))}</dd></div>
              <div>${icone('monitor')}<dt class="sr-only">Exibição</dt><dd style="margin:0">${b.desktop && b.mobile ? 'Desktop e celular' : b.desktop ? 'Só desktop' : 'Só celular'}</dd></div>
              <div>${icone('arrow-up-down')}<dt class="sr-only">Prioridade</dt><dd style="margin:0;display:flex;align-items:center;gap:8px">Prioridade <b>${b.ordem}º</b>
                <button class="btn-icon btn-icon--sm btn-icon--ghost" type="button" data-mover="-1" data-alvo="${b.id}" aria-label="Subir prioridade de ${esc(b.titulo)}"${b.ordem <= 1 ? ' disabled' : ''}>${icone('arrow-up')}</button>
                <button class="btn-icon btn-icon--sm btn-icon--ghost" type="button" data-mover="1" data-alvo="${b.id}" aria-label="Descer prioridade de ${esc(b.titulo)}"${b.ordem >= total ? ' disabled' : ''}>${icone('arrow-down')}</button></dd></div>
            </dl>
          </div>
          <div class="bc__foot">
            <div class="seg" role="group" aria-label="Prévia de ${esc(b.titulo)}">
              <button type="button" data-ver="${b.id}" data-modo="desktop" aria-pressed="${modo === 'desktop'}">${icone('monitor')}Desktop</button>
              <button type="button" data-ver="${b.id}" data-modo="mobile" aria-pressed="${modo === 'mobile'}">${icone('phone2')}Celular</button>
            </div>
            <div class="row-acts">
              <button class="btn-icon btn-icon--sm" type="button" data-editar="${b.id}" aria-label="Editar ${esc(b.titulo)}" title="Editar">${icone('pencil')}</button>
              <button class="btn-icon btn-icon--sm" type="button" data-duplicar="${b.id}" aria-label="Duplicar ${esc(b.titulo)}" title="Duplicar">${icone('copy')}</button>
              <button class="btn-icon btn-icon--sm" type="button" data-excluir="${b.id}" aria-label="Excluir ${esc(b.titulo)}" title="Excluir">${icone('trash')}</button>
            </div>
          </div>
        </article>`;
      }).join('') : `<div style="grid-column:1/-1">${BA.vazio({ icone: 'megaphone', titulo: 'Nenhuma campanha aqui', texto: 'Crie um banner para destacar uma promoção no site.', acao: `<button class="btn btn--primary" type="button" data-novo>${icone('plus')}Nova campanha</button>` })}</div>`;
      if (focar) $(focar, root)?.focus();
      if (destacar) { const c = $(`.bc[data-id="${destacar}"]`, root); c?.scrollIntoView({ block: 'center', behavior: BA.suave() }); flash(c); }
    },
    sair() {},
  };

  function formBanner(b, depois) {
    const e = E();
    const novo = !b;
    let imagem = b ? imgBanner(b) : '';
    let mudou = false;
    const [dTipo, dValor] = String(b?.destino || 'categoria:hamburgueres').split(/:(.*)/s);
    const hoje = BA.hojeISO();
    const d = BA.janela({
      tamanho: 'lg', titulo: novo ? 'Nova campanha' : 'Editar campanha', sub: 'O banner aparece no topo do cardápio do site, na ordem de prioridade.',
      corpo: `<form novalidate>
        <div class="form-sec"><div class="fld"><span class="fld__label">Imagem do banner<span class="req" aria-hidden="true">*</span> <span class="opt">· 1600 × 700 px recomendado</span></span><div data-upload></div></div></div>
        <div class="form-sec"><div class="form-grid">
          ${BA.campo({ id: 'bn-titulo', rotulo: 'Título', valor: b?.titulo || '', obrigatorio: true, classe: 'span-2', attrs: 'maxlength="40" autocomplete="off"' })}
          ${BA.campo({ id: 'bn-texto', rotulo: 'Texto', tipo: 'textarea', linhas: 2, opcional: true, valor: b?.texto || '', classe: 'span-2', attrs: 'maxlength="120"', ajuda: 'Até 120 caracteres.' })}
          ${BA.campo({ id: 'bn-dtipo', rotulo: 'Ao clicar, levar para', valor: dTipo, opcoes: [{ v: 'categoria', t: 'Uma categoria' }, { v: 'produto', t: 'Um produto' }, { v: 'cupom', t: 'Aplicar um cupom' }, { v: 'link', t: 'Um link' }] })}
          <div data-dest-cat>${BA.campo({ id: 'bn-cat', rotulo: 'Categoria', valor: dTipo === 'categoria' ? dValor : '', opcoes: e.categorias.map(c => ({ v: c.id, t: c.nome })) })}</div>
          <div data-dest-prod>${BA.campo({ id: 'bn-prod', rotulo: 'Produto', valor: dTipo === 'produto' ? dValor : '', opcoes: e.produtos.map(p => ({ v: p.id, t: p.nome })) })}</div>
          <div data-dest-cupom>${BA.campo({ id: 'bn-cupom', rotulo: 'Cupom', valor: dTipo === 'cupom' ? dValor : '', opcoes: e.cupons.map(c => ({ v: c.codigo, t: c.codigo })) })}</div>
          <div data-dest-link>${BA.campo({ id: 'bn-link', rotulo: 'Link', obrigatorio: true, valor: dTipo === 'link' ? dValor : '', placeholder: 'https://', attrs: 'type="url" inputmode="url"' })}</div>
          ${BA.campo({ id: 'bn-inicio', rotulo: 'Começa em', tipo: 'date', obrigatorio: true, valor: b?.inicio || hoje })}
          ${BA.campo({ id: 'bn-fim', rotulo: 'Termina em', tipo: 'date', obrigatorio: true, valor: b?.fim || '' })}
          ${BA.campo({ id: 'bn-status', rotulo: 'Status', valor: b?.status || 'agendado', opcoes: Object.entries(STB).map(([v, [t]]) => ({ v, t })) })}
          ${BA.campo({ id: 'bn-ordem', rotulo: 'Prioridade', tipo: 'number', valor: b?.ordem || e.banners.length + 1, attrs: `min="1" max="${e.banners.length + (novo ? 1 : 0)}" inputmode="numeric"`, ajuda: '1 aparece primeiro.' })}
          <fieldset class="fld span-2" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Exibir em</legend>
            <div class="chk-grid">${BA.caixa({ nome: 'bn-onde', valor: 'desktop', rotulo: `${icone('monitor')} Computador`, marcado: b ? b.desktop : true })}${BA.caixa({ nome: 'bn-onde', valor: 'mobile', rotulo: `${icone('phone2')} Celular`, marcado: b ? b.mobile : true })}</div>
            <p class="fld__err" id="bn-onde-err" hidden></p>
          </fieldset>
        </div></div>
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>' + icone('check') + 'Salvar campanha</button>',
    });
    BA.upload($('[data-upload]', d), { valor: imagem, largo: true, rotulo: 'Imagem do banner', aoMudar: url => { imagem = url; mudou = true; } });
    const ajustar = () => { const t = $('#bn-dtipo', d).value; ['cat', 'prod', 'cupom', 'link'].forEach(k => { $(`[data-dest-${k}]`, d).hidden = { cat: 'categoria', prod: 'produto', cupom: 'cupom', link: 'link' }[k] !== t; }); };
    ajustar();
    $('#bn-dtipo', d).addEventListener('change', ajustar);
    $('[data-salvar]', d).addEventListener('click', () => {
      const t = $('#bn-dtipo', d).value;
      const regras = [
        ['bn-titulo', BA.obrig('Escreva o título da campanha.')],
        ['bn-inicio', BA.obrig('Escolha quando começa.')],
        ['bn-fim', v => (!v ? 'Escolha quando termina.' : v < $('#bn-inicio', d).value ? 'O fim precisa ser depois do início.' : '')],
        ['bn-ordem', v => (!(+v >= 1) ? 'Use 1 ou mais.' : '')],
      ];
      if (t === 'link') regras.push(['bn-link', v => (!/^https?:\/\/\S+\.\S+/.test(v) ? 'Use um link completo, começando com https://' : '')]);
      const onde = $$('[name="bn-onde"]:checked', d).map(c => c.value);
      const errOnde = $('#bn-onde-err', d);
      errOnde.hidden = !!onde.length;
      if (!onde.length) errOnde.innerHTML = `${icone('alert')}Escolha pelo menos um lugar para exibir.`;
      const errImg = $('[data-upload] .fld__err', d);
      if (!imagem) { errImg.innerHTML = `${icone('alert')}Escolha a imagem do banner.`; errImg.hidden = false; }
      if (!BA.validar(d, regras) || !onde.length || !imagem) { if (!imagem || !onde.length) BA.toast('Confira os campos destacados antes de salvar.', 'erro'); return; }
      const valor = { categoria: $('#bn-cat', d).value, produto: $('#bn-prod', d).value, cupom: $('#bn-cupom', d).value, link: $('#bn-link', d).value.trim() }[t];
      const dados = {
        titulo: $('#bn-titulo', d).value.trim(), texto: $('#bn-texto', d).value.trim(), destino: `${t}:${valor}`,
        inicio: $('#bn-inicio', d).value, fim: $('#bn-fim', d).value, status: $('#bn-status', d).value,
        desktop: onde.includes('desktop'), mobile: onde.includes('mobile'),
      };
      if (mudou) { dados.imagem = imagem; }
      let alvo;
      if (novo) { alvo = { id: BA.uid('b'), foto: '', imagem, ...dados, ordem: 999 }; e.banners.push(alvo); }
      else { alvo = b; Object.assign(b, dados); }
      // reposiciona pela prioridade escolhida
      const lista = [...e.banners].sort((x, y) => x.ordem - y.ordem).filter(x => x !== alvo);
      lista.splice(Math.min(lista.length, Math.max(0, +$('#bn-ordem', d).value - 1)), 0, alvo);
      lista.forEach((x, k) => { x.ordem = k + 1; });
      BA.salvar(); d.close();
      BA.toast(novo ? `Campanha ${dados.titulo} criada · ${STB[dados.status][0].toLowerCase()}.` : `Campanha ${dados.titulo} salva.`);
      depois?.(alvo.id);
    });
  }

  /* ================================================================== configurações */
  const ABAS = [
    ['dados', 'Dados da loja', 'building'], ['operacao', 'Operação', 'power'], ['horarios', 'Horários', 'clock'],
    ['pagamentos', 'Formas de pagamento', 'wallet'], ['entrega', 'Entrega e retirada', 'truck'], ['notificacoes', 'Notificações', 'bell'], ['usuarios', 'Usuários', 'users'],
    ['privacidade', 'Privacidade (LGPD)', 'eye'], ['seguranca', 'Segurança', 'shield'],
  ];
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const FUNCOES = { Administrador: ['pedidos', 'produtos', 'cupons', 'areas', 'banners', 'configuracoes', 'usuarios'], Gerente: ['pedidos', 'produtos', 'cupons', 'areas', 'banners'], Atendente: ['pedidos'], Cozinha: ['pedidos'] };
  const PERMS = { pedidos: 'Pedidos', produtos: 'Cardápio', cupons: 'Cupons', areas: 'Áreas', banners: 'Banners', configuracoes: 'Configurações', usuarios: 'Usuários' };
  const STU = { ativo: ['Ativo', 'green'], convite: ['Convite pendente', 'amber'], inativo: ['Inativo', 'muted'] };

  BA.telas.configuracoes = {
    esqueleto: 'tabela',
    aba: 'dados',
    render(el, params) {
      const a = params?.get('aba');
      if (a && ABAS.some(x => x[0] === a)) this.aba = a;
      el.innerHTML = `<div class="page"><div class="settings">
        <div class="card tabs" role="tablist" aria-label="Seções de configuração" aria-orientation="vertical">
          ${ABAS.map(([id, t, ic]) => `<button class="tab" type="button" role="tab" id="tab-${id}" aria-controls="painel-cfg" aria-selected="${this.aba === id}" tabindex="${this.aba === id ? 0 : -1}" data-aba="${id}">${icone(ic)}${t}</button>`).join('')}
        </div>
        <section class="card" id="painel-cfg" role="tabpanel" aria-labelledby="tab-${this.aba}" data-painel></section>
      </div></div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      $('[role="tablist"]', root).addEventListener('click', ev => { const b = ev.target.closest('[data-aba]'); if (b) this.trocar(b.dataset.aba, true); });
      $('[role="tablist"]', root).addEventListener('keydown', ev => {
        const ids = ABAS.map(x => x[0]);
        const i = ids.indexOf(this.aba);
        const passo = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
        if (passo) { ev.preventDefault(); this.trocar(ids[(i + passo + ids.length) % ids.length], true); }
        if (ev.key === 'Home') { ev.preventDefault(); this.trocar(ids[0], true); }
        if (ev.key === 'End') { ev.preventDefault(); this.trocar(ids[ids.length - 1], true); }
      });
      this.off = [BA.on('mudou', () => { if (this.aba === 'operacao' && !document.querySelector('dialog[open]')) this.pintar(); })];
    },
    trocar(aba, focar) {
      this.aba = aba;
      history.replaceState(null, '', `#/configuracoes?aba=${aba}`);
      $$('[data-aba]', this.root).forEach(t => { const on = t.dataset.aba === aba; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      $('[data-painel]', this.root).setAttribute('aria-labelledby', `tab-${aba}`);
      this.pintar();
      if (focar) { $(`#tab-${aba}`, this.root).focus(); $(`#tab-${aba}`, this.root).scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    },
    pintar() {
      const painel = $('[data-painel]', this.root);
      if (!painel) return;
      // cada aba desenha numa caixa nova: os ouvintes da aba anterior vão embora junto
      const box = document.createElement('div');
      painel.replaceChildren(box);
      const f = { dados: abaDados, operacao: abaOperacao, horarios: abaHorarios, pagamentos: abaPagamentos, entrega: abaEntrega, notificacoes: abaNotificacoes, usuarios: abaUsuarios, privacidade: abaPrivacidade, seguranca: abaSeguranca }[this.aba];
      f(box, this);
    },
    sair() { (this.off || []).forEach(f => f()); this.off = []; },
  };
  const cab = (t, d) => `<div class="card__head"><div class="card__titles"><h2 class="card__title">${t}</h2><p class="card__sub">${d}</p></div></div>`;
  const rodapeSalvar = (t = 'Salvar alterações') => `<div class="panel-foot"><button class="btn btn--ghost" type="button" data-desfazer>Descartar</button><button class="btn btn--primary" type="button" data-salvar>${icone('check')}${t}</button></div>`;
  function ligarRodape(p, tela, salvar) {
    $('[data-salvar]', p)?.addEventListener('click', salvar);
    $('[data-desfazer]', p)?.addEventListener('click', () => { tela.pintar(); BA.toast('Alterações descartadas.', 'info'); });
  }

  function abaDados(p, tela) {
    const l = E().config.loja;
    p.innerHTML = `${cab('Dados da loja', 'Aparecem no rodapé do site, na comanda e nas mensagens aos clientes.')}
      <form class="form-grid" novalidate>
        ${BA.campo({ id: 'lj-nome', rotulo: 'Nome da loja', valor: l.nome, obrigatorio: true })}
        ${BA.campo({ id: 'lj-razao', rotulo: 'Razão social', valor: l.razao, opcional: true })}
        ${BA.campo({ id: 'lj-cnpj', rotulo: 'CNPJ', valor: l.cnpj, opcional: true, placeholder: '00.000.000/0000-00', attrs: 'data-mascara="cnpj" inputmode="numeric"' })}
        ${BA.campo({ id: 'lj-email', rotulo: 'E-mail', tipo: 'email', valor: l.email, obrigatorio: true })}
        ${BA.campo({ id: 'lj-fone', rotulo: 'Telefone', valor: l.telefone, opcional: true, attrs: 'data-mascara="fone" inputmode="tel"' })}
        ${BA.campo({ id: 'lj-whats', rotulo: 'WhatsApp', valor: l.whatsapp, obrigatorio: true, attrs: 'data-mascara="fone" inputmode="tel"', ajuda: 'Aparece no rodapé, nas dúvidas e nas mensagens do site.' })}
        <div class="span-2 form-sec" style="margin-top:8px"><p class="form-sec__t">Logo</p></div>
        <div class="span-2"><div data-logo-upl></div><p class="fld__help">Use a logo oficial, de preferência em PNG com fundo transparente. Ela aparece no topo do site e aqui no painel. Depois de escolher, toque em Salvar alterações.</p></div>
        <div class="span-2 form-sec" style="margin-top:8px"><p class="form-sec__t">Textos do site</p><p class="form-sec__d">Deixe em branco para usar o texto padrão (aparece cinza no campo).</p></div>
        ${BA.campo({ id: 'lj-slogan1', rotulo: 'Frase do topo: primeira linha', valor: l.slogan1 || '', placeholder: 'Burguer na parrilla,', attrs: 'maxlength="40"' })}
        ${BA.campo({ id: 'lj-slogan2', rotulo: 'Frase do topo: segunda linha (laranja)', valor: l.slogan2 || '', placeholder: 'na sua porta.', attrs: 'maxlength="40"' })}
        ${BA.campo({ id: 'lj-apoio', rotulo: 'Texto de apoio do topo', valor: l.apoio || '', classe: 'span-2', placeholder: 'Blend bovino de 150 g na parrilla no pão brioche. Turbine o seu com adicionais, de bacon a costela desfiada.', attrs: 'maxlength="160"', ajuda: 'O prazo e os bairros de entrega entram logo depois, sozinhos.' })}
        ${BA.campo({ id: 'lj-descricao', rotulo: 'Descrição curta da loja', valor: l.descricao || '', placeholder: 'Hamburgueria artesanal na Madalena, Recife', attrs: 'maxlength="120"', ajuda: 'Vai no título da aba, no Google e no rodapé.' })}
        ${BA.campo({ id: 'lj-botao', rotulo: 'Botão do topo', valor: l.botao || '', placeholder: 'Escolher meu burguer', attrs: 'maxlength="30"', ajuda: 'Com a loja fechada, o botão vira "Agendar para…".' })}
        <div class="span-2 form-sec" style="margin-top:8px"><p class="form-sec__t">Endereço</p></div>
        ${BA.campo({ id: 'lj-cep', rotulo: 'CEP', valor: l.cep, obrigatorio: true, attrs: 'data-mascara="cep" inputmode="numeric"' })}
        ${BA.campo({ id: 'lj-rua', rotulo: 'Rua', valor: l.rua, obrigatorio: true })}
        ${BA.campo({ id: 'lj-num', rotulo: 'Número', valor: l.numero, obrigatorio: true })}
        ${BA.campo({ id: 'lj-bairro', rotulo: 'Bairro', valor: l.bairro, obrigatorio: true })}
        ${BA.campo({ id: 'lj-cidade', rotulo: 'Cidade', valor: l.cidade, obrigatorio: true })}
        ${BA.campo({ id: 'lj-uf', rotulo: 'Estado', valor: l.uf, obrigatorio: true, opcoes: UFS.map(u => ({ v: u, t: u })) })}
      </form>${rodapeSalvar()}`;
    let logo = E().logo || '';
    let mudouLogo = false;
    BA.upload($('[data-logo-upl]', p), { valor: logo, rotulo: 'Logo da loja', formato: 'png', max: 600, aoMudar: url => { logo = url; mudouLogo = true; } });
    ligarRodape(p, tela, () => {
      const ok = BA.validar(p, [
        ['lj-nome', BA.obrig('Escreva o nome da loja.')],
        ['lj-cnpj', v => (v && v.replace(/\D/g, '').length !== 14 ? 'O CNPJ tem 14 números.' : '')],
        ['lj-email', v => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Confira o e-mail.' : '')],
        ['lj-fone', v => (v && v.replace(/\D/g, '').length < 10 ? 'Escreva o telefone com DDD.' : '')],
        ['lj-whats', v => (v.replace(/\D/g, '').length < 10 ? 'Escreva o WhatsApp com DDD.' : '')],
        ['lj-cep', v => (!/^\d{5}-\d{3}$/.test(v) ? 'Use o formato 00000-000.' : '')],
        ['lj-rua', BA.obrig('Escreva a rua.')], ['lj-num', BA.obrig('Escreva o número.')], ['lj-bairro', BA.obrig('Escreva o bairro.')], ['lj-cidade', BA.obrig('Escreva a cidade.')],
      ]);
      if (!ok) return;
      Object.assign(l, { nome: $('#lj-nome', p).value.trim(), razao: $('#lj-razao', p).value.trim(), cnpj: $('#lj-cnpj', p).value, email: $('#lj-email', p).value.trim(), telefone: $('#lj-fone', p).value, whatsapp: $('#lj-whats', p).value, cep: $('#lj-cep', p).value, rua: $('#lj-rua', p).value.trim(), numero: $('#lj-num', p).value.trim(), bairro: $('#lj-bairro', p).value.trim(), cidade: $('#lj-cidade', p).value.trim(), uf: $('#lj-uf', p).value,
        slogan1: $('#lj-slogan1', p).value.trim(), slogan2: $('#lj-slogan2', p).value.trim(), apoio: $('#lj-apoio', p).value.trim(), descricao: $('#lj-descricao', p).value.trim(), botao: $('#lj-botao', p).value.trim() });
      if (mudouLogo) { E().logo = logo; mudouLogo = false; }
      BA.salvar(); BA.toast('Dados da loja salvos.');
    });
  }

  function abaOperacao(p, tela) {
    const op = E().operacao;
    p.innerHTML = `${cab('Operação', 'Controle o recebimento de pedidos agora e os prazos que o site mostra.')}
      <div class="form-sec">
        ${BA.linhaInterruptor({ id: 'op-aberta', rotulo: op.aberta ? 'Loja aberta' : 'Loja fechada', desc: op.aberta ? 'O site aceita pedidos dentro do horário.' : 'O site mostra a loja fechada e só aceita agendamento.', marcado: op.aberta, classe: 'switch--green' })}
        <div class="status-box ${op.pausada ? 'is-paused' : !op.aberta ? 'is-closed' : ''}" style="margin:0">
          <span class="dot ${op.pausada ? 'dot--amber' : !op.aberta ? 'dot--red' : 'dot--pulse'}" aria-hidden="true"></span>
          <div style="flex:1"><p class="status-box__t">${op.pausada ? 'Pedidos pausados' : !op.aberta ? 'Fechada' : 'Recebendo pedidos'}</p><p class="status-box__s">${op.pausada ? `${esc(op.motivo)} · ${op.pausaAte ? `volta às ${BA.hm(op.pausaAte)}` : 'até você retomar'}` : 'Use a pausa temporária quando a cozinha precisar respirar.'}</p></div>
          ${op.aberta ? (op.pausada ? `<button class="btn btn--green" type="button" data-retomar>${icone('play')}Retomar pedidos</button>` : `<button class="btn btn--ghost" type="button" data-pausar>${icone('pause')}Pausa temporária</button>`) : ''}
        </div>
      </div>
      <form class="form-sec" novalidate>
        <p class="form-sec__t">Prazos e valores</p>
        <div class="form-grid form-grid--3">
          ${BA.campo({ id: 'op-tmin', rotulo: 'Tempo médio: mínimo', tipo: 'number', suf: 'min', valor: op.tempoMin, obrigatorio: true, attrs: 'min="5" max="180" inputmode="numeric"' })}
          ${BA.campo({ id: 'op-tmax', rotulo: 'Tempo médio: máximo', tipo: 'number', suf: 'min', valor: op.tempoMax, obrigatorio: true, attrs: 'min="5" max="180" inputmode="numeric"' })}
          ${BA.campo({ id: 'op-prep', rotulo: 'Tempo de preparo', tipo: 'number', suf: 'min', valor: op.tempoPreparo, attrs: 'min="1" max="120" inputmode="numeric"' })}
          ${BA.campo({ id: 'op-min', rotulo: 'Pedido mínimo', pre: 'R$', valor: BA.valorCampo(op.pedidoMinimo), attrs: 'inputmode="decimal"', ajuda: 'Cada área pode ter o seu.' })}
        </div>
      </form>${rodapeSalvar()}`;
    $('#op-aberta', p).addEventListener('change', ev => {
      op.aberta = ev.target.checked;
      if (!op.aberta) Object.assign(op, { pausada: false, motivo: '', pausaAte: null });
      BA.salvar(); BA.emit('mudou');
      BA.toast(op.aberta ? 'Loja aberta. O site voltou a aceitar pedidos.' : 'Loja fechada. O site só aceita pedidos agendados.', op.aberta ? 'ok' : 'alerta');
      tela.pintar(); $('#op-aberta', tela.root)?.focus();
    });
    $('[data-pausar]', p)?.addEventListener('click', async () => { await BA.pausarPedidos(); tela.pintar(); $('[data-retomar], [data-pausar]', tela.root)?.focus(); });
    $('[data-retomar]', p)?.addEventListener('click', () => { BA.retomarPedidos(); tela.pintar(); $('[data-pausar]', tela.root)?.focus(); });
    ligarRodape(p, tela, () => {
      const ok = BA.validar(p, [
        ['op-tmin', v => (!(+v >= 5) ? 'Use 5 minutos ou mais.' : '')],
        ['op-tmax', v => (!(+v >= 5) ? 'Use 5 minutos ou mais.' : +v < +$('#op-tmin', p).value ? 'O máximo precisa ser maior que o mínimo.' : '')],
        ['op-prep', v => (v && !(+v >= 1) ? 'Use 1 minuto ou mais.' : '')],
        ['op-min', v => (v && !(BA.lerValor(v) >= 0) ? 'Use um valor como 20,00.' : '')],
      ]);
      if (!ok) return;
      Object.assign(op, { tempoMin: +$('#op-tmin', p).value, tempoMax: +$('#op-tmax', p).value, tempoPreparo: +$('#op-prep', p).value || op.tempoPreparo, pedidoMinimo: BA.r2(BA.lerValor($('#op-min', p).value) || 0) });
      BA.salvar(); BA.emit('mudou');
      BA.toast(`Operação salva: entrega em ${op.tempoMin}–${op.tempoMax} min, pedido mínimo de ${brl(op.pedidoMinimo)}.`);
    });
  }

  function abaHorarios(p, tela) {
    const cfg = E().config;
    const horas = cfg.horarios.map(h => ({ ...h }));
    const excecoes = cfg.excecoes.map(x => ({ ...x }));
    const pintarExc = () => {
      $('[data-exc]', p).innerHTML = excecoes.length ? excecoes.sort((a, b) => a.data.localeCompare(b.data)).map((x, i) => `<div class="exc">
        <strong>${dataBR(x.data)}</strong><span>${esc(x.descricao)}</span>
        <span class="pill ${x.tipo === 'fechado' ? 'pill--red' : 'pill--blue'} pill--plain">${x.tipo === 'fechado' ? 'Fechado' : `${x.abre.replace(':', 'h')} às ${x.fecha.replace(':', 'h')}`}</span>
        <button class="btn-icon btn-icon--sm" type="button" data-tira-exc="${i}" aria-label="Remover exceção ${esc(x.descricao)}">${icone('trash')}</button>
      </div>`).join('') : '<p class="muted">Nenhuma exceção cadastrada.</p>';
    };
    p.innerHTML = `${cab('Horários de funcionamento', 'Fuso de Brasília. Fora do horário, o site aceita pedidos agendados.')}
      <form class="form-sec" novalidate>
        <div class="hours">${horas.map((h, i) => `<div class="hour-row${h.aberto ? '' : ' is-closed'}" data-dia="${i}">
          <span class="hour-row__day">${h.dia}</span>
          ${BA.interruptor({ id: `hr-on-${i}`, rotulo: h.aberto ? 'Aberto' : 'Fechado', marcado: h.aberto, attrs: `data-on="${i}"`, classe: 'switch--green' })}
          <div class="fld hour-time"><label class="sr-only" for="hr-a-${i}">${h.dia}: abre às</label><input class="inp" type="time" id="hr-a-${i}" value="${h.abre}" aria-describedby="hr-a-${i}-err"><p class="fld__err" id="hr-a-${i}-err" hidden></p></div>
          <div class="fld hour-time"><label class="sr-only" for="hr-f-${i}">${h.dia}: fecha às</label><input class="inp" type="time" id="hr-f-${i}" value="${h.fecha}" aria-describedby="hr-f-${i}-err"><p class="fld__err" id="hr-f-${i}-err" hidden></p></div>
        </div>`).join('')}</div>
      </form>
      <div class="form-sec">
        <p class="form-sec__t">Exceções e feriados</p>
        <p class="form-sec__d">Datas com horário diferente ou loja fechada.</p>
        <div class="exc-list" data-exc></div>
        <div class="form-grid form-grid--3" style="align-items:end">
          ${BA.campo({ id: 'ex-data', rotulo: 'Data', tipo: 'date', valor: '' })}
          ${BA.campo({ id: 'ex-desc', rotulo: 'Descrição', placeholder: 'Ex.: Carnaval' })}
          ${BA.campo({ id: 'ex-tipo', rotulo: 'Como fica', opcoes: [{ v: 'fechado', t: 'Fechado o dia todo' }, { v: 'especial', t: 'Horário especial' }] })}
          <div data-ex-horas hidden class="span-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${BA.campo({ id: 'ex-abre', rotulo: 'Abre', tipo: 'time', valor: '18:00' })}${BA.campo({ id: 'ex-fecha', rotulo: 'Fecha', tipo: 'time', valor: '22:00' })}</div>
          <button class="btn btn--ghost" type="button" data-add-exc style="min-height:42px">${icone('plus')}Adicionar exceção</button>
        </div>
      </div>${rodapeSalvar('Salvar horários')}`;
    pintarExc();
    p.addEventListener('change', ev => {
      const on = ev.target.closest('[data-on]');
      if (on) { const i = +on.dataset.on; horas[i].aberto = on.checked; $(`.hour-row[data-dia="${i}"]`, p).classList.toggle('is-closed', !on.checked); $('.switch__label', on.closest('.switch')).textContent = on.checked ? 'Aberto' : 'Fechado'; }
      if (ev.target.id === 'ex-tipo') $('[data-ex-horas]', p).hidden = ev.target.value !== 'especial';
    });
    p.addEventListener('click', ev => {
      const t = ev.target.closest('[data-tira-exc]');
      if (t) { const [x] = excecoes.splice(+t.dataset.tiraExc, 1); pintarExc(); BA.toast(`Exceção de ${dataBR(x.data)} removida. Salve para confirmar.`, 'info'); }
      if (ev.target.closest('[data-add-exc]')) {
        const ok = BA.validar(p, [
          ['ex-data', v => (!v ? 'Escolha a data.' : v < BA.hojeISO() ? 'Escolha uma data a partir de hoje.' : excecoes.some(x => x.data === v) ? 'Essa data já tem exceção.' : '')],
          ['ex-desc', BA.obrig('Descreva a data (ex.: Natal).')],
        ]);
        if (!ok) return;
        const tipo = $('#ex-tipo', p).value;
        excecoes.push({ id: BA.uid('e'), data: $('#ex-data', p).value, descricao: $('#ex-desc', p).value.trim(), tipo, abre: tipo === 'especial' ? $('#ex-abre', p).value : '', fecha: tipo === 'especial' ? $('#ex-fecha', p).value : '' });
        $('#ex-data', p).value = ''; $('#ex-desc', p).value = '';
        pintarExc();
        BA.toast('Exceção adicionada. Salve os horários para confirmar.', 'info');
      }
    });
    ligarRodape(p, tela, () => {
      const regras = [];
      horas.forEach((h, i) => { if (h.aberto) { regras.push([`hr-a-${i}`, v => (!v ? 'Informe a abertura.' : '')], [`hr-f-${i}`, v => (!v ? 'Informe o fechamento.' : v === $(`#hr-a-${i}`, p).value ? 'Precisa ser diferente da abertura.' : '')]); } });
      if (!BA.validar(p, regras)) return;
      if (!horas.some(h => h.aberto)) { BA.toast('Deixe pelo menos um dia aberto.', 'erro'); return; }
      horas.forEach((h, i) => { h.abre = $(`#hr-a-${i}`, p).value; h.fecha = $(`#hr-f-${i}`, p).value; });
      cfg.horarios = horas;
      cfg.excecoes = excecoes;
      const hoje = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());
      const hh = horas.find(h => normal(hoje).startsWith(normal(h.dia)));
      if (hh?.aberto) E().operacao.fecha = hh.fecha;
      BA.salvar(); BA.emit('mudou');
      BA.toast(`Horários salvos: ${horas.filter(h => h.aberto).length} dias abertos e ${plural(excecoes.length, 'exceção', 'exceções')}.`);
    });
  }

  function abaPagamentos(p, tela) {
    const pg = E().config.pagamentos;
    const BAND = ['Visa', 'Mastercard', 'Elo', 'Hipercard', 'American Express', 'Diners'];
    p.innerHTML = `${cab('Formas de pagamento', 'O que o cliente pode escolher ao fechar o pedido.')}
      <form class="form-sec" novalidate>
        ${BA.linhaInterruptor({ id: 'pg-pix', rotulo: 'Pix', desc: 'QR Code ou chave na maquininha do entregador ou no balcão.', marcado: pg.pix })}
        <div data-pix${pg.pix ? '' : ' hidden'}>${BA.campo({ id: 'pg-chave', rotulo: 'Chave Pix', valor: pg.chavePix, ajuda: 'Aparece na comanda para conferência.' })}</div>
        ${BA.linhaInterruptor({ id: 'pg-credito', rotulo: 'Cartão de crédito', desc: 'Na maquininha.', marcado: pg.credito })}
        ${BA.linhaInterruptor({ id: 'pg-debito', rotulo: 'Cartão de débito', desc: 'Na maquininha.', marcado: pg.debito })}
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Bandeiras aceitas</legend><div class="chk-grid">${BAND.map(b => BA.caixa({ nome: 'pg-band', valor: b, rotulo: b, marcado: pg.bandeiras.includes(b) })).join('')}</div></fieldset>
        ${BA.linhaInterruptor({ id: 'pg-dinheiro', rotulo: 'Dinheiro', desc: 'O cliente informa se precisa de troco.', marcado: pg.dinheiro })}
        <div data-troco${pg.dinheiro ? '' : ' hidden'}>${BA.linhaInterruptor({ id: 'pg-troco', rotulo: 'Levar troco', desc: 'Pergunta ao cliente "troco para quanto?".', marcado: pg.troco })}</div>
        <p class="form-sec__t" style="margin-top:8px">Quando o cliente paga</p>
        ${BA.linhaInterruptor({ id: 'pg-entrega', rotulo: 'Pagamento na entrega ou retirada', desc: 'Padrão da loja: nada é cobrado pelo site.', marcado: pg.naEntrega })}
        ${BA.linhaInterruptor({ id: 'pg-online', rotulo: 'Pagamento online', desc: 'Opcional. Exige contratar um provedor de pagamento; fica desligado por enquanto.', marcado: pg.online })}
      </form>${rodapeSalvar()}`;
    p.addEventListener('change', ev => {
      if (ev.target.id === 'pg-pix') $('[data-pix]', p).hidden = !ev.target.checked;
      if (ev.target.id === 'pg-dinheiro') $('[data-troco]', p).hidden = !ev.target.checked;
      if (ev.target.id === 'pg-online' && ev.target.checked) BA.toast('Pagamento online precisa de um provedor contratado. No protótipo, é só demonstração.', 'info');
    });
    ligarRodape(p, tela, () => {
      const v = id => $(`#${id}`, p).checked;
      if (!v('pg-pix') && !v('pg-credito') && !v('pg-debito') && !v('pg-dinheiro')) { BA.toast('Deixe pelo menos uma forma de pagamento ligada.', 'erro'); return; }
      if (!v('pg-entrega') && !v('pg-online')) { BA.toast('Escolha quando o cliente paga: na entrega ou online.', 'erro'); return; }
      const regras = v('pg-pix') ? [['pg-chave', BA.obrig('Informe a chave Pix.')]] : [];
      if (!BA.validar(p, regras)) return;
      const band = $$('[name="pg-band"]:checked', p).map(c => c.value);
      if ((v('pg-credito') || v('pg-debito')) && !band.length) { BA.toast('Marque pelo menos uma bandeira de cartão.', 'erro'); return; }
      Object.assign(pg, { pix: v('pg-pix'), chavePix: $('#pg-chave', p).value.trim(), credito: v('pg-credito'), debito: v('pg-debito'), bandeiras: band, dinheiro: v('pg-dinheiro'), troco: v('pg-troco'), naEntrega: v('pg-entrega'), online: v('pg-online') });
      BA.salvar(); BA.toast('Formas de pagamento salvas.');
    });
  }

  function abaEntrega(p, tela) {
    const en = E().config.entrega;
    p.innerHTML = `${cab('Entrega e retirada', 'As taxas por bairro ficam em Áreas de entrega.')}
      <form class="form-sec" novalidate>
        ${BA.linhaInterruptor({ id: 'en-entrega', rotulo: 'Entrega', desc: 'O motoboy leva até o endereço do cliente.', marcado: en.entrega })}
        ${BA.linhaInterruptor({ id: 'en-retirada', rotulo: 'Retirada no balcão', desc: 'O cliente busca na loja, sem taxa.', marcado: en.retirada })}
        <div class="form-grid">
          ${BA.campo({ id: 'en-prazo', rotulo: 'Prazo padrão de entrega', valor: en.prazoEntrega, obrigatorio: true, placeholder: 'Ex.: 30–45 min' })}
          ${BA.campo({ id: 'en-prazo-ret', rotulo: 'Prazo de retirada', valor: en.prazoRetirada, obrigatorio: true, placeholder: 'Ex.: 20–30 min' })}
          ${BA.campo({ id: 'en-orient', rotulo: 'Orientações de retirada', tipo: 'textarea', linhas: 3, valor: en.orientacoes, classe: 'span-2', ajuda: 'Aparecem na confirmação do pedido de retirada.' })}
        </div>
        <a class="link" href="#/areas">${icone('map')}Editar bairros e taxas de entrega${icone('arrow-right')}</a>
      </form>${rodapeSalvar()}`;
    ligarRodape(p, tela, () => {
      if (!$('#en-entrega', p).checked && !$('#en-retirada', p).checked) { BA.toast('Deixe pelo menos entrega ou retirada ligada.', 'erro'); return; }
      if (!BA.validar(p, [['en-prazo', BA.obrig('Informe o prazo de entrega.')], ['en-prazo-ret', BA.obrig('Informe o prazo de retirada.')]])) return;
      Object.assign(en, { entrega: $('#en-entrega', p).checked, retirada: $('#en-retirada', p).checked, prazoEntrega: $('#en-prazo', p).value.trim(), prazoRetirada: $('#en-prazo-ret', p).value.trim(), orientacoes: $('#en-orient', p).value.trim() });
      BA.salvar(); BA.toast('Entrega e retirada salvas.');
    });
  }

  function abaNotificacoes(p, tela) {
    const n = E().config.notif;
    n.som = E().preferencias.som;
    p.innerHTML = `${cab('Notificações', 'Como o painel avisa quando chega um pedido novo.')}
      <form class="form-sec" novalidate>
        <div class="switch-row"><label for="nt-som" class="switch__txt" style="cursor:pointer"><span class="switch__label">Som de novo pedido</span><span class="switch__desc">Toca um alerta curto a cada pedido novo.</span></label><span style="display:flex;gap:12px;align-items:center"><button class="btn btn--ghost btn--sm" type="button" data-testar>${icone('volume-on')}Testar som</button>${BA.interruptor({ id: 'nt-som', rotulo: '', marcado: n.som, attrs: 'aria-label="Som de novo pedido"' })}</span></div>
        ${BA.linhaInterruptor({ id: 'nt-visual', rotulo: 'Alertas visuais', desc: 'Destaca o pedido novo e mostra o número no menu.', marcado: n.visual })}
        <p class="page-note">${icone('info')}<span>Os pedidos chegam neste painel com som e destaque. Deixe o painel aberto no computador ou no celular da cozinha. Avisos automáticos por e-mail ou WhatsApp não estão disponíveis na hospedagem gratuita.</span></p>
      </form>${rodapeSalvar()}`;
    $('[data-testar]', p).addEventListener('click', () => {
      const antes = E().preferencias.som;
      E().preferencias.som = true;
      BA.tocarSom();
      E().preferencias.som = antes;
      BA.toast('Este é o som de pedido novo.', 'info');
    });
    ligarRodape(p, tela, () => {
      const regras = [];
      if (!BA.validar(p, regras)) return;
      Object.assign(n, { som: $('#nt-som', p).checked, visual: $('#nt-visual', p).checked, whatsapp: false, email: false, resumo: false });
      E().preferencias.som = n.som;
      BA.salvarSom(n.som);
      BA.salvar(); BA.emit('mudou');
      BA.toast('Preferências de notificação salvas.');
    });
  }

  /* ------------------------------------------------------------------ Privacidade (LGPD): encarregado, prazo de guarda e pedidos do titular */
  function abaPrivacidade(p, tela) {
    const pv = E().config.privacidade || { encarregadoNome: '', encarregadoEmail: '', encarregadoTelefone: '', prazoMeses: 24 };
    p.innerHTML = `${cab('Privacidade (LGPD)', 'Quem responde pelos dados dos clientes, por quanto tempo eles ficam guardados e os pedidos dos clientes sobre os próprios dados.')}
      <form class="form-sec" novalidate>
        <p class="form-sec__t">Encarregado de dados</p>
        <p class="form-sec__d">A pessoa que responde aos clientes e à ANPD sobre dados pessoais. Aparece na página <a class="link" href="/privacidade" target="_blank" rel="noopener">Privacidade</a> do site. Sem encarregado, a página manda falar com a loja pelo WhatsApp.</p>
        <div class="form-grid">
          ${BA.campo({ id: 'pv-nome', rotulo: 'Nome', valor: pv.encarregadoNome, opcional: true, attrs: 'maxlength="80"' })}
          ${BA.campo({ id: 'pv-email', rotulo: 'E-mail', tipo: 'email', valor: pv.encarregadoEmail, opcional: true, attrs: 'maxlength="120"' })}
          ${BA.campo({ id: 'pv-fone', rotulo: 'Telefone ou WhatsApp', valor: pv.encarregadoTelefone, opcional: true, attrs: 'data-mascara="fone" inputmode="tel"' })}
          ${BA.campo({ id: 'pv-prazo', rotulo: 'Prazo de guarda dos dados pessoais', valor: String(pv.prazoMeses), opcoes: [[12, '12 meses'], [24, '24 meses (recomendado)'], [36, '36 meses'], [60, '60 meses']].map(([v, t]) => ({ v, t })), ajuda: 'Depois disso, nome, WhatsApp, endereço e observações dos pedidos encerrados são apagados sozinhos. Os valores ficam para a contabilidade.' })}
        </div>
      </form>${rodapeSalvar()}
      <div class="form-sec" style="margin-top:20px">
        <p class="form-sec__t">Pedido de um cliente sobre os próprios dados</p>
        <p class="form-sec__d">Quando um cliente pedir uma cópia dos dados ou a exclusão, busque pelo WhatsApp usado nos pedidos. Responda em até 15 dias. Cada consulta fica registrada.</p>
        <form class="form-grid" novalidate data-cli-form style="align-items:end">
          ${BA.campo({ id: 'cl-fone', rotulo: 'WhatsApp do cliente', placeholder: '(11) 90000-0000', attrs: 'data-mascara="fone" inputmode="tel" autocomplete="off"' })}
          <button class="btn btn--ghost" type="submit" style="min-height:42px">${icone('search')}Buscar</button>
        </form>
        <div data-cli></div>
      </div>`;
    ligarRodape(p, tela, () => {
      const ok = BA.validar(p, [
        ['pv-email', v => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Confira o e-mail.' : '')],
        ['pv-nome', v => (!v && ($('#pv-email', p).value || $('#pv-fone', p).value) ? 'Escreva o nome do encarregado.' : '')],
      ]);
      if (!ok) return;
      E().config.privacidade = { encarregadoNome: $('#pv-nome', p).value.trim(), encarregadoEmail: $('#pv-email', p).value.trim(), encarregadoTelefone: $('#pv-fone', p).value.trim(), prazoMeses: +$('#pv-prazo', p).value };
      BA.salvar(); BA.toast('Privacidade salva. A página Privacidade do site já mostra os dados novos.');
    });
    let cliente = null;
    const pintarCliente = () => {
      const box = $('[data-cli]', p);
      if (!cliente) { box.innerHTML = ''; return; }
      const c = cliente;
      box.innerHTML = c.pedidos ? `<div class="cli-lgpd">
          <p><strong>${esc(c.telefone)}</strong> · ${plural(c.pedidos, 'pedido', 'pedidos')} de ${new Intl.DateTimeFormat('pt-BR').format(c.primeiro)} a ${new Intl.DateTimeFormat('pt-BR').format(c.ultimo)} · ${brl(c.gasto)} em pedidos válidos${c.bloqueado ? ' · <span class="pill pill--red pill--plain">bloqueado no site</span>' : ''}</p>
          <p class="muted">Nomes usados: ${c.nomes.map(esc).join(', ') || '—'}</p>
          <div class="pg-acts"><button class="btn btn--ghost btn--sm" type="button" data-cli-exportar>${icone('arrow-down')}Baixar os dados (arquivo para o cliente)</button><button class="btn btn--danger btn--sm" type="button" data-cli-anonimizar>${icone('trash')}Anonimizar os pedidos</button></div>
        </div>` : `<div class="cli-lgpd"><p>Nenhum pedido com o WhatsApp ${esc(c.telefone)}.</p></div>`;
    };
    $('[data-cli-form]', p).addEventListener('submit', async ev => {
      ev.preventDefault();
      const tel = $('#cl-fone', p).value;
      if (tel.replace(/\D/g, '').length < 10) { BA.erroCampo($('#cl-fone', p), 'Escreva o WhatsApp com DDD.'); return; }
      try { cliente = (await BA.api('api/clientes/buscar', { telefone: tel })).cliente; pintarCliente(); }
      catch (e) { BA.erroCampo($('#cl-fone', p), e.message); }
    });
    $('[data-cli]', p).addEventListener('click', async ev => {
      if (ev.target.closest('[data-cli-exportar]')) {
        try {
          const r = await BA.api('api/clientes/exportar', { telefone: cliente.telefone });
          const blob = new Blob([JSON.stringify(r.dados, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `dados-cliente-${cliente.telefone.replace(/\D/g, '').slice(-4)}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          BA.toast('Arquivo pronto. Envie para o cliente pelo mesmo canal em que ele pediu.');
        } catch (e) { BA.toast(e.message, 'erro'); }
      }
      if (ev.target.closest('[data-cli-anonimizar]')) {
        const senha = await BA.confirmar({
          titulo: 'Anonimizar os pedidos deste cliente?', perigo: true, botao: 'Anonimizar',
          texto: `Nome, WhatsApp, endereço e observações de ${plural(cliente.pedidos, 'pedido', 'pedidos')} são apagados para sempre. Os valores ficam para a contabilidade. Pedidos em andamento precisam terminar antes. Esta ação não pode ser desfeita.`,
          extra: campoConfirmacao(),
        });
        if (typeof senha !== 'string' || !senha) return;
        try {
          const r = await BA.api('api/clientes/anonimizar', { telefone: cliente.telefone, senhaAtual: senha });
          BA.toast(`${plural(r.anonimizados, 'pedido anonimizado', 'pedidos anonimizados')}.`);
          cliente = { ...cliente, pedidos: 0 };
          pintarCliente();
        } catch (e) { BA.toast(e.message, 'erro'); }
      }
    });
  }

  /* ------------------------------------------------------------------ Segurança: duas etapas e números bloqueados */
  function abaSeguranca(p, tela) {
    const e = E();
    const souDono = !!e.admin.proprietario;
    const seg = e.config.seguranca || { exigir2fa: false };
    const pintarBloq = () => {
      const lista = e.bloqueados || [];
      $('[data-bloq]', p).innerHTML = lista.length ? lista.map(b => `<div class="exc exc--excluido"><strong>${esc(b.telefone)}</strong><span class="muted">${esc(b.motivo)}</span><button class="btn btn--ghost btn--sm" type="button" data-desbloq="${esc(b.telefone)}">Desbloquear</button></div>`).join('')
        : '<p class="muted">Nenhum número bloqueado. Para bloquear, abra um pedido e toque em "Bloquear este número no site".</p>';
    };
    p.innerHTML = `${cab('Segurança', 'Acesso ao painel e proteção contra pedidos falsos.')}
      <div class="form-sec">
        <p class="form-sec__t">Verificação em duas etapas</p>
        <p class="form-sec__d">Além da senha, o painel pede um código do aplicativo autenticador do celular. Quem descobrir uma senha ainda não consegue entrar.</p>
        <div class="switch-row"><span class="switch__txt"><span class="switch__label">Seu acesso: ${e.admin.doisFatores ? 'ligada' : 'desligada'}</span><span class="switch__desc">${e.admin.doisFatores ? 'Você entra com a senha e o código do aplicativo.' : 'Ative no seu perfil em dois minutos.'}</span></span><button class="btn ${e.admin.doisFatores ? 'btn--ghost' : 'btn--primary'} btn--sm" type="button" data-meu2fa>${icone('shield')}${e.admin.doisFatores ? 'Desligar' : 'Ativar agora'}</button></div>
        ${BA.linhaInterruptor({ id: 'sg-exigir', rotulo: 'Exigir para administradores', desc: souDono ? 'Quem cuida de usuários ou de configurações precisa ativar para usar o painel. Funcionários de pedidos e cozinha não são afetados.' : 'Só o proprietário da loja muda esta regra.', marcado: !!seg.exigir2fa, attrs: souDono ? '' : 'disabled' })}
      </div>
      <div class="form-sec" style="margin-top:20px">
        <p class="form-sec__t">Números bloqueados no site</p>
        <p class="form-sec__d">Números que não conseguem fazer pedidos pelo site (trote, calote). Pedidos lançados no balcão continuam possíveis.</p>
        <div class="exc-list" data-bloq></div>
      </div>
      <div class="form-sec" style="margin-top:20px">
        <p class="form-sec__t">Proteção automática</p>
        <p class="form-sec__d">O site barra sozinho os pedidos feitos por robôs: o navegador de quem compra resolve um cálculo rápido antes de enviar, e um campo escondido pega quem preenche tudo automaticamente. Quem envia o mesmo pedido de novo em poucos minutos vê um aviso antes de duplicar. Nada disso precisa de ajuste.</p>
      </div>`;
    pintarBloq();
    $('[data-meu2fa]', p).addEventListener('click', async () => {
      if (e.admin.doisFatores) { if (await BA.desativar2fa()) tela.pintar(); } else BA.abrir2fa();
    });
    $('#sg-exigir', p).addEventListener('change', async ev => {
      e.config.seguranca = { exigir2fa: ev.target.checked };
      BA.esquecerResultado('config');
      await BA.salvar();
      if (BA.salvou('config')) BA.toast(ev.target.checked ? 'Pronto: administradores precisam da verificação em duas etapas.' : 'A verificação em duas etapas deixou de ser obrigatória.', 'info');
      tela.pintar();
    });
    $('[data-bloq]', p).addEventListener('click', async ev => {
      const b = ev.target.closest('[data-desbloq]');
      if (b && await BA.desbloquearNumero(b.dataset.desbloq)) pintarBloq();
    });
  }

  /* campo de senha de quem está mexendo nos acessos (o servidor confere antes de gravar) */
  const campoConfirmacao = () => `<div class="fld"><label class="fld__label" for="cf-senha">Sua senha<span class="req" aria-hidden="true">*</span></label>
    <input class="inp" id="cf-senha" type="password" data-campo required data-msg="Digite a sua senha para confirmar." autocomplete="current-password" aria-describedby="cf-senha-err cf-senha-help">
    <p class="fld__err" id="cf-senha-err" hidden></p><p class="fld__help" id="cf-senha-help">Para proteger os acessos, confirme com a senha que você usa para entrar.</p></div>`;
  /* envia a lista de usuários com a senha de confirmação; diz se o servidor aceitou */
  async function gravarUsuarios(senha) {
    BA.confirmacaoSenha = senha;
    BA.esquecerResultado('usuarios');
    await BA.salvar();
    return BA.salvou('usuarios');
  }

  function abaUsuarios(p, tela) {
    const e = E();
    if (!BA.pode('usuarios')) { p.innerHTML = `${cab('Usuários administrativos', 'Quem acessa o painel e o que cada um pode fazer.')}<p class="page-note">${icone('shield')}<span>Só quem tem a permissão Usuários pode ver e mudar os acessos.</span></p>`; return; }
    const eu = e.admin.email;
    const souDono = !!e.admin.proprietario;
    // o acesso do proprietário e o de outros administradores só o proprietário altera
    const protegido = u => !souDono && u.email !== eu && (u.proprietario || u.permissoes.includes('usuarios'));
    p.innerHTML = `<div class="card__head"><div class="card__titles"><h2 class="card__title">Usuários administrativos</h2><p class="card__sub">Quem acessa o painel e o que cada um pode fazer.</p></div><button class="btn btn--primary" type="button" data-convidar>${icone('plus')}Novo usuário</button></div>
      <div class="tbl-wrap"><table class="tbl tbl--cards">
        <thead><tr><th>Usuário</th><th>Função</th><th>Status</th><th>Permissões</th><th>Último acesso</th><th class="r">Ações</th></tr></thead>
        <tbody>${e.usuarios.map(u => {
          const sou = u.email === eu;
          const bloq = protegido(u);
          const motivo = 'Só o proprietário da loja altera este acesso';
          return `<tr data-id="${u.id}" class="${u.status === 'inativo' ? 'is-inactive' : ''}">
            <td data-th="Usuário" class="full"><div class="cell-main"><span class="avatar">${esc(u.nome.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase())}</span><div><strong>${esc(u.nome)}${sou ? ' <span class="muted" style="font-weight:500">(você)</span>' : ''}${u.proprietario ? '<span class="dono">Proprietário</span>' : ''}${u.doisFatores ? `<span class="dois-fatores" title="Verificação em duas etapas ligada">${icone('shield')}2 etapas</span>` : ''}</strong><small>${esc(u.email)}</small></div></div></td>
            <td data-th="Função">${esc(u.funcao)}</td>
            <td data-th="Status"><span class="pill pill--${STU[u.status][1]}">${STU[u.status][0]}</span></td>
            <td data-th="Permissões" class="full"><div class="perm">${u.permissoes.map(x => `<span>${PERMS[x]}</span>`).join('')}</div></td>
            <td data-th="Último acesso" class="nowrap">${esc(u.acesso)}</td>
            <td class="row-acts-cell"><div class="row-acts">
              <button class="btn-icon btn-icon--sm" type="button" data-editar="${u.id}" aria-label="Editar ${esc(u.nome)}" title="${bloq ? motivo : 'Editar'}"${bloq ? ' disabled' : ''}>${icone('pencil')}</button>
              ${u.status === 'convite' ? `<button class="btn-icon btn-icon--sm" type="button" data-reenviar="${u.id}" aria-label="Reenviar convite para ${esc(u.nome)}" title="Reenviar convite">${icone('mail')}</button>` : `<button class="btn-icon btn-icon--sm" type="button" data-alternar="${u.id}" aria-label="${u.status === 'ativo' ? 'Desativar' : 'Reativar'} ${esc(u.nome)}" title="${sou ? 'Você não pode desativar o seu próprio acesso' : bloq ? motivo : u.status === 'ativo' ? 'Desativar' : 'Reativar'}"${sou || bloq ? ' disabled' : ''}>${icone(u.status === 'ativo' ? 'power' : 'play')}</button>`}
              <button class="btn-icon btn-icon--sm" type="button" data-remover="${u.id}" aria-label="Remover ${esc(u.nome)}" title="${sou ? 'Você não pode remover o seu próprio acesso' : bloq ? motivo : 'Remover'}"${sou || bloq ? ' disabled' : ''}>${icone('trash')}</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="page-note" style="margin-top:16px">${icone('shield')}<span>Cada login e cada alteração ficam registrados, e as permissões são conferidas no servidor. Mudanças de acesso pedem a sua senha${souDono ? '' : '; o acesso do proprietário e o de outros administradores só o proprietário altera'}.</span></p>`;
    p.onclick = async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.matches('[data-convidar]')) return formUsuario(null, () => tela.pintar());
      const u = e.usuarios.find(x => x.id === (b.dataset.editar || b.dataset.alternar || b.dataset.remover || b.dataset.reenviar));
      if (!u) return;
      if (b.dataset.editar) formUsuario(u, () => tela.pintar());

      else if (b.dataset.alternar) {
        const ativar = u.status !== 'ativo';
        const senha = await BA.confirmar({
          titulo: `${ativar ? 'Reativar' : 'Desativar'} ${esc(u.nome)}?`, texto: ativar ? 'A pessoa volta a acessar o painel com a senha dela.' : 'A pessoa perde o acesso ao painel na hora. Você pode reativar depois.',
          botao: ativar ? 'Reativar acesso' : 'Desativar acesso', perigo: !ativar, extra: campoConfirmacao(),
        });
        if (typeof senha !== 'string' || !senha) return;
        u.status = ativar ? 'ativo' : 'inativo';
        const ok = await gravarUsuarios(senha);
        tela.pintar();
        if (ok) BA.toast(ativar ? `${u.nome} pode acessar o painel de novo.` : `${u.nome} perdeu o acesso ao painel.`, ativar ? 'ok' : 'info');
      } else if (b.dataset.remover) {
        const senha = await BA.confirmar({ titulo: `Remover ${esc(u.nome)}?`, texto: 'A pessoa perde o acesso e sai da lista. O registro do que ela fez (etapas, pagamentos) continua no histórico com o nome dela.', botao: 'Remover usuário', perigo: true, extra: campoConfirmacao() });
        if (typeof senha !== 'string' || !senha) return;
        e.usuarios.splice(e.usuarios.indexOf(u), 1);
        const ok = await gravarUsuarios(senha);
        tela.pintar();
        if (ok) BA.toast(`${u.nome} foi removido.`, 'info');
      }
    };
  }

  function formUsuario(u, depois) {
    const e = E();
    const novo = !u;
    const d = BA.janela({
      tamanho: 'md', titulo: novo ? 'Novo usuário' : `Editar ${esc(u.nome)}`, sub: novo ? 'Crie a senha inicial e passe para a pessoa. Ela pode trocar depois em Meu perfil.' : esc(u.email),
      corpo: `<form class="form-sec" novalidate>
        <div class="form-grid">
          ${BA.campo({ id: 'us-nome', rotulo: 'Nome', valor: u?.nome || '', obrigatorio: true, attrs: 'autocomplete="off"' })}
          ${BA.campo({ id: 'us-email', rotulo: 'E-mail', tipo: 'email', valor: u?.email || '', obrigatorio: true, attrs: `autocomplete="off"${novo ? '' : ' readonly'}`, ajuda: novo ? '' : 'O e-mail é o login e não muda.' })}
          ${BA.campo({ id: 'us-funcao', rotulo: 'Função', valor: u?.funcao || 'Atendente', obrigatorio: true, classe: 'span-2', opcoes: Object.keys(FUNCOES).map(f => ({ v: f, t: f })), ajuda: 'Ao trocar a função, as permissões padrão são marcadas.' })}
          ${BA.campo({ id: 'us-senha', rotulo: novo ? 'Senha inicial' : 'Nova senha', tipo: 'password', obrigatorio: novo, opcional: !novo, classe: 'span-2', attrs: 'autocomplete="new-password"', ajuda: novo ? 'Mínimo de 12 caracteres. Evite datas, sequências e o nome da loja.' : 'Deixe em branco para manter a senha atual.' })}
        ${!novo && u.doisFatores && e.admin.proprietario && u.email !== e.admin.email ? `<div class="span-2">${BA.caixa({ nome: 'us-zerar2fa', valor: '1', rotulo: 'Desligar a verificação em duas etapas desta pessoa (celular perdido). Ela entra só com a senha e pode ativar de novo.' })}</div>` : ''}
        </div>
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Permissões</legend>
          <div class="chk-grid">${Object.entries(PERMS).map(([k, t]) => BA.caixa({ nome: 'us-perm', valor: k, rotulo: t, marcado: (u?.permissoes || FUNCOES.Atendente).includes(k) })).join('')}</div>
          <p class="fld__err" id="us-perm-err" hidden></p>
        </fieldset>
        <div class="form-grid">
          ${BA.campo({ id: 'us-confirma', rotulo: 'Sua senha', tipo: 'password', obrigatorio: true, classe: 'span-2', attrs: 'autocomplete="current-password"', ajuda: 'Para proteger os acessos, confirme com a senha que você usa para entrar.' })}
        </div>
      </form>`,
      rodape: `<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>${icone(novo ? 'plus' : 'check')}${novo ? 'Criar usuário' : 'Salvar usuário'}</button>`,
    });
    // só o proprietário dá a permissão Usuários; quem não é proprietário não aumenta as próprias permissões
    const souDono = !!e.admin.proprietario;
    const bloquearCaixas = () => {
      $$('[name="us-perm"]', d).forEach(c => {
        const proprio = !novo && u.email === e.admin.email;
        c.disabled = !souDono && (c.value === 'usuarios' || (proprio && !u.permissoes.includes(c.value)));
        c.closest('label')?.setAttribute('title', c.disabled ? 'Só o proprietário da loja muda esta permissão' : '');
      });
    };
    bloquearCaixas();
    $('#us-funcao', d).addEventListener('change', ev => { const f = FUNCOES[ev.target.value]; $$('[name="us-perm"]', d).forEach(c => { if (!c.disabled) c.checked = f.includes(c.value); }); });
    $('[data-salvar]', d).addEventListener('click', async () => {
      const ok = BA.validar(d, [
        ['us-nome', BA.obrig('Escreva o nome.')],
        ['us-email', v => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Confira o e-mail.' : novo && e.usuarios.some(x => x.email.toLowerCase() === v.toLowerCase()) ? 'Esse e-mail já tem acesso.' : '')],
        ['us-senha', v => (novo && v.length < 12 ? 'Crie uma senha com pelo menos 12 caracteres.' : v && v.length < 12 ? 'Use pelo menos 12 caracteres.' : '')],
        ['us-confirma', BA.obrig('Digite a sua senha para confirmar.')],
      ]);
      // caixa bloqueada não conta como escolha (o servidor mantém o que a pessoa já tinha)
      const perms = $$('[name="us-perm"]:checked', d).filter(c => !c.disabled || (!novo && u.permissoes.includes(c.value))).map(c => c.value);
      const err = $('#us-perm-err', d);
      err.hidden = !!perms.length;
      if (!perms.length) err.innerHTML = `${icone('alert')}Marque pelo menos uma permissão.`;
      if (!ok || !perms.length) { if (ok) BA.toast('Marque pelo menos uma permissão.', 'erro'); return; }
      const dados = { nome: $('#us-nome', d).value.trim(), funcao: $('#us-funcao', d).value, permissoes: perms };
      const senha = $('#us-senha', d).value;
      const btn = $('[data-salvar]', d);
      btn.disabled = true;
      if (novo) e.usuarios.push({ id: BA.uid('u'), email: $('#us-email', d).value.trim(), status: 'ativo', acesso: '—', ...dados, senha });
      else Object.assign(u, dados, senha ? { senha } : {}, $('[name="us-zerar2fa"]', d)?.checked ? { zerar2fa: true } : {});
      const gravou = await gravarUsuarios($('#us-confirma', d).value);
      btn.disabled = false;
      if (!gravou) {
        // o servidor recusou (senha de confirmação errada ou acesso proibido): a lista voltou ao que era; a janela fica aberta
        const c = $('#us-confirma', d);
        c.value = '';
        c.focus();
        return;
      }
      if (!novo && u.email === e.admin.email) { e.admin.nome = dados.nome; e.admin.funcao = dados.funcao; }
      d.close();
      BA.toast(novo ? `${dados.nome} pode entrar no painel com o e-mail e a senha inicial.` : `${dados.nome} salvo.`);
      depois?.();
    });
  }
})();
