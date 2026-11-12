# impl SLT-47 — geo-jerarquica-presentacion

Bitácora del implementer. Spec: `specs/SLT-47-geo-jerarquica-presentacion/`.

## T0 — Maqueta del filtro de N niveles (R33)

- **Aprobada por el humano el 2026-11-11** («aprobado»), comunicado por el leader.
- Lienzo: https://claude.ai/artifact/APLz2bhKafD2uGFDPPNtXa
- Versión estática de solo lectura (fuera del repo, en el scratchpad de la sesión del leader):
  `maqueta47/maqueta-SLT-47.html`, con las fuentes `project/Main.dc.html`, `Novedades.dc.html` y
  `Mensajero.dc.html`.
- Confirma P2 (mis-asignaciones: primera lista «Cantón (Provincia)», luego una lista por nivel) y P4
  (sin elección arriba, la lista ofrece todo su nivel con buscador; nada deshabilitado). R3 y R7 no
  cambian.

## Base de datos de esta feature

- Base local desechable **`logistic_slt47`** en el Postgres de `localhost`, creada el 2026-11-11 con
  un script de node (`pg`) contra la base `postgres`. URL: la de `.env` de la raíz cambiando solo el
  nombre de la base (`env47.sh` del scratchpad del leader, que aborta si no es localhost/logistic_slt47).
- `pnpm exec prisma migrate deploy` (hasta `20261110130100_slt89_historial_zona_nodo`) y
  `pnpm run db:seed`. Nunca la base compartida `logistic`, ni nada remoto.
- `node_modules`: el worktree no traía; se instaló con `pnpm install --frozen-lockfile` (sin tocar el
  lock), igual que los demás worktrees, que tienen el suyo propio (no enlazado).

## T1.1 — Inventario (2026-11-11, sobre `03f92d6a`)

### Lecturas que producen `MiAsignacionDTO` / `NovedadDTO` (design §3.4)

| Lectura | Proyección | Servicio que mapea |
|---|---|---|
| `GestionOrdenRepository.findMisAsignaciones` | `WITH_ASIGNACION` → `toMiAsignacionRow` | `MisAsignacionesService.toDTO`; también `RecoleccionTiendaService` (`toRecoleccionOrdenDTO`, otro DTO que el filtro no pinta) |
| `GestionOrdenRepository.findMisAsignacionesByIds` | la misma | `MisAsignacionesService` («Recolectadas hoy»), `RecoleccionTiendaService` |
| `OrdenRepository.findNovedadesByTienda` | `select` propio → `NovedadOrdenRow` | `NovedadesService` (única proyección de página y descarga) |

- No hay otra proyección de `NovedadDTO`: la ayuda y los rechazos SLA (`RechazoSlaTiendaRow`) son
  otras filas que no llegan al DTO.
- `app/(app)/novedades/_components/novedad-a-orden-card.ts` pasa `NovedadDTO → MiAsignacionDTO` con
  spread: `lugarRuta` viaja solo.

### Consumidores de `provincia_id` / `canton_id` / `distrito_id` como clave de transporte

Servidor (T2):
- `lib/types/orden.ts`: `ORDEN_FILTER_FIELDS` y `ordenFilterBase`.
- `lib/types/recepcion-satelite.ts`: `FILTROS_COMPARTIDOS` (`pick`).
- `lib/interfaces/services/IRecepcionSateliteService.ts:133–136`: input del listado satélite.
- `lib/services/OrdenService.ts`: `FILTER_TO_COLUMN` y `construirWhere`.
- `lib/services/RecepcionSateliteService.ts:134–136`: `filtroDeRepo`.
- `lib/interfaces/repositories/IOrdenRepository.ts`: `ListOrdenesWhere.provinciaId/cantonId/distritoId`
  y `RecepcionSateliteFiltro.provinciaIds/cantonIds/distritoIds`.
- `lib/repositories/OrdenRepository.ts`: `condicionesSatelite` (`:1691–1712`) y el `where` de `list`.
- `lib/analytics/entregas-conteo.ts`: `conteoEntregasFiltroSchema` (`:94–96`) y `claveConPrefijo`
  (`:481–483`).
- `lib/repositories/_shared/lugares-del-filtro.ts` (`FacetasGeograficas`), que usan los ocho
  repositorios de analítica (`CicloVida`, `CohorteCarga`, `ConteoCargadasPorDia`, `ConteoDevoluciones`,
  `ConteoHoyGestion`, `ConteoPorStatus`, `ConteoProductos`, `DineroProductos`).

Cliente (T4/T5, no en esta tanda):
- `app/(app)/ordenes/_components/ordenes-filtros-def.ts:357–387` y `seleccion-a-filter.ts`.
- `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts:189–191` (`FiltroBodegaSatelite`).
- `app/(app)/_components/entregas-filtros-def.ts` (`CLAVE_PROVINCIA/CANTON/DISTRITO`) y
  `entregas-filtro-analitica.ts` (`RawFiltroConteoEntregas`). Nadie más importa esas `CLAVE_*`.
- `app/(app)/novedades/_components/novedades-filtros.ts` (`provincia`/`canton` por nombre).
- `app/(app)/mis-asignaciones/_components/FiltroCantonDistrito.tsx`, `useFiltroCantonDistrito.ts`,
  `RepartoModule.tsx` y `lib/utils/filtro-canton-distrito.ts`.

Scripts:
- `scripts/geo-equivalencia-analitica.ts:124–126, 182, 190` y `scripts/geo-explain-analitica.ts:141`
  (lado «nuevo»: pasan a `lugar_id`).
- `scripts/geo-equivalencia/analitica-de-hoy.ts`: lee `filtro.provincia_id…` del tipo
  `FiltroConteoEntregas` (lado «hoy»: pasa a un tipo local congelado).
- `scripts/bench-busqueda-ordenes.ts` y `scripts/geo-backfill-nodo.ts`: solo columnas SQL. No cambian.
- `lib/repositories/InformeTransitoRepository.ts`: columnas SQL (SLT-71), fuera de alcance.

### Tests que fijan esas claves (design §12.1)

Cambian solo la clave de transporte o el SQL de la faceta, en esas líneas:
- Entrada del servidor: `tests/unit/types/orden-filter-144.test.ts`,
  `tests/unit/services/orden-service-filtros.test.ts`, `tests/unit/repositories/orden-repository-filtros.test.ts`,
  `tests/unit/repositories/orden-repository.listado-filtros-257.test.ts`,
  `tests/unit/repositories/satelite-paginado-where.test.ts`,
  `tests/unit/services/recepcion-satelite-{completo,paginado}.test.ts`,
  `tests/unit/actions/recepcion-satelite-action.test.ts`,
  `tests/integration/db/satelite-conjunto-sql-real.test.ts`.
- Analítica: `tests/unit/analytics/{ciclo-vida, cohorte-carga-action, cohorte-carga-sql,
  cohorte-consulta-unica, conteo-cargadas-action, conteo-cargadas-servicio, conteo-devoluciones,
  conteo-entregas-contrato, conteo-por-status-servicio, conteo-por-status-sql, conteo-productos-action,
  conteo-productos-sql, dinero-productos-sql, productos-consulta}.test.ts`, `_catalogo-facetas.ts`,
  `tests/unit/repositories/lugares-del-filtro.test.ts`,
  `tests/integration/db/{geo-analitica-lugar, geo-consultas-conteo, geo-equivalencia-geografia,
  geo-explain-analitica}.test.ts`.
- Cliente (T4/T5): `tests/unit/components/{ordenes-filtros-def, seleccion-a-filter,
  filtros-acotados-por-rol}.test.ts`, `ordenes-listado-filtros.test.tsx`,
  `ordenes-module-filter-key.test.tsx`, `tests/unit/analytics/entregas-filtro-analitica.test.ts`,
  `tests/components/{FiltrosEntregas, EntregasFiltroConectado}.test.tsx`,
  `tests/components/descarga/SateliteDescarga.test.tsx`,
  `tests/components/paginacion/SatelitePaginacion.test.tsx`, `tests/unit/components/novedades-filtros.test.ts`,
  `tests/unit/filtro-canton-distrito.test.ts`.
- El resto de `tests/` que nombra `provincia_id`… es de columnas SQL, zonas, tarifas o migraciones:
  no fija la clave de transporte y no se toca.

### Otras comprobaciones

- **`PaisRepository.deLaEmpresa` NO trae los tipos del país**: devuelve `PaisDTO` (`nivel1..3*`).
  `nivelesDeEmpresa` (T2.4) necesita una lectura nueva de `tipo_nivel_geografico` del país.
- **`FilterComponent` ya envuelve**: su barra es `flex flex-wrap items-end gap-3`
  (`components/shared/FilterComponent.tsx:772`). T3.2 lo prueba.

### Archivos que se suman a «Archivos esperados»

- `lib/interfaces/services/IRecepcionSateliteService.ts`.
- Los tests de §12.1 listados arriba que `tasks.md` no nombraba.

## Tanda 1 — servidor (implementer, 2026-11-11)

Sin subagentes (pedido del leader). Sin dependencias nuevas, sin migraciones (R31 no aplica: el
`EXPLAIN` no se midió aún, ver «Pendiente»).

### Commits

| Commit | Tarea |
|---|---|
| `03f92d6a` | T0: maqueta aprobada anotada (R33) |
| `abfb8ef7` | T1.1 inventario |
| `effe3718` | T1.2 fixture `geo-47` |
| `f74bf288` | T2.1 `resolverLugar`/`condicionesDeLugar`/`lugaresDelFiltro` de una faceta y `ruta-del-lugar.ts` |
| `78fb5bea` | T2.2 `lugar_id` en `ordenFilterBase`, satélite y analítica; clave de caché `l=` |
| `82a8e53b` | T2.3 (parte 1) `/ordenes` (`whereLugarEn` en `AND`) y satélite (`condicionesDeLugar`) |
| `c6ccb38d` | T2.5 (parte 1) scripts de SLT-71: lado «hoy» congelado, «nuevo» en `lugar_id`; `filtros-de-hoy.ts` |
| `bffbed41` | T2.3 (parte 2) `geo-filtros-lugar.test.ts` y guardia R15 ampliada |
| `94716117` | T2.4 `PaisService.nivelesDeEmpresa` |
| (este cierre) | T2.5 (parte 2) `geo-equivalencia-filtros.ts`, su test y `package.json`; dobles de `IPaisRepository`/`IPaisService` |

### Archivos

- Creados: `lib/repositories/_shared/ruta-del-lugar.ts`, `scripts/geo-equivalencia/filtros-de-hoy.ts`,
  `scripts/geo-equivalencia-filtros.ts`, `tests/integration/db/_fixtures/geo-47.ts`,
  `tests/integration/db/{geo-47-fixture, geo-filtros-lugar, geo-equivalencia-filtros}.test.ts`,
  `tests/unit/types/filtro-lugar-schemas.test.ts`, `tests/unit/services/ruta-del-lugar.test.ts`.
- Modificados (código): `lib/repositories/_shared/lugares-del-filtro.ts`, `lib/types/orden.ts`,
  `lib/types/recepcion-satelite.ts`, `lib/analytics/entregas-conteo.ts`,
  `lib/interfaces/repositories/IOrdenRepository.ts`, `lib/interfaces/services/IRecepcionSateliteService.ts`,
  `lib/services/OrdenService.ts`, `lib/services/RecepcionSateliteService.ts`,
  `lib/repositories/OrdenRepository.ts`, `lib/types/filtros-ordenes.ts` (`NivelDeFiltroDTO`),
  `lib/{interfaces/repositories/IPaisRepository, repositories/PaisRepository, interfaces/services/IPaisService, services/PaisService}.ts`,
  `scripts/geo-equivalencia-analitica.ts`, `scripts/geo-equivalencia/analitica-de-hoy.ts`,
  `scripts/geo-explain-analitica.ts`, `package.json`.
