# impl SLT-125 — «Geografía jerárquica: presentación, exportes, cierres y geocodificación»

Bitácora de implementación. Spec: `specs/SLT-125-geo-jerarquica-exportes/` (aprobado en `77f7369d`).

## Maqueta (T0, R36)

- **Aprobada por el humano el 2026-11-12** (T0.2), antes de cualquier commit de pantalla.
- Referencia: `specs/SLT-125-geo-jerarquica-exportes/maqueta-SLT-125.html` (copia estática en el repo)
  y el artifact https://claude.ai/artifact/LNRExdwKbj9SgRhQzERf28.
- La armó el leader (T0.1) con países de 2, 3 (CR), 4 y 10 niveles. T3 la sigue.

## Base de datos de esta feature

- Base local `logistic_slt125` en el Postgres de `localhost:5432`, creada por el leader con `node` + `pg`
  conectando a la base `postgres` (`CREATE DATABASE`); no hay `psql` en esta máquina.
- Migrada con `prisma migrate deploy` y sembrada con `pnpm run db:seed` (`scripts/seed-catalogos.ts`).
- El worktree no tiene `.env`. Cada comando que toca base o tests de integración hace antes
  `source <scratchpad>/env125.sh`, que deriva `DATABASE_URL` y `DIRECT_URL` de la URL local de la raíz
  cambiando solo el nombre de la base, **aborta si no es `localhost:5432/logistic_slt125`**, y fija
  `HAY_BASE_DE_DATOS=1` y `NODE_OPTIONS=--max-old-space-size=8192`.
- Nunca se usa la base `logistic`, `servi_logistic_simprod`, Supabase ni producción.
- Comprobado el 2026-11-12: `SELECT id, nombre FROM pais` → `[{ id: 'CR', nombre: 'Costa Rica' }]`.

## T1.1 — Inventario (sobre `77f7369d`)

Explorado con Grep/Read: el MCP del grafo no tiene indexado este worktree (`index_status` → «project not
found»).

### Lecturas que nombran lugares con las relaciones `provincia`, `canton` o `distrito` (design §4.2)

| Lectura | `select`/`include` con la relación | Dónde se usa el nombre |
|---|---|---|
| Listado `/ordenes` (`WITH_ESTATUS_Y_TIENDA`) | `lib/repositories/OrdenRepository.ts:1144`, `:1145`, `:1149` (`{ id, nombre }`) | `toRelaciones` `:1282–1284`; `toListItemDTO` `:1297` |
| Recepción satélite (`toBodegaSateliteRow`, mismo `include`) | el de arriba (`:4280`, `:4435`) | `OrdenRepository.ts:1843–1845` |
| Etiqueta (`WITH_ETIQUETA`) | `OrdenRepository.ts:1416–1418` | `OrdenRepository.ts:1443–1445` (fila de etiqueta, `:4170`, `:4188`) |
| Novedades de la tienda (`findNovedadesByTienda`, el «mis-asignaciones» de design §4.2) | `OrdenRepository.ts:5928–5930` | `:5972–5974`; ya emite `lugarRuta` en `:5988` |
| Detalle de gestión / mis-asignaciones (`toMiAsignacionRow`) | `lib/repositories/GestionOrdenRepository.ts:308–310` | `:358–360`; ya emite `lugarRuta` en `:362` |
| Cierre de día en vivo (`WITH_DETALLE`, `toPendienteRow`) | `lib/repositories/CierreDiaRepository.ts:590–592` (dentro de `WITH_DETALLE`, `:576`) | `:623–625` |
| Envío de WhatsApp | `lib/repositories/OrdenEnvioReader.ts:62–64` | `:112–114` |
| Geocodificación (`findParaGeocodificar`) | `lib/repositories/OrdenGeocodeRepository.ts:23–25` | `:32–34` |

Ya leen del catálogo, sin relaciones de Prisma (se amplían, no cambian de fuente):
- `InformeTransitoRepository.ts:149–158` (`nodo(catalogo, id)`, cantón y distrito);
- `CoberturaRepository.ts:48–52` (`nodosDeProfundidad(catalogo, 3)` + `ancestros`), y su proyección
  `lib/utils/cobertura-distrito.ts:41–43`;
- `CierreDiaRepository.leerDescriptivosDeOrdenes` (`:392`) y `congeladoDeLaFila` (`:478`): el congelado
  del cierre; `crearCierre` (`:1222`) escribe en `createMany` `:1609` y `createManyAndReturn` `:1613`;
- `CierresAdminRepository.ts:250–252` selecciona las 3 columnas congeladas; mapea en `:517–519` y
  `:903–905` (design decía `:514` y `:900`: corrimiento de 3 líneas, mismo sitio).

Fuera de alcance (P6 o de otra superficie), con relación de lugar y **sin tocar**:
`OrdenRepository.ts:2899` (corrección de datos, ya del catálogo), `TarifasPantallaRepository.ts:185`,
`:194`, `ZonaRepository.ts:199`, `:506`, `:1398`, `GrupoDistritosRepository.ts:245`, `:503`,
`_shared/geografia-activa.ts:106`, `:111` y `CorregirDatosClienteService.ts:543`.

### Tests que afirman la forma de esos `select`/`include` (design §13.1, A6)

- **HALLAZGO 1 — `tests/unit/repositories/orden-repository.novedades.test.ts:415–449`.** El test
  «where del grupo, orderBy createdAt desc, skip/take y select de la orden completa» hace
  `expect(arg.select).toEqual({ … })` **literal y completo** sobre `findNovedadesByTienda`, con
  `provincia: { select: { nombre: true } }`, `canton: …` y `distrito: …` en `:435–437` (y `cantonId`,
  `distritoId` en `:439–440`). Es la lectura `OrdenRepository.ts:5928` de design §4.2. Quitar las
  relaciones (design §4.2: «Desaparecen las relaciones…») cambia esta aserción. A6 se retiró diciendo
  que ningún candidato afirmaba la forma: este no estaba entre los medidos. **No está autorizado: se
  para y se pregunta antes de T2.3.**
- Sin aserción de forma de lugar (confirmado): `orden-envio-reader.test.ts:157` (solo
  `select.zona.select`); `orden-repository.api-lectura.test.ts:541` afirma `select.distrito`
  **undefined** en `listByOwner`, que no es una lectura de esta feature;
  `satelite-proyeccion-compartida.guardia.test.ts:88–90` afirma que satélite y `/ordenes` comparten
  `include` (sigue cierto si los dos cambian igual); `orden-historial-repository.test.ts:158` es otro
  modelo; `consultas-concurrentes-en-transaccion.guardia.test.ts:797` es un texto de fuente de la
  guardia; `emisor-relaciones-anidadas.test.ts:91–95` y `_fixtures/geo-65.ts:266–268` son selects
  **del propio test** contra la base, no del repositorio.
- `pagos-proyeccion.guardia.test.ts:5,47–49` importa `WITH_DETALLE` y mira solo su desglose `pagos`.

### Tests con filas simuladas de entrada que nombran lugares por la relación (cambian solo su entrada)

