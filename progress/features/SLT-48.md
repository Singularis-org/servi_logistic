# SLT-48 «Geografía jerárquica: retirar modelo viejo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-48 | geo-jerarquica-contract | backend | medium | feature/SLT-48-geo-jerarquica-contract | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

Rama `feature/SLT-48-geo-jerarquica-contract` desde `feature/SLT-125-geo-jerarquica-exportes` (PR #161). Épica geo apilada antes de mergear a dev.

## Estado
F1.0 hecha (2026-11-17): tomada, worktree creado, labels en Trello. Sigue F1.2 (spec).

## Evaluación
- zone backend: migraciones, Prisma, repositorios y código muerto; la UI solo cambia en mover nodos y en el tope de niveles.
- complexity medium (del board), ruta completa: es la única fase irreversible (DROP, NOT NULL, RENAME) y lleva puerta humana y backup.
- Cupo: excedido por las fichas geo en pausa; el humano lo aceptó (2026-11-17: «omite el cupo, las tareas estan en pausa como parte de una tarea mas grande»).
- `depends_on` (SLT-45, 46, 47, 65, 71, 89, 125) siguen in_progress: terminadas, esperan el merge de la pila geo.

## Decisiones
- 2026-11-17, humano: «arranca 48, omite el cupo».

## Preguntas abiertas
- La description pide dos deploys separados (vistas de solo lectura + observación; después el borrado). ¿Una ficha o dos PRs?
- ¿Hay consumidores externos que leen la base directamente (BI, reportes)? Lo pregunta la propia description.

## Tandas

## Modelos (overrides)

## Cierre
