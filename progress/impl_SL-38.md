# SL-38 «Distritos de zona especial por empresa» — bitácora de implementación

Spec: `specs/SL-38-zona-especial-por-empresa/` (commit `b16688a`), aprobado por Carlos el 2026-10-23
con P1: el Excel de cobertura queda con «Sí»/«No».

## Entorno

- Worktree `.worktrees/SL-38-zona-especial-por-empresa`, rama `feature/SL-38-zona-especial-por-empresa`.
- `node_modules` es un junction al del checkout principal, compartido con SL-32. `prisma generate`,
  el gate y el e2e corren dentro de un lock fuera del repo.
- Bases: Postgres local, solo bases desechables `sl38_*`. La base `servi-logistic` no se toca.

## T0 — Timestamps y base

- `origin/dev` (`197039c`): última migración `20261023090000_unicos_por_empresa`.
- `origin/feature/SL-32-rol-superadmin`: última migración `20261023100200_usuario_empresa_o_superadmin`.
- Las de SL-38, `20261023120000` y `20261023120100`, son posteriores a las dos. No se renumera nada.
- Base `sl38_base` recién creada + `prisma migrate deploy` (233 migraciones):
  `SELECT count(*) FROM distrito WHERE zona_especial IS TRUE` → **0** (de 494 distritos).

## T1-T2 — El modelo de la empresa

### Archivos

- Nuevos: `db/migrations/20261023120000_distrito_zona_especial_por_empresa/{migration,down}.sql`
  (SQL de design §2.1), `tests/integration/db/distrito-zona-especial-por-empresa.test.ts`.
- Modificados: `db/schema.prisma` (modelo `DistritoZonaEspecial`, `Distrito.zonasEspeciales`,
  `Organizacion.distritoZonasEspeciales`; `Distrito.zonaEspecial` sigue hasta T7),
  `lib/db/modelos-de-negocio.ts` (entrada en «Zonas y tarifas», cabecera 74),
  `tests/unit/guards/rls-por-empresa.guardia.test.ts` (`toBe(74)`), `lib/db/fk-de-negocio.ts`
  (solo el comentario «Hoy los 74 caben»).
- Otras cuentas de 73 a mano: `scripts/verificar-rls-despliegue.ts` (`POLITICAS_POR_EMPRESA` y
  `TRIGGERS_SIN_CAMBIO`). No se toca aqui: es T10/R23, que la deriva de `MODELOS_DE_NEGOCIO.length`.

### Base `sl38_base`

- `prisma migrate deploy`: aplica solo `20261023120000_distrito_zona_especial_por_empresa`.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` →
  `-- This is an empty migration.` (antes y despues de las mutaciones).
- Tras restaurar las mutaciones: 1 politica en `pg_policies`, el trigger
  `distrito_zona_especial_sin_cambio_de_empresa` en `pg_trigger`, 0 filas en la tabla.

### R → test (`distrito-zona-especial-por-empresa.test.ts`)

| R | Caso |
|---|---|
| R1 | «una segunda marca del mismo (empresa, distrito) falla con 23505; la misma marca en otra empresa pasa» |
| R3 | «con comoApp(B), la tabla, el join desde distrito y el join desde orden no traen la marca de A; B si ve la suya» · «con comoApp(B), insertar una marca con la empresa de A da 42501» · «el cliente de la app con la empresa B lee el distrito D y la orden de B sin la marca de A; con A, la trae» |
| R4 | «cambiar el organizacion_id de una marca da SL017 como dueno» · «con comoApp(B), mover la marca propia de B a la empresa A da SL017» |
| R10 | «con comoApp(B), B marca y desmarca D: borra solo la suya, la de A sigue y la fila de distrito no cambia» |
| R2 | guardias `organizacion-en-modelos`, `rls-por-empresa` (74) y `fk-misma-empresa`, en verde |

Desviacion del design §6: T2 va antes que el repositorio (T6), asi que la lectura anidada se mide
con el cliente de la app (`conAislamientoPorEmpresa` + `conEmpresa`), no con un repositorio. Las
lecturas por repositorio real son de T8. Un caso de `app.distritoZonaEspecial.deleteMany` desde B se
escribio y se quito: la extension ya filtra por empresa y ninguna mutacion de la base lo mataba.

### Verde (`vitest run --reporter=verbose`, base `sl38_base`)

```
 ✓ R1: una segunda marca del mismo (empresa, distrito) falla con 23505; la misma marca en otra empresa pasa
 ✓ R3: con comoApp(B), la tabla, el join desde distrito y el join desde orden no traen la marca de A; B si ve la suya
 ✓ R3: con comoApp(B), insertar una marca con la empresa de A da 42501 y no escribe nada
 ✓ R3: el cliente de la app con la empresa B lee el distrito D y la orden de B sin la marca de A; con A, la trae
 ✓ R4: cambiar el organizacion_id de una marca da SL017 como dueno, y la marca no cambia
 ✓ R4: con comoApp(B), mover la marca propia de B a la empresa A da SL017 (el trigger va antes que la politica)
 ✓ R10: con comoApp(B), B marca y desmarca D: borra solo la suya, la de A sigue y la fila de distrito no cambia
 Tests  7 passed (7)
