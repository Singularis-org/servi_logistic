# SL-40 «Cobro de la plataforma por orden» — bitácora de implementación

Worktree `.worktrees/SL-40-cobro-plataforma-por-orden`, rama `feature/SL-40-cobro-plataforma-por-orden`.
Base desechable local `sl40_tandaa` (migrada con `migrate deploy` + `db:seed`, y borrada al terminar).
`node_modules` montado por junction desde el repo principal. El MCP `codebase-memory-mcp` no estaba
entre las herramientas de este agente, así que el código se exploró con Grep/Read.

## Tanda 0 — T0. Estado de `dev` (2026-10-23)

1. `origin/dev` = `5ca59b9`. Última migración: `20261023100200_usuario_empresa_o_superadmin`.
   SL-38 **no** está en `dev`: no hay ni `20261023120000` ni `20261023120100`. Timestamps de SL-40,
   posteriores a todas (también a las de SL-38): `20261023130000`, `20261023130100`, `20261023130200`.
2. `scripts/verificar-rls-despliegue.ts` tiene los conteos **escritos**: `POLITICAS_POR_EMPRESA = 73`,
   `TRIGGERS_MISMA_EMPRESA = 150`, `TRIGGERS_SIN_CAMBIO = 73` (l. 24-26). No los deriva de
   `MODELOS_DE_NEGOCIO.length`. T2 los sube a mano.
3. `tests/unit/guards/rls-por-empresa.guardia.test.ts`: `expect(tablas.length).toBe(73)` (l. 105).
4. SL-39 **no** está en `dev` (ningún commit SL-39 en `origin/dev`). T7 sigue bloqueada.
5. `comoPlataforma` corre como dueño: en `lib/db/extension-empresa.ts > aplicar`, con
   `ctx.tipo === "plataforma"` se devuelve `query(args)` sin `fijarEmpresa`, es decir, sin
   `set_config('role', 'servi_app')` ni empresa. Corre con el usuario de la conexión, que es el dueño.

## Tanda A

### T1 — el test que hoy falla

`tests/integration/db/cobro-plataforma-cargos.test.ts`, con el fixture
`tests/integration/db/_fixtures/cobro-plataforma-40.ts`:
- lock de sesión del valor global, que guarda la fila y la restaura;
- `movimientosDe` y `deudaDe`, leídos como dueño.

**Las vías de creación son las del código.** Las tres terminan en `createManyOrdenes` o
`createManyOrdenesConGuia`:
- **Pantalla:** `handleCargaMasivaChunk` es el route handler al que la pantalla de carga masiva manda
  sus lotes. Con una tienda sin fulfillment numera la guía (`createManyOrdenesConGuia`). No hay otra
  creación por pantalla: la server action `crearOrden` se borró el 2026-08-07
  (`lib/actions/ordenes.ts`, l. 42).
- **Carga masiva:** `BulkOrdenService.cargarMasiva` con una tienda con fulfillment. Es la rama
  `createManyOrdenes`, sin guía, y el test comprueba `numGuia = null`.
- **API:** `BulkOrdenService.cargarViaApi`, el servicio que construye `app/api/ordenes/api-key/carga/route.ts`.

Las anulaciones también van por las vías del código: `EliminarOrdenService` para la pantalla,
`ApiOrdenEliminacionService` para la API y `RecuperarOrdenService` para recuperar, cableados como en
sus composition roots.

**Desviación de design §11.1.** El valor global y la excepción de B se fijan como dueño (SQL del
fixture), no con `CobroPlataformaTarifaRepository`: ese repositorio es de T5 (tanda B), y aquí es
preparación, no lo que se mide. T5 puede cambiarlo.

**Rojo** contra `sl40_tandaa` sin las migraciones de SL-40 (`pnpm exec vitest run tests/integration/db/cobro-plataforma-cargos.test.ts`):

```
 ❯ tests/integration/db/cobro-plataforma-cargos.test.ts (18 tests | 18 skipped) 511ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/db/cobro-plataforma-cargos.test.ts > SL-40 — cargos y reversos del cobro de la plataforma por orden (Postgres)
error: no existe la relación «cobro_plataforma_tarifa»
 ❯ tomarTarifaGlobal tests/integration/db/_fixtures/cobro-plataforma-40.ts:48:22
 ❯ tests/integration/db/cobro-plataforma-cargos.test.ts:337:20

 Test Files  1 failed (1)
      Tests  18 skipped (18)
VITEST_EXIT=1
```

El «18 skipped» es lo que vitest informa cuando falla el `beforeAll`. **No es un skip por falta de
base**: la base existe, la suite sale FAIL con exit 1 y el error nombra la tabla que falta.

