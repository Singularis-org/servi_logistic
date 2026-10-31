# impl_SLT-63 — recoleccion-recibida-libera-mensajero (backend_dev, 2026-10-31)

Rama `hotfix/SLT-63-recoleccion-recibida-libera-mensajero` (base `origin/prod` 603aad68), worktree
`.worktrees/SLT-63-hotfix`. Tasks T1–T6 hechas; T7 (gate, nota en la ficha) queda para el leader.

## Archivos

Modificados:
- `lib/interfaces/repositories/IOrdenRepository.ts` — `recibirEnBodegaCentral(..., opciones: { liberaAsignacion: boolean })`, obligatorio.
- `lib/repositories/OrdenRepository.ts` — el `data` del MISMO `updateMany` limpia `mensajeroAsignadoId`, `asignadoAt` y `fechaReparto` si `liberaAsignacion`; `where` e historial intactos; comentario «NO toca mensajeroAsignadoId (R18)» reescrito citando SLT-63.
- `lib/services/RecepcionBodegaCentralService.ts` — `liberaAsignacion` en `TRANSICIONES` (138 `true`, 139 `false`), pasado al repo.
- `lib/repositories/GestionOrdenRepository.ts` — `findMisAsignacionesByIds`: `OR [asignada a mi, {mensajeroAsignadoId: null, historialEstados some {origenTipo recoleccion_tienda, actorUsuarioId: yo}}]`, `deletedAt: null` igual.
- `lib/interfaces/repositories/IGestionOrdenRepository.ts` — comentario.
- `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts` — 138 espera el `data` con la asignacion limpia; 139 solo `{ estatusId }`.
- `tests/unit/services/recepcion-bodega-central-service.test.ts` — la opcion que recibe el repo en cada caso.
- `tests/unit/tablero-dia/asignado-at-solo-lectura.guardia.test.ts` — quinta entrada de la lista blanca (ver Desviaciones).
- `specs/SLT-63-recoleccion-recibida-libera-mensajero/tasks.md` — T1–T6 en `[x]`.

Creados:
- `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`
- `db/migrations/20261031120000_liberar_recolecciones_recibidas/migration.sql`
- `db/migrations/20261031120000_liberar_recolecciones_recibidas/down.sql`
- `tests/integration/db/liberar-recolecciones-recibidas-migration.test.ts`
- `progress/impl_SLT-63.md`

## Mapa R → test

Integracion (`I`) = `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`;
migracion (`M`) = `tests/integration/db/liberar-recolecciones-recibidas-migration.test.ts`.

| R | Test |
|---|---|
| R1 | I › «R1: recibir una recoleccion deja mensajero, asignado_at y fecha_reparto en NULL»; unit repo › «R2/R11 (138) + SLT-63/R1: el data del updateMany limpia la asignacion; …»; unit service › «SLT-63/R1: la recepcion de una orden en ruta a la central pide liberar la asignacion» |
| R2 | I › «R2: una recepcion que no transiciona no toca la asignacion (ya recibida y otro estado)» (service: `ya_recibida`/`estado_invalido`; repo directo con `liberaAsignacion: true`: `false` y asignacion intacta) |
| R3 | I › «R3: la recepcion de una devolucion conserva el mensajero»; unit repo › «R17 (139) + SLT-63/R3: …no toca la asignacion»; unit service › «SLT-63/R3: la recepcion de una devolucion pide conservar la asignacion» |
| R4 | I › «R4: num_guia intacto y una sola fila de historial recepcion_bodega_central» |
| R5 | I › «R5: tras recibir la recoleccion, el listado con reasignables la trae (y no la que tiene mensajero a mano)» |
| R6 | I › «R6: tras recibir la recoleccion, contarPorMensajero no la cuenta para nadie» |
| R7 | I › «R7: la hermana en en_ruta_bodega_central sigue contando para su mensajero» |
| R8 | I › «R8: Recolectadas hoy sigue trayendo la recibida en central» |
| R9 | I › «R9: no trae la recolectada por otro, ni la recolectada por mi y ya asignada a otro» |
| R10 | I › «R10: recibir no crea gestion_orden, wallet_movimiento ni cierre_dia» |
| R11 | M › «R11: libera la recibida y no toca a sus hermanas (fila posterior, devolucion, borrada, sin recoleccion), sin escribir historial» |
| R12 | M › «R12: el down repone el mensajero desde el actor de la ultima recoleccion_tienda» |