```

### Mutaciones (en `sl38_base` por SQL, restauradas despues; la migracion commiteada no se toca)

1. `DROP POLICY "distrito_zona_especial_por_empresa"` (RLS sin politica = deniega todo a servi_app):
   ```
    ✓ R1   × R3 tabla/joins   × R3 insert 42501   × R3 cliente de la app
    ✓ R4 dueno   × R4 comoApp(B)   × R10
    Tests  5 failed | 2 passed (7)
   ```
2. Politica abierta (`USING (true) WITH CHECK (true)`): B ve y escribe lo de A.
   ```
    ✓ R1   × R3 tabla/joins   × R3 insert 42501   × R3 cliente de la app
    ✓ R4 dueno   ✓ R4 comoApp(B)   × R10
    Tests  4 failed | 3 passed (7)
   ```
3. `DROP TRIGGER "distrito_zona_especial_sin_cambio_de_empresa"`:
   ```
    ✓ R1   ✓ R3 (x3)   × R4 dueno   × R4 comoApp(B)   ✓ R10
    Tests  2 failed | 5 passed (7)
   ```
4. `DROP INDEX "distrito_zona_especial_organizacion_id_distrito_id_key"` (el unico de R1):
   ```
    × R1   ✓ el resto
    Tests  1 failed | 6 passed (7)
   ```
5. Sin sembrar la marca de A (el `create` del `beforeAll` cambiado por un id fijo, y restaurado):
   ```
   AssertionError: expected [] to deeply equal [ { id: 'sin-sembrar', …(2) } ]
    Test Files  1 failed (1)    Tests  7 skipped (7)    EXIT=1
   ```
   El archivo FALLA en el `beforeAll`; no hay `return` ni skip silencioso que lo deje verde.

Cada caso del archivo cae con al menos una mutacion: R1 con la 4, R3 con la 1 y la 2, R4 con la 3,
R10 con la 1 y la 2.

### Verificacion

- `pnpm run typecheck` → exit 0 (con el cliente regenerado bajo el lock).
- `pnpm exec eslint` sobre los archivos tocados → `No issues found`.
- `pnpm run test:guardias` → `Test Files 1 failed | 299 passed (300)`, `Tests 4 failed | 4096 passed |
  1 skipped`. Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts`, que esta en
  `tests/baseline-rojos.json` (init.sh del arnes v2, ajeno). `organizacion-en-modelos`,
  `rls-por-empresa` y `fk-misma-empresa` en verde.
- Incidencia de entorno: en la segunda corrida el `rmdir` del lock dijo que ya no existia (otro
  proceso lo quito mientras corria el test). El test salio en verde igual y las corridas siguientes
  tomaron y soltaron el lock sin problema.

Veredicto T1-T2: tabla por empresa con RLS, unico y trigger en su sitio, sin drift; 7/7 en verde y
cada caso muerto por una mutacion.

## T3-T5 — Las lecturas pasan a la marca de la empresa

Commits: T3 `92c07cc`, T4 `1623a09`, T5 (este).

### Archivos

- T3, nuevos: `lib/repositories/_shared/zona-especial.ts` (`SELECT_MARCA_ZONA_ESPECIAL`,
  `esZonaEspecialDeLaEmpresa` y el tipo `MarcaZonaEspecialProyectada`, para tipar `ApiOrdenSelectRow`
  sin nombrar la relacion), `tests/unit/guards/zona-especial-punto-unico.guardia.test.ts`.
