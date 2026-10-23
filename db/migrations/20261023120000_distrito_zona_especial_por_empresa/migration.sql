-- SL-38 M1 (design §2.1) — LA MARCA DE ZONA ESPECIAL ES DE LA EMPRESA.
--
-- Una fila = «este distrito es especial para esta empresa»; sin fila, no lo es (R1). El distrito es
-- de plataforma (solo lectura para la empresa, SL-17 R40): la marca vive aqui, no en `distrito`.
-- Patron de tabla de negocio de SL-17: `organizacion_id` con el DEFAULT de la transaccion (M2), RLS
-- para `servi_app` (M2) y el trigger que impide cambiar de empresa (M3). Sin `verificar_misma_empresa`:
-- las dos FK apuntan a plataforma (`distrito`) y a `organizacion`.
-- La columna global `distrito.zona_especial` se retira en M2 (20261023120100), aparte.

CREATE TABLE "distrito_zona_especial" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "distrito_id"     TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')
);

ALTER TABLE "distrito_zona_especial" ADD CONSTRAINT "distrito_zona_especial_distrito_id_fkey"
  FOREIGN KEY ("distrito_id") REFERENCES "distrito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distrito_zona_especial" ADD CONSTRAINT "distrito_zona_especial_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R1: una marca por (empresa, distrito). Empieza por organizacion_id, como los unicos de SL-17 T3.9.
CREATE UNIQUE INDEX "distrito_zona_especial_organizacion_id_distrito_id_key"
  ON "distrito_zona_especial" ("organizacion_id", "distrito_id");
CREATE INDEX "distrito_zona_especial_organizacion_id_idx" ON "distrito_zona_especial" ("organizacion_id");
CREATE INDEX "distrito_zona_especial_distrito_id_idx" ON "distrito_zona_especial" ("distrito_id");

-- R3: RLS por empresa, el patron de M2 de SL-17.
ALTER TABLE "distrito_zona_especial" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distrito_zona_especial_por_empresa" ON "distrito_zona_especial" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Los privilegios por defecto de M1 de SL-17 ya los dan; se repiten por si la migracion la corre otro rol.
GRANT SELECT, INSERT, UPDATE, DELETE ON "distrito_zona_especial" TO servi_app;

-- R4: una marca no cambia de empresa (SL017), el patron de M3 de SL-17.
CREATE TRIGGER "distrito_zona_especial_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "distrito_zona_especial" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
