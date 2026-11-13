# impl SLT-139 «Pago al mensajero independiente del efectivo: satélite»

> backend_dev, 2026-11-12. Tanda 1 (T0): parada en T0.2 con 41 archivos; Carlos aceptó hasta 45.
> Tanda 2 (T1-T10): hecha. Tanda 3 (merge de SLT-112 + puerto de ganancia + T11): hecha, ver «Tanda 3» al final. T12 pendiente.

## Entorno

- Worktree al día con `origin/dev` (0df9f7b0 es ancestro de HEAD). Junction de `node_modules` creado.
- Base desechable `slt139_satelite`: base nueva + `prisma migrate deploy` (todas las de `dev`, EXIT 0) +
  `pnpm run db:seed` (EXIT 0). Las dos migraciones de SLT-139 **aún no** están aplicadas en ella.
- `prisma generate` desde este worktree:
  - 2026-11-12 19:35:25 — tras añadir `pago_satelite` a `schema.prisma`. Comprobado: el `index.d.ts` del
    cliente compartido (`@prisma+client@7.8.0_…/node_modules/.prisma/client/index.d.ts`) contiene
    `pago_satelite`.

## T0.1 — definiciones vigentes (base desechable, todas las migraciones de `dev`)

`pago_mensajero_movimiento_tipo_categoria_check` (`pg_get_constraintdef`):
`CHECK (((tipo = 'devengo') AND (categoria = ANY (ARRAY['pago_devengado','ajuste_devengo','premio_ranking','incentivo']))) OR ((tipo = 'pago') AND (categoria = ANY (ARRAY['pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo'])))))`

`pago_mensajero_movimiento_origen_uq` (`pg_indexes`):
`CREATE UNIQUE INDEX … USING btree (origen_tipo, origen_id, mensajero_id, categoria) WHERE ((origen_id IS NOT NULL) AND (categoria <> ALL (ARRAY['premio_ranking','ajuste_pago','incentivo'])))`

Coinciden con `design.md > 3.2`. Además existen `…_incentivo_origen_check` y `…_premio_dia_check`; ninguno
cambia.

## T0.2 — qué cae con R336 (la marca en el `updateMany` que aprueba, para todo destino)

Método: 26 archivos de `tests/integration/` que nombran `pago_efectivo`, «Pago del efectivo», «La central
debe», «se paga del efectivo» o `marcarConciliado`, corridos contra `slt139_satelite` dos veces: con R336
aplicado a mano (sin commitear) y con `CierresAdminRepository.ts` de HEAD. La diferencia es lo que causa
R336; lo que cae en las dos corridas es del entorno (base solo con catálogos: «`orden` vacía», «`usuario`
tiene menos de 2 filas»; todos esos archivos están en `tests/baseline-rojos.json`) o del enum nuevo.

| Archivo | Cae por | Previsto en tasks.md |
|---|---|---|
| `tests/integration/db/slt123-pago-independiente.int.test.ts` (casos 2, 6, 7) | R336: S1 de satélite aprobado ahora lleva la marca | sí |
| `tests/integration/db/slt73-marcar-asienta.int.test.ts` (5 casos: R10, R12 ×2, R20, R22) | R336: sus cierres pasan a nuevos; el libro ya no lleva `pago_efectivo` | sí |
| `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts` (4 casos: CONTROL, R16/R17, R16/D15, R20) | R336: aprueba satélites con `aprobar` real y espera `pago_efectivo` | **no** |
| `tests/integration/db/liquidacion-migration.test.ts` (1 caso, línea 277) | enum: `AGREGADAS_DESPUES` no excluye `pago_satelite` (no está en baseline: rojo nuevo en CI) | **no** |
| `tests/integration/db/premio-ranking-devengo-migration.test.ts` (líneas 86 y 189) | enum: `CATEGORIAS_DE_SLT68` no excluye `pago_satelite` (el archivo está en baseline por otro motivo) | **no** |

Unit con filas de marca `true`: `cierre-dia-pendiente-pago`, `cierres-admin-pendiente`,
`liquidacion-service`, `pendiente-cierre` (ya en la lista de ampliados), `wallet-mensajero-feed-service`
(el diseño lo prevé verde sin cambios) y `liquidacion-pago-repository` (repositorio, no lo toca la ficha).
Los integración que construyen servicios con un doble de premios sin la lectura y un cierre nuevo solo
se pueden medir con T6 escrito: no medidos.

