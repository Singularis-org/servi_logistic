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

## T6

La deuda de la empresa con la plataforma (R23–R27), del lado del servidor. Base desechable
`sl40_t6` (`migrate deploy` + `db:seed`, borrada al terminar), y todo lo que usa el cliente corrió
con `gate.lock` tomado y `prisma generate` dentro. El MCP del grafo no estaba entre las
herramientas de este agente: se exploró con Grep/Read.

**Archivos (todos nuevos)**
- `lib/utils/deuda-plataforma.ts`: `derivarDeudaPlataforma(sumas)`, Σ cargo − Σ reverso en `Prisma.Decimal`, y el resultado como texto con dos decimales.
- `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts` y `lib/repositories/CobroPlataformaMovimientoRepository.ts`: `sumasPorTipo(organizacionId)`, un `groupBy` por `tipo` con `_sum.monto`. Ningún método escribe.
- `lib/interfaces/services/IDeudaPlataformaService.ts` y `lib/services/DeudaPlataformaService.ts`: `verDeuda(actor)`. Primero `esAccesoTotal`, y después el repositorio.
- `lib/actions/deuda-plataforma.ts`: `verDeudaPlataformaAction(deps = {})`, con su composition root. No recibe ningún parámetro del cliente (R23).
- Tests:
  - `tests/unit/utils/deuda-plataforma.test.ts`;
  - `tests/unit/services/deuda-plataforma-service.test.ts`;
  - `tests/unit/actions/deuda-plataforma.composition-root.test.ts`;
  - `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`;
  - `tests/integration/db/deuda-plataforma-wallet.test.ts`.

**Desviaciones (dentro del spec)**
1. **Los tipos `DeudaPlataformaDTO` y `VerDeudaPlataformaResult`** van en `IDeudaPlataformaService.ts`, no en
   `lib/types/cobro-plataforma.ts` (design §8). Ese archivo es de T5, que corría en paralelo. La forma
   es la de §8, y T5 lo anota en su cabecera. T7 los importa de ahí.
2. **El repositorio filtra explícitamente por `organizacionId`**, que le pasa el servicio desde
   `actor.organizacionId`, es decir, la sesión. Design §5 decía que no habría «ningún filtro más» y
   que bastaba la extensión.
   - No se usa `contextoActual()`: en una petición real la empresa la resuelve la extensión desde la
     cookie, y el contexto explícito está vacío.
   - El filtro se puede medir solo, construyendo el repositorio sobre el cliente dueño (sin
     extensión ni RLS). Es la mutación M2. Por la action, la extensión y la RLS siguen acotando igual.
3. **Un actor de acceso total sin `organizacionId` recibe `forbidden`**, sin leer nada.
4. **`verDeudaPlataformaAction` lleva `@sin-superficie`** hasta que T7 la cablee en
   `app/(app)/wallet/page.tsx`. Sin la anotación, `superficie-de-uso` se pondría en rojo. **T7 debe
   quitarla.**
5. **El montaje de `deuda-plataforma-wallet` es el molde de la 459 que commitea**
   (`_fixtures/escrituras-459`: `sembrarPersonas459` y `limpiar459`), con la caja y la deuda leídas
   por sus actions reales.
   - No se usa `sembrarEscenario459`: necesita una orden previa y la zona central, que una base
     recién migrada no tiene (por eso `caja-caracterizacion-459` está en el baseline).
   - La caja de A no está vacía: un ajuste real de 7777.77, con un control que lo comprueba.
   - Las órdenes se crean con el cliente extendido (`servi_app`) y se anulan con
     `EliminarOrdenService` real.

**`R<n>` → test**

| R | Test |
|---|---|
| R21 (el dato del servidor; la región es de T7) | `deuda-plataforma-wallet` «R21/R26: A crea dos órdenes con el global en 500.00 y anula una → la deuda sube 500.00, en texto» |
| R22 | `deuda-plataforma-wallet` «R22: todas las cifras del resumen y de la composición de la caja siguen iguales, campo a campo» (con el control «la caja de A tiene dinero…») |
| R23 | `deuda-plataforma-wallet` «R23: con los filtros de período del libro la caja cambia, y la deuda no» y «R23: la deuda cuenta los movimientos desde el principio, sin corte de fechas» |
| R24 | `deuda-plataforma-wallet` «R24: B ve solo su deuda (300.00, su excepción) y nada de la de A» (por la action) y «R24: el filtro del repositorio aísla por sí solo…» (cliente dueño); `deuda-plataforma.composition-root` (el `where` que llega al cliente) |
| R25 | `deuda-plataforma-service` (`forbidden` sin llamar al repositorio, para cada rol sin acceso total, sin actor y sin empresa); `deuda-plataforma.composition-root` (mensajero, adminTienda y superadmin); `deuda-plataforma-wallet` «R25» |
| R26 | `deuda-plataforma` (puro: Σ − Σ, tipo ausente, dos decimales, céntimos que un `number` pierde, la fuente sin `Number`/`parseFloat`); `deuda-plataforma-wallet` (la deuda llega como texto `"500.00"`) |
| R27 | `deuda-plataforma-wallet` «R27: los cargos y el reverso no escriben ninguna fila en wallet_movimiento» |
| R8 / D3 (escritura solo por trigger) | `cobro-plataforma-solo-por-trigger.guardia` |

