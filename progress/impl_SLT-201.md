# impl SLT-201 «Manual de la API al día: Swagger/Postman con la carga completa y guía PDF actualizada»

Ruta directa (sin spec). Fuente: `progress/auditoria-api-SLT-201.md` (2026-11-18). No cambia el
comportamiento de la API: ningún archivo de `app/` ni de `lib/` fuera de `lib/api/openapi-spec.ts`.

## Archivos
Modificados:
- `lib/api/openapi-spec.ts`:
  - `CargaRequest` gana `name` y `download_type`;
  - `CargaOrden` gana `downloadUrl` (required);
  - `CargaResponse` gana `downloadType`, `etiquetasPdf` y `manifiesto` (required);
  - schemas nuevos `CargaEtiquetasPdf`, `CargaManifiesto`, `ManifiestoFila` y `ManifiestoOmitida`;
  - los ejemplos de petición y respuesta de la carga se ponen al día;
  - el 409 de la carga pasa a `examples` (`sinTarifa` y `nombreRepetido`, este desde `CargaNombreDuplicadoError`);
  - `Forbidden` con todas sus causas (`ApiKeyAuthService`, analítica);
  - `InternalError` nuevo, con `MSG.INTERNAL`, y `"500"` en las 10 operaciones;
  - el ejemplo de analítica lleva el día en curso con `parcial: true`, más `cobertura`;
  - exporta `EJEMPLO_NOMBRE_LOTE`. No hay 429.
- `docs/api/api-key-openapi.yaml`: el mismo espejo, más el párrafo de las cabeceras de firma del webhook en `info.description` (D6).
- `docs/api/servi-logistic-api-key.postman_collection.json`: «2 · Cargar órdenes» envía `name` (`Lote Postman {{$timestamp}}`, para que una nueva ejecución no dé 409) y `download_type`, y su descripción nombra los bloques de la respuesta.
- `docs/api/guia-integracion/guia-integracion.html`:
  - portada y meta con «noviembre 2026»;
  - los bloques A y B figuran «ya en producción»;
  - la tabla C añade las entradas del 2026-10-01, 11-03 y 11-05;
  - §5.1 ya no dice que los bloques de la carga quedan fuera del OpenAPI.
- `progress/deudas.md`: D6 queda RESUELTA.
- Tests de contrato, para reflejar el cambio publicado:
  - `tests/unit/api/openapi-carga-409-sin-tarifa.test.ts`: el ejemplo de tarifa se lee en `examples.sinTarifa.value` y la aserción contra la constante sigue igual;
  - `openapi-177-paths-pdf-y-carga-id.test.ts`, `openapi-266-habilitar.test.ts` y `openapi-320-eliminar.test.ts`: la lista literal de códigos añade `"500"`;
  - `tests/unit/guards/docs-marca-heredada.guardia.test.ts`: sale del censo la frase «Servi Logistic la avisará con antelación», porque se fue con el aviso de despliegue pendiente.

Creados:
- `tests/unit/guards/openapi-carga-claves-reales.guardia.test.ts` (guardia nueva).
- `progress/features/SLT-201.md`, `progress/impl_SLT-201.md`.
- `progress/auditoria-api-SLT-201.md` (la auditoría de origen, que estaba sin versionar en el worktree).

PDF: `python docs/api/guia-integracion/generar-pdf.py <scratchpad>/Guia-Integracion-API-Servi-Logistic (noviembre 2026).pdf` da «JSON: 17 bloques válidos · 28 páginas». El PDF no se commitea (README): se genera para entregarlo.

## Mapa R → test (todo en `tests/unit/guards/openapi-carga-claves-reales.guardia.test.ts`)
| R | Qué | Test |
|---|---|---|
| R1 | Las claves que lee `cargaApiBodySchema` son `CargaRequest`: enum, default y tope. Se mide sobre el AST con el compilador de TS | `SLT-201 R1 — …` (3 its) |
| R2 | La respuesta real de `handleCargaApi` (consolidate, individual, best-effort) tiene las claves de `CargaResponse`, `CargaOrden`, `CargaEtiquetasPdf`, `CargaManifiesto` y `ManifiestoFila`. Los dobles se cotejan contra el AST de sus interfaces | `SLT-201 R2 — …` (4 its) |
| R3 | 409 por nombre repetido = ejemplo publicado; 500 de `withErrorHandler` = `InternalError`; las 10 operaciones declaran 500 y ninguna 429 | `SLT-201 R3 — …` (2 its) |
| R4 | YAML = TS: `info.description` entero (D6), propiedades y `required` de los 5 schemas, y `oneOf` de los bloques | `SLT-201 R4 — …` (7 its) |
| R5 | Guía PDF al día | `generar-pdf.py` (JSON válido) + `docs-marca-heredada.guardia.test.ts` |