E2E: no corridos (T11.2, fuera de esta tanda). Candidatos por texto: `ajuste-pago-mensajero-cierre`,
`cierre-bodega-satelite`, `cierre-modelo-nuevo-plan-porcentual`, `tarifas-valor-propio-mensajero`,
`wallet-mensajeros`.

Ajuste a `## Archivos esperados`: `tests/unit/repositories/cierre-bodega-repository.test.ts` **no** hace
falta (no fija la fila ni el `select`): −1.

**Total medido: 41 archivos** = 23 producción + 2 tests nuevos + 8 ampliados + 3 con la marca de la fila
consolidable + 5 existentes que caen (2 previstos + 3 nuevos). Por encima de 40 → PARA (tasks.md T0.2).
Si `premio-ranking-devengo-migration` no se tocara (está en baseline), 40; no lo recomiendo: quedaría un
test que afirma un catálogo falso.

## T0.3 — `Record` que señala el typecheck con el enum nuevo

Con `pago_satelite` solo en `schema.prisma`: `lib/types/wallet-mensajero.ts` (guardia de exhaustividad
del SEED) y, en cascada, `EstadoCuentaRepository.ts` y `PagoMensajeroMovimientoRepository.ts` (tipos
derivados del SEED; se resuelven solos con el SEED). Con el SEED al día:
`wallet-mensajeros-labels.ts` (`CATEGORIA_PAGO_LABEL`), `aporte-por-orden.ts` (`FUENTE_MENSAJERO`),
`estado-cuenta-chips.ts` (`CHIP_POR_CATEGORIA_MENSAJERO`). `metrics.ts` no es `Record` (lista). Coincide
con `design.md > 7`; sin archivos nuevos.

## T0.4 — DIFERIDA

Consulta de solo lectura a prod bloqueada para agentes; informativa (decisión de Carlos PA3).

## Lo que queda en la rama (commit de esta tanda)

Hecho y con typecheck en verde (`pnpm run typecheck` EXIT 0), **sin** tests de esta ficha todavía:
- T1.1 `db/schema.prisma`: `pago_satelite` con comentario. `prisma validate` y `prisma generate` OK.
- T1.2/T1.3 (solo los archivos): `db/migrations/20261115120000_pago_satelite_enum/{migration,down}.sql`,
  `db/migrations/20261115120100_pago_satelite_checks/{migration,down}.sql`. **No aplicadas ni probadas**
  (falta subir, revertir y el aborto con una fila `pago_satelite`; T1.4).
- T9.1 (solo el código): `pago_satelite` en los dos SEED, `CATEGORIA_PAGO_LABEL`, `FUENTE_MENSAJERO`,
  `CHIP_POR_CATEGORIA_MENSAJERO` y `cuenta_por_pagar_mensajero.definicion.categorias`.

**No** commiteado: R336 (`CierresAdminRepository.resolverCierre`). Se aplicó a mano solo para medir T0.2
y se devolvió a HEAD: sin el feed (T3) y la lectura (T4-T6) deja dinero contradictorio.

Rojo conocido que deja esta rama hasta T11: `liquidacion-migration.test.ts` y
`premio-ranking-devengo-migration.test.ts` (catálogo del enum).

## Veredicto (tanda 1)

PARADO en T0.2: 41 archivos (> 40). Carlos aceptó hasta 45 (2026-11-12).

---

# Tanda 2 — T1 a T10 (backend_dev, 2026-11-12)

## Entorno y regeneraciones del cliente Prisma

- Base `slt139_satelite`: `prisma migrate deploy` aplicó `20261115120000_pago_satelite_enum` y
  `20261115120100_pago_satelite_checks` (EXIT 0). `origin/dev` no había avanzado (sin merge).
