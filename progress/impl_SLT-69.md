# SLT-69 — implementación (frontend_dev, tanda 1, 2026-10-30)

Hotfix sobre `origin/prod`. Solo cliente: sin cambios en `lib/`, `db/` ni Server Actions.

## Archivos

- M `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts` — relectura única con
  `listarMisAsignaciones` ante una guía fuera de la lista cargada; `procesando` antes de releer;
  un solo `try/finally`; toasts existentes.
- M `app/(app)/mis-asignaciones/_components/RecogerModule.tsx` — `useRefrescarAlVolver(() => router.refresh())`, montado siempre.
- A `hooks/useRefrescarAlVolver.ts` — `visibilitychange` + `focus`, intervalo mínimo 30 s (P2), marca desde el montaje.
- A `tests/components/useRecogerPorGuia.test.tsx`
- A `tests/components/useRefrescarAlVolver.test.tsx`
- A `tests/components/RecogerModuleRefrescoAlVolver.test.tsx`
- M `tests/components/RecogerPaqueteCard.test.tsx` — mock de `listarMisAsignaciones` + caso R2 de punta a punta.
- M `tests/components/RecogerModule.test.tsx` — mock de `listarMisAsignaciones` (por defecto, el servidor no tiene guías nuevas).

## Mapa R → test

| R | Test |
|---|---|
| R1, R2 | `useRecogerPorGuia.test.tsx` > «R1/R2: relee la lista UNA vez y recoge la guía asignada después de abrir la pantalla» |
| R2 (tarjeta) | `RecogerPaqueteCard.test.tsx` > «R2: enviada por teclado, se recoge, dispara onRecogida y deja la confirmación a la vista» |
| R3 | `useRecogerPorGuia.test.tsx` > «R3: si el servidor tampoco la tiene…» |
| R4 | `useRecogerPorGuia.test.tsx` > «R4: si la orden releída está reservada para otro día…» |
| R5 | `useRecogerPorGuia.test.tsx` > «R5: relectura `unauthenticated`…», «R5: relectura `error`…», «R5: relectura que LANZA…» |
| R6 | `RecogerModuleRefrescoAlVolver.test.tsx` > «al volver a estar visible…», «con la lista VACÍA también relee…», «bloqueado también relee…» |
| R7 | `useRefrescarAlVolver.test.tsx` > «visibilidad + foco seguidos cuentan como UNA relectura; a los 29 s no relee; a los 30 s sí», «un foco inmediato tras montar no relee» |
| R8 | `useRefrescarAlVolver.test.tsx` > «un `visibilitychange` que deja la pantalla OCULTA no relee», «tras desmontar, ni el foco ni la visibilidad releen» |
| R9 | `useRecogerPorGuia.test.tsx` > «R9: con la relectura en curso, un segundo envío no relee ni recoge» |
| R10 | `useRecogerPorGuia.test.tsx` > «R10: no relee la lista y recoge con la acción de siempre», «R10: … un `conflict` pinta el aviso de conflicto de siempre» |
| R11 | `RecogerModuleRefrescoAlVolver.test.tsx` > «bloqueado: no hay acceso «Recoger paquete» y el aviso de bloqueo sí está» |

E2E: diferido según `design.md > E2E` (dos sesiones simultáneas; el fallo es 100 % cliente).

## T1 — rojo contra el código de `prod` (antes de tocar el hook)

Comando: `pnpm exec vitest run tests/components/useRecogerPorGuia.test.tsx`

```
 ❯ tests/components/useRecogerPorGuia.test.tsx (9 tests | 7 failed)
     × R1/R2: relee la lista UNA vez y recoge la guía asignada después de abrir la pantalla
 FAIL  … > R1/R2: relee la lista UNA vez y recoge la guía asignada después de abrir la pantalla
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
  1st vi.fn() call:
    Array [
      "La guía 34991060 no está entre tus órdenes para recoger.",
    ]
 ❯ tests/components/useRecogerPorGuia.test.tsx:107:27   (expect(errorMock).not.toHaveBeenCalled())
      Tests  7 failed | 2 passed (9)
```

Los 2 que pasaban eran los de R10 (camino de siempre, sin cambio de comportamiento).

## Verde tras T2-T4

`pnpm exec vitest run` sobre los 5 archivos de test tocados:

```
 Test Files  5 passed (5)
      Tests  107 passed (107)
```

## Gate local

`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` → `INIT_EXIT=0`:
typecheck pasó; lint pasó (0 errores, 230 avisos ya existentes, ninguno en los archivos tocados);
`test:rapido` 315 archivos / 4399 tests verdes (246 rojos del baseline no cuentan); `== init OK ==`.
Avisos amarillos de entorno: node_modules compartido por enlace, 25 worktrees, no hay `.env`.

Veredicto: R1-R11 cubiertos y verdes, gate local en verde; listo para el reviewer.
