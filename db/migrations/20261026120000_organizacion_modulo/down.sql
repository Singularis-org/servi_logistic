-- SL-23 — revierte 20261026120000_organizacion_modulo. Va después del down de
-- 20261026120100 (el historial que nombra esta tabla como entidad).
-- Las activaciones se pierden: sin la tabla, ninguna empresa tiene módulos que apagar, que es el
-- comportamiento de antes de la feature. La política, los índices y la FK se van con la tabla.

DROP TRIGGER IF EXISTS "organizacion_modulo_sin_cambio_de_empresa" ON "organizacion_modulo";
DROP POLICY IF EXISTS "organizacion_modulo_por_empresa" ON "organizacion_modulo";
DROP TABLE IF EXISTS "organizacion_modulo";
DROP TYPE IF EXISTS "modulo_apagable";