- T4: `lib/repositories/OrdenRepository.ts` (las seis lecturas). Solo comentarios en
  `IOrdenRepository.ts`, `ITarifaVigenteRepository.ts`, `ICorregirDatosClienteService.ts`,
  `BulkOrdenService.ts`, `CorregirDatosClienteService.ts`, `geo-resolucion.ts`,
  `correccion-datos-cliente.ts`, `api-orden-costo.ts`, `ingreso-empresa.ts`. Dobles:
  `orden-repository.{api-lectura,bulk,no-regresion-106,recepcion-satelite}.test.ts`,
  `orden-repository.test.ts`, `satelite-paginado-where.test.ts`, `costo-orden-forma-unica.guardia`,
  `ordenes-api-key-composicion-415`, `corregir-datos-cliente.composition-root`,
  `api-pdf-etiqueta-columna-intacta`, `tarifa-especial-por-distrito`.
- T5: `GeoRepository.ts`, `CoberturaRepository.ts`, `ICoberturaRepository.ts`, `lib/types/cobertura.ts`,
  `lib/types/geografia-nodo.ts` (comentario), `cobertura-descarga-columnas.ts` (sin «Sin definir»),
  `CierreDiaRepository.ts` (`leerDescriptivosDeOrdenes` y la linea del congelado). Tests:
  `cobertura-descarga-columnas`, `cobertura-distrito`, `_cobertura-fixtures`, `cobertura-vs-resolve-geo`,
  `cobertura.composition-root`, `DescargarCoberturaButton`, `cobertura-repository` (integracion: siembra
  la marca con la empresa que fija `enTransaccionRevertida`), y los dobles de catalogo de
  `cierre-dia-repository`, `convergencia-tarifa-listado-cierre`, `gestion-desde-ayuda-cierre`,
  `asimetria-sin-tarifa`, `cierre-detail-congelado`.
- `lib/utils/cobertura-distrito.ts` no cambia: copia `row.distrito.zonaEspecial`, que ya llega `boolean`.

### Desviaciones de la lista de «Archivos esperados»

- Fuera de la lista y tocados (dobles que reventaban con `TypeError` al no traer `zonasEspeciales`):
  `orden-repository.test.ts`, `api-pdf-etiqueta-columna-intacta.test.ts`,
  `tarifa-especial-por-distrito.test.ts`. En este ultimo el caso «`zona_especial` NULL no es especial»
  pasa a «una orden sin distrito no es especial»: el tercer estado ya no existe y lo que queda sin
  decidir es la orden sin distrito (misma asercion: flete normal).
- En la lista y NO tocados en esta tanda:
  - `consultas-concurrentes-en-transaccion.guardia.test.ts`: el `zonaEspecial: true` esta dentro de
    una cadena que reproduce «tal cual» el `SNAPSHOT_SELECT` de antes de la 450 para el detector; no
    compila ni se ejecuta, y cambiarlo falsearia «copiada tal cual».
  - `zona-guardado-conserva-inactivos.test.ts`: es un fixture de `DistritoArbolDTO`, que no cambia.
  - `emisor-relaciones-anidadas.test.ts`, `corregir-datos-cliente.repo.test.ts`,
    `costo-y-zona-api-415.test.ts`, `resolver-novedad-reprograma-dinero.test.ts` y las dos
    `ordenes-api-key-*.route.test.ts`: siembran o leen la columna `distrito.zona_especial`. Son de T7
    (retiro de la columna, «siembran la marca con `fijarEmpresa`»). Todos estan en
    `tests/baseline-rojos.json` (la app nace vacia, SL-31) y no corren en `sl38_base`.

### Comprobaciones

- `grep zonaEspecial lib/ app/` (sin `esZonaEspecial`): solo quedan los DTO de salida
  (`DistritoArbolDTO`, `CoberturaDistritoDTO`, `DistritoCoberturaRow`, `DescriptivosDeOrden`) y la
  escritura de `lib/actions/geografia.ts` (T6). Ninguna lectura de la columna.
