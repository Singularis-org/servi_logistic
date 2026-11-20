# SLT-215 — planes-niveles-beneficio · tasks.md

Orden: T1 → T2 → (T3, T4, T5 [P]) → T6 → T7 → (T8, T9 [P]) → T10 → T11 → T12.
`backend_dev`: T1–T7. `frontend_dev`: T8–T10. T11 y T12 los dos.

## Tasks

- [x] **T1. Esquemas y textos** (`lib/planes/niveles.ts`, `lib/types/planes.ts`). R1–R5, R18, R20, R21.
  - Lleva `MAX_NIVELES`, `Nivel`, `DescuentoNivel`, `descuentoNivelSchema`, `nivelSchema`, `nivelesSchema`,
    `descuentosDelNivel`, `textoDelNivel` y `textoDeLosNiveles` (design §3.1). `SOLO_UNA_FORMA` pasa a exportarse.
  - En `lib/types/planes.ts`, `niveles` opcional en `crearPlanSchema` y `edicionDelPlan`, y en `VersionPlan`,
    `PlanDTO` y `PlanVista` (§3.2).
  - **Hecho:** `tests/unit/planes/niveles.test.ts` en verde con: meta 0, decimal y no creciente (R3); porcentaje 0,
    100,01 y 100; monto 0 y 0,01; las dos formas (R4); 11 niveles (R5); `descuentosDelNivel` del ejemplo 10 % + 10 %
    (R2); los textos de R21 en porcentaje y en monto. `pnpm run typecheck` en verde.
- [x] **T2. Migraciones y esquema** (`db/schema.prisma`, `db/migrations/20261121140000_plan_nivel_job_enum/`,
  `db/migrations/20261121140100_plan_nivel/`, `lib/db/modelos-de-negocio.ts`). R6, R7, R22–R30, R35–R37. Depende de T1.
  - Las tres tablas de design §1 con sus CHECK, RLS, políticas y `REVOKE`; el CHECK de pasos con `niveles`; las cinco
    funciones de §2; el relleno de R37; el valor `plan_niveles_cerrar` de `job_tipo` (§2.6); los dos `down.sql`.
  - La clasificación de los tres modelos en `modelos-de-negocio.ts`.
  - **Hecho:**
    - `tests/integration/db/migracion-plan-nivel-ida-y-vuelta.test.ts` sube y baja las dos migraciones; tras subir,
      una empresa con plan tiene su fila de R37; tras bajar, no queda ni tabla, ni función, ni clave `niveles`;
    - `tests/integration/db/plan-nivel.test.ts` cubre R6 (cada CHECK rechaza; `servi_app` no lee ni escribe
      `plan_nivel`) y R36 (con `servi_app`, A no ve el nivel ni el historial de B, y nadie inserta, cambia ni borra);
    - `pnpm run test:guardias` en verde (`organizacion-en-modelos`, `rls-por-empresa`, `unicos-por-empresa`).
- [x] **T3 [P]. Cierre mensual en la base.** R22–R30. Depende de T2.
  - **Hecho:** `tests/integration/db/plan-nivel-cierre.test.ts` cubre, con `p_ahora` y `ocurrido_at` fijos:
    - R22:
      - una orden anulada no cuenta;
      - una anulada y recuperada en el mes cuenta una vez;
      - una anulada el día 2 del mes siguiente sigue contando en su mes;
      - una cancelada por la API en el mes no cuenta aunque conserve su cargo. La cancelación es una fila de
        `orden_historial_estado` con `origen_tipo = 'cancelacion_api'`, design §2.1;
      - una cancelada el día 2 del mes siguiente sigue contando en su mes y no cuenta en el siguiente;
      - el ejemplo de la decisión, a escala: con 152 órdenes de cargo vigente y 3 canceladas salen 149, que no
        llegan a una meta de 150;
      - la guardia: si el enum `orden_historial_origen_tipo` gana un valor que contiene `cancel` y no es
        `cancelacion_api`, el test falla;
    - R23: un cargo a las 05:59 UTC del día 1 es del mes anterior;
    - R24: entrada el día 15, solo cuentan las de después, contra la meta completa;
    - R25: de 0 a 2 directo, con `desde_at` en el día 1 siguiente;
    - R26 y R27: un mes sin cumplir no baja; dos seguidos bajan 1; uno que cumple en medio reinicia;
    - R28: nivel 0 no baja; un plan sin niveles no deja historial;
    - R29: tres meses pendientes se cierran en orden; correr dos veces, y dos a la vez, deja lo mismo; cerrar el día 5
      da el mismo resultado y el mismo `desde_at` que el día 1.
