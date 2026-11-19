# SLT-113 «Excel del modelo nuevo de cierres» — requirements

> Ruta: completa. Zona: fullstack. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S15** del rediseño de cierres. Spec madre: `specs/SLT-95-detalle-cierre-rediseno/`
> (R73-R75 `[S15]`; `tasks.md > Plan de las demás rebanadas > S15`).
>
> - **v1 (2026-11-12): BLOQUEADO antes de escribir los requisitos.** Con el documento aprobado, la
>   feature pasaba de lo que cabe en un PR (`docs/specs.md > Partir una feature`). Este archivo dejó
>   el hallazgo, el tamaño medido y la propuesta de corte (`## Por qué no cabe`, más abajo).
> - **v2 (2026-11-12): corte decidido por Carlos («si a todo»).** SLT-113 se queda con **S15a, las
>   hojas por gestión** (nivel «Detalle»), R370-R376. Las hojas por cierre pasan a SLT-140 «Excel del
>   modelo nuevo: hojas por cierre de mensajeros» y a SLT-141 «Excel del modelo nuevo: hojas por
>   cierre de bodega» (`## Fuera de alcance`).

## Documento aprobado

- **Dónde está:** `specs/SLT-95-detalle-cierre-rediseno/design.md > ## Excel (S15) — propuesta
  para aprobar (PA3)`: la regla de formato por modelo y la tabla de cuatro hojas (Cierres,
  Gestiones, Por tienda, Rechazados por la tienda).
- **Quién y cuándo:** Carlos, 2026-11-09: «PA3 aprueba el Excel del modelo nuevo tal como está en
  design.md» (`progress/features/SLT-95.md`, decisiones del 2026-11-09). Decisión D14 del madre.

## Decisiones cerradas (no reabrir)

Heredadas del madre. No viene sembrado por `/afinar-feature`.

| # | Fecha · quién | Decisión |
|---|---|---|
| D14 | 2026-11-09 · Carlos (PA6) | Documento nuevo para el modelo nuevo; los cierres del modelo viejo siguen bajando con el formato actual. |
| PA3 | 2026-11-09 · Carlos | El documento nuevo es el de `design.md > Excel (S15)` del madre, tal cual. |
| D19 | 2026-11-09 · medición en prod | En prod todo es modelo viejo (918 gestiones, `tarifa_modelo = viejo`; `tarifa_valor` = 0 filas). El documento nuevo no tendrá datos hasta que se activen tarifas. |
| F481 | 2026-10-15 · Carlos | El fulfillment es dato de la central: la satélite no lo recibe. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero: todo es lectura de lo ya congelado. |
| S15-PA1 | 2026-11-12 · Carlos («si a todo») | Se parte en tres. SLT-113 = S15a (hojas por gestión, R370-R376). S15b → SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (R377-R383 reservados). S15c → SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (R384-R389 reservados). |
| S15-PA2 | 2026-11-12 · Carlos («si a todo») | Se conservan los dos niveles del selector: «Resumen» = Cierres + Por tienda; «Detalle» = Gestiones + Rechazados por la tienda. |
| S15-PA3 | 2026-11-12 · Carlos («si a todo») | La descarga de un solo cierre dentro de su detalle conserva el formato actual. |
| S15-PA4 | 2026-11-12 · Carlos («si a todo») | «Pago entregado» = lo pagado al mensajero (su pago menos lo que falta por pagarle). Se cierra en SLT-140. |

Requisitos del madre que esta ficha cubre: R73, R74, R75, solo en el nivel «Detalle». Rango de
esta ficha: R370-R376.

Cobertura:

| Decisión | Requisitos |
|---|---|
| D14 | R370, R372 |
| PA3 | R372, R373 |
| D19 | R370 |
| F481 | R376 |
| D5 | R374 |
| S15-PA1 | R370 (lo que no es «Detalle» sigue igual en este corte) · `## Fuera de alcance > → SLT-140` y `→ SLT-141` |
| S15-PA2 | R372 («Detalle» = Gestiones + Rechazados por la tienda) · R370 («Resumen» sin cambios hasta SLT-140 y SLT-141) |
| S15-PA3 | R370 |
| S15-PA4 | `## Fuera de alcance > → SLT-140` |

## Alcance

El nivel **«Detalle · una fila por gestión»** del botón «Descargar» de las dos pantallas de cierres
del maestro, con su ventana de mensajeros y rango:

