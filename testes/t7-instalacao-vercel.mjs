// Versão Vercel: instalação nova pelo navegador (/instalar), como o dono faz depois de publicar na Vercel:
// banco Postgres vazio próprio (testes_vercel_inst), código de instalação na variável CODIGO_INSTALACAO e servidor em 127.0.0.1:8105.
// Tudo é apagado no fim. Resultado em resultados-7.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { DIR, req, sessao, check, R } from './lib.mjs';

const RAIZ = path.resolve(DIR, '..', '..');
const PSQL = path.join(RAIZ, '.ferramentas', 'postgres', 'bin', 'psql.exe');
const BANCO = 'testes_vercel_inst';
const PORTA = 8105;
const psql = (q, banco = 'postgres') => execFileSync(PSQL, ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', banco, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const semente = (() => { const php = fs.readFileSync(path.join(RAIZ, 'site', 'app', 'sql', 'semente.php'), 'utf8'); return JSON.parse(php.slice(php.indexOf("<<<'JSON'\n") + 10, php.lastIndexOf('\nJSON,'))); })();
const loja = semente.config.loja.nome;

psql(`DROP DATABASE IF EXISTS ${BANCO}`);
psql(`CREATE DATABASE ${BANCO}`);

const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
const servidor = spawn(process.execPath, ['--import', 'tsx', path.join(RAIZ, 'servidor-local.ts')], {
  cwd: RAIZ, stdio: 'ignore',
  env: { ...process.env, PORTA: String(PORTA), DATABASE_URL: `postgres://postgres@127.0.0.1:5433/${BANCO}`, CODIGO_INSTALACAO: codigo, AMBIENTE: 'producao', UPLOADS_DIR: path.join(DIR, 'inst-uploads') },
});
const instalado = () => { try { return psql("SELECT COUNT(*) FROM configuracoes WHERE chave = 'instalado'", BANCO) === '1'; } catch { return false; } };
const limpar = () => {
  servidor.kill();
  try { psql(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`); } catch { /* já apagado */ }
  fs.rmSync(path.join(DIR, 'inst-uploads'), { recursive: true, force: true });
};
try {
  let pronto = false;
  for (let i = 0; i < 60 && !pronto; i++) { pronto = (await req({ port: PORTA, path: '/instalar', headers: { Accept: 'text/html' } })).status === 200; if (!pronto) await new Promise(r => setTimeout(r, 250)); }

  const jar = new Map();
  const form = await req({ port: PORTA, path: '/instalar', jar, headers: { Accept: 'text/html' } });
  const csrf = form.text?.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
  check('INST-01', 'Site novo, banco vazio, abre o instalador', form.status === 200 && csrf !== '', `HTTP ${form.status}${csrf ? ' · formulário com CSRF' : ' · sem CSRF'}`);

  const enviar = (senha, cod = codigo) => req({
    port: PORTA, method: 'POST', path: '/instalar', jar, form: true, headers: { Accept: 'text/html' },
    body: new URLSearchParams({ _csrf: csrf, codigo: cod, nome: 'Dono da loja', email: 'dono@loja.test', senha, senha2: senha }).toString(),
  });
  const erro = r => (r.text?.match(/<p class="erro"[^>]*>([^<]*)/)?.[1] || '').trim();

  const errado = await enviar('Inst-' + crypto.randomBytes(9).toString('hex'), 'CODIGOERRADO');
  check('INST-01b', 'Código de instalação errado é recusado, sem instalar nada', errado.status !== 200 || (!!erro(errado) && !instalado()), `HTTP ${errado.status} · ${erro(errado) || 'sem mensagem de erro'}`);

  const palavra = loja.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).find(p => p.replace(/[^A-Za-z0-9]/g, '').length >= 4) || loja;
  const fraca = await enviar(`${palavra.toLowerCase()}#2026xyz`);
  check('INST-02', 'Senha com o nome da loja é recusada na instalação, sem instalar nada', /fácil de adivinhar/.test(erro(fraca)) && !instalado(), `HTTP ${fraca.status} · ${erro(fraca) || 'sem mensagem de erro'}`);

  const senha = 'Inst-' + crypto.randomBytes(9).toString('hex');
  const ok = await enviar(senha);
  check('INST-03', 'Instalação pelo navegador termina e marca o banco como instalado', /Tudo pronto/.test(ok.text || '') && instalado(), `HTTP ${ok.status} · ${erro(ok) || (/Tudo pronto/.test(ok.text || '') ? 'Tudo pronto' : 'sem a mensagem de sucesso')}`);

  const depois = await req({ port: PORTA, path: '/instalar', headers: { Accept: 'text/html' } });
  const repete = await enviar(senha);
  check('INST-04', 'Depois de instalado, /instalar responde 404 (o código não serve mais)', depois.status === 404 && repete.status === 404, `GET HTTP ${depois.status} · POST HTTP ${repete.status}`);

  const noBanco = q => { try { return psql(q, BANCO); } catch { return 'sem tabela'; } };
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
}

fs.writeFileSync(path.join(DIR, 'resultados-7.json'), JSON.stringify(R, null, 1));
const f = R.filter(r => r.ok === false).length, ok = R.filter(r => r.ok === true).length;
console.log(`\n${ok} passaram, ${f} falharam`);
