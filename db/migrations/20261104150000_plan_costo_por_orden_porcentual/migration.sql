-- SLT-83 (design §2.1; R1, R2, R27) — el costo por orden porcentual del plan: un porcentaje sobre el
-- valor del paquete y un mínimo opcional. NULL/NULL = el plan no es porcentual. El modo se DERIVA de qué
-- columna tiene valor (porcentual, fijo o vacío; design §11, alternativa 2), y un solo CHECK impide los
-- dos a la vez.
--
-- Multi-empresa: `plan` y `plan_cambio_programado` siguen siendo de PLATAFORMA (RLS sin políticas y
-- `REVOKE ALL … FROM servi_app`, SL-24 §2.5). Las columnas nuevas heredan ese trato.
--
-- Los planes que ya existen no cambian de modo (R27): las columnas nuevas nacen NULL.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

ALTER TABLE "plan" ADD COLUMN "costo_por_orden_pct"    DECIMAL(5,2);
ALTER TABLE "plan" ADD COLUMN "costo_por_orden_minimo" DECIMAL(12,2);
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_pct_check"
  CHECK ("costo_por_orden_pct" IS NULL OR ("costo_por_orden_pct" > 0 AND "costo_por_orden_pct" <= 100));
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_minimo_check"
  CHECK ("costo_por_orden_minimo" IS NULL OR ("costo_por_orden_minimo" >= 0 AND "costo_por_orden_pct" IS NOT NULL));
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_un_modo"
  CHECK ("costo_por_orden" IS NULL OR "costo_por_orden_pct" IS NULL);

-- R27: las versiones pendientes ganan la clave nueva, vacía, para que `versionPlanSchema` las siga leyendo.
UPDATE "plan_cambio_programado"
   SET "version" = jsonb_set("version", '{costoPorOrdenPorcentual}', 'null'::jsonb);
