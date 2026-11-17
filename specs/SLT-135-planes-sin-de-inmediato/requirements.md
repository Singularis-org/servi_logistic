# SLT-135 — planes-sin-de-inmediato · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** SLT-128 · **Rama:** `feature/SLT-135-planes-sin-de-inmediato`
>
> **Alcance.** Al editar un plan desaparece «De inmediato»: toda edición (incluido solo el nombre) lleva una
> fecha «A partir de» y llega a cada empresa al inicio de su período de cobro que empiece en esa fecha o
> después (mecanismo de SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su
> período»). Incluye retirar el camino inmediato del servicio, de la action y del paso «Cuándo rige» del
> formulario, y ajustar los tests (unitarios, de integración y E2E) que hoy editan «De inmediato».
>
> **Lo que NO entra.** El borrador del cambio → SLT-129 «Planes: borrador del plan guardado en el servidor por
> pasos» (en curso, PR #200). Conectar el formulario al borrador y mostrar la fecha de cada empresa → SLT-144
> «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa».
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Qué fechas admite «A partir de» al editar? | Desde hoy (≥ hoy). Una empresa cuyo período empieza hoy lo recibe hoy; las demás, al inicio de su siguiente período que empiece en la fecha o después. Sustituye la regla «posterior a hoy» de SL-24 R37; es el «≥ hoy por empresa» que SLT-128 P9 dejó para esta ficha. |
| 2026-11-11 | ¿Qué partes del plan se editan con fecha? | Todo lo editable: nombre, costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes (heredado de SLT-128). |
| 2026-11-11 | «De inmediato» con el plan partido (SLT-128 R16, P7) | Queda sin objeto al desaparecer la edición inmediata; spec_author retira o reemplaza R16 de SLT-128 explícitamente. |
| 2026-11-11 | Correos, reemplazo, cancelación y recepción no aplicada | Como en SLT-128 (P1, P2, P4–P6, P8, P10, m2, m3), sin cambios. |
| 2026-11-17 | ¿Cómo valida el paso `vigencia` del borrador de SLT-129? | Con la validación de editar que deje esta ficha (≥ hoy, sin inmediato); SLT-129 ya la reutiliza. |
| 2026-11-17 | ¿Quién edita? | Solo el superadmin (heredado de SL-24). |
| 2026-11-17 | ¿E2E? | Sí: se ajustan los E2E de planes que hoy editan «De inmediato». |
| 2026-11-17 | ¿Ruta? | Completa: dinero y cambio de comportamiento del servicio de planes. |
