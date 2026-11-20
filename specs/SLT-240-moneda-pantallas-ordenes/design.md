# SLT-240 — Moneda del país en pantallas: órdenes, novedades e incidentes · design

> Alcance, «Lo que NO entra» y decisiones cerradas en `requirements.md`; aquí solo va el cómo. Las
> referencias `R<n>` son las de `requirements.md`. Rebanada 2 de 8 del corte de SLT-235; el patrón
> (proveedor, hook, censo) es el de `specs/SLT-235-moneda-pais-pantallas/design.md` §6–§8.

## Lo que ya existe

Busqué el 2026-11-20 con `moneda`, `formatMonto`, `money(`, `moneyTope`, `montoExacto`, `₡`, `CRC`,
`IVA`, `PriceLabel`, `etiquetas-pdf` y `indemnizacion` en tres sitios:
- `feature_list.json`, en todos los estados;
- `specs/`;
- el código.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» (`done`, en `dev`) | `providers/MonedaDelPaisProvider.tsx`, `hooks/use-moneda-del-pais.ts`, censo de R18 en `tests/components/moneda-del-pais-pantallas.test.tsx` | Se **reutiliza** entero: `useMonedaDelPais()` en cada pantalla y sus archivos entran en el censo. No se toca el proveedor ni el layout. |
| `PriceLabel` ya en la moneda del país (SLT-235 T3.1) | `components/shared/PriceLabel.tsx` | El listado de órdenes (`ordenes-columns.tsx`) ya pinta sus cuatro importes con él: **R1 ya se cumple**. Esta ficha solo añade su test. |
| Tarjetas del mensajero ya en la moneda del país (SLT-235 T3.2) | `PosOrderCardDetalle`, `PosOrderCardMosaico`, `pos-format.ts` | Las novedades montan esas tarjetas (`NovedadesModule.tsx` + `novedad-a-orden-card.ts`): **R8 ya se cumple**. Solo se añade su test. |
| SL-21 «Moneda e impuestos configurables por país» | `lib/config/moneda.ts` (`FormatoMoneda`, `formatearMontoEn`, `MONEDA_PLATAFORMA`, `formatearTopeEn` sin exportar); `lib/pdf/etiquetas-dibujo.ts` y `etiquetas-pdf-lote.ts` con `moneda?` | Se reutiliza `formatearMontoEn`. `formatearTopeEn` **se exporta** (§3). El dibujo ya recibe la moneda; lo que cambia es que deja de ser opcional (§5). |
| PDF de etiquetas por API en la moneda del país (SL-21 R14) | `EtiquetasLotePdfService`, `lib/pdf/etiquetas-pdf-lote.ts` | No se toca: ya pasa la moneda del puerto a `drawEtiqueta`. Es la referencia de R6. |
| Lista de excepciones de `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` (tope 19) | **No tiene ninguna entrada a nombre de SLT-240.** SLT-235 design §8 preveía `etiquetas-dibujo.ts` → SLT-240, pero no estaba en la lista: desde SL-21 no tiene literales. Esta ficha no baja nada y el tope sigue en 19 (R18, P2). La guardia solo mira `lib/**`, `app/api/**` y `page`/`layout` de `app/`, y ningún archivo de este alcance tiene hoy un literal ahí. |
| SLT-238 «Carga de órdenes con céntimos según la moneda del país» (`pending`) | `feature_list.json` | Es dueña de los céntimos al teclear y de la regla de redondeo de la carga. Esta ficha no cambia ni una ni otra (R16): solo cómo se **pintan** los importes. |
| SLT-241 a SLT-246 | `feature_list.json` | Rebanadas hermanas. Los rótulos «IVA» de órdenes no son de ninguna (P1). |

No apareció ninguna ficha ni código que ya resuelva lo que falta: R2–R7 y R9–R11.

## 1. Resumen

1. `lib/config/moneda.ts` exporta `formatearTopeEn(moneda, max, sinMonto)` para el tope de la
   indemnización (R10).
2. Cada pantalla de órdenes, incidentes y registro de acciones lee `useMonedaDelPais()` y llama a
   `formatearMontoEn` (o a `formatearTopeEn`) con esa moneda (R2–R5, R9–R11).
3. El PDF de etiquetas del navegador recibe la moneda del modal, y el dibujo compartido deja de tener
   moneda por defecto (R6, R7, R14).
4. Los archivos tocados entran en el censo de SLT-235 R18 (R17).

## 2. Modelo de datos

