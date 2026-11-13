# Review SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación»

- Rama: `feature/SLT-125-geo-jerarquica-exportes`, en `f798ff55`.
- Diff contra `origin/feature/SLT-47-geo-jerarquica-presentacion`: 142 archivos, +12.445/−427.
- Ruta completa (zona fullstack, complejidad high). Fecha: 2026-11-13.

## Veredicto: **RECHAZADO** (un bloqueante, solo de documentación)

El código, los tests y las guardias cumplen el spec. Costa Rica descarga, geocodifica y envía igual
que hoy, y cada aserción existente que cambia está autorizada. Hay un solo bloqueante: B1. Lo pide
el propio `tasks.md > T5.3` como condición del OK, y se arregla con un párrafo en
`docs/architecture.md`, sin tocar código. Con B1 resuelto, el veredicto pasa a **OK con menores**.
T5.1 (R35) sigue abierta a propósito: la corre una persona sobre la copia de producción, y hay que
hacerla antes del merge.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1–R44 → test concreto | OK. Ver «Trazabilidad». Existen los 27 archivos de test que nombra `requirements.md`, y cada uno tiene casos que afirman lo que pide su R. R27, R39 y R44 se verifican por diff, y R35 y R36 por anotación, como dice el spec |
| 2 | Tasks `[x]` | OK hasta T4.1. T5.1 (persona, R35), T5.2 (CI, la marca el leader) y T5.3 (esta review) siguen abiertas por diseño |
| 2b | Tamaño del PR | AVISO aceptado. `tamano-pr.mjs` da 667 archivos y 81.486 líneas contra `dev`, con toda la pila geo. Lo acepta la marca `tamano-pr-aceptado` de `progress/features/SLT-125.md` (~140; el diff contra la base tiene 142). `scripts/tamano-pr.mjs` no está en el worktree: lo corrí desde la raíz |
| 3 | `design.md > ## Lo que ya existe` | OK: está y no está vacía. El diff reutiliza `rutaDelLugar`, `lugarDeLaOrden`, `cabeceraDeNivel` y el catálogo en memoria. `cabeceraNormalizada` se exporta de `plantilla-geo.ts` en vez de copiarse. No re-crea nada de la lista |
| 3 | CHECKPOINTS / checkpoints-proyecto | OK salvo B1. No hay tablas ni migraciones nuevas, no hay RLS que tocar, y no hay secretos ni recursos de Ordenex. El snapshot leído se valida con zod (`ubicacionSnapshotV1Schema`) |
| 4 | Typecheck | OK: `pnpm run typecheck` (`tsc --noEmit`) sin errores |
| 4 | Lint | OK: `eslint` sobre los `.ts/.tsx` añadidos o cambiados da 0 errores y 7 avisos (`_args` sin usar en tests) |
| 4 | Tests | OK: `vitest run` de `tests/unit` y `tests/components` enteros, guardias incluidas, sale con código 0. La integración contra Postgres y el E2E no los corrí: son del CI |
| 4 | CI | OK según el leader y `progress/features/SLT-125.md`: run `43515960277`, `gate-completo` 9/9, con `geo-presentacion-4-niveles` en `reparto` y los E2E de CR sin cambios. No lo reproduje |
| 5 | Literales de país o moneda en código nuevo | OK: «Costa Rica» solo sale en comentarios. Se **retira** la constante `PAIS = "Costa Rica"` de `lib/geo/direccion-query.ts`. La guardia `etiquetas-geograficas-sin-literal` está en verde, ampliada a los 63 archivos de la feature |
| 5 | Dependencias nuevas | Ninguna: `package.json` solo suma los scripts `geo:equivalencia-presentacion` y `descargas:comparar` |
| 5 | Migraciones / `db/` (R27, R39) | Diff de `db/` vacío. No hay triggers |
| 5 | Comentarios explican el porqué | OK |

## Lo que pidió el leader

### 1. Trazabilidad
Ver la tabla del final. Todos los tests citados existen y tienen casos reales: van de 2 a 24 por
archivo, el E2E tiene 3 pasos.

