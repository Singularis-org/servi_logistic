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

## Tanda B (frontend_dev) — T6, T7, T8, T9

### T6 — Menú (commit bec1e65)
- Archivos con choque aceptado (solo se añaden líneas):
  - `lib/auth/menu-visibility.ts`: +24 / −1. Lo único que se quita es el `;` final de la unión `IconKey`.
  - `app/(app)/_components/Sidebar.tsx`: +7 / −0.
  - `tests/unit/auth/menu-visibility.test.ts`: +7 / −2. Se ajustaron los literales de maestro y admin (R10), superadmin `[Empresas, Planes, Geografía]` y `slice(-5)` (R23).
- Nuevo: `tests/unit/auth/menu-mi-plan.test.ts`.
- Ajustados porque sus literales cambian con los ítems nuevos (cada uno cita SLT-58 R10/R23):
  - `menu-historial-acciones.test.ts`
  - `superadmin-fuera-de-empresa.guardia.test.ts`, que añade `/plataforma/planes` a su lista cerrada
  - `pwa-manifiesto-atajos.guardia.test.ts`, con los recuentos 23→24, 14→15 y 2→3
  - `Sidebar.test.tsx`, que añade los iconos `gaugeCircle` y `layers`
- R → test:
  - R10: `menu-mi-plan.test.ts` (siete roles, identidad de `ROLES_MI_PLAN`, posición tras «Histórico», `primerDestino` de cada rol escrito a mano) y las listas de `menu-visibility.test.ts`.
  - R12: `menu-mi-plan.test.ts` (con todos los módulos apagados, el ítem sigue) y la guardia `modulos-reparto` tras T5.
  - R23: `menu-visibility.test.ts` (superadmin), `superadmin-fuera-de-empresa` y `destino-post-login.test.ts`.
- Salida: 8 archivos de menú corridos, 185 tests en verde y 1 rojo. El rojo es `modulos-reparto` por `/mi-plan`, esperado hasta T5. Typecheck y eslint en verde.

### T7 — `ConsumoDelPlan` y «Mi plan» (commit a116f33)
- Nuevos: `components/shared/ConsumoDelPlan.tsx` (solo props: `plan`, `textoSinPlan`, `nivelDeTitulo?`), `app/(app)/mi-plan/page.tsx` (`notFound()` si el resultado no es `ok`), `app/(app)/mi-plan/_components/MiPlanModule.tsx`, `tests/components/MiPlanModule.test.tsx`, `tests/integration/mi-plan-page.test.tsx`.
- Texto que no fija el design: «Ninguno» cuando el plan no incluye módulos (está en `TEXTOS` del componente).
- R → test:
  - R1, R6, R7, R11: `MiPlanModule.test.tsx`; R11 sin botones, formularios, enlaces ni campos.
  - R8: `mi-plan-page.test.tsx`. Cinco roles y sin sesión → «no encontrado» sin leer la base; maestro y admin ven la pantalla. La cadena página → `verMiPlan` → `MiPlanService` es real.
- Salida: 2 archivos, 16 tests en verde; eslint en verde.

### T8 — «Planes» del superadmin (commit 092ad99)
- Nuevos: `app/(app)/plataforma/planes/page.tsx`, `_components/PlanesModule.tsx`, `_components/PlanForm.tsx`, `_components/plan-vista.ts` (ayudantes puros; no estaba en la lista de archivos), `[planId]/page.tsx`, `[planId]/_components/PlanDetalle.tsx`, y 4 archivos de test.
- Decisiones a confirmar:
  - El catálogo resume en una línea los roles sin tope; el detalle lista todos los topes.
  - Los mensajes de éxito y de rechazo van en línea, no como toast.
- R → test:
  - R13: `PlanesModule.test.tsx`.
  - R14: `PlanForm.test.tsx` (solo «Público»/«Custom»; lo enviado exacto).
  - R15: `PlanForm.test.tsx` (inmediato / fecha) y `PlanDetalle.test.tsx` (avisos).
  - R16: `PlanDetalle.test.tsx`.
  - R17: `PlanDetalle.test.tsx` (confirmaciones; un plan archivado no muestra controles).
  - R18: `PlanForm.test.tsx` y `PlanDetalle.test.tsx`.
  - R22: `plataforma-planes-page.test.tsx` (seis roles y sin sesión → «no encontrado» en las dos páginas sin lecturas; uuid inválido o plan inexistente → «no encontrado»).
- Salida: 4 archivos, 51 tests en verde; typecheck y eslint en verde.

### T9 — Plan en el detalle de la empresa (commit 4fcfff2)
- Nuevo: `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` y `tests/components/PlanEmpresa.test.tsx`.
- Modificados:
  - `[organizacionId]/page.tsx`: lee módulos, plan y asignables en paralelo; cada lectura aísla su fallo.
  - `tests/integration/plataforma-empresa-detalle-page.test.tsx`: 6 casos nuevos; los existentes, intactos.
