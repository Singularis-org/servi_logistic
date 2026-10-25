-- SL-17 M1 (design §3 M1, §4): la tabla `organizacion` y el rol `servi_app` sin bypass de RLS.
-- A mano (`db:migrate:create` falla con P3006 en este repo). El DDL de la tabla es el que
-- `prisma migrate diff --to-schema` produce para `model Organizacion`; el rol, los grants y las
-- politicas no los expresa Prisma.
--
--   · `organizacion`: la empresa. `slug` obligatorio y unico (D13). NO se inserta ninguna fila (R32).
--   · `servi_app`: NOLOGIN y NOBYPASSRLS. La app baja a el en cada transaccion de empresa con
--     `set_config('role', 'servi_app', true)` (§4); como dueno de las tablas (plataforma) no hay RLS.
--   · Politicas de plataforma (§2.2, §2.3) para `servi_app`. Las de negocio llegan en M2.
--
-- RLS activada aqui: solo "Session" (la unica de plataforma/diferida que no la tenia antes de M1,
-- medido sobre las 228 migraciones previas) y `organizacion` (nueva). El `down.sql` desactiva
-- solo "Session".

BEGIN;

-- ── Tabla ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "organizacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizacion_slug_key" ON "organizacion"("slug");

ALTER TABLE "organizacion" ENABLE ROW LEVEL SECURITY;

-- ── Rol ───────────────────────────────────────────────────────────────────────────────────────
-- Los roles son del cluster: `migrate reset` no los borra y otra base de la misma instancia puede
-- haberlo creado ya. Por eso se crea solo si falta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servi_app') THEN
    CREATE ROLE servi_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Para poder hacer `SET ROLE servi_app` sin ser superusuario (Supabase).
GRANT servi_app TO CURRENT_USER;

-- ── Privilegios ───────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO servi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO servi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO servi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO servi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO servi_app;

-- Catalogos, geografia, `vehiculos` y `organizacion`: solo lectura desde una empresa (R40). El alta
-- de empresas es de plataforma (OrganizacionService, §7.7).
REVOKE INSERT, UPDATE, DELETE ON
  "tipo_identificacion", "rol", "permiso", "rol_permiso", "order_status",
  "provincia", "canton", "distrito", "vehiculos", "organizacion"
FROM servi_app;

-- La tabla de control de Prisma no es de la app: sin RLS, una empresa no debe ni leerla.
REVOKE ALL ON "_prisma_migrations" FROM servi_app;

-- ── RLS de plataforma que faltaba ─────────────────────────────────────────────────────────────
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;

-- ── Politicas de plataforma para `servi_app` ──────────────────────────────────────────────────
-- Catalogos y geografia: legibles por cualquier empresa (R22). La escritura ya esta revocada.
CREATE POLICY "tipo_identificacion_lectura" ON "tipo_identificacion" FOR SELECT TO servi_app USING (true);
CREATE POLICY "rol_lectura" ON "rol" FOR SELECT TO servi_app USING (true);
CREATE POLICY "permiso_lectura" ON "permiso" FOR SELECT TO servi_app USING (true);
CREATE POLICY "rol_permiso_lectura" ON "rol_permiso" FOR SELECT TO servi_app USING (true);
CREATE POLICY "order_status_lectura" ON "order_status" FOR SELECT TO servi_app USING (true);
CREATE POLICY "provincia_lectura" ON "provincia" FOR SELECT TO servi_app USING (true);
CREATE POLICY "canton_lectura" ON "canton" FOR SELECT TO servi_app USING (true);
CREATE POLICY "distrito_lectura" ON "distrito" FOR SELECT TO servi_app USING (true);
CREATE POLICY "vehiculos_lectura" ON "vehiculos" FOR SELECT TO servi_app USING (true);

-- Autenticacion: «el dueno es usuario visible» (R22). `usuario` ya esta filtrado por empresa (M2),
-- asi que solo se ven filas de usuarios de la propia. Un `login_attempt` sin usuario queda invisible.
CREATE POLICY "Session_dueno_visible" ON "Session" FOR ALL TO servi_app
  USING      (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "Session"."userId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "Session"."userId"));
CREATE POLICY "trusted_device_dueno_visible" ON "trusted_device" FOR ALL TO servi_app
  USING      (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "trusted_device"."usuario_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "trusted_device"."usuario_id"));
CREATE POLICY "email_otp_challenge_dueno_visible" ON "email_otp_challenge" FOR ALL TO servi_app
  USING      (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "email_otp_challenge"."usuario_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "email_otp_challenge"."usuario_id"));
CREATE POLICY "login_attempt_dueno_visible" ON "login_attempt" FOR ALL TO servi_app
  USING      (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "login_attempt"."usuario_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "usuario" u WHERE u."id" = "login_attempt"."usuario_id"));

-- Cache tecnica sin dato de empresa, y el outbox (diferido a SL-19): abiertas.
CREATE POLICY "geocode_cache_abierta" ON "geocode_cache" FOR ALL TO servi_app USING (true) WITH CHECK (true);
CREATE POLICY "jobs_abierta" ON "jobs" FOR ALL TO servi_app USING (true) WITH CHECK (true);

-- La empresa solo ve su propia fila (lectura de su nombre desde el contexto de empresa).
CREATE POLICY "organizacion_propia" ON "organizacion" FOR SELECT TO servi_app
  USING ("id" = NULLIF(current_setting('app.organizacion_id', true), ''));

COMMIT;