- `pnpm run typecheck` (cliente regenerado bajo el lock): `TC=0` tras T4 y tras T5.
- `pnpm exec eslint` de lo tocado: 0 errores (2 warnings `_args` previos en dobles que no son mios).
- `vitest related` sin `DATABASE_URL` (con ella arrastra ~140 suites de integracion que piden la base
  sembrada, ajenas): tras T4 `Test Files 426 passed | 176 skipped (602)`, `Tests 5988 passed`; tras T5
  `Test Files 447 passed | 187 skipped (634)`, `Tests 6421 passed | 1387 skipped`.
- Integracion contra `sl38_base` (bajo el lock, cliente regenerado): `cierre-detail-congelado`,
  `geografia-catalogo-activo` (lee `listArbol` y `findDistritosByCantonIds` contra Postgres real),
  `asimetria-sin-tarifa`, `zona-guardado-conserva-inactivos` y `distrito-zona-especial-por-empresa`:
  `5 passed`, `Tests 41 passed`. `cobertura-repository` revienta en el `beforeAll` («no hay ningun
  usuario adminTienda»): esta en la baseline (app vacia, SL-31) y su cambio queda sin correr aqui.
- `pnpm run test:guardias`: `2 failed | 297 passed`. `dependencias-declaradas-presentes` (4) esta en
  la baseline; `dominio-ordenex-fuera` (1) fue un timeout de 20 s con la maquina cargada: solo, verde
  (`3 passed`, junto con `zona-especial-punto-unico` y `geografia-predicado-unico`).

### Mutaciones (todas restauradas; `git diff` limpio despues de cada una)

| # | Mutacion | Resultado |
|---|---|---|
| 1 | Fuente inventada `lib/repositories/_mutante-sl38.ts` con `zonasEspeciales: { select: … }` | guardia R22: `1 failed | 8 passed`, el hallazgo nombra el archivo |
| 2 | `esZonaEspecialDeLaEmpresa` devuelve `true` fijo | `api-lectura` + `bulk` + `tarifa-especial-por-distrito`: `8 failed | 56 passed` |
| 3 | `esZonaEspecialDeLaEmpresa` devuelve `false` fijo | `api-lectura` (REM-3) + `tarifa-especial` (pacto y sin pacto): `3 failed | 55 passed` |
| 4 | `SELECT_MARCA_ZONA_ESPECIAL` sin `take: 1` | `api-lectura` (select literal) + `no-regresion-106`: `2 failed | 56 passed` |
| 5 | Excel: `zona_especial: dto.zonaEspecial ? SI : "Sin definir"` | `cobertura-descarga-columnas`: `3 failed | 31 passed` (incluye «ningun distrito sale como Sin definir») |

Los casos de dos empresas de punta a punta (una lectura por camino, A `true` y B `false`) son de T8.

Veredicto T3-T5: las ocho lecturas pasan por el punto unico, la guardia R22 lo vigila y cae con una
fuente inventada; typecheck y `vitest related` en verde, cada asercion cambiada muerta por una mutacion.

## T6-T7 — Escritura por capas y retiro de la columna

### T6 — Archivos

- Nuevos: `lib/types/distrito-zona-especial.ts` (`distritosEspecialesSchema`, sale de la accion, y
  `CambiosZonaEspecial`), `lib/interfaces/repositories/IDistritoZonaEspecialRepository.ts`,
  `lib/interfaces/services/IDistritoZonaEspecialService.ts`,
  `lib/repositories/DistritoZonaEspecialRepository.ts` (una `$transaction` interactiva: `deleteMany` +
  `createMany({ skipDuplicates })`; la FK de `distrito_id` se traduce con `esViolacionDeClaveForanea`
  a `distrito_inexistente`), `lib/services/DistritoZonaEspecialService.ts`,
  `tests/unit/services/distrito-zona-especial-service.test.ts`.
- Modificados: `lib/actions/geografia.ts` (`actualizarDistritosEspeciales(input, deps?)`,
  `DistritosEspecialesActionDeps`, `buildDistritoZonaEspecialService()`, cabecera sin la «unica
  excepcion»), `tests/unit/actions/distritos-especiales-action.test.ts` (reescrito sobre `deps`),
  `tests/integration/db/distrito-zona-especial-por-empresa.test.ts` (R10 y R13 por el repositorio
  real con el cliente extendido).
