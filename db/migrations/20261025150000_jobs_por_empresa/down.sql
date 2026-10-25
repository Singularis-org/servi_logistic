-- DOWN de SL-19 (design §2.1, R11) — devuelve `jobs` a la politica abierta de SL-17 M1
-- (`20261022130000_organizacion_y_rol_app`), tal cual estaba.

BEGIN;

DROP POLICY "jobs_por_empresa" ON "jobs";
CREATE POLICY "jobs_abierta" ON "jobs" FOR ALL TO servi_app USING (true) WITH CHECK (true);

COMMIT;
