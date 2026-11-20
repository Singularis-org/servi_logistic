-- SLT-214 (design §1; R1, R6, R7, R16, R18, R23) — los beneficios de texto de un plan.
--
-- Tres piezas, en este orden:
--   1. la tabla de PLATAFORMA `plan_beneficio`, como `plan_modulo`: una fila por beneficio en su posición. Los
--      CHECK cierran lo que la app ya valida (R6): posición no negativa, texto de 1 a 120 sin espacios en los
--      extremos y un ícono del catálogo de `lib/planes/beneficios.ts`. El ícono es texto con CHECK y no un enum,
--      como `periodicidad_ordenes`: ampliar el catálogo es cambiar el CHECK. Sin único por texto: R4 compara sin
--      tildes, y `unaccent` no sirve en un índice (ver 20260731160000); la regla vive en zod. RLS sin políticas y
--      `REVOKE ALL … FROM servi_app`: sin el REVOKE, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría CRUD;
--   2. el CHECK `plan_borrador_pasos_conocidos` admite el paso nuevo `beneficios` (R7);
--   3. `plan_de_la_empresa` devuelve `beneficios` (R23): los de la versión propia de la empresa si la trae, y si
--      no, los del plan (R18). La empresa los lee solo por aquí, solo los de su plan.
--
-- En `plan_cambio_programado.version`, `plan_version_empresa.version` y `plan_borrador.pasos` los beneficios
-- viajan como `beneficios: [{ icono, texto }]`; no hay columna nueva.
--
-- ATOMICIDAD: BEGIN/COMMIT, como 20261117120000, para que el runner de los tests (sentencia a sentencia)
-- tampoco deje nada a medias.
--
-- Prefijo 20261120: va después de la mayor migración de `dev` (20261119120100_cobro_plataforma_ocurrido_utc).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- ─── 1. La tabla (§1.1; R1, R6) ───────────────────────────────────────────────────────────────────────

CREATE TABLE "plan_beneficio" (
  "plan_id"  TEXT         NOT NULL,
  "posicion" INTEGER      NOT NULL,
  "icono"    TEXT         NOT NULL,
  "texto"    VARCHAR(120) NOT NULL,
  CONSTRAINT "plan_beneficio_pkey" PRIMARY KEY ("plan_id", "posicion"),
  CONSTRAINT "plan_beneficio_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "plan_beneficio_posicion_check" CHECK ("posicion" >= 0),
  CONSTRAINT "plan_beneficio_texto_check"
    CHECK (char_length("texto") BETWEEN 1 AND 120 AND "texto" = btrim("texto")),
  CONSTRAINT "plan_beneficio_icono_check"
    CHECK ("icono" IN ('equipo','soporte','reloj_24h','rayo','estrella','escudo','cohete','regalo','grafica',
                       'camion','check','corazon'))
);

ALTER TABLE "plan_beneficio" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan_beneficio" FROM servi_app;

-- ─── 2. El paso «Beneficios» del borrador (§1.3; R7) ─────────────────────────────────────────────────

ALTER TABLE "plan_borrador" DROP CONSTRAINT "plan_borrador_pasos_conocidos";
ALTER TABLE "plan_borrador" ADD CONSTRAINT "plan_borrador_pasos_conocidos"
  CHECK (("pasos" - ARRAY['general','precio','orden','topes','modulos','beneficios','vigencia']) = '{}'::jsonb);

-- ─── 3. «Mi plan» lee los beneficios (§3.4; R16, R18, R23) ───────────────────────────────────────────

