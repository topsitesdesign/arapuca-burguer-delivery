<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Limpeza automática (BD-06). A hospedagem gratuita proíbe tarefas agendadas, então a limpeza roda "de carona" em
  1 de cada 100 visitas, depois que a resposta já saiu. Cada passo apaga pouco por vez (lotes pequenos).
*/
final class Limpeza
{
    public static function talvez(): void
    {
        if (random_int(1, 100) !== 1) return;
        register_shutdown_function(static function (): void {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
            try {
                self::rodar();
            } catch (\Throwable $e) {
                Http::log('limpeza: ' . get_class($e) . ': ' . $e->getMessage());
            }
        });
    }

    /** Também chamada pelos testes. Devolve quantas linhas cada passo tirou. */
    public static function rodar(): array
    {
        $agora = Tempo::agoraMs();
        $r = [];
        // tentativas de login e de pedido: as janelas mais longas são de 30 min; um dia de folga
        $r['tentativas'] = Db::q('DELETE FROM tentativas WHERE inicio < ? LIMIT 2000', [time() - 86_400])->rowCount();
        // avisos do painel com mais de 30 dias
        $r['notificacoes'] = Db::q('DELETE FROM notificacoes WHERE em < ? LIMIT 2000', [$agora - 30 * 86_400_000])->rowCount();
        // registro de auditoria: guardado pelo mesmo prazo dos pedidos (mínimo de 12 meses)
        $meses = max(12, (int) (((array) Config::obter('privacidade', []))['prazoMeses'] ?? 24));
        $r['auditoria'] = Db::q('DELETE FROM auditoria WHERE criado_em < ? LIMIT 2000', [Tempo::ms(Tempo::agora()->modify("-$meses months"))])->rowCount();
        // prazo de guarda dos dados pessoais (LGPD-03): pedidos encerrados e antigos viram anônimos, os valores ficam
        $r['anonimizados'] = Pedidos::anonimizarAntigos(100);
        return $r;
    }
}
