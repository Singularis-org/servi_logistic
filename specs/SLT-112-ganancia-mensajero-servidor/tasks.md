# SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» — tasks

> Reparto: `backend_dev` T0-T4; `frontend_dev` T5-T6; implementer T7. Antes del primer gate, copiar
> `.env` al worktree (sin él la integración se salta y el gate sale verde a ciegas). Base desechable
> para integración y E2E, nunca la de desarrollo; exportarla antes de cualquier `vitest`. No correr el
> gate con una mutación aplicada.

## T0 — Comprobaciones previas (backend_dev)

- [x] **T0.1** Confirmar en `origin/dev` (`git fetch` + `git grep`) que nadie emite ya las cifras
  (`resumenGanancia`, `gananciaPendiente`, «Ganancia pagada este mes» fuera de tests/specs) y si
  SLT-139 «Pago al mensajero independiente del efectivo: satélite» ya está en `dev`.
  **Hecho:** anotado en `progress/impl_SLT-112.md`; si las cifras ya existen, PARA y avisa al leader;
  si SLT-139 ya entró, trae `origin/dev` y sigue `design.md > 5`.
- [x] **T0.2** Comprobar el corpus de `design.md > 6` contra el esquema: que `fecha_pago` admite
  2026-12-01 con «hoy» = 2026-11-20 (sin `CHECK` que lo impida), la zona horaria de `reglasPaisFijas`
  y que con ella `2026-12-01T03:00:00Z` sigue siendo 30 de noviembre (mutación 9). Recalcular a mano
  los dos literales (`47500.55`/2 y `3500.00`/2). **Hecho:** anotado; si algo no casa, PARA y reporta
  (no se cambia el literal para que pase).
- [x] **T0.3** Leer la respuesta de Carlos a PA1-PA3 en `requirements.md`. Si PA1 = «no», quitar
  `LecturaPagadoPorSatelite`, `pagadoPorSatelite` y R353 del contrato antes de T1 y anotarlo.
  **Hecho:** la decisión, anotada en `progress/features/SLT-112.md > Decisiones`.

## T1 — Lecturas (backend_dev) · depende de T0

- [x] **T1.1** `ICierreDiaRepository.findAprobadosParaPendiente` + implementación en
  `CierreDiaRepository` (`design.md > 1`). **Hecho:** typecheck verde.
- [x] **T1.2** [P] `ILiquidacionPagoRepository.sumarVigentesDelMensajeroEnRango` + implementación en
  `LiquidacionPagoRepository` con `VIGENTE`, `gte`/`lt` y `_count`. **Hecho:** typecheck verde.

## T2 — Servicio y borde (backend_dev) · depende de T1

- [x] **T2.1** `ICierreDiaService.ts`: `CifraGanancia`, `ResumenGananciaMensajero`,
  `ResumenGananciaServiceResult`, `LecturaPagadoPorSatelite`, `LecturasGananciaMensajero` y
  `resumenGanancia(actor)`. **Hecho:** typecheck verde.
- [x] **T2.2** `CierreDiaService`: helper privado `pendientesPorCierre`; `conPendientePago` lo usa; y
  `resumenGanancia` con los pasos de `design.md > 2` (parámetro opcional `ganancia` al final del
  constructor). **Hecho:** `tests/unit/services/cierre-dia-pendiente-pago.test.ts` y
  `tests/unit/services/cierre-dia-pasados-paginado.test.ts` verdes **sin cambiar aserciones** (R72).
- [x] **T2.3** `tests/unit/services/cierre-dia-ganancia.test.ts` con los casos de `design.md > 6 >
  Servicio con dobles` (R353, R355, R357, R359). **Hecho:** verde.
- [x] **T2.4** `lib/actions/cierre-dia.ts`: acción `resumenGananciaMensajero` y el bundle `ganancia` en
  `buildService()`. Ampliar `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`: la acción
  real, contra la base, devuelve `ok` con cifras (no `sin_dato`) para un mensajero sembrado.
  **Hecho:** verde y visible como `passed`.
