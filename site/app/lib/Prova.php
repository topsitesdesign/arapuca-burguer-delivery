<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Proteção contra pedidos feitos por robôs, sem conta em serviço externo e sem conexão de saída (prova de trabalho):
  antes de enviar, o navegador acha um número que, junto com o desafio do servidor, gera um SHA-256 que começa com
  BITS bits zerados. Para quem compra, leva menos de um segundo e é calculado enquanto a pessoa preenche a sacola;
  para um robô, cada pedido passa a exigir esse cálculo e o código que o faz. O desafio é assinado (não fica guardado),
  vale 1 hora e só serve para um pedido.
*/
final class Prova
{
    public const BITS = 16;
    public const VALIDADE = 3600;
    private const MSG = 'Não conseguimos confirmar o envio. Atualize a página e envie de novo.';

    private static function segredo(): string
    {
        return hash_hmac('sha256', 'prova-de-trabalho', (string) (CONFIG['chave'] ?? 'brasa'));
    }

    private static function assinar(string $s, int $t, int $b): string
    {
        return hash_hmac('sha256', "$s|$t|$b", self::segredo());
    }

    /** Desafio novo: s (sal), t (emitido em, segundos), b (bits zerados exigidos) e a (assinatura). */
    public static function desafio(): array
    {
        $s = bin2hex(random_bytes(16));
        $t = time();
        return ['s' => $s, 't' => $t, 'b' => self::BITS, 'a' => self::assinar($s, $t, self::BITS)];
    }

    /** Confere a prova que veio com o pedido e devolve o sal (para Prova::usar). Lança Erro com o campo "prova". */
    public static function conferir(mixed $p): string
    {
        if (!is_array($p)) throw new Erro(self::MSG, 422, 'prova');
        $s = $p['s'] ?? null;
        $t = $p['t'] ?? null;
        $b = $p['b'] ?? null;
        $a = $p['a'] ?? null;
        $n = $p['n'] ?? null;
        if (!is_string($s) || !preg_match('/^[a-f0-9]{32}$/', $s) || !is_int($t) || !is_int($b) || !is_string($a) || !is_int($n) || $n < 0 || $n > 999_999_999_999) {
            throw new Erro(self::MSG, 422, 'prova');
        }
        if ($b < self::BITS || !hash_equals(self::assinar($s, $t, $b), $a)) throw new Erro(self::MSG, 422, 'prova');
        $idade = time() - $t;
        if ($idade < -60 || $idade > self::VALIDADE) throw new Erro('O envio demorou mais que o normal. Envie de novo.', 422, 'prova');
        if (!self::zeros(hash('sha256', $s . ':' . $n, true), $b)) throw new Erro(self::MSG, 422, 'prova');
        return $s;
    }

    /**
      Marca a prova como usada. Chamar dentro da transação do pedido: se o pedido não for gravado, a marca também volta.
      Fica na tabela de tentativas, que a limpeza esvazia depois de um dia (a prova vale só uma hora).
    */
    public static function usar(string $sal): void
    {
        $k = substr(hash_hmac('sha256', 'prova:' . $sal, (string) (CONFIG['chave'] ?? 'brasa')), 0, 40);
        if (Db::q('INSERT IGNORE INTO tentativas (chave, contador, inicio) VALUES (?, 1, ?)', [$k, time()])->rowCount() === 0) {
            throw new Erro(self::MSG, 422, 'prova');
        }
    }

    private static function zeros(string $bin, int $bits): bool
    {
        $inteiros = intdiv($bits, 8);
        for ($i = 0; $i < $inteiros; $i++) {
            if (ord($bin[$i]) !== 0) return false;
        }
        $resto = $bits % 8;
        return $resto === 0 || (ord($bin[$inteiros]) >> (8 - $resto)) === 0;
    }
}
