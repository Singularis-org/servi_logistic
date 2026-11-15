# SLT-161 «Descargas de la satélite sin el dinero de la empresa» — bitácora de implementación

## Tanda T1 + T2 (backend_dev, 2026-11-15)

Contratos (T1) y corte en el servidor (T2) de F3, F4 y F5. Sin migración. El grafo no indexa este
worktree: todo con Grep/Read. Base desechable propia (`servi_slt161_desechable`, `migrate deploy` +
`db:seed`), nunca la del `.env`; los `*-sql-real.test.ts` corrieron contra ella (no saltados).

### Archivos

Modificados (código):
- `lib/interfaces/services/ICierresAdminService.ts` — T1.1: `CifrasCierreDescargaDTO` con las cinco
  cifras EMP `string | null` y `partesPorTienda … | null` (obligatorios); `CierreGestionDescargaDTO`
  con `montoCobrar?` y `tarifaModelo?` aditivos.
- `lib/interfaces/services/ICierreBodegaService.ts` — T1.2: `CifrasCierreBodegaDescargaDTO` con las
  cuatro EMP `string | null` y `partesPorTienda … | null`.
- `lib/services/CierresAdminService.ts` — T2.1: `CLASE_CIFRAS_DESCARGA_CIERRE` + `anularEmpresaSiNoCentral`
  en `completoConCifras` (F4). T2.2: `ocultarDineroEmpresaDescargaSiNoCentral` sustituye el `map` de
  fulfillment de `listarGestionesCierresAdminCompleto` (F5). `ocultarFulfillmentSiNoCentral` sigue
  exportada (la usan tests), ya sin uso en producción.
- `lib/services/cifras-bodega-descarga.ts` — T2.3: `CLASE_CIFRAS_BODEGA_DESCARGA` (import solo de tipo
  de `ClasificacionDinero`).
- `lib/services/CierreBodegaService.ts` — T2.3: corte en `listarCierresBodegaSolicitadosCompleto` (F3)
  con `anularEmpresaSiNoCentral` importado de `CierresAdminService.ts`. Sin ciclo (ni
  `CierresAdminService` ni sus imports llegan a `CierreBodegaService`/`cifras-bodega-descarga`), así que
  `lib/services/anular-empresa.ts` (condicional) no se creó.
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga.ts` y
  `cierres-bodega-modelo-nuevo-descarga.ts` — **solo** `suyas.partesPorTienda ?? []` (compatibilidad
  de tipos de T1; ver Desviaciones). La hoja «Por tienda» la quita T3.

Modificados (tests):
- `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts` — el caso R386/R387 se
  parte: R387 (importes a mano) pasa a afirmarse sobre `cifrasBodegaDescarga` (el cálculo que también
  recibe la central) y nace «R480: la satélite recibe las cifras de la empresa en null».
- `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` — el caso (c) R382 pasa a
  «R481: cifras de la empresa en null para la satélite» (Resueltos y Pendientes).
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` — los tres casos de la satélite
  en el Excel (F481, SLT-52 R46, SLT-101 R94) afirmaban el bloque con solo el fulfillment anulado: se
  actualizan a R482 (bloque entero `null`, sin rastro de 1500.00 / 450.00 / 58.50 / 508.50 / fecha del
  cargo). Nuevos: «R482: la descarga de gestiones anula ingresoEmpresa y saca aparte monto a cobrar y
  modelo»; bloque «SLT-161 R488» (roles sin acceso total, central tal cual, clasificación a mano).
- `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` — el caso R386/R389 pasa a «R480:
  «Solicitados» de S: BN sin las cifras de la empresa, con gestiones y pagos ajustados».
