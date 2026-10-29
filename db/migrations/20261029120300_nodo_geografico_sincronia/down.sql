-- SLT-43 — revierte 20261029120300_nodo_geografico_sincronia (R34). Va DESPUÉS del down de
-- 20261029120400_columnas_nodo_geografico y ANTES del de 20261029120200_nodo_geografico.
--
-- Solo suelta los triggers y sus funciones: la geografía vieja no se toca y los nodos caen con su
-- tabla en el down siguiente.

BEGIN;

DROP TRIGGER "distrito_sincroniza_nodo_geografico" ON "distrito";
DROP TRIGGER "canton_sincroniza_nodo_geografico" ON "canton";
DROP TRIGGER "provincia_sincroniza_nodo_geografico" ON "provincia";
DROP FUNCTION geo_sincronizar_distrito();
DROP FUNCTION geo_sincronizar_canton();
DROP FUNCTION geo_sincronizar_provincia();

COMMIT;
