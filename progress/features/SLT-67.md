# SLT-67 «Montos sin «.00» cuando el número es cerrado (campo compartido)»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-67 | montos-sin-decimales-cerrados | frontend | low | feature/SLT-67-montos-sin-decimales-cerrados | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.0 (2026-10-30): tomada, worktree creado, sin SDD. Implementación delegada.

## Evaluación
- zone frontend: solo cómo se muestra el monto en el formulario; el valor guardado no cambia.
- complexity low: una función de formato y un campo compartido, primer uso en crear/editar orden.

## Decisiones
- 2026-10-30: sin SDD (decisión del humano).
- 2026-10-30: entero sin decimales (500 → 500); con decimales, siempre dos (500,5 → 500,50).
- 2026-10-30: se hace reutilizable: util de formato compartida + campo de monto compartido (shared) para futuros formularios.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
