# SLT-66 — planes-sin-tope-maestro-y-costeo · tasks.md

> Diseño: `design.md`. Reparto por capa (`docs/perfil-agentes.md > implementer`): `backend_dev` hace
> `lib/`, `db/` y sus tests, y `frontend_dev` hace `components/` y las páginas de `app/`.
>
> Convenciones de este archivo:
> - `[P]` = puede ir en paralelo con las demás `[P]` de su tanda.
> - Un commit por task (`feat(SLT-66): …`, `test(SLT-66): …`).
> - Cada tanda cierra con `./init.sh` en verde. Si muere por memoria, typecheck y guardias, y el resto va
>   en CI.
> - Los tests de la columna «R» son los de `design.md > §9`.

## Tanda A — modelo y maestro sin tope (backend_dev)

- [ ] **T0 — Comprobaciones previas.**
  1. Confirmar que `20261030120100_incentivo_mensajero_checks` sigue siendo la última migración de
     `dev`. Si no lo es, renombrar las tres de esta ficha antes de aplicarlas en una base compartida.
  2. Buscar con Grep en `dev` `CREATE OR REPLACE FUNCTION (cobro_plataforma_al_crear_orden|plan_de_la_empresa)`.
     Las últimas versiones tienen que ser las de `20261024120000` y `20261029150000` (design §13).
  3. Ver si el PR #51 (SLT-67) ya entró en `dev`.
  4. Contar en QA, y en producción si hay acceso de lectura, las empresas con un plan asignado sin costo
     base de forma «monto». Esto da el dato para cerrar P4.

  *Hecho:* las cuatro respuestas quedan anotadas en `progress/impl_SLT-66.md`, y el número del punto 4 se
  le pasa al leader.
- [ ] **T1 — M1 `20261031120000_plan_costeo_y_maestro_sin_tope`** (design §2.1, §2.4). Depende de T0.
  - `migration.sql` con la cabecera de borrado definitivo, y su `down.sql`.
  - `db/schema.prisma`: `Plan.costoPorOrden` y el comentario de `PlanTopeRol`.

  *Hecho:*
  - `pnpm run db:migrate` aplica y el diff de drift sale vacío.
  - Casos R4 de `tests/integration/db/migracion-slt66-ida-y-vuelta.test.ts` en verde: siembra previa,
    borrado de maestro, versión pendiente sin `maestro` y con `costoPorOrden: null`, rastro y
    asignación intactos.
- [ ] **T2 — Tipos y escritura del plan** (design §4.1, §4.2, §4.4). Depende de T1.
  - `ROLES_CON_TOPE` sin `maestro` y `costoPorOrden` en los esquemas, en `PlanDTO` y en `VersionPlan`.
  - `PlanesRepository`: `crear`, `aplicarVersion`, `aDTO`, `usoDe` sin `maestro` y `COLUMNA_DEL_ROL`.
  - `lib/planes/rastro.ts`: el campo `costoPorOrden`.
  - `lib/planes/mensajes.ts`: `textoDelCostoPorOrden` y las líneas `Costo base:` y `Costo por orden:`.

  *Hecho:* en verde:
  - `tests/unit/types/planes-schema-costeo.test.ts` (R1, R7, R8);
  - `tests/unit/planes/rastro-costeo.test.ts` (R11);
  - `tests/unit/services/planes-service-costeo.test.ts` (R11, R1, R8);
  - `tests/integration/db/planes-costeo-escritura.test.ts` (R11).

  El typecheck señala los fixtures que construyen `PlanDTO` a mano, que suman `costoPorOrden: null`.
- [ ] **T3 — Maestro sin tope en la base** (design §8). Depende de T1.
  - `tests/integration/db/plan-maestro-sin-tope.test.ts`, que cubre R1, R2, R3 y R6 con su control de no
    vacuidad.
  - Mutación 4 de design §9.4, medida.

  *Hecho:* el test está en verde y la mutación lo pone en rojo.
- [ ] **T4 — Tests existentes obligados por R1–R5 y R9** (design §9.3, solo las filas de backend y
  unitarias). Depende de T2.
  - Archivos: `planes-catalogo`, `plan-topes-usuarios`, `planes-schema`, `consumo`, `mi-plan-service`,
    `planes-service-lecturas`, `plantilla-cambio-plan`, `mi-plan-repository`, `plan-de-la-empresa` (lo
    que no depende de M3) y `planes-lecturas-plataforma`.
  - Cada edición lleva un comentario `SLT-66 R<n>`.

  *Hecho:*
  - esos archivos están en verde;
  - el diff de cada uno toca solo las líneas de la tabla de §9.3;
  - `progress/impl_SLT-66.md` lista los archivos tocados.

  Si aparece otro test roto que no esté en la tabla, PARAR y preguntar.

