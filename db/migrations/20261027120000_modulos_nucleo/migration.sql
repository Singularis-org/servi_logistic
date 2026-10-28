-- SL-23 (ajuste sin SDD, decisiones del humano del 2026-10-27) — «Recolección», «Bodegas satélite»,
-- «API e integraciones» y «WhatsApp» dejan de ser módulos apagables y pasan al núcleo: siempre
-- activos, sin fila que encender. Quedan 4 apagables.
--
-- Postgres no borra valores de un enum, así que el tipo se recrea sin ellos:
--   1. se borran las activaciones de esas cuatro claves (sin ellas el cambio de tipo fallaría);
--   2. el tipo viejo se renombra, se crea el nuevo con las 4 claves en el mismo orden relativo y la
--      columna pasa al nuevo por su texto; el tipo viejo se borra.
--
-- Lo que NO hace falta recrear: la política `organizacion_modulo_por_empresa` y el trigger de «sin
-- cambio de empresa» miran `organizacion_id`, no `modulo`; los GRANT/REVOKE son de la tabla y no del
-- tipo; el único `(organizacion_id, modulo)` lo reconstruye el propio ALTER COLUMN … TYPE.
--
-- Lo que NO se toca: el rastro en `historial_accion` (las claves viven como texto en `valor_*`, sin
-- enum) y el `last_error` de `jobs` (`modulo_inactivo:<clave>`, texto). Son historia.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

DELETE FROM "organizacion_modulo"
 WHERE "modulo"::text IN ('recoleccion', 'bodegas_satelite', 'api_integraciones', 'whatsapp');

ALTER TYPE "modulo_apagable" RENAME TO "modulo_apagable_viejo";

CREATE TYPE "modulo_apagable" AS ENUM (
  'analitica',
  'monitoreo',
  'wallet',
  'ranking'
);

ALTER TABLE "organizacion_modulo"
  ALTER COLUMN "modulo" TYPE "modulo_apagable" USING "modulo"::text::"modulo_apagable";

DROP TYPE "modulo_apagable_viejo";
