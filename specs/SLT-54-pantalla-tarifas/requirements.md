# SLT-54 — pantalla-tarifas · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SLT-52 · Rama: feature/SLT-54-pantalla-tarifas
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Módulo de Tarifas nuevo en `/configuracion/tarifas`, que reemplaza la pantalla actual
> y pasa por `/design` antes de implementarse. Por zona y por grupo de distritos se configuran: cobro
> a la tienda (general y por tienda, con su IVA), pago al mensajero (por vehículo) y valores por
> resultado del mensajero y de la satélite (sin IVA). Incluye los grupos, con la zona especial como
> un grupo más. Lo digitado no rige hasta que el maestro pulsa «Activar tarifas nuevas». Incluye los
> huecos heredados de SLT-52 y reescribir `e2e/zona-especial-dos-empresas.spec.ts`.
>
> **Lo que NO entra.** Migrar las tarifas actuales: SLT-53 se canceló, las digita el cliente. Valor
> propio del mensajero → SLT-55. Retirar el modelo viejo → SLT-57. Incentivo manual a la satélite →
> SLT-78. Tope de intentos → SLT-77.
>
> Sembrado por `/afinar-feature` el 2026-11-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-04 | ¿Se migran las tarifas actuales? | No. Nuform las digita aquí, sin corregir nada por nosotros (ni los 2.000 a la satélite ni las 3 tiendas): son datos del cliente. |
| 2026-11-04 | ¿Cómo entra en vigor lo digitado? | Con el botón «Activar tarifas nuevas» del maestro. Hasta entonces la empresa cobra y paga con el modelo viejo aunque tenga valores nuevos. Enmienda R36/R37 de SLT-52: decide la activación, no la existencia de un valor. |
| 2026-11-04 | ¿Si al activar falta algo? | Lista lo que falta por zona y pide confirmación expresa. No bloquea. Lo vacío se resuelve como «sin tarifa», según SLT-52. |
| 2026-11-04 | ¿Se puede volver atrás? | No desde la pantalla. Los errores se corrigen editando el valor y aplican desde el siguiente cierre. Los cierres hechos no cambian. |
| 2026-11-04 | ¿Y la pantalla vieja mientras digita? | La nueva la reemplaza. Antes de activar muestra junto a cada campo el valor vigente como referencia («Hoy: 2.800»), sin copiarlo. Hasta activar, los precios viejos no se editan por pantalla. |
| 2026-11-04 | ¿Empresa nueva, sin tarifas viejas? | Mismo camino: también activa. Una sola regla. |
| 2026-11-04 | ¿Empresa que ya tenga valores nuevos al desplegar? | Queda activada, para que su cálculo no cambie. |
| heredado | Permisos | Solo `maestro` escribe; `admin` lee (SLT-52 R13). |
| heredado | Valores | Monto o % por concepto; `Decimal`; solo los cobros a la tienda llevan IVA (SLT-52). |
| heredado | Precedencia y grupos | La de SLT-52 (R5, R6, R11, R19). Un distrito, a lo sumo un grupo por zona. |
| heredado | Zona especial | Es un grupo más y se configura desde Tarifas (SL-38, SLT-51). |
| heredado | Huecos de SLT-52 | Fulfillment e `ivaFulfillment` en el detalle del cierre; tarjeta «tarifa aplicada» en el modelo nuevo; aporte por orden sin el concepto; al fijar un pago no mandar `ivaPct`; la carrera al fijar el mismo nivel se muestra como validación. |
| heredado | E2E | Obligatorio: toca importes. Reescribir `zona-especial-dos-empresas` y quitar su excepción antes del 2026-11-30 (SLT-51). |
| heredado | Salida | La épica sale completa a producción (SLT-51). |
