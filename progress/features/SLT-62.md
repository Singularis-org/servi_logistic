# SLT-62 «Mostrar el % de efectividad aunque haya pocas órdenes»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-62 | porcentaje-efectividad-base-chica | frontend | low | feature/SLT-62-porcentaje-efectividad-base-chica | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.2 (2026-11-02): T1-T6 hechas, review OK (0 mayores, 4 menores cerrados), gate verde @50f4cb9f. Siguiente: PR a dev tras OK de Carlos.

## Evaluación
zone frontend / complexity low. Nace de las dudas del cliente del 2026-10-30 sobre Analítica y Monitoreo.
Evidencia con datos de prod: progress/verificacion-analitica-monitoreo-2026-10-29.md (en dev local, sin commitear).
Cupo: fichas propias en vuelo SLT-62/63/64; sin cruce declarado con fichas de otra persona.

## Decisiones
- 2026-10-30 (Carlos): spec aprobado con las decisiones por defecto. P1 = mantener «Ninguna ha terminado todavía» con 0 desenlaces.
- 2026-10-30 (Carlos): el porcentaje se muestra SIEMPRE y LIMPIO, sin aviso de base pequeña; se quita el texto «hacen falta 20». Aplica sobre cargadas y sobre las que tienen desenlace.
- 2026-11-02 (Carlos): «Sí, en paralelo» — se adelanta antes de terminar EP-8. Sin choque de archivos (archivos-en-vuelo exit 0).
- 2026-11-02 (Carlos): tarjeta «Efectividad de la gestión» (`KpisEfectividad.tsx`): «SÍ, que muestre su % con pocas órdenes, igual que el resto». Se fija con test literal + contraprueba.
- 2026-11-02 (Carlos): singular con 1 orden: «SÍ, corregir en esta ficha» — p. ej. «de la 1 orden que entró», «100% de la 1 orden con desenlace»; concordancia en número en todas las frases que interpolan el conteo.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-02 · T1-T5 · 716b4524 · decisiones 684c18ad · captura 92275e63 · menores 50f4cb9f · gate VERDE.

## Modelos (overrides)
Subagentes en Opus (memoria: Fable agotado).

## Cierre
