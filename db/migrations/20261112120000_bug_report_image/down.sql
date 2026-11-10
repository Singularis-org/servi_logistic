-- SLT-98 — revierte 20261112120000_bug_report_image.
-- PÉRDIDA DE DATO DECLARADA: se pierde qué imágenes tenía cada reporte. Los archivos del bucket quedan sin
-- fila (lo esperado de un down, design §2.3). Los CHECK, los índices, la FK, la RLS y los privilegios se
-- van con la tabla; no se creó ningún tipo.

DROP TABLE IF EXISTS "bug_report_image";
