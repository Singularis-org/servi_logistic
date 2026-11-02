-- DOWN (SLT-63, R12) — revierte `migration.sql` de esta carpeta: repone `mensajero_asignado_id` desde
-- el actor de la ULTIMA `recoleccion_tienda` de cada orden que siga en `en_bodega_central`, sin
-- mensajero, viva y con la recepcion central desde `en_ruta_bodega_central` como ultima fila.
--
-- Limites, dichos para que no se lean como olvido:
--   - No distingue las que libero la migracion de las que libero el codigo nuevo de SLT-63. Es
--     aceptable: las dos tenian ese mensajero justo antes de la recepcion.
--   - No repone `asignado_at` ni `fecha_reparto`: la recoleccion nunca los estampa (157/R38), asi que
--     antes de la migracion ya eran NULL en el caso evidenciado.
--   - Una orden recibida que no paso por una recoleccion (carga API) no tiene a quien reponer: no se toca.
-- No escribe historial. Una sola sentencia: atomica sin BEGIN/COMMIT.

UPDATE "orden" o
SET "mensajero_asignado_id" = r."actor_usuario_id",
    "updated_at" = NOW()
FROM (
  SELECT DISTINCT ON (hr."orden_id") hr."orden_id", hr."actor_usuario_id"
  FROM "orden_historial_estado" hr
  WHERE hr."origen_tipo" = 'recoleccion_tienda'
    AND hr."actor_usuario_id" IS NOT NULL
  ORDER BY hr."orden_id", hr."created_at" DESC, hr."id" DESC
) r
WHERE r."orden_id" = o."id"
  AND o."deleted_at" IS NULL
  AND o."mensajero_asignado_id" IS NULL
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
