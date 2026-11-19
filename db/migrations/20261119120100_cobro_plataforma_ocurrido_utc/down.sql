-- DOWN de SLT-212 — vuelve a las definiciones de 20261104150200_cobro_plataforma_porcentual_funciones, con el
-- `now()` a secas (dependiente del TimeZone de la sesión). Los movimientos escritos entretanto se quedan como
-- están: en UTC, que es lo que la columna promete.

BEGIN;

CREATE OR REPLACE FUNCTION cobro_plataforma_porcentual_conciliar(p_orden_id text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cond   "cobro_plataforma_porcentual_orden"%ROWTYPE;
  v_orden  record;
  v_ultimo "cobro_plataforma_movimiento"%ROWTYPE;
  v_debe   boolean;
  v_tiene  boolean;
BEGIN
  SELECT c.* INTO v_cond FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = p_orden_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT o."organizacion_id", o."estatus_id", o."deleted_at", o."monto_cobrar" INTO v_orden
    FROM "orden" o WHERE o."id" = p_orden_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_debe := v_orden."deleted_at" IS NULL AND orden_estado_es_final(v_orden."estatus_id");

  SELECT m.* INTO v_ultimo FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = v_orden."organizacion_id" AND m."orden_id" = p_orden_id
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  v_tiene := FOUND AND v_ultimo."tipo" = 'cargo';

  IF v_debe AND NOT v_tiene THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, v_orden."organizacion_id", p_orden_id, COALESCE(v_ultimo."secuencia", 0) + 1,
            'cargo', 'plan',
            cobro_plataforma_importe_porcentual(v_orden."monto_cobrar", v_cond."porcentaje", v_cond."minimo"), now());
  ELSIF NOT v_debe AND v_tiene THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, v_orden."organizacion_id", p_orden_id, v_ultimo."secuencia" + 1, 'reverso',
            v_ultimo."fuente", v_ultimo."monto", COALESCE(v_orden."deleted_at", now()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monto  numeric(12, 2);
  v_fuente cobro_plataforma_fuente;
  v_pct    numeric(5, 2);
  v_minimo numeric(12, 2);
BEGIN
  SELECT t."monto", t."fuente", t."porcentaje", t."minimo"
    INTO v_monto, v_fuente, v_pct, v_minimo
    FROM cobro_plataforma_tarifa_de(NEW."organizacion_id") t;

  IF v_pct IS NOT NULL THEN
    INSERT INTO "cobro_plataforma_porcentual_orden" ("orden_id", "organizacion_id", "porcentaje", "minimo")
    VALUES (NEW."id", NEW."organizacion_id", v_pct, v_minimo);
    PERFORM cobro_plataforma_porcentual_conciliar(NEW."id");
    RETURN NULL;
  END IF;

  INSERT INTO "cobro_plataforma_movimiento"
    ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
  VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 1, 'cargo', v_fuente, v_monto, now());

  IF NEW."deleted_at" IS NOT NULL THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 2, 'reverso', v_fuente, v_monto, NEW."deleted_at");
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION cobro_plataforma_al_cambiar_borrado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ultimo "cobro_plataforma_movimiento"%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = NEW."id") THEN
    PERFORM cobro_plataforma_porcentual_conciliar(NEW."id");
    RETURN NULL;
  END IF;

  SELECT m.* INTO v_ultimo FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."id"
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW."deleted_at" IS NOT NULL AND v_ultimo."tipo" = 'cargo' THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", v_ultimo."secuencia" + 1, 'reverso',
            v_ultimo."fuente", v_ultimo."monto", NEW."deleted_at");
  ELSIF NEW."deleted_at" IS NULL AND v_ultimo."tipo" = 'reverso' THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", v_ultimo."secuencia" + 1, 'cargo',
            v_ultimo."fuente", v_ultimo."monto", now());
  END IF;
  RETURN NULL;
END $$;

COMMIT;
