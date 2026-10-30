-- SL-24 — revierte 20261028130200_plan_topes_triggers. Apaga los topes: desde aquí ninguna alta se
-- rechaza por el plan. El catálogo y las asignaciones se quedan, porque viven en 20261028130000.

DROP TRIGGER "plan_tope_api_key_cambio" ON "api_key";
DROP TRIGGER "plan_tope_api_key_alta" ON "api_key";
DROP TRIGGER "plan_tope_usuario_cambio" ON "usuario";
DROP TRIGGER "plan_tope_usuario_alta" ON "usuario";
DROP TRIGGER "plan_tope_ordenes" ON "orden";

DROP FUNCTION plan_tope_api_key();
DROP FUNCTION plan_tope_usuario();
DROP FUNCTION plan_tope_ordenes();
DROP FUNCTION plan_cupo_ordenes(text);
DROP FUNCTION plan_uso_api_keys(text);
DROP FUNCTION plan_uso_rol(text, rol_value);
DROP FUNCTION plan_uso_ordenes(text, timestamp);
DROP FUNCTION plan_inicio_ciclo(timestamp, timestamp);
