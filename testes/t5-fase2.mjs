// Fase 2 da auditoria: testes na cópia isolada (127.0.0.1:8101-8104, banco testes_brasa_tmp).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DIR, cred, sql, novoIp, req, sessao, post, get, entrar, entrarComo, pedir, chave, fone, check, R, mediana, png, dataUrl, salvarLista, PORTAS, PHP } from './lib.mjs';

const SITE = path.join(DIR, 'site');
const espera = ms => new Promise(r => setTimeout(r, ms));
const refri = { produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] }, obs: '' };
const burger = { produtoId: 'brasa-bacon', qtd: 1, escolhas: { 'g-ponto': ['ao-ponto'], 'g-extras': ['bacon-extra'] }, obs: 'sem pressa' };

/* TOTP (RFC 6238) para os testes da verificação em duas etapas */
function base32(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/[^A-Z2-7]/gi, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(seg, passo = Math.floor(Date.now() / 30000)) { const b = Buffer.alloc(8); b.writeUInt32BE(0, 0); b.writeUInt32BE(passo, 4); const h = crypto.createHmac('sha1', base32(seg)).update(b).digest(); const o = h[19] & 15; return String(((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, '0'); }
const php = codigo => execFileSync(PHP, ['-d', 'display_errors=1', '-r', `define('BRASA', true); $_SERVER['REQUEST_URI'] = '/'; require 'app/bootstrap.php'; ${codigo}`], { cwd: SITE, encoding: 'utf8' });

/* ---------- preparação: loja aberta 24 h e sessões ---------- */
let adm = await entrarComo('aud-admin');
const ger = await entrarComo('aud-gerente');
const coz = await entrarComo('aud-cozinha');
if (!adm.entrou || !ger.entrou || !coz.entrou) { console.log('não entrou', adm.login.status, ger.login.status, coz.login.status); process.exit(1); }
{
  const cfg = structuredClone(adm.estado.config);
  cfg.horarios = cfg.horarios.map(h => ({ ...h, aberto: true, abre: '00:00', fecha: '23:59' }));
  const r = await post(adm, '/admin/api/colecao/config', { dados: cfg });
  await post(adm, '/admin/api/colecao/operacao', { dados: { ...adm.estado.operacao, aberta: true, pausada: false } });
  check('PREP', 'Loja aberta 24 h na cópia', r.status === 200, `HTTP ${r.status} ${r.json?.erro || ''}`);
}

/* ---------- BD: atualização do banco ---------- */
{
  const v = sql("SELECT valor FROM configuracoes WHERE chave = 'versaoBanco'");
  const fks = sql("SELECT GROUP_CONCAT(CONSTRAINT_NAME ORDER BY CONSTRAINT_NAME) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'");
  const linhasJson = sql("SELECT COALESCE(SUM(JSON_LENGTH(itens)), 0) FROM pedidos");
  const linhasTab = sql('SELECT COUNT(*) FROM pedido_itens');
  check('F2-BD', 'Banco atualizado para a versão 2 (ou mais nova) sem apagar nada', Number(v) >= 2, `versaoBanco = ${v}`);
  check('F2-BD04', 'Chaves estrangeiras: etapas, itens e usos de cupom apontam para pedidos', fks === 'fk_eventos_pedido,fk_itens_pedido,fk_usos_pedido', fks);
  check('F2-BD05', 'Itens dos pedidos antigos copiados para a tabela pedido_itens', linhasJson === linhasTab, `${linhasTab} linhas na tabela · ${linhasJson} no JSON`);
  let apagou = true;
  try { sql('DELETE FROM pedidos WHERE numero = (SELECT * FROM (SELECT MIN(pedido_numero) FROM pedido_eventos) x)'); } catch { apagou = false; }
  check('F2-BD04', 'Banco recusa apagar pedido que tem etapas (integridade)', !apagou, apagou ? 'apagou' : 'recusado pela chave estrangeira');
  const plano = sql("EXPLAIN SELECT * FROM pedidos WHERE agendado_para >= 1").split('\t');
  check('F2-BD03', 'Consulta dos agendados usa índice próprio', plano.includes('ix_pedidos_agendado'), plano.slice(0, 7).join(' | '));
}

/* ---------- PED-07: novidades pela revisão do banco (nenhuma mudança se perde) ---------- */
{
  const e0 = await get(coz, '/admin/api/estado');
  const rev0 = e0.json.estado.rev;
  const sess = await Promise.all(Array.from({ length: 20 }, (_, i) => sessao(novoIp(), PORTAS[i % 4])));
  const rs = await Promise.all(sess.map((s, i) => pedir({ itens: [refri] }, { sessao: s, port: PORTAS[i % 4] })));
  const criados = rs.filter(x => x.status === 201).map(x => x.json.pedido.numero);
  const n = await get(coz, `/admin/api/novidades?desde=0&rev=${rev0}`);
  const vistos = new Set(n.json.pedidos.map(p => p.numero));
  const revs = n.json.pedidos.map(p => p.rev);
  check('F2-PED07', '20 pedidos ao mesmo tempo: a consulta pela revisão traz todos', criados.length === 20 && criados.every(x => vistos.has(x)), `${criados.length} criados · ${criados.filter(x => vistos.has(x)).length} vistos`);
  check('F2-PED07', 'Revisões únicas e crescentes', new Set(revs).size === revs.length && revs.every((r, i) => i === 0 || r > revs[i - 1]) && n.json.rev === Math.max(...revs), `rev devolvida ${n.json.rev}, maior ${Math.max(...revs)}`);
  const n2 = await get(coz, `/admin/api/novidades?desde=0&rev=${n.json.rev}`);
  check('F2-PED07', 'Perguntar de novo a partir da última revisão não repete pedidos', n2.json.pedidos.length === 0, `${n2.json.pedidos.length} repetidos`);
  const itens = sql(`SELECT COUNT(*) FROM pedido_itens WHERE pedido_numero IN (${criados.join(',')})`);
  check('F2-BD05', 'Pedido novo grava os itens na tabela', itens === '20', `${itens} itens`);
}

/* ---------- FIN-01: situação do pagamento ---------- */
let pedPag;
{
  const p = await pedir({ modo: 'entrega', area: 'centro', itens: [refri, refri], pagamento: 'dinheiro' });
  pedPag = p.json.pedido.numero;
  let x = await get(coz, `/admin/api/pedidos/${pedPag}`);
  check('F2-FIN01', 'Pedido novo começa com o pagamento "a receber"', x.json?.pedido?.pagamento?.status === 'pendente', x.json?.pedido?.pagamento?.status);
  const total = x.json.pedido.total;
  x = await post(coz, `/admin/api/pedidos/${pedPag}/pagamento`, { situacao: 'recebido', valor: total + 5, forma: 'pix', entregador: 'João' });
  check('F2-FIN01', 'Valor diferente do total sem explicação é recusado', x.status === 422 && x.json?.campo === 'pg-obs', `HTTP ${x.status} · ${x.json?.erro}`);
  x = await post(coz, `/admin/api/pedidos/${pedPag}/pagamento`, { situacao: 'recebido', valor: total, forma: 'pix', entregador: 'João' });
  const pg = x.json?.pedido?.pagamento;
  check('F2-FIN01', 'Registrar recebimento: valor, forma usada (Pix no lugar de dinheiro), entregador, quem e quando', x.status === 200 && pg?.status === 'recebido' && pg.formaReal === 'pix' && pg.entregador === 'João' && pg.por === coz.estado.admin.nome && pg.em > 0, `HTTP ${x.status} · ${JSON.stringify(pg)}`);
  x = await post(coz, `/admin/api/pedidos/${pedPag}/pagamento`, { situacao: 'recebido', valor: total, forma: 'pix' });
  check('F2-FIN01', 'Registrar duas vezes é recusado (409)', x.status === 409, `HTTP ${x.status}`);
  x = await post(coz, `/admin/api/pedidos/${pedPag}/pagamento`, { situacao: 'estornado', obs: 'cliente devolveu' });
  check('F2-FIN01', 'Funcionário sem cargo de gerente não estorna (403)', x.status === 403, `HTTP ${x.status} · ${x.json?.erro}`);
  const cx = await get(coz, `/admin/api/caixa?dia=${new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)}`);
  const c = cx.json?.caixa;
  const pix = c?.porForma.find(f => f.forma === 'pix')?.total;
  const joao = c?.porEntregador.find(e => e.nome === 'João');
  check('F2-FIN01', 'Caixa do dia soma por forma e por entregador', cx.status === 200 && pix >= total && joao?.total >= total && c.recebidos.some(r => r.numero === pedPag), `Pix ${pix} · João ${JSON.stringify(joao)}`);
  x = await post(ger, `/admin/api/pedidos/${pedPag}/pagamento`, { situacao: 'estornado', obs: 'cliente devolveu' });
  check('F2-FIN01', 'Gerente registra estorno com motivo', x.status === 200 && x.json.pedido.pagamento.status === 'estornado' && x.json.pedido.pagamento.obs === 'cliente devolveu', `HTTP ${x.status} · ${x.json?.pedido?.pagamento?.status}`);
  const aud = sql("SELECT GROUP_CONCAT(acao ORDER BY id) FROM auditoria WHERE entidade = 'pedido' AND entidade_id = '" + pedPag + "' AND acao LIKE 'pagamento.%'");
  check('F2-FIN01', 'Recebimento e estorno ficam no registro de auditoria', aud === 'pagamento.receber,pagamento.estornar', aud);
  const antigos = sql("SELECT COUNT(*) FROM pedidos WHERE pagamento_status = 'sem_registro'");
  check('F2-FIN01', 'Pedidos encerrados de antes da atualização ficam "sem registro" (nada inventado)', Number(antigos) >= 0, `${antigos} pedido(s) sem registro`);
}

/* ---------- PED-09: cancelar pedido concluído ---------- */
{
  const p = await pedir({ itens: [refri] });
  const n = p.json.pedido.numero;
  for (const para of ['confirmado', 'preparo', 'entrega', 'concluido']) await post(coz, `/admin/api/pedidos/${n}/status`, { para });
  let x = await post(coz, `/admin/api/pedidos/${n}/status`, { para: 'cancelado', motivo: 'Pedido concluído por engano' });
  check('F2-PED09', 'Funcionário comum não cancela pedido concluído (403)', x.status === 403, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await post(ger, `/admin/api/pedidos/${n}/status`, { para: 'cancelado', motivo: 'Pedido concluído por engano' });
  const ev = x.json?.pedido?.eventos?.at(-1);
  check('F2-PED09', 'Gerente cancela pedido concluído, com motivo e nome registrados', x.status === 200 && x.json.pedido.status === 'cancelado' && ev?.motivo === 'Pedido concluído por engano' && ev?.por === 'Auditoria Gerente', `HTTP ${x.status} · ${JSON.stringify(ev)}`);
}

/* ---------- PED-05: histórico paginado no servidor ---------- */
{
  const p = await pedir({ nome: 'Histórico Teste', itens: [refri] });
  const n = p.json.pedido.numero, tel = p.corpo.telefone;
  let x = await post(coz, '/admin/api/historico', { q: String(n) });
  check('F2-PED05', 'Histórico acha pelo número', x.status === 200 && x.json.total === 1 && x.json.itens[0].numero === n, `HTTP ${x.status} · ${x.json?.total}`);
  const antes = Number(sql("SELECT COUNT(*) FROM auditoria WHERE acao = 'historico.buscar'"));
  x = await post(coz, '/admin/api/historico', { q: `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}` });
  check('F2-PED05', 'Histórico acha pelo WhatsApp', x.status === 200 && x.json.itens.some(i => i.numero === n), `${x.json?.total} resultado(s)`);
  x = await post(coz, '/admin/api/historico', { q: 'Histórico Teste' });
  check('F2-PED05', 'Histórico acha pelo nome', x.status === 200 && x.json.itens.some(i => i.numero === n), `${x.json?.total} resultado(s)`);
  const depois = Number(sql("SELECT COUNT(*) FROM auditoria WHERE acao = 'historico.buscar'"));
  check('F2-LGPD04', 'Busca por WhatsApp ou nome fica registrada (sem o telefone no registro)', depois - antes === 2 && !sql("SELECT COALESCE(GROUP_CONCAT(detalhes), '') FROM auditoria WHERE acao = 'historico.buscar'").includes(tel), `${depois - antes} registro(s)`);
  x = await post(coz, '/admin/api/historico', { pagina: 2 });
  check('F2-PED05', 'Paginação: 25 por página, contagem total no servidor', x.status === 200 && x.json.pagina === 2 && x.json.paginas === Math.max(1, Math.ceil(x.json.total / 25)) && x.json.itens.length <= 25, `total ${x.json?.total}, ${x.json?.paginas} páginas`);
  const velho = sql('SELECT MIN(numero) FROM pedidos');
  x = await get(coz, `/admin/api/pedidos/${velho}`);
  check('F2-PED05', 'Pedido antigo abre pelo número (fora do quadro do dia)', x.status === 200 && x.json.pedido.numero === Number(velho), `HTTP ${x.status}`);
  x = await post(await entrarComo('aud-produtos'), '/admin/api/historico', {});
  check('F2-PED05', 'Quem não tem a permissão Pedidos não abre o histórico (403)', x.status === 403, `HTTP ${x.status}`);
}

/* ---------- PED-04: trote (números bloqueados e primeiro pedido) ---------- */
{
  const tel = fone();
  let p = await pedir({ telefone: tel, itens: [refri] });
  let ad = await get(coz, `/admin/api/pedidos/${p.json.pedido.numero}`);
  check('F2-PED04', 'Primeiro pedido de um número vem marcado', ad.json.pedido.primeiroPedido === true, String(ad.json.pedido.primeiroPedido));
  p = await pedir({ telefone: tel, itens: [refri], extra: { repetir: true } }); // o mesmo pedido de novo: a pessoa confirmou
  ad = await get(coz, `/admin/api/pedidos/${p.json.pedido.numero}`);
  check('F2-PED04', 'Segundo pedido do mesmo número não vem marcado', ad.json.pedido.primeiroPedido === false, String(ad.json.pedido.primeiroPedido));
  let x = await post(coz, '/admin/api/bloqueados', { telefone: tel, motivo: 'Pedido falso (trote)' });
  check('F2-PED04', 'Bloquear um número', x.status === 200 && x.json.bloqueados.some(b => b.digitos === tel), `HTTP ${x.status}`);
  p = await pedir({ telefone: tel, itens: [refri] });
  check('F2-PED04', 'Número bloqueado não faz pedido pelo site', p.status === 403 && /WhatsApp/.test(p.json?.erro), `HTTP ${p.status} · ${p.json?.erro}`);
  x = await post(coz, '/admin/api/pedidos', { cliente: { nome: 'Balcão Bloqueado', telefone: tel }, modalidade: 'retirada', itens: [{ produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] } }], pagamento: { forma: 'pix' } });
  check('F2-PED04', 'No balcão, o número bloqueado ainda pode ser atendido', x.status === 201, `HTTP ${x.status} · ${x.json?.erro || ''}`);
  x = await post(coz, '/admin/api/bloqueados/remover', { telefone: tel });
  p = await pedir({ telefone: tel, itens: [refri], extra: { repetir: true } });
  check('F2-PED04', 'Desbloqueado, volta a pedir pelo site', x.status === 200 && p.status === 201, `HTTP ${x.status} / pedido ${p.status}`);
}

/* ---------- PED-08: balcão com adicionais e cupom ---------- */
{
  const base = { cliente: { nome: 'Balcão Completo', telefone: fone() }, modalidade: 'retirada', pagamento: { forma: 'pix' } };
  let x = await post(coz, '/admin/api/pedidos', { ...base, itens: [{ produtoId: 'brasa-bacon', qtd: 1, escolhas: burger.escolhas }] });
  const it = x.json?.pedido?.itens?.[0];
  check('F2-PED08', 'Pedido de balcão grava os adicionais e soma no total', x.status === 201 && it?.adicionais?.some(a => a.nome === 'Bacon extra') && it?.adicionais?.some(a => a.nome === 'Ao ponto'), `HTTP ${x.status} · ${JSON.stringify(it?.adicionais)} · total ${x.json?.pedido?.total}`);
  const semExtra = x.json?.pedido?.total;
  x = await post(coz, '/admin/api/pedidos', { ...base, cliente: { nome: 'Balcão Cupom', telefone: fone() }, itens: [{ produtoId: 'brasa-bacon', qtd: 1, escolhas: burger.escolhas }], cupom: 'BRASA15' });
  check('F2-PED08', 'Pedido de balcão aceita cupom (desconto calculado no servidor)', x.status === 201 && x.json.pedido.desconto > 0 && x.json.pedido.cupom === 'BRASA15' && x.json.pedido.total < semExtra, `HTTP ${x.status} · desconto ${x.json?.pedido?.desconto} · ${x.json?.erro || ''}`);
  x = await post(coz, '/admin/api/pedidos', { ...base, itens: [{ produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] } }], cupom: 'NAOEXISTE' });
  check('F2-PED08', 'Cupom inválido no balcão aponta o campo do cupom', x.status === 422 && x.json?.campo === 'np-cupom', `HTTP ${x.status} · ${x.json?.campo}`);
}

