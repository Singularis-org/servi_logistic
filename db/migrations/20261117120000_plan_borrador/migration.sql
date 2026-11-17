-- SLT-129 (design §1; R5, R22, R23, R24) — el borrador del formulario de planes, guardado en el servidor paso a
-- paso por el superadmin.
--
-- Una tabla de PLATAFORMA aparte de `plan` (design §1.3, alternativa A): un borrador de creación no es una fila
-- de `plan`, así que ninguna lectura de planes (asignables, públicos, catálogo, cobro, facturación, trabajos ni
-- las funciones `SECURITY DEFINER`) lo ve, sin un `WHERE` nuevo en ninguna. Un borrador de cambio tampoco
-- escribe en `plan` ni en `plan_cambio_programado` hasta confirmarlo.
--
--   · `plan_id` NULL = borrador de un plan nuevo (varios a la vez); con valor = el ÚNICO borrador del cambio de
--     ese plan (R5, como `plan_cambio_programado.plan_id`). CASCADE: cae con el plan, también con el custom que
--     cae con su empresa (R22).
--   · `pasos` es `{ "<idPaso>": <valores> }`. Guardar un paso es `pasos || jsonb_build_object(…)`, una mezcla de
--     primer nivel en una sola sentencia (R4). Los CHECK cierran la forma: un objeto, solo los ids de paso de
--     SLT-130 y `vigencia` solo en un cambio.
--   · `iniciado_por_*` opacos y SIN FK, como el actor de `plan_rastro`.
--   · RLS sin políticas y `REVOKE ALL … FROM servi_app` (R23), como el resto de `plan_*`: sin el REVOKE, el
--     ALTER DEFAULT PRIVILEGES de 20261022130000 le daría CRUD a `servi_app`.
--
-- No toca ninguna tabla existente: el down solo quita esta (R24).
--
-- ATOMICIDAD: BEGIN/COMMIT, como 20261114120000, para que el runner de los tests (sentencia a sentencia)
-- tampoco deje nada a medias.
--
-- Prefijo 20261117: va después de la mayor migración de `dev` (20261116120000_pago_plataforma_confirmacion).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE TABLE "plan_borrador" (
  "id"                      TEXT         NOT NULL PRIMARY KEY,
  "plan_id"                 TEXT         NULL,
  "pasos"                   JSONB        NOT NULL DEFAULT '{}',
  "iniciado_por_usuario_id" TEXT         NOT NULL,
  "iniciado_por_nombre"     VARCHAR(120) NOT NULL,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_borrador_plan_id_key" UNIQUE ("plan_id"),
  CONSTRAINT "plan_borrador_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "plan_borrador_pasos_objeto" CHECK (jsonb_typeof("pasos") = 'object'),
  CONSTRAINT "plan_borrador_pasos_conocidos"
    CHECK (("pasos" - ARRAY['general','precio','orden','topes','modulos','vigencia']) = '{}'::jsonb),
  CONSTRAINT "plan_borrador_vigencia_solo_cambio"
    CHECK ("plan_id" IS NOT NULL OR NOT ("pasos" ? 'vigencia'))
);

ALTER TABLE "plan_borrador" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan_borrador" FROM servi_app;

COMMIT;
