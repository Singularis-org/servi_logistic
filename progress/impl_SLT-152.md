# impl SLT-152 «Tablas de cierres legibles» (frontend_dev, 2026-11-13)

Ruta ligera. Spec: `specs/SLT-152-tablas-cierres-legibles/requirements.md` (R440-R450). PA1 = SÍ
(Carlos): las pastillas del filtro también pasan a «Entregado (12)» → **R450** y tarea **T4b**, añadidas
al spec.

## Archivos

Producción (5):
- `components/private/cierres/fila/fila-gestion-labels.ts` — `COL_DESTINO` → `COL_DESTINATARIO`
  «Destinatario» + `COL_TIENDA` «Tienda»; `textoFiltro` → `` `${nombre} (${n})` `` (R450).
- `components/private/cierres/fila/fila-gestion-vista.ts` — `ColumnaId` y `columnasDe`:
  `destino` → `destinatario` + `tienda`.
- `components/private/cierres/fila/FilaGestion.tsx` — `ANCHO` según D2; `CELDA_RECORTA`
  (`block min-w-0 truncate`) y `TextoRecortado` con `title` para Destinatario, Tienda y Mensajero
  («—» sin nombre); `data-columna` en cada celda de la rejilla.
- `components/private/cierres/fila/GestionesCierre.tsx` — `data-columna` en la cabecera.
- `components/private/cierres/cola/ColaCierres.tsx` — pestaña `` `${p.label} (${p.conteo})` ``.

Tests y E2E: ver `git show --stat` del commit (literales «Nombre n» → «Nombre (n)» en pestañas y
pastillas, helpers `pestanaDeCola`/`pestanaDeColaBodega` a `^nombre \(\d+\)$`, bloque R446 en
`e2e/cierre-bodega-satelite.spec.ts`).

Descargas: ningún archivo de descarga en el diff (`git diff --name-only | grep -i descarga` vacío).

## Mapa R → test

| R | test |
|---|---|
| R440 | `tests/unit/utils/fila-gestion-vista.test.ts` «R23, R86, R440, R441 — columnas por audiencia» (3 audiencias, literales); `tests/components/DetalleCierreGestiones.test.tsx` «R440: cabecera de la central…» y «R440: la cabecera del mensajero…»; `tests/components/CierreBodegaDetalleGestiones.test.tsx` «R440, R441: la cabecera, en literal…» |
| R441 | `fila-gestion-vista.test.ts` «R441 — ninguna audiencia…»; `DetalleCierreGestiones.test.tsx` «R441: ninguna audiencia muestra la cabecera…» |
| R442 | `tests/components/FilaGestion.test.tsx` «R442: destinatario y tienda, cada uno en su celda y sin «·»» |
| R443 | `CierreBodegaDetalleGestiones.test.tsx` «R443: la cabecera y cada fila tienen el mismo número de celdas y el mismo gridTemplateColumns» (plantilla literal) |
| R444 | `FilaGestion.test.tsx` «R444: el elemento con el texto es de bloque, recorta…» |
| R445 | `FilaGestion.test.tsx` «R445: sin nombre de mensajero…» |
| R446 | `e2e/cierre-bodega-satelite.spec.ts` test «2 — …», `textoSinMontar` (1280 px; primero comprueba que el nombre es más ancho que su columna) |
| R447 | `tests/components/ColaCierres.test.tsx` «R447, R449: «Pendientes (37)»…»; `ColaCierresConsolidar.test.tsx` «R447, R449 (SLT-152)…»; `CierreDiaColaPropia.test.tsx` «R155…» (con R447/R449) |
| R448 | `ColaCierres.test.tsx` «R448: un conteo 0…»; `CierreDiaColaPropia.test.tsx` «R160, R448 (SLT-152)…» |
| R449 | los tres de R447 (`not.toMatch(/^\S.* \d+$/)` en cada pestaña) |
| R450 | `fila-gestion-vista.test.ts` «R450 — 7 opciones «<nombre> (<n>)»…» (literales + `not.toMatch`) |

## Mutaciones (revertidas; salida real)

