-- SL-45 — revierte 20261024140000_pago_plataforma_blindaje: quita el tope del pago en la base y
-- devuelve a `servi_app` el UPDATE y el DELETE sobre `wallet_movimiento` que le daba el ALTER DEFAULT
-- PRIVILEGES de 20261022130000. Vuelven a estar abiertas las cuatro vías de la review (B1). Los pagos
-- ya registrados se quedan.
--
-- Va ANTES que el down de 20261024130000: el WHEN del trigger nombra `egreso_pago_plataforma`, y con
-- el trigger puesto el down del enum no podría recrear el tipo de la columna.

DROP TRIGGER "wallet_movimiento_tope_pago_plataforma" ON "wallet_movimiento";
DROP FUNCTION wallet_movimiento_tope_pago_plataforma();

GRANT UPDATE, DELETE ON "wallet_movimiento" TO servi_app;
