# SLT-48 «Geografía jerárquica: retirar modelo viejo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-48 | geo-jerarquica-contract | fullstack | high | feature/SLT-48-geo-jerarquica-contract | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

Rama `feature/SLT-48-geo-jerarquica-contract` desde `feature/SLT-125-geo-jerarquica-exportes` (PR #161). Épica geo apilada antes de mergear a dev.

## Estado
F1.0 hecha y acotada (2026-11-17). Sigue F1.2 (spec).

## Evaluación
- zone fullstack (acotación 2026-11-17): migraciones, Prisma y lectores al nodo, más pantallas de mover nodos y de N niveles (SLT-125 P6).
- complexity high, ruta completa: migraciones con DROP de FK y triggers, tarifas y permisos de superadmin. ~35-50 archivos de producción y 60-90 de tests, tamaño aceptado.
- Cupo: excedido por las fichas geo en pausa; el humano lo aceptó (2026-11-17: «omite el cupo, las tareas estan en pausa como parte de una tarea mas grande»).
- `depends_on` (SLT-45, 46, 47, 65, 71, 89, 125) siguen in_progress: terminadas, esperan el merge de la pila geo.

## Decisiones
- 2026-11-17, humano: «arranca 48, omite el cupo».
- 2026-11-17: acotada con `/afinar-feature`. Alcance y decisiones en `specs/SLT-48-geo-jerarquica-contract/requirements.md`. El deploy 2 pasó a SLT-196 «Geografía jerárquica: borrar el modelo viejo». En Trello, zone pasó a fullstack y complexity a high.

## Preguntas abiertas
- Las de `requirements.md > Preguntas abiertas`: si mover un nodo cambia la zona y el precio de las órdenes, y cuánto dura la observación.

## Tandas

## Modelos (overrides)

## Cierre
