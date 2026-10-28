-- SL-23 — revierte 20261028120000_modulo_wallet_nucleo.
--
-- Recrea el tipo con las 4 claves de 20261027120000 en su orden, por el mismo camino que la ida:
-- renombrar, crear, cambiar la columna, borrar el viejo. No usa `ALTER TYPE … ADD VALUE` porque
-- Postgres prohíbe usar el valor añadido en la misma transacción (55P04) y aquí se usa.
--
-- `wallet` vuelve ENCENDIDO para todas las empresas: con Wallet en el núcleo nadie lo tenía apagado,
-- y apagarlo al volver cambiaría lo que cada empresa ve. Si alguna lo tenía apagado antes de la ida,
-- eso no se recupera.

ALTER TYPE "modulo_apagable" RENAME TO "modulo_apagable_nuevo";

CREATE TYPE "modulo_apagable" AS ENUM (
  'analitica',
  'monitoreo',
  'wallet',
  'ranking'
);

ALTER TABLE "organizacion_modulo"
  ALTER COLUMN "modulo" TYPE "modulo_apagable" USING "modulo"::text::"modulo_apagable";

DROP TYPE "modulo_apagable_nuevo";

INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo")
SELECT gen_random_uuid()::text, o."id", 'wallet'::"modulo_apagable"
  FROM "organizacion" o
ON CONFLICT ("organizacion_id", "modulo") DO NOTHING;
