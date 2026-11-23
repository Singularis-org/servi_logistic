-- DOWN de SLT-227 (design §1.1) — quita `cobro_proveedor_credencial`.
--
-- ABORTA si ya hay credenciales cargadas: borrarlas es una decisión humana, no un rollback (el molde de SLT-143
-- §3.7). No se borra nada y se pide resolverlo a mano.

BEGIN;

DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM "cobro_proveedor_credencial";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SLT-227: % filas en cobro_proveedor_credencial; se aborta sin borrar nada', v_n;
  END IF;
END $$;

DROP TABLE "cobro_proveedor_credencial";

COMMIT;
