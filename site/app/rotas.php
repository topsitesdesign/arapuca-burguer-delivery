<?php
/* Endereços do sistema: páginas do site, API do site, painel e API do painel. */
declare(strict_types=1);
defined('BRASA') || exit;

use Brasa\{Auditoria, Cardapio, Cotacao, Csrf, Cupons, Erro, Horarios, Http, Instalador, Limite, Limpeza, Migracoes, Painel, Pedidos, Prova, Sessao, Usuarios, V};

$c = Http::caminho();
$m = Http::metodo();

/* ------------------------------------------------------------------ ainda não instalado */
if (!is_array(CONFIG)) {
    if ($c === '/instalar') $m === 'POST' ? Instalador::instalar($_POST) : Instalador::pagina();
    if (Http::ehApi() || $c === '/js/data.js') Http::erro('O sistema ainda não foi instalado.', 503);
    Http::redirecionar('/instalar');
}
if ($c === '/instalar') Http::naoEncontrado();

// código novo no servidor: a primeira visita atualiza o banco (só acrescenta); depois disso é uma consulta rápida
Migracoes::garantir();
// limpeza de registros vencidos e anonimização pelo prazo de guarda, em 1 de cada 100 visitas
Limpeza::talvez();

// as páginas do site recebem os textos da loja (nome, endereço, horários, cupom em destaque) direto do banco
$pagina = static function (string $arquivo, bool $daLoja = true): never {
    $html = (string) file_get_contents(APP . '/paginas/' . $arquivo);
    Http::pagina($daLoja ? Cardapio::preencherPagina($html) : $html);
};
$post = static function () use ($m): array {
    if ($m !== 'POST') Http::erro('Use POST neste endereço.', 405);
    Csrf::verificar();
    return Http::corpo();
};

/** Tela de entrada do painel: e-mail e senha, ou o código do aplicativo (duas etapas). HTML montado aqui, com os estilos do painel. */
$login = static function (?string $erro = null, string $email = '', bool $codigo = false): never {
    $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $nome = Cardapio::nomeLoja();
    $topo = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        . '<title>Entrar · Painel ' . $e($nome) . '</title><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#0d0b0a">'
        . '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/admin/admin.css"></head><body>'
        . '<div class="login-screen">';
    $marca = '<div class="login-card__brand">' . (($logo = Cardapio::logo()) !== '' ? '<img src="' . $e($logo) . '" alt="' . $e($nome) . '" style="height:84px;width:auto;max-width:100%;margin:0 auto 4px;object-fit:contain">' : '<span class="side__name">' . $e($nome) . '</span>') . '<span class="side__tag">PAINEL DE GESTÃO</span></div>';
    $msgErro = $erro ? '<p class="fld__err" role="alert" style="margin:0">' . $e($erro) . '</p>' : '';
    if ($codigo) {
        $form = '<form class="card login-card" method="post" action="/admin/entrar-codigo" novalidate>'
            . '<input type="hidden" name="_csrf" value="' . $e(Csrf::token()) . '">' . $marca
            . '<div><h1 class="dlg__title">Código de verificação</h1><p class="dlg__sub">Abra o aplicativo autenticador no seu celular e digite os 6 números que aparecem para este painel.</p></div>'
            . $msgErro
            . '<div class="fld"><label class="fld__label" for="lg-codigo">Código</label><input class="inp" id="lg-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required autofocus placeholder="000000"></div>'
            . '<button class="btn btn--primary btn--lg btn--block" type="submit">Entrar</button>'
            . '<p class="page-note"><span>Sem o celular? Digite um dos códigos de recuperação que você guardou ao ativar (formato XXXX-XXXX).</span></p>'
            . '</form><form method="post" action="/admin/cancelar-login" style="text-align:center;margin-top:12px"><input type="hidden" name="_csrf" value="' . $e(Csrf::token()) . '"><button class="link" type="submit">Entrar com outro e-mail</button></form>';
    } else {
        $form = '<form class="card login-card" method="post" action="/admin/entrar" novalidate>'
            . '<input type="hidden" name="_csrf" value="' . $e(Csrf::token()) . '">' . $marca
            . '<div><h1 class="dlg__title">Entrar no painel</h1><p class="dlg__sub">Use o e-mail e a senha da sua conta administrativa.</p></div>'
            . $msgErro
            . '<div class="fld"><label class="fld__label" for="lg-email">E-mail</label><input class="inp" id="lg-email" name="email" type="email" value="' . $e($email) . '" required autocomplete="username"' . ($email === '' ? ' autofocus' : '') . '></div>'
            . '<div class="fld"><label class="fld__label" for="lg-senha">Senha</label><input class="inp" id="lg-senha" name="senha" type="password" required autocomplete="current-password"' . ($email !== '' ? ' autofocus' : '') . '></div>'
            . '<button class="btn btn--primary btn--lg btn--block" type="submit">Entrar</button>'
            . '<p class="page-note"><span>Esqueceu a senha? Peça para o administrador da loja criar uma nova em Configurações › Usuários.</span></p>'
            . '</form>';
    }
    Http::pagina($topo . $form . '</div></body></html>', $erro ? 422 : 200);
};

