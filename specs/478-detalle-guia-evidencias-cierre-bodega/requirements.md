# 478 — Detalle por guía y evidencias en el cierre de bodega · requirements

> Ficha 478 de `feature_list.json` (zona `fullstack`, `sdd: true`). Pedida por el humano el
> 2026-10-15 con captura. Spec escrito sobre `dev` @ `502dc2de`.

## Contexto (lo que se pidió)

En el detalle de un cierre de **mensajero** (`/cierres-admin`, comprobante `CierreFacturaDetalle`)
cada guía de las pestañas Entregado / Reprogramado / Novedad / Devolución a origen por rechazo /
Incidente se despliega y enseña: dirección, ubicación (zona), tienda, «Recibido» con su método,
Flete + IVA, Comisión + IVA, Pago al mensajero, «Ver evidencia», «Desglose de ingreso» y
«Cobros de esta gestión». En el detalle de un cierre de **bodega** de una satélite (solo
maestro/admin, `esAccesoTotal`), que se lee mensajero por mensajero, eso no se ve de la misma
forma y la evidencia de las entregas no se ve en absoluto.

Objetivo: que maestro y admin vean en el cierre de bodega, por cada gestión de cada mensajero,
la misma información y la misma evidencia que en un cierre de mensajero. **Solo lectura.**

## Medición previa (resumen; el detalle con archivo:línea está en `design.md §1`)

**Falta PANTALLA, no dato.** El detalle de bodega lee las gestiones con la MISMA proyección y el
MISMO mapper que el detalle del cierre de mensajero, firma las evidencias de TODAS las gestiones y
entrega al navegador el mismo DTO (`CierreDetalleGestion`, con `evidenciaUrl` e `ingresoOrdenex`).
Lo que difiere es el componente que lo pinta: la bodega monta las tablas viejas por resultado
(`DetalleSecciones`), que solo tienen columna de evidencia en Devolución por rechazo e Incidente;
el mensajero monta las pestañas con fila desplegable (`FilaGestion`), que ofrece la evidencia en
cualquier resultado.

## Glosario

- **Detalle de bodega**: el modal «Detalle del cierre de bodega» de `/cierres-admin`, pestaña de
  cierres de bodega satélite, que abre `verCierreBodegaDetalle`.
- **Bloque de un mensajero**: la sección de ese modal que corresponde a un cierre del día incluido
  en el cierre de bodega (`cierres[i]`).
- **Detalle de mensajero**: el comprobante detallado de un cierre del día (`CierreFacturaDetalle`)
  que abren maestro/admin y la `adminSatelite` en `/cierres-admin`.
- **Fila de gestión**: la fila compacta y desplegable que el detalle de mensajero pinta por cada
  gestión.

## Requisitos

### Gestiones en pestañas, por mensajero

- **R1.** CUANDO maestro o admin abre el detalle de bodega, el sistema DEBE mostrar, dentro del
  bloque de cada mensajero, sus gestiones agrupadas en las cinco pestañas por resultado
  (Entregado, Reprogramado, Novedad, Devolución a origen por rechazo, Incidente), cada pestaña con
  el número de gestiones de ese resultado en ese cierre del día.
- **R2.** CUANDO se abre el bloque de un mensajero, el sistema DEBE dejar seleccionada la primera
  pestaña, en el orden de R1, que tenga al menos una gestión.
- **R3.** CUANDO se selecciona una pestaña sin gestiones, el sistema DEBE mostrar el texto de
  sección vacía de ese resultado, el mismo que muestra el detalle de mensajero.
- **R4.** CUANDO se cambia de pestaña en el bloque de un mensajero, el sistema DEBE mantener sin
  cambios la pestaña seleccionada en los bloques de los demás mensajeros.
- **R5.** El sistema DEBE pintar cada gestión del detalle de bodega como la fila de gestión del
  detalle de mensajero en su vista de admin: guía, destinatario, remisión y producto, monto a
  cobrar e ingreso total de Ordenex.

### Lo que enseña la fila desplegada

- **R6.** CUANDO se despliega la fila de una gestión en el detalle de bodega, el sistema DEBE
  mostrar, para cada dato que la gestión tenga: dirección; ubicación (zona · provincia · cantón ·
  distrito); «Recibido» con el desglose por método de pago; tienda; Flete + IVA con su marca de
  origen; Comisión + IVA; Flete por devolución + IVA con su marca de origen; Pago al mensajero
  (con la marca «Sin tarifa» cuando aplique); nueva fecha; y motivo.
- **R7.** SI la gestión desplegada es una devolución a origen por rechazo, ENTONCES el sistema DEBE
  mostrar además su ingreso de bodega por devolución y la marca de origen del rechazo (automático o
  manual).
- **R8.** SI la gestión desplegada tiene desglose de ingreso de Ordenex, ENTONCES el sistema DEBE
  mostrar los bloques «Desglose de ingreso» y «Cobros de esta gestión».
