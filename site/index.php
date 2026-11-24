<?php
/*
  Brasa Burger Co. — ponto de entrada único do site, do painel e da API.
  Na hospedagem, o Apache manda tudo para cá (ver .htaccess).
  No computador, o servidor embutido do PHP usa este arquivo como roteador.
*/
declare(strict_types=1);
define('BRASA', true);

if (PHP_SAPI === 'cli-server') {
    // desenvolvimento: arquivos estáticos saem direto; pastas internas e arquivos .php nunca
    $caminho = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $arquivo = realpath(__DIR__ . $caminho);
    $interno = (bool) preg_match('#^/(app|storage)(/|$)|/\.#', $caminho);
    if (!$interno && $arquivo && is_file($arquivo) && str_starts_with($arquivo, __DIR__) && !str_ends_with(strtolower($arquivo), '.php')) {
        return false;
    }
}

require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/rotas.php';