- lint de los dos archivos: limpio.
- typecheck: 48 errores, **todos** de `superadmin` en tests de SL-32. El cliente Prisma compartido de
  `node_modules` lo había generado otro worktree con un esquema sin `superadmin`. Ninguno sale de los
  archivos de SL-40. Se regenera en T2, dentro del lock.

### T2 — migraciones 1 y 2, y el esquema

**Archivos**
- `db/migrations/20261023130000_cobro_plataforma_tarifa/{migration,down}.sql`:
  - tabla `cobro_plataforma_tarifa`: PK booleana con `CHECK ("id")`, `CHECK (monto >= 0)`, RLS sin
    políticas y `REVOKE ALL … FROM servi_app`;
  - columna `organizacion.cobro_plataforma_por_orden` con su `CHECK`.
- `db/migrations/20261023130100_cobro_plataforma_movimiento/{migration,down}.sql`:
  - los dos enums, la tabla, sus `CHECK`, el único `(organizacion_id, orden_id, secuencia)` y los
    índices;
  - FK `orden` CASCADE y FK `organizacion` RESTRICT;
  - RLS, política `cobro_plataforma_movimiento_por_empresa` y `REVOKE INSERT, UPDATE, DELETE`;
  - los dos triggers de SL-17, salida literal de `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`:
    `sme_cobro_plataforma_movimiento_orden_id_a07cad67` y `cobro_plataforma_movimiento_sin_cambio_de_empresa`.
- `db/schema.prisma`:
  - `CobroPlataformaTarifa`, `CobroPlataformaMovimiento`, `CobroPlataformaTipo` y `CobroPlataformaFuente`;
  - `Organizacion.cobroPlataformaPorOrden`;
  - las relaciones `Orden.cobrosPlataforma` y `Organizacion.cobrosPlataforma`;
  - el comentario de lo que vive solo en el SQL.
  - Único con `map: "cobro_plataforma_movimiento_orden_secuencia_key"`, porque el nombre por defecto
    pasa de 63 caracteres.
- `lib/db/modelos-de-negocio.ts`: `CobroPlataformaMovimiento` es de negocio (74) y `CobroPlataformaTarifa`
  de plataforma (15).
- Conteos: `tests/unit/guards/rls-por-empresa.guardia.test.ts` pasa de 73 a 74, y
  `scripts/verificar-rls-despliegue.ts` de 73/150/73 a 74/151/74, con su motivo.
- `tests/integration/db/schema-drift-saneamiento.test.ts`: el censo escrito a mano de las tablas con
  DEFAULT en `updated_at` suma `cobro_plataforma_tarifa` (de 13 a 14), con su motivo. Es el único test
  existente que se tocó, y lo hace a propósito: la lista la escribe una persona.

