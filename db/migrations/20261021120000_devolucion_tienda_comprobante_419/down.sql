-- DOWN (ficha 419) — revierte `migration.sql`: `DROP TABLE` de las tres tablas en orden inverso
-- de dependencias (sus indices, FK, CHECK y RLS se van con ellas). No toca ningun enum.
--
-- PRECONDICION RUIDOSA: si hay comprobantes registrados se ABORTA sin borrar nada. Un comprobante
-- es la prueba de que la tienda recibio sus paquetes; un rollback no es la forma de borrarlo
-- (el estado `devuelta_a_tienda` de esas ordenes seguiria ahi, sin su prueba).

BEGIN;

DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT (SELECT count(*) FROM "devolucion_tienda_comprobante")
       + (SELECT count(*) FROM "devolucion_tienda_evidencia")
       + (SELECT count(*) FROM "devolucion_tienda_orden")
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback 419: hay % filas de comprobantes de entrega a tienda; se aborta sin borrar nada', v_n;
  END IF;
END
$$;

DROP TABLE "devolucion_tienda_orden";
DROP TABLE "devolucion_tienda_evidencia";
DROP TABLE "devolucion_tienda_comprobante";

COMMIT;
