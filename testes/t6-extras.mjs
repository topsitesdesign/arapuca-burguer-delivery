// Ajustes depois da fase 2: proteção contra robôs, pedido repetido, cupom por endereço e banco versão 3.
// Roda na cópia isolada (127.0.0.1:8101-8104, banco testes_brasa_tmp). Resultado em resultados-6.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DIR, cred, sql, sessao, post, req, entrarComo, pedido, pedir, prova, chave, fone, check, R } from './lib.mjs';

const refri = { produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] }, obs: '' };
const burger = { produtoId: 'brasa-bacon', qtd: 1, escolhas: { 'g-ponto': ['ao-ponto'], 'g-extras': ['bacon-extra'] }, obs: '' };
const n = q => Number(sql(q));
const adm = await entrarComo('aud-admin');
const coz = await entrarComo('aud-cozinha');
if (!adm.entrou || !coz.entrou) { console.log('não entrou'); process.exit(1); }
sql('DELETE FROM tentativas');

/* ---------- banco versão 3 ---------- */
{
  const v = sql("SELECT valor FROM configuracoes WHERE chave = 'versaoBanco'");
  const cols = sql("SELECT GROUP_CONCAT(CONCAT(TABLE_NAME, '.', COLUMN_NAME) ORDER BY TABLE_NAME, COLUMN_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('assinatura', 'endereco_chave', 'predio_chave')");
  check('F3-BD', 'Banco atualizado para a versão 3 (assinatura do pedido e chaves de endereço)', v === '3' && cols === 'cupom_usos.endereco_chave,cupom_usos.predio_chave,pedidos.assinatura', `versaoBanco = ${v} · ${cols}`);
  const semChave = n("SELECT COUNT(*) FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero WHERE p.endereco IS NOT NULL AND p.anonimizado_em IS NULL AND u.predio_chave = ''");
  const comChave = n("SELECT COUNT(*) FROM cupom_usos WHERE predio_chave <> ''");
  check('F3-BD', 'Usos de cupom de antes da atualização ganharam a chave do endereço', semChave === 0, `${comChave} com chave · ${semChave} sem chave`);
}

