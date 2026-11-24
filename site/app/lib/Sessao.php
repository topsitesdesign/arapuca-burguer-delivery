<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Sessão com cookie protegido (HttpOnly, SameSite, Secure em HTTPS) e ID novo a cada login. */
final class Sessao
{
    public const LIMITE_INATIVIDADE = 8 * 3600;

    public static function iniciar(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string) self::LIMITE_INATIVIDADE);
        session_name('brasa');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => Http::https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        // O PHP apaga sessões vencidas por sorteio, dentro do session_start(). Em hospedagem compartilhada essa limpeza
        // pode não ter permissão de listar a pasta das sessões (InfinityFree: "ps_files_cleanup_dir: opendir(/php_sessions)
        // failed: Permission denied"). O aviso não pode derrubar a página (INF-13): só ele é ignorado; qualquer outro
        // aviso segue para o tratamento normal de erros.
        $anterior = null;
        $anterior = set_error_handler(static function (int $nivel, string $msg, string $arquivo = '', int $linha = 0) use (&$anterior): bool {
            if (str_contains($msg, 'ps_files_cleanup_dir')) return true;
            return is_callable($anterior) ? (bool) $anterior($nivel, $msg, $arquivo, $linha) : false;
        });
        try {
            session_start();
        } finally {
            restore_error_handler();
        }
    }

    /** ID do administrador logado (ou null). Expira por inatividade. */
    public static function adminId(): ?string
    {
        self::iniciar();
        $a = $_SESSION['admin'] ?? null;
        if (!is_array($a)) return null;
        if (time() - (int) ($a['visto'] ?? 0) > self::LIMITE_INATIVIDADE) {
            self::sairAdmin();
            return null;
        }
        $_SESSION['admin']['visto'] = time();
        return (string) $a['id'];
    }

    /** $versao identifica a senha atual: se a senha mudar, as sessões abertas com a antiga deixam de valer. */
    public static function entrarAdmin(string $id, string $versao): void
    {
        self::iniciar();
        session_regenerate_id(true);
        unset($_SESSION['pre2fa'], $_SESSION['totp_novo']);
        $_SESSION['admin'] = ['id' => $id, 'visto' => time(), 'v' => $versao];
        Csrf::renovar();
    }

    public static function versaoAdmin(): ?string
    {
        self::iniciar();
        $v = $_SESSION['admin']['v'] ?? null;
        return is_string($v) ? $v : null;
    }

    public static function definirVersao(string $versao): void
    {
        self::iniciar();
        if (isset($_SESSION['admin']) && is_array($_SESSION['admin'])) $_SESSION['admin']['v'] = $versao;
    }

    /** Senha certa, falta o código do aplicativo: guarda quem é por 5 minutos (ainda sem acesso ao painel). */
    public static function guardarPre2fa(string $id, string $versao): void
    {
        self::iniciar();
        session_regenerate_id(true);
        $_SESSION['pre2fa'] = ['id' => $id, 'v' => $versao, 'em' => time()];
    }

    public static function pre2fa(): ?array
    {
        self::iniciar();
        $p = $_SESSION['pre2fa'] ?? null;
        if (!is_array($p) || time() - (int) ($p['em'] ?? 0) > 300) { unset($_SESSION['pre2fa']); return null; }
        return $p;
    }

    public static function limparPre2fa(): void
    {
        self::iniciar();
        unset($_SESSION['pre2fa']);
    }

    /** Segredo novo da verificação em duas etapas, enquanto a pessoa ainda não confirmou o primeiro código. */
    public static function guardarSegredoNovo(?string $s): void
    {
        self::iniciar();
        if ($s === null) unset($_SESSION['totp_novo']); else $_SESSION['totp_novo'] = ['s' => $s, 'em' => time()];
    }

    public static function segredoNovo(): ?string
    {
        self::iniciar();
        $t = $_SESSION['totp_novo'] ?? null;
        return is_array($t) && time() - (int) ($t['em'] ?? 0) < 900 ? (string) $t['s'] : null;
    }

    public static function sairAdmin(): void
    {
        self::iniciar();
        unset($_SESSION['admin'], $_SESSION['pre2fa'], $_SESSION['totp_novo']);
        session_regenerate_id(true);
        Csrf::renovar();
    }
}
