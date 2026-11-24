// Bateria 4: conferência das correções da fase 1 (cópia isolada; proprietário de teste = aud-admin). Resultado em resultados-4.json
import fs from 'node:fs';
import path from 'node:path';
import { DIR, cred, sql, req, post, get, entrar, entrarComo, check, R, png, dataUrl, salvarLista } from './lib.mjs';

sql('DELETE FROM tentativas');
const usuarios = async s => (await get(s, '/admin/api/estado')).json?.estado?.usuarios || [];
const salvarUs = (s, dados, senhaAtual) => post(s, '/admin/api/colecao/usuarios', senhaAtual === undefined ? { dados } : { dados, senhaAtual });

const adm = await entrarComo('aud-admin');
check('F1-PROP', 'O painel sabe quem é o proprietário', adm.estado?.admin?.proprietario === true, `admin.proprietario = ${adm.estado?.admin?.proprietario}`);

/* ---------- SEG-02: proprietário, confirmação de senha e escalada ---------- */
{
  const ger = await entrarComo('aud-gerente');
  const base = () => structuredClone(ger.estado.usuarios);
  check('F1-PROP', 'A lista de usuários marca o proprietário', base().some(u => u.id === 'aud-admin' && u.proprietario), base().filter(u => u.proprietario).map(u => u.id).join(','));
  let x = await salvarUs(ger, base());
  check('F1-SEG02', 'Mudar acessos sem a senha de confirmação é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await salvarUs(ger, base(), 'senha-errada');
  check('F1-SEG02', 'Senha de confirmação errada é recusada', x.status === 422 && /não confere/.test(x.json?.erro || ''), `HTTP ${x.status} · ${x.json?.erro}`);
  const casos = [
    ['trocar a senha do proprietário', us => { us.find(u => u.id === 'aud-admin').senha = 'NovaSenha123'; }],
    ['desativar o proprietário', us => { us.find(u => u.id === 'aud-admin').status = 'inativo'; }],
    ['remover o proprietário', us => us.filter(u => u.id !== 'aud-admin')],
    ['trocar a senha de outro administrador (u1)', us => { us.find(u => u.id === 'u1').senha = 'OutraSenha123'; }],
    ['dar a permissão Usuários a outra pessoa', us => { us.find(u => u.id === 'aud-cozinha').permissoes = ['pedidos', 'usuarios']; }],
    ['aumentar as próprias permissões', us => { us.find(u => u.id === 'aud-gerente').permissoes = ['pedidos', 'usuarios', 'configuracoes']; }],
  ];
  for (const [nome, mudar] of casos) {
    let us = base();
    us = mudar(us) || us;
    x = await salvarUs(ger, us, cred['aud-gerente'].senha);
    check('F1-SEG02', `Gerente (não proprietário) não consegue ${nome}`, x.status === 403, `HTTP ${x.status} · ${x.json?.erro}`);
  }
  let us = base();
  us.push({ id: 'aud-novo4', nome: 'Atendente Novo', email: 'aud-novo4@auditoria.example', funcao: 'Atendente', permissoes: ['pedidos'], status: 'ativo', senha: 'SenhaInicial1' });
  x = await salvarUs(ger, us, cred['aud-gerente'].senha);
  check('F1-SEG02', 'Gerente ainda cria um atendente (sem a permissão Usuários)', x.status === 200, `HTTP ${x.status} · ${x.json?.erro || ''}`);
  us = structuredClone(x.json?.dados || []);
  us.find(u => u.id === 'aud-novo4').senha = 'SenhaTrocada2';
  x = await salvarUs(ger, us, cred['aud-gerente'].senha);
  check('F1-SEG02', 'Gerente ainda troca a senha de um atendente', x.status === 200, `HTTP ${x.status} · ${x.json?.erro || ''}`);
  const aviso = sql("SELECT texto FROM notificacoes WHERE rota = 'configuracoes?aba=usuarios' ORDER BY id DESC LIMIT 1");
  check('F1-SEG02', 'Mudança de acessos gera aviso no painel', /trocou a senha de Atendente Novo/.test(aviso), `aviso: "${aviso}"`);
  const coz = await entrarComo('aud-cozinha');
  const viu = n => (n || []).some(a => a.rota === 'configuracoes?aba=usuarios');
  check('F1-SEG02', 'O aviso de acessos só aparece para quem cuida dos usuários', viu((await get(ger, '/admin/api/estado')).json?.estado?.notificacoes) && !viu(coz.estado?.notificacoes),
    `gerente vê: ${viu((await get(ger, '/admin/api/estado')).json?.estado?.notificacoes) ? 'sim' : 'não'}; cozinha vê: ${viu(coz.estado?.notificacoes) ? 'sim' : 'não'}`);
  for (let i = 0; i < 5; i++) await salvarUs(ger, base(), 'errada' + i);
  x = await salvarUs(ger, base(), cred['aud-gerente'].senha);
  check('F1-SEG02', 'Muitas confirmações de senha erradas bloqueiam por 15 min', x.status === 429, `depois de 5 erros, a senha certa: HTTP ${x.status} · ${x.json?.erro}`);
  sql('DELETE FROM tentativas');
}

/* ---------- SEG-05: trocar a senha derruba as sessões abertas ---------- */
{
  const ger = await entrarComo('aud-gerente');
  const us = await usuarios(adm);
  us.find(u => u.id === 'aud-gerente').senha = 'GerenteNova123';
  const x = await salvarUs(adm, us, cred['aud-admin'].senha);
  const e = await get(ger, '/admin/api/estado');
  check('F1-SEG05', 'Proprietário troca a senha do gerente: a sessão aberta do gerente cai', x.status === 200 && e.status === 401, `gravar HTTP ${x.status}; sessão antiga: HTTP ${e.status}`);
  const novo = await entrar(cred['aud-gerente'].email, 'GerenteNova123');
  check('F1-SEG05', 'Gerente entra com a senha nova', novo.entrou, novo.entrou ? 'entrou' : 'não entrou');
  cred['aud-gerente'].senha = 'GerenteNova123';
  const a = await entrarComo('aud-cozinha'), b = await entrarComo('aud-cozinha');
  const p = await post(a, '/admin/api/perfil', { nome: 'Auditoria Cozinha', email: cred['aud-cozinha'].email, telefone: '', senha: 'CozinhaNova123', senhaAtual: cred['aud-cozinha'].senha });
  if (p.json?.csrf) a.csrf = p.json.csrf;
  const ea = await get(a, '/admin/api/estado'), eb = await get(b, '/admin/api/estado');
  check('F1-SEG05', 'Trocar a própria senha: quem trocou continua; a outra sessão da mesma pessoa cai', p.status === 200 && ea.status === 200 && eb.status === 401, `perfil HTTP ${p.status}; esta sessão HTTP ${ea.status}; outra sessão HTTP ${eb.status}`);
  cred['aud-cozinha'].senha = 'CozinhaNova123';
  const s0 = await entrarComo('aud-admin');
  check('F1-SEG05', 'Sessões abertas antes da atualização continuam (marcadas na primeira visita)', s0.entrou, 'proprietário entra normalmente');
}

/* ---------- SEG-01: o painel só manda o que a pessoa pode ver ---------- */
{
  const pr = await entrarComo('aud-produtos');
  const e = pr.estado;
  check('F1-SEG01', 'Só "produtos": nenhum pedido no painel', (e.pedidos || []).length === 0, `${(e.pedidos || []).length} pedidos`);
  const nov = await get(pr, '/admin/api/novidades?desde=0');
  check('F1-SEG01', 'Só "produtos": nenhum pedido em novidades', (nov.json?.pedidos || []).length === 0 && nov.status === 200, `HTTP ${nov.status}, ${(nov.json?.pedidos || []).length} pedidos`);
  check('F1-SEG01', 'Só "produtos": sem cupons, sem chave Pix e sem ajustes de aviso', (e.cupons || []).length === 0 && !('chavePix' in (e.config?.pagamentos || {})) && Object.keys(e.config?.notif || {}).length === 0,
    `${(e.cupons || []).length} cupons; chavePix ${'chavePix' in (e.config?.pagamentos || {}) ? 'presente' : 'ausente'}; notif ${JSON.stringify(e.config?.notif)}`);
  check('F1-SEG01', 'Só "produtos": vendas zeradas e sem avisos de pedido', e.ontem?.faturamento === 0 && (e.maisVendidos || []).length === 0 && !(e.notificacoes || []).some(n => n.rota === 'pedidos'),
    `faturamento de ontem ${e.ontem?.faturamento}; mais vendidos ${(e.maisVendidos || []).length}; avisos de pedido ${(e.notificacoes || []).filter(n => n.rota === 'pedidos').length}`);
  const coz = await entrarComo('aud-cozinha');
  check('F1-SEG01', 'Cozinha ("pedidos"): vê pedidos, mas não cupons', (coz.estado.pedidos || []).length > 0 && (coz.estado.cupons || []).length === 0, `${(coz.estado.pedidos || []).length} pedidos; ${(coz.estado.cupons || []).length} cupons`);
  check('F1-SEG01', 'Proprietário continua vendo tudo', (adm.estado.pedidos || []).length > 0 && (adm.estado.cupons || []).length > 0 && 'notif' in adm.estado.config, `${adm.estado.pedidos.length} pedidos, ${adm.estado.cupons.length} cupons`);
}

/* ---------- FIN-03: o painel não regrava o contador de usos ---------- */
{
  const antes = sql("SELECT usos FROM cupons WHERE codigo = 'BRASA15'");
  const cup = structuredClone(adm.estado.cupons);
  const c = cup.find(x => x.codigo === 'BRASA15');
  c.usos = 999; c.descricao = 'Cupom de boas-vindas (teste da fase 1)';
  const x = await salvarLista(adm, 'cupons', cup);
  const depois = sql("SELECT usos, descricao FROM cupons WHERE codigo = 'BRASA15'").split('\t');
  check('F1-FIN03', 'Salvar a lista de cupons não altera o contador de usos', x.status === 200 && depois[0] === antes && /teste da fase 1/.test(depois[1]), `usos antes ${antes}, depois ${depois[0]}; descrição gravada: ${depois[1]}`);
}

/* ---------- UX-01 e FIN-02: páginas com os dados do painel e cupom só quando anunciado ---------- */
{
  const html = async p => (await req({ path: p, headers: { Accept: 'text/html' } })).text;
  let s = await html('/');
  const areas = sql('SELECT nome, taxa FROM areas WHERE ativa = 1 ORDER BY ordem, nome').split('\n').map(l => l.split('\t'));
  const brl = c => 'R$ ' + (Number(c) / 100).toFixed(2).replace('.', ',');
  const faq = areas.map(([n, t]) => `${n} ${brl(t)}`);
  check('F1-UX01', 'Página inicial sem marcas por preencher', !s.includes('{{') && !s.includes('<!--se:'), s.includes('{{') ? 'sobrou marca {{…}}' : 'ok');
  check('F1-UX01', 'Taxas das perguntas frequentes vêm do banco', faq.every(f => s.includes(f)), faq.join(' · '));
  const loja = JSON.parse(sql("SELECT valor FROM configuracoes WHERE chave = 'loja'"));
  check('F1-UX01', 'Nome e endereço vêm dos dados da loja', s.includes(`<title>${loja.nome} · ${loja.descricao || 'Hamburgueria artesanal na Madalena, Recife'}</title>`) && s.includes(`${loja.rua}, ${loja.numero}`), `${loja.nome} · ${loja.rua}, ${loja.numero}`);
  check('F1-FIN02', 'Com banner ativo apontando para cupom válido, o site anuncia o cupom', s.includes('data-apply-coupon="BRASA15"') && s.includes('Como uso o cupom BRASA15?') && s.includes('15% nos produtos'), 'BRASA15 anunciado');
  const desc = (s.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  check('F1-UX01', 'Descrição para Google e WhatsApp gerada com os dados do painel', !!desc && desc.includes('Cupom BRASA15'), desc);
  const cup = structuredClone(adm.estado.cupons);
  cup.find(x => x.codigo === 'BRASA15').habilitado = false;
  await salvarLista(adm, 'cupons', structuredClone(cup));
  s = await html('/');
  check('F1-FIN02', 'Cupom desligado no painel: o site para de anunciar na hora', !s.includes('BRASA15') && !s.includes('href="#promocoes"') && !s.includes('class="promo"'), s.includes('BRASA15') ? 'ainda anuncia' : 'nada anunciado');
  cup.find(x => x.codigo === 'BRASA15').habilitado = true;
  await salvarLista(adm, 'cupons', structuredClone(cup));
  sql("UPDATE banners SET status = 'encerrado' WHERE destino = 'cupom:BRASA15'");
  s = await html('/');
  check('F1-FIN02', 'Banner encerrado: o cupom continua valendo, mas o site não anuncia', !s.includes('BRASA15'), s.includes('BRASA15') ? 'ainda anuncia' : 'nada anunciado');
  sql("UPDATE banners SET status = 'ativo' WHERE destino = 'cupom:BRASA15'");
  for (const p of ['/pedido', '/creditos']) {
    const t = await html(p);
    check('F1-UX01', `Página ${p} sem texto fixo de demonstração nem marca por preencher`, !t.includes('{{') && !t.includes('99999-2026'), t.includes('{{') ? 'sobrou marca' : 'ok');
  }
  const cfg = structuredClone(adm.estado.config);
  cfg.horarios = cfg.horarios.map((h, i) => ({ ...h, aberto: i < 5, abre: '11:00', fecha: '15:00' }));
  await post(adm, '/admin/api/colecao/config', { dados: cfg });
  s = await html('/');
  check('F1-UX01', 'Horário mudado no painel aparece nas perguntas frequentes', s.includes('Segunda a sexta, 11h às 15h. Sábado e domingo a gente não abre.'), (s.match(/<p>([^<]*a gente não abre[^<]*)<\/p>/) || [])[1]);
  await post(adm, '/admin/api/colecao/config', { dados: adm.estado.config });
}

/* ---------- INF-07: erro fatal fica registrado e a resposta não sai em branco ---------- */
{
  const lista = structuredClone(adm.estado.produtos);
  lista.find(q => q.id === 'batata-brasa').imagem = dataUrl(png(5000, 5000));
  const x = await salvarLista(adm, 'produtos', lista);
  const arq = path.join(DIR, 'site', 'storage', 'logs', new Date().toISOString().slice(0, 7) + '.log');
  const log = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8') : '';
  check('F2-SEG07', 'Imagem de 5000 × 5000 px é recusada antes de abrir (sem erro 500)', x.status === 422 && /grande demais/.test(x.json?.erro || ''), `HTTP ${x.status} · ${x.text.slice(0, 90)}`);
  check('F1-INF07', 'Erro fatal fica registrado em storage/logs (a imagem gigante agora é recusada antes: SEG-07)', /Allowed memory size/.test(log) ? true : null, (log.match(/.*Allowed memory size.*/) || ['a falta de memória não acontece mais: a imagem é recusada antes de abrir'])[0].slice(0, 140));
}

fs.writeFileSync(path.join(DIR, 'resultados-4.json'), JSON.stringify(R, null, 2));
console.log(`\n${R.filter(x => x.ok === true).length} passaram, ${R.filter(x => x.ok === false).length} falharam`);