- cierres del día en `/cierres-admin` (central y bodega satélite);
- cierres de bodega (solo la central).

En este corte el nivel «Detalle» queda **completo** según S15-PA2: lleva las dos hojas que le tocan
(«Gestiones» y «Rechazados por la tienda»), porque las dos son de grano gestión y salen del mismo
conjunto de cierres. Lo que espera a SLT-140 y SLT-141 es solo el nivel «Resumen».

**Qué ve el usuario entre merges.** En prod no cambia nada visible mientras no se activen tarifas
(D19: todo es modelo viejo, y R370 deja ese archivo idéntico). Con tarifas activas:

- «Detalle» baja el documento nuevo (o el libro mixto) completo;
- «Resumen» sigue bajando el formato de hoy para los dos modelos, en mensajeros hasta SLT-140 y en
  bodega hasta SLT-141. Es el archivo que ya existe, entero y sin columnas a medio poblar: no se
  añade ninguna hoja ni columna por cierre en este corte;
- la descarga de un solo cierre dentro de su detalle y la del mensajero en `/cierre-dia` no
  cambian (S15-PA3; madre).

## Requisitos (EARS)

El test previsto de cada R está en `tasks.md > Trazabilidad`. «Conjunto» es el de hoy: los cierres
del alcance de quien descarga con los mensajeros y el rango elegidos en la ventana.

- **R370** [R73; D14, D19, S15-PA2, S15-PA3] — Las descargas de cierres DEBEN salir idénticas a las
  de hoy (mismo nombre de archivo, mismas hojas con sus nombres, las columnas marcadas en el selector
  en el orden elegido, mismos encabezados y mismo valor en cada celda) en estos casos:
  - el nivel «Detalle · una fila por gestión» SI ninguno de los cierres del conjunto es del modelo
    nuevo;
  - el nivel «Resumen · una fila por cierre», de mensajeros y de bodega, con cualquier modelo;
  - la descarga de un solo cierre dentro de su detalle, con cualquier modelo.
- **R371** [R73-R75] — El sistema DEBE considerar que un cierre es del modelo nuevo SI al menos una de
  sus gestiones quedó congelada con el modelo nuevo de tarifas al solicitarlo, y del modelo viejo en
  cualquier otro caso (también si ninguna de sus órdenes tenía tarifa). El criterio DEBE ser el mismo
  con que la lista de cierres marca hoy un cierre como del modelo nuevo.
- **R372** [R74, R75; D14, PA3, S15-PA2] — SI al menos uno de los cierres del conjunto es del modelo
  nuevo, ENTONCES el nivel «Detalle» DEBE bajar un Excel con el mismo nombre de archivo que hoy y,
  en este orden:
  1. la hoja «Gestiones», con las gestiones de los cierres del modelo nuevo;
  2. la hoja «Rechazados por la tienda», con los paquetes rechazados por la tienda en esos mismos
     cierres;
  3. SOLO SI el conjunto también tiene cierres del modelo viejo, la hoja «Gestiones modelo
     anterior», con las gestiones de esos cierres en el formato de R370 (columnas marcadas, mismos
     encabezados y valores).

  Ninguna gestión DEBE aparecer en dos hojas, y todas las gestiones de un mismo cierre DEBEN ir en la
  misma hoja.
- **R373** [PA3] — La hoja «Gestiones» DEBE llevar exactamente las columnas de «Gestiones» del
  documento aprobado y en su orden, y la hoja «Rechazados por la tienda» exactamente Folio · Nº Guía ·
  Destinatario · Motivo · Tienda · Fecha del rechazo (lista literal en `design.md > Hojas`). Estas dos
  hojas NO DEBEN depender de las columnas marcadas en el selector. SI los cierres del modelo nuevo no
  tienen ningún rechazo de la tienda, ENTONCES la hoja «Rechazados por la tienda» DEBE salir igual,
  solo con sus encabezados. Las filas DEBEN seguir el orden de hoy: por cierre como en la lista y,
  dentro de cada cierre, las gestiones como en su detalle y los rechazos del más viejo al más reciente.