### 2. R38: aserciones existentes que cambian
Comparé cada línea `-` de los 35 archivos de `tests/` que ya existían en la base
(`git cat-file -e`). Las únicas aserciones que cambian son las autorizadas:

| Decisión | Archivo y cambio |
|---|---|
| A3 | `plantilla-datos.test.ts:235–237`: 42 → 53 y 37 → 48 |
| A3b | `plantilla-datos.test.ts:40`: excluye `nivel_4…nivel_10`. `:248` no hizo falta cambiarlo, así que hay menos cambio que el autorizado |
| A8 | `orden-repository.novedades.test.ts:435–437`: el `select` pierde las 3 relaciones |
| A9 | `cierre-dia-repository.test.ts:2049` y `cierre-detail-congelado.test.ts:688`: suman `ubicacionSnapshot` |
| A10 | `informe-transito-seleccion.test.ts`: suma `ruta` y `niveles`. `geo-transito-nombres.test.ts:206/210`: `sinRutaNiNiveles` |
| A11 | `satelite-proyeccion-compartida.guardia:131`, `orden-repository-list-items-by-ids:115` y `orden-repository.recepcion-satelite:189` (`lugarRuta`) |
| A12 | `geo-lecturas-catalogo.test.ts:454` y `slt89-equivalencia-cr.test.ts:98`: `ruta: undefined` |
| A13 | `cobertura.composition-root.test.ts`: la ruta exacta San José → Escazú → San Rafael |
| T3.6 | Dos recortes en las guardias (ver el punto 6) |

- **Solo cambia la entrada**, sin tocar lo que se espera:
  - las filas simuladas pasan de las relaciones a `cantonId`/`distritoId` más un catálogo con los mismos nombres: `orden-repository`, `.guia`, `orden-envio-reader`, `cierre-detalle-causa-monto`, `cierre-pagos-lectura`, `cierre-dia-repository` y `preview-mismo-motor`;
  - la geocodificación (A7) recibe `{ruta, paisNombre}`: `direccion-query`, `geocodificacion-*` e `integraciones-consumidores-composition-root`;
  - `FilaTransito` lleva `ruta` y `niveles` en `informe-transito-*`, `informe-transito-pdf` e `informe-transito-actions`.
- **Decisiones del leader:** el `default` de `cobertura-vs-resolve-geo` y el emparejamiento de `geo-equivalencia-dinero`.
- **Sin cambio:** A1 (`geo-backfill.test.ts`) y A2 (`geo-sincronia-orden-zonas.test.ts`) no aparecen en el diff.
- **Fixtures:** `doble-catalogo-geografico.ts` (A9, ahora devuelve tipo y cadena), `plantilla-datos.ts` (`lugarRuta: null`) y `fabricas/e2e.ts` (`paisId` opcional). Ninguna salida esperada cambia.

**No hay ningún cambio de aserción fuera de la lista autorizada.**

### 3. Costa Rica igual que hoy
- **Descargas (columnas y orden):**
  - `equivalencia-descargas-cr.test.ts` exige el CSV byte a byte y, del XLSX, las mismas cabeceras y celdas de las 7 descargas;
  - lo compara contra `tests/fixtures/descargas-cr/referencia.json`, capturada en `12316009`, antes del primer commit de código (`f0793dc4`);
  - `94f44972` solo cambia `estatusValue` en `entrada.ts`, un campo que no sale en ninguna descarga, y la referencia no se regeneró;
  - las claves internas de los niveles 1–3 siguen siendo `provincia`, `canton` y `distrito` (R3).
- **Geocodificación:**
  - en CR, `construirQueryDireccion` arma la dirección, la ruta invertida y el `pais.nombre`, que la migración `20261026130000_pais` siembra como «Costa Rica». Es la misma cadena que antes;
  - `direccion-query.test.ts` fija la cadena y la huella SHA-256 literales, con distrito y sin él;
  - `geo-125-geocode-cache.test.ts` siembra `GeocodeCache` con la huella de hoy y comprueba que el proveedor no recibe llamadas.
