-- SL-20 (design §2.1, §3; R1, R2, R3) — la tabla de países, de PLATAFORMA.
--
-- La clave es el código ISO 3166-1 alfa-2 y no un uuid: el `DEFAULT 'CR'` de `organizacion.pais_id`
-- y de `provincia.pais_id` (migraciones siguientes) necesita un id conocido de antemano, y SLT-42 usará
-- esta misma clave para teléfono y documento (design §10, alternativa 2). Los tests usan `XA`–`XZ`,
-- el rango que ISO reserva al usuario: nunca chocan con un país real.
--
-- La regla de código oficial (R17) son las tres columnas `digitos_codigo_nivel_n`: o las tres o
-- ninguna. Solo Costa Rica la tiene y solo la pone esta migración; el alta por pantalla no la ofrece.
--
-- Una empresa la lee (el nombre de sus niveles) y no la escribe (R3): la tabla nace con CRUD para
-- `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000_organizacion_y_rol_app), así que hace
-- falta el REVOKE, igual que la geografía en SL-17.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "pais" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nivel_1_singular" TEXT NOT NULL,
    "nivel_1_plural" TEXT NOT NULL,
    "nivel_2_singular" TEXT NOT NULL,
    "nivel_2_plural" TEXT NOT NULL,
    "nivel_3_singular" TEXT NOT NULL,
    "nivel_3_plural" TEXT NOT NULL,
    "digitos_codigo_nivel_1" INTEGER,
    "digitos_codigo_nivel_2" INTEGER,
    "digitos_codigo_nivel_3" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pais_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pais_id_check" CHECK ("id" ~ '^[A-Z]{2}$'),
    -- Una regla a medias no se puede aplicar: el prefijo del hijo necesita la longitud del padre.
    CONSTRAINT "pais_digitos_codigo_check" CHECK (
      ("digitos_codigo_nivel_1" IS NULL AND "digitos_codigo_nivel_2" IS NULL AND "digitos_codigo_nivel_3" IS NULL)
      OR ("digitos_codigo_nivel_1" IS NOT NULL AND "digitos_codigo_nivel_2" IS NOT NULL AND "digitos_codigo_nivel_3" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "pais_nombre_key" ON "pais"("nombre");

-- R2: el único país cargado al cerrar SL-20. La geografía existente se cuelga de él en la siguiente.
INSERT INTO "pais" (
  "id", "nombre",
  "nivel_1_singular", "nivel_1_plural", "nivel_2_singular", "nivel_2_plural", "nivel_3_singular", "nivel_3_plural",
  "digitos_codigo_nivel_1", "digitos_codigo_nivel_2", "digitos_codigo_nivel_3"
) VALUES (
  'CR', 'Costa Rica',
  'Provincia', 'Provincias', 'Cantón', 'Cantones', 'Distrito', 'Distritos',
  1, 3, 5
);

ALTER TABLE "pais" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pais_lectura" ON "pais" FOR SELECT TO servi_app USING (true);
REVOKE INSERT, UPDATE, DELETE ON "pais" FROM servi_app;
