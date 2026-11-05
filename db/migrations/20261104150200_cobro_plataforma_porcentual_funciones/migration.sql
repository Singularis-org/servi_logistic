-- SLT-83 (design §2.3, §3; R6–R19, R24, R25) — el cobro porcentual por orden, en la base.
--
-- Por qué en la base (§3.1): el estado de una orden se cambia desde muchos repositorios. Un trigger sobre
-- `UPDATE OF estatus_id` los cubre a todos, en la misma transacción (R16), como el cobro de SL-40.
--
-- Las nueve piezas:
--   1. `orden_estado_es_final`: la copia en SQL de `ESTADOS_TERMINALES` (R19, §3.4). Un test la ata.
--   2. `cobro_plataforma_importe_porcentual`: el importe, en decimal exacto (R9).
--   3. `cobro_plataforma_tarifa_de`: DROP y CREATE (cambia el RETURNS TABLE). Gana `porcentaje` y `minimo`
--      y sigue siendo la única definición de la regla vigente (SLT-66 §3.2; R7).
--   4. `cobro_plataforma_porcentual_conciliar`: decide si la orden debe tener un cargo vigente y registra
--      el cargo o el reverso que falte. Es el ÚNICO sitio del invariante de R15 (§3.3).
--   5. `cobro_plataforma_al_crear_orden`: en modo porcentual congela y no carga (R6, R8).
--   6. `cobro_plataforma_al_cambiar_borrado`: una orden porcentual pasa por la conciliación (R14).
--   7. `cobro_plataforma_al_cambiar_estado` y su trigger: una orden porcentual concilia (R8, R12).
--   8. `plan_cobro_del_ciclo`: lo cobrado en el ciclo y las pendientes (R24; P1 opción A).
--   9. `plan_de_la_empresa`: gana el costeo porcentual (R23–R25).
--
-- Los `CREATE OR REPLACE` copian LITERALMENTE el cuerpo de su última versión, salvo lo que se nombra en su
-- cabecera. El reviewer los compara línea a línea; `down.sql` devuelve los de origen. `CREATE OR REPLACE`
-- conserva dueño, privilegios y triggers: el `GRANT` de `plan_de_la_empresa` a `servi_app` sigue.
--
-- Todas `SECURITY DEFINER` con `search_path` fijo y `REVOKE EXECUTE … FROM PUBLIC`, sin `GRANT` a
-- `servi_app` salvo `plan_de_la_empresa`, que conserva el suyo. La empresa sale siempre de la fila de la
-- orden, que la RLS de `orden` ya validó; el trigger de misma empresa de las dos tablas es la segunda red.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- 1. R19 (§3.4). La copia de `ESTADOS_TERMINALES` (`lib/types/order-status-transiciones.ts`). Si el dominio
-- gana un cuarto estado final, `cobro-porcentual-estados-finales.test.ts` cae y obliga a una migración.
CREATE FUNCTION orden_estado_es_final(p_estatus_id text) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM "order_status"
                  WHERE "id" = p_estatus_id AND "value" IN ('entregado', 'devuelta_a_tienda', 'incidente'));
END $$;
REVOKE EXECUTE ON FUNCTION orden_estado_es_final(text) FROM PUBLIC;

-- 2. R9. `round(numeric, 2)` redondea la mitad alejándose de cero: con importes `>= 0` es «mitad hacia
-- arriba». Un `monto_cobrar` vacío cuenta como 0, y el mínimo vacío como 0: nunca cae al global. El
-- máximo (`monto_cobrar` de DECIMAL(12,2) × 100 %) cabe en DECIMAL(12,2).
CREATE FUNCTION cobro_plataforma_importe_porcentual(p_monto numeric, p_pct numeric, p_minimo numeric)
  RETURNS numeric(12, 2)
  LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN GREATEST(round(COALESCE(p_monto, 0) * p_pct / 100, 2), COALESCE(p_minimo, 0))::numeric(12, 2);
