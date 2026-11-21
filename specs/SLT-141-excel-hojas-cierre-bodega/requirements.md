# SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» — requirements

> Ruta: completa. Zona: fullstack. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S15c** del Excel del modelo nuevo. Spec madre: `specs/SLT-95-detalle-cierre-rediseno/`
> (R73-R75 `[S15]`). Corte: `specs/SLT-113-excel-modelo-nuevo-cierres/requirements.md > Fuera de
> alcance > → SLT-141`. Va **después** de SLT-140 «Excel del modelo nuevo: hojas por cierre de
> mensajeros» (S15b), que se especifica en paralelo y mergea antes. Rango reservado: R384-R389.
> No viene sembrado por `/afinar-feature`: las decisiones cerradas son las heredadas.

## Documento aprobado

- **Dónde está:** `specs/SLT-95-detalle-cierre-rediseno/design.md > ## Excel (S15) — propuesta para
  aprobar (PA3)`: la regla de formato por modelo y las hojas «Cierres» (con las columnas de bodega)
  y «Por tienda».
- **Quién y cuándo:** Carlos, 2026-11-09 (PA3 del madre, D14). El reparto en niveles, Carlos,
  2026-11-12 (S15-PA2).

## Decisiones cerradas (no reabrir)

Heredadas del madre y de SLT-113 «Excel del modelo nuevo de cierres». No se reabren.

| # | Fecha · quién | Decisión |
|---|---|---|
| D14 | 2026-11-09 · Carlos (PA6 del madre) | Documento nuevo para el modelo nuevo; los cierres del modelo viejo siguen bajando con el formato actual. |
| PA3 | 2026-11-09 · Carlos | El documento nuevo es el de `design.md > Excel (S15)` del madre, tal cual. |
| D19 | 2026-11-09 · medición en prod | En prod todo es modelo viejo. El documento nuevo no tendrá datos hasta que se activen tarifas. |
| F481 | 2026-10-15 · Carlos | El fulfillment es dato de la central: la satélite no lo recibe. El madre añade: la satélite no recibe «Pago entregado». |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero: todo es lectura de lo ya congelado. |
| S15-PA1 | 2026-11-12 · Carlos («si a todo») | S15 se parte en tres; esta ficha es S15c, R384-R389. |
| S15-PA2 | 2026-11-12 · Carlos («si a todo») | «Resumen» = Cierres + Por tienda; «Detalle» = Gestiones + Rechazados por la tienda (ya hecho en SLT-113). |
| S15-PA3 | 2026-11-12 · Carlos («si a todo») | La descarga de un solo cierre dentro de su detalle conserva el formato actual. |
| S15-PA4 | 2026-11-12 · Carlos («si a todo») | «Pago entregado» = lo pagado al mensajero (su pago menos lo que falta por pagarle). Se cierra en SLT-140. |
| H-SLT-113 | 2026-11-12 · SLT-113 T6.3 | La clasificación viejo/nuevo va por el modelo del CIERRE; el libro va por `DescargaFilasResult.libro`; columnas en `*-descarga-columnas.ts`; folio con `folioCierre`. |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D14 | R384, R385 |
| PA3 | R385, R386 |
| D19 | R384, R389 |
| F481 | R386 |
| D5 | R387 |
| S15-PA1 | R384-R389 (solo bodega; mensajeros es SLT-140) |
| S15-PA2 | R385 (nivel «Resumen» y la descarga de «Solicitados») · R384 («Detalle» no cambia) |
| S15-PA3 | R384 |
| S15-PA4 | R388 («Pago entregado», según PA1) |
| H-SLT-113 | R384 (criterio de modelo), R385 (libro), R388 (folio) |

## Alcance

El nivel **«Resumen · una fila por cierre»** de las descargas de cierres de bodega:

- la central, en cierres de bodega: pestañas «Por conciliar» y «Conciliados» (`DescargarCierresButton`,
  nivel «Resumen»);
- la bodega satélite, en su consolidación: pestaña «Solicitados» (un solo nivel; ver PA2).

