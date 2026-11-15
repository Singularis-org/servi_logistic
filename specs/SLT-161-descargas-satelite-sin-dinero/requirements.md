# SLT-161 «Descargas de la satélite sin el dinero de la empresa» — requirements

> Estado: **spec completo** (2026-11-15, spec_author), pendiente de aprobación. Ruta completa, zona
> fullstack, complejidad medium (toca dinero). Rebanada 2 de SLT-154 «Vista de la bodega satélite: solo
> lo suyo» (`specs/SLT-154-vista-satelite-solo-lo-suyo/`, opción A de P13): esa ficha reservó
> **R480–R489** para esta y dejó un esbozo en su `## Fuera de esta ficha`. Este documento afina ese
> esbozo contra el código **actual** de `origin/dev` (14e38c28), que ya trae SLT-154 y SLT-169 «Se le
> paga hoy a la tienda con todos los cobros restados». El grafo no indexa este worktree: todo se leyó
> con Grep/Read.

## Alcance

Las tres descargas Excel de la **lista** que usa la bodega satélite (`adminSatelite`) en
`/cierres-admin` salen hoy con el dinero de la empresa. Esta ficha lo corta **en el servidor** (las
tres lecturas F3–F5 del inventario de SLT-154) y quita del libro de la satélite las columnas y la hoja
que lo pintan. La central (acceso total) descarga lo mismo que hoy.

Clasificación: la de SLT-154 (`requirements.md > Alcance`): **SAT** (de la satélite) y **EMP** (de la
empresa: cobro a la tienda, sus tarifas e IVA, «Se le paga a la tienda», total e IVA facturado, «Le
queda a la empresa», reparto «Por tienda», fulfillment, «Pago entregado»).

### Lo que hay hoy en el código (verificado el 2026-11-15)

| Superficie | Lectura (servidor) | Qué EMP viaja hoy a la satélite | Qué EMP pinta hoy su libro |
|---|---|---|---|
| S8 — «Cierres de bodega solicitados», libro del modelo nuevo (`ConsolidacionBodegaModule.tsx:272`) | **F3** `CierreBodegaService.listarCierresBodegaSolicitadosCompleto` → `cifrasBodegaDescarga` (`lib/services/cifras-bodega-descarga.ts:65`) | por cierre de bodega nuevo: `totalFacturado`, `ivaFacturado`, `netoEmpresa`, `ganaLaTienda` (desde SLT-169 R629 vale «Se le paga a la tienda»), `partesPorTienda` | hoja «Cierres» (`cierres-bodega-modelo-nuevo-descarga-columnas.ts:37`): «Se le paga a la tienda», «Total facturado», «IVA facturado», «Le queda a la empresa» (25 columnas; ya sin «Pago entregado»); hoja «Por tienda» |
| S9 — «Resumen» de cierres de mensajeros (Pendientes y Resueltos), libro del modelo nuevo (`CierresAdminModule.tsx:309`, `:372`) | **F4** `CierresAdminService.completoConCifras` (`:882`) de `listarPendientesCierresAdminCompleto` y `listarHistoricoCierresAdminCompleto` → `toCifrasDescarga` (`:2054`) | por cierre nuevo: `pagoTienda`, `ganaLaTienda`, `totalFacturado`, `ivaFacturado`, `netoEmpresa`, `partesPorTienda` (`pagoEntregado` ya en `null`, SLT-140 R382) | hoja «Cierres» (`cierres-resumen-modelo-nuevo-descarga-columnas.ts:39`): «Se le paga a la tienda», «Total facturado», «IVA facturado», «Le queda a la empresa» (18 columnas; ya sin «Pago entregado» ni, desde SLT-169 R628, «Gana la tienda en total»); hoja «Por tienda» |
| S10 — «Detalle» de gestiones (diálogo de `DescargarCierresButton`) | **F5** `CierresAdminService.listarGestionesCierresAdminCompleto` (`:947`), hoy solo con `ocultarFulfillmentSiNoCentral` (`:144`) | por gestión, el bloque `ingresoEmpresa` entero salvo el fulfillment (importes, IVA, tarifas, total) | hoja fundida (`cierres-gestiones-fundida-descarga-columnas.ts:266`): «Flete con IVA», «Comisión con IVA», «Flete devolución con IVA», «Ingreso total» (30 columnas; ya sin «Fulfillment»). Hoja «Gestiones» del modelo nuevo (`cierres-gestiones-modelo-nuevo-descarga-columnas.ts:53`): flete, comisión COD y flete de no entregadas con sus tarifas e IVA, «Se le cobra a la tienda», «De eso, IVA» (32 columnas; ya sin las tres de fulfillment) |