END $$;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_importe_porcentual(numeric, numeric, numeric) FROM PUBLIC;

-- 3. Origen: 20261031140200 (SLT-66). DROP y CREATE: un `CREATE OR REPLACE` no puede cambiar el
-- `RETURNS TABLE`. Cambios: dos columnas más, `porcentaje` y `minimo`, y el escalón del plan con dos
-- modos. La excepción sigue primero (R7: gana sobre el plan porcentual). «Porcentual» es `porcentaje IS
-- NOT NULL`; entonces `monto` es NULL. `plan_de_la_empresa` y el trigger de alta la llaman por nombre:
-- plpgsql no registra la dependencia, así que el DROP no rompe nada (y las dos se recrean abajo).
DROP FUNCTION cobro_plataforma_tarifa_de(text);
CREATE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)
  RETURNS TABLE ("monto" numeric(12, 2), "fuente" cobro_plataforma_fuente, "porcentaje" numeric(5, 2), "minimo" numeric(12, 2))
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_excepcion numeric(12, 2);
  v_plan      numeric(12, 2);
  v_pct       numeric(5, 2);
  v_minimo    numeric(12, 2);
  v_global    numeric(12, 2);
BEGIN
  SELECT o."cobro_plataforma_por_orden", p."costo_por_orden", p."costo_por_orden_pct", p."costo_por_orden_minimo"
    INTO v_excepcion, v_plan, v_pct, v_minimo
    FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
   WHERE o."id" = p_organizacion_id;
  IF v_excepcion IS NOT NULL THEN RETURN QUERY SELECT v_excepcion, 'empresa'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2); RETURN; END IF;
  IF v_pct       IS NOT NULL THEN RETURN QUERY SELECT NULL::numeric(12,2), 'plan'::cobro_plataforma_fuente, v_pct, v_minimo;          RETURN; END IF;
  IF v_plan      IS NOT NULL THEN RETURN QUERY SELECT v_plan, 'plan'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);     RETURN; END IF;
  SELECT t."monto" INTO v_global FROM "cobro_plataforma_tarifa" t WHERE t."id";
  IF v_global    IS NOT NULL THEN RETURN QUERY SELECT v_global, 'global'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2); RETURN; END IF;
  RETURN QUERY SELECT 0::numeric(12,2), 'sin_configurar'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);
END $$;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_tarifa_de(text) FROM PUBLIC;

-- 4. §3.3 (R8, R12–R15). Cargo vigente ⇔ la orden no está anulada y está en un estado final. Lee la FILA
-- de la orden, no `NEW`: dentro de un AFTER trigger ya tiene los valores de la sentencia, y así sirve
-- igual para las tres entradas (alta, estado, anulación). Idempotente: llamarla dos veces deja lo mismo,
-- y una sentencia que cambia estado y anulación a la vez acaba igual que dos separadas (R15).
--   · cargo: fuente `plan`, con el `monto_cobrar` del instante y las condiciones congeladas (R8, R12, R14);
--   · reverso: el MISMO importe y fuente que el último cargo, con el instante de la anulación o `now()`.
-- La fila de la orden ya está bloqueada por la sentencia que dispara: dos operaciones sobre la misma orden
-- se serializan y la segunda ve el movimiento de la primera. El UNIQUE (empresa, orden, secuencia) es el
-- cerrojo de último recurso.
CREATE FUNCTION cobro_plataforma_porcentual_conciliar(p_orden_id text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cond   "cobro_plataforma_porcentual_orden"%ROWTYPE;
  v_orden  record;
  v_ultimo "cobro_plataforma_movimiento"%ROWTYPE;
  v_debe   boolean;
  v_tiene  boolean;
BEGIN
  SELECT c.* INTO v_cond FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = p_orden_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT o."organizacion_id", o."estatus_id", o."deleted_at", o."monto_cobrar" INTO v_orden
    FROM "orden" o WHERE o."id" = p_orden_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_debe := v_orden."deleted_at" IS NULL AND orden_estado_es_final(v_orden."estatus_id");

  SELECT m.* INTO v_ultimo FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = v_orden."organizacion_id" AND m."orden_id" = p_orden_id
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  v_tiene := FOUND AND v_ultimo."tipo" = 'cargo';

  IF v_debe AND NOT v_tiene THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, v_orden."organizacion_id", p_orden_id, COALESCE(v_ultimo."secuencia", 0) + 1,
            'cargo', 'plan',
            cobro_plataforma_importe_porcentual(v_orden."monto_cobrar", v_cond."porcentaje", v_cond."minimo"), now());
  ELSIF NOT v_debe AND v_tiene THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, v_orden."organizacion_id", p_orden_id, v_ultimo."secuencia" + 1, 'reverso',
            v_ultimo."fuente", v_ultimo."monto", COALESCE(v_orden."deleted_at", now()));
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_porcentual_conciliar(text) FROM PUBLIC;

