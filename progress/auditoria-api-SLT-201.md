# Auditoría de la API por API key y su manual — 2026-11-18 (solo lectura)

Refs: origin/dev `ede99e23`, origin/prod `0891b054`. Nada editado. Tests corridos: 39 archivos estáticos (tests/unit/api + guardias openapi), **482/482 verdes**.

## Veredicto
**Listo con salvedades.** El canal funciona y su contrato está bien vigilado: los 10 endpoints coinciden en método y ruta con el manual, y prod sirve el mismo contrato que dev. Lo que falla es esto:
1. Un bug real: un nombre de lote repetido responde 500 cuando el manual promete 409 (SLT-93).
2. Swagger no documenta 4 claves de la carga, aunque la guía PDF sí las trae.
3. La guía PDF tiene la portada y la sección de cambios desactualizadas.

## 1. Qué es «el manual» y dónde lo ve el cliente
| Pieza | Dónde | Público | En prod |
|---|---|---|---|
| Swagger UI (OpenAPI 3.1) | `/api-docs` → `app/api-docs/route.ts:1-44`, carga el JSON de `/api/docs/openapi` | Sí, sin sesión: `middleware.ts:20-21` | Sí: el archivo existe en origin/prod y `lib/api`, `docs/api` y `app/api/ordenes` son idénticos en prod y dev |
| Spec fuente | `lib/api/openapi-spec.ts` (2459 líneas). Lo sirve `app/api/docs/openapi/route.ts:9-11` | — | — |
| Espejo YAML | `docs/api/api-key-openapi.yaml` | No (repo) | — |
| **Guía de integración (el «manual» PDF)** | `docs/api/guia-integracion/guia-integracion.html` y `generar-pdf.py`. Se entrega a mano como PDF (`README.md` de esa carpeta) | No está publicada en la app | — |
| Postman | `docs/api/servi-logistic-api-key.postman_collection.json`: 10 peticiones, una por operación | No (repo) | — |
| Changelog del canal | `docs/api/CHANGELOG.md` (última entrada: 2026-11-05) | No (repo) | — |
| Guía dentro de la app | No existe. Es **SLT-80 «Guía de integración por API en la ayuda»**, en estado *pending* | — | — |

El canal **no tiene prefijo `/v1`**: vive en `/api/ordenes/api-key/**`. «v1» es el nombre de las fichas. La v2 es SLT-45 (ver §4).

## 2. Coherencia entre el manual y el código
Inventario. Hay 10 operaciones reales:
- `POST carga`, `GET /` (listado), `PUT {numGuia}/cancelar`;
- `GET` y `DELETE orden/{id}`, `POST orden/{id}/generate`, `POST carga/{cargaId}/generate`;
- `POST cotizacion`, `GET analitica`, `POST habilitar`.

Las 10 están en `openapi-spec.ts:157-916` y en Postman. **No hay endpoints sin documentar ni documentados que no existan.** Lo vigila `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`, que compara operación a operación (verbo + path).

Lo que sí cuadra:
- Query del listado (`app/api/ordenes/api-key/route.ts:65-102`) frente a `openapi-spec.ts:300-355`.
- DTO de listado y detalle (`lib/types/api-orden.ts:134-315`) frente a `OrdenListItem`, `OrdenCosto`, `OrdenGestion`, `Evidencia`, `CancelacionResponse` y `EliminacionResponse`.
- Cuerpo de la cotización (`lib/types/cotizacion.ts:103-108`).
- Estados: el enum se deriva de `ORDER_STATUS_SEED` (`openapi-spec.ts:50`) y los estados retirados quedan bajo guardia (`sin-estados-retirados.guardia.test.ts`).
- Webhooks: el enum se deriva de `EVENTOS_PUBLICOS` y de `EVENTO_PUBLICO_POR_TIPO` (`:63`, `:81`). Las cabeceras de firma salen de `lib/crypto/webhook-firma.ts` (`:145-147`).
- Eliminación (ficha 320): documentada en `:489-526`.
- SL-17: la empresa sale de la fila `api_key` (`lib/api/api-key-request.ts:47-65`) y las fechas se miden en la zona horaria del país (`:328`, `:336`, `:777`).
- SLT-169 (pago neto a la tienda) **no toca la API**: es de cierres y de UI.

### Discrepancias
| # | Gravedad | Qué | Evidencia |
|---|---|---|---|
| D1 | **Alta (bug)** | Un `name` de lote repetido responde **500** cuando el contrato y la guía prometen **409**. El adaptador `@prisma/adapter-pg` deja `meta.target` vacío. Ficha **SLT-93 «API v1: nombre de lote repetido responde 500 en vez de 409»**, *pending* y sin assignee | `carga/route.ts:238-262`; promesa en `guia-integracion.html:492` |
| D2 | **Media** | La spec y el YAML de `POST carga` no documentan `name` ni `download_type` en el cuerpo, ni `downloadType`, `etiquetasPdf`, `manifiesto` ni `ordenes[].downloadUrl` en la respuesta (feature 141 y 136). Tampoco mencionan el 409 por nombre repetido. El código sí los usa, y la guía PDF los documenta (`:492`, `:524`, `:540`). Postman tampoco los usa | código `carga/route.ts:240,245,407-413`; spec `openapi-spec.ts:1769-1781`, `:1895-1926`, 409 en `:277-290` (solo cubre la tarifa); 0 coincidencias de `download_type`, `etiquetasPdf` o `manifiesto` en el spec y en el YAML |
| D3 | Media | Deuda **D6**: el `info.description` del YAML no tiene el párrafo de las cabeceras de firma del webhook; el TS sí | `progress/deudas.md:31-34`; 0 coincidencias de `X-Servi` en el YAML; TS `openapi-spec.ts:145-147` |
| D4 | Baja | El ejemplo de analítica dice «el tercero (hoy) no viene: no está cerrado», pero desde el 2026-09-04 el día en curso sí viene, marcado `parcial: true`. El propio schema lo dice | `openapi-spec.ts:799-800` frente a `:2237`; `CHANGELOG.md:657` |
| D5 | Baja | La respuesta `Forbidden` solo dice «usuario no activo». En realidad un 403 también sale por: key desactivada, rol incorrecto, tienda destino de baja o inactiva, y el `forbidden` de analítica | `openapi-spec.ts:2402-2413`; `lib/services/ApiKeyAuthService.ts:86-108`; `analitica/route.ts:232` |
| D6 | Baja | No hay 500 documentado, aunque existe `INTERNAL` | `lib/errors/codes.ts` |
| D7 | Info | No hay límite de peticiones (429 ni rate limit) ni en el código ni en el manual. No es una incoherencia, sino falta de blindaje | grep sin resultados en `app/api/ordenes/api-key`, `lib/api` y `lib/errors` |

