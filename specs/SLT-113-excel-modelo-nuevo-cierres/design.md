# SLT-113 «Excel del modelo nuevo de cierres» — design (S15a: hojas por gestión)

> Solo S15a: el nivel «Detalle · una fila por gestión». Lo de SLT-140 «Excel del modelo nuevo: hojas
> por cierre de mensajeros» y SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» no se
> diseña aquí. El MCP del grafo no tiene indexado este worktree: lo de abajo sale de Grep/Read.

## Lo que ya existe

Buscado en `feature_list.json`, `specs/` y el código: «Excel», «descarga», «hojasAdicionales»,
«filasDetalle», «tarifaModelo», «CierreGestionDescargaDTO», «rechazosDeTienda», «folioDe». Nada de
esto ya está hecho ni en vuelo en otra ficha; lo que hay se reusa:

- **La hoja fundida** (nivel «Detalle» de hoy): `findGestionesPorAlcanceCompleto`
  (`lib/repositories/CierresAdminRepository.ts`) y `findGestionesDeCierresBodegaCompleto`
  (`CierresBodegaAdminRepository.ts`) leen gestiones + `cierre_detail` en dos consultas y componen
  con el mismo `componerGestionesDescarga` → `toGestionDescargaDTO`. Los servicios aplican el tope
  `descargaConfig.MAX_FILAS` y, en `/cierres-admin`, `ocultarFulfillmentSiNoCentral` (F481). El
  cliente: `DescargarCierresButton` (nivel + selector de columnas, ya conoce la audiencia
  `admin | satelite`) → `DescargarGestionesDialog` (mensajeros y rango) → `DescargarDatasetButton`.
- **Cifras del modelo nuevo por gestión: casi todas ya viajan en la hoja fundida.**
  `toGestionDescargaDTO` llama al mismo `toIngresoEmpresa` que el detalle, así que
  `ingresoEmpresa` ya trae `tarifaModelo`, `conceptosTarifa`, `ivaIncluido`, `fulfillmentConIva`,
  `ivaPctFulfillment` y cada concepto con su IVA. Corrige la frase de la v1 de `requirements.md`
  («no lleva ni `tarifaModelo`»). Lo que **falta** y sí lleva el detalle
  (`toPendienteRowDesdeSnapshot`): `pagoPorTarifa`, `ajustesPago`, `tarifaFaltante` y la fecha del
  cargo de fulfillment (`toIngresoEmpresa` la recibe por parámetro; la descarga no se la pasa y sale
  `null`). Los helpers ya existen: `toPagoPorTarifa`, `toAjustesPago`, `tarifaFaltanteDe`,
  `cargosFulfillmentVigentes` (SLT-101, SLT-110).
- **Modelo de un cierre:** `incluyeModeloNuevoDe` / `CONTEO_DETALLE_MODELO_NUEVO`
  (`lib/repositories/_shared/detalle-modelo-nuevo.ts`): un cierre es nuevo si tiene alguna fila de
  `cierre_detail` con `tarifa_modelo = 'nuevo'`.
- **Rechazos de la tienda:** tabla `cierre_rechazo_tienda` (`cierreId`, descriptivos congelados,
  `rechazadoAt`, `motivo`; sin importes), con `RECHAZO_DE_TIENDA_SELECT`,
  `ORDEN_RECHAZOS_DE_TIENDA` y `toRechazoDeTienda` en `lib/utils/cierre-rechazo-tienda.ts`. Hoy solo
  la lee el detalle de un cierre.
- **Folio:** `folioDe(id)` = últimos 8 del id en mayúsculas
  (`components/private/cierres/detalle/detalle-cierre-vista.ts`). El DTO de la hoja fundida no lleva
  `cierreId` a propósito (R42 de la feature 230).
- **Señales:** `senalesDe` / `textoSenales` (`components/private/cierres/fila/fila-gestion-vista.ts`),
  ya usado por la columna «Señales» de la descarga de un cierre (R91 de SLT-101). Hoy pide un
  `CierreDetalleGestion` entero aunque solo lee seis campos.
