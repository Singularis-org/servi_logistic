# impl SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero»

Tanda backend_dev: T0-T4 (2026-11-12). Base desechable `slt112_ganancia` (base nueva + `prisma migrate
deploy` + `db:seed`). Sin `prisma generate`, sin `migrate reset`, sin migraciones (R72).

## T0 — comprobaciones

- **T0.1** `git grep` en `origin/dev` (`lib components app db`): ni `resumenGanancia`, ni
  `gananciaPendiente`, ni «Ganancia pagada este mes», ni `pago_satelite`. SLT-139 «Pago al mensajero
  independiente del efectivo: satélite» NO está en `dev` (solo commits de docs de SLT-123). Se sigue
  `design.md > 5`, fila «Antes de SLT-139».
- **T0.2** `liquidacion_pago` solo tiene CHECK de beneficiario, de cierre y `monto > 0`: ninguno sobre
  `fecha_pago`, así que 2026-12-01 entra. `reglasPaisFijas()` = `America/Costa_Rica` (UTC−6 sin horario
  de verano): `2026-12-01T03:00Z` = 30-nov 21:00 local. Literales recalculados a mano:
  pendiente 45 000,55 (C1: 50 000,55 − min(50 000,55; 5 000)) + 2 500 (C2: 4 000 − 1 500) = 47 500,55 en
  2 cierres; pagada 1 500 (3-nov) + 2 000 (1-nov) = 3 500,00 en 2 pagos. Casan.
- **T0.3** PA1 = sí (Carlos, 2026-11-12, ya en `progress/features/SLT-112.md > Decisiones`): se queda
  `LecturaPagadoPorSatelite` como puerto opcional, sin inyectar.

## Archivos

Producción:
- `lib/interfaces/repositories/ICierreDiaRepository.ts` — `CierreAprobadoParaPendienteRow` (4 campos
  OBLIGATORIOS) y `findAprobadosParaPendiente`.
