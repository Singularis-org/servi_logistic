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

## Tanda 3 — T5, T6 y T7 (2026-11-05)

### Commits
- `a226affb` feat(SLT-86): T5 costo base, tramo, siguiente cobro e historial.
- `1a6c37ca` feat(SLT-86): T6 costeo y consumo por período.
- `124e58c0` feat(SLT-86): T7 rastro, versión y mensajes.

### Archivos
- **T5**, modificados: `lib/planes/cobro.ts` (`montoDelPeriodo` con factor y descuento, `costoDelTramo`,
  `costoDelPeriodoEnCurso`, `siguienteCobro(tipo, ahora, pendiente)`, `cobroDelPlan` con la forma de T2 y
  `tipoCobroDelHistorial` con `desde`), `lib/types/planes.ts` (`AsignacionDePlan.desde`),
  `tests/unit/planes/cobro.test.ts`, `tests/unit/services/planes-service-lecturas.test.ts` (solo la lista de
  claves de una asignación). Creado: `tests/unit/planes/cobro-periodo.test.ts`.
- **T6**, modificados: `lib/planes/costeo.ts` (recibe el costo del período ya calculado; sin
  `anualNoAplicaAlCosto`), `lib/planes/consumo.ts` (`PlanConUsoLeido` con `entrada`, `precioDelPeriodo` y
  `pendiente`, sin `ancla` ni `cortoDesde`; sin fila de órdenes; `ordenesDelPeriodo`; `reinicioDelCiclo(tipo,
  ahora)`), `lib/planes/ciclo.ts` (comentario), `lib/planes/mensajes.ts` (`textoDelPrecio` y `base.periodo`,
  adelantados porque `planConConsumo` los llama), tests `costeo`, `costeo-porcentual`,
  `costo-concreto-porcentual`, `consumo`, `mensajes-costo-porcentual`. Creado:
  `tests/unit/planes/costeo-periodo.test.ts`.
- **T7**, modificados: `lib/planes/rastro.ts` (claves `descuento_<periodo>`, `precio` solo con el mensual,
  topes sin órdenes), `lib/planes/mensajes.ts` (líneas de descuentos y del `tope_ordenes_ciclo` de la
  migración; topes viejos con órdenes), tests `rastro`, `rastro-costeo`, `rastro-costo-porcentual` y
  `tests/unit/services/email/plantilla-cambio-plan.test.ts`. Creados: `tests/unit/planes/rastro-periodo.test.ts`
  y `tests/unit/planes/mensajes-periodo.test.ts`.
- `tasks.md`: T5, T6 y T7 marcadas.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R7 | `costeo-periodo` (`ordenesDelPeriodo` = `costeo.ordenes`, sin fila de órdenes) |
| R9 | `cobro-periodo` (factores, 100.01 → 50.01, 50 000 → 100 000 y 600 000, sin precio en los cuatro tipos) |
| R10 | `cobro-periodo` (95 000.00, 0.00, 540 000.00, un descuento no toca otro período, un solo redondeo) |
| R12 | `cobro-periodo` (22 000.00, 6 200.00, 93 698.63; tramo con descuento; período completo) |
| R15 (TS) | `costeo-periodo` (la base sale de `precioDelPeriodo`, no del precio vigente) |
| R24 | `mensajes-periodo` («{mensual} / mes», «Descuento {tipo}: …» en el orden de los tipos, sin órdenes) |
| R27 | `cobro-periodo` (siguiente cobro por tipo y con pendiente; período desde–hasta y tramo; anual con el 1 de enero), `consumo` (reinicio), `costeo-periodo` |
| R28 | `costeo-periodo` (fijo y porcentual, período completo y tramo, sin precio, sin aviso del anual), `costeo`, `costeo-porcentual` |
| R30 | `cobro-periodo` (filas nuevas con tipo y fecha; filas viejas igual), `rastro-periodo` (precio con anual, topes con órdenes, fila de la migración), `mensajes-periodo` |
| R31 | `rastro-periodo` (antes y después por descuento, sin cambios no escribe, sin precio deja los descuentos en null, líneas de detalle, «Mi plan» y correo), `plantilla-cambio-plan` |

### Salida real
- Tests, por ruta (`pnpm exec vitest run <archivos>`): 14 archivos, 221/221.
  - `cobro-periodo` 34, `cobro` 15, `costeo-periodo` 12, `costeo` 23, `costeo-porcentual` 19,
    `costo-concreto-porcentual` 6, `consumo` 30, `mensajes-costo-porcentual` 15, `mensajes-periodo` 10,
    `rastro-periodo` 12, `rastro` 9, `rastro-costeo` 9, `rastro-costo-porcentual` 13, `plantilla-cambio-plan` 14.
