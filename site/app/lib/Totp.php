<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Verificação em duas etapas por aplicativo autenticador (TOTP, RFC 6238): Google Authenticator, Microsoft Authenticator,
  Authy e outros, todos gratuitos. Código de 6 números que muda a cada 30 s. O segredo fica cifrado no banco.
*/
final class Totp
{
    private const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    public const PASSO = 30;

    public static function novoSegredo(): string
    {
        $bin = random_bytes(20);
        $bits = '';
        foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        $s = '';
        foreach (str_split($bits, 5) as $grupo) $s .= self::B32[bindec(str_pad($grupo, 5, '0'))];
        return $s;
    }

    private static function binario(string $b32): string
    {
        $b32 = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $b32) ?? '');
        $bits = '';
        foreach (str_split($b32) as $c) {
            $i = strpos(self::B32, $c);
            if ($i === false) return '';
            $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
        }
        $bin = '';
        foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $bin .= chr(bindec($byte));
        return $bin;
    }

    public static function codigo(string $segredo, int $passo): string
    {
        $h = hash_hmac('sha1', pack('N*', 0, $passo), self::binario($segredo), true);
        $o = ord($h[19]) & 0xf;
        $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
        return str_pad((string) ($n % 1_000_000), 6, '0', STR_PAD_LEFT);
    }

    /**
      Confere o código aceitando um passo antes e um depois (relógio do celular um pouco adiantado ou atrasado).
      Devolve o passo usado (para não aceitar o mesmo código duas vezes) ou null.
    */
    public static function conferir(string $segredo, string $codigo, int $ultimoUsado = 0): ?int
    {
        $codigo = preg_replace('/\D/', '', $codigo) ?? '';
        if (strlen($codigo) !== 6) return null;
        $agora = intdiv(time(), self::PASSO);
        foreach ([0, -1, 1] as $d) {
            $p = $agora + $d;
            if ($p <= $ultimoUsado) continue;
            if (hash_equals(self::codigo($segredo, $p), $codigo)) return $p;
        }
        return null;
    }

    /** Endereço que os aplicativos entendem (tocar no celular abre o aplicativo já com a conta). */
    public static function uri(string $segredo, string $conta, string $emissor): string
    {
        return 'otpauth://totp/' . rawurlencode($emissor . ':' . $conta) . '?secret=' . $segredo . '&issuer=' . rawurlencode($emissor) . '&algorithm=SHA1&digits=6&period=30';
    }

    /* ------------------------------------------------------------------ segredo cifrado no banco */

    private static function chave(): string
    {
        return hash('sha256', (string) (CONFIG['chave'] ?? 'brasa') . '|totp', true);
    }

    public static function fechar(string $segredo): string
    {
        if (!function_exists('openssl_encrypt')) return 'p:' . $segredo;
        $iv = random_bytes(12);
        $tag = '';
        $c = openssl_encrypt($segredo, 'aes-256-gcm', self::chave(), OPENSSL_RAW_DATA, $iv, $tag);
        return 'g:' . base64_encode($iv . $tag . $c);
    }

    public static function abrir(?string $guardado): ?string
    {
        if (!$guardado) return null;
        if (str_starts_with($guardado, 'p:')) return substr($guardado, 2);
        if (!str_starts_with($guardado, 'g:') || !function_exists('openssl_decrypt')) return null;
        $b = base64_decode(substr($guardado, 2), true);
        if ($b === false || strlen($b) < 29) return null;
        $s = openssl_decrypt(substr($b, 28), 'aes-256-gcm', self::chave(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
        return $s === false ? null : $s;
    }

    /* ------------------------------------------------------------------ códigos de recuperação (celular perdido) */

    /** 8 códigos de uso único, no formato XXXX-XXXX. Devolve [códigos para mostrar, hashes para guardar]. */
    public static function codigosRecuperacao(): array
    {
        $letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $mostrar = [];
        $guardar = [];
        for ($i = 0; $i < 8; $i++) {
            $c = '';
            for ($j = 0; $j < 8; $j++) $c .= $letras[random_int(0, strlen($letras) - 1)];
            $c = substr($c, 0, 4) . '-' . substr($c, 4);
            $mostrar[] = $c;
            $guardar[] = password_hash($c, PASSWORD_DEFAULT);
        }
        return [$mostrar, $guardar];
    }

    /** Confere um código de recuperação; devolve a lista sem o código usado, ou null se não confere. */
    public static function usarRecuperacao(array $hashes, string $codigo): ?array
    {
        $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $codigo) ?? '');
        if (strlen($codigo) !== 8) return null;
        $codigo = substr($codigo, 0, 4) . '-' . substr($codigo, 4);
        foreach ($hashes as $i => $h) {
            if (is_string($h) && password_verify($codigo, $h)) {
                unset($hashes[$i]);
                return array_values($hashes);
            }
        }
        return null;
    }
}
