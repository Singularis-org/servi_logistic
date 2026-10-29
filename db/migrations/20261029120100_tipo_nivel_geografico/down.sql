-- SLT-43 — revierte 20261029120100_tipo_nivel_geografico (R34). Va DESPUÉS del down de
-- 20261029120200_nodo_geografico: la FK compuesta de los nodos hacia esta tabla impediría el DROP.
--
-- Primero el trigger de `pais`, para que nada vuelva a escribir en la tabla mientras se suelta. Los
-- índices, la FK, la RLS y la política caen con la tabla. Los tipos son una copia de `pais.nivel_N_*`:
-- reaplicar la ida los vuelve a crear iguales (con ids nuevos).

BEGIN;

DROP TRIGGER "pais_tipos_de_nivel" ON "pais";
DROP FUNCTION pais_tipos_de_nivel();
DROP TABLE "tipo_nivel_geografico";

COMMIT;
