-- SLT-63 (R11, D2 = Q1 (a)) — migracion de DATOS: libera las recolecciones que la bodega central ya
-- recibio y siguen a nombre del mensajero que las recolecto.
--
-- Por que: hasta SLT-63 la recepcion central (`en_ruta_bodega_central -> en_bodega_central`) no tocaba
-- la asignacion, y la recoleccion en tienda (157) llega con el recolector puesto. Esas ordenes no salen
-- en «Reasignables» y cuentan en el Monitoreo del recolector. El codigo nuevo libera en la recepcion;
-- esto arregla las que ya estaban asi.
--
-- Criterio: orden viva en `en_bodega_central`, con mensajero, cuya ULTIMA fila de historial es la
-- recepcion central desde `en_ruta_bodega_central`. Si hay una fila posterior (alguien ya la movio o
-- la asigno desde la central), su mensajero es una decision posterior y no se toca. El desempate por
-- `id` hace determinista «la ultima» cuando dos filas comparten `created_at`.
--
-- `order_status` es un catalogo global (`value` unico, sin `organizacion_id`): el subselect devuelve
-- una fila. Corre como dueno, sin RLS: alcanza a todas las empresas, que es lo buscado.
-- No escribe historial: el estado no cambia. Los tres campos van juntos (guardia
-- `fecha-reparto-acompana-asignado-at`); en una recoleccion `asignado_at` y `fecha_reparto` ya son NULL.

UPDATE "orden" o
SET "mensajero_asignado_id" = NULL,
    "asignado_at" = NULL,
    "fecha_reparto" = NULL,
    "updated_at" = NOW()
WHERE o."deleted_at" IS NULL
  AND o."mensajero_asignado_id" IS NOT NULL
  AND o."estatus_id" = (SELECT s."id" FROM "order_status" s WHERE s."value" = 'en_bodega_central')
  AND EXISTS (
    SELECT 1
    FROM "orden_historial_estado" h
    JOIN "order_status" so ON so."id" = h."estatus_origen_id"
    WHERE h."orden_id" = o."id"
      AND h."origen_tipo" = 'recepcion_bodega_central'
      AND so."value" = 'en_ruta_bodega_central'
      AND NOT EXISTS (
        SELECT 1
        FROM "orden_historial_estado" h2
        WHERE h2."orden_id" = o."id"
          AND (h2."created_at", h2."id") > (h."created_at", h."id")
      )
  );
