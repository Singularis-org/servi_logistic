# impl SL-23 — Catálogo de módulos y módulos activos por empresa

Worktree: `.worktrees/SL-23-catalogo-modulos`, rama `feature/SL-23-catalogo-modulos`.

## T0 — Orden de migraciones y base de pruebas (2026-10-26)

- `git fetch origin` + `git ls-tree origin/dev db/migrations/`: la última migración de `origin/dev`
  sigue siendo `20261025160100_entorno_marca`. Las tres de T1 (`20261026120000`, `20261026120100`,
  `20261026120200`) van detrás sin renumerar.
- Base propia de la feature: `logistic_sl23` en el Postgres local (`localhost:5432`), creada
  vacía, `prisma migrate deploy` + `pnpm run db:seed` en verde. `DATABASE_URL` se exporta en la
  sesión apuntando a ella (mismas credenciales del `.env` local, solo cambia el nombre de la base);
  el `.env` no se copia al worktree.

## Tanda 1 — T1, T2 (2026-10-26, backend_dev)

### Archivos

Creados:
- `db/migrations/20261026120000_organizacion_modulo/{migration.sql,down.sql}`: enum `modulo_apagable`
  (9), tabla, FK `CASCADE`, único `(organizacion_id, modulo)`, índice, RLS + política
  `organizacion_modulo_por_empresa`, `GRANT SELECT` + `REVOKE INSERT, UPDATE, DELETE` a `servi_app`,
  trigger `…_sin_cambio_de_empresa` y backfill de los 9 módulos a cada empresa existente (R5).
- `db/migrations/20261026120100_historial_accion_modulos/{migration.sql,down.sql}`: `modulo_activado`,
  `modulo_desactivado` y la entidad `organizacion_modulo`. El down borra las filas que los usan
  (design §9) y recrea los tipos con la función dinámica de SL-36 (`_sl23`), no con lista fija: una
  lista fija borraría valores que otra rama añada después.
- `db/migrations/20261026120200_job_estado_descartado/{migration.sql,down.sql}`: `descartado`. El down
  pasa los descartados a `done` con `last_error` intacto y recrea `job_estado` con la misma función,
  que suelta y rehace el índice parcial `jobs_run_after_pending_idx` y el DEFAULT `'pending'`.
- `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` (T1) y
  `tests/integration/db/organizacion-modulo.test.ts` (T2).

Modificados:
- `db/schema.prisma`: `ModuloApagable`, `OrganizacionModulo`, `Organizacion.modulos`,
  `JobEstado.descartado`, `HistorialAccionTipo.{modulo_activado,modulo_desactivado}`,
  `HistorialAccionEntidad.organizacion_modulo`. Cambios aditivos y localizados (choque con SL-43).
- `lib/db/modelos-de-negocio.ts`: `OrganizacionModulo` en `MODELOS_DE_NEGOCIO` (77 → 78).
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` y `tests/unit/scripts/verificar-rls-despliegue.test.ts`:
  la cuenta fija de tablas de negocio pasa de 77 a 78 (y el contrato a 79 políticas / 78 triggers).

### Base

`logistic_sl23`: `prisma migrate deploy` aplicó las tres; `prisma generate` ok;
`prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`

### Mapa R → test

| R | Test |
|---|---|
| R4 | `organizacion-modulo.test.ts`: «cada empresa lee exactamente sus módulos», «sin fila, el módulo está apagado», «una fila como mucho… 23505» |
| R5 | `migracion-sl23-ida-y-vuelta.test.ts`: «cada empresa previa queda con los 9 módulos encendidos», «una empresa creada después… nace sin ningún módulo» |
| R6 | `organizacion-modulo.test.ts`: «una empresa dada de alta por OrganizacionService nace sin ningún módulo encendido» |
| R7 | `organizacion-modulo.test.ts`: «SQL a mano con servi_app: B ve solo lo suyo», «servi_app no escribe ninguna activación… 42501» (INSERT/UPDATE/DELETE, propia y ajena), «por el cliente de la app… tampoco se escribe»; `migracion-sl23-ida-y-vuelta.test.ts`: «RLS activa, FK en cascada y servi_app solo con SELECT» |
| R20 | `migracion-sl23-ida-y-vuelta.test.ts`: «un job se descarta con su motivo» y el down lo deja en `done` con `last_error`. (El descarte del drenador es T11.) |
| R25 | `organizacion-modulo.test.ts`: «cada empresa lee exactamente sus módulos», «quitar `ranking` a A no cambia nada en B» |
| R27 | `migracion-sl23-ida-y-vuelta.test.ts`: «tabla, columnas, tipo y valores nuevos con los nombres del design» (`information_schema`, `pg_enum`, índices, política, trigger) |

Mutaciones (sobre `logistic_sl23`, revertidas después y comprobadas): `GRANT INSERT, UPDATE, DELETE`
a `servi_app` → 3 casos rojos de `organizacion-modulo.test.ts`; política `USING (true)` → 2 rojos.

### Salida

- `vitest run tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` (con `DATABASE_URL`):
  `Test Files 1 passed (1) · Tests 8 passed (8)`.
- `vitest run tests/integration/db/organizacion-modulo.test.ts` (con `DATABASE_URL`):
  `Test Files 1 passed (1) · Tests 8 passed (8)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 309 passed (310) · Tests 4 failed | 4281 passed | 1 skipped`.
  El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`.
  `organizacion-en-modelos`, `rls-por-empresa` y `fk-misma-empresa` en verde.
- `pnpm run lint`: `0 errors, 231 warnings`; `eslint` sobre los 5 archivos TS de la tanda: exit 0.
- `pnpm exec vitest related --run lib/db/modelos-de-negocio.ts <los 4 tests tocados>` (con
  `DATABASE_URL`), segunda corrida con reporte JSON: 4 archivos, `41 passed, 0 failed`. La primera
  corrida del mismo comando recorrió muchos más archivos (casi toda la integración) y mostró casos
  rojos por timeout de 20 s en suites ajenas a esta tanda (premios del ranking, cierres,
  reconciliación de zonas); su resumen se perdió porque la salida se recortó con `head`. No se
  atribuyen a este cambio, pero no está demostrado: el reviewer o `./init.sh` deberían confirmarlo.
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, OOM): **ROJO, 3 errores**:
  - `lib/types/historial-accion.ts(661,7)`: falta `modulo_activado` | `modulo_desactivado` en `HISTORIAL_ACCION_TIPOS`;
  - `lib/types/historial-accion.ts(662,7)`: falta `organizacion_modulo` en `HISTORIAL_ACCION_ENTIDADES`;
  - `lib/repositories/HistorialAccionRepository.ts(159,5)`: el mismo hueco visto desde la lectura.

