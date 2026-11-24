// Bateria 1: segurança (cópia isolada). Resultado em resultados-1.json
import fs from 'node:fs';
import path from 'node:path';
import { DIR, cred, sql, novoIp, req, sessao, post, get, entrar, entrarComo, pedir, check, R, mediana, png, chunk, dataUrl, salvarLista } from './lib.mjs';

sql('DELETE FROM tentativas');

/* ---------- preparação: loja aberta 24 h e um cupom com limite de 3 usos (só no banco de auditoria) ---------- */
const adm = await entrarComo('aud-admin');
if (!adm.entrou) { console.log('não entrou como aud-admin', adm.login.status, adm.login.text.slice(0, 300)); process.exit(1); }
const cfg = structuredClone(adm.estado.config);
cfg.horarios = cfg.horarios.map(h => ({ ...h, aberto: true, abre: '00:00', fecha: '23:59' }));
let r = await post(adm, '/admin/api/colecao/config', { dados: cfg });
check('PREP-1', 'Abrir a loja 24 h no banco de auditoria', r.status === 200, `HTTP ${r.status} ${r.json?.erro || ''}`);
const cup = structuredClone(adm.estado.cupons).filter(c => c.codigo !== 'LIMITE3');
cup.push({ id: 'c-aud', codigo: 'LIMITE3', tipo: 'percentual', valor: 10, minimo: 0, usos: 0, limite: 3, porCliente: 0, inicio: '', validade: '', habilitado: true, descricao: 'teste auditoria' });
r = await salvarLista(adm, 'cupons', cup);
check('PREP-2', 'Criar cupom LIMITE3 (10%, máx. 3 usos)', r.status === 200, `HTTP ${r.status} ${r.json?.erro || ''}`);
r = await post(adm, '/admin/api/colecao/operacao', { dados: { ...adm.estado.operacao, aberta: true, pausada: false } });
const loja = await req({ path: '/api/loja' });
check('PREP-3', 'Loja aceitando pedidos agora', loja.json?.situacao?.aceitaAgora === true, JSON.stringify(loja.json?.situacao).slice(0, 120));

/* ---------- acesso sem login ---------- */
const anon = await sessao();
const semLogin = [
  ['GET', '/admin/api/estado'], ['GET', '/admin/api/novidades?desde=0'], ['POST', '/admin/api/colecao/produtos'], ['POST', '/admin/api/colecao/usuarios'],
  ['POST', '/admin/api/pedidos/1001/status'], ['POST', '/admin/api/pedidos'], ['POST', '/admin/api/perfil'],
];
for (const [m, p] of semLogin) {
  const x = m === 'GET' ? await get(anon, p) : await post(anon, p, { dados: [] , para: 'concluido' });
  check('SEG-AUT', `Sem login: ${m} ${p.split('?')[0]}`, x.status === 401, `HTTP ${x.status} · ${x.json?.erro || x.text.slice(0, 60)}`);
}
const tela = await get(anon, '/admin/');
check('SEG-AUT', 'Sem login: /admin/ mostra só a tela de entrar', tela.status === 200 && tela.text.includes('Entrar no painel') && !tela.text.includes('nucleo.js'), `HTTP ${tela.status}`);

/* ---------- CSRF ---------- */
const v = await sessao();
r = await post(v, '/api/pedidos', {}, { csrf: '' });
check('SEG-CSRF', 'Pedido sem token CSRF é recusado', r.status === 403, `HTTP ${r.status} · ${r.json?.erro}`);
r = await post(v, '/api/pedidos', {}, { csrf: 'a'.repeat(64) });
check('SEG-CSRF', 'Pedido com token CSRF falso é recusado', r.status === 403, `HTTP ${r.status}`);
r = await post(adm, '/admin/api/colecao/operacao', { dados: adm.estado.operacao }, { csrf: '' });
check('SEG-CSRF', 'Painel: gravar sem token CSRF é recusado', r.status === 403, `HTTP ${r.status}`);
{
  const s = await sessao();
  const form = new URLSearchParams({ email: cred['aud-admin'].email, senha: cred['aud-admin'].senha }).toString();
  const x = await req({ method: 'POST', path: '/admin/entrar', body: form, form: true, ip: s.ip, jar: s.jar, headers: { Accept: 'text/html' } });
  const e = await get(s, '/admin/api/estado');
  check('SEG-CSRF', 'Login sem token CSRF não entra (mesmo com a senha certa)', x.status !== 303 && e.status === 401, `login HTTP ${x.status}, estado HTTP ${e.status}`);
}

