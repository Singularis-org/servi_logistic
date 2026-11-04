-- SL-17 M3 (design §3 M3, D15, R37–R39): misma empresa en cada FK de negocio a negocio.
-- GENERADO con `tsx scripts/generar-misma-empresa.ts` --faltantes: no editar a mano.
--
--   · 10 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017).
--   · 5 tablas de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).
--   · Quedan fuera las FK a plataforma, a `organizacion` y a `jobs`, y el `usuario` referido
--     sin empresa (superadmin). Prisma no ve funciones ni triggers: no hay drift.

BEGIN;

-- CierreDetailConcepto.cierreDetail
CREATE TRIGGER "sme_cierre_detail_concepto_cierre_detail_id_290585ea" BEFORE INSERT OR UPDATE OF "cierre_detail_id", "organizacion_id"
  ON "cierre_detail_concepto" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_detail', 'cierre_detail_id', 'id');
-- CierreDetailConcepto.tarifaValor
CREATE TRIGGER "sme_cierre_detail_concepto_tarifa_valor_id_47dc5d4e" BEFORE INSERT OR UPDATE OF "tarifa_valor_id", "organizacion_id"
  ON "cierre_detail_concepto" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('tarifa_valor', 'tarifa_valor_id', 'id');
-- GestionPagoCongelado.gestionOrden
CREATE TRIGGER "sme_gestion_pago_congelado_gestion_orden_id_629f75d0" BEFORE INSERT OR UPDATE OF "gestion_orden_id", "organizacion_id"
  ON "gestion_pago_congelado" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_orden_id', 'id');
-- GestionPagoCongelado.tarifaValor
CREATE TRIGGER "sme_gestion_pago_congelado_tarifa_valor_id_cd7b5dfd" BEFORE INSERT OR UPDATE OF "tarifa_valor_id", "organizacion_id"
  ON "gestion_pago_congelado" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('tarifa_valor', 'tarifa_valor_id', 'id');
-- GrupoDistritos.zona
CREATE TRIGGER "sme_grupo_distritos_zona_id_8ee3eb69" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "grupo_distritos" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- GrupoDistritosDistrito.zona
CREATE TRIGGER "sme_grupo_distritos_distrito_zona_id_c38764e5" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "grupo_distritos_distrito" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- TarifaValor.actualizadoPorUsuario
CREATE TRIGGER "sme_tarifa_valor_actualizado_por_2f583cb4" BEFORE INSERT OR UPDATE OF "actualizado_por", "organizacion_id"
  ON "tarifa_valor" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actualizado_por', 'id');
-- TarifaValor.mensajero
CREATE TRIGGER "sme_tarifa_valor_mensajero_id_d5fbd496" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "tarifa_valor" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- TarifaValor.tienda
CREATE TRIGGER "sme_tarifa_valor_tienda_id_c20a8fa3" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "tarifa_valor" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- TarifaValor.zona
CREATE TRIGGER "sme_tarifa_valor_zona_id_ffed2262" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "tarifa_valor" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');

CREATE TRIGGER "grupo_distritos_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "grupo_distritos" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "grupo_distritos_distrito_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "grupo_distritos_distrito" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "tarifa_valor_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "tarifa_valor" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gestion_pago_congelado_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gestion_pago_congelado" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cierre_detail_concepto_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cierre_detail_concepto" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

COMMIT;
