-- DOWN (SLT-221, PR 2) — revierte `migration.sql` de esta carpeta: suelta la tabla del cambio de
-- correo pendiente con su política y sus triggers. Los pendientes no son evidencia: el cambio ya
-- aplicado vive en `historial_accion` (`usuario_email_cambiado`), que no se toca aquí.

BEGIN;

DROP TRIGGER IF EXISTS "usuario_cambio_correo_sin_cambio_de_empresa" ON "usuario_cambio_correo";
DROP TRIGGER IF EXISTS "sme_usuario_cambio_correo_usuario_id_7e410512" ON "usuario_cambio_correo";
DROP TRIGGER IF EXISTS "sme_usuario_cambio_correo_solicitado_por_id_405707f2" ON "usuario_cambio_correo";
DROP POLICY IF EXISTS "usuario_cambio_correo_por_empresa" ON "usuario_cambio_correo";
DROP TABLE IF EXISTS "usuario_cambio_correo";

COMMIT;
