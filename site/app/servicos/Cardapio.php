<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Cardápio lido do banco: categorias, produtos, grupos de adicionais e áreas de entrega. */
final class Cardapio
{
    private static array $cache = [];

    public static function esquecer(): void
    {
        self::$cache = [];
    }

    public static function categorias(): array
    {
        return self::$cache['categorias'] ??= array_map(static fn (array $r): array => [
            'id' => $r['id'], 'nome' => $r['nome'], 'descricao' => $r['descricao'], 'icone' => $r['icone'], 'imagem' => $r['imagem'],
            'ativa' => (bool) $r['ativa'], 'especial' => (bool) $r['especial'], 'ordem' => (int) $r['ordem'], 'versao' => (int) ($r['versao'] ?? 1),
        ], Db::todos('SELECT * FROM categorias WHERE arquivado_em IS NULL ORDER BY ordem, nome'));
    }

    public static function produtos(): array
    {
        return self::$cache['produtos'] ??= array_map(static fn (array $r): array => [
            'id' => $r['id'], 'nome' => $r['nome'], 'categoria' => $r['categoria_id'], 'preco' => (int) $r['preco'],
            'promo' => $r['promo'] === null ? null : (int) $r['promo'], 'descricao' => $r['descricao'],
            'ingredientes' => json_decode((string) $r['ingredientes'], true) ?: [], 'grupos' => json_decode((string) $r['grupos'], true) ?: [],
            'preparo' => (int) $r['preparo'], 'codigo' => $r['codigo'], 'ativo' => (bool) $r['ativo'], 'destaque' => (bool) $r['destaque'],
            'esgotado' => (bool) $r['esgotado'], 'foto' => $r['foto'], 'imagem' => $r['imagem'], 'alt' => $r['alt'], 'selo' => $r['selo'],
            'ordem' => (int) $r['ordem'], 'versao' => (int) ($r['versao'] ?? 1),
        ], Db::todos('SELECT * FROM produtos WHERE arquivado_em IS NULL ORDER BY ordem, nome'));
    }

    public static function grupos(): array
    {
        return self::$cache['grupos'] ??= array_map(static function (array $r): array {
            $opcoes = json_decode((string) $r['opcoes'], true) ?: [];
            return [
                'id' => $r['id'], 'nome' => $r['nome'], 'obrigatorio' => (bool) $r['obrigatorio'], 'tipo' => $r['tipo'],
                'min' => (int) $r['min_escolhas'], 'max' => (int) $r['max_escolhas'], 'ativo' => (bool) $r['ativo'],
                'opcoes' => self::comIds(array_map(static fn ($o) => ['nome' => (string) $o['nome'], 'preco' => (int) $o['preco']], $opcoes)),
                'ordem' => (int) $r['ordem'], 'versao' => (int) ($r['versao'] ?? 1),
            ];
        }, Db::todos('SELECT * FROM grupos WHERE arquivado_em IS NULL ORDER BY ordem, nome'));
    }

    public static function areas(): array
    {
        return self::$cache['areas'] ??= array_map(static fn (array $r): array => [
            'id' => $r['id'], 'nome' => $r['nome'], 'taxa' => (int) $r['taxa'], 'tempoExtra' => (int) $r['tempo_extra'], 'minimo' => (int) $r['minimo'],
            'ativa' => (bool) $r['ativa'], 'cobertura' => $r['cobertura'], 'cepIni' => $r['cep_ini'], 'cepFim' => $r['cep_fim'],
            'raio' => (float) $r['raio'], 'ordem' => (int) $r['ordem'], 'versao' => (int) ($r['versao'] ?? 1),
        ], Db::todos('SELECT * FROM areas WHERE arquivado_em IS NULL ORDER BY ordem, nome'));
    }

    public static function porId(array $lista): array
    {
        return array_column($lista, null, 'id');
    }

    /** Identificador estável de cada opção, feito a partir do nome ("Bacon extra" → "bacon-extra"). */
    public static function slug(string $s): string
    {
        $s = mb_strtolower(trim($s));
        $s = strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'ê' => 'e', 'è' => 'e', 'ë' => 'e', 'í' => 'i', 'î' => 'i', 'ì' => 'i', 'ï' => 'i',
            'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ò' => 'o', 'ö' => 'o', 'ú' => 'u', 'û' => 'u', 'ù' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n']);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
        return trim($s, '-') ?: 'opcao';
    }

