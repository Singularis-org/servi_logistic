# SLT-243 — Moneda e impuesto del país en pantallas: cierres del admin · design

> Alcance, «Lo que NO entra», preguntas abiertas y decisiones cerradas están en `requirements.md`.
> Aquí solo va el cómo, y las referencias `R<n>` son las de ese archivo. Es la rebanada 5 de 8 del
> corte de SLT-235. Los patrones salen de otras specs:
> - pantalla (proveedor, hook, censo): `specs/SLT-235-moneda-pais-pantallas/design.md` §6–§8;
> - tope con la moneda del país: `specs/SLT-240-moneda-pantallas-ordenes/design.md` (R10,
>   `IncidentesAdminModule`);
> - «una base con el rótulo de caída y una función que pone el del país»: SLT-240 §5.
>
> El spec está escrito con las recomendaciones de P1 (no), P2 (sí) y P3 (SLT-244). Si el humano
> cierra alguna distinto, el apartado que cambia se marca en §11.

## Lo que ya existe

Busqué el 2026-11-23 en tres sitios:
- `feature_list.json`, en todos los estados, con `cierre`, `cierres-admin`, `cierre-factura`,
  `moneda` e `IVA`;
- `specs/`, con `SLT-243`, `cierres-admin` y `mensajeDeCuadre`;
- el código, con `money(`, `moneyTope(`, `formatearTopeEn`, `mensajeDeCuadre`, `IMPUESTO_ROTULO`,
  `\bIVA\b`, `rotulo…ConImpuesto` y los nombres de los componentes de `cierre-factura.tsx`.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found or not indexed»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» (`done`) | `hooks/use-moneda-del-pais.ts` (`useMonedaDelPais`, `useImpuestoDelPais`), `providers/MonedaDelPaisProvider.tsx`, censo R18 en `tests/components/moneda-del-pais-pantallas.test.tsx` | Se **reutiliza** entero. Todas las pantallas de esta ficha son `"use client"` y leen el hook. No se lee el país en el servidor. |
| SLT-235 dejó `mensajeDeCuadre(lineas, monto, moneda = MONEDA_PLATAFORMA)` opcional «hasta SLT-243» | `components/shared/DesglosePagoField.tsx:108-117`; design de SLT-235 §7 y §12, alternativa 4 | Esta ficha quita el default (R7, R8). Llamadores que cambian: `CorregirPagosDialog.tsx`, más 3 llamadas de `GestionarOrdenPanelCentimos.test.tsx` y el caso «sin moneda» de `moneda-del-pais-pantallas.test.tsx`. `GestionarOrdenPanel.tsx` ya pasa la moneda. |
| SLT-240: el tope de la indemnización con la moneda del país | `app/(app)/incidentes/_components/IncidentesAdminModule.tsx` (`montoAyuda(moneda)`, `montoExcede(moneda)` con `formatearTopeEn`) y su caso en `moneda-del-pais-ordenes.test.tsx` | Se **copia el patrón** en `CierresAdminModule.tsx` (R9). No se comparte código: los textos de las dos pantallas difieren («Revisa» frente a «Revisá»). |
| SLT-240: `rotuloFleteConImpuesto` y `rotuloComisionConImpuesto` | `app/(app)/ordenes/_components/rotulos-con-impuesto.ts` | Se **reutilizan**. Dan «Flete + X» y «Comisión + X», el mismo texto que `FLETE_CON_IVA_LABEL` y `COMISION_CON_IVA_LABEL` de `cierre-labels.ts` (§6.1). |
| `IVA_FACTURADO_LABEL = \`${IMPUESTO_ROTULO} facturado\`` | `cierre-labels.ts:366` | Se **reutiliza** como base del encabezado `ivaFacturado` (§6.1). |
| Código de cierres que no monta ninguna pantalla | `cierre-factura.tsx` (salvo `SeccionSinGestion`, `separarParaDevolucion`, `efectoAlAprobar` y los rótulos que importa `components/private/cierres`), y en `cierre-detalle-shared.tsx` todos los componentes de dinero menos `TotalesPanel` | Lo confirman las guardias `cierre-detalle-superficies` y `cascada-central-en-las-dos-pantallas` y el Grep de usos en `app/` y `components/`. SLT-146 «Podar cierre-factura.tsx de lo que quedó sin montar» (`pending`) lo borra. **No se toca** (P1). |
| SLT-244 «Moneda e impuesto del país en pantallas: componentes de cierres» (`pending`) | `components/private/cierres/**`: lee de `cierre-labels.ts` y `cierre-detalle-shared.tsx` los rótulos `IVA_*` y `*_CON_IVA_*`; `fila-gestion-labels.ts` usa `money(` en `porcentajeDe` | Frontera de P3: esos rótulos y el texto de la tarifa de la descarga son de SLT-244. Esta ficha no toca `components/private/cierres/**`. |
| SLT-245 «Moneda e impuesto del país en pantallas: wallet de la empresa» | `lib/constants/impuesto-rotulo.ts` (excepción a su nombre) | No se toca: `IMPUESTO_ROTULO` sigue siendo la caída. |
| Lista de excepciones de `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` (tope 12) | **Ninguna entrada a nombre de SLT-243.** No se edita el archivo; R16 lo afirma con un test. |
| Censo 359 (`DineroIdentidadesEnPantalla.test.tsx`) | Censa `cierre-factura.tsx`, `cierre-detalle-shared.tsx` y `CierresBodegaAdminModule.tsx`; su `USA_EL_FORMATEADOR` ya acepta `formatearMontoEn` y `formatearTopeEn` | Sin cambios: los archivos censados siguen nombrando un formateador. |

