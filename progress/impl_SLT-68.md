# impl SLT-68 — Incentivo manual a un mensajero (Tanda A, T0–T9)

Rama `feature/SLT-68-incentivo-manual-mensajero` (hotfix sobre `origin/prod`). Base local dedicada
`servi_slt68` (prod + `db:seed`). Sin commit, sin `./init.sh` (los corre el implementer).
Grafo de código: sin proyecto indexado para este worktree; se exploró con Grep/Read.

## T0 — medido antes de escribir

- Última migración en `origin/prod`: `20261028120000_modulo_wallet_nucleo`; en `origin/dev`:
  `20261029150000_plan_ciclo_inicio_elegido`. Timestamps de esta ficha: `20261030120000` y
  `20261030120100` (posteriores a ambas; R21 lo afirma en un test).
- `origin/dev` NO redefine `pago_mensajero_movimiento_tipo_categoria_check` ni `..._origen_uq`: las 9
  migraciones de dev posteriores a prod (`20261028130000_plan` … `20261029150000_plan_ciclo_inicio_elegido`)
  tienen 0 menciones de `pago_mensajero_movimiento`, `wallet_origen_tipo`, `tipo_categoria_check` u `origen_uq`.
- Inventario en `servi_slt68` (pg_depend / pg_constraint / pg_indexes / pg_attribute):
  - columnas de los tipos: `wallet_movimiento.origen_tipo`, `wallet_tienda_movimiento.origen_tipo`,
    `pago_mensajero_movimiento.origen_tipo` (`wallet_origen_tipo`) y `pago_mensajero_movimiento.categoria`
    (`pago_mensajero_movimiento_categoria`). Ninguna con DEFAULT.
  - nombran `::pago_mensajero_movimiento_categoria` por texto: `..._tipo_categoria_check`,
    `..._premio_dia_check`, `..._origen_uq`, `..._premio_dia_uq`, `..._premio_reverso_uq`.
  - ningún CHECK, índice, vista, función ni política nombra `::wallet_origen_tipo`. Índices sobre
    `origen_tipo` (solo columna): `wallet_movimiento_origen_tipo_origen_id_idx`,
    `wallet_movimiento_origen_categoria_uq` (con `organizacion_id`), `wallet_tienda_movimiento_origen_tipo_origen_id_idx`,
    `wallet_tienda_movimiento_origen_uq`, `pago_mensajero_movimiento_origen_tipo_origen_id_idx`, `..._origen_uq`.
  - políticas RLS de los tres libros: solo `organizacion_id = app.organizacion_id`. Sin triggers en
    `pago_mensajero_movimiento`/`wallet_tienda_movimiento`.

**Decisión del down de enums**: en vez de la coreografía literal de la 293 (lista fija), se usa la
función dinámica P12 (`20261024130000_pago_plataforma_categoria/down.sql`, renombrada `_slt68`): lee la
lista vigente de `pg_enum`, suelta y recrea con su definición exacta todo lo que nombra el tipo, y aborta
con RAISE si hay filas. Es la «forma vigente» de design §3.1 medida por el catálogo, y no borra valores
de dev. R21 lo prueba de ida y vuelta.

**Desviación menor (§4)**: `sumarPremiosVivosPorCierre` hace la consulta de hoy + rama `incentivo`, y
SOLO si encontró algún incentivo, dos más (ids de los incentivos del cierre y Σ de sus reversos): el
`groupBy` no devuelve ids, así que «dos consultas» no es alcanzable sin raw SQL. El número de consultas
sigue sin crecer con el número de cierres.

## Archivos

Creados:
- `db/migrations/20261030120000_incentivo_mensajero_enums/{migration.sql,down.sql}`
- `db/migrations/20261030120100_incentivo_mensajero_checks/{migration.sql,down.sql}`
- `lib/types/incentivo-mensajero.ts`, `lib/interfaces/services/ICajaIncentivoMensajeroFeedService.ts`,
  `lib/interfaces/services/IIncentivoMensajeroService.ts`, `lib/services/CajaIncentivoMensajeroFeedService.ts`,
  `lib/services/IncentivoMensajeroService.ts`, `lib/actions/incentivo-mensajero.ts`