- **R374** [D5] — Cada importe de la hoja «Gestiones» DEBE ser el que el servidor da para esa gestión
  en el detalle del cierre (el que muestra la pantalla): lo recibido y su reparto por método, cada
  concepto del cobro a la tienda con su IVA, «Se le cobra a la tienda», «De eso, IVA», «Pago por
  tarifa», «Ajuste», «Pago al mensajero», «Gana la bodega satélite», el fulfillment y su IVA. La
  descarga NO DEBE sumar, restar ni redondear importes; cada importe DEBE salir como número de Excel
  con dos decimales, «Ajuste» con signo negativo cuando resta, y un concepto que no aplica a esa
  gestión DEBE dejar la celda vacía, nunca 0. Descargar NO DEBE escribir nada en la base.
- **R375** — Los datos descriptivos de la hoja «Gestiones» DEBEN decir lo mismo que el detalle del
  cierre para esa gestión:
  - «Folio del cierre» y el Folio de «Rechazados por la tienda»: el folio que la pantalla muestra
    para ese cierre;
  - cada «Tarifa de …»: el modo, el valor y el origen de la tarifa congelada de ese concepto
    (`design.md > Hojas`); vacía si el concepto no aplica o no tiene tarifa congelada;
  - «Señales»: el mismo texto que la celda «Señales» de la fila de esa gestión para quien descarga;
  - «Motivo del ajuste» y «Ajustó»: el motivo y el nombre del último ajuste, como la tarjeta del pago;
  - las fechas («Fecha de gestión», «Fulfillment cargado el», «Fecha del rechazo»): el día calendario
    en la zona del país de la empresa, como las fechas de la hoja de hoy (en Costa Rica, el día de
    Costa Rica aunque el instante sea después de las 18:00).
- **R376** [F481] — SI quien descarga no es la central, ENTONCES la hoja «Gestiones» NO DEBE llevar
  las columnas «Fulfillment», «IVA de fulfillment» ni «Fulfillment cargado el», y el servidor NO
  DEBE enviarle esos datos.

## Fuera de alcance

### → SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros»

S15b. Su spec usará R377-R383, reservados. Texto de la propuesta (PA1, v1), tal cual:

> El nivel «Resumen» de «Pendientes» y «Resueltos» de mensajeros: derivación en lote de las cifras
> por cierre con las mismas funciones del detalle; «Cierres» + «Por tienda»; mixto con «Cierres
> modelo anterior». R377-R383. ~20 archivos (8 / 12). Depende de S15a.

Se lleva también S15-PA4: «Pago entregado (solo central)» = lo pagado al mensajero, su pago menos lo
que falta por pagarle (`P − pendiente`, con las lecturas de SLT-137 «/cierre-dia: cola de cierres
del mensajero con filtros» y SLT-123 «Pago al mensajero independiente del efectivo»). Hereda de esta ficha el
contrato de libro de N hojas del control de descarga y el criterio de modelo de R371.

### → SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega»

S15c. Su spec usará R384-R389, reservados. Texto de la propuesta (PA1, v1), tal cual:

> El nivel «Resumen» de «Pendientes», «Resueltos» y «Solicitados» de bodega: columnas de bodega,
> conciliación y pago a la satélite; la satélite sin fulfillment ni «Pago entregado» (F481).
> R384-R389. ~17 archivos (7 / 10). Depende de S15b.

### Sin ficha

- La descarga de un solo cierre dentro de su detalle con el documento nuevo (S15-PA3: conserva el
  formato actual; si se quiere, ficha aparte después de SLT-141).
- La descarga del mensajero en `/cierre-dia` (el madre la deja igual).

## Por qué no cabe

*(Hallazgo de la v1, se conserva tal cual. Corrección de la v2 al final de «Lo que ya existe».)*

`arnes.config.json` no fija `gate.tamano_pr`: rige el defecto, 40 archivos y 1 000 líneas. El 80 %
son 32 archivos. El madre estimaba S15 en ~14 archivos y ~800 líneas antes de aprobarse el
documento; el documento aprobado pide cifras que hoy el servidor no emite en ninguna descarga.

### Lo que ya existe (buscado: «Excel», «descarga», «tarifaModelo», «netoEmpresa», «hojasAdicionales»)

- **Librería:** `exceljs` aprobada (`docs/dependencias.md`). No hace falta ninguna nueva.
- **Generador:** `lib/types/descarga.ts > DescargaConfig.hojasAdicionales` ya arma libros de N hojas;
  `formato: "monto"` ya emite el número con `#,##0.00` (`celdaMonto`, ficha 468). Las fechas de las
  hojas de cierres ya salen en día calendario de Costa Rica (`fechaCalendarioCR`).