**Mutaciones** (una a una, con copia y restauración por md5; ninguna salió como skip)

| # | Mutación | Resultado |
|---|---|---|
| M1 | sumar la deuda a `deEmpresa` en `WalletService.verResumenCaja` | `deuda-plataforma-wallet` 1 failed / 8 passed: R22 (`deEmpresa` `"7777.77"` → `"8277.77"`) |
| M2 | quitar `where: { organizacionId }` del repositorio | 2 failed / 12 passed: «R24: el filtro del repositorio aísla por sí solo» (`expected '800.00' to be '300.00'`) y el `where` del composition root |
| M3 | quitar el chequeo de acceso total del servicio (`!(esAccesoTotal(rol) \|\| true)`) | 9 failed: los 5 roles del servicio, 3 del composition root y R25 de integración |
| M4 | el composition root construye el servicio con un repositorio de mentira (`sumasPorTipo: async () => []`) | 5 failed / 9 passed: composition root, R21/R26, los dos R23 y R24 por la action |
| M5 | `Number` en la resta del puro | 2 failed / 5 passed: «conserva los céntimos donde un number ya no los guarda» y «la fuente no convierte importes a number» |
| M6a | la guardia sin su patrón de Prisma (`/(?!)/`) | la contraprueba cae: 9 failed (los 9 métodos que escriben) |
| M6b | la guardia sin su patrón de SQL | la contraprueba cae: 4 failed / 15 passed |
| M7 | un archivo plantado en `lib/utils/` que llama a `cobroPlataformaMovimiento.create` | 1 failed / 18 passed: «ningún archivo de lib/ ni de app/ escribe…», y el fallo nombra el archivo y la línea. Se borró |

**Evidencia** (`sl40_t6`, lock tomado)
- `pnpm exec vitest run` sobre los cinco archivos: `Test Files  5 passed (5)`, `Tests  50 passed (50)`, `VITEST_EXIT=0`. De ellos, `deuda-plataforma-wallet` son `Tests  9 passed (9)`, sin skips.
- Tras cada corrida, la base queda sin residuo: 0 organizaciones, 0 filas en `cobro_plataforma_tarifa`, 0 movimientos, 0 órdenes y 0 filas de caja.
- `pnpm run typecheck`: `TC_EXIT=0`, 0 errores. El rojo que anotaron T5 y T8 era de un archivo de T6 a medio escribir, y ya está corregido.
- `pnpm exec eslint` sobre los 11 archivos: «No issues found».
- `pnpm run test:guardias`: `Test Files  1 failed | 302 passed (303)`, `Tests  4 failed | 4139 passed | 1 skipped (4144)`. El único rojo es `dependencias-declaradas-presentes`, que está en el baseline. `superficie-de-uso` está en verde con la anotación.
- `git diff origin/dev -- lib/services/WalletService.ts lib/actions/wallet.ts lib/utils/caja-tesoreria.ts` → vacío (0 líneas).
- Los 11 archivos están en LF.

**Veredicto T6:** deuda con la plataforma servida por su propia action, con R21–R27 cubiertos (R21 en su parte de servidor), 8 mutaciones medidas en rojo y la caja intacta frente a `dev`.

## Merge de `origin/dev` (SL-38, dc95473) — implementer

- Merge sin rebase en `32e1c0f`. Choques resueltos: `lib/db/modelos-de-negocio.ts` (negocio 75,
  plataforma 15), `scripts/verificar-rls-despliegue.ts` (se queda el contrato derivado de
  `MODELOS_DE_NEGOCIO` de SL-38; `TRIGGERS_MISMA_EMPRESA` 150 → 151 por la FK de
  `cobro_plataforma_movimiento` a `orden`), `rls-por-empresa.guardia.test.ts` (75) y
  `tests/unit/scripts/verificar-rls-despliegue.test.ts` (75/151/75). `db/schema.prisma` mezcló solo.
- Tras el merge, `test:guardias` sacó un rojo nuevo, no del baseline: `catalogo-postgres-acota-esquema`
  por cinco consultas sin `public` en `migracion-sl40-ida-y-vuelta`. Arreglado en `99a8938` (T5).
