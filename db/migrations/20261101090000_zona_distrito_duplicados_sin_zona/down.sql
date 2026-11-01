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
-- * El esquema `respaldo` se borra SOLO si queda vacio: es compartido (SLT-73 guarda ahi
--   `respaldo.slt73_asientos`). Sin CASCADE, Postgres rechaza el DROP con `2BP01` si queda otro
--   objeto; el bloque `DO` atrapa ESE error y deja el esquema con lo ajeno intacto.

-- * SLT-76 (design §9.2, R19): `20261102090100_slt76_retirar_respaldos` BORRA el respaldo. Las filas
--   respaldadas eran los duplicados, es decir, el defecto; sin ellas, esta bajada NO HACE NADA con
--   `zona_distrito` y deja un NOTICE. Por eso el INSERT y el DROP van dentro del `IF`.
DO $slt75$
BEGIN
  IF to_regclass('respaldo.slt75_zona_distrito_duplicado') IS NOT NULL THEN
    INSERT INTO zona_distrito (id, zona_id, distrito_id, organizacion_id)
    SELECT r.id, r.zona_id, r.distrito_id, r.organizacion_id
    FROM respaldo.slt75_zona_distrito_duplicado r
    WHERE EXISTS (SELECT 1 FROM zona z WHERE z.id = r.zona_id)
      AND EXISTS (SELECT 1 FROM distrito d WHERE d.id = r.distrito_id)
    ON CONFLICT DO NOTHING;

    DROP TABLE respaldo.slt75_zona_distrito_duplicado;
  ELSE
    RAISE NOTICE 'slt75: el respaldo se retiró en SLT-76 (20261102090100); no hay filas que devolver';
  END IF;

  BEGIN
    DROP SCHEMA IF EXISTS respaldo;
  EXCEPTION WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'slt75: el esquema respaldo conserva objetos de otra ficha; se deja';
  END;
END
$slt75$;
