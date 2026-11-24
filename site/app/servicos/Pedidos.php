<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Pedidos: criação (site e balcão), acompanhamento público, etapas e pagamento no painel, histórico, caixa,
  novidades em tempo real e os pedidos do titular (LGPD: exportar e anonimizar).
*/
final class Pedidos
{
    public const ATIVOS = ['novo', 'confirmado', 'preparo', 'entrega'];
    public const ETAPAS = ['novo', 'confirmado', 'preparo', 'entrega', 'concluido'];
    public const FINAIS = ['recusado', 'cancelado'];
    /** Nome de cada etapa no site (o painel usa os nomes internos). */
    public const SITE = ['novo' => 'recebido', 'confirmado' => 'confirmado', 'preparo' => 'preparo', 'entrega' => 'saiu', 'concluido' => 'entregue', 'recusado' => 'recusado', 'cancelado' => 'cancelado'];
    public const NOMES = ['novo' => 'Novo', 'confirmado' => 'Confirmado', 'preparo' => 'Em preparo', 'entrega' => 'Em entrega', 'concluido' => 'Concluído', 'recusado' => 'Recusado', 'cancelado' => 'Cancelado'];
    public const PAGAMENTOS = ['dinheiro' => 'Dinheiro', 'pix' => 'Pix', 'debito' => 'Cartão de débito', 'credito' => 'Cartão de crédito'];
    /** Situação do pagamento, separada da etapa: pendente, recebido, estornado (devolvido) e sem_registro (pedido de antes do controle). */
    public const SITUACOES_PAGAMENTO = ['pendente', 'recebido', 'estornado', 'sem_registro'];
    /** O link de acompanhamento deixa de mostrar o pedido 7 dias depois que ele termina (LGPD). */
    public const DIAS_LINK = 7;

    public static function formasAceitas(): array
    {
        $cfg = (array) Config::obter('pagamentos', []);
        return array_values(array_filter(array_keys(self::PAGAMENTOS), static fn ($f) => !empty($cfg[$f])));
    }