- `tests/unit/services/incentivo-mensajero-service.test.ts`, `tests/unit/actions/incentivo-mensajero-action.test.ts`,
  `tests/unit/utils/incentivo-analitica-slt68.test.ts`, `tests/integration/db/incentivo-mensajero-slt68.test.ts`,
  `tests/integration/db/migracion-slt68-ida-y-vuelta.test.ts`

Modificados (lib/db):
- `db/schema.prisma` (3 valores + comentario)
- `lib/types/wallet-mensajero.ts`, `lib/types/wallet.ts` (tuplas; `DocumentoCajaDTO.tipo` + `incentivo_mensajero`),
  `lib/types/wallet-anulacion.ts` (`CaminoAnulacion`)
- `lib/constants/wallet-rotulos.ts` (3 Record de origen: «Incentivo a un mensajero»)
- `lib/utils/aporte-por-orden.ts`, `lib/utils/estado-cuenta-chips.ts` (chip `incentivos`), `lib/utils/estado-cuenta.ts`
  (`claveDeParMensajero`), `lib/analytics/metrics.ts`
- `lib/services/OrigenLegibleService.ts`, `lib/repositories/libro-caja-a-quien-sql.ts` (rama INCENTIVO),
  `lib/services/LibroCajaAutoriaService.ts`, `lib/repositories/LibroCajaAutoriaRepository.ts`,
  `lib/interfaces/repositories/ILibroCajaAutoriaRepository.ts` (a quién + anulación del incentivo)
- `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`, `lib/repositories/PagoMensajeroMovimientoRepository.ts`
  (`id?`, `obtenerIncentivo`, suma ampliada)
- `lib/repositories/ConciliacionCierresAnaliticaRepository.ts`
- `lib/services/WalletAnulacionService.ts`, `lib/actions/wallet-anulacion.ts`, `lib/services/WalletComprobanteService.ts`
- `lib/services/WalletService.ts`, `lib/interfaces/services/IWalletService.ts`,
  `lib/repositories/EgresoCajaDocumentosRepository.ts` (`IncentivoCajaDocumentosRepository`), `lib/actions/wallet.ts`

Modificados (tests existentes, por contrato que cambia): dobles de `IPagoMensajeroMovimientoRepository`
(+`obtenerIncentivo`, 9 archivos) y de `LectoresDocumentosCaja` (+`incentivos`, 10 archivos);
tablas totales de `wallet-labels`, `mi-wallet-labels`, `wallet-origen-legible`; formas de WHERE en
`financiera-conciliacion-repo` y `premio-ranking-lecturas`; fotos históricas de catálogo en
`premio-ranking-devengo-migration`, `orden-incidente-migration`, `caja-459-migration`,
`cobro-tienda-461-migration`, `abono-tienda-457-migration` (el valor nuevo va al final del enum).

## Mapa R → test (Tanda A)

| R | Test |
|---|---|
| R1 | `tests/unit/services/incentivo-mensajero-service.test.ts` › R1 registrar / anular (5 roles, ningún repo) |
| R2 | `tests/unit/actions/incentivo-mensajero-action.test.ts` › R2 registrar / anular |
| R3 | `tests/unit/actions/incentivo-mensajero-action.test.ts` › R3 (13 casos + `.strict()` + fecha vacía) |
| R4 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › R4 dos empresas (por la action, composition root real) |
| R5 | idem › R5 (solo cierre solicitado) + unit R5 |
| R6 | idem › R6 (1+1 filas, cierre más reciente, fecha, motivo, actor, clave; cierre intacto) |
| R7 | idem › R7/R14 (cuenta por pagar +M, ganancia −M con `derivarCaja`) |
| R8 | idem › R8/R14 (pagable +M, imputable +M, no imputable igual, reparto por M lo salda) |
| R9 | idem › R9 |
| R10 | idem › R10 en serie y A LA VEZ + unit R10 |
| R11 | unit › R11 registrar y anular |
| R12 | integración › R12 (6 rechazos 23514 con el nombre del CHECK + 2 controles) |
| R13 | integración › R13 |
| R14 | integración › R7/R14 y R8/R14 |
| R15 | integración › R15 en serie (incluye inserción directa rechazada por `origen_uq`) y A LA VEZ |
| R16 | `tests/unit/services/wallet-anulacion-service.test.ts` › SLT-68 R16 (5) + integración › R16/§5 (autoría, «A quién», documento anulado) |
| R17 | integración › R17 |
| R20 | `tests/unit/utils/incentivo-analitica-slt68.test.ts` |
| R21 | `tests/integration/db/migracion-slt68-ida-y-vuelta.test.ts` (5) |
| R18, R19, R22 | Tanda B (abajo) |

