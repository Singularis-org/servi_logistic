# SLT-64 «Ciclo de vida dice 0 cerradas con entregas registradas»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-64 | ciclo-vida-cerradas-coherente | backend | medium | feature/SLT-64-ciclo-vida-cerradas-coherente | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.0: en curso desde 2026-11-04. Carlos retoma la ficha sin esperar a EP-8. Spec podado a R1-R17 y revalidado contra dev.

## Evaluación
zone backend / complexity medium. Nace de las dudas del cliente del 2026-10-30 sobre Analítica y Monitoreo.
Evidencia con datos de prod: progress/verificacion-analitica-monitoreo-2026-10-29.md (en dev local, sin commitear).
Cupo: fichas propias en vuelo SLT-62/63/64; sin cruce declarado con fichas de otra persona.

## Decisiones
- 2026-10-30 (Carlos): spec aprobado con las decisiones por defecto. Alcance R1–R17; R18–R23 a ficha aparte (hay que podar el spec antes de implementar). Q1/Q2/Q3 = No.
- 2026-10-30 (Carlos): «cerrada» en Analítica = gestión final del mensajero (entregado, devolución, incidente), no el cierre aprobado.
- 2026-10-30 (Carlos): si una gestión se anula o corrige, el dato de Analítica debe moverse con la corrección (última gestión vigente, caché/rollup invalidados).
- 2026-11-04 (Carlos): retoma SLT-64 antes de terminar EP-8. Frase: «dale sigue», en respuesta a la propuesta de seguir con SLT-64.
- 2026-11-04 (Carlos): choque aceptado con SLT-42 (Camilo) en `lib/repositories/CohorteCargaRepository.ts`; SLT-64 solo toca comentarios ahí. Frase: «bueno entonces continuemos con lo que estábamos trabajando», en respuesta a la pregunta del leader; el leader la interpreta como aceptación y se lo dijo. Resuelve quien mergee segundo.

## Preguntas abiertas
Ninguna.

## Tandas
- T1 → T2: hasta 99abb72d; R8 verde sin parche tras `prisma generate`.
- T3 → T4: 37ee4d32; gate `INIT_EXIT=0`.
- Hallazgo de medición: la primera lectura tras invalidar traía la cifra vieja. `PERFIL_INVALIDACION` pasa de `"max"` a `{ expire: 0 }` (0060494a); gate `INIT_EXIT=0`. Lo anunció el leader sin respuesta de Carlos; revertible en la rama.
- Revisión vuelta 1: RECHAZO (B1 desempate de R1 sin medir, B2 sin E2E). Vuelta 2 de arreglos: 14f8f5db.
- Pendiente tras el merge (m4): en el Preview de `dev`, deshacer una gestión y recargar una vez; `{ expire: 0 }` solo se midió en `next dev` y `next start`.

## Modelos (overrides)
Subagentes en Opus (memoria: Fable agotado).

## Cierre
