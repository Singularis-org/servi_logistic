# impl SLT-44 — Geografía jerárquica: dominio y repositorios

## T0 — Precondiciones (2026-10-30)

- T0.1: `db/schema.prisma` tiene `model TipoNivelGeografico` y `model NodoGeografico`; ninguno trae
  columna `ruta`. `origin/feature/SLT-43-geo-jerarquica-modelo` (`6a6dd4c`) es ancestro de HEAD, y
  `origin/dev` (`3c4c22c`) también: no hace falta volver a mergear.
- T0.2: `grep -rnE "^(export )?(const|let|var) \w+ *= *new (OrdenRepository|GeoRepository|CoberturaRepository)\(" lib app`
  sale vacío (exit 1). Todas las instancias se crean dentro de funciones (composition roots de
  `lib/actions/`), así que la caché por instancia es por petición.

## Base de datos de la feature

Base local propia `logistic_slt44` en `localhost:5432` (no la de desarrollo `logistic`), creada el
2026-10-30 con `pg` (`DROP/CREATE DATABASE`), luego `pnpm exec prisma migrate deploy` y
`pnpm run db:seed`, con `DATABASE_URL` apuntando a ella.

## Tanda 1 — T1.1 (`ab63b8b`)

`scripts/geo-equivalencia/lecturas-de-hoy.ts`: copia literal de `origin/dev` `3c4c22c077a4`
(`OrdenRepository` 2626-2704 y 2821-2866, `CoberturaRepository` 27-61, `GeoRepository` 163-172,
225-334 y 336-439). Solo cambian la sangría, `this.prisma` → `cliente` y las 11 firmas; verificado con la
transformación inversa. SLT-43 no tocaba esos tres archivos (`git diff origin/dev HEAD` vacío en ellos).
Typecheck verde, eslint sin avisos en el archivo, guardias de geografía verdes.

## Tanda 2 — T1.2, T2.1–T2.4, T3.1–T3.2 (`706c4fb`)

Archivos:
- modificados: `lib/repositories/_shared/geografia-activa.ts` (`activoEnCascada`),
  `lib/repositories/_shared/zona-especial.ts` (`ClienteDeMarcas`, `leerNodosConMarcaDeLaEmpresa`);
- nuevos: `lib/services/geografia-dominio.ts`, `lib/interfaces/repositories/ICatalogoGeograficoRepository.ts`,
  `lib/repositories/CatalogoGeograficoRepository.ts`, `tests/integration/db/_fixtures/geo-44.ts`,
  `tests/unit/services/geografia-dominio.test.ts`, `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`,
  `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts`,
  `tests/integration/db/geo-catalogo-repository.test.ts`.

Salida (`DATABASE_URL` → `logistic_slt44`, `NODE_OPTIONS=--max-old-space-size=8192`):
- typecheck verde; lint 0 errores (231 warnings, ninguno en archivos de SLT-44).
- `test:guardias`: 322 passed, 1 failed, 3 skipped (archivos); 4546 passed, 4 failed, 24 skipped (tests).
  Los 4 rojos son `dependencias-declaradas-presentes.guardia.test.ts`: están en `tests/baseline-rojos.json`
  y el archivo y `init.sh` son iguales que en `origin/dev`.
- Tanda acotada `vitest run` (14 archivos: los 5 nuevos + `geografia-activa`, `geografia-predicado-unico`,
  `zona-especial-punto-unico`, `distrito-zona-especial-por-empresa`, `zona-especial-dos-empresas`,
  `geografia-catalogo-activo`, `geografia-alta`, `zona-guardado-conserva-inactivos`,
  `geo-resolucion-retirados`, `cobertura-vs-resolve-geo`): 14 files / 176 tests passed, 0 failed, 0 skipped.

Notas:
- `vitest related` sobre `_shared/*` arrastra casi toda la suite (lo importan `OrdenRepository` y
  `GeoRepository`): se cortó a los 25 min y se corrió la tanda acotada.
- Añadido sin que el design lo pida: la carga usa `isolationLevel: "RepeatableRead"` (la «misma foto» de
  design §3); `organizacion.findFirst` nulo → `EmpresaNoResuelta`.
