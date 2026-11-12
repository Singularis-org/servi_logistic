# SLT-123 «Pago al mensajero independiente del efectivo» — tasks

> Requisitos: `requirements.md` (R310-R335). Diseño: `design.md`. `[P]` = paralelizable con la task
> anterior del mismo bloque. Antes de cualquier `vitest` o migración: base desechable exportada y
> `.env` copiado al worktree (memorias del leader «vitest related toca la base local» y «worktree sin
> .env = gate ciego»). No usar `prisma migrate reset`.
> **Ver PA4:** si Carlos elige el corte, las tasks marcadas **[S]** van a la segunda ficha.

## T0 — Medir antes de tocar (sin código de producción)

- [ ] **T0.1** Confirmar que `CierresAdminRepository.resolverCierre` es el único sitio que pasa un
  `cierre_dia` a `aprobado` (revisar los `updateMany` de `CierresAdminRepository.ts:1907, 2207, 2329,
  3053`, `CierreDiaRepository.ts` y `CierreBodegaRepository.ts:480`). Hecho: lista escrita en
  `progress/impl_SLT-123.md` con línea y qué estado escribe cada uno. Si aparece otro camino a
  `aprobado`, PARA y avisa al leader (R310 tendría que cubrirlo).
- [ ] **T0.2** Confirmar que la definición vigente de `pago_mensajero_movimiento_tipo_categoria_check`
  es la de `20261030120100_incentivo_mensajero_checks` (leyendo `pg_constraint` en la base desechable
  con todas las migraciones). Hecho: definición pegada en `progress/impl_SLT-123.md`.
- [ ] **T0.3** Con la marca puesta a mano (rama local, sin commitear), correr los tests de integración
  y los E2E que nombran `pago_efectivo`, «Pago del efectivo», «Liquidado» o «del efectivo» y listar los
  que caen. Hecho: lista en `progress/impl_SLT-123.md` con el motivo de cada uno; actualiza
  `## Archivos esperados` si sale uno que no está.
- [ ] **T0.4** Comprobar que `servi_app` puede hacer `UPDATE` de una columna nueva de `cierre_dia`
  (permisos de tabla, no por columna). Hecho: consulta a `information_schema.column_privileges` /
  `role_table_grants` anotada. Si son por columna, la migración de T1.3 lleva el `GRANT`.
- [ ] **T0.5** (Carlos, en prod, transacción READ ONLY) Contar `cierre_dia` en `solicitado`/`vencido` y
  consolidables de satélite (aprobados con `cierre_bodega_id IS NULL`). Hecho: números anotados; es
  informativo (dice cuántos cierres entrarán con la regla nueva y cuántas consolidaciones serán mixtas).

## T1 — Esquema y migraciones (depende de T0.2, T0.4)

- [ ] **T1.1** `db/schema.prisma`: `pagoIndependienteEfectivo Boolean @default(false)
  @map("pago_independiente_efectivo")` en `CierreDia` y `pago_satelite` **[S]** en
  `PagoMensajeroMovimientoCategoria`, con comentario. Hecho: `prisma validate` y `prisma generate` sin
  error (avisar antes de generar: `node_modules` compartido).
- [ ] **T1.2** **[S]** `db/migrations/20261114120000_pago_satelite_enum/migration.sql` y `down.sql`
  (design §3.1; función dinámica copiada de SLT-68, renombrada `_slt123`). Hecho: sube y baja en la
  base desechable; con una fila `pago_satelite`, el down aborta.
- [ ] **T1.3** `db/migrations/20261114120100_pago_independiente_efectivo/migration.sql` y `down.sql`
  (design §3.2). Hecho: sube y baja; el down aborta con un cierre marcado o una fila `pago_satelite`.
- [ ] **T1.4** `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` (design §11.2). Hecho: verde;
  cubre R312 y R330.

## T2 — La marca al aprobar (depende de T1)

- [ ] **T2.1** `CierresAdminRepository.resolverCierre`: `pagoIndependienteEfectivo: true` en el
  `updateMany` solo si `nuevoEstado === "aprobado"` (design §2). Hecho: R310 y R311 en verde en la
  integración (casos 2 y 9 de design §11.1).
- [ ] **T2.2** `toResumen` y los `select` de los listados de `CierresAdminRepository` traen la marca;
  `CierreAdminResumen` (`lib/interfaces/services/ICierresAdminService.ts`) la declara. Hecho: typecheck.

