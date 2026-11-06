# SLT-45 — geo-jerarquica-entrada · tasks.md

> Orden de trabajo. `[P]` = paralelizable con las otras `[P]` de su bloque una vez cumplidas sus
> dependencias. Cada task cierra con `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde, y un commit propio
> (`feat(SLT-45): …` / `test(SLT-45): …`). Referencias a `design.md` como §n.
>
> Regla de oro de esta ficha: **T1 va primero y sin tocar código de producción.** Graba lo que v1
> responde hoy; si se graba después de tocar algo, el contrato congelado deja de probar nada.

## T1 — Congelar v1 (antes de tocar código)

- [x] **T1.1** Anotar en `tests/fixtures/contrato-v1/BASE` el sha de la punta de la rama antes de
  cualquier cambio de código de SLT-45.
  *Hecho:* el archivo existe con un sha que `git cat-file -t` reconoce como commit.
- [x] **T1.2** Escribir `tests/fixtures/contrato-v1/payloads-sinteticos.json` (§7.2): los 11 mensajes de
  `resolveGeo` y su precedencia, acentos/mayúsculas/espacios, retirados, sin zona, zona especial, sin
  tarifa (409), lote vacío, cuerpo inválido, duplicados y tope. `payloads-reales.json` nace como `[]`.
  *Hecho:* cada mensaje de `geo-resolucion.ts` aparece en al menos un payload.
- [x] **T1.3** Suite `tests/integration/api/contrato-v1.route.test.ts` con siembra, normalización de la
  lista cerrada de volátiles y modo `CONTRATO_V1_GRABAR=1` (§7.3). Grabar `respuestas/` con el código de
  `BASE`. (R2, R9)
  *Hecho:* en modo comparación pasa en verde; borrar una respuesta grabada la pone roja.
- [x] **T1.4** Grabar `tests/fixtures/contrato-v1/openapi-v1.json` y escribir
  `tests/unit/api/openapi-v1-congelado.test.ts` (§7.4). (R1)
  *Hecho:* verde; cambiar una descripción de v1 lo pone rojo.

## T2 — Motor de N niveles (depende de T1)

- [x] **T2.1** `lib/services/geo-ubicacion.ts` (§2.2): `resolverUbicacion`, `esPaisDeTresNiveles`,
  `admiteGuardado`, `fksDeNodo`, `rutaPublica`, con los mensajes de §5. Añadirlo a la guardia de pureza
  de `geografia-dominio`.
  *Hecho:* `tests/unit/services/geo-ubicacion.test.ts` cubre ruta (vacío, no encontrado, ambiguo,
  retirado, raíz y n>1), código (0, 1, >1, retirado), regla de guardado (2, 3 y 4 niveles; profundidades
  1–4), zona (0/1/>1 heredada), FKs de profundidad 2 y 3 y `rutaPublica`, con
  `tests/fixtures/doble-catalogo-geografico.ts`. (R13–R16, R21, R25 parte pura, R33 parte pura)
- [x] **T2.2** [P] `tests/unit/services/geo-resolucion-v1-mensajes.test.ts`: tabla de los 11 mensajes de
  v1 con su clave y precedencia sobre `resolveGeo` sin cambios. (R3)
  *Hecho:* verde sin tocar `geo-resolucion.ts`.

## T3 — Escritura del nodo (depende de T2)

- [x] **T3.1** `CreateOrdenData.nodoGeograficoId` y `toCreateManyInput` (§3.2). En `BulkOrdenService`,
  `nodoGeograficoId = distritoId ?? cantonId` para la vía de `resolveGeo` y `fksDeNodo` para el motor.
  *Hecho:* typecheck verde; tests existentes de `bulk-orden-service*` y `orden-repository.carga-api`
  pasan sin cambiar aserciones.
- [x] **T3.2** `CorregirDatosClienteData.nodoGeograficoId`, puesto por `CorregirDatosClienteService` y
  escrito en el mismo `updateMany` (§3.2). (R26)
  *Hecho:* tests existentes de la corrección pasan sin cambiar aserciones.
- [x] **T3.3** `tests/integration/db/orden-nodo-escritura.test.ts`: crear (profundidad 3 por v1 y v2;
  profundidad 2 por el repositorio con el `CreateOrdenData` que arma `fksDeNodo` de un cantón, porque
  hasta SLT-46 ningún cantón tiene zona y la ruta no llega a escribir) y corregir; comprobar las 3 FK,
  `nodo_geografico_id` = nodo resuelto = `COALESCE(distrito_id, canton_id)`, y que
  `pg_get_functiondef` del trigger sigue derivando de las FK. (R25–R28)
  *Hecho:* verde contra Postgres real.

## T4 — Servicios: catálogo inyectado, v1 con forma de país, v2 (depende de T3)

- [ ] **T4.1** `ICatalogoGeograficoRepository` como último parámetro opcional de `BulkOrdenService` y
  `CotizacionOrdenService` (§2.3); cablearlo en los composition roots de `carga`, `cotizacion` y
  `carga-masiva/chunk`; test de composición.
  *Hecho:* el test de composición falla si se quita el parámetro de cualquiera de las rutas.
- [ ] **T4.2** Comprobación de forma de país en v1 (R5) y rama del motor en `resolveFila` (§2.3).
  *Hecho:* contrato de T1.3 en verde sin regrabar.
- [ ] **T4.3** `cargarViaApiV2` y `cotizarV2` + tipos y zod en `lib/types/api-v2.ts` (§4.2), con
  `ubicacion` en la salida (§4.3).
  *Hecho:* unit tests con dobles de las dos firmas nuevas en verde.
- [ ] **T4.4** [P] `GeografiaApiService` + `IGeografiaApiService` (§6) y
  `OrdenRepository.findLugarDeOrdenForOwner` (§4.3).
  *Hecho:* unit test del servicio: `apiKey` sí, otro rol `forbidden`, país ajeno `not_found`.

## T5 — Rutas v2 y middleware (depende de T4)

- [ ] **T5.1** Parámetro `version` en `handleCargaApi` y `handleCotizacionApi` (§4.1).
  *Hecho:* contrato de T1.3 y tests existentes de v1 en verde sin cambios. (R4)
- [ ] **T5.2** Las cinco rutas de `app/api/v2/**` (§4.1) y `/api/v2` en `SELF_AUTH_ROUTES`, con la lista
  firmada de `rastreo-sin-ruta-nueva.guardia.test.ts` y `tests/unit/auth/middleware.test.ts` al día.
  *Hecho:* las guardias de middleware en verde; `GET /api/v2/ordenes/carga` → 405 y
  `/api/v2/ordenes/analitica` no existe.
- [ ] **T5.3** [P] `tests/integration/api/v2-ordenes.route.test.ts` (crear y lote: auth 401/403, empresa de
  la key, R12, R13–R16 extremo a extremo, forma de respuesta igual a v1 + `ubicacion`, cantón de CR → sin
  zona). (R10, R11, R12, R17, R18)
- [ ] **T5.4** [P] `tests/integration/api/v2-cotizacion.route.test.ts`: mismos importes que v1 para la
  misma ubicación + `ubicacion`. (R19)
- [ ] **T5.5** [P] `tests/integration/api/v2-consulta.route.test.ts`: detalle igual que v1 + ruta con
  tipos; 404 uniforme. (R20, R21)
- [ ] **T5.6** [P] `tests/integration/api/v2-geografia.route.test.ts`: país propio (CR), 422 sin `pais`
  o mal formado, mismo 404 para país ajeno e inexistente. (R22, R23)
- [ ] **T5.7** [P] `tests/integration/api/v2-aislamiento.route.test.ts` con dos empresas. (R24)
- [ ] **T5.8** `tests/fixtures/paises-de-prueba-geo.ts` y
  `tests/integration/api/v2-paises-de-prueba.route.test.ts`: países de 2 y 4 niveles; catálogo
  completo; resolución por nombre y código a toda profundidad; crear, lote y cotizar → país no
  habilitado y cero órdenes nuevas; v1 con esos países → país no habilitado bajo `ubicacion`. (R5, R15,
  R22, R33)
  *Hecho (T5.3–T5.8):* cada suite en verde contra Postgres real.

## T6 — Carga masiva por sesión (depende de T4) [P con T5]

- [ ] **T6.1** `lib/utils/plantilla-geo.ts` (`columnasGeoDePlantilla`, §8) y
  `tests/unit/utils/plantilla-geo.test.ts`: CR → `null` (plantilla de hoy); 2 y 4 niveles → una columna
  por profundidad; tipos mezclados y choque → `nivel_{n}`. (R29, R30)
- [ ] **T6.2** `geoInputDesdeColumnasDeNivel` y elección de extractor por forma de país en
  `BulkOrdenService`; `tests/unit/services/bulk-orden-service.n-niveles.test.ts` (ruta hasta la primera
  vacía, hueco → error de columna, R15/R16). (R31)
- [ ] **T6.3** Columnas por props desde `app/(app)/ordenes/page.tsx` hasta `OrdenesCargaUpload` y el
  exportador de errores, con los campos de hoy por defecto (§8).
  *Hecho:* tests existentes de componentes y de ida y vuelta de la plantilla pasan sin cambiar
  aserciones. (R29, R32)

## T7 — Documentación del canal (depende de T5)

- [ ] **T7.1** OpenAPI v2 en `lib/api/openapi-spec.ts` (con `allOf` sobre los schemas de v1) y su espejo
  `.yaml` (§9); `openapi-canal-rutas-reales` escanea `app/api/v2/**`; censo `PATHS_ESPERADOS` a 14;
  `tests/unit/api/openapi-v2.test.ts`. (R34)
  *Hecho:* `openapi-v1-congelado` (T1.4) sigue verde.
- [ ] **T7.2** [P] Carpeta «v2» en la colección Postman y entrada en `docs/api/CHANGELOG.md`;
  `tests/unit/api/postman-changelog-v2.test.ts`. (R35)

## T8 — Script de payloads reales (depende de T1) [P con T2–T7]

- [ ] **T8.1** `scripts/geo-payloads-contrato-v1.ts` y `geo:payloads-contrato` en `package.json` (§7.1).
- [ ] **T8.2** `tests/unit/scripts/geo-payloads-contrato-v1.test.ts`: con filas falsas que llevan PII
  conocida, la salida no contiene ninguno de esos valores ni ids de origen; conserva importes, peso y
  nombres de geografía; sin `--copia` o con host distinto se niega antes de leer órdenes; abre las
  transacciones en solo lectura. (R6, R7, R8)

## T9 — Puerta de release (personas, no agentes)

- [ ] **T9.1** Una persona ejecuta `pnpm geo:payloads-contrato --copia <host de la copia>` sobre la copia
  de producción del ensayo, graba sus respuestas en un `git worktree` de `BASE`
  (`CONTRATO_V1_GRABAR=1`, §7.3) y sube `payloads-reales.json` y `respuestas/`. Pega en el PR las cifras
  que imprime el script.
  *Hecho:* la suite de contrato corre los payloads reales en CI y está verde **sin regrabar** con el
  código de la rama.
- [ ] **T9.2** Gate completo de CI en verde, con los E2E existentes. Sin E2E nuevo. (R36)

## T10 — Cierre

- [ ] **T10.1** `./init.sh` en verde en el worktree y mapa `R<n> -> test` en `progress/impl_SLT-45.md`
  según `design.md > §12`.

## Archivos esperados

Código de la app:

- `lib/services/geo-ubicacion.ts`
- `lib/services/geo-resolucion.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/CotizacionOrdenService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/services/GeografiaApiService.ts`
- `lib/interfaces/services/IGeografiaApiService.ts`
- `lib/interfaces/services/IBulkOrdenService.ts`
- `lib/interfaces/services/ICotizacionOrdenService.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/types/api-v2.ts`
- `lib/types/carga-masiva.ts`
- `lib/types/cotizacion.ts`
- `lib/utils/plantilla-geo.ts`
- `lib/api/openapi-spec.ts`
- `app/api/v2/ordenes/route.ts`
- `app/api/v2/ordenes/carga/route.ts`
- `app/api/v2/ordenes/cotizacion/route.ts`
- `app/api/v2/ordenes/[id]/route.ts`
- `app/api/v2/geografia/route.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `app/api/ordenes/api-key/cotizacion/route.ts`
- `app/api/ordenes/carga-masiva/chunk/route.ts`
- `app/(app)/ordenes/page.tsx`
- `app/(app)/ordenes/_components/carga-masiva-fields.ts`
- `app/(app)/ordenes/_components/carga-masiva-export-errores.ts`
- `app/(app)/ordenes/_components/OrdenesCargaUpload.tsx`
- `app/(app)/ordenes/_components/OrdenesCargaMasivaButton.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/ordenes/_components/OrdenesModule.tsx`
- `middleware.ts`
- `scripts/geo-payloads-contrato-v1.ts`
- `package.json`

Documentación del canal:

- `docs/api/api-key-openapi.yaml`
- `docs/api/servi-logistic-api-key.postman_collection.json`
- `docs/api/CHANGELOG.md`

Tests y fixtures:

- `tests/fixtures/contrato-v1/BASE`
- `tests/fixtures/contrato-v1/payloads-sinteticos.json`
- `tests/fixtures/contrato-v1/payloads-reales.json`
- `tests/fixtures/contrato-v1/respuestas/`
- `tests/fixtures/contrato-v1/openapi-v1.json`
- `tests/fixtures/paises-de-prueba-geo.ts`
- `tests/integration/api/contrato-v1.route.test.ts`
- `tests/integration/api/v2-ordenes.route.test.ts`
- `tests/integration/api/v2-cotizacion.route.test.ts`
- `tests/integration/api/v2-consulta.route.test.ts`
- `tests/integration/api/v2-geografia.route.test.ts`
- `tests/integration/api/v2-aislamiento.route.test.ts`
- `tests/integration/api/v2-paises-de-prueba.route.test.ts`
- `tests/integration/db/orden-nodo-escritura.test.ts`
- `tests/unit/services/geo-ubicacion.test.ts`
- `tests/unit/services/geo-resolucion-v1-mensajes.test.ts`
- `tests/unit/services/bulk-orden-service.n-niveles.test.ts`
- `tests/unit/services/geografia-api-service.test.ts`
- `tests/unit/api/v2-composicion.test.ts`
- `tests/unit/api/openapi-v1-congelado.test.ts`
- `tests/unit/api/openapi-v2.test.ts`
- `tests/unit/api/postman-changelog-v2.test.ts`
- `tests/unit/api/openapi-177-paths-pdf-y-carga-id.test.ts`
- `tests/unit/utils/plantilla-geo.test.ts`
- `tests/unit/scripts/geo-payloads-contrato-v1.test.ts`
- `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`
- `tests/unit/guards/rastreo-sin-ruta-nueva.guardia.test.ts`
- `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`
- `tests/unit/auth/middleware.test.ts`

Spec y progreso:

- `specs/SLT-45-geo-jerarquica-entrada/requirements.md`
- `specs/SLT-45-geo-jerarquica-entrada/design.md`
- `specs/SLT-45-geo-jerarquica-entrada/tasks.md`
- `progress/impl_SLT-45.md`
