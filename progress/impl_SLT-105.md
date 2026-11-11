# SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» (C1) — bitácora de implementación

## Tanda única — T1-T5 (backend_dev, 2026-11-11)

Worktree `.worktrees/SLT-105-cola-bodega-central`, rama `feature/SLT-105-cola-bodega-central` (desde ec35120c).
Bases desechables (nunca la local por defecto, nunca `migrate reset`): `slt105_c1` para vitest y el gate;
`slt105_e2e`, `slt105_e2e2` y `slt105_e2e3` (nuevas, `migrate deploy` + `db:seed`) para los E2E.
`node_modules`: junction al checkout principal (el worktree no lo traía). Grafo: no consultado (el design ya
dice que el índice de este worktree no existe); Grep/Read.

### Archivos

| Archivo | Cambio |
|---|---|
| `lib/repositories/CierresBodegaAdminRepository.ts` | T1: `$queryRaw` en el `Pick`; `idsRecibidosIncompletos()` (SQL a mano por empresa); `historicoBodegaWhere` / `colaBodegaWhere` con `incompletos`; los cuatro métodos leen el conjunto una vez; comentarios al día; fuera `ESTADOS_COLA_SOLICITADO` de este archivo |
| `tests/integration/db/slt105-particion-conciliacion-sql-real.test.ts` | T2, nuevo (8 tests contra Postgres real) |
| `tests/unit/repositories/colas-paginadas-where.test.ts` | T3: `clienteBodega` con `$queryRaw` doble; `where` nuevo en valor absoluto; partición por estado solo para cierres del día e incidentes; caso nuevo de partición de bodega (mismo `incompletos`, `in`/`notIn`, marca opuesta, sin `estado`) |
| `tests/unit/repositories/historicos-paginados-where.test.ts` | T3: ídem para el histórico (página, conjunto, «no es el compuesto») |
| `tests/unit/repositories/cierre-bodega-repository.test.ts` | T3: `$queryRaw` (devuelve `[]`) en el doble del maestro |
| `tests/integration/db/slt76-desmarcable.int.test.ts` | T3: «conAjuste» (4 600 de 5 000) se busca en la cola; las otras dos en el histórico |
| `e2e/cierre-bodega-satelite.spec.ts` | T4: describe nuevo «SLT-105 — un recibido incompleto se queda en «Pendientes» hasta que se corrige» |
| `specs/SLT-105-cola-bodega-central/tasks.md` | casillas T1-T5 |

Sin cambios en la interfaz, el servicio, las actions, `app/`, `components/` ni `db/` (R72, R136).
`criterio-unico.guardia.test.ts`: verde sin tocar.

### Decisiones

- **Siembra directa del corpus** (`tx.cierreBodega.create` con estado y marca coherentes): el `CHECK`
  `cierre_bodega_conciliacion_coherente` valida cada fila. El camino real de marcar / corregir / desmarcar
  se recorre en el test de R126.
- **Lecturas como la app** (`comoApp` dentro de un SAVEPOINT): con el dueño, la RLS no actúa y Prisma leería
  las filas de la empresa B. Con eso la RLS tapa también la consulta a mano, así que se añadió una lectura
  más **como dueño**: la cola del corpus no trae a IB solo si el SQL filtra la empresa por escrito. Mata la
  mutación 6 también en el test, además de la guardia.
- **R126, desmarcar:** una consolidación con ajuste no es desmarcable (SLT-76), así que «desmarcar» se prueba
  sobre otra marcada por lo esperado (3 000 de 3 000) → `updated` → vuelve a la cola sin marca.
- **E2E:** la columna «Conciliación» de la tarjeta está en su desglose; el caso pulsa «Ver detalles» antes de
  leer «Falta por recibir» (primera corrida roja por eso; corregido).

### Mutaciones (T2) — 6 ROJAS / 6

Aplicadas a mano sobre `CierresBodegaAdminRepository.ts` (script con copia y restauración; hash del archivo
igual antes y después), corriendo `slt105-particion-conciliacion-sql-real.test.ts` contra `slt105_c1`:

| # | Mutación | Resultado | Tests que fallaron |
|---|---|---|---|
| 1 | `<` → `<=` | ROJO, 6 de 8 | R44/R122 (E pasa a la cola), R123 totales, R123 filtro bodega, R124, R125 «por escrito», R126 |
| 2 | quitar `- total_ingreso_bodega_rechazos` | ROJO, 5 de 8 | R44/R122 (G pasa a la cola), R123 totales, R123 filtro bodega, R124, R125 «por escrito» |
| 3 | quitar `{ id: { in: incompletos } }` de la cola | ROJO, 8 de 8 | todos (I e I2 desaparecen de las dos) |
| 4 | quitar `id: { notIn }` del histórico | ROJO, 7 de 8 | R44/R122 (I en las dos), R123 ×3, R124, R125 otra empresa, R126 |
| 5 | quitar `{ conciliadoAt: null }` de la cola | ROJO, 7 de 8 | R44/R122 (S y X desaparecen), R123 ×2, R124, R125 ×2, R126 |
| 6 | quitar la línea de `organizacion_id` del SQL | ROJO | `R125: la consulta a mano filtra la empresa POR ESCRITO` y la guardia `sql-a-mano-por-empresa` («todo archivo con SQL a mano sobre negocio sin organizacion_id está en la lista») |

