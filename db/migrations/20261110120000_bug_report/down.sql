-- SLT-87 — revierte 20261110120000_bug_report.
-- PÉRDIDA DE DATO DECLARADA: los reportes de problema guardados se pierden. Los CHECK, los índices, las
-- FK, la RLS y los privilegios se van con la tabla; no se creó ningún tipo.

DROP TABLE IF EXISTS "bug_report";
