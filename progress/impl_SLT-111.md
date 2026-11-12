# impl SLT-111 «Cifras del servidor: reparto en % y señales de la cola»

## Tanda backend_dev (T0-T4) — 2026-11-12

Base desechable propia `slt111_reparto` (local): `prisma migrate deploy` (todas aplicadas) +
`pnpm run db:seed` (catálogos). Sin `migrate reset` ni `prisma generate`. `.env` del worktree solo
leído para derivar la URL (validada en booleano: local y con la base `slt111_reparto`).

### T0 — comprobaciones

- **T0.1** `git fetch` + `git grep origin/dev`: ningún `porcentajesReparto` en `lib/` y no existe
  `lib/utils/porcentajes-reparto.ts`. `senalesCola` sigue en `CierresAdminService` (SLT-102), sin
  tocar. La rama contenía ya `origin/dev` (c451f6bb).
- **T0.2** Recalculado a mano leyendo `pagoTiendaEmpresa`, `cobradoSobreRecaudado` y `paraLaCentral`
  (`lib/utils/ingreso-empresa.ts`, restas/sumas `Prisma.Decimal` → `toFixed(2)`). Todo casa:
  - MA: 100 000,00 − 4 520,00 (4 000 + 13 %) − 1 130,00 (1 % de 100 000 + 13 %) = 94 350,00;
    empresa 5 650,00 → [94, 6]. Siembra: una entrega `montoCobrar` 100 000,00, pagos efectivo
    70 000,00 + SINPE 30 000,00, `tarifaValorFlete(Gam)` 4 000,00, `tarifaComisionCod` 1,00,
    IVA 13,00/13,00; zona `esCentral`; snapshot `general` 100 000,00.
  - MB: 3 × 10 000,00; empresa 3 × 1 130,00 = 3 390,00; tienda 26 610,00 → [89, 11]. Siembra:
    tres entregas efectivo, flete 1 000,00, comisión 0,00 (`cobraComision` false).
  - MC: `montoCobrar` nulo, sin pagos, `general` 0,00, flete 1 000,00 + 13 % → tienda −1 130,00 → null.
  - BX: 100 000,00 − 3 000,00 − 500,00 = 96 500,00 → [97, 3, 0]. Dos cierres del día (60 000/2 000/500
    y 40 000/1 000/0).
  - BY: 1 000,00 − 1 500,00 − 0,00 = −500,00 → null. Un cierre del día, en otra zona satélite
    (índice `cierre_bodega_zona_solicitado_uq`: un `solicitado` por zona).
  - Literales de la regla: [94,6], [97,3,0], [77,22,1], [89,11], [34,33,33], [100,0]: casan.
- **T0.3** Medido en `dev` ANTES de tocar producción (espía de `crearPrismaDeTestConEspia`):
  - `verCierreDetalle`: MA (1 gestión) = MB (3 gestiones). Sin N+1.
  - `verCierreBodegaDetalle`: **BX (2 cierres del día) = 40 sentencias, BY (1) = 24**. Es un N+1
    PREVIO: `CierresBodegaAdminRepository.findCierreBodegaConDetalle` lee `gestionOrden` y
    `cierreDetail` por cada `cierre_dia` (16 sentencias por día). **ABIERTO para el leader/Carlos:**
    la segunda mitad de R265 («el número de consultas NO DEBE depender del número de cierres del día»)
    no se cumple en bodega desde antes de SLT-111; según T0.3, R265 se reescribe y no se arregla aquí.
    Mientras, el test afirma lo que esta ficha sí garantiza: el servicio de bodega emite **exactamente**
    las sentencias de su repositorio (BX 40 = repo 40, BY 24 = repo 24): el reparto no añade ninguna.
    En mensajero se afirma MA = MB.

### Archivos

- `lib/utils/porcentajes-reparto.ts` (nuevo): la regla (mayor resto, céntimos `Prisma.Decimal`,
  `divToInt`/`mod`, `null` de R261; también `null` sin partes o con un importe que no es entero de
  céntimos).
- `lib/interfaces/services/ICierresAdminService.ts`, `ICierresBodegaAdminService.ts`:
  `porcentajesReparto?: number[] | null` en la rama `ok`, con doc.