Todas por aserción, no por caída del `beforeAll`.

### Mapa R → test

| R | Test |
|---|---|
| R44 (partición) | `slt105-particion-conciliacion-sql-real` › «R44/R122: por conciliar = {S, I, X, I2}; conciliados = {E, M, Z, G}…» |
| R122 | ídem + `colas-paginadas-where` › «cierres de bodega (SLT-105, R122): cola e historico PARTICIONAN…»; mutaciones 1-5 |
| R123 | `slt105-…` › «R123: el total de cada página…», «R123: con filtro de bodega…», «R123: con filtro de fecha…»; `colas-paginadas-where` y `historicos-paginados-where` (mismo `where` en página, `count` y conjunto) |
| R124 | `slt105-…` › «R124: el estado de conciliación que deriva la tarjeta casa con la lista…» |
| R125 | `slt105-…` › «R125: el incompleto de OTRA empresa no sale…» y «R125: la consulta a mano filtra la empresa POR ESCRITO…»; guardia `sql-a-mano-por-empresa` |
| R126 | `slt105-…` › «R126 (servidor): marcar de menos → cola…»; `tests/components/CierresBodegaAdminRefresco.test.tsx` (existente); E2E `cierre-bodega-satelite` › «SLT-105 — …» |
| R136 | E2E `cierre-bodega-satelite` › «SLT-105 — …» (sin recargar: «Pendientes (1)», «Recibido incompleto», falta ₡1.000, ausente de «Resueltos»; tras corregir, «Pendientes (0)» y en «Resueltos»); el diff no toca `app/` ni `components/` |
| R71 | guardia `liquidacion-money-safe` (corre en el gate); el diff no toca código de cliente |
| R72 | revisión: el diff no toca `db/`, snapshots, asientos ni Server Actions de escritura |

### Evidencia

- **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): verde (también dentro del gate).
- **Lint**: `✖ 243 problems (0 errors, 243 warnings)` → `✓ lint paso` (warnings heredados, ninguno de los archivos de este diff).
- **Tests tocados** (vitest run de los 7 archivos: colas/historicos where, cierre-bodega-repository,
  criterio-unico, slt76-desmarcable, slt105, sql-a-mano): `Test Files 7 passed (7) · Tests 108 passed (108)`.
- **T2 sola**: `Tests 8 passed (8)`, ejecutados (no `skipped`).
- **vitest related** del repositorio: ver «Related final» abajo.
- **E2E** (`next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000` + Playwright `--project=dinero`, que
  levanta `next start`; ningún otro servidor en 3000):
  - `e2e/cierre-bodega-satelite.spec.ts`: `4 passed`, `E2E_EXIT=0` (base `slt105_e2e2`).
  - `grep -rl "Cierres de bodega" e2e/` → además `ajuste-pago-mensajero-cierre.spec.ts` y
    `cierres-rediseno.spec.ts`: `12 passed`, `E2E_EXIT=0` (base `slt105_e2e3`).
- **Gate** (`./init.sh` con `DATABASE_URL` de `slt105_c1` exportada): `== init OK ==`, **`INIT_EXIT=0`**.
  El rápido: 342 archivos (guardias) `✓ test:rapido paso`; los 210 relacionados quedaron fuera por
  presupuesto (150), por eso se corrieron aparte (abajo). Tamaño del PR: 7/40 archivos, 756/1000 líneas.

### Related final

`pnpm exec vitest related --run lib/repositories/CierresBodegaAdminRepository.ts tests/integration/db/slt105-particion-conciliacion-sql-real.test.ts`
contra `slt105_c1`, sobre el código commiteado: `Test Files 6 failed | 203 passed (210) · Tests 26 failed | 2859 passed | 14 skipped`.
Los 6 rojos están **todos** en `tests/baseline-rojos.json` y caen por la base sin usuarios ni órdenes
(«la tabla `usuario` esta vacia… Corre `pnpm run db:seed`»), igual que antes del cambio:
`454/cierre-bodega-sf001-sql-real`, `486-evidencias-cierres-sql-real`, `cierre-bodega-conciliacion.int`,
`cierre-bodega-desglose-por-tienda-sql-real`, `corregir-conciliacion.int`, `marca-conciliacion.int`.
Ninguno de los seis llama a `findCola*` / `findHistorico*` (Grep), así que no esconden una aserción sobre
la partición. Fuera de baseline: 0 rojos. (En la primera corrida, antes de T3, salían además
`slt76-desmarcable` y un caso de `historicos-paginados-where`; los dos adaptados en T3.)

### Pendiente para el leader

- T0 (medición en prod) y T6 (restricción de promoción: C1 y C2 a `prod` juntas).

**Veredicto:** T1-T5 hechas; partición por conciliación probada contra Postgres real con 6/6 mutaciones rojas, E2E y gate en verde.
