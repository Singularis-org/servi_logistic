# SLT-240 — Moneda del país en pantallas: órdenes, novedades e incidentes · design

> Alcance, «Lo que NO entra» y decisiones cerradas en `requirements.md`; aquí solo va el cómo. Las
> referencias `R<n>` son las de `requirements.md`. Rebanada 2 de 8 del corte de SLT-235; el patrón
> (proveedor, hook, censo) es el de `specs/SLT-235-moneda-pais-pantallas/design.md` §6–§8.

## Lo que ya existe

Busqué el 2026-11-20 con `moneda`, `formatMonto`, `money(`, `moneyTope`, `montoExacto`, `₡`, `CRC`,
`IVA`, `PriceLabel`, `etiquetas-pdf`, `indemnizacion` e `IMPUESTO_ROTULO` en tres sitios:
- `feature_list.json`, en todos los estados;
- `specs/`;
- el código.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» (`done`, en `dev`) | `providers/MonedaDelPaisProvider.tsx`, `hooks/use-moneda-del-pais.ts` (`useMonedaDelPais`, `useImpuestoDelPais`), censo de R18 en `tests/components/moneda-del-pais-pantallas.test.tsx` | Se **reutiliza** entero: los dos hooks en cada pantalla, y sus archivos entran en el censo. No se toca el proveedor ni el layout. |
| `PriceLabel` ya en la moneda del país (SLT-235 T3.1) | `components/shared/PriceLabel.tsx` | El listado de órdenes (`ordenes-columns.tsx`) ya pinta sus cuatro importes con él: **R1 ya se cumple** y solo gana test. Ese archivo se toca solo por sus rótulos (R16). |
| Tarjetas del mensajero ya en la moneda del país (SLT-235 T3.2) | `PosOrderCardDetalle`, `PosOrderCardMosaico`, `pos-format.ts` | Las novedades montan esas tarjetas (`NovedadesModule.tsx` + `novedad-a-orden-card.ts`): **R8 ya se cumple** y solo gana test. |
| Encabezados de nivel por país en el listado y su descarga (SL-20) | `ordenesColumnsDe(etiquetas)` (memo por objeto), `COLUMNAS_DESCARGA_ORDENES` con encabezados neutros + `columnasDescargaOrdenes(etiquetas)` | Es el **patrón** de R16: una base con el rótulo de caída y una función que pone el del país. Se sigue igual para el impuesto (§5). |
| SL-21 «Moneda e impuestos configurables por país» | `lib/config/moneda.ts` (`FormatoMoneda`, `formatearMontoEn`, `MONEDA_PLATAFORMA`, `formatearTopeEn` sin exportar); `lib/pdf/etiquetas-dibujo.ts` y `etiquetas-pdf-lote.ts` con `moneda?` | Se reutiliza `formatearMontoEn`. `formatearTopeEn` **se exporta** (§3). El dibujo ya recibe la moneda; lo que cambia es que deja de ser opcional (§6). |
| PDF de etiquetas por API en la moneda del país (SL-21 R14) | `EtiquetasLotePdfService`, `lib/pdf/etiquetas-pdf-lote.ts` | No se toca: ya pasa la moneda del puerto a `drawEtiqueta`. Es la referencia de R6. |
| Lista de excepciones de `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` (tope 19) | **No tiene ninguna entrada a nombre de SLT-240.** SLT-235 design §8 preveía `etiquetas-dibujo.ts` → SLT-240, pero no estaba en la lista: desde SL-21 no tiene literales. Esta ficha no baja nada y el tope sigue en 19 (R19). `FichaQueLoRetira` conserva `SLT-240` hasta la última rebanada (decisión P2). La guardia solo mira `lib/**`, `app/api/**` y `page`/`layout` de `app/`; ningún archivo de este alcance tiene hoy un literal ahí. |
| SLT-238 «Carga de órdenes con céntimos según la moneda del país» (`pending`) | `feature_list.json` | Es dueña de los céntimos al teclear y de la regla de redondeo de la carga. Esta ficha no cambia ni una ni otra (R17): solo cómo se **pintan** los importes. |
| SLT-241 a SLT-246 | `feature_list.json` | Rebanadas hermanas. Los rótulos «IVA» de órdenes no eran de ninguna; el humano los mete aquí (decisión P1). |

