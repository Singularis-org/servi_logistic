# SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» — design (S15c)

> El MCP del grafo no tiene indexado este worktree (`index_status`: proyecto no encontrado): lo de
> abajo sale de Grep/Read sobre el worktree, y de los worktrees de SLT-139 «Pago al mensajero
> independiente del efectivo: satélite» (PR #149) y SLT-140 «Excel del modelo nuevo: hojas por
> cierre de mensajeros» (sin spec escrito todavía al redactar esto).

## Lo que ya existe

Buscado en `feature_list.json`, `specs/` y el código: «Por tienda», «Cierres modelo anterior»,
«incluyeModeloNuevo», «partesPorTienda», «paraLaCentral», «libro», «COLUMNAS_DESCARGA_BODEGA».
Aparecen SLT-140 (mensajeros, en vuelo, disjunta) y SLT-113 (nivel «Detalle», en dev). Nada de las
hojas por cierre de bodega está hecho ni en vuelo. Lo que se reusa:

- **Descargas de hoy (formato que R384 congela):** `cierres-bodega-descarga-columnas.ts`
  (`COLUMNAS_DESCARGA_BODEGA_PENDIENTES` / `_RESUELTOS` / `_SOLICITADOS` y sus `filaDescargaBodega*`).
  Montaje: `descargaColaBodega` (`CierresBodegaAdminModule.tsx`), `descargaBodegaResueltos`
  (`CierresBodegaResueltosLista.tsx`), los dos como `resumen` de `DescargarCierresButton`;
  `descargaBodegaSolicitados` (`CierresBodegaSolicitadosLista.tsx`), en un `DescargarDatasetButton`
  directo de `ConsolidacionBodegaModule.tsx` (sin selector de nivel, PA4).
- **Servidor de esas descargas:** `CierresBodegaAdminService.listarPendientesCierresBodegaCompleto` /
  `listarHistoricoCierresBodegaCompleto` (acceso total) y `CierreBodegaService.listarCierresBodegaSolicitadosCompleto`
  (`adminSatelite`, zona en el `WHERE` de `findCierresBodegaByZona`). Todas devuelven
  `CierreBodegaResumen`, que ya trae `incluyeModeloNuevo` (D40, una consulta por lectura en
  `aResumenRows`), `totales`, `totalPagoMensajero`, `totalIngresoBodegaRechazos`, `paraLaCentral`,
  `cantidadCierres`, la marca de conciliación y `faltaPorRecibir`.
- **Cifras agregadas del detalle de bodega:** `CierresBodegaAdminService.verCierreBodegaDetalle` las
  deriva de las gestiones de todos sus cierres del día con `totalesIngresoEmpresa`, `ivaFacturado`,
  `facturadoSinIva`, `netoEmpresa`, `ganaLaTienda`, `partesPorTienda` (`lib/utils/ingreso-empresa.ts`,
  `lib/utils/iva-cierre.ts`). Las gestiones salen de `findCierreBodegaConDetalle`, que lee **una
  consulta por cierre del día** (`GESTION_ADMIN_SELECT` + `DETALLE_ADMIN_SELECT` →
  `toPendienteRowDesdeSnapshot`). No sirve para N cierres de bodega: sería N×k lecturas.
- **Lectura en lote de gestiones congeladas:** `findGestionesDeCierresBodegaCompleto` (hoja fundida)
  lee todo el conjunto en consultas fijas, pero filtra por fecha de gestión y emite el DTO de
  descarga; no da `CierreGestionPendienteRow` ni `gestionesAjustadas`.
- **Pendiente de pago por cierre del día:** `derivarPendienteCierre` (`lib/utils/pendiente-cierre.ts`)
  con las lecturas por lista `sumarVigentesPorCierre`, `sumarPremiosVivosPorCierre` y, desde
  SLT-139, `sumarPagadoSatelitePorCierre` (patrón de `CierresAdminService.conPendiente`).
- **Libro y folio (SLT-113):** `DescargaFilasResult.libro`, `DescargaConfig.tituloHoja`,
  `folioCierre` (`lib/utils/folio-cierre.ts`; `folioDe(c.cierreBodegaId)` en la cola y el detalle).
- **Librería:** `exceljs`, aprobada. Ninguna nueva.

## Relación con SLT-140

SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» mergea antes. Al escribir esto su
spec no existe, así que este diseño **no depende de nombres suyos** y lo que puede compartirse se
comprueba en T0.1 tras rebasar:

- **Sin archivos de producción en común previstos.** Esta ficha toca solo lo de bodega
  (`CierresBodega*`, `CierreBodega*`, `cierre-bodega.ts`); SLT-140, lo de mensajeros
  (`CierresAdmin*`). Archivos de **test** compartidos casi seguros: `e2e/cierres-rediseno.spec.ts`,
  `e2e/_escenarios/cierres.ts` y `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`
  (cada ficha añade su describe o sus rutas; se rebasa sobre lo de SLT-140 sin tocar lo suyo).
- **Piezas de SLT-140 que se reusan si existen al rebasar:** (1) la proyección de «Por tienda»
  (columnas y fila; en bodega son las mismas cinco columnas sobre `ParteDeTienda`); (2) la derivación
  de «Pago entregado» por cierre del día (S15-PA4, `P − pendiente`); (3) el mecanismo de columnas
  marcadas para «Cierres modelo anterior» (PA3). Si existen, se importan y no se duplican. Si
  SLT-140 no las deja exportadas, se escriben aquí (en los archivos de abajo) y se anota.

## Decisión técnica

### Servidor

**1. Derivación agregada única** — `lib/utils/cifras-cierre-bodega.ts` (nuevo, puro):

```ts
export interface CifrasAgregadasBodega {
  totalesIngreso: TotalesIngresoEmpresa;
  ivaFacturado: string;
  ganancia: string;
  pagoTienda: string;
  cobradoSobreRecaudado: string;
  netoEmpresa: string;
  ganaLaTienda: string;
  partesPorTienda: ParteDeTienda[];
}
export function cifrasAgregadasBodega(
  resumen: Pick<CierreBodegaResumen, "totales" | "totalPagoMensajero" | "totalIngresoBodegaRechazos">,
  gestiones: GestionDeTienda[],
): CifrasAgregadasBodega;
```

Es el bloque «agregado de toda la bodega» de `verCierreBodegaDetalle` movido tal cual (mismas
funciones, mismo orden de argumentos, snapshots agregados como minuendo). `verCierreBodegaDetalle`
pasa a llamarla: detalle y descarga no pueden divergir. Los tests del detalle siguen verdes sin
tocar sus aserciones (comprobación de que el movimiento no cambió nada).

**2. Lectura en lote** — interfaz nueva `lib/interfaces/repositories/ICifrasBodegaLoteLectura.ts` e
implementación `lib/repositories/CifrasBodegaLoteRepository.ts`:

```ts
export interface CierreDiaDeBodegaLoteRow {
  cierreBodegaId: string;
  cierreDiaId: string;
  estado: CierreEstado;
  totalPagoMensajero: string;   // P, snapshot
  totalEfectivo: string;        // E, snapshot
  pagoIndependienteEfectivo: boolean;
  gestionesAjustadas: number;
  gestiones: CierreGestionPendienteRow[];
}
export interface ICifrasBodegaLoteLectura {
  /** Cierres del día (y sus gestiones congeladas) de los cierres de bodega `ids` DENTRO del alcance. */
  leerCierresDiaDeBodegas(
    ids: readonly string[],
    alcance: AlcanceLecturaBodega,
    zona: string,
  ): Promise<CierreDiaDeBodegaLoteRow[]>;
}
```

Todos los campos de la fila son **obligatorios**. Tres consultas, sea cual sea N (R389):

1. `cierreDia.findMany({ where: { cierreBodegaId: { in: ids }, cierreBodega: <alcance> }, select:
   { ...DETALLE_CIERRE_SELECT, cierreBodegaId, totalEfectivo, pagoIndependienteEfectivo, estado } })`.
   `<alcance>` = `{}` para acceso total y `{ zonaId }` para la satélite: el alcance va en el `WHERE`,
   no se filtra en memoria.
2. `gestionOrden.findMany({ where: { cierreId: { in: idsDia } }, orderBy: { createdAt: "desc" },
   select: GESTION_ADMIN_SELECT })` (Prisma carga sus relaciones con una consulta por relación, no por
   gestión).
3. `cierreDetail.findMany({ where: { cierreId: { in: idsDia } }, select: DETALLE_ADMIN_SELECT })`.

Composición con el mismo mapper que el detalle: `toPendienteRowDesdeSnapshot(g, d, zona, {
cargoFulfillmentAt: null })` y `toDetalleCierreRow` (exportados de `CierresBodegaAdminRepository.ts`,
hoy privados). El cargo de fulfillment no interviene en ninguna cifra de R387 (`totalesIngresoEmpresa`
no suma fulfillment), así que no se lee: una consulta menos. Fila congelada ausente → el mismo
`CierreDetalleFaltanteError` que el detalle. `ids` vacío → `[]` sin consultar.

**3. Servicios.** Tras el tope de filas de hoy y solo con los ids de `items` con
`incluyeModeloNuevo === true` (R384: sin ninguno, ni lectura ni clave):

- `CierresBodegaAdminService.listarPendientesCierresBodegaCompleto` y `listarHistoricoCierresBodegaCompleto`
  (alcance `toda_la_empresa`): `leerCierresDiaDeBodegas`, agrupa por `cierreBodegaId` y, por cierre de
  bodega, `cifrasAgregadasBodega(resumen, gestiones)`, `gestiones.length`, `Σ gestionesAjustadas` y,
  según PA1, `pagoEntregado`: con las tres lecturas por lista (`sumarVigentesPorCierre`,
  `sumarPremiosVivosPorCierre`, `sumarPagadoSatelitePorCierre` solo con los cierres del día con la
  marca) sobre **todos** los cierres del día del lote, una llamada cada una; por cierre del día
  `P − derivarPendienteCierre(...)` (o la pieza de SLT-140, T0.1), sumado con `Prisma.Decimal`;
  `null` si alguno no está `aprobado`.
- `CierreBodegaService.listarCierresBodegaSolicitadosCompleto` (alcance `{ lectura: "zona", zonaId }`):
  lo mismo **sin** `pagoEntregado` y sin las tres lecturas de pago (F481, R386): la clave no existe en
  su DTO.

Las dependencias nuevas entran por constructor, **opcionales** para no tocar los ~15 dobles de test
de hoy; con un cierre nuevo en el conjunto y la dependencia ausente, el servicio lanza (patrón
`LecturaPagadoSateliteAusenteError` de SLT-139), nunca devuelve el archivo sin cifras. Que producción
las pasa lo prueba un test de cableado sobre `lib/actions/cierre-bodega.ts` (memoria «el composition
root que no inyecta»).

### Contrato I/O

```ts
// lib/interfaces/services/ICierreBodegaService.ts
export interface CifrasCierreBodegaDescargaDTO {
  cierreBodegaId: string;
  gestiones: number;
  pagosAjustados: number;
  totalFacturado: string;   // totalesIngreso.total
  ivaFacturado: string;
  netoEmpresa: string;      // «Le queda a la empresa»
  ganaLaTienda: string;
  partesPorTienda: ParteDeTienda[];
}
/** Solo la central (F481): «Pago entregado» por cierre de bodega; null = alguno sin aprobar. */
export interface CifrasCierreBodegaCentralDescargaDTO extends CifrasCierreBodegaDescargaDTO {
  pagoEntregado: string | null;
}
```

La rama `ok` de los tres resultados gana `cifrasModeloNuevo?`, presente solo si algún cierre del
conjunto es nuevo: `CifrasCierreBodegaCentralDescargaDTO[]` en las dos de la central
(`ICierresBodegaAdminService.ts`) y `CifrasCierreBodegaDescargaDTO[]` en la de la satélite
(`ICierreBodegaService.ts`). En `lib/types/cierre-bodega.ts` los tres tipos de borde pasan a
`ConCifrasBodegaEnOk<ListarCompletoResult<CierreBodegaResumen>, …>`, gemelo del
`ConRechazosDeTiendaEnOk` de SLT-113. Las Server Actions no cambian: devuelven lo del servicio.
Entrada (`filtros`) igual.

### Cliente

- **Columnas** — `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
  (nuevo; `columnas-sensibles.guardia` exige las columnas en `*-descarga-columnas.ts`):
  `columnasCierresBodegaModeloNuevoPara(audiencia)`, `COLUMNAS_POR_TIENDA_BODEGA` (o la de SLT-140) y
  los encabezados literales.
- **Libro** — `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga.ts` (nuevo,
  puro, sin React ni `esCentral`; entra en la guardia de frontera):
  `libroCierresBodega({ items, cifras, anterior: { columnas, fila }, audiencia })` → `null` si ningún
  item tiene `incluyeModeloNuevo` (R384), o las hojas de R385 en orden. Junta cada item con su
  `cifras` por `cierreBodegaId`; un item nuevo sin cifras es un error (no se inventa una fila vacía).
  «Cierres modelo anterior» se proyecta con la `filaDescargaBodega*` de esa pestaña: el formato de hoy,
  no una copia. Ningún importe se calcula: cada celda es el string del servidor.
- **Pantallas** — `descargaColaBodega`, `descargaBodegaResueltos` y `descargaBodegaSolicitados`: su
  `obtenerFilas` llama una vez a la acción; si es `ok` y `libroCierresBodega` devuelve hojas →
  `{ status: "ok", filas: hojas[0].filas, libro: { hojas } }`; si no, el camino de hoy
  (`filasDesdeResultado(…, filaDescargaBodega*)`) sin cambiar una línea. Audiencia: la central pasa
  `"central"` (el módulo ya recibe `audiencia` resuelta con `esAccesoTotal`); «Solicitados» es siempre
  `"satelite"`.

### Hojas

Importe = `formato: "monto"` (`celdaMonto`, `#,##0.00`, negativos con signo). Fechas =
`fechaDiaInstanteCR(iso, ZONA_CR)`, como el archivo de bodega de hoy. Vacío = `null`.

**«Cierres»** (central: 26 columnas; satélite: 25, sin †):

| # | Encabezado | Origen |
|---|---|---|
| 1 | Folio | `folioCierre(cierreBodegaId)` |
| 2 | Bodega | `zonaNombre` |
| 3 | Destino | `destinoCierre` de un destino `bodega_central` (PA2) |
| 4 | Estado | `ESTADO_CONCILIACION_LABEL[estadoConciliacionDe(c)]`, como la columna «Estado» de hoy (PA2) |
| 5 | Solicitado | `solicitadoAt` (fecha) |
| 6 | Resuelto | `resueltoAt` (fecha o vacío) |
| 7 | Efectivo | `totales.efectivo` (monto) |
| 8 | SINPE | `totales.simpe` (monto) |
| 9 | Transferencia | `totales.transferencia` (monto) |
| 10 | Recaudado | `totales.general` (monto) |
| 11 | Debe llegar a la central | `paraLaCentral` (monto) |
| 12 | Gana la tienda en total | `cifras.ganaLaTienda` (monto) |
| 13 | Pago al mensajero | `totalPagoMensajero` (monto) |
| 14 | Pago a la bodega satélite | `totalIngresoBodegaRechazos` (monto) |
| 15 | Total facturado | `cifras.totalFacturado` (monto) |
| 16 | IVA facturado | `cifras.ivaFacturado` (monto) |
| 17 | Le queda a la empresa | `cifras.netoEmpresa` (monto) |
| 18 | Gestiones | `cifras.gestiones` (número) |
| 19 | Pagos ajustados | `cifras.pagosAjustados` (número) |
| 20 † | Pago entregado | `cifras.pagoEntregado` (monto o vacío; PA1) |
| 21 | Cierres incluidos | `cantidadCierres` (número) |
| 22 | Recibido | `montoRecibido` (monto o vacío) |
| 23 | Falta por recibir | `faltaPorRecibir` (monto) |
| 24 | Estado de conciliación | igual que «Estado» (PA2) |
| 25 | Conciliado por | `conciliadoPorNombre` |
| 26 | Conciliado el | `conciliadoAt` (fecha o vacío) |

**«Por tienda»:** Folio · Tienda (`tiendaNombre`) · Recaudado (`recaudado`) · Se le paga hoy
(`pagoTienda`) · Gana en total (`ganaLaTienda`), una fila por elemento de `cifras.partesPorTienda`
en el orden en que llega (el del detalle).

**«Cierres modelo anterior»:** el archivo de hoy de esa pestaña (PA3 para las columnas).

## Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migración, ni `down.sql`. Todo es lectura de lo congelado
(D5). Lo que se lee (`cierre_bodega`, `cierre_dia`, `gestion_orden`, `cierre_detail`, ajustes y pagos
congelados que ya lee `GESTION_ADMIN_SELECT`, `liquidacion_pago`, `pago_mensajero_movimiento`) lleva
`organizacion_id` y RLS por empresa; las consultas nuevas usan el mismo cliente de Prisma con la
empresa de la sesión.

## Autorización y módulo

Las puertas de hoy, ninguna nueva:

- Central: `esAccesoTotal` antes del repositorio (`forbidden` si no). Lectura en lote con alcance
  `toda_la_empresa`.
- Satélite: `rol === adminSatelite` y su zona leída de su usuario; sin zona, conjunto vacío sin
  consultar. La lectura en lote lleva `cierreBodega.zonaId` en el `WHERE` (R389).
- F481: la satélite no recibe `pagoEntregado` (no existe en su DTO) ni la columna (R386). Ninguna de
  las dos hojas lleva fulfillment.
- Módulo: el de cierres, que ya gobierna estas pantallas.

## Datos que dependen del país

- **Moneda:** importes como número `#,##0.00`, sin símbolo, como hoy.
- **Zona horaria:** las fechas, con `fechaDiaInstanteCR` como las columnas de fecha del archivo de
  bodega de hoy (R388 pide «como el archivo de hoy»).
- **Impuestos:** el IVA facturado es la suma del IVA congelado de cada concepto; no se recalcula.
- **Métodos de pago:** Efectivo, SINPE, Transferencia, los de `totales` (como «A consolidar» hoy).

## Alternativas descartadas

1. **Llamar a `verCierreBodegaDetalle` por cada cierre de bodega del conjunto.** Mismas cifras sin
   código nuevo, pero N×(2k+3) consultas y firma de evidencias que el archivo no usa. R389 lo prohíbe.
2. **Derivar en el navegador desde la hoja fundida** (gestiones → totales). Descartada: la fundida se
   recorta por fecha de gestión, no por cierre de bodega, y las cifras tienen que salir del servidor
   con las mismas funciones que la pantalla.
3. **Añadir el método de lote a `ICierresBodegaAdminRepository` e `ICierreBodegaRepository`.**
   Descartada: obliga a tocar ~15 dobles de test que no tienen nada que ver; una lectura propia y
   pequeña, inyectada en los dos servicios, la comparten las dos audiencias con el alcance como
   parámetro.
4. **Campos opcionales nuevos en `CierreBodegaResumen`** (cifras dentro de cada item). Descartada: ese
   tipo lo pintan las páginas, y cada página tendría que leer las gestiones o llevar campos a medio
   poblar; la clave aparte solo existe en la respuesta de la descarga.
5. **Leer el cargo de fulfillment en el lote.** Descartado: ninguna cifra de estas hojas lo usa.

## Dependencias de terceros

Ninguna nueva. `exceljs` ya aprobada.

## Verificación

**Integración contra Postgres real** (`tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts`),
patrón de SLT-113: empresa propia en transacción revertida, `describe.skip` visible sin base, sin
`return` temprano. Corpus (zona Centro = alcance de la satélite S; Norte fuera):

- **BN** cierre de bodega, zona Centro, modelo nuevo, id que acaba en `b0de9a01`, conciliado con
  `monto_recibido` 96 000,00 por «Ana Pérez» el 2026-11-06 a las 20:30 de Costa Rica (02:30 UTC del
  07). Consolida **D1** (mensajero M1, aprobado, `pago_independiente_efectivo = true`, P 3 000,00,
  ingreso de bodega 500,00) con:
  - **G1** entregada, tienda T1, efectivo 70 000,00, flete 4 000,00 + IVA 13 % 520,00; con un ajuste
    de pago;
  - **G2** entregada, tienda T2, SINPE 30 000,00, comisión 1 000,00 + IVA 130,00;
  - **G3** rechazo, tienda T1, flete de no entregadas 2 000,00 + IVA 260,00;
  - un `pago_satelite` de 3 000,00 contra D1 (SLT-139, R317).
- **BV** cierre de bodega Centro, modelo viejo (señuelo del caso mixto y de R384).
- **BZ** cierre de bodega Norte, modelo nuevo (señuelo de alcance para S).

Literales a mano (T0.2 los comprueba leyendo, no ejecutando, `derivarIngresoOrden` y las funciones de
`ingreso-empresa.ts`; si uno no casa, se para y se reporta). BN: Folio «B0DE9A01»; Recaudado
100 000.00; Efectivo 70 000.00; SINPE 30 000.00; Transferencia 0.00; Debe llegar a la central
96 500.00; Total facturado 7 910.00; IVA facturado 910.00; Le queda a la empresa 3 500.00
(7 910 − 910 − 3 000 − 500); Gana la tienda en total 92 090.00; Gestiones 3; Pagos ajustados 1;
Pago entregado 3 000.00; Cierres incluidos 1; Recibido 96 000.00; Falta por recibir 500.00; Estado
«Recibido incompleto»; Conciliado el «2026-11-06». Por tienda: T1 70 000.00 / 65 480.00 / 63 220.00;
T2 30 000.00 / 28 870.00 / 28 870.00 (Σ «Se le paga hoy» 94 350.00 = `pagoTienda` del detalle).
Son los números del escenario «cierre de bodega» del madre (`SLT-95 design.md > Números escritos a
mano`), repartidos en dos tiendas.

Comprobaciones:

- Paridad (R387): para BN, `cifrasAgregadasBodega` sobre el lote es `toEqual` a los campos
  correspondientes de `verCierreBodegaDetalle(BN)`, con la central y con S.
- Alcance (R389): con S y `ids = [BN, BZ]`, el lote solo trae D1; mutación «quitar `zonaId` del
  `where`» → rojo.
- Lecturas (R389): con 1 y con 3 cierres de bodega nuevos, el número de consultas a la base es el
  mismo (contador de `$on("query")` o del cliente de la transacción); ningún `INSERT`/`UPDATE`/`DELETE`.
- R384: con solo BV en el conjunto, la respuesta no lleva `cifrasModeloNuevo` y no hay consultas a
  `cierre_dia` por el lote.

**Mutaciones que deben poner rojo un test** (se anotan en `progress/impl_SLT-141.md`): quitar el
alcance del `where`; leer el lote sin filtrar por `incluyeModeloNuevo`; usar en `cifrasAgregadasBodega`
la suma de los cierres del día en vez del snapshot agregado; mandar `pagoEntregado` a la satélite;
proyectar «Cierres modelo anterior» con todas las filas (cierre en dos hojas).

**Unitarios y componentes:** columnas y celdas de las tres hojas contra literales escritos a mano
(nunca contra la función que los produce); las tres pantallas con `construirDescarga` espiado,
comparando su configuración con un literal, con y sin cierres nuevos.

**E2E** (`e2e/cierres-rediseno.spec.ts`, describe nuevo): la central descarga el «Resumen» de
«Conciliados» con un cierre de bodega viejo y uno nuevo; lee con ExcelJS los nombres de hoja
(«Cierres», «Por tienda», «Cierres modelo anterior»), los encabezados de «Cierres» y, en la fila del
nuevo, «Debe llegar a la central» y «Le queda a la empresa» como número con los literales del
escenario.

## Riesgos

- **Un cierre de bodega nuevo con muchas gestiones** pesa en la descarga (se leen todas sus
  gestiones). El tope de hoy cuenta cierres de bodega, no gestiones. En prod hoy no hay ninguno (D19);
  si crece, se mide antes de tocar el tope.
- **Asimetría honesta del detalle** (ficha 396): los agregados parten del snapshot agregado y «Por
  tienda» de las gestiones; si dejaran de coincidir, el archivo enseña el mismo descuadre que la
  pantalla. No se corrige aquí.
- **SLT-139 sin mergear al implementar**: `sumarPagadoSatelitePorCierre` no existiría. T0.1 lo
  comprueba; si falta, se para (PA1 no se implementa a medias).
