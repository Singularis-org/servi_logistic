-- SL-40 — revierte 20261024120000_cobro_plataforma_blindaje_orden: deja el trigger de creación y los
-- privilegios de `servi_app` sobre `orden` como los dejó 20261023130200. Vuelven a estar abiertas
-- las dos vías de la review (B1, B2). Los cargos ya registrados se quedan.

DROP TRIGGER "cobro_plataforma_al_crear_orden" ON "orden";

CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monto  numeric(12, 2);
  v_fuente cobro_plataforma_fuente;
BEGIN
  SELECT o."cobro_plataforma_por_orden" INTO v_monto FROM "organizacion" o WHERE o."id" = NEW."organizacion_id";
  IF v_monto IS NOT NULL THEN
    v_fuente := 'empresa';
  ELSE
    SELECT t."monto" INTO v_monto FROM "cobro_plataforma_tarifa" t WHERE t."id";
    IF v_monto IS NOT NULL THEN
      v_fuente := 'global';
    ELSE
      v_monto := 0;
      v_fuente := 'sin_configurar';
    END IF;
  END IF;

  INSERT INTO "cobro_plataforma_movimiento"
    ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
  VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 1, 'cargo', v_fuente, v_monto, now());
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION cobro_plataforma_al_crear_orden() FROM PUBLIC;

CREATE TRIGGER "cobro_plataforma_al_crear_orden" AFTER INSERT ON "orden"
  FOR EACH ROW WHEN (NEW."deleted_at" IS NULL)
  EXECUTE FUNCTION cobro_plataforma_al_crear_orden();

GRANT DELETE ON "orden" TO servi_app;
