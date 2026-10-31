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

## Decisiones del humano tras la tanda de diseño (2026-10-29)
Las cuatro filas están en `requirements.md > Decisiones cerradas` y los textos aprobados en la tabla de `design.md §6.5`.
1. **Un solo texto: «Cambio programado desde <fecha>».**
   - Sale de `textoCambioProgramado` (en `lib/planes/mensajes.ts`), que usan `ConsumoDelPlan` y `PlanDetalle`.
   - El rastro conserva «Rige desde» porque ahí describe otra cosa: el cambio de fecha dentro del historial.
   - Test: `PlanDetalle.test.tsx`, caso R16.
2. **Si no se puede leer el plan actual, no se deja confirmar.**
   - El modal muestra «No se pudo cargar el plan actual» y solo ofrece «Volver» y «Reintentar».
   - Tests en `PlanEmpresa.test.tsx`: sin botón de confirmar ni llamada a la action; «Reintentar» relee la página; «Volver» cierra.
3. **La primera asignación también se confirma en un modal.**
   - Texto: «Asignar <plan> a <empresa>: desde ahora tendrá:». Debajo van los topes, que salen de `lineasDeTopes` (con «sin límite» cuando no hay tope), los módulos incluidos y el aviso «El ciclo de órdenes empieza hoy.».
   - `page.tsx` pasa el nombre de la empresa en `empresaNombre`.
   - Tests: en `PlanEmpresa.test.tsx`, las líneas exactas, el caso sin módulos, «Volver» y confirmar. En `plataforma-empresa-detalle-page.test.tsx`, un caso nuevo.
   - Pendiente de que el humano apruebe dos textos: el título del modal («¿Asignar este plan a la empresa?») y la frase del aviso del ciclo.
4. **Textos aprobados:** «Con monto», «Programar cambio» y «Reintentar».
- **Salida:**
  - `PlanDetalle`, `plataforma-planes-page`, `MiPlanModule` y `ConsumoDelPlan`: 4 archivos y 53 tests en verde.
  - `PlanEmpresa`, `plataforma-empresa-detalle-page` y `ConsumoDelPlan`: 3 archivos y 59 tests en verde.
  - Typecheck y eslint en verde.

## Tanda C — T10 E2E (backend_dev) y T11 docs (backend_dev)

### T10 — E2E
- Nuevo: `e2e/planes-superadmin.spec.ts`, en serie y dentro del proyecto `aislamiento`. La empresa A del fixture hace de empresa demo. El flujo:
  1. el superadmin crea por pantalla un plan custom de A (50 órdenes y 3 mensajeros);
  2. se lo asigna a A desde el detalle de la empresa, pasando por el modal: «Volver» no asigna y confirmar sí;
  3. el maestro de A ve en `/mi-plan` el nombre del plan, «0 de 50 órdenes del ciclo», «1 de 3 Mensajero» y «1 Maestro · sin límite»;
  4. el maestro de B ve «sin límites» y en su HTML no aparece nada del plan de A;
  5. el mensajero de A recibe «No encontramos esta página».
- `playwright.config.ts`: solo se añade `"planes-superadmin"` en `aislamiento`.
- `e2e/superadmin-arranque.spec.ts` (es la dependencia `plataforma-vacia`): el menú esperado pasa de `["Empresas","Geografía"]` a `["Empresas","Planes","Geografía"]`, citando R23. Sin este cambio la dependencia fallaba.
- `e2e/dos-empresas-humo.spec.ts`: sin cambios. Saca las rutas del menú real y ya recorre `/mi-plan`, con estado 200 en A y en B.
- Salida, sobre la base desechable `logistic_slt58_e2e` (migrate deploy + db:seed) con `E2E_SERVIDOR=dev`:
  - `planes-superadmin.spec.ts`, corrida 1: 15 passed (1.0m), contando la dependencia. 0 failed, 0 skipped, 0 flaky.
  - Corrida 2 sobre la misma base: 15 passed (55.0s).
  - `dos-empresas-humo.spec.ts`: 18 passed (4.2m).
  - Guardia `e2e-sin-saltos`: 30/30. Typecheck y eslint en verde.
- **Queda abierto:** `/mi-plan` devuelve HTTP 200 (no 404) al mensajero, aunque pinta «No encontramos esta página». Lo más probable es que sea el `loading.tsx`, que hace que el streaming envíe la cabecera antes del `notFound()`. Se midió con `next dev`.
- Nota para `/afinar-regla`: la guardia `e2e-sin-saltos` lee las listas de `specs(...)` como texto, y un comentario con paréntesis o backticks dentro de la lista la rompe.

