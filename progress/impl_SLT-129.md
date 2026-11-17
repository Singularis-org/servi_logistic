# impl SLT-129 — planes-borrador-servidor

## Tanda T1 + T2 (backend_dev, 2026-11-17)

**Archivos**
- Producción: `db/schema.prisma` (modelo `PlanBorrador`, `Plan.borradorDeCambio`),
  `db/migrations/20261117120000_plan_borrador/{migration.sql,down.sql}`, `lib/db/modelos-de-negocio.ts`,
  `lib/types/planes.ts` (exporta `nombreSchema`, `fechaSchema`, `modulosSchema`, `unSoloModo`/`UN_SOLO_MODO`,
  `noInicioYEfecto`/`NO_INICIO_Y_EFECTO` y los cuatro refines de General con su constante; `crearPlanSchema` y
  `asignarPlanSchema` las usan, mismo orden, paths y mensajes), `lib/types/plan-borrador.ts`, `lib/planes/borrador.ts`.
- Tests: `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts`,
  `tests/integration/db/planes-acceso-servi-app.test.ts` (caso R23 nuevo; la siembra añade un borrador del custom
  de A y la foto lo incluye), `tests/unit/types/plan-borrador-schema.test.ts`, `tests/unit/planes/plan-borrador.test.ts`.

**Base:** `servi_logistic_slt129` en el Postgres local (misma URL que `.env` cambiando la base), `migrate deploy`
completo + `db:seed`; down.sql y migration.sql reaplicados a mano (ida y vuelta).

**R → test (de esta tanda)**
| R | Test |
|---|---|
| R3 | `plan-borrador-schema.test.ts > R3 — «un plan nuevo empieza por General»` (falta el caso del servicio, T4) |
| R6 | `plan-borrador-schema.test.ts > R6 — un caso por paso con un valor inválido y su clave` y `> lo que cruza pasos…` |
| R7 | `plan-borrador-schema.test.ts > R7 — período repetido / porcentaje 0 y 100.01 / monto inválido / sin precio con líneas / la lista vacía es sin descuentos`; `plan-borrador.test.ts > R7` |
| R16 | `plan-borrador.test.ts > R16 — crear sin Topes y programar sin Cuándo rige` (el del servicio va en T4) |
| R17, R18 | `plan-borrador.test.ts > R17 / R18` (conversión a la petición de hoy; la integración va en T6) |
| R21 | `tests/unit/types/planes-schema*.test.ts` sin tocar, en verde |
| R23 | `planes-acceso-servi-app.test.ts > «R23 — servi_app no lee ni escribe plan_borrador»` |
| R24 | `migracion-plan-borrador-ida-y-vuelta.test.ts` |

**Salida real**
- `pnpm run typecheck`: sin errores.
- `pnpm run lint`: 0 errores, 248 warnings, ninguno en archivos de esta tanda.
- `vitest run` R23/R24 + guardia `organizacion-en-modelos`: 3 archivos, 25 passed.
- `vitest run` `plan-borrador*` + `planes-schema*` (4): 6 archivos, 175 passed.
- `vitest run` `organizacion-en-modelos`, `guard-dependencias-aprobadas`, `planes-service`, `planes-crear-custom-asigna`: 4 archivos, 113 passed.

**Veredicto:** T1 y T2 en verde; producción en 507 líneas añadidas tras dos tandas, por encima del reparto de §11.

## Tanda T3 + T4 + T5 (backend_dev, 2026-11-17) — sin R9–R10

