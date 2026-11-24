<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Cupons de desconto: regras conferidas no servidor (datas, limite, mínimo e uso por WhatsApp). */
final class Cupons
{
    public const TIPOS = ['percentual', 'fixo', 'frete'];

    public static function linha(array $r): array
    {
        return [
            'id' => $r['id'], 'codigo' => $r['codigo'], 'tipo' => $r['tipo'], 'valor' => (int) $r['valor'], 'minimo' => (int) $r['minimo'],
            'usos' => (int) $r['usos'], 'limite' => $r['limite'] === null ? null : (int) $r['limite'], 'porCliente' => (int) $r['por_cliente'],
            'inicio' => (string) $r['inicio'], 'validade' => (string) $r['validade'], 'habilitado' => (bool) $r['habilitado'],
            'descricao' => (string) $r['descricao'], 'ordem' => (int) $r['ordem'], 'versao' => (int) ($r['versao'] ?? 1),
        ];
    }

    public static function todos(): array
    {
        return array_map([self::class, 'linha'], Db::todos('SELECT * FROM cupons WHERE arquivado_em IS NULL ORDER BY ordem, codigo'));
    }

    public static function normalizarCodigo(mixed $c): string
    {
        return is_string($c) ? (preg_replace('/[^A-Z0-9]/', '', mb_strtoupper(trim($c))) ?? '') : '';
    }

    /** Busca pelo código; com $travar = true, segura a linha até o fim da transação (evita passar do limite). */
    public static function porCodigo(string $codigo, bool $travar = false): ?array
    {
        $r = Db::um('SELECT * FROM cupons WHERE codigo = ? AND arquivado_em IS NULL' . ($travar ? ' FOR UPDATE' : ''), [$codigo]);
        return $r ? self::linha($r) : null;
    }

    /**
      Confere se o cupom vale para este pedido. Lança Erro com a explicação para o cliente.
      $endereco: chaves do endereço de entrega (Endereco::chaves). O limite "por cliente" vale pelo WhatsApp e também pelo
      endereço (VAL-02): trocar só o número não libera o cupom de novo. Vizinhos de prédio, em apartamentos diferentes,
      usam cada um o seu; numa casa (sem complemento), inventar um complemento não libera.
    */
    public static function conferir(array $c, int $subtotal, string $modo, ?string $telefone, array $endereco = []): void
    {
        $hoje = Tempo::hojeIso();
        if (!$c['habilitado']) throw new Erro('Esse cupom não está valendo agora.', 422, 'cupom');
        if ($c['inicio'] !== '' && $c['inicio'] > $hoje) throw new Erro('Esse cupom começa a valer em ' . Tempo::dataBr($c['inicio']) . '.', 422, 'cupom');
        if ($c['validade'] !== '' && $c['validade'] < $hoje) throw new Erro('Esse cupom expirou.', 422, 'cupom');
        if ($c['limite'] !== null && $c['usos'] >= $c['limite']) throw new Erro('Esse cupom já atingiu o limite de usos.', 422, 'cupom');
        if ($c['minimo'] > 0 && $subtotal < $c['minimo']) throw new Erro('Esse cupom vale para pedidos a partir de ' . Tempo::brl($c['minimo']) . ' em produtos.', 422, 'cupom');
        if ($c['tipo'] === 'frete' && $modo !== 'entrega') throw new Erro('Esse cupom é de frete grátis e vale só para entrega.', 422, 'cupom');
        if ($telefone !== null && $c['porCliente'] > 0) {
            $usados = (int) Db::valor(
                "SELECT COUNT(*) FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero WHERE u.cupom_id = ? AND u.telefone = ? AND p.status NOT IN ('recusado', 'cancelado')",
                [$c['id'], $telefone]
            );
            if ($usados >= $c['porCliente']) {
                throw new Erro($c['porCliente'] === 1 ? 'Esse cupom já foi usado neste WhatsApp.' : 'Esse cupom já foi usado ' . $c['porCliente'] . ' vezes neste WhatsApp.', 422, 'cupom');
            }
        }
        $predio = (string) ($endereco['predio'] ?? '');
        if ($c['porCliente'] > 0 && $predio !== '') {
            $casa = (string) ($endereco['endereco'] ?? '') === $predio; // sem complemento
            $usados = (int) Db::valor(
                "SELECT COUNT(*) FROM cupom_usos u JOIN pedidos p ON p.numero = u.pedido_numero
                 WHERE u.cupom_id = ? AND u.predio_chave = ? AND (u.endereco_chave = ? OR u.endereco_chave = u.predio_chave OR ?)
                   AND p.status NOT IN ('recusado', 'cancelado')",
                [$c['id'], $predio, (string) ($endereco['endereco'] ?? ''), $casa ? 1 : 0]
            );
            if ($usados >= $c['porCliente']) {
                throw new Erro($c['porCliente'] === 1 ? 'Esse cupom já foi usado neste endereço.' : 'Esse cupom já foi usado ' . $c['porCliente'] . ' vezes neste endereço.', 422, 'cupom');
            }
        }
    }

    /** Desconto em centavos sobre os produtos; o cupom de frete zera a taxa. */
    public static function aplicar(array $c, int $subtotal, int $taxa): array
    {
        return match ($c['tipo']) {
            'percentual' => ['desconto' => (int) round($subtotal * min(100, max(0, $c['valor'])) / 100), 'taxa' => $taxa],
            'fixo' => ['desconto' => min($c['valor'], $subtotal), 'taxa' => $taxa],
            'frete' => ['desconto' => 0, 'taxa' => 0],
            default => ['desconto' => 0, 'taxa' => $taxa],
        };
    }

    public static function rotulo(array $c): string
    {
        return match ($c['tipo']) {
            'percentual' => $c['valor'] . '% de desconto nos produtos',
            'fixo' => Tempo::brl($c['valor']) . ' de desconto nos produtos',
            'frete' => 'entrega grátis',
            default => 'desconto',
        };
    }

    public static function curto(array $c): string
    {
        return match ($c['tipo']) {
            'percentual' => $c['valor'] . '% nos produtos',
            'fixo' => Tempo::brl($c['valor']) . ' nos produtos',
            'frete' => 'entrega grátis',
            default => 'desconto',
        };
    }

    public static function publico(array $c): array
    {
        return ['codigo' => $c['codigo'], 'tipo' => $c['tipo'], 'valor' => $c['tipo'] === 'percentual' ? $c['valor'] : Tempo::reais($c['valor']),
            'minimo' => Tempo::reais($c['minimo']), 'rotulo' => self::rotulo($c), 'curto' => self::curto($c)];
    }
}
