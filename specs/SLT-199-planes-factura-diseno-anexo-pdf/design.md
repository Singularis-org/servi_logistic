# SLT-199 — planes-factura-diseno-anexo-pdf · design.md

> Requisitos: `requirements.md` (R1–R26). Escrito por `spec_author` el 2026-11-18.
>
> - **Sin migración, sin tablas, sin endpoints nuevos.** Todo pasa en el navegador, sobre la misma lectura de
>   SLT-136.
> - **Sin dependencias nuevas:** jsPDF ya está aprobado; la fuente embebida de respaldo ya está en el repo.
> - **P1, P2 y P3 cerradas por el humano el 2026-11-18:**
>   - tarifa sacada de los movimientos (R26);
>   - botones «Descargar factura» y «Descargar anexo», y el anexo en `factura-<n>-<empresa>-anexo.pdf`;
>   - «Montos en CRC (₡).» desde la configuración de moneda.
>
>   Las referencias «P1/P2/P3» de abajo apuntan a esas decisiones.

## Lo que ya existe

Buscado el 2026-11-18 con `anexo`, `detalle de movimientos`, `Factura-1-Ordenex-Detalle`, `construirPdfFactura`,
`construirExcelFactura`, `factura` + `PDF`, `tarifa global` y `Descargar Excel`, en el board (`feature_list.json`,
todos los estados), en `specs/` y en el código. El grafo `codebase-memory-mcp` no tiene índice de este worktree
(`index_status`: «project not found»): busqué con Grep y Read.

- **Board:** ninguna otra ficha hace el anexo ni rediseña la factura. SLT-136 «Planes: aviso, correo y descarga de
  la factura» (de la que depende) entregó la descarga actual: PDF con jsPDF y Excel con exceljs.
- **`specs/`:** solo `specs/SLT-136-planes-aviso-descarga-factura/`. Esta ficha enmienda sus R9, R10, R11, R13,
  R16–R20 y R33 (§9). Nada sobre un anexo.
- **Código que se reutiliza o se toca:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| `construirPdfFactura` con una clase `Lienzo` privada: altura de fila fija, cabecera de tabla repetida, filas alternas, pie al final con `getNumberOfPages()`, logo con respaldo a texto | `lib/facturas-plataforma/pdf.ts` | `Lienzo` y los tokens de color se **mueven** al módulo común (§2); `pdf.ts` queda como la composición de la factura (§4) |
| `construirExcelFactura` | `lib/facturas-plataforma/excel.ts` | **Se borra** con su test (R22) |
| `resumirFactura`, `DescuadreDeFactura`, `FACTURA_DESCARGA_TEXTOS`, `fechaNumerica`, `periodoNumerico`, `diaNumerico`, `cantidadVisible`, `planVisible`, `periodicidadVisible`, `nombreArchivoFactura` | `lib/facturas-plataforma/resumen.ts` | Se reutilizan. Cambian `cantidadVisible` (R4), los textos (anexo, nota del desglose, sin Excel), `nombreArchivoFactura` (P2); se suman el formato de importe (R3) y la tarifa (P1) |
| `DescargarFactura` (dos botones, `import()` dinámico, logo con `fetch`, error en `role="alert"`) | `components/shared/facturas/DescargarFactura.tsx` | El botón del Excel pasa a ser el del anexo (R22, R23) |
| `FACTURAS_TEXTOS.descarga` | `components/shared/facturas/facturas-vista.ts` | Textos de los botones (P2) |
| `imprimible`, `fuenteEtiqueta` (Liberation Sans, cubre `₡`), `registrarFuente`, `escribibleEnFuenteEstandar` | `lib/pdf/imprimible.ts`, `lib/pdf/etiquetas-fuente*.ts` | Respaldo de la Helvetica por texto (R2, §3) |
| `monedaConfig` (`simbolo`, `separadorDecimal`) | `lib/config/moneda.ts` | Fuente del símbolo y del separador decimal del formato de documento (R3). `money()` no se toca |
| `MARCA_FACTURA` (`emisor`, `pie`, `logo`) | `lib/config/marca.ts` | Se reutiliza sin cambios |
| `pdf-inspector` (texto por página con `/ToUnicode` o WinAnsi, rectángulos, imágenes, fuentes) | `tests/unit/pdf/pdf-inspector.ts` | Lo usan los tests de los dos PDF y del módulo común |
| E2E de la descarga | `e2e/facturas-plataforma.spec.ts` | Pierde la relectura del Excel y gana la del anexo (R25) |