- **Abierto (R10):** sin contexto de empresa y con la extensión real, la extensión abre la transacción
  (`BEGIN`/`ROLLBACK` viajan) antes de rechazar; no viaja ninguna consulta de datos. En plataforma el
  corte es previo y no viaja nada. Decidir si eso cumple «sin consultar la base».
- Fixture: la empresa `XA` también trae la zona y la marca de `crearEscenarioGeo43`; «marcas de una sola
  empresa» se leyó como «cada marca es de una empresa».

## Tanda 3 — T4.1–T4.7

Archivos:
- modificados (lib): `GeoRepository.ts` (6 lecturas al catálogo, `GeoPrismaClient` ampliado, catálogo
  perezoso por instancia), `OrdenRepository.ts` (solo `findAllProvincias`, `findCantonesByProvinciaIds`,
  `findDistritosByCantonIds`, `findDistritoParaCorreccion`), `CoberturaRepository.ts` (`listDistritos`),
  `CatalogoGeograficoRepository.ts` (ver desviaciones).
- modificados (dobles T4.4): `catalogo-filtros-ordenes.test.ts`, `orden-repository.bulk.test.ts`,
  `{cobertura,corregir-datos-cliente,geografia,geografia-plataforma}.composition-root.test.ts`
  (el typecheck no los señaló por casts; cayeron al ejecutarlos).
- nuevos: `tests/integration/db/geo-lecturas-catalogo.test.ts`, `tests/integration/db/geo-lecturas-sin-backfill.test.ts`,
  `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`.
- Sin cambios: `db/`, `lecturas-de-hoy.ts`, `IOrdenRepository`. Ningún índice nuevo (R25).

Mapa parcial:
- R12 → `geografia-lecturas-sin-nodo-fk.guardia.test.ts` (con contraprueba) + `geo-lecturas-sin-backfill.test.ts`
  (columna llena / NULL con triggers apagados / desviada: mismo resultado).
- R14–R20 → `geo-lecturas-catalogo.test.ts`, un `describe` por requisito, frente a `lecturas-de-hoy` en CR y XA.
- Suites existentes verdes sin tocar: R14–R17 `filtros-ordenes-service`, `geografia-service`, `geografia-dos-paises`,
  `geografia-catalogo-activo`, `geografia-superadmin-sin-empresa`, `zona-especial-dos-empresas`; R18
  `cotizacion-api-key`, `ordenes-carga-masiva-chunk.route`, `carga-masiva-errores-roundtrip`, `geo-resolucion-retirados`;
  R20 `cobertura-vs-resolve-geo`; R24 `nodo-geografico-sin-escritor.guardia`, `geo-repository.escrituras`,
  `geografia-alta`, `distrito-zona-especial-por-empresa`, `zona-repository`; R26 parcial, además `carga-division`.

Salida (`NODE_OPTIONS=--max-old-space-size=8192`, `DATABASE_URL` → `logistic_slt44`):
- `pnpm run typecheck`: exit 0.
- `eslint` sobre los 13 archivos: 0 errores, 1 warning previo (`_args` en `cobertura.composition-root`).
- `vitest run` de los 6 dobles: 6 files / 37 tests verdes.
- `vitest run` de 37 archivos: 32 passed / 5 failed (archivos); 492 passed, 0 failed, 63 skipped (tests).
  Los 5: `cobertura-repository` (R20), `corregir-datos-cliente.repo` (R19), `geografia-historico-intacto` y
  `geografia-renombrado` (R24) caen en `beforeAll` («no hay ningun usuario adminTienda», «`orden` esta vacia»):
  la base solo tiene catálogos y los cuatro están en `tests/baseline-rojos.json`. `carga-division` agotó 60 s
  esperando el lock de superadmin en paralelo; sola 16/16 verde.
- `test:guardias`: 325 passed / 2 failed (archivos); 4572 passed, 4 failed, 4 skipped. Los 4 rojos,
  `dependencias-declaradas-presentes` (baseline). `filtros-url-r25`: timeout de `beforeAll` bajo carga; solo 3/3 verde.

