# impl SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte»

Ruta directa. Rama `feature/SLT-208-manual-api-conectable`, sale de dev ab489908. Base desechable
`servi_slt208_desechable` (migrada + `db:seed`). El comportamiento de la API no cambia: solo
documentación, contrato publicado, colección, una constante y tests.

## Archivos

| Archivo | Qué |
|---|---|
| `docs/ayuda/oficina/guia-integracion-api.md` | URL de producción, discrepancias corregidas (tabla abajo), sin símbolos vetados, secciones nuevas 3.7 (varias empresas, una URL), 4.8 (Postman y Swagger), 9 (historial), ejemplos `curl` nuevos de cotización, detalle y habilitación, ejemplo verificable de firma |
| `docs/api/servi-logistic-api-key.postman_collection.json` | `baseUrl` de producción, tests y descripciones corregidas, remisiones con `{{$timestamp}}` |
| `lib/api/openapi-spec.ts` | `servers` con producción; descripción de autenticación y aislamiento; `CargaRow.required` y descripciones; ejemplo de error de fila; `⚠️` y `→` fuera de las descripciones |
| `lib/api/url-produccion.ts` | Nuevo: `URL_PRODUCCION_API` |
| `docs/api/api-key-openapi.yaml` | Espejo de los mismos cambios |
| `docs/api/CHANGELOG.md` | Entrada 2026-11-18 «La guía, Postman y el contrato apuntan a producción y se corrigen contra el código» |
| `tests/unit/guards/api-artefactos-url-y-simbolos.guardia.test.ts` | Guardia nueva (tres reglas sobre los cuatro artefactos) |
| `e2e/guia-api-ejemplos-ejecutables.spec.ts` | E2E: cada curl de la guía, cada petición de Postman, dos empresas, firma, 401, `servers` servido |
| `playwright.config.ts` | El spec nuevo en el proyecto `aislamiento` |
| `tests/unit/guards/docs-marca-heredada.guardia.test.ts` | Tres frases de la guía actualizadas a su texto nuevo (SL-16 las fija literales) |
| `tests/unit/api/openapi-406-evidencias-url.test.ts` | El literal del enlace de ejemplo pasa a la URL de producción |

## `servers` en OpenAPI

El comentario de `openapi-spec.ts:175` («Sin bloque `servers`») venía de la entrada del changelog del
2026-09-01: se quitó para que Swagger UI resolviera contra el origen que sirve el documento. Ninguna
guardia lo exigía (la única mención en tests es `CLAVES_NO_OPERACION` de
`openapi-canal-rutas-reales`, que ignora `servers` a nivel de path). El mismo changelog avisaba del
coste: un generador de clientes desde el `.yaml` se quedaba sin base. No es una razón que pese más que
«el integrador no sabe a qué URL llamar», así que se repone con producción como único servidor.
Consecuencia local: «Try it out» de Swagger en un entorno de desarrollo apunta a producción.

## Discrepancias corregidas (20)