## Ruta

**Completa.** La factura es un documento de cobro: aunque no cambie ningún cálculo, toca dinero (formato de los
importes, R3, y la tarifa, P1), y `docs/specs.md > Tres rutas` pone el dinero en la completa. Además retira una
función entregada (el Excel) y enmienda nueve requisitos de SLT-136. No toca migraciones ni esquemas.

## 1. Modelo de datos, autorización y país

- **Ninguna tabla, columna, migración ni RLS nueva.** La lectura es la de SLT-136
  (`descargarFacturaMiPlanAction` / `descargarFacturaEmpresaAction` → `datosDescarga*`), con su autorización en
  `FacturaPlataformaService` (maestro de `ROLES_MI_PLAN` o superadmin) y la empresa de la sesión o ligada en la
  página. Ningún módulo nuevo que encender.
- **Datos que dependen del país:**
  - **Moneda:** símbolo y separador decimal de `monedaConfig` (variables `MONEDA_*`). El separador de miles del
    documento es un espacio fijo (R3, R4): es el formato de la referencia, no el de la pantalla. Ningún literal
    `₡`, «colones» ni «Costa Rica» en código nuevo. La frase de moneda de la nota (P3) se compone con
    `monedaConfig.currency` y `monedaConfig.simbolo`: «Montos en CRC (₡).».
  - **Hora:** la de la plataforma (`fechaCalendarioPlataforma`), como SLT-136.
  - **Impuestos y métodos de pago:** ninguno (estado de cuenta interno, SLT-118).

## 2. El módulo común (`lib/facturas-plataforma/pdf-comun.ts`) — R1, R2, R5, R6

Es la decisión 4: todo lo que se ve igual en los dos documentos vive aquí, y `pdf.ts` y `anexo.ts` solo componen.

```ts
export type Color = readonly [number, number, number];
/** Tokens de la referencia: uno por papel, no por documento. */
export const COLORES: { noche; tinta; gris; violeta; rojo; verdeAzulado; fondoTarjeta; fondoFila; fondoFilaAlterna;
  linea; blanco; rosa; degradado: readonly Color[] /* cian → violeta → rosa */ };
export const MEDIDAS: { ancho: 210; alto: 297; margen; util; limite; altoBanda; altoBarra; altoCabeceraTabla; … };

export interface Columna { titulo: string; ancho: number; derecha?: boolean }
export interface Celda { texto: string; color?: Color; negrita?: boolean }
export interface Fila { celdas: Celda[]; negrita?: boolean; filete?: boolean }

export class Lienzo {                                  // movida desde pdf.ts, ampliada
  constructor();                                       // A4 vertical, mm, registra la fuente de respaldo
  texto(t, x, y, op?: { derecha?; negrita?; ancho?; tamano?; color? }): void;  // §3
  cabecera(op: { logo: LogoDelPdf | null; antetitulo: string; titulo: string; cliente: string }): void; // banda + barra degradada
  barraDegradada(y: number): void;
  tarjetas(valores: [etiqueta: string, valor: string][], columnas: number): void; // rejilla de N columnas
  tituloSeccion(t: string): void;                      // con el filete degradado vertical de la referencia
  tabla(columnas: readonly Columna[], filas: Iterable<Fila>, altoFila: number): void; // cabecera repetida + alternas
  filaDeAviso(t: string, altoFila: number): void;
  filaTotal(columnas, fila: Fila, altoFila: number): void; // negrita + filete violeta
  bandaTotal(etiqueta: string, importe: string): void; // «TOTAL A PAGAR»
  nota(t: string): void;
  pies(textoIzquierda: string): void;                  // recorre las páginas: texto + «Página x de y»
  bytes(): ArrayBuffer;
}
```

- **Altura de fila fija** por tabla (como hoy): la paginación es exacta, la cabecera se repite sin perder ni
  duplicar filas (R5), y el test puede contar filas por página.
- **Barra degradada:** jsPDF no pinta degradados sin su API avanzada. Se dibuja como ~60 rectángulos finos
  contiguos con el color interpolado entre los tres tokens de `degradado`. Es determinista y el test lo comprueba
  con `rectangulosDePagina`.