- Modificados (tests, solo entrada según §12.1): los de la sección T1.1 de servidor y analítica, más
  `tests/fixtures/satelite-bodega-almacen.ts`, `tests/integration/db/geografia-historico-intacto.test.ts`,
  `tests/unit/services/pais-service.test.ts`, `tests/unit/actions/geografia-plataforma-action.test.ts`
  (dobles con el método nuevo) y `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
  (bloque SLT-47 nuevo, R15).

### Mapa `R<n> → test` (lo cubierto en esta tanda)

| R | Test |
|---|---|
| R10 | `tests/unit/types/filtro-lugar-schemas.test.ts` |
| R11, R12 | `tests/unit/repositories/lugares-del-filtro.test.ts`; `tests/integration/db/geo-filtros-lugar.test.ts` |
| R13 | `geo-filtros-lugar.test.ts` (dos «San Rafael», dos «Central» y una provincia «Central», CR y XA) |
| R14 | `geo-filtros-lugar.test.ts` (lugar AND zona/tienda; satélite dentro de su zona) |
| R15 | `geo-filtros-lugar.test.ts` (`nodo_geografico_id` en NULL); guardias `geografia-lecturas-sin-nodo-fk` (bloque SLT-47) y `geografia-sin-cte-recursiva` |
| R16 | `tests/unit/services/ruta-del-lugar.test.ts` (solo la función; ver «Bloqueos») |
| R27 | `geo-filtros-lugar.test.ts` (cada lugar = su columna de hoy); `tests/integration/db/geo-equivalencia-filtros.test.ts`; `geo-analitica-lugar.test.ts` de SLT-71 |
| R28, R30 | `tests/integration/db/geo-equivalencia-filtros.test.ts` |
| R37 | `geo-filtros-lugar.test.ts` (id de XA en CR → 0; plataforma → `EmpresaNoResuelta`); `lugares-del-filtro.test.ts` |
| R1, R2 (servidor) | `tests/unit/services/pais-service.test.ts` (`nivelesDeEmpresa`, 2 y 4 niveles) |

### Decisiones de esta tanda

- `OrdenRepository.list`: el lugar va en `AND: [whereLugarEn(ids)]`, no como `OR` suelto, porque el
  `OR` del buscador (`criterioBusqueda`) ocupa la misma clave. Lista presente y vacía → `id IN ()`
  (falla cerrado, R35 de la 144).
- Equivalencia con enlaces viejos en scripts y tests de SLT-71: `filtros-de-hoy.ts > lugarDeFacetas`
  traduce las facetas como la barra (ids válidos de su nivel, podados por el de arriba). Un id de otro
  nivel, o una combinación incoherente, es `LUGAR_INEXISTENTE` (cero, como hoy). Así los tests de
  SLT-71 conservan sus aserciones.
- `geo-equivalencia-filtros.ts`: «hoy» del satélite = conjunto de la bodega sin lugar ∩ órdenes por
  columna (es el AND de hoy); analítica = total de `contarPorStatus`, y una diferencia solo se
  disculpa si es exactamente la de las incoherentes que entran por un solo lado.

### Salida de los tests (2026-11-11, base `logistic_slt47`, `--maxWorkers=1`)

- Unit: `lugares-del-filtro` + `ruta-del-lugar` 21/21; `filtro-lugar-schemas` 35/35;
  `orden-service-filtros` + `orden-filter-144` + `satelite-paginado-where` 69/69 y 44/44 con
  `orden-repository-filtros`; satélite (acción, paginado, completo, vigencia, salida a reparto) 77/77;
  `pais-service` 102/102; `tests/unit/analytics` 2301/2303 (los 2 rojos: abajo).
- Integración: `geo-47-fixture` 1/1; `geo-filtros-lugar` 7/7; `geo-equivalencia-filtros` 7/7;
  `geo-analitica-lugar` + `geografia-historico-intacto` 14/14; `satelite-conjunto-sql-real` 4/4;
  `geo-equivalencia-analitica`, `geo-explain-analitica`, `geo-consultas-conteo`,
  `geo-equivalencia-geografia`, `geo-transito-nombres` 40/40.
- Guardias de geografía: `geografia-lecturas-sin-nodo-fk` + `geografia-sin-cte-recursiva` 23/23.

### Rojos conocidos al cerrar la tanda

- `tests/unit/analytics/entregas-filtro-analitica.test.ts` («las siete facetas viajan con las claves
  del esquema, y pasan la validación»): es del CLIENTE (T4.2). El servidor ya rechaza `provincia_id`…
  y la barra todavía las manda. Se arregla en T4.2 cambiando solo la clave de transporte.
- Por la misma razón, mientras no lleguen T4 y T5 la app manda claves viejas: `/ordenes`, satélite y
  analítica responden `validation_error` si se filtra por lugar. Estado intermedio de la rama, no se
  despliega así.

### Pendiente de esta tanda

- **T2.3 (resto, bloqueado, ver abajo)**: `niveles`/`lugares` en `GeoRepository` y
  `FiltrosOrdenesService`; `lugarRuta` en `GestionOrdenRepository`, `findNovedadesByTienda` y los DTO;
  el tamaño del JSON del catálogo de CR.
- **T2.5 (resto)**: `scripts/geo-explain-filtros.ts` y `geo-explain-filtros.test.ts` (R29) no están
  hechos. El «antes» del listado y de la página satélite ya no existe en el código (se retiró el filtro
  por columna) y hay que congelar una copia de las dos consultas en `filtros-de-hoy.ts`; no me cupo con
  garantías en esta tanda.
- T3.1 no se empezó.

### Bloqueos (para el leader)

1. **`niveles` y `lugares` en el catálogo de filtros (R36, design §3.3) cambian aserciones exactas**
   que §12.1 no nombra: `tests/unit/services/filtros-ordenes-service.test.ts` compara el catálogo
   entero con `toEqual` y el orden de las lecturas en paralelo, y
   `tests/integration/db/geo-lecturas-catalogo.test.ts` compara `listGeografiaLitePorZona` con
   `toEqual(vacio)` de tres listas. Añadir dos campos rompe esas aserciones. Hace falta decidir si
   entran en §12.1.
2. **`lugarRuta` en novedades (R16) cambia una aserción exacta**: `tests/unit/repositories/orden-repository.novedades.test.ts`
   fija con `toEqual` el `select` de `findNovedadesByTienda` («Este `toEqual` ES el contrato del
   select»). Para calcular la ruta hacen falta `cantonId` y `distritoId` en ese `select`. En
   `GestionOrdenRepository` el `select` no se fija entero, pero los dobles de
   `gestion-orden-repository.test.ts` no traen el catálogo (cambio de entrada, sí permitido).
3. **Semántica que cambia por diseño** (aviso, no bloqueo): con `lugar_id` sin nivel, un id de cantón
   pedido «como distrito» ya no da cero (design §3.1, `resolverLugar` acepta cualquier profundidad).
   En `lugares-del-filtro.test.ts` (que `tasks.md` marca como «ajustado») los casos de SLT-71 R3 «id
   de otro nivel no aporta» se sustituyeron por los de R11/R12. En los tests de integración y scripts
   de SLT-71 se conservó la aserción traduciendo la entrada como la barra (`LUGAR_INEXISTENTE`).

### Cierre de la tanda 1 (verificación)

- `pnpm run typecheck`: verde (0 errores).
- `eslint` sobre los archivos tocados: 0 errores (18 avisos `no-unused-vars` de variables con `_`,
  la mayoría ya existentes en los tests de analítica).
- Contrato v1 en modo comparar (`contrato-v1.route.test.ts` sin `CONTRATO_V1_GRABAR`) y
  `openapi-v1-congelado`: 26 verdes, 1 saltado (el de grabar).
- Guardias de geografía, SQL y catálogo (`geografia-*`, `nodo-geografico-escritor-unico`,
  `catalogo-geografico-sin-instancia-de-modulo`, `catalogo-postgres-acota-esquema`,
  `sql-a-mano-por-empresa`, `etiquetas-geograficas-sin-literal`, `vista-filtro-formato-propio`,
  `criterio-unico`, `alcance-obligatorio`) más `geografia-plataforma-action`: 17 archivos, 356 verdes.
- No se corrió `./init.sh` completo ni la suite completa (pedido del leader).

## Tanda 1, cierre tras la autorización de R36 y R16 (2026-11-11)

El humano autorizó los dos bloqueos (`requirements.md` > «Decisiones cerradas», `ddd7acad`, `bc0f2e94`).

### Commits

| Commit | Tarea |
|---|---|
| `373446c5` | T2.3 R36: `GeoRepository.listLugaresDeFiltro` (niveles + lugares a cualquier profundidad; en zona, el conjunto de la zona sin cortar en 3) y `FiltrosOrdenesService` |
| `e399f36f` | T2.3 R16: `lugarRuta` en `findMisAsignaciones(ByIds)` y `findNovedadesByTienda`, y en los DTO; cierra T2.3 |
| `1c9c971e` | T2.5 R29: `geo:explain-filtros` con el «antes» congelado en `filtros-de-hoy.ts`; cierra T2.5 |
| (siguiente) | T3.1, parte: `lib/utils/filtro-ubicacion.ts` y sus dos tests |

### Cambios de aserciones (solo los autorizados)

- `filtros-ordenes-service.test.ts`: se suman `niveles` y `lugares` a los tres catálogos esperados. El
  doble nuevo (`listLugaresDeFiltro`) no se apunta en `orden`, así que la lista de lecturas en paralelo
  de R47 no cambia.
- `geo-lecturas-catalogo.test.ts`: no hizo falta tocarlo. `listGeografiaLitePorZona` no cambia; los
  lugares de N niveles salen de un método nuevo (así tampoco cambia `catalogo-filtros-ordenes.test.ts`,
  que fija `listGeografiaLitePorZona` con `toEqual` de tres listas y no estaba autorizado).
- `orden-repository.novedades.test.ts`: el `select` esperado suma solo `cantonId` y `distritoId`.
- Entrada (sin tocar aserciones): dobles del catálogo en `gestion-orden-repository.test.ts` y
  `orden-repository.novedades.test.ts`.

### Decisiones

- `niveles`/`lugares` en `CatalogoFiltrosOrdenesDTO` y `lugarRuta` en `MiAsignacionRow`/`MiAsignacionDTO`/
  `NovedadOrdenRow` son opcionales (`?`), con el patrón aditivo del repo: las pantallas y sus fixtures
  arman catálogos vacíos y filas sin esos campos (los adapta T4/T5). El servicio y los repositorios los
  emiten siempre. `toDTO` y `NovedadesService` copian `lugarRuta` solo si la fila la trae: con
  `?? []` cambiaba el `toEqual` de `recoleccion-tienda-service.test.ts` (no autorizado).
- `whereDeLugares` se mueve a `lugares-del-filtro.ts`: lo usan `OrdenRepository.list` y el «después»
  del script de explain, así miden el mismo `where`.
- `geo-explain-filtros` mide solo la parte que depende del filtro (página de ids + total del listado; la
  consulta de ids de la página satélite). La carga del catálogo queda fuera de la medición (una por
  instancia; la mide `geo:explain-analitica`). El test comprueba que el «después» congelado es el SQL
  que emite `lib/`, texto y parámetros.

### Medidas

- **Catálogo de filtros de Costa Rica** (base `logistic_slt47`, empresa nueva de CR, 585 nodos):
  **antes 78.109 bytes** (`provincias` + `cantones` + `distritos`), **después 165.846 bytes** (más
  `niveles` y `lugares`). `lugares` repite los nodos de 1 a 3 hasta SLT-48 (design §11).
- **R32** (catálogo sintético de 10 niveles y 20.017 nodos, mediana de 5): `resolverLugar(raíz)`
  65,8 ms, `declararNiveles` 114,4 ms, `traducir(lugar_id de nivel 10)` 86,9 ms. Umbral: 200 ms.
- `EXPLAIN` sobre la copia de producción: pendiente de una persona (T7.1).

### Mapa `R<n> → test` (añadido)

| R | Test |
|---|---|
| R16 | `tests/unit/services/ruta-del-lugar.test.ts`; `tests/integration/db/geo-filtros-lugar.test.ts` (asignaciones y novedades, dos «San Rafael») |
| R29 | `tests/integration/db/geo-explain-filtros.test.ts` (+19 %, +21 %, Seq Scan nuevo; «después» = SQL de `lib/`; 6 medidas con 5 corridas) |
| R36 | `geo-filtros-lugar.test.ts` (zona de 4 niveles: el sector de otra zona no entra; el propio entra con sus ancestros); `filtros-ordenes-service.test.ts` |
| R1, R2, R4, R6, R9, R17, R18 (traducción), R19, R20 (claves), R21 | `tests/unit/utils/filtro-ubicacion.test.ts` |
| R32 | `tests/unit/utils/filtro-ubicacion-rendimiento.test.ts` |

### T3.1: lo que queda parado

- **Vistas v2 (R22–R24) no se hicieron.** Pasar `VISTA_FILTRO_VERSION` a 2 cambia una aserción no
  autorizada: `tests/unit/components/ordenes-listado-vistas.test.tsx:341` espera que se guarde
  `{ v: 1, ... }`. Además, `leerPayloadGuardado` devolvería `v: 2` al leer una v1: las suites con
  fixtures `v: 1` (`vistas-filtro-aviso-incompleta`, `buscador-filtros-vistas`, `vista-filtro.test`
  de integración) pueden cambiar de salida; no lo verifiqué uno por uno. Necesita la misma autorización que R36/R16 antes de tocarlo. `deV1` y
  `vista-filtro-v2.test.ts` quedan pendientes con eso.

### Guardias al cierre

- `tests/unit/guards` entero más `criterio-unico` y `alcance-obligatorio`: 244 archivos. Un rojo propio,
  ya arreglado: `pagos-captura.guardia` (R19 de su ficha) veía `@prisma/client` en el árbol del panel
  del mensajero porque `PasoDeRuta` se importaba desde `ruta-del-lugar.ts`. El tipo pasa a
  `lib/types/geografia-nodo.ts` y la guardia vuelve a verde.
- El otro rojo, `dependencias-declaradas-presentes.guardia`, está en `tests/baseline-rojos.json`
  (heredado, marcador de `init.sh`).

## T3.1 — Vistas v2: tests cuyas aserciones o fixtures cambian (inventario previo, 2026-11-11)

Autorización: `af8ede2a` (solo `v: 1` → `v: 2` y claves de lugar viejas → `lugar_id`). Ningún test de
vistas usa `provincia_id`/`canton_id`/`distrito_id`. Inventario hecho ANTES de editar:

Dentro del alcance (`v: 1` → `v: 2`):
| Archivo:línea | Antes | Después | Tipo |
|---|---|---|---|
| `tests/unit/components/ordenes-listado-vistas.test.tsx:74` | `v: 1,` (fixture `GUARDADO`) | `v: 2,` | entrada |
| `tests/unit/components/ordenes-listado-vistas.test.tsx:341` | `filtro: { v: 1, termino: "guia999", … }` | `filtro: { v: 2, … }` | aserción |
| `tests/unit/components/buscador-filtros-vistas.test.tsx:63` | `return { v: 1, … }` | `return { v: 2, … }` | entrada |
| `tests/unit/components/vistas-filtro-aviso-incompleta.test.tsx:58, 66, 99` | `v: 1` | `v: 2` | entrada |

Sin cambio (usan `VISTA_FILTRO_VERSION`, o insertan JSON v1 por SQL sin leerlo de vuelta):
`vista-filtro.test.ts`, `vistas-filtro-action.test.ts`, `vista-filtro-aplicabilidad.test.ts`,
`455/caracterizacion/filtro-ordenes-por-estado.test.ts`, `vista-filtro-migration.test.ts:328, 588`,
`vista-filtro-payload.test.ts:136, 159` (`{ v: 1 }` roto sigue siendo `null`),
`vista-filtro-service.test.ts:253` (`{ v: 1, termino: 5 }` sigue siendo `null`).

**FUERA del alcance (bloquean; no se editó nada):** los casos de «versión del futuro» usan hoy
`v: 2` como versión desconocida. Con v2 vigente, `v: 2` pasa a ser legible y estas aserciones
fallan; habría que cambiar `2` → `3`, que no es `v: 1` → `v: 2`:
| Archivo:línea | Hoy | Haría falta |
|---|---|---|
| `tests/unit/utils/vista-filtro-payload.test.ts:124` | `safeParse({ ...PAYLOAD, v: 2 })` → `false` | `v: 3` |
| `tests/unit/utils/vista-filtro-payload.test.ts:148` | `delFuturo = { v: 2, … }` → `null` | `v: 3` |
| `tests/unit/services/vista-filtro-service.test.ts:235` | fila «futura» `{ ...PAYLOAD, v: 2 }, version: 2` → `filtro: null` | `v: 3`, `version: 3` |

Estado: T3.1 (vistas) parada a la espera de esa autorización. No se tocó código ni tests de vistas.

## T3.1 — Vistas v2 hechas (2026-11-11, autorizaciones `af8ede2a` y `c9079068`)

- `lib/types/vista-filtro.ts`: `VISTA_FILTRO_VERSION = 2`, `VERSIONES_LEGIBLES = [1, 2]`,
  `vistaFiltroPayloadV1Schema` (solo lectura) y `deV1` (renombra `provincia_id`/`canton_id`/`distrito_id`
  a `nivel_1..3` en `seleccion` y `activos`; el resto igual). `leerPayloadGuardado` valida la v1 con su
  esquema y la traduce; nada se escribe.
- Tests cambiados, exactamente los del inventario: los seis `v: 1 → v: 2` de los tests de componentes
  y los tres `v: 2 → v: 3` de «versión desconocida» (`vista-filtro-payload.test.ts:124, 148`,
  `vista-filtro-service.test.ts:235`). Nada más.
- Nuevo: `tests/unit/types/vista-filtro-v2.test.ts` (R22, R23, R24).
- Suites de vistas: unitarias y de componentes verdes, `vista-filtro-formato-propio` (R25) verde.
  `vista-filtro.test.ts`, `vista-filtro-migration.test.ts` y `455/.../filtro-ordenes-por-estado.test.ts`
  dan rojo por la base local vacía (`usuario`/`orden` vacías) y deriva de `down.sql`; los tres están en
  `tests/baseline-rojos.json`.

| R | Test |
|---|---|
| R22, R23, R24 | `tests/unit/types/vista-filtro-v2.test.ts`; `vista-filtro-service.test.ts` |
| R25 | `tests/unit/guards/vista-filtro-formato-propio.guardia.test.ts` sin cambios |

## T3.2 — Barra con traductor, niveles en el layout (frontend_dev, 2026-11-11)

### Archivos
- Modificados: `components/shared/FilterComponent.tsx` (prop `traductorUrl?`: la foto de entrada se
  traduce contra los montados en sus cuatro lecturas, re-siembra tardía incluida),
  `components/shared/BuscadorFiltros.tsx` (prop `traductorUrl?`; `FiltroDisponible.options?` para que el
  traductor sepa de qué nivel es un `lugar_id`; `activosDesdeUrl` sobre la vista traducida; activación
  tardía por firma del catálogo ofrecido, cerrada por el primer gesto, una vista, una siembra o «Limpiar
  todo»; `traductor.claves` en `paramsPropios`, que usan «Limpiar todo» y aplicar una vista),
  `providers/EtiquetasGeograficasProvider.tsx` (prop `niveles?` en un contexto aparte,
  `NivelesGeograficosContexto`, para no cambiar el de etiquetas), `app/(app)/layout.tsx` (quinta lectura
  `nivelesDelActor` en la misma `Promise.all`; sin empresa o si falla, `[]` y `console.error`).
- Creados: `hooks/use-niveles-geograficos.ts`, `tests/components/FiltroUbicacionBarra.test.tsx`.
- Ninguna aserción de tests existentes cambiada. Sin dependencias nuevas.

### Mapa `R<n> → test`
| R | Test (`tests/components/FiltroUbicacionBarra.test.tsx`) |
|---|---|
| R3 | `R3 — listas encadenadas por nivel` (3 casos: todo el nivel sin elección; hijos de lo elegido; poda al cambiar k) |
| R5 | `R5 — las listas pasan a la línea siguiente` (10 niveles en un contenedor `flex-wrap`) |
| R17 | `R17 — ?lugar_id= rearma…` (cadena completa; id no ofrecido descartado) |
| R18, R21 | `R18 — los enlaces viejos…` (comas = repetido; incoherente/no ofrecido podado; `nivel_1` en la URL ignorado) |
| R20 | `R20 — «Limpiar todo»…` (`replace("/ordenes?cierre=abc")`) |
| §4.2 tardía | `Activación tardía` (barra completa; cerrada por gesto; `FilterComponent` solo) |

### Salida (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run <archivos> --maxWorkers=1`)
- `FiltroUbicacionBarra.test.tsx`: 13 passed.
- Sin la prop, sin cambios: `filter-component.test.tsx` 47, `filter-component-siembra` 9,
  `filter-component-texto` 26, `filter-component-url` 19, `buscador-filtros-siembra` 11,
  `buscador-filtros-url` 22, `buscador-filtros-url-sin-router` 1, `buscador-filtros-vistas` 17,
  `AppLayout.test.tsx` 23, `etiquetas-geograficas.test.tsx` 4, `TarifasGrupos.test.tsx` 32,
  `filtros-url-r25` 3, `filtros-url-r25-propiedad` 1. Todos passed (13 archivos, 215 tests).