- [x] **T4 [P]. Lista de niveles del plan y rastro** (`PlanesRepository.ts`: `INCLUIR`, `aDTO`, `crearEnTx`,
  `aplicarVersion`, `versionDelPlan`; `lib/planes/rastro.ts`; `lib/planes/mensajes.ts`). R15, R17–R20. Depende de T2.
  - **Hecho:** `plan-nivel.test.ts` cubre R15 (crear con 3 niveles los lee en orden), R17 (promover deja los de la
    versión) y R18 (una versión sin `niveles` conserva los del plan). `tests/unit/planes/rastro.test.ts` cubre R19
    (alta sin niveles sin clave, alta con niveles, edición) y R20 (la línea «Niveles por volumen: … → …»). Los tests de
    rastro que ya existen siguen en verde sin cambios.
- [x] **T5 [P]. Borrador del servidor** (`lib/types/plan-borrador.ts`, `lib/planes/borrador.ts`). R7, R10, R12, R15,
  R16. Depende de T2.
  - **Hecho:** `tests/unit/types/plan-borrador-schema.test.ts` cubre el paso `niveles` en los dos modos con las claves
    de error de R3–R5. `tests/integration/db/plan-borrador-confirmar.test.ts` cubre R12 (sin el paso:
    `pasos_pendientes` con `niveles`), R15 y R16 (confirmar la edición los deja en la versión programada y no en el
    plan).
- [x] **T6. Recálculo** (`PlanesRepository.ts`: `recibirCambio`, `aplicarEnTx`, `mismosNiveles`). R16, R31–R34.
  Depende de T3, T4 y T5.
  - **Hecho:** `tests/integration/db/plan-nivel-recalculo.test.ts` cubre:
    - R31: al recibir un cambio de niveles, primero se cierra el mes pendiente con las metas de antes y después se
      recalcula con las nuevas; historial `cambio_niveles` con `desde_at = recibe_at`;
    - R16: con el cambio a medias, A, que lo recibió, cierra con las metas nuevas y B, que no, con las de antes;
    - R32: cambio de plan, nivel con las metas del plan nuevo y el mes anterior entero; la entrada pasa a la fecha de
      efecto;
    - R33: primera asignación en nivel 0, sin historial;
    - R34: cambio de solo tipo de cobro y recepción sin cambio de niveles no tocan nada.
- [x] **T7. Trabajo diario** (`lib/repositories/NivelesEmpresaRepository.ts`,
  `lib/interfaces/repositories/INivelesEmpresaRepository.ts`, `lib/planes/jobs-niveles.ts`,
  `app/api/cron/procesar-jobs/route.ts`, `scripts/siembra-jobs-recurrentes.ts`, `lib/modulos/reparto.ts`,
  `lib/db/excepciones-aislamiento.ts`). R29, R30. Depende de T3.
  - **Hecho:**
    - `tests/unit/planes/jobs-niveles.test.ts` cubre: la próxima corrida a las 06:20 UTC; la `dedupe_key` por día; una
      empresa que falla no frena a las demás y el trabajo lanza al final con sus ids y causas (R30);
    - `tests/unit/api/procesar-jobs-registro.test.ts` ve el tipo registrado, recurrente y de plataforma;
    - `plan-nivel-cierre.test.ts` llama a `NivelesEmpresaRepository.cerrarMeses` y a `empresasConMesPendiente`
      (sin pendientes, lista vacía);
    - `pnpm run test:guardias` en verde (`jobs-handler-por-tipo`, `jobs-recurrentes-con-siembra`,
      `plataforma-solo-en-lista`).
- [x] **T8 [P]. Paso «Niveles»** (`PasoNiveles.tsx`, `estado.ts`, `borrador.ts` del cliente, `textos.ts`,
  `PlanForm.tsx`, `PasoRevisar.tsx`). R7–R11, R13, R14. Depende de T5.
  - **Hecho:** `tests/components/PlanFormNiveles.test.tsx` cubre R8 (agregar, meta, tipo, valor, quitar y
    renumerar; «Agregar nivel» deshabilitado con 10; lo que se envía), R9, R10 (errores bajo su campo y no avanza),
    R13 y R14. `tests/unit/planes/plan-form-borrador.test.ts` cubre R11. `tests/components/PlanFormPasos.test.tsx`
    cubre R7 en los dos modos.