/* ------------------------------------------------------------------ site */
if (in_array($c, ['/', '/index.html', '/index.php'], true)) $pagina('index.html');
if (in_array($c, ['/pedido', '/pedido.html'], true)) $pagina('pedido.html');
if (in_array($c, ['/creditos', '/creditos.html'], true)) $pagina('creditos.html');
if (in_array($c, ['/privacidade', '/privacidade.html'], true)) $pagina('privacidade.html');

if ($c === '/js/data.js') {
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-store');
    Http::cabecalhos();
    echo Cardapio::moduloJs();
    exit;
}

if ($c === '/api/loja') {
    $s = Horarios::situacao();
    Http::json(['ok' => true, 'agora' => Brasa\Tempo::agoraMs(), 'situacao' => $s]);
}

// desafio da proteção contra robôs: o navegador resolve enquanto a pessoa preenche a sacola (Prova)
if ($c === '/api/desafio') {
    Http::json(['ok' => true, 'desafio' => Prova::desafio()]);
}

if ($c === '/api/cupom') {
    $d = $post();
    Limite::contar('cupom:' . Limite::ip(), 40, 600, 'Muitas tentativas de cupom. Espere alguns minutos e tente de novo.');
    $codigo = Cupons::normalizarCodigo($d['codigo'] ?? '');
    if ($codigo === '') Http::erro('Digite o código do cupom.', 422, ['campo' => 'cupom']);
    $tel = null;
    try { $tel = isset($d['telefone']) && $d['telefone'] !== '' ? V::telefone($d['telefone']) : null; } catch (Erro) { $tel = null; }
    $cupom = Cupons::porCodigo($codigo);
    if (!$cupom) Http::erro('Cupom não encontrado. Confira as letras e os números.', 422, ['campo' => 'cupom']);
    $itens = $d['itens'] ?? [];
    if (is_array($itens) && $itens) {
        $cot = Cotacao::calcular(['itens' => $itens, 'modo' => $d['modo'] ?? 'entrega', 'area' => $d['area'] ?? null, 'cupom' => $codigo], $tel);
        if ($cot['avisoCupom']) Http::erro($cot['avisoCupom'], 422, ['campo' => 'cupom']);
        Http::json(['ok' => true, 'cupom' => Cupons::publico($cupom), 'cotacao' => Cotacao::publica($cot)]);
    }
    // sacola vazia: confere só as regras gerais (datas, limite, uso por WhatsApp)
    Cupons::conferir($cupom, PHP_INT_MAX, 'entrega', $tel);
    Http::json(['ok' => true, 'cupom' => Cupons::publico($cupom)]);
}