No apareció ninguna ficha ni código que ya resuelva R1–R11.

## 1. Resumen

1. Cada pantalla montada de §3 lee `useMonedaDelPais()` y cambia `money(x)` por
   `formatearMontoEn(moneda, x, SIN_MONTO_RAYA)`, el mismo texto que `money` con la moneda de la
   plataforma (R1–R6).
2. `mensajeDeCuadre` y los dos avisos de `PAGO_MENSAJERO_TEXTO` con importe piden la moneda
   (R7, R8).
3. Los mensajes del tope de la indemnización pasan a funciones de la moneda con `formatearTopeEn`
   (R9).
4. Un módulo puro nuevo pone el nombre del impuesto del país en los encabezados de las descargas.
   Se aplica sobre el libro ya armado y sobre el catálogo del selector (R10, R11).
5. Los archivos que quedan sin formateador implícito entran en el censo de R18 (R15). La lista de
   excepciones no cambia (R16).

No hay cambio de servidor, de acción ni de contrato.

## 2. Modelo de datos

No hay tabla, columna, migración, política RLS ni ruta nueva. No hay operación nueva ni cambio de
autorización.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda (formato) | `pais.moneda_*` → `PaisParaPantallas.moneda` → proveedor del layout | `useMonedaDelPais()` en cada pantalla de §3 y §4 |
| Nombre del impuesto | `PaisParaPantallas.impuestoNombre` → proveedor | `useImpuestoDelPais()` en los cinco componentes que arman descargas (§6.2) |
| Caídas | `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO` | Los hooks sin proveedor (R13); el memo de SLT-235 si el país no tiene moneda o impuesto |

## 3. Importes en pantalla (R1–R6)

**Contrato de la sustitución** (el mismo de SLT-240 §4): `money(s)` es
`formatearMontoEn(MONEDA_PLATAFORMA, s, SIN_MONTO_RAYA)`. Con el hook sin proveedor, o con
`MONEDA_CR` (igual a `MONEDA_PLATAFORMA`, SL-21 R9), cada pantalla pinta byte a byte lo de hoy
(R12, R13). Los importes siguen siendo el STRING del servidor: no se convierte nada a `number`
(guardia `liquidacion-money-safe`).

