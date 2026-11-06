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

## Tanda 4 — T8 y T9 (2026-11-05)

### Commits
- `01c6d01f` feat(SLT-86): T8 cambios de empresa con fecha de efecto y trabajos.
- T9: el commit `feat(SLT-86): T9 ediciones de precio con fecha, lecturas y servicios` (hash en el informe al leader).
  Esta bitácora va en él.

### Archivos
- **T8**, creados:
  - `db/migrations/20261106140000_plan_aplicar_cambio_empresa_enum/{migration,down}.sql`: el valor
    `plan_aplicar_cambio_empresa` de `job_tipo`;
  - `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/unit/planes/jobs-cambio-empresa.test.ts`.
- **T8**, modificados:
  - `db/schema.prisma` (el valor del enum), `lib/repositories/PlanesRepository.ts`,
    `lib/interfaces/repositories/IPlanesRepository.ts`;
  - `lib/services/PlanesService.ts`, `lib/interfaces/services/IPlanesService.ts`, `lib/types/planes.ts`;
  - `lib/planes/jobs-cambio-plan.ts`, `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`;
  - `lib/planes/ciclo.ts` (sin `inicioDelSiguienteCiclo` ni `anclaDeLaFechaElegida`; con `rangoDeLaFechaDeEfecto`) y
    `lib/planes/mensajes.ts` (dos textos);
  - `docs/architecture.md` (la línea del ciclo, ahora el período de facturación) y `tasks.md` (T8 marcada);
  - tests: `planes-asignacion`, `planes-asignacion-inicio-ciclo`, `planes-cambiar-tipo-cobro`,
    `planes-crear-custom-asigna`, `planes-service-tipo-cobro`, `planes-service-inicio-ciclo`,
    `planes-service-crear-custom`, `planes-service-asignar-costo`, `planes-repository-tipo-cobro`, `ciclo-periodo`,
    `procesar-jobs-plan-cambio`, `procesar-jobs-registro`, `procesar-jobs-geocodificacion`, `procesar-jobs-webhook-estado`.
- **T9**, creados: `lib/repositories/_shared/precio-del-periodo.ts`; tests `plan-precio-historial`,
  `plan-descuento-periodo`, `plan-de-la-empresa-periodo` (integración) y `planes-service-periodo` (unit).
- **T9**, modificados:
  - `lib/repositories/PlanesRepository.ts` (historial de precio en `crear`, `editar` y `aplicarCambioProgramado`;
    `planDeEmpresa` con entrada, precio del período y pendiente), `lib/repositories/MiPlanRepository.ts`,
    `lib/interfaces/repositories/IMiPlanRepository.ts`, `lib/services/MiPlanService.ts`, `lib/services/PlanesService.ts`
    (`editar` con R22), `lib/repositories/EmpresasPlataformaRepository.ts`, `lib/actions/planes.ts`
    (`cancelarCambioEmpresaAction`), `lib/types/consumo-plan.ts`, `lib/types/planes.ts`, `lib/planes/rastro.ts`
    (`cambiaElPrecio`), `lib/planes/mensajes.ts`, `lib/interfaces/services/IPlanesService.ts`;
  - fixtures `_fixtures/planes.ts` (`crearPlan` siembra su fila «desde siempre») y `_fixtures/cobro-porcentual.ts`;
  - tests de integración: `mi-plan-repository`, `plan-de-la-empresa`, `plan-de-la-empresa-costeo`,
    `plan-de-la-empresa-porcentual`, `planes-acceso-servi-app`, `planes-cambio-correos`, `planes-cambio-programado`,
    `planes-catalogo`, `planes-costeo-escritura`, `planes-edicion-en-uso`, `planes-historial`,
    `planes-lecturas-plataforma`, `cobro-plataforma-plan`, `plan-costo-porcentual-escritura`,
    `cobro-plataforma-porcentual`, `planes-cambio-empresa` (el conteo de R14, por empresa);
  - unit: `planes-service`, `planes-service-costeo`, `planes-service-costo-porcentual`, `planes-service-lecturas`,
    `planes-service-asignar-costo`, `mi-plan-service`, `planes.composition-root`, `planes-repository-tipo-cobro`;
  - guardia `historial-accion-escrituras-cubiertas` (el censo: el productor de `plan_asignado` y
    `plan_tipo_cobro_cambiado` es ahora `aplicarEnTx`);
  - `tasks.md` (T9 marcada) y esta bitácora.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R1 | `planes-cambio-empresa` (tipo fuera de los cuatro o ausente = `validation_error` en `tipoCobro`; 23514 en la columna y en el pendiente), `planes-crear-custom-asigna` (el CHECK admite los cuatro) |
| R2 | `planes-cambio-empresa` (primera asignación quincenal pasada, hoy y futura; antes de la fecha, altas sin tope y módulos de antes; al aplicar, plan, módulos, topes y entrada), `planes-asignacion-inicio-ciclo`, `planes-service-inicio-ciclo` |
| R3 | `planes-service-periodo` (asignar con fecha, primera asignación futura, cambiar tipo, cancelar cambio, crear custom, editar y programar precio: `forbidden` sin llamadas) |
| R7 | `plan-de-la-empresa-periodo` (desde la entrada; el período anterior no cuenta; borde exacto), `plan-de-la-empresa` |
| R13 | `plan-descuento-periodo` (cuatro descuentos y cuatro tipos: cargo 100.00 «plan»), `cobro-plataforma-porcentual` (R10 de SLT-83 con un descuento de período) |
| R14 | `planes-cambio-empresa` (asignar, pendiente y aplicar), `plan-descuento-periodo` (crear, asignar y editar descuentos) |
| R15 | `plan-precio-historial` (caso base del 5: quincenal desde el 16, anual desde el 1 de enero; borde exacto; hoy; futura aplicada por el trabajo; programada y cancelada; nadie se reancla), `mi-plan-repository` (precio del período ≠ vigente) |
| R16 | `planes-service-periodo` (rango hoy…hoy + 12 meses, obligatoria con plan, no sin plan), `planes-service-tipo-cobro`, `planes-service-crear-custom`, `planes-cambio-empresa`, `ciclo-periodo` (`rangoDeLaFechaDeEfecto`) |
| R17 | `planes-cambio-empresa` (mensual → quincenal con plan nuevo el 10: antes lo viejo; al aplicar, tramo 10–15 con 6/15 = 6 200.00 y luego quincenas, en la base y en TS) |
| R18 | `planes-cambio-empresa` (hoy con tope pasado = `tope_excedido`; futura con aviso; al aplicarse rige y la siguiente alta da SL024; hoy sin topes se aplica en el acto), `planes-asignacion` |
| R19 | `planes-cambio-empresa` (reemplazo con id nuevo y trabajo viejo inerte; idéntico cancela sin historial; sin pendiente `cambio: false`; «Cancelar cambio»), `planes-service-periodo`, `planes-repository-tipo-cobro` |
| R20 | `planes-cambio-empresa` (una sola vez, `aun_no_rige`, actor del que programó, `plan_tipo_cobro_cambiado` con `fecha · tipo`, barrido), `jobs-cambio-empresa` (registro, núcleo, en su empresa, handler, segunda pasada del barrido) |
| R21 | `planes-cambio-empresa` (archivar cancela los pendientes hacia el plan, también una primera asignación; los demás siguen) |
| R22 | `planes-service-periodo` (sin fecha, pasada, hoy en el acto, futura programada; «10» = «10.00»; edición sin precio con la regla de SLT-58), `plan-precio-historial` (sin fecha y pasada no escriben) |
| R26 | `plan-de-la-empresa-periodo` (pendiente con plan en «Mi plan»; sin plan: `plan: null` y `pendienteSinPlan`, también en el detalle), `mi-plan-service`, `planes-service-lecturas` |
| R27 | `plan-de-la-empresa-periodo` (período y tramo, `ciclo_inicio`/`ciclo_fin`, reinicio, siguiente cobro = fecha del pendiente), `mi-plan-service`, `planes-service-lecturas` |
| R28 | `plan-de-la-empresa-periodo` (fijo: 50 000.00 + 2 × 100), `plan-de-la-empresa-porcentual` (base del período + cobrado) |
| R29 | Solo el repositorio: `EmpresasPlataformaRepository` valida el tipo con los cuatro valores (`empresas-plataforma-plan` sigue en verde). El test de R29 es de componente (T12). |
| R31 | `plan-descuento-periodo` (alta con las cuatro claves; antes y después por descuento; sin cambios no escribe), `planes-historial` |
| R32 | `plan-de-la-empresa-periodo` (sin actor; otra empresa = 42501), `plan-descuento-periodo` y `planes-acceso-servi-app` (`servi_app` no lee ni escribe las dos tablas nuevas) |

