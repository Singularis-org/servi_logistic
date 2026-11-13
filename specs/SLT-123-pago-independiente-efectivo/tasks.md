# SLT-123 «Pago al mensajero independiente del efectivo» — tasks

> Requisitos: `requirements.md` (de SLT-123: R310-R316, R320, R321, R325-R328, R331, R332). Diseño:
> `design.md` (las partes **[SLT-139]** no se implementan aquí). `[P]` = paralelizable con la task
> anterior del mismo bloque. Antes de cualquier `vitest` o migración: base desechable exportada y
> `.env` copiado al worktree (memorias del leader «vitest related toca la base local» y «worktree sin
> .env = gate ciego»). No usar `prisma migrate reset`.
> **Partida el 2026-11-12 (D8).** Lo de satélite está en `## Fuera de alcance → SLT-139`.

## T0 — Medir antes de tocar (sin código de producción)

- [x] **T0.1** Confirmar que `CierresAdminRepository.resolverCierre` es el único sitio que pasa un
  `cierre_dia` a `aprobado` (revisar los `updateMany` de `CierresAdminRepository.ts:1907, 2207, 2329,
  3053`, `CierreDiaRepository.ts` y `CierreBodegaRepository.ts:480`). Hecho: lista escrita en
  `progress/impl_SLT-123.md` con línea y qué estado escribe cada uno. Si aparece otro camino a
  `aprobado`, PARA y avisa al leader (R310 tendría que cubrirlo).
- [x] **T0.2** Con la marca puesta a mano en la aprobación central (rama local, sin commitear), correr
  los tests de integración y los E2E que nombran `pago_efectivo`, «Pago del efectivo», «Liquidado» o
  «del efectivo» y listar los que caen. Hecho: lista en `progress/impl_SLT-123.md` con el motivo de
  cada uno; actualiza `## Archivos esperados` si sale uno que no está (y avisa si el total pasa de 40).
- [x] **T0.3** `[P]` Comprobar que `servi_app` puede hacer `UPDATE` de una columna nueva de `cierre_dia`
  (permisos de tabla, no por columna). Hecho: consulta a `information_schema.column_privileges` /
  `role_table_grants` anotada. Si son por columna, la migración de T1.2 lleva el `GRANT`.
- [ ] **T0.4** (DIFERIDA: consulta de solo lectura a prod no ejecutada (bloqueada para agentes); es
  informativa y no condiciona el código; Carlos la puede correr cuando quiera.) (Carlos, en prod, transacción READ ONLY) Contar `cierre_dia` de la central en
  `solicitado`/`vencido`, y los de satélite en esos estados. Hecho: números anotados; es informativo
  (cuántos cierres de la central entran con la regla nueva y cuántos de satélite se quedarán viejos
  si se aprueban antes de SLT-139, `design.md > 13`).

## T1 — Esquema y migración (depende de T0.3)

- [x] **T1.1** `db/schema.prisma`: `pagoIndependienteEfectivo Boolean @default(false)
  @map("pago_independiente_efectivo")` en `CierreDia`, con comentario. **Sin** `pago_satelite` (D13).
  Hecho: `prisma validate` y `prisma generate` sin error (avisar antes de generar: `node_modules`
  compartido).
- [x] **T1.2** `db/migrations/20261114120000_pago_independiente_efectivo/migration.sql` y `down.sql`
  (design §3.2-SLT-123). Hecho: sube y baja en la base desechable; el down aborta con un cierre marcado.
- [x] **T1.3** `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` (design §11.2). Hecho: verde;
  cubre R312.

## T2 — La marca al aprobar (depende de T1)

- [x] **T2.1** `CierresAdminRepository.resolverCierre`: dentro de la rama aprobada, si el destino es
  `bodega_central`, `updateMany` de la marca **antes** de `asentarCierreDia` (design §2). Hecho: R310 y
  R311 en verde en la integración (casos 2, 6 y 7 de design §11.1).
- [x] **T2.2** `[P]` `toResumen` y los `select` de los listados de `CierresAdminRepository` traen la
  marca; `CierreAdminResumen` (`lib/interfaces/services/ICierresAdminService.ts`) la declara. Hecho:
  typecheck.

## T3 — El feed (depende de T1)

- [x] **T3.1** `WalletMensajeroFeedService` + `IWalletMensajeroFeedService` (design §4.1, versión
  SLT-123: sin rama de satélite). Hecho: `tests/unit/services/wallet-mensajero-feed-service.test.ts`
  cubre viejo central y viejo satélite (`pago_efectivo = min(P,E)`), nuevo central con E ≥ P y E < P
  (solo devengo), P = 0 en viejo y nuevo (nada).