No apareció ninguna ficha ni código que ya resuelva lo que falta: R2–R7, R9–R11 y R16.

## 1. Resumen

1. `lib/config/moneda.ts` exporta `formatearTopeEn(moneda, max, sinMonto)` para el tope de la
   indemnización (R10).
2. Cada pantalla de órdenes, incidentes y registro de acciones lee `useMonedaDelPais()` y llama a
   `formatearMontoEn` (o a `formatearTopeEn`) con esa moneda (R2–R5, R9–R11).
3. El PDF de etiquetas del navegador recibe la moneda del modal, y el dibujo compartido deja de tener
   moneda por defecto (R6, R7, R14).
4. Los rótulos «Flete + …» y «Comisión + …» de órdenes salen de un módulo con el nombre del impuesto
   que da `useImpuestoDelPais()` (R16).
5. Los archivos tocados entran en el censo de SLT-235 R18 (R18).

## 2. Modelo de datos

No hay tabla, columna, migración ni política nueva. No hay operación nueva ni ruta nueva.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda | `pais.moneda_*` → `PaisDTO.moneda` → layout del portal → `MonedaDelPaisProvider` (SLT-235) | `useMonedaDelPais()` en cada componente de §4 |
| Nombre del impuesto | `pais.impuesto_nombre` → `PaisDTO.impuestoNombre` → el mismo proveedor | `useImpuestoDelPais()` en `OrdenesModule` y `CorregirUbicacionAviso` (§5) |
| Caídas | `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO` | Los hooks sin proveedor (R13) y `paisParaPantallasDelActor` si la lectura falla (SLT-235) |
| Escala de presentación exacta | `ESCALA_PRESENTACION` (2) | La tabla del monto redondeado (§4, R3) |

Ninguna pantalla de esta ficha es de servidor fuera del layout, así que nadie llama aquí a
`paisParaPantallasDelActor`: todas son componentes cliente bajo el proveedor del portal.

## 3. Formateador de topes con moneda (R10)

`formatearTopeEn` ya existe en `lib/config/moneda.ts` (SL-21), pero sin exportar. Se exporta y gana un
valor por defecto para `sinMonto`, como `formatearMontoEn`:

```ts
export function formatearTopeEn(moneda: FormatoMoneda, max: string | null, sinMonto: string = SIN_MONTO): string;
```

- **Cuerpo sin cambios:** corta la cola a `moneda.decimales` sin mirar el sobrante. Así nunca queda por
  encima del tope. Con la moneda de prueba (0 decimales), `"9999999999.99"` da `€9 999 999 999`, por
  debajo de lo que acepta el validador (R10). Con `MONEDA_PLATAFORMA` da lo mismo que `formatMontoTope`.
- **Su comentario decía «no se exporta: un camino público más tendría que entrar en el censo de la
  guardia 359».** Se cumple: la guardia 359
  (`tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`) gana un caso para él en el
  `it` de «`moneyTope` comparte el aspecto pero NUNCA queda por encima»:
  - con `MONEDA_PLATAFORMA` es byte a byte `formatMontoTope` en todo el corpus;
  - con `MONEDA_DE_PRUEBA`, lo pintado, recompuesto, es menor o igual que la entrada.
- `CAMINOS_PUBLICOS` sigue en 7: ese contador es el de los formateadores de redondeo al más cercano, y
  el de topes ya se prueba aparte, como `moneyTope`.

## 4. Importes en pantalla (R1–R5, R8–R11)

Cada componente cliente lee `const moneda = useMonedaDelPais()` y la pasa a funciones puras que la
reciben como argumento. Ninguna función de módulo lee el hook. El marcador de «sin importe» es el de
hoy en cada pantalla.

