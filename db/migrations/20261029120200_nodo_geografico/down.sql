-- SLT-43 — revierte 20261029120200_nodo_geografico (R34). Va DESPUÉS del down de
-- 20261029120300_nodo_geografico_sincronia (sus triggers escriben aquí) y ANTES del de
-- 20261029120100_tipo_nivel_geografico (la FK compuesta hacia los tipos impediría su DROP).
--
-- Los nodos son una copia de la geografía vieja, que no se toca: reaplicar la ida los vuelve a crear
-- con los mismos ids. Los índices, las FK, la RLS y la política caen con la tabla; la función de
-- normalización va al final porque la usa el trigger de invariantes.

BEGIN;

DROP TRIGGER "nodo_geografico_ruta_descendientes" ON "nodo_geografico";
DROP TRIGGER "nodo_geografico_invariantes" ON "nodo_geografico";
DROP FUNCTION nodo_geografico_ruta_descendientes();
DROP FUNCTION nodo_geografico_invariantes();
DROP TABLE "nodo_geografico";
DROP FUNCTION geo_normalizar_nombre(text);

COMMIT;
