# SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» — requirements

> Ruta: completa. Zona: fullstack. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S15b** del rediseño de cierres. Viene del corte S15-PA1 de SLT-113 «Excel del modelo
> nuevo de cierres» (`specs/SLT-113-excel-modelo-nuevo-cierres/requirements.md > Fuera de alcance >
> → SLT-140`). Spec madre: `specs/SLT-95-detalle-cierre-rediseno/` (R73-R75 `[S15]`). Rango de esta
> ficha: **R377-R383** (reservados). SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega»
> (R384-R389) va en paralelo y se mergea después (`design.md > Archivos compartidos`).

## Documento aprobado

- **Dónde está:** `specs/SLT-95-detalle-cierre-rediseno/design.md > ## Excel (S15) — propuesta para
  aprobar (PA3)`: hojas «Cierres» y «Por tienda» (las de grano cierre; las de grano gestión ya están en
  `dev` por SLT-113).
- **Quién y cuándo:** Carlos, 2026-11-09 (PA3 del madre, D14); corte y niveles, 2026-11-12
  (S15-PA1..PA4 de SLT-113, «si a todo»).

## Texto heredado de SLT-113 (tal cual)

> El nivel «Resumen» de «Pendientes» y «Resueltos» de mensajeros: derivación en lote de las cifras
> por cierre con las mismas funciones del detalle; «Cierres» + «Por tienda»; mixto con «Cierres
> modelo anterior». R377-R383. ~20 archivos (8 / 12). Depende de S15a.

> Se lleva también S15-PA4: «Pago entregado (solo central)» = lo pagado al mensajero, su pago menos lo
> que falta por pagarle (`P − pendiente`, con las lecturas de SLT-137 «/cierre-dia: cola de cierres
> del mensajero con filtros» y SLT-123 «Pago al mensajero independiente del efectivo»). Hereda de esta
> ficha el contrato de libro de N hojas del control de descarga y el criterio de modelo de R371.

## Decisiones cerradas (no reabrir)

Heredadas de SLT-113 y del madre. No viene sembrado por `/afinar-feature`.

| # | Fecha · quién | Decisión |
|---|---|---|
| D14 | 2026-11-09 · Carlos (PA6 del madre) | Documento nuevo para el modelo nuevo; los cierres del modelo viejo siguen bajando con el formato actual. |
| PA3 | 2026-11-09 · Carlos | El documento nuevo es el de `design.md > Excel (S15)` del madre, tal cual (hojas, columnas, «Pago entregado» solo central, mixto con «… modelo anterior»). |
| D19 | 2026-11-09 · medición en prod | En prod todo es modelo viejo. El documento nuevo no tendrá datos hasta que se activen tarifas. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero: todo es lectura de lo ya congelado. |
| F481 | 2026-10-15 · Carlos | El fulfillment es dato de la central: la satélite no lo recibe. (La hoja «Cierres» no lleva fulfillment; aplica por analogía a «Pago entregado», que el documento marca «solo central».) |
| S15-PA1 | 2026-11-12 · Carlos | S15b = SLT-140, R377-R383. |
| S15-PA2 | 2026-11-12 · Carlos | «Resumen» = Cierres + Por tienda; «Detalle» = Gestiones + Rechazados por la tienda. |
| S15-PA3 | 2026-11-12 · Carlos | La descarga de un solo cierre dentro de su detalle conserva el formato actual. |
| S15-PA4 | 2026-11-12 · Carlos | «Pago entregado» = lo pagado al mensajero (su pago menos lo que falta por pagarle). Se cierra en SLT-140. |
| R371 | 2026-11-12 · SLT-113 | Un cierre es del modelo nuevo si alguna de sus filas congeladas lo es (`incluyeModeloNuevo`); la clasificación va por el CIERRE. |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D14 | R377, R378 |
| PA3 | R378, R379, R381, R382 |
| D19 | R377, R383 (sin cierres nuevos, ni una consulta de más) |
| D5 | R380 |
| F481 | R382 |
| S15-PA1 | todo el rango |
| S15-PA2 | R378 |
| S15-PA3 | R377 |
| S15-PA4 | R382 |
| R371 | R378 |

## Alcance