### T11 — Documentación
- `docs/architecture.md > Multi-empresa > Planes y límites`: nuevo párrafo «Pantallas de planes (SLT-58)». Solo se añadieron líneas. Cubre la función `plan_de_la_empresa`, que es la segunda y última que puede llamar `servi_app`; las rutas; y que las pantallas solo llaman a las actions de SL-24.
- R27: `git diff --stat $(git merge-base HEAD origin/dev) -- package.json pnpm-lock.yaml` no muestra nada.
- `pnpm run test:guardias`: 318 archivos pasan, 2 se saltan y 1 falla. El que falla es `dependencias-declaradas-presentes`, que está en el baseline.

## Mapa R<n> → test (consolidado)
| R | Test |
|---|---|
| R1 | `tests/unit/planes/consumo.test.ts` (precio); `tests/components/MiPlanModule.test.tsx`; `tests/unit/services/mi-plan-service.test.ts`; `tests/integration/db/mi-plan-repository.test.ts` |
| R2 | `tests/integration/db/plan-de-la-empresa.test.ts` (uso = `plan_uso_*`); `consumo.test.ts` (formatearConteo, filasDeConsumo) |
| R3 | `consumo.test.ts` (sin tope, filas) |
| R4 | `consumo.test.ts` (estadoDeLaFila: 79/99, 80/100, 99/100, 100/100, 101/100, 0/0, sin tope); `tests/components/ConsumoDelPlan.test.tsx` (estado sin depender del color) |
| R5 | `tests/unit/utils/ciclo-plan.test.ts` (inicioDelSiguienteCiclo); `consumo.test.ts` (reinicioDelCiclo); `ConsumoDelPlan.test.tsx` (bajo la fila de órdenes) |
| R6 | `plan-de-la-empresa.test.ts`; `mi-plan-service.test.ts`; `MiPlanModule.test.tsx`; `ConsumoDelPlan.test.tsx` (EmptyState) |
| R7 | `mi-plan-service.test.ts`; `mi-plan-repository.test.ts`; `MiPlanModule.test.tsx` |
| R8 | `mi-plan-service.test.ts` (siete roles y sin sesión, sin llamadas al repo); `tests/integration/mi-plan-page.test.tsx`; E2E (mensajero de A) |
| R9 | `plan-de-la-empresa.test.ts` (42501, sin avisos ni actor, permisos); `mi-plan-repository.test.ts`; E2E (B no ve nada de A) |
| R10 | `tests/unit/auth/menu-mi-plan.test.ts`; `tests/unit/auth/menu-visibility.test.ts` |
| R11 | `MiPlanModule.test.tsx` (sin botones, formularios ni enlaces) |
| R12 | `menu-mi-plan.test.ts` (módulos apagados); guardia `modulos-reparto` |
| R13 | `tests/unit/services/planes-service-lecturas.test.ts`; `tests/integration/db/planes-lecturas-plataforma.test.ts`; `tests/components/PlanesModule.test.tsx`; E2E (fila del catálogo) |
| R14 | `tests/components/PlanForm.test.tsx`; E2E (alta por pantalla) |
| R15 | `PlanForm.test.tsx`; `tests/components/PlanDetalle.test.tsx` |
| R16 | `planes-service-lecturas.test.ts`; `planes-lecturas-plataforma.test.ts`; `PlanDetalle.test.tsx` |
| R17 | `PlanDetalle.test.tsx` (confirmaciones, archivado sin controles, foco) |
| R18 | `PlanForm.test.tsx`; `PlanDetalle.test.tsx`; `tests/components/PlanEmpresa.test.tsx` |
| R19 | `planes-service-lecturas.test.ts`; `PlanEmpresa.test.tsx`; `tests/integration/plataforma-empresa-detalle-page.test.tsx`; E2E (bloque Plan) |
| R20 | `PlanEmpresa.test.tsx` (solo asignables, rechazo por tope, modales de confirmación); E2E (asignación con modal) |
| R21 | `planes-lecturas-plataforma.test.ts`; `PlanEmpresa.test.tsx` |
| R22 | `planes-service-lecturas.test.ts`; `tests/integration/plataforma-planes-page.test.tsx` |
| R23 | `menu-visibility.test.ts`; guardia `superadmin-fuera-de-empresa`; `destino-post-login.test.ts`; `e2e/superadmin-arranque.spec.ts` |
| R24 | guardia `superficie-de-uso` (ninguna `@sin-superficie` sobrevive a su motivo) |
| R25 | suite de SL-24 en verde (26 archivos, 370 tests), con la excepción mecánica que aprobó el humano en `planes-service.test.ts`; `plan-de-la-empresa.test.ts` (STABLE) |
| R26 | `plan-de-la-empresa.test.ts` (nombre en `pg_proc`; `down.sql` con ROLLBACK) |
| R27 | `git diff` de `package.json`/`pnpm-lock.yaml` contra el merge-base vacío (arriba) |
| R28 | `e2e/planes-superadmin.spec.ts` |

