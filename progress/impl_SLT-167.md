# impl SLT-167 «Recepción: destinatario y tienda en la respuesta»

Ruta ligera, backend. Spec: `specs/SLT-167-recepcion-destinatario-tienda/requirements.md` (R710-R716).

## Archivos

Producción (11):
- `lib/interfaces/repositories/IOrdenRepository.ts` — tipo `ResumenRecepcion` y `resumenRecepcion(ordenId)`.
- `lib/repositories/OrdenRepository.ts` — `resumenRecepcion`: SQL a mano, solo `orden.destinatario` y
  `usuario.nombre` de la tienda, con `organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')`
  escrito (segunda barrera además de la RLS de la envoltura; mismo criterio que
  `CierresBodegaAdminRepository.idsRecibidosIncompletos`). Decisión: SQL a mano en vez de `findFirst`
  por la extensión, porque así el acotado queda escrito y lo mide el test de Postgres real como dueño
  (sin RLS); con `findFirst` la mutación de R714 no tendría dónde hacerse.
- `lib/interfaces/services/IRecepcion{BodegaCentral,Origen,Satelite}Service.ts` y
  `lib/types/recepcion-{bodega-central,origen,satelite}.ts` — `resumen?: ResumenRecepcion` en `ok` y `ya_recibida`.
- `lib/services/Recepcion{BodegaCentral,Origen,Satelite}Service.ts` — `"resumenRecepcion"` en el `Pick` y
  `conResumen(ordenId)` privado, llamado solo al devolver `ok`/`ya_recibida` (también tras la carrera);
  `null` o excepción -> sin `resumen` (R715). Las acciones no cambian.

Tests (8):
- `tests/integration/db/recepcion-resumen-sql-real.test.ts` (nuevo, Postgres real).
- `tests/unit/services/recepcion-resumen.test.ts` (nuevo).
- Dobles con `resumenRecepcion` (sin tocar aserciones): `recepcion-bodega-central-service.test.ts`,
  `recepcion-origen-service.test.ts`, `recepcion-satelite-service.test.ts` (devuelven `null`), y los
  dobles COMPLETOS de `IOrdenRepository` que el typecheck exigía: `rol-admin-satelite-authz.test.ts`,
  `bulk-orden-service.test.ts`, `bulk-orden-service.carga-api.test.ts`, `orden-service.test.ts`.
  Los tres últimos no estaban en «Archivos esperados»: +3 sobre la estimación (20 archivos, tope 40).

## Mapa R -> test

| R | Test |
| --- | --- |
| R710 | `tests/unit/services/recepcion-resumen.test.ts` — «R710: `ok` trae el resumen literal…» ×3 servicios; «las tres acciones reenvian el resumen» (bodega central, satélite con `ok`). |
| R711 | `recepcion-resumen.test.ts` — «R711: `ya_recibida` por la guarda…» y «…tras perder la carrera…» ×3; acción de origen con `ya_recibida`. |
| R712 | `recepcion-resumen.test.ts` — «R712: $caso no trae resumen y no lo lee»: forbidden, no_encontrada (guía 7777777), estado_invalido, conflict ×3; tienda_ajena (origen); zona_ajena y sin_zona (satélite). |
| R713 | `recepcion-resumen.test.ts` — «R713: exactamente las claves…» ×3; `tests/integration/db/recepcion-resumen-sql-real.test.ts` — claves `["destinatario","tienda"]` y el JSON sin el teléfono ni la dirección sembrados. |
| R714 | `tests/integration/db/recepcion-resumen-sql-real.test.ts` — dos empresas; A ve lo suyo (control positivo), la orden de B y el id `…dead` dan `null`. |
| R715 | `recepcion-resumen.test.ts` — «R715: …null…», «…falla…» (`ok`, una sola escritura) y «`ya_recibida` con lectura null o caida» ×3. |
| R716 | `recepcion-{bodega-central,origen,satelite}-service.test.ts`, `rol-admin-satelite-authz.test.ts`, `tests/unit/actions/recepcion-*-action.test.ts` verdes sin cambiar aserciones. |

