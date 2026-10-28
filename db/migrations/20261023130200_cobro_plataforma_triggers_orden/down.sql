-- SL-40 — revierte 20261023130200_cobro_plataforma_triggers_orden. Apaga el cobro: las órdenes que se
-- creen o se anulen desde aquí no registran nada. Los cargos ya registrados se quedan, porque viven en
-- la tabla de 20261023130100.

DROP TRIGGER "cobro_plataforma_al_cambiar_borrado" ON "orden";
DROP TRIGGER "cobro_plataforma_al_crear_orden" ON "orden";

DROP FUNCTION cobro_plataforma_al_cambiar_borrado();
DROP FUNCTION cobro_plataforma_al_crear_orden();
