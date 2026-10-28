-- SL-43 (design §3.1; R6) — la marca de las empresas que crea la demo de QA.
--
-- La demo borra y recrea sus empresas en cada despliegue de QA. Las encuentra por esta columna y no
-- por el slug: un superadmin puede crear a mano una empresa «demo-qa-a», y la demo no debe borrarla
-- nunca (alternativa 3 del design).
--
-- Nadie la escribe desde una empresa: `organizacion` ya es de solo lectura para `servi_app` (REVOKE de
-- 20261022130000_organizacion_y_rol_app), así que no hace falta otro. Toda empresa nace con `false`
-- (`altaEmpresa` no cambia); solo la demo, como dueño, la pone en `true`.
--
-- Sin índice: hay pocas filas en `organizacion` y la consulta corre una vez por ejecución.

ALTER TABLE "organizacion" ADD COLUMN "es_demo" BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN "organizacion"."es_demo" IS
  'SL-43: la creó la demo de QA (scripts/demo-qa.ts). Solo la pone la demo, como dueño.';