/* ---------- login: mensagens, força bruta, bloqueio e tempo de resposta ---------- */
sql('DELETE FROM tentativas');
{
  const a = await entrar(cred['aud-cozinha'].email, 'senha-errada-1');
  const b = await entrar('ninguem@auditoria.example', 'senha-errada-1');
  const msgA = (a.login.text.match(/role="alert"[^>]*>([^<]+)/) || [])[1];
  const msgB = (b.login.text.match(/role="alert"[^>]*>([^<]+)/) || [])[1];
  check('SEG-LOGIN', 'Senha errada: mensagem genérica, igual para e-mail que não existe', !a.entrou && msgA === msgB, `"${msgA}" / "${msgB}"`);
}
sql('DELETE FROM tentativas');
{
  // tempo: e-mail que existe (senha errada) x e-mail que não existe; 5 amostras cada, IPs diferentes
  const tExiste = [], tNao = [];
  for (let i = 0; i < 5; i++) {
    const a = await entrar(cred['aud-produtos'].email, 'errada' + i); tExiste.push(a.login.ms);
    const b = await entrar(`nao-existe-${i}@auditoria.example`, 'errada' + i); tNao.push(b.login.ms);
  }
  const ma = mediana(tExiste), mb = mediana(tNao);
  check('SEG-LOGIN', 'Tempo do login não revela se o e-mail existe', Math.abs(ma - mb) < 60, `mediana com e-mail existente ${ma.toFixed(0)} ms · inexistente ${mb.toFixed(0)} ms`);
}
sql('DELETE FROM tentativas');
{
  const ip = novoIp();
  let ult;
  for (let i = 0; i < 6; i++) ult = await entrar(cred['aud-cozinha'].email, 'errada' + i, ip);
  const bloqueado = await entrar(cred['aud-cozinha'].email, 'errada-7', ip);
  check('SEG-LOGIN', 'Força bruta: 7ª tentativa no mesmo e-mail é bloqueada (15 min)', /Muitas tentativas/.test(bloqueado.login.text), (bloqueado.login.text.match(/role="alert"[^>]*>([^<]+)/) || [])[1] || '');
  const dono = await entrarComo('aud-cozinha', novoIp());
  check('SEG-LOGIN', 'Bloqueio por e-mail impede o dono de entrar com a senha certa, de outro IP', !dono.entrou ? 'bloqueia' : 'entra', dono.entrou ? 'entrou normalmente' : 'senha certa recusada: ' + ((dono.login.text.match(/role="alert"[^>]*>([^<]+)/) || [])[1] || ''));
  R[R.length - 1].ok = dono.entrou; // passa se o dono ainda consegue entrar
}
sql('DELETE FROM tentativas');
{
  const ip = novoIp();
  let n = 0, bloq = false;
  for (let i = 0; i < 13; i++) { const x = await entrar(`varios-${i}@auditoria.example`, 'x', ip); n++; if (/Muitas tentativas de entrar\./.test(x.login.text)) { bloq = true; break; } }
  check('SEG-LOGIN', 'Força bruta: muitos e-mails do mesmo IP são bloqueados', bloq, `bloqueou na tentativa ${n}`);
}
sql('DELETE FROM tentativas');