- `pnpm run typecheck`: exit 0. `pnpm exec eslint <6 archivos tocados>`: «No issues found».

### Notas
- `AppLayout.test.tsx` dobla `construirPaisService` solo con `etiquetasDeEmpresa`: la quinta lectura cae
  en su `catch` y deja un `console.error` en esa suite; ninguna aserción lo mira. Si se quiere silencio,
  añadir `nivelesDeEmpresa` al doble es un cambio de fixture (no de aserción).
- `FilterComponent` toma su foto de la URL al montarse; en `/ordenes` se monta cuando la barra activa
  claves, igual que hoy. No cambia con esta tarea.
- La maqueta muestra homónimos con sus ancestros en la lista sin elección arriba («San Rafael · Escazú,
  San José»); `declararNiveles` (T3.1) rotula solo con el nombre. Queda para T4 o para quien decida R6.

Veredicto: T3.2 hecha; R3, R5, R17, R18, R20 en verde y las suites sin la prop sin cambios.

## T4.1 y T4.2 — `/ordenes`, satélite y analítica con `lugar_id` (frontend_dev, 2026-11-11)

### Archivos T4.1 (`/ordenes` y satélite)
- `app/(app)/ordenes/_components/ordenes-filtros-def.ts`: las tres `FilterDef` de lugar pasan a
  `...declararNiveles(opcionesDeLugarDelCatalogo(cat, …))` en el mismo sitio. Nueva
  `opcionesDeLugarDelCatalogo` (exportada; la usa también T4.2) y opción `niveles?`.
- `app/(app)/ordenes/_components/seleccion-a-filter.ts`: `nivel_<k>` → `lugar_id` (`seleccionALugar`).
- `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts`: `FiltroBodegaSatelite.lugar_id`
  (fuera `provincia_id/canton_id/distrito_id`); `construirFiltrosSatelite` acepta `niveles?`.
- `OrdenesListado.tsx`, `SateliteOrdenesListado.tsx`: `traductorUrl={TRADUCTOR_LUGAR}` (constante de
  módulo `traductorPorId()`) en `BuscadorFiltros` y `FilterComponent`; las listas de nivel pasan sus
  `options` en los filtros ofrecidos; `useNivelesGeograficos()` como fuente de niveles de reserva.
- Nuevo: `tests/unit/ordenes/seleccion-a-filter-lugar.test.ts`.

### Archivos T4.2 (analítica)
- `app/(app)/_components/entregas-filtros-def.ts`: `declararNiveles`; `CLAVE_PROVINCIA/CANTON/DISTRITO`
  retiradas (grep en todo el repo: solo las usaban `entregas-filtro-analitica.ts` y dos tests; las
  `CLAVE_PROVINCIA/CANTON` de novedades son otras constantes, de T5). Opción `niveles?`.
- `app/(app)/_components/entregas-filtro-analitica.ts`: emite `lugar_id` (vacíos fuera antes de elegir).
- `app/(app)/_components/FiltrosEntregas.tsx`: traductor, opciones de nivel en `ofrecidos`, niveles del layout.

### Decisión: de dónde salen los niveles (para no cambiar aserciones)
`opcionesDeLugarDelCatalogo`: niveles = `cat.niveles` si no vacío → si no, los del layout
(`useNivelesGeograficos`) → si no, las etiquetas de 3 niveles (lo que se rotulaba hasta hoy). Lugares =
`cat.lugares` o, si no llegan, las tres listas planas como niveles 1–3. Cubre catálogo caído/en vuelo
(R64: mismas listas deshabilitadas), el rol de zona sin zona (`niveles: []`) y los fixtures sin
`niveles`. El tercer escalón usa `pais.nivel_N_*` (vía etiquetas): solo se alcanza sin catálogo NI
proveedor (tests, sesión sin empresa). Si el leader lo considera contrario a R1, se quita y hay que
añadir `niveles`/`lugares` a los fixtures (cambio de entrada).

