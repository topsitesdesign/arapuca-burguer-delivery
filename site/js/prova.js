/*
  Proteção contra pedidos feitos por robôs (ver app/lib/Prova.php): pede um desafio ao servidor e acha o número
  que fecha a conta num Worker, enquanto a pessoa preenche a sacola. Cada prova vale para um pedido e por até 1 hora.
*/
import { api } from './store.js';

const RENOVAR_MS = 50 * 60_000; // o servidor aceita por 60 min: renova antes
let atual = null; // { recebida, promessa }

function noWorker(d) {
  return new Promise((ok, falha) => {
    let w;
    try { w = new Worker('js/prova-worker.js'); } catch (e) { falha(e); return; }
    w.onmessage = ev => { w.terminate(); if (Number.isInteger(ev.data?.n)) ok(ev.data.n); else falha(new Error('prova')); };
    w.onerror = e => { w.terminate(); falha(e); };
    w.postMessage({ s: d.s, b: d.b });
  });
}

/* sem Worker (navegador antigo ou bloqueado): calcula aqui, em pedaços, com o SHA-256 do próprio navegador */
async function aqui(d) {
  const cod = new TextEncoder();
  const inteiros = d.b >> 3, resto = d.b & 7;
  for (let n = 0; ; n++) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', cod.encode(`${d.s}:${n}`)));
    let ok = true;
    for (let i = 0; i < inteiros && ok; i++) ok = h[i] === 0;
    if (ok && (resto === 0 || (h[inteiros] >> (8 - resto)) === 0)) return n;
    if (n % 2000 === 1999) await new Promise(r => setTimeout(r));
  }
}

/** Começa (ou reaproveita) a prova do próximo pedido. Pode ser chamada várias vezes: o cálculo é um só. */
export function prepararProva() {
  if (atual && Date.now() - atual.recebida < RENOVAR_MS) return atual.promessa;
  const reg = { recebida: Date.now(), promessa: null };
  reg.promessa = (async () => {
    const { desafio: d } = await api('api/desafio');
    reg.recebida = Date.now();
    let n;
    try { n = await noWorker(d); } catch { n = await aqui(d); }
    return { ...d, n };
  })();
  reg.promessa.catch(() => { if (atual === reg) atual = null; });
  atual = reg;
  return reg.promessa;
}

/** A prova foi usada (ou recusada): a próxima chamada pede outra. */
export function descartarProva() { atual = null; }
