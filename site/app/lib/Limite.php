<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Limite de tentativas por chave (IP, e-mail…). As chaves são guardadas só como hash. */
final class Limite
{
    public static function contar(string $chave, int $maximo, int $janelaSegundos, string $mensagem = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'): void
    {
        $k = self::hash($chave);
        $agora = time();
        $r = Db::um('SELECT contador, inicio FROM tentativas WHERE chave = ?', [$k]);
        if (!$r || $agora - (int) $r['inicio'] > $janelaSegundos) {
            Db::q('REPLACE INTO tentativas (chave, contador, inicio) VALUES (?, 1, ?)', [$k, $agora]);
            return;
        }
        if ((int) $r['contador'] >= $maximo) throw new Erro($mensagem, 429);
        Db::q('UPDATE tentativas SET contador = contador + 1 WHERE chave = ?', [$k]);
    }

    /** Só confere, sem somar: se a chave já chegou ao máximo dentro da janela, recusa (429). */
    public static function verificar(string $chave, int $maximo, int $janelaSegundos, string $mensagem = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'): void
    {
        $r = Db::um('SELECT contador, inicio FROM tentativas WHERE chave = ?', [self::hash($chave)]);
        if ($r && time() - (int) $r['inicio'] <= $janelaSegundos && (int) $r['contador'] >= $maximo) throw new Erro($mensagem, 429);
    }

    /** Soma uma ocorrência, sem conferir (usado depois que a ação deu certo ou falhou de verdade). */
    public static function somar(string $chave, int $janelaSegundos): void
    {
        $k = self::hash($chave);
        $agora = time();
        $r = Db::um('SELECT inicio FROM tentativas WHERE chave = ?', [$k]);
        if (!$r || $agora - (int) $r['inicio'] > $janelaSegundos) {
            Db::q('REPLACE INTO tentativas (chave, contador, inicio) VALUES (?, 1, ?)', [$k, $agora]);
            return;
        }
        Db::q('UPDATE tentativas SET contador = contador + 1 WHERE chave = ?', [$k]);
    }

    public static function zerar(string $chave): void
    {
        Db::q('DELETE FROM tentativas WHERE chave = ?', [self::hash($chave)]);
    }

    public static function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    private static function hash(string $chave): string
    {
        return substr(hash_hmac('sha256', $chave, (string) (CONFIG['chave'] ?? 'brasa')), 0, 40);
    }
}
