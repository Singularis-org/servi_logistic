-- SL-23 (ajuste sin SDD, decisión del humano del 2026-10-28) — «Wallet» deja de ser un módulo
-- apagable y pasa al núcleo: siempre activo, sin fila que encender. Quedan 3 apagables.
--
-- Va aparte de 20261027120000_modulos_nucleo porque esa ya está mergeada en dev: editarla rompería el
-- checksum de Prisma en todo entorno que la aplicó.
--
-- Mismo camino que 20261027120000 (Postgres no borra valores de un enum):
--   1. se borran las activaciones de `wallet` (sin ellas el cambio de tipo fallaría);
--   2. el tipo viejo se renombra, se crea el nuevo con las 3 claves en el mismo orden relativo y la
--      columna pasa al nuevo por su texto; el tipo viejo se borra.
--
-- Lo que NO hace falta recrear: la política `organizacion_modulo_por_empresa` y el trigger de «sin
-- cambio de empresa» miran `organizacion_id`, no `modulo`; los GRANT/REVOKE son de la tabla y no del
-- tipo; el único `(organizacion_id, modulo)` lo reconstruye el propio ALTER COLUMN … TYPE.
--
-- Lo que NO se toca: el rastro en `historial_accion` (las claves viven como texto en `valor_*`, sin
-- enum) y el `last_error` de `jobs` (`modulo_inactivo:wallet`, texto). Son historia.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

DELETE FROM "organizacion_modulo" WHERE "modulo"::text = 'wallet';

ALTER TYPE "modulo_apagable" RENAME TO "modulo_apagable_viejo";

CREATE TYPE "modulo_apagable" AS ENUM (
  'analitica',
  'monitoreo',
  'ranking'
);

ALTER TABLE "organizacion_modulo"
  ALTER COLUMN "modulo" TYPE "modulo_apagable" USING "modulo"::text::"modulo_apagable";

DROP TYPE "modulo_apagable_viejo";
