-- DOWN de SLT-126 (design §1.2; R12) — vuelve la columna del valor propio y la regla vigente anterior:
-- valor propio > plan porcentual > plan fijo > global > 0.00 «sin_configurar».
--
-- La columna vuelve VACÍA (NULL en todas las empresas): los importes borrados no se guardaron (P3), así que
-- tras bajar ninguna empresa tiene valor propio hasta que el superadmin lo fije otra vez.
--
-- La columna va antes que la función: así nunca hay un instante con una función que lee una columna
-- inexistente. El cuerpo de la función es el de 20261104150200 §3 BYTE A BYTE, para que el
-- `md5(pg_get_functiondef(...))` coincida con el de antes de subir (`migracion-slt126-ida-y-vuelta`).
-- `CREATE OR REPLACE` conserva dueño, el `REVOKE … FROM PUBLIC` y las llamadas por nombre.
--
-- No toca movimientos, trazas ni el enum.

BEGIN;

-- 1. La columna y su CHECK, con el nombre y la expresión de 20261023130000.
ALTER TABLE "organizacion" ADD COLUMN "cobro_plataforma_por_orden" DECIMAL(12,2);
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_cobro_plataforma_por_orden_check"
    CHECK ("cobro_plataforma_por_orden" IS NULL OR "cobro_plataforma_por_orden" >= 0);

-- 2. La regla vigente de 20261104150200 §3, con la excepción primero.
CREATE OR REPLACE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)
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

COMMIT;