- **Logo (R6):** la lógica actual (`addImage` en `try`; si falla o es `null`, «Singularis» en texto) pasa a
  `cabecera()` y vale para los dos.
- **Pie (R5):** `pies()` se llama al final, cuando ya se conoce el total de páginas, igual que hoy.
- **R1 se prueba comparando** la geometría y el color de los rectángulos de la banda, la barra, la cabecera de
  tabla y el pie entre la página 1 de la factura y la del anexo.

## 3. Tipografía: Helvetica con respaldo por texto — R2

- Todo texto se escribe con `helvetica` (`normal` o `bold`), que jsPDF trae sin incrustar nada.
- **El problema:** la Helvetica de jsPDF escribe en WinAnsi y **borra en silencio** lo que no cubre
  (`lib/pdf/etiquetas-fuente-registro.ts:55-62`). No tiene `₡` (U+20A1), así que cada importe lo perdería.
- **La solución:** `Lienzo.texto()` mira el texto completo con `escribibleEnFuenteEstandar` (ya existe).
  - Si cada carácter es escribible, lo escribe con Helvetica en el peso pedido.
  - Si no, escribe ese texto entero con `fuenteEtiqueta` (Liberation Sans, ya embebida e idéntica en métricas a
    Helvetica/Arial), pasándolo por `imprimible` (R2: «?» visible). Si se pidió negrita, la simula con relleno y
    trazo (`renderingMode: "fillThenStroke"`), como hoy.
- **Efecto:** cada celda sigue siendo **un solo** texto dibujado (los tests leen la celda entera), y la letra de
  los importes es la de la misma familia métrica que el resto.
- El signo negativo es el «-» ASCII, que Helvetica sí tiene (R3). La raya «—», «·» y «º» están en WinAnsi.

## 4. La factura (`lib/facturas-plataforma/pdf.ts`) — R8–R14

`construirPdfFactura(datos, resumen, logo): ArrayBuffer`. La firma no cambia (el componente y sus tests la
siguen llamando igual).

1. `cabecera({ antetitulo: "FACTURA DE PLATAFORMA", titulo: "Factura N.º n", cliente: "Cliente: X" })` (R8).
2. `tarjetas(seis, 2)`: dos columnas y tres filas (R9). Valores de SLT-136 R8 (`estadoVisible` → «Emitida»).
3. `tituloSeccion("Resumen")` y `tabla` con Concepto · Cantidad · Tarifa · Importe (R10). La tarifa sale de
   `tarifaDeLaFactura(datos)` (§5, P1). Reversos con el importe en `rojo`. «Total órdenes» con `filaTotal`.
4. `bandaTotal("TOTAL A PAGAR", total)` y `nota(...)` (R11): «Movimientos en total: N.» + «Los cargos y reversos
   se cobran a <tarifa> por orden.» (o «… con varias tarifas por orden.», o nada sin movimientos) + «Montos en CRC
   (₡).».
5. Página nueva, `tituloSeccion("Desglose por día")`, `tabla` del desglose, `filaTotal` «Total» y la nota del
   anexo (R12). Sin días: `filaDeAviso("Sin movimientos en el período")` y el total en cero.
6. `pies("Singularis · Plataforma Servi Logistic · Factura N.º n · empresa")` (R13).

Lo que se ve en la referencia y NO se copia:
- «Cerrada» en la tarjeta de estado: se mantiene «Emitida» (decisión de SLT-136, no reabierta).
- «2365» sin separador en la fila «Total» del desglose: es una incoherencia de la referencia; R4 pide el espacio
  también ahí.

## 5. Resumen, textos y formato (`lib/facturas-plataforma/resumen.ts`) — R3, R4, R14, P1, P2, P3

- `resumirFactura` y `DescuadreDeFactura` **no cambian** (R7, R14): el anexo llama a la misma función antes de
  dibujar.
- **`importeDocumento(valor: string): string`** (R3). Trabaja sobre el texto, sin `Number`:
  - la forma de entrada es la de la base (`/^-?\d+\.\d{2}$/`, `toFixed(2)`); otra forma lanza (es un fallo, no un
    caso de presentación);
  - salida: `[-]` + `monedaConfig.simbolo` + enteros agrupados con `" "` + `monedaConfig.separadorDecimal` + dos
    decimales; «-0.00» sale «₡0,00».
