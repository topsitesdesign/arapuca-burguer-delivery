/* Arapuca Burguer · painel — Produtos, Categorias e Adicionais. */
(function () {
  'use strict';
  const { $, $$, esc, brl, num, icone, plural, normal, fotoProduto } = BA;
  const E = () => BA.estado;
  const catNome = id => E().categorias.find(c => c.id === id)?.nome || 'Sem categoria';
  const categoriasReais = () => E().categorias.filter(c => !c.especial);
  const contarProdutos = c => (c.especial ? E().produtos.filter(p => p.destaque).length : E().produtos.filter(p => p.categoria === c.id).length);
  const reordenar = (lista, idA, idB) => {
    const a = lista.findIndex(x => x.id === idA), b = lista.findIndex(x => x.id === idB);
    if (a < 0 || b < 0) return;
    const [item] = lista.splice(a, 1);
    lista.splice(b, 0, item);
  };
  /* arrastar e soltar (cards ou linhas com data-id) */
  function arrastavel(raiz, ativo, aoSoltar) {
    let origem = null;
    const limpar = () => $$('.is-over, .is-dragging', raiz).forEach(x => x.classList.remove('is-over', 'is-dragging'));
    raiz.addEventListener('dragstart', e => {
      const it = e.target.closest?.('[data-id][draggable="true"]');
      if (!it || !ativo()) return;
      origem = it.dataset.id;
      it.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', origem);
    });
    raiz.addEventListener('dragover', e => {
      if (!origem) return;
      const alvo = e.target.closest('[data-id][draggable="true"]');
      if (!alvo) return;
      e.preventDefault();
      $$('.is-over', raiz).forEach(x => x.classList.remove('is-over'));
      if (alvo.dataset.id !== origem) alvo.classList.add('is-over');
    });
    raiz.addEventListener('drop', e => {
      if (!origem) return;
      e.preventDefault();
      const alvo = e.target.closest('[data-id][draggable="true"]');
      const de = origem;
      origem = null;
      limpar();
      if (alvo && alvo.dataset.id !== de) aoSoltar(de, alvo.dataset.id);
    });
    raiz.addEventListener('dragend', () => { origem = null; limpar(); });
  }

  /* ================================================================== produtos */
  const DISP = [['todos', 'Todas as situações'], ['ativos', 'Ativos'], ['inativos', 'Inativos'], ['esgotados', 'Esgotados'], ['destaque', 'Em destaque']];
  function cartaoProduto(p, reorder) {
    const img = fotoProduto(p);
    const flag = p.esgotado ? 'Esgotado' : !p.ativo ? 'Inativo' : '';
    return `<article class="card pc${!p.ativo ? ' is-inactive' : ''}${p.esgotado ? ' is-soldout' : ''}" data-id="${p.id}" draggable="${reorder}">
      <div class="pc__media">
        ${img ? `<img class="pc__img" src="${img}" alt="" width="500" height="375" loading="lazy" decoding="async">` : `<div class="pc__img" style="display:grid;place-items:center;color:var(--muted-2)">${icone('image', 'ic')}</div>`}
        <span class="pc__badge${p.destaque ? ' pc__badge--hot' : ''}">${p.destaque ? 'Mais pedido' : esc(catNome(p.categoria))}</span>
        ${flag ? `<div class="pc__flag"><span>${flag}</span></div>` : ''}
      </div>
      <div class="pc__body">
        <p class="pc__cat">${esc(catNome(p.categoria))}${p.codigo ? ` · ${esc(p.codigo)}` : ''}</p>
        <h3 class="pc__name">${esc(p.nome)}</h3>
        <p class="pc__desc">${esc(p.descricao)}</p>
        <p class="pc__price">${p.promo ? `<strong>${brl(p.promo)}</strong><s>${brl(p.preco)}</s>` : `<strong>${brl(p.preco)}</strong>`}</p>
        <div class="pc__foot">
          ${BA.interruptor({ id: `at-${p.id}`, rotulo: p.ativo ? 'Ativo' : 'Inativo', marcado: p.ativo, attrs: `data-ativo="${p.id}"`, classe: 'switch--green' })}
          <div class="pc__acts">
            <button class="btn-icon btn-icon--sm" type="button" data-editar="${p.id}" aria-label="Editar ${esc(p.nome)}" title="Editar">${icone('pencil')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-duplicar="${p.id}" aria-label="Duplicar ${esc(p.nome)}" title="Duplicar">${icone('copy')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-esgotado="${p.id}" aria-pressed="${p.esgotado}" aria-label="${p.esgotado ? 'Tirar' : 'Marcar'} ${esc(p.nome)} ${p.esgotado ? 'de esgotado' : 'como esgotado'}" title="${p.esgotado ? 'Voltar a vender' : 'Marcar como esgotado'}">${icone('ban')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-excluir="${p.id}" aria-label="Excluir ${esc(p.nome)}" title="Excluir">${icone('trash')}</button>
          </div>
          <div class="pc__move">
            <button class="btn-icon btn-icon--sm" type="button" data-mover="-1" data-alvo="${p.id}" aria-label="Mover ${esc(p.nome)} para antes">${icone('arrow-left')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-mover="1" data-alvo="${p.id}" aria-label="Mover ${esc(p.nome)} para depois">${icone('arrow-right')}</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  BA.telas.produtos = {
    esqueleto: 'grade',
    cat: 'todas', disp: 'todos', q: '', reorder: false, ordem: null,
    render(el) {
      this.reorder = false;
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="toolbar__l">
            <div class="search">${icone('search')}<input class="inp" type="search" id="busca-prod" placeholder="Buscar produto ou código" aria-label="Buscar produto" value="${esc(this.q)}"></div>
            <label class="sr-only" for="f-cat">Categoria</label>
            <select class="sel" id="f-cat" style="width:auto"><option value="todas">Todas as categorias</option>${categoriasReais().map(c => `<option value="${c.id}"${this.cat === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
            <label class="sr-only" for="f-disp">Situação</label>
            <select class="sel" id="f-disp" style="width:auto">${DISP.map(([v, t]) => `<option value="${v}"${this.disp === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          </div>
          <div class="toolbar__r">
            <button class="btn btn--ghost" type="button" data-excluidos="produtos">${icone('trash')}Excluídos</button>
            <button class="btn btn--ghost" type="button" data-reordenar>${icone('arrow-up-down')}Reordenar</button>
            <button class="btn btn--primary" type="button" data-novo>${icone('plus')}Novo produto</button>
          </div>
        </div>
        <div class="reorder-bar" data-barra hidden><p>${icone('grip')}Arraste os cards ou use as setas para definir a ordem do cardápio.</p><div class="toolbar__r" style="width:auto"><button class="btn btn--ghost btn--sm" type="button" data-cancelar-ordem>Cancelar</button><button class="btn btn--primary btn--sm" type="button" data-salvar-ordem>${icone('check')}Salvar ordem</button></div></div>
        <p class="count-line" data-contagem></p>
        <div class="pgrid" data-grade></div>
      </div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      $('#busca-prod', root).addEventListener('input', ev => { this.q = ev.target.value.trim(); this.pintar(); });
      $('#f-cat', root).addEventListener('change', ev => { this.cat = ev.target.value; this.pintar(); });
      $('#f-disp', root).addEventListener('change', ev => { this.disp = ev.target.value; this.pintar(); });
      root.addEventListener('change', ev => {
        const t = ev.target.closest('[data-ativo]');
        if (!t) return;
        const p = E().produtos.find(x => x.id === t.dataset.ativo);
        p.ativo = t.checked;
        BA.salvar();
        BA.toast(p.ativo ? `${p.nome} ativado. Ele volta ao cardápio do site.` : `${p.nome} desativado. Ele sai do cardápio do site.`, p.ativo ? 'ok' : 'info');
        this.pintar(`at-${p.id}`);
      });
      root.addEventListener('click', async ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const e = E();
        if (b.matches('[data-novo]')) return formProduto(null, id => this.pintar(null, id));
        if (b.matches('[data-reordenar]')) return this.modoOrdem(true);
        if (b.matches('[data-cancelar-ordem]')) { this.modoOrdem(false); BA.toast('Ordem mantida como estava.', 'info'); return; }
        if (b.matches('[data-salvar-ordem]')) {
          const pos = Object.fromEntries(this.ordem.map((id, i) => [id, i]));
          e.produtos.sort((a, c) => pos[a.id] - pos[c.id]);
          BA.salvar(); this.modoOrdem(false);
          BA.toast('Nova ordem salva. O cardápio do site segue esta sequência.');
          return;
        }
        if (b.matches('[data-limpar]')) { this.q = ''; this.cat = 'todas'; this.disp = 'todos'; $('#busca-prod', root).value = ''; $('#f-cat', root).value = 'todas'; $('#f-disp', root).value = 'todos'; this.pintar(); return; }
        if (b.matches('[data-mover]')) {
          const i = this.ordem.indexOf(b.dataset.alvo), j = i + Number(b.dataset.mover);
          if (j < 0 || j >= this.ordem.length) return;
          [this.ordem[i], this.ordem[j]] = [this.ordem[j], this.ordem[i]];
          this.pintar(null, null, `[data-mover="${b.dataset.mover}"][data-alvo="${b.dataset.alvo}"]`);
          return;
        }
        const id = b.dataset.editar || b.dataset.duplicar || b.dataset.esgotado || b.dataset.excluir;
        const p = id && e.produtos.find(x => x.id === id);
        if (!p) return;
        if (b.dataset.editar) formProduto(p, pid => this.pintar(null, pid));
        else if (b.dataset.duplicar) {
          const copia = { ...p, ingredientes: [...p.ingredientes], grupos: [...p.grupos], id: BA.uid(p.id), nome: `${p.nome} (cópia)`, codigo: p.codigo ? `${p.codigo}-C` : '', ativo: false, destaque: false };
          e.produtos.splice(e.produtos.indexOf(p) + 1, 0, copia);
          e.grupos.forEach(g => { if (g.produtos.includes(p.id)) g.produtos.push(copia.id); });
          BA.salvar(); this.pintar(null, copia.id);
          BA.toast(`Cópia criada: ${copia.nome}. Ela começa inativa.`);
        } else if (b.dataset.esgotado) {
          p.esgotado = !p.esgotado;
          BA.salvar(); this.pintar(null, null, `[data-esgotado="${p.id}"]`);
          BA.toast(p.esgotado ? `${p.nome} marcado como esgotado. O site mostra "esgotado".` : `${p.nome} voltou a ser vendido.`, p.esgotado ? 'alerta' : 'ok');
        } else if (b.dataset.excluir) {
          const ok = await BA.confirmar({ titulo: 'Excluir produto?', texto: `<strong>${esc(p.nome)}</strong> sai do cardápio. Ele fica em Excluídos (botão no alto desta tela) e pode voltar quando você quiser.`, botao: 'Excluir produto', perigo: true });
          if (!ok) return;
          e.produtos.splice(e.produtos.indexOf(p), 1);
          e.grupos.forEach(g => { g.produtos = g.produtos.filter(x => x !== p.id); });
          BA.salvar(); this.pintar();
          BA.toast(`${p.nome} foi excluído.`, 'info');
        }
      });
      arrastavel(root, () => this.reorder, (de, para) => {
        const i = this.ordem.indexOf(de), j = this.ordem.indexOf(para);
        this.ordem.splice(j, 0, this.ordem.splice(i, 1)[0]);
        this.pintar();
      });
    },
    modoOrdem(on) {
      const root = this.root;
      this.reorder = on;
      this.ordem = on ? E().produtos.map(p => p.id) : null;
      if (on) { this.q = ''; this.cat = 'todas'; this.disp = 'todos'; $('#busca-prod', root).value = ''; $('#f-cat', root).value = 'todas'; $('#f-disp', root).value = 'todos'; }
      $('[data-barra]', root).hidden = !on;
      $$('.toolbar input, .toolbar select, [data-reordenar], [data-novo]', root).forEach(x => { x.disabled = on; });
      this.pintar();
      if (on) $('[data-salvar-ordem]', root).focus(); else $('[data-reordenar]', root).focus();
    },
    pintar(focar, destacar, seletorFoco) {
      const root = this.root;
      if (!root?.isConnected) return;
      const e = E();
      const q = normal(this.q);
      let lista = this.reorder ? this.ordem.map(id => e.produtos.find(p => p.id === id)) : e.produtos;
      lista = lista.filter(p => (!q || normal(p.nome).includes(q) || normal(p.codigo).includes(q) || normal(p.descricao).includes(q))
        && (this.cat === 'todas' || p.categoria === this.cat)
        && ({ todos: true, ativos: p.ativo, inativos: !p.ativo, esgotados: p.esgotado, destaque: p.destaque }[this.disp]));
      const ativos = e.produtos.filter(p => p.ativo).length, esg = e.produtos.filter(p => p.esgotado).length;
      $('[data-contagem]', root).textContent = `${plural(e.produtos.length, 'produto', 'produtos')} · ${plural(ativos, 'ativo', 'ativos')} · ${plural(esg, 'esgotado', 'esgotados')}${lista.length !== e.produtos.length ? ` · mostrando ${lista.length}` : ''}`;
      const grade = $('[data-grade]', root);
      grade.classList.toggle('is-reorder', this.reorder);
      grade.innerHTML = lista.length ? lista.map(p => cartaoProduto(p, this.reorder)).join('')
        : `<div style="grid-column:1/-1">${BA.vazio({ icone: 'search', titulo: 'Nenhum produto encontrado', texto: 'Ajuste a busca ou os filtros para ver mais produtos.', acao: '<button class="btn btn--ghost" type="button" data-limpar>Limpar filtros</button>' })}</div>`;
      if (focar) $(`#${focar}`, root)?.focus();
      if (seletorFoco) $(seletorFoco, root)?.focus();
      if (destacar) {
        const c = $(`.pc[data-id="${destacar}"]`, root);
        if (c) { c.scrollIntoView({ block: 'center', behavior: BA.suave() }); c.animate([{ boxShadow: '0 0 0 3px rgba(247,116,29,.7)' }, { boxShadow: '0 0 0 0 rgba(247,116,29,0)' }], { duration: 1400 }); }
      }
    },
    sair() {},
  };

  /* novo produto / editar produto */
  function formProduto(p, depois) {
    const e = E();
    const novo = !p;
    const dados = p ? { ...p, ingredientes: [...p.ingredientes], grupos: [...p.grupos] } : { id: '', nome: '', descricao: '', categoria: '', preco: '', promo: null, ingredientes: [], grupos: [], preparo: 12, codigo: '', ativo: true, destaque: false, esgotado: false, foto: '', imagem: '' };
    let imagem = p ? fotoProduto(p, true) : '';
    let mudouImagem = false;
    const d = BA.janela({
      tamanho: 'lg', titulo: novo ? 'Novo produto' : 'Editar produto', sub: novo ? 'Preencha os dados que aparecem no cardápio do site.' : esc(p.nome),
      corpo: `<form class="prod-form" novalidate>
        <div class="prod-form__side">
          <div class="fld"><span class="fld__label">Imagem do produto <span class="opt">(recomendado)</span></span><div data-upload></div></div>
          <div class="form-sec" style="gap:10px">
            ${BA.linhaInterruptor({ id: 'pp-ativo', rotulo: 'Produto ativo', desc: 'Aparece no cardápio do site.', marcado: dados.ativo })}
            ${BA.linhaInterruptor({ id: 'pp-destaque', rotulo: 'Marcar como destaque', desc: 'Entra em "Mais pedidos".', marcado: dados.destaque })}
            ${BA.linhaInterruptor({ id: 'pp-esgotado', rotulo: 'Marcar como esgotado', desc: 'Fica visível, sem botão de compra.', marcado: dados.esgotado })}
          </div>
        </div>
        <div class="form-grid">
          ${BA.campo({ id: 'pp-nome', rotulo: 'Nome', valor: dados.nome, obrigatorio: true, classe: 'span-2', attrs: 'maxlength="60" autocomplete="off"' })}
          ${BA.campo({ id: 'pp-desc', rotulo: 'Descrição', tipo: 'textarea', linhas: 3, valor: dados.descricao, obrigatorio: true, classe: 'span-2', attrs: 'maxlength="180"', ajuda: 'Até 180 caracteres. Aparece no card e no modal do produto.' })}
          ${BA.campo({ id: 'pp-cat', rotulo: 'Categoria', obrigatorio: true, valor: dados.categoria, opcoes: [{ v: '', t: 'Escolha a categoria' }, ...categoriasReais().map(c => ({ v: c.id, t: c.nome + (c.ativa ? '' : ' (inativa)') }))] })}
          ${BA.campo({ id: 'pp-codigo', rotulo: 'Código interno', opcional: true, valor: dados.codigo, placeholder: 'Ex.: HB-008', attrs: 'data-mascara="codigo" maxlength="20" autocomplete="off"' })}
          ${BA.campo({ id: 'pp-preco', rotulo: 'Preço', obrigatorio: true, pre: 'R$', valor: BA.valorCampo(dados.preco), placeholder: '0,00', attrs: 'inputmode="decimal" autocomplete="off"' })}
          ${BA.campo({ id: 'pp-promo', rotulo: 'Preço promocional', opcional: true, pre: 'R$', valor: BA.valorCampo(dados.promo), placeholder: '0,00', attrs: 'inputmode="decimal" autocomplete="off"', ajuda: 'Fica no lugar do preço, com o original riscado.' })}
          ${BA.campo({ id: 'pp-preparo', rotulo: 'Tempo de preparo', tipo: 'number', suf: 'min', valor: dados.preparo, attrs: 'min="1" max="120" inputmode="numeric"' })}
          <div class="fld"><span class="fld__label">Situação</span><p class="muted" style="font-size:13px;padding-top:10px" data-resumo-sit></p></div>
          <div class="fld span-2"><label class="fld__label" for="pp-ingr">Ingredientes</label><div data-ingr></div></div>
          <fieldset class="fld span-2" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Grupos de adicionais</legend>
            <div class="chk-grid">${e.grupos.map(g => BA.caixa({ nome: 'pp-grupos', valor: g.id, rotulo: `${esc(g.nome)} <span class="muted" style="font-size:12px">· ${g.obrigatorio ? 'obrigatório' : 'opcional'}</span>`, marcado: dados.grupos.includes(g.id) })).join('')}</div>
          </fieldset>
        </div>
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>' + icone('check') + 'Salvar produto</button>',
    });
    BA.upload($('[data-upload]', d), { valor: imagem, rotulo: 'Imagem do produto', aoMudar: url => { imagem = url; mudouImagem = true; } });
    const ingredientes = BA.etiquetas($('[data-ingr]', d), { valores: dados.ingredientes, id: 'pp-ingr', placeholder: 'Ex.: Pão brioche' });
    const sit = () => {
      const a = $('#pp-ativo', d).checked, es = $('#pp-esgotado', d).checked, de = $('#pp-destaque', d).checked;
      $('[data-resumo-sit]', d).textContent = `${a ? (es ? 'Ativo, mas esgotado' : 'Ativo e à venda') : 'Inativo: não aparece no site'}${de ? ' · em destaque' : ''}.`;
    };
    sit();
    d.addEventListener('change', ev => { if (ev.target.type === 'checkbox') sit(); });
    $('[data-salvar]', d).addEventListener('click', () => {
      const preco = BA.lerValor($('#pp-preco', d).value);
      const ok = BA.validar(d, [
        ['pp-nome', v => (!v ? 'Escreva o nome do produto.' : e.produtos.some(x => x.id !== dados.id && normal(x.nome) === normal(v)) ? 'Já existe um produto com esse nome.' : '')],
        ['pp-desc', v => (!v ? 'Escreva uma descrição curta.' : v.length < 10 ? 'Descreva um pouco mais (mínimo de 10 caracteres).' : '')],
        ['pp-cat', BA.obrig('Escolha a categoria.')],
        ['pp-preco', v => (!v ? 'Informe o preço.' : !(preco > 0) ? 'Use um valor como 38,90.' : '')],
        ['pp-promo', v => { if (!v) return ''; const pr = BA.lerValor(v); return !(pr > 0) ? 'Use um valor como 34,90.' : pr >= preco ? 'O promocional precisa ser menor que o preço.' : ''; }],
        ['pp-preparo', v => (v && (+v < 1 || +v > 120) ? 'Use de 1 a 120 minutos.' : '')],
        ['pp-codigo', v => (v && e.produtos.some(x => x.id !== dados.id && x.codigo === v) ? 'Esse código já é usado por outro produto.' : '')],
      ]);
      if (!ok) return;
      const promo = $('#pp-promo', d).value ? BA.lerValor($('#pp-promo', d).value) : null;
      const final = {
        ...dados,
        nome: $('#pp-nome', d).value.trim(), descricao: $('#pp-desc', d).value.trim(), categoria: $('#pp-cat', d).value,
        codigo: $('#pp-codigo', d).value.trim(), preco: BA.r2(preco), promo: promo ? BA.r2(promo) : null,
        preparo: +$('#pp-preparo', d).value || 12, ingredientes: ingredientes(),
        grupos: $$('[name="pp-grupos"]:checked', d).map(c => c.value),
        ativo: $('#pp-ativo', d).checked, destaque: $('#pp-destaque', d).checked, esgotado: $('#pp-esgotado', d).checked,
      };
      if (mudouImagem) { final.imagem = imagem; if (!imagem) final.foto = ''; }
      if (novo) {
        final.id = BA.slug(final.nome) || BA.uid('prod');
        if (e.produtos.some(x => x.id === final.id)) final.id = BA.uid(final.id);
        e.produtos.push(final);
      } else Object.assign(p, final);
      // grupos de adicionais acompanham a escolha
      e.grupos.forEach(g => {
        const tem = g.produtos.includes(final.id), quer = final.grupos.includes(g.id);
        if (quer && !tem) g.produtos.push(final.id);
        if (!quer && tem) g.produtos = g.produtos.filter(x => x !== final.id);
      });
      BA.salvar();
      d.close();
      BA.toast(novo ? `${final.nome} criado${final.ativo ? ' e já aparece no cardápio' : ' (inativo)'}.` : `${final.nome} salvo.`);
      depois?.(final.id);
    });
  }
  BA.formProduto = formProduto;

  /* ================================================================== categorias */
  const ICONES_CAT = ['burger', 'gift', 'utensils', 'cup', 'ice-cream', 'star', 'flame', 'moon', 'bag', 'package'];
  BA.telas.categorias = {
    esqueleto: 'tabela',
    q: '',
    render(el) {
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="toolbar__l"><div class="search">${icone('search')}<input class="inp" type="search" id="busca-cat" placeholder="Buscar categoria" aria-label="Buscar categoria" value="${esc(this.q)}"></div></div>
          <div class="toolbar__r"><button class="btn btn--ghost" type="button" data-excluidos="categorias">${icone('trash')}Excluídas</button><button class="btn btn--primary" type="button" data-nova>${icone('plus')}Nova categoria</button></div>
        </div>
        <p class="page-note">${icone('info')}<span>A ordem aqui é a ordem do cardápio no site. Arraste pela alça ${icone('grip', 'ic')} ou use as setas. "Mais pedidos" é automática: mostra os produtos marcados como destaque.</span></p>
        <div class="card card--flush"><div class="tbl-wrap"><table class="tbl tbl--cards" data-tabela>
          <thead><tr><th style="width:44px"><span class="sr-only">Arrastar</span></th><th style="width:110px">Ordem</th><th>Categoria</th><th>Produtos</th><th>Status</th><th class="r">Ações</th></tr></thead>
          <tbody data-linhas></tbody>
        </table></div></div>
      </div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      $('#busca-cat', root).addEventListener('input', ev => { this.q = ev.target.value.trim(); this.pintar(); });
      root.addEventListener('change', ev => {
        const t = ev.target.closest('[data-ativa]');
        if (!t) return;
        const c = E().categorias.find(x => x.id === t.dataset.ativa);
        c.ativa = t.checked;
        BA.salvar(); this.pintar(`ca-${c.id}`);
        BA.toast(c.ativa ? `Categoria ${c.nome} ativada.` : `Categoria ${c.nome} desativada. Ela some do cardápio do site.`, c.ativa ? 'ok' : 'info');
      });
      root.addEventListener('click', async ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const e = E();
        if (b.matches('[data-nova]')) return formCategoria(null, id => this.pintar(null, id));
        if (b.matches('[data-limpar]')) { this.q = ''; $('#busca-cat', root).value = ''; this.pintar(); return; }
        const id = b.dataset.editar || b.dataset.duplicar || b.dataset.excluir || b.dataset.alvo;
        const c = id && e.categorias.find(x => x.id === id);
        if (!c) return;
        if (b.dataset.mover) {
          const i = e.categorias.indexOf(c), j = i + Number(b.dataset.mover);
          if (j < 0 || j >= e.categorias.length) return;
          [e.categorias[i], e.categorias[j]] = [e.categorias[j], e.categorias[i]];
          BA.salvar(); this.pintar(null, null, `[data-mover="${b.dataset.mover}"][data-alvo="${c.id}"]`);
          BA.toast(`${c.nome} agora é a ${j + 1}ª no cardápio.`, 'info');
        } else if (b.dataset.editar) formCategoria(c, cid => this.pintar(null, cid));
        else if (b.dataset.duplicar) {
          const copia = { ...c, id: BA.uid(c.id), nome: `${c.nome} (cópia)`, ativa: false, especial: false };
          e.categorias.splice(e.categorias.indexOf(c) + 1, 0, copia);
          BA.salvar(); this.pintar(null, copia.id);
          BA.toast(`Categoria ${copia.nome} criada, inativa e sem produtos.`);
        } else if (b.dataset.excluir) {
          const n = contarProdutos(c);
          const ok = await BA.confirmar({ titulo: 'Excluir categoria?', texto: `<strong>${esc(c.nome)}</strong> sai do cardápio.${n ? ` Os <strong>${plural(n, 'produto', 'produtos')}</strong> dela ficam fora do cardápio até você escolher outra categoria.` : ''} A categoria fica em Excluídas e pode voltar.`, botao: 'Excluir categoria', perigo: true });
          if (!ok) return;
          e.categorias.splice(e.categorias.indexOf(c), 1);
          e.produtos.forEach(p => { if (p.categoria === c.id) p.categoria = ''; });
          BA.salvar(); this.pintar();
          BA.toast(`Categoria ${c.nome} excluída.`, 'info');
        }
      });
      arrastavel(root, () => !this.q, (de, para) => {
        reordenar(E().categorias, de, para);
        BA.salvar(); this.pintar(null, de);
        BA.toast('Ordem das categorias atualizada.');
      });
    },
    pintar(focar, destacar, seletorFoco) {
      const root = this.root;
      if (!root?.isConnected) return;
      const e = E();
      const q = normal(this.q);
      const lista = e.categorias.filter(c => !q || normal(c.nome).includes(q));
      const tb = $('[data-linhas]', root);
      tb.innerHTML = lista.length ? lista.map(c => {
        const i = e.categorias.indexOf(c);
        const n = contarProdutos(c);
        return `<tr class="${c.ativa ? '' : 'is-inactive'}" data-id="${c.id}" draggable="${!q}">
          <td data-th="" class="row-handle"><span class="handle" aria-hidden="true" title="Arraste para reordenar">${icone('grip')}</span></td>
          <td data-th="Ordem"><span class="order-n"><button class="btn-icon btn-icon--sm btn-icon--ghost" type="button" data-mover="-1" data-alvo="${c.id}" aria-label="Subir ${esc(c.nome)}"${i === 0 ? ' disabled' : ''}>${icone('arrow-up')}</button><span>${i + 1}</span><button class="btn-icon btn-icon--sm btn-icon--ghost" type="button" data-mover="1" data-alvo="${c.id}" aria-label="Descer ${esc(c.nome)}"${i === e.categorias.length - 1 ? ' disabled' : ''}>${icone('arrow-down')}</button></span></td>
          <td data-th="Categoria" class="full"><div class="cell-main"><span class="cell-ic">${c.imagem ? `<img src="${c.imagem}" alt="">` : icone(c.icone || 'layers')}</span><div><strong>${esc(c.nome)}${c.especial ? ' <span class="pill pill--orange pill--plain" style="margin-left:6px">Automática</span>' : ''}</strong><small>${esc(c.descricao || '')}</small></div></div></td>
          <td data-th="Produtos"><strong>${n}</strong> <span class="muted">${c.especial ? 'em destaque' : n === 1 ? 'produto' : 'produtos'}</span></td>
          <td data-th="Status">${BA.interruptor({ id: `ca-${c.id}`, rotulo: c.ativa ? 'Ativa' : 'Inativa', marcado: c.ativa, attrs: `data-ativa="${c.id}"`, classe: 'switch--green' })}</td>
          <td class="row-acts-cell"><div class="row-acts">
            <button class="btn-icon btn-icon--sm" type="button" data-editar="${c.id}" aria-label="Editar ${esc(c.nome)}" title="Editar">${icone('pencil')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-duplicar="${c.id}" aria-label="Duplicar ${esc(c.nome)}" title="Duplicar">${icone('copy')}</button>
            <button class="btn-icon btn-icon--sm" type="button" data-excluir="${c.id}" aria-label="Excluir ${esc(c.nome)}" title="${c.especial ? 'Categoria automática não pode ser excluída' : 'Excluir'}"${c.especial ? ' disabled' : ''}>${icone('trash')}</button>
          </div></td>
        </tr>`;
      }).join('') : `<tr><td colspan="6" class="full">${BA.vazio({ icone: 'search', titulo: 'Nenhuma categoria encontrada', texto: `Nada com “${esc(this.q)}”.`, acao: '<button class="btn btn--ghost" type="button" data-limpar>Limpar busca</button>' })}</td></tr>`;
      if (focar) $(`#${focar}`, root)?.focus();
      if (seletorFoco) ($(seletorFoco, root) && !$(seletorFoco, root).disabled ? $(seletorFoco, root) : $(`[data-editar="${seletorFoco.match(/data-alvo="([^"]+)"/)?.[1]}"]`, root))?.focus();
      if (destacar) $(`tr[data-id="${destacar}"]`, root)?.animate([{ background: 'rgba(247,116,29,.18)' }, { background: 'transparent' }], { duration: 1400 });
    },
    sair() {},
  };

  function formCategoria(c, depois) {
    const e = E();
    const novo = !c;
    let imagem = c?.imagem || '';
    const d = BA.janela({
      tamanho: 'md', titulo: novo ? 'Nova categoria' : 'Editar categoria', sub: novo ? 'Ela entra no fim do cardápio. Depois é só reordenar.' : esc(c.nome),
      corpo: `<form class="form-sec" novalidate>
        ${BA.campo({ id: 'ct-nome', rotulo: 'Nome', valor: c?.nome || '', obrigatorio: true, attrs: 'maxlength="40" autocomplete="off"' })}
        ${BA.campo({ id: 'ct-desc', rotulo: 'Descrição', opcional: true, valor: c?.descricao || '', attrs: 'maxlength="90"', ajuda: 'Uma linha que aparece abaixo do título no cardápio.' })}
        <fieldset class="fld" style="border:0;padding:0;margin:0"><legend class="fld__label" style="margin-bottom:8px">Ícone</legend>
          <div class="icon-pick" role="radiogroup" aria-label="Ícone da categoria">${ICONES_CAT.map(ic => `<label class="icon-pick__op" title="${ic}"><input type="radio" name="ct-icone" value="${ic}"${(c?.icone || 'burger') === ic ? ' checked' : ''} aria-label="Ícone ${ic}"><span>${icone(ic)}</span></label>`).join('')}</div>
        </fieldset>
        <div class="fld"><span class="fld__label">Imagem <span class="opt">(opcional, no lugar do ícone)</span></span><div data-upload></div></div>
        ${BA.linhaInterruptor({ id: 'ct-ativa', rotulo: 'Categoria ativa', desc: 'Aparece no cardápio do site.', marcado: c ? c.ativa : true })}
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>' + icone('check') + 'Salvar categoria</button>',
    });
    BA.upload($('[data-upload]', d), { valor: imagem, largo: true, rotulo: 'Imagem da categoria', aoMudar: url => { imagem = url; } });
    $('[data-salvar]', d).addEventListener('click', () => {
      const ok = BA.validar(d, [['ct-nome', v => (!v ? 'Escreva o nome da categoria.' : e.categorias.some(x => x !== c && normal(x.nome) === normal(v)) ? 'Já existe uma categoria com esse nome.' : '')]]);
      if (!ok) return;
      const dados = { nome: $('#ct-nome', d).value.trim(), descricao: $('#ct-desc', d).value.trim(), icone: $('[name="ct-icone"]:checked', d)?.value || 'burger', imagem, ativa: $('#ct-ativa', d).checked };
      let id;
      if (novo) { id = BA.slug(dados.nome) || BA.uid('cat'); if (e.categorias.some(x => x.id === id)) id = BA.uid(id); e.categorias.push({ id, ...dados }); }
      else { Object.assign(c, dados); id = c.id; }
      BA.salvar(); d.close();
      BA.toast(novo ? `Categoria ${dados.nome} criada.` : `Categoria ${dados.nome} salva.`);
      depois?.(id);
    });
  }

  /* ================================================================== adicionais */
  BA.telas.adicionais = {
    esqueleto: 'grade',
    filtro: 'todos',
    render(el) {
      el.innerHTML = `<div class="page">
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Filtrar grupos" data-filtros></div>
          <div class="toolbar__r"><button class="btn btn--ghost" type="button" data-excluidos="grupos">${icone('trash')}Excluídos</button><button class="btn btn--primary" type="button" data-novo>${icone('plus')}Novo grupo</button></div>
        </div>
        <p class="page-note">${icone('info')}<span>Grupos de adicionais aparecem no modal do produto. Obrigatórios precisam de pelo menos uma escolha antes de ir para a sacola.</span></p>
        <div class="ggrid" data-grade></div>
      </div>`;
      const root = el.firstElementChild;
      this.root = root;
      this.pintar();
      root.addEventListener('change', ev => {
        const t = ev.target.closest('[data-ativo]');
        if (!t) return;
        const g = E().grupos.find(x => x.id === t.dataset.ativo);
        g.ativo = t.checked;
        BA.salvar(); this.pintar(`ga-${g.id}`);
        BA.toast(g.ativo ? `Grupo ${g.nome} ativado.` : `Grupo ${g.nome} desativado. Ele some do modal dos produtos.`, g.ativo ? 'ok' : 'info');
      });
      root.addEventListener('click', async ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const e = E();
        if (b.dataset.filtro) { this.filtro = b.dataset.filtro; this.pintar(); return; }
        if (b.matches('[data-novo]')) return formGrupo(null, id => this.pintar(null, id));
        const g = e.grupos.find(x => x.id === (b.dataset.editar || b.dataset.excluir));
        if (!g) return;
        if (b.dataset.editar) formGrupo(g, id => this.pintar(null, id));
        else {
          const ok = await BA.confirmar({ titulo: 'Excluir grupo?', texto: `<strong>${esc(g.nome)}</strong> sai de ${plural(g.produtos.length, 'produto', 'produtos')}. Pedidos já feitos não mudam. O grupo fica em Excluídos e pode voltar.`, botao: 'Excluir grupo', perigo: true });
          if (!ok) return;
          e.grupos.splice(e.grupos.indexOf(g), 1);
          e.produtos.forEach(p => { p.grupos = p.grupos.filter(x => x !== g.id); });
          BA.salvar(); this.pintar();
          BA.toast(`Grupo ${g.nome} excluído.`, 'info');
        }
      });
    },
    pintar(focar, destacar) {
      const root = this.root;
      if (!root?.isConnected) return;
      const e = E();
      const n = { todos: e.grupos.length, obrig: e.grupos.filter(g => g.obrigatorio).length, opc: e.grupos.filter(g => !g.obrigatorio).length };
      $('[data-filtros]', root).innerHTML = [['todos', 'Todos'], ['obrig', 'Obrigatórios'], ['opc', 'Opcionais']].map(([v, t]) => `<button class="chip" type="button" data-filtro="${v}" aria-pressed="${this.filtro === v}">${t}<span class="chip__n">${n[v]}</span></button>`).join('');
      const lista = e.grupos.filter(g => this.filtro === 'todos' || (this.filtro === 'obrig' ? g.obrigatorio : !g.obrigatorio));
      $('[data-grade]', root).innerHTML = lista.length ? lista.map(g => {
        const prods = g.produtos.map(id => e.produtos.find(p => p.id === id)).filter(Boolean);
        const nomes = prods.slice(0, 2).map(p => esc(p.nome)).join(', ');
        return `<article class="card grp${g.ativo ? '' : ' is-inactive'}" data-id="${g.id}">
          <div class="grp__head">
            <div><h3 class="grp__name">${esc(g.nome)}</h3>
              <div class="grp__rules"><span class="pill ${g.obrigatorio ? 'pill--orange' : 'pill--muted'}">${g.obrigatorio ? 'Obrigatório' : 'Opcional'}</span><span class="pill pill--muted pill--plain">Mín. ${g.min} · Máx. ${g.max}</span><span class="pill pill--muted pill--plain">${g.tipo === 'unico' ? 'Escolha única' : `Escolha até ${g.max}`}</span></div>
            </div>
            <div class="row-acts">
              <button class="btn-icon btn-icon--sm" type="button" data-editar="${g.id}" aria-label="Editar grupo ${esc(g.nome)}" title="Editar">${icone('pencil')}</button>
              <button class="btn-icon btn-icon--sm" type="button" data-excluir="${g.id}" aria-label="Excluir grupo ${esc(g.nome)}" title="Excluir">${icone('trash')}</button>
            </div>
          </div>
          <ul class="grp__opts" aria-label="Opções">${g.opcoes.map(o => `<li><span>${esc(o.nome)}</span>${o.preco ? `<span class="paid">+ ${brl(o.preco)}</span>` : '<span class="free">Grátis</span>'}</li>`).join('')}</ul>
          <div class="grp__prods"><span class="avs" aria-hidden="true">${prods.slice(0, 5).map(p => `<img src="${fotoProduto(p)}" alt="" width="30" height="30" loading="lazy">`).join('')}</span><span class="muted" style="font-size:13px">${prods.length ? `${nomes}${prods.length > 2 ? ` e mais ${prods.length - 2}` : ''}` : 'Nenhum produto usa este grupo.'}</span></div>
          <div class="grp__foot">${BA.interruptor({ id: `ga-${g.id}`, rotulo: g.ativo ? 'Ativo' : 'Inativo', marcado: g.ativo, attrs: `data-ativo="${g.id}"`, classe: 'switch--green' })}<span class="muted" style="font-size:13px">Usado em ${plural(prods.length, 'produto', 'produtos')}</span></div>
        </article>`;
      }).join('') : `<div style="grid-column:1/-1">${BA.vazio({ icone: 'sliders', titulo: 'Nenhum grupo aqui', texto: 'Crie um grupo para oferecer adicionais ou personalizações.', acao: '<button class="btn btn--primary" type="button" data-novo>' + icone('plus') + 'Novo grupo</button>' })}</div>`;
      if (focar) $(`#${focar}`, root)?.focus();
      if (destacar) { const c = $(`.grp[data-id="${destacar}"]`, root); c?.scrollIntoView({ block: 'center', behavior: BA.suave() }); c?.animate([{ boxShadow: '0 0 0 3px rgba(247,116,29,.7)' }, { boxShadow: '0 0 0 0 rgba(247,116,29,0)' }], { duration: 1400 }); }
    },
    sair() {},
  };

  function formGrupo(g, depois) {
    const e = E();
    const novo = !g;
    const opcoes = g ? g.opcoes.map(o => ({ ...o })) : [{ nome: '', preco: 0 }];
    const d = BA.janela({
      tamanho: 'lg', titulo: novo ? 'Novo grupo de adicionais' : 'Editar grupo', sub: novo ? 'Ex.: Molhos, Extras, Ponto da carne.' : esc(g.nome),
      corpo: `<form novalidate>
        <div class="form-sec">
          <div class="form-grid">
            ${BA.campo({ id: 'gr-nome', rotulo: 'Nome do grupo', valor: g?.nome || '', obrigatorio: true, classe: 'span-2', attrs: 'maxlength="40" autocomplete="off"' })}
            <div class="span-2">${BA.linhaInterruptor({ id: 'gr-obrig', rotulo: 'Escolha obrigatória', desc: 'O cliente precisa escolher antes de adicionar à sacola.', marcado: g?.obrigatorio || false })}</div>
            <div class="choices span-2" style="grid-template-columns:repeat(2,minmax(0,1fr))" role="radiogroup" aria-label="Tipo de seleção">
              <label class="choice"><input type="radio" name="gr-tipo" value="unico"${(g?.tipo || 'multiplo') === 'unico' ? ' checked' : ''}><span class="choice__ic">${icone('target')}</span><span><span class="choice__t">Escolha única</span><span class="choice__d" style="display:block">Uma opção só (ex.: ponto da carne)</span></span></label>
              <label class="choice"><input type="radio" name="gr-tipo" value="multiplo"${(g?.tipo || 'multiplo') === 'multiplo' ? ' checked' : ''}><span class="choice__ic">${icone('layers')}</span><span><span class="choice__t">Escolha múltipla</span><span class="choice__d" style="display:block">Várias opções, até o máximo</span></span></label>
            </div>
            ${BA.campo({ id: 'gr-min', rotulo: 'Mínimo de escolhas', tipo: 'number', valor: g?.min ?? 0, attrs: 'min="0" max="20" inputmode="numeric"' })}
            ${BA.campo({ id: 'gr-max', rotulo: 'Máximo de escolhas', tipo: 'number', valor: g?.max ?? 2, attrs: 'min="1" max="20" inputmode="numeric"' })}
          </div>
        </div>
        <div class="form-sec">
          <p class="form-sec__t">Opções e preços</p>
          <p class="form-sec__d">Deixe o preço em 0,00 para opções sem custo.</p>
          <div class="opt-rows" data-opcoes></div>
          <button class="btn btn--ghost btn--sm" type="button" data-add-op style="justify-self:start">${icone('plus')}Adicionar opção</button>
        </div>
        <div class="form-sec">
          <p class="form-sec__t">Produtos associados</p>
          <div class="toolbar"><div class="search" style="width:min(100%,280px)">${icone('search')}<input class="inp" type="search" id="gr-busca" placeholder="Filtrar produtos" aria-label="Filtrar produtos"></div><div class="toolbar__r" style="width:auto"><button class="btn btn--ghost btn--sm" type="button" data-todos>Marcar todos</button><button class="btn btn--ghost btn--sm" type="button" data-nenhum>Limpar</button></div></div>
          <div class="pick-list" data-prods>${e.produtos.map(p => `<label class="chk" data-nome="${esc(normal(p.nome))}"><input type="checkbox" name="gr-prod" value="${p.id}"${g?.produtos.includes(p.id) ? ' checked' : ''}><span class="chk__box" aria-hidden="true">${icone('check')}</span><img src="${fotoProduto(p)}" alt="" width="28" height="28" loading="lazy"><span>${esc(p.nome)}</span></label>`).join('')}</div>
        </div>
        <div class="form-sec">${BA.linhaInterruptor({ id: 'gr-ativo', rotulo: 'Grupo ativo', desc: 'Aparece no modal dos produtos associados.', marcado: g ? g.ativo : true })}</div>
      </form>`,
      rodape: '<button class="btn btn--ghost" type="button" data-fechar>Cancelar</button><button class="btn btn--primary" type="button" data-salvar>' + icone('check') + 'Salvar grupo</button>',
    });
    const box = $('[data-opcoes]', d);
    const lerOpcoes = () => $$('.opt-row', box).forEach((r, i) => { opcoes[i].nome = $('[data-on]', r).value; opcoes[i].preco = $('[data-op]', r).value; });
    const pintarOpcoes = () => {
      box.innerHTML = opcoes.map((o, i) => `<div class="opt-row">
        <div class="fld"><label class="sr-only" for="op-n-${i}">Nome da opção ${i + 1}</label><input class="inp" id="op-n-${i}" data-on value="${esc(o.nome)}" placeholder="Ex.: Bacon" aria-describedby="op-n-${i}-err" maxlength="40"><p class="fld__err" id="op-n-${i}-err" hidden></p></div>
        <div class="fld"><label class="sr-only" for="op-p-${i}">Preço da opção ${i + 1}</label><div class="affix"><span class="affix__pre">R$</span><input class="inp has-pre" id="op-p-${i}" data-op value="${BA.valorCampo(BA.lerValor(o.preco) || 0)}" inputmode="decimal" aria-describedby="op-p-${i}-err"></div><p class="fld__err" id="op-p-${i}-err" hidden></p></div>
        <button class="btn-icon" type="button" data-tira-op="${i}" aria-label="Remover opção ${i + 1}"${opcoes.length === 1 ? ' disabled' : ''}>${icone('trash')}</button>
      </div>`).join('');
    };
    pintarOpcoes();
    const ajustarTipo = () => {
      const unico = $('[name="gr-tipo"]:checked', d).value === 'unico';
      const max = $('#gr-max', d), min = $('#gr-min', d);
      if (unico) { max.value = 1; max.readOnly = true; if (+min.value > 1) min.value = 1; } else max.readOnly = false;
      if ($('#gr-obrig', d).checked && +min.value < 1) min.value = 1;
      if (!$('#gr-obrig', d).checked && unico && +min.value > 0 && novo) min.value = 0;
    };
    ajustarTipo();
    d.addEventListener('change', ev => { if (ev.target.name === 'gr-tipo' || ev.target.id === 'gr-obrig') ajustarTipo(); });
    d.addEventListener('click', ev => {
      if (ev.target.closest('[data-add-op]')) { lerOpcoes(); opcoes.push({ nome: '', preco: 0 }); pintarOpcoes(); $(`#op-n-${opcoes.length - 1}`, d).focus(); }
      const t = ev.target.closest('[data-tira-op]');
      if (t) { lerOpcoes(); opcoes.splice(+t.dataset.tiraOp, 1); pintarOpcoes(); }
      if (ev.target.closest('[data-todos]')) $$('[name="gr-prod"]', d).forEach(c => { if (!c.closest('.chk').hidden) c.checked = true; });
      if (ev.target.closest('[data-nenhum]')) $$('[name="gr-prod"]', d).forEach(c => { c.checked = false; });
    });
    $('#gr-busca', d).addEventListener('input', ev => { const q = normal(ev.target.value); $$('[data-prods] .chk', d).forEach(l => { l.hidden = q && !l.dataset.nome.includes(q); }); });
    $('[data-salvar]', d).addEventListener('click', () => {
      lerOpcoes();
      const regras = [
        ['gr-nome', v => (!v ? 'Escreva o nome do grupo.' : e.grupos.some(x => x !== g && normal(x.nome) === normal(v)) ? 'Já existe um grupo com esse nome.' : '')],
        ['gr-max', v => (!(+v >= 1) ? 'O máximo precisa ser pelo menos 1.' : +v > opcoes.length ? `O máximo não pode passar do número de opções (${opcoes.length}).` : '')],
        ['gr-min', v => { const mn = +v, mx = +$('#gr-max', d).value; if (!(mn >= 0)) return 'Use 0 ou mais.'; if (mn > mx) return 'O mínimo não pode ser maior que o máximo.'; if ($('#gr-obrig', d).checked && mn < 1) return 'Obrigatório precisa de mínimo 1.'; return ''; }],
        ...opcoes.flatMap((o, i) => [[`op-n-${i}`, v => (!v ? 'Escreva o nome da opção.' : opcoes.some((x, k) => k !== i && normal(x.nome.trim()) === normal(v)) ? 'Opção repetida.' : '')], [`op-p-${i}`, v => (v && !(BA.lerValor(v) >= 0) ? 'Use um valor como 4,90.' : '')]]),
      ];
      if (!BA.validar(d, regras)) return;
      const dados = {
        nome: $('#gr-nome', d).value.trim(), obrigatorio: $('#gr-obrig', d).checked, tipo: $('[name="gr-tipo"]:checked', d).value,
        min: +$('#gr-min', d).value, max: +$('#gr-max', d).value, ativo: $('#gr-ativo', d).checked,
        opcoes: opcoes.map(o => ({ nome: o.nome.trim(), preco: BA.r2(BA.lerValor(o.preco) || 0) })),
        produtos: $$('[name="gr-prod"]:checked', d).map(c => c.value),
      };
      let id;
      if (novo) { id = `g-${BA.slug(dados.nome) || BA.uid('g')}`; if (e.grupos.some(x => x.id === id)) id = BA.uid(id); e.grupos.push({ id, ...dados }); }
      else { Object.assign(g, dados); id = g.id; }
      e.produtos.forEach(p => {
        const quer = dados.produtos.includes(p.id), tem = p.grupos.includes(id);
        if (quer && !tem) p.grupos.push(id);
        if (!quer && tem) p.grupos = p.grupos.filter(x => x !== id);
      });
      BA.salvar(); d.close();
      BA.toast(novo ? `Grupo ${dados.nome} criado com ${plural(dados.opcoes.length, 'opção', 'opções')}.` : `Grupo ${dados.nome} salvo.`);
      depois?.(id);
    });
  }
})();
