---
titulo: Guía de integración por API
modulo: configuracion
roles: [maestro, admin]
actualizado: 2026-11-18
fuentes:
  - app/api/ordenes/api-key/
  - lib/api/openapi-spec.ts
  - lib/types/api-orden.ts
  - lib/types/cotizacion.ts
  - lib/api/analitica-api-key-dto.ts
  - lib/types/order-status.ts
  - lib/types/webhook-eventos.ts
  - lib/types/orden-evento.ts
  - lib/services/WebhookEstadoService.ts
  - lib/services/WebhookEventoOrdenService.ts
  - lib/crypto/webhook-firma.ts
  - lib/config/webhook.ts
  - lib/services/JobQueueService.ts
  - lib/types/order-status-eliminables.ts
  - lib/repositories/OrdenRepository.ts
  - lib/services/ApiHabilitacionService.ts
---

# Guía de integración — API de Servi Logistic

**Documentación técnica.** Logística de última milla. Para desarrolladores backend del comercio integrador.

Versión del documento: 18 de noviembre de 2026. Base URL de producción: `https://www.servilogistic.co`

> Todos los importes, números de guía, UUID y ejemplos de este documento son **ilustrativos**. Ninguna clave mostrada es real: siempre se usan placeholders del tipo `svl_XXXXXXXXXXXX`. El contrato completo vive en el OpenAPI del canal: se lee y se prueba en Swagger, en `https://www.servilogistic.co/api-docs`, y el mismo contrato en JSON (para generar un cliente) está en `https://www.servilogistic.co/api/docs/openapi`. Para probar sin escribir código hay una colección de Postman (sección 4.8). Los cambios del canal se resumen en la sección «Cambios» y en el historial de la sección 9; la empresa le hace llegar cada aviso de cambio.

# Contenido

- **Cambios respecto de la versión de agosto 2026**
- Qué se rompe y desde cuándo · Tabla de códigos viejo y nuevo · Eventos nuevos · Qué tiene que cambiar el integrador · Cambios ya vigentes desde agosto
- **1. Qué resuelve esta API y qué NO**
- Qué resuelve · Qué NO resuelve
- **2. Requisitos previos**
- 2.1 Primera petición: comprobar la clave
- **3. La API key**
- 3.1 Obtención · 3.2 Uso · 3.3 Alcance · 3.4 Rotación · 3.5 Revocación · 3.6 Custodia · 3.7 Varias empresas, una sola URL
- **4. Convenciones**
- 4.1 Base URL · 4.2 Headers · 4.3 Formato uniforme de error · 4.4 401 vs 403 · 4.5 Fechas y horas · 4.6 Paginación · 4.7 Catálogo de estados (respuestas REST) · 4.8 Probar con Postman y Swagger
- **5. Endpoints**
- 5.1 `POST /api/ordenes/api-key/carga` — Crear órdenes (lote de 1 a 5000)
- 5.2 `POST /api/ordenes/api-key/cotizacion` — Cotizar un lote (no crea nada)
- 5.3 `GET /api/ordenes/api-key` — Listado paginado de órdenes propias
- 5.4 `GET /api/ordenes/api-key/orden/{id}` — Detalle de una orden (por guía o remisión)
- 5.5 `POST /api/ordenes/api-key/orden/{id}/generate` — PDF de etiqueta de una orden
- 5.6 `POST /api/ordenes/api-key/carga/{cargaId}/generate` — PDF consolidado del lote
- 5.7 `DELETE /api/ordenes/api-key/orden/{id}` — Eliminar una orden propia
- 5.8 `GET /api/ordenes/api-key/analitica` — Estadísticas de gestión
- 5.9 `PUT /api/ordenes/api-key/{numGuia}/cancelar` — Cancelar una orden en bodega
- 5.10 `POST /api/ordenes/api-key/habilitar` — Habilitar pedidos con novedad (lote)
- **6. Webhooks salientes:** `orden.estado_actualizado` **y los eventos de orden**
- 6.1 Alta de la suscripción · 6.2 Cuerpo del evento · 6.3 Autenticación de la entrega · 6.4 Idempotencia y confirmación · 6.5 Estados que este webhook puede emitir · 6.6 `motivo` depende de `estado` · 6.7 Eventos de gestión y de ayuda
- **7. Checklist de puesta en producción**
- **8. Errores frecuentes y cómo diagnosticarlos**
- 8.1 Por código · 8.2 Síntomas sin error visible
- **9. Historial de versiones del documento**

# Cambios respecto de la versión de agosto 2026

Esta versión describe el canal tal como queda tras dos cambios de contrato que **rompen** integraciones existentes (bloques A y B, ya desplegados en producción) y recoge además los cambios que entraron en producción entre agosto y noviembre (bloque C). Lea primero el bloque A: es el que exige tocar código.

## **RUPTURA** Bloque A: Los estados cambian de código y ganan su nombre

**Desde cuándo.** **Ya está en producción**: el canal responde con los códigos vigentes. Se avisó a los integradores el 2026-09-24 y se desplegó **junto** con el bloque B.

**Qué se rompe.** Cada estado de una orden pasa a llamarse igual en todas partes (aplicación, rastreo público y este canal). Siete estados cambian de **código**; los cuatro resultados de gestión que compartían nombre con ellos cambian con ellos; y toda respuesta que lleva un código lleva ahora, **al lado**, su nombre visible.

### A.1 Los siete códigos de estado que cambian (el resto no cambia)

| Código anterior (agosto 2026) | Código vigente | Nombre visible (`estadoNombre`) |
| --- | --- | --- |
| `entregada` | `entregado` | Entregado |
| `devuelta` | `novedad` | Novedad |
| `reprogramada` | `reprogramado` | Reprogramado |
| `por_recoger` | `mensajero_recogiendo_en_bodega` | Mensajero recogiendo en la bodega |
| `rechazada` | `devolucion_a_origen_por_rechazo` | Devolución a origen por rechazo |
| `sin_gestionar` | `novedad_interna` | Novedad interna |
| `por_devolver` | `por_devolver_a_bodega_central` | Por devolver a bodega central |

### A.2 Los resultados de gestión se llaman como su estado destino

Aplica a `gestiones[].resultado`, `evidencias[].resultado` y a `data.resultado` / `data.resultadoAnterior` de los eventos de gestión (sección 6.7). `incidente` no cambia.

| Resultado anterior | Resultado vigente | Nombre visible |
| --- | --- | --- |
| `entregada` | `entregado` | Entregado |
| `reprogramada` | `reprogramado` | Reprogramado |
| `devuelta` | `novedad` | Novedad |
| `rechazada` | `devolucion_a_origen_por_rechazo` | Devolución a origen por rechazo |

### A.3 Campos nuevos `…Nombre`, un campo renombrado y un 422 nuevo

- **Al lado de cada código viaja su nombre visible**, siempre presente (`null` cuando el código es `null`): `estadoNombre` en el listado, el detalle, la carga (`ordenes[]` y `filas[]`), la cancelación (`estadoAnteriorNombre` y `estadoNombre`), la eliminación y la habilitación; `resultadoNombre` y `estadoResultanteNombre` en `gestiones[]`; `resultadoNombre` en `evidencias[]`; `data.estadoNombre` en `orden.estado_actualizado`, **inmediatamente detrás de** `data.estado`; `data.resultadoNombre` (y `data.resultadoAnteriorNombre`) en los eventos de gestión.
- **Campo renombrado en la carga:** `filas[].estatus` pasa a ser `filas[].estado`, con `filas[].estadoNombre` al lado.
- **Filtrar el listado por un código anterior responde** `422`, no una página vacía. El mensaje nombra el código que lo sustituye:

```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Los datos enviados no son validos.",
  "details": { "fieldErrors": { "estado": [
    "'devuelta' ya no existe: ahora se llama 'novedad' («Novedad»). Ver docs/api/CHANGELOG.md."
  ] } }
}
```

- El `enum` de estados del contrato enumera los **20 códigos vigentes** (sección 4.7). La versión de agosto listaba 16 y omitía cinco que una orden ya podía alcanzar.
- **Lo que NO cambia:** los paths, la autenticación, la firma y su verificación, y el `eventoId` de `orden.estado_actualizado`: un evento encolado antes del despliegue y entregado después llega con el código vigente y el **mismo** `eventoId`. El texto firmado sí cambia (gana `estadoNombre`): verifique siempre sobre el cuerpo crudo (sección 6.3).

## **RUPTURA** Bloque B: El estado real se aplica al aprobar el cierre; la ayuda deja de ser un estado; eventos nuevos

**Desde cuándo.** **Ya está en producción**, desplegado junto con el bloque A (aviso a los integradores del 2026-09-23).

- `orden.estado_actualizado` **llega al APROBAR el cierre del mensajero, no al gestionar.** Cuando el mensajero registra una gestión en calle, la orden **sigue en** `en_reparto` con la gestión *pendiente de confirmar*; el estado real (`entregado`, `reprogramado`, `novedad`, `devolucion_a_origen_por_rechazo`, `incidente`) se aplica cuando se aprueba el cierre del día de ese mensajero, horas después de la visita (dato de referencia de la empresa: mediana 8,2 h, p90 22,1 h). Si necesita enterarse en el instante del registro, consuma `orden.gestion_registrada`.
- **Se retiran dos estados** del vocabulario: `ayuda_tienda` (la solicitud de ayuda a la tienda deja de mover la orden: sigue `en_reparto` y la ayuda viaja como evento) y `devolucion_por_confirmar`, que nunca fue público. Ninguno vuelve a llegar en `data.estado` ni aparece en el catálogo (sección 4.7).
- **Cinco eventos nuevos**, en un cuerpo nuevo, al **mismo callback** y con la **misma firma** y el mismo circuito de reintento (sección 6.7): `orden.gestion_registrada`, `orden.gestion_anulada`, `orden.gestion_corregida`, `orden.ayuda_solicitada`, `orden.ayuda_resuelta`. Ramifique por `evento` y trate uno desconocido como «ignorar».
- **Campo nuevo en el detalle:** `gestiones[].pendienteConfirmacion` (sección 5.4). `true` mientras la gestión espera la aprobación de su cierre; entonces `estadoResultante` es `null`.
- **Campo nuevo en la habilitación:** `resultados[].ayudaCerrada` (sección 5.10). Habilitar una orden con ayuda abierta ya no cambia su estado (sigue `en_reparto`); la clave nueva dice que la ayuda quedó cerrada.

### Qué tiene que cambiar el integrador, si todavía no lo hizo

1. Busque en su código los **once literales anteriores** (los siete estados de A.1 y los cuatro resultados de A.2) y cámbielos por los vigentes. Ojo con `por_devolver`, que es prefijo de `por_devolver_a_tienda` y de `por_devolver_a_bodega_central`.
2. Si mostraba el estado con una traducción propia, use el campo `…Nombre`: es la misma cadena que ve la aplicación.
3. Si leía `filas[].estatus` en la respuesta de la carga, lea `filas[].estado`.
4. Si su receptor de webhooks rechaza eventos desconocidos, actualícelo: responda `2xx` e ignore lo que no conozca. Si su lógica de negocio dependía de recibir el estado final «en el momento», suscríbase a `orden.gestion_registrada` y lea `pendienteConfirmacion`.
5. Si valida el esquema en estricto (`additionalProperties: false`, DTO generado), **regenere su modelo** contra el contrato actualizado (`…Nombre`, `pendienteConfirmacion`, `ayudaCerrada` y el schema `WebhookOrdenEvento` son nuevos).

## **YA VIGENTE** Bloque C: Cambios que entraron en producción después de la versión de agosto

Cada uno se avisó a los integradores en su fecha. Los que quitan algo van marcados.

