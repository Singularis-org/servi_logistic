-- DOWN de SL-36 T1.1 (design §2.5) — deja el esquema como estaba antes de las integraciones.
-- Los indices, los CHECK y las FK caen con cada tabla; los tipos van despues porque las columnas
-- los usan. Las integraciones guardadas se pierden: son de esta migracion y no existian antes.
-- Si `20261025120100_historial_accion_integraciones` esta aplicada, su down va primero.

DROP TRIGGER IF EXISTS "integracion_prueba_minuto_sin_cambio_de_empresa" ON "integracion_prueba_minuto";
DROP POLICY IF EXISTS "integracion_prueba_minuto_por_empresa" ON "integracion_prueba_minuto";
DROP TABLE IF EXISTS "integracion_prueba_minuto";

DROP TRIGGER IF EXISTS "integracion_sin_cambio_de_empresa" ON "integracion";
DROP POLICY IF EXISTS "integracion_por_empresa" ON "integracion";
DROP TABLE IF EXISTS "integracion";

DROP TYPE IF EXISTS "estado_integracion";
DROP TYPE IF EXISTS "servicio_integracion";