-- 5. Origen: 20261031140200 (SLT-66). Un solo cambio: la rama porcentual (§3.2). Con porcentaje, congela
-- las condiciones del instante y concilia (R8: si nace en un estado final, se cobra ya); no registra el
-- cargo de alta (R6). Sin porcentaje, el resto es literal: cargo (y reverso si nace borrada).
CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monto  numeric(12, 2);
  v_fuente cobro_plataforma_fuente;
  v_pct    numeric(5, 2);
  v_minimo numeric(12, 2);
BEGIN
  SELECT t."monto", t."fuente", t."porcentaje", t."minimo"
    INTO v_monto, v_fuente, v_pct, v_minimo
    FROM cobro_plataforma_tarifa_de(NEW."organizacion_id") t;

  IF v_pct IS NOT NULL THEN
    INSERT INTO "cobro_plataforma_porcentual_orden" ("orden_id", "organizacion_id", "porcentaje", "minimo")
    VALUES (NEW."id", NEW."organizacion_id", v_pct, v_minimo);
    PERFORM cobro_plataforma_porcentual_conciliar(NEW."id");
    RETURN NULL;
  END IF;

  INSERT INTO "cobro_plataforma_movimiento"
    ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
  VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 1, 'cargo', v_fuente, v_monto, now());

  IF NEW."deleted_at" IS NOT NULL THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 2, 'reverso', v_fuente, v_monto, NEW."deleted_at");
  END IF;
  RETURN NULL;
END $$;

-- 6. Origen: 20261023130200 (SL-40). Una sola entrada nueva al principio: si la orden tiene condiciones
-- congeladas, concilia y sale (R14: recuperar recalcula con el `monto_cobrar` del instante). Las órdenes
-- fijas y las anteriores a la ficha siguen su camino de siempre (R11, R29).
CREATE OR REPLACE FUNCTION cobro_plataforma_al_cambiar_borrado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ultimo "cobro_plataforma_movimiento"%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = NEW."id") THEN
    PERFORM cobro_plataforma_porcentual_conciliar(NEW."id");
    RETURN NULL;
  END IF;

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

-- 7. R8, R12. Solo una orden porcentual concilia al cambiar de estado; las fijas no dependen del estado.
CREATE FUNCTION cobro_plataforma_al_cambiar_estado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = NEW."id") THEN
    PERFORM cobro_plataforma_porcentual_conciliar(NEW."id");
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_al_cambiar_estado() FROM PUBLIC;

CREATE TRIGGER "cobro_plataforma_al_cambiar_estado" AFTER UPDATE OF "estatus_id" ON "orden"
  FOR EACH ROW WHEN (OLD."estatus_id" IS DISTINCT FROM NEW."estatus_id")
  EXECUTE FUNCTION cobro_plataforma_al_cambiar_estado();

