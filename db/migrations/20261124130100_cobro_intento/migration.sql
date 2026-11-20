-- SLT-226 (design §1, §3) — el cobro en línea de una factura de la plataforma: el intento, su máquina de estados,
-- los eventos del proveedor y el registro del pago aprobado, con la idempotencia en tres capas.
--
-- Piezas:
--   · la tabla de NEGOCIO `cobro_intento` (§1.1), con las piezas de `pago_plataforma_confirmacion`
--     (20261116120000): `organizacion_id` con el DEFAULT de la empresa de la transacción, FK CASCADE, la política
--     `…_por_empresa` (la empresa solo LEE lo suyo, R26) y el REVOKE de escritura a `servi_app`. Sin trigger de
--     borrado (T0.3, decisión del humano del 2026-11-20): el borrado lo cierra el REVOKE, como en SLT-60, y el
--     dueño sí borra en las limpiezas de los tests y de la demo;
--   · la tabla de PLATAFORMA `cobro_webhook_evento` (§1.2): sin empresa, sin acceso para `servi_app`;
--   · `pago_plataforma_confirmacion` admite la confirmación sin persona del pago en línea (§1.4);
--   · `_pago_plataforma_aplicar` con `p_en_linea` (§3.6) y el tope que deja pasar el pago en línea (§3.7);
--   · las funciones del dueño de §3.1, §3.2, §3.3, §3.5 y §3.8, y los triggers que anulan un intento vivo cuando
--     cambia el saldo de su factura (§3.4);
--   · la enmienda del 2026-11-20 (§12): varios proveedores, el método del cobro y la marca a mano del superadmin.
--
-- Todas las funciones nuevas son del dueño (`SECURITY DEFINER`, `search_path = public, pg_temp`), sin EXECUTE para
-- `servi_app`: la app las llama en `comoPlataforma`. Toman primero el candado `pago_plataforma:<org>` de SLT-60, así
-- que se serializan con la confirmación, el registro por fuera y la anulación de la misma empresa. Escriben
-- `organizacion_id` explícito: corren quizá sin `app.organizacion_id`, y el DEFAULT daría NULL.
--
-- Errores propios: SQLSTATE `SL226` con un JSON en MESSAGE (`{"codigo": "transicion_invalida" | "columna_fija"}`).
-- Solo salen si alguien salta las funciones.
--
-- R28: NO inserta datos. Las confirmaciones que ya existan quedan con `en_linea = false` (el DEFAULT del
-- `ADD COLUMN`, que no dispara `…_inmutable`) y con su `confirmado_por`.
--
-- ATOMICIDAD: BEGIN/COMMIT, a mano (`db:migrate:create` falla con P3006 en este repo). Va después de
-- 20261124130000_cobro_historial_enum, que añade los valores del historial que estas funciones escriben (55P04).

BEGIN;

-- ─── 1. `cobro_intento` (§1.1) ───────────────────────────────────────────────────────────────────────
CREATE TABLE "cobro_intento" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "factura_id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "monto_local" DECIMAL(14,2) NOT NULL,
    "moneda_local" CHAR(3) NOT NULL,
    "moneda_cobro" CHAR(3) NOT NULL,
    "monto_cobrado" DECIMAL(14,2) NOT NULL,
    "tasa" DECIMAL(18,8),
    "tasa_fuente" TEXT,
    "tasa_at" TIMESTAMP(3),
    "estado" TEXT NOT NULL,
    "motivo_anulacion" TEXT,
    "id_externo" TEXT,
    "pago_proveedor_id" TEXT,
    "pago_id" TEXT,
    "creado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "estado_at" TIMESTAMP(3) NOT NULL,
    "aprobado_at" TIMESTAMP(3),

    CONSTRAINT "cobro_intento_pkey" PRIMARY KEY ("id"),
    -- R30, R31 (enmienda del 2026-11-20): conjuntos cerrados, sin matriz proveedor × método (§12.1).
    CONSTRAINT "cobro_intento_proveedor" CHECK ("proveedor" IN ('rebill', 'wompi', 'global66')),
    CONSTRAINT "cobro_intento_metodo" CHECK ("metodo" IN ('tarjeta', 'recurrente', 'transferencia')),
    CONSTRAINT "cobro_intento_estado" CHECK ("estado" IN ('creado', 'pendiente', 'aprobado', 'rechazado', 'expirado',
                                                          'anulado', 'devuelto', 'contracargo')),
    -- R6: en decimal y mayores que 0.
    CONSTRAINT "cobro_intento_montos_positivos" CHECK ("monto_local" > 0 AND "monto_cobrado" > 0
                                                       AND ("tasa" IS NULL OR "tasa" > 0)),
    -- R6: o se cobra en la moneda local (lo cobrado es lo local y no hay foto), o en otra con la foto entera.
    CONSTRAINT "cobro_intento_conversion" CHECK (
      ("moneda_cobro" = "moneda_local" AND "monto_cobrado" = "monto_local"
       AND "tasa" IS NULL AND "tasa_fuente" IS NULL AND "tasa_at" IS NULL)
      OR ("moneda_cobro" <> "moneda_local"
          AND "tasa" IS NOT NULL AND "tasa_fuente" IS NOT NULL AND "tasa_at" IS NOT NULL)),
    -- R9: un intento cobrado tiene el pago del proveedor y su «Pago a la plataforma» en el libro.
    CONSTRAINT "cobro_intento_pago_completo" CHECK (
      "estado" NOT IN ('aprobado', 'devuelto', 'contracargo')
      OR ("pago_proveedor_id" IS NOT NULL AND "pago_id" IS NOT NULL)),
    CONSTRAINT "cobro_intento_motivo" CHECK (
      ("estado" = 'anulado') = ("motivo_anulacion" IS NOT NULL)
      AND ("motivo_anulacion" IS NULL OR "motivo_anulacion" IN ('saldo_cambiado', 'clave_distinta')))
);

