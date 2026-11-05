-- SLT-83 — revierte 20261104150100_cobro_plataforma_porcentual_orden (design §2.2). Va después del down de
-- 20261104150200, así que el trigger de alta que escribía en esta tabla ya no la nombra.
--
-- SE NIEGA si la tabla tiene filas (R27): esas órdenes perderían las condiciones con las que se cobran, y
-- la regla de antes no sabría cobrarlas. Quien quiera bajar, antes resuelve esas órdenes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cobro_plataforma_porcentual_orden") THEN
    RAISE EXCEPTION 'SLT-83 down: hay órdenes con condiciones porcentuales congeladas; bajar las dejaría sin su cobro';
  END IF;
END
$$;

-- Misma empresa (SL-17 M3), GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.
DROP TRIGGER "sme_cobro_plataforma_porcentual_orden_orden__f90554ea" ON "cobro_plataforma_porcentual_orden";
DROP TRIGGER "cobro_plataforma_porcentual_orden_sin_cambio_de_empresa" ON "cobro_plataforma_porcentual_orden";

DROP POLICY "cobro_plataforma_porcentual_orden_por_empresa" ON "cobro_plataforma_porcentual_orden";

-- Los índices y las FK se van con la tabla.
DROP TABLE "cobro_plataforma_porcentual_orden";

DROP INDEX "cobro_plataforma_movimiento_organizacion_id_ocurrido_at_idx";
