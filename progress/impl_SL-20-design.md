# SL-20 · revisión de diseño de `/plataforma/geografia` (decisión 13)

## Archivos
- `app/(app)/plataforma/geografia/page.tsx`: los fallos de lectura bajan como `paisesError` / `divisionError`.
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`: error de países con `Alert`; vacío con `EmptyState` + «Nuevo país».
- `app/(app)/plataforma/geografia/_components/GeografiaAdminModule.tsx`: `cargaErrorInicial`; vacío y «sin resultados» con `EmptyState`; barra de búsqueda solo con división; alta y renombrado como `<form>` con nombre (Enter guarda), foco al nombre al abrir y de vuelta al botón al cerrar; toasts en forma neutra (D15); «Activar» `outline`; chevron con `motion-reduce`.
- `tests/unit/components/geografia-plataforma-page.test.tsx`: describe «Decisión 13» (6 tests).

## Mapa
- D13, errores de carga: «si la lista de países falla…», «si la división falla…».
- D13, vacíos: «sin ningún país dado de alta…», «un país sin división…», «un filtro sin coincidencias…».
- D13 foco y teclado + D15 toast: «el alta lleva el foco al nombre…».

## Comandos
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit`: exit 0.
- `pnpm exec eslint <4 archivos>`: exit 0, 0 problemas.
- `pnpm exec vitest run tests/unit/components/geografia-plataforma-page.test.tsx tests/components/GeografiaPlataformaAltaPais.test.tsx`: 2 archivos, 30/30.

Veredicto: revisión de diseño aplicada a la pantalla, verificaciones en verde.
