-- SL-23 (design §4.1, §9) — los módulos encendidos de cada empresa.
--
-- Una fila = «este módulo está encendido para esta empresa»; sin fila, está apagado (R4). El
-- catálogo es cerrado y vive en el código: el enum solo existe para que la base no acepte una
-- clave que el código no conoce, y el typecheck ata `lib/modulos/catalogo.ts` a este tipo.
--
-- Tabla de NEGOCIO, con las piezas de SL-17 (como `distrito_zona_especial`, SL-38):
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK, su índice y
--     la política `…_por_empresa` con la forma que reconoce la guardia `rls-por-empresa`;
--   · el REVOKE de escritura (R7). Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría
--     CRUD a `servi_app` y una empresa podría encenderse módulos con SQL a mano, porque la RLS la deja
--     escribir sus propias filas. Precedente: `cobro_plataforma_movimiento` (SL-40). Escribe solo el
--     superadmin, que corre como dueño (`comoPlataforma`);
--   · el trigger de «sin cambio de empresa». Sin `verificar_misma_empresa`: su única FK es a
--     `organizacion`.
--
-- FK ON DELETE CASCADE y no el RESTRICT de SL-38: la fila es configuración y no vale nada sin su
-- empresa; la evidencia del cambio vive en `historial_accion`, que sigue siendo RESTRICT.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TYPE "modulo_apagable" AS ENUM (
  'analitica',
  'monitoreo',
  'recoleccion',
  'bodegas_satelite',
  'wallet',
  'ranking',
  'incidentes_novedades',
  'whatsapp',
  'api_integraciones'
);

CREATE TABLE "organizacion_modulo" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "modulo"          "modulo_apagable" NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "organizacion_modulo" ADD CONSTRAINT "organizacion_modulo_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- R4: una fila como mucho por (empresa, módulo). Empieza por la empresa: cubre la consulta de la puerta.
CREATE UNIQUE INDEX "organizacion_modulo_organizacion_id_modulo_key"
  ON "organizacion_modulo" ("organizacion_id", "modulo");
CREATE INDEX "organizacion_modulo_organizacion_id_idx" ON "organizacion_modulo" ("organizacion_id");

-- R7, R25: RLS por empresa, el patrón de M2 de SL-17.
ALTER TABLE "organizacion_modulo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizacion_modulo_por_empresa" ON "organizacion_modulo" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- R7: la empresa lee sus módulos y no los escribe, ni los suyos.
GRANT SELECT ON "organizacion_modulo" TO servi_app;
REVOKE INSERT, UPDATE, DELETE ON "organizacion_modulo" FROM servi_app;

-- Una activación no cambia de empresa (SL017), el patrón de M3 de SL-17.
CREATE TRIGGER "organizacion_modulo_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "organizacion_modulo" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- R5: las empresas que existen al desplegar (incluidas las `es_demo`) quedan con los 9 encendidos.
-- Las que se den de alta después nacen sin ninguno (R6): nada aquí es un DEFAULT ni un trigger de alta.
INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo")
SELECT gen_random_uuid()::text, o."id", m
  FROM "organizacion" o
 CROSS JOIN unnest(enum_range(NULL::"modulo_apagable")) AS m;
