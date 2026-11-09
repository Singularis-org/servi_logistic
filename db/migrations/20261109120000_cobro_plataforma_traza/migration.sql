-- SLT-85 (design §1–§3) — la traza de facturación de cada movimiento del cobro de la plataforma: una fila
-- por cargo o reverso de `cobro_plataforma_movimiento`, con la copia del momento que el movimiento no
-- guarda (la orden, la regla, el plan y el período). El libro de la deuda NO cambia: ni una columna, ni una
-- fila, ni una de las tres funciones que lo escriben.
--
-- Tabla de NEGOCIO, con las piezas de `cobro_plataforma_movimiento` (20261023130100):
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK, su índice y la
--     política `…_por_empresa` con la forma que reconoce la guardia `rls-por-empresa`: la empresa solo LEE
--     su traza (R21);
--   · el REVOKE de escritura (R23). Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría
--     escritura a `servi_app` y la RLS se la permitiría sobre sus propias filas;
--   · los triggers de misma empresa y de «sin cambio de empresa», generados con
--     `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` (R26).
--
-- Quién escribe: SOLO el trigger AFTER INSERT sobre `cobro_plataforma_movimiento` (§2). Cubre las tres
-- funciones de hoy y cualquier camino futuro sin tocarlas, y corre en la misma sentencia que el
-- movimiento: si la traza no se puede escribir, el movimiento tampoco (R3).
--
-- ATOMICIDAD (T2.1). `prisma migrate deploy` manda el archivo como UN script de varias sentencias, y
-- Postgres lo corre en una transacción implícita: si algo falla, no queda nada. Pero el runner de los
-- tests (`aplicarMigracionesHasta` / `ejecutar`, tests/integration/db/_fixtures/ida-y-vuelta-32.ts) lo
-- corre sentencia a sentencia en autocommit, donde el LOCK del paso 5 daría 25P01 y un fallo del cierre
-- dejaría la tabla a medias. Con BEGIN/COMMIT el archivo es atómico en los dos runners, como las 19
-- migraciones que ya lo llevan (p. ej. 20261023090000).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- ─── 1. Tabla, CHECK, únicos, índices, FK, RLS, política y REVOKE (§1.1, §1.3) ──────────────────────

CREATE TABLE "cobro_plataforma_traza" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "orden_id" TEXT NOT NULL,
    "movimiento_id" TEXT NOT NULL,
    "tipo_movimiento" "cobro_plataforma_tipo" NOT NULL,
    "reverso_de" TEXT,
    "num_guia" INTEGER,
    "monto_cobrar" DECIMAL(12,2),
    "estado_orden" TEXT,
    "tipo_cobro" TEXT NOT NULL,
    "fuente" "cobro_plataforma_fuente" NOT NULL,
    "plan_id" TEXT,
    "plan_nombre" VARCHAR(80),
    "porcentaje" DECIMAL(5,2),
    "minimo" DECIMAL(12,2),
    "valor_fijo" DECIMAL(12,2),
    "valor_cobrado" DECIMAL(12,2) NOT NULL,
    "cobrado_at" TIMESTAMP(3) NOT NULL,
    "periodo_tipo" TEXT,
    "periodo_inicio_at" TIMESTAMP(3),
    "periodo_fin_at" TIMESTAMP(3),
    "reconstruido" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_plataforma_traza_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cobro_plataforma_traza_tipo_cobro_check" CHECK ("tipo_cobro" IN ('fijo', 'porcentual')),
    CONSTRAINT "cobro_plataforma_traza_periodo_tipo_check"
      CHECK ("periodo_tipo" IN ('quincenal', 'mensual', 'bimestral', 'anual')),
    -- R7, R8: una orden fija no tiene % ni mínimo; una porcentual no tiene valor fijo.
    CONSTRAINT "cobro_plataforma_traza_regla" CHECK (
      ("tipo_cobro" = 'fijo' AND "valor_fijo" IS NOT NULL AND "porcentaje" IS NULL AND "minimo" IS NULL)
      OR ("tipo_cobro" = 'porcentual' AND "porcentaje" IS NOT NULL AND "valor_fijo" IS NULL)),
    -- R11: el reverso resta.
    CONSTRAINT "cobro_plataforma_traza_signo" CHECK (
      ("tipo_movimiento" = 'cargo' AND "valor_cobrado" >= 0)
      OR ("tipo_movimiento" = 'reverso' AND "valor_cobrado" <= 0)),
    -- R13: solo un reverso apunta a la traza del cargo que anula.
    CONSTRAINT "cobro_plataforma_traza_reverso_de" CHECK (("tipo_movimiento" = 'reverso') = ("reverso_de" IS NOT NULL)),
    -- R14, R15: el período va entero o no va.
    CONSTRAINT "cobro_plataforma_traza_periodo"
      CHECK (num_nulls("periodo_tipo", "periodo_inicio_at", "periodo_fin_at") IN (0, 3))
);