/* ---------- proteção contra robôs ---------- */
{
  const s = await sessao();
  const d = await req({ path: '/api/desafio', ip: s.ip, jar: s.jar });
  const ds = d.json?.desafio;
  check('F3-ROBO', 'O servidor entrega um desafio assinado (sem guardar nada)', d.status === 200 && /^[a-f0-9]{32}$/.test(ds?.s || '') && ds?.b >= 16 && /^[a-f0-9]{64}$/.test(ds?.a || ''), `HTTP ${d.status} · ${ds?.b} bits`);

  let x = await post(s, '/api/pedidos', pedido({ itens: [refri] }), { semProva: true });
  check('F3-ROBO', 'Pedido sem a prova é recusado', x.status === 422 && x.json?.campo === 'prova', `HTTP ${x.status} · ${x.json?.erro}`);

  const p = await prova(s);
  let errado = p.n + 1;
  while (crypto.createHash('sha256').update(`${p.s}:${errado}`).digest().readUInt16BE(0) === 0) errado++;
  x = await post(s, '/api/pedidos', pedido({ itens: [refri], extra: { prova: { ...p, n: errado } } }));
  check('F3-ROBO', 'Prova com a conta errada é recusada', x.status === 422 && x.json?.campo === 'prova', `HTTP ${x.status} · ${x.json?.erro}`);

  x = await post(s, '/api/pedidos', pedido({ itens: [refri], extra: { prova: { ...p, b: 1 } } }));
  check('F3-ROBO', 'Desafio alterado pelo navegador (menos zeros) é recusado', x.status === 422 && x.json?.campo === 'prova', `HTTP ${x.status}`);

  x = await post(s, '/api/pedidos', pedido({ itens: [refri], extra: { prova: { ...p, t: p.t - 7200, a: p.a } } }));
  check('F3-ROBO', 'Desafio com o horário trocado (para parecer novo ou velho) é recusado', x.status === 422 && x.json?.campo === 'prova', `HTTP ${x.status}`);

  x = await post(s, '/api/pedidos', pedido({ itens: [refri], extra: { prova: p } }));
  check('F3-ROBO', 'Prova certa: o pedido entra', x.status === 201, `HTTP ${x.status} · ${x.json?.erro || '#' + x.json?.pedido?.numero}`);
  const y = await post(s, '/api/pedidos', pedido({ itens: [burger], extra: { prova: p } }));
  check('F3-ROBO', 'A mesma prova não vale para um segundo pedido', y.status === 422 && y.json?.campo === 'prova', `HTTP ${y.status} · ${y.json?.erro}`);

  const k = chave();
  const corpo = pedido({ chave: k, itens: [refri, refri] });
  const p2 = await prova(s);
  const duplo = await Promise.all([1, 2, 3].map(() => post(s, '/api/pedidos', { ...corpo, prova: p2 })));
  const nums = new Set(duplo.filter(r => r.json?.pedido).map(r => r.json.pedido.numero));
  check('F3-ROBO', 'Clique duplo com a mesma prova: 1 pedido só, e todos recebem o mesmo número', nums.size === 1 && duplo.every(r => [200, 201].includes(r.status)) && n(`SELECT COUNT(*) FROM pedidos WHERE chave_envio = '${k}'`) === 1,
    `respostas ${duplo.map(r => r.status).join(',')} · números ${[...nums].join(',')}`);

  x = await post(s, '/api/pedidos', pedido({ itens: [burger, refri], extra: { hp: 'https://spam.example' } }));
  check('F3-ROBO', 'Campo escondido preenchido (robô) é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);

  const pg = await req({ path: '/', headers: { Accept: 'text/html' } });
  const js = await req({ path: '/js/app.js' });
  const w = await req({ path: '/js/prova-worker.js' });
  check('F3-ROBO', 'Site carrega a proteção (prova.js e o Worker) e o campo escondido', pg.status === 200 && /prova\.js/.test(js.text) && /name="extra"/.test(js.text) && w.status === 200 && /primeiraPalavra/.test(w.text), `app.js ${js.status} · worker ${w.status}`);
}

/* ---------- pedido repetido ---------- */
{
  const tel = fone();
  const endereco = { rua: 'Rua Repetida', numero: '77', complemento: '', referencia: '' };
  const a = await pedir({ telefone: tel, modo: 'entrega', area: 'centro', endereco, itens: [burger, refri] });
  const b = await pedir({ telefone: tel, modo: 'entrega', area: 'centro', endereco: { ...endereco, rua: 'R. Repetida' }, itens: [refri, burger] });
  check('F3-REP', 'Mesmo pedido do mesmo WhatsApp em poucos minutos (outra ordem na sacola, endereço escrito de outro jeito): pergunta antes (409)',
    a.status === 201 && b.status === 409 && b.json?.campo === 'repetido' && b.json?.repetido?.numero === a.json?.pedido?.numero && b.json?.repetido?.codigo === a.json?.pedido?.codigo,
    `1º HTTP ${a.status} #${a.json?.pedido?.numero}; 2º HTTP ${b.status} · ${b.json?.erro}`);
  const c = await pedir({ telefone: tel, modo: 'entrega', area: 'centro', endereco, itens: [burger] });
  check('F3-REP', 'Pedido diferente do mesmo WhatsApp entra normalmente', c.status === 201, `HTTP ${c.status}`);
  const d = await pedir({ telefone: fone(), modo: 'entrega', area: 'centro', endereco, itens: [burger, refri] });
  check('F3-REP', 'O mesmo pedido de outro WhatsApp entra normalmente', d.status === 201, `HTTP ${d.status}`);
  const r = await post(coz, `/admin/api/pedidos/${a.json.pedido.numero}/status`, { para: 'recusado', motivo: 'Teste de pedido repetido' });
  const e = await pedir({ telefone: tel, modo: 'entrega', area: 'centro', endereco, itens: [burger, refri] });
  check('F3-REP', 'Depois que a loja recusa o primeiro, o mesmo pedido entra sem pergunta', r.status === 200 && e.status === 201, `recusar HTTP ${r.status}; novo HTTP ${e.status}`);
}

/* ---------- LGPD: anonimizar também apaga as chaves do endereço e a assinatura ---------- */
{
  const ligado = sql("SELECT habilitado FROM cupons WHERE codigo = 'BRASA15'");
  sql("UPDATE cupons SET habilitado = 1 WHERE codigo = 'BRASA15'"); // outra bateria pode ter desligado o cupom
  const tel = fone();
  const p = await pedir({ telefone: tel, nome: 'Titular Cupom', modo: 'entrega', area: 'centro', cupom: 'BRASA15', itens: [burger, refri], endereco: { rua: 'Rua Anonima', numero: String(3000 + Math.floor(Math.random() * 5000)), complemento: '', referencia: '' } });
  const num = p.json?.pedido?.numero || 0;
  const antes = sql(`SELECT CONCAT(predio_chave <> '', '/', (SELECT assinatura IS NOT NULL FROM pedidos WHERE numero = ${num})) FROM cupom_usos WHERE pedido_numero = ${num}`);
  await post(coz, `/admin/api/pedidos/${num}/status`, { para: 'recusado', motivo: 'Teste de anonimização' }); // pedido novo: a loja recusa
  const x = await post(adm, '/admin/api/clientes/anonimizar', { telefone: tel, senhaAtual: cred['aud-admin'].senha });
  const depois = sql(`SELECT CONCAT(endereco_chave = '' AND predio_chave = '' AND telefone = '', '/', (SELECT assinatura IS NULL FROM pedidos WHERE numero = ${num})) FROM cupom_usos WHERE pedido_numero = ${num}`);
  check('F3-LGPD', 'Anonimizar apaga também as chaves do endereço do cupom e a assinatura do pedido', p.status === 201 && antes === '1/1' && x.status === 200 && depois === '1/1', `pedido HTTP ${p.status} · antes ${antes} · anonimizar HTTP ${x.status} · depois ${depois} · ${p.json?.erro || x.json?.erro || ''}`);
  sql(`UPDATE cupons SET habilitado = ${Number(ligado) ? 1 : 0} WHERE codigo = 'BRASA15'`);
}

fs.writeFileSync(path.join(DIR, 'resultados-6.json'), JSON.stringify(R, null, 1));
const f = R.filter(r => r.ok === false).length, ok = R.filter(r => r.ok === true).length;
console.log(`\n${ok} passaram, ${f} falharam`);
