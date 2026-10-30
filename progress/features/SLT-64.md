# SLT-64 «Ciclo de vida dice 0 cerradas con entregas registradas»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-64 | ciclo-vida-cerradas-coherente | backend | medium | feature/SLT-64-ciclo-vida-cerradas-coherente | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4: spec APROBADO 2026-10-30 (comentario en la tarjeta). En espera: Carlos pide terminar EP-8 primero.

## Evaluación
zone backend / complexity medium. Nace de las dudas del cliente del 2026-10-30 sobre Analítica y Monitoreo.
Evidencia con datos de prod: progress/verificacion-analitica-monitoreo-2026-10-29.md (en dev local, sin commitear).
Cupo: fichas propias en vuelo SLT-62/63/64; sin cruce declarado con fichas de otra persona.

## Decisiones
- 2026-10-30 (Carlos): spec aprobado con las decisiones por defecto. Alcance R1–R17; R18–R23 a ficha aparte (hay que podar el spec antes de implementar). Q1/Q2/Q3 = No.
- 2026-10-30 (Carlos): «cerrada» en Analítica = gestión final del mensajero (entregado, devolución, incidente), no el cierre aprobado.
- 2026-10-30 (Carlos): si una gestión se anula o corrige, el dato de Analítica debe moverse con la corrección (última gestión vigente, caché/rollup invalidados).

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)
Subagentes en Opus (memoria: Fable agotado).

## Cierre