- **Incidente:** una corrida de `test:guardias` del implementer, tras el merge, cargó un `.env` copiado
  del worktree principal, que apunta a la base compartida `servi-logistic`. Las guardias de integración
  corrieron contra ella (las de zona salieron en rojo porque esa base no tiene las migraciones de SL-38).
  El `.env` se borró en seguida; desde entonces se usa una base desechable `sl40_*`. Hay que confirmar
  que esa base quedó sin residuos.

## Gate de la tanda B (T5, T6, T8) — implementer

`TEST_RAPIDO_BASE=dev ./init.sh` sobre `8eb1cab`, con `DATABASE_URL` hacia `sl40_gate` (migrada y
sembrada; borrada al acabar), y el lock `gate.lock` tomado.
Log: `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl40-gate-1.log`.

```
 Test Files  874 passed (874)
      Tests  11752 passed | 26 skipped (11778)
 Test Files  302 passed (302)
      Tests  4128 passed | 1 skipped (4129)
INIT_EXIT=0
```

## Mapa R<n> → test (consolidado tras la tanda B)

| R | Test |
|---|---|
| R1, R2 | base: `cobro-plataforma-cargos`, `migracion-sl40-ida-y-vuelta`; servidor: `tests/unit/types/cobro-plataforma-schema.test.ts`, `tests/integration/db/empresas-plataforma-cobro.test.ts` |
| R3 | `cobro-plataforma-cargos` (R3/D11, R3/R20, R3/R5) |
| R4 | `tests/unit/types/cobro-plataforma-schema.test.ts`, `tests/unit/services/cobro-plataforma-service.test.ts` |
| R5 | `cobro-plataforma-cargos` (R3/R5), `empresas-plataforma-cobro`, `cobro-plataforma-service` |
| R6 | `cobro-plataforma-service` (`forbidden` sin llamar al repositorio) |
| R7 | `cobro-plataforma-service`, `empresas-plataforma-cobro` |
| R8 | `cobro-plataforma-cargos` (42501) |
| R9–R11 | `tests/components/EmpresasModuleCobro.test.tsx`, `tests/integration/empresas-page.test.tsx` |
| R12–R20 | `cobro-plataforma-cargos` (ver el mapa de la tanda A) |
| R21 | servidor: `tests/integration/db/deuda-plataforma-wallet.test.ts`; pantalla: `tests/components/WalletDeudaPlataformaSL40.test.tsx`, `tests/unit/components/wallet-labels.test.ts`; navegador: `e2e/cobro-plataforma-sl40.spec.ts` «T7» (T10) |
| R22 | `deuda-plataforma-wallet` |
| R23 | `deuda-plataforma-wallet` (filtros de período) |
| R24 | `cobro-plataforma-cargos` (R24), `deuda-plataforma-wallet` (B no ve la deuda de A) |
| R25 | `tests/unit/services/deuda-plataforma-service.test.ts` |
| R26 | servidor: `tests/unit/utils/deuda-plataforma.test.ts`; pantalla: `WalletDeudaPlataformaSL40` (R26, dos casos) |
| R27 | `deuda-plataforma-wallet` (0 filas en `wallet_movimiento`), `cobro-plataforma-solo-por-trigger.guardia`; descargas: `tests/components/descarga/WalletDescarga.test.tsx` sin tocar, en verde (T10) |
| R28 | `organizacion-en-modelos`, `rls-por-empresa` (75), `fk-misma-empresa`, `tests/unit/scripts/verificar-rls-despliegue.test.ts` |
| R29 | `migracion-sl40-ida-y-vuelta` |

## Pendiente

- **T7 y T9**: bloqueadas hasta que SL-39 entre en `dev` (sigue fuera a `dc95473`). Al cablear T7 hay
  que quitar el `@sin-superficie` de `lib/actions/deuda-plataforma.ts`.
- **T8 en el navegador**: no se hizo. Solo puede correr un dev server, y queda para el leader o para T10.
- **T10**: no regresión, `e2e/wallet.spec.ts` y el gate final.

## T7

La deuda con la plataforma en la wallet (R21, R23, R26), por `frontend_dev`, sobre `c760adc` (trae
SL-39). El MCP del grafo no estaba entre las herramientas de este agente: se exploró con Grep/Read.
Todo lo que usa `node_modules` corrió con `gate.lock` tomado y `prisma generate` dentro, con una
`DATABASE_URL` de marcador que no conecta. No se levantó dev server.

**Archivos**
- `app/(app)/wallet/page.tsx`: `verDeudaPlataformaAction()` en el mismo `Promise.all`, sin
  argumentos. Con `forbidden` pasa `null`, y la caja se pinta igual: no entra en el `notFound`.
- `app/(app)/wallet/_components/WalletModule.tsx`: prop `deudaPlataforma`, que solo transporta a la
  tarjeta. No la vuelve a pedir al cambiar filtros (R23).