| Archivo | Cambio | R |
|---|---|---|
| `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` | El componente que pinta los totales (líneas ~671-673) lee el hook. Salen sus 2 `money(` y el import de `money`. | R1 |
| `cierres-admin/_components/AjustarPagoMensajeroDialog.tsx` | Lee el hook. Sus 3 `money(` (pago vigente, pago nuevo, total del cierre) pasan a `formatearMontoEn`. | R2 |
| `cierres-admin/_components/MarcaAjustado.tsx` | Lee el hook: `formatearMontoEn(moneda, a.pagoAnterior, …) → formatearMontoEn(moneda, a.pagoNuevo, …)`. La montan `FilaGestion` (SLT-244) y `cierre-detalle-shared` (sin montar). | R3 |
| `cierres-admin/_components/ConsolidacionBodegaModule.tsx` | Los 4 totales agregados (líneas ~593-603). | R4 |
| `cierres-admin/_components/cierre-detalle-shared.tsx` | **Solo `TotalesPanel`**: lee el hook, y sus 5 `money(` (efectivo, SINPE, transferencia, general, neto) pasan a `formatearMontoEn`. El resto del archivo no se toca (P1). | R5 |
| `cierres-admin/_components/PendienteLiquidarBadge.tsx` | Lee el hook. Deja de importar `money` de `liquidacion-labels`. | R6 |
| `cierres-admin/_components/pago-mensajero-labels.ts` | `registrado(monto, moneda: FormatoMoneda)` y `anulado(pendiente, moneda: FormatoMoneda)`, con `formatearMontoEn(moneda, …, SIN_MONTO_RAYA)`. Sale el import de `money`. El resto de `PAGO_MENSAJERO_TEXTO` no cambia (lo leen `ColaCierres` y los tests). | R6, R8 |
| `cierres-admin/_components/RegistrarPagoMensajeroDialog.tsx` | Lee el hook y llama a `registrado(pago.monto, moneda)`. | R6 |
| `cierres-admin/_components/PagoMensajeroSeccion.tsx` | Lee el hook y llama a `anulado(resultado.restante, moneda)`. | R6 |

- **`MarcaAjustado` dentro de la fila de SLT-244.** Al leer el hook ella misma, la marca sale en la
  moneda del país también en `FilaGestion`, antes de que SLT-244 migre el resto de la fila. Con
  Costa Rica no se ve ninguna diferencia. Es preferible a pasarle la moneda por prop, que obligaría a
  tocar `FilaGestion.tsx` (SLT-244) (alternativa 3).
- **`TotalesPanel` y no el resto de `cierre-detalle-shared.tsx`.** Es el único componente de dinero
  del archivo que monta una pantalla: `CorregirResultadoDialog`. El archivo no entra en el censo de
  R15 mientras conserve `money(` en el código sin montar (P1).

## 4. Aviso de cuadre y tope de la indemnización (R7–R9)

### 4.1 `mensajeDeCuadre` con la moneda obligatoria

```ts
// components/shared/DesglosePagoField.tsx
export function mensajeDeCuadre(
  lineas: readonly LineaEnEdicion[],
  montoACobrar: number,
  moneda: FormatoMoneda,          // sin default (SLT-235 §12, alternativa 4)
): string | undefined;
```

- Se corrige el comentario que dice que el tercer argumento es transitorio. Si el import de
  `MONEDA_PLATAFORMA` queda sin uso, sale.
- `CorregirPagosDialog.tsx`: lee el hook y llama a `mensajeDeCuadre(lineas, montoACobrar, moneda)`.
  `DesglosePagoField` ya lee la moneda por su cuenta desde SLT-235.
- Tests que cambian de forma, **sin cambiar ningún valor esperado**:
  - `GestionarOrdenPanelCentimos.test.tsx`: sus 3 llamadas pasan `MONEDA_PLATAFORMA`;
  - `moneda-del-pais-pantallas.test.tsx`, caso «R15, R16: mensajeDeCuadre sin moneda…»: pasa a
    comparar `MONEDA_PLATAFORMA` con `MONEDA_CR`. El caso «sin moneda» ya no compila, y R8 lo
    sustituye con un `@ts-expect-error`.