| Fecha | Cambio | Sección |
| --- | --- | --- |
| 2026-08-25 | **Rompe:** desaparece el campo `generado` de las respuestas de `/generate`. Además: `num_remision` pasa a ser único *por tienda* (menos filas `duplicada`); la cotización y la carga ganan el concepto `fulfillment`; con fulfillment, las órdenes nacen en `en_preparacion` y sin guía. | secciones 5.5, 5.6, 5.1 y 5.2 |
| 2026-08-28 | **Rompe:** los importes de la cotización viajan crudos (`"2500.00"`, sin símbolo ni miles). Nuevo `DELETE /api/ordenes/api-key/orden/{id}`. | secciones 5.2 y 5.7 |
| 2026-08-31 | **Rompe:** se retira `GET /api/ordenes/api-key/{numGuia}` (use `/orden/{id}`); en carga y cotización las filas con error salen de `filas` y viajan en `errores`; la cotización pierde el bloque `totales` y cada fila gana `montoCobrar`. Aditivo: la analítica admite los tres parámetros opcionales y sin tope de 366 días; el webhook empieza a emitir `en_preparacion`. | secciones 5.4, 5.1, 5.2, 5.8 y 6.5 |
| 2026-09-04 | La analítica publica el día en curso marcado con `parcial: true` y `corteAt`, y cada serie trae `cobertura`. Un integrador que sumaba `data` a ciegas incluye ahora un día a medias. | sección 5.8 |
| 2026-09-06 | Tres mensajes nuevos de error de fila: provincia, cantón o distrito *retirados del catálogo*. Sigue siendo `200` con éxito parcial. | secciones 5.1 y 5.2 |
| 2026-09-09 | Campo nuevo `mensajero` (`{ id, nombre }` o `null`, siempre presente) en el listado, el detalle y `data` del webhook. | secciones 5.3 y 6.2 |
| 2026-09-10 | Campos nuevos `gestiones[]` (detalle), `zona`, `costoEstimado` y `costoReal` (listado y detalle). Arreglo de `evidenciasUrl`: el enlace del evento de incidente ahora sí resuelve (usa la guía o la remisión, no un id interno). | secciones 5.3, 5.4 y 6.2 |
| 2026-10-01 | Sin ruptura, solo textos: el flete que se cobra cuando una orden termina en Devolución a origen por rechazo (`devolucion_a_origen_por_rechazo`) cambia de nombre: ahora se llama «Flete por devolución a origen». Ningún campo, importe ni id de métrica cambia. | secciones 5.2 y 5.3 |
| 2026-11-03 | Campo nuevo `ivaFulfillment` (texto de dos decimales, nunca `null`; `"0.00"` si su tarifa no tiene IVA de fulfillment) en `ordenes[]` de la carga, en `costos.entregado` y `costos.devuelto` de la cotización y en `costoEstimado`/`costoReal`. `costoEnvio` y los `total` de la cotización lo incluyen. Si valida con un esquema cerrado (`OrdenCosto` lleva `additionalProperties: false`), actualícelo. | secciones 5.1 a 5.4 |
| 2026-11-05 | Sin ruptura para empresas de Costa Rica, solo textos: `desde`/`hasta` (listado y analítica), el «hoy» por defecto y el eco `rango.hasta` se miden en la zona horaria del país de la empresa de la key, no en «hora de Costa Rica (UTC-6)». | secciones 4.5, 5.3 y 5.8 |
| 2026-11-18 | Sin ruptura, solo documentación: el contrato publica `manifiesto.filas[].intentos` de la carga (entero, intentos de entrega de la orden; `0` en una orden recién creada). La respuesta ya traía la clave; ahora `ManifiestoFila` la declara obligatoria. Si valida con un esquema cerrado, regenérelo. | sección 5.1 |
| 2026-11-18 | Sin ruptura, solo documentación: revisión completa de esta guía, de la colección de Postman y del contrato contra el código. La base de producción es `https://www.servilogistic.co` en los tres; el contrato vuelve a declarar ese servidor. Se corrigen los campos obligatorios de la carga (`peso` no se usa; `direccion` y `monto_cobrar` son opcionales), los mensajes de error de fila, la pantalla donde se genera la clave, la rotación, los `409` que no traen mensaje propio y la zona horaria de `desde`/`hasta`. Se añaden ejemplos ejecutables de cotización, detalle y habilitación, un ejemplo verificable de firma de webhook y la sección sobre varias empresas con una misma URL. | secciones 3, 4.8, 5 y 6.3 |
| 2026-11-20 | Sin ruptura para un cliente que ya ramifica por código HTTP: un `403` nuevo, `details.codigo: "empresa_congelada"` (`message` «Empresa suspendida por falta de pago.»), en las seis rutas que escriben mientras la empresa tiene facturas de la plataforma vencidas sin pagar. No tiene efectos y llega antes de validar el cuerpo. Las consultas y la cotización no cambian. | secciones 4.3, 4.4 y 8.1 |

La versión de agosto además **omitía dos endpoints que ya existían** —`PUT …/{numGuia}/cancelar` y `POST …/habilitar`— y describía la eliminación con la ruta y la respuesta equivocadas. Quedan documentados en las secciones 5.7, 5.9 y 5.10.

# 1. Qué resuelve esta API y qué NO

## Qué resuelve

La API de Servi Logistic le permite a su sistema (e-commerce, ERP, WMS) operar sus envíos sin entrar a la aplicación web:

| Necesidad | Cómo se resuelve |
| --- | --- |
| Cotizar antes de despachar | `POST /api/ordenes/api-key/cotizacion` |
| Crear órdenes en firme, en lote de 1 a 5000 | `POST /api/ordenes/api-key/carga` |
| Listar y filtrar sus órdenes | `GET /api/ordenes/api-key` |
| Ver el detalle, las evidencias y el historial de gestiones de una orden | `GET /api/ordenes/api-key/orden/{id}` |
| Imprimir etiquetas (una orden o el lote completo) | `POST …/orden/{id}/generate` y `POST …/carga/{cargaId}/generate` |
| Eliminar una orden que todavía no se movió hacia el cliente | `DELETE /api/ordenes/api-key/orden/{id}` |
| Cancelar una orden que ya está en bodega o en ruta a ella | `PUT /api/ordenes/api-key/{numGuia}/cancelar` |
| Reactivar pedidos con novedad o con ayuda pendiente | `POST /api/ordenes/api-key/habilitar` |
| Estadísticas de gestión | `GET /api/ordenes/api-key/analitica` |
| Enterarse de los cambios de estado y de cada gestión | Webhooks `orden.estado_actualizado`, `orden.gestion_*` y `orden.ayuda_*` |

## Qué NO resuelve

- **No hay registro self-service.** No existe un endpoint para crear API keys ni suscripciones de webhook: las emite la empresa.
- **La cotización no reserva ni crea nada.** Es lectura pura.
- **No hay edición de órdenes.** No existe un endpoint para modificar los datos de una orden ya creada (destinatario, dirección, monto). Las mutaciones publicadas son crear, cancelar, eliminar, habilitar y generar etiquetas.
- **La analítica no publica importes** ni identifica mensajeros; el listado no se puede filtrar ni ordenar por mensajero, zona ni costo.

# 2. Requisitos previos

Antes de escribir la primera línea de código:

1. **Requiere una API key emitida por la empresa** (ver sección 3).
2. *Opcional pero recomendado:* **un endpoint HTTPS público propio** para recibir los webhooks (ver sección 6). Sin él, su sistema solo se entera de los cambios si consulta por su cuenta.

## 2.1 Primera petición: comprobar la clave

Antes de cargar nada, compruebe que su clave y su cliente HTTP funcionan con una lectura que no cambia nada: el listado con una sola fila.

```bash
curl "https://www.servilogistic.co/api/ordenes/api-key?limit=1" \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

Si todo está bien, la respuesta es `200` con las claves `items` (vacía si todavía no tiene órdenes) y `pagination`:

```json
{ "items": [], "pagination": { "limit": 1, "offset": 0, "total": 0 } }
```

Un `401` es un problema de la clave o del header (sección 3.2); un `403`, de la cuenta (hable con la empresa).

# 3. La API key

## 3.1 Obtención

- **La emite la empresa, no el integrador.** La genera el usuario con rol **maestro** de la empresa, en la aplicación de Servi Logistic: menú **Configuración**, opción **API** (ruta `https://www.servilogistic.co/configuracion/api`), botón **Generar API key**. Ningún otro rol ve esa pantalla.
- Al generarla se elige un identificador y, si las órdenes deben quedar a nombre de una tienda ya registrada, la **tienda destino**. En el mismo formulario se puede registrar la URL del webhook (sección 6.1).
- El secreto se muestra **una sola vez**, al crearla. Tiene la forma `svl_` seguido de 43 caracteres (letras, dígitos, `-` y `_`).
- El comercio la solicita a la empresa y la empresa la entrega por un canal seguro acordado.

## 3.2 Uso

Enviar en **todos** los endpoints, sin excepción:

```text
Authorization: Bearer svl_XXXXXXXXXXXX
```

- El nombre del header es `Authorization` y el esquema es `Bearer`, separado de la clave por **un solo espacio**. Con dos espacios, sin `Bearer` o con la clave vacía, la respuesta es `401`.
- La clave se manda entera, tal como se la entregaron, con el prefijo `svl_` incluido.
- No hay otra forma de autenticarse: ni parámetro en la URL, ni cookie, ni usuario y contraseña.

## 3.3 Alcance

Cada key está atada a una **cuenta dedicada** de integración. El **dueño** de las órdenes es esa cuenta o, si la key se emitió apuntando a una tienda ya registrada en Servi Logistic, esa tienda. En cualquiera de los dos casos, **toda llamada opera solo sobre las órdenes de ese dueño**: no hay forma de ampliar el alcance (un `tiendaId` u `owner` en la query se ignora), y una orden ajena responde el mismo `404` que una inexistente.

## 3.4 Rotación

No se rota desde el lado del integrador: se **solicita a la empresa**. En la misma pantalla de la sección 3.1, la empresa **rota** la clave: emite un secreto nuevo para la misma clave y el anterior deja de valer en ese instante (responde `401`). Pídala cuando:

- La key se perdió (no es recuperable: la empresa tampoco puede volver a mostrarla).
- Se sospecha exposición (repositorio, log, frontend, ticket de soporte).
- El integrador deja de operar con esa cuenta.

Diseñe su despliegue para poder **cambiar el secreto sin recompilar**: variable de entorno o gestor de secretos, leída en caliente o con un reinicio corto.

## 3.5 Revocación

La empresa puede desactivar la key **o** la cuenta dedicada (y, si la key apunta a una tienda, dar de baja esa tienda). En todos los casos las llamadas pasan a responder `403`.

Si la empresa **elimina** la clave, deja de existir y las llamadas responden `401`, igual que una clave que nunca existió.

## 3.6 Custodia

Guárdela como **secreto de servidor**: variable de entorno o gestor de secretos. **Nunca** en frontend, repositorio ni logs.

## 3.7 Varias empresas, una sola URL

Todas las empresas que usan Servi Logistic, y todos sus integradores, llaman a **la misma URL** (`https://www.servilogistic.co`). No hay un dominio ni una ruta por empresa. Lo que separa a una empresa de otra es **la clave**:

- **Cada empresa genera sus propias claves**, en su propia pantalla de configuración (menú **Configuración**, opción **API**, ruta `/configuracion/api`, sección 3.1). Una clave generada por una empresa no sirve en otra.
- **La clave identifica a la empresa y a la tienda.** Cuando llega una petición, Servi Logistic busca la clave y de ella saca la empresa y el dueño de las órdenes (la cuenta dedicada o la tienda destino). Ese dato no sale nunca de la petición.
- **Una clave solo ve y crea órdenes de su empresa**, y dentro de ella solo las de su dueño. Las órdenes que crea quedan en esa empresa; el listado, el detalle, las etiquetas, la cancelación, la eliminación, la habilitación y la analítica solo cuentan y tocan esas órdenes.
- **Nunca mande el id de la empresa** (ni de la tienda) en la petición: no existe ningún parámetro para eso, y si lo manda se ignora.
- **Si una clave intenta leer o tocar una orden de otra empresa**, la respuesta es `404` (`NOT_FOUND`, «El recurso solicitado no existe.»), exactamente la misma que para una orden que no existe. No es `403`: la API no revela si la orden existe en otra empresa. En el listado esa orden simplemente no aparece, y filtrar por su guía o su remisión devuelve una página vacía. La analítica de una empresa no cuenta órdenes de otra.

Consecuencia práctica: si su sistema trabaja con varias empresas de Servi Logistic, necesita **una clave por empresa** y debe elegir la clave según la empresa a la que va cada orden. La URL es siempre la misma.

# 4. Convenciones

## 4.1 Base URL

| Ambiente | URL |
| --- | --- |
| Producción | `https://www.servilogistic.co` |

Todas las rutas de esta guía se escriben a continuación de esa base, por ejemplo `https://www.servilogistic.co/api/ordenes/api-key/carga`. Use exactamente esa base: `https` y el host con `www`. Esta guía solo documenta producción; si la empresa le indica otra URL (por ejemplo, un ambiente de pruebas), guarde la base en una variable de su configuración y cámbiela ahí, nunca en el código.

## 4.2 Headers

| Header | Cuándo | Valor |
| --- | --- | --- |
| `Authorization` | Siempre | `Bearer svl_XXXXXXXXXXXX` |
| `Content-Type` | Solo en requests con cuerpo | `application/json` |

## 4.3 Formato uniforme de error

Todos los errores comparten esta forma (`details` es opcional; en un `422` trae `fieldErrors`, un mapa *de cada campo a su lista de mensajes*):

