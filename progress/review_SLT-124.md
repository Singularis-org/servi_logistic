# review — SLT-124 «Ranking de la central sin mensajeros de satélite»

> reviewer, 2026-11-11. Rama `feature/SLT-124-ranking-sin-satelite`, HEAD revisado 26491c1e, diff
> `origin/dev...HEAD`. Ruta completa (toca dinero). Base desechable `slt124_g1`: `DATABASE_URL`
> derivada de `.env` cambiando solo el nombre de la base, comprobada con booleanos
> (`has_url true`, `quoted false`, `db_is_g1 true`, `host_local true`). Sin `migrate reset` ni dev
> server. MCP del grafo no usado: Grep/Read sobre el worktree.

## Checklist

- [x] **Ruta:** completa (`requirements.md:3`, D3). Toca dinero, así que la completa es la que toca.
- [x] **Spec:** existen `requirements.md` (R1-R14 EARS), `design.md` (5 alternativas descartadas) y `tasks.md`.
- [x] **Tasks:** T0-T10 marcadas `[x]`.
- [x] **Lo que ya existe:** `design.md` abre con la sección y la búsqueda hecha. El diff reutiliza
      `alcanceWhere`, `ALCANCE_ACCESO_TOTAL`, `listarCierresImputablesEnAlcance` y
      `obtenerCierreParaPagoEnAlcance` de SLT-122, y no re-crea nada.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs`: 14/40 archivos y 872/1000 líneas. Da aviso, pero no pasa del máximo.
- [x] **Trazabilidad:** cada R1-R14 tiene un test concreto y el mapa está en `progress/impl_SLT-124.md`. Ver la tabla de abajo.
- [x] **Typecheck/lint:** `INIT_EXIT=0` del leader en `slt124_g1`. Lo confirmé con eslint sobre los
      archivos del diff: 0 errores y 9 avisos, todos `_args`/`_tx` previos.
- [x] **Tests corridos por mí** (`slt124_g1`): la integración nueva y 5 unit relacionados dan `6 passed (6)` y
      `119 passed (119)`. La integración sola, con `--reporter=verbose`, da 10/10 ✓ y **0 skipped**.
- [x] **E2E (flujo crítico de dinero y aislamiento):** hay constancia en la bitácora: `--project=dinero` 95/0 e
      `e2e/dos-empresas-humo.spec.ts` 18/0, en bases desechables nuevas. No los repetí (los corre el CI).
- [x] **Multi-empresa:** no hay tablas nuevas ni queries nuevas. Los dos WHERE cambiados (`cierre_dia` y `usuario`)
      siguen bajo la extensión de empresa y la RLS. Ningún `organizacion_id` se pierde.
- [x] **Migraciones/dependencias/secretos/Ordenex:** el diff no trae ninguna.
- [x] **Literales de país:** no hay en el código nuevo de `lib/`. Los de la integración (`Cartago`, `sinpeNumero`) son datos de test.
- [x] **Capas:** los repositorios filtran en el WHERE y los servicios pasan el alcance. Los composition roots no cambian.
      La bitácora T1 comprueba que PASAN la instancia (`lib/actions/incentivo-mensajero.ts:39-40`,
      `lib/actions/premio-ranking-devengo.ts:100`).
- [x] **Comentarios:** explican el porqué (el caso mixto con `findFirst` y D1 de SLT-122).
- [ ] **Cierre en `progress/features/SLT-124.md`:** está sin rellenar. Es tarea del leader en F2.6 (m5).

## Trazabilidad verificada

| R | Test | Comprobado |
|---|---|---|
| R1, R3 | integración (b) y (c) | Mutación 1: ROJO por aserción |
| R2 | integración (a) | Mutación 1: ROJO (`ok` en vez de `sin_cierre`) |
| R4 | integración (d) y unit `premio-ranking-devengo-service` | Mutación 1: ROJO |
| R5 | `premio-ranking-lecturas` (WHERE literal), guardia `criterio-unico` (1 llamada) y mutación 1 | Leído |
| R6 | unit `premio-ranking-devengo-service` sin cambiar lo que afirma; `premio-ranking-idempotencia` solo pasa el alcance | Ver m2 |
| R7, R11 | integración (g): compensación contra el mismo cierre de satélite y reversos de caja | Verde |
| R8 | integración (e) y unit «R8» (los dos argumentos con el literal del alcance) | Mutación 2a: ROJO (e) |
| R9 | integración (f) y unit «R9» | Ver la nota de la mutación 2 |
| R10 | unit «R10» (relectura `null`, sin escribir) y unit «R8» (`obtenerCierreParaPagoEnAlcance` con `["c-nuevo", ALCANCE_CENTRAL, TX]`) | Leído |
| R12 | integración (h), vivo y congelado, con un mensajero sin zona incluido; unit `user-repository.mensajeros` | Mutación 3: ROJO (h) y unit |
| R13 | integración (i): histórico y listado de premios de un snapshot viejo | Verde |
| R14 | integración (j): vivo `[]`, cabecera con `filas: 0` y 0 filas hijas, listado `hayPodio: true, filas: []` | Mutación 3: ROJO (j) |

## Mutaciones reaplicadas por mí

Todas en `slt124_g1` y revertidas con `git checkout -- <archivo>`. Tras cada una, `git status --short` quedó vacío.

| # | Mutación | Resultado |
|---|---|---|
| 1 | comentar `...alcanceWhere(alcance)` en `CierreDelDiaRepository.resolverCierreDelDia` | **ROJO** (a), (b), (c) y (d), las 4 por aserción. Ejemplo: `expected { status, monto, ... } to deeply equal { status: 'sin_cierre' }`. 6 verdes |
| 3 | quitar `zona: { esCentral: true }` de `UserRepository.listMensajeros` | **ROJO** (h) (3 filas en vez de 1), (j) (`[posicion 1, …]` en vez de `[]`) y el unit del `where` exacto |
| 2a | volver la elección del incentivo a `listarCierresImputables` sin alcance | **ROJO** (e): `sin_cierre_aprobado` en vez de `ok` con el central. (f) sigue verde |

**La nota de la mutación 2:** que (f) solo salga ROJO si también se revierte la relectura es **cobertura
suficiente, no un hueco**:
- con la elección mutada, la relectura bajo el candado (R10, ya filtrada en la base) devuelve `null` para
  el cierre de satélite, y el comportamiento que R9 exige sigue siendo correcto. Un test no puede fallar
  si el sistema sigue cumpliendo;
- la elección está atada por (e) en integración (2a ROJO) y por el literal del alcance en el unit «R8»;
- la relectura está atada por el literal `["c-nuevo", ALCANCE_CENTRAL, TX]` del unit «R8» y por el WHERE
  de `obtenerCierreParaPagoEnAlcance`, que ya prueba contra Postgres
  `pago-mensajero-bodega-duena.test.ts` (SLT-122);
- revertir solo la relectura no se puede observar en integración sin una carrera, y el destino de un
  cierre no cambia tras pedirse.

No hace falta un test más.

## El fixture `caja-459`

El cambio (`bodega_satelite` → `bodega_central`, con `destinoZonaId = cat.centralZonaId`) **preserva
lo que vigilan esos tests**. Análisis estático, porque no se puede medir: lo corrí en `slt124_g1` y
`caja-caracterizacion-459` cae antes, en la siembra (`faltan la zona central, el tipo cedula…`, SL-31),
como dice el baseline.
- La siembra exige `registrarPremio: "ok"` y `anularPremio: "ok"` (`afirmarOk`). Con SLT-124, un cierre
  de satélite daría `sin_cierre` y la siembra misma rompería. El cambio es el mínimo que lo mantiene.
- El cierre del premio tiene P = 0 y totales en 0. El monto (5 000), el `origen_tipo` (`cierre_dia`), el
  egreso y el reverso de caja no cambian. Las cifras de `caja-caracterizacion-459` (`premio 5 000`,
  `cierre_dia|devengo|premio_ranking|5000.00`) siguen iguales.
- Ninguno de los 15 tests que usan `sembrarEscenario459` mira el destino del cierre del premio. Grep de
  `cierrePremioId|bodega_|destinoTipo|adminSat`: solo `libro-caja-a-quien` usa `adminSat`, y lo hace
  sobre `esc.cierreId`, no sobre el del premio.
- Hay una incoherencia sin efecto: el mensajero del fixture es de zona satélite y ahora tiene un cierre
  central, un estado que la app no produce. Ver m3.

## R14 (empresa sin zona central)

- **Comportamiento:** `listMensajeros` sale vacío. El vivo da `ranking: []`, la pantalla usa el
  `EmptyState` existente y no hay texto nuevo. El congelado escribe la cabecera con `filas: 0`. El
  listado da `hayPodio: true, filas: []`: `hayPodio` significa «hay snapshot»
  (`PremioRankingDevengoService.ts:105-114`), así que se lee «hay ranking congelado, sin podio», como
  pide R14.
- **Test:** el caso (j) comprueba que no existe zona central (`count = 0`) y que hay actividad sembrada.
  Afirma los tres puntos y la mutación 3 lo pone en ROJO. El caso queda marcado **[Preview]** con Carlos.

## La integración y `.env`

- No hay caminos verdes sin afirmar:
  - cada `it` comprueba primero lo sembrado (`afirmarPodioSembrado`, conteos y destinos);
  - los `if (… ) throw new Error(...)` hacen fallar el test, no lo dejan pasar;
  - no hay `if (!x) return`.
- `describeSiHayBase` sigue el patrón del repo. Sin base, el test sale **skipped**, no passed. Con base
  dio 10/10, 0 skipped.
- `.env`: lo comprobé solo con booleanos. No imprimí ninguna URL.

## Hallazgos

### Bloqueantes

Ninguno.

### Menores

- **m1 (deuda)** — `ILiquidacionPagoRepository.listarCierresImputables`, la versión sin alcance, se queda
  sin consumidores en `lib/`. Hoy es una trampa de dinero: un llamador nuevo podría colgar dinero de un
  cierre de satélite.
  - **No hace falta quitarla aquí.** El design la deja fuera a propósito: la usan 7 archivos de tests,
    quitarla agrandaría un PR que ya avisa por tamaño, y no tiene ningún consumidor vivo.
  - **Pero solo está anotada en `progress/impl_SLT-124.md`.** Hay que registrarla como `D<n>` en
    `progress/deudas.md`, con dueño, para la revisión de deudas al cerrar la épica de cierres. Se
    resuelve borrándola, o con una guardia que prohíba llamarla desde `lib/`.
- **m2** — La pata de integración de R6 (`premio-ranking-idempotencia.test.ts`, el desempate con solo
  cierres centrales) está en `tests/baseline-rojos.json` y hoy no corre. R6 queda cubierto por el unit
  y por un `orderBy` que no cambia. Cuando SL-31 saque ese archivo del baseline, hay que mirar que salga
  verde.
- **m3** — Fixture `caja-459`: el cambio es correcto (ver arriba), pero no se ha medido, y el mensajero
  sigue en zona satélite con un cierre `bodega_central`. Hay dos salidas: anotarlo junto a m2 para
  SL-31, o decir en el comentario del fixture que la incoherencia es deliberada (precondición con
  P = 0).
- **m4** — En `lib/repositories/CierreDelDiaRepository.ts`, la viñeta nueva del JSDoc
  (`* - \`alcanceWhere(alcance)\``) va con 1 espacio de sangría en vez de 3. Es cosmético.
- **m5** — `progress/features/SLT-124.md` sigue siendo la plantilla sin rellenar (`# SLT-124 «<title>»`).
  Le toca al leader antes del cierre (`CHECKPOINTS.md > Verificación final`).

## Veredicto

**OK**. 0 bloqueantes y 5 menores.