- **Control:** `DescargarDatasetButton` solo sabe pedir **una** hoja extra (`DataTableDescarga.detalle`
  y `DescargaFilasResult.filasDetalle`). El documento nuevo y el caso mixto piden 2 a 4 hojas en
  un archivo: hay que ampliar ese contrato compartido (lo usan ~30 tablas).
- **Superficies de descarga de cierres hoy (formato actual):**
  - Resumen, una fila por cierre: mensajeros «Pendientes» y «Resueltos»
    (`cierres-admin-descarga-columnas.ts`), bodega «Pendientes», «Resueltos» y «Solicitados»
    (`CierresBodegaAdminModule.tsx`, `CierresBodegaResueltosLista.tsx`,
    `CierresBodegaSolicitadosLista.tsx`).
  - Detalle, una fila por gestión: la hoja fundida (`cierres-gestiones-fundida-descarga-columnas.ts`,
    `DescargarGestionesDialog.tsx`), común a mensajeros y bodega.
  - La descarga de un solo cierre dentro de su detalle (`detalle-cierre-descarga-columnas.ts`).
- **Cifras por gestión del modelo nuevo:** existen en el detalle de un cierre
  (`IngresoEmpresaDTO.conceptosTarifa`, `ivaIncluido`, `fulfillmentConIva`, `fulfillmentCargadoAt`,
  `pagoPorTarifa`, `ajustesPago`, `tarifaModelo`; SLT-101 y SLT-110), pero **no** en el DTO de la
  hoja fundida (`CierreGestionDescargaDTO`), que no lleva ni `tarifaModelo`.
- **Cifras por cierre del documento nuevo** («Se le paga a la tienda», «Gana la tienda en total»,
  «Total facturado», «IVA facturado», «Le queda a la empresa», «Pagos ajustados», partes por tienda):
  el servidor las deriva **solo en el detalle de un cierre** (`CierresAdminService`,
  `CierresBodegaAdminService`). La fila de los listados (`CierreAdminResumen`) solo trae `totales`,
  `totalPagoMensajero`, `totalIngresoBodegaRechazos`, `incluyeModeloNuevo` y el pendiente de pago.
  Para N cierres hace falta una derivación en lote nueva, con su prueba contra Postgres.
- *Corrección v2 (2026-11-12), al leer el mapper:* la frase «no lleva ni `tarifaModelo`» es
  inexacta. `CierreGestionDescargaDTO.ingresoEmpresa` sale del mismo `toIngresoEmpresa` que el
  detalle y ya trae `tarifaModelo`, `conceptosTarifa`, `ivaIncluido` y `fulfillmentConIva`. Lo que
  de verdad falta en la hoja fundida es `pagoPorTarifa`, `ajustesPago`, `tarifaFaltante`, la fecha
  del cargo de fulfillment (sale `null`), el folio y el modelo del cierre, y los rechazos de la
  tienda. Detalle en `design.md > Lo que ya existe`.

### Tamaño medido de la feature entera

| Parte | Producción | Tests |
|---|---|---|
| Hojas por gestión (Gestiones, Rechazados por la tienda) + contrato de N hojas | ~10 | ~14 |
| Hojas por cierre de mensajeros (Cierres, Por tienda) + derivación en lote | ~8 | ~12 |
| Hojas por cierre de bodega (columnas de bodega, conciliación, pago a la satélite) | ~7 | ~10 |
| **Total** | **~25** | **~36** |

~61 archivos y bastante más de 1 000 líneas (SLT-110, solo con dos cifras del detalle de bodega, dio
1 137). Pasa del tope, no solo del 80 %.

*(v2: medido ya con el diseño, S15a son 31 archivos —19 de producción y 12 de tests— y ~1 900 líneas;
ver `tasks.md > Tamaño` y PA7.)*

## Preguntas abiertas

- **PA5: texto de las celdas «Tarifa de …».** El madre da un ejemplo, «Monto fijo ₡3.500,00 · grupo ·
  San José centro», que no es la frase con que la pantalla nombra el origen de la tarifa en «Ver cómo
  se calculó» («Tarifa: grupo «San José centro» de la zona Centro»). Recomendación: la frase de la
  pantalla, `<Monto fijo ₡valor | % de ₡base> · <origen como en la pantalla>`, para que archivo y
  pantalla digan lo mismo. Es lo que `design.md > Hojas` deja escrito; si prefieres el ejemplo literal
  del madre, cambia una función y sus literales de test.
