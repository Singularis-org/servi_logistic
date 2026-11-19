# SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos» · implementación

Ruta ligera. Spec: `specs/SLT-222-seleccion-entre-busquedas/requirements.md` (T1-T5 marcadas).
Implementer (frontend_dev), 2026-11-19.

## Archivos

Producción:
- `app/(app)/ordenes/_components/OrdenesModule.tsx` (T1): el cambio de `filterKey` ya no vacía la selección; la fila guardada se refresca al llegar la página (R1509); la barra sale con `selectable !== false` y algo marcado (R1506); contador «N seleccionadas · M fuera de esta búsqueda»; desmarcar la cabecera quita solo lo visible (D6).
- `app/(app)/ordenes/_components/OrdenesListado.tsx` (T2): `revalidarListado()` (sin vaciar) para la recepción por escaneo (`handleRecibida`, R1510); el cambio del interruptor «Eliminadas» sube `resetSeleccion` (R1511).
- `app/(app)/ordenes/_components/seleccion-acumulada.ts` (NUEVO, T1/T3): funciones puras compartidas por las dos tablas: `refrescarSeleccion`, `filasSeleccionadas`, `contarFueraDeVista`, `textoContadorSeleccion`.
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx` (T3): `Set` → `Map id -> fila`; `emitir()` y `limpiarFiltros()` ya no vacían; acciones, `hayEstado` y estado común sobre TODAS las marcadas; fuera el aviso Q-K7; botón «Limpiar»; prop `resetSeleccion`; refresco de filas (R1509).
- `app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx` (T3): `comprobarVigencia` pregunta solo con `ids` (R1514), sin el corte de `filtroSinResultados`; `resetSeleccion` sube tras asignar, deshacer, cambiar día, y enviar a central o recuperar con al menos una OK.

Tests nuevos:
- `tests/unit/components/ordenes-module-seleccion-entre-busquedas.test.tsx`
- `tests/components/OrdenesListado.seleccion-entre-busquedas.test.tsx`
- `tests/components/SateliteOrdenesListado.seleccion-entre-busquedas.test.tsx`
- `e2e/seleccion-entre-busquedas.spec.ts` (T4; escrito, NO corrido en local)

Tests reescritos al contrato nuevo (no borrados):
- `tests/unit/components/ordenes-module-busqueda.test.tsx` (R38 → R1501)
- `tests/unit/components/ordenes-module-filter-key.test.tsx` (R60 → R1502)
- `tests/unit/components/ordenes-module.test.tsx` (asimetría de la cabecera → R1513)
- `tests/unit/components/recuperar-orden.ui.test.tsx` (caso R1511 nuevo; comentario del helper; fuera un `console.log` de depuración que dejaba un aviso de lint)
- `tests/components/paginacion/SateliteSeleccionOtrasPaginas.test.tsx` (Q-K7 → contador; R27 → R1502)
- `tests/components/paginacion/SatelitePaginacion.test.tsx` (R47 contador, R26 ×2, R19 → R1514)
- `tests/components/SateliteOrdenesListado.gestion-pendiente.test.tsx` (solo el texto del contador)

Specs (T5): notas «Sustituido por SLT-222 R15xx» en `specs/144-filtros-ordenes` (R60), `specs/170-export-todas-las-tablas` (R47) y `specs/188-deuda-170-listados-completos` (R19, R25, R27).

## Mapa R → test

| R | Test |
|---|---|
| R1500 | `ordenes-module-seleccion-entre-busquedas` «R1500 + R1501 + R1505…»; `SateliteOrdenesListado.seleccion-entre-busquedas` «R1500 + R1501 + R1505 + R1506…» |
| R1501 | ídem; `ordenes-module-busqueda` «R38 + SLT-222 R1501…»; `OrdenesListado.seleccion-entre-busquedas` «R1501 + R1505 + R1508…» (buscador real) |
| R1502 | `ordenes-module-filter-key` «R60 + SLT-222 R1502…»; `ordenes-module-seleccion…` «R1502…»; `OrdenesListado.seleccion…` «R1502: «Limpiar todo»…»; `SateliteOrdenesListado.seleccion…` «R1502…»; `SateliteSeleccionOtrasPaginas` «R27 + SLT-222 R1502…» |
| R1503 | `ordenes-module-seleccion…` «R1503: cambiar el ORDEN…»; `ordenes-module` «la selección se conserva al cambiar de página…»; `SateliteSeleccionOtrasPaginas` «SLT-222 R1503/R1505…» |
| R1504 | `ordenes-module-seleccion…` «R1504…»; `SateliteOrdenesListado.seleccion…` «R1504…» |
| R1505 | `ordenes-module-seleccion…` «R1500 + R1501 + R1505…»; `OrdenesListado.seleccion…` (Generar guía con las dos); `SateliteOrdenesListado.seleccion…` «R1505: ya NO se dice…» y «R1505: el estado común…»; E2E |
| R1506 | `ordenes-module-seleccion…` tres casos «R1506…»; `SateliteOrdenesListado.seleccion…` «R1506: con una búsqueda SIN resultados…» |
| R1507 | `ordenes-module-seleccion…` «R1507…»; `SateliteOrdenesListado.seleccion…` «R1507…» |
| R1508 | `OrdenesListado.seleccion…` «R1501 + R1505 + R1508…» (encadenado guía → etiquetas con las dos); `ordenes-module` «al cambiar `resetSeleccion`…»; `SateliteOrdenesListado.seleccion…` «R1508…» |
| R1509 | `ordenes-module-seleccion…` «R1509…»; `SateliteOrdenesListado.seleccion…` «R1509…» |
| R1510 | `OrdenesListado.seleccion…` «R1510…» |
| R1511 | `recuperar-orden.ui` «SLT-222 R1511…» |
| R1512 | `ordenes-module-seleccion…` «R1512…»; `SateliteOrdenesListado.seleccion…` «R1512 + R1513…» |
| R1513 | `ordenes-module-seleccion…` «R1513…»; `ordenes-module` «SLT-222 R1513…»; `SateliteOrdenesListado.seleccion…` «R1512 + R1513…» |
| R1514 | `SateliteOrdenesListado.seleccion…` «R1514…»; `SatelitePaginacion` «R19 + SLT-222 R1514…»; la parte «la que salió se retira» sigue en `SateliteSeleccionOtrasPaginas` «una orden marcada que SALE del listado…» |

## Rojo antes, verde después

- T1 rojo: 12 fallos en los 4 archivos de `OrdenesModule` antes del cambio (R1503 «orden» ya pasaba: comportamiento previo).
- T2 rojo (con el `OrdenesListado` de `HEAD`): R1510 y R1511 fallan; R1508 ya pasaba (comportamiento previo).
- T3 rojo: 11/11 fallan en `SateliteOrdenesListado.seleccion-entre-busquedas`.

Config: `playwright.config.ts` registra `seleccion-entre-busquedas` en el proyecto `reparto` (lo exige la guardia `e2e-sin-saltos`, que lo vio en el primer `init.sh`).

## Salida de los comandos

- Tests de componente de los archivos tocados:
  - `vitest run` sobre los 4 archivos de `OrdenesModule` + `ordenes-module-orden`: `Test Files 5 passed (5) · Tests 69 passed (69)`.
  - `vitest run` `OrdenesListado.seleccion-entre-busquedas` + `recuperar-orden.ui`: `Test Files 2 passed (2) · Tests 20 passed (20)`.
  - `vitest related --run` `OrdenesModule.tsx` + `OrdenesListado.tsx`: `Test Files 35 passed (35) · Tests 413 passed (413)`.
  - `vitest related --run` `SateliteOrdenesListado.tsx` + `RecepcionSateliteModule.tsx` + `seleccion-acumulada.ts`: `Test Files 45 passed (45) · Tests 537 passed (537)`.
- `./init.sh` (1.ª pasada, `NODE_OPTIONS=--max-old-space-size=8192`): typecheck OK, lint OK (0 errores, 248 avisos previos), `test:rapido` ROJO solo por `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` (`e2e/seleccion-entre-busquedas.spec.ts · spec-sin-proyecto`). `INIT_EXIT=1`. Arreglado en `playwright.config.ts`; la guardia sola: `Tests 38 passed (38)`.
- `./init.sh` (2.ª pasada): `INIT_EXIT=1` en el paso 3+4, AJENO a esta rama: `feature_list.json invalido: faltan specs para features sdd en vuelo: SLT-224` (la copia del board del checkout principal tiene SLT-224 en curso sin spec en ninguna rama; ni tras `git fetch`). No se esquivó el gate; los pasos que no llegó a correr, a mano:
  - `pnpm run typecheck`: `TC_EXIT=0`.
  - `eslint` de los archivos tocados: `LINT_EXIT=0` (0 errores).
  - `pnpm run test:rapido` (con `.env`): lotes `100/100 · 1745`, `100/100 · 1545`, `100/100 · 1459 + 1 skipped`, `11/11 · 169`; `RAPIDO_EXIT=0`.
  - `pnpm run test:guardias`: `Test Files 360 passed (360) · Tests 5405 passed | 1 skipped`; `GUARDIAS_EXIT=0`.
- E2E: NO corrido en local (pide build + base desechable). Pendiente antes del PR (`docs/perfil-agentes.md > E2E en local antes del PR`): `e2e/seleccion-entre-busquedas.spec.ts`, `e2e/recepcion-satelite.spec.ts` y los de `/ordenes`.

## Desvíos del spec

1. **Archivo nuevo `seleccion-acumulada.ts`.** No estaba en «Archivos esperados». Son 4 funciones puras para que las dos tablas compartan modelo y texto del contador (D2), en vez de copiarlas.
2. **`tests/components/OrdenesListado.seleccion-entre-busquedas.test.tsx`** (nuevo) para R1508/R1510 en la superficie real, y **`SateliteOrdenesListado.gestion-pendiente.test.tsx`** (solo el texto del contador). Tampoco estaban en la lista.
3. **`RecepcionSateliteModule.test.tsx`** estaba en la lista, pero no hizo falta tocarlo: sigue verde.
4. **«Enviar a central» y «Recuperar» en la satélite** vacían la selección solo si al menos una orden salió `ok` (con un fallo total, lo marcado se queda para reintentar).
5. **Contador de la satélite**: «N seleccionadas · M fuera de esta búsqueda · <estado común | estados mezclados>». Mantiene la coletilla del estado que ya tenía. Con algo marcado, la barra ya no enseña los totales «X de Y órdenes»: es la regla de antes, ahora con selección acumulada.
6. **La barra de `/ordenes` sale aunque no haya acciones** para lo marcado (antes exigía `accionesActivas.length > 0`). R1506 pide la barra con el total y su «Limpiar» siempre que haya algo marcado.

## Veredicto
T1-T5 hechas; unitarios y guardias en verde; el gate local solo queda rojo por SLT-224, que no es de esta rama; el E2E falta correrlo en local.