### Salida real
- Base `servi_logistic_slt86`: `migrate deploy` de `20261106140000` ok; `db:rollback` ok (un trabajo de prueba de ese tipo
  se borra, el valor sale de `job_tipo` y `plan_cambios_vencidos` sigue); otro `deploy` la deja aplicada.
  `prisma generate` ok.
- Tests por ruta (`pnpm exec vitest run <archivos>`, integración con `DATABASE_URL`): 46 archivos, 919 casos, 0 saltados.
  - Integración: `plan-precio-historial` 8, `plan-descuento-periodo` 7, `plan-de-la-empresa-periodo` 6,
    `planes-cambio-empresa` 12, `mi-plan-repository` 5, `plan-de-la-empresa` 7, `plan-de-la-empresa-costeo` 7,
    `plan-de-la-empresa-porcentual` 7, `planes-acceso-servi-app` 6, `planes-cambio-correos` 9,
    `planes-cambio-programado` 10, `planes-catalogo` 14, `planes-costeo-escritura` 4, `planes-edicion-en-uso` 7,
    `planes-historial` 7, `planes-lecturas-plataforma` 3, `cobro-plataforma-plan` 16, `plan-costo-porcentual-escritura` 16,
    `cobro-plataforma-porcentual` 23, `cobro-plataforma-porcentual-importe` 18, `empresas-plataforma-cobro-porcentual` 5,
    `empresas-plataforma-plan` 4, `planes-cambiar-tipo-cobro` 11, `planes-asignacion` 11,
    `planes-asignacion-inicio-ciclo` 8, `planes-crear-custom-asigna` 8, `plan-ciclo-periodo` 108,
    `migracion-slt86-ida-y-vuelta` 15, `procesar-jobs-geocodificacion` 5, `procesar-jobs-webhook-estado` 4.
  - Unit: `planes-service-periodo` 69, `planes-service` 80, `planes-service-costeo` 39,
    `planes-service-costo-porcentual` 26, `planes-service-lecturas` 34, `planes-service-tipo-cobro` 29,
    `planes-service-inicio-ciclo` 30, `planes-service-crear-custom` 26, `planes-service-asignar-costo` 24,
    `mi-plan-service` 15, `planes.composition-root` 8, `planes-repository-tipo-cobro` 5, `jobs-cambio-empresa` 11,
    `procesar-jobs-plan-cambio` 26, `procesar-jobs-registro` 7, `ciclo-periodo` 119.
  - En la corrida conjunta cayeron dos casos que cuentan la tabla ENTERA de movimientos (`plan-de-la-empresa-porcentual`
    R25, de SLT-83, y mi R14 de `plan-descuento-periodo`): otro archivo confirmó filas a la vez. Mi R14 y el de
    `planes-cambio-empresa` cuentan ahora por empresa; el de SLT-83 pasa solo (7/7) y queda como aviso.
- `test:guardias`: 331 archivos; 327 ok, 3 saltados y 1 rojo (`dependencias-declaradas-presentes`, en el baseline);
  4592 casos ok. Antes de cerrar dieron rojo tres guardias, ya en verde: `historial-accion-escrituras-cubiertas` (el
  censo), `superficie-de-uso` (`@sin-superficie` en `cancelarCambioEmpresaAction` hasta T11) y
  `consultas-concurrentes-en-transaccion` (dos relaciones hermanas en `planDeEmpresa`: el nombre del plan que entra va en
  otra consulta).
- Guardias de esquema, tras la migración de T8 (`organizacion-en-modelos`, `unicos-por-empresa`, `fk-misma-empresa`,
  `rls-por-empresa`, `planes-sin-borrado`, `planes-sin-seed`, `catalogo-postgres-acota-esquema`,
  `historico-sin-migracion`, `jobs-handler-por-tipo`, `jobs-recurrentes-con-siembra`, `modulos-reparto`,
  `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`): 13 archivos, 184/184.
- eslint de los archivos tocados (T8: 26 TS; T9: 45 TS): 0 errores y 0 avisos.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): **121 errores** (antes de la tanda: 230), todos en pantallas,
  componentes, sus tests y E2E:
  - `app/`: `PlanEmpresa.tsx` 3, `EmpresasModule.tsx` 1, `PlanDetalle.tsx` 1, `PlanForm.tsx` 5, `plan-vista.tsx` 2;
  - `components/shared/`: `ConsumoDelPlan.tsx` 6, `TipoCobroCampo.tsx` 1, `tipo-cobro.ts` 1, `AvisosDeTopes.tsx` 1;
  - `tests/components/`: `PlanEmpresa` 18, `PlanEmpresaSinCosto` 12, `PlanVistaCosteo` 8, `PlanEmpresaTipoCobro` 7,
    `PlanEmpresaCostoPorcentual` 6, `ConsumoDelPlanPorcentual` 5, `ConsumoDelPlanCosteo` 5, `MiPlanModule` 4,
    `PlanForm` 3, `PlanesModule` 3, `PlanDetalleAsignar` 3, `PlanDetalle` 3, `ConsumoDelPlan` 3,
    `PlanFormVistaPreviaCustom` 2, `PlanFormCostoPorcentual` 2, `PlanFormCosteo` 2, `PlanFormCustomAsigna` 1,
    `PlanDetalleDesasignado` 1;
  - `tests/integration/plataforma-empresa-detalle-page.test.tsx` 4 (el test de la página);
  - `e2e/`: `planes-superadmin.spec.ts` 6, `dos-empresas-humo.spec.ts` 1, `_planes-fixture.ts` 1.

