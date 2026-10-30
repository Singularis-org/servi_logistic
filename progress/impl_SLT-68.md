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
| R18, R19, R22 | Tanda B |

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
