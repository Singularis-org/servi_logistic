# SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» — tasks (C1)

> 2026-11-11. Solo C1: la partición en el servidor y la pantalla de hoy intacta. C2 (la cola única
> con `tipo` bodega) es ficha aparte (`requirements.md > Fuera de alcance (van a C2)`).
> Reparto: T1-T3 `backend_dev`; T4 `frontend_dev` o `backend_dev` (solo E2E); T0 y T6 el leader.
> Antes de cualquier `vitest`: exportar la `DATABASE_URL` de una base desechable (memoria «vitest
> related toca la base local») y copiar el `.env` al worktree (memoria «Worktree sin .env = gate
> ciego»).

## Tasks

### T0 — Medición en producción (leader; antes de abrir el PR) · PA1
- [ ] Correr el script de solo lectura
  `C:/Users/ArqDev/AppData/Local/Temp/claude/aab05f6b97f87a08/233157d8-8861-4bd3-9a61-ee726d076981/scratchpad/conteo-cierres-bodega.mjs`
  (lee `DATABASE_URL` de `.env.prod` sin imprimirla, `BEGIN READ ONLY`, `ROLLBACK`).
- [ ] Anotar en `progress/features/SLT-105.md` solo los conteos por empresa (id): por `estado`, por
  lista vieja (`pendientes`/`resueltos`) y nueva (`por_conciliar`/`conciliados`) y
  `cambian_de_lista`.
- **Hecho:** conteos anotados con fecha. SI hay algún `rechazado` o algún cierre que cambie de lista,
  ENTONCES se le enseña a Carlos antes del PR (memoria «Re-medir prod antes del PR»).

### T1 — El `WHERE` nuevo (`backend_dev`) · R44, R122, R123, R125
- [x] `CierresBodegaAdminPrismaClient` añade `"$queryRaw"`.
- [x] Método privado `idsRecibidosIncompletos()` con la consulta de `design.md > Cómo se lee «lo que
  falta»`: filtro por `organizacion_id` escrito, `conciliado_at IS NOT NULL`, `<` estricto contra la
  resta de los tres snapshots.
- [x] `historicoBodegaWhere(filtros, incompletos)` = con marca y `id notIn incompletos`;
  `colaBodegaWhere(filtros, incompletos)` = `OR [sin marca, id in incompletos]`; los recortes de
  `filtrosBodegaWhere` en `AND`, como hoy. Mismos nombres de función.
- [x] Los cuatro métodos (`findColaPaginada`, `findHistoricoPaginado`, `findColaCompleta`,
  `findHistoricoCompleto`) llaman una vez a `idsRecibidosIncompletos()`; en los paginados, `findMany`
  y `count` comparten el mismo objeto `where`.
- [x] Comentarios de cabecera de las dos funciones y de los cuatro métodos al día (el corte ya no es
  `ESTADOS_COLA_SOLICITADO`).
- **Hecho:** `pnpm run typecheck` verde; `git diff` sin cambios en la interfaz, el servicio, las
  actions, `app/`, `components/` ni `db/`.

### T2 — Test de integración contra Postgres real (`backend_dev`; depende de T1) · R44, R122-R126
Archivo nuevo `tests/integration/db/slt105-particion-conciliacion-sql-real.test.ts`, con el patrón de
`cierres-cola-senales-sql-real.test.ts` (transacción revertida, `fijarEmpresa`, `describe.skip`
visible sin base y FALLO con base y sin catálogos) y los helpers de siembra de
`cierre-bodega-conciliacion.int.test.ts`, `slt76-desmarcable.int.test.ts` y
`_fixtures/slt73-cierre-aprobable.ts`.