- `app/(app)/wallet/_components/wallet-labels.ts`:
  - `CAJA_RESUMEN_LABEL.deudaPlataforma` = `Lo que ${EMPRESA.enFrase} debe a la plataforma`, y la pista exacta de R21;
  - el tipo `DatosBolsilloEmpresa` (`{ resumen, deudaPlataforma }`);
  - la entrada `deuda_plataforma`, la última de `REGIONES_BOLSILLO_EMPRESA`.
- `app/(app)/wallet/_components/CajaResumenCard.tsx`: prop `deudaPlataforma`. Una región cuyo `valor`
  es `null` no se pinta, y una con `signo` `null` va sin `Badge` y en `text-foreground`.
- `lib/actions/deuda-plataforma.ts`: fuera la anotación `@sin-superficie` (la única línea de `lib/`).
- Tests:
  - `tests/components/WalletDeudaPlataformaSL40.test.tsx` (nuevo, 10 casos): la tarjeta sola; la
    página real con el módulo real; el periodo del libro;
  - `tests/unit/components/wallet-labels.test.ts`: la lista con su tercera entrada y el caso `null`;
  - `tests/integration/wallet-page.test.tsx` y `tests/unit/components/wallet-page-cobros-pendientes.test.tsx`:
    solo un `vi.mock` de la action nueva. Sin él, la action real abre Prisma.

**Desviaciones (dentro del spec)**
1. **`deudaPlataforma` es opcional** (`?: DeudaPlataformaDTO | null`) en `WalletModule` y en
   `CajaResumenCard`. Design §9.2 lo tipa `DeudaPlataformaDTO | null`.
   - Si fuera requerida, habría que tocar siete tests que montan el módulo, entre ellos
     `WalletDescarga.test.tsx`, que T10 pide intacto. También los de la tarjeta, entre ellos
     `WalletCajaIvaSL39.test.tsx`, que esta task pide sin tocar.
   - Que la página la pase lo mide el test nuevo montando `page.tsx` real (M5 y M6, abajo), no el
     compilador.
2. **El accesor `signo` devuelve `WalletBalanceSigno | null`** y **`valor` devuelve `string | null`**.
   Así, «sin insignia» y «oculta» son datos de la entrada y no un `if (id === …)` en la tarjeta. Las
   dos entradas de SL-39 devuelven lo mismo que antes.
3. **El rótulo usa `EMPRESA.enFrase`**, no el literal «la empresa»: la guardia SL-15 R4 de
   `wallet-labels.test.ts` lo exige. En pantalla se lee igual.
4. **La comprobación en el navegador** de T7 (dos órdenes, una eliminada, 500,00 y la caja igual) no
   se hizo: queda para el leader.

**`R<n>` → test (pantalla)**

| R | Test |
|---|---|
| R21 | `WalletDeudaPlataformaSL40` «R21: con la deuda, el bolsillo de la empresa pinta la región…», «…es la última región del bolsillo…», «…sin insignia de signo y sin color de signo…», «…con la deuda en `null`, la región no se pinta…», «…sin la prop, tampoco se pinta…», «R21: la página pide la deuda una vez, sin filtros…», «…responde `forbidden`, la caja se pinta y la región no»; `wallet-labels` «R9 (SL-39) y R21 (SL-40)…» y «R21 (SL-40, design §9.2): sin deuda (`null`)…» |
| R23 | `WalletDeudaPlataformaSL40` «R23: con un periodo en el libro la caja se relee y la deuda ni se vuelve a pedir ni cambia» (con un control de que la ganancia sí cambió) |
| R26 | `WalletDeudaPlataformaSL40` «R26: once dígitos con céntimos salen exactos…» y «R26: ni la tarjeta ni los rótulos convierten un importe a número» |

**Mutaciones** (una a una, con copia y restauración comprobada por md5; corridas sobre
`WalletDeudaPlataformaSL40` + `wallet-labels`, 33 casos)

| # | Mutación | Resultado |
|---|---|---|
| M1 | quitar la entrada `deuda_plataforma` de `REGIONES_BOLSILLO_EMPRESA` | 8 failed / 25 passed: los 6 de la región y de la página, y los 2 de `wallet-labels` |
| M2 | pintar con `money(String(Number(valor)))` | 1 failed / 32 passed: «R26: ni la tarjeta ni los rótulos convierten un importe a número». El caso de once dígitos no lo mata: un `DECIMAL(12,2)` cabe exacto en un `number` y vuelve igual con `String`. El barrido de la fuente es el que lo detecta |
| M3 | insignia siempre (`badge ?? SIGNO_BADGE.cero`) | 1 failed / 32 passed: «R21: la región va sin insignia de signo y sin color de signo…» |
| M4 | no ocultar con `null` (`if (valor === "__nunca__")`) | 3 failed / 30 passed: «…con la deuda en `null`…», «…sin la prop…» y «…responde `forbidden`…» |
| M5 | `page.tsx` no pasa `deudaPlataforma` al módulo | 2 failed / 8 passed (solo `WalletDeudaPlataformaSL40`): «R21: la página pide la deuda…» y «R23» |
| M6 | `WalletModule` no la pasa a la tarjeta | 2 failed / 8 passed: los mismos dos |

