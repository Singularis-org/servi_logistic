# SLT-44 — Geografía jerárquica: dominio y repositorios

> Zona `backend` · Complejidad `high` · depends_on `SLT-43` · Rama `feature/SLT-44-geo-jerarquica-dominio`
>
> **Alcance.** Una sola vía de lectura de la geografía, con N niveles, sobre `nodo_geografico`. Un
> módulo puro, `lib/services/geografia-dominio.ts`, trabaja sobre el catálogo del país cargado en
> memoria: ancestros y descendientes de un nodo, activo en cascada, tipos del país y la zona que
> cubre un nodo (gana la asignación más específica). Se reescriben las lecturas de `GeoRepository` y
> de `_shared/geografia-activa.ts`, y la resolución de cobertura y de tarifa especial, que pasa a
> heredar por los ancestros. Las escrituras siguen en las tablas viejas. Costa Rica funciona igual.
>
> **Lo que NO entra.** SQL crudo de los ~12 repositorios (órdenes, cierres, tránsito, analítica,
> zonas, `extension-empresa`) → SLT-65. API v1/v2 y CSV → SLT-45. Escrituras en el nodo y
> administración → SLT-46. Filtros, exportes y presentación → SLT-47. Borrar lo viejo → SLT-48.
> Correr los scripts sobre la copia de producción: lo hace una persona.
>
> Sembrado por `/afinar-feature` el 2026-10-30. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Dónde vive la caché del catálogo del país y cuándo se invalida: por petición, por proceso con
  TTL, o al escribir geografía. Lo decide el `design.md`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-30 | ¿Cómo se resuelven ancestros y descendientes sin `ruta`? | Con el catálogo del país en memoria (unos 500 nodos). El SQL recibe la lista de ids ya calculada (`= ANY($ids)`). Sin CTE recursiva. Hereda la enmienda «sin `ruta`» de SLT-43 (Camilo). |
| 2026-10-30 | ¿De dónde se lee el lugar de una orden o de una zona? | De las FK viejas (`COALESCE(distrito_id, canton_id)`): el nodo tiene el mismo id. El deploy no depende de que haya corrido el backfill de SLT-43 (Camilo). |
| 2026-10-30 | ¿Una tarjeta o dos? | Dos. El SQL crudo de los repositorios va a SLT-65, que depende de SLT-44. SLT-47 y SLT-48 dependen también de SLT-65 (Camilo). |
| 2026-10-30 | ¿Quién corre la equivalencia de dinero sobre la copia de producción? | Una persona, con el script que deja esta feature, antes del merge; el resultado se pega en el PR. En CI se cubre con fixtures. Mismo patrón que el script de datos de SLT-43 (Camilo). |
| 2026-10-30 | ¿Qué pasa si un nodo cae en más de una zona? | Se hereda el colapso 1/0/>1 de la ficha 374 (`_shared/zona-colapso.ts`), aplicado a la asignación más específica entre los ancestros. |
| 2026-10-30 | ¿`geografia-dominio` o `GeografiaService`? | Un módulo nuevo y puro, como dice la tarjeta. `GeografiaService` sigue con las escrituras de administración. |
| 2026-10-30 | ¿E2E? | No hay E2E nuevo. Hacen de red los E2E existentes de dinero y reparto, más la integración contra Postgres real. Se hereda de SL-20 y SLT-43. |
| 2026-10-30 | Precedentes | SL-20 (identificadores en español), ficha 374 (retiro por `activo`, colapso de zona), SL-17 (geografía de plataforma, solo lectura para la empresa), SLT-43 (migraciones solo aditivas, un PR por tarjeta a `dev`). |
