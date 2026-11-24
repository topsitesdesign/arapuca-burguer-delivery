<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Cálculo do pedido feito só no servidor: preço de cada produto e adicional vem do banco,
  depois desconto do cupom, taxa do bairro e total. O que o navegador mandar como preço é ignorado.
*/
final class Cotacao
{
    public const MAX_LINHAS = 30;
    public const MAX_UNIDADES = 60;

    /**
      $e: itens [{produtoId, qtd, escolhas: {grupoId: [opcaoId…]}, obs}], modo, area, cupom.
      $final = true no envio do pedido: bairro, mínimo e cupom precisam estar certos (senão, erro).
      $balcao = true nos pedidos lançados no painel: as escolhas obrigatórias podem ficar em branco.
    */
    public static function calcular(array $e, ?string $telefone = null, bool $final = false, bool $travarCupom = false, bool $balcao = false): array
    {
        $itens = V::lista($e['itens'] ?? null, 'os itens da sacola', self::MAX_LINHAS);
        if (!$itens) throw new Erro('Sua sacola está vazia. Escolha um produto para começar.', 422, 'itens');

        $prods = Cardapio::porId(Cardapio::produtos());
        $linhas = [];
        $subtotal = 0;
        $unidades = 0;
        foreach ($itens as $it) {
            $it = V::objeto($it, 'um item da sacola');
            $pid = V::id($it['produtoId'] ?? null, 'o produto');
            $p = $prods[$pid] ?? null;
            if (!$p || !Cardapio::visivel($p)) {
                throw new Erro('Um item da sacola não está mais disponível' . ($p ? ': ' . $p['nome'] : '') . '. Remova-o para continuar.', 409, 'itens', ['produtoId' => $pid, 'atualizar' => true]);
            }
            $qtd = V::inteiro($it['qtd'] ?? null, 'a quantidade de ' . $p['nome'], 1, 20);
            $escolhas = $it['escolhas'] ?? [];
            if (!is_array($escolhas)) throw new Erro('Formato inválido nas opções de ' . $p['nome'] . '.', 400);
            $gs = Cardapio::gruposDo($p);
            $mudou = new Erro('As opções de ' . $p['nome'] . ' mudaram. Remova o item e adicione de novo.', 409, 'itens', ['produtoId' => $pid, 'atualizar' => true]);
            foreach ($escolhas as $gid => $sel) {
                if (!in_array((string) $gid, array_column($gs, 'id'), true) && $sel) throw $mudou;
            }
            $base = Cardapio::precoAtual($p);
            $unit = $base;
            $adicionais = [];
            $resumo = [];
            foreach ($gs as $g) {
                $sel = $escolhas[$g['id']] ?? [];
                if (!is_array($sel) || !array_is_list($sel)) throw new Erro('Formato inválido nas opções de ' . $p['nome'] . '.', 400);
                $sel = array_values(array_unique(array_map(static fn ($x) => is_scalar($x) ? (string) $x : '', $sel)));
                if (!$balcao && count($sel) < $g['min']) {
                    throw new Erro('Escolha ' . ($g['min'] === 1 ? 'uma opção' : $g['min'] . ' opções') . ' em ' . $g['nome'] . ' (' . $p['nome'] . ').', 422, 'itens');
                }
                if (count($sel) > $g['max']) throw new Erro('Escolha até ' . $g['max'] . ' em ' . $g['nome'] . ' (' . $p['nome'] . ').', 422, 'itens');
                $ops = array_column($g['opcoes'], null, 'id');
                $nomes = [];
                foreach ($sel as $oid) {
                    $o = $ops[$oid] ?? null;
                    if (!$o) throw $mudou;
                    $adicionais[] = ['nome' => $o['nome'], 'preco' => $o['preco']];
                    $nomes[] = $o['nome'];
                    $unit += $o['preco'];
                }
                if ($nomes) $resumo[] = implode(', ', $nomes);
            }
            $obs = V::texto($it['obs'] ?? '', 'a observação do item', 0, 140);
            $unidades += $qtd;
            $subtotal += $unit * $qtd;
            $linhas[] = ['produtoId' => $p['id'], 'nome' => $p['nome'], 'qtd' => $qtd, 'preco' => $base, 'adicionais' => $adicionais,
                'obs' => $obs, 'unit' => $unit, 'opcoes' => implode(' · ', $resumo)];
        }
        if ($unidades > self::MAX_UNIDADES) throw new Erro('Para um pedido desse tamanho, fale com a loja pelo WhatsApp.', 422, 'itens');

        $modo = V::opcao($e['modo'] ?? 'entrega', ['entrega', 'retirada'], 'o recebimento', 'modo');
        $cfg = (array) Config::obter('entrega', []);
        if ($modo === 'entrega' && ($cfg['entrega'] ?? true) === false) throw new Erro('A loja não está fazendo entregas agora. Escolha a retirada no balcão.', 422, 'modo');
        if ($modo === 'retirada' && ($cfg['retirada'] ?? true) === false) throw new Erro('A retirada no balcão está desligada agora. Escolha a entrega.', 422, 'modo');

        $op = Config::operacao();
        $area = null;
        $taxa = $modo === 'retirada' ? 0 : null;
        if ($modo === 'entrega') {
            $aid = $e['area'] ?? null;
            if ($aid !== null && $aid !== '') {
                $a = Cardapio::porId(Cardapio::areas())[V::id($aid, 'o bairro')] ?? null;
                if (!$a || !$a['ativa']) throw new Erro('Não estamos entregando nesse bairro agora. Escolha outro bairro ou a retirada.', 422, 'bairro', ['atualizar' => true]);
                $area = $a;
                $taxa = $a['taxa'];
            } elseif ($final) {
                throw new Erro('Escolha o bairro da entrega.', 422, 'bairro');
            }
        }
        $minimo = $modo === 'entrega' ? max((int) $op['pedidoMinimo'], (int) ($area['minimo'] ?? 0)) : 0;
        if ($final && $minimo > 0 && $subtotal < $minimo) {
            throw new Erro('O pedido mínimo de entrega' . ($area ? ' para ' . $area['nome'] : '') . ' é de ' . Tempo::brl($minimo) . ' em produtos.', 422, 'minimo');
        }

        $cupom = null;
        $desconto = 0;
        $aviso = null;
        $codigo = Cupons::normalizarCodigo($e['cupom'] ?? '');
        if ($codigo !== '') {
            try {
                $c = Cupons::porCodigo($codigo, $travarCupom);
                if (!$c) throw new Erro('Cupom não encontrado. Confira as letras e os números.', 422, 'cupom');
                Cupons::conferir($c, $subtotal, $modo, $telefone, $modo === 'entrega' ? Endereco::chaves($e['endereco'] ?? null, $area['id'] ?? '') : []);
                $r = Cupons::aplicar($c, $subtotal, (int) $taxa);
                $desconto = $r['desconto'];
                if ($taxa !== null) $taxa = $r['taxa'];
                $cupom = $c;
            } catch (Erro $err) {
                if ($final) throw $err;
                $aviso = $err->getMessage();
            }
        }

        $prazo = $modo === 'retirada' ? (string) ($cfg['prazoRetirada'] ?? '20–30 min') : Cardapio::prazo($op, (int) ($area['tempoExtra'] ?? 0));
        return [
            'linhas' => $linhas, 'modo' => $modo, 'area' => $area, 'subtotal' => $subtotal, 'desconto' => $desconto, 'taxa' => $taxa,
            'total' => $subtotal - $desconto + (int) $taxa, 'cupom' => $cupom, 'avisoCupom' => $aviso, 'minimo' => $minimo, 'prazo' => $prazo,
        ];
    }

    /** Versão para o site (valores em reais). */
    public static function publica(array $c): array
    {
        return [
            'itens' => array_map(static fn ($l) => ['produtoId' => $l['produtoId'], 'nome' => $l['nome'], 'qtd' => $l['qtd'], 'unit' => Tempo::reais($l['unit']),
                'total' => Tempo::reais($l['unit'] * $l['qtd']), 'opcoes' => $l['opcoes'], 'obs' => $l['obs']], $c['linhas']),
            'modo' => $c['modo'], 'area' => $c['area'] ? ['id' => $c['area']['id'], 'nome' => $c['area']['nome']] : null,
            'subtotal' => Tempo::reais($c['subtotal']), 'desconto' => Tempo::reais($c['desconto']), 'taxa' => Tempo::reais($c['taxa']),
            'total' => Tempo::reais($c['total']), 'cupom' => $c['cupom'] ? Cupons::publico($c['cupom']) : null, 'avisoCupom' => $c['avisoCupom'],
            'minimo' => Tempo::reais($c['minimo']), 'prazo' => $c['prazo'],
        ];
    }
}
