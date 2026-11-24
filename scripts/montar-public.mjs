/*
  Build da Vercel: copia os arquivos públicos de site/ para public/ (o que a Vercel entrega direto, sem passar pela função)
  e grava em servidor/gerado/estaticos.json a lista de fotos e da logo, que a função usa para saber o que existe.
  Fica de fora o que o .htaccess bloqueava: app/, storage/, uploads/, arquivos .php, ocultos e .sql/.md/.log/.ini/.sh/.lock/.txt
  (menos robots.txt).
*/
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const SITE = path.join(RAIZ, 'site');
const SAIDA = path.join(RAIZ, 'public');
const BLOQUEADO = /\.(php\d?|phtml|sql|md|log|ini|sh|lock|txt)$/i;

fs.rmSync(SAIDA, { recursive: true, force: true });
const lista = [];
let n = 0;

function copiar(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.name.startsWith('.')) continue;
    if (!rel && ['app', 'storage', 'uploads'].includes(e.name)) continue;
    const origem = path.join(dir, e.name);
    if (e.isDirectory()) { copiar(origem, r); continue; }
    if (BLOQUEADO.test(e.name) && r !== 'robots.txt') continue;
    if (r === 'js/data.js') continue; // gerado pela função a partir do banco
    const destino = path.join(SAIDA, r);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origem, destino);
    n++;
    if (r.startsWith('assets/img/') || r.startsWith('marca/')) lista.push(r);
  }
}

copiar(SITE, '');
fs.mkdirSync(path.join(RAIZ, 'servidor', 'gerado'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'servidor', 'gerado', 'estaticos.json'), JSON.stringify(lista.sort()));
console.log(`public/: ${n} arquivos; estaticos.json: ${lista.length} fotos e marcas`);