- `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` — el caso R382/R383
  pasa a «R481: la satélite recibe S1 sin las cifras de la empresa, en Resueltos y en Pendientes» (S1
  vuelve a `solicitado` dentro de la transacción revertida para la cola); nuevo «R482: las gestiones de
  S1 para la hoja Detalle, sin cobro a la tienda y con monto a cobrar y modelo».
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` — solo
  `(CIFRAS_N1.partesPorTienda ?? [])[1]` (compatibilidad de tipos).

Casos de la central sin tocar: R380, R387, R388 de los dos `*-sql-real.test.ts` (R487 en el servidor).

### Literales (a mano)

- R480 (BN): gestiones 3 = las tres gestiones de D1; pagos ajustados 1 = el ajuste de D1; las cinco EMP
  `null`; sin clave `pagoEntregado`.
- R480 unidad (BS): gestiones 1 (G2), pagos ajustados 0 (`D_BS.gestionesAjustadas`). R387 de la misma
  unidad conserva sus literales: facturado 1 130, IVA 130, neto (1 130 − 130) − 1 000 − 0 = 0, gana
  30 000 − 1 130 = 28 870.
- R481 (S1 / s1, s2): gestiones 2 (G1 + G2); seis EMP + `pagoEntregado` en `null`.
- R482 integración: COD G1 100 000,00, G2 10 000,00; modelo «nuevo»; pago al mensajero 0,00 (sembrado);
  pagos 70 000 efectivo + 30 000 SINPE; folio = últimos 8 del id de S1 en mayúsculas. Central (N1, mismas
  G1/G2): total de G1 = 4 000 + 520 + 1 000 (1 % de 100 000) + 130 = 5 650,00.
- R482 unidad: `montoCobrar` 10 000,00 y `tarifaModelo` «viejo» (los de `INGRESO`).

### Mapa R → test (de esta tanda)

| R | Test (`it`) |
|---|---|
| R480 | `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` > «R480: «Solicitados» de S: BN sin las cifras de la empresa, con gestiones y pagos ajustados»; `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts` > «R480: la satélite recibe las cifras de la empresa en null» |
| R481 | `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` > «R481: la satélite recibe S1 sin las cifras de la empresa, en Resueltos y en Pendientes»; `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` > «R481: cifras de la empresa en null para la satélite» |
| R482 | `cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` > «R482: las gestiones de S1 para la hoja Detalle, sin cobro a la tienda y con monto a cobrar y modelo»; `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` > «R482: la descarga de gestiones anula ingresoEmpresa y saca aparte monto a cobrar y modelo» (+ «R482: sin la clave del día del cargo, el recorte no la añade») |
| R487 (servidor) | `cierres-admin-fulfillment-solo-central.test.ts` > «R487: %s recibe la gestión y las cifras tal cual, sin monto a cobrar ni modelo aparte» (maestro, admin); casos de la central existentes R380/R387/R388 de los dos `*-sql-real.test.ts`, sin cambio; la parte central del caso R482 de integración. El recuento de columnas 31/35/19/26 es de T3. |
| R488 | `cierres-admin-fulfillment-solo-central.test.ts` > «R488: un rol sin acceso total que no es la satélite también recibe el recorte de las descargas (%s)» (adminTienda, mensajero, adminSatelite) y «R488: las siete cifras de la empresa del «Resumen» de cierres y las cinco de los cierres de bodega»; clasificación exhaustiva `satisfies ClasificacionDinero<…>` (typecheck) |
| R483–R486, R489 | T3 (frontend_dev) |

### Mutaciones de control (cada una revertida; `cmp` contra la copia previa = idéntico)

| # | Mutación | Tests que se pusieron rojos |
|---|---|---|
| M1 | F4: `anularEmpresaSiNoCentral(…, actor)` → con rol `maestro` | R481 unidad; R481 integración |
| M2 | F5: `ocultarDineroEmpresaDescargaSiNoCentral(fila, actor)` → `fila` | R482 unidad; R482 integración; los tres casos de la satélite en el Excel (481, SLT-52, SLT-101) |
| M3 | F3: `anularEmpresaSiNoCentral(c, …, actor)` → con rol `maestro` | R480 unidad; R480 integración |
| M4 | `anularEmpresaSiNoCentral`: criterio «es adminSatelite» en vez de «no es acceso total» | R488 (adminTienda, mensajero) y SLT-154 R464 (adminTienda, mensajero) |
| M5 | `ocultarDineroEmpresaDescargaSiNoCentral`: criterio «es adminSatelite» | R488 (adminTienda, mensajero) |
| M6 | `montoCobrar: null` en vez del del bloque | R482 unidad; R482 integración; SLT-52 R46 (Excel); R488 (los tres roles) |
| M7 | quitar `pagoEntregado` de `CLASE_CIFRAS_DESCARGA_CIERRE` y marcar `pagosAjustados` (no nullable) como `"empresa"` | `pnpm run typecheck` rojo: TS1360 / TS2345 / TS2322 en las dos clasificaciones |

### Salidas

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0 (0 errores; ningún aviso en los archivos de esta tanda).
- `pnpm exec vitest run` de los 5 archivos de la tanda + `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`
  y `cierres-bodega-modelo-nuevo-descarga.test.ts`: 7 archivos, 87 tests, 87 passed, 0 skipped.
- `./init.sh`: `INIT_EXIT=0` escrito en el log (gate rápido: typecheck, lint, related + disparadores, todas las guardias; con `DATABASE_URL` de la desechable).

### Desviaciones

- T1 deja el typecheck rojo en dos consumidores de `app/` (`suyas.partesPorTienda` posiblemente
  `null`) y en un test de descarga. Para dejar el gate verde al cerrar la tanda se añadió solo
  `?? []` (sin cambio de comportamiento para la central; para la satélite la hoja «Por tienda» sale
  vacía hasta que T3 la quite, R486). T3 debe sustituir ese `?? []` por la condición de audiencia.
- El unit de R387 ya no pasa por el servicio de la satélite (que ahora anula): se afirma sobre
  `cifrasBodegaDescarga`, la misma función que alimenta a la central.

Veredicto: T1 y T2 hechas; R480, R481, R482, R488 (y R487 en el servidor) con test y mutación que los mata.

## Tanda T3 (frontend_dev, 2026-11-15)

El libro Excel de la satélite: columnas, filas y hojas de S8–S10 sin el dinero de la empresa. Solo
módulos puros de `app/(app)/cierres-admin/_components/`; ningún `.tsx`, ningún servicio. Sin grafo
(no indexa este worktree): Grep/Read. Tests con `DATABASE_URL` apuntando a `servi_slt161_desechable`.

### Archivos

Modificados (código):
- `cierres-gestiones-fundida-descarga-columnas.ts` — T3.1: `CLAVES_SOLO_CENTRAL` suma `fleteConIva`,
  `comisionConIva`, `fleteDevolucionConIva`, `ingresoTotal` (26 para la satélite); `montoCobrar` y
  `tarifaModelo` se leen también de la gestión cuando el bloque llega en `null` (R482/D1).
- `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` — T3.2: las 11 claves del cobro a la tienda
  entran en `CLAVES_SOLO_CENTRAL` (21) y en la fila solo con `audiencia === "admin"`.
- `cierres-resumen-modelo-nuevo-descarga-columnas.ts` — T3.3: `CLAVES_EMPRESA` (pagoEntregado,
  pagoTienda, totalFacturado, ivaFacturado, netoEmpresa) → 14; claves solo para `"admin"`.
- `cierres-resumen-modelo-nuevo-descarga.ts` — T3.3: «Por tienda» solo para `"admin"`; sustituye el
  `?? []` de T1-T2. La central sin `partesPorTienda` lanza error (no se degrada a hoja vacía).
- `cierres-bodega-modelo-nuevo-descarga-columnas.ts` — T3.4: `CLAVES_EMPRESA` (pagoEntregado,
  ganaLaTienda, totalFacturado, ivaFacturado, netoEmpresa) → 21; claves solo para `"admin"`.
- `cierres-bodega-modelo-nuevo-descarga.ts` — T3.4: ídem que el de mensajeros (quita el `?? []`).

Modificados (tests):
- `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts` — bloque nuevo «SLT-161».
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` — el caso de 32 pasa a R484
  (21); nuevos R487 y R489; «B, satélite» pasa a 21 celdas.
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` — el caso de 18 pasa a R485 (14);
  «N1 en la satélite» pasa a R489; nuevos R486, R487 y «la central sin el reparto … es un error»;
  `obtenerResumenCierres` de la satélite sin «Por tienda»; el `(CIFRAS_N1.partesPorTienda ?? [])[1]`
  pasa a `PARTES_N1[1]`.
- `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` — el caso de 25 pasa a R485 (21);
  el de `pagoEntregado` pasa a R489; nuevos R486, R487 y el error de la central sin reparto.
- Cuatro tests de componentes que afirmaban el libro de la satélite de antes (no estaban en
  `tasks.md > Archivos esperados`, ver Desviaciones):
  `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (21 columnas y sin «Por
  tienda»; fixtures central/satélite ahora literales separados), `DescargarResumenModeloNuevo.test.tsx`
  (14 y sin «Por tienda»), `DescargarGestionesModeloNuevo.test.tsx` (21), `CierresDescargaNiveles.test.tsx`
  (fundida 26).

