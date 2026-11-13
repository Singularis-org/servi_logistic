-- SLT-60 (design §1, §3) — la confirmación del pago a la plataforma por el superadmin.
--
-- El pago es un `egreso_pago_plataforma` del libro de la caja (SL-45), que es append-only (REVOKE UPDATE), y la
-- factura cerrada es inmutable (SL118). Por eso ni el estado del pago ni el saldo de la factura son columnas de
-- esas tablas: van en dos tablas nuevas de NEGOCIO, con las piezas de `factura_plataforma` (20261111130100):
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK CASCADE y la política
--     `…_por_empresa`: la empresa solo LEE lo suyo (R25);
--   · el REVOKE de escritura a `servi_app` (R25): escribe SOLO `pago_plataforma_confirmar`, del dueño;
--   · el trigger `…_inmutable`: nadie cambia una fila, tampoco el dueño (SL060, R26);
--   · los triggers de misma empresa de las cuatro FK entre tablas de negocio y los de «sin cambio de empresa»,
--     GENERADOS con `tsx scripts/generar-misma-empresa.ts --faltantes` (bloque marcado abajo).
--     `confirmado_por` es el superadmin (`usuario.organizacion_id` nulo): el trigger de misma empresa lo deja
--     pasar (comprobado en T0.1 sobre `ajuste_caja_anulacion.anulado_por`), así que lleva FK.
--
-- Estados del pago, todos DERIVADOS: confirmado = tiene fila en `pago_plataforma_confirmacion`; anulado = tiene
-- su contra-asiento (`ingreso_ajuste`, origen `gasto`, `origen_id` = el pago); por confirmar = ni lo uno ni lo
-- otro. Se excluyen: confirmar rechaza un anulado (§3.4) y un trigger impide anular un confirmado (§3.5), los
-- dos bajo el mismo candado de la empresa.
--
-- Errores propios: SQLSTATE `SL060` con un JSON en MESSAGE (`{"codigo": …}` y, si aplica, `"factura_id"`), molde
-- de `SL024`. Los traduce `lib/db/errores-pago-plataforma.ts`. Códigos: `pago_no_encontrado`, `factura_no_valida`,
-- `monto_no_positivo`, `factura_repetida`, `supera_saldo`, `suma_distinta`, `pago_confirmado` e `inmutable`.
--
-- R28: NO inserta datos. Los pagos que ya existan quedan por confirmar.
--
-- ATOMICIDAD: BEGIN/COMMIT, como 20261111130100. A mano: `db:migrate:create` falla con P3006 en este repo.
-- Prefijo 20261116: va después de la mayor migración de `dev` al empezar (20261115120100_pago_satelite_checks).

BEGIN;

-- ─── 1. Tablas, CHECK, únicos, índice y FK (§1) ──────────────────────────────────────────────────────
CREATE TABLE "pago_plataforma_confirmacion" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "pago_id" TEXT NOT NULL,
    "confirmado_por" TEXT NOT NULL,
    "confirmado_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pago_plataforma_confirmacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pago_plataforma_aplicacion" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "confirmacion_id" TEXT NOT NULL,
    "factura_id" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "pago_plataforma_aplicacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pago_plataforma_aplicacion_monto_positivo" CHECK ("monto" > 0)
);

-- R19: una confirmación por pago. Una aplicación por factura dentro de una confirmación. Únicos por empresa,
-- con `organizacion_id` primero (guardia `unicos-por-empresa`).
CREATE UNIQUE INDEX "pago_plataforma_confirmacion_org_pago_key"
    ON "pago_plataforma_confirmacion"("organizacion_id", "pago_id");
CREATE UNIQUE INDEX "pago_plataforma_aplicacion_org_conf_factura_key"
    ON "pago_plataforma_aplicacion"("organizacion_id", "confirmacion_id", "factura_id");
-- El saldo de cada factura (`factura_plataforma_saldos`).
CREATE INDEX "pago_plataforma_aplicacion_org_factura_idx"
    ON "pago_plataforma_aplicacion"("organizacion_id", "factura_id");
-- SL-17/R2: toda tabla de negocio con un `@@index` que empiece por la empresa (guardia `organizacion-en-modelos`).
CREATE INDEX "pago_plataforma_confirmacion_organizacion_id_idx"
    ON "pago_plataforma_confirmacion"("organizacion_id");

