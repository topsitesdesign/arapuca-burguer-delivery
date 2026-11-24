<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Horário de funcionamento no fuso de Brasília: semana, exceções (feriados), loja fechada no painel,
  pausa temporária e horários para agendar. Uma janela pode passar da meia-noite (ex.: 18:00 às 01:00).
*/
final class Horarios
{
    public const ANTECEDENCIA_MIN = 45;   // o site oferece horários a partir de 45 min
    public const TOLERANCIA_MIN = 20;     // o servidor aceita até 20 min antes do horário (a pessoa demorou para enviar)
    public const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

    private static function min(string $hhmm): int
    {
        [$h, $m] = array_map('intval', explode(':', $hhmm) + [1 => 0]);
        return $h * 60 + $m;
    }

    public static function hora(string $hhmm): string
    {
        [$h, $m] = explode(':', $hhmm) + [1 => '00'];
        return (int) $h . 'h' . ($m !== '00' ? $m : '');
    }

    /** Janela de um dia (YYYY-MM-DD): [abre, fecha] em minutos desde 00:00 daquele dia, ou null se fechado. */
    public static function janela(string $iso): ?array
    {
        foreach ((array) Config::obter('excecoes', []) as $x) {
            if (($x['data'] ?? '') !== $iso) continue;
            if (($x['tipo'] ?? '') === 'fechado') return null;
            if (!empty($x['abre']) && !empty($x['fecha'])) return self::montar($x['abre'], $x['fecha']);
        }
        $semana = (array) Config::obter('horarios', []);
        $n = (int) (new \DateTimeImmutable($iso, Tempo::fuso()))->format('N'); // 1 = segunda … 7 = domingo
        $h = $semana[$n - 1] ?? null;
        if (!$h || empty($h['aberto'])) return null;
        return self::montar($h['abre'], $h['fecha']);
    }

    private static function montar(string $abre, string $fecha): array
    {
        $a = self::min($abre);
        $f = self::min($fecha);
        if ($f <= $a) $f += 1440; // passa da meia-noite
        return [$a, $f];
    }

    /** Janelas reais (em ms) que tocam o intervalo de ontem até daqui a $dias. */
    private static function janelasMs(int $dias = 8): array
    {
        $hoje = Tempo::agora()->setTime(0, 0);
        $lista = [];
        for ($k = -1; $k <= $dias; $k++) {
            $d = $hoje->modify(($k >= 0 ? '+' : '') . $k . ' days');
            $j = self::janela($d->format('Y-m-d'));
            if (!$j) continue;
            $base = Tempo::ms($d);
            $lista[] = ['dia' => $d, 'k' => $k, 'abre' => $base + $j[0] * 60_000, 'fecha' => $base + $j[1] * 60_000];
        }
        return $lista;
    }

    /** Dentro do horário de funcionamento (sem olhar a pausa do painel)? */
    public static function noHorario(?int $ms = null): bool
    {
        $ms ??= Tempo::agoraMs();
        foreach (self::janelasMs(1) as $j) {
            if ($ms >= $j['abre'] && $ms < $j['fecha']) return true;
        }
        return false;
    }

    /** Situação para o site e para a validação do pedido. */
    public static function situacao(): array
    {
        $op = Config::operacao();
        $agora = Tempo::agoraMs();
        $noHorario = self::noHorario($agora);
        $pausada = !empty($op['pausada']);
        $fechadaPainel = empty($op['aberta']);
        $aceitaAgora = $noHorario && !$pausada && !$fechadaPainel;
        $proxima = null;
        foreach (self::janelasMs(8) as $j) {
            if ($j['abre'] > $agora) { $proxima = $j; break; }
        }
        $abre = null;
        if ($proxima) {
            $quando = $proxima['k'] === 0 ? 'hoje' : ($proxima['k'] === 1 ? 'amanhã' : self::DIAS[(int) $proxima['dia']->format('w')]);
            $abre = ['quando' => $quando, 'as' => Tempo::deMs($proxima['abre'])->format('H:i'), 'em' => $proxima['abre']];
        }
        $fecha = null;
        foreach (self::janelasMs(1) as $j) {
            if ($agora >= $j['abre'] && $agora < $j['fecha']) $fecha = Tempo::deMs($j['fecha'])->format('H:i');
        }
        return [
            'aceitaAgora' => $aceitaAgora,
            'aceitaAgendamento' => !$pausada,
            'noHorario' => $noHorario,
            'pausada' => $pausada,
            'fechadaPainel' => $fechadaPainel,
            'pausaAte' => $op['pausaAte'] ?? null,
            'fecha' => $fecha,
            'abre' => $abre,
        ];
    }