Además de los 4 de design §13.1 (`orden-envio-reader`, `orden-repository.recepcion-satelite`,
`gestion-desde-ayuda-cierre` y `geocodificacion-service`), estos dobles devuelven filas con
`provincia: { nombre }` a un repositorio de §4.2 y, al pasar a la ruta del catálogo, tendrán que llevar
un catálogo con esos nombres. Sus salidas esperadas no cambian:
- `tests/unit/repositories/cierre-dia-repository.test.ts:64`
- `tests/unit/repositories/cierre-detalle-causa-monto.test.ts:53`
- `tests/unit/repositories/cierre-pagos-lectura.test.ts:63`
- `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts:101`, `:180`
- `tests/unit/repositories/gestion-orden-repository.test.ts:37`
- `tests/unit/repositories/orden-repository.guia.test.ts:186`, `:238`
- `tests/unit/repositories/orden-repository.novedades.test.ts:160`
- `tests/unit/repositories/orden-repository.test.ts:79`
- `tests/unit/repositories/satelite-paginado-where.test.ts:85`
- `tests/unit/services/api-pdf-etiqueta-columna-intacta.test.ts:196`
- `tests/integration/asimetria-sin-tarifa.test.ts:198`, `:267`
- `tests/integration/db/devolucion-rechazadas-flow.test.ts:145–149`: su doble de Prisma **lanza** con una
  relación de `orden` que no conoce y materializa los escalares del `select`; si el `select` gana FK,
  hay que comprobar que siga corriendo.
- `OrdenGeocodeRow` tipado con los 3 nombres en `geocodificacion-marcador-contrato.test.ts:54–60` y
  `geocodificacion-motivo.test.ts:27–33` (además de `geocodificacion-service.test.ts:40–46`, A7): cambian
  su entrada a `ruta` + `paisNombre`, con la consulta esperada derivada.

`cierres-bodega-admin-repository.test.ts:282` también lleva `provincia: { nombre }`, pero es de
`CierresBodegaAdminRepository`, que esta feature no toca.

### `orden` → `organizacion.pais.nombre` (design §4.5)

Existe: `db/schema.prisma:1037–1038` `Orden.organizacion` (`organizacionId` NOT NULL, relación
obligatoria; modelo `Orden` en `:830`), `:5940–5941` `Organizacion.pais` (`paisId` NOT NULL, default
`'CR'`) y `:5951–5953` `Pais.nombre String @unique`. El `select` anidado de §4.5 es válido.

### Llamadores

- `columnasDescargaOrdenes` → `app/(app)/ordenes/_components/OrdenesModule.tsx:35`, `:622`; test
  `ordenes-descarga-columnas.test.ts:184`, `:382`.
- `columnasDescargaSatelite` → `SateliteOrdenesListado.tsx:50`, `:755`; test
  `satelite-descarga-columnas.test.ts:34`, `:54`.
- `columnasDescargaCobertura` / `filaCobertura` / `motivoSinCoberturaLabel` →
  `DescargarCoberturaButton.tsx:9`, `:47`, `:73`; test `cobertura-descarga-columnas.test.ts`.
- `columnasDescargaGestionesFundidaPara` → `cierres-admin/_components/DescargarCierresButton.tsx:21`,
  `:141` (no cambia de firma).
- `geografiaLegible` (`lib/pdf/etiquetas-dibujo.ts:144`) → `etiquetas-dibujo.ts:212`, `:516`, `:540` y
  `app/(app)/ordenes/_components/EtiquetaGuia.tsx:9`, `:184`.
- `ubicacion(…)` (una copia por superficie): `cierre-dia-descarga-columnas.ts:100` (uso `:117`),
  `CierreDiaModule.tsx:484` (uso `:1211`), `cierre-detalle-shared.tsx:611` (usos en
  `CierreDiaModule.tsx` y **`app/(app)/cierres-admin/_components/cierre-factura.tsx:77`, `:1807`**),
  `cierres-gestiones-fundida-descarga-columnas.ts:425` (`:456`), `ayuda-descarga-columnas.ts:73`
  (`:100`), `novedades-descarga-columnas.ts:48` (`:73`), `RecepcionDetalle.tsx:30` (`:93`) y
  `app/paquete/[numGuia]/page.tsx:13` (`ubicacionLegible`, `:106`).
- `construirQueryDireccion` (`lib/geo/direccion-query.ts:43`) → `GeocodificacionService.ts:155`,
  `jobs/geocodificacion-encolado.ts:75`, `scripts/demo-qa/ubicar-y-cerrar-jobs.ts:91`; tests
  `direccion-query.test.ts` y `geocodificacion-service.test.ts:48`.

### `pais.nombre` de `CR`

- Una sola escritura: `db/migrations/20261026130000_pais/migration.sql:43–51`
  (`'CR', 'Costa Rica'`). Ninguna migración posterior hace `UPDATE "pais"`; las semillas
  (`scripts/seed-catalogos.ts`) no escriben `pais`. `tests/fabricas/paises.ts` crea países de prueba,
  no toca `CR`.
- En la base local: `Costa Rica`. En producción no se ha medido (lo cuenta el script de R34, T5.1).

### Archivos nuevos para «Archivos esperados»

- `tests/integration/db/geo-125-fixture.test.ts` (T1.3, el test que importa el fixture).
- `app/(app)/cierres-admin/_components/cierre-factura.tsx` usa `ubicacion` de `cierre-detalle-shared`:
  al cambiar esa función para leer la ruta (T3.2) puede que haya que tocar también su llamada.
- Los tests de entrada listados arriba (unos 13), si T2.3 confirma que necesitan catálogo.

Con el hallazgo 1, la estimación de 113 archivos sube a unos 129. Se avisa al humano antes de seguir.

## T1.2 — Referencia de las descargas de Costa Rica

- `tests/fixtures/descargas-cr/entrada.ts`: 5 casos de CR (San José · San José · Carmen; tildes con
  Pérez Zeledón · San Isidro de El General y una dirección con coma y comillas; sin distrito; zona
  vacía; sin distrito y zona vacía), más 7 filas de cobertura (con cobertura y cada motivo) y el
  `ubicacion_snapshot` de los cierres admin aparte (filas 0, 2 y 4 con snapshot, 1 y 3 sin él), porque
  el DTO de hoy no lo lleva. Cada caso trae su `lugar` con ids (`rutaDeLugar`) para que el test de
  equivalencia arme `lugarRuta` sin inventar nombres. Ningún DTO lleva `lugarRuta` (tipos de hoy).
- `scripts/capturar-referencia-descargas.ts`: 12 salidas (órdenes, satélite, novedades, ayuda, las 5
  secciones del cierre de día, la fundida de cierres admin para la central y para el satélite, y
  cobertura) por `buildCsvRows` y `buildXlsxRows`; guarda el CSV como texto y las celdas del XLSX
  releídas con `exceljs`. Se niega a sobrescribir la referencia.
- `tests/fixtures/descargas-cr/referencia.json`: generado con el código de hoy (58.886 bytes).
- Sin red ni base: se corrió con `DATABASE_URL` sin definir y una precarga que lanza ante cualquier
  conexión TCP o resolución DNS → «0 intentos de red» en los 3 procesos. Dos corridas a `--salida`
  del scratchpad salieron idénticas (`cmp`) e iguales a la referencia commiteada. Una tercera sobre la
  referencia sale con «ya existe y la referencia no se regenera» (exit 1).
- **Commit de la referencia: `123160093ab3521823592d3f086181d5abf78ff4`**, antes de cualquier commit de
  `lib/` o `app/`.
- Corrección `94f44972`: la guardia `censo-order-status-rename` rechazó `estatusValue: "devuelta"`
  (código anterior de la 455) en la entrada de novedades; pasa a `"novedad"`. Ese campo no sale en
  ninguna descarga: recapturada aparte, la salida es idéntica byte a byte a `referencia.json`, que
  **no se regeneró** ni se tocó.

## T1.3 — Fixture `geo-125`

