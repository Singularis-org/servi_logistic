# SLT-182 «Usuarios propios en tests de dinero y conciliación» — bitácora (backend_dev)

## Entorno
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), migradas
  (`migrate deploy`) + `pnpm run db:seed`, igual que `gate.yml`. Postgres local **18.2** (CI usa 17).
  - **A** `servi_slt182_desechable`: vacía (solo catálogos). R1080.
  - **B** `servi_slt182b_desechable`: + empresa AJENA confirmada con `scratchpad/slt182-otra-empresa.tmp.ts`
    (fuera del repo; copia del de SLT-179 + dinero): 1 organización, zona central y satélite, 2 tarifas,
    5 usuarios (mensajero, adminTienda, maestro, adminSatelite, admin), 40 órdenes, 40 gestiones,
    2 `cierre_dia` (uno aprobado y consolidable en la satélite), 1 `cierre_bodega` pendiente y 1 fila en
    cada libro (`wallet_movimiento`, `wallet_tienda_movimiento`, `pago_mensajero_movimiento`). R1081.
- `prisma generate` no se ejecutó. Ningún archivo de `lib/ app/ components/ hooks/ db/ scripts/
  .github/ package.json` tocado; `_postgres-real.ts`, `454/_escenario.ts`, `_fixtures/escrituras-459.ts`
  y `_fixtures/orden-minima.ts` sin cambios (R1089 no aplica: ningún helper compartido tocado).

## T1 — antes (base A, JSON de vitest; p/f/s)
Iguales a la tabla del spec: analitica 1/14/0, cubo-temporal 5/2/0, cierre-bodega-conciliacion 6/8/0,
resumen-pendientes 4/2/0, consolidacion-concurrente 0/5/0, corregir-conciliacion 0/10/0,
gasto-fijo-aprobacion 1/11/0, -idempotencia 7/2/0, -migration 6/2/0, marca-conciliacion 0/8/0,
mi-wallet-cierres-alcance 0/0/4, premio-ranking 25/1/6, ranking-snapshot 43/0/6, wallet-fecha-elegida
0/4/0, wallet-tienda-cobro 0/0/13. Los 15 estaban en el baseline citando SLT-182.

## T2-T4 — qué se sembró
Patrón: el helper que leía «el primer usuario» (`findFirst`, `findMany take`, `SELECT … LIMIT 1`) pasa a
`crearUsuarioDePrueba(tx, <rol>)` dentro de la tx revertida del caso, con control positivo
`usuario.count({ where: { id } })` que lanza «SLT-182: … sembrado no esta en la base».

| archivo | rol(es) | además |
|---|---|---|
| `cierre-bodega-conciliacion.int` | adminSatelite | — |
| `cierre-bodega-resumen-pendientes` | mensajero | — |
| `consolidacion-concurrente.int` | mensajero | todo en tx (no confirma filas) |
| `corregir-conciliacion.int` | maestro (marca) + admin (corrige) | control `count === 2` |
| `marca-conciliacion.int` | maestro | — |
| `gasto-fijo-cobro-aprobacion` | maestro(s) | R18 concurrente: empresa + 2 maestros **commiteados** (R1083), `fijarEmpresa` en las dos tx del servicio, borrado en el `finally`; caso nuevo que cuenta 0 filas de empresa/usuarios sembrados (13 casos, antes 12) |
| `gasto-fijo-cobro-idempotencia` | maestro | — |
| `gasto-fijo-cobro-migration` | maestro | el usuario se leía con el cliente de FUERA de la tx; ahora con `tx` |
| `wallet-fecha-elegida` | maestro | — |
| `wallet-tienda-cobro` | maestro por caso (`sembrarMaestro`) | catálogos siguen por clave |
| `mi-wallet-cierres-alcance` | 2 adminTienda | catálogo ya no se copia del primer usuario |
| `analitica-financiera-action` | adminTienda + mensajero + zona | `enTransaccionRevertida` local que siembra el contexto en la tx de cada caso; el caso «contexto mínimo» corre dentro de una tx (mismas aserciones) |
| `financiera-cubo-temporal.integration` | mensajero | — |
| `premio-ranking-devengo-migration` | mensajero | rol y `cedula` por clave |
| `ranking-snapshot-migration` | bloque B: rol/`cedula` por clave (antes `LIMIT 1`); bloque C: empresa + 2 mensajeros **commiteados** (el esquema temporal los lee desde otra conexión), borrados en `afterAll` tras el `DROP SCHEMA`, con recuento 0 que lanza si queda algo | — |