## Tanda B — cobro con el costo del plan (backend_dev)

- [ ] **T5 — M2 `20261031120100_cobro_plataforma_fuente_plan`** (design §2.2). Depende de T1.
  - `ALTER TYPE … ADD VALUE 'plan'`.
  - Un `down.sql` que se niega a bajar si hay cargos o reversos de fuente `plan`.
  - El enum de Prisma, con `plan`.

  *Hecho:* aplica, y el drift sale vacío.
- [ ] **T6 — M3 `20261031120200_plan_costeo_funciones`** (design §2.3, §3). Depende de T5.
  - `cobro_plataforma_tarifa_de`.
  - El cuerpo nuevo de `cobro_plataforma_al_crear_orden`, copia literal salvo el bloque de la tarifa.
  - El cuerpo nuevo de `plan_de_la_empresa`, copia literal más sus tres cambios.
  - Su `down.sql`, con los cuerpos de origen copiados literalmente.

  *Hecho:* en verde:
  - `tests/integration/db/cobro-plataforma-plan.test.ts` (R12–R16, los pasos de design §3.4);
  - los casos R25 de `migracion-slt66-ida-y-vuelta.test.ts`;
  - `cobro-plataforma-cargos.test.ts` y `migracion-sl40-ida-y-vuelta.test.ts`, sin tocarlos.

  Además, se miden las mutaciones 1–3 y la carga de 500 filas antes y después (design §13), con los
  números en `progress/impl_SLT-66.md`.
- [ ] **T7 [P] — Deuda en la wallet con cargos del plan** (design §8). Depende de T6.
  `tests/integration/db/deuda-plataforma-plan.test.ts` (R17, R21).

  *Hecho:* en verde sin tocar `WalletService`, `DeudaPlataformaService` ni `derivarDeudaPlataforma`.

## Tanda C — lecturas y total estimado (backend_dev)

- [ ] **T8 [P] — `lib/planes/costeo.ts` y tipos** (design §4.3). Depende de T2.
  - `costeoDelCiclo`.
  - `FuenteDelCosto` y `CosteoDelCiclo`, y `PlanConConsumo.costeo`, en `lib/types/consumo-plan.ts`.

  *Hecho:*
  - `tests/unit/planes/costeo.test.ts` (R19, R20, R10) en verde, también con la rama `por_definir`;
  - mutación 5 medida;
  - Grep sin `Number(` ni `parseFloat` sobre importes en el archivo.
- [ ] **T18 [P] — Solo se asignan planes con costo concreto** (design §4.2.1, §7). Depende de T2.
  - `lib/planes/costo-concreto.ts` (`tieneCostoConcreto`).
  - La variante `plan_sin_costo` en `PlanResult` y en `VistaPreviaAsignacionResult`.
  - En `PlanesService`: la regla en `asignar` (después de «mismo plan») y en `previsualizarAsignacion`,
    y el filtro en `asignables`.
  - Los dobles de `planes-service.test.ts` y `planes-service-inicio-ciclo.test.ts` (design §9.3).

  *Hecho:*
  - `tests/unit/services/planes-service-asignar-costo.test.ts` (R28, R29, R30) en verde;
  - los dos archivos existentes en verde, con el diff solo en el doble;
  - mutaciones 7 y 8 medidas.
- [ ] **T9 — Lecturas con costeo** (design §4.3). Depende de T6 y T8.
  - `MiPlanRepository`: zod sin `uso.maestro`, con `costo_por_orden` y `costo_vigente`.
  - `PlanesRepository.planDeEmpresa`: `cobro_plataforma_tarifa_de`.
  - `consumo.ts > planConConsumo`: `costeo`.
  - `MiPlanService` y `PlanesService`, sin cambiar la autorización.

  *Hecho:* en verde:
  - `tests/integration/db/plan-de-la-empresa-costeo.test.ts` (R18, R22, con el cruce lectura = cargo de
    design §3.2) y la mutación 6 medida;
  - las filas de `plan-de-la-empresa.test.ts` y `mi-plan-repository.test.ts` que dependen de M3 (§9.3).

## Tanda D — pantallas (frontend_dev)

- [ ] **T10 — Merge de `dev`** si el PR #51 (SLT-67) ya entró (T0). Se resuelven los conflictos de
  `PlanForm.tsx` y `PlanForm.test.tsx` conservando `MontoInput`.

  *Hecho:* `./init.sh` en verde tras el merge, antes de tocar pantallas. Si #51 no entró, se anota y se
  sigue.
