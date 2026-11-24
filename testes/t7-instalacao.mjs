// Instalação nova pelo navegador (/instalar), como o dono faz na hospedagem: cópia do site sem app/config.php,
// banco vazio próprio (testes_brasa_inst) e servidor em 127.0.0.1:8105. Tudo é apagado no fim. Resultado em resultados-7.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { DIR, PHP, req, sessao, check, R } from './lib.mjs';

const RAIZ = path.resolve(DIR, '..', '..');
const MYSQL = path.join(RAIZ, '.ferramentas', 'mysql', 'bin', 'mysql.exe');
const MYCNF = path.join(RAIZ, '.ferramentas', 'mysql-root.cnf');
const BANCO = 'testes_brasa_inst';
const PORTA = 8105;
const SITE = path.join(DIR, 'inst-site');
const root = (q, banco = []) => execFileSync(MYSQL, [`--defaults-extra-file=${MYCNF}`, '-h', '127.0.0.1', '-P', '3307', '-N', '-B', ...banco, '-e', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const php = codigo => execFileSync(PHP, ['-r', codigo], { encoding: 'utf8' }).trim();

// usuário da aplicação: o mesmo da cópia de testes (rodar.sh já montou o config dela)
const banco = JSON.parse(php(`define('BRASA', 1); echo json_encode((require ${JSON.stringify(path.join(DIR, 'site', 'app', 'config.php'))})['banco']);`));
const loja = php(`define('BRASA', 1); echo (require ${JSON.stringify(path.join(RAIZ, 'site', 'app', 'sql', 'semente.php'))})['config']['loja']['nome'];`);

root(`DROP DATABASE IF EXISTS ${BANCO}`);
root(`CREATE DATABASE ${BANCO} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
root(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, CREATE TEMPORARY TABLES, LOCK TABLES ON ${BANCO}.* TO '${banco.usuario}'@'127.0.0.1'`);

// cópia do site como sai do pacote: sem config, com o código de instalação
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(path.join(RAIZ, 'site'), SITE, { recursive: true });
for (const f of ['config.php', 'instalacao.php']) fs.rmSync(path.join(SITE, 'app', f), { force: true });
for (const d of ['storage', path.join('storage', 'logs'), 'uploads']) for (const f of fs.readdirSync(path.join(SITE, d), { withFileTypes: true })) if (f.isFile() && !/^\.(gitkeep|htaccess)$/.test(f.name)) fs.rmSync(path.join(SITE, d, f.name));
const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
fs.writeFileSync(path.join(SITE, 'app', 'instalacao.php'), `<?php\ndefined('BRASA') || exit;\nreturn '${codigo}';\n`);

const servidor = spawn(PHP, ['-S', `127.0.0.1:${PORTA}`, '-t', '.', 'index.php'], { cwd: SITE, stdio: 'ignore' });
const limpar = () => {
  servidor.kill();
  try { root(`REVOKE ALL PRIVILEGES ON ${BANCO}.* FROM '${banco.usuario}'@'127.0.0.1'`); } catch { /* já sem permissão */ }
  root(`DROP DATABASE IF EXISTS ${BANCO}`);
};
try {
  let pronto = false;
  for (let i = 0; i < 40 && !pronto; i++) { pronto = (await req({ port: PORTA, path: '/instalar', headers: { Accept: 'text/html' } })).status === 200; if (!pronto) await new Promise(r => setTimeout(r, 250)); }

  const jar = new Map();
  const form = await req({ port: PORTA, path: '/instalar', jar, headers: { Accept: 'text/html' } });
  const csrf = form.text?.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  check('INST-01', 'Site novo, sem configuração, abre o instalador', form.status === 200 && csrf !== '', `HTTP ${form.status}${csrf ? ' · formulário com CSRF' : ' · sem CSRF'}`);

  const enviar = senha => req({
    port: PORTA, method: 'POST', path: '/instalar', jar, form: true, headers: { Accept: 'text/html' },
    body: new URLSearchParams({ _csrf: csrf, codigo, db_host: banco.host, db_porta: String(banco.porta), db_nome: BANCO, db_usuario: banco.usuario, db_senha: banco.senha, nome: 'Dono da loja', email: 'dono@loja.test', senha, senha2: senha }).toString(),
  });
  const erro = r => (r.text?.match(/<p class="erro"[^>]*>([^<]*)/)?.[1] || '').trim();

  // a regra "sem o nome da loja na senha" vale já na instalação, com o nome que vem na semente
  const palavra = loja.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).find(p => p.replace(/[^A-Za-z0-9]/g, '').length >= 4) || loja;
  const fraca = await enviar(`${palavra.toLowerCase()}#2026xyz`);
  check('INST-02', 'Senha com o nome da loja é recusada na instalação, sem instalar nada', /fácil de adivinhar/.test(erro(fraca)) && !fs.existsSync(path.join(SITE, 'app', 'config.php')), `HTTP ${fraca.status} · ${erro(fraca) || 'sem mensagem de erro'}`);

  const senha = 'Inst-' + crypto.randomBytes(9).toString('hex');
  const ok = await enviar(senha);
  check('INST-03', 'Instalação pelo navegador termina e cria app/config.php', /Tudo pronto/.test(ok.text || '') && fs.existsSync(path.join(SITE, 'app', 'config.php')), `HTTP ${ok.status} · ${erro(ok) || (/Tudo pronto/.test(ok.text || '') ? 'Tudo pronto' : 'sem a mensagem de sucesso')}`);

  const depois = await req({ port: PORTA, path: '/instalar', headers: { Accept: 'text/html' } });
  check('INST-04', 'Depois de instalado, /instalar responde 404 e o código de instalação some', depois.status === 404 && !fs.existsSync(path.join(SITE, 'app', 'instalacao.php')), `HTTP ${depois.status}`);

  const noBanco = q => { try { return root(q, [BANCO]); } catch { return 'sem tabela'; } };
  const usuarios = noBanco('SELECT COUNT(*) FROM usuarios');
  const dono = noBanco("SELECT valor FROM configuracoes WHERE chave = 'proprietario'");
  const produtos = Number(noBanco('SELECT COUNT(*) FROM produtos')) || 0;
  check('INST-05', 'Banco novo com o cardápio da semente e o dono como proprietário', usuarios === '1' && dono === '"u1"' && produtos > 0, `${usuarios} usuário · proprietário ${dono} · ${produtos} produtos`);

  const s = await sessao('127.0.0.1', PORTA);
  const entrou = await req({ port: PORTA, method: 'POST', path: '/admin/entrar', jar: s.jar, form: true, headers: { Accept: 'text/html' }, body: new URLSearchParams({ _csrf: s.csrf, email: 'dono@loja.test', senha }).toString() });
  const estado = await req({ port: PORTA, path: '/admin/api/estado', jar: s.jar });
  check('INST-06', 'O dono entra no painel com o e-mail e a senha da instalação', entrou.status === 303 && /\/admin\/$/.test(entrou.headers?.location || '') && estado.status === 200 && !!estado.json?.estado, `entrar: HTTP ${entrou.status} → ${entrou.headers?.location || '-'} · estado do painel: HTTP ${estado.status}`);
} finally {
  limpar();
  fs.rmSync(SITE, { recursive: true, force: true });
}

fs.writeFileSync(path.join(DIR, 'resultados-7.json'), JSON.stringify(R, null, 1));
const f = R.filter(r => r.ok === false).length, ok = R.filter(r => r.ok === true).length;
console.log(`\n${ok} passaram, ${f} falharam`);