### 4.2 Avisos del pago al mensajero

`PAGO_MENSAJERO_TEXTO.registrado` y `.anulado` piden la moneda sin default (R8). Su único test con
valor, `CierresAdminPagoMensajero.test.tsx:387`, pasa `MONEDA_PLATAFORMA` y espera el mismo texto.

### 4.3 Tope de la indemnización (`CierresAdminModule.tsx`)

```ts
function indemnizacionMontoExcede(moneda: FormatoMoneda): string;  // `El monto no puede superar ${formatearTopeEn(moneda, INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA)} (10 dígitos y 2 decimales). Revisa si sobra un dígito.`
function indemnizacionMontoAyuda(moneda: FormatoMoneda): string;   // `Mayor que 0 y hasta ${formatearTopeEn(…)}, con hasta 2 decimales (por ejemplo 12500.00).`
```

- Sustituyen a las constantes `INDEMNIZACION_MONTO_EXCEDE` e `INDEMNIZACION_MONTO_AYUDA`. El texto
  es el de hoy salvo el importe. Es el patrón de `IncidentesAdminModule` (SLT-240).
- El componente que valida (`errorDeMonto`) y el que pinta la ayuda (línea ~1719) leen el hook. Si
  son el mismo componente, se lee una vez.
- Sale el import de `moneyTope` desde `./cierre-detalle-shared`. El reexport de
  `cierre-detalle-shared.tsx` se queda: también lo mencionan tests y lo resolverá SLT-146.
- `formatearTopeEn` corta a la escala de la moneda: con una moneda de 0 decimales anuncia
  «€9 999 999 999», que el validador acepta tecleado sin espacios (R9). Con CR,
  `formatearTopeEn(MONEDA_PLATAFORMA, …)` es byte a byte `moneyTope` (lo fija la guardia 359), así
  que `CierresAdminIndemnizacion.test.tsx` sigue esperando su literal sin cambios.

## 5. Autorización y módulos

No hay operación, acción ni ruta nueva, y ninguna pantalla cambia quién la ve. La moneda y el impuesto
llegan por el proveedor del layout. SLT-235 los resolvió en el servidor con el `organizacionId` de
la sesión, nunca de la petición. No hay puerta de módulo nueva.

## 6. Descargas de cierres del admin (R10, R11; P2)

### 6.1 Fuente única de los encabezados con impuesto

Módulo nuevo **`app/(app)/cierres-admin/_components/encabezados-con-impuesto.ts`**: puro, sin React
y sin el sufijo `-descarga-columnas` (no declara columnas de export).

```ts
/** Clave de columna → su encabezado con el impuesto que se le pase. */
export const ENCABEZADO_CON_IMPUESTO: Readonly<Record<string, (impuesto: string) => string>> = {
  fleteConIva: rotuloFleteConImpuesto,                 // «Flete + X» (SLT-240)
  comisionConIva: rotuloComisionConImpuesto,           // «Comisión + X» (SLT-240)
  fleteDevolucionConIva: rotuloFleteDevConImpuesto,    // «Flete por devolución a origen + X»
  ivaFlete: (i) => `${i} del flete`,
  ivaComisionCod: (i) => `${i} de la comisión`,
  ivaFleteDevolucion: (i) => `${i} del ${FLETE_NO_ENTREGADAS_LABEL.toLowerCase()}`,
  ivaIncluido: (i) => `De eso, ${i}`,
  ivaFulfillment: (i) => `${i} de fulfillment`,
  ivaFacturado: rotuloImpuestoFacturado,               // «X facturado»
};

/** El encabezado base de una clave: el de la plataforma. Lo usan las declaraciones de columnas. */
export function encabezadoBase(clave: keyof typeof ENCABEZADO_CON_IMPUESTO): string;

/**
 * Sustituye el encabezado de las columnas de la tabla cuyo encabezado es HOY el base, y deja las
 * demás tal cual (mismos objetos). Con `impuesto === IMPUESTO_ROTULO` devuelve EL MISMO arreglo.
 */
export function conImpuestoEnColumnas(columnas: DescargaColumna[], impuesto: string): DescargaColumna[];

/** Lo mismo sobre cada hoja de un libro; sin libro, el resultado tal cual. */
export function conImpuestoEnHojas<H extends DescargaHoja>(hojas: H[], impuesto: string): H[];
export function conImpuestoEnResultado(r: DescargaFilasResult, impuesto: string): DescargaFilasResult;
```

