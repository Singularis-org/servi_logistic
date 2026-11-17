# SLT-189 «Reparto del mensajero según el canvas» — bitácora de implementación (frontend_dev)

Ruta ligera, spec aprobado por Carlos 2026-11-16 (incluidas DS4 y DS5). Worktree
`.worktrees/SLT-189-reparto-segun-canvas`, rama `feature/SLT-189-reparto-segun-canvas`. Sin push.

## Commits
- `ec496833` feat T1 — fila de Reparto (`filaReparto`) en `PosOrderCardDetalle`.
- `37355796` feat T2 — hueco opcional `trasFiltros` en `BuscadorFiltros`.
- `d8681b1e` feat T3 — `RepartoModule`: conmutador en la barra, KPI en el foco, fila de ayuda compacta.
- `079a1143` test T4 — E2E `pwa-mensajero-reparto.spec.ts` (no corrido en local, lo corre CI).

## Archivos
Producción:
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCard.tsx` (prop `filaReparto?: "direccion" | "tienda"`)
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`
- `components/shared/BuscadorFiltros.tsx` (prop `trasFiltros?: ReactNode`, tras «Filtros» y antes de «Limpiar todo»)

Tests:
- `tests/components/PosOrderCardDetalleCompacta.test.tsx` (+6 casos)
- `tests/components/RepartoAyuda.test.tsx` (7 casos reescritos para desplegar la fila antes de mirar acciones/chips; +4 casos)
- `tests/components/RepartoModoFoco.test.tsx` («sin KPI» reescrito a R798/R799; aserto DS4 tras confirmar)
- `tests/components/RepartoMovil.test.tsx` («sin KPI» reescrito; R507 con la guía; R493 despliega la fila de ayuda; +4 casos)
- `tests/unit/components/buscador-filtros-movil.test.tsx` (+2 casos)
- `e2e/pwa-mensajero-reparto.spec.ts` ((a) R790/R792/R795/R797, (b) R798 y DS4, (c) R796). Ya registrado en `playwright.config.ts`.

`RepartoAyudaResueltaPorLaTienda.test.tsx` y `RepartoModule.test.tsx` no se rompieron: no se tocan.
No se tocaron `EscanerModal`, `QrScanner`, `useEntradaEscaneo` (SLT-159), ni `VistaCardsToggle`, `RecogerModule`,
`RecoleccionModule`, `RecolectadasHoyLista`.

## Mapa R → test
| R | Test |
|---|---|
| R790 | `PosOrderCardDetalleCompacta` «R790: arriba la guía en mono y no la remisión»; `RepartoMovil` R507 (fila /1001/); E2E (a) |
| R791 | `PosOrderCardDetalleCompacta` «R791: sin guía, la remisión ocupa su sitio» |
| R792 | `PosOrderCardDetalleCompacta` «R792: … sin dirección, el nombre solo sin « · »»; E2E (a) |
| R793 | `PosOrderCardDetalleCompacta` «R793: plegada sin «Gestionar»; al tocarla despliega lo de hoy …» |
| R794 | `PosOrderCardDetalleCompacta` «R794: sin `filaReparto` …» y «la fila principal …» (SLT-156) |
| R795 | `RepartoMovil` «R795: dentro de la barra, tras el campo y tras «Filtros» …»; `buscador-filtros-movil` «SLT-189 R795 — `trasFiltros`» (2) |
| R796 | `RepartoMovil` «R796: va en la barra `sticky top-0` y cambiar de vista …»; E2E (c) |
| R797 | `RepartoMovil` «R797: en la fila que envuelve … 44 px»; E2E (a) a 360/414 (`tactil` + `sinDesborde`) |
| R798 | `RepartoModoFoco` «queda el panel … con los KPI encima …» y «la guía de la orden pasa a …» (DS4); `RepartoMovil` «en modo foco queda el panel con los KPI encima …»; E2E (b) |
| R799 | `RepartoModoFoco` «queda el panel … sin barra, conmutador, escáner ni tarjetas»; `RepartoMovil` (sin searchbox ni conmutador en foco) |
| R800 | `RepartoAyuda` «R800: en Mosaico …», «R800: en Detalle …»; `PosOrderCardDetalleCompacta` «R800 (fila) …» |
| R801 | `RepartoAyuda` «R801: plegada sin «Recuperar» ni «Conversación» …», «R801: con el mensajero bloqueado …» |
| R802 | `RepartoMovil` «SLT-189 R802 — fuera del foco y sin bloqueo, el escáner va encima de los KPI y de la barra» |

## Salidas
- Tests tocados + vecinos (27 archivos: Reparto*, PosOrderCard*, Recoger*, Recoleccion, Novedades, Chat*, guardias de PWA/hilo/superficie, buscador): `Test Files 27 passed (27) · Tests 629 passed (629)`, EXIT=0.
- Typecheck `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .`: TSC_EXIT=0, 0 líneas.
- Lint de los 10 archivos tocados: `ESLint: No issues found`, EXIT=0.
- `pnpm run test:guardias`: 353/354 archivos verdes; rojo **ajeno** en `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`
  (4 casos: «init.sh ya no tiene el marcador >>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<»). El diff no toca `init.sh`.
- E2E: no corrido (sin dev server ni build, por instrucción del leader); lo corre CI.

## Mutaciones (commit antes, restauradas con `git checkout --`, árbol limpio después)
Sobre los 4 archivos de componente (50 tests):
| Mutación | Resultado |
|---|---|
| M1 fila vuelve a `numRemision` | 7 rojos (R790, R792, R800 ×2 …) |
| M2 quitar `{kpis}` del foco | 3 rojos (RepartoMovil foco, RepartoModoFoco antes y después de confirmar) |
| M3 conmutador de vuelta a la cabecera | 2 rojos (R795, R796) |
| M4 fila de ayuda sin `compacta` (sin desplegar) | 5 rojos (R800 ×2, R801, R493 …) |
| M5 sin dirección en la segunda línea | 1 rojo (R792) |
| M6 guía también sin `filaReparto` | 2 rojos (R794, fila SLT-156) |
| M7 sin escáner | 1 rojo (R802) |

## Canvas vs spec
Manda el spec; las discrepancias ya están en él: escáner se queda (D1/DC1), despliegue sin reducir (D5),
sin número de parada en la ayuda (235 R15). No apareció ninguna otra al implementar.

## Abierto
- T4 sin marcar: su «Hecho» pide E2E en local y `./init.sh`; quedan para CI / el leader.
- Rojo ajeno de la guardia 420 (`init.sh` sin el marcador del paso 2).

Veredicto: T1-T3 hechas y verdes con mutaciones en rojo; T4 escrita, falta el E2E en CI.

## T4 — gate (leader, 2026-11-16)

- `./init.sh` (rápido) con `.env` de dev: `INIT_EXIT=0`; tamaño 10/40 archivos, 59/1000 producción, 375/3000 tests. E2E `pwa-mensajero-reparto` en CI (proyecto `reparto`).
