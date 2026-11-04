-- DOWN (SL-17 M3) — revierte `migration.sql`: DROP TRIGGER de todos y despues DROP FUNCTION.
-- GENERADO con `tsx scripts/generar-misma-empresa.ts` --faltantes.

BEGIN;

DROP TRIGGER "sme_cierre_detail_concepto_cierre_detail_id_290585ea" ON "cierre_detail_concepto";
DROP TRIGGER "sme_cierre_detail_concepto_tarifa_valor_id_47dc5d4e" ON "cierre_detail_concepto";
DROP TRIGGER "sme_gestion_pago_congelado_gestion_orden_id_629f75d0" ON "gestion_pago_congelado";
DROP TRIGGER "sme_gestion_pago_congelado_tarifa_valor_id_cd7b5dfd" ON "gestion_pago_congelado";
DROP TRIGGER "sme_grupo_distritos_zona_id_8ee3eb69" ON "grupo_distritos";
DROP TRIGGER "sme_grupo_distritos_distrito_zona_id_c38764e5" ON "grupo_distritos_distrito";
DROP TRIGGER "sme_tarifa_valor_actualizado_por_2f583cb4" ON "tarifa_valor";
DROP TRIGGER "sme_tarifa_valor_mensajero_id_d5fbd496" ON "tarifa_valor";
DROP TRIGGER "sme_tarifa_valor_tienda_id_c20a8fa3" ON "tarifa_valor";
DROP TRIGGER "sme_tarifa_valor_zona_id_ffed2262" ON "tarifa_valor";

DROP TRIGGER "grupo_distritos_sin_cambio_de_empresa" ON "grupo_distritos";
DROP TRIGGER "grupo_distritos_distrito_sin_cambio_de_empresa" ON "grupo_distritos_distrito";
DROP TRIGGER "tarifa_valor_sin_cambio_de_empresa" ON "tarifa_valor";
DROP TRIGGER "gestion_pago_congelado_sin_cambio_de_empresa" ON "gestion_pago_congelado";
DROP TRIGGER "cierre_detail_concepto_sin_cambio_de_empresa" ON "cierre_detail_concepto";

COMMIT;