```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Los datos enviados no son validos.",
  "details": { "fieldErrors": { "campo": ["mensaje"] } }
}
```

| `code` | HTTP | `message` |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Los datos enviados no son validos. |
| `UNAUTHORIZED` | 401 | No hay una sesion valida. |
| `FORBIDDEN` | 403 | No tienes permiso para realizar esta accion. (En analítica, con el módulo apagado: «El módulo Analítica no está activo para esta empresa.», ver sección 5.8. En las seis rutas que escriben, con la empresa suspendida por falta de pago: «Empresa suspendida por falta de pago.», con `details.codigo: "empresa_congelada"`, ver sección 4.4) |
| `NOT_FOUND` | 404 | El recurso solicitado no existe. |
| `CONFLICT` | 409 | La operacion entra en conflicto con el estado actual. Solo tres casos traen un mensaje propio: la carga y la cotización sin ninguna tarifa (secciones 5.1 y 5.2) y el nombre de lote repetido (sección 5.1). |
| `INTERNAL` | 500 | Error interno del servidor. |

Los textos del `message` van sin tildes en los cinco mensajes genéricos; compárelos tal cual o, mejor, ramifique por `code` y por el código HTTP.

## 4.4 401 vs 403

| Código | Significado |
| --- | --- |
| `401` | No mandó key (header ausente, esquema distinto de `Bearer`, más de un espacio o token vacío), **o** la key no existe (nunca existió, fue eliminada o su secreto se rotó). Atención: los casos son indistinguibles a propósito. |
| `403` | La key existe, pero está desactivada, **o** su cuenta dedicada no está activa, **o** la tienda a la que apunta fue dada de baja. En analítica, además: pidió una métrica no publicable, o la empresa no tiene activo el módulo de Analítica (sección 5.8). En las seis rutas que escriben, además: la empresa está suspendida por falta de pago (ver abajo). |

Consecuencia práctica: un `401` es problema de su cliente HTTP o de su secreto; un `403` requiere hablar con la empresa (salvo el de analítica).

**Empresa suspendida por falta de pago.** Si la empresa tiene facturas de la plataforma vencidas y sin pagar, su operación queda suspendida. Mientras dure, las seis rutas que escriben responden `403` sin hacer nada, antes de validar el cuerpo:

- `POST /api/ordenes/api-key/carga`;
- `POST /api/ordenes/api-key/carga/{cargaId}/generate`;
- `POST /api/ordenes/api-key/habilitar`;
- `PUT /api/ordenes/api-key/{numGuia}/cancelar`;
- `POST /api/ordenes/api-key/orden/{id}/generate`;
- `DELETE /api/ordenes/api-key/orden/{id}`.

```json
{
  "status": "error",
  "code": "FORBIDDEN",
  "message": "Empresa suspendida por falta de pago.",
  "details": { "codigo": "empresa_congelada" }
}
```

Las consultas (`GET`) y la cotización (`POST /api/ordenes/api-key/cotizacion`) siguen respondiendo igual. Ramifique por `details.codigo`: con `empresa_congelada` no reintente en bucle ni cambie la key; avise a la empresa. La suspensión se levanta en cuanto queda pagado lo vencido o la plataforma reactiva la empresa, y vale desde la petición siguiente.

## 4.5 Fechas y horas

- **Fechas de calendario:** `YYYY-MM-DD`, medidas en la **zona horaria del país de la empresa**. Deben ser fechas reales: `2026-02-31` es `422`.
- **Timestamps:** ISO 8601 en UTC (`2026-09-22T14:03:11.000Z`).

> Mezclar los dos sistemas es el error más común: si convierte un timestamp UTC a fecha de calendario sin pasar a la zona horaria del país de la empresa, las órdenes de la noche caen en el día siguiente y sus filtros `desde`/`hasta` no cuadran con lo que ve en la aplicación.

## 4.6 Paginación

Solo el listado (sección 5.3) pagina, con `limit` (1..100, default 50) y `offset` (0 o más, default 0). La respuesta trae:

```json
"pagination": { "limit": 50, "offset": 0, "total": 1 }
```

Recorra incrementando `offset` en `limit` hasta alcanzar `total`. El orden de las filas es estable entre páginas.

## 4.7 Catálogo de estados (respuestas REST)

Son **20 códigos**. Todo campo que lleva un código (`estado`, `estadoAnterior`, `estadoResultante`, `resultado`, `resultadoAnterior`) va acompañado de su nombre visible en el campo hermano `…Nombre` (`estadoNombre`, `resultadoNombre`, …), que es **exactamente la cadena que muestra la aplicación**. Compare por el código; muestre el nombre.

| Código | Nombre visible | Qué significa | Webhook |
| --- | --- | --- | --- |
| `por_recolectar_en_tienda` | Por recolectar en tienda | El paquete está en la tienda y todavía no hay un mensajero asignado para recogerlo. | Sí |
| `recolectando` | Recolectando | Ya hay un mensajero asignado y va camino a la tienda a recoger el paquete. | No |
| `en_ruta_bodega_central` | En ruta a bodega central | El mensajero recogió el paquete en la tienda y lo lleva a la bodega central. | Sí |
| `en_preparacion` | En preparación | El paquete ya está en nuestra bodega y se está preparando su guía para despacharlo. | Sí |
| `en_bodega_central` | En bodega central | El paquete está en la bodega central, listo para asignarse a un mensajero o enviarse a una bodega satélite. | Sí |
| `en_ruta_bodega_satelite` | En ruta a bodega satélite | El paquete viaja desde la bodega central hacia la bodega satélite de su zona. | No |
| `en_bodega_satelite` | En bodega satélite | El paquete llegó a la bodega satélite de su zona y espera ser asignado a un mensajero. | No |
| `mensajero_recogiendo_en_bodega` | Mensajero recogiendo en la bodega | El paquete ya tiene mensajero asignado, que debe recogerlo en la bodega para salir a reparto. | No |
| `en_reparto` | En reparto | El mensajero tiene el paquete y lo lleva al destinatario. Si ya lo gestionó, verá el resultado como «pendiente de confirmación» hasta que se apruebe su cierre del día. | Sí |
| `entregado` | Entregado | El paquete fue entregado al destinatario y la bodega lo confirmó al aprobar el cierre del mensajero. | Sí |
| `reprogramado` | Reprogramado | No se pudo entregar y se acordó una nueva fecha. El paquete vuelve a su bodega para asignarse de nuevo. | Sí |
| `novedad` | Novedad | El mensajero no pudo entregar el paquete (cliente no localizado, número o dirección errados). La tienda debe decidir si se vuelve a intentar o se devuelve. Si no responde: con cliente no localizado, a las 24 horas vuelve a salir a reparto; con número o dirección errados, a los 5 días se devuelve a la tienda. Si ya agotó sus intentos, se devuelve antes. | Sí |
| `novedad_interna` | Novedad interna | El mensajero terminó el día con el paquete aún pendiente. Al aprobarse su cierre, el paquete vuelve a su bodega para asignarse de nuevo. | No |
| `devolucion_a_origen_por_rechazo` | Devolución a origen por rechazo | El destinatario rechazó el paquete. Al aprobarse el cierre, empieza su regreso a la tienda. | Sí |
| `incidente` | Incidente | El paquete se dañó, se perdió o fue robado. Quedó reportado para su revisión. | Sí |
| `por_devolver_a_bodega_central` | Por devolver a bodega central | El paquete devuelto está en la bodega satélite, esperando ser enviado a la bodega central. | No |
| `devolviendo_a_bodega_central` | Devolviendo a bodega central | El paquete devuelto viaja de la bodega satélite a la bodega central. | No |
| `por_devolver_a_tienda` | Por devolver a tienda | El paquete devuelto está en la bodega central, esperando ser enviado a la tienda. | No |
| `devolviendo_a_tienda` | Devolviendo a tienda | El paquete va camino de regreso a la tienda. También pasa aquí cuando la tienda cancela el envío. | Sí |
| `devuelta_a_tienda` | Devuelta a tienda | La tienda recibió de vuelta su paquete. Fin del recorrido. | Sí |

La columna «Webhook» dice si ese estado viaja en `orden.estado_actualizado` (sección 6.5). **Resultados de una gestión** (`gestiones[].resultado`, `evidencias[].resultado`, eventos de gestión): cinco códigos, los mismos que su estado destino: `entregado`, `reprogramado`, `novedad`, `devolucion_a_origen_por_rechazo`, `incidente` (en `evidencias[]` solo los tres que producen fotos: `entregado`, `devolucion_a_origen_por_rechazo`, `incidente`).

La lista puede crecer de forma aditiva, con aviso previo. Un código anterior al cambio de nombres (sección de cambios, A.1) responde `422` si se usa como filtro. Trate un código desconocido como «ignorar», no como error.

## 4.8 Probar con Postman y Swagger

**Swagger.** El contrato se puede leer y probar en `https://www.servilogistic.co/api-docs`, sin iniciar sesión. El JSON del contrato está en `https://www.servilogistic.co/api/docs/openapi`. El contrato declara dos servidores: el primero, «Este servidor», es el mismo sitio donde abrió Swagger, y es el que usa «Try it out»; el segundo es producción, `https://www.servilogistic.co`, y es la base que debe usar su cliente (si lo genera desde el contrato, elija ese). Para probar desde Swagger pulse **Authorize** y pegue la clave sola, sin la palabra `Bearer` (Swagger la añade).

**Postman.** La colección `servi-logistic-api-key.postman_collection.json` trae una petición por endpoint. La descarga la empresa desde la aplicación (Ayuda, «Guía de integración por API», botón **Colección de Postman**) y se la entrega al integrador junto con la clave. Para usarla:

1. Importe el archivo en Postman (Import).
2. Abra la colección, pestaña **Variables**, y ponga su clave en `apiKey`. La variable `baseUrl` ya viene con `https://www.servilogistic.co`, sin barra final.
3. Si la empresa le indicó otra URL, no edite las peticiones: cambie solo `baseUrl`, o cree un entorno de Postman (Environments) con una variable `baseUrl`, que tiene prioridad sobre la de la colección.
4. Ejecute las peticiones en el orden en que vienen. La carga guarda en variables la guía, la remisión y el lote que usan las siguientes.
5. Si su tienda tiene **fulfillment**, la orden nace sin guía (sección 5.1). Entonces «6. PDF de etiqueta de una orden» y «7. PDF consolidado de un lote» responden `409` (no hay etiqueta imprimible todavía) y sus tests lo dan por bueno, y «9. Cancelar una orden» no aplica: no se envía, porque cancelar pide guía. Las demás funcionan igual.

Atención: la colección **crea órdenes reales** en la cuenta de la clave. Elimine después las que no quiera conservar (sección 5.7).

# 5. Endpoints

Todos requieren `Authorization`. Todos operan únicamente sobre las órdenes del dueño de la key (sección 3.3).

## 5.1 **POST** `/api/ordenes/api-key/carga` — Crear órdenes (lote de 1 a 5000)

**Estado inicial:** depende de la configuración de la tienda (fulfillment: el paquete ya está en la bodega de la empresa).

| Configuración de la tienda | Estado en que nace la orden | Guía | Manifiesto |
| --- | --- | --- | --- |
| Sin fulfillment | `por_recolectar_en_tienda` | Se asigna en el acto (`numGuia` entero) | Sí (el lote produce un movimiento de la tienda a la bodega) |
| Con fulfillment | `en_preparacion` | **Ninguna todavía** (`numGuia: null`); se emite después, al preparar la orden | No |

> `monto_cobrar` **no acepta decimales.** La cifra se redondea a la unidad entera más cercana de la moneda del país de la empresa (el medio sube). Si su sistema maneja centavos, redondee usted antes de enviar para que el COD que cobra el mensajero coincida con el que muestra su tienda; si no, el redondeo lo hace Servi Logistic y la fila creada lo declara en `montoAjustado: { original, aplicado }`.

Cada fila es un objeto cuyos valores son **todos texto** (entre comillas, también los números). Un valor que no es texto (`26`, `null`, `true`) hace que el lote entero responda `422`.

| Campo | Requerido | Error de fila si viene vacío |
| --- | --- | --- |
| `num_remision` | Sí. Es la clave de deduplicación (única entre sus órdenes vivas) | `num_remision es obligatorio` |
| `destinatario` | Sí | `destinatario es obligatorio` |
| `telefono` | Sí | `telefono es obligatorio` |
| `producto` | Sí | `producto es obligatorio` |
| `provincia` | Sí. Nombre del catálogo, por ejemplo `"San José"` | `provincia no encontrada` |
| `canton` | Sí. Nombre del cantón dentro de la provincia | `canton no encontrado en la provincia` |
| `distrito` | Sí. Su zona decide la tarifa | `distrito requerido: la zona de la orden se deriva del distrito` |
| `direccion` | No, pero sin ella el mensajero no sabe a dónde ir | |
| `monto_cobrar` | No. Monto contra entrega, en la moneda del país de la empresa; vacío o ausente = no se cobra nada al destinatario | `monto_cobrar debe ser numerico y no negativo` |
| `notas` | No | |

