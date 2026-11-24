/*
  Painel administrativo (porte de Painel.php): estado inicial, gravação de cada coleção com versão por item
  (conflito avisa em vez de apagar o trabalho de outra pessoa), Excluídos, configurações, operação e números.
*/
import { Erro } from '../lib/base.js';
import * as Db from '../lib/db.js';
import * as Estaticos from '../lib/estaticos.js';
import * as Imagem from '../lib/imagem.js';
import * as L from '../lib/seguranca.js';
import * as T from '../lib/tempo.js';
import * as V from '../lib/v.js';
import * as Cardapio from './cardapio.js';
import * as Config from './config.js';
import * as Cupons from './cupons.js';
import * as Horarios from './horarios.js';
import * as Pedidos from './pedidos.js';
import * as Usuarios from './usuarios.js';

type U = Usuarios.Usuario;

export const COLECOES: Record<string, string | null> = {
  categorias: 'produtos', produtos: 'produtos', grupos: 'produtos', cupons: 'cupons', areas: 'areas',
  banners: 'banners', config: 'configuracoes', logo: 'configuracoes', operacao: 'pedidos', usuarios: 'usuarios', notificacoes: null,
};
export const ICONES = ['star', 'burger', 'gift', 'utensils', 'cup', 'ice-cream', 'moon', 'layers', 'flame', 'package', 'percent', 'bag'];
export const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const LISTAS: Record<string, [string, string, () => Promise<any[]>]> = {
  categorias: ['categorias', 'nome', () => categoriasSaida()], grupos: ['grupos', 'nome', () => gruposSaida()], produtos: ['produtos', 'nome', () => produtosSaida()],
  cupons: ['cupons', 'codigo', () => cuponsSaida()], areas: ['areas', 'nome', () => areasSaida()], banners: ['banners', 'titulo', () => bannersSaida()],
};

/* ================================================================== estado inicial */

export async function estado(u: U): Promise<Record<string, unknown>> {
  const agora = T.agoraMs();
  const vePedidos = Usuarios.pode(u, 'pedidos');
  const rev = vePedidos ? await Pedidos.revAtual() : 0;
  return {
    versao: 2, ancora: agora, agora, rev,
    logo: await Cardapio.logo(),
    admin: await Usuarios.paraPainel(u),
    operacao: await operacaoSaida(await Config.operacao()),
    preferencias: { som: true },
    ...(vePedidos ? await metricas() : metricasVazias()),
    notificacoes: await notificacoes(u),
    categorias: await categoriasSaida(), produtos: await produtosSaida(), grupos: await gruposSaida(),
    cupons: Usuarios.pode(u, 'cupons') ? await cuponsSaida() : [],
    areas: await areasSaida(), banners: await bannersSaida(),
    config: await configSaida(Usuarios.pode(u, 'configuracoes')),
    usuarios: Usuarios.pode(u, 'usuarios') ? await Usuarios.lista() : [],
    pedidos: vePedidos ? await Promise.all((await Pedidos.doPainel()).map(p => Pedidos.paraAdmin(p))) : [],
    bloqueados: vePedidos ? await Pedidos.bloqueados() : [],
    entregadores: vePedidos ? await Pedidos.entregadores() : [],
    proximoNumero: 0,
  };
}

export async function novidades(desdeB: number, rev: number, u: U): Promise<Record<string, unknown>> {
  const agora = T.agoraMs();
  const desde = Math.max(0, Math.min(desdeB, agora));
  const [filtro, p] = filtroAvisos(u);
  const avisos = (await Db.todos(`SELECT * FROM notificacoes WHERE em > ?${filtro} ORDER BY id DESC LIMIT 50`, [desde, ...p])).map(notificacaoSaida);
  const pedidos = Usuarios.pode(u, 'pedidos') ? await Pedidos.novidades(rev) : [];
  return {
    agora,
    rev: pedidos.length ? Math.max(...pedidos.map(x => x.rev)) : rev,
    pedidos: await Promise.all(pedidos.map(x => Pedidos.paraAdmin(x))),
    notificacoes: avisos,
    operacao: await operacaoSaida(await Config.operacao()),
  };
}

function filtroAvisos(u: U): [string, unknown[]] {
  let sql = '';
  const p: unknown[] = [];
  if (!Usuarios.pode(u, 'pedidos')) { sql += ' AND rota <> ?'; p.push('pedidos'); }
  if (!Usuarios.pode(u, 'usuarios')) { sql += ' AND rota <> ?'; p.push(Usuarios.ROTA_ACESSOS); }
  return [sql, p];
}

function metricasVazias(): Record<string, unknown> {
  const semana = { total: 0, delta: 0, dias: [0, 0, 0, 0, 0, 0, 0] };
  return { ontem: { pedidos: 0, faturamento: 0 }, semana: { atual: semana, anterior: semana }, maisVendidos: [] };
}

const urlImagem = (chave: string): string => (chave === '' ? '' : '/' + Imagem.url(chave, 960));

/** Imagem enviada pelo painel: dado novo (data:), arquivo já enviado (/uploads/…), foto do banco do projeto ou vazio. */
async function imagemEntrada(v: unknown, ref: { foto: string }): Promise<string> {
  if (v === null || v === undefined || v === '' || v === false) return '';
  if (typeof v !== 'string') throw new Erro('Imagem inválida. Envie a imagem de novo.');
  if (v.startsWith('data:')) return Imagem.deDataUrl(v);
  let m = /(?:^|\/)uploads\/(u-[a-f0-9]{12})-(?:500|960)\.(webp|jpg)$/.exec(v);
  if (m) return m[1] + (m[2] === 'jpg' ? '-j' : '');
  m = /(?:^|\/)assets\/img\/photo-(f\d{3,12})(?:-\d+)?\.webp$/.exec(v);
  if (m) { ref.foto = m[1]; return ''; }
  throw new Erro('Imagem inválida. Envie a imagem de novo.');
}