Siembra de `I` por el camino real: `OrdenRepository.asignarRecoleccionLote` → `recolectarEnTienda` →
`RecepcionBodegaCentralService.recibirEnBodegaCentral` (por `num_guia`), mas `asignarBodegaLote` para la
reasignada de R9. Lecturas reales: `OrdenService.listar` (schema `listarOrdenesSchema` con `reasignables`),
`TableroDiaRepository.contarPorMensajero` (ventana CR de hoy, alcance por zona) y
`GestionOrdenRepository.findMisAsignacionesByIds`.

## Mutaciones (T5)

Cada una aplicada con un script de reemplazo exacto (aborta si no casa 1 vez), archivo corrido con
`--reporter=verbose`, revertida con `git checkout -- <archivo>` y vuelto a correr. Ningun reporte dijo `skipped`.

| # | Mutacion | Rojo (con mutacion) | Tras revertir |
|---|---|---|---|
| M1 | `recibirEnBodegaCentral`: `data: { estatusId }` (sin limpieza) | R1, R5, R6, R7, R8 — 5 failed / 5 passed (10) | 10 passed |
| M2 | `TRANSICIONES.devolviendo_a_bodega_central.liberaAsignacion = true` | R3 — 1 failed / 9 passed | 10 passed |
| M3 | `findMisAsignacionesByIds`: quitar la rama `OR` nueva | R8 — 1 failed / 9 passed | 10 passed |
| M4 | quitar `mensajeroAsignadoId: null` de esa rama | R9 — 1 failed / 9 passed | 10 passed |
| M5 | `migration.sql`: quitar el `NOT EXISTS` de «la ultima fila» | R11 — 1 failed / 1 passed (2) | 2 passed |
| M6 | `migration.sql`: quitar `deleted_at IS NULL` | R11 — 1 failed / 1 passed | 2 passed |
| M7 | `down.sql`: `ORDER BY created_at ASC, id ASC` (la primera recoleccion, no la ultima) | R12 — 1 failed / 1 passed | 2 passed |
| M8 | `down.sql`: quitar `mensajero_asignado_id IS NULL` | sobrevive — 2 passed | 2 passed |

- M1 pone rojo tambien R7 (la tarjeta de Ana cuenta 2 en vez de 1): esperado.
- R8 cae con M1 porque el test exige como precondicion que la recibida llegue SIN mensajero: asi la trae
  la rama nueva, no la de propiedad, que es lo que el requisito quiere probar.
- M8 es un mutante equivalente en la secuencia up → down: tras el `UP` (y con el codigo nuevo) no puede
  existir una orden viva en `en_bodega_central` con mensajero cuya ultima fila sea la recepcion desde
  `en_ruta_bodega_central`. La clausula queda como defensa y no se fuerza un caso artificial.
- `git diff` sin restos tras las mutaciones (`git status -s` vacio antes de cada commit).

## Salida real

- Unit: `pnpm exec vitest run tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts tests/unit/services/recepcion-bodega-central-service.test.ts` → 2 files, 26 passed.
- `I`: 1 file, 10 passed, 0 skipped (con base). `M`: 1 file, 2 passed, 0 skipped.
- Tests que tocan el codigo cambiado (37 archivos: todo test que nombra `recibirEnBodegaCentral`,
  `findMisAsignacionesByIds`, `RecepcionBodegaCentral*`, `RecoleccionTienda*`, mas los dos nuevos y la
  guardia `fecha-reparto-acompana-asignado-at`): 37 passed, 1 failed (0 tests failed, 11 skipped):
  `correccion-dia-reparto-efectos.int.test.ts` aborta en su `beforeAll` porque la base nueva no tiene el
  estatus legado `ayuda_tienda`; ese archivo usa `findMisAsignacionesByIds` como doble. Ambiental.
- `pnpm exec vitest related --run <lib cambiados>` arrastra 664 archivos (OrdenRepository lo importa casi
  todo): 152 files failed / 76 tests failed contra la base nueva `servi_slt63`. Causas, por recuento de
  errores: `orden` vacia / faltan zonas o usuarios semilla (≈150), `conCorpus is not a function` y
  `reading 'prisma'` (fixtures de corpus que necesitan datos), estatus legados ausentes, y el cliente
  Prisma compartido (`plan_*`). Ninguno nombra la recepcion, la recoleccion ni «Recolectadas hoy». El
  veredicto de la suite lo da el gate/CI con su base sembrada.