**Evidencia** (lock tomado)
- `pnpm exec vitest run` sobre `WalletDeudaPlataformaSL40`, `wallet-labels`, `WalletCajaIvaSL39`,
  `ComposicionGananciaCard`, `wallet-page` y `wallet-page-cobros-pendientes`: `Test Files  6 passed (6)`,
  `Tests  103 passed (103)`, `VITEST_EXIT=0`. `WalletCajaIvaSL39.test.tsx` y
  `ComposicionGananciaCard.test.tsx` no se tocaron.
- `pnpm run typecheck`: `TC_EXIT=0`.
- `pnpm exec eslint` sobre los 9 archivos: `LINT_EXIT=0`, sin salida.
- `pnpm run test:guardias` (sin `DATABASE_URL`): `Test Files  1 failed | 300 passed | 2 skipped (303)`,
  `Tests  4 failed | 4126 passed | 20 skipped (4150)`.
  - El único rojo es `dependencias-declaradas-presentes`, que está en el baseline.
  - `superficie-de-uso` va en verde sin la anotación (corrido solo: `Tests  18 passed (18)`).
  - Ojo: con la `DATABASE_URL` de marcador exportada, `test:guardias` activa tests de
    `tests/integration/db/` (zona central, zona y distritos), que caen al no conectar. No son rojos
    de esta task: se repitió sin la variable.
- Los 9 archivos, en LF (`git ls-files --eol`: `w/lf`).

**Veredicto T7:** la región «Lo que la empresa debe a la plataforma» va cableada de la página a la
tarjeta, sin signo, oculta sin dato y fija frente a los filtros. Seis mutaciones medidas en rojo;
falta la comprobación en el navegador.

## T9

**Archivo:** `docs/ayuda/oficina/wallet-caja.md`.
- «Qué vas a ver» nombra la línea.
- Sección nueva, «Lo que la empresa debe a la plataforma», entre la del IVA y «De dónde entra el
  dinero solo». Explica:
  - qué cuenta: cada orden creada por cualquier vía, al importe del día en que se creó; una eliminada
    resta, y una recuperada vuelve a sumar;
  - que la cancelación por API sigue contando (P3);
  - que es de toda la historia y no la mueven los filtros;
  - que todavía no se cobra y no aparece en el libro;
  - que no cambia ninguna cifra de la caja, y por eso no lleva signo.
- `fuentes:` gana `lib/actions/deuda-plataforma.ts`.
- `actualizado:` ya decía `2026-10-23`, del merge de SL-39, así que se queda igual.

**Evidencia** (lock tomado)
- `pnpm exec vitest related --run docs/ayuda/oficina/wallet-caja.md`: `No test files found, exiting
  with code 0`. Un `.md` no se importa, así que `related` no ve nada y no sirve de prueba aquí. Por eso
  se corrieron a mano los tests que leen la ayuda:
  - `tests/unit/asistente`, `AyudaDocumentoPage`, `AyudaLayout`, `AyudaBoton` y `changelog-455`:
    `Test Files  16 passed (16)`, `Tests  249 passed (249)`;
  - `tests/unit/ayuda`: `Test Files  3 passed (3)`, `Tests  40 passed (40)`;
  - `pnpm run test:guardias`, que incluye las guardias de ayuda y `docs-marca-heredada`: el mismo
    resultado que en T7, con un solo rojo, el del baseline.
- El archivo está en LF.

**Veredicto T9:** la ayuda de la caja explica la deuda con la plataforma con el tono del archivo, y sus
guardias van en verde.

## T10

Cierre, por `frontend_dev`, sobre `782ec13`. Base desechable `sl40_e2e` (`migrate deploy` + `db:seed`,
borrada con `DROP DATABASE … WITH (FORCE)` al acabar), creada con el helper `sl40-env.sh` sin imprimir
URLs. `gate.lock` tomado («SL-40 T10») con `prisma generate` dentro, durante el dev server y los E2E, y
soltado al final. Un solo dev server (`pnpm dev` desde este worktree, puerto 3000 libre antes, sin
`SMTP_*`, `AUTH_OTP_DEBUG_LOG=1`, log en `SL17_HUMO_LOG_SERVIDOR`). Apagado al acabar: el 3000 quedó
libre y se borró `.next/dev`. El MCP del grafo no estaba entre las herramientas: Grep/Read. El gate
final (`./init.sh`) es del leader.

Logs y capturas en
`C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl40-e2e/`.

**Archivos**
- Nuevo `e2e/cobro-plataforma-sl40.spec.ts` (2 casos, serie). Ningún otro archivo de código ni de
  tests cambia.

