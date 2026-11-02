# SLT-52 — tarifas-flexibles-modelo · requirements.md

> Zona: backend · Complejidad: high · depends_on: — · Rama: feature/SLT-52-tarifas-flexibles-modelo
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Modelo de datos nuevo de tarifas y un único resolver. La app trae la lista fija de
> conceptos por actor: a la TIENDA se le cobra flete por cada resultado de la gestión, fulfillment
> y comisión COD; al MENSAJERO y a la SATÉLITE se les paga por cada resultado que la empresa
> configure. Cada concepto lleva monto o % (lo elige la empresa) y su IVA. Los valores viven por
> niveles: valor base de la zona, grupos de distritos con valor propio (la zona especial es un grupo
> más) y precio propio de la tienda. Desaparece la variante GAM del cálculo. Incluye los services de
> escritura que usará la pantalla de SLT-54.
>
> **Lo que NO entra.** Pantalla de Tarifas → SLT-54. Migración de las tarifas actuales → SLT-53.
> Valor propio del mensajero → SLT-55 (este modelo deja previsto el nivel y su precedencia).
> Quitar columnas viejas y el respaldo al modelo viejo → SLT-57. Ajuste del pago en el cierre →
> SLT-56 (ya en dev). Tope de intentos de entrega por empresa (hoy `REINTENTOS_MIN_INTENTOS`,
> global) → SLT-77.
>
> Sembrado por `/afinar-feature` el 2026-11-02. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **P1 — Satélite «súper configurable».** Carlos (2026-11-02): «el pago a la satélite también debe
  ser súper configurable, la empresa es quien debe decidir por qué concepto pagarle». Ya está
  cerrado que se paga por resultado, combinable, en monto o %. Falta concretar si la satélite
  diferencia por vehículo (hoy sí, vía `tarifa_zona_mensajero`) y si hay conceptos que no dependen
  del resultado de una gestión (p. ej. por orden recibida en bodega, o un fijo por período).
- **P2 — Pago por gestión o por orden.** Si una orden se reprograma dos veces y luego se entrega,
  ¿el mensajero (y la satélite) cobran el «reprogramado» dos veces más la entrega, o solo el
  resultado final? (El tope de intentos que limita esas gestiones es SLT-77.)

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-02 | Base del «% del flete» | El flete de la orden cobrado a la tienda, sin IVA. |
| 2026-11-02 | ¿Monto o %, quién decide? | La empresa, concepto por concepto. |
| 2026-11-02 | Base de un concepto en % | La fija la app por concepto: cobro a tienda → valor del pedido (recaudo); pago a mensajero o satélite → flete de la orden sin IVA. |
| 2026-11-02 | Cobro a la tienda | Flete por resultado de la gestión (hoy «flete» y «flete devuelto» son dos casos) + fulfillment + comisión COD. |
| 2026-11-02 | Pago al mensajero | Por cualquier resultado que la empresa configure (entregado, reprogramado, novedad, devolución por rechazo, incidente). |
| 2026-11-02 | Pago a la satélite | Mismo esquema que el mensajero; varios conceptos a la vez (p. ej. 2.000 por entrega + 1.500 por rechazo). Ver P1. |
| 2026-11-02 | Tienda frente a grupo | Gana la tienda. Puede pactar por zona y por grupo; si no pactó el grupo, se usa su precio de zona. |
| 2026-11-02 | Alcance de los grupos | Afectan al cobro a la tienda, al pago al mensajero y al pago a la satélite. |
| 2026-11-02 | Grupo para pagar al mensajero | Se busca el distrito de la orden en los grupos de la zona DEL MENSAJERO; si no está, se usa el valor base de esa zona. |
| 2026-11-02 | Valor propio del mensajero (SLT-55) frente a grupo | Gana el del mensajero, también sobre los grupos. |
| 2026-11-02 | ¿Qué es «sin tarifa»? | Que nadie haya configurado el valor en ningún nivel. Un 0 escrito vale 0 y NO es «sin tarifa». |
| 2026-11-02 | Convivencia hasta SLT-53 | Si la empresa no tiene valores en el modelo nuevo, se calcula con el viejo. SLT-57 quita ese respaldo. |
| 2026-11-02 | Un distrito en varios grupos | Un distrito está en a lo sumo un grupo por zona (misma regla que SLT-75 para zonas). |
| 2026-11-02 | ¿Tope de intentos aquí? | No: ficha aparte SLT-77. |
| heredado | Sin tarifa: efecto | El cierre registra 0 y no bloquea; la API por key responde 409 (274 R39). |
| heredado | Un solo cálculo | Un resolver para listado, cierre, API y cotización (274 R8/R21). |
| heredado | Congelado | Snapshot en `cierre_detail` y `gestion_orden`, ampliado a los conceptos nuevos (274 R22-R24). |
| heredado | Zona que cobra y zona que paga | Se cobra con la zona de la orden; se paga con la zona del mensajero (39, 415). |
| heredado | Quién escribe | Solo `maestro`; `admin` lee (`TarifaService`, D4). |
| heredado | GAM | Desaparece del cálculo; la marca queda como «zona de bodega principal» (SLT-51). |
| heredado | Dinero e IVA | `Decimal`, nunca `float`; IVA aparte en la wallet (SL-39). |
| heredado | E2E | Sin E2E propio: no hay pantalla (va en SLT-54). Los E2E de cierre, wallet y satélite siguen en verde; contraprueba del resolver en Postgres real. |