No hay tabla, columna, migración ni política nueva. No hay operación nueva ni ruta nueva.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda | `pais.moneda_*` → `PaisDTO.moneda` → layout del portal → `MonedaDelPaisProvider` (SLT-235) | `useMonedaDelPais()` en cada componente de §4 |
| Caída | `MONEDA_PLATAFORMA` | El hook sin proveedor (R13) y `paisParaPantallasDelActor` si la lectura falla (SLT-235) |
| Nombre del impuesto | `useImpuestoDelPais()` | Nadie en esta ficha (R16, P1) |
| Escala de presentación exacta | `ESCALA_PRESENTACION` (2) | La tabla del monto redondeado (§4, R3) |

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

## 4. Pantallas (R1–R5, R8–R11)

Cada componente cliente lee `const moneda = useMonedaDelPais()` y la pasa a funciones puras que la
reciben como argumento. Ninguna función de módulo lee el hook. El marcador de «sin importe» es el de
hoy en cada pantalla.

| Archivo | Hoy | Cambio |
|---|---|---|
| `app/(app)/ordenes/_components/ordenes-columns.tsx` | `PriceLabel` (ya en la moneda del país) | **Ninguno** (R1 solo gana test) |
| `app/(app)/ordenes/_components/OrdenesCargaResumen.tsx` | `formatMonto(row.montoCobrar)` | `formatearMontoEn(moneda, row.montoCobrar)`. Las columnas ya se arman dentro del componente. Sin monto, `SIN_MONTO` (`-`), el default (R2). |
| `app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla.tsx` | `montoExacto` (reexport de `DesglosePagoField`) | `const exacta = useMemo(() => ({ ...moneda, decimales: ESCALA_PRESENTACION }), [moneda])` y `formatearMontoEn(exacta, row.original)` / `row.aplicado`. Ver la nota de R3 abajo. |
| `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx` | `importe(u, campo)` con `money` | `importe(u, campo, moneda)` con `formatearMontoEn(moneda, u[campo], SIN_MONTO_RAYA)`. La rama `u.tarifa === "sin_tarifa"` va primero, como hoy (R4). `AVISO_FILA_FLETE` y `AVISO_FILA_COMISION` no cambian (R16). |
| `app/(app)/ordenes/_components/EtiquetaGuia.tsx` | `formatMonto(montoCobrar)` | `formatearMontoEn(moneda, montoCobrar)`, con el mismo `-` (R5). |
| `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx` | `descargarEtiquetasPdf(etiquetas, qr, hoja)` | Lee el hook y pasa `moneda` como cuarto argumento (§5). |
| Novedades (`NovedadesModule.tsx`) | `PosOrderCardDetalle` / `PosOrderCardMosaico` (ya en la moneda del país) | **Ninguno** (R8 solo gana test) |
| `app/(app)/incidentes/_components/IncidentesAdminModule.tsx` | `money(detalle.indemnizacion)`; `MONTO_AYUDA` y `MONTO_EXCEDE` constantes de módulo con `moneyTope` | `formatearMontoEn(moneda, detalle.indemnizacion, SIN_MONTO_RAYA)` (R9). Las dos constantes pasan a `montoAyuda(moneda)` y `montoExcede(moneda)`, exportadas, con `formatearTopeEn(moneda, INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA)` (R10). Los textos que las rodean no cambian (R16). Sigue importando `EstadoCierreBadge` de `cierre-detalle-shared`, pero ya no `money` ni `moneyTope`. |
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

**Descargas (R15).** `ordenes-descarga-columnas.ts`, `novedades-descarga-columnas.ts`,
`ayuda-descarga-columnas.ts`, `incidentes-descarga-columnas.ts` y
`historial-acciones-descarga-columnas.ts` emiten el importe crudo, sin formateador. No se tocan.

## 5. PDF de etiquetas del navegador (R6, R7, R14)

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

## 6. Guardias (R17, R18)

- **Censo de R18 de SLT-235** (`CENSO_MONEDA_DEL_PAIS` en
  `tests/components/moneda-del-pais-pantallas.test.tsx`). Gana estos archivos:
  - `app/(app)/ordenes/_components/OrdenesCargaResumen.tsx`
  - `app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla.tsx`
  - `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
  - `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
  - `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx`
  - `app/(app)/ordenes/_components/etiquetas-pdf.ts`
  - `lib/pdf/etiquetas-dibujo.ts`
  - `app/(app)/incidentes/_components/IncidentesAdminModule.tsx`
  - `app/(app)/incidentes/_components/IncidentesHistoricoTabla.tsx`
  - `app/(app)/historico/acciones/_components/historial-acciones-columnas.ts`
  - `app/(app)/historico/acciones/_components/HistorialAccionesModule.tsx`

  El censo prohíbe llamar a `money(` y `moneyTope(` vengan de donde vengan. Por eso
  `IncidentesAdminModule` e `IncidentesHistoricoTabla` dejan de importarlos de
  `cierre-detalle-shared`. La prueba «rojo si un archivo REAL del censo vuelve a un formateador
  implícito» recorre la lista entera y cubre los nuevos sin cambiarla.
