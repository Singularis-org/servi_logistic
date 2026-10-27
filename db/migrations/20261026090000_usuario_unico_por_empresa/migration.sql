-- SL-18 M1 — EL EMAIL Y LA CEDULA DE `usuario` PASAN A SER UNICOS POR EMPRESA (R1-R4, R25).
--
-- Una persona puede trabajar en dos empresas con el mismo email y la misma cedula: son dos cuentas,
-- una por empresa (R1). Dentro de una empresa siguen sin repetirse (R2).
--
-- POR QUE SE CONSERVA CADA NOMBRE: los repositorios reconocen el P2002 por el nombre del indice
-- (`textoConstraintP2002`: bajo el driver adapter es lo unico que llega) y buscan «email» o
-- «cedula» en el. Con otro nombre, un duplicado volveria a salir como 500. `organizacion_id` va
-- PRIMERA, como en SL-17 T3.9.
--
-- NULLS NOT DISTINCT (R3, P1): la cuenta de plataforma (sin empresa) puede compartir email y
-- cedula con una cuenta de empresa, pero dos cuentas SIN empresa con el mismo email chocan.
--
-- `usuario_email_idx` (R25): el login y la recuperacion buscan por email SIN empresa; el compuesto,
-- con `organizacion_id` delante, no sirve de prefijo para esa busqueda.
--
-- Sin backfill: subir de global a compuesto nunca encuentra duplicados.

BEGIN;

DROP INDEX "usuario_email_key";
CREATE UNIQUE INDEX "usuario_email_key"
  ON "usuario" ("organizacion_id", "email") NULLS NOT DISTINCT;

DROP INDEX "usuario_cedula_key";
CREATE UNIQUE INDEX "usuario_cedula_key"
  ON "usuario" ("organizacion_id", "cedula") NULLS NOT DISTINCT;

CREATE INDEX "usuario_email_idx" ON "usuario" ("email");

COMMIT;
