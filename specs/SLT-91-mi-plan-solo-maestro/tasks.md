# SLT-91 — mi-plan-solo-maestro · tasks.md

Reglas de todas las tandas:

- Un agente por tanda: `backend_dev`. No hay componentes ni páginas que tocar (`design.md §1`).
- Los esperados de los tests van en literales a mano, nunca comparados con `ROLES_MI_PLAN`.
- Cada tanda commitea. El informe cita el SHA y la salida real de los tests.
- **Mutaciones y gate nunca en paralelo:** el gate leería el árbol mutado. Cada mutación, en un arnés que primero
  compruebe que ejecutó tests, y debe poner en rojo el test que se nombra.
- Sin migración y sin dependencias: si algo parece pedirlas, para.

## Tanda 0 — Preparación

- [x] **T0.1** Copiar `.env` al worktree y comprobar, solo con booleanos, que `DATABASE_URL` existe y no es de Ordenex.
  **Hecho:** `vitest` no reporta saltos por `HAY_BASE_DE_DATOS`.

## Tanda A — La lista y sus tests. Depende de T0

- [x] **T1.1** `lib/auth/menu-visibility.ts:338`: `ROLES_MI_PLAN = ["maestro"]`; comentarios de `:333` y `:691-692`.
  `lib/actions/_shared/mi-plan.ts:17`: comentario. **Hecho:** typecheck verde.
- [x] **T1.2** Actualizar los seis archivos de `design.md §7`. **Hecho:** los seis en verde, con `admin` sin acceso en
  literal; `menu-mi-plan.test.ts` sigue probando los siete aterrizajes sin cambiarlos (R1, R2, R3, R5, R6).
- [x] **T1.3** `tests/integration/db/mi-plan-solo-maestro.test.ts` (`design.md §7`). **Hecho:** corre contra Postgres, 0
  saltos; `admin` en `forbidden` y `maestro` en `ok` con plan (R2, R4).
- [x] **T1.4** Caso de `admin` en `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts`, con el texto literal.
  **Hecho:** verde (R11).
- **Mutaciones A:**
  1. La constante vuelve a `["maestro", "admin"]` → rojo en `menu-mi-plan`, `mi-plan-service`, `mi-plan-page` y
     `mi-plan-solo-maestro` (R1, R2, R3, R5).
  2. `MiPlanService` deja de comprobar el rol → rojo en `mi-plan-solo-maestro` (R2).

## Tanda B — La guardia y los avisos. Depende de A

- [x] **T2.1** `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (`design.md §7`), con su autocomprobación.
  **Hecho:** `pnpm run test:guardias` en verde (R5, R8, R9, R10, R11).
- [x] **T2.2** Comprobar que R7, R12 y R13 ya los cubren los tests existentes que nombra `requirements.md`, sin tocarlos.
  **Hecho:** corren en verde, 0 saltos, y la salida va en el informe.
- **Mutaciones B:**
  1. Quitar `rol: { value: "maestro" }` de `PlanesRepository.ts:1327` → rojo en `planes-cambio-correos` (R7).
  2. Añadir `href="/mi-plan"` a `AdminMaestroDashboard.tsx` → rojo en la guardia (R10).
  3. Importar `ConsumoDelPlan` en otro archivo → rojo en la guardia (R8).
  4. Añadir «Mi plan» al texto de `mensajeDelTope` → rojo en la guardia (R11).
  5. La guardia con la lista de rutas a barrer vacía → rojo por la autocomprobación.

## Tanda C — E2E. Depende de B

- [x] **T3.1** `e2e/planes-superadmin.spec.ts`: `crearUsuarioE2E(a(), "admin")` en el `beforeAll` y `sesiones.adminA`.
  Un test: en `/mi-plan` estado 404, «no encontrado» y sin `nombreDelPlan`; en `/dashboard`, 0 enlaces a `/mi-plan`.
  Añadir el paso a la cabecera del spec. **Hecho:** `pnpm exec playwright test e2e/planes-superadmin.spec.ts` en verde,
  incluido el caso existente del `maestro` de A (R3, R4, R14). El estado HTTP real va en el informe.

## Tanda D — Documentación y cierre. Depende de C

- [x] **T4.1** `docs/architecture.md:251`: `/mi-plan` para el `maestro`. **Hecho:** guardias verdes.
- [x] **T4.2** Notas de enmienda en SLT-58 (`design.md §6`): arriba de `requirements.md` y `design.md`, y en las filas
  citadas. **Hecho:** cada afirmación de `maestro` y `admin` sobre «Mi plan» lleva «enmendado por SLT-91».
- [x] **T4.3** `progress/impl_SLT-91.md`: mapa `R<n> → test` de los 14, salida real y resultado de cada mutación.
  **Hecho:** dice lo mismo que la tabla de `requirements.md`.
- [x] **T4.4** `./init.sh` en verde, después de revertir toda mutación, y comprobar que `git status` no trae ninguna y que
  el diff no toca `db/migrations/` (R12). **Hecho:** salida pegada; el `gate-completo` lo da el PR, que abre el leader
  tras el OK del reviewer.

## Dependencias

```
T0 → A → B → C → D
```

Nada es paralelizable: cada tanda depende de la lista de la anterior, y mutaciones y gate van en secuencia.

## Archivos esperados

- `specs/SLT-91-mi-plan-solo-maestro/requirements.md`
- `specs/SLT-91-mi-plan-solo-maestro/design.md`
- `specs/SLT-91-mi-plan-solo-maestro/tasks.md`
- `specs/SLT-58-planes-superadmin-ui/requirements.md`
- `specs/SLT-58-planes-superadmin-ui/design.md`
- `progress/features/SLT-91.md`
- `progress/impl_SLT-91.md`
- `progress/deudas.md`
- `lib/auth/menu-visibility.ts`
- `lib/actions/_shared/mi-plan.ts`
- `docs/architecture.md`
- `tests/unit/auth/menu-mi-plan.test.ts`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/auth/menu-historial-acciones.test.ts`
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
- `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`
- `tests/unit/services/mi-plan-service.test.ts`
- `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts`
- `tests/integration/mi-plan-page.test.tsx`
- `tests/integration/db/mi-plan-solo-maestro.test.ts`
- `e2e/planes-superadmin.spec.ts`