### Bloqueo: secuencia T1 / T6 del historial

T1 pide los dos `HistorialAccionTipo` y el `HistorialAccionEntidad` en `db/schema.prisma`, pero
`lib/types/historial-accion.ts` cierra el catálogo contra el enum de Prisma (`_AsegurarExhaustivoTipos`),
así que el typecheck exige listarlos ya. Listarlos es T6 (categoría `cambia_modulos`, etiquetas), y en
cuanto entran en `HISTORIAL_ACCION_TIPOS` la guardia `historial-accion-escrituras-cubiertas` exige su
productor (`ModulosEmpresaRepository`, T6) y fija 70 tipos; `catalogo-y-choke-point.test.ts` fija 70/25/4.
No hay forma de cerrar T1 con typecheck y guardias en verde a la vez sin adelantar parte de T6.
Opciones para el leader:
1. Mover a T6 la migración `20261026120100` y los tres valores del historial en `db/schema.prisma`
   (T1 queda verde; la base `logistic_sl23` ya la tiene aplicada y habría que revertirla con su down).
2. Aceptar el typecheck en rojo entre T1 y T6, sin mergear nada en medio.
3. Adelantar a esta tanda el catálogo de `lib/types/historial-accion.ts`, sabiendo que
   `historial-accion-escrituras-cubiertas` queda roja hasta T6.

Veredicto: T1 y T2 hechos y probados contra Postgres; la tanda no cierra por el typecheck rojo del bloqueo de arriba.

### Tanda 1 — adelanto de T6 (typecheck)

Decisión del leader (opción 3 del bloqueo de arriba): adelantar de T6 solo los valores del catálogo
de historial para que el typecheck cierre. No se adelanta servicio, repositorio, action ni el censo.

**Archivos tocados**
- `lib/types/historial-accion.ts`: `modulo_activado`, `modulo_desactivado` (bloque A.5) y la
  entidad `organizacion_modulo`; la categoría `cambia_modulos` («Cambia módulos») en
  `CATEGORIAS_ACCION`/`CATEGORIA_POR_ACCION`/`CATEGORIA_LABELS`; `ACCION_LABELS` («Activó/Desactivó un
  módulo de una empresa») y `ENTIDAD_LABELS` («Módulo»); totales del comentario (72 tipos, 26 entidades).
  La categoría la exige el tipo: `CATEGORIA_POR_ACCION` es un `Record` exhaustivo y ninguna de las
  cuatro existentes encaja (design §4.3 la define).
  La etiqueta de entidad es «Módulo» y no «Módulo de la empresa»: la prueba SL-15 R4 prohíbe escribir
  «la empresa» a mano en los textos del historial.
- `lib/types/historial-accion-etiquetas.ts`: fuente `organizacion_modulo: { moduloNombre }` y su
  constructor (`FuentesEtiqueta`/`CONSTRUCTORES` son exhaustivos sobre la entidad; design §4.3:
  `entidad_etiqueta` = nombre del módulo).
- `lib/repositories/HistorialAccionRepository.ts`: sin cambios (su error era consecuencia del catálogo).
- Tests con números o listas duras del catálogo, actualizados a 72/26/5 y con los valores de SL-23
  en `POSTERIORES`: `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` (más una aserción de
  `cambia_modulos`), `tests/integration/db/caja-459-migration.test.ts`,
  `correccion-resultado-gestion-migration.test.ts`, `historial-accion-cobro-tienda-migration.test.ts`,
  `historial-accion-conciliacion-bodega-migration.test.ts`,
  `historial-accion-orden-zona-reconciliada-migration.test.ts`,
  `historial-accion-zona-pago-mensajero-migration.test.ts`, `historial-accion-zona-sinpe-migration.test.ts`.

**Salida**
- `pnpm run typecheck`: exit 0 (antes: TS2741/TS2536 en `historial-accion-etiquetas.ts`, ya resueltos).
- `pnpm run lint`: 0 errors, 231 warnings (preexistentes); eslint de los archivos tocados: exit 0.
- `pnpm exec vitest run tests/unit/historial-accion/`: 2 files, 90 passed.
- Los 7 de integración arreglados (con base): 7 files, 97 passed.
- `vitest related` de los tres archivos: la primera corrida terminó y mostró los rojos de arriba más
  rojos de archivos que están todos en `tests/baseline-rojos.json` (analytics-daily-job,
  busqueda-por-guia-469, caja-caracterizacion-459, historial-accion-atomicidad, historial-accion-migration,
  wallet-458/461-migration, abono-tienda-457-migration, orden-traspaso-migration, 455/snapshot-lectura y
  otros). La segunda corrida completa la cortó Claude Code por falta de memoria; no se relanzó y se
  verificaron por separado los archivos afectados.
- `pnpm run test:guardias`: 2 files failed | 306 passed. `dependencias-declaradas-presentes` (4) está en
  baseline. **`historial-accion-escrituras-cubiertas` (2) es rojo esperado hasta T6**: `modulo_activado` y
  `modulo_desactivado` no tienen productor en el `CENSO` y la cifra dura sigue en 70. Su criterio de hecho
  está en T6, así que no se toca aquí.

Veredicto: typecheck verde; queda solo `historial-accion-escrituras-cubiertas` en rojo, esperado hasta que T6 escriba el productor.

## Tanda 2 — T3, T4, T5 (2026-10-26, backend_dev)

### Archivos

Creados:
- `lib/modulos/catalogo.ts` (T3): `MODULOS_APAGABLES: Record<ModuloApagable, {nombre, descripcion}>`,
  `ORDEN_MODULOS`, `NUCLEO` (7 nombres, con «Cierres»), `esModuloApagable`, `nombreDelModulo`. Solo
  `import type`. Las descripciones salen de la fila 1 de decisiones y de §3.1; son texto de pantalla
  revisable en T7.
- `lib/modulos/reparto.ts` (T3): `Destino`, `modulosDe`, `MODULO_POR_RUTA` (44), `MODULO_POR_ACTION`
  (109), `MODULO_POR_JOB: Record<JobTipo, Destino>` (16), `MODULO_POR_CRON` (12), `MODULO_POR_API` (14),
  `CALCULO_CONTINUO` (`{ jobs, crons }`), `esCalculoContinuo`, `CONSUMOS_ENTRE_MODULOS` (§6.3, con
  `anfitrionas: string[]`: el chat se pinta en `/reparto` y en `/recoger`).
