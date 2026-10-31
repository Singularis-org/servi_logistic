-- SLT-66 — revierte 20261031130000_plan_costeo_y_maestro_sin_tope. Va después de los down de
-- 20261031130200 y 20261031130100 (orden inverso, design §2.3 bis).
--
-- Los topes de maestro que borró la subida NO vuelven (cabecera de migration.sql): solo se repone el
-- CHECK que los admitía. Las versiones pendientes pierden la clave `costoPorOrden`, que el código de
-- antes rechaza (`.strict()`), y el costo por orden de cada plan se pierde con su columna.

UPDATE "plan_cambio_programado" SET "version" = "version" - 'costoPorOrden';

ALTER TABLE "plan_tope_rol" DROP CONSTRAINT "plan_tope_rol_rol_check";
ALTER TABLE "plan_tope_rol" ADD CONSTRAINT "plan_tope_rol_rol_check"
  CHECK ("rol" IN ('maestro', 'admin', 'mensajero', 'Admin Tienda', 'adminSatelite'));

ALTER TABLE "plan" DROP CONSTRAINT "plan_costo_por_orden_check";
ALTER TABLE "plan" DROP COLUMN "costo_por_orden";
