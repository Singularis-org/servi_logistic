-- SL-43 (design §2.2, opción 3; R3, D21) — la marca de entorno que vive en la propia base.
--
-- La demo de QA borra y recrea datos. Antes de escribir nada comprueba que la base es la de QA leyendo
-- esta marca: así un `DIRECT_URL` de producción puesto por error en Preview no pasa, aunque las
-- variables digan que sí (Preview y Production llegaron a compartir base).
--
-- Por qué una tabla y no un parámetro: en el Supabase de QA, `ALTER DATABASE postgres SET
-- servi.entorno = 'qa'` y `ALTER ROLE postgres SET …` dan `42501 permission denied to set parameter`
-- (probado el 2026-10-25). Las opciones 1 y 2 del design no se pueden usar.
--
-- Nace VACÍA en todos los entornos. La fila `('entorno', 'qa')` la inserta una persona, a mano y solo
-- en la base de QA. Una base sin la fila (producción, cualquier otra) hace que la demo aborte.
--
-- Es de PLATAFORMA: sin `organizacion_id`. Una empresa no la lee ni la escribe:
--   · la tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de
--     20261022130000_organizacion_y_rol_app), así que hace falta el REVOKE;
--   · la RLS sin ninguna política es la segunda red.
-- La lee solo la demo, como dueño.

CREATE TABLE "entorno_marca" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "entorno_marca_pkey" PRIMARY KEY ("clave")
);

ALTER TABLE "entorno_marca" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "entorno_marca" FROM servi_app;

COMMENT ON TABLE "entorno_marca" IS
  'SL-43: marca de entorno de la base. La fila (entorno, qa) la pone una persona solo en QA; la demo (scripts/demo-qa.ts) no escribe sin ella.';