- `prisma generate` desde este worktree (cliente compartido `@prisma+client@7.8.0_…/.prisma/client/index.d.ts`):
  - 19:57:30 — inicio de T1.4; `pago_satelite` presente.
  - 20:32:22 — tras el aviso del leader (SLT-112 regeneró a las 20:17:52 un cliente SIN `pago_satelite`;
    medido: 0 apariciones a las 20:30). Descartadas y repetidas las corridas posteriores a 20:17: `int2`,
    `cab1` y un typecheck (todas cubiertas otra vez por `all1`, `tc10`).
  - 20:47:38 — automática: desde entonces cada vitest pasa por `scratchpad/slt139/vt.sh`, que comprueba el
    cliente ANTES (y regenera si falta) y anota `cliente_pago_satelite` al empezar y al acabar. Ninguna corrida
    registrada vio `0`.

## Archivos (41 contra `origin/dev`, sin `specs/` ni `progress/`; límite aceptado 45)

Producción (23): `db/schema.prisma`, las 4 SQL de las dos migraciones, `CierresAdminRepository.ts` (R336),
`WalletMensajeroFeedService.ts` (R317/R340), `pendiente-cierre.ts` (unión + `LecturaPagadoSateliteAusenteError`),
`IPagoMensajeroMovimientoRepository.ts` + `PagoMensajeroMovimientoRepository.ts` (`IPagadoPorSateliteLectura`),
`CierresAdminService.ts`, `CierreDiaService.ts`, `ICierreDiaService.ts`, `LiquidacionService.ts`,
`CierreBodegaService.ts`, `CierreBodegaRepository.ts`, `ICierreBodegaRepository.ts`, `cola-cierres-labels.ts`,
y los 5 catálogos de T9.1 (tanda 1).
Tests nuevos (2): `tests/integration/db/slt139-pago-satelite.int.test.ts`, `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts`.
Ampliados (8): `pendiente-cierre`, `cierres-admin-pendiente`, `cierre-dia-pendiente-pago`, `liquidacion-service`,
`cierre-bodega-service`, `cola-cierres-vista`, `ColaCierresConsolidar`, `cierre-dia-pendiente-cableado`.
Solo la marca de la fila (3): `consolidacion-completo`, `consolidacion-cola-satelite`, `consolidables-paginado`.
Existentes que caían (5): ver abajo. Líneas: 2 169 añadidas + 83 borradas (producción 492/54, tests 1 677/29).

Además va en el commit `progress/features/SLT-139.md` (+3 líneas): una nota del leader escrita en este
worktree durante la tanda («Pendiente del leader para T11»); no la escribí yo.

## Los 5 tests existentes que caían (T11.1 adelantado), con el origen de cada literal

| Test | Qué cambia | De dónde sale el literal |
|---|---|---|
| `slt123-pago-independiente.int` (casos 2, 6, 7) | S1 se aprueba con el código real (ahora con marca) y después se le devuelve la marca a `false`: sigue caracterizando «aprobado entre los dos merges» (R340). Caso 2 espera `S1: true` (medido antes del reset). | `true`: R336 (marca para todo destino). El resto de literales (2500.00, 0.00) no cambian: S1 es viejo y E 4 000 ≥ P 2 500. |
| `slt73-marcar-asienta.int` (R10, R12 ×2, R20) | `MENSAJERO` pasa a `pago_satelite 1500.00` en vez de `pago_efectivo 1500.00`. | P = 1 500,00 del snapshot de la fixture (`slt73-cierre-aprobable.ts:118`); con la regla nueva el pago es P (R317), no `min(P, E)` (que también daba 1 500 con E 20 000). T0.2 contó 5 casos; con el código final caen 4 (R22 solo compara fechas, que no cambian). |
| `slt73-migracion-retira-asientos.int` (CONTROL, R20) | Sus cierres de satélite se aprueban con `aprobar` como MONTAJE de la época de la migración C: se les devuelve la marca a `false` (cierres viejos). Literales intactos. | Regla de T11.1: «si usa la aprobación como montaje, se le da un cierre viejo». Medido: con el cambio, 0 fallos. |
| `liquidacion-migration` (línea 277) | `AGREGADAS_DESPUES` gana `pago_satelite`. | La categoría la añade `20261115120100_pago_satelite_checks` (rama `pago`), no la migración de la 171. |
| `premio-ranking-devengo-migration` (líneas 86 y 189) | `CATEGORIAS_DE_SLT68` → `CATEGORIAS_POSTERIORES` con `pago_satelite`. | Ídem: posterior a la 293, con su propio CHECK. El archivo ya no afirma un catálogo falso. |

