-- DOWN (SLT-225) — revierte 20261123120100: los dos triggers, sus funciones y la columna `activa`.
-- Las zonas desactivadas vuelven a ser zonas sin marca (activas a todos los efectos). Va ANTES del down
-- de 20261123120000 (los downs van en orden inverso).

BEGIN;

DROP TRIGGER IF EXISTS "usuario_zona_exige_activa" ON "usuario";
DROP FUNCTION IF EXISTS usuario_zona_exige_activa();
DROP TRIGGER IF EXISTS "zona_distrito_exige_zona_activa" ON "zona_distrito";
DROP FUNCTION IF EXISTS zona_distrito_exige_zona_activa();
ALTER TABLE "zona" DROP COLUMN IF EXISTS "activa";

COMMIT;
