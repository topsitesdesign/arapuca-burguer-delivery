/*
  Datas e horas: no banco, milissegundos desde 1970 (UTC); para as pessoas, horário de Brasília.
  O Brasil não tem horário de verão desde 2019: America/Sao_Paulo é sempre UTC−3, então as contas de calendário
  usam esse deslocamento fixo (mesmos resultados do DateTimeImmutable do PHP para datas atuais).
*/
export const FUSO = 'America/Sao_Paulo';
const DESLOC = 3 * 3600_000;

export interface Partes { ano: number; mes: number; dia: number; hora: number; min: number; seg: number; semana: number }

export const agoraMs = (): number => Date.now();
export const agoraSeg = (): number => Math.floor(Date.now() / 1000);

/** Partes de um instante no horário de Brasília (semana: 0 = domingo). */
export function partes(ms: number): Partes {
  const d = new Date(ms - DESLOC);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), hora: d.getUTCHours(), min: d.getUTCMinutes(), seg: d.getUTCSeconds(), semana: d.getUTCDay() };
}

/** Instante de uma data e hora de Brasília (aceita dia/mês fora da faixa, como o modify do PHP). */
export function msDe(ano: number, mes: number, dia: number, hora = 0, min = 0, seg = 0): number {
  return Date.UTC(ano, mes - 1, dia, hora, min, seg) + DESLOC;
}

const p2 = (n: number): string => String(n).padStart(2, '0');
export const iso = (ms: number): string => { const p = partes(ms); return `${p.ano}-${p2(p.mes)}-${p2(p.dia)}`; };
export const hm = (ms: number): string => { const p = partes(ms); return `${p2(p.hora)}:${p2(p.min)}`; };
export const dmy = (ms: number): string => { const p = partes(ms); return `${p2(p.dia)}/${p2(p.mes)}/${p.ano}`; };
export const dm = (ms: number): string => { const p = partes(ms); return `${p2(p.dia)}/${p2(p.mes)}`; };
export const isoHm = (ms: number): string => `${iso(ms)} ${hm(ms)}`;
export const hojeIso = (): string => iso(agoraMs());
export const ano = (): string => String(partes(agoraMs()).ano);

/** 00:00 de um dia (YYYY-MM-DD) em Brasília, em ms. */
export function inicioDoDiaMs(d: string): number {
  const [a, m, di] = d.split('-').map(Number);
  return msDe(a, m, di);
}
export const hojeMs = (): number => inicioDoDiaMs(hojeIso());
/** O dia (YYYY-MM-DD) n dias depois/antes. */
export function somarDias(d: string, n: number): string {
  const [a, m, di] = d.split('-').map(Number);
  return iso(msDe(a, m, di + n));
}
/** Mesmo instante n meses antes/depois (com o transbordo de dias do PHP: 31/03 − 1 mês = 03/03). */
export function somarMeses(ms: number, n: number): number {
  const p = partes(ms);
  return msDe(p.ano, p.mes + n, p.dia, p.hora, p.min, p.seg);
}
/** Dia da semana de uma data: 1 = segunda … 7 = domingo (format('N') do PHP). */
export function diaN(d: string): number {
  const s = partes(inicioDoDiaMs(d)).semana;
  return s === 0 ? 7 : s;
}

/** number_format($v, 2, ',', '.'). */
export function numeroBr(v: number): string {
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}
export const brl = (centavos: number): string => 'R$ ' + numeroBr(centavos / 100);
export const reais = (centavos: number | null | undefined): number | null =>
  centavos === null || centavos === undefined ? null : Math.round(centavos) / 100;
export const dataBr = (d: string): string => d.split('-').reverse().join('/');