- **WhatsApp:**
  - `{{provincia}}`, `{{canton}}` y `{{distrito}}` leen `nombreDelNivel(orden, k, deHoy)`: con ruta, el nivel k; sin ruta, el nombre de hoy;
  - el envío (`OrdenEnvioReader`) y el dispositivo (`datosPlantillaDesdeAsignacion`) pasan los dos `lugarRuta`;
  - `preview-mismo-motor` sigue afirmando lo mismo;
  - las tres claves siguen ocultas en el selector, y el picker solo suma `nivel_1..P` y `{{ubicacion}}`.
- **P7:**
  - `dosMasHondos` toma los pasos por **nivel**: D−1 y D, con D = min(P, 3). Una orden de CR sin distrito da `{arriba: cantón, abajo: null}`;
  - `pos-satelite-chat-niveles.test.tsx:199` («orden sin distrito: las tarjetas y el chat enseñan solo el cantón») lo comprueba en el mosaico, el detalle, la navegación, el satélite y el chat;
  - el PDF de tránsito lo hace igual (`lugarDelPaquete`).

### 4. `ubicacion_snapshot`
- **Escritura:**
  - `congeladoDeLaFila` añade `ubicacionSnapshot: {v:1, niveles: rutaConTipos(...)}` con el catálogo de la misma transacción que da los 3 nombres;
  - las 3 columnas se siguen escribiendo;
  - una ruta vacía, o un nivel sin tipo, lanza un error y revierte el cierre (R23, R18).
- **Forma:** `{v, niveles:[{profundidad, tipo, nombre, id}]}`, de la raíz a la hoja, como SLT-43 §2.6 y el `UPDATE` de `scripts/geo-backfill-nodo.ts`. `geo-125-cierre-snapshot.test.ts` (R22) comprueba que el snapshot de la app es igual al de `geo:backfill` para la misma fila.
- **Lectura:**
  - `leerUbicacionCongelada` valida con zod;
  - con un snapshot v1 válido, usa `niveles[].nombre` y admite un `id` nulo;
  - sin snapshot, o con uno inválido, usa las 3 columnas, sin las vacías;
  - la usan `toPendienteRowDesdeSnapshot` y `toGestionDescargaDTO` de `CierresAdminRepository`;
  - los 3 campos de nombre del DTO siguen saliendo de las columnas (R37).

### 5. Arquitectura
- **Nombres del catálogo, sin una consulta por fila:**
  - `deLaEmpresa()` se llama una vez por instancia, y no se llama si no hay filas;
  - `ruta-sin-consulta-por-fila.test.ts` cuenta las consultas con 1 fila y con 50 en cada superficie de §4.2.
- **Sin CTE recursiva y sin leer `nodo_geografico_id`:** las dos guardias se amplían a los 63 archivos de la feature. La lista `tests/fixtures/archivos-slt125.ts` coincide exactamente con `git diff --name-only … -- app lib components hooks`: lo comprobé con `diff`.
- **Sin migraciones ni dependencias nuevas.**

### 6. Las dos exenciones de las guardias
- **`etiquetas-geograficas-sin-literal`:**
  - exime solo las entradas `definir({ clave: "provincia" | "canton" | "distrito" … })` de `lib/types/plantilla-datos.ts`;
  - la guardia comprueba que existen, que llevan su literal y que siguen en `CLAVES_OCULTAS_EN_SELECTOR`;
  - `sinEntradasDelCatalogo` lanza un error si una de esas entradas falta;
  - una contraprueba demuestra que un literal en otra entrada se sigue detectando.
- **`geografia-lecturas-sin-nodo-fk`:**
  - exime solo `export interface CreateOrdenData {` y `CorregirDatosClienteData {` de `IOrdenRepository.ts`;
  - la guardia comprueba que existen y que nombran el nodo; si dejan de nombrarlo, la exención sobra;
  - `sinDeclaraciones` lanza un error si falta la cabecera;
  - una contraprueba demuestra que una mención en otro tipo del mismo archivo (`OrdenListItem`) se sigue detectando.
- No eximen nada más.

## Hallazgos

### BLOQUEANTE

