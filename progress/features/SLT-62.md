# SLT-62 «Mostrar el % de efectividad aunque haya pocas órdenes»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-62 | porcentaje-efectividad-base-chica | frontend | low | feature/SLT-62-porcentaje-efectividad-base-chica | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4: spec APROBADO 2026-10-30 (comentario en la tarjeta). En espera: Carlos pide terminar EP-8 primero.

## Evaluación
zone frontend / complexity low. Nace de las dudas del cliente del 2026-10-30 sobre Analítica y Monitoreo.
Evidencia con datos de prod: progress/verificacion-analitica-monitoreo-2026-10-29.md (en dev local, sin commitear).
Cupo: fichas propias en vuelo SLT-62/63/64; sin cruce declarado con fichas de otra persona.

## Decisiones
- 2026-10-30 (Carlos): spec aprobado con las decisiones por defecto. P1 = mantener «Ninguna ha terminado todavía» con 0 desenlaces.
- 2026-10-30 (Carlos): el porcentaje se muestra SIEMPRE y LIMPIO, sin aviso de base pequeña; se quita el texto «hacen falta 20». Aplica sobre cargadas y sobre las que tienen desenlace.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)
Subagentes en Opus (memoria: Fable agotado).

## Cierre