- `lib/services/CierresAdminService.ts`: `verCierreDetalle` emite
  `porcentajesReparto([pagoTienda, cobradoSobreLoRecaudado], resumen.totales.general)`.
- `lib/services/CierresBodegaAdminService.ts`: `verCierreBodegaDetalle` emite
  `porcentajesReparto([resumen.paraLaCentral, resumen.totalPagoMensajero, resumen.totalIngresoBodegaRechazos], resumen.totales.general)`.
- `tests/unit/utils/porcentajes-reparto.test.ts` (nuevo, 20 casos).
- `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (nuevo, 7 casos).

### R → test (tanda backend)

Unido en el mapa único de «Vuelta 1 de review» (T7.4).

### Salidas

- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC_EXIT=0`.
- lint: `pnpm run lint` `LINT_EXIT=0` (0 errores; 243 warnings previos, ninguno en los archivos de esta tanda).
- `vitest run` porcentajes-reparto (unit) + cierre-reparto-porcentajes-sql-real (integración,
  `passed`, ninguna `skipped`) + cierres-admin-service + cierres-admin-detalle-lectura +
  cierres-bodega-admin-service + cierre-iva-aparte-sl39: **6 archivos, 204 tests passed**.
- `pnpm run test:guardias`: 343/344 archivos verdes; 4 rojos en
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (busca el marcador
  `">>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<"` y `init.sh` dice `">>> FIN PASO 2: DEPENDENCIAS <<<"`).
  **Previo y ajeno**: `init.sh` y esa guardia son idénticos a `origin/dev`; este diff no los toca.

### T4 — mutaciones (una a una, revertidas; corridos unit + integración)

| # | Mutación | Resultado | Qué cae |
|---|---|---|---|
| 1 | empate: gana la última (`b.indice - a.indice`) | matada | unit bodega `[96,3,1]`, empate triple `[33,33,34]`, orden, 7 partes; integración BX `[96,3,1]` |
| 2 | los puntos que faltan, todos a la primera | matada | unit MA `[95,5]`, sin escala, 7 partes, resto al céntimo; integración MA `[95,5]` |
| 3 | `Math.round` por parte | matada | unit bodega `[97,3,1]`, suma 100 «expected 101», empate triple; integración BX |
| 4 | sin `null` por parte negativa | matada | unit parte negativa `[-50,150,0]`; integración BY `[-50,150,0]` |
| 5 | partes del mensajero invertidas | matada | integración MA `[6,94]`, MB `[11,89]` |
| 6 | `totalPagoMensajero` como total en bodega | matada | integración BX `null` |
| 7 | bodega no emite el campo | matada | integración BX y BY `undefined` |
| 8 | (extra) una lectura más en `verCierreBodegaDetalle` | matada | integración R265 `{bx:80, by:48}` vs `{bx:40, by:24}` |

Árbol de vuelta al original tras cada una (`cmp` contra la copia; `git diff` final solo con el cambio).

Veredicto: T0-T4 hechas; regla y emisión verdes contra Postgres real, 8/8 mutaciones matadas;
abierto R265 (N+1 previo en bodega) para el leader.

## Tanda frontend_dev (spec R265 + T5-T6) — 2026-11-12

Primer plano, sin subagentes. Vitest contra `slt111_reparto`; E2E contra base desechable nueva
`slt111_e2e_1` (`migrate deploy` + `db:seed`), `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000`
como en `gate.yml`, puerto 3000, candado `e2e.lock` tomado y liberado. Sin `migrate reset` ni `prisma generate`.

### Spec

- `requirements.md` R265: en mensajero, consultas independientes del número de gestiones; en bodega, el
  reparto no añade lecturas (servicio = sentencias de su repositorio). N+1 previo de bodega → deuda de la
  épica (decisión del leader en `progress/features/SLT-111.md`). Fila R265 de `tasks.md > Trazabilidad`
  ajustada. Ningún otro R tocado.

### Archivos

- `components/private/cierres/detalle/detalle-cierre-vista.ts`: `vistaMensajeroDesdeAdmin` copia
  `r.porcentajesReparto ?? null` a `empresa.porcentajesReparto`; `vistaBodegaDesdeAdmin` a `porcentajesReparto`.
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`: el estado del detalle gana
  `porcentajesReparto` y `abrirDetalle` lo copia tal cual. `CierresBodegaAdminModule` guarda el resultado
  entero, no necesita cambio. `DineroCierre.tsx` no se toca.
- Tests: `tests/unit/utils/detalle-cierre-vista.test.ts` (+5), `tests/components/DetalleCierreDinero.test.tsx`
  (+4), `tests/components/CierresAdminDetalleUnico.test.tsx` (+3), `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
  (+2), `e2e/cierres-rediseno.spec.ts` (aserciones en escenario A central y B6).