### Líneas de test tocadas (R38: solo clave de transporte / clave de la lista)
T4.1:
- `tests/unit/components/ordenes-filtros-def.test.ts:70-72, 83-85, 105-107, 116-118, 133-134, 153, 157, 165, 285-287, 312-314, 330`: `"provincia_id"/"canton_id"/"distrito_id"` → `"nivel_1"/"nivel_2"/"nivel_3"`; nada más en esas líneas.
- `tests/unit/components/seleccion-a-filter.test.ts:27-29`: entrada `provincia_id/canton_id/distrito_id:` → `nivel_1/2/3:`; `:35-37` salida `provincia_id: ["p1"], canton_id: ["c1"], distrito_id: ["d1"]` → `lugar_id: ["d1"]` (35 y 36 borradas).
- `tests/unit/components/ordenes-listado-filtros.test.tsx:579-580`: `{ provincia_id: ["p1"], canton_id: ["c1"] }` → `{ lugar_id: ["c1"] }` (579 borrada); `:587`: `{ provincia_id: ["p2"] }` → `{ lugar_id: ["p2"] }`.
- `tests/components/descarga/SateliteDescarga.test.tsx:412`: `canton_id: ["Pococí"]` → `lugar_id: ["Pococí"]`. Doble del servidor (`filtrarComoElServidor`, :171 y :177-181): tipo `lugar_id?`; la orden entra si su provincia/cantón/distrito está en `lugar_id`.
- `tests/components/paginacion/SatelitePaginacion.test.tsx:248-249` (tipo del doble) → `lugar_id?`; `:260-264` doble como el anterior. Ninguna aserción tocada.
- `tests/unit/utils/filtro-ubicacion.test.ts:96`: `["provincia_id", "canton_id", "distrito_id"]` → `["nivel_1", "nivel_2", "nivel_3"]`; `:117`: el mapa `{ provincia_id: "nivel_1", canton_id: "nivel_2", distrito_id: "nivel_3" }` → `{ nivel_1: "nivel_1", nivel_2: "nivel_2", nivel_3: "nivel_3" }`. **Para el leader:** el caso R6 de T3.1 tomaba la declaración de hoy por su clave; con la barra ya en `nivel_<k>`, compara `construirFiltrosOrdenes` (catálogo CR sin `niveles`) con `declararNiveles` directo. La prueba «igual que hoy» campo a campo la sigue dando `ordenes-filtros-def.test.ts` (rótulos, búsqueda XA, opciones, `dependsOn`, orden), sin más cambio que la clave.
- `ordenes-module-filter-key.test.tsx`: sin cambios (compila y pasa; ahí `provincia_id` es solo una clave de objeto para `serializarFiltro`).

T4.2:
- `tests/unit/components/filtros-acotados-por-rol.test.ts:50-52, 66-68, 79, 116-118, 147-149`: claves → `nivel_1..3`.
- `tests/components/FiltrosEntregas.test.tsx:89-91, 116-118, 126-127, 129-130`: claves → `nivel_1..3`; `:401` `provincia_id: ["p1"]` → `lugar_id: ["p1"]`; `:410` igual.
- `tests/unit/analytics/entregas-filtro-analitica.test.ts:8, 10, 12`: imports de `CLAVE_*` borrados; `:50-52` `[CLAVE_PROVINCIA]/[CLAVE_CANTON]/[CLAVE_DISTRITO]:` → `nivel_1/2/3:`; `:62-64` → `lugar_id: ["d1"]` (62-63 borradas); `:89` `[CLAVE_DISTRITO]` → `nivel_3`; `:94` `"distrito_id"` → `"lugar_id"`.
- `tests/components/EntregasFiltroConectado.test.tsx:12, 13, 15`: imports borrados; `:31-33` → `nivel_1/2/3:`; `:93-95` → `lugar_id: ["d1"]` (93-94 borradas).

### Mapa `R<n> → test`
| R | Test |
|---|---|
| R9 | `tests/unit/ordenes/seleccion-a-filter-lugar.test.ts` (8 casos: solo `lugar_id`, nunca claves viejas ni `nivel_<k>`; satélite incluido); `entregas-filtro-analitica.test.ts`; `EntregasFiltroConectado.test.tsx` |
| R6 | `ordenes-filtros-def.test.ts`, `filtros-acotados-por-rol.test.ts`, `FiltrosEntregas.test.tsx` (rótulos, orden, búsqueda, opciones y encadenado de CR iguales); `filtro-ubicacion.test.ts` (R6) |
| R18 | `FiltroUbicacionBarra.test.tsx` (T3.2), con el traductor ya cableado en las tres pantallas |

### Homónimos (nota abierta de la maqueta)
Hoy, en CR, la lista de distrito sin cantón elegido muestra cada «San Rafael» solo con su nombre, sin
ancestros (`label: d.nombre`; lo fijan `ordenes-filtros-def.test.ts:165` y el R6 de
`filtro-ubicacion.test.ts`). Añadir «· Escazú, San José» cambia esas aserciones y R6: **no se hizo;
decisión pendiente del humano.**

### Salida (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run <archivos> --maxWorkers=1`)
- `seleccion-a-filter-lugar`, `seleccion-a-filter`, `ordenes-filtros-def`, `filtros-acotados-por-rol`,
  `ordenes-module-filter-key`, `entregas-filtro-analitica`, `filtro-ubicacion`: 1 failed | 6 passed;
  2 rojos en el R6 de `filtro-ubicacion.test.ts` (antes de tocar :96 y :117), 92 passed.
- `filtro-ubicacion`, `ordenes-listado-filtros`, `FiltrosEntregas`, `EntregasFiltroConectado`: 4 passed, 63 tests.
- `SateliteDescarga`, `SatelitePaginacion`: antes de ajustar el doble, 4 rojos; después 2 passed, 19 tests.
- Relacionados, sin cambios: `ordenes-buscador-declaracion`, `salida-a-reparto-filtro`,
  `satelite-filtro-estado`, `analitica-barra-sticky`, `historico-filtros-def`, `historial-acciones-filtros-def`,
  `historico-seleccion-a-filtro`, `ordenes-listado-vistas`, `ordenes-listado-buscador`, `ordenes-listado`,
  guardias `analitica-barra-filtros-sin-solape`, `vistas-superficies-declaradas`, `superficie-de-uso`,
  `FiltroUbicacionBarra`, `SateliteFiltroEstadoAlcance`, `RecepcionSateliteModule`, `AnaliticaPage`:
  17 passed (271 tests, 17 skipped). `OrdenesPage`, `OrdenesPagination`, `OrdenesDescarga`,
  `OrdenesDescargaColumnas`, `paginacion-transversal`, `SateliteSeleccionOtrasPaginas`,
  `ControlDescargaTransversal`, `OrdenesExcludePorRol`, `SateliteOrdenesListado.gestion-pendiente`,
  `RecepcionSateliteIncidente`, `ordenes-listado-orden`, `HomePageMaestro`: 12 passed (146 tests).
- `pnpm run typecheck`: con el código de T4.1/T4.2 y los tests de ordenes/analítica ya ajustados, los
  únicos errores eran de T5 (`mis-asignaciones/FiltroCantonDistrito.tsx`, `useFiltroCantonDistrito.ts`,
  `tests/unit/filtro-canton-distrito.test.ts`: módulo renombrado por el otro frontend_dev). La última
  corrida (tras ajustar los dobles de satélite y `filtro-ubicacion.test.ts`) murió por memoria (exit 134,
  V8 OOM) con el otro agente en paralelo; no se reintentó.
- `pnpm exec eslint <19 archivos tocados>`: 0 errores; 2 warnings previos en
  `filtro-ubicacion.test.ts:107` (`_k`, `_d`; línea de T3.1 no tocada).

Veredicto: T4.1 y T4.2 hechas; R6 y R9 en verde y CR igual que hoy. Pendientes: homónimos, y el visto
bueno al caso R6 (`filtro-ubicacion.test.ts:96, 117`) y al escalón de etiquetas.

## T5.1 y T5.2 — mis-asignaciones y novedades por id (frontend_dev, 2026-11-11)

Siguen la maqueta aprobada (`Mensajero.dc.html`, `Novedades.dc.html`). Sin dependencias nuevas, sin
backend. Grafo no usado (Grep/Read).

### Archivos — T5.1 (mis-asignaciones)
- Renombrado (`git mv`): `lib/utils/filtro-canton-distrito.ts` → `lib/utils/filtro-ubicacion-asignaciones.ts`,
  reescrito: `lugaresDeLasOrdenes`, `listasDeLugar` (sobre `declararNiveles` con `desde: 2` y
  `etiquetaConPadre`), `opcionesOfrecidas`, `filtrarAsignaciones` por id sobre `lugarRuta`.
- Creados: `app/(app)/mis-asignaciones/_components/FiltroUbicacion.tsx`, `useFiltroUbicacion.ts`,
  `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx`.
- Borrados (deshechos del índice con `git rm`): `FiltroCantonDistrito.tsx`, `useFiltroCantonDistrito.ts`,
  `tests/unit/filtro-canton-distrito.test.ts`.
- **Ojo al commitear:** el índice es compartido y el commit de T4.1 (`97cdb8a4`) ya se llevó el renombre
  (sin contenido: 0 líneas) y el borrado de `tests/unit/filtro-canton-distrito.test.ts`. Le falta a T5.1
  el contenido nuevo de `filtro-ubicacion-asignaciones.ts` (sin preparar) y los dos borrados de
  componentes (ya preparados).
- Modificados: `RepartoModule.tsx` (usa el hook y el componente nuevos), `lib/types/orden.ts` (solo un
  comentario que citaba el archivo borrado), `docs/ayuda/mensajero/reparto.md` (la fuente renombrada),
  `tests/components/RepartoModule.test.tsx` (fixture, abajo), `tests/fabricas/etiquetas-geograficas.tsx`
  (+ `NIVELES_CR`, `NIVELES_XA`; compartido con T5.2).

### Archivos — T5.2 (novedades)
- Modificados: `app/(app)/novedades/_components/novedades-filtros.ts` (`provincia`/`canton` fuera de
  `ClaveFiltroNovedad`; listas `nivel_<k>` con `declararNiveles` sobre la `lugarRuta` del conjunto;
  predicado por id de la lista más honda; `construirFiltrosNovedades(grupo, conjunto, niveles)`;
  `ROTULOS_FILTRO_NOVEDADES` en lugar de `etiquetasFiltroNovedades(etiquetas)`; `TRADUCTOR_URL_NOVEDADES`),
  `NovedadesFiltrosBarra.tsx` (pasa el traductor a `BuscadorFiltros` y a `FilterComponent`),
  `useNovedadesFiltro.ts` (`useNivelesGeograficos`; `ofrecidos` con sus `options`),
  `tests/unit/components/novedades-filtros.test.ts` (abajo), `tests/components/NovedadesBuscador.test.tsx`
  (solo un `vi.mock`, abajo).
- Creados: `tests/unit/novedades/novedades-filtros-lugar.test.ts`,
  `tests/components/NovedadesFiltroLugarUrl.test.tsx`.

### Decisiones y desvíos (para el reviewer)
- **Novedades: `TRADUCTOR_URL_NOVEDADES` envuelve a `traductorPorNombre()`.** El conjunto se pide perezoso
  al montar un control; al entrar por `?provincia=`/`?canton=`/`?lugar_id=` las listas no tienen opciones,
  `traductorPorNombre` no activa nada y el conjunto no se pedía nunca (el enlace dejaba de acotar). El
  envoltorio, solo mientras ninguna lista de lugar tiene opciones, activa las listas que la URL pide con
  los valores tal cual; `FilterComponent` los descarta, deja la clave pendiente y la re-siembra con
  opciones aplica la traducción buena. Lo prueba `NovedadesFiltroLugarUrl.test.tsx`. Sin tocar
  `FilterComponent` ni `BuscadorFiltros`.
- **Mis-asignaciones conserva el deshabilitado de hoy:** una lista sin elección en la de arriba va
  deshabilitada (el distrito sin cantón), porque R7 pide CR igual que hoy y `RepartoModule.test.tsx`
  («117/R3») lo afirma. Es distinto de P4 (que es de la barra).
- **«Todos los …» / «Todas las …»:** el tipo de nivel no trae género; se toma del plural (termina en «as»
  → femenino). Un plural femenino sin esa terminación («Regiones») sale «Todos los regiones». Abierto.
- Teléfono primero: cada select ocupa la fila en un teléfono (`w-full`), en línea desde `sm` (`sm:min-w-52`,
  la de hoy), como la maqueta.

