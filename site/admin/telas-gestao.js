/* Painel — Histórico de pedidos (PED-05) e Caixa do dia (FIN-01). Os dados vêm do servidor, página por página. */
(function () {
  'use strict';
  const { $, $$, esc, brl, num, icone, plural, hm, hojeISO, dataBR } = BA;
  const FUSO = 'America/Sao_Paulo';
  const quando = t => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO }).format(t);
  const somarDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(Date.UTC(a, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const ETAPAS = [['todos', 'Todas as etapas'], ['novo', 'Novo'], ['confirmado', 'Confirmado'], ['preparo', 'Em preparo'], ['entrega', 'Em entrega'], ['concluido', 'Concluído'], ['recusado', 'Recusado'], ['cancelado', 'Cancelado']];
  const PAGS = [['todos', 'Todos os pagamentos'], ['pendente', 'A receber'], ['recebido', 'Recebido'], ['estornado', 'Estornado'], ['sem_registro', 'Sem registro']];
  const NOME_ETAPA = Object.fromEntries(ETAPAS);
  const COR_ETAPA = { novo: 'amber', confirmado: 'orange', preparo: 'blue', entrega: 'green', concluido: 'muted', recusado: 'red', cancelado: 'red' };
  const FORMAS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };
  const pillPag = s => { const [n, c] = (BA.SIT_PAG || {})[s] || ['—', 'muted']; return `<span class="pill pill--${c} pill--plain">${n}</span>`; };

  /* linha de pedido para listas (clique abre a gaveta do pedido) */
  const linha = (p, extra = '') => `<button class="orow" type="button" data-abrir="${p.numero}" aria-label="Pedido #${p.numero}, ${esc(p.cliente)}, ${brl(p.total)}">
      <span class="orow__num">#${p.numero}</span>
      <span class="orow__who"><span class="orow__name">${esc(p.cliente)}</span><span class="orow__meta">${quando(p.criadoEm)} · ${p.modalidade === 'entrega' ? 'Entrega' : 'Retirada'}${extra}</span></span>
      <span class="pill pill--${COR_ETAPA[p.status] || 'muted'}">${NOME_ETAPA[p.status] || p.status}</span>
      ${pillPag(p.pagamento.status)}
      <span class="orow__total">${brl(p.total)}</span>
    </button>`;

  /* ================================================================== histórico */
  BA.telas.historico = {
    esqueleto: 'tabela',
    f: null,
    render(el) {
      this.f = this.f || { de: somarDias(hojeISO(), -30), ate: hojeISO(), q: '', status: 'todos', pagamento: 'todos', pagina: 1 };
      const f = this.f;
      el.innerHTML = `<div class="page">
        <form class="card hist-filtros" novalidate data-filtros>
          ${BA.campo({ id: 'hs-de', rotulo: 'De', tipo: 'date', valor: f.de })}
          ${BA.campo({ id: 'hs-ate', rotulo: 'Até', tipo: 'date', valor: f.ate })}
          ${BA.campo({ id: 'hs-q', rotulo: 'Número, WhatsApp ou nome', valor: f.q, placeholder: 'Ex.: 1048, (11) 98765-4321 ou Maria', attrs: 'autocomplete="off"', classe: 'hist-filtros__q' })}
          ${BA.campo({ id: 'hs-status', rotulo: 'Etapa', valor: f.status, opcoes: ETAPAS.map(([v, t]) => ({ v, t })) })}
          ${BA.campo({ id: 'hs-pag', rotulo: 'Pagamento', valor: f.pagamento, opcoes: PAGS.map(([v, t]) => ({ v, t })) })}
          <button class="btn btn--primary" type="submit">${icone('search')}Buscar</button>
        </form>
        <p class="count-line" data-resumo aria-live="polite"></p>
        <div class="card"><div class="olist" data-lista></div></div>
        <nav class="paginas" aria-label="Páginas do histórico" data-paginas></nav>
        <p class="page-note">${icone('shield')}<span>Buscas por WhatsApp ou nome ficam registradas no histórico de acessos do painel (LGPD). Pedidos antigos aparecem com os dados pessoais anonimizados depois do prazo de guarda.</span></p>
      </div>`;
      const root = el.firstElementChild;
      $('[data-filtros]', root).addEventListener('submit', ev => {
        ev.preventDefault();
        Object.assign(f, { de: $('#hs-de', root).value, ate: $('#hs-ate', root).value, q: $('#hs-q', root).value.trim(), status: $('#hs-status', root).value, pagamento: $('#hs-pag', root).value, pagina: 1 });
        this.buscar(root);
      });
      root.addEventListener('click', ev => {
        const a = ev.target.closest('[data-abrir]');
        if (a) { BA.abrirPedido(+a.dataset.abrir); return; }
        const pg = ev.target.closest('[data-pagina]');
        if (pg) { f.pagina = +pg.dataset.pagina; this.buscar(root, true); }
      });
      this.buscar(root);
    },
    async buscar(root, rolar) {
      const f = this.f;
      const lista = $('[data-lista]', root);
      lista.setAttribute('aria-busy', 'true');
      try {
        const r = await BA.api('api/historico', f);
        Object.assign(f, { de: r.de, ate: r.ate });
        $('[data-resumo]', root).textContent = r.total
          ? `${plural(r.total, 'pedido', 'pedidos')} de ${dataBR(r.de)} a ${dataBR(r.ate)} · ${brl(r.soma)} em pedidos válidos (sem recusados e cancelados)`
          : `Nenhum pedido de ${dataBR(r.de)} a ${dataBR(r.ate)} com esses filtros.`;
        lista.innerHTML = r.itens.length ? r.itens.map(p => linha(p)).join('') : BA.vazio({ icone: 'receipt', titulo: 'Nada encontrado', texto: 'Mude o período ou a busca. O número do pedido aparece na comanda e na confirmação do cliente.' });
        $('[data-paginas]', root).innerHTML = r.paginas > 1 ? `<button class="btn btn--ghost btn--sm" type="button" data-pagina="${r.pagina - 1}"${r.pagina <= 1 ? ' disabled' : ''}>${icone('arrow-left')}Anterior</button><span>Página ${r.pagina} de ${r.paginas}</span><button class="btn btn--ghost btn--sm" type="button" data-pagina="${r.pagina + 1}"${r.pagina >= r.paginas ? ' disabled' : ''}>Próxima${icone('arrow-right')}</button>` : '';
        if (rolar) root.scrollIntoView({ block: 'start', behavior: BA.suave() });
      } catch (e) {
        lista.innerHTML = BA.vazio({ icone: 'alert', titulo: 'Não deu para buscar agora', texto: esc(e.message) });
      }
      lista.removeAttribute('aria-busy');
    },
  };

  /* ================================================================== caixa do dia */
  BA.telas.caixa = {
    esqueleto: 'dash',
    dia: null,
    render(el) {
      this.dia = this.dia || hojeISO();
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="toolbar__l"><form class="caixa-dia" novalidate data-dia>${BA.campo({ id: 'cx-dia', rotulo: 'Dia', tipo: 'date', valor: this.dia, attrs: `max="${hojeISO()}"` })}<button class="btn btn--ghost" type="submit">${icone('refresh')}Ver</button></form></div>
          <div class="toolbar__r"><button class="btn btn--ghost" type="button" data-imprimir>${icone('printer')}Imprimir fechamento</button></div>
        </div>
        <div data-caixa aria-live="polite"></div>
      </div>`;
      const root = el.firstElementChild;
      $('[data-dia]', root).addEventListener('submit', ev => { ev.preventDefault(); this.dia = $('#cx-dia', root).value || hojeISO(); this.carregar(root); });
      $('[data-imprimir]', root).addEventListener('click', () => { document.documentElement.classList.add('imprimir-caixa'); addEventListener('afterprint', () => document.documentElement.classList.remove('imprimir-caixa'), { once: true }); window.print(); });
      root.addEventListener('click', ev => { const a = ev.target.closest('[data-abrir]'); if (a) BA.abrirPedido(+a.dataset.abrir); });
      this.off = [BA.on('mudou', () => { if (this.dia === hojeISO() && !document.querySelector('dialog[open]')) this.carregar(root); })];
      this.carregar(root);
    },
    async carregar(root) {
      const box = $('[data-caixa]', root);
      if (!box) return;
      box.setAttribute('aria-busy', 'true');
      let c;
      try { c = (await BA.api(`api/caixa?dia=${encodeURIComponent(this.dia)}`)).caixa; } catch (e) {
        box.innerHTML = `<div class="card">${BA.vazio({ icone: 'alert', titulo: 'Não deu para abrir o caixa agora', texto: esc(e.message) })}</div>`;
        box.removeAttribute('aria-busy');
        return;
      }
      const card = (rotulo, valor, sub = '', cor = '') => `<div class="card metric"><div class="metric__top"><span class="metric__label">${rotulo}</span></div><p class="metric__value${cor ? ` is-${cor}` : ''}">${valor}</p><p class="metric__sub">${sub}</p></div>`;
      box.innerHTML = `
        <h2 class="caixa-titulo">Fechamento de ${dataBR(c.dia)}</h2>
        <section class="metrics" aria-label="Resumo do caixa">
          ${card('Recebido', brl(c.recebido), plural(c.recebidos.length, 'pagamento registrado', 'pagamentos registrados'))}
          ${card('A receber', brl(c.aReceber), c.pendentes.length ? `${plural(c.pendentes.length, 'pedido', 'pedidos')} deste dia${c.pendentesAntigos ? ` · + ${plural(c.pendentesAntigos, 'pedido', 'pedidos')} de dias anteriores` : ''}` : c.pendentesAntigos ? `${plural(c.pendentesAntigos, 'pedido', 'pedidos')} de dias anteriores` : 'Nada pendente', c.pendentes.length ? 'amber' : '')}
          ${card('Diferenças', brl(c.diferenca), 'Recebido menos o total dos pedidos', c.diferenca < 0 ? 'red' : '')}
          ${card('Estornado', brl(c.estornado), plural(c.estornos.length, 'estorno', 'estornos'), c.estornos.length ? 'red' : '')}
        </section>
        <div class="dash caixa-grade">
          <section class="card" aria-labelledby="cx-forma"><div class="card__head"><div class="card__titles"><h3 class="card__title" id="cx-forma">Por forma de pagamento</h3></div></div>
            <dl class="sums">${c.porForma.map(f => `<dt>${esc(f.nome)}</dt><dd>${brl(f.total)}</dd>`).join('')}<dt class="total">Total recebido</dt><dd class="total">${brl(c.recebido)}</dd></dl></section>
          <section class="card" aria-labelledby="cx-ent"><div class="card__head"><div class="card__titles"><h3 class="card__title" id="cx-ent">Por entregador</h3></div></div>
            ${c.porEntregador.length ? `<dl class="sums">${c.porEntregador.map(e => `<dt>${esc(e.nome)} <span class="muted">· ${plural(e.pedidos, 'pedido', 'pedidos')}</span></dt><dd>${brl(e.total)}</dd>`).join('')}</dl>` : '<p class="muted">Nenhum pagamento registrado neste dia.</p>'}</section>
        </div>
        <section class="card" aria-labelledby="cx-pend" style="margin-top:16px"><div class="card__head"><div class="card__titles"><h3 class="card__title" id="cx-pend">A receber neste dia</h3></div></div>
          <div class="olist">${c.pendentes.length ? c.pendentes.map(p => linha(p)).join('') : '<p class="muted" style="padding:8px 0">Nenhum pedido deste dia esperando pagamento.</p>'}</div></section>
        <section class="card" aria-labelledby="cx-rec" style="margin-top:16px"><div class="card__head"><div class="card__titles"><h3 class="card__title" id="cx-rec">Pagamentos registrados</h3></div></div>
          <div class="olist">${c.recebidos.length ? c.recebidos.map(p => linha(p, ` · ${FORMAS[p.pagamento.forma] || ''} ${brl(p.pagamento.valor)} às ${hm(p.pagamento.em)}${p.pagamento.entregador ? ` · ${esc(p.pagamento.entregador)}` : ''}${p.pagamento.por ? ` · ${esc(p.pagamento.por)}` : ''}`)).join('') : '<p class="muted" style="padding:8px 0">Nenhum pagamento registrado neste dia.</p>'}</div></section>
        ${c.estornos.length ? `<section class="card" aria-labelledby="cx-est" style="margin-top:16px"><div class="card__head"><div class="card__titles"><h3 class="card__title" id="cx-est">Estornos</h3></div></div><div class="olist">${c.estornos.map(p => linha(p, p.pagamento.obs ? ` · ${esc(p.pagamento.obs)}` : '')).join('')}</div></section>` : ''}
        <p class="page-note" style="margin-top:16px">${icone('info')}<span>O caixa soma o que foi registrado em cada pedido (Pedidos › abrir o pedido › Registrar pagamento). O site não recebe pagamentos: tudo é pago na entrega ou no balcão.</span></p>`;
      box.removeAttribute('aria-busy');
    },
    sair() { (this.off || []).forEach(f => f()); this.off = []; },
  };
})();