- Vive aquí y **no** en `lib/config/moneda.ts`, a propósito: la guardia 359
  (`tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`) cuenta seis caminos públicos de dinero y
  exige que la pantalla no arrastre «,00». Este formato es solo de documento; meterlo en `moneda.ts` sería un
  séptimo camino público y abriría la guardia.
- **`cantidadVisible`** pasa del `monedaConfig.separadorMiles` al espacio (R4). Solo la usan el PDF y sus tests
  (comprobado con Grep).
- **`tarifaDeLaFactura(datos): { tipo: "unica"; importe: string } | { tipo: "varias" } | { tipo: "sin" }`** —
  (R26, P1 = (a)): recorre los movimientos y compara los valores absolutos en céntimos (`aCentimosConSigno` y
  valor absoluto). Un solo valor → `unica` con ese importe en positivo; dos o más → `varias` («Varias»); ninguno →
  `sin` («—»).
- **`FACTURA_DESCARGA_TEXTOS`**: pierde `excel` y la nota del Excel; gana `anexo` (antetítulo, título, tarjetas,
  línea del período, columnas, tipos «Cargo» y «Reverso», total neto, pie) y la nota del desglose de R12.
- **`nombreArchivoFactura(numero, empresa, documento: "factura" | "anexo")`**: el parámetro deja de ser la
  extensión. La factura sale `factura-<n>-<empresa>.pdf` y el anexo `factura-<n>-<empresa>-anexo.pdf` (P2).
- **Frase de moneda (R11, P3):** `Montos en ${monedaConfig.currency} (${monedaConfig.simbolo}).`.

## 6. El anexo (`lib/facturas-plataforma/anexo.ts`) — R15–R21

`construirPdfAnexo(datos, resumen, logo): ArrayBuffer`, función pura como la factura.

1. `cabecera({ antetitulo: "ANEXO · FACTURA N.º n", titulo: "Detalle de movimientos", cliente })` (R16), solo en la
   página 1.
2. `tarjetas(cuatro, 4)` (R17): Movimientos; Cargos «n · importe»; Reversos «n · -importe»; Total neto. Las
   cantidades y los importes salen de `resumen` (los de la base).
3. Línea «Periodo facturado: <periodoNumerico>.» + «Tarifa: <tarifa> por orden.», «Tarifa: varias por orden.» o
   «Tarifa: —.» (R17, R26).
4. `tituloSeccion("Movimientos")` y `tabla` (R18): una `Fila` por movimiento, generada sobre la marcha (no se
   copia el arreglo entero). «Cargo» en `verdeAzulado`; «Reverso» con `negrita` y en `rojo`; guía `null` → «—»;
   importe con `importeDocumento`, en `rojo` si es negativo. Fecha con `fechaNumerica(instante)`.
5. `filaTotal` «Total neto (N movimientos)» (R19); sin movimientos, `filaDeAviso` y el total en «₡0,00» (R20).
6. `pies("Singularis · Plataforma Servi Logistic · Anexo: detalle de movimientos")` (R21).

**Volumen.** La referencia tiene 2 567 movimientos en 47 páginas. No está medido cuánto tarda jsPDF en el
navegador con ese volumen ni con una factura mensual de decenas de miles de movimientos; T3.1 lo mide con 3 000
filas en el test y lo anota en `progress/impl_SLT-199.md`. Se acepta un archivo de varios MB y unos segundos de
espera, como en SLT-136: es un clic explícito sobre un solo período. El límite de filas de Excel deja de aplicar.

## 7. Los botones (`components/shared/facturas/`) — R22–R24

- **`DescargarFactura.tsx`:** `type Documento = "factura" | "anexo"`.
  - Los dos caminos piden los datos, comprueban `resumirFactura` (R7), cargan el logo e importan su constructor
    con `import()`: `pdf` o `anexo`.
  - Los dos entregan `application/pdf` con `nombreArchivoFactura(…, documento)`.
  - Se van `XLSX_MIME`, `construirExcelFactura` y el `import` de exceljs.
  - El resto no cambia: deshabilitar los dos botones al pulsar uno y el error en `role="alert"` (R23).
- **`facturas-vista.ts`:** `FACTURAS_TEXTOS.descarga` pierde `pdf`/`excel` y gana `factura`/`anexo` con los
  textos «Descargar factura» y «Descargar anexo» (P2).