- `DescargaColumna` y `DescargaHoja` vienen de `@/lib/types/descarga`. `DescargaFilasResult` vive
  en `components/shared/DataTable.tsx` y se importa con `import type`, así que el módulo sigue
  sin React en tiempo de ejecución.
- **Solo se sustituye un encabezado que hoy es el base.** Una columna con la misma clave y otro
  rótulo no se toca. Así el módulo no puede renombrar por accidente una columna que no conoce.
- **Mismo arreglo con el rótulo de la plataforma.** `DescargarCierresButton` resuelve las columnas
  una vez porque son dependencias del hook de preferencia: con CR la identidad no cambia (R12). Con
  otro país, el arreglo nuevo se memoriza con `useMemo([impuesto])`.
- En `cierre-labels.ts`:
  - nueva `rotuloFleteDevConImpuesto(impuesto)`;
  - nueva `rotuloImpuestoFacturado(impuesto)`;
  - `FLETE_CON_IVA_LABEL`, `COMISION_CON_IVA_LABEL`, `FLETE_DEV_CON_IVA_LABEL` e
    `IVA_FACTURADO_LABEL` se calculan con su función e `IMPUESTO_ROTULO`. El texto es byte a byte el
    de hoy y no cambia ningún import de SLT-244.
- **R11.** Los encabezados base salen de `encabezadoBase(clave)`. Archivos de columnas que cambian:
  - `cierres-gestiones-modelo-nuevo-descarga-columnas.ts`: los 5 encabezados con «IVA»;
  - `cierres-resumen-modelo-nuevo-descarga-columnas.ts` y
    `cierres-bodega-modelo-nuevo-descarga-columnas.ts`: «IVA facturado»;
  - `cierres-gestiones-fundida-descarga-columnas.ts`: ya los lee de `cierre-labels.ts` y no cambia.

  Después del cambio, ninguno de los cuatro tiene `\bIVA\b` fuera de comentarios. Lo comprueba un
  caso con `quitarComentarios`, con su contraprueba sobre una fuente inventada.

### 6.2 Dónde se aplica

Los libros se arman en el navegador, en componentes de cliente que ya tienen el hook a mano:

| Archivo | Cambio |
|---|---|
| `CierresAdminModule.tsx` | Los dos `obtenerResumenCierres(…)` (pendientes e histórico) pasan por `conImpuestoEnResultado(…, impuesto)`. |
| `CierresBodegaAdminModule.tsx` | Igual con sus dos `obtenerResumenCierresBodega(…)`. |
| `ConsolidacionBodegaModule.tsx` | Igual con su `obtenerResumenCierresBodega(…)` (solicitados). |
| `DescargarGestionesDialog.tsx` | El libro de `libroGestiones(…)` pasa por `conImpuestoEnHojas(…, impuesto)`. El componente lee el hook y se lo pasa a la función local que lo arma. |
| `DescargarCierresButton.tsx` | `COLUMNAS_DETALLE_POR_AUDIENCIA[audiencia]` pasa por `conImpuestoEnColumnas` dentro de un `useMemo`. Así el selector y la hoja «Gestiones modelo anterior», que recibe las columnas marcadas, dicen el impuesto del país. |

- **No cambia ninguna firma de las funciones puras de descarga** (`libroGestiones`,
  `libroResumenCierres`, `obtenerResumenCierres*`, `columnas…Para`, `fila…`): las ocho suites que las
  llaman (`tests/unit/descarga/cierres-*`, `tests/components/descarga/*`) quedan verdes sin tocarlas
  (alternativa 1).
