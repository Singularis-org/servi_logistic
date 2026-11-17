# SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» — implementación

## Tandas

- 2026-11-17 · backend_dev · T4 (Rechazos, servidor): `q` en la acción, término por servicio y repositorio, `rechazoSlaWhere` con `criterioBusqueda` en AND; integración SQL real con las dos mutaciones muertas.
- 2026-11-17 · frontend_dev · T1-T3 (filtros a 44 px en barras con `escaneo` por contexto, «Descargar» a 44 px, Recolección con `escaneo` que solo filtra): unitarios en verde y 7 tests nuevos que mueren con mutación. E2E de R945 escrito, sin correr.
- 2026-11-17 · frontend_dev · T5 (Rechazos, pantalla): el `BuscadorFiltros` con `escaneo` en «Devolución a origen por plazo vencido», con `q` en cada petición de página y el «sin coincidencias». 8 tests nuevos y 3 mutaciones muertas.
- 2026-11-17 · frontend_dev · T6 (E2E): arreglado el locator del E2E de R945/R941 (strict mode con «Lidia Soto»). `pwa-mensajero-recoger-recoleccion.spec.ts` con `--retries=0 --repeat-each=3`: 24 passed.

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

## Frontend Recolección/filtros (frontend_dev, 2026-11-17)

Tasks: T1, T2 y T3 hechas. T6: el E2E de R945 está escrito, pero no se ha corrido (sin build, como pidió el leader). Rechazos (T5) queda fuera de esta tanda.

### Archivos
Producción:
- `components/shared/alto-controles-barra.ts` (nuevo): el contexto de D1. Por defecto vale `""`; la barra con `escaneo` lo pone a `max-md:h-11`.
- `components/shared/BuscadorFiltros.tsx`: con `escaneo`, envuelve sus `children` en el contexto.
- `components/shared/FilterComponent.tsx`: texto, casilla, pastillas y `Select` (vía `className`) añaden el alto del contexto.
- `components/shared/MultiSelectFilter.tsx`, `components/shared/DateRangeFilter.tsx`: el disparador añade el alto del contexto. En móvil, la X del rango se centra en 44 px (`max-md:bottom-2.5`).
- `components/shared/DescargarDatasetButton.tsx`: `max-md:h-11` en el disparador (D5). El selector de columnas no se toca.
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`: `escaneo` en «Buscar guías». Solo filtra (D2).

Tests:
- `tests/unit/components/filtros-barra-escaneo.test.tsx` (nuevo)
- `tests/components/RecoleccionModule.test.tsx` (bloque SLT-194)
- `tests/components/DescargarDataset.test.tsx` (bloque SLT-194)
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` (Recolección en `CON_ESCANEO`)
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (test «SLT-194 Recolección a 360 px»; escrito, sin correr)

