-- SL-43 — revierte 20261025160000_organizacion_es_demo. Las empresas demo que hubiera quedan como
-- empresas normales: borrarlas es cosa de la demo, no de un rollback de esquema.

ALTER TABLE "organizacion" DROP COLUMN "es_demo";
