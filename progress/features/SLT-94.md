# SLT-94 «Cobro de fulfillment por paquete y marca «se recoge en tienda»»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-94 | fulfillment-cobro-por-paquete | fullstack | high | feature/SLT-94-fulfillment-cobro-por-paquete | ArqDev (Carlos) | pending → spec |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2 — spec en curso (2026-11-08 noche). Sale en el mismo despliegue que #97 (decisión de Carlos): #97 espera.

## Evaluación
fullstack (migración de la marca, wallet de tienda, ingreso empresa, pantalla Tarifas y ficha de tienda) · high (dinero nuevo en prod). Única feature en vuelo de Carlos que toca estas piezas.

## Decisiones
Carlos, 2026-11-08:
- El fulfillment es un servicio de empacado y almacenaje: cobro a la tienda, ganancia de la empresa.
- Se cobra una vez por paquete al CREARSE la orden. No depende de la gestión ni del cierre.
- Si la orden se elimina, se devuelve el cobro.
- La marca `fulfillment` de la tienda pasa a «se recoge en tienda (sí/no)» y solo decide el estado en que nace la orden.
- Se cobra si la tienda tiene un valor de fulfillment > 0. Recoger en tienda + fulfillment pueden convivir.
- El fulfillment solo se pone directamente a la tienda (precio propio), no en zona ni grupo.
- Solo monto fijo (+ IVA), no porcentaje.
- Vale igual para orden por API, manual y carga masiva.
- Rige desde la implementación: nada retroactivo; cierres congelados intactos. Un cambio de valor cuenta para órdenes nuevas.
- Sale esta noche con #97. El rediseño (SLT-95) espera.
- Cobro SOLO con el modelo nuevo (precio propio de la tienda). Mientras la empresa siga en el modelo viejo no se cobra, como hoy; empieza al activar sus tarifas nuevas.

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
