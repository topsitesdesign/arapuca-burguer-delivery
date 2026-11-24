<?php
/* Cria usuários de teste SÓ no banco de testes (testes_brasa_tmp). As senhas são geradas aqui,
   gravadas em testes/tmp/cred.json (fora do Git) e nunca impressas. */
declare(strict_types=1);
define('BRASA', true);
$c = require __DIR__ . '/tmp/site/app/config.php';
if ($c['banco']['nome'] !== 'testes_brasa_tmp') { fwrite(STDERR, "banco errado\n"); exit(1); }
$b = $c['banco'];
$pdo = new PDO("mysql:host={$b['host']};port={$b['porta']};dbname={$b['nome']};charset=utf8mb4", $b['usuario'], $b['senha'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$todas = ['pedidos', 'produtos', 'cupons', 'areas', 'banners', 'configuracoes', 'usuarios'];
$usuarios = [
    'aud-admin'    => ['Auditoria Admin', 'Administrador', $todas],
    'aud-produtos' => ['Auditoria Cardapio', 'Atendente', ['produtos']],
    'aud-cozinha'  => ['Auditoria Cozinha', 'Cozinha', ['pedidos']],
    'aud-gerente'  => ['Auditoria Gerente', 'Gerente', ['pedidos', 'usuarios']],
];
$cred = [];
$i = 10;
foreach ($usuarios as $id => [$nome, $funcao, $perm]) {
    $senha = 'T' . bin2hex(random_bytes(9));
    $email = "$id@auditoria.example";
    $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
    $pdo->prepare('INSERT INTO usuarios (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$id, $nome, $email, password_hash($senha, PASSWORD_DEFAULT), $funcao, json_encode($perm), 'ativo', $i++, (int) (microtime(true) * 1000)]);
    $cred[$id] = ['email' => $email, 'senha' => $senha];
}
file_put_contents(__DIR__ . '/tmp/cred.json', json_encode($cred, JSON_PRETTY_PRINT));
echo 'usuários de teste criados: ', implode(', ', array_keys($cred)), PHP_EOL;
$ids = $pdo->query("SELECT id, funcao, permissoes FROM usuarios ORDER BY ordem")->fetchAll(PDO::FETCH_ASSOC);
foreach ($ids as $r) echo '  ', $r['id'], ' · ', $r['funcao'], ' · ', $r['permissoes'], PHP_EOL;