| Archivo | Hoy | Cambio |
|---|---|---|
| `app/(app)/ordenes/_components/ordenes-columns.tsx` | `PriceLabel` (ya en la moneda del país) | Ninguno en importes (R1 solo gana test); sus rótulos, en §5 |
| `app/(app)/ordenes/_components/OrdenesCargaResumen.tsx` | `formatMonto(row.montoCobrar)` | `formatearMontoEn(moneda, row.montoCobrar)`. Las columnas ya se arman dentro del componente. Sin monto, `SIN_MONTO` (`-`), el default (R2). |
| `app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla.tsx` | `montoExacto` (reexport de `DesglosePagoField`) | `const exacta = useMemo(() => ({ ...moneda, decimales: ESCALA_PRESENTACION }), [moneda])` y `formatearMontoEn(exacta, row.original)` / `row.aplicado`. Ver la nota de R3 abajo. |
| `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx` | `importe(u, campo)` con `money` | `importe(u, campo, moneda)` con `formatearMontoEn(moneda, u[campo], SIN_MONTO_RAYA)`. La rama `u.tarifa === "sin_tarifa"` va primero, como hoy (R4). Sus rótulos, en §5. |
| `app/(app)/ordenes/_components/EtiquetaGuia.tsx` | `formatMonto(montoCobrar)` | `formatearMontoEn(moneda, montoCobrar)`, con el mismo `-` (R5). |
| `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx` | `descargarEtiquetasPdf(etiquetas, qr, hoja)` | Lee el hook y pasa `moneda` como cuarto argumento (§6). |
| Novedades (`NovedadesModule.tsx`) | `PosOrderCardDetalle` / `PosOrderCardMosaico` (ya en la moneda del país) | **Ninguno** (R8 solo gana test) |
| `app/(app)/incidentes/_components/IncidentesAdminModule.tsx` | `money(detalle.indemnizacion)`; `MONTO_AYUDA` y `MONTO_EXCEDE` constantes de módulo con `moneyTope` | `formatearMontoEn(moneda, detalle.indemnizacion, SIN_MONTO_RAYA)` (R9). Las dos constantes pasan a `montoAyuda(moneda)` y `montoExcede(moneda)`, exportadas, con `formatearTopeEn(moneda, INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA)` (R10). Los textos que las rodean no cambian (R17). Sigue importando `EstadoCierreBadge` de `cierre-detalle-shared`, pero ya no `money` ni `moneyTope`. |
| `app/(app)/incidentes/_components/IncidentesHistoricoTabla.tsx` | `columnasHistorico(onAbrir)` con `money` | `columnasHistorico(onAbrir, moneda)` con `formatearMontoEn(moneda, i.indemnizacion, SIN_MONTO_RAYA)` (R9). |
| `app/(app)/historico/acciones/_components/historial-acciones-columnas.ts` | `export const columnasHistorialAcciones` (constante) con `money(fila.monto)` | Pasa a `export function columnasHistorialAcciones(moneda: FormatoMoneda): Column<HistorialAccionDTO>[]`, con `formatearMontoEn(moneda, fila.monto, SIN_MONTO_RAYA)` (R11). |
| `app/(app)/historico/acciones/_components/HistorialAccionesModule.tsx` | `columns={columnasHistorialAcciones}` | `const columnas = useMemo(() => columnasHistorialAcciones(moneda), [moneda])`. |

**Nota de R3 (la tabla del monto redondeado).** La tabla existe para enseñar que un monto del archivo
con céntimos (`11898.81`) se guardó redondeado (`11899`). La feature 300 la pintó con `montoExacto`
porque un formateador que esconde la cola escribiría «de ₡11.899 a ₡11.899». Con la escala de la moneda
del país, una moneda de 0 decimales volvería a ese texto contradictorio. Por eso:
- la tabla usa el símbolo y los separadores del país;
- y fuerza la escala de presentación (2), que es la del dato.

Con CR (`decimales: 2`) es exactamente `montoExacto` (R12). Cómo se redondea en la carga no cambia:
es de SLT-238.