R1085: ningún `it`/`expect`/literal esperado quitado ni cambiado; casos por archivo iguales salvo
`gasto-fijo-cobro-aprobacion` (+1).

## Resultado (JSON de vitest, los 15 juntos; p/f/s)
| archivo | A (vacía) | B (empresa ajena) |
|---|---|---|
| `cierre-bodega-conciliacion.int` | 14/0/0 | 14/0/0 |
| `cierre-bodega-resumen-pendientes` | 6/0/0 | 6/0/0 |
| `consolidacion-concurrente.int` | 5/0/0 | 5/0/0 |
| `corregir-conciliacion.int` | 10/0/0 | 10/0/0 |
| `gasto-fijo-cobro-aprobacion` | 13/0/0 | 13/0/0 |
| `gasto-fijo-cobro-idempotencia` | 9/0/0 | 9/0/0 |
| `gasto-fijo-cobro-migration` | 8/0/0 | 8/0/0 |
| `mi-wallet-cierres-alcance` | 4/0/0 | 4/0/0 |
| `wallet-fecha-elegida` | 4/0/0 | 4/0/0 |
| `wallet-tienda-cobro` | 13/0/0 | 13/0/0 |
| `financiera-cubo-temporal.integration` | 7/0/0 | 7/0/0 |
| `analitica-financiera-action` | 2/13/0 (otra causa) | ídem |
| `marca-conciliacion.int` | 5/3/0 (otra causa) | ídem |
| `premio-ranking-devengo-migration` | 31/1/0 (otra causa) | ídem |
| `ranking-snapshot-migration` | 48/1/0 (otra causa) | ídem |

R1083: conteo de B antes y después de la suite idéntico (`organizacion 1, zona 2, usuario 5, orden 40,
gestion_orden 40, cierre_dia 2, tarifa 2, wallet_movimiento 1, wallet_tienda_movimiento 1,
pago_mensajero_movimiento 1, cierre_bodega 1`); en A, 0 en todas tras la suite y tras las mutaciones.

## Siguen rojos por OTRA causa (R1088; se quedan en el baseline con motivo reescrito)
- `analitica-financiera-action` → **SLT-185**: los 13 casos que llaman a la action fallan con
  `EmpresaNoResuelta: Sin empresa en contexto para Pais.zonaHoraria` (test `:325`; action
  `lib/actions/analitica-financiera.ts:106` → `ReglasPaisEmpresaService.ts:89`): la action resuelve el
  país con el cliente global, que no ve la empresa de la tx del test.
- `marca-conciliacion.int` → **SLT-195**: 3 casos de revertir esperan `updated` y reciben `con_asientos`
  (`:272`). Desde SLT-73 (D11) revertir una marca que asentó la diferencia responde `con_asientos`: test
  desfasado tras SLT-73 en el dinero de la satélite. **A confirmar por el leader** (SLT-195 lista otros 21).
- `ranking-snapshot-migration` → **SLT-187**: R12 (`:992`) mide `P2022` en vez de `P2002`: el `create`
  de modelo sobre el esquema temporal (DDL de la 196) pide `organizacion_id`, que SL-17 añadió.
- `premio-ranking-devengo-migration` → **SLT-187**: caso ESTÁTICO (`:117`), sin base: `AGREGADOS_DESPUES`
  no lista `conciliacion_bodega_ajuste` (SLT-73) ni `orden_fulfillment` (SLT-94) del enum de orígenes de
  wallet. SLT-187 cubre «orden del enum de wallet» en tests de migración, pero su causa no es SL-17:
  **a confirmar por el leader**.

