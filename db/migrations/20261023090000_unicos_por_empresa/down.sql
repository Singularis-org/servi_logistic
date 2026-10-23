-- DOWN (SL-17 T3.9) — vuelve los 18 unicos a GLOBALES, con su forma y su nombre de antes.
--
-- SOLO ES APLICABLE SI NINGUN VALOR SE REPITE ENTRE EMPRESAS. Con la migracion aplicada, dos
-- empresas pueden tener la misma zona «Centro», su propio podio (posiciones 1-3) o la misma clave
-- de idempotencia; un unico global no los admite. No se borra ni se renombra nada para «hacer
-- sitio»: son datos de negocio. Por eso, antes de tocar un indice, se cuentan los duplicados de
-- los 18 y, si hay alguno, el down ABORTA con un mensaje que nombra el indice y no cambia nada.
-- (En la practica: con dos empresas ya hay 6 filas de podio y el down no aplica.)
--
-- Las filas de podio que sembro la migracion se quedan: son datos, y con una sola empresa caben
-- en el unico global.

BEGIN;

DO $$
DECLARE
  -- indice, tabla, columnas globales de antes, predicado (o NULL), NULLS NOT DISTINCT
  chequeos text[][] := ARRAY[
    ARRAY['abono_tienda_clave_idempotencia_key', 'abono_tienda', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['aporte_capital_clave_idempotencia_key', 'aporte_capital', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['liquidacion_pago_clave_idempotencia_key', 'liquidacion_pago', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['liquidacion_reparto_clave_idempotencia_key', 'liquidacion_reparto', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['pago_por_cuenta_tienda_clave_idempotencia_key', 'pago_por_cuenta_tienda', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['wallet_movimiento_clave_idempotencia_key', 'wallet_movimiento', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['wallet_tienda_movimiento_clave_idempotencia_key', 'wallet_tienda_movimiento', '"clave_idempotencia"', NULL, 'no'],
    ARRAY['wallet_movimiento_origen_categoria_uq', 'wallet_movimiento', '"origen_tipo", "origen_id", "categoria"', '"origen_id" IS NOT NULL', 'no'],
    ARRAY['gasto_fijo_cobro_origen_uq', 'gasto_fijo_cobro', '"origen_id"', NULL, 'no'],
    ARRAY['notificacion_dedupe_key', 'notificacion', '"evento", "entidad_id", "destinatario_rol", "destinatario_usuario_id"', '"entidad_id" IS NOT NULL', 'si'],
    ARRAY['plantilla_mensaje_nombre_key', 'plantilla_mensaje', '"nombre"', NULL, 'no'],
    ARRAY['plantilla_mensaje_welcome_message_key', 'plantilla_mensaje', '"welcome_message"', '"welcome_message" = true AND "deleted_at" IS NULL', 'no'],
    ARRAY['whatsapp_envio_nombre_vigente_key', 'whatsapp_envio', '"nombre"', '"deleted_at" IS NULL', 'no'],
    ARRAY['zona_nombre_key', 'zona', '"nombre"', NULL, 'no'],
    ARRAY['zona_es_central_unico', 'zona', '"es_central"', '"es_central" = true', 'no'],
    ARRAY['tarifas_zona_id_tienda_id_key', 'tarifas', '"zona_id", "tienda_id"', NULL, 'si'],
    ARRAY['ranking_snapshot_dia_fecha_key', 'ranking_snapshot_dia', '"fecha"', NULL, 'no'],
    ARRAY['premio_ranking_posicion_key', 'premio_ranking', '"posicion"', NULL, 'no']
  ];
  c text[];
  repetidos bigint;
  culpables text := '';
BEGIN
  FOREACH c SLICE 1 IN ARRAY chequeos LOOP
    -- Con NULLS DISTINCT (el defecto) una fila con algun NULL nunca choca: se excluye. Con NULLS NOT
    -- DISTINCT, GROUP BY ya trata los NULL como iguales, que es lo que hara el indice.
    EXECUTE format(
      'SELECT count(*) FROM (SELECT 1 FROM %I WHERE (%s) AND (%s) GROUP BY %s HAVING count(*) > 1) d',
      c[2],
      coalesce(c[4], 'true'),
      CASE WHEN c[5] = 'si' THEN 'true' ELSE replace(c[3], ', ', ' IS NOT NULL AND ') || ' IS NOT NULL' END,
      c[3]
    ) INTO repetidos;
    IF repetidos > 0 THEN
      culpables := culpables || format(' %s (%s valores repetidos entre empresas);', c[1], repetidos);
    END IF;
  END LOOP;
  IF culpables <> '' THEN
    RAISE EXCEPTION 'SL-17 T3.9 down: no se puede volver a los unicos globales, hay duplicados entre empresas:%', culpables
      USING HINT = 'El down solo aplica si ningun valor se repite entre empresas. No se borro ni cambio nada.';
  END IF;
END $$;

DROP INDEX "abono_tienda_clave_idempotencia_key";
CREATE UNIQUE INDEX "abono_tienda_clave_idempotencia_key" ON "abono_tienda" ("clave_idempotencia");

DROP INDEX "aporte_capital_clave_idempotencia_key";
CREATE UNIQUE INDEX "aporte_capital_clave_idempotencia_key" ON "aporte_capital" ("clave_idempotencia");

DROP INDEX "liquidacion_pago_clave_idempotencia_key";
CREATE UNIQUE INDEX "liquidacion_pago_clave_idempotencia_key" ON "liquidacion_pago" ("clave_idempotencia");

DROP INDEX "liquidacion_reparto_clave_idempotencia_key";
CREATE UNIQUE INDEX "liquidacion_reparto_clave_idempotencia_key" ON "liquidacion_reparto" ("clave_idempotencia");

DROP INDEX "pago_por_cuenta_tienda_clave_idempotencia_key";
CREATE UNIQUE INDEX "pago_por_cuenta_tienda_clave_idempotencia_key" ON "pago_por_cuenta_tienda" ("clave_idempotencia");

DROP INDEX "wallet_movimiento_clave_idempotencia_key";
CREATE UNIQUE INDEX "wallet_movimiento_clave_idempotencia_key" ON "wallet_movimiento" ("clave_idempotencia");

DROP INDEX "wallet_tienda_movimiento_clave_idempotencia_key";
CREATE UNIQUE INDEX "wallet_tienda_movimiento_clave_idempotencia_key" ON "wallet_tienda_movimiento" ("clave_idempotencia");

DROP INDEX "wallet_movimiento_origen_categoria_uq";
CREATE UNIQUE INDEX "wallet_movimiento_origen_categoria_uq"
  ON "wallet_movimiento" ("origen_tipo", "origen_id", "categoria")
  WHERE "origen_id" IS NOT NULL;

DROP INDEX "gasto_fijo_cobro_origen_uq";
CREATE UNIQUE INDEX "gasto_fijo_cobro_origen_uq" ON "gasto_fijo_cobro" ("origen_id");

DROP INDEX "notificacion_dedupe_key";
CREATE UNIQUE INDEX "notificacion_dedupe_key"
  ON "notificacion" ("evento", "entidad_id", "destinatario_rol", "destinatario_usuario_id")
  NULLS NOT DISTINCT
  WHERE "entidad_id" IS NOT NULL;

DROP INDEX "plantilla_mensaje_nombre_key";
CREATE UNIQUE INDEX "plantilla_mensaje_nombre_key" ON "plantilla_mensaje" ("nombre");

DROP INDEX "plantilla_mensaje_welcome_message_key";
CREATE UNIQUE INDEX "plantilla_mensaje_welcome_message_key"
  ON "plantilla_mensaje" ("welcome_message")
  WHERE "welcome_message" = true AND "deleted_at" IS NULL;

DROP INDEX "whatsapp_envio_nombre_vigente_key";
CREATE UNIQUE INDEX "whatsapp_envio_nombre_vigente_key"
  ON "whatsapp_envio" ("nombre")
  WHERE "deleted_at" IS NULL;

DROP INDEX "zona_nombre_key";
CREATE UNIQUE INDEX "zona_nombre_key" ON "zona" ("nombre");

DROP INDEX "zona_es_central_unico";
CREATE UNIQUE INDEX "zona_es_central_unico" ON "zona" ("es_central") WHERE "es_central" = true;

DROP INDEX "tarifas_zona_id_tienda_id_key";
CREATE UNIQUE INDEX "tarifas_zona_id_tienda_id_key" ON "tarifas" ("zona_id", "tienda_id") NULLS NOT DISTINCT;

DROP INDEX "ranking_snapshot_dia_fecha_key";
CREATE UNIQUE INDEX "ranking_snapshot_dia_fecha_key" ON "ranking_snapshot_dia" ("fecha");

DROP INDEX "premio_ranking_posicion_key";
CREATE UNIQUE INDEX "premio_ranking_posicion_key" ON "premio_ranking" ("posicion");

COMMIT;
