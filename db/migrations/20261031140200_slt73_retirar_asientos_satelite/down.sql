-- DOWN (SLT-73, migracion C) — devolver a los libros las filas retiradas (R19).
--
-- Cada fila vuelve TAL CUAL desde su respaldo (`jsonb_populate_record` con el tipo de fila de su
-- tabla): mismo id, monto, categoria y fechas. `ON CONFLICT DO NOTHING`: si un cierre ya se concilio
-- despues del up, la conciliacion re-escribio sus asientos (R20) y los unicos por origen
-- (`*_origen_uq`, `wallet_movimiento_origen_categoria_uq`) descartan la fila respaldada en vez de
-- duplicar el dinero. Despues se quita el respaldo.
--
-- Un solo bloque `DO`: todo o nada. Se quita SOLO la tabla de esta ficha (`respaldo.slt73_asientos`);
-- el esquema `respaldo` es compartido (SLT-75 guarda ahi `respaldo.slt75_zona_distrito_duplicado`) y se
-- borra solo si queda vacio: sin CASCADE, Postgres rechaza el DROP con `2BP01` si queda otro objeto, y
-- el sub-bloque atrapa ESE error y deja lo ajeno intacto.
--
-- SLT-76 (design §9.2, R18): `20261102090100_slt76_retirar_respaldos` BORRA el respaldo. Sin el, esta
-- bajada no tiene que devolver y el codigo de antes de SLT-73 leeria libros a los que les falta el
-- dinero de esos cierres. Por eso FALLA, antes de cualquier escritura, con un mensaje que lo dice.
DO $slt73$
BEGIN
  IF to_regclass('respaldo.slt73_asientos') IS NULL THEN
    RAISE EXCEPTION 'slt73: el respaldo se retiró en SLT-76 (20261102090100); los asientos retirados no se pueden devolver. Revertir SLT-73 sin ellos dejaría los libros sin esos cierres';
  END IF;

  IF to_regclass('respaldo.slt73_asientos') IS NOT NULL THEN
    INSERT INTO wallet_movimiento
    SELECT f.*
    FROM respaldo.slt73_asientos r,
         jsonb_populate_record(NULL::wallet_movimiento, r.fila) f
    WHERE r.tabla = 'wallet_movimiento'
    ON CONFLICT DO NOTHING;

    INSERT INTO wallet_tienda_movimiento
    SELECT f.*
    FROM respaldo.slt73_asientos r,
         jsonb_populate_record(NULL::wallet_tienda_movimiento, r.fila) f
    WHERE r.tabla = 'wallet_tienda_movimiento'
    ON CONFLICT DO NOTHING;

    INSERT INTO pago_mensajero_movimiento
    SELECT f.*
    FROM respaldo.slt73_asientos r,
         jsonb_populate_record(NULL::pago_mensajero_movimiento, r.fila) f
    WHERE r.tabla = 'pago_mensajero_movimiento'
    ON CONFLICT DO NOTHING;
  END IF;

  DROP TABLE IF EXISTS respaldo.slt73_asientos;
  BEGIN
    DROP SCHEMA IF EXISTS respaldo;
  EXCEPTION WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'slt73: el esquema respaldo conserva objetos de otra ficha; se deja';
  END;
END
$slt73$;
