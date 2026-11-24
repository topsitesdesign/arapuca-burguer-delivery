/*
  Servidor local para desenvolvimento e para a bateria de testes: faz o papel da Vercel no computador.
  Arquivos estáticos saem direto de site/ (menos app/, storage/, uploads/ e .php); o resto vai para a função.
  Uso: PORTA=8020 DATABASE_URL=… CHAVE_SISTEMA=… npx tsx servidor-local.ts
*/
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { tratar } from './servidor/app.js';

const RAIZ = process.env.RAIZ_PROJETO || process.cwd();
const SITE = path.join(RAIZ, 'site');
const PORTA = Number(process.env.PORTA || 8020);
const HOST = process.env.HOST_LOCAL || '127.0.0.1';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

function estatico(url: string): string | null {
  let caminho: string;
  try { caminho = decodeURIComponent(new URL(url, 'http://x').pathname); } catch { return null; }
  if (/^\/(app|storage|uploads)(\/|$)|\/\./.test(caminho) || caminho === '/js/data.js') return null;
  const arq = path.resolve(SITE, '.' + caminho);
  if (!arq.startsWith(SITE + path.sep) || arq.toLowerCase().endsWith('.php')) return null;
  try { return fs.statSync(arq).isFile() ? arq : null; } catch { return null; }
}

http.createServer((req, res) => {
  const arq = req.method === 'GET' || req.method === 'HEAD' ? estatico(req.url || '/') : null;
  if (arq) {
    res.setHeader('Content-Type', TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(arq));
    return;
  }
  tratar(req, res).catch(e => { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('erro'); } });
}).listen(PORTA, HOST, () => console.log(`pronto em http://${HOST}:${PORTA}`));
