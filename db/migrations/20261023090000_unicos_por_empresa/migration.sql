-- SL-17 T3.9 — LOS UNICOS DE NEGOCIO QUE CHOCABAN ENTRE EMPRESAS PASAN A SER POR EMPRESA.
--
-- Auditoria (77 unicos de las 73 tablas de negocio, ninguno es CONSTRAINT: todos son indices
-- UNIQUE). Solo cambian los que pueden repetirse entre dos empresas legitimas: los que NO cuelgan
-- de una fila de negocio (codigos, nombres de catalogo propio, posiciones, fechas del ranking,
-- claves de idempotencia y de dedupe). Los que llevan una FK a una fila de negocio (`cierre_id`,
-- `usuario_id`, `gestion_id`...) ya son por empresa: esa fila es de UNA empresa y M3 impide
-- mezclarlas. Los globales a proposito (email, cedula, num_guia, hash de la api key, ids de
-- Meta, endpoint de push) siguen igual. La tabla completa vive en `progress/impl_SL-17.md`.
--
-- POR QUE SE CONSERVA CADA NOMBRE: los repositorios reconocen el P2002 por el nombre del indice
-- (`textoConstraintP2002`: bajo el driver adapter es lo unico que llega). Con otro nombre, un
-- duplicado volveria a salir como 500. `organizacion_id` va PRIMERA: tambien sirve de indice a
-- las lecturas, que siempre llevan la empresa.
--
-- Los parciales (WHERE) no los expresa Prisma: viven solo aqui, como antes.
--
-- Ninguna secuencia cambia (SL-18). `orden.num_guia` sigue global por el rastreo publico.

BEGIN;

-- Claves de idempotencia del cliente: la misma clave en dos empresas son dos operaciones.
DROP INDEX "abono_tienda_clave_idempotencia_key";
CREATE UNIQUE INDEX "abono_tienda_clave_idempotencia_key"
  ON "abono_tienda" ("organizacion_id", "clave_idempotencia");

DROP INDEX "aporte_capital_clave_idempotencia_key";
CREATE UNIQUE INDEX "aporte_capital_clave_idempotencia_key"
  ON "aporte_capital" ("organizacion_id", "clave_idempotencia");

DROP INDEX "liquidacion_pago_clave_idempotencia_key";
CREATE UNIQUE INDEX "liquidacion_pago_clave_idempotencia_key"
  ON "liquidacion_pago" ("organizacion_id", "clave_idempotencia");

DROP INDEX "liquidacion_reparto_clave_idempotencia_key";
CREATE UNIQUE INDEX "liquidacion_reparto_clave_idempotencia_key"
  ON "liquidacion_reparto" ("organizacion_id", "clave_idempotencia");

DROP INDEX "pago_por_cuenta_tienda_clave_idempotencia_key";
CREATE UNIQUE INDEX "pago_por_cuenta_tienda_clave_idempotencia_key"
  ON "pago_por_cuenta_tienda" ("organizacion_id", "clave_idempotencia");

DROP INDEX "wallet_movimiento_clave_idempotencia_key";
CREATE UNIQUE INDEX "wallet_movimiento_clave_idempotencia_key"
  ON "wallet_movimiento" ("organizacion_id", "clave_idempotencia");

DROP INDEX "wallet_tienda_movimiento_clave_idempotencia_key";
CREATE UNIQUE INDEX "wallet_tienda_movimiento_clave_idempotencia_key"
  ON "wallet_tienda_movimiento" ("organizacion_id", "clave_idempotencia");

-- Dedupe por origen de la caja: `origen_id` es polimorfico (sin FK), nada lo ata a una empresa.
DROP INDEX "wallet_movimiento_origen_categoria_uq";
CREATE UNIQUE INDEX "wallet_movimiento_origen_categoria_uq"
  ON "wallet_movimiento" ("organizacion_id", "origen_tipo", "origen_id", "categoria")
  WHERE "origen_id" IS NOT NULL;

