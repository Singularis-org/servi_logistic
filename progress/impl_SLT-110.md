# impl SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment»

## Tanda 1 — backend_dev (T0-T3) · 2026-11-12

Worktree `.worktrees/SLT-110-cifras-servidor-fila-bodega`, rama `feature/SLT-110-cifras-servidor-fila-bodega`.
Base desechable `slt110_cifras` (CREATE + `prisma migrate deploy` + `pnpm run db:seed`); `DATABASE_URL`
exportada a ella antes de cada `vitest`. Sin `prisma generate`, sin migraciones. El worktree no tenia
`node_modules`: se creo el junction al del checkout principal.

### T0 — comprobaciones

- **T0.1** `git fetch origin dev` (`868627c3`, contenido en HEAD) + `git grep` de `fulfillmentCargadoAt`,
  `tarifaFaltante`, `cargoFulfillmentAt` y `cargosFulfillmentVigentes` sobre
  `origin/dev:lib/repositories/CierresBodegaAdminRepository.ts`: **sin coincidencias**. Nadie lo emitio.
- **T0.2** Literales del corpus, a mano con `derivarIngresoOrden` (leida: modelo viejo entregado = flete
  `valorFlete` por `esCentral=false` + IVA; comision = % de `montoCobrar` + su IVA) y los conceptos
  congelados del nuevo:
  - A: flete 3 500,00 x 13 % = 455,00; comision 2 % de 25 000,00 = 500,00, IVA 65,00; `ivaIncluido`
    520,00. Fulfillment 600,00 + 78,00 = 678,00, % 13,00. Ajuste 2 500,00 -> 1 800,00 = resta 700,00.
  - C: 2 000,00 x 13 % = 260,00; 3 % de 10 000,00 = 300,00, IVA 39,00; `ivaIncluido` 299,00.
  - Casan todos con `design.md > Verificacion`.

### Archivos

| Archivo | Cambio |
|---|---|
| `lib/repositories/CierresAdminRepository.ts` | `cargosFulfillmentVigentes(prisma, cierreIds)` exportada (vacio -> mapa vacio sin ir a la base); `findCierreByIdEnAlcance` la usa con `[cierreId]` en su mismo `Promise.all`; `LecturaDetalleMensajero` -> `LecturaDetalleFila` (y el parametro `detalleMensajero` -> `detalleFila`). |
| `lib/repositories/CierresBodegaAdminRepository.ts` | `"ordenFulfillmentMovimiento"` en el `Pick`; una llamada a `cargosFulfillmentVigentes` con los ids de `cierresDiaRows`, en paralelo con las lecturas por cierre del dia; el mapeo pasa `{ cargoFulfillmentAt }`. |
| `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` | doble `ordenFulfillmentMovimiento.findMany` (`[]`) + test T2.2. |
| `tests/unit/repositories/cierre-pagos-lectura.test.ts` | doble `ordenFulfillmentMovimiento.findMany` (`[]`) en el camino 3. Mismas aserciones. |
| `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` | nuevo (T3.1). |

`tests/unit/repositories/cierre-bodega-repository.test.ts` (listado en tasks) no necesito cambio: no llama a
`findCierreBodegaConDetalle` con un doble que se rompa.

### Mapa R -> test (lo hecho en esta tanda)

