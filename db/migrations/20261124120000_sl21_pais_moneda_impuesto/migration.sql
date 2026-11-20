-- SL-21 (design §2.1; R1, R2, R3, R4) — el país guarda su moneda (código ISO 4217, símbolo, los dos
-- separadores y cuántos decimales usa) y el nombre de su impuesto. NO guarda ninguna tasa: la tasa
-- sigue en cada tarifa (SLT-54, SL-39).
--
-- NULL a propósito, como en SLT-42: un país dado de alta por la pantalla de SL-20 no tiene moneda y no
-- se le inventa una. No admite empresas (R17) y lo que necesita su moneda falla con `PaisSinMoneda` (R6).
--
-- La moneda es todo o nada (R2): un formato a medias no se puede pintar. El nombre del impuesto va
-- aparte porque el formato no lo usa. Los decimales van de 0 a 2 porque los importes son
-- DECIMAL(12,2): una moneda de 3 decimales no cabe.
--
-- R3: el UPDATE de Costa Rica escribe SOLO las seis columnas que nacen aquí. Si no existe la fila CR
-- se aborta sin cambiar nada.
--
-- Seguridad (R4): `pais` ya tiene `pais_lectura` y el REVOKE de escritura a `servi_app` (SL-20); las
-- columnas nuevas lo heredan. No hay política nueva.

BEGIN;

DO $sl21$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pais" WHERE "id" = 'CR') THEN
    RAISE EXCEPTION 'SL-21: no existe el país CR; se aborta sin cambiar nada';
  END IF;
END $sl21$;

ALTER TABLE "pais"
  ADD COLUMN "moneda_codigo"            TEXT     NULL,
  ADD COLUMN "moneda_simbolo"           TEXT     NULL,
  ADD COLUMN "moneda_separador_miles"   TEXT     NULL,
  ADD COLUMN "moneda_separador_decimal" TEXT     NULL,
  ADD COLUMN "moneda_decimales"         SMALLINT NULL,
  ADD COLUMN "impuesto_nombre"          TEXT     NULL;

ALTER TABLE "pais"
  ADD CONSTRAINT "pais_moneda_todo_o_nada" CHECK (
    num_nonnulls("moneda_codigo", "moneda_simbolo", "moneda_separador_miles",
                 "moneda_separador_decimal", "moneda_decimales") IN (0, 5)),
  ADD CONSTRAINT "pais_moneda_codigo_formato"        CHECK ("moneda_codigo" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "pais_moneda_simbolo_largo"         CHECK (char_length(btrim("moneda_simbolo")) BETWEEN 1 AND 5),
  ADD CONSTRAINT "pais_moneda_miles_un_caracter"     CHECK (char_length("moneda_separador_miles") = 1),
  ADD CONSTRAINT "pais_moneda_decimal_valido"        CHECK ("moneda_separador_decimal" IN ('.', ',')),
  ADD CONSTRAINT "pais_moneda_separadores_distintos" CHECK ("moneda_separador_miles" <> "moneda_separador_decimal"),
  ADD CONSTRAINT "pais_moneda_decimales_rango"       CHECK ("moneda_decimales" BETWEEN 0 AND 2),
  ADD CONSTRAINT "pais_impuesto_nombre_largo"        CHECK (char_length(btrim("impuesto_nombre")) BETWEEN 1 AND 20);

UPDATE "pais"
   SET "moneda_codigo" = 'CRC',
       "moneda_simbolo" = '₡',
       "moneda_separador_miles" = '.',
       "moneda_separador_decimal" = ',',
       "moneda_decimales" = 2,
       "impuesto_nombre" = 'IVA'
 WHERE "id" = 'CR';

COMMIT;