**Archivos**
- Producción: `lib/interfaces/repositories/IPlanBorradorRepository.ts` (nuevo; extiende `Pick<IPlanesRepository, "plan">`
  para R8 en el servicio), `lib/repositories/PlanesRepository.ts` (`crearBorrador`, `guardarPasoDeCreacion`,
  `guardarPasoDeCambio`, `descartar`, `borrador`; `consumirBorrador` envuelve las transacciones de `crear`,
  `crearYAsignar`, `editar` y `programarCambio`; `crearEnTx` recibe el id del borrador),
  `lib/interfaces/repositories/IPlanesRepository.ts` (`borradorId?` en los cuatro), `lib/db/excepciones-aislamiento.ts`
  (motivo), `lib/interfaces/services/IPlanesService.ts` (`OpcionesDeBorrador`), `lib/services/PlanesService.ts`
  (`opciones?` en `crear`/`editar`; sin opciones las llamadas al repositorio no cambian de aridad),
  `lib/interfaces/services/IPlanBorradorService.ts`, `lib/services/PlanBorradorService.ts` (`guardarPaso`,
  `descartar`, `confirmar`), `lib/actions/plan-borrador.ts` (`guardarPasoBorradorAction`, `descartarBorradorAction`,
  `confirmarBorradorAction`), `lib/modulos/reparto.ts` (`"plan-borrador": "nucleo"`).
- Tests: `tests/unit/services/plan-borrador-service.test.ts`, `tests/unit/actions/plan-borrador.test.ts`.

**Corte de §11:** producción en `git diff dev --stat -- db lib` = **921 insertions, 51 deletions** (17 archivos) antes de
R9–R10. Leer y listar (`borradorDelPlan`, `borradores`, `leer`, `borradores` del servicio, `leerBorradorAction`) se
estima en ~80 líneas: pasaría de ~980. **No se implementó**; queda para la ficha aparte de design §11.

**Decisión de implementación a revisar:** `guardarPasoDeCambio` toma `plan_borrador WHERE plan_id = … FOR UPDATE`
ANTES del `plan FOR SHARE`, para seguir el orden de confirmar (borrador → plan) y no abrazarse con él (guardar con
el plan en SHARE esperando la fila del borrador mientras confirmar la tiene y espera el plan en UPDATE).

**R → test (de esta tanda)**
| R | Test |
|---|---|
| R1 | `plan-borrador-service.test.ts > R1 — …forbidden y el repositorio no se llama` (3 operaciones × maestro/admin/null); `plan-borrador.test.ts (actions) > R1 — con la sesión de un maestro…` |
| R3 | `plan-borrador-service.test.ts > R3 — un plan nuevo empieza por General` |
| R4, R5 | `plan-borrador-service.test.ts > R4 / R5` (con dobles; la concurrencia va en T6) |
| R6 | `plan-borrador-service.test.ts > R6 — un paso inválido no llega al repositorio…` y `> R6 — una fecha fuera de rango se acepta al guardar General` |
| R8 | `plan-borrador-service.test.ts > R8 — plan inexistente, plan archivado y borrador inexistente no escriben` (la de Postgres, T6) |
| R14 | `plan-borrador-service.test.ts > R14`; `plan-borrador.test.ts (actions) > R14 — descartar … borra por PlanesRepository` |
| R16 | `plan-borrador-service.test.ts > R16 — crear sin Topes y programar sin Cuándo rige dan pasos_pendientes` y `> lectura defensiva` |
| R17, R18 | `plan-borrador-service.test.ts > R17 / R18` (pasan por `PlanesService` con `{ borradorId }`; la integración, T6) |
| R19 | `plan-borrador-service.test.ts > R19 — el rechazo de crear pasa tal cual` |
| R20 | `plan-borrador-service.test.ts > R20 — sin borrador, o si desaparece dentro de la transacción…`; `plan-borrador.test.ts (actions) > R20` |
| R21 | `planes-service*.test.ts` y `tests/integration/db/planes-*.test.ts` sin tocar, en verde |

