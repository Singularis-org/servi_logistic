-- DOWN de SLT-123 (design §3.2-SLT-123; R312) — quita la marca de la regla de pago al mensajero.
--
-- PRECONDICION RUIDOSA: si algun cierre ya se aprobo con la regla nueva (marca en `true`), se aborta
-- sin tocar nada. Bajar la columna lo devolveria EN SILENCIO a la regla de la feature 44: su pendiente
-- pasaria de P a P - min(P,E) con un libro que no tiene `pago_efectivo`. Es dinero: primero hay que
-- decidir que se hace con esos cierres, no borrar la marca.

BEGIN;

DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM "cierre_dia" WHERE "pago_independiente_efectivo";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SLT-123: % cierres de cierre_dia tienen pago_independiente_efectivo = true; se aborta sin borrar nada', v_n;
  END IF;
END
$$;

ALTER TABLE "cierre_dia" DROP COLUMN "pago_independiente_efectivo";

COMMIT;
