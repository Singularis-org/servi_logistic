# Review SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan»

- Fecha: 2026-11-10 · Rama `feature/SLT-99-planes-vista-empresa-cambiar-plan` · último commit revisado `e0634491`
- Diff: `git diff origin/dev...HEAD` (47 archivos). Ruta completa (toca el cobro).
- MCP del grafo: no se usó; revisión con Grep/Read y ejecución.

## Veredicto: RECHAZADO

Un hallazgo mayor de código (M1, seguridad/decisión) y uno de proceso (M2, sin evidencia de la
integración con base ni del E2E). El resto del código cumple el spec y las decisiones.

## Checklist

- [x] Trazabilidad R1–R23 → test: todos los archivos existen y los casos verifican lo que dicen (tabla abajo).
- [ ] Tasks: **T8.1 y T8.2 sin marcar** (E2E sin correr; `./init.sh` completo sin constancia tras subir el cupo).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 42/40 archivos, 3839/1000 líneas, con `tamano-pr-aceptado` en la ficha (2026-11-09, ampliada el 2026-11-10).
- [x] `design.md > ## Lo que ya existe` presente y respetada: reutiliza `escribirPendiente`, `cancelarPendienteDeEmpresaEnTx`, `fechaDeEfectoPorDefecto`, `primerPeriodoDelCambio`, `publicos()`, `ConsumoDelPlan`; sin tabla ni trabajo nuevos.
- [x] Typecheck: `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` sin errores.
- [x] Lint de los `.ts/.tsx` del diff: sin salida.
- [x] Tests sin base (13 archivos: servicio, `planes-vista`, `proximo-periodo-de-cobro`, `mi-plan-service`, los 6 de componentes, `mi-plan-page`, las 2 guardias de planes): `13 passed`, `183 passed`.
- [x] `pnpm test:guardias`: `1 failed | 339 passed`, 4 rojos = baseline `dependencias-declaradas-presentes` (en `tests/baseline-rojos.json`).
- [ ] Integración con base (`tests/integration/db/mi-plan-cambiar-plan.test.ts`, 9 casos: R2, R10–R18) y E2E (`e2e/mi-plan-cambiar-plan.spec.ts` + 4 ajustados): **no corridos en ningún sitio todavía** (M2).
- [x] Merge con `origin/dev`: `git merge-tree --write-tree HEAD origin/dev` limpio (exit 0). La rama no trae migraciones; `dev` trae dos (`bug_report*`) sin choque.
- [x] Sin dependencias nuevas (`package.json` intacto; guardia de dependencias aprobadas en verde).
- [x] Sin literales de país/moneda nuevos, sin tablas ni queries de negocio sin empresa: el repositorio corre en `comoPlataforma` con excepción documentada en `lib/db/excepciones-aislamiento.ts` y la empresa sale siempre de `actor.organizacionId`.

## Decisiones y design (punto 2 del encargo)

| Decisión | Código | Estado |
|---|---|---|
| Rige al inicio del próximo período de cobro de la empresa | `PlanesRepository.cambiarPlanPorLaEmpresa` usa `fechaDeEfectoPorDefecto(tipo vigente, ahora)` bajo `bloquearEmpresa`; el servicio usa la misma función para la pantalla | OK |
| Sin prorrateo | Corte = inicio de período de calendario; integración R14 compara con `montoDelPeriodo` | OK (pendiente de CI) |
| Rechazo por rol al bajar (P4) | `excedidosDe(tx, [empresa], plan.topes)` antes de escribir, sin escribir aunque la fecha sea futura | OK |
| Cancelar/reemplazar pendiente, también del superadmin (P3) | `escribirPendiente` reemplaza sin historial; cancelar firma el maestro | OK |
| Empresa sin plan no elige (P5) | `sin_plan` en el repositorio; `onCambiar` solo con `puedeCambiar` | OK |
| Empresa sin plan no cancela la primera asignación (2026-11-10) | Solo en la UI; **el servicio la deja cancelar** | **M1** |
| Custom → público con aviso (P6) | `activoEsCustom` → `TEXTOS_CAMBIO.dejasCustom` en la confirmación | OK |
| «Contáctanos» deshabilitado con «Próximamente» (P7) | `CarruselDePlanes` sin `onContactar` | OK |
| `ConsumoDelPlan` debajo (P8) | `MiPlanModule.tsx:35`, sin cambios en el componente | OK |
| «Activo desde» como «1 sep 2026» | `DetalleDePlan` con `fechaCortaEnZona` | OK |