Atención: en `num_remision`, `destinatario`, `telefono` y `producto` el mensaje depende de cómo falta el dato. Si la clave viene **vacía** (`"telefono": ""`), el error es `telefono es obligatorio`; si la clave **no viene** en la fila, el error es `Este campo es obligatorio`, bajo la misma clave (`{ "telefono": ["Este campo es obligatorio"] }`). En `provincia`, `canton` y `distrito` una clave ausente da el mismo error que una vacía.

Cualquier otra clave de la fila se ignora. En particular, **`peso` no se usa**: puede mandarlo, pero no se guarda ni cambia el precio.

El sobre admite además dos claves opcionales: `name` (nombre del lote, 1..120 caracteres; repetirlo dentro de la misma cuenta responde `409` con el mensaje `ya existe una carga con el nombre '<name>'` y no crea nada) y `download_type` (`consolidate`, el valor por defecto, o `individual`: una URL de etiqueta por orden en `ordenes[].downloadUrl`).

**Límites del lote:** entre 1 y 5000 filas, y la petición tiene **60 segundos** para terminar. Un lote que tarda más se corta con un error de la plataforma, que no tiene la forma de la sección 4.3; si le pasa, mande lotes más pequeños (por ejemplo, de 500 filas) y consulte el listado (sección 5.3) antes de reintentar, porque las órdenes ya creadas responden `duplicada`. Lote vacío: `422` con `el lote no puede estar vacío`; más de 5000: `422` con `el lote excede el máximo permitido`; cuerpo que no es JSON: `422` con `cuerpo JSON inválido`. Los tres mensajes llegan en `details.fieldErrors.ordenes`.

### Request

```bash
curl -X POST https://www.servilogistic.co/api/ordenes/api-key/carga \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "ordenes": [
      { "num_remision": "REM-0001", "destinatario": "Juan Pérez", "telefono": "88887777",
        "provincia": "San José", "canton": "San José", "distrito": "Carmen",
        "direccion": "Av. Central, 200m norte del parque", "producto": "Camiseta talla M",
        "monto_cobrar": "26000", "notas": "Entregar en la tarde" },
      { "num_remision": "REM-0002", "destinatario": "María Solís", "telefono": "",
        "provincia": "San José", "canton": "Escazú", "distrito": "San Rafael",
        "direccion": "Multiplaza, local 12", "producto": "Zapatos talla 38",
        "monto_cobrar": "40000" }
    ]
  }'
```

### Response `200` — éxito parcial (una creada, una con error)

```json
{
  "total": 2, "creadas": 1, "duplicadas": 0, "conError": 1,
  "filas": [
    { "fila": 1, "numRemision": "REM-0001", "resultado": "creada",
      "estado": "por_recolectar_en_tienda", "estadoNombre": "Por recolectar en tienda",
      "numGuia": 100234 }
  ],
  "errores": [
    { "fila": 2, "numRemision": "REM-0002", "resultado": "error",
      "errores": { "telefono": ["telefono es obligatorio"] } }
  ],
  "ordenes": [
    { "id": "6f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f", "numRemision": "REM-0001", "numGuia": 100234,
      "estado": "por_recolectar_en_tienda", "estadoNombre": "Por recolectar en tienda",
      "costoEnvio": "3.39", "fulfillment": "0.00", "ivaFulfillment": "0.00", "downloadUrl": null }
  ],
  "cargaId": "9c2b7f10-5d3a-4e21-9a4b-77c8e0f1a2b3",
  "downloadType": "consolidate",
  "etiquetasPdf": { "url": "https://<host-de-storage>/object/sign/etiquetas/...", "expiraEnSegundos": 3600 },
  "manifiesto": { "filas": [ { "...": "..." } ], "omitidas": [] }
}
```

### Comportamientos que debe manejar

- **Dos listas.** `filas` trae solo lo que entró (`creada` y `duplicada`; en una duplicada, `estado` es el de la orden que ya ocupa esa remisión); `errores` trae solo lo que no se creó, con el detalle por campo. Los contadores se calculan sobre el lote completo: `conError === errores.length`. La pregunta «¿falló algo?» se responde con `errores.length`.
- `cargaId` **es** `null` **si no se creó ninguna orden.** Se necesita para el PDF consolidado del lote (sección 5.6): guárdelo cuando no sea nulo.
- `costoEnvio` es flete + IVA + fulfillment + IVA del fulfillment de la tarifa vigente del par (tienda, zona), en texto de dos decimales; `fulfillment` es la parte de ese total que corresponde al servicio de bodega y `ivaFulfillment` su IVA (los dos `"0.00"` si su tienda no lo tiene). Es distinto del COD.
- Atención: **Una fila puede no crear orden por un problema de tarifa o de cobertura.** Vuelve en `errores` con la clave `tarifa`, que agrupa dos causas distintas: (1) no hay tarifa vigente para el par (tienda, zona del distrito de la fila); (2) la zona no tiene cobertura de la empresa. En ambos casos el mensaje es el mismo: `{ "tarifa": ["no hay tarifa vigente para la zona de esta fila"] }`. Es un tema comercial con la empresa, no de código.
- Una provincia, un cantón o un distrito **retirados del catálogo** producen un error de fila propio, bajo la clave del nivel afectado: `la provincia esta retirada del catalogo`, `el canton esta retirado del catalogo`, `el distrito '<nombre>' esta retirado del catalogo`. Un nodo retirado no vuelve solo: corrija la dirección o pida a la empresa reactivarlo.
- Atención: `409` **si NINGUNA de las filas que llegaron a la resolución de tarifa la resolvió.** En ese caso no se persiste nada: ni órdenes, ni lote, ni notificación. `{ "status": "error", "code": "CONFLICT", "message": "la tienda no tiene una tarifa vigente asociada: no se pueden crear órdenes" }`
- Una fila creada puede traer además `montoAjustado` (si se redondeó el COD) y `textoNormalizado` (lista de `{ campo, original, aplicado }` con los textos que hubo que reparar para poder imprimir la etiqueta). Ambos se omiten cuando no hubo ajuste.
- `etiquetasPdf`, `manifiesto` y `ordenes[].downloadUrl` son *best-effort*: si el PDF o el manifiesto no se pudo armar, la carga **no se revierte** y el bloque llega como `{ "error": "…" }`; `null` significa que no había nada que generar. La URL del PDF de la carga vence en 1 hora (`expiraEnSegundos: 3600`); para volver a obtenerla use la sección 5.6. Estos tres bloques están en el contrato OpenAPI publicado (`CargaResponse`, `CargaOrden.downloadUrl`).
- `manifiesto.filas[]` trae una fila por orden del lote (`ManifiestoFila`). Una de sus claves es `intentos`: un entero, nunca `null`, con los intentos de entrega de la orden (visitas de entrega sin entrega, contadas una por cierre aprobado con al menos una gestión no anulada de resultado `novedad`, `reprogramado` o `devolucion_a_origen_por_rechazo`). Sin intentos vale `0`, y en la respuesta de la carga siempre es `0` porque las órdenes acaban de crearse. Como el conjunto de columnas del manifiesto puede crecer, ignore las claves que no conozca.

## 5.2 **POST** `/api/ordenes/api-key/cotizacion` — Cotizar un lote (no crea nada)

Acepta **el mismo cuerpo que** `/carga`**, sin recortarlo**: las claves que no usa se ignoran. Puede reutilizar literalmente el payload que va a mandar a `/carga`.

Diferencias con `/carga`:

- Solo importan `provincia`, `canton`, `distrito` (la terna decide la zona y la tarifa) y `monto_cobrar` (base de la comisión; vacío o ausente se trata como cero). `direccion` se acepta y no participa del precio.
- `num_remision` es **opcional** acá y solo sirve para correlacionar. Si falta, la fila responde `numRemision: null`. No se deduplica.
- Mismo tope: 1..5000 filas, y el mismo límite de 60 segundos por petición. El precio se calcula suponiendo que la orden cobra comisión COD.

### Request

```bash
curl -X POST https://www.servilogistic.co/api/ordenes/api-key/cotizacion \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "ordenes": [
      { "num_remision": "REM-0001", "provincia": "San José", "canton": "San José",
        "distrito": "Carmen", "monto_cobrar": "25900" },
      { "provincia": "San José", "canton": "San José", "distrito": "Barrio Inventado",
        "monto_cobrar": "18000" }
    ]
  }'
```

### Response `200`

```json
{
  "total": 2, "cotizadas": 1, "conError": 1,
  "filas": [
    { "fila": 1, "numRemision": "REM-0001", "montoCobrar": "25900.00", "resultado": "cotizada",
      "costos": {
        "entregado": { "flete": "2500.00", "iva": "325.00", "comision": "906.50",
                       "ivaComision": "117.85", "fulfillment": "0.00", "ivaFulfillment": "0.00", "total": "22050.65" },
        "devuelto":  { "flete": "1396.46", "iva": "181.54", "comision": "0.00",
                       "fulfillment": "0.00", "ivaFulfillment": "0.00", "total": "-1578.00" }
      } }
  ],
  "errores": [
    { "fila": 2, "numRemision": null, "resultado": "error",
      "errores": { "distrito": ["distrito no encontrado en el canton"] } }
  ]
}
```

### Comportamientos que debe manejar

- **Lectura pura.** No crea órdenes, no consume números de guía, no persiste nada.
- **Importes crudos:** texto con dos decimales y punto decimal, sin símbolo de moneda ni separador de miles (`"2500.00"`, `"-1578.00"`). Es el mismo dialecto que `costoEnvio`, `costoEstimado` y `costoReal`.
- **Devuelve los dos escenarios:** `entregado` (siete conceptos; `total` es lo que *recibe* la tienda = monto a cobrar − los seis conceptos cobrados, y puede ser negativo) y `devuelto` (seis conceptos, sin `ivaComision`; `comision` es un cero explícito; `total` es la *deuda* de la tienda, negativo). El escenario `devuelto` es lo que se cobra cuando la orden termina en `devolucion_a_origen_por_rechazo`: una novedad que sigue viva no cobra nada por sí sola.
- `montoCobrar` es **el valor sobre el que se cotizó**: ya redondeado a la unidad entera, igual que en la carga (`"11898.81"` se cotiza como `"11899.00"`), y `"0.00"` si la fila no traía monto.
- No hay bloque de totales del lote: la cotización es **por orden**. Si necesita un agregado, súmelo usted con la tasa de entrega real de su operación.
- Una fila queda en `errores` por: terna ausente o vacía, distrito no encontrado o ambiguo, distrito sin zona, nivel retirado del catálogo, `monto_cobrar` con formato inválido, o (clave `tarifa`) sin tarifa vigente. `422` solo por el lote entero (vacío, por encima del tope o con valores que no son texto).
- `409` con el mismo criterio que la carga: `{ "status": "error", "code": "CONFLICT", "message": "la tienda no tiene una tarifa vigente asociada: no se puede cotizar" }`

## 5.3 **GET** `/api/ordenes/api-key` — Listado paginado de órdenes propias

Todos los query params son **opcionales**, se combinan en **AND**, y solo **acotan dentro de sus órdenes**. Nunca amplían el alcance. Parámetros desconocidos se ignoran.

| Param | Tipo | Detalle |
| --- | --- | --- |
| `limit` | entero | 1..100, default 50 |
| `offset` | entero | 0 o más, default 0 |
| `estado` | string | Valor **exacto** del catálogo (sección 4.7, uno de los 20). Un código anterior al cambio de nombres responde `422` nombrando el vigente; cualquier otro valor, `422` genérico. |
| `desde` / `hasta` | `YYYY-MM-DD` | Fecha de creación, **inclusivas**, medidas en la zona horaria del país de la empresa (sección 4.5). Una fecha que no existe es `422` (`Fecha invalida (formato YYYY-MM-DD).`). `desde > hasta` es `422` (en `fieldErrors.hasta`). |
| `num_guia` | entero | Guía exacta. Excluye las órdenes que aún no tienen guía. Una guía de otro dueño devuelve una página vacía, no `404`. |
| `num_remision` | string | Atención: Coincidencia **exacta**: sin prefijo, sin subcadena, distingue mayúsculas. |

En este endpoint un parámetro presente pero vacío no cuenta como ausente: `limit=`, `estado=`, `desde=`, `hasta=`, `num_guia=` o `num_remision=` responden `422`. Si no lo quiere usar, no lo mande.

