// Bateria 2: pedidos, valores, cupons, simultaneidade, queda de conexão, acompanhamento e etapas. Resultado em resultados-2.json
import fs from 'node:fs';
import path from 'node:path';
import { DIR, sql, novoIp, req, sessao, post, get, entrarComo, pedir, pedido, chave, fone, check, R, mediana, PORTAS } from './lib.mjs';

sql('DELETE FROM tentativas');
const n = q => Number(sql(q));
const reais = v => Math.round(v * 100) / 100;
const adm = await entrarComo('aud-admin');
const coz = await entrarComo('aud-cozinha');
const op0 = structuredClone(adm.estado.operacao);
const bacon = { produtoId: 'brasa-bacon', qtd: 2, escolhas: { 'g-ponto': ['ao-ponto'], 'g-extras': ['bacon-extra', 'ovo'], 'g-molhos': ['barbecue-da-casa'] }, obs: 'sem sal' };
const refri = { produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] }, obs: '' };
const cot = async corpo => { const s = await sessao(); return post(s, '/api/cotacao', corpo); };

/* ---------- pedido normal e pedido com adicionais ---------- */
{
  const antes = n('SELECT COUNT(*) FROM pedidos');
  const p = await pedir();
  const num = p.json?.pedido?.numero;
  const linha = sql(`SELECT status, total, pagamento_forma FROM pedidos WHERE numero = ${num || 0}`);
  const ev = n(`SELECT COUNT(*) FROM pedido_eventos WHERE pedido_numero = ${num || 0}`);
  const av = n(`SELECT COUNT(*) FROM notificacoes WHERE pedido = ${num || 0}`);
  check('PED-01', 'Pedido normal: confirmado ao cliente só depois de gravado (pedido, etapa e aviso)', p.status === 201 && linha.startsWith('novo') && ev === 1 && av === 1 && n('SELECT COUNT(*) FROM pedidos') === antes + 1,
    `HTTP ${p.status}, #${num}, banco: "${linha.replace(/\t/g, ' ')}", etapas ${ev}, aviso ${av}`);
  check('PED-01', 'Número e código de acompanhamento únicos', /^[a-f0-9]{16}$/.test(p.json?.pedido?.codigo || '') && Number.isInteger(num), `#${num}, código de 16 caracteres`);
}
{
  const esperado = reais((38.9 + 6.9 + 3.9 + 2) * 2 + 7.9 + 7.5);
  const p = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri] });
  const t = p.json?.pedido?.totais;
  const banco = n(`SELECT total FROM pedidos WHERE numero = ${p.json?.pedido?.numero || 0}`);
  check('VAL-01', 'Pedido com adicionais: preço do produto + adicionais × quantidade + taxa do bairro', p.status === 201 && t?.total === esperado && banco === Math.round(esperado * 100),
    `esperado R$ ${esperado.toFixed(2)}; servidor R$ ${t?.total} (subtotal ${t?.subtotal}, taxa ${t?.taxa}); banco ${banco} centavos`);
}