## T3 — El feed (depende de T1)

- [ ] **T3.1** `WalletMensajeroFeedService` + `IWalletMensajeroFeedService` (design §4.1). La rama de
  satélite es **[S]**. Hecho: `tests/unit/services/wallet-mensajero-feed-service.test.ts` cubre viejo
  (central y satélite), nuevo central (E ≥ P y E < P), nuevo satélite, P = 0 en los tres.
- [ ] **T3.2** `[P]` `lib/types/wallet-mensajero.ts`: `pago_satelite` en las dos SEED **[S]**. Hecho: la
  guardia que compara la SEED con el enum, en verde.

## T4 — Lo pendiente (depende de T1)

- [ ] **T4.1** `derivarPendienteCierre` con el contrato de design §5.1. Hecho:
  `tests/unit/utils/pendiente-cierre.test.ts` con la tabla de abajo, importes escritos a mano, y la
  aserción de «sin coma flotante» que ya lee el archivo, extendida a los campos nuevos (R332).

  | Marca | P | E | premios | vigentes | pagado satélite | Esperado |
  |---|---|---|---|---|---|---|
  | false | 3000.00 | 1000.00 | 0.00 | 0.00 | 0.00 | 2000.00 |
  | false | 3000.00 | 5000.00 | 0.00 | 0.00 | 0.00 | 0.00 |
  | false | 3000.00 | 1000.00 | 0.00 | 0.00 | 2000.00 | 2000.00 (se ignora) |
  | true | 3000.00 | 5000.00 | 0.00 | 0.00 | 0.00 | 3000.00 |
  | true | 3000.00 | 0.00 | 500.00 | 1000.00 | 0.00 | 2500.00 |
  | true | 2500.00 | 4000.00 | 0.00 | 0.00 | 2500.00 | 0.00 |
  | true | 3000.00 | 0.00 | 0.00 | 3500.00 | 0.00 | 0.00 (nunca negativo) |
  | true | 0.00 | 1000.00 | 0.00 | 0.00 | 0.00 | 0.00 |

- [ ] **T4.2** **[S]** `IPagoMensajeroMovimientoRepository.sumarPagadoSatelitePorCierre` y su
  implementación (design §5.2). Hecho: la integración (caso 11) prueba que una empresa no suma la otra
  (R333) y que con ids sin filas devuelve `"0.00"` por id.

## T5 — Los consumidores (depende de T2, T4)

- [ ] **T5.1** `CierresAdminService.conPendiente` y `pendienteTrasAprobar`. Hecho:
  `tests/unit/services/cierres-admin-pendiente.test.ts` con un cierre viejo y uno nuevo en la misma
  página; el repositorio de «pagado por la satélite» se llama una vez por página (R320, R334).
- [ ] **T5.2** `[P]` `CierreDiaService.conPendientePago` + `findCierresByMensajeroPaginado` +
  `CierrePasadoDTO`. Hecho: `tests/unit/services/cierre-dia-pendiente-pago.test.ts` y la tabla de
  `tests/integration/db/cierre-dia-pendiente-pago.test.ts` ganan las filas de cierre nuevo (R320, R334).
- [ ] **T5.3** `[P]` `LiquidacionService` (`imputablesDe`, `restanteTrasAnular`, `pendienteDelCierre`) +
  `LiquidacionPagoRepository` (`obtenerCierreParaPago`, `listarCierresImputablesEnAlcance`) +
  `ILiquidacionPagoRepository` (`CierreParaPagoDTO`). Hecho: `tests/unit/services/liquidacion-service.test.ts`
  con un cierre nuevo central: tope = P con E ≥ P; reparto lo imputa; anular devuelve el restante
  correcto (R316, R321).

## T6 — Composition roots (depende de T4.2, T5) [S]

- [ ] **T6.1** `lib/actions/cierre-dia.ts` y `lib/actions/cierres-admin.ts` inyectan la lectura nueva.
  Hecho: `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` y
  `tests/integration/actions/cierres-admin-action.test.ts` afirman, contra la base, que la acción de
  producción emite `"0.00"` en un cierre nuevo de satélite conciliado (y no `P`) (R335).

## T7 — La consolidación (depende de T1) [S]

- [ ] **T7.1** `CierreBodegaRepository` (consolidables con la marca) + `ICierreBodegaService` +
  `CierreBodegaService.listarConsolidacion` (design §6). Hecho:
  `tests/unit/services/cierre-bodega-service.test.ts`: todos viejos = cifras de hoy (literal de `dev`);
  todos nuevos = «La central debe» `0.00`; mixto = solo los viejos con su propio efectivo (R322, R323).
