# SLT-135 «Planes: sin «De inmediato» al editar un plan» — backend_dev, T1.1, T2.1, T2.2, T3.1–T3.5

Fecha: 2026-11-18. Worktree `.worktrees/SLT-135-planes-sin-de-inmediato`. El implementer commiteó este trabajo en
`e8718e75` («T1-T3 editar siempre programa; sin PlanesRepository.editar»).

## Archivos

Producción (8, todos de `## Archivos esperados`):
- `lib/types/planes.ts`: `FECHA_DE_EFECTO_OBLIGATORIA` se mueve aquí. `editarPlanSchema.vigenteDesde` pasa a
  `z.string({ error: FECHA_DE_EFECTO_OBLIGATORIA }).pipe(fechaSchema)`. `previsualizarCambioSchema.vigenteDesde`
  queda en `fechaSchema`, sin `null`. `FechaDeEmpresa.recibeEl: string`. Comentarios de los dos esquemas y de
  `cambio_a_medias`.
- `lib/planes/mensajes.ts`: reexporta `FECHA_DE_EFECTO_OBLIGATORIA` y quita `MENSAJE_EDITAR_CAMBIO_A_MEDIAS`.
  El comentario de `introCambioPlan` cita R21; la rama `fecha === null` sigue.
- `lib/types/plan-borrador.ts`: solo el comentario de `vigenciaSchema`.
- `lib/services/PlanesService.ts`: `editar` según §2 (sin `editarYa`, sin la rama del precio y sin «posterior a
  hoy»). `previsualizarCambio` con `recibeEl` siempre fecha. Imports `cambiaElPrecio`, `diferenciasDelPlan` y
  `VersionPlan` retirados porque quedaban sin uso.
- `lib/interfaces/repositories/IPlanesRepository.ts`: quitados `editar` y `ResultadoEdicion`. Comentarios
  (`CambioAMedias` R14/R15 y `borradorId`).
- `lib/repositories/PlanesRepository.ts`: quitado `editar` y el import de `ResultadoEdicion`. Comentario de
  `aplicarVersion`. `planPartido` sigue en uso por `cancelarCambio`.
- `lib/interfaces/services/IPlanesService.ts` y `lib/actions/planes.ts`: solo comentarios.

Tests unitarios:
- De la lista de T3: `tests/unit/services/{planes-service,planes-service-periodo,planes-service-costeo,
  planes-service-costo-porcentual,planes-previsualizar-cambio}.test.ts` y `tests/unit/types/{planes-schema,
  planes-schema-costeo,planes-schema-costo-porcentual,plan-borrador-schema}.test.ts`.
- **Fuera de `## Archivos esperados`**, tocados porque el doble de `IPlanesRepository` declaraba `editar` y el
  typecheck fallaba:
  - `tests/unit/services/planes-service-asignar-costo.test.ts`: además, «editar de inmediato» pasa a «editar
    con la fecha de hoy», que llama a `programarCambio`;
  - `planes-service-crear-custom.test.ts`, `planes-service-inicio-ciclo.test.ts`,
    `planes-service-lecturas.test.ts` y `planes-service-tipo-cobro.test.ts`: solo se quita la línea `editar` del
    doble.

  Son 5 archivos más para la cuenta de T8.2.

## Mapa R<n> → test (lo mío)

| R | Test |
|---|---|
| R1 | `tests/unit/services/planes-service.test.ts` «R1: sin fecha es validation_error sin llamar al repositorio»; `tests/unit/types/planes-schema.test.ts` «R1: editarPlanSchema exige vigenteDesde» |
| R2 | `tests/unit/services/planes-service-periodo.test.ts` «R2: ayer se rechaza, cambie el precio o no» |
| R3 (unit) | `tests/unit/services/planes-service-periodo.test.ts` «R3: hoy, con y sin cambio de precio, programa con las 00:00 de hoy» |
| R7 | `tests/unit/services/planes-service.test.ts` «R7: sin cambios con fecha responde cambio false» |
| R9 | `tests/unit/services/planes-service.test.ts` «R9: ok con la fecha elegida» |
| R10 | `tests/unit/types/plan-borrador-schema.test.ts` «R10: vigencia sin fecha es inválida; una fecha pasada se acepta al guardar» |
| R13 | `tests/unit/services/planes-previsualizar-cambio.test.ts` «R13: sin fecha es validation_error» (sustituye «con F null no hay fechas») y «R13: con F, cada empresa lleva siempre una fecha» |
| R22 | `tests/unit/services/planes-service.test.ts` «editar (SLT-135 R22): el rol %s … forbidden con cero llamadas» y «R14: el rol %s … al cancelar, archivar ni editar» (con fecha); `tests/unit/services/planes-previsualizar-cambio.test.ts` «R22» existentes |

