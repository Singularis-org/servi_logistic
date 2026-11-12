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

---

# Tanda T7 (T7.1 + T7.2) — backend_dev, 2026-11-12

Rama al dia con `origin/dev` (`ec0e5ab3` ya ancestro; sin merge ni migraciones nuevas). Sin subagentes.

## Cliente Prisma regenerado desde este worktree

Ruta real del cliente (pnpm): `node_modules/.pnpm/@prisma+client@7.8.0_prisma_12a6.../node_modules/.prisma/client/index.d.ts`.

| Hora | Para que | `grep -c pagoIndependienteEfectivo` |
|---|---|---|
| 16:30:47 → 16:30:55 | antes de los vitest de T7.1 | 85 |
| 16:33:50 | antes del `next build` del E2E (corrida 1) | 85 |
| 16:44:06 | justo antes de la corrida 2 del E2E (base nueva) | 85 |

## T7.1 — integracion

T0.2 midio dos que caen; los demas listados no cambian:
- `454`/`455` `dinero-aprobacion`: aprueban un cierre de la **satelite** (adminSatelite) y lo asientan aparte;
  la marca solo la pone la central (R310) → siguen con `pago_efectivo 1500.00`. Sin cambio. En local caen al
  sembrar (baseline), igual que antes.
- `tarifas-valor-propio-caminos`, `pago-mensajero-idempotencia`: verdes en T0.2. Sin cambio.

| Test | Tipo | Cambio |
|---|---|---|
| `tests/integration/db/slt73-aprobar-central-igual.int.test.ts` | caracteriza la aprobacion central → regla nueva | `MENSAJERO_CENTRAL` pierde `pago_efectivo 1500.00` (queda solo `pago_devengado 1500.00`, R313); caja y tienda literales iguales (R314); nueva asercion `pagoIndependienteEfectivo === true` tras aprobar (R310). Nombre del caso actualizado. |
| `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts` | montaje: la central es el centinela «la migracion no toca la central» | `ASENTADO_CENTRAL` (mensajero solo devengo 1500.00) para el cierre central; los satelite siguen con `ASENTADO` (marca `false`, con `pago_efectivo`). Conteo de intactos `toHaveLength(28)` escrito a mano: central 7+5+1 + conciliado 7+5+2 + 1 fila forzada (antes 29). Lo que vigila (filas de la central iguales antes y despues del up, sin respaldo) no cambia. No se le pudo «fijar la marca en false»: la aprobacion real la pone siempre en la central, y la central es lo que el test necesita. |

Salida (`DATABASE_URL` → `slt123_pago`, log `scratchpad/slt123/t71.log`): 4 archivos verdes, 33 tests passed
(los 2 adaptados + `slt73-marcar-asienta` + `slt123-pago-independiente`); `454/dinero-aprobacion` rojo al sembrar
(baseline, ajeno).

## T7.2 — E2E (grupo `dinero` entero)

Base desechable nueva por corrida (`slt123_e2e_t7`, luego `slt123_e2e_t7b`: crear + `migrate deploy` + `db:seed`),
`next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000`, puerto 3000, candado `e2e.lock`.

- Corrida 1 (sin adaptar): **77 passed, 7 failed, 17 did not run** (serial). Los 7, todos por la regla nueva:
  `ajuste-pago-mensajero-cierre` (Disponible 2.200 vs 200), `cierre-modelo-nuevo-plan-porcentual` (libro sin
  `pago_efectivo`), `cierres-admin` (a) (aparece la oferta de pago), `cierres-rediseno` (la oferta tapa la
  pestaña «Resueltos»), `incentivo-mensajero-slt68` (cuenta 3.000 vs 2.000), `tarifas-valor-propio-mensajero`
  (libro sin `pago_efectivo`), `wallet-mensajeros` (pagado ₡0 vs 1.000).
- Corrida 2 (adaptados): **101/101 passed** (`E2E_EXIT=0`).

| E2E | Cambio (importes a mano) |
|---|---|
| `e2e/ajuste-pago-mensajero-cierre.spec.ts` | oferta «Disponible» 200 → **2.200** (P ajustado; antes 2.200 − mín(2.200, 2.000)); libro: «Pago del efectivo» 1 fila 2.000 → **0 filas**; «La empresa le debe» 200 → **2.200** |
| `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts` | libro: fuera `mensajero:pago_efectivo=6175.00`; `egreso_pago_mensajero=6175.00` de la caja sigue (R314) |
| `e2e/cierres-admin.spec.ts` (a) | antes «no se ofrece pago» (E 6.000 cubria P); ahora la oferta sale con «Disponible» **1.500** (1 entrega a la tarifa por defecto 1.500; el rechazo no paga) → «Ahora no» → sin dialogos |
| `e2e/cierres-rediseno.spec.ts` | tras aprobar central A: oferta «Disponible» **3.000** (P = 2 × 1.500) → «Ahora no»; celda «Pago» del mensajero «Liquidado» → **«Pendiente de pago»** (R320; antes P − mín(P, E) = 0) |
| `e2e/incentivo-mensajero-slt68.spec.ts` | cuenta por pagar 2.000 → **3.000** (P 3.000 − 0 pagado; antes − 1.000 del efectivo), con incentivo 2.700 → **3.700**, tras anular → **3.000**; ganancia 1.000/300 sin cambio (caja intacta) |
| `e2e/tarifas-valor-propio-mensajero.spec.ts` | dos listas del libro: fuera `mensajero:pago:pago_efectivo=3110`; queda `pago_devengado=3110` (lo que vigila el valor propio) |
| `e2e/wallet-mensajeros.spec.ts` | Pagado 1.000 → **0**; cuenta por pagar 2.000 → **3.000**; «La empresa le debe» 3.000; «Pago del efectivo» 1 fila → **0** |