### Literales (a mano)

- Fundida: 31 de la central − Fulfillment − Flete + IVA − Comisión + IVA − Flete por devolución a
  origen + IVA − Total de la empresa = 26.
- «Gestiones»: 35 − 3 de fulfillment − 11 del cobro a la tienda (flete, tarifa, IVA; comisión, tarifa,
  IVA; flete de no entregadas, tarifa, IVA; «Se le cobra a la tienda»; «De eso, IVA») = 21.
- «Cierres» de mensajeros: 19 − Pago entregado − Se le paga a la tienda − Total facturado − IVA
  facturado − Le queda a la empresa = 14.
- «Cierres» de bodega: 26 − las mismas cinco (con «Se le paga a la tienda» en la clave `ganaLaTienda`) = 21.
- R483 (a cobrar, pago mensajero, ingreso bodega) con `ingresoEmpresa: null`, `montoCobrar` 1000.10:
  nuevo → las tres pobladas en los cinco resultados (tabla SLT-54 R72); viejo → entregado/reprogramado/
  novedad sin ingreso de bodega, devuelta con las tres, incidente solo a cobrar (tabla del viejo).
- Señuelos de R489: 731957.4x (mensajeros), 846213.5x (bodega), 583914.6x/7x (gestiones).

### Mapa R → test (de esta tanda)

