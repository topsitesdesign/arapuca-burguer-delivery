<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Instalação pelo navegador (só funciona enquanto app/config.php não existe):
  pede o código de instalação, os dados do banco e o primeiro administrador; cria as tabelas, grava o cardápio inicial
  e escreve app/config.php. O código fica em app/instalacao.php e impede que outra pessoa instale no seu lugar.
*/
final class Instalador
{
    private const ARQ_CODIGO = APP . '/instalacao.php';
    private const ARQ_CONFIG = APP . '/config.php';
    private const ARQ_TENTATIVAS = RAIZ . '/storage/instalar-tentativas.json';

    public static function requisitos(): array
    {
        return [
            ['PHP 8.1 ou mais novo', version_compare(PHP_VERSION, '8.1.0', '>='), 'Versão atual: ' . PHP_VERSION],
            ['Conexão com MySQL (pdo_mysql)', extension_loaded('pdo_mysql'), ''],
            ['Textos com acento (mbstring)', extension_loaded('mbstring'), ''],
            ['Imagens (GD)', extension_loaded('gd'), 'Sem GD, o envio de fotos pelo painel não funciona.'],
            ['Pasta app/ com permissão de escrita', is_writable(APP), 'Necessário para gravar app/config.php.'],
            ['Pasta uploads/ com permissão de escrita', is_dir(RAIZ . '/uploads') && is_writable(RAIZ . '/uploads'), 'Necessário para as fotos enviadas pelo painel.'],
        ];
    }

    private static function codigo(): ?string
    {
        if (!is_file(self::ARQ_CODIGO)) return null;
        $c = require self::ARQ_CODIGO;
        return is_string($c) && strlen($c) >= 8 ? $c : null;
    }

    /** Nome da loja que a instalação vai gravar (o mesmo de app/sql/semente.php). */
    private static function lojaDaSemente(): string
    {
        $s = require APP . '/sql/semente.php';
        return (string) ($s['config']['loja']['nome'] ?? '');
    }

    private static function e(mixed $s): string
    {
        return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    }