## Seguridad (punto 3)

- Autorización en el servicio: `esMaestroConEmpresa` (`ROLES_MI_PLAN` y empresa no vacía) antes de zod y del repositorio en los tres métodos; test con espía sin llamadas por rol, superadmin, `null` y maestro sin empresa. OK.
- Entrada estricta: `planIdSchema` y `z.object({}).strict()`; `organizacionId` del cliente → `validation_error`. OK.
- Aislamiento A/B: caso de integración «R2: … no tocan nada de B». OK en el código; pendiente de CI.
- Página: `forbidden` en cualquiera de las dos lecturas → `notFound()`. OK.

## Componentes compartidos (punto 4)

`components/shared/planes/{CarruselDePlanes,DetalleDePlan,IconoDelModulo,planes-vista}` no importan de `lib/actions|services|repositories|auth|db`, `next/headers` ni `app/`, ni reciben `organizacionId`; la guardia `planes-compartidos-sin-empresa` lo comprueba en las dos direcciones. El carrusel monta `CarruselCards`, que envuelve `components/ui/carousel.tsx`. Montados sin activo ni acciones: probado (R9). Reutilizables por SLT-116 «Planes: página pública de planes para elegir en la inscripción».

## E2E (punto 5)

- `e2e/mi-plan-cambiar-plan.spec.ts` en el proyecto `aislamiento` (`playwright.config.ts`), que está en la matriz `grupo: [aislamiento, reparto, dinero]` de `gate.yml`. Sin `skip`/`only`/`fixme`/`waitForTimeout`. Recorre R22 completo y comprueba la base (plan activo intacto, pendiente con tipo vigente, cancelado a `null`); archiva sus planes en `afterAll`.
- Los 4 ajustados (`planes-superadmin`, `planes-costeo`, `planes-costo-porcentual`, `cierre-modelo-nuevo-plan-porcentual`) solo acotan el `heading` del plan a `region "Plan activo"`: siguen probando lo mismo.

## Tabla R → test

| R | Test | Verificado aquí |
|---|---|---|
| R1 | `tests/unit/services/mi-plan-cambio-service.test.ts` «R1 — solo el maestro…»; `tests/integration/mi-plan-page.test.tsx` «SLT-99 R1…» | corrido, verde |
| R2 | `mi-plan-cambio-service.test.ts` «R2 — …entrada estricta»; `tests/integration/db/mi-plan-cambiar-plan.test.ts` «R2: … no tocan nada de B» | unit verde; integración sin correr |
| R3 | `tests/components/MiPlanModule.test.tsx` «SLT-99 R3…»; E2E | componente verde |
| R4 | `tests/unit/planes/planes-vista.test.ts` «R4…» | verde |
| R5 | `tests/components/CarruselDePlanes.test.tsx` «R5…»; `mi-plan-cambio-service.test.ts` (filtro) | verde |
| R6 | `planes-vista.test.ts` «R6 (P1, P10)…»; `CarruselDePlanes.test.tsx` «R6…» | verde |
| R7 | `CarruselDePlanes.test.tsx` «P7: …Próximamente», «con un custom activo…» | verde |
| R8 | `tests/components/DetalleDePlan.test.tsx` «R8…»; `tests/components/MiPlanCambioDePlan.test.tsx` «R8 — Activo desde»; `tests/unit/services/mi-plan-service.test.ts` | verde |
| R9 | `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`; `CarruselDePlanes`/`DetalleDePlan` «R9 — montado sin empresa» | verde |
| R10 | `tests/unit/planes/proximo-periodo-de-cobro.test.ts`; integración «R10, R11, R14…» | unit verde; integración sin correr |
| R11 | integración «R10, R11, R14…» (sin `wallet_movimiento` ni `cobro_plataforma_movimiento`) | sin correr |
| R12 | integración «R12: …»; `mi-plan-cambio-service.test.ts` «esPlanDisponible» | unit verde; integración sin correr |
| R13 | integración «R13: …»; `planes-vista.test.ts` «R13 (P4)»; `DetalleDePlan.test.tsx` «R13 — el aviso previo» | unit/componente verde; integración sin correr |
| R14 | integración «R10, R11, R14…» (cuatro tipos, `montoDelPeriodo`, tope pasado entre medias) | sin correr |
| R15 | integración «R15: …» | sin correr |
| R16 | integración «R16: …»; `MiPlanCambioDePlan.test.tsx` «Cancelar cambio pide confirmación»; servicio «R16: sin pendiente» | unit/componente verde; integración sin correr |
| R17 | integración «R17 (P3): …»; `MiPlanCambioDePlan.test.tsx` | componente verde; integración sin correr |
| R18 | integración «R18: …»; `MiPlanCambioDePlan.test.tsx` «R18 (P5)»; servicio «R18 (P5)» | unit/componente verde; integración sin correr |
| R19 | `MiPlanCambioDePlan.test.tsx` «R19…» (con y sin aviso de custom); servicio «R19: el primer período…» | verde |
| R20 | `MiPlanCambioDePlan.test.tsx` «R20…» (los cuatro rechazos) | verde |
| R21 | `MiPlanModule.test.tsx` «R21 (P8)»; `ConsumoDelPlanPeriodo.test.tsx`; `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`; 4 E2E ajustados | unit/guardia verde; E2E sin correr |
| R22 | `e2e/mi-plan-cambiar-plan.spec.ts` (2 casos) | sin correr |
| R23 | `tests/guards/guard-dependencias-aprobadas.test.ts` | verde (guardias) |

