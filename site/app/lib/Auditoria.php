<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Registro de quem fez o quê no painel. */
final class Auditoria
{
    public static function registrar(?string $usuarioId, string $acao, string $entidade = '', string $entidadeId = '', array $detalhes = []): void
    {
        $ip = substr(hash_hmac('sha256', Limite::ip(), (string) (CONFIG['chave'] ?? 'brasa')), 0, 16);
        Db::q(
            'INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, detalhes, ip_hash, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$usuarioId, mb_substr($acao, 0, 40), mb_substr($entidade, 0, 30), mb_substr($entidadeId, 0, 60), $detalhes ? json_encode($detalhes, JSON_UNESCAPED_UNICODE) : null, $ip, Tempo::agoraMs()]
        );
    }
}
