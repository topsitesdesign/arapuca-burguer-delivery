-- Brasa Burger Co. · tabelas do sistema (MySQL 5.7+, MySQL 8 ou MariaDB 10.3+).
-- Valores em dinheiro ficam em centavos (INT). Datas e horas ficam em milissegundos desde 1970 (BIGINT, UTC).
-- O instalador roda este arquivo sozinho; não é preciso abrir o phpMyAdmin.

CREATE TABLE IF NOT EXISTS configuracoes (
  chave VARCHAR(40) NOT NULL,
  valor MEDIUMTEXT NOT NULL,
  atualizado_em BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id VARCHAR(60) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL,
  telefone VARCHAR(20) NOT NULL DEFAULT '',
  senha_hash VARCHAR(255) NOT NULL,
  funcao VARCHAR(20) NOT NULL,
  permissoes VARCHAR(255) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ativo',
  ultimo_acesso BIGINT NULL,
  ordem INT NOT NULL DEFAULT 0,
  criado_em BIGINT NOT NULL,
  totp_segredo VARCHAR(160) NULL,
  totp_ativo TINYINT(1) NOT NULL DEFAULT 0,
  totp_passo BIGINT NOT NULL DEFAULT 0,
  totp_recuperacao TEXT NULL,
  removido_em BIGINT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id VARCHAR(60) NOT NULL,
  nome VARCHAR(60) NOT NULL,
  descricao VARCHAR(200) NOT NULL DEFAULT '',
  icone VARCHAR(20) NOT NULL DEFAULT '',
  imagem VARCHAR(40) NOT NULL DEFAULT '',
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  especial TINYINT(1) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  arquivado_em BIGINT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS produtos (
  id VARCHAR(60) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  categoria_id VARCHAR(60) NOT NULL,
  preco INT NOT NULL,
  promo INT NULL,
  descricao VARCHAR(400) NOT NULL DEFAULT '',
  ingredientes TEXT NOT NULL,
  grupos TEXT NOT NULL,
  preparo SMALLINT NOT NULL DEFAULT 12,
  codigo VARCHAR(20) NOT NULL DEFAULT '',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  destaque TINYINT(1) NOT NULL DEFAULT 0,
  esgotado TINYINT(1) NOT NULL DEFAULT 0,
  foto VARCHAR(40) NOT NULL DEFAULT '',
  imagem VARCHAR(40) NOT NULL DEFAULT '',
  alt VARCHAR(200) NOT NULL DEFAULT '',
  selo VARCHAR(30) NOT NULL DEFAULT '',
  ordem INT NOT NULL DEFAULT 0,
  atualizado_em BIGINT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  arquivado_em BIGINT NULL,
  PRIMARY KEY (id),
  KEY ix_produtos_categoria (categoria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grupos (
  id VARCHAR(60) NOT NULL,
  nome VARCHAR(60) NOT NULL,
  obrigatorio TINYINT(1) NOT NULL DEFAULT 0,
  tipo VARCHAR(10) NOT NULL DEFAULT 'multiplo',
  min_escolhas TINYINT NOT NULL DEFAULT 0,
  max_escolhas TINYINT NOT NULL DEFAULT 1,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  opcoes TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  arquivado_em BIGINT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cupons (
  id VARCHAR(60) NOT NULL,
  codigo VARCHAR(30) NOT NULL,
  tipo VARCHAR(12) NOT NULL,
  valor INT NOT NULL DEFAULT 0,
  minimo INT NOT NULL DEFAULT 0,
  usos INT NOT NULL DEFAULT 0,
  limite INT NULL,
  por_cliente INT NOT NULL DEFAULT 1,
  inicio CHAR(10) NOT NULL DEFAULT '',
  validade CHAR(10) NOT NULL DEFAULT '',
  habilitado TINYINT(1) NOT NULL DEFAULT 1,
  descricao VARCHAR(200) NOT NULL DEFAULT '',
  ordem INT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  arquivado_em BIGINT NULL,
  PRIMARY KEY (id),
  KEY ix_cupons_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS areas (
  id VARCHAR(60) NOT NULL,
  nome VARCHAR(60) NOT NULL,
  taxa INT NOT NULL DEFAULT 0,
  tempo_extra SMALLINT NOT NULL DEFAULT 0,
  minimo INT NOT NULL DEFAULT 0,
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  cobertura VARCHAR(10) NOT NULL DEFAULT 'raio',
  cep_ini VARCHAR(9) NOT NULL DEFAULT '',
  cep_fim VARCHAR(9) NOT NULL DEFAULT '',
  raio DECIMAL(5,1) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 0,
  versao INT NOT NULL DEFAULT 1,
  arquivado_em BIGINT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS banners (
  id VARCHAR(60) NOT NULL,
  titulo VARCHAR(80) NOT NULL,
  texto VARCHAR(200) NOT NULL DEFAULT '',
  foto VARCHAR(40) NOT NULL DEFAULT '',
  imagem VARCHAR(40) NOT NULL DEFAULT '',
  destino VARCHAR(100) NOT NULL DEFAULT '',
  inicio CHAR(10) NOT NULL DEFAULT '',
  fim CHAR(10) NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'ativo',
  ordem INT NOT NULL DEFAULT 0,
  desktop TINYINT(1) NOT NULL DEFAULT 1,
  mobile TINYINT(1) NOT NULL DEFAULT 1,
  versao INT NOT NULL DEFAULT 1,
  arquivado_em BIGINT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pedidos (
  numero INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo CHAR(16) NOT NULL,
  chave_envio CHAR(32) NULL,
  status VARCHAR(12) NOT NULL,
  origem VARCHAR(10) NOT NULL DEFAULT 'site',
  cliente_nome VARCHAR(80) NOT NULL,
  cliente_telefone VARCHAR(11) NOT NULL,
  modalidade VARCHAR(10) NOT NULL,
  area_id VARCHAR(60) NULL,
  endereco TEXT NULL,
  itens MEDIUMTEXT NOT NULL,
  pagamento_forma VARCHAR(10) NOT NULL,
  troco_para INT NULL,
  cupom_codigo VARCHAR(30) NULL,
  subtotal INT NOT NULL,
  desconto INT NOT NULL DEFAULT 0,
  taxa INT NOT NULL DEFAULT 0,
  total INT NOT NULL,
  obs VARCHAR(300) NOT NULL DEFAULT '',
  prazo VARCHAR(30) NOT NULL DEFAULT '',
  agendado_para BIGINT NULL,
  usuario_id VARCHAR(60) NULL,
  criado_em BIGINT NOT NULL,
  atualizado_em BIGINT NOT NULL,
  rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pagamento_status VARCHAR(12) NOT NULL DEFAULT 'pendente',
  pagamento_valor INT NULL,
  pagamento_real VARCHAR(10) NULL,
  pagamento_entregador VARCHAR(60) NOT NULL DEFAULT '',
  pagamento_usuario VARCHAR(60) NULL,
  pagamento_em BIGINT NULL,
  pagamento_obs VARCHAR(120) NOT NULL DEFAULT '',
  anonimizado_em BIGINT NULL,
  assinatura CHAR(40) NULL,
  PRIMARY KEY (numero),
  UNIQUE KEY uq_pedidos_codigo (codigo),
  UNIQUE KEY uq_pedidos_chave (chave_envio),
  KEY ix_pedidos_criado (criado_em),
  KEY ix_pedidos_atualizado (atualizado_em),
  KEY ix_pedidos_status (status),
  KEY ix_pedidos_telefone (cliente_telefone),
  KEY ix_pedidos_rev (rev),
  KEY ix_pedidos_agendado (agendado_para),
  KEY ix_pedidos_pagamento (pagamento_em)
) ENGINE=InnoDB AUTO_INCREMENT=1001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pedido_eventos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_numero INT UNSIGNED NOT NULL,
  status VARCHAR(12) NOT NULL,
  motivo VARCHAR(120) NOT NULL DEFAULT '',
  usuario_id VARCHAR(60) NULL,
  em BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY ix_eventos_pedido (pedido_numero),
  CONSTRAINT fk_eventos_pedido FOREIGN KEY (pedido_numero) REFERENCES pedidos (numero) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cupom_usos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cupom_id VARCHAR(60) NOT NULL,
  telefone VARCHAR(11) NOT NULL,
  pedido_numero INT UNSIGNED NOT NULL,
  em BIGINT NOT NULL,
  endereco_chave CHAR(40) NOT NULL DEFAULT '',
  predio_chave CHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY ix_cupom_usos (cupom_id, telefone),
  KEY ix_usos_predio (cupom_id, predio_chave),
  CONSTRAINT fk_usos_pedido FOREIGN KEY (pedido_numero) REFERENCES pedidos (numero) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  icone VARCHAR(20) NOT NULL DEFAULT 'receipt',
  cor VARCHAR(10) NOT NULL DEFAULT '',
  titulo VARCHAR(120) NOT NULL,
  texto VARCHAR(200) NOT NULL DEFAULT '',
  rota VARCHAR(30) NOT NULL DEFAULT 'pedidos',
  pedido INT UNSIGNED NULL,
  lida TINYINT(1) NOT NULL DEFAULT 0,
  em BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notificacoes_em (em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tentativas (
  chave CHAR(40) NOT NULL,
  contador INT NOT NULL DEFAULT 0,
  inicio INT NOT NULL,
  PRIMARY KEY (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id VARCHAR(60) NULL,
  acao VARCHAR(40) NOT NULL,
  entidade VARCHAR(30) NOT NULL DEFAULT '',
  entidade_id VARCHAR(60) NOT NULL DEFAULT '',
  detalhes TEXT NULL,
  ip_hash CHAR(16) NOT NULL DEFAULT '',
  criado_em BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY ix_auditoria_criado (criado_em),
  KEY ix_auditoria_acao (acao, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- itens de cada pedido em tabela (relatórios por produto); o JSON em pedidos.itens continua como cópia fiel
CREATE TABLE IF NOT EXISTS pedido_itens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_numero INT UNSIGNED NOT NULL,
  linha SMALLINT NOT NULL DEFAULT 0,
  produto_id VARCHAR(60) NOT NULL DEFAULT '',
  nome VARCHAR(80) NOT NULL DEFAULT '',
  qtd SMALLINT NOT NULL DEFAULT 1,
  preco INT NOT NULL DEFAULT 0,
  adicionais INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  opcoes VARCHAR(400) NOT NULL DEFAULT '',
  obs VARCHAR(140) NOT NULL DEFAULT '',
  criado_em BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY ix_itens_pedido (pedido_numero),
  KEY ix_itens_produto (produto_id, criado_em),
  KEY ix_itens_criado (criado_em),
  CONSTRAINT fk_itens_pedido FOREIGN KEY (pedido_numero) REFERENCES pedidos (numero) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- revisão dos pedidos: o painel pergunta "o que mudou depois da revisão N" (a linha travada garante a ordem)
CREATE TABLE IF NOT EXISTS contadores (
  nome VARCHAR(20) NOT NULL,
  valor BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- números que não podem pedir pelo site (trote)
CREATE TABLE IF NOT EXISTS bloqueados (
  telefone VARCHAR(11) NOT NULL,
  motivo VARCHAR(120) NOT NULL DEFAULT '',
  usuario_id VARCHAR(60) NULL,
  criado_em BIGINT NOT NULL,
  PRIMARY KEY (telefone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