El nivel **«Resumen · una fila por cierre»** del botón «Descargar» de `/cierres-admin`, pestaña de
mensajeros (cierres del día), en sus dos pestañas «Pendientes» y «Resueltos», para la central y para
la bodega satélite (`adminSatelite`).

**Lo que NO entra:**
- El «Resumen» de cierres de bodega («Pendientes», «Resueltos», «Solicitados»): SLT-141.
- El nivel «Detalle»: ya en `dev` (SLT-113).
- La descarga de un solo cierre dentro de su detalle y la de `/cierre-dia` (S15-PA3; madre).
- Cambiar cifras de pantalla: ninguna pantalla cambia.

**Qué ve el usuario.** En prod nada cambia mientras no se activen tarifas (D19, R377). Con tarifas
activas, «Resumen» baja «Cierres» + «Por tienda» (y «Cierres modelo anterior» si el conjunto es
mixto).

## Requisitos (EARS)

«Conjunto» = los cierres que hoy baja «Resumen» en la pestaña activa: los del alcance de quien
descarga, con los filtros de la pantalla. «Central» = actor con acceso total; «satélite» =
`adminSatelite`. El test de cada R está en `tasks.md > Trazabilidad`.

- **R377** [D14, D19, S15-PA3] — SI ninguno de los cierres del conjunto es del modelo nuevo, ENTONCES
  el nivel «Resumen» DEBE bajar exactamente el archivo de hoy: mismo nombre de archivo, una sola hoja
  con su nombre de hoy, las columnas marcadas en el selector en el orden elegido, mismos encabezados
  y mismo valor en cada celda, en las dos pestañas y para la central y la satélite. La descarga de un
  solo cierre dentro de su detalle DEBE seguir igual con cualquier modelo.

- **R378** [PA3, S15-PA2, R371] — SI al menos uno de los cierres del conjunto es del modelo nuevo
  (criterio de R371), ENTONCES el nivel «Resumen» DEBE bajar un Excel con el mismo nombre de archivo
  que hoy y, en este orden:
  1. la hoja «Cierres», una fila por cada cierre del modelo nuevo;
  2. la hoja «Por tienda», una fila por cada tienda de cada uno de esos cierres;
  3. SOLO SI el conjunto también tiene cierres del modelo viejo, la hoja «Cierres modelo anterior»,
     con esos cierres en el formato de R377 (columnas marcadas, mismos encabezados y valores).

  Ningún cierre DEBE aparecer en «Cierres» y en «Cierres modelo anterior» a la vez. Las filas DEBEN
  seguir el orden de hoy del listado; en «Por tienda», dentro de cada cierre, el orden de las tiendas
  de su detalle. «Cierres» y «Por tienda» NO DEBEN depender de las columnas marcadas en el selector.

- **R379** [PA3] — La hoja «Cierres» DEBE llevar exactamente estas columnas y en este orden: Folio ·
  Mensajero · Destino · Estado · Solicitado · Resuelto · Efectivo · SINPE · Transferencia · Recaudado ·
  Se le paga a la tienda · Gana la tienda en total · Pago al mensajero · Pago a la bodega satélite ·
  Total facturado · IVA facturado · Le queda a la empresa · Gestiones · Pagos ajustados · Pago
  entregado; la última, solo para la central (R382). Sus datos descriptivos DEBEN decir lo mismo que la
  pantalla: Folio, el folio que la pantalla muestra para ese cierre; Mensajero, Destino y Estado, los
  textos de la hoja de hoy; Solicitado y Resuelto, el día calendario como en la hoja de hoy (Resuelto
  vacío si el cierre no está resuelto); Gestiones, el número de gestiones del detalle de ese cierre;
  Pagos ajustados, el número que la cola de cierres muestra en su señal «N pagos ajustados» (vacío si
  el servidor no lo da). La hoja «Por tienda» DEBE llevar exactamente Folio · Tienda · Recaudado · Se
  le paga hoy · Gana en total.

- **R380** [D5] — Cada importe de «Cierres» y de «Por tienda» DEBE ser el que el servidor da para ese
  cierre en su detalle (el que muestra la pantalla): lo recaudado y su reparto por método, «Se le paga
  a la tienda», «Gana la tienda en total», «Pago al mensajero», «Pago a la bodega satélite», «Total
  facturado», «IVA facturado», «Le queda a la empresa» y, por tienda, su recaudado, lo que se le paga
  y lo que gana en total. La descarga NO DEBE sumar, restar ni redondear importes en el navegador;
  cada importe DEBE salir como número de Excel con dos decimales y con su signo cuando es negativo
  (nunca recortado a 0). Descargar NO DEBE escribir nada en la base.

