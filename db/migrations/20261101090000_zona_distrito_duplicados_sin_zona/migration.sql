-- SLT-75 (T1, design §3.1, R9/R10/R11/R13) — un distrito en DOS O MAS zonas de la MISMA empresa
-- queda SIN zona en esa empresa.
--
-- POR QUE. Hasta esta ficha nada impedia `(empresa, distrito)` en dos zonas. El arbol lo colapsa a
-- «sin zona», la edicion lo desmarca en las dos y el siguiente guardado lo pierde en silencio.
-- Decision de Carlos (2026-10-31): el distrito duplicado se quita de TODAS sus zonas y queda sin
-- zona hasta que el maestro lo asigne desde la pantalla. La migracion siguiente
-- (20261101090100) pone el indice unico que impide que vuelva a pasar.
--
-- R9. El GROUP BY va por (organizacion_id, distrito_id): el mismo distrito en zonas de empresas
-- distintas es legitimo y NO se toca. Las demas filas tampoco.
--
-- R10. RESPALDO FUERA DE `public`, en el esquema `respaldo`:
--   * `public` tiene `ALTER DEFAULT PRIVILEGES ... GRANT ... TO servi_app` (20261022130000): una
--     tabla aqui naceria legible y escribible por la app, y sin RLS (de cualquier empresa);
--   * Prisma solo compara `public`: en `respaldo` el siguiente `migrate dev --create-only` no
--     propone un DROP TABLE.
--   Columnas CON NOMBRE (no `zd.*`): en `dev`, SLT-43 anade columnas a `zona_distrito` y el
--   respaldo debe tener la misma forma en las dos ramas.
--
-- R11. NINGUNA otra tabla de negocio: los envios ya creados conservan su zona (decision de
-- Carlos). Solo se borra de `zona_distrito`.
--
-- R13. Sin duplicados, el respaldo queda vacio y el DELETE no borra nada.

CREATE SCHEMA IF NOT EXISTS respaldo;
REVOKE ALL ON SCHEMA respaldo FROM PUBLIC;

CREATE TABLE respaldo.slt75_zona_distrito_duplicado AS
SELECT zd.id, zd.zona_id, zd.distrito_id, zd.organizacion_id, now() AS respaldado_at
FROM zona_distrito zd
WHERE (zd.organizacion_id, zd.distrito_id) IN (
  SELECT organizacion_id, distrito_id
  FROM zona_distrito
  GROUP BY 1, 2
  HAVING count(*) > 1
);

REVOKE ALL ON respaldo.slt75_zona_distrito_duplicado FROM PUBLIC;

DELETE FROM zona_distrito zd
USING respaldo.slt75_zona_distrito_duplicado r
WHERE zd.id = r.id;