- **M1 — quitar `block` del recorte** (`CELDA_RECORTA = "min-w-0 truncate"`):
  - componente `tests/components/FilaGestion.test.tsx`: `Tests  1 failed | 32 passed (33)` —
    `× R444: el elemento con el texto es de bloque, recorta…` (`expected false to be true`).
  - E2E (`next build` con la mutación, `e2e/cierre-bodega-satelite.spec.ts`): `1 failed / 1 did not run /
    4 passed` — `Error: «destinatario» invade «tienda»  Expected: <= 375.578125  Received: 457.296875`.
    La precondición «el nombre es más ancho que su columna» pasó: el rojo es el del solape, no uno vacío.
  - Revertida con `sed`; `next build` limpio y la misma spec: `6 passed`, `E2E_EXIT=0`.
- **M2 — pestañas a «Resueltos 4»** (`` `${p.label} ${p.conteo}` `` en `ColaCierres.tsx`):
  `ColaCierres` + `ColaCierresConsolidar` + `CierreDiaColaPropia`: `Tests  8 failed | 63 passed (71)`
  (R447/R449, R448, «Cierres solicitados (0)», etc.).
  - Incidente: la revertí con `git checkout --`, que devolvió el archivo a HEAD (sin el arreglo). Lo
    detectó la corrida E2E de M1 (`Received: "Solicitados 2"`); se reaplicó el arreglo y se rehízo
    `next build` antes de la corrida de M1 válida y de la final.

## E2E local (`--project=dinero`, puerto 3045, storage 54330, base nueva `slt152_e2e`)

Specs: `cierre-bodega-satelite`, `cierre-dia`, `cierres-admin`, `cierres-admin-rechazos-sla`,
`ajuste-pago-mensajero-cierre`, `cierres-rediseno`, `tarifas-activacion`,
`cierre-modelo-nuevo-plan-porcentual`.

- Primera tanda: `2 failed` — `tarifas-activacion` y `cierre-modelo-nuevo-plan-porcentual` buscaban la
  pastilla con `` `^${pestana.source}.* \d+$` ``; corregidas a `\(\d+\)`.
- Base recreada. Corrida A: `25 failed / 28 did not run / 1 passed`, todas por la app caída
  (`net::ERR_CONNECTION_REFUSED at http://localhost:3045/login`, `TypeError: fetch failed` ×19): el
  servidor murió, no es un fallo de aserción de la ficha.
- **Corrida 1 (B): `54 passed (5.1m)`, `E2E_EXIT=0`. Corrida 2 (C, misma base): `54 passed (4.0m)`,
  `E2E_EXIT=0`.** 0 failed / 0 skipped / 0 flaky en las dos.

## Comandos finales (árbol final, sin mutaciones)

- `pnpm exec tsc --noEmit` → `TSC_EXIT=0`
- `pnpm exec eslint <ts/tsx tocados>` → `ESLINT_EXIT=0`
- `pnpm exec vitest related --run <tocados>` → `Test Files  54 passed (54)`, `Tests  976 passed (976)`, `RELATED_EXIT=0`
- `pnpm exec vitest run tests/unit/guards` → `Test Files  1 failed | 246 passed (247)`, `Tests  4 failed | 3643 passed | 1 skipped`, `GUARDS_EXIT=1`.
  Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts` (guardia 420: «init.sh ya no
  tiene el marcador ">>> FIN PASO 2…"», «init.sh invoca scripts/verificar-dependencias.mjs»). `init.sh`
  no está en el diff de esta ficha (`git diff --quiet HEAD -- init.sh`): rojo ajeno, para el leader. La
  guardia de trato del módulo de cierres está en verde dentro de esa corrida.
- `next build` final limpio (`BUILD_EXIT=0`) y `e2e/cierre-bodega-satelite.spec.ts`: `6 passed`.

## Abierto

- Tamaño: 34 archivos en el diff (+ esta bitácora); el spec preveía 21 (tope 32). Lo rompen los tests
  y E2E que leían «Nombre n» de las pastillas (PA1 amplió el alcance). Propuesta: aceptar con este
  desglose, no partir.
- Guardia 420 en rojo sin tocar `init.sh` (ver arriba).

Veredicto: SLT-152 implementada (T1-T6 + T4b); E2E dos corridas verdes; falta `./init.sh` (leader).

## T7 (leader)
- `./init.sh` verde tras mergear dev: `INIT_EXIT=0` (log `gate-152.log`, base `slt152_wt`). Review 1 APROBADO. Menor 2 (comentarios de test con el formato viejo «<resultado> <n>», sin aserciones) queda sin tocar.