- Orden del borde (design §3): sesion → `safeParse` → servicio (rol). Antes el rol iba antes que la
  validacion; ahora un no-`maestro` con entrada invalida recibe `validation_error`. Ninguno de los dos
  lee ni escribe marcas (R11, R12).
- El caso `superadmin` del test de servicio fuerza el tipo (`as RolValue`): el valor llega con SL-32.

### T6 — R → test

| R | Test |
|---|---|
| R9 | servicio: «delega el lote sin duplicados y responde creadas + borradas», «marcar lo ya marcado no cuenta»; accion: «composition root: … el repositorio real escribe … en UNA transaccion»; integracion: «R10: por el repositorio real …» (marcar dos veces: `creadas` 1 y luego 0) |
| R10 | integracion: «R10: por el repositorio real, B marca y desmarca D y la marca de A sigue; la fila de distrito no cambia» (ademas del caso SQL de T2) |
| R11 | servicio: «R11: el rol %s recibe forbidden sin llamar al repositorio» (admin, adminTienda, adminSatelite, mensajero, apiKey, superadmin); accion: «R11: sin sesion responde unauthenticated …», «composition root: el rol se decide en el servicio construido, sin abrir transaccion» |
| R12 | servicio: «R12: un id en marcar y en desmarcar …», «R12: las dos listas vacias dan ok con 0 …»; accion: «R12: %s responde validation_error sin llamar al servicio» (id vacio, lista que no es lista, entrada que no es objeto) |
| R13 | integracion: «R13: un id inexistente en marcar da validation_error y no deja nada del lote, ni el desmarcado» (repositorio real y accion con el servicio real, dentro de `conEmpresa(B)`); servicio: «R13: un distrito inexistente … validation_error» |

### T6 — Verificacion (bajo el lock, cliente regenerado)

- `pnpm run typecheck` → `TC=0`.
- `pnpm exec eslint` de los 9 archivos → `No issues found` (dos warnings `_a` corregidos).
- `vitest run` de los 3 archivos de T6 + `zona-especial-punto-unico` + `geografia.composition-root` +
  los 6 de componentes que mockean `@/lib/actions/geografia` (sin tocarlos), contra `sl38_base`:
  `Test Files 11 passed (11)`, `Tests 101 passed (101)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 298 passed | 2 skipped (301)`, `Tests 4 failed |
  4086 passed | 20 skipped`. Los 4 rojos son `dependencias-declaradas-presentes` (baseline).
  `zona-especial-punto-unico` en verde sin ajustarla.

### T6 — Mutaciones (en el arbol, restauradas desde copia; md5 identico despues)

Archivos: servicio, accion y test de integracion (`3 files, 27 tests`).

| # | Mutacion | Resultado |
|---|---|---|
| 1 | servicio sin `if (actor.rol !== "maestro")` | `7 failed`: los 6 R11 del servicio y «el rol se decide en el servicio construido» |
| 2 | repositorio sin `$transaction` (las dos escrituras sueltas sobre el cliente) | `2 failed`: R13 de integracion (el desmarcado de D2 se queda) y el composition root (`$transaction` no llamado) |
| 3 | repositorio que traga la FK (`ok, 0, 0` en vez de `distrito_inexistente`) | `1 failed`: R13 de integracion |
| 4 | composition root con `new DistritoZonaEspecialService(undefined as never)` | `1 failed`: «composition root: … el repositorio real escribe» |
| 5 | servicio sin rechazar el id en las dos listas | `1 failed`: R12 del servicio |
| 6 | servicio que devuelve solo `creadas` | `2 failed`: R9 del servicio y el composition root (3 → 2) |

### T7 — Archivos

- Nuevos: `db/migrations/20261023120100_retirar_distrito_zona_especial/{migration,down}.sql`
  (design §2.2: `DO $$` de aborto + `DROP COLUMN`; down `ADD COLUMN "zona_especial" BOOLEAN DEFAULT
  false`), `tests/integration/db/migracion-sl38-ida-y-vuelta.test.ts` (base propia `sl38_iv_<rand>`,
  creada y borrada por el test; comprobado despues: solo queda `sl38_base`).
- `db/schema.prisma`: sale `Distrito.zonaEspecial`; reescritos los comentarios de `Provincia.activo`,
  `Provincia.codigoDta`, `Distrito.activo` y `CierreDetail.esZonaEspecial` («la marca de la empresa
  de la orden en ese instante»).
