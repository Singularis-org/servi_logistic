-- SLT-66 (design §2.2) — los dos valores de enum nuevos de la ficha.
--
-- · `cobro_plataforma_fuente` gana `plan`: el cargo de una orden cuyo importe sale del costo por orden
--   del plan de la empresa (R12). Lo escribe el trigger de 20261031130200.
-- · `plan_rastro_accion` gana `desasignado` (R34): ninguna acción que existe describe quitar un plan a
--   una empresa, y registrarlo como `editado` falsearía el rastro. Lo usa 20261031130300.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04,
-- precedente SL-24 §16.6). Nada aquí escribe filas ni cambia funciones.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

ALTER TYPE "cobro_plataforma_fuente" ADD VALUE IF NOT EXISTS 'plan';
ALTER TYPE "plan_rastro_accion" ADD VALUE IF NOT EXISTS 'desasignado';