- `tests/integration/db/_fixtures/geo-125.ts` sobre `crearEscenarioGeo47` (`_fixtures/geo-47.ts`): por
  empresa (CR y XA, esta con su nivel 4 «Sector»), un mensajero propio, tres órdenes (con distrito,
  sin distrito, con distrito en la otra provincia «Central») y una gestión vigente sin cierre en cada
  una (2 entregadas, 1 rechazo). Expone `paraSolicitarCierre` para que T2.2 pida el cierre por
  `crearCierre`; el fixture no lo crea.
- `tests/integration/db/geo-125-fixture.test.ts`: lo siembra y comprueba lo que promete. No afirma
  requisitos.
- Commit: `06a63cc0`.

## Archivos creados o modificados en T1

- `tests/fixtures/descargas-cr/entrada.ts`, `tests/fixtures/descargas-cr/referencia.json`,
  `scripts/capturar-referencia-descargas.ts` (T1.2)
- `tests/integration/db/_fixtures/geo-125.ts`, `tests/integration/db/geo-125-fixture.test.ts` (T1.3)
- `progress/impl_SLT-125.md`, `specs/SLT-125-geo-jerarquica-exportes/tasks.md` (T1.1: casillas y
  «Archivos esperados»)

Nada de `lib/`, `app/` ni `db/`. Sin dependencias nuevas ni migraciones.

## Mapa `R<n> → test` (parcial, T1)

T1 no cierra requisitos. Prepara R4, R10 y R26 (la referencia de §7) y el fixture de R16–R23.

## Salidas

```
pnpm exec vitest run tests/integration/db/geo-125-fixture.test.ts --maxWorkers=1   (con env125.sh)
 Test Files  1 passed (1)
      Tests  1 passed (1)

pnpm exec eslint <los 4 archivos nuevos>   → exit 0

pnpm run typecheck   → tsc --noEmit, exit 0

pnpm exec vitest run guard --maxWorkers=2   (= test:guardias, sin DATABASE_URL)
 Test Files  2 failed | 333 passed | 3 skipped (338)
      Tests  5 failed | 4717 passed | 25 skipped (4747)
 - censo-order-status-rename (1): era «devuelta» en la entrada; corregido en 94f44972 y
   re-corrido aparte → 14 passed (14)
 - dependencias-declaradas-presentes (4): init.sh sin el marcador de la ficha 420; heredado,
   está en tests/baseline-rojos.json y esta rama no toca init.sh
```

## Veredicto

T1.1–T1.3 hechas; **para antes de T2.3** por el hallazgo 1 (`orden-repository.novedades.test.ts:435–437`).

## T2.1 — Núcleo puro de la presentación (backend_dev, 2026-11-12)

Explorado con Grep/Read (el índice del grafo no tiene este worktree, como en T1.1).

Archivos:
- `lib/utils/ubicacion-presentacion.ts` (nuevo): `NivelDelPais`, `Ruta`, `columnasDeNivel`,
  `claveDeColumnaDeNivel`, `celdasDeNivel`, `lineaDeUbicacion`, `dosMasHondos`, `tiposDeDosMasHondos`,
  `rutaInvertida`. Sin Prisma ni React; ningún texto de nivel (R42). `dosMasHondos` con P7 = opción a
  (por nivel D−1·D, D = min(P, 3)): CR sin distrito → `{ arriba: cantón, abajo: null }`.
- `lib/utils/plantilla-geo.ts`: exporta `cabeceraNormalizada` y `cabeceraDeTipo` la usa (sin cambio de
  comportamiento; `plantilla-geo.test.ts` 21/21 verde sin tocar).
- `lib/repositories/_shared/ruta-del-lugar.ts`: `nivelesDelCatalogo`, `rutaConTipos` (profundidad = posición
  del paso; tipo = `nombre_singular` de `nivel_<k>` del país, la regla de `geo:backfill`) y
  `TipoDeNivelAusente` (un nivel sin tipo lanza: R23). `rutaDelLugar` sin cambios (P1).
- Tests: `tests/unit/utils/ubicacion-presentacion.test.ts`, `tests/unit/descarga/geo-columnas-n-niveles.test.ts`.

| R | Test |
|---|---|
| R1 (pura) | `geo-columnas-n-niveles.test.ts` › «R1/R3: una columna por nivel…» y «R1: la celda del nivel k…» (2, 3, 4 y 10 niveles) |
| R2 | `geo-columnas-n-niveles.test.ts` › «R2: …» (nivel «Zona», normalizado, dos niveles homónimos, reserva de otro, vacío) |
| R3 | `geo-columnas-n-niveles.test.ts` › «R3: clave del nivel k…» y claves en los casos de 4 y 10 niveles |
| R7 (pura) | `ubicacion-presentacion.test.ts` › «lineaDeUbicacion (R7)» |
| R11 (pura, P7 = a) | `ubicacion-presentacion.test.ts` › «dosMasHondos (R11; P7 opcion a)» |
| R13 (pura) | `ubicacion-presentacion.test.ts` › «tiposDeDosMasHondos (R13)» |
| R14 (pura) | `ubicacion-presentacion.test.ts` › «rutaInvertida (R14, R32)» |
| R21 (pura) | `ubicacion-presentacion.test.ts` › «rutaConTipos (R21)», «nivelesDelCatalogo» |

Salidas (con `env125.sh`):
```
pnpm exec vitest run tests/unit/utils/ubicacion-presentacion.test.ts --maxWorkers=1   → 22 passed (22)
pnpm exec vitest run tests/unit/descarga/geo-columnas-n-niveles.test.ts --maxWorkers=1 → 17 passed (17)
pnpm exec vitest run tests/unit/utils/plantilla-geo.test.ts --maxWorkers=1            → 21 passed (21)
pnpm run typecheck → tsc --noEmit, exit 0
pnpm exec eslint <los 5 archivos> → No issues found
pnpm exec vitest run guard --maxWorkers=2 → 1 failed | 334 passed | 3 skipped (338); 4 failed | 4718 passed
  - los 4 rojos son de dependencias-declaradas-presentes (ficha 420), en tests/baseline-rojos.json
```

## T2.2 — Snapshot de la ubicación en el cierre (backend_dev, 2026-11-13)

Código escrito por el subagente anterior y revisado aquí; se añade A9 y el cambio de entrada del doble.

Archivos:
- `lib/types/ubicacion-snapshot.ts` (nuevo): `ubicacionSnapshotV1Schema` (zod, forma de SLT-43 §2.6, `niveles`
  con al menos uno) y `leerUbicacionCongelada` (snapshot v1 → sus niveles; si no, las 3 columnas sin vacías,
  `id: null`; nunca nombra por id).
- `lib/repositories/CierreDiaRepository.ts`: `DescriptivosDeOrden.catalogo` (el de la misma transacción);
  `congeladoDeLaFila` suma `ubicacionSnapshot = { v: 1, niveles: rutaConTipos(cat, rutaDelLugar(cat, orden)) }`;
  ruta vacía → el mismo error de descriptivo ausente (el cierre se revierte, R23).
- `lib/repositories/CierresAdminRepository.ts`: `DETALLE_ADMIN_SELECT.ubicacionSnapshot`; `lugarRuta` con
  `leerUbicacionCongelada` en `toPendienteRowDesdeSnapshot` y `toGestionDescargaDTO`.
- `lib/services/CierreDiaService.ts` (`toDetalleDTO` pasa `lugarRuta`), y `lugarRuta?: Ruta` opcional en
  `ICierreDiaRepository`, `ICierreDiaService` y `ICierresAdminService` (aditivo, R37).
