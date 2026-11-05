# SLT-55 — valor-propio-mensajero · requirements.md

> Zona: fullstack · Complejidad: small · depends_on: SLT-52 · Rama: feature/SLT-55-valor-propio-mensajero
>
> **Alcance:** la empresa fija, en la pantalla de Tarifas, el pago propio de un mensajero por cada
> resultado (entregado, reprogramado, novedad, rechazo, incidente), en monto o porcentaje y sin IVA.
> Si lo tiene, gana sobre el valor de la zona y sus grupos, en cualquier zona donde trabaje. El
> resultado que no se digite usa el valor de la zona. Incluye la escritura, que SLT-52 dejó prevista.
>
> **Lo que NO entra:** cambiar el nivel o la precedencia (SLT-52, R6 y R19). Valor propio para la
> satélite o la tienda. Cualquier pantalla nueva en el portal del mensajero. Retirar el modelo viejo
> → SLT-57.
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Dónde se digita? | En la pantalla de Tarifas, en una sección de mensajeros con valor propio. No en la ficha del mensajero. |
| 2026-11-05 | ¿Qué puede tener valor propio? | Cada uno de los 5 resultados. El que no se digite usa el valor de la zona. |
| 2026-11-05 | ¿El mensajero lo ve en su portal? | No cambia nada: ve sus pagos como hoy, con el importe correcto. |
| 2026-11-05 | Nivel y precedencia | Heredado de SLT-52 (R6, R19): valor propio > grupo > zona, sin zona, grupo ni vehículo. |
| 2026-11-05 | IVA, modo y permisos | Heredado de SLT-52: sin IVA, monto o porcentaje; `maestro` escribe, `admin` lee. |
| 2026-11-05 | Cierres ya hechos | Heredado de SLT-52: el pago queda congelado al cerrar; un cambio solo afecta lo que se cierre después. |
| 2026-11-05 | Empresa sin activar | Heredado de SLT-54: puede digitar, pero no aplica hasta activar. |
| 2026-11-05 | Faltantes de la zona | Heredado de SLT-54: el valor propio no cubre el faltante de una zona. |
| 2026-11-05 | ¿E2E? | Sí: es dinero (`docs/checkpoints-proyecto.md`). |