/* ---------- sessão ---------- */
{
  const jar = new Map([['brasa', 'sessaofixadapeloatacante123']]);
  const ip = novoIp();
  const p = await req({ path: '/', ip, jar, headers: { Accept: 'text/html' } });
  const aceitou = jar.get('brasa') === 'sessaofixadapeloatacante123';
  check('SEG-SESSAO', 'ID de sessão inventado pelo atacante é trocado (modo estrito)', !aceitou, `cookie agora: ${aceitou ? 'o mesmo' : 'novo'}`);
  const cookie = (p.setCookie || []).find(c => c.startsWith('brasa=')) || '';
  check('SEG-SESSAO', 'Cookie de sessão HttpOnly e SameSite=Lax', /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie), cookie.replace(/brasa=[^;]+/, 'brasa=…'));
  const s = await sessao();
  const antes = s.jar.get('brasa');
  const form = new URLSearchParams({ _csrf: s.csrf, email: cred['aud-cozinha'].email, senha: cred['aud-cozinha'].senha }).toString();
  await req({ method: 'POST', path: '/admin/entrar', body: form, form: true, ip: s.ip, jar: s.jar, headers: { Accept: 'text/html' } });
  check('SEG-SESSAO', 'Login troca o ID da sessão', s.jar.get('brasa') !== antes, 'id novo depois de entrar');
  const e1 = await get(s, '/admin/api/estado');
  const tok = e1.json?.csrf;
  const sair = await post(s, '/admin/sair', {}, { csrf: tok });
  const e2 = await get(s, '/admin/api/estado');
  check('SEG-SESSAO', 'Sair encerra o acesso', e2.status === 401, `sair HTTP ${sair.status}, depois estado HTTP ${e2.status}`);
}
{
  // usuário desativado perde o acesso na hora
  const coz = await entrarComo('aud-cozinha');
  const us = structuredClone(adm.estado.usuarios);
  us.find(u => u.id === 'aud-cozinha').status = 'inativo';
  let x = await post(adm, '/admin/api/colecao/usuarios', { dados: us, senhaAtual: cred['aud-admin'].senha });
  const e = await get(coz, '/admin/api/estado');
  check('SEG-SESSAO', 'Usuário desativado perde o acesso na hora (sessão aberta)', e.status === 401, `desativar HTTP ${x.status}, sessão aberta agora HTTP ${e.status}`);
  us.find(u => u.id === 'aud-cozinha').status = 'ativo';
  x = await post(adm, '/admin/api/colecao/usuarios', { dados: us, senhaAtual: cred['aud-admin'].senha });
  adm.estado.usuarios = x.json?.dados || adm.estado.usuarios;
}