### R → test (tanda frontend)

Unido en el mapa único de «Vuelta 1 de review» (T7.4).

Literales a mano: A 94.350/100.000 → 94 r.35, 5 r.65 → [94, 6]; B6 7.680/2.200/120 de 10.000 → 76 r.8,
22, 1 r.2 → [77, 22, 1]; doble de Limón 30.700/3.300/0 de 34.000 → 90 r.29, 9 r.70, 0 → [90, 10, 0].

### Salidas

- typecheck: `TC_EXIT=0` (antes y después del `next build`).
- eslint sobre los 7 archivos tocados: `LINT_EXIT=0`.
- vitest (4 archivos tocados): **4 archivos, 119 tests passed**.
- E2E `pnpm exec playwright test e2e/cierres-rediseno.spec.ts --project=dinero`: **13 passed (60.0s)**, `E2E_EXIT=0`.

### Mutaciones (una a una, revertidas con `cmp` contra copia)

| # | Mutación | Resultado | Qué cae |
|---|---|---|---|
| F1 | `vistaMensajeroDesdeAdmin` no pasa el campo (`null`) | matada | unit mensajero [94, 6]; módulo admin y satélite «(94 %)» |
| F2 | `vistaBodegaDesdeAdmin` no pasa el campo | matada | unit bodega [97, 3, 0]; módulo bodega «(90 %)» |
| F3 | `abrirDetalle` no copia el campo | matada | módulo admin y satélite «(94 %)» |
| F4 | (E2E) F2 con `next build` | matada | B6: recibido sin «(77 %)», «(22 %)», «(1 %)» |

Tras F4 se volvió a hacer `next build` con el código original (no queda `.next` mutado).

Veredicto: R265 reescrito y T5-T6 hechas; mapeo verde en unit, componente y E2E, 4/4 mutaciones matadas.

## Vuelta 1 de review (backend_dev) — 2026-11-12

Arreglos de `progress/review_SLT-111.md` (commit ddc498e8). Primer plano, sin subagentes; vitest contra
`slt111_reparto`. Sin `migrate reset`, `prisma generate` ni `git stash`.

### Archivos

- `tests/unit/utils/porcentajes-reparto.test.ts` (B1): +2 casos en «aritmetica exacta (R262)», a mano:
  «0,10 / 0,20 de 0,30 → [33, 67]» (céntimos 10/20 de 30: pisos 33/66, restos 10/20) y
  «48 250,10 / 1 750,20 de 50 000,30 → [96, 4]» (restos 0,4996 / 0,5004). En float las dos sumas no
  cuadran (`0.1 + 0.2 !== 0.3`, `48250.1 + 1750.2 !== 50000.3`) y saldría `null`.
- `tests/unit/guards/liquidacion-money-safe.test.ts` (B1): `lib/utils/porcentajes-reparto.ts` al final del censo.
- `specs/SLT-111-cifras-reparto-senales-cola/tasks.md`: m1 (T5.4 «(90 %)», doble `[90, 10, 0]` =
  ₡30.700 / ₡3.300 / ₡0 de ₡34.000); filas R262 y R71 de la trazabilidad; T7.1-T7.4 `[x]`.