-- Capa 1 (R4): un solo intento vivo por factura, para cualquier rol y por cualquier camino.
CREATE UNIQUE INDEX "cobro_intento_un_vivo_por_factura"
    ON "cobro_intento"("organizacion_id", "factura_id") WHERE "estado" IN ('creado', 'pendiente');
-- GLOBALES a propósito (`UNICOS_SIN_EMPRESA`): el webhook llega sin empresa, y un id del proveedor lleva a un solo
-- intento en toda la plataforma (R10). El de `pago_proveedor_id` es la capa 3 (R20).
CREATE UNIQUE INDEX "cobro_intento_proveedor_id_externo_key" ON "cobro_intento"("proveedor", "id_externo");
CREATE UNIQUE INDEX "cobro_intento_proveedor_pago_key" ON "cobro_intento"("proveedor", "pago_proveedor_id");
-- Un pago del libro, un intento.
CREATE UNIQUE INDEX "cobro_intento_org_pago_key" ON "cobro_intento"("organizacion_id", "pago_id");
-- R27: los intentos de una factura, del más nuevo al más viejo.
CREATE INDEX "cobro_intento_org_factura_idx" ON "cobro_intento"("organizacion_id", "factura_id", "created_at" DESC);
-- SL-17/R2 (guardia `organizacion-en-modelos`).
CREATE INDEX "cobro_intento_organizacion_id_idx" ON "cobro_intento"("organizacion_id");

-- CASCADE desde la empresa, como la confirmación. Sin acción hacia la factura y el libro: en el borrado en cascada
-- de una empresa se comprueban al final de la sentencia. `pago_id` es DIFERIDA: §3.5 pasa el intento a `aprobado`
-- (con el id del movimiento) ANTES de escribir el movimiento, para que el tope encuentre el intento aprobado y para
-- que la aplicación del pago no anule su propio intento (§3.4). `creado_por`, RESTRICT como el resto de los actores.
ALTER TABLE "cobro_intento" ADD CONSTRAINT "cobro_intento_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobro_intento" ADD CONSTRAINT "cobro_intento_factura_id_fkey"
    FOREIGN KEY ("factura_id") REFERENCES "factura_plataforma"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "cobro_intento" ADD CONSTRAINT "cobro_intento_pago_id_fkey"
    FOREIGN KEY ("pago_id") REFERENCES "wallet_movimiento"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "cobro_intento" ADD CONSTRAINT "cobro_intento_creado_por_fkey"
    FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R26. Sin el REVOKE, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría escritura a `servi_app`, y con ella la
-- empresa podría fabricar la salida del tope de §3.7. Es también lo único que cierra el borrado (R8).
ALTER TABLE "cobro_intento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobro_intento_por_empresa" ON "cobro_intento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
REVOKE INSERT, UPDATE, DELETE ON "cobro_intento" FROM servi_app;

