-- SLT-66 (design §2.1) — costo por orden del plan y maestro sin tope (R1, R4, R7, R8, R11).
--
-- CABECERA: el DELETE de los topes de maestro es DEFINITIVO. down.sql repone el CHECK que los
-- admitía, pero NO las filas borradas (decisión del humano del 2026-10-30: «la migración lo borra»).
--
-- `plan_rastro` y la asignación de las empresas no se tocan (R4): el rastro conserva el dato viejo y
-- las pantallas dejan de pintarlo porque recorren `ROLES_CON_TOPE`.

-- R7, R8: costo por orden del plan. NULL = el plan no lo fija (se aplica el global, R12).
ALTER TABLE "plan" ADD COLUMN "costo_por_orden" DECIMAL(12,2);
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_check"
  CHECK ("costo_por_orden" IS NULL OR "costo_por_orden" >= 0);

-- R1, R4: el maestro deja de tener tope.
DELETE FROM "plan_tope_rol" WHERE "rol" = 'maestro';
ALTER TABLE "plan_tope_rol" DROP CONSTRAINT "plan_tope_rol_rol_check";
ALTER TABLE "plan_tope_rol" ADD CONSTRAINT "plan_tope_rol_rol_check"
  CHECK ("rol" IN ('admin', 'mensajero', 'Admin Tienda', 'adminSatelite'));

-- R4, R11: las versiones pendientes pierden el tope de maestro y ganan la clave nueva, que nace vacía
-- (la columna también nace NULL). Así `versionPlanSchema`, que ya no admite `maestro` y exige
-- `costoPorOrden`, las sigue leyendo (lo hacen el aplicador, «Mi plan» y el detalle).
UPDATE "plan_cambio_programado"
   SET "version" = jsonb_set("version" #- '{topes,porRol,maestro}', '{costoPorOrden}', 'null'::jsonb);