    /** Tela do instalador (formulário, erro ou sucesso). */
    public static function pagina(?string $erro = null, array $v = [], ?string $sucesso = null): never
    {
        $e = [self::class, 'e'];
        $req = self::requisitos();
        $falta = array_filter($req, static fn ($r) => !$r[1] && $r[0] !== 'Imagens (GD)');
        $semCodigo = self::codigo() === null;
        $lista = implode('', array_map(static fn ($r) => '<li class="' . ($r[1] ? 'ok' : 'x') . '"><span>' . ($r[1] ? '✓' : '✕') . '</span>' . $e($r[0]) . ($r[1] || $r[2] === '' ? '' : '<small>' . $e($r[2]) . '</small>') . '</li>', $req));
        $campo = static fn (string $id, string $rotulo, string $tipo = 'text', string $extra = '', string $ajuda = '') =>
            '<label for="' . $id . '">' . $e($rotulo) . '</label><input id="' . $id . '" name="' . $id . '" type="' . $tipo . '" value="' . ($tipo === 'password' ? '' : $e($v[$id] ?? '')) . '" ' . $extra . '>' . ($ajuda ? '<small>' . $e($ajuda) . '</small>' : '');
        if ($sucesso !== null) {
            $corpo = '<h1>Tudo pronto</h1><p class="lead">' . $e($sucesso) . '</p><a class="btn" href="/admin/">Entrar no painel</a><p class="nota"><a href="/">Abrir o site</a></p>';
        } else {
            $corpo = '<h1>Instalar o sistema</h1><p class="lead">Preencha uma vez. Depois disso esta página some e tudo é feito pelo painel.</p>'
                . '<ul class="req">' . $lista . '</ul>'
                . ($semCodigo ? '<p class="erro">Falta o arquivo app/instalacao.php com o código de instalação. Envie a pasta do site completa de novo.</p>' : '')
                . ($erro ? '<p class="erro" role="alert">' . $e($erro) . '</p>' : '')
                . '<form method="post" action="/instalar" autocomplete="off">'
                . '<input type="hidden" name="_csrf" value="' . $e(Csrf::token()) . '">'
                . '<fieldset><legend>Código de instalação</legend>' . $campo('codigo', 'Código', 'text', 'required autocomplete="off" spellcheck="false"', 'Está no arquivo COMO-PUBLICAR.txt que veio junto com o site.') . '</fieldset>'
                . '<fieldset><legend>Banco de dados (MySQL)</legend><p class="nota">No InfinityFree: painel da conta › MySQL Databases. Copie de lá cada informação.</p>'
                . $campo('db_host', 'Servidor (MySQL Host Name)', 'text', 'required placeholder="sql000.infinityfree.com"')
                . $campo('db_nome', 'Nome do banco (MySQL DB Name)', 'text', 'required placeholder="if0_00000000_arapucabur"')
                . $campo('db_usuario', 'Usuário (MySQL User Name)', 'text', 'required placeholder="if0_00000000"')
                . $campo('db_senha', 'Senha (MySQL Password)', 'password', 'autocomplete="new-password"', 'É a senha da conta de hospedagem (vPanel), não a do site do InfinityFree.')
                . $campo('db_porta', 'Porta', 'text', 'inputmode="numeric" placeholder="3306"') . '</fieldset>'
                . '<fieldset><legend>Seu acesso ao painel</legend>'
                . $campo('nome', 'Seu nome', 'text', 'required autocomplete="name"')
                . $campo('email', 'Seu e-mail (é o login)', 'email', 'required autocomplete="email"')
                . $campo('senha', 'Crie uma senha', 'password', 'required minlength="12" autocomplete="new-password"', 'Mínimo de 12 caracteres. Evite senhas óbvias, como datas e o nome da loja.')
                . $campo('senha2', 'Repita a senha', 'password', 'required minlength="12" autocomplete="new-password"') . '</fieldset>'
                . '<button class="btn" type="submit"' . ($falta || $semCodigo ? ' disabled' : '') . '>Instalar</button></form>';
        }
        $html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
            . '<title>Instalação do sistema</title><link rel="icon" href="/favicon.svg"><style>'
            . '*{box-sizing:border-box}body{margin:0;background:#0d0a08;color:#f6eee5;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:32px 16px}'
            . 'main{max-width:560px;margin:0 auto}h1{font-size:30px;margin:0 0 8px}.lead{color:#cbbcae;margin:0 0 20px}'
            . 'fieldset{border:1px solid #3a2e25;border-radius:12px;padding:16px;margin:0 0 16px}legend{padding:0 6px;font-weight:700;color:#f7741d}'
            . 'label{display:block;font-weight:600;margin:12px 0 6px}input{width:100%;padding:12px;border-radius:8px;border:1px solid #4a3b30;background:#181210;color:#f6eee5;font:inherit}'
            . 'input:focus{outline:2px solid #f7741d;outline-offset:1px}small{display:block;color:#a5978b;font-size:13px;margin-top:4px}'
            . '.btn{display:inline-block;width:100%;text-align:center;background:#f7741d;color:#170c04;border:0;padding:14px 20px;border-radius:10px;font:inherit;font-weight:800;cursor:pointer;text-decoration:none}'
            . '.btn[disabled]{opacity:.5;cursor:not-allowed}.erro{background:#3a1410;border:1px solid #7a2a20;color:#ffd5cc;padding:12px;border-radius:10px}'
            . '.nota{color:#a5978b;font-size:14px;margin:6px 0 0}.nota a{color:#f7741d}.req{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:6px;font-size:14px}'
            . '.req span{display:inline-block;width:22px;font-weight:800}.req .ok span{color:#3ccf7c}.req .x span{color:#ff6b5b}.req small{margin-left:22px}'
            . '</style></head><body><main>' . $corpo . '</main></body></html>';
        Http::pagina($html);
    }

