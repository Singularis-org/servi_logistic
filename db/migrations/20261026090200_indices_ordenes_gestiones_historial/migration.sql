-- SL-18 M3 — AMPLIACION DE M2 (R24): ORDENES, GESTIONES E HISTORIAL CON LA EMPRESA DELANTE.
--
-- Decision humana (Camilo, 2026-10-26) sobre los tres candidatos que M2 dejo fuera. Medido con
-- `EXPLAIN (ANALYZE, BUFFERS)` como `servi_app`, dos empresas de 20.000 filas intercaladas por
-- fecha: la tabla esta en `progress/impl_SL-18.md > Tanda 5 — ampliacion`.
--
-- 1. `orden`, listado por defecto (`OrdenRepository.list`):
--      WHERE deleted_at IS NULL AND organizacion_id = $1
--      ORDER BY prioridad DESC, created_at DESC, id ASC LIMIT n
--    Ningun indice servia ese orden y el plan era `Seq Scan` + top-N de las dos empresas. El
--    indice copia el `ORDER BY` entero detras de la empresa y es PARCIAL con el mismo predicado
--    de borrado logico que la consulta: asi el recorrido se para en la fila n. No es «empresa +
--    columnas de antes» (design M2): el viejo `orden_created_at_idx` no servia este orden.
--    Solo cubre el sentido por defecto (`created_at DESC`); el resto ordena en memoria como hoy.
--    `orden_created_at_idx` se queda: lo usa la ventana de carga de la cohorte sin empresa
--    delante (`cohorte-carga-indices.int.test.ts`), igual que `orden_prioridad_clave_remision_idx`
--    (orden por remision, 423).
--
--    ⚠️ El `WHERE` no se puede escribir en `db/schema.prisma` (Prisma no declara parciales): el
--    `@@index` va sin el, como `orden_prioridad_clave_remision_idx`, y el predicado vive aqui.
--
-- 2. `gestion_orden`, ventana intradia (`AnaliticaOperativaVivaRepository.contarGestionesVigentes`,
--    126 R25): la empresa la pone la RLS. Con `gestion_orden_created_at_idx` vivo el planificador
--    lo seguia eligiendo y descartaba las gestiones de la otra empresa; el compuesto solo se usa
--    de forma estable sin el viejo. El rango de `created_at` sigue teniendo indice (segunda
--    columna), que es lo que pide la 126 R25.
--
-- 3. `historial_accion`, listado (`HistorialAccionRepository.list`, 362 R40): el `ORDER BY` real
--    es `created_at <dir>, id ASC`. Con `historial_accion_created_at_id_idx` vivo el plan
--    alternaba entre los dos; se borra.
--
-- LOS VIEJOS QUE SE BORRAN no tienen lectores sin empresa: los jobs corren con `conEmpresa`
-- (`app/api/cron/procesar-jobs/route.ts`), el SQL a mano sin contexto lo rechaza la extension, y
-- ni `comoPlataforma` ni los scripts operativos leen estas tablas por fecha.

BEGIN;

CREATE INDEX "orden_organizacion_id_prioridad_created_at_id_idx"
  ON "orden" ("organizacion_id", "prioridad" DESC, "created_at" DESC, "id")
  WHERE "deleted_at" IS NULL;

DROP INDEX "gestion_orden_created_at_idx";
CREATE INDEX "gestion_orden_organizacion_id_created_at_idx"
  ON "gestion_orden" ("organizacion_id", "created_at");

DROP INDEX "historial_accion_created_at_id_idx";
CREATE INDEX "historial_accion_organizacion_id_created_at_id_idx"
  ON "historial_accion" ("organizacion_id", "created_at" DESC, "id");

COMMIT;
