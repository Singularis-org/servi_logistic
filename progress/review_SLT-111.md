# review SLT-111 «Cifras del servidor: reparto en % y señales de la cola»

Vuelta 1 · 2026-11-12 · ruta completa · diff `origin/dev...HEAD` (HEAD 1b18ffa2, merge-base c451f6bb = origin/dev, 0 commits detrás).

## Checklist

- [x] Ruta completa (dinero en pantalla): respeta el suelo.
- [x] requirements.md EARS (R70-R72 del madre, R260-R267), design.md con alternativas descartadas.
- [x] `design.md > ## Lo que ya existe` presente y con contenido; el diff no re-crea nada (señales de SLT-102 intactas, `DineroCierre` sin tocar, el hueco `porcentajesReparto` de la vista se rellena, no se duplica).
- [ ] **tasks.md todas `[x]`: NO.** T7.1-T7.4 sin marcar (ver B2).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 14/40 archivos, 1020/1000 líneas, aceptado por Carlos (`progress/features/SLT-111.md`).
- [ ] **Trazabilidad: R262 sin test que lo distinga** (ver B1). El resto, con test real:
  - R70: unit + integración + `DetalleCierreDinero` + E2E (A, B6); señales: `cierres-cola-senales-sql-real.test.ts` y `cola-cierres-vista.test.ts` existen (SLT-102, sin cambios).
  - R71: `DetalleCierreDinero.test.tsx` «[61, 39]» (no deriva de los importes) + guardia money-safe verde.
  - R72: integración «R265/R72» (huella de 15 filas igual antes/después); sin `db/` en el diff.
  - R260/R261: unit (20 casos) + integración MA [94, 6], MB [89, 11] central y satélite, MC null, BX [97, 3, 0], BY null.
  - R263/R264: integración con servicios reales sobre repositorios reales + E2E.
  - R265: mensajero MA (1 gestión) = MB (3); bodega servicio = repositorio (BX y BY). Coincide con el R265 reescrito; el N+1 previo de `findCierreBodegaConDetalle` queda solo como deuda, sin cambios de comportamiento en el repositorio.
  - R266: `DetalleCierreDinero.test.tsx` (franjas, «(n %)», «(0 %)» de PA1, null/ausente).
  - R267: `detalle-cierre-vista.test.ts` (dos mapeadores, `/cierre-dia` sin campo) + dos tests de módulo + E2E.
- [x] Ninguna aserción contra su propia fuente: todos los esperados son literales escritos a mano.
- [x] Sin texto de UI nuevo en producción (trato tú: n/a); sin literal de país/moneda en código nuevo; sin queries nuevas; sin dependencias.
- [x] Typecheck `TC_EXIT=0`; eslint de los 12 archivos tocados `LINT_EXIT=0`.
- [x] Vitest (contra `slt111_reparto`): 9 archivos (los 6 del diff + money-safe + servicios admin y bodega), 311 passed, 0 skipped; la integración corre (7 passed).
- [ ] E2E: `cierres-rediseno.spec.ts --project=dinero` 13 passed en la bitácora; el grupo `dinero` entero (T7.2, `docs/perfil-agentes.md > Todos los agentes`) sin constancia (ver B2).

## Comprobaciones a mano

Regla del mayor resto (`lib/utils/porcentajes-reparto.ts`), en céntimos:
1. 94 350,00 / 5 650,00 de 100 000,00: 943 500 000 ÷ 10 000 000 = 94 r 3 500 000; 56 500 000 ÷ 10 000 000 = 5 r 6 500 000; faltan 1 → la 2.ª → [94, 6]. ✔
2. Empate y parte > 0 que queda en 0: 96 500 / 3 000 / 500 de 100 000 → pisos 96/3/0, restos 0,5/0/0,5; empate 1.ª-3.ª, gana la 1.ª → [97, 3, 0]. ✔
3. Empate triple 1,00 ×3 de 3,00 → 33 r 1 ×3, faltan 1 → [34, 33, 33]. ✔
4. Doble de bodega de T5.4: 30 700 / 3 300 / 0 de 34 000 (`general` del doble = 34000.00) → 90 r / 9 r (0,70) / 0 → [90, 10, 0]. La desviación de «(97 %)» a [90, 10, 0] es correcta: el doble tiene esos importes, y el test inyecta lo que el servidor daría.

Precisión: `Prisma.Decimal` (20 cifras significativas); el mayor producto es céntimos × 100 (≈1e15 para ₡9 999 999 999,99), sin pérdida. `faltan` y los pisos salen por `toNumber()` solo como enteros 0-100. Correcto.

Mutaciones reproducidas (revertidas con `git checkout --`, `git status` limpio tras cada una):
- Orden de las partes de bodega invertido en `CierresBodegaAdminService` → integración BX roja (`[1, 3, 96]` ≠ `[97, 3, 0]`). Matada.
- Empate a la última (`b.indice - a.indice`) → 4 unit rojos. Matada.
- **Implementación entera en coma flotante** (`parseFloat`, suma `===`, `Math.floor`, restos en float) → **20/20 unit verdes. Sobrevive** (B1).

## Hallazgos

- **B1 BLOQUEANTE — R262 sin test que lo verifique.** `tests/unit/utils/porcentajes-reparto.test.ts:115-125` («aritmética exacta») no distingue Decimal de float: `9999999999.98 + 0.01 === 9999999999.99` es `true` en JS y 33,33/33,34/33,33 da lo mismo en float. Medido: una versión con `parseFloat` pasa los 20 casos. La mutación 3 de T4.1 cae por la suma 101, no por precisión. El archivo tampoco está en el censo de `tests/unit/guards/liquidacion-money-safe.test.ts` (`ARCHIVOS_DE_LA_FEATURE`), así que nada impide que entre un `Number(`. Falta: un caso que un float falle, p. ej. `porcentajesReparto(["0.10", "0.20"], "0.30")` → `[33, 67]` (en float `0.1 + 0.2 !== 0.3` da `null`), escrito a mano; y comprobar que muere con la versión float. Opcional: añadir `lib/utils/porcentajes-reparto.ts` al censo money-safe.
- **B2 BLOQUEANTE — T7 sin cerrar** (`specs/SLT-111-cifras-reparto-senales-cola/tasks.md:105-115`): T7.1-T7.4 sin `[x]`. T7.1 se cumple de hecho (0 commits detrás de `origin/dev`), pero falta: `./init.sh` con `INIT_EXIT` anotado y el grupo `dinero` entero (`pnpm exec playwright test --project=dinero`) en `progress/impl_SLT-111.md` (T7.2); la herencia para SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» en `progress/features/SLT-111.md` (T7.3; PA1/PA2 ya están); el mapa R→test único (T7.4; hoy partido en dos tablas y la del backend deja R266/R267/R71 «frontend_dev»).
- **m1 menor** — `tasks.md:88-91` (T5.4) sigue diciendo «(97 %)» para bodega; el test usa [90, 10, 0], correcto según el doble. Ajustar el texto de la task o anotar la desviación ahí.
- **m2 menor** — `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts:604-607`: el comentario dice que R265 «queda para reescribirse»; ya se reescribió (decisión del leader). Dejarlo como deuda de la épica, no como abierto.

## Veredicto

**RECHAZADO** (B1, B2). El código de producción es correcto; lo que falta es un test que discrimine R262 y cerrar T7.
