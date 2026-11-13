# SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» — design (S15b)

> Solo el nivel «Resumen» de cierres del día (mensajeros) en `/cierres-admin`. El MCP del grafo no
> tiene indexado este worktree (`index_status`: proyecto no encontrado): lo de abajo sale de
> Grep/Read sobre el worktree, más `specs/SLT-139-pago-independiente-satelite/` leído en su worktree.

## Lo que ya existe

Buscado en `feature_list.json`, `specs/` y el código: «Pago entregado», «pagoEntregado»,
«cifrasModeloNuevo», «partesPorTienda», «netoEmpresa», «obtenerFilas», «libro», «conPendiente»,
«derivarPendienteCierre». Nada de esto está hecho ni en vuelo en otra ficha salvo lo anotado; lo que
hay se reusa:

- **El «Resumen» de hoy:** `cierres-admin-descarga-columnas.ts` (columnas y `filaDescargaCierrePendiente`
  / `filaDescargaCierreHistorico`), montado por `descargaColaCierres` (`CierresAdminModule.tsx:310`)
  y `descargaHistoricoCierres` (`CierresAdminHistoricoLista.tsx:105`) con
  `filasDesdeResultado(descargarDatos("listar{Pendientes|Historico}CierresAdminCompleto", …))`.
  `DescargarCierresButton` pasa `resumen.obtenerFilas` tal cual a `DescargarDatasetButton`: hoy el
  consumidor NO conoce las columnas marcadas (las aplica el control).
- **Servidor del «Resumen»:** `listarPendientesCierresAdminCompleto` / `listarHistoricoCierresAdminCompleto`
  (`CierresAdminService.ts:705-773`): `resolveAlcance` → `findColaCompleta` / `findHistoricoCompleto`
  con el alcance en el `WHERE` → tope `descargaConfig.MAX_FILAS` → `conPendiente`. `conPendiente`
  (`:1316`) ya lee en lote, una vez por listado, los pagos vigentes (`sumarVigentesPorCierre`), los
  premios vivos (`sumarPremiosVivosPorCierre`) y las señales (`contarSenalesPorCierre`, con
  `pagosAjustados`). Cada fila trae `incluyeModeloNuevo` (R371) y `pendientePagoMensajero`.
- **Cifras por cierre:** solo las deriva `verCierreDetalle` (`CierresAdminService.ts:883-1081`) sobre
  `found.gestiones` (`CierreGestionPendienteRow[]`), con `totalesIngresoEmpresa`, `facturadoSinIva`,
  `ivaFacturado`, `gananciaEmpresa`, `pagoTiendaEmpresa`, `cobradoSobreRecaudado`, `netoEmpresa`,
  `ganaLaTienda` y `partesPorTienda` (`lib/utils/ingreso-empresa.ts`, `lib/utils/iva-cierre.ts`). Las
  gestiones salen de `findCierreByIdEnAlcance` (`CierresAdminRepository.ts:1765`): `gestionOrden` con
  `GESTION_ADMIN_SELECT` + `cierreDetail` + `toPendienteRowDesdeSnapshot`. La fecha del cargo de
  fulfillment que también pide no entra en ninguna cifra (solo en `fulfillmentCargadoAt`).
