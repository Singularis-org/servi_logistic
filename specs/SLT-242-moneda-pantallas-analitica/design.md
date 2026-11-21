# SLT-242 — Moneda del país en pantallas: analítica · design

> Alcance, «Lo que NO entra» y decisiones cerradas en `requirements.md`; aquí solo va el cómo. Las
> referencias `R<n>` son las de `requirements.md`. Rebanada 4 de 8 del corte de SLT-235. El patrón de
> pantalla (proveedor, hook, censo) es el de `specs/SLT-235-moneda-pais-pantallas/design.md` §6–§8; el
> de «la acción lee el país una vez y lo pasa explícito hacia abajo», el de
> `specs/SLT-241-moneda-pantallas-tarifas/design.md` §3; el de «una base con el rótulo de caída y una
> función que pone el del país», el de `specs/SLT-240-moneda-pantallas-ordenes/design.md` §5.

## Lo que ya existe

Busqué el 2026-11-21 con `moneda`, `analitica`, `analítica`, `formatearValor`, `money(`,
`formatMontoString`, `formatMonto`, `monedaConfig.`, `IVA`, `ingreso_iva` y `paisParaPantallas` en tres
sitios:
- `feature_list.json`, en todos los estados;
- `specs/`;
- el código.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» (`done`, en `dev`) | `providers/MonedaDelPaisProvider.tsx`, `hooks/use-moneda-del-pais.ts`, `lib/services/pais-para-pantallas.ts` (`paisParaPantallasDelActor`, memo de 10 min), `construirPaisService` (`lib/actions/_shared/paises-plataforma.ts`), censo de R18 en `tests/components/moneda-del-pais-pantallas.test.tsx` | Se **reutiliza** entero. Las pantallas de cliente leen `useMonedaDelPais()`. La acción financiera lee el país con `paisParaPantallasDelActor` (§6). No se toca el proveedor, el memo ni el layout. |
| SLT-235: `PriceLabel` pasó a `"use client"` para leer el hook | `components/shared/PriceLabel.tsx` | Precedente de §4.2: una hoja de cliente que lee el hook y la monta un componente de servidor. |
| SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes» (PR #271) | `rotulos-con-impuesto.ts`, `conImpuestoDelPais` | Se sigue su **patrón** para la etiqueta de la métrica del impuesto (§7). No se reutiliza código suyo. |
| SLT-241 «Moneda e impuesto del país en pantallas: tarifas, configuración y ranking» (PR #275, base de esta rama) | `paisParaPantallasDelActor` en `guardarValoresTarifa`; parámetro con default + test de cableado | Mismo camino para la acción financiera (§6). Su test «los 16 archivos de la rebanada 3» corta el censo hasta el final: se acota a 16 entradas (§8). |
| SL-21 «Moneda e impuestos configurables por país» | `lib/config/moneda.ts` (`formatearMontoEn`, `FormatoMoneda`, `MONEDA_PLATAFORMA`, `SIN_MONTO`, `SIN_MONTO_RAYA`) | Se reutiliza `formatearMontoEn`. |
| Lista de excepciones de `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` (tope 14) | Tiene **2 entradas** a nombre de SLT-242: `lib/analytics/metrics.ts` (palabra «IVA») y `lib/services/AnaliticaFinancieraService.ts` (`monedaConfig.currency`). Salen las 2 y el tope pasa a 12 (R16). |
| Guardias de la analítica | `tablero-financiero.guardia.test.ts` (carpeta `financiero/` sin `"use client"`, sin props-función, al menos un `formatearValor(`), `analytics-paquete-guard.test.ts` (el paquete no usa `useEffect`/`useState` ni acciones; `formato.ts` debe nombrar `formatMonto`), `modulo-puro.guardia.test.ts` (`metrics.ts` es puro), `AnaliticaPage.test.tsx` (la página no importa `lib/actions`, `lib/services` ni `lib/repositories`) | Condicionan el diseño: §4.2 evita leer el país en la página y en la carpeta `financiero/`; §8 ajusta las dos aserciones que nombran el formateador viejo. |
| SLT-71 «Geografía jerárquica: consultas de tránsito y analítica sobre el nodo» (`in_progress`) | Repositorios de conteo de la analítica | No se solapa: toca SQL de conteos, no importes ni pantallas. |
| SLT-236, SLT-237, SLT-238, SLT-243 a SLT-246 | `feature_list.json` | Fichas hermanas. Ninguna toca la analítica. |

No apareció ninguna ficha ni código que ya resuelva R1–R11.

## 1. Resumen

1. `formatearValor(valor, unidad, moneda)` gana la moneda, obligatoria por tipo cuando la unidad puede
   ser `moneda` (R6). Los conteos, porcentajes y duraciones no la necesitan ni cambian (R5).
2. Los componentes de cliente del paquete leen `useMonedaDelPais()` y la pasan (R2). Los de servidor
   (`TableroFinanciero`, `PanelConciliacion`, `KpiCard`, `KpisFinancieros`) pintan el importe con una
   hoja de cliente nueva que lee el hook (R1, R4).
3. La tabla y el detalle de productos pasan de `money(` a `formatearMontoEn(moneda, …, SIN_MONTO_RAYA)`
   (R3).
4. La acción financiera lee el país una vez por consulta y lo pasa al servicio por constructor: el
   servicio pone el código de la moneda en cada importe y el nombre del impuesto en la etiqueta de su
   métrica (R7–R10).
5. `metrics.ts` deja de escribir «IVA»: etiqueta y descripciones lo toman de `IMPUESTO_ROTULO` (R11).
6. Salen 2 excepciones y los archivos de pantalla entran en el censo de SLT-235 (R15, R16).

## 2. Modelo de datos

No hay tabla, columna, migración ni política nueva. No hay ruta nueva ni operación nueva.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda (formato) | `pais.moneda_*` → `PaisDTO.moneda` → `PaisParaPantallas.moneda` | Pantallas: `useMonedaDelPais()` |
| Código de la moneda | `PaisParaPantallas.moneda.codigo` | Servidor: `lib/actions/analitica-financiera.ts` → `AnaliticaFinancieraService` → campo `moneda` de cada `ImporteAnalitico` (y la columna `moneda` de la descarga, que ya lo copia) |
| Nombre del impuesto | `PaisParaPantallas.impuestoNombre` | Servidor: la misma acción → etiqueta de `ingreso_iva` en la respuesta |
| Caídas | `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO` | El hook sin proveedor (R13); `paisParaPantallasDelActor` en el servidor (R10) |

El contrato `ImporteAnalitico.moneda: string` (código ISO) **no cambia de forma**: cambia de dónde sale
el valor. Su comentario en `lib/types/analitica-financiera.ts` se corrige.

## 3. Formateador de la analítica (R5, R6)

`components/private/analytics/formato.ts`:

```ts
import { formatearMontoEn, monedaConfig, SIN_MONTO, type FormatoMoneda } from "@/lib/config/moneda";

type UnidadSinMoneda = Exclude<MetricaUnidad, "moneda">;

/** Conteo, porcentaje o duración: no hay dinero, no hace falta moneda. */
export function formatearValor(valor: number | null, unidad: UnidadSinMoneda): string;
/** Una unidad que puede ser `moneda` (la de una métrica, una columna, una prop): la moneda es obligatoria. */
export function formatearValor(valor: number | null, unidad: MetricaUnidad, moneda: FormatoMoneda): string;
```

- `case "moneda"` → `formatearMontoEn(moneda, valor)`. Mismo marcador `SIN_MONTO` para `null`/`NaN`,
  que se decide antes del `switch` como hoy.
- **Por qué dos firmas y no un tercer parámetro opcional:** con un default, un llamador que olvide la
  moneda pinta en silencio con la de la plataforma, y con CR nadie lo ve. Con las dos firmas, el
  typecheck rechaza `formatearValor(x, unidad)` cuando `unidad` es `MetricaUnidad` (R6). Los ~25
  llamadores con un literal `"conteo"`, `"porcentaje"` o `"segundos"` (o una constante `as const` de
  esos) no cambian.
- La implementación recibe `moneda?: FormatoMoneda`. Si llega `"moneda"` sin moneda (solo posible desde
  código sin tipos), **lanza** con un mensaje que nombra la unidad: es un fallo de programación, no una
  caída.
- `monedaConfig.locale` se queda para conteos, porcentajes y duraciones (el censo de SLT-235 lo
  admite). El import de `formatMonto` sale.
- Con `MONEDA_PLATAFORMA`, el texto es byte a byte el de `formatMonto` (los dos son
  `formatearMontoEn(MONEDA_PLATAFORMA, n)`), así que con CR nada cambia (R12).

## 4. Componentes del paquete (R2, R13)

### 4.1 Los de cliente leen el hook

| Archivo | Cambio |
|---|---|
| `KpiValor.tsx` | `moneda = useMonedaDelPais()`; `formatear = useCallback((n) => formatearValor(n, unidad, moneda), [unidad, moneda])`; la rama `null` igual. |
| `GraficaBarras.tsx`, `GraficaDonut.tsx`, `GraficaLineas.tsx`, `GraficaRanking.tsx`, `GraficaReparto.tsx` | Leen el hook y pasan `formatearValor(valor, unidad, moneda)` al lienzo y a la cifra. Las llamadas con `"porcentaje"` no cambian. |
| `SerieTextual.tsx` | Lee el hook: `formatearValor(punto.valor, unidad, moneda)`. Lo montan solo las gráficas, que son de cliente. |
| `TablaResumen.tsx` | Lee el hook una vez y lo usa en el `render` de cada columna. `totalizar` no cambia. |

- Ninguno gana `useEffect` ni `useState` (lo exige `analytics-paquete-guard.test.ts`).
- `GraficaReparto` y `SerieTextual` no declaran `"use client"`: los importan solo módulos de cliente.
  Si el build señala que alguno se monta desde un componente de servidor, se le pone `"use client"`.

### 4.2 Hoja de cliente para los de servidor: `CifraAnalitica.tsx` (nuevo)

`TableroFinanciero`, `PanelConciliacion` y `KpisFinancieros` son componentes de servidor, y
`KpiCard` se monta desde ellos. No pueden leer un contexto. Tampoco pueden recibir la moneda de la
página: `AnaliticaPage.test.tsx` prohíbe que `page.tsx` importe `lib/services`, y
`tablero-financiero.guardia.test.ts` prohíbe `"use client"` en la carpeta `financiero/` (alternativa 2).

```tsx
// components/private/analytics/CifraAnalitica.tsx
"use client";
/** Un valor de la analítica con la moneda del país. Devuelve solo el texto (un fragmento). */
export function CifraAnalitica({ valor, unidad }: { readonly valor: number | null; readonly unidad: MetricaUnidad }): JSX.Element;
/** Un importe STRING (sin pasar por `number`) con la moneda del país; sin importe, `SIN_MONTO`. */
export function MontoAnalitico({ monto }: { readonly monto: string | null }): JSX.Element;
```

- Devuelven un fragmento con el texto, sin envoltorio. El DOM de quien la monta no cambia: en
  `` <p>{`${TEXTOS.bruto}: `}<CifraAnalitica … /></p> `` los dos textos quedan como nodos de texto
  hijos del mismo `<p>`, y `getByText("Bruto: ₡1.000")` sigue encontrándolo.
- Props planas y serializables (un número, una unidad, un string): no hay prop-función que cruce la
  frontera RSC. Es el precedente de `PriceLabel` (SLT-235).

| Archivo | Cambio |
|---|---|
| `components/private/analytics/KpiCard.tsx` | La línea de variación: `` {`${textoDelSigno(variacion)} `}<CifraAnalitica valor={Math.abs(variacion.delta)} unidad={unidad} />{` ${variacion.etiqueta}`} ``. Sigue sin `"use client"`. |
| `app/(app)/analitica/_components/financiero/TableroFinanciero.tsx` | `TotalDelDto` y la línea del bruto de `PanelKpi`: `<CifraAnalitica valor={aNumero(…)} unidad={unidad} />` en vez de `formatearValor(…)`. Las gráficas y la tabla ya leen el hook (§4.1). |
| `app/(app)/analitica/_components/financiero/PanelConciliacion.tsx` | Las tres cifras del cuadre: `<CifraAnalitica valor={aNumero(cifra.importe)} unidad={UNIDAD.importe} />`. El aviso de descuadre sigue con `formatearValor(n, UNIDAD.conteo)`. |
| `app/(app)/analitica/_components/finanzas/KpisFinancieros.tsx` | `<MontoAnalitico monto={kpi.monto} />` en vez de `formatMontoString(kpi.monto)`. El importe no pasa por `number`, como pide la cabecera del archivo (R4). |

## 5. Pantallas de cliente de la analítica (R3)

### 5.1 Tabla de productos (`ProductosTabla.tsx`)

- `textoPendiente(recaudado, ordenes, moneda: FormatoMoneda)`: moneda obligatoria, como el resto de
  funciones de texto con moneda de SLT-241. Su único llamador de producción le pasa el hook; los dos de
  `ProductosTablaDinero.test.tsx` pasan `MONEDA_PLATAFORMA` sin cambiar el valor esperado.
- `columnasEscritorio(conTienda, conDinero, moneda)` y `columnasTelefono(conTienda, conDinero, moneda)`:
  las celdas de dinero pintan `formatearMontoEn(moneda, importeDeFila(…), SIN_MONTO_RAYA)`, el mismo
  marcador que `money(null)`. `DetalleDeFila` recibe la moneda por prop.
- `ProductosTabla` lee el hook una vez y la pasa.

### 5.2 Detalle de dinero (`DineroProductoDetalle.tsx`)

`ImporteCabecera` e `Importe` leen el hook: `formatearMontoEn(moneda, valor, SIN_MONTO_RAYA)`. Sus dos
textos «IVA» no se tocan (P1, R14). Sigue en el censo de la 359 (`DineroIdentidadesEnPantalla`), que
acepta `formatearMontoEn` desde SLT-240.

### 5.3 Lo que no cambia

- `KpiValor` conserva `DECIMALES_DE_LA_CUENTA.moneda = 0`: cambia la moneda del texto, no los pasos de
  la cuenta (R14). El último fotograma de un KPI en moneda con céntimos ya hoy sale cuadrado al entero;
  no es de esta ficha y con CR no se toca.
- `FinanzasDiarioBarras.tsx` pinta con `GraficaBarras` (unidad `moneda`): hereda la moneda del país sin
  tocarlo.
- `ActualizarAnalitica` y `CohorteCargaTabla` usan `monedaConfig.locale` para fechas y conteos, que el
  censo admite. No se tocan; las fechas son de SLT-92.

## 6. Servidor: acción y servicio (R7–R10)

### 6.1 Servicio (`lib/services/AnaliticaFinancieraService.ts`)

```ts
/** SLT-242: lo que el servicio necesita del país de la empresa. */
export interface PaisDeLaAnalitica {
  readonly monedaCodigo: string;
  readonly impuestoNombre: string;
}
/** La caída: la moneda y el rótulo de la plataforma (CR hoy). */
export const PAIS_DE_LA_PLATAFORMA: PaisDeLaAnalitica = {
  monedaCodigo: MONEDA_PLATAFORMA.codigo,
  impuestoNombre: IMPUESTO_ROTULO,
};

constructor(
  ingresos, recaudo, cuentasPorPagar, conciliacion,
  logger = defaultLogger,
  umbralDescuadre = UMBRAL_AVISO_DESCUADRE_CONCILIACION,
  reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
  private readonly pais: PaisDeLaAnalitica = PAIS_DE_LA_PLATAFORMA,   // SLT-242
)
```

- `importeConNeto(bruto, neto, moneda: string)` e `importeSoloBruto(bruto, moneda: string)` reciben el
  código; todos sus llamadores pasan `this.pais.monedaCodigo`. Siguen siendo los dos únicos sitios que
  escriben `moneda` (S2/R29 de la 127). El import de `monedaConfig` sale (R16).
- `cabecera(consulta)`: `etiqueta: etiquetaEnElPais(consulta.metrica, this.pais.impuestoNombre)` (§7).
- **Por qué por constructor y con default** (como SLT-241 §5.2): el país es el mismo para toda la
  consulta, así que es una dependencia del servicio. El default deja verdes sin tocarlos los 6 sitios
  de tests que construyen el servicio (`_dobles-analitica-financiera.ts` y otros cuatro). El riesgo
  del default lo cierra el test de cableado de §6.2.

### 6.2 Acción (`lib/actions/analitica-financiera.ts`)

```ts
export interface AnaliticaFinancieraActionDeps {
  // … las de hoy
  /** SLT-242 (R9): la lectura del país para pantallas; en producción, `construirPaisService()`. */
  readonly paisService?: Pick<IPaisService, "paraPantallas">;
}
```

- Después del `forbidden` y solo si no hay `deps.service` (R9):

  ```ts
  const pais = await paisParaPantallasDelActor(actor?.organizacionId ?? null, deps.paisService ?? construirPaisService());
  const service = deps.service ?? construirServicio(logger, { monedaCodigo: pais.moneda.codigo, impuestoNombre: pais.impuestoNombre });
  ```

  Una entrada inválida o un acceso denegado no leen el país, igual que hoy no abren conexión (R10 de
  la 127).
- **La empresa sale del actor** (`resolveActorFromSession`), no de `empresaDeLaPeticion()`: este
  archivo no importa `next/headers` y el actor es la única fuente de «quién eres» (R15 de la 127). Es
  lo que hacen el layout y `/paquete`.
- **Caídas (R10):** `paisParaPantallasDelActor` nunca lanza: sin moneda o sin impuesto da los de la
  plataforma y avisa; si la lectura falla, da los de la plataforma y deja el error en el log. Sin
  empresa, los de la plataforma sin consulta.
- **Coste:** el tablero pide 8 métricas en paralelo, o sea 8 llamadas a la acción. Todas pasan por el
  memo de 10 min. Con el memo frío (el layout de la misma página ya suele haberlo llenado), son como
  mucho 8 lecturas de una fila, cada 10 min por empresa e instancia (§11).
- La función que arma `PaisDeLaAnalitica` es local y no se exporta: el archivo es `"use server"`.

## 7. Catálogo de métricas (R8, R11)

`lib/analytics/metrics.ts` (sigue puro: `IMPUESTO_ROTULO` es una constante sin imports):

```ts
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";

/** La etiqueta de la métrica del impuesto, con el nombre que se le pase. */
export function rotuloIngresoPorImpuesto(impuesto: string): string; // `Ingreso por ${impuesto}`

/** SLT-242 (R8): la etiqueta de una métrica con el impuesto del país; la de las demás, tal cual. */
export function etiquetaEnElPais(metrica: Pick<Metrica, "id" | "etiqueta">, impuesto: string): string;
```

- En el catálogo, `ingreso_iva.etiqueta = rotuloIngresoPorImpuesto(IMPUESTO_ROTULO)`: con CR,
  «Ingreso por IVA» como hoy.
- `etiquetaEnElPais` consulta un mapa `{ ingreso_iva: rotuloIngresoPorImpuesto }` de módulo. Así la
  regla vive en el catálogo y el servicio no ramifica por id de métrica.
- Las dos descripciones con «IVA» (`ingreso_iva` y `ganancia_empresa`) interpolan `${IMPUESTO_ROTULO}`
  en las 5 apariciones: el texto es byte a byte el de hoy. Ninguna pantalla pinta `descripcion` (Grep:
  no hay lector en `app/` ni en `components/`), así que no se lee el país para ellas (R11).
- Los comentarios con «IVA» se quedan: la guardia los ignora.
- La etiqueta llega a la pantalla por la respuesta financiera (`datos.etiqueta`): el título del panel y
  la columna `metrica` de la descarga (`analitica-financiera-descarga-columnas.ts`, que no cambia).

## 8. Guardias y tests que cambian de forma (R6, R15, R16)

- **Censo de R18 de SLT-235** (`CENSO_MONEDA_DEL_PAIS`), bloque «SLT-242», 17 archivos: `formato.ts`,
  `CifraAnalitica.tsx`, `KpiValor.tsx`, `KpiCard.tsx`, las cinco `Grafica*.tsx`, `SerieTextual.tsx`,
  `TablaResumen.tsx`, `TableroFinanciero.tsx`, `PanelConciliacion.tsx`, `ProductosTabla.tsx`,
  `DineroProductoDetalle.tsx`, `KpisFinancieros.tsx` y `FinanzasDiarioBarras.tsx`. La prueba «rojo si
  un archivo REAL del censo vuelve a un formateador implícito» los cubre sin cambiarla.
  - El test de SLT-241 «los 16 archivos de la rebanada 3» corta desde `tarifas-textos.ts` hasta el
    final: pasa a cortar 16 entradas (`slice(i, i + 16)`). No cambia lo que espera.
  - Un caso nuevo, igual al de SLT-241: los 17 de SLT-242 dan rojo con `money(` y con
    `formatMontoString(`.
- **`pais-sin-literales` (R16):** se quitan las 2 entradas de SLT-242, `TOPE_EXCEPCIONES = 12` y una
  línea nueva en «Bajadas» del comentario de cabecera. `FichaQueLoRetira` y `FICHAS_ADMITIDAS` no se
  tocan (SLT-240 P2).
- **`analytics-paquete-guard.test.ts`:** «el formato de moneda y el locale salen de lib/config/moneda»
  exige hoy que `formato.ts` nombre `formatMonto`. Pasa a exigir `formatearMontoEn`. La intención
  (el formato sale de `lib/config/moneda`) no cambia.
- **`tablero-financiero.guardia.test.ts`:** el contrapeso «los archivos que pintan importes formatean con
  la función del paquete» busca `formatearValor(`. Pasa a aceptar también `<CifraAnalitica`; si no,
  seguiría verde solo por el conteo del aviso de descuadre.
- **Llamadas de tests a `formatearValor` con una unidad que puede ser `moneda`** (lo exige el typecheck,
  R6): pasan `MONEDA_PLATAFORMA` como tercer argumento, sin cambiar ningún valor esperado. Son
  `analytics-formato.test.ts`, `AnalyticsTablaResumen.test.tsx`, `AnalyticsKpiCard.test.tsx`,
  `TableroFinanciero.test.tsx`, `PanelConciliacion.test.tsx` y
  `dinero-centimos-cuando-existen.guardia.test.ts`.

## 9. Autorización y módulos

No hay operación, acción ni ruta nueva. `consultarMetricaFinanciera` conserva su orden: puerta del
módulo `analitica`, actor de la sesión, validación, `forbidden` auditado, y **después** la lectura del
país (R9). La empresa del país sale del actor de la sesión, nunca del input. El memo es por
`organizacionId` (SLT-235 R8). La región financiera la siguen viendo solo los roles de `esAccesoTotal`.

## 10. Mapa R → test

Archivo nuevo: `tests/components/moneda-del-pais-analitica.test.tsx`. Cada caso de pantalla se monta
con `MonedaDelPaisProvider` y `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor.

| R | Test |
|---|---|
| R1 | `moneda-del-pais-analitica.test.tsx`: `TableroFinanciero` con un panel `bruto_y_neto` y uno `solo_bruto`, con el proveedor de prueba, pinta «Total neto», «Total bruto» y la línea «Bruto: …» en «€» con espacio de miles; `PanelConciliacion` pinta las tres cifras del cuadre y los totales por método en «€»; sin importe, `SIN_MONTO` |
| R2 | `moneda-del-pais-analitica.test.tsx`: `KpiCard` en moneda (cifra con movimiento reducido y variación), `TablaResumen` con una columna `moneda`, `GraficaBarras` y `GraficaReparto` (su `SerieTextual`) con el proveedor de prueba dan `formatearValor(v, "moneda", MONEDA_DE_PRUEBA)` |
| R3 | `moneda-del-pais-analitica.test.tsx`: `textoPendiente("10000.00", 1, MONEDA_DE_PRUEBA)` = «Pendiente de cierre: €10 000 (1 orden)»; `ProductosTabla` con dinero (acción doblada como en `ProductosTablaDinero.test.tsx`) pinta sus celdas en «€» y «—» sin importe; `DineroProductoDetalle` pinta sus importes en «€» |
| R4 | `moneda-del-pais-analitica.test.tsx`: `KpisFinancieros` con un KPI `ok` de monto `"1234.50"` y el proveedor de prueba pinta «€1 235»; `MontoAnalitico` con `null` pinta `SIN_MONTO` |
| R5 | `moneda-del-pais-analitica.test.tsx`: `formatearValor` con `"conteo"`, `"porcentaje"` y `"segundos"` da el mismo texto que antes; `KpiCard` en conteo con el proveedor de prueba = sin proveedor |
| R6 | `moneda-del-pais-analitica.test.tsx`: `// @ts-expect-error` en `formatearValor(1, "moneda")` y en `formatearValor(1, unidad)` con `unidad: MetricaUnidad`; sin error con `"conteo"` (lo comprueba `pnpm run typecheck`); y en ejecución, `"moneda"` sin moneda lanza |
| R7 | `moneda-del-pais-analitica.test.tsx`: `AnaliticaFinancieraService` con los dobles de `tests/unit/services/_dobles-analitica-financiera.ts` y `{ monedaCodigo: "XTS", impuestoNombre: "IGV" }` → cada `importe.moneda` del total y de las filas es «XTS» en una métrica de caja, en `cod_recaudado` (las dos vistas) y en las dos cuentas por pagar; sin el argumento, «CRC» |
| R8 | `moneda-del-pais-analitica.test.tsx`: con «IGV», `ingreso_iva` responde «Ingreso por IGV» y `ingreso_flete` su etiqueta del catálogo; `etiquetaEnElPais` puro con las 10 financieras |
| R9 | `moneda-del-pais-analitica.test.tsx`: `consultarMetricaFinanciera` con `getActor` de una empresa, `paisService` doble (país de prueba) y `AnaliticaFinancieraService` mockeado (`vi.mock`) → `paraPantallas` llamado con el `organizacionId` del actor y el servicio construido con `{ "XTS", "IGV" }`; con un filtro inválido, con un acceso denegado y con `deps.service`, `paraPantallas` no se llama |
| R10 | `moneda-del-pais-analitica.test.tsx`: igual que R9 con `paraPantallas` que lanza → el servicio se construye con `PAIS_DE_LA_PLATAFORMA`, la respuesta es `ok` y el error queda en `console.error`. La caída por país sin moneda o sin impuesto ya la prueba `pais-para-pantallas.test.ts` (SLT-235) |
| R11 | `pais-sin-literales.guardia.test.ts` en verde con `metrics.ts` fuera de la lista; en `moneda-del-pais-analitica.test.tsx`, `getMetrica("ingreso_iva").descripcion` y `getMetrica("ganancia_empresa").descripcion` contienen `IMPUESTO_ROTULO` y el fuente sin comentarios no tiene `\bIVA\b` |
| R12 | Cada caso de R1–R8 con `MONEDA_CR` + «IVA» da el mismo texto que sin proveedor, y `getMetrica("ingreso_iva").etiqueta` = «Ingreso por IVA». Y siguen verdes sin cambiar ningún valor esperado: `TableroFinanciero.test.tsx`, `PanelConciliacion.test.tsx`, `AnalyticsKpiCard.test.tsx`, `AnalyticsTablaResumen.test.tsx`, `ProductosTablaDinero.test.tsx`, `DineroIdentidadesEnPantalla.test.tsx`, `analytics-formato.test.ts`, `dinero-centimos-cuando-existen.guardia.test.ts`, `analitica-financiera-action.test.ts` y los de la descarga financiera |
| R13 | `moneda-del-pais-analitica.test.tsx`: sin proveedor, cada pantalla = `formatearMontoEn(MONEDA_PLATAFORMA, v)` |
| R14 | El reviewer comprueba en el diff: ninguna suma ni resta nueva; ningún id con «iva» renombrado; `DineroProductoDetalle.tsx` conserva sus dos textos «IVA»; `page.tsx` sin cambios (la sección de finanzas sigue comentada); `DECIMALES_DE_LA_CUENTA` sin cambios; ningún archivo de otra rebanada ni de plataforma |
| R15 | `moneda-del-pais-pantallas.test.tsx > censo de R18` con los 17 archivos de §8 y el caso de rojo con `money(` / `formatMontoString(` |
| R16 | `pais-sin-literales.guardia.test.ts` en verde (sin las 2 entradas, tope 12), y en `moneda-del-pais-analitica.test.tsx` `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-242")` = `[]` y `TOPE_EXCEPCIONES` = 12 |

## 11. Riesgos

- **Default en el servicio.** `AnaliticaFinancieraService` cae a `PAIS_DE_LA_PLATAFORMA` si nadie le
  pasa el país. Con CR no se nota; con otro país, la descarga diría «CRC». Lo cierra el test de
  cableado de R9, que falla si la acción deja de pasarlo.
- **Ocho lecturas con el memo frío.** El memo no comparte promesas en vuelo (SLT-235 §4): la primera
  carga del tablero de una empresa sin memo puede leer su país hasta 8 veces a la vez. Es una consulta
  de una fila por clave, cada 10 min por instancia como mucho, y el layout de la misma página suele
  dejar el memo lleno antes.
- **Hojas de cliente dentro de componentes de servidor.** `CifraAnalitica` añade un componente de
  cliente por cifra en el tablero financiero (unas 30). Es lo mismo que ya pasa con `PriceLabel` en
  los listados. Hoy la región financiera del shell está comentada, así que no se ve en ninguna
  pantalla.
- **El typecheck señala llamadores que no salieron en el Grep** (una unidad `MetricaUnidad` en un
  archivo que no está aquí). Si es de la analítica, se añade a «Archivos esperados» antes del PR; si es
  de otra pantalla, se avisa al leader.
- **Guardias de frontera de la analítica.** Si alguna rechaza la arista nueva de `components/private/analytics/`
  hacia `@/hooks/use-moneda-del-pais`, el implementer para y avisa: no se relaja una guardia de paso.
- **Memo de 10 min.** Un cambio de moneda tarda hasta 10 min en verse por instancia (coste aceptado en
  SLT-235).

## 12. Alternativas descartadas

1. **`formatearValor(valor, unidad, moneda = MONEDA_PLATAFORMA)` con default.** Ahorra 6 archivos de
   tests, pero un llamador que olvide la moneda pinta con la de la plataforma sin que nada falle, y con
   CR ningún test lo ve. Es justo lo que la decisión «moneda explícita» prohíbe. Las dos firmas lo
   convierten en un error de compilación sin tocar los conteos.
2. **Leer el país en el servidor y bajarlo por props al tablero** (`page.tsx` o `cargar.ts` llaman a
   `paisParaPantallasDelActor` y pasan `moneda` a `TableroFinanciero`, `PanelConciliacion` y `KpiCard`).
   `AnaliticaPage.test.tsx` prohíbe que la página importe `lib/services`, y hacerlo en `cargar.ts`
   añade una segunda lectura del actor y del país por página, además de cambiar las props de tres
   componentes y de sus tests. La hoja de cliente lee lo que el layout ya dejó en el proveedor.
3. **Pasar `TableroFinanciero` y `PanelConciliacion` a `"use client"`.** Rompe la guardia R10 de la 132
   («ningún archivo de la feature declara use client») y arrastra el borde financiero al navegador.
4. **Leer la moneda con el puerto `IReglasPaisEmpresa.moneda()` en el servicio** (ya recibe
   `reglasPais` para la zona). Lanza `PaisSinMoneda` si el país no la tiene, y la decisión cerrada dice
   que la pantalla cae a la plataforma y no falla. Además no tiene memo y se leería en cada una de las
   8 métricas. Mismo motivo que SLT-241, alternativa 1.
5. **Mandar el `FormatoMoneda` entero en cada `ImporteAnalitico`** y formatear con él en pantalla.
   Cambia el contrato de la 127 (`moneda: string`) y la columna de la descarga, y repite cinco campos
   en cada fila. La pantalla ya tiene la moneda por el hook.
6. **Quitar «IVA» de las descripciones con un texto neutro** («el impuesto»). Cambia un texto del
   catálogo para Costa Rica (contra R12) sin que ninguna pantalla lo pinte. Se interpola el rótulo.

## 13. Tamaño

Ver `tasks.md > Tamaño`: 32 archivos (20 de producción, 12 de tests), el 80% del tope de 40. Toca el
umbral del aviso sin pasarlo.

## Dependencias de terceros

Ninguna nueva.