## Salida real

- Tests de la tanda (12 archivos: los 6 nuevos + los 6 existentes ajustados que corren en esta base):
  `Test Files 12 passed (12) · Tests 205 passed (205)`.
- Integración nueva: `incentivo-mensajero-slt68.test.ts` 14/14; `migracion-slt68-ida-y-vuelta.test.ts` 5/5.
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`; con 4 GB el proceso muere por
  memoria): 3 errores, todos de Tanda B — `app/(app)/wallet/_components/wallet-labels.ts:412`
  (Record de `DocumentoCajaDTO.tipo`), `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts:124`
  (`CATEGORIA_PAGO_LABEL`), `components/shared/estado-cuenta/estado-cuenta-labels.ts:17` (chip `incentivos`).
  `lib/` y `tests/` en verde.
- Lint de los archivos tocados: 0 errores (9 warnings preexistentes en `premio-ranking-lecturas` y
  `busqueda-por-guia-469-servicios`).
- `vitest related` sobre el diff (770 archivos): 135 rojos. Clasificados:
  - entorno (la base `servi_slt68` solo tiene `db:seed`: sin órdenes, zona central ni usuarios) —
    «tabla `orden` vacía», «faltan la zona central…», «referencia a otra empresa» con catálogos ajenos,
    `EmpresaNoResuelta` en `aporte-capital`: no tocan nada de esta ficha;
  - preexistentes de prod: tramos de `wallet_movimiento_categoria` en las fotos 457/458/461 (SL-45);
  - de esta ficha y ya corregidos: los listados arriba;
  - de esta ficha y de Tanda B: `tests/components/EstadoCuenta.test.tsx` y `EstadoCuentaBarra467.test.tsx`
    (la lista de chips del mensajero gana «Incentivos»; su rótulo es T10).
  En CI, con base sembrada, deben volver a correr los de «entorno»: entre ellos `libro-caja-a-quien`,
  `efecto-movimiento-predice` y `estado-cuenta-servidor-458d` tocan código de esta tanda.

## Mutaciones (una a una, en serie)

Comando de código: `bash correr-mut.sh <id> <archivo> <test> <-t>` (aplica con respaldo, corre
`pnpm exec vitest run <test> -t <filtro>`, restaura byte a byte con hash y vuelve a correr). Comando de
base: `correr-mut-db.sh` (DDL directo en `servi_slt68` equivalente a la línea de la migración, y su
restauración). Tras todas: hashes de CHECK/índices/RLS de `pago_mensajero_movimiento`/`usuario`/`cierre_dia`
idénticos a antes («DB IGUAL») y ningún marcador de mutación en `git diff`.

| # | Test | Mutación | Mutado | Revertido |
|---|---|---|---|---|
| M1 | unit R1 | `IncentivoMensajeroService.registrar`: quitar el gate `esAccesoTotal` | ROJO 1 | verde |
| M14 | unit R1 | idem en `anular` | ROJO 1 | verde |
| M2 | unit R2 | `registrarIncentivoMensajeroAction`: comprobar sesión DESPUÉS del schema | ROJO 1 | verde |
| M3 | unit R3 | `incentivo-mensajero.ts` (types): `monto: z.string()` | ROJO 4 | verde |
| M4 | unit R11 | servicio: no lanzar si el devengo escribe 0 | ROJO 1 | verde |
| M5 | unit R16 | `WalletAnulacionService.rutaDeMensajero`: rama del incentivo DESPUÉS de `nace_de_un_cierre` | ROJO 1 | verde |
| M13 | unit R20 | `metrics.ts`: quitar `incentivo`/`reverso_incentivo` del catálogo | ROJO 1 | verde |
| M8 | PG R8/R14 | `sumarPremiosVivosPorCierre`: quitar `{ categoria: "incentivo" }` del OR | ROJO | verde |
| M9 | PG R8/R14 | quitar la resta de los `reverso_incentivo` | ROJO | verde |
| M10 | PG R17 | conciliación: quitar `incentivo`/`reverso_incentivo` del `NOT OR` | ROJO | verde |
| M11 | PG R7/R14 | `CajaIncentivoMensajeroFeedService.emitirEgreso` devuelve 1 sin escribir | ROJO | verde |
| M15 | PG R5 | servicio: sin cierre → lanza en vez de `sin_cierre_aprobado` | ROJO | verde |
| M6 | PG R6 | DB: CHECK tipo↔categoría sin `'incentivo'` | ROJO | verde |
| M7 | PG R9 | DB: `origen_uq` con `'incentivo'` dentro del predicado | ROJO | verde |
| M12 | PG R12 | DB: soltar `..._incentivo_origen_check` | ROJO | verde |
| M16 | PG R15 serie | DB: `reverso_incentivo` fuera de `origen_uq` | ROJO (tras reforzar el test) | verde |
| M17 | PG R4 | DB: `ALTER TABLE usuario DISABLE ROW LEVEL SECURITY` | **sobrevive** | verde |

- M16 sobrevivió la primera vez: el caso «A LA VEZ» no llega a carrera real (la lectura previa del
  servicio ya ve el reverso). Se añadió al caso en serie una inserción directa de un segundo
  `reverso_incentivo`, que el índice rechaza; con eso, ROJO.
- M17 sobrevive por diseño: la empresa tiene DOS barreras (el filtro de `lib/db/extension-empresa.ts`,
  que añade `organizacionId` al WHERE, y la RLS). Quitar una deja la otra. R4 está medido por la action
  real con dos empresas; no hay un `WHERE organizacion_id` propio de esta ficha que mutar.

Veredicto: Tanda A (T0–T9) hecha; lib/ y tests en verde en esta base; 16 de 17 mutaciones en rojo (M17 explicado); typecheck rojo solo en los 3 archivos de UI de Tanda B.

---

# Tanda B (T10–T14) — pantalla, catálogo y E2E · 2026-10-30

## Archivos

Creados:
- `e2e/incentivo-mensajero-slt68.spec.ts` (R22), `tests/unit/components/incentivo-rotulos-slt68.test.ts` (R18)

Modificados:
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts` (concepto `incentivo_a_mensajero`, clase
  `incentivo_mensajero`, `LibroDestino` `caja_y_mensajero`, frase, cabecera, `CONCEPTO_REGISTRO_DE`,
  `nombreEnElLibroDelMensajero`)