- Se quitó el test de SLT-128 R16 (`cambio_a_medias` en editar) de `planes-service.test.ts`.
- Se quitaron los de «editar de inmediato» de `planes-service.test.ts`, `planes-service-periodo.test.ts`,
  `planes-service-costeo.test.ts`, `planes-service-costo-porcentual.test.ts` y
  `planes-service-asignar-costo.test.ts`.

## Salida real

- `pnpm exec vitest run` sobre los 9 archivos de T3: `Test Files 9 passed (9)`, `Tests 372 passed (372)`.
- `pnpm exec vitest run tests/unit/services/ tests/unit/types/ tests/unit/cron/ tests/unit/api/procesar-jobs-registro.test.ts`
  (al final): `Test Files 500 passed (500)`, `Tests 10100 passed (10100)`.
- `pnpm exec vitest related --run <los 8 de producción> --exclude tests/integration/** --exclude e2e/**`, a mitad
  de tanda, antes de T5/T6 y antes de `prisma generate`: `Test Files 13 failed | 302 passed (315)`,
  `Tests 42 failed | 5009 passed (5051)`. De esos rojos:
  - `tests/unit/api/procesar-jobs-registro`, `tests/unit/cron/procesar-jobs-modulos` y
    `tests/unit/cron/procesar-jobs-plan-cambio` venían de un cliente Prisma sin generar en el worktree. Después de
    `pnpm run db:generate` (con `DATABASE_URL` de mentira, solo para generar) pasan: 4 archivos, 92 tests.
  - `planes-service-asignar-costo` tenía rojos propios de esta ficha y ya está arreglado.
  - El resto eran `tests/components/PlanForm*`, `PlanDetalle` y `tests/unit/planes/plan-form-borrador`, que
    son de frontend_dev (T5/T6). Ya entraron en `e97a030f`; no los volví a correr.
- `pnpm exec eslint <archivos de lib/ y tests/ del diff>`: exit 0, sin avisos.
- `pnpm run typecheck`:
  - sin más heap, tsc muere por memoria (exit 134); con `NODE_OPTIONS=--max-old-space-size=8192` termina;
  - a mitad de tanda también salían errores en `app/` (PlanEmpresa.tsx, PlanForm.tsx, plan-form/borrador.ts) y en
    `tests/components/PlanFormFechasPorEmpresa.test.tsx:150`, que ya no salen tras `e97a030f` (frontend);
  - al final (exit 2) solo quedan los errores fuera de mi alcance de la lista siguiente.

## Errores de typecheck que quedan (fuera de mi alcance, tanda T4)

- `tests/integration/db/cobro-plataforma-plan.test.ts:178` TS2339 `editar` no existe en `PlanesRepository`.
- `tests/integration/db/planes-edicion-en-uso.test.ts:218` TS2339 ídem.
- `tests/integration/db/planes-historial.test.ts:241` TS2339 ídem.

`plan-precio-historial.test.ts` ya no aparece: alguien lo está editando en la tanda T4 (sale en `git status`).

## Notas

- El MCP del grafo no se usó: todo con Grep/Read.
- `node_modules` faltaba: `pnpm install --frozen-lockfile`. No se instaló ninguna dependencia nueva.

**Veredicto:** T1.1, T2.1, T2.2 y T3.1–T3.5 hechos; tests unitarios del servidor y lint en verde. El typecheck
solo falla en tres tests de integración de T4.
