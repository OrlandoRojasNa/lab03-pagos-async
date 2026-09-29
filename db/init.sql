-- Script de creación de las tablas del Taller N.º 3
-- Se ejecuta automáticamente la primera vez que arranca el contenedor de MySQL
-- (montado en /docker-entrypoint-initdb.d).

CREATE DATABASE IF NOT EXISTS pagos_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pagos_db;

CREATE TABLE IF NOT EXISTS pagos (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  referencia      VARCHAR(50)   NOT NULL,
  valor           DECIMAL(14,2) NOT NULL,
  medio           VARCHAR(30)   NOT NULL,
  fecha_registro  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  estado          ENUM('REGISTRADO', 'PROCESADO') NOT NULL DEFAULT 'REGISTRADO',
  PRIMARY KEY (id),
  UNIQUE KEY uq_pagos_referencia (referencia),
  KEY idx_pagos_estado (estado)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS procesamientos (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pago_id              INT UNSIGNED NOT NULL,
  fecha_toma           DATETIME(3)  NOT NULL,  -- hora en que el consumidor tomó el mensaje de la cola
  fecha_procesamiento  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resultado            VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_procesamientos_pago (pago_id),
  CONSTRAINT fk_procesamientos_pago FOREIGN KEY (pago_id) REFERENCES pagos (id)
) ENGINE = InnoDB;