/** Apaga do armazenamento as imagens enviadas que nenhum cadastro usa mais. */
async function limparImagens(chaves: string[]): Promise<void> {
  const logo = String(await Config.obter('logo', ''));
  for (const k of [...new Set(chaves.filter(Boolean))]) {
    if (!Imagem.PADRAO_CHAVE.test(k) || k === logo) continue;
    const uso = Number(await Db.valor('SELECT (SELECT COUNT(*) FROM produtos WHERE imagem = ?) + (SELECT COUNT(*) FROM categorias WHERE imagem = ?) + (SELECT COUNT(*) FROM banners WHERE imagem = ?)', [k, k, k]));
    if (uso > 0) continue;
    const jpg = k.endsWith('-j');
    const base = jpg ? k.slice(0, -2) : k;
    for (const w of [500, 960]) await Imagem.apagarArquivo(`${base}-${w}.${jpg ? 'jpg' : 'webp'}`);
  }
}

const dataOpc = (v: unknown, rotulo: string): string => (v === '' || v === null || v === undefined ? '' : V.data(v, rotulo));

function semRepetir(lista: any[], rotulo: string): void {
  const ids = lista.map(x => x.id);
  if (new Set(ids).size !== ids.length) throw new Erro(`Há dois itens com o mesmo identificador em ${rotulo}. Atualize a página.`, 422);
}

