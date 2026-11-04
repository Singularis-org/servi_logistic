-- DOWN de SLT-52 T4.6 — revierte 20261103140000_rechazo_tienda_cobro_tarifa_valor.
--
-- ORDEN: va DESPUES del down de 20261103140100 (el trigger de misma empresa sobre esta columna).
-- Pierde la traza `tarifa_valor_id` de los cobros del modelo nuevo; sus importes congelados quedan.

ALTER TABLE "rechazo_tienda_cobro" DROP CONSTRAINT "rechazo_tienda_cobro_tarifa_valor_id_fkey";
ALTER TABLE "rechazo_tienda_cobro" DROP CONSTRAINT "rechazo_tienda_cobro_una_tarifa";
DROP INDEX "rechazo_tienda_cobro_tarifa_valor_id_idx";
ALTER TABLE "rechazo_tienda_cobro" DROP COLUMN "tarifa_valor_id";
