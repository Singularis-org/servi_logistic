-- SLT-43 — revierte 20261029120200_nodo_geografico (R34). Va ANTES del down de
-- 20261029120100_tipo_nivel_geografico.
--
-- T2.1: solo la función de normalización. T2.2 añade, antes de ella, los triggers, sus funciones y la
-- tabla (que la usa en su trigger de invariantes).

BEGIN;

DROP FUNCTION geo_normalizar_nombre(text);

COMMIT;