### Tests retirados
- `ciclo-periodo`: el bloque de `anclaDeLaFechaElegida` (SLT-58 R32, «hoy» ancla en el instante): R2 hace que «hoy»
  entre a las 00:00. Lo sustituye el bloque de `rangoDeLaFechaDeEfecto` (R16).
- `planes-asignacion`: «R12 (órdenes)» (R8: sin tope de órdenes).
- `planes-asignacion-inicio-ciclo`: R33 (órdenes contadas desde la fecha elegida, con el trigger de órdenes), R34 (ciclo
  corto) y R36 de órdenes (R8, P4 = a), y el siguiente ciclo de la vista previa (P10, solo servía al aviso de órdenes).
  El conteo del período lo miden `plan-ciclo-periodo` y `plan-de-la-empresa-periodo`; la fecha futura,
  `planes-cambio-empresa`.
- `planes-crear-custom-asigna`: «sin tipo, el repositorio asigna en mensual»: `asignar` ya no tiene la firma de SL-24
  sin tipo ni fecha.
- `planes-catalogo`: las formas del precio con anual y `plan_precio_forma` (R33), y el tope de órdenes negativo (R34).
- `planes-service-inicio-ciclo` y `planes-service-crear-custom`: cambiar de plan sin fecha «como SL-24 (P2a)» es ahora
  `validation_error` en `vigenteDesde` (R16), y así se prueba.

### Avisos de la tanda
- **Migración nueva** `20261106140000_plan_aplicar_cambio_empresa_enum`: el trabajo de §5.2 necesita su valor en
  `job_tipo` y §8 no lo listaba. Va sola (55P04). Su `down.sql` borra los trabajos de ese tipo y quita el valor con la
  función de `20261028130400`, renombrada.
- **Decisiones donde el spec no dice nada** (a confirmar):
  - la primera asignación sin fecha rige desde las 00:00 de hoy y conserva el rechazo por topes de SLT-58 P14; su fila
    del historial lleva ahora `hoy · tipo`;
  - asignar el mismo plan con otro tipo es un cambio de solo el tipo (`plan_tipo_cobro_cambiado`), sin mirar topes y sin
    resincronizar módulos, para no borrar las excepciones de SL-23;
  - pedir lo vigente con un pendiente lo cancela y responde `cambio: true`; «Cancelar cambio» no escribe historial;
  - una edición que no toca el precio sigue con SLT-58 R37: con la fecha de hoy es `validation_error` («posterior a hoy»);
  - textos nuevos: «Elige desde qué fecha rige el cambio.», «La fecha de efecto es de un cambio a una empresa con plan;
    la primera asignación lleva fecha de inicio.» y «La fecha de efecto no puede ser anterior a hoy.». El rango usa el
    texto de SLT-58 («Elige una fecha entre el … y el …»).
- **Contratos para el frontend (T10–T12):**
  - `VistaPreviaAsignacionResult` y `VistaPreviaCustomResult` ya no traen `siguienteCiclo`; `asignar` y `crear` responden
    `vigenteDesde` con la fecha cuando el cambio queda pendiente;
  - `MiPlanResult` y `PlanDeEmpresaVista` ganan `pendienteSinPlan` (R26 sin plan); con plan, el pendiente va en
    `plan.cobro.pendiente`;
  - entra `cancelarCambioEmpresaAction`, con `@sin-superficie` hasta que T11 cablee el botón;
  - `cambiarTipoCobroAction` pide `vigenteDesde`.
- Para que `asignar` corriera, T8 ya lee y escribe los descuentos (`plan_descuento_periodo`) en `PlanesRepository`; el
  historial de precio entra con T9.
- `archivar` pide ahora las empresas con un pendiente hacia el plan ANTES que el plan (orden empresa → plan, el de
  `asignar`).
- `docs/architecture.md`: solo cambié la línea del ciclo (231). Las líneas 202, 227 y 229 aún nombran
  `plan_cupo_ordenes`, `CupoPlanRepository` y `plan_inicio_ciclo_en_curso`, que T4 retiró o dejó sin uso.
- `plan-de-la-empresa-porcentual` R25 (SLT-83) cuenta la tabla entera de movimientos y puede caer en paralelo con otros
  archivos que confirman filas; solo pasa en verde. No está en el baseline.
- `tests/integration/plataforma-empresa-detalle-page.test.tsx` es el test de la página del detalle de empresa: lo adapta
  T11.
- Grafo MCP: no lo consulté; trabajé con Grep/Read.

## Decisiones del humano tras T9 (2026-11-05)

Anotadas en `requirements.md > Decisiones cerradas` (y en el mapa decisiones → requisitos):

1. Se acepta la migración extra `20261106140000_plan_aplicar_cambio_empresa_enum`; va en «Archivos esperados».
2. Se acepta el cambio del censo de `historial-accion-escrituras-cubiertas` (productor `aplicarEnTx`).
3. Rastro: una línea por dato. Se confirman las claves `descuento_<periodo>`, «Descuento anual: 10.00 %», el
   separador « · », «sin descuento» del lado vacío y las filas viejas «15000.00 / mes · 150000.00 al año».
   Revisado: `lineasDeCambioDelPlan` ya pinta el costo base y cada descuento en líneas aparte, porque
   `diferenciasDelPlan` guarda en `precio` solo el mensual (`rastro-periodo`, «un descuento por línea»). Sin
   cambio de código.
4. Textos de SLT-83: «Cobrado en el período» y «Total del período hasta hoy» (`lib/planes/mensajes.ts`).
5. Asignar el mismo plan con otro tipo solo cambia el tipo, sin revisar topes: confirmado, sin cambios.
6. **Cancelar un cambio de empresa SÍ deja historial** (sustituye a «sin historial»): T8b en `tasks.md`,
   `design.md > §5.3` y R19, R21 y R26.
7. `docs/architecture.md`: retiradas las menciones a `plan_cupo_ordenes`, `CupoPlanRepository` y
   `plan_inicio_ciclo_en_curso` como vigentes.

Además, en «Archivos esperados»: las dos migraciones nuevas, `lib/types/historial-accion.ts`,
`app/(app)/plataforma/planes/_components/plan-vista.ts` (la ruta real; no hay `plan-vista.tsx`) y
`tests/integration/db/planes-cancelar-cambio-historial.test.ts`. `e2e/dos-empresas-humo.spec.ts` ya estaba.

## Tanda 5 — T8b: cancelar un cambio de empresa deja historial; textos de SLT-83 (2026-11-05)

### Commits
- `1c63f8ce` docs(SLT-86): decisiones del humano tras T9 y architecture.md al día.
- `feat(SLT-86): cancelar un cambio de empresa deja historial` (hash en el informe al leader). Esta parte de la
  bitácora va en él.

### Archivos
- Creados: `db/migrations/20261106150000_historial_accion_plan_cambio_empresa_cancelado/{migration,down}.sql`,
  `tests/integration/db/planes-cancelar-cambio-historial.test.ts`.
