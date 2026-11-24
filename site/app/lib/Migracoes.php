<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Atualização do banco: quando o código novo chega ao servidor, a primeira requisição aplica as mudanças que faltam.
  Só acrescenta (colunas, tabelas, índices e chaves); nunca apaga dados. Cada passo confere antes de mexer,
  então rodar de novo não estraga nada. Funciona em MySQL 5.7+, MySQL 8 e MariaDB 10.3+.
  Uma requisição por vez: as outras esperam a trava (até 20 s).
*/
final class Migracoes
{
    /** Versão do banco que este código espera. */
    public const VERSAO = 3;

    public static function garantir(): void
    {
        if ((int) Config::obter('versaoBanco', 1) >= self::VERSAO) return;
        $trava = 'brasa_migracao_' . substr(hash('sha256', (string) (CONFIG['banco']['nome'] ?? '')), 0, 16);
        if ((int) Db::valor('SELECT GET_LOCK(?, 20)', [$trava]) !== 1) {
            throw new Erro('O sistema está sendo atualizado. Tente de novo em alguns segundos.', 503);
        }
        try {
            Config::esquecer();
            if ((int) Config::obter('versaoBanco', 1) < self::VERSAO) self::aplicar();
        } finally {
            Db::valor('SELECT RELEASE_LOCK(?)', [$trava]);
            Config::esquecer();
        }
    }

    /** Aplica todos os passos (também usado pelo instalador, logo depois de criar as tabelas). */
    public static function aplicar(): void
    {
        $v = (int) Config::obter('versaoBanco', 1);
        if ($v < 2) {
            self::v2();
            Config::gravar('versaoBanco', 2);
            Http::log('banco atualizado para a versão 2');
            $v = 2;
        }
        if ($v < 3) {
            self::v3();
            Config::gravar('versaoBanco', 3);
            Http::log('banco atualizado para a versão 3');
        }
    }

    /* ------------------------------------------------------------------ conferências */

