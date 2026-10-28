-- SL-23 — revierte 20261027120000_modulos_nucleo.
--
-- Recrea el tipo con las 8 claves en su orden original (el de 20261026120000) por el mismo camino
-- que la ida: renombrar, crear, cambiar la columna, borrar el viejo. No usa `ALTER TYPE … ADD VALUE`
-- porque Postgres prohíbe usar el valor añadido en la misma transacción (55P04) y aquí se usa.
--
-- Las cinco claves vuelven ENCENDIDAS para todas las empresas, como el backfill de R5: con ellas en el
-- núcleo nadie las tenía apagadas, y apagarlas al volver cambiaría lo que cada empresa ve. Si alguna
-- estaba apagada antes de la ida, eso no se recupera.

ALTER TYPE "modulo_apagable" RENAME TO "modulo_apagable_nuevo";

CREATE TYPE "modulo_apagable" AS ENUM (
  'analitica',
  'monitoreo',
  'recoleccion',
  'bodegas_satelite',
  'wallet',
  'ranking',
  'whatsapp',
  'api_integraciones'
);

ALTER TABLE "organizacion_modulo"
  ALTER COLUMN "modulo" TYPE "modulo_apagable" USING "modulo"::text::"modulo_apagable";

DROP TYPE "modulo_apagable_nuevo";

INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo")
SELECT gen_random_uuid()::text, o."id", m
  FROM "organizacion" o
 CROSS JOIN unnest(ARRAY['recoleccion', 'bodegas_satelite', 'wallet', 'whatsapp', 'api_integraciones']::"modulo_apagable"[]) AS m
ON CONFLICT ("organizacion_id", "modulo") DO NOTHING;
