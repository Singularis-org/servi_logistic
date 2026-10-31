-- SLT-66 (design §2.3 bis; R34, P4 y P6 cerradas) — desasigna el plan a TODA empresa que tenga uno.
-- `costo_por_orden` nace vacío en todos los planes (20261031120000), así que ninguna asignación previa
-- tiene costo concreto (R28). Quedan sin plan (sin límites), sin ciclo y con sus módulos como estaban,
-- hasta que el superadmin les asigne un plan con costo concreto.
--
-- CABECERA: el down.sql repone plan, ancla y ciclo corto desde plan_rastro SOLO a las empresas que sigan
-- sin plan y cuyo plan siga existiendo. A una que ya recibió otro plan no la toca, y su fila
-- `desasignado` se borra igual: esa reposición se pierde.
--
-- Va después de 20261031120100, que crea el valor `desasignado` de `plan_rastro_accion`.
--
-- · El ancla y el ciclo corto van a NULL: con ancla, la próxima asignación heredaría el ciclo viejo
--   (`COALESCE` de `PlanesRepository.asignar`) y no se podría elegir fecha; el CHECK
--   `organizacion_plan_ciclo_corto_check` obliga además a quitar las dos. Sin ancla, la próxima es una
--   «primera asignación» (SLT-58 R29–R31).
-- · Los módulos no se tocan (SL-24 R14).
-- · Sin fila en `historial_accion`: exige un actor y una migración no lo tiene. El rastro queda en
--   `plan_rastro`, con el actor de sistema (columna opaca y sin FK, como el «Sistema» de SL-24 §16.3).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE TEMP TABLE "slt66_desasignadas" ON COMMIT DROP AS
  SELECT o."id", o."nombre", o."plan_id", p."nombre" AS "plan_nombre",
         o."plan_ciclo_ancla_at" AS "ancla", o."plan_ciclo_corto_desde_at" AS "corto"
    FROM "organizacion" o JOIN "plan" p ON p."id" = o."plan_id";

INSERT INTO "plan_rastro" ("id", "plan_id", "plan_nombre", "accion", "cambios", "actor_usuario_id", "actor_nombre")
SELECT gen_random_uuid()::text, d."plan_id", d."plan_nombre", 'desasignado',
       jsonb_build_object('empresa', jsonb_build_object(
         'antes', jsonb_build_object('id', d."id", 'nombre', d."nombre", 'ancla', d."ancla", 'cortoDesde', d."corto"),
         'despues', NULL)),
       'sistema:SLT-66', 'Sistema (migración SLT-66)'
  FROM "slt66_desasignadas" d;

UPDATE "organizacion" o
   SET "plan_id" = NULL, "plan_ciclo_ancla_at" = NULL, "plan_ciclo_corto_desde_at" = NULL
  FROM "slt66_desasignadas" d WHERE o."id" = d."id";

COMMIT;