- Tests nuevos: `tests/unit/types/ubicacion-snapshot.test.ts`, `tests/integration/db/geo-125-cierre-snapshot.test.ts`.
- A9: `"ubicacionSnapshot"` en `COLUMNAS_DEV` de `tests/unit/repositories/cierre-dia-repository.test.ts:2052`
  y `tests/integration/db/cierre-detail-congelado.test.ts:691` (29 → 30). Nada más en esos tests.
- Entrada: `tests/fixtures/doble-catalogo-geografico.ts` devuelve un tipo (`tipo-del-doble`, `nivel_1`) para
  que `rutaConTipos` no lance; los nodos del doble no tienen padre (ruta de un paso).

| R | Test |
|---|---|
| R21 | `geo-125-cierre-snapshot.test.ts` › «R21: cada fila nueva lleva {v:1, niveles}…»; `cierre-dia-repository.test.ts` y `cierre-detail-congelado.test.ts` (`COLUMNAS_DEV` con 30, A9) |
| R22 | `geo-125-cierre-snapshot.test.ts` › «R22: en Costa Rica el snapshot … es igual al que escribe geo:backfill» |
| R23 | `geo-125-cierre-snapshot.test.ts` › «R23: … el pais sin tipos de nivel, el cierre entero se revierte» y «R18: si el lugar … no esta en el catalogo…» |
| R24 | `ubicacion-snapshot.test.ts` › «R24: con un snapshot v1 valido…» (5 casos, incluido país de 4 niveles e id nulo) |
| R25 | `ubicacion-snapshot.test.ts` › «R25: sin snapshot o con uno que no cumple la v1…» |

Salidas (con `env125.sh`, uno a uno, `--maxWorkers=1`; 152 archivos: los 26 que importan el doble, los de
cierre/cierres-admin, los nuevos, A1 y A2):
```
ubicacion-snapshot.test.ts            16 passed (16)
geo-125-cierre-snapshot.test.ts        4 passed (4)
cierre-dia-repository.test.ts        116 passed (116)
cierre-detail-congelado.test.ts        7 passed (7)
geo-backfill.test.ts                  16 passed (16)   (A1, sin cambios)
geo-sincronia-orden-zonas.test.ts     10 passed (10)   (A2, sin cambios)
los 26 que importan doble-catalogo-geografico: 26/26 verdes
total: 129 verdes, 23 rojos. Los 23 fallan en el arranque con «tabla `orden` vacia: corre `pnpm run db:seed`»
  (la base logistic_slt125 no tiene semilla de órdenes ni usuarios): ambiental, no de este cambio. Son
  454/caracterizacion/{confirmacion-fisica-238,tope-276}, 486-evidencias-cierres-sql-real y 20 cierre-*/
  correccion-*/corte-diario-*/deshacer-*/emisor-* de tests/integration/db. No se sembró la base.
pnpm run typecheck → exit 0
pnpm exec eslint <12 archivos> → sin problemas
```

## T2.4 — Geocodificación (backend_dev, 2026-11-12)

Explorado con Grep/Read (el índice del grafo no tiene este worktree).

Archivos:
- `lib/geo/direccion-query.ts`: `ComponentesDireccion = { direccion, ruta, paisNombre }`; la consulta es
  `[direccion, ...ruta invertida, paisNombre]`; se borra la constante del país.
- `lib/interfaces/repositories/IOrdenGeocodeRepository.ts`: `OrdenGeocodeRow` = `{ id, direccion, ruta, paisNombre }`
  (se retiran los 3 nombres; contrato interno).
- `lib/repositories/OrdenGeocodeRepository.ts`: `select` con `cantonId`, `distritoId` y
  `organizacion.pais.nombre`; sin relaciones `provincia/canton/distrito` ni `nodo_geografico_id`; ruta con
  `rutaDelLugar` sobre el catálogo de `deLaEmpresa()` (uno por instancia, solo si hay fila).
- `lib/services/GeocodificacionService.ts`, `lib/services/jobs/geocodificacion-encolado.ts`,
  `scripts/demo-qa/ubicar-y-cerrar-jobs.ts` (`ruta: []`, `paisNombre: null`; el tipo de su cliente suma los
  modelos del catálogo).
- Tests: `tests/unit/geo/direccion-query.test.ts` (entradas a la forma nueva, lo esperado igual; casos
  nuevos 2/4/10 niveles y CR con cadena y huella literales), `tests/integration/db/geo-125-geocode-cache.test.ts`
  (nuevo). Solo entradas: `geocodificacion-service.test.ts` (A7), `geocodificacion-marcador-contrato.test.ts`,
  `geocodificacion-motivo.test.ts`, `integraciones-consumidores-composition-root.test.ts` (este último no
  estaba en el inventario: su doble devuelve una fila con los 3 nombres).

| R | Test |
|---|---|
| R32 | `direccion-query.test.ts` › «SLT-125 R32 — ruta de N niveles y pais de la empresa» (2, 4, 10 niveles; dirección vacía) |
| R33 | `direccion-query.test.ts` › «SLT-125 R33 — Costa Rica: cadena y huella literales de hoy» (huellas medidas con la función de antes); `geo-125-geocode-cache.test.ts` (caché sembrada con la huella de hoy → 0 llamadas al proveedor, con y sin distrito; y la cadena nueva = la de hoy en las 3 órdenes de CR) |

Salidas (con `env125.sh`, uno a uno, `--maxWorkers=1`):
```
geo-125-geocode-cache.test.ts                     3 passed (3)
direccion-query.test.ts                          21 passed (21)
geocodificacion-service.test.ts                  60 passed (60)
orden-geocode-enqueue.test.ts                     8 passed (8)
demo-qa-jobs.test.ts                             13 passed (13)
geocodificacion-encolado.test.ts                 18 passed (18)
geocodificacion-marcador-contrato.test.ts        26 passed (26)
geocodificacion-motivo.test.ts                   14 passed (14)
integraciones-consumidores-composition-root      14 passed (14)
notificacion-notificadores-reales.test.ts        39 passed (39)
pnpm run typecheck → exit 0
pnpm exec eslint <12 archivos> → 0 errores (1 warning previo en geocodificacion-service.test.ts:386, no tocado)
vitest run guard → 1 failed | 334 passed | 3 skipped; los 4 rojos de dependencias-declaradas-presentes (baseline)
```

## T2.5 — WhatsApp en el servidor (backend_dev, 2026-11-12)

Archivos:
- `lib/types/plantilla-datos.ts`: `OrdenPlantillaDatos.lugarRuta?: readonly { nombre }[] | null` (opcional
  para no tocar `OrdenEnvioReader`, que es de T2.3 y lo llenará allí); `provincia/canton/distrito` leen
  `lugarRuta[0..2]` y, sin ruta, los 3 nombres de hoy; `ubicacion` (P3, con `rutaInvertida`, ofrecida);
  `nivel_1`…`nivel_10` con atributo `nivel`, nombre neutro «Nivel k», fuera de `CAMPOS_PLANTILLA_OFRECIDOS`
  y de `CLAVES_OCULTAS_EN_SELECTOR` (sigue en 27); `DATOS_PLANTILLA_EJEMPLO.lugarRuta` con 3 niveles; los
  ejemplos de `nivel_1..3` salen de esa misma ruta, `nivel_4..10` con `""`.
- `lib/utils/whatsapp-envio-valores.ts`: `ordenVacia().lugarRuta = null`; la vista previa del mensajero pasa
  `orden.lugarRuta` del DTO.
