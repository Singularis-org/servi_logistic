-- SLT-77 (T1.2, design §1.1, R1, R2, R6, R7) — el tope de intentos de entrega de cada empresa.
--
-- Columna en `organizacion` y no tabla nueva: una tabla obligaria a decidir que significa «sin fila», y eso
-- acaba en un `?? 3` en codigo, la segunda fuente que esta ficha retira. No escribe en ordenes ni cierres:
-- no hay backfill y la migracion no mueve una orden (276 R35).

-- NOT NULL DEFAULT 3 deja en 3 a las existentes y a las futuras (R2), sin tocar el alta y sin reescribir la tabla.
ALTER TABLE "organizacion" ADD COLUMN "tope_intentos_entrega" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_tope_intentos_entrega_check"
  CHECK ("tope_intentos_entrega" BETWEEN 1 AND 10);

-- `organizacion` es de solo lectura para la app (20261022130000): se abre SOLO esto (R7).
-- `updated_at` porque el UPDATE lo escribe; `es_demo`, `plan_id` y demas siguen en 42501.
GRANT UPDATE ("tope_intentos_entrega", "updated_at") ON "organizacion" TO servi_app;
CREATE POLICY "organizacion_propia_editar_tope" ON "organizacion" FOR UPDATE TO servi_app
  USING      ("id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("id" = NULLIF(current_setting('app.organizacion_id', true), ''));
