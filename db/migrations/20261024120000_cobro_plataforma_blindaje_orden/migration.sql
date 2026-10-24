-- SL-40 (review B1, B2) — cierra las dos vías por las que una empresa, con SQL a mano como
-- `servi_app`, se quedaba con una orden sin pagar su cargo (R8, R12, R17). Va en una migración
-- nueva: las tres de SL-40 ya están aplicadas en QA y no se editan.

-- B1. `servi_app` tenía DELETE sobre `orden` (el ALTER DEFAULT PRIVILEGES de 20261022130000), y la
-- FK de `cobro_plataforma_movimiento` es ON DELETE CASCADE. Como la acción referencial corre como
-- dueño, el REVOKE de la tabla de cargos no la frenaba: un `DELETE FROM orden` se llevaba el cargo.
--
-- Se revoca el DELETE y no se pasa la FK a RESTRICT:
--   · la app nunca borra una orden de verdad: eliminar es `deleted_at` (pantalla y API), y en `lib/`
--     y `app/` no hay ningún `orden.delete`, `deleteMany` ni `DELETE FROM orden`. Solo borran las
--     limpiezas de tests y `scripts/bench-busqueda-ordenes.ts`, que corren como dueño;
--   · ninguna FK de `orden` hacia sus padres es ON DELETE CASCADE, así que no hay un borrado
--     indirecto (borrar una tienda o una carga) que llegue a la orden;
--   · RESTRICT no protege más: quien puede borrar la orden como dueño también puede borrar sus
--     cargos. Y rompería esas limpiezas, porque desde SL-40 toda orden tiene su cargo.
REVOKE DELETE ON "orden" FROM servi_app;

-- B2. El trigger de creación tenía `WHEN (NEW.deleted_at IS NULL)`. Una orden insertada ya borrada
-- no tenía movimientos, y al recuperarla el trigger de borrado tomaba la rama «sin movimientos» de D8:
-- quedaba viva y sin cargo.
--
-- Ahora toda orden nueva registra su cargo, entre en el estado que entre. Si nace borrada, registra
-- además su reverso, con el instante de su `deleted_at`, como cualquier anulación (D7). Así la
-- alternancia cargo, reverso, cargo… se cumple desde el primer movimiento, y recuperarla carga por
-- el mismo importe (R16) sin tocar el trigger de borrado ni la regla de D8 para las órdenes de antes
-- de la ficha (R18). La deuda de una orden que nace borrada es 0 (R17).
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

  IF NEW."deleted_at" IS NOT NULL THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 2, 'reverso', v_fuente, v_monto, NEW."deleted_at");
  END IF;
  RETURN NULL;
END $$;

-- CREATE OR REPLACE conserva los privilegios de la función, pero se repite para que esta carpeta
-- se lea sola.
REVOKE EXECUTE ON FUNCTION cobro_plataforma_al_crear_orden() FROM PUBLIC;

-- Sin el WHEN: el trigger corre para toda orden nueva.
DROP TRIGGER "cobro_plataforma_al_crear_orden" ON "orden";
CREATE TRIGGER "cobro_plataforma_al_crear_orden" AFTER INSERT ON "orden"
  FOR EACH ROW EXECUTE FUNCTION cobro_plataforma_al_crear_orden();