    private static function comIds(array $opcoes): array
    {
        $vistos = [];
        foreach ($opcoes as &$o) {
            $id = self::slug($o['nome']);
            $base = $id;
            for ($n = 2; isset($vistos[$id]); $n++) $id = "$base-$n";
            $vistos[$id] = true;
            $o['id'] = $id;
        }
        return $opcoes;
    }

    /** O produto aparece no site? Ativo, não esgotado e numa categoria ativa. */
    public static function visivel(array $p): bool
    {
        $cat = self::porId(self::categorias())[$p['categoria']] ?? null;
        return $p['ativo'] && !$p['esgotado'] && $cat && $cat['ativa'] && !$cat['especial'];
    }

    public static function precoAtual(array $p): int
    {
        return ($p['promo'] !== null && $p['promo'] > 0 && $p['promo'] < $p['preco']) ? $p['promo'] : $p['preco'];
    }

    /** Grupos ativos de um produto, na ordem escolhida no painel. */
    public static function gruposDo(array $p): array
    {
        $g = self::porId(self::grupos());
        $saida = [];
        foreach ($p['grupos'] as $id) {
            if (isset($g[$id]) && $g[$id]['ativo'] && $g[$id]['opcoes']) $saida[] = self::regras($g[$id]);
        }
        return $saida;
    }

    /** Mínimo e máximo coerentes: obrigatório tem mínimo 1; seleção única tem máximo 1. */
    public static function regras(array $g): array
    {
        $max = $g['tipo'] === 'unico' ? 1 : max(1, min($g['max'], count($g['opcoes'])));
        $min = $g['obrigatorio'] ? max(1, min($g['min'] ?: 1, $max)) : 0;
        return ['min' => $min, 'max' => $max] + $g;
    }

    public static function prazo(array $op, int $extra = 0): string
    {
        return ((int) $op['tempoMin'] + $extra) . '–' . ((int) $op['tempoMax'] + $extra) . ' min';
    }

    /** Endereço da loja em uma linha. */
    public static function endereco(): array
    {
        $l = (array) Config::obter('loja', []);
        $rua = trim(($l['rua'] ?? '') . (($l['numero'] ?? '') !== '' ? ', ' . $l['numero'] : ''));
        return ['rua' => $rua, 'bairro' => (string) ($l['bairro'] ?? ''), 'cidade' => (string) ($l['cidade'] ?? ''), 'completo' => $rua . (($l['bairro'] ?? '') !== '' ? ' — ' . $l['bairro'] : '')];
    }

    public const LOGO_PADRAO = '/marca/logo.webp';

    /** Textos de marca do site (Configurações › Dados da loja › Textos do site). Vazio = o texto padrão do modelo. */
    public const TEXTOS_PADRAO = [
        'slogan1' => 'Burguer na parrilla,', 'slogan2' => 'na sua porta.', 'apoio' => 'Blend bovino de 150 g na parrilla no pão brioche. Turbine o seu com adicionais, de bacon a costela desfiada.',
        'descricao' => 'Hamburgueria artesanal na Madalena, Recife', 'botao' => 'Escolher meu burguer',
    ];

    public static function textos(): array
    {
        $l = (array) Config::obter('loja', []);
        $t = [];
        foreach (self::TEXTOS_PADRAO as $k => $padrao) $t[$k] = trim((string) ($l[$k] ?? '')) !== '' ? trim((string) $l[$k]) : $padrao;
        return $t;
    }

    public static function nomeLoja(): string
    {
        return trim((string) (((array) Config::obter('loja', []))['nome'] ?? '')) ?: 'Nossa loja';
    }