Sin dinero EMP y **sin cambio**: los archivos del modelo anterior («Cierres del día a consolidar»,
«Cierres de bodega solicitados» y los dos «Resumen» de `cierres-admin-descarga-columnas.ts`, que solo
llevan recaudado, pago al mensajero, ingreso de bodega y lo de la central), la hoja «Cierres modelo
anterior» y «Rechazados por la tienda» (sin importes).

### Lo que ya está hecho en `dev` (no se repite)

- **F1, F2 y la descarga del modal** (S4/S6, «Gana bodega» en lugar de «Cobro a la tienda»): SLT-154
  R460–R478, ficha `done`.
- **«Pago entregado»** fuera de los libros S8/S9 de la satélite y en `null` en el servidor: SLT-140 R382
  y SLT-141 R386.
- **Fulfillment** fuera de S10 de la satélite y en `null` en el servidor: F481, SLT-52 R46, SLT-101 R94,
  SLT-113 R376.
- **«Gana la tienda en total»** ya no es columna de la hoja «Cierres» de S9 ni de «Por tienda» (SLT-169
  R628, R630); en S8 se rotula «Se le paga a la tienda» (R629). Por eso el esbozo de SLT-154 (R485)
  nombraba columnas que ya no existen: aquí se cuentan las de hoy.
- La pieza del corte ya existe: `anularEmpresaSiNoCentral` + `ClasificacionDinero`
  (`lib/services/CierresAdminService.ts:192-216`, SLT-154 D2/D3) y el patrón «`ingresoEmpresa` en `null`
  y el modelo de tarifa aparte» (`ocultarDineroEmpresaSiNoCentral`, `:181`, SLT-154 D1).

**Fuera de alcance:** las descargas de la central (`CierresBodegaAdminService.*Completo` responden
`forbidden` a quien no tiene acceso total, `:336`, `:380`, `:419`), `/ordenes`, `/analitica`,
`/monitoreo`, `/recepcion-satelite` (SLT-154 P6), cualquier movimiento de dinero y cualquier pantalla.

## Decisiones cerradas (no reabrir)

Heredadas de SLT-154 (`specs/SLT-154-vista-satelite-solo-lo-suyo/requirements.md > Decisiones
cerradas`) y del leader de esta ficha. No se re-preguntan.

| # | Decisión | Quién y cuándo | Cubre |
|---|---|---|---|
| P2 (SLT-154) | La satélite SÍ ve lo recaudado (COD) por su mensajero y el monto a cobrar por guía; el monto a cobrar por guía solo se ve en el Excel S10. | Carlos, 2026-11-13 | R482, R483 |
| P3 (SLT-154) | Se mantiene el nombre de la tienda por gestión; se quita «Por tienda» (pantalla y hoja del Excel). | Carlos, 2026-11-13 | R486 (la hoja); R483, R484 (la tienda por gestión se queda) |
| P7 (SLT-154) | El dato de la empresa se corta EN EL SERVIDOR en las 5 lecturas con fuga, con el criterio «no es acceso total», como el fulfillment (F481). F3–F5 son de esta ficha. | Carlos, 2026-11-13 | R480, R481, R482, R488 |
| P13 (SLT-154) | Partir: opción A. Esta ficha son las descargas de la lista (F3–F5, S8–S10), con R480–R489. | Carlos, 2026-11-14 | todo el documento |
| L1 | La base son las columnas del Excel que dejó SLT-169 «Se le paga hoy a la tienda con todos los cobros restados», no las del spec de SLT-154. Y la satélite no gana ninguna columna ni hoja (SLT-169 R634). | leader, 2026-11-15 | R483–R486, R489 |

## Requisitos (EARS)

Numeración global: **R480–R489** (reservados por SLT-154). «La satélite» = quien no tiene acceso
total (`esAccesoTotal` falso); «la central» = quien sí lo tiene. «Libro de la satélite» = el que se
arma con la audiencia `"satelite"`. «Cifras de la empresa» = las **EMP** del `## Alcance`. Los
recuentos de columnas son los de hoy, contados en el código citado arriba.

