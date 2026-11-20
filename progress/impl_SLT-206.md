# impl SLT-206 «Filtro Tienda duplicado en Recoger y Recolección» — frontend_dev

Ruta directa, refactor sin cambio visible (m3 de la review de SLT-190). Rama
`feature/SLT-206-filtro-tienda-compartido` desde dev 08a5e385 (origin/dev sin commits nuevos al empezar).
Base desechable de tests: `servi_slt206_desechable`; de E2E: `servi_slt2060_desechable` (nueva, deploy + seed).

## Archivos

- Creado `app/(app)/mis-asignaciones/_components/useFiltroTienda.tsx`: el estado del filtro «Tienda»
  (valor, filtros puestos, opciones memoizadas de una o dos listas, «quitar de Filtros vacía el valor»,
  «Limpiar todo») y el control `FiltroTienda` montado solo con el filtro puesto. Devuelve
  `{ tienda, barra, control }`; `barra` se reparte sobre `BuscadorFiltros` con las MISMAS cinco props
  que antes (`filtros`, `activos`, `onActivosChange`, `onLimpiarTodo`, `hayFiltrosAplicados`).
- Modificado `app/(app)/mis-asignaciones/_components/RecogerModule.tsx` y
  `app/(app)/recoleccion/_components/RecoleccionModule.tsx`: usan el hook. El filtrado (término AND
  tienda, `filtrarPorTienda(filtrarAsignaciones(...))`) se queda en cada módulo, sin tocar: cada uno
  sabe qué listas no se filtran (contadores, escáner; R853).
- Modificado `tests/components/RecogerModule.test.tsx` y `tests/components/RecoleccionModule.test.tsx`:
  dos tests por módulo que fijan el comportamiento antes del refactor.
- Modificado `tests/components/EscaneoContinuo.test.tsx`: R580 espera al foco del campo antes de teclear.
- Creado `progress/features/SLT-206.md`.

Sin cambios en clases, textos ni comportamiento; ninguna dependencia nueva.

## Mapa R → test (los R de SLT-190 que el hook toca)

| R | test |
|---|---|
| R850 opciones de las listas, sin repetir, en orden | `RecogerModule.test.tsx` y `RecoleccionModule.test.tsx` > «R850: …» (existentes) |
| R851/R853 filtra las listas; contadores y escáner no cambian | ídem > «R851/R853 …», «R853 …» (existentes) |
| R852 quitar «Tienda» de «Filtros» vacía su valor | Recoger > «R852: quitar «Tienda» de «Filtros» vuelve a mostrar todas» (existente) y «R852 (SLT-206): al volver a poner «Tienda» tras quitarlo, el control dice «Todas»…» (nuevo); Recolección > «R852 (SLT-206): quitar «Tienda» de «Filtros» vacía su valor…» (nuevo, antes no había) |
| R852 «Limpiar todo» con el filtro puesto sin valor, y retira el control | los dos > «R852 (SLT-206): «Tienda» puesto sin valor ya ofrece «Limpiar todo»…» (nuevos) |
| R854 vacío de búsqueda | ídem > «R854 …» (existentes) |
| R580 cinco Enter seguidos (inestable en CI) | `EscaneoContinuo.test.tsx` > «R580: cinco Enter seguidos…» |

## Salida real

Antes del refactor (tests nuevos incluidos), bloque SLT-190 de los dos módulos:
```
vitest run tests/components/RecogerModule.test.tsx tests/components/RecoleccionModule.test.tsx -t "SLT-190"
 Test Files  2 passed (2)
      Tests  24 passed | 140 skipped (164)
```
Después del refactor:
```
pnpm run typecheck  -> TC=0
eslint <los 3 fuentes + 2 tests>  -> LINT=0
vitest run RecogerModule.test.tsx RecoleccionModule.test.tsx RecoleccionPage.test.tsx unit/components/filtro-tienda.test.ts
 Test Files  4 passed (4)
      Tests  179 passed (179)
```

### Mutaciones (sobre el hook; restauradas)
1. Quitar `if (!siguientes.includes(FILTRO_TIENDA)) setTienda("");` de `cambiarFiltrosPuestos`:
   ROJO, 3 fallos — Recolección «R852 (SLT-206): quitar … vacía su valor», Recoger «R852: quitar …
   vuelve a mostrar todas» y «R852 (SLT-206): al volver a poner …». (`Tests 3 failed | 21 passed`).
   Restaurada a mano: el archivo era nuevo y sin índice, `git checkout --` lo habría vaciado; después
   se añadió al índice.
2. `hayFiltrosAplicados: tienda !== ""` (sin `filtrosPuestos.length > 0`): ROJO, 2 fallos — los dos
   «R852 (SLT-206): «Tienda» puesto sin valor ya ofrece «Limpiar todo»…». Restaurada con
   `git checkout --`.

### R580 inestable
Causa: `user.keyboard` escribe donde esté el foco, y `EscanerModal` lleva el foco al campo con
`initialFocus` del `Dialog`, después de abrir. Si el teclado arranca antes, los primeros caracteres
se pierden (el «10» de 1024 → `[24]` en CI). El resto de tests usan `user.type` sobre el campo (que
hace clic primero) y no lo sufren. Arreglo en el test: `await waitFor(() =>
expect(campo).toHaveFocus())` antes de teclear; sin sleeps. El componente no cambia: el foco llega,
el fallo era del test.
```
20 vueltas de: vitest run tests/components/EscaneoContinuo.test.tsx -t "R580"
BUCLE R580: 20 verdes, 0 rojos de 20
```

## Gate y E2E
Gate rápido (`bash ./init.sh` vía con-desechable, log completo): typecheck y lint pasan; tandas de
vitest `1497 passed`, `1633 passed`, `1660 passed | 1 skipped`, `835 passed`; `INIT_EXIT=0`.

E2E del proyecto `reparto`, tras `next build` (BEXIT=0) sobre la base nueva `servi_slt2060_desechable`,
`E2E_PUERTO=3046`, `NEXT_PUBLIC_APP_URL=http://localhost:3046`:
```
playwright test --project=reparto e2e/pwa-mensajero-recoger-recoleccion.spec.ts e2e/mis-asignaciones.spec.ts
  12 passed (53.1s)
EEXIT=0
```

Veredicto: refactor sin cambio visible, comportamiento fijado y mutado en los dos módulos, R580 estable 20/20; gate y E2E en verde.