**Evidencia** (base `sl40_tandaa`, lock `gate.lock` tomado para `prisma generate` y las comprobaciones)
- `prisma migrate deploy`: `Applying migration 20261023130000_cobro_plataforma_tarifa` y `…130100…`; `migrate status` → «Database schema is up to date!» (238 migraciones).
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`
- Permisos de `servi_app`, medidos en la base:
  - `cobro_plataforma_movimiento`: INSERT false, SELECT true;
  - `cobro_plataforma_tarifa`: SELECT false;
  - `organizacion.cobro_plataforma_por_orden`: UPDATE false, SELECT true.
- `pnpm run typecheck` → 0 errores (tras `prisma generate`).
- `pnpm exec eslint` sobre los archivos tocados: 0.
- `vitest run tests/integration/db/schema-drift-saneamiento.test.ts` → `Tests 16 passed (16)`.
- `vitest run tests/unit/db` → `Test Files 12 passed (12)`, `Tests 176 passed (176)`.
- `pnpm run test:guardias` → `Test Files 1 failed | 300 passed (301)`, `Tests 4 failed | 4111 passed | 1 skipped (4116)`.
  El único rojo es `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`: «init.sh ya
  no tiene el marcador», un rojo heredado que ya está en `tests/baseline-rojos.json`.
- Nota: `vitest related` sobre `lib/db/modelos-de-negocio.ts` arrastra casi toda la suite unitaria,
  porque la extensión lo importa. Se cortó y se corrió en su lugar `tests/unit/db`.

### T3 — migración 3: los triggers sobre `orden`

**Archivos:** `db/migrations/20261023130200_cobro_plataforma_triggers_orden/{migration,down}.sql`.
- `cobro_plataforma_al_crear_orden()`: `AFTER INSERT … WHEN (NEW.deleted_at IS NULL)`.
- `cobro_plataforma_al_cambiar_borrado()`: `AFTER UPDATE OF deleted_at … WHEN (OLD IS DISTINCT FROM NEW)`.
- Las dos son `SECURITY DEFINER`, con `SET search_path = public, pg_temp` y `REVOKE EXECUTE … FROM PUBLIC`.

**Decisión de implementación (dentro de design §2.2).** La dirección del movimiento la decide el
**último movimiento** junto con `NEW.deleted_at`, no `OLD.deleted_at`:
- borrada y el último es un cargo → reverso;
- viva y el último es un reverso → cargo.

Así, reescribir la fecha de una orden ya borrada (t1 → t2) dispara el trigger y no registra nada
(R17). Es el caso que hace medible la mutación 3 («doble reverso»).

**Verde** (`pnpm exec vitest run tests/integration/db/cobro-plataforma-cargos.test.ts --reporter=verbose`, base `sl40_tandaa`):

```
✓ control: los dos triggers están instalados en «orden» y las empresas existen
✓ R3/D11: sin valor global ni excepción, la orden se carga con 0.00 y fuente «sin_configurar»
✓ R12/R19: A crea o1 y o2 por pantalla y o3 por carga masiva con el global en 500.00 → tres cargos de 500.00
✓ R3/R20: B crea p1 con su excepción de 300.00 → cargo de 300.00 con fuente «empresa», sin tocar a A
✓ R14: el superadmin sube el global a 600.00 → los cargos ya registrados no cambian
✓ R12/R14: A crea o4 por la API → cargo de 600.00 (la tarifa de ese instante)
✓ R15: A elimina o1 por pantalla → reverso de 500.00 con el instante del borrado, y el cargo queda igual
✓ R17: eliminar o1 otra vez (servicio, repositorio y una fecha de borrado reescrita) no registra nada
✓ R16: el maestro recupera o1 → cargo nuevo de 500.00 (no la tarifa de hoy, 600.00)
✓ R17: recuperar o1 otra vez no registra nada
✓ R15: A elimina o2 por la API → reverso de 500.00
✓ P3/D6: la cancelación por API no es una anulación → o4 conserva su cargo, sin reverso
✓ R3/R5: quitada la excepción de B, su orden siguiente usa el global (600.00)
✓ R13: una transacción que crea una orden y no se confirma no deja cargo (dentro sí lo había)
✓ R18: una orden sin cargo (anterior a la ficha) se elimina y se recupera sin registrar nada
✓ R8: la empresa (servi_app) no puede escribir cargos, ni el valor global, ni su excepción → 42501
✓ R20: cada movimiento lleva la empresa de su orden, y un cargo de A con una orden de B → SL017
✓ R24: B (servi_app, por la RLS y por la extensión) ve sus cargos y ninguno de A
Test Files  1 passed (1)
Tests  18 passed (18)
VITEST_EXIT=0
```

Tras la corrida, la base queda sin residuo: 0 filas en `cobro_plataforma_tarifa` (como antes),
0 organizaciones de prueba y 0 movimientos.

**Mutaciones.** Las cuatro de design §11.1 (M1–M4) y una por cada test obligatorio que esas cuatro
no cubren.
- Cada una se aplica sobre `sl40_tandaa` como SQL y se corre el archivo entero.
- Cuando la mutación toca la función o el trigger, es la migración 3 mutada (su down y el up con un
  cambio); el resto es la pieza quitada (GRANT o DROP). Después se restaura.
- Antes y después hay una foto de control: md5 de funciones, triggers, privilegios de `servi_app`,
  RLS y políticas. La foto se comparó tras cada restauración y coincidió siempre con la del deploy:
  `9f0f9ba5…`, 11 piezas.
- Ningún caso salió como skip.

| # | Mutación | Resultado | Test que cae primero (el resto cae en cascada por el estado compartido) |
|---|---|---|---|
| M1 | el trigger ignora la excepción | 4 failed / 14 passed | R3/R20 «B crea p1 con su excepción de 300.00» |
| M2 | el reverso usa la tarifa de hoy | 5 failed / 13 passed | R15 «A elimina o1 por pantalla → reverso de 500.00» |
| M3 | no se comprueba el último movimiento | 5 failed / 13 passed | R17 «eliminar o1 otra vez … fecha de borrado reescrita» (doble reverso) |
| M4 | sin el `REVOKE` de la tabla de cargos (`GRANT INSERT, UPDATE, DELETE`) | 1 failed / 17 passed | R8 |
| M5 | el trigger no cubre la carga masiva con fulfillment (salta `en_preparacion`) | 10 failed / 8 passed | R12/R19 (o3); R3/D11 (o0, pantalla) sigue verde |
| M5b | el trigger no cubre las vías con guía (pantalla y API, salta `por_recolectar_en_tienda`) | 14 failed / 4 passed | R3/D11 (o0), R12/R19 (o1, o2), R12/R14 (o4, API) |
| M6 | sin trigger de creación | 17 failed / 1 passed | control (`pg_trigger`) y todas las creaciones |
| M7 | sin trigger de borrado | 7 failed / 11 passed | control, R15 por pantalla y R15 por API |
| M8 | recuperar no vuelve a cargar | 4 failed / 14 passed | R16 |
| M9 | recuperar carga la tarifa de hoy (600.00) | 4 failed / 14 passed | R16 |
| M10 | cambiar el global reescribe los cargos `global` (importe no congelado) | 8 failed / 10 passed | R14 |
| M11 | sin el `REVOKE` de la tarifa global (más una política abierta) | 1 failed / 17 passed | R8 |
| M12 | la empresa puede escribir su excepción (`GRANT UPDATE (cobro_plataforma_por_orden)`) | 1 failed / 17 passed | R8 |
| M13 | sin RLS en la tabla de cargos | 1 failed / 17 passed | R24 |
| M14 | sin el trigger de misma empresa | 1 failed / 17 passed | R20 (SL017) |
| M15 | sin configurar no registra cargo | 1 failed / 17 passed | R3/D11 |
| M16 | una orden sin movimientos recibe un reverso al anularse | 1 failed / 17 passed | R18 |

- La primera versión de M5 (`WHEN … AND num_guia IS NOT NULL`) no aislaba la vía: todas las vías
  insertan con `num_guia` nulo y numeran después, así que cayó todo (16/2). Se cambió por la de la tabla.
- Pantalla y API no se pueden separar con una mutación en la base. Las dos son el mismo INSERT con
  guía en `por_recolectar_en_tienda`, que es justo por lo que el diseño pone un trigger y no cuatro
  enganches en el código. Cada vía tiene su propio caso, que afirma el cargo de SU orden: o0, o1 y o2
  por pantalla, o3 por carga masiva y o4 por la API.
- R13 no tiene mutación propia: un trigger no puede escribir fuera de su transacción sin `dblink`.
  Su control de no vacuidad es que **dentro** de la transacción el cargo existía (`dentro = 1`) y fuera hay 0.

**Guardias** (con `DATABASE_URL` y el cliente regenerado dentro del lock): `Test Files 1 failed | 300 passed (301)`,
`Tests 4 failed | 4111 passed | 1 skipped (4116)`. El único rojo es `dependencias-declaradas-presentes`
(baseline).

**Cliente Prisma compartido.** Dos veces lo regeneró otro worktree después de que yo soltara el lock:
- a las 17:31, con un esquema sin mis modelos;
- a las 18:04, con `Distrito.zonaEspecial` de SL-38. Con ese cliente, `distrito.findMany` rompía en
  este worktree (`Unknown field zonaEspecial`).

Desde ahí, todo lo que usa el cliente corre con `gate.lock` tomado y `prisma generate` dentro.

### T4 — ida y vuelta, y no regresión de la carga

**Archivo:** `tests/integration/db/migracion-sl40-ida-y-vuelta.test.ts`.
- Base propia `sl40_iv_<rand>`, construida aplicando las migraciones anteriores, y borrada en el `afterAll`.
- Reutiliza `_fixtures/ida-y-vuelta-32.ts` y le suma funciones, triggers, políticas, RLS y privilegios
  de `servi_app` (la foto de SL-32 no los mira). Se quitan las filas, porque las órdenes del test las mueven.

```
✓ SL-40 R29 — las tres migraciones en disco > cada una trae su down.sql y van en orden detrás de la última de dev
✓ SL-40 R29 — cobro_plataforma de ida y vuelta > con las tres, crear y anular una orden deja su cargo (sin configurar) y su reverso
✓ … > los tres down.sql, en orden inverso, dejan el esquema como antes de SL-40, y crear y anular sigue funcionando
✓ … > reaplicadas las tres, todo vuelve igual que la primera vez y el trigger vuelve a cobrar
Test Files  1 passed (1)
Tests  4 passed (4)
VITEST_EXIT=0
```

**Mutaciones del test:** se edita el `down.sql`, se corre y se restaura con `git checkout`.

| Mutación | Resultado |
|---|---|
| IV-a: el down de 130200 sin `DROP FUNCTION cobro_plataforma_al_crear_orden()` | 2 failed / 2 passed: «tras los tres downs» (1 diferencia) y la reaplicación (`ya existe una función`) |
| IV-b: el down de 130000 sin `DROP COLUMN cobro_plataforma_por_orden` | 2 failed / 2 passed: «tras los tres downs» (1 diferencia) y la reaplicación (`ya existe la columna`) |

**Carga masiva de 500 órdenes.** `BulkOrdenService.cargarMasiva` real, una empresa, 500 filas por
llamada. Rama con guía (`createManyOrdenesConGuia`) y rama fulfillment (`createManyOrdenes`), 3
cargas de cada una por ronda, en ms. Se midió con un test temporal, no commiteado.
- La ronda 1 de «antes» corrió en frío, justo después de regenerar el cliente, y no se compara.
- Las rondas 2 y 3 se intercalan: los triggers se quitan con el down de 130200 y se reponen
  (la foto se comprobó después).

| Ronda | Con guía | Fulfillment | Movimientos |
|---|---|---|---|
| antes 1 (en frío) | 3166, 2740, 2991 | 1185, 1101, 1177 | 0 |
| después 1 | 1501, 1209, 1390 | 707, 667, 717 | 3000 |
| antes 2 | 1256, 1062, 1039 | 503, 460, 507 | 0 |
| después 2 | 1391, 1194, 1301 | 602, 525, 581 | 3000 |
| antes 3 | 1321, 1226, 1434 | 520, 466, 515 | 0 |
| después 3 | 1429, 1312, 1499 | 620, 558, 564 | 3000 |

Medianas de las rondas 2 y 3 (en caliente):
- con guía: 1241 → 1352 ms (+9 %, unos 0,22 ms por orden);
- fulfillment: 505 → 573 ms (+13 %, unos 0,14 ms por orden).

Son 3000 movimientos por ronda: 6 cargas × 500, un cargo por orden.

**Archivos con `DELETE FROM orden`, sin tocarlos** (`git diff origin/dev` vacío sobre los 13). Se
corrieron contra `sl40_tandaa` con las tres migraciones:
- `aislamiento-ordenes`;
- siete `notificacion-evento-*-migration`;
- `orden-traspaso-migration`;
- `orden-historial-origen-recoleccion-tienda-incidente-migration`;
- `order-status-retiro-en-fulfillment-migration`;
- `tests/unit/analytics/rollup-guards` y `tests/unit/db/extension-empresa`.

Resultado: `Test Files 5 failed | 8 passed (13)`, `Tests 6 failed | 329 passed | 10 skipped (345)`.

Los 5 rojos son rojos heredados que ya están en `tests/baseline-rojos.json` («La app nace vacía (SL-11) …
la retira SL-31»):
- `orden-traspaso-migration`;
- `notificacion-evento-{reparto-manana,cierre-rechazado,traspaso,geocodificacion-caida}-migration`.

El baseline compara por archivo, así que se comprobó **caso a caso** que no son de SL-40. Los mismos
5 archivos se corrieron también en el estado de `dev`: los tres downs aplicados en `sl40_tandaa` y las
tres carpetas fuera del árbol.
- Con SL-40 y sin SL-40 salen los **mismos 6 casos rojos** (`diff` vacío).
- Uno de ellos es el censo exacto de migraciones posteriores de `orden-traspaso`. Ya era rojo en
  `dev`: tiene 41 posteriores contra 33 declarados, y con SL-40 son 44.
- Después se reaplicaron las tres:
  - la foto de control coincide (`9f0f9ba5…`);
  - `migrate status` → «up to date»;
  - `migrate diff` → vacío.

Typecheck (con el cliente regenerado dentro del lock) → 0 errores. Lint de los tres archivos de test → 0.

## Mapa R<n> → test (tanda A)

| R | Test |
|---|---|
| R1, R2 (la parte de base: tabla de fila única, columna nulable, `CHECK >= 0`) | `cobro-plataforma-cargos` (R3/D11, R12/R19, R3/R5) y `migracion-sl40-ida-y-vuelta`. La validación del servidor y el repositorio son de T5 |
| R3 | `cobro-plataforma-cargos`: «R3/D11 sin valor global…», «R3/R20 B crea p1 con su excepción», «R3/R5 quitada la excepción de B» |
| R8 | `cobro-plataforma-cargos`: «R8: la empresa (servi_app) no puede escribir… → 42501» |
| R12 | `cobro-plataforma-cargos`: «R12/R19 A crea o1 y o2 por pantalla y o3 por carga masiva», «R12/R14 A crea o4 por la API» |
| R13 | `cobro-plataforma-cargos`: «R13: una transacción que crea una orden y no se confirma…» |
| R14 | `cobro-plataforma-cargos`: «R14: el superadmin sube el global a 600.00…», «R12/R14 … o4 a 600.00», «R16 … 500.00, no 600.00» |
| R15 | `cobro-plataforma-cargos`: «R15: A elimina o1 por pantalla…», «R15: A elimina o2 por la API…» |
| R16 | `cobro-plataforma-cargos`: «R16: el maestro recupera o1…» |
| R17 | `cobro-plataforma-cargos`: «R17: eliminar o1 otra vez…», «R17: recuperar o1 otra vez…» |
| R18 | `cobro-plataforma-cargos`: «R18: una orden sin cargo (anterior a la ficha)…» |
| R19 | `cobro-plataforma-cargos`: importes exactos `500.00`, `300.00`, `600.00` en cada paso |
| R20 | `cobro-plataforma-cargos`: «R20: cada movimiento lleva la empresa de su orden… → SL017» |
| R24 (la parte de base) | `cobro-plataforma-cargos`: «R24: B (servi_app, por la RLS y por la extensión)…». La deuda de la wallet es de T6 |
| R28 | `tests/unit/guards/organizacion-en-modelos.guardia.test.ts`, `rls-por-empresa.guardia.test.ts` (74), `fk-misma-empresa.guardia.test.ts` |
| R29 | `migracion-sl40-ida-y-vuelta` |
| P3/D6 | `cobro-plataforma-cargos`: «P3/D6: la cancelación por API no es una anulación…» |
| R4–R7, R9–R11, R21–R23, R25–R27 | Pendientes: tandas B y C (T5–T9) |

## Veredicto (tanda 0 + tanda A)

T0–T4 hechas: las tres migraciones con su down, los triggers registran cargo y reverso por las tres
vías de creación y las dos de anulación, 17 + 2 mutaciones medidas en rojo y ninguna regresión fuera del baseline.

## T5

Configuración del superadmin (R1–R7), tanda B. Base desechable `sl40_t5` (`migrate deploy` + `db:seed`,
borrada al terminar). Todo lo que usa el cliente corrió con `gate.lock` tomado y `prisma generate` dentro.
El MCP `codebase-memory-mcp` no estaba entre las herramientas de este agente: Grep/Read.

**Arreglo previo (`99a8938`).** `catalogo-postgres-acota-esquema` estaba en rojo por cinco consultas
de `migracion-sl40-ida-y-vuelta` sin esquema. Acotadas a `public` (`pg_trigger` por `pg_class` →
`pg_namespace`). Guardia 7/7 en verde; ida y vuelta 4/4 en verde contra la base; sin el
`DROP FUNCTION cobro_plataforma_al_crear_orden()` del down de 130200 → 2 failed / 2 passed, y sin el
`DROP TYPE "cobro_plataforma_fuente"` del down de 130100 → 2 failed / 2 passed.

**Archivos nuevos**
- `lib/types/cobro-plataforma.ts`: `montoCobroSchema` (texto `^\d{1,10}(\.\d{1,2})?$`, sin `Number`),
  `fijarCobroGlobalSchema`, `fijarCobroEmpresaSchema` (`monto` nulable = quitar), `CobroGlobalDTO`,
  `VerCobroGlobalResult` y `FijarCobroResult`. Los tipos de la deuda no están aquí: T6 los dejó en
  `IDeudaPlataformaService.ts` para no pisar este archivo.
- `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts` y
  `lib/repositories/CobroPlataformaTarifaRepository.ts`: `leerGlobal`, `fijarGlobal` (upsert de la fila
  `true`), `existeEmpresa` y `fijarDeEmpresa`, todo en `comoPlataforma("SL-40", …)`.
- `lib/interfaces/services/ICobroPlataformaService.ts` y `lib/services/CobroPlataformaService.ts`:
  `esPlataforma` (por import) → zod → existencia → escritura.
- `lib/actions/cobro-plataforma.ts` (`'use server'`): `verCobroGlobalAction`, `fijarCobroGlobalAction`
  y `fijarCobroEmpresaAction`, con `@sin-superficie` hasta que T8 las cablee en «Empresas».
- Tests: `tests/unit/types/cobro-plataforma-schema.test.ts`, `tests/unit/services/cobro-plataforma-service.test.ts`,
  `tests/unit/actions/cobro-plataforma.composition-root.test.ts`, `tests/integration/db/empresas-plataforma-cobro.test.ts`.

**Archivos modificados**
- `lib/db/excepciones-aislamiento.ts`: la fila de `CobroPlataformaTarifaRepository` (SL-40).
- `lib/types/empresas-plataforma.ts` y `lib/repositories/EmpresasPlataformaRepository.ts`:
  `cobroPorOrden: string | null` (`toFixed(2)` del `Decimal`).
- Tests de SL-32 que construyen o comparan `EmpresaListada` y fallaban por el campo nuevo (typecheck o
  aserción exacta): `tests/integration/db/empresas-plataforma.test.ts` (claves y filas esperadas),
  `tests/unit/actions/empresas-plataforma.composition-root.test.ts` (la fila falsa trae el `Decimal`,
  se espera `"300.00"`), y `cobroPorOrden: null` en los fixtures de `tests/components/empresas-module.test.tsx`,
  `tests/integration/empresas-page.test.tsx` y `tests/unit/services/empresas-plataforma-service.test.ts`.
- `tests/integration/db/cobro-plataforma-cargos.test.ts`: la desviación de T1 se cierra. El global
  (500.00 y 600.00) y la excepción de B (fijar y quitar) van ahora por `CobroPlataformaTarifaRepository`
  real (design §11.1). Solo «sin configurar» sigue en el fixture: el superadmin no tiene cómo borrar el
  global, y el fixture es quien restaura la fila. Sigue 18/18.

**Mutaciones** (cada una aplicada, corrida y restaurada; `git status` limpio después)

| # | Mutación | Resultado |
|---|---|---|
| T5-M1 | el servicio sin `esPlataforma` (`actor !== null`) | `cobro-plataforma-service` y composition root en rojo: los seis roles de empresa, «entrada inválida → forbidden» y «un maestro recibe forbidden» |
| T5-M2 | el composition root construye el servicio con `{}` en vez del repositorio real | composition root 3 failed / 1 passed |
| T5-M3 | `fijarDeEmpresa` con `where: {}` | `empresas-plataforma-cobro` 4 failed / 2 passed (R2 «deja a B sin tocar», R5 «conserva la de B», R7, R10) |
| T5-M4 | zod `\d{1,11}` (once cifras enteras) | schema 2 failed / 23 passed |
| T5-M5 | zod `\.\d{1,3}` (tres decimales) | schema y servicio, 2 failed / 47 passed |
| T5-M6 | el listado sin `cobroPlataformaPorOrden` en el `select` | `empresas-plataforma-cobro` R10, 1 failed / 5 passed |

**Evidencia** (base `sl40_t5`)
- Los 14 archivos tocados o relacionados, más `plataforma-solo-en-lista`, `superadmin-fuera-de-empresa`
  y `catalogo-postgres-acota-esquema`: `Test Files 14 passed (14)`, `Tests 166 passed (166)`, `VITEST_EXIT=0`,
  sin skips.
- `pnpm run test:guardias`: `Test Files 1 failed | 302 passed (303)`, `Tests 4 failed | 4139 passed | 1 skipped (4144)`.
  El único rojo es `dependencias-declaradas-presentes` (baseline).
- `pnpm run lint` sobre los 20 archivos: `No issues found`.
- `pnpm run typecheck`: 1 error, **no de T5**: `tests/unit/services/deuda-plataforma-service.test.ts(26,87)`,
  un `RolValue` pasado donde se espera `"maestro" | "admin"`. Es el archivo de T6, en curso en paralelo; no se tocó.

**Mapa R → test (T5)**

| R | Test |
|---|---|
| R1 | `empresas-plataforma-cobro` «R1/R3: sin fila el global es null; fijarlo crea la fila única…» y «R1/R4: el CHECK de la base rechaza un global negativo»; `cobro-plataforma-service` «R1/R9» |
| R2 | `empresas-plataforma-cobro` «R2: fijar la excepción de A la escribe en A y deja a B sin tocar»; servicio «R2» |
| R3 | `empresas-plataforma-cobro` «R1/R3» (sin fila → null); el resto en `cobro-plataforma-cargos` (tanda A) |
| R4 | `cobro-plataforma-schema` (negativos, tres decimales, once cifras, vacío, número); servicio «R4 — validation_error con el campo, sin escribir nada» |
| R5 | `empresas-plataforma-cobro` «R5: quitar la excepción de A…»; servicio «R5: monto null la quita»; `cobro-plataforma-cargos` «R3/R5» |
| R6 | servicio «R6 — solo el superadmin…» (cada rol de empresa del enum y sin actor, cero llamadas); composition root «un maestro recibe forbidden y el cliente no se toca» |
| R7 | servicio «R7: una empresa que no existe es not_found…» y «si desaparece entre la comprobación y la escritura»; `empresas-plataforma-cobro` «R7» |
| R10 (servidor) | `empresas-plataforma-cobro` «R10: el listado trae cobroPorOrden…»; la pantalla es de T8 |

**Veredicto T5:** configuración del superadmin hecha y probada contra la base, con 6 mutaciones medidas en rojo; el único rojo de typecheck es de T6.

## T8

«Cobro por orden» en «Empresas» (R9–R11), `frontend_dev`. Sin base de datos: todo es pantalla con
dobles. Vitest y typecheck con `gate.lock` tomado y `prisma generate` dentro (URL de marcador). El MCP
`codebase-memory-mcp` no estaba entre las herramientas de este agente: Grep/Read.

**Archivos**
- Nuevo `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`: `BloqueCobroGlobal` (h2, «Valor
  global: …» o «Sin configurar (0,00)», `FormField` + `Input inputMode="decimal"` + «Guardar», la ayuda de
  design §9.1) y `CeldaCobroEmpresa` (importe con `money`, «propio»/«global», «Cambiar» → editor en la fila
  con «Guardar», «Usar el global» solo con excepción, y «Cancelar»). Valida con el MISMO `montoCobroSchema`
  antes de llamar; tras éxito `router.refresh()` + `Alert role="status"` «Cobro guardado.»; errores:
  `validation_error` bajo el campo, `not_found` «Esa empresa ya no existe.», el resto genérico; lo escrito
  se conserva. La tarifa vigente se ELIGE (`cobroPorOrden ?? global ?? "0.00"`), sin aritmética.
- `EmpresasModule.tsx`: props `cobroGlobal`, `fijarCobroGlobal`, `fijarCobroEmpresa`; el bloque entre el
  aviso de alta y «Crear empresa»; la columna «Cobro por orden» después de «Alta».
- `page.tsx`: `verCobroGlobalAction()` en el mismo `Promise.all`; `forbidden` → `cobroGlobal: null`, y el
  bloque dice «No se pudo leer el valor global.» en vez de inventar un 0,00.
- `lib/actions/cobro-plataforma.ts`: quitadas las tres `@sin-superficie` (cableadas), con un JSDoc corto.
- Tests: nuevo `tests/components/EmpresasModuleCobro.test.tsx` (18). SL-32 ajustados sin cambiar lo que
  afirman: `tests/components/empresas-module.test.tsx` (las tres props nuevas en `montar`) y
  `tests/integration/empresas-page.test.tsx` (mock de `cobro-plataforma`, «no lee el valor global» en los
  casos de R35, y dos casos SL-40 R9: «Sin configurar (0,00)» y «no se pudo leer»).

**Desviaciones**
- El importe se pinta con `money` (design §7), así que «500.00» sale como `money("500.00")` (hoy «₡500», el
  formateador omite los `,00`) y no «500,00» como el ejemplo de §9.1. «Sin configurar (0,00)» va literal (R9).
- «Cancelar» en el editor de fila no está en §9.1: sin él no hay forma de cerrar el editor sin guardar.

**Mutaciones** (cada una aplicada, corrida y restaurada con copia de seguridad y comparación byte a byte)

| # | Mutación | Resultado |
|---|---|---|
| T8-M1 | quitar `<BloqueCobroGlobal>` del módulo | 9 failed / 9 passed (todo R9 y R11 del global) |
| T8-M2 | «global» siempre en la celda | 1 failed / 17 passed (R10 «propio»/«global») |
| T8-M3a | `setTexto("")` tras un fallo del global | 4 failed / 14 passed (R11 validation, schema, forbidden, red) |
| T8-M3b | `setTexto("")` tras un fallo de la fila | 2 failed / 16 passed (R11 not_found y validation de fila) |
| T8-M4a | sin `router.refresh()` tras guardar el global | 1 failed / 17 passed |
| T8-M4b | sin `router.refresh()` tras guardar la fila | 2 failed / 16 passed (fijar y «Usar el global») |
| T8-M0 | volver a poner la anotación de T5 en `verCobroGlobalAction` | `superficie-de-uso` 1 failed / 17 passed («ninguna anotación sobrevive a su motivo»): la guardia exige quitarlas |
| T8-M0b | la celda recibe un doble en vez de `fijarCobroEmpresa` | `superficie-de-uso` verde: la guardia mira el import de la página, no el cable de dentro. Lo cubre el test de componente («Guardar fija la excepción de ESA empresa»), no medido con esta mutación |

**Evidencia**
- `pnpm exec vitest run tests/components/EmpresasModuleCobro.test.tsx tests/components/empresas-module.test.tsx tests/integration/empresas-page.test.tsx`:
  `Test Files 3 passed (3)`, `Tests 54 passed (54)`, `VITEST_EXIT=0`.
- `pnpm run test:guardias`: `Test Files 1 failed | 300 passed | 2 skipped (303)`, `Tests 4 failed | 4120 passed | 20 skipped (4144)`.
  El único rojo es `dependencias-declaradas-presentes` (baseline).
- `pnpm exec eslint` sobre los 7 archivos: `No issues found`, `LINT_EXIT=0`.
- `pnpm run typecheck`: `TC_EXIT=2` con 1 error, de T6 en curso: `tests/unit/services/deuda-plataforma-service.test.ts(26,87)`.

**Mapa R → test (T8)**

| R | Test |
|---|---|
| R9 | `EmpresasModuleCobro` «sin valor global dice «Sin configurar (0,00)»…», «con valor global pinta ese importe…», «el bloque va antes de «Crear empresa»»; `empresas-page` «SL-40 (R9) — lee el valor global y lo pinta…» y «si no se pudo leer…» |
| R10 | `EmpresasModuleCobro` «la empresa con excepción pinta la suya y «propio»…», «sin valor global… 0,00 y «global»», ««Cambiar» abre el editor… fija la excepción de ESA empresa», ««Usar el global» quita la excepción (monto null)…» |
| R11 | `EmpresasModuleCobro` «tras un éxito…» (3: global con `rerender` de props nuevas, fila, «Usar el global») y «si falla, el error y lo escrito se conservan» (7: validation del servidor, schema en cliente, forbidden, red, not_found de fila, validation de fila, «Usar el global» que falla) |

**Veredicto T8:** bloque y columna del cobro en «Empresas» hechos, R9–R11 con test y 6 mutaciones de pantalla medidas en rojo; el único rojo de typecheck es de T6.
