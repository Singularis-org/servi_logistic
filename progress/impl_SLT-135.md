# impl SLT-135 «Planes: sin «De inmediato» al editar un plan»

Bitácora consolidada del implementer (2026-11-18). El detalle y la salida completa de cada tanda están en
`progress/impl_SLT-135-T1-T3.md`, `-T4.md`, `-T5-T6.md` y `-T7.md`.

PR: https://github.com/Singularis-org/servi_logistic/pull/224, contra `dev`, montado sobre #209 (SLT-144).

**Estado: hechas T1–T7 (T7.1 escrita, verificación en CI). T8 al cierre.** Los dos bloqueos están resueltos (abajo).

## Commits
- `e8718e75` T1–T3: contrato, servicio, sin `PlanesRepository.editar`, tests unitarios.
- `e97a030f` T5–T6: formulario y tests de componentes.
- `4dac20e0` T7.1: los E2E `planes-costo-porcentual` (R23) y `planes-borrador`, adaptados.
- `6887383b` T4: integración. T4.1 deja 1 rojo a propósito (bloqueo 1).
- `a6f6ee90` merge de `origin/feature/SLT-144-planes-form-pasos-borrador`, que trae `eaa798e6` (SLT-144 T5.4, decisión
  humana R29: borra `crearPlanAction` y `editarPlanAction`).
  - Hubo un conflicto en `lib/actions/planes.ts` y me quedé con el lado de SLT-144. Esta ficha solo había tocado
    el comentario de `editarPlanAction`.
  - El merge arregla el rojo de la guardia `superficie-de-uso` R-A.