- **R9.** Para una misma gestión, el sistema DEBE mostrar en la fila desplegada del detalle de
  bodega los mismos rótulos y los mismos importes, con el mismo formato, que en la fila desplegada
  del detalle de mensajero.

### Evidencia

- **R10.** SI una gestión del detalle de bodega tiene evidencia, ENTONCES el sistema DEBE ofrecer
  el botón «Ver evidencia» en su fila desplegada, cualquiera que sea su resultado.
- **R11.** SI una gestión del detalle de bodega no tiene evidencia, ENTONCES el sistema NO DEBE
  ofrecer el botón «Ver evidencia» en su fila.
- **R12.** CUANDO se pulsa «Ver evidencia» en una fila del detalle de bodega, el sistema DEBE abrir
  el visor de evidencia con la URL firmada de ESA gestión.
- **R13.** CUANDO el servidor devuelve el detalle de bodega, el sistema DEBE entregar la evidencia
  de las gestiones de los cinco resultados únicamente como URL firmada, sin la ruta de
  almacenamiento.

### Solo lectura y permisos

- **R14.** El sistema NO DEBE ofrecer en el detalle de bodega los botones «Corregir métodos de
  pago» ni «Corregir el resultado» (decisión P1, valor por defecto).
- **R15.** El sistema NO DEBE ofrecer en el bloque de ningún mensajero del detalle de bodega una
  acción de aprobar o rechazar ese cierre del día.
- **R16.** SI el actor que pide el detalle de bodega no tiene acceso total, ENTONCES el sistema DEBE
  responder `forbidden` sin leer el cierre de bodega ni firmar ninguna evidencia.

### Accesibilidad

- **R17.** El sistema DEBE dar a la región de gestiones de cada bloque de mensajero un nombre
  accesible que incluya el nombre de ese mensajero y que sea distinto del de los demás bloques.

### No regresión del detalle de mensajero

- **R18.** MIENTRAS se abre el detalle de mensajero (de maestro/admin o de la `adminSatelite`), el
  sistema DEBE seguir mostrando las mismas pestañas, filas, botones de corrección y nombres
  accesibles que antes de esta ficha, con la única salvedad de lo que añada R19.

### Datos que hoy pinta la tabla de bodega y la fila desplegable no (decisión P2)

- **R19.** DONDE la decisión P2 se mantenga en su valor por defecto, SI la gestión desplegada es un
  incidente, ENTONCES el sistema DEBE mostrar su causa tipificada y su indemnización, o el marcador
  de indemnización pendiente mientras no exista monto; y SI la gestión tiene fulfillment en su
  tarifa congelada, ENTONCES el sistema DEBE mostrarlo. Esto vale en el detalle de bodega y en el
  detalle de mensajero, porque la fila es la misma.

## Trazabilidad prevista (test por requisito)

| R | Test previsto | Tipo |
| --- | --- | --- |
| R1 | `tests/components/CierreBodegaDetalleGestiones.test.tsx` — «pinta las cinco pestañas con su conteo dentro del bloque de cada mensajero» | componente |
| R2 | idem — «abre en la primera pestaña con gestiones» | componente |
| R3 | idem — «una pestaña vacía muestra el texto de sección vacía del resultado» | componente |
| R4 | idem — «cambiar de pestaña en un mensajero no cambia la del otro» | componente |
| R5 | idem — «la fila compacta enseña guía, destinatario, remisión·producto, cobrado e ingreso total» | componente |
| R6 | idem — «al desplegar una entregada enseña dirección, ubicación, recibido con método, tienda, flete+IVA, comisión+IVA y pago al mensajero» | componente |
| R7 | idem — «al desplegar una devolución por rechazo enseña ingreso de bodega y la marca automático/manual» | componente |
| R8 | idem — «al desplegar una gestión con snapshot enseña Desglose de ingreso y Cobros de esta gestión» | componente |
| R9 | `tests/components/CierreBodegaDetalleGestiones.test.tsx` — «la misma gestión, desplegada en el detalle de bodega y en el comprobante de mensajero, enseña el mismo texto» (comparado contra LITERALES del fixture, no contra la función que lo genera) | componente |
| R10 | idem — «ofrece Ver evidencia en una ENTREGADA con evidencia» (+ un caso por cada uno de los otros cuatro resultados) | componente |
| R11 | idem — «sin evidencia no hay botón Ver evidencia» | componente |
| R12 | idem — «Ver evidencia abre el visor con la URL firmada de esa gestión» | componente |
| R13 | `tests/unit/services/cierres-bodega-admin-service.test.ts` — caso nuevo «firma la evidencia de una ENTREGADA, una REPROGRAMADA y una NOVEDAD, no solo de rechazos» (el `R12` existente en `:444` cubre el lote; este fija los cinco resultados) | unitario |
| R14 | `tests/components/CierreBodegaDetalleGestiones.test.tsx` — «sin Corregir métodos de pago ni Corregir el resultado, aunque la gestión sea una entregada con pagos» | componente |
| R15 | idem — «ningún bloque de mensajero ofrece Aprobar ni Rechazar» | componente |
| R16 | `tests/unit/services/cierres-bodega-admin-service.test.ts:199` (existente, «R2: rol sin acceso total … forbidden … sin tocar el repo») — se re-ejecuta; si no cubre `createSignedUrls`, se añade la aserción de que el firmador no se llama | unitario |
| R17 | `tests/components/CierreBodegaDetalleGestiones.test.tsx` — «cada bloque tiene una región de gestiones con el nombre de su mensajero, y no se repite» | componente |
| R18 | `tests/components/CierresAdminModule.test.tsx`, `tests/components/CierreDiaModule.test.tsx`, `tests/components/CierreFacturaSinGestionar.test.tsx`, `tests/components/CierreRechazosDeTienda.test.tsx`, `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` — sin cambios y en verde | componente / guardia |
| R19 | `tests/components/CierreFacturaFilaIncidente.test.tsx` (nuevo) — «una fila de incidente desplegada enseña causa e indemnización (o el marcador pendiente)» y «enseña fulfillment cuando la tarifa congelada lo trae» | componente |