Desviaciones:
- `CatalogoGeograficoRepository` (T3): `$transaction` opcional; si el cliente es ya una transacción
  (`tx as PrismaClient` en suites existentes) la carga corre en ella. Con `conEmpresa`, `organizacion.findFirst`
  filtra por `id` (sin RLS devolvía una empresa cualquiera). `geo-catalogo-repository` sigue verde.
- `catalogo-filtros-ordenes`: el caso «cantón activo bajo provincia retirada» cambia de entrada a «cantón
  retirado» (no representable con un solo `p1` coherente); la salida esperada no cambia. La cascada desde la
  provincia la cubren `geografia-dominio.test.ts` y `geografia-catalogo-activo`.
- Los `expect` que comprobaban qué modelo viejo se llamaba pasan al modelo nuevo (design §10 lo permite).
  Ningún `expect` de salida cambió.
- R19 y R20 se apoyan en local solo en `geo-lecturas-catalogo.test.ts`: sus suites existentes no ejecutan
  en una base sin usuarios ni órdenes (en el baseline, tampoco miden en CI).

## Tanda 4 — T5.1–T5.3

T5.1 (ninguna obliga a cambiar el diseño):
- (a) `ApiKeyAuthService.autenticar` devuelve `{ usuarioId: resolverOwnerApiKey(usuarioDedicado, tiendaDestinoId), rol: "apiKey" }`
  tras comprobar key existente y activa, usuario activo, rol `apiKey` y tienda destino `adminTienda` activa. Con
  tienda destino, `usuarioId` es el id de la tienda; `CotizacionOrdenService.cotizar` solo mira `rol === "apiKey"`.
  Se replica sin key con `{ usuarioId: tiendaId, rol: "apiKey" }`.
- (b) `CoberturaService.listar` solo acepta `maestro` y no usa `usuarioId`. El script usa
  `{ usuarioId: "geo-equivalencia-dinero", rol: "maestro" }` y `maxFilas = Number.MAX_SAFE_INTEGER`.
- (c) `plataforma-solo-en-lista` barre llamadas directas a `comoPlataforma(` en `lib`, `app`, `scripts`,
  `tests/fabricas`. `paraCadaEmpresa` la abre dentro de `lib/db/para-cada-empresa.ts`, ya en
  `EXCEPCIONES_DE_PLATAFORMA` (SL-17). El script no llama a `comoPlataforma`: sin entrada nueva.

Archivos: nuevo `scripts/geo-equivalencia-dinero.ts` (cliente de solo lectura con
`default_transaction_read_only=on`, `compararEmpresa`, `lineasDeInforme`, `codigoDeSalida` 0/1/2, `leerArgumentos`);
nuevo `tests/integration/db/geo-equivalencia-dinero.test.ts`; `package.json` solo la entrada
`geo:equivalencia-dinero` (sin dependencias).

Mapa: R8, R21, R22, R23 → `geo-equivalencia-dinero.test.ts` (0 diferencias CR y XA; contraprueba con asignación
en un cantón da 1 diferencia por bloque nombrada por ids; `--muestra`; códigos 0/1/2; `INSERT` → `25006`;
recuentos iguales antes/después; sin PII en la salida).

Salida (`NODE_OPTIONS=--max-old-space-size=8192`, `DATABASE_URL` → `logistic_slt44`):
- typecheck exit 0; eslint de los 2 archivos: 0 errores, 0 avisos.
- `vitest run tests/integration/db/geo-equivalencia-dinero.test.ts`: 1 file / 8 tests passed, 0 failed.
- `test:guardias`: 323 passed, 1 failed, 3 skipped (archivos); 4552 passed, 4 failed, 24 skipped (tests); los 4 rojos,
  `dependencias-declaradas-presentes` (baseline).
- `pnpm geo:equivalencia-dinero` no se ejecutó contra ninguna base (T7.2 es humana).

Desviaciones:
- La contraprueba inyecta por `compararEmpresa(..., { clienteNuevo })`: un proxy del cliente añade a
  `zonaDistrito.findMany` una fila `{ distritoId: <cantonId>, zona }`, porque los repositorios construyen su
  catálogo por dentro y no se tocó `lib/`.
