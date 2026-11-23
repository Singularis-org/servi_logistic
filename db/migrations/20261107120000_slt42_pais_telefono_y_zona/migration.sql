-- SLT-42 (design §2.1; R1, R3, R8) — el país guarda su prefijo telefónico, el largo de su número
-- nacional y su zona horaria.
--
-- NULL a propósito: los países dados de alta por la pantalla de SL-20 no tienen estos datos y
-- rellenarlos con valores inventados sería peor. Un país incompleto no admite altas de empresa (R6,
-- P7) y lo que necesita la zona falla con `PaisSinZonaHoraria` (R28). Los escribe el superadmin
-- (SLT-81); aquí solo se siembra Costa Rica.
--
-- La zona NO lleva CHECK: Postgres y Node no traen la misma versión de tzdata, y una zona válida
-- para uno podría no serlo para el otro. Se valida en el servidor al escribirla.
--
-- R8: el UPDATE de Costa Rica escribe SOLO las tres columnas que nacen aquí; ninguna columna que
-- existía cambia de valor (P1).
--
-- Seguridad: `pais` ya tiene `pais_lectura` y el REVOKE de escritura a `servi_app` (SL-20); las
-- columnas nuevas lo heredan (R4). No hay política nueva.

BEGIN;

ALTER TABLE "pais"
  ADD COLUMN "prefijo_telefonico"          TEXT     NULL,
  ADD COLUMN "telefono_digitos_nacionales" SMALLINT NULL,
  ADD COLUMN "zona_horaria"                TEXT     NULL;

ALTER TABLE "pais"
  ADD CONSTRAINT "pais_prefijo_telefonico_formato" CHECK ("prefijo_telefonico" ~ '^[1-9][0-9]{0,2}$'),
  ADD CONSTRAINT "pais_telefono_digitos_rango"     CHECK ("telefono_digitos_nacionales" BETWEEN 4 AND 14);

UPDATE "pais"
   SET "prefijo_telefonico" = '506',
       "telefono_digitos_nacionales" = 8,
       "zona_horaria" = 'America/Costa_Rica'
 WHERE "id" = 'CR';

COMMIT;