- **`DetalleDeFactura.tsx`:** solo el comentario de la línea 40 («Descargar PDF» y «Descargar Excel»).
- Las páginas (`mi-plan/page.tsx`, `plataforma/empresas/[organizacionId]/page.tsx`) **no cambian**: pasan la misma
  `descargar`.

## 8. Documentación

`docs/architecture.md:394-402` («Descarga (SLT-136)»): «en PDF y en Excel» y `{resumen,pdf,excel}.ts` pasan a
contar lo siguiente:
- la factura y el anexo en PDF, con `pdf-comun.ts`;
- Helvetica con la fuente embebida de respaldo;
- el formato de importe de documento, distinto del de pantalla.

## 9. Enmiendas explícitas a SLT-136

Los archivos de `specs/SLT-136-…/` no se tocan (spec cerrado); el cambio queda escrito en estos requisitos y en
`docs/architecture.md`.

| SLT-136 | Qué cambia | Por |
|---|---|---|
| R9 y la decisión «Columna Tarifa: se quita» | Vuelve la columna Tarifa | R10 (decisión 1 del 2026-11-18) |
| R10 («sin citar ninguna tarifa») | La nota puede citar la tarifa | R11, P1 |
| R11 (nota que remite al Excel) | Remite al anexo | R12 |
| R13 (formato de dinero de la app, fuente embebida) | Formato de documento; Helvetica con respaldo | R2, R3 |
| R16, R17 (Excel), R18 (`.xlsx`) | Sin Excel; el anexo en PDF | R20, R22, R24 |
| R19, R20 (textos de los botones) | Botones factura y anexo | R23, P2 |
| R33 (E2E con el Excel) | E2E con el anexo | R25 |