## T4 — Lo pendiente (depende de T1)

- [x] **T4.1** `derivarPendienteCierre` con el contrato de design §5.1 (versión SLT-123: sin
  `pagadoPorSatelite`). Hecho: `tests/unit/utils/pendiente-cierre.test.ts` con la tabla de abajo,
  importes escritos a mano, y la aserción de «sin coma flotante» que ya lee el archivo, extendida a la
  rama nueva (R332).

  | # | Marca | P | E | premios | vigentes | Esperado |
  |---|---|---|---|---|---|---|
  | 1 | false | 3000.00 | 1000.00 | 0.00 | 0.00 | 2000.00 |
  | 2 | false | 3000.00 | 5000.00 | 0.00 | 0.00 | 0.00 |
  | 3 | true | 3000.00 | 5000.00 | 0.00 | 0.00 | 3000.00 |
  | 4 | true | 3000.00 | 0.00 | 500.00 | 1000.00 | 2500.00 |
  | 5 | true | 3000.00 | 0.00 | 0.00 | 3500.00 | 0.00 (nunca negativo) |
  | 6 | true | 0.00 | 1000.00 | 0.00 | 0.00 | 0.00 |

## T5 — Los consumidores (depende de T2, T4)

- [x] **T5.1** `CierresAdminService.conPendiente` y `pendienteTrasAprobar` pasan la marca. Hecho:
  `tests/unit/services/cierres-admin-pendiente.test.ts` con un cierre viejo y uno nuevo de la central
  en la misma página, y uno viejo de satélite con el pendiente de hoy (R320).
- [x] **T5.2** `[P]` `CierreDiaService.conPendientePago` + `findCierresByMensajeroPaginado` +
  `CierrePasadoDTO`. Hecho: `tests/unit/services/cierre-dia-pendiente-pago.test.ts` y la tabla de
  `tests/integration/db/cierre-dia-pendiente-pago.test.ts` ganan las filas de cierre nuevo (R320).
- [x] **T5.3** `[P]` `LiquidacionService` (`imputablesDe`, `restanteTrasAnular`, `pendienteDelCierre`) +
  `LiquidacionPagoRepository` (`obtenerCierreParaPago`, `listarCierresImputablesEnAlcance`) +
  `ILiquidacionPagoRepository` (`CierreParaPagoDTO`). Hecho: `tests/unit/services/liquidacion-service.test.ts`
  con un cierre nuevo central: tope = P con E ≥ P; reparto lo imputa; anular devuelve el restante
  correcto; pendiente tras aprobar = P (R316, R321).

## T6 — Integración y mutaciones (depende de T2-T5)

- [x] **T6.1** `tests/integration/db/slt123-pago-independiente.int.test.ts` con los ocho casos de
  design §11.1. Hecho: verde contra Postgres real, con la foto de V1/V2 idéntica antes y después.
- [x] **T6.2** Mutaciones. Cada una se aplica a mano, se corre el test indicado, **debe caer**, y se
  revierte. Antes de creer un «sobrevive», comprobar que el test se ejecutó (nombre y número de tests en
  la salida). Resultado en `progress/impl_SLT-123.md` (mutación, test, rojo/verde, línea del fallo).

  | # | Mutación | Debe caer |
  |---|---|---|
  | M1 | Feed: invertir la condición (`if (cierre.pagoIndependienteEfectivo)` → regla vieja) | integración casos 2 y 6; feed unit |
  | M2 | Pendiente: invertir la condición de la marca | `pendiente-cierre.test.ts` filas 1 y 3; integración caso 3 |
  | M3 | Migración: `DEFAULT true` | migración (todos en `false`); integración caso 1 |
  | M4 | No poner la marca al aprobar | integración caso 2 |
  | M5 | Poner la marca también al rechazar | integración caso 7 |
  | M6 | Regla nueva con `calcularSplitPago(P,E).pendiente` en vez de `P` | `pendiente-cierre.test.ts` fila 3; integración caso 3 (N1 `0.00`) |
  | M7 | Decidir la regla del pendiente por destino (`destinoTipo === "bodega_central"`) en vez de la marca | integración caso 3 (V1 central viejo pasa a `3000.00`) |
  | M8 | Decidir la regla por fecha (`resueltoAt > <hoy>`) en vez de la marca | integración caso 1 o 3 (V1 resuelto con fecha fija) |
  | M9 | Feed central nuevo escribe además `pago_efectivo = min(P,E)` | feed unit; integración caso 2 |
  | M10 | `Number(...)` en el cálculo de lo pendiente | aserción de coma flotante de `pendiente-cierre.test.ts` |
  | M11 | Marca a todo cierre aprobado (quitar la condición `bodega_central`) | integración caso 6 (S1 con marca `true` y sin `pago_efectivo`) |
  | M12 | Escribir la marca **después** de `asentarCierreDia` | integración caso 2 (libro de N1 con `pago_efectivo`) |
  | M13 | Escribir la marca fuera de la transacción (con `this.prisma` en vez de `tx`) | integración caso 2 (rollback forzado deja la marca en `true`) |