## Tanda D — enmienda del 2026-10-29 (T12–T18; R29–R42 y el 404 de R8)
Las preguntas P6–P15 están cerradas en `requirements.md > Decisiones cerradas`. tasks.md y design §11 todavía dicen en dos sitios que P14 y P15 están abiertas: es texto antiguo y se siguió la tabla.

### T12 — Migración `20261029150000_plan_ciclo_inicio_elegido` (backend_dev, dab08e3)
- El `up` solo añade:
  - la columna `organizacion.plan_ciclo_corto_desde_at` con su CHECK;
  - la función `plan_inicio_ciclo_en_curso(corto_desde, ancla, ahora)`, IMMUTABLE y con EXECUTE revocado;
  - un `CREATE OR REPLACE` de `plan_tope_ordenes`, `plan_cupo_ordenes` y `plan_de_la_empresa`. Esta última devuelve ahora `ciclo_corto_desde`.
- El `down.sql` restaura los cuerpos de origen copiados literalmente y después borra la envoltura, el CHECK y la columna.
- También cambia `db/schema.prisma`: el campo `planCicloCortoDesdeAt` y el comentario de `plan_asignado`.
- `migrate deploy` aplica la migración. `migrate dev` falla por el P3006 de la shadow DB, que ya está documentado en el repo; no se reseteó nada.
- Grep de `plan_inicio_ciclo(`: el único caller directo que quedaba era `PlanesRepository.usoDe`, y T14 lo pasó a la envoltura.
- Tests:
  - `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts` (R41): `pg_get_functiondef` coincide con el de origen tras el down, el uso es el mismo antes, durante y después, el CHECK se cumple y el UPDATE de `servi_app` da 42501.
  - `plan-de-la-empresa.test.ts` (de SLT-58) compara ahora con la envoltura.
- Salida: los 2 archivos dan 16/16. La suite de planes de SL-24 y SLT-58 da 24 archivos y 308 tests en verde, sin haber tocado los tests de SL-24.

### T13 — Gemela TS del ciclo (backend_dev, 29e1b2d)
- En `lib/planes/ciclo.ts`:
  - funciones nuevas `inicioDelCicloEnCurso(ancla, cortoDesde, ahora)`, `rangoDelInicioDelCiclo(ahora)` y `anclaDeLaFechaElegida(fecha, ahora)`;
  - corrección de `inicioDelSiguienteCiclo`: si `ahora` es anterior al ancla, devuelve el ancla. El caso de T2 que fijaba «ancla + 1 mes» se cambió a propósito, citando R40.
- La tabla compartida está en `tests/integration/db/_fixtures/ciclo-corto.ts` (16 filas).
- Tests: `ciclo-plan.test.ts` (R30 rango, R32 ancla, R35 tabla) y `tests/integration/db/plan-ciclo-corto.test.ts` (R34, y R35 con TS y la base dando el mismo «en curso» y el mismo «siguiente»).
- Salida: 7 archivos y 244 tests en verde; los consumidores dan 4 archivos y 67 tests en verde.

### T14 — Asignar con fecha y vista previa (backend_dev, 575739a)
- Cambios en `lib/`:
  - `lib/types/planes.ts`: `asignarPlanSchema` con `inicioCiclo`, más `previsualizarAsignacionSchema` y `VistaPreviaAsignacionResult`.
  - `PlanesService`: `asignar` comprueba R30 antes de leer y R31 antes del repositorio; nuevo `previsualizarAsignacion`.
  - `PlanesRepository`:
    - `usoDe` pasa por la envoltura y acepta un ciclo candidato.
    - En `asignar`, la carrera de R31 se resuelve bajo cerrojo. Con fecha, los topes ya pasados se avisan en vez de rechazar. Guarda `plan_ciclo_corto_desde_at`, y `valorNuevo` lleva la fecha.
    - Nuevo `vistaPreviaAsignacion`.
  - `MiPlanRepository`: lee `ciclo_corto_desde`.
  - `mensajes.ts`: textos de §6.5 (`ordenesYaPasadas`, `rolYaPasado` y `apiKeysYaPasadas`, aprobados en P15).
  - Acción nueva `previsualizarAsignacionPlanAction`, y el `motivo` de `excepciones-aislamiento.ts` ampliado.
