-- SLT-94 (2 de 4, design §1 M2; R1, R2, R35, D4) — la marca «se recoge en tienda» (sí/no), columna
-- propia de `usuario`, distinta del valor de fulfillment de las tarifas.
--
-- Backfill en la misma migración: marca = NOT fulfillment (R2). Solo escribe la columna nueva, y solo en
-- las filas cuyo `fulfillment` era true (en producción, 0 filas el 2026-11-08: T0). Ninguna otra columna
-- ni fila cambia; `usuario` no tiene trigger que reescriba `updated_at`.
--
-- La columna vieja `fulfillment` NO se borra (D4): se deja de leer y escribir (su campo Prisma pasa a
-- `fulfillmentRetirado`). `usuario` ya tiene `organizacion_id`, RLS y su trigger de empresa: la columna no
-- necesita nada propio.
--
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TABLE "usuario" ADD COLUMN "se_recoge_en_tienda" BOOLEAN NOT NULL DEFAULT true;

UPDATE "usuario" SET "se_recoge_en_tienda" = false WHERE "fulfillment" = true;