/* ---------- cupom ---------- */
{
  const f1 = fone();
  const num = String(2000 + Math.floor(Math.random() * 7000)); // endereço só deste teste
  const p = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], cupom: 'BRASA15', telefone: f1, endereco: { rua: 'Rua do Cupom', numero: num, complemento: '', referencia: '' } });
  const t = p.json?.pedido?.totais;
  const sub = reais((38.9 + 6.9 + 3.9 + 2) * 2 + 7.9);
  const desc = Math.round(Math.round(sub * 100) * 15 / 100) / 100;
  check('VAL-02', 'Cupom de 15%: desconto só nos produtos, arredondado ao centavo', p.status === 201 && t?.desconto === desc && t?.total === reais(sub - desc + 7.5), `desconto R$ ${t?.desconto} (esperado ${desc}); total R$ ${t?.total}`);
  const de_novo = await pedir({ itens: [refri], cupom: 'BRASA15', telefone: f1 });
  check('VAL-02', 'Cupom "uma vez por WhatsApp": o mesmo número não usa de novo', de_novo.status === 422, `HTTP ${de_novo.status} · ${de_novo.json?.erro}`);
  const outro = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], cupom: 'BRASA15', telefone: fone(), nome: 'Mesma Pessoa', endereco: { rua: 'R. do Cupom', numero: 'nº ' + num, complemento: 'casa', referencia: '' } });
  check('VAL-02', 'Cupom "uma vez por cliente" resiste a trocar o número: o mesmo endereço (escrito de outro jeito) não usa de novo', outro.status === 422 && /endereço/.test(outro.json?.erro || ''), `outro número, "R. do Cupom, nº ${num}": HTTP ${outro.status} · ${outro.json?.erro || 'desconto R$ ' + outro.json?.pedido?.totais?.desconto}`);
  const inventado = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], cupom: 'BRASA15', telefone: fone(), endereco: { rua: 'Rua do Cupom', numero: num, complemento: 'apto 12', referencia: '' } });
  check('VAL-02', 'Na mesma casa, inventar um complemento também não libera o cupom', inventado.status === 422 && /endereço/.test(inventado.json?.erro || ''), `HTTP ${inventado.status} · ${inventado.json?.erro || ''}`);
  const predio = { rua: 'Rua do Prédio', numero: String(2000 + Math.floor(Math.random() * 7000)), referencia: '' };
  const ap1 = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], cupom: 'BRASA15', telefone: fone(), endereco: { ...predio, complemento: 'apto 1' } });
  const ap2 = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], cupom: 'BRASA15', telefone: fone(), endereco: { ...predio, complemento: 'apto 2' } });
  const ap1b = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], cupom: 'BRASA15', telefone: fone(), endereco: { ...predio, complemento: 'Ap. 1' } });
  check('VAL-02', 'Vizinhos de prédio usam cada um o seu cupom; o mesmo apartamento não usa de novo', ap1.status === 201 && ap2.status === 201 && ap1b.status === 422,
    `apto 1: HTTP ${ap1.status}; apto 2: HTTP ${ap2.status}; apto 1 de novo com outro número: HTTP ${ap1b.status} · ${ap1b.json?.erro || ''}`);
  const inval = await pedir({ itens: [refri], cupom: 'NAOEXISTE' });
  check('VAL-02', 'Cupom inexistente no envio: pedido recusado com aviso (não passa sem desconto calado)', inval.status === 422, `HTTP ${inval.status} · ${inval.json?.erro}`);
}