Fuera: el nivel «Detalle» (SLT-113, ya en dev), las descargas de mensajeros (SLT-140), la pestaña «A
consolidar» de la satélite (no son cierres de bodega, son cierres del día sin consolidar) y la descarga
de un solo cierre de bodega dentro de su detalle (S15-PA3).

**Qué ve el usuario.** En prod nada cambia mientras no se activen tarifas (D19 y R384). Con tarifas
activas, el «Resumen» de bodega baja «Cierres» + «Por tienda» para los cierres de bodega del modelo
nuevo y, si el conjunto es mixto, además «Cierres modelo anterior» con el archivo de hoy.

## Requisitos (EARS)

El test previsto de cada R está en `tasks.md > Trazabilidad`. «Conjunto» es el de hoy de cada
pestaña: los cierres de bodega del alcance de quien descarga con los filtros puestos en la pantalla.
«Cierre de bodega del modelo nuevo» = alguno de sus cierres del día tiene una gestión congelada con
el modelo nuevo de tarifas (el criterio con que la lista ya los marca, `incluyeModeloNuevo`).

- **R384** [R73; D14, D19, S15-PA2, S15-PA3, H-SLT-113] — Las descargas de cierres de bodega DEBEN
  salir idénticas a las de hoy (mismo nombre de archivo, una sola hoja con el nombre de hoy, las
  columnas marcadas en el selector en el orden elegido, mismos encabezados y mismo valor en cada
  celda) en estos casos:
  - el «Resumen» de «Por conciliar», de «Conciliados» y la descarga de «Solicitados» SI ninguno de
    los cierres de bodega del conjunto es del modelo nuevo;
  - el nivel «Detalle» y la descarga de un solo cierre de bodega dentro de su detalle, con cualquier
    modelo.

  En el primer caso, el servidor NO DEBE hacer ninguna lectura más que hoy.
- **R385** [R74, R75; D14, PA3, S15-PA2, H-SLT-113] — SI al menos uno de los cierres de bodega del
  conjunto es del modelo nuevo, ENTONCES la descarga DEBE bajar un Excel con el mismo nombre de
  archivo que hoy y, en este orden:
  1. la hoja «Cierres», una fila por cierre de bodega del modelo nuevo;
  2. la hoja «Por tienda», una fila por cierre de bodega del modelo nuevo y tienda;
  3. SOLO SI el conjunto también tiene cierres de bodega del modelo viejo, la hoja «Cierres modelo
     anterior», con esos cierres en el formato de hoy de esa pestaña (columnas y valores de R384;
     qué columnas, según PA3).

  Ningún cierre de bodega DEBE aparecer en «Cierres» y en «Cierres modelo anterior». Las filas DEBEN
  seguir el orden de la lista de la pestaña; en «Por tienda», dentro de cada cierre, el orden de las
  tiendas de su detalle.
- **R386** [PA3, F481] — La hoja «Cierres» DEBE llevar exactamente las columnas de bodega del
  documento aprobado y en su orden, y «Por tienda» exactamente Folio · Tienda · Recaudado · Se le
  paga hoy · Gana en total (listas literales en `design.md > Hojas`). Estas dos hojas NO DEBEN
  depender de las columnas marcadas en el selector. SI quien descarga no es la central, ENTONCES
  «Cierres» NO DEBE llevar la columna «Pago entregado» y el servidor NO DEBE enviarle ese dato.
- **R387** [D5] — Cada importe de «Cierres» y de «Por tienda» DEBE ser el que el servidor da para ese
  cierre de bodega en su detalle a la misma audiencia (lo que muestra la pantalla): Efectivo, SINPE,
  Transferencia, Recaudado, Debe llegar a la central, Gana la tienda en total, Pago al mensajero,
  Pago a la bodega satélite, Total facturado, IVA facturado, Le queda a la empresa y, por tienda,
  Recaudado, Se le paga hoy y Gana en total. La descarga NO DEBE sumar, restar ni redondear importes;
  cada importe DEBE salir como número de Excel con dos decimales y con su signo cuando es negativo.
  Descargar NO DEBE escribir nada en la base.