- Tests ajustados: `distrito-zona-especial-migration` (R6: el bloque `model Distrito`, sin
  comentarios, ya no declara `zonaEspecial` y si `zonasEspeciales`), `corregir-datos-cliente.repo`
  (el distrito especial siembra la marca con `distritoZonaEspecial.create`, empresa de
  `enTransaccionRevertida`), `emisor-relaciones-anidadas` (el `select` «de antes» lee la marca por
  `SELECT_MARCA_ZONA_ESPECIAL` / `esZonaEspecialDeLaEmpresa`), `costo-y-zona-api-415` y
  `gestiones-detalle-api-405` (contratos de coste, ver abajo).
- Revisados y SIN cambio (no leen ni siembran la columna; solo `esZonaEspecial` de salida, pactos
  `tarifaEspecial` o el fixture de `DistritoArbolDTO`): `resolver-novedad-reprograma-dinero`,
  `ordenes-api-key-orden-consulta.route`, `ordenes-api-key-listado.route`, `cierre-detail-congelado`,
  `zona-guardado-conserva-inactivos`, `asimetria-sin-tarifa`, `cobertura-repository` (ya sembraba la
  marca en T5). Los `geografia-*-migration` crean su propia tabla `distrito` historica en un esquema
  desechable: no dependen del esquema actual.

### T7 — Desviacion: el contrato de coste de la API (consecuencia de T4)

`costo-y-zona-api-415` y `gestiones-detalle-api-405` congelan, por tabla y en orden, las consultas
del detalle y del listado. Con la marca como relacion anidada (T4) Prisma emite una consulta mas
a `distrito_zona_especial`. Medido con `crearPrismaDeTestConEspia` en `sl38_base` (scratch de un
solo uso, borrado; misma cadena `findDetalleByOrdenIdForOwner` y `ApiOrdenLecturaService.listar`):

```
DETALLE ["orden","order_status","usuario","zona","distrito","cierre_detail","gestion_orden","orden_historial_estado","orden_incidente","distrito_zona_especial","usuario","orden_evento","order_status","orden_incidente_evidencia"]
LISTADO ["orden","order_status","usuario","zona","distrito","cierre_detail","distrito_zona_especial","orden","tarifas"]
```

El detalle pasa de 13 a 14 y el listado de 8 a 9 (sigue sin depender del numero de items). Los dos
literales se actualizan con esa medida. `gestiones-detalle-api-405` no estaba en «Archivos
esperados»; lleva el mismo literal del detalle.

### T7 — Base `sl38_base`

