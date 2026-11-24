#!/usr/bin/env bash
# Regenera testes/fixture-demo.sql (banco de demonstração da bateria) a partir do banco local brasa_dev:
# estrutura de todas as tabelas, configurações e cardápio da loja-modelo. Sem pedidos, sem usuários reais e sem a logo.
# Inclui um segundo administrador fictício (u1), que as baterias usam para conferir que ninguém altera a conta dele.
# Uso: bash testes/gerar-fixture.sh   (precisa do MySQL local ligado)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$RAIZ/.ferramentas"
PHP="$T/php/php.exe"
D="$T/mysql/bin/mysqldump.exe --defaults-extra-file=$T/mysql-root.cnf -h 127.0.0.1 -P 3307 --skip-comments --skip-dump-date --single-transaction --set-gtid-purged=OFF --default-character-set=utf8mb4 brasa_dev"
F="$RAIZ/testes/fixture-demo.sql"
H="$("$PHP" -r 'echo password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);')"
{
  echo "-- Banco de demonstração para a bateria de conformidade (cardápio da loja-modelo, sem pedidos e sem usuários)."
  $D --no-data
  $D --no-create-info --skip-triggers --where="chave <> 'logo'" configuracoes
  $D --no-create-info --skip-triggers categorias produtos grupos cupons areas banners
  echo
  echo "-- outro administrador da loja-modelo (as baterias conferem que ninguém altera a conta dele); senha aleatória, ninguém entra com ela"
  echo "INSERT INTO \`usuarios\` (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES ('u1', 'Administrador Demonstração', 'admin@loja-demo.example', '$H', 'Administrador', '[\"pedidos\",\"produtos\",\"cupons\",\"areas\",\"banners\",\"configuracoes\",\"usuarios\"]', 'ativo', 1, 1763251200000);"
} > "$F"
# nenhum e-mail além dos de demonstração pode entrar no arquivo
if grep -oE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" "$F" | grep -vE "@(brasaburger\.com\.br|loja-demo\.example)$" | grep -q .; then
  echo "ERRO: o arquivo tem e-mail que não é de demonstração; confira o banco brasa_dev" >&2; rm -f "$F"; exit 1
fi
echo "Pronto: $F"