- **Texto de una tarifa:** `MONTO_FIJO`, `porcentajeDe`, `origenDe` en `fila-gestion-labels.ts` (lo
  que dice «Ver cómo se calculó»).
- **Generador y control:** `construirDescarga` (`lib/utils/descarga-dataset.ts`) ya arma N hojas con
  `hojasAdicionales` y convierte importes con `celdaMonto` (único `Number(`, acepta negativos);
  pero el nombre de la hoja principal es siempre el `titulo`, que es también la base del nombre de
  archivo. `DescargarDatasetButton` solo sabe pedir una hoja extra (`detalle` / `filasDetalle`).
- **Librería:** `exceljs`, aprobada (`docs/dependencias.md`). Ninguna nueva.

## Decisión técnica

### Servidor

**1. El DTO de la hoja fundida gana campos opcionales** (`CierreGestionDescargaDTO`,
`lib/interfaces/services/ICierresAdminService.ts`). Opcionales como los aditivos de SLT-101: el
mapper único los rellena siempre y un doble de test de hoy sigue valiendo. Ausentes = modelo viejo.

```ts
/** Folio del cierre al que pertenece la gestión: el mismo que la pantalla (`folioCierre`). */
folioCierre?: string;
/** R371: modelo del CIERRE (no de la fila): "nuevo" si alguna de sus filas congeladas lo es. */
cierreModelo?: "viejo" | "nuevo";
pagoPorTarifa?: PagoPorTarifaDTO | null;
ajustesPago?: AjustePagoGestionDTO[];
tarifaFaltante?: boolean;
/** Día calendario (zona de la empresa) del cargo vigente de fulfillment; solo central (F481). */
fulfillmentCargadoDia?: string | null;
```

Ninguno es un uuid ni toca la evidencia: la guardia de frontera lo sigue comprobando.

**2. Repositorio, lectura de gestiones** (`CierresAdminRepository.ts`, compartido por los dos):

- `GESTION_DESCARGA_SELECT` añade `ajustesPagoMensajero` y `pagosCongelados` (con su
  `where: { actor: "mensajero" }`), copiados de `GESTION_ADMIN_SELECT` por referencia a una
  constante común, no tecleados dos veces. Prisma los carga con una consulta por relación, no una
  por gestión.
- `toPagoPorTarifa`, `toAjustesPago` y `tarifaFaltanteDe` pasan a aceptar un `Pick` de la fila con
  los campos que leen (mismo cuerpo).
- `componerGestionesDescarga` recibe además `cargoPorOrden: ReadonlyMap<string, Date | null>`
  (obligatorio, como `intentosPorOrden`) y calcula, de las filas de `cierre_detail` que ya trae, el
  conjunto de `cierreId` con alguna `tarifaModelo === "nuevo"` (R371, mismo criterio que
  `incluyeModeloNuevoDe`). Para cada gestión: `folioCierre(g.cierreId)`, `cierreModelo`,
  `pagoPorTarifa`, `ajustesPago`, `tarifaFaltante` y `toIngresoEmpresa(g, d, cargo)`, con
  `cargo = cargoPorOrden.get(ordenId)` **solo si su cierre es nuevo** (`null` en el viejo);
  `fulfillmentCargadoDia = fechaCalendario(cargo, zona)` o `null`.
- Los dos `find…Completo` llaman a `cargosFulfillmentVigentes(prisma, idsNuevos)` **solo si
  `idsNuevos` no está vacío**. En prod (D19) no hay ninguno: cero consultas de más por cargos.

**3. Repositorio, rechazos de la tienda** (nuevo, uno por pantalla, mismo mapper):