**Salida real**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: sin errores.
- `pnpm exec eslint` sobre los archivos tocados: 0 errores, 1 warning ajeno (`IOrdenRepository.ts`, no es de esta tanda).
- `vitest run` `plan-borrador-service`, `actions/plan-borrador`, `planes-service*` (9), `planes.composition-root`,
  guardias `modulos-reparto`, `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `organizacion-en-modelos`,
  `rls-por-empresa`, `planes/plan-borrador`, `types/plan-borrador-schema`: 19 archivos, 594 passed.
- `vitest run` `storage-solo-por-adaptador` + `guard-dependencias-aprobadas`: 2 archivos, 11 passed.
- `vitest run tests/integration/db/planes-*.test.ts --no-file-parallelism` (base `servi_logistic_slt129`): 18 archivos, 187 passed.
- Humo temporal contra la base (borrado tras correrlo): guardar 5 pasos → `pasos_pendientes` → confirmar crea el plan
  con el id del borrador y borra el borrador; reconfirmar → `borrador_no_encontrado`; dos pasos del cambio → una fila.
  Dejó un plan público «smoke …» en `servi_logistic_slt129`.

**Veredicto:** T3–T5 en verde sin R9–R10 (corte de §11 por tamaño: 921 líneas de producción).

## Tanda R9–R10 + T7 (backend_dev, 2026-11-17) — el humano aceptó el tamaño: sin corte de §11

**Archivos**
- Producción: `lib/interfaces/repositories/IPlanBorradorRepository.ts` (`BorradorListado`, `borradorDelPlan`,
  `borradores`), `lib/repositories/PlanesRepository.ts` (`borradorDelPlan` por `planId` único; `borradores` con el
  nombre del plan por la relación), `lib/interfaces/services/IPlanBorradorService.ts` y
  `lib/services/PlanBorradorService.ts` (`leer`, `borradores`; `vista()` comparte la lectura defensiva de
  confirmar), `lib/actions/plan-borrador.ts` (`leerBorradorAction`; la lista va sin action, design §4).
- Tests: `tests/unit/services/plan-borrador-service.test.ts` (+R9, R10; R1 cubre ahora `leer` y `borradores`),
  `tests/unit/actions/plan-borrador.test.ts` (+R9; R1 con las cuatro actions),
  `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts` (nuevo, R15).
- `specs/SLT-129-planes-borrador-servidor/tasks.md`: T3.2, T4.2, T5.1 y T7.1 marcadas.

**Decisión fuera del spec (a revisar):** la lista sale ordenada por `updated_at DESC, id` (lo último guardado
primero). R10 y design §4 no fijan orden; se eligió uno determinista.

**Producción:** `git diff dev --shortstat -- db lib` = 17 files changed, 1023 insertions(+), 51 deletions(-).

**R → test (de esta tanda)**
| R | Test |
|---|---|
| R1 | `plan-borrador-service.test.ts > R1 — … > leer / borradores con maestro/admin/sin sesión`; `plan-borrador.test.ts (actions) > R1 — … forbidden en las cuatro` |
| R9 | `plan-borrador-service.test.ts > R9 — por id devuelve los pasos tal como se guardaron…`, `> R9 — por plan … sin él, borrador null…`, `> R9 — lectura defensiva…`; `plan-borrador.test.ts (actions) > R9 — leer por plan va al repositorio real…` (la integración, T6) |
| R10 | `plan-borrador-service.test.ts > R10 — la lista trae creación y cambio con su nombre…` (la integración, T6) |
| R15 | `plan-borrador-sin-caducidad.guardia.test.ts` (árbol real + contraprueba en memoria: DELETE/TRUNCATE/delegado fuera de `PlanesRepository`, y `plan_borrador` en cron o `jobs-*`) |

**Salida real**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: sin errores.
- `pnpm exec eslint` sobre los 8 archivos tocados: exit 0, sin salida.
- `vitest run` `plan-borrador-service`, `actions/plan-borrador`, `plan-borrador-sin-caducidad`, `planes-sin-borrado`,
  `sql-a-mano-por-empresa`, `modulos-reparto`: 6 archivos, 113 passed.
- `vitest run` `actions/planes.composition-root`, `rls-por-empresa`, `organizacion-en-modelos`, `services/planes-service*` (9):
  12 archivos, 446 passed.

**Limpieza:** en `servi_logistic_slt129` se borró el plan público «smoke 741bbc86» (`105ecf5d-…`) y, por cascada, su
fila de `plan_tope_rol`, `plan_descuento_periodo` y `plan_precio_historial` (no tenía rastro, borrador ni trabajos).
Quedan 0 planes `smoke%`.

**Veredicto:** R9, R10 y R15 implementados y en verde en unitarios; falta T6 (integración).

## Tanda T6 + T8.2 + T8.3 (backend_dev, 2026-11-17)

**Archivos**
- Tests (nuevos): `tests/integration/db/plan-borrador.test.ts` (15 casos), `tests/integration/db/plan-borrador-confirmar.test.ts` (9 casos).
- Producción (bug que destapó R2, arreglo mínimo): `lib/repositories/PlanesRepository.ts`. `crearBorrador`,
  `guardarPasoDeCreacion` y `guardarPasoDeCambio` escribían `created_at`/`updated_at` con el DEFAULT
  `CURRENT_TIMESTAMP` y `"updated_at" = CURRENT_TIMESTAMP`: en una columna `TIMESTAMP` sin zona eso es la hora LOCAL
  de la sesión, no el reloj UTC con el que escribe Prisma (`docs/architecture.md > Ciclo en UTC`). Medido en
  `servi_logistic_slt129` (`TimeZone = America/Bogota`): `iniciadoAt`/`actualizadoAt` salían 5 h atrasados
  (18 000 146 ms). Ahora las tres sentencias escriben las dos columnas con `(now() AT TIME ZONE 'UTC')` (constante
  `AHORA_UTC`); la migración no cambia (el DEFAULT queda como en las demás tablas `plan_*`). En CI no se ve porque el
  Postgres del job está en UTC. +13/−7 líneas; producción queda en `git diff dev --shortstat -- db lib` = 17 files,
  1029 insertions, 51 deletions.
- `specs/SLT-129-planes-borrador-servidor/tasks.md`: T6.1, T6.2, T8.2 y T8.3 marcadas (T8.1 la corre el leader).

**Cómo se prueba la concurrencia (R4, R5, R20).** Dos clientes Prisma (dos conexiones) con filas COMMITEADAS, bajo
`bajoLockDeEscrituraReal`. La simultaneidad se fuerza: una tercera conexión toma en `FOR UPDATE` la fila que los dos
van a escribir (el borrador en R4 y R20, el plan en R5), los dos arrancan, el test espera consultando
`pg_blocking_pids` (en cadena: el segundo espera al primero en el lock de la tupla) a que los dos estén bloqueados, y
solo entonces suelta. Contraprueba a mano: sin el `FOR UPDATE` de `consumirBorrador`, «dos confirmaciones
simultáneas» cae en rojo (restaurado después). La limpieza deja `plan_borrador` vacía y 0 planes de prueba (medido).

**Mapa R → test (completo)**
| R | Test |
|---|---|
| R1 | `tests/unit/services/plan-borrador-service.test.ts > R1 — cualquier rol que no es superadmin recibe forbidden y el repositorio no se llama` (cada operación × maestro/admin/sin sesión); `tests/unit/actions/plan-borrador.test.ts > R1 — con la sesión de un maestro, forbidden en las cuatro y la base no se toca` |
| R2 | `tests/integration/db/plan-borrador.test.ts > R2 — guardar General sin borrador crea uno con el iniciador y la fecha` |
| R3 | `tests/unit/services/plan-borrador-service.test.ts > R3 — un plan nuevo empieza por General`; `tests/unit/types/plan-borrador-schema.test.ts > R3 — guardar un paso: la entrada > un plan nuevo empieza por General` |
| R4 | `plan-borrador.test.ts > R4 — guardar un paso no toca los demás` y `> R4 — dos guardados simultáneos de pasos distintos conservan los dos (dos conexiones en paralelo)` |
| R5 | `plan-borrador.test.ts > R5 — el segundo superadmin sigue el borrador del primero` y `> R5 — dos primeros guardados simultáneos del mismo plan dejan un solo borrador (dos conexiones en paralelo)` |
| R6 | `tests/unit/types/plan-borrador-schema.test.ts > R6 — un caso por paso con un valor inválido y su clave` y `> R6 — lo que cruza pasos o necesita la base o el reloj no se mira al guardar`; `plan-borrador-service.test.ts > R6 — un paso inválido no llega al repositorio…` y `> R6 — una fecha fuera de rango se acepta al guardar General` |
| R7 | `plan-borrador-schema.test.ts > R7 — los descuentos en lista > período repetido / porcentaje 0 y 100.01 / monto inválido, con el mensaje de hoy / sin precio con líneas / la lista vacía es sin descuentos`; `tests/unit/planes/plan-borrador.test.ts > R7 — la lista de descuentos en el registro por período de hoy` |
| R8 | `plan-borrador.test.ts > R8 — plan inexistente, plan archivado y borrador inexistente no escriben` (servicio y repositorio bajo el cerrojo); `plan-borrador-service.test.ts > R8 …` |
| R9 | `plan-borrador.test.ts > R9 — otro superadmin lee el borrador tal como se guardó` y `> R9 — un plan sin borrador de cambio devuelve null`; unitarios `plan-borrador-service.test.ts > R9 …` |
| R10 | `plan-borrador.test.ts > R10 — la lista trae los borradores de los dos superadmins con su nombre`; `plan-borrador-service.test.ts > R10 …` |
| R11 | `plan-borrador.test.ts > R11 — un borrador completo no aparece en asignables, públicos ni catálogo, y asignarlo da not_found (incluye uno custom con su empresa)` |
| R12 | `plan-borrador.test.ts > R12 — guardar los seis pasos del cambio deja el plan, el pendiente y la cola de trabajos igual` (foto de `plan`, `plan_tope_rol`, `plan_modulo`, `plan_descuento_periodo`, `plan_precio_historial`, `plan_cambio_programado`, `plan_cambio_recepcion`, `plan_version_empresa`, `organizacion`, `plan_rastro` y `jobs`, con un pendiente de SLT-128 vivo y dos empresas) |
| R13 | `plan-borrador.test.ts > R13 — guardar y descartar no dejan rastro` |
| R14 | `plan-borrador.test.ts > R14 — otro superadmin descarta el borrador y ya no se lee` y `> R14 — descartar uno inexistente da borrador_no_encontrado`; `plan-borrador-service.test.ts > R14 …`; `actions/plan-borrador.test.ts > R14 …` |
| R15 | `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts` (árbol real + contrapruebas en memoria) |
| R16 | `plan-borrador-service.test.ts > R16 — crear sin Topes y programar sin Cuándo rige dan pasos_pendientes`; `tests/unit/planes/plan-borrador.test.ts > R16 — los pasos que faltan, en el orden del formulario` |
| R17 | `tests/integration/db/plan-borrador-confirmar.test.ts > R17 — crear un público desde el borrador (plan con el id del borrador, rastro «creado», borrador borrado)` y `> R17 — crear un custom desde el borrador lo asigna a su empresa` |
| R18 | `plan-borrador-confirmar.test.ts > R18 — programar desde el borrador crea el pendiente y una recepción por empresa (trabajos de aviso, rastro, borrador borrado)`; `> R18 (decisión del implementer) — confirmar un cambio sin diferencias da ok con cambio:false y también borra el borrador` |
| R19 | `plan-borrador-confirmar.test.ts > R19 — un custom con tipo quincenal y facturación mensual da validation_error y el borrador queda`, `> R19 — una fecha de efecto pasada da validation_error en vigenteDesde y el borrador queda` y `> R19 — una regla del repositorio bajo el cerrojo (cambio_a_medias) pasa tal cual, no escribe nada y el borrador queda` |
| R20 | `plan-borrador-confirmar.test.ts > R20 — dos confirmaciones simultáneas crean un solo plan (dos conexiones en paralelo)` y `> R20 — confirmar un borrador descartado da borrador_no_encontrado` (incluye el borrado entre la lectura del servicio y el FOR UPDATE) |
| R21 | `tests/unit/services/planes-service.test.ts`, `tests/integration/db/planes-crear-custom-asigna.test.ts`, `planes-cambio-programado.test.ts` y `planes-cambio-por-empresa.test.ts` sin tocar sus aserciones, en verde; E2E de planes (T8.2) |
| R22 | `plan-borrador.test.ts > R22 — borrar la empresa del custom borra el borrador de su plan` |
| R23 | `tests/integration/db/planes-acceso-servi-app.test.ts > R23 — servi_app no lee ni escribe plan_borrador` |
| R24 | `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts` (cinco casos R24) |

**Decisiones para el reviewer** (fuera del spec)
1. Mensajes nuevos: «Un plan nuevo empieza por el paso General.» (R3, `UN_PLAN_NUEVO_EMPIEZA_POR_GENERAL`) y «Un período
   no puede repetirse.» (R7, `PERIODO_REPETIDO`). El spec fija las claves, no los textos.
2. `guardarPasoDeCambio` toma `plan_borrador WHERE plan_id = … FOR UPDATE` ANTES del `plan FOR SHARE`: el orden de
   confirmar (borrador → plan), para no abrazarse con él.
3. `guardarPasoDeCreacion` filtra `plan_id IS NULL`: el id de un borrador de CAMBIO en `modo: "crear"` da
   `borrador_no_encontrado` y no mezcla pasos de crear en un cambio.
4. `IPlanBorradorRepository` extiende `Pick<IPlanesRepository, "plan">`: el servicio responde R8 (`not_found`,
   `archivado`) sin otra dependencia; el repositorio lo repite bajo `FOR SHARE`.
5. Confirmar en `ok` con `cambio: false` (un cambio sin diferencias) también borra el borrador (`consumirBorrador` borra
   en todo `ok`). Probado en `plan-borrador-confirmar.test.ts > R18 (decisión del implementer)`.
6. Import circular entre `lib/types/plan-borrador.ts` y `lib/planes/borrador.ts`: seguro porque ninguno usa al otro al
   cargarse (solo dentro de funciones); lo dice la cabecera de `lib/planes/borrador.ts`.
7. `asignarPlanSchema` también usa `noInicioYEfecto` (misma lógica y mismo mensaje que antes, ahora compartida).
8. `borradores()` ordena por `updated_at DESC, id` (lo último guardado primero); R10 no fija orden.
9. El nombre de la lista sale de General solo si General sigue validando (lectura defensiva); si no, el del plan en un
   cambio, o `null` en una creación.
10. (Nueva en T6) `created_at`/`updated_at` del borrador se escriben con `(now() AT TIME ZONE 'UTC')` y no con
    `CURRENT_TIMESTAMP` (ver «Archivos» arriba): arreglo en producción destapado por R2.

**Salida real**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm exec eslint` sobre los dos tests nuevos y `PlanesRepository.ts`: «No issues found», exit 0.
- `vitest run tests/integration/db/plan-borrador.test.ts tests/integration/db/plan-borrador-confirmar.test.ts`
  (base `servi_logistic_slt129`), dos corridas seguidas: 2 archivos, **24 passed / 0 failed / 0 skipped** cada una.
