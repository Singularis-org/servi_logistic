-- SL-40 (design §2.2) — quién escribe los cargos y reversos: la base, con dos triggers sobre `orden`.
--
-- Por qué en la base y no en el código (design §12, alternativa 2):
--   · «por cualquier vía» (D3) se cumple por construcción. La pantalla, la carga masiva y la API
--     acaban en el mismo INSERT, y el borrado por pantalla, el borrado por API y la recuperación en
--     el mismo UPDATE OF deleted_at. Un camino nuevo que nadie se acuerde de enganchar también
--     genera su cargo;
--   · misma transacción (R12, R13, R15): el trigger corre dentro de la sentencia, y si la transacción
--     se deshace, el cargo se deshace con ella;
--   · la empresa no puede tocarlos (R8): la tabla no es escribible por `servi_app`, y estas funciones
--     son SECURITY DEFINER, así que escriben como dueño.
--
-- Al ser SECURITY DEFINER, la RLS no frena un error de estas funciones. Por eso:
--   · `search_path` fijo;
--   · EXECUTE revocado a PUBLIC;
--   · la empresa sale siempre de NEW.organizacion_id, que la RLS de `orden` ya validó;
--   · el trigger de misma empresa de `cobro_plataforma_movimiento` es la segunda red.
--
-- Los movimientos de una orden ALTERNAN siempre (cargo, reverso, cargo…), empezando por un cargo.
-- Quien decide qué toca es el ÚLTIMO movimiento, no OLD.deleted_at. Así, reintentar una operación
-- no registra nada (R17), y tampoco reescribir la fecha de una orden ya borrada. El único
-- (organizacion_id, orden_id, secuencia) es el cerrojo de último recurso.
--
-- En carpeta propia: se pueden apagar sin borrar los cargos ya registrados. Sin backfill (D8): una
-- orden anterior no tiene movimientos, y anularla o recuperarla no registra nada (R18).

-- Al crear: un cargo por la tarifa vigente de la empresa en ese instante (R3, R12, R14, R19).
-- Su excepción si la tiene; si no, el valor global; si no hay ninguno, 0.00 «sin configurar» (D11).
-- Sin impuestos (P2).
CREATE FUNCTION cobro_plataforma_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monto  numeric(12, 2);
  v_fuente cobro_plataforma_fuente;
BEGIN
  SELECT o."cobro_plataforma_por_orden" INTO v_monto FROM "organizacion" o WHERE o."id" = NEW."organizacion_id";
  IF v_monto IS NOT NULL THEN
    v_fuente := 'empresa';
  ELSE
    SELECT t."monto" INTO v_monto FROM "cobro_plataforma_tarifa" t WHERE t."id";
    IF v_monto IS NOT NULL THEN
      v_fuente := 'global';
    ELSE
      v_monto := 0;
      v_fuente := 'sin_configurar';
    END IF;
  END IF;

  INSERT INTO "cobro_plataforma_movimiento"
    ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
  VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 1, 'cargo', v_fuente, v_monto, now());
  RETURN NULL;
END $$;

-- Al anular o recuperar (D6, D7). La fila de la orden ya está bloqueada por el UPDATE, así que dos
-- operaciones sobre la misma orden se serializan y la segunda ve el movimiento de la primera.
--   · Anulada y el último es un cargo: reverso por su MISMO importe y fuente, con el instante de la
--     anulación. El cargo no se toca (R15).
--   · Viva y el último es un reverso: cargo por el MISMO importe que el revertido, no por la tarifa
--     de hoy. Recuperar deshace un error; no es una orden nueva (R16).
--   · Sin movimientos (orden anterior a la ficha, D8), o un último movimiento que no toca: nada
--     (R17, R18).
CREATE FUNCTION cobro_plataforma_al_cambiar_borrado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ultimo "cobro_plataforma_movimiento"%ROWTYPE;
BEGIN
  SELECT m.* INTO v_ultimo FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."id"
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW."deleted_at" IS NOT NULL AND v_ultimo."tipo" = 'cargo' THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", v_ultimo."secuencia" + 1, 'reverso',
            v_ultimo."fuente", v_ultimo."monto", NEW."deleted_at");
  ELSIF NEW."deleted_at" IS NULL AND v_ultimo."tipo" = 'reverso' THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", v_ultimo."secuencia" + 1, 'cargo',
            v_ultimo."fuente", v_ultimo."monto", now());
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION cobro_plataforma_al_crear_orden() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_al_cambiar_borrado() FROM PUBLIC;

-- Una orden que nace ya borrada no se cobra (no existe esa vía hoy, pero no se le inventa un cargo).
CREATE TRIGGER "cobro_plataforma_al_crear_orden" AFTER INSERT ON "orden"
  FOR EACH ROW WHEN (NEW."deleted_at" IS NULL)
  EXECUTE FUNCTION cobro_plataforma_al_crear_orden();

-- Solo cuando `deleted_at` cambia de verdad: el resto de UPDATEs de `orden` (estado, guía, la
-- cancelación por API, que no es una anulación: P3) no pagan nada.
CREATE TRIGGER "cobro_plataforma_al_cambiar_borrado" AFTER UPDATE OF "deleted_at" ON "orden"
  FOR EACH ROW WHEN (OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at")
  EXECUTE FUNCTION cobro_plataforma_al_cambiar_borrado();