- Cobertura comparada como multiconjunto (el DTO no lleva ids) más un bloque «cobertura-por-zona» por id de zona.
- La salida no imprime nombres de geografía ni mensajes de error, solo ids y flags.
- No hay prueba de extremo a extremo de `compararEmpresa` con el cliente de solo lectura sobre datos confirmados;
  la barrera de solo lectura se prueba aparte.

## Tanda 5 — T6.1

`docs/architecture.md > Multi-empresa > País por empresa > Geografía jerárquica`: fuera la frase «La app todavía
no lee nada del modelo nuevo…»; nueva viñeta «Lecturas sobre el árbol (SLT-44)»: dominio puro, catálogo por
petición y empresa, las 11 lecturas que pasan, lo que sigue en tablas viejas hasta SLT-65 (escrituras hasta
SLT-46), R12 (el lugar se lee de `distrito_id`), y `pnpm geo:equivalencia-dinero` (0/1/2, lo corre una persona
sobre una copia de producción con SLT-43, ningún agente).
- `node scripts/check-perfil.mjs`: «6/6 docs revisados en los ultimos 60 dias», exit 0.

## Tanda 6 — T7.1 (gate local)

`./init.sh` (con `DATABASE_URL` → `logistic_slt44`, `NODE_OPTIONS=--max-old-space-size=8192`): Claude Code lo mató
por memoria del sistema durante el `lint`, después de un typecheck verde y sin rojos en los pasos previos (perfil
6/6, cliente de Prisma y tipos de ruta al día). Como en SLT-43 T7.1, se corrió por separado:
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores, 230 warnings (ninguno nuevo en archivos de SLT-44, ver tandas 3–4).
- `pnpm run test:guardias`: 323 passed, 1 failed, 3 skipped (archivos); 4552 passed, 4 failed, 24 skipped (tests).
  Los 4 rojos, `dependencias-declaradas-presentes.guardia.test.ts`, en `tests/baseline-rojos.json`.
- `vitest run --maxWorkers=2` de los 15 archivos de T2–T5 (`geografia-dominio`, las 3 guardias de geografía nuevas,
  `geo-catalogo-repository`, `geo-lecturas-catalogo`, `geo-lecturas-sin-backfill`, `geo-equivalencia-dinero`,
  `catalogo-filtros-ordenes`, `orden-repository.bulk`, `geografia-activa`, los 4 composition-root):
  **15 files / 124 tests passed, 0 failed, 0 skipped.**
- `gate-completo` de CI: pendiente del PR (lo abre el leader). T7.1 queda sin marcar hasta entonces.

R25: `git diff --name-only origin/dev...HEAD -- db/` **no sale vacío**: trae las 6 migraciones `20261031120*` de
SLT-43 y `db/schema.prisma`, porque la rama se apila sobre el PR #44, que todavía no está en `dev`
(`merge-base --is-ancestor origin/feature/SLT-43-geo-jerarquica-modelo origin/dev` → no). Comprobación equivalente:
ningún commit propio de SLT-44 (`9b0cba7`…`f2aa71c`) toca `db/` (0 archivos por commit); solo el merge base
`0dc0847` de SLT-43. Cuando el PR #44 entre en `dev` y se mergee `origin/dev` aquí, el comando literal debe salir vacío.

### Mapa R<n> → test