- [ ] **T7.2** `[P]` `cola-cierres-labels.ts > notaPagoMensajeros` sin «· se paga del efectivo» (R324,
  según PA1). Hecho: `tests/unit/utils/cola-cierres-vista.test.ts` con n = 1 y n = 3; los tests y E2E que
  leían el texto viejo, actualizados.

## T8 — Catálogos de la categoría nueva (depende de T1.1) [S]

- [ ] **T8.1** `wallet-mensajeros-labels.ts`, `aporte-por-orden.ts`, `estado-cuenta-chips.ts`,
  `lib/analytics/metrics.ts` (design §7). Hecho: typecheck en verde (los `Record` totales lo exigen) y
  `tests/unit/utils/slt123-categoria-pago-satelite.test.ts`: rótulo «Pagado por la satélite», fuente
  `snapshot_gestion/pago_mensajero`, chip «cierres», presente en el catálogo de la métrica (R329).

## T9 — Integración y mutaciones (depende de T2-T8)

- [ ] **T9.1** `tests/integration/db/slt123-pago-independiente.int.test.ts` con los once casos de
  design §11.1. Hecho: verde contra Postgres real, con la foto de V1/V2 idéntica antes y después.
- [ ] **T9.2** Mutaciones. Cada una se aplica a mano, se corre el test indicado, **debe caer**, y se
  revierte. Antes de creer un «sobrevive», comprobar que el test se ejecutó (nombre y número de tests en
  la salida). Resultado en `progress/impl_SLT-123.md` (mutación, test, rojo/verde, línea del fallo).

  | # | Mutación | Debe caer |
  |---|---|---|
  | M1 | Feed: invertir la condición (`if (cierre.pagoIndependienteEfectivo)` → regla vieja) | integración casos 2 y 5; feed unit |
  | M2 | Pendiente: invertir la condición de la marca | `pendiente-cierre.test.ts` filas 1, 4; integración caso 3 |
  | M3 | Migración: `DEFAULT true` | migración (todos en `false`); integración caso 1 |
  | M4 | No poner la marca al aprobar | integración caso 2 |
  | M5 | Poner la marca también al rechazar (`data` sin la condición) | integración caso 9 |
  | M6 | Regla nueva con `calcularSplitPago(P,E).pendiente` en vez de `P` | `pendiente-cierre.test.ts` fila 4; integración caso 3 (N1 `0.00`) |
  | M7 | Pendiente nuevo sin restar lo pagado por la satélite | `pendiente-cierre.test.ts` fila 6; integración caso 6 |
  | M8 | Pendiente viejo restando lo pagado por la satélite | `pendiente-cierre.test.ts` fila 3 |
  | M9 | Decidir la regla por destino (`destinoTipo === "bodega_satelite"`) en vez de la marca | integración casos 3 y 5 |
  | M10 | Decidir la regla por fecha (`resueltoAt > <hoy>`) en vez de la marca | integración caso 1 o 3 (V1 resuelto con fecha fija) |
  | M11 | Feed satélite nuevo escribe `pago_efectivo` en vez de `pago_satelite` | feed unit; integración caso 6 |
  | M12 | Feed central nuevo escribe además `pago_efectivo = min(P,E)` | feed unit; integración caso 2 |
  | M13 | «La central debe» con todos los consolidables (sin filtrar viejos) | `cierre-bodega-service.test.ts` mixto y todos nuevos; integración caso 8 |
  | M14 | Reparto viejo con el efectivo de todo el conjunto (no solo el de los viejos) | `cierre-bodega-service.test.ts` mixto |
  | M15 | `sumarPagadoSatelitePorCierre` sin `origenId in` | integración caso 11 / unit del repo |
  | M16 | Acción de producción sin inyectar la lectura | `cierre-dia-pendiente-cableado.test.ts`, `cierres-admin-action.test.ts` |
  | M17 | `Number(...)` en el cálculo de lo pendiente | aserción de coma flotante de `pendiente-cierre.test.ts` |
  | M18 | Quitar el `CHECK` de origen de `pago_satelite` | migración (R330) |

## T10 — Tests y E2E existentes (depende de T0.3, T9)

