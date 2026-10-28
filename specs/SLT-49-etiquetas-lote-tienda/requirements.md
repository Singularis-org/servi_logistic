# SLT-49 — etiquetas-lote-tienda · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-49-etiquetas-lote-tienda
>
> **Alcance.** El usuario de tienda (`adminTienda`) selecciona en `/ordenes` varias de SUS órdenes
> que ya tienen guía, en los estados de recogida, e imprime sus etiquetas en un solo PDF, como ya
> hacen maestro y admin. Solo esa acción por lote. El servidor limita a la tienda a sus propias
> órdenes, en el lote y en la impresión individual que ya tiene.
>
> **Lo que NO entra.** Generar guía desde la tienda; el resto de acciones por lote; limitar por
> dueño a mensajero y otros roles que no son maestro/admin (→ SLT-50).
>
> Sembrado por `/afinar-feature` el 2026-10-28. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

«Estados de recogida» = `por_recolectar_en_tienda`, `recolectando` y
`mensajero_recogiendo_en_bodega` (decisión cerrada). «Con guía» = la orden tiene número de guía.

### Pantalla `/ordenes` para la tienda (`adminTienda`)

- **R1.** MIENTRAS el actor es `adminTienda` y está en `/ordenes`, el sistema DEBE permitir marcar
  por casilla cada orden suya que esté en un estado de recogida y tenga guía.
- **R2.** CUANDO el `adminTienda` tiene marcada al menos una orden en un estado de recogida y con
  guía, el sistema DEBE ofrecer en la barra de selección la acción «Imprimir etiquetas», aplicada
  solo a las órdenes marcadas que están en un estado de recogida y tienen guía; SI esas órdenes no
  son toda la selección, ENTONCES el botón DEBE mostrar cuántas son («Imprimir etiquetas (N)»).
- **R3.** CUANDO el `adminTienda` pulsa «Imprimir etiquetas», el sistema DEBE abrir la vista previa
  de las etiquetas de esas órdenes y permitir descargarlas en un solo PDF.
- **R4.** MIENTRAS el actor es `adminTienda`, el sistema NO DEBE ofrecer en la barra de selección
  ninguna acción por lote del flujo distinta de «Imprimir etiquetas» (generar guía, asignar o quitar
  mensajero, deshacer asignación, cambiar día, rutear, devolver, recuperar, traspasar). «Eliminar»
  sigue ofreciéndose con su regla vigente (FICHA 358), sin cambio.
- **R5.** SI una orden del `adminTienda` está en un estado de recogida y no tiene guía, ENTONCES el
  sistema DEBE bloquear su casilla y mostrar el motivo «Sin guía todavía». (Ver P1.)
- **R6.** SI ninguna de las órdenes marcadas por el `adminTienda` está en un estado de recogida con
  guía, ENTONCES el sistema NO DEBE mostrar la acción «Imprimir etiquetas».

### Servidor: frontera por dueño para la tienda

- **R7.** CUANDO un `adminTienda` pide las etiquetas de un conjunto de órdenes, el sistema DEBE
  devolver solo las de su tienda y reportar cada orden de otra tienda como «no encontrada», igual
  que una orden inexistente, sin dejar de devolver las suyas.
- **R8.** CUANDO un `adminTienda` pide la etiqueta de una sola orden de otra tienda (acción por
  fila «Ver etiqueta»), el sistema NO DEBE devolver la etiqueta y DEBE reportarla como «no
  encontrada».
- **R9.** CUANDO un `adminTienda` abre `/paquete/<numGuia>` de una orden de otra tienda, el sistema
  DEBE responder lo mismo que para una guía inexistente (404). (Ver P2.)
- **R10.** MIENTRAS el actor es `adminTienda`, el sistema NO DEBE leer de la base de datos los
  datos de etiqueta de una orden cuya tienda no sea la suya, aunque se le pida por su id o por su
  guía.
- **R11.** CUANDO un `maestro` o un `admin` piden etiquetas (en lote, por fila o por guía), el
  sistema DEBE devolver las de cualquier tienda de su empresa, como hasta ahora.
- **R12.** MIENTRAS el actor es `mensajero` o `adminSatelite`, el sistema DEBE conservar el
  comportamiento actual de etiquetas, sin filtro por dueño (su alcance lo decide SLT-50).
- **R13.** MIENTRAS el actor es una API key (`apiKey`), el sistema DEBE seguir devolviendo solo las
  etiquetas de las órdenes de su propia tienda, como hasta ahora (feature 136).

### Una sola regla