- **B1 · `docs/architecture.md` no está al día (`tasks.md > T5.3`, «Archivos esperados»).**
  - `tasks.md:186` pide que la review compruebe que `docs/architecture.md` está al día: el snapshot lo escribe la app y las lecturas de presentación salen del catálogo. `tasks.md:280` lista ese archivo entre los esperados. El diff no toca `docs/`.
  - Hoy `docs/architecture.md:170` dice que `cierre_detail.ubicacion_snapshot` «las llena `pnpm geo:backfill`», sin decir que los cierres nuevos ya lo escriben en su transacción.
  - Tampoco dice que los cierres admin y su descarga lo leen, y que caen a las 3 columnas si falta.
  - El bloque «Lecturas sobre el árbol» (`:177–192`) no nombra las lecturas de presentación que ahora salen de la ruta del catálogo:
    - el listado, la etiqueta, el satélite y las novedades en `OrdenRepository`;
    - `GestionOrdenRepository`, `CierreDiaRepository` (vista en vivo) y `OrdenEnvioReader`;
    - `OrdenGeocodeRepository`, con el país de la empresa;
    - las columnas por nivel en `lib/utils/ubicacion-presentacion.ts`.
  - **Falta:** un párrafo «Presentación sobre el árbol (SLT-125)» con:
    - el núcleo puro y su regla de separador y orden por superficie;
    - quién escribe y quién lee `ubicacion_snapshot`, con su vuelta a las 3 columnas;
    - la consulta de geocodificación (ruta invertida y `pais.nombre`), que en CR conserva la huella de `GeocodeCache`;
    - que la ruta de una orden llega como mucho al nivel 3 hasta SLT-48 «Geografía jerárquica: retirar modelo viejo».
  - Sin cambios de código.

### menor

- **M1 · R35 (T5.1) pendiente.** Una persona tiene que correr `pnpm geo:equivalencia-presentacion` sobre la copia de producción. También tiene que comparar las 7 descargas de `dev` y de esta rama con `scripts/comparar-descargas.ts`, y anotar las cifras en `progress/impl_SLT-125.md`. Es por diseño y no bloquea esta review, pero sí el merge.
- **M2 · Falta el mapa `R<n> → test` consolidado en `progress/impl_SLT-125.md`.**
  - Hoy está repartido por tandas, y la sección «Mapa» dice «parcial, T1».
  - R27, R35, R39 y R44 no aparecen en la bitácora.
  - `CHECKPOINTS.md > Trazabilidad` y `tasks.md > T5.2` piden el mapa completo. La tabla de abajo puede copiarse allí.
- **M3 · `preview-mismo-motor.test.ts` cambia su entrada.** R31 lo cita «sin cambios», pero cambia: la fila simulada pasa a las FK y suma el catálogo del doble con los mismos nombres. No cambia ninguna aserción, y el test sigue exigiendo el mismo texto por los dos caminos. Basta anotarlo.
- **M4 · Una carga del catálogo por job.**
  - Los jobs de geocodificación (`OrdenGeocodeRepository`, uno por job desde `geocodificacion-handler.ts:107`) y de envío de WhatsApp (`OrdenEnvioReader`) cargan ahora el catálogo entero del país.
  - Eso son varias consultas, donde antes había un solo `findFirst` con joins.
  - Cumple R20, porque no hay una consulta por fila. Pero con la cola llena es más carga por job.
  - En CR son unos cientos de nodos y no preocupa. Habría que medirlo en la copia (T5.1) si la cola de geocodificación es grande.
- **M5 · Lo que no verifiqué yo.**
  - Ni la integración contra Postgres ni el E2E: los cubre el CI `43515960277`, que no reproduje.
  - Tampoco comparé lo implementado con la maqueta píxel a píxel: R36 está anotado en `impl_SLT-125.md` (aprobada el 2026-11-12, con referencia), y los tests de componente siguen sus textos.
  - El MCP del grafo no lo usé: revisé por diff, Grep y Read.

## Trazabilidad (R → test que lo prueba de verdad)

