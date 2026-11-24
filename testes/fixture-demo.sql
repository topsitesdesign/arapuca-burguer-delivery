-- Banco de demonstração para a bateria de conformidade (cardápio da loja-modelo, sem pedidos e sem usuários).

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `areas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `areas` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `taxa` int NOT NULL DEFAULT '0',
  `tempo_extra` smallint NOT NULL DEFAULT '0',
  `minimo` int NOT NULL DEFAULT '0',
  `ativa` tinyint(1) NOT NULL DEFAULT '1',
  `cobertura` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'raio',
  `cep_ini` varchar(9) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cep_fim` varchar(9) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `raio` decimal(5,1) NOT NULL DEFAULT '0.0',
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `acao` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entidade` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `entidade_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `detalhes` text COLLATE utf8mb4_unicode_ci,
  `ip_hash` char(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `criado_em` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_auditoria_criado` (`criado_em`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `banners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `banners` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `texto` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `foto` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `imagem` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `destino` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `inicio` char(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `fim` char(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ativo',
  `ordem` int NOT NULL DEFAULT '0',
  `desktop` tinyint(1) NOT NULL DEFAULT '1',
  `mobile` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `categorias`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categorias` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `icone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `imagem` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ativa` tinyint(1) NOT NULL DEFAULT '1',
  `especial` tinyint(1) NOT NULL DEFAULT '0',
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `configuracoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracoes` (
  `chave` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `atualizado_em` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cupom_usos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupom_usos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cupom_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefone` varchar(11) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pedido_numero` int unsigned NOT NULL,
  `em` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_cupom_usos` (`cupom_id`,`telefone`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cupons` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `codigo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` int NOT NULL DEFAULT '0',
  `minimo` int NOT NULL DEFAULT '0',
  `usos` int NOT NULL DEFAULT '0',
  `limite` int DEFAULT NULL,
  `por_cliente` int NOT NULL DEFAULT '1',
  `inicio` char(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `validade` char(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `habilitado` tinyint(1) NOT NULL DEFAULT '1',
  `descricao` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cupons_codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `grupos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grupos` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `obrigatorio` tinyint(1) NOT NULL DEFAULT '0',
  `tipo` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'multiplo',
  `min_escolhas` tinyint NOT NULL DEFAULT '0',
  `max_escolhas` tinyint NOT NULL DEFAULT '1',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `opcoes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notificacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificacoes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `icone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'receipt',
  `cor` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `titulo` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `texto` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `rota` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pedidos',
  `pedido` int unsigned DEFAULT NULL,
  `lida` tinyint(1) NOT NULL DEFAULT '0',
  `em` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_notificacoes_em` (`em`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pedido_eventos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedido_eventos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pedido_numero` int unsigned NOT NULL,
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `motivo` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `usuario_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `em` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_eventos_pedido` (`pedido_numero`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pedidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pedidos` (
  `numero` int unsigned NOT NULL AUTO_INCREMENT,
  `codigo` char(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chave_envio` char(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `origem` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'site',
  `cliente_nome` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cliente_telefone` varchar(11) COLLATE utf8mb4_unicode_ci NOT NULL,
  `modalidade` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `area_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `endereco` text COLLATE utf8mb4_unicode_ci,
  `itens` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `pagamento_forma` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `troco_para` int DEFAULT NULL,
  `cupom_codigo` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtotal` int NOT NULL,
  `desconto` int NOT NULL DEFAULT '0',
  `taxa` int NOT NULL DEFAULT '0',
  `total` int NOT NULL,
  `obs` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `prazo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `agendado_para` bigint DEFAULT NULL,
  `usuario_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criado_em` bigint NOT NULL,
  `atualizado_em` bigint NOT NULL,
  PRIMARY KEY (`numero`),
  UNIQUE KEY `uq_pedidos_codigo` (`codigo`),
  UNIQUE KEY `uq_pedidos_chave` (`chave_envio`),
  KEY `ix_pedidos_criado` (`criado_em`),
  KEY `ix_pedidos_atualizado` (`atualizado_em`),
  KEY `ix_pedidos_status` (`status`),
  KEY `ix_pedidos_telefone` (`cliente_telefone`)
) ENGINE=InnoDB AUTO_INCREMENT=1007 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `produtos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `produtos` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `categoria_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `preco` int NOT NULL,
  `promo` int DEFAULT NULL,
  `descricao` varchar(400) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ingredientes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `grupos` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `preparo` smallint NOT NULL DEFAULT '12',
  `codigo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `destaque` tinyint(1) NOT NULL DEFAULT '0',
  `esgotado` tinyint(1) NOT NULL DEFAULT '0',
  `foto` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `imagem` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `alt` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `selo` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ordem` int NOT NULL DEFAULT '0',
  `atualizado_em` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `ix_produtos_categoria` (`categoria_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tentativas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tentativas` (
  `chave` char(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contador` int NOT NULL DEFAULT '0',
  `inicio` int NOT NULL,
  PRIMARY KEY (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nome` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `senha_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `funcao` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permissoes` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ativo',
  `ultimo_acesso` bigint DEFAULT NULL,
  `ordem` int NOT NULL DEFAULT '0',
  `criado_em` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `configuracoes` WRITE;
/*!40000 ALTER TABLE `configuracoes` DISABLE KEYS */;
INSERT INTO `configuracoes` VALUES ('entrega','{\"entrega\":true,\"retirada\":true,\"prazoEntrega\":\"30–45 min\",\"prazoRetirada\":\"20–30 min\",\"orientacoes\":\"Retire no balcão da Rua das Brasas, 147. Diga o número do pedido ao atendente.\"}',1794764584126),('excecoes','[{\"id\":\"e1\",\"data\":\"2026-12-24\",\"descricao\":\"Véspera de Natal\",\"tipo\":\"especial\",\"abre\":\"18:00\",\"fecha\":\"22:00\"},{\"id\":\"e2\",\"data\":\"2026-12-25\",\"descricao\":\"Natal\",\"tipo\":\"fechado\",\"abre\":\"\",\"fecha\":\"\"},{\"id\":\"e3\",\"data\":\"2026-12-31\",\"descricao\":\"Réveillon\",\"tipo\":\"especial\",\"abre\":\"18:00\",\"fecha\":\"21:00\"}]',1794764584126),('horarios','[{\"dia\":\"Segunda\",\"aberto\":false,\"abre\":\"18:00\",\"fecha\":\"23:30\"},{\"dia\":\"Terça\",\"aberto\":true,\"abre\":\"18:00\",\"fecha\":\"23:30\"},{\"dia\":\"Quarta\",\"aberto\":true,\"abre\":\"18:00\",\"fecha\":\"23:30\"},{\"dia\":\"Quinta\",\"aberto\":true,\"abre\":\"18:00\",\"fecha\":\"23:30\"},{\"dia\":\"Sexta\",\"aberto\":true,\"abre\":\"18:00\",\"fecha\":\"23:30\"},{\"dia\":\"Sábado\",\"aberto\":true,\"abre\":\"18:00\",\"fecha\":\"23:30\"},{\"dia\":\"Domingo\",\"aberto\":true,\"abre\":\"18:00\",\"fecha\":\"23:30\"}]',1794764584126),('loja','{\"nome\":\"Brasa Burger Co.\",\"razao\":\"\",\"cnpj\":\"\",\"telefone\":\"\",\"whatsapp\":\"(11) 99999-2026\",\"email\":\"contato@brasaburger.com.br\",\"cep\":\"01010-000\",\"rua\":\"Rua das Brasas\",\"numero\":\"147\",\"bairro\":\"Centro\",\"cidade\":\"São Paulo\",\"uf\":\"SP\"}',1794764584124),('notif','{\"som\":true,\"visual\":true,\"whatsapp\":false,\"whatsappNumero\":\"\",\"email\":false,\"emailEndereco\":\"\",\"resumo\":false}',1794764584127),('operacao','{\"aberta\":true,\"pausada\":false,\"motivo\":\"\",\"pausaAte\":null,\"tempoMin\":30,\"tempoMax\":45,\"pedidoMinimo\":0,\"fecha\":\"23:30\",\"tempoPreparo\":18}',1794764704378),('pagamentos','{\"pix\":true,\"chavePix\":\"\",\"credito\":true,\"debito\":true,\"bandeiras\":[\"Visa\",\"Mastercard\",\"Elo\",\"Hipercard\",\"American Express\"],\"dinheiro\":true,\"troco\":true,\"naEntrega\":true,\"online\":false}',1794764584126);
/*!40000 ALTER TABLE `configuracoes` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `categorias` WRITE;
/*!40000 ALTER TABLE `categorias` DISABLE KEYS */;
INSERT INTO `categorias` VALUES ('bebidas','Bebidas','Refrigerantes, sucos e limonada.','cup','',1,0,4),('combos','Combos','Burger, acompanhamento e bebida.','gift','',1,0,2),('hamburgueres','Burgers','Burgers artesanais na brasa.','burger','',1,0,1),('madrugada','Madrugada','Cardápio reduzido de sexta e sábado depois das 23h.','moon','',0,0,6),('mais-pedidos','Mais pedidos','Aparece no topo do cardápio com os produtos marcados como destaque.','star','',1,1,0),('porcoes','Acompanhamentos','Para dividir na mesa.','utensils','',1,0,3),('sobremesas','Sobremesas','Para fechar a noite.','ice-cream','',1,0,5);
/*!40000 ALTER TABLE `categorias` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `produtos` WRITE;
/*!40000 ALTER TABLE `produtos` DISABLE KEYS */;
INSERT INTO `produtos` VALUES ('batata-brasa','Batata Brasa','porcoes',2490,NULL,'Porção de batata frita crocante com páprica defumada, salsinha e maionese da casa.','[\"Batata frita\",\"Páprica defumada\",\"Salsinha\",\"Maionese da casa\"]','[\"g-coberturas\",\"g-molhos\"]',10,'PC-001',1,1,0,'f77734689','','Batatas fritas douradas com salsinha picada numa cesta','Para dividir',10,1794802529276),('brasa-bacon','Brasa Bacon','hamburgueres',3890,NULL,'Blend de 180 g, cheddar inglês, bacon em fatias grossas e cebola caramelizada no brioche.','[\"Pão brioche\",\"Blend bovino de 180 g\",\"Cheddar inglês\",\"Bacon\",\"Cebola caramelizada\",\"Maionese defumada\"]','[\"g-ponto\",\"g-molhos\",\"g-extras\",\"g-retirar\"]',14,'HB-001',1,1,0,'f147734270','','Burger alto com bacon e cheddar sobre uma frigideira de batatas','Mais pedido',0,1794802529276),('brasa-salad','Brasa Salad','hamburgueres',3190,NULL,'Blend de 150 g, cheddar, alface, tomate, cebola roxa e picles no pão com gergelim.','[\"Pão com gergelim\",\"Blend bovino de 150 g\",\"Cheddar\",\"Alface\",\"Tomate\",\"Cebola roxa\",\"Picles\"]','[\"g-ponto\",\"g-molhos\",\"g-retirar\"]',12,'HB-007',1,0,0,'f156680466','','Burger com cheddar, tomate, cebola roxa, picles e alface numa tábua de madeira','',6,1794802529276),('brownie','Brownie com sorvete','sobremesas',1990,NULL,'Brownie com nozes, sorvete e calda de chocolate.','[\"Brownie com nozes\",\"Sorvete\",\"Calda de chocolate\",\"Gotas de chocolate\"]','[\"g-sorvete\"]',6,'SM-002',1,0,0,'f40894645','','Brownie com sorvete de creme, calda e gotas de chocolate num prato branco','',16,1794802529276),('burger-costela','Burger de Costela','hamburgueres',4290,NULL,'Blend de costela de 180 g, queijo prato, picles e mostarda da casa no pão de batata.','[\"Pão de batata\",\"Blend de costela de 180 g\",\"Queijo prato\",\"Picles\",\"Cebola\",\"Mostarda da casa\"]','[\"g-ponto\",\"g-molhos\",\"g-extras\",\"g-retirar\"]',15,'HB-003',1,1,0,'f23107448','','Close de um blend grosso e tostado com picles e mostarda em grão','Chef indica',2,1794802529276),('cha-gelado','Chá gelado 400 ml','bebidas',990,NULL,'Chá preto gelado da casa, com um toque de limão.','[\"Chá preto\",\"Limão\",\"Gelo\",\"Açúcar\"]','[]',2,'BB-004',1,0,0,'f1752757','','Copo de chá gelado com cubos de gelo','',15,1794802529276),('churros','Churros com chocolate','sobremesas',1890,NULL,'Seis churros com canela e chocolate quente para mergulhar.','[\"Seis churros\",\"Açúcar e canela\",\"Chocolate quente\"]','[]',8,'SM-003',1,0,0,'f104342321','','Churros num prato entre duas xícaras de chocolate quente sobre granito escuro','',18,1794802529276),('combo-brasa-bacon','Combo Brasa Bacon','combos',5290,NULL,'Brasa Bacon, batata individual e uma bebida.','[\"Brasa Bacon\",\"Batata frita individual\",\"Bebida à escolha\"]','[\"g-ponto\",\"g-bebida-combo\",\"g-retirar\"]',16,'CB-002',1,1,0,'f114142453','','Burger com queijo derretido e rúcula ao lado de um copo de batatas fritas','Combo',7,1794802529276),('combo-casal','Combo Casal','combos',8990,NULL,'Dois burgers à escolha, uma Batata Brasa e dois refrigerantes.','[\"Dois burgers à escolha\",\"Batata Brasa\",\"Dois refrigerantes\"]','[\"g-burger-1\",\"g-burger-2\",\"g-ponto\",\"g-refri-casal\",\"g-retirar\"]',20,'CB-001',1,1,0,'f110946649','','Dois burgers de carne desfiada com salada de repolho e batatas fritas numa tábua','Para dois',9,1794802529276),('combo-x-bacon','Combo X-Bacon','combos',4490,NULL,'X-Bacon da Brasa, batata individual e uma bebida.','[\"X-Bacon da Brasa\",\"Batata frita individual\",\"Bebida à escolha\"]','[\"g-ponto\",\"g-bebida-combo\",\"g-retirar\"]',15,'CB-003',1,0,0,'f99420479','','Burger com cheddar escorrendo ao lado de batatas fritas num prato de cerâmica','',8,1794802529276),('duplo-cheddar','Duplo Cheddar','hamburgueres',3690,NULL,'Dois smash de 90 g, cheddar duplo derretido, picles e molho da casa.','[\"Pão brioche\",\"Dois smash de 90 g\",\"Cheddar duplo\",\"Picles\",\"Molho da casa\"]','[\"g-ponto\",\"g-molhos\",\"g-extras\",\"g-retirar\"]',12,'HB-002',1,1,0,'f128651191','','Burger duplo com cheddar derretido','Novo',1,1794802529276),('frango-crocante','Frango Crocante','hamburgueres',3490,NULL,'Sobrecoxa empanada e crocante, alface, tomate e maionese de ervas.','[\"Pão com gergelim\",\"Sobrecoxa empanada\",\"Alface\",\"Tomate\",\"Maionese de ervas\"]','[\"g-molhos\",\"g-extras\",\"g-retirar\"]',13,'HB-004',1,0,0,'f44318494','','Burger de frango empanado com alface e tomate','',3,1794802529276),('limonada','Limonada 400 ml','bebidas',1090,NULL,'Limão, água com gás e bastante gelo.','[\"Limão\",\"Água com gás\",\"Gelo\",\"Açúcar\"]','[]',3,'BB-003',1,0,0,'f110878390','','Copo de limonada com gelo e fatia de limão visto de cima','',14,1794802529276),('milkshake','Milkshake de doce de leite','sobremesas',2290,NULL,'Doce de leite, sorvete de creme e chantilly, 400 ml.','[\"Sorvete de creme\",\"Doce de leite\",\"Chantilly\",\"Canela\"]','[]',5,'SM-001',1,0,0,'f18147226','','Milkshake claro com chantilly e canela visto de cima','',17,1794802529276),('onion-rings','Onion Rings','porcoes',2190,NULL,'Anéis de cebola empanados, com molho barbecue da casa.','[\"Cebola\",\"Empanamento crocante\",\"Barbecue da casa\"]','[\"g-molhos\"]',9,'PC-002',1,0,1,'f126140604','','Anéis de cebola empanados e dourados','',11,1794802529276),('refrigerante','Refrigerante 350 ml','bebidas',790,NULL,'Lata servida com copo, gelo e limão.','[\"Lata de 350 ml\",\"Copo com gelo e limão\"]','[\"g-sabor\"]',1,'BB-001',1,0,0,'f803062','','Copo de refrigerante de cola com gelo e rodela de limão','',12,1794802529276),('smash-classico','Smash Clássico','hamburgueres',2990,2690,'Smash de 120 g, queijo americano, cebola e ketchup da casa.','[\"Pão brioche\",\"Smash de 120 g\",\"Queijo americano\",\"Cebola\",\"Ketchup da casa\"]','[\"g-ponto\",\"g-molhos\",\"g-extras\",\"g-retirar\"]',10,'HB-005',1,0,0,'f128651190','','Smash burger com queijo americano derretido','',4,1794802529276),('suco-laranja','Suco de laranja 400 ml','bebidas',1190,NULL,'Suco natural de laranja, sem açúcar.','[\"Laranja\",\"Gelo\"]','[]',4,'BB-002',1,0,0,'f50351192','','Copo de suco de laranja visto de cima sobre uma tábua de madeira','',13,1794802529276),('x-bacon-brasa','X-Bacon da Brasa','hamburgueres',3290,NULL,'Blend de 150 g, queijo derretido, bacon crocante, alface, tomate e maionese da casa.','[\"Pão com gergelim\",\"Blend bovino de 150 g\",\"Queijo\",\"Bacon\",\"Alface\",\"Tomate\",\"Maionese da casa\"]','[\"g-ponto\",\"g-molhos\",\"g-extras\",\"g-retirar\"]',12,'HB-006',1,1,0,'f50799547','','Burger aberto com bacon crocante e queijo derretido sobre papel','Clássico',5,1794802529276);
/*!40000 ALTER TABLE `produtos` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `grupos` WRITE;
/*!40000 ALTER TABLE `grupos` DISABLE KEYS */;
INSERT INTO `grupos` VALUES ('g-bebida-combo','Bebida do combo',1,'unico',1,1,1,'[{\"nome\":\"Refrigerante cola\",\"preco\":0},{\"nome\":\"Refrigerante guaraná\",\"preco\":0},{\"nome\":\"Limonada\",\"preco\":300},{\"nome\":\"Suco de laranja\",\"preco\":400}]',1),('g-burger-1','Primeiro burger',1,'unico',1,1,1,'[{\"nome\":\"X-Bacon da Brasa\",\"preco\":0},{\"nome\":\"Brasa Salad\",\"preco\":0},{\"nome\":\"Brasa Bacon\",\"preco\":500},{\"nome\":\"Burger de Costela\",\"preco\":900}]',2),('g-burger-2','Segundo burger',1,'unico',1,1,1,'[{\"nome\":\"X-Bacon da Brasa\",\"preco\":0},{\"nome\":\"Brasa Salad\",\"preco\":0},{\"nome\":\"Brasa Bacon\",\"preco\":500},{\"nome\":\"Burger de Costela\",\"preco\":900}]',3),('g-coberturas','Coberturas',0,'multiplo',0,2,1,'[{\"nome\":\"Cheddar cremoso\",\"preco\":590},{\"nome\":\"Bacon em cubos\",\"preco\":690}]',8),('g-extras','Adicionais',0,'multiplo',0,3,1,'[{\"nome\":\"Bacon extra\",\"preco\":690},{\"nome\":\"Cheddar inglês\",\"preco\":490},{\"nome\":\"Cebola caramelizada\",\"preco\":390},{\"nome\":\"Ovo\",\"preco\":390},{\"nome\":\"Blend extra de 150 g\",\"preco\":1290}]',6),('g-molhos','Molhos',0,'multiplo',0,2,1,'[{\"nome\":\"Maionese defumada\",\"preco\":0},{\"nome\":\"Barbecue da casa\",\"preco\":200},{\"nome\":\"Mostarda e mel\",\"preco\":200},{\"nome\":\"Cheddar cremoso\",\"preco\":490}]',5),('g-ponto','Ponto da carne',1,'unico',1,1,1,'[{\"nome\":\"Ao ponto\",\"preco\":0},{\"nome\":\"Mal passado\",\"preco\":0},{\"nome\":\"Bem passado\",\"preco\":0}]',0),('g-refri-casal','Refrigerantes',1,'unico',1,1,1,'[{\"nome\":\"Dois cola\",\"preco\":0},{\"nome\":\"Dois guaraná\",\"preco\":0},{\"nome\":\"Um cola e um guaraná\",\"preco\":0}]',4),('g-retirar','Retirar ingredientes',0,'multiplo',0,5,1,'[{\"nome\":\"Sem cebola\",\"preco\":0},{\"nome\":\"Sem picles\",\"preco\":0},{\"nome\":\"Sem tomate\",\"preco\":0},{\"nome\":\"Sem alface\",\"preco\":0},{\"nome\":\"Sem molho\",\"preco\":0}]',7),('g-sabor','Sabor',1,'unico',1,1,1,'[{\"nome\":\"Cola\",\"preco\":0},{\"nome\":\"Guaraná\",\"preco\":0},{\"nome\":\"Laranja\",\"preco\":0},{\"nome\":\"Limão\",\"preco\":0}]',9),('g-sorvete','Sorvete',1,'unico',1,1,1,'[{\"nome\":\"Creme\",\"preco\":0},{\"nome\":\"Doce de leite\",\"preco\":0}]',10);
/*!40000 ALTER TABLE `grupos` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `cupons` WRITE;
/*!40000 ALTER TABLE `cupons` DISABLE KEYS */;
INSERT INTO `cupons` VALUES ('c1','BRASA15','percentual',15,0,3,NULL,1,'2026-11-15','2027-11-15',1,'Cupom de boas-vindas do site: 15% nos produtos, uma vez por WhatsApp.',0);
/*!40000 ALTER TABLE `cupons` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `areas` WRITE;
/*!40000 ALTER TABLE `areas` DISABLE KEYS */;
INSERT INTO `areas` VALUES ('centro','Centro',750,0,0,1,'raio','','',2.0,0),('jardins','Jardins',890,10,0,1,'raio','','',4.0,1),('vila-nova','Vila Nova',590,5,0,1,'raio','','',3.5,2);
/*!40000 ALTER TABLE `areas` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `banners` WRITE;
/*!40000 ALTER TABLE `banners` DISABLE KEYS */;
INSERT INTO `banners` VALUES ('b1','Cupom BRASA15','15% de desconto nos produtos no seu primeiro pedido pelo site.','f147734270','','cupom:BRASA15','2026-11-15','2027-01-14','ativo',0,1,1);
/*!40000 ALTER TABLE `banners` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


-- outro administrador da loja-modelo (as baterias conferem que ninguém altera a conta dele); senha aleatória, ninguém entra com ela
INSERT INTO `usuarios` (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES ('u1', 'Administrador Demonstração', 'admin@loja-demo.example', '$2y$12$KsAZHAY.vsI/7esbUA6GE.tMV8ZigULUUdmnwrIu9KoBZ2fiJtD6a', 'Administrador', '["pedidos","produtos","cupons","areas","banners","configuracoes","usuarios"]', 'ativo', 1, 1763251200000);