- [x] **T2.5** Si `lib/services/CierreDiaService.ts` no está censado por
  `tests/unit/guards/liquidacion-money-safe.test.ts`, añadirlo. **Hecho:** guardia verde; y roja con un
  `Number(` puesto a mano en `resumenGanancia` (se revierte).

## T3 — Integración contra Postgres real (backend_dev) · depende de T2

- [x] **T3.1** Nuevo `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` con el corpus y las
  aserciones de `design.md > 6 > Integración` (R350, R351, R352, R354, R356, R72). Servicio real sobre
  repositorios reales, `describeSiHayBase`, fallo ruidoso sin corpus, nada de `return` temprano.
  **Hecho:** verde contra la base desechable y visible como `passed` (no `skipped`).

## T4 — Mutaciones (backend_dev) · depende de T3

- [x] **T4.1** Aplicar una a una las nueve mutaciones de `design.md > 6 > Mutaciones`, correr T2.3 y
  T3.1, revertir. **Hecho:** las nueve ponen rojo al menos un test (anotado en
  `progress/impl_SLT-112.md` cuál y qué aserción cae) y el árbol vuelve limpio.

## T5 — Pantalla (frontend_dev) · [P] con T3-T4, depende de T2.1

- [x] **T5.1** `detalle-cierre-vista.ts`: `CifraId` gana `gananciaPendiente` y `gananciaPagada`.
- [x] **T5.2** `cola-propia-vista.ts`: constantes, `notaCierresSinLiquidar`, `notaPagosDelMes`,
  `tarjetasGanancia` (`design.md > 4`). Tests en `tests/unit/utils/cola-propia-vista.test.ts` con
  literales (0, 1, n; orden; destacada; valor intacto). **Hecho:** verde.
- [x] **T5.3** `ColaCierres.tsx`: `tarjetas?` en `ColaCierresPropiosProps` y `CifrasCierre` entre barra
  y tabla. `CierreDiaModule.tsx`: prop `resumenGanancia?` → `tarjetasGanancia`. `page.tsx`: la acción en
  el `Promise.all`, `undefined` si no es `ok`, sin `notFound` (R357).
  **Hecho:** typecheck y lint verdes.
- [x] **T5.4** `tests/components/CierreDiaColaPropia.test.tsx` (R158 → sin cifras sin tarjetas; con
  cifras las dos tarjetas con sus literales, también en 0; paginar y filtrar no las cambian) y
  `tests/components/CierreDiaPage.test.tsx` (acción en error → página sin tarjetas y sin `notFound`).
  **Hecho:** verdes.

## T6 — E2E (frontend_dev) · depende de T2.4 y T5

- [x] **T6.1** `e2e/cierres-rediseno.spec.ts`: las dos lecturas del mensajero central antes y después
  del «Registrar pago» (`design.md > 6 > E2E`, R358, R360). **Hecho:** verde en local con
  `--project=dinero` sobre base desechable; salida anotada.

## T7 — Cierre (implementer)

- [x] **T7.1** Ponerse al día con `dev` (SLT-139 toca `CierreDiaService.ts` y `lib/actions/cierre-dia.ts`;
  `design.md > 5 > Orden de merge`). **Hecho:** sin conflictos pendientes; T2.2 y T3.1 verdes tras el
  merge.
- [x] **T7.2** `./init.sh` verde y el grupo `dinero` en local (`docs/perfil-agentes.md`). **Hecho:**
  salida con `INIT_EXIT` anotada en `progress/impl_SLT-112.md`.
- [x] **T7.3** Anotar en `progress/features/SLT-112.md` lo que hereda SLT-139 (`design.md > 5 > Lo que
  SLT-139 hereda`). **Hecho:** líneas escritas.
- [x] **T7.4** Mapa `R → test` en `progress/impl_SLT-112.md`, igual a `## Trazabilidad`. **Hecho:** todos
  los R con un test que existe y está verde.

## Trazabilidad

