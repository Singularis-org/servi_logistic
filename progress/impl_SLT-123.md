# impl SLT-123 «Pago al mensajero independiente del efectivo» (Central) — tanda T0-T6

backend_dev, 2026-11-12. Rama `feature/SLT-123-pago-independiente-efectivo`. Base desechable `slt123_pago`
(base nueva + `prisma migrate deploy` + `db:seed`). Sin subagentes. Grafo no consultado: el worktree no
estaba indexado (design.md lo anota); exploracion con Grep/Read.

## T0 — medicion

**T0.1 — caminos a `aprobado`.** Escrituras de `cierre_dia` en `lib/` (no hay en `app/` ni `scripts/`):

| Sitio | Que escribe |
|---|---|
| `CierresAdminRepository.ts:1907` (`updateMany`) | solo totales (efectivo/simpe/transferencia/general); `where estado in ABIERTOS` |
| `CierresAdminRepository.ts:2207` (`updateMany`) | totales + P + ingreso bodega (correccion de resultado); `where estado in ABIERTOS` |
| `CierresAdminRepository.ts:2329` (`updateMany`) | solo `totalPagoMensajero` (ajuste de pago); `where estado in ABIERTOS` |
| `CierresAdminRepository.ts:2393` (`updateMany`, `resolverCierre`) | **`estado: nuevoEstado` (`aprobado` / `rechazado`)** — el UNICO camino a `aprobado` |
| `CierresAdminRepository.ts:3053` (`updateMany`) | `estado: solicitado` (forzar vencido → solicitado) |
| `CierreDiaRepository.ts:187` (`updateMany`) | totales recalculados; `where estado = estadoEsperado` |
| `CierreDiaRepository.ts:1165` (`updateMany`) | `estado: solicitado` |
| `CierreDiaRepository.ts:1197` (`create`) | `estado` = `solicitado` por defecto o `vencido` (`CorteDiarioService:232`) |
| `CierreDiaRepository.ts:1674` (`update`) | P e ingreso bodega |
| `CierreDiaRepository.ts:2042` (`updateMany`) | `rechazado` → `solicitado` |
| `CierreBodegaRepository.ts:480` (`updateMany`) | solo `cierreBodegaId` (`where estado = aprobado`) |

Sin `UPDATE cierre_dia` en SQL crudo de produccion. Confirmado: `resolverCierre` es el unico camino.

**T0.2 — tests que caen con la marca** (integracion: los 19 archivos que nombran `pago_efectivo`, «Pago del
efectivo», «Liquidado» o «del efectivo», contra `slt123_pago` con la marca puesta en `resolverCierre`):

| Archivo | Resultado | Motivo |
|---|---|---|
| `slt73-aprobar-central-igual.int.test.ts` | **cae** (1/3) | caracteriza la aprobacion central: espera `pago_efectivo 1500` → T7.1 a la regla nueva |
| `slt73-migracion-retira-asientos.int.test.ts` | **cae** (2/6) — **no estaba previsto** | usa la aprobacion central real como montaje y espera `pago_efectivo` → T7.1, fixture vieja |
| `454/.../dinero-aprobacion.test.ts`, `455/.../dinero-aprobacion.test.ts` | rojos, **sin medir** | en `tests/baseline-rojos.json`; en local caen al sembrar (faltan zona/orden: «tabla `orden` vacia») |
| `busqueda-por-guia-469`, `caja-caracterizacion-459`, `estado-cuenta-cierre-pagos-172r52`, `premio-ranking-devengo-migration`, `premio-ranking-idempotencia`, `repositories/dinero-productos.int` | rojos | todos en el baseline; caen por datos de siembra, no por la marca |
| `tarifas-valor-propio-caminos.test.ts` | **no cae** (37/37) | previsto, pero no aprueba por el camino real con la marca |
| `pago-mensajero-idempotencia.test.ts` | **no cae** (4/4) | idem |
| resto (`backfill-conciliacion-retroactiva`, `liquidacion-idempotencia`, `liquidacion-migration`, `pago-mensajero-movimiento-migration`, `slt73-marcar-asienta`, `wallet-mensajeros-page`, `wallet-satelites`) | verdes | — |

