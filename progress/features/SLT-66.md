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
- 2026-10-31: T0 — empresas con plan: 0 en logistic_slt66 y en logistic (local); el humano confirma 0 en QA y producción. M4 (desasignar) se aplica sin afectar a ninguna empresa real.
- 2026-10-31: tests fuera de design §9.3 rotos por R1/R4 (maestro fuera, costoPorOrden nuevo): el humano autoriza el ajuste mecánico («Sí, autoriza»).

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-10-31 · A (T0–T4) · 6a8ea4d…aa02a4c · 108/108 en los 10 archivos de planes contra logistic_slt66; eslint limpio; typecheck rojo solo en tests/components y plataforma-*-page (tanda D, esperado). init.sh no se corre en tandas intermedias por memoria y por ese rojo esperado; cierra la tanda D + CI.

## Modelos (overrides)

## Cierre
