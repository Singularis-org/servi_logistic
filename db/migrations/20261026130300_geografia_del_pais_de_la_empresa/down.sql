-- SL-20 — revierte 20261026130300_geografia_del_pais_de_la_empresa. Va ANTES del down de
-- 20261026130200_geografia_por_pais, porque la función lee `pais_id` de la geografía.

BEGIN;

DROP TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa" ON "distrito_zona_especial";
DROP TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa" ON "zona_distrito";
DROP TRIGGER "orden_geografia_del_pais_de_la_empresa" ON "orden";
DROP FUNCTION geografia_del_pais_de_la_empresa();

COMMIT;
