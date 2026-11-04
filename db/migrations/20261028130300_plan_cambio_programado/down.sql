-- SL-24 — revierte 20261028130300_plan_cambio_programado (design §16.6). Va DESPUÉS del down de
-- 20261028130400 y ANTES del de 20261028130200.
-- Los cambios pendientes se pierden: sin la enmienda, editar un plan rige al momento, que es el
-- comportamiento de antes. El índice, la FK y la RLS se van con la tabla.

DROP TABLE IF EXISTS "plan_cambio_programado";