- **PA6: las hojas nuevas no siguen el selector de columnas.** El selector del nivel «Detalle» lista
  las 31 columnas del formato actual; R373 hace que «Gestiones» y «Rechazados por la tienda» salgan
  siempre completas (el documento aprobado fija sus columnas) y que lo marcado solo valga para
  «Gestiones modelo anterior». Recomendación: así en este corte; si quieres elegir columnas también en
  las hojas nuevas, ficha aparte (es otro catálogo y otro ámbito de preferencias).
- **PA7: tamaño en líneas.** 31 archivos (por debajo de 32) pero ~1 900 líneas, por encima de las
  1 000 del gate. Ya no se puede partir por comportamiento sin dejar «Detalle» a medias.
  Recomendación: aceptarlo con la línea `tamano-pr-aceptado` en `progress/features/SLT-113.md`, como
  SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» y SLT-123 «Pago al
  mensajero independiente del efectivo».

### Resueltas el 2026-11-12 (Carlos, «si a todo»)

Texto de la v1, se conserva tal cual; la respuesta está en `## Decisiones cerradas` (S15-PA1 a
S15-PA4).

- **PA1 (bloqueante): corte en rebanadas.** Propuesta, en rebanadas verticales que se mergean solas
  (cada una deja el formato actual intacto para el modelo viejo, que es todo prod según D19):
  - **S15a — SLT-113 se queda con «Excel del modelo nuevo: hojas por gestión».** El nivel «Detalle ·
    una fila por gestión» de `/cierres-admin` (mensajeros y bodega): el servidor añade a la hoja
    fundida el modelo de cada gestión y sus cifras del modelo nuevo (las mismas que el detalle);
    solo viejo = hoja fundida actual idéntica; solo nuevo = «Gestiones» + «Rechazados por la
    tienda»; mixto = esas dos + «Gestiones modelo anterior», sin gestiones repetidas. Amplía
    `DescargarDatasetButton` a N hojas. R370-R376. ~24 archivos (10 producción / 14 tests).
  - **S15b — ficha nueva «Excel del modelo nuevo: hojas por cierre de mensajeros».** El nivel
    «Resumen» de «Pendientes» y «Resueltos» de mensajeros: derivación en lote de las cifras por
    cierre con las mismas funciones del detalle; «Cierres» + «Por tienda»; mixto con «Cierres
    modelo anterior». R377-R383. ~20 archivos (8 / 12). Depende de S15a.
  - **S15c — ficha nueva «Excel del modelo nuevo: hojas por cierre de bodega».** El nivel «Resumen»
    de «Pendientes», «Resueltos» y «Solicitados» de bodega: columnas de bodega, conciliación y pago
    a la satélite; la satélite sin fulfillment ni «Pago entregado» (F481). R384-R389. ~17
    archivos (7 / 10). Depende de S15b.

  Recomendación: los tres cortes. Juntar S15b y S15c daría ~37 archivos, por encima del 80 %.
- **PA2 (bloqueante): cómo encaja el documento de cuatro hojas en el selector de hoy.** Hoy se
  elige «Resumen · una fila por cierre» o «Detalle · una fila por gestión» y cada uno baja un
  archivo de una hoja. El documento aprobado lista cuatro hojas sin decir si van en un solo archivo.
  Recomendación: conservar los dos niveles; «Resumen» baja las hojas por cierre (Cierres, Por
  tienda) y «Detalle» las hojas por gestión (Gestiones, Rechazados por la tienda). Es lo que prevé
  el plan del madre (columnas nuevas en la hoja fundida y en la hoja de cierres) y no cambia la
  pantalla. La alternativa, un único libro de cuatro hojas desde cualquier nivel, obliga a leer
  todas las gestiones también al bajar el resumen.
- **PA3: la descarga de un solo cierre dentro de su detalle** (`detalle-cierre-descarga-columnas.ts`).
  El documento aprobado no la nombra; solo dice que la de `/cierre-dia` no cambia. Recomendación:
  dejarla con su formato actual en este corte y, si la quieres con el documento nuevo, abrir una
  ficha aparte después de S15c.
- **PA4: «Pago entregado (solo central)».** No está definido en el madre si es lo pagado al
  mensajero (pagos vigentes registrados) o lo que falta (`pendientePagoMensajero`). Recomendación:
  lo pagado, `P − pendiente`, que el servidor ya puede derivar con las lecturas de SLT-137 y
  SLT-123; se cierra en el spec de S15b.