/* ---------- permissões (controle de acesso no servidor) ---------- */
// pedidos com dados de cliente para o teste
await pedir({ modo: 'entrega', area: 'centro', nome: 'Maria Teste Permissao', endereco: { rua: 'Rua Privada', numero: '99', complemento: 'ap 1', referencia: 'portão azul' } });
const prod = await entrarComo('aud-produtos');
{
  const ps = prod.estado?.pedidos || [];
  const comDados = ps.filter(p => p.cliente?.telefone && (p.endereco?.rua || p.modalidade === 'retirada'));
  check('SEG-ACESSO', 'Usuário só com "produtos" NÃO deveria receber pedidos e dados de clientes', ps.length === 0,
    `recebeu ${ps.length} pedidos no estado do painel (${comDados.length} com nome e telefone; ex.: "${ps.find(p => p.endereco)?.endereco?.rua || ''}")`);
  const nov = await get(prod, '/admin/api/novidades?desde=0');
  check('SEG-ACESSO', 'Usuário só com "produtos" NÃO deveria ler pedidos em /novidades', (nov.json?.pedidos || []).length === 0, `HTTP ${nov.status}, ${(nov.json?.pedidos || []).length} pedidos`);
  check('SEG-ACESSO', 'Usuário só com "produtos" recebe cupons e configurações', (prod.estado?.cupons || []).length === 0, `${(prod.estado?.cupons || []).length} cupons, config.pagamentos ${prod.estado?.config?.pagamentos ? 'presente' : 'ausente'}`);
  const n = Number(sql('SELECT MAX(numero) FROM pedidos'));
  const proibidos = [
    ['/admin/api/pedidos/' + n + '/status', { para: 'confirmado' }], ['/admin/api/pedidos', { cliente: { nome: 'X', telefone: '11999999999' }, modalidade: 'retirada', pagamento: { forma: 'pix' }, itens: [{ produtoId: 'refrigerante', qtd: 1 }] }],
    ['/admin/api/colecao/usuarios', { dados: [] }], ['/admin/api/colecao/config', { dados: {} }], ['/admin/api/colecao/cupons', { dados: [] }], ['/admin/api/colecao/areas', { dados: [] }],
    ['/admin/api/colecao/operacao', { dados: { aberta: false } }], ['/admin/api/colecao/logo', { dados: '' }],
  ];
  for (const [p, b] of proibidos) {
    const x = await post(prod, p, b);
    check('SEG-ACESSO', `Usuário só com "produtos": POST ${p.replace(/\d{4,}/, 'N')} é negado`, x.status === 403, `HTTP ${x.status} · ${x.json?.erro || ''}`);
  }
  const coz = await entrarComo('aud-cozinha');
  for (const p of ['/admin/api/colecao/produtos', '/admin/api/colecao/categorias', '/admin/api/colecao/usuarios']) {
    const x = await post(coz, p, { dados: [] });
    check('SEG-ACESSO', `Usuário "cozinha": POST ${p} é negado`, x.status === 403, `HTTP ${x.status}`);
  }
  const x = await post(coz, '/admin/api/perfil', { nome: 'Cozinha', email: cred['aud-cozinha'].email, telefone: '', permissoes: ['usuarios'], funcao: 'Administrador' });
  const depois = await get(coz, '/admin/api/estado');
  check('SEG-ACESSO', '"Meu perfil" não deixa a pessoa mudar as próprias permissões', !(depois.json?.estado?.admin?.permissoes || []).includes('usuarios'), `perfil HTTP ${x.status}; permissões agora: ${JSON.stringify(depois.json?.estado?.admin?.permissoes)}`);
}
{
  // gerente com "usuarios" troca a senha do administrador principal e entra como ele
  const ger = await entrarComo('aud-gerente');
  const us = structuredClone(ger.estado.usuarios);
  const nova = 'Aud' + Math.random().toString(36).slice(2) + 'X9';
  us.find(u => u.id === 'aud-admin').senha = nova;
  const g = us.find(u => u.id === 'aud-gerente'); g.permissoes = ['pedidos', 'produtos', 'cupons', 'areas', 'banners', 'configuracoes', 'usuarios'];
  const x = await post(ger, '/admin/api/colecao/usuarios', { dados: us, senhaAtual: cred['aud-gerente'].senha });
  const comoAdmin = await entrar(cred['aud-admin'].email, nova);
  check('SEG-ACESSO', 'Gerente com permissão "usuarios" NÃO deveria trocar a senha do proprietário e se dar todas as permissões', !(x.status === 200 && comoAdmin.entrou),
    `gravar HTTP ${x.status} (${x.json?.erro || ''}); entrou como proprietário com a senha nova: ${comoAdmin.entrou ? 'sim' : 'não'}`);

}

/* ---------- SQL injection (entradas com SQL) ---------- */
{
  const s = await sessao();
  let x = await post(s, '/api/pedido', { n: '1001 OR 1=1', t: '11999999999' });
  check('SEG-SQLI', 'Número do pedido com SQL é recusado pela validação', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await post(s, '/api/cupom', { codigo: "' OR '1'='1" });
  check('SEG-SQLI', 'Cupom com SQL vira só letras e números e não acha nada', x.status === 422 && /não encontrado/i.test(x.json?.erro || ''), `HTTP ${x.status} · ${x.json?.erro}`);
  const antes = sql('SELECT COUNT(*) FROM pedidos');
  const p = await pedir({ nome: "Robert'); DROP TABLE pedidos;--", itens: [{ produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] }, obs: "1' OR '1'='1" }] });
  const gravado = sql(`SELECT cliente_nome FROM pedidos WHERE numero = ${Number(p.json?.pedido?.numero) || 0}`);
  check('SEG-SQLI', 'Nome com SQL é gravado como texto comum (tabela intacta)', p.status === 201 && gravado.startsWith("Robert'); DROP") && Number(sql('SELECT COUNT(*) FROM pedidos')) === Number(antes) + 1, `HTTP ${p.status}; gravado: ${gravado}`);
  x = await post(s, '/api/cotacao', { itens: [{ produtoId: "x' OR '1'='1", qtd: 1 }], modo: 'retirada' });
  check('SEG-SQLI', 'Produto com SQL no identificador é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await get(adm, '/admin/api/novidades?desde=0%20OR%201%3D1');
  check('SEG-SQLI', 'Parâmetro "desde" com SQL vira número (sem erro de banco)', x.status === 200, `HTTP ${x.status}`);
}