### Mapa R → test
| R | Test |
| --- | --- |
| R940 | `tests/components/RecoleccionModule.test.tsx` «R940: campo de 44 px…»; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` |
| R941 | `tests/components/RecoleccionModule.test.tsx` «R941: una URL de paquete + Enter…» (E2E también lo cubre) |
| R942 | `tests/components/RecoleccionModule.test.tsx` «R942: la cámara del buscador lee una guía…» |
| R943 | `tests/components/RecoleccionModule.test.tsx` «R943: dos accesos distintos…» |
| R944 | `tests/components/RecoleccionModule.test.tsx` «R944: bloqueado…» |
| R945 | `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` «SLT-194 Recolección a 360 px…» (escrito, SIN correr: lo corre el leader) |
| R946 | `tests/unit/components/filtros-barra-escaneo.test.tsx` «R946…» |
| R947 | `tests/components/DescargarDataset.test.tsx` «R947…» |
| R948 | `tests/unit/components/filtros-barra-escaneo.test.tsx` «R948…» (barra sin `escaneo` y suelto); `tests/unit/components/filter-component.test.tsx` sin tocar |

### Mutaciones (los tests nuevos ven el cambio)
Se aplicaron tres mutaciones a la vez y luego se restauraron los archivos desde copia:
- valor del contexto a `""`;
- `escaneo={false}` en Recolección;
- sin `max-md:h-11` en «Descargar».

Resultado: `Test Files 3 failed (3)`, `Tests 7 failed | 85 passed (92)`. Fallan los 7 nuevos: R940-R944, R946 y R947.

### Salidas
Todo con `NODE_OPTIONS=--max-old-space-size=8192`, y vitest con la desechable `servi_slt194_desechable`.
- `pnpm typecheck` → `tsc --noEmit`, exit 0.
- `pnpm lint` → `✖ 1 problem (0 errors, 1 warning)`, exit 0. El aviso, `OrdenHistorialOrigenTipo` sin usar en `lib/interfaces/repositories/IOrdenRepository.ts`, está en un archivo del backend_dev, no en uno de esta tanda.
- `vitest run` de los 4 archivos de test tocados → `Test Files 4 passed (4)`, `Tests 105 passed (105)`.
- `vitest related --run` (componentes tocados + tests que importan `RecoleccionModule`): `vitest related` arrastró 408 archivos, casi la suite entera, porque `FilterComponent`/`BuscadorFiltros` están en todo. Salida: `Test Files 12 failed | 395 passed (408)`, `Tests 69 failed | 5735 passed | 17 skipped (5829)`, exit 1. Lo que falló no es de esta tanda:
    - **10 de integración DB** (wallet, libro de caja y cierres: `libro-caja-*`, `wallet-*`, `ajuste-caja-anulacion-461`). Los errores son de dominio: «referencia a otra empresa: …», `sin_saldo` en el escenario 459, `AppErrorCode INTERNAL` y caída de worker. Ninguno monta UI. Corrieron en la misma desechable que el backend_dev y no los he investigado: los mira el leader.
    - **2 de componente** (`DetalleMensajeroPanel`, `TableroOperativo`): `Test timed out in 20000ms` con la carga de toda la suite. Corridos solos: `Test Files 2 passed (2)`, `Tests 78 passed (78)`.
  - Nota: a través del envoltorio de la desechable (cmd.exe), la ruta con `(app)` rompe el comando. Por eso los tests que importan `RecoleccionModule.tsx` se pasan explícitos.

### Veredicto
Recolección con escaneo (solo filtra) y filtros + «Descargar» a 44 px solo en móvil: hechos y en verde. Falta R945 en E2E (escrito, sin correr).

## Frontend Rechazos (frontend_dev, 2026-11-17)

T5 hecha. No hay E2E nuevo: el spec no le asigna ninguno a R949-R957. En T6 quedan los E2E existentes de `/novedades`, que corre el leader.

### Archivos
- `app/(app)/novedades/_components/RechazosSlaModule.tsx`: monta `BuscadorFiltros` con estas props, sin filtros y con `leerDeUrl={false}` (D4):
  - `escaneo`;
  - `minChars={BUSQUEDA_MIN_CHARS}` y `maxLength={BUSQUEDA_MAX_CHARS}`, para que el cliente no mande un `q` que la acción rechace;
  - el placeholder de `/ordenes`.

  Comportamiento:
  - Guarda el término y lo pasa como `q` en cada petición de página. Sin término, la petición es `{ page }` sin la clave.
  - Un término nuevo, o el campo vacío, pide la página 1.
  - Solo cuenta la respuesta de la última petición (`useRef`).
  - Con término y sin resultados: `SIN_COINCIDENCIAS_TITULO` + `LIMPIAR_BUSQUEDA`, ambos de `NovedadesModule`. Limpiar remonta la barra por `key`, como `NovedadesFiltrosBarra`.
  - Sin término y sin rechazos: el vacío de hoy, sin barra.
- `tests/components/RechazosSlaModule.test.tsx`: bloque SLT-194 con mocks de `next/navigation` y `QrScanner`. Los tests existentes no se tocaron.
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`: `RechazosSlaModule.tsx` añadido a `CON_ESCANEO`.

