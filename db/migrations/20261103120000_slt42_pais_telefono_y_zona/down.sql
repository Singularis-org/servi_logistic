-- DOWN (SLT-42, design §2.4) — revierte 20261103120000_slt42_pais_telefono_y_zona.
--
-- Solo borra lo que creó la subida: los dos CHECK y las tres columnas. Ninguna fila de `pais` se
-- pierde y sus columnas de antes no cambiaron nunca. Va DESPUÉS del down de
-- 20261103120100_slt42_tipo_documento_por_pais (orden inverso).

BEGIN;

ALTER TABLE "pais"
  DROP CONSTRAINT "pais_prefijo_telefonico_formato",
  DROP CONSTRAINT "pais_telefono_digitos_rango";

ALTER TABLE "pais"
  DROP COLUMN "prefijo_telefonico",
  DROP COLUMN "telefono_digitos_nacionales",
  DROP COLUMN "zona_horaria";

COMMIT;