### Request

```bash
curl "https://www.servilogistic.co/api/ordenes/api-key?limit=50&offset=0&estado=en_reparto&desde=2026-09-01&hasta=2026-09-21" \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

### Response `200`

```json
{
  "items": [
    { "numGuia": 100234, "numRemision": "REM-0001",
      "estado": "en_reparto", "estadoNombre": "En reparto",
      "destinatario": "Juan Pérez", "telefonoDest": "88887777", "producto": "Camiseta talla M",
      "direccion": "Av. Central, 200m norte del parque", "montoCobrar": 26000,
      "createdAt": "2026-09-20T14:03:11.000Z",
      "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000aa", "nombre": "Carlos Jiménez Mora" },
      "zona": { "id": "018f2c31-0000-4000-8000-0000000000b1", "nombre": "GAM" },
      "costoEstimado": { "flete": "2500.00", "iva": "325.00", "comision": "906.50",
                         "ivaComision": "117.85", "fulfillment": "0.00", "ivaFulfillment": "0.00" },
      "costoReal": null }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 1 }
}
```

Las catorce claves del ítem están **siempre presentes**. Tres de ellas merecen una lectura aparte:

- `mensajero` es **quién lleva la orden en el momento de la lectura** (`null` = nadie), no quién la gestionó; varios flujos limpian la asignación (generación de guía, quitar mensajero, devolución o recuperación a bodega, liberación de una orden en `reprogramado`, el barrido del cierre diario). Agrupe por `id` (UUID en texto, estable), nunca por `nombre`. Para «quién gestionó cada intento», use `gestiones[]` del detalle.
- `zona` es la **zona del envío** (a dónde va el paquete; nunca `null`), no la del mensajero. Misma forma y misma regla que `mensajero`: agrupe por `id`.
- `costoEstimado` y `costoReal` son lo que ese paquete le cuesta a su tienda **si se entrega**, con exactamente seis conceptos (el sexto, `ivaFulfillment`, es el IVA del fulfillment) y sin ningún campo que los sume. `costoEstimado` se calcula con la tarifa vigente *hoy* y **puede cambiar entre dos lecturas** mientras `costoReal` sea `null`; `costoReal` es lo que se congeló cuando la orden entró en un cierre aprobado y ya no se mueve (salvo un segundo cierre aprobado: se publica el más reciente). `costoEstimado: null` significa «no hay tarifa configurada para su tienda en esa zona» (avise a la empresa), **no** envío gratis; `costoReal: null` significa «todavía no entró en ningún cierre aprobado». Archive `costoReal`, no el estimado. Si la orden termina en Devolución a origen por rechazo (`devolucion_a_origen_por_rechazo`), lo que se factura es el escenario `devuelto` de la cotización, no estos importes.

## 5.4 **GET** `/api/ordenes/api-key/orden/{id}` — Detalle de una orden (por guía o remisión)

Acepta el **número de guía** o el **número de remisión** en la misma posición de la ruta (`{id}`: 1..128 caracteres, se recortan los espacios de borde; si no cumple, `422`). La remisión se manda codificada como componente de ruta si lleva `/`, `?`, `#`, `%` o espacios.

**Regla de resolución:**

1. Si el valor es un entero positivo en forma canónica (`^[1-9][0-9]*$`, sin ceros a la izquierda), se busca **primero por** `num_guia`.
2. Si no hay coincidencia, se busca por `num_remision` (igualdad exacta, distingue mayúsculas). Un valor que no es entero canónico (`"007"`, `"REM-1"`) se busca solo por remisión.

> **Si un mismo valor casa con la guía de una orden y con la remisión de otra, se prioriza la guía.** La API no responde `409` por ambigüedad: devuelve una orden en silencio, y puede no ser la que usted esperaba. Si sus remisiones son numéricas, tenga presente esta prioridad.

Devuelve el mismo objeto del listado, más `evidencias[]` (URLs firmadas de corta duración) y `gestiones[]` (historial de gestiones). Las dos claves viajan **siempre**, y pueden ser `[]`.

### Request

```bash
curl https://www.servilogistic.co/api/ordenes/api-key/orden/REM-0001 \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

### Response `200`

```json
{
  "numGuia": 100234, "numRemision": "REM-0001",
  "estado": "en_reparto", "estadoNombre": "En reparto",
  "destinatario": "Juan Pérez", "telefonoDest": "88887777", "producto": "Camiseta talla M",
  "direccion": "Av. Central, 200m norte del parque", "montoCobrar": 26000,
  "createdAt": "2026-09-22T14:03:11.000Z",
  "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000bb", "nombre": "Ana Solís Vargas" },
  "zona": { "id": "018f2c31-0000-4000-8000-0000000000b1", "nombre": "GAM" },
  "costoEstimado": { "flete": "2500.00", "iva": "325.00", "comision": "906.50",
                     "ivaComision": "117.85", "fulfillment": "0.00", "ivaFulfillment": "0.00" },
  "costoReal": { "flete": "2500.00", "iva": "325.00", "comision": "906.50",
                 "ivaComision": "117.85", "fulfillment": "0.00", "ivaFulfillment": "0.00" },
  "evidencias": [
    { "resultado": "devolucion_a_origen_por_rechazo", "resultadoNombre": "Devolución a origen por rechazo",
      "contentType": "image/jpeg",
      "url": "https://<host-de-storage>/object/sign/gestion-evidencias/...", "expiraEnSegundos": 300 }
  ],
  "gestiones": [
    { "createdAt": "2026-09-23T15:41:07.000Z",
      "resultado": "reprogramado", "resultadoNombre": "Reprogramado",
      "estadoResultante": "reprogramado", "estadoResultanteNombre": "Reprogramado",
      "motivo": null,
      "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000aa", "nombre": "Carlos Jiménez Mora" },
      "pendienteConfirmacion": false },
    { "createdAt": "2026-09-24T18:02:55.000Z",
      "resultado": "novedad", "resultadoNombre": "Novedad",
      "estadoResultante": null, "estadoResultanteNombre": null,
      "motivo": "wrong_address",
      "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000bb", "nombre": "Ana Solís Vargas" },
      "pendienteConfirmacion": true }
  ]
}
```

### Comportamientos que debe manejar

- `evidencias[].resultado` es uno de `entregado` | `devolucion_a_origen_por_rechazo` | `incidente`; `contentType` puede ser `null`.
- Atención: **Las URLs firmadas vencen a los 5 minutos (300 s).** **Descargue el archivo, no guarde la URL.** Si persiste la URL en su base de datos, sus enlaces van a estar rotos antes de que alguien los abra.
- `gestiones[]` va de la más antigua a la más reciente, completo y sin paginar. Las ocho claves de cada elemento están siempre presentes. No incluye las gestiones anuladas ni los incidentes que reporta el personal de bodega (sus fotos sí están en `evidencias[]`).
- `pendienteConfirmacion: true` = la gestión se registró pero su estado todavía no se aplicó: la orden sigue `en_reparto` y `estadoResultante` es `null`. Al aprobarse el cierre del mensajero pasa a `false` y `estadoResultante` trae el estado aplicado. Es la misma señal que la aplicación muestra como «`<resultado>` · *pendiente de confirmación*».
- `estadoResultante` **no se deduce del** `resultado`: es el estado al que esa gestión llevó la orden, leído del historial. Puede ser `null` en gestiones antiguas y, en gestiones anteriores al 2026-09-23, una `novedad` puede mostrar un estado ya retirado del catálogo. Se publica sin lista cerrada: trate un valor desconocido como texto.
- `motivo` es la **causa tipificada**, nunca el texto libre del mensajero (ese texto no sale del sistema): `not_found` / `wrong_number` / `wrong_address` en una `novedad`; `danado` / `perdido` / `robado` en un `incidente`; `null` en cualquier otro resultado y en gestiones antiguas sin causa registrada. La asimetría de idioma es deliberada: no traduzca ni «armonice».
- `gestiones[].mensajero` nunca es `null` y es el **atribuido** a la gestión, que no siempre es quien la registró: las gestiones que crea el sistema o la propia tienda (reprogramación de escritorio, escalado por plazo, rechazo manual, corte por tope de reintento) quedan atribuidas al mensajero de la última novedad. `gestiones.length` no es el contador de intentos de entrega de Servi Logistic (ese cuenta cierres aprobados distintos).
- Orden inexistente, borrada o ajena: responde el mismo `404`.

## 5.5 **POST** `/api/ordenes/api-key/orden/{id}/generate` — PDF de etiqueta de una orden

Solo `POST`. **Sin cuerpo.** `{id}` se resuelve igual que en la sección 5.4. Retorna una **URL firmada para descargar el PDF** de la etiqueta. La primera llamada construye el PDF; las siguientes lo vuelven a firmar (misma forma de respuesta, sin ningún indicador de reuso).

```bash
curl -X POST https://www.servilogistic.co/api/ordenes/api-key/orden/100234/generate \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

```json
{ "url": "https://<host-de-storage>/object/sign/etiquetas/...", "expiraEnSegundos": 300 }
```

- Atención: No compare URLs para detectar cambios, y no las cachee: la URL cambia en cada llamada y vence a los 300 s, igual que las evidencias.
- Orden sin guía imprimible (todavía sin `numGuia`, típico de fulfillment recién cargado): responde `409` con el mensaje genérico de la sección 4.3.
- `{id}` vacío o de más de 128 caracteres: `422` con `details.fieldErrors.id`.
- Orden inexistente o de otro dueño: responde el mismo `404`.

## 5.6 **POST** `/api/ordenes/api-key/carga/{cargaId}/generate` — PDF consolidado del lote

`{cargaId}` es el UUID que devolvió `POST /carga` (sección 5.1); cualquier otra cosa es `422`. Misma forma de respuesta que la sección 5.5, pero sobre **todas las etiquetas imprimibles del lote**, y solo de órdenes propias y vivas.

```bash
curl -X POST https://www.servilogistic.co/api/ordenes/api-key/carga/9c2b7f10-5d3a-4e21-9a4b-77c8e0f1a2b3/generate \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

```json
{ "url": "https://<host-de-storage>/object/sign/etiquetas/...", "expiraEnSegundos": 300 }
```

- `{cargaId}` que no es un UUID: `422` con `details.fieldErrors.cargaId: ["cargaId invalido"]`.
- Lote **sin etiquetas imprimibles** (ninguna orden viva con guía): responde `409`. Lote que excede el tope de etiquetas por PDF (300 por defecto): responde `409`; en ese caso imprima por guía (sección 5.5).
- Lote inexistente o de otro integrador: responde el mismo `404`.

## 5.7 **DELETE** `/api/ordenes/api-key/orden/{id}` — Eliminar una orden propia

**Sin cuerpo.** Elimina la orden. `{id}` se resuelve igual que en la sección 5.4 (lo habitual aquí es la remisión, porque una orden recién cargada con fulfillment todavía no tiene guía).

Solo procede si se cumplen **las dos condiciones** a la vez:

1. El estado actual es uno de estos siete: `en_preparacion`, `por_recolectar_en_tienda`, `recolectando`, `en_bodega_central`, `en_ruta_bodega_central`, `en_ruta_bodega_satelite`, `mensajero_recogiendo_en_bodega`. Es decir: el paquete no ha salido hacia el cliente. Haber generado la etiqueta **no** impide eliminar.
2. Atención: **La orden no tiene ningún intento de entrega** (cierres aprobados con una gestión vigente de novedad, reprogramación o rechazo). Una orden con un intento deja de ser eliminable aunque el estado vuelva a estar en la lista.

```bash
curl -X DELETE https://www.servilogistic.co/api/ordenes/api-key/orden/REM-0001 \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

```json
{ "numGuia": 100234, "numRemision": "REM-0001", "estado": "en_bodega_central", "estadoNombre": "En bodega central" }
```

- `estado` es el que la orden **tenía** al eliminarla (eliminar no transiciona). `numGuia` es `null` si aún no tenía guía.
- Atención: Propia y viva pero en un estado no permitido, o con un intento de entrega: responde `409`, sin distinguir cuál de las dos condiciones falló. Consulte el estado antes de intentar eliminar, o maneje el `409` como resultado esperado. Para una orden que ya va camino del cliente no hay eliminación: la salida es cancelar (sección 5.9), y solo desde bodega.
- Es un **borrado lógico**: la orden desaparece del canal (un `GET` posterior responde `404`, y repetir el `DELETE` también) y **libera su** `num_remision` para volver a cargarla.

## 5.8 **GET** `/api/ordenes/api-key/analitica` — Estadísticas de gestión

Los tres parámetros son opcionales; `GET …/analitica` a secas es una llamada válida (todas las métricas, todo el histórico). Un parámetro presente pero vacío cuenta como ausente.