- [x] **Corpus, empresa A** (literales escritos a mano, no derivados de la función que se prueba):
  - **S** `solicitado`, sin marca → por conciliar;
  - **I** `aprobado`, Debe llegar 5 000,00, recibido 4 600,00 → por conciliar (incompleto);
  - **E** `aprobado`, Debe llegar 3 000,00, recibido 3 000,00 → conciliados;
  - **M** `aprobado`, Debe llegar 3 000,00, recibido 3 200,00 (llegó de más) → conciliados;
  - **Z** `aprobado`, Debe llegar 0,00, recibido 0,00 (SLT-96) → conciliados;
  - **G** `aprobado`, con «gana la bodega» ≠ 0, de modo que recibido = recaudado − pago a mensajeros
    pero < Debe llegar si se olvida restar lo que gana la bodega → conciliados (mata la mutación de
    la resta incompleta);
  - **X** `rechazado` heredado, sin marca → por conciliar (PA1);
  - **I2** incompleto de **otra bodega** y con otra fecha de solicitud, para los filtros.
- [x] **Empresa B:** un incompleto **IB**. No puede salir en ninguna lista ni contar en ningún total
  (R125).
- [x] Afirmaciones:
  - (R122) ids de `findColaPaginada` = {S, I, X, I2} y de `findHistoricoPaginado` = {E, M, Z, G};
    unión = todos los de A, intersección vacía;
  - (R123) `total` de cada página = tamaño de su conjunto; `findColaCompleta` /
    `findHistoricoCompleto` = mismos ids y mismo orden (`solicitadoAt desc`); con filtro de bodega y
    con filtro de fecha, I2 entra o sale de la cola y de su total a la vez;
  - (R124) para cada fila devuelta, `estadoConciliacionDe({ conciliado, faltaPorRecibir })` es
    `pendiente`/`incompleto` en la cola y `recibido` en el histórico;
  - (R125) IB ausente de las cuatro lecturas y de los dos totales;
  - (R126, servidor) sobre una consolidación sembrada sin marca: `marcarConciliado` con un monto
    menor → aparece en la cola como incompleto; `corregirConciliacion` hasta el monto esperado → pasa
    al histórico; `revertirConciliacion` (si es desmarcable) → vuelve a la cola sin marca.
- [x] **Mutaciones** (cada una a mano, test en ROJO, se revierte y se anota en
  `progress/impl_SLT-105.md` con la línea del fallo): `<` → `<=` (E pasa a la cola); quitar
  `- total_ingreso_bodega_rechazos` (G pasa a la cola); quitar `{ id: { in: incompletos } }` de la
  cola (I desaparece de las dos); `notIn` → sin filtro de id en el histórico (I en las dos); quitar
  `conciliadoAt: null` de la cola (S desaparece). Quitar la línea de `organizacion_id` de la consulta
  la pone en rojo la guardia `sql-a-mano-por-empresa` (anotar también).
- **Hecho:** verde contra una base desechable con `DATABASE_URL` exportada; las 6 mutaciones rojas;
  la salida muestra el test ejecutado (no `skipped`).

### T3 — Adaptar los tests que fijaban el corte por `estado` (`backend_dev`; depende de T1) [P con T2]
- [x] `tests/unit/repositories/colas-paginadas-where.test.ts`: el caso «cierres de bodega — cola»
  fija el `where` nuevo en valor absoluto (con un `$queryRaw` doble que devuelve `[{ id: "i-1" }]`);
  el caso de partición deja de comparar `ESTADOS_COLA_SOLICITADO` para bodega y comprueba que cola e
  histórico reciben el MISMO conjunto `incompletos` (`in` en uno, `notIn` en el otro) y la condición
  de marca opuesta. Incidentes y cierres del día no cambian.
- [x] `tests/unit/repositories/historicos-paginados-where.test.ts`: lo mismo para el histórico,
  página y conjunto completo; `findMany` y `count` con el mismo `where`.
- [x] `tests/unit/repositories/cierre-bodega-repository.test.ts`: el doble del cliente que usa el
  repositorio del maestro añade `$queryRaw` (devuelve `[]`).
- [x] `tests/integration/db/slt76-desmarcable.int.test.ts`: la consolidación «conAjuste» (5 000 /
  4 600) es un incompleto y ahora se lee de `findColaPaginada` / `findColaCompleta`; las otras dos,
  del histórico. Lo que afirma sobre `desmarcable` no cambia.
- [x] `tests/unit/repositories/criterio-unico.guardia.test.ts`: no hizo falta (verde sin tocarla); solo si sale rojo (las funciones de
  selección conservan el nombre).
