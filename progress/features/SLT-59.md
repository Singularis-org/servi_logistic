# SLT-59 «Reducir llamadas pagadas a Google en la optimización de ruta»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-59 | ahorro-llamadas-google-ruta | backend | high | feature/SLT-59-ahorro-llamadas-google-ruta | Cristian | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.3: review vuelta 2 OK (f30c930); menores m7-m10 corregidos (d72e5f1); `dev` mergeado (2142319). PR a `dev` abierto; falta CI verde y merge humano.

## Evaluación
zone backend / complexity high. Causa del costo: reoptimización por cada gestión, cobrada por envío (30+29+…), más una optimización por cada ventana de debounce al recoger.

## Decisiones
- Decisiones D1-D31 en `specs/SLT-59-ahorro-llamadas-google-ruta/requirements.md > Decisiones cerradas`.
- D20 (humano): la evidencia B1/B2 (gate completo y E2E) se cierra con el CI del PR. T5.2 y T6.8 quedan abiertas hasta ese CI.
- 2026-10-31 (Cristian): opción (a) para la columna jobs de §8.0 (D30); menores m7-m10 se corrigen antes del PR (D31); m7 se acepta con la empresa tomada de las filas ya bloqueadas, sin pasar `actor.organizacionId`.
- SLT-70 retirará los disparos automáticos de la primera ruta (D23/D25/D29); SLT-59 los entrega.

## Preguntas abiertas
- CI: el setup del test de m7 usa `ALTER TABLE ... DISABLE TRIGGER USER`; requiere que el usuario de la DB de CI sea dueño de las tablas.

## Tandas
- Bitácora completa en `progress/impl_SLT-59.md` (tandas 1-11) y `progress/review_SLT-59.md` (vueltas 1 y 2).

## Modelos (overrides)
