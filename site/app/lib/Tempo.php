<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Datas e horas: no banco, milissegundos desde 1970 (UTC); para as pessoas, horário de Brasília. */
final class Tempo
{
    public const FUSO = 'America/Sao_Paulo';

    public static function fuso(): \DateTimeZone
    {
        static $z = null;
        return $z ??= new \DateTimeZone(self::FUSO);
    }

    public static function agoraMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    public static function agora(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', self::fuso());
    }

    public static function hojeIso(): string
    {
        return self::agora()->format('Y-m-d');
    }

    public static function inicioDoDiaMs(string $iso): int
    {
        return (new \DateTimeImmutable($iso . ' 00:00:00', self::fuso()))->getTimestamp() * 1000;
    }

    public static function ms(\DateTimeImmutable $d): int
    {
        return $d->getTimestamp() * 1000;
    }

    public static function deMs(int $ms): \DateTimeImmutable
    {
        return (new \DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone(self::fuso());
    }

    public static function brl(int $centavos): string
    {
        return 'R$ ' . number_format($centavos / 100, 2, ',', '.');
    }

    public static function reais(?int $centavos): ?float
    {
        return $centavos === null ? null : round($centavos / 100, 2);
    }

    public static function dataBr(string $iso): string
    {
        return implode('/', array_reverse(explode('-', $iso)));
    }
}
