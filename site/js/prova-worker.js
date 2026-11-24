/*
  Proteção contra robôs (ver prova.js e app/lib/Prova.php), fora da tela principal:
  acha o menor n em que o SHA-256 de "sal:n" começa com b bits zerados (b até 32).
  O texto tem no máximo 55 caracteres, então cabe num bloco só do SHA-256.
*/
'use strict';
const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Int32Array(64);

/** Primeiros 32 bits do SHA-256 de um texto ASCII de até 55 caracteres. */
function primeiraPalavra(txt) {
  const L = txt.length;
  W.fill(0, 0, 16);
  for (let i = 0; i < L; i++) W[i >> 2] |= txt.charCodeAt(i) << (24 - (i & 3) * 8);
  W[L >> 2] |= 0x80 << (24 - (L & 3) * 8);
  W[15] = L * 8;
  for (let i = 16; i < 64; i++) {
    const x = W[i - 15], y = W[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = 0x6a09e667 | 0, b = 0xbb67ae85 | 0, c = 0x3c6ef372 | 0, d = 0xa54ff53a | 0;
  let e = 0x510e527f | 0, f = 0x9b05688c | 0, g = 0x1f83d9ab | 0, h = 0x5be0cd19 | 0;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + S0 + maj) | 0;
  }
  return (a + 0x6a09e667) >>> 0;
}

self.onmessage = ev => {
  const { s, b } = ev.data || {};
  if (typeof s !== 'string' || s.length > 40 || !(b >= 1 && b <= 32)) { self.postMessage({ erro: true }); return; }
  const prefixo = s + ':';
  const desloca = 32 - b;
  for (let n = 0; n < 4294967296; n++) {
    if ((primeiraPalavra(prefixo + n) >>> desloca) === 0) { self.postMessage({ n }); return; }
  }
  self.postMessage({ erro: true });
};