- **Lo pendiente:** `derivarPendienteCierre` (`lib/utils/pendiente-cierre.ts`), fuente única. SLT-139
  (PR #149, puede no estar en `dev`) le añade `pagadoPorSatelite` como unión discriminada y lo cablea
  en `conPendiente` (`specs/SLT-139-pago-independiente-satelite/design.md > 5.1, 5.3`).
- **«Pago entregado» en pantalla:** `pagoEntregadoDe` (`components/private/cierres/cola/cola-cierres-vista.ts:143`)
  pinta «Liquidado» / «Pendiente X» a partir de `pendientePagoMensajero`; solo central y en
  «Resueltos» (`columnasCola`). No hay ninguna cifra de «lo pagado».
- **Heredado de SLT-113** (`progress/features/SLT-113.md > Lo que heredan`): `DescargaFilasResult.libro`,
  `DescargaConfig.tituloHoja`, `folioCierre` (`lib/utils/folio-cierre.ts`), el patrón
  «clave extra en la rama `ok` solo si hay cierres nuevos» (`rechazosDeTienda`,
  `ConRechazosDeTiendaEnOk`), columnas en `*-descarga-columnas.ts` (`columnas-sensibles.guardia`).
- **Librería:** `exceljs`, aprobada. Ninguna nueva.

## Decisión técnica

### Servidor

**1. Compositor puro de cifras por cierre** — nuevo `lib/utils/cifras-cierre.ts`:

```ts
export interface SnapshotsCierre {
  totales: CierreTotales;            // general, efectivo, simpe, transferencia
  totalPagoMensajero: string;
  totalIngresoBodegaRechazos: string;
}
export interface CifrasCierre {
  totalesIngreso: TotalesIngresoEmpresa;
  ivaFacturado: string;
  ganancia: string;
  pagoTienda: string;
  cobradoSobreRecaudado: string;
  netoEmpresa: string;
  ganaLaTienda: string;
  partesPorTienda: ParteDeTienda[];
}
export function cifrasDelCierre(c: SnapshotsCierre, gestiones: ReadonlyArray<GestionDeTienda>): CifrasCierre;
```

Es el bloque de `verCierreDetalle:937-1020` movido tal cual (mismas funciones, mismo orden, mismos
argumentos). `verCierreDetalle` pasa a llamarlo y emite lo mismo que hoy: así pantalla y Excel salen
de UNA función y no pueden divergir. Los tests del detalle existentes siguen verdes sin tocarlos.

**2. «Pago entregado»** — en `lib/utils/pendiente-cierre.ts`, junto a la fuente única:

```ts
/** SLT-140 (R382): lo pagado al mensajero = (P + premios vivos) − pendiente. Nunca negativo. */
export function derivarPagoEntregadoCierre(input: PendienteCierreInput): string {
  const debido = round2(input.pagoDebido).add(round2(input.premiosVivos));
  return debido.sub(derivarPendienteCierre(input)).toFixed(2);
}
```

Misma entrada (`PendienteCierreInput`, con o sin la unión de SLT-139), así que no hay regla
duplicada: si SLT-139 añade lo pagado por la satélite, «Pago entregado» lo hereda. Como
`generado ≤ P`, el resultado está en `[0, P + premios]`. PA1 decide `P + premios` frente a `P`.

**3. Lectura en lote de gestiones** — `ICierresAdminRepository` gana un método **obligatorio**:

```ts
/**
 * SLT-140 (R383): las gestiones de varios cierres, con la MISMA forma que el detalle
 * (`toPendienteRowDesdeSnapshot`). Dos consultas para cualquier número de cierres. El alcance va en
 * el WHERE (relación `cierre`), además de los ids. Todo id pedido y en alcance sale en el mapa,
 * con `[]` si no tiene gestiones.
 */
findGestionesDeCierresEnAlcance(
  cierreIds: readonly string[],
  alcance: Alcance,
  zona: string,
): Promise<ReadonlyMap<string, CierreGestionPendienteRow[]>>;
```

Implementación en `CierresAdminRepository`: si `cierreIds` está vacío, devuelve un mapa vacío sin
consultar. Si no, `Promise.all` de
`gestionOrden.findMany({ where: { cierreId: { in: ids }, cierre: alcanceWhere(alcance) }, orderBy: { createdAt: "desc" }, select: GESTION_ADMIN_SELECT })`
y `cierreDetail.findMany({ where: { cierreId: { in: ids } }, select: DETALLE_ADMIN_SELECT })`; empareja
por `ordenId` dentro de cada cierre con `toPendienteRowDesdeSnapshot(g, d, zona, { cargoFulfillmentAt: null })`
y lanza `CierreDetalleFaltanteError` si falta la fila congelada (igual que el detalle). Sin
`cargosFulfillmentVigentes`: la fecha del cargo no entra en ninguna cifra. Sin firma de URLs. Mismo
orden que el detalle (`createdAt desc`) para que `partesPorTienda` empate igual.

Método obligatorio, no opcional (lección de SLT-123: un campo o método opcional que un camino no
puebla se lee en silencio como «no hay»). Los dobles que tipan la interfaz entera ganan un
`vi.fn()` que falla si se llama (T0.3 los cuenta).

**4. Servicio** — `listarPendientesCierresAdminCompleto` y `listarHistoricoCierresAdminCompleto`:
igual que hoy hasta el tope; después:

```ts
const { items, entregado } = await this.conPendienteYEntregado(conjunto, zona);
const nuevos = items.filter((c) => c.incluyeModeloNuevo === true);
if (nuevos.length === 0) return { status: "ok", items, total };            // R377, R383: cero consultas más
const gestiones = await this.repo.findGestionesDeCierresEnAlcance(nuevos.map(c => c.cierreId), scope.alcance, zona);
const central = esAccesoTotal(actor.rol);
return { status: "ok", items, total, cifrasModeloNuevo: nuevos.map((c) => toCifrasDescarga(c, gestiones.get(c.cierreId) ?? [], central ? entregado.get(c.cierreId) ?? null : null)) };
```

- `conPendienteYEntregado`: `conPendiente` partido en dos sin cambiar lecturas: una función privada
  `entradaPendiente(r, lecturas)` arma el `PendienteCierreInput` de cada fila aprobada (la misma que
  hoy, con lo de SLT-139 si ya está), y de ella salen `derivarPendienteCierre` (como hoy) y
  `derivarPagoEntregadoCierre`. `conPendiente` sigue devolviendo lo de hoy (página y detalle no
  cambian). Ninguna consulta nueva: los premios, pagos y lo pagado por la satélite ya se leen.
- `toCifrasDescarga` (privada) llama a `cifrasDelCierre(c, gestiones)` y proyecta al DTO de abajo.
- `esAccesoTotal(actor.rol)` es la misma puerta que usa F481 (`ocultarFulfillmentSiNoCentral`). La
  satélite recibe `pagoEntregado: null` (R382).
- El alcance de la lectura nueva es `scope.alcance`, el MISMO que acaba de dar el conjunto (no
  `alcanceDeLectura`, que el detalle ensancha a toda la empresa para la central): los ids y el
  `WHERE` dicen lo mismo.

### Contrato I/O

```ts
// lib/interfaces/services/ICierresAdminService.ts
export interface ParteDeTiendaDescargaDTO {
  tiendaNombre: string;
  recaudado: string;
  pagoTienda: string;
  ganaLaTienda: string;
}
/** SLT-140 (R379-R382): cifras de un cierre del modelo nuevo para la hoja «Cierres». Todo obligatorio. */
export interface CifrasCierreDescargaDTO {
  cierreId: string;              // une con el item (ya viaja en `CierreAdminResumen`); nunca es columna
  pagoTienda: string;
  ganaLaTienda: string;
  totalFacturado: string;        // totalesIngreso.total
  ivaFacturado: string;
  netoEmpresa: string;
  gestiones: number;             // gestiones.length del detalle
  pagoEntregado: string | null;  // null: no aprobado o no central
  partesPorTienda: ParteDeTiendaDescargaDTO[]; // en el orden del detalle, sin `tiendaId`
}
export interface ExtraCifrasModeloNuevo {
  /** Presente solo si algún cierre del conjunto es del modelo nuevo; uno por cierre nuevo, en el orden de `items`. */
  cifrasModeloNuevo?: CifrasCierreDescargaDTO[];
}
export type ConCifrasModeloNuevoEnOk<R> = R extends { status: "ok" } ? R & ExtraCifrasModeloNuevo : R;
export type ListarPendientesCierresAdminCompletoServiceResult =
  ConCifrasModeloNuevoEnOk<ListarCompletoServiceResult<CierreAdminResumen>>;
export type ListarHistoricoCierresAdminCompletoServiceResult =
  ConCifrasModeloNuevoEnOk<ListarCompletoServiceResult<CierreAdminResumen>>;
```

Opcional solo la CLAVE de la rama `ok` (como `rechazosDeTienda`): sin cierres nuevos no va, y las ~25
descargas que usan `ListarCompletoServiceResult` no cambian. Los tipos de borde de
`lib/types/cierres-admin.ts` replican la clave. Las Server Actions y sus schemas no cambian.

### Cliente

**`DescargarCierresButton.tsx`** — `DescargaResumenCierres` gana un campo opcional:

```ts
/** SLT-140: si está, el control lo llama con las columnas MARCADAS del «Resumen» en vez de `obtenerFilas`. */
obtenerFilasConColumnas?: (columnasMarcadas: DescargaColumna[]) => Promise<DescargaFilasResult>;
```

En «Resumen»: `obtenerFilas={resumen.obtenerFilasConColumnas ? () => resumen.obtenerFilasConColumnas(visibles) : resumen.obtenerFilas}`.
Sin el campo (bodega hasta SLT-141), la línea de hoy. «Detalle» no cambia.

**Módulos nuevos, puros** (sin React; entran en la guardia de frontera como el de SLT-113):

- `cierres-resumen-modelo-nuevo-descarga-columnas.ts`: `columnasCierresModeloNuevoPara(audiencia)`
  (20 columnas central, 19 satélite), `COLUMNAS_POR_TIENDA`, `filaCierreModeloNuevo(item, cifras, audiencia)`,
  `filasPorTienda(item, cifras)`.
- `cierres-resumen-modelo-nuevo-descarga.ts`: `libroResumenCierres({ items, cifras, columnasAnterior, filaAnterior, audiencia })`:
  `null` si `cifras` no viene o ningún item es nuevo (R377); si no, las hojas de R378 en su orden.
  «Cierres modelo anterior» = `columnasAnterior` + `filaAnterior` (la de la pestaña:
  `filaDescargaCierrePendiente` o `filaDescargaCierreHistorico`): el formato de hoy, no una copia. Un
  item nuevo sin su entrada en `cifras` es un error duro (no se degrada a viejo en silencio).
- `obtenerResumenCierres(accion, filaAnterior, columnasMarcadas, audiencia)`: una llamada a la
  acción; si `ok` y `libroResumenCierres` da hojas → `{ status: "ok", filas: hojas[0].filas, libro: { hojas } }`;
  si no, `filasDesdeResultado` con la misma respuesta (mensajes de hoy).

**`CierresAdminModule.tsx` / `CierresAdminHistoricoLista.tsx`:** `descargaColaCierres(filtros, audiencia)`
y `descargaHistoricoCierres(filtros, audiencia)` añaden `obtenerFilasConColumnas`; `titulo`, `columnas`,
`ambitoColumnas` y `obtenerFilas` siguen igual.

### Hojas

**«Cierres»** (importe = `formato: "monto"`; `null` → celda vacía):

| # | Encabezado | Origen |
|---|---|---|
| 1 | Folio | `folioCierre(item.cierreId)` |
| 2 | Mensajero | `item.mensajeroNombre` |
| 3 | Destino | `destinoCierre(item)` (la de hoy) |
| 4 | Estado | `ESTADO_LABEL[item.estado]` (la de hoy) |
| 5 | Solicitado | `fechaDiaInstanteCR(item.solicitadoAt, ZONA_CR)` (la de hoy) |
| 6 | Resuelto | ídem con `resueltoAt`; vacío si `null` |
| 7-9 | Efectivo · SINPE · Transferencia | `item.totales.{efectivo,simpe,transferencia}` |
| 10 | Recaudado | `item.totales.general` |
| 11 | Se le paga a la tienda | `cifras.pagoTienda` |
| 12 | Gana la tienda en total | `cifras.ganaLaTienda` |
| 13 | Pago al mensajero | `item.totalPagoMensajero` |
| 14 | Pago a la bodega satélite | `item.totalIngresoBodegaRechazos` |
| 15 | Total facturado | `cifras.totalFacturado` |
| 16 | IVA facturado | `cifras.ivaFacturado` |
| 17 | Le queda a la empresa | `cifras.netoEmpresa` |
| 18 | Gestiones | `cifras.gestiones` (entero) |
| 19 | Pagos ajustados | `item.senalesCola?.pagosAjustados` (entero; vacío si ausente) |
| 20 † | Pago entregado | `cifras.pagoEntregado` (solo central) |

**«Por tienda»:** Folio (`folioCierre`) · Tienda (`tiendaNombre`) · Recaudado · Se le paga hoy
(`pagoTienda`) · Gana en total (`ganaLaTienda`), una fila por parte, en el orden del DTO.

## Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migración, ni `down.sql`. Todo es lectura de lo congelado
(D5). `gestion_orden`, `cierre_detail`, `cierre_dia` y los libros de pagos ya llevan
`organizacion_id` y RLS por empresa; la consulta nueva va por el mismo cliente de Prisma con la
empresa de la sesión.

## Autorización y módulo

- Las mismas puertas que el «Resumen» de hoy: `resolveAlcance(actor)` antes del repositorio;
  `forbidden` y `sinZona` como hoy (sin zona, conjunto vacío: ni cifras ni consultas).
- La consulta nueva repite el alcance en su `WHERE` (`cierre: alcanceWhere(alcance)`) además de los
  ids: un id fuera de alcance no devuelve gestiones aunque se pase a mano (R383).
- «Pago entregado»: `esAccesoTotal(actor.rol)` en el servidor; la satélite recibe `null` y su hoja no lleva
  la columna (R382). Fallo cerrado en el cliente: lo que no es `admin` es `satelite`.
- Ninguna ruta de `app/api`; módulo de cierres, sin interruptor nuevo.

## Datos que dependen del país

- **Moneda:** importes como número de Excel `#,##0.00`, sin símbolo (`celdaMonto`, como hoy).
- **Zona horaria:** «Solicitado» y «Resuelto» con el mismo helper que la hoja de hoy
  (`fechaDiaInstanteCR(…, ZONA_CR)`), para que R377 y la hoja nueva digan el mismo día. Pasar a la
  zona de la empresa es de la deuda de SLT-81, no de esta ficha.
- **Impuestos:** IVA congelado; no se recalcula. Métodos de pago: los tres de `CierreTotales`.

## Archivos compartidos con otras fichas

| Archivo | SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» | SLT-139 «Pago al mensajero independiente del efectivo: satélite» |
|---|---|---|
| `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx` | Usa `obtenerFilasConColumnas` (lo crea SLT-140) | — |
| `lib/utils/pendiente-cierre.ts` (+ su test) | Usa `derivarPagoEntregadoCierre` para la central | Cambia la entrada (`pagadoPorSatelite`) |
| `lib/services/CierresAdminService.ts` (`conPendiente`) | — | Cablea lo pagado por la satélite |
| `lib/utils/cifras-cierre.ts` | Puede reusar el compositor | — |
| `lib/interfaces/services/ICierresAdminService.ts` | Puede reusar `CifrasCierreDescargaDTO` / `ConCifrasModeloNuevoEnOk` | — |
| `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga.ts` | Puede reusar `obtenerResumenCierres` | — |
| `e2e/cierres-rediseno.spec.ts`, `e2e/_escenarios/cierres.ts` | Añade su `describe` | — |
| `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts` | Añade su módulo | — |

**Orden de merge propuesto:** #149 (SLT-139) → SLT-140 → SLT-141. SLT-141 se rebasa sobre SLT-140 y
consume lo de arriba sin redefinirlo.

## Alternativas descartadas

1. **Llamar a `verCierreDetalle` (o `findCierreByIdEnAlcance`) por cada cierre.** Descartada: N+1
   (cinco consultas por cierre más la firma de URLs) y R383 lo prohíbe.
2. **Calcular las cifras en el navegador** desde los totales de la fila. Descartada: la fila no trae
   las gestiones ni sus conceptos, y R380 pide la cifra del servidor; dos cálculos acaban divergiendo.
3. **Añadir las cifras a cada `CierreAdminResumen`** (página incluida). Descartada: cobraría la
   lectura de gestiones en cada página de la cola, que no las pinta; y un campo opcional en la fila
   compartida es el error de SLT-123.
4. **Una Server Action nueva para las cifras.** Descartada: otra puerta con su propia resolución de
   alcance, y el conjunto se repetiría en el cliente. Va en la misma respuesta, como los rechazos de
   SLT-113.
5. **«Pago entregado» = Σ pagos vigentes del cierre.** Descartada: no cuenta lo que el efectivo ya
   cubrió en la regla vieja ni lo pagado por la satélite (SLT-139), y no sale de la fuente única;
   `(P + premios) − pendiente` sí.
6. **Pasar las columnas marcadas cambiando la firma de `DataTableDescarga.obtenerFilas`.** Descartada:
   la usan ~30 tablas. El campo opcional solo en `DescargaResumenCierres` no les toca.

## Dependencias de terceros

Ninguna nueva. `exceljs` ya aprobada.

## Verificación

**Integración contra Postgres real** (`tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts`),
patrón de SLT-113: empresa propia en transacción revertida, `describe.skip` visible sin base, fallo
ruidoso sin catálogos, sin `return` temprano. Corpus (zona Centro = alcance de la satélite S; zona
Norte fuera):

- **N1** cierre del día, `bodega_central`, modelo nuevo, aprobado, `pago_independiente_efectivo = true`,
  id que acaba en `abcd1234`, snapshots: efectivo 70 000,00 · SINPE 30 000,00 · transferencia 0,00 ·
  general 100 000,00 · `total_pago_mensajero` 3 000,00 · `total_ingreso_bodega_rechazos` 500,00.
  - **G1** «Tienda Norte», entrega, cobrada 70 000,00 en efectivo + 30 000,00 por SINPE: flete 4 000,00
    + IVA 520,00; comisión 1 000,00 + IVA 130,00; un ajuste de pago.
  - **G2** «Tienda Sur», novedad: flete de no entregadas 2 000,00 + IVA 260,00.
  - Un pago vigente al mensajero de 1 200,00; ningún premio.
- **N2** igual que N1 pero `solicitado` (sin pendiente).
- **V1** cierre viejo de la zona Centro (señuelo de modelo).
- **N3** cierre nuevo de la zona Norte (señuelo de alcance para S).
- **S1** cierre nuevo de satélite, zona Centro (para la audiencia satélite).

Literales a mano (T0.2 los comprueba leyendo, no ejecutando; si uno no casa, PARA):

| Cifra de N1 | Valor |
|---|---|
| Se le paga a la tienda | 100 000,00 − 4 520,00 − 1 130,00 = **94 350,00** |
| Total facturado | 4 520,00 + 1 130,00 + 2 260,00 = **7 910,00** |
| IVA facturado | 520,00 + 130,00 + 260,00 = **910,00** |
| Gana la tienda en total | 100 000,00 − 7 910,00 = **92 090,00** |
| Le queda a la empresa | 7 910,00 − 910,00 − 3 000,00 − 500,00 = **3 500,00** |
| Gestiones / Pagos ajustados | **2** / **1** |
| Pendiente / Pago entregado | 3 000,00 − 1 200,00 = **1 800,00** / 3 000,00 − 1 800,00 = **1 200,00** |
| Por tienda | Tienda Norte 100 000,00 · 94 350,00 · 94 350,00; Tienda Sur 0,00 · 0,00 · **−2 260,00** (sumas 100 000,00 · 94 350,00 · 92 090,00) |

Comprobaciones:

- **Paridad con la pantalla (R380, R381):** para N1 y N2, cada campo de `cifrasModeloNuevo` es igual
  al de `verCierreDetalle` sobre el mismo cierre (`pagoTienda`, `ganaLaTienda`, `totalesIngreso.total`,
  `ivaFacturado`, `netoEmpresa`, Σ de `grupos`, y `partesPorTienda` sin `tiendaId`), y a los literales.
  `pagosAjustados` igual al de la página de la cola; `pendientePagoMensajero` del item = 1 800,00.
- **Alcance (R383):** con S, `cifrasModeloNuevo` solo trae S1 (nunca N3); `findGestionesDeCierresEnAlcance`
  llamado a mano con el id de N3 y el alcance de S devuelve un mapa sin N3.
- **Consultas (R383):** con `$on("query")` (o espía sobre los delegados de Prisma), el número de
  consultas de `listarHistoricoCierresAdminCompleto` es el mismo con 1 y con 3 cierres nuevos; con
  solo V1 es igual al de hoy (medido en T0.4) y `gestionOrden.findMany` no se llama. Ninguna
  sentencia `INSERT`/`UPDATE`/`DELETE` durante la lectura.
- **Audiencia (R382):** con S, `pagoEntregado` es `null` en todas las entradas.

**Mutaciones que deben poner rojo** (en `progress/impl_SLT-140.md`): quitar `cierre: alcanceWhere(...)`
del `where` nuevo; pedir las gestiones por cierre en bucle; clasificar por la fila en vez de
`incluyeModeloNuevo`; `pagoEntregado` sin la puerta `esAccesoTotal`; `derivarPagoEntregadoCierre`
sin los premios; `cifrasDelCierre` con `pagoTienda` desde `totalesIngreso.total`.

**Unitarios y componentes:** `cifrasDelCierre` y `derivarPagoEntregadoCierre` contra literales (incluido
el caso con premio de PA1 y el viejo `min(P, E)`); columnas y celdas de las dos hojas contra literales
escritos a mano (nunca con la función que los produce); el control y los dos constructores con
`construirDescarga` espiado y comparado con un literal: viejo → la llamada de hoy sin claves nuevas
(R377), nuevo y mixto → libro (R378), satélite → 19 columnas.

**E2E** (`e2e/cierres-rediseno.spec.ts`, describe nuevo): la central descarga «Resumen» en «Resueltos»
con un cierre viejo y uno nuevo; lee con ExcelJS los nombres de las hojas («Cierres», «Por tienda»,
«Cierres modelo anterior»), los encabezados de «Cierres» y, en la fila del nuevo, «Le queda a la
empresa» y «Pago entregado» como número con sus literales. Antes del PR, `cierres-rediseno` entero y el
grupo `dinero` en local.

## Riesgos

- **Dos consultas más en el «Resumen» cuando hay cierres nuevos**, de tamaño proporcional a sus
  gestiones (hasta `MAX_FILAS` cierres). Por lote, no por cierre. Con D19, cero en prod hoy.
- **Conflicto con SLT-139** en `pendiente-cierre.ts` y `conPendiente` si se implementan a la vez (PA3).
- **Refactor de `verCierreDetalle`:** mover el bloque a `cifrasDelCierre` puede cambiar un orden de
  operaciones. Lo cubren los tests del detalle existentes sin tocar sus aserciones.