- **R381** [PA3] — La hoja «Por tienda» DEBE llevar, para cada cierre del modelo nuevo, una fila por
  cada tienda del reparto por tienda de su detalle (también cuando el cierre tiene una sola tienda) y
  ninguna si el cierre no tiene gestiones. Para cada cierre, la suma de «Recaudado», «Se le paga hoy» y
  «Gana en total» de sus filas DEBE ser igual a «Recaudado», «Se le paga a la tienda» y «Gana la tienda
  en total» de su fila en «Cierres».

- **R382** [S15-PA4, PA3, F481] — «Pago entregado» DEBE ser lo pagado al mensajero por ese cierre:
  lo que el cierre le debe (su pago, más los premios vivos del cierre; ver PA1) menos lo que falta por
  pagarle, con «lo que falta» igual al pendiente que la cola de cierres muestra para ese cierre en la
  misma lectura. SI el cierre no está aprobado, ENTONCES la celda DEBE quedar vacía. SI quien descarga
  no es la central, ENTONCES la hoja «Cierres» NO DEBE llevar la columna «Pago entregado» y el servidor
  NO DEBE enviarle ese dato. «Pago entregado» NUNCA DEBE ser negativo.

- **R383** [D19] — El sistema DEBE obtener las cifras de R380-R382 de todos los cierres del modelo
  nuevo del conjunto con un número de consultas a la base que no crezca con el número de cierres, y
  DEBE acotar esas consultas al alcance de quien descarga (empresa y, para la satélite, su zona) en la
  propia consulta, no filtrando después. SI el conjunto no tiene cierres del modelo nuevo, ENTONCES
  descargar «Resumen» NO DEBE hacer ninguna consulta más que hoy.

## Fuera de alcance

- **→ SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega»:** el «Resumen» de bodega. Reusa
  el mecanismo de columnas marcadas en el libro de `DescargarCierresButton`, el cálculo de «Pago
  entregado» y, si le sirve, el compositor de cifras (`design.md > Archivos compartidos`).
- Elegir columnas en «Cierres» y «Por tienda» (mismo criterio que PA6 de SLT-113).

## Preguntas abiertas

- **PA1: «Pago entregado» con premios.** La regla literal `P − pendiente` da un número negativo cuando
  el cierre tiene un premio vivo sin pagar: el pendiente incluye el premio y `P` no (con `P` 3 000,00,
  premio 500,00 y nada pagado, `P − pendiente` = −500,00). Recomendación: «lo que el cierre le debe»
  = `P + premios vivos`, así «Pago entregado» = `P + premios − pendiente` (0,00 en el ejemplo). Sin
  premios, que es casi todo prod, es exactamente `P − pendiente`. Así lo escribe R382; si prefieres
  `P − pendiente` recortado a 0, cambia una función y sus literales.
- **PA2: «Pago entregado» en la pestaña «Pendientes».** La cola solo pinta la columna en «Resueltos».
  El documento define una sola hoja «Cierres». Recomendación: la misma hoja en las dos pestañas, con
  la columna vacía en «Pendientes» (ningún cierre está aprobado ahí). Alternativa: quitarla en
  «Pendientes» (un catálogo de columnas más).
- **PA3: orden con SLT-139 «Pago al mensajero independiente del efectivo: satélite» (PR #149).** Las dos
  tocan `lib/utils/pendiente-cierre.ts` y `CierresAdminService.conPendiente`. Recomendación:
  implementar SLT-140 después del merge de #149 (T0.1 lo comprueba); el cálculo de «Pago entregado»
  reusa la entrada de `derivarPendienteCierre` y hereda solo lo pagado por la satélite.
- **PA4: tamaño en líneas.** ~25 archivos (por debajo de 32) pero ~1 400 líneas, por encima de las
  1 000 del gate. Recomendación: aceptarlo con `tamano-pr-aceptado` en `progress/features/SLT-140.md`,
  como SLT-113 (no se puede partir sin dejar «Resumen» a medias).
