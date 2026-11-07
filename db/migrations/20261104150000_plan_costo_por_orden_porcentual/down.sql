-- SLT-83 — revierte 20261104150000_plan_costo_por_orden_porcentual (design §2.1). Va después de los down
-- de 20261104150200 y 20261104150100 (orden inverso).
--
-- SE NIEGA si hay datos porcentuales (R27): bajar dejaría a esos planes, o a las versiones pendientes que
-- los programan, sin costo por orden, y el código de antes cobraría el global sin que nadie lo decidiera.
-- Quien quiera bajar, antes devuelve esos planes a un costo fijo o vacío y cancela esas versiones.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "plan" WHERE "costo_por_orden_pct" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "plan_cambio_programado"
                 WHERE "version" -> 'costoPorOrdenPorcentual' IS NOT NULL
                   AND jsonb_typeof("version" -> 'costoPorOrdenPorcentual') <> 'null') THEN
    RAISE EXCEPTION 'SLT-83 down: hay planes porcentuales; bajar los dejaría sin costo por orden';
  END IF;
END
$$;

-- Las versiones pierden la clave, que el código de antes rechaza (`.strict()`).
UPDATE "plan_cambio_programado" SET "version" = "version" - 'costoPorOrdenPorcentual';

ALTER TABLE "plan" DROP CONSTRAINT "plan_costo_por_orden_un_modo";
ALTER TABLE "plan" DROP CONSTRAINT "plan_costo_por_orden_minimo_check";
ALTER TABLE "plan" DROP CONSTRAINT "plan_costo_por_orden_pct_check";
ALTER TABLE "plan" DROP COLUMN "costo_por_orden_minimo";
ALTER TABLE "plan" DROP COLUMN "costo_por_orden_pct";