| Param | Detalle |
| --- | --- |
| `metricas` | Ids separados por comas, o `all`, o vacío (= `all`). `all` no se combina con ids; un elemento vacío en medio (`a,,b`) y más de 10 ids son `422`. Un id repetido se sirve una sola vez, conservando su primera posición. **Ids publicables:** `ordenes_creadas`, `ordenes_por_estado`, `entregas`, `devoluciones`, `rechazos`, `reprogramaciones`, `tasa_entrega`, `tasa_devolucion`, `tasa_rechazo`, `tiempo_ciclo`. |
| `desde` / `hasta` | `YYYY-MM-DD`, en la zona horaria del país de la empresa, ambos **inclusivos**. Sin `hasta`: hoy. Sin `desde`: el primer día del que hay histórico. Rango invertido: `422`. No hay tope de ventana ni atajos tipo «últimos 7 días»: calcule las fechas usted. |

### Request

```bash
curl "https://www.servilogistic.co/api/ordenes/api-key/analitica?metricas=entregas,tasa_entrega&desde=2026-09-19&hasta=2026-09-21" \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

### Response `200` (llamada hecha el 2026-09-21 a las 12:40 en la zona horaria del país de la empresa)

```json
{
  "rango": { "desde": "2026-09-19", "hasta": "2026-09-21" },
  "metricas": [
    { "metrica": "entregas", "unidad": "conteo",
      "data": [
        { "fecha": "2026-09-19", "valor": 41 },
        { "fecha": "2026-09-20", "valor": 37 },
        { "fecha": "2026-09-21", "valor": 12, "parcial": true, "corteAt": "2026-09-21T18:40:00.000Z" }
      ],
      "cobertura": { "fechasNoComparables": [], "penumbra": "ordenes_vivas_al_horizonte_sin_transicion_posterior" } },
    { "metrica": "tasa_entrega", "unidad": "porcentaje",
      "data": [
        { "fecha": "2026-09-19", "valor": 0.93 },
        { "fecha": "2026-09-20", "valor": null },
        { "fecha": "2026-09-21", "valor": 0.8, "parcial": true, "corteAt": "2026-09-21T18:40:00.000Z" }
      ],
      "cobertura": { "fechasNoComparables": [], "penumbra": "ordenes_vivas_al_horizonte_sin_transicion_posterior" } }
  ]
}
```

### Comportamientos que debe manejar

- Si la empresa no tiene activo el módulo de Analítica, toda llamada responde `403` con el mensaje `El módulo Analítica no está activo para esta empresa.` y `details.codigo: "modulo_inactivo"`. Es un tema de la empresa, no de su código.
- Atención: **El lote es todo o nada.** Si *una* métrica pedida no está en la lista publicable, la llamada *entera* responde `403` — idéntico al `403` de una métrica que no existe, a propósito. No hay respuesta parcial. Valide su lista de ids contra la lista publicable antes de llamar.
- Atención: **El día en curso viene marcado, no cerrado.** Su punto trae `parcial: true` y `corteAt` (el instante hasta el que se contó). Se lee más bajo que un día completo y no es comparable: si suma `data` para un total del periodo, descarte primero los puntos con `parcial: true`. Un día cerrado trae solo `fecha` y `valor`; `parcial` nunca llega como `false`.
- Atención: **No rellene huecos con ceros.** Un día puede faltar en `data` (sin dato), y los días del rango que caen por debajo del horizonte del histórico vienen listados en `cobertura.fechasNoComparables`: ahí un cero es falta de *datos*, no falta de operación. `penumbra` es una limitación permanente del histórico (las órdenes vivas cuando nació el historial y que nunca volvieron a cambiar de estado no entran en ningún día).
- `data` vacío es un `200` correcto; `rango` es el eco exacto de lo pedido (o de lo resuelto por defecto), sin recortar. No lo use para deducir hasta dónde hay datos.
- Atención: `valor: null` **no es** `0`**.** Significa «no se sabe» (por ejemplo, una tasa con denominador cero). Ese día *sí* aparece en `data`. Distinga en su gráfico: día con número, día con `null`, día parcial y día ausente.
- `unidad` es uno de `conteo` | `porcentaje` | `segundos` (`tiempo_ciclo`).
- Sin `desde`, `data` crece un punto por día de operación: este endpoint no pagina.

> **No todas las métricas cuentan lo mismo:**

| Grupo | Métricas | Qué cuenta |
| --- | --- | --- |
| Gestiones | `entregas`, `devoluciones`, `rechazos`, `reprogramaciones`, `tasa_entrega`, `tasa_devolucion`, `tasa_rechazo` | **Gestiones vigentes** (anuladas excluidas). Una orden que se reprograma y luego se entrega aporta **DOS** gestiones. Las tasas dividen entre entregas + devoluciones + rechazos + incidentes. |
| Órdenes | `ordenes_creadas`, `ordenes_por_estado` | **Órdenes.** Desde el cambio del bloque B, el estado de una orden gestionada cambia al aprobar el cierre; `ordenes_por_estado` refleja el estado aplicado. |
| Duración | `tiempo_ciclo` | Una **duración** en segundos: de la creación a un estado terminal. |

Este canal **no publica importes** ni identifica a los mensajeros.

## 5.9 **PUT** `/api/ordenes/api-key/{numGuia}/cancelar` — Cancelar una orden en bodega

**Sin cuerpo.** Se identifica por **número de guía** (entero positivo; si no, `422` con `details.fieldErrors.numGuia: ["num_guia invalido"]`): una orden con fulfillment recién cargada no tiene guía todavía y no se puede cancelar por aquí (use la sección 5.7). Solo procede si el estado actual es `en_bodega_central` o `en_ruta_bodega_central`; cualquier otro: responde `409`. No borra la orden: la transiciona a `devolviendo_a_tienda` (el paquete vuelve a su tienda) y emite el webhook `orden.estado_actualizado` con ese estado.

```bash
curl -X PUT https://www.servilogistic.co/api/ordenes/api-key/100235/cancelar \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX"
```

```json
{ "numGuia": 100235,
  "estadoAnterior": "en_ruta_bodega_central", "estadoAnteriorNombre": "En ruta a bodega central",
  "estado": "devolviendo_a_tienda", "estadoNombre": "Devolviendo a tienda" }
```

- Inexistente, ajena o borrada: responde el mismo `404`. Repetir la cancelación: responde `409` (ya no está en un estado cancelable).

## 5.10 **POST** `/api/ordenes/api-key/habilitar` — Habilitar pedidos con novedad (lote)

Reactiva, por lote, órdenes detenidas: las que tienen una **ayuda a la tienda abierta** (el mensajero pidió ayuda; la orden sigue `en_reparto`) y las que están en `novedad`.

```bash
curl -X POST https://www.servilogistic.co/api/ordenes/api-key/habilitar \
  -H "Authorization: Bearer svl_XXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "ordenes": [
      { "num_guia": 100234, "nota": "el cliente pidió reintento mañana" },
      { "num_guia": 100235, "nota": "dirección corregida por el call center" },
      { "num_guia": 999999, "nota": "guía que no es suya" }
    ]
  }'
```

`num_guia` debe ser un **entero** (no texto). `nota` es **obligatoria** (1 a 200 caracteres, se recorta) y queda en la bitácora de la orden. El lote acepta **entre 1 y 100 filas**; fuera de eso, o sin la forma de un lote, `422` y ninguna fila procesada (`el lote no puede estar vacío` o `el lote excede el máximo de 100 filas`, en `details.fieldErrors.ordenes`). Una fila mal formada **no** tira el lote: se marca `fila_invalida` y las demás siguen.

### Response `200` (aunque todas las filas fallen)

```json
{
  "resumen": { "total": 3, "habilitadas": 1, "habilitadasSinCambioDeEstado": 1, "conError": 1 },
  "resultados": [
    { "numGuia": 100234, "resultado": "habilitada",
      "estado": "en_reparto", "estadoNombre": "En reparto", "ayudaCerrada": true, "error": null },
    { "numGuia": 100235, "resultado": "habilitada_sin_cambio_de_estado",
      "estado": "novedad", "estadoNombre": "Novedad", "ayudaCerrada": false, "error": null },
    { "numGuia": 999999, "resultado": "error", "estado": null, "estadoNombre": null, "ayudaCerrada": false,
      "error": { "codigo": "no_encontrada", "mensaje": "no existe una orden viva con esa guia" } }
  ]
}
```

- `resultados` viene en el **mismo orden y la misma cantidad** que las filas enviadas: case por índice. `total = habilitadas + habilitadasSinCambioDeEstado + conError`.
- `habilitada`: la orden tenía la ayuda abierta y la ayuda quedó **cerrada** (`ayudaCerrada: true`); la orden sigue `en_reparto` con su mensajero y vuelve a ser gestionable. Emite el evento `orden.ayuda_resuelta` con `via: "api"` (sección 6.7). No hay cambio de estado, así que no emite `orden.estado_actualizado`.
- `habilitada_sin_cambio_de_estado`: se registró la habilitación y el estado **no** cambió. Es **siempre** el caso de una `novedad`: su paquete ya volvió a la bodega y no hay nadie en la calle a quien devolvérselo. No emite ningún evento.
- `error`: la fila no se procesó; `error.codigo` es uno de cuatro, cada uno con su `error.mensaje` fijo: `fila_invalida` (`num_guia debe ser un entero positivo y nota un texto no vacio de hasta 200 caracteres`), `duplicada_en_lote` (`esa guia ya aparece antes en este mismo lote`), `no_encontrada` (`no existe una orden viva con esa guia`; no distingue «no existe» de «es de otro dueño» ni de «es de otra empresa»), `estado_no_habilitable` (`el estado actual de la orden no admite habilitacion`) (la orden no tiene ayuda abierta ni está en `novedad`: incluye `reprogramado`, `devolucion_a_origen_por_rechazo`, `incidente`, `novedad_interna` y la segunda habilitación de una orden cuya ayuda ya se cerró).
- Habilitar dos veces la misma orden devuelve `estado_no_habilitable` la segunda vez y no escribe nada: no se devuelve un acuse falso.

# 6. Webhooks salientes: `orden.estado_actualizado` y los eventos de orden

**Servi Logistic envía** (`POST`) al callback del dueño de la orden un evento cada vez que una orden suya cambia a un estado publicable (`orden.estado_actualizado`, secciones 6.2 a 6.6) y cada vez que ocurre un hecho sobre la orden que no es un cambio de estado (`orden.gestion_*`, `orden.ayuda_*`, sección 6.7). Todos llegan al **mismo callback**, con la **misma firma** y el mismo circuito de reintento.

> **No es un endpoint que usted llame.** Es un endpoint que usted **expone**. El destino se deriva siempre del dueño de la orden.

## 6.1 Alta de la suscripción

Se registra en Servi Logistic, **una suscripción por dueño**, con:

- Una **URL HTTPS absoluta** (otro esquema se rechaza).
- Un **secreto de firma**, generado por Servi Logistic y entregado una sola vez.

La URL y el secreto los maneja la empresa en la misma pantalla de las claves (menú **Configuración**, opción **API**, sección 3.1). Cambiar la URL conserva el secreto. El secreto se puede rotar (invalida el anterior) y la suscripción se puede desactivar, solicitándolo a la empresa. Sin suscripción activa, los eventos no se encolan: no se «acumulan» para entregarse después de un alta.

## 6.2 Cuerpo del evento

```json
{
  "evento": "orden.estado_actualizado",
  "eventoId": "webhook_estado:<ordenId>:<estatusDestinoId>:<ocurridoAt>",
  "ocurridoAt": "2026-09-21T14:03:11.000Z",
  "data": {
    "numGuia": 100234,
    "numRemision": "REM-0001",
    "estado": "novedad",
    "estadoNombre": "Novedad",
    "motivo": "not_found",
    "mensajero": null
  }
}
```

Las seis claves de `data` —`numGuia`, `numRemision`, `estado`, `estadoNombre`, `motivo`, `mensajero`— están **siempre presentes**, en ese orden. `motivo` y `mensajero` viajan como `null` cuando no aplica, **nunca omitidos**. `mensajero` es quien lleva la orden en el momento de *esa entrega*, con la misma forma que en el listado.

Hay una **séptima clave opcional**, `evidenciasUrl`, que se **omite** salvo en eventos con `estado: "incidente"`. Es un enlace estable, sin token ni expiración, al detalle de esa orden en este canal (`GET /api/ordenes/api-key/orden/{id}`, con la guía o, si no la tiene, la remisión como último segmento): invóquelo con su propio `Authorization` y obtendrá las URLs firmadas frescas de las fotos. Ramifique por «la clave existe», no por su valor. Ejemplo:

```json
{
  "evento": "orden.estado_actualizado",
  "eventoId": "webhook_estado:<ordenId>:<estatusDestinoId>:<ocurridoAt>",
  "ocurridoAt": "2026-09-22T14:30:00.000Z",
  "data": {
    "numGuia": 100235, "numRemision": "REM-0002",
    "estado": "incidente", "estadoNombre": "Incidente",
    "motivo": "robado",
    "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000aa", "nombre": "Carlos Jiménez Mora" },
    "evidenciasUrl": "https://www.servilogistic.co/api/ordenes/api-key/orden/100235"
  }
}
```

> `numGuia` puede ser `null` si aún no está asignado (evento de nacimiento `en_preparacion`). No lo use como clave primaria en su lado sin manejar ese caso; `numRemision` es su ancla.

## 6.3 Autenticación de la entrega

> **La entrega NO lleva header** `Authorization`**.** Se autentica con una firma HMAC:

| Header | Contenido |
| --- | --- |
| `X-Servi-Logistic-Timestamp` | Instante unix en **segundos** en que se firmó |
| `X-Servi-Logistic-Signature` | `sha256=` seguido de 64 caracteres hexadecimales en minúscula: el HMAC-SHA256 de la cadena `<timestamp>.<cuerpo>` con el secreto de la suscripción |
| `Content-Type` | `application/json` |

La entrega es un `POST` y el cuerpo es el JSON del evento en una sola línea, sin espacios entre claves.

**Procedimiento de verificación:**

1. Atención: Tome el **cuerpo crudo, byte a byte**, tal como llegó.
2. Arme la cadena: el valor de `X-Servi-Logistic-Timestamp`, un punto y el cuerpo crudo.
3. Calcule HMAC-SHA256 de esa cadena (en UTF-8) usando como clave el **secreto completo, como texto**, incluido su prefijo `svl_whsec_`. Exprese el resultado en hexadecimal en minúscula.
4. Antepóngale `sha256=` y **compare en tiempo constante** contra el valor de `X-Servi-Logistic-Signature`.
5. Descarte entregas cuyo `X-Servi-Logistic-Timestamp` caiga **fuera de su ventana anti-replay** (referencia: 5 minutos).
6. **Solo entonces** parsee el JSON.

**Ejemplo para comprobar su implementación.** Con estos tres datos su código tiene que obtener exactamente la firma de abajo. El secreto es inventado: el suyo se lo entrega la empresa.

Secreto de la suscripción:

```text
svl_whsec_EJEMPLO_no_es_un_secreto_real
```

Header `X-Servi-Logistic-Timestamp`:

```text
1758463391
```

Cuerpo crudo recibido (una sola línea):

```text
{"evento":"orden.estado_actualizado","eventoId":"webhook_estado:6f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f:3b7e9a10-0000-4000-8000-000000000008:2026-09-21T14:03:11.000Z","ocurridoAt":"2026-09-21T14:03:11.000Z","data":{"numGuia":100234,"numRemision":"REM-0001","estado":"novedad","estadoNombre":"Novedad","motivo":"not_found","mensajero":null}}
```

Header `X-Servi-Logistic-Signature` que debe obtener:

```text
sha256=9128288185e5f520c3597976e3164399c1ba4677c1f18425426f3ea5254ec0fd
```

La misma verificación en Node.js, solo con el módulo `crypto` de la plataforma:

```js
const crypto = require("node:crypto");

