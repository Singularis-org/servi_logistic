# SLT-111 «Cifras del servidor: reparto en % y señales de la cola» — requirements

> Ruta: completa (`ruta: completa`; pantalla de dinero). Zona: fullstack. Escrito por spec_author el
> 2026-11-12.
>
> Rebanada **S13** del rediseño de cierres. Spec madre, aprobado por Carlos:
> `specs/SLT-95-detalle-cierre-rediseno/` (R70 `[S13]`; `design.md > Cifras nuevas del servidor`,
> fila «Reparto en % (R70)»; `design.md > Números escritos a mano para los tests`; `tasks.md > Plan
> de las demás rebanadas > S13`). Precedente que se copia: SLT-110 «Cifras del servidor en la fila:
> tarifas, IVA, pago y fulfillment» (`specs/SLT-110-cifras-servidor-fila-bodega/`).
>
> **Hallazgo que acota la ficha** (`design.md > Lo que ya existe`): la mitad «señales de la cola»
> de R70 ya está hecha y mergeada. SLT-102 «Cola de cierres única: mensajeros (central y satélite)» la trajo por su PA1
> (R70 parte de la cola, R109, R110): `CierresAdminService` emite `senalesCola` con una consulta
> agregada por página y `ColaCierres` pinta «<n> incidente(s) sin indemnizar», «<n> pago(s)
> ajustado(s)», «<n> vuelve(n) a bodega», con su integración contra Postgres
> (`tests/integration/db/cierres-cola-senales-sql-real.test.ts`). El propio spec de SLT-102 dice
> «El reparto en porcentajes de R70 sigue en SLT-111». Y la pantalla del reparto ya está lista para
> recibirlo: `DineroCierre` dibuja la barra solo si llegan los porcentajes y `detalle-cierre-vista.ts`
> ya tiene el hueco `porcentajesReparto` en las dos vistas, que hoy nadie rellena. Este spec se
> limita a **emitir los porcentajes en el servidor y pasarlos hasta la vista**.

## Alcance

El detalle único de un cierre, pestaña «Dinero», bloque «¿A dónde va lo recaudado?»:

- **Cierre de mensajero** (`/cierres-admin` › Mensajero, audiencias central y satélite):
  `CierresAdminService.verCierreDetalle` emite el reparto en % de lo recaudado entre «Se le paga hoy
  a la tienda» y «Sale de lo recaudado».
- **Cierre de bodega** (`/cierres-admin` › Bodega, la central): `CierresBodegaAdminService
  .verCierreBodegaDetalle` emite el reparto en % entre «Debe llegar a la central», «Pago a
  mensajeros» y «Gana la bodega satélite».
- **Servidor:** una función pura nueva con la regla de redondeo (mayor resto, enteros que suman 100)
  y sus casos `null`. Sin consultas nuevas, sin escrituras, sin migración.
- **Pantalla:** pasar el campo del resultado del servidor a la vista (`CierresAdminModule` lo copia a
  su estado; los dos mapeadores de `detalle-cierre-vista.ts` lo ponen en su hueco). `DineroCierre` no
  cambia: ya dibuja la barra y el «(n %)» de la leyenda cuando llegan.

## Lo que NO entra

- Las señales de la cola de mensajeros (R70, parte de la cola; R109; R110): ya están, SLT-102. No se
  tocan ni su consulta ni sus textos.
- Señales en la cola de bodega: R70 solo las pide en la cola de mensajeros.
- Una barra de reparto en las filas de las colas (ver PA2).
- La audiencia mensajero (`/cierre-dia`): no recibe el dinero de la empresa (R9 del madre), así que
  tampoco el reparto.
- Las cifras de la satélite leyendo su cierre de bodega (SLT-107 «Bodega satélite: Solicitados y su
  cierre de bodega en lectura»): lo hereda si usa `verCierreBodegaDetalle` y `vistaBodegaDesdeAdmin`
  (`design.md > Lo que hereda SLT-107`).
- El Excel (S15) y la ganancia del mensajero (S14, SLT-112 «Cifras del servidor: ganancia pendiente y
  pagada del mensajero»).
- Cambiar cómo se calcula, congela o asienta un importe (R72). Los porcentajes se derivan de importes
  que el servidor ya emite.

## Decisiones cerradas (no reabrir)

No viene sembrado por `/afinar-feature`. Estas son las heredadas del madre y de SLT-102 que este spec
aplica.

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D10 | 2026-11-09 · Carlos | Todas las cifras del canvas van; las que no llegan las deriva el servidor. |
| R70 (madre) | SLT-95 aprobado · Carlos | Porcentajes **enteros que suman 100**; `null` si lo recaudado es cero o alguna parte es negativa, y entonces solo la leyenda con los importes. |
| Diseño madre, «Reparto en % (R70)» | SLT-95 aprobado · Carlos | Regla del **mayor resto**; empate de restos: gana la primera parte. Partes del mensajero: [`pagoTienda`, `cobradoSobreRecaudado`]; de bodega: [`paraLaCentral`, `totalPagoMensajero`, `totalIngresoBodegaRechazos`]; base `totales.general`. |
| Literales del madre | SLT-95 aprobado · Carlos | 94,35 % / 5,65 % → **94 % / 6 %**; 96,5 % / 3 % / 0,5 % → **97 % / 3 % / 0 %**. |
| PA1 (SLT-102) | 2026-11-09 · Carlos («sí») | Las señales con conteo del servidor entraron en SLT-102; SLT-111 se queda con el reparto en %. |

