/*
  Instalação por linha de comando (alternativa ao /instalar do navegador): cria as tabelas no Postgres do Supabase,
  grava o cardápio da loja e o proprietário. Uso:
    DATABASE_URL=… CHAVE_SISTEMA=… npx tsx scripts/instalar.ts "Nome do dono" email@loja.com.br
  A senha é pedida pela variável SENHA_DONO (nunca na linha de comando, que fica no histórico do terminal).
*/
import { als, novoCtx } from '../servidor/lib/base.js';
import * as Db from '../servidor/lib/db.js';
import * as V from '../servidor/lib/v.js';
import * as Config from '../servidor/servicos/config.js';
import * as Sistema from '../servidor/servicos/sistema.js';
import * as Usuarios from '../servidor/servicos/usuarios.js';
import * as T from '../servidor/lib/tempo.js';

const [nome, email] = process.argv.slice(2);
const senha = process.env.SENHA_DONO || '';
if (!nome || !email || !senha) {
  console.error('uso: SENHA_DONO=… npx tsx scripts/instalar.ts "Nome do dono" email@loja');
  process.exit(2);
}

await als.run(novoCtx({ ip: '127.0.0.1' }), async () => {
  try {
    if (await Sistema.instalado()) { console.log('Já instalado.'); return; }
    const em = V.email(email, 'o e-mail');
    await Usuarios.validarSenha(senha, 'a senha', [], String(Sistema.lerSemente()?.config?.loja?.nome ?? ''));
    console.log(await Sistema.preparar(V.texto(nome, 'o nome', 2, 80), em, senha));
    await Config.gravar('instalado', T.isoHm(T.agoraMs()));
  } catch (e: any) {
    console.error('ERRO: ' + e.message);
    process.exitCode = 1;
  } finally {
    await Db.fechar();
  }
});