### Corte en el servidor (F3, F4, F5)

- **R480** — SI quien pide el conjunto de «Cierres de bodega solicitados» para descargar no tiene acceso
  total, ENTONCES las cifras de cada cierre de bodega del modelo nuevo DEBEN llegar con `null` en el
  total facturado, el IVA facturado, «Le queda a la empresa», «Se le paga a la tienda» (`ganaLaTienda`)
  y el reparto por tienda, y con el número de gestiones y el de pagos ajustados sin cambio y sin la
  clave `pagoEntregado`.
- **R481** — SI quien pide el conjunto de cierres de mensajeros pendientes o resueltos para descargar no
  tiene acceso total, ENTONCES las cifras de cada cierre del modelo nuevo DEBEN llegar con `null` en «Se
  le paga a la tienda» (`pagoTienda`), `ganaLaTienda`, el total facturado, el IVA facturado, «Le queda
  a la empresa», el reparto por tienda y «Pago entregado», y con el número de gestiones sin cambio.
- **R482** — SI quien pide las gestiones de los cierres para la hoja «Detalle» no tiene acceso total,
  ENTONCES cada gestión DEBE llegar con el cobro a la tienda en `null` (el bloque `ingresoEmpresa`
  entero: importes, IVA, tarifas, total y fulfillment) y con el monto a cobrar (COD) y el modelo de
  tarifa (anterior / nuevo) aparte y con el valor que tenían dentro de ese bloque; lo recibido, los
  pagos por método, el pago al mensajero (con su tarifa y sus ajustes), lo que gana la bodega, la
  indemnización, el folio y el modelo del cierre DEBEN llegar sin cambio.
- **R488** — El sistema DEBE aplicar R481 y R482 a todo rol sin acceso total, no solo a
  `adminSatelite`, y DEBE clasificar como de la satélite o de la empresa cada campo de las cifras de
  descarga de los dos libros, de modo que un campo nuevo sin clasificar no compile.

### El libro de la satélite

- **R483** — MIENTRAS la audiencia de la hoja fundida «Detalle» es la satélite, la hoja DEBE tener 26
  columnas: las 30 de hoy sin «Flete con IVA», «Comisión con IVA», «Flete devolución con IVA» ni
  «Ingreso total», con el orden relativo de las demás sin cambio. «Monto a cobrar», «Pago al mensajero»
  y «Gana la bodega» DEBEN poblarse con los mismos valores y en los mismos resultados que hoy, también
  en las gestiones del modelo nuevo.
- **R484** — MIENTRAS la audiencia de la hoja «Gestiones» del modelo nuevo es la satélite, la hoja DEBE
  tener 21 columnas: las 32 de hoy sin «Flete por entregado», «Tarifa del flete», «IVA del flete»,
  «Comisión COD», «Tarifa de la comisión», «IVA de la comisión», el flete de no entregadas con su tarifa
  y su IVA, «Se le cobra a la tienda» ni «De eso, IVA», con el orden relativo de las demás sin cambio
  (conserva «Tienda», pago por tarifa, tarifa del pago, ajuste, pago al mensajero, motivo del ajuste,
  «Ajustó», «Gana la bodega satélite» y «Señales»).
- **R485** — MIENTRAS la audiencia del libro es la satélite, la hoja «Cierres» del «Resumen» de cierres
  de mensajeros DEBE tener 14 columnas (las 18 de hoy sin «Se le paga a la tienda», «Total facturado»,
  «IVA facturado» ni «Le queda a la empresa») y la hoja «Cierres» de los cierres de bodega solicitados
  DEBE tener 21 columnas (las 25 de hoy sin esas mismas cuatro), con el orden relativo de las demás sin
  cambio.
- **R486** — MIENTRAS la audiencia del libro es la satélite, el «Resumen» de cierres de mensajeros y el
  de cierres de bodega solicitados NO DEBEN llevar la hoja «Por tienda»: sus hojas DEBEN ser «Cierres»
  y, solo si el conjunto también tiene cierres del modelo anterior, «Cierres modelo anterior».
- **R489** — MIENTRAS la audiencia es la satélite, cada fila de las hojas de R484 y R485 NO DEBE llevar
  la clave de ninguna columna quitada (ni con valor vacío), cada fila de la hoja de R483 DEBE llevar
  esas cuatro celdas vacías (el servidor ya no manda el dato) y el libro NO DEBE ganar ninguna columna
  ni hoja respecto de hoy.