En `premio-ranking-devengo-migration` siguen cayendo 2 casos AJENOS (en `tests/baseline-rojos.json`): «T1.4 [PG]»
(base sin usuario `mensajero`) y «`ranking_snapshot_fila` … 7 previos» (orígenes añadidos por otras fichas).

## Mapa R → test

| R | Test (caso) |
|---|---|
| R317 | `slt139-pago-satelite.int` caso 5 (NS = devengo 2500.00 + `pago_satelite` 2500.00; fechas = `conciliado_at`) |
| R318 | int caso 7 (re-asentar no duplica) + `migracion-slt139-ida-y-vuelta` (segundo `pago_satelite` del mismo cierre → 23505) |
| R319 | int casos 3 y 6 (2500.00 → 0.00 en `/cierres-admin` y `/cierre-dia`; cuenta por pagar de NS 0.00) + `cierres-admin-pendiente` + `cierre-dia-pendiente-pago` |
| R322, R323 | `cierre-bodega-service` (4 conjuntos de T7.2) + int caso 4 (K1: 3000.00 / 9500.00) |
| R324 | `cola-cierres-vista` («1 mensajero», «2 mensajeros», «3 mensajeros», sin «del efectivo») + `ColaCierresConsolidar` |
| R329 | int caso 12 (estado de cuenta con «Pagado por la satélite 2500.00», detalle por guía 2500.00 en 1 orden, analítica +4500.00 de pago, catálogo) |
| R330 | `migracion-slt139-ida-y-vuelta` (23514 con `devengo`, `manual`, `origen_id` nulo) |
| R333 | int caso 11 (con RLS `servi_app`: A ve NS 2500.00 y no el 999.00 de B; B ve 999.00) |
| R334 | `cierres-admin-pendiente`, `cierre-dia-pendiente-pago` (una lectura, solo nuevos, ninguna sin nuevos) + int caso 13 |
| R335 | `cierre-dia-pendiente-cableado` (las tres acciones) + `cierres-admin-pendiente` (lanza / `"0.00"`) + `cierre-dia-pendiente-pago` («Sin dato») |
| R336 | int caso 2 (NS, NS0, NC `true`; VS, VC, NR `false`) + int «caso 2 rollback» (fallo forzado tras aprobar → `solicitado`, `false`) + `slt123` caso 2 |
| R337 | `migracion-slt139-ida-y-vuelta` (cuenta/Σ/md5 de 5 tablas iguales; downs abortan con fila; sin fila, esquema como antes) |
| R338 | `pendiente-cierre` filas 7-12 + `@ts-expect-error` + lectura estática de las 6 llamadas |
| R340 | int caso 5 (VS = devengo 3000.00 + `pago_efectivo` 2000.00) |
| R341 | int casos 4, 5, 9, 10 + `cierre-bodega-service` («Debe llegar» y pago agregado sin cambio) |
| R342 | int caso 1 (foto de VC idéntica: cierre, libro, caja, liquidaciones y su consolidación) |
| R343 | `pendiente-cierre` (sin `Number(`/`parseFloat`/`Math.`/`toNumber(` en 4 archivos, sin comentarios) + `liquidacion-money-safe` (sin cambios, verde) |
| R344 | `liquidacion-service` (tope 2000.00 con 1 000 de satélite; sin lectura lanza antes de escribir) + cableado |
| R345 | int caso 8 (corregir: `updated`, filas `pago_satelite` idénticas; desmarcar: `con_asientos`, idénticas) |

Desvíos del diseño, anotados: (1) caso 9, «conciliación analítica igual»: se afirma el libro de tienda de NS
y VS idéntico al literal `TIENDA` (es lo que compara la conciliación analítica), no se llama a su servicio.
(2) caso 12, analítica: delta de `cuentaPorPagarMensajerosAlCorte` antes/después de conciliar K1
(devengo +5500.00, pago +4500.00 = 2 500 `pago_satelite` + 2 000 `pago_efectivo` de VS). (3) caso 11: el
`pago_satelite` de B cuelga del MISMO id que NS (la base lo admite; no hay FK en `origen_id`). (4) T8.1: el
componente afirma «3 mensajeros» (su fixture tiene 3); «1» y «2» los afirma `cola-cierres-vista`.

## T1.4 — los `down.sql` (base propia `slt139_iv_*`, `migracion-slt139-ida-y-vuelta`, 7/7 verde)