- `findRechazosTiendaModeloNuevoCompleto(alcance, filtros, zona)` en `CierresAdminRepository` y
  `findRechazosTiendaDeCierresBodegaModeloNuevoCompleto(filtros, zona)` en
  `CierresBodegaAdminRepository`. Un `cierreRechazoTienda.findMany` con
  `where: { cierre: { <el MISMO criterio de cierre del find…Completo hermano>, AND: [...filtrosWhere(filtros), { detalle: { some: { tarifaModelo: "nuevo" } } }, { gestiones: { some: {} } }] } }`.
  `gestiones: { some: {} }` hace que el conjunto de cierres sea exactamente el de la hoja de
  gestiones (un cierre entra en esa hoja si tiene alguna gestión). El alcance va en el `WHERE`,
  nunca filtrado en memoria.
- `orderBy: [{ cierre: ORDEN_CIERRES_ADMIN }, ...ORDEN_RECHAZOS_DE_TIENDA]` (R373).
- Mapper `toRechazoTiendaDescargaDTO` exportado junto a `componerGestionesDescarga`:
  `{ folioCierre, numGuia, destinatario, motivo, tiendaNombre, fechaRechazo: fechaCalendario(rechazadoAt, zona) }`.
  Select = los campos de `RECHAZO_DE_TIENDA_SELECT` que usa + `cierreId`. Sin `gestionId`,
  `ordenId` ni importes.

**4. Servicios** (`listarGestionesCierresAdminCompleto`, `listarGestionesCierresBodegaCompleto`):
igual que hoy (puerta de rol, alcance, tope sobre el número de **gestiones**) y, después del tope,
SI alguna gestión trae `cierreModelo === "nuevo"`, llaman al método de rechazos y lo devuelven en
`rechazosDeTienda`. Si no, no lo llaman y la clave no va. En `/cierres-admin`, para un actor sin
acceso total, además de `ocultarFulfillmentSiNoCentral` se pone `fulfillmentCargadoDia: null`
(R376). La bodega ya es solo de acceso total.

**5. Folio en el servidor:** `lib/utils/folio-cierre.ts > folioCierre(id)` (puro, sin dominio).
`folioDe` de `detalle-cierre-vista.ts` pasa a devolver `folioCierre(id)`: una sola definición para
pantalla, comprobante y archivo.

### Contrato del control de descarga (compartido por ~30 tablas)

Dos campos **opcionales**; ausentes, todo sale exactamente como hoy.

- `lib/types/descarga.ts > DescargaConfig.tituloHoja?: string` — nombre de la hoja principal
  cuando no coincide con la base del nombre de archivo. `construirDescarga` usa
  `nombreHoja(config.tituloHoja ?? titulo)` donde hoy usa `nombreHoja(titulo)` (hoja única y libro;
  también en `nombresDeHojaUnicos`). El nombre de archivo sigue saliendo de `titulo`.
- `components/shared/DataTable.tsx > DescargaFilasResult` (rama `ok`):
  `libro?: { hojas: [DescargaHoja, ...DescargaHoja[]] }` — el libro entero, ya resuelto por el
  consumidor (nombres, columnas y filas). Sin dominio: hojas, columnas y filas.
- `DescargarDatasetButton`: si la respuesta trae `libro`, genera **siempre xlsx** con
  `{ tipo: "xlsx", titulo, tituloHoja: hojas[0].titulo, columnas: hojas[0].columnas, filas: hojas[0].filas, hojasAdicionales: hojas.slice(1) }`;
  las columnas del selector no se aplican a las hojas del libro. La comprobación de «sin filas»
  sigue mirando `filas`, y el consumidor que manda `libro` manda en `filas` las de la primera hoja.
  Sin `libro`, la rama de hoy sin cambiar una línea. Lo prueba un test que compara la llamada a
  `construirDescarga` con un literal, con y sin `libro`.

### Cliente de cierres