-- Misma empresa y sin cambio de empresa (SL-17).
-- GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`: no editar a mano.
--   · 3 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017). `pago_id` se escribe antes que
--     su fila del libro (§3.5): el trigger no la encuentra y la deja pasar, y la FK diferida la comprueba al final.
--   · 1 tabla de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).

-- CobroIntento.creador
CREATE TRIGGER "sme_cobro_intento_creado_por_5174327f" BEFORE INSERT OR UPDATE OF "creado_por", "organizacion_id"
  ON "cobro_intento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'creado_por', 'id');
-- CobroIntento.factura
CREATE TRIGGER "sme_cobro_intento_factura_id_429c0086" BEFORE INSERT OR UPDATE OF "factura_id", "organizacion_id"
  ON "cobro_intento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('factura_plataforma', 'factura_id', 'id');
-- CobroIntento.pago
CREATE TRIGGER "sme_cobro_intento_pago_id_767e64c8" BEFORE INSERT OR UPDATE OF "pago_id", "organizacion_id"
  ON "cobro_intento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_movimiento', 'pago_id', 'id');

CREATE TRIGGER "cobro_intento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cobro_intento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- R7, R8: los estados solo avanzan por la tabla de R7 y lo fijo no cambia, para TODOS los roles (el dueño incluido),
-- como `pago_plataforma_inmutable`. Un cambio de empresa ya lo rechazó `…_sin_cambio_de_empresa`, que corre antes
-- (los BEFORE van por orden de nombre); aquí se rechaza igual por si ese trigger faltara.
CREATE FUNCTION cobro_intento_solo_avanza() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."estado" IS DISTINCT FROM 'creado' OR NEW."motivo_anulacion" IS NOT NULL OR NEW."id_externo" IS NOT NULL
       OR NEW."pago_proveedor_id" IS NOT NULL OR NEW."pago_id" IS NOT NULL OR NEW."aprobado_at" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'SL226',
        MESSAGE = jsonb_build_object('codigo', 'transicion_invalida', 'de', NULL, 'a', NEW."estado")::text;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."estado" IS DISTINCT FROM OLD."estado" AND NOT (
       (OLD."estado" = 'creado'    AND NEW."estado" IN ('pendiente', 'anulado'))
    OR (OLD."estado" = 'pendiente' AND NEW."estado" IN ('aprobado', 'rechazado', 'expirado', 'anulado'))
    OR (OLD."estado" = 'aprobado'  AND NEW."estado" IN ('devuelto', 'contracargo'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'SL226',
      MESSAGE = jsonb_build_object('codigo', 'transicion_invalida', 'id', OLD."id",
                                   'de', OLD."estado", 'a', NEW."estado")::text;
  END IF;

  -- R8, R33: lo que define el cobro (también el método) no cambia; los ids externos, el pago del libro, el motivo y la hora de aprobación
  -- solo pasan de vacío a un valor.
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."organizacion_id" IS DISTINCT FROM OLD."organizacion_id"
     OR NEW."factura_id" IS DISTINCT FROM OLD."factura_id"
     OR NEW."proveedor" IS DISTINCT FROM OLD."proveedor"
     OR NEW."metodo" IS DISTINCT FROM OLD."metodo"
     OR NEW."clave" IS DISTINCT FROM OLD."clave"
     OR NEW."monto_local" IS DISTINCT FROM OLD."monto_local"
     OR NEW."moneda_local" IS DISTINCT FROM OLD."moneda_local"
     OR NEW."moneda_cobro" IS DISTINCT FROM OLD."moneda_cobro"
     OR NEW."monto_cobrado" IS DISTINCT FROM OLD."monto_cobrado"
     OR NEW."tasa" IS DISTINCT FROM OLD."tasa"
     OR NEW."tasa_fuente" IS DISTINCT FROM OLD."tasa_fuente"
     OR NEW."tasa_at" IS DISTINCT FROM OLD."tasa_at"
     OR NEW."creado_por" IS DISTINCT FROM OLD."creado_por"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
     OR (OLD."id_externo" IS NOT NULL AND NEW."id_externo" IS DISTINCT FROM OLD."id_externo")
     OR (OLD."pago_proveedor_id" IS NOT NULL AND NEW."pago_proveedor_id" IS DISTINCT FROM OLD."pago_proveedor_id")
     OR (OLD."pago_id" IS NOT NULL AND NEW."pago_id" IS DISTINCT FROM OLD."pago_id")
     OR (OLD."motivo_anulacion" IS NOT NULL AND NEW."motivo_anulacion" IS DISTINCT FROM OLD."motivo_anulacion")
     OR (OLD."aprobado_at" IS NOT NULL AND NEW."aprobado_at" IS DISTINCT FROM OLD."aprobado_at") THEN
    RAISE EXCEPTION USING ERRCODE = 'SL226',
      MESSAGE = jsonb_build_object('codigo', 'columna_fija', 'id', OLD."id")::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_intento_solo_avanza() FROM PUBLIC;

CREATE TRIGGER "cobro_intento_solo_avanza" BEFORE INSERT OR UPDATE ON "cobro_intento"
  FOR EACH ROW EXECUTE FUNCTION cobro_intento_solo_avanza();

-- ─── 2. `cobro_webhook_evento` (§1.2; R12, R13, R26) ─────────────────────────────────────────────────
-- De plataforma: el evento llega sin empresa, y uno que no encuentra intento no es de ninguna. Sin el cuerpo del
-- evento ni datos de la tarjeta o del pagador (R12). `intento_id` es opaco, sin FK: la fila sobrevive al intento.
CREATE TABLE "cobro_webhook_evento" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "proveedor" TEXT NOT NULL,
    "log_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "pago_proveedor_id" TEXT,
    "intento_id" TEXT,
    "recibido_at" TIMESTAMP(3) NOT NULL,
    "procesado_at" TIMESTAMP(3),
    "resultado" TEXT,

    CONSTRAINT "cobro_webhook_evento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cobro_webhook_evento_proveedor" CHECK ("proveedor" IN ('rebill', 'wompi', 'global66')),
    CONSTRAINT "cobro_webhook_evento_resultado" CHECK (
      "resultado" IS NULL OR "resultado" IN ('aplicado', 'sin_cambio', 'sin_intento', 'requiere_revision')),
    -- Cerrado = con hora y resultado, los dos a la vez.
    CONSTRAINT "cobro_webhook_evento_cierre" CHECK (("procesado_at" IS NULL) = ("resultado" IS NULL))
);

-- Capa 2 (R12, R13): un evento por (proveedor, log_id). Tabla de plataforma: no pasa por `unicos-por-empresa`.
CREATE UNIQUE INDEX "cobro_webhook_evento_proveedor_log_key" ON "cobro_webhook_evento"("proveedor", "log_id");

-- R26: ninguna empresa lo lee ni lo escribe (el patrón de `historial_plataforma`).
ALTER TABLE "cobro_webhook_evento" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "cobro_webhook_evento" FROM servi_app;

-- Lo recibido no cambia; solo el cierre (hora, resultado e intento) pasa de vacío a un valor, una vez.
CREATE FUNCTION cobro_webhook_evento_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."proveedor" IS DISTINCT FROM OLD."proveedor"
     OR NEW."log_id" IS DISTINCT FROM OLD."log_id"
     OR NEW."tipo" IS DISTINCT FROM OLD."tipo"
     OR NEW."pago_proveedor_id" IS DISTINCT FROM OLD."pago_proveedor_id"
     OR NEW."recibido_at" IS DISTINCT FROM OLD."recibido_at"
     OR (OLD."procesado_at" IS NOT NULL AND NEW."procesado_at" IS DISTINCT FROM OLD."procesado_at")
     OR (OLD."resultado" IS NOT NULL AND NEW."resultado" IS DISTINCT FROM OLD."resultado")
     OR (OLD."intento_id" IS NOT NULL AND NEW."intento_id" IS DISTINCT FROM OLD."intento_id") THEN
    RAISE EXCEPTION USING ERRCODE = 'SL226',
      MESSAGE = jsonb_build_object('codigo', 'columna_fija', 'tabla', TG_TABLE_NAME, 'id', OLD."id")::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_webhook_evento_inmutable() FROM PUBLIC;

CREATE TRIGGER "cobro_webhook_evento_inmutable" BEFORE UPDATE ON "cobro_webhook_evento"
  FOR EACH ROW EXECUTE FUNCTION cobro_webhook_evento_inmutable();

-- ─── 3. La confirmación sin persona del pago en línea (§1.4; R17, R28) ───────────────────────────────
-- DDL: no dispara `pago_plataforma_confirmacion_inmutable`. Las confirmaciones existentes quedan con su persona y
-- `en_linea = false`; el CHECK hace que una de SLT-60 o SLT-143 siga necesitando persona.
ALTER TABLE "pago_plataforma_confirmacion" ALTER COLUMN "confirmado_por" DROP NOT NULL;
ALTER TABLE "pago_plataforma_confirmacion" ADD COLUMN "en_linea" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pago_plataforma_confirmacion" ADD CONSTRAINT "pago_plataforma_confirmacion_quien"
    CHECK ("confirmado_por" IS NOT NULL OR "en_linea");

-- ─── 4. El reparto con la marca del pago en línea (§3.6) ────────────────────────────────────────────
-- Cuerpo de 20261121130000 §4 LITERAL salvo que la confirmación guarda `en_linea`. Sin EXECUTE para nadie más que
-- el dueño.
CREATE FUNCTION _pago_plataforma_aplicar(p_org text, p_pago_id text, p_monto numeric, p_aplicaciones jsonb,
                                         p_por text, p_ahora timestamp, p_por_fuera boolean,
                                         p_en_linea boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_elemento      jsonb;
  v_factura_id    text;
  v_monto         numeric(14, 2);
  v_saldo         numeric(14, 2);
  v_suma          numeric(14, 2) := 0;
  v_vistas        text[] := ARRAY[]::text[];
  v_validas       jsonb := '[]'::jsonb;
  v_confirmacion  text;
BEGIN
  FOR v_elemento IN
    SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_aplicaciones) = 'array'
                                            THEN p_aplicaciones ELSE '[]'::jsonb END) e
  LOOP
    v_factura_id := v_elemento ->> 'factura_id';
    -- SLT-60 R15: cerrada, de esta empresa y con saldo.
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
    -- SLT-60 R17: nunca más que el saldo de su factura.
    IF v_monto > v_saldo THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'supera_saldo', 'factura_id', v_factura_id)::text;
    END IF;
    v_vistas := v_vistas || v_factura_id;
    v_suma := v_suma + v_monto;
    v_validas := v_validas || jsonb_build_array(jsonb_build_object('factura_id', v_factura_id, 'monto', v_monto));
  END LOOP;

  -- SLT-60 R17: el reparto suma exactamente el monto del pago.
  IF v_suma <> p_monto THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'suma_distinta')::text;
  END IF;

  INSERT INTO "pago_plataforma_confirmacion"
    ("organizacion_id", "pago_id", "confirmado_por", "confirmado_at", "por_fuera", "en_linea")
  VALUES (p_org, p_pago_id, p_por, p_ahora, p_por_fuera, p_en_linea)
  RETURNING "id" INTO v_confirmacion;

  INSERT INTO "pago_plataforma_aplicacion" ("organizacion_id", "confirmacion_id", "factura_id", "monto")
  SELECT p_org, v_confirmacion, a ->> 'factura_id', (a ->> 'monto')::numeric(14, 2)
    FROM jsonb_array_elements(v_validas) a;
END $$;
REVOKE EXECUTE ON FUNCTION _pago_plataforma_aplicar(text, text, numeric, jsonb, text, timestamp, boolean, boolean)
  FROM PUBLIC;

-- La de 7 argumentos delega en la nueva sin la marca: `pago_plataforma_confirmar` y
-- `pago_plataforma_registrar_por_fuera` la siguen llamando igual (R28). El REVOKE se conserva con el OR REPLACE.
CREATE OR REPLACE FUNCTION _pago_plataforma_aplicar(p_org text, p_pago_id text, p_monto numeric, p_aplicaciones jsonb,
                                                    p_por text, p_ahora timestamp, p_por_fuera boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM _pago_plataforma_aplicar(p_org, p_pago_id, p_monto, p_aplicaciones, p_por, p_ahora, p_por_fuera, false);
END $$;

-- ─── 5. El tope deja pasar el pago en línea (§3.7; R22, decisión P1) ────────────────────────────────
-- Cuerpo de 20261116120000 §8 con UNA salida más, después del candado: el movimiento de un intento ya `aprobado`.
-- Ese intento solo lo escribe `cobro_registrar_pago_aprobado` (`servi_app` no escribe `cobro_intento`), así que la
-- empresa no puede fabricar la salida. Todo lo demás sigue sujeto al tope de SLT-60. El REVOKE se conserva.
CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_disponible numeric(14, 2);
BEGIN
  IF NEW."organizacion_id" IS NULL THEN
    RAISE EXCEPTION 'pago a la plataforma sin empresa' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));

  -- SLT-226 (R22): el pago aprobado en línea se registra aunque los pagos por confirmar dejen lo disponible por
  -- debajo de su monto. Su saldo ya lo validó `cobro_registrar_pago_aprobado`.
  IF EXISTS (SELECT 1 FROM "cobro_intento" i
              WHERE i."organizacion_id" = NEW."organizacion_id" AND i."pago_id" = NEW."id"
                AND i."estado" = 'aprobado') THEN
    RETURN NEW;
  END IF;

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

-- ─── 6. El historial de cada cambio de estado (§1.3; R25) ───────────────────────────────────────────
-- Una fila por nacimiento o cambio, en la MISMA sentencia que el cambio: si el cambio se revierte, la fila también.
-- `p_actor` en el nacimiento y en la marca a mano (§12.4); en los demás cambios es NULL (el sistema). El nombre del
-- actor se congela como en `registrar-accion.ts` (nombre y primer apellido). Con `p_manual` el detalle lleva
-- `"manual": true` (R36). Lanza si no escribe la fila: un cambio sin rastro no se guarda.
CREATE FUNCTION _cobro_historial(p_intento "cobro_intento", p_anterior text, p_actor text,
                                 p_manual boolean DEFAULT false) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO "historial_plataforma"
    ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta", "pais_id", "actor_usuario_id",
     "actor_nombre", "valor_anterior", "valor_nuevo", "detalle", "created_at")
  SELECT (gen_random_uuid())::text, 'cobro_intento_transicion', 'cobro_intento', p_intento."id",
         left('Factura N.º ' || f."numero" || ' · ' || o."nombre", 120), o."pais_id", u."id",
         CASE WHEN u."id" IS NULL THEN NULL
              ELSE left(concat_ws(' ', NULLIF(u."nombre", ''), NULLIF(u."primer_apellido", '')), 120) END,
         p_anterior, p_intento."estado",
         jsonb_strip_nulls(jsonb_build_object(
           'organizacion_id', p_intento."organizacion_id", 'factura_id', p_intento."factura_id",
           'monto_local', p_intento."monto_local", 'moneda_cobro', p_intento."moneda_cobro",
           'motivo', p_intento."motivo_anulacion", 'pago_proveedor_id', p_intento."pago_proveedor_id",
           'proveedor', p_intento."proveedor", 'metodo', p_intento."metodo",
           'manual', CASE WHEN p_manual THEN true END)),
         now() AT TIME ZONE 'UTC'
    FROM "organizacion" o
    JOIN "factura_plataforma" f ON f."id" = p_intento."factura_id"
    LEFT JOIN "usuario" u ON u."id" = p_actor
   WHERE o."id" = p_intento."organizacion_id";
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'historial del cobro sin escribir: intento %', p_intento."id";
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION _cobro_historial("cobro_intento", text, text, boolean) FROM PUBLIC;

-- Cambia el estado de un intento ya bloqueado y deja su fila de historial (sin actor: el sistema).
CREATE FUNCTION _cobro_intento_pasar(p_id text, p_estado text, p_motivo text, p_ahora timestamp)
  RETURNS "cobro_intento"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_anterior  text;
  v_intento   "cobro_intento";
BEGIN
  SELECT i."estado" INTO v_anterior FROM "cobro_intento" i WHERE i."id" = p_id;
  UPDATE "cobro_intento"
     SET "estado" = p_estado, "estado_at" = p_ahora,
         "motivo_anulacion" = COALESCE(p_motivo, "motivo_anulacion")
   WHERE "id" = p_id
  RETURNING * INTO v_intento;
  PERFORM _cobro_historial(v_intento, v_anterior, NULL);
  RETURN v_intento;
END $$;
REVOKE EXECUTE ON FUNCTION _cobro_intento_pasar(text, text, text, timestamp) FROM PUBLIC;

-- ─── 7. Crear o reutilizar el intento (§3.1; R1–R5, capa 1) ─────────────────────────────────────────
-- Devuelve ('creado' | 'existente', id) o ('factura_no_valida' | 'sin_saldo', NULL), sin escribir en esos dos.
-- El candado de la empresa y el FOR UPDATE de la factura serializan dos pedidos de la misma factura: el segundo ve
-- el vivo del primero y lo devuelve (R4). El único parcial es la red para quien inserte saltándose esto.
-- Un proveedor o un método fuera de su conjunto lo rechaza el CHECK con 23514, que revierte todo (R30, R31).
CREATE FUNCTION cobro_intento_obtener_o_crear(p_org text, p_factura text, p_proveedor text, p_metodo text,
                                              p_moneda_local text, p_por text, p_ahora timestamp)
  RETURNS TABLE(resultado text, intento_id text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_estado   text;
  v_saldo    numeric(14, 2);
  v_clave    text;
  v_vivo     "cobro_intento";
  v_intento  "cobro_intento";
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));

  SELECT f."estado" INTO v_estado
    FROM "factura_plataforma" f WHERE f."id" = p_factura AND f."organizacion_id" = p_org
     FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'cerrada' THEN
    RETURN QUERY SELECT 'factura_no_valida'::text, NULL::text;
    RETURN;
  END IF;

  SELECT s."saldo" INTO v_saldo FROM factura_plataforma_saldos(p_org) s WHERE s."factura_id" = p_factura;
  IF v_saldo IS NULL OR v_saldo <= 0 THEN
    RETURN QUERY SELECT 'sin_saldo'::text, NULL::text;
    RETURN;
  END IF;

  -- La clave: factura | monto local | moneda de cobro | tasa (vacía: se cobra en la moneda local) | proveedor |
  -- método. Otro proveedor u otro método es otra clave: anula el vivo y nace uno nuevo (R32, §12.2).
  v_clave := p_factura || '|' || v_saldo::text || '|' || p_moneda_local || '||' || p_proveedor || '|' || p_metodo;

  SELECT * INTO v_vivo FROM "cobro_intento" i
   WHERE i."organizacion_id" = p_org AND i."factura_id" = p_factura AND i."estado" IN ('creado', 'pendiente')
     FOR UPDATE;
  IF v_vivo."id" IS NOT NULL THEN
    IF v_vivo."clave" = v_clave THEN
      RETURN QUERY SELECT 'existente'::text, v_vivo."id";
      RETURN;
    END IF;
    -- R3: otra clave (el saldo o la moneda cambiaron sin pasar por §3.4): se anula y nace uno nuevo, juntos.
    PERFORM _cobro_intento_pasar(v_vivo."id", 'anulado', 'clave_distinta', p_ahora);
  END IF;

  INSERT INTO "cobro_intento"
    ("organizacion_id", "factura_id", "proveedor", "metodo", "clave", "monto_local", "moneda_local", "moneda_cobro",
     "monto_cobrado", "estado", "creado_por", "created_at", "estado_at")
  VALUES (p_org, p_factura, p_proveedor, p_metodo, v_clave, v_saldo, p_moneda_local, p_moneda_local,
          v_saldo, 'creado', p_por, now() AT TIME ZONE 'UTC', p_ahora)
  RETURNING * INTO v_intento;
  PERFORM _cobro_historial(v_intento, NULL, p_por);

  RETURN QUERY SELECT 'creado'::text, v_intento."id";
END $$;
REVOKE EXECUTE ON FUNCTION cobro_intento_obtener_o_crear(text, text, text, text, text, text, timestamp) FROM PUBLIC;

-- ─── 8. El proveedor creó el cobro (§3.2; R10) ──────────────────────────────────────────────────────
-- 'ok' (creado → pendiente con el id externo), 'ya_pendiente' (el mismo id externo) o 'no_vivo'. Con OTRO id
-- externo ya guardado, el UPDATE choca con `cobro_intento_solo_avanza` (SL226 `columna_fija`).
CREATE FUNCTION cobro_intento_registrar_enlace(p_org text, p_intento text, p_id_externo text, p_ahora timestamp)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_intento  "cobro_intento";
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));

  SELECT * INTO v_intento FROM "cobro_intento" i
   WHERE i."id" = p_intento AND i."organizacion_id" = p_org
     FOR UPDATE;
  IF v_intento."id" IS NULL OR v_intento."estado" NOT IN ('creado', 'pendiente') THEN
    RETURN 'no_vivo';
  END IF;
  IF v_intento."estado" = 'pendiente' THEN
    IF v_intento."id_externo" = p_id_externo THEN
      RETURN 'ya_pendiente';
    END IF;
    -- Con otro id externo ya guardado, SL226 `columna_fija`: un intento es un solo cobro del proveedor.
    UPDATE "cobro_intento" SET "id_externo" = p_id_externo WHERE "id" = v_intento."id";
    RETURN 'ok';
  END IF;

  UPDATE "cobro_intento" SET "id_externo" = p_id_externo WHERE "id" = v_intento."id";
  PERFORM _cobro_intento_pasar(v_intento."id", 'pendiente', NULL, p_ahora);
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION cobro_intento_registrar_enlace(text, text, text, timestamp) FROM PUBLIC;

-- ─── 9. Avanzar al estado que da el proveedor (§3.3; R14, R15, R23, R24) ────────────────────────────
-- 'ok', 'sin_cambio' (ya alcanzado o detrás), 'no_alcanzable' o 'sin_intento'. `aprobado` no entra: solo se llega
-- registrando el pago (§3.5, R9). Lleva el intento por los estados intermedios, con una fila de historial por paso.
-- `devuelto` y `contracargo` no tocan el libro ni la deuda (R23, SLT-233).
CREATE FUNCTION cobro_intento_avanzar(p_proveedor text, p_id_externo text, p_destino text, p_ahora timestamp)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org      text;
  v_intento  "cobro_intento";
  v_pasos    text[];
  v_paso     text;
BEGIN
  IF p_destino IS NULL OR p_destino NOT IN ('pendiente', 'rechazado', 'expirado', 'devuelto', 'contracargo') THEN
    RAISE EXCEPTION 'cobro_intento_avanzar: destino no admitido (%)', p_destino USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT i."organizacion_id" INTO v_org FROM "cobro_intento" i
   WHERE i."proveedor" = p_proveedor AND i."id_externo" = p_id_externo;
  IF v_org IS NULL THEN
    RETURN 'sin_intento';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || v_org));
  SELECT * INTO v_intento FROM "cobro_intento" i
   WHERE i."proveedor" = p_proveedor AND i."id_externo" = p_id_externo
     FOR UPDATE;

  IF v_intento."estado" = p_destino THEN
    RETURN 'sin_cambio';
  END IF;
  v_pasos := CASE
    -- Todo estado salvo `creado` ya pasó por `pendiente`: queda detrás (R15).
    WHEN p_destino = 'pendiente' THEN CASE WHEN v_intento."estado" = 'creado' THEN ARRAY['pendiente'] END
    WHEN p_destino IN ('rechazado', 'expirado') THEN CASE v_intento."estado"
      WHEN 'creado' THEN ARRAY['pendiente', p_destino]
      WHEN 'pendiente' THEN ARRAY[p_destino] END
    ELSE CASE WHEN v_intento."estado" = 'aprobado' THEN ARRAY[p_destino] END
  END;
  IF v_pasos IS NULL THEN
    RETURN CASE WHEN p_destino = 'pendiente' THEN 'sin_cambio' ELSE 'no_alcanzable' END;
  END IF;

  FOREACH v_paso IN ARRAY v_pasos LOOP
    PERFORM _cobro_intento_pasar(v_intento."id", v_paso, NULL, p_ahora);
  END LOOP;
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION cobro_intento_avanzar(text, text, text, timestamp) FROM PUBLIC;

-- ─── 10. Registrar el pago aprobado (§3.5, §12.4; R17–R22, R35–R37, capa 3) ─────────────────────────
-- `_cobro_aprobar` son los pasos 5 a 7 de §3.5 sin el `creado → pendiente`, comunes al aviso del proveedor y a la
-- marca a mano (§12.4). Quien la llama ya tiene el candado de la empresa, la factura y el intento bloqueados, y el
-- intento `pendiente` y validado. Interna: sin EXECUTE para nadie salvo el dueño.
--   · El intento pasa a `aprobado` ANTES del movimiento (FK diferida): así el tope lo deja pasar (§3.7) y el trigger
--     de §3.4 no anula el propio intento al escribir la aplicación.
--   · No mira la caja: puede quedar negativa (R18).
--   · Con confirmación, no es «por confirmar» y lo disponible no lo resta (R19).
--   · `p_por` es NULL con el aviso (el sistema) y el superadmin con la marca a mano: la fila de historial lo lleva
--     como actor con `"manual": true`, y la confirmación como quien confirmó (R36).
CREATE FUNCTION _cobro_aprobar(p_intento "cobro_intento", p_pago_proveedor_id text, p_por text, p_ahora timestamp)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_intento  "cobro_intento";
  v_pago     record;
  v_pago_id  text := (gen_random_uuid())::text;
BEGIN
  UPDATE "cobro_intento"
     SET "estado" = 'aprobado', "estado_at" = p_ahora, "aprobado_at" = p_ahora,
         "pago_proveedor_id" = p_pago_proveedor_id, "pago_id" = v_pago_id
   WHERE "id" = p_intento."id"
  RETURNING * INTO v_intento;
  PERFORM _cobro_historial(v_intento, 'pendiente', p_por, p_por IS NOT NULL);

  -- R17: el mismo movimiento que escribe el registro por fuera de SLT-143 (T0.2): la caja, la ganancia y la deuda
  -- bajan igual. La marca y el id del pago van en la descripción; `registrado_por` nulo, porque es automático. La
  -- clave es la misma para el aviso y para la marca: una red más contra el doble conteo (R37).
  INSERT INTO "wallet_movimiento"
    ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion",
     "registrado_por", "fecha_movimiento", "created_at", "clave_idempotencia")
  VALUES (v_pago_id, v_intento."organizacion_id", 'egreso', 'egreso_pago_plataforma', v_intento."monto_local",
          'gasto', NULL, 'Pagado en línea · ' || p_pago_proveedor_id, NULL, p_ahora, now() AT TIME ZONE 'UTC',
          'cobro:' || v_intento."proveedor" || ':' || p_pago_proveedor_id)
  RETURNING "id", "monto" INTO v_pago;

  -- La confirmación `en_linea` y la aplicación entera a la factura del intento.
  PERFORM _pago_plataforma_aplicar(v_intento."organizacion_id", v_pago."id", v_pago."monto",
                                   jsonb_build_array(jsonb_build_object('factura_id', v_intento."factura_id",
                                                                        'monto', v_pago."monto")),
                                   p_por, p_ahora, false, true);
END $$;
REVOKE EXECUTE ON FUNCTION _cobro_aprobar("cobro_intento", text, text, timestamp) FROM PUBLIC;

-- El aviso del proveedor. 'ok', 'ya_registrado', 'sin_intento' o 'requiere_revision' (decisión P2: no escribe
-- nada). Una sola sentencia: cualquier rechazo revierte el intento, el movimiento, la confirmación y la aplicación
-- juntos. Orden de bloqueo: el candado de la empresa y después la factura, como SLT-60, para no cruzarse.
CREATE FUNCTION cobro_registrar_pago_aprobado(p_proveedor text, p_pago_proveedor_id text, p_id_externo text,
                                              p_monto numeric, p_moneda text, p_ahora timestamp)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org      text;
  v_intento  "cobro_intento";
  v_saldo    numeric(14, 2);
BEGIN
  -- R37 (paso 0, §12.4): el pago ya lo marcó a mano el superadmin, quizá en un intento sin id externo. Va antes de
  -- buscar por `id_externo`, y se lee sin candado porque `pago_proveedor_id` solo pasa de vacío a un valor (R8).
  IF EXISTS (SELECT 1 FROM "cobro_intento" i
              WHERE i."proveedor" = p_proveedor AND i."pago_proveedor_id" = p_pago_proveedor_id) THEN
    RETURN 'ya_registrado';
  END IF;

  SELECT i."organizacion_id" INTO v_org FROM "cobro_intento" i
   WHERE i."proveedor" = p_proveedor AND i."id_externo" = p_id_externo;
  IF v_org IS NULL THEN
    RETURN 'sin_intento';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || v_org));
  PERFORM 1 FROM "factura_plataforma" f
   WHERE f."id" = (SELECT i."factura_id" FROM "cobro_intento" i
                    WHERE i."proveedor" = p_proveedor AND i."id_externo" = p_id_externo)
     FOR UPDATE;

  -- R20: el mismo pago del proveedor ya se contó (webhook, conciliación, reintento o la marca a mano).
  IF EXISTS (SELECT 1 FROM "cobro_intento" i
              WHERE i."proveedor" = p_proveedor AND i."pago_proveedor_id" = p_pago_proveedor_id) THEN
    RETURN 'ya_registrado';
  END IF;

  SELECT * INTO v_intento FROM "cobro_intento" i
   WHERE i."proveedor" = p_proveedor AND i."id_externo" = p_id_externo
     FOR UPDATE;
  SELECT s."saldo" INTO v_saldo FROM factura_plataforma_saldos(v_org) s WHERE s."factura_id" = v_intento."factura_id";
  -- R21: no vivo, otro monto u otra moneda, o más que el saldo: lo resuelve SLT-233.
  IF v_intento."estado" NOT IN ('creado', 'pendiente')
     OR p_monto IS DISTINCT FROM v_intento."monto_cobrado"
     OR p_moneda IS DISTINCT FROM v_intento."moneda_cobro"::text
     OR v_saldo IS NULL OR v_saldo < v_intento."monto_local" THEN
    RETURN 'requiere_revision';
  END IF;

  -- R14: de `creado` a `aprobado` pasando por `pendiente`; una fila de historial por paso (R25), sin actor.
  IF v_intento."estado" = 'creado' THEN
    v_intento := _cobro_intento_pasar(v_intento."id", 'pendiente', NULL, p_ahora);
  END IF;
  PERFORM _cobro_aprobar(v_intento, p_pago_proveedor_id, NULL, p_ahora);
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION cobro_registrar_pago_aprobado(text, text, text, numeric, text, timestamp) FROM PUBLIC;

-- La marca a mano del superadmin (§12.4; R35–R39) cuando el aviso no llega. 'ok', 'ya_registrado',
-- 'referencia_vacia', 'sin_intento', 'referencia_en_otro_intento', 'no_vivo' o 'requiere_revision'; solo escribe
-- con 'ok'. El monto y la moneda son los del intento. La autorización está en el servicio (solo el superadmin):
-- la función confía en `p_por` porque solo la ejecuta el dueño (R39).
CREATE FUNCTION cobro_marcar_pagado_manual(p_intento text, p_referencia text, p_por text, p_ahora timestamp)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_referencia  text := btrim(p_referencia);
  v_org         text;
  v_intento     "cobro_intento";
  v_otro        text;
  v_saldo       numeric(14, 2);
BEGIN
  IF v_referencia IS NULL OR v_referencia = '' THEN
    RETURN 'referencia_vacia';
  END IF;

  SELECT i."organizacion_id" INTO v_org FROM "cobro_intento" i WHERE i."id" = p_intento;
  IF v_org IS NULL THEN
    RETURN 'sin_intento';
  END IF;

  -- El orden de §3.5: el candado de la empresa, la factura y el intento. Se serializa con el aviso (R37).
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || v_org));
  PERFORM 1 FROM "factura_plataforma" f
   WHERE f."id" = (SELECT i."factura_id" FROM "cobro_intento" i WHERE i."id" = p_intento)
     FOR UPDATE;
  SELECT * INTO v_intento FROM "cobro_intento" i WHERE i."id" = p_intento FOR UPDATE;

  -- R37, R38: el mismo pago del proveedor cuenta una vez.
  SELECT i."id" INTO v_otro FROM "cobro_intento" i
   WHERE i."proveedor" = v_intento."proveedor" AND i."pago_proveedor_id" = v_referencia;
  IF v_otro IS NOT NULL THEN
    RETURN CASE WHEN v_otro = v_intento."id" THEN 'ya_registrado' ELSE 'referencia_en_otro_intento' END;
  END IF;

  IF v_intento."estado" NOT IN ('creado', 'pendiente') THEN
    RETURN 'no_vivo';
  END IF;

  SELECT s."saldo" INTO v_saldo FROM factura_plataforma_saldos(v_org) s WHERE s."factura_id" = v_intento."factura_id";
  IF v_saldo IS NULL OR v_saldo < v_intento."monto_local" THEN
    RETURN 'requiere_revision';
  END IF;

  -- R35: desde `creado` (la transferencia sin enlace de Global66) pasa por `pendiente`, con el superadmin como
  -- actor; no usa `_cobro_intento_pasar`, que escribe el historial sin actor (R36).
  IF v_intento."estado" = 'creado' THEN
    UPDATE "cobro_intento" SET "estado" = 'pendiente', "estado_at" = p_ahora
     WHERE "id" = v_intento."id"
    RETURNING * INTO v_intento;
    PERFORM _cobro_historial(v_intento, 'creado', p_por, true);
  END IF;

  PERFORM _cobro_aprobar(v_intento, v_referencia, p_por, p_ahora);
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION cobro_marcar_pagado_manual(text, text, text, timestamp) FROM PUBLIC;

-- ─── 11. Anular el vivo cuando cambia el saldo (§3.4; R11) ──────────────────────────────────────────
-- Cubre los tres caminos sin tocar sus funciones: la confirmación de SLT-60 y el registro por fuera escriben
-- aplicaciones; la anulación de SLT-143 escribe `pago_plataforma_anulacion`. El pago en línea no anula su propio
-- intento: cuando escribe la aplicación, el intento ya está `aprobado` (§3.5). Quien escribe ya tiene el candado.
CREATE FUNCTION cobro_intento_anular_por_saldo() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_facturas  text[];
  v_id        text;
BEGIN
  -- Las ramas van separadas: `NEW` de una anulación no tiene `factura_id`.
  IF TG_TABLE_NAME = 'pago_plataforma_aplicacion' THEN
    v_facturas := ARRAY[NEW."factura_id"];
  ELSE
    SELECT array_agg(ap."factura_id") INTO v_facturas FROM "pago_plataforma_aplicacion" ap
     WHERE ap."organizacion_id" = NEW."organizacion_id" AND ap."confirmacion_id" = NEW."confirmacion_id";
  END IF;

  FOR v_id IN
    SELECT i."id" FROM "cobro_intento" i
     WHERE i."organizacion_id" = NEW."organizacion_id" AND i."estado" IN ('creado', 'pendiente')
       AND i."factura_id" = ANY (v_facturas)
       FOR UPDATE
  LOOP
    PERFORM _cobro_intento_pasar(v_id, 'anulado', 'saldo_cambiado', (now() AT TIME ZONE 'UTC')::timestamp(3));
  END LOOP;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_intento_anular_por_saldo() FROM PUBLIC;

CREATE TRIGGER "cobro_intento_saldo_aplicacion" AFTER INSERT ON "pago_plataforma_aplicacion"
  FOR EACH ROW EXECUTE FUNCTION cobro_intento_anular_por_saldo();
CREATE TRIGGER "cobro_intento_saldo_anulacion" AFTER INSERT ON "pago_plataforma_anulacion"
  FOR EACH ROW EXECUTE FUNCTION cobro_intento_anular_por_saldo();

-- ─── 12. Los eventos del proveedor (§3.8; R12, R13, R16) ────────────────────────────────────────────
-- 'nuevo', 'repetido' (ya procesado: se ignora, R13) o 'pendiente' (llegó y su proceso no terminó: se procesa otra
-- vez, R13, R16). Dos llegadas a la vez del mismo evento pueden procesarse las dos: §3.3 y §3.5 son idempotentes.
CREATE FUNCTION cobro_evento_registrar(p_proveedor text, p_log_id text, p_tipo text, p_pago_proveedor_id text,
                                       p_ahora timestamp)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n          integer;
  v_procesado  timestamp;
BEGIN
  INSERT INTO "cobro_webhook_evento" ("proveedor", "log_id", "tipo", "pago_proveedor_id", "recibido_at")
  VALUES (p_proveedor, p_log_id, p_tipo, p_pago_proveedor_id, p_ahora)
  ON CONFLICT ("proveedor", "log_id") DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 1 THEN
    RETURN 'nuevo';
  END IF;
  SELECT e."procesado_at" INTO v_procesado FROM "cobro_webhook_evento" e
   WHERE e."proveedor" = p_proveedor AND e."log_id" = p_log_id;
  RETURN CASE WHEN v_procesado IS NULL THEN 'pendiente' ELSE 'repetido' END;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_evento_registrar(text, text, text, text, timestamp) FROM PUBLIC;

-- 'ok', 'ya_cerrado' (se cierra una sola vez) o 'sin_evento'.
CREATE FUNCTION cobro_evento_cerrar(p_proveedor text, p_log_id text, p_resultado text, p_intento text,
                                    p_ahora timestamp)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_n  integer;
BEGIN
  UPDATE "cobro_webhook_evento"
     SET "procesado_at" = p_ahora, "resultado" = p_resultado, "intento_id" = COALESCE("intento_id", p_intento)
   WHERE "proveedor" = p_proveedor AND "log_id" = p_log_id AND "procesado_at" IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 1 THEN
    RETURN 'ok';
  END IF;
  RETURN CASE WHEN EXISTS (SELECT 1 FROM "cobro_webhook_evento" e
                            WHERE e."proveedor" = p_proveedor AND e."log_id" = p_log_id)
              THEN 'ya_cerrado' ELSE 'sin_evento' END;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_evento_cerrar(text, text, text, text, timestamp) FROM PUBLIC;

COMMIT;