- Subir: cuenta, Σ y md5 de `cierre_dia`, `pago_mensajero_movimiento`, `wallet_movimiento`, `liquidacion_pago`
  y `cierre_bodega` iguales antes y después.
- Con una fila `pago_satelite`: el down de los CHECK aborta con P0001 («hay filas pago_satelite»), el del enum
  con P0001 («se aborta sin borrar nada»); esquema y dinero sin cambios.
- Sin filas: los dos down en orden inverso dejan el esquema exactamente como antes (CHECK de SLT-68 por
  `pg_get_constraintdef`, sin el CHECK de origen, sin el valor en `pg_enum`). Reaplicadas: igual que la 1.ª vez.

## T10.2 — mutaciones (31: las 30 de la tabla + M11b, la de M11 en `CierreDiaService`)

Una a una con `scratchpad/slt139/mutar.py`: aplicar, correr el test indicado, anotar, `git checkout --` del
archivo y comprobar `git status --porcelain` vacío antes de la siguiente. Resultado: **31 matadas, 0 sobreviven**.
Detalle (test que cae): `scratchpad/slt139/mutaciones.tsv` y `mut-<n>.clean.log`.

| # | Cae |
|---|---|
| M1 | int caso 10 (NC con `pago_satelite`); `slt123` (la medida cae: el pago contra N1 ya no entra) |
| M2 | int casos 5 y 12 |
| M3 | `pendiente-cierre` filas 8-12; int caso 6 |
| M4 | int: la medida cae (NS sin marca no escribe `pago_satelite`); CONTROL, casos 1-13 |
| M5 | int caso 2 (NR en `true`) |
| M6 | int: `EscrituraFueraDeTx` en la aprobación (vigilancia del cliente) → CONTROL y todos |
| M7 | `cierres-admin-pendiente` (2); int caso 6 |
| M8 | `cierre-dia-pendiente-pago` (2); int caso 6 |
| M9 | `liquidacion-service` (tope 2000.00) |
| M10 | `cierres-admin-pendiente` (R335: no lanza) |
| M11 | `cierres-admin-pendiente` (2); int caso 13 |
| M11b | `cierre-dia-pendiente-pago` (R334) |
| M12 | int casos 5, 11, 12 (+2 más) |
| M13 | int: la medida cae (no hay fila `pago_satelite`) → todos |
| M14 | `pendiente-cierre` filas 8-11 |
| M15 | `pendiente-cierre` fila 11 (y filas 5 de SLT-123, «efectivo ya cubría») |
| M16 | int casos 10 y 11 |
| M17 | int caso 11 (`desdeASoloNC` gana la clave de NS) |
| M18 | `pendiente-cierre` (aserciones de coma flotante, 3) |
| M19 | `cierre-bodega-service` conjuntos 1 y 2 (+1); int caso 4 |
| M20 | `cierre-bodega-service` conjunto 1; int caso 4 |
| M21 | `cierre-bodega-service` conjuntos 1, 2 y 4 |
| M22 | `cierre-bodega-service` conjuntos 1 y 2 (+1); int caso 4 |
| M23 | int caso 4 (typecheck no corrido con la mutación: el campo es obligatorio en `CierreDiaConsolidableRow`) |
| M24 | `cola-cierres-vista`, `ColaCierresConsolidar` |
| M25 | migración (4: `manual` y `origen_id` nulo aceptados; el down no encuentra el CHECK) |
| M26 | migración (2: `devengo` aceptado) |
| M27 | migración (el down de los CHECK no aborta con P0001) |
| M28 | migración (3: segundo `pago_satelite` aceptado; el down no deja el índice como antes) |
| M29 | migración (5: md5 de `pago_mensajero_movimiento` distinto tras subir) |
| M30 | `cierre-dia-pendiente-cableado` (/cierres-admin sin la lectura) |

Nota: M4, M6 y M13 caen porque la medida de la integración lanza (no por un caso concreto); M1 cae además por
la medida de `slt123`. Todas comprobadas con el nombre y el número de tests ejecutados en su log.

## Salidas reales