    private static function contarTentativa(): void
    {
        $arq = self::ARQ_TENTATIVAS;
        $k = substr(hash('sha256', Limite::ip()), 0, 16);
        $dados = is_file($arq) ? (json_decode((string) @file_get_contents($arq), true) ?: []) : [];
        $agora = time();
        $dados = array_filter($dados, static fn ($x) => $agora - (int) ($x['t'] ?? 0) < 900);
        $x = $dados[$k] ?? ['n' => 0, 't' => $agora];
        if ($x['n'] >= 8) throw new Erro('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
        $x['n']++;
        $dados[$k] = $x;
        @file_put_contents($arq, json_encode($dados), LOCK_EX);
    }

    public static function instalar(array $post): never
    {
        $v = array_map(static fn ($x) => is_string($x) ? trim($x) : '', $post);
        try {
            Csrf::verificar();
            self::contarTentativa();
            $codigo = self::codigo();
            if ($codigo === null) throw new Erro('Falta o arquivo app/instalacao.php com o código de instalação.');
            if (!hash_equals(strtoupper($codigo), strtoupper(str_replace(' ', '', $v['codigo'] ?? '')))) throw new Erro('Código de instalação incorreto. Confira no arquivo COMO-PUBLICAR.txt.');
            $nome = V::texto($v['nome'] ?? '', 'o seu nome', 2, 80);
            $email = V::email($v['email'] ?? '', 'o seu e-mail');
            // o banco ainda não existe: o nome da loja que a senha não pode repetir vem da semente
            $senha = Usuarios::validarSenha($post['senha'] ?? '', 'a senha', [], self::lojaDaSemente());
            if (($post['senha2'] ?? '') !== $senha) throw new Erro('As duas senhas não são iguais.');
            $banco = [
                'host' => V::texto($v['db_host'] ?? '', 'o servidor do banco', 1, 120), 'porta' => ($v['db_porta'] ?? '') === '' ? 3306 : V::inteiro($v['db_porta'], 'a porta', 1, 65535),
                'nome' => V::texto($v['db_nome'] ?? '', 'o nome do banco', 1, 64), 'usuario' => V::texto($v['db_usuario'] ?? '', 'o usuário do banco', 1, 64),
                'senha' => is_string($post['db_senha'] ?? null) ? $post['db_senha'] : '',
            ];
            if (!preg_match('/^[A-Za-z0-9._-]+$/', $banco['host'])) throw new Erro('Confira o servidor do banco (ex.: sql000.infinityfree.com).');
            try {
                $pdo = Db::conectar($banco);
            } catch (\PDOException $e) {
                Http::log('instalar: falha ao conectar: ' . $e->getMessage());
                throw new Erro('Não conseguimos conectar ao banco de dados. Confira o servidor, o nome do banco, o usuário e a senha.');
            }
            $msg = self::preparar($pdo, $nome, $email, $senha);
            $config = [
                'banco' => $banco, 'chave' => bin2hex(random_bytes(32)), 'ambiente' => 'producao',
                'instalado_em' => Tempo::agora()->format('Y-m-d H:i'),
            ];
            $php = "<?php\n// Gerado pelo instalador. Guarde com cuidado: tem a senha do banco.\ndefined('BRASA') || exit;\nreturn " . var_export($config, true) . ";\n";
            if (@file_put_contents(self::ARQ_CONFIG, $php, LOCK_EX) === false) throw new Erro('Não conseguimos gravar app/config.php. Confira a permissão de escrita da pasta app/.');
            @unlink(self::ARQ_CODIGO);
            @unlink(self::ARQ_TENTATIVAS);
            if (function_exists('opcache_invalidate')) @opcache_invalidate(self::ARQ_CONFIG, true);
            self::pagina(null, [], $msg);
        } catch (Erro $e) {
            self::pagina($e->getMessage(), $v);
        }
    }

    /** Cria as tabelas, o cardápio inicial e o primeiro administrador. Também usado na instalação local de teste. */
    public static function preparar(\PDO $pdo, string $nome, string $email, string $senha): string
    {
        Db::usar($pdo);
        self::criarTabelas($pdo);
        Migracoes::aplicar(); // banco antigo reaproveitado: acrescenta o que falta (num banco novo, só marca a versão)
        $jaTinha = (int) Db::valor('SELECT COUNT(*) FROM usuarios') > 0;
        if ((int) Db::valor('SELECT COUNT(*) FROM categorias') === 0) self::semear();
        if ($jaTinha) {
            return 'Este banco já tinha uma instalação. O cardápio, os pedidos e os usuários foram mantidos: entre com o e-mail e a senha de antes.';
        }
        Db::q('INSERT INTO usuarios (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            'u1', $nome, $email, password_hash($senha, PASSWORD_DEFAULT), 'Administrador', json_encode(Usuarios::PERMISSOES), 'ativo', 0, Tempo::agoraMs(),
        ]);
        Config::gravar('proprietario', 'u1'); // quem instala é o proprietário: só ele mexe no próprio acesso e no de outros administradores
        Auditoria::registrar('u1', 'instalar', 'sistema');
        return 'O banco foi preparado e o cardápio inicial está no ar. Entre no painel com ' . $email . ' e a senha que você criou.';
    }

    public static function criarTabelas(\PDO $pdo): void
    {
        $sql = (string) file_get_contents(APP . '/sql/schema.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $comando) $pdo->exec($comando);
    }

    /** Cardápio, áreas, cupom e configurações iniciais (passam pela mesma validação do painel). */
    public static function semear(): void
    {
        $s = require APP . '/sql/semente.php';
        Painel::salvarCategorias(array_map(static fn ($c) => $c + ['especial' => false], $s['categorias']));
        // a categoria especial ("Mais pedidos") é marcada aqui: o painel não cria categorias especiais
        foreach ($s['categorias'] as $c) if (!empty($c['especial'])) Db::q('UPDATE categorias SET especial = 1 WHERE id = ?', [$c['id']]);
        Painel::salvarGrupos($s['grupos']);
        Painel::salvarProdutos($s['produtos']);
        Painel::salvarAreas($s['areas']);
        Painel::salvarCupons($s['cupons']);
        Painel::salvarBanners($s['banners']);
        Painel::salvarConfig($s['config']);
        Painel::operacaoInicial($s['operacao']);
        Config::gravar('logo', '');
        foreach ($s['produtos'] as $p) if ($p['alt'] !== '') Db::q('UPDATE produtos SET alt = ? WHERE id = ?', [$p['alt'], $p['id']]);
        Cardapio::esquecer();
        Config::esquecer();
    }
}
