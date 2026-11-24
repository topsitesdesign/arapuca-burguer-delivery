<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Banco de dados: PDO com consultas preparadas (nunca texto do usuário colado no SQL). */
final class Db
{
    private static ?\PDO $pdo = null;

    public static function conectar(array $c): \PDO
    {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int) ($c['porta'] ?? 3306), $c['nome']);
        return new \PDO($dsn, $c['usuario'], $c['senha'], [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_EMULATE_PREPARES => false,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_TIMEOUT => 10,
        ]);
    }

    public static function pdo(): \PDO
    {
        if (self::$pdo) return self::$pdo;
        if (!is_array(CONFIG) || empty(CONFIG['banco'])) throw new Erro('O sistema ainda não foi instalado.', 503);
        try {
            return self::$pdo = self::conectar(CONFIG['banco']);
        } catch (\PDOException $e) {
            // o banco não respondeu: as páginas mostram um aviso com o WhatsApp da loja (PED-06)
            throw new BancoForaDoAr($e->getMessage(), 0, $e);
        }
    }

    public static function usar(\PDO $pdo): void
    {
        self::$pdo = $pdo;
    }

    public static function q(string $sql, array $p = []): \PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st;
    }

    public static function um(string $sql, array $p = []): ?array
    {
        $r = self::q($sql, $p)->fetch();
        return $r === false ? null : $r;
    }

    public static function todos(string $sql, array $p = []): array
    {
        return self::q($sql, $p)->fetchAll();
    }

    public static function valor(string $sql, array $p = []): mixed
    {
        $v = self::q($sql, $p)->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function id(): int
    {
        return (int) self::pdo()->lastInsertId();
    }

    /** Executa tudo ou nada. */
    public static function tx(callable $f): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) return $f();
        $pdo->beginTransaction();
        try {
            $r = $f();
            $pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    /** "?, ?, ?" para listas em IN (...). */
    public static function marcas(array $lista): string
    {
        return implode(', ', array_fill(0, max(1, count($lista)), '?'));
    }
}
