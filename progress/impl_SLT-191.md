# impl SLT-191 «Cierre del día del mensajero según el canvas» — frontend_dev

Ruta ligera. Spec: `specs/SLT-191-cierre-dia-segun-canvas/requirements.md` (R810-R824). T1-T3 [x];
T4: E2E escrito, **sin correr** (orden del leader: sin dev server ni build). Grafo no usado (Grep/Read).

## Commits
- `5d1de9a6` feat T1 — tarjeta de gestión del mensajero
- `0903e28f` feat T2 — rechazos desplegables
- `caa83a75` feat T3 — Cierres solicitados + barra fija
- `5feec4e3` test T4 — E2E (sin correr)

## Archivos
Producción: `components/private/cierres/fila/FilaGestion.tsx` (prop `tarjetaMensajero`, `TarjetaMensajero`,
disparador estirado, «Devolver» al pie del desplegado), `fila/GestionesCierre.tsx` (la pasa con
`esMovil && audiencia === "mensajero"`), `detalle/RechazosDeTiendaCierre.tsx` (prop `desplegableMovil`,
`FilaRechazoDesplegable`), `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` (prop en sus 3 usos),
`cola/TablaColaPropia.tsx` (columnas móviles, `detallePropioMovil(c, acciones)` solo con «Ver»),
`cola/ColaCierres.tsx` (envoltorio de barra con `BARRA_FIJA` si `propios` y móvil; `data-barra-cola`),
`cola/cola-propia-vista.ts` (comentario).
Tests: `tests/components/GestionesCierreMovil.test.tsx`, `CierreRechazosDeTienda.test.tsx`,
`CierreDiaColaPropia.test.tsx` (2 casos reescritos, no borrados), `ColaCierres.test.tsx` (mock de
`useIsMobile` por defecto escritorio + 2 casos), `e2e/pwa-mensajero-cierre-dia.spec.ts` (ya registrado).

## Mapa R → test
| R | Test |
|---|---|
| R810 | GestionesCierreMovil «R810: a la izquierda guía…» y «R810: sin guía «—»…»; E2E (a) orden vertical |
| R811 | GestionesCierreMovil «R811: plegada NO muestra…» y «R811 (R244)…»; E2E (a) |
| R812 | GestionesCierreMovil «R812: el disparador… estirado…»; E2E (a) toque en el texto |
| R813 | GestionesCierreMovil «R813: la información del resultado… ningún botón dentro de otro» |
| R814 | GestionesCierreMovil «R814: en escritorio…» y «R814: la administración en el teléfono…»; FilaGestion.test (sin prop, sin cambios) |
| R815 | CierreRechazosDeTienda «R815: plegada…», «R815: sin guía y sin motivo…», «`CierreDiaModule`: los tres usos llevan la prop» |
| R816 | CierreRechazosDeTienda «R816: toda la fila es un botón…» |
| R817 | CierreRechazosDeTienda «R817: la nota…», «R817: en escritorio…», «R817: fuera de /cierre-dia…», «`CierresAdminModule`: ningún uso la lleva» |
| R818 | CierreDiaColaPropia «SLT-191 R818: dos columnas…»; E2E (b) |
| R819 | CierreDiaColaPropia «SLT-191 R819: la fila plegada no trae «Ver»…»; E2E (b) |
| R820 | CierreDiaColaPropia «SLT-191 R820: al desplegar, solo «Ver»…»; E2E (b) |
| R821 | CierreDiaColaPropia «en escritorio, las ocho columnas de hoy…» (+ Recaudado/Pago/Ver); ColaCierres «central: la cola no lleva el desplegable…» |
| R822 | CierreDiaColaPropia «R822: en el teléfono, el envoltorio… `sticky top-0`»; E2E (b) estilo calculado |
| R823 | CierreDiaColaPropia «R823: en escritorio, la barra no queda fija»; ColaCierres «central y satélite: la barra no queda fija» |
| R824 | este mapa y `progress/features/SLT-191.md` |

## Mutaciones (commiteado antes; restauradas con `git checkout --`, sin stash)
| # | Mutación | Rojo |
|---|---|---|
| M1 | sin `absolute inset-0` en el disparador | R812 |
| M2 | `tarjetaMensajero={esMovil}` (admin afectado) | R814 admin |
| M3 | «Devolver» en la tarjeta plegada | R811 (2 casos) |
| M4 | fila de rechazo no desplegable | R815, R816 |
| M5 | `CierreDiaModule` sin la prop en un uso | composición (3 usos) |
| M6 | tienda en la fila plegada del rechazo | R815 |
| M7 | folio fuera de la fila de la cola | R818 |
| M8 | «Recaudado» de vuelta en el desplegado | R820 |
| M9 | barra fija también en la administración | R823 (ColaCierres) |
| M10 | barra no fija en el teléfono | R822 |

## Salidas
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0`, sin salida.
- `pnpm run lint` → `LINT_EXIT=0`, `0 errors, 248 warnings` (ninguno en archivos tocados).
- `pnpm exec vitest run` (9 archivos: los 6 de la ficha + ContrasteBrandSoftOscuro + guardias
  estado-con-info y pwa-mensajero-sin-recorte) → `Test Files 9 passed (9)`, `Tests 373 passed (373)`.
- `pnpm exec vitest run` (54 tests de componente que importan los módulos tocados) →
  `Test Files 54 passed (54)`, `Tests 1050 passed (1050)`.

## Abierto
- T4: el E2E no se ha corrido (ni `./init.sh`). El leader lo corre en base desechable antes del PR.
- E2E (b): con un solo cierre la cola no da para desplazar; la barra fija se comprueba por
  `position: sticky; top: 0px`, no midiendo tras un scroll.
- Sin chevron visible en la tarjeta de gestión ni en la fila de rechazo (el canvas no lo pinta).

Veredicto: T1-T3 hechos y verificados (tsc 0, lint 0 errores, 373+1050 tests verdes, 10 mutaciones en rojo); falta correr el E2E.