- `lib/modulos/modulo-inactivo-error.ts` (T5): `ModuloInactivoError extends ForbiddenError`, `details =
  { codigo: "modulo_inactivo", modulo }`, mensaje «El módulo <nombre> no está activo para esta empresa.».
- `lib/interfaces/repositories/IModulosActivosRepository.ts`, `lib/repositories/ModulosActivosRepository.ts` (T5).
- `lib/modulos/exigir-modulo.ts` (T5): `modulosActivos` (`cache()` de React), `moduloActivo`,
  `exigirModuloActivo(...claves)`, `exigirModuloEnRuta(...claves)`, `modulosDelMenu(actor)`.
- `tests/fabricas/modulos.ts > puertasAbiertas()` (T5): devuelve el módulo entero, tipado como el real.
- `tests/unit/modulos/catalogo.test.ts`, `tests/unit/modulos/exigir-modulo.test.ts`.
- `tests/unit/guards/_modulos-reparto.ts` (detectores, sobre el AST de TypeScript),
  `tests/unit/guards/modulos-reparto.guardia.test.ts`, `tests/unit/guards/modulos-sin-seed.guardia.test.ts` (T4).

Modificados:
- `tests/integration/db/organizacion-modulo.test.ts`: caso nuevo «ModulosActivosRepository da los de la
  empresa en curso; sin empresa no consulta» (`EmpresaNoResuelta`), contra Postgres.
- `specs/SL-23-catalogo-modulos/tasks.md`: T3–T5 `[x]`; `_modulos-reparto.ts` en «Tests nuevos».

### Decisiones de implementación (sin reabrir el spec)

- **`/mis-asignaciones` → núcleo.** La página existe en el disco y §3.1 no la lista: es un `redirect` a
  `/mis-asignaciones/reparto` (Entregas, núcleo por la fila 1 de decisiones). §3.1 dice «43 páginas»
  contando la nueva de T7; con esta son 44 entradas.
- **Piezas anunciadas en el caso (a).** `/plataforma/empresas/[organizacionId]` (T7) y la action
  `modulos-empresa` (T6) están en `reparto.ts` tal cual §3, pero su archivo aún no existe. La guardia las
  exime de «entrada sin archivo» con la lista `ANUNCIADAS` y un cable por cada una que falla en cuanto
  el archivo aparece: T6 y T7 borran su línea al crearlo.
- **Marcado de (b)–(f).** Los casos que el árbol aún incumple van con `it.fails` (verde mientras
  incumple, rojo en cuanto cumple: obliga a quitar el `.fails`). Un `it` aparte comprueba que esos
  barridos corren sin lanzar, para que el verde de `.fails` no tape un detector roto.
  Estado medido hoy: (b) 26 páginas sin puerta; (c) 185 funciones en 54 archivos; (d)
  `generar-gastos-fijos` y `sync-plantillas-whatsapp` sin `modulo`; (e) 1 import cruzado; (f)
  `dashboard/page.tsx`, `layout.tsx`, `not-found.tsx`. En verde normal ya: (a) entera, (d) «cálculo
  continuo no pasa `modulo`» y (e) «cada consumo declarado existe».
- **Puerta en action.** (c) acepta la puerta como primera sentencia del cuerpo o como primera
  sentencia del `withErrorHandler` que abre el cuerpo (design §5.3), con las claves exactas y en orden.

### Hallazgos para T8–T11 (abiertos, no resueltos aquí)

1. **Import cruzado no previsto en §6.3:** `app/(app)/ordenes/_components/ReportarIncidenteModal.tsx`
   (`/ordenes`, núcleo) importa `reportarIncidente` de `lib/actions/incidentes` (incidentes_novedades).
   Con el módulo apagado, «Reportar incidente» desde Órdenes recibiría `forbidden`. T10 tiene que
   decidir (con el humano): añadirlo a `CONSUMOS_ENTRE_MODULOS` con el flag en `/ordenes`, u otra
   clasificación. Hasta entonces (e) va con `.fails`.
2. **Puerta sin empresa.** `exigirModuloActivo`/`exigirModuloEnRuta` leen por la extensión: sin sesión
   o con el superadmin (sin empresa) la lectura lanza `EmpresaNoResuelta` (design §5.1), no `forbidden` ni
   `notFound`. Como T9/T10 ponen la puerta como PRIMERA sentencia, antes de `resolveActor`, una action
   sin sesión pasaría de `unauthorized` a un error interno, y un superadmin que abra `/wallet` vería un
   error en vez del 404. El spec no fija este caso; hay que decidirlo antes de T9/T10.
3. **(e) solo mira `app/`.** `components/shared/**` también importa actions de módulos (wallet,
   conciliación, plantillas). El design no asigna módulo a `components/`, así que la guardia no los
   clasifica.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R1 | `tests/unit/modulos/catalogo.test.ts`: «exactamente 9 claves, las mismas que el enum», «`wallet`… `wallet_cierres` no existe», «los nombres en pantalla…», «el orden de pantalla nombra cada módulo una vez» |
| R2 | `catalogo.test.ts`: «el núcleo son sus 7 nombres, Cierres incluido», «nada del núcleo es una clave apagable» (el rechazo en la petición es T6) |
| R3 | `modulos-reparto.guardia.test.ts` (a): «ninguna pieza del disco sin entrada», «ninguna entrada sin su archivo», «solo las piezas de §3.7 tienen dos módulos»; mutaciones con árbol inventado y en el árbol real |
| R9 | `exigir-modulo.test.ts`: «apagar entre dos peticiones se ve en la segunda»; `organizacion-modulo.test.ts`: «ModulosActivosRepository…» |
| R16 | `exigir-modulo.test.ts`: «apagado: notFound()», «encendido: pasa»; guardia (b) (`.fails` hasta T9) |
| R17 | `exigir-modulo.test.ts`: «apagado: lanza ModuloInactivoError, un 403 con details.codigo = modulo_inactivo», «encendido: pasa»; guardia (c) (`.fails` hasta T10) |
| R21, R30 | guardia (d): «un cron de cálculo continuo no pasa modulo» (verde), «un cron de un módulo pasa modulo» (`.fails` hasta T11) |
| R28 | `modulos-sin-seed.guardia.test.ts` |
| R33 | `exigir-modulo.test.ts` «dos claves»: falta la primera, la segunda o las dos, en action y en ruta; guardia (a) tuplas y (c) mutación «una sola clave en una pieza compartida» |

### Mutaciones probadas en el árbol real (revertidas y comprobadas con `git status`)