- **Las claves no cambian.** `fleteConIva`, `ivaFacturado`… son nombres internos (SL-21) y forman el
  contrato de la preferencia de columnas guardada.
- **Las celdas no cambian.** Los importes ya salen crudos. El texto de la tarifa («Monto fijo
  ₡3.500 · …») se queda con `money(` (P3, SLT-244). Por eso
  `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` no entra en el censo de R15.

## 7. Guardias y tests que cambian de forma (R8, R15, R16)

- **Censo R18 de SLT-235** (`CENSO_MONEDA_DEL_PAIS`): nuevo bloque «SLT-243» con 10 archivos.
  - Son `CierreDiaModule.tsx`, `AjustarPagoMensajeroDialog.tsx`, `MarcaAjustado.tsx`,
    `ConsolidacionBodegaModule.tsx`, `PendienteLiquidarBadge.tsx`, `pago-mensajero-labels.ts`,
    `CorregirPagosDialog.tsx`, `CierresAdminModule.tsx`, `RegistrarPagoMensajeroDialog.tsx` y
    `PagoMensajeroSeccion.tsx`.
  - Quedan fuera, con motivo escrito en el bloque:
    - `cierre-detalle-shared.tsx` y `cierre-factura.tsx` (P1);
    - `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` (P3).
  - El caso de SLT-242 «los 17 archivos de la analítica» corta hoy hasta el final
    (`slice(findIndex(…))`). Pasa a cortar 17 entradas (`slice(i, i + 17)`), como ya hizo SLT-241
    con el suyo. No cambia lo que espera.
  - Caso nuevo, igual a los anteriores: los 10 de SLT-243 están en el censo y dan rojo con `money(`
    y con `formatMontoString(`.
- **`pais-sin-literales` (R16):** el archivo de excepciones no se edita. Un caso del test nuevo
  afirma que `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-243")` es `[]` y que
  `TOPE_EXCEPCIONES` vale como mucho 12 (`toBeLessThanOrEqual`, como las rebanadas anteriores).
- **R8 por typecheck:** `@ts-expect-error` en `mensajeDeCuadre(l, m)`,
  `PAGO_MENSAJERO_TEXTO.registrado("1.00")` y `PAGO_MENSAJERO_TEXTO.anulado("1.00")`.
  `pnpm run typecheck` falla si alguno deja de ser un error.

## 8. Mapa R → test

Archivo nuevo: `tests/components/moneda-del-pais-cierres-admin.test.tsx`. Cada caso de pantalla se
monta de tres formas: con `MonedaDelPaisProvider` + `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` +
«IVA» y sin proveedor. Las acciones se doblan como en los tests que ya existen de cada pantalla
(`CierresAdminPagoMensajero.test.tsx`, `CierresAdminIndemnizacion.test.tsx`,
`CorregirPagosCierre.test.tsx`…).