E2E: listados por `grep` (no ejecutados en esta tanda; los corre T7.2): `ajuste-pago-mensajero-cierre`,
`cierre-modelo-nuevo-plan-porcentual`, `cierres-rediseno`, `incentivo-mensajero-slt68`,
`tarifas-valor-propio-mensajero`, `wallet-mensajeros` — los 6 previstos, ninguno nuevo.

Ademas el compilador señalo 4 tests que llaman a `derivarPendienteCierre` sin el campo obligatorio (ganan
`pagoIndependienteEfectivo: false`, regla de la 44): `liquidacion-idempotencia`, `premio-ranking-idempotencia`,
`caja-173-alcance.guardia`, `cierre-dia-service-totales-mixtos`. `## Archivos esperados` actualizado.

**T0.3 — permisos.** `servi_app` tiene `INSERT/SELECT/UPDATE/DELETE` de TABLA sobre `cierre_dia`
(`role_table_grants`; `pg_class.relacl` con `servi_app=arwd`; `pg_attribute.attacl` nulo en las 20 columnas).
No hay permisos por columna: la migracion NO lleva `GRANT`. `relforcerowsecurity = false`: el dueño ve todas
las filas en el `down.sql`.

**T0.4** — pendiente (Carlos, en prod).

## Archivos

Produccion (16):
- `db/schema.prisma` — `pagoIndependienteEfectivo Boolean @default(false)` en `CierreDia`.
- `db/migrations/20261114120000_pago_independiente_efectivo/migration.sql` — `ADD COLUMN ... NOT NULL DEFAULT false`.
- `db/migrations/20261114120000_pago_independiente_efectivo/down.sql` — `RAISE` (P0001) si hay alguna marca en `true`; `DROP COLUMN`.
- `lib/repositories/CierresAdminRepository.ts` — la marca en `resolverCierre` (rama `bodega_central`, con `tx`, antes de `asentarCierreDia`); `CIERRE_RESUMEN_SELECT` + `toResumenRow`.
- `lib/interfaces/repositories/ICierresAdminRepository.ts` — `CierreAdminResumenRow.pagoIndependienteEfectivo?`.
- `lib/interfaces/services/ICierresAdminService.ts` — `CierreAdminResumen.pagoIndependienteEfectivo?`.
- `lib/services/CierresAdminService.ts` — `conPendiente`, `pendienteTrasAprobar` y el mapper `toResumen` (este ultimo lo destapo el unit test: sin el, la marca no llegaba a `conPendiente`).
- `lib/services/WalletMensajeroFeedService.ts` + `lib/interfaces/services/IWalletMensajeroFeedService.ts` — misma lectura con la marca; sin `pago_efectivo` si la marca es `true`.
- `lib/utils/pendiente-cierre.ts` — `pagoIndependienteEfectivo` obligatorio; `true` → `P` redondeado.
- `lib/services/CierreDiaService.ts`, `lib/interfaces/services/ICierreDiaService.ts`, `lib/repositories/CierreDiaRepository.ts` — `CierrePasadoDTO` y `conPendientePago`.
- `lib/services/LiquidacionService.ts`, `lib/repositories/LiquidacionPagoRepository.ts`, `lib/interfaces/repositories/ILiquidacionPagoRepository.ts` — los cuatro `select` de cierre para pago y los tres consumidores.

Decision tecnica: en los DTO (`CierreAdminResumen[Row]`, `CierrePasadoDTO`, `CierreParaPagoDTO`) el campo es
**opcional** y los consumidores lo leen con `=== true` (ausente = `false`, el `DEFAULT` de la columna = la
regla de la 44, el lado que nunca ofrece pagar de mas), como `incluyeModeloNuevo`. Hacerlo obligatorio
rompia el tipo de ~60 dobles de test (32 archivos solo de `obtenerCierreParaPago`) y el PR no cabe. Lo que
SI es obligatorio es `PendienteCierreInput.pagoIndependienteEfectivo` (el compilador obligo a decidir en los 6
consumidores). Los repositorios reales leen la columna siempre; la integracion lo prueba de punta a punta.

Tambien `tests/unit/repositories/liquidacion-pago-repository.test.ts` (contrato literal del `select`, +1 columna).

