-- DOWN (SL-21, design §2.1; R3) — revierte 20261122120000_sl21_pais_moneda_impuesto.
--
-- Solo borra lo que creó la subida: los ocho CHECK y las seis columnas. Ninguna fila de `pais` se
-- pierde y sus columnas de antes no cambiaron nunca.

BEGIN;

ALTER TABLE "pais"
  DROP CONSTRAINT "pais_moneda_todo_o_nada",
  DROP CONSTRAINT "pais_moneda_codigo_formato",
  DROP CONSTRAINT "pais_moneda_simbolo_largo",
  DROP CONSTRAINT "pais_moneda_miles_un_caracter",
  DROP CONSTRAINT "pais_moneda_decimal_valido",
  DROP CONSTRAINT "pais_moneda_separadores_distintos",
  DROP CONSTRAINT "pais_moneda_decimales_rango",
  DROP CONSTRAINT "pais_impuesto_nombre_largo";

ALTER TABLE "pais"
  DROP COLUMN "moneda_codigo",
  DROP COLUMN "moneda_simbolo",
  DROP COLUMN "moneda_separador_miles",
  DROP COLUMN "moneda_separador_decimal",
  DROP COLUMN "moneda_decimales",
  DROP COLUMN "impuesto_nombre";

COMMIT;
