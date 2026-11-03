-- SL-42 (design §2.1, R23) — el estado activo de un tipo de vehículo.
--
-- `vehiculos` es de PLATAFORMA (sin `organizacion_id`; `lib/db/modelos-de-negocio.ts` ya lo clasifica
-- así). Toda fila que existe queda activa: el `DEFAULT true` rellena las filas previas al añadir la
-- columna NOT NULL (R23).
--
-- Lo que NO cambia: la política `vehiculos_lectura` (`SELECT USING (true)` para `servi_app`) cubre la
-- columna nueva, y el `REVOKE INSERT, UPDATE, DELETE` de SL-17 (20261022130000) sigue en pie (R23).
-- Sin índice sobre `activo`: el catálogo es diminuto y se lee entero.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

ALTER TABLE "vehiculos" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