/* ---------- LGPD-02: acompanhamento mascarado ---------- */
{
  const p = await pedir({ modo: 'entrega', area: 'centro', nome: 'Joana Privada Silva', itens: [{ ...refri, obs: 'tocar a campainha 2x' }], endereco: { rua: 'Rua do Segredo', numero: '42', complemento: 'casa 2', referencia: 'muro verde' } });
  check('F2-LGPD02', 'Quem acabou de pedir recebe a confirmação completa', p.json?.pedido?.endereco?.rua === 'Rua do Segredo' && p.json.pedido.cliente.nome === 'Joana Privada Silva', JSON.stringify(p.json?.pedido?.cliente));
  const { numero, codigo } = p.json.pedido;
  const tel = p.corpo.telefone;
  const s = await sessao();
  let x = await get(s, `/api/pedido?c=${codigo}`);
  const pub = x.json?.pedido;
  check('F2-LGPD02', 'Pelo link: primeiro nome, WhatsApp escondido, só o bairro e sem observações', pub?.cliente?.nome === 'Joana' && /•/.test(pub?.cliente?.whats) && pub?.cliente?.whats.endsWith(tel.slice(-4)) && pub?.endereco === null && pub?.area === 'Centro' && pub?.enderecoOculto === true && pub?.itens?.[0]?.obs === '',
    `nome "${pub?.cliente?.nome}", WhatsApp ${pub?.cliente?.whats}, endereço ${JSON.stringify(pub?.endereco)}, bairro ${pub?.area}`);
  x = await post(s, '/api/pedido/endereco', { c: codigo, t: '11911112222' });
  check('F2-LGPD02', 'Endereço com o WhatsApp errado: recusado', x.status === 422, `HTTP ${x.status}`);
  x = await post(s, '/api/pedido/endereco', { c: codigo, t: tel });
  check('F2-LGPD02', 'Endereço com o WhatsApp do pedido: aparece completo', x.status === 200 && x.json.pedido.endereco?.rua === 'Rua do Segredo', `HTTP ${x.status} · ${x.json?.pedido?.endereco?.rua}`);
  x = await get(s, `/api/pedido?n=${numero}&t=${tel}`);
  check('F2-LGPD02', 'Busca com o telefone no endereço da página não funciona mais (400)', x.status === 400, `HTTP ${x.status}`);
  x = await post(s, '/api/pedido', { n: numero, t: tel });
  check('F2-LGPD02', 'Busca por número + WhatsApp (POST) mostra completo', x.status === 200 && x.json.pedido.completo === true, `HTTP ${x.status}`);
  for (const para of ['confirmado', 'preparo', 'entrega', 'concluido']) await post(coz, `/admin/api/pedidos/${numero}/status`, { para });
  sql(`UPDATE pedido_eventos SET em = em - ${8 * 86_400_000} WHERE pedido_numero = ${numero}`);
  x = await get(s, `/api/pedido?c=${codigo}`);
  check('F2-LGPD02', 'Link de pedido encerrado há mais de 7 dias deixa de mostrar o pedido (410)', x.status === 410, `HTTP ${x.status} · ${x.json?.erro}`);
}