- Modificados:
  - `db/schema.prisma` (el valor del enum), `lib/types/historial-accion.ts` (tipo, categoría `cambia_plan`,
    etiqueta «Canceló el cambio de plan pendiente de una empresa»);
  - `lib/repositories/PlanesRepository.ts` (`cancelarPendienteDeEmpresaEnTx`, el único punto; lo llaman
    `cancelarCambioEmpresa`, `cambiarEmpresaEnTx` con la petición igual a lo vigente y `archivar`; sale
    `limpiarPendiente`), `lib/interfaces/repositories/IPlanesRepository.ts` (`cancelarCambioEmpresa` recibe el
    actor), `lib/services/PlanesService.ts`;
  - `lib/types/planes.ts` (`ACCIONES_DE_ASIGNACION` y `TipoDeAsignacion` con `cambio_cancelado`), `lib/planes/cobro.ts`
    (`tipoCobroDelHistorial`), `lib/planes/mensajes.ts` (`textoDelCambioCancelado` y los dos textos de SLT-83);
  - tests: `planes-cambio-empresa` (nombres de R19/R26 y la firma nueva), `planes-service-periodo`, `cobro-periodo`,
    `mensajes-periodo`, `mensajes-costo-porcentual`, `catalogo-y-choke-point`, la guardia
    `historial-accion-escrituras-cubiertas` (censo y conteo 83), los siete tests de migraciones del historial que
    listan los tipos posteriores (`correccion-resultado-gestion`, `historial-accion-cobro-tienda`,
    `-conciliacion-bodega`, `-orden-zona-reconciliada`, `-pago-mensajero-ajustado`, `-zona-pago-mensajero`,
    `-zona-sinpe`) y `caja-459` (la cola del enum).

### Cómo queda
- **La fila:** `accion = plan_cambio_empresa_cancelado`, `entidad = plan` (el del pendiente, `Plan «<nombre>»`),
  `valor_anterior = NULL`, `valor_nuevo = «AAAA-MM-DD · tipo»` del cambio cancelado, el actor congelado de quien
  cancela y el `organizacion_id` de la empresa, en la misma transacción que limpia el pendiente.
- **Quién la deja:**
  - «Cancelar cambio», con quien cancela;
  - pedir lo vigente con un pendiente, con quien lo pide y no con quien lo programó. Lo decidí así porque es la
    misma cancelación por otra vía: sin la fila, el historial no explicaría por qué desapareció el pendiente;
  - archivar un plan: una fila por empresa con un pendiente hacia él, con quien archiva. R21 estaba en la lista
    que dio el humano, y sin la fila esas empresas perderían su pendiente sin rastro.
  - No la dejan: reemplazar un pendiente por otro, pedir lo vigente sin pendiente ni «Cancelar cambio» sin
    pendiente (`sin_cambio_programado`).
- **Lectura (T11):** `planDeEmpresa` devuelve la fila en `asignaciones` con `tipo: "cambio_cancelado"`,
  `tipoCobro` y `desde` del cambio cancelado y `tipoCobroAnterior: null`. La celda la escribe
  `textoDelCambioCancelado(etiqueta del tipo, desde)`: «Cambio cancelado: Quincenal desde el 2026-12-01».

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R19 | `planes-cancelar-cambio-historial` («Cancelar cambio» deja una fila; primera asignación pendiente; sin pendiente y reemplazo no escriben; pedir lo vigente con la firma de quien pide; misma transacción con el registro roto), `planes-cambio-empresa`, `planes-service-periodo` (pasa el actor), `cobro-periodo` (`cambio_cancelado`) |
| R21 | `planes-cancelar-cambio-historial` (archivar: una fila por empresa, con quien archiva; el pendiente hacia otro plan, ninguna) |
| R26 | `planes-cancelar-cambio-historial` (la lectura del detalle devuelve `cambio_cancelado`), `mensajes-periodo` (`textoDelCambioCancelado`) |
| R28 | `mensajes-costo-porcentual` («Cobrado en el período», «Total del período hasta hoy») |

### Salida real
- Base `servi_logistic_slt86`: `migrate deploy` de `20261106150000` ok. Con una fila de la acción nueva, `db:rollback`
  ok: la fila se borra, el valor sale del enum y la migración sale de `_prisma_migrations`. Otro `deploy` la deja
  aplicada. `prisma generate` ok.
- Tests por ruta (`pnpm exec vitest run <archivos>`; integración con `DATABASE_URL`): 17 archivos, 432 casos, 0 fallos,
  0 saltados.
  - Unit: `mensajes-periodo` 12, `mensajes-costo-porcentual` 15, `cobro-periodo` 35, `rastro-periodo` 12,
    `planes-service-periodo` 69, `catalogo-y-choke-point` 54, `historial-accion-escrituras-cubiertas` 94.
  - Integración: `planes-cancelar-cambio-historial` 6, `planes-cambio-empresa` 12, `caja-459-migration` 6,
    `correccion-resultado-gestion-migration` 17, `historial-accion-cobro-tienda-migration` 17,
    `historial-accion-conciliacion-bodega-migration` 18, `historial-accion-orden-zona-reconciliada-migration` 5,
    `historial-accion-pago-mensajero-ajustado-migration` 5, `historial-accion-zona-pago-mensajero-migration` 17,
    `historial-accion-zona-sinpe-migration` 17.
- Guardias de esquema y del historial (`organizacion-en-modelos`, `unicos-por-empresa`, `fk-misma-empresa`,
  `rls-por-empresa`, `planes-sin-borrado`, `planes-sin-seed`, `catalogo-postgres-acota-esquema`, los siete
  `historial-accion*`/`historial-acciones*`, `historico-sin-migracion`, `consultas-concurrentes-en-transaccion`,
  `sql-a-mano-por-empresa`, `superficie-de-uso`): 18 archivos, 337/337.
- eslint de los 23 archivos TS tocados: 0 errores y 0 avisos.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): **121 errores**, el mismo total de la tanda 4; ninguno fuera
  de `app/`, `components/`, `tests/components/`, `tests/integration/plataforma-empresa-detalle-page.test.tsx` y `e2e/`.

### Avisos de la tanda
- **Texto a confirmar:** «Cambio cancelado: {Tipo} desde el {AAAA-MM-DD}» (`design.md > §7.1`). La etiqueta del tipo
  la pone la pantalla (`TEXTOS_TIPO_COBRO`, en `components/shared/tipo-cobro.ts`).
- **Decisiones mías, a confirmar:** pedir lo vigente y archivar también dejan la fila (el porqué, arriba).
- **Para frontend_dev (T11–T13):**
  - `PlanEmpresa.tsx > textoDelTipoCobroDeLaFila` trata hoy toda fila que no es `asignacion` como un cambio de tipo:
    tiene que pintar `cambio_cancelado` con `textoDelCambioCancelado`;
  - los literales viejos de SLT-83 siguen en `tests/components/ConsumoDelPlanPorcentual.test.tsx` (líneas 70, 72, 74,
    85, 97, 98, 108, 109, 162, 164 y 173) y en `e2e/planes-costo-porcentual.spec.ts` (99, 101 y 103). Ningún
    componente tiene el literal: lo toman de `lineasDelCosteoPorcentual`.
- «Órdenes del ciclo sin estado final» (SLT-83) no estaba en la decisión y sigue igual.
- Otros ocho tests de migraciones comparan el enum con el catálogo: `abono-tienda-457`, `api-key-eliminada`,
  `correccion-fecha-reprogramacion`, `geografia-registro`, `geografia-renombrado`, `historial-accion-zona-central`,
  `wallet-458` y `wallet-461`. Leen la base ya migrada y no fijan la cola: no los toqué ni los corrí.