    /** Confere um horário de agendamento ("YYYY-MM-DD HH:MM", horário de Brasília) e devolve o instante em ms. */
    public static function validarAgendamento(mixed $valor): int
    {
        if (!is_string($valor) || !preg_match('/^(\d{4}-\d{2}-\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/', $valor, $m)) {
            throw new Erro('Escolha um horário para o agendamento.', 422, 'hora');
        }
        $quando = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $m[1] . ' ' . $m[2] . ':' . $m[3], Tempo::fuso());
        if (!$quando) throw new Erro('Escolha um horário para o agendamento.', 422, 'hora');
        $ms = Tempo::ms($quando);
        $agora = Tempo::agoraMs();
        if ($ms < $agora + self::TOLERANCIA_MIN * 60_000) {
            throw new Erro('Esse horário ficou perto demais. Escolha um horário mais tarde.', 422, 'hora');
        }
        if ($ms > $agora + 8 * 86_400_000) throw new Erro('Agende para os próximos dias.', 422, 'hora');
        foreach (self::janelasMs(8) as $j) {
            if ($ms > $j['abre'] && $ms <= $j['fecha']) return $ms;
        }
        throw new Erro('A loja está fechada nesse horário. Escolha outro.', 422, 'hora');
    }

    /** Texto do agendamento: "Hoje, 20h30", "Amanhã, 19h", "Sábado, 18h30". */
    public static function rotulo(int $ms): string
    {
        $d = Tempo::deMs($ms);
        $hoje = Tempo::agora()->setTime(0, 0);
        $dia = $d->setTime(0, 0);
        $k = (int) round(($dia->getTimestamp() - $hoje->getTimestamp()) / 86400);
        $nome = $k === 0 ? 'Hoje' : ($k === 1 ? 'Amanhã' : ($k === -1 ? 'Ontem' : ucfirst(self::DIAS[(int) $d->format('w')]) . ' ' . $d->format('d/m')));
        return $nome . ', ' . self::hora($d->format('H:i'));
    }

    /** Horários da semana no formato do site: {0: ['18:00','23:30'] | null, …} com 0 = domingo. */
    public static function semanaSite(): array
    {
        $semana = (array) Config::obter('horarios', []);
        $saida = [];
        for ($i = 0; $i < 7; $i++) {
            $h = $semana[($i + 6) % 7] ?? null; // painel: 0 = segunda
            $saida[$i] = ($h && !empty($h['aberto'])) ? [$h['abre'], $h['fecha']] : null;
        }
        return $saida;
    }

    /**
      Dias seguidos com o mesmo horário viram um grupo, começando na segunda (o site faz igual em js/ui.js):
      [['dias' => 'Terça a domingo', 'faixa' => '18h às 23h30', 'aberto' => true], ['dias' => 'Segunda-feira', 'faixa' => 'Fechado', 'aberto' => false]].
    */
    public static function grupos(): array
    {
        $semana = self::semanaSite(); // 0 = domingo
        $nomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        $grupos = [];
        foreach ([1, 2, 3, 4, 5, 6, 0] as $d) {
            $h = $semana[$d];
            $chave = $h ? $h[0] . '-' . $h[1] : 'fechado';
            $n = count($grupos);
            if ($n && $grupos[$n - 1]['chave'] === $chave) $grupos[$n - 1]['dias'][] = $d;
            else $grupos[] = ['chave' => $chave, 'dias' => [$d], 'h' => $h];
        }
        return array_map(static function (array $g) use ($nomes): array {
            $primeiro = $g['dias'][0];
            $ultimo = $g['dias'][count($g['dias']) - 1];
            $dias = count($g['dias']) === 1 ? $nomes[$primeiro] : mb_strtoupper(mb_substr(self::DIAS[$primeiro], 0, 1)) . mb_substr(self::DIAS[$primeiro], 1) . (count($g['dias']) === 2 ? ' e ' : ' a ') . self::DIAS[$ultimo];
            return ['dias' => $dias, 'faixa' => $g['h'] ? self::hora($g['h'][0]) . ' às ' . self::hora($g['h'][1]) : 'Fechado', 'aberto' => (bool) $g['h']];
        }, $grupos);
    }

    /** Exceções dos próximos 10 dias no formato do site: {'2026-12-25': null, '2026-12-24': ['18:00','22:00']}. */
    public static function excecoesSite(): array
    {
        $inicio = Tempo::agora()->modify('-1 day')->format('Y-m-d');
        $limite = Tempo::agora()->modify('+10 days')->format('Y-m-d');
        $saida = [];
        foreach ((array) Config::obter('excecoes', []) as $x) {
            $d = $x['data'] ?? '';
            if ($d < $inicio || $d > $limite) continue;
            $saida[$d] = ($x['tipo'] ?? '') === 'fechado' || empty($x['abre']) ? null : [$x['abre'], $x['fecha']];
        }
        return $saida;
    }

    /** Resumo legível dos dias abertos, ex.: "Terça a domingo, 18h às 23h30". */
    public static function resumo(): string
    {
        $semana = (array) Config::obter('horarios', []);
        $abertos = array_values(array_filter($semana, static fn ($h) => !empty($h['aberto'])));
        if (!$abertos) return 'Consulte os horários pelo WhatsApp';
        $iguais = count(array_unique(array_map(static fn ($h) => $h['abre'] . '-' . $h['fecha'], $abertos))) === 1;
        $faixa = $iguais ? ', ' . self::hora($abertos[0]['abre']) . ' às ' . self::hora($abertos[0]['fecha']) : '';
        if (count($abertos) === 7) return 'Todos os dias' . $faixa;
        $nomes = array_map(static fn ($h) => mb_strtolower($h['dia']), $abertos);
        return ucfirst($nomes[0]) . ' a ' . end($nomes) . $faixa;
    }
}
