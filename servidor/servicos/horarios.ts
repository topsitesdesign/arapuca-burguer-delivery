/*
  Horário de funcionamento no fuso de Brasília (porte de Horarios.php): semana, exceções, loja fechada no painel,
  pausa e horários para agendar. Uma janela pode passar da meia-noite (ex.: 18:00 às 00:00).
*/
import { Erro, ucfirst } from '../lib/base.js';
import * as T from '../lib/tempo.js';
import * as Config from './config.js';

export const ANTECEDENCIA_MIN = 45;
export const TOLERANCIA_MIN = 20;
export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const min = (hhmm: string): number => { const [h, m] = String(hhmm).split(':'); return (parseInt(h, 10) || 0) * 60 + (parseInt(m ?? '0', 10) || 0); };

export function hora(hhmm: string): string {
  const [h, m = '00'] = String(hhmm).split(':');
  return (parseInt(h, 10) || 0) + 'h' + (m !== '00' ? m : '');
}

const montar = (abre: string, fecha: string): [number, number] => {
  const a = min(abre);
  let f = min(fecha);
  if (f <= a) f += 1440; // passa da meia-noite
  return [a, f];
};

/** Janela de um dia (YYYY-MM-DD): [abre, fecha] em minutos desde 00:00 daquele dia, ou null se fechado. */
export async function janela(d: string): Promise<[number, number] | null> {
  const excecoes = await Config.obter('excecoes', []);
  for (const x of Array.isArray(excecoes) ? excecoes : Object.values(excecoes)) {
    if ((x?.data ?? '') !== d) continue;
    if ((x?.tipo ?? '') === 'fechado') return null;
    if (x?.abre && x?.fecha) return montar(x.abre, x.fecha);
  }
  const semana = await Config.obter('horarios', []);
  const h = (Array.isArray(semana) ? semana : Object.values(semana))[T.diaN(d) - 1];
  if (!h || !h.aberto) return null;
  return montar(h.abre, h.fecha);
}

interface JanelaMs { dia: string; k: number; abre: number; fecha: number }

/** Janelas reais (em ms) de ontem até daqui a $dias. */
async function janelasMs(dias = 8): Promise<JanelaMs[]> {
  const hoje = T.hojeIso();
  const lista: JanelaMs[] = [];
  for (let k = -1; k <= dias; k++) {
    const d = T.somarDias(hoje, k);
    const j = await janela(d);
    if (!j) continue;
    const base = T.inicioDoDiaMs(d);
    lista.push({ dia: d, k, abre: base + j[0] * 60_000, fecha: base + j[1] * 60_000 });
  }
  return lista;
}

export async function noHorario(ms: number = T.agoraMs()): Promise<boolean> {
  for (const j of await janelasMs(1)) if (ms >= j.abre && ms < j.fecha) return true;
  return false;
}

export async function situacao(): Promise<Record<string, any>> {
  const op = await Config.operacao();
  const agora = T.agoraMs();
  const noH = await noHorario(agora);
  const pausada = !!op.pausada;
  const fechadaPainel = !op.aberta;
  const aceitaAgora = noH && !pausada && !fechadaPainel;
  let proxima: JanelaMs | null = null;
  for (const j of await janelasMs(8)) if (j.abre > agora) { proxima = j; break; }
  let abre: Record<string, any> | null = null;
  if (proxima) {
    const quando = proxima.k === 0 ? 'hoje' : proxima.k === 1 ? 'amanhã' : DIAS[T.partes(T.inicioDoDiaMs(proxima.dia)).semana];
    abre = { quando, as: T.hm(proxima.abre), em: proxima.abre };
  }
  let fecha: string | null = null;
  for (const j of await janelasMs(1)) if (agora >= j.abre && agora < j.fecha) fecha = T.hm(j.fecha);
  return { aceitaAgora, aceitaAgendamento: !pausada, noHorario: noH, pausada, fechadaPainel, pausaAte: op.pausaAte ?? null, fecha, abre };
}