Logs: `scratchpad/slt123/e2e1.log`, `e2e2.log`, `build.log`.

## Salidas T7

- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC=0`, 0 `error TS`.
- eslint sobre los 9 archivos tocados: exit 0, sin salida.
- Tamaño (`node scripts/tamano-pr.mjs`): **38/40 archivos, 1 527/1 000 lineas** (aceptado por Carlos).

## Veredicto T7

T7.1 y T7.2 hechas: 2 integraciones y 7 E2E adaptados a la regla nueva con importes a mano; grupo `dinero` 101/101.

## Arreglos review 1

Fuente: `progress/review_SLT-123.md` (commit a60b8868).

1. **Bloqueante R321 (marca perdida en el reparto «Pagar»).**
   - a) `pagoIndependienteEfectivo` pasa a OBLIGATORIA en las filas de repositorio:
     `CierreParaPagoDTO` (y por herencia `CierreImputableDTO`, `ILiquidacionPagoRepository.ts`) y
     `CierreAdminResumenRow` (`ICierresAdminRepository.ts`). `CierrePasadoDTO` es tambien el DTO de
     la UI y se deja opcional; su mapper del repositorio (`toCierrePasadoDTO`, `CierreDiaRepository.ts`)
     declara `CierrePasadoDTO & { pagoIndependienteEfectivo: boolean }` como retorno.
     Dobles ajustados (solo los que construyen esas filas, `pagoIndependienteEfectivo: false`, la regla
     de antes): 16 archivos de `tests/unit/services/*` y `tests/unit/guards/liquidacion-reparto-bloqueos.guardia.test.ts`.
   - b) Integración, `it` «R321: el reparto «Pagar» con el repositorio real…»: `previsualizarRepartoMensajero`
     real tras la anulacion: N1 `3000.00`, V1 `2000.00` (literales a mano).
   - Mutacion (quitar el mapeo en `LiquidacionPagoRepository.ts:374` y `:409`): **la matan los dos**.
     Typecheck: `TS2322` en `:368` y `:402`. Test: el `it` R321 de la integracion falla (1 failed / 14 passed).
     Revertida (copia restaurada, `git diff` del repositorio vacio).
2. **Menor R331 caso 8:** nuevo `it` «caso 8 (R331): «Debe llegar a la central» de S1…»: `paraLaCentral`
   de la fila de «A consolidar» (`listarConsolidablesPaginado`) de S1, aprobado con el codigo nuevo,
   `1500.00` (= general 4 000 − P 2 500 − bodega 0). `paraLaCentral` solo existe para cierres de satelite;
   V1/N1 son de la central y no tienen esa cifra.
3. **Menor JSDoc** `ICierresAdminService.ts` (`pendientePagoMensajero`): nuevos `P` − pagos vigentes;
   viejos `P − min(P, E)` − pagos vigentes (es lo que hace `derivarPendienteCierre`; «`min(P, E)`» a secas
   era el texto desfasado), mas premios vivos en los dos.
4. **Proceso:** T8.2 `[x]`; T0.4 marcada DIFERIDA con su motivo; Trazabilidad de R321 y R331 al dia.
   T8.1 queda para el gate del leader.

Salida real:

- `npx prisma generate` antes de cada tanda (4 regeneraciones); `index.d.ts` con 85 apariciones de
  `pagoIndependienteEfectivo` en todas.
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p .`): 0 errores.
- Lint (`npx eslint` de los 20 `.ts` tocados): exit 0.
- Vitest (unit de liquidacion, cierres-admin, cierre-dia, incentivo, liberacion, guardia de reparto,
  pendiente-cierre + `slt123-pago-independiente.int`, base `slt123_pago`): **36 archivos, 931/931**.
  La integracion sola: 15/15.

Veredicto: los cuatro arreglos de la review 1 aplicados; el hallazgo bloqueante queda cubierto por tipo y por test.

## Gate del leader (2026-11-12)
- Tras `npx prisma generate` desde este worktree, `./init.sh` con la base slt123_pago: `INIT_EXIT=0` (log `C:\Users\ArqDev\AppData\Local\Temp\claudeab05f6b97f87a08ea1d74f-bdf8-43cf-8e34-62eab06db841\scratchpad\gate-123.log`).