- [ ] **T10.1** Actualizar los tests de integración que T0.3 listó (previstos: caracterizaciones
  `454` y `455` `dinero-aprobacion`, `slt73-aprobar-central-igual`, `slt73-marcar-asienta`,
  `tarifas-valor-propio-caminos`, `pago-mensajero-idempotencia`). Regla: si el test caracteriza la
  aprobación de hoy, pasa a la regla nueva con sus importes escritos a mano; si prueba otra cosa y
  usaba la aprobación como montaje, se le da un cierre viejo (fixture con la marca en `false`). Nunca
  se borra una aserción sin sustituirla. Hecho: verdes, y cada cambio con su motivo en
  `progress/impl_SLT-123.md`.
- [ ] **T10.2** `[P]` E2E que T0.3 listó (previstos: `ajuste-pago-mensajero-cierre`,
  `tarifas-valor-propio-mensajero`, `cierre-modelo-nuevo-plan-porcentual`, `cierres-rediseno`,
  `wallet-mensajeros`, `incentivo-mensajero-slt68`). Mismo criterio. Hecho: el grupo `dinero` entero
  verde en local con base desechable nueva (`docs/perfil-agentes.md > E2E en local antes del PR`).

## T11 — Cierre

- [ ] **T11.1** `./init.sh` en verde en el worktree. `INIT_EXIT=$?` escrito dentro del log.
- [ ] **T11.2** `progress/impl_SLT-123.md` con el mapa R → test (abajo), las mutaciones y el tamaño
  medido por `scripts/tamano-pr.mjs`.

## Trazabilidad

| R | Test | Caso |
|---|---|---|
| R310 | `tests/integration/db/slt123-pago-independiente.int.test.ts` | caso 2: N1 aprobado → marca `true`; transacción revertida → `false` |
| R311 | ídem | caso 9: rechazar, conciliar, pagar, anular, incentivo no tocan la marca |
| R312 | `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` | conteos y sumas iguales; todos `false`; down aborta y revierte |
| R313 | `tests/unit/services/wallet-mensajero-feed-service.test.ts` + integración caso 2 | nuevo central E ≥ P: solo devengo; P = 0: nada |
| R314 | integración caso 2 | egreso `3000.00` en caja |
| R315 | `tests/unit/utils/pendiente-cierre.test.ts` | filas 4-8 |
| R316 | integración caso 4 + `tests/unit/services/liquidacion-service.test.ts` | tope = P; pagar P deja `0.00` |
| R317 | feed unit + integración caso 6 | devengo + `pago_satelite`, fecha de conciliación |
| R318 | integración caso 7 | segunda llamada sin filas nuevas |
| R319 | integración caso 6 | `2500.00` antes, `0.00` después |
| R320 | `tests/unit/services/cierres-admin-pendiente.test.ts`, `tests/unit/services/cierre-dia-pendiente-pago.test.ts`, `tests/integration/db/cierre-dia-pendiente-pago.test.ts` | página con viejo y nuevo |
| R321 | `tests/unit/services/liquidacion-service.test.ts` | pago directo, reparto, anular, tras aprobar |
| R322 | `tests/unit/services/cierre-bodega-service.test.ts` + integración caso 8 | todos viejos, todos nuevos, mixto |
| R323 | ídem | neto `11500.00` en el mixto; idéntico con todos viejos |
| R324 | `tests/unit/utils/cola-cierres-vista.test.ts` | n = 1 y n = 3 |
| R325 | `pendiente-cierre.test.ts` filas 1-3 + feed unit + integración casos 3 y 5 | regla de la 44 intacta |
| R326 | integración caso 1 | foto de V1/V2 idéntica |
| R327 | integración casos 3 y 5 + mutaciones M9 y M10 | central viejo y satélite nuevo |
| R328 | integración caso 4 | cuenta por pagar sube P y baja con el pago; 0 con N2 conciliado |
| R329 | `tests/unit/utils/slt123-categoria-pago-satelite.test.ts` | rótulo, fuente, chip, catálogo |
| R330 | `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` | 23514 con `devengo` y con origen `manual` |
| R331 | integración caso 10 | caja, deuda, premios, conciliación analítica iguales |
| R332 | `pendiente-cierre.test.ts` (lectura del archivo) + `wallet-mensajero-feed-service.test.ts` | sin coma flotante |
| R333 | integración caso 11 | dos empresas |
| R334 | `cierres-admin-pendiente.test.ts`, `cierre-dia-pendiente-pago.test.ts` | una llamada por página |
| R335 | `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`, `tests/integration/actions/cierres-admin-action.test.ts` | la acción real inyecta la lectura |

