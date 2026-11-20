-- SLT-215 (design §1, §2; R1, R6, R7, R22–R37) — los niveles de beneficio por volumen de órdenes.
--
-- Cinco piezas, en este orden:
--   1. la tabla de PLATAFORMA `plan_nivel`, como `plan_beneficio`: una fila por nivel de un plan, numerado desde 1.
--      Los CHECK cierran lo que la app ya valida (R6). Que las metas crezcan con el nivel compara filas entre sí y
--      vive en zod (`nivelesSchema`), por donde pasa toda escritura. RLS sin políticas y `REVOKE ALL … FROM
--      servi_app`: sin el REVOKE, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría CRUD;
--   2. las dos tablas de NEGOCIO, `plan_nivel_empresa` (el estado de cada empresa con plan) y
--      `plan_nivel_historial` (cada inicio de nivel), con la política `…_por_empresa`, el REVOKE de escritura y el
--      trigger de «sin cambio de empresa», como `factura_plataforma` (R36). No tienen FK a otra tabla de negocio:
--      ningún `sme_*`. Las escriben SOLO las funciones del dueño de (4);
--   3. el CHECK `plan_borrador_pasos_conocidos` admite el paso nuevo `niveles` (R7);
--   4. las cinco funciones del dueño (§2.1–§2.4): órdenes efectivas, metas que corre una empresa, cierre de los
--      meses pendientes, recálculo y toma de un plan. `SECURITY DEFINER` y sin EXECUTE para PUBLIC: las llama solo
--      código que corre como plataforma (la cola y el repositorio de planes), como `factura_plataforma_cerrar`;
--   5. el relleno (R37): cada empresa con plan en el nivel 0, sin historial, con el mes de la migración como el
--      primero que se le cierra.
--
-- En `plan_cambio_programado.version`, `plan_version_empresa.version` y `plan_borrador.pasos` los niveles viajan
-- como `niveles: [{ meta, descuento: { tipo, porcentaje | monto } }]`; el número es el índice + 1. No hay columna
-- nueva.
--
-- EL MES (R23): el de `plan_inicio_periodo_calendario('mensual', …)` y `plan_fin_periodo_calendario`, con bordes a
-- las 00:00 de la plataforma. No se copia su `interval '6 hours'`: cuando SLT-90 mueva la zona, el cierre la sigue.
-- Las funciones que dependen del reloj lo reciben como parámetro (`p_ahora`, `p_desde`; UTC sin zona): el trabajo
-- pasa su `now()` inyectable y los tests fijan el instante.
--
-- ATOMICIDAD: BEGIN/COMMIT, como 20261120120000, para que el runner de los tests (sentencia a sentencia) tampoco
-- deje nada a medias. No usa `plan_niveles_cerrar` de `job_tipo`: ese valor lo añade 20261121140000 y solo lo usa
-- la cola en runtime.
--
-- Prefijo 20261121: va después de la mayor migración de `dev` (20261120130000_slt221_historial_correo_cedula).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- ─── 1. Los niveles de un plan (§1.1; R1, R6) ───────────────────────────────────────────────────────────

CREATE TABLE "plan_nivel" (
  "plan_id"         TEXT          NOT NULL,
  "nivel"           INTEGER       NOT NULL,
  "meta"            INTEGER       NOT NULL,
  "descuento_pct"   DECIMAL(5,2),
  "descuento_monto" DECIMAL(12,2),
  CONSTRAINT "plan_nivel_pkey" PRIMARY KEY ("plan_id", "nivel"),
  CONSTRAINT "plan_nivel_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- P2: hasta 10 niveles, numerados desde 1.
  CONSTRAINT "plan_nivel_nivel_check" CHECK ("nivel" BETWEEN 1 AND 10),
  CONSTRAINT "plan_nivel_meta_check" CHECK ("meta" >= 1),
  -- Un descuento es porcentaje o monto fijo, nunca los dos ni ninguno.
  CONSTRAINT "plan_nivel_una_forma" CHECK (("descuento_pct" IS NULL) <> ("descuento_monto" IS NULL)),
  CONSTRAINT "plan_nivel_pct_check" CHECK ("descuento_pct" IS NULL OR ("descuento_pct" > 0 AND "descuento_pct" <= 100)),
  CONSTRAINT "plan_nivel_monto_check" CHECK ("descuento_monto" IS NULL OR "descuento_monto" > 0)
);

ALTER TABLE "plan_nivel" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan_nivel" FROM servi_app;

-- ─── 2. El estado y el historial de cada empresa (§1.2, §1.3; R35, R36) ──────────────────────────────────

