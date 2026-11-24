#!/usr/bin/env bash
# Testes automáticos do sistema, numa cópia isolada: não toca no projeto, no banco brasa_dev nem no site no ar.
#  1) cria testes_brasa_tmp com a demonstração do modelo (testes/fixture-demo.sql) ou, com ORIGEM=<banco>, com uma cópia dele
#  2) copia site/ para testes/tmp/site em modo produção, apontando para o banco de testes
#  3) cria usuários de teste (senhas em testes/tmp/cred.json, nunca impressas) e sobe 4 servidores (8101 a 8104)
#  4) roda as baterias: segurança, pedidos, troco, fase 2, ajustes depois da fase 2, fase 1 e instalação nova
#     pelo navegador (nesta ordem), e o teste do aviso de limpeza de sessões (INF-13)
#  5) derruba os servidores e apaga a cópia e o banco de testes (com --manter, ficam para investigar)
# Precisa do MySQL local ligado (.ferramentas, porta 3307). Uso: bash testes/rodar.sh [--manter]
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$RAIZ/.ferramentas"
PHP="$T/php/php.exe"
MY="$T/mysql/bin/mysql.exe --defaults-extra-file=$T/mysql-root.cnf -h 127.0.0.1 -P 3307"
DUMP="$T/mysql/bin/mysqldump.exe --defaults-extra-file=$T/mysql-root.cnf -h 127.0.0.1 -P 3307"
PASTA="$RAIZ/testes/tmp"
BANCO=testes_brasa_tmp
MANTER=0
[ "${1:-}" = "--manter" ] && MANTER=1

parar_servidores() {
  powershell -NoProfile -Command "foreach (\$p in 8101,8102,8103,8104) { Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -Confirm:\$false } }" || true
}
limpar() {
  parar_servidores
  if [ "$MANTER" != 1 ]; then
    $MY -e "REVOKE ALL PRIVILEGES ON $BANCO.* FROM 'brasa'@'127.0.0.1'" 2>/dev/null || true
    $MY -e "DROP DATABASE IF EXISTS $BANCO" || true
    rm -rf "$PASTA/site" "$PASTA/cred.json" "$PASTA/backup.sql"
    echo "== cópia e banco de testes apagados (os resultados ficam em testes/tmp/resultados-*.json)"
  else
    echo "== cópia mantida em testes/tmp/site e banco $BANCO (apague com: bash testes/rodar.sh e Ctrl+C, ou DROP DATABASE)"
  fi
}
trap limpar EXIT

mkdir -p "$PASTA"
parar_servidores
$MY -e "DROP DATABASE IF EXISTS $BANCO" # sobra de uma rodada interrompida

# origem do banco de testes: a demonstração do modelo (padrão) ou, com ORIGEM=brasa_dev, uma cópia do banco local
if [ "${ORIGEM:-demo}" = demo ]; then
  echo "== banco de testes (demonstração do modelo)"
  cp "$RAIZ/testes/fixture-demo.sql" "$PASTA/backup.sql"
else
  echo "== banco de testes (cópia do $ORIGEM)"
  $DUMP --single-transaction --routines --triggers --hex-blob --default-character-set=utf8mb4 --set-gtid-purged=OFF "$ORIGEM" > "$PASTA/backup.sql"
fi
$MY -e "CREATE DATABASE $BANCO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
$MY "$BANCO" < "$PASTA/backup.sql"
$MY -e "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, CREATE TEMPORARY TABLES, LOCK TABLES ON $BANCO.* TO 'brasa'@'127.0.0.1'"

echo "== cópia do site em modo produção"
rm -rf "$PASTA/site"
cp -r "$RAIZ/site" "$PASTA/site"
rm -f "$PASTA/site/storage/logs/"*.log "$PASTA/site/storage/"*.json
if [ ! -f "$PASTA/site/app/config.php" ]; then
  # projeto novo, ainda sem instalação local: configuração de teste com o usuário do banco que está no .env
  set -a; . "$RAIZ/.env"; set +a
  "$PHP" "$RAIZ/testes/config-teste.php" "$PASTA/site/app/config.php"
fi
"$PHP" -r 'define("BRASA", 1); $f = $argv[1]; $c = require $f; $c["banco"]["nome"] = $argv[2]; $c["ambiente"] = "producao"; file_put_contents($f, "<?php\ndefined(\x27BRASA\x27) || exit;\nreturn " . var_export($c, true) . ";\n");' "$PASTA/site/app/config.php" "$BANCO"
"$PHP" "$RAIZ/testes/criar-usuarios.php" | head -1
$MY "$BANCO" -e "INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES ('proprietario', '\"aud-admin\"', 0) ON DUPLICATE KEY UPDATE valor = '\"aud-admin\"'"

echo "== servidores 8101 a 8104"
for p in 8101 8102 8103 8104; do
  (cd "$PASTA/site" && exec "$PHP" -S "127.0.0.1:$p" -t . index.php > /dev/null 2>&1) &
done
curl -s -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:8104/api/loja

cd "$RAIZ/testes"
for t in t1-seguranca t2-pedidos t2b-troco t5-fase2 t6-extras t4-fase1 t7-instalacao; do
  $MY "$BANCO" -e "DELETE FROM tentativas"
  echo "== $t"
  node "$t.mjs" | grep -v '^PASSA' || true
done
echo "== sessao-limpeza"
"$PHP" "$RAIZ/testes/sessao-limpeza.php" "$PASTA/site" || true
