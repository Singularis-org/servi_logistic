# SLT-214 — planes-beneficios-texto · tasks.md

Orden: T1 → T2 → (T3, T4, T5 [P]) → T6 → (T7, T8 [P]) → T9 → T10 → T11 → T12.
`backend_dev`: T1–T6. `frontend_dev`: T7–T10. T11 y T12 los dos.

## Tasks

- [x] **T1. Catálogo y esquemas** (`lib/planes/beneficios.ts`, `lib/types/planes.ts`). R2–R5, R18.
  - Lleva `ICONOS_DE_BENEFICIO`, `NOMBRE_DEL_ICONO`, `Beneficio`, `claveDelBeneficio`, `beneficioSchema`,
    `beneficiosSchema` y `cambiosDeBeneficios` (design §3.1).
  - En `lib/types/planes.ts`, `beneficios` opcional en `crearPlanSchema` y `edicionDelPlan`, y se añade a
    `VersionPlan`, `PlanDTO` y `PlanVista`.
  - **Hecho:** `tests/unit/planes/beneficios.test.ts` en verde, cubriendo R2, R3, R4 (mayúsculas, tildes y espacios),
    R5 (orden y nombres) y las tres formas de línea de R25. `pnpm run typecheck` en verde.
- [x] **T2. Migración y esquema** (`db/schema.prisma`, `db/migrations/20261120120000_plan_beneficio/`). R1, R6, R7,
  R18, R23. Depende de T1.
  - Lleva la tabla `plan_beneficio` con sus CHECK, su RLS y el `REVOKE`; el CHECK de pasos del borrador con
    `beneficios`; y `plan_de_la_empresa` con la clave `beneficios`.
  - El `down.sql`, como en design §1.3.
  - **Hecho:** `tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts` sube y baja la migración, y
    tras bajarla `plan_de_la_empresa` devuelve lo mismo que antes. `tests/integration/db/plan-beneficio.test.ts`
    cubre R6: los tres CHECK rechazan, y `servi_app` no puede hacer `SELECT` ni `INSERT`.
- [x] **T3 [P]. Repositorio de planes y rastro** (`PlanesRepository.ts`, `lib/planes/rastro.ts`). R15, R17, R18,
  R19. Depende de T2.
  - Lleva `INCLUIR`, `aDTO`, `crearEnTx`, `aplicarVersion` y `versionDelPlan` (design §3.3), y
    `CampoDelPlan`, `planCanonico` y `diferenciasDelPlan` (§3.6).
  - **Hecho:** `plan-beneficio.test.ts` cubre:
    - R15: crear con 3 beneficios los lee en orden;
    - R17: promover un cambio deja la lista de la versión;
    - R18: una versión sin `beneficios` conserva la lista.

    `tests/unit/planes/rastro.test.ts` cubre R19: alta sin beneficios sin clave, alta con beneficios, y edición por
    texto, por ícono y por orden. Los tests de rastro que ya existen siguen en verde sin cambios.
- [x] **T4 [P]. Borrador del servidor** (`lib/types/plan-borrador.ts`, `lib/planes/borrador.ts`). R7, R10, R12,
  R15, R16. Depende de T2.
  - **Hecho:**
    - `tests/unit/types/plan-borrador-schema.test.ts` cubre el paso `beneficios` en los dos modos, con R2–R4 y las
      claves `beneficios.<i>.texto`;
    - `tests/integration/db/plan-borrador-confirmar.test.ts` cubre:
      - R12: un borrador sin el paso da `pasos_pendientes` con `beneficios`;
      - R15: confirmar la creación deja los beneficios;
      - R16: confirmar la edición los deja en la versión programada y no en el plan.
- [x] **T5 [P]. «Mi plan» y la lista para cambiar de plan** (`MiPlanRepository.ts`, `lib/planes/consumo.ts`,
  `lib/types/consumo-plan.ts`, `lib/services/MiPlanCambioService.ts`). R16, R18, R23, R24. Depende de T2.
  - **Hecho:**
    - `tests/integration/db/mi-plan-repository.test.ts` cubre R23 con los del plan y con la versión propia, y R18 con
      una versión propia sin `beneficios`;
    - `tests/integration/db/planes-version-por-empresa.test.ts` cubre R16: con el cambio a medias, A, que lo
      recibió, ve la lista nueva, y B, que no, la anterior;
    - `tests/unit/services/mi-plan-cambio-service.test.ts` cubre R24 en `vista`.
- [x] **T6. Líneas de cambio** (`lib/planes/mensajes.ts`). R25. Depende de T1 y T3.
  - `lineasDeCambioDelPlan` con `beneficios`.
  - **Hecho:** un test en `tests/unit/planes/beneficios.test.ts` pasa `diferenciasDelPlan` por
    `lineasDeCambioDelPlan` y obtiene «Se agrega: …», «Se quita: …» o la línea de solo íconos u orden.
- [x] **T7 [P]. Componente compartido** (`components/shared/planes/BeneficiosDelPlan.tsx`). R5, R21. Depende de T1.
  - **Hecho:** `tests/components/BeneficiosDelPlan.test.tsx` cubre:
    - el ícono `aria-hidden` y el texto visible;
    - con 3 beneficios, sin botón;
    - con 5, se ven 3 y «Mostrar más» con `aria-expanded=false`; al pulsarlo se ven 5 y «Mostrar menos»; al pulsarlo
      otra vez, 3;
    - el «Sin beneficios» opcional.