if ($c === '/api/cotacao') {
    $d = $post();
    Limite::contar('cotacao:' . Limite::ip(), 240, 600);
    $tel = null;
    try { $tel = isset($d['telefone']) && $d['telefone'] !== '' ? V::telefone($d['telefone']) : null; } catch (Erro) { $tel = null; }
    Http::json(['ok' => true, 'cotacao' => Cotacao::publica(Cotacao::calcular($d, $tel)), 'situacao' => Horarios::situacao()]);
}

if ($c === '/api/pedidos') {
    $d = $post();
    Http::json(['ok' => true, 'pedido' => Pedidos::criarDoSite($d)], 201);
}

/*
  Acompanhamento (LGPD-02): pelo código do link (GET) ou pelo número + WhatsApp (POST, para o telefone não ficar
  no endereço). O link mostra primeiro nome, WhatsApp escondido e o bairro; o endereço inteiro só com o WhatsApp.
  Sete dias depois que o pedido termina, o link deixa de mostrar o pedido.
*/
$vencido = static function (?array $p): void {
    if ($p && Pedidos::linkVencido($p)) Http::erro('Este pedido terminou há mais de ' . Pedidos::DIAS_LINK . ' dias e não aparece mais aqui. Se precisar, fale com a loja no WhatsApp.', 410);
};
if ($c === '/api/pedido') {
    Limite::contar('acompanhar:' . Limite::ip(), 120, 600, 'Muitas consultas seguidas. Espere alguns minutos.');
    if ($m === 'POST') {
        $d = $post();
        Limite::contar('acompanhar-num:' . Limite::ip(), 20, 600, 'Muitas consultas seguidas. Espere alguns minutos.');
        $numero = V::inteiro($d['n'] ?? null, 'o número do pedido', 1, 99_999_999, 'numero');
        $tel = V::telefone($d['t'] ?? '', 'o WhatsApp do pedido', 'whats');
        $p = Pedidos::porNumeroETelefone($numero, $tel);
        if (!$p) Http::erro('Não achamos esse pedido. Confira o número e o WhatsApp usados no pedido.', 404);
        $vencido($p);
        Http::json(['ok' => true, 'pedido' => Pedidos::publico($p, true)]);
    }
    $codigo = $_GET['c'] ?? null;
    if (!is_string($codigo) || $codigo === '') Http::erro('Atualize a página e busque pelo número e pelo WhatsApp do pedido.', 400);
    $p = Pedidos::porCodigo($codigo);
    if (!$p) Http::erro('Não achamos esse pedido. Confira o número e o WhatsApp usados no pedido.', 404);
    $vencido($p);
    Http::json(['ok' => true, 'pedido' => Pedidos::publico($p)]);
}
if ($c === '/api/pedido/endereco') {
    $d = $post();
    Limite::contar('acompanhar-end:' . Limite::ip(), 10, 600, 'Muitas tentativas seguidas. Espere alguns minutos.');
    $p = is_string($d['c'] ?? null) ? Pedidos::porCodigo($d['c']) : null;
    $tel = V::telefone($d['t'] ?? '', 'o WhatsApp do pedido', 'whats');
    if (!$p || !hash_equals($p['telefone'], $tel)) Http::erro('Esse WhatsApp não é o do pedido. Confira o número com DDD.', 422, ['campo' => 'whats']);
    $vencido($p);
    Http::json(['ok' => true, 'pedido' => Pedidos::publico($p, true)]);
}

/* ------------------------------------------------------------------ painel */
if ($c === '/admin') Http::redirecionar('/admin/');

if (in_array($c, ['/admin/', '/admin/index.html', '/admin/index.php'], true)) {
    if (!Usuarios::atual()) {
        if (Sessao::pre2fa()) $login(null, '', true);
        $login();
    }
    $pagina('admin.html');
}