- Grafo MCP: no lo consulté; trabajé con Grep/Read.

**Veredicto:** T8b hecha; cancelar deja historial por los tres caminos, con todo en verde salvo los 121 errores de
tipos de pantallas y E2E (T10–T13).

## Tanda 6 — T10, T11 y T12 (2026-11-05, frontend_dev)

### Commits
- `ac39059b` feat(SLT-86): T10 formulario del plan con descuentos por período.
- `dc3fa6fa` feat(SLT-86): T11 catálogo, detalle y detalle de empresa.
- `feat(SLT-86): T12 Mi plan, consumo y lista de empresas` (hash en el informe al leader). Esta sección va en él.

### Archivos
- **T10**, modificados:
  - `app/(app)/plataforma/planes/_components/PlanForm.tsx`: un descuento por período («Ninguno», «Porcentaje»,
    «Monto fijo»), sin pago anual ni tope de órdenes; al editar, cambiar el precio cambia «Aplicar» por «Rige
    desde» (mañana por defecto, `precioDesdePorDefecto`); el custom para una empresa con plan pide «Rige desde»
    (el inicio de su siguiente período) y muestra el costo base del primer período o tramo; la vista previa sin
    `siguienteCiclo` y `onGuardado(r, nombre)`;
  - `plan-vista.ts` (topes sin órdenes; costo sin el aviso del anual), `PlanesModule.tsx` (`rangoFechaDeEfecto`
    y `onGuardado` nuevo), `app/(app)/plataforma/planes/page.tsx` (`fechaDeEfectoPorDefecto` por empresa y el
    rango), `app/(app)/plataforma/planes/[planId]/page.tsx` y `PlanDetalle.tsx` (`precioDesdePorDefecto`);
  - `components/shared/tipo-cobro.ts` (las cuatro etiquetas, los textos de §7.1, `textoDelPeriodo` y
    `primerPeriodoDelCambio`, que reusa `cobroDelPlan`) y `components/shared/TipoCobroCampo.tsx` (cuatro tipos);
  - tests `PlanForm`, `PlanFormCosteo`, `PlanFormCostoPorcentual`, `PlanFormCustomAsigna`,
    `PlanFormVistaPreviaCustom`. Creado: `tests/components/PlanFormDescuentos.test.tsx`.
- **T11**, modificados:
  - `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`: «Cambiar plan» y «Cambiar tipo
    de cobro» con los cuatro tipos, «Rige desde» (`fechaDeEfectoPorDefecto`, `rangoFechaDeEfecto`) y el costo base
    del primer período o tramo; la primera asignación con su costo y «El plan empieza a regir el {fecha}.»; el
    pendiente («Desde el …» con plan; «Sin límites» sin plan) con «Cancelar cambio»; la columna «Rige desde» y la
    fila `cambio_cancelado` con `textoDelCambioCancelado`; los avisos del `ok` en todo cambio (R18);
  - `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` (la fecha por defecto, el rango y
    `cancelarCambioEmpresaAction`), `lib/actions/planes.ts` (sin el `@sin-superficie`; el comentario ya no dice
    «sin historial»);
  - `PlanDetalle.tsx`: sin el aviso del anual; `lineasDelRastro` pinta los descuentos del alta, pasa cada
    `descuento_*` y `tope_ordenes_ciclo` a `lineasDeCambioDelPlan` y sigue pintando el tope de órdenes de las
    altas viejas;
  - `components/shared/ConsumoDelPlan.tsx` (adelantado de T12 porque lo monta el detalle de empresa): «Costo base
    {tipo}: …», «Período: … (tramo de d de D días)», «Órdenes en el período: n» sin barra con el reinicio debajo,
    «Pago anual»/«Siguiente pago» en el anual, sin el aviso del anual y `pendienteSinPlan` («Sin límites» y
    «{Plan} empieza a regir el {fecha}»);
  - tests `PlanEmpresa`, `PlanEmpresaTipoCobro`, `PlanEmpresaSinCosto`, `PlanEmpresaCostoPorcentual`, `PlanDetalle`,
    `PlanDetalleAsignar`, `PlanDetalleDesasignado`, `PlanesModule`, `tests/integration/plataforma-empresa-detalle-page`.
    Creado: `tests/components/PlanEmpresaPeriodo.test.tsx`.
- **T12**, modificados: `components/shared/AvisosDeTopes.tsx` (sin el aviso de órdenes ni el parámetro del
  siguiente ciclo; sus tres usos), `lib/planes/mensajes.ts` (sin `ordenesYaPasadas`), `app/(app)/mi-plan/_components/
  MiPlanModule.tsx` (el pendiente con plan y `pendienteSinPlan`) y `app/(app)/mi-plan/page.tsx`; tests
  `ConsumoDelPlan`, `ConsumoDelPlanCosteo`, `ConsumoDelPlanPorcentual` (los textos de SLT-83), `MiPlanModule`,
  `PlanVistaCosteo`, `tests/integration/mi-plan-page`. Creados: `tests/components/ConsumoDelPlanPeriodo.test.tsx` y
  `tests/components/EmpresasModulePeriodo.test.tsx`. `EmpresasModule.tsx` no cambia: la etiqueta sale de
  `TEXTOS_TIPO_COBRO.tipo`, que ya trae las cuatro.
