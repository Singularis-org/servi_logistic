-- DOWN del ajuste planes-custom (D1, D6) — devuelve `plan_de_la_empresa` a su versión de
-- 20261031140200 (cuerpo COPIADO LITERALMENTE: `migracion-planes-custom-ida-y-vuelta.test.ts` compara el
-- `md5` de `pg_get_functiondef`), suelta `organizacion.plan_tipo_cobro` y repone
-- `plan.precio_negociable` con el CHECK `plan_precio_forma` de 20261028130000.
--
-- PÉRDIDA (la nombra la cabecera de la subida): la columna vuelve en `false` para todos. Los planes y
-- las versiones pendientes que la subida pasó de «negociable» a «sin precio» se quedan en «sin precio».
--
-- ORDEN: primero la columna, porque el cuerpo de la función que vuelve la nombra.

ALTER TABLE "plan" ADD COLUMN "precio_negociable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan" DROP CONSTRAINT "plan_precio_forma";
ALTER TABLE "plan" ADD CONSTRAINT "plan_precio_forma" CHECK (
      NOT ("precio_negociable" AND ("precio_mensual" IS NOT NULL OR "precio_anual" IS NOT NULL OR "descuento_anual_pct" IS NOT NULL))
      AND NOT ("precio_anual" IS NOT NULL AND "descuento_anual_pct" IS NOT NULL)
      AND ("precio_mensual" IS NOT NULL OR ("precio_anual" IS NULL AND "descuento_anual_pct" IS NULL))
    );

-- Origen: 20261031140200_plan_costeo_funciones (SLT-66).
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
      'precio_negociable', p."precio_negociable",
      'precio_mensual', p."precio_mensual"::text,
      'precio_anual', p."precio_anual"::text,
      'descuento_anual_pct', p."descuento_anual_pct"::text,
      'costo_por_orden', p."costo_por_orden"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente") FROM cobro_plataforma_tarifa_de(o."id") t),
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

ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_tipo_cobro_check";
ALTER TABLE "organizacion" DROP COLUMN "plan_tipo_cobro";