**1. No regresión (R24, R27)**, los cuatro archivos sin tocar, contra `sl40_e2e`:

```
pnpm exec vitest run tests/integration/db/libro-kardex-468.test.ts tests/components/descarga/WalletDescarga.test.tsx \
  tests/integration/db/aislamiento-ordenes.test.ts tests/integration/db/aislamiento-wallet.test.ts
 ❯ tests/integration/db/libro-kardex-468.test.ts (6 tests | 6 skipped)
 FAIL  tests/integration/db/libro-kardex-468.test.ts > 468 — el libro en Excel (Postgres real)
Error: hay DATABASE_URL pero faltan la zona central, el tipo `cedula` o una orden de la que tomar provincia y canton: esta suite necesita crear sus datos en el test (SL-31).
 Test Files  1 failed | 3 passed (4)
      Tests  33 passed | 6 skipped (39)
VITEST_EXIT=1
```

- `WalletDescarga`, `aislamiento-ordenes` y `aislamiento-wallet`: verdes (33 casos).
- `libro-kardex-468` está en `tests/baseline-rojos.json` («La app nace vacia… La retira SL-31»). Cae
  en el `beforeAll` por falta de datos sembrados, antes de ejecutar nada de SL-40. Corrido también
  sobre `origin/dev` (`f90799a`, worktree temporal con junction de `node_modules`, ya borrado),
  contra la misma base: el mismo rojo, `Test Files 1 failed (1)`, `Tests 6 skipped (6)`,
  `VITEST_EXIT=1`. No es regresión de SL-40.

**2. E2E existentes**

```
pnpm exec playwright test e2e/superadmin-empresas.spec.ts --reporter=list
  ok 1 › 1. «Empresas» abre en el estado vacío (R29) (1.2s)
  ok 2 › 2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29) (1.6s)
  ok 3 › 3. repetir el slug, el email o el documento de A marca su campo y no crea nada (R31, R32, R33) (4.1s)
  ok 4 › 4. un slug inválido marca el campo sin crear nada (R34) (1.1s)
  ok 5 › 5-6. el maestro de A entra con «¿Olvidaste tu contraseña?», «Empresas» le da 404 y no la ve (R37, R35) (3.4s)
  ok 6 › 5-6. el maestro de B entra con «¿Olvidaste tu contraseña?», «Empresas» le da 404 y no la ve (R37, R35) (2.9s)
  6 passed (28.9s)
PW_EXIT=0

SL39_UI=1 pnpm exec playwright test e2e/wallet-iva-aparte-sl39.spec.ts --reporter=list
  ok 1 › SL-39 /wallet de A: IVA cobrado 416,00 aparte y ganancia 1.700,00 (5.7s)
  ok 2 › SL-39 /wallet de B: IVA cobrado 6,50 y ganancia 40,00, sin un centimo de A (1.6s)
  ok 3 › SL-39 cierres-admin de A: la cascada del cierre A resta el IVA facturado 416,00 y el neto es 1.700,00 (5.9s)
  ok 4 › SL-39 cierres-admin de A: el cierre B (rechazo) «Debe» 100,00 con la nota sin IVA (1.2s)
  4 passed (18.9s)
PW_EXIT=0

pnpm exec playwright test e2e/wallet.spec.ts --reporter=list
  x  1 › Wallet — bloqueo de rol NO autorizado › un mensajero es rechazado en /wallet y NO ve movimientos ni balance (R19) (5.7s)
  x  2 › Wallet — acceso del maestro (libro + balance + manual) › ve el balance derivado y el libro → … (5.6s)
    TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
  2 failed
PW_EXIT=1
```

- **`e2e/wallet.spec.ts` sale en rojo, y es heredado.** Entra con usuarios fijos
  (`maestro@example.com` / `mensajero@example.com`, `correct-password`) que una base vacía no tiene, y
  espera `waitForURL("/")`. El archivo es idéntico a `origin/dev` (`git diff origin/dev` vacío), y
  `specs/SL-44-e2e-verde-ci/requirements.md` lo lista entre los 21 E2E heredados en rojo por ese
  motivo. No hay baseline de E2E. El recorrido de la wallet de SL-40 lo cubre el E2E nuevo.

**3. E2E nuevo `e2e/cobro-plataforma-sl40.spec.ts`** (solo con `SL40_UI=1`, como el de SL-39)

- **T8 (R9–R11).** El superadmin, logado con OTP del log, abre «Empresas». El valor global sale como
  «Sin configurar (0,00)», y la fila de A, «₡0 · global». Se fija el global en `500.00`: «Cobro
  guardado.», «Valor global: ₡500» y la fila de A en «₡500 · global». Se fija la excepción de A en
  `750.00`: «₡750 · propio», y en la base `cobro_plataforma_por_orden = 750.00`. «Usar el global» la
  quita: «₡500 · global» y en la base `NULL`. Una marca en `window`, puesta antes del primer guardado,
  sigue al final: ningún valor necesitó recargar.
