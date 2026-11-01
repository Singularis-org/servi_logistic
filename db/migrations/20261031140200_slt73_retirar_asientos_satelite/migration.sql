-- SLT-73 (migracion C, design §1.3) — RETIRAR LOS ASIENTOS DE LOS CIERRES SATELITE SIN CONCILIAR
-- (R16–R18).
--
-- Antes de esta ficha, aprobar un cierre del dia de una satelite escribia su dinero en los tres
-- libros. Desde T3 ese dinero entra al CONCILIAR la consolidacion (R10). Los cierres satelite que
-- ya se aprobaron y siguen sin conciliar tienen sus asientos fechados en la aprobacion: aqui se
-- retiran, y al conciliar se vuelven a escribir (R20).
--
-- CONJUNTO S (por predicado, sin ids): `cierre_dia` con destino `bodega_satelite`, en `aprobado`, y
-- sin consolidar o con su consolidacion sin conciliar.
--
-- QUE SE RETIRA: las filas con origen (`cierre_dia`, id ∈ S) de `wallet_movimiento`,
-- `wallet_tienda_movimiento` y `pago_mensajero_movimiento`. En el libro del mensajero NO se retiran
-- los devengos POSTERIORES al cierre que la conciliacion no vuelve a escribir: el premio del ranking
-- (`premio_ranking` y su reverso `ajuste_pago` con `premio_dia`) y el `incentivo`. Es el mismo
-- criterio que `PagoMensajeroMovimientoRepository.sumarPremiosVivosPorCierre`: no son asientos de la
-- aprobacion, y borrarlos los perderia (R20 solo re-escribe lo de la aprobacion).
--
-- GUARDA R18: si algun cierre de S tiene un pago al mensajero (`liquidacion_pago.cierre_id`), se
-- aborta sin cambiar nada y se dice cuantos son.
--
-- RESPALDO: cada fila retirada se guarda integra (`to_jsonb`) en `respaldo.slt73_asientos`. El
-- esquema `respaldo` queda fuera de `public`: Prisma no lo mira (sin drift) y `servi_app` no tiene
-- `USAGE`. Postgres no admite una expresion en una PRIMARY KEY, asi que el id de la fila va en una
-- columna generada (`id`) y la clave es `(tabla, id)`. El `DELETE` filtra por ESE id del respaldo,
-- no por el origen: solo sale lo que quedo respaldado.
--
-- UN SOLO BLOQUE `DO`: todo o nada. Es la unica excepcion a «los libros no se borran» de esta ficha,
-- y existe solo con respaldo y con su reverso en `down.sql`.
DO $slt73$
DECLARE
  n_cierres integer;
  n_pagos integer;
  n_caja integer;
  n_tienda integer;
  n_mensajero integer;
BEGIN
  DROP TABLE IF EXISTS pg_temp.slt73_cierres;
  CREATE TEMP TABLE slt73_cierres ON COMMIT DROP AS
  SELECT c.id
  FROM cierre_dia c
  LEFT JOIN cierre_bodega b ON b.id = c.cierre_bodega_id
  WHERE c.destino_tipo::text = 'bodega_satelite'
    AND c.estado::text = 'aprobado'
    AND (c.cierre_bodega_id IS NULL OR b.conciliado_at IS NULL);

  SELECT count(*) INTO n_cierres FROM slt73_cierres;

  -- R18: un pago al mensajero contra un cierre de S bloquea toda la migracion.
  SELECT count(DISTINCT p.cierre_id) INTO n_pagos
  FROM liquidacion_pago p
  WHERE p.cierre_id IN (SELECT id FROM slt73_cierres);
  IF n_pagos > 0 THEN
    RAISE EXCEPTION 'slt73: % cierres satelite sin conciliar tienen un pago al mensajero registrado (liquidacion_pago); se aborta sin cambiar nada', n_pagos;
  END IF;

  CREATE SCHEMA IF NOT EXISTS respaldo;
  REVOKE ALL ON SCHEMA respaldo FROM PUBLIC;
  CREATE TABLE IF NOT EXISTS respaldo.slt73_asientos (
    tabla text NOT NULL,
    fila jsonb NOT NULL,
    id text GENERATED ALWAYS AS (fila ->> 'id') STORED,
    PRIMARY KEY (tabla, id)
  );
  REVOKE ALL ON TABLE respaldo.slt73_asientos FROM PUBLIC;

  INSERT INTO respaldo.slt73_asientos (tabla, fila)
  SELECT 'wallet_movimiento', to_jsonb(w)
  FROM wallet_movimiento w
  WHERE w.origen_tipo::text = 'cierre_dia'
    AND w.origen_id IN (SELECT id FROM slt73_cierres)
  ON CONFLICT DO NOTHING;

  INSERT INTO respaldo.slt73_asientos (tabla, fila)
  SELECT 'wallet_tienda_movimiento', to_jsonb(t)
  FROM wallet_tienda_movimiento t
  WHERE t.origen_tipo::text = 'cierre_dia'
    AND t.origen_id IN (SELECT id FROM slt73_cierres)
  ON CONFLICT DO NOTHING;

  INSERT INTO respaldo.slt73_asientos (tabla, fila)
  SELECT 'pago_mensajero_movimiento', to_jsonb(m)
  FROM pago_mensajero_movimiento m
  WHERE m.origen_tipo::text = 'cierre_dia'
    AND m.origen_id IN (SELECT id FROM slt73_cierres)
    AND m.categoria::text NOT IN ('premio_ranking', 'incentivo')
    AND m.premio_dia IS NULL
  ON CONFLICT DO NOTHING;

  DELETE FROM wallet_movimiento w
  WHERE w.id IN (SELECT r.id FROM respaldo.slt73_asientos r WHERE r.tabla = 'wallet_movimiento');
  GET DIAGNOSTICS n_caja = ROW_COUNT;

  DELETE FROM wallet_tienda_movimiento t
  WHERE t.id IN (SELECT r.id FROM respaldo.slt73_asientos r WHERE r.tabla = 'wallet_tienda_movimiento');
  GET DIAGNOSTICS n_tienda = ROW_COUNT;

  DELETE FROM pago_mensajero_movimiento m
  WHERE m.id IN (SELECT r.id FROM respaldo.slt73_asientos r WHERE r.tabla = 'pago_mensajero_movimiento');
  GET DIAGNOSTICS n_mensajero = ROW_COUNT;

  RAISE NOTICE 'slt73: % cierres satelite sin conciliar; retiradas % filas de caja, % de tienda y % del mensajero (respaldadas en respaldo.slt73_asientos)',
    n_cierres, n_caja, n_tienda, n_mensajero;
END
$slt73$;