-- R1: una traza por movimiento. Un cargo lo anula como mucho un reverso (los nulos no chocan).
CREATE UNIQUE INDEX "cobro_plataforma_traza_organizacion_id_movimiento_id_key"
    ON "cobro_plataforma_traza"("organizacion_id", "movimiento_id");
CREATE UNIQUE INDEX "cobro_plataforma_traza_organizacion_id_reverso_de_key"
    ON "cobro_plataforma_traza"("organizacion_id", "reverso_de");
CREATE INDEX "cobro_plataforma_traza_organizacion_id_idx" ON "cobro_plataforma_traza"("organizacion_id");
CREATE INDEX "cobro_plataforma_traza_orden_id_idx" ON "cobro_plataforma_traza"("orden_id");
CREATE INDEX "cobro_plataforma_traza_organizacion_id_cobrado_at_idx"
    ON "cobro_plataforma_traza"("organizacion_id", "cobrado_at");

-- CASCADE desde `orden` y desde el movimiento: la app nunca borra ninguno de los dos, y en las limpiezas
-- del dueño la traza se va con su movimiento (el 1 a 1 se conserva). `reverso_de` es NO ACTION y no
-- RESTRICT: al borrar en cascada todas las filas de una orden en la misma sentencia, la comprobación va al
-- final de la sentencia y no choca. ON UPDATE RESTRICT porque la fila no cambia nunca (R24).
ALTER TABLE "cobro_plataforma_traza" ADD CONSTRAINT "cobro_plataforma_traza_orden_id_fkey"
    FOREIGN KEY ("orden_id") REFERENCES "orden"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "cobro_plataforma_traza" ADD CONSTRAINT "cobro_plataforma_traza_movimiento_id_fkey"
    FOREIGN KEY ("movimiento_id") REFERENCES "cobro_plataforma_movimiento"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "cobro_plataforma_traza" ADD CONSTRAINT "cobro_plataforma_traza_reverso_de_fkey"
    FOREIGN KEY ("reverso_de") REFERENCES "cobro_plataforma_traza"("id") ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "cobro_plataforma_traza" ADD CONSTRAINT "cobro_plataforma_traza_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cobro_plataforma_traza" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobro_plataforma_traza_por_empresa" ON "cobro_plataforma_traza" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

REVOKE INSERT, UPDATE, DELETE ON "cobro_plataforma_traza" FROM servi_app;

