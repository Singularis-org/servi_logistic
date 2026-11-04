-- DOWN de SLT-52 T1.2 — revierte 20261103120100_tarifas_flexibles_tablas.
--
-- ORDEN: va DESPUES del down de 20261103120200 (los triggers de misma empresa sobre estas tablas) y
-- ANTES del de 20261103120000 (los enums que usan).
--
-- ⚠️ DESTRUCTIVO para lo que se haya escrito en el modelo nuevo: los valores, los grupos y lo
-- congelado de los cierres con `tarifa_modelo = 'nuevo'`. Un cierre congelado con el modelo nuevo
-- deja de poder leerse (sus columnas viejas van NULL): bajar esta migracion con cierres `nuevo` en la
-- base es perder su detalle. Por eso se para si existe alguno, en vez de borrarlo en silencio.
--
-- Las politicas, los CHECK, los indices y las FK se van con cada tabla. Orden inverso a las FK.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cierre_detail" WHERE "tarifa_modelo" = 'nuevo') THEN
    RAISE EXCEPTION 'rollback SLT-52: hay cierres congelados con el modelo nuevo; se aborta sin borrar nada';
  END IF;
END
$$;

DROP TABLE "gestion_pago_congelado";
DROP TABLE "cierre_detail_concepto";
ALTER TABLE "cierre_detail" DROP COLUMN "tarifa_modelo";
DROP TABLE "tarifa_valor";
DROP TABLE "grupo_distritos_distrito";
DROP TABLE "grupo_distritos";