-- CASCADE desde la empresa, como `factura_plataforma`. Las FK a `wallet_movimiento`, a `factura_plataforma` y a la
-- confirmación van SIN ACCIÓN: en el borrado en cascada de una empresa se comprueban al final de la sentencia.
-- `confirmado_por`, RESTRICT como el resto de los actores (quien confirmó es evidencia).
ALTER TABLE "pago_plataforma_confirmacion" ADD CONSTRAINT "pago_plataforma_confirmacion_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pago_plataforma_confirmacion" ADD CONSTRAINT "pago_plataforma_confirmacion_pago_id_fkey"
    FOREIGN KEY ("pago_id") REFERENCES "wallet_movimiento"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "pago_plataforma_confirmacion" ADD CONSTRAINT "pago_plataforma_confirmacion_confirmado_por_fkey"
    FOREIGN KEY ("confirmado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pago_plataforma_aplicacion" ADD CONSTRAINT "pago_plataforma_aplicacion_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pago_plataforma_aplicacion" ADD CONSTRAINT "pago_plataforma_aplicacion_confirmacion_id_fkey"
    FOREIGN KEY ("confirmacion_id") REFERENCES "pago_plataforma_confirmacion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "pago_plataforma_aplicacion" ADD CONSTRAINT "pago_plataforma_aplicacion_factura_id_fkey"
    FOREIGN KEY ("factura_id") REFERENCES "factura_plataforma"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ─── 2. RLS, políticas y REVOKE (R25) ────────────────────────────────────────────────────────────────
-- Sin el REVOKE, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría escritura a `servi_app` y la RLS se la
-- permitiría sobre sus filas.
ALTER TABLE "pago_plataforma_confirmacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pago_plataforma_confirmacion_por_empresa" ON "pago_plataforma_confirmacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
REVOKE INSERT, UPDATE, DELETE ON "pago_plataforma_confirmacion" FROM servi_app;

ALTER TABLE "pago_plataforma_aplicacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pago_plataforma_aplicacion_por_empresa" ON "pago_plataforma_aplicacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
REVOKE INSERT, UPDATE, DELETE ON "pago_plataforma_aplicacion" FROM servi_app;

-- ─── 3. Misma empresa y sin cambio de empresa (SL-17) ────────────────────────────────────────────────
-- GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`: no editar a mano.
--   · 4 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017).
--   · 2 tablas de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).

-- PagoPlataformaAplicacion.confirmacion
CREATE TRIGGER "sme_pago_plataforma_aplicacion_confirmacion__afaa0722" BEFORE INSERT OR UPDATE OF "confirmacion_id", "organizacion_id"
  ON "pago_plataforma_aplicacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('pago_plataforma_confirmacion', 'confirmacion_id', 'id');
-- PagoPlataformaAplicacion.factura
CREATE TRIGGER "sme_pago_plataforma_aplicacion_factura_id_e8394da8" BEFORE INSERT OR UPDATE OF "factura_id", "organizacion_id"
  ON "pago_plataforma_aplicacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('factura_plataforma', 'factura_id', 'id');
-- PagoPlataformaConfirmacion.confirmador
CREATE TRIGGER "sme_pago_plataforma_confirmacion_confirmado__61409317" BEFORE INSERT OR UPDATE OF "confirmado_por", "organizacion_id"
  ON "pago_plataforma_confirmacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'confirmado_por', 'id');
-- PagoPlataformaConfirmacion.pago
CREATE TRIGGER "sme_pago_plataforma_confirmacion_pago_id_37c51ebe" BEFORE INSERT OR UPDATE OF "pago_id", "organizacion_id"
  ON "pago_plataforma_confirmacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_movimiento', 'pago_id', 'id');

CREATE TRIGGER "pago_plataforma_confirmacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "pago_plataforma_confirmacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "pago_plataforma_aplicacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "pago_plataforma_aplicacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- ─── 4. Una confirmación o una aplicación no cambia (R26) ────────────────────────────────────────────
-- Para cualquier rol, el dueño incluido. Un cambio de empresa se deja pasar a `…_sin_cambio_de_empresa`, que
-- corre justo después (los BEFORE van por orden de nombre) y lo rechaza con SL017, como en `factura_plataforma`.
-- Borrar sigue cerrado para la app por el REVOKE; el dueño solo borra en las limpiezas de los tests y en cascada
-- desde `organizacion`.
CREATE FUNCTION pago_plataforma_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organizacion_id" IS DISTINCT FROM OLD."organizacion_id" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'SL060',
    MESSAGE = jsonb_build_object('codigo', 'inmutable', 'tabla', TG_TABLE_NAME, 'id', OLD."id")::text;
END $$;

CREATE TRIGGER "pago_plataforma_confirmacion_inmutable" BEFORE UPDATE ON "pago_plataforma_confirmacion"
  FOR EACH ROW EXECUTE FUNCTION pago_plataforma_inmutable();
CREATE TRIGGER "pago_plataforma_aplicacion_inmutable" BEFORE UPDATE ON "pago_plataforma_aplicacion"
  FOR EACH ROW EXECUTE FUNCTION pago_plataforma_inmutable();

-- ─── 5. El saldo de las facturas cerradas (§3.1; R14, R15, R17, R18, R31) ────────────────────────────
-- La ÚNICA definición del saldo: la usan lo disponible (§3.2), la confirmación (§3.4) y la lectura del
-- superadmin. Una fila por cerrada de `p_org`, de la más vieja a la más nueva; `saldo` = total − Σ aplicado, CON
-- SIGNO: una cerrada con total negativo (solo reversos) sale con saldo negativo y cuenta como saldo a favor en lo
-- disponible (R31, decisión del 2026-11-13). Nunca recibe aplicaciones: la confirmación pide saldo > 0.
CREATE FUNCTION factura_plataforma_saldos(p_org text)
  RETURNS TABLE(factura_id text, numero integer, desde_at timestamp, hasta_at timestamp,
                total numeric, aplicado numeric, saldo numeric)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f."id", f."numero", f."desde_at", f."hasta_at", f."total",
         COALESCE(a."aplicado", 0)::numeric(14, 2),
         (f."total" - COALESCE(a."aplicado", 0))::numeric(14, 2)
    FROM "factura_plataforma" f
    LEFT JOIN (SELECT ap."factura_id", SUM(ap."monto") AS "aplicado"
                 FROM "pago_plataforma_aplicacion" ap
                WHERE ap."organizacion_id" = p_org
                GROUP BY ap."factura_id") a ON a."factura_id" = f."id"
   WHERE f."organizacion_id" = p_org AND f."estado" = 'cerrada'
   ORDER BY f."desde_at";
$$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_saldos(text) FROM PUBLIC;

-- ─── 6. Lo disponible para registrar (§3.2; R2, R3, R12, R27) ────────────────────────────────────────
-- La ÚNICA definición de «por confirmar»: los `egreso_pago_plataforma` de `p_org` sin contra-asiento (la misma
-- condición que usaba el tope de SL-45) y sin confirmación. La usan lo disponible, la lectura del superadmin y el
-- contador del listado de Empresas. Por `created_at, id`.
CREATE FUNCTION pago_plataforma_por_confirmar(p_org text)
  RETURNS TABLE(id text, monto numeric, fecha_movimiento timestamp, descripcion text, registrado_por text,
                created_at timestamp)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", p."monto", p."fecha_movimiento", p."descripcion", p."registrado_por", p."created_at"
    FROM "wallet_movimiento" p
   WHERE p."organizacion_id" = p_org
     AND p."tipo" = 'egreso'
     AND p."categoria" = 'egreso_pago_plataforma'
     AND NOT EXISTS (
       SELECT 1 FROM "wallet_movimiento" a
        WHERE a."organizacion_id" = p_org
          AND a."tipo" = 'ingreso'
          AND a."categoria" = 'ingreso_ajuste'
          AND a."origen_tipo" = 'gasto'
          AND a."origen_id" = p."id"
     )
     AND NOT EXISTS (
       SELECT 1 FROM "pago_plataforma_confirmacion" c
        WHERE c."organizacion_id" = p_org AND c."pago_id" = p."id"
     )
   ORDER BY p."created_at", p."id";
$$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_por_confirmar(text) FROM PUBLIC;

-- Σ saldo de las cerradas − Σ por confirmar. Sin cerradas, `0 − Σ por confirmar` ≤ 0 (R3). Llamada desde el
-- trigger del tope tras el candado, ve los pagos ya confirmados por otra transacción (R5).
CREATE FUNCTION pago_plataforma_disponible_de(p_org text) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ((SELECT COALESCE(SUM(s."saldo"), 0) FROM factura_plataforma_saldos(p_org) s)
        - (SELECT COALESCE(SUM(c."monto"), 0) FROM pago_plataforma_por_confirmar(p_org) c))::numeric(14, 2);
$$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_disponible_de(text) FROM PUBLIC;

-- La envoltura para `servi_app` (`TopePagoPlataformaService`), con el control de contexto de
-- `plan_de_la_empresa`: con otra empresa o sin empresa, 42501.
CREATE FUNCTION pago_plataforma_disponible(p_org text) RETURNS numeric
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_org IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'pago_plataforma_disponible: solo se lee lo disponible de la empresa del contexto';
  END IF;
  RETURN pago_plataforma_disponible_de(p_org);
END $$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_disponible(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pago_plataforma_disponible(text) TO servi_app;

-- ─── 7. La confirmación (§3.4; R15–R17, R19–R22) ─────────────────────────────────────────────────────
-- Devuelve 'ok' o 'ya_confirmado'; si no, SL060. Todo bajo el MISMO candado de la empresa que el tope y el
-- bloqueo de la anulación: serializa la confirmación contra el registro, la anulación y otra confirmación (R19,
-- R21). Quien decide la suma y los saldos es esta función, no el servicio: entre la lectura del superadmin y la
-- confirmación otra confirmación pudo bajar un saldo.
--
-- `p_aplicaciones` es un arreglo de `{factura_id, monto}`. Cada monto se lleva a dos decimales ANTES de validar,
-- para que lo validado sea lo que se guarda en `numeric(14,2)` y Σ aplicaciones = monto del pago se cumpla
-- exacta. Algo que no sea un arreglo cuenta como vacío: `suma_distinta`.
--
-- No toca `factura_plataforma`, `wallet_movimiento`, `cobro_plataforma_movimiento` ni sus trazas (R16).
CREATE FUNCTION pago_plataforma_confirmar(p_org text, p_pago_id text, p_aplicaciones jsonb, p_por text,
                                          p_ahora timestamp) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pago          record;
  v_elemento      jsonb;
  v_factura_id    text;
  v_monto         numeric(14, 2);
  v_saldo         numeric(14, 2);
  v_suma          numeric(14, 2) := 0;
  v_vistas        text[] := ARRAY[]::text[];
  v_validas       jsonb := '[]'::jsonb;
  v_confirmacion  text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));

  SELECT p."id", p."monto" INTO v_pago
    FROM "wallet_movimiento" p
   WHERE p."id" = p_pago_id AND p."organizacion_id" = p_org
     AND p."tipo" = 'egreso' AND p."categoria" = 'egreso_pago_plataforma';
  -- R20: no existe, es de otra empresa o ya está anulado.
  IF v_pago."id" IS NULL OR EXISTS (
    SELECT 1 FROM "wallet_movimiento" a
     WHERE a."organizacion_id" = p_org AND a."tipo" = 'ingreso' AND a."categoria" = 'ingreso_ajuste'
       AND a."origen_tipo" = 'gasto' AND a."origen_id" = v_pago."id"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'pago_no_encontrado')::text;
  END IF;
  -- R19: confirmar dos veces no escribe nada.
  IF EXISTS (SELECT 1 FROM "pago_plataforma_confirmacion" c
              WHERE c."organizacion_id" = p_org AND c."pago_id" = v_pago."id") THEN
    RETURN 'ya_confirmado';
  END IF;

  FOR v_elemento IN
    SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_aplicaciones) = 'array'
                                            THEN p_aplicaciones ELSE '[]'::jsonb END) e
  LOOP
    v_factura_id := v_elemento ->> 'factura_id';
    -- R15: cerrada, de esta empresa y con saldo.
    SELECT s."saldo" INTO v_saldo FROM factura_plataforma_saldos(p_org) s WHERE s."factura_id" = v_factura_id;
    IF NOT FOUND OR v_saldo <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'factura_no_valida', 'factura_id', v_factura_id)::text;
    END IF;
    v_monto := round((v_elemento ->> 'monto')::numeric, 2);
    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'monto_no_positivo', 'factura_id', v_factura_id)::text;
    END IF;
    IF v_factura_id = ANY (v_vistas) THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'factura_repetida', 'factura_id', v_factura_id)::text;
    END IF;
    -- R17: nunca más que el saldo de su factura.
    IF v_monto > v_saldo THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'supera_saldo', 'factura_id', v_factura_id)::text;
    END IF;
    v_vistas := v_vistas || v_factura_id;
    v_suma := v_suma + v_monto;
    v_validas := v_validas || jsonb_build_array(jsonb_build_object('factura_id', v_factura_id, 'monto', v_monto));
  END LOOP;

  -- R17: el reparto suma exactamente el monto del pago.
  IF v_suma <> v_pago."monto" THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'suma_distinta')::text;
  END IF;

  INSERT INTO "pago_plataforma_confirmacion" ("organizacion_id", "pago_id", "confirmado_por", "confirmado_at")
  VALUES (p_org, v_pago."id", p_por, p_ahora)
  RETURNING "id" INTO v_confirmacion;

  INSERT INTO "pago_plataforma_aplicacion" ("organizacion_id", "confirmacion_id", "factura_id", "monto")
  SELECT p_org, v_confirmacion, a ->> 'factura_id', (a ->> 'monto')::numeric(14, 2)
    FROM jsonb_array_elements(v_validas) a;

  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_confirmar(text, text, jsonb, text, timestamp) FROM PUBLIC;

-- ─── 8. El tope del registro con lo disponible (§3.3; R2–R5) ─────────────────────────────────────────
-- Origen: 20261111130100 §9 (SLT-118). Cuerpo LITERAL salvo el cálculo: el candado por empresa y la salida por
-- clave repetida no cambian (SL-45 R10, R11); el tope pasa de la deuda a lo disponible para registrar (Σ saldo de
-- las cerradas − Σ por confirmar). La fila nueva aún no está insertada: no se cuenta a sí misma. Mismo ERRCODE y
-- CONSTRAINT, para que el mapeo de errores de la app no cambie. Corre para todos los roles (R4). El `down.sql`
-- repone el cuerpo de SLT-118.
CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_disponible numeric(14, 2);
BEGIN
  IF NEW."organizacion_id" IS NULL THEN
    RAISE EXCEPTION 'pago a la plataforma sin empresa' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));

  -- R11: el reenvío con la misma clave no es un pago nuevo. La app lo escribe con
  -- `INSERT … ON CONFLICT DO NOTHING`, y el trigger corre ANTES del choque con el único
  -- `(organizacion_id, clave_idempotencia)`: se deja pasar para que el ON CONFLICT lo descarte (o, en
  -- un INSERT sin ON CONFLICT, el único lo rechace con 23505). Ninguna de las dos escribe una fila.
  IF NEW."clave_idempotencia" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "wallet_movimiento" r
     WHERE r."organizacion_id" = NEW."organizacion_id" AND r."clave_idempotencia" = NEW."clave_idempotencia"
  ) THEN
    RETURN NEW;
  END IF;

  -- SLT-60 (R2, R3): solo se paga lo facturado y no comprometido por otro pago por confirmar. El texto del
  -- RAISE se deja literal: `caja-tesoreria-migration.test.ts` lo lee, y la app no lo muestra (pinta R36).
  v_disponible := pago_plataforma_disponible_de(NEW."organizacion_id");
  IF v_disponible <= 0 OR NEW."monto" > v_disponible THEN
    RAISE EXCEPTION 'el pago a la plataforma (%) supera la deuda vigente de la empresa (%)', NEW."monto", v_disponible
      USING ERRCODE = 'check_violation', CONSTRAINT = 'wallet_movimiento_tope_pago_plataforma';
  END IF;
  RETURN NEW;
END $$;

-- ─── 9. La empresa no anula un pago confirmado (§3.5; R10, R11, R21) ─────────────────────────────────
-- Cubre la anulación de la pantalla (`EgresoCajaAnulacionService`), el `reversarEgreso` heredado y el SQL a mano:
-- todos escriben el contra-asiento (`ingreso_ajuste`, origen `gasto`). Toma el mismo candado que la confirmación,
-- así que anular y confirmar a la vez el mismo pago no pueden ganar los dos (R21). En la anulación de la pantalla,
-- la constancia de `ajuste_caja_anulacion` va antes en la misma transacción y se revierte con este rechazo.
-- PARA SLT-143: cuando el superadmin anule un confirmado, habrá que retirar o condicionar este trigger.
CREATE FUNCTION pago_plataforma_no_anular_confirmado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."organizacion_id" IS NULL OR NEW."origen_id" IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));
  IF EXISTS (SELECT 1 FROM "pago_plataforma_confirmacion" c
              WHERE c."organizacion_id" = NEW."organizacion_id" AND c."pago_id" = NEW."origen_id") THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060',
      MESSAGE = jsonb_build_object('codigo', 'pago_confirmado', 'pago_id', NEW."origen_id")::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_no_anular_confirmado() FROM PUBLIC;

CREATE TRIGGER "pago_plataforma_no_anular_confirmado" BEFORE INSERT ON "wallet_movimiento"
  FOR EACH ROW WHEN (NEW."categoria" = 'ingreso_ajuste' AND NEW."origen_tipo" = 'gasto')
  EXECUTE FUNCTION pago_plataforma_no_anular_confirmado();

COMMIT;