- `pnpm run typecheck` (NODE_OPTIONS 8192): EXIT 0 (`tc10`, 20:53-20:54, cliente con `pago_satelite` antes y después).
- `eslint` sobre los 39 `.ts/.tsx` del diff: EXIT 0.
- Tests que toca el cambio (`all1`, 64 archivos, 20:37, cliente con `pago_satelite`): 831 verdes, 22 rojos,
  todos en `tests/baseline-rojos.json` y por la base sin seed de orden/usuarios («tabla `orden` vacía», etc.),
  salvo `slt73-marcar-asienta` R26 (timeout de 20 s con 64 archivos en paralelo; solo: verde en `fix5`).
  Los 5 arreglados, juntos (`fix5`): 70 verdes, 1 archivo con 2 rojos ajenos (ver arriba).
- `slt139-pago-satelite.int`: 16/16. `migracion-slt139-ida-y-vuelta`: 7/7. Unit del diff: 400/400 (`unit1`).
- `pnpm run test:guardias`: 4851 verdes, 5 rojos: `catalogo-postgres-acota-esquema` (mío: dos consultas a
  `pg_constraint` sin `nspname`; arreglado, verde en `mig2`) y 4 de `dependencias-declaradas-presentes`
  (AJENO: «init.sh ya no tiene el marcador … FIN PASO 2»; `init.sh` es idéntico a `origin/dev`, el rojo se
  reproduce solo en este árbol sin tocar nada mío).

## Veredicto (tanda 2)

T1-T10 hechos, 41 archivos (≤ 45), 31/31 mutaciones matadas; pendientes T11 (E2E) y T12.

## Tanda 3 — merge de `origin/dev` (SLT-112), puerto de la ganancia y T11 (2026-11-12)

### Merge (36c6e8be)
Un conflicto, en `lib/services/CierreDiaService.ts > conPendientePago`: SLT-112 sacó el cálculo a
`pendientesPorCierre` (la celda «Pago» y la tarjeta «Ganancia pendiente» usan el mismo); SLT-139 lo tenía
inline con lo pagado por la satélite. Resuelto conservando la estructura de SLT-112 y metiendo el término
de SLT-139 **dentro** de `pendientesPorCierre` (una lectura `sumarPagadoSatelitePorCierre` con los nuevos;
sin la lectura, el cierre nuevo va a `undefined` = «Sin dato»). Consecuencia: la tarjeta de pendiente
también resta lo de la satélite, y si un cierre nuevo queda sin cifra `resumenGanancia` da `sin_dato`
(R357 de SLT-112: nunca un total que omita un cierre). `lib/actions/cierre-dia.ts` se mezcló solo.

### Puerto `LecturaPagadoPorSatelite.sumarPagadoPorSateliteEnRango` (R345 -> R353 de SLT-112)
- `PagoMensajeroMovimientoRepository.sumarPagadoPorSateliteEnRango(mensajeroId, desde, hasta)`: un
  `aggregate` de `categoria = 'pago_satelite'`, `mensajero_id`, `fecha_movimiento` `gte`/`lt` (la primera
  marca; la fila es inmutable). Empresa por RLS. Interfaz `IPagadoPorSateliteEnRangoLectura`.
- Inyectado en `lib/actions/cierre-dia.ts > buildService` (`ganancia.pagadoPorSatelite`). Queda opcional en
  el tipo (R353 de SLT-112 «sin la lectura = R352» sigue vivo); el test de cableado cae si no se inyecta.
- Tests: `tests/integration/db/cierre-dia-ganancia-accion-real.test.ts` (acción real como la app, con RLS:
  M con 700 en el mes y 400 un minuto antes del mes con su consolidación corregida ahora; M2 900; empresa B
  999 → pagada **1900.00 / 2**, pendiente 3800.00 / 1, literales a mano);
  `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` (instancia real inyectada);
  `tests/unit/services/cierre-dia-ganancia.test.ts` (+3: la satélite resta en nuevos, sin lectura por cierre
  → `sin_dato`, sin nuevos no cambia); `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` (inyecta
  el puerto como el composition root; R356 pasa de 4 a 6 sentencias: + satélite por cierre + satélite del mes).
- Mutaciones (logs `mut-M1..M3` de esta tanda, revertidas copiando el respaldo):
  | # | Mutación | Cae |
  |---|---|---|
  | M1 | no inyectar `pagadoPorSatelite` | cableado + acción real |
  | M2 | quitar el filtro de mensajero | acción real |
  | M3 | fechar por `cierre_bodega.conciliado_at` (la corrección) en vez de `fecha_movimiento` | acción real (+ sql-real por sentencia extra) |

