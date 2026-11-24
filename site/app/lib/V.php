<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Validação no servidor: tudo que chega é conferido (tipo, tamanho, faixa e formato). */
final class V
{
    public static function texto(mixed $v, string $rotulo, int $min = 0, int $max = 200, ?string $campo = null): string
    {
        $s = (is_string($v) || is_int($v) || is_float($v)) ? trim((string) $v) : '';
        $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
        $s = preg_replace('/\s{3,}/u', '  ', $s) ?? $s;
        $n = mb_strlen($s);
        if ($n < $min) throw new Erro($min <= 1 ? "Preencha $rotulo." : ucfirst($rotulo) . " precisa ter pelo menos $min caracteres.", 422, $campo);
        if ($n > $max) throw new Erro(ucfirst($rotulo) . " pode ter no máximo $max caracteres.", 422, $campo);
        return $s;
    }

    public static function inteiro(mixed $v, string $rotulo, int $min, int $max, ?string $campo = null): int
    {
        if (is_string($v) && preg_match('/^-?\d+$/', trim($v))) $v = (int) trim($v);
        if (is_float($v) && floor($v) === $v) $v = (int) $v;
        if (!is_int($v) || $v < $min || $v > $max) throw new Erro("Use um número de $min a $max em $rotulo.", 422, $campo);
        return $v;
    }

    /** Valor em reais (número ou texto "38,90") → centavos. */
    public static function centavos(mixed $v, string $rotulo, int $max = 100_000_000, bool $nulo = false, ?string $campo = null): ?int
    {
        if ($nulo && ($v === null || $v === '')) return null;
        if (is_string($v)) {
            $t = str_replace(['R$', ' ', "\u{00a0}"], '', $v);
            $t = str_contains($t, ',') ? str_replace(['.', ','], ['', '.'], $t) : $t;
            $v = is_numeric($t) ? (float) $t : null;
        }
        if (!is_int($v) && !is_float($v)) throw new Erro("Informe um valor em reais em $rotulo.", 422, $campo);
        $c = (int) round(((float) $v) * 100);
        if ($c < 0 || $c > $max) throw new Erro("Valor fora do permitido em $rotulo.", 422, $campo);
        return $c;
    }

    public static function bool(mixed $v): bool
    {
        return $v === true || $v === 1 || $v === '1' || $v === 'true';
    }

    public static function id(mixed $v, string $rotulo = 'um item'): string
    {
        if (!is_string($v) || !preg_match('/^[a-z0-9][a-z0-9_-]{0,59}$/', $v)) throw new Erro("Identificador inválido em $rotulo.", 422);
        return $v;
    }

    public static function data(mixed $v, string $rotulo, ?string $campo = null): string
    {
        if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            throw new Erro("Escolha uma data válida em $rotulo.", 422, $campo);
        }
        return $v;
    }

    public static function hora(mixed $v, string $rotulo): string
    {
        if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) throw new Erro("Use o formato 18:00 em $rotulo.", 422);
        return $v;
    }

    public static function opcao(mixed $v, array $permitidos, string $rotulo, ?string $campo = null): string
    {
        if (!is_string($v) || !in_array($v, $permitidos, true)) throw new Erro("Escolha uma opção válida em $rotulo.", 422, $campo);
        return $v;
    }

    /** WhatsApp/telefone com DDD: devolve só os números. */
    public static function telefone(mixed $v, string $rotulo = 'o WhatsApp', ?string $campo = 'telefone'): string
    {
        $d = preg_replace('/\D/', '', is_string($v) ? $v : '') ?? '';
        if (str_starts_with($d, '55') && strlen($d) > 11) $d = substr($d, 2);
        if (strlen($d) < 10 || strlen($d) > 11) throw new Erro("Confira $rotulo com DDD, por exemplo (11) 98765-4321.", 422, $campo);
        return $d;
    }

    public static function email(mixed $v, string $rotulo = 'o e-mail'): string
    {
        $s = is_string($v) ? mb_strtolower(trim($v)) : '';
        if (mb_strlen($s) > 120 || !filter_var($s, FILTER_VALIDATE_EMAIL)) throw new Erro("Confira $rotulo.", 422, 'email');
        return $s;
    }

    public static function lista(mixed $v, string $rotulo, int $maximo = 500): array
    {
        if (!is_array($v) || !array_is_list($v)) throw new Erro("Formato inválido em $rotulo.", 400);
        if (count($v) > $maximo) throw new Erro("Itens demais em $rotulo (máximo de $maximo).", 422);
        return $v;
    }

    public static function objeto(mixed $v, string $rotulo): array
    {
        if (!is_array($v) || (array_is_list($v) && $v !== [])) throw new Erro("Formato inválido em $rotulo.", 400);
        return $v;
    }
}