Rotación: la guía (§3.4, `guia-integracion.html:360-366`) dice que la rota la empresa, no el integrador. Coincide con `lib/services/ApiKeyService.ts:214`, donde se reemplaza el prefijo y el hash. El prefijo `svl_` coincide (`ApiKeyService.ts:110`).

### Guía PDF (`guia-integracion.html`) desactualizada
- La portada dice «Versión del documento: septiembre 2026» (`:7`, `:179`).
- «Cambios respecto de la versión de agosto» dice que los bloques A (renombrado de estados) y B están **«pendientes de despliegue»** (`:226`, `:248`). Ya están en prod: origin/prod tiene `entregado` en `lib/types/order-status.ts`.
- La tabla C llega solo hasta el 2026-09-10 (`:301-307`). Faltan las entradas del changelog del 10-01, el 11-03 (`ivaFulfillment`, aunque el cuerpo de la guía sí lo trae) y el 11-05.
- Con la próxima release (§4), la descripción de `en_ruta_bodega_central` en `:436` deja de coincidir con `DESCRIPCION_ESTADO`.

## 3. Tests y guardias de sincronía
Hay 21 tests `tests/unit/api/openapi-*.test.ts` más estas guardias:
- `openapi-canal-rutas-reales.guardia.test.ts`: spec frente a rutas reales;
- `sin-estados-retirados.guardia.test.ts`;
- `titulo-marca-plataforma.test.ts`;
- `intentos-no-alcance.test.ts`, entre otras.

Paridad entre TS y YAML: la cubren los asserts de cada test. **Todos verdes** en local (39 archivos, 482 tests). **Ninguno está en `tests/baseline-rojos.json`** (grep sin resultados).

Hueco: las guardias comparan operaciones y paths, y algunos schemas campo a campo. **Ninguna compara el `zod` del cuerpo ni las claves de la respuesta de `POST carga` con el spec.** Por eso D2 vive en verde.

## 4. prod frente a dev (próxima release)
`git diff origin/prod origin/dev` no cambia nada en `app/api/ordenes`, `app/api/docs`, `app/api-docs`, `lib/api` ni `docs/api`. En lo que toca a la API:
- `lib/types/order-status.ts`: solo cambia el texto de `DESCRIPCION_ESTADO.en_ruta_bodega_central`. La API no lo sirve; solo la guía lo copia (`:436`).
- `lib/types/order-status-transiciones.ts`: nueva transición admin `ajuste_estado` → `en_ruta_bodega_central` (SLT-197). Ese valor ya está en el enum del webhook, así que el contrato no cambia.
- `OrdenRepository`, `ingreso-empresa.ts` y otros: métodos nuevos de recepción, satélite, SLA y pago de la plataforma. Ninguno está en el camino de la API, y `ingreso-empresa.ts` solo mueve un tipo.

**La próxima release no cambia el contrato.**

Fuera de dev: `origin/feature/SLT-45-geo-jerarquica-entrada`, de **SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»**. Está *in_progress* con Camilo y su review se aprobó el 2026-11-06, pero **no está mergeada**. Añade `/api/v2/*`, +443 líneas de spec, +518 de YAML, Postman y changelog. Cuando entre, la guía tendrá que incorporarla (lo pide SLT-80).

## 5. Deudas y fichas abiertas sobre la API
- **SLT-93 «API v1: nombre de lote repetido responde 500 en vez de 409»**: pending, sin assignee. Es el bug D1.
- **SLT-80 «Guía de integración por API en la ayuda»**: pending. Lleva la guía a la app con su PDF y añade la v2.
- **SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»**: in_progress, sin mergear.
- **Deuda D6** (`progress/deudas.md:31`): cabeceras de firma en el YAML. Dueño: Carlos.
- **Deuda D11** (`progress/deudas.md:84`): `lib/api/api-key-request.ts` lee `organizacion_id` directamente de Prisma. Es interna y el contrato no la nota.

## Qué actualizar, por prioridad
1. Arreglar SLT-93: el nombre repetido debe dar 409, no 500. Es el único bug de comportamiento.
2. Documentar en el spec, el YAML y Postman las claves de la carga que faltan (`name`, `download_type`, `downloadType`, `etiquetasPdf`, `manifiesto`, `downloadUrl` y el 409 por nombre). Además, añadir una guardia de paridad entre zod y el spec para la carga.
3. Regenerar la guía PDF: portada «noviembre 2026», bloques A y B como vigentes, tabla de cambios hasta el 11-05.
4. Cerrar la deuda D6: cabeceras de firma en el YAML.
5. Detalles del spec: el ejemplo de analítica con `parcial`, la descripción del 403, el 500.
6. Decidir si se quiere un límite de peticiones (429). Hoy no existe.