### T11
- T11.1: ya hecho en la tanda 2 (sección «Los 5 tests existentes que caían»); verde de nuevo tras el merge.
- T11.2: grupo `dinero` ENTERO en local, base desechable nueva `slt139_e2e_t11` (generate, migrate deploy,
  db:seed y `next build` por separado; `NEXT_PUBLIC_APP_URL=http://localhost:3000`; puerto 3000; candado
  `e2e.lock`). **106/106 verdes** (`e2e-run2`, 5.6 min). Ningún E2E cambió.
  - Corrida 1 (`e2e-run1`) inválida: 23 rojos por `PrismaClientValidationError … pago_satelite` — otro
    worktree regeneró el cliente sin el enum a las 21:26 y mi script no lo regeneró (fallo mío de rutas en
    el script; también dejó el candado puesto 21:31-21:36; lo quité al verlo). Arreglado y repetido.

### Salidas reales
- typecheck (8192): EXIT 0 tras el merge y tras el puerto.
- eslint de los 8 archivos tocados: EXIT 0 (7 avisos `no-unused-vars` de los parámetros `_m/_d/_h` de los
  dobles de `cierre-dia-ganancia.test.ts`, que ya venían de SLT-112).
- vitest (`t11b`): 5 archivos, 47/47 (unidad ganancia, cableado, acción real, sql-real, slt139 int).
- Tamaño (`scripts/tamano-pr.mjs`): 45/40 archivos, 2472 líneas — en el tope aceptado (45).
- Regeneraciones del cliente: 21:22:31 (prep E2E) y 21:36:47 (script de E2E, el cliente había perdido
  `pago_satelite`).

## Veredicto (tanda 3)
Merge hecho, puerto implementado e inyectado con 3/3 mutaciones matadas, `dinero` 106/106; queda T12.

## Arreglos review 1 (2026-11-12, sobre d00fa124)

Archivos (ninguno nuevo): `lib/services/CierreDiaService.ts`, `lib/interfaces/services/ICierreDiaService.ts`,
`tests/unit/services/cierre-dia-ganancia.test.ts`, `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts`,
`specs/SLT-139-pago-independiente-satelite/requirements.md` (D14 + SLT-112 R353 en «Relación…»), `tasks.md` (T12.2).

- **m1** — borde del mes de `sumarPagadoPorSateliteEnRango` (`gte`/`lt`). En `cierre-dia-ganancia-sql-real.test.ts`,
  mensajero M4 sin cierres con dos `pago_satelite` a mano: 250 en 2026-11-01T06:00Z (00:00 CR, cuenta) y 130 en
  2026-12-01T06:00Z (no cuenta). Esperado `{ "250.00", 1 }`. Mutaciones (revertidas con `git checkout`):
  `gt/lte` → 130/1 ROJO; `gt/lt` → 0/0 ROJO; `gte/lte` → 380/2 ROJO.
- **m2** — `resumenGanancia` sin `pagadoPorSatelite` da `sin_dato` sin leer nada (D14, decisión del leader:
  R353 de SLT-112 se revisa; su spec no se edita). Test unitario «R353 (revisado en SLT-139) + R357»; el
  doble ahora inyecta la lectura por defecto (en cero) y `sinLecturaSatelite` la quita. Mutación (devolver la
  pagada sin satélite si falta la lectura) → ROJO 1/18; revertida.
- Cliente Prisma regenerado una vez (había perdido `pago_satelite` por el E2E de SLT-113 en paralelo).

Salidas: `tsc --noEmit` (8 GB) sin errores; `eslint` de los 4 archivos tocados: 0 errores (7 avisos
`no-unused-vars` de los `_m/_d/_h` de los dobles, previos); `vitest run cierre-dia ganancia` contra
`slt139_satelite`: 24 archivos, 498/498, 0 saltados. `tamano-pr.mjs`: 45/40 archivos, 2545 líneas (aceptado ≤ 45).

Veredicto: m1 y m2 cerrados con 4/4 mutaciones matadas; T12.2 marcada, T12.1 queda al leader.