**Contrato de la sustitución.** `formatMonto(n)` = `formatearMontoEn(MONEDA_PLATAFORMA, n)`;
`money(s)` = `formatearMontoEn(MONEDA_PLATAFORMA, s, SIN_MONTO_RAYA)`; `moneyTope(s)` =
`formatearTopeEn(MONEDA_PLATAFORMA, s, SIN_MONTO_RAYA)`. Con el hook sin proveedor (`MONEDA_PLATAFORMA`)
cada pantalla pinta byte a byte lo de hoy (R13). Con `MONEDA_CR` también, porque es igual a
`MONEDA_PLATAFORMA` (SL-21 R9, R12).

**Importes de las descargas (R15).** `ordenes-descarga-columnas.ts`, `novedades-descarga-columnas.ts`,
`ayuda-descarga-columnas.ts`, `incidentes-descarga-columnas.ts` y
`historial-acciones-descarga-columnas.ts` emiten el importe crudo, sin formateador. Sus filas no se
tocan. Solo cambian dos encabezados de la de órdenes (§5).

## 5. Rótulos con impuesto de órdenes (R16)

Mismo patrón que los encabezados de nivel de SL-20: la base lleva el rótulo de caída y una función pone
el del país.

- **Módulo nuevo** `app/(app)/ordenes/_components/rotulos-con-impuesto.ts`, puro y sin React:

  ```ts
  export const rotuloFleteConImpuesto = (impuesto: string) => `Flete + ${impuesto}`;
  export const rotuloComisionConImpuesto = (impuesto: string) => `Comisión + ${impuesto}`;
  ```

  Es la única fuente de los dos textos para el listado, la descarga y el aviso. Así no pueden
  divergir, y ninguno de los tres archivos escribe «IVA».
- **Listado** (`ordenes-columns.tsx`):
  - `ordenesColumnsDe(etiquetas)` no cambia de firma. Sus columnas `flete` y `comision` toman el
    encabezado de `rotulo…ConImpuesto(IMPUESTO_ROTULO)`, que es la caída del hook.
  - Nueva `export function conImpuestoDelPais<T>(columnas: Column<T>[], impuesto: string): Column<T>[]`.
    Devuelve las columnas con `value` sustituido en las de id `flete` y `comision`; el resto, los mismos
    objetos. Un `impuesto` igual a `IMPUESTO_ROTULO` devuelve **el mismo arreglo**, y la tabla no ve
    columnas nuevas.
  - `OrdenesModule.tsx` la aplica una vez a lo que ya monta:
    `useMemo(() => conImpuestoDelPais(columnsProp ?? ordenesColumnsDe(etiquetas), impuesto), [...])`
    con `impuesto = useImpuestoDelPais()`. Cubre también el listado de `OrdenesListado.tsx`, que le pasa
    `ordenesColumnsReprogramadaDe(etiquetas)` por `columns`. `monitoreo/detalle-columnas.ts` y
    `recepcion-satelite/recibidas-columns.tsx` derivan de `ordenesColumnsDe` pero **quitan** `flete` y
    `comision`, así que no cambian.
- **Descarga** (`ordenes-descarga-columnas.ts`):
  - `COLUMNAS_DESCARGA_ORDENES` (contrato de claves y orden) toma los dos encabezados de
    `rotulo…ConImpuesto(IMPUESTO_ROTULO)`.
  - `columnasDescargaOrdenes(etiquetas, impuesto: string)` gana el segundo argumento, obligatorio, y
    sustituye los encabezados de `fleteConIva` y `comisionConIva` como ya hace con los de nivel.
  - `OrdenesModule.tsx` le pasa el hook.
  - Las claves (`fleteConIva`, `comisionConIva`) no cambian: son nombres internos (decisión heredada de
    SL-21) y el contrato de la preferencia de columnas guardada.
- **Aviso de cambio de ubicación** (`CorregirUbicacionAviso.tsx`): las constantes `AVISO_FILA_FLETE` y
  `AVISO_FILA_COMISION` se borran (ningún test las importa) y las dos filas pintan
  `rotulo…ConImpuesto(useImpuestoDelPais())`.