| R | Test |
|---|---|
| R1 | `moneda-del-pais-cierres-admin.test.tsx`: `/cierre-dia` con un cierre (dobles de `CierreDiaModule`) pinta el total general y el pago al mensajero en «€» con espacio de miles; sin importe, «—» |
| R2 | `moneda-del-pais-cierres-admin.test.tsx`: `AjustarPagoMensajeroDialog` pinta el pago vigente en «€»; tras confirmar (acción doblada), el pago nuevo y el total del cierre en «€» |
| R3 | `moneda-del-pais-cierres-admin.test.tsx`: `MarcaAjustado` con un ajuste pinta «€… → €…» |
| R4 | `moneda-del-pais-cierres-admin.test.tsx`: `ConsolidacionBodegaModule` con consolidables pinta sus 4 totales agregados en «€» |
| R5 | `moneda-del-pais-cierres-admin.test.tsx`: `TotalesPanel` pinta efectivo, SINPE, transferencia, general y neto en «€» |
| R6 | `moneda-del-pais-cierres-admin.test.tsx`: `PendienteLiquidarBadge` en «€»; `PAGO_MENSAJERO_TEXTO.registrado("50000.00", MONEDA_DE_PRUEBA)` = «Pago de €50 000 registrado.» y `anulado` análogo; `RegistrarPagoMensajeroDialog` muestra el aviso con «€» (toast doblado) |
| R7 | `moneda-del-pais-cierres-admin.test.tsx`: `CorregirPagosDialog` con un monto con céntimos y el proveedor de prueba pinta el aviso = `mensajeDeCuadre(lineas, monto, MONEDA_DE_PRUEBA)`. Y `moneda-del-pais-pantallas.test.tsx` (R11 de SLT-235) sigue verde |
| R8 | `moneda-del-pais-cierres-admin.test.tsx`: los tres `@ts-expect-error` de §7 (los comprueba `pnpm run typecheck`) |
| R9 | `moneda-del-pais-cierres-admin.test.tsx`: el sub-modal de indemnización (dobles de `CierresAdminIndemnizacion.test.tsx`) con el proveedor de prueba. La ayuda contiene `formatearTopeEn(MONEDA_DE_PRUEBA, INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA)`. Un monto de 11 dígitos da el error de exceso con el mismo tope. Ese tope sin espacios pasa `montoValido(…, INDEMNIZACION_MONTO_MAX)` |
| R10 | `moneda-del-pais-cierres-admin.test.tsx`: (a) `conImpuestoEnColumnas` con «IGV» sobre las columnas de las cuatro declaraciones da «IGV del flete», «De eso, IGV», «IGV facturado», «Flete + IGV»…; las claves y el orden no cambian; una columna con clave conocida y otro rótulo no se toca. (b) Con `IMPUESTO_ROTULO` devuelve el mismo arreglo (`toBe`). (c) `conImpuestoEnResultado` sobre un resultado con libro cambia solo los encabezados; sin libro, el mismo objeto. (d) `DescargarCierresButton` con el proveedor de prueba lista «Flete + IGV» en el selector |
| R11 | `moneda-del-pais-cierres-admin.test.tsx`: censo «sin IVA» de los 3 archivos de columnas que cambian, de `cierres-gestiones-fundida-descarga-columnas.ts` y de `encabezados-con-impuesto.ts` (fuente sin comentarios), con su contraprueba |
| R12 | Cada caso de R1–R7, R9 y R10 con `MONEDA_CR` + «IVA» da el mismo texto que sin proveedor. Y siguen verdes sin cambiar ningún valor esperado: `CierresAdminPagoMensajero`, `CierresAdminIndemnizacion`, `CorregirPagosCierre`, `CorregirResultadoCierre`, `DineroIdentidadesEnPantalla`, `GestionarOrdenPanelCentimos`, las suites de `tests/unit/descarga/cierres-*` y `tests/components/descarga/*` y `dinero-centimos-cuando-existen.guardia.test.ts` |
| R13 | `moneda-del-pais-cierres-admin.test.tsx`: sin proveedor, cada pantalla = `formatearMontoEn(MONEDA_PLATAFORMA, v, SIN_MONTO_RAYA)` y los encabezados dicen «IVA» |
| R14 | El reviewer comprueba en el diff que no hay sumas ni restas nuevas, ni claves con «iva» renombradas, ni archivos de `components/private/cierres/**`, wallet o plataforma. En `cierre-factura.tsx` y `cierre-detalle-shared.tsx` solo cambia `TotalesPanel`. Las celdas de `fila…` de descarga no cambian (las suites de R12) |
| R15 | `moneda-del-pais-pantallas.test.tsx > censo de R18` con los 10 archivos de §7 y el caso de rojo con `money(` / `formatMontoString(` |
| R16 | `moneda-del-pais-cierres-admin.test.tsx`: ninguna excepción con `ficha === "SLT-243"` y `TOPE_EXCEPCIONES` ≤ 12; `pais-sin-literales.guardia.test.ts` verde sin tocarlo |

## 9. Riesgos