- **Módulo nuevo, puro** `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga.ts`
  (sin React, sin `.tsx`, sin `esCentral`: entra en la guardia de frontera):
  - columnas y proyección de «Gestiones» (`columnasGestionesModeloNuevoPara(audiencia)`,
    `filaGestionModeloNuevo(dto, audiencia)`) y de «Rechazados por la tienda»;
  - `libroGestiones({ items, rechazos, columnasAnterior, audiencia })`: devuelve `null` si ningún
    item es del modelo nuevo (R370) y si no, las hojas de R372 en su orden. «Gestiones modelo
    anterior» se proyecta con `filaDescargaGestionFundida` y `columnasAnterior` (las marcadas): el
    formato de hoy, no una copia.
  - Ningún importe se calcula: cada celda es el string del servidor (o el string con `-` delante para
    «Ajuste» que resta). El `Number(` sigue solo en `celdaMonto`.
- **`DescargarGestionesDialog.tsx`:** `obtenerFilas` llama una vez a la acción. Si la respuesta es
  `ok` y `libroGestiones` devuelve hojas → `{ status: "ok", filas: hojas[0].filas, libro: { hojas } }`.
  En cualquier otro caso → el camino de hoy, `filasDesdeResultado(…, filaDescargaGestionFundida)`,
  con los mismos mensajes. Prop nueva `audiencia?: AudienciaDescargaGestionesFundida`; ausente =
  `"satelite"` (falla cerrado, como `DescargarCierresButton`).
- **`DescargarCierresButton.tsx`:** pasa su `audiencia` al diálogo (una línea).
- **`fila-gestion-vista.ts`:** `senalesDe` y `textoSenales` aceptan
  `Pick<CierreDetalleGestion, "ajustesPago" | "resultado" | "indemnizacion" | "causaIncidente" | "esRechazoSla" | "tarifaFaltante">`.
  Mismo cuerpo; los llamadores de hoy siguen pasando el objeto entero. Audiencia de la hoja:
  `admin` → `"central"`, `satelite` → `"satelite"`.

### Hojas

**«Gestiones»**, en este orden (35 columnas para la central; la satélite, sin las tres marcadas †).
Importe = `formato: "monto"`. Origen = campo del DTO.

| # | Encabezado | Origen |
|---|---|---|
| 1 | Folio del cierre | `folioCierre` |
| 2 | Mensajero | `mensajeroNombre` |
| 3 | Fecha de gestión | `fechaGestion` |
| 4 | Nº Guía | `numGuia` |
| 5 | Nº Remisión | `numRemision` |
| 6 | Destinatario | `destinatario` |
| 7 | Tienda | `tiendaNombre` |
| 8 | Resultado | `resultado`, con el rótulo de la hoja de hoy |
| 9 | Motivo | `motivo` |
| 10 | Recibido | `montoRecibido` (importe) |
| 11-13 | Efectivo · SINPE · Transferencia | `pagos` por método, como `COLUMNAS_MEDIOS_PAGO` de la hoja de hoy (importe) |
| 14 | Flete por entregado | `ingresoEmpresa.flete` (importe) |
| 15 | Tarifa del flete | `conceptosTarifa[flete]` → texto de tarifa |
| 16 | IVA del flete | `ingresoEmpresa.ivaFlete` (importe) |
| 17 | Comisión COD | `ingresoEmpresa.comisionCod` (importe) |
| 18 | Tarifa de la comisión | `conceptosTarifa[comisionCod]` → texto de tarifa |
| 19 | IVA de la comisión | `ingresoEmpresa.ivaComisionCod` (importe) |
| 20 | Flete de no entregadas | `ingresoEmpresa.fleteDevolucion` (importe) |
| 21 | Tarifa del flete de no entregadas | `conceptosTarifa[fleteDevolucion]` → texto de tarifa |
| 22 | IVA del flete de no entregadas | `ingresoEmpresa.ivaFleteDevolucion` (importe) |
| 23 | Se le cobra a la tienda | `ingresoEmpresa.total` (importe) |
| 24 | De eso, IVA | `ingresoEmpresa.ivaIncluido` (importe) |
| 25 | Pago por tarifa | `pagoPorTarifa.importe` (importe) |
| 26 | Tarifa del pago | `pagoPorTarifa` → texto de tarifa |
| 27 | Ajuste | `pagoPorTarifa.ajuste`: `monto`, o `"-" + monto` si `signo === "resta"` (importe) |
| 28 | Pago al mensajero | `pagoMensajero` (importe) |
| 29 | Motivo del ajuste | último de `ajustesPago` → `motivo` |
| 30 | Ajustó | último de `ajustesPago` → `actorNombre` |
| 31 | Gana la bodega satélite | `ingresoBodegaRechazo` (importe) |
| 32 † | Fulfillment | `ingresoEmpresa.fulfillment` (importe) |
| 33 † | IVA de fulfillment | `ingresoEmpresa.ivaFulfillment` (importe) |
| 34 † | Fulfillment cargado el | `fulfillmentCargadoDia` |
| 35 | Señales | `textoSenales(dto, audiencia)` |

