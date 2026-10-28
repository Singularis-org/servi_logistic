# impl SL-24 — planes-y-limites

## T0. Preparación (2026-10-27)

- Última migración de `origin/dev`: `20261026120200_job_estado_descartado` (la que da el spec).
- **Pero** la rama `feature/SL-23-nucleo-recoleccion-satelite` (PR #27, abierto) trae
  `20261027120000_modulos_nucleo`, con el mismo timestamp que la `20261027120000_plan` del spec.
  Decisión (la que prevé T0): las tres de SL-24 pasan a `20261027130000_plan`,
  `20261027130100_historial_accion_planes` y `20261027130200_plan_topes_triggers`, antes de
  aplicarlas en ninguna base compartida. `design.md` y `tasks.md` actualizados.
- Riesgo de orden con el PR #27: `modulos_nucleo` recrea el enum `modulo_apagable` (RENAME del
  viejo, ALTER COLUMN solo de `organizacion_modulo`, `DROP TYPE` del viejo). Si `plan_modulo.modulo`
  ya existe con ese enum cuando corre, el `DROP TYPE modulo_apagable_viejo` falla. Con los nuevos
  timestamps, SL-24 va después en orden léxico; si SL-24 llegara a `dev` antes que el PR #27, este
  tendría que recrear también la columna de `plan_modulo`. Lo decide el leader.
  Los tests de SL-24 usan solo claves que sobreviven al PR #27: `analitica`, `monitoreo`, `wallet`,
  `ranking`, `whatsapp`.
- `scripts/verificar-rls-despliegue.ts` no cuenta tablas de plataforma: su punto 6 cuenta solo
  políticas `%_por_empresa` y sus triggers `sme_*` / `*_sin_cambio_de_empresa`. Las tablas de
  planes (RLS sin políticas) no lo mueven. No se ajusta en T1.
- Base de la feature: `servi_logistic_sl24` en el Postgres local (`localhost:5432`), migrada con
  `prisma migrate deploy` hasta `20261026120200`.

## T1 + T2 (2026-10-27)

### Archivos tocados

- Nuevos: `db/migrations/20261027130000_plan/{migration,down}.sql`,
  `db/migrations/20261027130100_historial_accion_planes/{migration,down}.sql` (down con la función de
  `20261026120100` tal cual, renombrada `_sl24`), `tests/integration/db/planes-catalogo.test.ts`,
  `tests/integration/db/planes-acceso-servi-app.test.ts`.
- `db/schema.prisma` (solo añadidos): modelos `Plan`, `PlanTopeRol`, `PlanModulo`, `PlanRastro`; enums
  `PlanVisibilidad`, `PlanRastroAccion`; `Organizacion.planId/plan/planCicloAnclaAt/planesExclusivos`;
  `@@index([organizacionId, createdAt], map: "orden_organizacion_id_created_at_vivas_idx")` en `Orden`;
  `plan_asignado` y `plan` en los enums del historial.
- `lib/db/modelos-de-negocio.ts`: los cuatro en `MODELOS_DE_PLATAFORMA` (16 → 20).
- `lib/types/historial-accion.ts`: `plan_asignado` (bloque A.6), entidad `plan`, categoría `cambia_plan`
  («Cambia el plan»), `ACCION_LABELS.plan_asignado` = «Asignó un plan a una empresa», `ENTIDAD_LABELS.plan`
  = «Plan». `lib/types/historial-accion-etiquetas.ts`: `etiquetaDeEntidad("plan", { nombre })` →
  `Plan «<nombre>»`, recortada a 120.
