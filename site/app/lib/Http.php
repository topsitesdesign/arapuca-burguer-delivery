<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Entrada e saída HTTP: caminho, JSON, páginas, cabeçalhos de segurança e erros. */
final class Http
{
    private static ?string $nonce = null;

    public static function caminho(): string
    {
        $p = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        return '/' . ltrim(rawurldecode($p), '/');
    }

    public static function metodo(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function ehApi(): bool
    {
        $c = self::caminho();
        return str_starts_with($c, '/api/') || str_starts_with($c, '/admin/api/');
    }

    public static function https(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['SERVER_PORT'] ?? '') === '443'
            || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    }

    public static function nonce(): string
    {
        return self::$nonce ??= rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
    }

    public static function cabecalhos(bool $pagina = false): void
    {
        if (headers_sent()) return;
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('X-Frame-Options: DENY');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
        if (self::https()) header('Strict-Transport-Security: max-age=15552000');
        if ($pagina) {
            $n = self::nonce();
            header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-$n'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
        }
    }

    public static function json(mixed $dados, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        self::cabecalhos();
        echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function erro(string $mensagem, int $status = 422, array $extra = []): never
    {
        self::json(['ok' => false, 'erro' => $mensagem] + $extra, $status);
    }

    /** Corpo JSON da requisição (até 8 MB, por causa das imagens enviadas pelo painel). */
    public static function corpo(): array
    {
        $bruto = file_get_contents('php://input', false, null, 0, 8_000_000);
        if ($bruto === false || $bruto === '') return [];
        try {
            $dados = json_decode($bruto, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new Erro('Não conseguimos ler os dados enviados. Atualize a página e tente de novo.', 400);
        }
        return is_array($dados) ? $dados : [];
    }

    /** Envia uma página HTML: põe o token CSRF e o nonce dos scripts internos. */
    public static function pagina(string $html, int $status = 200): never
    {
        $n = self::nonce();
        $html = preg_replace('/<script(?![^>]*\bsrc=)([^>]*)>/i', '<script nonce="' . $n . '"$1>', $html) ?? $html;
        $html = str_replace('</head>', '<meta name="csrf" content="' . Csrf::token() . '">' . "\n</head>", $html);
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-cache, private');
        self::cabecalhos(true);
        echo $html;
        exit;
    }

    public static function redirecionar(string $para): never
    {
        header('Location: ' . $para, true, 303);
        exit;
    }

    public static function naoEncontrado(): never
    {
        if (self::ehApi()) self::erro('Endereço não encontrado.', 404);
        self::pagina(self::paginaSimples('Página não encontrada', 'O endereço que você abriu não existe ou mudou de lugar.', '/', 'Voltar ao cardápio'), 404);
    }

    public static function paginaSimples(string $titulo, string $texto, string $link, string $rotulo): string
    {
        $e = static fn (string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . $e($titulo) . (($n = self::nomeGuardado()) !== '' ? ' · ' . $e($n) : '') . '</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a08;color:#f6eee5;font:16px/1.5 system-ui,sans-serif;padding:24px}main{max-width:440px;text-align:center}h1{font-size:28px;margin:0 0 10px}p{color:#a5978b;margin:0 0 24px}a{display:inline-block;background:#f7741d;color:#170c04;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none}</style></head><body><main><h1>' . $e($titulo) . '</h1><p>' . $e($texto) . '</p><a href="' . $e($link) . '">' . $e($rotulo) . '</a></main></body></html>';
    }

    public static function log(string $linha): void
    {
        $pasta = RAIZ . '/storage/logs';
        if (!is_dir($pasta)) @mkdir($pasta, 0775, true);
        @file_put_contents($pasta . '/' . date('Y-m') . '.log', '[' . date('Y-m-d H:i:s') . '] ' . $linha . PHP_EOL, FILE_APPEND | LOCK_EX);
    }

    /** Qualquer erro não tratado: o usuário vê uma mensagem simples; os detalhes vão para o registro. */
    /** Nome da loja guardado em arquivo (funciona mesmo com o banco fora do ar). */
    public static function nomeGuardado(): string
    {
        return (string) (Cardapio::contatoGuardado()['nome'] ?? '');
    }

    /** Banco fora do ar: em vez de "algo deu errado", um aviso com o WhatsApp da loja (PED-06). */
    public static function foraDoAr(): never
    {
        $c = Cardapio::contatoGuardado();
        $msg = 'Estamos com instabilidade no sistema agora.' . ($c['exibicao'] !== '' ? ' Faça seu pedido pelo WhatsApp: ' . $c['exibicao'] . '.' : ' Tente de novo em alguns minutos.');
        if (self::ehApi()) self::erro($msg, 503, ['foraDoAr' => true, 'whatsapp' => $c['whatsapp']]);
        if (self::caminho() === '/js/data.js') {
            http_response_code(200);
            header('Content-Type: text/javascript; charset=utf-8');
            header('Cache-Control: no-store');
            $j = static fn ($v) => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
            echo "export const FORA_DO_AR = true;\nexport const AGORA = " . (int) floor(microtime(true) * 1000) . ";\n"
                . 'export const LOJA = ' . $j(['nome' => $c['nome'], 'logo' => $c['logo'], 'whatsapp' => $c['whatsapp'], 'whatsappExibicao' => $c['exibicao'], 'fuso' => 'America/Sao_Paulo',
                    'horarios' => [], 'excecoes' => (object) [], 'pausaManual' => true, 'fechadaPainel' => true, 'pausaAte' => null, 'prazoEntrega' => '', 'prazoRetirada' => '',
                    'pedidoMinimo' => 0, 'entrega' => false, 'retirada' => false, 'orientacoes' => '', 'troco' => false, 'antecedencia' => 45, 'endereco' => '', 'rua' => '', 'bairro' => '', 'cidade' => '', 'botao' => 'Ver cardápio']) . ";\n"
                . "export const AREAS = [];\nexport const CUPONS = [];\nexport const PAGAMENTOS = [];\nexport const STATUS = [];\nexport const STATUS_FINAIS = {};\nexport const CATEGORIAS = [];\nexport const GRUPOS = {};\nexport const PRODUTOS = [];\nexport const BANNERS = [];\n"
                . "export const img = () => 'assets/img/sem-foto.svg';\nexport const produto = () => undefined;\n";
            exit;
        }
        $e = static fn (string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $botao = $c['whatsapp'] !== '' ? '<a href="https://wa.me/' . $e($c['whatsapp']) . '?text=' . rawurlencode('Olá! Quero fazer um pedido.') . '">Pedir pelo WhatsApp</a>' : '<a href="/">Tentar de novo</a>';
        http_response_code(503);
        header('Retry-After: 120');
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . $e($c['nome'] !== '' ? $c['nome'] : 'Pedidos') . '</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg">'
            . '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a08;color:#f6eee5;font:16px/1.5 system-ui,sans-serif;padding:24px}main{max-width:440px;text-align:center}img{max-height:84px;max-width:80%;margin:0 auto 16px;display:block}h1{font-size:26px;margin:0 0 10px}p{color:#cbbcae;margin:0 0 24px}a{display:inline-block;background:#f7741d;color:#170c04;padding:14px 22px;border-radius:8px;font-weight:700;text-decoration:none}</style></head><body><main>'
            . ($c['logo'] !== '' ? '<img src="' . $e($c['logo']) . '" alt="' . $e($c['nome']) . '">' : '') . '<h1>' . $e($c['nome'] !== '' ? $c['nome'] : 'Estamos com instabilidade') . '</h1><p>' . $e($msg) . '</p>' . $botao . '</main></body></html>';
        exit;
    }

    public static function falha(\Throwable $e): void
    {
        if ($e instanceof BancoForaDoAr) {
            self::log('banco fora do ar: ' . $e->getMessage());
            self::foraDoAr();
        }
        if ($e instanceof Erro) {
            if (self::ehApi()) self::erro($e->getMessage(), $e->status, array_filter(['campo' => $e->campo]) + $e->extra);
            self::pagina(self::paginaSimples('Não deu certo', $e->getMessage(), '/', 'Voltar ao início'), $e->status);
        }
        self::log(get_class($e) . ': ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine());
        $msg = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
        if (DEV) $msg .= ' [' . $e->getMessage() . ' em ' . basename($e->getFile()) . ':' . $e->getLine() . ']';
        if (self::ehApi()) self::erro($msg, 500);
        self::pagina(self::paginaSimples('Algo deu errado', $msg, '/', 'Voltar ao início'), 500);
    }
}
