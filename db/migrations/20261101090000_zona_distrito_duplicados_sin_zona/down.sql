-- DOWN (SLT-75, T1, design §3.1, R12) — devuelve las filas respaldadas a `zona_distrito` y borra
-- el respaldo.
--
-- ⚠️ ORDEN: solo puede reinsertar si el indice unico de 20261101090100 ya NO esta. Revertir
-- primero esa (es la ultima) y despues esta.
--
-- * `organizacion_id` EXPLICITO: su DEFAULT lee el contexto de empresa de la sesion, que en una
--   migracion no existe.
-- * `WHERE EXISTS` de la zona y del distrito: si se borraron despues, la fila no se restaura y la
--   FK no tumba el rollback.
-- * `ON CONFLICT DO NOTHING`: si el maestro ya reasigno el distrito a esa misma zona, no se duplica.
-- * DROP SCHEMA sin CASCADE: no se lleva por delante el respaldo de otra ficha.

INSERT INTO zona_distrito (id, zona_id, distrito_id, organizacion_id)
SELECT r.id, r.zona_id, r.distrito_id, r.organizacion_id
FROM respaldo.slt75_zona_distrito_duplicado r
WHERE EXISTS (SELECT 1 FROM zona z WHERE z.id = r.zona_id)
  AND EXISTS (SELECT 1 FROM distrito d WHERE d.id = r.distrito_id)
ON CONFLICT DO NOTHING;

DROP TABLE respaldo.slt75_zona_distrito_duplicado;
DROP SCHEMA IF EXISTS respaldo;