- **T7 (R21, R22).** A se da de alta por el servicio, con la caja de SL-39 (`CAJA_A`) y un saldo
  inicial de 10.000,00, para que la barra de reparto, y con ella «De la empresa», se pinte. Las
  órdenes se crean y se eliminan con el cliente dueño y la empresa fijada: el INSERT y el UPDATE de
  `deleted_at` pasan por los triggers. La base, leída por detrás: `0:cargo:500.00, 1:cargo:500.00` y
  después `+ 1:reverso:500.00`.

Números medidos en `/wallet` de A (lo que pinta la app):

| | cifra principal | Entró | Salió | ganancia | IVA | saldo inicial y aportes | tiendas | De la empresa (barra) | deuda |
|---|---|---|---|---|---|---|---|---|---|
| antes | Dinero en caja ₡28.500 | ₡30.000 | ₡1.500 | ₡1.700 | ₡416 | ₡10.000 | ₡16.384 | ₡12.116 | ₡0 |
| dos órdenes | Dinero en caja ₡28.500 | ₡30.000 | ₡1.500 | ₡1.700 | ₡416 | ₡10.000 | ₡16.384 | ₡12.116 | ₡1.000 |
| una eliminada | Dinero en caja ₡28.500 | ₡30.000 | ₡1.500 | ₡1.700 | ₡416 | ₡10.000 | ₡16.384 | ₡12.116 | ₡500 |

El spec también compara el texto entero de la tarjeta de la caja, sin la región de la deuda, y el de
«Cómo se compone la ganancia de la empresa»: iguales en las tres lecturas (R22). La región va sin
insignia de signo, con la pista de R21.

```
SL40_UI=1 pnpm exec playwright test e2e/cobro-plataforma-sl40.spec.ts --reporter=list
  ok 1 › T8: el superadmin fija el global, fija y quita la excepción de A, y ve cada valor sin recargar (R9–R11) (1.8s)
  ok 2 › T7: A crea dos órdenes y elimina una; la deuda dice ₡500 y la caja no cambia (R21, R22) (3.4s)
  2 passed (11.1s)
PW_EXIT=0
```

Capturas: `…/scratchpad/sl40-e2e/sl40-empresas.png` y `…/scratchpad/sl40-e2e/sl40-wallet.png` (ruta
completa arriba).

**Mutación** (copia, corrida y restauración comprobada por md5): quitar la entrada `deuda_plataforma`
de `REGIONES_BOLSILLO_EMPRESA`:

```
  ok 1 › T8: … (2.1s)
  x  2 › T7: A crea dos órdenes y elimina una; la deuda dice ₡500 y la caja no cambia (R21, R22) (7.1s)
    Error: la región de la deuda con la plataforma
    expect(locator).toHaveCount(expected) failed
  1 failed
  1 passed (15.6s)
PW_EXIT=1
```

Restaurado (`RESTAURADO_OK`, `git status` sin cambios en `wallet-labels.ts`) y vuelto a correr:
`2 passed (12.4s)`, `PW_EXIT=0`.

**Verificación propia** (con `.next/dev` borrado)
- `pnpm run typecheck`: `TC_EXIT=0`.
- `pnpm run lint`: `LINT_EXIT=0`, `0 errors, 232 warnings`, todos heredados.
  `pnpm exec eslint e2e/cobro-plataforma-sl40.spec.ts`: «No issues found».
- El archivo nuevo está en LF y no nombra a Ordenex.

**Desviaciones**
1. El E2E nuevo se salta sin `SL40_UI=1`, como el de SL-39. El E2E de CI no tiene log del servidor
   para el OTP ni siembra, así que añadiría otro rojo de entorno (SL-44).
2. Las órdenes se crean y se eliminan por fixture con los triggers, no por la pantalla: el encargo lo
   admite. La vía de `EliminarOrdenService` ya la mide `deuda-plataforma-wallet`.
3. «De la empresa» se lee del nombre accesible de la barra, que solo existe con saldo inicial. Por eso
   la siembra añade uno.

## Mapa R<n> → test (final, R1–R29)

