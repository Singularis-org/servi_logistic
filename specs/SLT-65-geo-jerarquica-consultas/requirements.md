# SLT-65 — geo-jerarquica-consultas · requirements.md

> Zona: backend · Complejidad: high · depends_on: SLT-44 · Rama: feature/SLT-65-geo-jerarquica-consultas
>
> **Alcance.** Pasar a `nodo_geografico` el SQL crudo que une con provincia, cantón o distrito en
> órdenes (`OrdenRepository`: listado de API, `findParaCorreccion`, `findBaseCobroDevolucion`, la
> marca de zona especial), cierres (`CierreDiaRepository`), cierres-admin, zonas
> (`ZonaRepository.update`: re-derivación de la zona de las órdenes),
> `GeografiaService.contarOrdenesSinEntregar` y `lib/db/extension-empresa.ts`. Un filtro por
> ancestro pasa a `nodo_id = ANY($ids)` con los ids que calcula el dominio de SLT-44. Costa Rica
> funciona igual y los totales de dinero no se mueven.
>
> **Lo que NO entra.** Tránsito, los 4 conteos de analítica, ciclo de vida y gestión de orden →
> SLT-71. API v1/v2 y carga masiva → SLT-45. Escrituras de administración en el nodo → SLT-46.
> Filtros y presentación → SLT-47. Retirar el modelo viejo → SLT-48.
>
> Sembrado por `/afinar-feature` el 2026-10-31. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-31 | ¿Un PR o se parte? | Dos tarjetas: SLT-65 lleva lo que toca dinero o permisos (órdenes, cierres, cierres-admin, zonas, extension-empresa); tránsito, analítica, ciclo de vida y gestión de orden van a SLT-71. SLT-46, SLT-47 y SLT-48 dependen también de SLT-71 (Camilo). |
| 2026-10-31 | ¿Qué es regresión en el `EXPLAIN ANALYZE`? | Bloquea el merge si una consulta caliente tarda más de 20 % (mediana de 5 corridas) o aparece un Seq Scan sobre `orden` que antes no estaba. Se corrige con un índice (migración aditiva) antes de mergear (Camilo). |
| 2026-10-31 | ¿Guardia de caché del catálogo? | Entra: ningún repositorio que use el catálogo geográfico se instancia a nivel de módulo (m5 del review de SLT-44) (Camilo). |
| 2026-10-31 | ¿E2E nuevo? | No. Basta el script de equivalencia más los E2E `dinero` y `reparto` que ya corren en CI: ningún flujo visible cambia (Camilo). |
| 2026-10-30 | ¿Dónde se miden los totales de cierres? | En el script de equivalencia de SLT-65; lo corre una persona sobre la copia de producción antes del merge. Heredado de SLT-44. |
| 2026-10-30 | Lugar de una orden | Se lee de las FK viejas (`COALESCE(distrito_id, canton_id)`, mismo id que el nodo); el deploy no depende del backfill de SLT-43. Heredado de la tarjeta y de SLT-43. |
| 2026-10-30 | Árbol | Sin `ruta` y sin CTE recursiva; la guardia de SLT-44 (R13) sigue valiendo. Heredado de SLT-43 y SLT-44. |
| — | Migraciones | Solo aditivas (regla de la épica, SLT-43). Ningún agente toca producción ni su copia. |