    /** Nome e WhatsApp guardados em arquivo: se o banco cair, a página de aviso ainda mostra como falar com a loja (PED-06). */
    public static function guardarContato(): void
    {
        $w = self::whatsapp();
        $dados = json_encode(['nome' => self::nomeLoja(), 'whatsapp' => $w['numero'], 'exibicao' => $w['exibicao'], 'logo' => self::logo()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $arq = RAIZ . '/storage/contato.json';
        if (!is_file($arq) || @file_get_contents($arq) !== $dados) @file_put_contents($arq, $dados, LOCK_EX);
    }

    public static function contatoGuardado(): array
    {
        $c = json_decode((string) @file_get_contents(RAIZ . '/storage/contato.json'), true);
        return is_array($c) ? $c + ['nome' => '', 'whatsapp' => '', 'exibicao' => '', 'logo' => ''] : ['nome' => '', 'whatsapp' => '', 'exibicao' => '', 'logo' => ''];
    }

    /** Banners ativos no site (o de cupom vira a linha do cupom no topo; os outros aparecem antes do cardápio). */
    public static function bannersSite(): array
    {
        $hoje = Tempo::hojeIso();
        $saida = [];
        foreach (Db::todos("SELECT * FROM banners WHERE status = 'ativo' AND arquivado_em IS NULL AND destino NOT LIKE 'cupom:%' ORDER BY ordem, titulo LIMIT 6") as $b) {
            if (($b['inicio'] !== '' && $b['inicio'] > $hoje) || ($b['fim'] !== '' && $b['fim'] < $hoje)) continue;
            $foto = $b['imagem'] !== '' ? $b['imagem'] : $b['foto'];
            $saida[] = ['id' => $b['id'], 'titulo' => $b['titulo'], 'texto' => $b['texto'], 'foto' => $foto, 'destino' => $b['destino'],
                'desktop' => (bool) $b['desktop'], 'mobile' => (bool) $b['mobile']];
        }
        return $saida;
    }

    /** Endereço público da logo: a enviada pelo painel; senão a logo oficial em marca/; senão vazio (nome em texto). */
    public static function logo(): string
    {
        $k = (string) Config::obter('logo', '');
        if (preg_match(Imagem::PADRAO_CHAVE, $k)) return '/' . Imagem::url($k, 500);
        return is_file(RAIZ . self::LOGO_PADRAO) ? self::LOGO_PADRAO : '';
    }

    public static function whatsapp(): array
    {
        $l = (array) Config::obter('loja', []);
        $d = preg_replace('/\D/', '', (string) ($l['whatsapp'] ?? '')) ?? '';
        return ['numero' => $d === '' ? '' : (str_starts_with($d, '55') && strlen($d) > 11 ? $d : '55' . $d), 'exibicao' => (string) ($l['whatsapp'] ?? '')];
    }

    /** Fotos do banco do projeto que só existem em 500 px. */
    private static function so500(string $foto): bool
    {
        return preg_match('/^f\d{3,12}$/', $foto) === 1 && !is_file(RAIZ . "/assets/img/photo-$foto-960.webp");
    }

    /** O arquivo js/data.js do site, gerado a partir do banco (mesmos nomes do protótipo). */
    public static function moduloJs(): string
    {
        $op = Config::operacao();
        $entrega = (array) Config::obter('entrega', []);
        $pag = (array) Config::obter('pagamentos', []);
        $end = self::endereco();
        $whats = self::whatsapp();
        $sit = Horarios::situacao();

        $areas = array_values(array_filter(self::areas(), static fn ($a) => $a['ativa']));
        $extras = $areas ? array_column($areas, 'tempoExtra') : [0];
        $loja = [
            'nome' => self::nomeLoja(), 'botao' => self::textos()['botao'],
            'logo' => self::logo(),
            'endereco' => $end['completo'], 'rua' => $end['rua'], 'bairro' => $end['bairro'], 'cidade' => $end['cidade'],
            'whatsapp' => $whats['numero'], 'whatsappExibicao' => $whats['exibicao'],
            'fuso' => Tempo::FUSO,
            'horarios' => Horarios::semanaSite(),
            'excecoes' => (object) Horarios::excecoesSite(),
            'pausaManual' => $sit['pausada'],
            'fechadaPainel' => $sit['fechadaPainel'],
            'pausaAte' => $sit['pausaAte'],
            'prazoEntrega' => ((int) $op['tempoMin'] + min($extras)) . '–' . ((int) $op['tempoMax'] + max($extras)) . ' min',
            'prazoRetirada' => (string) ($entrega['prazoRetirada'] ?? '20–30 min'),
            'pedidoMinimo' => Tempo::reais((int) ($op['pedidoMinimo'] ?? 0)),
            'entrega' => ($entrega['entrega'] ?? true) !== false && $areas !== [],
            'retirada' => ($entrega['retirada'] ?? true) !== false,
            'orientacoes' => (string) ($entrega['orientacoes'] ?? ''),
            'troco' => !empty($pag['troco']),
            'antecedencia' => Horarios::ANTECEDENCIA_MIN,
        ];

        $areasSite = array_map(static fn ($a) => [
            'id' => $a['id'], 'nome' => $a['nome'], 'taxa' => Tempo::reais($a['taxa']), 'prazo' => self::prazo($op, $a['tempoExtra']), 'minimo' => Tempo::reais($a['minimo']),
        ], $areas);

        $pagamentos = [];
        if (!empty($pag['dinheiro'])) $pagamentos[] = ['id' => 'dinheiro', 'nome' => 'Dinheiro', 'detalhe' => !empty($pag['troco']) ? 'Informe se precisa de troco.' : 'Leve o valor certo: não há troco.'];
        if (!empty($pag['pix'])) $pagamentos[] = ['id' => 'pix', 'nome' => 'Pix', 'detalhe' => 'Você paga com Pix na entrega ou no balcão.'];
        if (!empty($pag['debito'])) $pagamentos[] = ['id' => 'debito', 'nome' => 'Cartão de débito', 'detalhe' => 'Na maquininha, na entrega ou no balcão.'];
        if (!empty($pag['credito'])) $pagamentos[] = ['id' => 'credito', 'nome' => 'Cartão de crédito', 'detalhe' => 'Na maquininha, na entrega ou no balcão.'];

        $categorias = self::porId(self::categorias());
        $visiveis = array_values(array_filter(self::produtos(), [self::class, 'visivel']));
        usort($visiveis, static fn ($a, $b) => [$categorias[$a['categoria']]['ordem'], $a['ordem']] <=> [$categorias[$b['categoria']]['ordem'], $b['ordem']]);

        $grupos = [];
        $produtos = [];
        $fotos500 = [];
        $rank = 0;
        foreach ($visiveis as $p) {
            $gs = self::gruposDo($p);
            foreach ($gs as $g) {
                $grupos[$g['id']] ??= ['nome' => $g['nome'], 'min' => $g['min'], 'max' => $g['max'], 'tipo' => $g['tipo'],
                    'opcoes' => array_map(static fn ($o) => ['id' => $o['id'], 'nome' => $o['nome'], 'preco' => Tempo::reais($o['preco'])], $g['opcoes'])];
            }
            $foto = $p['imagem'] !== '' ? $p['imagem'] : $p['foto'];
            if ($foto !== '' && self::so500($foto)) $fotos500[] = $foto;
            $atual = self::precoAtual($p);
            $produtos[] = [
                'id' => $p['id'], 'categoria' => $p['categoria'], 'nome' => $p['nome'],
                'preco' => Tempo::reais($atual), 'precoDe' => $atual < $p['preco'] ? Tempo::reais($p['preco']) : null,
                'destaque' => $p['destaque'] ? ++$rank : 0, 'selo' => $p['selo'] !== '' ? $p['selo'] : ($atual < $p['preco'] ? 'Promoção' : ''),
                'descricao' => $p['descricao'], 'ingredientes' => $p['ingredientes'], 'remover' => [],
                'grupos' => array_column($gs, 'id'), 'foto' => $foto, 'alt' => $p['imagem'] !== '' || $p['alt'] === '' ? $p['nome'] : $p['alt'],
            ];
        }
        $usadas = array_unique(array_column($produtos, 'categoria'));
        $cats = [];
        foreach (self::categorias() as $c) {
            if ($c['ativa'] && !$c['especial'] && in_array($c['id'], $usadas, true)) $cats[] = ['id' => $c['id'], 'nome' => $c['nome']];
        }

        $retirar = 'Pode retirar no balcão' . ($end['rua'] !== '' ? ' da ' . $end['rua'] : '') . '.';
        $status = [
            ['id' => 'recebido', 'nome' => 'Recebido', 'texto' => 'A cozinha recebeu o seu pedido.'],
            ['id' => 'confirmado', 'nome' => 'Confirmado', 'texto' => 'Pedido confirmado pela loja.'],
            ['id' => 'preparo', 'nome' => 'Em preparo', 'texto' => 'Seu pedido está sendo preparado.'],
            ['id' => 'saiu', 'nome' => 'Saiu para entrega', 'nomeRetirada' => 'Pronto para retirada', 'texto' => 'O entregador está a caminho.', 'textoRetirada' => $retirar],
            ['id' => 'entregue', 'nome' => 'Entregue', 'nomeRetirada' => 'Retirado', 'texto' => 'Pedido entregue. Bom apetite.', 'textoRetirada' => 'Pedido retirado. Bom apetite.'],
        ];
        $finais = [
            'cancelado' => ['nome' => 'Cancelado', 'texto' => 'Este pedido foi cancelado. Fale com a ' . self::nomeLoja() . ' no WhatsApp se precisar.'],
            'recusado' => ['nome' => 'Recusado', 'texto' => 'A ' . self::nomeLoja() . ' não conseguiu aceitar este pedido agora. Nada foi cobrado.'],
        ];

        $j = static fn (mixed $v): string => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR);
        $linhas = [
            '/* Gerado pelo servidor a partir do banco de dados. Para mudar, use o painel em /admin. */',
            'export const AGORA = ' . Tempo::agoraMs() . ';',
            'export const LOJA = ' . $j($loja) . ';',
            'export const AREAS = ' . $j($areasSite) . ';',
            'export const CUPONS = [];',
            'export const PAGAMENTOS = ' . $j($pagamentos) . ';',
            'export const STATUS = ' . $j($status) . ';',
            'export const STATUS_FINAIS = ' . $j($finais) . ';',
            'export const CATEGORIAS = ' . $j($cats) . ';',
            'export const GRUPOS = ' . $j((object) $grupos) . ';',
            'export const PRODUTOS = ' . $j($produtos) . ';',
            'export const BANNERS = ' . $j(self::bannersSite()) . ';',
            'export const FORA_DO_AR = false;',
            'const SO_500 = new Set(' . $j(array_values(array_unique($fotos500))) . ');',
            "export const img = (foto, w) => {",
            "  if (!foto) return 'assets/img/sem-foto.svg';",
            "  if (foto.startsWith('u-')) { const jpg = foto.endsWith('-j'); const base = jpg ? foto.slice(0, -2) : foto; return `uploads/\${base}-\${w && w <= 500 ? 500 : 960}.\${jpg ? 'jpg' : 'webp'}`; }",
            "  if (SO_500.has(foto)) return `assets/img/photo-\${foto}-500.webp`;",
            "  return `assets/img/photo-\${foto}\${w ? '-' + w : ''}.webp`;",
            '};',
            'export const produto = id => PRODUTOS.find(p => p.id === id);',
            '',
        ];
        return implode("\n", $linhas);
    }

    /* ================================================================== textos das páginas (vêm do painel) */

    /**
      Cupom em destaque no site: o de um banner ativo (Banners › destino "cupom") que aponta para um cupom ligado,
      dentro da validade e com usos sobrando. Sem banner assim, o site não anuncia cupom nenhum.
    */
    public static function promo(): ?array
    {
        $hoje = Tempo::hojeIso();
        foreach (Db::todos("SELECT * FROM banners WHERE status <> 'encerrado' AND arquivado_em IS NULL AND destino LIKE 'cupom:%' ORDER BY ordem, titulo") as $b) {
            if (($b['inicio'] !== '' && $b['inicio'] > $hoje) || ($b['fim'] !== '' && $b['fim'] < $hoje)) continue;
            $c = Cupons::porCodigo(Cupons::normalizarCodigo(substr((string) $b['destino'], 6)));
            if (!$c || !$c['habilitado'] || ($c['inicio'] !== '' && $c['inicio'] > $hoje) || ($c['validade'] !== '' && $c['validade'] < $hoje)) continue;
            if ($c['limite'] !== null && $c['usos'] >= $c['limite']) continue;
            return ['cupom' => $c, 'banner' => $b];
        }
        return null;
    }

    /**
      Preenche uma página do site com os dados do painel: nome, endereço, bairros, horários, formas de pagamento,
      prazos e o cupom em destaque. Marcas {{NOME}} viram texto (com escape); blocos <!--se:x-->…<!--/se:x--> só
      ficam se a condição x valer (promo, entrega, retirada).
    */
    public static function preencherPagina(string $html): string
    {
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $brl = static fn (int $c): string => str_replace('R$ ', "R$\u{00a0}", Tempo::brl($c));
        $brlCurto = static fn (int $c): string => str_replace(',00', '', $brl($c));
        $lista = static function (array $itens, string $e = ' e '): string {
            $n = count($itens);
            return $n <= 1 ? (string) ($itens[0] ?? '') : implode(', ', array_slice($itens, 0, -1)) . $e . $itens[$n - 1];
        };

        $loja = (array) Config::obter('loja', []);
        $nome = self::nomeLoja();
        $txt = self::textos();
        self::guardarContato();
        $cfgEntrega = (array) Config::obter('entrega', []);
        $pag = (array) Config::obter('pagamentos', []);
        $op = Config::operacao();
        $areas = array_values(array_filter(self::areas(), static fn ($a) => $a['ativa']));
        $entrega = ($cfgEntrega['entrega'] ?? true) !== false && $areas !== [];
        $retirada = ($cfgEntrega['retirada'] ?? true) !== false;
        $end = self::endereco();
        $whats = self::whatsapp();

        // bairros e taxas
        $nomesAreas = array_column($areas, 'nome');
        $bairros = !$entrega ? '' : (count($nomesAreas) === 1 ? 'no bairro ' . $nomesAreas[0] : 'nos bairros ' . $lista($nomesAreas));
        $taxas = array_column($areas, 'taxa');
        $taxaDesde = !$entrega ? '' : (min($taxas) > 0 ? 'Entrega a partir de ' . $brl(min($taxas)) : (max($taxas) > 0 ? 'Entrega grátis em alguns bairros' : 'Entrega grátis'));
        $extras = $areas ? array_column($areas, 'tempoExtra') : [0];
        $prazoEntrega = ((int) $op['tempoMin'] + min($extras)) . '–' . ((int) $op['tempoMax'] + max($extras)) . ' min';
        $prazoRetirada = (string) ($cfgEntrega['prazoRetirada'] ?? '20–30 min');
        $emMinutos = static fn (string $p): string => str_replace(['–', 'min'], [' a ', 'minutos'], $p);

        // horários
        $grupos = Horarios::grupos();
        $abertos = array_values(array_filter($grupos, static fn ($g) => $g['aberto']));
        $fechados = array_values(array_filter($grupos, static fn ($g) => !$g['aberto']));
        $resumo = $abertos ? implode(' · ', array_map(static fn ($g) => $g['dias'] . ', ' . $g['faixa'], $abertos)) : 'Consulte os horários no WhatsApp';
        $fechadoTxt = $fechados ? ' ' . $lista(array_map(static fn ($g) => $g['dias'], $fechados)) . ' a gente não abre.' : '';

        // pagamento
        $formas = [];
        if (!empty($pag['dinheiro'])) $formas[] = 'dinheiro';
        if (!empty($pag['pix'])) $formas[] = 'Pix';
        if (!empty($pag['debito'])) $formas[] = 'cartão de débito';
        if (!empty($pag['credito'])) $formas[] = 'cartão de crédito';
        $formasCurtas = array_values(array_unique(array_map(static fn ($f) => str_starts_with($f, 'cartão') ? 'cartão' : $f, $formas)));
        $formasFaq = array_map(static fn ($f) => str_replace('cartão de ', '', $f), $formas);
        $troco = !empty($pag['dinheiro']) ? (!empty($pag['troco']) ? ' Se for dinheiro, diga para quanto é o troco.' : ' Se for dinheiro, leve o valor certo: não há troco.') : '';
        $ondePaga = $entrega && $retirada ? 'Na entrega ou no balcão' : ($entrega ? 'Na entrega' : 'No balcão');
        $maiuscula = static fn (string $s): string => mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);

        // cupom em destaque
        $p = self::promo();
        $cupom = $p['cupom'] ?? null;
        $promo = [];
        if ($cupom) {
            $v = (int) $cupom['valor'];
            [$off, $titulo, $desconto, $curto] = match ($cupom['tipo']) {
                'percentual' => ["$v% OFF", "$v% off", "$v% de desconto", "$v% nos produtos"],
                'fixo' => [$brlCurto($v) . ' OFF', $brlCurto($v) . ' off', $brl($v) . ' de desconto', $brlCurto($v) . ' nos produtos'],
                default => ['FRETE GRÁTIS', 'Entrega grátis', 'Entrega grátis', 'entrega grátis'],
            };
            $porCliente = (int) $cupom['porCliente'];
            $vezes = $porCliente === 1 ? 'uma vez por WhatsApp' : ($porCliente > 1 ? "até $porCliente vezes por WhatsApp" : '');
            $minimo = (int) $cupom['minimo'] > 0 ? 'em pedidos a partir de ' . $brl((int) $cupom['minimo']) . ' em produtos' : '';
            $condicao = implode(', ', array_filter([$vezes, $minimo]));
            $detalhe = ($cupom['tipo'] === 'frete' ? 'A entrega sai grátis' : 'São ' . $curto) . ($condicao !== '' ? ', ' . $condicao : '') . '.'
                . ($cupom['tipo'] !== 'frete' ? ' A taxa de entrega fica de fora.' : '');
            $regra = ($condicao !== '' ? $maiuscula($condicao) . '. ' : '') . 'Toque no cupom para aplicar.';
            $textoBanner = trim((string) $p['banner']['texto']);
            if ($textoBanner !== '' && !preg_match('/[.!?]$/u', $textoBanner)) $textoBanner .= '.';
            $promo = [
                '{{CUPOM_CODIGO}}' => $cupom['codigo'], '{{CUPOM_OFF}}' => $off, '{{CUPOM_DESCONTO}}' => $desconto,
                '{{PROMO_CHAMADA}}' => (string) $p['banner']['titulo'], '{{PROMO_TITULO}}' => $titulo,
                '{{PROMO_TEXTO}}' => ($textoBanner !== '' ? $textoBanner . ' ' : '') . 'Use o cupom ' . $cupom['codigo'] . ' na sacola.',
                '{{CUPOM_CURTO}}' => $curto, '{{CUPOM_REGRA}}' => $regra,
                '{{FAQ_CUPOM}}' => 'Toque em Aplicar ' . $cupom['codigo'] . ' ou digite o código na sacola. ' . $detalhe,
            ];
        }

        $partesMeta = array_filter([$entrega ? 'entrega ' . $bairros : '', $retirada ? 'retirada grátis no balcão' : '']);
        $mapa = 'https://www.openstreetmap.org/search?query=' . rawurlencode($end['rua'] . ', ' . $end['bairro'] . ($end['cidade'] !== '' ? ', ' . $end['cidade'] : ''));
        $texto = [
            '{{LOJA_NOME}}' => $nome,
            '{{ANO}}' => Tempo::agora()->format('Y'),
            '{{META_DESCRICAO}}' => $txt['descricao'] . ', com ' . implode(' ou ', $partesMeta) . '. ' . $resumo . '.' . ($cupom ? ' Cupom ' . $cupom['codigo'] . ' com ' . Cupons::curto($cupom) . '.' : ''),
            '{{LOJA_DESCRICAO}}' => $txt['descricao'], '{{HERO_TITULO_1}}' => $txt['slogan1'], '{{HERO_TITULO_2}}' => $txt['slogan2'],
            '{{HERO_APOIO}}' => $txt['apoio'], '{{BOTAO_TOPO}}' => $txt['botao'],
            '{{OG_DESCRICAO}}' => 'Peça no site e pague na entrega' . ($formasCurtas ? ': ' . $lista($formasCurtas, ' ou ') : '') . '. ' . ($entrega ? $maiuscula($lista($nomesAreas)) . '.' : 'Retirada no balcão.'),
            '{{HERO_ENTREGA}}' => $entrega ? 'Entrega em ' . str_replace('–', ' a ', $prazoEntrega) . ' para ' . $lista($nomesAreas) . '.' : 'Retire grátis no balcão em ' . str_replace('–', ' a ', $prazoRetirada) . '.',
            '{{TAXA_DESDE}}' => $taxaDesde,
            '{{PRAZO_ENTREGA}}' => $entrega ? $prazoEntrega : $prazoRetirada,
            '{{HORARIO_RESUMO}}' => $resumo,
            '{{LOJA_RUA}}' => $end['rua'],
            '{{LOJA_BAIRRO}}' => $end['bairro'],
            '{{ENDERECO_COMPLETO}}' => $end['completo'],
            '{{MAPA_URL}}' => $mapa,
            '{{WHATS_URL}}' => 'https://wa.me/' . $whats['numero'],
            '{{WHATS_EXIBICAO}}' => $whats['exibicao'],
            '{{FAQ_HORARIO}}' => $resumo . '.' . $fechadoTxt . ' Fora desse horário, dá para deixar o pedido agendado.',
            '{{FAQ_PAGAMENTO}}' => $ondePaga . ($formasFaq ? ': ' . $lista($formasFaq, ' ou ') : '') . '. O site não cobra nada.' . $troco,
            '{{FAQ_TAXAS}}' => ($entrega ? $lista(array_map(static fn ($a) => $a['nome'] . ' ' . ($a['taxa'] > 0 ? $brl($a['taxa']) : 'grátis'), $areas)) . '.' : 'No momento a gente não faz entregas.')
                . ($retirada ? ' Retirar no balcão é grátis.' : ''),
            '{{FAQ_PRAZO}}' => trim(($entrega ? 'De ' . $emMinutos($prazoEntrega) . ', conforme o bairro e o movimento.' : '')
                . ($retirada ? ' Para retirar, fica pronto em ' . $emMinutos($prazoRetirada) . '.' : '')),
            '{{FAQ_AGENDAR}}' => 'Pode. Escolha um horário com pelo menos ' . Horarios::ANTECEDENCIA_MIN . ' minutos de antecedência, para até 8 dias à frente, dentro do horário da loja.',
            '{{RODAPE_SOBRE}}' => $txt['descricao'] . ', com ' . ($entrega ? 'entrega ' . $bairros . '.' : 'retirada no balcão.'),
        ] + $promo + self::tokensPrivacidade($loja, $end, $whats);
        // listas montadas aqui (o JavaScript do site refaz as mesmas listas ao abrir)
        $html_ = [
            '{{HORARIOS_LISTA_HTML}}' => implode('', array_map(static fn ($g) => '<li><span>' . $e($g['dias']) . '</span><b>' . $e($g['faixa']) . '</b></li>', $grupos)),
            '{{HORARIOS_RODAPE_HTML}}' => implode('', array_map(static fn ($g) => $g['aberto'] ? '<li>' . $e($g['dias']) . '<br>' . $e($g['faixa']) . '</li>' : '<li>' . $e($g['dias']) . ': fechado</li>', $grupos)),
            '{{AREAS_LISTA_HTML}}' => implode('', array_map(static fn ($a) => '<li><span>' . $e($a['nome']) . '<small>' . $e(str_replace('–', ' a ', self::prazo($op, (int) $a['tempoExtra']))) . '</small></span><b>' . $e($brl((int) $a['taxa'])) . '</b></li>', $entrega ? $areas : []))
                . ($retirada ? '<li><span>Retirada no balcão<small>' . $e(str_replace('–', ' a ', $prazoRetirada)) . '</small></span><b>Grátis</b></li>' : ''),
        ];

        $pv = (array) Config::obter('privacidade', []);
        $condicoes = ['promo' => $cupom !== null, 'entrega' => $entrega, 'retirada' => $retirada,
            'cnpj' => trim((string) ($loja['cnpj'] ?? '')) !== '', 'encarregado' => trim((string) ($pv['encarregadoNome'] ?? '')) !== '',
            'semencarregado' => trim((string) ($pv['encarregadoNome'] ?? '')) === '', 'email' => trim((string) ($loja['email'] ?? '')) !== ''];
        $html = preg_replace_callback('#<!--se:([a-z]+)-->(.*?)<!--/se:\1-->#s', static fn ($m) => !empty($condicoes[$m[1]]) ? $m[2] : '', $html) ?? $html;
        return strtr($html, array_map($e, $texto) + $html_);
    }

