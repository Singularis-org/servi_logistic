-- DOWN (SL-18 M3) — borra los tres indices con la empresa delante y restaura los dos viejos con su
-- forma y su nombre de antes. Solo hay indices: no se pierde ningun dato y nunca aborta.

BEGIN;

DROP INDEX "historial_accion_organizacion_id_created_at_id_idx";
CREATE INDEX "historial_accion_created_at_id_idx" ON "historial_accion" ("created_at" DESC, "id");

DROP INDEX "gestion_orden_organizacion_id_created_at_idx";
CREATE INDEX "gestion_orden_created_at_idx" ON "gestion_orden" ("created_at");

DROP INDEX "orden_organizacion_id_prioridad_created_at_id_idx";

COMMIT;