### Líneas de test tocadas (R38) — ninguna expectativa cambiada
- `tests/unit/components/novedades-filtros.test.ts` (HEAD → ahora):
  - `:4` `CLAVE_CANTON,` y `:7` `CLAVE_PROVINCIA,` → fuera del import; `:21` import de `ETIQUETAS_CR` →
    `:19-24` import de `claveDeNivel` y `NIVELES_CR` + `const CLAVE_PROVINCIA = claveDeNivel(1)` y
    `const CLAVE_CANTON = claveDeNivel(2)` (la clave geográfica).
  - `:55` `const novedad = (over) => ({ ...base, ...over })` → `:58-69` `conRuta(...)`: el fixture suma la
    `lugarRuta` armada con los nombres (provincia y cantón con su nombre como id; distrito con su cantón
    delante). Es entrada, no salida.
  - `:236, :259, :265, :272, :277, :285, :290, :300, :311, :348` → `:250, :273, :279, :286, :291, :299,
    :304, :314, :325, :362`: el tercer argumento `ETIQUETAS_CR` → `NIVELES_CR` (la firma pasa de etiquetas a
    niveles). Los `expect` siguen con los mismos valores esperados.
- `tests/components/RepartoModule.test.tsx`: `+:38-43` `vi.mock` de `use-niveles-geograficos` con
  `NIVELES_CR`; `:173` `return {` → `:179` `const base: MiAsignacionDTO = {`; `+:204-215` devuelve `base` con
  su `lugarRuta` armada con los nombres (ids por camino). Ninguna aserción tocada; 108 passed.
- `tests/components/NovedadesBuscador.test.tsx`: `+:26-30` `vi.mock` de `use-niveles-geograficos` con
  `NIVELES_CR`. **ROJO NO RESUELTO (para y se reporta):** `:360-366` (HEAD `:355-361`) espera
  `["Mensajero","Zona","Provincia","Cantón","Causa de devolución"]`; con R8 en CR sale además `"Distrito"`
  tras `"Cantón"`. Cambio necesario: insertar `"Distrito",` entre `:364` y `:365`. No se cambió.
- `tests/unit/filtro-canton-distrito.test.ts`: borrado; sus casos, en `FiltroUbicacion.test.tsx`:

| Caso viejo (`filtro-canton-distrito.test.ts`) | Caso nuevo (`mis-asignaciones/FiltroUbicacion.test.tsx`) | Misma expectativa |
|---|---|---|
| R2: una opción por cantón único, «Cantón (Provincia)», ordenadas | «una opción por lugar, deduplicada y ordenada por su rótulo» | «Alajuela (Alajuela)», «Escazú (San José)» (valor: id) |
| R2: dedup insensible a mayúsculas/acentos/espacios | «el mismo lugar es una sola opción aunque el nombre de la orden venga escrito distinto» | una opción «Pérez Zeledón (San José)» |
| R2: cantones HOMÓNIMOS son DOS opciones | «R13 — dos «Central» de provincias distintas son dos opciones…» | «Central (Alajuela)», «Central (San José)»; ahora con ids distintos |
| R4: distritos del cantón dado, sin nulos, ordenados | «solo los hijos del lugar elegido…» | Carmen, Merced |
| R4: cantón comparado normalizado | «el lugar de arriba se reconoce por su id…» | San Isidro |
| R7: sin cantón, la MISMA lista | «sin lugar elegido devuelve la MISMA lista» | `toBe(ordenes)` |
| R6: solo cantón, incluidas las de distrito nulo | «eligiendo el nivel 2, todas las de ese lugar…» | a, b, c |
| R6: cantón+distrito excluye distrito nulo | «eligiendo el nivel 3, solo las de ese lugar…» | a |
| R6: comparación insensible a acentos/caso | «el nombre escrito en la orden no interviene: decide el id» | b |
| R6: distrito inexistente → vacía | «un lugar que ninguna orden tiene produce lista vacía» | `[]` |
| R13: opciones del conjunto COMPLETO | «las opciones salen del conjunto COMPLETO, no del ya filtrado» | Central + Escazú frente a solo Central (se comparan rótulos: el valor ya es un id) |