- `app/(app)/wallet/_components/wallet-labels.ts` (`DOCUMENTO_CAJA_NOMBRE.incentivo_mensajero`)
- `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts` (`CATEGORIA_PAGO_LABEL`)
- `components/shared/estado-cuenta/estado-cuenta-labels.ts` (chip «Incentivos»)
- `components/shared/wallet/RegistrarMovimientoDialog.tsx` (rama `incentivo_mensajero`: FormData
  mensajeroId/monto/motivo/fecha?/clave, sin comprobante ni método; `sin_cierre_aprobado` bajo el mensajero)
- `components/shared/wallet/registrar-movimiento-labels.ts` (etiqueta de la cuenta, pista, avisos)
- `lib/types/efecto-movimiento.ts`, `lib/utils/efecto-movimiento.ts` (`enCuenta: "devengo"`)
- `lib/modulos/reparto.ts` (`incentivo-mensajero` → núcleo: lo exigía la guardia `modulos-reparto`;
  rojo causado por la action de la tanda A)
- `playwright.config.ts` (spec en el proyecto `dinero`), `docs/ayuda/oficina/wallet-caja.md`
- Tests ajustados (contrato que cambia, literales a mano): `wallet-conceptos-manuales`, `efecto-movimiento`,
  `efecto-movimiento-predice` (paso PG del incentivo por su servicio real), `wallet-labels`,
  `wallet-registrar-movimiento-dialog` (+2 casos del incentivo), `EstadoCuenta`, `EstadoCuentaBarra467`.

## Mapa R → test (Tanda B)

| R | Test |
|---|---|
| R18 | `tests/unit/components/incentivo-rotulos-slt68.test.ts` (rótulos, chip, emparejamiento) + `tests/components/EstadoCuenta.test.tsx` / `EstadoCuentaBarra467.test.tsx` (chips del mensajero) |
| R19 | `tests/unit/components/wallet-conceptos-manuales.test.ts` › SLT-68 + `tests/unit/utils/efecto-movimiento.test.ts` › SLT-68 + `tests/integration/db/efecto-movimiento-predice.test.ts` (paso `incentivo_a_mensajero`) + `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx` › SLT-68 R19 |
| R22 | `e2e/incentivo-mensajero-slt68.spec.ts` (registrar → «Incentivo» y cuenta 2.000→2.700 → anular desde «Ver» de la caja → 2.000; ganancia 1.000→300→1.000) |