- **Hecho:** `pnpm exec vitest related --run lib/repositories/CierresBodegaAdminRepository.ts` verde
  y `pnpm run test:guardias` verde (o solo con el rojo de baseline anotado).

### T4 — E2E de la pantalla intermedia (depende de T1) · R126, R136
- [x] `e2e/cierre-bodega-satelite.spec.ts`: un caso que marca recibido **menos** de lo esperado y
  comprueba que la tarjeta sigue en «Pendientes» con «Recibido incompleto» y su «Falta por recibir»
  (literal escrito a mano), que NO está en «Resueltos», que el conteo de «Pendientes» la incluye, y
  que tras «Corregir» hasta el monto esperado pasa a «Resueltos» sin recargar. El caso de hoy
  (7 000 de 7 000 → «Resueltos») sigue igual.
- **Hecho:** verde en local con base desechable nueva, `next build` + `next start` y
  `NEXT_PUBLIC_APP_URL` como en `.github/workflows/gate.yml` (`docs/perfil-agentes.md > E2E en local
  antes del PR`); además, `grep -rl "Cierres de bodega" e2e/` y re-ejecutar los que salgan.

### T5 — Gate (implementer)
- [x] `./init.sh` verde, con `INIT_EXIT=$?` dentro del log (memoria «El exit code que tapa un `echo`»).
- **Hecho:** gate verde; mapa `R<n> → test` en `progress/impl_SLT-105.md`.

### T6 — Restricción de promoción (leader) · PA0-b
- [ ] C1 puede mergearse en `dev`. En la promoción a `prod`, el leader comprueba que C2 está en `dev`
  y aprobada en Preview; si no, C1 no sale a `prod`. Anotar en `progress/features/SLT-105.md` y en la
  ficha C2 (`depends_on` SLT-105).
- **Hecho:** nota escrita en las dos fichas antes del merge de C1.

## Dependencias

T0 independiente (antes del PR). T1 → (T2 ‖ T3 ‖ T4) → T5. T6 antes del merge.

## Trazabilidad

| R | Test |
|---|---|
| R44 (partición) | `tests/integration/db/slt105-particion-conciliacion-sql-real.test.ts` (T2, afirmación R122) |
| R122 | T2: ids de cola e histórico, unión e intersección; mutaciones `<=`, resta incompleta, `in`, `notIn`, `conciliadoAt: null` |
| R123 | T2: totales, conjuntos completos, orden y filtros; `colas-paginadas-where.test.ts` y `historicos-paginados-where.test.ts` (mismo `where` en página, `count` y conjunto) |
| R124 | T2: `estadoConciliacionDe` de cada fila contra su lista |
| R125 | T2: IB ausente; guardia `sql-a-mano-por-empresa` (mutación: quitar `organizacion_id`) |
| R126 | T2 (marcar / corregir / desmarcar en el servidor); `tests/components/CierresBodegaAdminRefresco.test.tsx` (existente: revalida las dos claves); E2E T4 |
| R136 | E2E T4 (`e2e/cierre-bodega-satelite.spec.ts`); revisión: el diff no toca `app/` ni `components/` |
| R71 | guardia `liquidacion-money-safe` (existente); el diff no toca código de cliente |
| R72 | revisión: el diff no toca `db/`, snapshots, asientos ni Server Actions de escritura |

## Archivos esperados

- `lib/repositories/CierresBodegaAdminRepository.ts`
- `tests/integration/db/slt105-particion-conciliacion-sql-real.test.ts`
- `tests/unit/repositories/colas-paginadas-where.test.ts`
- `tests/unit/repositories/historicos-paginados-where.test.ts`
- `tests/unit/repositories/cierre-bodega-repository.test.ts`
- `tests/integration/db/slt76-desmarcable.int.test.ts`
- `tests/unit/repositories/criterio-unico.guardia.test.ts`
- `e2e/cierre-bodega-satelite.spec.ts`

## Tamaño

~8 archivos (7 seguros + `criterio-unico` si sale rojo) y ~650 líneas: ~80 de repositorio, ~350 del
test de integración, ~120 de tests adaptados y ~80 de E2E. Por debajo del 80 % de `gate.tamano_pr`
(40 archivos / 1 000 líneas).