- **R14.** El sistema DEBE derivar de una única regla de alcance de etiquetas tanto si `/ordenes`
  ofrece a un rol «Imprimir etiquetas» por lote limitado a lo suyo como el filtro por dueño que el
  servidor aplica a ese rol; cambiar el alcance de un rol en esa regla DEBE cambiar las dos cosas.

### Sin regresión para quien ya imprimía por lote

- **R15.** MIENTRAS el actor es `maestro` o `admin`, el sistema DEBE seguir ofreciendo «Imprimir
  etiquetas» por lote en los mismos estados que hoy (`por_recolectar_en_tienda`, `recolectando`,
  `mensajero_recogiendo_en_bodega`, `en_bodega_central`, `en_ruta_bodega_satelite`) y seguir
  abriendo la vista previa de etiquetas tras «Generar guía» y tras «Asignar mensajero» desde bodega.

### Cobertura de las decisiones cerradas

| Decisión (fecha 2026-10-28) | Requisitos |
|---|---|
| Solo «Imprimir etiquetas» | R2, R4 |
| Los 3 estados de recogida | R1, R2, R6 |
| Sin guía: casilla bloqueada, «Sin guía todavía» | R5 |
| Hueco del service: se cierra para `adminTienda` (lote e individual); otros roles → SLT-50 | R7, R8, R9, R10, R12 (R11, R13 sin regresión) |
| Patrón FICHA 358 + una sola función | R14 (y R4, R15 por el modal que sale del bloque `accionesLote`) |
| E2E corto + test de servidor con orden ajena | R3 (E2E), R7 y R10 (integración contra Postgres) |
| Origen: una tienda cliente lo intentó | R1–R3 (contexto, sin requisito propio) |

## Preguntas abiertas

- **P1. Orden en estado de recogida, sin guía, que la tienda SÍ puede eliminar.** Los tres estados
  de recogida están en `ESTADOS_ELIMINABLES` (`lib/types/order-status-eliminables.ts:65-84`), así
  que una orden así lleva hoy `eliminable = true` para la tienda y su casilla se puede marcar para
  «Eliminar» (FICHA 358). Aplicar R5 al pie de la letra le quita a esa fila la casilla y, con ella,
  «Eliminar». ¿Se bloquea igual (R5 tal cual), o la casilla queda marcable solo para «Eliminar» y
  «Imprimir etiquetas» la excluye con el conteo de R2? El caso parece raro: según
  `OrdenesListado.tsx:723-725` estas órdenes nacen con guía (feature 155). **Por defecto el spec
  aplica R5 tal cual** (es lo decidido); si el humano elige la otra, cambia R5 y la task T5.
- **P2. `/paquete/<numGuia>` para la tienda.** La decisión cierra el hueco de
  `EtiquetaGuiaService` «en lote y en la impresión individual». `/paquete` no es impresión, pero lee
  por el mismo service (`obtenerEtiquetaPorGuia`, `EtiquetaGuiaService.ts:90-102`) y hoy le enseña
  a una tienda el destinatario, teléfono, dirección y monto de un paquete ajeno si conoce la guía.
  **Por defecto el spec lo cierra también (R9)**, porque es el mismo hueco en la misma clase. Si el
  humano lo quiere fuera, se retira R9 y la parte de `findEtiquetaByNumGuia` pasa a SLT-50.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Qué acción por lote recibe la tienda? | Solo «Imprimir etiquetas». No genera guía ni recibe otras acciones de flujo. |
| 2026-10-28 | ¿En qué estados? | Los 3 de recogida que la tienda ve: `por_recolectar_en_tienda`, `recolectando`, `mensajero_recogiendo_en_bodega`. |
| 2026-10-28 | ¿Y las órdenes sin guía (`numGuia` null)? | La casilla queda bloqueada, con el motivo «Sin guía todavía». |
| 2026-10-28 | Hueco: `EtiquetaGuiaService` no filtra por dueño en roles de sesión (`lib/services/EtiquetaGuiaService.ts:51-54`) | Se cierra para `adminTienda`: una orden de otra tienda se rechaza, en lote y en la impresión individual. Otros roles → SLT-50. |
| 2026-10-28 | ¿Cómo se habilita una sola acción por lote a un rol? | Heredado de la FICHA 358 («Eliminar»): una prop aparte que se suma a `haySeleccion` y un modal fuera del bloque `accionesLote`. Una sola función decide quién puede, en la pantalla y en el servidor (como `resolverAlcanceBorradoOrden`). |
| 2026-10-28 | ¿E2E? | Sí, uno corto: la tienda marca 2 órdenes suyas e imprime. Más un test de servidor que rechaza una orden ajena. |
| 2026-10-28 | Origen | Lo intentó una tienda cliente de una empresa usuaria. |
