-- SLT-81 (design §2.1, §2.2; R17) — el rastro de los datos del país en el historial de plataforma.
--
-- No hay tabla ni columna nueva: `pais` y `tipo_identificacion` ya tienen todo desde SLT-42. Solo
-- los valores con los que el superadmin deja rastro de lo que cambia:
--   · `pais_datos_cambiados`: prefijo, dígitos nacionales o zona horaria;
--   · `tipo_documento_creado` / `_editado` / `_activado` / `_desactivado`: el catálogo del país;
--   · `tipo_documento` como entidad del historial.
--
-- Nada aquí escribe filas con ellos: Postgres prohíbe USAR un valor de enum en la misma transacción
-- que lo añade (55P04), y el primer uso es en runtime (mismo criterio que 20261026130500).

BEGIN;

ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'pais_datos_cambiados';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_creado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_editado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_activado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_desactivado';
ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'tipo_documento';

COMMIT;
