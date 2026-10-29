-- SLT-43 — revierte 20261029120400_columnas_nodo_geografico (R34). Va DESPUÉS del down de
-- 20261029120500_indices_nodo_geografico (sus índices caen con las columnas, pero se sueltan antes por
-- orden) y ANTES del de 20261029120300_nodo_geografico_sincronia.
--
-- Pierde lo que escribió el script (`nodo_geografico_id`, `ubicacion_snapshot`): se recupera
-- relanzándolo tras la ida (design §3). Las FK viejas y sus datos no se tocan.

BEGIN;

DROP TRIGGER "distrito_zona_especial_nodo_geografico" ON "distrito_zona_especial";
DROP TRIGGER "zona_distrito_nodo_geografico" ON "zona_distrito";
DROP TRIGGER "orden_nodo_geografico" ON "orden";
DROP FUNCTION zona_nodo_geografico_del_distrito();
DROP FUNCTION orden_nodo_geografico();

ALTER TABLE "distrito_zona_especial" DROP CONSTRAINT "distrito_zona_especial_nodo_geografico_id_fkey";
ALTER TABLE "zona_distrito" DROP CONSTRAINT "zona_distrito_nodo_geografico_id_fkey";
ALTER TABLE "orden" DROP CONSTRAINT "orden_nodo_geografico_id_fkey";

ALTER TABLE "cierre_detail" DROP COLUMN "ubicacion_snapshot";
ALTER TABLE "distrito_zona_especial" DROP COLUMN "nodo_geografico_id";
ALTER TABLE "zona_distrito" DROP COLUMN "nodo_geografico_id";
ALTER TABLE "orden" DROP COLUMN "nodo_geografico_id";

COMMIT;
