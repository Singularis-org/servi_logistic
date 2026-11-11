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
