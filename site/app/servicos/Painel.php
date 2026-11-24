<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Painel administrativo: monta o estado inicial (no mesmo formato do protótipo) e grava cada coleção
  que o painel altera. Tudo é validado aqui; o que vier fora do formato é recusado.
*/
final class Painel
{
    /** Coleção → permissão exigida. */
    public const COLECOES = [
        'categorias' => 'produtos', 'produtos' => 'produtos', 'grupos' => 'produtos', 'cupons' => 'cupons', 'areas' => 'areas',
        'banners' => 'banners', 'config' => 'configuracoes', 'logo' => 'configuracoes', 'operacao' => 'pedidos', 'usuarios' => 'usuarios', 'notificacoes' => null,
    ];
    public const ICONES = ['star', 'burger', 'gift', 'utensils', 'cup', 'ice-cream', 'moon', 'layers', 'flame', 'package', 'percent', 'bag'];
    public const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    /** Coleções em lista: o painel manda só o que mudou, com a versão de cada item (BD-02). [tabela, campo do nome, saída] */
    public const LISTAS = [
        'categorias' => ['categorias', 'nome', 'categoriasSaida'], 'grupos' => ['grupos', 'nome', 'gruposSaida'], 'produtos' => ['produtos', 'nome', 'produtosSaida'],
        'cupons' => ['cupons', 'codigo', 'cuponsSaida'], 'areas' => ['areas', 'nome', 'areasSaida'], 'banners' => ['banners', 'titulo', 'bannersSaida'],
    ];

    /* ================================================================== estado inicial */

    /**
      Estado inicial do painel, montado conforme as permissões de quem entrou: dados de clientes, vendas,
      cupons e ajustes internos só vão para quem pode vê-los (a tela escondida não basta: os dados chegam ao navegador).
    */
    public static function estado(array $u): array
    {
        $agora = Tempo::agoraMs();
        $vePedidos = Usuarios::pode($u, 'pedidos');
        $rev = $vePedidos ? Pedidos::revAtual() : 0; // lida antes dos pedidos: o que mudar depois chega na próxima consulta
        return [
            'versao' => 2, 'ancora' => $agora, 'agora' => $agora, 'rev' => $rev,
            'logo' => Cardapio::logo(),
            'admin' => Usuarios::paraPainel($u),
            'operacao' => self::operacaoSaida(Config::operacao()),
            'preferencias' => ['som' => true],
        ] + ($vePedidos ? self::metricas() : self::metricasVazias()) + [
            'notificacoes' => self::notificacoes($u),
            'categorias' => self::categoriasSaida(), 'produtos' => self::produtosSaida(), 'grupos' => self::gruposSaida(),
            'cupons' => Usuarios::pode($u, 'cupons') ? self::cuponsSaida() : [],
            'areas' => self::areasSaida(), 'banners' => self::bannersSaida(),
            'config' => self::configSaida(Usuarios::pode($u, 'configuracoes')),
            'usuarios' => Usuarios::pode($u, 'usuarios') ? Usuarios::lista() : [],
            'pedidos' => $vePedidos ? array_map([Pedidos::class, 'paraAdmin'], Pedidos::doPainel()) : [],
            'bloqueados' => $vePedidos ? Pedidos::bloqueados() : [],
            'entregadores' => $vePedidos ? Pedidos::entregadores() : [],
            'proximoNumero' => 0,
        ];
    }

    /** O que mudou desde $desde (ms): pedidos, avisos e a operação (pausa, loja aberta), conforme as permissões. */
    public static function novidades(int $desde, int $rev, array $u): array
    {
        $agora = Tempo::agoraMs();
        $desde = max(0, min($desde, $agora));
        [$filtro, $p] = self::filtroAvisos($u);
        $avisos = array_map([self::class, 'notificacaoSaida'], Db::todos("SELECT * FROM notificacoes WHERE em > ?$filtro ORDER BY id DESC LIMIT 50", array_merge([$desde], $p)));
        $pedidos = Usuarios::pode($u, 'pedidos') ? Pedidos::novidades($rev) : [];
        return [
            'agora' => $agora,
            // pedidos pela revisão do banco (não pelo relógio do servidor): nenhuma mudança fica para trás (PED-07)
            'rev' => $pedidos ? max(array_column($pedidos, 'rev')) : $rev,
            'pedidos' => array_map([Pedidos::class, 'paraAdmin'], $pedidos),
            'notificacoes' => $avisos,
            'operacao' => self::operacaoSaida(Config::operacao()),
        ];
    }

    /** Avisos de pedido só para quem tem "pedidos"; avisos de acessos só para quem tem "usuarios". */
    private static function filtroAvisos(array $u): array
    {
        $sql = '';
        $p = [];
        if (!Usuarios::pode($u, 'pedidos')) { $sql .= ' AND rota <> ?'; $p[] = 'pedidos'; }
        if (!Usuarios::pode($u, 'usuarios')) { $sql .= ' AND rota <> ?'; $p[] = Usuarios::ROTA_ACESSOS; }
        return [$sql, $p];
    }

