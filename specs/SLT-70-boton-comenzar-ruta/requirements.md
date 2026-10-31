# SLT-70 — boton-comenzar-ruta · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: SLT-59 · Rama: feature/SLT-70-boton-comenzar-ruta
>
> **Alcance:** un botón «Comenzar ruta» en la pantalla del mensajero que dispara el PRIMER trazado
> del día: una única llamada inicial (1 optimizeTours + 1 computeRoutes) por mensajero y día. Pasa
> a ser el disparo principal de la primera ruta. Si queda algún paquete asignado sin recoger, un
> modal avisa cuántos faltan y pide confirmación antes de calcular.
>
> **Lo que NO entra:** las reglas de reoptimización después de la primera ruta (entrega fuera de
> orden, desvío, ruta caída): siguen como las deja SLT-59. Contador o reporte persistido de
> llamadas por motivo: futura ficha.
>
> Sembrado por `/afinar-feature` el 2026-10-31. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-10-31 | ¿Qué pasa con los disparos automáticos de la primera ruta de SLT-59? | Se retiran el de recoger todo, el de 10 min sin recoger y el de alejarse 1 km (SLT-59 D23/D25/D29). SLT-59 los entrega y SLT-70 los retira (SLT-59 D30). Solo quedan el botón «Comenzar ruta» y, como respaldo, la primera gestión del día (para no repartir nunca sin ruta). Siempre una sola llamada inicial al día. |
| 2026-10-31 | ¿Cuándo se habilita el botón? | Siempre, sin mínimo de paquetes recogidos. Sustituye al umbral del 80 % de SLT-59 D25 para la primera ruta. |
| 2026-10-31 | ¿Qué pasa si faltan paquetes por recoger al pulsarlo? | Un modal dice cuántos quedan pendientes («Faltan N paquetes por recoger; no entrarán en la ruta. ¿Comenzar igual?») y pide confirmar. Los que recoja después NO recalculan solos: entran solo cuando pulse «Sincronizar ruta». |
| 2026-10-31 | Después de pulsarlo | El botón deja de mostrarse ese día y queda «Sincronizar ruta» con sus reglas de SLT-59. |
| 2026-10-31 | Log | Motivo `primera_ruta_comenzar` en la línea `[google-api]` de SLT-59 (D27); el respaldo mantiene `primera_ruta_primera_gestion`. |
| 2026-10-31 | Permiso | Solo el propio mensajero, sobre su ruta; validado en el service (patrón de `lib/actions/ruta-mensajero.ts`, heredado de la 92). |
| 2026-10-31 | ¿E2E? | Sí: se amplía `e2e/mis-asignaciones.spec.ts` con recoger → «Comenzar ruta» → modal → ruta visible. Corre en CI. |
| 2026-10-31 | ¿Dependencia nueva? | No. El modal usa el diálogo de shadcn que ya está en el repo. |
