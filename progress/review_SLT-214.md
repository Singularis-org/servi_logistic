# Review SLT-214 «Planes: beneficios de texto con ícono» — vuelta 1

Alcance: `git diff origin/dev...HEAD` en `feature/SLT-214-planes-beneficios-texto` (head `ac4edfa7`, PR #245).
Ruta completa (fullstack / medium, toca `db/`): correcta.

## Verificación ejecutada por el reviewer

- `vitest run` (NODE_OPTIONS 8192) de 12 archivos sin base: `beneficios`, `rastro`, `plan-borrador-schema`,
  `plan-form-borrador`, `PlanFormBeneficios`, `BeneficiosDelPlan`, `PlanDetalle`, `MiPlanModule`,
  `MiPlanCambioDePlan`, `PlanesModule`, `mi-plan-cambio-service`, `planes.composition-root`:
  `Test Files 12 passed (12)` / `Tests 270 passed (270)`.
- `pnpm run typecheck`: sin errores.
- `node scripts/tamano-pr.mjs`: AVISO, 62/40 archivos, 1006/1000 líneas de producción, 2544/3000 de tests;
  aceptado por el marcador de `progress/features/SLT-214.md`.
- Migración: comparé el cuerpo de `plan_de_la_empresa` de `20261114120000_plan_cambio_por_empresa` (la última
  definición; ninguna migración posterior la redefine) con la subida y la bajada. La subida solo añade la clave
  `beneficios`. La bajada es idéntica byte a byte al origen. El CHECK `plan_borrador_pasos_conocidos` de la bajada
  es literal el de `20261117120000_plan_borrador`.
- CI de `ac4edfa7` (consultado, no esperado): `estatico`, `e2e (aislamiento)` (incluye `planes-beneficios`,
  `planes-borrador`, `planes-superadmin`, `planes-costeo` y `mi-plan-cambiar-plan`), `e2e (reparto)` y
  `vitest (shard 3/3)` en verde. Siguen pendientes `vitest` 1/3 y 2/3 y `e2e (dinero)` (`planes-costo-porcentual`).
- No corrí los tests de integración con base: el clasificador de permisos me bloqueó al leer la `DATABASE_URL`
  del worktree. Los cubren los shards de vitest del CI.
- MCP del grafo: no lo usé; revisé con Grep/Read y diff.

## Checklist

- [x] Ruta completa con `requirements.md`, `design.md` y `tasks.md`; `design.md` lleva alternativas.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido. El diff no re-crea nada de esa lista: reutiliza
  `collapseSpaces`/`stripDiacritics`, amplía `diferenciasDelPlan`/`lineasDeCambioDelPlan` y sigue el molde de
  `PlanModulo`.
- [ ] **Tasks todas `[x]`: T11 y T12 siguen `[ ]`** (hallazgo 1).
- [x] Tamaño: por encima del máximo, con `tamano-pr-aceptado` (ver el hallazgo menor 3).
- [x] Trazabilidad R1–R26: cada R tiene un test que existe y prueba lo que dice (tabla abajo).
- [x] El mapa `R<n> -> test` está en `progress/impl_SLT-214.md`.
- [x] Typecheck en verde. El lint lo da en verde `estatico` del CI.
- [ ] `gate-completo` en verde: todavía corriendo (no se exige en esta vuelta; lo comprueba el leader antes del aviso).
- [x] Sin dependencias nuevas: los íconos vienen de `lucide-react`, que ya estaba.
- [x] Tabla nueva con RLS: `plan_beneficio` tiene `ENABLE ROW LEVEL SECURITY` sin políticas y `REVOKE ALL … FROM servi_app`.
  No lleva `organizacion_id` porque es de PLATAFORMA, como `plan_modulo`, y queda clasificada en
  `lib/db/modelos-de-negocio.ts > MODELOS_DE_PLATAFORMA`. La empresa la lee solo por `plan_de_la_empresa`
  (SECURITY DEFINER con el contexto comprobado).
- [x] La migración trae `down.sql` y no edita ninguna migración ya aplicada.
- [x] Ningún literal de país o moneda, ningún `console.*` y ninguna referencia a Ordenex en el código nuevo.
- [x] Capas: validación con zod en el borde (`beneficiosSchema` en `crearPlanSchema`, `edicionDelPlan` y el paso del
  borrador), acceso a datos en los repositorios y lógica pura en `lib/planes/`.
- [x] Comentarios: explican el porqué (ausente = sin cambio, el porqué del REVOKE, por qué no hay único por texto).
- [~] E2E en local antes del PR (`docs/perfil-agentes.md > reviewer`): no se corrieron, por orden del humano
  (memoria «gate en CI, no local»). Quedan cubiertos por el CI (hallazgo menor 4).

## Trazabilidad R → test (comprobada)

| R | Test que lo prueba |
|---|---|
| R1 | `tests/unit/planes/beneficios.test.ts` «R1: una lista vacía…», «R1: no hay tope…»; `tests/integration/db/plan-beneficio.test.ts` «R1» |
| R2 | `beneficios.test.ts` «R2» ×3 (recorte, vacío, 120/121); `PlanFormBeneficios.test.tsx` «R2: … hasta 120» |
| R3 | `beneficios.test.ts` «R3» (`it.each` y claves de más); `plan-borrador-schema.test.ts` «R3 (%s)» |
| R4 | `beneficios.test.ts` «R4» ×3 (error en cada `<j>.texto` después del primero) |
| R5 | `beneficios.test.ts` «R5»; `BeneficiosDelPlan.test.tsx` «R5» ×2; `PlanFormBeneficios.test.tsx` «R5» |
| R6 | `plan-beneficio.test.ts` «R6» ×3 (CHECK, 42501 de `servi_app`, solo por `plan_de_la_empresa`); `migracion-plan-beneficio-ida-y-vuelta.test.ts` «R6» |
| R7 | `plan-borrador-schema.test.ts` «R7»; ida y vuelta «R7» (CHECK); `PlanFormPasos.test.tsx` adaptado |
| R8 | `PlanFormBeneficios.test.tsx` «R8» |
| R9 | `PlanFormBeneficios.test.tsx` «R9» ×2; `plan-form-borrador.test.ts` «R9, R11» |
| R10 | `PlanFormBeneficios.test.tsx` «R10» ×2; `plan-borrador-schema.test.ts` «R10» |
| R11 | `plan-form-borrador.test.ts` «R11» ×2; `PlanFormBorrador.test.tsx` «SLT-214 R11» |
| R12 | `plan-borrador-confirmar.test.ts` «SLT-214 R12» |
| R13 | `PlanFormBeneficios.test.tsx` «R13» ×2; `plan-form-borrador.test.ts` «R13» |
| R14 | `PlanFormBeneficios.test.tsx` «R14» ×3 (ver el hallazgo menor 2) |
| R15 | `plan-beneficio.test.ts` «R15»; `plan-borrador-confirmar.test.ts` «SLT-214 R15» |
| R16 | `plan-borrador-confirmar.test.ts` «SLT-214 R16»; `planes-version-por-empresa.test.ts` «SLT-214 R16» |
| R17 | `plan-beneficio.test.ts` «R17» |
| R18 | `beneficios.test.ts` «R18»; `plan-beneficio.test.ts` «R18»; `mi-plan-repository.test.ts` «R18»; `rastro.test.ts`; `MiPlanModule.test.tsx` «R18, R23» |
| R19 | `rastro.test.ts` «SLT-214 R19» (5 casos); `PlanDetalle.test.tsx` «R19» ×4 |
| R20 | `PlanesModule.test.tsx` «R20» ×2 |
| R21 | `BeneficiosDelPlan.test.tsx` «R21» ×3; `PlanesModule.test.tsx` «R21» ×3; `MiPlanCambioDePlan.test.tsx` «R21, R24» |
| R22 | `PlanDetalle.test.tsx` «R22» ×2 |
| R23 | `mi-plan-repository.test.ts` «R23» ×3; `MiPlanModule.test.tsx` «R23» ×2; ida y vuelta «R18, R23» ×2 |
| R24 | `mi-plan-cambio-service.test.ts` «SLT-214 R24»; `MiPlanCambioDePlan.test.tsx` «R24» ×2 |
| R25 | `beneficios.test.ts` «R25» (con `lineasDeCambioDelPlan`); `MiPlanModule.test.tsx` «R25» ×2; `PlanDetalle.test.tsx` «R19, R25» ×2 |
| R26 | `e2e/planes-beneficios.spec.ts`, 2 casos; verde en `e2e (aislamiento)` del CI de `ac4edfa7` |

## Puntos que pidió mirar el leader

- **Archivos fuera de la lista de `tasks.md`.** Los tres están justificados y son mínimos:
  - `lib/db/modelos-de-negocio.ts` (+3): lo exige la guardia `organizacion-en-modelos` para toda tabla nueva.
  - `components/ui/select.tsx` (+13/−1): un `icon?` opcional y aditivo, y sin él el render es el de antes. No
    duplica nada.
  - `playwright.config.ts` (+2): un spec que no esté en un proyecto no corre.

  Se añadieron también 9 tests ajustados solo por el paso o la clave nueva, todos listados en la bitácora. No es
  hallazgo.
- **«Revisar» al editar con la fila «Beneficios» solo si cambian.** No choca con R25: R25 habla de las líneas
  «Esto es lo que cambia:» de «Mi plan», el correo, el rastro y el detalle de empresa, no de «Revisar». Con R14
  hay una tensión literal en un caso, que es el hallazgo menor 2.
- **Migración.** Es reversible y atómica (BEGIN/COMMIT en las dos direcciones):
  - el CHECK de pasos añade solo `beneficios`;
  - la redefinición de `plan_de_la_empresa` cambia solo la clave `beneficios`. Respeta R18: con `v_version` sin la
    clave, valen los del plan;
  - el down quita la clave de borradores y versiones antes de volver al CHECK viejo, que si no fallaría, y borra la
    tabla. Pierde los beneficios a sabiendas, como se decidió;
  - el test de ida y vuelta comprueba que tras bajar «Mi plan» queda como antes, y que subir otra vez da el mismo
    esquema.
- **Sin duplicados en un plan.** `beneficiosSchema.superRefine(sinRepetidos)` corre en el cliente (paso), en el
  servidor (guardar el paso, `crearPlanSchema`, `edicionDelPlan`) y al confirmar. No hay único en la base, y el
  comentario de la migración da el porqué: `unaccent` no es indexable. La clave de comparación es
  `stripDiacritics(collapseSpaces(t)).toLowerCase()`.

## Hallazgos

1. **BLOQUEANTE** — `specs/SLT-214-planes-beneficios-texto/tasks.md:85` (T11) y `:89` (T12) siguen `[ ]`. El
   checkpoint exige todas las tasks en `[x]`.
   - T11: su «Hecho» pedía verde en local, pero el humano lo sustituyó por el CI. `e2e (aislamiento)` del run
     44576322614 ya está en verde con `planes-beneficios` y los E2E de planes adaptados. Falta marcarla con esa
     evidencia y, cuando termine, `e2e (dinero)` para `planes-costo-porcentual`.
   - T12: falta el gate local. Según la memoria vale typecheck más `pnpm run test:guardias` si `./init.sh` muere
     por memoria, anotándolo. Después hay que marcarla.

   Es un arreglo mecánico de cierre, sin cambio de código.
2. **menor (decisión humana)** — `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx:79`
   (`conBeneficios`). Al editar sin tocar los beneficios, «Revisar» no muestra la fila «Beneficios». R14 dice sin
   condición «El paso «Revisar» DEBE listar los beneficios…», y design §6 (tabla, fila «Revisar») dice «con la
   lista completa». La implementación sigue el patrón de SLT-144 al editar (solo filas que cambian, «antes →
   después»). Es coherente y lo verifica `PlanFormBeneficios.test.tsx` «R14: al editar, si cambian…; si no, no hay
   fila», pero eso es fijar un comportamiento que el spec no dice (regla «No inventes»). Hay que elegir una de dos:
   - el humano acepta el comportamiento y el spec_author precisa R14 («al editar, solo si cambian, antes →
     después»);
   - la fila sale siempre al editar.

   No choca con R25.
3. **menor** — Tamaño real por encima de lo aceptado. El humano aceptó «~47 archivos, ~750 líneas de producción»,
   y el script mide 62 archivos y 1006 líneas de producción. El marcador lo cubre en lo formal, pero conviene
   decírselo al humano al pedir el merge.
4. **menor** — `docs/perfil-agentes.md > reviewer` pide constancia de los E2E afectados corridos en local cuando el
   diff toca `db/` y pantallas. No se corrieron, por orden expresa del humano (memoria). La constancia es el CI:
   `aislamiento` en verde y `dinero` pendiente. No bloquea, pero el leader no debe dar el aviso de merge sin
   `e2e (dinero)` y `gate-completo` en verde.
5. **menor** — R25 exige las líneas también en el correo a los maestros
   (`lib/services/email/plantillas/cambio-plan.ts`) y en el detalle de empresa del superadmin (`PlanEmpresa.tsx`).
   Los dos pasan por `lineasDeCambioDelPlan`/`diferenciasDelPlan`, que están probados con beneficios, pero no hay
   ningún test de esas dos superficies con beneficios. La cobertura es indirecta y aceptable. Un caso en el test de
   la plantilla del correo cerraría el hueco.

## Veredicto

**RECHAZADO (CAMBIOS)**, por un único bloqueante mecánico: marcar T11 y T12 con su evidencia. Además, el humano
tiene que decidir el hallazgo 2 (R14 al editar). El código, la migración y la trazabilidad R1–R26 están bien.
Corregido eso, sale OK en una vuelta acotada.