-- Una fila por empresa con plan. `cerrado_hasta_at` es el fin (excluido, UTC) del último mes cerrado: el inicio
-- del primer mes pendiente. `entrada_at` es la entrada al plan actual (R24); no es `plan_ciclo_ancla_at`, que
-- también mueve un cambio de solo tipo de cobro (R34). La cuenta de meses sin cumplir no guarda el 2: al llegar
-- a 2 baja y vuelve a 0 (R26).
CREATE TABLE "plan_nivel_empresa" (
  "organizacion_id"   TEXT         NOT NULL,
  "nivel"             INTEGER      NOT NULL DEFAULT 0,
  "meses_sin_cumplir" INTEGER      NOT NULL DEFAULT 0,
  "cerrado_hasta_at"  TIMESTAMP(3) NOT NULL,
  "entrada_at"        TIMESTAMP(3) NOT NULL,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_nivel_empresa_pkey" PRIMARY KEY ("organizacion_id"),
  CONSTRAINT "plan_nivel_empresa_nivel_check" CHECK ("nivel" BETWEEN 0 AND 10),
  CONSTRAINT "plan_nivel_empresa_meses_check" CHECK ("meses_sin_cumplir" IN (0, 1))
);
-- Repite la clave a propósito: la guardia `organizacion-en-modelos` pide un índice que empiece por la empresa a
-- toda tabla de negocio, como en `tarifa_activacion`.
CREATE INDEX "plan_nivel_empresa_organizacion_id_idx" ON "plan_nivel_empresa"("organizacion_id");

-- Solo se añade. `plan_id` es una copia sin FK, como en `cobro_plataforma_traza`: el historial sobrevive a un
-- cambio de plan. El mes y sus órdenes van los dos (subida y bajada, y el recálculo) o ninguno.
CREATE TABLE "plan_nivel_historial" (
  "id"                TEXT         NOT NULL DEFAULT (gen_random_uuid())::text,
  "organizacion_id"   TEXT         NOT NULL,
  "plan_id"           TEXT         NOT NULL,
  "nivel"             INTEGER      NOT NULL,
  "nivel_anterior"    INTEGER      NOT NULL,
  "motivo"            TEXT         NOT NULL,
  "desde_at"          TIMESTAMP(3) NOT NULL,
  "mes_inicio_at"     TIMESTAMP(3),
  "ordenes_efectivas" INTEGER,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_nivel_historial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_nivel_historial_motivo_check"
    CHECK ("motivo" IN ('subida', 'bajada', 'cambio_niveles', 'cambio_plan')),
  CONSTRAINT "plan_nivel_historial_nivel_check" CHECK ("nivel" BETWEEN 0 AND 10 AND "nivel_anterior" BETWEEN 0 AND 10),
  CONSTRAINT "plan_nivel_historial_ordenes_check" CHECK ("ordenes_efectivas" >= 0),
  CONSTRAINT "plan_nivel_historial_mes_y_ordenes"
    CHECK (("mes_inicio_at" IS NULL) = ("ordenes_efectivas" IS NULL))
);
-- El nivel vigente en un instante `t` es el de la fila con el mayor `desde_at <= t` (lo leerá SLT-216).
CREATE INDEX "plan_nivel_historial_organizacion_id_desde_at_idx"
    ON "plan_nivel_historial"("organizacion_id", "desde_at");
-- R29: la segunda red de «nunca cierra dos veces un mes». El recálculo no entra: su motivo es otro.
CREATE UNIQUE INDEX "plan_nivel_historial_un_cierre_por_mes"
    ON "plan_nivel_historial"("organizacion_id", "mes_inicio_at") WHERE "motivo" IN ('subida', 'bajada');

-- CASCADE, como `factura_plataforma`: la app nunca borra una empresa; el dueño sí, en las limpiezas de los tests y
-- en el borrado de las empresas demo.
ALTER TABLE "plan_nivel_empresa" ADD CONSTRAINT "plan_nivel_empresa_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_nivel_historial" ADD CONSTRAINT "plan_nivel_historial_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- R36: cada empresa solo LEE los suyos; nadie los escribe con `servi_app`. Sin el REVOKE, el ALTER DEFAULT
-- PRIVILEGES de 20261022130000 le daría escritura y la RLS se la permitiría sobre sus filas.
ALTER TABLE "plan_nivel_empresa" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_nivel_empresa_por_empresa" ON "plan_nivel_empresa" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
REVOKE INSERT, UPDATE, DELETE ON "plan_nivel_empresa" FROM servi_app;

