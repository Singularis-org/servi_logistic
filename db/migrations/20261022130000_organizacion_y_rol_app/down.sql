-- DOWN (SL-17 M1) — revierte `migration.sql`. Requiere haber revertido antes M2 (las FK de negocio
-- apuntan a `organizacion`).
--
-- PRECONDICION RUIDOSA: si hay empresas dadas de alta se ABORTA sin borrar nada. Borrar una empresa
-- no es tarea de un rollback.

BEGIN;

DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) FROM "organizacion" INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SL-17 M1: hay % empresas en organizacion; se aborta sin borrar nada', v_n;
  END IF;
END
$$;

-- ── Politicas de plataforma ───────────────────────────────────────────────────────────────────
DROP POLICY "organizacion_propia" ON "organizacion";
DROP POLICY "jobs_abierta" ON "jobs";
DROP POLICY "geocode_cache_abierta" ON "geocode_cache";
DROP POLICY "login_attempt_dueno_visible" ON "login_attempt";
DROP POLICY "email_otp_challenge_dueno_visible" ON "email_otp_challenge";
DROP POLICY "trusted_device_dueno_visible" ON "trusted_device";
DROP POLICY "Session_dueno_visible" ON "Session";
DROP POLICY "vehiculos_lectura" ON "vehiculos";
DROP POLICY "distrito_lectura" ON "distrito";
DROP POLICY "canton_lectura" ON "canton";
DROP POLICY "provincia_lectura" ON "provincia";
DROP POLICY "order_status_lectura" ON "order_status";
DROP POLICY "rol_permiso_lectura" ON "rol_permiso";
DROP POLICY "permiso_lectura" ON "permiso";
DROP POLICY "rol_lectura" ON "rol";
DROP POLICY "tipo_identificacion_lectura" ON "tipo_identificacion";

-- ── RLS que activo M1 (solo "Session"; las demas ya la tenian) ────────────────────────────────
ALTER TABLE "Session" DISABLE ROW LEVEL SECURITY;

-- ── Privilegios ───────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM servi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM servi_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM servi_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM servi_app;
REVOKE USAGE ON SCHEMA public FROM servi_app;

-- ── Tabla ─────────────────────────────────────────────────────────────────────────────────────
DROP TABLE "organizacion";

-- ── Rol ───────────────────────────────────────────────────────────────────────────────────────
-- Es del cluster: si otra base de la misma instancia lo usa, se deja (y con el, su pertenencia).
DO $$
BEGIN
  DROP ROLE IF EXISTS servi_app;
EXCEPTION
  WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'servi_app se conserva: otra base del cluster depende de el';
END
$$;

COMMIT;