| # | Artefacto | Qué decía | Qué dice el código | Fuente |
|---|---|---|---|---|
| 1 | Guía l.29, tabla 4.1 (l.230), 7 curl, ejemplo webhook | `https://app.example.com` | Producción `https://www.servilogistic.co` (dato comprobado) | ficha |
| 2 | Postman `baseUrl` (l.21) | `http://localhost:3000` | Producción | ficha |
| 3 | OpenAPI + yaml | Sin `servers`; ejemplo `evidenciasUrl` con `app.example.com` (`openapi-spec.ts:1254`, yaml l.1056) | `servers: [{ url: https://www.servilogistic.co }]` | `openapi-spec.ts:175` |
| 4 | Guía 3.1 | «Configuración › API keys, personal de oficina» | Menú Configuración, opción API, `/configuracion/api`, solo `maestro`, botón «Generar API key» | `app/(app)/configuracion/api/page.tsx:20`, `lib/auth/menu-visibility.ts:589`, `ApiKeysModule.tsx:203` |
| 5 | Guía 3.4 | La empresa genera una key nueva y desactiva la anterior | Rota la misma key: secreto nuevo, el anterior da 401 | `lib/services/ApiKeyService.ts:203` (`rotar`) |
| 6 | Guía 5.1 | `peso` obligatorio | No se usa (`peso: null`), no está en el schema de fila | `lib/services/BulkOrdenService.ts:896`, `lib/types/carga-masiva.ts` (`filaCargaSchema`) |
| 7 | Guía 5.1 | `direccion` y `monto_cobrar` obligatorios | Opcionales (`.optional().default("")`; monto vacío = `null`) | `lib/types/carga-masiva.ts` (`filaCargaSchema`), `lib/utils/monto-cobrar.ts:93` |
| 8 | OpenAPI + yaml `CargaRow.required` | Incluía `direccion`, `peso`, `monto_cobrar` | Requeridas: `num_remision`, `destinatario`, `telefono`, `producto`, `provincia`, `canton`, `distrito` | mismo |
| 9 | Guía 5.1, OpenAPI `openapi-spec.ts:256`, yaml l.101 | Error de fila `["requerido"]` | `["telefono es obligatorio"]` (`<campo> es obligatorio`) | `lib/types/carga-masiva.ts:111` |
| 10 | Guía 5.3 y 5.8; Postman `desde`/`hasta` | «hora CR», «UTC-6» | Zona horaria del país de la empresa | `app/api/ordenes/api-key/route.ts:50`, `analitica/route.ts` (`zonaDelIntegrador`) |
| 11 | Guía 4.3 y 8.1 | 409: «Lea el `message`: distingue los casos» | Eliminar, cancelar y los `/generate` lanzan `ConflictError()` genérico; solo tarifa y nombre de lote traen mensaje propio | `orden/[id]/route.ts` (DELETE), `[numGuia]/cancelar/route.ts`, `orden/[id]/generate/route.ts`, `carga/[cargaId]/generate/route.ts` |
| 12 | Guía 4.4 y 5.8 | 403 de analítica solo por métrica | También con el módulo Analítica apagado | `app/api/ordenes/api-key/analitica/route.ts:144`, `lib/modulos/modulo-inactivo-error.ts:17` |
| 13 | Guía 3.2 / 4.4 | No decía el formato exacto | Un solo espacio entre `Bearer` y la clave; con dos, 401 | `lib/api/api-key-request.ts:41` |
| 14 | Guía 3.5 | No decía qué pasa al eliminar la clave | Clave inexistente: 401 | `lib/services/ApiKeyAuthService.ts:83` |
| 15 | Postman «3. Listar» test | `b.limit` | `b.pagination.limit` | `ApiOrdenLecturaService.listar` (forma `{ items, pagination }`) |
| 16 | Postman «8. Habilitar» test | `b.habilitadas` | `b.resumen.habilitadas` | `lib/services/ApiHabilitacionService.ts` |
| 17 | Postman «9. Cancelar» | Esperaba 200 sobre la orden recién cargada | Recién cargada está en `por_recolectar_en_tienda`: 409 hasta llegar a bodega | `lib/repositories/OrdenRepository.ts:296` |
| 18 | Postman «10. Eliminar» | «Borrado definitivo… mientras no se haya gestionado» | Borrado lógico; 7 estados y sin intentos de entrega | `lib/types/order-status-eliminables.ts` |
| 19 | Guía 5.10 / 5.3 (coherencia interna) | Cuerpo de habilitar con 2 filas y respuesta con 3; ítem del listado con `createdAt` fuera del rango filtrado | Ejemplo con 3 filas; `createdAt` dentro del rango | guía |
| 20 | Guía (120 `§`, 15 `→`, `›`, `≥`, `–`), OpenAPI y yaml (`⚠️` 18 y 15, `→` 7) | Símbolos | «sección 5.9», «Atención:», texto | ficha |

Además (no discrepancias, huecos): curl de cotización, detalle y habilitación; mensajes exactos de 422
por lote y de habilitación; ejemplo de firma verificable (secreto como texto con su prefijo,
`Content-Type`); remisiones de Postman con `{{$timestamp}}` para poder repetir la colección.

## Varias empresas, una URL (punto 8)

Sin fuga. La clave B recibe `404 NOT_FOUND` («El recurso solicitado no existe.») al leer por guía y
por remisión, cancelar, imprimir, imprimir el lote y eliminar la orden de la A; no la ve en su listado
ni filtrando por su guía o remisión; habilitarla da `no_encontrada`; su analítica de `ordenes_creadas`
de hoy no cambia mientras la de la A sube. Controles positivos: la A sí la lee y sí la cancela.
`ordenes-api-key-tienda-destino-aislamiento.route.test.ts` usa dobles y una sola empresa (tiendas), así
que no se duplica.

## Mapa ficha -> test

| Punto | Test |
|---|---|
| 1 URL base en los tres | guardia regla 3 (`api-artefactos-url-y-simbolos.guardia.test.ts`); E2E «el contrato que sirve /api/docs/openapi propone el servidor de producción» |
| 2 revisión contra el código | E2E «cada curl de la guía…» (forma y código de los 10 ejemplos; mensaje de error de fila literal); E2E «sin clave, con dos espacios…» |
| 3 ejecutable | E2E «cada curl de la guía…» (10) y «cada petición de la colección de Postman…» (10) |
| 4 sin símbolos | guardia regla 2 |
| 5 guardia | `tests/unit/guards/api-artefactos-url-y-simbolos.guardia.test.ts` |
| 6 PDF | comprobación manual abajo |
| 7 changelog e historial | entrada del CHANGELOG y sección 9 de la guía |
| 8 dos empresas | E2E «dos empresas, una URL…» |