ALTER TABLE "plan_nivel_historial" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_nivel_historial_por_empresa" ON "plan_nivel_historial" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
REVOKE INSERT, UPDATE, DELETE ON "plan_nivel_historial" FROM servi_app;

CREATE TRIGGER "plan_nivel_empresa_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "plan_nivel_empresa" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "plan_nivel_historial_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "plan_nivel_historial" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- ─── 3. El paso «Niveles» del borrador (§2.5; R7) ────────────────────────────────────────────────────────

ALTER TABLE "plan_borrador" DROP CONSTRAINT "plan_borrador_pasos_conocidos";
ALTER TABLE "plan_borrador" ADD CONSTRAINT "plan_borrador_pasos_conocidos"
  CHECK (("pasos" - ARRAY['general','precio','orden','topes','modulos','beneficios','niveles','vigencia']) = '{}'::jsonb);

-- ─── 4. Las funciones del dueño (§2.1–§2.4) ──────────────────────────────────────────────────────────────

-- §2.1, R22: órdenes distintas de la empresa con un cargo en [p_desde, p_hasta) que sigue vigente en p_hasta (sin
-- un reverso posterior registrado antes de p_hasta) y que no se cancelaron antes de p_hasta. Anular deja un
-- reverso y recuperar un cargo nuevo (SL-40): una orden anulada y recuperada cuenta una vez, por su último cargo.
-- Cancelar por la API no deja reverso (SL-40 P3): la marca es la fila `cancelacion_api` de
-- `orden_historial_estado` (P3). Solo mira lo registrado antes de p_hasta: cerrar el día 1 o el 5 da lo mismo.
-- Si un día aparece otra forma de cancelar, se añade aquí (la guardia de `plan-nivel-cierre.test.ts` lo vigila).
CREATE FUNCTION plan_nivel_ordenes_efectivas(p_org text, p_desde timestamp, p_hasta timestamp) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(DISTINCT c."orden_id")::int
    FROM "cobro_plataforma_movimiento" c
   WHERE c."organizacion_id" = p_org AND c."tipo" = 'cargo'
     AND c."ocurrido_at" >= p_desde AND c."ocurrido_at" < p_hasta
     AND NOT EXISTS (SELECT 1 FROM "cobro_plataforma_movimiento" r
                      WHERE r."organizacion_id" = p_org AND r."orden_id" = c."orden_id" AND r."tipo" = 'reverso'
                        AND r."secuencia" > c."secuencia" AND r."ocurrido_at" < p_hasta)
     AND NOT EXISTS (SELECT 1 FROM "orden_historial_estado" h
                      WHERE h."organizacion_id" = p_org AND h."orden_id" = c."orden_id"
                        AND h."origen_tipo" = 'cancelacion_api' AND h."created_at" < p_hasta) $$;
REVOKE EXECUTE ON FUNCTION plan_nivel_ordenes_efectivas(text, timestamp, timestamp) FROM PUBLIC;

-- §2.2: las metas de los niveles que corre la empresa, en orden de nivel. Los de su versión propia si la tiene
-- durante un cambio a medias y trae la clave `niveles` (R16); si no, los del plan (R18). Sin plan, ninguno. La
-- forma «versión propia si trae la clave; si no, el plan» es la de `beneficios` en `plan_de_la_empresa`.
CREATE FUNCTION plan_nivel_metas_de_la_empresa(p_org text) RETURNS integer[]
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan_id text;
  v_version jsonb;
BEGIN
  SELECT o."plan_id", v."version" INTO v_plan_id, v_version
    FROM "organizacion" o
    LEFT JOIN "plan_version_empresa" v ON v."empresa_id" = o."id" AND v."plan_id" = o."plan_id"
   WHERE o."id" = p_org;
  IF v_plan_id IS NULL THEN
    RETURN '{}';
  END IF;
  IF v_version IS NOT NULL AND v_version ? 'niveles' THEN
    RETURN COALESCE((SELECT array_agg((e.valor ->> 'meta')::integer ORDER BY e.orden)
                       FROM jsonb_array_elements(v_version -> 'niveles') WITH ORDINALITY AS e(valor, orden)), '{}');
  END IF;
  RETURN COALESCE((SELECT array_agg(n."meta" ORDER BY n."nivel") FROM "plan_nivel" n WHERE n."plan_id" = v_plan_id), '{}');
END $$;
REVOKE EXECUTE ON FUNCTION plan_nivel_metas_de_la_empresa(text) FROM PUBLIC;

