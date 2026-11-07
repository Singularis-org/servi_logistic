-- SL-42 — revierte 20261103120100_vehiculo_rastro. Va antes del down de 20261103120000 (orden inverso).
-- PÉRDIDA DE DATO DECLARADA: el rastro de las acciones sobre vehículos se pierde. El índice, la RLS y
-- los privilegios se van con la tabla; la tabla, antes que el tipo del que depende.

DROP TABLE IF EXISTS "vehiculo_rastro";
DROP TYPE IF EXISTS "vehiculo_rastro_accion";