Además, recorrido «verlo en la app» con Playwright (`tasks.md` T6) — no sustituye a ningún test de
la tabla; cubre lo que la suite no ve (memoria «Ver la app encuentra lo que la suite no»).

## Fuera de alcance

- Cambiar quién puede aprobar o rechazar un cierre del día. Maestro y admin NO ganan permiso de
  aprobar/rechazar cierres de mensajero de satélite por esta ficha; no se toca
  `CierresAdminService`, su alcance ni ninguna acción de decisión.
- Montar en el detalle de bodega las secciones del comprobante que no son la lista de gestiones
  (tarjetas de cabecera, liquidación, «Pasaron a …», «Rechazados por la tienda»): el contrato de
  bodega no las trae y no se piden.
- Varias evidencias por gestión (existe la tabla `gestion_orden_evidencia`, migración
  `20260723130000`): ninguno de los dos detalles la lee hoy; paridad = una evidencia, la de
  `evidencia_storage_path`.
- Cambios de modelo de datos o migraciones.

## Preguntas abiertas / decisiones (con valor por defecto)

- **P1 — Corrección desde el cierre de bodega.** ¿Se ofrecen «Corregir métodos de pago» y
  «Corregir el resultado» en el detalle de bodega? **Por defecto: NO (solo lectura)**, que es lo
  que fija R14. Un cierre del día consolidado ya salió de la satélite; corregirlo desde aquí tocaría
  totales de un cierre de bodega ya declarado y no está especificado en ningún sitio qué pasa con
  ellos.
- **P2 — Lo que la tabla actual de bodega enseña y la fila desplegable no.** La tabla que hoy pinta
  la bodega (`DetalleSecciones`) tiene columnas que `FilaGestion` no tiene: causa del incidente,
  indemnización y fulfillment. Sustituir la tabla por la fila las perdería en la bodega. **Por
  defecto: añadirlas a la fila desplegable como datos que solo aparecen cuando tienen valor (R19)**,
  lo que también las hace visibles en el detalle de mensajero (hoy no las muestra). Alternativa:
  aceptar la pérdida por paridad estricta con el detalle de mensajero.
- **P3 — Descarga por sección dentro del modal de bodega.** La tabla actual trae un botón
  «Descargar <resultado> · <mensajero>» por sección (feature 170, T E.5). Las pestañas del
  comprobante no lo tienen. **Por defecto: se retiran del modal**; la pantalla conserva su botón
  global «Descargar» con nivel detallado (`listarGestionesCierresBodegaCompleto`), que cubre las
  mismas gestiones pero filtra por fechas/bodega, NO por un cierre de bodega concreto — no es
  equivalente exacto. Alternativa: conservar la descarga por mensajero (control propio por bloque).
- **P4 — `DetalleSecciones` sin montaje.** Tras el cambio, `DetalleSecciones` no tendría ningún
  montaje en `app/**` (hoy su único uso es `CierresBodegaAdminModule.tsx:824`). **Por defecto: NO
  se borra en esta ficha** (lo nombran `censo-tablas.ts:278`, `contadores-cabecera.guardia.test.ts:90`
  y tests de descarga; borrarlo arrastra tests que protegen otras features); se registra una ficha
  de limpieza aparte. Alternativa: borrarlo aquí con su censo.
- **Q1 — Datos para el recorrido.** No consta en `docs/`, `specs/` ni el código si la base local
  tiene un cierre de bodega con gestiones ENTREGADAS con evidencia. T0.2 lo mide; si no hay, el
  recorrido de T6 necesita crearlo por el flujo (mensajero de satélite cierra → `adminSatelite`
  consolida) y eso debe quedar anotado.
