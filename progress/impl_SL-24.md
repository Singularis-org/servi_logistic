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

## T3b (2026-10-28) — migraciones de la enmienda + Prisma

**Orden comprobado.** `git ls-tree origin/dev db/migrations/`: la última de `dev` es
`20261027120000_modulos_nucleo` (PR #27, ya mergeado). Las de SL-24 siguen: `20261027130000`,
`…130100`, `…130200`, y ahora `20261028120000_plan_cambio_programado` y `20261028120100_plan_cambio_enums`.
`git diff --stat HEAD -- db/migrations/` vacío: T1–T3 sin cambios.

**Archivos**
- Nuevos: `db/migrations/20261028120000_plan_cambio_programado/{migration,down}.sql` (tabla, `UNIQUE(plan_id)`,
  FK CASCADE, RLS sin políticas, `REVOKE ALL … FROM servi_app`; down `DROP TABLE`).
- Nuevos: `db/migrations/20261028120100_plan_cambio_enums/{migration,down}.sql` (4 `ADD VALUE` en
  `plan_rastro_accion` y 4 en `job_tipo`; el down borra las filas de `plan_rastro` y `jobs` con esos valores
  y recrea los dos tipos con la función dinámica de `20261026120100`, renombrada `_sl24`, que suelta y
  restaura los índices parciales y DEFAULT que nombran el tipo).
- `db/schema.prisma`: `model PlanCambioProgramado`, relación `Plan.cambioProgramado`, 4 valores en
  `PlanRastroAccion` y 4 en `JobTipo` (solo añadidos; sin `prisma format` global para no mover otras líneas).
- `lib/db/modelos-de-negocio.ts`: `PlanCambioProgramado` en `MODELOS_DE_PLATAFORMA`.
- `lib/modulos/reparto.ts`: los 4 tipos en `MODULO_POR_JOB` como `"nucleo"`.
- `tests/integration/db/planes-acceso-servi-app.test.ts`: siembra una fila de `plan_cambio_programado`;
  SELECT/INSERT/UPDATE/DELETE con `servi_app` → `42501`, y por el cliente de la app → rechazo; la foto
  del dueño incluye los cambios.

**R<n> → test**
- R8 (tabla nueva sin acceso para la empresa) → `tests/integration/db/planes-acceso-servi-app.test.ts`.
- R39 (un pendiente por plan) → a nivel de esquema el `UNIQUE`; su test de comportamiento es
  `planes-cambio-programado` (T11).

**Salida real**
- `prisma migrate deploy` → `All migrations have been successfully applied.`
- drift `migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`
- `down.sql` probados contra `servi_logistic_sl24` (script de scratchpad con `pg`): tras los dos down,
  `job_tipo` termina en `…whatsapp_envio_mantenimiento`, `plan_rastro_accion` = `creado,editado,archivado`,
  la tabla no existe; las filas con valores nuevos borradas y las de control intactas; índices (7) y
  DEFAULT de `jobs`/`plan_rastro` idénticos; segunda pasada del down de enums ok (idempotente). Después
  se quitaron las 2 filas de `_prisma_migrations` y se volvió a `migrate deploy` + drift vacío. La base queda arriba.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → sin errores.
- `eslint` sobre los 3 archivos TS tocados → sin salida (ok).
- `vitest run` planes-acceso-servi-app (6/6), guardias `organizacion-en-modelos` y `modulos-reparto`,
  `tests/unit/modulos/catalogo.test.ts`, `tests/unit/cron/procesar-jobs-modulos.test.ts` → verde.
- **Rojo esperado nuevo:** `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts` («cada valor de
  `job_tipo` tiene su handler») falla con los 4 tipos nuevos: los handlers llegan en T11
  (`plan_aplicar_cambio`, `plan_cambios_vencidos`) y T12 (`plan_recordatorio_cambio`, `plan_aviso_correo`).
  Sigue rojo también `historial-accion-escrituras-cubiertas` hasta T4.
- Ningún test con lista o conteo fijo de `job_tipo` se rompió (los que hay usan `toContain`/`>=`).

**Veredicto:** T3b hecha; único rojo nuevo, la guardia de handlers por tipo, que cierran T11/T12.

## T4 (2026-10-28) — `PlanesRepository` + `PlanesService` + `lib/types/planes.ts`

**Archivos**
- Nuevos:
  - `lib/types/planes.ts`: esquemas zod (`crearPlanSchema`, `editarPlanSchema` con `vigenteDesde`, `precioPlanSchema`,
    `topesPlanSchema`, los de id) y los tipos de §5.1 (`PlanDTO`, `TopeExcedido`, `PlanResult`, `VersionPlan`…).
  - `lib/planes/rastro.ts`: `diferenciasDelPlan`, `planCanonico` e `importeCanonico`. Compara en forma canónica:
    «10» y «10.00» son el mismo precio, y el orden de los módulos o de `porRol` no es un cambio.
  - `lib/repositories/_shared/modulos-en-tx.ts`: `encenderEnTx`, `apagarEnTx` y `entradaDelCambio`, extraídos de
    `ModulosEmpresaRepository` con las mismas sentencias.
  - `lib/interfaces/repositories/IPlanesRepository.ts` y `lib/interfaces/services/IPlanesService.ts`.
  - `lib/repositories/PlanesRepository.ts`: `empresa`, `plan`, `crear`, `editar` (inmediata), `archivar`, `asignar`,
    `cancelarCambio`, `asignables` y `publicos`, todo en `comoPlataforma("SL-24", …)`.
    - Cerrojos de §4.4: `asignar` toma `organizacion` FOR UPDATE y luego `plan` FOR SHARE; `editar`, `archivar` y
      `cancelarCambio` toman `plan` FOR UPDATE.
    - `aplicarVersion(tx, antes, version, actor)` es una función del módulo, para que la reutilice T11.
    - El uso se cuenta con las funciones SQL de T3 (`plan_uso_*`, `plan_inicio_ciclo`).
    - El ancla nace con `now()` de la base: `COALESCE(plan_ciclo_ancla_at, now()::timestamp)`.
  - `lib/services/PlanesService.ts`: orden quién → zod → existe → reglas → repositorio, y reloj inyectable (R37).
  - Tests: `tests/unit/types/planes-schema.test.ts`, `tests/unit/planes/rastro.test.ts`,
    `tests/unit/services/planes-service.test.ts`, `tests/integration/db/planes-asignacion.test.ts`,
    `planes-edicion-en-uso.test.ts` y `planes-historial.test.ts`.
- Modificados:
  - `lib/repositories/ModulosEmpresaRepository.ts`: usa el ayudante, con las mismas filas, el mismo resultado y el
    mismo historial.
  - `lib/planes/ciclo.ts`: añade `inicioDelDiaPlataforma(fecha)`, las 00:00 a −06:00. La lista T11, pero la pide el
    test de esquema de T4 (§16.7) y la validación de R37.
  - `lib/db/excepciones-aislamiento.ts`: solo se añade `PlanesRepository` (SL-24).
  - `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`:
    - productor `PlanesRepository#asignar` para `plan_asignado`, con la mutación `UPDATE "organizacion" SET "plan_id"`;
    - la cifra pasa de 72 a 73;
    - las dos entradas de SL-23 exigen ahora `encenderEnTx(tx` / `apagarEnTx(tx`, porque la sentencia se mudó al
      ayudante y recibe la misma `tx`.
  - `tests/integration/db/_fixtures/planes.ts`: `planesEnTx(tx, romper)` (repositorio real sobre SAVEPOINT, con
    `historialAccion` o `planRastro` rotos a voluntad), `entradaDePlan` y `superadminEnTx`.
  - `tests/integration/db/plan-topes-concurrencia.test.ts`: la bajada de plan ya es `PlanesRepository.asignar` real.
    Su cliente envuelve `$transaction` para pausar antes del COMMIT, en vez de reproducir a mano los cerrojos.
  - `tests/integration/db/planes-catalogo.test.ts` (T1): dos consultas a `pg_constraint` y `pg_indexes` acotadas a
    `public`. La guardia `catalogo-postgres-acota-esquema`, llegada con el merge de `dev`, las marcaba. Sin cambio de
    comportamiento.

**Decisiones a revisar (no estaban escritas en el spec)**
1. **Edición programada.** `PlanesService.editar` con `vigenteDesde` futuro valida R37 y la existencia, y después
   **lanza** `Error("… se implementa en T11")`. Programar o reemplazar es T11 (§16.2). Con fecha pasada o de hoy
   responde `validation_error` en `vigenteDesde`. El texto «La fecha de vigencia tiene que ser posterior a hoy.» es
   mío: `mensajes.ts` no tiene uno y no lo toqué.
2. **`cancelarCambio` en el repositorio.** Lo adelanté de T11 porque `archivar` necesita la misma cancelación (R40) y
   la sexta action de T5 la usa: plan FOR UPDATE, borrar el pendiente y escribir la fila `cambio_cancelado`.
   - `cambios` de esa fila = `{ "vigenteDesde": { "antes": <ISO>, "despues": null } }`. El spec no fija ese JSON:
     T11 debe mantenerlo o cambiarlo en las dos filas a la vez.
   - Los correos de cancelación (R45) **no** van: son de T12. Hay un comentario en el punto exacto donde se encolan.
3. **`actor_nombre`.** Es NOT NULL en `plan_rastro`. Si el actor no se resuelve a un usuario, se guarda `''`, sin
   inventar un nombre. Con un superadmin real sale congelado, como lo prueba `planes-historial`.
4. **R2, custom de una empresa que no existe** → `not_found` (el estado de `PlanResult` que mejor encaja).
5. **Correos de editar (R41)** → T12. Comentario en `editar`, en el punto del outbox.

**Conversión de los tests de T3.** `plan-topes-concurrencia` sí se convirtió: la bajada usa el repositorio real y
pasa (4/4). Los `crearPlan`/`asignarPlan` del fixture que usan `plan-topes-ordenes`, `-usuarios` y `-api-keys` se
quedan como dueño, porque no encajan sin forzar:
- `asignarPlan` fija el ancla en `now() − desfase` («1 hour» por la deriva del reloj; «45 days» para el ciclo
  anterior de R19);
- la asignación real ancla en `now()` y no puede dar ese pasado;
- esos tests miden los triggers, no el repositorio.

**R<n> → test (T4)**

| R | Test |
|---|---|
| R1 | `planes-service` «R1: el superadmin crea y recibe el id…»; `planes-historial` «R29: un público sin empresas…» (crea por el servicio real) |
| R2 | `planes-schema` «R2: un custom sin empresa…», «R2: traer visibilidad u organizacionId…»; `planes-service` «R2: un custom de una empresa que no existe…», «R2: cambiar la visibilidad o la empresa…» |
| R3 | `planes-schema` «R3: las cinco formas…» (7 entran, 12 rechazos) |
| R4 | `planes-asignacion` «R4: asignar un plan con precio no crea cobros…» |
| R5 | `planes-service` «R5: …» (7 operaciones × 6 roles de empresa + sin sesión, cero llamadas) |
| R6 | `planes-service` «R6: editar un archivado…», asignar archivado; `planes-asignacion` «R6: un plan archivado no se asigna»; `planes-edicion-en-uso` «R6: un plan archivado no se edita» |
| R9 | `planes-asignacion` «R9: la primera asignación fija el ancla…; cambiar de plan la conserva» |
| R10 | `planes-asignacion` «R10: deja encendidos exactamente los módulos incluidos» |
| R11 | `planes-asignacion` «R11: la excepción de SL-23 sobrevive a editar los topes y se apaga al cambiar de plan» |
| R12 | `planes-asignacion` «R12 (Admin Tienda)», «R12 (API keys)», «R12 (órdenes)», «R12: un rol sin tope…»; `planes-service` «R12: el rechazo por tope dice…» |
| R13 | `planes-asignacion` «R13: …» (3 casos, servicio y repositorio bajo cerrojo); `planes-service` (not_found, custom de otra, el mismo plan) |
| R15 | `planes-edicion-en-uso` «R15: la siguiente alta de cada empresa del plan se cuenta contra el tope nuevo» |
| R16 | `planes-edicion-en-uso` «R16: con 3 tiendas activas y un tope nuevo de 2…», «R16: el aviso nombra cada empresa y cada tope»; `planes-service` «R16: …se guarda y devuelve el aviso» |
| R17 | `planes-edicion-en-uso` «R17: enciende lo añadido y apaga lo quitado…sin tocar sus excepciones», «R17: …no se duplica ni se registra» |
| R24 | `plan-topes-concurrencia` (con `PlanesRepository.asignar` real) |
| R29 | `planes-historial` (rastro exacto de crear, editar y archivar sin empresas; `plan_asignado` con el superadmin y lote compartido; historial roto y rastro roto → nada persiste); `rastro` (diff) |
| R37 (validación) | `planes-schema` «R37: vigenteDesde…», «R37/P8…»; `planes-service` «R37: vigenteDesde de ayer / hoy…», «R37: hoy cuenta desde las 00:00 a −06:00» |
| R39 (cancelar) | `planes-historial` «R39: cancelar sin pendiente no escribe nada; con pendiente lo borra…» |
| R40 | `planes-historial` «R40: archivar con un cambio pendiente lo cancela…» |
| R43 (`cambio_cancelado`) | `planes-historial` R40 y R39. Las otras tres filas son de T11 |

**Mutación 4** (§11, «la asignación no cuenta usuarios»): en `asignar`, `excedidosDe(tx, [empresa], { ...plan.topes,
porRol: {} })`. `planes-asignacion` + `plan-topes-concurrencia` → **1 rojo de 16**: «R12 (Admin Tienda): con 3 en uso,
bajar a un tope de 2 se rechaza…». Restaurado; `grep` confirma el original.

**Medición de §15** (carga de 500 filas, `OrdenRepository.createManyOrdenes` con `JobRepository` real, Postgres local
`servi_logistic_sl24`):
- un calentamiento descartado de cada y después 5 alternadas;
- con plan: tope 100 000, así que toma los cerrojos y el consultivo y cuenta;
- archivo temporal en `tests/integration/db/`, borrado al medir.

| | Corridas (ms) | Mediana |
|---|---|---|
| Sin plan | 1818, 1816, 1816, 1602, 1626 | 1816 ms |
| Con plan | 1793, 1692, 1924, 1584, 1579 | 1692 ms |

El coste del trigger de sentencia queda dentro del ruido. Esto mide el coste por carga, no la contención entre dos
cargas de la misma empresa: esas se ponen en fila hasta el COMMIT por diseño (§4.4) y la cubre `plan-topes-concurrencia`.

**Salida real**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0.
- `pnpm exec eslint` sobre los 22 archivos tocados → `No issues found`.
- `vitest run`, 21 archivos, `--maxWorkers=4`, con `DATABASE_URL` de `servi_logistic_sl24` → **21 passed, 291 tests
  passed, 0 skipped**. Entran:
  - los 7 de T4/T5;
  - SL-23 sin tocar: `modulos-empresa-service`, `organizacion-modulo`, `modulos-empresa-historial` y
    `modulos-empresa.composition-root`;
  - T1/T3: `plan-topes-concurrencia`, `-ordenes`, `-usuarios`, `-api-keys`, `plan-ciclo`, `planes-catalogo`,
    `planes-acceso-servi-app`, `ciclo-plan`, `tope-error` y `sqlstate`.
- `pnpm run test:guardias` → 316 archivos, 2 failed, **5 tests failed**, 4403 passed, 1 skipped.
  - `dependencias-declaradas-presentes` (4): está en `tests/baseline-rojos.json`.
  - `jobs-handler-por-tipo` (1): esperada hasta T11/T12.
  - `historial-accion-escrituras-cubiertas` ya está **verde**.
- Grafo: no consultado. El código se exploró con Grep/Read, como en T1–T3.

Veredicto T4: hecho y verde. La edición programada queda como `throw` explícito hasta T11.

## T5 (2026-10-28) — `lib/actions/planes.ts`

**Archivos**
- Nuevo: `lib/actions/planes.ts` (`"use server"`).
  - Las seis actions: `crearPlanAction`, `editarPlanAction` (acepta `vigenteDesde`; lo valida el esquema),
    `archivarPlanAction`, `asignarPlanAction`, `listarPlanesAsignablesAction` y `cancelarCambioPlanAction`.
  - El actor sale de la sesión (`resolveActorFromSession`), con `deps` para los tests, como en `modulos-empresa`.
  - El composition root `construirPlanesService()` no se exporta: un `"use server"` solo exporta actions, y así no
    hace falta un `_shared/planes.ts` que no está en «Archivos esperados».
  - Cada action lleva `@sin-superficie`: esta ficha es solo backend (decisión «Pantalla») y la pantalla es de SL-26.
    Sin la anotación, la guardia `superficie-de-uso` se pone en rojo.
- `lib/modulos/reparto.ts`: `planes: "nucleo"` en `MODULO_POR_ACTION`.
- Nuevo: `tests/unit/actions/planes.composition-root.test.ts`. Mockea solo `getPrismaClient`, y se comprueba que:
  - `listarPlanesAsignablesAction` y `crearPlanAction`, sin `deps.service`, pasan por `PlanesRepository` real: el
    `where` de asignables, el `plan.create` anidado y la fila `creado` de `plan_rastro` con el actor congelado;
  - las seis existen y dan `forbidden` a un maestro sin tocar el cliente;
  - `editarPlanAction` con una fecha pasada responde `validation_error` en `vigenteDesde`.

**`cancelarCambioPlanAction` y T11.** Funciona con el `cancelarCambio` adelantado en T4: borra el pendiente y
escribe su fila de rastro. Le faltan los correos de cancelación (T12).

**R<n> → test (T5)**: R5, en el borde → `planes.composition-root` «las seis actions existen y un maestro recibe
forbidden…». La guardia `modulos-reparto` está en verde.

**Salida real**: `planes.composition-root` 4/4; `modulos-reparto.guardia` en verde dentro de `test:guardias`; el
typecheck y eslint, los de T4.

Veredicto T5: hecho y verde.

## T7a (2026-10-28) — usuarios y API keys: servicios

### Escritores de `usuario.estado = 'activo'` (design §15)

Ninguno desbloquea solo. Todos son una acción humana explícita o un alta:

- `lib/services/UsuarioService.ts:186` (crear, nace `activo`), vía `UserRepository.create` (`:152`).
- `lib/repositories/UserRepository.ts:613` `setEstado`: lo llama solo `UsuarioService.cambiarEstado` ←
  `lib/actions/usuarios.ts:185` (el maestro pulsa activar o inactivar). El schema del borde solo admite
  `activo | inactivo`.
- `lib/repositories/AprobacionPostulacionRepository.ts:99`: aprobar una postulación (maestro o admin, a mano).
- `lib/repositories/PostulacionRepository.ts:75`: la postulación pública crea al mensajero (`estado: "activo"`).
- `lib/repositories/OrganizacionRepository.ts:79`: el maestro de una empresa nueva (alta por el superadmin).
- `lib/repositories/ArranqueSuperadminRepository.ts:92`: el superadmin (sin empresa; el trigger no actúa).
- La cuenta dedicada de `ApiKeyRepository.createConUsuario` (`:194`).
- Ningún cron (`app/api/cron/*`), job, trigger ni migración escribe `estado` en `usuario`. Los demás `updateMany`
  sobre `usuario` (`CierreDiaRepository:1152`, `CierresAdminRepository:2107/2156`,
  `GestionOrdenRepository:635/661/813`, `OrdenRepository:4943`) solo tocan `ordenEnGestionId`, y
  `updatePasswordHash`/`restablecerContrasena` solo la clave. `AuthService` y `session-guard` solo leen `estado`.
  No hay bloqueo temporal ni desbloqueo por login. El «bloqueo» de `lib/constants/bloqueo-mensajero.ts` es por
  cierres, no un estado de la cuenta.

### Confirmaciones

- **Clave del campo de rol en `UsuarioForm`:** `rolId` (`app/(app)/configuracion/_components/UsuarioForm.tsx:105`,
  `:284`, `:310`). El form pinta `fieldErrors` de `validation_error` (`:339`, `:351`, `:384`).
- **`mapDuplicadoError`** (`UserRepository.ts:679` y `ApiKeyRepository.ts:542`) solo convierte P2002 de
  email/cédula. `textoConstraintP2002` devuelve `null` si no es un P2002, así que un SL024 sale como `return error`.
  `UserRepository.update` y `setEstado` no tienen `catch`, y `AprobacionPostulacionRepository` tampoco.
- **El `catch` de `ApiKeyService.generar`** (el «crear» del spec) solo capturaba `UsuarioDuplicadoError`; lo demás se
  relanzaba. Ahora traduce el tope antes de relanzar. `ApiKeyRepository.setEstado` solo captura P2025.
- `UserRepository.ts` y `ApiKeyRepository.ts`: sin cambios en el diff.
- Las actions (`lib/actions/usuarios.ts`, `aprobacion-postulaciones.ts`, `api-keys.ts`) no necesitan código: devuelven
  el resultado del servicio tal cual. Solo cambian los tipos que importan.

### Archivos

- `lib/types/planes.ts`: `ResultadoTopePlan = { status: "tope_plan"; mensaje: string }`.
- `lib/services/UsuarioService.ts`: crear y actualizar devuelven `validation_error` con `fieldErrors.rolId`;
  cambiarEstado devuelve `tope_plan`.
- `lib/services/AprobacionPostulacionService.ts`: aprobar devuelve `tope_plan`.
- `lib/services/ApiKeyService.ts`: generar y activar devuelven `tope_plan`.
- `lib/interfaces/services/IUsuarioService.ts`: `CambiarEstadoUsuarioServiceResult` gana la variante `tope_plan`.
- `lib/interfaces/services/IAprobacionPostulacionService.ts`: `DecisionServiceResult` gana la variante `tope_plan`.
- `lib/types/usuario.ts`: `CambiarEstadoUsuarioResult` gana la variante `tope_plan`.
- `lib/types/aprobacion-postulacion.ts`: `DecisionResult` gana la variante `tope_plan`.
- `lib/types/api-key.ts`: `GenerarApiKeyResult` y `ActivarApiKeyResult` ganan la variante `tope_plan`.
  `DesactivarApiKeyResult` no cambia.
- Nuevos: `tests/unit/services/usuario-service-tope-plan.test.ts`,
  `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts` y
  `tests/unit/services/api-key-service-tope-plan.test.ts`.

### R<n> → test (T7a)

- R27 → `usuario-service-tope-plan`: crear, actualizar el rol, activar desde `inactivo` y desde `bloqueado`, la
  forma P2010 y los errores ajenos que pasan tal cual.
- R27 → `aprobacion-postulacion-tope-plan`: aprobar.
- R35 → `api-key-service-tope-plan`: generar (adaptador y P2010) y activar.
- R28 y R36, la parte del servidor → los `describe` de action de esos tres archivos: la action entrega
  `{ status: "tope_plan", mensaje }` sin transformarlo. La pantalla queda para T7b.

### Salida real

- Tests nuevos: 3 archivos, 22/22 en verde.
- Tests existentes, 16 archivos y 262/262 en verde: `usuario-service`, `usuario-service-superadmin`,
  `aprobacion-postulacion-service`, `api-key-service` (con `.tienda-destino`, `.eliminar` y `.listar`),
  `actions/usuarios`, `usuarios-composition`, `actions/api-keys` (con `-eliminar` y `-listar`),
  `planes/tope-error` y las guardias 379.
- Guardias que nombran los archivos tocados: 9 archivos, 196/196 en verde.
- Integración contra la base SL-24: `plan-topes-usuarios` y `plan-topes-api-keys`, 15/15 en verde.
- `eslint` sobre los 12 archivos: «No issues found». `pnpm run typecheck` (`tsc --noEmit`): exit 0.

Veredicto T7a: hecho y verde. No hay desbloqueo automático y los repositorios no cambian.

## T7b — las cuatro pantallas existentes (frontend_dev, 2026-10-28)

Archivos modificados:
- `app/(app)/configuracion/_components/UsuariosModule.tsx`: al activar, `tope_plan` lanza `toast.error(res.mensaje)`.
- `app/(app)/_components/PostulacionesPendientesPanel.tsx`: el guard incluye `ResultadoTopePlan`, y `handleError` muestra `mensaje` con `tope_plan`.
- `app/(app)/configuracion/api/_components/ApiKeysModule.tsx`: al crear, `tope_plan` lanza `toast.error(keyResult.mensaje)` y el modal sigue abierto.
- `app/(app)/configuracion/api/_components/ApiKeyAccionCell.tsx`: al activar, `tope_plan` muestra `res.mensaje`.
- `UsuarioForm` no cambia: ya pinta `fieldErrors.rolId` bajo «Rol» (`FormField id="rolId" error={errors.rolId}`). Lo prueba el test.

Archivos creados:
- `tests/components/UsuariosTopePlan.test.tsx`: cubre activar, editar y crear.
- `tests/components/PostulacionesTopePlan.test.tsx`: cubre aprobar.
- `tests/components/ApiKeysTopePlan.test.tsx`: cubre crear (`ApiKeysModule`) y activar (`ApiKeyAccionCell`).

R<n> → test:
- R28 → `tests/components/UsuariosTopePlan.test.tsx` (activar: aviso; crear y editar: bajo el campo de rol, con `aria-describedby`) y `tests/components/PostulacionesTopePlan.test.tsx` (aviso al aprobar).
- R36 → `tests/components/ApiKeysTopePlan.test.tsx` (aviso al crear y al activar).

Salida real:
- `npx vitest run` sobre los 3 tests nuevos: «Test Files 3 passed (3) · Tests 6 passed (6)».
- `npx vitest run` sobre los existentes (`usuarios-module`, `usuarios-aviso-zona`, `usuarios-nombre-no-imprimible`, `usuarios-restablecer`, `PostulacionesPendientesPanel`, `ApiKeysModule`, `ApiKeyAccionCell`): «Test Files 7 passed (7) · Tests 115 passed (115)».
- `npx eslint` sobre los 7 archivos tocados: sin salida, exit 0.
- No corrí `typecheck`: lo corre el implementer al final, por memoria.

Veredicto T7b: hecho. Tests y lint en verde; falta el typecheck del implementer.

## T6 (2026-10-28) — órdenes: `CupoPlanRepository` + `BulkOrdenService` + los dos routes

Archivos creados:
- `lib/interfaces/repositories/ICupoPlanRepository.ts`: `ICupoPlanRepository.cupoOrdenes()`, el tipo `CupoOrdenes` y `SIN_CUPO` (devuelve `null`).
- `lib/repositories/CupoPlanRepository.ts`: `SELECT "maximo", "usados" FROM plan_cupo_ordenes(current_setting('app.organizacion_id', true))`.
- `tests/unit/services/bulk-orden-service.tope-plan.test.ts` (15 casos), `tests/unit/api/api-key-carga-tope-plan.test.ts` (3) y `tests/unit/api/carga-composition-root-cupo.test.ts` (3).

Archivos modificados:
- `lib/services/BulkOrdenService.ts`:
  - 4º parámetro opcional `cupoPlan = SIN_CUPO`;
  - `topeExcedido(pedidas)`, `filasAErrorDeTope` y `reclasificarTrasTope`;
  - en `cargarMasiva`, la comprobación va después de clasificar y antes del `dryRun`, y la persistencia queda en `try/catch` con `traducirErrorDeTope`;
  - en `cargarViaApi`, la comprobación va sobre `conTarifa` y antes de persistir, y el bucle de grupos queda en `try/catch`.
- `app/api/ordenes/carga-masiva/chunk/route.ts`: pasa `notificadorNoOp` (el default de siempre) y `new CupoPlanRepository(prisma)`.
- `app/api/ordenes/api-key/carga/route.ts`: pasa `new CupoPlanRepository(prisma)`.
- `tests/integration/db/plan-topes-ordenes.test.ts`: un caso nuevo, «T6: CupoPlanRepository…».
- `IBulkOrdenService.ts`, `lib/db/excepciones-aislamiento.ts` y `tests/fabricas/*` no cambian. El SQL nuevo no nombra ninguna tabla de negocio y no llama a `comoPlataforma`.

Decisiones que el spec no fija (para el reviewer):
1. **La empresa sale de `current_setting('app.organizacion_id')` y no de `contextoActual()`.** design §6.1 dice «la empresa del contexto (`contextoActual`)». En la carga por sesión no hay `conEmpresa` explícito: la empresa la resuelve la extensión desde la sesión, así que `contextoActual()` vendría `undefined`. El valor que fija la envoltura es la misma empresa. La función, además, rechaza con `42501` cualquier otra. El precedente es `PagoPlataformaRepository`.
2. **En la API, `pedidas` es `conTarifa.length`, no `toCreate.length`.** Son las órdenes que la petición insertaría de verdad: las filas sin tarifa ya salieron (feature 274). Coincide con lo que contaría el trigger.
3. **Tras el trigger en la vía sesión**, `cargaId` es el token que trajo el cliente, o `null`. Si este chunk creó el lote y confirmó un lote anterior, el id no vuelve. Es parte del residuo aceptado de §6.1.
4. **Tras el trigger en la API**, una fila que entró en un lote ya confirmado del grupo que falló sigue `creada`, con su estado real, pero sin `numGuia` y fuera de `ordenes[]`. También es el residuo de §6.1: el resumen dice qué entró.

R<n> → test:
- R21 → `bulk-orden-service.tope-plan` (sesión: pasa el tope, justo en el tope, tope 0, sin cupo; API: pasa el tope, justo en el tope, solo cuenta `conTarifa`) y `plan-topes-ordenes` (ya existía; nuevo caso T6 del repositorio real).
- R22 → `bulk-orden-service.tope-plan` (vista previa y carga real: filas `creada` → `error` con `errores.plan`; duplicada y error intactas; `cargaId: null`; reclasificación tras el trigger por las dos rutas de lote).
- R23 → `api-key-carga-tope-plan` (409, cuerpo exacto de design §6.1, sin `createManyOrdenesConGuia` ni PDF ni manifiesto; 409 también si salta el trigger y no entró ninguna).
- R14 (sin plan, sin límite, en el servicio) → `bulk-orden-service.tope-plan` («cupo null») y `carga-composition-root-cupo` («devuelve null»).
- Composition root → `carga-composition-root-cupo`: los dos routes, sin `deps.bulkService`, construyen `BulkOrdenService` con un `CupoPlanRepository` que lee del cliente de la app.

Salida real:
- `vitest run` de los 3 tests nuevos: «Test Files 3 passed (3) · Tests 21 passed (21)».
- `vitest run tests/integration/db/plan-topes-ordenes.test.ts` contra la base SL-24: «Tests 14 passed (14)», 0 saltados.
- Suites existentes y guardias que nombran los archivos tocados, 42 archivos en una corrida: «Test Files 42 passed (42) · Tests 703 passed (703)». Incluye:
  - las 5 suites `bulk-orden-service.*`;
  - las de los dos routes en `tests/integration/api/` (`ordenes-api-key-*` y `ordenes-carga-masiva-chunk`);
  - `api-key-empresa`, `api-key-modulo-inactivo` y las `openapi-carga-*`;
  - `carga-api-key-sin-tarifa`, `carga-api-etiquetas`, `asimetria-sin-tarifa`, `aislamiento-ordenes` y `dos-empresas-entradas`;
  - las guardias `sql-a-mano-por-empresa`, `plataforma-solo-en-lista`, `api-sin-redirect-sin-sesion`, `etiqueta-fuente-diferida`, `monto-cobrar-entero` y `openapi-canal-rutas-reales`.
- Después del último cambio: las 5 `bulk-orden-service.*` más los 2 tests de route nuevos, «Test Files 8 passed (8) · Tests 190 passed (190)».
- `eslint` sobre los 9 archivos tocados: sin errores, exit 0.
- `pnpm run typecheck`:
  - 1ª corrida: un `TS2352` en el genérico de `filasAErrorDeTope`. Se quitó el genérico.
  - 2ª corrida: exit 0, sin salida. Cubre todo el árbol, también lo de T7b.
- `git status tests/fabricas`: sin cambios.

Veredicto T6: hecho y en verde. Hay cuatro decisiones de implementación anotadas arriba para el reviewer.

## T11 (2026-10-28) — cambio programado: programar, reemplazar, cancelar y aplicar

### Archivos
- Nuevos:
  - `lib/planes/jobs-cambio-plan.ts`: los handlers `plan_aplicar_cambio` y `plan_cambios_vencidos`, la recurrencia horaria, el sembrador del barrido y el composition root `buildPlanesRepositoryDeJobs()`. Tiene una sección vacía marcada para T12.
  - `tests/integration/db/planes-cambio-programado.test.ts` (10 casos).
  - `tests/unit/cron/procesar-jobs-plan-cambio.test.ts` (12 casos).
- Modificados:
  - `lib/repositories/PlanesRepository.ts`:
    - `programarCambio`, `aplicarCambioProgramado`, `cambiosVencidos`, `encolarAplicacion` (outbox) y `dedupeAplicarCambio`;
    - `escribirRastro` acepta las 7 acciones;
    - `cancelarCambio` y `cancelarPendienteEnTx` no cambian de comportamiento (solo el comentario del punto T12).
  - `lib/interfaces/repositories/IPlanesRepository.ts`: `ResultadoProgramar`, `ResultadoAplicar`, `CambioPendiente` y los tres métodos.
  - `lib/services/PlanesService.ts`: `editar` con `vigenteDesde` llama a `programarCambio` (se quita el stub de T4).
  - `lib/types/planes.ts`: `versionPlanSchema` (`editarPlanSchema` sin `planId` ni `vigenteDesde`).
  - `app/api/cron/procesar-jobs/route.ts`: los 2 handlers en `buildHandlers`, el barrido en `buildRecurrencias` y `RECURRENTES_DE_PLATAFORMA`.
  - `scripts/siembra-jobs-recurrentes.ts`: la entrada `plan_cambios_vencidos` en `SIEMBRAS_RECURRENTES`.
  - Tests con listas cerradas de tipos, ampliadas con los 2 tipos nuevos:
    - `tests/unit/api/procesar-jobs-registro.test.ts`;
    - `tests/unit/services/jobs-registro.test.ts`;
    - `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`;
    - `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`: la ventana horaria (`MAS_TARDE_POR_TIPO`) y la prueba `contarJobs` del sembrador;
    - `tests/integration/api/procesar-jobs-geocodificacion.test.ts`;
    - `tests/integration/api/procesar-jobs-webhook-estado.test.ts`.
  - `tests/unit/services/planes-service.test.ts`: el doble gana los 3 métodos; el caso que esperaba el `throw /T11/` ahora programa; 6 casos nuevos.
  - `tests/integration/db/planes-historial.test.ts`: caso R43 con las 4 filas nuevas.
- Sin tocar: `tests/fabricas/*`, `lib/auth/*`, `lib/services/email/*`, `mensajes.ts`, T6, migraciones y dependencias.

### Decisiones que el spec no fija (para el reviewer)
1. **Payload de `plan_aplicar_cambio` = `{ planId, cambioId }`**, no solo `{ cambioId }` (§16.3).
   - Con el plan en el payload, el aplicador cierra el plan ANTES de leer el cambio (orden de §4.4).
   - Después lee el cambio por `id = cambioId` (y `planId`).
   - Sin PII. Así la mutación 8 («lee el pendiente del plan, no ESE cambio») se puede expresar y medir.
2. **`plan_cambios_vencidos` corre UNA vez, en plataforma** (`RECURRENTES_DE_PLATAFORMA`).
   - `conSuEmpresa` corre los recurrentes sin empresa una vez POR empresa. Aquí eso repetiría el barrido N veces y, con 0 empresas, no correría nunca.
   - Sigue re-agendándose por `buildRecurrencias`: cada hora en punto UTC, con `dedupe_key = plan_cambios_vencidos:<AAAA-MM-DDTHH>`.
3. **Siembra del barrido.** La guardia 313 exige una siembra para todo recurrente: sin primera fila, la serie no arranca.
   - El sembrador vive en `lib/planes/jobs-cambio-plan.ts`, junto a su recurrencia y con la misma clave. No hay un script `scripts/seed-*` nuevo.
   - Se registra en `SIEMBRAS_RECURRENTES` (`script` apunta a ese archivo).
   - Su idempotencia se mide contando filas en `planes-cambio-programado`.
   - **Para el leader:** esto toca `scripts/siembra-jobs-recurrentes.ts`, que §16.5 no lista.
4. **El reloj de «ya rige» es el de Node.** El handler recibe el `now` del drenador y lo compara con `vigente_desde`, que Prisma escribe desde un `Date` en la misma escala que `run_after`. No se usa `now()` de la base, para no reabrir el riesgo de zona de T3.
5. **Filas de `plan_rastro`.** El JSON de `cambios` no lo fija el spec:
   - `cambio_programado` → `diferenciasDelPlan(vigente, version)` más `vigenteDesde: { antes: null, despues: <ISO> }`;
   - `cambio_reemplazado` → `{ vigenteDesde: { antes: <ISO viejo>, despues: <ISO nuevo> } }`;
   - `cambio_cancelado` → igual que en T4: `{ vigenteDesde: { antes: <ISO>, despues: null } }`;
   - `cambio_aplicado` → el diff contra lo que regía AL APLICAR (puede diferir del programado si hubo una edición inmediata entre medias). `actor_usuario_id` es el del programador y `actor_nombre` es «Sistema (programado por <nombre>)», cortado a 120 caracteres. `plan_nombre` es el nombre nuevo.
   - Las filas de módulos de `historial_accion` al aplicar las firma `ACTOR_SISTEMA` (los tres campos a null).
6. **Programar la versión vigente CON pendiente** no responde `cambio: false`: §16.2 paso 2 solo corta si no hay pendiente. Reemplaza el pendiente por una programación sin diferencias, que al aplicarse no cambia nada.
7. **`vigenteDesde` del resultado `ok`** es la fecha elegida (`AAAA-MM-DD`), no el instante; `null` si no se programó nada.
8. **Versión que ya no valida al aplicar.** `versionPlanSchema.parse` lanza: el trabajo falla sin escribir, se reintenta 5 veces y queda `failed` con el motivo. El barrido lo reintentará cada hora mientras siga pendiente. No pasa con lo que guarda el servicio: lo valida el mismo esquema.

### Puntos de encolado que quedan para T12 (marcados con «T12» en el código)
1. `PlanesRepository.programarCambio`, paso 6:
   - `plan_recordatorio_cambio` ×2 (7 y 1 días antes, solo los que caen después de ahora, `dedupe_key = plan_recordatorio:<cambioId>:<dias>`);
   - un `plan_aviso_correo` `guardado` por empresa, con `reemplazaA = pendiente?.vigenteDesde`.
   - **No encolé los recordatorios**: sin su handler (T12) se quedarían `pending` para siempre.
2. `cancelarPendienteEnTx` (cancelar a mano y archivar): un `plan_aviso_correo` `cancelado` por empresa (R45).
3. `PlanesRepository.editar` (inmediata): un `plan_aviso_correo` `guardado` por empresa (R41). El comentario es de T4.
4. `lib/planes/jobs-cambio-plan.ts`: la sección vacía para los handlers `plan_recordatorio_cambio` y `plan_aviso_correo`. Su cableado va en `buildHandlers`, junto a los dos de T11.

### R<n> → test (T11)
| R | Test |
|---|---|
| R17 (al aplicar) | `planes-cambio-programado` «R38/R17: llegada la fecha…»: excepción `wallet` intacta y filas de SL-23 por empresa |
| R37 | `planes-cambio-programado`: «programado a mañana…» (vigente intacta, versión entera guardada, trabajo con `run_after`/`dedupe_key`/`max_intentos 5`/sin empresa, la 2.ª tienda entra con el tope viejo) y «una fecha que no es posterior…»; `planes-service` (programa, no edita; 00:00 a −06:00) |
| R16 (programada) | `planes-cambio-programado` «R16 (mutación 10)…»; `planes-service` «programada con una empresa por encima…» |
| R38 | `planes-cambio-programado`: «llegada la fecha…» (topes, precio, nombre y módulos; ancla y uso del ciclo iguales; un minuto antes no aplica; 2.ª ejecución sin efecto; la 3.ª tienda se rechaza con `SL024`) y «el barrido aplica los vencidos…»; `procesar-jobs-plan-cambio` (registro, recurrencia, en plataforma, handlers) |
| R39 | `planes-cambio-programado`: «R39 (mutación 8)…» (un solo pendiente; el trabajo viejo no aplica ni el nuevo) y «cancelar borra el pendiente…» |
| R40 | `planes-cambio-programado` «archivar con un cambio programado…» (programado por el servicio; su trabajo no aplica) |
| R43 | `planes-historial` «R43: programar, reemplazar, cancelar y aplicar…» (las 4 filas, con el JSON exacto y el actor) |
| R44 | `procesar-jobs-plan-cambio` «R44: los dos son de núcleo»; `modulos-reparto` (guardia existente) |

### Mutaciones (§16.7)
- **8** (el aplicador lee `where: { planId }` en vez de `{ id: cambioId, planId }`):
  - rojo: «R39 (mutación 8)…», «Tests 1 failed | 9 passed (10)»;
  - revertida: verde.
- **10** (`programarCambio` devuelve `tope_excedido` si hay avisos):
  - rojo: «R16 (mutación 10)…» y «R38/R17…», «Tests 2 failed | 8 passed (10)».
- **10, en la inmediata** (lo mismo en `editar`):
  - rojo: `planes-edicion-en-uso` «R16: con 3 tiendas…» y «R16: el aviso nombra…», «Tests 2 failed | 5 passed (7)».
- Tras revertir las dos: 0 marcas `MUTACION` en el archivo, y `planes-cambio-programado` + `planes-edicion-en-uso` dan «Tests 17 passed (17)».

### Salida real
- Una corrida con 23 archivos: «Test Files 2 failed | 21 passed (23) · Tests 2 failed | 331 passed (333)».
  - Unit: `tests/unit/cron/*`, `planes-service`, `planes-schema`, `planes.composition-root`, `procesar-jobs-registro`, `procesar-jobs-registro-envios`, `jobs-registro` y las guardias `jobs-handler-por-tipo`, `jobs-recurrentes-con-siembra` y `modulos-reparto`.
  - Integración contra la base SL-24: `procesar-jobs-geocodificacion`, `procesar-jobs-webhook-estado`, `procesar-jobs-route`, `siembra-recurrentes-como-plataforma` y `planes-{cambio-programado,historial,asignacion,edicion-en-uso,acceso-servi-app,catalogo}`.
  - Los 2 rojos de esa corrida:
    - la guardia `jobs-handler-por-tipo`, **esperada**: le faltan `plan_recordatorio_cambio` y `plan_aviso_correo`, que son de T12;
    - un orden inestable en el test nuevo de R39. Los dos trabajos tienen el mismo `created_at` (el de la transacción), así que ahora se distinguen por su `cambioId`.
- Tras el arreglo, `planes-cambio-programado` + `planes-historial` 3 veces seguidas: «Tests 17 passed (17)» las tres.
- Guardias `historial-accion-escrituras-cubiertas`, `plataforma-solo-en-lista`, `modulos-reparto`, `jobs-recurrentes-con-siembra` y `jobs-handler-por-tipo`: «Tests 1 failed | 157 passed (158)». El rojo es el de `jobs-handler-por-tipo` por T12 (Expected `[]`, Received `["plan_recordatorio_cambio","plan_aviso_correo"]`).
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0, sin salida.
- `eslint` sobre los 17 archivos tocados o nuevos: sin errores, exit 0.
- MCP del grafo: no lo usé; exploré con Grep/Read.

Veredicto T11: hecho y en verde, salvo la guardia `jobs-handler-por-tipo`, roja a la espera de los dos handlers de T12. Hay 8 decisiones anotadas para el reviewer; la 3 toca `scripts/siembra-jobs-recurrentes.ts`.

## T12 (2026-10-28) — correos del cambio

### Archivos
- Nuevos:
  - `lib/services/email/plantillas/cambio-plan.ts`: `plantillaCambioPlan`, sobre `componerCorreo` de `plantilla-marca.ts`, con los tipos `guardado` (y la línea `reemplazaA`), `recordatorio_7`, `recordatorio_1` y `cancelado`.
  - `tests/unit/services/email/plantilla-cambio-plan.test.ts` (14 casos).
  - `tests/integration/db/planes-cambio-correos.test.ts` (9 casos).
- Modificados:
  - `lib/planes/mensajes.ts`: SOLO se AÑADE la sección «Correos del cambio de plan». `mensajeDelTope`, `TopePasado` y `mensajeTopesPasados` no cambian.
  - `lib/repositories/PlanesRepository.ts`:
    - el encolado en la transacción: `editar` (inmediata), `programarCambio` (paso 6) y `cancelarPendienteEnTx` (cancelar a mano y archivar);
    - `repartirRecordatorio` y `destinatariosDelAviso`;
    - los helpers `encolarAvisos`, `dedupeAviso`, `dedupeRecordatorio`, `empresasDelPlan` y `topesDeLaEmpresa`;
    - `PlanesPrismaClient` gana `usuario`.
  - `lib/interfaces/repositories/IPlanesRepository.ts`: `AvisoCorreoPlan`, `DestinatariosDelAviso` y `ResultadoRecordatorio`; `programarCambio` recibe `ahora`; los dos métodos nuevos.
  - `lib/services/PlanesService.ts`: pasa `this.ahora()` a `programarCambio`.
  - `lib/planes/jobs-cambio-plan.ts`: `crearPlanRecordatorioCambioHandler`, `crearPlanAvisoCorreoHandler`, `avisoDelPayload` y el composition root del correo `buildDepsAvisoCorreo()`, que usa `crearEmailSender()` y `emailContacto()`.
  - `app/api/cron/procesar-jobs/route.ts`: los dos handlers en `buildHandlers`. Ninguno es recurrente.
  - Tests ampliados:
    - `tests/unit/cron/procesar-jobs-plan-cambio.test.ts`: de 12 a 26 casos;
    - `tests/unit/services/planes-service.test.ts`: el doble gana los 2 métodos, y `programarCambio` se espera con `ahora`;
    - censos literales de handlers con los 2 tipos: `tests/unit/api/procesar-jobs-registro.test.ts`, `tests/integration/api/procesar-jobs-geocodificacion.test.ts` y `tests/integration/api/procesar-jobs-webhook-estado.test.ts`.
- Sin tocar:
  - ningún archivo EXISTENTE de `lib/services/email/`: `git diff --name-only -- lib/services/email` sale vacío;
  - `tests/fabricas/*`, `lib/auth/*`, `AuthService`, `UserRepository`, `ApiKeyRepository`, T6, migraciones, seeds y dependencias.

### El formateador de fechas (lo pedía la task)
- **Ningún correo existente pinta una fecha.** `otp-codigo`, `bienvenida-maestro` y `recuperar-contrasena` solo hablan de minutos u horas, así que no hay un «formateador de los correos» que reutilizar.
- **Usé uno que ya existe; no escribí uno nuevo.** Es `fechaCortaCR` (`lib/whatsapp-envios/informes/formato.ts`), con la forma «7 nov 2026»:
  - pinta el día calendario de la plataforma (−06:00): `vigente_desde` es las 00:00 CR y sale ese día, no el anterior (hay un test de frontera);
  - lleva año, que hace falta en una fecha que puede estar a meses;
  - funciona en mitad de una frase.
- **Descartados:**
  - `fechaLegible` (`lib/utils/dia-reparto-textos.ts`, la que usan los avisos de la app): no lleva año;
  - `fechaLargaCR`: empieza en mayúscula («Lunes 5 de…»), y queda mal en mitad de una frase.
- **Pendiente de aprobación humana:** qué formateador se usa. Cambiarlo es una línea en la plantilla y los textos esperados de los tests.

### Decisiones que el spec no fija (para el reviewer)
1. **El `organizacion_id` del aviso.**
   - `JobRepository.enqueue` no recibe empresa: la toma del DEFAULT de `jobs` (`app.organizacion_id`).
   - `encolarAvisos` fija la empresa de cada aviso con `set_config(..., true)` antes de encolarlo y al final deja el valor previo. Es el patrón de `OrganizacionRepository`.
   - El resto de la transacción de plataforma no ve la empresa: `plan_aplicar_cambio` y los recordatorios nacen con `organizacion_id` NULL, y el test de T11 lo sigue comprobando.
   - No toqué `JobRepository`.
2. **El payload de `plan_aviso_correo`** es `{ cambioId|null, planId, planNombre, tipo, cambios, vigenteDesde, reemplazaA, topesPasados }`.
   - Frente al §16.4 añade `planNombre`, el nombre que rige al encolar (el que conoce el maestro; si cambia, el nuevo va en `cambios`), y `reemplazaA` (§16.2).
   - `topesPasados` lleva `{ empresa, tope, usados, maximo }`, sin el id. No hay datos personales: los maestros se leen al enviar.
3. **El payload de `plan_recordatorio_cambio`** es `{ planId, cambioId, dias }`. Frente a `{ cambioId, dias }`, añade el plan para cerrarlo antes de leer el cambio (orden de §4.4), igual que la decisión 1 de T11.
4. **Las lecturas del envío van en plataforma.** `destinatariosDelAviso` corre en `comoPlataforma`, dentro del `conEmpresa` del drenador.
   - Motivo: `plan` y `plan_cambio_programado` tienen `REVOKE` para `servi_app` (R8), y el recordatorio necesita comprobar el pendiente.
   - Los maestros se filtran a mano por `organizacionId`, `estado = activo` y rol `maestro`.
   - `PlanesRepository` ya está en `EXCEPCIONES_DE_PLATAFORMA` y la guardia sigue verde. Su motivo dice «los escribe el superadmin», y ahora también lee los destinatarios: el reviewer puede querer ampliar el texto.
5. **Mutación 9 en dos puntos.**
   - `repartirRecordatorio` compara el pendiente del plan con ESE `cambioId`: uno reemplazado no reparte.
   - `destinatariosDelAviso` vuelve a comprobar en los recordatorios: uno repartido y cancelado después no envía.
6. **Reemplazar por la versión vigente.** Es el caso 6 de T11: sin diferencias, pero con pendiente.
   - Sale el correo de guardado con «reemplaza al previsto para…» y la línea «El plan queda igual que el actual.».
   - Los recordatorios se encolan igual.
   - Sin pendiente y sin diferencias no sale nada (R41).
7. **Fallo del emisor.** El aviso intenta con todos los maestros y después falla el trabajo con «fallaron N de M envío(s) a la empresa <id>», sin emails en `last_error`. El reintento reenvía también a los que ya recibieron: es el residuo «al menos una vez» de §16.4.
8. **`programarCambio(…, ahora)`.** El reloj que decide qué recordatorios caen después de ahora es el del servicio (`PlanesService.ahora`), el mismo con el que valida la fecha. Por eso la interfaz gana un parámetro.

### Textos (`lib/planes/mensajes.ts` y la plantilla)
- **Literales del spec, sin cambiar:**
  - R45: «El cambio del plan <nombre> previsto para <fecha> se canceló; tu plan sigue igual.»
  - §16.2: «Este cambio reemplaza al previsto para <fecha anterior>.»
  - Las líneas de topes pasados: `mensajeTopesPasados` de T3.
- **PENDIENTES DE APROBACIÓN HUMANA (propuestos por T12):**
  - Asuntos:
    - `guardado`: «Cambios en el plan <plan>»
    - `recordatorio_7`: «El plan <plan> cambia en 7 días»
    - `recordatorio_1`: «El plan <plan> cambia mañana»
    - `cancelado`: «Se canceló el cambio del plan <plan>»
  - Saludo: «Hola, <nombre>:» (como `bienvenida-maestro`).
  - Primera frase:
    - `guardado` programado: «El plan <plan> de <empresa> cambia a partir del <fecha>.»
    - `guardado` inmediato: «El plan <plan> de <empresa> cambió y los cambios ya rigen.»
    - `recordatorio_7`: «Faltan 7 días: el plan <plan> de <empresa> cambia a partir del <fecha>.»
    - `recordatorio_1`: «Mañana cambia el plan <plan> de <empresa>: rige a partir del <fecha>.»
  - Títulos:
    - «Esto es lo que cambia:»
    - «Con el plan nuevo, tu empresa ya pasa estos topes:»
    - sin líneas: «El plan queda igual que el actual.»
  - Líneas de cambio (`<antes> → <después>`; «sin límite» = tope nulo):
    - «Nombre del plan: <antes> → <después>»
    - «Órdenes por ciclo: <antes> → <después>»
    - «Usuarios activos con el rol <rol>: <antes> → <después>» (el rol de `ROL_LABELS`)
    - «API keys activas: <antes> → <después>»
    - «Se incluye el módulo <módulo>.» / «Deja de incluirse el módulo <módulo>.»
    - «Precio: <antes> → <después>». El precio es «sin precio», «negociable», «<mensual> al mes», «<mensual> al mes, <anual> al año» o «<mensual> al mes, con <pct> % de descuento en el pago anual». Los importes van tal cual, sin símbolo de moneda.
  - Fecha: la forma «7 nov 2026» de `fechaCortaCR` (ver arriba).

### R<n> → test (T12)
| R | Test |
|---|---|
| R41 | `planes-cambio-correos`: «la edición inmediata avisa…» (destinatarios: maestros activos de cada empresa del plan, no el inactivo, ni el admin, ni otra empresa; topes pasados por empresa; `dedupe_key` con la fila `editado`), «una edición sin cambios no encola…», «programar a 10 días avisa al guardar…» y «un fallo del emisor…» (la edición persiste). `plantilla-cambio-plan` (asunto, líneas, fecha, topes). `procesar-jobs-plan-cambio` («plan_aviso_correo…») |
| R42 | `planes-cambio-correos`: «programar a 10 días… a 3 días, solo el de 1 día» (`run_after`, `dedupe_key`, sin empresa) y «el recordatorio va a las empresas que tienen el plan AL SALIR…» (empresa asignada después, topes de ese momento, doble ejecución → un correo por maestro). `plantilla-cambio-plan` («recordatorios») |
| R39 (recordatorios) | `planes-cambio-correos` «R39 (mutación 9)…» (reemplazado y cancelado no reparten; repartido y cancelado después no envía) |
| R45 | `planes-cambio-correos`: «cancelar a mano…», «archivar con un cambio pendiente…» y «reemplazar no envía correo de cancelación…» (un correo por maestro, con la línea) y «un fallo del emisor…» (la cancelación persiste). `plantilla-cambio-plan` («cancelado», «el reemplazo lleva la línea…») |
| R44 | `procesar-jobs-plan-cambio` «R44: los dos de correo son de núcleo»; `modulos-reparto` (guardia) |

### Mutación 9 (§16.7: «el recordatorio no comprueba que siga pendiente»)
- **9a** — `repartirRecordatorio` sin `pendiente.id !== cambio.cambioId` (solo mira si el plan tiene algún pendiente):
  - rojo en «R39 (mutación 9)…»: `expected [ { …(13) } ] to deeply equal []`, «Tests 1 failed | 8 passed (9)»;
  - revertida.
- **9b** — el envío no comprueba (`destinatariosDelAviso(org, null)` también en los recordatorios):
  - rojo en «R39 (mutación 9)…»: `expected [ { …(5) }, { …(5) } ] to deeply equal []`, «Tests 1 failed | 8 passed (9)»;
  - revertida.
- Tras revertir las dos: 0 marcas `MUTACION` en los dos archivos y `planes-cambio-correos` en «Tests 9 passed (9)».

### Salida real
- Una corrida con 28 archivos: «Test Files 28 passed (28) · Tests 476 passed (476)».
  - De SL-24, contra la base SL-24: `planes-cambio-correos`, `planes-cambio-programado`, `planes-historial`, `planes-edicion-en-uso` y `planes-asignacion`.
  - Unit: `planes-service`, `procesar-jobs-plan-cambio`, `plantilla-cambio-plan`, `procesar-jobs-registro`, `jobs-registro` y todo `tests/unit/services/email/`.
  - Integración: `procesar-jobs-geocodificacion` y `procesar-jobs-webhook-estado`.
  - Guardias: `jobs-handler-por-tipo` (**verde**: ya no le falta ningún tipo), `jobs-recurrentes-con-siembra`, `modulos-reparto`, `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `marca-estaticos`, `marca-texto-amarillo`, `docs-marca-heredada` y `lib-no-importa-app`.
- Otras guardias: `credenciales-sin-consola-cruda`, `organizacion-en-modelos`, `superadmin-fuera-de-empresa`, `rls-por-empresa`, `historial-accion-escrituras-cubiertas`, `quitador-comentarios` y `guard-dependencias-aprobadas`. Resultado: «Test Files 7 passed (7) · Tests 183 passed (183)».
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`:
  - primera corrida: 1 error en el test nuevo (`a.payload.tipo` es `unknown`), corregido;
  - segunda: exit 0, sin salida.
- `eslint` sobre los 14 archivos tocados o nuevos: exit 0, sin salida.
- `planes-cambio-correos`, otra vez tras la corrección del tipo: «Tests 9 passed (9)».
- MCP del grafo: no lo usé; exploré con Grep/Read.

Veredicto T12: hecho y en verde, con la guardia `jobs-handler-por-tipo` ya verde. Quedan pendientes de aprobación humana los textos propuestos y el formateador de fecha.

## T8 — Guardias `planes-sin-seed` y `planes-sin-borrado` (con la ampliación de T10)

Archivos nuevos (solo tests; no se tocó código de producción):
- `tests/unit/guards/planes-sin-seed.guardia.test.ts`: lee el archivo de `db:seed` desde `package.json` y sus imports locales; ninguno nombra `plan`, `planId`, `planTopeRol`, `planModulo`, `planRastro`, `planCambioProgramado` ni sus nombres SQL (`plan_id`, `plan_tope_rol`, …). Contraprueba sintética en las dos direcciones (rojo con escritura por modelo, por SQL y por asignación; verde con comentario, `plantillaMensaje`).
- `tests/unit/guards/planes-sin-borrado.guardia.test.ts`: barrido de `lib/` y `app/` sin comentarios.
  - Prohibido en todo archivo: `plan.delete(Many)`, `planRastro.update/updateMany/upsert/delete/deleteMany`, `DELETE FROM`/`TRUNCATE` sobre `"plan"` o `"plan_rastro"` y `UPDATE "plan_rastro"`.
  - Ampliación T10: escrituras sobre `plan_cambio_programado` (delegado `create*`/`update*`/`upsert`/`delete*`, o SQL `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`) solo en `lib/repositories/PlanesRepository.ts`.
  - Contraprueba sintética de los dos detectores (cuerpo sano sin hallazgos; mutaciones detectadas; `planCambioProgramado.deleteMany` no se confunde con `plan.deleteMany`; leer no cuenta) y control positivo sobre el árbol real (el detector sí encuentra `create` y `deleteMany` en `PlanesRepository`).

El código actual no tiene ningún incumplimiento: las dos guardias están en verde sin cambios en producción.

Mapa R → test:
- R32 → `tests/unit/guards/planes-sin-seed.guardia.test.ts`
- R6 (no hay forma de borrar un plan) → `tests/unit/guards/planes-sin-borrado.guardia.test.ts` («ningún archivo … borra un plan …»)
- R29 (`plan_rastro` solo se añade) → `tests/unit/guards/planes-sin-borrado.guardia.test.ts` (mismo caso)
- T10 (solo `PlanesRepository` escribe `plan_cambio_programado`) → `tests/unit/guards/planes-sin-borrado.guardia.test.ts` («solo `PlanesRepository` escribe …»)

Salida real (sin typecheck completo ni suite, por memoria):
- `pnpm exec vitest run tests/unit/guards/planes-sin-seed.guardia.test.ts tests/unit/guards/planes-sin-borrado.guardia.test.ts tests/guards/guard-tests-de-arbol-en-el-gate.test.ts`: «Test Files 3 passed (3) · Tests 18 passed (18)».
- `pnpm exec eslint` sobre los dos archivos: «No issues found», exit 0.
- No existe una guardia que valide el formato de las guardias; corrí `guard-tests-de-arbol-en-el-gate` (la que asegura que el gate rápido corre todo lo que casa con `guard`). Las dos nuevas casan con `guard` por el nombre.
- MCP del grafo: no lo usé; exploré con Grep/Read.

Veredicto T8: hecho; las dos guardias en verde sobre el código actual y en rojo con su contraprueba.

## T9 (2026-10-28) — migración de ida y vuelta + E2E (con la ampliación de T10) — BLOQUEADA en el E2E

**Archivos**
- Nuevo `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts`: base propia `sl24_iv_<rand>`, las cinco migraciones (T1–T3 y las dos de T3b) de ida, los cinco `down.sql` en orden inverso y reaplicadas. El control de posición pide «detrás de `20261027120000_modulos_nucleo` y en orden», no «seguidas» (el defecto de `migracion-sl23-ida-y-vuelta`).
- Nuevo `e2e/_planes-fixture.ts`: `asignarPlanConTope` (plan custom, tope de órdenes `n`, los 4 módulos, `PlanesRepository` real sobre el cliente dueño, actor = superadmin de prueba), `crearOrdenesDirectas`, `ordenesDelCiclo`, `enlazarDistritoDeLaPlantilla` (el distrito del ejemplo de la plantilla a la zona de la empresa), `filaDeCarga` y `csvDeUnaFila` (el `.csv` se genera en memoria: no hace falta ninguna dependencia).
- `e2e/dos-empresas-humo.spec.ts`: punto 8 en la cabecera y un caso nuevo AL FINAL; los casos de SL-17 y SL-23 sin tocar. La tienda de cada empresa la crea `crearUsuarioE2E` y entra con `sesionDe` (`tests/fabricas/e2e.ts`, sin modificarla). A: vista previa con «Tu plan permite 2 órdenes por ciclo», botón deshabilitado, carga real por `page.request.post("/api/ordenes/carga-masiva/chunk")` con la fila en error y el mensaje exacto, y la base sin la remisión. B: confirma, ve la remisión en el resumen y la base la tiene en B.

**R → test**
- R14 → `migracion-sl24-ida-y-vuelta` «R14 — ninguna empresa previa queda con plan ni con ancla».
- R31 → `migracion-sl24-ida-y-vuelta` los dos casos «R31 — …» (tablas, columnas, tipos y valores, funciones, triggers e índices, escritos a mano).
- R8 (refuerzo) → `migracion-sl24-ida-y-vuelta` «R8 — … sin ningún permiso para servi_app; solo el cupo es ejecutable».
- R33 → `e2e/dos-empresas-humo.spec.ts` «SL-24: la tienda de A, al tope de su plan, …» — escrito, NO corrido en verde (ver bloqueo).

**Salida real**
- `pnpm exec vitest run tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` (DATABASE_URL = `servi_logistic_sl24`): `Test Files 1 passed (1)`, `Tests 8 passed (8)`. Después, `prisma migrate status` sobre `servi_logistic_sl24`: «Database schema is up to date!».
- `pnpm exec vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: `Tests 30 passed (30)`.
- `pnpm exec eslint` sobre los tres archivos: sin salida, exit 0. `tsc --noEmit`: ningún error en los tres archivos.
- Base desechable `servi_logistic_sl24_e2e`: creada, `prisma migrate deploy` («All migrations have been successfully applied.») y `pnpm run db:seed` («Seed de catalogos completado …»). `next build` con `NODE_OPTIONS=--max-old-space-size=8192`: exit 0.
- Corrida 1 del E2E (`E2E_PUERTO=3044 pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --reporter=list`): **no carga ningún test**:

```
SyntaxError: ...\lib\planes\tope-error.ts: TypeScript 'declare' fields must first be transformed by @babel/plugin-transform-typescript.
  20 | export class TopeDelPlanAlcanzado extends ConflictError {
> 21 |   declare readonly details: DetalleTopePlan;
   at ..\lib\services\UsuarioService.ts:37
    at Object.<anonymous> (...\tests\fabricas\empresa-y-usuarios.ts:13:1)
    at Object.<anonymous> (...\tests\fabricas\e2e.ts:12:1)
    at Object.<anonymous> (...\e2e\dos-empresas-humo.spec.ts:9:1)
Error: No tests found.
```

- No es solo del humo: `playwright test --list e2e/wallet.spec.ts` da el mismo `SyntaxError` y `Total: 0 tests in 0 files`. El transform de Playwright (babel) no acepta el campo `declare` de `lib/planes/tope-error.ts` (T6/T7a), y cualquier spec que importe `UsuarioService`, `ApiKeyService`, `AprobacionPostulacionService` o `BulkOrdenService` —por `tests/fabricas/e2e.ts`— deja de cargar. Sin arreglarlo, el check `e2e` de CI sale en rojo en los tres grupos.

**Bloqueo**: hace falta cambiar código de producción (`lib/planes/tope-error.ts`, línea 21), fuera de mi encargo. PARO y lo devuelvo. La segunda corrida no se intentó. La base `servi_logistic_sl24_e2e` y el `.next` siguen listos para repetir las dos corridas cuando esté arreglado.

Veredicto T9 (primera pasada): migración de ida y vuelta en verde; E2E escrito pero BLOQUEADO por un `declare` de `lib/planes/tope-error.ts` que impide a Playwright cargar los specs.

### T9 — desbloqueo (2026-10-28, backend_dev)

**Arreglo del `declare`**
- `lib/planes/tope-error.ts`: fuera `declare readonly details: DetalleTopePlan`. En su lugar, un getter `get detalle(): DetalleTopePlan` (vive en el prototipo y devuelve `this.details` con el tipo estrecho). No es `details!:` ni un campo normal: con Babel se inicializaría a `undefined` tras `super()` y pisaría `details`. `details` y `toShape()` no cambian. Ningún consumidor de producción leía `.details` tipado (los servicios y el route solo hacen `instanceof`/`toShape`); los tests siguen leyendo `.details` (`Record<string, unknown>`) sin cambios.
- `tests/unit/planes/tope-error.test.ts`: caso nuevo «`detalle` es el mismo objeto que `details` y no es propio de la instancia (sin campo `declare`, apto para Babel)».
- Barrido del diff de SL-24 (92 `.ts/.tsx` de `git diff origin/dev...HEAD` + árbol de trabajo) buscando `declare`, `const enum`, `namespace` y campos `x!:`: el único era este. Quedan *parameter properties* (`constructor(private readonly prisma …)` en `CupoPlanRepository`, `ModulosEmpresaRepository`, `PlanesRepository`, `ApiKeyService`), que el plugin de TypeScript de Babel sí transforma, y lo demuestra la corrida (el humo carga `ApiKeyService` vía `tests/fabricas/e2e.ts`).

**Salida real (verificación del arreglo)**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm exec eslint lib/planes/tope-error.ts tests/unit/planes/tope-error.test.ts`: sin salida, exit 0.
- `pnpm exec vitest run tests/unit/planes/tope-error.test.ts tests/unit/api/api-key-carga-tope-plan.test.ts tests/unit/services/{api-key-service,aprobacion-postulacion,usuario-service}-tope-plan.test.ts tests/unit/services/bulk-orden-service.tope-plan.test.ts tests/integration/db/plan-topes-*.test.ts tests/integration/db/planes-edicion-en-uso.test.ts` (DATABASE_URL = `servi_logistic_sl24`): `Test Files 11 passed (11)`, `Tests 90 passed (90)`.

**E2E**
- `prisma migrate status` sobre `servi_logistic_sl24_e2e`: «263 migrations found … Database schema is up to date!».
- `next build` (con `NODE_OPTIONS=--max-old-space-size=8192`): exit 0. **Ojo**: hay que construir con `NEXT_PUBLIC_APP_URL` (como hace `gate.yml`; Next la incrusta al compilar). Sin ella, `superadmin-empresas` caso 2 cae: el log del servidor dice `[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL` y el aviso no trae «El correo no está configurado en este entorno.». Reconstruido con `NEXT_PUBLIC_APP_URL=http://localhost:3044`.
- Primera corrida con el build bueno: 17 passed, 1 failed — el caso SL-24 cae en el `beforeAll` propio (`crearOrdenesDirectas`) con `DriverAdapterError: tope_plan {"tope": "ordenes", "maximo": 2, "usados": 2, "pedidas": 1}` al crear la PRIMERA de las dos órdenes directas. Causa medida: la base local tiene `TimeZone = America/Bogota`. `plan_ciclo_ancla_at` se escribe con `now()::timestamp` (hora local de la sesión, UTC−5) y `orden.created_at` lo pone el cliente Prisma en UTC, así que las órdenes de los casos previos del humo (creadas minutos antes) quedan «5 h después» del ancla y cuentan en el ciclo. Consulta sobre la base E2E: `{"tz":"America/Bogota","n":"2026-10-28T23:25:38","maxc":"2026-10-29T04:17:48","futuras":"2"}` (órdenes con `created_at > now()::timestamp`). Con la sesión en UTC: `futuras: 0`.
- **No lo arreglé en producción** (no es inequívoco: toca la migración `20261027130200` —`plan_tope_ordenes`, `plan_cupo_ordenes`— y `PlanesRepository.asignar`/el cálculo de uso, y es una decisión de diseño sobre la escala de tiempo; ver «Hallazgo» abajo). Las dos corridas que cuentan van con la sesión de Postgres en UTC, como el `postgres:17` de CI: `DATABASE_URL=<url de servi_logistic_sl24_e2e>&options=-c%20TimeZone%3DUTC`.
- No se recreó la base antes de la primera corrida contada: `prisma migrate reset --force` lo bloquea Prisma pidiendo consentimiento humano explícito y no lo forcé. La base sigue migrada hasta la última y con catálogos; las corridas previas solo dejaron datos de empresas aleatorias.

Corrida 1 (`E2E_PUERTO=3044 pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --reporter=list`):
```
Running 18 tests using 1 worker
  ✓  16 [aislamiento] › e2e\dos-empresas-humo.spec.ts:336:5 › SL-23: el superadmin dejó A con los 4 módulos y B sin «Ranking»; B no lo ve ni lo abre, A sí …
[humo planes A] vista previa: "Confirmar y cargar 0 nuevas", mensaje del tope visible
[humo planes A] carga real: {"creadas":0,"conError":1,"filas":[{"fila":1,"numRemision":"SL24-A-6caa0e3631","resultado":"error","errores":{"plan":["Tu plan permite 2 órdenes por ciclo. Llevas 2 y esta carga trae 1. Anula órdenes que no vayas a enviar o pide un cambio de plan."]}}]}
[humo planes B] la carga creó SL24-B-b6c743ebc8
  ✓  18 [aislamiento] › e2e\dos-empresas-humo.spec.ts:473:5 › SL-24: la tienda de A, al tope de su plan, no crea por la carga masiva y la de B, sin plan, sí (R33) (7.2s)

  18 passed (3.8m)
```
Corrida 2 (inmediatamente después, misma base):
```
Running 18 tests using 1 worker
  ✓  16 [aislamiento] › e2e\dos-empresas-humo.spec.ts:336:5 › SL-23: el superadmin dejó A con los 4 módulos y B sin «Ranking»; B no lo ve ni lo abre, A sí …
[humo planes A] vista previa: "Confirmar y cargar 0 nuevas", mensaje del tope visible
[humo planes A] carga real: {"creadas":0,"conError":1,"filas":[{"fila":1,"numRemision":"SL24-A-e987f83ab2","resultado":"error","errores":{"plan":["Tu plan permite 2 órdenes por ciclo. Llevas 2 y esta carga trae 1. Anula órdenes que no vayas a enviar o pide un cambio de plan."]}}]}
[humo planes B] la carga creó SL24-B-202dc955a8
  ✓  18 [aislamiento] › e2e\dos-empresas-humo.spec.ts:473:5 › SL-24: la tienda de A, al tope de su plan, no crea por la carga masiva y la de B, sin plan, sí (R33) (14.5s)

  18 passed (3.6m)
```
Las dos: 0 failed, 0 skipped, 0 flaky (18 = 10 de `plataforma-vacia` por `dependencies` + 8 del humo, SL-17 y SL-23 incluidos).

**Hallazgo (para el leader/reviewer, sin arreglar)**: el ancla del ciclo (`now()::timestamp`) y `orden.created_at` (UTC desde Prisma) solo están en la misma escala si la sesión de Postgres está en UTC. En una base con otra `TimeZone` (la local de desarrollo: `America/Bogota`), las órdenes de las últimas 5 h antes de asignar el plan cuentan en el primer ciclo y el tope se dispara antes. CI (`postgres:17`) y Supabase van en UTC, por eso no se ve allí. Arreglo probable: `now() AT TIME ZONE 'UTC'` en lugar de `now()::timestamp` en `20261027130200` (y en `PlanesRepository`), o fijar `TimeZone=UTC` en la conexión; requiere decisión de diseño y migración.

Veredicto T9: `declare` arreglado y E2E en verde dos veces seguidas (con la sesión en UTC); queda abierto el hallazgo de zona horaria del ancla.