- `pnpm exec prisma migrate deploy` (sin reset): `Applying migration
  20261023120100_retirar_distrito_zona_especial` → `All migrations have been successfully applied`.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` →
  `-- This is an empty migration.`

### T7 — Hecho

- `pnpm run typecheck` (cliente regenerado bajo el lock, SIN la columna) → `TC=0`.
- `grep -rn "zonaEspecial: true" lib/ app/` → sin resultados (exit 1).
- `pnpm exec eslint` de los 6 tests tocados → 0 problemas.

### T7 — R → test

| R | Test |
|---|---|
| R5 | `migracion-sl38-ida-y-vuelta`: «R5 — M1: la tabla de marcas con su politica y su trigger, de ida y vuelta» (information_schema, constraints, indices, `pg_policies`, `pg_trigger`, rls) |
| R6 | `distrito-zona-especial-migration`: «SL-38 (R6): el modelo Distrito de Prisma ya no declara el campo»; `migracion-sl38-ida-y-vuelta`: «R6, R8 — M2 …» (la columna sale de `information_schema`); typecheck sin la columna; guardia R22 |
| R7 | `migracion-sl38-ida-y-vuelta`: «R7 — con un distrito en zona_especial = true, M2 aborta nombrando la causa y la columna sigue» (foto identica tras el aborto, la fila sigue en `true`; sin filas en true, M2 aplica) |
| R8 | `migracion-sl38-ida-y-vuelta`: «R6, R8 — M2: … el down la devuelve BOOLEAN, nulable y DEFAULT false» (linea literal de `information_schema.columns`: `boolean | bool | YES | false | NO | NEVER`; lo unico distinto tras el down es la `ordinal_position` de esa columna, que Postgres no deja elegir) |

### T7 — Tests (bajo el lock, cliente regenerado, `sl38_base`)

- 17 archivos (los de T6 + los de T7 + los revisados): `Test Files 6 failed | 11 passed (17)`,
  `Tests 4 failed | 132 passed | 49 skipped`. Los rojos:
  - `migracion-sl38-ida-y-vuelta` (2): la posicion de la columna y `is_generated = NEVER`; corregido
    el test. Despues, solo: `Tests 4 passed (4)`.
  - `emisor-relaciones-anidadas`, `corregir-datos-cliente.repo`, `costo-y-zona-api-415`,
    `gestiones-detalle-api-405`: revientan en el `beforeAll` («la tabla `orden` esta vacia … corre
    `pnpm run db:seed`»). Estan en `tests/baseline-rojos.json` (app vacia, SL-31). Sus cambios
    compilan (typecheck) pero NO se han ejecutado aqui. No se sembro la base: el seed de la app vacia
    no crea ordenes.
  - `cobertura-repository` (2): FK `tarifas_tienda_id_fkey` en su siembra, por carrera con
    `distrito-zona-especial-por-empresa` (que crea y borra un `adminTienda` en paralelo). Solo:
    revienta en el `beforeAll` («no hay ningun usuario adminTienda»), como en T5 (baseline).
- `pnpm run test:guardias` (bajo el lock): `Test Files 1 failed | 300 passed (301)`, `Tests 4 failed |
  4105 passed | 1 skipped`; los 4 son `dependencias-declaradas-presentes` (baseline). Una corrida
  previa SIN el lock dio ademas 2 rojos en `alcance-fuente-unica` («seis RolValue»): el cliente
  compartido lo habia regenerado SL-32 con su `superadmin`. No es de SL-38.

### T7 — Mutaciones (en el arbol, restauradas desde copia; md5 identico despues)

Archivos: `migracion-sl38-ida-y-vuelta` + `distrito-zona-especial-migration` (`11 tests`).

| # | Mutacion | Resultado |
|---|---|---|
| a | M2 sin el bloque `DO $$ … END $$;` | `1 failed`: R7 («promise resolved "undefined" instead of rejecting») |
| b | down de M2 sin `DEFAULT false` | `2 failed`: «R6, R8 — M2» (y R7, que parte del estado que deja) |
| c | down de M2 con `NOT NULL DEFAULT false` | `2 failed`: «R6, R8 — M2» y R7 |
| d | down de M1 sin `DROP TABLE` | `1 failed`: «R5 — M1» |
| e | `Distrito.zonaEspecial` de vuelta en el schema | `1 failed`: «SL-38 (R6): el modelo Distrito … ya no declara el campo» |

Veredicto T6-T7: la marca se escribe por servicio y repositorio con la RLS real, la columna global
sale sin drift y con su down medido, typecheck verde sin ella; cada test nuevo o cambiado cae con su
mutacion. Quedan sin ejecutar aqui los cuatro tests de baseline que piden ordenes sembradas.

## T8 — Dos empresas de punta a punta

### Archivo

- Nuevo: `tests/integration/db/zona-especial-dos-empresas.test.ts`. Repositorio REAL sobre el
  cliente de la app (`conAislamientoPorEmpresa` + `conEmpresa`). Siembra propia y commiteada en
  `beforeAll` (organizaciones A y B con `tests/fabricas/organizaciones.ts`, tienda, zona, tarifa con
  pacto especial, mensajero, maestro, cuatro ordenes y dos gestiones), borrada por empresa en
  `afterAll`. Tras cada corrida: 0 organizaciones, 0 marcas y 0 ordenes en `sl38_base`.
- Marcas DISTINTAS: A marca D y B marca D2 (los tres ultimos distritos por id de Cartago/Cartago;
  `distrito-zona-especial-por-empresa` usa los dos primeros). Cada lectura se mide en las dos
  empresas sobre D y D2: se espera `{ A: { D: true, D2: false }, B: { D: false, D2: true } }`.
- La marca de A NO se comprueba en el `beforeAll`, a proposito: sin ella caen los casos de A, en
  vez de saltarse el archivo.

### R → test

| R | Caso |
|---|---|
| R14 | «R14: GeoRepository.listArbol marca D solo para A y D2 solo para B» |
| R15 | «R15: CoberturaRepository.listDistritos …» |
| R16 | «R16: OrdenRepository.findDistritosByCantonIds …» (tarifa de carga, API y cotizacion) |
| R17 | «R17: OrdenRepository.findParaCorreccion …», «R17: OrdenRepository.findDistritoParaCorreccion …» |
| R18 | «R18: OrdenRepository.findBaseCobroDevolucion …» (cobro del rechazo) |
| R19 | «R19/R21: el listado (list -> toListItem) …» (`fleteOrigen` y `fleteConIva`: 5650.00 especial, 2260.00 normal), «R19: el costeo de la API (apiOrdenSelect -> toApiOrdenRow, listByOwner) …» |
| R20 | «R20: leerDescriptivosDeOrdenes …», «R20/R21: el cierre congela la marca de su empresa (A true, B false), y desmarcar despues no la mueve» (`crearCierre` real; A desmarca D por la accion, la lectura viva pasa a `false` y `cierre_detail.es_zona_especial` sigue `true`) |
| R21 | todos los anteriores (A y B en el mismo distrito, resultado distinto) |
| R9 (sin 500) | «R9: la accion con el servicio real y un maestro de la empresa marca y desmarca con ok (no 500)» (`{ status: "ok", actualizados: 1 }` dos veces; las marcas de D y D2 no se mueven) |

### Verde (`sl38_base`, cliente regenerado bajo el lock)

```
 ✓ la siembra: A marca D y B marca D2, cada una con su empresa
 ✓ R14 … ✓ R15 … ✓ R16 … ✓ R17 (x2) … ✓ R18 … ✓ R19/R21 … ✓ R19 … ✓ R20 … ✓ R9 … ✓ R20/R21
 Test Files  1 passed (1)      Tests  12 passed (12)      EXIT=0