-- §2.3, R25–R30: cierra, en orden, cada mes terminado que la empresa tenga pendiente respecto de `p_ahora`, con las
-- metas que corre al cerrar. Devuelve cuántos cerró. Bajo el cerrojo de la empresa, el mismo que toman
-- `factura_plataforma_cerrar` y el cambio de plan: dos cierres, o un cierre y un recálculo, se serializan, y el
-- segundo ya no encuentra pendientes (R29). Un mes cerrado tarde da lo mismo que a tiempo: las órdenes solo miran
-- lo registrado antes del fin del mes y el nivel rige desde ese fin (el día 1 siguiente).
--   · sube directo al más alto cumplido, con la cuenta a 0 (R25);
--   · en el nivel 0 no baja (R28);
--   · cumplir la meta del nivel actual pone la cuenta a 0 (R27);
--   · si no, suma 1 y con 2 baja un nivel, con la cuenta a 0 (R26).
-- Sin fila (la empresa no tiene plan), 0. Sin niveles, la empresa queda en el 0 y no hay historial (R28).
CREATE FUNCTION plan_nivel_cerrar_meses(p_org text, p_ahora timestamp) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan_id text;
  v_e "plan_nivel_empresa";
  v_hoy timestamp;
  v_metas integer[];
  v_nivel integer;
  v_cuenta integer;
  v_ini timestamp;
  v_fin timestamp;
  v_ordenes integer;
  v_alto integer;
  v_cerrados integer := 0;
BEGIN
  SELECT o."plan_id" INTO v_plan_id FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_e FROM "plan_nivel_empresa" WHERE "organizacion_id" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  v_hoy := plan_inicio_periodo_calendario('mensual', p_ahora);
  v_metas := plan_nivel_metas_de_la_empresa(p_org);
  -- Defensa: un recálculo ya deja el nivel en rango de las metas que corre.
  v_nivel := LEAST(v_e."nivel", cardinality(v_metas));
  v_cuenta := v_e."meses_sin_cumplir";
  v_ini := v_e."cerrado_hasta_at";
  WHILE v_ini < v_hoy LOOP
    v_fin := plan_fin_periodo_calendario('mensual', v_ini);
    -- R24: un mes de entrada cuenta desde la entrada, contra la meta completa.
    v_ordenes := plan_nivel_ordenes_efectivas(p_org, GREATEST(v_ini, v_e."entrada_at"), v_fin);
    -- El más alto cumplido, o 0. Las metas crecen (zod), así que basta el mayor índice.
    v_alto := (SELECT COALESCE(max(k), 0) FROM generate_subscripts(v_metas, 1) AS k WHERE v_metas[k] <= v_ordenes);
    IF v_alto > v_nivel THEN
      INSERT INTO "plan_nivel_historial" ("organizacion_id", "plan_id", "nivel", "nivel_anterior", "motivo", "desde_at",
                                          "mes_inicio_at", "ordenes_efectivas")
      VALUES (p_org, v_plan_id, v_alto, v_nivel, 'subida', v_fin, v_ini, v_ordenes);
      v_nivel := v_alto;
      v_cuenta := 0;
    ELSIF v_nivel = 0 THEN
      v_cuenta := 0;
    ELSIF v_ordenes >= v_metas[v_nivel] THEN
      v_cuenta := 0;
    ELSE
      v_cuenta := v_cuenta + 1;
      IF v_cuenta >= 2 THEN
        INSERT INTO "plan_nivel_historial" ("organizacion_id", "plan_id", "nivel", "nivel_anterior", "motivo",
                                            "desde_at", "mes_inicio_at", "ordenes_efectivas")
        VALUES (p_org, v_plan_id, v_nivel - 1, v_nivel, 'bajada', v_fin, v_ini, v_ordenes);
        v_nivel := v_nivel - 1;
        v_cuenta := 0;
      END IF;
    END IF;
    v_ini := v_fin;
    v_cerrados := v_cerrados + 1;
  END LOOP;
  IF v_cerrados > 0 OR v_nivel <> v_e."nivel" THEN
    UPDATE "plan_nivel_empresa"
       SET "nivel" = v_nivel, "meses_sin_cumplir" = v_cuenta, "cerrado_hasta_at" = v_ini, "updated_at" = CURRENT_TIMESTAMP
     WHERE "organizacion_id" = p_org;
  END IF;
  RETURN v_cerrados;
END $$;
REVOKE EXECUTE ON FUNCTION plan_nivel_cerrar_meses(text, timestamp) FROM PUBLIC;