    /** Números de vendas zerados, para quem não tem a permissão de pedidos (a visão geral mostra só a loja). */
    private static function metricasVazias(): array
    {
        $semana = ['total' => 0.0, 'delta' => 0.0, 'dias' => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]];
        return ['ontem' => ['pedidos' => 0, 'faturamento' => 0.0], 'semana' => ['atual' => $semana, 'anterior' => $semana], 'maisVendidos' => []];
    }

    private static function urlImagem(string $chave): string
    {
        return $chave === '' ? '' : '/' . Imagem::url($chave, 960);
    }

    /** Imagem enviada pelo painel: dado novo (data:), arquivo já enviado (/uploads/…), foto do banco do projeto ou vazio. */
    private static function imagemEntrada(mixed $v, string &$foto): string
    {
        if ($v === null || $v === '' || $v === false) return '';
        if (!is_string($v)) throw new Erro('Imagem inválida. Envie a imagem de novo.');
        if (str_starts_with($v, 'data:')) return Imagem::deDataUrl($v);
        if (preg_match('#(?:^|/)uploads/(u-[a-f0-9]{12})-(?:500|960)\.(webp|jpg)$#', $v, $m)) return $m[1] . ($m[2] === 'jpg' ? '-j' : '');
        if (preg_match('#(?:^|/)assets/img/photo-(f\d{3,12})(?:-\d+)?\.webp$#', $v, $m)) { $foto = $m[1]; return ''; }
        throw new Erro('Imagem inválida. Envie a imagem de novo.');
    }

    /** Apaga do disco as imagens enviadas que nenhum cadastro usa mais. */
    private static function limparImagens(array $chaves): void
    {
        $logo = (string) Config::obter('logo', '');
        foreach (array_unique(array_filter($chaves)) as $k) {
            if (!preg_match(Imagem::PADRAO_CHAVE, $k) || $k === $logo) continue;
            $uso = (int) Db::valor('SELECT (SELECT COUNT(*) FROM produtos WHERE imagem = ?) + (SELECT COUNT(*) FROM categorias WHERE imagem = ?) + (SELECT COUNT(*) FROM banners WHERE imagem = ?)', [$k, $k, $k]);
            if ($uso > 0) continue;
            $jpg = str_ends_with($k, '-j');
            $base = $jpg ? substr($k, 0, -2) : $k;
            foreach ([500, 960] as $w) @unlink(RAIZ . "/uploads/$base-$w." . ($jpg ? 'jpg' : 'webp'));
        }
    }

    private static function data(mixed $v, string $rotulo, bool $vazio = true): string
    {
        if ($vazio && ($v === '' || $v === null)) return '';
        return V::data($v, $rotulo);
    }

    private static function json(mixed $v): string
    {
        return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /** Garante ids únicos e devolve a lista validada. */
    private static function semRepetir(array $lista, string $rotulo): void
    {
        $ids = array_column($lista, 'id');
        if (count($ids) !== count(array_unique($ids))) throw new Erro("Há dois itens com o mesmo identificador em $rotulo. Atualize a página.", 422);
    }

    /**
      Apaga o que saiu da lista e grava (insere ou atualiza) o resto, na ordem recebida.
      As colunas de $manter só valem para linhas novas: numa linha que já existe, o valor do banco fica (ex.: usos do cupom).
    */
    private static function gravarTabela(string $tabela, array $linhas, array $manter = []): void
    {
        $agora = Tempo::agoraMs();
        $velhas = array_column(Db::todos("SELECT * FROM $tabela WHERE arquivado_em IS NULL"), null, 'id');
        $ids = array_column($linhas, 'id');
        // o que saiu da lista vai para Excluídos (arquivado), de onde pode voltar; nada é apagado de verdade (BD-04)
        foreach (array_keys($velhas) as $id) {
            if (!in_array((string) $id, $ids, true)) Db::q("UPDATE $tabela SET arquivado_em = ?, versao = versao + 1 WHERE id = ?", [$agora, $id]);
        }
        $igual = static function (mixed $a, mixed $b): bool {
            if (is_numeric($a) && is_numeric($b)) return (float) $a === (float) $b;
            return (string) ($a ?? '') === (string) ($b ?? '');
        };
        foreach ($linhas as $l) {
            $v = $velhas[$l['id']] ?? null;
            // a versão só sobe quando o conteúdo muda (ordem e data de atualização não contam)
            $mudou = !$v;
            if ($v) foreach ($l as $c => $x) {
                if (in_array($c, ['id', 'ordem', 'atualizado_em'], true) || in_array($c, $manter, true)) continue;
                if (!$igual($x, $v[$c] ?? null)) { $mudou = true; break; }
            }
            if ($v && !$mudou && array_key_exists('atualizado_em', $l)) $l['atualizado_em'] = (int) $v['atualizado_em'];
            $l['versao'] = $v ? (int) $v['versao'] + ($mudou ? 1 : 0) : 1;
            $l['arquivado_em'] = null;
            $cols = array_keys($l);
            $sets = implode(', ', array_map(static fn ($c) => "$c = VALUES($c)", array_filter($cols, static fn ($c) => $c !== 'id' && !in_array($c, $manter, true))));
            Db::q("INSERT INTO $tabela (" . implode(', ', $cols) . ') VALUES (' . Db::marcas($cols) . ") ON DUPLICATE KEY UPDATE $sets", array_values($l));
        }
    }

    /**
      Junta o que o painel mandou (só os itens que mudaram, com a versão que a pessoa via) com o que está no banco.
      Item alterado por outra pessoa no meio do caminho: recusa (409) e devolve a lista atual, sem perder o trabalho dela.
      Itens criados por outra pessoa e que este painel ainda não conhecia ficam (vão para o fim da ordem).
    */
    private static function mesclar(string $nome, mixed $m): array
    {
        [$tabela, $campo, $saida] = self::LISTAS[$nome];
        $m = V::objeto($m, 'as mudanças');
        Db::todos("SELECT id FROM $tabela FOR UPDATE"); // segura a tabela até gravar: duas pessoas salvando ao mesmo tempo esperam a vez
        $porId = array_column(self::$saida(), null, 'id');
        $nomeDe = static fn (array $x): string => (string) ($x[$campo] ?? 'um item');
        $conflito = static function (string $msg) use ($saida, $nome): never {
            throw new Erro($msg, 409, null, ['dados' => self::$saida(), 'colecao' => $nome]);
        };
        foreach (V::lista($m['alterados'] ?? [], 'as mudanças', 400) as $it) {
            $it = V::objeto($it, 'um item');
            $id = V::id($it['id'] ?? null, 'um item');
            if (isset($porId[$id])) {
                if ((int) ($it['versao'] ?? -1) !== (int) $porId[$id]['versao']) {
                    $conflito('Outra pessoa alterou "' . $nomeDe($porId[$id]) . '" enquanto você editava. A lista foi atualizada: confira e refaça a sua mudança.');
                }
            } elseif (isset($it['versao'])) {
                $conflito('"' . $nomeDe($it) . '" foi excluído por outra pessoa enquanto você editava. A lista foi atualizada.');
            }
            $porId[$id] = $it;
        }
        foreach (V::lista($m['removidos'] ?? [], 'as exclusões', 400) as $x) {
            $x = V::objeto($x, 'uma exclusão');
            $id = V::id($x['id'] ?? null, 'um item');
            if (!isset($porId[$id])) continue; // outra pessoa já tinha excluído
            if ((int) ($x['versao'] ?? -1) !== (int) $porId[$id]['versao']) {
                $conflito('Outra pessoa alterou "' . $nomeDe($porId[$id]) . '" enquanto você excluía. A lista foi atualizada.');
            }
            unset($porId[$id]);
        }
        $lista = [];
        foreach (V::lista($m['ordem'] ?? [], 'a ordem', 1000) as $id) {
            if (is_string($id) && isset($porId[$id])) { $lista[] = $porId[$id]; unset($porId[$id]); }
        }
        foreach ($porId as $it) $lista[] = $it;
        return $lista;
    }

    /* ================================================================== Excluídos (arquivados) */

    public static function excluidos(string $nome, array $u): array
    {
        if (!isset(self::LISTAS[$nome])) throw new Erro('Coleção desconhecida.', 404);
        Usuarios::exigir(self::COLECOES[$nome]);
        [$tabela, $campo] = self::LISTAS[$nome];
        return array_map(static fn ($r) => ['id' => $r['id'], 'nome' => $r[$campo], 'em' => (int) $r['arquivado_em']],
            Db::todos("SELECT id, $campo, arquivado_em FROM $tabela WHERE arquivado_em IS NOT NULL ORDER BY arquivado_em DESC LIMIT 100"));
    }

    /** Traz de volta um item excluído (vai para o fim da lista). Devolve a coleção atualizada. */
    public static function restaurar(string $nome, mixed $id, array $u): array
    {
        if (!isset(self::LISTAS[$nome])) throw new Erro('Coleção desconhecida.', 404);
        Usuarios::exigir(self::COLECOES[$nome]);
        [$tabela, $campo, $saida] = self::LISTAS[$nome];
        $id = V::id($id, 'o item');
        Db::tx(static function () use ($tabela, $id, $nome, $u): void {
            $r = Db::um("SELECT * FROM $tabela WHERE id = ? AND arquivado_em IS NOT NULL FOR UPDATE", [$id]);
            if (!$r) throw new Erro('Esse item não está mais em Excluídos. Atualize a página.', 409);
            if ($nome === 'cupons' && Db::valor('SELECT COUNT(*) FROM cupons WHERE codigo = ? AND arquivado_em IS NULL', [$r['codigo']])) {
                throw new Erro('Já existe um cupom ' . $r['codigo'] . ' ativo. Mude o código dele antes de restaurar este.', 422);
            }
            $ordem = (int) Db::valor("SELECT COALESCE(MAX(ordem), 0) + 1 FROM $tabela WHERE arquivado_em IS NULL");
            Db::q("UPDATE $tabela SET arquivado_em = NULL, versao = versao + 1, ordem = ? WHERE id = ?", [$ordem, $id]);
            Auditoria::registrar($u['id'], 'restaurar.' . $nome, $nome, $id);
        });
        Cardapio::esquecer();
        return self::$saida();
    }

    /* ================================================================== gravar uma coleção */

    /** $extra: o resto do corpo enviado (a coleção de usuários pede a senha de quem altera em senhaAtual). */
    public static function salvarColecao(string $nome, mixed $dados, array $u, array $extra = []): mixed
    {
        if (!array_key_exists($nome, self::COLECOES)) throw new Erro('Coleção desconhecida.', 404);
        $perm = self::COLECOES[$nome];
        if ($perm !== null) Usuarios::exigir($perm);
        if (isset(self::LISTAS[$nome])) {
            // listas: só o que mudou, com versão (o painel antigo mandava a lista inteira e apagava o que outra pessoa tinha criado)
            if (!isset($extra['mudancas'])) throw new Erro('O painel foi atualizado. Recarregue a página para continuar.', 409, null, ['recarregar' => true]);
            return Db::tx(static function () use ($nome, $extra, $u): array {
                $dados = self::mesclar($nome, $extra['mudancas']);
                $r = match ($nome) {
                    'categorias' => self::salvarCategorias($dados),
                    'produtos' => self::salvarProdutos($dados),
                    'grupos' => self::salvarGrupos($dados),
                    'cupons' => self::salvarCupons($dados),
                    'areas' => self::salvarAreas($dados),
                    'banners' => self::salvarBanners($dados),
                };
                Auditoria::registrar($u['id'], 'salvar.' . $nome, $nome);
                Cardapio::esquecer();
                Config::esquecer();
                return $r;
            });
        }
        $r = match ($nome) {
            'categorias' => self::salvarCategorias($dados),
            'produtos' => self::salvarProdutos($dados),
            'grupos' => self::salvarGrupos($dados),
            'cupons' => self::salvarCupons($dados),
            'areas' => self::salvarAreas($dados),
            'banners' => self::salvarBanners($dados),
            'config' => self::salvarConfig($dados, $u),
            'logo' => self::salvarLogo($dados),
            'operacao' => self::salvarOperacao($dados, $u),
            'usuarios' => Usuarios::salvarLista($dados, $u, $extra['senhaAtual'] ?? null),
            'notificacoes' => self::salvarNotificacoes($dados, $u),
        };
        if ($nome !== 'notificacoes') Auditoria::registrar($u['id'], 'salvar.' . $nome, $nome);
        Cardapio::esquecer();
        Config::esquecer();
        return $r;
    }

    /* ------------------------------------------------------------------ categorias */

    public static function categoriasSaida(): array
    {
        return array_map(fn ($c) => ['id' => $c['id'], 'nome' => $c['nome'], 'descricao' => $c['descricao'], 'icone' => $c['icone'],
            'imagem' => self::urlImagem($c['imagem']), 'ativa' => $c['ativa'], 'especial' => $c['especial'], 'versao' => $c['versao']], Cardapio::categorias());
    }

    public static function salvarCategorias(mixed $dados): array
    {
        $lista = V::lista($dados, 'as categorias', 60);
        $velhas = Cardapio::porId(Cardapio::categorias());
        $linhas = [];
        $trocadas = [];
        foreach ($lista as $i => $c) {
            $c = V::objeto($c, 'uma categoria');
            $id = V::id($c['id'] ?? null, 'a categoria');
            $foto = '';
            $img = self::imagemEntrada($c['imagem'] ?? '', $foto);
            if (isset($velhas[$id]) && $velhas[$id]['imagem'] !== $img) $trocadas[] = $velhas[$id]['imagem'];
            $icone = is_string($c['icone'] ?? null) && preg_match('/^[a-z-]{1,20}$/', $c['icone']) ? $c['icone'] : 'layers';
            $linhas[] = [
                'id' => $id, 'nome' => V::texto($c['nome'] ?? '', 'o nome da categoria', 2, 60), 'descricao' => V::texto($c['descricao'] ?? '', 'a descrição da categoria', 0, 200),
                'icone' => $icone, 'imagem' => $img, 'ativa' => V::bool($c['ativa'] ?? true) ? 1 : 0,
                'especial' => ($velhas[$id]['especial'] ?? false) ? 1 : 0, 'ordem' => $i,
            ];
        }
        self::semRepetir($linhas, 'categorias');
        foreach ($velhas as $id => $v) if (!in_array($id, array_column($linhas, 'id'), true)) $trocadas[] = $v['imagem'];
        Db::tx(static fn () => self::gravarTabela('categorias', $linhas));
        self::limparImagens($trocadas);
        Cardapio::esquecer();
        return self::categoriasSaida();
    }

    /* ------------------------------------------------------------------ produtos */

    public static function produtosSaida(): array
    {
        return array_map(static function ($p) {
            $so500 = $p['foto'] !== '' && !is_file(RAIZ . '/assets/img/photo-' . $p['foto'] . '-960.webp');
            return ['id' => $p['id'], 'nome' => $p['nome'], 'categoria' => $p['categoria'], 'preco' => Tempo::reais($p['preco']), 'promo' => Tempo::reais($p['promo']),
                'descricao' => $p['descricao'], 'ingredientes' => $p['ingredientes'], 'grupos' => $p['grupos'], 'preparo' => $p['preparo'], 'codigo' => $p['codigo'],
                'ativo' => $p['ativo'], 'destaque' => $p['destaque'], 'esgotado' => $p['esgotado'], 'foto' => $p['foto'], 'so500' => $so500,
                'imagem' => $p['imagem'] === '' ? '' : '/' . Imagem::url($p['imagem'], 960), 'alt' => $p['alt'], 'selo' => $p['selo'], 'versao' => $p['versao']];
        }, Cardapio::produtos());
    }

    public static function salvarProdutos(mixed $dados): array
    {
        $lista = V::lista($dados, 'os produtos', 300);
        $velhos = Cardapio::porId(Cardapio::produtos());
        $gruposIds = array_column(Cardapio::grupos(), 'id');
        $linhas = [];
        $trocadas = [];
        $agora = Tempo::agoraMs();
        foreach ($lista as $i => $p) {
            $p = V::objeto($p, 'um produto');
            $id = V::id($p['id'] ?? null, 'o produto');
            $nome = V::texto($p['nome'] ?? '', 'o nome do produto', 2, 80);
            $preco = V::centavos($p['preco'] ?? null, "o preço de $nome", 1_000_000);
            if ($preco < 1) throw new Erro("Informe o preço de $nome.", 422);
            $promo = V::centavos($p['promo'] ?? null, "o preço promocional de $nome", 1_000_000, true);
            if ($promo !== null && ($promo <= 0 || $promo >= $preco)) $promo = null;
            $foto = is_string($p['foto'] ?? null) && preg_match('/^f\d{3,12}$/', $p['foto']) ? $p['foto'] : '';
            $img = self::imagemEntrada($p['imagem'] ?? '', $foto);
            $velho = $velhos[$id] ?? null;
            if ($velho && $velho['imagem'] !== $img) $trocadas[] = $velho['imagem'];
            $ingr = array_map(static fn ($x) => V::texto($x, 'um ingrediente', 1, 60), V::lista($p['ingredientes'] ?? [], 'os ingredientes', 30));
            $grupos = array_values(array_unique(array_filter(array_map(static fn ($x) => V::id($x, 'um grupo'), V::lista($p['grupos'] ?? [], 'os grupos', 20)),
                static fn ($g) => in_array($g, $gruposIds, true))));
            $alt = V::texto($p['alt'] ?? '', 'o texto da foto', 0, 200);
            if ($velho && ($velho['foto'] !== $foto || $img !== '')) $alt = '';
            $linhas[] = [
                'id' => $id, 'nome' => $nome, 'categoria_id' => V::id($p['categoria'] ?? null, "a categoria de $nome"), 'preco' => $preco, 'promo' => $promo,
                'descricao' => V::texto($p['descricao'] ?? '', "a descrição de $nome", 0, 400), 'ingredientes' => self::json(array_values(array_filter($ingr))),
                'grupos' => self::json($grupos), 'preparo' => V::inteiro($p['preparo'] ?? 12, "o tempo de preparo de $nome", 0, 240),
                'codigo' => V::texto($p['codigo'] ?? '', "o código de $nome", 0, 20), 'ativo' => V::bool($p['ativo'] ?? true) ? 1 : 0,
                'destaque' => V::bool($p['destaque'] ?? false) ? 1 : 0, 'esgotado' => V::bool($p['esgotado'] ?? false) ? 1 : 0,
                'foto' => $foto, 'imagem' => $img, 'alt' => $alt, 'selo' => V::texto($p['selo'] ?? '', "o selo de $nome", 0, 30), 'ordem' => $i, 'atualizado_em' => $agora,
            ];
        }
        self::semRepetir($linhas, 'produtos');
        foreach ($velhos as $id => $v) if (!in_array($id, array_column($linhas, 'id'), true)) $trocadas[] = $v['imagem'];
        Db::tx(static fn () => self::gravarTabela('produtos', $linhas));
        self::limparImagens($trocadas);
        Cardapio::esquecer();
        return self::produtosSaida();
    }

    /* ------------------------------------------------------------------ grupos de adicionais */

    public static function gruposSaida(): array
    {
        $donos = [];
        foreach (Cardapio::produtos() as $p) foreach ($p['grupos'] as $g) $donos[$g][] = $p['id'];
        return array_map(static fn ($g) => ['id' => $g['id'], 'nome' => $g['nome'], 'obrigatorio' => $g['obrigatorio'], 'tipo' => $g['tipo'], 'min' => $g['min'],
            'max' => $g['max'], 'ativo' => $g['ativo'], 'opcoes' => array_map(static fn ($o) => ['id' => $o['id'], 'nome' => $o['nome'], 'preco' => Tempo::reais($o['preco'])], $g['opcoes']),
            'produtos' => $donos[$g['id']] ?? [], 'versao' => $g['versao']], Cardapio::grupos());
    }

    public static function salvarGrupos(mixed $dados): array
    {
        $lista = V::lista($dados, 'os grupos de adicionais', 100);
        $linhas = [];
        $vinculos = [];
        foreach ($lista as $i => $g) {
            $g = V::objeto($g, 'um grupo');
            $id = V::id($g['id'] ?? null, 'o grupo');
            $nome = V::texto($g['nome'] ?? '', 'o nome do grupo', 2, 60);
            $ops = [];
            $vistos = [];
            foreach (V::lista($g['opcoes'] ?? [], "as opções de $nome", 40) as $o) {
                $o = V::objeto($o, "uma opção de $nome");
                $on = V::texto($o['nome'] ?? '', "o nome de uma opção de $nome", 1, 60);
                $k = Cardapio::slug($on);
                if (isset($vistos[$k])) throw new Erro("Há duas opções chamadas \"$on\" em $nome.", 422);
                $vistos[$k] = true;
                $ops[] = ['nome' => $on, 'preco' => V::centavos($o['preco'] ?? 0, "o preço de $on", 100_000)];
            }
            if (!$ops) throw new Erro("Cadastre pelo menos uma opção em $nome.", 422);
            $tipo = V::opcao($g['tipo'] ?? 'multiplo', ['unico', 'multiplo'], "o tipo de $nome");
            $obrig = V::bool($g['obrigatorio'] ?? false);
            $max = $tipo === 'unico' ? 1 : max(1, min(V::inteiro($g['max'] ?? 1, "o máximo de $nome", 1, 40), count($ops)));
            $min = $obrig ? max(1, min(V::inteiro($g['min'] ?? 1, "o mínimo de $nome", 0, 40), $max)) : 0;
            $linhas[] = ['id' => $id, 'nome' => $nome, 'obrigatorio' => $obrig ? 1 : 0, 'tipo' => $tipo, 'min_escolhas' => $min, 'max_escolhas' => $max,
                'ativo' => V::bool($g['ativo'] ?? true) ? 1 : 0, 'opcoes' => self::json($ops), 'ordem' => $i];
            $vinculos[$id] = array_map(static fn ($x) => V::id($x, 'um produto'), V::lista($g['produtos'] ?? [], "os produtos de $nome", 300));
        }
        self::semRepetir($linhas, 'grupos');
        Db::tx(static function () use ($linhas, $vinculos): void {
            self::gravarTabela('grupos', $linhas);
            // a lista de grupos de cada produto segue o que o painel marcou nos grupos (mantém a ordem que já existia)
            foreach (Db::todos('SELECT id, grupos FROM produtos WHERE arquivado_em IS NULL FOR UPDATE') as $p) {
                $atual = json_decode((string) $p['grupos'], true) ?: [];
                $novo = [];
                foreach ($atual as $gid) if (isset($vinculos[$gid]) && in_array($p['id'], $vinculos[$gid], true)) $novo[] = $gid;
                foreach ($vinculos as $gid => $prods) if (in_array($p['id'], $prods, true) && !in_array($gid, $novo, true)) $novo[] = $gid;
                if ($novo !== $atual) Db::q('UPDATE produtos SET grupos = ?, versao = versao + 1 WHERE id = ?', [self::json($novo), $p['id']]);
            }
        });
        Cardapio::esquecer();
        return self::gruposSaida();
    }

    /* ------------------------------------------------------------------ cupons */

    public static function cuponsSaida(): array
    {
        return array_map(static fn ($c) => ['id' => $c['id'], 'codigo' => $c['codigo'], 'tipo' => $c['tipo'],
            'valor' => $c['tipo'] === 'fixo' ? Tempo::reais($c['valor']) : $c['valor'], 'minimo' => Tempo::reais($c['minimo']), 'usos' => $c['usos'],
            'limite' => $c['limite'], 'porCliente' => $c['porCliente'], 'inicio' => $c['inicio'], 'validade' => $c['validade'],
            'habilitado' => $c['habilitado'], 'descricao' => $c['descricao'], 'versao' => $c['versao']], Cupons::todos());
    }

    public static function salvarCupons(mixed $dados): array
    {
        $lista = V::lista($dados, 'os cupons', 200);
        $linhas = [];
        $codigos = [];
        foreach ($lista as $i => $c) {
            $c = V::objeto($c, 'um cupom');
            $id = V::id($c['id'] ?? null, 'o cupom');
            $codigo = Cupons::normalizarCodigo($c['codigo'] ?? '');
            if (strlen($codigo) < 3 || strlen($codigo) > 30) throw new Erro('O código do cupom precisa ter de 3 a 30 letras ou números.', 422);
            if (isset($codigos[$codigo])) throw new Erro("Já existe um cupom com o código $codigo.", 422);
            $codigos[$codigo] = true;
            $tipo = V::opcao($c['tipo'] ?? '', Cupons::TIPOS, "o tipo do cupom $codigo");
            $valor = match ($tipo) {
                'percentual' => V::inteiro($c['valor'] ?? null, "o percentual de $codigo", 1, 100),
                'fixo' => V::centavos($c['valor'] ?? null, "o valor de $codigo", 100_000),
                default => 0,
            };
            if ($tipo === 'fixo' && $valor < 1) throw new Erro("Informe o valor do cupom $codigo.", 422);
            $limite = ($c['limite'] ?? null) === null || ($c['limite'] ?? '') === '' ? null : V::inteiro($c['limite'], "o limite de usos de $codigo", 1, 1_000_000);
            $inicio = self::data($c['inicio'] ?? '', "o início de $codigo");
            $validade = self::data($c['validade'] ?? '', "a validade de $codigo");
            if ($inicio !== '' && $validade !== '' && $validade < $inicio) throw new Erro("A validade de $codigo precisa ser depois do início.", 422);
            $linhas[] = [
                'id' => $id, 'codigo' => $codigo, 'tipo' => $tipo, 'valor' => $valor, 'minimo' => V::centavos($c['minimo'] ?? 0, "o pedido mínimo de $codigo", 10_000_000),
                // usos: só os pedidos mudam; o painel nunca regrava o contador (vale 0 apenas para cupom novo)
                'usos' => 0, 'limite' => $limite, 'por_cliente' => V::inteiro($c['porCliente'] ?? 1, "o uso por cliente de $codigo", 0, 1000),
                'inicio' => $inicio, 'validade' => $validade, 'habilitado' => V::bool($c['habilitado'] ?? true) ? 1 : 0,
                'descricao' => V::texto($c['descricao'] ?? '', "a descrição de $codigo", 0, 200), 'ordem' => $i,
            ];
        }
        self::semRepetir($linhas, 'cupons');
        // o código é único entre os cupons não excluídos (conferido acima, na lista inteira)
        Db::tx(static fn () => self::gravarTabela('cupons', $linhas, ['usos']));
        return self::cuponsSaida();
    }

    /* ------------------------------------------------------------------ áreas de entrega */

    public static function areasSaida(): array
    {
        return array_map(static fn ($a) => ['id' => $a['id'], 'nome' => $a['nome'], 'taxa' => Tempo::reais($a['taxa']), 'tempoExtra' => $a['tempoExtra'],
            'minimo' => Tempo::reais($a['minimo']), 'ativa' => $a['ativa'], 'cobertura' => $a['cobertura'], 'cepIni' => $a['cepIni'], 'cepFim' => $a['cepFim'],
            'raio' => $a['raio'], 'versao' => $a['versao']], Cardapio::areas());
    }

    public static function salvarAreas(mixed $dados): array
    {
        $lista = V::lista($dados, 'as áreas de entrega', 100);
        $linhas = [];
        $cep = static function (mixed $v, string $rotulo): string {
            if ($v === '' || $v === null) return '';
            if (!is_string($v) || !preg_match('/^\d{5}-?\d{3}$/', $v)) throw new Erro("Use o formato 00000-000 em $rotulo.", 422);
            return substr(str_replace('-', '', $v), 0, 5) . '-' . substr(str_replace('-', '', $v), 5);
        };
        foreach ($lista as $i => $a) {
            $a = V::objeto($a, 'uma área');
            $nome = V::texto($a['nome'] ?? '', 'o nome do bairro', 2, 60);
            $raio = is_numeric($a['raio'] ?? 0) ? round((float) ($a['raio'] ?? 0), 1) : 0.0;
            $linhas[] = [
                'id' => V::id($a['id'] ?? null, 'a área'), 'nome' => $nome, 'taxa' => V::centavos($a['taxa'] ?? 0, "a taxa de $nome", 100_000),
                'tempo_extra' => V::inteiro($a['tempoExtra'] ?? 0, "o tempo extra de $nome", 0, 180), 'minimo' => V::centavos($a['minimo'] ?? 0, "o pedido mínimo de $nome", 10_000_000),
                'ativa' => V::bool($a['ativa'] ?? true) ? 1 : 0, 'cobertura' => V::opcao($a['cobertura'] ?? 'raio', ['cep', 'raio'], "a cobertura de $nome"),
                'cep_ini' => $cep($a['cepIni'] ?? '', "o CEP inicial de $nome"), 'cep_fim' => $cep($a['cepFim'] ?? '', "o CEP final de $nome"),
                'raio' => max(0, min(99, $raio)), 'ordem' => $i,
            ];
        }
        self::semRepetir($linhas, 'áreas');
        Db::tx(static fn () => self::gravarTabela('areas', $linhas));
        Cardapio::esquecer();
        return self::areasSaida();
    }

    /* ------------------------------------------------------------------ banners */

    public static function bannersSaida(): array
    {
        return array_map(static fn ($b) => ['id' => $b['id'], 'titulo' => $b['titulo'], 'texto' => $b['texto'], 'foto' => $b['foto'],
            'imagem' => $b['imagem'] === '' ? '' : '/' . Imagem::url($b['imagem'], 960), 'destino' => $b['destino'], 'inicio' => $b['inicio'], 'fim' => $b['fim'],
            'status' => $b['status'], 'ordem' => (int) $b['ordem'], 'desktop' => (bool) $b['desktop'], 'mobile' => (bool) $b['mobile'], 'versao' => (int) $b['versao']],
            Db::todos('SELECT * FROM banners WHERE arquivado_em IS NULL ORDER BY ordem, titulo'));
    }

    public static function salvarBanners(mixed $dados): array
    {
        $lista = V::lista($dados, 'os banners', 50);
        $velhos = array_column(Db::todos('SELECT id, imagem FROM banners WHERE arquivado_em IS NULL'), 'imagem', 'id');
        $linhas = [];
        $trocadas = [];
        foreach ($lista as $i => $b) {
            $b = V::objeto($b, 'um banner');
            $id = V::id($b['id'] ?? null, 'o banner');
            $titulo = V::texto($b['titulo'] ?? '', 'o título do banner', 2, 80);
            $foto = is_string($b['foto'] ?? null) && preg_match('/^f\d{3,12}$/', $b['foto']) ? $b['foto'] : '';
            $img = self::imagemEntrada($b['imagem'] ?? '', $foto);
            if (isset($velhos[$id]) && $velhos[$id] !== $img) $trocadas[] = $velhos[$id];
            $inicio = self::data($b['inicio'] ?? '', "o início de $titulo");
            $fim = self::data($b['fim'] ?? '', "o fim de $titulo");
            if ($inicio !== '' && $fim !== '' && $fim < $inicio) throw new Erro("O fim de $titulo precisa ser depois do início.", 422);
            $destino = V::texto($b['destino'] ?? '', "o destino de $titulo", 0, 100);
            if ($destino !== '' && !preg_match('/^(categoria|produto|cupom):[A-Za-z0-9_-]{1,60}$/', $destino)) throw new Erro("Destino inválido em $titulo.", 422);
            $linhas[] = ['id' => $id, 'titulo' => $titulo, 'texto' => V::texto($b['texto'] ?? '', "o texto de $titulo", 0, 200), 'foto' => $foto, 'imagem' => $img,
                'destino' => $destino, 'inicio' => $inicio, 'fim' => $fim, 'status' => V::opcao($b['status'] ?? 'ativo', ['ativo', 'agendado', 'encerrado'], "o status de $titulo"),
                'ordem' => $i, 'desktop' => V::bool($b['desktop'] ?? true) ? 1 : 0, 'mobile' => V::bool($b['mobile'] ?? true) ? 1 : 0];
        }
        self::semRepetir($linhas, 'banners');
        foreach ($velhos as $id => $img) if (!in_array($id, array_column($linhas, 'id'), true)) $trocadas[] = $img;
        Db::tx(static fn () => self::gravarTabela('banners', $linhas));
        self::limparImagens($trocadas);
        return self::bannersSaida();
    }

    /* ------------------------------------------------------------------ configurações */

    /** $completo = false para quem não tem "configuracoes": sai sem os ajustes internos (avisos e chave Pix). */
    public static function configSaida(bool $completo = true): array
    {
        $c = Config::todas();
        $pag = (array) ($c['pagamentos'] ?? []);
        if (!$completo) unset($pag['chavePix']);
        return ['loja' => $c['loja'] ?? [], 'horarios' => $c['horarios'] ?? [], 'excecoes' => $c['excecoes'] ?? [], 'pagamentos' => $pag,
            'entrega' => $c['entrega'] ?? [], 'notif' => $completo ? ($c['notif'] ?? []) : [],
            'privacidade' => self::privacidade(), 'seguranca' => ['exigir2fa' => !empty(((array) ($c['seguranca'] ?? []))['exigir2fa'])]];
    }

    /** Encarregado de dados (LGPD) e prazo de guarda dos pedidos. */
    public static function privacidade(): array
    {
        $p = (array) Config::obter('privacidade', []);
        return ['encarregadoNome' => (string) ($p['encarregadoNome'] ?? ''), 'encarregadoEmail' => (string) ($p['encarregadoEmail'] ?? ''),
            'encarregadoTelefone' => (string) ($p['encarregadoTelefone'] ?? ''), 'prazoMeses' => (int) ($p['prazoMeses'] ?? 24)];
    }

    public static function salvarConfig(mixed $dados, ?array $u = null): array
    {
        $d = V::objeto($dados, 'as configurações');
        $l = is_array($d['loja'] ?? null) ? $d['loja'] : [];
        $digitos = static fn ($v) => preg_replace('/\D/', '', is_string($v) ? $v : '') ?? '';
        $cnpj = $digitos($l['cnpj'] ?? '');
        if ($cnpj !== '' && strlen($cnpj) !== 14) throw new Erro('O CNPJ tem 14 números.', 422);
        $tel = $digitos($l['telefone'] ?? '');
        if ($tel !== '' && (strlen($tel) < 10 || strlen($tel) > 11)) throw new Erro('Escreva o telefone com DDD.', 422);
        $loja = [
            'nome' => V::texto($l['nome'] ?? '', 'o nome da loja', 2, 80), 'razao' => V::texto($l['razao'] ?? '', 'a razão social', 0, 120),
            'cnpj' => $cnpj === '' ? '' : vsprintf('%s.%s.%s/%s-%s', [substr($cnpj, 0, 2), substr($cnpj, 2, 3), substr($cnpj, 5, 3), substr($cnpj, 8, 4), substr($cnpj, 12)]),
            'telefone' => $tel === '' ? '' : Pedidos::foneExibicao($tel), 'whatsapp' => Pedidos::foneExibicao(V::telefone($l['whatsapp'] ?? '', 'o WhatsApp da loja', null)),
            'email' => ($l['email'] ?? '') === '' ? '' : V::email($l['email']), 'cep' => V::texto($l['cep'] ?? '', 'o CEP', 0, 9),
            'rua' => V::texto($l['rua'] ?? '', 'a rua', 2, 120), 'numero' => V::texto($l['numero'] ?? '', 'o número', 1, 12), 'bairro' => V::texto($l['bairro'] ?? '', 'o bairro', 2, 60),
            'cidade' => V::texto($l['cidade'] ?? '', 'a cidade', 2, 60), 'uf' => V::opcao($l['uf'] ?? 'SP', explode(' ', 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'), 'o estado'),
            // textos de marca do site (vazio = o texto padrão do modelo)
            'slogan1' => V::texto($l['slogan1'] ?? '', 'a primeira linha da frase do topo', 0, 40), 'slogan2' => V::texto($l['slogan2'] ?? '', 'a segunda linha da frase do topo', 0, 40),
            'apoio' => V::texto($l['apoio'] ?? '', 'o texto de apoio do topo', 0, 160), 'descricao' => V::texto($l['descricao'] ?? '', 'a descrição curta', 0, 120),
            'botao' => V::texto($l['botao'] ?? '', 'o texto do botão do topo', 0, 30),
        ];
        $hs = V::lista($d['horarios'] ?? null, 'os horários', 7);
        if (count($hs) !== 7) throw new Erro('Informe os horários dos 7 dias da semana.', 422);
        $horarios = [];
        foreach ($hs as $i => $h) {
            $h = V::objeto($h, 'um horário');
            $horarios[] = ['dia' => self::DIAS[$i], 'aberto' => V::bool($h['aberto'] ?? false), 'abre' => V::hora($h['abre'] ?? '18:00', 'a abertura de ' . self::DIAS[$i]),
                'fecha' => V::hora($h['fecha'] ?? '23:30', 'o fechamento de ' . self::DIAS[$i])];
        }
        $excecoes = [];
        foreach (V::lista($d['excecoes'] ?? [], 'as exceções', 80) as $x) {
            $x = V::objeto($x, 'uma exceção');
            $tipo = V::opcao($x['tipo'] ?? 'fechado', ['fechado', 'especial'], 'o tipo da exceção');
            $excecoes[] = ['id' => V::id($x['id'] ?? null, 'a exceção'), 'data' => V::data($x['data'] ?? null, 'a data da exceção'),
                'descricao' => V::texto($x['descricao'] ?? '', 'a descrição da exceção', 1, 60), 'tipo' => $tipo,
                'abre' => $tipo === 'especial' ? V::hora($x['abre'] ?? '', 'a abertura da exceção') : '', 'fecha' => $tipo === 'especial' ? V::hora($x['fecha'] ?? '', 'o fechamento da exceção') : ''];
        }
        usort($excecoes, static fn ($a, $b) => strcmp($a['data'], $b['data']));
        $p = is_array($d['pagamentos'] ?? null) ? $d['pagamentos'] : [];
        $pag = ['pix' => V::bool($p['pix'] ?? false), 'chavePix' => V::texto($p['chavePix'] ?? '', 'a chave Pix', 0, 80), 'credito' => V::bool($p['credito'] ?? false),
            'debito' => V::bool($p['debito'] ?? false), 'bandeiras' => array_map(static fn ($b) => V::texto($b, 'uma bandeira', 1, 30), V::lista($p['bandeiras'] ?? [], 'as bandeiras', 20)),
            'dinheiro' => V::bool($p['dinheiro'] ?? false), 'troco' => V::bool($p['troco'] ?? false), 'naEntrega' => true, 'online' => false];
        if (!$pag['pix'] && !$pag['credito'] && !$pag['debito'] && !$pag['dinheiro']) throw new Erro('Deixe pelo menos uma forma de pagamento ligada.', 422);
        $e = is_array($d['entrega'] ?? null) ? $d['entrega'] : [];
        $entrega = ['entrega' => V::bool($e['entrega'] ?? true), 'retirada' => V::bool($e['retirada'] ?? true), 'prazoEntrega' => V::texto($e['prazoEntrega'] ?? '', 'o prazo de entrega', 0, 30),
            'prazoRetirada' => V::texto($e['prazoRetirada'] ?? '', 'o prazo de retirada', 0, 30), 'orientacoes' => V::texto($e['orientacoes'] ?? '', 'as orientações de retirada', 0, 300)];
        if (!$entrega['entrega'] && !$entrega['retirada']) throw new Erro('Deixe a entrega ou a retirada ligada.', 422);
        $n = is_array($d['notif'] ?? null) ? $d['notif'] : [];
        $notif = ['som' => V::bool($n['som'] ?? true), 'visual' => V::bool($n['visual'] ?? true), 'whatsapp' => V::bool($n['whatsapp'] ?? false),
            'whatsappNumero' => V::texto($n['whatsappNumero'] ?? '', 'o WhatsApp de avisos', 0, 20), 'email' => V::bool($n['email'] ?? false),
            'emailEndereco' => V::texto($n['emailEndereco'] ?? '', 'o e-mail de avisos', 0, 120), 'resumo' => V::bool($n['resumo'] ?? false)];
        $grava = ['loja' => $loja, 'horarios' => $horarios, 'excecoes' => $excecoes, 'pagamentos' => $pag, 'entrega' => $entrega, 'notif' => $notif];
        if (is_array($d['privacidade'] ?? null)) {
            $pv = $d['privacidade'];
            $email = (string) ($pv['encarregadoEmail'] ?? '');
            $grava['privacidade'] = [
                'encarregadoNome' => V::texto($pv['encarregadoNome'] ?? '', 'o nome do encarregado', 0, 80),
                'encarregadoEmail' => $email === '' ? '' : V::email($email, 'o e-mail do encarregado'),
                'encarregadoTelefone' => V::texto($pv['encarregadoTelefone'] ?? '', 'o telefone do encarregado', 0, 20),
                'prazoMeses' => V::inteiro($pv['prazoMeses'] ?? 24, 'o prazo de guarda (meses)', 6, 120),
            ];
        }
        if (is_array($d['seguranca'] ?? null)) {
            $exigir = V::bool($d['seguranca']['exigir2fa'] ?? false);
            $antes = !empty(((array) Config::obter('seguranca', []))['exigir2fa']);
            if ($exigir !== $antes) {
                if (!$u || $u['id'] !== Usuarios::proprietarioId()) throw new Erro('Só o proprietário da loja muda a regra das duas etapas.', 403);
                if ($exigir && !$u['doisFatores']) throw new Erro('Ative primeiro a verificação em duas etapas no seu perfil (menu com o seu nome › Meu perfil).', 422);
                Auditoria::registrar($u['id'], $exigir ? 'seguranca.exigir2fa' : 'seguranca.liberar2fa', 'config');
            }
            $grava['seguranca'] = ['exigir2fa' => $exigir];
        }
        Db::tx(static function () use ($grava): void {
            foreach ($grava as $k => $v) Config::gravar($k, $v);
        });
        Config::esquecer();
        return self::configSaida();
    }

    /* ------------------------------------------------------------------ logo da loja */

    /** Recebe a logo nova (imagem enviada), mantém a atual (endereço /uploads/…) ou remove (vazio). */
    public static function salvarLogo(mixed $dados): string
    {
        $antiga = (string) Config::obter('logo', '');
        $foto = '';
        // a logo oficial padrão (marca/) não é um envio: manter ela é o mesmo que não ter logo enviada
        if ($dados === Cardapio::LOGO_PADRAO) $dados = '';
        $nova = self::imagemEntrada($dados, $foto); // fotos do banco do projeto não servem de logo: viram vazio
        if ($nova !== $antiga) {
            Config::gravar('logo', $nova);
            self::limparImagens([$antiga]);
        }
        return Cardapio::logo();
    }

    /* ------------------------------------------------------------------ operação (loja aberta, pausa, prazos) */

    public static function operacaoSaida(array $op): array
    {
        $sit = Horarios::situacao();
        $hoje = Horarios::janela(Tempo::hojeIso()); // horário de hoje, para a visão geral (null = fechado hoje)
        $hm = static fn (int $min): string => sprintf('%02d:%02d', intdiv($min, 60) % 24, $min % 60);
        return ['aberta' => (bool) $op['aberta'], 'pausada' => (bool) $op['pausada'], 'motivo' => (string) $op['motivo'], 'pausaAte' => $op['pausaAte'] ? (int) $op['pausaAte'] : null,
            'tempoMin' => (int) $op['tempoMin'], 'tempoMax' => (int) $op['tempoMax'], 'pedidoMinimo' => Tempo::reais((int) $op['pedidoMinimo']),
            'fecha' => $sit['fecha'] ?? (string) $op['fecha'], 'tempoPreparo' => (int) $op['tempoPreparo'], 'noHorario' => $sit['noHorario'],
            'hojeAbre' => $hoje ? $hm($hoje[0]) : null, 'hojeFecha' => $hoje ? $hm($hoje[1]) : null,
            // a mesma próxima abertura que o site mostra ("abre amanhã às 18h")
            'abre' => $sit['abre'] ? ['quando' => $sit['abre']['quando'], 'as' => $sit['abre']['as']] : null];
    }

    public static function salvarOperacao(mixed $dados, array $u): array
    {
        $d = V::objeto($dados, 'a operação');
        $op = Config::operacao();
        $pausada = V::bool($d['pausada'] ?? false);
        $ate = $d['pausaAte'] ?? null;
        if ($pausada && $ate !== null && $ate !== '') {
            $ate = V::inteiro($ate, 'o fim da pausa', 0, PHP_INT_MAX);
            if ($ate < Tempo::agoraMs() || $ate > Tempo::agoraMs() + 86_400_000) throw new Erro('Escolha uma pausa de até 24 horas.', 422);
        } else {
            $ate = null;
        }
        $novo = array_merge($op, [
            'aberta' => V::bool($d['aberta'] ?? true), 'pausada' => $pausada, 'motivo' => $pausada ? V::texto($d['motivo'] ?? '', 'o motivo da pausa', 0, 60) : '', 'pausaAte' => $pausada ? $ate : null,
        ]);
        if (Usuarios::pode($u, 'configuracoes')) {
            $min = V::inteiro($d['tempoMin'] ?? $op['tempoMin'], 'o tempo mínimo', 5, 180);
            $max = V::inteiro($d['tempoMax'] ?? $op['tempoMax'], 'o tempo máximo', 5, 240);
            if ($max < $min) throw new Erro('O tempo máximo precisa ser maior que o mínimo.', 422);
            $novo = array_merge($novo, ['tempoMin' => $min, 'tempoMax' => $max, 'tempoPreparo' => V::inteiro($d['tempoPreparo'] ?? $op['tempoPreparo'], 'o tempo de preparo', 1, 120),
                'pedidoMinimo' => V::centavos($d['pedidoMinimo'] ?? 0, 'o pedido mínimo', 10_000_000)]);
        }
        if ($novo['aberta'] !== $op['aberta'] || $novo['pausada'] !== $op['pausada']) {
            Auditoria::registrar($u['id'], $novo['pausada'] ? 'loja.pausar' : ($novo['aberta'] ? 'loja.abrir' : 'loja.fechar'), 'operacao', '', array_filter(['motivo' => $novo['motivo']]));
        }
        Config::gravar('operacao', $novo);
        return self::operacaoSaida($novo);
    }

    /** Grava a operação vinda da semente (valores em reais), sem usuário. */
    public static function operacaoInicial(array $op): void
    {
        Config::gravar('operacao', ['aberta' => true, 'pausada' => false, 'motivo' => '', 'pausaAte' => null, 'tempoMin' => (int) $op['tempoMin'], 'tempoMax' => (int) $op['tempoMax'],
            'pedidoMinimo' => (int) round(((float) $op['pedidoMinimo']) * 100), 'fecha' => (string) $op['fecha'], 'tempoPreparo' => (int) $op['tempoPreparo']]);
    }

    /* ------------------------------------------------------------------ avisos do painel */

    public static function notificacaoSaida(array $n): array
    {
        return ['id' => 'n' . $n['id'], 'icone' => $n['icone'], 'cor' => $n['cor'], 'titulo' => $n['titulo'], 'texto' => $n['texto'], 'em' => (int) $n['em'],
            'lida' => (bool) $n['lida'], 'rota' => $n['rota'], 'pedido' => $n['pedido'] === null ? null : (int) $n['pedido']];
    }

    public static function notificacoes(array $u): array
    {
        [$filtro, $p] = self::filtroAvisos($u);
        return array_map([self::class, 'notificacaoSaida'], Db::todos('SELECT * FROM notificacoes WHERE 1 = 1' . $filtro . ' ORDER BY id DESC LIMIT 40', $p));
    }

    public static function salvarNotificacoes(mixed $dados, array $u): array
    {
        $lidas = [];
        foreach (V::lista($dados, 'os avisos', 200) as $n) {
            if (is_array($n) && V::bool($n['lida'] ?? false) && is_string($n['id'] ?? null) && preg_match('/^n(\d{1,18})$/', $n['id'], $m)) $lidas[] = (int) $m[1];
        }
        if ($lidas) Db::q('UPDATE notificacoes SET lida = 1 WHERE id IN (' . Db::marcas($lidas) . ')', $lidas);
        Db::q('DELETE FROM notificacoes WHERE em < ?', [Tempo::agoraMs() - 30 * 86_400_000]);
        return self::notificacoes($u);
    }

    /* ================================================================== números do painel */

    public static function metricas(): array
    {
        $hoje = Tempo::agora()->setTime(0, 0);
        $n = (int) $hoje->format('N');
        $segunda = $hoje->modify('-' . ($n - 1) . ' days');
        $inicio = $segunda->modify('-14 days');
        $validos = "status NOT IN ('recusado', 'cancelado')";
        $porDia = [];
        foreach (Db::todos("SELECT criado_em, total FROM pedidos WHERE criado_em >= ? AND $validos", [Tempo::ms($inicio)]) as $r) {
            $dia = Tempo::deMs((int) $r['criado_em'])->format('Y-m-d');
            $porDia[$dia] = ($porDia[$dia] ?? 0) + (int) $r['total'];
        }
        $semana = static function (\DateTimeImmutable $seg, int $ate = 7) use ($porDia): array {
            $dias = [];
            for ($i = 0; $i < 7; $i++) $dias[] = $porDia[$seg->modify("+$i days")->format('Y-m-d')] ?? 0;
            return ['dias' => $dias, 'parcial' => array_sum(array_slice($dias, 0, $ate)), 'total' => array_sum($dias)];
        };
        $atual = $semana($segunda, $n);
        $anterior = $semana($segunda->modify('-7 days'), $n);
        $retrasada = $semana($segunda->modify('-14 days'));
        $delta = static fn (int $a, int $b): float => $b > 0 ? round(($a - $b) / $b * 100, 1) : 0.0;

        $ontemIni = Tempo::ms($hoje->modify('-1 day'));
        $ontem = Db::um("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM pedidos WHERE criado_em >= ? AND criado_em < ? AND $validos", [$ontemIni, Tempo::ms($hoje)]);

        // mais vendidos somados pelo banco, na tabela de itens (antes o PHP abria o JSON de 30 dias de pedidos: BD-03 e BD-05)
        $vendas = [];
        foreach (Db::todos("SELECT i.produto_id AS id, SUM(i.qtd) AS v FROM pedido_itens i JOIN pedidos p ON p.numero = i.pedido_numero
            WHERE i.criado_em >= ? AND p.status NOT IN ('recusado', 'cancelado') GROUP BY i.produto_id ORDER BY v DESC LIMIT 30", [Tempo::agoraMs() - 30 * 86_400_000]) as $r) {
            if ($r['id'] !== '') $vendas[(string) $r['id']] = (int) $r['v'];
        }
        $existentes = array_column(Cardapio::produtos(), 'id');
        $vendas = array_filter($vendas, static fn ($v, $id) => $v > 0 && in_array($id, $existentes, true), ARRAY_FILTER_USE_BOTH);
        arsort($vendas);
        $mais = [];
        foreach (array_slice($vendas, 0, 5, true) as $id => $v) $mais[] = ['produtoId' => (string) $id, 'vendas' => $v];

        $reais = static fn (array $d): array => array_map(static fn ($c) => Tempo::reais($c), $d);
        return [
            'ontem' => ['pedidos' => (int) $ontem['n'], 'faturamento' => Tempo::reais((int) $ontem['t'])],
            'semana' => [
                'atual' => ['total' => Tempo::reais($atual['total']), 'delta' => $delta($atual['parcial'], $anterior['parcial']), 'dias' => $reais($atual['dias'])],
                'anterior' => ['total' => Tempo::reais($anterior['total']), 'delta' => $delta($anterior['total'], $retrasada['total']), 'dias' => $reais($anterior['dias'])],
            ],
            'maisVendidos' => $mais,
        ];
    }
}