## Mutaciones (aplicadas y revertidas con hash)

| # | Mutación | Test | Mutado | Revertido |
|---|---|---|---|---|
| MB1 | `efectoDeMovimiento`: rama `devengo` nunca entra | `efecto-movimiento.test.ts` | ROJO 1 | 16/16 |
| MB2 | `CATEGORIA_PAGO_LABEL.incentivo` = «Ajuste (devengo)» | `incentivo-rotulos-slt68` | ROJO 2 | 6/6 |
| MB3 | `reverso_incentivo` → chip `premios` | `incentivo-rotulos-slt68` | ROJO 1 | 6/6 |
| MB4 | `libroDelConcepto` sin rama `caja_y_mensajero` | `wallet-conceptos-manuales` | ROJO 3 | 40/40 |
| MB5 | `CHIP_LABEL.incentivos` = «Premios» | `EstadoCuenta.test.tsx` | ROJO 1 | 21/21 |
| MB6 | diálogo: no reconoce `sin_cierre_aprobado` | `wallet-registrar-movimiento-dialog` | ROJO 1 | 64/64 |

## Salida real

- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): verde. Lint de los tocados: «No issues found».
- E2E `E2E_SERVIDOR=dev E2E_PUERTO=3068 pnpm exec playwright test e2e/incentivo-mensajero-slt68.spec.ts`:
  `4 passed (1.7m)`, `E2E_EXIT=0`.
- `pnpm run test:guardias`: 317/318 archivos; el rojo es `dependencias-declaradas-presentes.guardia`
  (marcador «FIN PASO 2» ausente en `init.sh`): `init.sh`, `scripts/` y la guardia no difieren de
  `origin/prod` → preexistente; el propio gate la excluye.
- `./init.sh` (2.ª corrida, tras corregir): `INIT_EXIT=1`, solo por `test:rapido`: 4 archivos rojos de 644
  (9066 tests verdes). Clasificados, ninguno causado por esta rama:
  - `tests/integration/db/caja-backfill.test.ts` (5): «referencia a otra empresa: cierre_dia.destino_zona_id
    -> zona» — la base `servi_slt68` solo tiene `db:seed`; ni el test ni sus fuentes difieren de `origin/prod`. Entorno.
  - `tests/integration/db/indices-rutas-calientes.test.ts` (1): el planificador no elige
    `analytics_daily_organizacion_id_fecha_idx` en esta base; ni el test ni `AnaliticaOperativaRollupRepository`
    difieren de `origin/prod`. Entorno.
  - `metrics-caja-naturaleza.guardia` y `analitica-financiera-conciliacion` (suites): «Cannot find module
    '.prisma/client/default'» a mitad de corrida (node_modules compartido: `prisma generate` de otro
    worktree); vueltos a correr solos: 42/42 verdes. Entorno.
  - La 1.ª corrida tenía además `wallet-registrar-movimiento-dialog` (causado por esta rama: 12 conceptos y
    sin comprobante en el incentivo) → corregido; y en `test:guardias`, `e2e-sin-saltos` (paréntesis en un
    comentario de `playwright.config.ts` cortaba el lector), `primitivas.guardia` (`mensajeroNombre` en el
    diálogo) y `modulos-reparto` (action sin entrada) → corregidos.

## Hallazgo para el leader (fuera del alcance de pantalla)

En `/wallet/mensajeros/[id]` la fila «Incentivo» NO ofrece «Anular…» ni se marca «Anulado»:
`EstadoCuentaService.documentoDeMensajero` no reconoce el incentivo (documento `null`) y la fila cuenta como
`naceDeUnCierre` (origen `cierre_dia`). La anulación funciona desde «Ver» de la fila de la caja (R16 en el
servidor; el E2E la usa). Arreglarlo toca `lib/services/EstadoCuentaService.ts` + la lectura de estados por
documento: decisión del leader (backend).

Veredicto Tanda B: T10–T14 hechos; R18/R19/R22 con test y mutación; E2E 4/4 verde; gate local rojo solo por entorno/preexistentes clasificados.