| R | Test | Caso |
|---|---|---|
| R350 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` | M: `"47500.55"`, 2; C7/C8 no suman (mutación 5); conteo solo con pendiente > 0 (mutación 8) |
| R351 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` | Σ pendientes de la página 1 = tarjeta; C1 viejo y C2 nuevo (mutación 7) |
| R352 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` | `"3500.00"`, 2; anulado, octubre y 1 de diciembre fuera (mutaciones 2-4, 9) |
| R353 | `tests/unit/services/cierre-dia-ganancia.test.ts` | con la lectura: +`1200.00`, +1; sin ella: igual a R352 |
| R354 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` | M2 y empresa B fuera (mutaciones 1, 6); con filtro, mismas cifras |
| R355 | `tests/unit/services/cierre-dia-ganancia.test.ts` · `tests/unit/guards/liquidacion-money-safe.test.ts` | escala 2 con `Prisma.Decimal`; `"0.00"`/0 sin datos; sin `Number(` |
| R356 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` | mismas sentencias con M (6 aprobados) y M3 (1) |
| R357 | `tests/unit/services/cierre-dia-ganancia.test.ts` · `tests/components/CierreDiaPage.test.tsx` · `tests/components/CierreDiaColaPropia.test.tsx` | `sin_dato`; acción en error → sin tarjetas y sin `notFound`; sin prop → sin tarjetas (R158) |
| R358 | `tests/unit/utils/cola-propia-vista.test.ts` · `tests/components/CierreDiaColaPropia.test.tsx` · `e2e/cierres-rediseno.spec.ts` | orden, destacada, notas 0/1/n, valor intacto; no cambian al paginar ni filtrar |
| R359 | `tests/unit/services/cierre-dia-ganancia.test.ts` | otro rol → `forbidden`, ninguna lectura llamada |
| R360 | `e2e/cierres-rediseno.spec.ts` · `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` | antes/después del pago; la acción real lee de la base en cada llamada |
| R72 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` · `tests/unit/services/cierre-dia-pendiente-pago.test.ts` | sin escrituras; la celda «Pago» no cambia |

## Tamaño

| Bloque | Archivos | Líneas estimadas |
|---|---|---|
| Producción backend: dos interfaces de repositorio (~20), dos repositorios (~45), interfaz del servicio (~40), servicio (~80), acción (~25) | 7 | ~210 |
| Producción frontend: `page.tsx` (~10), `CierreDiaModule.tsx` (~10), `ColaCierres.tsx` (~12), `cola-propia-vista.ts` (~40), `detalle-cierre-vista.ts` (~3) | 5 | ~75 |
| Tests: servicio con dobles (~140), integración (~280), cableado (~40), vista (~60), componente (~70), página (~30), guardia (~5), E2E (~40) | 8 | ~665 estimadas → **~1 330 reales** con el factor 2× de los tests |
| `progress/` | 2 | — |
| **Total** | **22** | **~1 615** |

Producción ~285 líneas en 12 archivos; tests ~2× de lo estimado. 22 archivos: por debajo del 80 % de
`gate.tamano_pr` (32 de 40). En líneas pasa de las 1 000 por la integración contra la base y el E2E, que
son los que exige el proyecto para un `WHERE` de dinero; la producción es pequeña. No se parte: partir
dejaría el servidor emitiendo cifras que nadie pinta, o una pantalla sin cifras.

## Archivos esperados

- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts`
- `lib/repositories/LiquidacionPagoRepository.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/actions/cierre-dia.ts`
- `app/(app)/cierre-dia/page.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/cola-propia-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `tests/unit/services/cierre-dia-ganancia.test.ts`
- `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts`
- `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`
- `tests/unit/utils/cola-propia-vista.test.ts`
- `tests/components/CierreDiaColaPropia.test.tsx`
- `tests/components/CierreDiaPage.test.tsx`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `e2e/cierres-rediseno.spec.ts`
- `progress/impl_SLT-112.md`
- `progress/features/SLT-112.md`