| R | Test |
|---|---|
| R1 | `tests/unit/guards/geografia-dominio-puro.guardia.test.ts` (con contraprueba) |
| R2 | `tests/unit/services/geografia-dominio.test.ts` |
| R3 | `tests/unit/services/geografia-dominio.test.ts` |
| R4 | `tests/unit/services/geografia-dominio.test.ts` |
| R5 | `tests/unit/services/geografia-dominio.test.ts` (8 + 4 combinaciones) + `tests/unit/repositories/geografia-activa.test.ts` |
| R6 | `tests/unit/services/geografia-dominio.test.ts` |
| R7 | `tests/unit/services/geografia-dominio.test.ts` |
| R8 | `tests/unit/services/geografia-dominio.test.ts` + `tests/integration/db/geo-equivalencia-dinero.test.ts` |
| R9 | `tests/integration/db/geo-catalogo-repository.test.ts` |
| R10 | `tests/integration/db/geo-catalogo-repository.test.ts` (ver abierto de la tanda 2) |
| R11 | `tests/integration/db/geo-catalogo-repository.test.ts` |
| R12 | `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` + `tests/integration/db/geo-lecturas-sin-backfill.test.ts` |
| R13 | `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts` (con contraprueba) |
| R14 | `tests/integration/db/geo-lecturas-catalogo.test.ts` + `filtros-ordenes-service`, `catalogo-filtros-ordenes` |
| R15 | `tests/integration/db/geo-lecturas-catalogo.test.ts` + `zona-especial-dos-empresas` |
| R16 | `tests/integration/db/geo-lecturas-catalogo.test.ts` + `geografia-service`, `geografia-catalogo-activo` |
| R17 | `tests/integration/db/geo-lecturas-catalogo.test.ts` + `geografia-dos-paises`, `geografia-superadmin-sin-empresa` |
| R18 | `tests/integration/db/geo-lecturas-catalogo.test.ts` + `cotizacion-api-key`, `ordenes-carga-masiva-chunk.route`, `carga-masiva-errores-roundtrip`, `geo-resolucion-retirados`, `orden-repository.bulk` |
| R19 | `tests/integration/db/geo-lecturas-catalogo.test.ts` (`corregir-datos-cliente.repo` no ejecuta en local: baseline) |
| R20 | `tests/integration/db/geo-lecturas-catalogo.test.ts` + `cobertura-vs-resolve-geo` (`cobertura-repository` no ejecuta en local: baseline) |
| R21 | `tests/integration/db/geo-equivalencia-dinero.test.ts` |
| R22 | `tests/integration/db/geo-equivalencia-dinero.test.ts` |
| R23 | `tests/integration/db/geo-equivalencia-dinero.test.ts` |
| R24 | `nodo-geografico-sin-escritor.guardia`, `geo-repository.escrituras`, `geografia-alta`, `distrito-zona-especial-por-empresa`, `zona-repository` (`geografia-historico-intacto`, `geografia-renombrado` no ejecutan en local: baseline) |
| R25 | Comprobación de diff (arriba): ningún commit de SLT-44 toca `db/`; el literal espera al merge del PR #44 |
| R26 | `gate-completo` de CI en el PR (pendiente) |

## F2.3 — merge de `origin/dev` (2026-11-03)

Decisión humana (Cristian, 2026-11-03): el fixture `geo-44` se arregla en esta rama y después la rama se lleva a SLT-65.

- Merge `62f3dd5e`: entra `origin/dev`, que ya lleva SLT-43, SLT-73, SLT-75 y SLT-76. Hubo tres conflictos triviales, resueltos igual que en SLT-65 (`d17cbdda`): la cabecera de `lib/db/modelos-de-negocio.ts` (80 de negocio y 25 de plataforma), `catalogo-y-choke-point` (75 tipos y 28 entidades) y los tramos de `caja-459-migration`.
- Base `logistic_slt44`: estaba atascada en la migración fallida `20261031120100`. Se recreó y se le pasaron `migrate deploy` (incluye `20261101090100` de SLT-75), `db:seed` y `prisma generate`.
- Ajustes tras el merge, los mismos que SLT-65 `7b29903b`:
  - `GeoRepository.listArbol`: `zonas` (SLT-75 R14) sale de `asignaciones.zonasPorNodo`.
  - `scripts/geo-equivalencia/lecturas-de-hoy.ts`: devuelve `zonas`.
  - `geo-repository-arbol-zonas.test.ts`: cambia solo el doble; ningún `expect`.
- Fixture `tests/integration/db/_fixtures/geo-44.ts`: «Dos zonas» queda solo en norte, porque el índice único `zona_distrito(organizacion_id, distrito_id)` de SLT-75 prohíbe que un distrito esté en dos zonas.