## T7 — Tests y E2E existentes (depende de T0.2, T6)

- [x] **T7.1** Actualizar los tests de integración que T0.2 listó (previstos: caracterizaciones
  `454` y `455` `dinero-aprobacion`, `slt73-aprobar-central-igual`, `tarifas-valor-propio-caminos`,
  `pago-mensajero-idempotencia`). Regla: si el test caracteriza la aprobación de hoy, pasa a la regla
  nueva con sus importes escritos a mano; si prueba otra cosa y usaba la aprobación como montaje, se le
  da un cierre viejo (fixture con la marca en `false`). Nunca se borra una aserción sin sustituirla.
  Hecho: verdes, y cada cambio con su motivo en `progress/impl_SLT-123.md`.
- [x] **T7.2** `[P]` E2E que T0.2 listó (previstos: `ajuste-pago-mensajero-cierre`,
  `tarifas-valor-propio-mensajero`, `cierre-modelo-nuevo-plan-porcentual`, `cierres-rediseno`,
  `wallet-mensajeros`, `incentivo-mensajero-slt68`). Mismo criterio. Hecho: el grupo `dinero` entero
  verde en local con base desechable nueva (`docs/perfil-agentes.md > E2E en local antes del PR`).

## T8 — Cierre

- [x] **T8.1** `./init.sh` en verde en el worktree. `INIT_EXIT=$?` escrito dentro del log.
- [x] **T8.2** `progress/impl_SLT-123.md` con el mapa R → test (abajo), las mutaciones y el tamaño
  medido por `scripts/tamano-pr.mjs`.

**Total: 20 tasks** (T0.1-T0.4, T1.1-T1.3, T2.1-T2.2, T3.1, T4.1, T5.1-T5.3, T6.1-T6.2, T7.1-T7.2,
T8.1-T8.2).

## Trazabilidad

| R | Test | Caso |
|---|---|---|
| R310 | `tests/integration/db/slt123-pago-independiente.int.test.ts` | caso 2: N1 aprobado → marca `true`; transacción revertida → `false`. Caso 6: S1 (satélite) aprobado → `false` |
| R311 | ídem | caso 7: rechazar, conciliar, pagar, anular, incentivo no tocan la marca |
| R312 | `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` | conteos y sumas iguales; todos `false`; down aborta con un cierre marcado y, sin él, revierte |
| R313 | `tests/unit/services/wallet-mensajero-feed-service.test.ts` + integración caso 2 | nuevo central E ≥ P: solo devengo; P = 0: nada |
| R314 | integración caso 2 | egreso `3000.00` en caja |
| R315 | `tests/unit/utils/pendiente-cierre.test.ts` | filas 3-6 |
| R316 | integración caso 4 + `tests/unit/services/liquidacion-service.test.ts` | tope = P; pagar P deja `0.00` |
| R320 | `tests/unit/services/cierres-admin-pendiente.test.ts`, `tests/unit/services/cierre-dia-pendiente-pago.test.ts`, `tests/integration/db/cierre-dia-pendiente-pago.test.ts` | página con viejo y nuevo |
| R321 | `tests/unit/services/liquidacion-service.test.ts` + integración «R321: el reparto «Pagar» con el repositorio real» | pago directo, reparto, anular, tras aprobar; reparto real: N1 `3000.00`, V1 `2000.00` |
| R325 | `pendiente-cierre.test.ts` filas 1-2 + feed unit + integración casos 3, 5 y 6 | regla de la 44 intacta, también en la satélite aprobada con SLT-123 |
| R326 | integración caso 1 | foto de V1/V2 idéntica |
| R327 | integración casos 3 y 6 + mutaciones M7 y M8 | central viejo y satélite sin marca |
| R328 | integración caso 4 | cuenta por pagar sube P al aprobar y baja con el pago |
| R331 | integración caso 8 (dos `it`) | caja, tienda y premios de N1 iguales a los de V1; `paraLaCentral` de S1 (aprobado con el código nuevo) `1500.00` |
| R332 | `pendiente-cierre.test.ts` (lectura del archivo) + `wallet-mensajero-feed-service.test.ts` | sin coma flotante |