Ejemplo que no se ejecuta con su forma completa: los cuerpos de webhook (secciones 6.2 y 6.7) no son
peticiones que el integrador haga; su firma sí se recalcula en el E2E. Las URLs firmadas de PDF las
sirve el doble de Storage del E2E, así que se comprueba la forma, no la descarga desde Supabase.

## Salidas

E2E (`next build` + `next start` en 3208, Storage doble en 54308, `--project aislamiento --no-deps`):

```
ok 1 cada curl de la guía responde con el código y la forma que la guía documenta
ok 2 el ejemplo de firma de la sección 6.3 sale igual con el firmador real
ok 3 cada petición de la colección de Postman responde y pasa sus propios tests
ok 4 dos empresas, una URL: la clave B no ve ni toca la orden de la A, y su analítica no la cuenta
ok 5 sin clave, con dos espacios o con una clave inventada: 401, como dice la sección 4.4
ok 6 el contrato que sirve /api/docs/openapi propone el servidor de producción
6 passed (8.8s)
```

Antes de reconstruir con el `servers` nuevo, el caso 6 salía rojo (`servers` undefined): el E2E lee el
build, no el fuente.

PDF (`construirPdfGuiaApi`, igual que la ruta de descarga; texto con `pdftotext`):
`Guia-Integracion-API-Servi-Logistic-2026-11-18.pdf`, 148554 bytes; `www.servilogistic.co` 23 veces,
`example.com` 0, `localhost` 0, `§` 0, `→` 0, la firma de ejemplo 1.

### Mutaciones de la guardia (cada una restaurada con `git checkout --`)

```
G1 regla1 guía example.com:   2 failed
G2 regla1 yaml localhost:     2 failed
G3 regla2 guía §:             1 failed
G4 regla2 postman →:          1 failed
G5 regla2 ts ⚠:               1 failed
G6 regla3 postman baseUrl:    2 failed
G7 regla3 ts sin servers:     1 failed
G8 regla3 guía otra base:     2 failed
sin mutación: 20 passed (20)
```

### Mutaciones del E2E

```
E1 mensaje de error de fila viejo («requerido»):  1 failed (toEqual del mensaje)
E2 clave `zona` del listado sin documentar:        1 failed («la respuesta no tiene la forma documentada»)
E3 cancelar la guía ya borrada:                    1 failed (404 NOT_FOUND en vez de 200)
E4 firma de ejemplo alterada:                      1 failed
E5 test de Postman con b.limit:                    1 failed
E6 test de Postman con b.habilitadas:              1 failed
E7 la B usa la clave de la A en el bucle de 404:   rojo
E8 analítica comparando la A en vez de la B:       rojo
sin mutación: 6 passed
```

E7 y E8: el filtro `--grep` con tilde no pasa por `cmd.exe` y la corrida arrastró los demás specs de
`aislamiento` sin sus dependencias. Sin mutación: 1 rojo (`dos-empresas-humo`, que necesita
`plataforma-vacia`); con E7: 2 rojos; con E8: 2 rojos. El rojo de más es el caso de dos empresas.

### Gate

`./init.sh` (rápido, con la base desechable): **INIT_EXIT=1**, y se para en el paso 3, antes de
typecheck y tests, por el board y no por esta rama:

```
✗ feature_list.json invalido:
zona frontend: SLT-202, SLT-206, SLT-209 (3 in_progress, max 2)
INIT_EXIT=1
```

`feature_list.json` es la copia local del board en el checkout principal (el leader la mantiene). Las
mismas comprobaciones del gate, corridas a mano con la base desechable:

```
TYPECHECK_EXIT=0
LINT_EXIT=0          (0 errores; 248 avisos ya existentes, ninguno en archivos de esta rama)
vitest related (openapi-spec, url-produccion, guardias tocadas): 27 archivos, 379 passed, RELATED_EXIT=0
test:guardias: 360 archivos, 5396 passed | 1 skipped, GUARDIAS_EXIT=0
tests/unit/ayuda + tests/unit/api + AccionesGuiaApi + intentos-no-alcance: 44 archivos, 534 passed, AYUDA_EXIT=0
```

## Veredicto

Documentación del canal corregida contra el código en 20 puntos, URL de producción en los tres artefactos, 10 curl y 10 peticiones de Postman en verde contra la app real, sin fuga entre empresas; `init.sh` rojo solo por el cupo del board (zona frontend).

## Vuelta 2 (2026-11-19, review rechazada: `progress/review_SLT-208.md`)