- `tests/fixtures/plantilla-datos.ts`: `lugarRuta: null` (solo entrada: las suites que lo usan siguen igual).
- Tests: `tests/unit/whatsapp/plantilla-niveles.test.ts` (nuevo). En `tests/unit/types/plantilla-datos.test.ts`,
  solo lo autorizado:
  - A3, `:235–237`: título «53 entradas, 48 propias y 5 alias», `42 → 53`, `37 → 48`;
  - A3b, `:40`: el `not.toBe("")` del ejemplo no se aplica a `nivel_4`…`nivel_10` (una línea de comentario
    más, así que el `it.each` pasa de `:247` a `:248`).
  - A3b `:248` **no se tocó**: `nivel_4..10` tienen `ejemplo: ""` y resuelven a `""`, así que la igualdad
    estricta sigue cumpliéndose sin excluirlos. Cambiarla habría debilitado una aserción sin necesidad.
  Verificado antes: las líneas `:40`, `:235–237` y `:247` (it.each) coincidían con el spec.

| R | Test |
|---|---|
| R28 | `plantilla-niveles.test.ts` › «R28 — provincia, canton y distrito son los niveles 1, 2 y 3 de la ruta» (con ruta, ruta corta o vacía, sin ruta; ninguna clave de hoy deja de resolver ni pasa a `clavesSinCampo`) |
| R29 | `plantilla-niveles.test.ts` › «R29 — nivel_1..nivel_10 y ubicacion» (2, 4 y 10 niveles; ejemplo «Carmen, San José, San José»; `nivel_4..10` sin ejemplo); `plantilla-datos.test.ts` (A3, A3b) |
| R31 | `plantilla-niveles.test.ts` › «R31 — Costa Rica: …» (envío, sin distrito, vista previa y vista previa del mensajero, con el texto de hoy literal); `preview-mismo-motor.test.ts` sin cambios |

Salidas (con `env125.sh`, uno a uno):
```
plantilla-niveles.test.ts                    15 passed (15)
plantilla-datos.test.ts                      85 passed (85)
preview-mismo-motor.test.ts                  10 passed (10)   (sin cambios)
campos-ocultos-siguen-resolviendo.test.ts    98 passed (98)   (sin cambios)
catalogo-de-variables.test.ts                 6 passed (6)    (sin cambios)
CampoVariablePicker.test.tsx                 16 passed (16)   (sin cambios, A4)
+ 26 suites más que importan plantilla-datos / whatsapp-envio-valores / plantilla-mensaje: todas verdes,
  salvo 455/caracterizacion/plantilla-estatus.test.ts («tabla `orden` vacia»: base sin semilla de órdenes;
  está en tests/baseline-rojos.json)
guardias etiquetas-geograficas-sin-literal (6), sinpe-en-toda-superficie (9), lib-no-importa-app (3): verdes
pnpm run typecheck → exit 0; eslint de los 5 archivos → sin problemas
```

## T2.6 — PDF de tránsito (backend_dev, 2026-11-13)

La parada del 2026-11-12 (3 aserciones fuera de §13.1) la resolvió el humano con **A10**. Hecha así:

Archivos:
- `lib/whatsapp-envios/informes/transito/tipos.ts`: `FilaTransito` suma `ruta: Ruta` y `niveles: NivelDelPais[]`.
- `lib/repositories/InformeTransitoRepository.ts`: con el catálogo ya cargado (cero consultas más),
  `ruta = rutaDelLugar(cat, fila)` y `niveles = nivelesDelCatalogo(cat)`; `canton` y `distrito` como antes.
- `lib/whatsapp-envios/informes/transito/calculo.ts`: `PaqueteTransito` pasa `ruta` y `niveles`.
- `lib/whatsapp-envios/informes/transito/pdf.ts`: el título de la columna de lugar es
  `tiposDeDosMasHondos(niveles)` en mayúsculas unidos « · » (sin ningún texto de nivel a mano, R42); la celda,
  `dosMasHondos(ruta, P)` sin tramos vacíos (P7 opción a). `COLUMNAS_ZONA` pasa a `columnasZona(niveles)`.
- `scripts/geo-equivalencia/analitica-de-hoy.ts` (copia congelada de SLT-71): `filasEnAlertaDeHoy` devuelve
  `ruta: []` y `niveles: []` para cumplir el tipo. No es una aserción; hoy esos campos no existían y la
  comparación los excluye (A10). Sin esto no compilan la copia, `repoDeHoy` del test ni el script de equivalencia.
- Tests, A10: `informe-transito-seleccion.test.ts:66` espera el mismo objeto más `ruta` (provincia, cantón y
  distrito de la base, con sus ids) y `niveles` de CR; `geo-transito-nombres.test.ts:223` y `:227` (antes
  `:206` y `:210`) comparan con `sinRutaNiNiveles` (copia profunda sin esas dos claves; lo demás, igual).
- Solo entradas: el `fila()` de `informe-transito-pdf`, `-calculo`, `-informe`, `-repo-consultas` e
  `informe-transito-actions` suma `ruta` y `niveles` con `tests/fixtures/transito-ruta.ts` (nuevo:
  `NIVELES_CR`, `rutaDeCR`). En el del PDF la ruta sale del cantón y el distrito ya mezclados con `over`.
- Test nuevo: `tests/unit/whatsapp-envios/transito-pdf-niveles.test.ts`.

| R | Test |
|---|---|
| R13 | `transito-pdf-niveles.test.ts` › «SLT-125 R13 — …» (país de 4: «COMUNA · BARRIO» y «Ñuñoa · Villa Olímpica»; país de 2: «DEPARTAMENTO · MUNICIPIO» y niveles 1·2; país de 3 sin textos de CR; ruta que no llega al nivel más hondo) |
| R15 (PDF) | `transito-pdf-niveles.test.ts` › «SLT-125 R15 — Costa Rica…» («CANTÓN · DISTRITO», «San José · Hatillo», sin distrito «Heredia»); `informe-transito-pdf.test.ts` sin cambiar aserciones («CANTÓN · DISTRITO», «San José · Hatillo» literales) |

Salidas (con `env125.sh`, uno a uno, `--maxWorkers=1`):
```
transito-pdf-niveles.test.ts                       6 passed (6)
informe-transito-pdf.test.ts                      21 passed (21)
informe-transito-calculo.test.ts                  16 passed (16)
informe-transito-informe.test.ts                  14 passed (14)
informe-transito-repo-consultas.test.ts            2 passed (2)
informe-transito-actions.test.ts                  10 passed (10)
informe-transito-{composicion,deps,parametros}     1 / 1 / 23 passed
geo-transito-nombres.test.ts                       5 passed (5)
geo-equivalencia-analitica.test.ts                13 passed (13)
geo-analitica-lugar / geo-lecturas-sin-backfill / geo-71-fixture   8 / 3 / 1 passed
guardias etiquetas-geograficas-sin-literal (6), geografia-lecturas-sin-nodo-fk (18),
  catalogo-geografico-sin-instancia-de-modulo (7): verdes
informe-transito-{seleccion,zonas,hitos,parados,catalogo-real}: rojos en el arranque con
  «475: no hay ningun usuario en la base de test» (base sin semilla): ambiental. Por eso la aserción A10 de
  `informe-transito-seleccion.test.ts:66` NO se pudo ver en verde en local; la verá la CI.
pnpm run typecheck → exit 0
pnpm exec eslint <15 archivos> → 0 errores (1 warning previo en analitica-de-hoy.ts:97, no tocado)
vitest run guard → 1 failed | 334 passed | 3 skipped; los 4 rojos de dependencias-declaradas-presentes (baseline)
```

## T2.7 — Scripts de evidencia (backend_dev, 2026-11-12)