Tests nuevos: `tests/integration/db/slt123-pago-independiente.int.test.ts` (13 casos),
`tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` (7).
Ampliados: `pendiente-cierre.test.ts`, `wallet-mensajero-feed-service.test.ts`, `cierres-admin-pendiente.test.ts`,
`cierre-dia-pendiente-pago.test.ts` (unit), `liquidacion-service.test.ts`, `cierre-dia-pendiente-pago.test.ts` (integracion).
Solo el campo: `liquidacion-idempotencia`, `premio-ranking-idempotencia`, `caja-173-alcance.guardia`, `cierre-dia-service-totales-mixtos`.

## `prisma generate`

Una sola vez, justo tras crear la migracion: **2026-11-12 15:12:36 -0500 → 15:12:44 -0500**, exit 0
(`prisma-client-js`, `node_modules` compartido). Columna aditiva con default: los otros worktrees no la
seleccionan y su cliente sigue compilando.

## R → test

| R | Test |
|---|---|
| R310 | `slt123-pago-independiente.int.test.ts` caso 2 (marca N1 `true`; vista por el feed antes de asentar; rollback forzado → `solicitado` y `false`), caso 6 (S1 `false`) |
| R311 | idem caso 7 (rechazar R1, conciliar V2/S1, pagar, anular, incentivo: marcas intactas) |
| R312 | `migracion-slt123-ida-y-vuelta.test.ts` (Σ y md5 iguales, todos `false`, down aborta P0001, down sin marcas deja el esquema igual, reaplicar) |
| R313 | `wallet-mensajero-feed-service.test.ts` (bloque SLT-123) + integracion caso 2 |
| R314 | integracion caso 2 (caja literal con `egreso_pago_mensajero 3000.00`) + feed unit |
| R315 | `pendiente-cierre.test.ts` filas 3-6 + integracion caso 3 |
| R316 | `liquidacion-service.test.ts` (tope 3000.00; pagar P deja 0.00) + integracion caso 4 |
| R320 | `cierres-admin-pendiente.test.ts`, `cierre-dia-pendiente-pago.test.ts` (unit), `cierre-dia-pendiente-pago.test.ts` (integracion, C5/C6) |
| R321 | `liquidacion-service.test.ts` (pago directo, reparto, anular) + `cierres-admin-pendiente.test.ts` (tras aprobar) + integracion (anular → 3000.00) |
| R325 | `pendiente-cierre.test.ts` filas 1-2 + feed unit + integracion casos 3, 5 y 6 |
| R326 | integracion caso 1 (foto `row_to_json` de V1/V2 en 5 tablas, identica) |
| R327 | integracion casos 3 y 6 + M7 y M8 |
| R328 | integracion caso 4 (cuenta por pagar 0.00 → 3000.00 → 0.00) |
| R331 | integracion caso 8 (caja y tienda literales iguales en V1 y N1; premios 0.00). La conciliacion analitica compara el libro de tienda contra `total_general`: cubierta por la igualdad de tienda. |
| R332 | `pendiente-cierre.test.ts` (lectura del archivo, rama nueva) + `wallet-mensajero-feed-service.test.ts` (lectura del archivo) |

## Mutaciones (T6.2)

Script `mutar.mjs` (scratchpad): aplica, corre con `--reporter=json`, anota, **revierte siempre**. Cada
corrida se comprobo por nombre y numero de tests. `git diff --stat` identico antes y despues (24 archivos,
+532 −15).

| # | Test | tests | fallidos | Resultado | Primer test que cae |
|---|---|---|---|---|---|
| M1 | feed unit + integracion | 28 | 12 | MATADA | feed «nuevo central con E >= P»; int. caso 2 |
| M2 | pendiente unit + integracion | 44 | 24 | MATADA | `pendiente-cierre` filas 1-3; int. (el pago de N1 da `sin_saldo` → beforeAll) |
| M3 | migracion ida y vuelta | 7 | 2 | MATADA | «todos los cierres quedan en false» |
| M4 | integracion | 13 | 13 | MATADA | caso 2 |
| M5 | integracion | 13 | 2 | MATADA | casos 2 y 7 (R1 con marca) |
| M6 | pendiente unit + integracion | 44 | 15 | MATADA | `pendiente-cierre` fila 3; int. caso 3 |
| M7 | integracion | 13 | 1 | MATADA | caso 3 (V1 central viejo) |
| M8 | integracion | 13 | 2 | MATADA | casos 3 (V1 `resuelto_at` 2026-11-13) y 6 (S1) |
| M9 | feed unit + integracion | 28 | 5 | MATADA | feed «nuevo central …»; int. casos 2 y 4 |
| M10 | pendiente unit | 31 | 2 | MATADA | las dos aserciones que leen el archivo |
| M11 | integracion | 13 | 3 | MATADA | casos 2, 6 y 7 (S1 con marca) |
| M12 | integracion | 13 | 5 | MATADA | caso 2 (el feed no vio la marca; libro con `pago_efectivo`) |
| M13 | integracion | 13 | 13 | MATADA | `EscrituraFueraDeTx`: el cliente vigilado del test |

