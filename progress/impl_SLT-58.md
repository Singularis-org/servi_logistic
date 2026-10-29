# impl SLT-58 — bitácora

## T2 — Lógica pura (backend_dev)

### Archivos
- `lib/planes/ciclo.ts` (modificado): `inicioDelSiguienteCiclo(ancla, ahora)`; el cálculo de `n` se
  extrae a `ciclosCumplidos` (privada) y lo comparten `inicioDelCiclo` y la nueva. Sin cambio de
  comportamiento de `inicioDelCiclo` (sus 17 casos siguen verdes).
- `lib/planes/mensajes.ts` (modificado): `export` en `SIN_LIMITE` y `textoDelPrecio`; textos intactos.
- `lib/planes/consumo.ts` (nuevo): `estadoDeLaFila`, `formatearConteo`, `filasDeConsumo`, `reinicioDelCiclo`.
- `lib/types/consumo-plan.ts` (nuevo): tipos de design §5 (`UsoDelPlan`, `EstadoFila`, `FilaConsumo`,
  `CambioPendienteVista`, `ReinicioDelCiclo`, `PlanConConsumo`, `MiPlanResult`).
- `tests/unit/planes/consumo.test.ts` (nuevo).
- `tests/unit/utils/ciclo-plan.test.ts` (casos nuevos al final; los existentes sin tocar).

### Decisiones de lectura del design
- Texto de una fila sin tope: `«<usados> <etiqueta> · sin límite»` (ejemplo de §5), también para
  órdenes y API keys.
- `ReinicioDelCiclo = { dias; fecha }`: el tipo inline de `PlanConConsumo.reinicio` con nombre, para
  que lo devuelva `reinicioDelCiclo`.
- `ahora` anterior al ancla: el siguiente ciclo es `ancla + 1 mes` (n = 0).

### R → test
| R | Test |
|---|---|
| R1 (texto del precio) | `tests/unit/planes/consumo.test.ts` > «texto del precio (R1)» |
| R2 | `consumo.test.ts` > «formatearConteo (R2)», «filasDeConsumo (R2, R3)» |
| R3 | `consumo.test.ts` > «estadoDeLaFila (R3, R4)» (sin tope), «filasDeConsumo» (rol, órdenes y API keys sin tope) |
| R4 | `consumo.test.ts` > «estadoDeLaFila» (79/99, 80/100, 99/100, 100/100, 101/100, 0/0, sin tope) |
| R5 | `tests/unit/utils/ciclo-plan.test.ts` > «inicioDelSiguienteCiclo (R5)» (ancla 15 y 31 de enero, mitad de ciclo, un minuto antes, frontera); `consumo.test.ts` > «reinicioDelCiclo (R5)» |

### Entorno
- El worktree no tenía el cliente Prisma generado (`Cannot find module '.prisma/client/default'` al
  importar el fixture de `ciclo-plan.test.ts`). Se generó con `prisma generate` y un `DATABASE_URL`
  ficticio (no conecta); no hay `.env` en el worktree.

### Salida real
- `pnpm exec vitest run tests/unit/planes/consumo.test.ts tests/unit/utils/ciclo-plan.test.ts` →
  `Test Files 2 passed (2) · Tests 59 passed (59)`.