| R | Test (`it`) |
|---|---|
| R483 | `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts` > «R483: la satélite, 26 columnas sin las cuatro de la empresa» y «R483: monto a cobrar, pago e ingreso de bodega del modelo nuevo con ingresoEmpresa en null (%s, %s)» (10 casos) |
| R484 | `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` > «R484: la satélite, 21 columnas en su orden» |
| R485 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` > «R485: Cierres de la satélite, 14 columnas»; `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` > «R485: Cierres de bodega de la satélite, 21 columnas» |
| R486 | `cierres-resumen-modelo-nuevo-descarga.test.ts` y `cierres-bodega-modelo-nuevo-descarga.test.ts` > «R486: el libro de la satélite sin Por tienda (solo nuevo y mixto)» |
| R487 (libro) | `cierres-gestiones-fundida-descarga-columnas.test.ts` > «R487: la central, como antes: 31 columnas con las de la empresa»; `cierres-gestiones-modelo-nuevo-descarga.test.ts` > «R487: la central, como antes: 35 columnas en «Gestiones»»; `cierres-resumen-modelo-nuevo-descarga.test.ts` > «R487: la central, como antes: 19 columnas en «Cierres» y la hoja «Por tienda»»; `cierres-bodega-modelo-nuevo-descarga.test.ts` > «R487: la central, como antes: 26 columnas en «Cierres» y la hoja «Por tienda»» |
| R489 | `cierres-gestiones-modelo-nuevo-descarga.test.ts`, `cierres-resumen-modelo-nuevo-descarga.test.ts`, `cierres-bodega-modelo-nuevo-descarga.test.ts` > «R489: la fila de la satélite no lleva las claves quitadas» (`Object.keys` + señuelo); `cierres-gestiones-fundida-descarga-columnas.test.ts` > «R489: con ingresoEmpresa en null, las cuatro celdas de la empresa vacías (%s)» (5 casos) |

### Mutaciones de control (cada una revertida; `filecmp` contra la copia previa = idéntico; `git status` sin otros cambios)

| # | Mutación | Tests que se pusieron rojos |
|---|---|---|
| M1 | resumen: quitar `pagoTienda` de `CLAVES_EMPRESA` | R485 (mensajeros) |
| M2 | resumen: `pagoTienda` en la fila base (fuera del `if admin`) | R489 (mensajeros) |
| M3 | resumen: «Por tienda» también para la satélite | R486 (mensajeros); `obtenerResumenCierres` «con nuevos» |
| M4 | resumen: quitar `if (admin) return COLUMNAS_CIERRES` | R487 (19) y otros 3 de la central |
| M5 | bodega: quitar `ganaLaTienda` de `CLAVES_EMPRESA` | R485 (bodega); R489 (bodega) |
| M6 | bodega: `ganaLaTienda` en la fila base | R489 (bodega) |
| M7 | bodega: «Por tienda» también para la satélite | R486 (bodega) |
| M8 | bodega: quitar `if (admin) return …` | R487 (26) y otros 2 de la central |
| M9 | gestiones: quitar `cobroTienda` de `CLAVES_SOLO_CENTRAL` | R484; «B, satélite: 21 celdas»; R489 (gestiones) |
| M10 | gestiones: `cobroTienda` en la fila base | R489 (gestiones) |
| M11 | gestiones: quitar `if (admin) return …` | R487 (35) y otros 4 de la central |
| M12 | fundida: quitar `ingresoTotal` de `CLAVES_SOLO_CENTRAL` | R483 (26 columnas) |
| M13 | fundida: `montoCobrar` sin el `?? gestion.montoCobrar` | R483 monto (los 10 casos) |
| M14 | fundida: modelo sin el `?? gestion.tarifaModelo` | R483 monto (los 4 casos del nuevo que dependen del extra: entregado, reprogramado, novedad, incidente) |
| M15 | fundida: `ingresoTotal` cae al `montoCobrar` aparte si el bloque es `null` | R489 fundida (los 5 casos) |
| M16 | fundida: quitar `if (admin) return …` | R487 (31) |

### Salidas

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0 (0 errores, 251 avisos preexistentes; ninguno nuevo en los archivos de esta
  tanda: el único en `DescargarGestionesModeloNuevo.test.tsx`, `_recorte` línea 166, es anterior).
- `pnpm exec vitest run tests/components/descarga tests/unit/descarga` + paginación transversal,
  frontera de la descarga detallada, `DineroIdentidadesEnPantalla`, `CierreBodegaDesglosePorTienda`,
  `DetalleCierreDinero`, `cifras-cierre-bodega`, `detalle-cierre-vista`: 84 archivos, 955 tests, 955
  passed (incluye `columnas-sensibles.guardia` y `ambito-columnas.guardia`, sin tocarlas).
- `./init.sh`: `INIT_EXIT=0` escrito en el log («== init OK ==»; gate rápido: typecheck, lint,
  related + disparadores, todas las guardias; `DATABASE_URL` de la desechable).

### Desviaciones

- Cuatro tests de componentes fuera de `tasks.md > Archivos esperados` afirmaban el libro de la
  satélite de antes (32/25/18 columnas, «Por tienda»): se actualizaron al contrato de R483–R486. Sin
  ellos el gate quedaba rojo. Total de archivos de la ficha: sigue bajo el 80 % del tope.
- Decisión técnica: la central sin `partesPorTienda` lanza «faltan las partes por tienda…» (mismo trato
  que «faltan las cifras…»), en vez de `?? []`. El servidor siempre las manda a la central (R487).
- `filaDescargaGestionFundida` no recibe audiencia (design): su fila sigue con las 31 claves y las
  cuatro de la empresa en `null` para la satélite; la columna no existe en su libro.

Veredicto T3: R483, R484, R485, R486, R489 y R487 (libro) con test literal y mutación que los mata.