- **Sin «IVA» en el código (R16):** después del cambio, `ordenes-columns.tsx`,
  `ordenes-descarga-columnas.ts`, `CorregirUbicacionAviso.tsx` y `rotulos-con-impuesto.ts` no tienen
  `\bIVA\b` fuera de los comentarios. Lo comprueba un caso de `moneda-del-pais-ordenes.test.tsx` con
  `quitarComentarios`, con su contraprueba sobre una fuente inventada.
- **Con CR (R12) y sin proveedor (R13):** el nombre del impuesto es «IVA» (`impuestoNombre` de CR e
  `IMPUESTO_ROTULO`), así que los textos son los de hoy. `ordenes-columns.test.tsx`, `OrdenesPage.test.tsx`
  y `OrdenesDescargaColumnas.test.tsx` siguen esperando «Flete + IVA» sin cambiar.

## 6. PDF de etiquetas del navegador (R6, R7, R14)

```ts
// app/(app)/ordenes/_components/etiquetas-pdf.ts
export function buildEtiquetasPdf(etiquetas, qrCanvases, hoja, fuente, moneda: FormatoMoneda): jsPDF;
export async function descargarEtiquetasPdf(etiquetas, qrCanvases, hoja, moneda: FormatoMoneda): Promise<void>;

// lib/pdf/etiquetas-dibujo.ts — `moneda` deja de ser opcional
export function drawEtiqueta(doc, layout, etiqueta, raster, fuente, moneda: FormatoMoneda): void;
export function datosDeEtiqueta(etiqueta, moneda: FormatoMoneda): DatoEtiqueta[];
export function textosConFuenteEmbebida(etiqueta, moneda: FormatoMoneda): string[];
```

- **Moneda obligatoria (R14).** Es el mismo criterio que el archivo ya aplica a `hoja` y a `fuente`:
  con un default silencioso, un llamador que olvidara pasarla imprimiría con la moneda de la plataforma
  y nadie lo vería con CR. `importeDeEtiqueta(etiqueta, moneda)` queda como
  `formatearMontoEn(moneda, etiqueta.montoCobrar)`, sin `?? MONEDA_PLATAFORMA`, y el import de
  `MONEDA_PLATAFORMA` sale del archivo.
- `lib/pdf/etiquetas-pdf-lote.ts` (PDF por API) **no cambia**: su parámetro `moneda` tiene su propio
  default y siempre llega definido a `drawEtiqueta`. Ese default es del camino de servidor de SL-21.
- **Quién la da:** `EtiquetasGuiaModal` lee `useMonedaDelPais()` y la pasa a `descargarEtiquetasPdf`.
  `EtiquetaGuia` (la vista previa) la lee del mismo hook. Las dos están bajo el mismo proveedor, así
  que vista previa y PDF usan la misma moneda (R6).
- **Paridad (R6).** El importe del PDF sale de `importeDeEtiqueta`, el mismo para los dos generadores.
  `tests/unit/pdf/etiquetas-dos-generadores.test.ts` ya compara el PDF del navegador con el del lote;
  gana un caso con `MONEDA_DE_PRUEBA`. «€» lo cubre la fuente embebida (por eso es el símbolo de la
  moneda de prueba).
- **Fuente que no cubre el símbolo (R7).** No se añade código: `drawEtiqueta` ya llama a
  `exigirCobertura(fuente, monto, …)` antes de escribir un byte, y lanza `ErrorCaracterNoImprimible`.
  El modal ya lo convierte en `fraseCaracterNoImprimible` y no descarga nada. El test lo fija con una
  moneda cuyo símbolo la fuente no cubre.

## 7. Guardias (R16, R18, R19)

