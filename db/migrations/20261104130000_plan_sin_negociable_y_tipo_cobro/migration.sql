-- Ajuste planes-custom (sin SDD, decisiones D1 y D6 del 2026-10-31,
-- `progress/features/ajuste-planes-custom-asigna-y-cobro.md`).
--
-- D1 — se retira la forma de precio «negociable». Un plan negociable no tiene montos (lo exigía
-- `plan_precio_forma`), así que al soltar la columna queda, sin más, en «sin precio». La versión de un
-- cambio programado pendiente es un `jsonb` con la forma de la app: las que dicen
-- `"precio": {"tipo": "negociable"}` pasan a `{"tipo": "sin_precio"}`, o el aplicador y las lecturas
-- (que la validan con `versionPlanSchema`) la rechazarían. `plan_rastro` y los payloads de correos ya
-- encolados NO se reescriben: son historia (`plan_rastro` solo recibe filas nuevas) y la app pinta un
-- «negociable» antiguo como «sin precio» (`textoDelPrecio`).
--
-- Se BORRA la columna en vez de dejarla sin uso: lo único que la nombra en la base es el cuerpo de
-- `plan_de_la_empresa` (plpgsql no se revalida al soltar la columna: fallaría al llamarla), y esa
-- función se recrea aquí de todos modos por D6. Las funciones de costeo de SLT-66
-- (`cobro_plataforma_tarifa_de`, `cobro_plataforma_al_crear_orden`) no la leen. Una columna sin uso
-- obligaría además a vigilar que nadie la vuelva a poner en `true`.
--
-- D6 — tipo de cobro de la asignación: `organizacion.plan_tipo_cobro`, `mensual` | `anual`, junto al
-- `plan_id`. TEXT con CHECK; `NOT NULL DEFAULT 'mensual'` deja en mensual a toda empresa que ya existe
-- (tenga plan o no). `organizacion` sigue siendo de solo lectura para `servi_app`: no hace falta ningún
-- GRANT. La empresa lo lee por `plan_de_la_empresa`, que gana la clave `tipo_cobro`.
--
-- CABECERA: el down.sql repone la columna `precio_negociable` en `false` para TODOS los planes y no
-- devuelve a «negociable» ni los planes ni las versiones pendientes que esta migración pasó a «sin
-- precio»: ese dato se pierde.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- ─── D1: precio sin «negociable» ─────────────────────────────────────────────────────────────────
UPDATE "plan_cambio_programado"
   SET "version" = jsonb_set("version", '{precio}', '{"tipo": "sin_precio"}'::jsonb)
 WHERE "version"->'precio'->>'tipo' = 'negociable';

ALTER TABLE "plan" DROP CONSTRAINT "plan_precio_forma";
ALTER TABLE "plan" DROP COLUMN "precio_negociable";
-- Las cuatro formas del precio: sin precio; mensual; mensual y anual fijo; mensual y porcentaje.
ALTER TABLE "plan" ADD CONSTRAINT "plan_precio_forma" CHECK (
  NOT ("precio_anual" IS NOT NULL AND "descuento_anual_pct" IS NOT NULL)
  AND ("precio_mensual" IS NOT NULL OR ("precio_anual" IS NULL AND "descuento_anual_pct" IS NULL))
);

-- ─── D6: tipo de cobro de la asignación ──────────────────────────────────────────────────────────
ALTER TABLE "organizacion" ADD COLUMN "plan_tipo_cobro" TEXT NOT NULL DEFAULT 'mensual';
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_tipo_cobro_check"
  CHECK ("plan_tipo_cobro" IN ('mensual', 'anual'));

-- Origen: 20261031140200 (SLT-66). Dos cambios: sin `precio_negociable` (D1) y con `tipo_cobro`, el de
-- la asignación (D6). El contexto (`42501`), el `search_path`, el REVOKE y el GRANT no cambian:
-- `CREATE OR REPLACE` conserva dueño y privilegios.
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
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente") FROM cobro_plataforma_tarifa_de(o."id") t),
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
