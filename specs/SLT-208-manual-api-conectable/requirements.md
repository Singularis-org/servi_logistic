# Requisitos — SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte»

> **Origen.** Decisión de Carlos del 2026-11-18: «revisa el manual y el postman y el swagger de pies a
> cabeza y arréglalo bien porque si no no se van a poder conectar nunca, y en el manual no uses este
> tipo de símbolos de IA §». El mismo día añadió: cada empresa tiene su conexión por API y todas usan
> la misma URL.
>
> **Ruta.** Nació como directa; la review (H1) la subió a completa porque el diff cambia el contrato
> publicado de una integración externa (autenticación, webhooks, `servers` de `/api/docs/openapi`).
> Estos requisitos salen del «Mapa ficha -> test» de `progress/impl_SLT-208.md`, y cada uno apunta a un
> test que ya existe.
>
> **Alcance.** Los tres artefactos que recibe el integrador: la guía
> `docs/ayuda/oficina/guia-integracion-api.md` (de ella salen la Ayuda y el PDF), la colección
> `docs/api/servi-logistic-api-key.postman_collection.json` y el contrato OpenAPI
> `lib/api/openapi-spec.ts` (Swagger en `/api-docs`, JSON en `/api/docs/openapi`, espejo en
> `docs/api/api-key-openapi.yaml`). **Fuera de alcance:** cambiar el comportamiento de la API. Si la
> documentación y el código no coinciden, se corrige la documentación.

## URL base

- **R1 (ubicuo):** La guía, la colección de Postman y el contrato OpenAPI DEBEN usar
  `https://www.servilogistic.co` como URL base de producción: la guía la declara al comienzo y en la
  sección 4.1, la variable `baseUrl` de Postman la trae, y `servers` del contrato lista primero el
  relativo `/` («Este servidor») y después producción. Ninguno DEBE nombrar `example.com`, `localhost`
  ni `127.0.0.1`, ni otra URL absoluta que no sea producción o un marcador `<...>`.

## Fidelidad al código

- **R2 (ubicuo):** Para cada operación del canal por API key, la guía DEBE decir lo que hace el código:
  método, ruta y parámetros, header de autenticación (nombre, formato, dónde se genera la clave),
  cuerpo y respuesta, códigos y mensajes de error, límites (filas por lote, 60 s por petición de carga y
  cotización) y la firma de los webhooks con un ejemplo verificable.
- **R3 (evento):** CUANDO una fila de la carga trae `num_remision`, `destinatario`, `telefono` o
  `producto` vacío, la guía y `CargaRow` DEBEN documentar el error `<campo> es obligatorio`; CUANDO la
  clave no viene en la fila, DEBEN documentar `Este campo es obligatorio`.

## Ejecutable

- **R4 (ubicuo):** Cada ejemplo `curl` de la guía y cada petición de la colección de Postman DEBEN
  poder ejecutarse contra la aplicación y devolver el código y la forma que documenta la guía.
- **R5 (estado):** MIENTRAS la tienda de la clave tenga fulfillment (la orden nace sin guía), la
  colección de Postman DEBE seguir funcionando en orden: el listado no manda parámetros vacíos y trae
  la orden creada, y la cancelación, que pide guía, no se envía.

## Texto

- **R6 (ubicuo):** La guía, la colección y el contrato (también los comentarios del `.yaml`) NO DEBEN
  usar los símbolos `§`, `⭑`, `→`, `✔`, `⚠`, `∈` ni `☐`; las referencias se escriben «sección 5.9».
- **R7 (ubicuo):** La guía, el contrato y el `.yaml` NO DEBEN escribir país ni moneda a mano
  (`colones`, `colón`, `Costa Rica`); dicen «la moneda del país de la empresa» y «la zona horaria del
  país de la empresa». Se exceptúan las filas de historial anteriores al 2026-11-18.
- **R8 (ubicuo):** La guía NO DEBE remitir a archivos del repositorio que el integrador no tiene; el
  contrato se cita por su URL servida.
- **R9 (ubicuo):** Una guardia DEBE poner el gate en rojo si alguno de los cuatro archivos incumple R1,
  R6 o R7, o si la guía incumple R8.

## Entregables

- **R10 (ubicuo):** El PDF de la guía DEBE generarse sin error desde la guía revisada y llevar la URL de
  producción.
- **R11 (ubicuo):** La revisión DEBE quedar anunciada en `docs/api/CHANGELOG.md` y en el historial de
  versiones de la guía (sección 9), con fecha 2026-11-18.

## Varias empresas

- **R12 (ubicuo):** La guía DEBE explicar que todas las empresas usan la misma URL y que la clave
  identifica a la empresa y a la tienda. CUANDO una clave intenta leer o tocar una orden de otra
  empresa, la API responde `404 NOT_FOUND` igual que para una inexistente, y la guía DEBE decirlo.

## Trazabilidad

| R | Test |
|---|---|
| R1 | `tests/unit/guards/api-artefactos-url-y-simbolos.guardia.test.ts` (reglas 1 y 3, `servers`); E2E «el contrato que sirve /api/docs/openapi propone este servidor y producción» |
| R2 | E2E «cada curl de la guía responde con el código y la forma que la guía documenta»; E2E «sin clave, con dos espacios o con una clave inventada: 401»; E2E «el ejemplo de firma de la sección 6.3 sale igual con el firmador real» |
| R3 | E2E «una clave de fila ausente y una vacía dan los dos mensajes que documenta la sección 5.1» |
| R4 | E2E «cada curl de la guía…» (11 ejemplos) y «cada petición de la colección de Postman… (tienda sin fulfillment)» (10 peticiones) |
| R5 | E2E «cada petición de la colección de Postman… (tienda con fulfillment)» |
| R6 | guardia, regla 2 |
| R7 | guardia, regla 4 |
| R8 | guardia, regla 5 («la guía no remite a archivos del repositorio») y su mutación |
| R9 | guardia, bloque «MUTACIÓN» |
| R10 | `tests/unit/ayuda/guia-api-pdf-produccion-slt208.test.ts` («SLT-208 R10») |
| R11 | `tests/unit/ayuda/guia-api-pdf-produccion-slt208.test.ts` («SLT-208 R11») |
| R12 | E2E «dos empresas, una URL: la clave B no ve ni toca la orden de la A, y su analítica no la cuenta» |

Todos los E2E están en `e2e/guia-api-ejemplos-ejecutables.spec.ts` (proyecto `aislamiento`).

## Archivos esperados

- `docs/ayuda/oficina/guia-integracion-api.md`
- `docs/api/servi-logistic-api-key.postman_collection.json`
- `lib/api/openapi-spec.ts`, `lib/api/url-produccion.ts`, `docs/api/api-key-openapi.yaml`
- `docs/api/CHANGELOG.md`
- `tests/unit/guards/api-artefactos-url-y-simbolos.guardia.test.ts`
- `tests/unit/ayuda/guia-api-pdf-produccion-slt208.test.ts`
- `e2e/guia-api-ejemplos-ejecutables.spec.ts`, `playwright.config.ts`
- Literales actualizados: `tests/unit/guards/docs-marca-heredada.guardia.test.ts`,
  `tests/unit/api/openapi-406-evidencias-url.test.ts`

## Tasks

Detalle en `tasks.md`. Todas `[x]`.