- [ ] **T11 — `PlanForm`** (design §6.1). Depende de T2 y T10.
  - Rótulos «Costo base» y «Costo base mensual».
  - Campo «Costo por orden» con su ayuda y `idDe("costoPorOrden")`.
  - La descripción del `Sheet`.

  *Hecho:*
  - `tests/components/PlanFormCosteo.test.tsx` (R5, R9, R23) en verde;
  - `tests/components/PlanForm.test.tsx:325` actualizado (§9.3).
- [ ] **T12 [P] — Catálogo, detalle y modal** (design §6.2). Depende de T2.
  - `lineasDeCosto` en `plan-vista.ts`.
  - `PlanesModule.tsx`, `PlanDetalle.tsx` y `PlanEmpresa.tsx`.

  *Hecho:*
  - `tests/components/PlanVistaCosteo.test.tsx` (R24, R10) en verde;
  - `PlanDetalle.test.tsx:140` y `PlanEmpresa.test.tsx:42, :364` actualizados (§9.3).
- [ ] **T13 [P] — `ConsumoDelPlan`** (design §6.3). Depende de T9.
  - El bloque «Costo del ciclo» con las tres situaciones de base.
  - La nota de fuente (P1).
  - La nota «Estimado: …».

  *Hecho:*
  - `tests/components/ConsumoDelPlanCosteo.test.tsx` (R18–R21, R10, R5) en verde, con la nota «precio
    acordado para tu empresa» y la rama «por definir»;
  - `ConsumoDelPlan.test.tsx:26` y `MiPlanModule.test.tsx` actualizados (§9.3).
- [ ] **T19 [P] — `PlanEmpresa`: el ancla, el rechazo y el aviso** (design §6.5). Depende de T18.
  - `id="plan"` en la `section`.
  - El texto de rechazo `plan_sin_costo`.
  - El texto y el enlace cuando no hay planes asignables.
  - El aviso «Plan sin costo base concreto».
  - Las tablas de rechazos de `PlanForm` y `PlanDetalle`, si su `switch` lo exige.

  *Hecho:* los casos de R28, R29, R20 y el ancla de `tests/components/PlanEmpresaSinCosto.test.tsx` en
  verde.

## Tanda E — E2E, ayuda y cierre

- [ ] **T15 — «Empresas»: lectura del cobro vigente y del plan** (backend_dev; design §6.4; R31, R32).
  Depende de T6.
  - En `EmpresasPlataformaRepository`: `plan` y `cobroVigente` con una sola consulta `LATERAL`.
  - En `EmpresaListada`: los dos campos nuevos.

  *Hecho:* `tests/integration/db/empresas-plataforma-plan.test.ts` en verde, y
  `empresas-plataforma-cobro.test.ts` en verde sin tocarlo.
- [ ] **T20 — «Empresas»: pantalla** (frontend_dev; design §6.4; R31, R32). Depende de T15, T19 y T10.
  - En `EmpresasModule`: la celda de cobro con «propio», «del plan» o «global».
  - La columna «Plan» con «Asignar plan» o «Cambiar plan» hacia `#plan`.
  - El enlace «Plan y módulos».
  - Las filas de §9.3 que esto obliga a cambiar: `EmpresasModuleCobro.test.tsx`,
    `empresas-page.test.tsx` y `e2e/_superadmin-fixture.ts:301`.

  *Hecho:* `tests/components/EmpresasModulePlan.test.tsx` en verde, y los tres archivos existentes en
  verde con el diff limitado a §9.3.
- [ ] **T22 [P] — Opcional (R33): «Asignar a una empresa» desde el detalle del plan** (design §6.6).
  Depende de T19.
  - `[planId]/page.tsx` (empresas candidatas) y `PlanDetalle.tsx`.
  - `planPreseleccionado` en `PlanEmpresa` y la `page.tsx` del detalle de empresa (`searchParams.plan`).

  *Hecho:* en verde `tests/components/PlanDetalleAsignar.test.tsx` y el caso R33 de
  `PlanEmpresaSinCosto.test.tsx`. Si el humano la descarta, se marca «no aplica» y nada más depende de
  ella.
- [ ] **T14 — E2E** (design §9.2). Depende de T11, T13 y T20.
  - `e2e/planes-costeo.spec.ts`, con la asignación desde el listado de «Empresas».
  - En `e2e/planes-superadmin.spec.ts`:
    - `:262-263` pasa a «no aparece Maestro» (R5);
    - `:169` crea el plan «Con monto» y con costo por orden (R28).

  *Hecho:*
  - `pnpm exec playwright test e2e/planes-costeo.spec.ts` en verde (R26, R31, R32);
  - `planes-superadmin.spec.ts` en verde;
  - los E2E de SL-23 que usan el ayudante de `_superadmin-fixture.ts` siguen en verde;
  - el global queda como estaba (`afterAll`);
  - capturas en la salida del test.
