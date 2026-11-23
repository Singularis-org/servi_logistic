-- SLT-221 (design §2.2, PR 2) — el cambio de correo pendiente de confirmar.
--
-- `usuario_cambio_correo`: el maestro pide el correo nuevo y la persona lo confirma con un enlace de
-- un solo uso. Hasta el canje `usuario.email` no cambia (R1615). Solo el hash del secreto (R1632).
--
-- Patrón de tabla de negocio de SL-17 (molde `20261031140100_slt73_ajuste_conciliacion`):
-- `organizacion_id` con el DEFAULT de la transacción, FK RESTRICT, índice, RLS para `servi_app`, el
-- trigger que impide cambiar de empresa y uno de misma empresa por FK (generados con
-- `tsx scripts/generar-misma-empresa.ts --faltantes`).

CREATE TABLE "usuario_cambio_correo" (
  "id"                TEXT NOT NULL,
  "organizacion_id"   TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "usuario_id"        TEXT NOT NULL,
  "email_nuevo"       VARCHAR(254) NOT NULL,
  "secreto_hash"      TEXT NOT NULL,
  "solicitado_por_id" TEXT NOT NULL,
  "expira_at"         TIMESTAMP(3) NOT NULL,
  "confirmado_at"     TIMESTAMP(3),
  "anulado_at"        TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usuario_cambio_correo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usuario_cambio_correo_cierre_check" CHECK ("confirmado_at" IS NULL OR "anulado_at" IS NULL)
);

-- R1616: un solo pendiente abierto por usuario. Uno vencido sigue abierto hasta que se reemplaza o se
-- cancela (así se muestra «Vencido» con «Reenviar», R1618). Empieza por `organizacion_id` (SL-18 R22): el
-- usuario ya es de una empresa, así que es el mismo único que sobre `usuario_id` solo.
CREATE UNIQUE INDEX "usuario_cambio_correo_abierto" ON "usuario_cambio_correo"("organizacion_id", "usuario_id")
  WHERE "confirmado_at" IS NULL AND "anulado_at" IS NULL;
CREATE INDEX "usuario_cambio_correo_usuario_id_idx" ON "usuario_cambio_correo"("usuario_id");
CREATE INDEX "usuario_cambio_correo_solicitado_por_id_idx" ON "usuario_cambio_correo"("solicitado_por_id");
CREATE INDEX "usuario_cambio_correo_organizacion_id_idx" ON "usuario_cambio_correo"("organizacion_id");

ALTER TABLE "usuario_cambio_correo" ADD CONSTRAINT "usuario_cambio_correo_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usuario_cambio_correo" ADD CONSTRAINT "usuario_cambio_correo_solicitado_por_id_fkey"
  FOREIGN KEY ("solicitado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usuario_cambio_correo" ADD CONSTRAINT "usuario_cambio_correo_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "usuario_cambio_correo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario_cambio_correo_por_empresa" ON "usuario_cambio_correo" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Sin DELETE: los pendientes se anulan, no se borran (design §2.2). El CASCADE del usuario lo hace el
-- dueño de la FK, no `servi_app`.
REVOKE DELETE ON "usuario_cambio_correo" FROM servi_app;
GRANT SELECT, INSERT, UPDATE ON "usuario_cambio_correo" TO servi_app;

-- UsuarioCambioCorreo.solicitadoPor
CREATE TRIGGER "sme_usuario_cambio_correo_solicitado_por_id_405707f2" BEFORE INSERT OR UPDATE OF "solicitado_por_id", "organizacion_id"
  ON "usuario_cambio_correo" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'solicitado_por_id', 'id');
-- UsuarioCambioCorreo.usuario
CREATE TRIGGER "sme_usuario_cambio_correo_usuario_id_7e410512" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "usuario_cambio_correo" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');

CREATE TRIGGER "usuario_cambio_correo_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "usuario_cambio_correo" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
