<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Chaves de um endereço de entrega, para o cupom "uma vez por cliente" valer também pelo endereço (VAL-02):
  "R. das Flores, nº 120 - apto 3" e "Rua das Flores 120 ap 3" dão a mesma chave. Só o hash é guardado, nunca o texto.
  - endereco: rua + número + complemento + bairro (identifica a casa ou o apartamento)
  - predio: rua + número + bairro (o prédio ou o terreno). Sem complemento, as duas chaves são iguais.
*/
final class Endereco
{
    private const ACENTOS = [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n', 'º' => ' ', 'ª' => ' ',
    ];
    /** Tipo da via e ligações: não mudam o lugar. */
    private const RUA_IGNORAR = ['rua', 'r', 'avenida', 'av', 'avd', 'travessa', 'tv', 'trav', 'alameda', 'al', 'estrada', 'estr', 'rodovia', 'rod',
        'praca', 'pca', 'pc', 'largo', 'lgo', 'viela', 'beco', 'passagem', 'servidao', 'de', 'da', 'do', 'das', 'dos', 'e'];
    /** Abreviações comuns nos nomes de rua. */
    private const ABREVIACOES = ['dr' => 'doutor', 'dra' => 'doutora', 'prof' => 'professor', 'profa' => 'professora', 'eng' => 'engenheiro',
        'brig' => 'brigadeiro', 'gen' => 'general', 'gal' => 'general', 'cel' => 'coronel', 'cap' => 'capitao', 'ten' => 'tenente',
        'mal' => 'marechal', 'pres' => 'presidente', 'sto' => 'santo', 'sta' => 'santa', 'pe' => 'padre', 'dep' => 'deputado',
        'sen' => 'senador', 'gov' => 'governador', 'maj' => 'major', 'cons' => 'conselheiro', 'nsa' => 'nossa', 'sr' => 'senhor', 'sra' => 'senhora'];
    /** Marcadores de número ("nº") e de complemento ("apto", "bloco"): o que vale são os números e as letras. */
    private const NUMERO_IGNORAR = ['n', 'no', 'nr', 'num', 'numero'];
    private const COMPLEMENTO_IGNORAR = ['apto', 'apt', 'ap', 'apartamento', 'bloco', 'bl', 'blc', 'casa', 'cs', 'sala', 'sl', 'conjunto', 'conj', 'cj',
        'lote', 'lt', 'quadra', 'qd', 'torre', 'andar', 'unidade', 'un', 'n', 'no', 'num', 'numero'];

    /** @return array{endereco: string, predio: string} ('' nas duas quando não há endereço) */
    public static function chaves(mixed $e, mixed $area): array
    {
        $vazio = ['endereco' => '', 'predio' => ''];
        if (!is_array($e)) return $vazio;
        $rua = self::palavras($e['rua'] ?? '', self::RUA_IGNORAR, true);
        if (!$rua) return $vazio;
        $numero = self::palavras($e['numero'] ?? '', self::NUMERO_IGNORAR);
        $comp = self::palavras($e['complemento'] ?? '', self::COMPLEMENTO_IGNORAR);
        sort($comp); // "bloco B apto 12" e "apto 12 bloco B"
        $base = implode(' ', $rua) . '|' . implode('', $numero) . '|' . (is_scalar($area) ? (string) $area : '');
        $predio = self::hash($base);
        return ['endereco' => $comp ? self::hash($base . '|' . implode(' ', $comp)) : $predio, 'predio' => $predio];
    }

    private static function hash(string $s): string
    {
        return substr(hash_hmac('sha256', 'endereco:' . $s, (string) (CONFIG['chave'] ?? 'brasa')), 0, 40);
    }

    private static function palavras(mixed $txt, array $ignorar, bool $rua = false): array
    {
        if (!is_scalar($txt)) return [];
        $s = strtr(mb_strtolower(trim((string) $txt)), self::ACENTOS);
        $s = (string) preg_replace('/[^a-z0-9]+/', ' ', $s);
        $s = (string) preg_replace(['/(\d)([a-z])/', '/([a-z])(\d)/'], '$1 $2', $s); // "12b" = "12 b"
        $todas = array_values(array_filter(explode(' ', $s), static fn ($p) => $p !== ''));
        $saida = [];
        foreach ($todas as $p) {
            if (in_array($p, $ignorar, true)) continue;
            if ($rua) $p = self::ABREVIACOES[$p] ?? $p;
            if (ctype_digit($p)) $p = ltrim($p, '0') === '' ? '0' : ltrim($p, '0');
            $saida[] = $p;
        }
        // rua que só tem palavras da lista (ex.: "Rua R"): usa o que foi escrito
        return $saida ?: ($rua ? $todas : []);
    }
}