- `tasks.md`: T10, T11 y T12 marcadas.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R7 | `ConsumoDelPlanPeriodo` («Órdenes en el período», reinicio debajo), `MiPlanModule`, `PlanEmpresa`, `plataforma-empresa-detalle-page` |
| R8 | `ConsumoDelPlanPeriodo` (sin barra ni «cerca»/«lleno» de órdenes), `PlanFormDescuentos` (sin «Órdenes por ciclo»), `PlanFormVistaPreviaCustom` y `PlanEmpresa` (sin aviso de órdenes), `PlanDetalle`, `PlanesModule` |
| R10 | `PlanFormDescuentos` (porcentaje fuera de rango junto a su campo; costo del tramo con descuento), `ConsumoDelPlanPeriodo` (anual con 10 %) |
| R12 | `PlanFormDescuentos` y `PlanEmpresaPeriodo` (tramo 6/15 = 6200.00; anual 57/365 y 275/365), `ConsumoDelPlanPeriodo`, `MiPlanModule` (351/365) |
| R13 | `ConsumoDelPlanCosteo` (un descuento no toca el costo por orden) |
| R15 | `ConsumoDelPlanPeriodo` (el costo sale de `precioDelPeriodo`), `MiPlanModule` |
| R16 | `PlanFormDescuentos` (custom para empresa con plan: fecha, rango, `vigenteDesde`), `PlanEmpresaPeriodo` («Cambiar plan» y «Cambiar tipo de cobro» mandan `vigenteDesde`; su `validation_error` junto al campo), `PlanEmpresa`, `PlanEmpresaTipoCobro`, `PlanFormCustomAsigna` |
| R17, R18 | `PlanEmpresaPeriodo` (con fecha futura, «Cambio programado desde …» y los avisos de topes sin rechazo) |
| R19 | `PlanEmpresaPeriodo` («Cancelar cambio» con y sin plan, rechazos y throw), `plataforma-empresa-detalle-page` (la página cablea la action) |
| R22 | `PlanFormDescuentos` (cambiar el precio o un descuento pide «Rige desde»; «10» = «10.00» no lo pide; su `validation_error`) |
| R23 | `PlanFormDescuentos` (cuatro descuentos con «Ninguno» por defecto, solo el dato de la forma elegida, errores junto a su campo y lo escrito conservado, mañana por defecto), `PlanForm` |
| R24 | `PlanEmpresaPeriodo` (modal con «… / mes · Descuento anual: 10.00 %»), `PlanesModule`, `PlanDetalle`, `PlanVistaCosteo` |
| R25 | `PlanEmpresaPeriodo` (cuatro tipos, «Rige desde» con el siguiente período y el costo del primer período o tramo en los tres modales), `PlanFormDescuentos`, `PlanFormCustomAsigna` |
| R26 | `PlanEmpresaPeriodo` («Desde el …» con «Cancelar cambio»; «Sin límites» y «{Plan} empieza a regir el …»; fila «Cambio cancelado: …»), `ConsumoDelPlanPeriodo` («Mi plan» con y sin plan, sin botones), `plataforma-empresa-detalle-page`, `mi-plan-page` |
| R27 | `ConsumoDelPlanPeriodo` (tramo quincenal, bimestral, anual con «Pago anual» y «Siguiente pago», siguiente cobro = pendiente), `MiPlanModule`, `plataforma-empresa-detalle-page` |
| R28 | `ConsumoDelPlanPeriodo` (fijo: base del tramo + órdenes; porcentual: base + cobrado; sin precio), `ConsumoDelPlanPorcentual` («Cobrado en el período», «Total del período hasta hoy»), `ConsumoDelPlanCosteo`, `PlanVistaCosteo` |
| R29 | `EmpresasModulePeriodo` (las cuatro etiquetas junto al plan; sin plan, ninguna) |
| R30 | `PlanEmpresaPeriodo` y `PlanEmpresaTipoCobro` (columna «Rige desde»; filas viejas «—»), `PlanDetalle` (rastro viejo con órdenes y anual) |

### Salida real
- Tests por ruta (`pnpm exec vitest run <archivos>`): **27 archivos, 378/378**.
  - `PlanFormDescuentos` 20, `PlanForm` 25, `PlanFormCosteo` 7, `PlanFormCostoPorcentual` 10, `PlanFormCustomAsigna` 13,
    `PlanFormVistaPreviaCustom` 13;
  - `PlanEmpresaPeriodo` 21, `PlanEmpresa` 50, `PlanEmpresaTipoCobro` 12, `PlanEmpresaSinCosto` 16,
    `PlanEmpresaCostoPorcentual` 8, `PlanDetalle` 19, `PlanDetalleAsignar` 7, `PlanDetalleDesasignado` 1,
    `PlanesModule` 9, `plataforma-empresa-detalle-page` 22;
  - `ConsumoDelPlan` 7, `ConsumoDelPlanCosteo` 14, `ConsumoDelPlanPorcentual` 9, `ConsumoDelPlanPeriodo` 13,
    `EmpresasModulePeriodo` 5, `MiPlanModule` 13, `PlanVistaCosteo` 10, `mi-plan-page` 9;
  - `mensajes-periodo` 12 y `mensajes-costo-porcentual` 15 (por `mensajes.ts`), `superficie-de-uso` 18.
  - Sin tocar y en verde: `plataforma-planes-page`, `EmpresasModulePlan` (41 casos con `mi-plan-page` antes de su caso nuevo).
- `pnpm run test:guardias` (tras T11, por `lib/actions`): 331 archivos; 327 ok, 3 saltados y 1 rojo
  (`dependencias-declaradas-presentes`, 4 casos, el del baseline); 4593 casos ok.
- eslint de los archivos tocados (T10: 14; T11: 15; T12: 15): 0 errores y 0 avisos.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): **8 errores**, todos de `e2e/` (T13):
  `planes-superadmin.spec.ts` 6, `dos-empresas-humo.spec.ts` 1, `_planes-fixture.ts` 1. Antes de la tanda: 121.

### Tests retirados o invertidos, con su motivo
- R8 (sin tope de órdenes): la fila y la barra de órdenes de `ConsumoDelPlan`, `MiPlanModule`, `PlanEmpresa` y la
  página del detalle; el aviso «La empresa ya lleva … órdenes en este ciclo …» de `PlanFormVistaPreviaCustom` y
  `PlanEmpresa` (cambiado por el de un rol); el tope de órdenes de la edición en `PlanDetalle` (cambiado por API
  keys); el campo «Órdenes por ciclo» de `PlanForm`. `ordenesYaPasadas` no tenía test propio.
- R8 y P10: `siguienteCiclo` de la vista previa y el tercer argumento de `onGuardado` (`PlanForm`,
  `PlanFormCustomAsigna`, `PlanFormVistaPreviaCustom`).
- R23, R33: el grupo «Pago anual» (fijo o descuento) de `PlanForm`; lo sustituyen los cuatro descuentos.
- R28: la nota «El pago anual no cambia el costo por orden.» (`ConsumoDelPlanCosteo` 3 casos,
  `ConsumoDelPlanPorcentual` 1, `PlanVistaCosteo` 3), invertidos: un descuento de período no la pinta.
- R27 y P4 = a: en `MiPlanModule`, el reinicio del ciclo corto (SLT-58 R40) y los tres casos de «Monto del período»
  con aniversario del ancla (D8, D9); los sustituyen el reinicio quincenal y el período de calendario.
- §7.1: «El ciclo de órdenes empieza el {fecha}.» (SLT-58 R38) pasa a «El plan empieza a regir el {fecha}.».

### Avisos de la tanda
- **Textos recortados (no nuevos), a confirmar:**
  - «Cambiar plan»: quité «Sus topes y módulos cambian en cuanto confirmes.» de «La empresa pasa de «A» a «B».»;
  - «Cambiar tipo de cobro»: «no cambian sus topes, sus módulos ni su ciclo de órdenes» pasa a «no cambian sus topes
    ni sus módulos». Con R17 las dos frases eran falsas.
- **Textos reutilizados donde §7.1 no da uno, a confirmar:**
  - un cambio de empresa que queda pendiente avisa «Cambio programado desde {fecha}.» (el de SLT-58);
  - «Cancelar cambio» avisa «Cambio programado cancelado.» (el del detalle del plan);
  - `sin_cambio_programado` dice «El plan ya no tiene un cambio pendiente.» (dice «el plan», no «la empresa»);
  - un fallo al cancelar, «No se pudo guardar. Inténtalo de nuevo.».
- **Decisiones de forma, a confirmar:**
  - el título de cada descuento es «Descuento {tipo}» en minúscula (como el rastro aprobado) y los campos se llaman
    «Porcentaje» y «Monto fijo», como sus radios; «Costo base {tipo}: …» lleva el tipo en minúscula;
  - el historial de asignaciones gana la columna «Rige desde» (R30); un cambio cancelado deja «—» porque su
    fecha ya va en la celda del tipo;
  - «Cancelar cambio» va sin modal de confirmación (design §7.1 solo pide el botón);
  - al editar el precio el botón dice «Guardar» aunque la fecha sea futura (el formulario no conoce «hoy»);
  - «Desde el …» lo pinta cada pantalla (`PlanEmpresa` bajo el consumo, `MiPlanModule` encima), no `ConsumoDelPlan`.