## Evidencia
- Guardia nueva con la spec y el YAML de HEAD (los de hoy en dev) → **11 failed | 5 passed (16)**: rojo en R1, R2, R3, D6 y en los schemas nuevos del YAML.
- La misma guardia con el cambio → **16 passed (16)**.
- Mutación en `carga/route.ts` (una clave `prioridad` en el zod y otra `avisos` en la respuesta) → **3 failed** (R1 claves, R1 topes, R2 consolidate). Se restauró con `git checkout -- app/api/ordenes/api-key/carga/route.ts`.
- Primer gate rápido → INIT_EXIT=1, con 2 rojos que trajo el cambio:
  - `intentos-no-alcance.test.ts` (R31): el spec publicaba `ManifiestoFila.intentos`. Lo quité y la guardia lo trata como excepción declarada;
  - `rechazo-nombre-466.guardia.test.ts`: la fila 10-01 de la guía citaba el nombre retirado «Flete por rechazo». Lo reescribí sin él.
- Contrato, tras el arreglo: `vitest run tests/unit/api tests/unit/guards/openapi tests/unit/guards/sin-estados-retirados tests/unit/guards/docs-marca-heredada tests/unit/guards/titulo-marca-plataforma tests/unit/guards/rechazo-nombre-466.guardia.test.ts tests/unit/types/intentos-no-alcance.test.ts` → **Test Files 43 passed (43) · Tests 559 passed (559)**. Todo pasa por `con-desechable` (`servi_slt201_desechable`).
- `tsc --noEmit` → TSC_EXIT=0. `eslint` de los archivos tocados → LINT_EXIT=0.
- Gate rápido (segunda pasada, `bash ./init.sh` vía con-desechable, log completo) → **INIT_EXIT=0**: typecheck y lint OK, «tamaño del PR 10/40 archivos».

## Abierto
- **Para Carlos: el manifiesto de la carga por API entrega `intentos` y el contrato no lo publica.** La fila real de `manifiesto.filas[]` (`ManifiestoFilaDTO`) trae `intentos`, pero 160/R31 (QA5) prohíbe que el OpenAPI lo mencione (`tests/unit/types/intentos-no-alcance.test.ts`). `ManifiestoFila` se publica sin él: su descripción ya pide ignorar las claves desconocidas. La guardia lo tiene como única excepción declarada y se pone roja si la ruta deja de enviarlo o si alguien lo publica. Hay que decidir entre publicarlo, revisando QA5, o quitarlo de la respuesta de la API, que sería un cambio de comportamiento con otra ficha.
- `docs/api/CHANGELOG.md` 2026-09-24 sigue diciendo «despliegue PENDIENTE». Ya está en prod (`origin/prod` tiene `entregado`, `pendienteConfirmacion`, `ivaFulfillment`), pero la fecha no está en el repo: no se inventa.
- No se añadió una entrada al changelog: SLT-201 no cambia nada observable, solo documenta.

## Veredicto
Contrato de `POST carga` documentado y bajo guardia (rojo antes, verde después); guía y Postman al día; D6 cerrada.

## Tras la review (M2) y la sincronización con dev
- Se mergea `origin/dev`, que trae #227 (SLT-93 «API v1: nombre de lote repetido responde 500 en vez de 409»): el 409 por nombre repetido ya es el comportamiento real.
- M2: el test del 500 pide ahora la ruta real (`handleCargaApi` con un servicio que lanza) y comprueba el **HTTP 500**, además del cuerpo publicado.
  - Antes de la mutación → 16 passed (16).
  - Mutación `INTERNAL: 500` → `400` en `lib/errors/codes.ts` → **1 failed** («expected 400 to be 500»).
  - Restaurado con `git checkout -- lib/errors/codes.ts`.
- Gate rápido tras el merge y M2 → **INIT_EXIT=0**.
