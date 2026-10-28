-- DOWN (SL-18 M2) — borra los tres indices con la empresa delante y restaura los dos viejos con su
-- forma y su nombre de antes. Solo hay indices: no se pierde ningun dato y nunca aborta.

BEGIN;

DROP INDEX "analytics_daily_organizacion_id_fecha_idx";

DROP INDEX "whatsapp_envio_ejecucion_organizacion_id_created_at_idx";
CREATE INDEX "whatsapp_envio_ejecucion_created_at_idx" ON "whatsapp_envio_ejecucion" ("created_at" DESC);

DROP INDEX "tarifas_organizacion_id_created_at_idx";
CREATE INDEX "tarifas_created_at_idx" ON "tarifas" ("created_at");

COMMIT;