-- `origen_id` del cobro de gasto fijo es «<plantillaId>:<periodo>», texto sin FK.
DROP INDEX "gasto_fijo_cobro_origen_uq";
CREATE UNIQUE INDEX "gasto_fijo_cobro_origen_uq"
  ON "gasto_fijo_cobro" ("organizacion_id", "origen_id");

-- Dedupe de avisos: `entidad_id` es polimorfico y el destinatario puede ser solo un rol.
DROP INDEX "notificacion_dedupe_key";
CREATE UNIQUE INDEX "notificacion_dedupe_key"
  ON "notificacion" ("organizacion_id", "evento", "entidad_id", "destinatario_rol", "destinatario_usuario_id")
  NULLS NOT DISTINCT
  WHERE "entidad_id" IS NOT NULL;

-- Catalogos propios de la empresa: cada una nombra los suyos.
DROP INDEX "plantilla_mensaje_nombre_key";
CREATE UNIQUE INDEX "plantilla_mensaje_nombre_key"
  ON "plantilla_mensaje" ("organizacion_id", "nombre");

-- Una plantilla de bienvenida vigente POR EMPRESA (global, la segunda empresa no podria tener la suya).
DROP INDEX "plantilla_mensaje_welcome_message_key";
CREATE UNIQUE INDEX "plantilla_mensaje_welcome_message_key"
  ON "plantilla_mensaje" ("organizacion_id", "welcome_message")
  WHERE "welcome_message" = true AND "deleted_at" IS NULL;

DROP INDEX "whatsapp_envio_nombre_vigente_key";
CREATE UNIQUE INDEX "whatsapp_envio_nombre_vigente_key"
  ON "whatsapp_envio" ("organizacion_id", "nombre")
  WHERE "deleted_at" IS NULL;

DROP INDEX "zona_nombre_key";
CREATE UNIQUE INDEX "zona_nombre_key"
  ON "zona" ("organizacion_id", "nombre");

-- Una zona central POR EMPRESA.
DROP INDEX "zona_es_central_unico";
CREATE UNIQUE INDEX "zona_es_central_unico"
  ON "zona" ("organizacion_id", "es_central")
  WHERE "es_central" = true;

-- La tarifa por defecto es (NULL, NULL): con NULLS NOT DISTINCT global, solo una empresa la tendria.
DROP INDEX "tarifas_zona_id_tienda_id_key";
CREATE UNIQUE INDEX "tarifas_zona_id_tienda_id_key"
  ON "tarifas" ("organizacion_id", "zona_id", "tienda_id")
  NULLS NOT DISTINCT;

-- El ranking: cada empresa congela su dia y tiene su podio de 3.
DROP INDEX "ranking_snapshot_dia_fecha_key";
CREATE UNIQUE INDEX "ranking_snapshot_dia_fecha_key"
  ON "ranking_snapshot_dia" ("organizacion_id", "fecha");

DROP INDEX "premio_ranking_posicion_key";
CREATE UNIQUE INDEX "premio_ranking_posicion_key"
  ON "premio_ranking" ("organizacion_id", "posicion");

-- El podio de las empresas que ya existan (las creadas antes de esta migracion no lo tienen: M2
-- borro las 3 filas sin empresa y el alta aun no lo sembraba). Mismo id de texto y monto NULL =
-- sin premio que la siembra original de `20260716130000_premio_ranking`. Las empresas nuevas lo
-- reciben del alta, en su misma transaccion.
INSERT INTO "premio_ranking" ("id", "organizacion_id", "posicion", "monto")
SELECT md5(random()::text || clock_timestamp()::text || o."id" || p.posicion::text), o."id", p.posicion, NULL
FROM "organizacion" o
CROSS JOIN (VALUES (1), (2), (3)) AS p(posicion)
ON CONFLICT ("organizacion_id", "posicion") DO NOTHING;

COMMIT;
