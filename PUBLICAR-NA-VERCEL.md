# Publicar a Arapuca Burguer na Vercel + Supabase (planos grátis)

O site funciona igual à versão PHP: cardápio, sacola, pedidos, acompanhamento e painel `/admin`.
A diferença é só onde roda: as páginas e o painel saem da **Vercel** (função Node em `api/index.ts`)
e os dados ficam no **Supabase** (banco Postgres e as fotos enviadas pelo painel).

> **Atenção ao plano grátis da Vercel (Hobby): os termos permitem só uso pessoal, não comercial.**
> Um site de pedidos de uma loja é uso comercial. Para ficar dentro das regras, a loja precisa do
> plano Pro da Vercel (pago, por usuário/mês). O plano grátis do Supabase pode ser usado por loja.

Os dois segredos desta loja (`CHAVE_SISTEMA` e `CODIGO_INSTALACAO`) estão no arquivo
`COMO-PUBLICAR-VERCEL.txt`, que fica só neste computador (fora do Git). Nunca os cole em conversa ou e-mail.

## 1. Supabase (banco e fotos)

1. Crie uma conta em supabase.com e um projeto novo, **região South America (São Paulo)**.
   Guarde a senha do banco num gerenciador de senhas.
2. **Fotos do painel**: Storage › New bucket › nome `uploads`, marque **Public bucket**.
3. **Conexão do banco**: botão **Connect** › **Session pooler** › copie a URI
   (`postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`)
   e troque `[YOUR-PASSWORD]` pela senha. Use o *Session pooler*: a conexão direta só funciona em IPv6,
   que a Vercel não tem.
4. **Chaves da API**: Project Settings › API › copie a **Project URL** e a chave **service_role**
   (é secreta: vai só nas variáveis da Vercel).

As tabelas são criadas sozinhas na instalação (passo 3). Todas ficam com RLS ligado e sem políticas:
a API pública do Supabase não lê nada; só o servidor da loja, pela conexão do banco.

## 2. Vercel (site)

1. Suba esta pasta para um repositório no GitHub (o `.gitignore` já deixa de fora senhas, `node_modules`,
   `public/` e `.ferramentas/`).
2. Na Vercel: **Add New › Project** › importe o repositório. Não mude nada no build
   (o `vercel.json` já diz: `npm run build`, saída `public/`, função em São Paulo `gru1`).
3. Antes de publicar, em **Environment Variables**, cadastre (modelo em `.env.example`):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URI do Session pooler (passo 1.3) |
   | `CHAVE_SISTEMA` | do `COMO-PUBLICAR-VERCEL.txt` |
   | `CODIGO_INSTALACAO` | do `COMO-PUBLICAR-VERCEL.txt` |
   | `AMBIENTE` | `producao` |
   | `SUPABASE_URL` | Project URL (passo 1.4) |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (passo 1.4) |
   | `CONTATO_NOME` | `Arapuca Burguer` |
   | `CONTATO_WHATSAPP` | `(81) 98863-6739` |

4. **Deploy**. Depois, em Settings › Domains, ligue o domínio da loja (o HTTPS é automático).

## 3. Instalação (uma vez só)

1. Abra `https://<seu-domínio>/instalar`.
2. Digite o **código de instalação**, o nome e o e-mail do dono e uma senha forte (sem o nome da loja).
3. Pronto: o cardápio da Arapuca entra no banco e `/instalar` passa a responder 404.
4. Entre em `/admin` com o e-mail e a senha, ative a **verificação em duas etapas** e guarde os códigos de recuperação.
5. Confira no painel os bairros e taxas (hoje **fictícios**), horários, formas de pagamento e textos.
6. Faça um pedido de teste pelo celular e acompanhe até concluir.

Alternativa por linha de comando (do computador, com a `DATABASE_URL` do Supabase):
`SENHA_DONO=… DATABASE_URL=… CHAVE_SISTEMA=… npx tsx scripts/instalar.ts "Nome do dono" email@loja`.

## 4. Backup (o plano grátis do Supabase não faz)

Toda semana, de um computador com o Postgres instalado (ou `.ferramentas/postgres/bin` desta pasta):

```
pg_dump "<DATABASE_URL>?sslmode=require" --no-owner --no-privileges -Fc -n public -f arapuca-AAAA-MM-DD.dump
```

Guarde o arquivo fora do computador (Drive, por exemplo). Para restaurar num banco vazio:
`pg_restore --no-owner --no-privileges -d "<DATABASE_URL do banco novo>" arapuca-AAAA-MM-DD.dump`.
O aviso `schema "public" already exists` na restauração é normal e pode ser ignorado.
Teste a restauração uma vez e anote a data no `entrega.md`.

## 4b. Monitoramento (grátis)

- **Site fora do ar**: crie um monitor HTTP gratuito (UptimeRobot, Better Stack ou similar) para
  `https://<domínio>/api/loja`, a cada 5 minutos, com aviso por e-mail ou Telegram. Ele também evita
  que o Supabase grátis pause por falta de acesso.
- **Erros do sistema**: Vercel › Project › **Logs** (filtre por "Error"). Leia no primeiro dia de pedidos e depois toda semana.
- **Google**: no Search Console, adicione o domínio e envie `https://<domínio>/sitemap.xml`.

## 5. Limites dos planos grátis (para não ter surpresa)

- **Supabase pausa o projeto depois de 7 dias sem nenhum acesso.** Com pedidos todo dia, não acontece;
  se a loja parar (férias), entre no painel do Supabase e clique em *Restore*. Um verificador externo
  chamando `https://<domínio>/api/loja` a cada poucos minutos também mantém o projeto ativo e avisa se cair.
- Banco: 500 MB; fotos: 1 GB. Sobra para anos de pedidos de uma loja.
- **Fotos enviadas pelo painel**: a Vercel aceita no máximo 4,5 MB por envio. Fotos de celular maiores
  que ~3 MB podem ser recusadas; reduza antes (ou envie em JPG).
- Se o banco cair, o site mostra o aviso com o botão do WhatsApp (por isso `CONTATO_WHATSAPP`).
- Registro de erros: Vercel › Project › **Logs** (o PHP gravava em `storage/logs`).

## 6. Rodar no computador (desenvolvimento)

```
npm install
npm run local        # precisa de DATABASE_URL, CHAVE_SISTEMA etc. no ambiente; porta 8020
bash testes/rodar-vercel.sh   # bateria completa contra um Postgres local (porta 5433)
```