## Hueco R16 — anular el incentivo desde el libro del mensajero (2026-10-30, backend_dev)

Hallazgo de la Tanda B cerrado siguiendo el molde del premio (293) en `EstadoCuentaService`.

Archivos:
- `lib/services/EstadoCuentaService.ts` — `DocumentoDeFila` gana `{ tipo: "incentivo"; id }`;
  `documentoDeMensajero` reconoce `categoria = incentivo` (documento = la propia fila); `estadosDeDocumentos`
  lee su estado por `repo.reversosDeIncentivo` (como `reversosDePremio`); `naceDeUnCierre` excluye el
  incentivo en el libro del mensajero (cuelga de un cierre para ser pagable, pero no lo produjo la aprobación).
- `lib/interfaces/repositories/IEstadoCuentaRepository.ts` + `lib/repositories/EstadoCuentaRepository.ts` —
  `reversosDeIncentivo(mensajeroId, ids)`: `reverso_incentivo` con `origen_tipo = incentivo_mensajero`,
  `origen_id IN ids` y `mensajero_id` en el `WHERE`.
- Pantalla: sin cambios. `EstadoCuenta.tsx` ya pinta «Anular…» por `fila.anulable` y «Anulado» por
  `fila.anulacion`; el clic llega a `WalletAnulacionService`, que ya enruta `incentivo` → `incentivo_mensajero`.
- Tests: `tests/unit/services/estado-cuenta-incentivo-slt68.test.ts` (nuevo, 2 casos, dobles) y un caso PG
  nuevo en `tests/integration/db/incentivo-mensajero-slt68.test.ts` › «R16: en el libro del mensajero…».

Mapa: R16 (libro del mensajero) → unit `estado-cuenta-incentivo-slt68` (2 casos) + PG «R16: en el libro del
mensajero el incentivo es anulable…».

Evidencia:
- Unit: `Tests 2 passed (2)`.
- Mutación M-R16a (quitar `if (c === "incentivo") return { tipo: "incentivo", id: f.id }`): `2 failed (2)`;
  restaurado, `git hash-object` igual (b1a3e090…), `2 passed`.
- Mutación M-R16b (quitar `|| f.categoria === "incentivo"` de `naceDeUnCierre`): `2 failed (2)`; restaurado, hash OK.
- **PG NO EJECUTADO (entorno).** El cliente Prisma compartido (`node_modules/.pnpm/@prisma+client…/.prisma/client`)
  se regeneró a las 13:33 desde otro worktree y no tiene `incentivo`/`reverso_incentivo`/`incentivo_mensajero`:
  TODO el archivo `incentivo-mensajero-slt68.test.ts` cae (14/15, también los casos previos) con
  `PrismaClientValidationError` → `AppErrorCode inesperado INTERNAL`. Prohibido `prisma generate` en esta
  tanda, y el clasificador denegó un generate aislado. Pendiente: regenerar el cliente con el schema de esta
  rama y correr el caso PG + su mutación (M-R16a, mismo sed) antes del review.
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`): `TSC_EXIT=2`, 31 errores, TODOS de enum
  desconocido en el cliente rancio (12 archivos de la rama; 3 en mi `reversosDeIncentivo`, del mismo tipo:
  `"reverso_incentivo"`/`"incentivo_mensajero"` no asignable). Ninguno en `EstadoCuentaService.ts` ni en el test unit.
- Lint de los tocados: «No issues found».
- `vitest related` de los 3 archivos de `lib/`: 212/229 archivos verdes, 2840/2975 tests; los 17 rojos son
  integración: cliente rancio (`PrismaClientValidationError`) y «referencia a otra empresa» (entorno de
  `servi_slt68`, ya clasificado arriba). Todos los unit/componentes verdes.

Veredicto: arreglo hecho y probado en el servicio (unit + 2 mutaciones rojas); el caso PG está escrito pero sin
ejecutar hasta que se regenere el cliente Prisma compartido.

- Review H2 (test): caso PG «anular con el id de un `pago_devengado`/`premio_ranking` → `no_encontrado`, cero filas» en `tests/integration/db/incentivo-mensajero-slt68.test.ts`; 16/16 verdes; mutación sin `categoria: "incentivo"` en `obtenerIncentivo` → rojo (recibe `ok`), restaurado (hash 7551a8e2… igual); lint limpio.
