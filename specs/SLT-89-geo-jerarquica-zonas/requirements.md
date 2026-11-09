# SLT-89 — geo-jerarquica-zonas · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SLT-46 · Rama: feature/SLT-89-geo-jerarquica-zonas (sobre SLT-46)
>
> **Alcance.** Las zonas de cada empresa se asignan a cualquier nodo de la geografía, no solo a
> distritos: `GeografiaSelector` a N niveles, con lo que hereda cada nodo y sus excepciones; aviso de
> impacto antes de guardar (cuántas órdenes pendientes cambian de zona o tarifa y cuántas no se
> mueven); las órdenes pendientes elegibles se mueven como hoy. Los grupos de tarifas agrupan
> cualquier nodo de su zona. El trigger de `orden` deja de forzar el nodo al distrito/cantón: una
> orden puede apuntar a cualquier nodo cubierto. Historial de la empresa para los cambios por nodo.
>
> **Lo que NO entra.**
> - Pantalla para marcar zona especial por nodo: la zona especial se maneja como grupo en Tarifas
>   (SLT-54); la marca vieja solo se lee, heredada.
> - Filtros, exportes y presentación → SLT-47. Retirar columnas `distrito_id` → SLT-48.
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
Ninguna.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-09 | ¿Qué pasa con las órdenes pendientes al reasignar un nodo? | Se mueven como hoy (`planificarReconciliacion`): las elegibles cambian de zona; las de cierre, entregadas o con gestión viva se quedan y se cuentan. Reemplaza «conservan su zona_id» de la tarjeta. |
| 2026-11-09 | ¿Pantalla para marcar zona especial por nodo? | No: se maneja como grupo en Tarifas (SLT-54); la marca vieja solo se lee heredada. |
| 2026-11-09 | ¿Qué agrupa un grupo de tarifas? | Cualquier nodo de su zona; gana el más específico. |
| 2026-11-09 | ¿Un distrito puede ir a otra zona que su cantón? | Sí, gana el más específico; el selector muestra herencia y excepciones. |
| 2026-11-09 | ¿E2E? | Sí: asignar un cantón, aviso de impacto, confirmar, orden en ese cantón con zona y precio esperados, y aislamiento entre dos empresas. |
| 2026-11-09 | ¿Partir la tarjeta? | No, una sola. |
| heredada SLT-44 | Herencia | Gana la asignación más cercana subiendo; colapso 1/0/>1 (`_shared/zona-colapso.ts`). |
| heredada SLT-46 | Confirmación | Toda escritura pasa por modal antes → después con control de cambio concurrente. |
| heredada | Permisos | Zonas: solo `maestro`; grupos: lectura maestro+admin, escritura maestro. |
| heredada SLT-43 | Migraciones | Solo aditivas hasta SLT-48, con `down.sql`. |