| R | Test |
|---|---|
| R1, R2 | `cobro-plataforma-cargos`, `migracion-sl40-ida-y-vuelta`, `tests/unit/types/cobro-plataforma-schema.test.ts`, `tests/integration/db/empresas-plataforma-cobro.test.ts` |
| R3 | `cobro-plataforma-cargos` (R3/D11, R3/R20, R3/R5) |
| R4 | `cobro-plataforma-schema`, `cobro-plataforma-service` |
| R5 | `cobro-plataforma-cargos` (R3/R5), `empresas-plataforma-cobro`, `cobro-plataforma-service`; navegador: `e2e/cobro-plataforma-sl40.spec.ts` «T8» («Usar el global») |
| R6 | `cobro-plataforma-service` (`forbidden` sin repositorio), `cobro-plataforma.composition-root` |
| R7 | `cobro-plataforma-service`, `empresas-plataforma-cobro` |
| R8 | `cobro-plataforma-cargos` (42501), `cobro-plataforma-solo-por-trigger.guardia` |
| R9 | `tests/components/EmpresasModuleCobro.test.tsx`, `tests/integration/empresas-page.test.tsx`; navegador: `cobro-plataforma-sl40` «T8» |
| R10 | `EmpresasModuleCobro`; navegador: `cobro-plataforma-sl40` «T8» («global»/«propio») |
| R11 | `EmpresasModuleCobro`; navegador: `cobro-plataforma-sl40` «T8» (marca en `window`) |
| R12–R20 | `cobro-plataforma-cargos` (ver el mapa de la tanda A); R12/R15 también en `cobro-plataforma-sl40` «T7» (cargos y reverso leídos de la base) |
| R21 | `deuda-plataforma-wallet`, `WalletDeudaPlataformaSL40`, `wallet-labels`; navegador: `cobro-plataforma-sl40` «T7» |
| R22 | `deuda-plataforma-wallet`; navegador: `cobro-plataforma-sl40` «T7» (todas las cifras y el texto de las dos tarjetas, iguales en las tres lecturas) |
| R23 | `deuda-plataforma-wallet`, `WalletDeudaPlataformaSL40` «R23» |
| R24 | `cobro-plataforma-cargos` (R24), `deuda-plataforma-wallet`, `deuda-plataforma.composition-root`; no regresión: `aislamiento-ordenes`, `aislamiento-wallet` (T10, verdes) |
| R25 | `deuda-plataforma-service`, `deuda-plataforma.composition-root`, `deuda-plataforma-wallet` «R25» |
| R26 | `deuda-plataforma` (puro), `deuda-plataforma-wallet`, `WalletDeudaPlataformaSL40` «R26» |
| R27 | `deuda-plataforma-wallet` (0 filas en `wallet_movimiento`), `cobro-plataforma-solo-por-trigger.guardia`, `WalletDescarga` sin tocar y en verde (T10); `libro-kardex-468` en el baseline (rojo igual en `origin/dev`) |
| R28 | `organizacion-en-modelos`, `rls-por-empresa` (75), `fk-misma-empresa`, `tests/unit/scripts/verificar-rls-despliegue.test.ts` |
| R29 | `migracion-sl40-ida-y-vuelta` |

**Veredicto T10:** la comprobación en el navegador de T7 y T8 está en verde: deuda «₡500» y la caja
igual en las tres lecturas, con la mutación medida en rojo. La no regresión pasa, salvo el rojo de
baseline de `libro-kardex-468`, igual en `dev`. `e2e/wallet.spec.ts` sigue en rojo por herencia
(SL-44). Falta el gate final del leader.

## Estado final (implementer, 2026-10-24)

- Hechas T0–T10, con la rama al día con `origin/dev` f90799a (SL-38 y SL-39 dentro).
- Gate final sobre `5443464`: `TEST_RAPIDO_BASE=origin/dev ./init.sh`, con el lock tomado y contra
  `sl40_gate` (migrada y sembrada).
  - Primera corrida (`sl40-gate-2.log`): `INIT_EXIT=1`, por 3 guardias que agotaron los 20 s
    (`tarifa-status-retirado`, `catalogo-postgres-acota-esquema`, `dominio-ordenex-fuera`). Corridas
    solas dieron 24/24 en verde, así que eran saturación y no un rojo de SL-40.
  - Segunda corrida (`sl40-gate-3.log`):
    ```
     Test Files  897 passed (897)
          Tests  12096 passed | 26 skipped (12122)
     Test Files  302 passed (302)
          Tests  4134 passed | 1 skipped (4135)
    INIT_EXIT=0
    ```
  - Los dos logs están en
    `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/`.
- E2E: `e2e/wallet.spec.ts` da 2 rojos heredados: usuarios de ejemplo que la base vacía no tiene; el
  archivo es igual al de `dev` y lo lista SL-44. El resto en verde, también `cobro-plataforma-sl40`
  (ver «## T10»).
- Limpieza: no queda ninguna base `sl40_*` (comprobado en `pg_database`). Dev server apagado, puerto
  3000 libre y `gate.lock` suelto.
- Abierto para el leader:
  - Confirmar que la base compartida `servi-logistic` quedó sin residuo de la corrida de guardias del
    incidente (ver «Merge de origin/dev»).
  - `wallet.spec.ts` rojo heredado (SL-44).
  - `cobro-plataforma-sl40` corre solo con `SL40_UI=1`.