- `pnpm exec vitest related --run lib/planes/{ciclo,consumo,mensajes}.ts lib/types/consumo-plan.ts` →
  `269 files: 241 passed, 23 skipped, 5 failed · Tests 7 failed | 3631 passed | 231 skipped`. Los 7
  rojos son tests de componente sin relación (DetalleMovimientoCierre, EstadoCuenta463,
  WalletCajaBarra467, CierresDescargaColumnas, ordenes-listado-vistas) que superaron el timeout de
  20 s mientras corrían a la vez el typecheck y la otra tanda. Corridos solos: `5 passed · 97 passed`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm exec eslint` sobre los 6 archivos → sin salida, exit 0.
- Guardias: no corridas (el leader limitó la tanda a estos comandos).

**Veredicto T2:** hecho; R1 (precio), R2–R5 con test en verde, sin dependencias nuevas.

## T1 — Migración `plan_de_la_empresa` (backend_dev) — commit 1b4bb9d

### Archivos
- `db/migrations/20261029120000_plan_de_la_empresa/migration.sql` y `down.sql` (sin pérdida de datos).
- `tests/integration/db/plan-de-la-empresa.test.ts` (nuevo).
- `migracion-sl24-ida-y-vuelta.test.ts` aplica solo las migraciones anteriores a SL-24 y luego las cinco de SL-24 por nombre, así que no se toca.

### R → test
| R | Test |
|---|---|
| R2, R9 | `plan-de-la-empresa.test.ts` > «R2, R9 — servi_app lee el plan de SU empresa y el uso es exactamente el de plan_uso_*…» |
| R6 | > «R6 — una empresa sin plan recibe NULL» |
| R9 | > «R9 — la empresa de otro y sin contexto dan 42501…», «R9 — sin avisos_al_programar ni actor…», «R9 — solo servi_app y el dueño la ejecutan…» |
| R25 | > «R25 — la función es STABLE…» |
| R26 | > «R26 — el nombre en español está en pg_proc…» (down.sql en transacción + ROLLBACK) |

### Salida
`vitest run tests/integration/db/plan-de-la-empresa.test.ts` contra la base local `logistic_slt58`: 7 passed (7), sin saltos.

## T3 — «Mi plan»: repositorio y servicio (backend_dev) — commit d1bca5b

### Archivos
- `lib/auth/menu-visibility.ts`: solo se añade `ROLES_MI_PLAN` (8 líneas añadidas, nada reordenado).
- Nuevos: `lib/interfaces/repositories/IMiPlanRepository.ts`, `lib/repositories/MiPlanRepository.ts`,
  `lib/interfaces/services/IMiPlanService.ts`, `lib/services/MiPlanService.ts`, `lib/actions/_shared/mi-plan.ts`,
  `tests/unit/services/mi-plan-service.test.ts`, `tests/integration/db/mi-plan-repository.test.ts`.
- Decisión a revisar: `diferenciasDelPlan` pide un `PlanDTO` completo; los campos que la función no devuelve (id, visibilidad, empresa, archivado) se rellenan igual en las dos versiones, así que nunca salen como cambio.

### R → test
| R | Test |
|---|---|
| R8 | `mi-plan-service.test.ts` > «R8 — %s lee el plan…», «R8 — %s recibe forbidden sin una sola llamada…», «R8 — sin sesión (actor null)…», reparto de los siete roles |
| R7 | `mi-plan-service.test.ts` > «el pendiente trae la fecha … y las líneas de lineasDeCambioDelPlan…»; `mi-plan-repository.test.ts` > «R1, R2, R7 — mapea el jsonb real…» |
| R6 | `mi-plan-service.test.ts` > «una empresa sin plan recibe { estado: ok, plan: null }»; `mi-plan-repository.test.ts` > «una empresa sin plan da null» |
| R1, R2, R5 | `mi-plan-service.test.ts` > «arma nombre, precio sin moneda, módulos…, filas de consumo y reinicio» |
| R9 | `mi-plan-repository.test.ts` > «sin empresa en el contexto la base lo rechaza con 42501» |

### Salida
`vitest run` de mi-plan-service, mi-plan-repository y plan-de-la-empresa contra `logistic_slt58`: 3 archivos y 24 tests en verde, sin saltos. Typecheck y eslint de los archivos en verde.

## T4 — Lecturas del superadmin (backend_dev)

### Archivos
- Modificados: `lib/types/planes.ts`, `lib/planes/consumo.ts` (exporta `planConConsumo`, `cambioPendienteDelPlan`, `comoPlanDTO`),
  `lib/interfaces/repositories/IPlanesRepository.ts`, `lib/repositories/PlanesRepository.ts` (`historialAccion` y `planRastro` en el `Pick`),
  `lib/interfaces/services/IPlanesService.ts`, `lib/services/PlanesService.ts`, `lib/db/excepciones-aislamiento.ts` (solo el motivo),
  `lib/services/MiPlanService.ts` (sin copias privadas: usa `planConConsumo` de `lib/planes/consumo.ts`).
- Nuevos: `lib/actions/_shared/planes-plataforma.ts`, `tests/unit/services/planes-service-lecturas.test.ts`,
  `tests/integration/db/planes-lecturas-plataforma.test.ts`.
- `tests/unit/services/planes-service.test.ts` (SL-24): solo tres `vi.fn` (`catalogo`, `detalle`, `planDeEmpresa`) en `doble()`,
  sin cambiar ninguna aserción. Es una excepción mecánica a R25 que decidió el humano el 2026-10-29; está en requirements.md > Decisiones cerradas.

### Decisiones
- `comoPlataforma` usa la ficha `"SL-24"` (`FichaJira` no admite `SLT`); el motivo cita SLT-58. El humano decidió dejarlo así: deuda D29 en `progress/deudas.md`.
- El relleno de `PlanDTO` (id, visibilidad, empresa, archivado) se acepta tal cual; el comentario en `comoPlanDTO` explica por qué nunca sale como cambio.

### R → test
| R | Test |
|---|---|
| R13 | `planes-service-lecturas.test.ts` > «R13: todos los planes, archivados incluidos…»; `planes-lecturas-plataforma.test.ts` > «R13: el catálogo trae los archivados, el nº de empresas…» |
| R16 | `planes-service-lecturas.test.ts` > «R16: versión vigente, pendiente con su fecha…», «R16: sin pendiente, pendiente es null»; `planes-lecturas-plataforma.test.ts` > «R16: … su rastro del más reciente al más antiguo» |
| R19 | `planes-service-lecturas.test.ts` > «R19: nombre, precio sin moneda, módulos…», «R19: sin plan, plan es null» |
| R21 | `planes-lecturas-plataforma.test.ts` > «R21: el plan de una empresa trae solo SUS asignaciones…»; unit «R21: las asignaciones llegan en el orden del repositorio…» |
| R22 | `planes-service-lecturas.test.ts` > «R22 {catalogo\|detallePlan\|planDeEmpresa}: el rol %s de empresa recibe forbidden con cero llamadas…», «R22 detallePlan: un planId que no es uuid es validation_error…», «… no existe es not_found», «R22 planDeEmpresa: …» |
| R25 | lote de SL-24 en verde (unit `planes-service` 80 casos, `procesar-jobs-plan-cambio`, `planes.composition-root`, integración `plan*.test.ts`/`planes-*.test.ts`: 26 archivos, 370 tests) |

### Salida (tras los ajustes)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm exec eslint` de los archivos tocados: exit 0.
- `vitest run` de planes-service, planes-service-lecturas, mi-plan-service, mi-plan-repository, planes-lecturas-plataforma,
  plan-de-la-empresa y consumo contra `logistic_slt58`: 7 archivos y 167 tests en verde, 0 saltados, 0 fallidos.

## Guardias (corridas por los subagentes)
- `pnpm run test:guardias`: en rojo solo `tests/guards/migraciones-destructivas.guard.test.ts` (señala `20261028120000_modulo_wallet_nucleo`, de SL-23, que es de dev y ajena) y `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`. La segunda está en `tests/baseline-rojos.json`. La primera la retiró `dev` (c67d89a) y se arregla al sincronizar con `dev`; no se toca.