### La central

- **R487** — MIENTRAS quien descarga tiene acceso total, los tres libros DEBEN salir como antes de esta
  ficha: las mismas cifras de la empresa del servidor, las mismas columnas en el mismo orden (hoja
  fundida 31, «Gestiones» 35, «Cierres» de mensajeros 19, «Cierres» de bodega 26) y la hoja «Por
  tienda».

## Trazabilidad

Cada `R` con su test. Los literales se escriben **a mano** desde el corpus (cálculo en un comentario
junto al literal y en `progress/impl_SLT-161.md`), nunca copiados de la salida ni comparados contra la
función que los produce. Rutas exactas en `tasks.md > Archivos esperados`.

| R | Test | Tipo |
|---|---|---|
| R480 | `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` > «R480: «Solicitados» de S: BN sin las cifras de la empresa, con gestiones y pagos ajustados» (sustituye la aserción de cifras del caso R386/R389); `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts` > «R480: la satélite recibe las cifras de la empresa en null» | integración Postgres real, unidad |
| R481 | `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` > «R481: la satélite recibe S1 sin las cifras de la empresa, en Resueltos y en Pendientes»; `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` > «R481: cifras de la empresa en null para la satélite» | integración Postgres real, unidad |
| R482 | `cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` > «R482: las gestiones de S1 para la hoja Detalle, sin cobro a la tienda y con monto a cobrar y modelo»; `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` > «R482: la descarga de gestiones anula ingresoEmpresa y saca aparte monto a cobrar y modelo» | integración Postgres real, unidad |
| R483 | `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts` > «R483: la satélite, 26 columnas sin las cuatro de la empresa» y «R483: monto a cobrar, pago e ingreso de bodega del modelo nuevo con ingresoEmpresa en null» | unidad |
| R484 | `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` > «R484: la satélite, 21 columnas en su orden» | unidad |
| R485 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` > «R485: Cierres de la satélite, 14 columnas»; `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` > «R485: Cierres de bodega de la satélite, 21 columnas» | unidad |
| R486 | `cierres-resumen-modelo-nuevo-descarga.test.ts` y `cierres-bodega-modelo-nuevo-descarga.test.ts` > «R486: el libro de la satélite sin Por tienda (solo nuevo y mixto)» | unidad |
| R487 | los cuatro archivos de `tests/unit/descarga/` de arriba > casos «la central, como antes» (recuentos literales 31/35/19/26 y «Por tienda»); los casos existentes de la central de los dos `*-sql-real.test.ts` (R380, R387, R388), sin cambio | unidad, integración |
| R488 | `cierres-admin-fulfillment-solo-central.test.ts` > «R488: un rol sin acceso total que no es la satélite también recibe el recorte de las descargas» + clasificación exhaustiva (`satisfies ClasificacionDinero<…>`, la vigila `pnpm run typecheck`) | unidad, typecheck |
| R489 | `cierres-gestiones-modelo-nuevo-descarga.test.ts`, `cierres-resumen-modelo-nuevo-descarga.test.ts`, `cierres-bodega-modelo-nuevo-descarga.test.ts` > «R489: la fila de la satélite no lleva las claves quitadas» (`Object.keys`); `cierres-gestiones-fundida-descarga-columnas.test.ts` > «R489: con ingresoEmpresa en null, las cuatro celdas de la empresa vacías» | unidad |

## Preguntas abiertas

1. **«Indemnización» por gestión** (columna de la hoja fundida, y el texto de «Señales» de la hoja
   «Gestiones»): ¿es dato de la empresa? El review de SLT-154 «Vista de la bodega satélite: solo lo
   suyo» lo dejó anotado (`progress/review_SLT-154.md`, hallazgo sobre `ICierreDiaService.ts:139`) y
   el inventario de SLT-154 no la clasifica como EMP. **Mientras Carlos no diga otra cosa, se queda**
   (R482, R483 la conservan). Si es EMP, se quita en esta ficha con un requisito más (cabe: R480–R489
   no se agotan y sería un campo y una columna).

Las decisiones técnicas tomadas al especificar (y por qué) están en `design.md > Decisiones técnicas`.
