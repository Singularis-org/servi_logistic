-- SLT-98 — revierte 20261112120000_bug_report_image.
-- PÉRDIDA DE DATO DECLARADA: se pierde qué imágenes tenía cada reporte y el conteo diario de permisos de
-- subida de cada usuario (design §16.2). Los archivos del bucket quedan sin fila (lo esperado de un down,
-- design §2.3). Los CHECK, los índices, las FK, la RLS y los privilegios se van con las tablas; no se creó
-- ningún tipo.

DROP TABLE IF EXISTS "bug_report_upload_quota";
DROP TABLE IF EXISTS "bug_report_image";