- **Censo de R18 de SLT-235** (`CENSO_MONEDA_DEL_PAIS` en
  `tests/components/moneda-del-pais-pantallas.test.tsx`). Gana estos archivos:
  - `app/(app)/ordenes/_components/OrdenesCargaResumen.tsx`
  - `app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla.tsx`
  - `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
  - `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
  - `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx`
  - `app/(app)/ordenes/_components/etiquetas-pdf.ts`
  - `app/(app)/ordenes/_components/OrdenesModule.tsx`
  - `lib/pdf/etiquetas-dibujo.ts`
  - `app/(app)/incidentes/_components/IncidentesAdminModule.tsx`
  - `app/(app)/incidentes/_components/IncidentesHistoricoTabla.tsx`
  - `app/(app)/historico/acciones/_components/historial-acciones-columnas.ts`
  - `app/(app)/historico/acciones/_components/HistorialAccionesModule.tsx`

  El censo prohíbe llamar a `money(` y `moneyTope(` vengan de donde vengan. Por eso
  `IncidentesAdminModule` e `IncidentesHistoricoTabla` dejan de importarlos de
  `cierre-detalle-shared`. La prueba «rojo si un archivo REAL del censo vuelve a un formateador
  implícito» recorre la lista entera y cubre los nuevos sin cambiarla.
- **Censo «sin IVA» de R16** (en `moneda-del-pais-ordenes.test.tsx`): los cuatro archivos de §5.
- **Censo de pantallas de dinero de la 359** (`tests/components/DineroIdentidadesEnPantalla.test.tsx`).
  `IncidentesAdminModule` y `OrdenesConMontoAjustadoTabla` están censados, y su prueba exige que usen
  el formateador compartido (`USA_EL_FORMATEADOR`). Hoy pasarían solo por el salto a un archivo que
  importa `money`, o sea por casualidad. Por eso el regex gana `formatearMontoEn` y `formatearTopeEn`.
  El test de «el tope anunciado es el que el validador acepta» pasa a leer `montoExcede(MONEDA_PLATAFORMA)`.
- **`ordenes-columnas-money-safe.guardia.test.ts`**: no cambia. Las celdas siguen pintando
  `row.fleteConIva` / `row.comisionConIva` con `PriceLabel`.
- **`pais-sin-literales`** (R19): sin cambios en la lista ni en el tope (19). La prueba es la guardia en
  verde y `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-240")` vacío. El tipo sigue
  admitiendo `SLT-240` (decisión P2: se limpia al cerrar la última rebanada).

## 8. Autorización y módulos

No hay operación, acción ni ruta nueva. La moneda y el impuesto llegan por el proveedor que monta el
layout del portal con la empresa que resolvió la sesión en el servidor (SLT-235 §9). Ninguna pantalla
lee el país por su cuenta (R18). Todo es núcleo: no hay puerta de módulo.

## 9. Mapa R → test

Archivo nuevo: `tests/components/moneda-del-pais-ordenes.test.tsx`. Cada caso se monta con
`MonedaDelPaisProvider` y `MONEDA_DE_PRUEBA` (impuesto «IGV»), con `MONEDA_CR` («IVA») y sin
proveedor. Los dobles de acciones y de `next/navigation` son los del test de SLT-235.

