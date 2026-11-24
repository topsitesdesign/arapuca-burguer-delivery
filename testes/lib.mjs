// Testes automáticos: ferramentas comuns (só falam com a cópia isolada em 127.0.0.1:8101-8104 e o banco testes_brasa_tmp).
// A cópia, as senhas de teste e os resultados ficam em testes/tmp (fora do Git). Para rodar tudo: bash testes/rodar.sh
import http from 'node:http';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DIR = path.join(AQUI, 'tmp');
const RAIZ = path.resolve(AQUI, '..');
export const ALVO = process.env.TESTE_ALVO === 'vercel' ? 'vercel' : 'php';
export const BANCO = ALVO === 'vercel' ? 'testes_vercel_tmp' : 'testes_brasa_tmp';
export const URL_BANCO = `postgres://postgres@127.0.0.1:5433/${BANCO}`;
export const PHP = path.join(RAIZ, '.ferramentas', 'php', 'php.exe');
export const cred = JSON.parse(fs.readFileSync(path.join(DIR, 'cred.json'), 'utf8'));
const MYSQL = path.join(RAIZ, '.ferramentas', 'mysql', 'bin', 'mysql.exe');
const MYCNF = path.join(RAIZ, '.ferramentas', 'mysql-root.cnf');
export const PORTAS = [8101, 8102, 8103, 8104];

/** SQL só no banco de testes (MySQL na versão PHP; Postgres na versão Vercel, com a consulta traduzida). */
export function sql(q) {
  if (ALVO === 'vercel') return sqlPg(q);
  return execFileSync(MYSQL, [`--defaults-extra-file=${MYCNF}`, '-h', '127.0.0.1', '-P', '3307', '-N', '-B', BANCO, '-e', q], { encoding: 'utf8' }).trim();
}

/* ---------- Postgres (versão Vercel) ---------- */
const PSQL = path.join(RAIZ, '.ferramentas', 'postgres', 'bin', 'psql.exe');

