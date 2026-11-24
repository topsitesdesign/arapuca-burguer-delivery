#!/usr/bin/env bash
# Testes automáticos da versão Vercel (Node + Postgres), com as mesmas baterias da versão PHP, numa cópia isolada:
#  1) cria testes_vercel_tmp no Postgres local com a demonstração do modelo e os usuários de teste (testes/porte/preparar-banco.mjs)
#  2) sobe 4 servidores locais da versão Vercel (8101 a 8104), em modo produção, com as fotos em testes/tmp/site/uploads
#  3) roda as baterias: segurança, pedidos, troco, fase 2, ajustes, fase 1 e instalação nova pelo navegador
#  4) derruba os servidores e apaga o banco de testes (com --manter, ficam para investigar)
# Precisa do Postgres local ligado (.ferramentas/postgres, porta 5433). Uso: bash testes/rodar-vercel.sh [--manter]
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PSQL="$RAIZ/.ferramentas/postgres/bin/psql.exe -h 127.0.0.1 -p 5433 -U postgres -X -q -t -A"
PASTA="$RAIZ/testes/tmp"
BANCO=testes_vercel_tmp
MANTER=0
[ "${1:-}" = "--manter" ] && MANTER=1

parar_servidores() {
  powershell -NoProfile -Command "foreach (\$p in 8101,8102,8103,8104,8105,8106) { Get-NetTCPConnection -LocalPort \$p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -Confirm:\$false } }" || true
}
limpar() {
  parar_servidores
  if [ "$MANTER" != 1 ]; then
    $PSQL -d postgres -c "DROP DATABASE IF EXISTS $BANCO WITH (FORCE)" || true
    rm -rf "$PASTA/site" "$PASTA/cred.json"
    echo "== banco de testes apagado (os resultados ficam em testes/tmp/resultados-*.json)"
  else
    echo "== banco $BANCO mantido (apague com DROP DATABASE)"
  fi
}
trap limpar EXIT

mkdir -p "$PASTA"
parar_servidores
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $BANCO WITH (FORCE)"
$PSQL -d postgres -c "CREATE DATABASE $BANCO"
export DATABASE_URL="postgres://postgres@127.0.0.1:5433/$BANCO"
echo "== banco de testes (demonstração do modelo)"
(cd "$RAIZ" && node testes/porte/preparar-banco.mjs "$DATABASE_URL")

export TESTE_ALVO=vercel AMBIENTE=producao RAIZ_PROJETO="$RAIZ" UPLOADS_DIR="$PASTA/site/uploads"
export CHAVE_SISTEMA="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
rm -rf "$PASTA/site"; mkdir -p "$UPLOADS_DIR"

echo "== servidores 8101 a 8104"
for p in 8101 8102 8103 8104; do
  (cd "$RAIZ" && PORTA=$p exec node --import tsx servidor-local.ts > "$PASTA/servidor-$p.log" 2>&1) &
done
curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-connrefused http://127.0.0.1:8104/api/loja
for p in 8101 8102 8103; do curl -s -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:$p/api/loja; done

cd "$RAIZ/testes"
for t in t1-seguranca t2-pedidos t2b-troco t5-fase2 t6-extras t4-fase1 t7-instalacao-vercel; do
  $PSQL -d $BANCO -c "DELETE FROM tentativas"
  echo "== $t"
  node "$t.mjs" | grep -v '^PASSA' || true
done
echo "== sessão (INF-13): não se aplica à versão Vercel — as sessões ficam no banco, não em arquivos do PHP"