- [ ] **T8 [P]. Paso «Beneficios»** (`PasoBeneficios.tsx`, `estado.ts`, `borrador.ts` del cliente, `textos.ts`,
  `PlanForm.tsx`, `PasoRevisar.tsx`). R7–R11, R13, R14. Depende de T4 y T7.
  - **Hecho:**
    - `tests/components/PlanFormBeneficios.test.tsx` cubre:
      - R8: agregar, escribir, elegir ícono, subir, bajar y quitar, y el orden que se envía;
      - R9: vacío y guardar;
      - R10: los errores bajo su campo y que no avanza;
      - R13: al editar abre con los del plan;
      - R14: «Revisar»;
    - `tests/unit/planes/plan-form-borrador.test.ts` cubre R11 (ida y vuelta);
    - `tests/components/PlanFormPasos.test.tsx` cubre R7 (el orden de los pasos en los dos modos).
- [ ] **T9. Vistas** (`PlanesModule.tsx`, `PlanDetalle.tsx`, `PlanActivo.tsx`, `CarruselDePlanes.tsx`). R19–R25.
  Depende de T3, T5, T6 y T7.
  - **Hecho:**
    - `tests/components/PlanesModule.test.tsx` cubre R20 y R21 (cada fila se despliega por su cuenta);
    - `tests/components/PlanDetalle.test.tsx` cubre R22 y las líneas del rastro de R19;
    - `tests/components/MiPlanModule.test.tsx` cubre R23 (sin beneficios no hay sección) y R25 en «Esto es lo que
      cambia»;
    - `tests/components/MiPlanCambioDePlan.test.tsx` cubre R24, y que «Mostrar más» no selecciona el plan.
- [ ] **T10. Adaptar los tests que recorren los pasos.** Depende de T8.
  - Archivos: `tests/components/plan-form-pasos.ts`, `tests/components/PlanFormBorrador.test.tsx` y los cuatro E2E
    de planes.
  - Pasan por «Beneficios» después de «Módulos», y el contador pasa a 6 al crear y 7 al editar.
  - **Hecho:** sus aserciones de carga útil no cambian, salvo el contador. `pnpm exec vitest related --run` sobre el
    diff, en verde.
- [ ] **T11. E2E nuevo** (`e2e/planes-beneficios.spec.ts`). R26. Depende de T9 y T10.
  - **Hecho:** en verde en local, sobre una base desechable nueva y con `NEXT_PUBLIC_APP_URL` como en `gate.yml`.
    Pasan también, en local, los cuatro E2E de planes adaptados y `e2e/mi-plan-cambiar-plan.spec.ts`
    (`docs/perfil-agentes.md > E2E en local antes del PR`).
- [ ] **T12. Cierre.**
  - `./init.sh` en verde. El aviso o el rojo de tamaño queda cubierto por la aceptación.
  - El mapa `R<n> -> test` de R1 a R26 está en `progress/impl_SLT-214.md`.
  - **Tamaño aceptado:** el humano aceptó el 2026-11-19 un solo PR por encima de `gate.tamano_pr`, sin corte: unos
    49 archivos, unas 750 líneas de producción y unas 2400 de tests (requirements, fila «Tamaño (P1)»). El leader
    deja el marcador `tamano-pr-aceptado` en `progress/features/SLT-214.md`.
  - **Hecho:** el gate local en verde, y el mapa completo, sin ningún R sin test.

## Archivos esperados

Producción (25):
- `db/schema.prisma`
- `db/migrations/20261120120000_plan_beneficio/migration.sql`
- `db/migrations/20261120120000_plan_beneficio/down.sql`
- `lib/planes/beneficios.ts`
- `lib/types/planes.ts`
- `lib/types/plan-borrador.ts`
- `lib/types/consumo-plan.ts`
- `lib/planes/borrador.ts`
- `lib/planes/rastro.ts`
- `lib/planes/mensajes.ts`
- `lib/planes/consumo.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/services/MiPlanCambioService.ts`
- `components/shared/planes/BeneficiosDelPlan.tsx`
- `components/shared/planes/CarruselDePlanes.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoBeneficios.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/estado.ts`
- `app/(app)/plataforma/planes/_components/plan-form/borrador.ts`
- `app/(app)/plataforma/planes/_components/plan-form/textos.ts`
- `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/mi-plan/_components/PlanActivo.tsx`

Tests (24):
- `tests/unit/planes/beneficios.test.ts`
- `tests/unit/types/plan-borrador-schema.test.ts`
- `tests/unit/planes/plan-form-borrador.test.ts`
- `tests/unit/planes/rastro.test.ts`
- `tests/unit/services/mi-plan-cambio-service.test.ts`
- `tests/integration/db/plan-beneficio.test.ts`
- `tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts`
- `tests/integration/db/plan-borrador-confirmar.test.ts`
- `tests/integration/db/planes-version-por-empresa.test.ts`
- `tests/integration/db/mi-plan-repository.test.ts`
- `tests/components/BeneficiosDelPlan.test.tsx`
- `tests/components/PlanFormBeneficios.test.tsx`
- `tests/components/PlanFormPasos.test.tsx`
- `tests/components/PlanFormBorrador.test.tsx`
- `tests/components/plan-form-pasos.ts`
- `tests/components/PlanesModule.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `tests/components/MiPlanModule.test.tsx`
- `tests/components/MiPlanCambioDePlan.test.tsx`
- `e2e/planes-beneficios.spec.ts`
- `e2e/planes-borrador.spec.ts`
- `e2e/planes-superadmin.spec.ts`
- `e2e/planes-costeo.spec.ts`
- `e2e/planes-costo-porcentual.spec.ts`
