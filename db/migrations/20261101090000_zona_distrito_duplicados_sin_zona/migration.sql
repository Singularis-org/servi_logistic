-- SLT-75 (T1, design §3.1, R9/R9b/R10/R11/R13) — limpia los distritos que estan en DOS O MAS zonas
-- de la MISMA empresa, para que el indice unico de 20261101090100 se pueda crear.
--
-- POR QUE. Hasta esta ficha nada impedia `(empresa, distrito)` en dos zonas. El arbol lo colapsa a
-- «sin zona», la edicion lo desmarca en las dos y el siguiente guardado lo pierde en silencio. La
-- migracion siguiente (20261101090100) pone el indice unico que impide que vuelva a pasar.
--
-- QUE SE BORRA (decision de Carlos, 2026-11-01, que sustituye a la del 2026-10-31). T0 midio en
-- produccion 17 distritos repetidos, todos en la zona central y en UNA zona no central:
--   * R9: distrito en EXACTAMENTE 2 zonas de la empresa, UNA con `es_central = true` y la otra no
--     → sale SOLO la fila de la zona central; la de la no central se conserva.
--   * R9b: cualquier otra combinacion (dos no centrales, tres o mas zonas) → salen TODAS sus filas
--     y el distrito queda sin zona hasta que el maestro lo asigne desde la pantalla.
-- En la ventana: `n` = filas del (empresa, distrito); `centrales` = cuantas de ellas son de una
-- zona central. Se borra toda fila de un grupo con n > 1, MENOS la no central del caso R9.
--
-- La PARTITION va por (organizacion_id, distrito_id): el mismo distrito en zonas de empresas
-- distintas es legitimo y NO se toca. Las demas filas tampoco.
--
-- R10. RESPALDO FUERA DE `public`, en el esquema `respaldo`, con SOLO las filas borradas (el
-- DELETE borra exactamente lo respaldado):
--   * `public` tiene `ALTER DEFAULT PRIVILEGES ... GRANT ... TO servi_app` (20261022130000): una
--     tabla aqui naceria legible y escribible por la app, y sin RLS (de cualquier empresa);
--   * Prisma solo compara `public`: en `respaldo` el siguiente `migrate dev --create-only` no
--     propone un DROP TABLE.
--   Columnas CON NOMBRE (no `zd.*`): en `dev`, SLT-43 anade columnas a `zona_distrito` y el
--   respaldo debe tener la misma forma en las dos ramas.
--
-- R11. NINGUNA otra tabla de negocio: los envios ya creados conservan su zona (decision de
-- Carlos). Solo se borra de `zona_distrito`; `zona` solo se LEE (su `es_central`).
--
-- R13. Sin duplicados, el respaldo queda vacio y el DELETE no borra nada.

CREATE SCHEMA IF NOT EXISTS respaldo;
REVOKE ALL ON SCHEMA respaldo FROM PUBLIC;

CREATE TABLE respaldo.slt75_zona_distrito_duplicado AS
SELECT g.id, g.zona_id, g.distrito_id, g.organizacion_id, now() AS respaldado_at
FROM (
  SELECT zd.id, zd.zona_id, zd.distrito_id, zd.organizacion_id, z.es_central,
         count(*) OVER w AS n,
         count(*) FILTER (WHERE z.es_central) OVER w AS centrales
  FROM zona_distrito zd
  JOIN zona z ON z.id = zd.zona_id
  WINDOW w AS (PARTITION BY zd.organizacion_id, zd.distrito_id)
) g
WHERE g.n > 1
  AND NOT (g.n = 2 AND g.centrales = 1 AND NOT g.es_central);

REVOKE ALL ON respaldo.slt75_zona_distrito_duplicado FROM PUBLIC;

DELETE FROM zona_distrito zd
USING respaldo.slt75_zona_distrito_duplicado r
WHERE zd.id = r.id;
