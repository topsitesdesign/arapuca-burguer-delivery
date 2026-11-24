/** Validação no servidor: tudo que chega é conferido (tipo, tamanho, faixa e formato). Mesmas regras e mensagens do PHP. */
import { Erro, ehArray, mbLen, trim, ucfirst } from './base.js';

const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** is_numeric do PHP (aceita espaços nas pontas, sinal, decimal e expoente). */
export const numerico = (v: unknown): boolean =>
  (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(v));

export function texto(v: unknown, rotulo: string, min = 0, max = 200, campo: string | null = null): string {
  let s = typeof v === 'string' || ehNumero(v) ? trim(String(v)) : '';
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/gu, '');
  s = s.replace(/\s{3,}/gu, '  ');
  const n = mbLen(s);
  if (n < min) throw new Erro(min <= 1 ? `Preencha ${rotulo}.` : `${ucfirst(rotulo)} precisa ter pelo menos ${min} caracteres.`, 422, campo);
  if (n > max) throw new Erro(`${ucfirst(rotulo)} pode ter no máximo ${max} caracteres.`, 422, campo);
  return s;
}

export function inteiro(v: unknown, rotulo: string, min: number, max: number, campo: string | null = null): number {
  if (typeof v === 'string' && /^-?\d+$/.test(trim(v))) v = parseInt(trim(v), 10);
  if (!ehNumero(v) || !Number.isInteger(v) || v < min || v > max) throw new Erro(`Use um número de ${min} a ${max} em ${rotulo}.`, 422, campo);
  return v;
}

/** Valor em reais (número ou texto "38,90") → centavos. */
export function centavos(v: unknown, rotulo: string, max = 100_000_000, nulo = false, campo: string | null = null): number | null {
  if (nulo && (v === null || v === undefined || v === '')) return null;
  if (typeof v === 'string') {
    let t = v.replace(/R\$/g, '').replace(/ /g, '').replace(/ /g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(/,/g, '.');
    v = numerico(t) ? parseFloat(t) : null;
  }
  if (!ehNumero(v)) throw new Erro(`Informe um valor em reais em ${rotulo}.`, 422, campo);
  const x = v * 100;
  const c = x < 0 ? -Math.round(-x) : Math.round(x);
  if (c < 0 || c > max) throw new Erro(`Valor fora do permitido em ${rotulo}.`, 422, campo);
  return c;
}
/** centavos() sem nulo: sempre um número. */
export const centavosN = (v: unknown, rotulo: string, max = 100_000_000, campo: string | null = null): number => centavos(v, rotulo, max, false, campo) as number;

export const bool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';

export function id(v: unknown, rotulo = 'um item'): string {
  if (typeof v !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,59}$/.test(v)) throw new Erro(`Identificador inválido em ${rotulo}.`, 422);
  return v;
}

function dataOk(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
}
export function data(v: unknown, rotulo: string, campo: string | null = null): string {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m || !dataOk(+m[1], +m[2], +m[3])) throw new Erro(`Escolha uma data válida em ${rotulo}.`, 422, campo);
  return v as string;
}

export function hora(v: unknown, rotulo: string): string {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Erro(`Use o formato 18:00 em ${rotulo}.`, 422);
  return v;
}

export function opcao<T extends string>(v: unknown, permitidos: readonly T[], rotulo: string, campo: string | null = null): T {
  if (typeof v !== 'string' || !(permitidos as readonly string[]).includes(v)) throw new Erro(`Escolha uma opção válida em ${rotulo}.`, 422, campo);
  return v as T;
}

/** WhatsApp/telefone com DDD: devolve só os números. */
export function telefone(v: unknown, rotulo = 'o WhatsApp', campo: string | null = 'telefone'): string {
  let d = (typeof v === 'string' ? v : '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) throw new Erro(`Confira ${rotulo} com DDD, por exemplo (11) 98765-4321.`, 422, campo);
  return d;
}

/** Equivalente prático do FILTER_VALIDATE_EMAIL. */
const EMAIL = /^(?!\.)(?!.*\.\.)[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}(?<!\.)@(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
export function email(v: unknown, rotulo = 'o e-mail'): string {
  const s = typeof v === 'string' ? trim(v).toLowerCase() : '';
  if (mbLen(s) > 120 || !EMAIL.test(s)) throw new Erro(`Confira ${rotulo}.`, 422, 'email');
  return s;
}

export function lista(v: unknown, rotulo: string, maximo = 500): any[] {
  if (!Array.isArray(v)) throw new Erro(`Formato inválido em ${rotulo}.`, 400);
  if (v.length > maximo) throw new Erro(`Itens demais em ${rotulo} (máximo de ${maximo}).`, 422);
  return v;
}

export function objeto(v: unknown, rotulo: string): Record<string, any> {
  if (Array.isArray(v)) { if (v.length === 0) return {}; throw new Erro(`Formato inválido em ${rotulo}.`, 400); }
  if (!ehArray(v)) throw new Erro(`Formato inválido em ${rotulo}.`, 400);
  return v as Record<string, any>;
}