-- §2.4, R31, R32: pone a la empresa en el nivel más alto cuya meta (de las que corre ahora) cumplió el último mes
-- cerrado respecto de `p_desde`, contando TODAS sus órdenes efectivas de ese mes (sin recortar por la entrada:
-- en un cambio de plan ese mes es entero del plan de antes), con la cuenta a 0, y lo registra con `p_motivo` e
-- inicio en `p_desde`. Se registra aunque el nivel no cambie: el recálculo reinicia la cuenta y su motivo es dato
-- (R35). Supone que quien llama ya cerró los meses pendientes con los niveles de antes (§3.4). Devuelve el nivel
-- nuevo; sin fila de la empresa, NULL y no toca nada.
CREATE FUNCTION plan_nivel_recalcular(p_org text, p_desde timestamp, p_motivo text) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan_id text;
  v_e "plan_nivel_empresa";
  v_ini timestamp;
  v_fin timestamp;
  v_ordenes integer;
  v_metas integer[];
  v_nivel integer;
BEGIN
  IF p_motivo IS NULL OR p_motivo NOT IN ('cambio_niveles', 'cambio_plan') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'plan_nivel_recalcular: motivo desconocido: ' || COALESCE(p_motivo, 'NULL');
  END IF;
  SELECT o."plan_id" INTO v_plan_id FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  SELECT * INTO v_e FROM "plan_nivel_empresa" WHERE "organizacion_id" = p_org FOR UPDATE;
  IF NOT FOUND OR v_plan_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_fin := plan_inicio_periodo_calendario('mensual', p_desde);
  v_ini := plan_inicio_periodo_calendario('mensual', v_fin - interval '1 day');
  v_ordenes := plan_nivel_ordenes_efectivas(p_org, v_ini, v_fin);
  v_metas := plan_nivel_metas_de_la_empresa(p_org);
  v_nivel := (SELECT COALESCE(max(k), 0) FROM generate_subscripts(v_metas, 1) AS k WHERE v_metas[k] <= v_ordenes);
  UPDATE "plan_nivel_empresa"
     SET "nivel" = v_nivel, "meses_sin_cumplir" = 0, "updated_at" = CURRENT_TIMESTAMP
   WHERE "organizacion_id" = p_org;
  INSERT INTO "plan_nivel_historial" ("organizacion_id", "plan_id", "nivel", "nivel_anterior", "motivo", "desde_at",
                                      "mes_inicio_at", "ordenes_efectivas")
  VALUES (p_org, v_plan_id, v_nivel, v_e."nivel", p_motivo, p_desde, v_ini, v_ordenes);
  RETURN v_nivel;
END $$;
REVOKE EXECUTE ON FUNCTION plan_nivel_recalcular(text, timestamp, text) FROM PUBLIC;

-- §2.4, R32, R33: después de poner el plan nuevo en la empresa, con efecto en `p_desde`.
--   · sin fila (primera asignación, P4): nivel 0, cuenta 0, entrada en `p_desde` y el mes de la entrada como el
--     primero que se le cierra; sin historial (R33);
--   · con fila (cambio de plan): la entrada pasa a `p_desde` (R24) y se recalcula con los niveles del plan nuevo,
--     motivo «cambio de plan» (R32).
CREATE FUNCTION plan_nivel_tomar_plan(p_org text, p_desde timestamp) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  UPDATE "plan_nivel_empresa" SET "entrada_at" = p_desde, "updated_at" = CURRENT_TIMESTAMP
   WHERE "organizacion_id" = p_org;
  IF FOUND THEN
    PERFORM plan_nivel_recalcular(p_org, p_desde, 'cambio_plan');
  ELSE
    INSERT INTO "plan_nivel_empresa" ("organizacion_id", "nivel", "meses_sin_cumplir", "entrada_at", "cerrado_hasta_at")
    VALUES (p_org, 0, 0, p_desde, plan_inicio_periodo_calendario('mensual', p_desde));
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION plan_nivel_tomar_plan(text, timestamp) FROM PUBLIC;

-- ─── 5. Relleno (R37) ────────────────────────────────────────────────────────────────────────────────────
-- Cada empresa con plan: nivel 0, cuenta 0, entrada en la de su plan vigente y el mes de la migración como el
-- primero que se le cierra. Ningún plan tiene niveles todavía: no hay nada que calcular hacia atrás, ni historial.
INSERT INTO "plan_nivel_empresa" ("organizacion_id", "nivel", "meses_sin_cumplir", "entrada_at", "cerrado_hasta_at")
SELECT o."id", 0, 0, o."plan_ciclo_ancla_at", plan_inicio_periodo_calendario('mensual', now() AT TIME ZONE 'UTC')
  FROM "organizacion" o
 WHERE o."plan_id" IS NOT NULL;

COMMIT;