### Mapa `R<n> → test`
| R | Test |
|---|---|
| R7 | `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx` («R7 — …» pura y de componente: CR igual que hoy, país de 4 niveles, país de 2 niveles); `RepartoModule.test.tsx` 117/* sin cambiar aserciones |
| R8 | `tests/unit/novedades/novedades-filtros-lugar.test.ts` («R8 — …»: CR con Distrito, opciones del conjunto por id, 4 niveles, sin conjunto) |
| R9 | `FiltroUbicacion.test.tsx` («R9 — filtrarAsignaciones por id»); `novedades-filtros-lugar.test.ts` («R9, R13 — …») |
| R13 | `FiltroUbicacion.test.tsx` (dos cantones «Central», pura y de componente); `novedades-filtros-lugar.test.ts` (dos «Central», dos «San Rafael») |
| R19 | `novedades-filtros-lugar.test.ts` («R19 — …», frente a `comoHoy`, por nombre); `NovedadesFiltroLugarUrl.test.tsx` (pantalla real, conjunto tardío) |
| R20 (novedades) | `novedades-filtros-lugar.test.ts` (`claves`) |

### Latencia de la lista del mensajero (T5.1)
Cómo: `tsx` en node 22, mismo proceso y mismos datos sintéticos (7 provincias, 40 cantones, 160 distritos,
1 de cada 9 órdenes sin distrito). «Antes» es `filtro-canton-distrito.ts` de HEAD copiado aparte; «después»,
`filtro-ubicacion-asignaciones.ts`. Mediana de 21 corridas tras 5 de calentamiento, dos pasadas. «Carga»:
derivar opciones al llegar las órdenes (memo de `porGestionar`). «Gesto»: elegir cantón y distrito
(opciones de abajo + filtrar dos veces).

| Órdenes | Carga antes | Carga después | Gesto antes | Gesto después |
|---|---|---|---|---|
| 50 | 1,57 / 1,54 ms | 0,10 / 0,08 ms | 0,10 / 0,08 ms | 0,012 / 0,011 ms |
| 200 | 8,94 / 8,52 ms | 0,34 / 0,32 ms | 0,34 / 0,42 ms | 0,030 / 0,022 ms |
| 1000 | 12,47 / 13,99 ms | 0,86 / 1,03 ms | 1,45 / 1,90 ms | 0,041 / 0,054 ms |

Antes pesaba `localeCompare` con opciones (un collator por comparación); ahora un `Intl.Collator` y
comparación de ids. La primera versión (con `localeCompare`) daba 5,4 ms a 100 órdenes: por eso el
collator. **No medido:** el coste en el servidor de calcular `lugarRuta` (tanda 1, backend).

### Salida real
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run <11 archivos> --maxWorkers=1`:
  `FiltroUbicacion.test.tsx` 18 passed; `RepartoModule.test.tsx` 108; `novedades-filtros-lugar.test.ts` 18;
  `novedades-filtros.test.ts` 32; `NovedadesFiltroLugarUrl.test.tsx` 2; `NovedadesModule.test.tsx` 74;
  `filtros-url-herencia.test.tsx` 3; `vistas-superficies-declaradas.guardia` 8;
  `etiquetas-geograficas-sin-literal.guardia` 6; `catalogo-postgres-acota-esquema.guardia` 7;
  `NovedadesBuscador.test.tsx` 10 passed, **1 failed** (el de R8 de arriba).
- Otras de Reparto sin cambios: `RepartoModule477Correccion`, `RepartoAyuda`, `RepartoAyudaResueltaPorLaTienda`,
  `markdown`, `superficie-de-uso.guardia`: passed (69 tests en 6 archivos con `etiquetas-…`).
- Guardias (`vitest run guard --maxWorkers=1`): 3 archivos rojos. `dependencias-declaradas-presentes` está en
  `baseline-rojos.json`. `catalogo-postgres-acota-esquema` caía por `git ls-files` con los dos componentes
  borrados aún en el índice: tras `git rm --cached`, 7 passed. `asistente-panel-hermano` (contraprueba
  «no encuentra el nodo a mutar en el layout»): lo rompe el `niveles={niveles}` de `app/(app)/layout.tsx`
  (T3.2, `1806e3a1`), no esta tarea.
- `pnpm run typecheck`: exit 0. `pnpm exec eslint <15 archivos>`: 0 errores; 1 warning previo
  (`RepartoModule.test.tsx:167` `ordenCardsEnReparto`, línea no tocada).
- E2E `e2e/mis-asignaciones.spec.ts`, contra `logistic_slt47` (`env47.sh`), `E2E_PUERTO=3047`,
  `E2E_STORAGE_PUERTO=54347`, `SESSION_SECRET` aleatorio, tras `next build` con
  `NEXT_PUBLIC_APP_URL=http://localhost:3047`: corrida 1 «4 passed (29.4s)», corrida 2 «4 passed (27.1s)».
  Una corrida previa con `E2E_SERVIDOR=dev` dio 1 passed / 3 failed por compilación en caliente
  (`Unable to start a transaction in the given time`, timeouts de 30 s); con `next start`, verde.

Veredicto: T5.1 y T5.2 hechas; R7, R8, R9, R13 y R19 en verde y el E2E en verde dos veces. Bloqueo:
`NovedadesBuscador.test.tsx:360-366` necesita añadir `"Distrito"` por R8 (no cambiado, pide autorización).

## Arreglos tras T3–T5 (frontend_dev, 2026-11-11)

### Archivos
- `providers/EtiquetasGeograficasProvider.tsx`: `EtiquetasGeograficasProvider` vuelve a recibir solo `etiquetas`; nuevo `NivelesGeograficosProvider` (mismo archivo) para `NivelesGeograficosContexto`. `useNivelesGeograficos` sin cambios.
- `app/(app)/layout.tsx`: `<NivelesGeograficosProvider niveles={niveles}>` envuelve por fuera; dentro vuelve el texto exacto `<EtiquetasGeograficasProvider etiquetas={etiquetas}>{children}</EtiquetasGeograficasProvider>`, todo dentro de `AyudaProvider`.
- Fixtures (sin tocar aserciones): `tests/components/AppLayout.test.tsx` (doble con `nivelesDeEmpresa: async () => []` y `NivelesGeograficosProvider` en el mock del módulo), `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx` y `tests/components/NovedadesFiltroLugarUrl.test.tsx` (montan `NivelesGeograficosProvider`).
- `tests/unit/utils/filtro-ubicacion.test.ts` (R6): `deHoy` es ahora una copia congelada de las tres FilterDef de lugar de `construirFiltrosOrdenes` antes de T4.1 (`git show 1806e3a1:…/ordenes-filtros-def.ts` ~357–387); la traducción del encadenado es `provincia_id→nivel_1`, `canton_id→nivel_2`, `distrito_id→nivel_3`. Contraprueba a mano: rótulo `${nivel.singular}!` en `declararNiveles` → el caso R6 rojo; revertido.

### Tercer escalón de `opcionesDeLugarDelCatalogo` (R1): NO quitado
Se quitó a modo de prueba (niveles = catálogo → layout → `[]`) y se revirtió. En una muestra de 18 archivos: 35 tests rojos en 8 archivos (`ordenes-filtros-def` 12, `ordenes-listado-filtros` 8, `filtros-acotados-por-rol` 5, `FiltrosEntregas` 4, `SateliteDescarga` 3, `OrdenesPageFiltros` 1, `SatelitePaginacion` 1, `ordenes-listado-buscador` 1), con 167 archivos candidatos más sin correr. Supera el umbral de ~10 archivos de fixtures: queda para que decida el leader.

### Salida
- `vitest run` de las guardias asistente-panel-hermano, etiquetas-geograficas-sin-literal, superficie-de-uso y vistas-superficies-declaradas, y de AppLayout, FiltroUbicacionBarra, etiquetas-geograficas, RepartoModule, NovedadesBuscador, mis-asignaciones/FiltroUbicacion, NovedadesFiltroLugarUrl y filtro-ubicacion: `Test Files 1 failed | 11 passed (12)`, `Tests 1 failed | 244 passed (245)`. El único rojo es el ya conocido de `NovedadesBuscador.test.tsx` (it en :347, aserción en :360-366). El `console.error` de AppLayout ha desaparecido.
- `pnpm run typecheck`: limpio. `eslint` sobre los archivos tocados: 0 errores y 2 warnings anteriores (`_k`/`_d` en `sinClaves`, `filtro-ubicacion.test.ts`).

Veredicto: arreglos 1 y 2 hechos y en verde; el 3 no se ha aplicado porque supera el umbral de fixtures y queda pendiente de decisión.

## T5.2 cierre (2026-11-11, autorización `96a1dfe7`)

- `tests/components/NovedadesBuscador.test.tsx:364-365`: se inserta solo `"Distrito",` entre `"Cantón",` y `"Causa de devolución",` (R8). Resultado: 11/11 en verde.

## Decisiones de la tanda 2 aplicadas (frontend_dev, 2026-11-11, autorización `96a1dfe7`)

Sin dependencias, sin backend. Grafo no usado (Grep/Read y un inventario de imports propio). Los tres
cambios quedan separables por archivo:

- **A** (R1): `app/(app)/ordenes/_components/ordenes-filtros-def.ts`, `app/(app)/_components/entregas-filtros-def.ts`,
  `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts`, `app/(app)/ordenes/_components/OrdenesListado.tsx`,
  `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`, `app/(app)/_components/FiltrosEntregas.tsx`,
  `tests/fabricas/etiquetas-geograficas.tsx` y los 12 tests de entrada de abajo.
- **B** (homónimos): `lib/utils/filtro-ubicacion.ts`, `tests/unit/utils/filtro-ubicacion.test.ts`.
- **C** («Todos los / Todas las»): `lib/utils/filtro-ubicacion-asignaciones.ts`,
  `app/(app)/mis-asignaciones/_components/FiltroUbicacion.tsx`, `tests/unit/utils/todos-los-del-nivel.test.ts` (nuevo).

### A. Sin tercer escalón en `opcionesDeLugarDelCatalogo`
- Niveles = `cat.niveles` si no vacío → si no, `opts.niveles` (layout, `useNivelesGeograficos`) → si no, `[]`.
  **Sin niveles no hay listas de lugar** (no se sabe qué tipos tiene el país; ningún rótulo puede salir de un
  literal ni de `pais.nivel_N_*`). Documentado en el JSDoc de la función.
- `etiquetas` deja de hacer falta: fuera de la firma de `opcionesDeLugarDelCatalogo`, `construirFiltrosOrdenes`,
  `construirFiltrosEntregas` y `construirFiltrosSatelite`, y de sus llamadas en `OrdenesListado`,
  `SateliteOrdenesListado` y `FiltrosEntregas` (y de las dependencias de sus `useMemo`). `OrdenesListado` y
  `SateliteOrdenesListado` siguen usando `useEtiquetasGeograficas` para columnas y descarga; `FiltrosEntregas`
  ya no lo importa.
- Fixture nuevo: `NIVELES_XA_3` (Departamento/Municipio/Aldea, los nombres de `ETIQUETAS_XA`).
- **Líneas de test tocadas — solo ENTRADA, ninguna aserción** (antes → después):
  - `etiquetas: ETIQUETAS_CR` → `niveles: NIVELES_CR` (y el import `ETIQUETAS_CR` → `NIVELES_CR`):
    `AsignacionBloqueoPorCierre.test.tsx:13, 311`; `FiltrosEntregas.test.tsx:26, 84, 113, 125, 148, 163, 179, 181, 516`
    (números de HEAD); `filtros-acotados-por-rol.test.ts:6, 42, 86, 102`; `ordenes-buscador-declaracion.test.ts:11, 30, 80`;
    `ordenes-filtros-def.test.ts:10, 47, 51, 248, 277, 293, 303`; `salida-a-reparto-filtro.test.ts:22, 37, 47, 95`;
    `satelite-filtro-estado.test.ts:26, 59, 165`.
  - `ordenes-filtros-def.test.ts:329`: `etiquetas: ETIQUETAS_XA` → `niveles: NIVELES_XA_3`.
  - Doble `vi.mock("@/hooks/use-niveles-geograficos")` con `NIVELES_CR` (bloque nuevo de 6 líneas justo tras el
    mock de `use-etiquetas-geograficas`): `FiltrosEntregas.test.tsx`, `descarga/SateliteDescarga.test.tsx`,
    `paginacion/SatelitePaginacion.test.tsx`, `unit/components/ordenes-listado-buscador.test.tsx`,
    `unit/components/ordenes-listado-filtros.test.tsx`.
  - `OrdenesPageFiltros.test.tsx`: import de `NivelesGeograficosProvider` y `NIVELES_CR`; `renderPage` envuelto en
    `<NivelesGeograficosProvider niveles={NIVELES_CR}>` (y su reindentado).
- `ordenes-filtros-def.test.ts:165` **no se tocó** (con la regla «solo homónimos» su fixture no tiene homónimos).

### B. Homónimos con sus ancestros
- `declararNiveles`: en cada lista de nivel, los nombres repetidos se rotulan `nombre · padre, abuelo, …` hasta el
  nivel 1 (`SEPARADOR_ANCESTROS = " · "`, luego `", "`); los únicos, con su nombre (R6). Homónimos del nivel 1
  (sin ancestros) quedan con su nombre. El buscador de la lista busca por `label`, es decir, por lo mostrado.
- Mis-asignaciones: su primera lista (`etiquetaConPadre`) sigue «lugar (padre)» sin cambios; **las listas de
  nivel 3 a P sí heredan los ancestros si hay homónimos** entre las órdenes cargadas (lo arrastra la lógica
  común; lo fija un caso nuevo). `RepartoModule*.test.tsx` y `mis-asignaciones/FiltroUbicacion.test.tsx` en verde.
- `traductorPorNombre` comparaba `o.label`: ahora casa por `label` o por el nombre puro (el rótulo sin
  `" · …"`), así `?canton=Central` sigue traduciendo con cantones homónimos. Protegido por test.
- Tests nuevos (`filtro-ubicacion.test.ts`, describe «Homonimos», al final): dos «San Rafael» en cantones
  distintos; nombre único sin ancestros; homónimos de nivel 1; mis-asignaciones; `traductorPorNombre` por nombre puro.
- **PARADO — aserciones que B rompe y no se han cambiado** (tests creados en SLT-47; no autorizados):
  - `tests/components/FiltroUbicacionBarra.test.tsx` (5 rojos; fixture con dos «Central» y dos «San Rafael»):
    - `:150` `["Escazú", "Central", "Central"]` → `["Escazú", "Central · San José", "Central · Alajuela"]`
    - `:151` `["San Rafael", "San Antonio", "San Rafael", "Carmen"]` → `["San Rafael · Escazú, San José", "San Antonio", "San Rafael · Central, Alajuela", "Carmen"]`
    - `:160` `["Escazú", "Central"]` → `["Escazú", "Central · San José"]`
    - `:161` `["San Rafael", "San Antonio", "Carmen"]` → `["San Rafael · Escazú, San José", "San Antonio", "Carmen"]`
    - `:164` `["San Rafael", "San Antonio"]` → `["San Rafael · Escazú, San José", "San Antonio"]`
    - `:175` (acción) `marcar(user, "Distrito", "San Rafael")` → `"San Rafael · Escazú, San José"`
    - `:230` y `:304` `"Distrito: San Rafael"` → `"Distrito: San Rafael · Escazú, San José"`
  - `tests/unit/novedades/novedades-filtros-lugar.test.ts` (2 rojos; novedades ordena las opciones por `label`):
    - `:107-113` cantones `[c-cen-sj Central, c-cen-ala Central, c-cen-her Central, c-esc, c-ore]` →
      `[c-cen-ala "Central · Alajuela", c-cen-her "Central · Heredia", c-cen-sj "Central · San José", c-esc "Escazú", c-ore "Oreamuno"]`
    - `:117-118` `"San Rafael"` → `"San Rafael · Escazú, San José"` y `"San Rafael · Oreamuno, Cartago"` (mismo orden)
    - `:213` `["c-cen-sj", "c-cen-ala", "c-cen-her"]` → `["c-cen-ala", "c-cen-her", "c-cen-sj"]` (mismo conjunto; cambia
      el orden porque las opciones se ordenan por el rótulo nuevo). Alternativa que no toca `:213`: que novedades
      ordene por el nombre puro (orden estable entre homónimos); decide el humano.

### C. Género de «Todos los / Todas las» por el singular
- `todosLosDelNivel(singular, plural)` en `filtro-ubicacion-asignaciones.ts`: femenino si el singular (sin
  mayúsculas ni tildes) termina en `a`, `ion`, `dad` o `tad`; si no, masculino. «Cantón» (-ón) masculino,
  «Región» femenino. `FiltroUbicacion.tsx` la usa en lugar de `todosLos(plural)`. CR igual que hoy.
- Test nuevo `tests/unit/utils/todos-los-del-nivel.test.ts`: Provincia, Cantón, Distrito, Región, Comuna, Barrio,
  Ciudad, Municipio, más mayúsculas/sin tilde y `-tad`.

### Mapa `R<n> → test`
| R | Test |
|---|---|
| R1 (sin respaldo de etiquetas) | `ordenes-filtros-def.test.ts` (rótulos con `NIVELES_CR`/`NIVELES_XA_3`), `filtros-acotados-por-rol.test.ts`, `FiltrosEntregas.test.tsx`, `OrdenesPageFiltros.test.tsx` |
| R6 (no homónimos, igual que hoy) | `filtro-ubicacion.test.ts` (R6 congelado y «un nombre unico…»), `ordenes-filtros-def.test.ts:165` |
| Homónimos / R19 | `filtro-ubicacion.test.ts`, describe «Homonimos» |
| R7 («Todos los») | `todos-los-del-nivel.test.ts`, `RepartoModule.test.tsx`, `mis-asignaciones/FiltroUbicacion.test.tsx` |

### Inventario y salida (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run <lote> --maxWorkers=1`)
Inventario por el grafo de imports estático (`import`, `export … from`, `vi.mock`, `import()`; sin `import type`):
- **A**: tests que alcanzan `ordenes-filtros-def`, `entregas-filtros-def`, `satelite-ordenes-filtros`,
  `FiltrosEntregas`, `OrdenesListado` o `SateliteOrdenesListado`: **113 archivos**, en 15 lotes de 8.
  Primera pasada: 11 lotes verdes; rojos (todos por falta de niveles; arreglados por entrada y re-corridos):
  `FiltrosEntregas` 1, `OrdenesPageFiltros` 1, `SateliteDescarga` 3, `SatelitePaginacion` 1,
  `ordenes-listado-buscador` 1, `ordenes-listado-filtros` 8. Re-corrida: `FiltrosEntregas` `Tests 20 passed (20)`;
  `OrdenesPageFiltros` `Tests 8 passed (8)`; los otros 4: `Test Files 4 passed (4)`, `Tests 47 passed (47)`.
  (2 archivos `skipped` en el lote 11: de BD, se saltan sin base.)
- **B/C** (los que además alcanzan `filtro-ubicacion` o `filtro-ubicacion-asignaciones`): **27 archivos más**,
  en 4 lotes de 7: 25 verdes; rojos solo `FiltroUbicacionBarra.test.tsx` (5) y `novedades-filtros-lugar.test.ts` (2),
  los de arriba (PARADO).
- Total corrido: 140 archivos de test.
- Guardias `etiquetas-geograficas-sin-literal`, `asistente-panel-hermano`, `superficie-de-uso`,
  `vistas-superficies-declaradas` + `filtro-ubicacion` + `todos-los-del-nivel`: `Test Files 6 passed (6)`, `Tests 81 passed (81)`.
- `pnpm run typecheck`: limpio. `eslint` sobre los 24 archivos tocados: 0 errores, 2 warnings anteriores
  (`_k`/`_d` en `filtro-ubicacion.test.ts:133`).

<details><summary>Inventario A (113)</summary>

- `tests/components/ActualizarAnalitica.test.tsx`
- `tests/components/AnaliticaPage.test.tsx`
- `tests/components/AsignacionBloqueoPorCierre.test.tsx`
- `tests/components/AvisoPeriodoEnCurso.test.tsx`
- `tests/components/CambiarDiaRepartoListados.test.tsx`
- `tests/components/CargadasPorDiaBarras.test.tsx`
- `tests/components/CicloVidaKpi.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierreIngresoBodegaTarjetaListado.test.tsx`
- `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminFiltros.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/CierresBodegaAdminRefresco.test.tsx`
- `tests/components/CohorteCargaTabla.test.tsx`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/ConteoEntregasAnillo.test.tsx`
- `tests/components/ConteoPorStatusDona.test.tsx`
- `tests/components/ConteoPorStatusDonaInfo.test.tsx`
- `tests/components/CorregirFechaReprogramacionListado.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/components/DevolucionesPorCausaAnillo.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/EntregasFiltroConectado.test.tsx`
- `tests/components/FilaKpisVocabulario.test.tsx`
- `tests/components/FiltrosCierresBarraEstado.test.tsx`
- `tests/components/FiltrosEntregas.test.tsx`
- `tests/components/HistorialAccionesAbonoTienda457.test.tsx`
- `tests/components/HistorialAccionesCobroTienda461.test.tsx`
- `tests/components/HistorialAccionesModule.test.tsx`
- `tests/components/HistorialAccionesPage.test.tsx`
- `tests/components/HistoricoConversacionesPage.test.tsx`
- `tests/components/HistoricoFechaDiferenciada.test.tsx`
- `tests/components/HistoricoFiltros.test.tsx`
- `tests/components/HistoricoHilo.test.tsx`
- `tests/components/HistoricoHilosLista.test.tsx`
- `tests/components/HistoricoMediaExpirada.test.tsx`
- `tests/components/HistoricoMovil.test.tsx`
- `tests/components/HistoricoSoloLectura.test.tsx`
- `tests/components/HoyGestionBarras.test.tsx`
- `tests/components/KpisEfectividad.test.tsx`
- `tests/components/ManifiestoFlujos.test.tsx`
- `tests/components/OrdenesCargaColumnasGeoCableado.test.tsx`
- `tests/components/OrdenesDescarga.test.tsx`
- `tests/components/OrdenesListado.confirmar-entrega-419.test.tsx`
- `tests/components/OrdenesListado.etiquetas-tienda.test.tsx`
- `tests/components/OrdenesListado.gestion-pendiente.test.tsx`
- `tests/components/OrdenesListadoBloqueoCierre.test.tsx`
- `tests/components/OrdenesListadoDevolucion.test.tsx`
- `tests/components/OrdenesListadoEtiquetasChain.test.tsx`
- `tests/components/OrdenesModuleReuse.test.tsx`
- `tests/components/OrdenesPage.test.tsx`
- `tests/components/OrdenesPageFiltros.test.tsx`
- `tests/components/OrdenesPageFranjaRetenidas.test.tsx`
- `tests/components/OrdenesPagination.test.tsx`
- `tests/components/OrdenesRutearSatelite.test.tsx`
- `tests/components/ProductosTabla.test.tsx`
- `tests/components/ProductosTablaDinero.test.tsx`
- `tests/components/RecepcionSateliteIncidente.test.tsx`
- `tests/components/RecepcionSateliteModule.test.tsx`
- `tests/components/RecepcionSatelitePage.test.tsx`
- `tests/components/SateliteFiltroEstadoAlcance.test.tsx`
- `tests/components/SateliteOrdenesListado.gestion-pendiente.test.tsx`
- `tests/components/TraspasarMensajeroListado.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/components/descarga/CierresDescargaNiveles.test.tsx`
- `tests/components/descarga/ProductosDescarga.test.tsx`
- `tests/components/descarga/ProductosDescargaColumnas.test.tsx`
- `tests/components/descarga/SateliteDescarga.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `tests/components/paginacion/SatelitePaginacion.test.tsx`
- `tests/components/paginacion/SateliteSeleccionOtrasPaginas.test.tsx`
- `tests/components/paginacion/paginacion-transversal.test.tsx`
- `tests/integration/db/455/caracterizacion/filtro-ordenes-por-estado.test.ts`
- `tests/integration/db/455/caracterizacion/filtro-satelite-por-codigo.test.ts`
- `tests/unit/analytics/conteo-entregas-pliegue.test.ts`
- `tests/unit/analytics/dinero-producto-no-sumable.guardia.test.ts`
- `tests/unit/analytics/entregas-filtro-analitica.test.ts`
- `tests/unit/components/deshacer-asignacion.ui.test.tsx`
- `tests/unit/components/eliminar-orden.ui.test.tsx`
- `tests/unit/components/filtros-acotados-por-rol.test.ts`
- `tests/unit/components/historial-acciones-filtros-def.test.ts`
- `tests/unit/components/historial-acciones-seleccion-a-filtro.test.ts`
- `tests/unit/components/historico-filtros-def.test.ts`
- `tests/unit/components/historico-seleccion-a-filtro.test.ts`
- `tests/unit/components/ordenes-buscador-declaracion.test.ts`
- `tests/unit/components/ordenes-filtros-def.test.ts`
- `tests/unit/components/ordenes-listado-buscador.test.tsx`
- `tests/unit/components/ordenes-listado-filtros.test.tsx`
- `tests/unit/components/ordenes-listado-orden.test.tsx`
- `tests/unit/components/ordenes-listado-vistas.test.tsx`
- `tests/unit/components/ordenes-listado.test.tsx`
- `tests/unit/components/rechazo-nombre-466-app.test.ts`
- `tests/unit/components/recuperar-orden.ui.test.tsx`
- `tests/unit/components/salida-a-reparto-filtro.test.ts`
- `tests/unit/components/satelite-filtro-estado.test.ts`
- `tests/unit/components/seleccion-a-filter.test.ts`
- `tests/unit/components/textos-455-recorrido.test.ts`
- `tests/unit/ordenes/seleccion-a-filter-lugar.test.ts`
- `tests/unit/types/historial-accion-entidades.test.ts`
</details>

<details><summary>Inventario B/C adicional (27)</summary>

- `tests/components/ChatContactoAntesDeRecoger.test.tsx`
- `tests/components/CorregirDatosCliente.novedades.test.tsx`
- `tests/components/descarga/NovedadesDescarga.test.tsx`
- `tests/components/FiltroUbicacionBarra.test.tsx`
- `tests/components/GestionarOrdenPanelHilo.test.tsx`
- `tests/components/MarcarLuegoToggle.test.tsx`
- `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx`
- `tests/components/MisAsignacionesPage.test.tsx`
- `tests/components/NovedadesBuscador.test.tsx`
- `tests/components/NovedadesFiltroLugarUrl.test.tsx`
- `tests/components/NovedadesHilo.test.tsx`
- `tests/components/NovedadesModule.test.tsx`
- `tests/components/NovedadesPage.test.tsx`
- `tests/components/NovedadesTabs.test.tsx`
- `tests/components/RechazarNovedad.test.tsx`
- `tests/components/RepartoAyuda.test.tsx`
- `tests/components/RepartoAyudaResueltaPorLaTienda.test.tsx`
- `tests/components/RepartoModule.test.tsx`
- `tests/components/RepartoModule477Correccion.test.tsx`
- `tests/integration/actions/novedades-pestana-por-url.test.ts`
- `tests/unit/components/filtros-url-herencia.test.tsx`
- `tests/unit/components/novedades-filtros.test.ts`
- `tests/unit/guards/vistas-superficies-declaradas.guardia.test.tsx`
- `tests/unit/novedades/novedades-filtros-lugar.test.ts`
- `tests/unit/utils/filtro-ubicacion.test.ts`
- `tests/unit/utils/filtro-ubicacion-rendimiento.test.ts`
- `tests/unit/utils/todos-los-del-nivel.test.ts`
</details>

Veredicto: A y C hechos y en verde; B hecho, pero rompe 7 aserciones (más una acción) de dos tests de SLT-47 no autorizados: parado a la espera del humano.

### Estado de commit de A, B y C (implementer)

- A (R1, sin respaldo de rótulos): `f79eeb21`. C («Todos los / Todas las» por el singular): `4d6e6bdb`.
- **B (homónimos) NO está commiteado**: rompe 7 aserciones de dos tests de esta feature
  (`FiltroUbicacionBarra.test.tsx:150,151,160,161,164,175,230,304` y
  `novedades-filtros-lugar.test.ts:107-113,117-118,213`), fuera de lo autorizado (solo
  `ordenes-filtros-def.test.ts:165`). Se revirtió del árbol; el parche está en el scratchpad de la
  sesión (`slt47-B-homonimos.patch`) a la espera de la decisión del humano.

## T6.1 — E2E `geo-filtro-lugar` (frontend_dev, 2026-11-11)

### Archivos
- `e2e/geo-filtro-lugar.spec.ts` (nuevo).
- `playwright.config.ts`: `geo-filtro-lugar` en el proyecto `reparto` (guardia `e2e-sin-saltos`: cada spec en un proyecto).

### Qué hace
Empresa nueva de Costa Rica por corrida (`crearEscenarioReparto`, sufijo aleatorio: repetible sin limpiar). Dos
órdenes en el cantón de la zona central y una en el de la satélite (cantones distintos, comprobado), llevadas a
`en_bodega_central` por los servicios reales para que tengan guía. Una vista `version = 1` del maestro escrita en
`vista_filtro` (`{ v: 1, termino: "", activos: ["canton_id"], seleccion: { canton_id: [<id>] } }`): ningún servicio
guarda ya la v1. Con el maestro:
- sin filtro salen las tres guías;
- (1) «Filtros» ofrece Provincia, Cantón y Distrito; se monta «Cantón» y se elige el cantón;
- (2) `/ordenes?canton_id=<id>` monta «Cantón: <nombre>»;
- (3) «Vistas guardadas» → «Aplicar «…»» monta «Cantón: <nombre>»; la fila sigue `version = 1`;
- cada vez: ninguna fila del otro cantón, las del cantón visibles y las guías de la tabla = las dos esperadas;
  un último caso compara las tres listas entre sí.

### R → test
| R | Test |
|---|---|
| R39 | `e2e/geo-filtro-lugar.spec.ts` (1) y «las tres veces, las mismas guías» |
| R18 | `e2e/geo-filtro-lugar.spec.ts` (2) |
| R23 | `e2e/geo-filtro-lugar.spec.ts` (3) |

### Cómo se corrió
Contra `logistic_slt47` (`source …/scratchpad/env47.sh`, que aborta si la URL no es `localhost:5432/logistic_slt47`;
el worktree no tiene `.env`, así que Playwright no carga otro). `SESSION_SECRET` aleatorio,
`NEXT_PUBLIC_APP_URL=http://localhost:3047`, `NODE_OPTIONS=--max-old-space-size=8192`:
1. `pnpm exec next build` (exit 0; el `.next` anterior era de antes de HEAD).
2. `E2E_PUERTO=3047 E2E_STORAGE_PUERTO=54347 pnpm exec playwright test e2e/geo-filtro-lugar.spec.ts` (`next start`).

### Salida
Corrida 1:
```
  ✓  1 [reparto] › e2e\geo-filtro-lugar.spec.ts:97:7 › … › sin filtro, la tabla enseña las órdenes de los dos cantones (8.2s)
  ✓  2 [reparto] › e2e\geo-filtro-lugar.spec.ts:103:7 › … › (1) R39 — filtrar por el cantón desde la barra, con las listas de los niveles del país (11.6s)
  ✓  3 [reparto] › e2e\geo-filtro-lugar.spec.ts:128:7 › … › (2) R18 — el enlace viejo `?canton_id=` da las mismas guías (7.0s)
  ✓  4 [reparto] › e2e\geo-filtro-lugar.spec.ts:138:7 › … › (3) R23 — aplicar la vista guardada de la versión 1 da las mismas guías (6.2s)
  ✓  5 [reparto] › e2e\geo-filtro-lugar.spec.ts:161:7 › … › R39 — las tres veces, las mismas guías (13ms)
  5 passed (1.0m)
```
Corrida 2: `5 passed (26.9s)` (los mismos 5 casos).

- `pnpm exec eslint e2e/geo-filtro-lugar.spec.ts playwright.config.ts`: «No issues found».
- `pnpm run typecheck`: exit 0.
- `vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: 38 passed.

Veredicto: T6.1 hecha; R18, R23 y R39 en verde en local, dos corridas seguidas. Sin cambios en código de producción.

## B — homónimos aplicados (frontend_dev, 2026-11-11)

Regla: solo los nombres repetidos dentro de una misma lista se rotulan con sus ancestros
(«San Rafael · Escazú, San José», padre primero hasta el nivel 1); los únicos, como hoy; el buscador
filtra por el rótulo; `traductorPorNombre` casa también por el nombre puro (`?canton=<nombre>`).

### Archivos
- `lib/utils/filtro-ubicacion.ts`: parche `slt47-B-homonimos.patch` aplicado tal cual, más `export` en
  `nombreDeOpcion` (lo usa novedades para ordenar).
- `app/(app)/novedades/_components/novedades-filtros.ts` (`listasDeLugar`): ordena por el nombre puro
  (`nombreDeOpcion`). **Desvío del encargo:** los ancestros NO desempatan. Si desempataran, los tres
  «Central» saldrían Alajuela, Heredia, San José, y `novedades-filtros-lugar.test.ts:213` (que espera
  `["c-cen-sj", "c-cen-ala", "c-cen-her"]`, el orden de la lista) cambiaría. Con el sort estable los
  homónimos quedan juntos y en el orden del conjunto, como hoy, y `:213` no se toca.
- `tests/unit/utils/filtro-ubicacion.test.ts`: los casos nuevos del parche (homónimos, nombre único,
  nivel 1 sin ancestros, mis-asignaciones, `traductorPorNombre` por nombre puro).
- `tests/components/FiltroUbicacionBarra.test.tsx` y `tests/unit/novedades/novedades-filtros-lugar.test.ts`:
  solo los rótulos (abajo).

Procedencia comprobada con `git cat-file -e origin/feature/SLT-89-geo-jerarquica-zonas:<ruta>`: los tres
tests tocados son NUEVOS de SLT-47. `tests/unit/components/novedades-filtros.test.ts` existe allí y no se
tocó (32/32 en verde). Ninguna aserción anterior a SLT-47 se rompió.

### Líneas de test cambiadas (todas de tests nuevos de SLT-47; solo el texto del rótulo)
`tests/components/FiltroUbicacionBarra.test.tsx`
- :150 `["Escazú", "Central", "Central"]` → `["Escazú", "Central · San José", "Central · Alajuela"]`
- :151 `["San Rafael", "San Antonio", "San Rafael", "Carmen"]` → `["San Rafael · Escazú, San José", "San Antonio", "San Rafael · Central, Alajuela", "Carmen"]`
- :160 `["Escazú", "Central"]` → `["Escazú", "Central · San José"]`
- :161 `["San Rafael", "San Antonio", "Carmen"]` → `["San Rafael · Escazú, San José", "San Antonio", "Carmen"]`
- :164 `["San Rafael", "San Antonio"]` → `["San Rafael · Escazú, San José", "San Antonio"]`
- :175 (acción) `marcar(user, "Distrito", "San Rafael")` → `marcar(user, "Distrito", "San Rafael · Escazú, San José")`
- :230 y :304 `"Distrito: San Rafael"` → `"Distrito: San Rafael · Escazú, San José"`

`tests/unit/novedades/novedades-filtros-lugar.test.ts`
- :108 `"Central"` → `"Central · San José"`; :109 `"Central"` → `"Central · Alajuela"`; :110 `"Central"` → `"Central · Heredia"` (mismo orden y valores)
- :117 `"San Rafael"` → `"San Rafael · Escazú, San José"`; :118 `"San Rafael"` → `"San Rafael · Oreamuno, Cartago"`
- :213 sin cambios.

### Salida (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run <archivo> --maxWorkers=1`, uno a uno)
```
filtro-ubicacion.test.ts               Tests 27 passed (27)
FiltroUbicacionBarra.test.tsx          Tests 13 passed (13)
novedades-filtros-lugar.test.ts        Tests 18 passed (18)
novedades-filtros.test.ts              Tests 32 passed (32)
NovedadesFiltroLugarUrl.test.tsx       Tests  2 passed (2)
NovedadesBuscador.test.tsx             Tests 11 passed (11)
NovedadesModule.test.tsx               Tests 74 passed (74)
ordenes-filtros-def.test.ts            Tests 25 passed (25)
RepartoModule.test.tsx                 Tests 108 passed (108)
RepartoModule477Correccion.test.tsx    Tests  8 passed (8)
mis-asignaciones/FiltroUbicacion.test.tsx Tests 18 passed (18)
filtros-acotados-por-rol.test.ts       Tests  6 passed (6)
FiltrosEntregas.test.tsx               Tests 20 passed (20)
todos-los-del-nivel.test.ts            Tests 10 passed (10)
filtro-ubicacion-rendimiento.test.ts   Tests  5 passed (5)
```
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint` sobre los 5 archivos: 0 errores, 2 warnings ya existentes en HEAD
  (`filtro-ubicacion.test.ts:133`, `_k`/`_d` sin usar).

### E2E `geo-filtro-lugar` — NO corrido
`next build` (env47.sh, `logistic_slt47`, `SESSION_SECRET` aleatorio, `NEXT_PUBLIC_APP_URL=http://localhost:3047`)
compiló y pasó TypeScript («Compiled successfully in 44s», «Finished TypeScript in 3.6min») y lo mató
Claude Code por falta de memoria del sistema en «Collecting page data using 11 workers». Playwright no
llegó a arrancar. No se reintentó (orden: si muere por memoria, no reiniciar). Puertos 3047/54347 libres.
Riesgo a vigilar: el spec elige el cantón por `name: nombreCanton, exact: true`; si el catálogo de la
empresa de prueba tuviera otro cantón con ese nombre, el rótulo llevaría ancestros y ese paso fallaría.

Veredicto: B aplicado y en verde en vitest (15 archivos), typecheck y lint; E2E pendiente por memoria.

## Rojos de CI 43125634413

Causa: dos tests de integración seguían mandando `provincia_id`/`canton_id`/`distrito_id` a
`prepararConteoEntregas`/`prepararConsultaProductos`, que desde R10 solo aceptan `lugar_id` →
`validation_error`. Arreglo solo de ENTRADA con el helper de la tanda 1
(`scripts/geo-equivalencia/filtros-de-hoy.ts > rawConLugar`/`lugarDeFacetas`): ids válidos de su nivel,
podados por el de arriba; nivel más hondo elegido (R6); incoherente o de otro nivel → `LUGAR_INEXISTENTE`
(cero, como hoy). Ninguna aserción cambiada; nada de producción tocado.

- `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`: imports (l. 6, 10); `leer` del fixture
  (l. 158-159) pasa el `raw` por `aLugar` (nueva, l. 164-175): sin faceta geográfica el `raw` va tal
  cual y no se carga el catálogo; con faceta, `rawConLugar` con `CatalogoGeograficoRepository.deLaEmpresa()`
  del mismo `tx` (el mismo catálogo que carga el repositorio).
- `tests/integration/db/geo-lecturas-sin-backfill.test.ts`: imports (l. 14, 32); en `leerLasDe71DeUna`
  (l. 491-495) se carga el catálogo de la empresa del contexto una vez y cada `raw` de `facetasDe71` se
  traduce con `rawConLugar` antes de `consulta71` y `prepararConsultaProductos`.

Otros revisados (grep de `provincia_id|canton_id|distrito_id` como clave en `tests/` y `e2e/`), todos
legítimos, sin cambios: `geo-analitica-lugar` y `geo-equivalencia-filtros` (ya traducen / prueban el
traductor); `geografia-por-pais`, `geo-sincronia-geografia`, `geo-sincronia-orden-zonas`,
`habilitacion-api-migration`, `orden-mensajero-meta-drop-nota-migration`, `orden-nodo-escritura`,
`orden-nota-migration`, `zona-distrito-unica-migration` y las migraciones/fixtures SQL (columnas SQL);
unit `filtro-lugar-schemas` y `seleccion-a-filter-lugar` (afirman el RECHAZO de las claves viejas);
`vista-filtro-v2`, `filtro-ubicacion`, `e2e/geo-filtro-lugar.spec.ts` (vista v1 / enlace viejo que
traduce la barra); `ordenes-module-filter-key` (solo serializa la key); `informe-transito-composicion`
(fila de tránsito); `tests/unit/analytics/{ciclo-vida,conteo-cargadas-servicio,conteo-devoluciones,conteo-por-status-sql}`
(regex sobre la columna SQL `o."distrito_id"`). Ningún otro test manda las claves viejas a
`listarOrdenes*`, `listarOrdenesBodega*`/`FILTROS_COMPARTIDOS`, `conteoEntregasFiltroSchema` ni a las
acciones de analítica.

Salida (2026-11-11, base local `logistic_slt47`, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`):
- `ciclo-vida-gestion-final.int.test.ts`: Test Files 1 passed (1), Tests 29 passed (29), 5.17s.
- `geo-lecturas-sin-backfill.test.ts`: Test Files 1 passed (1), Tests 3 passed (3), 14.90s.
- `pnpm exec eslint` de los dos archivos: sin salida (0 errores). `pnpm run typecheck` (`tsc --noEmit`): limpio.

Veredicto: los dos rojos de CI 43125634413 en verde en local cambiando solo la entrada; sin otros tests afectados.

## E2E rojo en CI 43127951913 (frontend_dev, 2026-11-11)

### Causa raíz — (b) carrera de la espera del propio spec, no bug de producción
`e2e/geo-filtro-lugar.spec.ts` (2) R18 falló en el intento y en el retry: la tabla dio 3 guías y se esperaban 2.
- **Qué guía sobraba.** Retry #1: recibidas `56005968, 65260878, 81942718`, esperadas `56005968, 81942718`. En la
  traza (`3-trace.network`) la única lectura del listado (`POST /ordenes?canton_id=3471be42…`, 00:35:30.099Z) va
  **sin filtro** (`{page:1,pageSize:25,sortBy:"created_at",sortDir:"desc"}`) y devuelve las tres órdenes de la
  empresa del spec: la sobrante, `65260878` (`E2E-ffc52917c4`), es la orden de la zona «Satelite E2E 6173c68fc5»,
  cantón `efc66ab3…`, o sea `delOtro[0]`. Las otras dos son de la central, cantón `3471be42…` = el del enlace. No es
  una orden de otro spec ni un homónimo: es la orden del otro cantón, sin filtrar.
- **Por qué.** Con un enlace viejo la barra lee la URL al montar, pinta «Cantón: Naranjo» y emite la precarga por el
  camino de siempre, `emitir` con su debounce de 500 ms (`FilterComponent`, R5 de la ficha 339, de antes de SLT-47).
  Mientras, el listado ya hizo su primera lectura sin filtro. `soloDelCanton` miraba primero
  `toHaveCount(0)` de la fila del otro cantón, que **pasaba en vacío** con la tabla aún sin filas, luego esperaba las
  del cantón (visibles ya en la lectura sin filtro) y leía la tabla: las tres. En la traza CI, del `goto` (mono 35288)
  al fallo (36349) pasan ~1,06 s; la emisión con filtro llegaba después y la traza termina sin ella.
- **Comprobación en local** (traza de (2) con `--trace on`): `00:57:56.471Z` lectura sin filtro → sin guías aún;
  `00:57:56.941Z` (470 ms después) lectura con `filter: {lugar_id: ["22d53a2d…"]}` → solo las dos guías del cantón.
  El traductor y el alcance de `lugar_id` son correctos; lo que falla es la espera. En local pasaba porque el
  arranque es lo bastante lento para que la segunda lectura aterrice antes de leer la tabla.
- Lo mismo vale, en principio, para (3) (la vista aplica la selección y se relee el listado), pero ahí la fila del
  otro cantón ya estaba visible antes, así que `toHaveCount(0)` sí esperaba. (1) igual.

### Arreglo (solo el spec, nuevo de SLT-47)
`soloDelCanton` espera primero con `expect.poll(() => guiasDeLaTabla(page)).toEqual(esperadas())` y después comprueba
las filas (ninguna del otro cantón, las del cantón visibles) y relee las guías. La comparación sigue siendo estricta:
la lista final = esperadas, y el caso final compara barra = enlace = vista. Sin cambios de producción.

### Archivos
- `e2e/geo-filtro-lugar.spec.ts` (función `soloDelCanton` y su comentario).

### Salida
- `next build` nuevo (exit 0), `logistic_slt47`, puerto 3047, Storage 54347, `SESSION_SECRET` aleatorio.
- `playwright test e2e/geo-filtro-lugar.spec.ts --trace on`: `5 passed (1.4m)`.
- `playwright test --project=reparto`: `19 passed, 2 failed (3.0m)`; geo-filtro-lugar 5/5 en verde. Los dos rojos,
  `mis-asignaciones.spec.ts` (b) y (c), son `Test timeout of 30000ms exceeded` esperando el panel «Detalle de la
  orden» (`Motivo` / `Nueva fecha de reprogramación`); en CI 43127951913 pasaron (no hay artefactos suyos) y corrido
  solo en local da `4 passed (46.9s)`: lentitud de la máquina local, ajena a este cambio.
- `pnpm exec eslint e2e/geo-filtro-lugar.spec.ts`: sin salida (0 errores). `pnpm run typecheck` (`tsc --noEmit`): limpio.

Veredicto: rojo de CI 43127951913 explicado (espera que pasaba en vacío ante la lectura sin filtro previa al debounce) y arreglado en el spec; R18 en verde en local, solo y con `reparto`.
