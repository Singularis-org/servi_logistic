-- SLT-94 (4 de 4, design §1 M4) — quién escribe el cobro de fulfillment y su devolución: la base, con
-- dos triggers sobre `orden` (molde SL-40) y uno sobre `orden_historial_estado` (la cancelación por API).
--
-- Por qué en la base y no en el código (design §7, §8 alt. 1):
--   · «por cualquier vía» (D7) se cumple por construcción. La pantalla, la carga masiva y la API acaban en
--     el mismo INSERT de `orden` (`createManyOrdenes` / `createManyOrdenesConGuia`), y el borrado por
--     pantalla, el borrado por API y la recuperación en el mismo UPDATE OF deleted_at;
--   · misma transacción (R15, R24, R26, R30): el trigger corre dentro de la sentencia, y si la
--     transacción se deshace, el cobro se deshace con ella;
--   · `createMany … skipDuplicates` es ON CONFLICT DO NOTHING: un AFTER INSERT FOR EACH ROW solo corre por
--     las filas insertadas. Duplicadas y omitidas no se cobran (R23);
--   · la empresa no puede tocar los cobros (R25): la tabla no es escribible por `servi_app`, y estas
--     funciones son SECURITY DEFINER, así que escriben como dueño.
--
-- Al ser SECURITY DEFINER, la RLS no frena un error de estas funciones. Por eso:
--   · `search_path` fijo y EXECUTE revocado a PUBLIC;
--   · la empresa sale siempre de NEW.organizacion_id, que la RLS de `orden` / de la bitácora ya validó, y
--     la activación y el valor se leen filtrando por ella explícitamente (R38);
--   · los triggers de misma empresa de `orden_fulfillment_movimiento` son la segunda red.
--
-- Los movimientos de una orden ALTERNAN (cargo, reverso, cargo…), empezando por el cobro inicial. Quien
-- decide qué toca es el ÚLTIMO movimiento, no OLD.deleted_at (R27): reintentar no registra nada. El único
-- (organizacion_id, orden_id, secuencia) es el cerrojo de último recurso.
--
-- La fecha de las filas de los libros es la del evento (`ocurrido_at`): el cobro inicial, la creación de
-- la orden (R19); el reverso por eliminación, `deleted_at` (R26); el de cancelación, el instante de la
-- fila de la bitácora (R30); el re-cobro, el instante de la restauración (R29).
--
-- En carpeta propia: se pueden apagar sin borrar los cobros ya registrados (eso es M3). Sin backfill
-- (R34): una orden anterior no tiene movimientos, y eliminarla o restaurarla no registra nada (R28).