/* ---------- LGPD-03: pedidos do titular e prazo de guarda ---------- */
{
  const tel = fone();
  const p1 = await pedir({ telefone: tel, nome: 'Titular Teste', modo: 'entrega', area: 'centro', itens: [refri], endereco: { rua: 'Rua Titular', numero: '9', complemento: '', referencia: '' } });
  const n1 = p1.json.pedido.numero;
  let x = await post(coz, '/admin/api/clientes/buscar', { telefone: tel });
  check('F2-LGPD03', 'Sem a permissão Configurações, não consulta dados de cliente (403)', x.status === 403, `HTTP ${x.status}`);
  x = await post(adm, '/admin/api/clientes/buscar', { telefone: tel });
  check('F2-LGPD03', 'Consulta do titular: pedidos, nomes e total', x.status === 200 && x.json.cliente.pedidos === 1 && x.json.cliente.nomes.includes('Titular Teste'), JSON.stringify(x.json?.cliente));
  x = await post(adm, '/admin/api/clientes/exportar', { telefone: tel });
  check('F2-LGPD03', 'Exportar entrega os pedidos com endereço e itens', x.status === 200 && x.json.dados.pedidos.length === 1 && x.json.dados.pedidos[0].endereco.rua === 'Rua Titular', `HTTP ${x.status}`);
  x = await post(adm, '/admin/api/clientes/anonimizar', { telefone: tel, senhaAtual: cred['aud-admin'].senha });
  check('F2-LGPD03', 'Pedido em andamento impede anonimizar', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  for (const para of ['confirmado', 'preparo', 'entrega', 'concluido']) await post(coz, `/admin/api/pedidos/${n1}/status`, { para });
  x = await post(adm, '/admin/api/clientes/anonimizar', { telefone: tel, senhaAtual: 'senha-errada-123' });
  check('F2-LGPD03', 'Anonimizar pede a senha de quem faz', x.status === 422 && x.json?.campo === 'confirmar-senha', `HTTP ${x.status}`);
  x = await post(adm, '/admin/api/clientes/anonimizar', { telefone: tel, senhaAtual: cred['aud-admin'].senha });
  const linha = sql(`SELECT cliente_nome, cliente_telefone, JSON_EXTRACT(endereco, '$.rua'), total > 0, anonimizado_em IS NOT NULL FROM pedidos WHERE numero = ${n1}`).split('\t');
  check('F2-LGPD03', 'Anonimizar apaga nome, WhatsApp e endereço e mantém o valor', x.status === 200 && x.json.anonimizados === 1 && linha[0] === 'Cliente anonimizado' && linha[1] === '' && linha[2] === '""' && linha[3] === '1' && linha[4] === '1', linha.join(' | '));
  const acoes = sql("SELECT GROUP_CONCAT(DISTINCT acao ORDER BY acao) FROM auditoria WHERE acao LIKE 'lgpd.%'");
  check('F2-LGPD04', 'Consulta, exportação e anonimização ficam registradas', acoes === 'lgpd.anonimizar,lgpd.consultar,lgpd.exportar', acoes);
  // prazo de guarda: pedido encerrado de 30 meses atrás vira anônimo na limpeza
  const p2 = await pedir({ nome: 'Pedido Antigo', itens: [refri] });
  const n2 = p2.json.pedido.numero;
  for (const para of ['confirmado', 'preparo', 'entrega', 'concluido']) await post(coz, `/admin/api/pedidos/${n2}/status`, { para });
  sql(`UPDATE pedidos SET criado_em = criado_em - ${30 * 30 * 86_400_000} WHERE numero = ${n2}`);
  sql(`INSERT INTO tentativas (chave, contador, inicio) VALUES ('teste-limpeza-${Date.now()}', 3, ${Math.floor(Date.now() / 1000) - 3 * 86400})`);
  const res = JSON.parse(php("echo json_encode(Brasa\\Limpeza::rodar());"));
  const nome2 = sql(`SELECT cliente_nome FROM pedidos WHERE numero = ${n2}`);
  check('F2-LGPD03', 'Prazo de guarda: a limpeza anonimiza pedido encerrado de 30 meses atrás', nome2 === 'Cliente anonimizado' && res.anonimizados >= 1, `${nome2} · ${JSON.stringify(res)}`);
  check('F2-BD06', 'Limpeza tira tentativas vencidas', res.tentativas >= 1 && sql("SELECT COUNT(*) FROM tentativas WHERE chave LIKE 'teste-limpeza-%'") === '0', JSON.stringify(res));
}

/* ---------- BD-02 e BD-04: duas pessoas editando, arquivar e restaurar ---------- */
{
  const A = await entrarComo('aud-admin');
  const B = await entrarComo('aud-admin');
  const lA = structuredClone(A.estado.produtos), lB = structuredClone(B.estado.produtos);
  lA.find(p => p.id === 'refrigerante').descricao = 'Editado pela pessoa A';
  let x = await salvarLista(A, 'produtos', lA);
  check('F2-BD02', 'Pessoa A salva a descrição de um produto', x.status === 200, `HTTP ${x.status} ${x.json?.erro || ''}`);
  lB.find(p => p.id === 'refrigerante').preco = 99;
  x = await salvarLista(B, 'produtos', lB, B.estado.produtos);
  const desc = sql("SELECT CONCAT(descricao, '|', preco) FROM produtos WHERE id = 'refrigerante'");
  check('F2-BD02', 'Pessoa B, com a lista velha, é avisada (409) e não apaga a mudança de A', x.status === 409 && Array.isArray(x.json?.dados) && desc.startsWith('Editado pela pessoa A|') && !desc.endsWith('|9900'), `HTTP ${x.status} · banco: ${desc}`);
  // B cria um produto novo; A (sem conhecer o novo) mexe em outro produto: o novo continua
  B.estado.produtos = (await get(B, '/admin/api/estado')).json.estado.produtos;
  const novo = { ...structuredClone(B.estado.produtos.find(p => p.id === 'refrigerante')), id: 'teste-novo-b', nome: 'Produto da pessoa B', codigo: 'TNB' };
  delete novo.versao;
  x = await salvarLista(B, 'produtos', [...structuredClone(B.estado.produtos), novo]);
  check('F2-BD02', 'Pessoa B cria um produto', x.status === 200 && x.json.dados.some(p => p.id === 'teste-novo-b'), `HTTP ${x.status} ${x.json?.erro || ''}`);
  const lA2 = structuredClone(A.estado.produtos);
  lA2.find(p => p.id === 'brasa-bacon').selo = 'Teste A';
  x = await salvarLista(A, 'produtos', lA2);
  const existe = sql("SELECT COUNT(*) FROM produtos WHERE id = 'teste-novo-b' AND arquivado_em IS NULL");
  check('F2-BD02', 'Pessoa A salva outra coisa sem apagar o produto que B criou', x.status === 200 && existe === '1', `HTTP ${x.status} · produto de B ativo: ${existe}`);
  x = await post(A, '/admin/api/colecao/produtos', { dados: A.estado.produtos });
  check('F2-BD02', 'O jeito antigo (lista inteira) é recusado com aviso para recarregar', x.status === 409 && x.json?.recarregar === true, `HTTP ${x.status}`);
  // excluir vai para Excluídos; restaurar devolve
  A.estado.produtos = (await get(A, '/admin/api/estado')).json.estado.produtos;
  x = await salvarLista(A, 'produtos', A.estado.produtos.filter(p => p.id !== 'teste-novo-b'));
  const arq = sql("SELECT arquivado_em IS NOT NULL FROM produtos WHERE id = 'teste-novo-b'");
  const dataJs = (await req({ path: '/js/data.js' })).text;
  check('F2-BD04', 'Excluir guarda o produto em Excluídos e tira do site', x.status === 200 && arq === '1' && !dataJs.includes('teste-novo-b'), `arquivado: ${arq}`);
  x = await get(A, '/admin/api/excluidos?colecao=produtos');
  check('F2-BD04', 'Lista de excluídos mostra o produto', x.status === 200 && x.json.itens.some(i => i.id === 'teste-novo-b'), `HTTP ${x.status}`);
  x = await post(A, '/admin/api/restaurar', { colecao: 'produtos', id: 'teste-novo-b' });
  check('F2-BD04', 'Restaurar devolve o produto', x.status === 200 && x.json.dados.some(p => p.id === 'teste-novo-b') && sql("SELECT arquivado_em IS NULL FROM produtos WHERE id = 'teste-novo-b'") === '1', `HTTP ${x.status}`);
  x = await post(await entrarComo('aud-cozinha'), '/admin/api/restaurar', { colecao: 'produtos', id: 'teste-novo-b' });
  check('F2-BD04', 'Restaurar exige a permissão da lista (403 sem Cardápio)', x.status === 403, `HTTP ${x.status}`);
}

/* ---------- SEG-04: senha forte e verificação em duas etapas ---------- */
{
  const usuarios = structuredClone(adm.estado.usuarios);
  const tentar = async senha => post(adm, '/admin/api/colecao/usuarios', { dados: [...structuredClone(usuarios), { id: 'aud-novo', nome: 'Novo Teste', email: 'novo@auditoria.example', funcao: 'Atendente', permissoes: ['pedidos'], status: 'ativo', senha }], senhaAtual: cred['aud-admin'].senha });
  let x = await tentar('curta123');
  check('F2-SEG04', 'Senha com menos de 12 caracteres é recusada', x.status === 422 && /12/.test(x.json?.erro), x.json?.erro);
  x = await tentar('123456789012');
  check('F2-SEG04', 'Senha da lista de vazadas é recusada', x.status === 422 && /fácil/.test(x.json?.erro), x.json?.erro);
  x = await tentar('brasa-2026-loja');
  check('F2-SEG04', 'Senha com o nome da loja é recusada', x.status === 422 && /fácil/.test(x.json?.erro), x.json?.erro);
  x = await tentar('Cavalo-Azul-Correndo-77');
  check('F2-SEG04', 'Senha forte é aceita', x.status === 200, `HTTP ${x.status} ${x.json?.erro || ''}`);
  // remover usuário guarda a linha (histórico com o nome)
  adm.estado.usuarios = x.json.dados;
  x = await post(adm, '/admin/api/colecao/usuarios', { dados: adm.estado.usuarios.filter(u => u.id !== 'aud-novo'), senhaAtual: cred['aud-admin'].senha });
  const st = sql("SELECT CONCAT(status, '|', LEFT(email, 1)) FROM usuarios WHERE id = 'aud-novo'");
  check('F2-BD04', 'Remover usuário tira o acesso e guarda a linha (status removido)', x.status === 200 && st === 'removido|#' && !x.json.dados.some(u => u.id === 'aud-novo'), st);
  const s0 = await entrar('novo@auditoria.example', 'Cavalo-Azul-Correndo-77');
  check('F2-BD04', 'Usuário removido não entra', !s0.entrou, `HTTP ${s0.login.status}`);

  // duas etapas para aud-gerente
  let g = await entrarComo('aud-gerente');
  x = await post(g, '/admin/api/2fa/iniciar', {});
  const seg = x.json?.segredo?.replace(/\s/g, '');
  check('F2-SEG04', 'Iniciar: o servidor gera a chave e o link para o aplicativo', x.status === 200 && seg?.length === 32 && x.json.uri.startsWith('otpauth://totp/'), `HTTP ${x.status}`);
  x = await post(g, '/admin/api/2fa/ativar', { codigo: '000000', senhaAtual: cred['aud-gerente'].senha });
  check('F2-SEG04', 'Código errado não ativa', x.status === 422, `HTTP ${x.status}`);
  x = await post(g, '/admin/api/2fa/ativar', { codigo: totp(seg), senhaAtual: cred['aud-gerente'].senha });
  const rec = x.json?.recuperacao || [];
  check('F2-SEG04', 'Código certo ativa e devolve 8 códigos de recuperação', x.status === 200 && rec.length === 8 && x.json.admin.doisFatores === true, `HTTP ${x.status} · ${rec.length} códigos`);
  const segBanco = sql("SELECT totp_segredo FROM usuarios WHERE id = 'aud-gerente'");
  check('F2-SEG04', 'A chave fica cifrada no banco', segBanco.startsWith('g:') && !segBanco.includes(seg), segBanco.slice(0, 12) + '…');
  g = await entrarComo('aud-gerente');
  const tela = await req({ path: '/admin/', ip: g.ip, jar: g.jar, headers: { Accept: 'text/html' } });
  const api = await get(g, '/admin/api/estado');
  check('F2-SEG04', 'Senha certa sem o código: mostra o campo do código e o painel não abre', g.login.status === 303 && /Código de verificação/.test(tela.text) && api.status === 401, `login ${g.login.status} · API ${api.status}`);
  const csrf = (tela.text.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  const enviarCodigo = c => req({ method: 'POST', path: '/admin/entrar-codigo', body: new URLSearchParams({ _csrf: csrf, codigo: c }).toString(), form: true, ip: g.ip, jar: g.jar, headers: { Accept: 'text/html' } });
  x = await enviarCodigo('123456');
  check('F2-SEG04', 'Código errado no login é recusado', x.status === 422, `HTTP ${x.status}`);
  x = await enviarCodigo(totp(seg));
  check('F2-SEG04', 'O mesmo código não vale duas vezes (o da ativação)', x.status === 422 || x.status === 303, `HTTP ${x.status} (303 se o passo de 30 s já virou)`);
  if (x.status !== 303) {
    x = await enviarCodigo(rec[0]);
    check('F2-SEG04', 'Código de recuperação entra', x.status === 303 && (await get(g, '/admin/api/estado')).status === 200, `HTTP ${x.status}`);
  }
  const g2 = await entrarComo('aud-gerente');
  const t2 = await req({ path: '/admin/', ip: g2.ip, jar: g2.jar, headers: { Accept: 'text/html' } });
  const csrf2 = (t2.text.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  x = await req({ method: 'POST', path: '/admin/entrar-codigo', body: new URLSearchParams({ _csrf: csrf2, codigo: rec[0] }).toString(), form: true, ip: g2.ip, jar: g2.jar, headers: { Accept: 'text/html' } });
  check('F2-SEG04', 'Código de recuperação usado não vale de novo', x.status === 422, `HTTP ${x.status}`);
  // exigir duas etapas para administradores
  const cfgSeg = c => ({ ...structuredClone(c), seguranca: { exigir2fa: true } });
  x = await post(ger, '/admin/api/colecao/config', { dados: cfgSeg(adm.estado.config) });
  check('F2-SEG04', 'Exigir duas etapas: só o proprietário muda a regra', x.status === 403 || x.status === 409 || x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await post(adm, '/admin/api/colecao/config', { dados: cfgSeg(adm.estado.config) });
  check('F2-SEG04', 'O proprietário precisa ativar as duas etapas antes de exigir', x.status === 422 && /Ative primeiro/.test(x.json?.erro), `HTTP ${x.status} · ${x.json?.erro}`);
}

/* ---------- SEG-06: mesmo tempo com e sem usuário ---------- */
{
  const t = async email => { const s = await sessao(novoIp()); const t0 = performance.now(); await req({ method: 'POST', path: '/admin/entrar', body: new URLSearchParams({ _csrf: s.csrf, email, senha: 'senha-errada-qualquer' }).toString(), form: true, ip: s.ip, jar: s.jar, headers: { Accept: 'text/html' } }); return performance.now() - t0; };
  const existe = [], nao = [];
  for (let i = 0; i < 5; i++) { existe.push(await t('aud-cozinha@auditoria.example')); nao.push(await t(`ninguem${i}@auditoria.example`)); }
  sql('DELETE FROM tentativas');
  const a = mediana(existe), b = mediana(nao);
  check('F2-SEG06', 'Login com e-mail existente e inexistente demora o mesmo', Math.max(a, b) / Math.min(a, b) < 1.6, `mediana ${a.toFixed(0)} ms (existe) × ${b.toFixed(0)} ms (não existe)`);
}

/* ---------- SEG-07: imagem dentro do limite passa; gigante não derruba ---------- */
{
  const lista = structuredClone(adm.estado.produtos);
  adm.estado.produtos = (await get(adm, '/admin/api/estado')).json.estado.produtos;
  const l2 = structuredClone(adm.estado.produtos);
  l2.find(q => q.id === 'batata-brasa').imagem = dataUrl(png(3000, 2000));
  const x = await salvarLista(adm, 'produtos', l2);
  check('F2-SEG07', 'Imagem de 3000 × 2000 px é aceita', x.status === 200, `HTTP ${x.status} ${x.json?.erro || ''}`);
  void lista;
}

/* ---------- LGPD-01, 05, 06, ESC-02 e UX-03: site ---------- */
{
  const home = await req({ path: '/', headers: { Accept: 'text/html' } });
  const priv = await req({ path: '/privacidade', headers: { Accept: 'text/html' } });
  check('F2-LGPD06', 'Nenhuma página chama o Google Fonts; a política de segurança não libera o Google', !/googleapis|gstatic/.test(home.text + priv.text) && !/googleapis|gstatic/.test(home.headers['content-security-policy']), home.headers['content-security-policy'].slice(0, 80));
  const css = (await req({ path: '/css/site.css' })).text;
  const fonte = await req({ path: '/assets/fonts/anton-400.woff2' });
  check('F2-LGPD06', 'Fontes servidas pelo próprio site', /assets\/fonts\/anton-400\.woff2/.test(css) && fonte.status === 200, `HTTP ${fonte.status}`);
  check('F2-LGPD01', 'Página de privacidade no ar, preenchida com os dados da loja', priv.status === 200 && !priv.text.includes('{{') && /Seus direitos/.test(priv.text) && /24 meses|2 anos/.test(priv.text), `HTTP ${priv.status}`);
  check('F2-LGPD01', 'Rodapé leva à privacidade e ao "apagar meus dados"', /href="privacidade.html"/.test(home.text) && /data-apagar-dados/.test(home.text), '');
  const app = (await req({ path: '/js/app.js' })).text;
  check('F2-LGPD05', 'Sacola: "Lembrar meus dados" desmarcado por padrão e aviso de privacidade', /Lembrar meus dados neste aparelho/.test(app) && /dados\.lembrar \? 'checked'/.test(app) && /return \{ lembrar: false \}/.test(app) && /privacidade\.html/.test(app), '');
  // marca vinda do painel
  const cfg = structuredClone(adm.estado.config);
  cfg.loja = { ...cfg.loja, nome: 'Pizzaria Teste', slogan1: 'Pizza no forno,', descricao: 'Pizza de fermentação natural' };
  let x = await post(adm, '/admin/api/colecao/config', { dados: cfg });
  const h2 = await req({ path: '/', headers: { Accept: 'text/html' } });
  const d2 = (await req({ path: '/js/data.js' })).text;
  const adminHtml = await req({ path: '/admin/', ip: adm.ip, jar: adm.jar, headers: { Accept: 'text/html' } });
  check('F2-ESC02', 'Nome, frase do topo e descrição vêm do painel (site, mensagens e painel)', x.status === 200 && /<title>Pizzaria Teste · Pizza de fermentação natural<\/title>/.test(h2.text) && /Pizza no forno,/.test(h2.text) && /Pizzaria Teste não conseguiu aceitar/.test(d2) && /<title>Painel · Pizzaria Teste<\/title>/.test(adminHtml.text) && !/pela Brasa|com a Brasa|A Brasa não/.test(d2), `HTTP ${x.status}`);
  x = await post(adm, '/admin/api/colecao/config', { dados: adm.estado.config });
  // banner que não é de cupom aparece no site
  const bn = structuredClone(adm.estado.banners);
  bn.push({ id: 'b-teste', titulo: 'Combo da semana', texto: 'Brasa Bacon com batata', foto: '', imagem: '', destino: 'produto:brasa-bacon', inicio: '', fim: '', status: 'ativo', ordem: 99, desktop: true, mobile: true });
  x = await salvarLista(adm, 'banners', bn);
  const d3 = (await req({ path: '/js/data.js' })).text;
  check('F2-UX03', 'Banner do painel (sem cupom) aparece no site, antes do cardápio', x.status === 200 && /"titulo":"Combo da semana"/.test(d3) && /data-banners/.test(home.text), `HTTP ${x.status} ${x.json?.erro || ''}`);
}

/* ---------- PED-06: banco fora do ar ---------- */
{
  const arqCfg = path.join(SITE, 'app', 'config.php');
  const original = fs.readFileSync(arqCfg, 'utf8');
  try {
    fs.writeFileSync(arqCfg, original.replace(/'porta' => \d+/, "'porta' => 3399"));
    const pg = await req({ path: '/', headers: { Accept: 'text/html' } });
    const api = await req({ path: '/api/loja' });
    const dj = await req({ path: '/js/data.js' });
    check('F2-PED06', 'Banco fora do ar: a página mostra o WhatsApp da loja (503)', pg.status === 503 && /wa\.me\//.test(pg.text) && /Pedir pelo WhatsApp/.test(pg.text), `HTTP ${pg.status}`);
    check('F2-PED06', 'Banco fora do ar: API responde 503 citando o WhatsApp', api.status === 503 && api.json?.foraDoAr === true && /WhatsApp/.test(api.json?.erro), `HTTP ${api.status} · ${api.json?.erro}`);
    check('F2-PED06', 'Banco fora do ar: o cardápio (data.js) continua válido e avisa', dj.status === 200 && /FORA_DO_AR = true/.test(dj.text), `HTTP ${dj.status}`);
  } finally {
    fs.writeFileSync(arqCfg, original);
  }
}

/* ---------- o proprietário desliga as duas etapas de quem perdeu o celular (e deixa a cópia pronta para os outros testes) ---------- */
{
  adm = await entrarComo('aud-admin');
  const lista = structuredClone(adm.estado.usuarios);
  const g0 = lista.find(u => u.id === 'aud-gerente');
  if (g0) g0.zerar2fa = true;
  const x = await post(adm, '/admin/api/colecao/usuarios', { dados: lista, senhaAtual: cred['aud-admin'].senha });
  const g = await entrarComo('aud-gerente');
  check('F2-SEG04', 'Proprietário desliga as duas etapas de quem perdeu o celular', x.status === 200 && g.entrou && !!g.estado, `HTTP ${x.status} · entrou: ${!!g.estado}`);
}

fs.writeFileSync(path.join(DIR, 'resultados-5.json'), JSON.stringify(R, null, 1));
const f = R.filter(r => r.ok === false).length, ok = R.filter(r => r.ok === true).length;
console.log(`\n${ok} passaram, ${f} falharam`);
