# SLT-154 «Vista de la bodega satélite: solo lo suyo» — requirements (BORRADOR: inventario + matriz)

> Estado: **borrador para decisión de Carlos**. Aún sin requisitos EARS, sin `design.md` ni
> `tasks.md`. Ruta completa, zona fullstack. Pasa por `/design` antes de implementarse.
> Fuente: lectura del worktree (desde `origin/dev`, con la épica de cierres). El índice del grafo
> no tiene este worktree: el inventario se hizo con Grep/Read.

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

## Preguntas abiertas

Solo las que dependen de Carlos; cada una con la recomendación.

- **P1 — ¿«A conciliar» es «A consolidar»?** La satélite no tiene ninguna pestaña «A conciliar». Sus
  pestañas son «A consolidar» y «Solicitados»; «Por conciliar» es de la central. Las KPI que
  describiste (pago al mensajero, lo que ganó, lo que va a la central) son las de «A consolidar».
  *Recomendación:* usar las KPI de «A consolidar» en el modal (S4) y, por cierre, en S6.
- **P2 — El COD que recaudó su mensajero.** «Recaudado» (lo cobrado al cliente final) y «Monto a
  cobrar» por guía no son dinero de la empresa: la satélite los entrega y con ellos cuadra.
  *Recomendación:* que los vea (S1, S3–S6, S10).
- **P3 — La tienda.** El nombre de la tienda por gestión es operativo (la satélite devuelve paquetes a
  esa tienda). Los importes por tienda («Por tienda») son de la empresa.
  *Recomendación:* mantener la columna «Tienda» y quitar «Por tienda» (pantalla y hoja Excel).
- **P4 — ¿Qué ocupa el lugar de «Cobro a la tienda» en la lista de gestiones?** Opción A: quitar la
  columna. Opción B: poner «Gana bodega» de la gestión (`ingresoBodegaRechazos` de la fila, que ya
  existe en el Excel del modelo nuevo). *Recomendación:* B, porque sigue la regla de «mismo componente,
  otra información». Se decide en `/design`.
- **P5 — Pestaña «Dinero» del cierre del mensajero (S6).** Hoy solo tiene cuentas de la empresa.
  Opción A: sustituirla por «¿A dónde va lo recaudado?» y «Lo que va a la central» de ese cierre.
  Opción B: quitar la pestaña y dejar el dinero solo en la cabecera. *Recomendación:* A, que es la
  misma forma que el modal de bodega (S4).
- **P6 — Alcance.** `/ordenes`, `/analitica`, `/monitoreo` y `/recepcion-satelite` también abren a la
  satélite y no están inventariados aquí. *Recomendación:* dejarlos fuera de esta ficha. Si alguno
  enseña tarifas o cobros a la tienda, se abre una ficha aparte.
- **P7 — Recorte en el servidor.** ¿Aceptas que el dato EMP deje de enviarse a la satélite, no solo
  de pintarse (F1–F5)? Puede tocar tests y E2E que hoy esperan esos campos con audiencia satélite.
  *Recomendación:* sí, en el servidor, con el mismo criterio que el fulfillment (F481).
