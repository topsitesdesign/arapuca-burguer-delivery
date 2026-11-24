<?php
/* Preparação de cada requisição: fuso, carregamento das classes, configuração e tratamento de erros. */
declare(strict_types=1);
defined('BRASA') || exit;

const RAIZ = __DIR__ . '/..';
const APP = __DIR__;

date_default_timezone_set('America/Sao_Paulo');
mb_internal_encoding('UTF-8');

spl_autoload_register(static function (string $classe): void {
    if (!str_starts_with($classe, 'Brasa\\')) return;
    $nome = substr($classe, 6);
    foreach (['lib', 'servicos'] as $pasta) {
        $arquivo = APP . "/$pasta/$nome.php";
        if (is_file($arquivo)) { require $arquivo; return; }
    }
});

$arquivoConfig = APP . '/config.php';
define('CONFIG', is_file($arquivoConfig) ? (require $arquivoConfig) : null);
define('DEV', is_array(CONFIG) && (CONFIG['ambiente'] ?? 'producao') === 'desenvolvimento');

error_reporting(E_ALL);
ini_set('display_errors', '0');
// erros fatais (falta de memória, tempo esgotado) não passam pelos tratamentos abaixo: o PHP grava no registro do mês
if (!is_dir(RAIZ . '/storage/logs')) @mkdir(RAIZ . '/storage/logs', 0775, true);
ini_set('log_errors', '1');
ini_set('error_log', RAIZ . '/storage/logs/' . date('Y-m') . '.log');
register_shutdown_function(static function (): void {
    $e = error_get_last();
    if (!$e || !in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true) || headers_sent()) return;
    // no lugar de uma página em branco, a mesma mensagem simples dos outros erros
    $msg = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
    http_response_code(500);
    header('Cache-Control: no-store');
    if (Brasa\Http::ehApi()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'erro' => $msg], JSON_UNESCAPED_UNICODE);
        return;
    }
    header('Content-Type: text/html; charset=utf-8');
    echo Brasa\Http::paginaSimples('Algo deu errado', $msg, '/', 'Voltar ao início');
});

set_error_handler(static function (int $nivel, string $msg, string $arquivo, int $linha): bool {
    if (!(error_reporting() & $nivel)) return false;
    if (in_array($nivel, [E_DEPRECATED, E_USER_DEPRECATED], true)) {
        Brasa\Http::log("aviso: $msg em $arquivo:$linha");
        return true;
    }
    throw new ErrorException($msg, 0, $nivel, $arquivo, $linha);
});
set_exception_handler([Brasa\Http::class, 'falha']);