## T6 — mutaciones (R1086), una a una en la base A, restauradas con `git checkout`
| archivo | mutación (siembra quitada) | p/f/s | primer caso rojo | mensaje |
|---|---|---|---|---|
| `cierre-bodega-conciliacion.int` | adminSatelite → id inexistente | 6/8/0 | (a) `aprobado` SIN datos de marca | SLT-182: el usuario `solicitado_por` sembrado no esta en la base |
| `cierre-bodega-resumen-pendientes` | mensajero | 4/2/0 | R18: el resumen devuelve EXACTAMENTE… | SLT-182: el mensajero sembrado no esta en la base |
| `consolidacion-concurrente.int` | mensajero | 0/5/0 | R6: DOS consolidaciones… | ídem |
| `corregir-conciliacion.int` | corrector (admin) | 0/10/0 | R1: corregir una incompleta… | SLT-182: quien marca y quien corrige, sembrados, no estan en la base |
| `gasto-fijo-cobro-aprobacion` | maestros de `idsDeUsuarios` | 1/12/0 | el camino feliz deja LAS CUATRO cosas | SLT-182: de 1 usuarios sembrados hay 0 en la base |
| `gasto-fijo-cobro-idempotencia` | maestro | 7/2/0 | tras rechazar, la corrida del día siguiente… | SLT-182: el maestro sembrado no esta en la base |
| `gasto-fijo-cobro-migration` | maestro | 6/2/0 | TRAS CANCELARLO, el MISMO borrado… | ídem |
| `marca-conciliacion.int` | maestro | 0/8/0 | R8/R9: marcar escribe LOS CUATRO datos | SLT-182: el usuario que marca, sembrado, no esta en la base |
| `mi-wallet-cierres-alcance` | tienda B | 0/4/0 | control de no-vacuidad | SLT-182: las dos tiendas sembradas no estan en la base |
| `premio-ranking-devengo-migration` | mensajero | 26/6/0 | R14: `devengo` + `premio_ranking` ENTRA | SLT-182: el mensajero sembrado no esta en la base |
| `ranking-snapshot-migration` | mensajero `b` del bloque C | 43/0/6, archivo FAILED (exit 1) | `beforeAll` del bloque C | SLT-182: de 2 mensajeros sembrados hay 1 en public.usuario |
| `wallet-fecha-elegida` | maestro | 0/4/0 | R22/R24: un gasto fechado AYER… | SLT-182: el maestro sembrado (actor) no esta en la base |
| `wallet-tienda-cobro` | maestro | 0/13/0 | (a)(c)(g) el cobro se escribe… | SLT-182: el maestro sembrado no esta en la base |
| `analitica-financiera-action` | mensajero del contexto | 0/15/0 | la base de test trae el contexto minimo | SLT-182: la siembra del contexto no esta en la base (usuarios 1/2, zona 1/1) |
| `financiera-cubo-temporal.integration` | mensajero | 5/2/0 | R11 · la misma frontera, en el otro libro | SLT-182: el mensajero sembrado no esta en la base |

Árbol limpio tras cada una (`restaurado=true`, `git status` vacío).

## T7 — baseline
`tests/baseline-rojos.json`: 128 → 117 entradas. Retiradas 11 (las verdes de arriba); 4 con `motivo`
reescrito y `desde` intacto. Ninguna entrada ajena cambia (comprobado por script: `desde` y `motivo`).

## Mapa R → evidencia
| R | evidencia |
|---|---|
| R1080, R1082, R1084, R1085 | los 15 archivos (tabla Resultado, base A) + diff |
| R1081, R1083 | tabla Resultado, base B; recuentos antes/después; caso nuevo de `gasto-fijo-cobro-aprobacion` y recuento del `afterAll` del bloque C de `ranking-snapshot-migration` |
| R1086 | tabla T6 |
| R1087, R1088 | diff de `tests/baseline-rojos.json`; sección «Siguen rojos» |
| R1089 | no aplica (ningún helper compartido tocado) |
| R1090, R1092 | `git diff --name-only origin/dev` y `scripts/tamano-pr.mjs` (abajo) |
| R1091 | CI del PR (pendiente) |

## Cierre (T8)