Archivos:
- `scripts/geo-equivalencia-presentacion.ts` (nuevo): por empresa (`conEmpresa`), órdenes vivas por lotes
  (`--lote`, 1000), cuenta `nombres-distintos` (ruta del catálogo frente a las tablas viejas),
  `consultas-distintas` y `huellas-distintas` (consulta nueva frente a la de hoy). Cliente de solo lectura
  (`crearClienteDeSoloLectura`, reexportado como `crearClienteDelScript`); solo localhost salvo `--destino`
  igual al proyecto o host de la URL (`destinoDeUrl` de `geo:backfill`). Imprime cifras e ids (como mucho
  100 por bloque, más «y N más»). Salida 0/1/2.
- `scripts/geo-equivalencia/geocode-de-hoy.ts` (nuevo): copia congelada de `construirQueryDireccion` de antes.
- `scripts/comparar-descargas.ts` (nuevo): dos CSV o dos XLSX con `exceljs` (ya aprobado), celda a celda
  (XLSX por valor crudo con su tipo), y en CSV además si son iguales byte a byte. Imprime filas, columnas,
  `celdas-distintas` y coordenadas `F<f>C<c>` (máx. 200), nunca valores. Salida 0/1/2. Probado a mano en el
  scratchpad: CSV igual → 0, CSV con una celda distinta → `F2C2` y 1, XLSX igual (dos libros con distinta
  fecha de creación) → 0, XLSX distinto → 1, extensiones mezcladas → 2.
- `package.json`: `geo:equivalencia-presentacion` y `descargas:comparar`.
- Test: `tests/integration/db/geo-equivalencia-presentacion.test.ts` (nuevo).

| R | Test |
|---|---|
| R34 | `geo-equivalencia-presentacion.test.ts` › «CR: 0 nombres y 0 consultas distintas, salida 0; no escribe ni imprime datos del fixture» (fixture `geo-125`, lote 2 para pasar por varios lotes); «un nombre del catalogo distinto…» (antivacío: un nodo renombrado solo en la lectura cuenta las órdenes de ese cantón por id y sin el nombre); «…un INSERT falla con 25006»; «…no es local y sin --destino, sale con 2…»; los casos sin base (argumentos, `baseAdmitida`, código de salida, consulta de hoy) |

Salidas (con `env125.sh`):
```
geo-equivalencia-presentacion.test.ts   8 passed (8)
pnpm run typecheck → exit 0; eslint de los 4 archivos → sin problemas
vitest run guard → 1 failed | 334 passed | 3 skipped; los 4 rojos de dependencias-declaradas-presentes (baseline)
```

## Veredicto T2.4–T2.7

T2.4, T2.5 y T2.7 hechas y en verde; T2.6 parada por 3 aserciones fuera de §13.1, a la espera del humano.

## Veredicto T2.2 y T2.6

T2.2 y T2.6 hechas y en verde (A9, A10); las integraciones que piden semilla de órdenes/usuarios no corren en `logistic_slt125`.

## T2.3 — Lecturas con la ruta del catálogo (backend_dev, 2026-11-13) — PARADA en parte (R38)

Explorado con Grep/Read (el índice del grafo no tiene este worktree).

**Estado:** hecho y commiteado lo que no cambia aserciones (`9da81ef0`). La parte de `OrdenRepository`
(listado, satélite, etiqueta, novedades) está **escrita y en verde en sus tests nuevos, pero sin commitear**
en el worktree, porque 3 aserciones existentes fuera de §13.1 tendrían que cambiar. `CoberturaRepository`
(P5) **no se tocó**: añadir `ruta` a su fila cambia 2 aserciones de equivalencia. Detalle abajo.

### Commiteado — `9da81ef0`

- `lib/repositories/_shared/ruta-del-lugar.ts`: `tresPrimerosNiveles` y `nombresDeLaRuta` (los 3 campos de
  nombre de hoy salen de la ruta: `string` → `""` y distrito → `null` si la ruta no llega; R18, R37).
- `lib/repositories/GestionOrdenRepository.ts` (`WITH_ASIGNACION`), `lib/repositories/CierreDiaRepository.ts`
  (`WITH_DETALLE`, vista en vivo, `toPendienteRow(row, flag, catalogo)`; el catálogo, uno por instancia, solo
  si hay filas; `CierrePrismaClient` suma los modelos del catálogo) y `lib/repositories/OrdenEnvioReader.ts`
  (llena `OrdenPlantillaDatos.lugarRuta`, hueco de T2.5): sin relaciones `provincia/canton/distrito`, con las FK.
- Solo entradas: `tests/fixtures/doble-catalogo-geografico.ts` (admite `padreId`: profundidad por la cadena
  y un tipo por nivel; sin cadena, todo como antes), `preview-mismo-motor.test.ts`, `cierre-detalle-causa-monto`,
  `cierre-dia-repository` (el doble corre `$transaction` sobre sí mismo si el caso no trae el suyo; filas con
  `cantonId`, y `distritoId: null` donde antes era `distrito: null`), `cierre-pagos-lectura`, `orden-envio-reader`.

### Escrito y sin commitear (pendiente de autorización)

- `lib/repositories/OrdenRepository.ts`: `WITH_ESTATUS_Y_TIENDA` y `WITH_ETIQUETA` sin relaciones de lugar
  (`WITH_ETIQUETA` suma `cantonId`, `distritoId`); `lugaresDeOrdenes` (marca + ruta con UNA llamada a
  `deLaEmpresa`) en `list`, `findListItemsByIds`, `findRecepcionSateliteByZona` y `hidratarSatelite`;
  `toRelaciones` desde la ruta; `toListItemDTO` emite `lugarRuta`; `toEtiquetaRow` y `findNovedadesByTienda`
  nombran con la ruta (A8).
- `lib/types/orden.ts` (`OrdenListItemDTO.lugarRuta?`, que hereda `RecepcionSateliteDTO`),
  `lib/types/etiqueta-guia.ts` (`EtiquetaGuiaDTO.lugarRuta?`), `lib/interfaces/repositories/IOrdenRepository.ts`
  (`EtiquetaRow.lugarRuta?`), `lib/services/EtiquetaGuiaService.ts` (la pasa si viene).
- A8 aplicada en `tests/unit/repositories/orden-repository.novedades.test.ts`: se quitaron solo las 3 líneas
  `provincia/canton/distrito: { select: { nombre: true } }` del `select` esperado; **no** hizo falta
  `provinciaId` (la ruta sale de `cantonId`/`distritoId`). Además, solo entrada: la fila lleva FK y el doble la cadena.
- Solo entrada: `orden-repository.test.ts`, `orden-repository.guia.test.ts`, `orden-repository.recepcion-satelite.test.ts`.
- Tests nuevos: `tests/integration/db/geo-125-nombres-catalogo.test.ts`,
  `tests/unit/repositories/ruta-sin-consulta-por-fila.test.ts`,
  `tests/unit/guards/presentacion-lugar-del-catalogo.guardia.test.ts`.

### Aserciones que tendrían que cambiar (NO cambiadas)

