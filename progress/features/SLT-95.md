# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-95 | detalle-cierre-rediseno | frontend | high | feature/SLT-95-detalle-cierre-rediseno | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2: spec en `specs/SLT-95-detalle-cierre-rediseno/`. Rama desde `dev` (e9aa915f).

## Evaluación
Tarjeta: zone frontend, complexity high. La descripción incluye piezas que pueden tocar servidor (pago al mensajero en Incidente de /cierre-dia y su Excel; títulos de Excel según modelo; verFulfillment por audiencia en bodega): el spec confirma la zona.

## Decisiones
- 2026-11-08, Carlos: canvas aprobado https://claude.ai/artifact/2Nci9ebPPdHs58rHZTwz7C. Opción A: UN componente (tipo mensajero|bodega) para «Ver detalle» y «Ver / decidir» del mensajero y «Ver / decidir» de bodega. Fila desplegada opción 2: 4 tarjetas en 2x2, «Ver cómo se calculó» = una tarjeta por concepto. «Le queda a la empresa» es la única cifra de ganancia; se quita «Debe». Métodos de pago en 0 no se muestran. Sin cambios de dinero.
- Copia del canvas en `specs/SLT-95-detalle-cierre-rediseno/canvas/project/` (canvas.json con notas n1/n2 = diferencias por tipo y reglas; Main.dc.html = el componente; Fila2.dc.html = fila desplegada elegida).

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