- [ ] **T16 [P] — Ayuda.** `docs/ayuda/oficina/wallet-caja.md`: «un monto fijo por cada orden» pasa a
  explicar que el monto sale de la excepción, del plan o del valor general. Se actualiza `actualizado:`.

  *Hecho:* la guardia de ayuda está en verde.
- [ ] **T17 — Cierre.**
  - `./init.sh` en verde.
  - El mapa `R<n> → test` (R1–R33) en `progress/impl_SLT-66.md`, con las ocho mutaciones medidas. Si T22
    se descartó, R33 sale como «no aplica».
  - P4 anotada como cerrada o abierta, con lo que decidió el humano.
  - R27: la lista exacta de tests de SL-24, SL-40 y SLT-58 tocados coincide con design §9.3.

  *Hecho:* el reviewer puede leer el mapa sin abrir el código.

## Archivos esperados

- `db/migrations/20261031120000_plan_costeo_y_maestro_sin_tope/migration.sql`
- `db/migrations/20261031120000_plan_costeo_y_maestro_sin_tope/down.sql`
- `db/migrations/20261031120100_cobro_plataforma_fuente_plan/migration.sql`
- `db/migrations/20261031120100_cobro_plataforma_fuente_plan/down.sql`
- `db/migrations/20261031120200_plan_costeo_funciones/migration.sql`
- `db/migrations/20261031120200_plan_costeo_funciones/down.sql`
- `db/schema.prisma`
- `lib/types/planes.ts`
- `lib/types/consumo-plan.ts`
- `lib/planes/costeo.ts`
- `lib/planes/consumo.ts`
- `lib/planes/rastro.ts`
- `lib/planes/mensajes.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/interfaces/repositories/IMiPlanRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/services/MiPlanService.ts`
- `lib/services/PlanesService.ts`
- `components/shared/ConsumoDelPlan.tsx`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/_components/plan-vista.ts`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/types/empresas-plataforma.ts`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `docs/ayuda/oficina/wallet-caja.md`
- `tests/integration/db/plan-maestro-sin-tope.test.ts`
- `tests/integration/db/migracion-slt66-ida-y-vuelta.test.ts`
- `tests/integration/db/cobro-plataforma-plan.test.ts`
- `tests/integration/db/plan-de-la-empresa-costeo.test.ts`
- `tests/integration/db/deuda-plataforma-plan.test.ts`
- `tests/integration/db/planes-costeo-escritura.test.ts`
- `tests/unit/planes/costeo.test.ts`
- `tests/unit/types/planes-schema-costeo.test.ts`
- `tests/unit/planes/rastro-costeo.test.ts`
- `tests/unit/services/planes-service-costeo.test.ts`
- `tests/components/ConsumoDelPlanCosteo.test.tsx`
- `tests/components/PlanFormCosteo.test.tsx`
- `tests/components/PlanVistaCosteo.test.tsx`
- `tests/integration/db/planes-catalogo.test.ts`
- `tests/integration/db/plan-topes-usuarios.test.ts`
- `tests/unit/types/planes-schema.test.ts`
- `tests/unit/planes/consumo.test.ts`
- `tests/components/ConsumoDelPlan.test.tsx`
- `tests/components/MiPlanModule.test.tsx`
- `tests/components/PlanEmpresa.test.tsx`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `tests/unit/services/mi-plan-service.test.ts`
- `tests/unit/services/planes-service-lecturas.test.ts`
- `tests/unit/services/email/plantilla-cambio-plan.test.ts`
- `tests/integration/db/mi-plan-repository.test.ts`
- `tests/integration/db/plan-de-la-empresa.test.ts`
- `tests/integration/db/planes-lecturas-plataforma.test.ts`
- `tests/integration/db/empresas-plataforma-cobro.test.ts`
- `tests/components/EmpresasModuleCobro.test.tsx`
- `e2e/planes-costeo.spec.ts`
- `e2e/planes-superadmin.spec.ts`
- `e2e/_superadmin-fixture.ts`
- `lib/planes/costo-concreto.ts`
- `app/(app)/plataforma/planes/[planId]/page.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `tests/unit/services/planes-service-asignar-costo.test.ts`
- `tests/unit/services/planes-service.test.ts`
- `tests/unit/services/planes-service-inicio-ciclo.test.ts`
- `tests/integration/db/empresas-plataforma-plan.test.ts`
- `tests/integration/empresas-page.test.tsx`
- `tests/components/EmpresasModulePlan.test.tsx`
- `tests/components/PlanEmpresaSinCosto.test.tsx`
- `tests/components/PlanDetalleAsignar.test.tsx`
