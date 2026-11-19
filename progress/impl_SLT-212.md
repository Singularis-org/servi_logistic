# impl SLT-212 «Rojos en dev: demo-qa (pago a la plataforma) y escenario 459 (gestión que no vuelve en el cierre)»

Ruta directa, urgente. Worktree `.worktrees/SLT-212-rojos-dev-demo-459` desde `origin/dev` `ab489908`.
Bases desechables locales: `servi_slt212_desechable` (a), `servi_slt212b_desechable` (b), `servi_slt212c_desechable` (c).
El Postgres local tiene `TimeZone = America/Bogota` (`SHOW TimeZone`, medido); el de CI (`postgres:17`) y Supabase, UTC.

## Archivos

| Archivo | Cambio |
|---|---|
| `db/migrations/20261119120000_cobro_plataforma_ocurrido_utc/migration.sql` (nuevo) | `CREATE OR REPLACE` de `cobro_plataforma_porcentual_conciliar`, `cobro_plataforma_al_crear_orden` y `cobro_plataforma_al_cambiar_borrado`, copiadas literales de 20261104150200; solo cambia `now()` → `(now() AT TIME ZONE 'UTC')` en los 4 `INSERT` con reloj. |
| `db/migrations/20261119120000_cobro_plataforma_ocurrido_utc/down.sql` (nuevo) | Las tres definiciones de 20261104150200 tal cual. |
| `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts` (nuevo) | Fija la migración: `SET LOCAL TimeZone = 'Pacific/Kiritimati'` (+14 h) y `ocurrido_at - now() AT TIME ZONE 'UTC'` debe ser 0 en cargo de alta, reverso y re-cobro (fija) y cargo y reverso de la conciliación (porcentual). Control positivo de los tipos de movimiento. |
| `tests/integration/db/_fixtures/caja-459.ts` | `solicitarCierre` y `aprobarCierre` del escenario 459 corren con `comoApp` (rol `servi_app` + empresa de la tx, molde de SLT-177 en `454/_escenario.ts`); después `SET LOCAL ROLE NONE` y la siembra sigue como dueño. |
| `tests/integration/db/orden-traspaso-migration.test.ts` | Lista de migraciones posteriores: + `20261119120000_cobro_plataforma_ocurrido_utc`. |
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

**Arreglo (app, sin regla de dinero nueva):** migración 20261119120000. Mismos importes, fuentes, secuencias y condiciones; en una
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
- `caja-invariante-tiendas.test.ts` y `planes-crear-custom-asigna.test.ts` caen en la base a tras una corrida cortada (restos commiteados; «cobro completado» escribe 2) con y
  sin el cambio del fixture; verde en b y en una base nueva (c). No es de esta ficha.
- Otros archivos con dueño + lectura global (`findCentralZonaId`) pueden tener el mismo fallo latente que el 459; SLT-177 ya movió el 454.

Veredicto: A arreglado en la app (migración de reloj UTC, sin cambio de regla de dinero) y B en el fixture (cierre con el rol de la app); suite de integración verde salvo baseline, INIT_EXIT=0.