```

Junto con `distrito-zona-especial-por-empresa` (en paralelo, tres corridas): `Tests 21 passed (21)`
las tres. La primera version usaba los mismos distritos que ese archivo y se pisaban (9 rojos al
correrlos juntos, medidos como dueno); de ahi los distritos distintos y `marcasDe` acotado a A y B.

### Mutaciones (una cada vez, restauradas; md5 del predicado y del test identicos despues)

| # | Mutacion | Resultado |
|---|---|---|
| 1 | `DROP POLICY "distrito_zona_especial_por_empresa"` en `sl38_base` (RLS sin politica: `servi_app` no ve nada) | `11 failed | 1 passed`: caen los nueve caminos (B deja de ver su D2 y A su D) y R9 (`el nuevo registro viola la politica de seguridad de registros`) |
| 1b | (extra) politica abierta `USING (true) WITH CHECK (true)`: B ve la marca de A | `10 failed | 2 passed`: los nueve caminos y el cierre; recibido `{ A: { D: true, D2: true }, … }` |
| 2 | `esZonaEspecialDeLaEmpresa` devuelve `true` fijo | `10 failed | 2 passed`: los nueve caminos y el cierre (B ve D especial) |
| 3 | sin sembrar la marca de A (el `create` del `beforeAll` comentado) | `12 failed (12)`, `Test Files 1 failed`: ningun caso saltado; `expected { A: { D: false, … } } to deeply equal { A: { D: true, … } }` |

Politica restaurada con el SQL de M1 (`pg_get_expr(polqual)` = el original). M1 y M2 no se tocan.

### Verificacion

- `pnpm run typecheck` → `TC=0`; `pnpm exec eslint` del test → 0 problemas.
- `pnpm run test:guardias` → `Test Files 1 failed | 300 passed (301)`, `Tests 4 failed | 4105 passed |
  1 skipped`; los 4 son `dependencias-declaradas-presentes` (baseline).
- Riesgo anotado para T11: `distrito-zona-especial-por-empresa` (R13) compara
  `distritoZonaEspecial.count()` GLOBAL antes y despues; si R9 o R20 de este archivo escriben en ese
  mismo instante, podria salir rojo en la suite completa. No se ha visto en las tres corridas juntas.

Veredicto T8: las nueve lecturas, el congelado y la escritura, medidos en dos empresas con marcas
distintas; verde, y rojo con cada una de las tres mutaciones pedidas.
