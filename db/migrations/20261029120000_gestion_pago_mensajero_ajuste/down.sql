-- SLT-56 — revierte 20261029120000_gestion_pago_mensajero_ajuste. Va DESPUES del down de
-- 20261029120100 (el tipo de historial que nombra estos ajustes).
--
-- ⚠️ DESTRUCTIVO: se lleva el rastro de los ajustes (quien, cuando, de cuanto a cuanto y por que). Los
-- pagos ajustados siguen en `gestion_orden.pago_mensajero` y en `cierre_dia.total_pago_mensajero`,
-- que esta migracion no creo: el down no los toca, y sin la tabla dejan de verse como «ajustados».

-- Misma empresa (SL-17 M3), GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.
DROP TRIGGER IF EXISTS "sme_gestion_pago_mensajero_ajuste_actor_usua_c147fb09" ON "gestion_pago_mensajero_ajuste";
DROP TRIGGER IF EXISTS "sme_gestion_pago_mensajero_ajuste_cierre_id_a1cb5a27" ON "gestion_pago_mensajero_ajuste";
DROP TRIGGER IF EXISTS "sme_gestion_pago_mensajero_ajuste_gestion_id_22d339fa" ON "gestion_pago_mensajero_ajuste";
DROP TRIGGER IF EXISTS "gestion_pago_mensajero_ajuste_sin_cambio_de_empresa" ON "gestion_pago_mensajero_ajuste";

-- La politica, los CHECK, los indices y las FK se van con la tabla.
DROP POLICY IF EXISTS "gestion_pago_mensajero_ajuste_por_empresa" ON "gestion_pago_mensajero_ajuste";
DROP TABLE IF EXISTS "gestion_pago_mensajero_ajuste";