M13: con el arnes de savepoint, `this.prisma` y `tx` van por la misma conexion y un rollback revierte las dos;
por eso el test cablea un `clienteVigilado` que lanza si se toca `cierreDia` por el cliente de fuera durante
una `$transaction`. Sin esa vigilancia M13 sobreviviria.

## Prueba del `down.sql` (a mano, en `slt123_pago`)

1. Cierre aprobado con la marca en `true` sembrado → `down.sql` **aborta**: `P0001 rollback SLT-123: 1 cierres
   de cierre_dia tienen pago_independiente_efectivo = true; se aborta sin borrar nada`; columna sigue, marca sigue.
2. Borrado ese cierre (0 marcados) → `down.sql` aplica: columna fuera.
3. `migration.sql` reaplicada: columna de vuelta (la base queda como tras `migrate deploy`).

## Salidas

Logs en el scratchpad de la sesion (`.../scratchpad/slt123/`). Todo con `DATABASE_URL` → `slt123_pago`.

- **typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`, 15:47): `TC=0`, 0 errores.
- **lint** (`pnpm run lint`): `0 errors`, 243 warnings, ninguno en un archivo de este diff (todos previos).
- **unit**: `pendiente-cierre` 31/31, `wallet-mensajero-feed-service` 15/15, `cierres-admin-pendiente` 34/34,
  `liquidacion-service` + `cierre-dia-pendiente-pago` 114/114, `liquidacion-pago-repository` (con el `select` nuevo) verde.
- **integracion**: `slt123-pago-independiente.int` 13/13, `migracion-slt123-ida-y-vuelta` 7/7, `cierre-dia-pendiente-pago` 6/6.
- **`vitest related` sobre los 14 archivos de `lib/`**: 2068 suites, 6431 tests; 134 archivos rojos en el
  baseline y 11 fuera. Re-corridos aislados: `WalletCaja463` y `wallet-page` verdes (saturacion);
  `liquidacion-pago-repository` caia por el `select` literal → actualizado (contrato: +1 columna), verde;
  los 7 restantes (`aprobacion-consultas-en-serie`, `cierre-dia-pendiente-pago`, `cierre-incluye-modelo-nuevo`,
  `cierre-iva-aparte-sl39`, `cierre-resuelto-por-sql-real`, `cierres-cola-senales-sql-real` y las dos
  `slt73-*` de T7.1) → `PrismaClientValidationError`: **el cliente Prisma compartido se regenero a las
  16:08:34 desde OTRO worktree, sin la columna** (`grep -c pagoIndependienteEfectivo` = 0 en el
  `index.d.ts` generado). Typecheck, integracion y las 13 mutaciones corrieron antes (15:45-15:54) con el
  cliente de esta rama. `slt73-aprobar-central-igual` y `slt73-migracion-retira-asientos` caen ademas por
  la regla nueva (T0.2 → T7.1).
- **guardias** (`pnpm run test:guardias`): 343/344 archivos; 4 rojos en `dependencias-declaradas-presentes`
  (marcador de `init.sh`), en el baseline y ajeno a este diff.

## Tamaño

`node scripts/tamano-pr.mjs`: **28/40 archivos, 1 399/1 000 lineas** (sin `specs/` ni `progress/`) —
**pasa del limite**. Produccion ~140 lineas (16 archivos); el resto son tests (la integracion nueva 581 y la
ida y vuelta 232). Con T7 crecera. Decide el leader (partir o `tamano-pr-aceptado`).

## Veredicto

T0.1-T0.3 y T1-T6 hechas; 13/13 mutaciones matadas; `down.sql` probado. Bloqueos: el cliente Prisma
compartido sobrescrito por otro worktree (re-generar antes del gate) y el tamaño del PR.
