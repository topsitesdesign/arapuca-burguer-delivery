/** Cardápio lido do banco, js/data.js e o preenchimento das páginas do site (porte de Cardapio.php). */
import { ctx, escHtml, mbSub } from '../lib/base.js';
import * as Db from '../lib/db.js';
import * as Estaticos from '../lib/estaticos.js';
import * as Imagem from '../lib/imagem.js';
import * as T from '../lib/tempo.js';
import * as Config from './config.js';
import * as Cupons from './cupons.js';
import * as Horarios from './horarios.js';

const cache = (): Record<string, any> => (ctx().cache.cardapio ??= {});
export function esquecer(): void { delete ctx().cache.cardapio; }

const jsonLista = (s: unknown): any[] => { try { const v = JSON.parse(String(s)); return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []); } catch { return []; } };

export async function categorias(): Promise<any[]> {
  return (cache().categorias ??= (await Db.todos('SELECT * FROM categorias WHERE arquivado_em IS NULL ORDER BY ordem, nome')).map(r => ({
    id: r.id, nome: r.nome, descricao: r.descricao, icone: r.icone, imagem: r.imagem,
    ativa: !!Number(r.ativa), especial: !!Number(r.especial), ordem: Number(r.ordem), versao: Number(r.versao ?? 1),
  })));
}

export async function produtos(): Promise<any[]> {
  return (cache().produtos ??= (await Db.todos('SELECT * FROM produtos WHERE arquivado_em IS NULL ORDER BY ordem, nome')).map(r => ({
    id: r.id, nome: r.nome, categoria: r.categoria_id, preco: Number(r.preco), promo: r.promo === null ? null : Number(r.promo), descricao: r.descricao,
    ingredientes: jsonLista(r.ingredientes), grupos: jsonLista(r.grupos), preparo: Number(r.preparo), codigo: r.codigo, ativo: !!Number(r.ativo),
    destaque: !!Number(r.destaque), esgotado: !!Number(r.esgotado), foto: r.foto, imagem: r.imagem, alt: r.alt, selo: r.selo,
    ordem: Number(r.ordem), versao: Number(r.versao ?? 1),
  })));
}

export async function grupos(): Promise<any[]> {
  return (cache().grupos ??= (await Db.todos('SELECT * FROM grupos WHERE arquivado_em IS NULL ORDER BY ordem, nome')).map(r => ({
    id: r.id, nome: r.nome, obrigatorio: !!Number(r.obrigatorio), tipo: r.tipo, min: Number(r.min_escolhas), max: Number(r.max_escolhas), ativo: !!Number(r.ativo),
    opcoes: comIds(jsonLista(r.opcoes).map((o: any) => ({ nome: String(o.nome), preco: Math.trunc(Number(o.preco)) }))),
    ordem: Number(r.ordem), versao: Number(r.versao ?? 1),
  })));
}

export async function areas(): Promise<any[]> {
  return (cache().areas ??= (await Db.todos('SELECT * FROM areas WHERE arquivado_em IS NULL ORDER BY ordem, nome')).map(r => ({
    id: r.id, nome: r.nome, taxa: Number(r.taxa), tempoExtra: Number(r.tempo_extra), minimo: Number(r.minimo), ativa: !!Number(r.ativa),
    cobertura: r.cobertura, cepIni: r.cep_ini, cepFim: r.cep_fim, raio: Number(r.raio), ordem: Number(r.ordem), versao: Number(r.versao ?? 1),
  })));
}

export const porId = <X extends { id: string }>(lista: X[]): Record<string, X> => Object.fromEntries(lista.map(x => [x.id, x]));

