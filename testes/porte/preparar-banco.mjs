/*
  Versão Vercel: monta o banco de testes no Postgres local com a mesma demonstração da versão PHP.
  1) cria as tabelas (servidor/sql/schema.sql)  2) lê os INSERT do testes/fixture-demo.sql (formato do MySQL),
  converte os valores e grava coluna por coluna  3) marca como instalado  4) cria os usuários de teste
  (senhas em testes/tmp/cred.json, nunca impressas) e deixa aud-admin como proprietário.
  Uso: node testes/porte/preparar-banco.mjs <url do banco>   (só aceita banco cujo nome começa com "testes_")
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const url = process.argv[2] || '';
if (!/\/testes_[a-z_]+$/.test(url)) { console.error('banco errado'); process.exit(1); }
const db = new pg.Client({ connectionString: url });
await db.connect();

await db.query(fs.readFileSync(path.join(RAIZ, 'servidor', 'sql', 'schema.sql'), 'utf8'));

/* ---------- leitura do dump do MySQL ---------- */
const dump = fs.readFileSync(path.join(RAIZ, 'testes', 'fixture-demo.sql'), 'utf8');
const colunas = {};
for (const m of dump.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\n\)/g)) {
  colunas[m[1]] = [...m[2].matchAll(/^\s+`(\w+)`/gm)].map(x => x[1]);
}
/** Lê "(v1,v2,...),(...)" no formato do mysqldump e devolve as linhas. */
function linhas(s) {
  const out = []; let i = 0, linha = null;
  const ESC = { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a', b: '\b' };
  while (i < s.length) {
    const c = s[i];
    if (c === '(' && !linha) { linha = []; i++; continue; }
    if (c === ')' && linha) { out.push(linha); linha = null; i++; continue; }
    if (!linha || c === ',' || c === ' ') { i++; continue; }
    if (c === "'") {
      let v = ''; i++;
      while (s[i] !== "'") { if (s[i] === '\\') { i++; v += ESC[s[i]] ?? s[i]; } else v += s[i]; i++; }
      i++; linha.push(v); continue;
    }
    let j = i; while (s[j] !== ',' && s[j] !== ')') j++;
    const bruto = s.slice(i, j); i = j;
    linha.push(bruto === 'NULL' ? null : Number(bruto));
  }
  return out;
}
const tabelasPg = async t => (await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [t])).rows.map(r => r.column_name);

for (const m of dump.matchAll(/^INSERT INTO `(\w+)`(?: \(([^)]*)\))? VALUES (.*);$/gm)) {
  const t = m[1];
  const cols = m[2] ? m[2].split(',').map(x => x.trim().replace(/`/g, '')) : colunas[t];
  const noPg = new Set(await tabelasPg(t));
  const usar = cols.map((c, i) => [c, i]).filter(([c]) => noPg.has(c));
  const faltam = cols.filter(c => !noPg.has(c));
  if (faltam.length) console.log(`  ${t}: colunas sem par no Postgres, ignoradas: ${faltam.join(', ')}`);
  let n = 0;
  for (const l of linhas(m[3])) {
    const vals = usar.map(([, i]) => l[i]);
    await db.query(`INSERT INTO ${t} (${usar.map(([c]) => c).join(', ')}) VALUES (${vals.map((_, k) => '$' + (k + 1)).join(', ')})`, vals);
    n++;
  }
  console.log(`  ${t}: ${n} linhas`);
}
await db.query("INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES ('instalado', '\"teste\"', 0) ON CONFLICT (chave) DO NOTHING");

/* ---------- usuários de teste (como o criar-usuarios.php) ---------- */
const todas = ['pedidos', 'produtos', 'cupons', 'areas', 'banners', 'configuracoes', 'usuarios'];
const usuarios = {
  'aud-admin': ['Auditoria Admin', 'Administrador', todas],
  'aud-produtos': ['Auditoria Cardapio', 'Atendente', ['produtos']],
  'aud-cozinha': ['Auditoria Cozinha', 'Cozinha', ['pedidos']],
  'aud-gerente': ['Auditoria Gerente', 'Gerente', ['pedidos', 'usuarios']],
};
const cred = {};
let ordem = 10;
for (const [id, [nome, funcao, perm]] of Object.entries(usuarios)) {
  const senha = 'T' + crypto.randomBytes(9).toString('hex');
  const email = `${id}@auditoria.example`;
  await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
  await db.query('INSERT INTO usuarios (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, nome, email, bcrypt.hashSync(senha, 10), funcao, JSON.stringify(perm), 'ativo', ordem++, Date.now()]);
  cred[id] = { email, senha };
}
fs.mkdirSync(path.join(RAIZ, 'testes', 'tmp'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'testes', 'tmp', 'cred.json'), JSON.stringify(cred, null, 2));
await db.query("INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES ('proprietario', '\"aud-admin\"', 0) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor");
console.log('usuários de teste criados: ' + Object.keys(cred).join(', '));
await db.end();