- `pnpm run typecheck`: sin `NODE_OPTIONS=--max-old-space-size=8192` tsc muere por memoria (exit 134).
  Con ella: 5 errores, todos fuera de este cambio (`lib/modulos/reparto.ts`,
  `lib/repositories/HistorialAccionRepository.ts` ×2, `lib/types/historial-accion.ts` ×2): el
  `node_modules` compartido (junction) trae un cliente Prisma generado desde otra rama con
  `plan_aplicar_cambio`/`plan_asignado`, que no estan en el `db/schema.prisma` de prod. 0 errores en
  archivos de SLT-63. No se corrio `prisma generate` (romperia los otros worktrees).
- `pnpm run lint`: exit 0, 0 errores (232 warnings heredados; ninguno nuevo en los archivos tocados).
- `pnpm run test:guardias`: 318 files, 4427 passed / 6 failed / 1 skipped antes de la entrada en la
  lista blanca; tras ella, la guardia de `asignado_at` 7/7. Los 5 rojos restantes son ajenos:
  `dependencias-declaradas-presentes` ×4 (el `init.sh` de esta rama no tiene el marcador de la ficha
  420) y `jobs-handler-por-tipo` ×1 (cliente Prisma compartido con `plan_*`).

## Base de datos

- `.env` del worktree apunta a un Postgres LOCAL (host local, puerto 5432; comprobado solo como booleano).
- Se creo `servi_slt63` en ese servidor (`CREATE DATABASE` con `pg` desde un script en el scratchpad) y
  se aplicaron las migraciones con `DATABASE_URL` sobreescrita solo en el entorno del comando:
  `pnpm exec prisma migrate deploy` + `pnpm run db:seed`. No se toco el `.env`.
- Migracion nueva: `prisma migrate deploy` (aplica) → `pnpm run db:rollback` (ejecuta `down.sql` y borra
  la fila de `_prisma_migrations`) → `prisma migrate deploy` (reaplica) → `prisma migrate status`: «up to
  date», 268 migraciones. Se uso `migrate deploy` en vez de `db:migrate` (`migrate dev`), que pide shadow
  DB y puede proponer reset.
- Timestamp `20261031120000`: la ultima de `origin/prod` y de `origin/dev` es `20261030120100`.

## Desviaciones

1. **Lista blanca de `asignado_at` (`tests/unit/tablero-dia/asignado-at-solo-lectura.guardia.test.ts`).**
   La migracion de R11 escribe `asignado_at = NULL` (el spec pide limpiar el trio). La guardia congela
   las migraciones que tocan la columna y pide «mirarla a mano». Se anadio la entrada con su recibo en
   comentario: solo escribe NULL, y en el caso evidenciado la columna ya es NULL (157/R38). **Pide ojos
   del reviewer/humano**: si se prefiere no tocar la lista, la alternativa es quitar `asignado_at` del
   `SET` de la migracion, que contradice la letra de R11.
2. `order_status` es catalogo global (`value @unique`, sin `organizacion_id`): el subselect del design
   §5 sirve tal cual. Nombres verificados en `db/schema.prisma` (`orden`, `orden_historial_estado`,
   `estatus_origen_id`, `origen_tipo`, `actor_usuario_id`, `created_at`, `updated_at`).
3. `down.sql` sin `BEGIN/COMMIT`: es una sola sentencia (atomica) y asi el test puede ejecutarla dentro
   de la transaccion revertida. Solo repone `mensajero_asignado_id`, y solo donde hay una
   `recoleccion_tienda` con actor.
4. R8 incluye como precondicion que la recibida no tenga mensajero (para que la mutacion M1 lo ponga rojo).
5. El MCP del grafo no se uso: la exploracion fue con Grep/Read sobre el worktree.

## Veredicto

T1–T6 hechas y commiteadas; R1–R12 con test que se vio rojo por mutacion (salvo M8, equivalente); pendiente el gate del leader y decidir la entrada de la lista blanca de `asignado_at`.
