-- SLT-54 (T1.1, design §2.1 y §2.3, R7, R8, R11, R12) — la activacion del modelo nuevo de tarifas.
--
-- Una fila = empresa activada; sin fila, no. Desde aqui decide la activacion, no que exista un valor:
-- asi el maestro puede digitar sin mover un centavo hasta pulsar «Activar tarifas nuevas».
--
-- Tabla de NEGOCIO, con las piezas de SL-17:
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transaccion, su FK RESTRICT y la
--     politica `…_por_empresa` con la forma que reconoce la guardia `rls-por-empresa` (R12);
--   · el unico por empresa: resuelve dos activaciones a la vez (R7) y deja el interruptor en un indice;
--   · el REVOKE de UPDATE y DELETE: volver atras moveria dinero sin rastro, y la base lo impide (R8);
--   · los triggers de misma empresa (`activada_por`) y de «sin cambio de empresa».
--
-- `activada_por` NULL = activada por esta migracion, que no tiene actor. SET NULL y no RESTRICT: la
-- evidencia de quien fue vive con su nombre congelado en `historial_accion`, y una activacion no debe
-- impedir dar de baja a un usuario. Lo aplica la FK como dueño, asi que el REVOKE no la estorba.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "tarifa_activacion" (
  "id"              TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "activada_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activada_por"    TEXT,

  CONSTRAINT "tarifa_activacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tarifa_activacion_organizacion_id_key" ON "tarifa_activacion"("organizacion_id");
CREATE INDEX "tarifa_activacion_organizacion_id_idx" ON "tarifa_activacion"("organizacion_id");
CREATE INDEX "tarifa_activacion_activada_por_idx" ON "tarifa_activacion"("activada_por");

ALTER TABLE "tarifa_activacion" ADD CONSTRAINT "tarifa_activacion_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarifa_activacion" ADD CONSTRAINT "tarifa_activacion_activada_por_fkey"
  FOREIGN KEY ("activada_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tarifa_activacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifa_activacion_por_empresa" ON "tarifa_activacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- El ALTER DEFAULT PRIVILEGES de 20261022130000 le daria CRUD a `servi_app`: se fija explicito para no
-- depender de quien ejecute la migracion.
GRANT SELECT, INSERT ON "tarifa_activacion" TO servi_app;
REVOKE UPDATE, DELETE ON "tarifa_activacion" FROM servi_app;

-- TarifaActivacion.activadaPorUsuario (`tsx scripts/generar-misma-empresa.ts --faltantes`)
CREATE TRIGGER "sme_tarifa_activacion_activada_por_25e0b726" BEFORE INSERT OR UPDATE OF "activada_por", "organizacion_id"
  ON "tarifa_activacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'activada_por', 'id');

CREATE TRIGGER "tarifa_activacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "tarifa_activacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- R11: quien ya calcula con el modelo nuevo por tener valores queda activada, para que su calculo no
-- cambie al desplegar. Va en este mismo archivo para que el despliegue no deje ventana. Corre como
-- dueño, sin contexto de empresa. Es una regla sobre los datos, no una lista de empresas: vale con lo
-- que haya cuando se aplique. Sin historial: no hay actor (design §2.2).
INSERT INTO "tarifa_activacion" ("id", "organizacion_id", "activada_por")
SELECT gen_random_uuid()::text, e."organizacion_id", NULL
  FROM (SELECT DISTINCT "organizacion_id" FROM "tarifa_valor") e;
