# impl SLT-212 «Rojos en dev: demo-qa (pago a la plataforma) y escenario 459 (gestión que no vuelve en el cierre)»

Ruta directa, urgente. Worktree `.worktrees/SLT-212-rojos-dev-demo-459` desde `origin/dev` `ab489908`.
Bases desechables locales: `servi_slt212_desechable` (a), `servi_slt212b_desechable` (b), `servi_slt212c_desechable` (c).
El Postgres local tiene `TimeZone = America/Bogota` (`SHOW TimeZone`, medido); el de CI (`postgres:17`) y Supabase, UTC.

## Archivos

| Archivo | Cambio |
|---|---|
| `db/migrations/20261119120100_cobro_plataforma_ocurrido_utc/migration.sql` (nuevo) | `CREATE OR REPLACE` de `cobro_plataforma_porcentual_conciliar`, `cobro_plataforma_al_crear_orden` y `cobro_plataforma_al_cambiar_borrado`, copiadas literales de 20261104150200; solo cambia `now()` → `(now() AT TIME ZONE 'UTC')` en los 4 `INSERT` con reloj. |
| `db/migrations/20261119120100_cobro_plataforma_ocurrido_utc/down.sql` (nuevo) | Las tres definiciones de 20261104150200 tal cual. |
| `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts` (nuevo) | Fija la migración: `SET LOCAL TimeZone = 'Pacific/Kiritimati'` (+14 h) y `ocurrido_at - now() AT TIME ZONE 'UTC'` debe ser 0 en cargo de alta, reverso y re-cobro (fija) y cargo y reverso de la conciliación (porcentual). Control positivo de los tipos de movimiento. |
| `tests/integration/db/_fixtures/caja-459.ts` | `solicitarCierre` y `aprobarCierre` del escenario 459 corren con `comoApp` (rol `servi_app` + empresa de la tx, molde de SLT-177 en `454/_escenario.ts`); después `SET LOCAL ROLE NONE` y la siembra sigue como dueño. |
| `tests/integration/db/orden-traspaso-migration.test.ts` | Lista de migraciones posteriores: + `20261119120100_cobro_plataforma_ocurrido_utc`. |
| `progress/features/SLT-212.md` (nuevo), esta bitácora | — |

## A — demo-qa: `validation_error (monto)` en `registrarEgreso(pago_plataforma)`

