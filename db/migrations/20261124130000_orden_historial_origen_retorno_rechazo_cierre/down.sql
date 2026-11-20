-- DOWN (SLT-247) — revierte EXACTAMENTE `migration.sql`: `orden_historial_origen_tipo` pierde
-- `retorno_por_rechazo_cierre`.
--
-- POR QUE ES UN `CREATE TYPE` Y NO UN `DROP VALUE`: Postgres NO soporta `ALTER TYPE … DROP VALUE`.
-- La unica via es RECREAR el tipo con la lista PREVIA y recastear las columnas que lo usan. Patron
-- de `20260908160000_correccion_resultado_gestion/down.sql` (398).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ AVISO, Y NO ES TEORICO: ESTA LISTA ES UNA FOTO DEL 2026-11-20.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Un `down.sql` de enum recrea el tipo con la lista COMPLETA, asi que ejecutarlo sobre una base
-- que ya avanzo BORRA EN SILENCIO, SIN UN SOLO ERROR, los valores que se añadieron despues de
-- escribirse este archivo (medido en este repo el 2026-09-07, ver el `down.sql` de la 398).
--
-- ANTES DE CORRER ESTE ARCHIVO, MIDE EL CATALOGO DE HOY:
--     SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--      WHERE t.typname = 'orden_historial_origen_tipo' ORDER BY e.enumsortorder;
-- Si devuelve algo que NO sea «los 34 de abajo mas `retorno_por_rechazo_cierre`», este `down.sql`
-- esta RANCIO y borrara lo que falte.
-- `tests/integration/db/247-origen-retorno-rechazo-migration.test.ts` no se fia de esta frase:
-- corre este archivo contra la base aplicada dentro de una transaccion que revierte y compara la
-- lista resultante, valor a valor y en orden, con la de la base menos el valor nuevo.
--
-- DE DONDE SALE LA LISTA: MEDIDA el 2026-11-20 contra una base nueva migrada en orden de carpeta
-- hasta `20261123120100_zona_activa` (34 valores, en este orden). Coincide con los 33 del
-- `CREATE TYPE` de la 398 MAS `correccion_resultado_gestion`, que es el ultimo valor que se añadio
-- antes de esta ficha.
--
-- COLUMNAS QUE USAN EL TIPO — MEDIDO el 2026-11-20 contra la base (`pg_attribute`), no citado. Son
-- DOS, no una como en la 398:
--   · `orden_historial_estado.origen_tipo`;
--   · `orden_evento.familia_aplicacion` (454, `20260923120100_orden_evento`), que ademas lleva el
--     CHECK `orden_evento_familia_aplicacion_check` con literales del tipo. Ese CHECK se SUELTA antes
--     del recast y se recrea despues con su texto original: si no, Postgres lo re-parsea contra el
--     tipo renombrado y el `ALTER COLUMN` falla.
-- Indices: solo `orden_historial_actor_origen_created_idx` menciona `origen_tipo`, como COLUMNA de
-- un btree pleno; el `ALTER COLUMN … TYPE` lo reconstruye solo. Ninguna funcion ni vista usa el tipo.
--
-- ⚠️ PRECONDICION RUIDOSA: CERO filas de "orden_historial_estado" con
-- `origen_tipo = 'retorno_por_rechazo_cierre'`. Si quedara alguna, el `USING` del `ALTER COLUMN`
-- falla al castearla y el rollback ABORTA. Es lo CORRECTO: esas filas son lo unico que dice QUE
-- admin devolvio a la calle las ordenes de un cierre rechazado. Primero se decide que hacer con
-- ellas, a mano y a sabiendas.

ALTER TABLE "orden_evento" DROP CONSTRAINT "orden_evento_familia_aplicacion_check";

ALTER TYPE "orden_historial_origen_tipo" RENAME TO "orden_historial_origen_tipo_old";
CREATE TYPE "orden_historial_origen_tipo" AS ENUM (
  'carga_masiva',
  'creacion_manual',
  'generacion_guia',
  'asignacion_bodega',
  'ruteo_satelite',
  'recepcion_satelite',
  'asignacion_satelite',
  'recoleccion',
  'gestion',
  'liberacion_reprogramada',
  'ajuste_estado',
  'deshacer_gestion',
  'carga_api',
  'liberacion_devuelta_sla',
  'escalado_devuelta_sla',
  'reprogramacion_tienda',
  'recuperacion_manual',
  'cancelacion_api',
  'corte_sin_gestionar',
  'liberacion_sin_gestionar',
  'recepcion_bodega_central',
  'devolucion_rechazada',
  'recoleccion_tienda',
  'incidente',
  'deshacer_asignacion',
  'asignacion_recoleccion',
  'anclaje_devolucion',
  'solicitud_ayuda_tienda',
  'rescate_ayuda_tienda',
  'gestion_tienda_ayuda',
  'rechazo_tienda',
  'habilitacion_api',
  'rechazo_tope_intentos',
  -- añadido por la 398 (`20260908160000`). ES EL ULTIMO DE LA FOTO DEL 2026-11-20.
  'correccion_resultado_gestion'
);

ALTER TABLE "orden_historial_estado"
  ALTER COLUMN "origen_tipo" TYPE "orden_historial_origen_tipo"
  USING ("origen_tipo"::text::"orden_historial_origen_tipo");

ALTER TABLE "orden_evento"
  ALTER COLUMN "familia_aplicacion" TYPE "orden_historial_origen_tipo"
  USING ("familia_aplicacion"::text::"orden_historial_origen_tipo");

DROP TYPE "orden_historial_origen_tipo_old";

ALTER TABLE "orden_evento" ADD CONSTRAINT "orden_evento_familia_aplicacion_check"
  CHECK (
    ("tipo" = 'gestion_registrada'
      AND "familia_aplicacion" IS NOT NULL
      AND "familia_aplicacion" IN ('gestion', 'incidente', 'gestion_tienda_ayuda'))
    OR ("tipo" <> 'gestion_registrada' AND "familia_aplicacion" IS NULL)
  );
