# impl SLT-86 — Planes: período de facturación de calendario por empresa y sin tope de órdenes

Bitácora del implementer. Se completa por tandas; T13 la cierra con el mapa completo y los tests retirados.

## Tanda 1 — T0 y T1 (2026-11-05)

### Commits
- `229ddce1` merge de `origin/dev` (SLT-83 incluida, `8eb66b88`), sin conflictos.
- `0999df40` docs(SLT-86): T0 integra dev tras SLT-83 (§9, §12, archivos esperados).
- `e0362b2c` feat(SLT-86): T1 migración y esquema del período de facturación.

### Archivos
- T0: `specs/SLT-86-planes-periodo-facturacion/design.md` (§9, §12) y `tasks.md` (35 tests añadidos a «Archivos
  esperados»; T0 marcada).
- T1, creados: `db/migrations/20261106120000_plan_periodo_facturacion/migration.sql`, `down.sql` y
  `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.
- T1, modificados: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts` y `tasks.md` (T1 marcada).

### T0: SLT-83 contra el spec
- R23 y R24 de SLT-83 se cuentan en SQL con `plan_cobro_del_ciclo(org, p_desde)`. Esa función se llama desde
  `plan_de_la_empresa` y desde `PlanesRepository.planDeEmpresa`.
- Basta pasar el inicio del período de calendario en `p_desde`. No cambia ningún requisito.
- El timestamp `20261106120000` queda detrás de `20261104150200`, la última migración de dev.

