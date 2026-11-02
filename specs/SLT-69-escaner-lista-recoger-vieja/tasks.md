# SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla» — tasks

> Una sola tanda, `frontend_dev`. HOTFIX: rama `feature/SLT-69-escaner-lista-recoger-vieja` desde
> `origin/prod`, PR a `prod`. Leer código SOLO de este worktree (`dev` tiene código que `prod` no).
> Sin cambios en `lib/`, `db/` ni Server Actions (D4).

## Tanda 1

- [x] **T1. Test rojo que reproduce el bug** (primero, antes de tocar el hook).
  Crear `tests/components/useRecogerPorGuia.test.tsx` (`// @vitest-environment jsdom`, `renderHook`),
  mockeando `@/lib/actions/mis-asignaciones` (`listarMisAsignaciones`, `recogerAsignaciones`) y
  `@/hooks/useToast`, con DTOs literales. Caso R1/R2 de `design.md > Tests`.
  *Hecho:* el test corre y FALLA contra el código actual de `prod`, con el motivo «toast de error
  "La guía 34991060 no está…"» / `recogerAsignaciones` no llamado. Pegar la salida roja en
  `progress/impl_SLT-69.md`.

- [x] **T2. Relectura y reintento en `useRecogerPorGuia`** (depende de T1).
  Implementar el flujo de `design.md > Contratos > useRecogerPorGuia` (relectura única con
  `listarMisAsignaciones`, `procesando` antes de releer, un solo `try/finally`, toasts existentes).
  Firma pública sin cambios. Actualizar el comentario de cabecera (la restricción «asignada a mí»
  ahora consulta al servidor ante un fallo local).
  *Hecho:* el test de T1 pasa; añadidos y verdes los casos R3, R4, R5 (tres variantes), R9 y R10.

- [x] **T3. [P] Hook `useRefrescarAlVolver`** (independiente de T1/T2).
  Crear `hooks/useRefrescarAlVolver.ts` según `design.md` y `tests/components/useRefrescarAlVolver.test.tsx`
  (fake timers, `Object.defineProperty(document, "visibilityState", …)`).
  *Hecho:* verdes R7 y R8 (incluido el cleanup al desmontar).

- [x] **T4. Conectar en `RecogerModule`** (depende de T3).
  `useRefrescarAlVolver(() => router.refresh())` en `RecogerModule`, montado siempre (también con
  bloqueo o lista vacía). Tests en `tests/components/RecogerModuleRefrescoAlVolver.test.tsx`
  (mock de `next/navigation` y, si hace falta, de `EscanerModal`) y
  `tests/components/RecogerPaqueteCard.test.tsx` (R2 de punta a punta en la tarjeta).
  *Hecho:* verdes R6, R11 y R2 (tarjeta).

- [x] **T5. Cierre** (depende de T2 y T4).
  `pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest related --run <archivos>` y `./init.sh`
  en verde. Mapa `R<n> -> test` completo (R1-R11) en `progress/impl_SLT-69.md`, con la salida roja
  de T1 y la verde final. Commits `fix(SLT-69): …` / `test(SLT-69): …` por task. El PR lo abre el
  leader a `prod` tras el OK del reviewer.
  *Hecho:* gate local verde y trazabilidad completa.

## Archivos esperados

- `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts`
- `app/(app)/mis-asignaciones/_components/RecogerModule.tsx`
- `hooks/useRefrescarAlVolver.ts`
- `tests/components/useRecogerPorGuia.test.tsx`
- `tests/components/useRefrescarAlVolver.test.tsx`
- `tests/components/RecogerModuleRefrescoAlVolver.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `progress/impl_SLT-69.md`
- `progress/features/SLT-69.md`