| Hallazgo | Arreglo |
|---|---|
| H1 ruta | Spec completo en `specs/SLT-208-manual-api-conectable/` (requirements R1..R12 con su test, design con alternativas descartadas, tasks todas `[x]`). Label de Trello `ruta:directa` a `ruta:completa`: el leader pidió ligera «y, si no basta, design y tasks»; `CHECKPOINTS.md > Ruta` exige completa con integraciones externas y webhooks, así que el label dice completa |
| H2 | Sección 5.1, `CargaRow` (`.ts` y `.yaml`) y CHANGELOG: clave vacía `<campo> es obligatorio`, clave ausente `Este campo es obligatorio`. E2E nuevo «una clave de fila ausente y una vacía…» |
| H3 | Sin `colones`, `colón` ni `Costa Rica` en guía, spec y `.yaml` (salvo filas de historial anteriores al 2026-11-18). Guardia regla 4 |
| H4 | Descripción de `numRemisionDesechable` (y el comentario del script de la carga): borrado lógico |
| H5 | «3. Listar»: activos `limit`, `offset` y `num_remision={{numRemision}}`; `estado`, `desde`, `hasta` y `num_guia` desactivados; su test exige la orden creada. «9. Cancelar»: script previo que la omite sin guía (`pm.execution.skipRequest()`). «6» y «7» aceptan `409` sin guía. El E2E corre la colección con una tienda sin fulfillment y otra con fulfillment |
| H6 | La guía ya no cita `docs/api/*`: el contrato por `https://www.servilogistic.co/api-docs` y `/api/docs/openapi`; los cambios, por la sección «Cambios» y la 9 |
| H7 | Sección 2.1 «Primera petición» (curl ejecutado en el E2E: ahora 11 curl); 60 s en 5.1 y 5.2; 403 por módulo Analítica en la tabla 8.1; curl de habilitar con sus `\`; descripción general del OpenAPI: el dueño es la cuenta dedicada o la tienda destino |
| H8 | `§` y `⚠` fuera de los comentarios del `.yaml`; las reglas 2 y 4 de la guardia miran el `.yaml` entero |
| H9 | `servers`: `/` («Este servidor») y producción, en `.ts` y `.yaml`; guía 4.8, guardia y E2E ajustados |

Test nuevo: `tests/unit/ayuda/guia-api-pdf-produccion-slt208.test.ts` (R10 PDF y R11 changelog/historial).

### Salidas vuelta 2

```
E2E (next build + next start 3208, Storage 54308, --project aislamiento --no-deps): 8 passed, E2E_EXIT=0
  cada curl de la guía (11) · firma 6.3 · Postman sin fulfillment (10) · Postman con fulfillment (10, Cancelar omitida)
  clave de fila ausente y vacía · dos empresas · 401 · servers ["/", producción]
vitest tests/unit/api + guards + ayuda + intentos-no-alcance: 301 archivos, 4461 passed | 1 skipped
Guardia: 25 passed. PDF/changelog: 3 passed
Mutaciones nuevas (restauradas con git checkout --):
  M9  «colones» en un comentario del .yaml      -> guardia 1 failed
  M10 «⚠» en un comentario del .yaml            -> guardia 1 failed
  M11 «hora de Costa Rica» en la guía (5.8)     -> guardia 1 failed
  M12 curl de carga con otro host               -> test del PDF 1 failed
./init.sh (rápido): INIT_EXIT=0
```

Veredicto vuelta 2: H1 a H9 resueltos; gate y E2E en verde.

## Vuelta 3 (2026-11-19, review vuelta 2 rechazada solo por el spec)

- V2-1: `design.md` abre con `## Lo que ya existe` (búsqueda en el board y en el grafo, qué apareció y qué se reusa).
- V2-2: guardia regla 5: el cuerpo de la guía no cita `docs/`, `lib/`, `app/`, `.yaml` ni `CHANGELOG.md` (excepto el front matter y el literal del 422). Mutación M13 (`docs/api/api-key-openapi.yaml` en el encabezado de la guía): 1 failed. Trazabilidad de R8 actualizada.
- V2-3: sección 4.8, punto 5: con fulfillment, «6» y «7» dan 409 y «Cancelar» no se envía.
- V2-4: curl de la sección 2.1 en dos líneas con `\`.
- V2-5: títulos del test del PDF a R10/R11.

Salidas: guardia + PDF 30 passed; `next build` BUILD_EXIT=0; E2E 8 passed (E2E_EXIT=0); `./init.sh` INIT_EXIT=0.
Tamaño (`scripts/tamano-pr.mjs`): 12/40 archivos, 979/1000 líneas de producción, 1044/3000 de tests: en el aviso, sin pasarse.
