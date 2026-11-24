/*
  Ponto de entrada único do site, do painel e da API (o index.php do PHP), para Node.
  Usado pela função da Vercel (api/index.ts) e pelo servidor local (servidor-local.ts).
*/
import type { IncomingMessage, ServerResponse } from 'node:http';
import { als, env, Fim, novoCtx, type Ctx } from './lib/base.js';
import * as Http from './lib/http.js';
import * as S from './lib/sessao.js';
import { rotas } from './rotas.js';

const LIMITE_CORPO = 9_000_000;

function lerCorpo(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok, falhou) => {
    const partes: Buffer[] = [];
    let n = 0;
    req.on('data', (b: Buffer) => { n += b.length; if (n <= LIMITE_CORPO) partes.push(b); });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', falhou);
  });
}

/** Caminho como o PHP via: sem a query, decodificado, sempre começando com "/". */
function caminhoDe(url: string): { caminho: string; query: URLSearchParams } {
  const u = new URL(url, 'http://x');
  const query = new URLSearchParams(u.search);
  let bruto = u.pathname;
  // na Vercel a reescrita chega como /api/index?__rota=/caminho
  const rota = query.get('__rota');
  if (rota !== null) { bruto = rota; query.delete('__rota'); }
  let dec = bruto;
  try { dec = decodeURIComponent(bruto); } catch { /* fica como veio */ }
  return { caminho: '/' + dec.replace(/^\/+/, ''), query };
}

function ipDe(req: IncomingMessage): string {
  if (env.vercel) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real) return real;
    const fw = req.headers['x-forwarded-for'];
    if (typeof fw === 'string' && fw) return fw.split(',')[0].trim();
  }
  return (req.socket.remoteAddress || '0.0.0.0').replace(/^::ffff:/, '');
}

export async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { caminho, query } = caminhoDe(req.url || '/');
  const cab: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) cab[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  const proto = (cab['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const c: Ctx = novoCtx({
    metodo: (req.method || 'GET').toUpperCase(), caminho, query, cab,
    corpo: ['POST', 'PUT', 'PATCH', 'DELETE'].includes((req.method || '').toUpperCase()) ? await lerCorpo(req) : Buffer.alloc(0),
    ip: ipDe(req), https: proto === 'https' || (req.socket as any).encrypted === true,
  });

  let corpo: string | Buffer = '';
  await als.run(c, async () => {
    try {
      await rotas();
    } catch (e) {
      if (e instanceof Fim) corpo = e.corpo;
      else {
        try { await Http.falha(e); } catch (e2) {
          if (e2 instanceof Fim) corpo = e2.corpo;
          else { c.status = 500; c.saida.set('Content-Type', 'text/plain; charset=utf-8'); corpo = 'Algo deu errado do nosso lado. Tente de novo em instantes.'; }
        }
      }
    }
    // a sessão é gravada no fim, como o PHP faz ao terminar o script
    try { await S.gravar(); } catch (e: any) { Http.log('sessão: ' + e?.message); }
  });

  res.statusCode = c.status;
  for (const [k, v] of c.saida) res.setHeader(k, v);
  if (c.cookies.length) res.setHeader('Set-Cookie', c.cookies);
  if (c.sessao?.enviarCookie) {
    // o PHP manda estes cabeçalhos ao abrir uma sessão nova (session.cache_limiter = nocache)
    if (!c.saida.has('Expires')) res.setHeader('Expires', 'Thu, 19 Nov 1981 08:52:00 GMT');
    if (!c.saida.has('Pragma')) res.setHeader('Pragma', 'no-cache');
  }
  res.end(c.metodo === 'HEAD' ? undefined : corpo);

  // limpeza "de carona" depois que a resposta saiu (na Vercel, mantida viva pelo waitUntil)
  if (c.depois.length) {
    const tarefa = als.run(c, async () => { for (const f of c.depois) await f(); });
    try {
      const { waitUntil } = await import('@vercel/functions');
      waitUntil(tarefa);
    } catch { /* fora da Vercel: a promessa termina sozinha */ }
    await tarefa.catch(() => undefined);
  }
}