## Mutación de R714

Base: `servi_slt167_desechable` (local, migrada), vía el envoltorio del leader; sin leer `.env`.

- Sin mutar: `recepcion-resumen-sql-real.test.ts` -> `Test Files 1 passed (1) / Tests 1 passed (1)` (no
  saltado). Control positivo: la orden de A devuelve `{ destinatario: "Ana Quesada Mora", tienda: "Tienda
  Prueba Norte" }` y la siembra se comprueba como dueño antes de leer.
- Mutación: borrada la línea `AND o."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')`
  de `OrdenRepository.resumenRecepcion` -> `Tests 1 failed (1)`, `AssertionError: expected { …(2) } to be null`
  en `recepcion-resumen-sql-real.test.ts:145` (`expect(r.deB).toBeNull()`: sin el filtro, A lee la orden de B).
- Restaurado con `git checkout -- lib/repositories/OrdenRepository.ts` -> de nuevo `1 passed`.
- Se hizo dos veces: tras T1 y sobre el código final (T3). Ojo: la primera vez el `git checkout --`
  también se llevó T1 sin commitear y hubo que reaplicarlo; la segunda se hizo con todo commiteado.

## Salidas

- Typecheck `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` -> exit 0 (tras T1, T2 y T3).
- Lint de los archivos tocados (`pnpm exec eslint <archivos>`) -> 0 errores; 1 warning PREEXISTENTE en
  `IOrdenRepository.ts:11` (`OrdenHistorialOrigenTipo` sin usar; está igual en `HEAD` antes del cambio).
- `vitest run` de lo tocado (con la desechable): `recepcion-resumen.test.ts` 39/39;
  `recepcion-{bodega-central,origen,satelite}-service`, `rol-admin-satelite-authz`, `bulk-orden-service`,
  `bulk-orden-service.carga-api`, `orden-service`, `tests/unit/actions/recepcion-*` -> `10 files, 263 tests passed`;
  tras el arreglo de T3: `devolucion-rechazadas-flow` + integración + los de R716 -> `10 files, 164 tests passed`.
- `vitest related --run` de los servicios y el repositorio (T3): arrastra 734 archivos (casi la suite, por
  `OrdenRepository`). Resultado: `142 failed | 592 passed`. Uno era mío y está arreglado:
  `tests/integration/db/devolucion-rechazadas-flow.test.ts` (su doble de `$queryRaw` responde `[{ tope: 3 }]`
  a cualquier SQL y el resumen salía con campos `undefined`; ahora `resumenRecepcion` devuelve `null` si la
  fila no trae las dos claves como texto). Los otros 141 son precondiciones de la base desechable, no del
  cambio: «tabla `orden` vacía», «el catálogo local no tiene el estatus ayuda_tienda», «faltan catálogos:
  vehiculo», catálogos de wallet, etc. Los 4 de ellos que importan servicios de recepción
  (`454/senales-gestion-lectores-sql-real`, `455/caracterizacion/filtro-satelite-por-codigo`, `demo-qa`,
  `satelite-bodega-alcance-real`) se re-corrieron: fallan por esas mismas precondiciones.

## Abierto

- **T4 / `./init.sh`**: no corrido. Su `vitest related` arrastra ~734 archivos (~14 min) y contra la
  desechable hay 141 rojos de precondición (base sin seed completo). Necesita una base con seed completo
  o el CI; lo decide el leader.
- `tasks.md` de SLT-159 «Escaneo continuo en recepciones y recogidas»: anotar que R614 se cumple con R710-R716 (lo pide el spec al leader).

## Veredicto

R710-R716 implementados y con test; integración contra Postgres real verde y la mutación de R714 la pone roja; falta el gate `./init.sh` con base sembrada.