-- 8. R24 (P1 cerrada, opción A). Una sola definición de las dos cifras del ciclo:
--   · `cobrado`: Σ cargos − Σ reversos de la empresa con `ocurrido_at >= p_desde` (por la fecha del
--     movimiento: un ciclo cerrado no cambia). Usa `cobro_plataforma_movimiento_organizacion_id_ocurrido_at_idx`;
--   · `pendientes`: las órdenes porcentuales vivas creadas en el ciclo que aún no están en un estado final.
CREATE FUNCTION plan_cobro_del_ciclo(p_organizacion_id text, p_desde timestamp)
  RETURNS TABLE ("cobrado" numeric(12, 2), "pendientes" integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY SELECT
    (SELECT COALESCE(sum(CASE WHEN m."tipo" = 'cargo' THEN m."monto" ELSE -m."monto" END), 0)::numeric(12, 2)
       FROM "cobro_plataforma_movimiento" m
      WHERE m."organizacion_id" = p_organizacion_id AND m."ocurrido_at" >= p_desde),
    (SELECT count(*)::integer
       FROM "cobro_plataforma_porcentual_orden" c JOIN "orden" o ON o."id" = c."orden_id"
      WHERE c."organizacion_id" = p_organizacion_id
        AND o."created_at" >= p_desde
        AND o."deleted_at" IS NULL
        AND NOT orden_estado_es_final(o."estatus_id"));
END $$;
REVOKE EXECUTE ON FUNCTION plan_cobro_del_ciclo(text, timestamp) FROM PUBLIC;

-- 9. Origen: 20261104130000 (ajuste planes-custom). Tres cambios (R23–R25): `costo_vigente` gana
-- `porcentaje` y `minimo` (y `monto` puede ser null); la clave nueva `cobro_ciclo`, de la función de
-- arriba; y `costo_por_orden_pct`, `costo_por_orden_minimo` del plan. El contexto (`42501`), el
-- `search_path`, el REVOKE y el GRANT no cambian (R25).
CREATE OR REPLACE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_de_la_empresa: solo se lee el plan de la empresa del contexto';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'nombre', p."nombre",
      'precio_mensual', p."precio_mensual"::text,
      'precio_anual', p."precio_anual"::text,
      'descuento_anual_pct', p."descuento_anual_pct"::text,
      'costo_por_orden', p."costo_por_orden"::text,
      'costo_por_orden_pct', p."costo_por_orden_pct"::text,
      'costo_por_orden_minimo', p."costo_por_orden_minimo"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente", 'porcentaje', t."porcentaje"::text, 'minimo', t."minimo"::text) FROM cobro_plataforma_tarifa_de(o."id") t),
      'cobro_ciclo', (SELECT jsonb_build_object('cobrado', c."cobrado"::text, 'pendientes', c."pendientes")
                        FROM plan_cobro_del_ciclo(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora)) c),
      'tipo_cobro', o."plan_tipo_cobro",
      'tope_ordenes_ciclo', p."tope_ordenes_ciclo",
      'tope_api_keys', p."tope_api_keys",
      'topes_rol', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb),
      'modulos', COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb),
      'ciclo_inicio', plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'ciclo_corto_desde', o."plan_ciclo_corto_desde_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora)),
        'api_keys', plan_uso_api_keys(o."id"),
        'admin', plan_uso_rol(o."id", 'admin'::rol_value),
        'mensajero', plan_uso_rol(o."id", 'mensajero'::rol_value),
        'admin_tienda', plan_uso_rol(o."id", 'Admin Tienda'::rol_value),
        'admin_satelite', plan_uso_rol(o."id", 'adminSatelite'::rol_value)),
      -- Solo la fecha y la versión: NUNCA `avisos_al_programar` (nombra otras empresas) ni el actor (R9).
      'cambio', (SELECT jsonb_build_object('vigente_desde', c."vigente_desde", 'version', c."version")
                   FROM "plan_cambio_programado" c WHERE c."plan_id" = p."id"))
      FROM "organizacion" o JOIN "plan" p ON p."id" = o."plan_id"
     WHERE o."id" = p_organizacion_id);
END $$;