- Antes, merge de `origin/dev` (#223) y de SLT-144 (`bc22ea49`). Las migraciones están aplicadas a las bases de abajo.

## Archivos (50 esperados: 17 de producción y 33 de tests)
- **Producción:** los 17 de `tasks.md > Archivos esperados`. `lib/actions/planes.ts` ya no tiene diff propio
  después del merge de SLT-144.
- **Tests:** los de la lista y tres más:
  - `tests/components/PlanFormDescuentos.test.tsx`: buscaba el grupo «Aplicar»;
  - `e2e/planes-borrador.spec.ts`: usaba el radio y el campo «Fecha»;
  - los dobles `editar:` de `tests/unit/services/planes-service-{crear-custom,inicio-ciclo,lecturas,tipo-cobro,asignar-costo}.test.ts`
    (una línea en cada uno; sin ellos no compila, porque `IPlanesRepository.editar` ya no existe).
- `tasks.md > Archivos esperados` está actualizado con los dos primeros. Los dobles de una línea no están anotados ahí.

## Mapa R<n> → test
| R | Test |
|---|---|
| R1 | `tests/unit/services/planes-service.test.ts` «R1: sin fecha es validation_error sin llamar al repositorio»; `tests/unit/types/planes-schema.test.ts` «R1: editarPlanSchema exige vigenteDesde» |
| R2 | `tests/unit/services/planes-service-periodo.test.ts` «R2: ayer se rechaza, cambie el precio o no» |
| R3 | `tests/unit/services/planes-service-periodo.test.ts` «R3: hoy, con y sin cambio de precio, programa con las 00:00 de hoy»; `tests/integration/db/planes-edicion-en-uso.test.ts` «R3: los topes y los módulos llegan por la recepción, no al guardar» |
| R4 | `tests/integration/db/planes-cambio-por-empresa.test.ts` «R4: F hoy: la quincenal lo recibe en la siguiente pasada y la mensual el 1 de diciembre» |
| R5 | `tests/integration/db/planes-cambio-programado.test.ts` «R5: plan sin empresas con F hoy: lo promueve la siguiente pasada» |
| R6 | `tests/integration/db/plan-precio-historial.test.ts` «R6: precio con F hoy: la quincenal que empieza hoy lo paga desde hoy y la mensual desde el 1»; `tests/integration/db/plan-descuento-periodo.test.ts` «R6: un descuento con F hoy se programa» |
| R7 | `tests/unit/services/planes-service.test.ts` «R7: sin cambios con fecha responde cambio false» |
| R8 | `tests/integration/db/planes-cambio-por-empresa.test.ts` «R8: con el plan partido, editar programa y reemplaza» |
| R9 | `tests/unit/services/planes-service.test.ts` «R9: ok con la fecha elegida» |
| R10 | `tests/unit/types/plan-borrador-schema.test.ts` «R10: vigencia sin fecha es inválida; una fecha pasada se acepta al guardar» |
| R11 | `tests/integration/db/plan-borrador-confirmar.test.ts` «R11: una vigencia sin fecha guardada antes queda pendiente al confirmar» |
| R12 | `tests/integration/db/plan-borrador-confirmar.test.ts` «R12: confirmar con F hoy programa» |
| R13 | `tests/unit/services/planes-previsualizar-cambio.test.ts` «R13: sin fecha es validation_error»; «R13: con F, cada empresa lleva siempre una fecha» |
| R14 | `tests/components/PlanForm.test.tsx` «R14: Cuándo rige sin De inmediato y con A partir de» |
| R15 | `tests/components/PlanForm.test.tsx` «R15: abre con mañana»; `tests/unit/planes/plan-form-borrador.test.ts` «R15: vigencia ida y vuelta con fecha, cambie o no el precio» |
| R16 | `tests/components/PlanForm.test.tsx` «R16: Programar cambio envía la fecha de A partir de», «R16: con cambio de precio envía la de Rige desde»; `tests/components/PlanFormBorrador.test.tsx` (botón «Programar cambio» con precio) |
| R17 | `tests/components/PlanForm.test.tsx` «R17: fecha vacía no avanza» |
| R18 | `tests/unit/planes/plan-form-revision.test.ts` «R18: la fila de la fecha»; `tests/components/PlanFormRevisar.test.tsx` «R18: Revisar muestra A partir de» |
| R19 | `tests/components/PlanFormFechasPorEmpresa.test.tsx` «R19: con la fecha por defecto se pide y se muestra la tabla» |
| R20 | `tests/components/PlanDetalle.test.tsx` «R20: programar avisa con la fecha» |
| R21 | `tests/unit/services/email/plantilla-cambio-plan.test.ts`, el caso existente con `vigenteDesde: null`, sin cambios |
| R22 | `tests/unit/services/planes-service.test.ts` «forbidden» de editar, ahora con fecha; `tests/unit/services/planes-previsualizar-cambio.test.ts` «R22» |
| R23 | `e2e/planes-costo-porcentual.spec.ts` «el superadmin programa por pantalla el plan en «Porcentual» con fecha de hoy (R23)»: escrito, **verificación en CI** (jobs e2e de `gate-completo` en #224) |

## Salida real (local, `NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm run typecheck`, tras el último merge: 0 errores.
- `pnpm run test:guardias`: `Tests 4 failed | 5279 passed | 28 skipped`. Los 4 rojos son de
  `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`.
- Unitarios de T3, 10 archivos: `Test Files 10 passed (10)`, `Tests 396 passed (396)`.
- T6, 8 archivos (componentes y `tests/unit/planes`): `Test Files 8 passed (8)`, `Tests 139 passed (139)`.
- Integración, en la base `servi_logistic_slt135`, con `--no-file-parallelism`:
  - T4.1, tras «Gana el último»: `461 passed (461)` (bloqueo 1).
  - T4.2–T4.3: 11 archivos, `128 passed (128)` y 0 skipped.
- E2E: en CI (bloqueo 2).
- `./init.sh`: sin correr.
- Bases: las dos se crearon con DROP/CREATE, `prisma migrate deploy` y `db:seed` con el árbol de dev #223:
  - `servi_logistic_slt135` (integración);
  - `servi_logistic_slt135_e2e` (E2E).

## Bloqueos (resueltos 2026-11-18)
1. **Dos precios el mismo día con F = hoy:** decisión humana «Gana el último».
   - Nota fechada en `design.md > §2` y fila en `requirements.md > Decisiones cerradas`.
   - **Mecanismo:** `escribirPrecioDelCambio` sale sin escribir si el historial en F ya da el precio del cambio,
     porque entonces la fila la dejó el mismo cambio (un pendiente no cambia de precio). Si no, sobrescribe:
     `escribirPrecioDelHistorial` hace siempre `ON CONFLICT DO UPDATE`, y se quita el modo «dejar».
   - **Sin migración.** Detalle en `impl_SLT-135-T4.md > Gana el último`.
   - **Tests:** «dos ediciones del mismo día dejan la última…» ya pasa, y hay uno nuevo, «R6 (Gana el último): el
     mismo cambio recibido o aplicado dos veces (reintento de la cola) no cambia la fila ni añade otra».
   - **Salida:** 15 archivos (integración de T4.1 y los `planes-service*` unitarios), `461 passed (461)`, 0 skipped.
   - **Abierto para el leader:** `specs/SLT-128-planes-cambios-por-periodo/design.md §3.2` todavía dice
     `ON CONFLICT DO NOTHING`. Es un spec cerrado y no lo toqué.
2. **E2E (T7.1):** escrito; la verificación va en CI. El leader lo decidió: el `next build` local murió por
   memoria, y los E2E corren en los jobs `e2e (aislamiento|dinero|reparto)` de `gate-completo` del PR #224.

## Para el reviewer
- «De inmediato» todavía aparece en `tests/`: en los nombres de `it` que pide el spec (p. ej. R14) y en aserciones
  negativas. En `lib/` y `app/` no queda ninguno.
- En `factura-plataforma-cambio-plan` y `cobro-plataforma-plan`, la preparación de datos se hace con SQL a mano
  (motivo en `impl_SLT-135-T4.md`).