    private static function tabela(string $t): bool
    {
        return (int) Db::valor('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [$t]) > 0;
    }

    private static function coluna(string $t, string $c): bool
    {
        return (int) Db::valor('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$t, $c]) > 0;
    }

    private static function indice(string $t, string $i): bool
    {
        return (int) Db::valor('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [$t, $i]) > 0;
    }

    private static function chave(string $t, string $nome): bool
    {
        return (int) Db::valor("SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'", [$t, $nome]) > 0;
    }

    private static function addColuna(string $t, string $c, string $def): void
    {
        if (!self::coluna($t, $c)) Db::pdo()->exec("ALTER TABLE $t ADD COLUMN $c $def");
    }

    /** Passo opcional (índice, chave): se a hospedagem recusar, fica registrado e a atualização segue (o sistema funciona sem ele). */
    private static function opcional(string $nome, callable $f): void
    {
        try {
            $f();
        } catch (\PDOException $e) {
            Http::log("migração: o passo opcional \"$nome\" ficou de fora: " . $e->getMessage());
        }
    }

    private static function addIndice(string $t, string $i, string $cols): void
    {
        if (!self::indice($t, $i)) self::opcional("índice $i", static fn () => Db::pdo()->exec("ALTER TABLE $t ADD INDEX $i ($cols)"));
    }

    /** Chave estrangeira só entra se não houver linha órfã (nada é apagado para encaixar). */
    private static function addChave(string $t, string $nome, string $col, string $ref, string $refCol): void
    {
        if (self::chave($t, $nome)) return;
        $orfas = (int) Db::valor("SELECT COUNT(*) FROM $t x LEFT JOIN $ref r ON r.$refCol = x.$col WHERE r.$refCol IS NULL");
        if ($orfas > 0) {
            Http::log("migração: a chave $nome ficou de fora porque $t tem $orfas linha(s) sem par em $ref");
            return;
        }
        self::opcional("chave $nome", static fn () => Db::pdo()->exec("ALTER TABLE $t ADD CONSTRAINT $nome FOREIGN KEY ($col) REFERENCES $ref ($refCol) ON DELETE RESTRICT ON UPDATE CASCADE"));
    }

    private static function criar(string $sql): void
    {
        Db::pdo()->exec($sql);
    }

    /* ------------------------------------------------------------------ versão 2: fase 2 da auditoria */

    private static function v2(): void
    {
        $tab = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

        // pedidos: revisão (novidades do painel), situação do pagamento, anonimização (LGPD) e índices (BD-03)
        self::addColuna('pedidos', 'rev', 'BIGINT UNSIGNED NOT NULL DEFAULT 0');
        self::addColuna('pedidos', 'pagamento_status', "VARCHAR(12) NOT NULL DEFAULT 'pendente'");
        self::addColuna('pedidos', 'pagamento_valor', 'INT NULL');
        self::addColuna('pedidos', 'pagamento_real', 'VARCHAR(10) NULL');
        self::addColuna('pedidos', 'pagamento_entregador', "VARCHAR(60) NOT NULL DEFAULT ''");
        self::addColuna('pedidos', 'pagamento_usuario', 'VARCHAR(60) NULL');
        self::addColuna('pedidos', 'pagamento_em', 'BIGINT NULL');
        self::addColuna('pedidos', 'pagamento_obs', "VARCHAR(120) NOT NULL DEFAULT ''");
        self::addColuna('pedidos', 'anonimizado_em', 'BIGINT NULL');
        self::addIndice('pedidos', 'ix_pedidos_rev', 'rev');
        self::addIndice('pedidos', 'ix_pedidos_agendado', 'agendado_para');
        self::addIndice('pedidos', 'ix_pedidos_pagamento', 'pagamento_em');
        // pedidos de antes do controle de pagamento: os encerrados ficam "sem registro" (nada é inventado); os em andamento, pendentes
        Db::q("UPDATE pedidos SET pagamento_status = 'sem_registro' WHERE pagamento_status = 'pendente' AND status IN ('concluido', 'recusado', 'cancelado') AND pagamento_em IS NULL");
        Db::q('UPDATE pedidos SET rev = numero WHERE rev = 0');

        // contador das revisões: a linha fica travada até o fim de cada gravação, então os números saem em ordem (PED-07)
        self::criar("CREATE TABLE IF NOT EXISTS contadores (nome VARCHAR(20) NOT NULL, valor BIGINT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (nome)) $tab");
        Db::q("INSERT INTO contadores (nome, valor) SELECT 'rev', COALESCE(MAX(rev), 0) FROM pedidos ON DUPLICATE KEY UPDATE valor = GREATEST(valor, VALUES(valor))");

        // itens do pedido em tabela (BD-05); o JSON em pedidos.itens continua como cópia fiel
        self::criar("CREATE TABLE IF NOT EXISTS pedido_itens (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, pedido_numero INT UNSIGNED NOT NULL, linha SMALLINT NOT NULL DEFAULT 0,
            produto_id VARCHAR(60) NOT NULL DEFAULT '', nome VARCHAR(80) NOT NULL DEFAULT '', qtd SMALLINT NOT NULL DEFAULT 1,
            preco INT NOT NULL DEFAULT 0, adicionais INT NOT NULL DEFAULT 0, total INT NOT NULL DEFAULT 0,
            opcoes VARCHAR(400) NOT NULL DEFAULT '', obs VARCHAR(140) NOT NULL DEFAULT '', criado_em BIGINT NOT NULL,
            PRIMARY KEY (id), KEY ix_itens_pedido (pedido_numero), KEY ix_itens_produto (produto_id, criado_em), KEY ix_itens_criado (criado_em)
        ) $tab");
        if ((int) Db::valor('SELECT COUNT(*) FROM pedido_itens') === 0) {
            $ultimo = 0;
            do {
                $lote = Db::todos('SELECT numero, itens, criado_em FROM pedidos WHERE numero > ? ORDER BY numero LIMIT 500', [$ultimo]);
                foreach ($lote as $r) {
                    $ultimo = (int) $r['numero'];
                    Pedidos::gravarItens($ultimo, json_decode((string) $r['itens'], true) ?: [], (int) $r['criado_em']);
                }
            } while (count($lote) === 500);
        }

        // chaves estrangeiras (BD-04): etapas, itens e usos de cupom sempre apontam para um pedido que existe
        self::addChave('pedido_eventos', 'fk_eventos_pedido', 'pedido_numero', 'pedidos', 'numero');
        self::addChave('pedido_itens', 'fk_itens_pedido', 'pedido_numero', 'pedidos', 'numero');
        self::addChave('cupom_usos', 'fk_usos_pedido', 'pedido_numero', 'pedidos', 'numero');

        // cardápio, cupons, áreas e banners: versão de cada item (BD-02) e arquivamento no lugar de apagar (BD-04)
        foreach (['categorias', 'produtos', 'grupos', 'cupons', 'areas', 'banners'] as $t) {
            self::addColuna($t, 'versao', 'INT NOT NULL DEFAULT 1');
            self::addColuna($t, 'arquivado_em', 'BIGINT NULL');
        }
        // o código do cupom passa a ser único só entre os cupons não excluídos (a regra fica no servidor)
        if (self::indice('cupons', 'uq_cupons_codigo')) self::opcional('código de cupom não único', static fn () => Db::pdo()->exec('ALTER TABLE cupons DROP INDEX uq_cupons_codigo'));
        self::addIndice('cupons', 'ix_cupons_codigo', 'codigo');

        // usuários: verificação em duas etapas (SEG-04) e remoção que guarda o histórico (BD-04)
        self::addColuna('usuarios', 'totp_segredo', 'VARCHAR(160) NULL');
        self::addColuna('usuarios', 'totp_ativo', 'TINYINT(1) NOT NULL DEFAULT 0');
        self::addColuna('usuarios', 'totp_passo', 'BIGINT NOT NULL DEFAULT 0');
        self::addColuna('usuarios', 'totp_recuperacao', 'TEXT NULL');
        self::addColuna('usuarios', 'removido_em', 'BIGINT NULL');

        // números bloqueados para pedidos pelo site (PED-04)
        self::criar("CREATE TABLE IF NOT EXISTS bloqueados (
            telefone VARCHAR(11) NOT NULL, motivo VARCHAR(120) NOT NULL DEFAULT '', usuario_id VARCHAR(60) NULL, criado_em BIGINT NOT NULL,
            PRIMARY KEY (telefone)
        ) $tab");

        self::addIndice('auditoria', 'ix_auditoria_acao', 'acao, criado_em');
    }

    /* ------------------------------------------------------------------ versão 3: pedido repetido e cupom por endereço */

    private static function v3(): void
    {
        // pedido repetido: assinatura do conteúdo, para avisar quem envia o mesmo pedido de novo em poucos minutos
        self::addColuna('pedidos', 'assinatura', 'CHAR(40) NULL');
        // cupom "uma vez por cliente" também pelo endereço (VAL-02): só o hash do endereço, nunca o texto
        self::addColuna('cupom_usos', 'endereco_chave', "CHAR(40) NOT NULL DEFAULT ''");
        self::addColuna('cupom_usos', 'predio_chave', "CHAR(40) NOT NULL DEFAULT ''");
        self::addIndice('cupom_usos', 'ix_usos_predio', 'cupom_id, predio_chave');
        // usos de cupom de antes desta versão: as chaves saem do endereço gravado no pedido
        $usos = Db::todos("SELECT u.id, p.endereco, p.area_id FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero
            WHERE u.predio_chave = '' AND p.endereco IS NOT NULL AND p.anonimizado_em IS NULL");
        foreach ($usos as $r) {
            $ch = Endereco::chaves(json_decode((string) $r['endereco'], true), (string) ($r['area_id'] ?? ''));
            if ($ch['predio'] !== '') Db::q('UPDATE cupom_usos SET endereco_chave = ?, predio_chave = ? WHERE id = ?', [$ch['endereco'], $ch['predio'], (int) $r['id']]);
        }
    }
}