- `vitest run --no-file-parallelism` de `planes-acceso-servi-app`, `migracion-plan-borrador-ida-y-vuelta`,
  `planes-crear-custom-asigna`, `planes-cambio-programado`, `planes-cambio-por-empresa`, `services/plan-borrador-service`,
  `actions/plan-borrador` y las guardias `plan-borrador-sin-caducidad`, `sql-a-mano-por-empresa`, `planes-sin-borrado`:
  10 archivos, 122 passed.
- E2E (T8.2) sobre la base desechable NUEVA `servi_logistic_slt129_e2e` (DROP/CREATE, `prisma migrate deploy`,
  `db:seed`), `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `SESSION_SECRET`/`CRON_SECRET` efímeros como
  en `gate.yml`, `playwright test e2e/planes-superadmin.spec.ts e2e/planes-costeo.spec.ts
  e2e/planes-costo-porcentual.spec.ts e2e/mi-plan-cambiar-plan.spec.ts --no-deps`:
  corrida 1: **20 passed** (3.1 min), 0 failed, 0 flaky.
  corrida 2: **20 passed** (3.1 min), 0 failed, 0 flaky. Ningún fallo ajeno que documentar.

**Veredicto:** T6.1, T6.2, T8.2 y T8.3 en verde (24 de integración ×2, 20 E2E ×2); un bug real arreglado en
`PlanesRepository` (fechas del borrador en hora local de la sesión); falta T8.1 (`./init.sh`, el leader).
