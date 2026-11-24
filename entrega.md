# Entrega · Arapuca Burguer (site de pedidos)

Gerado em 24/11/2026 com a skill delivery-master (mesmo sistema da Brasa/Top Sites, só com a identidade e os dados da Arapuca).
Feito pelo Claude Code a pedido da Top Sites. "Pendente" = ainda não feito; ao lado, quem faz.

## 1. Antes de publicar

- [ ] Ficha conferida pelo cliente (preços, adicionais, bairros, taxas, horários, contatos) · **pendente: cliente**. Arquivo: `ficha/cliente.json`
- [x] Projeto gerado com `--validar`: instalação de teste aprovada (42 de 42 produtos cotados, 5 bairros, horários "Todos os dias, 18h às 0h"). O único aviso do gerador (créditos das fotos) foi resolvido. · Claude, 24/11/2026
- [x] Bateria de conformidade: **280 conferências, 0 falhas** (t1 segurança 53, t2 pedidos e troco 74, t4 fase 1 38, t5 fase 2 92, t6 extras 17, t7 instalação nova 6) + teste da limpeza de sessões. · Claude, 24/11/2026
- [x] Conferência visual em 375 px e em desktop, num servidor local com dados de teste: topo, cardápio, modal com adicionais e combo (R$ 29,99 + 5,00 + 14,99 = R$ 49,98), sacola nas 4 etapas até o pedido nº 1001 (agendado, taxa da Madalena), acompanhamento, painel (entrar, pedido novo, aceitar, histórico, caixa, configurações). O aviso sonoro do painel não foi ouvido (o navegador só libera o som depois de um clique da pessoa). · Claude, 24/11/2026
- [x] Página de créditos só com as 43 fotos em uso (29 Unsplash, 14 Pexels, uso comercial gratuito). FAQ e textos do rodapé: são de funcionamento e saem dos dados da loja; nada de segmento precisou mudar. · Claude, 24/11/2026

### Dados provisórios ou a confirmar com o cliente

| Item | Como ficou | Onde muda |
|---|---|---|
| Bairros e taxas | **Fictícios** (pedido do usuário): Madalena R$ 5, Torre R$ 6, Ilha do Retiro R$ 6, Zumbi R$ 7, Prado R$ 7 | Painel › Áreas de entrega |
| E-mail da loja | Não informado: em branco (o painel pede um ao salvar Dados da loja) | Painel › Configurações › Dados da loja |
| Dias de funcionamento | Informado só "18:00 às 00:00": considerado todos os dias | Painel › Configurações › Horários |
| Bandeiras de cartão e chave Pix | Não informadas: em branco | Painel › Configurações › Formas de pagamento |
| Combo e adicionais | "Turbine seu burguer" (21 opções) e "Combo: batata e refri + R$ 14,99" ligados aos 7 itens de Hambúrgueres, inclusive a Baguete | Painel › Produtos |
| Espetinhos | Acompanhamentos (macaxeira, vinagrete, farofa, creme de alho, barbecue e alho torrado) escritos na descrição de cada espetinho, sem preço | Painel › Produtos |
| "Novidade" e "(novo)" | "Novidade" no começo da descrição da Baguete; "(novo)" no nome de Picles, Nutella, Ovo e Abacaxi grelhado | Painel › Produtos / Adicionais |
| Mais pedidos | Nenhum produto marcado como destaque (não informado); a seção fica escondida | Painel › Produtos › Destaque |
| Antárctica | Fotos: lata de Guaraná Antarctica; 1 litro e Zero com foto genérica de refrigerante | Painel › Produtos › Foto |
| Fotos | Provisórias (Unsplash/Pexels); trocar pelas fotos da casa | Painel › Produtos › Foto |
| Logo | Veio em JPG de 150 px; o fundo preto virou transparente. Pedir PNG/SVG maior para ficar nítida | Painel › Configurações › Dados da loja |
| Instagram @arapucaburguer | O modelo não tem campo de Instagram: não aparece no site | Fora do modelo (precisa de autorização) |

## 2. Infraestrutura só desta loja · pendente: Top Sites + cliente

- [ ] Banco de dados novo e exclusivo na hospedagem escolhida
- [ ] Hospedagem com plano que permite uso comercial (o InfinityFree e o Vercel Hobby não permitem)
- [ ] Domínio apontado e HTTPS ativo
- [ ] `app/config.php` criado pelo instalador deste site (nunca copiar de outro projeto)
- [ ] Credenciais guardadas pelo cliente ou num gerenciador de senhas (nunca no Git nem na conversa)

## 3. Instalação · pendente

- [ ] Gerar o pacote (`bash .ferramentas/empacotar.sh`), enviar o zip e abrir `/instalar` com o código do `COMO-PUBLICAR.txt`; depois, `/instalar` responde 404
- [ ] Conta do proprietário criada pelo dono, com a senha dele
- [ ] Verificação em duas etapas ativada pelo dono, com os códigos de recuperação guardados
- [ ] Configurações › Privacidade: encarregado de dados preenchido
- [ ] Bairros reais, taxas, horários, pagamentos e textos conferidos no painel
- [ ] Pedido de teste pelo celular: chegou com som, foi aceito e concluído; depois recusado com o motivo "teste" ou anotado no caixa como teste

## 4. Backup e restauração · pendente

- [ ] Rotina combinada (quem faz e quando), conforme o alvo de hospedagem
- [ ] Restauração testada uma vez num banco vazio
- [ ] Data do último backup e da restauração anotadas aqui

## 5. Depois de publicar · pendente

- [ ] Verificador externo apontando para `https://<domínio>/api/loja` (200), com aviso para quem dá suporte
- [ ] Registro de erros lido no primeiro dia de pedidos e depois toda semana
- [ ] Lojista sabe aceitar pedido, fechar o caixa, editar o cardápio e fazer o backup

## 6. Registro

- [x] `entrega.md`, `delivery-master.json` e `ficha/cliente.json` (com as logos) no Git, sem senhas. As fotos originais ficam em `ficha/fotos`, fora do Git. · Claude, 24/11/2026

## Ambiente local (só nesta máquina, fora do Git)

- PHP e MySQL: `.ferramentas/php` e `.ferramentas/mysql` são atalhos (junctions) para os do projeto da Brasa (`Downloads/brasa-burger/.ferramentas`); o MySQL local é o da porta 3307.
- Banco local desta loja: `arapuca_delivery_dev` (usuário `brasa`, senha no `.env`). Login local de teste do painel em `.ferramentas/admin-local.txt`.
- Servidor local: `.ferramentas/php/php.exe -S localhost:8020 -t site site/index.php` (a porta 8000 é a da Brasa).
- Sobras do projeto antigo: o banco `arapuca_dev` continua no MySQL local, e a pasta vazia `Downloads/site-arapuca-burguer` ainda existe (estava em uso por outro programa). Os arquivos antigos estão na Lixeira.
