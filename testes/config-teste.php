<?php
/* Projeto novo, ainda sem instalação local: cria a configuração da cópia de testes com o usuário do banco do .env
   (DB_HOST, DB_PORT, DB_USER, DB_PASS) e uma chave nova. O nome do banco é trocado depois pelo rodar.sh. */
declare(strict_types=1);
$c = [
    'banco' => ['host' => getenv('DB_HOST') ?: '127.0.0.1', 'porta' => (int) (getenv('DB_PORT') ?: 3307), 'nome' => '', 'usuario' => getenv('DB_USER') ?: 'brasa', 'senha' => (string) getenv('DB_PASS')],
    'chave' => bin2hex(random_bytes(32)), 'ambiente' => 'producao', 'instalado_em' => date('c'),
];
file_put_contents($argv[1], "<?php\ndefined('BRASA') || exit;\nreturn " . var_export($c, true) . ";\n");
