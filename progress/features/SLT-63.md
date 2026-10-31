# SLT-63 «Recolección recibida en central sigue a nombre del mensajero»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-63 | recoleccion-recibida-libera-mensajero | backend | medium | feature/SLT-63-recoleccion-recibida-libera-mensajero | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4: spec APROBADO 2026-10-30 (comentario en la tarjeta). En espera: Carlos pide terminar EP-8 primero.

## Evaluación
zone backend / complexity medium. Nace de las dudas del cliente del 2026-10-30 sobre Analítica y Monitoreo.
Evidencia con datos de prod: progress/verificacion-analitica-monitoreo-2026-10-29.md (en dev local, sin commitear).
Cupo: fichas propias en vuelo SLT-62/63/64; sin cruce declarado con fichas de otra persona.

## Decisiones
- 2026-10-30 (Carlos): spec aprobado con las decisiones por defecto. Q1 = (a) migración de datos con down.sql.
- 2026-10-30 (Carlos): «arreglemos todo eso». Arreglo mínimo de lo evidenciado: que la recolección recibida en central aparezca en «Reasignables» y no cuente en Monitoreo del mensajero.

## Preguntas abiertas
Mecanismo (liberar asignación al recibir vs ajustar predicados): lo propone el spec con alternativa descartada.

## Tandas

## Modelos (overrides)
Subagentes en Opus (memoria: Fable agotado).

## Cierre