### Mapa R → test (parte de pantalla)
| R | Test |
| --- | --- |
| R949 | `RechazosSlaModule.test.tsx` «R949: buscador con su nombre…» y «R949: el mínimo es de 3 caracteres…»; guardia `buscadores-con-escaneo` |
| R950 | `RechazosSlaModule.test.tsx` «R950: escribir 91024 + Enter…» y «R950: la cámara del buscador…» |
| R951 | `RechazosSlaModule.test.tsx` «R951: con término, «Página siguiente» lo lleva; la X…» |
| R952 | `RechazosSlaModule.test.tsx` «R952: con término y sin coincidencias…» y «R952: sin término y sin rechazos…» |
| R957 (cliente) | `RechazosSlaModule.test.tsx` «R957: al montar no se pide nada»; `NovedadesTabs.test.tsx` y `NovedadesPage.test.tsx` en verde |

### Mutaciones (una por vez, restauradas desde copia; `cmp` OK)
1. Petición siempre `{ page }` sin `q` → 3 failed (los dos R950 y el R951).
2. Vacío de hoy también con término → 1 failed (R952).
3. `escaneo={false}` → 2 failed (R949 y R950 cámara).
   - La guardia no lo detecta: su detector cuenta `escaneo={false}` como si pasara `escaneo`. Es una limitación previa de la guardia y no la he cambiado.

### Salidas
- vitest, solo con los archivos concretos y la desechable (`RechazosSlaModule.test.tsx`, guardia, `NovedadesTabs.test.tsx`, `NovedadesPage.test.tsx`): `Test Files 4 passed (4)`, `Tests 57 passed (57)`.
- `pnpm typecheck`: TC_EXIT=0.
- `pnpm lint`: `✖ 248 problems (0 errors, 248 warnings)`, LINT_EXIT=0.
  - En la tanda 1 eran 1 warning. Los nuevos son 246 `no-unused-vars` en archivos que no toqué (analítica, repositorios, jobs, tests de analítica…). No los he investigado; para el leader.
  - `eslint` sobre mis 3 archivos: «No issues found».

### Veredicto
Rechazos busca escaneando en servidor (`q`), con paginación y «sin coincidencias». R949-R952 y la parte de cliente de R957 en verde.

## E2E de Recolección (frontend_dev, 2026-11-17)

- **Rojo del leader** sobre 9c84b826, con build en `servi_slt194e_desechable`: 12 passed, 1 failed.
  - Falló «SLT-194 Recolección a 360 px…» en :478 por un `strict mode violation`: la card pinta «Lidia Soto» dos veces (cabecera `<p>` y detalle `<dd>`).
  - Era un fallo del test, no de la app.
- **Arreglo:** en vez de `getByText`, el test comprueba la TARJETA. `seccionPor.locator("article")` debe tener 1 elemento, ser visible y contener «Lidia Soto».
  - El `toHaveCount(0)` de «Mario Brenes» se queda.
  - Los demás `getByText` del test son textos únicos: el conteo `role="status"` y el valor del campo.
- **Evidencia**, sin rehacer el build: `con-desechable.cjs … servi_slt194e_desechable -- pnpm exec playwright test e2e/pwa-mensajero-recoger-recoleccion.spec.ts --retries=0 --repeat-each=3 --reporter=line` → `24 passed (1.3m)`, exit 0 (8 tests × 3, sin flaky).
- **T6** queda marcada:
  - R945 en verde a 360 px.
  - Los E2E de `/novedades` y de B1-B8 los corrió el leader sobre 9c84b826 y salieron verdes; el único rojo era este.
  - El gate (T8) lo corre el leader.