## Requisitos (EARS)

R70, R71 y R72 son copia del madre, con su número y su sentido. R260-R267 son nuevos de esta ficha
(rango reservado R260-R279). El test previsto de cada R está en `tasks.md > Trazabilidad`.

### Del madre

- **R70** [S13] — El servidor DEBE emitir el reparto de lo recaudado en porcentajes enteros que
  sumen 100, y la barra de «Dinero» DEBE dibujarse con ellos. SI lo recaudado es cero o alguna parte
  es negativa, ENTONCES el servidor DEBE emitir `null` y la pantalla DEBE pintar solo la leyenda con
  los importes. La cola de mensajeros DEBE además mostrar en Señales, por cierre, incidentes sin
  indemnizar, pagos ajustados y paquetes que vuelven, con conteos emitidos por el servidor. *(La
  parte de la cola ya la cumple SLT-102; aquí se cita su test sin cambiarlo.)*
- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.

### La regla del reparto (nuevo)

- **R260** — CUANDO el total es mayor que cero, ninguna parte es negativa y las partes suman
  exactamente el total al céntimo, el servidor DEBE emitir, por parte y en el orden recibido, un
  entero entre 0 y 100 calculado por mayor resto: a cada parte le toca la parte entera de
  `parte × 100 / total`; los puntos que falten hasta 100 DEBEN ir, de uno en uno, a las partes con
  mayor resto; a igual resto DEBE ganar la parte que va antes. Los enteros DEBEN sumar 100.
- **R261** — SI el total es cero o negativo, SI alguna parte es negativa, o SI las partes no suman
  el total al céntimo, ENTONCES el servidor DEBE emitir `null` en lugar de los porcentajes.
- **R262** — El cálculo de R260 y R261 DEBE hacerse con aritmética decimal exacta sobre los importes
  en céntimos, sin pasar un importe por coma flotante; solo el entero resultante (0-100) se emite
  como número.

### Dónde se emite (nuevo)

- **R263** — CUANDO la central o la satélite abre el detalle de un cierre de mensajero, el servidor
  DEBE emitir junto al detalle el reparto de R260/R261 con las partes [«Se le paga hoy a la tienda»
  (`pagoTienda`), «Sale de lo recaudado» (`cobradoSobreRecaudado`)] y el total `totales.general` del
  cierre, en ese orden.
- **R264** — CUANDO la central abre el detalle de un cierre de bodega, el servidor DEBE emitir junto
  al detalle el reparto de R260/R261 con las partes [«Debe llegar a la central» (`paraLaCentral`),
  «Pago a mensajeros» (`totalPagoMensajero`), «Gana la bodega satélite»
  (`totalIngresoBodegaRechazos`)] y el total `totales.general` del cierre de bodega, en ese orden.
- **R265** — El reparto de R263 y R264 DEBE derivarse de los importes que el detalle ya lee, sin
  ninguna consulta adicional a la base, sin escrituras y sin migración; el número de consultas del
  detalle NO DEBE depender del número de gestiones ni de cierres del día que lleve.

### Lo que se ve (nuevo)

- **R266** — CUANDO llegan los porcentajes, el bloque «¿A dónde va lo recaudado?» DEBE dibujar la
  barra con una franja por parte del ancho de su porcentaje y DEBE añadir a cada entrada de la leyenda
  «(<n> %)» con el entero recibido. CUANDO llega `null` o no llega el campo, DEBE pintar solo la
  leyenda con los importes, sin barra y sin «%».
- **R267** — El valor emitido por el servidor DEBE llegar sin cambios hasta la pantalla en los dos
  detalles de `/cierres-admin` (mensajero y bodega): ningún paso intermedio DEBE descartarlo,
  recalcularlo ni reordenarlo. La audiencia mensajero (`/cierre-dia`) NO DEBE recibirlo.

## Preguntas abiertas

Para Carlos. Ninguna bloquea escribir el código: el spec sigue al madre y la respuesta solo cambiaría
un texto o un caso de test.

- **PA1 — Una parte mayor que cero que redondea a «0 %».** El madre fija para bodega «Gana la bodega
  satélite ₡500 (0 %)» (96,5 / 3 / 0,5 → 97 / 3 / 0). En analítica eso mismo se trató como fallo
  (`tests/components/AnalyticsGraficaReparto.test.tsx`: «Reprogramadas 1» con «(0 %)» y sin franja) y
  se cambió a «<0,1 %». **Recomendación:** quedarse con el madre (enteros que suman 100, franja de
  ancho 0); si prefieres «(<1 %)» para una parte con importe > 0 y entero 0, el servidor emitiría una
  marca por parte (el cliente no puede comparar el importe con cero, R71) y R266 cambia de texto.
- **PA2 — «Barra de reparto … en las colas».** La descripción de la ficha habla de barra «en las
  colas»; R70 del madre la pone en la barra de «Dinero» del detalle y las colas solo llevan las
  señales (ya hechas). **Recomendación:** solo en el detalle, como el madre y el canvas. Si querías una
  barra por fila de la cola, es otra rebanada (cambia `ColaCierres` y la consulta por página).