### Mapa R → test (parcial, de esta tanda)
Todos los casos están en `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.

| R | Qué cubre |
|---|---|
| R33 | P3 rechaza (plan y versión pendiente) sin cambiar nada; conversión del precio anual a descuento anual con el mismo coste; versiones pendientes; orden y `down.sql` |
| R34 | Rastro `editado` «Sistema (migración SLT-86)»; se retiran el trigger, `plan_cupo_ordenes` y la columna |
| R35 | Todas las empresas con plan entran hoy a las 00:00 sin ciclo corto; `plan_de_la_empresa` da el tramo hasta el 1 de enero |
| R36 | Seis negativas del `down` con la foto intacta; el `down` limpio restaura esquema, md5 de funciones, ACL, triggers y RLS; la vuelta a subir es idempotente; cuerpos literales |
| R1, R10, R32 (parte de base) | Los CHECK dan 23514; `servi_app` recibe 42501 en las dos tablas nuevas |

### Salida real
- Base `servi_logistic_slt86` en localhost:5432: creada; migraciones y seed aplicados.
  - El `db:rollback` de la migración nueva funciona.
  - Se vuelve a aplicar con `migrate deploy` y la base queda migrada.
- `prisma generate`: ok. `prisma migrate diff` entre la base y el esquema da vacío.
- `migracion-slt86-ida-y-vuelta.test.ts`: 1 archivo, 15 passed, 0 skipped.
- `test:guardias`: 329 archivos ok y 2 rojos; 4613 tests ok, 4 rojos, 4 skipped.
  - `dependencias-declaradas-presentes.guardia` está en `tests/baseline-rojos.json`.
  - `filtros-url-r25` pasa cuando se corre solo; falló por carga.
  - Corridas aparte, `organizacion-en-modelos`, `unicos-por-empresa`, `fk-misma-empresa`, `rls-por-empresa`,
    `planes-sin-borrado` y `planes-sin-seed` dan 6 archivos y 70/70.
- eslint de los TS tocados: 0 errores.
- typecheck: **48 errores esperados**, todos de columnas que se retiran y que limpian T4, T8 y T9.
  - Por columna: `topeOrdenesCiclo` 18, `planCicloCortoDesdeAt` 13, `precioAnual` 4, `descuentoAnualPct` 4, más
    errores derivados.
  - Archivos: `PlanesRepository.ts` (10), `planes-catalogo` (7), `planes-cambio-programado` (6),
    `e2e/planes-superadmin.spec.ts` (6), `planes-acceso-servi-app` (5), `planes-asignacion-inicio-ciclo` (3),
    `planes-crear-custom-asigna` (3), `planes-cambio-correos` (2), `plan-topes-concurrencia` (2), y uno en cada
    uno de `_fixtures/planes.ts`, `mi-plan-repository`, `plan-de-la-empresa` y `planes-cambiar-tipo-cobro`.

### Avisos de la tanda
- T1 reescribe `plan_de_la_empresa` (§3.3), porque la migración borra columnas que su cuerpo viejo leía. A T3 le
  toca probarla.
- `MiPlanRepository`, `consumo.ts` y `costeo.ts` todavía esperan `precio_anual`, `tope_ordenes_ciclo` y
  `ciclo_corto_desde` en tiempo de ejecución. Los arreglan T5, T6 y T9.
- `plan_precio_historial.desde_at = -infinity` no se puede leer como `DateTime` de Prisma. T9 lo lee con SQL crudo
  o con `::text`.
- Formatos elegidos donde §1.2 no dice nada:
  - en `descuentos`, los importes van como texto, con la forma de `PrecioPlan.descuentos`;
  - `precio_del_periodo` es `{precio_mensual, descuentos}`;
  - hay un CHECK extra para los cuatro tipos en `plan_cambio_tipo_cobro`.
- **Abierto:** una empresa sin plan pero con una primera asignación pendiente (P4 = a) recibe NULL de
  `plan_de_la_empresa`, así que «Mi plan» no le muestra el cambio pendiente (R26). Lo deciden T3/T9.
- Entorno: hubo que correr `pnpm install --frozen-lockfile --ignore-scripts` en el worktree. No entró ninguna
  dependencia nueva y el lockfile quedó igual.

## Tanda 2 — T2, T3 y T4 (2026-11-05)

### Commits
- `d6879c14` feat(SLT-86): T2 tipos y esquemas zod del período.
- `8beddc35` feat(SLT-86): T3 período de calendario SQL y TS.
- T4: el commit `feat(SLT-86): T4 retira el tope de órdenes` (hash en el informe al leader).

### Archivos
- **T2**, modificados: `lib/types/planes.ts`, `lib/types/consumo-plan.ts`. Creado:
  `tests/unit/types/planes-schema-periodo.test.ts`.
- **T3**, creados:
  - `db/migrations/20261106130000_plan_de_la_empresa_pendiente_sin_plan/{migration,down}.sql`;
  - `tests/unit/planes/ciclo-periodo.test.ts`, `tests/integration/db/plan-ciclo-periodo.test.ts`;
  - `tests/integration/db/_fixtures/periodo-calendario.ts` (la tabla que comparten TS y base).
- **T3**, modificados: `lib/planes/ciclo.ts`, `tests/integration/db/_fixtures/planes.ts` (sin `CASOS_CICLO`),
  `requirements.md` (R26 y decisión del 2026-11-05), `design.md` (§3.2, §3.3, §7.1), `tasks.md`.
- **T3**, retirados: `tests/unit/utils/ciclo-plan.test.ts`, `tests/integration/db/plan-ciclo.test.ts`,
  `tests/integration/db/plan-ciclo-corto.test.ts`, `tests/integration/db/_fixtures/ciclo-corto.ts`.
- **T4**, borrados: `lib/repositories/CupoPlanRepository.ts`, `lib/interfaces/repositories/ICupoPlanRepository.ts`.
- **T4**, modificados:
  - `lib/services/BulkOrdenService.ts`, `app/api/ordenes/carga-masiva/chunk/route.ts`,
    `app/api/ordenes/api-key/carga/route.ts`;
  - `lib/planes/tope-error.ts`, `lib/planes/mensajes.ts` (solo el tipo `TopeDelPlan` y `TopePasado`);
  - `lib/repositories/PlanesRepository.ts`, `lib/repositories/MiPlanRepository.ts` (un comentario);
  - tests: `tope-error.test.ts`, `plan-maestro-sin-tope.test.ts`, `plan-topes-api-keys.test.ts`,
    `_fixtures/planes.ts`, `planes-asignacion-inicio-ciclo.test.ts` (solo el cupo), `tests/unit/db/sqlstate.test.ts`
    (un comentario).
- **T4**, creado: `tests/integration/db/plan-sin-tope-ordenes.test.ts`.
- **T4**, retirados: `plan-topes-ordenes`, `plan-topes-concurrencia`, `carga-composition-root-cupo`,
  `api-key-carga-tope-plan` y `bulk-orden-service.tope-plan`.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R1 | `planes-schema-periodo` (4 tipos; otro valor o ausente = `validation_error` en `tipoCobro`) |
| R4 | `ciclo-periodo`, `plan-ciclo-periodo` (tabla de bordes de los 4 tipos) |
| R5 | `ciclo-periodo`, `plan-ciclo-periodo` (tramo con entrada: ejemplos de R5, R12 y R35) |
| R6 | `plan-ciclo-periodo`: misma tabla, base = esperado = TS; meses de 28–31, bisiestos, 31 dic/1 ene, borde exacto, ±1 ms |
| R7 | `plan-ciclo-periodo`: `plan_de_la_empresa` cuenta las vivas desde el inicio del período o del tramo; las del período anterior no |
| R8 | `planes-schema-periodo` (`ordenesPorCiclo` = `validation_error`); `plan-sin-tope-ordenes` (pantalla, carga masiva, API key y `dryRun` entran; SL024 de `adminTienda` sigue); `plan-maestro-sin-tope` R6 |
| R10 | `planes-schema-periodo` (formas, rangos y error en `precio.descuentos.<periodo>.<campo>`) |
| R11 | `planes-schema-periodo` («sin precio» con descuentos = `validation_error` en `precio`) |
| R12 (días) | `ciclo-periodo` (`diasDelTramo`, `diasDelPeriodo`: 6/15, 22/31, 57/365) |
| R16 | `planes-schema-periodo` (fecha obligatoria al cambiar el tipo, forma de día; el rango es del servicio, T9) |
| R22 (forma) | `planes-schema-periodo` |
| R25 (fecha por defecto) | `ciclo-periodo` (`fechaDeEfectoPorDefecto` y su rango) |
| R26 sin plan, R32 | `plan-ciclo-periodo` (`{sin_plan, cambio_empresa}` sin actor; NULL sin pendiente; 42501 con otra empresa) |
| R34 | `plan-sin-tope-ordenes` (sin columna, trigger ni función del cupo) |

### Salida real
- `planes-schema-periodo`: 47/47. `ciclo-periodo`: 117/117. `plan-ciclo-periodo`: 108/108, sin saltos.
- Migración `20261106130000` en `servi_logistic_slt86`:
  - `migrate deploy` ok;
  - `db:rollback` ok: el md5 de `plan_de_la_empresa` vuelve a `280e1a91…`, sin «sin_plan», y la ACL queda igual;
  - otro `deploy` deja `304a8998…`.
- Guardias de esquema (`organizacion-en-modelos`, `unicos-por-empresa`, `fk-misma-empresa`, `rls-por-empresa`,
  `planes-sin-borrado`, `planes-sin-seed`, `historico-sin-migracion`) más los tres tests de T2/T3: 10 archivos,
  352/352.
- T4, por archivo: 17 archivos, 573/573, sin saltos.
  - Los 5 de `bulk-orden-service*`, las 3 rutas de carga, `cobro-plataforma-cargos`, `plan-sin-tope-ordenes`,
    `plan-maestro-sin-tope`, `plan-topes-api-keys`, `tope-error`, `sqlstate` y los tres de T2/T3.
- `vitest related` de los archivos de T4 no terminó en 590 s (arrastra suites lentas como demo-qa). Antes de
  cortarse marcó dos rojos:
  - `historial-accion-atomicidad`, que está en el baseline;
  - `planes-asignacion-inicio-ciclo`, 11/11 por su propia fixture con la forma vieja de T2 (`ordenesPorCiclo`,
    `anual`), que es de T8.
- `test:guardias`: 331 archivos, 2 rojos; 4615 tests ok, 5 rojos y 1 saltado.
  - `dependencias-declaradas-presentes` está en el baseline.
  - `catalogo-postgres-acota-esquema` dio rojo por dos consultas de catálogo sin esquema en
    `migracion-slt86-ida-y-vuelta.test.ts` (de T1). Se acotaron en un commit aparte; la guardia y ese test
    vuelven a verde (22/22).
- eslint de todos los archivos tocados: 0 errores y 0 avisos.
- typecheck: 277 errores. Ninguno nombra el cupo; el detalle está en el informe de la tanda.

### Avisos de la tanda
- R26 sin plan: se eligió `plan_de_la_empresa` (design §3.3) con la migración nueva `20261106130000`. A T9 le toca
  leer `{sin_plan, cambio_empresa}` en `MiPlanRepository` y ampliar `MiPlanResult`; a T12, la pantalla.
- `inicioDelSiguienteCiclo` sigue en `ciclo.ts` hasta T6/T9, que son quienes la usan.
- `PlanesRepository.planDeEmpresa` ya cuenta las órdenes del período y lo cobrado con `plan_inicio_ciclo_de`, que
  era trabajo de T9 (§12). Hubo que adelantarlo porque `usoDe` dejó de contar órdenes. Su `select` de
  `planCicloCortoDesdeAt` sigue ahí para T9.
- `asignarEnTx` todavía escribe `plan_ciclo_corto_desde_at`, que no existe desde T1. Lo arregla T8.
- `docs/architecture.md` (línea 231) todavía nombra `inicioDelCicloEnCurso` y `_fixtures/ciclo-corto.ts`, que se
  retiraron. Lo tiene que actualizar quien mantenga el perfil.