R sin test: ninguno.

## Hallazgos

### M1 · mayor · el maestro sin plan puede cancelar la primera asignación pendiente llamando a la action
- `lib/repositories/PlanesRepository.ts:1659-1670` (`cancelarCambioPorLaEmpresa`) solo mira `plan_cambio_id`; no rechaza cuando `plan_id` es `null`. `lib/services/MiPlanCambioService.ts:112-117` tampoco. La primera asignación pendiente de SLT-86 vive en las mismas columnas `plan_cambio_*` (comentario en `PlanesRepository.ts:833`), así que `cancelarCambioMiPlanAction({})` de un maestro sin plan la borra y escribe `plan_cambio_empresa_cancelado`.
- Contradice la decisión del 2026-11-10 («Primera asignación pendiente sin plan: el maestro no la cancela») y la regla de autorizar en el servicio, no en la UI (la UI solo esconde el botón: `MiPlanModule.tsx:33`).
- Arreglo: en `cancelarCambioPorLaEmpresa`, bajo el cerrojo, si `empresa.plan_id === null` devolver `sin_plan` (o `sin_cambio_programado`, lo que fije el leader con el humano) sin escribir; añadir el estado al tipo `CancelarCambioMiPlanResult` y su texto en `CambioDePlan.tsx` si hace falta. Test: caso en `tests/integration/db/mi-plan-cambiar-plan.test.ts` (empresa sin plan con primera asignación pendiente → rechazo, columnas y historial intactos) y, si el estado se decide en el servicio, uno en `mi-plan-cambio-service.test.ts`.

### M2 · mayor (proceso) · sin evidencia de la integración con base ni de los E2E
- `docs/perfil-agentes.md > reviewer`: «Bloqueante: PR que toca `db/`, pantallas o dinero sin constancia de los E2E afectados corridos en local». Este diff toca una pantalla y el cobro. Los 9 casos de `tests/integration/db/mi-plan-cambiar-plan.test.ts` (la única verificación de R2-aislamiento, R11, R14, R15) y los 5 E2E (el nuevo y los 4 ajustados) no se han corrido ni en local ni en CI. T8.1 y T8.2 siguen `[ ]` en `tasks.md`.
- Arreglo (sin código): correrlos en local contra base desechable, o el gate por `workflow_dispatch` sobre la rama (incluye E2E), dejar la salida en `progress/impl_SLT-99.md` y marcar T8.1/T8.2. Si el humano ya decidió que esta constancia la da el CI del PR (memoria «Gate en CI, no local»), el leader lo anota en la ficha y M2 queda cerrado con el verde de `gate-completo` + E2E antes del merge.