## Tamaño

Límite (`gate.tamano_pr` sin valor en `arnes.config.json` → por defecto): 40 archivos y 1 000 líneas
(añadidas + borradas). No cuentan `specs/` ni `progress/`.

**Producción** (estimación):

| Bloque | Archivos | Líneas |
|---|---|---|
| Esquema + 2 migraciones (4 SQL; ~160 del `down.sql` dinámico del enum) | 5 | ~240 |
| Marca al aprobar + DTO/listados de `/cierres-admin` | 2 | ~20 |
| Feed + interfaz | 2 | ~45 |
| `derivarPendienteCierre` | 1 | ~30 |
| Lectura nueva (repo + interfaz) | 2 | ~40 |
| Consumidores (CierresAdmin, CierreDia + repo + DTO, Liquidación + repo + interfaz) | 7 | ~70 |
| Composition roots | 2 | ~8 |
| Consolidación (servicio, repo, interfaz) | 3 | ~40 |
| Catálogos y rótulos | 6 | ~20 |
| **Total** | **30** | **~515** |

**Tests** (~2× la lógica que cubren):

| Bloque | Archivos | Líneas |
|---|---|---|
| Integración nueva (§11.1) | 1 | ~380 |
| Migración ida y vuelta | 1 | ~110 |
| Unit: pendiente, feed, consolidación, CierresAdmin, CierreDia, Liquidación, vista, categoría | 8 | ~330 |
| Integración existentes: pendiente cierre-dia, dos cableados | 3 | ~40 |
| Existentes que caen (T10.1, previstos) | 6 | ~120 |
| **Total** | **19** | **~980** |

**E2E** que caen (T10.2, previstos): hasta 6 archivos, ~60 líneas.

**Total: 49-55 archivos, ~1 500-1 560 líneas.** No cabe. Corte natural en `requirements.md > PA4`
(tasks marcadas **[S]** = segunda rebanada): primera «Central» ~30 archivos / ~780 líneas; segunda
«Satélite» ~24 archivos / ~780 líneas.

## Archivos esperados

Producción:
- `db/schema.prisma`
- `db/migrations/20261114120000_pago_satelite_enum/migration.sql`
- `db/migrations/20261114120000_pago_satelite_enum/down.sql`
- `db/migrations/20261114120100_pago_independiente_efectivo/migration.sql`
- `db/migrations/20261114120100_pago_independiente_efectivo/down.sql`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/WalletMensajeroFeedService.ts`
- `lib/interfaces/services/IWalletMensajeroFeedService.ts`
- `lib/utils/pendiente-cierre.ts`
- `lib/repositories/PagoMensajeroMovimientoRepository.ts`
- `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`
- `lib/services/CierreDiaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/services/LiquidacionService.ts`
- `lib/repositories/LiquidacionPagoRepository.ts`
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts`
- `lib/actions/cierre-dia.ts`
- `lib/actions/cierres-admin.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/types/wallet-mensajero.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/estado-cuenta-chips.ts`
- `lib/analytics/metrics.ts`
- `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`

Tests nuevos:
- `tests/integration/db/slt123-pago-independiente.int.test.ts`
- `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts`
- `tests/unit/utils/slt123-categoria-pago-satelite.test.ts`

Tests que se amplían:
- `tests/unit/utils/pendiente-cierre.test.ts`
- `tests/unit/services/wallet-mensajero-feed-service.test.ts`
- `tests/unit/services/cierre-bodega-service.test.ts`
- `tests/unit/services/cierres-admin-pendiente.test.ts`
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
- `tests/unit/services/liquidacion-service.test.ts`
- `tests/unit/utils/cola-cierres-vista.test.ts`
- `tests/integration/db/cierre-dia-pendiente-pago.test.ts`
- `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`
- `tests/integration/actions/cierres-admin-action.test.ts`

Tests y E2E previstos que caen (los confirma T0.3):
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts`
- `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts`
- `tests/integration/db/slt73-aprobar-central-igual.int.test.ts`
- `tests/integration/db/slt73-marcar-asienta.int.test.ts`
- `tests/integration/db/tarifas-valor-propio-caminos.test.ts`
- `tests/integration/db/pago-mensajero-idempotencia.test.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/tarifas-valor-propio-mensajero.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/wallet-mensajeros.spec.ts`
- `e2e/incentivo-mensajero-slt68.spec.ts`
