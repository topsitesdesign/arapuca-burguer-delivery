/* Versão Vercel: roda a limpeza do sistema uma vez (o que o PHP fazia com Brasa\Limpeza::rodar()) e imprime o resultado em JSON. */
import { als, novoCtx } from '../../servidor/lib/base.js';
import * as Db from '../../servidor/lib/db.js';
import * as Sistema from '../../servidor/servicos/sistema.js';

await als.run(novoCtx({ ip: '127.0.0.1' }), async () => {
  try { console.log(JSON.stringify(await Sistema.rodar())); } finally { await Db.fechar(); }
});