- **Textos de «ciclo» que siguen igual** (la decisión del 2026-11-05 solo cambió dos de SLT-83): «Costo del ciclo»,
  «Órdenes del ciclo: n × c = s», «Total estimado del ciclo: …» y «Órdenes del ciclo sin estado final: …». ¿Pasan a
  «período»?
- El costo del primer período en los modales usa el precio vigente del plan elegido; si ese plan tiene una edición de
  precio programada antes de la fecha de efecto, el costo real será el nuevo (R15).
- El modal de «Cambiar plan» ya no se cierra solo al confirmar (`closeOnConfirm={false}`), para dejar el error de
  «Rige desde» junto al campo; con `ok` o un rechazo sin campo se cierra como antes.
- **Para T13:** `e2e/planes-superadmin.spec.ts` espera «El ciclo de órdenes empieza el …» (líneas 328 y 330), que
  ahora es «El plan empieza a regir el …»; `e2e/planes-costo-porcentual.spec.ts` (99, 101, 103) tiene los literales
  viejos de SLT-83.
- Grafo MCP: no lo consulté; trabajé con Grep/Read.

**Veredicto:** T10, T11 y T12 hechas; 378/378 en los 27 archivos tocados y el typecheck solo con los 8 errores de
`e2e/` que son de T13.

## Tanda 7 — decisiones del humano del 2026-11-06 en la UI (frontend_dev)

**Commit:** `983a3bf2` feat(SLT-86): textos de costeo en «período» y confirmación de «Cancelar cambio».

**Archivos modificados**
- `lib/planes/mensajes.ts` (backend_dev): «Órdenes del período sin estado final: n»; test
  `tests/unit/planes/mensajes-costo-porcentual.test.ts` (con `mensajes-periodo`: 27/27, eslint limpio).
- `specs/.../requirements.md` (tres filas 2026-11-06 en «Decisiones cerradas») y `design.md §7.1` (implementer).
- `components/shared/ConsumoDelPlan.tsx`: «Costo del período», «Órdenes del período: …», «Total estimado del
  período: …» (las claves `costoDelCiclo`/`ordenesDelCiclo` no cambian: diff mínimo).
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`: «Cancelar cambio» abre un `Modal`
  (el de `components/shared/Modal`, como en `PlanDetalle`) titulado «¿Cancelar el cambio a {plan} programado para el
  {fecha}?»; confirmar llama a `cancelarCambioEmpresa`, «Volver» cierra sin llamar. Con y sin plan actual.
  `sin_cambio_programado` → «La empresa ya no tiene un cambio pendiente.» en `RECHAZOS_CANCELAR` y `RECHAZOS`.
- Tests: `tests/components/ConsumoDelPlanCosteo.test.tsx`, `ConsumoDelPlanPeriodo.test.tsx`,
  `ConsumoDelPlanPorcentual.test.tsx`, `MiPlanModule.test.tsx`, `PlanEmpresa.test.tsx`, `PlanEmpresaPeriodo.test.tsx`,
  `tests/integration/plataforma-empresa-detalle-page.test.tsx`.

**R → test**
- R28 (textos «período») → `ConsumoDelPlanCosteo.test.tsx`, `ConsumoDelPlanPeriodo.test.tsx` (costo del período),
  `ConsumoDelPlanPorcentual.test.tsx` (incl. «Órdenes del período sin estado final»), `MiPlanModule.test.tsx`.
- R19 (modal de confirmación) → `PlanEmpresaPeriodo.test.tsx` «R19 (decisión 2026-11-06): pide confirmación…»,
  «…cerrar la confirmación con «Volver» no llama a la action», «R19: confirmar llama a la action…».
- R19, R26 (sin plan, por el modal) → `PlanEmpresaPeriodo.test.tsx` «también sin plan pide confirmación…» y
  `plataforma-empresa-detalle-page.test.tsx` «SLT-86 R26: sin plan y con una primera asignación pendiente…».
- R19, R26 (rechazo) → `PlanEmpresaPeriodo.test.tsx` it.each `sin_cambio_programado`; `PlanEmpresa.test.tsx:339`.

**Salida de los comandos**
- `pnpm exec vitest run` (14 archivos: los 7 tocados + los que importan `ConsumoDelPlan`/`PlanEmpresa`/`MiPlanModule`):
  `Test Files 14 passed (14) · Tests 225 passed (225)`.
- `pnpm exec eslint <9 archivos tocados>`: `No issues found`.
- Typecheck no corrido (lo corre el leader). `e2e/` no tocado (siguiente tanda).

**Notas / propuestas**
- (propuesta) Botones del modal: «Cancelar cambio» (variante `destructive`) y «Volver», copiados de `PlanDetalle`; el
  modal no lleva `description` (la decisión solo fija el título).
- `ConsumoDelPlanPeriodo.test.tsx:74` sigue con `queryByText(/órdenes del ciclo/)` a propósito: guarda que no vuelva
  el rótulo viejo.
- Grafo MCP: no lo consulté; trabajé con Grep/Read.

**Veredicto:** decisiones a, b y c del 2026-11-06 hechas en la UI; 225/225 en los 14 archivos y eslint limpio.

## Tanda 8 — T13: E2E de planes a la UI de SLT-86 (2026-11-06, frontend_dev)

**Archivos modificados** (solo `e2e/`; nada de producción)
- `e2e/_planes-fixture.ts`: `asignarPlanConTope(db, org, n)` → `asignarPlanCustom(db, org)` sin `ordenesPorCiclo` (R8)
  y con la firma nueva de `crearYAsignar` (efecto `inicio` de hoy, `elegida: false`, y `ahora`, como
  `PlanesService.efectoElegido`); `crearPlanPublicoConCosto` con `descuentos: {}` en vez de `anual: null` (R10);
  `ordenesDelCiclo` → `ordenesDesdeLaEntrada` (la entrada es ahora las 00:00 del día: se compara antes/después).
- `e2e/dos-empresas-humo.spec.ts`: el caso 8 de planes, ver «Retirado/adaptado».
- `e2e/planes-superadmin.spec.ts`: sin el campo «Órdenes por ciclo» (se afirma que no está), sin
  `topeOrdenesCiclo` ni `planCicloCortoDesdeAt` en los `select`, «Órdenes en el período: 0» en lugar de «0 de 50
  órdenes del ciclo», la lista «Lo que tendrá la empresa» afirma el tope de Mensajero y la ausencia del de órdenes,
  y «El plan empieza a regir el {fecha}.».
- `e2e/planes-costeo.spec.ts`: «Costo base mensual: 50000.00», «Órdenes del período: 1 × 100.00 = 100.00», «Total
  estimado del período: 50100.00»; el inicio del custom va al día 1 del mes en curso (`primerDiaDelMes`).
- `e2e/planes-costo-porcentual.spec.ts`: lista «Costo del período», «Costo base mensual: 1000.00», «Cobrado en el
  período: …», «Órdenes del período sin estado final: …», «Total del período hasta hoy: …»; el inicio va a
  `entradaSinTramo()` (≥ 5 días atrás y sin tramo).

**Retirado/adaptado, con motivo**
- `dos-empresas-humo` «SL-24: la tienda de A, al tope de su plan, no crea…» (SL-24 R33): **se retira** el tramo del
  tope (mensaje «Tu plan permite 2 órdenes por ciclo…» en la vista previa, «Confirmar» deshabilitado y la carga real
  por el endpoint con la fila en error `mensajeDelTope({tope:"ordenes"})`): SLT-86 R8 quitó el tope de órdenes y su
  variante del tipo. **Se adapta** a lo contrario, que es lo que R8 pide: A con plan y 2 órdenes más en el período
  sube su fila, la vista previa no habla de tope, confirma y la orden se crea en A (+1 en el período); B, sin plan,
  igual que antes. Se conserva el aislamiento (cada remisión solo en su empresa) y el 0 de 5xx. (propuesta: el
  caso queda como humo de R8 por carga masiva en pantalla; la prueba fuerte de R8 sigue en
  `tests/integration/db/plan-sin-tope-ordenes.test.ts`).
- `planes-costeo` y `planes-costo-porcentual`: la fecha de inicio pasa de «hoy» / «5 días atrás» a una que deja el
  período mensual en curso completo, porque con períodos de calendario (R5, R12) una entrada a mitad de mes lo
  vuelve tramo y el costo base dependería del día de la corrida. Las cifras escritas a mano no cambian. (propuesta:
  el tramo proporcional queda probado en los unitarios `cobro-periodo` y no en el E2E.)
- `planes-superadmin`: las aserciones de `planCicloCortoDesdeAt` («hoy no abre ciclo corto») se retiran: la columna
  ya no existe (P4 = a). La del tope de órdenes en la base (`topeOrdenesCiclo = 50`) también (R8).

**R → test (E2E)**
- R7, R8 (sin tope en pantalla) → `planes-superadmin.spec.ts` «el detalle de A pinta…», «asigna el público…», «el
  maestro de A ve en «Mi plan»…» («Órdenes en el período: 0», sin «Órdenes por ciclo»).
- R8 (crear órdenes no se rechaza) → `dos-empresas-humo.spec.ts` «SLT-86: la tienda de A, con plan y órdenes ya
  creadas, crea por la carga masiva…».
- R23 (sin campo de tope en el formulario) → `planes-superadmin.spec.ts` (`rellenarPlan`).
- R25 / §7.1 («El plan empieza a regir el {fecha}.») → `planes-superadmin.spec.ts` «asigna el público…».
- R28 (textos «período») → `planes-costeo.spec.ts` ««Mi plan» muestra el costo por orden…»,
  `planes-costo-porcentual.spec.ts` ««Mi plan» muestra lo cobrado en el período…» y el caso de la orden de 100.000.
- R37 → las cuatro specs en verde, dos corridas.

**Salida de los comandos**
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): antes 8 errores (los de `e2e/`), después
  **0** (5m44s).
- `pnpm exec eslint` de los 5 archivos: `No issues found`.
- `pnpm exec vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: 38/38.
- `pnpm exec next build` (base `servi_logistic_slt86_e2e`): la 1.ª vez murió por memoria en «Running TypeScript»
  (heap por defecto); con `NODE_OPTIONS=--max-old-space-size=8192`, ok (9m21s).
