# SLT-154 «Vista de la bodega satélite: solo lo suyo» — requirements

> Estado: **spec completo de la rebanada 1** (2026-11-14, spec_author), pendiente de aprobación.
> Carlos partió la ficha (opción A, 2026-11-14): esta ficha es **«la satélite ve sus detalles sin el
> dinero de la empresa»** (F1, F2, sus cifras propias, la vista de S4 y S6, la lista de gestiones y la
> descarga del modal). Las descargas de la lista (F3–F5, S8–S10) van a SLT-161 «Descargas de la
> satélite sin el dinero de la empresa»: ver `## Fuera de esta ficha`.
> Ruta completa, zona fullstack. Diseño aprobado (canvas
> https://claude.ai/artifact/38TStFo8VMupWd4uSwBdmQ); reuso fijado en `reuso.md`. Fuente: lectura del
> worktree (desde `origin/dev`, ya con SLT-153 «Cabecera del detalle del cierre con rótulos y folio
> buscable»). El índice del grafo no tiene este worktree: todo se leyó con Grep/Read.
>
> El inventario y la matriz de abajo cubren las 12 superficies (las dos rebanadas); son contexto.
> Lo que esta ficha exige está en `## Requisitos (EARS)`.

## Alcance

Lo que pidió Carlos tras probar en Preview: la bodega satélite (`adminSatelite`) es una sucursal.
Solo necesita ver **(a)** lo que le debe pagar a su mensajero, **(b)** lo que ganó ella y **(c)** lo
que debe conciliar con la central. No ve lo que se le factura a la tienda, lo que se le paga a la
tienda, el IVA de lo facturado ni lo que le queda a la empresa. Es el mismo componente que usa la
central, con otra información. El modal de sus cierres muestra las KPI de su pestaña de trabajo.

Clasificación usada en este documento:
- **SAT** (de la satélite): recaudado por sus mensajeros y sus métodos, pago al mensajero (con su
  tarifa y su ajuste), «Gana la bodega satélite» (`totalIngresoBodegaRechazos`), «Debe llegar a la
  central» (`paraLaCentral`), «La central debe», recibido, falta por recibir y estado de conciliación.
- **EMP** (de la central/empresa): cobro a la tienda (flete, comisión COD, flete por no entregadas,
  tarifas, `ingresoEmpresa.total`), «Se le paga hoy a la tienda» (`pagoTienda`), «Gana la tienda en
  total» (`ganaLaTienda`), «Sale de lo recaudado» (`cobradoSobreRecaudado`), IVA facturado, «Le queda
  a la empresa» (`netoEmpresa`, `ganancia`), reparto «Por tienda» (`partesPorTienda`), fulfillment y
  «Pago entregado».

Fuera de alcance (no inventariado): `/ordenes`, `/analitica`, `/monitoreo` y `/recepcion-satelite`,
que también abren al `adminSatelite`. Ver P6.

### Cómo distingue hoy el código a la satélite

- Página: `app/(app)/cierres-admin/page.tsx:43` deja pasar `adminSatelite`; `:87` solo para ella
  monta la consolidación; `:208` y `:251` pasan `audiencia={esAccesoTotal ? "admin" : "satelite"}`.
- Detalle único: `Audiencia = "central" | "satelite" | "mensajero"`
  (`components/private/cierres/detalle/detalle-cierre-vista.ts:58`). **`cifrasDe` y `lineasDinero`
  no distinguen central de satélite**: solo la audiencia `mensajero` pierde el dinero de la empresa
  (`:262`, `:710`).
- Fila de gestión: `AudienciaFila = "central" | "satelite" | "mensajero" | "solo lectura"`
  (`components/private/cierres/fila/fila-gestion-vista.ts:51`). La satélite solo pierde el
  fulfillment (`veFulfillment`, `:327`).
- Servidor: `ocultarFulfillmentSiNoCentral` (`lib/services/CierresAdminService.ts:142`) anula
  **solo** el fulfillment para quien no es acceso total. `verCierreBodegaDetalle` solo pone
  `desmarcable:false` (`lib/services/CierresBodegaAdminService.ts:522`).
- Excel: `AudienciaDescargaGestionesFundida = "admin" | "satelite"`
  (`app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts:305`). Para
  la satélite se quitan solo fulfillment (`:313`) y «Pago entregado»
  (`cierres-bodega-modelo-nuevo-descarga-columnas.ts:70`).
- Precedentes ya cerrados: SLT-101 «Fila de gestión única y lista con filtros» y SLT-107 «Bodega
  satélite: Solicitados y su cierre de bodega en lectura» dejaron a la satélite sin fulfillment ni
  «Pago entregado» (F481, R51, R283, R386). Esta ficha extiende ese criterio a todo el dinero EMP.

## Inventario

Superficies que ve la satélite. Notación: `S<n>`. «Viaja» = el dato llega al navegador.

### S1 — Pestaña Bodega · «A consolidar» (tabla + KPI + pie)
`ConsolidacionBodegaModule.tsx:478-559`, cola `ColaCierres tipo="bodega" rol="satelite"`.
- Columnas (`components/private/cierres/cola/cola-cierres-vista.ts:283-293`): Folio, Mensajero,
  Aprobado, Recaudado, Pago, Gana bodega, A la central, Señales. Fila: `CierreConsolidableCola`
  (`lib/interfaces/services/ICierreBodegaService.ts:123`). **Todo SAT. Sin dato EMP en el DTO.**
- KPI (`cola-cierres-vista.ts:337-358`, `tarjetasAConsolidar`), sobre el conjunto completo,
  calculadas en `CierreBodegaService.listarConsolidacion` (`lib/services/CierreBodegaService.ts:261`):
  1. «Recaudado» con métodos ← `totalesAgregados.general` (SAT)
  2. «Pago a mensajeros» · «n mensajeros» ← `totalPagoMensajeroAgregado` (SAT)
  3. «Gana la bodega satélite» ← `totalIngresoBodegaRechazosAgregado` (SAT)
  4. «Debe llegar a la central» (destacada) · «recaudado − mensajeros − bodega» ←
     `paraLaCentralAgregado` (SAT)
  5. «La central debe» (aviso, solo si ≠ 0) ← `totalCentralDebeAgregado` (SAT)
- `totalNetoAgregado` sigue en el contrato pero se queda en el servidor (`page.tsx:168`): no viaja.

### S2 — Modal «Solicitar cierre de bodega»
`ConsolidacionBodegaModule.tsx:581-607`: Recaudado, Pago a mensajeros, Gana la bodega, Debe llegar.
**Todo SAT.**

### S3 — Pestaña Bodega · «Solicitados» (tabla + KPI)
- Columnas (`cola-cierres-vista.ts:367-377`): Folio, Solicitado, Cierres, Recaudado, Debe llegar,
  Recibido, Falta, Estado. DTO `CierreBodegaResumen` (`ICierreBodegaService.ts:27`). **Todo SAT.**
- KPI (`cola-cierres-vista.ts:384-407`) ← `ResumenSolicitados` (`ICierreBodegaService.ts:279`):
  «Por llegar a la central», «Recibido por la central (30 días)», «Falta por recibir». **SAT.**

### S4 — Modal del cierre de bodega («Ver» en Solicitados)
Montaje: `ConsolidacionBodegaModule.tsx:564-576` → `DetalleCierreBodegaAbierto.tsx:61-106`
(`audiencia="satelite"`). Datos: Server Action `verCierreBodegaDetalle`
(`CierresBodegaAdminService.ts:389-540`) → `vistaBodegaDesdeAdmin` (`detalle-cierre-vista.ts:944-977`).
- Cabecera (`cifrasBodega`, `detalle-cierre-vista.ts:298-317`): Recaudado (SAT), Debe llegar a la
  central (SAT), Pago a mensajeros (SAT), **«Le queda a la empresa» ← `netoEmpresa` (EMP, `:313`)**.
- Pestaña «Dinero» (`lineasDinero` bodega, `:683-706`; `DineroCierre.tsx`):
  - Barra «¿A dónde va lo recaudado?»: central / mensajeros / gana bodega (SAT).
  - Cuenta «Lo que va a la central» (`cuentaCentral`, `:654`) (SAT).
  - **Cuenta «Lo que se le factura a la tienda»** (`cuentaFactura`, `:601`): flete, comisión COD,
    «Sale de lo recaudado», flete no entregadas, total facturado (EMP).
  - **Cuenta «De lo facturado, le queda a la empresa»** (`cuentaQueda`, `:614`): total facturado,
    IVA, pago, bodega, neto (EMP).
  - **Tabla «Por tienda»** (`DineroCierre.tsx:64-96`): recaudado, se le paga hoy, gana en total por
    tienda (EMP).
- Pestaña «Gestiones» (`GestionesCierre` con `audiencia="solo lectura"`, `quienMiraEsCentral=false`):
  - Columnas (`fila-gestion-vista.ts:195-203`): Guía, Destinatario, Tienda, Mensajero, Resultado,
    Recibido, **«Cobro a la tienda»** ← `ingresoEmpresa.total` (`:209`, EMP), Pago, Señales.
  - Fila desplegada (`tarjetasDe`, `:351-366`): Recibió (SAT), **«Se le cobra a la tienda»**
    (`tarjetaCobro`, `:283`, EMP), Pago al mensajero con tarifa y ajuste (SAT). Fulfillment ya oculto.
  - **«Ver cómo se calculó»** (`CalculoCobro.tsx`, `calculoDe` `:494`): tarifas, base e IVA del cobro
    a la tienda (EMP).
- Pestaña «Mensajeros» (`MensajerosCierreBodega`; `filasMensajeros` `:1023`): mensajero, gestiones,
  recaudado, pago, a la central. **SAT.**
- Pestaña «Conciliación» (`cuentaConciliacion`, `:1045`): debe llegar, recibido, falta, quién marcó.
  **SAT.**
- Descarga de gestiones del modal: `COLUMNAS_DESCARGA_DETALLE_BODEGA`
  (`detalle-cierre-descarga-columnas.ts:41`) con **«Cobro a la tienda»** (EMP).

### S5 — Pestaña Mensajero · cola Pendientes / Resueltos
`CierresAdminModule.tsx` (`rolCola="satelite"`, `:1259`). Columnas (`cola-cierres-vista.ts:103-116`):
Folio, Mensajero, Solicitado/Resuelto, Estado, Recaudado, Pago al mensajero, Señales («Pago
entregado» ya es solo central). DTO `CierreAdminResumen` (`ICierresAdminService.ts:80`). **Todo SAT.**

### S6 — Modal del cierre del mensajero (`?cierre=`, también «Ver su cierre» desde S1/S4)
`CierresAdminModule.tsx:1405-1444`, `audiencia="satelite"`, fila `audienciaFila="satelite"`. Datos:
`verCierreDetalle` (`CierresAdminService.ts:934-1060`) → `vistaMensajeroDesdeAdmin`
(`detalle-cierre-vista.ts:745-793`, objeto `empresa` completo, `:764-776`).
- Cabecera (`cifrasDe`, `:277-295`): Recaudado (SAT), **«Se le paga hoy a la tienda» ← `pagoTienda`
  con contexto «n tiendas · gana …» (EMP)**, Pago al mensajero (SAT), **«Le queda a la empresa» ←
  `netoEmpresa` (EMP)**.
- Pestaña «Dinero» (`lineasDinero` mensajero, `:708-732`): **barra «Se le paga hoy a la tienda / Sale
  de lo recaudado» (EMP)**, **cuenta «Lo que se le factura a la tienda» (EMP)**, **cuenta «De lo
  facturado, le queda a la empresa» (EMP)**, **«Por tienda» (EMP)**. No hay ninguna cuenta SAT
  (falta «Gana la bodega» y «A la central» del cierre).
- Pestaña «Gestiones»: igual que en S4 (columna «Cobro a la tienda», tarjeta «Se le cobra a la
  tienda», «Ver cómo se calculó»: EMP). Más «Sin gestión» (sin dinero).
- Pestaña «Rechazos de tienda» (`RechazosDeTiendaCierre.tsx`): sin importes. **SAT.**
- Descarga de gestiones del modal: `COLUMNAS_DESCARGA_DETALLE_CIERRE`
  (`detalle-cierre-descarga-columnas.ts:25-33`) con **«Cobro a la tienda»** (EMP).

### S7 — Excel «Cierres del día a consolidar»
`cierres-bodega-descarga-columnas.ts:195-216`: mensajero, efectivo, SINPE, transferencia, total,
pago al mensajero, ingreso de bodega. **Todo SAT.**

### S8 — Excel «Cierres de bodega solicitados»
- Modelo anterior (`cierres-bodega-descarga-columnas.ts:219-252`): **todo SAT.**
- Libro del modelo nuevo (`obtenerResumenCierresBodega(..., "satelite")`,
  `ConsolidacionBodegaModule.tsx:273-279`; `cierres-bodega-modelo-nuevo-descarga.ts:57-100`):
  - Hoja «Cierres» (`cierres-bodega-modelo-nuevo-descarga-columnas.ts:38-63`, `:102-142`): **«Gana la
    tienda en total», «Total facturado», «IVA facturado», «Le queda a la empresa» (EMP)**; el resto SAT.
  - **Hoja «Por tienda»** (`cierres-resumen-modelo-nuevo-descarga-columnas.ts:116-121`): recaudado,
    se le paga hoy, gana en total por tienda (EMP).

### S9 — Excel «Resumen» de cierres de mensajeros (botón «Descargar» de S5)
- Modelo anterior (`cierres-admin-descarga-columnas.ts:54-90`): **todo SAT.**
- Libro del modelo nuevo, hoja «Cierres» (`cierres-resumen-modelo-nuevo-descarga-columnas.ts:36-62`):
  **«Se le paga a la tienda», «Gana la tienda en total», «Total facturado», «IVA facturado», «Le queda
  a la empresa» (EMP)**; hoja **«Por tienda»** (EMP).

### S10 — Excel «Detalle» de gestiones (diálogo de `DescargarCierresButton`)
- Hoja fundida (`cierres-gestiones-fundida-descarga-columnas.ts:268-297`, filtro `:320-327`):
  **«Flete con IVA», «Comisión con IVA», «Flete devolución con IVA», «Ingreso total» (EMP)**;
  «Monto a cobrar» (COD, ver P2); el resto SAT.
- Hoja «Gestiones» del modelo nuevo (`cierres-gestiones-modelo-nuevo-descarga-columnas.ts:54-95`):
  **flete, tarifa del flete, IVA del flete, comisión COD, su tarifa y su IVA, flete no entregadas, su
  tarifa y su IVA, «Se le cobra a la tienda», «De eso, IVA» (EMP)**; pago por tarifa, tarifa del pago,
  ajuste, pago al mensajero, motivo, «Gana la bodega satélite» (SAT). «Rechazados por la tienda»:
  sin importes (SAT).

### S11 — «Mi bodega» (`app/(app)/mi-bodega/page.tsx`)
Solo el SINPE de su bodega y la vista previa del mensaje. **Sin dinero.** Sin cambios.

### S12 — `/wallet/*`
`/wallet/satelites` y `/wallet/satelites/[zonaId]` hacen `notFound()` a quien no es acceso total
(`wallet/satelites/page.tsx:42`, `[zonaId]/page.tsx:20`); `/wallet/mensajeros` es de la caja central.
**La satélite no tiene estado de cuenta propio:** su conciliación la ve en S3/S4. Sin cambios.

### Fugas en el payload (el dato EMP llega al navegador de la satélite)

| # | Lectura (Server Action) | Qué viaja de EMP | ¿Se pinta hoy? |
|---|---|---|---|
| F1 | `verCierreBodegaDetalle` (`CierresBodegaAdminService.ts:435-534`) | agregado: `totalesIngreso`, `ivaFacturado`, `ganancia`, `pagoTienda`, `cobradoSobreRecaudado`, `netoEmpresa`, `ganaLaTienda`, `partesPorTienda`; **por cada cierre del día** los mismos ocho; por gestión `ingresoEmpresa` (sin fulfillment) | sí, salvo `ganancia` y los ocho por cierre del día (viajan sin pintarse) |
| F2 | `verCierreDetalle` (`CierresAdminService.ts:997-1045`) | `totalesIngreso`, `ivaFacturado`, `ganancia`, `pagoTienda`, `cobradoSobreRecaudado`, `netoEmpresa`, `ganaLaTienda`, `fleteRechazoYaCobradoATienda`, `partesPorTienda`; por gestión `ingresoEmpresa` | sí, salvo `ganancia` y `fleteRechazoYaCobradoATienda` |
| F3 | `listarCierresBodegaSolicitadosCompleto` → `cifrasModeloNuevo` (`ICierreBodegaService.ts:332-347`) | `totalFacturado`, `ivaFacturado`, `netoEmpresa`, `ganaLaTienda`, `partesPorTienda` | sí (Excel S8) |
| F4 | `listar…CierresAdmin…Completo` → `cifrasModeloNuevo` (`ICierresAdminService.ts:225-240`) | `pagoTienda`, `ganaLaTienda`, `totalFacturado`, `ivaFacturado`, `netoEmpresa`, `partesPorTienda` (solo `pagoEntregado` va en `null`) | sí (Excel S9) |
| F5 | `listarGestionesCierresAdminCompleto` | por gestión `ingresoEmpresa` (flete, comisión, devolución, IVA, tarifas, total) | sí (Excel S10) |

Sin fuga: los DTO de las colas (`CierreConsolidableCola`, `CierreBodegaResumen`,
`CierreAdminResumen`) y los agregados de `listarConsolidacion` que bajan por props.

## Matriz

Leyenda «Hoy»: sí = la satélite lo ve. Propuesta: **ver** / **ocultar** / **sustituir por X**.
«Servidor» = no se envía (recomendado en todo dato EMP).

| Superficie | Dato | Hoy | Propuesta | Dónde se corta |
|---|---|---|---|---|
| S1 tabla y KPI | Recaudado, Pago, Gana bodega, A la central, La central debe | sí | **ver** (sin cambio) | — |
| S2 modal solicitar | Recaudado, Pago, Gana bodega, Debe llegar | sí | **ver** (sin cambio) | — |
| S3 tabla y KPI | Recaudado, Debe llegar, Recibido, Falta, Estado; Por llegar, Recibido 30 d, Falta | sí | **ver** (sin cambio) | — |
| S4 cabecera | Recaudado, Debe llegar, Pago a mensajeros | sí | **ver** | — |
| S4 cabecera | Le queda a la empresa | sí | **sustituir** por «Gana la bodega satélite» (+ «La central debe» si ≠ 0): las KPI de S1 | servidor + vista |
| S4 Dinero | Barra de reparto, «Lo que va a la central» | sí | **ver** | — |
| S4 Dinero | «Lo que se le factura a la tienda» | sí | **ocultar** | servidor + vista |
| S4 Dinero | «De lo facturado, le queda a la empresa» | sí | **ocultar** | servidor + vista |
| S4 Dinero | «Por tienda» | sí | **ocultar** | servidor + vista |
| S4 / S6 Gestiones | Columna «Cobro a la tienda» | sí | **ocultar** (o sustituir por «Gana bodega» de la gestión, P4) | servidor + vista |
| S4 / S6 Gestiones | Tarjeta «Se le cobra a la tienda» | sí | **ocultar** | servidor + vista |
| S4 / S6 Gestiones | «Ver cómo se calculó» (tarifas e IVA de la tienda) | sí | **ocultar** el botón | servidor + vista |
| S4 / S6 Gestiones | Recibido, Pago al mensajero (tarifa y ajuste), Tienda, Señales | sí | **ver** | — |
| S4 | Mensajeros, Conciliación | sí | **ver** | — |
| S4 / S6 descarga | Columna «Cobro a la tienda» | sí | **ocultar** | vista + servidor (ya no llega) |
| S5 cola | Recaudado, Pago al mensajero, Señales | sí | **ver** (sin cambio) | — |
| S6 cabecera | Recaudado, Pago al mensajero | sí | **ver** | — |
| S6 cabecera | Se le paga hoy a la tienda | sí | **sustituir** por «Gana la bodega satélite» del cierre | servidor + vista |
| S6 cabecera | Le queda a la empresa | sí | **sustituir** por «Debe llegar a la central» del cierre (dato nuevo derivado en el servidor con `paraLaCentral`) | servidor + vista |
| S6 Dinero | Barra «tienda / sale de lo recaudado», factura, le queda, Por tienda | sí | **sustituir** la pestaña por la de S4 recortada: barra central / mensajero / bodega y «Lo que va a la central» del cierre | servidor + vista |
| S7 Excel | todas | sí | **ver** (sin cambio) | — |
| S8 Excel anterior | todas | sí | **ver** (sin cambio) | — |
| S8 / S9 libro | Se le paga a la tienda, Gana la tienda, Total facturado, IVA facturado, Le queda a la empresa | sí | **ocultar** columnas | servidor (F3/F4) + columnas |
| S8 / S9 libro | Hoja «Por tienda» | sí | **ocultar** la hoja | servidor + libro |
| S9 Excel anterior | todas | sí | **ver** (sin cambio) | — |
| S10 Excel | Flete, comisión, devolución (con IVA), ingreso total; tarifas e IVA de la tienda; «Se le cobra a la tienda»; «De eso, IVA» | sí | **ocultar** columnas | servidor (F5) + columnas |
| S10 Excel | Monto a cobrar (COD) | sí | **ver** (P2) | — |
| S10 Excel | Pago por tarifa, tarifa del pago, ajuste, motivo, Gana la bodega | sí | **ver** | — |
| S11, S12 | — | — | sin cambios | — |

**Qué le queda a la satélite en cada sitio (si se aprueba la matriz):**
- S1, S2, S3, S5, S7: igual que hoy.
- S4: cabecera = las KPI de «A consolidar» (Recaudado, Pago a mensajeros, Gana la bodega, Debe llegar,
  La central debe si ≠ 0) + el estado de conciliación; Dinero = barra y «Lo que va a la central»;
  Gestiones sin cobro a la tienda; Mensajeros y Conciliación como hoy.
- S6: cabecera = Recaudado, Pago al mensajero, Gana la bodega, Debe llegar a la central; Dinero =
  barra y «Lo que va a la central» de ese cierre; Gestiones sin cobro a la tienda; Rechazos como hoy.
- S8–S10: los mismos archivos sin columnas ni hojas EMP.

**Recorte en el servidor (recomendado).** El criterio sería el de F481: «no es acceso total» y no
«es `adminSatelite`», así un rol nuevo no hereda el dato por accidente. Se anula o se quita el dato
EMP en F1–F5 y la vista deja de pintarlo. Un recorte solo de pantalla dejaría los cinco conjuntos de
la tabla de fugas a un clic de las herramientas del navegador.

Contadores del inventario: **12 superficies** (10 con dinero, 2 sin cambios: S11 y S12);
**9 datos EMP a ocultar** (cobro a la tienda por gestión, tarifas e IVA de la tienda, lo facturado a
la tienda, «Sale de lo recaudado», IVA facturado, «Se le paga hoy a la tienda», «Gana la tienda en
total», «Le queda a la empresa»/ganancia, «Por tienda»); **5 fugas en el payload** (F1–F5).

## Decisiones cerradas (no reabrir)

Las preguntas P1–P7 del borrador, las dos de `reuso.md` y el tamaño, ya respondidos
(`progress/features/SLT-154.md > Decisiones`). «Cubre» = los requisitos de ESTA ficha; lo que va a
SLT-161 «Descargas de la satélite sin el dinero de la empresa» se marca así.

| # | Decisión | Quién y cuándo | Cubre |
|---|---|---|---|
| P1 | Las tarjetas del detalle del cierre de bodega de la satélite (S4) son las de «A consolidar»: Recaudado, Pago a mensajeros, Gana la bodega satélite, Debe llegar a la central y, solo si ≠ 0, La central debe. | Carlos, 2026-11-13 | R468 |
| P2 | La satélite SÍ ve lo recaudado (COD) por su mensajero y el monto a cobrar por guía. | Carlos, 2026-11-13 | R461, R463, R468, R471 (lo recaudado); el monto a cobrar por guía solo se ve en el Excel S10 → SLT-161 (R482) |
| P3 | Se mantiene el nombre de la tienda por gestión; se quita «Por tienda» (pantalla y hoja del Excel). | Carlos, 2026-11-13 | R474 (Tienda), R469, R472 (sin «Por tienda»); la hoja del Excel → SLT-161 (R486) |
| P4 | En la lista de gestiones, «Cobro a la tienda» se sustituye por «Gana bodega» (lo que gana la bodega por esa gestión). | Carlos, 2026-11-13 | R474, R476 |
| P5 | La pestaña «Dinero» pasa a «Lo que va a la central»: barra de reparto [central, pago, bodega] y la cuenta «Lo que va a la central», en S4 y en S6. | por defecto, sin objeción, 2026-11-13 | R469, R470, R472, R473 |
| P6 | `/ordenes`, `/analitica`, `/monitoreo` y `/recepcion-satelite` quedan fuera de esta ficha. | por defecto, sin objeción, 2026-11-13 | exclusión de alcance (sin `R`) |
| P7 | El dato de la empresa se corta EN EL SERVIDOR en las 5 lecturas con fuga (F1–F5), con el criterio «no es acceso total», como el fulfillment (F481). | Carlos, 2026-11-13 | R460–R465 (F1, F2); F3–F5 → SLT-161 (R480–R482) |
| P8 | La tarjeta resaltada es «Debe llegar a la central», como en «A consolidar» (`reuso.md` pregunta 1). | leader con el criterio de Carlos, 2026-11-13 | R468, R471 |
| P9 | Las columnas Guía y Señales de la lista de gestiones se quedan (`reuso.md` pregunta 2). | leader con el criterio de Carlos, 2026-11-13 | R474 |
| P10 | Ningún componente nuevo: todo se pinta con las 8 piezas de `reuso.md` (RU1–RU6). | Carlos, 2026-11-13 | regla de diseño (`design.md > Reuso`), sin `R`; la verifica `tasks.md > T6.3` |
| P11 | Falta el dato «La central debe» del cierre de bodega en su detalle: lo añade el servidor. | leader, 2026-11-13 | R466 |
| P12 | Diseño aprobado (canvas https://claude.ai/artifact/38TStFo8VMupWd4uSwBdmQ). | Carlos, 2026-11-13 | — |
| P13 | **Partir: opción A.** Esta ficha se queda con la rebanada 1 (detalles); las descargas van a SLT-161 «Descargas de la satélite sin el dinero de la empresa», que depende de esta. | Carlos, 2026-11-14 | `## Fuera de esta ficha` |

## Requisitos (EARS)

Numeración global: esta ficha usa **R460–R478**; R479 queda reservado. «La satélite» = quien no tiene
acceso total (`esAccesoTotal` falso); «la central» = quien sí lo tiene. «Cifras de la empresa» = las
de la clase **EMP** del `## Alcance`. S4 = detalle del cierre de bodega; S6 = detalle del cierre del
mensajero (ver `## Inventario`).

### Corte en el servidor (F1, F2)

- **R460** — SI quien abre el detalle de un cierre de bodega no tiene acceso total, ENTONCES el sistema
  DEBE responder con `null` en las ocho cifras de la empresa del agregado: lo facturado por concepto
  (`totalesIngreso`), el IVA facturado, la ganancia, «Se le paga hoy a la tienda», «Sale de lo
  recaudado», «Le queda a la empresa», «Gana la tienda en total» y el reparto «Por tienda».
- **R461** — SI quien abre el detalle de un cierre de bodega no tiene acceso total, ENTONCES cada cierre
  del día de ese detalle DEBE llegar con `null` en esas mismas ocho cifras, y con lo recaudado (por
  método), el pago al mensajero, lo que gana la bodega, lo que debe llegar a la central y la marca de
  si el efectivo cubre los descuentos sin cambio.
- **R462** — SI quien abre el detalle de un cierre del mensajero no tiene acceso total, ENTONCES el
  sistema DEBE responder con `null` en: lo facturado por concepto, el IVA facturado, la ganancia, «Se le
  paga hoy a la tienda», «Sale de lo recaudado», «Le queda a la empresa», «Gana la tienda en total», la
  marca de si el flete por rechazo ya se cobró a la tienda, el reparto «Por tienda» y el reparto en %
  [tienda, empresa].
- **R463** — SI quien abre cualquiera de esos dos detalles no tiene acceso total, ENTONCES cada gestión
  DEBE llegar sin el cobro a la tienda (importes, IVA, tarifas de la tienda y fulfillment: el bloque
  `ingresoEmpresa` en `null`) y con su modelo de tarifa (anterior / nuevo) aparte y sin cambio; lo
  recibido, los pagos por método, el pago al mensajero (con su tarifa y sus ajustes) y lo que gana la
  bodega por esa gestión DEBEN llegar sin cambio.
- **R464** — El sistema DEBE aplicar R460–R463 a todo rol sin acceso total, no solo a `adminSatelite`:
  un rol que llegue a esas lecturas sin estar previsto tampoco recibe las cifras de la empresa.
- **R465** — MIENTRAS quien lee tiene acceso total, los dos detalles DEBEN responder con las mismas
  cifras de la empresa, por cierre del día y por gestión, que antes de esta ficha.

### Cifras propias de la satélite (servidor)

- **R466** — El detalle de un cierre de bodega DEBE incluir «La central debe»: la suma de los pagos al
  mensajero de sus cierres del día del modelo anterior que el efectivo de esos mismos cierres no
  alcanza a pagar, repartiendo ese efectivo de menor a mayor pago y sin pagos parciales. Los cierres
  del día del modelo nuevo no entran. Vale `"0.00"` si el efectivo alcanza para todos.
- **R467** — El detalle de un cierre del mensajero DEBE incluir, para cualquier lector con acceso al
  detalle, lo que debe llegar a la central (recaudado − pago al mensajero − gana la bodega), si el
  efectivo cubre esos dos descuentos y el reparto en % de lo recaudado en el orden [debe llegar a la
  central, pago al mensajero, gana la bodega], derivado en el servidor.

### Lo que ve la satélite en el detalle del cierre de bodega (S4)

- **R468** — MIENTRAS la satélite mira el detalle de su cierre de bodega, el sistema DEBE mostrar estas
  tarjetas y en este orden: «Recaudado» (con sus métodos), «Pago a mensajeros» (con el número de
  mensajeros), «Gana la bodega satélite», «Debe llegar a la central» resaltada y, solo si no es cero,
  «La central debe» en tono de aviso. NO DEBE mostrar «Le queda a la empresa».
- **R469** — MIENTRAS la satélite mira el detalle de su cierre de bodega, la pestaña del dinero DEBE
  llamarse «Lo que va a la central» y contener solo la barra «¿A dónde va lo recaudado?» [Debe llegar a
  la central, Pago a mensajeros, Gana la bodega satélite] y la cuenta «Lo que va a la central». NO DEBE
  contener «Lo que se le factura a la tienda», «De lo facturado, le queda a la empresa» ni «Por
  tienda».
- **R470** — MIENTRAS la satélite mira el detalle de su cierre de bodega, las pestañas DEBEN ser, en
  este orden, «Gestiones (n)», «Lo que va a la central», «Mensajeros (n)» y «Conciliación», y el detalle
  DEBE abrir en «Gestiones».

### Lo que ve la satélite en el detalle del cierre del mensajero (S6)

- **R471** — MIENTRAS la satélite mira el detalle de un cierre del mensajero, el sistema DEBE mostrar
  estas tarjetas y en este orden: «Recaudado» (con sus métodos), «Pago al mensajero», «Gana la bodega
  satélite» y «Debe llegar a la central» resaltada. NO DEBE mostrar «Se le paga hoy a la tienda» ni «Le
  queda a la empresa».
- **R472** — MIENTRAS la satélite mira el detalle de un cierre del mensajero, la pestaña «Lo que va a la
  central» DEBE contener la barra [Debe llegar a la central, Pago al mensajero, Gana la bodega
  satélite] con los porcentajes de R467 y la cuenta «Lo que va a la central» de ese cierre (total
  general, menos el pago al mensajero, menos lo que gana la bodega, igual a lo que debe llegar a la
  central). NO DEBE contener la barra [Se le paga hoy a la tienda, Sale de lo recaudado], las dos
  cuentas de la empresa ni «Por tienda».
- **R473** — MIENTRAS la satélite mira el detalle de un cierre del mensajero, las pestañas DEBEN ser, en
  este orden, «Gestiones (n)», «Lo que va a la central» y «Rechazados por la tienda (n)», y el detalle
  DEBE abrir en «Gestiones».

### La lista de gestiones de los dos detalles (S4 y S6)

- **R474** — MIENTRAS quien mira la lista de gestiones de un detalle no es la central, la lista DEBE
  mostrar la columna «Gana bodega» (lo que gana la bodega por esa gestión; «—» sin dato) en el lugar de
  «Cobro a la tienda», y conservar Guía, Destinatario, Tienda, Mensajero (en el de bodega), Resultado,
  Recibido, Pago al mensajero y Señales.
- **R475** — MIENTRAS quien mira la lista de gestiones de un detalle no es la central, la fila
  desplegada NO DEBE mostrar la tarjeta «Se le cobra a la tienda» ni «Ver cómo se calculó», y DEBE
  conservar «Recibió» y la tarjeta del pago al mensajero con su tarifa y su ajuste.
- **R476** — CUANDO quien no es la central descarga las gestiones desde el detalle (S4 o S6), el
  archivo DEBE llevar la columna «Gana bodega» en el lugar de «Cobro a la tienda», con las demás
  columnas y su orden sin cambio.

### La central y los datos que no llegan

- **R477** — MIENTRAS la central mira esos dos detalles, el sistema DEBE mostrar lo de antes de esta
  ficha: «Le queda a la empresa» (y «Se le paga hoy a la tienda» en S6), la pestaña «Dinero» primero con
  las cuentas de la empresa y «Por tienda» (con dos o más tiendas), la columna y la tarjeta del cobro a
  la tienda, «Ver cómo se calculó» y la descarga con «Cobro a la tienda».
- **R478** — SI una cifra de la empresa llega en `null` al detalle, ENTONCES la pantalla NO DEBE pintar
  la cuenta, la barra ni la tarjeta que la usa, ni un «₡0» o «—» en su lugar.

## Trazabilidad

Cada `R` con su test. Los literales de los tests se escriben **a mano** desde el corpus (cálculo en
un comentario junto al literal y en `progress/impl_SLT-154.md`), nunca copiados de la salida ni
comparados contra la función que los produce. Rutas exactas en `tasks.md > Archivos esperados`.

| R | Test | Tipo |
|---|---|---|
| R460 | `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts` > «la satélite recibe el detalle de bodega sin las ocho cifras de la empresa» | integración, Postgres real |
| R461 | mismo archivo > «cada cierre del día llega sin cifras de la empresa y con sus cifras propias» | integración, Postgres real |
| R462 | mismo archivo > «la satélite recibe el detalle del cierre del mensajero sin las cifras de la empresa» | integración, Postgres real |
| R463 | mismo archivo > «cada gestión llega sin cobro a la tienda y con su modelo de tarifa» | integración, Postgres real |
| R464 | `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` > «un rol sin acceso total que no es la satélite también recibe el recorte» (+ clasificación exhaustiva SAT/EMP) | unidad |
| R465 | `satelite-detalle-sin-dinero-empresa-sql-real.test.ts` > «el maestro recibe los dos detalles con las cifras de la empresa de antes» | integración, Postgres real |
| R466 | mismo archivo > «La central debe del cierre de bodega: reparte el efectivo de los cierres del modelo anterior» | integración, Postgres real |
| R467 | mismo archivo > «el detalle del cierre del mensajero trae lo que debe llegar a la central y su reparto» | integración, Postgres real |
| R468 | `tests/unit/utils/detalle-cierre-vista.test.ts` > «S4 satélite: las tarjetas de A consolidar»; `tests/components/DetalleCierre.test.tsx` > mismo nombre; `e2e/cierre-bodega-satelite.spec.ts` > «4 — la satélite ve solo lo suyo» | unidad, componente, E2E |
| R469 | `detalle-cierre-vista.test.ts` > «S4 satélite: solo la barra y Lo que va a la central»; `DetalleCierre.test.tsx`; E2E paso 4 | unidad, componente, E2E |
| R470 | `detalle-cierre-vista.test.ts` > «S4 satélite: pestañas y abre en Gestiones»; `DetalleCierre.test.tsx`; E2E paso 4 | unidad, componente, E2E |
| R471 | `detalle-cierre-vista.test.ts` > «S6 satélite: tarjetas propias»; `DetalleCierre.test.tsx`; E2E paso 4 | unidad, componente, E2E |
| R472 | `detalle-cierre-vista.test.ts` > «S6 satélite: barra y cuenta de la central del cierre»; `DetalleCierre.test.tsx` | unidad, componente |
| R473 | `detalle-cierre-vista.test.ts` > «S6 satélite: pestañas y abre en Gestiones»; `DetalleCierre.test.tsx` | unidad, componente |
| R474 | `tests/unit/utils/fila-gestion-vista.test.ts` > «sin la central: Gana bodega en lugar de Cobro a la tienda»; `tests/components/FilaGestion.test.tsx`; E2E paso 4 | unidad, componente, E2E |
| R475 | `fila-gestion-vista.test.ts` > «sin la central: sin tarjeta de cobro ni Ver cómo se calculó»; `FilaGestion.test.tsx`; E2E paso 4 | unidad, componente, E2E |
| R476 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` > «la descarga del detalle sin la central lleva Gana bodega» | unidad |
| R477 | `detalle-cierre-vista.test.ts`, `fila-gestion-vista.test.ts`, `detalle-cierre-descarga-columnas.test.ts` > casos «la central, como antes»; E2E paso 2 (existente, sin cambio) | unidad, E2E |
| R478 | `detalle-cierre-vista.test.ts` > «con las cifras de la empresa en null no hay cuentas, barra ni tarjetas de la empresa» | unidad |

## Fuera de esta ficha

Va a **SLT-161 «Descargas de la satélite sin el dinero de la empresa»** (depende de esta). Esbozo de
sus requisitos, para que su spec los tome y los afine; **no** se implementan aquí:

- **R480** — F3 (`listarCierresBodegaSolicitadosCompleto`): para quien no tiene acceso total, las
  cifras por cierre del modelo nuevo llegan con `null` en total facturado, IVA facturado, «Le queda a
  la empresa», «Gana la tienda en total» y el reparto por tienda; gestiones y pagos ajustados sin
  cambio.
- **R481** — F4 (`completoConCifras` de los dos `listar…CierresAdminCompleto`): lo mismo más «Se le paga a
  la tienda» (`pagoEntregado` ya va en `null` desde SLT-140).
- **R482** — F5 (`listarGestionesCierresAdminCompleto`): cada gestión sin el cobro a la tienda, pero
  **con** el monto a cobrar (COD, P2) y el modelo de tarifa. Ojo: esta ficha deja `ingresoEmpresa` en
  `null` en los detalles y saca aparte solo `tarifaModelo`; F5 necesita además `montoCobrar` fuera de
  `ingresoEmpresa` (la hoja fundida lo lee de ahí, `cierres-gestiones-fundida-descarga-columnas.ts:494`).
- **R483** — Hoja fundida «Detalle» sin «Flete con IVA», «Comisión con IVA», «Flete devolución con IVA»
  ni «Ingreso total»; con «Monto a cobrar».
- **R484** — Hoja «Gestiones» del modelo nuevo sin flete, comisión COD, flete de no entregadas (con sus
  tarifas e IVA), «Se le cobra a la tienda» ni «De eso, IVA»; conserva pago por tarifa, tarifa del pago,
  ajuste, pago al mensajero, motivo, ajustó y «Gana la bodega satélite».
- **R485** — Hoja «Cierres» de los libros «Solicitados» (S8) y «Resumen» (S9) sin «Se le paga a la
  tienda» (S9), «Gana la tienda en total», «Total facturado», «IVA facturado» ni «Le queda a la empresa».
- **R486** — Los libros de la satélite sin la hoja «Por tienda».
- **R487** — La central descarga lo mismo que antes.
- **R488–R489** — reservados.

Hasta que SLT-161 entre, las descargas de la LISTA de la satélite (S8–S10) siguen como hoy. Esta ficha
no toca `listarGestionesCierresAdminCompleto` (sigue con `ocultarFulfillmentSiNoCentral`), así que
ningún archivo sale con columnas vacías a medias.

## Preguntas abiertas

Ninguna que dependa de Carlos. Las decisiones técnicas tomadas al especificar (y por qué) están en
`design.md > Decisiones técnicas`.

<!-- Registro del dimensionado que llevó a partir (2026-11-14), para la historia de la ficha:

`arnes.config.json > gate.tamano_pr`: 40 archivos con tests incluidos, 1000 líneas de producción y
3000 de tests. El 80% son **32 archivos**. Estimación al leer el código (sin contar `specs/` ni
`progress/`, que no cuentan):

| Tipo | Archivos | Líneas estimadas |
|---|---|---|
| Producción | 23 | ~550 |
| Tests y E2E | 13 seguros + 4–6 que hoy esperan el dato de la empresa con la satélite | ~1 800 |
| **Total** | **36–42** | por debajo de los dos topes de líneas |

Lo que rompe el tope son los **archivos**, no las líneas: el corte toca 5 lecturas en 3 servicios y
4 interfaces, y cada descarga del modelo nuevo tiene su archivo de columnas, su libro y su test.

Producción (23): `lib/services/CierresAdminService.ts`, `lib/services/CierresBodegaAdminService.ts`,
`lib/services/CierreBodegaService.ts`, `lib/repositories/CierresBodegaAdminRepository.ts`,
`lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`,
`lib/interfaces/services/ICierresAdminService.ts`, `lib/interfaces/services/ICierresBodegaAdminService.ts`,
`lib/interfaces/services/ICierreBodegaService.ts`, `lib/interfaces/services/ICierreDiaService.ts`,
`components/private/cierres/detalle/detalle-cierre-vista.ts`,
`components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`,
`components/private/cierres/detalle/DetalleCierreBodegaAbierto.tsx`,
`components/private/cierres/fila/fila-gestion-vista.ts`, `components/private/cierres/fila/GestionesCierre.tsx`,
`components/private/cierres/fila/FilaGestion.tsx`, `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`,
`app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` y los seis de descarga del modelo
nuevo de `app/(app)/cierres-admin/_components/` (fundida, gestiones, resumen ×2, bodega ×2).

Hallazgos del dimensionado que el diseño tendrá que recoger, sea cual sea la opción:
- El COD por guía (`montoCobrar`, P2) y `tarifaModelo` viven DENTRO de `ingresoEmpresa`
  (`lib/interfaces/services/ICierreDiaService.ts:260`, `:294`), y la hoja fundida los lee de ahí
  (`cierres-gestiones-fundida-descarga-columnas.ts:494`, `:542`). El corte por gestión no puede anular
  `ingresoEmpresa` entero: anula campo a campo, como `ocultarFulfillmentSiNoCentral`. Y
  `ingresoEmpresa.total` hoy es `string` no nulo: su tipo cambia.
- «La central debe» del cierre de bodega sale de repartir el efectivo de sus cierres del día del
  modelo anterior (`repartirEfectivo`, `lib/services/CierreBodegaService.ts:144`, hoy privada). La
  lectura del detalle no trae la marca `pagoIndependienteEfectivo` de cada cierre del día
  (`DETALLE_CIERRE_SELECT`, `lib/repositories/CierresBodegaAdminRepository.ts:185`): hay que añadirla.

**Opción A — partir en dos rebanadas verticales** (recomendada por la regla; `docs/specs.md >
Partir una feature`). Cada una se mergea sola y deja el producto funcionando:

1. **SLT-154 (esta ficha), acotada a «La satélite ve sus detalles sin el dinero de la empresa»**:
   F1 y F2 cortadas en el servidor (agregado, cada cierre del día y cada gestión), «La central debe»
   y las cifras de la central del cierre del mensajero, las tarjetas, la pestaña «Lo que va a la
   central», la lista de gestiones con «Gana bodega» y la descarga del modal; E2E
   `e2e/cierre-bodega-satelite.spec.ts`. ~16 de producción + ~10 de tests = **~26 archivos (65%)**.
   Requisitos reservados: **R460–R479**. Hasta la rebanada 2, la hoja fundida sigue con su corte de
   hoy (solo fulfillment): la rebanada 1 usa una función nueva para los detalles y no toca F5, así que
   ningún archivo sale con columnas vacías.
2. **Ficha nueva, «Descargas de la satélite sin el dinero de la empresa»** (`depends_on`: SLT-154):
   F3, F4 y F5 cortadas en el servidor, y las columnas y la hoja «Por tienda» fuera de los libros
   «Solicitados», «Resumen» y «Detalle». ~10 de producción + ~8 de tests = **~18 archivos (45%)**.
   Requisitos reservados: **R480–R489**.

Hasta que entre la rebanada 2, las descargas de la satélite siguen como hoy (con el dato de la
empresa): no empeora nada, pero la fuga de los archivos sigue abierta ese tiempo.

**Opción B — aceptar el tamaño con desglose**, como SLT-140 «Excel del modelo nuevo: hojas por
cierre de mensajeros» y SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (allí lo rompían
las líneas de tests; aquí, los archivos). Las líneas caben de sobra. Hace falta la frase de Carlos
escrita y que el leader añada a `progress/features/SLT-154.md` la línea
`tamano-pr-aceptado` (ver `docs/gate.md > Tamaño del PR`). Ventaja: la fuga se cierra
entera en un solo PR.

En cualquiera de las dos, al responder se escriben los EARS (desde R460), `design.md` y `tasks.md`.

Nota posterior: el «campo a campo» del primer hallazgo se sustituyó en `design.md > D1` por anular
`ingresoEmpresa` entero y sacar aparte `tarifaModelo` (falla cerrado y no cambia el tipo de `total`).
-->