- Decisiones a confirmar:
  - El selector oculta el plan actual.
  - Tras `ok` hace `router.refresh()` y muestra «Plan asignado.».
  - Las fechas del historial van en hora de la plataforma.
- R → test:
  - R18: `PlanEmpresa.test.tsx` (rechazos, `validation_error` junto al selector, la action lanza).
  - R19: `PlanEmpresa.test.tsx` y `plataforma-empresa-detalle-page.test.tsx`. Incluye «si la lectura del plan o de los asignables falla, los módulos se pintan igual».
  - R20: `PlanEmpresa.test.tsx` (solo asignables, rechazo por tope con su mensaje).
  - R21: `PlanEmpresa.test.tsx` (del más reciente al más antiguo; sin asignaciones).
- Salida: 2 archivos, 33 tests en verde; eslint en verde.

### T5 — Rutas en el reparto y fin de `@sin-superficie` (backend_dev, después de T7–T9)
- `lib/modulos/reparto.ts` (choque aceptado): +4 / −0. Se añaden `/plataforma/planes`, `/plataforma/planes/[planId]` y `/mi-plan` como `"nucleo"`, después de `/plataforma/empresas/[organizacionId]`.
- `lib/actions/planes.ts`: se quitan las seis `@sin-superficie` y la cabecera se actualiza. Cada action tiene al menos un llamador en `app/`.
- R12 y R24: guardias `modulos-reparto` y `superficie-de-uso` en verde.
- Salida:
  - `pnpm run test:guardias`: 318 archivos pasan, 2 se saltan y 1 falla. El que falla es `dependencias-declaradas-presentes` (4 tests), que está en el baseline.
  - Las dos guardias y los tests que importan `reparto.ts` (`procesar-jobs-modulos`, `procesar-jobs-plan-cambio`, `catalogo`): 6 archivos, 122 tests en verde.
  - Typecheck y eslint en verde.
- Nota: el `menu-modulos.test.ts` que cita T6 no existe en el repo; R12 lo cubren `menu-mi-plan.test.ts` y la guardia `modulos-reparto`.

## Tanda de diseño (antes de la tanda C) — 28 hallazgos de `progress/design_SLT-58.md`
El humano decidió corregir los 28 hallazgos y que «Cambiar plan» pida confirmación con resumen (`requirements.md > Decisiones cerradas`). Cuatro frontend_dev trabajaron en paralelo, cada uno sobre sus propios archivos. Cada hallazgo está marcado RESUELTO en `design_SLT-58.md`, junto a su test.
- **A** (consumo y «Mi plan»): `components/shared/ConsumoDelPlan.tsx`, `app/(app)/mi-plan/loading.tsx` (nuevo), `MiPlanModule.tsx`, `tests/components/ConsumoDelPlan.test.tsx` (nuevo) y `MiPlanModule.test.tsx`.
- **B** (catálogo y formulario): `plataforma/planes/page.tsx`, `loading.tsx` y `[planId]/loading.tsx` (nuevos), `PlanesModule.tsx`, `PlanForm.tsx`, `plan-vista.ts` y sus tests (`PlanesModule`, `PlanForm`, `plataforma-planes-page`).
- **C** (detalle del plan): `PlanDetalle.tsx` y `PlanDetalle.test.tsx`; este último se ajustó además a los textos nuevos de B.
- **D** (plan de la empresa): `PlanEmpresa.tsx`, `[organizacionId]/page.tsx` (`leerPlanActual`: toma el plan de los asignables o, si está archivado, lo lee con `verDetalleDePlan`, sin romper la página si falla), `PlanEmpresa.test.tsx` y `plataforma-empresa-detalle-page.test.tsx`.
- Deuda nueva: D30 (pasar las tablas a `DataTable`).
- Pendiente de confirmar por el humano:
  - Textos nuevos que no están en §6.5: «Con monto», «Programar cambio», «Reintentar» y «Rige desde <fecha>» en el detalle del plan.
  - Cuando no se puede leer el plan actual, el modal lo avisa y deja confirmar igualmente.
  - «Asignar plan» sin plan previo se aplica sin modal, porque no hay nada con qué compararlo.
- Salida final: `vitest run` de los 9 archivos de test de las pantallas (ConsumoDelPlan, MiPlanModule, mi-plan-page, PlanesModule, PlanForm, plataforma-planes-page, PlanDetalle, PlanEmpresa, plataforma-empresa-detalle-page) da 9 archivos y 138 tests en verde. `tsc --noEmit` y eslint en verde.
