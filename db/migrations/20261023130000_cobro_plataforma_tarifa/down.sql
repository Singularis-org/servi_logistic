-- SL-40 — revierte 20261023130000_cobro_plataforma_tarifa. Se aplica después del down de
-- 20261023130100 y del de 20261023130200 (orden inverso), así que ya no queda ningún trigger que lea
-- esta tabla ni la columna.

ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_cobro_plataforma_por_orden_check";
ALTER TABLE "organizacion" DROP COLUMN "cobro_plataforma_por_orden";

DROP TABLE "cobro_plataforma_tarifa";
