-- SL-24 — revierte 20261028130000_plan. Va después de los down de 20261028130200 (los triggers y
-- funciones que leen estas tablas) y de 20261028130100 (el historial que nombra `plan`), en orden
-- inverso.
-- Los planes, su rastro y las asignaciones se pierden: sin la feature, ninguna empresa tiene plan, que
-- es el comportamiento de antes (R14). Las FK, los CHECK, los índices y la RLS se van con sus tablas.

DROP INDEX IF EXISTS "orden_organizacion_id_created_at_vivas_idx";

ALTER TABLE "organizacion" DROP CONSTRAINT IF EXISTS "organizacion_plan_ciclo_ancla_check";
ALTER TABLE "organizacion" DROP CONSTRAINT IF EXISTS "organizacion_plan_id_fkey";
ALTER TABLE "organizacion" DROP COLUMN IF EXISTS "plan_ciclo_ancla_at";
ALTER TABLE "organizacion" DROP COLUMN IF EXISTS "plan_id";

DROP TABLE IF EXISTS "plan_rastro";
DROP TABLE IF EXISTS "plan_modulo";
DROP TABLE IF EXISTS "plan_tope_rol";
DROP TABLE IF EXISTS "plan";

DROP TYPE IF EXISTS "plan_rastro_accion";
DROP TYPE IF EXISTS "plan_visibilidad";
