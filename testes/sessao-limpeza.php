<?php
/*
  INF-13: a limpeza automática de sessões do PHP, quando não tem permissão na pasta das sessões (InfinityFree),
  solta um aviso dentro do session_start(). Esse aviso não pode derrubar a página; os outros avisos continuam virando erro.
  Uso: php testes/sessao-limpeza.php <pasta do site> [pasta-sem-listagem]
  Com o segundo argumento, usa o gravador de sessões de verdade (arquivos) numa pasta que não pode ser listada.
*/
declare(strict_types=1);
define('BRASA', 1);
$site = $argv[1] ?? (__DIR__ . '/../site');
require $site . '/app/bootstrap.php';
restore_exception_handler(); // aqui os erros aparecem no teste, não na página de erro
ob_start(); // as linhas do resultado saem no fim: com saída já enviada, o PHP não deixa trocar o gravador de sessões

$falhas = 0;
$conferir = static function (string $nome, bool $ok, string $detalhe = '') use (&$falhas): void {
    echo ($ok ? 'PASSA' : 'FALHA') . " | $nome" . ($detalhe !== '' ? " | $detalhe" : '') . "\n";
    if (!$ok) $falhas++;
};

/** Gravador de sessões falso: a limpeza solta o aviso que a gente escolher. */
final class SessaoFalsa implements SessionHandlerInterface
{
    public function __construct(private string $aviso) {}
    public function open(string $caminho, string $nome): bool { return true; }
    public function close(): bool { return true; }
    public function read(string $id): string|false { return ''; }
    public function write(string $id, string $dados): bool { return true; }
    public function destroy(string $id): bool { return true; }
    public function gc(int $max): int|false { trigger_error($this->aviso, E_USER_NOTICE); return 0; }
}

$abrir = static function (): ?Throwable {
    try { Brasa\Sessao::iniciar(); return null; } catch (Throwable $e) { return $e; } finally { if (session_status() === PHP_SESSION_ACTIVE) session_write_close(); }
};

ini_set('session.gc_probability', '1');
ini_set('session.gc_divisor', '1'); // a limpeza roda em toda abertura de sessão

if (isset($argv[2])) {
    ini_set('session.save_path', $argv[2]);
    $e = $abrir();
    $conferir('Gravador de verdade, pasta sem permissão de listar: a sessão abre sem erro', $e === null, $e ? $e->getMessage() : 'sem erro');
    exit($falhas ? 1 : 0);
}

session_set_save_handler(new SessaoFalsa('ps_files_cleanup_dir: opendir(/php_sessions) failed: Permission denied (13)'), true);
$e = $abrir();
$conferir('Aviso da limpeza de sessões não derruba a página', $e === null, $e ? $e->getMessage() : 'sem erro');

session_set_save_handler(new SessaoFalsa('outro aviso qualquer'), true);
$e = $abrir();
$conferir('Outro aviso continua virando erro', $e instanceof ErrorException, $e ? $e->getMessage() : 'nenhum erro');

$h = set_error_handler(null);
restore_error_handler();
$conferir('O tratamento de erros normal volta depois de abrir a sessão', $h !== null);
exit($falhas ? 1 : 0);
