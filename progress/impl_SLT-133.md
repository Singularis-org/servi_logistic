# SLT-133 «Mensajes del servidor de cierres en tú y con tildes» — bitácora de implementación

2026-11-11 · backend_dev · rama `feature/SLT-133-mensajes-servidor-tu` (base `27c76646`). Ruta ligera, T1-T8.

## Archivos modificados

Producción (solo literales de las 13 constantes de `## Inventario`; ninguna lógica):
- `lib/services/CierreDiaService.ts` — L1-L10 (10 constantes).
- `lib/services/CierreBodegaService.ts` — M1 y L3.
- `lib/services/CierresAdminService.ts` — N1.

Tests (cada literal escrito a mano, nunca leído de la constante):
- `tests/unit/services/cierre-dia-service.test.ts` — L4 (×2) y L1 al texto nuevo; `toContain`/`toMatch`
  sobre el texto viejo pasan a `toBe`/`toEqual` exactos (L1 en `motivoBloqueo`, L8 l.1019 `/mas reciente/`,
  que el spec no listaba); nuevas aserciones exactas `status` + campo para L2 (×2), L3 día, L7, L10.
- `tests/unit/services/cierre-bodega-service.test.ts` — nuevas aserciones exactas para L3 bodega
  (`motivoBloqueo` y `fieldErrors.zona`) y M1 (`motivo` y `motivoBloqueo`).
- `tests/unit/services/cierre-dia-477-resolicitud.test.ts` (L5), `cierre-dia-477-deshacer.test.ts`
  (L4, L6, L8, L9), `cierres-admin-confirmacion-fisica.test.ts` (N1 ×2).
- `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts` (L6),
  `cierre-rechazo-tienda-totales.test.ts` (L2), `tarifas-valor-propio-caminos.test.ts` (L3 día).
- `tests/components/CierreDiaModule.test.tsx` — L1 (l.373/380) y L10 (l.1315/1321). J3 sin tocar.

Arnés: `specs/SLT-133-mensajes-servidor-tu/requirements.md` (tasks marcadas), `progress/features/SLT-133.md`
(contraprueba T7), este archivo.

## Mapa R → test

| R | Test |
|---|---|
| R56 | Un test por fila con el literal nuevo sin voseo: L1 `cierre-dia-service` «R22 … conflict con motivo accionable» + `CierreDiaModule` «R10/R11 sin poder solicitar»; L2 «R11 sin gestiones pendientes» (×2); L3 «R16 mensajero sin zona» y bodega «R4 … sin zona» (×2); L4 `477-deshacer` R7/R38; M1 bodega «R6/431-R5»; N1 `cierres-admin-confirmacion-fisica` R13/R15 |
| R141 (2.ª) | Cada aserción nueva es `toEqual` sobre `{status, motivo}` / `{status, fieldErrors:{zona|estatus}}`, o `toBe` sobre `motivoBloqueo`; N1 sobre `fieldErrors[<id>]`. Integración: `tarifas-valor-propio-caminos` (L3, `validation_error` + `fieldErrors.zona`) |
| R144 | Texto exacto por fila (tabla de arriba) + contraprueba T7: 13/13 constantes con su texto viejo ponen al menos un test en rojo (`progress/features/SLT-133.md`) |
| R146 | `git diff` de producción: 13 líneas cambiadas, 13 literales; ningún importe/estado/permiso tocado. E2E `dinero` (95) verde |
| R147 | Los 10 sitios «catalogo de estados incompleto» fuera de cierres sin tocar; `vitest related` sobre los tres servicios verde fuera del baseline (incluye `guia-asignacion-service`, `traspaso-mensajero-service`) |

## Evidencia (salida real)

- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `tsc --noEmit`, exit 0.
- Tests tocados (9 archivos, base `slt133_a`): 331 passed, 10 skipped; los 2 archivos de integración que
  saltan (`477-deshacer-cierre-rechazado-sql-real`, `cierre-rechazo-tienda-totales`) caen en `beforeAll` por
  «tabla `orden` vacía» y están en `tests/baseline-rojos.json` (app vacía, SL-11/SL-31); sus literales
  quedan actualizados pero no se pudieron ejecutar contra datos. `tarifas-valor-propio-caminos` verde.
- `vitest related --run` sobre los tres servicios: 383 archivos; 109 en rojo, **0 fuera del baseline**
  (todos `tests/integration/db/**` por base vacía).
- Contraprueba T7: 13/13 en rojo (tabla en `progress/features/SLT-133.md`); árbol restaurado.
- `./init.sh` (rápido, base `slt133_a` exportada): typecheck ✓, lint ✓ (0 errores, 243 warnings
  preexistentes), test:rapido ✓ (343 archivos), tamaño 12/40 archivos · 103/1000 líneas,
  `== init OK ==`, **INIT_EXIT=0**.
- `next build` (`NEXT_PUBLIC_APP_URL=http://localhost:3000`): BUILD_EXIT=0.
- E2E `--project=dinero` (base nueva `slt133_e2e1`): 95 passed (5.7m), **E2E_EXIT=0**.
- E2E `e2e/dos-empresas-humo.spec.ts --project=aislamiento` (base nueva `slt133_e2e2`): 18 passed (1.7m),
  **E2E_EXIT=0**.

## Veredicto

Hecho: los 13 mensajes del servidor de cierres en «tú» y con tildes, cada uno con su test exacto y contraprueba en rojo; gate y E2E verdes.
