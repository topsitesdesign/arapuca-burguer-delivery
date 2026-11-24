/* Arapuca Burguer · painel — Visão geral, Pedidos (kanban), detalhes do pedido e novo pedido. */
(function () {
  'use strict';
  const { $, $$, esc, brl, num, icone, plural, hm, decorrido, normal, fotoProduto } = BA;
  const E = () => BA.estado;

  /* ================================================================== pedidos: estados e ações */
  const ST = {
    novo: { nome: 'Novo', cor: 'amber', col: 'Novos' },
    confirmado: { nome: 'Confirmado', cor: 'orange', col: 'Confirmados' },
    preparo: { nome: 'Em preparo', cor: 'blue', col: 'Em preparação' },
    entrega: { nome: 'Em entrega', ret: 'Pronto p/ retirada', cor: 'green', col: 'Em entrega' },
    concluido: { nome: 'Entregue', ret: 'Retirado', cor: 'muted' },
    recusado: { nome: 'Recusado', cor: 'red' },
    cancelado: { nome: 'Cancelado', cor: 'red' },
  };
  const PAG = { pix: ['Pix', 'pix'], credito: ['Cartão de crédito', 'card'], debito: ['Cartão de débito', 'card'], dinheiro: ['Dinheiro', 'cash'] };
  const nomeStatus = (p, s = p.status) => (p.modalidade === 'retirada' && ST[s].ret) || ST[s].nome;
  const pill = p => `<span class="pill pill--${ST[p.status].cor}">${nomeStatus(p)}</span>`;
  const qtdItens = p => p.itens.reduce((n, i) => n + i.qtd, 0);
  const unit = i => i.preco + (i.adicionais || []).reduce((s, a) => s + a.preco, 0);
  const acharPedido = n => E().pedidos.find(p => p.numero === Number(n));
  const ATIVOS = ['novo', 'confirmado', 'preparo', 'entrega'];
  const val = (x, p) => (typeof x === 'function' ? x(p) : x);
  const PROX = {
    novo: { para: 'confirmado', rotulo: 'Aceitar pedido', curto: 'Aceitar', icone: 'check', msg: p => `Pedido #${p.numero} aceito. A cozinha já pode preparar.` },
    confirmado: { para: 'preparo', rotulo: 'Iniciar preparo', curto: 'Preparar', icone: 'flame', msg: p => `Pedido #${p.numero} foi para o preparo.` },
    preparo: { para: 'entrega', rotulo: p => (p.modalidade === 'retirada' ? 'Pronto para retirada' : 'Saiu para entrega'), curto: p => (p.modalidade === 'retirada' ? 'Pronto' : 'Despachar'), icone: 'bike', msg: p => (p.modalidade === 'retirada' ? `Pedido #${p.numero} pronto para retirada.` : `Pedido #${p.numero} saiu para entrega.`) },
    entrega: { para: 'concluido', rotulo: p => (p.modalidade === 'retirada' ? 'Marcar como retirado' : 'Marcar como entregue'), curto: 'Concluir', icone: 'check', msg: p => `Pedido #${p.numero} ${p.modalidade === 'retirada' ? 'retirado' : 'entregue'}. Bom trabalho!` },
  };
  Object.assign(BA, { ST, nomeStatus, pillStatus: pill, qtdItens });

  /* muda a etapa no servidor; a tela usa o pedido que o servidor devolve */
  async function mudarEtapa(p, para, motivo = '') {
    try {
      const r = await BA.api(`api/pedidos/${p.numero}/status`, { para, motivo });
      aplicar(p, r.pedido);
      return true;
    } catch (e) {
      if (e.dados?.pedido) aplicar(p, e.dados.pedido);
      BA.toast(e.message, 'erro');
      return false;
    }
  }
  async function avancar(p) {
    const prox = PROX[p.status];
    if (!prox) return;
    if (await mudarEtapa(p, prox.para)) BA.toast(prox.msg(p));
  }
  /* pedido alterado no servidor: atualiza o quadro e, se a gaveta mostra uma cópia (pedido aberto pelo Histórico), ela também */
  function aplicar(p, novo) {
    const v = BA.atualizarPedido(novo);
    if (v !== p) Object.assign(p, novo);
    BA.emit('mudou');
  }
  async function recusar(p) {
    const novo = p.status === 'novo';
    const concluido = p.status === 'concluido';
    const motivos = novo
      ? ['Fora da área de entrega', 'Produto esgotado', 'Loja sem capacidade agora', 'Endereço incompleto', 'Outro motivo']
      : concluido ? ['Pedido concluído por engano', 'Cliente devolveu o pedido', 'Pedido não foi entregue', 'Outro motivo']
      : ['Cliente pediu o cancelamento', 'Produto acabou durante o preparo', 'Entregador indisponível', 'Outro motivo'];
    const motivo = await BA.confirmar({
      titulo: novo ? `Recusar pedido #${p.numero}?` : `Cancelar pedido #${p.numero}?`,
      texto: concluido
        ? `O pedido sai do faturamento e o cancelamento fica registrado com o seu nome.${p.pagamento.status === 'recebido' ? ' O pagamento continua como recebido: se o dinheiro voltou para o cliente, registre o estorno depois.' : ''}`
        : `O cliente <strong>${esc(p.cliente.nome)}</strong> será avisado${novo ? ' e nada é cobrado' : ''}. Esta ação não pode ser desfeita.`,
      botao: novo ? 'Recusar pedido' : 'Cancelar pedido', perigo: true,
      extra: `<div class="fld"><label class="fld__label" for="mot-recusa">Motivo<span class="req" aria-hidden="true">*</span></label><select class="sel" id="mot-recusa" data-campo required aria-describedby="mot-recusa-err"><option value="">Escolha o motivo</option>${motivos.map(m => `<option>${m}</option>`).join('')}</select><p class="fld__err" id="mot-recusa-err" hidden></p></div>`,
    });
    if (!motivo) return false;
    if (!(await mudarEtapa(p, novo ? 'recusado' : 'cancelado', typeof motivo === 'string' ? motivo : ''))) return false;
    BA.toast(`Pedido #${p.numero} ${novo ? 'recusado' : 'cancelado'}. O cliente vê isso no acompanhamento; avise também pelo WhatsApp.`, 'alerta');
    return true;
  }

  /* ================================================================== pausa da loja (usada também em Configurações) */
  BA.pausarPedidos = () => new Promise(resolve => {
    const d = BA.janela({
      tamanho: 'sm', titulo: 'Pausar pedidos', sub: 'O site continua no ar, mas não aceita pedidos novos.',
      corpo: `<div class="form-sec">
        ${BA.campo({ id: 'pz-motivo', rotulo: 'Motivo', obrigatorio: true, opcoes: [{ v: '', t: 'Escolha o motivo' }, ...['Cozinha cheia', 'Falta de entregadores', 'Falta de ingrediente', 'Problema no sistema', 'Outro motivo'].map(t => ({ v: t, t }))] })}
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Por quanto tempo?</legend>
          <div class="chk-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            ${[['15', '15 minutos'], ['30', '30 minutos'], ['60', '1 hora'], ['0', 'Até eu retomar']].map(([v, t], i) => BA.caixa({ nome: 'pz-tempo', valor: v, rotulo: t, tipo: 'radio', marcado: i === 1 })).join('')}
          </div>
        </fieldset>
      </div>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-ok>Pausar pedidos</button>',
      aoFechar: () => resolve(E().operacao.pausada),
    });
    $('[data-ok]', d).addEventListener('click', () => {
      if (!BA.validar(d, [['pz-motivo', BA.obrig('Escolha o motivo da pausa.')]])) return;
      const min = +$('[name="pz-tempo"]:checked', d).value;
      Object.assign(E().operacao, { pausada: true, motivo: $('#pz-motivo', d).value, pausaAte: min ? Date.now() + min * 6e4 : null });
      BA.salvar(); BA.emit('mudou');
      BA.toast(min ? `Pedidos pausados por ${min === 60 ? '1 hora' : `${min} minutos`}. O site avisa os clientes.` : 'Pedidos pausados até você retomar.', 'alerta');
      d.close();
    });
  });
  BA.retomarPedidos = () => {
    Object.assign(E().operacao, { pausada: false, motivo: '', pausaAte: null, aberta: true });
    BA.salvar(); BA.emit('mudou');
    BA.toast('Pedidos retomados. A loja voltou a receber pedidos.');
  };

  /* ================================================================== detalhes do pedido (gaveta) */
  BA.abrirPedido = async numero => {
    let p = acharPedido(numero);
    if (!p) {
      // pedido antigo (Histórico ou Caixa): vem do servidor
      try { p = (await BA.api(`api/pedidos/${numero}`)).pedido; } catch (e) { BA.toast(e.message, 'erro'); return; }
    }
    const d = BA.janela({ tipo: 'gaveta', titulo: `Pedido #${p.numero}`, sub: '', corpo: '<div class="od" data-od></div>', rodape: ' ', classe: 'od-drawer' });
    const pintar = () => {
      $('.dlg__sub', d)?.remove();
      $('.dlg__head > div', d).insertAdjacentHTML('beforeend', `<p class="dlg__sub">Recebido às ${hm(p.criadoEm)} · ${p.modalidade === 'entrega' ? 'Entrega' : 'Retirada no balcão'}</p>`);
      $('[data-od]', d).innerHTML = corpoPedido(p);
      const prox = PROX[p.status];
      const fim = !ATIVOS.includes(p.status);
      $('.dlg__foot', d).innerHTML = `
        <button class="btn btn--ghost" type="button" data-imprimir>${icone('printer')}Imprimir comanda</button>
        <button class="btn btn--ghost" type="button" data-falar>${icone('message')}Falar com cliente</button>
        ${fim ? (p.status === 'concluido' && E().admin.gerente ? `<button class="btn btn--danger" type="button" data-recusar>${icone('ban')}Cancelar pedido concluído</button>`
          : `<p class="muted" style="grid-column:1/-1;text-align:center;font-size:13px">${p.status === 'concluido' ? 'Pedido concluído.' : `Pedido ${nomeStatus(p).toLowerCase()}.`} Não há próximas etapas.</p>`)
          : `<button class="btn btn--danger" type="button" data-recusar>${icone('ban')}${p.status === 'novo' ? 'Recusar pedido' : 'Cancelar pedido'}</button>
             <button class="btn btn--primary" type="button" data-avancar>${icone(prox.icone)}${val(prox.rotulo, p)}</button>`}`;
      BA.atualizarTempos();
    };
    pintar();
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-avancar]')) { e.target.closest('[data-avancar]').disabled = true; await avancar(p); pintar(); $('[data-avancar], [data-imprimir]', d)?.focus(); }
      else if (e.target.closest('[data-recusar]')) { if (await recusar(p)) { pintar(); $('[data-imprimir]', d)?.focus(); } }
      else if (e.target.closest('[data-imprimir]')) comanda(p);
      else if (e.target.closest('[data-falar]')) falar(p);
      else if (e.target.closest('[data-pagar]')) { if (await registrarPagamento(p)) pintar(); }
      else if (e.target.closest('[data-pg-desfazer]')) { if (await mudarPagamento(p, 'pendente')) pintar(); }
      else if (e.target.closest('[data-pg-estornar]')) { if (await mudarPagamento(p, 'estornado')) pintar(); }
      else if (e.target.closest('[data-bloquear]')) { if (await bloquearNumero(p)) pintar(); }
      else if (e.target.closest('[data-desbloquear]')) { if (await BA.desbloquearNumero(p.cliente.telefone)) pintar(); }
    });
  };

  /* ================================================================== pagamento (sem gateway: o que a loja recebeu na entrega ou no balcão) */
  const SIT_PAG = { pendente: ['A receber', 'amber'], recebido: ['Recebido', 'green'], estornado: ['Estornado', 'red'], sem_registro: ['Sem registro', 'muted'] };
  BA.SIT_PAG = SIT_PAG;
  function blocoPagamento(p) {
    const pg = p.pagamento;
    if (p.status === 'recusado') return '<p class="muted pg-linha">Pedido recusado: não há pagamento.</p>';
    const [nome, cor] = SIT_PAG[pg.status] || SIT_PAG.pendente;
    const forma = PAG[pg.formaReal]?.[0];
    const det = pg.status === 'recebido' ? `${brl(pg.valor)}${forma ? ` em ${forma.toLowerCase()}` : ''} às ${hm(pg.em)}${pg.por ? ` · ${esc(pg.por)}` : ''}${pg.entregador ? ` · entregador ${esc(pg.entregador)}` : ''}${pg.obs ? `<br><span class="muted">${esc(pg.obs)}</span>` : ''}`
      : pg.status === 'estornado' ? `${brl(pg.valor)} devolvido às ${hm(pg.em)}${pg.por ? ` · ${esc(pg.por)}` : ''}${pg.obs ? `<br><span class="muted">${esc(pg.obs)}</span>` : ''}`
      : pg.status === 'sem_registro' ? 'Pedido de antes do controle de pagamento.'
      : p.status === 'cancelado' ? 'Pedido cancelado: nada a receber.' : 'Ainda não registrado.';
    const gerente = E().admin.gerente;
    const acoes = pg.status === 'recebido'
      ? (gerente ? '<button class="btn btn--ghost btn--sm" type="button" data-pg-desfazer>Desfazer</button><button class="btn btn--ghost btn--sm" type="button" data-pg-estornar>Registrar estorno</button>' : '')
      : (pg.status === 'pendente' || pg.status === 'sem_registro') && p.status !== 'cancelado' ? `<button class="btn btn--primary btn--sm" type="button" data-pagar>${icone('check')}Registrar pagamento</button>` : '';
    return `<div class="pg"><p class="pg-linha"><span class="pill pill--${cor}">${nome}</span><span>${det}</span></p>${acoes ? `<div class="pg-acts">${acoes}</div>` : ''}</div>`;
  }
  BA.registrarPagamento = p => registrarPagamento(p);
  function registrarPagamento(p) {
    const e = E();
    return new Promise(resolve => {
      let ok = false;
      const d = BA.janela({
        tamanho: 'sm', titulo: `Pagamento do pedido #${p.numero}`, sub: `Total ${brl(p.total)} · combinado: ${PAG[p.pagamento.forma]?.[0] || '—'}`,
        corpo: `<form class="form-grid" novalidate>
          ${BA.campo({ id: 'pg-valor', rotulo: 'Valor recebido', pre: 'R$', valor: BA.valorCampo(p.total), obrigatorio: true, attrs: 'inputmode="decimal"' })}
          ${BA.campo({ id: 'pg-forma', rotulo: 'Forma usada', valor: p.pagamento.forma, obrigatorio: true, opcoes: Object.entries(PAG).map(([v, [t]]) => ({ v, t })), ajuda: 'Se o cliente pagou de outro jeito, troque aqui.' })}
          ${p.modalidade === 'entrega' ? BA.campo({ id: 'pg-entregador', rotulo: 'Entregador', opcional: true, classe: 'span-2', attrs: 'list="lista-entregadores" autocomplete="off" maxlength="60"' }) + `<datalist id="lista-entregadores">${(e.entregadores || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist>` : ''}
          ${BA.campo({ id: 'pg-obs', rotulo: 'Observação', opcional: true, classe: 'span-2', attrs: 'maxlength="120"', ajuda: 'Obrigatória se o valor for diferente do total (ex.: faltou troco, cliente pagou a mais).' })}
        </form>`,
        rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-ok>Registrar recebimento</button>',
        aoFechar: () => resolve(ok),
      });
      $('[data-ok]', d).addEventListener('click', async ev => {
        const valor = BA.lerValor($('#pg-valor', d).value);
        const regras = [
          ['pg-valor', v => (!(BA.lerValor(v) > 0) ? 'Informe o valor recebido.' : '')],
          ['pg-obs', v => (valor > 0 && Math.abs(valor - p.total) > 0.004 && !v ? 'O valor é diferente do total: explique o motivo.' : '')],
        ];
        if (!BA.validar(d, regras)) return;
        const b = ev.currentTarget;
        b.disabled = true;
        try {
          const r = await BA.api(`api/pedidos/${p.numero}/pagamento`, { situacao: 'recebido', valor, forma: $('#pg-forma', d).value, entregador: $('#pg-entregador', d)?.value.trim() || '', obs: $('#pg-obs', d).value.trim() });
          aplicar(p, r.pedido);
          if (r.entregadores) e.entregadores = r.entregadores;
          ok = true;
          d.close();
          BA.toast(`Pagamento do pedido #${p.numero} registrado.`);
        } catch (er) {
          b.disabled = false;
          if (er.dados?.pedido) aplicar(p, er.dados.pedido);
          const c = er.dados?.campo && $('#' + er.dados.campo, d);
          if (c) { BA.erroCampo(c, er.message); c.focus(); } else BA.toast(er.message, 'erro');
        }
      });
    });
  }
  async function mudarPagamento(p, situacao) {
    const estorno = situacao === 'estornado';
    const motivo = await BA.confirmar({
      titulo: estorno ? `Registrar estorno do pedido #${p.numero}?` : `Desfazer o pagamento do pedido #${p.numero}?`,
      texto: estorno ? `Use quando o dinheiro (${brl(p.pagamento.valor)}) voltou para o cliente. Fica registrado com o seu nome.` : 'O pagamento volta para "A receber". Use quando o recebimento foi marcado por engano.',
      botao: estorno ? 'Registrar estorno' : 'Desfazer', perigo: true,
      extra: estorno ? '<div class="fld"><label class="fld__label" for="mot-estorno">Motivo<span class="req" aria-hidden="true">*</span></label><input class="inp" id="mot-estorno" data-campo required maxlength="120" data-msg="Escreva o motivo do estorno." aria-describedby="mot-estorno-err"><p class="fld__err" id="mot-estorno-err" hidden></p></div>' : '',
    });
    if (!motivo) return false;
    try {
      const r = await BA.api(`api/pedidos/${p.numero}/pagamento`, { situacao, obs: typeof motivo === 'string' ? motivo : '' });
      aplicar(p, r.pedido);
      BA.toast(estorno ? 'Estorno registrado.' : 'Pagamento desfeito: voltou para A receber.', 'info');
      return true;
    } catch (er) {
      if (er.dados?.pedido) aplicar(p, er.dados.pedido);
      BA.toast(er.message, 'erro');
      return false;
    }
  }

  /* ================================================================== números bloqueados (trote) */
  const digitos = t => String(t || '').replace(/\D/g, '');
  const bloqueado = p => (E().bloqueados || []).some(b => b.digitos === digitos(p.cliente.telefone));
  async function bloquearNumero(p) {
    const motivo = await BA.confirmar({
      titulo: `Bloquear ${esc(p.cliente.telefone)}?`, texto: 'Este número não consegue mais fazer pedidos pelo site. Pedidos lançados no balcão continuam possíveis. Dá para desbloquear depois.',
      botao: 'Bloquear número', perigo: true,
      extra: `<div class="fld"><label class="fld__label" for="mot-bloq">Motivo<span class="req" aria-hidden="true">*</span></label><select class="sel" id="mot-bloq" data-campo required aria-describedby="mot-bloq-err"><option value="">Escolha o motivo</option>${['Pedido falso (trote)', 'Não pagou na entrega', 'Endereço inexistente', 'Outro motivo'].map(m => `<option>${m}</option>`).join('')}</select><p class="fld__err" id="mot-bloq-err" hidden></p></div>`,
    });
    if (!motivo) return false;
    try {
      const r = await BA.api('api/bloqueados', { telefone: p.cliente.telefone, motivo });
      E().bloqueados = r.bloqueados;
      BA.toast('Número bloqueado para pedidos pelo site.', 'info');
      return true;
    } catch (er) { BA.toast(er.message, 'erro'); return false; }
  }
  BA.desbloquearNumero = async telefone => {
    const ok = await BA.confirmar({ titulo: `Desbloquear ${esc(telefone)}?`, texto: 'O número volta a poder fazer pedidos pelo site.', botao: 'Desbloquear' });
    if (!ok) return false;
    try {
      const r = await BA.api('api/bloqueados/remover', { telefone });
      E().bloqueados = r.bloqueados;
      BA.toast('Número desbloqueado.', 'info');
      return true;
    } catch (er) { BA.toast(er.message, 'erro'); return false; }
  };

  function corpoPedido(p) {
    const fim = p.status === 'recusado' || p.status === 'cancelado';
    const ultimo = p.eventos[p.eventos.length - 1];
    const [pagNome, pagIc] = PAG[p.pagamento.forma] || ['—', 'wallet'];
    const area = p.endereco && E().areas.find(a => a.nome === p.endereco.bairro);
    const extra = area?.tempoExtra || 0;
    const op = E().operacao;
    const prazo = p.modalidade === 'entrega' ? `${op.tempoMin + extra}–${op.tempoMax + extra} min` : E().config.entrega.prazoRetirada;
    const previsao = p.criadoEm + (p.modalidade === 'entrega' ? op.tempoMax + extra : 30) * 6e4;
    const etapas = ['novo', 'confirmado', 'preparo', 'entrega', 'concluido'];
    const idx = etapas.indexOf(p.status);
    const quando = s => p.eventos.find(ev => ev.status === s)?.em;
    const quem = s => p.eventos.find(ev => ev.status === s)?.por;
    const tl = etapas.map((s, i) => {
      const t = quando(s);
      const feito = fim ? !!t : i < idx || (i === idx && s === 'concluido');
      const agora = !fim && i === idx && s !== 'concluido';
      return `<li class="${feito ? 'is-done' : agora ? 'is-now' : 'is-todo'}"><span class="tl__dot">${feito ? icone('check') : ''}</span><span class="tl__name">${nomeStatus(p, s)}${quem(s) ? ` <small class="muted">· ${esc(quem(s))}</small>` : ''}</span><span class="tl__time">${t ? hm(t) : ''}</span></li>`;
    }).filter((li, i) => !fim || quando(etapas[i])).join('')
      + (fim ? `<li class="is-bad"><span class="tl__dot">${icone('x')}</span><span><span class="tl__name">${nomeStatus(p)}</span>${ultimo.motivo ? `<span class="tl__time" style="display:block">${esc(ultimo.motivo)}</span>` : ''}</span><span class="tl__time">${hm(ultimo.em)}</span></li>` : '');
    return `
      ${p.agendadoRotulo ? `<p class="it__obs" style="justify-self:start;margin-bottom:10px">${icone('calendar')}Agendado para ${esc(p.agendadoRotulo.charAt(0).toLowerCase() + p.agendadoRotulo.slice(1))}</p>` : ''}<div class="od__status">${pill(p)}<span class="oc__time">${icone('clock')}<span data-desde="${p.criadoEm}" data-limite="50">${decorrido(p.criadoEm)}</span></span><span class="muted" style="font-size:13px">desde que entrou</span></div>
      <section class="od__sec" aria-label="Cliente">
        <h3 class="od__h">${icone('user')}Cliente</h3>
        <div class="od__box"><div class="od__row"><span class="od__big">${esc(p.cliente.nome)}</span>${p.cliente.telefone ? `<a class="link" href="tel:${digitos(p.cliente.telefone)}">${icone('phone')}${esc(p.cliente.telefone)}</a>` : ''}</div>
          ${p.anonimizado ? '<p class="muted" style="margin-top:6px">Os dados pessoais deste pedido foram anonimizados (LGPD). Os valores continuam para a contabilidade.</p>' : ''}
          ${p.primeiroPedido && !p.anonimizado ? `<p class="it__obs" style="justify-self:start;margin-top:8px">${icone('star')}Primeiro pedido deste número. Se desconfiar de trote, confirme pelo WhatsApp antes de preparar.</p>` : ''}
          ${p.cliente.telefone && !p.anonimizado ? (bloqueado(p) ? `<p class="od__row" style="margin-top:8px"><span class="pill pill--red">Número bloqueado no site</span><button class="link" type="button" data-desbloquear>Desbloquear</button></p>` : `<p style="margin-top:8px"><button class="link" type="button" data-bloquear>${icone('ban')}Bloquear este número no site</button></p>`) : ''}
        </div>
      </section>
      <section class="od__sec" aria-label="Itens">
        <h3 class="od__h">${icone('bag')}Itens · ${plural(qtdItens(p), 'item', 'itens')}</h3>
        <ul class="items">${p.itens.map(i => `<li class="it"><span class="it__q">${i.qtd}×</span><div><p class="it__name">${esc(i.nome)}</p>${i.adicionais?.length ? `<p class="it__add">${i.adicionais.map(a => esc(a.nome) + (a.preco ? ` (+${brl(a.preco)})` : '')).join(' · ')}</p>` : ''}${i.obs ? `<p class="it__obs">${icone('message')}${esc(i.obs)}</p>` : ''}</div><span class="it__price">${brl(unit(i) * i.qtd)}</span></li>`).join('')}</ul>
      </section>
      <section class="od__sec" aria-label="Valores">
        <h3 class="od__h">${icone('receipt')}Valores</h3>
        <dl class="sums">
          <dt>Subtotal</dt><dd>${brl(p.subtotal)}</dd>
          <dt>${p.modalidade === 'entrega' ? `Taxa de entrega · ${esc(p.endereco.bairro)}` : 'Retirada no balcão'}</dt><dd>${p.taxa ? brl(p.taxa) : p.cupom === 'FRETEGRATIS' ? 'Grátis (cupom)' : 'Grátis'}</dd>
          ${p.desconto ? `<dt>Desconto · cupom ${esc(p.cupom)}</dt><dd class="is-discount">− ${brl(p.desconto)}</dd>` : ''}
          <dt class="total">Total</dt><dd class="total">${brl(p.total)}</dd>
        </dl>
      </section>
      <section class="od__sec" aria-label="${p.modalidade === 'entrega' ? 'Entrega' : 'Retirada'}">
        <h3 class="od__h">${icone(p.modalidade === 'entrega' ? 'pin' : 'store')}${p.modalidade === 'entrega' ? 'Entrega' : 'Retirada'}</h3>
        <div class="od__box">
          ${p.modalidade === 'entrega'
            ? `<p class="od__big">${esc(p.endereco.rua)}, ${esc(p.endereco.numero)}${p.endereco.complemento ? ` · ${esc(p.endereco.complemento)}` : ''}</p><p class="muted">${esc(p.endereco.bairro)} · São Paulo</p>${p.endereco.referencia ? `<p class="muted">Referência: ${esc(p.endereco.referencia)}</p>` : ''}`
            : `<p class="od__big">Retirada no balcão</p><p class="muted">${esc(E().config.loja.rua)}, ${esc(E().config.loja.numero)} · ${esc(E().config.loja.bairro)}</p>`}
          <p class="od__row" style="margin-top:8px"><span class="muted">Prazo estimado</span><strong>${prazo}${fim ? '' : ` · até ${hm(previsao)}`}</strong></p>
        </div>
      </section>
      <section class="od__sec" aria-label="Pagamento">
        <h3 class="od__h">${icone('wallet')}Pagamento na ${p.modalidade === 'entrega' ? 'entrega' : 'retirada'}</h3>
        <div class="od__box"><p class="od__row"><span class="od__big" style="display:flex;gap:8px;align-items:center">${icone(pagIc)}${pagNome}</span><strong>${brl(p.total)}</strong></p>
          ${p.pagamento.trocoPara ? `<p class="it__obs" style="justify-self:start">${icone('cash')}Levar troco para ${brl(p.pagamento.trocoPara)} · troco de ${brl(p.pagamento.trocoPara - p.total)}</p>` : p.pagamento.forma === 'dinheiro' ? '<p class="muted">Sem troco.</p>' : ''}
          ${blocoPagamento(p)}
        </div>
      </section>
      <section class="od__sec" aria-label="Linha do tempo">
        <h3 class="od__h">${icone('clock')}Linha do tempo</h3>
        <ol class="tl">${tl}</ol>
      </section>`;
  }

  function comanda(p) {
    const loja = E().config.loja;
    const [pagNome] = PAG[p.pagamento.forma] || ['—'];
    const d = BA.janela({
      tamanho: 'sm', titulo: 'Comanda', sub: `Pedido #${p.numero} · pronta para a impressora térmica`,
      corpo: `<div class="comanda">
        <h3>${esc(String(loja.nome || '').toUpperCase())}</h3><p class="c">${esc(loja.rua)}, ${esc(loja.numero)} · ${esc(loja.telefone)}</p><hr>
        <div class="row b"><span>PEDIDO #${p.numero}</span><span>${hm(p.criadoEm)}</span></div>
        <p>${p.modalidade === 'entrega' ? 'ENTREGA' : 'RETIRADA NO BALCÃO'}</p><hr>
        <p class="b">${esc(p.cliente.nome)}</p><p>${esc(p.cliente.telefone)}</p>
        ${p.endereco ? `<p>${esc(p.endereco.rua)}, ${esc(p.endereco.numero)}${p.endereco.complemento ? ` - ${esc(p.endereco.complemento)}` : ''}</p><p>${esc(p.endereco.bairro)}${p.endereco.referencia ? ` · Ref.: ${esc(p.endereco.referencia)}` : ''}</p>` : ''}<hr>
        ${p.itens.map(i => `<div class="row b"><span>${i.qtd}x ${esc(i.nome)}</span><span>${brl(unit(i) * i.qtd)}</span></div>${(i.adicionais || []).map(a => `<p>  + ${esc(a.nome)}</p>`).join('')}${i.obs ? `<p>  OBS: ${esc(i.obs)}</p>` : ''}`).join('')}<hr>
        <div class="row"><span>Subtotal</span><span>${brl(p.subtotal)}</span></div>
        ${p.desconto ? `<div class="row"><span>Desconto ${esc(p.cupom)}</span><span>-${brl(p.desconto)}</span></div>` : ''}
        <div class="row"><span>Taxa</span><span>${brl(p.taxa)}</span></div>
        <div class="row b"><span>TOTAL</span><span>${brl(p.total)}</span></div><hr>
        <p>Pagamento: ${pagNome}${p.pagamento.trocoPara ? ` · troco p/ ${brl(p.pagamento.trocoPara)}` : ''}</p>
        <p class="c" style="margin-top:8px">Obrigado pela preferência!</p>
      </div>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Fechar</button><button class="btn btn--primary" type="button" data-print>' + icone('printer') + 'Imprimir</button>',
    });
    $('[data-print]', d).addEventListener('click', () => { window.print(); BA.toast(`Comanda do pedido #${p.numero} enviada para impressão.`); });
  }

  function falar(p) {
    const nome = p.cliente.nome.split(' ')[0];
    const loja = E().config.loja.nome;
    const modelos = [
      ...(p.primeiroPedido ? [['Confirmar o primeiro pedido', `Olá, ${nome}! Aqui é da ${loja}. Recebemos o seu pedido nº ${p.numero} pelo site. Pode confirmar respondendo esta mensagem?`]] : []),
      ['Pedido confirmado', `Olá, ${nome}! Seu pedido #${p.numero} foi confirmado e já está sendo preparado.`],
      ['Saiu para entrega', `Olá, ${nome}! Seu pedido #${p.numero} saiu para entrega e chega em poucos minutos.`],
      ['Pequeno atraso', `Olá, ${nome}! Seu pedido #${p.numero} vai atrasar uns 10 minutos. Pedimos desculpas pela espera.`],
      ['Pronto para retirada', `Olá, ${nome}! Seu pedido #${p.numero} está pronto no balcão da ${E().config.loja.rua}, ${E().config.loja.numero}.`],
    ];
    const d = BA.janela({
      tamanho: 'md', titulo: 'Falar com cliente', sub: `${esc(p.cliente.nome)} · ${esc(p.cliente.telefone)}`,
      corpo: `<div class="form-sec">
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Mensagens prontas</legend>
          <div class="chk-grid">${modelos.map(([t], i) => BA.caixa({ nome: 'modelo', valor: i, rotulo: t, tipo: 'radio', marcado: i === 0 })).join('')}</div>
        </fieldset>
        ${BA.campo({ id: 'msg-cliente', rotulo: 'Mensagem', tipo: 'textarea', linhas: 4, valor: modelos[0][1], obrigatorio: true })}
        <p class="page-note">${icone('info')}<span>O botão abre a conversa com o cliente no WhatsApp deste aparelho, com a mensagem pronta. É só tocar em enviar.</span></p>
      </div>`,
      rodape: `<a class="btn btn--ghost grow" href="tel:${p.cliente.telefone.replace(/\D/g, '')}">${icone('phone')}Ligar</a><button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-enviar>${icone('message')}Enviar pelo WhatsApp</button>`,
    });
    d.addEventListener('change', e => { if (e.target.name === 'modelo') $('#msg-cliente', d).value = modelos[+e.target.value][1]; });
    $('[data-enviar]', d).addEventListener('click', () => {
      if (!BA.validar(d, [['msg-cliente', BA.obrig('Escreva a mensagem.')]])) return;
      const fone = p.cliente.telefone.replace(/\D/g, '');
      window.open(`https://wa.me/55${fone}?text=${encodeURIComponent($('#msg-cliente', d).value)}`, '_blank', 'noopener');
      d.close();
      BA.toast(`Conversa com ${nome} aberta no WhatsApp.`);
    });
  }

  /* ================================================================== novo pedido (balcão ou telefone) */
  /* opções do produto (as mesmas regras do site): devolve { escolhas, extra, resumo } ou null se cancelar */
  function escolherOpcoes(prod) {
    const gs = (prod.grupos || []).map(id => E().grupos.find(g => g.id === id)).filter(g => g && g.ativo && g.opcoes.length);
    if (!gs.length) return Promise.resolve({ escolhas: {}, extra: 0, resumo: '' });
    return new Promise(resolve => {
      let res = null;
      const d = BA.janela({
        tamanho: 'sm', titulo: esc(prod.nome), sub: 'Escolha as opções do cliente.',
        corpo: gs.map(g => {
          const unico = g.tipo === 'unico';
          const min = g.obrigatorio ? Math.max(1, g.min || 1) : 0;
          const max = unico ? 1 : Math.max(1, g.max || 1);
          const regra = `${min ? 'obrigatório' : 'opcional'}${max > 1 ? `, até ${max}` : ''}`;
          return `<fieldset class="fld" style="border:0;padding:0;margin:0 0 14px" data-g="${esc(g.id)}" data-min="${min}" data-max="${max}"><legend class="fld__label" style="margin-bottom:6px">${esc(g.nome)} <span class="muted" style="font-weight:500">${regra}</span></legend>
            <div class="chk-grid">${g.opcoes.map(o => BA.caixa({ nome: `op-${g.id}`, valor: o.id, tipo: unico ? 'radio' : 'checkbox', rotulo: `${esc(o.nome)}${o.preco ? ` <span class="muted">+ ${brl(o.preco)}</span>` : ''}` })).join('')}</div>
            <p class="fld__err" hidden></p></fieldset>`;
        }).join(''),
        rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-ok>Adicionar</button>',
        aoFechar: () => resolve(res),
      });
      $('[data-ok]', d).addEventListener('click', () => {
        const escolhas = {};
        const partes = [];
        let extra = 0, erro = false;
        gs.forEach(g => {
          const caixa = $(`[data-g="${CSS.escape(g.id)}"]`, d);
          const marcadas = $$('input:checked', caixa).map(i => i.value);
          const min = +caixa.dataset.min, max = +caixa.dataset.max;
          const msg = marcadas.length < min ? `Escolha ${min === 1 ? 'uma opção' : `${min} opções`}.` : marcadas.length > max ? `Escolha até ${max}.` : '';
          const err = $('.fld__err', caixa);
          err.hidden = !msg;
          if (msg) { err.innerHTML = `${icone('alert')}${msg}`; erro = true; }
          if (marcadas.length) {
            const ops = marcadas.map(id => g.opcoes.find(o => o.id === id)).filter(Boolean);
            escolhas[g.id] = marcadas;
            ops.forEach(o => { extra += o.preco || 0; });
            partes.push(ops.map(o => o.nome).join(', '));
          }
        });
        if (erro) return;
        res = { escolhas, extra: BA.r2(extra), resumo: partes.join(' · ') };
        d.close();
      });
    });
  }
  function novoPedido() {
    const e = E();
    const prods = e.produtos.filter(p => p.ativo && !p.esgotado);
    const areas = e.areas.filter(a => a.ativa);
    const itens = [];
    const d = BA.janela({
      tamanho: 'lg', titulo: 'Novo pedido', sub: 'Para pedidos feitos por telefone, WhatsApp ou no balcão.',
      corpo: `<form novalidate data-form>
        <div class="form-sec">
          <p class="form-sec__t">Cliente</p>
          <div class="form-grid">
            ${BA.campo({ id: 'np-nome', rotulo: 'Nome do cliente', obrigatorio: true, attrs: 'autocomplete="off"' })}
            ${BA.campo({ id: 'np-fone', rotulo: 'Telefone ou WhatsApp', obrigatorio: true, placeholder: '(11) 90000-0000', attrs: 'data-mascara="fone" inputmode="tel" autocomplete="off"' })}
          </div>
        </div>
        <div class="form-sec">
          <p class="form-sec__t">Recebimento</p>
          <div class="choices" style="grid-template-columns:repeat(2,minmax(0,1fr))" role="radiogroup" aria-label="Modalidade">
            <label class="choice"><input type="radio" name="np-mod" value="entrega" checked><span class="choice__ic">${icone('bike')}</span><span><span class="choice__t">Entrega</span><span class="choice__d" style="display:block">Taxa conforme o bairro</span></span></label>
            <label class="choice"><input type="radio" name="np-mod" value="retirada"><span class="choice__ic">${icone('store')}</span><span><span class="choice__t">Retirada</span><span class="choice__d" style="display:block">No balcão, sem taxa</span></span></label>
          </div>
          <div class="form-grid" data-endereco>
            ${BA.campo({ id: 'np-bairro', rotulo: 'Bairro', obrigatorio: true, opcoes: [{ v: '', t: 'Escolha o bairro' }, ...areas.map(a => ({ v: a.id, t: `${a.nome} · ${brl(a.taxa)}` }))] })}
            ${BA.campo({ id: 'np-rua', rotulo: 'Rua', obrigatorio: true, placeholder: 'Rua ou avenida' })}
            ${BA.campo({ id: 'np-num', rotulo: 'Número', obrigatorio: true, attrs: 'inputmode="numeric"' })}
            ${BA.campo({ id: 'np-comp', rotulo: 'Complemento', opcional: true, placeholder: 'Apto, bloco, casa' })}
            ${BA.campo({ id: 'np-ref', rotulo: 'Referência', opcional: true, classe: 'span-2', placeholder: 'Ex.: portão azul' })}
          </div>
        </div>
        <div class="form-sec">
          <p class="form-sec__t">Itens</p>
          <div class="form-grid form-grid--3" style="align-items:end">
            ${BA.campo({ id: 'np-prod', rotulo: 'Produto', opcoes: [{ v: '', t: 'Escolha o produto' }, ...prods.map(p => ({ v: p.id, t: `${p.nome} · ${brl(p.promo || p.preco)}` }))] })}
            ${BA.campo({ id: 'np-qtd', rotulo: 'Quantidade', tipo: 'number', valor: '1', attrs: 'min="1" max="20" inputmode="numeric"' })}
            <button class="btn btn--ghost" type="button" data-add style="min-height:42px">${icone('plus')}Adicionar item</button>
          </div>
          <ul class="items" data-itens aria-live="polite"></ul>
          <p class="fld__err" id="np-itens-err" hidden></p>
        </div>
        <div class="form-sec">
          <p class="form-sec__t">Pagamento na entrega</p>
          <div class="form-grid">
            ${BA.campo({ id: 'np-pag', rotulo: 'Forma de pagamento', obrigatorio: true, opcoes: [{ v: '', t: 'Escolha a forma' }, ...Object.entries(PAG).map(([v, [t]]) => ({ v, t }))] })}
            ${BA.campo({ id: 'np-troco', rotulo: 'Troco para', opcional: true, pre: 'R$', placeholder: '0,00', attrs: 'inputmode="decimal" disabled' })}
            ${BA.campo({ id: 'np-cupom', rotulo: 'Cupom', opcional: true, placeholder: 'Código', attrs: 'data-mascara="codigo" autocomplete="off"', ajuda: 'O desconto é conferido e aplicado ao criar o pedido.' })}
            ${BA.campo({ id: 'np-obs', rotulo: 'Observação do pedido', tipo: 'textarea', linhas: 2, opcional: true, classe: 'span-2', placeholder: 'Ex.: interfone quebrado, ligar ao chegar' })}
          </div>
          <dl class="sums" data-resumo style="max-width:360px;margin-left:auto"></dl>
        </div>
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-criar>' + icone('check') + 'Criar pedido</button>',
    });
    const modo = () => $('[name="np-mod"]:checked', d).value;
    const total = () => {
      const sub = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
      const area = areas.find(a => a.id === $('#np-bairro', d).value);
      const taxa = modo() === 'entrega' && area ? area.taxa : 0;
      return { sub, taxa, total: BA.r2(sub + taxa), area };
    };
    const pintar = () => {
      $('[data-itens]', d).innerHTML = itens.length
        ? itens.map((i, k) => `<li class="it"><span class="it__q">${i.qtd}×</span><div><p class="it__name">${esc(i.nome)}</p>${i.resumo ? `<p class="it__add">${esc(i.resumo)}</p>` : ''}</div><span style="display:flex;gap:10px;align-items:center"><span class="it__price">${brl(i.preco * i.qtd)}</span><button class="btn-icon btn-icon--sm" type="button" data-tira="${k}" aria-label="Remover ${esc(i.nome)}">${icone('trash')}</button></span></li>`).join('')
        : '<li class="muted" style="padding:10px 0">Nenhum item ainda. Escolha um produto e toque em Adicionar item.</li>';
      const t = total();
      $('[data-resumo]', d).innerHTML = `<dt>Subtotal</dt><dd>${brl(t.sub)}</dd><dt>${modo() === 'entrega' ? 'Taxa de entrega' : 'Retirada'}</dt><dd>${modo() === 'entrega' ? (t.area ? brl(t.taxa) : 'escolha o bairro') : 'Grátis'}</dd><dt class="total">Total</dt><dd class="total">${brl(t.total)}</dd>`;
    };
    pintar();
    d.addEventListener('change', ev => {
      if (ev.target.name === 'np-mod') { $('[data-endereco]', d).hidden = modo() !== 'entrega'; pintar(); }
      if (ev.target.id === 'np-bairro') pintar();
      if (ev.target.id === 'np-pag') { const t = $('#np-troco', d); t.disabled = ev.target.value !== 'dinheiro'; if (t.disabled) t.value = ''; }
    });
    $('[data-add]', d).addEventListener('click', async () => {
      const sel = $('#np-prod', d);
      const p = prods.find(x => x.id === sel.value);
      if (!p) { BA.erroCampo(sel, 'Escolha um produto para adicionar.'); sel.focus(); return; }
      const q = Math.max(1, Math.min(20, parseInt($('#np-qtd', d).value, 10) || 1));
      // produto com adicionais (ponto da carne, extras): o atendente escolhe como no site (PED-08)
      const op = await escolherOpcoes(p);
      if (!op) { sel.focus(); return; }
      const chave = JSON.stringify([p.id, op.escolhas]);
      const ja = itens.find(i => i.chave === chave);
      if (ja) ja.qtd = Math.min(20, ja.qtd + q); else itens.push({ chave, produtoId: p.id, nome: p.nome, qtd: q, preco: BA.r2((p.promo || p.preco) + op.extra), escolhas: op.escolhas, resumo: op.resumo });
      sel.value = ''; $('#np-qtd', d).value = '1';
      $('#np-itens-err', d).hidden = true;
      pintar(); sel.focus();
    });
    d.addEventListener('click', ev => { const b = ev.target.closest('[data-tira]'); if (b) { itens.splice(+b.dataset.tira, 1); pintar(); } });
    $('[data-criar]', d).addEventListener('click', async () => {
      const entrega = modo() === 'entrega';
      const regras = [
        ['np-nome', BA.obrig('Escreva o nome do cliente.')],
        ['np-fone', v => (v.replace(/\D/g, '').length < 10 ? 'Escreva o telefone com DDD.' : '')],
        ['np-pag', BA.obrig('Escolha a forma de pagamento.')],
      ];
      if (entrega) regras.push(['np-bairro', BA.obrig('Escolha o bairro.')], ['np-rua', BA.obrig('Escreva a rua.')], ['np-num', BA.obrig('Escreva o número.')]);
      const t = total();
      const trocoEl = $('#np-troco', d);
      if ($('#np-pag', d).value === 'dinheiro') regras.push(['np-troco', v => (v && !(BA.lerValor(v) >= t.total) ? `O troco precisa ser de pelo menos ${brl(t.total)}.` : '')]);
      const err = $('#np-itens-err', d);
      if (!itens.length) { err.innerHTML = `${icone('alert')}Adicione pelo menos um item.`; err.hidden = false; }
      if (!BA.validar(d, regras) || !itens.length) { if (!itens.length && !$('[aria-invalid="true"]', d)) { $('#np-prod', d).focus(); BA.toast('Adicione pelo menos um item ao pedido.', 'erro'); } return; }
      const botao = $('[data-criar]', d);
      botao.disabled = true;
      let p;
      try {
        const r = await BA.api('api/pedidos', {
          cliente: { nome: $('#np-nome', d).value.trim(), telefone: $('#np-fone', d).value.trim() },
          modalidade: entrega ? 'entrega' : 'retirada',
          endereco: entrega ? { rua: $('#np-rua', d).value.trim(), numero: $('#np-num', d).value.trim(), complemento: $('#np-comp', d).value.trim(), area: t.area.id, referencia: $('#np-ref', d).value.trim() } : null,
          itens: itens.map(i => ({ produtoId: i.produtoId, qtd: i.qtd, escolhas: i.escolhas || {} })),
          cupom: $('#np-cupom', d).value.trim(),
          pagamento: { forma: $('#np-pag', d).value, trocoPara: trocoEl.value ? BA.lerValor(trocoEl.value) : null },
          obs: $('#np-obs', d).value.trim(),
        });
        p = BA.atualizarPedido(r.pedido);
      } catch (err) {
        botao.disabled = false;
        const campo = err.dados?.campo && $('#' + err.dados.campo, d);
        if (campo) { BA.erroCampo(campo, err.message); campo.focus(); } else BA.toast(err.message, 'erro');
        return;
      }
      const numero = p.numero;
      d.close();
      BA.tocarSom();
      BA.telas.pedidos.destacar = numero;
      if (!['todos', 'novo'].includes(BA.telas.pedidos.filtro)) BA.telas.pedidos.filtro = 'todos';
      BA.emit('mudou');
      BA.toast(`Pedido #${numero} criado. Ele está na coluna Novos.`);
    });
  }

  /* ================================================================== tela: visão geral */
  const pct = (v, casas) => `${v >= 0 ? '↑' : '↓'} ${Math.abs(v).toFixed(casas).replace('.', ',')}%`;
  const metrica = ({ rotulo, valor, sub, cor, ic, subCls = '', href }) => {
    const tag = href ? 'a' : 'div';
    const glow = { orange: 'rgba(247,116,29,.16)', amber: 'rgba(245,176,46,.16)', blue: 'rgba(99,166,255,.16)', green: 'rgba(60,207,124,.16)' }[cor];
    return `<${tag} class="card metric"${href ? ` href="${href}"` : ''} style="--glow:${glow}">
      <div class="metric__top"><span class="metric__label">${rotulo}</span><span class="metric__ic metric__ic--${cor}">${icone(ic)}</span></div>
      <p class="metric__value">${valor}</p><p class="metric__sub ${subCls}">${sub}</p></${tag}>`;
  };
  /* horário de hoje vindo do servidor (Configurações › Horários e feriados): "18h às 23h30" ou "Fechado hoje" */
  const hh = s => { const [h, m] = s.split(':'); return `${+h}h${m !== '00' ? m : ''}`; };
  const horarioHoje = op => (op.hojeAbre ? `${hh(op.hojeAbre)} às ${hh(op.hojeFecha)}` : 'Fechado hoje');
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  function grafico(chave) {
    const s = E().semana[chave];
    const max = Math.max(...s.dias);
    const melhor = s.dias.indexOf(max);
    return {
      total: `<span class="week__value">${brl(s.total)}</span><span class="week__delta up">${pct(s.delta, 1)} vs. semana anterior</span>`,
      barras: s.dias.map((v, i) => {
        const h = v ? Math.max(8, (v / max) * 82) : 10;
        return `<button class="bar${i === melhor ? ' is-best' : ''}${v ? '' : ' is-closed'}" type="button" style="--h:${h.toFixed(1)}%" aria-label="${DIAS_LONGOS[i]}: ${v ? brl(v) : 'sem vendas'}${v && i === melhor ? ', melhor dia' : ''}"><span class="bar__val">${v ? brl(v) : 'R$ 0'}</span><span class="bar__fill"></span><span class="bar__lbl">${DIAS[i]}</span></button>`;
      }).join(''),
    };
  }
  function linhaPedido(p) {
    return `<button class="orow" type="button" data-abrir="${p.numero}" aria-label="Pedido #${p.numero}, ${esc(p.cliente.nome)}, ${nomeStatus(p)}, ${brl(p.total)}">
      <span class="orow__num">#${p.numero}</span>
      <span class="orow__who"><span class="orow__name">${esc(p.cliente.nome)}</span><span class="orow__meta">${plural(qtdItens(p), 'item', 'itens')} · há <span data-desde="${p.criadoEm}">${decorrido(p.criadoEm)}</span></span></span>
      <span class="orow__meta orow__mod">${icone(p.modalidade === 'entrega' ? 'bike' : 'store')}${p.modalidade === 'entrega' ? 'Entrega' : 'Retirada'}</span>
      ${pill(p)}
      <span class="orow__total">${brl(p.total)}</span>
    </button>`;
  }

  BA.telas['visao-geral'] = {
    esqueleto: 'dash',
    semana: 'atual',
    render(el) {
      this.sair();
      const e = E(), c = BA.contarPedidos(), op = e.operacao, sit = BA.situacaoLoja(op);
      // "hoje" é o dia de Brasília: pedidos de outros dias ainda em aberto não entram nos números de hoje
      const dia = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms));
      const hojeIso = dia(Date.now());
      const deHoje = e.pedidos.filter(p => dia(p.criadoEm) === hojeIso);
      const hojeN = deHoje.length;
      const antigos = e.pedidos.filter(p => dia(p.criadoEm) !== hojeIso && ATIVOS.includes(p.status)).length;
      const fat = deHoje.filter(p => p.status !== 'recusado' && p.status !== 'cancelado').reduce((s, p) => s + p.total, 0);
      const novos = c.novo ? `<strong>${plural(c.novo, 'pedido novo', 'pedidos novos')} esperando resposta.</strong>` : '';
      const resumo = sit.tipo === 'fechada' ? `Loja fechada. ${sit.abre}. ${novos}` : sit.tipo === 'pausa' ? `Os pedidos estão pausados. ${novos}` : (novos || 'Tudo em dia.');
      const h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date());
      const saudacao = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
      if (!BA.pode('pedidos')) {
        // sem a permissão de pedidos, o servidor não manda pedidos nem vendas: a visão geral mostra só a loja
        const st = { aberta: '', pausa: 'is-paused', fechada: 'is-closed' }[sit.tipo];
        el.innerHTML = `<div class="page">
          <section class="greet" aria-labelledby="saudacao"><div>
            <p class="eyebrow">Resumo do dia</p>
            <h2 class="greet__t" id="saudacao">${saudacao}, ${esc(e.admin.nome.split(' ')[0])}.</h2>
            <p class="greet__p">Seu acesso é ao cadastro da loja. Pedidos e vendas ficam com quem tem a permissão Pedidos.</p>
          </div></section>
          <section class="card" aria-labelledby="h-loja" style="max-width:560px">
            <div class="card__head"><div class="card__titles"><span class="tag">Operação</span><h3 class="card__title" id="h-loja">Status da loja</h3></div></div>
            <div class="status-box ${st}" role="status">
              <span class="dot ${{ aberta: 'dot--pulse', pausa: 'dot--amber', fechada: 'dot--red' }[sit.tipo]}" aria-hidden="true"></span>
              <div><p class="status-box__t">${sit.titulo}</p>
              <p class="status-box__s">${sit.tipo === 'pausa' && op.motivo ? `${esc(op.motivo)} · ` : ''}${sit.tipo === 'fechada' ? `${sit.abre}.${sit.painel ? ' Você fechou pelo painel.' : ''}` : `${sit.curto}.`} ${sit.site}</p></div>
            </div>
            <dl class="kv">
              <div><dt>${icone('clock')}Tempo médio de entrega</dt><dd>${op.tempoMin}–${op.tempoMax} min</dd></div>
              <div><dt>${icone('moon')}Horário de hoje</dt><dd>${horarioHoje(op)}</dd></div>
            </dl>
          </section>
        </div>`;
        return;
      }
      const recentes = e.pedidos.filter(p => ATIVOS.includes(p.status)).sort((a, b) => b.eventos[b.eventos.length - 1].em - a.eventos[a.eventos.length - 1].em).slice(0, 6);
      const maxV = Math.max(1, ...e.maisVendidos.map(m => m.vendas));
      const g = grafico(this.semana);
      const estado = { aberta: '', pausa: 'is-paused', fechada: 'is-closed' }[sit.tipo];
      el.innerHTML = `<div class="page">
        <section class="greet" aria-labelledby="saudacao">
          <div>
            <p class="eyebrow">Resumo do dia</p>
            <h2 class="greet__t" id="saudacao">${saudacao}, ${esc(e.admin.nome.split(' ')[0])}.</h2>
            <p class="greet__p">${resumo}</p>
          </div>
          <p class="live"><span class="dot dot--pulse" aria-hidden="true"></span>Atualização automática · <strong data-relativo="${Date.now()}">Agora mesmo</strong></p>
        </section>
        <section class="metrics" aria-label="Indicadores de hoje">
          ${metrica({ rotulo: 'Pedidos feitos hoje', valor: num(hojeN), sub: antigos ? `+ ${plural(antigos, 'pedido', 'pedidos')} em aberto de outros dias` : e.ontem.pedidos ? `${pct((hojeN / e.ontem.pedidos - 1) * 100, 0)} vs. ontem` : `Ontem: ${num(e.ontem.pedidos)} pedidos`, subCls: antigos ? 'amber' : hojeN >= e.ontem.pedidos ? 'up' : 'down', cor: 'orange', ic: 'bag', href: '#/pedidos?filtro=todos' })}
          ${metrica({ rotulo: 'Aguardando', valor: num(c.novo), sub: c.novo ? 'Precisam de atenção' : 'Tudo em dia', subCls: c.novo ? 'amber' : '', cor: 'amber', ic: 'timer', href: '#/pedidos?filtro=novo' })}
          ${metrica({ rotulo: 'Em preparação', valor: num(c.preparo), sub: `Tempo médio: ${op.tempoPreparo} min`, cor: 'blue', ic: 'flame', href: '#/pedidos?filtro=preparo' })}
          ${metrica({ rotulo: 'Faturamento de hoje', valor: brl(fat), sub: e.ontem.faturamento ? `${pct((fat / e.ontem.faturamento - 1) * 100, 1)} vs. ontem` : `Ontem: ${brl(e.ontem.faturamento)}`, subCls: fat >= e.ontem.faturamento ? 'up' : 'down', cor: 'green', ic: 'wallet' })}
        </section>
        <div class="dash">
          <section class="card dash__recent" aria-labelledby="h-recentes">
            <div class="card__head"><div class="card__titles"><span class="tag tag--live">Tempo real</span><h3 class="card__title" id="h-recentes">Pedidos recentes</h3></div><a class="link" href="#/pedidos">Ver todos${icone('arrow-right')}</a></div>
            <div class="olist">${recentes.length ? recentes.map(linhaPedido).join('') : BA.vazio({ icone: 'receipt', titulo: 'Sem pedidos em andamento', texto: 'Os pedidos novos aparecem aqui assim que chegam.' })}</div>
          </section>
          <section class="card dash__week" aria-labelledby="h-semana">
            <div class="card__head"><div class="card__titles"><span class="tag">Seg. a dom.</span><h3 class="card__title" id="h-semana">Faturamento semanal</h3></div>
              <label class="sr-only" for="sel-semana">Período</label><select class="sel" id="sel-semana" style="width:auto;min-height:36px"><option value="atual"${this.semana === 'atual' ? ' selected' : ''}>Esta semana</option><option value="anterior"${this.semana === 'anterior' ? ' selected' : ''}>Semana passada</option></select></div>
            <div class="week__total" data-sem-total>${g.total}</div>
            <div class="chart" data-sem-barras role="group" aria-label="Faturamento por dia">${g.barras}</div>
          </section>
          <section class="card dash__top" aria-labelledby="h-top">
            <div class="card__head"><div class="card__titles"><span class="tag">Destaques</span><h3 class="card__title" id="h-top">Mais vendidos</h3></div><a class="link" href="#/produtos">Ver produtos${icone('arrow-right')}</a></div>
            <ol class="rank">${e.maisVendidos.map((m, i) => {
              const p = e.produtos.find(x => x.id === m.produtoId);
              if (!p) return '';
              return `<li class="rank__item"><span class="rank__n">${i + 1}</span><img class="rank__img" src="${fotoProduto(p)}" alt="" width="52" height="52" loading="lazy"><span><span class="rank__name">${esc(p.nome)}</span><span class="rank__meta">${num(m.vendas)} vendas nos últimos 7 dias</span><span class="rank__bar"><span style="--w:${(m.vendas / maxV) * 100}%"></span></span></span><span class="rank__price">${brl(p.promo || p.preco)}</span></li>`;
            }).join('') || '<li class="muted" style="padding:8px 0">Ainda sem vendas nos últimos 30 dias.</li>'}</ol>
          </section>
          <section class="card dash__store" aria-labelledby="h-loja">
            <div class="card__head"><div class="card__titles"><span class="tag">Operação</span><h3 class="card__title" id="h-loja">Status da loja</h3></div><a class="link" href="#/configuracoes?aba=operacao">Ajustar${icone('arrow-right')}</a></div>
            <div class="status-box ${estado}" role="status">
              <span class="dot ${{ aberta: 'dot--pulse', pausa: 'dot--amber', fechada: 'dot--red' }[sit.tipo]}" aria-hidden="true"></span>
              <div><p class="status-box__t">${sit.titulo}</p>
              <p class="status-box__s">${sit.tipo === 'pausa' && op.motivo ? `${esc(op.motivo)} · ` : ''}${sit.tipo === 'fechada' ? `${sit.abre}.${sit.painel ? ' Você fechou pelo painel.' : ''}` : `${sit.curto}.`} ${sit.site}</p></div>
            </div>
            <dl class="kv">
              <div><dt>${icone('clock')}Tempo médio de entrega</dt><dd>${op.tempoMin}–${op.tempoMax} min</dd></div>
              <div><dt>${icone('wallet')}Pedido mínimo</dt><dd>${brl(op.pedidoMinimo)}</dd></div>
              <div><dt>${icone('moon')}Horário de hoje</dt><dd>${horarioHoje(op)}</dd></div>
            </dl>
            ${!op.aberta ? `<button class="btn btn--green btn--lg btn--block" type="button" data-abrir-loja>${icone('power')}Abrir a loja</button>`
              : op.pausada ? `<button class="btn btn--green btn--lg btn--block" type="button" data-retomar>${icone('play')}Retomar pedidos</button>`
              : `<button class="btn btn--ghost btn--lg btn--block" type="button" data-pausar>${icone('pause')}Pausar pedidos</button>`}
          </section>
        </div>
      </div>`;
      el.querySelector('#sel-semana').addEventListener('change', ev => {
        this.semana = ev.target.value;
        const g2 = grafico(this.semana);
        $('[data-sem-total]', el).innerHTML = g2.total;
        $('[data-sem-barras]', el).innerHTML = g2.barras;
      });
      el.firstElementChild.addEventListener('click', async ev => {
        const a = ev.target.closest('[data-abrir]');
        if (a) { BA.abrirPedido(+a.dataset.abrir); return; }
        if (ev.target.closest('[data-pausar]')) { await BA.pausarPedidos(); $('[data-retomar], [data-pausar]', el)?.focus(); return; }
        if (ev.target.closest('[data-retomar]') || ev.target.closest('[data-abrir-loja]')) { BA.retomarPedidos(); $('[data-pausar]', el)?.focus(); }
      });
      this.off = [BA.on('mudou', () => this.render(el))];
      this.relogio = setInterval(() => { if (!document.querySelector('dialog[open]')) this.render(el); }, 60000);
    },
    sair() { (this.off || []).forEach(f => f()); this.off = []; clearInterval(this.relogio); },
  };

  /* ================================================================== tela: pedidos (kanban) */
  const COLS = ['novo', 'confirmado', 'preparo', 'entrega'];
  function cartao(p, destaque) {
    const prox = PROX[p.status];
    const [pagNome, pagIc] = PAG[p.pagamento.forma] || ['—', 'wallet'];
    return `<article class="oc${destaque ? ' is-new' : ''}" style="--c: var(--${{ novo: 'amber', confirmado: 'brand', preparo: 'blue', entrega: 'green' }[p.status]})">
      <div class="oc__top">
        <h3 class="oc__num"><button class="oc__open" type="button" data-abrir="${p.numero}" aria-label="Ver detalhes do pedido #${p.numero}, ${esc(p.cliente.nome)}">#${p.numero}</button></h3>
        <span class="oc__time">${icone('clock')}<span data-desde="${p.criadoEm}" data-limite="50">${decorrido(p.criadoEm)}</span></span>
      </div>
      <p class="oc__who">${esc(p.cliente.nome)}${p.primeiroPedido ? ' <span class="pill pill--blue pill--plain">1º pedido</span>' : ''}</p>
      ${p.agendadoRotulo ? `<p class="oc__meta"><span class="oc__m">${icone('calendar')}Agendado: ${esc(p.agendadoRotulo)}</span></p>` : ''}
      <p class="oc__meta"><span class="oc__m">${icone('bag')}${plural(qtdItens(p), 'item', 'itens')}</span><span class="oc__sep" aria-hidden="true"></span><span class="oc__m">${icone(p.modalidade === 'entrega' ? 'bike' : 'store')}${p.modalidade === 'entrega' ? esc(p.endereco.bairro) : 'Retirada'}</span><span class="oc__sep" aria-hidden="true"></span><span class="oc__m">${icone(pagIc)}${{ pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro' }[p.pagamento.forma] || pagNome}</span></p>
      <ul class="oc__itens">${p.itens.map(i => `<li><b>${i.qtd}×</b> ${esc(i.nome)}${i.adicionais?.length ? `<span class="oc__add"> · ${i.adicionais.map(a => esc(a.nome)).join(', ')}</span>` : ''}${i.obs ? `<span class="oc__obs"> · ${esc(i.obs)}</span>` : ''}</li>`).join('')}</ul>
      ${p.status === 'novo' ? `<div class="oc__aceite"><button class="btn btn--primary btn--lg" type="button" data-avancar="${p.numero}" aria-label="Aceitar pedido #${p.numero}">${icone('check')}Aceitar pedido</button><button class="btn btn--ghost btn--lg" type="button" data-recusar-card="${p.numero}" aria-label="Recusar pedido #${p.numero}">Recusar</button></div>` : ''}
      <div class="oc__foot">
        <span class="oc__total">${brl(p.total)}${p.pagamento.status === 'recebido' ? ' <span class="pill pill--green pill--plain">Pago</span>' : ''}</span>
        <div class="oc__acts">
          ${prox && p.status !== 'novo' ? `<button class="btn btn--sm btn--ghost" type="button" data-avancar="${p.numero}" aria-label="${val(prox.rotulo, p)}: pedido #${p.numero}">${val(prox.curto, p)}</button>` : ''}
          <button class="btn-icon btn-icon--sm" type="button" data-acoes="${p.numero}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações do pedido #${p.numero}">${icone('more')}</button>
        </div>
      </div>
    </article>`;
  }

  BA.telas.pedidos = {
    esqueleto: 'kanban',
    filtro: 'todos',
    destacar: null,
    render(el, params) {
      this.sair();
      const f = params?.get('filtro');
      if (f && ['todos', 'novo', 'preparo', 'entrega', 'confirmado'].includes(f)) this.filtro = f;
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Filtrar pedidos" data-filtros></div>
          <div class="toolbar__r"><button class="btn btn--primary" type="button" data-novo>${icone('plus')}Novo pedido</button></div>
        </div>
        <p class="count-line" data-info hidden></p>
        <div class="kanban" data-kanban aria-label="Quadro de pedidos"></div>
        <details class="card done-wrap" data-concluidos>
          <summary>${icone('chevron-down')}Concluídos e recusados hoje <span class="chip__n" data-n-concl></span></summary>
          <div class="olist" data-lista-concl></div>
        </details>
      </div>`;
      $('#busca-global').value = BA.busca;
      this.pintar(el);
      el.firstElementChild.addEventListener('click', ev => {
        const fb = ev.target.closest('[data-filtro]');
        if (fb) { this.filtro = fb.dataset.filtro; history.replaceState(null, '', `#/pedidos?filtro=${this.filtro}`); this.pintar(el); return; }
        if (ev.target.closest('[data-novo]')) { novoPedido(); return; }
        if (ev.target.closest('[data-limpar-busca]')) { BA.busca = ''; $('#busca-global').value = ''; this.pintar(el); return; }
        const av = ev.target.closest('[data-avancar]');
        if (av) { const p = acharPedido(av.dataset.avancar); av.disabled = true; avancar(p).finally(() => { av.disabled = false; }); return; }
        const rc = ev.target.closest('[data-recusar-card]');
        if (rc) { recusar(acharPedido(rc.dataset.recusarCard)); return; }
        const ac = ev.target.closest('[data-acoes]');
        if (ac) {
          const p = acharPedido(ac.dataset.acoes);
          const prox = PROX[p.status];
          BA.menu(ac, [
            { rotulo: 'Ver detalhes', icone: 'eye', acao: () => BA.abrirPedido(p.numero) },
            ...(prox ? [{ rotulo: val(prox.rotulo, p), icone: prox.icone, acao: () => avancar(p) }] : []),
            { rotulo: 'Imprimir comanda', icone: 'printer', acao: () => comanda(p) },
            { rotulo: 'Falar com cliente', icone: 'message', acao: () => falar(p) },
            '-',
            { rotulo: p.status === 'novo' ? 'Recusar pedido' : 'Cancelar pedido', icone: 'ban', perigo: true, acao: () => recusar(p) },
          ]);
          return;
        }
        const ab = ev.target.closest('[data-abrir]');
        if (ab) BA.abrirPedido(+ab.dataset.abrir);
      });
      this.off = [BA.on('mudou', () => this.pintar(el)), BA.on('busca', () => this.pintar(el))];
    },
    pintar(el) {
      const e = E(), c = BA.contarPedidos();
      const filtros = [['todos', 'Todos', c.todos], ['novo', 'Novos', c.novo], ['preparo', 'Em preparo', c.preparo], ['entrega', 'Em entrega', c.entrega]];
      if (this.filtro === 'confirmado') filtros.splice(2, 0, ['confirmado', 'Confirmados', c.confirmado]);
      $('[data-filtros]', el).innerHTML = filtros.map(([v, t, n]) => `<button class="chip" type="button" data-filtro="${v}" aria-pressed="${this.filtro === v}">${t}<span class="chip__n">${n}</span></button>`).join('');
      const q = normal(BA.busca).replace('#', '').trim();
      const dig = q.replace(/\D/g, '');
      const casa = p => !q || String(p.numero).includes(q) || normal(p.cliente.nome).includes(q) || (dig.length >= 4 && p.cliente.telefone.replace(/\D/g, '').includes(dig));
      const cols = this.filtro === 'todos' ? COLS : [this.filtro];
      const kb = $('[data-kanban]', el);
      kb.classList.toggle('is-single', cols.length === 1);
      let achados = 0;
      kb.innerHTML = cols.map(s => {
        const lista = e.pedidos.filter(p => p.status === s && casa(p)).sort((a, b) => a.criadoEm - b.criadoEm);
        achados += lista.length;
        return `<section class="col col--${s}" aria-label="${ST[s].col}: ${lista.length}">
          <div class="col__head"><span class="col__dot" aria-hidden="true"></span><h2 class="col__title">${ST[s].col}</h2><span class="col__n">${lista.length}</span></div>
          ${lista.length ? lista.map(p => cartao(p, p.numero === this.destacar)).join('') : `<div class="col__empty">${icone(q ? 'search' : 'check')}${q ? 'Nada com essa busca' : 'Nenhum pedido aqui'}</div>`}
        </section>`;
      }).join('');
      const info = $('[data-info]', el);
      info.hidden = !q;
      if (q) info.innerHTML = `${plural(achados, 'pedido encontrado', 'pedidos encontrados')} para “${esc(BA.busca)}” · <button class="link" type="button" data-limpar-busca>Limpar busca</button>`;
      const concl = e.pedidos.filter(p => !ATIVOS.includes(p.status) && casa(p)).sort((a, b) => b.eventos[b.eventos.length - 1].em - a.eventos[a.eventos.length - 1].em);
      const box = $('[data-concluidos]', el);
      box.hidden = this.filtro !== 'todos';
      $('[data-n-concl]', el).textContent = concl.length;
      $('[data-lista-concl]', el).innerHTML = concl.length ? concl.map(linhaPedido).join('') : '<p class="muted" style="padding:8px 0">Nenhum pedido concluído com essa busca.</p>';
      if (this.destacar) {
        const novo = $('.oc.is-new', el);
        novo?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: BA.suave() });
        this.destacar = null;
      }
      BA.atualizarTempos();
    },
    sair() { (this.off || []).forEach(f => f()); this.off = []; },
  };
})();