- [x] **T9 [P]. Vistas** (`PlanesModule.tsx`, `plan-vista.ts`, `PlanDetalle.tsx`). R19, R21. Depende de T4.
  - **Hecho:** `tests/components/PlanesModule.test.tsx` cubre R21 (porcentaje, monto, orden y «Sin niveles»).
    `tests/components/PlanDetalle.test.tsx` cubre la línea «Niveles: …» del alta (R19).
- [x] **T10. Adaptar los tests que recorren los pasos.** Depende de T8.
  - Archivos: `tests/components/plan-form-pasos.ts`, `tests/components/PlanFormBorrador.test.tsx` y los cinco E2E de
    planes.
  - Pasan por «Niveles» después de «Beneficios»; el contador pasa a 7 al crear y 8 al editar.
  - **Hecho:** sus aserciones de carga útil no cambian, salvo el contador. `pnpm exec vitest related --run` sobre el
    diff, en verde.
- [x] **T11. E2E nuevo** (`e2e/planes-niveles.spec.ts`). R38. Depende de T9 y T10.
  - **Hecho:** en verde en local, sobre una base desechable nueva y con `NEXT_PUBLIC_APP_URL` como en `gate.yml`.
    Pasan también en local los cinco E2E de planes adaptados (`docs/perfil-agentes.md > E2E en local antes del PR`).
- [x] **T12. Cierre.**
  - `./init.sh` en verde. El aviso de tamaño queda cubierto por la aceptación del humano (P6 para las líneas).
  - El mapa `R<n> -> test` de R1 a R38 en `progress/impl_SLT-215.md`.
  - **Hecho:** el gate local en verde y ningún R sin test.

## Archivos esperados

Producción (29):
- `db/schema.prisma`
- `db/migrations/20261121140000_plan_nivel_job_enum/migration.sql`
- `db/migrations/20261121140000_plan_nivel_job_enum/down.sql`
- `db/migrations/20261121140100_plan_nivel/migration.sql`
- `db/migrations/20261121140100_plan_nivel/down.sql`
- `lib/planes/niveles.ts`
- `lib/types/planes.ts`
- `lib/types/plan-borrador.ts`
- `lib/planes/borrador.ts`
- `lib/planes/rastro.ts`
- `lib/planes/mensajes.ts`
- `lib/planes/jobs-niveles.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/repositories/NivelesEmpresaRepository.ts`
- `lib/interfaces/repositories/INivelesEmpresaRepository.ts`
- `lib/modulos/reparto.ts`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `scripts/siembra-jobs-recurrentes.ts`
- `app/(app)/plataforma/planes/_components/plan-form/PasoNiveles.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/estado.ts`
- `app/(app)/plataforma/planes/_components/plan-form/borrador.ts`
- `app/(app)/plataforma/planes/_components/plan-form/textos.ts`
- `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/_components/plan-vista.ts`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`

Tests (23):
- `tests/unit/planes/niveles.test.ts`
- `tests/unit/types/plan-borrador-schema.test.ts`
- `tests/unit/planes/plan-form-borrador.test.ts`
- `tests/unit/planes/rastro.test.ts`
- `tests/unit/planes/jobs-niveles.test.ts`
- `tests/unit/api/procesar-jobs-registro.test.ts`
- `tests/integration/db/plan-nivel.test.ts`
- `tests/integration/db/plan-nivel-cierre.test.ts`
- `tests/integration/db/plan-nivel-recalculo.test.ts`
- `tests/integration/db/migracion-plan-nivel-ida-y-vuelta.test.ts`
- `tests/integration/db/plan-borrador-confirmar.test.ts`
- `tests/components/PlanFormNiveles.test.tsx`
- `tests/components/PlanFormPasos.test.tsx`
- `tests/components/PlanFormBorrador.test.tsx`
- `tests/components/plan-form-pasos.ts`
- `tests/components/PlanesModule.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `e2e/planes-niveles.spec.ts`
- `e2e/planes-borrador.spec.ts`
- `e2e/planes-superadmin.spec.ts`
- `e2e/planes-costeo.spec.ts`
- `e2e/planes-costo-porcentual.spec.ts`
- `e2e/planes-beneficios.spec.ts`