/** Confere um horário de agendamento ("YYYY-MM-DD HH:MM", horário de Brasília) e devolve o instante em ms. */
export async function validarAgendamento(valor: unknown): Promise<number> {
  const m = typeof valor === 'string' ? /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/.exec(valor) : null;
  if (!m) throw new Erro('Escolha um horário para o agendamento.', 422, 'hora');
  const ms = T.msDe(+m[1], +m[2], +m[3], +m[4], +m[5]);
  const agora = T.agoraMs();
  if (ms < agora + TOLERANCIA_MIN * 60_000) throw new Erro('Esse horário ficou perto demais. Escolha um horário mais tarde.', 422, 'hora');
  if (ms > agora + 8 * 86_400_000) throw new Erro('Agende para os próximos dias.', 422, 'hora');
  for (const j of await janelasMs(8)) if (ms > j.abre && ms <= j.fecha) return ms;
  throw new Erro('A loja está fechada nesse horário. Escolha outro.', 422, 'hora');
}

/** Texto do agendamento: "Hoje, 20h30", "Amanhã, 19h", "Sábado 06/12, 18h30". */
export function rotulo(ms: number): string {
  const k = Math.round((T.inicioDoDiaMs(T.iso(ms)) - T.hojeMs()) / 86_400_000);
  const nome = k === 0 ? 'Hoje' : k === 1 ? 'Amanhã' : k === -1 ? 'Ontem' : ucfirst(DIAS[T.partes(ms).semana]) + ' ' + T.dm(ms);
  return nome + ', ' + hora(T.hm(ms));
}

/** Horários da semana no formato do site: {0: ['18:00','23:30'] | null, …} com 0 = domingo. */
export async function semanaSite(): Promise<Record<number, [string, string] | null>> {
  const s = await Config.obter('horarios', []);
  const semana = Array.isArray(s) ? s : Object.values(s);
  const saida: Record<number, [string, string] | null> = {};
  for (let i = 0; i < 7; i++) {
    const h = semana[(i + 6) % 7];
    saida[i] = h && h.aberto ? [h.abre, h.fecha] : null;
  }
  return saida;
}

export async function grupos(): Promise<Array<{ dias: string; faixa: string; aberto: boolean }>> {
  const semana = await semanaSite();
  const nomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const gs: Array<{ chave: string; dias: number[]; h: [string, string] | null }> = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const h = semana[d];
    const chave = h ? h[0] + '-' + h[1] : 'fechado';
    const n = gs.length;
    if (n && gs[n - 1].chave === chave) gs[n - 1].dias.push(d);
    else gs.push({ chave, dias: [d], h });
  }
  return gs.map(g => {
    const p = g.dias[0], u = g.dias[g.dias.length - 1];
    const dias = g.dias.length === 1 ? nomes[p] : DIAS[p].charAt(0).toUpperCase() + DIAS[p].slice(1) + (g.dias.length === 2 ? ' e ' : ' a ') + DIAS[u];
    return { dias, faixa: g.h ? hora(g.h[0]) + ' às ' + hora(g.h[1]) : 'Fechado', aberto: !!g.h };
  });
}

/** Exceções dos próximos 10 dias no formato do site. */
export async function excecoesSite(): Promise<Record<string, [string, string] | null>> {
  const inicio = T.somarDias(T.hojeIso(), -1);
  const limite = T.somarDias(T.hojeIso(), 10);
  const saida: Record<string, [string, string] | null> = {};
  const ex = await Config.obter('excecoes', []);
  for (const x of Array.isArray(ex) ? ex : Object.values(ex)) {
    const d = x?.data ?? '';
    if (d < inicio || d > limite) continue;
    saida[d] = (x.tipo ?? '') === 'fechado' || !x.abre ? null : [x.abre, x.fecha];
  }
  return saida;
}

/** Resumo legível dos dias abertos, ex.: "Terça a domingo, 18h às 23h30". */
export async function resumo(): Promise<string> {
  const s = await Config.obter('horarios', []);
  const abertos = (Array.isArray(s) ? s : Object.values(s)).filter((h: any) => h?.aberto);
  if (!abertos.length) return 'Consulte os horários pelo WhatsApp';
  const iguais = new Set(abertos.map((h: any) => h.abre + '-' + h.fecha)).size === 1;
  const faixa = iguais ? ', ' + hora(abertos[0].abre) + ' às ' + hora(abertos[0].fecha) : '';
  if (abertos.length === 7) return 'Todos os dias' + faixa;
  const nomes = abertos.map((h: any) => String(h.dia).toLowerCase());
  return ucfirst(nomes[0]) + ' a ' + nomes[nomes.length - 1] + faixa;
}
