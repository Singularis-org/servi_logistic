-- DOWN (SLT-94, 4 de 4) — apaga el cobro de fulfillment: suelta los tres triggers y sus funciones (y la
-- función que registra cada evento). NO borra cobros ni devoluciones ya escritos: eso es el down de M3.
-- En una transacción: si algo falla, los triggers siguen como estaban.

BEGIN;

DROP TRIGGER IF EXISTS "fulfillment_al_cancelar_por_api" ON "orden_historial_estado";
DROP TRIGGER IF EXISTS "fulfillment_al_cambiar_borrado" ON "orden";
DROP TRIGGER IF EXISTS "fulfillment_al_crear_orden" ON "orden";

DROP FUNCTION IF EXISTS fulfillment_al_cancelar_por_api();
DROP FUNCTION IF EXISTS fulfillment_al_cambiar_borrado();
DROP FUNCTION IF EXISTS fulfillment_al_crear_orden();
DROP FUNCTION IF EXISTS fulfillment_registrar_movimiento(text, text, text, integer, orden_fulfillment_movimiento_tipo,
  orden_fulfillment_movimiento_causa, numeric, numeric, numeric, text, timestamp(3));

COMMIT;
