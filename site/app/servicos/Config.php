<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Configurações da loja (uma linha por assunto, guardada como JSON). */
final class Config
{
    public const CHAVES = ['loja', 'horarios', 'excecoes', 'pagamentos', 'entrega', 'notif', 'operacao', 'logo', 'proprietario', 'versaoBanco', 'privacidade', 'seguranca', 'hashFalso'];

    private static ?array $cache = null;

    public static function todas(): array
    {
        if (self::$cache !== null) return self::$cache;
        $c = [];
        foreach (Db::todos('SELECT chave, valor FROM configuracoes') as $r) {
            $c[$r['chave']] = json_decode((string) $r['valor'], true);
        }
        return self::$cache = $c;
    }

    public static function obter(string $chave, mixed $padrao = null): mixed
    {
        return self::todas()[$chave] ?? $padrao;
    }

    public static function gravar(string $chave, mixed $valor): void
    {
        Db::q(
            'INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), atualizado_em = VALUES(atualizado_em)',
            [$chave, json_encode($valor, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), Tempo::agoraMs()]
        );
        if (self::$cache !== null) self::$cache[$chave] = $valor;
    }

    public static function esquecer(): void
    {
        self::$cache = null;
    }

    /** Operação do momento; uma pausa com hora marcada termina sozinha. */
    public static function operacao(): array
    {
        $op = (array) self::obter('operacao', []);
        $op += ['aberta' => true, 'pausada' => false, 'motivo' => '', 'pausaAte' => null, 'tempoMin' => 30, 'tempoMax' => 45, 'pedidoMinimo' => 0, 'fecha' => '23:30', 'tempoPreparo' => 18];
        if ($op['pausada'] && $op['pausaAte'] && Tempo::agoraMs() >= (int) $op['pausaAte']) {
            $op = array_merge($op, ['pausada' => false, 'pausaAte' => null, 'motivo' => '']);
            self::gravar('operacao', $op);
        }
        return $op;
    }
}