/* ---------- XSS guardado (o painel mostra o que o cliente digitou) ---------- */
{
  const p = await pedir({ nome: '<img src=x onerror=alert(1)>', modo: 'entrega', area: 'centro', endereco: { rua: '<script>alert(2)</script>', numero: '1', complemento: '"><svg onload=alert(3)>', referencia: '' },
    itens: [{ produtoId: 'refrigerante', qtd: 1, escolhas: { 'g-sabor': ['cola'] }, obs: '<b onmouseover=alert(4)>obs</b>' }] });
  fs.writeFileSync(path.join(DIR, 'pedido-xss.json'), JSON.stringify({ numero: p.json?.pedido?.numero, codigo: p.json?.pedido?.codigo }));
  check('SEG-XSS', 'Pedido com HTML/JS nos campos é aceito como texto (teste de exibição no navegador à parte)', p.status === 201, `pedido #${p.json?.pedido?.numero}`);
}

/* ---------- envio de imagens ---------- */
{
  const produtos = structuredClone(adm.estado.produtos);
  const enviar = async img => { const lista = structuredClone(adm2.estado.produtos); lista.find(q => q.id === 'batata-brasa').imagem = img; return salvarLista(adm2, 'produtos', lista); };
  var adm2 = await entrar(cred['aud-admin'].email, cred['aud-admin'].senha);
  const poliglota = png(64, 64, [chunk('tEXt', Buffer.from('Comment\0<?php system($_GET["c"]); ?>'))]);
  let x = await enviar(dataUrl(poliglota));
  const chaveImg = (x.json?.dados || []).find(q => q.id === 'batata-brasa')?.imagem || '';
  const arq = chaveImg ? path.join(DIR, 'site', chaveImg.replace(/^\//, '')) : '';
  const conteudo = arq && fs.existsSync(arq) ? fs.readFileSync(arq) : Buffer.alloc(0);
  check('SEG-UPLOAD', 'PNG com código PHP escondido é refeito do zero (o código some)', x.status === 200 && conteudo.length > 0 && !conteudo.includes('<?php'), `HTTP ${x.status}; arquivo ${chaveImg}; ${conteudo.length} bytes; contém "<?php": ${conteudo.includes('<?php')}`);
  x = await enviar('data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64'));
  check('SEG-UPLOAD', 'SVG (pode ter script) é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await enviar('data:image/png;base64,' + Buffer.from('<?php echo 1; ?>').toString('base64'));
  check('SEG-UPLOAD', 'Arquivo PHP com nome de PNG é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  const gigante = png(20000, 20000, [], 1);
  x = await enviar(dataUrl(gigante));
  check('SEG-UPLOAD', 'Imagem que diz ter 20.000 × 20.000 px é recusada antes de abrir', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  x = await enviar('../../app/config.php');
  check('SEG-UPLOAD', 'Caminho de arquivo no lugar da imagem é recusado', x.status === 422, `HTTP ${x.status} · ${x.json?.erro}`);
  const grande = png(5000, 5000);
  x = await enviar(dataUrl(grande));
  check('SEG-UPLOAD', 'Imagem válida de 5.000 × 5.000 px (dentro do limite) não derruba o servidor', x.status === 200 || x.status === 422, `HTTP ${x.status} · ${x.json?.erro || x.text.slice(0, 80)} · ${(grande.length / 1024).toFixed(0)} KB enviados`);
}

fs.writeFileSync(path.join(DIR, 'resultados-1.json'), JSON.stringify(R, null, 2));
console.log(`\n${R.filter(x => x.ok === true).length} passaram, ${R.filter(x => x.ok === false).length} falharam, ${R.filter(x => x.ok !== true && x.ok !== false).length} informativos`);