-- Registra UN evento: su fila en `orden_fulfillment_movimiento` y, en la misma sentencia, sus filas en el
-- libro de la tienda congelada y en la caja, con `origen_id` = id del movimiento.
--   cargo   → débitos `fulfillment` (+ `iva_fulfillment` si iva > 0) e ingresos espejo (R19);
--   reverso → créditos `fulfillment_anulado` (+ `iva_fulfillment_anulado`) y egresos espejo (R26, R30).
-- No es un trigger: la llaman solo las tres funciones de abajo.
CREATE FUNCTION fulfillment_registrar_movimiento(
  p_organizacion_id text, p_orden_id text, p_tienda_id text, p_secuencia integer,
  p_tipo orden_fulfillment_movimiento_tipo, p_causa orden_fulfillment_movimiento_causa,
  p_monto numeric, p_iva_pct numeric, p_iva numeric, p_tarifa_valor_id text, p_ocurrido_at timestamp(3)
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id text := gen_random_uuid()::text;
BEGIN
  INSERT INTO "orden_fulfillment_movimiento"
    ("id", "organizacion_id", "orden_id", "tienda_id", "secuencia", "tipo", "causa",
     "monto", "iva_pct", "iva", "tarifa_valor_id", "ocurrido_at")
  VALUES (v_id, p_organizacion_id, p_orden_id, p_tienda_id, p_secuencia, p_tipo, p_causa,
          p_monto, p_iva_pct, p_iva, p_tarifa_valor_id, p_ocurrido_at);

  IF p_tipo = 'cargo' THEN
    INSERT INTO "wallet_tienda_movimiento"
      ("id", "organizacion_id", "tienda_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
    VALUES (gen_random_uuid()::text, p_organizacion_id, p_tienda_id, 'debito', 'fulfillment', p_monto,
            'orden_fulfillment', v_id, p_ocurrido_at);
    INSERT INTO "wallet_movimiento"
      ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
    VALUES (gen_random_uuid()::text, p_organizacion_id, 'ingreso', 'ingreso_fulfillment', p_monto,
            'orden_fulfillment', v_id, p_ocurrido_at);
    IF p_iva > 0 THEN
      INSERT INTO "wallet_tienda_movimiento"
        ("id", "organizacion_id", "tienda_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
      VALUES (gen_random_uuid()::text, p_organizacion_id, p_tienda_id, 'debito', 'iva_fulfillment', p_iva,
              'orden_fulfillment', v_id, p_ocurrido_at);
      INSERT INTO "wallet_movimiento"
        ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
      VALUES (gen_random_uuid()::text, p_organizacion_id, 'ingreso', 'ingreso_iva_fulfillment', p_iva,
              'orden_fulfillment', v_id, p_ocurrido_at);
    END IF;
  ELSE
    INSERT INTO "wallet_tienda_movimiento"
      ("id", "organizacion_id", "tienda_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
    VALUES (gen_random_uuid()::text, p_organizacion_id, p_tienda_id, 'credito', 'fulfillment_anulado', p_monto,
            'orden_fulfillment', v_id, p_ocurrido_at);
    INSERT INTO "wallet_movimiento"
      ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
    VALUES (gen_random_uuid()::text, p_organizacion_id, 'egreso', 'egreso_reverso_fulfillment', p_monto,
            'orden_fulfillment', v_id, p_ocurrido_at);
    IF p_iva > 0 THEN
      INSERT INTO "wallet_tienda_movimiento"
        ("id", "organizacion_id", "tienda_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
      VALUES (gen_random_uuid()::text, p_organizacion_id, p_tienda_id, 'credito', 'iva_fulfillment_anulado', p_iva,
              'orden_fulfillment', v_id, p_ocurrido_at);
      INSERT INTO "wallet_movimiento"
        ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "fecha_movimiento")
      VALUES (gen_random_uuid()::text, p_organizacion_id, 'egreso', 'egreso_reverso_iva_fulfillment', p_iva,
              'orden_fulfillment', v_id, p_ocurrido_at);
    END IF;
  END IF;
END $$;

-- Al crear (R15–R19, R21, R23, R24, R34, R38). Solo con la empresa activada (D8) y un valor de
-- fulfillment de la tienda > 0 en el nivel «tienda en todas sus zonas», en modo monto (R14: un valor
-- guardado en otro nivel o en % se ignora). El único de `tarifa_valor` (NULLS NOT DISTINCT) deja a lo
-- sumo una fila. IVA = round(monto × % / 100, 2): el `round` de numeric de Postgres redondea la mitad
-- alejándose de cero, que para positivos es el HALF_UP de `ivaDe` (lo fija slt94-iva-equivalencia).
-- La marca «se recoge en tienda» no interviene (R18).
CREATE FUNCTION fulfillment_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tarifa_valor_id text;
  v_valor           numeric;
  v_iva_pct         numeric;
  v_monto           numeric(12, 2);
  v_iva             numeric(12, 2);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "tarifa_activacion" ta WHERE ta."organizacion_id" = NEW."organizacion_id") THEN
    RETURN NULL;
  END IF;

  SELECT tv."id", tv."valor", tv."iva_pct" INTO v_tarifa_valor_id, v_valor, v_iva_pct
    FROM "tarifa_valor" tv
   WHERE tv."organizacion_id" = NEW."organizacion_id"
     AND tv."concepto" = 'tienda_fulfillment'
     AND tv."tienda_id" = NEW."tienda_id"
     AND tv."zona_id" IS NULL AND tv."grupo_id" IS NULL
     AND tv."mensajero_id" IS NULL AND tv."vehiculo_id" IS NULL
     AND tv."modo" = 'monto';
  IF NOT FOUND OR v_valor IS NULL OR v_valor <= 0 THEN
    RETURN NULL;
  END IF;

  v_monto := round(v_valor, 2);
  v_iva := round(v_monto * v_iva_pct / 100, 2);

  PERFORM fulfillment_registrar_movimiento(
    NEW."organizacion_id", NEW."id", NEW."tienda_id", 1, 'cargo', 'creacion',
    v_monto, v_iva_pct, v_iva, v_tarifa_valor_id, NEW."created_at");
  RETURN NULL;
END $$;

-- Al eliminar o restaurar (R26–R29, R31, R39). La fila de la orden ya está bloqueada por el UPDATE, así
-- que dos operaciones sobre la misma orden se serializan y la segunda ve el movimiento de la primera.
--   · Eliminada y el último es un cargo: reverso `eliminacion` por su MISMO monto, IVA, % y tienda
--     congelados, con la fecha de la eliminación. El cargo no se toca (R26, R31).
--   · Viva y el último es un reverso POR ELIMINACIÓN: re-cobro `restauracion` por el MISMO monto e IVA
--     congelados, no por el valor de hoy, con el instante de la restauración (R29, D11). Ese «ahora» es
--     `now() AT TIME ZONE 'UTC'`, como en 20261028130200: las columnas `timestamp` guardan UTC, y
--     `now()::timestamp` depende del TimeZone de la sesión (medido: 5 h de desfase en local).
--   · Cualquier otro caso, nada: sin movimientos (R28); eliminar una cancelada, cuyo último ya es un
--     reverso; restaurar una cancelada y eliminada, cuyo reverso es `cancelacion_api` (R39).
CREATE FUNCTION fulfillment_al_cambiar_borrado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ultimo "orden_fulfillment_movimiento"%ROWTYPE;
BEGIN
  SELECT m.* INTO v_ultimo FROM "orden_fulfillment_movimiento" m
   WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."id"
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW."deleted_at" IS NOT NULL AND v_ultimo."tipo" = 'cargo' THEN
    PERFORM fulfillment_registrar_movimiento(
      NEW."organizacion_id", NEW."id", v_ultimo."tienda_id", v_ultimo."secuencia" + 1, 'reverso', 'eliminacion',
      v_ultimo."monto", v_ultimo."iva_pct", v_ultimo."iva", v_ultimo."tarifa_valor_id", NEW."deleted_at");
  ELSIF NEW."deleted_at" IS NULL AND v_ultimo."tipo" = 'reverso' AND v_ultimo."causa" = 'eliminacion' THEN
    PERFORM fulfillment_registrar_movimiento(
      NEW."organizacion_id", NEW."id", v_ultimo."tienda_id", v_ultimo."secuencia" + 1, 'cargo', 'restauracion',
      v_ultimo."monto", v_ultimo."iva_pct", v_ultimo."iva", v_ultimo."tarifa_valor_id", (now() AT TIME ZONE 'UTC'));
  END IF;
  RETURN NULL;
END $$;

-- Al cancelar por API (R30, R39, D12). Se detecta por la fila de la bitácora y no por el estado: la
-- cancelación lleva la orden a `devolviendo_a_tienda`, un estado que también alcanza la devolución real
-- (#42), que NO devuelve. Su único productor es `OrdenRepository.cancelarViaApi`, que la escribe en la
-- MISMA transacción que el cambio de estado. Bloquea la fila de la orden para serializarse con una
-- eliminación concurrente.
--   · Último = cargo: reverso `cancelacion_api` por su MISMO monto, IVA, % y tienda congelados, con el
--     instante de la fila de la bitácora.
--   · Otro caso, nada (una segunda cancelación no es posible —`conflict`—, y si lo fuera no duplica).
CREATE FUNCTION fulfillment_al_cancelar_por_api() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ultimo "orden_fulfillment_movimiento"%ROWTYPE;
BEGIN
  PERFORM 1 FROM "orden" o WHERE o."id" = NEW."orden_id" FOR UPDATE;

  SELECT m.* INTO v_ultimo FROM "orden_fulfillment_movimiento" m
   WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."orden_id"
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_ultimo."tipo" = 'cargo' THEN
    PERFORM fulfillment_registrar_movimiento(
      NEW."organizacion_id", NEW."orden_id", v_ultimo."tienda_id", v_ultimo."secuencia" + 1, 'reverso', 'cancelacion_api',
      v_ultimo."monto", v_ultimo."iva_pct", v_ultimo."iva", v_ultimo."tarifa_valor_id", NEW."created_at");
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION fulfillment_registrar_movimiento(text, text, text, integer, orden_fulfillment_movimiento_tipo,
  orden_fulfillment_movimiento_causa, numeric, numeric, numeric, text, timestamp(3)) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fulfillment_al_crear_orden() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fulfillment_al_cambiar_borrado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fulfillment_al_cancelar_por_api() FROM PUBLIC;

-- Una orden que nace ya borrada no se cobra.
CREATE TRIGGER "fulfillment_al_crear_orden" AFTER INSERT ON "orden"
  FOR EACH ROW WHEN (NEW."deleted_at" IS NULL)
  EXECUTE FUNCTION fulfillment_al_crear_orden();

-- Solo cuando `deleted_at` cambia de verdad: el resto de UPDATEs de `orden` no mueven el fulfillment.
CREATE TRIGGER "fulfillment_al_cambiar_borrado" AFTER UPDATE OF "deleted_at" ON "orden"
  FOR EACH ROW WHEN (OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at")
  EXECUTE FUNCTION fulfillment_al_cambiar_borrado();

-- Solo la fila de bitácora de la cancelación por API.
CREATE TRIGGER "fulfillment_al_cancelar_por_api" AFTER INSERT ON "orden_historial_estado"
  FOR EACH ROW WHEN (NEW."origen_tipo" = 'cancelacion_api')
  EXECUTE FUNCTION fulfillment_al_cancelar_por_api();