## 10. Tests (trazabilidad R → test)

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/unit/facturas-plataforma/pdf-comun.test.ts` (nuevo) | R1, R2, R5, R6 | Lienzo con una tabla de 120 filas: la cabecera de tabla en cada página, ninguna fila perdida ni duplicada, fondos alternos, «Página x de y» en todas; un texto ASCII sale en Helvetica y uno con `₡` en la fuente embebida, entero; un carácter fuera de las dos sale «?»; ninguna fuente Poppins en el documento; la barra degradada son N rectángulos con color de cian a rosa; logo `null` → «Singularis». R1: los rectángulos de la banda, la barra, la cabecera de tabla y el pie de la factura y del anexo coinciden en color, altura y x |
| `tests/unit/facturas-plataforma/pdf.test.ts` (se reescribe) | R8–R14 | Cabecera; seis tarjetas en dos columnas (por coordenadas); «Emitida»; columnas con «Tarifa»; reversos en rojo; «Total órdenes» con filete; «—» en la cuota; banda «TOTAL A PAGAR»; nota; desglose en página 2 con fila Total («2 365» con espacio); nota del anexo; pie; sin movimientos; mismos importes que hoy para el mismo fixture (R14) |
| `tests/unit/facturas-plataforma/anexo.test.ts` (nuevo) | R15–R21, R7, R22 | Cabecera solo en página 1; cuatro tarjetas con «n · importe»; línea del período; columnas; # de 1 a N; «Cargo» verde azulado y «Reverso» en negrita rojo; guía «—»; importe negativo en rojo; 130 movimientos → varias páginas, cabecera repetida, ninguna fila perdida ni duplicada; «Total neto (130 movimientos)»; sin movimientos; pie. R22: `lib/facturas-plataforma/excel.ts` no existe |
| `tests/unit/facturas-plataforma/resumen.test.ts` (se amplía) | R3, R4, R7, R24, R26 | `importeDocumento`: «0.00», «200.00», «473000.00», «-40400.00», «-0.00», «99999999999.99» y una forma inválida que lanza; `cantidadVisible` con espacio y negativos; `tarifaDeLaFactura` (única con cargos y reversos del mismo valor, varias, sin movimientos); `nombreArchivoFactura` de los dos documentos |
| `tests/components/DescargarFactura.test.tsx` (se ajusta) | R7, R23, R24 | «Descargar factura» y «Descargar anexo» llaman a su constructor y entregan `application/pdf` con su nombre; descuadre → error y ningún archivo; los dos se deshabilitan; no queda ninguna referencia a exceljs |
| `tests/components/DetalleDeFactura.test.tsx` (se ajusta) | R22, R23 | Los dos botones en una cerrada; ninguno en curso; ningún botón de Excel |
| `tests/components/MiPlanModule.test.tsx` y `tests/integration/plataforma-empresa-detalle-page.test.tsx` (se ajustan) | R23 | El texto del segundo botón |
| `tests/unit/facturas-plataforma/excel.test.ts` | — | **Se borra** (R22) |
| `e2e/facturas-plataforma.spec.ts` (se ajusta, proyecto `dinero`) | R25 | El maestro descarga los dos PDF; nombres y `%PDF`. El anexo se relee con `pdf-inspector` (o, si el import desde `e2e/` no resuelve, con la búsqueda de las remisiones en el texto ToUnicode): las tres remisiones y «Total neto (3 movimientos)». El superadmin descarga la factura. La en curso no tiene botones. Se quitan la relectura del Excel y el `import ExcelJS` |

## 11. Alternativas descartadas

- **Incrustar una Helvetica completa con `₡`** (por ejemplo, Liberation Sans Regular y Bold enteras). Daría
  negrita real en los importes, pero suma cientos de kB de fuente al repo y al bundle del PDF, y la decisión 3 pide
  «la de jsPDF». El respaldo solo para los textos que lo necesitan usa la fuente que ya está.
- **Cambiar de fuente por carácter** (Helvetica para los dígitos y la fuente embebida solo para el `₡`). Respeta
  la letra al milímetro, pero parte cada importe en dos textos con dos anchos que hay que medir y alinear a la
  derecha a mano, y los tests dejan de leer la celda entera. La diferencia visible con la métrica compatible es
  nula.
- **Cambiar `money()` o añadir el formato a `lib/config/moneda.ts`.** Cambiaría el dinero de todas las pantallas
  (que no llevan «,00» por la ficha 359) o abriría un séptimo camino público que la guardia 359 cuenta. El formato
  de documento es local a estos dos PDF.
- **Usar `jspdf-autotable` para las tablas.** Resuelve la cabecera repetida y las filas alternas, pero es una
  dependencia nueva (regla 7) para algo que el `Lienzo` ya hace con altura de fila fija y probado.
- **Generar el anexo en el servidor** (route handler). Evitaría bajar todos los movimientos al navegador, pero
  SLT-136 ya los baja para el desglose y decidió armar los archivos en el navegador; pediría la fuente en Node y
  otra ruta autorizada.
- **Degradado con la API avanzada de jsPDF** (`ShadingPattern`). Pinta un degradado real, pero obliga a pasar el
  documento a `advancedAPI` y el `pdf-inspector` no lee patrones. Las tiras de color dan el mismo efecto a esa
  altura (≈1,2 mm).
- **Dejar el Excel además del anexo.** La decisión 2 lo retira.

## 12. Tamaño

Medido contra `gate.tamano_pr` (40 archivos; 1 000 líneas de producción y 3 000 de tests, añadidas más borradas):

- **Producción: 9 archivos.**
  - `pdf-comun.ts`: ~320 nuevas.
  - `pdf.ts`: ~400 entre borradas y añadidas.
  - `anexo.ts`: ~170.
  - `resumen.ts`: ~90.
  - `excel.ts`: 35 borradas.
  - `DescargarFactura.tsx`: ~50.
  - `facturas-vista.ts`, `DetalleDeFactura.tsx` y `docs/architecture.md`: ~20.
  - **Total: ~1 000–1 100 líneas.** Roza o pasa el tope.
  - **Mitigación en T1.1:** crear `pdf-comun.ts` con `git mv lib/facturas-plataforma/pdf.ts …` y escribir el
    `pdf.ts` nuevo encima. Con la detección de renombrados, el diff cuenta solo lo cambiado: unas 750–850 líneas.
- **Tests: 10 archivos, ~1 200 líneas** (uno borrado). Dentro del tope.
- **Total: ~19 archivos**, el 48% de `max_archivos`: no hace falta partir por archivos.

**Si el gate da aviso o rojo por líneas de producción, el corte natural es:**
- **Rebanada A:** el módulo común, la factura rediseñada, el formato de documento, R1–R14 y R24 para la factura.
  El Excel sigue.
- **Rebanada B:** el anexo, el retiro del Excel, los botones, R15–R25 y el E2E.

Cada una se mergea sola y deja la descarga funcionando.