- **Censo de pantallas de dinero de la 359** (`tests/components/DineroIdentidadesEnPantalla.test.tsx`).
  `IncidentesAdminModule` y `OrdenesConMontoAjustadoTabla` están censados, y su prueba exige que usen
  el formateador compartido (`USA_EL_FORMATEADOR`). Hoy pasarían solo por el salto a un archivo que
  importa `money`, o sea por casualidad. Por eso el regex gana `formatearMontoEn` y `formatearTopeEn`.
  El test de «el tope anunciado es el que el validador acepta» pasa a leer `montoExcede(MONEDA_PLATAFORMA)`.
- **`pais-sin-literales`** (R18): sin cambios en la lista ni en el tope (19). La prueba es la guardia en
  verde y `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-240")` vacío. Que el tipo
  siga admitiendo `SLT-240` queda en P2.

## 7. Autorización y módulos

No hay operación, acción ni ruta nueva. La moneda llega por el proveedor que monta el layout del
portal con la empresa que resolvió la sesión en el servidor (SLT-235 §9). Ninguna pantalla lee el país
por su cuenta (R17). Todo es núcleo: no hay puerta de módulo.

## 8. Mapa R → test

Archivo nuevo: `tests/components/moneda-del-pais-ordenes.test.tsx`. Cada caso se monta con
`MonedaDelPaisProvider` y `MONEDA_DE_PRUEBA`, con `MONEDA_CR` y sin proveedor. Los dobles de acciones
y de `next/navigation` son los del test de SLT-235.

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
| R12 | `moneda-del-pais-ordenes.test.tsx`: cada caso de R1–R11 con `MONEDA_CR` da el mismo texto que sin proveedor. Y los tests de esas pantallas siguen verdes sin cambiar ningún valor esperado: `IncidentesAdminModule.test.tsx` (el literal `₡9.999.999.999,99`), `OrdenesCargaResumen.test.tsx`, `OrdenesCargaPreview.test.tsx`, `EtiquetaGuia.test.tsx`, `etiquetas-pdf.test.ts` |
| R13 | `moneda-del-pais-ordenes.test.tsx`: sin proveedor, cada pantalla = `formatearMontoEn(MONEDA_PLATAFORMA, v)` |
| R14 | `tests/unit/components/etiquetas-pdf.test.ts`: `// @ts-expect-error` en una llamada a `buildEtiquetasPdf` y a `drawEtiqueta` sin moneda; el typecheck lo hace cumplir |
| R15 | Los tests de descarga existentes sin cambios (`historial-acciones-descarga-columnas.test.ts` solo cambia la forma de pedir las columnas de pantalla), y ninguno de los cinco `*-descarga-columnas.ts` en el diff (lo mira el reviewer) |
| R16 | `IncidentesAdminModule.test.tsx` sigue esperando el literal entero «(10 dígitos y 2 decimales)…» y `tests/unit/components/ordenes-columns.test.tsx` sigue esperando «Flete + IVA», los dos sin cambios |
| R17 | `moneda-del-pais-pantallas.test.tsx > censo de R18` con los 11 archivos de §6 |
| R18 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` en verde sin cambios, y en `moneda-del-pais-ordenes.test.tsx` `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-240")` = `[]` y `TOPE_EXCEPCIONES` ≤ 19 |

## 9. Riesgos

- **Firmas que cambian y arrastran tests.** `columnasHistorialAcciones` pasa de constante a función,
  `MONTO_AYUDA`/`MONTO_EXCEDE` pasan a funciones y la moneda es obligatoria en el PDF. El typecheck
  señala cada llamante. Los tests que solo cambian la forma de llamar pasan
  `MONEDA_PLATAFORMA` y no cambian ningún valor esperado (R12, R13). Están en `tasks.md > Archivos
  esperados`.
- **`EtiquetaGuia` fuera del portal.** Hoy solo la monta el modal, que vive en el portal. Si se montara
  en `/paquete` u otra página sin proveedor, pintaría con la moneda de la plataforma (R13), como el
  resto de componentes de SLT-235.
- **Tope con 0 decimales.** El mensaje dice `€9 999 999 999 (10 dígitos y 2 decimales)`: el número
  queda por debajo de lo que se acepta (lado seguro) y la frase sobre los decimales sigue siendo
  verdad para lo que se teclea, hasta que SLT-238 decida otra cosa (R16).

## 10. Alternativas descartadas

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

## 11. Tamaño

Ver `tasks.md > Tamaño`: 30 archivos (12 de producción, 18 de tests), el 75% del tope de 40. Meter P1
(b) sumaría `ordenes-columns.tsx`, `ordenes-descarga-columnas.ts` y sus tests, y dejaría la ficha por
encima del 80%.

## Dependencias de terceros

Ninguna nueva.