R317-R319, R322-R324, R329, R330, R333-R338: de SLT-139 (`requirements.md > Fuera de alcance`).

## Tamaño

Límite (`gate.tamano_pr` sin valor en `arnes.config.json` → por defecto): 40 archivos y 1 000 líneas
(añadidas + borradas). No cuentan `specs/` ni `progress/`.

**Producción** (estimación):

| Bloque | Archivos | Líneas |
|---|---|---|
| Esquema + 1 migración (2 SQL) | 3 | ~30 |
| Marca al aprobar + DTO/listados de `/cierres-admin` | 2 | ~25 |
| Feed + interfaz | 2 | ~25 |
| `derivarPendienteCierre` | 1 | ~20 |
| Consumidores (CierresAdmin, CierreDia + repo + interfaz, Liquidación + repo + interfaz) | 7 | ~60 |
| **Total** | **15** | **~160** |

**Tests:**

| Bloque | Archivos | Líneas |
|---|---|---|
| Integración nueva (§11.1, ocho casos) | 1 | ~300 |
| Migración ida y vuelta (solo la columna) | 1 | ~60 |
| Unit: pendiente, feed, CierresAdmin, CierreDia, Liquidación | 5 | ~180 |
| Integración existente: pendiente de `/cierre-dia` | 1 | ~15 |
| Existentes que caen (T7.1, previstos) | 5 | ~100 |
| **Total** | **13** | **~655** |

**E2E** que caen (T7.2, previstos): hasta 6 archivos, ~60 líneas.

**Total SLT-123: 28-34 archivos, ~815-875 líneas** (15 de producción / ~160; 13-19 de tests y E2E /
~655-715). Cabe en 40 archivos y 1 000 líneas. Ojo: con los 6 E2E previstos son 34 archivos, por
encima del 80% (32); si T0.2 encuentra más de 6 archivos que caen, el leader decide antes de seguir.

Antes del corte: 49-55 archivos, ~1 500-1 560 líneas. SLT-139 (estimación, la mide su spec): ~24
archivos y ~800 líneas (~360 de producción, de ellas ~200 de SQL; ~440 de tests).

## Archivos esperados

Producción:
- `db/schema.prisma`
- `db/migrations/20261114120000_pago_independiente_efectivo/migration.sql`
- `db/migrations/20261114120000_pago_independiente_efectivo/down.sql`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/WalletMensajeroFeedService.ts`
- `lib/interfaces/services/IWalletMensajeroFeedService.ts`
- `lib/utils/pendiente-cierre.ts`
- `lib/services/CierreDiaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/services/LiquidacionService.ts`
- `lib/repositories/LiquidacionPagoRepository.ts`
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts` (T0.2/T2.2: la fila del repositorio declara la marca)

Tests nuevos:
- `tests/integration/db/slt123-pago-independiente.int.test.ts`
- `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts`

Tests que se amplían:
- `tests/unit/utils/pendiente-cierre.test.ts`
- `tests/unit/services/wallet-mensajero-feed-service.test.ts`
- `tests/unit/services/cierres-admin-pendiente.test.ts`
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
- `tests/unit/services/liquidacion-service.test.ts`
- `tests/integration/db/cierre-dia-pendiente-pago.test.ts`

Tests que solo ganan el campo obligatorio `pagoIndependienteEfectivo: false` (T0.2: el compilador los
señaló al hacer obligatorio el campo de `derivarPendienteCierre`; caracterizan la regla de la 44):
- `tests/integration/db/liquidacion-idempotencia.test.ts`
- `tests/integration/db/premio-ranking-idempotencia.test.ts`
- `tests/unit/guards/caja-173-alcance.guardia.test.ts`
- `tests/unit/services/cierre-dia-service-totales-mixtos.test.ts`

Tests y E2E que caen (T0.2, medido el 2026-11-12 con la marca puesta; detalle en `progress/impl_SLT-123.md`):
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts` (en el baseline; en local no siembra: sin medir)
- `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts` (en el baseline; en local no siembra: sin medir)
- `tests/integration/db/slt73-aprobar-central-igual.int.test.ts` (cae)
- `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts` (cae; no estaba previsto)
- ~~`tests/integration/db/tarifas-valor-propio-caminos.test.ts`~~ (no cae: 37/37 verdes con la marca)
- ~~`tests/integration/db/pago-mensajero-idempotencia.test.ts`~~ (no cae: 4/4 verdes con la marca)
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/tarifas-valor-propio-mensajero.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/wallet-mensajeros.spec.ts`
- `e2e/incentivo-mensajero-slt68.spec.ts`