- R25, excepción escrita: en `tests/unit/services/planes-service.test.ts` solo se añadió el `vi.fn` de `vistaPreviaAsignacion` (+1 línea). `planes-asignacion.test.ts` de SL-24 sigue verde sin tocarlo: sin fecha, R12 todavía rechaza (P14).
- Tests: `tests/unit/services/planes-service-inicio-ciclo.test.ts` (28 casos) y `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (11 casos).
- Salida: la suite de planes da 30 archivos y 470 tests en verde. Las guardias `superficie-de-uso` y `sql-a-mano-por-empresa` están en verde.

### T15 — Modal de primera asignación (frontend_dev, 6aa778f)
- El modal añade el campo «Inicio del ciclo de órdenes», con hoy por defecto y el `min`/`max` que calcula el servidor.
- La vista previa se lee al abrir y al cambiar la fecha, y se descartan las respuestas viejas. Hay un aviso por cada tope ya pasado.
- La frase pasa a ser «El ciclo de órdenes empieza el {fecha}.».
- El botón de confirmar está deshabilitado mientras la vista previa está en vuelo. Si la lectura falla (P11), solo quedan «Reintentar» y «Volver».
- Si el servidor rechaza la fecha, el error sale junto al campo. «Cambiar plan» no lleva campo ni envía `inicioCiclo`.
- En `lib/actions/planes.ts` se quitó el `@sin-superficie` de la acción de vista previa.
- Decisiones de implementación que conviene revisar:
  - un rechazo de la vista previa (`forbidden`, `not_found`, `archivado` o `custom`) se trata como lectura fallida y añade el texto del rechazo;
  - con el campo vacío no se pide la vista previa: se muestra el texto del rango.
- Salida: `PlanEmpresa` y `plataforma-empresa-detalle-page` dan 67/67, y la guardia `superficie-de-uso` 18/18.

### T16 — «Se reinicia» durante el ciclo corto (frontend_dev, b8c8fbf)
- No hubo que tocar código: `reinicioDelCiclo` ya usaba `inicioDelSiguienteCiclo`, que corrigió T13. Solo se añadieron tests:
  - `consumo.test.ts`: con ancla el 5 de noviembre, a partir del 29 de octubre sale «7 días (2026-11-05)»; también los casos de 1 ms antes, el ancla exacta y el día siguiente.
  - `MiPlanModule.test.tsx`: «Se reinicia en 7 días (2026-11-05)».
- Salida: 5 archivos y 123 tests en verde.

### T17 — R8: 404 HTTP real en `/mi-plan` (frontend_dev, 1be2d05)
- Se borró `app/(app)/mi-plan/loading.tsx`, y con él su test y el texto `cargando`. Era el que hacía que el streaming enviara un 200 antes del `notFound()`. La autorización sigue en el servicio.
- El hallazgo de diseño «loading de /mi-plan» queda revertido a propósito por R8; el skeleton de «Planes» se mantiene.
- El E2E ahora exige `status() === 404` para el mensajero de A. Con `next dev` y con `next start` midió 404.
- Salida:
  - `planes-superadmin` con dev: 15 passed.
  - `planes-superadmin` con start: 15 passed.
  - Humo: 18 passed.
  - vitest: 5 archivos y 71 tests en verde.

### T18 — Documentación y E2E de la enmienda (backend_dev)
- `docs/architecture.md`: el párrafo de SLT-58 ahora dice `plan_inicio_ciclo_en_curso` en lugar de `plan_inicio_ciclo`, y lleva un sub-bullet nuevo, «Inicio del ciclo elegido». Explica el rango ±1 mes, el ciclo corto con `plan_ciclo_corto_desde_at`, que la asignación sigue adelante y avisa cuando hay topes pasados, y que `plan_inicio_ciclo_en_curso` es la única definición del ciclo en curso, con `inicioDelCicloEnCurso` como gemela en TS.
- `e2e/planes-superadmin.spec.ts` (+25/−4). En la primera asignación ahora comprueba que la fecha por defecto es hoy, que sale «El ciclo de órdenes empieza el {hoy}.», que el botón espera a la vista previa, que no aparecen avisos de tope y, en la base, que hay ancla y `plan_ciclo_corto_desde_at` queda NULL. Sigue exigiendo un 404 para el mensajero.
- Salida sobre `logistic_slt58_e2e` recreada (`E2E_SERVIDOR=dev`):
  - `planes-superadmin`, corrida 1: 15 passed.
  - Corrida 2: 1 failed, 11 passed, 3 sin correr. El superadmin recibió un 404 en el primer GET a `/plataforma/empresas/<A>`, antes de llegar al modal, y el log no trae ningún error. No se pudo explicar.
  - Corridas 3, 4 y 5, seguidas: 15 passed cada una.
  - Ninguna corrida tuvo tests flaky ni saltados.
  - Humo: 1 failed, 6 sin correr, 11 passed. Falló `/wallet` con un 500 por `Transaction API error: Unable to start a transaction in the given time` mientras la máquina estaba cargada (las corridas tardaban entre 3 y 4 veces lo normal). SLT-58 no toca esa pantalla. Con T17 (1be2d05) el humo había dado 18 passed.
- Guardia `e2e-sin-saltos` 30/30. ESLint del spec sin problemas. Typecheck (`tsc --noEmit`) con exit 0, corrido por el implementer.
- R27: `git diff --stat $(git merge-base HEAD origin/dev) -- package.json pnpm-lock.yaml` sale vacío.

## Mapa R29–R42 y R8 → test (enmienda)
| R | Test |
|---|---|
| R8 (404) | `e2e/planes-superadmin.spec.ts`: el mensajero de A recibe `status() === 404`. `tests/integration/mi-plan-page.test.tsx` |
| R29 | `tests/unit/services/planes-service-inicio-ciclo.test.ts` (sin fecha, con hoy, otra fecha); `tests/components/PlanEmpresa.test.tsx` (hoy por defecto, la fecha se envía); `plataforma-empresa-detalle-page.test.tsx` (rango y action); E2E |
| R30 | `planes-service-inicio-ciclo.test.ts` (bordes ±1 mes con reloj fijo y sin llamadas); `tests/unit/utils/ciclo-plan.test.ts` (rangoDelInicioDelCiclo, 31 de marzo y año bisiesto); `PlanEmpresa.test.tsx` (error junto al campo) |
| R31 | `planes-service-inicio-ciclo.test.ts`; `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (carrera bajo cerrojo); `PlanEmpresa.test.tsx` («Cambiar plan» sin fecha) |
| R32 | `planes-asignacion-inicio-ciclo.test.ts` (ancla hoy, pasada y futura); `ciclo-plan.test.ts` (anclaDeLaFechaElegida) |
| R33 | `planes-asignacion-inicio-ciclo.test.ts` (cupo, «Mi plan», detalle y trigger cuentan lo mismo) |
| R34 | `planes-asignacion-inicio-ciclo.test.ts`; `tests/integration/db/plan-ciclo-corto.test.ts`; CHECK en `migracion-ciclo-elegido-ida-y-vuelta.test.ts` |
| R35 | `plan-ciclo-corto.test.ts` y `ciclo-plan.test.ts` sobre la tabla compartida `_fixtures/ciclo-corto.ts` (TS = base) |
| R36 | `planes-asignacion-inicio-ciclo.test.ts` (aviso, bloqueo y desbloqueo de órdenes); `planes-service-inicio-ciclo.test.ts`; `PlanEmpresa.test.tsx` (avisos tras el ok) |
| R37 | `planes-service-inicio-ciclo.test.ts` (forbidden por rol sin llamadas, vista previa); `planes-asignacion-inicio-ciclo.test.ts` (vista previa = asignación, no escribe); `PlanEmpresa.test.tsx` (avisos, releer, lectura fallida) |
| R38 | `PlanEmpresa.test.tsx` (título y frase con la fecha); E2E |
| R39 | `planes-asignacion-inicio-ciclo.test.ts` (`valor_nuevo` = fecha; NULL en un cambio posterior) |
| R40 | `tests/unit/planes/consumo.test.ts` («7 días (2026-11-05)»); `tests/components/MiPlanModule.test.tsx`; `plan-de-la-empresa.test.ts` (`ciclo_corto_desde`) |
| R41 | `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts` |
| R42 | `planes-asignacion-inicio-ciclo.test.ts` (adminTienda y API keys: bloqueo y desbloqueo; sin fecha y con cambio a uno menor sigue rechazando); `planes-service-inicio-ciclo.test.ts` |