| R | Test |
|---|---|
| R1 | `moneda-del-pais-ordenes.test.tsx`: las celdas de `ordenes-columns` (monto, flete, fulfillment, comisión) con el proveedor de prueba = `formatearMontoEn(MONEDA_DE_PRUEBA, v)` |
| R2 | `moneda-del-pais-ordenes.test.tsx`: `OrdenesCargaResumen` con un lote doblado; celda de monto en «€» con espacio de miles; `null` → `-` |
| R3 | `moneda-del-pais-ordenes.test.tsx`: `OrdenesConMontoAjustadoTabla` con `11898.81` → `11899` y la moneda de prueba (0 decimales): `€11 898.81` y `€11 899`, textos distintos |
| R4 | `moneda-del-pais-ordenes.test.tsx`: `CorregirUbicacionAviso` con flete y comisión en la moneda de prueba, y una ubicación `sin_tarifa` que sigue diciendo «Sin tarifa configurada» |
| R5 | `moneda-del-pais-ordenes.test.tsx`: `EtiquetaGuia` con el proveedor de prueba; `montoCobrar: null` → `-` |
| R6 | `tests/unit/pdf/etiquetas-dos-generadores.test.ts`: caso con `MONEDA_DE_PRUEBA`, importe del PDF del navegador = el del lote = `formatearMontoEn(MONEDA_DE_PRUEBA, v)`. `tests/components/EtiquetasGuiaModal.test.tsx`: dentro del proveedor de prueba, `descargarEtiquetasPdf` se llama con `MONEDA_DE_PRUEBA` como cuarto argumento. `tests/components/EtiquetaGuiaPreview.test.tsx`: paridad vista previa ↔ PDF con la moneda de prueba |
| R7 | `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts`: una moneda cuyo símbolo la fuente embebida no cubre → `ErrorCaracterNoImprimible` antes de escribir |
| R8 | `moneda-del-pais-ordenes.test.tsx`: `PosOrderCardDetalle` con `novedadAOrdenCard(novedad)` dentro del proveedor de prueba |
| R9 | `moneda-del-pais-ordenes.test.tsx`: detalle de `IncidentesAdminModule` y columna de `IncidentesHistoricoTabla` con la moneda de prueba; `null` → `—` |
| R10 | `moneda-del-pais-ordenes.test.tsx`: la ayuda y el error del formulario con el proveedor de prueba dicen `€9 999 999 999`, y lo recompuesto pasa `montoValido(…, INDEMNIZACION_MONTO_MAX)`. `tests/unit/config/moneda-formato-pais.test.ts`: `formatearTopeEn` con 0 decimales nunca queda por encima. Guardia 359: igual a `formatMontoTope` con la moneda de la plataforma |
| R11 | `moneda-del-pais-ordenes.test.tsx`: `columnasHistorialAcciones(MONEDA_DE_PRUEBA)` pinta el monto en «€»; `monto: null` → `—` |
| R12 | `moneda-del-pais-ordenes.test.tsx`: cada caso de R1–R11 y R16 con `MONEDA_CR` («IVA») da el mismo texto que sin proveedor. Y los tests de esas pantallas siguen verdes sin cambiar ningún valor esperado: `IncidentesAdminModule.test.tsx` (el literal `₡9.999.999.999,99`), `OrdenesCargaResumen.test.tsx`, `OrdenesCargaPreview.test.tsx`, `EtiquetaGuia.test.tsx`, `etiquetas-pdf.test.ts`, `ordenes-columns.test.tsx`, `OrdenesPage.test.tsx`, `OrdenesDescargaColumnas.test.tsx` y la lista de 22 encabezados de `ordenes-descarga-columnas.test.ts` |
| R13 | `moneda-del-pais-ordenes.test.tsx`: sin proveedor, cada pantalla = `formatearMontoEn(MONEDA_PLATAFORMA, v)` y los rótulos con `IMPUESTO_ROTULO` |
| R14 | `tests/unit/components/etiquetas-pdf.test.ts`: `// @ts-expect-error` en una llamada a `buildEtiquetasPdf` y a `drawEtiqueta` sin moneda; el typecheck lo hace cumplir |
| R15 | Los tests de descarga existentes sin cambios en sus filas (`historial-acciones-descarga-columnas.test.ts` solo cambia la forma de pedir las columnas de pantalla). El reviewer comprueba en el diff que de los `*-descarga-columnas.ts` solo cambia `ordenes-descarga-columnas.ts`, y solo en sus encabezados |
| R16 | `moneda-del-pais-ordenes.test.tsx`: con el proveedor de prueba, el encabezado de las columnas `flete`/`comision` del listado montado por `OrdenesModule` es «Flete + IGV» / «Comisión + IGV»; las filas del aviso dicen lo mismo; censo «sin IVA» de los cuatro archivos de §5 con su contraprueba. `tests/unit/components/ordenes-descarga-columnas.test.ts`: `columnasDescargaOrdenes(ETIQUETAS_XA, "IGV")` cambia solo esos dos encabezados, y `conImpuestoDelPais(cols, IMPUESTO_ROTULO)` devuelve el mismo arreglo |
| R17 | `IncidentesAdminModule.test.tsx` sigue esperando el literal entero «(10 dígitos y 2 decimales)…» sin cambios; el reviewer comprueba que no cambia ningún «IVA» fuera de los tres archivos de §5 |
| R18 | `moneda-del-pais-pantallas.test.tsx > censo de R18` con los 12 archivos de §7 |
| R19 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` en verde sin cambios, y en `moneda-del-pais-ordenes.test.tsx` `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-240")` = `[]` y `TOPE_EXCEPCIONES` ≤ 19 |