**Verificación:**
- `pnpm typecheck`: exit 0.
- Unit: `geo-repository-arbol-zonas`, `zona-repository`, `geografia-action` y `geografia-service`, 149/149 en verde.
- Integración contra `logistic_slt44`: 19 en verde y 6 en rojo.

| Archivo | Resultado |
|---|---|
| `geo-lecturas-sin-backfill` | todo en verde |
| `geo-catalogo-repository` | 7 en verde, 1 en rojo |
| `geo-equivalencia-dinero` | 7 en verde, 1 en rojo |
| `geo-lecturas-catalogo` | 4 en verde, 4 en rojo |

**ABIERTO: 6 tests dependen de verdad de un distrito en dos zonas.** No se cambió ningún `expect`.
1. `geo-lecturas-catalogo.test.ts:416` (R20): espera que «Dos zonas» liste las zonas `[norte, sur]`.
2. `geo-lecturas-catalogo.test.ts:229` (R16): espera el colapso >1, con `zonaId` y `zonaNombre` en null.
3. `geo-lecturas-catalogo.test.ts:305` (R18): el mismo colapso.
4. `geo-lecturas-catalogo.test.ts:380` (R19): el mismo colapso.
5. `geo-equivalencia-dinero.test.ts:228` (R21): espera en norte «hoy 0 / nuevo 1» y ahora da «hoy 1 / nuevo 2». Si el distrito pasa a sur o se queda sin zona, este test se arregla pero se rompe `geo-lecturas-catalogo.test.ts:190`. Ninguna disposición de zonas satisface a los dos.
6. `geo-catalogo-repository.test.ts:143` (R9): el helper `asignacionesSembradas` (l.102-103) copia a mano el fixture y aún lista «Dos zonas» en sur. El arreglo es borrar la línea 103, pero eso cambia el valor esperado de un `toEqual`.

Hay que decidir una de dos opciones:
- Cambiar esos `expect` porque el caso >1 ya no existe.
- Sembrar el caso >1 de otra forma, por ejemplo soltando el índice dentro de la transacción del test.

**Cerrado por T8** (enmienda aprobada por Cristian, «Aprobado», 2026-11-03): se cambian los `expect`.

## T8 — Enmienda del 2026-11-03: un distrito, una zona

Spec commiteado en `1aa7b336`. backend_dev aplicó T8.1–T8.5:
- T8.1 `tests/integration/db/_fixtures/geo-44.ts`: ya tenía 4 filas en `zonaDistrito.createMany` («Dos zonas» solo en norte). Se añade a la cabecera el nombre del índice `zona_distrito_organizacion_id_distrito_id_key` junto a la migración `20261101090100`. `distritoDosZonasId` no se renombra.
- T8.2 `geo-lecturas-catalogo.test.ts`: los 4 `expect` de R16, R18, R19 y R20 con los valores de design §13.3, el título del `it` de R19 y el comentario de R15. La aserción de R15 y las comparaciones «nuevo = copia de hoy» no cambian.
- T8.3 `geo-equivalencia-dinero.test.ts`: `cobertura-por-zona` de norte, `hoy` "0"→"1" y `nuevo` "1"→"2".
- T8.4 `geo-catalogo-repository.test.ts`: solo se borra `[e.geo.distritoDosZonasId, e.zonas.surId],`.
- T8.5 `lib/services/geografia-dominio.ts`: solo el JSDoc de `zonaQueCubre` (R27). Ninguna línea ejecutable.

`git diff --stat`: 5 archivos, +24/−11.

**Verificación** (`DATABASE_URL` → `logistic_slt44`, `NODE_OPTIONS=--max-old-space-size=8192`, `vitest run --maxWorkers=2`):
- `geo-lecturas-catalogo` 8/8, `geo-equivalencia-dinero` 8/8, `geo-catalogo-repository` 8/8, `geo-lecturas-sin-backfill` 1/1 (las 25 de F2.3 en verde).
- `geografia-dominio` 23/23 (incluido «dos zonas en el nodo más cercano… da `null`»), `geografia-dominio-puro.guardia` 8/8.
- Los 4 unit de F2.3 (`geo-repository-arbol-zonas`, `zona-repository`, `geografia-action`, `geografia-service`): en verde.
- Corrida conjunta de los 9 archivos (4 integración, `geografia-dominio` y los 4 unit): `Test Files 9 passed (9)`, `Tests 197 passed (197)`.
- `pnpm run typecheck`: exit 0.