-- Origen: 20261114120000_plan_cambio_por_empresa. Cambia SOLO la clave `beneficios`; firma, tipo de retorno y el
-- resto del cuerpo son los de antes. `CREATE OR REPLACE` conserva dueño, REVOKE y GRANT.
CREATE OR REPLACE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
  v_plan     jsonb;
  v_version  jsonb;
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_de_la_empresa: solo se lee el plan de la empresa del contexto';
  END IF;
  -- SLT-128 (R2, R12): la versión propia de la empresa durante un cambio a medias, o NULL (la del plan).
  SELECT v."version" INTO v_version
    FROM "organizacion" o
    JOIN "plan_version_empresa" v ON v."empresa_id" = o."id" AND v."plan_id" = o."plan_id"
   WHERE o."id" = p_organizacion_id;
  v_plan := (
    SELECT jsonb_build_object(
      'nombre', pv."nombre",
      'precio_mensual', CASE WHEN v_version IS NULL THEN p."precio_mensual"::text
                             ELSE (v_version -> 'precio' ->> 'mensual')::numeric(12, 2)::text END,
      'descuentos', CASE WHEN v_version IS NULL THEN
                      COALESCE((SELECT jsonb_object_agg(d."periodo",
                                CASE WHEN d."porcentaje" IS NOT NULL
                                     THEN jsonb_build_object('tipo', 'porcentaje', 'porcentaje', d."porcentaje"::text)
                                     ELSE jsonb_build_object('tipo', 'monto', 'monto', d."monto"::text) END)
                                FROM "plan_descuento_periodo" d WHERE d."plan_id" = p."id"), '{}'::jsonb)
                    ELSE
                      -- Con los tipos de las columnas, para que el texto salga igual que sin versión propia.
                      COALESCE((SELECT jsonb_object_agg(d.key,
                                CASE WHEN d.value ->> 'tipo' = 'porcentaje'
                                     THEN jsonb_build_object('tipo', 'porcentaje', 'porcentaje',
                                                             (d.value ->> 'porcentaje')::numeric(5, 2)::text)
                                     ELSE jsonb_build_object('tipo', 'monto', 'monto',
                                                             (d.value ->> 'monto')::numeric(12, 2)::text) END)
                                FROM jsonb_each(COALESCE(v_version -> 'precio' -> 'descuentos', '{}'::jsonb)) d), '{}'::jsonb)
                    END,
      'precio_del_periodo', (SELECT jsonb_build_object('precio_mensual', h."precio_mensual"::text, 'descuentos', h."descuentos")
                               FROM "plan_precio_historial" h
                              WHERE h."plan_id" = p."id" AND h."desde_at" <= ci."inicio"
                              ORDER BY h."desde_at" DESC LIMIT 1),
      'costo_por_orden', pv."costo_por_orden"::text,
      'costo_por_orden_pct', pv."costo_por_orden_pct"::text,
      'costo_por_orden_minimo', pv."costo_por_orden_minimo"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente", 'porcentaje', t."porcentaje"::text, 'minimo', t."minimo"::text) FROM cobro_plataforma_tarifa_de(o."id") t),
      'cobro_ciclo', (SELECT jsonb_build_object('cobrado', c."cobrado"::text, 'pendientes', c."pendientes")
                        FROM plan_cobro_del_ciclo(o."id", ci."inicio") c),
      'tipo_cobro', o."plan_tipo_cobro",
      'tope_api_keys', pv."tope_api_keys",
      'topes_rol', CASE WHEN v_version IS NULL THEN
                     COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb)
                   ELSE
                     -- La clave de la versión es la de la app (`adminTienda`); la fila, la etiqueta de Postgres.
                     -- Un rol con `null` no tiene tope, como sin fila en `plan_tope_rol`.
                     COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                 'rol', CASE WHEN t.key = 'adminTienda' THEN 'Admin Tienda' ELSE t.key END,
                                 'maximo', (t.value #>> '{}')::integer))
                               FROM jsonb_each(COALESCE(v_version -> 'topes' -> 'porRol', '{}'::jsonb)) t
                              WHERE jsonb_typeof(t.value) = 'number'), '[]'::jsonb)
                   END,
      'modulos', CASE WHEN v_version IS NULL THEN
                   COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb)
                 ELSE COALESCE(v_version -> 'modulos', '[]'::jsonb) END,
      -- SLT-214 (R16, R18, R23): los beneficios en su orden. Una versión propia sin la clave (guardada antes de
      -- SLT-214) es «sin cambio en los beneficios»: valen los del plan.
      'beneficios', CASE WHEN v_version IS NULL OR NOT (v_version ? 'beneficios') THEN
                      COALESCE((SELECT jsonb_agg(jsonb_build_object('icono', b."icono", 'texto', b."texto") ORDER BY b."posicion")
                                  FROM "plan_beneficio" b WHERE b."plan_id" = p."id"), '[]'::jsonb)
                    ELSE v_version -> 'beneficios' END,
      'ciclo_inicio', ci."inicio",
      'ciclo_fin', plan_fin_periodo_calendario(o."plan_tipo_cobro", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", ci."inicio"),
        'api_keys', plan_uso_api_keys(o."id"),
        'admin', plan_uso_rol(o."id", 'admin'::rol_value),
        'mensajero', plan_uso_rol(o."id", 'mensajero'::rol_value),
        'admin_tienda', plan_uso_rol(o."id", 'Admin Tienda'::rol_value),
        'admin_satelite', plan_uso_rol(o."id", 'adminSatelite'::rol_value)),
      -- Solo la fecha y la versión: NUNCA `avisos_al_programar` (nombra otras empresas) ni el actor (R9).
      -- SLT-128 (R12): la fecha es SU recepción, no F; si ya lo recibió, o quedó «no aplicada» (R28), no hay
      -- cambio que mostrar.
      'cambio', (SELECT jsonb_build_object('vigente_desde', r."recibe_at", 'version', c."version")
                   FROM "plan_cambio_programado" c
                   JOIN "plan_cambio_recepcion" r ON r."cambio_id" = c."id" AND r."empresa_id" = o."id"
                  WHERE c."plan_id" = p."id" AND r."recibido_at" IS NULL AND r."no_aplicada_at" IS NULL),
      -- El pendiente de la empresa, sin `plan_cambio_actor_id` (R32).
      'cambio_empresa', CASE WHEN o."plan_cambio_id" IS NULL THEN NULL
                             ELSE jsonb_build_object(
                               'plan_nombre', (SELECT pc."nombre" FROM "plan" pc WHERE pc."id" = o."plan_cambio_plan_id"),
                               'tipo_cobro', o."plan_cambio_tipo_cobro",
                               'desde', o."plan_cambio_desde_at") END)
      FROM "organizacion" o
      JOIN "plan" p ON p."id" = o."plan_id"
     CROSS JOIN LATERAL plan_version_de(o."id", o."plan_id") pv
     CROSS JOIN LATERAL (SELECT plan_inicio_ciclo_de(o."plan_ciclo_ancla_at", o."plan_tipo_cobro", v_ahora) AS "inicio") ci
     WHERE o."id" = p_organizacion_id);
  IF v_plan IS NOT NULL THEN
    RETURN v_plan;
  END IF;
  -- R26 sin plan: la primera asignación pendiente, con la misma forma de `cambio_empresa` y sin el actor.
  RETURN (
    SELECT jsonb_build_object(
      'sin_plan', true,
      'cambio_empresa', jsonb_build_object(
        'plan_nombre', (SELECT pc."nombre" FROM "plan" pc WHERE pc."id" = o."plan_cambio_plan_id"),
        'tipo_cobro', o."plan_cambio_tipo_cobro",
        'desde', o."plan_cambio_desde_at"))
      FROM "organizacion" o
     WHERE o."id" = p_organizacion_id AND o."plan_id" IS NULL AND o."plan_cambio_id" IS NOT NULL);
END $$;

COMMIT;