## 10. Riesgos

- **Firmas que cambian y arrastran tests.** Cambian cuatro firmas:
  - `columnasHistorialAcciones` pasa de constante a función;
  - `MONTO_AYUDA` y `MONTO_EXCEDE` pasan a funciones;
  - `columnasDescargaOrdenes` gana el impuesto;
  - la moneda es obligatoria en el PDF.

  El typecheck señala cada llamante. Los tests que solo cambian la forma de llamar pasan
  `MONEDA_PLATAFORMA` o `IMPUESTO_ROTULO` y no cambian ningún valor esperado (R12, R13). Están en
  `tasks.md > Archivos esperados`.
- **Memo de las columnas del listado.** `ordenesColumnsDe` memoriza por objeto de etiquetas para que la
  tabla no vea columnas nuevas en cada render. `conImpuestoDelPais` corre dentro de un `useMemo` sobre
  `[base, impuesto]`, y con el rótulo de la plataforma devuelve la misma base. El impuesto solo cambia
  al recargar el layout.
- **`EtiquetaGuia` fuera del portal.** Hoy solo la monta el modal, que vive en el portal. Si se montara
  en `/paquete` u otra página sin proveedor, pintaría con la moneda de la plataforma (R13), como el
  resto de componentes de SLT-235.
- **Tope con 0 decimales.** El mensaje dice `€9 999 999 999 (10 dígitos y 2 decimales)`: el número
  queda por debajo de lo que se acepta (lado seguro) y la frase sobre los decimales sigue siendo
  verdad para lo que se teclea, hasta que SLT-238 decida otra cosa (R17).

## 11. Alternativas descartadas

1. **Pintar la tabla del monto redondeado a la escala de la moneda del país.** Es lo uniforme, pero
   con una moneda de 0 decimales devolvería «de €11 899 a €11 899», el texto que la feature 300 vino a
   matar. La tabla trata de un dato con escala 2; por eso se pinta a esa escala (§4, R3).
2. **Una celda `<MontoDelPais valor>` con el hook dentro, para no cambiar `columnasHistorialAcciones`
   ni `columnasHistorico`.** Ahorra tres tests tocados, pero esconde la moneda dentro de un
   componente que lee un contexto. Así las funciones de columnas dejan de ser puras y probables sin
   React. La decisión cerrada pide la moneda explícita. Se descarta.
3. **Construir el tope con `formatearMontoEn` sobre el máximo ya recortado a mano en la pantalla.** No
   toca `lib/config/moneda.ts`, pero copia la regla «nunca al alza» fuera del módulo de moneda. La
   ficha 359 cerró justo eso (un formateador con cuerpo propio por pantalla). Se exporta el que ya
   existe.
4. **Dejar `moneda?` opcional en `drawEtiqueta` con caída a la de la plataforma.** Cuesta tres tests
   menos (`etiquetas-capacidad`, `etiquetas-caracter-no-cubierto`, `etiquetas-diseno-353`), pero
   deja un default silencioso justo en el camino que imprime papel. Es el fallo mudo contra el que ese
   archivo ya protege `hoja` y `fuente`.
5. **`ordenesColumnsDe(etiquetas, impuesto)` con el impuesto obligatorio.** Es la forma más explícita,
   pero obliga a tocar `monitoreo/detalle-columnas.ts`, `recepcion-satelite/recibidas-columns.tsx`,
   `OrdenesListado.tsx` y sus cuatro tests (unos 8 archivos más, por encima del tope de 40). Además
   esos dos derivados quitan justo las columnas con impuesto. Se aplica el impuesto en
   `OrdenesModule`, el único sitio que monta esas columnas, con el patrón de SL-20 para la descarga.

## 12. Tamaño

Ver `tasks.md > Tamaño`: 35 archivos (16 de producción, 19 de tests), el 87,5% del tope de 40. El
humano aceptó pasar del 80% al meter los rótulos (decisión P1).

## Dependencias de terceros

Ninguna nueva.