const ACENTOS: Record<string, string> = { 'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'é': 'e', 'ê': 'e', 'è': 'e', 'ë': 'e', 'í': 'i', 'î': 'i', 'ì': 'i', 'ï': 'i',
  'ó': 'o', 'ô': 'o', 'õ': 'o', 'ò': 'o', 'ö': 'o', 'ú': 'u', 'û': 'u', 'ù': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n' };

/** Identificador estável de cada opção, feito a partir do nome ("Bacon extra" → "bacon-extra"). */
export function slug(s: string): string {
  const x = s.trim().toLowerCase().replace(/[áàâãäéêèëíîìïóôõòöúûùüçñ]/g, ch => ACENTOS[ch]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return x || 'opcao';
}

function comIds(opcoes: any[]): any[] {
  const vistos = new Set<string>();
  return opcoes.map(o => {
    let id = slug(o.nome);
    const base = id;
    for (let n = 2; vistos.has(id); n++) id = `${base}-${n}`;
    vistos.add(id);
    return { ...o, id };
  });
}

/** O produto aparece no site? Ativo, não esgotado e numa categoria ativa. */
export async function visivel(p: any): Promise<boolean> {
  const cat = porId(await categorias())[p.categoria];
  return !!(p.ativo && !p.esgotado && cat && cat.ativa && !cat.especial);
}

export const precoAtual = (p: any): number => (p.promo !== null && p.promo > 0 && p.promo < p.preco ? p.promo : p.preco);

export async function gruposDo(p: any): Promise<any[]> {
  const g = porId(await grupos());
  const saida: any[] = [];
  for (const id of p.grupos) if (g[id] && g[id].ativo && g[id].opcoes.length) saida.push(regras(g[id]));
  return saida;
}

/** Mínimo e máximo coerentes: obrigatório tem mínimo 1; seleção única tem máximo 1. */
export function regras(g: any): any {
  const max = g.tipo === 'unico' ? 1 : Math.max(1, Math.min(g.max, g.opcoes.length));
  const min = g.obrigatorio ? Math.max(1, Math.min(g.min || 1, max)) : 0;
  return { ...g, min, max };
}

export const prazo = (op: any, extra = 0): string => (Number(op.tempoMin) + extra) + '–' + (Number(op.tempoMax) + extra) + ' min';

export async function endereco(): Promise<{ rua: string; bairro: string; cidade: string; completo: string }> {
  const l = await Config.obj('loja');
  const rua = ((l.rua ?? '') + ((l.numero ?? '') !== '' ? ', ' + l.numero : '')).trim();
  return { rua, bairro: String(l.bairro ?? ''), cidade: String(l.cidade ?? ''), completo: rua + ((l.bairro ?? '') !== '' ? ' — ' + l.bairro : '') };
}

export const LOGO_PADRAO = '/marca/logo.webp';

export const TEXTOS_PADRAO: Record<string, string> = {
  slogan1: 'Burguer na parrilla,', slogan2: 'na sua porta.', apoio: 'Blend bovino de 150 g na parrilla no pão brioche. Turbine o seu com adicionais, de bacon a costela desfiada.',
  descricao: 'Hamburgueria artesanal na Madalena, Recife', botao: 'Escolher meu burguer',
};

export async function textos(): Promise<Record<string, string>> {
  const l = await Config.obj('loja');
  const t: Record<string, string> = {};
  for (const [k, padrao] of Object.entries(TEXTOS_PADRAO)) t[k] = String(l[k] ?? '').trim() !== '' ? String(l[k]).trim() : padrao;
  return t;
}

export async function nomeLoja(): Promise<string> {
  return String((await Config.obj('loja')).nome ?? '').trim() || 'Nossa loja';
}

/*
  Nome e WhatsApp para a página de "fora do ar" (PED-06). O PHP guardava em storage/contato.json; a Vercel não tem disco
  gravável: fica na memória da função (atualizado a cada página) e, sem ela, vem das variáveis CONTATO_NOME e CONTATO_WHATSAPP.
*/
let contatoMemoria: { nome: string; whatsapp: string; exibicao: string; logo: string } | null = null;

export async function guardarContato(): Promise<void> {
  const w = await whatsapp();
  contatoMemoria = { nome: await nomeLoja(), whatsapp: w.numero, exibicao: w.exibicao, logo: await logo() };
}

export function contatoGuardado(): { nome: string; whatsapp: string; exibicao: string; logo: string } {
  if (contatoMemoria) return contatoMemoria;
  const exib = process.env.CONTATO_WHATSAPP || '';
  const d = exib.replace(/\D/g, '');
  return { nome: process.env.CONTATO_NOME || '', whatsapp: d === '' ? '' : d.startsWith('55') && d.length > 11 ? d : '55' + d, exibicao: exib, logo: Estaticos.existe(LOGO_PADRAO) ? LOGO_PADRAO : '' };
}

export async function bannersSite(): Promise<any[]> {
  const hoje = T.hojeIso();
  const saida: any[] = [];
  for (const b of await Db.todos("SELECT * FROM banners WHERE status = 'ativo' AND arquivado_em IS NULL AND destino NOT LIKE 'cupom:%' ORDER BY ordem, titulo LIMIT 6")) {
    if ((b.inicio !== '' && b.inicio > hoje) || (b.fim !== '' && b.fim < hoje)) continue;
    const foto = b.imagem !== '' ? b.imagem : b.foto;
    saida.push({ id: b.id, titulo: b.titulo, texto: b.texto, foto, destino: b.destino, desktop: !!Number(b.desktop), mobile: !!Number(b.mobile) });
  }
  return saida;
}

export async function logo(): Promise<string> {
  const k = String(await Config.obter('logo', ''));
  if (Imagem.PADRAO_CHAVE.test(k)) return '/' + Imagem.url(k, 500);
  return Estaticos.existe(LOGO_PADRAO) ? LOGO_PADRAO : '';
}

export async function whatsapp(): Promise<{ numero: string; exibicao: string }> {
  const l = await Config.obj('loja');
  const d = String(l.whatsapp ?? '').replace(/\D/g, '');
  return { numero: d === '' ? '' : d.startsWith('55') && d.length > 11 ? d : '55' + d, exibicao: String(l.whatsapp ?? '') };
}

const so500 = (foto: string): boolean => /^f\d{3,12}$/.test(foto) && !Estaticos.existe(`assets/img/photo-${foto}-960.webp`);
export const so500Foto = so500;

/** json_encode com JSON_HEX_TAG | JSON_HEX_AMP (seguro dentro de <script>). */
const js = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003C').replace(/>/g, '\\u003E').replace(/&/g, '\\u0026');

/** O arquivo js/data.js do site, gerado a partir do banco. */
export async function moduloJs(): Promise<string> {
  const op = await Config.operacao();
  const entrega = await Config.obj('entrega');
  const pag = await Config.obj('pagamentos');
  const end = await endereco();
  const whats = await whatsapp();
  const sit = await Horarios.situacao();

  const areasAtivas = (await areas()).filter(a => a.ativa);
  const extras = areasAtivas.length ? areasAtivas.map(a => a.tempoExtra) : [0];
  const loja = {
    nome: await nomeLoja(), botao: (await textos()).botao, logo: await logo(),
    endereco: end.completo, rua: end.rua, bairro: end.bairro, cidade: end.cidade,
    whatsapp: whats.numero, whatsappExibicao: whats.exibicao, fuso: T.FUSO,
    horarios: await Horarios.semanaSite(), excecoes: await Horarios.excecoesSite(),
    pausaManual: sit.pausada, fechadaPainel: sit.fechadaPainel, pausaAte: sit.pausaAte,
    prazoEntrega: (Number(op.tempoMin) + Math.min(...extras)) + '–' + (Number(op.tempoMax) + Math.max(...extras)) + ' min',
    prazoRetirada: String(entrega.prazoRetirada ?? '20–30 min'),
    pedidoMinimo: T.reais(Math.trunc(Number(op.pedidoMinimo ?? 0))),
    entrega: (entrega.entrega ?? true) !== false && areasAtivas.length > 0,
    retirada: (entrega.retirada ?? true) !== false,
    orientacoes: String(entrega.orientacoes ?? ''),
    troco: !!pag.troco,
    antecedencia: Horarios.ANTECEDENCIA_MIN,
  };
  const areasSite = areasAtivas.map(a => ({ id: a.id, nome: a.nome, taxa: T.reais(a.taxa), prazo: prazo(op, a.tempoExtra), minimo: T.reais(a.minimo) }));

  const pagamentos: any[] = [];
  if (pag.dinheiro) pagamentos.push({ id: 'dinheiro', nome: 'Dinheiro', detalhe: pag.troco ? 'Informe se precisa de troco.' : 'Leve o valor certo: não há troco.' });
  if (pag.pix) pagamentos.push({ id: 'pix', nome: 'Pix', detalhe: 'Você paga com Pix na entrega ou no balcão.' });
  if (pag.debito) pagamentos.push({ id: 'debito', nome: 'Cartão de débito', detalhe: 'Na maquininha, na entrega ou no balcão.' });
  if (pag.credito) pagamentos.push({ id: 'credito', nome: 'Cartão de crédito', detalhe: 'Na maquininha, na entrega ou no balcão.' });

  const cats = porId(await categorias());
  const visiveis: any[] = [];
  for (const p of await produtos()) if (await visivel(p)) visiveis.push(p);
  visiveis.sort((a, b) => (cats[a.categoria].ordem - cats[b.categoria].ordem) || (a.ordem - b.ordem));

  const gruposSite: Record<string, any> = {};
  const produtosSite: any[] = [];
  const fotos500: string[] = [];
  let rank = 0;
  for (const p of visiveis) {
    const gs = await gruposDo(p);
    for (const g of gs) {
      gruposSite[g.id] ??= { nome: g.nome, min: g.min, max: g.max, tipo: g.tipo, opcoes: g.opcoes.map((o: any) => ({ id: o.id, nome: o.nome, preco: T.reais(o.preco) })) };
    }
    const foto = p.imagem !== '' ? p.imagem : p.foto;
    if (foto !== '' && so500(foto)) fotos500.push(foto);
    const atual = precoAtual(p);
    produtosSite.push({
      id: p.id, categoria: p.categoria, nome: p.nome, preco: T.reais(atual), precoDe: atual < p.preco ? T.reais(p.preco) : null,
      destaque: p.destaque ? ++rank : 0, selo: p.selo !== '' ? p.selo : (atual < p.preco ? 'Promoção' : ''),
      descricao: p.descricao, ingredientes: p.ingredientes, remover: [], grupos: gs.map(g => g.id), foto,
      alt: p.imagem !== '' || p.alt === '' ? p.nome : p.alt,
    });
  }
  const usadas = new Set(produtosSite.map(p => p.categoria));
  const catsSite = (await categorias()).filter(c => c.ativa && !c.especial && usadas.has(c.id)).map(c => ({ id: c.id, nome: c.nome }));

  const nome = await nomeLoja();
  const retirar = 'Pode retirar no balcão' + (end.rua !== '' ? ' da ' + end.rua : '') + '.';
  const status = [
    { id: 'recebido', nome: 'Recebido', texto: 'A cozinha recebeu o seu pedido.' },
    { id: 'confirmado', nome: 'Confirmado', texto: 'Pedido confirmado pela loja.' },
    { id: 'preparo', nome: 'Em preparo', texto: 'Seu pedido está sendo preparado.' },
    { id: 'saiu', nome: 'Saiu para entrega', nomeRetirada: 'Pronto para retirada', texto: 'O entregador está a caminho.', textoRetirada: retirar },
    { id: 'entregue', nome: 'Entregue', nomeRetirada: 'Retirado', texto: 'Pedido entregue. Bom apetite.', textoRetirada: 'Pedido retirado. Bom apetite.' },
  ];
  const finais = {
    cancelado: { nome: 'Cancelado', texto: 'Este pedido foi cancelado. Fale com a ' + nome + ' no WhatsApp se precisar.' },
    recusado: { nome: 'Recusado', texto: 'A ' + nome + ' não conseguiu aceitar este pedido agora. Nada foi cobrado.' },
  };
  return [
    '/* Gerado pelo servidor a partir do banco de dados. Para mudar, use o painel em /admin. */',
    'export const AGORA = ' + T.agoraMs() + ';',
    'export const LOJA = ' + js(loja) + ';',
    'export const AREAS = ' + js(areasSite) + ';',
    'export const CUPONS = [];',
    'export const PAGAMENTOS = ' + js(pagamentos) + ';',
    'export const STATUS = ' + js(status) + ';',
    'export const STATUS_FINAIS = ' + js(finais) + ';',
    'export const CATEGORIAS = ' + js(catsSite) + ';',
    'export const GRUPOS = ' + js(gruposSite) + ';',
    'export const PRODUTOS = ' + js(produtosSite) + ';',
    'export const BANNERS = ' + js(await bannersSite()) + ';',
    'export const FORA_DO_AR = false;',
    'const SO_500 = new Set(' + js([...new Set(fotos500)]) + ');',
    'export const img = (foto, w) => {',
    "  if (!foto) return 'assets/img/sem-foto.svg';",
    "  if (foto.startsWith('u-')) { const jpg = foto.endsWith('-j'); const base = jpg ? foto.slice(0, -2) : foto; return `uploads/${base}-${w && w <= 500 ? 500 : 960}.${jpg ? 'jpg' : 'webp'}`; }",
    '  if (SO_500.has(foto)) return `assets/img/photo-${foto}-500.webp`;',
    "  return `assets/img/photo-${foto}${w ? '-' + w : ''}.webp`;",
    '};',
    'export const produto = id => PRODUTOS.find(p => p.id === id);',
    '',
  ].join('\n');
}

/* ================================================================== textos das páginas */

export async function promo(): Promise<{ cupom: Cupons.Cupom; banner: any } | null> {
  const hoje = T.hojeIso();
  for (const b of await Db.todos("SELECT * FROM banners WHERE status <> 'encerrado' AND arquivado_em IS NULL AND destino LIKE 'cupom:%' ORDER BY ordem, titulo")) {
    if ((b.inicio !== '' && b.inicio > hoje) || (b.fim !== '' && b.fim < hoje)) continue;
    const c = await Cupons.porCodigo(Cupons.normalizarCodigo(String(b.destino).slice(6)));
    if (!c || !c.habilitado || (c.inicio !== '' && c.inicio > hoje) || (c.validade !== '' && c.validade < hoje)) continue;
    if (c.limite !== null && c.usos >= c.limite) continue;
    return { cupom: c, banner: b };
  }
  return null;
}

const lista = (itens: string[], e = ' e '): string => (itens.length <= 1 ? String(itens[0] ?? '') : itens.slice(0, -1).join(', ') + e + itens[itens.length - 1]);
const maiuscula = (s: string): string => s.charAt(0).toUpperCase() + mbSub(s, 1);
/** rawurlencode do PHP. */
const rawurlencode = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());

/** Preenche uma página do site com os dados do painel ({{MARCAS}} e blocos <!--se:x-->…<!--/se:x-->). */
export async function preencherPagina(html: string): Promise<string> {
  const e = escHtml;
  const brl = (c: number): string => T.brl(c).replace('R$ ', 'R$\u00a0');
  const brlCurto = (c: number): string => brl(c).replace(',00', '');

  const loja = await Config.obj('loja');
  const nome = await nomeLoja();
  const txt = await textos();
  await guardarContato();
  const cfgEntrega = await Config.obj('entrega');
  const pag = await Config.obj('pagamentos');
  const op = await Config.operacao();
  const areasAtivas = (await areas()).filter(a => a.ativa);
  const entrega = (cfgEntrega.entrega ?? true) !== false && areasAtivas.length > 0;
  const retirada = (cfgEntrega.retirada ?? true) !== false;
  const end = await endereco();
  const whats = await whatsapp();

  const nomesAreas = areasAtivas.map(a => a.nome);
  const bairros = !entrega ? '' : nomesAreas.length === 1 ? 'no bairro ' + nomesAreas[0] : 'nos bairros ' + lista(nomesAreas);
  const taxas = areasAtivas.map(a => a.taxa);
  const taxaDesde = !entrega ? '' : Math.min(...taxas) > 0 ? 'Entrega a partir de ' + brl(Math.min(...taxas)) : Math.max(...taxas) > 0 ? 'Entrega grátis em alguns bairros' : 'Entrega grátis';
  const extras = areasAtivas.length ? areasAtivas.map(a => a.tempoExtra) : [0];
  const prazoEntrega = (Number(op.tempoMin) + Math.min(...extras)) + '–' + (Number(op.tempoMax) + Math.max(...extras)) + ' min';
  const prazoRetirada = String(cfgEntrega.prazoRetirada ?? '20–30 min');
  const emMinutos = (p: string): string => p.replace(/–/g, ' a ').replace(/min/g, 'minutos');

  const gs = await Horarios.grupos();
  const abertos = gs.filter(g => g.aberto);
  const fechados = gs.filter(g => !g.aberto);
  const resumo = abertos.length ? abertos.map(g => g.dias + ', ' + g.faixa).join(' · ') : 'Consulte os horários no WhatsApp';
  const fechadoTxt = fechados.length ? ' ' + lista(fechados.map(g => g.dias)) + ' a gente não abre.' : '';

  const formas: string[] = [];
  if (pag.dinheiro) formas.push('dinheiro');
  if (pag.pix) formas.push('Pix');
  if (pag.debito) formas.push('cartão de débito');
  if (pag.credito) formas.push('cartão de crédito');
  const formasCurtas = [...new Set(formas.map(f => (f.startsWith('cartão') ? 'cartão' : f)))];
  const formasFaq = formas.map(f => f.replace('cartão de ', ''));
  const troco = pag.dinheiro ? (pag.troco ? ' Se for dinheiro, diga para quanto é o troco.' : ' Se for dinheiro, leve o valor certo: não há troco.') : '';
  const ondePaga = entrega && retirada ? 'Na entrega ou no balcão' : entrega ? 'Na entrega' : 'No balcão';

  const p = await promo();
  const cupom = p?.cupom ?? null;
  let promoTokens: Record<string, string> = {};
  if (cupom && p) {
    const v = cupom.valor;
    const [off, titulo, desconto, curto] = cupom.tipo === 'percentual' ? [`${v}% OFF`, `${v}% off`, `${v}% de desconto`, `${v}% nos produtos`]
      : cupom.tipo === 'fixo' ? [brlCurto(v) + ' OFF', brlCurto(v) + ' off', brl(v) + ' de desconto', brlCurto(v) + ' nos produtos']
        : ['FRETE GRÁTIS', 'Entrega grátis', 'Entrega grátis', 'entrega grátis'];
    const porCliente = cupom.porCliente;
    const vezes = porCliente === 1 ? 'uma vez por WhatsApp' : porCliente > 1 ? `até ${porCliente} vezes por WhatsApp` : '';
    const minimo = cupom.minimo > 0 ? 'em pedidos a partir de ' + brl(cupom.minimo) + ' em produtos' : '';
    const condicao = [vezes, minimo].filter(Boolean).join(', ');
    const detalhe = (cupom.tipo === 'frete' ? 'A entrega sai grátis' : 'São ' + curto) + (condicao !== '' ? ', ' + condicao : '') + '.' + (cupom.tipo !== 'frete' ? ' A taxa de entrega fica de fora.' : '');
    const regra = (condicao !== '' ? maiuscula(condicao) + '. ' : '') + 'Toque no cupom para aplicar.';
    let textoBanner = String(p.banner.texto ?? '').trim();
    if (textoBanner !== '' && !/[.!?]$/u.test(textoBanner)) textoBanner += '.';
    promoTokens = {
      '{{CUPOM_CODIGO}}': cupom.codigo, '{{CUPOM_OFF}}': off, '{{CUPOM_DESCONTO}}': desconto,
      '{{PROMO_CHAMADA}}': String(p.banner.titulo), '{{PROMO_TITULO}}': titulo,
      '{{PROMO_TEXTO}}': (textoBanner !== '' ? textoBanner + ' ' : '') + 'Use o cupom ' + cupom.codigo + ' na sacola.',
      '{{CUPOM_CURTO}}': curto, '{{CUPOM_REGRA}}': regra,
      '{{FAQ_CUPOM}}': 'Toque em Aplicar ' + cupom.codigo + ' ou digite o código na sacola. ' + detalhe,
    };
  }

  const partesMeta = [entrega ? 'entrega ' + bairros : '', retirada ? 'retirada grátis no balcão' : ''].filter(Boolean);
  const mapa = 'https://www.openstreetmap.org/search?query=' + rawurlencode(end.rua + ', ' + end.bairro + (end.cidade !== '' ? ', ' + end.cidade : ''));
  const texto: Record<string, string> = {
    '{{LOJA_NOME}}': nome,
    '{{ANO}}': T.ano(),
    '{{META_DESCRICAO}}': txt.descricao + ', com ' + partesMeta.join(' ou ') + '. ' + resumo + '.' + (cupom ? ' Cupom ' + cupom.codigo + ' com ' + Cupons.curto(cupom) + '.' : ''),
    '{{LOJA_DESCRICAO}}': txt.descricao, '{{HERO_TITULO_1}}': txt.slogan1, '{{HERO_TITULO_2}}': txt.slogan2,
    '{{HERO_APOIO}}': txt.apoio, '{{BOTAO_TOPO}}': txt.botao,
    '{{OG_DESCRICAO}}': 'Peça no site e pague na entrega' + (formasCurtas.length ? ': ' + lista(formasCurtas, ' ou ') : '') + '. ' + (entrega ? maiuscula(lista(nomesAreas)) + '.' : 'Retirada no balcão.'),
    '{{HERO_ENTREGA}}': entrega ? 'Entrega em ' + prazoEntrega.replace(/–/g, ' a ') + ' para ' + lista(nomesAreas) + '.' : 'Retire grátis no balcão em ' + prazoRetirada.replace(/–/g, ' a ') + '.',
    '{{TAXA_DESDE}}': taxaDesde,
    '{{PRAZO_ENTREGA}}': entrega ? prazoEntrega : prazoRetirada,
    '{{HORARIO_RESUMO}}': resumo,
    '{{LOJA_RUA}}': end.rua,
    '{{LOJA_BAIRRO}}': end.bairro,
    '{{ENDERECO_COMPLETO}}': end.completo,
    '{{MAPA_URL}}': mapa,
    '{{WHATS_URL}}': 'https://wa.me/' + whats.numero,
    '{{WHATS_EXIBICAO}}': whats.exibicao,
    '{{FAQ_HORARIO}}': resumo + '.' + fechadoTxt + ' Fora desse horário, dá para deixar o pedido agendado.',
    '{{FAQ_PAGAMENTO}}': ondePaga + (formasFaq.length ? ': ' + lista(formasFaq, ' ou ') : '') + '. O site não cobra nada.' + troco,
    '{{FAQ_TAXAS}}': (entrega ? lista(areasAtivas.map(a => a.nome + ' ' + (a.taxa > 0 ? brl(a.taxa) : 'grátis'))) + '.' : 'No momento a gente não faz entregas.') + (retirada ? ' Retirar no balcão é grátis.' : ''),
    '{{FAQ_PRAZO}}': ((entrega ? 'De ' + emMinutos(prazoEntrega) + ', conforme o bairro e o movimento.' : '') + (retirada ? ' Para retirar, fica pronto em ' + emMinutos(prazoRetirada) + '.' : '')).trim(),
    '{{FAQ_AGENDAR}}': 'Pode. Escolha um horário com pelo menos ' + Horarios.ANTECEDENCIA_MIN + ' minutos de antecedência, para até 8 dias à frente, dentro do horário da loja.',
    '{{RODAPE_SOBRE}}': txt.descricao + ', com ' + (entrega ? 'entrega ' + bairros + '.' : 'retirada no balcão.'),
    ...promoTokens,
    ...(await tokensPrivacidade(loja, whats)),
  };
  const htmlTokens: Record<string, string> = {
    '{{HORARIOS_LISTA_HTML}}': gs.map(g => '<li><span>' + e(g.dias) + '</span><b>' + e(g.faixa) + '</b></li>').join(''),
    '{{HORARIOS_RODAPE_HTML}}': gs.map(g => (g.aberto ? '<li>' + e(g.dias) + '<br>' + e(g.faixa) + '</li>' : '<li>' + e(g.dias) + ': fechado</li>')).join(''),
    '{{AREAS_LISTA_HTML}}': (entrega ? areasAtivas : []).map(a => '<li><span>' + e(a.nome) + '<small>' + e(prazo(op, a.tempoExtra).replace(/–/g, ' a ')) + '</small></span><b>' + e(brl(a.taxa)) + '</b></li>').join('')
      + (retirada ? '<li><span>Retirada no balcão<small>' + e(prazoRetirada.replace(/–/g, ' a ')) + '</small></span><b>Grátis</b></li>' : ''),
  };

  const pv = await Config.obj('privacidade');
  const condicoes: Record<string, boolean> = {
    promo: cupom !== null, entrega, retirada, cnpj: String(loja.cnpj ?? '').trim() !== '', encarregado: String(pv.encarregadoNome ?? '').trim() !== '',
    semencarregado: String(pv.encarregadoNome ?? '').trim() === '', email: String(loja.email ?? '').trim() !== '',
  };
  html = html.replace(/<!--se:([a-z]+)-->([\s\S]*?)<!--\/se:\1-->/g, (_m, k: string, dentro: string) => (condicoes[k] ? dentro : ''));
  // strtr: troca todas as marcas de uma vez (o texto trocado não é trocado de novo)
  const mapa2: Record<string, string> = { ...Object.fromEntries(Object.entries(texto).map(([k, v]) => [k, e(v)])), ...htmlTokens };
  const chaves = Object.keys(mapa2).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return html.replace(new RegExp(chaves.join('|'), 'g'), m => mapa2[m]);
}

export const PRIVACIDADE_VERSAO = '17/11/2026';

async function tokensPrivacidade(loja: Record<string, any>, whats: { exibicao: string }): Promise<Record<string, string>> {
  const pv = await Config.obj('privacidade');
  const meses = Math.trunc(Number(pv.prazoMeses ?? 24));
  const contatoEnc = [String(pv.encarregadoEmail ?? '').trim(), String(pv.encarregadoTelefone ?? '').trim()].filter(Boolean).join(' · ');
  return {
    '{{LOJA_RAZAO}}': String(loja.razao ?? '').trim() || (await nomeLoja()),
    '{{LOJA_CNPJ}}': String(loja.cnpj ?? ''),
    '{{LOJA_EMAIL}}': String(loja.email ?? ''),
    '{{LOJA_CIDADE}}': (String(loja.cidade ?? '') + ((loja.uf ?? '') !== '' ? '/' + loja.uf : '')).trim(),
    '{{ENCARREGADO_NOME}}': String(pv.encarregadoNome ?? ''),
    '{{ENCARREGADO_CONTATO}}': contatoEnc !== '' ? contatoEnc : 'pelo WhatsApp da loja, ' + whats.exibicao,
    '{{PRAZO_GUARDA}}': meses % 12 === 0 ? meses / 12 + (meses === 12 ? ' ano' : ' anos') : `${meses} meses`,
    '{{PRIVACIDADE_VERSAO}}': PRIVACIDADE_VERSAO,
  };
}
