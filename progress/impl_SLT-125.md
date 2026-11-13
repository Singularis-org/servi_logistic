# impl SLT-125 — «Geografía jerárquica: presentación, exportes, cierres y geocodificación»

Bitácora de implementación. Spec: `specs/SLT-125-geo-jerarquica-exportes/` (aprobado en `77f7369d`).

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