- Tests con cifras o listas duras del catálogo: `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
  (73/27/6 y `cambia_plan`), `caja-459-migration`, `correccion-resultado-gestion-migration`,
  `historial-accion-cobro-tienda-migration`, `historial-accion-conciliacion-bodega-migration`,
  `historial-accion-orden-zona-reconciliada-migration`, `historial-accion-zona-pago-mensajero-migration`,
  `historial-accion-zona-sinpe-migration` (`plan_asignado`/`plan` en `POSTERIORES`);
  `schema-drift-saneamiento.test.ts` (`plan` en el censo de `updated_at` con default).

### Mapa R<n> -> test (T1/T2)

| R | Test |
|---|---|
| R1 | `planes-catalogo`: «un plan se guarda con nombre, visibilidad, topes, módulos y precio…», «sin topes ni precio…», «los módulos incluidos son del enum…» |
| R2 (base) | `planes-catalogo`: «nombre en blanco, topes negativos y visibilidad sin su empresa…» (`plan_custom_con_empresa`) |
| R3 | `planes-catalogo`: «las cinco formas del precio entran», «las combinaciones prohibidas… dan 23514», «no cabe en DECIMAL(12,2)» |
| R6 (base) | `planes-catalogo`: «archivar conserva el plan, sus topes y su asignación; un plan en uso no se puede borrar», «borrar una empresa con su propio custom…» |
| R7 (base) | `planes-catalogo`: «públicos… asignables de A…» |
| R8 | `planes-acceso-servi-app`: SELECT / INSERT-UPDATE-DELETE en las cuatro tablas, asignación propia y cliente de la app → 42501 |
| R14 (base) | `planes-catalogo`: «una empresa recién creada nace sin plan ni ancla» |
| R25 (CHECK) | `planes-catalogo`: «el tope por rol admite los cinco roles… rechaza apiKey y superadmin» |
| R30 | `planes-acceso-servi-app`: «cada empresa ve solo su asignación…» |

Pendiente para T3: R6 «sigue topada» tras archivar (necesita el trigger) y R8 `plan_cupo_ordenes` con otra
empresa.

### Bloqueo de T2 (mismo que SL-23 T1)

`plan_asignado` en el enum obliga a listarlo en `HISTORIAL_ACCION_TIPOS` (`_AsegurarExhaustivoTipos`), y
entonces `historial-accion-escrituras-cubiertas` exige su productor en el `CENSO` (`PlanesRepository`, T4) y
fija 72. Queda **roja (2 casos) hasta T4**; el censo y la cifra 73 se tocan en T4 con el productor.

### Salida

- `prisma migrate deploy` (base `servi_logistic_sl24`): las dos aplicadas. `prisma migrate diff
  --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`
- Ida y vuelta: `down.sql` de 130100 y de 130000 con `prisma db execute`, filas de `_prisma_migrations`
  borradas → sin tablas `plan*`, sin columnas `plan_*` en `organizacion`, sin índice parcial, enums del
  historial en 72/26. `migrate deploy` de nuevo → 73/27, todo de vuelta; diff vacío; base arriba.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errors, 231 warnings (preexistentes); eslint de los archivos tocados: exit 0.
- `vitest run planes-catalogo planes-acceso-servi-app schema-drift-saneamiento`: 3 files, 36 passed, 0 skipped.
- Las 7 de integración del historial: 7 files, 97 passed.
- Guardias `organizacion-en-modelos`, `rls-por-empresa`, `unicos-por-empresa`, `historial-accion*`,
  `historial-acciones*` + `catalogo-y-choke-point`: 12 files, 291 passed, 2 failed
  (`historial-accion-escrituras-cubiertas`: productor y cifra, hasta T4).

- `vitest related --run lib/db/modelos-de-negocio.ts lib/types/historial-accion.ts
  lib/types/historial-accion-etiquetas.ts` (arrastra el cliente de Prisma: 1301 archivos): 251 failed |
  1050 passed. 245 de los 251 están en `tests/baseline-rojos.json`. Los 6 fuera de baseline:
  - `historial-accion-escrituras-cubiertas`: el bloqueo de arriba (hasta T4);
  - `migracion-sl23-ida-y-vuelta` «van en orden justo detrás de la última de dev»: espera los índices
    251–253 y recibe 254–256 porque las tres `20261026090*` de SL-18 quedan entre su `PREVIA` y SL-23.
    Preexistente en `dev`, no lo mueven las de SL-24 (van detrás);
  - `demo-qa`: «faltan catálogos en la base (corre `pnpm run db:seed`)»; la base de la feature no está
    sembrada (sin seeds en esta tanda);
  - `analitica-operativa-indices`, `geografia-alta`, `job-repository-claim-concurrente`: timeouts y un plan
    de `gestion_orden` bajo la carga de la corrida en paralelo. Solos: 3 files, 21 passed.

Veredicto: T1 hecho y verde; T2 hecho salvo `historial-accion-escrituras-cubiertas`, roja hasta T4 por diseño del catálogo.

## T3 (2026-10-28)

### Archivos

- Nuevos:
  - `db/migrations/20261027130200_plan_topes_triggers/{migration,down}.sql`. Las ocho funciones:
    - `plan_inicio_ciclo`, IMMUTABLE y sin `SECURITY DEFINER`;
    - `plan_uso_ordenes`, `plan_uso_rol` y `plan_uso_api_keys`;
    - `plan_cupo_ordenes`;
    - los cuerpos de trigger `plan_tope_ordenes`, `plan_tope_usuario` y `plan_tope_api_key`.

    Las que leen tablas son `SECURITY DEFINER` con `search_path` fijo. Todas llevan `REVOKE EXECUTE … FROM PUBLIC`.
    `GRANT EXECUTE` a `servi_app` solo en `plan_cupo_ordenes`. Los cinco triggers son los de design §4.3. El down hace
    `DROP TRIGGER` ×5 y `DROP FUNCTION` ×8.
  - `lib/db/sqlstate.ts`: `llevaSqlstate(e, codigo)` y `mensajesDeLaCadena(e)`.
  - `lib/planes/ciclo.ts`: `inicioDelCiclo`.
  - `lib/planes/mensajes.ts`: `mensajeDelTope` y `mensajeTopesPasados`.
  - `lib/planes/tope-error.ts`: `TopeDelPlanAlcanzado`, `traducirErrorDeTope` y `SQLSTATE_TOPE_PLAN`.
  - `tests/integration/db/_fixtures/planes.ts`: `CASOS_CICLO`, `revertida`, `sqlstateDe`, `capturar`, `crearPlan`,
    `asignarPlan` y `triggerActivo`.
  - Tests de integración: `plan-topes-ordenes`, `plan-topes-usuarios`, `plan-topes-api-keys`,
    `plan-topes-concurrencia` y `plan-ciclo`.
  - Tests unit: `tests/unit/utils/ciclo-plan.test.ts`, `tests/unit/db/sqlstate.test.ts` y
    `tests/unit/planes/tope-error.test.ts`.
- Modificado: `lib/db/contexto-empresa.ts`. El recorrido privado de SL017 se va a `sqlstate.ts`, y
  `traducirErrorDeEmpresa` llama a `llevaSqlstate(e, "SL017")`. La lógica, las claves y la profundidad son las mismas.
- Sin tocar:
  - `db/schema.prisma`: Prisma no expresa funciones ni triggers, y el diff sigue vacío;
  - `lib/db/excepciones-aislamiento.ts` y `tests/fabricas/*`;
  - `lib/auth/*`, `UserRepository`, `ApiKeyRepository` y `AprobacionPostulacionRepository`.

### Notas de diseño medidas

- **§4.1.** El JSON llega en `MESSAGE` por las dos formas de error de Prisma 7.8 con adapter-pg:
  - operación de modelo: `DriverAdapterError` con `cause.{code, originalCode: "SL024", message}`;
  - SQL a mano: `P2010`, con el JSON en el texto «Raw query failed…» y en `meta.driverAdapterError`.

  Lo afirma `plan-topes-ordenes` «§4.1». `DETAIL` no se usa: los triggers no lo rellenan.
- **El JSON.** Sale de `jsonb_build_object(...)::text`: espacio tras `:` y claves ordenadas por longitud. El `rol` va
  con el nombre del enum de Prisma (`adminTienda`), no con el de Postgres (`'Admin Tienda'`).
- **Zona horaria (riesgo; no bloquea T3, lo decide el leader).**
  - La base local `servi_logistic_sl24` tiene `TimeZone = America/Bogota`.
  - Prisma escribe `orden.created_at` desde el cliente, en UTC. Medido: `created_at` 13:28 frente a
    `now()::timestamp` 08:28.
  - Los triggers cortan el ciclo con `now()::timestamp`, como piden design §3 y §4.3.
  - En Supabase (UTC) las dos escalas coinciden. En una base con otra zona, la frontera del ciclo se corre esas horas.
  - Los tests no dependen de esto: fijan el ancla con `now()` de la base y mueven las fechas por SQL.
- **Hasta T4.** Los planes de los tests los escribe el dueño directamente (`_fixtures/planes.ts`). La bajada de plan
  de `plan-topes-concurrencia` reproduce a mano los cerrojos de §4.4 y §5.2. T4 los cambia por `PlanesRepository`
  real.
- **`{cosa}` en `mensajeTopesPasados` (superadmin, §6.4).** El spec no lo fija. Lo derivé de las otras tres filas:
  - «órdenes en el ciclo en curso»;
  - «API keys activas»;
  - «usuarios activos con el rol {rol}».

  **Abierto: que lo confirme el humano en T4.**

### R<n> -> test (T3)

| R | Test |
|---|---|
| R6 (sigue topada tras archivar) | `plan-topes-ordenes`: «R6: un plan archivado sigue topando…» |
| R8 (`plan_cupo_ordenes` de otra empresa) | `plan-topes-ordenes`: «R8: plan_cupo_ordenes da a servi_app el cupo de SU empresa; el de otra es 42501; sin plan, nada» (también `plan_uso_ordenes` con `servi_app` → 42501) |
| R14 | `plan-topes-ordenes` «R14…», `plan-topes-usuarios` «R14…», `plan-topes-api-keys` «… sin plan tampoco (R14)» |
| R18 | `plan-topes-ordenes`: «R18: un INSERT a mano con servi_app… también se rechaza» |
| R19 | `plan-topes-ordenes`: «anular por pantalla y por API libera cupo», «una orden del ciclo anterior no cuenta, y anularla no abre cupo», «recuperar al tope no se bloquea» |
| R20 | `plan-ciclo` (las 15 filas de `CASOS_CICLO` contra `plan_inicio_ciclo` y contra la gemela TS); `tests/unit/utils/ciclo-plan.test.ts` |
| R21 (base) | `plan-topes-ordenes`: «R21 (pantalla)» y «R21 (api)» (`createManyOrdenes` y `createManyOrdenesConGuia`); «el conteo es por sentencia» |
| R24 | `plan-topes-concurrencia`: dos altas con cupo 1; alta → bajada; bajada → alta; READ COMMITTED |
| R25 | `plan-topes-usuarios`: «R25: crear una API key… no mueve ningún uso de rol» |
| R26 | `plan-topes-usuarios`: «R26: pendiente, inactivo y bloqueado no cuentan» |
| R27 (base) | `plan-topes-usuarios`: crear, activar desde inactivo, activar desde bloqueado, aprobar postulación, cambiar rol y SQL a mano |
| R30 | `plan-topes-ordenes`: «R30: A al tope y B con el MISMO plan sigue creando» |
| R35 (base) | `plan-topes-api-keys`: crear al tope (no quedan ni la key ni su cuenta dedicada), activar al tope, desactivar y eliminar liberan, SQL a mano, sin tope |
| Traducción (§4.5) | `tests/unit/db/sqlstate.test.ts` (SL017 sin regresión y SL024); `tests/unit/planes/tope-error.test.ts` |

### Mutaciones (design §11)

Cada mutación se aplicó a la base: el `down.sql` (con `IF EXISTS`) y la `migration.sql` mutada. Después se corrió su
test y se restauró la original.

| # | Mutación | Resultado |
|---|---|---|
| 1 | `v_total >= v_maximo` en el trigger de órdenes | `plan-topes-ordenes`: **10 rojos de 13**, entre ellos «R21… justo en el tope entra» |
| 2 | `plan_uso_ordenes` sin `deleted_at IS NULL` | `plan-topes-ordenes`: **2 rojos**, «anular por pantalla y por API libera cupo» y «recuperar al tope…» |
| 3 | sin `pg_advisory_xact_lock` en el trigger de órdenes | `plan-topes-concurrencia`: **1 rojo**, «dos altas a la vez con cupo 1»: la segunda termina durante la pausa |
| 5 | el `WHEN` de cambio sin `OLD.rol_id IS DISTINCT FROM NEW.rol_id` | `plan-topes-usuarios`: **2 rojos**, «cambiar el rol…» y «SQL a mano… cambiar el rol» |
| 6 | el `WHEN` de cambio con `OLD.estado NOT IN ('activo','bloqueado')` | `plan-topes-usuarios`: **1 rojo**, «activar desde bloqueado es un alta» |
| 7 | sin el trigger `plan_tope_api_key_cambio` | `plan-topes-api-keys`: **5 rojos de 5**, por el control `triggerActivo`. Sin ese control (copia temporal del archivo): **2 rojos**, «activar una inactiva al tope» y «SQL a mano» |

Después de restaurar, el diff de `migrate diff` sale vacío.

### Salida

- **Migración.**
  - `prisma migrate deploy` → `20261027130200_plan_topes_triggers` aplicada.
  - `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`
- **Ida y vuelta.**
  - `prisma db execute --file down.sql`, más borrar la fila de `_prisma_migrations` → 0 funciones `plan_*` y 0
    triggers `plan_tope*`.
  - `migrate deploy` → 8 funciones y 5 triggers. `servi_app` tiene EXECUTE solo en `plan_cupo_ordenes`.
  - Diff vacío. La base queda arriba.
- **Typecheck y lint.**
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
  - `pnpm exec eslint` sobre los archivos tocados: exit 0.
- **Tests de SL-24.** `vitest run` de los 5 de integración, los 3 unit, `planes-catalogo` y `planes-acceso-servi-app`:
  **10 archivos, 108 passed, 0 skipped**.
- **Los 77 tests que importan `contexto-empresa`.**
  - Unit: 39 archivos, 543 passed.
  - Integración (38, con `--maxWorkers=4`): 37 archivos pasan, con 319 passed y 12 skipped. Los 12 skipped son de
    `demo-qa`: falla en su `beforeAll` porque faltan catálogos (base sin seeds). Preexistente, ya anotado en T1.
- **Guardias.** `pnpm run test:guardias`: 316 archivos, 6 failed, 4401 passed y 1 skipped.
  - Los rojos son `dependencias-declaradas-presentes` (4), que está en `tests/baseline-rojos.json`, y
    `historial-accion-escrituras-cubiertas` (2), que se espera hasta T4.
  - `censo-order-status-rename` y `superadmin-fuera-de-empresa` se pusieron rojas por código de T3 y quedaron
    corregidas: eran el nombre de una variable y el literal del rol en `tope-error.ts`, que ahora sale de `ROL_LABELS`.
- **Grafo.** No se consultó: el código se exploró con Grep/Read, como en T1.

Veredicto: T3 hecho y verde. Queda abierto el `{cosa}` de los textos del superadmin, y anotado el riesgo de zona horaria
de la base local.