if ($c === '/admin/entrar') {
    if ($m !== 'POST') Http::redirecionar('/admin/');
    $email = is_string($_POST['email'] ?? null) ? trim($_POST['email']) : '';
    try {
        Csrf::verificar();
        Usuarios::entrar($email, $_POST['senha'] ?? '');
    } catch (Erro $e) {
        $login($e->getMessage(), mb_substr($email, 0, 120));
    }
    Http::redirecionar('/admin/'); // com as duas etapas ligadas, /admin/ mostra o campo do código
}

if ($c === '/admin/entrar-codigo') {
    if ($m !== 'POST') Http::redirecionar('/admin/');
    try {
        Csrf::verificar();
        Usuarios::entrarComCodigo($_POST['codigo'] ?? '');
    } catch (Erro $e) {
        $login($e->getMessage(), '', $e->campo !== 'expirou');
    }
    Http::redirecionar('/admin/');
}

if ($c === '/admin/cancelar-login') {
    if ($m === 'POST') { Csrf::verificar(); Sessao::limparPre2fa(); }
    Http::redirecionar('/admin/');
}

if ($c === '/admin/sair') {
    if ($m !== 'POST') Http::redirecionar('/admin/');
    Csrf::verificar();
    Usuarios::sair();
    if (str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json')) Http::json(['ok' => true]);
    Http::redirecionar('/admin/');
}

if (str_starts_with($c, '/admin/api/')) {
    $u = Usuarios::exigir();
    $r = substr($c, strlen('/admin/api/'));
    // a loja exige duas etapas para administradores: até ativar, o painel só abre o perfil e a ativação
    if (Usuarios::precisa2fa($u) && !in_array($r, ['estado', 'perfil', '2fa/iniciar', '2fa/ativar', 'novidades'], true)) {
        Http::erro('A loja exige a verificação em duas etapas para administradores. Ative no seu perfil para continuar.', 403, ['exige2fa' => true]);
    }
    if ($r === 'estado') Http::json(['ok' => true, 'estado' => Painel::estado($u), 'csrf' => Csrf::token()]);
    if ($r === 'novidades') Http::json(['ok' => true] + Painel::novidades((int) ($_GET['desde'] ?? 0), (int) ($_GET['rev'] ?? 0), $u));
    if (preg_match('#^colecao/([a-z]+)$#', $r, $x)) {
        $d = $post();
        Http::json(['ok' => true, 'dados' => Painel::salvarColecao($x[1], $d['dados'] ?? null, $u, $d)]);
    }
    if ($r === 'excluidos') Http::json(['ok' => true, 'itens' => Painel::excluidos((string) ($_GET['colecao'] ?? ''), $u)]);
    if ($r === 'restaurar') {
        $d = $post();
        $nome = (string) ($d['colecao'] ?? '');
        Http::json(['ok' => true, 'colecao' => $nome, 'dados' => Painel::restaurar($nome, $d['id'] ?? null, $u)]);
    }

    /* pedidos */
    if ($r === 'pedidos') {
        Usuarios::exigir('pedidos');
        $d = $post();
        Http::json(['ok' => true, 'pedido' => Pedidos::criarNoBalcao($d, $u)], 201);
    }
    if (preg_match('#^pedidos/(\d{1,9})$#', $r, $x)) {
        Usuarios::exigir('pedidos');
        $p = Pedidos::buscar((int) $x[1]);
        if (!$p) Http::erro("Pedido #{$x[1]} não encontrado.", 404);
        Http::json(['ok' => true, 'pedido' => Pedidos::paraAdmin($p)]);
    }
    if (preg_match('#^pedidos/(\d{1,9})/status$#', $r, $x)) {
        Usuarios::exigir('pedidos');
        $d = $post();
        Http::json(['ok' => true, 'pedido' => Pedidos::mudarStatus((int) $x[1], $d['para'] ?? null, $d['motivo'] ?? '', $u)]);
    }
    if (preg_match('#^pedidos/(\d{1,9})/pagamento$#', $r, $x)) {
        Usuarios::exigir('pedidos');
        $d = $post();
        Http::json(['ok' => true, 'pedido' => Pedidos::registrarPagamento((int) $x[1], $d, $u), 'entregadores' => Pedidos::entregadores()]);
    }
    if ($r === 'historico') {
        Usuarios::exigir('pedidos');
        $d = $post();
        $h = Pedidos::historico($d);
        // consulta de dados de clientes fica registrada (LGPD-04): só o tipo da busca, sem o telefone ou o nome
        if ($h['tipo'] === 'telefone' || $h['tipo'] === 'nome') Auditoria::registrar($u['id'], 'historico.buscar', 'pedido', '', ['por' => $h['tipo'], 'resultados' => $h['total']]);
        Http::json(['ok' => true] + $h);
    }
    if ($r === 'caixa') {
        Usuarios::exigir('pedidos');
        Http::json(['ok' => true, 'caixa' => Pedidos::caixa($_GET['dia'] ?? null)]);
    }
    if ($r === 'bloqueados') {
        Usuarios::exigir('pedidos');
        $d = $post();
        Http::json(['ok' => true, 'bloqueados' => Pedidos::bloquear($d['telefone'] ?? '', $d['motivo'] ?? '', $u)]);
    }
    if ($r === 'bloqueados/remover') {
        Usuarios::exigir('pedidos');
        $d = $post();
        Http::json(['ok' => true, 'bloqueados' => Pedidos::desbloquear($d['telefone'] ?? '', $u)]);
    }

    /* titular dos dados (LGPD-03): só quem tem Configurações; anonimizar pede a senha */
    if ($r === 'clientes/buscar') {
        Usuarios::exigir('configuracoes');
        $d = $post();
        $cl = Pedidos::cliente($d['telefone'] ?? '');
        Auditoria::registrar($u['id'], 'lgpd.consultar', 'cliente', '', ['pedidos' => $cl['pedidos']]);
        Http::json(['ok' => true, 'cliente' => $cl]);
    }
    if ($r === 'clientes/exportar') {
        Usuarios::exigir('configuracoes');
        $d = $post();
        $dados = Pedidos::exportar($d['telefone'] ?? '');
        Auditoria::registrar($u['id'], 'lgpd.exportar', 'cliente', '', ['pedidos' => count($dados['pedidos'])]);
        Http::json(['ok' => true, 'dados' => $dados]);
    }
    if ($r === 'clientes/anonimizar') {
        Usuarios::exigir('configuracoes');
        $d = $post();
        Usuarios::confirmar($u, $d['senhaAtual'] ?? null, 'para anonimizar os dados do cliente');
        Http::json(['ok' => true] + Pedidos::anonimizarCliente($d['telefone'] ?? '', $u));
    }

    /* perfil e verificação em duas etapas */
    if ($r === 'perfil') {
        $d = $post();
        $admin = Usuarios::salvarPerfil($d, $u);
        Http::json(['ok' => true, 'admin' => $admin, 'csrf' => Csrf::token()]);
    }
    if ($r === '2fa/iniciar') {
        $post();
        Http::json(['ok' => true] + Usuarios::iniciar2fa($u));
    }
    if ($r === '2fa/ativar') {
        $d = $post();
        $codigos = Usuarios::ativar2fa($u, $d['codigo'] ?? '', $d['senhaAtual'] ?? null);
        Http::json(['ok' => true, 'recuperacao' => $codigos, 'admin' => Usuarios::paraPainel(Usuarios::atual() ?? $u)]);
    }
    if ($r === '2fa/desativar') {
        $d = $post();
        Usuarios::desativar2fa($u, $d['senhaAtual'] ?? null);
        Http::json(['ok' => true, 'admin' => Usuarios::paraPainel(Usuarios::atual() ?? $u)]);
    }
    Http::naoEncontrado();
}

Http::naoEncontrado();
