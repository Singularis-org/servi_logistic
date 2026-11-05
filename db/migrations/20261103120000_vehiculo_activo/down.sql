-- SL-42 — revierte 20261103120000_vehiculo_activo y nada más (R23).
--
-- PÉRDIDA DE DATO DECLARADA: se va la marca `activo` de todo tipo desactivado. Ninguna fila de
-- `vehiculos` se borra ni se modifica; la política y los privilegios de `servi_app` no se tocan.
-- `IF EXISTS`: correr el down dos veces es un no-op.
-- Va después del down de 20261103120100_vehiculo_rastro (orden inverso).

ALTER TABLE "vehiculos" DROP COLUMN IF EXISTS "activo";
