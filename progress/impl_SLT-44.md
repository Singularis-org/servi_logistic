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