`null` → celda vacía, nunca 0 (R374). **Texto de tarifa** (R375, PA5 recomendada): `<rótulo> · <origen>`,
con rótulo `Monto fijo <money(valor)>` si `modo === "monto"` o `porcentajeDe(valor, base)` si es
porcentaje, y origen `origenDe(nivel, nombres)`: las mismas piezas que «Ver cómo se calculó».
Ejemplo: «Monto fijo ₡3.500 · grupo «San José centro» de la zona Centro».

**«Rechazados por la tienda»:** Folio (`folioCierre`) · Nº Guía · Destinatario · Motivo · Tienda ·
Fecha del rechazo (`fechaRechazo`). Siempre presente cuando hay cierres nuevos; sin rechazos, solo
encabezados.

**«Gestiones modelo anterior»:** la hoja de hoy (columnas marcadas, `filaDescargaGestionFundida`).

### Contrato I/O

```ts
// lib/interfaces/services/ICierresAdminService.ts
export interface RechazoTiendaDescargaDTO {
  folioCierre: string;
  numGuia: number | null;
  destinatario: string;
  motivo: string | null;
  tiendaNombre: string;
  /** Día calendario YYYY-MM-DD en la zona de la empresa. */
  fechaRechazo: string;
}
export type ListarGestionesDescargaServiceResult =
  | { status: "ok"; items: CierreGestionDescargaDTO[]; total: number;
      /** Presente solo si algún cierre del conjunto es del modelo nuevo. */
      rechazosDeTienda?: RechazoTiendaDescargaDTO[] }
  | { status: "limite_excedido"; total: number; limite: number }
  | { status: "forbidden" };
```

Los tipos de borde `ListarGestionesCierresAdminCompletoResult` (`lib/types/cierres-admin.ts`) y su
gemelo de bodega (`lib/types/cierre-bodega.ts`) pasan a ser
`ListarCompletoResult<CierreGestionDescargaDTO>` con la misma `rechazosDeTienda?` en su rama `ok`
(un tipo declarado una vez en `ICierresAdminService.ts` e importado por los dos). Las Server Actions
no cambian: ya devuelven lo que da el servicio. Entrada, `filtrosDescargaGestionesSchema`, igual.

## Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migración, ni `down.sql`. Todo es lectura de lo congelado
(D5). Lo que se lee (`gestion_orden`, `cierre_detail`, `cierre_rechazo_tienda`, los pagos
congelados y los ajustes del pago que ya lee el detalle, y los movimientos de fulfillment) ya lleva
`organizacion_id` y RLS por empresa; las consultas nuevas pasan por el mismo cliente de Prisma con
la empresa de la sesión que las de hoy.

## Autorización y módulo

Las mismas puertas que la hoja de hoy, sin ninguna nueva:

- `/cierres-admin`: `resolveAlcance(actor)` en el servicio; el alcance va en el `WHERE` de las dos
  consultas (gestiones y rechazos). `adminSatelite` sin zona → conjunto vacío sin consultar.
- Cierres de bodega: `esAccesoTotal` antes del repositorio; si no, `forbidden`.
- Fulfillment (F481): anulado en el servidor para quien no es acceso total (R376) y retirado de las
  columnas en el cliente.