- eslint de todos los archivos tocados: 0 errores y 0 avisos.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): **230 errores en 54 archivos** (antes de la tanda: 277).
  Ninguno en `cobro.ts`, `costeo.ts`, `consumo.ts`, `rastro.ts`, `mensajes.ts`, `ciclo.ts`, `lib/types/planes.ts`
  ni en los tests de `tests/unit/planes/` y del correo.
  - Nuevos por el contrato de `PlanConUsoLeido` (T9): `MiPlanService.ts` (1), `PlanesRepository.ts` (`ancla`),
    `plan-de-la-empresa-porcentual` (1), `planes-service-lecturas` (+1), `mi-plan-service`.
  - Nuevos por `AsignacionDePlan.desde` y la forma de `CobroDelPlan`/`CosteoDelCiclo` (frontend, T11/T12):
    `PlanEmpresa`, `PlanEmpresaTipoCobro`, `PlanEmpresaCostoPorcentual`, `MiPlanModule`, `ConsumoDelPlanCosteo`,
    `ConsumoDelPlanPorcentual`, `PlanVistaCosteo`, `planes-lecturas-plataforma` (+1 o +2 cada uno).

### Tests retirados
- En `cobro.test.ts`, el bloque D8 (siguiente cobro en el aniversario del ancla, 7 casos) y el D9 (forma
  `montoPeriodo`): R27 los sustituye por el período de calendario y viven en `cobro-periodo`.
- En `consumo.test.ts`, los dos bloques de `reinicioDelCiclo` por ancla y del ciclo corto (SLT-58 R5, R40; 11 casos):
  el reinicio es ahora el fin del período de calendario (R27) y el ciclo corto se retiró (P4 = a). Los sustituye
  el bloque «SLT-86 — reinicioDelCiclo». La fila «órdenes del ciclo» sale de `filasDeConsumo` (R8).
- En `costeo.test.ts` y `costeo-porcentual.test.ts`, los casos de `anualNoAplicaAlCosto` (R28 lo retira),
  sustituidos por «un descuento no toca el costo por orden».
- En `plantilla-cambio-plan.test.ts`, la línea «Órdenes por ciclo» y el tope pasado de órdenes (R8).

### Avisos de la tanda
- **Rastro (design §5.4).** `precio` guarda solo `{tipo, mensual}` y cada descuento va en `descuento_<periodo>`
  (`DescuentoPeriodo | null`). Un alta trae las cuatro claves. `PlanDetalle.lineasDelRastro` (T11) tiene que
  pasar `descuento_*` y `tope_ordenes_ciclo` a `lineasDeCambioDelPlan` y pintar los descuentos del alta.
- **Textos elegidos** donde §7.1 no fija el detalle (a confirmar):
  - el tipo en minúscula: «Descuento anual: 10.00 %»;
  - las partes del precio unidas con « · »: «50000.00 / mes · Descuento anual: 10.00 %»;
  - el lado vacío de un descuento en «qué cambia»: «sin descuento»;
  - las filas viejas: «15000.00 / mes · 150000.00 al año».
  - No cambié los textos de SLT-83 «Cobrado en el ciclo» ni «Total del ciclo hasta hoy»: §7.1 no los toca.
- **R30, fecha de efecto:** `tipoCobroDelHistorial` devuelve `desde` (el primer segmento de `valor_nuevo` si es
  una fecha) y `AsignacionDePlan` gana `desde: string | null`. Lo pinta T11. Las filas de SLT-58 con solo la
  fecha de inicio también la devuelven.
- **Contrato para T9:** `PlanConUsoLeido` pide `entrada`, `precioDelPeriodo` (`precio_del_periodo` de
  `plan_de_la_empresa`) y `pendiente` (`cambio_empresa`, sin actor). `MiPlanRepository`,
  `PlanesRepository.planDeEmpresa` y los dobles de `mi-plan-service` y `planes-service-lecturas` aún no lo
  arman. Esos dos tests de servicio fallan en ejecución (11 casos) hasta T9.
- `inicioDelSiguienteCiclo` sigue en `ciclo.ts`. `consumo.ts` ya no la usa; queda solo para la vista previa de
  `PlanesRepository` (línea 554), y se borra en T9.
- `ordenesYaPasadas` (aviso de órdenes de SLT-58) sigue en `mensajes.ts` porque lo importa
  `AvisosDeTopes.tsx`; se borra cuando T12 quite ese aviso (R8).
- Grafo MCP: no lo consulté; trabajé con Grep/Read.