- `app/(app)/premios-mut/page.tsx` nuevo → (a) rojo: `ruta /premios-mut`.
- `lib/actions/ranking-historico.ts` movido → (a) rojo: `action ranking-historico` (y la no-vacuidad).
- `modulo: "ranking"` en el `paraCadaEmpresa` de `snapshot-ranking` → (d) rojo: «es de cálculo continuo y pasa `modulo`».
- `getPrismaClient().organizacionModulo` en `scripts/seed-catalogos.ts` → la de seed roja.
- (b), (c), (e), (f): mutación con fuentes inventadas en la autocomprobación (la buena pasa, la mutada falla).

### Salida

- `pnpm exec vitest run tests/unit/modulos tests/unit/guards/modulos-reparto.guardia.test.ts tests/unit/guards/modulos-sin-seed.guardia.test.ts`:
  `Test Files 4 passed (4) · Tests 56 passed | 5 expected fail (61)`.
- `vitest run tests/integration/db/organizacion-modulo.test.ts` (con `DATABASE_URL` a `logistic_sl23`):
  `Test Files 1 passed (1) · Tests 9 passed (9)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: `0 errors, 231 warnings` (preexistentes); `eslint` de los archivos de la tanda: «No issues found».
- `pnpm run test:guardias`: `Test Files 2 failed | 308 passed | 2 skipped (312) · Tests 6 failed | 4291 passed | 5 expected fail | 20 skipped`.
  Rojos: `dependencias-declaradas-presentes` (4, baseline) y `historial-accion-escrituras-cubiertas` (2,
  esperado hasta T6). `modulos-reparto` y `modulos-sin-seed` en verde.
- No se corrió `vitest related` del árbol (memoria de la máquina): se corrieron directamente los
  archivos nuevos y el tocado.

Veredicto: T3, T4 y T5 hechos y en verde; quedan tres hallazgos abiertos para T8–T11 (import cruzado de `/ordenes`, puerta sin empresa, `components/shared`).

## Tanda 2b — ajustes (2026-10-26, backend_dev)

Por la decisión humana del commit `250f685`: Incidentes y novedades pasa al núcleo (quedan 8 módulos),
R34 (sin empresa, la puerta no aplica), `components/` y `hooks/` se clasifican por la ruta que los
monta, y `liquidacion` y `conciliacion-satelites` van al núcleo. Cierra los tres hallazgos de la Tanda 2.

### Archivos

- T1: `db/migrations/20261026120000_organizacion_modulo/migration.sql` (sin `'incidentes_novedades'`
  en el `CREATE TYPE`, en sitio) y `db/schema.prisma` (`enum ModuloApagable`, 8 valores);
  `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` (`CLAVES` con 8, «los 8 módulos», 16 filas
  para dos empresas, `toHaveLength(8)`); `tests/integration/db/organizacion-modulo.test.ts` (el orden
  del enum, sin la clave).
- T3: `lib/modulos/catalogo.ts` (8 módulos; `NUCLEO` con 8 nombres, con «Incidentes y novedades»);
  `lib/modulos/reparto.ts` (`/incidentes`, `/novedades` y las 5 actions de incidentes al núcleo;
  `liquidacion` y `conciliacion-satelites` al núcleo, con nota; `EnviarPlantillaWhatsappButton` en
  `CONSUMOS_ENTRE_MODULOS`); `tests/unit/modulos/catalogo.test.ts`.
- T4: `tests/unit/guards/_modulos-reparto.ts`: `GrafoDeConsumos` sustituye a `consumosNoDeclarados`.
  Sigue los imports de valor de cada archivo de `app/` hacia `components/**` y `hooks/**` (alias `@/` y
  relativos, `index`), con memo por archivo y protección de ciclos. Los `import type` no cuentan. Una
  pieza de `CONSUMOS_ENTRE_MODULOS` en cualquier punto de la cadena la cubre. El fallo nombra la cadena
  (`ruta → componente → … → lib/actions/x (módulo)`).
  `tests/unit/guards/modulos-reparto.guardia.test.ts`: (e) usa el grafo, con una prueba de no-vacuidad
  (sin §6.3, el barrido ve `…/EnviarPlantillaWhatsappButton.tsx → lib/actions/whatsapp-envio`). Las
  autocomprobaciones de (e) usan un árbol inventado: la mutación pedida (un componente de `components/`
  montado en `/ordenes` que llega por un hook a una action de wallet), su declaración en §6.3, la
  declaración con otro módulo, un ciclo y los imports directos. Cifras: 24 páginas y 48 actions de un
  módulo.
- T5: `lib/modulos/exigir-modulo.ts`: `modulosActivos()` da `ReadonlySet | null`. Captura solo
  `EmpresaNoResuelta` y la convierte en `null`, que el `cache()` también memoriza. Con `null` las dos
  puertas vuelven sin lanzar ni `notFound()`, `moduloActivo` da `false` y `modulosDelMenu` da el
  conjunto vacío. `tests/unit/modulos/exigir-modulo.test.ts`: `cache` de React sustituido por uno que
  memoriza hasta `nuevaPeticion()` (el contrato de Next). Casos nuevos (R34): `EmpresaNoResuelta` → ninguna
  puerta lanza ni llama a `notFound`; otro error se propaga; el `null` se lee una sola vez por petición.
  También «una sola lectura dentro de una petición», y R9 sigue con una lectura por petición.
- `specs/SL-23-catalogo-modulos/tasks.md`: T1, T3, T4 y T5 `[x]`.

### Estado de la guardia (e)

Está en **verde normal**, sin `.fails`: el único cruce real (`EnviarPlantillaWhatsappButton`, montado
en `/novedades` y en `/mis-asignaciones/reparto`) está declarado en §6.3. T8 sigue debiendo el flag en
sus anfitrionas. Siguen con `.fails` (b), (c), la mitad «de un módulo» de (d) y (f).

### Base

`prisma migrate reset --force` sobre `logistic_sl23` no se ejecutó: Prisma 7 bloquea el reset pedido
por un agente sin el consentimiento explícito del humano (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`),
y el mensaje del leader no cuenta como tal. Para no borrar nada, se creó una base **nueva y vacía**,
`logistic_sl23b`, con `CREATE DATABASE`, y su `db-env-b.sh` en el scratchpad del leader, con el mismo
`.env` y otro nombre de base: `prisma migrate deploy` (todas las migraciones, la de SL-23 con 8
valores), `prisma generate`, `pnpm run db:seed` y `prisma migrate diff --from-config-datasource
--to-schema db/schema.prisma --script` → `-- This is an empty migration.`; `migrate status` → «Database
schema is up to date!». **`logistic_sl23` sigue con el checksum viejo**: o el humano autoriza el reset,
o se la abandona y se apunta `db-env.sh` a `logistic_sl23b`.

### Mapa R → test (cambios)

| R | Test |
|---|---|
| R1, R2 | `catalogo.test.ts`: «exactamente 8 claves…», «`incidentes_novedades` no existe: Incidentes y novedades es núcleo», «el núcleo son sus 8 nombres…» |
| R5 | `migracion-sl23-ida-y-vuelta.test.ts`: «cada empresa previa queda con los 8 módulos encendidos» (16 filas para A y B) |
| R3 | guardia (a) con 24/48; (e) transitiva y su mutación en `components/` |
| R9 | `exigir-modulo.test.ts`: «apagar entre dos peticiones…» (3 peticiones, 3 lecturas), «dentro de una misma petición hay una sola lectura» |
| R34 | `exigir-modulo.test.ts` › «sin empresa la puerta no aplica»: los tres casos |

### Mutaciones probadas en el árbol real (revertidas y comprobadas con `git status`)

- `import "@/lib/actions/wallet"` añadido a `components/shared/NotificationsBell.tsx` → (e) rojo, con
  cadenas como `app/(app)/cierre-dia/page.tsx → components/shared/AppPage.tsx →
  components/shared/PageHeader.tsx → components/shared/NotificationsBell.tsx → lib/actions/wallet (wallet)`.

### Salida

- `vitest run tests/unit/modulos tests/unit/guards/modulos-reparto.guardia.test.ts tests/unit/guards/modulos-sin-seed.guardia.test.ts`:
  `Test Files 4 passed (4) · Tests 67 passed | 4 expected fail (71)`.
- `vitest run tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts tests/integration/db/organizacion-modulo.test.ts`
  (con `DATABASE_URL` a `logistic_sl23b`): `Test Files 2 passed (2) · Tests 17 passed (17)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: `0 errors, 231 warnings` (preexistentes); `eslint` de los archivos tocados: «No issues found».
- `pnpm run test:guardias`: `Test Files 2 failed | 308 passed | 2 skipped (312) · Tests 6 failed | 4297 passed | 4 expected fail | 20 skipped`.
  Rojos: solo `dependencias-declaradas-presentes` (4, baseline) e `historial-accion-escrituras-cubiertas` (2, hasta T6).

Veredicto: los ajustes de T1, T3, T4 y T5 están hechos y en verde sobre `logistic_sl23b`; el reset de `logistic_sl23` espera la autorización del humano.

## Tanda 3 — T6 (2026-10-26, backend_dev)

Base de la feature desde aquí: `logistic_sl23b` (`db-env-b.sh`).

### Archivos

Creados:
- `lib/types/modulos-empresa.ts`: `verModulosEmpresaSchema`, `fijarModuloEmpresaSchema` (`organizacionId`
  `z.uuid()`, `modulo` en `z.enum(ORDEN_MODULOS)`, `activo` booleano), los DTO `ModulosDeEmpresa` /
  `ModuloDeEmpresa` y los resultados `{ estado: "ok", … } | forbidden | validation_error | not_found`.
- `lib/interfaces/repositories/IModulosEmpresaRepository.ts`, `lib/repositories/ModulosEmpresaRepository.ts`:
  `empresa`, `activos`, `encender` y `apagar`, todo en `comoPlataforma("SL-23", …)`.
  - `encender`: `createMany … skipDuplicates` con id propio, contado.
  - `apagar`: `findFirst` y luego `deleteMany` por id, contado.
  - Los dos abren su `$transaction`, congelan al actor con `resolverActorCongelado` y llaman a
    `appendAccion(tx, …)` solo si la fila cambió.
  - La fila del historial lleva `entidad_id` = la fila creada o borrada, `entidad_etiqueta` = el nombre
    del módulo, `valor_nuevo` = la clave y `organizacion_id` explícito.
- `lib/interfaces/services/IModulosEmpresaService.ts`, `lib/services/ModulosEmpresaService.ts`: `ver` y
  `fijar`, en este orden: `esPlataforma`, zod, la empresa existe y, al final, el repositorio.
- `lib/actions/_shared/modulos-empresa.ts`: `construirModulosEmpresaService` (el composition root) y
  `verModulosEmpresa` (la lectura para la página de T7). No es `use server`.
- `lib/actions/modulos-empresa.ts`: `'use server'`, `fijarModuloEmpresaAction(input, deps)`. Monta el
  servicio con el root de `_shared`.
  - Lleva `@sin-superficie` temporal: su único llamador es el switch de T7.
  - Sin esa marca, `superficie-de-uso` se ponía roja. T7 la borra al montarlo, y la guardia avisa si sobrevive.
- Tests: `tests/unit/services/modulos-empresa-service.test.ts`, `tests/unit/actions/modulos-empresa.composition-root.test.ts`
  y `tests/integration/db/modulos-empresa-historial.test.ts`.

Modificados:
- `lib/interfaces/repositories/IHistorialAccionRepository.ts` + `lib/repositories/registrar-accion.ts`:
  `EntradaAccion.organizacionId?`. Se vuelca a la fila solo si viene; ningún llamador previo lo pasa.
  `registrar-accion.ts` sigue siendo el único que nombra `tx.historialAccion`.
- `lib/db/excepciones-aislamiento.ts`: `ModulosEmpresaRepository.ts` en `EXCEPCIONES_DE_PLATAFORMA`
  (SL-23, motivo de design §5.2).
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: el `CENSO` gana
  `encender` → `modulo_activado` (`tx.organizacionModulo.createMany`) y `apagar` → `modulo_desactivado`
  (`tx.organizacionModulo.deleteMany`), los dos `abre_tx`. La cuenta fija pasa de 70 a 72.
- `tests/unit/guards/modulos-reparto.guardia.test.ts`: se quita `modulos-empresa` de `ANUNCIADAS`. Queda
  solo la ruta de T7.
- `specs/SL-23-catalogo-modulos/tasks.md`: T6 `[x]`.

La categoría `cambia_modulos` ya estaba desde la Tanda 1 (adelanto del typecheck): no se toca.

### Mapa R → test (T6)

| R | Test |
|---|---|
| R2 | `modulos-empresa-service.test.ts`: «módulo fuera del catálogo» con `incidentes_novedades`, `cierres`, `Cierres`, `Inicio`, `nucleo` y `wallet_cierres` → `validation_error` sin tocar el repositorio |
| R8 | `modulos-empresa-service.test.ts`: «los 8 módulos en el orden de pantalla, con su nombre y su estado» |
| R9 | `modulos-empresa-service.test.ts`: «el cambio se ve en la siguiente lectura»; `modulos-empresa-historial.test.ts`: «por el servicio, el cambio se ve en la lectura siguiente» |
| R10 | `modulos-empresa-service.test.ts`: `it.each` con los roles de empresa (todos menos `superadmin`) → `forbidden` al fijar y al ver, con el repositorio intacto; el maestro de esa empresa; sin sesión; «quién antes que qué»; `composition-root`: el maestro → `forbidden` sin tocar el cliente |
| R11 | `modulos-empresa-service.test.ts`: «organizacionId que no es un uuid…» y «empresa inexistente → not_found, sin escribir» |
| R12 | `modulos-empresa-historial.test.ts`: «encender deja… UNA acción… con el superadmin como actor», «apagar… con el id de la fila borrada» y «si el registro falla al encender / al apagar» (savepoint real y `createMany` del historial roto, con control sano); guardia `escrituras-cubiertas` (misma tx) |
| R13 | `modulos-empresa-service.test.ts`: «encender lo encendido o apagar lo apagado responde ok sin cambio»; `modulos-empresa-historial.test.ts`: los dos «… no escribe ni registra nada» |

### Mutación probada

Se borró el `appendAccion` de `encender` y se restauró el archivo después:
- `escrituras-cubiertas` rojo: «ModulosEmpresaRepository.ts#encender registra su accion en la misma
  transaccion»;
- `modulos-empresa-historial.test.ts`: 7 de 7 rojos.

### Salida

- `vitest run tests/unit/services/modulos-empresa-service.test.ts tests/unit/actions/modulos-empresa.composition-root.test.ts tests/unit/guards/superficie-de-uso.guardia.test.ts`:
  `Test Files 3 passed (3) · Tests 45 passed (45)`.
- `vitest run tests/unit/services/modulos-empresa-service.test.ts tests/unit/actions/modulos-empresa.composition-root.test.ts tests/unit/historial-accion`
  (incluye el choke point de `appendAccion`): `Test Files 4 passed (4) · Tests 117 passed (117)`.
- `vitest run` de los guardias `escrituras-cubiertas`, `punto-unico`, `plataforma-solo-en-lista` y `modulos-reparto`:
  `Test Files 4 passed (4) · Tests 126 passed | 4 expected fail (130)`.
- Integración sobre `logistic_sl23b`: `modulos-empresa-historial.test.ts` 7/7 y `organizacion-modulo.test.ts`
  9/9. `historial-accion-atomicidad.test.ts` sale rojo por datos («la tabla `orden` esta vacia», pide
  `seed-zonas`), no por este cambio, y ya estaba en `tests/baseline-rojos.json`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: `0 errors, 231 warnings` (los de antes); eslint de los archivos de T6: sin avisos.
- `pnpm run test:guardias`: `Test Files 1 failed | 309 passed | 2 skipped (312) · Tests 4 failed | 4300 passed | 4 expected fail | 20 skipped`.
  El único rojo es `dependencias-declaradas-presentes` (baseline). `historial-accion-escrituras-cubiertas`
  ya está en verde.

Veredicto: T6 hecho y en verde; queda un `@sin-superficie` temporal en `fijarModuloEmpresaAction`, que T7 retira.

## Tanda 3b — T7

Agente: frontend_dev. Grafo de código no consultado (la tanda solo toca piezas leídas directamente con Read/Grep).

### Archivos

- Creado `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`: Server Component. `notFound()` sin
  actor o sin `esPlataforma` antes de leer (R14); lee con `verModulosEmpresa` (composition root §5.2);
  cualquier resultado que no sea `ok` (`not_found`, `validation_error`, `forbidden`) → `notFound()`.
  Pinta el nombre (h1), «Volver a Empresas», «Núcleo (siempre activo)» con los 8 nombres de `NUCLEO`
  sin control, y el bloque «Módulos».
- Creado `app/(app)/plataforma/empresas/[organizacionId]/_components/ModulosEmpresa.tsx`: cliente. Una
  fila por módulo (nombre, descripción del catálogo como `aria-describedby`, `Switch` de `components/ui`).
  Optimista: deshabilitado mientras espera; si no es `ok` o lanza, vuelve atrás y avisa con `useToast`.
  Sin modal (design §7).
- Modificado `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`: columna «Módulos», segunda
  (junto al nombre), con un enlace «Módulos» (nombre accesible «Módulos de <empresa>») a
  `/plataforma/empresas/<id>`. Va segunda y no última porque `empresas-module.test.tsx` (SL-41) fija
  «Bienvenida» como columna final; así no se toca el test de otra ficha.
- Modificado `lib/actions/modulos-empresa.ts`: fuera el `@sin-superficie` temporal de T6.
- Modificado `tests/unit/guards/modulos-reparto.guardia.test.ts`: `ANUNCIADAS` queda vacía.
- Modificado `tests/integration/empresas-page.test.tsx`: caso del enlace «Módulos».
- Creados `tests/components/ModulosEmpresa.test.tsx` y `tests/integration/plataforma-empresa-detalle-page.test.tsx`.
- `specs/SL-23-catalogo-modulos/tasks.md`: T7 marcada.

Descripciones de `lib/modulos/catalogo.ts`: revisadas contra `DESIGN.md`, `docs/conventions.md`, el menú
(`menu-visibility.ts`) y `reparto.ts`. No chocan con nada ni prometen alcance que el reparto no tenga
(«financieras» de Analítica corresponde al `TableroFinanciero` montado). Sin cambios.

### R → test

| R | Test |
|---|---|
| R8 | `tests/integration/plataforma-empresa-detalle-page.test.tsx`: «lee con su actor y la empresa de la URL; 8 interruptores con su estado y el núcleo sin control» y «empresa inexistente o id inválido → notFound()»; `tests/components/ModulosEmpresa.test.tsx` (8 filas en orden con descripción; llamada a la action al encender/apagar; deshabilitado mientras espera; vuelve atrás y avisa si no es `ok` o lanza); `tests/integration/empresas-page.test.tsx`: «SL-23 R8: cada fila lleva el enlace «Módulos»…» |
| R14 | `tests/integration/plataforma-empresa-detalle-page.test.tsx`: `it.each` de los 6 roles de empresa y «sin sesión» → `notFound()` sin llamar a `verModulosEmpresa` |

### Salida

- `vitest run tests/components/ModulosEmpresa.test.tsx tests/integration/plataforma-empresa-detalle-page.test.tsx tests/integration/empresas-page.test.tsx tests/components/empresas-module.test.tsx tests/components/EmpresasModuleCobro.test.tsx tests/unit/actions/modulos-empresa.composition-root.test.ts`:
  `Test Files 6 passed (6) · Tests 95 passed (95)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: sin errores.
- `pnpm run lint`: `0 errors, 231 warnings` (los de antes); eslint de los archivos de T7: sin avisos.
- `pnpm run test:guardias`: `Test Files 1 failed | 309 passed | 2 skipped (312) · Tests 4 failed | 4299 passed | 4 expected fail | 20 skipped`.
  Único rojo: `dependencias-declaradas-presentes` (baseline). `superficie-de-uso` y `modulos-reparto` en
  verde (un test menos que en T6: el cable de `ANUNCIADAS` ya no tiene filas).

Veredicto: T7 hecho y en verde; el interruptor está montado y la action ya no lleva `@sin-superficie`.

## Tanda 4 — T10, T11 (2026-10-26, backend_dev)

Base: `logistic_sl23b`. T11 `[x]`; **T10 queda abierta** (ver «Pendiente» al final).

### T10 — Actions

- **Puertas:** 154 inserciones de `await exigirModuloActivo(<claves>)` en las 48 actions de un módulo,
  hechas con un script sobre el AST (`scratchpad/insertar-puertas.mjs`).
  - **Posición:** primera sentencia del cuerpo, o del `withErrorHandler` que lo abre (design §5.3).
  - **Pieza compartida:** `premio-ranking-devengo` lleva `("wallet", "ranking")`.
  - **Núcleo sin puerta:** `liquidacion`, `conciliacion-satelites` y las 5 de Incidentes y novedades.
- **Guardia:** el caso (c) pasa en verde y pierde su `it.fails`.
  - El detector ya no cuenta las firmas de sobrecarga, que no tienen cuerpo: `registrarMovimientoManualAction`,
    `registrarEgresoAdministrativoAction` y `registrarCobroTiendaAction` salían dos veces.
  - Tiene autocomprobación propia.
- **`lib/modulos/exigir-modulo.ts`:** la memoria de `cache()` va **por empresa**
  (`leerActivos(organizacionId)`).
  - Por qué: un cron o un job recorre varias empresas en la misma petición, y la lista de una no
    puede servir para otra.
  - En `comoPlataforma` responde `null` sin consultar: sin filtro, la lectura vería las filas de todas.
  - Gana `primerModuloApagado`, que usa el drenador, y `puertasAbiertas()` gana su doble.
  - Tests nuevos en `exigir-modulo.test.ts`: «dos empresas en la misma petición» y «en plataforma, null sin consultar».
- **Tests con `puertasAbiertas()` (design §10):** 6 unitarios (busqueda-por-guia-469-roots,
  deuda-plataforma y wallet-egresos composition-root, libro-kardex-468, wallet-tienda-cobro,
  whatsapp-sin-integracion) y 38 de integración de wallet y analítica (la lista va en `tasks.md`).
  - Todos los integración que fallaron por la puerta estaban marcados NEW.
  - Los que siguen rojos están todos en `tests/baseline-rojos.json` y fallan por datos: base sin zonas ni órdenes.
- **`tests/integration/db/modulo-apagado-action.test.ts`** (nuevo, 7 casos): la puerta es real y lee
  `organizacion_modulo` por el cliente de la app dentro de `conEmpresa`.
  - Ranking apagado: rechazo con 403 `modulo_inactivo` y la base no cambia.
  - Wallet apagado: rechazo y la base no cambia.
  - Ranking apagado y Wallet encendido: `premio-ranking-devengo` se rechaza.
  - Las dos encendidas: `listarPremiosDelDiaAction` responde `ok`.
  - R34: sin sesión → `unauthenticated`; superadmin → `forbidden` del rol; ninguno da error interno.
- **`tests/components/CierresAdminPage.test.tsx`** (R31): el archivo entero corre con las 8 puertas
  cerradas, así que los 10 casos que ya había lo prueban sin módulos. Caso nuevo: «con Wallet apagado,
  el maestro aprueba y SÍ recibe la oferta de Pago al mensajero».

### T11 — Jobs, crons, API y webhook

- `lib/services/jobs/job-descartado.ts` (`JobDescartado`, motivo `modulo_inactivo:<clave>`).
- `IJobRepository.descartar` y `JobRepository.descartar` (`estado = 'descartado'`, `last_error`).
- `DrenarResult.descartados`. `JobQueueService.drenar`: un `JobDescartado` va a `descartar`, sin
  backoff ni dead-letter, y re-agenda si es recurrente.
- `procesar-jobs/route.ts`:
  - `conSuEmpresa(handler, recurrente, opciones, modulo)`; `moduloDeEjecucion(tipo)` devuelve `"nucleo"`
    para `CALCULO_CONTINUO` y `MODULO_POR_JOB` para los demás.
  - Con empresa y el módulo apagado lanza `JobDescartado` sin llamar al handler.
  - Recurrente sin empresa: `paraCadaEmpresa({ modulo })`.
- `paraCadaEmpresa({ cliente, modulo })`:
  - dos listados en plataforma, todas y las que tienen `modulos: { some: { modulo } }`;
  - `resumen.saltadas`, más una línea `console.info` con los ids.
- `generar-gastos-fijos` (`modulo: "wallet"`) y `sync-plantillas-whatsapp` (`modulo: "whatsapp"`):
  `empresas.saltadas: number`. `snapshot-ranking` no cambia. El caso (d) de la guardia pasa en verde
  y pierde su `it.fails`.
- `conEmpresaDeLaKey`: `exigirModuloActivo("api_integraciones")` dentro del `conEmpresa`, antes del
  cuerpo. `ordenes/api-key/analitica` añade `exigirModuloActivo("analitica")`.
- `chat/media/[mensajeId]`: tras el 401 de sesión, `exigirModuloActivo("whatsapp")` → 403 con
  `toShape()`.
- `WebhookWhatsappService`: dep `whatsappActivo?`, que por defecto es `moduloActivo("whatsapp")`.
  - Va **después de validar la firma**: una firma mala sigue dando 401.
  - Con el módulo apagado: una línea de log sin datos personales, sin ingesta ni anotación, y el lote
    cuenta como válido (200).
- Tests nuevos:
  - `tests/unit/services/job-queue-service-descartado.test.ts` (4);
  - `tests/unit/cron/procesar-jobs-modulos.test.ts` (9);
  - `tests/unit/cron/snapshot-ranking-modulo-apagado.test.ts` (1);
  - `tests/unit/db/para-cada-empresa-modulo.test.ts` (3);
  - `tests/integration/db/para-cada-empresa-modulo.test.ts` (3);
  - `tests/unit/api/api-key-modulo-inactivo.test.ts` (14: 10 manejadores de las 9 rutas, con un Prisma
    espía que demuestra que el cuerpo no corre, más el control y R33);
  - `tests/unit/services/webhook-whatsapp-service-modulo.test.ts` (4).
- Ajustados:
  - por `descartados`, `saltadas` y `descartar`: `job-queue-service.test.ts`, `para-cada-empresa.test.ts`,
    `crons-sin-empresas.test.ts`, `procesar-jobs-route.test.ts`, los 3 dobles de `IJobRepository` y
    `scripts/drenar-jobs.ts`;
  - `geocode-salud-sin-prosa.guardia` (lista literal del contrato de la cola, ahora con `descartar`);
  - con `puertasAbiertas`: los 3 de webhook y `api-key-empresa.test.ts`; también
    `tests/integration/api/webhook-whatsapp.route.test.ts`;
  - `dos-empresas-entradas.test.ts` enciende los 8 módulos de sus empresas (R6, R28) y acepta `saltadas: 0`.

### Mutaciones probadas (restauradas después)

Se quitaron a la vez la puerta de `conEmpresaDeLaKey`, el `throw new JobDescartado` de `conSuEmpresa`
y la comprobación del webhook: 15 rojos en los 3 archivos nuevos. Al restaurarlos, 27 de 27.

### Mapa R → test (Tanda 4)

| R | Test |
|---|---|
| R17 | guardia (c) (las 154 puertas); `modulo-apagado-action.test.ts` (ranking y wallet apagados) |
| R18 | `api-key-modulo-inactivo.test.ts` (10 manejadores → 403 `modulo_inactivo`, cuerpo no ejecutado) |
| R19 | `procesar-jobs-modulos.test.ts`: webhook_estado y webhook_evento descartados sin handler |
| R20 | `job-queue-service-descartado.test.ts`; `procesar-jobs-modulos.test.ts` (whatsapp_* descartado, recurrente re-agenda) |
| R21 | `para-cada-empresa-modulo` (unit e integration); `procesar-jobs-modulos.test.ts` (recurrente sin empresa); guardia (d) |
| R24 | `webhook-whatsapp-service-modulo.test.ts` |
| R25 | `para-cada-empresa-modulo` (integration, «el módulo de una empresa no decide por otra»); webhook R25 |
| R30 | `procesar-jobs-modulos.test.ts` (rollup e invalidación con Analítica apagada; rollup recurrente sin filtro); `snapshot-ranking-modulo-apagado.test.ts`; guardia (d) |
| R31 | `CierresAdminPage.test.tsx` (archivo entero con las puertas cerradas, más la oferta de pago) — **parcial**: falta `nucleo-sin-modulos.test.ts` |
| R33 | `modulo-apagado-action.test.ts` (premio-ranking-devengo); `api-key-modulo-inactivo.test.ts` (analítica) |
| R34 | `modulo-apagado-action.test.ts` (sin sesión → unauthenticated; superadmin → forbidden); `exigir-modulo.test.ts` (plataforma) |

### Salida

- Archivos nuevos y tocados, unitarios y de componente: `Test Files 15 passed (15) · Tests 218 passed | 2 expected fail (220)`.
- Integración en `logistic_sl23b` (modulo-apagado-action, para-cada-empresa-modulo, dos-empresas-entradas,
  webhook-whatsapp.route, procesar-jobs-route, modulos-empresa-historial, organizacion-modulo):
  `Test Files 7 passed (7) · Tests 51 passed (51)`.
- Barrido de regresión, tests que tocan las actions de módulo o la infraestructura cambiada:
  - 235 unitarios que importan las actions de módulo y 500 de componente, página o infraestructura: tras los ajustes, ningún rojo nuevo.
    `DescargarDataset.test.tsx` falló una vez en lote y pasa solo: es un fallo intermitente de tiempo.
  - 95 de integración: los rojos que quedan están todos en el baseline. La excepción es `demo-qa.test.ts`
    (ver «Pendiente»).
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: `0 errors, 231 warnings` (los de antes).
- `pnpm run test:guardias`: solo `dependencias-declaradas-presentes` (4, baseline) en rojo.
  `modulos-reparto`: (a), (c), (d) y (e) en verde; (b) y (f) siguen con `it.fails` (T9, T8).

### Pendiente y bloqueos

1. **BLOQUEO (el spec contradice el código): la forma del rechazo de una action.**
   - Design §5.3 dice que `toActionError` traduce el 403 a `{ status: "forbidden" }` sin tocar el
     contrato de la UI, y T10 pide que la action «devuelve `forbidden`».
   - En el código:
     - 101 de las 154 puertas van dentro de un `withErrorHandler`, pero sus 21 archivos traducen con
       un traductor **local** que no conoce `FORBIDDEN` y relanza
       `Error("<archivo>: AppErrorCode inesperado FORBIDDEN")`. Solo `envios-whatsapp`, `plantillas` y
       `api-keys` usan el `toActionError` compartido.
     - Las otras 53 puertas, en 25 archivos, no tienen `withErrorHandler`: lanzan `ModuloInactivoError`.
   - En los dos casos la action se rechaza antes de leer o escribir, que es lo que mide
     `modulo-apagado-action.test.ts`. Pero el cliente recibe una excepción, no `{ status: "forbidden" }`.
   - Normalizarlo exige añadir `FORBIDDEN` a 21 traductores y a sus tipos de resultado, y envolver o
     traducir 53 funciones. Es un cambio de contrato de UI que el design daba por hecho y no está
     hecho: decisión del leader o del humano.
2. **Falta `tests/integration/db/nucleo-sin-modulos.test.ts` (R31).**
   - Pide corte diario con cierre `vencido`, bloqueo, cierre del día, aprobar con movimientos de caja y
     `registrarPagoMensajeroAction` sobre una empresa sin módulos.
   - No se escribió por margen. Todas esas piezas son núcleo y no llevan puerta (la guardia (c) lo
     confirma), pero falta la evidencia contra Postgres.
3. **`tests/integration/db/demo-qa.test.ts` rojo por diseño hasta T12.**
   - La demo crea sus empresas con `crearEmpresa`, que hoy no enciende módulos.
   - La carga por API responde 403 `modulo_inactivo`, cuando debería pasar. T12 (`crearEmpresa` con
     `modulos: "todos"` por defecto) lo cierra.
   - Los E2E de `reparto` y `dinero` dependen de lo mismo.

Veredicto: T11 hecho y en verde. T10 tiene las puertas y su guardia en verde, pero queda abierta por el bloqueo 1 (forma del rechazo) y por `nucleo-sin-modulos.test.ts`.
