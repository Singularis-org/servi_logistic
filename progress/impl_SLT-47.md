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