| R | Test |
|---|---|
| R64 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` («gestion A …» `conceptosTarifa`; «gestion C …» `[]`) |
| R65 | idem («gestion A …» `ivaIncluido`, `fulfillmentConIva`, `ivaPctFulfillment`, fecha; «gestion C …» `ivaIncluido`) |
| R66 | idem («gestion A …» `pagoPorTarifa` + ajuste; «gestion B …» `pagoPorTarifa` null y `tarifaFaltante`) |
| R210 | idem (A cargo, B reverso, «R216/R210 …» D no entra) · `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` («SLT-110 R210/R216 …») |
| R211 | idem (A false, B true, C false) |
| R212 | idem («R212: cada gestion de bodega es identica …», `toEqual` de la fila entera contra `findCierreByIdEnAlcance` con `{ lectura: "toda_la_empresa" }`) |
| R213 | idem («R213: la lectura del detalle no escribe en la base») · tests de bodega existentes sin cambiar aserciones |
| R216 | idem («R216/R210: UNA consulta …») · unit T2.2 |
| R214, R215 | fuera de esta tanda (T4 frontend; R215 ya cubierto por `tests/unit/services/cierres-bodega-admin-service.test.ts`, existente) |

### Mutaciones (T3.2, de una en una, cada una revertida antes de la siguiente)

| # | Mutacion | Resultado | Asercion que cae |
|---|---|---|---|
| 1 | quitar `in: cierreIds` del `where` del helper (`some: {}`) | **matada** | «R216/R210: UNA consulta …»: el SQL re-ejecutado trae 3 ordenes (D se cuela) |
| 2 | `secuencia: "desc"` -> `"asc"` | **matada** | «gestion B …»: `fulfillmentCargadoAt` = `2026-11-05T15:00:00.000Z`, esperado null |
| 3 | `tipo === "cargo"` -> `true` | **matada** | «gestion B …»: `fulfillmentCargadoAt` = `2026-11-07T16:00:00.000Z`, esperado null |
| 4 | no pasar `{ cargoFulfillmentAt }` en bodega | **matada** | «gestion A …» (fecha), «gestion B …» y «gestion C …» (`tarifaFaltante` undefined), «R212 …» (31 vs 32 claves) |
| 5 | quitar `actor = mensajero` de `pagosCongelados` | **matada** | «gestion A …» (`importe` 900.00 de la satelite), «gestion B …» (950.00, esperado null) |
| T2.2 | consulta movida dentro del bucle por cierre del dia | **matada** | unit «SLT-110 R210/R216 …»: 2 llamadas, esperado 1 |

Tras revertir: `grep` confirma el codigo original en los cuatro puntos; `git diff` sin restos de mutacion.

### Salidas

- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): exit 0, 0 errores.
- Lint (eslint de los 5 archivos tocados): exit 0, sin avisos.
- `vitest run --reporter=verbose` de `cierre-bodega-cifras-fila-sql-real` + `cierre-detalle-cifras-fila-sql-real`
  (SLT-101, sin tocar) contra `slt110_cifras`: **2 files passed, 17 tests passed, 0 skipped**.
- Unit de bodega (`cierre-pagos-lectura`, `cierres-bodega-admin-repository`, `cierre-bodega-repository`): 3 files, 37 passed.
- Antes del arreglo de dobles: la tanda de `tests/unit/repositories` + servicios de bodega + SLT-101 dio
  5 rojos, todos `Cannot read properties of undefined (reading 'findMany')` (falta del doble) — arreglados.

- `vitest related --run` de los 5 archivos tocados contra `slt110_cifras` (base recien migrada, solo
  catalogos): 3 636 passed, 44 failed, 712 skipped. Clasificacion de los rojos (reporte JSON):
  - 122 archivos de `tests/integration/` caen en su `beforeAll` por fixtures que la base desechable no
    tiene («hay DATABASE_URL pero … `orden` esta vacia / `usuario` … / faltan la zona central …»): piden
    datos de una base de desarrollo, no de esta ficha. Ninguno es de cierres de bodega/admin.
  - `tests/integration/wallet-page.test.tsx` (timeout 20 s) y `tests/integration/db/premio-ranking-idempotencia.test.ts`
    (`unauthenticated` / `orden` vacia): **mismos rojos con el arbol sin mis cambios** (`git stash`), luego ajenos.
  - `tests/components/WalletCajaBarra467.test.tsx` y `tests/integration/db/tope-intentos-caminos.test.ts`:
    verdes al re-correrlos solos (carga de la corrida).
  - Ningun test unitario ni de componente rojo por el cambio; los de cierres (unit + integracion) verdes.
- Guardias (`pnpm run test:guardias`): 4 827 passed, 6 failed. `dependencias-declaradas-presentes`
  (4 rojos: init.sh sin el marcador «FIN PASO 2») falla igual sin mis cambios. `dominio-ordenex-fuera`
  y `otp-debug-solo-en-pruebas` verdes al re-correrlos solos (20/20). Ninguno lee los archivos tocados.

### Veredicto

T0-T3 hechos: el detalle de bodega emite fecha de cargo y `tarifaFaltante` por el mismo mapper y la misma
consulta que el de mensajeros, una consulta por detalle; las cinco mutaciones de la consulta y del mapper
ponen rojo la integracion.

## Tanda 2 — frontend_dev (T4, T5, T6.2, T6.3) · 2026-11-12

Mismo worktree y rama. `DATABASE_URL` exportada a `slt110_cifras` antes de cada `vitest` y del E2E. Sin
cambios en `components/` ni en `app/` (R214: la pantalla ya pintaba los dos campos).

### Archivos

| Archivo | Cambio |
|---|---|
| `tests/components/CierresBodegaAdminCifrasFila.test.tsx` | nuevo (T4.1): 4 tests sobre `CierresBodegaAdminModule` audiencia admin, dobles de las Server Actions y de `DescargarDatasetButton`. |
| `e2e/cierres-rediseno.spec.ts` | B6 (SLT-104): `entregaB6` guardada en el `beforeAll` y un test nuevo al final del describe (T5.1). Literales de SLT-104 sin tocar. |
| `specs/SLT-110-cifras-servidor-fila-bodega/tasks.md` | `[x]` T4.1, T5.1, T6.2, T6.3. |
| `progress/features/SLT-110.md` | herencia para SLT-107 (T6.2). |

### T4.1 — componente

- Fecha del doble `2026-11-04T03:30:00.000Z` = 03/11 21:30 en Costa Rica: el literal «…el 03/11/2026, …»
  no puede acertar con el día UTC (y se niega `04/11/2026`).
- Una segunda gestión sin señales, para que «Con señales 1» no salga de tener una sola fila («Todas 2»).
- Contraprueba: con fecha nula la nota es solo «No depende de esta gestión ni de este cierre.».
- Mutaciones del doble (cada una revertida; `cmp` contra la copia: idéntico):
  | Mutación | Resultado |
  |---|---|
  | `tarifaFaltante: false` en el caso positivo | **matada**: caen «la celda «Señales» … «Con señales 1»» y «la columna «Señales» de «Descargar» …» |
  | fecha nula en el caso positivo | **matada**: cae «con fecha: «Se cargó al saldo de la tienda el 03/11/2026 …»» |

### T5.1 — E2E (B6)

- Test «central, B6: la fila de bodega con el IVA incluido, la tarjeta del flete y «Por tarifa»»: «de eso, IVA
  (no es de la empresa)₡403»; «Se le paga al mensajero» = [«Por tarifa · valor base de la zona <satélite>» ₡2.200,
  «Se le paga» ₡2.200] sin línea de ajuste; en «Ver cómo se calculó», la tarjeta «Flete por entregado» con
  «Tarifa: valor base de la zona <satélite>» y [Monto fijo ₡3.100, + IVA 13 % ₡403, Flete por entregado ₡3.503].
- Corrida local con el candado `e2e.lock`, `E2E_SERVIDOR=dev`, puerto 3000, `NEXT_PUBLIC_APP_URL=http://localhost:3000`
  como en `gate.yml`, base `slt110_cifras`: `pnpm exec playwright test e2e/cierres-rediseno.spec.ts -g "escenario B6"`
  → **2 passed (1.5m)**, `E2E_EXIT=0` (el de SLT-104 y el nuevo, proyecto `dinero`).
