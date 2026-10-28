-- SL-20 — revierte 20261026130100_organizacion_pais. Va DESPUÉS del down de
-- 20261026130200_geografia_por_pais: sus políticas `*_del_pais` leen esta columna y el DROP COLUMN
-- fallaría con 2BP01 mientras existan. La FK y el índice caen con la columna.

BEGIN;

DROP TRIGGER "organizacion_pais_inmutable" ON "organizacion";
DROP FUNCTION organizacion_pais_inmutable();
ALTER TABLE "organizacion" DROP COLUMN "pais_id";

COMMIT;
