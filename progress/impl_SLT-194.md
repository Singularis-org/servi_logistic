# SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» — implementación

## Tandas

- 2026-11-17 · backend_dev · T4 (Rechazos, servidor): `q` en la acción, término por servicio y repositorio, `rechazoSlaWhere` con `criterioBusqueda` en AND; integración SQL real con las dos mutaciones muertas.

## Backend

### Archivos

Producción (modificados):
- `lib/actions/rechazos-sla-tienda.ts`: `q` opcional en el esquema (`trim`, `BUSQUEDA_MIN_CHARS`..`BUSQUEDA_MAX_CHARS`, como `/ordenes`). Con `q`, el input del servicio lleva `busqueda: terminoDeBusqueda(q)`. Sin `q`, la clave ni viaja.
- `lib/interfaces/services/IRechazosSlaTiendaService.ts`: `ListarRechazosSlaTiendaInput.busqueda?: TerminoBusqueda`.
- `lib/services/RechazosSlaTiendaService.ts`: pasa el mismo término a `count` y `find`. Sin término, las llamadas son las de antes, sin un argumento `undefined` de más.
- `lib/interfaces/repositories/IOrdenRepository.ts`: tipo `BusquedaRechazosSla` (misma forma que `TerminoBusqueda`). No se importa `TerminoBusqueda` porque `filtros-listado-ordenes.ts` ya importa de esta interfaz y cerraría un ciclo. `count`/`findRechazadasSlaByTienda` reciben `busqueda?`.
- `lib/repositories/OrdenRepository.ts`: `rechazoSlaWhere(tiendaId, busqueda?)` añade `...OrdenRepository.criterioBusqueda(...)` como clave hermana (AND). `count` y `find` siguen compartiendo el `where`. Sin término, `criterioBusqueda` devuelve `{}`.

Tests:
- `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` (nuevo): siembra propia dentro de una transacción revertida, con dos empresas (A y B), dos tiendas de A (más la de B) y siete órdenes. Consulta con el rol de la app (`comoApp`, sin BYPASSRLS). La no-vacuidad se comprueba como dueño: las seis órdenes negativas y `a1` casan con «91024» en la columna generada. No hay `if (!x) return`.
- `tests/unit/actions/rechazos-sla-tienda-action.test.ts` (nuevo).
- `tests/unit/services/rechazos-sla-tienda-service.test.ts`: bloque «busqueda (SLT-194/R956)». Los tests existentes no se tocaron.

Nota del escenario: la base rechaza colgar una orden de la empresa B de la tienda de A («referencia a otra empresa: orden.tienda_id -> usuario»). Por eso la orden de «otra empresa» lleva su propia tienda y zona de B.

### Mapa R → test (parte de servidor)

| R | Test |
| --- | --- |
| R953 | `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts`: «q=91024 -> total 1…», «q=95555…», «por remision y por destinatario…», «el total y la pagina salen del mismo filtro…» |
| R954 | `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts`: «con q=91024 no aparece ni cuenta la de otra tienda, otra empresa, borrada, no rechazada ni manual» |
| R955 | `tests/unit/actions/rechazos-sla-tienda-action.test.ts`: 2 y 81 caracteres → `validation_error` sin llamar al servicio; 80 pasa; `" 91024 "` → recortado; `"  ab  "` → `validation_error` |
| R956 | `tests/unit/services/rechazos-sla-tienda-service.test.ts`: «adminTienda con termino…», «con las dos formas del termino…», «otro rol con termino -> forbidden…» |
| R957 (servidor) | integración «sin termino, salen los dos rechazos SLA…»; acción «sin q, el servicio recibe el input de siempre» (`toStrictEqual`); servicio «sin termino, las llamadas no llevan argumento de busqueda» |

### Mutaciones (las dos, contra Postgres real en `servi_slt194_desechable`)

1. **Quitar `criterioBusqueda` de `rechazoSlaWhere`**: ROJO, 4 failed y 2 passed. Caen R953 (q=91024 da 3 en vez de 1), q=95555, remisión/destinatario y R954. Siguen verdes «sin término» y «total y página» porque su término casa con las dos órdenes: en ellos la mutación no cambia nada.
2. **Término en un `OR` con `tiendaId`** (`OR: [{ tiendaId }, criterioBusqueda(...)]` en lugar de la clave `tiendaId`): ROJO, 4 failed y 2 passed. En R954, «otraTienda: expected [ …(3) ] to not include '<id>'»; en R953, «expected 3 to be 1».

Las dos se revirtieron restaurando una copia del archivo, comprobada con `cmp`. No se usó `git checkout -- <archivo>` porque el cambio aún no estaba commiteado y ese comando lo habría borrado. Tras revertir, el archivo vuelve a verde (6/6).

### Salidas

- `pnpm typecheck`: TC_EXIT=0, sin errores (con los cambios de UI del otro agente en el árbol).
- `eslint` de los 8 archivos: 0 errores y 1 warning previo (`OrdenHistorialOrigenTipo` sin usar en `IOrdenRepository.ts:11`, que ya estaba en HEAD).
- `vitest related --run` de la acción, el servicio, su interfaz y los tres tests, con la base desechable: **9 archivos, 85 passed, 0 failed, 0 skipped**. Corrieron `NovedadesBuscador`, `NovedadesPage`, `NovedadesTabs`, `RechazosSlaModule`, `novedades-pestana-por-url`, `rechazos-sla-busqueda-sql-real` (6), `rechazos-sla-tienda-action` (7), `orden-repository.rechazos-sla` (5) y `rechazos-sla-tienda-service` (14).
- No se pasó `vitest related` sobre `OrdenRepository.ts`/`IOrdenRepository.ts`: arrastra casi toda la suite, que este encargo prohíbe. Sus dobles en otros tests compilan (typecheck verde), porque los parámetros nuevos son opcionales.

Veredicto: T4 hecho. R953-R957 en su parte de servidor quedan en verde contra Postgres real, y las dos mutaciones del `WHERE` están muertas.
