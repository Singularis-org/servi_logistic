-- DOWN de SLT-66 (design §2.3 bis; R34) — vuelve a asignar, desde las filas `desasignado` que escribió
-- la subida (actor `sistema:SLT-66`), el plan, el ancla y el ciclo corto que tenía cada empresa.
--
-- SOLO repone a una empresa que siga con `plan_id IS NULL` y cuyo plan siga existiendo. A una que ya
-- recibió otro plan no la toca: pisaría una asignación hecha después. Las filas se borran todas, también
-- las que no se pudieron reponer (lo dice la cabecera de la subida).
--
-- Los módulos no se tocan: la subida tampoco los tocó.
--
-- ORDEN: va antes del down de 20261031120200 y del de 20261031120100, que se niega a quitar el valor
-- `desasignado` mientras queden filas que lo usen.

BEGIN;

UPDATE "organizacion" o
   SET "plan_id" = r."plan_id",
       "plan_ciclo_ancla_at" = (r."cambios"->'empresa'->'antes'->>'ancla')::timestamp,
       "plan_ciclo_corto_desde_at" = (r."cambios"->'empresa'->'antes'->>'cortoDesde')::timestamp
  FROM "plan_rastro" r
 WHERE r."accion" = 'desasignado'
   AND r."actor_usuario_id" = 'sistema:SLT-66'
   AND o."id" = r."cambios"->'empresa'->'antes'->>'id'
   AND o."plan_id" IS NULL
   AND EXISTS (SELECT 1 FROM "plan" p WHERE p."id" = r."plan_id");

DELETE FROM "plan_rastro" WHERE "accion" = 'desasignado' AND "actor_usuario_id" = 'sistema:SLT-66';

COMMIT;
