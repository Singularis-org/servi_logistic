-- SLT-43 (design §2.4, §3) — los índices de `nodo_geografico_id` en las tres tablas de negocio: los usan
-- la FK (un DELETE o UPDATE del nodo busca sus filas) y las lecturas por nodo de SLT-44.
--
-- Aparte de 20261029120400 a propósito: el de `orden` es el único bloqueo de escritura largo de SLT-43
-- (CREATE INDEX toma SHARE sobre la tabla mientras la recorre) y así se mide solo en el ensayo sobre la
-- copia de producción (design §6). Sin CONCURRENTLY: Prisma corre cada migración en una transacción.
-- Nombres por defecto de Prisma (`<tabla>_<columna>_idx`), para que el diff salga vacío.
--
-- Solo aditiva (R19). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE INDEX "orden_nodo_geografico_id_idx" ON "orden"("nodo_geografico_id");
CREATE INDEX "zona_distrito_nodo_geografico_id_idx" ON "zona_distrito"("nodo_geografico_id");
CREATE INDEX "distrito_zona_especial_nodo_geografico_id_idx" ON "distrito_zona_especial"("nodo_geografico_id");

COMMIT;
