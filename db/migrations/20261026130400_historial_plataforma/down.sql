-- SL-20 — revierte 20261026130400_historial_plataforma. Borra el historial del superadmin con la tabla:
-- es el único sitio donde vive, así que quien revierta en una base con filas las pierde. Sus FK a
-- `pais` y a `usuario` caen con ella; este down va ANTES que el de 20261026130000_pais.

BEGIN;

DROP TABLE "historial_plataforma";
DROP TYPE "historial_plataforma_entidad";
DROP TYPE "historial_plataforma_accion";

COMMIT;