El ABIERTO de F2.3 queda cerrado.

### Mapa R<n> → test (cambios de la enmienda)

| R | Test |
|---|---|
| R16, R18, R19, R20 | `tests/integration/db/geo-lecturas-catalogo.test.ts`. Su texto vigente es el de la enmienda: un distrito, una zona |
| R21 | `tests/integration/db/geo-equivalencia-dinero.test.ts`. Su texto vigente es el de la enmienda |
| R27 | `tests/unit/services/geografia-dominio.test.ts` (el colapso >1 se conserva como defensa) |

## 2026-11-04 · B1 de la review (vuelta 2)

B1 de la vuelta 2 arreglado con un cherry-pick de 9b4e0004 (`c8476f7a`): `zona-distrito-unica.test.ts`
envuelve el escenario en `conEmpresa(A, …)`; no cambia ningún `expect`.

Salida (`DATABASE_URL` → `logistic_slt44`, `NODE_OPTIONS=--max-old-space-size=8192`):
- `vitest run tests/integration/db/zona-distrito-unica.test.ts`: `Test Files 1 passed (1)`, `Tests 9 passed (9)` (R14 en verde).
- `pnpm run typecheck`: exit 0.

## 2026-11-04 · F2.3 · Renombrado en cascada de las migraciones de SLT-43

- Merge `d4fe9fe5` de `origin/feature/SLT-43-geo-jerarquica-modelo` (`37e25447`). Ahora las 6 migraciones de SLT-43 son `20261104120000_geo_enums_nodo_geografico` … `20261104120500_indices_nodo_geografico` y van después de las de SLT-52 (`20261103140100`). SLT-44 no tiene migraciones propias, así que no hay orden que comprobar.
- Hubo 3 conflictos: la cabecera de `modelos-de-negocio.ts` (85 de negocio), `catalogo-y-choke-point` (80 tipos, 30 entidades) y los tramos de `caja-459-migration` (`nodo_geografico` después de `tarifa_valor` y `grupo_distritos`). Los 3 se resolvieron con el lado de SLT-43, porque esta rama no tocaba esos archivos más allá de lo que ya traía de dev. No quedan referencias a los nombres `20261031120[0-5]00_*` de geo.
- Base: `logistic_slt44` tenía aplicados los nombres viejos, y `migrate deploy` falla con P3009 en `20261104120100`. `prisma migrate reset` exige el consentimiento explícito del humano, así que no se ejecutó. Se creó una base nueva, `logistic_slt44_r1104`, con `migrate deploy` (301 migraciones), `db:seed` y `db:generate`. **ABIERTO:** falta borrar o recrear `logistic_slt44`, y eso lo decide el humano.

Salida (`DATABASE_URL` → `logistic_slt44_r1104`, `NODE_OPTIONS=--max-old-space-size=8192`, un archivo por corrida con `timeout 600`):
- `slt43-migraciones-aditivas` 9/9; `migracion-slt43-ida-y-vuelta` 8/8.
- `geo-backfill` 16/16, `geo-catalogo-repository` 8/8, `geo-equivalencia` 4/4, `geo-equivalencia-dinero` 8/8, `geo-lecturas-catalogo` 8/8, `geo-lecturas-sin-backfill` 1/1, `geo-nodo-invariantes` 15/15, `geo-nodo-rls` 2/2, `geo-normalizar-nombre` 4/4, `geo-sincronia-geografia` 8/8, `geo-sincronia-orden-zonas` 10/10, `geo-tipo-nivel` 7/7, `geo-trigger-orden-rendimiento` 1/1.
- `zona-distrito-unica` 9/9; `zona-distrito-unica-migration` 24/24; `catalogo-y-choke-point` 52/52; `caja-459-migration` 6/6.
- `pnpm run typecheck`: exit 0.
