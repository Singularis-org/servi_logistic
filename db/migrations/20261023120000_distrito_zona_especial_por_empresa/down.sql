-- DOWN de SL-38 M1 (design §2.1, R5) — deja el esquema como estaba antes de la tabla de marcas.
-- Los indices y las FK caen con la tabla. Las marcas se pierden: son de esta migracion y no
-- existian antes. Si M2 (20261023120100) esta aplicada, su down va primero.

DROP TRIGGER IF EXISTS "distrito_zona_especial_sin_cambio_de_empresa" ON "distrito_zona_especial";
DROP POLICY IF EXISTS "distrito_zona_especial_por_empresa" ON "distrito_zona_especial";
DROP TABLE IF EXISTS "distrito_zona_especial";