/** Arquiva o que saiu da lista e grava (insere ou atualiza) o resto. $manter: colunas que só valem para linhas novas. */
async function gravarTabela(tabela: string, linhas: Array<Record<string, any>>, manter: string[] = []): Promise<void> {
  const agora = T.agoraMs();
  const velhas: Record<string, any> = Object.fromEntries((await Db.todos(`SELECT * FROM ${tabela} WHERE arquivado_em IS NULL`)).map(r => [String(r.id), r]));
  const ids = linhas.map(l => String(l.id));
  for (const id of Object.keys(velhas)) {
    if (!ids.includes(id)) await Db.q(`UPDATE ${tabela} SET arquivado_em = ?, versao = versao + 1 WHERE id = ?`, [agora, id]);
  }
  const igual = (a: unknown, b: unknown): boolean => {
    if (V.numerico(a) && V.numerico(b)) return parseFloat(String(a)) === parseFloat(String(b));
    return String(a ?? '') === String(b ?? '');
  };
  for (const l0 of linhas) {
    const l = { ...l0 };
    const v = velhas[l.id] ?? null;
    let mudou = !v;
    if (v) for (const [c, x] of Object.entries(l)) {
      if (['id', 'ordem', 'atualizado_em'].includes(c) || manter.includes(c)) continue;
      if (!igual(x, v[c] ?? null)) { mudou = true; break; }
    }
    if (v && !mudou && 'atualizado_em' in l) l.atualizado_em = Number(v.atualizado_em);
    l.versao = v ? Number(v.versao) + (mudou ? 1 : 0) : 1;
    l.arquivado_em = null;
    const cols = Object.keys(l);
    const sets = cols.filter(c => c !== 'id' && !manter.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ');
    await Db.q(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${Db.marcas(cols)}) ON CONFLICT (id) DO UPDATE SET ${sets}`, Object.values(l));
  }
}

/** Junta o que o painel mandou (só o que mudou, com a versão) com o que está no banco; conflito → 409. */
async function mesclar(nome: string, mB: unknown): Promise<any[]> {
  const [tabela, campo, saida] = LISTAS[nome];
  const m = V.objeto(mB, 'as mudanças');
  await Db.todos(`SELECT id FROM ${tabela} FOR UPDATE`);
  const porId = new Map<string, any>((await saida()).map(x => [x.id, x]));
  const nomeDe = (x: any): string => String(x?.[campo] ?? 'um item');
  const conflito = async (msg: string): Promise<never> => { throw new Erro(msg, 409, null, { dados: await saida(), colecao: nome }); };
  for (const bruto of V.lista(m.alterados ?? [], 'as mudanças', 400)) {
    const it = V.objeto(bruto, 'um item');
    const id = V.id(it.id ?? null, 'um item');
    if (porId.has(id)) {
      if (Math.trunc(Number(it.versao ?? -1)) !== Number(porId.get(id).versao)) {
        await conflito('Outra pessoa alterou "' + nomeDe(porId.get(id)) + '" enquanto você editava. A lista foi atualizada: confira e refaça a sua mudança.');
      }
    } else if (it.versao !== undefined && it.versao !== null) {
      await conflito('"' + nomeDe(it) + '" foi excluído por outra pessoa enquanto você editava. A lista foi atualizada.');
    }
    porId.set(id, it);
  }
  for (const bruto of V.lista(m.removidos ?? [], 'as exclusões', 400)) {
    const x = V.objeto(bruto, 'uma exclusão');
    const id = V.id(x.id ?? null, 'um item');
    if (!porId.has(id)) continue;
    if (Math.trunc(Number(x.versao ?? -1)) !== Number(porId.get(id).versao)) {
      await conflito('Outra pessoa alterou "' + nomeDe(porId.get(id)) + '" enquanto você excluía. A lista foi atualizada.');
    }
    porId.delete(id);
  }
  const lista: any[] = [];
  for (const id of V.lista(m.ordem ?? [], 'a ordem', 1000)) {
    if (typeof id === 'string' && porId.has(id)) { lista.push(porId.get(id)); porId.delete(id); }
  }
  for (const it of porId.values()) lista.push(it);
  return lista;
}

/* ================================================================== Excluídos */

export async function excluidos(nome: string, u: U): Promise<any[]> {
  if (!LISTAS[nome]) throw new Erro('Coleção desconhecida.', 404);
  await Usuarios.exigir(COLECOES[nome]);
  const [tabela, campo] = LISTAS[nome];
  return (await Db.todos(`SELECT id, ${campo}, arquivado_em FROM ${tabela} WHERE arquivado_em IS NOT NULL ORDER BY arquivado_em DESC LIMIT 100`))
    .map(r => ({ id: r.id, nome: r[campo], em: Number(r.arquivado_em) }));
}

export async function restaurar(nome: string, idB: unknown, u: U): Promise<any[]> {
  if (!LISTAS[nome]) throw new Erro('Coleção desconhecida.', 404);
  await Usuarios.exigir(COLECOES[nome]);
  const [tabela, , saida] = LISTAS[nome];
  const id = V.id(idB, 'o item');
  await Db.tx(async () => {
    const r = await Db.um(`SELECT * FROM ${tabela} WHERE id = ? AND arquivado_em IS NOT NULL FOR UPDATE`, [id]);
    if (!r) throw new Erro('Esse item não está mais em Excluídos. Atualize a página.', 409);
    if (nome === 'cupons' && Number(await Db.valor('SELECT COUNT(*) FROM cupons WHERE codigo = ? AND arquivado_em IS NULL', [r.codigo]))) {
      throw new Erro('Já existe um cupom ' + r.codigo + ' ativo. Mude o código dele antes de restaurar este.', 422);
    }
    const ordem = Number(await Db.valor(`SELECT COALESCE(MAX(ordem), 0) + 1 FROM ${tabela} WHERE arquivado_em IS NULL`));
    await Db.q(`UPDATE ${tabela} SET arquivado_em = NULL, versao = versao + 1, ordem = ? WHERE id = ?`, [ordem, id]);
    await L.registrar(u.id, 'restaurar.' + nome, nome, id);
  });
  Cardapio.esquecer();
  return saida();
}

/* ================================================================== gravar uma coleção */

export async function salvarColecao(nome: string, dados: unknown, u: U, extra: Record<string, any> = {}): Promise<unknown> {
  if (!(nome in COLECOES)) throw new Erro('Coleção desconhecida.', 404);
  const perm = COLECOES[nome];
  if (perm !== null) await Usuarios.exigir(perm);
  const salvarLista = (n: string, d: unknown): Promise<unknown> => {
    switch (n) {
      case 'categorias': return salvarCategorias(d);
      case 'produtos': return salvarProdutos(d);
      case 'grupos': return salvarGrupos(d);
      case 'cupons': return salvarCupons(d);
      case 'areas': return salvarAreas(d);
      default: return salvarBanners(d);
    }
  };
  if (LISTAS[nome]) {
    if (!('mudancas' in extra)) throw new Erro('O painel foi atualizado. Recarregue a página para continuar.', 409, null, { recarregar: true });
    return Db.tx(async () => {
      const lista = await mesclar(nome, extra.mudancas);
      const r = await salvarLista(nome, lista);
      await L.registrar(u.id, 'salvar.' + nome, nome);
      Cardapio.esquecer();
      Config.esquecer();
      return r;
    });
  }
  let r: unknown;
  switch (nome) {
    case 'config': r = await salvarConfig(dados, u); break;
    case 'logo': r = await salvarLogo(dados); break;
    case 'operacao': r = await salvarOperacao(dados, u); break;
    case 'usuarios': r = await Usuarios.salvarLista(dados, u, extra.senhaAtual ?? null); break;
    default: r = await salvarNotificacoes(dados, u);
  }
  if (nome !== 'notificacoes') await L.registrar(u.id, 'salvar.' + nome, nome);
  Cardapio.esquecer();
  Config.esquecer();
  return r;
}

/* ------------------------------------------------------------------ categorias */

export async function categoriasSaida(): Promise<any[]> {
  return (await Cardapio.categorias()).map(c => ({ id: c.id, nome: c.nome, descricao: c.descricao, icone: c.icone, imagem: urlImagem(c.imagem), ativa: c.ativa, especial: c.especial, versao: c.versao }));
}

export async function salvarCategorias(dados: unknown): Promise<any[]> {
  const lista = V.lista(dados, 'as categorias', 60);
  const velhas = Cardapio.porId(await Cardapio.categorias());
  const linhas: any[] = [];
  const trocadas: string[] = [];
  for (let i = 0; i < lista.length; i++) {
    const c = V.objeto(lista[i], 'uma categoria');
    const id = V.id(c.id ?? null, 'a categoria');
    const ref = { foto: '' };
    const img = await imagemEntrada(c.imagem ?? '', ref);
    if (velhas[id] && velhas[id].imagem !== img) trocadas.push(velhas[id].imagem);
    const icone = typeof c.icone === 'string' && /^[a-z-]{1,20}$/.test(c.icone) ? c.icone : 'layers';
    linhas.push({
      id, nome: V.texto(c.nome ?? '', 'o nome da categoria', 2, 60), descricao: V.texto(c.descricao ?? '', 'a descrição da categoria', 0, 200),
      icone, imagem: img, ativa: V.bool(c.ativa ?? true) ? 1 : 0, especial: velhas[id]?.especial ? 1 : 0, ordem: i,
    });
  }
  semRepetir(linhas, 'categorias');
  for (const [id, v] of Object.entries(velhas)) if (!linhas.some(l => l.id === id)) trocadas.push(v.imagem);
  await Db.tx(() => gravarTabela('categorias', linhas));
  await limparImagens(trocadas);
  Cardapio.esquecer();
  return categoriasSaida();
}

/* ------------------------------------------------------------------ produtos */

export async function produtosSaida(): Promise<any[]> {
  return (await Cardapio.produtos()).map(p => ({
    id: p.id, nome: p.nome, categoria: p.categoria, preco: T.reais(p.preco), promo: T.reais(p.promo),
    descricao: p.descricao, ingredientes: p.ingredientes, grupos: p.grupos, preparo: p.preparo, codigo: p.codigo,
    ativo: p.ativo, destaque: p.destaque, esgotado: p.esgotado, foto: p.foto, so500: p.foto !== '' && !Estaticos.existe(`assets/img/photo-${p.foto}-960.webp`),
    imagem: p.imagem === '' ? '' : '/' + Imagem.url(p.imagem, 960), alt: p.alt, selo: p.selo, versao: p.versao,
  }));
}

export async function salvarProdutos(dados: unknown): Promise<any[]> {
  const lista = V.lista(dados, 'os produtos', 300);
  const velhos = Cardapio.porId(await Cardapio.produtos());
  const gruposIds = (await Cardapio.grupos()).map(g => g.id);
  const linhas: any[] = [];
  const trocadas: string[] = [];
  const agora = T.agoraMs();
  for (let i = 0; i < lista.length; i++) {
    const p = V.objeto(lista[i], 'um produto');
    const id = V.id(p.id ?? null, 'o produto');
    const nome = V.texto(p.nome ?? '', 'o nome do produto', 2, 80);
    const preco = V.centavosN(p.preco ?? null, `o preço de ${nome}`, 1_000_000);
    if (preco < 1) throw new Erro(`Informe o preço de ${nome}.`, 422);
    let promo = V.centavos(p.promo ?? null, `o preço promocional de ${nome}`, 1_000_000, true);
    if (promo !== null && (promo <= 0 || promo >= preco)) promo = null;
    const ref = { foto: typeof p.foto === 'string' && /^f\d{3,12}$/.test(p.foto) ? p.foto : '' };
    const img = await imagemEntrada(p.imagem ?? '', ref);
    const velho = velhos[id] ?? null;
    if (velho && velho.imagem !== img) trocadas.push(velho.imagem);
    const ingr = V.lista(p.ingredientes ?? [], 'os ingredientes', 30).map(x => V.texto(x, 'um ingrediente', 1, 60));
    const grupos = [...new Set(V.lista(p.grupos ?? [], 'os grupos', 20).map(x => V.id(x, 'um grupo')).filter(g => gruposIds.includes(g)))];
    let alt = V.texto(p.alt ?? '', 'o texto da foto', 0, 200);
    if (velho && (velho.foto !== ref.foto || img !== '')) alt = '';
    linhas.push({
      id, nome, categoria_id: V.id(p.categoria ?? null, `a categoria de ${nome}`), preco, promo,
      descricao: V.texto(p.descricao ?? '', `a descrição de ${nome}`, 0, 400), ingredientes: JSON.stringify(ingr.filter(Boolean)),
      grupos: JSON.stringify(grupos), preparo: V.inteiro(p.preparo ?? 12, `o tempo de preparo de ${nome}`, 0, 240),
      codigo: V.texto(p.codigo ?? '', `o código de ${nome}`, 0, 20), ativo: V.bool(p.ativo ?? true) ? 1 : 0,
      destaque: V.bool(p.destaque ?? false) ? 1 : 0, esgotado: V.bool(p.esgotado ?? false) ? 1 : 0,
      foto: ref.foto, imagem: img, alt, selo: V.texto(p.selo ?? '', `o selo de ${nome}`, 0, 30), ordem: i, atualizado_em: agora,
    });
  }
  semRepetir(linhas, 'produtos');
  for (const [id, v] of Object.entries(velhos)) if (!linhas.some(l => l.id === id)) trocadas.push(v.imagem);
  await Db.tx(() => gravarTabela('produtos', linhas));
  await limparImagens(trocadas);
  Cardapio.esquecer();
  return produtosSaida();
}

/* ------------------------------------------------------------------ grupos de adicionais */

export async function gruposSaida(): Promise<any[]> {
  const donos: Record<string, string[]> = {};
  for (const p of await Cardapio.produtos()) for (const g of p.grupos) (donos[g] ??= []).push(p.id);
  return (await Cardapio.grupos()).map(g => ({ id: g.id, nome: g.nome, obrigatorio: g.obrigatorio, tipo: g.tipo, min: g.min, max: g.max, ativo: g.ativo,
    opcoes: g.opcoes.map((o: any) => ({ id: o.id, nome: o.nome, preco: T.reais(o.preco) })), produtos: donos[g.id] ?? [], versao: g.versao }));
}

export async function salvarGrupos(dados: unknown): Promise<any[]> {
  const lista = V.lista(dados, 'os grupos de adicionais', 100);
  const linhas: any[] = [];
  const vinculos: Record<string, string[]> = {};
  for (let i = 0; i < lista.length; i++) {
    const g = V.objeto(lista[i], 'um grupo');
    const id = V.id(g.id ?? null, 'o grupo');
    const nome = V.texto(g.nome ?? '', 'o nome do grupo', 2, 60);
    const ops: any[] = [];
    const vistos = new Set<string>();
    for (const bruto of V.lista(g.opcoes ?? [], `as opções de ${nome}`, 40)) {
      const o = V.objeto(bruto, `uma opção de ${nome}`);
      const on = V.texto(o.nome ?? '', `o nome de uma opção de ${nome}`, 1, 60);
      const k = Cardapio.slug(on);
      if (vistos.has(k)) throw new Erro(`Há duas opções chamadas "${on}" em ${nome}.`, 422);
      vistos.add(k);
      ops.push({ nome: on, preco: V.centavosN(o.preco ?? 0, `o preço de ${on}`, 100_000) });
    }
    if (!ops.length) throw new Erro(`Cadastre pelo menos uma opção em ${nome}.`, 422);
    const tipo = V.opcao(g.tipo ?? 'multiplo', ['unico', 'multiplo'] as const, `o tipo de ${nome}`);
    const obrig = V.bool(g.obrigatorio ?? false);
    const max = tipo === 'unico' ? 1 : Math.max(1, Math.min(V.inteiro(g.max ?? 1, `o máximo de ${nome}`, 1, 40), ops.length));
    const min = obrig ? Math.max(1, Math.min(V.inteiro(g.min ?? 1, `o mínimo de ${nome}`, 0, 40), max)) : 0;
    linhas.push({ id, nome, obrigatorio: obrig ? 1 : 0, tipo, min_escolhas: min, max_escolhas: max, ativo: V.bool(g.ativo ?? true) ? 1 : 0, opcoes: JSON.stringify(ops), ordem: i });
    vinculos[id] = V.lista(g.produtos ?? [], `os produtos de ${nome}`, 300).map(x => V.id(x, 'um produto'));
  }
  semRepetir(linhas, 'grupos');
  await Db.tx(async () => {
    await gravarTabela('grupos', linhas);
    for (const p of await Db.todos('SELECT id, grupos FROM produtos WHERE arquivado_em IS NULL FOR UPDATE')) {
      let atual: string[] = [];
      try { const x = JSON.parse(p.grupos); atual = Array.isArray(x) ? x : []; } catch { atual = []; }
      const novo: string[] = [];
      for (const gid of atual) if (vinculos[gid] && vinculos[gid].includes(p.id)) novo.push(gid);
      for (const [gid, prods] of Object.entries(vinculos)) if (prods.includes(p.id) && !novo.includes(gid)) novo.push(gid);
      if (JSON.stringify(novo) !== JSON.stringify(atual)) await Db.q('UPDATE produtos SET grupos = ?, versao = versao + 1 WHERE id = ?', [JSON.stringify(novo), p.id]);
    }
  });
  Cardapio.esquecer();
  return gruposSaida();
}

/* ------------------------------------------------------------------ cupons */

export async function cuponsSaida(): Promise<any[]> {
  return (await Cupons.todos()).map(c => ({ id: c.id, codigo: c.codigo, tipo: c.tipo, valor: c.tipo === 'fixo' ? T.reais(c.valor) : c.valor, minimo: T.reais(c.minimo),
    usos: c.usos, limite: c.limite, porCliente: c.porCliente, inicio: c.inicio, validade: c.validade, habilitado: c.habilitado, descricao: c.descricao, versao: c.versao }));
}

export async function salvarCupons(dados: unknown): Promise<any[]> {
  const lista = V.lista(dados, 'os cupons', 200);
  const linhas: any[] = [];
  const codigos = new Set<string>();
  for (let i = 0; i < lista.length; i++) {
    const c = V.objeto(lista[i], 'um cupom');
    const id = V.id(c.id ?? null, 'o cupom');
    const codigo = Cupons.normalizarCodigo(c.codigo ?? '');
    if (codigo.length < 3 || codigo.length > 30) throw new Erro('O código do cupom precisa ter de 3 a 30 letras ou números.', 422);
    if (codigos.has(codigo)) throw new Erro(`Já existe um cupom com o código ${codigo}.`, 422);
    codigos.add(codigo);
    const tipo = V.opcao(c.tipo ?? '', Cupons.TIPOS, `o tipo do cupom ${codigo}`);
    const valor = tipo === 'percentual' ? V.inteiro(c.valor ?? null, `o percentual de ${codigo}`, 1, 100) : tipo === 'fixo' ? V.centavosN(c.valor ?? null, `o valor de ${codigo}`, 100_000) : 0;
    if (tipo === 'fixo' && valor < 1) throw new Erro(`Informe o valor do cupom ${codigo}.`, 422);
    const limite = c.limite === null || c.limite === undefined || c.limite === '' ? null : V.inteiro(c.limite, `o limite de usos de ${codigo}`, 1, 1_000_000);
    const inicio = dataOpc(c.inicio ?? '', `o início de ${codigo}`);
    const validade = dataOpc(c.validade ?? '', `a validade de ${codigo}`);
    if (inicio !== '' && validade !== '' && validade < inicio) throw new Erro(`A validade de ${codigo} precisa ser depois do início.`, 422);
    linhas.push({
      id, codigo, tipo, valor, minimo: V.centavosN(c.minimo ?? 0, `o pedido mínimo de ${codigo}`, 10_000_000),
      usos: 0, limite, por_cliente: V.inteiro(c.porCliente ?? 1, `o uso por cliente de ${codigo}`, 0, 1000),
      inicio, validade, habilitado: V.bool(c.habilitado ?? true) ? 1 : 0, descricao: V.texto(c.descricao ?? '', `a descrição de ${codigo}`, 0, 200), ordem: i,
    });
  }
  semRepetir(linhas, 'cupons');
  await Db.tx(() => gravarTabela('cupons', linhas, ['usos']));
  return cuponsSaida();
}

/* ------------------------------------------------------------------ áreas de entrega */

export async function areasSaida(): Promise<any[]> {
  return (await Cardapio.areas()).map(a => ({ id: a.id, nome: a.nome, taxa: T.reais(a.taxa), tempoExtra: a.tempoExtra, minimo: T.reais(a.minimo), ativa: a.ativa,
    cobertura: a.cobertura, cepIni: a.cepIni, cepFim: a.cepFim, raio: a.raio, versao: a.versao }));
}

export async function salvarAreas(dados: unknown): Promise<any[]> {
  const lista = V.lista(dados, 'as áreas de entrega', 100);
  const linhas: any[] = [];
  const cep = (v: unknown, rotulo: string): string => {
    if (v === '' || v === null || v === undefined) return '';
    if (typeof v !== 'string' || !/^\d{5}-?\d{3}$/.test(v)) throw new Erro(`Use o formato 00000-000 em ${rotulo}.`, 422);
    const d = v.replace('-', '');
    return d.slice(0, 5) + '-' + d.slice(5);
  };
  for (let i = 0; i < lista.length; i++) {
    const a = V.objeto(lista[i], 'uma área');
    const nome = V.texto(a.nome ?? '', 'o nome do bairro', 2, 60);
    const raio = V.numerico(a.raio ?? 0) ? Math.round(parseFloat(String(a.raio ?? 0)) * 10) / 10 : 0;
    linhas.push({
      id: V.id(a.id ?? null, 'a área'), nome, taxa: V.centavosN(a.taxa ?? 0, `a taxa de ${nome}`, 100_000),
      tempo_extra: V.inteiro(a.tempoExtra ?? 0, `o tempo extra de ${nome}`, 0, 180), minimo: V.centavosN(a.minimo ?? 0, `o pedido mínimo de ${nome}`, 10_000_000),
      ativa: V.bool(a.ativa ?? true) ? 1 : 0, cobertura: V.opcao(a.cobertura ?? 'raio', ['cep', 'raio'] as const, `a cobertura de ${nome}`),
      cep_ini: cep(a.cepIni ?? '', `o CEP inicial de ${nome}`), cep_fim: cep(a.cepFim ?? '', `o CEP final de ${nome}`),
      raio: Math.max(0, Math.min(99, raio)), ordem: i,
    });
  }
  semRepetir(linhas, 'áreas');
  await Db.tx(() => gravarTabela('areas', linhas));
  Cardapio.esquecer();
  return areasSaida();
}

/* ------------------------------------------------------------------ banners */

export async function bannersSaida(): Promise<any[]> {
  return (await Db.todos('SELECT * FROM banners WHERE arquivado_em IS NULL ORDER BY ordem, titulo')).map(b => ({ id: b.id, titulo: b.titulo, texto: b.texto, foto: b.foto,
    imagem: b.imagem === '' ? '' : '/' + Imagem.url(b.imagem, 960), destino: b.destino, inicio: b.inicio, fim: b.fim,
    status: b.status, ordem: Number(b.ordem), desktop: !!Number(b.desktop), mobile: !!Number(b.mobile), versao: Number(b.versao) }));
}

export async function salvarBanners(dados: unknown): Promise<any[]> {
  const lista = V.lista(dados, 'os banners', 50);
  const velhos: Record<string, string> = Object.fromEntries((await Db.todos('SELECT id, imagem FROM banners WHERE arquivado_em IS NULL')).map(r => [r.id, r.imagem]));
  const linhas: any[] = [];
  const trocadas: string[] = [];
  for (let i = 0; i < lista.length; i++) {
    const b = V.objeto(lista[i], 'um banner');
    const id = V.id(b.id ?? null, 'o banner');
    const titulo = V.texto(b.titulo ?? '', 'o título do banner', 2, 80);
    const ref = { foto: typeof b.foto === 'string' && /^f\d{3,12}$/.test(b.foto) ? b.foto : '' };
    const img = await imagemEntrada(b.imagem ?? '', ref);
    if (id in velhos && velhos[id] !== img) trocadas.push(velhos[id]);
    const inicio = dataOpc(b.inicio ?? '', `o início de ${titulo}`);
    const fim = dataOpc(b.fim ?? '', `o fim de ${titulo}`);
    if (inicio !== '' && fim !== '' && fim < inicio) throw new Erro(`O fim de ${titulo} precisa ser depois do início.`, 422);
    const destino = V.texto(b.destino ?? '', `o destino de ${titulo}`, 0, 100);
    if (destino !== '' && !/^(categoria|produto|cupom):[A-Za-z0-9_-]{1,60}$/.test(destino)) throw new Erro(`Destino inválido em ${titulo}.`, 422);
    linhas.push({ id, titulo, texto: V.texto(b.texto ?? '', `o texto de ${titulo}`, 0, 200), foto: ref.foto, imagem: img,
      destino, inicio, fim, status: V.opcao(b.status ?? 'ativo', ['ativo', 'agendado', 'encerrado'] as const, `o status de ${titulo}`),
      ordem: i, desktop: V.bool(b.desktop ?? true) ? 1 : 0, mobile: V.bool(b.mobile ?? true) ? 1 : 0 });
  }
  semRepetir(linhas, 'banners');
  for (const [id, img] of Object.entries(velhos)) if (!linhas.some(l => l.id === id)) trocadas.push(img);
  await Db.tx(() => gravarTabela('banners', linhas));
  await limparImagens(trocadas);
  return bannersSaida();
}

/* ------------------------------------------------------------------ configurações */

export async function configSaida(completo = true): Promise<Record<string, unknown>> {
  const c = await Config.todas();
  const pag: Record<string, any> = { ...(c.pagamentos ?? {}) };
  if (!completo) delete pag.chavePix;
  return { loja: c.loja ?? [], horarios: c.horarios ?? [], excecoes: c.excecoes ?? [], pagamentos: pag,
    entrega: c.entrega ?? [], notif: completo ? (c.notif ?? []) : [],
    privacidade: await privacidade(), seguranca: { exigir2fa: !!(c.seguranca ?? {}).exigir2fa } };
}

export async function privacidade(): Promise<Record<string, unknown>> {
  const p = await Config.obj('privacidade');
  return { encarregadoNome: String(p.encarregadoNome ?? ''), encarregadoEmail: String(p.encarregadoEmail ?? ''),
    encarregadoTelefone: String(p.encarregadoTelefone ?? ''), prazoMeses: Math.trunc(Number(p.prazoMeses ?? 24)) };
}

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export async function salvarConfig(dados: unknown, u: U | null = null): Promise<Record<string, unknown>> {
  const d = V.objeto(dados, 'as configurações');
  const l: any = typeof d.loja === 'object' && d.loja !== null ? d.loja : {};
  const digitos = (v: unknown): string => (typeof v === 'string' ? v : '').replace(/\D/g, '');
  const cnpj = digitos(l.cnpj ?? '');
  if (cnpj !== '' && cnpj.length !== 14) throw new Erro('O CNPJ tem 14 números.', 422);
  const tel = digitos(l.telefone ?? '');
  if (tel !== '' && (tel.length < 10 || tel.length > 11)) throw new Erro('Escreva o telefone com DDD.', 422);
  const loja = {
    nome: V.texto(l.nome ?? '', 'o nome da loja', 2, 80), razao: V.texto(l.razao ?? '', 'a razão social', 0, 120),
    cnpj: cnpj === '' ? '' : `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`,
    telefone: tel === '' ? '' : Pedidos.foneExibicao(tel), whatsapp: Pedidos.foneExibicao(V.telefone(l.whatsapp ?? '', 'o WhatsApp da loja', null)),
    email: (l.email ?? '') === '' ? '' : V.email(l.email), cep: V.texto(l.cep ?? '', 'o CEP', 0, 9),
    rua: V.texto(l.rua ?? '', 'a rua', 2, 120), numero: V.texto(l.numero ?? '', 'o número', 1, 12), bairro: V.texto(l.bairro ?? '', 'o bairro', 2, 60),
    cidade: V.texto(l.cidade ?? '', 'a cidade', 2, 60), uf: V.opcao(l.uf ?? 'SP', UFS, 'o estado'),
    slogan1: V.texto(l.slogan1 ?? '', 'a primeira linha da frase do topo', 0, 40), slogan2: V.texto(l.slogan2 ?? '', 'a segunda linha da frase do topo', 0, 40),
    apoio: V.texto(l.apoio ?? '', 'o texto de apoio do topo', 0, 160), descricao: V.texto(l.descricao ?? '', 'a descrição curta', 0, 120),
    botao: V.texto(l.botao ?? '', 'o texto do botão do topo', 0, 30),
  };
  const hs = V.lista(d.horarios ?? null, 'os horários', 7);
  if (hs.length !== 7) throw new Erro('Informe os horários dos 7 dias da semana.', 422);
  const horarios = hs.map((h0, i) => {
    const h = V.objeto(h0, 'um horário');
    return { dia: DIAS[i], aberto: V.bool(h.aberto ?? false), abre: V.hora(h.abre ?? '18:00', 'a abertura de ' + DIAS[i]), fecha: V.hora(h.fecha ?? '23:30', 'o fechamento de ' + DIAS[i]) };
  });
  const excecoes = V.lista(d.excecoes ?? [], 'as exceções', 80).map(x0 => {
    const x = V.objeto(x0, 'uma exceção');
    const tipo = V.opcao(x.tipo ?? 'fechado', ['fechado', 'especial'] as const, 'o tipo da exceção');
    return { id: V.id(x.id ?? null, 'a exceção'), data: V.data(x.data ?? null, 'a data da exceção'), descricao: V.texto(x.descricao ?? '', 'a descrição da exceção', 1, 60), tipo,
      abre: tipo === 'especial' ? V.hora(x.abre ?? '', 'a abertura da exceção') : '', fecha: tipo === 'especial' ? V.hora(x.fecha ?? '', 'o fechamento da exceção') : '' };
  }).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const p: any = typeof d.pagamentos === 'object' && d.pagamentos !== null ? d.pagamentos : {};
  const pag = { pix: V.bool(p.pix ?? false), chavePix: V.texto(p.chavePix ?? '', 'a chave Pix', 0, 80), credito: V.bool(p.credito ?? false),
    debito: V.bool(p.debito ?? false), bandeiras: V.lista(p.bandeiras ?? [], 'as bandeiras', 20).map(b => V.texto(b, 'uma bandeira', 1, 30)),
    dinheiro: V.bool(p.dinheiro ?? false), troco: V.bool(p.troco ?? false), naEntrega: true, online: false };
  if (!pag.pix && !pag.credito && !pag.debito && !pag.dinheiro) throw new Erro('Deixe pelo menos uma forma de pagamento ligada.', 422);
  const e: any = typeof d.entrega === 'object' && d.entrega !== null ? d.entrega : {};
  const entrega = { entrega: V.bool(e.entrega ?? true), retirada: V.bool(e.retirada ?? true), prazoEntrega: V.texto(e.prazoEntrega ?? '', 'o prazo de entrega', 0, 30),
    prazoRetirada: V.texto(e.prazoRetirada ?? '', 'o prazo de retirada', 0, 30), orientacoes: V.texto(e.orientacoes ?? '', 'as orientações de retirada', 0, 300) };
  if (!entrega.entrega && !entrega.retirada) throw new Erro('Deixe a entrega ou a retirada ligada.', 422);
  const n: any = typeof d.notif === 'object' && d.notif !== null ? d.notif : {};
  const notif = { som: V.bool(n.som ?? true), visual: V.bool(n.visual ?? true), whatsapp: V.bool(n.whatsapp ?? false),
    whatsappNumero: V.texto(n.whatsappNumero ?? '', 'o WhatsApp de avisos', 0, 20), email: V.bool(n.email ?? false),
    emailEndereco: V.texto(n.emailEndereco ?? '', 'o e-mail de avisos', 0, 120), resumo: V.bool(n.resumo ?? false) };
  const grava: Record<string, unknown> = { loja, horarios, excecoes, pagamentos: pag, entrega, notif };
  if (typeof d.privacidade === 'object' && d.privacidade !== null) {
    const pv = d.privacidade;
    const email = String(pv.encarregadoEmail ?? '');
    grava.privacidade = {
      encarregadoNome: V.texto(pv.encarregadoNome ?? '', 'o nome do encarregado', 0, 80),
      encarregadoEmail: email === '' ? '' : V.email(email, 'o e-mail do encarregado'),
      encarregadoTelefone: V.texto(pv.encarregadoTelefone ?? '', 'o telefone do encarregado', 0, 20),
      prazoMeses: V.inteiro(pv.prazoMeses ?? 24, 'o prazo de guarda (meses)', 6, 120),
    };
  }
  if (typeof d.seguranca === 'object' && d.seguranca !== null) {
    const exigir = V.bool(d.seguranca.exigir2fa ?? false);
    const antes = !!(await Config.obj('seguranca')).exigir2fa;
    if (exigir !== antes) {
      if (!u || u.id !== (await Usuarios.proprietarioId())) throw new Erro('Só o proprietário da loja muda a regra das duas etapas.', 403);
      if (exigir && !u.doisFatores) throw new Erro('Ative primeiro a verificação em duas etapas no seu perfil (menu com o seu nome › Meu perfil).', 422);
      await L.registrar(u.id, exigir ? 'seguranca.exigir2fa' : 'seguranca.liberar2fa', 'config');
    }
    grava.seguranca = { exigir2fa: exigir };
  }
  await Db.tx(async () => { for (const [k, v] of Object.entries(grava)) await Config.gravar(k, v); });
  Config.esquecer();
  return configSaida();
}

export async function salvarLogo(dados: unknown): Promise<string> {
  const antiga = String(await Config.obter('logo', ''));
  if (dados === Cardapio.LOGO_PADRAO) dados = '';
  const nova = await imagemEntrada(dados, { foto: '' });
  if (nova !== antiga) {
    await Config.gravar('logo', nova);
    await limparImagens([antiga]);
  }
  return Cardapio.logo();
}

/* ------------------------------------------------------------------ operação */

export async function operacaoSaida(op: Record<string, any>): Promise<Record<string, unknown>> {
  const sit = await Horarios.situacao();
  const hoje = await Horarios.janela(T.hojeIso());
  const hm = (min: number): string => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return { aberta: !!op.aberta, pausada: !!op.pausada, motivo: String(op.motivo ?? ''), pausaAte: op.pausaAte ? Math.trunc(Number(op.pausaAte)) : null,
    tempoMin: Math.trunc(Number(op.tempoMin)), tempoMax: Math.trunc(Number(op.tempoMax)), pedidoMinimo: T.reais(Math.trunc(Number(op.pedidoMinimo))),
    fecha: sit.fecha ?? String(op.fecha), tempoPreparo: Math.trunc(Number(op.tempoPreparo)), noHorario: sit.noHorario,
    hojeAbre: hoje ? hm(hoje[0]) : null, hojeFecha: hoje ? hm(hoje[1]) : null,
    abre: sit.abre ? { quando: sit.abre.quando, as: sit.abre.as } : null };
}

export async function salvarOperacao(dados: unknown, u: U): Promise<Record<string, unknown>> {
  const d = V.objeto(dados, 'a operação');
  const op = await Config.operacao();
  const pausada = V.bool(d.pausada ?? false);
  let ate: number | null = null;
  if (pausada && d.pausaAte !== null && d.pausaAte !== undefined && d.pausaAte !== '') {
    ate = V.inteiro(d.pausaAte, 'o fim da pausa', 0, Number.MAX_SAFE_INTEGER);
    if (ate < T.agoraMs() || ate > T.agoraMs() + 86_400_000) throw new Erro('Escolha uma pausa de até 24 horas.', 422);
  }
  let novo: Record<string, any> = { ...op, aberta: V.bool(d.aberta ?? true), pausada, motivo: pausada ? V.texto(d.motivo ?? '', 'o motivo da pausa', 0, 60) : '', pausaAte: pausada ? ate : null };
  if (Usuarios.pode(u, 'configuracoes')) {
    const min = V.inteiro(d.tempoMin ?? op.tempoMin, 'o tempo mínimo', 5, 180);
    const max = V.inteiro(d.tempoMax ?? op.tempoMax, 'o tempo máximo', 5, 240);
    if (max < min) throw new Erro('O tempo máximo precisa ser maior que o mínimo.', 422);
    novo = { ...novo, tempoMin: min, tempoMax: max, tempoPreparo: V.inteiro(d.tempoPreparo ?? op.tempoPreparo, 'o tempo de preparo', 1, 120),
      pedidoMinimo: V.centavosN(d.pedidoMinimo ?? 0, 'o pedido mínimo', 10_000_000) };
  }
  if (novo.aberta !== op.aberta || novo.pausada !== op.pausada) {
    await L.registrar(u.id, novo.pausada ? 'loja.pausar' : novo.aberta ? 'loja.abrir' : 'loja.fechar', 'operacao', '', L.filtrar({ motivo: novo.motivo }));
  }
  await Config.gravar('operacao', novo);
  return operacaoSaida(novo);
}

export async function operacaoInicial(op: Record<string, any>): Promise<void> {
  await Config.gravar('operacao', { aberta: true, pausada: false, motivo: '', pausaAte: null, tempoMin: Math.trunc(Number(op.tempoMin)), tempoMax: Math.trunc(Number(op.tempoMax)),
    pedidoMinimo: Math.round(parseFloat(String(op.pedidoMinimo ?? 0)) * 100), fecha: String(op.fecha), tempoPreparo: Math.trunc(Number(op.tempoPreparo)) });
}

/* ------------------------------------------------------------------ avisos do painel */

export function notificacaoSaida(n: any): Record<string, unknown> {
  return { id: 'n' + n.id, icone: n.icone, cor: n.cor, titulo: n.titulo, texto: n.texto, em: Number(n.em), lida: !!Number(n.lida), rota: n.rota, pedido: n.pedido === null ? null : Number(n.pedido) };
}

export async function notificacoes(u: U): Promise<any[]> {
  const [filtro, p] = filtroAvisos(u);
  return (await Db.todos('SELECT * FROM notificacoes WHERE 1 = 1' + filtro + ' ORDER BY id DESC LIMIT 40', p)).map(notificacaoSaida);
}

export async function salvarNotificacoes(dados: unknown, u: U): Promise<any[]> {
  const lidas: number[] = [];
  for (const n of V.lista(dados, 'os avisos', 200)) {
    const m = n && typeof n === 'object' && V.bool(n.lida ?? false) && typeof n.id === 'string' ? /^n(\d{1,18})$/.exec(n.id) : null;
    if (m) lidas.push(Number(m[1]));
  }
  if (lidas.length) await Db.q(`UPDATE notificacoes SET lida = 1 WHERE id IN (${Db.marcas(lidas)})`, lidas);
  await Db.q('DELETE FROM notificacoes WHERE em < ?', [T.agoraMs() - 30 * 86_400_000]);
  return notificacoes(u);
}

/* ================================================================== números do painel */

export async function metricas(): Promise<Record<string, unknown>> {
  const hoje = T.hojeIso();
  const n = T.diaN(hoje);
  const segunda = T.somarDias(hoje, -(n - 1));
  const inicio = T.somarDias(segunda, -14);
  const validos = "status NOT IN ('recusado', 'cancelado')";
  const porDia: Record<string, number> = {};
  for (const r of await Db.todos(`SELECT criado_em, total FROM pedidos WHERE criado_em >= ? AND ${validos}`, [T.inicioDoDiaMs(inicio)])) {
    const dia = T.iso(Number(r.criado_em));
    porDia[dia] = (porDia[dia] ?? 0) + Number(r.total);
  }
  const semana = (seg: string, ate = 7): { dias: number[]; parcial: number; total: number } => {
    const dias: number[] = [];
    for (let i = 0; i < 7; i++) dias.push(porDia[T.somarDias(seg, i)] ?? 0);
    return { dias, parcial: dias.slice(0, ate).reduce((a, b) => a + b, 0), total: dias.reduce((a, b) => a + b, 0) };
  };
  const atual = semana(segunda, n);
  const anterior = semana(T.somarDias(segunda, -7), n);
  const retrasada = semana(T.somarDias(segunda, -14));
  const delta = (a: number, b: number): number => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : 0);

  const ontem = await Db.um(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM pedidos WHERE criado_em >= ? AND criado_em < ? AND ${validos}`,
    [T.inicioDoDiaMs(T.somarDias(hoje, -1)), T.inicioDoDiaMs(hoje)]);

  const vendas = new Map<string, number>();
  for (const r of await Db.todos(`SELECT i.produto_id AS id, SUM(i.qtd) AS v FROM pedido_itens i JOIN pedidos p ON p.numero = i.pedido_numero
      WHERE i.criado_em >= ? AND p.status NOT IN ('recusado', 'cancelado') GROUP BY i.produto_id ORDER BY v DESC LIMIT 30`, [T.agoraMs() - 30 * 86_400_000])) {
    if (r.id !== '') vendas.set(String(r.id), Number(r.v));
  }
  const existentes = new Set((await Cardapio.produtos()).map(p => p.id));
  const mais = [...vendas.entries()].filter(([id, v]) => v > 0 && existentes.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, v]) => ({ produtoId: id, vendas: v }));
  const reais = (d: number[]): Array<number | null> => d.map(c => T.reais(c));
  return {
    ontem: { pedidos: Number(ontem.n), faturamento: T.reais(Number(ontem.t)) },
    semana: {
      atual: { total: T.reais(atual.total), delta: delta(atual.parcial, anterior.parcial), dias: reais(atual.dias) },
      anterior: { total: T.reais(anterior.total), delta: delta(anterior.total, retrasada.total), dias: reais(anterior.dias) },
    },
    maisVendidos: mais,
  };
}