/** Acha o parêntese que fecha o que abre em s[i] (respeita aspas). */
function fecha(s, i) {
  let n = 0, aspas = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "'") aspas = !aspas;
    else if (!aspas && c === '(') n++;
    else if (!aspas && c === ')' && --n === 0) return j;
  }
  return -1;
}
/** Divide os argumentos de nível de cima (vírgulas fora de parênteses e aspas). */
function argumentos(s) {
  const out = []; let n = 0, aspas = false, ini = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === "'") aspas = !aspas;
    else if (!aspas && c === '(') n++;
    else if (!aspas && c === ')') n--;
    else if (!aspas && c === ',' && n === 0) { out.push(s.slice(ini, j).trim()); ini = j + 1; }
  }
  out.push(s.slice(ini).trim());
  return out;
}
/** Troca cada FUNCAO(...) pelo que f devolver (de dentro para fora). */
function trocarFuncao(q, nome, f) {
  const re = new RegExp(`\\b${nome}\\s*\\(`, 'i');
  let m;
  while ((m = re.exec(q))) {
    const abre = m.index + m[0].length - 1, fim = fecha(q, abre);
    q = q.slice(0, m.index) + f(q.slice(abre + 1, fim)) + q.slice(fim + 1);
  }
  return q;
}
/** Tradução das consultas dos testes (escritas para o MySQL) para o Postgres. */
export function traduzir(q) {
  q = q.replace(/\bDATABASE\(\)/gi, 'current_schema()');
  // IFNULL(numero, 'texto'): no Postgres os dois lados precisam ser do mesmo tipo
  q = trocarFuncao(q, 'IFNULL', a => { const [x, y] = argumentos(a); return `COALESCE§((${x})::text, ${y})`; });
  q = trocarFuncao(q, 'JSON_LENGTH', a => `json_array_length((${a})::json)`);
  q = trocarFuncao(q, 'JSON_EXTRACT', a => { const [x, c] = argumentos(a); return `((${x})::json->'${c.replace(/^'\$\.|'$/g, '')}')::text`; });
  // no MySQL, comparação dentro do CONCAT vira 1/0
  q = trocarFuncao(q, 'CONCAT', a => 'concat§(' + argumentos(a).map(x => /<>|[^<>!]=|\bIS\b/i.test(x) ? `(CASE WHEN ${x} THEN 1 ELSE 0 END)` : x).join(', ') + ')');
  q = trocarFuncao(q, 'GROUP_CONCAT', a => {
    const m = /^(DISTINCT\s+)?([\s\S]*?)(\s+ORDER\s+BY\s+[\s\S]*)?$/i.exec(a.trim());
    const ordem = m[3] ? m[3].trim().replace(/^ORDER\s+BY\s+/i, '') : '';
    // com DISTINCT, o Postgres exige que a ordem seja a mesma expressão agregada
    const por = !ordem ? '' : m[1] ? ` ORDER BY (${ordem})::text` : ` ORDER BY ${ordem}`;
    return `string_agg(${m[1] || ''}(${m[2]})::text, ','${por})`;
  });
  return q.replace(/concat§\(/g, 'CONCAT(').replace(/COALESCE§\(/g, 'COALESCE(');
}
function sqlPg(q) {
  const explain = /^\s*EXPLAIN\s/i.test(q);
  // tabela de teste é pequena: sem isso o Postgres prefere ler tudo e nunca mostra se o índice serve à consulta
  const cmd = explain ? `SET enable_seqscan = off; ${q}` : traduzir(q);
  const saida = execFileSync(PSQL, ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', BANCO, '-X', '-q', '-t', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // os índices usados aparecem como "Index Scan using ix_..." ou "Bitmap Index Scan on ix_..."
  if (explain) return [...saida.matchAll(/(?:Index Scan using|Index Only Scan using|Bitmap Index Scan on) (\w+)/gi)].map(m => m[1]).join('\t') + '\t' + saida.replace(/\s+/g, ' ');
  // booleanos do Postgres (t/f) saem como no MySQL (1/0)
  return saida.split('\n').map(l => l.split('\t').map(c => (c === 't' ? '1' : c === 'f' ? '0' : c)).join('\t')).join('\n');
}

let ipSeq = 0;
/** Um IP de origem novo (127.0.x.y) para cada cliente simulado. */
export function novoIp() { ipSeq++; return `127.0.${1 + Math.floor(ipSeq / 250)}.${1 + (ipSeq % 250)}`; }

export function req(o) {
  const { port = 8101, method = 'GET', path: p, headers = {}, body, ip = '127.0.0.1', jar, abortar = false, form = false } = o;
  return new Promise(resolve => {
    const t0 = performance.now();
    const data = body === undefined ? undefined : (form ? body : JSON.stringify(body));
    const h = { Accept: 'application/json', ...headers };
    if (data !== undefined) { h['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json'; h['Content-Length'] = Buffer.byteLength(data); }
    if (jar && jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: h, localAddress: ip, agent: false }, res => {
      const sc = res.headers['set-cookie'] || [];
      if (jar) for (const c of sc) { const kv = c.split(';')[0]; const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '' || v === 'deleted') jar.delete(k); else jar.set(k, v); }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', d => { buf += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch { /* não é JSON */ } resolve({ status: res.statusCode, headers: res.headers, text: buf, json, ms: performance.now() - t0, setCookie: sc }); });
    });
    r.on('error', e => resolve({ status: 0, error: e.message, ms: performance.now() - t0 }));
    r.end(data);
    if (abortar) setTimeout(() => { r.destroy(); resolve({ status: -1, abortado: true }); }, 15);
  });
}

/** Visitante novo: abre a página, guarda o cookie de sessão e o token CSRF. */
export async function sessao(ip = novoIp(), port = 8101) {
  const jar = new Map();
  const r = await req({ port, path: '/', ip, jar, headers: { Accept: 'text/html' } });
  const m = r.text.match(/<meta name="csrf" content="([a-f0-9]+)"/);
  return { jar, csrf: m ? m[1] : '', ip, port, pagina: r };
}
/** Proteção contra robôs (Prova): pede o desafio e acha o número como o navegador faz. */
export async function prova(s, x = {}) {
  const r = await req({ port: x.port || s.port, path: '/api/desafio', ip: x.ip || s.ip, jar: s.jar });
  const d = r.json?.desafio;
  if (!d) return null;
  const zerado = h => { for (let i = 0; i < d.b >> 3; i++) if (h[i] !== 0) return false; const resto = d.b & 7; return resto === 0 || (h[d.b >> 3] >> (8 - resto)) === 0; };
  let n = 0;
  while (!zerado(crypto.createHash('sha256').update(`${d.s}:${n}`).digest())) n++;
  return { ...d, n };
}
/** POST com o token CSRF da sessão. Pedido do site sem "prova" ganha uma prova válida (x.semProva: envia sem). */
export async function post(s, p, body, x = {}) {
  if (p === '/api/pedidos' && body && typeof body === 'object' && !Array.isArray(body) && !('prova' in body) && !x.semProva) body = { ...body, prova: await prova(s, x) };
  return req({ port: x.port || s.port, method: 'POST', path: p, body, ip: x.ip || s.ip, jar: s.jar, headers: { 'X-CSRF-Token': x.csrf ?? s.csrf }, abortar: x.abortar });
}
export const get = (s, p, x = {}) => req({ port: x.port || s.port, path: p, ip: x.ip || s.ip, jar: s.jar });

/** Tenta entrar no painel; devolve a sessão (com o estado, se entrou). */
export async function entrar(email, senha, ip = novoIp()) {
  const s = await sessao(ip);
  const form = new URLSearchParams({ _csrf: s.csrf, email, senha }).toString();
  const r = await req({ method: 'POST', path: '/admin/entrar', body: form, form: true, ip, jar: s.jar, headers: { Accept: 'text/html' } });
  s.login = r;
  s.entrou = r.status === 303;
  if (s.entrou) {
    const e = await get(s, '/admin/api/estado');
    if (e.json?.csrf) s.csrf = e.json.csrf;
    s.estado = e.json?.estado;
  }
  return s;
}
export const entrarComo = (id, ip) => entrar(cred[id].email, cred[id].senha, ip);

/** Fase 2: as listas do painel vão só com o que mudou e a versão de cada item (como o painel faz). */
export function mudancas(antes, agora) {
  const mapa = new Map(antes.map(x => [x.id, JSON.stringify(x)]));
  const ids = new Set(agora.map(x => x.id));
  return {
    alterados: agora.filter(x => mapa.get(x.id) !== JSON.stringify(x)).map(x => { if (mapa.has(x.id)) return x; const { versao, ...resto } = x; return resto; }),
    removidos: antes.filter(x => !ids.has(x.id)).map(x => ({ id: x.id, versao: x.versao })),
    ordem: agora.map(x => x.id),
  };
}
export async function salvarLista(s, nome, agora, antes = s.estado[nome]) {
  const r = await post(s, `/admin/api/colecao/${nome}`, { mudancas: mudancas(antes, agora) });
  if (r.status === 200 && r.json?.dados) s.estado[nome] = r.json.dados;
  return r;
}

let seq = 0;
export const chave = () => crypto.randomBytes(16).toString('hex');
export const fone = () => '119' + String(70000000 + (++seq) + Math.floor(Math.random() * 1000) * 1000).padStart(8, '0').slice(-8);
export function pedido(o = {}) {
  const modo = o.modo ?? 'retirada';
  return {
    chave: o.chave ?? chave(), nome: o.nome ?? 'Cliente Teste', telefone: o.telefone ?? fone(), modo, area: o.area ?? null,
    endereco: o.endereco ?? (modo === 'entrega' ? { rua: 'Rua de Teste', numero: '10', complemento: '', referencia: '' } : null),
    itens: o.itens ?? [{ produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] }, obs: '' }],
    pagamento: o.pagamento ?? 'pix', troco: o.troco ?? '', quando: o.quando ?? 'agora', hora: o.hora ?? '', cupom: o.cupom ?? '',
    ...(o.totalEsperado !== undefined ? { totalEsperado: o.totalEsperado } : {}), ...(o.extra || {}),
  };
}
/** Envia um pedido como um cliente novo (sessão e IP próprios). */
export async function pedir(o = {}, x = {}) {
  const s = x.sessao || await sessao(x.ip || novoIp(), x.port || 8101);
  const corpo = pedido(o);
  const r = await post(s, '/api/pedidos', corpo, { port: x.port, abortar: x.abortar });
  return { ...r, corpo, s };
}

// PNG feito à mão (para os testes de envio de imagem)
function crc32(buf) { let crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { let c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
export function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
export function png(w, h, extras = [], linhas = h) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3, 0x9a); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: linhas }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), ...extras, chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export const dataUrl = (buf, tipo = 'image/png') => `data:${tipo};base64,${buf.toString('base64')}`;

// registro dos resultados
export const R = [];
export function check(id, nome, ok, detalhe) {
  R.push({ id, nome, ok, detalhe });
  console.log(`${ok === true ? 'PASSA' : ok === false ? 'FALHA' : 'INFO '} ${id} · ${nome} — ${detalhe}`);
}
export const mediana = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
