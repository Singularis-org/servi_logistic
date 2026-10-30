# SLT-68 «Incentivo manual a un mensajero en la wallet»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-68 | incentivo-manual-mensajero | fullstack | medium | feature/SLT-68-incentivo-manual-mensajero | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en curso. URGENTE: va a producción en cuanto pase review y gate.

## Evaluación
zone fullstack / complexity medium. Hoy no hay forma de registrar un incentivo libre:
- `premio_ranking` (feature 293) solo para el podio, monto fijado por el ranking;
- `pago_a_mensajero` (categoría `liquidacion`) liquida deuda: usarlo como incentivo deja la cuenta por pagar en negativo y no baja la ganancia;
- `ajuste_devengo` existe en el enum pero solo lo emiten las anulaciones.

## Decisiones
- 2026-10-30 (Carlos): prioritaria y urgente, antes que EP-8 («lo necesitan urgente», salida a producción).
- 2026-10-30 (Carlos, por el borrador aprobado): maestro y admin; monto y motivo obligatorios, fecha; suma a la cuenta por pagar del mensajero y baja la ganancia; categoría propia «Incentivo»; anulable con contraasiento.

## Preguntas abiertas

## Tandas

## Modelos (overrides)
Subagentes en Opus.

## Cierre