### m1 · menor · pedir el plan activo custom (o archivado) no cancela el pendiente
- `PlanesRepository.ts:1640-1646`: `esPlanDisponible` se evalúa antes de `empresa.plan_id === plan.id`, así que si el activo es custom o quedó archivado/sin costo, pedirlo devuelve `no_disponible` en vez de cancelar el pendiente (R15 «CUANDO pide su plan activo, DEBE cancelar»). La UI no lo ofrece (el detalle del activo no tiene «Cambiar a») y «Cancelar cambio» cubre el caso; solo afecta a llamadas directas. Arreglo: mirar «es su plan activo» antes de la disponibilidad, o dejar constancia del desvío en el design.

### m2 · menor · componente compartido dependiente de un módulo de WhatsApp
- `components/shared/planes/DetalleDePlan.tsx:21` importa `fechaCortaEnZona` de `lib/whatsapp-envios/informes/formato.ts`. Es puro (solo `lib/utils/calendario-zona`) y no rompe R9, pero ata un componente reutilizable por SLT-116 a un módulo de dominio ajeno. Arreglo: mover el formateador a `lib/utils/` (o reexportarlo desde allí) en una ficha de deuda.

### m3 · menor · `lib/types/planes.ts:4` importa un tipo de `components/shared/tipo-cobro`
- Dirección `lib → components` (solo tipo; hay precedentes en `lib/types/gestion-resultado.ts`). Arreglo: mover `PrimerPeriodo` a `lib/types/` cuando se toque `tipo-cobro.ts`.

## Vuelta 1: resumen
- Mayores: 2 (M1 código; M2 proceso).
- Menores: 3.
- R sin test: ninguno.

## Correcciones (2026-11-10, implementer, tras la decisión del humano en la ficha)

| Hallazgo | Arreglo | Commit |
|---|---|---|
| M1 | `cancelarCambioPorLaEmpresa` devuelve `sin_plan` bajo el cerrojo si `plan_id` es `null`, sin escribir; `sin_plan` añadido a `ResultadoCancelarDelMaestro` y `CancelarCambioMiPlanResult`; `PendienteDelPlan` muestra su texto. Tests: integración «R18 (P5, decisión 2026-11-10): sin plan, el maestro no cancela la primera asignación pendiente» y servicio «R18 (P5, decisión 2026-11-10)…». | `d7ae12b7` |
| m1 | `cambiarPlanPorLaEmpresa` mira «es su plan activo» antes de leer y validar la disponibilidad: con pendiente lo cancela por `cancelarPendienteDeEmpresaEnTx` (mismo camino que «Cancelar cambio»), también si el activo es custom o archivado. Tests: integración «m1 (decisión 2026-11-10): … su plan activo custom lo cancela» y servicio «m1 (decisión 2026-11-10)…». | `d7ae12b7` |
| m2 | `fechaCortaEnZona` vive en `lib/utils/fecha-corta.ts`; `lib/whatsapp-envios/informes/formato.ts` lo reexporta (sin duplicar). `DetalleDePlan` y el E2E lo importan del módulo neutral. | `dd7355fd` |
| m3 | `PrimerPeriodo` se define en `lib/types/planes.ts`; `components/shared/tipo-cobro.ts`, `MiPlanCambioService` y `CambioDePlan` lo importan de ahí. | `fe453ac2` |
| M2 | Sin código: por decisión del humano lo cierra el CI del PR a `dev` (`gate-completo` + `e2e` en verde antes del merge). | — |

Verificación: typecheck sin errores; eslint de los 12 archivos tocados sin salida; tests tocados y directos (servicio, 6 de componentes/página, cron, repositorio tipo-cobro, plantilla de correo, picking, 4 guardias de planes/historial) en lotes ≤5: 74 + 68 + 163 + 8 en verde; `pnpm test:guardias`: `1 failed | 339 passed`, 4 rojos = baseline `dependencias-declaradas-presentes`. La integración con base (2 casos nuevos) queda para el CI (M2). `vitest related` sobre estos archivos arrastra casi la suite (timeout a los 560 s), por eso se corrieron los importadores directos.
