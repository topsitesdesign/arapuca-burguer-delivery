<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Token contra formulários forjados: todo envio (POST/PUT/DELETE) precisa trazer o token da sessão. */
final class Csrf
{
    public static function token(): string
    {
        Sessao::iniciar();
        if (empty($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
        return $_SESSION['csrf'];
    }

    public static function renovar(): void
    {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    public static function verificar(): void
    {
        Sessao::iniciar();
        $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');
        $esperado = $_SESSION['csrf'] ?? '';
        if (!is_string($enviado) || !is_string($esperado) || $esperado === '' || !hash_equals($esperado, $enviado)) {
            // 403, e não 419: alguns servidores (como o InfinityFree) trocam códigos fora do padrão por 500
            throw new Erro('Sua sessão expirou. Atualize a página e tente de novo.', 403);
        }
    }
}