- **El typecheck señala llamadores que el Grep no vio** (otro `mensajeDeCuadre` u otro
  `PAGO_MENSAJERO_TEXTO.registrado`). Si es de esta ficha, se añade a «Archivos esperados» antes del
  PR. Si es de otra, se avisa al leader y no se toca.
- **Las guardias de los cierres leen el fuente.** `cierres-retirados`, `pagos-captura`,
  `liquidacion-money-safe`, `factura-contraste`, `impresion-flujo` y `cierre-bodega-vocabulario`
  leen el fuente de estos archivos.
  - Ninguna exige hoy `money` en los archivos que cambian (Grep del 2026-11-23).
  - Si alguna se pone roja por el cambio de formateador, el implementer para y avisa: no se relaja
    una guardia de paso.
- **Pantalla mixta en SLT-244.** Hasta que SLT-244 migre la fila, `FilaGestion` pinta la marca
  «ajustado» con la moneda del país y el resto con la de la plataforma. Solo se nota fuera de
  Costa Rica.
- **Memo de 10 min.** Un cambio de moneda o de impuesto tarda hasta 10 min en verse por instancia
  (coste aceptado en SLT-235).

## 10. Alternativas descartadas

1. **Pasar `impuesto` (y `moneda`) como argumento obligatorio a las funciones puras de descarga**
   (`libroGestiones`, `columnas…Para`, `filaGestionModeloNuevo`), como hizo SLT-240 con
   `columnasDescargaOrdenes`. Es el camino más explícito. Pero cambia la firma de 8 funciones que
   llaman ~140 veces 8 suites de tests (`tests/unit/descarga/cierres-*`), y sumaría unos 8 archivos
   de tests al PR. El post-proceso da el mismo archivo con un solo punto de sustitución, probado
   aparte, y deja las suites como guardia de que las celdas no cambian.
2. **Migrar también el código sin montar de `cierre-factura.tsx` y `cierre-detalle-shared.tsx`**, para
   que los dos archivos entren en el censo. Son unas 300 líneas que nadie ve y que SLT-146 borra
   (P1).
3. **Pasar la moneda por prop a `MarcaAjustado`** desde quien la monta. Obliga a tocar
   `FilaGestion.tsx` (SLT-244). Leer el hook dentro es el patrón de `PriceLabel` (SLT-235).
4. **Un `useMoney()` que devuelve `money` ya ligado a la moneda del país.** Ahorra líneas, pero
   esconde la moneda detrás de un nombre que hoy significa «la de la plataforma», y la decisión
   cerrada pide la moneda explícita (SLT-235, alternativa 2).
5. **Reescribir los encabezados con «IVA» por texto (`replace(/\bIVA\b/, impuesto)`)** sobre
   cualquier columna. Es más corto, pero tocaría cualquier encabezado futuro que diga «IVA» por otra
   razón, y no deja una fuente única para R11. El mapa por clave, con la comprobación del rótulo
   base, solo cambia lo que conoce.

## 11. Si P1, P2 o P3 se cierran distinto

- **P1 = sí:**
  - entran `cierre-factura.tsx` y `desglose-pago.ts`, y todos los componentes de dinero de
    `cierre-detalle-shared.tsx`;
  - las notas con «IVA» de la liquidación pasan a funciones del impuesto;
  - los dos archivos entran en el censo;
  - en total, unas +300 líneas de producción y +2 archivos.
- **P2 = no:** salen §6, R10, R11, el bloque 4 de `tasks.md` y 8 archivos de «Archivos esperados».
- **P3 = esta ficha:**
  - entran `fila-gestion-labels.ts` (para `porcentajeDe` con moneda) y los rótulos `IVA_*` como
    funciones;
  - toca archivos de `components/private/cierres/**`, lo que solapa con SLT-244: habría que
    reacotar esa ficha.

## 12. Tamaño

Ver `tasks.md > Tamaño`: 24 archivos (20 de producción, 4 de tests), el 60% del tope de 40.

## Dependencias de terceros

Ninguna nueva.