| Archivo:línea | Hoy | Tendría que ser | Por qué |
|---|---|---|---|
| `tests/unit/guards/satelite-proyeccion-compartida.guardia.test.ts:131` | `for (const relacion of ["estatus", "tienda", "zona", "provincia", "canton", "distrito"]) expect(include[relacion]).toBeDefined()` | la lista sin `"provincia", "canton", "distrito"` | design §4.2 quita esas relaciones del `include` del listado |
| `tests/unit/repositories/orden-repository-list-items-by-ids.test.ts:115–124` | `Object.keys(include).sort()` = `["canton","distrito","estatus","gestiones","mensajeroAsignado","provincia","tienda","zona"]` | `["estatus","gestiones","mensajeroAsignado","tienda","zona"]` | ídem |
| `tests/unit/repositories/orden-repository.recepcion-satelite.test.ts:146` (`toEqual` exacto de la fila) | el objeto de hoy (31 claves) | el mismo objeto + `lugarRuta: [{ id: "p-1", nombre: "Prov" }, { id: "c-1", nombre: "Canton" }, { id: "d-1", nombre: "Distrito" }]` | design §4.2/§6: `RecepcionSateliteDTO` gana `lugarRuta` |
| `tests/integration/db/geo-lecturas-catalogo.test.ts:454` | `expect(normal(nuevo)).toEqual(normal(deHoy))` (fila de `listDistritos` = copia de hoy) | comparar sin la `ruta` nueva (como A10) | P5: la fila de cobertura necesita la ruta de P niveles para que `CoberturaDistritoDTO.ruta` exista |
| `tests/integration/db/slt89-equivalencia-cr.test.ts:98` | `expect(normal(r.cobertura.nuevo)).toEqual(normal(r.cobertura.deHoy))` | ídem | ídem |

Además, para P5 hay una decisión de forma no escrita en el spec: cómo se llama el motivo «retirado del
catálogo» de un nivel ≥ 4 (`MotivoSinCobertura` hoy solo tiene `provincia_retirada`, `canton_retirado`,
`distrito_retirado`). Propuesta, siguiendo R3: las claves de hoy para k = 1..3 y `nivel_<k>_retirado` desde k = 4.

### R → test

| R | Test | Cifras |
|---|---|---|
| R16 | `geo-125-nombres-catalogo.test.ts` › «R16/R17: en CR, el listado, satelite, etiqueta, detalle de gestion, cierre en vivo y envio…»; guardia `presentacion-lugar-del-catalogo` (7 archivos de §4.2, con contraprueba) | 6/6; 5/5 |
| R17 | `geo-125-nombres-catalogo.test.ts` (frente a las tablas viejas, CR, 3 órdenes × 6 superficies, con y sin distrito) | dentro de 6/6 |
| R18 | `geo-125-nombres-catalogo.test.ts` › «R18: un lugar que no esta en el catalogo no hace fallar ninguna lectura…» | dentro de 6/6 |
| R19 | `geografia-lecturas-sin-nodo-fk` y `geografia-sin-cte-recursiva`, sin cambios | 18/18; 5/5 |
| R20 | `ruta-sin-consulta-por-fila.test.ts` (6 superficies con 1 y 50 filas: 1 `deLaEmpresa`, 1 `nodoGeografico.findMany`, mismas consultas; sin filas, 0 cargas; envío; memoria por instancia) | 9/9 |
| R37 | suites de `tests/integration/api/` sin cambios (incl. `v2-consulta`, `v2-ordenes`, `contrato-v1`) | 33/33 archivos verdes |
| R40 | `geo-125-nombres-catalogo.test.ts` › «R40: en XA…», «…un lugar de otro pais no aporta nombres…», «…en plataforma… EmpresaNoResuelta» (5 lecturas) | dentro de 6/6 |
| R41 | `geo-125-nombres-catalogo.test.ts` › «R41: adminTienda y adminSatelite…» (tienda y zona propias y ajenas; recorte de satélite; `lugarRuta` solo con `id` y `nombre`) | dentro de 6/6 |

### Latencia del listado de `/ordenes` (50 filas, CR, base local)

Test temporal no commiteado: fixture `geo-125` + 50 órdenes de CR, `list({ where: { tiendaId }, take: 50 })`
como la app, con un repositorio nuevo por medición; 5 de calentamiento y 30 alternadas con una copia del
`OrdenRepository` de `8c045b1d` (antes) y el de ahora (después).

```
corrida 1: antes mediana 22.0 ms, p90 25.8 ms | despues mediana 19.5 ms, p90 24.0 ms
corrida 2: antes mediana 21.0 ms, p90 24.9 ms | despues mediana 18.8 ms, p90 21.8 ms
```

Más rápido: se van las 3 consultas de las relaciones, y la carga del catálogo ya la hacía la marca (SLT-65).

### Salidas (con `env125.sh`, uno a uno, `--maxWorkers=1`)

```
unit (116 archivos que importan los repos/servicios tocados): verdes salvo los 3 de la tabla de arriba
  y 4 módulos que no son tests (fabricas/_semilla/_escenario: «No test files found»)
integration/db (116): 67 verdes, 45 rojos, todos en tests/baseline-rojos.json y por base sin semilla
  («tabla `orden` vacia», «no hay ningun usuario», «estatus ayuda_tienda»), + 4 módulos que no son tests
integration/api (30 + 3): todas verdes
geo-125-nombres-catalogo 6/6 · ruta-sin-consulta-por-fila 9/9 · presentacion-lugar-del-catalogo 5/5
orden-repository.novedades 36/36 (A8) · orden-repository 47/47 · orden-repository.guia 31/31
cierre-dia-repository 116/116 · cierre-pagos-lectura 14/14 · orden-envio-reader 8/8 · preview-mismo-motor 10/10
pnpm run typecheck → exit 0
pnpm exec eslint <archivos tocados> → 0 errores (2 warnings previos, no tocados)
vitest run guard → 2 failed | 334 passed | 3 skipped: dependencias-declaradas-presentes (4, baseline) y
  satelite-proyeccion-compartida (1, la aserción :131 de arriba)
```

### Veredicto T2.3

Parada por R38: commiteada la parte de gestión, cierre en vivo y envío; la de `OrdenRepository` espera la
autorización de 3 aserciones, y cobertura (P5) la de 2 más y el nombre del motivo de nivel ≥ 4.

### T2.3 — continuación (backend_dev, 2026-11-13, tras A11/A12)

- **A11 aplicada y commiteada** — `2214a351` «feat(SLT-125): T2.3 listado, satélite, etiqueta y novedades nombran
  el lugar con el catálogo». La `lugarRuta` de satélite salió tal cual se autorizó (`p-1`/`c-1`/`d-1`). Verdes:
  satelite-proyeccion-compartida 3/3, list-items-by-ids 8/8, recepcion-satelite 8/8 y los 25 `orden-repository*`.
- **Cobertura (P5) escrita, en verde y SIN commitear** — PARADA por R38:
  - `CoberturaRepository.listDistritos`: filas = `nodosDeProfundidad(cat, P)`, con P de `nivelesDelCatalogo`;
    `ruta` (nivel 1 → P, con el flag propio) en `DistritoCoberturaRow`; los tres campos de hoy, de la ruta.
    Si el país no tiene el nivel, el campo queda vacío y activo. Zona y marca son las de la hoja.
  - `lib/utils/cobertura-distrito.ts`: el motivo sale del primer nivel inactivo de la ruta (1–3: claves de hoy;
    k ≥ 4: `nivel_<k>_retirado`). `CoberturaDistritoDTO.ruta?` (opcional, patrón aditivo); el orden va nivel
    por nivel de la ruta.
  - `lib/types/cobertura.ts` añade `MotivoNivelRetirado`.
  - A12 aplicada en `geo-lecturas-catalogo.test.ts:454` y `slt89-equivalencia-cr.test.ts:98`.
  - No son aserciones:
    - `scripts/geo-equivalencia-dinero.ts`: empareja ignorando `ruta`;
    - `tests/unit/utils/cobertura-vs-resolve-geo.test.ts`: `default` del switch auxiliar (typecheck).
  - Test nuevo: `tests/unit/descarga/cobertura-n-niveles.test.ts`, 9/9.