/* ---------- manipulação de preços e de quantidades ---------- */
{
  const real = await cot({ itens: [bacon, refri], modo: 'entrega', area: 'centro' });
  const totalReal = real.json?.cotacao?.total;
  const falso = { ...bacon, preco: 0.01, unit: 0.01, total: 0.01, adicionais: [{ nome: 'Bacon extra', preco: 0 }] };
  const p = await pedir({ modo: 'entrega', area: 'centro', itens: [falso, { ...refri, preco: 0.01 }], extra: { subtotal: 0.01, total: 0.01, taxa: 0, desconto: 999 } });
  check('VAL-03', 'Preços enviados pelo navegador são ignorados (servidor usa o banco)', p.status === 201 && p.json?.pedido?.totais?.total === totalReal, `enviado total 0,01; gravado R$ ${p.json?.pedido?.totais?.total} (real R$ ${totalReal})`);
  const antes = n('SELECT COUNT(*) FROM pedidos');
  const q = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri], totalEsperado: 1.0 });
  check('VAL-03', 'Total esperado menor que o real: recusa (409) e devolve o total certo; nada é gravado', q.status === 409 && q.json?.cotacao?.total === totalReal && n('SELECT COUNT(*) FROM pedidos') === antes, `HTTP ${q.status}, total devolvido R$ ${q.json?.cotacao?.total}`);
  for (const qtd of [0, -1, 21, 2.5, 1e9, 'abc', null]) {
    const x = await cot({ itens: [{ ...refri, qtd }], modo: 'retirada' });
    check('VAL-04', `Quantidade inválida (${JSON.stringify(qtd)}) é recusada`, x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  }
  let x = await cot({ itens: Array.from({ length: 31 }, () => refri), modo: 'retirada' });
  check('VAL-04', 'Mais de 30 linhas na sacola é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await cot({ itens: Array.from({ length: 4 }, () => ({ ...refri, qtd: 20 })), modo: 'retirada' });
  check('VAL-04', 'Mais de 60 unidades é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  const casos = [
    ['opção que não existe', { ...bacon, escolhas: { ...bacon.escolhas, 'g-extras': ['caviar'] } }, 409],
    ['opção de outro grupo', { ...bacon, escolhas: { ...bacon.escolhas, 'g-ponto': ['bacon-extra'] } }, 409],
    ['grupo que o produto não tem', { ...bacon, escolhas: { ...bacon.escolhas, 'g-sabor': ['cola'] } }, 409],
    ['mais opções que o máximo (4 de 3)', { ...bacon, escolhas: { ...bacon.escolhas, 'g-extras': ['bacon-extra', 'ovo', 'cheddar-ingles', 'cebola-caramelizada'] } }, 422],
    ['escolha obrigatória faltando (ponto da carne)', { ...bacon, escolhas: { 'g-extras': ['ovo'] } }, 422],
    ['produto que não existe', { produtoId: 'produto-fantasma', qtd: 1 }, 409],
  ];
  for (const [nome, item, st] of casos) {
    const y = await cot({ itens: [item], modo: 'retirada' });
    check('VAL-05', `Adicionais: ${nome}`, y.status === st, `HTTP ${y.status} · ${y.json?.erro}`);
  }
  const dup = await cot({ itens: [{ ...bacon, qtd: 1, escolhas: { 'g-ponto': ['ao-ponto'], 'g-extras': ['ovo', 'ovo', 'ovo'] } }], modo: 'retirada' });
  check('VAL-05', 'Mesma opção repetida conta uma vez só (não soma 3× o preço)', dup.json?.cotacao?.subtotal === reais(38.9 + 3.9), `subtotal R$ ${dup.json?.cotacao?.subtotal}`);
  x = await cot({ itens: [refri], modo: 'entrega', area: 'bairro-falso' });
  check('VAL-06', 'Bairro que não existe é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await pedir({ itens: [refri], modo: 'entrega', area: null });
  check('VAL-06', 'Entrega sem bairro é recusada no envio', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await pedir({ itens: [refri], modo: 'retirada', area: 'jardins' });
  check('VAL-06', 'Retirada não cobra taxa, mesmo com bairro enviado', x.status === 201 && x.json?.pedido?.totais?.taxa === 0, `taxa R$ ${x.json?.pedido?.totais?.taxa}`);
  x = await pedir({ itens: [refri], pagamento: 'bitcoin' });
  check('FIN-01', 'Forma de pagamento fora da lista é recusada', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
}

/* ---------- pagamento na entrega e troco ---------- */
{
  // o pedido (2 Brasa Bacon com adicionais) passa de R$ 100: o troco precisa ser maior que o total
  const p = await pedir({ itens: [bacon], pagamento: 'dinheiro', troco: '200' });
  const num = p.json?.pedido?.numero;
  const t = p.json?.pedido?.totais?.total;
  const linha = sql(`SELECT pagamento_forma, troco_para, total FROM pedidos WHERE numero = ${num || 0}`).split('\t');
  check('FIN-02', 'Dinheiro com troco: forma e valor em dinheiro ficam gravados no pedido', p.status === 201 && linha[0] === 'dinheiro' && linha[1] === '20000', `banco: forma ${linha[0]}, troco para ${linha[1]} centavos, total ${linha[2]}`);
  const trocoPainel = Math.round((200 - t) * 100) / 100;
  check('FIN-02', 'Troco mostrado no painel = valor em dinheiro − total', Math.abs(trocoPainel - (20000 - Number(linha[2])) / 100) < 0.001, `R$ 200,00 − R$ ${t} = R$ ${trocoPainel.toFixed(2)}`);
  let x = await pedir({ itens: [bacon], pagamento: 'dinheiro', troco: '50' });
  check('FIN-02', 'Troco menor que o total é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  for (const tr of ['-100', '100000000', 'cem reais']) {
    x = await pedir({ itens: [refri], pagamento: 'dinheiro', troco: tr });
    check('FIN-02', `Troco inválido (${tr}) é recusado`, x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  }
  x = await pedir({ itens: [refri], pagamento: 'pix', troco: '100' });
  check('FIN-02', 'Troco enviado com Pix é descartado', x.status === 201 && sql(`SELECT IFNULL(troco_para,'NULL') FROM pedidos WHERE numero = ${x.json?.pedido?.numero || 0}`) === 'NULL', `troco gravado: ${sql(`SELECT IFNULL(troco_para,'NULL') FROM pedidos WHERE numero = ${x.json?.pedido?.numero || 0}`)}`);
  const cols = sql("SELECT GROUP_CONCAT(COLUMN_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pedidos'");
  check('FIN-03', 'Existe status de pagamento (pendente/recebido) separado da etapa do pedido', /pag(amento)?_status|pago|recebido/.test(cols), `colunas de pedidos: ${cols}`);
}

/* ---------- pedido mínimo, loja fechada, pausa e agendamento ---------- */
{
  let x = await post(adm, '/admin/api/colecao/operacao', { dados: { ...op0, aberta: true, pausada: false, pedidoMinimo: 200 } });
  let y = await pedir({ modo: 'entrega', area: 'centro', itens: [bacon, refri] });
  check('VAL-07', 'Pedido mínimo de entrega (R$ 200) é cobrado no servidor', y.status === 422 && /mínimo/.test(y.json?.erro || ''), `HTTP ${y.status} · ${y.json?.erro}`);
  y = await pedir({ modo: 'retirada', itens: [refri] });
  check('VAL-07', 'Pedido mínimo não vale para retirada', y.status === 201, `HTTP ${y.status}`);
  x = await post(adm, '/admin/api/colecao/operacao', { dados: { ...op0, aberta: false, pausada: false, pedidoMinimo: 0 } });
  y = await pedir({ itens: [refri] });
  check('VAL-08', 'Loja fechada no painel: pedido para agora é recusado', y.status === 409, `HTTP ${y.status} · ${y.json?.erro}`);
  const amanha = new Date(Date.now() + 86400000 - 3 * 3600000).toISOString().slice(0, 10);
  y = await pedir({ itens: [refri], quando: 'agendar', hora: `${amanha} 19:00` });
  check('VAL-08', 'Loja fechada no painel ainda aceita agendamento', y.status === 201 ? 'aceita' : 'recusa', `HTTP ${y.status} · ${y.json?.erro || 'agendado para ' + y.json?.pedido?.agendadoPara}`);
  R[R.length - 1].ok = null;
  x = await post(adm, '/admin/api/colecao/operacao', { dados: { ...op0, aberta: true, pausada: true, motivo: 'teste', pausaAte: Date.now() + 600000 } });
  y = await pedir({ itens: [refri] });
  const z = await pedir({ itens: [refri], quando: 'agendar', hora: `${amanha} 19:00` });
  check('VAL-08', 'Pausa: recusa pedido para agora e agendado', y.status === 409 && z.status === 409, `agora HTTP ${y.status}, agendado HTTP ${z.status}`);
  x = await post(adm, '/admin/api/colecao/operacao', { dados: { ...op0, aberta: true, pausada: false, pausaAte: null, pedidoMinimo: 0 } });
  for (const [nome, hora] of [['no passado', '2026-01-01 19:00'], ['daqui a 30 dias', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) + ' 19:00'], ['formato errado', 'amanhã 19h']]) {
    y = await pedir({ itens: [refri], quando: 'agendar', hora });
    check('VAL-08', `Agendamento ${nome} é recusado`, y.status === 422, `HTTP ${y.status} · ${y.json?.erro}`);
  }
}

/* ---------- muitos clientes ao mesmo tempo ---------- */
{
  sql('DELETE FROM tentativas');
  const antes = n('SELECT COUNT(*) FROM pedidos'), evAntes = n('SELECT COUNT(*) FROM pedido_eventos');
  const sess = await Promise.all(Array.from({ length: 40 }, (_, i) => sessao(novoIp(), PORTAS[i % 4])));
  const t0 = performance.now();
  const rs = await Promise.all(sess.map((s, i) => post(s, '/api/pedidos', pedido({ itens: [refri, { ...bacon, qtd: 1 }], modo: i % 2 ? 'retirada' : 'entrega', area: i % 2 ? null : 'vila-nova' }), { port: PORTAS[i % 4] })));
  const ms = performance.now() - t0;
  const ok = rs.filter(x => x.status === 201);
  const nums = new Set(ok.map(x => x.json.pedido.numero));
  const depois = n('SELECT COUNT(*) FROM pedidos'), evDepois = n('SELECT COUNT(*) FROM pedido_eventos');
  check('PED-02', '40 pedidos ao mesmo tempo (4 servidores, 40 clientes): todos gravados, números únicos', ok.length === 40 && nums.size === 40 && depois - antes === 40 && evDepois - evAntes === 40,
    `${ok.length}/40 aceitos, ${nums.size} números diferentes, +${depois - antes} pedidos e +${evDepois - evAntes} etapas no banco, em ${ms.toFixed(0)} ms; outros status: ${[...new Set(rs.filter(x => x.status !== 201).map(x => x.status))].join(',') || 'nenhum'}`);
  fs.writeFileSync(path.join(DIR, 'tempo-40.json'), JSON.stringify({ ms, tempos: rs.map(x => x.ms) }));
}
{
  const k = chave();
  const corpo = pedido({ chave: k, itens: [refri] });
  const antes = n('SELECT COUNT(*) FROM pedidos');
  const sess = await Promise.all(Array.from({ length: 10 }, (_, i) => sessao(novoIp(), PORTAS[i % 4])));
  const rs = await Promise.all(sess.map((s, i) => post(s, '/api/pedidos', corpo, { port: PORTAS[i % 4] })));
  const nums = new Set(rs.filter(x => x.status === 200 || x.status === 201).map(x => x.json.pedido.numero));
  check('PED-03', 'Mesmo envio 10 vezes ao mesmo tempo (abas/aparelhos diferentes): vira 1 pedido só', nums.size === 1 && n('SELECT COUNT(*) FROM pedidos') === antes + 1,
    `respostas: ${rs.map(x => x.status).join(',')}; números: ${[...nums].join(',')}; +${n('SELECT COUNT(*) FROM pedidos') - antes} no banco`);
  const s = await sessao();
  const k2 = chave();
  const rs2 = await Promise.all(Array.from({ length: 5 }, () => post(s, '/api/pedidos', pedido({ chave: k2, itens: [refri] }))));
  const nums2 = new Set(rs2.filter(x => x.json?.pedido).map(x => x.json.pedido.numero));
  check('PED-03', 'Clique duplo (5 cliques na mesma página): 1 pedido só', nums2.size === 1, `respostas: ${rs2.map(x => x.status).join(',')}; números: ${[...nums2].join(',')}`);
}
{
  const antes = n("SELECT usos FROM cupons WHERE codigo='LIMITE3'");
  const sess = await Promise.all(Array.from({ length: 8 }, (_, i) => sessao(novoIp(), PORTAS[i % 4])));
  const rs = await Promise.all(sess.map((s, i) => post(s, '/api/pedidos', pedido({ itens: [refri], cupom: 'LIMITE3' }), { port: PORTAS[i % 4] })));
  const ok = rs.filter(x => x.status === 201).length;
  const usos = n("SELECT usos FROM cupons WHERE codigo='LIMITE3'");
  check('VAL-09', 'Cupom com limite de 3 usos, 8 pedidos ao mesmo tempo: só 3 passam', ok === 3 && usos === 3 && antes === 0, `${ok} aceitos, usos no banco ${usos}; recusas: ${rs.filter(x => x.status !== 201).map(x => x.status).join(',')}`);
}

/* ---------- internet caiu durante o envio ---------- */
{
  const antes = n('SELECT COUNT(*) FROM pedidos');
  const k = chave();
  const corpo = { itens: [refri], chave: k, telefone: fone() };
  const s = await sessao();
  await post(s, '/api/pedidos', pedido(corpo), { abortar: true });
  await new Promise(r => setTimeout(r, 2500));
  const gravou = n(`SELECT COUNT(*) FROM pedidos WHERE chave_envio = '${k}'`);
  const reenvio = await post(s, '/api/pedidos', pedido(corpo));
  const nPorChave = n(`SELECT COUNT(*) FROM pedidos WHERE chave_envio = '${k}'`);
  check('PED-04', 'Conexão cortada depois do envio: o pedido fica gravado e o reenvio (mesma chave) não duplica', gravou === 1 && nPorChave === 1 && [200, 201].includes(reenvio.status),
    `gravado com a conexão cortada: ${gravou ? 'sim' : 'não'}; reenvio HTTP ${reenvio.status} #${reenvio.json?.pedido?.numero}; pedidos com a chave: ${nPorChave}`);
  const recarregou = await post(await sessao(), '/api/pedidos', pedido({ ...corpo, chave: chave() }));
  check('PED-04', 'Cliente recarrega a página e envia de novo (chave nova): o sistema evita o pedido repetido', recarregou.status === 409 && recarregou.json?.repetido?.numero === reenvio.json?.pedido?.numero,
    `HTTP ${recarregou.status} · ${recarregou.json?.erro || ''} · ${n('SELECT COUNT(*) FROM pedidos') - antes} pedido(s) gravado(s)`);
  const confirmou = await post(await sessao(), '/api/pedidos', pedido({ ...corpo, chave: chave(), extra: { repetir: true } }));
  check('PED-04', 'Se a pessoa confirmar que quer outro igual, o segundo pedido entra', confirmou.status === 201, `HTTP ${confirmou.status} #${confirmou.json?.pedido?.numero}`);
}

/* ---------- limites de envio ---------- */
{
  sql('DELETE FROM tentativas');
  const ip = novoIp();
  let ult;
  for (let i = 0; i < 11; i++) ult = await pedir({ itens: [refri] }, { ip });
  check('PED-05', '11º pedido do mesmo IP em 15 min é barrado (proteção contra robô)', ult.status === 429, `HTTP ${ult.status} · ${ult.json?.erro}`);
  const ip2 = novoIp();
  for (let i = 0; i < 10; i++) await pedir({ itens: [refri], pagamento: 'dinheiro', troco: '1' }, { ip: ip2 });
  ult = await pedir({ itens: [refri] }, { ip: ip2 });
  check('PED-05', 'Erros de preenchimento NÃO deveriam gastar a cota de pedidos do cliente', ult.status === 201, `depois de 10 envios com troco inválido, um pedido certo: HTTP ${ult.status} · ${ult.json?.erro || ''}`);
  const vitima = fone();
  for (let i = 0; i < 6; i++) await pedir({ itens: [refri], telefone: vitima, pagamento: 'dinheiro', troco: '1' });
  ult = await pedir({ itens: [refri], telefone: vitima });
  check('PED-05', 'Terceiro NÃO deveria conseguir bloquear o WhatsApp de um cliente', ult.status === 201, `6 envios errados de outra pessoa com o número da vítima; pedido da vítima: HTTP ${ult.status} · ${ult.json?.erro || ''}`);
  sql('DELETE FROM tentativas');
}

/* ---------- acompanhamento público ---------- */
{
  const p = await pedir({ modo: 'entrega', area: 'centro', nome: 'Joana Privada', itens: [refri], endereco: { rua: 'Rua do Segredo', numero: '42', complemento: 'casa 2', referencia: 'muro verde' } });
  const { numero, codigo } = p.json.pedido;
  const tel = p.corpo.telefone;
  const s = await sessao();
  let x = await get(s, `/api/pedido?c=${codigo}`);
  const pub = x.json?.pedido;
  check('LGPD-01', 'Link de acompanhamento mostra só o necessário (sem endereço e telefone completos)', !(pub?.endereco?.rua && pub?.cliente?.whats?.length > 10),
    `quem tem o link vê: nome "${pub?.cliente?.nome}", WhatsApp ${pub?.cliente?.whats}, endereço "${pub?.endereco?.rua}, ${pub?.endereco?.numero} ${pub?.endereco?.complemento}", referência "${pub?.endereco?.referencia}"`);
  x = await get(s, '/api/pedido?c=0123456789abcdef');
  check('SEG-IDOR', 'Código de acompanhamento inventado não acha pedido', x.status === 404, `HTTP ${x.status}`);
  x = await post(s, '/api/pedido', { n: numero, t: tel });
  check('SEG-IDOR', 'Número + WhatsApp certos acham o pedido', x.status === 200, `HTTP ${x.status}`);
  x = await post(s, '/api/pedido', { n: numero, t: '11911112222' });
  check('SEG-IDOR', 'Número certo com WhatsApp errado não acha', x.status === 404, `HTTP ${x.status}`);
  sql('DELETE FROM tentativas');
  const ip = novoIp();
  let bloq = 0;
  const sb = await sessao(ip);
  for (let i = 0; i < 22; i++) { const y = await post(sb, '/api/pedido', { n: numero - i, t: tel }); if (y.status === 429) { bloq = i + 1; break; } }
  check('SEG-IDOR', 'Procurar pedidos por número + WhatsApp tem limite (20 por 10 min por IP)', bloq === 21, `bloqueou na consulta ${bloq}`);
  sql('DELETE FROM tentativas');
}

/* ---------- etapas do pedido no painel ---------- */
{
  const p = await pedir({ itens: [refri] });
  const num = p.json.pedido.numero;
  const etapa = (para, motivo, s = coz) => post(s, `/admin/api/pedidos/${num}/status`, { para, motivo });
  const seq = [];
  for (const e of ['confirmado', 'preparo', 'entrega', 'concluido']) seq.push((await etapa(e)).status);
  check('PAI-01', 'Etapas na ordem: confirmado → preparo → entrega → concluído', seq.every(s => s === 200), `respostas ${seq.join(',')}`);
  const volta = await etapa('preparo');
  check('PAI-01', 'Pedido concluído não volta para preparo', volta.status === 409, `HTTP ${volta.status} · ${volta.json?.erro}`);
  const evAntes = n(`SELECT COUNT(*) FROM pedido_eventos WHERE pedido_numero = ${num}`);
  const repete = await etapa('concluido');
  check('PAI-01', 'Clicar duas vezes na mesma etapa não repete o registro', repete.status === 200 && n(`SELECT COUNT(*) FROM pedido_eventos WHERE pedido_numero = ${num}`) === evAntes, `HTTP ${repete.status}, etapas ${evAntes}`);
  const can = await etapa('cancelado', 'cliente desistiu');
  check('PAI-01', 'Pedido concluído por engano não pode ser corrigido (cancelar depois de concluído)', can.status === 409 ? 'bloqueado' : 'permitido', `HTTP ${can.status} · ${can.json?.erro || ''}`);
  R[R.length - 1].ok = null;
  const q = await pedir({ itens: [refri], cupom: 'BRASA15' });
  const nq = q.json?.pedido?.numero;
  const usosAntes = n("SELECT usos FROM cupons WHERE codigo='BRASA15'");
  let x = await post(coz, `/admin/api/pedidos/${nq}/status`, { para: 'recusado', motivo: '' });
  check('PAI-02', 'Recusar exige motivo', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await post(coz, `/admin/api/pedidos/${nq}/status`, { para: 'recusado', motivo: 'Fora da área' });
  check('PAI-02', 'Recusar com motivo devolve o uso do cupom', x.status === 200 && n("SELECT usos FROM cupons WHERE codigo='BRASA15'") === usosAntes - 1, `HTTP ${x.status}, usos do cupom ${usosAntes} → ${n("SELECT usos FROM cupons WHERE codigo='BRASA15'")}`);
  const r2 = await pedir({ itens: [refri] });
  const n2 = r2.json.pedido.numero;
  const [a, b] = await Promise.all([post(coz, `/admin/api/pedidos/${n2}/status`, { para: 'confirmado' }), post(adm, `/admin/api/pedidos/${n2}/status`, { para: 'recusado', motivo: 'Sem estoque' })]);
  const final = sql(`SELECT status FROM pedidos WHERE numero = ${n2}`);
  check('PAI-03', 'Dois funcionários ao mesmo tempo (aceitar × recusar): só um vale, o outro é avisado', [a.status, b.status].filter(s => s === 200).length === 1 && [a.status, b.status].includes(409), `aceitar HTTP ${a.status}, recusar HTTP ${b.status}; ficou "${final}"`);
}

/* ---------- painel: novidades, recarregar, histórico e balcão ---------- */
{
  const desde = Date.now() - 1000;
  const p = await pedir({ itens: [refri] });
  const nov = await get(coz, `/admin/api/novidades?desde=${desde - 5000}`);
  check('PAI-04', 'Pedido novo aparece na consulta de 10 em 10 s do painel', (nov.json?.pedidos || []).some(x => x.numero === p.json.pedido.numero), `#${p.json.pedido.numero} veio em /novidades: ${(nov.json?.pedidos || []).some(x => x.numero === p.json.pedido.numero) ? 'sim' : 'não'}`);
  const outra = await entrarComo('aud-cozinha');
  check('PAI-05', 'Painel recarregado (ou aberto em outro aparelho) mostra os pedidos de hoje', (outra.estado?.pedidos || []).some(x => x.numero === p.json.pedido.numero), `${(outra.estado?.pedidos || []).length} pedidos no estado inicial`);
  const velho = n('SELECT MIN(numero) FROM pedidos');
  sql(`UPDATE pedidos SET criado_em = criado_em - 3*86400000, atualizado_em = atualizado_em - 3*86400000, status='concluido' WHERE numero = ${velho}`);
  const e2 = await get(coz, '/admin/api/estado');
  const h6 = await get(coz, `/admin/api/pedidos/${velho}`);
  check('PAI-06', 'Pedido concluído de 3 dias atrás continua consultável no painel (Histórico)', h6.status === 200 && h6.json?.pedido?.numero === velho, `#${velho} no painel: ${(e2.json?.estado?.pedidos || []).some(x => x.numero === velho) ? 'sim' : 'não'}; no banco: ${n(`SELECT COUNT(*) FROM pedidos WHERE numero = ${velho}`) ? 'sim' : 'não'}`);
  const balcao = await post(coz, '/admin/api/pedidos', { cliente: { nome: 'Balcão Teste', telefone: '11988887777' }, modalidade: 'retirada', pagamento: { forma: 'dinheiro', trocoPara: 50 },
    itens: [{ produtoId: 'brasa-bacon', qtd: 1, preco: 0.01, escolhas: { 'g-extras': ['bacon-extra'] } }], obs: '' });
  check('PAI-07', 'Pedido de balcão: preço vem do banco (o enviado é ignorado)', balcao.status === 201 && balcao.json?.pedido?.total === 45.8, /* 38,90 do banco + bacon extra 6,90; o preço enviado (0,01) é ignorado */ `HTTP ${balcao.status}, total R$ ${balcao.json?.pedido?.total}`);
  check('PAI-07', 'Pedido de balcão registra adicionais', (balcao.json?.pedido?.itens?.[0]?.adicionais || []).length > 0, `adicionais gravados: ${JSON.stringify(balcao.json?.pedido?.itens?.[0]?.adicionais)}`);
}

fs.writeFileSync(path.join(DIR, 'resultados-2.json'), JSON.stringify(R, null, 2));
console.log(`\n${R.filter(x => x.ok === true).length} passaram, ${R.filter(x => x.ok === false).length} falharam, ${R.filter(x => x.ok !== true && x.ok !== false).length} informativos`);