- `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (m2): el comentario ya no da R265
  por abierto; el N+1 previo de bodega queda como deuda de la épica.
- `progress/features/SLT-111.md` (T7.3): herencia para SLT-107.

### Mutaciones (revertidas; `git diff lib/` vacío después)

| # | Mutación | Resultado | Qué cae |
|---|---|---|---|
| V1 | `porcentajesReparto` entera en float (`parseFloat`/`Number`, suma `!==`, `Math.floor`, restos float) | matada | los 2 casos nuevos (`expected null to deeply equal [ 33, 67 ]` / `[ 96, 4 ]`); 20 verdes |
| V2 | `const _t = Number(total);` en `lib/utils/porcentajes-reparto.ts` | matada | guardia «ningún archivo de la feature convierte un monto a número» |

### T7 — cierre

- **T7.1**: `git fetch` + `git rev-list --count HEAD..origin/dev` → **0** (origin/dev en c451f6bb). Sin merge.
- **T7.2**: gate del leader `./init.sh` **`INIT_EXIT=0`** (2026-11-12, base `slt111_reparto`, log
  `C:UsersArqDevAppDataLocalTempclaudeaab05f6b97f87a08ea1d74f-bdf8-43cf-8e34-62eab06db841scratchpadgate-111.log`).
  E2E `e2e/cierres-rediseno.spec.ts --project=dinero`: **13/13** en local (tanda frontend). El grupo
  `dinero` entero lo corre el job `e2e-grupo` en CI del PR #139.
- **T7.3**: herencia para SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» en
  `progress/features/SLT-111.md`; PA1/PA2 ya estaban.
- **T7.4**: mapa único abajo, igual a `tasks.md > Trazabilidad`.

### Mapa R → test (único)

| R | Test |
|---|---|
| R70 | Reparto: `tests/unit/utils/porcentajes-reparto.test.ts` · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` · `tests/components/DetalleCierreDinero.test.tsx` · `e2e/cierres-rediseno.spec.ts` (A y B6). Señales de la cola (SLT-102, sin cambios): `tests/integration/db/cierres-cola-senales-sql-real.test.ts` · `tests/unit/utils/cola-cierres-vista.test.ts` |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censa además `lib/utils/porcentajes-reparto.ts` desde la review vuelta 1) · `tests/components/DetalleCierreDinero.test.tsx` (el cliente pinta el entero recibido, sin derivarlo) |
| R72 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (sin escrituras) · tests existentes de los dos servicios verdes sin cambiar aserciones (T2.2) |
| R260 | `tests/unit/utils/porcentajes-reparto.test.ts` ([94, 6], [97, 3, 0], [77, 22, 1], [89, 11], [34, 33, 33], [100, 0]) · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (MA, MB, BX) |
| R261 | `tests/unit/utils/porcentajes-reparto.test.ts` (total 0, parte negativa, no suman) · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (MC, BY) |
| R262 | `tests/unit/utils/porcentajes-reparto.test.ts` › «aritmetica exacta (R262)»: «0,10 / 0,20 de 0,30 → [33, 67]» y «48 250,10 / 1 750,20 de 50 000,30 → [96, 4]» (una versión con `parseFloat`/`Number` da `null` y cae) · `tests/unit/guards/liquidacion-money-safe.test.ts` (censa `lib/utils/porcentajes-reparto.ts`: un `Number(` la pone roja) |
| R263 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (MA central; MB central y adminSatelite) · `e2e/cierres-rediseno.spec.ts` (escenario A) |
| R264 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (BX, BY) · `e2e/cierres-rediseno.spec.ts` (B6) |
| R265 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (sin escrituras; mensajero: mismas sentencias MA = MB; bodega: servicio = repositorio en BX y BY) |
| R266 | `tests/components/DetalleCierreDinero.test.tsx` (franjas, «(n %)», `null` sin barra) |
| R267 | `tests/unit/utils/detalle-cierre-vista.test.ts` (mapeadores; `/cierre-dia` con `empresa: null`) · `tests/components/CierresAdminDetalleUnico.test.tsx` · `tests/components/CierresBodegaAdminDetalleUnico.test.tsx` · `e2e/cierres-rediseno.spec.ts` |

### Salidas

- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC_EXIT=0`.
- eslint sobre los 3 tests tocados: `LINT_EXIT=0`.
- vitest (`slt111_reparto`): porcentajes-reparto (unit) + liquidacion-money-safe (guardia) +
  cierre-reparto-porcentajes-sql-real (integración, ninguna `skipped`): **3 archivos, 36/36 passed**.
- `pnpm run test:guardias`: 343/344 archivos, 4852 passed, 1 skipped, 4 rojos en
  `dependencias-declaradas-presentes.guardia.test.ts`: el mismo previo y ajeno de la tanda backend
  (este diff no toca `init.sh` ni esa guardia).

Veredicto: B1, B2, m1 y m2 arreglados; R262 con un test que distingue Decimal de float y guardia money-safe sobre la regla.