## Fuera de alcance

### → SLT-139 «Pago al mensajero independiente del efectivo: satélite»

Lo que se llevó el corte (D8). SLT-139 lo copia a su `tasks.md` y lo numera allí; aquí no se
implementa. Depende de que SLT-123 esté en `dev`.

Tasks (antes marcadas **[S]**):
- Confirmar la definición vigente de `pago_mensajero_movimiento_tipo_categoria_check` (`pg_constraint`
  en la base desechable con todas las migraciones).
- `pago_satelite` en `PagoMensajeroMovimientoCategoria` (`db/schema.prisma`).
- Migración del enum (`<fecha>_pago_satelite_enum`, `down.sql` dinámico copiado de SLT-68) y migración
  de los `CHECK` (`<fecha>_pago_satelite_checks`), con su ida y vuelta (R330, R337).
- La marca en el mismo `updateMany` que aprueba, para todos los destinos; quitar la escritura aparte
  de SLT-123 (R336).
- Rama de satélite del feed (`destinoTipo` en el `select`, `pago_satelite = P`) y `pago_satelite` en
  `PAGO_MENSAJERO_FEED_CATEGORIA_SEED` (R317, R318).
- `pagadoPorSatelite` en `derivarPendienteCierre` (R338).
- `sumarPagadoSatelitePorCierre` en `PagoMensajeroMovimientoRepository` y su interfaz (R333, R334).
- Inyección en `CierresAdminService`, `CierreDiaService` (`pendientes.pagadoSatelite`),
  `LiquidacionService`, y en las acciones `lib/actions/cierre-dia.ts` y `lib/actions/cierres-admin.ts`
  (R319, R335).
- Consolidación: `CierreBodegaRepository` (consolidables con la marca), `ICierreBodegaService`,
  `CierreBodegaService.listarConsolidacion` (R322, R323).
- Nota de «Pago a mensajeros» sin «· se paga del efectivo» en `cola-cierres-labels.ts` (R324, D9).
- Catálogos de la categoría: `lib/types/wallet-mensajero.ts`, `wallet-mensajeros-labels.ts`,
  `aporte-por-orden.ts`, `estado-cuenta-chips.ts`, `lib/analytics/metrics.ts` (R329).
- Integración de satélite nueva (los casos [SLT-139] de `design.md > 11.1`) y tests existentes de
  conciliación que caigan (previsto: `tests/integration/db/slt73-marcar-asienta.int.test.ts`).

Mutaciones que se llevó (solo prueban satélite): pendiente nuevo sin restar lo pagado por la
satélite; pendiente viejo restándolo; feed satélite nuevo con `pago_efectivo` en vez de
`pago_satelite`; «La central debe» con todos los consolidables; reparto viejo con el efectivo de todo
el conjunto; `sumarPagadoSatelitePorCierre` sin `origenId in`; acción de producción sin inyectar la
lectura; quitar el `CHECK` de origen de `pago_satelite`.

Archivos previstos de SLT-139 (no son de este PR):
- `db/schema.prisma`, `db/migrations/<fecha>_pago_satelite_enum/{migration,down}.sql`,
  `db/migrations/<fecha>_pago_satelite_checks/{migration,down}.sql`
- `lib/repositories/CierresAdminRepository.ts`, `lib/services/WalletMensajeroFeedService.ts`,
  `lib/interfaces/services/IWalletMensajeroFeedService.ts`, `lib/utils/pendiente-cierre.ts`
- `lib/repositories/PagoMensajeroMovimientoRepository.ts`,
  `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`
- `lib/services/CierresAdminService.ts`, `lib/services/CierreDiaService.ts`,
  `lib/services/LiquidacionService.ts`, `lib/actions/cierre-dia.ts`, `lib/actions/cierres-admin.ts`
- `lib/services/CierreBodegaService.ts`, `lib/repositories/CierreBodegaRepository.ts`,
  `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/types/wallet-mensajero.ts`, `lib/utils/aporte-por-orden.ts`, `lib/utils/estado-cuenta-chips.ts`,
  `lib/analytics/metrics.ts`, `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`,
  `components/private/cierres/cola/cola-cierres-labels.ts`
- Tests: `tests/unit/utils/slt123-categoria-pago-satelite.test.ts` (o su nombre en SLT-139),
  `tests/unit/services/cierre-bodega-service.test.ts`, `tests/unit/utils/cola-cierres-vista.test.ts`,
  `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`,
  `tests/integration/actions/cierres-admin-action.test.ts` y los unit de pendiente, feed y servicios.
