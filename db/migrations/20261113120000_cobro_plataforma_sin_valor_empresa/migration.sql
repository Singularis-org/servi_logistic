-- SLT-126 (design §1.1; R5, R6, R7, R10) — el cobro por orden deja de tener un valor propio por empresa.
-- La regla vigente queda: plan porcentual > plan fijo > global > 0.00 «sin_configurar».
--
-- Tres piezas, en este orden:
--   1. `cobro_plataforma_tarifa_de`: CREATE OR REPLACE con el MISMO `RETURNS TABLE`. El cuerpo es el de
--      20261104150200 §3 copiado literalmente salvo dos cambios: desaparecen `v_excepcion` y su `IF`, y el
--      `SELECT` deja de leer `o."cobro_plataforma_por_orden"`. `CREATE OR REPLACE` conserva dueño, el
--      `REVOKE … FROM PUBLIC` y las llamadas por nombre desde `plan_de_la_empresa` y el trigger de alta.
--   2. y 3. El CHECK y la columna `organizacion.cobro_plataforma_por_orden` (R10).
--
-- La función va antes que la columna: plpgsql no registra la dependencia, así que el orden inverso también
-- aplicaría, pero así nunca hay un instante con una función que lee una columna inexistente.
--
-- NO toca movimientos, trazas, condiciones porcentuales ni el enum `cobro_plataforma_fuente` (R9, R10): el
-- valor `empresa` se queda porque lo llevan movimientos y trazas históricos. Los reversos y re-cargos de
-- esas órdenes copian `fuente` y `monto` del último movimiento (20261104150200 §5, §6), así que conservan
-- su importe (R8).
--
-- Los importes borrados no se guardan (P3): el informe previo al deploy (D1) es su único registro.
--
-- ATOMICIDAD. `BEGIN; … COMMIT;` para que sea atómica también con el runner de los tests de ida y vuelta,
-- que manda el archivo sentencia a sentencia (misma razón que 20261109120000).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- 1. R5. Origen: 20261104150200 §3 (SLT-83).
CREATE OR REPLACE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)
  RETURNS TABLE ("monto" numeric(12, 2), "fuente" cobro_plataforma_fuente, "porcentaje" numeric(5, 2), "minimo" numeric(12, 2))
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan      numeric(12, 2);
  v_pct       numeric(5, 2);
  v_minimo    numeric(12, 2);
  v_global    numeric(12, 2);
BEGIN
  SELECT p."costo_por_orden", p."costo_por_orden_pct", p."costo_por_orden_minimo"
    INTO v_plan, v_pct, v_minimo
    FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
   WHERE o."id" = p_organizacion_id;
  IF v_pct       IS NOT NULL THEN RETURN QUERY SELECT NULL::numeric(12,2), 'plan'::cobro_plataforma_fuente, v_pct, v_minimo;          RETURN; END IF;
  IF v_plan      IS NOT NULL THEN RETURN QUERY SELECT v_plan, 'plan'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);     RETURN; END IF;
  SELECT t."monto" INTO v_global FROM "cobro_plataforma_tarifa" t WHERE t."id";
  IF v_global    IS NOT NULL THEN RETURN QUERY SELECT v_global, 'global'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2); RETURN; END IF;
  RETURN QUERY SELECT 0::numeric(12,2), 'sin_configurar'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);
END $$;

-- 2. R10. El CHECK de 20261023130000.
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_cobro_plataforma_por_orden_check";

-- 3. R10. La columna. Ninguna otra función ni trigger la lee (design «Lo que ya existe»).
ALTER TABLE "organizacion" DROP COLUMN "cobro_plataforma_por_orden";

COMMIT;
