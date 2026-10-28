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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

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