- Las Server Actions resuelven el actor antes de validar, como hoy. Ninguna ruta de `app/api`.

Módulo: el de cierres, que ya gobierna estas pantallas; no hay interruptor nuevo.

## Datos que dependen del país

- **Moneda:** los importes van como número de Excel `#,##0.00`, sin símbolo (como hoy). El único
  símbolo está dentro del texto de tarifa, con `money()` de `lib/config/moneda` (el de la pantalla).
- **Zona horaria:** las fechas se serializan en el servidor con la zona del país de la empresa
  (`zonaDeLaEmpresa`, SLT-42), como `fechaGestion` hoy.
- **Impuestos:** el IVA de cada concepto es el congelado al solicitar; no se recalcula.
- Métodos de pago: los de `COLUMNAS_MEDIOS_PAGO` de la hoja de hoy.

## Alternativas descartadas

1. **Calcular en el navegador lo que falta** (pago por tarifa, ajuste firmado, señales a partir de
   la fila) desde `ingresoEmpresa`. Descartada: las cifras tienen que ser las mismas que la pantalla
   y salir del servidor; además el navegador no tiene `pagosCongelados` ni el cargo de fulfillment.
2. **Una segunda Server Action para los rechazos.** Descartada: es una puerta más con su propia
   resolución de alcance, y el conjunto de cierres tendría que repetirse a mano en el cliente. Va en
   la misma respuesta, leído con el mismo criterio de cierre.
3. **Generalizar `detalle` del control a N hojas con su selector cada una**
   (`DataTableDescarga.detalles[]`). Descartada: el documento nuevo fija sus columnas, así que no
   hay preferencias que guardar; y cambiaría el selector de las tablas que usan `detalle` hoy. El
   libro resuelto por el consumidor es más pequeño y no toca a nadie más.
4. **Cambiar el genérico `ListarCompletoResult<T>`** para que lleve hojas extra. Descartada: lo
   usan ~25 descargas; el campo opcional solo en el tipo de esta descarga no les toca.
5. **Usar el primer título de hoja como base del nombre de archivo** (sin `tituloHoja`). Descartada:
   el archivo pasaría de «Gestiones de cierres…» a «Gestiones…» solo porque hay un cierre del
   modelo nuevo, y R372 pide el mismo nombre.

## Dependencias de terceros

Ninguna nueva. `exceljs` ya aprobada.

## Verificación

**Integración contra Postgres real** (`tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts`),
patrón de SLT-101/SLT-110: empresa propia en transacción revertida, `describe.skip` visible sin
base, fallo ruidoso sin catálogos, sin `return` temprano. Corpus (zona Centro = alcance de la
satélite S; zona Norte fuera de su alcance):

- **N1** cierre del día, mensajero M1, zona Centro, modelo nuevo, id que acaba en `abcd1234`:
  - gestión **A**, entrega, pedido 25 000,00 con comisión, cobrado en efectivo 25 000,00: flete
    monto 3 500,00 + IVA 13 % (nivel grupo «San José centro», zona Centro), comisión 2 % (nivel
    zona) + IVA 13 %, fulfillment 600,00 + IVA 13 %; pago congelado del mensajero monto 2 500,00
    (nivel zona) y de la satélite 900,00 (señuelo); un ajuste 2 500,00 → 1 800,00 de «Ana Pérez»
    con motivo «Ruta corta»; un cargo de fulfillment el 2026-11-06 a las 20:30 de Costa Rica
    (02:30 UTC del 07);
  - gestión **B**, novedad: flete de no entregadas monto 1 500,00 + IVA 13 %, sin pago congelado del
    mensajero;
  - rechazo de la tienda **R1** (rechazado el 2026-11-05 a las 21:00 de Costa Rica, motivo «No
    lo pidió»).
- **V1** cierre del día, mensajero M2, zona Centro, modelo viejo: gestión **C** (como la C de
  SLT-110) y rechazo **R2** (señuelo: es de un cierre viejo).
