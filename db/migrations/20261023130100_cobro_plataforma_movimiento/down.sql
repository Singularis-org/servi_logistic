-- SL-40 — revierte 20261023130100_cobro_plataforma_movimiento. Se aplica después del down de
-- 20261023130200, así que los triggers de `orden` que escribían en esta tabla ya no existen.
-- Borra los cargos registrados: después de este down no queda dónde guardarlos.

-- Misma empresa (SL-17 M3), GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.
DROP TRIGGER "sme_cobro_plataforma_movimiento_orden_id_a07cad67" ON "cobro_plataforma_movimiento";
DROP TRIGGER "cobro_plataforma_movimiento_sin_cambio_de_empresa" ON "cobro_plataforma_movimiento";

-- La política, los índices y las FK se van con la tabla.
DROP TABLE "cobro_plataforma_movimiento";

DROP TYPE "cobro_plataforma_fuente";
DROP TYPE "cobro_plataforma_tipo";