    public static function foneExibicao(string $d): string
    {
        if (strlen($d) === 11) return sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 5), substr($d, 7));
        if (strlen($d) === 10) return sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 4), substr($d, 6));
        return $d;
    }

    /** WhatsApp com o meio escondido: (11) •••••-4321. */
    public static function foneMascarado(string $d): string
    {
        if (strlen($d) < 10) return '';
        return '(' . substr($d, 0, 2) . ') ' . str_repeat('•', strlen($d) - 6) . '-' . substr($d, -4);
    }

    private static function endereco(mixed $e): array
    {
        $e = is_array($e) ? $e : [];
        return [
            'rua' => V::texto($e['rua'] ?? '', 'a rua da entrega', 3, 120, 'rua'),
            'numero' => V::texto($e['numero'] ?? '', 'o número da entrega', 1, 12, 'numero'),
            'complemento' => V::texto($e['complemento'] ?? '', 'o complemento', 0, 60, 'complemento'),
            'referencia' => V::texto($e['referencia'] ?? '', 'o ponto de referência', 0, 80, 'referencia'),
        ];
    }

    private static function troco(mixed $v, string $forma, int $total): ?int
    {
        if ($forma !== 'dinheiro' || $v === null || $v === '' || $v === false) return null;
        $cfg = (array) Config::obter('pagamentos', []);
        if (empty($cfg['troco'])) return null;
        $c = V::centavos($v, 'o troco', 10_000_000, true, 'troco');
        if ($c !== null && $c < $total) throw new Erro('O troco precisa ser de pelo menos ' . Tempo::brl($total) . '.', 422, 'troco');
        return $c;
    }

    /* ------------------------------------------------------------------ revisão (novidades do painel) */

    /**
      Próximo número de revisão. A linha do contador fica travada até o fim da transação: duas gravações ao mesmo tempo
      recebem números na ordem em que terminam, então o painel nunca perde uma mudança (PED-07).
      Chamar dentro de Db::tx, no fim da gravação.
    */
    private static function marcarRev(int $numero): void
    {
        $sql = "UPDATE contadores SET valor = LAST_INSERT_ID(valor + 1) WHERE nome = 'rev'";
        if (Db::q($sql)->rowCount() === 0) {
            // banco sem a linha do contador (não deveria acontecer depois da atualização): cria e tenta de novo
            Db::q("INSERT IGNORE INTO contadores (nome, valor) SELECT 'rev', COALESCE(MAX(rev), 0) FROM pedidos");
            Db::q($sql);
        }
        $rev = (int) Db::valor('SELECT LAST_INSERT_ID()');
        Db::q('UPDATE pedidos SET rev = ? WHERE numero = ?', [$rev, $numero]);
    }

    /** Revisão já gravada: o painel começa a perguntar a partir daqui. */
    public static function revAtual(): int
    {
        return (int) Db::valor("SELECT valor FROM contadores WHERE nome = 'rev'");
    }

    /* ------------------------------------------------------------------ números bloqueados (trote) */

    public static function bloqueado(string $tel): bool
    {
        return (bool) Db::valor('SELECT COUNT(*) FROM bloqueados WHERE telefone = ?', [$tel]);
    }

    public static function bloqueados(): array
    {
        return array_map(static fn ($r) => ['telefone' => self::foneExibicao($r['telefone']), 'digitos' => $r['telefone'], 'motivo' => $r['motivo'], 'em' => (int) $r['criado_em']],
            Db::todos('SELECT * FROM bloqueados ORDER BY criado_em DESC LIMIT 500'));
    }

    public static function bloquear(mixed $tel, mixed $motivo, array $u): array
    {
        $tel = V::telefone($tel, 'o número');
        $motivo = V::texto($motivo, 'o motivo', 2, 120, 'motivo');
        Db::q('INSERT INTO bloqueados (telefone, motivo, usuario_id, criado_em) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE motivo = VALUES(motivo), usuario_id = VALUES(usuario_id)',
            [$tel, $motivo, $u['id'], Tempo::agoraMs()]);
        Auditoria::registrar($u['id'], 'bloqueio.criar', 'telefone', substr($tel, -4), ['motivo' => $motivo]);
        return self::bloqueados();
    }

    public static function desbloquear(mixed $tel, array $u): array
    {
        $tel = V::telefone($tel, 'o número');
        Db::q('DELETE FROM bloqueados WHERE telefone = ?', [$tel]);
        Auditoria::registrar($u['id'], 'bloqueio.remover', 'telefone', substr($tel, -4));
        return self::bloqueados();
    }

    /* ------------------------------------------------------------------ criação */

    /** Pedido feito pelo site. Repetir o envio com a mesma chave devolve o mesmo pedido (sem duplicar). */
    public static function criarDoSite(array $d): array
    {
        $chave = $d['chave'] ?? null;
        if (!is_string($chave) || !preg_match('/^[a-f0-9]{32}$/', $chave)) throw new Erro('Atualize a página e tente de novo.', 400);
        $ja = Db::valor('SELECT numero FROM pedidos WHERE chave_envio = ?', [$chave]);
        if ($ja) return self::publico(self::buscar((int) $ja), true);

        $ip = Limite::ip();
        $msgIp = 'Muitos pedidos seguidos deste aparelho. Espere alguns minutos ou chame a loja no WhatsApp.';
        // pedidos aceitos: até 10 por IP em 15 min e 6 por WhatsApp em 30 min. Só contam depois de gravados,
        // então erro de preenchimento não gasta a cota e ninguém bloqueia o número de outra pessoa com envios errados.
        Limite::verificar('pedido-ip:' . $ip, 10, 900, $msgIp);
        // toda tentativa (com erro ou não) tem um teto próprio, maior, contra robôs
        Limite::contar('pedido-tentativa-ip:' . $ip, 30, 900, $msgIp);
        // campo escondido que pessoas não veem nem alcançam pelo teclado: só robô preenche
        if (is_string($d['hp'] ?? null) && trim($d['hp']) !== '') throw new Erro('Não conseguimos enviar o pedido. Atualize a página e tente de novo.', 422);
        // prova de trabalho calculada pelo navegador (Prova): sem ela, o pedido não entra
        $sal = Prova::conferir($d['prova'] ?? null);
        $nome = V::texto($d['nome'] ?? '', 'o seu nome', 2, 80, 'nome');
        $tel = V::telefone($d['telefone'] ?? '', 'o seu WhatsApp', 'telefone');
        if (self::bloqueado($tel)) throw new Erro('Não conseguimos aceitar pedidos deste número pelo site. Chame a loja no WhatsApp.', 403, 'telefone');
        Limite::verificar('pedido-tel:' . $tel, 6, 1800, 'Muitos pedidos seguidos com este WhatsApp. Chame a loja no WhatsApp para continuar.');

        $modo = V::opcao($d['modo'] ?? '', ['entrega', 'retirada'], 'o recebimento', 'modo');
        $endereco = $modo === 'entrega' ? self::endereco($d['endereco'] ?? null) : null;
        $forma = V::opcao($d['pagamento'] ?? '', self::formasAceitas(), 'a forma de pagamento', 'pagamento');

        $sit = Horarios::situacao();
        if ($sit['pausada']) throw new Erro('Pausamos os pedidos por alguns minutos. Tente de novo daqui a pouco ou chame no WhatsApp.', 409, 'quando', ['atualizar' => true]);
        $quando = V::opcao($d['quando'] ?? 'agora', ['agora', 'agendar'], 'quando receber', 'quando');
        $agendado = null;
        if ($quando === 'agora') {
            if (!$sit['aceitaAgora']) throw new Erro('A loja fechou enquanto você pedia. Escolha um horário e deixe o pedido agendado.', 409, 'quando', ['atualizar' => true]);
        } else {
            $agendado = Horarios::validarAgendamento($d['hora'] ?? null);
        }
        // o mesmo pedido de novo, do mesmo WhatsApp, em poucos minutos (recarregou a página e enviou outra vez):
        // pergunta antes de gravar. Se a pessoa confirmar, o envio volta com "repetir" e entra normalmente.
        $assinatura = self::assinatura($d, $modo, $endereco, $agendado);
        if (($d['repetir'] ?? false) !== true && ($igual = self::pedidoIgual($tel, $assinatura))) {
            // o mesmo envio (mesma chave) que acabou de entrar por outro clique: devolve o pedido, sem perguntar
            if ($igual['chave_envio'] === $chave) return self::publico(self::buscar((int) $igual['numero']), true);
            $hora = Tempo::deMs((int) $igual['criado_em'])->format('H:i');
            throw new Erro("Você já fez um pedido igual a este às $hora (nº {$igual['numero']}).", 409, 'repetido',
                ['repetido' => ['numero' => (int) $igual['numero'], 'codigo' => (string) $igual['codigo'], 'hora' => $hora]]);
        }

        try {
            $pedido = Db::tx(static function () use ($d, $chave, $nome, $tel, $modo, $endereco, $forma, $agendado, $sal, $assinatura): array {
                Prova::usar($sal); // dentro da transação: se o pedido não entrar, a prova continua valendo
                $cot = Cotacao::calcular($d, $tel, true, true);
                $esperado = $d['totalEsperado'] ?? null;
                if ($esperado !== null && (!is_numeric($esperado) || (int) round(((float) $esperado) * 100) !== $cot['total'])) {
                    throw new Erro('Os valores mudaram desde que você abriu a página. Confira o novo total e confirme de novo.', 409, 'total', ['cotacao' => Cotacao::publica($cot)]);
                }
                $troco = self::troco($d['troco'] ?? null, $forma, $cot['total']);
                $prazo = $agendado ? Horarios::rotulo($agendado) : $cot['prazo'];
                $numero = self::gravar([
                    'chave' => $chave, 'origem' => 'site', 'nome' => $nome, 'telefone' => $tel, 'modo' => $modo, 'endereco' => $endereco,
                    'cot' => $cot, 'forma' => $forma, 'troco' => $troco, 'obs' => '', 'prazo' => $prazo, 'agendado' => $agendado, 'usuario' => null,
                    'assinatura' => $assinatura,
                ]);
                // a resposta vai para quem acabou de digitar os dados: sai completa (o link de acompanhamento sai mascarado)
                return self::publico(self::buscar($numero), true);
            });
        } catch (\PDOException $e) {
            // dois envios iguais ao mesmo tempo: o segundo encontra o primeiro (e não conta de novo no limite)
            if ($e->getCode() === '23000' && ($ja = Db::valor('SELECT numero FROM pedidos WHERE chave_envio = ?', [$chave]))) return self::publico(self::buscar((int) $ja), true);
            throw $e;
        } catch (Erro $e) {
            // a mesma prova chegou duas vezes ao mesmo tempo (clique duplo): devolve o pedido que a primeira gravou
            if ($e->campo === 'prova' && ($ja = Db::valor('SELECT numero FROM pedidos WHERE chave_envio = ?', [$chave]))) return self::publico(self::buscar((int) $ja), true);
            throw $e;
        }
        Limite::somar('pedido-ip:' . $ip, 900);
        Limite::somar('pedido-tel:' . $tel, 1800);
        return $pedido;
    }

    /** Janela para reconhecer o mesmo pedido enviado de novo. */
    public const MINUTOS_REPETIDO = 20;

    /** Conteúdo do pedido (itens, escolhas, entrega, horário e cupom), sem a forma de pagamento: reconhece o mesmo pedido enviado de novo. */
    private static function assinatura(array $d, string $modo, ?array $endereco, ?int $agendado): string
    {
        $txt = static fn (mixed $v): string => is_scalar($v) ? mb_strtolower(trim((string) $v)) : '';
        $itens = [];
        foreach (is_array($d['itens'] ?? null) ? $d['itens'] : [] as $i) {
            if (!is_array($i)) continue;
            $escolhas = [];
            foreach (is_array($i['escolhas'] ?? null) ? $i['escolhas'] : [] as $grupo => $ops) {
                $ops = is_array($ops) ? array_map($txt, $ops) : [];
                sort($ops);
                if ($ops) $escolhas[(string) $grupo] = $ops;
            }
            ksort($escolhas);
            $itens[] = json_encode([$txt($i['produtoId'] ?? ''), is_numeric($i['qtd'] ?? null) ? (int) $i['qtd'] : 0, $escolhas, $txt($i['obs'] ?? '')]);
        }
        sort($itens);
        $local = $modo === 'entrega' ? Endereco::chaves($endereco, $d['area'] ?? '')['endereco'] : '';
        return sha1((string) json_encode([$itens, $modo, $local, $agendado, Cupons::normalizarCodigo($d['cupom'] ?? '')]));
    }

    /** Pedido igual, do mesmo WhatsApp, feito nos últimos minutos e ainda valendo (não recusado nem cancelado). */
    private static function pedidoIgual(string $tel, string $assinatura): ?array
    {
        return Db::um("SELECT numero, codigo, chave_envio, criado_em FROM pedidos WHERE cliente_telefone = ? AND assinatura = ? AND criado_em >= ? AND status NOT IN ('recusado', 'cancelado') ORDER BY numero DESC LIMIT 1",
            [$tel, $assinatura, Tempo::agoraMs() - self::MINUTOS_REPETIDO * 60_000]) ?: null;
    }

    /** Pedido lançado no painel (telefone, WhatsApp ou balcão), com adicionais e cupom (PED-08). */
    public static function criarNoBalcao(array $d, array $u): array
    {
        $cliente = is_array($d['cliente'] ?? null) ? $d['cliente'] : [];
        $nome = V::texto($cliente['nome'] ?? '', 'o nome do cliente', 2, 80, 'np-nome');
        $tel = V::telefone($cliente['telefone'] ?? '', 'o telefone do cliente', 'np-fone');
        $modo = V::opcao($d['modalidade'] ?? '', ['entrega', 'retirada'], 'a modalidade');
        $endereco = null;
        $area = null;
        if ($modo === 'entrega') {
            $endereco = self::endereco($d['endereco'] ?? null);
            $area = $d['endereco']['area'] ?? '';
            if (!is_string($area) || $area === '') throw new Erro('Escolha o bairro.', 422, 'np-bairro');
        }
        $forma = V::opcao(($d['pagamento']['forma'] ?? ''), array_keys(self::PAGAMENTOS), 'a forma de pagamento', 'np-pag');
        $obs = V::texto($d['obs'] ?? '', 'a observação', 0, 300, 'np-obs');
        $itens = array_map(static fn ($i) => is_array($i) ? ['produtoId' => $i['produtoId'] ?? null, 'qtd' => $i['qtd'] ?? null,
            'escolhas' => is_array($i['escolhas'] ?? null) ? $i['escolhas'] : [], 'obs' => $i['obs'] ?? ''] : [],
            V::lista($d['itens'] ?? null, 'os itens', Cotacao::MAX_LINHAS));
        $cupom = Cupons::normalizarCodigo($d['cupom'] ?? '');
        return Db::tx(static function () use ($nome, $tel, $modo, $endereco, $area, $forma, $obs, $itens, $cupom, $d, $u): array {
            try {
                $cot = Cotacao::calcular(['itens' => $itens, 'modo' => $modo, 'area' => $area, 'cupom' => $cupom, 'endereco' => $endereco], $tel, $cupom !== '', true, true);
            } catch (Erro $e) {
                if ($e->campo === 'cupom') throw new Erro($e->getMessage(), 422, 'np-cupom');
                throw $e;
            }
            $troco = $forma === 'dinheiro' ? V::centavos($d['pagamento']['trocoPara'] ?? null, 'o troco', 10_000_000, true, 'np-troco') : null;
            if ($troco !== null && $troco < $cot['total']) throw new Erro('O troco precisa ser de pelo menos ' . Tempo::brl($cot['total']) . '.', 422, 'np-troco');
            $numero = self::gravar([
                'chave' => null, 'origem' => 'balcao', 'nome' => $nome, 'telefone' => $tel, 'modo' => $modo, 'endereco' => $endereco,
                'cot' => $cot, 'forma' => $forma, 'troco' => $troco, 'obs' => $obs, 'prazo' => $cot['prazo'], 'agendado' => null, 'usuario' => $u['id'],
                'assinatura' => null,
            ]);
            Auditoria::registrar($u['id'], 'pedido.criar', 'pedido', (string) $numero);
            return self::paraAdmin(self::buscar($numero));
        });
    }

    /** Grava o pedido, os itens, a primeira etapa, o uso do cupom e o aviso do painel (dentro de uma transação). */
    private static function gravar(array $x): int
    {
        $cot = $x['cot'];
        $agora = Tempo::agoraMs();
        $itens = array_map(static fn ($l) => ['produtoId' => $l['produtoId'], 'nome' => $l['nome'], 'qtd' => $l['qtd'], 'preco' => $l['preco'],
            'adicionais' => $l['adicionais'], 'obs' => $l['obs'], 'opcoes' => $l['opcoes']], $cot['linhas']);
        if ($x['obs'] !== '' && $itens) $itens[0]['obs'] = trim($itens[0]['obs'] . ' ' . $x['obs']);
        $endereco = $x['endereco'] ? $x['endereco'] + ['bairro' => $cot['area']['nome'] ?? '', 'area' => $cot['area']['id'] ?? ''] : null;
        Db::q(
            'INSERT INTO pedidos (codigo, chave_envio, status, origem, cliente_nome, cliente_telefone, modalidade, area_id, endereco, itens, pagamento_forma, troco_para, cupom_codigo, subtotal, desconto, taxa, total, obs, prazo, agendado_para, usuario_id, criado_em, atualizado_em, pagamento_status, assinatura)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [bin2hex(random_bytes(8)), $x['chave'], 'novo', $x['origem'], $x['nome'], $x['telefone'], $x['modo'], $cot['area']['id'] ?? null,
                $endereco ? json_encode($endereco, JSON_UNESCAPED_UNICODE) : null, json_encode($itens, JSON_UNESCAPED_UNICODE), $x['forma'], $x['troco'],
                $cot['cupom']['codigo'] ?? null, $cot['subtotal'], $cot['desconto'], (int) $cot['taxa'], $cot['total'], $x['obs'], $x['prazo'], $x['agendado'],
                $x['usuario'], $agora, $agora, 'pendente', $x['assinatura'] ?? null]
        );
        $numero = Db::id();
        self::gravarItens($numero, $itens, $agora);
        Db::q('INSERT INTO pedido_eventos (pedido_numero, status, motivo, usuario_id, em) VALUES (?, ?, ?, ?, ?)', [$numero, 'novo', '', $x['usuario'], $agora]);
        if ($cot['cupom']) {
            Db::q('UPDATE cupons SET usos = usos + 1 WHERE id = ?', [$cot['cupom']['id']]);
            $local = Endereco::chaves($x['endereco'], $cot['area']['id'] ?? '');
            Db::q('INSERT INTO cupom_usos (cupom_id, telefone, pedido_numero, em, endereco_chave, predio_chave) VALUES (?, ?, ?, ?, ?, ?)',
                [$cot['cupom']['id'], $x['telefone'], $numero, $agora, $local['endereco'], $local['predio']]);
        }
        $quando = $x['agendado'] ? ' · agendado ' . mb_strtolower(Horarios::rotulo($x['agendado'])) : '';
        Db::q('INSERT INTO notificacoes (icone, cor, titulo, texto, rota, pedido, lida, em) VALUES (?, ?, ?, ?, ?, ?, 0, ?)', [
            'receipt', '', 'Novo pedido #' . $numero, mb_substr($x['nome'] . ' · ' . ($x['modo'] === 'entrega' ? 'Entrega' : 'Retirada') . ' · ' . Tempo::brl($cot['total']) . $quando, 0, 200), 'pedidos', $numero, $agora,
        ]);
        self::marcarRev($numero);
        return $numero;
    }

    /** Itens do pedido na tabela própria (relatórios por produto). Também usado pela atualização do banco. */
    public static function gravarItens(int $numero, array $itens, int $em): void
    {
        foreach (array_values($itens) as $k => $i) {
            if (!is_array($i)) continue;
            $qtd = max(1, (int) ($i['qtd'] ?? 1));
            $preco = (int) ($i['preco'] ?? 0);
            $adic = array_sum(array_map(static fn ($a) => (int) ($a['preco'] ?? 0), is_array($i['adicionais'] ?? null) ? $i['adicionais'] : []));
            $opcoes = (string) ($i['opcoes'] ?? implode(' · ', array_map(static fn ($a) => (string) ($a['nome'] ?? ''), is_array($i['adicionais'] ?? null) ? $i['adicionais'] : [])));
            Db::q('INSERT INTO pedido_itens (pedido_numero, linha, produto_id, nome, qtd, preco, adicionais, total, opcoes, obs, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $numero, $k, mb_substr((string) ($i['produtoId'] ?? ''), 0, 60), mb_substr((string) ($i['nome'] ?? ''), 0, 80), min($qtd, 32000), $preco, $adic,
                $qtd * ($preco + $adic), mb_substr($opcoes, 0, 400), mb_substr((string) ($i['obs'] ?? ''), 0, 140), $em,
            ]);
        }
    }

    /* ------------------------------------------------------------------ leitura */

    private static function montar(array $r, array $eventos): array
    {
        return [
            'numero' => (int) $r['numero'], 'codigo' => $r['codigo'], 'status' => $r['status'], 'origem' => $r['origem'],
            'nome' => $r['cliente_nome'], 'telefone' => $r['cliente_telefone'], 'modo' => $r['modalidade'], 'area' => $r['area_id'],
            'endereco' => $r['endereco'] ? json_decode((string) $r['endereco'], true) : null, 'itens' => json_decode((string) $r['itens'], true) ?: [],
            'forma' => $r['pagamento_forma'], 'troco' => $r['troco_para'] === null ? null : (int) $r['troco_para'], 'cupom' => $r['cupom_codigo'],
            'subtotal' => (int) $r['subtotal'], 'desconto' => (int) $r['desconto'], 'taxa' => (int) $r['taxa'], 'total' => (int) $r['total'],
            'obs' => $r['obs'], 'prazo' => $r['prazo'], 'agendado' => $r['agendado_para'] === null ? null : (int) $r['agendado_para'],
            'criadoEm' => (int) $r['criado_em'], 'atualizadoEm' => (int) $r['atualizado_em'], 'eventos' => $eventos, 'rev' => (int) ($r['rev'] ?? 0),
            'pagamento' => [
                'status' => (string) ($r['pagamento_status'] ?? 'pendente'), 'valor' => isset($r['pagamento_valor']) ? (int) $r['pagamento_valor'] : null,
                'forma' => $r['pagamento_real'] ?? null, 'entregador' => (string) ($r['pagamento_entregador'] ?? ''), 'usuario' => $r['pagamento_usuario'] ?? null,
                'em' => isset($r['pagamento_em']) ? (int) $r['pagamento_em'] : null, 'obs' => (string) ($r['pagamento_obs'] ?? ''),
            ],
            'anonimizado' => !empty($r['anonimizado_em']), 'primeiro' => false,
        ];
    }

    /** Vários pedidos com as etapas de cada um e o selo "primeiro pedido deste número" (três consultas no total). */
    private static function carregar(array $linhas): array
    {
        if (!$linhas) return [];
        $nums = array_map(static fn ($r) => (int) $r['numero'], $linhas);
        $ev = [];
        foreach (Db::todos('SELECT pedido_numero, status, motivo, usuario_id, em FROM pedido_eventos WHERE pedido_numero IN (' . Db::marcas($nums) . ') ORDER BY em, id', $nums) as $e) {
            $ev[(int) $e['pedido_numero']][] = ['status' => $e['status'], 'em' => (int) $e['em'], 'motivo' => $e['motivo'], 'usuario' => $e['usuario_id']];
        }
        $fones = array_values(array_unique(array_filter(array_map(static fn ($r) => (string) $r['cliente_telefone'], $linhas))));
        $primeiro = [];
        if ($fones) {
            foreach (Db::todos("SELECT cliente_telefone AS t, MIN(numero) AS n FROM pedidos WHERE cliente_telefone IN (" . Db::marcas($fones) . ") AND status <> 'recusado' GROUP BY cliente_telefone", $fones) as $x) {
                $primeiro[$x['t']] = (int) $x['n'];
            }
        }
        return array_map(static function ($r) use ($ev, $primeiro) {
            $p = self::montar($r, $ev[(int) $r['numero']] ?? []);
            $p['primeiro'] = $p['telefone'] !== '' && ($primeiro[$p['telefone']] ?? 0) === $p['numero'];
            return $p;
        }, $linhas);
    }

    public static function buscar(int $numero): ?array
    {
        $r = Db::um('SELECT * FROM pedidos WHERE numero = ?', [$numero]);
        return $r ? self::carregar([$r])[0] : null;
    }

    public static function porCodigo(string $codigo): ?array
    {
        if (!preg_match('/^[a-f0-9]{16}$/', $codigo)) return null;
        $r = Db::um('SELECT * FROM pedidos WHERE codigo = ?', [$codigo]);
        return $r ? self::carregar([$r])[0] : null;
    }

    public static function porNumeroETelefone(int $numero, string $telefone): ?array
    {
        $r = Db::um('SELECT * FROM pedidos WHERE numero = ? AND cliente_telefone = ?', [$numero, $telefone]);
        return $r ? self::carregar([$r])[0] : null;
    }

    /**
      Pedidos que o painel mostra: os de hoje, os que ainda estão em andamento e os agendados.
      Três consultas, cada uma pelo seu índice (antes era uma consulta com OR que lia a tabela inteira: BD-03).
    */
    public static function doPainel(): array
    {
        $hoje = Tempo::inicioDoDiaMs(Tempo::hojeIso());
        $porNumero = [];
        foreach ([
            ['SELECT * FROM pedidos WHERE criado_em >= ? ORDER BY numero DESC LIMIT 600', [$hoje]],
            ["SELECT * FROM pedidos WHERE status IN ('novo', 'confirmado', 'preparo', 'entrega') ORDER BY numero DESC LIMIT 600", []],
            ['SELECT * FROM pedidos WHERE agendado_para >= ? ORDER BY numero DESC LIMIT 600', [$hoje]],
        ] as [$sql, $p]) {
            foreach (Db::todos($sql, $p) as $r) $porNumero[(int) $r['numero']] = $r;
        }
        krsort($porNumero);
        return self::carregar(array_slice(array_values($porNumero), 0, 600));
    }

    /** Pedidos criados ou alterados depois da revisão $rev. */
    public static function novidades(int $rev): array
    {
        return self::carregar(Db::todos('SELECT * FROM pedidos WHERE rev > ? ORDER BY rev LIMIT 300', [$rev]));
    }

    /* ------------------------------------------------------------------ formatos de saída */

    /** Nomes dos usuários (quem recebeu o pagamento, quem mudou a etapa), inclusive os removidos. */
    private static function nomesUsuarios(): array
    {
        static $n = null;
        return $n ??= array_column(Db::todos('SELECT id, nome FROM usuarios'), 'nome', 'id');
    }

    public static function paraAdmin(array $p): array
    {
        $nomes = self::nomesUsuarios();
        $pg = $p['pagamento'];
        return [
            'numero' => $p['numero'], 'status' => $p['status'], 'origem' => $p['origem'] === 'balcao' ? 'balcão' : 'site', 'rev' => $p['rev'],
            'cliente' => ['nome' => $p['nome'], 'telefone' => self::foneExibicao($p['telefone'])],
            'modalidade' => $p['modo'],
            'endereco' => $p['endereco'] ? [
                'rua' => $p['endereco']['rua'] ?? '', 'numero' => $p['endereco']['numero'] ?? '', 'complemento' => $p['endereco']['complemento'] ?? '',
                'bairro' => $p['endereco']['bairro'] ?? '', 'area' => $p['endereco']['area'] ?? '', 'referencia' => $p['endereco']['referencia'] ?? '',
            ] : null,
            'itens' => array_map(static fn ($i) => [
                'produtoId' => $i['produtoId'] ?? '', 'nome' => $i['nome'] ?? '', 'qtd' => (int) ($i['qtd'] ?? 1), 'preco' => Tempo::reais((int) ($i['preco'] ?? 0)),
                'adicionais' => array_map(static fn ($a) => ['nome' => $a['nome'], 'preco' => Tempo::reais((int) $a['preco'])], $i['adicionais'] ?? []),
                'obs' => $i['obs'] ?? '',
            ], $p['itens']),
            'pagamento' => [
                'forma' => $p['forma'], 'trocoPara' => Tempo::reais($p['troco']),
                'status' => $pg['status'], 'valor' => Tempo::reais($pg['valor']), 'formaReal' => $pg['forma'], 'entregador' => $pg['entregador'],
                'por' => $pg['usuario'] ? ($nomes[$pg['usuario']] ?? 'Usuário removido') : null, 'em' => $pg['em'], 'obs' => $pg['obs'],
            ],
            'cupom' => $p['cupom'], 'subtotal' => Tempo::reais($p['subtotal']), 'desconto' => Tempo::reais($p['desconto']),
            'taxa' => Tempo::reais($p['taxa']), 'total' => Tempo::reais($p['total']), 'obs' => $p['obs'], 'prazo' => $p['prazo'],
            'agendadoPara' => $p['agendado'], 'agendadoRotulo' => $p['agendado'] ? Horarios::rotulo($p['agendado']) : null,
            'criadoEm' => $p['criadoEm'], 'atualizadoEm' => $p['atualizadoEm'], 'primeiroPedido' => $p['primeiro'], 'anonimizado' => $p['anonimizado'],
            'eventos' => array_map(static fn ($e) => array_filter(['status' => $e['status'], 'em' => $e['em'], 'motivo' => $e['motivo'],
                'por' => !empty($e['usuario']) ? ($nomes[$e['usuario']] ?? 'Usuário removido') : ''], static fn ($v) => $v !== ''), $p['eventos']),
        ];
    }

    /** O link de acompanhamento vale até 7 dias depois que o pedido termina (entregue, recusado ou cancelado). */
    public static function linkVencido(array $p): bool
    {
        if (in_array($p['status'], self::ATIVOS, true) || !$p['eventos']) return false;
        $fim = $p['eventos'][count($p['eventos']) - 1]['em'];
        return Tempo::agoraMs() - $fim > self::DIAS_LINK * 86_400_000;
    }

    /**
      O que o cliente vê na página de acompanhamento. Sem $completo (link encaminhado, print, aparelho de outra pessoa):
      primeiro nome, WhatsApp com o meio escondido e só o bairro. O endereço inteiro só com a confirmação do WhatsApp (LGPD-02).
    */
    public static function publico(array $p, bool $completo = false): array
    {
        $ultimo = $p['eventos'] ? $p['eventos'][count($p['eventos']) - 1] : null;
        $primeiroNome = (string) (preg_split('/\s+/u', trim($p['nome']))[0] ?? '');
        return [
            'numero' => $p['numero'], 'codigo' => $p['codigo'], 'criadoEm' => $p['criadoEm'], 'atualizadoEm' => $p['atualizadoEm'],
            'status' => self::SITE[$p['status']] ?? 'recebido',
            'eventos' => array_map(static fn ($e) => ['status' => self::SITE[$e['status']] ?? $e['status'], 'em' => $e['em']], $p['eventos']),
            'motivo' => in_array($p['status'], self::FINAIS, true) ? ($ultimo['motivo'] ?? '') : '',
            'agendadoPara' => $p['agendado'] ? Horarios::rotulo($p['agendado']) : null, 'agendadoEm' => $p['agendado'],
            'cliente' => $completo ? ['nome' => $p['nome'], 'whats' => self::foneExibicao($p['telefone'])] : ['nome' => $primeiroNome, 'whats' => self::foneMascarado($p['telefone'])],
            'modo' => $p['modo'], 'area' => $p['endereco']['bairro'] ?? null, 'prazo' => $p['prazo'],
            'endereco' => $completo && $p['endereco'] ? ['rua' => $p['endereco']['rua'] ?? '', 'numero' => $p['endereco']['numero'] ?? '',
                'complemento' => $p['endereco']['complemento'] ?? '', 'referencia' => $p['endereco']['referencia'] ?? ''] : null,
            'enderecoOculto' => !$completo && $p['endereco'] !== null, 'completo' => $completo,
            'pagamento' => ['forma' => $p['forma'], 'nome' => self::PAGAMENTOS[$p['forma']] ?? $p['forma'], 'troco' => $p['troco'] ? Tempo::brl($p['troco']) : null],
            'itens' => array_map(static fn ($i) => [
                'nome' => $i['nome'] ?? '', 'qtd' => (int) ($i['qtd'] ?? 1),
                'unit' => Tempo::reais((int) ($i['preco'] ?? 0) + array_sum(array_map(static fn ($a) => (int) $a['preco'], $i['adicionais'] ?? []))),
                'opcoes' => $i['opcoes'] ?? implode(' · ', array_map(static fn ($a) => $a['nome'], $i['adicionais'] ?? [])), 'obs' => $completo ? ($i['obs'] ?? '') : '',
            ], $p['itens']),
            'cupom' => $p['cupom'],
            'totais' => ['subtotal' => Tempo::reais($p['subtotal']), 'desconto' => Tempo::reais($p['desconto']), 'taxa' => Tempo::reais($p['taxa']), 'total' => Tempo::reais($p['total'])],
        ];
    }

    /* ------------------------------------------------------------------ etapas */

    /**
      Avança, recusa ou cancela. Só vale para a frente; clicar duas vezes não repete a etapa.
      Pedido concluído por engano: só um gerente cancela, com motivo, e fica registrado (PED-09).
    */
    public static function mudarStatus(int $numero, mixed $para, mixed $motivo, array $u): array
    {
        $para = V::opcao($para, array_merge(self::ETAPAS, self::FINAIS), 'a etapa');
        return Db::tx(static function () use ($numero, $para, $motivo, $u): array {
            $r = Db::um('SELECT numero, status, cupom_codigo FROM pedidos WHERE numero = ? FOR UPDATE', [$numero]);
            if (!$r) throw new Erro("Pedido #$numero não encontrado.", 404);
            $de = $r['status'];
            if ($de === $para) return self::paraAdmin(self::buscar($numero));
            if ($para === 'cancelado' && $de === 'concluido' && !Usuarios::gerente($u)) {
                throw new Erro("Só um gerente pode cancelar o pedido #$numero depois de concluído.", 403, null, ['pedido' => self::paraAdmin(self::buscar($numero))]);
            }
            $ok = match ($para) {
                'recusado' => $de === 'novo',
                'cancelado' => in_array($de, ['confirmado', 'preparo', 'entrega', 'concluido'], true),
                default => in_array($de, self::ATIVOS, true) && array_search($para, self::ETAPAS, true) > array_search($de, self::ETAPAS, true),
            };
            if (!$ok) {
                throw new Erro("O pedido #$numero já está como \"" . self::NOMES[$de] . '". A tela foi atualizada.', 409, null, ['pedido' => self::paraAdmin(self::buscar($numero))]);
            }
            $mot = in_array($para, self::FINAIS, true) ? V::texto($motivo, 'o motivo', 2, 120) : '';
            $agora = Tempo::agoraMs();
            Db::q('UPDATE pedidos SET status = ?, atualizado_em = ? WHERE numero = ?', [$para, $agora, $numero]);
            Db::q('INSERT INTO pedido_eventos (pedido_numero, status, motivo, usuario_id, em) VALUES (?, ?, ?, ?, ?)', [$numero, $para, $mot, $u['id'], $agora]);
            if (in_array($para, self::FINAIS, true) && $r['cupom_codigo']) {
                Db::q('UPDATE cupons SET usos = GREATEST(usos - 1, 0) WHERE codigo = ? AND arquivado_em IS NULL', [$r['cupom_codigo']]);
            }
            Auditoria::registrar($u['id'], 'pedido.' . $para, 'pedido', (string) $numero, array_filter(['motivo' => $mot, 'antes' => $de === 'concluido' ? 'concluido' : '']));
            self::marcarRev($numero);
            return self::paraAdmin(self::buscar($numero));
        });
    }

    /* ------------------------------------------------------------------ pagamento (FIN-01: sem gateway, sem pagamento online) */

    /**
      Registra o recebimento, desfaz ou estorna. $d: situacao (recebido | pendente | estornado), valor, forma, entregador, obs.
      Receber: quem tem Pedidos. Desfazer um recebimento e estornar: só gerente (com motivo no estorno).
    */
    public static function registrarPagamento(int $numero, array $d, array $u): array
    {
        $sit = V::opcao($d['situacao'] ?? '', ['recebido', 'pendente', 'estornado'], 'a situação do pagamento');
        return Db::tx(static function () use ($numero, $sit, $d, $u): array {
            $r = Db::um('SELECT * FROM pedidos WHERE numero = ? FOR UPDATE', [$numero]);
            if (!$r) throw new Erro("Pedido #$numero não encontrado.", 404);
            $de = (string) $r['pagamento_status'];
            $atual = static fn () => ['pedido' => self::paraAdmin(self::buscar($numero))];
            $agora = Tempo::agoraMs();
            if ($sit === 'recebido') {
                if ($de === 'recebido') throw new Erro("O pagamento do pedido #$numero já está registrado. A tela foi atualizada.", 409, null, $atual());
                if ($r['status'] === 'recusado') throw new Erro("O pedido #$numero foi recusado: não há pagamento para registrar.", 422);
                $total = (int) $r['total'];
                $valor = V::centavos($d['valor'] ?? null, 'o valor recebido', max(10_000_000, $total * 10), false, 'pg-valor');
                if ($valor < 1) throw new Erro('Informe o valor recebido.', 422, 'pg-valor');
                $forma = V::opcao($d['forma'] ?? '', array_keys(self::PAGAMENTOS), 'a forma usada', 'pg-forma');
                $entregador = V::texto($d['entregador'] ?? '', 'o entregador', 0, 60, 'pg-entregador');
                $obs = V::texto($d['obs'] ?? '', 'a observação', 0, 120, 'pg-obs');
                if ($valor !== $total && $obs === '') throw new Erro('O valor recebido é diferente do total. Escreva o motivo na observação.', 422, 'pg-obs');
                Db::q("UPDATE pedidos SET pagamento_status = 'recebido', pagamento_valor = ?, pagamento_real = ?, pagamento_entregador = ?, pagamento_usuario = ?, pagamento_em = ?, pagamento_obs = ?, atualizado_em = ? WHERE numero = ?",
                    [$valor, $forma, $entregador, $u['id'], $agora, $obs, $agora, $numero]);
                Auditoria::registrar($u['id'], 'pagamento.receber', 'pedido', (string) $numero, array_filter(['valor' => $valor, 'forma' => $forma, 'entregador' => $entregador, 'obs' => $obs]));
            } else {
                if (!Usuarios::gerente($u)) throw new Erro($sit === 'estornado' ? 'Só um gerente pode registrar estorno.' : 'Só um gerente pode desfazer um pagamento registrado.', 403);
                if ($de !== 'recebido') throw new Erro("O pagamento do pedido #$numero não está como recebido. A tela foi atualizada.", 409, null, $atual());
                $obs = V::texto($d['obs'] ?? '', 'o motivo', $sit === 'estornado' ? 2 : 0, 120, 'pg-obs');
                if ($sit === 'estornado') {
                    Db::q("UPDATE pedidos SET pagamento_status = 'estornado', pagamento_usuario = ?, pagamento_em = ?, pagamento_obs = ?, atualizado_em = ? WHERE numero = ?", [$u['id'], $agora, $obs, $agora, $numero]);
                } else {
                    Db::q("UPDATE pedidos SET pagamento_status = 'pendente', pagamento_valor = NULL, pagamento_real = NULL, pagamento_entregador = '', pagamento_usuario = NULL, pagamento_em = NULL, pagamento_obs = '', atualizado_em = ? WHERE numero = ?", [$agora, $numero]);
                }
                Auditoria::registrar($u['id'], $sit === 'estornado' ? 'pagamento.estornar' : 'pagamento.desfazer', 'pedido', (string) $numero, array_filter(['motivo' => $obs]));
            }
            self::marcarRev($numero);
            return self::paraAdmin(self::buscar($numero));
        });
    }

    /** Entregadores já usados (para completar o campo no painel). */
    public static function entregadores(): array
    {
        return array_column(Db::todos("SELECT pagamento_entregador AS e, MAX(pagamento_em) AS m FROM pedidos WHERE pagamento_entregador <> '' AND pagamento_em >= ? GROUP BY pagamento_entregador ORDER BY m DESC LIMIT 30",
            [Tempo::agoraMs() - 60 * 86_400_000]), 'e');
    }

    /* ------------------------------------------------------------------ caixa do dia */

    private static function janelaDia(string $dia): array
    {
        $ini = (new \DateTimeImmutable($dia . ' 00:00:00', Tempo::fuso()));
        return [Tempo::ms($ini), Tempo::ms($ini->modify('+1 day'))];
    }

    /** Linha curta para listas (caixa e histórico). */
    private static function resumo(array $r, array $nomes): array
    {
        $partes = preg_split('/\s+/u', trim((string) $r['cliente_nome'])) ?: [''];
        return [
            'numero' => (int) $r['numero'], 'status' => $r['status'], 'cliente' => $partes[0] . (count($partes) > 1 ? ' ' . mb_substr(end($partes), 0, 1) . '.' : ''),
            'telefone' => !empty($r['anonimizado_em']) ? '' : self::foneExibicao((string) $r['cliente_telefone']), 'modalidade' => $r['modalidade'],
            'total' => Tempo::reais((int) $r['total']), 'forma' => $r['pagamento_forma'], 'criadoEm' => (int) $r['criado_em'],
            'pagamento' => ['status' => $r['pagamento_status'], 'valor' => Tempo::reais(isset($r['pagamento_valor']) ? (int) $r['pagamento_valor'] : null),
                'forma' => $r['pagamento_real'], 'entregador' => $r['pagamento_entregador'], 'em' => $r['pagamento_em'] === null ? null : (int) $r['pagamento_em'],
                'por' => $r['pagamento_usuario'] ? ($nomes[$r['pagamento_usuario']] ?? 'Usuário removido') : null, 'obs' => $r['pagamento_obs']],
            'anonimizado' => !empty($r['anonimizado_em']),
        ];
    }

    /** Fechamento do dia: o que entrou (por forma e por entregador), o que falta receber e os estornos. */
    public static function caixa(mixed $dia): array
    {
        $dia = $dia === null || $dia === '' ? Tempo::hojeIso() : V::data($dia, 'o dia');
        [$ini, $fim] = self::janelaDia($dia);
        $nomes = self::nomesUsuarios();
        $recebidos = Db::todos("SELECT * FROM pedidos WHERE pagamento_status = 'recebido' AND pagamento_em >= ? AND pagamento_em < ? ORDER BY pagamento_em", [$ini, $fim]);
        $estornos = Db::todos("SELECT * FROM pedidos WHERE pagamento_status = 'estornado' AND pagamento_em >= ? AND pagamento_em < ? ORDER BY pagamento_em", [$ini, $fim]);
        $pendentes = Db::todos("SELECT * FROM pedidos WHERE pagamento_status = 'pendente' AND status NOT IN ('recusado', 'cancelado') AND criado_em >= ? AND criado_em < ? ORDER BY numero", [$ini, $fim]);
        $antigos = (int) Db::valor("SELECT COUNT(*) FROM pedidos WHERE pagamento_status = 'pendente' AND status NOT IN ('recusado', 'cancelado') AND criado_em < ? AND criado_em >= ?", [$ini, $ini - 30 * 86_400_000]);
        $porForma = array_fill_keys(array_keys(self::PAGAMENTOS), 0);
        $porEntregador = [];
        $diferenca = 0;
        foreach ($recebidos as $r) {
            $v = (int) $r['pagamento_valor'];
            $porForma[$r['pagamento_real']] = ($porForma[$r['pagamento_real']] ?? 0) + $v;
            $e = $r['pagamento_entregador'] !== '' ? $r['pagamento_entregador'] : ($r['modalidade'] === 'retirada' ? 'Balcão' : 'Sem entregador');
            $porEntregador[$e] ??= ['nome' => $e, 'pedidos' => 0, 'total' => 0];
            $porEntregador[$e]['pedidos']++;
            $porEntregador[$e]['total'] += $v;
            $diferenca += $v - (int) $r['total'];
        }
        usort($porEntregador, static fn ($a, $b) => $b['total'] <=> $a['total']);
        $reais = static fn (int $c) => Tempo::reais($c);
        return [
            'dia' => $dia,
            'recebido' => $reais(array_sum(array_map(static fn ($r) => (int) $r['pagamento_valor'], $recebidos))),
            'porForma' => array_map(static fn ($f, $v) => ['forma' => $f, 'nome' => self::PAGAMENTOS[$f] ?? $f, 'total' => Tempo::reais($v)], array_keys($porForma), $porForma),
            'porEntregador' => array_map(static fn ($e) => ['nome' => $e['nome'], 'pedidos' => $e['pedidos'], 'total' => Tempo::reais($e['total'])], $porEntregador),
            'diferenca' => $reais($diferenca),
            'aReceber' => $reais(array_sum(array_map(static fn ($r) => (int) $r['total'], $pendentes))), 'pendentesAntigos' => $antigos,
            'estornado' => $reais(array_sum(array_map(static fn ($r) => (int) $r['pagamento_valor'], $estornos))),
            'recebidos' => array_map(static fn ($r) => self::resumo($r, $nomes), $recebidos),
            'pendentes' => array_map(static fn ($r) => self::resumo($r, $nomes), $pendentes),
            'estornos' => array_map(static fn ($r) => self::resumo($r, $nomes), $estornos),
        ];
    }

    /* ------------------------------------------------------------------ histórico (PED-05) */

    /** Busca paginada no servidor: período, número, telefone ou nome, etapa e pagamento. */
    public static function historico(array $f): array
    {
        $onde = [];
        $p = [];
        $de = ($f['de'] ?? '') !== '' ? V::data($f['de'], 'a data inicial') : Tempo::agora()->modify('-30 days')->format('Y-m-d');
        $ate = ($f['ate'] ?? '') !== '' ? V::data($f['ate'], 'a data final') : Tempo::hojeIso();
        if ($ate < $de) throw new Erro('A data final precisa ser depois da inicial.', 422);
        [$ini] = self::janelaDia($de);
        [, $fim] = self::janelaDia($ate);
        $onde[] = 'criado_em >= ? AND criado_em < ?';
        array_push($p, $ini, $fim);
        $q = trim(is_string($f['q'] ?? null) ? $f['q'] : '');
        $tipo = '';
        if ($q !== '') {
            $dig = preg_replace('/\D/', '', $q) ?? '';
            if ($dig !== '' && $dig === preg_replace('/[\s#()-]/', '', $q) && strlen($dig) <= 8) {
                $onde[] = 'numero = ?'; $p[] = (int) $dig; $tipo = 'numero';
            } elseif (strlen($dig) >= 10 && strlen($dig) <= 13) {
                $onde[] = 'cliente_telefone = ?'; $p[] = V::telefone($dig); $tipo = 'telefone';
            } else {
                $onde[] = 'cliente_nome LIKE ?'; $p[] = '%' . addcslashes(mb_substr($q, 0, 60), '%_\\') . '%'; $tipo = 'nome';
            }
        }
        $status = (string) ($f['status'] ?? '');
        if ($status !== '' && $status !== 'todos') { $onde[] = 'status = ?'; $p[] = V::opcao($status, array_merge(self::ETAPAS, self::FINAIS), 'a etapa'); }
        $pag = (string) ($f['pagamento'] ?? '');
        if ($pag !== '' && $pag !== 'todos') { $onde[] = 'pagamento_status = ?'; $p[] = V::opcao($pag, self::SITUACOES_PAGAMENTO, 'a situação do pagamento'); }
        $pagina = max(1, (int) ($f['pagina'] ?? 1));
        $por = 25;
        $where = implode(' AND ', $onde);
        $total = (int) Db::valor("SELECT COUNT(*) FROM pedidos WHERE $where", $p);
        $soma = (int) Db::valor("SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE $where AND status NOT IN ('recusado', 'cancelado')", $p);
        $linhas = Db::todos("SELECT * FROM pedidos WHERE $where ORDER BY numero DESC LIMIT $por OFFSET " . (($pagina - 1) * $por), $p);
        $nomes = self::nomesUsuarios();
        return ['de' => $de, 'ate' => $ate, 'tipo' => $tipo, 'total' => $total, 'soma' => Tempo::reais($soma), 'pagina' => $pagina, 'paginas' => max(1, (int) ceil($total / $por)),
            'itens' => array_map(static fn ($r) => self::resumo($r, $nomes), $linhas)];
    }

    /* ------------------------------------------------------------------ titular dos dados (LGPD-03) */

    /** Resumo do que existe sobre um WhatsApp: pedidos, nomes usados, datas e total. */
    public static function cliente(mixed $tel): array
    {
        $tel = V::telefone($tel, 'o WhatsApp do cliente', 'cl-fone');
        $r = Db::um("SELECT COUNT(*) AS n, MIN(criado_em) AS primeiro, MAX(criado_em) AS ultimo, COALESCE(SUM(CASE WHEN status NOT IN ('recusado', 'cancelado') THEN total ELSE 0 END), 0) AS gasto FROM pedidos WHERE cliente_telefone = ?", [$tel]);
        $nomes = array_column(Db::todos('SELECT DISTINCT cliente_nome FROM pedidos WHERE cliente_telefone = ? LIMIT 10', [$tel]), 'cliente_nome');
        return ['telefone' => self::foneExibicao($tel), 'pedidos' => (int) $r['n'], 'primeiro' => $r['primeiro'] === null ? null : (int) $r['primeiro'],
            'ultimo' => $r['ultimo'] === null ? null : (int) $r['ultimo'], 'gasto' => Tempo::reais((int) $r['gasto']), 'nomes' => $nomes,
            'cupons' => (int) Db::valor('SELECT COUNT(*) FROM cupom_usos WHERE telefone = ?', [$tel]), 'bloqueado' => self::bloqueado($tel)];
    }

    /** Todos os dados de um WhatsApp, para entregar ao titular (portabilidade e acesso). */
    public static function exportar(mixed $tel): array
    {
        $tel = V::telefone($tel, 'o WhatsApp do cliente', 'cl-fone');
        $loja = (array) Config::obter('loja', []);
        $pedidos = self::carregar(Db::todos('SELECT * FROM pedidos WHERE cliente_telefone = ? ORDER BY numero', [$tel]));
        return [
            'loja' => ['nome' => (string) ($loja['nome'] ?? ''), 'cnpj' => (string) ($loja['cnpj'] ?? '')],
            'geradoEm' => Tempo::agora()->format('Y-m-d H:i'), 'whatsapp' => self::foneExibicao($tel),
            'pedidos' => array_map(static fn ($p) => [
                'numero' => $p['numero'], 'feitoEm' => Tempo::deMs($p['criadoEm'])->format('Y-m-d H:i'), 'situacao' => self::NOMES[$p['status']] ?? $p['status'],
                'nome' => $p['nome'], 'recebimento' => $p['modo'], 'endereco' => $p['endereco'],
                'itens' => array_map(static fn ($i) => ['qtd' => $i['qtd'] ?? 1, 'nome' => $i['nome'] ?? '', 'opcoes' => $i['opcoes'] ?? '', 'obs' => $i['obs'] ?? ''], $p['itens']),
                'total' => Tempo::brl($p['total']), 'pagamento' => self::PAGAMENTOS[$p['forma']] ?? $p['forma'], 'cupom' => $p['cupom'], 'observacao' => $p['obs'],
            ], $pedidos),
        ];
    }

    /** Apaga os dados pessoais dos pedidos (nome, WhatsApp, endereço e observações) e mantém os valores para a contabilidade. */
    public static function anonimizarLinhas(array $numeros, ?string $usuario, string $motivo): int
    {
        $n = 0;
        foreach (array_chunk($numeros, 100) as $lote) {
            Db::tx(static function () use ($lote, &$n): void {
                foreach (Db::todos('SELECT numero, endereco, itens FROM pedidos WHERE numero IN (' . Db::marcas($lote) . ') AND anonimizado_em IS NULL FOR UPDATE', $lote) as $r) {
                    $e = $r['endereco'] ? json_decode((string) $r['endereco'], true) : null;
                    $endereco = is_array($e) ? json_encode(['rua' => '', 'numero' => '', 'complemento' => '', 'referencia' => '', 'bairro' => (string) ($e['bairro'] ?? ''), 'area' => (string) ($e['area'] ?? '')], JSON_UNESCAPED_UNICODE) : null;
                    $itens = json_decode((string) $r['itens'], true) ?: [];
                    foreach ($itens as &$i) if (is_array($i)) $i['obs'] = '';
                    unset($i);
                    $agora = Tempo::agoraMs();
                    Db::q("UPDATE pedidos SET cliente_nome = 'Cliente anonimizado', cliente_telefone = '', endereco = ?, itens = ?, obs = '', chave_envio = NULL, assinatura = NULL, anonimizado_em = ?, atualizado_em = ? WHERE numero = ?",
                        [$endereco, json_encode($itens, JSON_UNESCAPED_UNICODE), $agora, $agora, (int) $r['numero']]);
                    Db::q("UPDATE pedido_itens SET obs = '' WHERE pedido_numero = ?", [(int) $r['numero']]);
                    Db::q("UPDATE cupom_usos SET telefone = '', endereco_chave = '', predio_chave = '' WHERE pedido_numero = ?", [(int) $r['numero']]);
                    self::marcarRev((int) $r['numero']);
                    $n++;
                }
            });
        }
        if ($n) Auditoria::registrar($usuario, 'lgpd.anonimizar', 'pedido', '', ['pedidos' => $n, 'motivo' => $motivo]);
        return $n;
    }

    /** A pedido do titular: anonimiza todos os pedidos encerrados de um WhatsApp. Pedidos em andamento ficam (ainda são necessários). */
    public static function anonimizarCliente(mixed $tel, array $u): array
    {
        $tel = V::telefone($tel, 'o WhatsApp do cliente', 'cl-fone');
        $abertos = (int) Db::valor("SELECT COUNT(*) FROM pedidos WHERE cliente_telefone = ? AND status IN ('novo', 'confirmado', 'preparo', 'entrega')", [$tel]);
        if ($abertos) throw new Erro('Este WhatsApp tem ' . $abertos . ' pedido(s) em andamento. Conclua ou cancele antes de anonimizar.', 422, 'cl-fone');
        $nums = array_map('intval', array_column(Db::todos('SELECT numero FROM pedidos WHERE cliente_telefone = ? AND anonimizado_em IS NULL', [$tel]), 'numero'));
        $n = self::anonimizarLinhas($nums, $u['id'], 'pedido do titular');
        return ['anonimizados' => $n];
    }

    /** Prazo de guarda (Configurações › Privacidade): pedidos encerrados mais antigos que isso são anonimizados aos poucos. */
    public static function anonimizarAntigos(int $limite = 100): int
    {
        $meses = (int) (((array) Config::obter('privacidade', []))['prazoMeses'] ?? 24);
        if ($meses < 6) $meses = 24;
        $corte = Tempo::ms(Tempo::agora()->modify("-$meses months"));
        $nums = array_map('intval', array_column(Db::todos("SELECT numero FROM pedidos WHERE criado_em < ? AND anonimizado_em IS NULL AND status IN ('concluido', 'recusado', 'cancelado') ORDER BY numero LIMIT " . max(1, $limite), [$corte]), 'numero'));
        return $nums ? self::anonimizarLinhas($nums, null, "prazo de guarda de $meses meses") : 0;
    }
}
