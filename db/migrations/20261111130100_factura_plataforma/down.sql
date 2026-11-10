-- DOWN de SLT-118 (design §6.2; R27) — quita la factura de la plataforma, sus funciones, las cuotas del tope
-- del pago y la periodicidad de órdenes del plan.
--
-- SE NIEGA A BAJAR, sin tocar nada, si hay alguna factura cerrada con cuota o con primera cuota: quitar la
-- tabla bajaría la deuda de esa empresa y dejaría los pagos de la cuota como sobrepago. Sin cuotas cerradas,
-- deja la base como estaba: sin la tabla, sin `plan.periodicidad_ordenes` y con el tope del pago de SL-45 igual
-- que antes (cuerpo LITERAL de 20261024140000).
--
-- ORDEN: es el primer down de SLT-118; después va el de 20261111130000 (el valor de `job_tipo`).

BEGIN;

-- Frena cierres y tomas de cambio entre la comprobación y el DROP TABLE.
LOCK TABLE "factura_plataforma" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "factura_plataforma"
              WHERE "estado" = 'cerrada' AND ("cuota" IS NOT NULL OR "primera_cuota" IS NOT NULL)) THEN
    RAISE EXCEPTION 'SLT-118 down: hay facturas cerradas con cuota o primera cuota; bajar quitaría la cuota de la deuda y dejaría sus pagos como sobrepago';
  END IF;
END $$;

-- El tope del pago, como lo dejó 20261024140000 (SL-45). El REVOKE de EXECUTE se conserva con el OR REPLACE.
CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cargos numeric(14, 2);
  v_pagos  numeric(14, 2);
  v_deuda  numeric(14, 2);
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

  SELECT COALESCE(SUM(CASE WHEN c."tipo" = 'cargo' THEN c."monto" ELSE -c."monto" END), 0)
    INTO v_cargos
    FROM "cobro_plataforma_movimiento" c
   WHERE c."organizacion_id" = NEW."organizacion_id";

  SELECT COALESCE(SUM(p."monto"), 0)
    INTO v_pagos
    FROM "wallet_movimiento" p
   WHERE p."organizacion_id" = NEW."organizacion_id"
     AND p."tipo" = 'egreso'
     AND p."categoria" = 'egreso_pago_plataforma'
     AND NOT EXISTS (
       SELECT 1 FROM "wallet_movimiento" a
        WHERE a."organizacion_id" = NEW."organizacion_id"
          AND a."tipo" = 'ingreso'
          AND a."categoria" = 'ingreso_ajuste'
          AND a."origen_tipo" = 'gasto'
          AND a."origen_id" = p."id"
     );

  v_deuda := v_cargos - v_pagos;
  IF v_deuda <= 0 OR NEW."monto" > v_deuda THEN
    RAISE EXCEPTION 'el pago a la plataforma (%) supera la deuda vigente de la empresa (%)', NEW."monto", v_deuda
      USING ERRCODE = 'check_violation', CONSTRAINT = 'wallet_movimiento_tope_pago_plataforma';
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION factura_plataforma_en_curso(text);
DROP FUNCTION factura_plataforma_cerrar(text, timestamp);
DROP FUNCTION factura_plataforma_cuota(text, timestamp, text, text, boolean);
DROP FUNCTION factura_plataforma_ordenes(text, timestamp, timestamp);
DROP FUNCTION factura_plataforma_tomar_cambio(text, timestamp, text, text);
DROP FUNCTION factura_plataforma_avanzar(text, timestamp);

DROP TRIGGER "factura_plataforma_inmutable" ON "factura_plataforma";
DROP FUNCTION factura_plataforma_inmutable();

-- `factura_plataforma_abrir` devuelve el tipo de la fila: va antes del DROP TABLE.
DROP FUNCTION factura_plataforma_abrir(text, timestamp);

DROP FUNCTION plan_costo_del_tramo(numeric, integer, integer);
DROP FUNCTION plan_dias_de_calendario(timestamp, timestamp);
DROP FUNCTION plan_costo_del_periodo(numeric, jsonb, text);

DROP TABLE "factura_plataforma";

-- R27, R35: el plan vuelve sin periodicidad de órdenes (su CHECK cae con la columna).
ALTER TABLE "plan" DROP COLUMN "periodicidad_ordenes";

COMMIT;
