-- DOWN de SLT-85 (design §3.1; R20, P4) — quita la traza de facturación y los dos triggers que la cuidan.
--
-- SE NIEGA A BAJAR, sin tocar nada, si existe alguna fila escrita en vivo (`reconstruido = false`): es la
-- copia del momento (guía, monto, estado, plan) y no se puede volver a sacar. Lo rellenado sí se puede
-- reconstruir: subir la migración otra vez lo rehace igual. Mismo criterio que 20261031140100/down.sql.
--
-- No toca ningún movimiento ni ninguna función de SL-40, SLT-66, SLT-83 ni SLT-86. El DROP TABLE se lleva
-- los triggers de misma empresa, el de inmutabilidad, la política, los únicos y los índices.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cobro_plataforma_traza" WHERE NOT "reconstruido") THEN
    RAISE EXCEPTION 'SLT-85 down: hay trazas escritas en vivo (reconstruido = false); bajar perdería la copia del momento';
  END IF;
END $$;

DROP TRIGGER "cobro_plataforma_traza_al_registrar" ON "cobro_plataforma_movimiento";
DROP FUNCTION cobro_plataforma_traza_al_registrar();

DROP TRIGGER "cobro_plataforma_traza_inmutable" ON "cobro_plataforma_traza";
DROP FUNCTION cobro_plataforma_traza_inmutable();

DROP TABLE "cobro_plataforma_traza";

COMMIT;