    /** Data desta versão da política de privacidade (muda quando o texto do modelo muda). */
    public const PRIVACIDADE_VERSAO = '17/11/2026';

    /** Marcas da página de privacidade: quem é a loja, o encarregado e o prazo de guarda (vêm do painel). */
    private static function tokensPrivacidade(array $loja, array $end, array $whats): array
    {
        $pv = (array) Config::obter('privacidade', []);
        $meses = (int) ($pv['prazoMeses'] ?? 24);
        $contatoEnc = implode(' · ', array_filter([trim((string) ($pv['encarregadoEmail'] ?? '')), trim((string) ($pv['encarregadoTelefone'] ?? ''))]));
        return [
            '{{LOJA_RAZAO}}' => trim((string) ($loja['razao'] ?? '')) ?: self::nomeLoja(),
            '{{LOJA_CNPJ}}' => (string) ($loja['cnpj'] ?? ''),
            '{{LOJA_EMAIL}}' => (string) ($loja['email'] ?? ''),
            '{{LOJA_CIDADE}}' => trim(((string) ($loja['cidade'] ?? '')) . (($loja['uf'] ?? '') !== '' ? '/' . $loja['uf'] : '')),
            '{{ENCARREGADO_NOME}}' => (string) ($pv['encarregadoNome'] ?? ''),
            '{{ENCARREGADO_CONTATO}}' => $contatoEnc !== '' ? $contatoEnc : 'pelo WhatsApp da loja, ' . $whats['exibicao'],
            '{{PRAZO_GUARDA}}' => $meses % 12 === 0 ? ($meses / 12) . ($meses === 12 ? ' ano' : ' anos') : "$meses meses",
            '{{PRIVACIDADE_VERSAO}}' => self::PRIVACIDADE_VERSAO,
        ];
    }
}
