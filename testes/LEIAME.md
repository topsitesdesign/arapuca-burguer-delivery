# Testes automáticos

Um comando roda tudo numa cópia isolada do site e de um banco de testes. Não mexe no projeto, no banco local `brasa_dev` nem no site no ar.

```bash
bash testes/rodar.sh
```

Precisa do MySQL local ligado (pasta `.ferramentas`, porta 3307). Com `--manter`, a cópia e o banco de testes ficam para investigar.

| Bateria | O que confere |
|---|---|
| `t1-seguranca.mjs` | Login, sessões, CSRF, permissões, SQL injection, XSS e envio de imagens |
| `t2-pedidos.mjs` | Cálculo no servidor, cupons, horários, envios simultâneos, acompanhamento e painel |
| `t2b-troco.mjs` | Pagamento em dinheiro com troco |
| `t5-fase2.mjs` | Fase 2: banco, revisão das novidades, pagamento, caixa, histórico, bloqueio, LGPD, duas etapas, edição simultânea e banco fora do ar |
| `t6-extras.mjs` | Depois da fase 2: banco versão 3, proteção contra robôs (prova de trabalho e campo escondido), pedido repetido e LGPD das chaves de endereço |
| `t4-fase1.mjs` | Fase 1: proprietário, avisos, limites, cupom, textos vindos do painel e registro de erros |
| `t7-instalacao.mjs` | Instalação nova pelo navegador (`/instalar`), numa cópia sem `app/config.php` com banco vazio próprio (`testes_brasa_inst`, porta 8105): regra de senha, instalação, `/instalar` some e o dono entra no painel |
| `sessao-limpeza.php` | INF-13: o aviso da limpeza de sessões do PHP (pasta sem permissão, como no InfinityFree) não derruba a página |

Os resultados ficam em `testes/tmp/resultados-*.json`. A pasta `testes/tmp` não vai para o Git.

Os pedidos de teste passam pela proteção contra robôs como o navegador: `post()` em `lib.mjs` pede o desafio e resolve a prova sozinho (com `semProva: true`, envia sem).

Regra: a bateria só está aprovada com **zero falhas**. Linhas "INFO" são informativas e não contam como falha.

O banco de testes vem de `testes/fixture-demo.sql` (cardápio da loja-modelo, sem pedidos e sem usuários reais). Para testar com uma cópia do banco local: `ORIGEM=brasa_dev bash testes/rodar.sh`. Num projeto novo, sem `app/config.php`, o `config-teste.php` monta a configuração da cópia com o usuário do banco do `.env`.

O cupom "uma vez por cliente" vale pelo WhatsApp e pelo endereço de entrega. Na retirada no balcão, sem endereço, quem trocar de número ainda consegue usar de novo: a loja vê a pessoa no balcão.
