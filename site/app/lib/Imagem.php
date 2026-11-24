<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/**
  Envio seguro de imagens: confere o tipo pelo conteúdo, refaz a imagem do zero (remove metadados e
  qualquer código escondido) e grava duas versões (500 e 960 px) com nome aleatório.
  A "chave" guardada no banco é u-xxxxxxxxxxxx (WebP) ou u-xxxxxxxxxxxx-j (JPEG, quando o servidor não tem WebP).
*/
final class Imagem
{
    public const PADRAO_CHAVE = '/^u-[a-f0-9]{12}(-j)?$/';

    public static function deDataUrl(string $url): string
    {
        if (!preg_match('#^data:image/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$#', $url, $m)) {
            throw new Erro('Use uma imagem JPG, PNG ou WebP.');
        }
        $bin = base64_decode(preg_replace('/\s+/', '', $m[2]) ?? '', true);
        if ($bin === false || $bin === '' || strlen($bin) > 6 * 1024 * 1024) throw new Erro('A imagem é grande demais (máximo de 6 MB).');
        $info = @getimagesizefromstring($bin);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            throw new Erro('Não conseguimos abrir essa imagem. Tente outra em JPG, PNG ou WebP.');
        }
        // abrir a imagem ocupa cerca de 5 bytes por pixel: confere antes, para não derrubar o servidor (SEG-07)
        if ($info[0] > 4000 || $info[1] > 4000 || !self::cabeNaMemoria((int) $info[0], (int) $info[1])) {
            throw new Erro('A imagem é grande demais (' . $info[0] . ' × ' . $info[1] . ' px). Use no máximo 4000 px de largura e de altura.');
        }
        $img = @imagecreatefromstring($bin);
        if (!$img) throw new Erro('Não conseguimos abrir essa imagem. Tente outra em JPG, PNG ou WebP.');
        $webp = function_exists('imagewebp');
        $base = 'u-' . bin2hex(random_bytes(6));
        $pasta = RAIZ . '/uploads';
        if (!is_dir($pasta)) @mkdir($pasta, 0775, true);
        foreach ([500, 960] as $largura) {
            $dst = self::reduzir($img, $largura, !$webp);
            $arquivo = "$pasta/$base-$largura." . ($webp ? 'webp' : 'jpg');
            $ok = $webp ? imagewebp($dst, $arquivo, 80) : imagejpeg($dst, $arquivo, 82);
            if (!$ok) throw new \RuntimeException('Falha ao gravar a imagem em uploads/.');
        }
        return $base . ($webp ? '' : '-j');
    }

    private static function cabeNaMemoria(int $w, int $h): bool
    {
        $limite = trim((string) ini_get('memory_limit'));
        if ($limite === '' || $limite === '-1') return true;
        $n = (int) $limite;
        $limiteBytes = match (strtolower(substr($limite, -1))) { 'g' => $n * 1024 ** 3, 'm' => $n * 1024 ** 2, 'k' => $n * 1024, default => $n };
        // a imagem aberta + a cópia reduzida (960 px) + folga para o resto do pedido
        return memory_get_usage(true) + $w * $h * 5 + 960 * 960 * 5 + 8 * 1024 ** 2 < $limiteBytes;
    }

    private static function reduzir(\GdImage $img, int $largura, bool $fundoBranco): \GdImage
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $k = min(1, $largura / max($w, 1));
        $nw = max(1, (int) round($w * $k));
        $nh = max(1, (int) round($h * $k));
        $dst = imagecreatetruecolor($nw, $nh);
        if ($fundoBranco) {
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        } else {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
        }
        imagecopyresampled($dst, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    /** Caminho público (sem barra inicial) de uma foto: banco de fotos do projeto ou envio do painel. */
    public static function url(string $foto, int $largura = 960, bool $so500 = false): string
    {
        if ($foto === '') return '';
        if (preg_match(self::PADRAO_CHAVE, $foto)) {
            $jpg = str_ends_with($foto, '-j');
            $base = $jpg ? substr($foto, 0, -2) : $foto;
            return 'uploads/' . $base . '-' . ($largura <= 500 ? 500 : 960) . ($jpg ? '.jpg' : '.webp');
        }
        if (preg_match('/^f\d{3,12}$/', $foto)) {
            $w = ($so500 || $largura <= 500) ? 500 : 960;
            return 'assets/img/photo-' . $foto . '-' . $w . '.webp';
        }
        return '';
    }

    public static function fotoValida(mixed $foto): string
    {
        if ($foto === '' || $foto === null) return '';
        if (is_string($foto) && (preg_match(self::PADRAO_CHAVE, $foto) || preg_match('/^f\d{3,12}$/', $foto))) return $foto;
        throw new Erro('Imagem inválida. Envie a imagem de novo.');
    }
}