// cuerpoCrudo: el cuerpo tal como llegó, como texto (sin parsear).
function firmaValida(secreto, timestamp, cuerpoCrudo, firmaRecibida) {
  const esperada =
    "sha256=" +
    crypto.createHmac("sha256", secreto).update(timestamp + "." + cuerpoCrudo, "utf8").digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(String(firmaRecibida), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

> Si su framework parsea el cuerpo antes de que usted lo lea (Express con `express.json()`, por ejemplo), la firma **no va a validar nunca**: al re-serializar cambia el orden de claves o el espaciado. Configure la ruta del webhook para recibir el cuerpo crudo. El orden de las claves del cuerpo es parte de la firma: cuando el contrato gana una clave (como `estadoNombre`), el texto firmado cambia, y su verificación sigue siendo válida si trabaja sobre el cuerpo crudo.

(El tamaño de la ventana anti-replay lo define usted. Las IPs de origen de las entregas no están definidas en esta guía: consultar con la empresa.)

## 6.4 Idempotencia y confirmación

- Una misma entrega **puede repetirse**: reintento tras fallo transitorio, o duplicado. Deduplique por `eventoId`, que es determinista para un mismo hecho: `webhook_estado:…` para un cambio de estado y `webhook_evento:<id>` para los eventos de orden (sección 6.7). Dos entregas del mismo `eventoId` pueden diferir en `data.numGuia`, `mensajero`, `motivo` o `evidenciasUrl` si la orden cambió entre un intento y otro: quédese con la última.
- Responda `2xx` para confirmar. **Cualquier otra respuesta, un timeout (10 s) o un fallo de red se trata como fallo transitorio y la entrega se reintenta.**
- **Política de reintento** (valores por defecto): hasta **5 intentos** por entrega, con espera exponencial entre ellos (1, 2, 4 y 8 minutos, tope 1 hora). Agotados los intentos, la entrega se descarta y no se vuelve a enviar: si su endpoint estuvo caído más de ese tiempo, reconcilie con el listado (sección 5.3). Un `429` con `Retry-After` se respeta (nunca por debajo de la espera calculada, y nunca más de 1 hora).
- **Circuito de pausa:** tras 3 fallos consecutivos y 30 minutos sin ninguna entrega aceptada, los reintentos de *toda* la suscripción pasan a espaciarse a 1 hora. Un `2xx` la saca de la pausa de inmediato. Los eventos nuevos se siguen encolando.
- El orden de llegada **no está garantizado** entre eventos (un reintento puede llegar después de un evento posterior): ordene por `ocurridoAt`.

> Si su handler responde `4xx` ante un evento que no le interesa (estado o evento desconocido, orden que no reconoce), Servi Logistic va a reintentarlo y a contarlo como fallo del circuito. Responda `2xx` e ignore internamente.

## 6.5 Estados que este webhook puede emitir

Es un **subconjunto** del catálogo REST (sección 4.7): solo los estados públicos del ciclo. Son estos doce:

| # | Estado | Nota |
| --- | --- | --- |
| 1 | `por_recolectar_en_tienda` | Evento de nacimiento — tiendas **sin** fulfillment (sección 5.1) |
| 2 | `en_preparacion` | Evento de nacimiento — tiendas **con** fulfillment (sección 5.1). Llega con `numGuia: null`, una sola vez por orden. |
| 3 | `en_ruta_bodega_central` | |
| 4 | `en_bodega_central` | Con fulfillment, es el primer evento que trae la guía. |
| 5 | `en_reparto` | Atención: Puede llegar **más de una vez** sobre la misma orden (por ejemplo, una orden en `reprogramado` que vuelve a salir a reparto). Son cambios reales, con `eventoId` distinto. |
| 6 | `entregado` | Atención: Cuando el resultado lo registra el mensajero en calle, el evento llega **al aprobar su cierre del día**, no al gestionar: horas después de lo que ve el mensajero. Para enterarse al instante, use `orden.gestion_registrada` (sección 6.7). Una reprogramación o un rechazo que registra la propia tienda desde la aplicación, o el escalado automático de una novedad, llegan en el instante en que ocurren. |
| 7 | `reprogramado` |
| 8 | `novedad` |
| 9 | `devolucion_a_origen_por_rechazo` |
| 10 | `incidente` |
| 11 | `devolviendo_a_tienda` | También por una cancelación (sección 5.9) |
| 12 | `devuelta_a_tienda` | |

> Los otros ocho estados del catálogo **nunca** viajan en un evento: `recolectando`, los internos de ruteo satélite (`en_ruta_bodega_satelite`, `en_bodega_satelite`, `mensajero_recogiendo_en_bodega`), `novedad_interna` y los tres del flujo de devolución interna (`por_devolver_a_bodega_central`, `devolviendo_a_bodega_central`, `por_devolver_a_tienda`).

La lista puede crecer de forma aditiva con aviso previo. Trate un valor desconocido como **«ignorar»**, no como error.

## 6.6 `motivo` depende de `estado`

> `motivo` transporta dos catálogos distintos, y cuál aplica lo decide `estado`.

| `estado` | Contenido de `motivo` |
| --- | --- |
| `novedad` | Un valor del catálogo de causas de devolución: `not_found`, `wrong_number`, `wrong_address` (en inglés) |
| `incidente` | Un valor del catálogo de causas de incidente: `danado`, `perdido`, `robado` (en español, sin eñe) |
| cualquier otro | siempre `null` |

> No interprete `motivo` sin mirar antes `estado`: el mismo campo significa cosas distintas según el caso. Son valores crudos: compárelos contra el literal exacto, sin normalizar ni traducir. La asimetría de idioma es deliberada y no se va a «armonizar». `motivo` es `null` también en una `novedad` o un `incidente` sin causa registrada, y es la causa **vigente en el momento de la entrega**, nunca el texto libre del mensajero.

## 6.7 Eventos de gestión y de ayuda (`orden.gestion_*`, `orden.ayuda_*`)

Cinco eventos que no son un cambio de estado. Llegan al mismo callback, firmados igual (sección 6.3) y con el mismo circuito de reintento (sección 6.4). Ramifique por `evento`:

| `evento` | Cuándo | Claves propias en `data` |
| --- | --- | --- |
| `orden.gestion_registrada` | El mensajero (o la tienda, desde una ayuda) registró una gestión en calle. Queda **pendiente de confirmar**: el estado de la orden no cambia todavía; el real llegará como `orden.estado_actualizado` al aprobarse el cierre. | `gestionId`, `resultado`, `resultadoNombre`, `pendienteConfirmacion: true` |
| `orden.gestion_anulada` | El mensajero deshizo esa gestión pendiente antes de que entrara en un cierre. La orden vuelve a ser gestionable. | `gestionId`, `resultado`, `resultadoNombre` |
| `orden.gestion_corregida` | Se corrigió el resultado de una gestión pendiente dentro de un cierre abierto (de `resultadoAnterior` a `resultado`). | `gestionId`, `resultado`, `resultadoNombre`, `resultadoAnterior`, `resultadoAnteriorNombre`, `pendienteConfirmacion: true` |
| `orden.ayuda_solicitada` | El mensajero pidió ayuda a la tienda. La orden sigue `en_reparto`. | — |
| `orden.ayuda_resuelta` | La ayuda se cerró: por el mensajero («Recuperar»), por la tienda («Habilitar» en la aplicación) o por este canal (sección 5.10). | `via` es uno de `mensajero`, `tienda` o `api` |

`data` lleva **siempre** `numGuia`, `numRemision`, `motivo` (la causa tipificada de la gestión, con los mismos valores de la sección 6.6; `null` en los eventos de ayuda) y `mensajero` (el atribuido al hecho, o `null`). Las demás claves **se omiten** cuando el evento no las lleva. `resultado` usa los cinco códigos de resultado (sección 4.7). `eventoId` es `webhook_evento:<id>`, único por hecho.

```json
{
  "evento": "orden.gestion_registrada",
  "eventoId": "webhook_evento:018f2c31-0000-4000-8000-000000000101",
  "ocurridoAt": "2026-09-23T15:10:00.000Z",
  "data": {
    "numGuia": 100234, "numRemision": "REM-0001",
    "gestionId": "018f2c31-0000-4000-8000-000000000201",
    "resultado": "novedad", "resultadoNombre": "Novedad",
    "motivo": "not_found",
    "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000aa", "nombre": "Carlos Jiménez Mora" },
    "pendienteConfirmacion": true
  }
}
```

```json
{
  "evento": "orden.ayuda_resuelta",
  "eventoId": "webhook_evento:018f2c31-0000-4000-8000-000000000102",
  "ocurridoAt": "2026-09-23T16:00:00.000Z",
  "data": {
    "numGuia": 100235, "numRemision": "REM-0002",
    "motivo": null,
    "mensajero": { "id": "018f2c31-0000-4000-8000-0000000000aa", "nombre": "Carlos Jiménez Mora" },
    "via": "api"
  }
}
```

> **La secuencia típica de una entrega en calle** es: `orden.gestion_registrada` (al instante, con `pendienteConfirmacion: true`) y, horas después, `orden.estado_actualizado` con `estado: "entregado"` (al aprobarse el cierre). Si entre medias llega `orden.gestion_anulada`, no habrá cambio de estado para esa gestión; si llega `orden.gestion_corregida`, el estado que se aplicará es el `resultado` corregido. La lista de eventos puede crecer de forma aditiva, con aviso previo: trate un `evento` desconocido como «ignorar».

# 7. Checklist de puesta en producción

| Hecho | Punto | Por qué |
| --- | --- | --- |
| [ ] | La API key vive en un **gestor de secretos** o variable de entorno — nunca en frontend, repo ni logs | sección 3.6 |
| [ ] | Puede **cambiar el secreto sin recompilar** | sección 3.4 |
| [ ] | Usa la base `https://www.servilogistic.co` desde una variable de configuración, y **una clave por empresa** si trabaja con varias | secciones 3.7 y 4.1 |
| [ ] | Probó su verificación de firma con el ejemplo de la sección 6.3 y obtiene la misma firma | sección 6.3 |
| [ ] | Compara **códigos** de estado y muestra los **nombres** (`…Nombre`); no mantiene una traducción propia | sección 4.7 |
| [ ] | No queda ningún literal de los **once códigos anteriores** (tabla de cambios A.1 y A.2) | Cambios |
| [ ] | En `/carga`, lee `errores[]` y usa `creadas` y `conError` como semáforo del lote, no el status HTTP | sección 5.1 |
| [ ] | Guarda `cargaId` cuando no es `null`, para el PDF del lote | secciones 5.1 y 5.6 |
| [ ] | Maneja el error de clave `tarifa` (sin tarifa o sin cobertura) y los de catálogo retirado como casos de negocio | sección 5.1 |
| [ ] | Contempla los dos estados iniciales posibles según fulfillment, y `numGuia: null` en el segundo | sección 5.1 |
| [ ] | Parsea los importes como texto crudo (`"2500.00"`); no le aplica un parser de miles/coma | sección 5.2 |
| [ ] | Tiene presente que la guía se prioriza sobre la remisión en `/orden/{id}` | sección 5.4 |
| [ ] | **Descarga** los archivos de URLs firmadas de inmediato; no persiste la URL (300 s) | secciones 5.4 y 5.5 |
| [ ] | Lee `pendienteConfirmacion` en `gestiones[]` y no deduce el estado del `resultado` | sección 5.4 |
| [ ] | Archiva `costoReal`, no `costoEstimado`; agrupa por `id` de zona y mensajero, nunca por `nombre` | sección 5.3 |
| [ ] | Verifica el **HMAC sobre el cuerpo crudo**, en tiempo constante, antes de parsear | sección 6.3 |
| [ ] | La ruta del webhook recibe el cuerpo **sin parsear** por el framework | sección 6.3 |
| [ ] | Deduplica por `eventoId` y ordena por `ocurridoAt` | sección 6.4 |
| [ ] | Responde `2xx` siempre que recibe el evento, incluso si lo ignora; su endpoint responde en menos de 10 s | sección 6.4 |
| [ ] | Interpreta `motivo` según `estado`, contra literales exactos | sección 6.6 |
| [ ] | Trata **estados y eventos desconocidos como «ignorar»**, nunca como error | secciones 6.5 y 6.7 |
| [ ] | Sabe que el estado final de una gestión en calle llega **al aprobar el cierre**; usa `orden.gestion_registrada` si necesita el instante | secciones 6.5 y 6.7 |
| [ ] | No rellena huecos de analítica con ceros, descarta los puntos `parcial` al sumar, y distingue `null` de `0` | sección 5.8 |
| [ ] | Valida los ids de métricas antes de llamar (el lote es todo o nada) | sección 5.8 |
| [ ] | Maneja fechas de calendario en la **zona horaria del país de la empresa** y timestamps en **UTC** | sección 4.5 |
| [ ] | Si valida el esquema en estricto, su modelo está regenerado contra el contrato vigente | Cambios |

# 8. Errores frecuentes y cómo diagnosticarlos

## 8.1 Por código

| HTTP | `code` | Causa probable | Acción concreta |
| --- | --- | --- | --- |
| `401` | `UNAUTHORIZED` | No mandó el header, lo mandó mal formado (sin `Bearer`, con dos espacios), **o** la key no existe (eliminada o con el secreto rotado). Los casos son indistinguibles. | Revise que envía `Authorization: Bearer svl_...` en **todos** los endpoints. Verifique que el secreto llegó completo (no truncado por su gestor de config). |
| `403` | `FORBIDDEN` | La key existe pero está **desactivada**, o su **cuenta dedicada** (o la tienda a la que apunta) no está activa. En analítica: pidió una métrica no publicable, o la empresa tiene apagado el módulo de Analítica (`message`: «El módulo Analítica no está activo para esta empresa.»). En las seis rutas que escriben: la empresa está suspendida por falta de pago (`details.codigo: "empresa_congelada"`, `message`: «Empresa suspendida por falta de pago.»). | Si es analítica, valide sus ids contra la lista de la sección 5.8. En cualquier otro endpoint, contacte a la empresa: no es algo que se arregle desde su lado. Si `details.codigo` es `empresa_congelada`, no reintente en bucle: las consultas siguen funcionando y la escritura vuelve cuando la empresa paga lo vencido (sección 4.4). |
| `404` | `NOT_FOUND` | Recurso inexistente, borrado, **o de otra tienda o de otra empresa**. Deliberadamente indistinguibles. También la ruta retirada `GET …/api-key/{numGuia}`. | Confirme el `numGuia`/`numRemision`/`cargaId` y la ruta (`/orden/{id}`). Si cree que la orden es suya, verifíquela con el listado (sección 5.3). |
| `409` | `CONFLICT` | Ninguna fila resolvió tarifa; nombre de lote repetido; orden sin guía imprimible; lote sin etiquetas o por encima del tope; eliminación o cancelación desde un estado no permitido, o con intentos de entrega. | Si el `message` es el genérico (`La operacion entra en conflicto con el estado actual.`), la causa es el estado de la orden o del lote: consulte el detalle (sección 5.4) antes de reintentar. Solo la falta de tarifa y el nombre de lote repetido traen un mensaje propio; la tarifa es un tema comercial con la empresa, no de código. |
| `422` | `VALIDATION_ERROR` | Cuerpo, path o query params mal formados; fecha inexistente; rango invertido; `estado` con un **código anterior** al cambio de nombres. | Lea `details.fieldErrors`: trae el campo y el mensaje. Si el mensaje dice «ya no existe: ahora se llama», reemplace el literal por el código vigente. |
| `500` | `INTERNAL` | Falla del lado de Servi Logistic. | Reintente con backoff. Si persiste, reporte con el `cargaId` o `numGuia` involucrado. |

## 8.2 Síntomas sin error visible

Estos son los que más tiempo cuestan, porque la API responde `200`.

| Síntoma | Causa | Acción |
| --- | --- | --- |
| “Mandé 500 órdenes y llegaron 480” | Éxito parcial: 20 filas volvieron en `errores[]` dentro de un `200`. | Mire `conError` y revise solo `errores[]`. sección 5.1 |
| “El lote entero falló pero me dio `200`, no `409`” | El status HTTP no es el semáforo del lote. | Use `creadas` y `conError`. sección 5.1 |
| “Filtro `filas` por `resultado: "error"` y nunca encuentro nada” | Desde el 2026-08-31 las filas con error no viajan en `filas`. | Lea `errores[]`. secciones 5.1 y 5.2 |
| “Una fila no se creó y no entiendo por qué” | Error bajo la clave `tarifa`: sin tarifa vigente **o** sin cobertura en esa zona; o un nivel de la dirección retirado del catálogo. | Muéstreselo al usuario. sección 5.1 |
| “El monto que cobró el mensajero no es el que mandé” | `monto_cobrar` se redondeó a la unidad entera de la moneda del país de la empresa. | Redondee usted antes de enviar; lea `montoAjustado`. sección 5.1 |
| “Busco por `num_remision` y no aparece” | La coincidencia es **exacta**: sin prefijo, sin subcadena, distingue mayúsculas. | Compare el literal carácter por carácter. sección 5.3 |
| “Pedí una remisión y me devolvió otra orden” | El valor casó con la **guía** de una orden y la **remisión** de otra. Se prioriza la guía. | sección 5.4 |
| “Los enlaces de etiquetas y evidencias están rotos” | Las URLs firmadas vencen a los **300 s** (1 h la del PDF que devuelve la carga). | Descargue el archivo al recibirlo; no persista la URL. secciones 5.4 y 5.5 |
| “Mi parser convierte `"2500.00"` en `2.5`” | Quedó puesto un parser de importes con punto de miles y coma decimal. | Los importes ya son números en texto: `parseFloat`/`Decimal` tal cual. sección 5.2 |
| “El total cotizado no cuadra” | Cada fila se cotizó sobre `montoCobrar` redondeado; no hay bloque de totales. | Sume las filas de `filas[]` con su tasa de entrega real. sección 5.2 |
| “No puedo eliminar una orden” | El estado no está en la lista eliminable, **o** la orden ya tiene un intento de entrega. | Consulte el estado primero; si ya está en bodega o en ruta a ella, cancele. secciones 5.7 y 5.9 |
| “Una orden que el mensajero entregó sigue `en_reparto`” | Comportamiento esperado: el estado se aplica al aprobar el cierre del mensajero. | Lea `gestiones[]` (`pendienteConfirmacion`) o consuma `orden.gestion_registrada`. secciones 5.4 y 6.7 |
| “Un estado que usaba ya no existe / me dan 422 al filtrar por estado” | Los códigos cambiaron de nombre (tabla de cambios). | Use el código vigente que nombra el mensaje del 422. Cambios, sección 4.7 |
| “El gráfico muestra caídas a cero en días sueltos, o hoy siempre sale bajo” | Rellenó con ceros días que `data` omite, convirtió `null` en `0`, o sumó el día en curso (`parcial`). | No rellene. Distinga ausente / `null` / número / parcial. sección 5.8 |
| “Las entregas + devoluciones no suman las órdenes creadas” | Unas cuentan **gestiones** y otras cuentan **órdenes**. | sección 5.8 |
| “Mi cliente generado rechaza la respuesta” | Validación estricta del esquema contra un modelo viejo: hay claves nuevas (`…Nombre`, `zona`, `costoReal`, `gestiones`, `pendienteConfirmacion`, `ayudaCerrada`, `cobertura`…). | Regenere el modelo contra el contrato vigente o relaje la validación. Cambios |
| “La firma del webhook nunca valida” | Su framework parseó y re-serializó el cuerpo antes de que usted lo leyera. | Reciba el cuerpo crudo en esa ruta. sección 6.3 |
| “Recibo el mismo evento varias veces” | Comportamiento esperado: reintentos y duplicados. | Deduplique por `eventoId`. sección 6.4 |
| “Servi Logistic me reintenta un evento que no me interesa” | Su handler responde algo distinto de `2xx`. | Responda `2xx` e ignore internamente. sección 6.4 |
| “Recibo un `evento` que no conozco” | Eventos de gestión y de ayuda (bloque B de los cambios). | Ramifique por `evento`; ignore lo que no consuma. sección 6.7 |
| “Dejaron de llegar eventos durante una hora” | Su endpoint falló varias veces seguidas y la suscripción entró en pausa; o el evento agotó sus 5 intentos. | Revise la disponibilidad de su endpoint y reconcilie con el listado. sección 6.4 |

# 9. Historial de versiones del documento

| Fecha | Versión | Qué cambió |
| --- | --- | --- |
| 2026-11-20 | Empresa suspendida por falta de pago | Nuevo `403` con `details.codigo: "empresa_congelada"` y `message` «Empresa suspendida por falta de pago.» en las seis rutas que escriben, mientras la empresa tiene facturas de la plataforma vencidas sin pagar. Las consultas y la cotización no cambian. Secciones 4.3, 4.4 y 8.1. |
| 2026-11-18 | Revisión completa | Revisada de principio a fin contra el código del canal, junto con la colección de Postman y el contrato de Swagger. URL base de producción real (`https://www.servilogistic.co`) en todos los ejemplos. Corregidos: campos obligatorios y mensajes de error de la carga, pantalla y rol que generan la clave, rotación, formato exacto del header, `409` sin mensaje propio, `403` de analítica por módulo apagado, zona horaria de las fechas, ejemplo de cancelación y de habilitación. Nuevos: ejemplos de cotización, detalle y habilitación, ejemplo verificable de firma de webhook, sección 3.7 (varias empresas, una sola URL) y sección 4.8 (Postman y Swagger). Las referencias internas se escriben como «sección 5.9». Todos los ejemplos `curl` de esta guía y todas las peticiones de la colección de Postman se ejecutan en una prueba automática contra la aplicación. |
| noviembre 2026 | Cambios de contrato | Recoge los bloques A y B (códigos de estado y eventos nuevos) y los cambios del bloque C. |
| agosto 2026 | Versión anterior | La versión que describe el canal antes de los bloques A, B y C. |
