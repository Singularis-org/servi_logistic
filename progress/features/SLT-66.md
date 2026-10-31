# SLT-66 «Planes: sin tope para el maestro y costeo base + por orden»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-66 | planes-sin-tope-maestro-y-costeo | fullstack | high | feature/SLT-66-planes-sin-tope-maestro-y-costeo | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2 hecho (2026-10-31): spec 62bcdfd aprobado; enmienda con las respuestas en curso. Siguiente: F2 (implementación por tandas).

## Evaluación
- zone fullstack: migración (topes y costos del plan), cobro de SL-40 y pantallas de SLT-58.
- complexity high: toca el modelo de SL-24, el cargo de SL-40 en wallet (importes) y tres pantallas.
- Cruce: también toca `PlanForm` (SLT-67, mía, PR #51). Si #51 entra antes, merge de dev al empezar la implementación.

## Decisiones
- 2026-10-31: alcance acotado con `/afinar-feature` → `specs/SLT-66-planes-sin-tope-maestro-y-costeo/requirements.md` (tabla «Decisiones cerradas»).
- 2026-10-31: spec aprobado por escrito («Aprobado, acepto choque»). P1 = lo que se cobra; P2 = no se asigna un plan sin costo base y costo por orden concretos (sin bloqueo de login); P3 = entra. Nuevo: asignar plan descubrible desde el listado de Empresas. Enmienda en curso (spec_author).
- 2026-10-31: choque aceptado por el humano con SLT-56 y SLT-64 (Carlos Restrepo) en db/schema.prisma; mismo dueño que SLT-43/SLT-44.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
