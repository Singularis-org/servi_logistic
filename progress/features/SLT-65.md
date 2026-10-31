# SLT-65 «Geografía jerárquica: consultas de órdenes, cierres y zonas sobre el nodo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-65 | geo-jerarquica-consultas | backend | high | feature/SLT-65-geo-jerarquica-consultas | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-31): tomada en Trello y worktree creado. La rama nace de `dev` y lleva mergeado
`feature/SLT-44-geo-jerarquica-dominio` (PR #55, que a su vez lleva SLT-43, PR #44; ninguno
mergeado) como base. F1.1 (`/afinar-feature`) hecho. F1.2 hecho (2026-10-31, spec_author):
`requirements.md` (R1–R28, 4 preguntas abiertas con propuesta), `design.md` y `tasks.md` en
`specs/SLT-65-geo-jerarquica-consultas/`. Siguiente: F1.3, puerta humana (`spec_ready`) y cerrar las
preguntas abiertas 1–4.

## Evaluación
- zone `backend`; complexity `high` fijada por el leader: toca lecturas de dinero (cierres,
  cobro de devoluciones) y la re-derivación de zonas.
- Dependencia SLT-44: PR #55 con CI verde y review aprobada, pendiente de T7.2 y del merge humano.
- Cupo backend de Camilo: 4/3 con esta. Excepción aceptada por el humano el 2026-10-31: SLT-43 y
  SLT-44 están abiertas pero en pausa hasta probar.

## Decisiones
- 2026-10-31 · Alcance y decisiones cerradas en `specs/SLT-65-geo-jerarquica-consultas/requirements.md`.
- 2026-10-31 · Se parte en dos: tránsito, analítica, ciclo de vida y gestión de orden van a SLT-71
  (nueva). SLT-46, SLT-47 y SLT-48 dependen también de SLT-71.