- `lib/repositories/CierreDiaRepository.ts` — `findAprobadosParaPendiente` (`findMany` con
  `{ mensajeroId, estado: "aprobado" }`, Decimales a `toFixed(2)`).
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts`, `lib/repositories/LiquidacionPagoRepository.ts`
  — `sumarVigentesDelMensajeroEnRango` (`aggregate`, `VIGENTE`, `gte`/`lt`, `_count._all`).
- `lib/interfaces/services/ICierreDiaService.ts` — `CifraGanancia`, `ResumenGananciaMensajero`,
  `ResumenGananciaServiceResult`, `LecturaPagadoPorSatelite`, `LecturasGananciaMensajero`,
  `resumenGanancia(actor)`.
- `lib/services/CierreDiaService.ts` — parámetro opcional `ganancia` al final del constructor; helper
  privado `pendientesPorCierre` (lo usan `conPendientePago` y `resumenGanancia`); `resumenGanancia`.
- `lib/types/cierre.ts` — `ResumenGananciaResult` (`… | unauthenticated | error`).
- `lib/actions/cierre-dia.ts` — acción `resumenGananciaMensajero` y `{ pagos: new LiquidacionPagoRepository(prisma) }`
  como décimo argumento de `buildService()`.

Tests:
- nuevo `tests/unit/services/cierre-dia-ganancia.test.ts` (14 casos, dobles).
- nuevo `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` (9 casos, Postgres real, espía de sentencias).
- nuevo `tests/integration/db/cierre-dia-ganancia-accion-real.test.ts` (la acción real, `buildService()`, contra la base).
- `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` — `toHaveLength(9)` → `10` (el
  argumento nuevo) y caso SLT-112 que exige `args[9].pagos` instancia de `LiquidacionPagoRepository`.
- `tests/unit/guards/liquidacion-money-safe.test.ts` — censo + `CierreDiaService.ts` y `CierreDiaRepository.ts`.
- Dobles que implementan las interfaces completas (solo el stub nuevo): `cierre-dia-action.test.ts`,
  `cierre-dia-service.test.ts`, `cierre-dia-service-totales-mixtos.test.ts`, `liquidacion-service.test.ts`,
  `liquidacion-anulacion.test.ts`, `liquidacion-reparto-service.test.ts`, `caja-cadena-pago-anulacion.test.ts`,
  `liquidacion-reparto-bloqueos.guardia.test.ts`.

## Desvíos del design (anotados, sin cambiar el contrato)

1. `LecturasGananciaMensajero.pagos` se declara por su forma, no como `Pick<ILiquidacionPagoRepository, …>`:
   `ICierreDiaService.ts` lo importa la pantalla y el `Pick` arrastraría `@prisma/client` al grafo del
   navegador (mismo motivo que ya documenta `LecturasPendienteCierre`). La firma es la misma.
2. El mes siguiente se calcula con `sumarDiasCalendario(dia1, 31).slice(0, 7)` (día 1 + 31 cae siempre en
   el mes siguiente): sin `Number(`/`parseInt(`, que la guardia money-safe prohíbe en el servicio.
3. T2.4: la acción real contra la base va en un archivo propio
   (`cierre-dia-ganancia-accion-real.test.ts`), porque `cierre-dia-pendiente-cableado.test.ts` mockea el
   servicio y el cliente de Prisma a nivel de archivo. El cableado del constructor sí se amplió allí.
4. La acción lleva `@sin-superficie` TEMPORAL (la guardia `superficie-de-uso` la exige mientras ninguna
   ruta la importa). **frontend_dev (T5.3) debe quitarla** al llamarla desde `app/(app)/cierre-dia/page.tsx`.
5. Contrato de SLT-139 (`design.md > 9` de su spec): expone filas `pago_satelite` y la suma POR CIERRE, y
   dice «no expone ninguna suma por mes». El puerto `LecturaPagadoPorSatelite.sumarPagadoPorSateliteEnRango`
   de este spec queda sin implementación hasta que alguien lo construya sobre esas filas (`categoria =
   'pago_satelite'`, `fecha_movimiento` en rango). No se redefine aquí: lo decide el leader al cerrar
   SLT-139 / T7.

## Mapa R → test

| R | Test |
|---|---|
| R350 | sql-real «R350: … 47 500,55 en 2 cierres»; unit «R350/R352: pendiente Σ …»; acción real |
| R351 | sql-real «R351: lo pendiente de cada cierre es el de la celda «Pago» …» |
| R352 | sql-real «R352: … 3 500,00 en 2 pagos» y «… 21:00 del 30 de noviembre sigue siendo noviembre»; unit «R352: el mes son fechas calendario …», «… zona de la empresa …», «diciembre cierra en el 1 de enero …» |
| R353 | unit «R353: con la lectura de lo pagado por la satelite …» y «R353: sin la lectura …» |
| R354 | sql-real «R354: otro mensajero … y otra empresa …», «R354: con un filtro …», «R354: con el rol de la app (RLS) …» |
| R355 | unit «R355: importes de tres decimales …», «0.10 + 0.20 …», «sin aprobados ni pagos … "0.00"»; guardia `liquidacion-money-safe` (censo + rojo con `Number(` plantado) |
| R356 | sql-real «R356: mismas sentencias con seis aprobados (M) que con uno (M3)»; unit «R356 (forma) …» |
| R357 | unit «R357: sin la lectura de los pagos del mes → sin_dato», «sin las lecturas del pendiente → sin_dato», «una lectura que falla sube como excepcion»; cableado SLT-112; acción real (`ok`, no `sin_dato`) |
| R359 | unit «R359: otro rol recibe forbidden sin que se llame a ninguna lectura» |
| R72 | sql-real «R72: leer las cifras no escribe nada»; `cierre-dia-pendiente-pago` unit e integración verdes sin tocar aserciones |
| R358, R360 | pantalla y E2E: T5-T6 (frontend_dev), fuera de esta tanda |

## Medición de consultas (R356)

Espía de sentencias (`crearPrismaDeTestConEspia`) alrededor de `resumenGanancia`: **4 sentencias con M
(6 aprobados) y las mismas 4, misma forma, con M3 (1 aprobado)**: aprobados, Σ pagos vigentes por cierre,
Σ premios vivos por cierre, aggregate de pagos del mes. La zona sale de `reglasPaisFijas` (0 consultas en
el test; 1 en producción, `reglasPais.zonaHoraria()`). Sin N+1.

## Mutaciones (T4.1) — una a una, aplicar → correr unit + sql-real → revertir

| # | Mutación | Resultado | Cae |
|---|---|---|---|
| 1 | sin `mensajeroId` en `sumarVigentesDelMensajeroEnRango` | matada | sql-real R352 (×2), R354 otros mensajeros, R354 RLS |
| 2 | sin `VIGENTE` | matada | sql-real R352 (×2) (suma el anulado 700) |
| 3 | `lte: hasta` | matada | sql-real R352 (×2) (suma el 1-dic) |
| 4 | `gt: desde` | matada | sql-real R352 (×2) (pierde el 1-nov) |
| 5 | sin `estado: "aprobado"` en `findAprobadosParaPendiente` | matada | sql-real R350, R351 |
| 6 | sin `mensajeroId` en `findAprobadosParaPendiente` | matada | sql-real R350, R351, R354 (×2) |
| 7 | `pagoIndependienteEfectivo: false` fijo en el servicio | matada | sql-real R350, R351; unit R350/R352, R353 |
| 8 | contar todos los aprobados | matada | sql-real R350; unit R350/R352, R353 |
| 9 | mes en UTC (`periodoMensual(ahora, "UTC")`) | matada | sql-real R352 fin de mes; unit R352 zona |

9/9 matadas. El script restaura el archivo en `finally` y comprueba byte a byte que quedó igual.

## Verificación

Todo con `DATABASE_URL` → `slt112_ganancia`.

- **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): exit 2, **4 errores, ninguno
  de esta rama**: `lib/repositories/EstadoCuentaRepository.ts(545,35)`, `(558,5)`,
  `lib/repositories/PagoMensajeroMovimientoRepository.ts(50,5)`, `lib/types/wallet-mensajero.ts(67,7)`
  (TS2322 sobre `PagoMensajeroMovimientoCategoria`). Causa: el cliente Prisma compartido de `node_modules`
  ya trae `pago_satelite` (lo regeneró SLT-139 en paralelo; `grep pago_satelite` en `.prisma/client/index.d.ts`
  lo confirma) y esta rama no tiene ese valor. Archivos no tocados aquí. Los errores de mis dobles (8) se
  corrigieron.
- **Lint** (`pnpm run lint`): exit 0, `0 errors, 250 warnings` (ninguno nuevo en los archivos de la tanda).
- **Tests de la tanda** (12 archivos: unit ganancia, sql-real, acción real, cableado, pendiente-pago unit
  e integración, pasados-paginado, cierre-dia-action, cierre-dia-service, totales-mixtos, money-safe,
  superficie-de-uso): `Test Files 12 passed (12)`, `Tests 231 passed (231)`, 0 skipped.
  `cierre-dia-pendiente-pago` (unit e integración) y `cierre-dia-pasados-paginado` verdes sin tocar aserciones (R72).
- **Guardia money-safe** (T2.5): verde (7/7); con `Number(p)` plantado en `resumenGanancia` → rojo
  `"lib/services/CierreDiaService.ts: Number("`; revertido.
- **Guardias** (`pnpm run test:guardias`): 4851 passed, 5 failed → tras anotar `@sin-superficie`, queda
  solo `dependencias-declaradas-presentes.guardia.test.ts` (4 casos): busca en `init.sh` el marcador
  `>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<` y `init.sh` (sin tocar, último commit `9aa7e060` de dev)
  dice `>>> FIN PASO 2: DEPENDENCIAS <<<`. Rojo heredado de `dev`, no de esta rama.
- **`vitest related`** de los archivos tocados: `Tests 41 failed | 5514 passed | 716 skipped`. Los 41 son de
  suites de integración que necesitan una base con datos de desarrollo (`tabla orden vacia: corre db:seed`,
  `falta zona central … seed-zonas`, y su cascada `reading 'prisma'` en `afterAll`), más
  `wallet-458-migration` (catálogo de enum), `455/filtro-ordenes-por-estado` (`referencia a otra empresa`)
  y `premio-ranking-idempotencia` (`listarCierresAdmin`); ninguna toca código de esta rama y las tres
  últimas fallan igual corridas solas. La base desechable solo lleva catálogos, como pide `docs/verification.md`.

**Veredicto:** T0-T4 hechas; R350-R357 y R359 con test verde contra Postgres real y 9/9 mutaciones matadas;
typecheck rojo solo por el cliente Prisma compartido de SLT-139.

---

# Tanda frontend_dev: T5-T6 (2026-11-12)

## Archivos

Producción:
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `CifraId` + `gananciaPendiente`, `gananciaPagada`.
- `components/private/cierres/cola/cola-propia-vista.ts` — `TARJETA_GANANCIA_PENDIENTE`, `TARJETA_GANANCIA_PAGADA`,
  `CIFRAS_GANANCIA_LABEL`, `notaCierresSinLiquidar`, `notaPagosDelMes` (PA3: «<n> pagos»), `tarjetasGanancia`.
- `components/private/cierres/cola/ColaCierres.tsx` — `tarjetas?` en `ColaCierresPropiosProps`; `CifrasCierre` entre la
  barra y la `<section>` de la tabla solo con `tarjetas` no vacías (R357/R158).
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` — prop `resumenGanancia?` → `tarjetasGanancia()` → `ColaCierres`.
- `app/(app)/cierre-dia/page.tsx` — `resumenGananciaMensajero()` en el `Promise.all`, con `.catch` a `error`; solo
  `ok` pasa al módulo; nunca `notFound()` por esta lectura (R357).
- `lib/actions/cierre-dia.ts` — quitada la anotación `@sin-superficie` temporal (ya la llama `page.tsx`).

Tests:
- `tests/unit/utils/cola-propia-vista.test.ts` — 4 casos SLT-112 (notas 0/1/n, orden, destacada, valor intacto, ceros).
- `tests/components/CierreDiaColaPropia.test.tsx` — R158 pasa a «sin cifras → sin tarjetas ni ceros»; 5 casos nuevos
  (dos tarjetas con «₡47.500,55»/«₡3.500» y notas; entre barra y tabla; en cero; en singular; paginar y filtrar no
  las cambian).
- `tests/components/CierreDiaPage.test.tsx` — mock de `resumenGananciaMensajero`; `ok` → tarjetas; `error`, `sin_dato`,
  `forbidden`, `unauthenticated` y una excepción → página cargada sin tarjetas y sin `notFound`.
- `e2e/cierres-rediseno.spec.ts` — suite «SLT-102 — la fila de la cola única (escenario S4)»: el mensajero central
  abre `/cierre-dia` antes y después del «Registrar pago».

## Desvío del design (anotado)

- `CIFRAS_GANANCIA_LABEL` = «Ganancia de tus cierres», no «Tu ganancia» (`design.md > 4`). En `/cierre-dia` la caja
  destacada del detalle de hoy ya es un `group` llamado «Tu ganancia» (`CajaCifra`): con el literal del design había
  dos grupos con el mismo nombre accesible (los tests de componente lo cazaron: «Found multiple elements with the role
  group and name Tu ganancia»). Los rótulos visibles de las tarjetas no cambian.

## Mapa R → test (tanda de pantalla)

| R | Test |
|---|---|
| R357 | componente `CierreDiaColaPropia` «R158/R357: sin las cifras del servidor, sin tarjetas … ni ceros»; `CierreDiaPage` «con `error`/`sin_dato`/`forbidden`/`unauthenticated` …» y «una excepción en la lectura tampoco tumba la página» |
| R358 | unit `cola-propia-vista` «SLT-112 — las tarjetas de la ganancia» (4); componente `CierreDiaColaPropia` «SLT-112 · …» (5); `CierreDiaPage` «con `ok` …»; E2E S4 «central: … «Registrar pago» → «Liquidado»» (antes: «₡3.500» · «1 cierre aprobado sin liquidar» / «₡0» · «Ningún pago este mes») |
| R360 | E2E S4, misma prueba (después del pago, carga nueva: «₡0» · «Ningún cierre aprobado sin liquidar» / «₡3.500» · «1 pago») |

## Mutaciones de pantalla (aplicar → 3 archivos de test → restaurar con copia, `cmp` igual)

| # | Mutación | Resultado | Cae |
|---|---|---|---|
| P1 | `tarjetasGanancia`: pendiente con `valor: "0.00"` fijo (valor del cliente) | matada | unit «dos tarjetas en orden …»; componente «con las cifras del servidor …»; página «con `ok` …» (3) |
| P2 | `CierreDiaModule`: `tarjetas={undefined}` (no se monta) | matada | página «con `ok`»; componente: las 5 de SLT-112 (6) |
| P3 | pagada recalculada en el cliente (`Number(pagada) + Number(pendiente)`) | matada | unit (2), componente (1), página (1) (4) |

## Verificación (tanda de pantalla)

- **Typecheck** antes del build E2E: exit 2 con EXACTAMENTE los 4 errores ajenos (cliente Prisma de SLT-139:
  `EstadoCuentaRepository.ts(545,35)`, `(558,5)`, `PagoMensajeroMovimientoRepository.ts(50,5)`, `wallet-mensajero.ts(67,7)`).
  Después del `prisma generate` del E2E (cliente con el esquema de esta rama): **exit 0, 0 errores**.
- **Lint** (`pnpm run lint`): exit 0, 0 errors; `eslint` de los 8 archivos tocados: «No issues found».
- **Tests de la tanda** (3 archivos): `Test Files 3 passed (3)`, `Tests 52 passed (52)`.
- **`vitest related`** de los 5 archivos de producción: `Test Files 58 passed (58)`, `Tests 1185 passed (1185)`.
- **Guardias**: `4 failed | 4852 passed | 1 skipped`; los 4 son `dependencias-declaradas-presentes.guardia.test.ts`
  (rojo heredado de `dev`, ya anotado arriba). `superficie-de-uso` verde sin `@sin-superficie`.
- **E2E** `pnpm exec playwright test e2e/cierres-rediseno.spec.ts --project=dinero`: **17 passed (1.3m)**, exit 0.
  Base desechable nueva `slt112_e2e_a` (`migrate deploy` + `db:seed`), `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
  `next build` (no `pnpm build`, como `gate.yml`), puerto 3000, candado tomado 20:17:16 y liberado 20:21:49.
  **`prisma generate` con el esquema de esta rama a las 20:17:52** (node_modules compartido): SLT-139 debe regenerar.

**Veredicto (pantalla):** T5-T6 hechas; R357, R358 y R360 con test verde (componente y E2E) y 3/3 mutaciones de
pantalla matadas.
