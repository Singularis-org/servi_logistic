-- SLT-42 (design §2.3; R13, P4) — el documento de `usuario` pasa a ser único por empresa Y TIPO.
--
-- Un mismo número puede ser cédula de una persona y NITE de otra: dentro de una empresa lo que no se
-- repite es el par (tipo, documento). Entre empresas ya podía repetirse (SL-18).
--
-- EXCEPCIÓN DECLARADA (P4, cerrada el 2026-11-03). El DROP INDEX es la única sentencia destructiva de
-- SLT-42: solo afecta a un índice, no toca datos y el down lo restaura. Se recrea con EL MISMO NOMBRE
-- porque los repositorios reconocen el P2002 por el nombre del índice (bajo el driver adapter es lo
-- único que llega) y con otro nombre un duplicado volvería a salir como 500.
--
-- `organizacion_id` va PRIMERA (guardia `unicos-por-empresa`). NULLS NOT DISTINCT se conserva de
-- SL-18: dos cuentas sin empresa (plataforma) con el mismo tipo y documento siguen chocando.
--
-- Sin backfill: el índice nuevo es más permisivo que el de antes; todo lo guardado ya lo cumple.

BEGIN;

DROP INDEX "usuario_cedula_key";
CREATE UNIQUE INDEX "usuario_cedula_key"
  ON "usuario" ("organizacion_id", "tipo_identificacion_id", "cedula") NULLS NOT DISTINCT;

COMMIT;
