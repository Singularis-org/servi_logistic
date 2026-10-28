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
