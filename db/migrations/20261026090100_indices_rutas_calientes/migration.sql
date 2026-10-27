-- SL-18 M2 — INDICES DE RUTAS CALIENTES CON LA EMPRESA DELANTE (R24).
--
-- Cada consulta de abajo filtra por `organizacion_id` (lo pone la extension, y la RLS lo repite) y
-- ordena o acota por fecha. Con el indice de antes, que empezaba por la fecha, el plan recorria
-- filas de las dos empresas y descartaba las ajenas («Rows Removed by Filter»). Con la empresa
-- delante recorre solo las de una. Medido con `EXPLAIN (ANALYZE, BUFFERS)` como `servi_app`, dos
-- empresas sembradas: la tabla esta en `progress/impl_SL-18.md > Tanda 5`.
--
-- Entran solo las que la medicion eligio (T5.1):
--   - `tarifas`                  listado por `created_at DESC` (TarifaRepository.list)
--   - `whatsapp_envio_ejecucion` historial por `created_at DESC, id DESC` (WhatsappEjecucionRepository.historial)
--   - `analytics_daily`          rango de fechas del rollup (AnaliticaOperativaRollupRepository.agregarCubos)
--
-- Los nombres son los que Prisma deriva del `@@index` (sin `map:`): el test de la 123 fija la lista
-- de `map:` de `analytics_daily`.
--
-- LOS VIEJOS QUE SE BORRAN: `tarifas_created_at_idx` y `whatsapp_envio_ejecucion_created_at_idx`.
-- Su unica consulta es la de arriba, que ya va con empresa; ningun job ni lectura de plataforma los
-- usa. Mientras existen, el planificador los sigue eligiendo (las filas de A y B se escriben
-- intercaladas por fecha) y el compuesto no se usa.
--
-- `analytics_daily_grano_key` (fecha primero) es el unico del upsert del rollup y no se toca: el
-- compuesto le gana igual.

BEGIN;

DROP INDEX "tarifas_created_at_idx";
CREATE INDEX "tarifas_organizacion_id_created_at_idx"
  ON "tarifas" ("organizacion_id", "created_at");

DROP INDEX "whatsapp_envio_ejecucion_created_at_idx";
CREATE INDEX "whatsapp_envio_ejecucion_organizacion_id_created_at_idx"
  ON "whatsapp_envio_ejecucion" ("organizacion_id", "created_at" DESC);

CREATE INDEX "analytics_daily_organizacion_id_fecha_idx"
  ON "analytics_daily" ("organizacion_id", "fecha");

COMMIT;