- **R388** [H-SLT-113, S15-PA4] — Los datos descriptivos y los conteos de «Cierres» DEBEN decir lo
  mismo que la pantalla de ese cierre de bodega:
  - Folio (también el de «Por tienda»): el folio que muestran la cola y el detalle;
  - Bodega, Estado, Estado de conciliación, Recibido, Falta por recibir, Conciliado por y Cierres
    incluidos: lo que dice hoy la fila de la cola para ese cierre (Recibido vacío si no está
    conciliado, nunca 0; Destino y Estado, según PA2);
  - Solicitado, Resuelto y Conciliado el: el día calendario en la zona del país, como las fechas del
    archivo de hoy; vacío si no hay fecha;
  - Gestiones: el número de gestiones de sus cierres del día; Pagos ajustados: el número de esas
    gestiones con al menos un ajuste del pago;
  - *(Según PA1.)* Pago entregado, solo para la central: la suma, sobre sus cierres del día, de lo
    pagado al mensajero con la definición de S15-PA4 que cierra SLT-140; vacío si alguno de sus
    cierres del día no está aprobado.
- **R389** [D19] — El servidor DEBE obtener las cifras de R387 y R388 de todos los cierres de bodega
  del modelo nuevo de una descarga con un número de lecturas a la base que NO dependa de cuántos
  cierres de bodega o cierres del día haya, y con el alcance de quien descarga dentro de la propia
  lectura (la satélite, solo su zona): un cierre de bodega fuera de su alcance NO DEBE leerse.

## Fuera de alcance

- Las hojas por cierre de mensajeros y la definición de «Pago entregado» (SLT-140).
- La pestaña «A consolidar» de la satélite: sus filas son cierres del día sin cierre de bodega.
- Elegir columnas en «Cierres» y «Por tienda» (mismo criterio que PA6 de SLT-113).

## Preguntas abiertas

- **PA1: «Pago entregado» en un cierre de bodega.** El documento lista «Pago entregado (solo
  central)» entre las columnas comunes, pero ninguna pantalla de bodega lo muestra (en la cola solo
  existe en «Resueltos» de mensajeros, R103), y desde SLT-139 «Pago al mensajero independiente del
  efectivo: satélite» lo paga la satélite y se registra al conciliar. Recomendación: incluirlo para
  la central como la suma, sobre los cierres del día de esa bodega, de lo pagado al mensajero
  (`P − pendiente`, la regla de S15-PA4 de SLT-140, que ya resta lo pagado por la satélite), vacío
  si alguno no está aprobado. La alternativa, quitar la columna de la hoja de bodega, ahorra una
  inyección y tres lecturas por descarga.
- **PA2: columnas del documento que en bodega no tienen dato propio.** «Destino»: un cierre de
  bodega siempre va a la central. «Estado» y «Estado de conciliación»: desde la ficha 431 el archivo
  de bodega lee el estado con el vocabulario de la conciliación, así que las dos dirían lo mismo.
  Recomendación: dejar las dos columnas porque PA3 dice «tal cual»: «Destino» con el texto que la
  pantalla da a un destino `bodega_central` (`destinoCierre`), «Estado» con el texto de la cola de
  hoy y «Estado de conciliación» igual. Si prefieres quitarlas, son dos columnas menos y un literal
  menos en los tests.
- **PA3: «Cierres modelo anterior» y las columnas marcadas.** En el nivel «Resumen» el control no
  pasa a `obtenerFilas` las columnas que marcaste, y con `libro` no aplica el selector. SLT-140 tiene
  el mismo problema en mensajeros. Recomendación: usar lo que decida SLT-140; si no deja mecanismo,
  la hoja sale con todas las columnas del archivo de hoy de esa pestaña, en su orden.
- **PA4: «Solicitados» de la satélite no tiene selector de nivel.** Es una sola descarga, una fila
  por cierre de bodega. Recomendación: tratarla como su «Resumen» (R385) sin añadir selector.
- **PA5: tamaño en líneas.** 25 archivos (15 de producción, 10 de tests), pero ~1 500 líneas (la integración contra Postgres sola
  son ~350). Recomendación: aceptarlo con `tamano-pr-aceptado` en `progress/features/SLT-141.md`,
  como SLT-113.
