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
