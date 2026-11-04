-- SL-17 M3 (design §3 M3, D15, R37–R39): misma empresa en cada FK de negocio a negocio.
-- GENERADO con `tsx scripts/generar-misma-empresa.ts` --faltantes: no editar a mano.
--
--   · 1 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017).
--   · 0 tablas de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).
--   · Quedan fuera las FK a plataforma, a `organizacion` y a `jobs`, y el `usuario` referido
--     sin empresa (superadmin). Prisma no ve funciones ni triggers: no hay drift.

BEGIN;

-- RechazoTiendaCobro.tarifaValor
CREATE TRIGGER "sme_rechazo_tienda_cobro_tarifa_valor_id_61a03463" BEFORE INSERT OR UPDATE OF "tarifa_valor_id", "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('tarifa_valor', 'tarifa_valor_id', 'id');


COMMIT;