- Mutación `pagoPorTarifa: toPagoPorTarifa(g)` → `null` en `toPendienteRowDesdeSnapshot`: **matada** — el test
  nuevo cae en la tarjeta «Se le paga al mensajero» (falta la línea «Por tarifa · valor base de la zona …» ₡2.200);
  el de SLT-104 sigue verde. Revertida con `git checkout --` (`git status` sin el archivo).
- Tras matar el dev server: `rm -rf .next/dev` y typecheck de nuevo, verde.

### Mapa R -> test (T6.3, igual a `tasks.md > Trazabilidad`)

| R | Test |
|---|---|
| R64 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A `conceptosTarifa`; C `[]`) · `e2e/cierres-rediseno.spec.ts` («central, B6: la fila de bodega …», tarjeta del flete) |
| R65 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A `ivaIncluido`, `fulfillmentConIva`, `ivaPctFulfillment`, fecha; C `ivaIncluido`) · `tests/components/CierresBodegaAdminCifrasFila.test.tsx` (nota, con fecha y nula) · `e2e/cierres-rediseno.spec.ts` («de eso, IVA» ₡403) |
| R66 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A `pagoPorTarifa` + ajuste; B `tarifaFaltante`) · `e2e/cierres-rediseno.spec.ts` («Por tarifa», «Se le paga») |
| R210 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A cargo, B reverso, D no entra) · `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` («SLT-110 R210/R216 …») |
| R211 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` (A false, B true, C false) |
| R212 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` («R212: cada gestion de bodega es identica …») |
| R213 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` («R213: la lectura del detalle no escribe …») · `tests/unit/services/cierres-bodega-admin-service.test.ts`, `tests/components/CierresBodegaAdminDetalleUnico.test.tsx` (existentes, sin cambiar aserciones) |
| R214 | `tests/components/CierresBodegaAdminCifrasFila.test.tsx` (nota; celda «Sin tarifa de pago»; «Con señales 1»; columna «Señales» de «Descargar») |
| R215 | `tests/unit/services/cierres-bodega-admin-service.test.ts` («R2: rol sin acceso total … forbidden», existente) |
| R216 | `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` («R216/R210: UNA consulta …») · unit T2.2 |

Todos existen y estuvieron verdes en esta rama (integración y unit en la tanda 1; componente y E2E en esta).

### Salidas

- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC_EXIT=0`, 0 `error TS` (antes y después del E2E).
- Lint (`pnpm exec eslint` de los dos archivos tocados): `LINT_EXIT=0`, sin avisos.
- `vitest run tests/components/CierresBodegaAdminCifrasFila.test.tsx tests/components/CierresBodegaAdminDetalleUnico.test.tsx`:
  **2 files passed, 16 tests passed** (4 nuevos + 12 de SLT-104).
- E2E B6: **2 passed**, `E2E_EXIT=0`. El E2E entero de `cierres-rediseno` y el grupo `dinero` quedan para T6.1 (leader).

### Veredicto

T4, T5, T6.2 y T6.3 hechos: la fila de bodega pinta fecha del cargo, «Sin tarifa de pago» y las cifras del servidor, con componente y E2E que caen con sus mutaciones.

## Gate del leader (2026-11-12)
- `./init.sh` sobre el árbol final (base slt110_cifras): `INIT_EXIT=0`, tamaño aceptado por Carlos. E2E B6 2/2 en local; `cierres-rediseno` entero y grupo `dinero` los corre `e2e-grupo` en CI al sacar el PR de borrador.