- **N2** cierre nuevo de la zona Norte con rechazo **R3** (señuelo de alcance para S).
- **N3** cierre nuevo de la zona Centro solicitado fuera del rango con rechazo **R4** (señuelo del
  recorte de fechas).
- Para bodega: **N1** consolidado en un cierre de bodega; **N4** nuevo sin consolidar con rechazo
  **R5** (señuelo).

Literales a mano (T0.2 los comprueba leyendo, no ejecutando, `derivarIngresoOrden`; si uno no casa,
se para y se reporta):

- A: `folioCierre` «ABCD1234»; `cierreModelo` nuevo; flete 3500.00, IVA 455.00; comisión 500.00,
  IVA 65.00; `total` 4520.00; `ivaIncluido` 520.00; fulfillment 600.00, IVA 78.00;
  `fulfillmentCargadoDia` «2026-11-06»; `pagoPorTarifa.importe` 2500.00 con ajuste `{ resta, 700.00 }`;
  `pagoMensajero` 1800.00; último ajuste «Ruta corta» / «Ana Pérez»; `tarifaFaltante` false.
- B: flete de no entregadas 1500.00, IVA 195.00; `total` 1695.00; `ivaIncluido` 195.00;
  `pagoPorTarifa` null; `tarifaFaltante` true.
- C: `cierreModelo` viejo; `fulfillmentCargadoDia` null; `pagoPorTarifa` null.
- Rechazos con el alcance de la central y sin rango: [R1]; con S: [R1]; con un rango que deja fuera
  N3: R4 no está; R2, R3 (para S) y R5 no salen nunca. R1: Folio «ABCD1234», fecha «2026-11-05».
- Paridad (R374): para A y B, `ingresoEmpresa`, `pagoPorTarifa`, `ajustesPago` y `tarifaFaltante`
  de la descarga son `toEqual` a los de `findCierreByIdEnAlcance` sobre N1.
- Con solo V1 en el conjunto: ninguna consulta a `orden_fulfillment_movimiento`. Durante toda la
  lectura, ningún `INSERT`/`UPDATE`/`DELETE`.

**Mutaciones que deben poner rojo el test** (se anotan en `progress/impl_SLT-113.md`): quitar
`detalle: { some: { tarifaModelo: "nuevo" } }` del `where` de rechazos; quitar el alcance de ese
`where`; quitar `filtrosWhere`; clasificar el cierre por su primera fila en vez de por «alguna»;
no pasar el cargo a `toIngresoEmpresa`; quitar el filtro `actor = mensajero` de `pagosCongelados`.

**Unitarios y componentes:** columnas y celdas de las tres hojas contra literales escritos a mano
(nunca con `textoSenales`, `money` ni la función que los produce); el diálogo y el control con
`construirDescarga` espiado, comparando su configuración con un literal; el generador con
`tituloHoja`.

**E2E** (`e2e/cierres-rediseno.spec.ts`, describe nuevo): la central descarga «Detalle» en
`/cierres-admin` con el escenario de un cierre viejo y uno nuevo; lee con ExcelJS los nombres de las
hojas («Gestiones», «Rechazados por la tienda», «Gestiones modelo anterior»), los encabezados de
«Gestiones» y, en la fila de la gestión del cierre nuevo, «Se le cobra a la tienda» y «Pago al
mensajero» como número con sus literales del escenario. Antes del PR, `cierres-rediseno` entero y
el grupo `dinero` en local.

## Riesgos

- **Dos consultas más por relación en la hoja de hoy** (ajustes y pagos congelados) también para el
  modelo viejo. Son por lote, no por gestión; el tope de filas no cambia.
- **Un cierre con rechazos y sin ninguna gestión** no aparece en la hoja de hoy ni en la nueva. Se
  conserva a propósito: el conjunto es el de las gestiones.
- **Selector de columnas en el libro nuevo:** lo marcado solo vale para «Gestiones modelo anterior»
  (PA6).