- E2E (`E2E_PUERTO=3044`, base `servi_logistic_slt86_e2e`, las 4 specs + `plataforma-vacia` por dependencia):
  - corrida 1: **35 passed**, 0 failed, 0 skipped, 0 flaky (5.3m);
  - corrida 2, misma base: **35 passed**, 0 failed, 0 skipped, 0 flaky (5.5m).

**Notas**
- `design.md > §9` pone `e2e/planes-costo-porcentual.spec.ts` entre los que «quedan igual»; con las decisiones del
  2026-11-05 y 2026-11-06 sobre los textos de costeo sí cambió (literales y nombre de la lista). Conviene moverlo a
  «se adaptan» al cerrar §9.
- Grafo MCP: no lo consulté; trabajé con Grep/Read.

**Veredicto:** E2E de planes adaptados a SLT-86; typecheck 0, eslint limpio y dos corridas seguidas 35/35.

**Cierre de la tanda (implementer, 2026-11-06)**
- `design.md > §9` cerrada: `e2e/planes-costo-porcentual.spec.ts` pasa a «se adapta» y se anota el tramo retirado de
  `dos-empresas-humo` (R8). `tasks.md`: T13 marcada; `./init.sh` y `gate-completo` quedan para el leader y CI.
- `pnpm run test:guardias`: 331 archivos; 327 ok, 3 saltados, 1 rojo (`dependencias-declaradas-presentes`, 4 casos,
  en `tests/baseline-rojos.json`); 4593 casos ok. 159 s.
- Base E2E: `servi_logistic_slt86_e2e` (DROP/CREATE, `prisma migrate deploy`, `db:seed`), no la compartida.
- No se corrió la suite completa ni `./init.sh` (memoria de la máquina).

## Tanda 9 — «Inicio del período» y botones de «Cancelar cambio» (2026-11-06)

Decisiones del humano tras T13: «Inicio del ciclo de órdenes» → «Inicio del período» en toda la UI; botones del modal
de «Cancelar cambio» aprobados («Cancelar cambio» destructive, «Volver»); el tramo proporcional no lleva E2E.

**Archivos** (frontend_dev; specs, implementer)
- `PlanForm.tsx` (etiqueta y su ayuda: «El período de la empresa empieza ese día, hora de la plataforma.») y
  `PlanEmpresa.tsx` (etiqueta). Claves `inicioCiclo` sin cambiar.
- Tests: `PlanEmpresa`, `PlanFormCustomAsigna`, `PlanFormDescuentos`, `PlanFormVistaPreviaCustom`,
  `plataforma-empresa-detalle-page`, `plataforma-planes-page`. E2E: `planes-costeo`, `planes-costo-porcentual`,
  `planes-superadmin`.
- `requirements.md` (fila 2026-11-06 «Etiqueta del inicio y botones de «Cancelar cambio»») y `design.md §7.1`.

**R → test:** R25/R16 (campo de inicio de la primera asignación) → los mismos tests de antes con la etiqueta nueva;
R19 (botones del modal) → `PlanEmpresaPeriodo.test.tsx` (sin cambios, ya los usaba).

**Salida real (verificada por el implementer)**
- vitest de los 6 archivos de test: 6/6, 138/138.
- eslint de los 11 archivos de código y test: exit 0.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): 0 errores.
- E2E sobre `servi_logistic_slt86_e2e`, puerto 3044, build posterior al cambio: `planes-costeo`, `planes-costo-porcentual`
  y `planes-superadmin` → 27 passed, 0 failed, 0 skipped, 0 flaky (2.0 min).

**Propuesta:** `lib/types/planes.ts:187` dice «Un plan público no se asigna al crearlo: no lleva inicio del ciclo.»
(error de validación que puede verse en pantalla). La decisión no lo nombra; no se tocó.
