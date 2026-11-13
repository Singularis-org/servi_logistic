# review SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero»

Vuelta 1 · 2026-11-12 · ruta completa · diff `origin/dev...4180e628` (PR #147, 0 commits detrás de `dev`).
Base de vitest: `slt112_ganancia`. Sin `prisma generate`, sin `git stash`; árbol limpio tras las mutaciones.

## Checklist

- [x] **Ruta**: completa (dinero) — `requirements.md`, `design.md`, `tasks.md` presentes.
- [x] **Lo que ya existe** (`design.md > ## Lo que ya existe`): presente y no vacío; el diff reutiliza
  `derivarPendienteCierre`, `sumarVigentesPorCierre`, `sumarPremiosVivosPorCierre`, `periodoMensual`,
  `CifrasCierre`; no re-crea nada de la lista. `conPendientePago` pasa a usar el helper compartido.
- [x] **Trazabilidad R350–R360 + R72**: cada R con test real (ver abajo). Corridos: 9 archivos, 94/94 verdes.
- [ ] **Tasks**: T0–T6 `[x]`; **T7.1–T7.4 sin marcar** (`tasks.md:86-94`). Ver B1.
- [x] **Tamaño**: `tamano-pr.mjs` → 30/40 archivos, 1480/1000 líneas, aceptado por Carlos en
  `progress/features/SLT-112.md` (`tamano-pr-aceptado`).
- [x] **Typecheck**: exactamente los 4 errores ajenos del cliente Prisma regenerado por SLT-139
  (`EstadoCuentaRepository.ts(545,35)`, `(558,5)`, `PagoMensajeroMovimientoRepository.ts(50,5)`,
  `wallet-mensajero.ts(67,7)`); ninguno de esta rama.
- [x] **Lint** de los archivos tocados: 0 errores (7 warnings de parámetros `_x` en dobles).
- [x] **Guardias**: 4852 verdes; los 4 rojos son `dependencias-declaradas-presentes.guardia.test.ts`, que
  está en `tests/baseline-rojos.json` y esta rama no toca `init.sh` → no es hallazgo.
- [x] **CI** del PR #147 en `4180e628`: `gate-completo`, `e2e (dinero)`, `e2e (aislamiento)`, vitest — verdes.
- [ ] **`./init.sh` en el worktree** con `INIT_EXIT` anotado: no consta (T7.2). Ver B1.
- [x] **Multi-empresa / RLS**: sin tablas ni migraciones; `cierre_dia` y `liquidacion_pago` en
  `modelos-de-negocio.ts`; test «R354: con el rol de la app (RLS de la empresa A)» + empresa B y M2 fuera.
- [x] **Dinero sin floats**: `Prisma.Decimal` y `toFixed(2)`; `CierreDiaService.ts` y `CierreDiaRepository.ts`
  entran en el censo de `liquidacion-money-safe`; la pantalla pasa el string tal cual a `money()`.
- [x] **Autorización en servidor**: `resumenGanancia` → `forbidden` sin leer (R359); `mensajero_id` del actor.
- [x] **Sin literal de país/moneda** en código nuevo (el «₡» solo en tests/E2E con el seed CR); sin Ordenex.
- [x] **Literales del contrato y trato en tú**: «Ganancia pendiente de pago», «Ganancia pagada este mes»,
  «1 cierre aprobado sin liquidar» / «<n> cierres aprobados sin liquidar» / «Ningún cierre aprobado sin
  liquidar», «1 pago» / «<n> pagos» / «Ningún pago este mes» (PA3) — idénticos a R358.
- [x] **E2E**: `cierres-rediseno.spec.ts --project=dinero` 17/17 en local (bitácora) + `e2e (dinero)` y
  `e2e (aislamiento)` verdes en CI sobre el mismo SHA.

## Verificación propia

- **R351 / mutación «cierre viejo tratado como nuevo»**: `pagoIndependienteEfectivo: true` solo en el mapeo
  de `resumenGanancia` (`CierreDiaService.ts:715`, la celda intacta) → **matada** por sql-real R350 y
  **R351** (celda ≠ tarjeta) y unit R350/R352, R353. Aplicada también en el helper (afecta celda y
  tarjeta) → matada igual. Revertida, `cmp` byte a byte y `git status` limpio.
- **Mutación «mes en UTC»** (`periodoMensual(ahora, "UTC")`, `:729`) → **matada** por sql-real «a las 21:00
  del 30 de noviembre sigue siendo noviembre» y unit «2026-12-01T03:00Z aún es 30 de noviembre». Revertida.
- **Pagada este mes**: `aggregate` con `{ mensajeroId, fechaPago: { gte: desde, lt: hasta }, ...VIGENTE }`
  (`LiquidacionPagoRepository.ts:242-246`); `VIGENTE = { anulacion: { is: null } }`; rango de fechas
  calendario `@db.Date` a medianoche UTC derivado del mes de la zona de la empresa. Mutaciones 1-4 de la
  bitácora (sin `mensajeroId`, sin `VIGENTE`, `lte`, `gt`) cubiertas por el corpus (anulado 700, 1-dic, 1-nov).
- **+31 días al día 1**: correcto en todos los meses. Día 1 + 31 = día 32 del mes M; M tiene 28-31 días,
  así que cae en el día 1-4 del mes M+1 (nunca en M ni en M+2, porque M+1 tiene ≥ 28 días). Diciembre →
  enero del año siguiente, con test. `sumarDiasCalendario` es aritmética de calendario, sin zona ni DST.
- **Puerto de la satélite**: sin inyectar, `pagadoPorSatelite` es `undefined` y `resumenGanancia` no suma
  nada más (test «R353: sin la lectura … exactamente la de R352», `not.toHaveBeenCalled`). Hoy la cifra es
  exacta: el esquema de esta rama no tiene `pago_satelite` (0 apariciones en `db/schema.prisma`). No hay
  valor por defecto ni rama que invente una cifra. Con la lectura, rango en INSTANTES (00:00 locales del
  día 1 → `06:00Z`), con test.
- **Desvíos**: (1) `pagos` por forma en vez de `Pick`: firma idéntica, y `buildService()` pasa un
  `LiquidacionPagoRepository` que implementa la interfaz, así que una deriva de firma rompe el typecheck —
  aceptado. (2) +31 días: correcto (arriba). (3) grupo «Ganancia de tus cierres»: evita dos `group`
  «Tu ganancia» en la misma página; rótulos visibles intactos — aceptado.
- `ColaCierres.tsx`: el `flex flex-col gap-4` del `TabsContent` también lo ven bodega/central, pero con un
  solo hijo no cambia nada visible.

## Hallazgos

- **B1 — BLOQUEANTE (tasks / checkpoints).** `specs/SLT-112-ganancia-mensajero-servidor/tasks.md:86-94`:
  T7.1-T7.4 sin `[x]`. Falta en concreto:
  - T7.2: `./init.sh` en el worktree con `INIT_EXIT` anotado en `progress/impl_SLT-112.md`
    (`CHECKPOINTS.md` y `docs/checkpoints-proyecto.md > Calidad`). El CI está verde, pero el checkpoint
    pide el rápido en el worktree.
  - T7.3: la nota de lo que hereda SLT-139 en `progress/features/SLT-112.md` está sin escribir, y es la
    única red contra el hueco real: la bitácora (`impl_SLT-112.md:62-66`, desvío 5) dice que el contrato
    de SLT-139 **no expone ninguna suma por mes**, así que nadie implementa hoy
    `LecturaPagadoPorSatelite`. Cuando SLT-139 cree movimientos `pago_satelite` y descuente del pendiente
    (R338) sin inyectar el puerto, «Ganancia pagada este mes» quedará corta en silencio (PA1 = sí). La
    nota tiene que decir quién implementa e inyecta `sumarPagadoPorSateliteEnRango` y en qué ficha.
  - T7.1 (al día con `dev`: hoy 0 commits detrás) y T7.4 (el mapa R → test existe, partido en dos
    tandas en `impl_SLT-112.md:68-82` y `:173-179`): marcar.
- **m1 — menor.** `lib/interfaces/repositories/ILiquidacionPagoRepository.ts:4` y
  `lib/repositories/LiquidacionPagoRepository.ts:23` importan `CifraGanancia` de
  `lib/interfaces/services/ICierreDiaService.ts`: una interfaz de repositorio depende de una de servicio.
  Lo pide el design §1, solo es `import type`; anotar o mover el tipo a `lib/types/` en otra ficha.
- **m2 — menor.** E2E local: solo `e2e/cierres-rediseno.spec.ts --project=dinero`; el perfil pide el grupo
  `dinero` entero y, al tocar datos de negocio, `dos-empresas-humo`. Cubierto por `e2e (dinero)` y
  `e2e (aislamiento)` verdes en CI sobre `4180e628`; no bloquea, pero que conste en T7.2.

## Veredicto

**RECHAZADO** (CAMBIOS) — solo por B1. El código y los tests están bien: R350-R360 trazados, las mutaciones
reproducidas mueren y no hay floats ni fugas entre empresas. Para la vuelta 2: marcar T7.1-T7.4, anotar
`./init.sh` con `INIT_EXIT` y escribir en `progress/features/SLT-112.md` lo que hereda SLT-139, incluido
quién implementa e inyecta el puerto `LecturaPagadoPorSatelite`. Sin cambios de código.

## Vuelta 2 (acotada a a2ffdaaa..1628941d)

Diff: solo `tasks.md`, `progress/impl_SLT-112.md`, `progress/features/SLT-112.md`. Sin cambios de código.

- [x] B1 cerrado: T7.1-T7.4 marcadas `[x]`.
  - T7.1: `origin/dev` es ancestro de HEAD (rama al día).
  - T7.2: `## Gate del leader` en `progress/impl_SLT-112.md` con `INIT_EXIT=0` (base `slt112_ganancia`) y grupo `dinero` / `dos-empresas-humo` en CI del PR #147.
  - T7.3: `## Lo que hereda SLT-139` en `progress/features/SLT-112.md`: SLT-139 IMPLEMENTA `LecturaPagadoPorSatelite.sumarPagadoPorSateliteEnRango` sobre `pago_satelite` y lo INYECTA en el composition root, con integración, antes de su merge.
  - T7.4: `## Mapa R → test` presente en `progress/impl_SLT-112.md` (backend y pantalla).
- menor: la nota dice «anotado también en `progress/features/SLT-139.md`», pero ese archivo no lo menciona en esta rama; la verificación queda del lado del leader (archivo de otra ficha).
- m1 y m2 de la vuelta 1 siguen como estaban (aceptados / en CI).

**Veredicto: OK.**