- **Aserción que tendría que cambiar (NO cambiada):** `tests/unit/actions/cobertura.composition-root.test.ts:59–74`.
  - Antes: `toEqual` exacto del ítem sin `ruta`.
  - Después: el mismo ítem + `ruta: [{ id: "p1", nombre: "San José" }, { id: "c1", nombre: "Escazú" }, { id: "d1", nombre: "San Rafael" }]`,
    o comparar sin `ruta`, como A12.
- **Falta para R6 en T3.1:** columnas por nivel desde `ruta`, y un texto de `motivoSinCoberturaLabel` (cliente)
  para `nivel_<k>_retirado`. Hoy compila (`Record` con clave de plantilla), pero a ese motivo le da `undefined`.

## T2.3 — cierre (implementer, 2026-11-13)

- A13 (autorizada, `9a3d32d3`): `cobertura.composition-root.test.ts:59` espera el mismo resultado más la `ruta`
  exacta del ítem (`p1/San José`, `c1/Escazú`, `d1/San Rafael`). No se excluye `ruta` de la comparación.
- Aceptados por el humano, sin aserción: `scripts/geo-equivalencia-dinero.ts` y el `default` de
  `cobertura-vs-resolve-geo.test.ts`.
- Salida: `cobertura.composition-root` + `cobertura-n-niveles` → `Test Files 2 passed (2)`, `Tests 10 passed (10)`.
  `pnpm run typecheck` → exit 0. eslint de los archivos de cobertura → 0 errores, 1 warning previo.
  Guardias (`vitest run guard`): 338 de 339 archivos verdes; 4 rojos, todos de `dependencias-declaradas-presentes` (baseline).

| R | Test |
|---|---|
| R6 (servidor) | `tests/unit/descarga/cobertura-n-niveles.test.ts` (9/9); `cobertura.composition-root.test.ts` (A13) |
| R16–R18, R40, R41 | `tests/integration/db/geo-125-nombres-catalogo.test.ts` (6/6); guardia `presentacion-lugar-del-catalogo` (5/5) |
| R19 | `geografia-lecturas-sin-nodo-fk` (18/18), `geografia-sin-cte-recursiva` (5/5), sin cambios |
| R20 | `tests/unit/repositories/ruta-sin-consulta-por-fila.test.ts` (9/9) |
| R37 | 33 suites de `tests/integration/api`, sin cambios |

## T3.1 y T3.3 — Columnas por nivel en descargas y tablas (frontend_dev, 2026-11-13)

Explorado con Grep/Read (el índice del grafo no tiene este worktree).

### Archivos

- Nuevo: `app/(app)/_components/niveles-de-columnas.ts` — `nivelesDeColumnas` (los niveles del país, o
  los 3 de las etiquetas si no llegan: superadmin, tests sin proveedor), `nivelesDeCeldas`,
  `conColumnasDeNivel` (las de lugar en el sitio de las 3 de hoy, con `columnasDeNivel`) y `rutaDeLaFila`
  (la ruta del DTO, o los 3 nombres de hoy si el DTO no la trae).
- `ordenes-descarga-columnas.ts`: `columnasDescargaOrdenes(etiquetas, niveles?)`; factoría nueva
  `filaDescargaOrdenDe(niveles?)` (celdas desde `lugarRuta`); `filaDescargaOrden(orden)` sigue con un
  parámetro (hay `filas.map(filaDescargaOrden)` en tests de 470/170). `COLUMNAS_DESCARGA_ORDENES` igual.
- `satelite-descarga-columnas.ts`: ídem (`columnasDescargaSatelite(etiquetas, niveles?)`, `filaDescargaSateliteDe`).
- `cobertura-descarga-columnas.ts`: `columnasDescargaCobertura(etiquetas, niveles?)`,
  `filaCobertura(etiquetas, niveles?)` (celdas desde `ruta`), `motivoSinCoberturaLabel(etiquetas, niveles?)`
  da «<tipo del nivel k> retirado del catálogo» para `nivel_<k>_retirado` (k ≥ 4); 1–3 con sus textos de hoy.
- Llamadores: `OrdenesModule.tsx`, `RecepcionSateliteModule.tsx`, `SateliteOrdenesListado.tsx`,
  `DescargarCoberturaButton.tsx` (leen `useNivelesGeograficos()`).
- `ordenes-columns.tsx` (P4): `ordenesColumnsDe(etiquetas, niveles?)` y `ordenesColumnsReprogramadaDe`;
  una columna por nivel tras «Zona», ids `provincia/canton/distrito/nivel_<k>`, celda «—» si la ruta no
  llega; memo por etiquetas y niveles. `recibidas-columns.tsx` pasa los niveles. `/monitoreo` sin cambio
  (sin niveles: las 3 de hoy).
- Tests: `tests/unit/descarga/equivalencia-descargas-cr.test.ts` (nuevo),
  `tests/unit/components/ordenes-columns-niveles.test.tsx` (nuevo); ampliados (nuevos en SLT-125)
  `geo-columnas-n-niveles.test.ts` y `cobertura-n-niveles.test.ts`. `referencia.json` y `entrada.ts` sin tocar:
  la ruta se arma en el test (`rutaDeLugar`; en cobertura, de los 3 nombres).

Notas:
- `rutaDeLaFila` usa `Array.isArray` y no `??`. Bajo la sonda de `columnas-sensibles.guardia` la ruta no
  es lista y la celda cae a los nombres de hoy; leer `dto.ruta[]` daría el origen `ruta[].nombre`, que su
  lista negra (`\bruta\b`, pensada para rutas de almacenamiento) marcaría como prohibido. La guardia no se tocó.
- El género del texto del motivo desde el nivel 4 es «retirado» (como cantón y distrito); el país no trae
  el género (pregunta abierta heredada de SL-20).

### R → test

| R | Test | Cifras |
|---|---|---|
| R1 | `geo-columnas-n-niveles.test.ts` › «R1–R3: descargas de órdenes, satélite y cobertura…» (2, 3, 4 y 10 niveles; celdas desde la ruta) | 27/27 en el archivo |
| R2 | ídem › «R2: un nivel «Zona» choca…; dos niveles iguales…» | dentro de 27/27 |
| R3 | ídem › «R3: las claves de hoy no cambian…»; `ambito-columnas.guardia` sin cambios | dentro de 27/27 |
| R4 | `equivalencia-descargas-cr.test.ts` (órdenes, satélite, cobertura: columnas, CSV byte a byte, XLSX celdas) | 11/11 |
| R5 | `ordenes-columns-niveles.test.tsx` (CR igual que hoy; 2, 4 y 10 niveles; choque; satélite) | 11/11 |
| R6 | `cobertura-n-niveles.test.ts` (parte de cliente: 2 y 4 niveles, motivo `nivel_4_retirado` por tipo, CR) + `equivalencia-descargas-cr` | 14/14; 11/11 |

### Salidas

```
pnpm run typecheck → exit 0
pnpm exec eslint <14 archivos tocados> → 0 problemas
vitest related --run <10 fuentes tocadas> --maxWorkers=1 → Test Files 64 passed (64) · Tests 818 passed (818)
  (incluye ordenes-columns, recibidas-columns, detalle-columnas, ordenes/satelite/cobertura-descarga-columnas,
   DescargarCoberturaButton, archivo-identico-470, columnas-sensibles, sin editar)
vitest run guard --maxWorkers=1 → Test Files 1 failed | 335 passed | 3 skipped (339) · Tests 4 failed | 4723 passed | 25 skipped
  los 4 rojos: dependencias-declaradas-presentes (baseline, heredado)
```

### Veredicto T3.1 y T3.3

Hechas: R1–R6 en verde, Costa Rica descarga y se ve igual que hoy (referencia sin regenerar), ninguna
aserción existente cambiada.
