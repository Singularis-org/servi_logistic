# SLT-56 — ajuste-pago-mensajero-cierre · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-56-ajuste-pago-mensajero-cierre
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Al revisar un cierre del mensajero, antes de aprobarlo, maestro y admin (y el
> adminSatelite en los cierres de su bodega) pueden cambiar lo que el mensajero gana por cualquier
> gestión del cierre, incluidas rechazos y devoluciones que hoy pagan 0. El motivo es obligatorio;
> el historial guarda quién, cuándo, valor anterior y nuevo. Los totales del cierre (y del cierre
> de bodega) reflejan el ajuste y la gestión queda marcada como «ajustada».
>
> **Lo que NO entra.** Ajustar un cierre ya aprobado (después se usa premio o descuento en la
> wallet, como hoy). Valor propio del mensajero → SLT-55. Tarifas nuevas → SLT-52.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Quién ajusta? | `maestro` y `admin`; `adminSatelite` solo en cierres de su bodega. |
| 2026-10-28 | ¿Cómo? | Por gestión, con motivo obligatorio; historial con valor anterior y nuevo. |
| 2026-10-29 | ¿Hasta cuándo? | Solo antes de aprobar el cierre. Aprobado, queda fijo. |
| 2026-10-29 | ¿Qué gestiones? | Cualquiera, también rechazo o devolución (hoy pagan 0). |
| 2026-10-29 | ¿La central aprueba el ajuste de la satélite? | No: entra directo, queda visible en historial y en el cierre de bodega, marcado como ajustado. |
| heredado | Congelado | El pago se congela al solicitar el cierre (39); el ajuste cambia esa copia, no la tarifa. |
| heredado | Libro de pagos | `PagoMensajeroMovimiento` es de solo-agregar; el devengo refleja el valor ajustado. |
| heredado | E2E | Obligatorio: toca importes (`docs/checkpoints-proyecto.md > Flujos criticos`). |