| R | Test |
|---|---|
| R1–R3 | `tests/unit/descarga/geo-columnas-n-niveles.test.ts` (2, 3, 4 y 10 niveles; choques «Zona» y homónimos; claves internas) |
| R4, R10, R26 | `tests/unit/descarga/equivalencia-descargas-cr.test.ts` contra `tests/fixtures/descargas-cr/referencia.json` (capturada antes del código) |
| R5 | `tests/unit/components/ordenes-columns-niveles.test.tsx` |
| R6 | `tests/unit/descarga/cobertura-n-niveles.test.ts` (2 y 4 niveles; `nivel_<k>_retirado`) |
| R7, R8 | `tests/unit/utils/ubicacion-presentacion.test.ts`, `tests/unit/descarga/ubicacion-n-niveles.test.ts`, `tests/components/ubicacion-pantallas-n-niveles.test.tsx` |
| R9 | `tests/unit/pdf/etiqueta-geografia-n-niveles.test.ts`, `tests/components/paquete-ubicacion.test.tsx` |
| R11, R15, P7 | `tests/components/pos-satelite-chat-niveles.test.tsx` (`:199`, CR sin distrito) |
| R12 | `tests/components/AsignacionDetalle-niveles.test.tsx` |
| R13 | `tests/unit/whatsapp-envios/transito-pdf-niveles.test.ts` |
| R14 | `tests/unit/mis-asignaciones/pos-format-destino.test.ts` |
| R16–R18, R40, R41 | `tests/integration/db/geo-125-nombres-catalogo.test.ts` (CR frente a las tablas viejas, XA, otro país, plataforma, lugar fuera del catálogo, adminTienda y adminSatelite); guardia `presentacion-lugar-del-catalogo` |
| R18 (cierre), R21–R23 | `tests/integration/db/geo-125-cierre-snapshot.test.ts` |
| R19 | Guardias `geografia-sin-cte-recursiva` y `geografia-lecturas-sin-nodo-fk`, ampliadas a `ARCHIVOS_SLT125` |
| R20 | `tests/unit/repositories/ruta-sin-consulta-por-fila.test.ts` (1 frente a 50 filas) |
| R24, R25 | `tests/unit/types/ubicacion-snapshot.test.ts`, `tests/unit/descarga/cierres-snapshot-lectura.test.ts` |
| R27 | `geo-backfill.test.ts` R40 sin cambios; diff de `db/` vacío |
| R28, R29, R31 | `tests/unit/whatsapp/plantilla-niveles.test.ts`; `plantilla-datos.test.ts` (A3, A3b); `preview-mismo-motor.test.ts` |
| R30 | `tests/unit/plantillas/CampoVariablePicker-niveles.test.tsx`; `CampoVariablePicker.test.tsx` sin editar (A4) |
| R32, R33 | `tests/unit/geo/direccion-query.test.ts` (2, 4 y 10 niveles; cadena y huella literales de CR); `tests/integration/db/geo-125-geocode-cache.test.ts` |
| R34 | `tests/integration/db/geo-equivalencia-presentacion.test.ts` (`25006`, salida sin datos del fixture, URL no local sale con 2) |
| R35 | Pendiente (M1) |
| R36 | `impl_SLT-125.md > Maqueta (T0, R36)`: aprobada el 2026-11-12, referencia `maqueta-SLT-125.html` |
| R37 | Suites de la API sin cambios; `nombresDeLaRuta` conserva la forma de los DTO |
| R38 | CI `43515960277` y la revisión del diff de `tests/` de arriba |
| R39, R44 | Diff: nada en `db/`, nada de filtros (SLT-47) ni de SLT-48, ni superficies de la deuda P6 |
| R42 | `etiquetas-geograficas-sin-literal.guardia.test.ts`, ampliada y con su única exención T3.6 |
| R43 | `e2e/geo-presentacion-4-niveles.spec.ts` (4 cabeceras con la cuarta vacía; etiqueta con 3 niveles; cierre y snapshot con 3 niveles y tipos de XA) |

## Lo que no corrí

- La integración contra Postgres y el E2E: los cubre el CI.
- `./init.sh`: corrí por separado typecheck, lint y `tests/unit` + `tests/components` enteros.