-- ─── 2. Misma empresa (SL-17 M3) ── GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`. ──

-- CobroPlataformaTraza.movimiento
CREATE TRIGGER "sme_cobro_plataforma_traza_movimiento_id_78441547" BEFORE INSERT OR UPDATE OF "movimiento_id", "organizacion_id"
  ON "cobro_plataforma_traza" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cobro_plataforma_movimiento', 'movimiento_id', 'id');
-- CobroPlataformaTraza.orden
CREATE TRIGGER "sme_cobro_plataforma_traza_orden_id_f90aae74" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "cobro_plataforma_traza" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- CobroPlataformaTraza.reversoDe
CREATE TRIGGER "sme_cobro_plataforma_traza_reverso_de_e038ae40" BEFORE INSERT OR UPDATE OF "reverso_de", "organizacion_id"
  ON "cobro_plataforma_traza" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cobro_plataforma_traza', 'reverso_de', 'id');

CREATE TRIGGER "cobro_plataforma_traza_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cobro_plataforma_traza" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- ─── 3. Nadie cambia una fila (R24, P3) ─────────────────────────────────────────────────────────────
-- Para cualquier rol, el dueño incluido: ningún camino legítimo actualiza la traza, y una corrección
-- silenciosa borraría justo lo que la tabla existe para conservar. Borrar sigue cerrado para la app por
-- el REVOKE; el dueño solo borra en cascada (limpiezas) o en el borrado de las empresas demo.
CREATE FUNCTION cobro_plataforma_traza_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'la traza de facturación no se cambia (cobro_plataforma_traza %)', OLD."id"
    USING ERRCODE = 'SL085';
END $$;

CREATE TRIGGER "cobro_plataforma_traza_inmutable" BEFORE UPDATE ON "cobro_plataforma_traza"
  FOR EACH ROW EXECUTE FUNCTION cobro_plataforma_traza_inmutable();

-- ─── 4. La traza en vivo: un trigger sobre el libro (§2) ────────────────────────────────────────────
-- Antes del relleno: un movimiento que entre mientras corre la migración ya tiene su traza, y el relleno
-- lo salta. La empresa sale siempre de NEW (ya pasó la RLS de `orden` y la misma empresa del movimiento).
-- Lee la fila de la orden y no la NEW de `orden`: dentro del AFTER sobre `orden` que inserta el
-- movimiento, la sentencia ya está aplicada y la lectura ve sus valores (como la conciliación de SLT-83).
--   · R5: guía, `monto_cobrar` y código de estado del instante;
--   · R7–R9: porcentual si la orden tiene condiciones congeladas (su % y mínimo); si no, fija con
--     `valor_fijo = monto`. Un reverso copia `monto` y `fuente` de su cargo, así que no hace falta leerlo;
--   · R10, R14, R15 (P1): el plan aplicado de la empresa en este instante y el período de calendario de
--     su tipo sobre la fecha de cobro; sin plan, todo vacío;
--   · R11, R12: el reverso resta; la fecha de cobro es `ocurrido_at` (en una anulación, `deleted_at`);
--   · R13: los movimientos alternan (SL-40), así que el cargo que anula un reverso es el de `secuencia − 1`.
--     Si no tuviera traza, el CHECK `cobro_plataforma_traza_reverso_de` tumba la sentencia, y con ella el
--     movimiento: mejor ruidoso que un reverso suelto.
CREATE FUNCTION cobro_plataforma_traza_al_registrar() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_orden      record;
  v_cond       record;
  v_empresa    record;
  v_porcentual boolean;
  v_reverso_de text;
  v_periodo    text;
BEGIN
  SELECT o."num_guia", o."monto_cobrar", s."value" AS "estado" INTO v_orden
    FROM "orden" o JOIN "order_status" s ON s."id" = o."estatus_id"
   WHERE o."id" = NEW."orden_id";

  SELECT c."porcentaje", c."minimo" INTO v_cond
    FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = NEW."orden_id";
  v_porcentual := FOUND;

  SELECT g."plan_id", p."nombre", g."plan_tipo_cobro" INTO v_empresa
    FROM "organizacion" g LEFT JOIN "plan" p ON p."id" = g."plan_id"
   WHERE g."id" = NEW."organizacion_id";
  v_periodo := CASE WHEN v_empresa."plan_id" IS NOT NULL THEN v_empresa."plan_tipo_cobro" END;

  IF NEW."tipo" = 'reverso' THEN
    SELECT t."id" INTO v_reverso_de
      FROM "cobro_plataforma_traza" t
      JOIN "cobro_plataforma_movimiento" m ON m."id" = t."movimiento_id"
     WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."orden_id"
       AND m."secuencia" = NEW."secuencia" - 1 AND m."tipo" = 'cargo';
  END IF;

  INSERT INTO "cobro_plataforma_traza"
    ("id", "organizacion_id", "orden_id", "movimiento_id", "tipo_movimiento", "reverso_de",
     "num_guia", "monto_cobrar", "estado_orden",
     "tipo_cobro", "fuente", "plan_id", "plan_nombre", "porcentaje", "minimo", "valor_fijo",
     "valor_cobrado", "cobrado_at", "periodo_tipo", "periodo_inicio_at", "periodo_fin_at", "reconstruido")
  VALUES
    (gen_random_uuid()::text, NEW."organizacion_id", NEW."orden_id", NEW."id", NEW."tipo", v_reverso_de,
     v_orden."num_guia", v_orden."monto_cobrar", v_orden."estado",
     CASE WHEN v_porcentual THEN 'porcentual' ELSE 'fijo' END,
     NEW."fuente", v_empresa."plan_id", v_empresa."nombre", v_cond."porcentaje", v_cond."minimo",
     CASE WHEN NOT v_porcentual THEN NEW."monto" END,
     CASE WHEN NEW."tipo" = 'reverso' THEN -NEW."monto" ELSE NEW."monto" END,
     NEW."ocurrido_at", v_periodo,
     CASE WHEN v_periodo IS NOT NULL THEN plan_inicio_periodo_calendario(v_periodo, NEW."ocurrido_at") END,
     CASE WHEN v_periodo IS NOT NULL THEN plan_fin_periodo_calendario(v_periodo, NEW."ocurrido_at") END,
     false);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_traza_al_registrar() FROM PUBLIC;

CREATE TRIGGER "cobro_plataforma_traza_al_registrar" AFTER INSERT ON "cobro_plataforma_movimiento"
  FOR EACH ROW EXECUTE FUNCTION cobro_plataforma_traza_al_registrar();

-- ─── 5. El relleno ve un libro quieto ───────────────────────────────────────────────────────────────
-- SHARE ROW EXCLUSIVE frena los INSERT de movimientos hasta el COMMIT y deja leerlos.
LOCK TABLE "cobro_plataforma_movimiento" IN SHARE ROW EXCLUSIVE MODE;

-- ─── 6. Relleno de los movimientos de antes (R17, R18; P2) ──────────────────────────────────────────
-- Solo lo que el movimiento y las condiciones congeladas guardaron. Guía, `monto_cobrar`, estado y plan
-- quedan vacíos: los de hoy no son los del cobro y copiarlos haría pasar un dato de hoy por uno del
-- momento (decisión «Históricos»). El período sí, con el tipo de la empresa al migrar si hoy tiene plan,
-- el único conocido (P2). Una orden porcentual solo tiene movimientos de la conciliación, siempre con sus
-- condiciones congeladas. Las funciones del período lanzan 22023 con un tipo nulo: sin plan no se llaman.
-- Los cargos primero: un reverso apunta siempre a un cargo ya rellenado.
INSERT INTO "cobro_plataforma_traza"
  ("id", "organizacion_id", "orden_id", "movimiento_id", "tipo_movimiento", "reverso_de",
   "tipo_cobro", "fuente", "porcentaje", "minimo", "valor_fijo", "valor_cobrado", "cobrado_at",
   "periodo_tipo", "periodo_inicio_at", "periodo_fin_at", "reconstruido")
SELECT gen_random_uuid()::text, m."organizacion_id", m."orden_id", m."id", m."tipo", NULL,
       CASE WHEN c."orden_id" IS NULL THEN 'fijo' ELSE 'porcentual' END,
       m."fuente", c."porcentaje", c."minimo",
       CASE WHEN c."orden_id" IS NULL THEN m."monto" END,
       m."monto", m."ocurrido_at",
       p."tipo",
       CASE WHEN p."tipo" IS NOT NULL THEN plan_inicio_periodo_calendario(p."tipo", m."ocurrido_at") END,
       CASE WHEN p."tipo" IS NOT NULL THEN plan_fin_periodo_calendario(p."tipo", m."ocurrido_at") END,
       true
  FROM "cobro_plataforma_movimiento" m
  JOIN "organizacion" g ON g."id" = m."organizacion_id"
  LEFT JOIN "cobro_plataforma_porcentual_orden" c ON c."orden_id" = m."orden_id"
  CROSS JOIN LATERAL (SELECT CASE WHEN g."plan_id" IS NOT NULL THEN g."plan_tipo_cobro" END AS "tipo") p
 WHERE m."tipo" = 'cargo'
   AND NOT EXISTS (SELECT 1 FROM "cobro_plataforma_traza" t
                    WHERE t."organizacion_id" = m."organizacion_id" AND t."movimiento_id" = m."id");

INSERT INTO "cobro_plataforma_traza"
  ("id", "organizacion_id", "orden_id", "movimiento_id", "tipo_movimiento", "reverso_de",
   "tipo_cobro", "fuente", "porcentaje", "minimo", "valor_fijo", "valor_cobrado", "cobrado_at",
   "periodo_tipo", "periodo_inicio_at", "periodo_fin_at", "reconstruido")
SELECT gen_random_uuid()::text, m."organizacion_id", m."orden_id", m."id", m."tipo", tc."id",
       CASE WHEN c."orden_id" IS NULL THEN 'fijo' ELSE 'porcentual' END,
       m."fuente", c."porcentaje", c."minimo",
       CASE WHEN c."orden_id" IS NULL THEN m."monto" END,
       -m."monto", m."ocurrido_at",
       p."tipo",
       CASE WHEN p."tipo" IS NOT NULL THEN plan_inicio_periodo_calendario(p."tipo", m."ocurrido_at") END,
       CASE WHEN p."tipo" IS NOT NULL THEN plan_fin_periodo_calendario(p."tipo", m."ocurrido_at") END,
       true
  FROM "cobro_plataforma_movimiento" m
  JOIN "organizacion" g ON g."id" = m."organizacion_id"
  LEFT JOIN "cobro_plataforma_porcentual_orden" c ON c."orden_id" = m."orden_id"
  CROSS JOIN LATERAL (SELECT CASE WHEN g."plan_id" IS NOT NULL THEN g."plan_tipo_cobro" END AS "tipo") p
  LEFT JOIN "cobro_plataforma_movimiento" mc
    ON mc."organizacion_id" = m."organizacion_id" AND mc."orden_id" = m."orden_id"
   AND mc."secuencia" = m."secuencia" - 1 AND mc."tipo" = 'cargo'
  LEFT JOIN "cobro_plataforma_traza" tc
    ON tc."organizacion_id" = mc."organizacion_id" AND tc."movimiento_id" = mc."id"
 WHERE m."tipo" = 'reverso'
   AND NOT EXISTS (SELECT 1 FROM "cobro_plataforma_traza" t
                    WHERE t."organizacion_id" = m."organizacion_id" AND t."movimiento_id" = m."id");

-- ─── 7. Cierre (R19): ningún movimiento sin traza, o no queda nada ──────────────────────────────────
DO $$
DECLARE
  v_sin_traza bigint;
BEGIN
  SELECT count(*) INTO v_sin_traza
    FROM "cobro_plataforma_movimiento" m
   WHERE NOT EXISTS (SELECT 1 FROM "cobro_plataforma_traza" t
                      WHERE t."organizacion_id" = m."organizacion_id" AND t."movimiento_id" = m."id");
  IF v_sin_traza > 0 THEN
    RAISE EXCEPTION 'SLT-85: % movimientos de cobro_plataforma_movimiento quedaron sin traza; no se aplica nada',
      v_sin_traza;
  END IF;
END $$;

COMMIT;