**Reproducción (origin/dev `ab489908`, base a, 2026-11-19 01:17 hora de Bogotá):**
`node con-desechable.cjs <wt> servi_slt212_desechable -- pnpm exec vitest run tests/integration/db/demo-qa.test.ts`
→ `Tests 12 failed | 2 passed (14)`; `FALLÓ la demo en «empresa A › dinero › WalletEgresoService.registrarEgreso(pago_plataforma)»: … validation_error (monto)`.
También rojo en `2d926eaf` (dev ANTES de #224, #232, #233 y #237, cuyo CI pasó el 2026-11-18): no es un commit, es la hora.

**Diagnóstico (traza temporal en `receta.ts`, ya retirada):** la factura cerrada de la empresa demo tenía
`desde_at = 2026-11-19 06:00` (00:00 de la plataforma, −06:00, en UTC), `cargos = 0`, `total = 0`; los cargos de sus órdenes tenían
`ocurrido_at = 2026-11-19 01:23` cuando la hora real era 06:23 UTC. `pago_plataforma_disponible` = 0 → `TopePagoPlataformaService` devuelve `supera`.

**Causa raíz:** `db/migrations/20261104150200_cobro_plataforma_porcentual_funciones/migration.sql:121,126,155,195` escriben `now()` en
`cobro_plataforma_movimiento.ocurrido_at` (`timestamp` sin zona): Postgres lo convierte con el TimeZone de la sesión. En la base local
(America/Bogota) el cargo queda 5 h antes de su instante real. `factura_plataforma_ordenes` (20261111130100:378) cuenta
`ocurrido_at >= desde_at`, y el día de la factura empieza a las 06:00 UTC. Ventana roja: de 00:00 a 05:00 hora de la plataforma
(01:00–06:00 Bogotá), cuando el cargo desplazado cae antes del inicio del día. Con TimeZone UTC (CI, Supabase, Preview) no ocurre. El
mismo defecto ya estaba documentado y arreglado en otras funciones (20261028130200, 20261108120300: `now() AT TIME ZONE 'UTC'`).

**Arreglo (app, sin regla de dinero nueva):** migración 20261119120100. Mismos importes, fuentes, secuencias y condiciones; en una
base UTC el valor escrito es idéntico, así que no hay datos que corregir.

**Después (base a con la migración, 02:19 Bogotá, dentro de la ventana):** `demo-qa.test.ts` 14/14 verde (`corrida 1: código 0`).

## B — escenario 459: «Esta gestión no pertenece a lo que vuelve en este cierre»

**Reproducción:** en la suite completa sobre origin/dev (base a, `full1`) cae `como-quedo.test.ts` con ese mensaje. Determinista en la
base b con UNA empresa ajena commiteada con zona central (`INSERT` de `slt212-ajena` + `slt212-central-ajena`):
`vitest run libro-caja-revision-458e.test.ts como-quedo.test.ts` → `Tests 14 failed (14)`, 2 × «no pertenece».

**Causa raíz:** SLT-195 (`fb4d4024`, `3e54e322`, 2026-11-18) pasó el mensajero del escenario a la central. `solicitarCierre` decide central
o satélite con `ZonaRepository.findCentralZonaId` (`lib/repositories/ZonaRepository.ts:925-931`, `findFirst({ esCentral: true })`,
`lib/services/CierreDiaService.ts:952-953`), que en producción acota la RLS de `servi_app`. El fixture 459 corre como DUEÑO (sin RLS):
con otra empresa con central commiteada (la demo de QA mientras corre en paralelo, o restos de una corrida) devuelve la ajena, el
cierre sale `bodega_satelite`, la aprobación de la central no ve la gestión de O4 y la rechaza. Fallo del fixture, no de la app.

**Arreglo (solo test):** los dos pasos del cierre del fixture con `comoApp`, como en producción.
**Después:** base b (con la central ajena) → `14 passed (14)`; los 45 archivos que usan `caja-459` → 44 verdes + 1 rojo ajeno
(`pago-plataforma-confirmacion`: superadmin sobrante de una corrida cortada en b).

## Mutaciones

| Mutación | Resultado |
|---|---|
| Base b: aplicar `down.sql` (vuelve `now()` a secas) y correr `cobro-plataforma-ocurrido-utc.test.ts` | ROJO 2/2: `expected [ 50400, +0, 50400 ] to deeply equal [ +0, +0, +0 ]` y `expected [ 50400, 50400 ]…` (14 h). Reaplicar `migration.sql` → verde 2/2. |
| Fixture 459 sin el cambio (origin/dev) con central ajena en b | ROJO 14/14 (arriba). Con el cambio → verde. |

## Mapa R → test (ruta directa, sin spec)

| Síntoma | Test |
|---|---|
| A: el cargo guarda UTC con cualquier TimeZone | `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts` (2 casos) |
| A: la demo registra el pago a la plataforma | `tests/integration/db/demo-qa.test.ts` |
| B: el cierre del escenario 459 es de la central con otra central en la base | `tests/integration/db/libro-caja-revision-458e.test.ts`, `como-quedo.test.ts` y el resto de usuarios de `caja-459` |

## Siembra de Preview (`scripts/demo-qa.ts --build`)
No se corrió en local: con `VERCEL_ENV=preview` escribiría en el Storage remoto de `.env`. Ejecuta la MISMA receta que
`demo-qa.test.ts` (verde arriba, Postgres real y doble de Storage), después de `migrate-deploy.ts` (`package.json > build`), así que
la migración ya está aplicada cuando siembra. En Preview la base es UTC: el valor escrito no cambia.

## Suite `tests/integration/db`
- **Antes** (origin/dev, base a, 01:30 Bogotá, `full1`): `Test Files 18 failed | 679 passed (698)`, `Tests 76 failed | 6400 passed`. Además de los 3 del baseline: demo-qa (12), `pago-plataforma-sl45*`, `empresas-plataforma-deuda-sl45`, `descarga-pago-plataforma-sl45`, `planes-*`, `tarifa-activacion`, `caja-backfill`, `cierres-*`, `recoleccion-*` y `como-quedo` (B).
- Una corrida intermedia (`full2`, base a) salió con 158 rojos por contención de la máquina (83 × «Unable to start a transaction», 70 timeouts, un `Cannot find module .prisma/client`); se descarta. Re-correr sus 27 archivos con 4 workers dejó solo los 3 del baseline, `caja-backfill` (rojo también antes), la lista de migraciones de `orden-traspaso-migration` (arreglada) y dos que solo fallan con restos de esa corrida (ver Abierto).
- **Después** (base c nueva, migración aplicada, `--maxWorkers=6`, 02:22 Bogotá, dentro de la ventana de A): `Test Files 3 failed | 695 passed (699)`, `Tests 3 failed | 6531 passed (6536)`. Los 3 rojos son los del baseline (`abono-tienda-457-migration`, `cobro-tienda-461-migration`, `wallet-461-migration`). 1 «Worker exited unexpectedly» sin test rojo asociado.

## Gate
`bash ./init.sh` (rápido) sobre la base c: typecheck ✓, lint ✓, `test:rapido` 64 archivos / 779 tests ✓ (3 heredados del baseline no cuentan), todas las migraciones con `down.sql` ✓, tamaño del PR 5/40 archivos. **INIT_EXIT=0**. Baseline: ninguna entrada quitada ni añadida (demo-qa y 459 no estaban en él).

## Abierto
- `caja-invariante-tiendas.test.ts` y `planes-crear-custom-asigna.test.ts` caen en la base a (restos de una corrida cortada; la base a no sirve para medir) tras una corrida cortada (restos commiteados; «cobro completado» escribe 2) con y
  sin el cambio del fixture; verde en b y en una base nueva (c). No es de esta ficha.
- Otros archivos con dueño + lectura global (`findCentralZonaId`) pueden tener el mismo fallo latente que el 459; SLT-177 ya movió el 454.

Veredicto: A arreglado en la app (migración de reloj UTC, sin cambio de regla de dinero) y B en el fixture (cierre con el rol de la app); suite de integración verde salvo baseline, INIT_EXIT=0.

## Tanda 2 (2026-11-19, tras la review rechazada `cb87c369`)

- **B1:** `git merge origin/dev` (merge `9fc1bc3e`). Conflicto en `orden-traspaso-migration.test.ts` resuelto con el orden de
  `readdirSync().sort()`: `…_plan_borrador`, `20261119120000_historial_accion_ordenes_retiradas_a_central`,
  `20261119120100_cobro_plataforma_ocurrido_utc`.
- **m1:** migración renombrada a `20261119120100_cobro_plataforma_ocurrido_utc` (`git mv`); comentario del test nuevo y esta
  bitácora al día. Base nueva `servi_slt212d_desechable`: `prisma migrate deploy` → «All migrations have been successfully applied»
  (las dos de 2026-11-19 en orden: `…120000_historial…` y luego `…120100_cobro…`), `migrate status` → «Database schema is up to date!».
  En d: `orden-traspaso-migration`, `cobro-plataforma-ocurrido-utc`, `demo-qa`, `libro-caja-revision-458e` y `como-quedo` →
  `Test Files 5 passed (5)`, `Tests 45 passed (45)` (02:56 Bogotá, dentro de la ventana de A).
- **m3:** la mutación del fixture 459 da entre 8 y 14 rojos de 14 según la central que devuelva `findFirst`; el veredicto (rojo sin
  el arreglo) no cambia. La base a quedó con restos de una corrida cortada (ver Abierto).
- **B3:** ruta subida a completa. Spec en `specs/SLT-212-rojos-dev-demo-459/` (requirements EARS R1–R6 con su test, design con
  «Lo que ya existe» y cuatro alternativas descartadas, tasks). Trello: `node scripts/trello.mjs editar SLT-212 --labels-menos
  "ruta:directa|complexity:low" --labels-mas "ruta:completa|complexity:medium"` → `SLT-212: +ruta:completa, -ruta:directa`
  (`complexity:medium` ya estaba). Espera la aprobación de Carlos.

### B2 — E2E en local (base d, `next start` en el puerto 3044, Storage falso en 54344)

**Build.** `next build` de la rama fusionada cae en el typecheck: el cliente de Prisma del `node_modules` compartido no tiene el valor
`ordenes_retiradas_a_central` que trae dev (SLT-211) y la regla del arnés prohíbe `prisma generate` ahí. Los E2E se corrieron con el
build de `d474bacf` (el arreglo antes del merge: mismas funciones y mismo fixture; el schema de Prisma sin el enum nuevo) en un
worktree auxiliar ya retirado, contra la base d, que tiene aplicadas TODAS las migraciones, también `20261119120100`.
→ `BUILD_EXIT=0`. Hay que regenerar el cliente compartido (el leader) antes del `gate-completo` y del E2E de CI.

| Corrida | Resultado |
|---|---|
| `playwright test e2e/cobro-plataforma-sl40.spec.ts e2e/facturas-plataforma.spec.ts e2e/pago-plataforma-confirmacion.spec.ts e2e/pago-plataforma-sl45.spec.ts` | `1 failed, 14 did not run, 11 passed`. El rojo es la DEPENDENCIA `[plataforma-vacia] superadmin-empresas.spec.ts:215` (texto del aviso de bienvenida; el servidor dice `[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL`): del entorno local, ajeno a esta ficha. |
| lo mismo con `--no-deps` | **`16 passed (34.2s)`**, `E2E_C_EXIT=0`. Incluye `MEDIDO tras confirmar: deuda ₡1.000 → ₡100`. |
| `playwright test --project=dinero` | `1 failed, 125 passed (6.3m)`. El rojo: `ajuste-pago-mensajero-cierre.spec.ts:143`, `worker process exited unexpectedly (code=3221226505)` (caída del proceso en Windows, no una aserción). |
| `playwright test --project=dinero e2e/ajuste-pago-mensajero-cierre.spec.ts` | **`2 passed (15.6s)`**, `E2E_D_EXIT=0`. |

Resultado: los 4 E2E de cobro, factura y pago de la plataforma y el proyecto `dinero` entero (126) verdes en local, con el Postgres en
America/Bogota y dentro de la ventana roja de A.

### Gate de la tanda 2
- En la base d (con los datos que dejaron los E2E): `test:rapido` cae en `ajuste-caja-anulacion-461` y `caja-invariante-tiendas`
  (restos commiteados, como en la base a). En una base nueva `servi_slt212e_desechable` los dos dan `13 passed (13)`.
- `bash ./init.sh` sobre la base e: typecheck ✓, lint ✓, cliente de Prisma al día ✓, `test:rapido` en 7 tandas todas verdes
  (la mayor `100 passed (100)` / `1790 passed`), migraciones con `down.sql` ✓. **INIT_EXIT=0**.

Veredicto de la tanda 2: B1 y m1 resueltos, B2 con los E2E verdes en local, B3 con spec y ruta completa; espera la aprobación de Carlos.
