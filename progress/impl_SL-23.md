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
