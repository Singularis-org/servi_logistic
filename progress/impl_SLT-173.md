# impl SLT-173 «Chips del chat del mensajero sin variante oscura»

Ruta directa (sin spec). Pendiente que dejó SLT-170 (`progress/impl_SLT-170.md:147`).

## Archivos

- `app/(app)/mis-asignaciones/_components/chat/chat-format.ts` — solo las líneas 18-19 (chips
  `en_reparto` y `entregado`). Imports y `zonaCorta` intactos (los toca SLT-125, PR #161).
- `tests/components/ContrasteBrandSoftOscuro.test.tsx` — import de `chipDeEstado` + bloque
  «SLT-173 — chips del chat del mensajero» (en_reparto, entregado y novedad × claro/oscuro).
- `tests/components/textos-estado-455.test.tsx` — líneas 50-51: el literal del contrato R12
  (color por código) recoge la clase nueva, igual que SLT-170 hizo con `novedad`.

## Patrón seguido

- Fondo oscuro = color base al 15 %, sin tinta oscura propia: `components/ui/badge.tsx:42`
  (`success: … dark:bg-success/15`) y `:44` (`info: … dark:bg-info/15`); mismo patrón que
  `novedad` en `chat-format.ts:20` y `NotificationsBell.tsx:116`.
- Sin tokens nuevos; `app/globals.css` sin tocar. El `-strong` de oscuro ya llega a AA sobre el
  fondo nuevo, no hizo falta `dark:text-…`.

## Contraste (aritmética de `tests/fixtures/contraste.ts`, sobre card / background)

| Chip | Claro | Oscuro antes | Oscuro después |
|---|---|---|---|
| en_reparto (info) | 6.16 | 1.91 | 7.39 / 8.26 |
| entregado (success) | 4.84 | 1.70 | 6.97 / 7.93 |

## Rojo → verde

El test mide las clases que devuelve `chipDeEstado` (la función real), renderizadas, contra los
tokens reales de los dos temas.

- Rojo (código de hoy): `Tests 2 failed | 4 passed` — `chip en_reparto ≥ 4.5:1 en oscuro`
  (expected 1.908 ≥ 4.5) y `chip entregado ≥ 4.5:1 en oscuro` (expected 1.695 ≥ 4.5).
- Verde (tras el arreglo): `-t SLT-173` → `Tests 6 passed`.
- Relacionados: `pnpm exec vitest run tests/components/ContrasteBrandSoftOscuro.test.tsx
  tests/components/textos-estado-455.test.tsx tests/unit/guards/estado-con-info.guardia.test.ts
  tests/components/ChatBurbujaContenido.test.tsx tests/unit/components/chat-plantilla-nombre.test.ts`
  → `Test Files 5 passed (5) · Tests 132 passed (132)`. (Antes de actualizar el literal R12,
  1 rojo esperado en `textos-estado-455`.)
- Lint (eslint de los 3 archivos): exit 0.
- Typecheck: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → exit 0, 0 errores (con el heap por defecto se cayó por OOM, exit 134, sin relación con el cambio).

## Veredicto

Chips `en_reparto` y `entregado` del chat legibles en oscuro (≥ 6.97:1) con el patrón de `Badge`.
