# SLT-241 — Moneda e impuesto del país en pantallas: tarifas, configuración y ranking · design

> Alcance, «Lo que NO entra» y decisiones cerradas en `requirements.md`; aquí solo va el cómo. Las
> referencias `R<n>` son las de `requirements.md`. Rebanada 3 de 8 del corte de SLT-235. El patrón de
> pantalla (proveedor, hook, censo) es el de `specs/SLT-235-moneda-pais-pantallas/design.md` §6–§8; el
> de «una base con el rótulo de caída y una función que pone el del país», el de
> `specs/SLT-240-moneda-pantallas-ordenes/design.md` §5.

## Lo que ya existe

Busqué el 2026-11-21 con `moneda`, `impuesto`, `IVA`, `₡`, `CRC`, `money(`, `formatMontoString`,
`monedaConfig.`, `ejemplo`, `textoDelValor`, `paraPantallas` y `nombreImpuesto` en tres sitios:
- `feature_list.json`, en todos los estados;
- `specs/`;
- el código.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» (`done`, en `dev`) | `providers/MonedaDelPaisProvider.tsx`, `hooks/use-moneda-del-pais.ts`, `lib/services/pais-para-pantallas.ts` (`paisParaPantallasDelActor`, memo de 10 min), `PaisService.paraPantallas`, `construirPaisService`, censo de R18 en `tests/components/moneda-del-pais-pantallas.test.tsx` | Se **reutiliza** entero. Las pantallas leen los dos hooks. Las acciones de servidor de esta ficha leen el país con `paisParaPantallasDelActor` (§3). No se toca el proveedor, el memo ni el layout. |
| SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes» (en PR #271) | `formatearTopeEn` exportado, `rotulos-con-impuesto.ts`, `conImpuestoDelPais` | Se sigue su **patrón**: la base lleva el rótulo de caída (`IMPUESTO_ROTULO`) y una función pone el del país. No se reutiliza código suyo: sus rótulos son de órdenes. |
| SL-21 «Moneda e impuestos configurables por país» | `lib/config/moneda.ts` (`formatearMontoEn`, `FormatoMoneda`, `MONEDA_PLATAFORMA`, `SIN_MONTO_RAYA`), `IReglasPaisEmpresa.moneda()` / `nombreImpuesto()`, `resolverValoresPlantilla(…, moneda)` | Se reutiliza `formatearMontoEn` y el parámetro `moneda` que ya tienen `valorDeCampo` / `resolverValoresPlantilla`. El puerto `IReglasPaisEmpresa` **no** se usa aquí (alternativa 1). |
| Lista de excepciones de `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` (tope 19) | Tiene **5 entradas** a nombre de SLT-241: `TarifaValorRepository.ts`, `_shared/resolver-tarifas.ts`, `types/plantilla-datos.ts`, `types/tarifa-flexible.ts` y `whatsapp-envios/informes/transito/informe.ts`. Salen las 5 y el tope pasa a 14 (R20). |
| Composition roots vigilados | `pais-sin-literales.guardia.test.ts` (2.ª guardia, `reglasPais?`), `plantillas-composition-root-474.test.ts`, `servicios-composicion.test.ts` | Los parámetros nuevos de esta ficha no se llaman `reglasPais`, así que la 2.ª guardia no los mira. Su cableado lo prueba el test nuevo (§9). |
| Censo de archivos de la pantalla de Tarifas | `tests/components/TarifasDisposicion.test.tsx` («Los 13 archivos de la pantalla nueva») | Por eso esta ficha **no crea archivos** en `configuracion/tarifas/_components/`: los textos del impuesto van dentro de `tarifas-textos.ts`. |
| SLT-246 «Moneda e impuesto del país en pantallas: wallet de tiendas y del mensajero» | `app/(app)/wallet/mensajeros/_components/PremiosRankingPanel.tsx` | Pinta premios del ranking, pero vive en la wallet: es de SLT-246. Fuera. |
| SLT-236, SLT-237, SLT-238, SLT-242 a SLT-245 | `feature_list.json` | Rebanadas y fichas hermanas. Ninguna toca tarifas, ranking, Usuarios ni los catálogos de variables. |

No apareció ninguna ficha ni código que ya resuelva R1–R15.

## 1. Resumen

1. Cada pantalla de Tarifas, Usuarios y ranking lee `useMonedaDelPais()` (y Tarifas,
   `useImpuestoDelPais()`) y pasa los dos a funciones puras de `tarifas-textos.ts` (R1–R4, R10, R11).
2. La escritura de tarifas recibe el nombre del impuesto del país **por construcción**:
   `serviciosDeTarifas(prisma, impuestoNombre)` → `TarifaValorService` (mensajes de validación, R5) y
   `TarifaValorRepository` (texto del historial, R6). La acción lo lee con
   `paisParaPantallasDelActor` (§3, R7, R8).
3. La vista previa de una plantilla de orden recibe la moneda del país por el mismo camino (§8, R12).
4. Los ejemplos de importe de los catálogos salen del formateador; los de informe llevan además el
   importe crudo para que la pantalla lo pinte en la moneda del país (§8, R13–R15).
5. Salen 5 excepciones y los archivos de pantalla entran en el censo de SLT-235 (R19, R20).

## 2. Modelo de datos

No hay tabla, columna, migración ni política nueva. No hay operación nueva ni ruta nueva.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda | `pais.moneda_*` → `PaisDTO.moneda` → `PaisParaPantallas.moneda` | Pantallas: `useMonedaDelPais()`. Servidor: la vista previa de plantillas de orden (§8) |
| Nombre del impuesto | `pais.impuesto_nombre` → `PaisDTO.impuestoNombre` → `PaisParaPantallas.impuestoNombre` | Pantallas: `useImpuestoDelPais()`. Servidor: la escritura de tarifas (§5) |
| Caídas | `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO` | Los hooks sin proveedor (R17); `paraPantallasDe` y `paisParaPantallasDelActor` en el servidor (R8) |

**Historial de tarifas.** `historial_accion.valor_anterior` / `valor_nuevo` (`varchar(60)`) guardan el
texto del valor congelado al escribir. Esta ficha cambia el texto que se **escribe** desde ahora; las
filas ya guardadas no se tocan (R18). El nombre del impuesto no tiene longitud máxima en `pais`, pero
`valorDeCatalogo` ya recorta a 60.

## 3. Cómo llega el país al servidor sin pantalla (R7, R8)

El repositorio, el servicio de tarifas, el resolver y los catálogos no tienen pantalla ni proveedor.
Regla de esta ficha: **la acción de servidor que sirve a una pantalla lee el país una vez y lo pasa
explícito hacia abajo**. Usa lo que SLT-235 ya hizo para el layout:

```ts
const { moneda, impuestoNombre } = await paisParaPantallasDelActor(
  await empresaDeLaPeticion(),   // la empresa de la sesión (lib/auth/empresa-de-la-peticion.ts)
  construirPaisService(),        // lib/actions/_shared/paises-plataforma.ts
);
```

- **Memo:** pasa por `memoPaisEmpresa` (10 min por empresa e instancia). Guardar 20 valores de tarifa
  hace como mucho una lectura de la base, y casi siempre ninguna (R7).
- **Caídas (R8):** sin impuesto en el país, `paraPantallasDe` ya da `IMPUESTO_ROTULO` y avisa; si la
  lectura falla, `paisParaPantallasDelActor` da lo de la plataforma y deja el error en el log. Nunca
  lanza, así que el guardado no falla por el país.
- **Sin empresa** (`empresaDeLaPeticion()` → `null`): lo de la plataforma, sin consulta. Las dos
  acciones ya rechazan antes al que no tiene permiso.
- **Solo cuando hace falta:** la acción lo lee solo si va a construir el servicio real (sin
  `deps.servicio`). Los tests de acción que inyectan el servicio no cambian.

Por qué no el puerto `IReglasPaisEmpresa.nombreImpuesto()` / `.moneda()`, en la alternativa 1.

## 4. Pantalla de Tarifas (R1–R4)

### 4.1 `tarifas-textos.ts`

Deja de importar `money` y `monedaConfig`. Las funciones de formato reciben la moneda y, las que
nombran el impuesto, el impuesto:

```ts
export function etiquetaModo(modo: ModoTarifa, moneda: FormatoMoneda): string;          // `Monto ${moneda.simbolo}`
export function porcentajeParaVer(valor: string, moneda: FormatoMoneda): string;       // moneda.separadorDecimal
export function textoReferencia(referencia: Referencia, moneda: FormatoMoneda, impuesto: string): string;
export function textoValorSinIva(valor: Pick<TarifaValorDTO, "modo" | "valor">, moneda: FormatoMoneda): string;
export function textoValor(valor: Pick<TarifaValorDTO, "modo" | "valor" | "ivaPct">, moneda: FormatoMoneda, impuesto: string): string;

/** R4: los textos de la pantalla que nombran el impuesto. */
export function textosDelImpuesto(impuesto: string): {
  colImpuesto: string;                         // hoy TEXTOS.colIva: "IVA"
  impuestoDe: (concepto: string) => string;    // hoy TEXTOS.ivaDe
  notaMensajero: string;                       // "Sin IVA. Por defecto vale…"
  notaSatelite: string;                        // "Sin IVA. Pagas a la satélite…"
  impuestoObligatorio: string;                 // "Digita el IVA de este cobro. Si no lleva, escribe 0."
  mensajerosBase: string;                      // "En % se calcula sobre el flete sin IVA…"
  sinImpuesto: string;                         // "Sin IVA."
};
```

- Los importes: `formatearMontoEn(moneda, x, SIN_MONTO_RAYA)`, el mismo marcador que `money` (R1).
- `conIva(texto, ivaPct, moneda, impuesto)` → `` `${texto} + ${porcentajeParaVer(ivaPct, moneda)} % ${impuesto}` ``.
- Las 7 entradas con «IVA» salen de `TEXTOS` y pasan a `textosDelImpuesto`, con el mismo texto
  cambiando «IVA» por `${impuesto}`. `TEXTOS.enMonto(simbolo)` ya recibía el símbolo: no cambia.
- Ninguna función de este módulo lee un hook ni tiene una moneda o un impuesto por defecto.

### 4.2 Componentes

Cada componente cliente lee los hooks una vez y los pasa a las funciones de §4.1:

| Archivo | Cambio |
|---|---|
| `TarifasValores.tsx` | `moneda = useMonedaDelPais()`, `impuesto = useImpuestoDelPais()`, `ti = useMemo(() => textosDelImpuesto(impuesto), [impuesto])`. `etiquetaModo`, `textoValorSinIva`, `textoReferencia`, `porcentajeParaVer` (también el `ivaPct` de la línea del valor guardado), `ti.colImpuesto`, `ti.impuestoDe`, `ti.notaMensajero` / `ti.notaSatelite`. `planDeGuardado(editadas, columnasNivel, impuesto)`. |
| `TarifasVehiculo.tsx` | Deja de importar `monedaConfig`: `TEXTOS.enMonto(moneda.simbolo)`; `etiquetaModo`, `textoValorSinIva`, `textoReferencia` con la moneda (y el impuesto). |
| `TarifasGrupos.tsx` | Su función de resumen y la celda pasan la moneda (e impuesto) a `textoValorSinIva` / `textoValor`. |
| `TarifasMensajeros.tsx` | `textoValorSinIva(v, moneda)`; `ti.mensajerosBase`. |
| `TarifasTiendas.tsx` | `textoValorSinIva(v, moneda)`. |
| `TarifaMensajeroDialogo.tsx` | La nota con `ti.sinImpuesto` y `ti.mensajerosBase`; `etiquetaModo(…, moneda)`; `planDeGuardado(…, impuesto)`. |
| `tarifas-borrador.ts` | `planDeGuardado(editadas, columnas, impuesto: string)`: el error de impuesto vacío es `textosDelImpuesto(impuesto).impuestoObligatorio`. Parámetro obligatorio, como el resto del módulo. |

- Las funciones auxiliares de módulo que hoy formatean (la del resumen de `TarifasGrupos`, la de
  `TarifasTiendas`…) reciben la moneda como argumento: ninguna lee el hook.
- **«Sin IVA» en el código (R4):** los 8 archivos de la pantalla no tienen `\bIVA\b` fuera de los
  comentarios. Lo comprueba un caso del test nuevo con `quitarComentarios`, con su contraprueba.
- **Con CR (R16) y sin proveedor (R17):** moneda igual a `MONEDA_PLATAFORMA` e impuesto «IVA», así que
  cada texto es el de hoy. `TarifasValores.test.tsx`, `TarifasVehiculo.test.tsx`,
  `TarifasGrupos.test.tsx`, `TarifasTiendas.test.tsx`, `TarifasModulo.test.tsx` y
  `TarifasFulfillmentSoloTienda.test.tsx` siguen verdes sin tocarlos.
- **Escala de la moneda:** un valor de tarifa `1800.50` con una moneda de 0 decimales se pinta
  `€1 801`, por las reglas de formato. Es lo uniforme y lo que la ficha pide. Lo que se teclea no
  cambia (SLT-238).

## 5. Escritura de tarifas: validación e historial (R5–R8)

### 5.1 Esquemas con el impuesto (`lib/types/tarifa-flexible.ts`, R5)

```ts
/** Los esquemas de escritura con los mensajes en el impuesto dado. */
export function escrituraValorSchemaDe(impuesto: string): typeof escrituraValorSchema;
/** Los de siempre: con el rótulo de la plataforma. Siguen exportados para los tests y la acción. */
export const escrituraCobroSchema, escrituraPagoSchema, escrituraValorSchema; // = …De(IMPUESTO_ROTULO)
```

- `ivaPctSchema` pasa a función del impuesto: «El `${impuesto}` debe ser un porcentaje entre 0 y 100
  con hasta 2 decimales.». El `z.never` del pago: «Los pagos al mensajero y a la satelite no llevan
  `${impuesto}`.».
- Importa `IMPUESTO_ROTULO` de `lib/constants/impuesto-rotulo.ts` (sigue en la lista, a nombre de
  SLT-245): el archivo deja de tener el literal (R20).
- `escrituraValorSchema` y los otros dos no cambian de forma ni de mensajes con CR:
  `esquemas-escritura.test.ts` y `tarifa-schemas.test.ts` siguen verdes sin tocarlos (R16).

### 5.2 Servicio, repositorio y fábrica

```ts
// lib/services/TarifaValorService.ts
constructor(private readonly repo: ITarifaValorRepository, impuestoNombre: string = IMPUESTO_ROTULO)
// valida con escrituraValorSchemaDe(impuestoNombre), construido una vez en el constructor

// lib/repositories/TarifaValorRepository.ts
constructor(private readonly prisma: TarifaValorPrismaClient, private readonly impuestoNombre: string = IMPUESTO_ROTULO)
function textoDelValor(v, impuesto: string): string  // `${modo} ${valor} ${impuesto} ${pct}`; sin ivaPct, `${modo} ${valor}`

// lib/tarifas/servicios.ts
export function serviciosDeTarifas(prisma: PrismaClient, impuestoNombre: string = IMPUESTO_ROTULO): ServiciosDeTarifas
// → new TarifaValorService(new TarifaValorRepository(prisma, impuestoNombre), impuestoNombre)
```

- **Por qué por constructor y no por llamada:** `ITarifaValorService` y `ITarifaValorRepository` no
  cambian de firma. Así no se tocan los ~45 `fijarValor`/`fijar`/`quitar` de los tests ni los 7 tests
  de integración que llaman a `serviciosDeTarifas(prisma)` (alternativa 2).
- **Por qué con un valor por defecto:** es la caída que ya da el país sin impuesto (R8) y deja verdes
  esos tests con CR. El riesgo de un default silencioso es que la acción olvide pasarlo. Lo cubre un
  test de cableado (§9): `guardarValoresTarifa` construye la fábrica con el impuesto de
  `paisParaPantallasDelActor`, y `serviciosDeTarifas` lo pasa al servicio **y** al repositorio.
- **`lib/actions/tarifas.ts > guardarValoresTarifa`:** sin `deps.servicio`, lee el país (§3) **antes**
  del bucle de cambios y construye `serviciosDeTarifas(getPrismaClient(), impuestoNombre).tarifaValor`.
  Las otras acciones del archivo no escriben `tarifa_valor` y siguen con `serviciosDeTarifas(prisma)`.
- **Texto del historial (R6):** con CR, `"monto 1500.00 IVA 13.00"` como hoy. Con el país de prueba,
  `"monto 1500.00 IGV 13.00"`. `tarifa-valor-service.test.ts` y `tarifas-flexibles-escritura.test.ts`
  conservan sus literales con «IVA».

## 6. Resolver de tarifas (R9)

`aValorCobro` lanza hoy `` `resolver de tarifas: el cobro ${id} (${concepto}) no tiene IVA` ``. Es un
error interno: el CHECK `tarifa_valor_iva_solo_tienda` lo hace inalcanzable y nadie lo pinta. Pasa a
nombrar la columna, `` `… no tiene % de impuesto (ivaPct)` ``, y el comentario de encima queda igual.
No se lee el país para un mensaje que no llega a ninguna pantalla (alternativa 4). El archivo sale de
la lista (R20).

## 7. Configuración > Usuarios y ranking (R10, R11)

| Archivo | Hoy | Cambio |
|---|---|---|
| `app/(app)/configuracion/_components/UsuariosModule.tsx` | `textoAvisoZona(aviso)` con `formatMontoString(impacto.totalSinConsolidar)` | `textoAvisoZona(aviso, moneda)` con `formatearMontoEn(moneda, impacto.totalSinConsolidar)`; el componente le pasa `useMonedaDelPais()`. Mismo marcador `-` sin importe. |
| `app/(app)/ranking/_components/PremioInputRow.tsx` | `money(premio.monto)` | `formatearMontoEn(moneda, premio.monto, SIN_MONTO_RAYA)` con el hook. |
| `app/(app)/ranking/_components/RankingPodio.tsx` | `money(fila.premio)` en `EscalonPodio` | Igual, con el hook dentro de `EscalonPodio` (componente cliente bajo el mismo proveedor). |
| `app/(app)/ranking/historico/_components/RankingHistoricoModule.tsx` | `COLUMNAS` constante de módulo con `money(fila.premioMonto)`; `TarjetaHistorico` con `money` | `columnasHistorico(moneda)` función de módulo, montada con `useMemo(() => columnasHistorico(moneda), [moneda])`; `TarjetaHistorico` lee el hook. |
| `app/(app)/ranking/_components/ranking-labels.ts` | `export { money } from "@/lib/config/moneda"` | Se borra el reexport: ya no lo importa nadie. |

- Las descargas del ranking (`ranking-descarga-columnas.ts`, `ranking-historico-descarga-columnas.ts`)
  emiten el importe crudo y no se tocan (R18).
- Con CR y sin proveedor, el texto es byte a byte el de `money` / `formatMontoString`:
  `RankingPodio.test.tsx`, `RankingHistoricoModule.test.tsx`, `RankingModule.test.tsx` y los tests de
  Usuarios siguen verdes sin tocarlos (R16, R17).

## 8. Ejemplos de plantillas e informes (R12–R15)

### 8.1 Catálogo de plantillas de orden (`lib/types/plantilla-datos.ts`)

- `const MONTO_COBRAR_EJEMPLO = 12500` lo usan el fixture (`DATOS_PLANTILLA_EJEMPLO.orden.montoCobrar`)
  y el catálogo: `ejemplo: formatearMontoEn(MONEDA_PLATAFORMA, MONTO_COBRAR_EJEMPLO)`. Con CR da
  `₡12.500`, el mismo texto (R14, R16). El test de coherencia («cada `ejemplo` = la resolución del
  fixture», `plantilla-datos.test.ts`) sigue verde sin tocarlo.
- El catálogo es de módulo y lo comparten el envío real, la vista previa y Meta. Por eso su `ejemplo`
  queda en la moneda de la plataforma, nombrada, y la moneda del país entra por quien resuelve (abajo).
- `EJEMPLOS_POR_CLAVE` (lo que viaja a Meta) no cambia de valor (R15).

### 8.2 Vista previa de una plantilla de orden (R12)

```ts
// lib/utils/plantilla-mensaje.ts
export function previewConEjemplos(cuerpo: string, zona?: string, moneda?: FormatoMoneda): string;
// → renderPlantilla(cuerpo, resolverValoresPlantilla(variables, DATOS_PLANTILLA_EJEMPLO, zona, moneda))

// lib/services/PlantillaMensajeService.ts > PlantillaInformeDeps
/** SLT-241 (R12): la moneda del país para la vista previa. Solo se lee si el cuerpo pinta un importe. */
monedaDeVistaPrevia?: () => Promise<FormatoMoneda>;
```

- `preview` la pide solo si `necesitaMoneda(variables)`, como ya hace con la zona y `necesitaZona`.
- Es el mismo par `resolverValoresPlantilla` + `renderPlantilla` del envío real: con la misma moneda da
  el mismo texto (R12). Sin la dependencia (los tests que construyen el servicio con solo el repo),
  `undefined` → la moneda de la plataforma, como hoy.
- `lib/actions/plantillas.ts > buildPlantillaService` la pasa:
  `monedaDeVistaPrevia: async () => (await paisParaPantallasDelActor(await empresaDeLaPeticion(), construirPaisService())).moneda`
  (§3). El test de cableado lo exige (§9).

### 8.3 Catálogo y vista previa de informes (R13)

- `VariableInforme` (`lib/whatsapp-envios/informes/tipos.ts`) gana
  `readonly importeEjemplo?: string`: el importe crudo, escala 2, de una variable que es un importe.
  `VariableCatalogo` (`catalogo.ts`) y `VariableDeInforme` (`lib/utils/vista-previa-informe.ts`)
  ganan el mismo campo opcional. `catalogoDeVariables` ya copia la variable entera (`{ ...v }`), así
  que llega a la pantalla por `listarInformesWhatsapp()` sin más código.
- `transito/informe.ts`, variable `por_cobrar`: `importeEjemplo: "322900.00"` y
  `ejemplo: formatearMontoEn(MONEDA_PLATAFORMA, "322900.00")` (con CR, `₡322.900`, R14, R16). `ejemplo`
  sigue siendo lo que viaja a Meta por `ejemploDeVariableInforme` (R15).
- `componerVistaPrevia(cuerpo, variables, valores, moneda: FormatoMoneda)`: una variable con
  `importeEjemplo` se pinta `formatearMontoEn(moneda, importeEjemplo)`; las demás, con su `ejemplo` de
  siempre. Un `valores[clave]` dado gana, como hoy. `moneda` obligatoria: no tiene tests que la llamen
  sin ella.
- `VistaPreviaMensaje.tsx` (Envíos automáticos) y `VariablesInsert.tsx` (Plantillas, rama de informe)
  leen `useMonedaDelPais()` y la pasan. Su tipo de `variables` gana el campo opcional.

## 9. Guardias y tests de cableado (R4, R7, R19, R20)

- **Censo de R18 de SLT-235** (`CENSO_MONEDA_DEL_PAIS`): gana `tarifas-textos.ts`,
  `tarifas-borrador.ts`, `TarifasValores.tsx`, `TarifasVehiculo.tsx`, `TarifasGrupos.tsx`,
  `TarifasMensajeros.tsx`, `TarifasTiendas.tsx`, `TarifaMensajeroDialogo.tsx`, `UsuariosModule.tsx`,
  `PremioInputRow.tsx`, `RankingPodio.tsx`, `RankingHistoricoModule.tsx`, `ranking-labels.ts`,
  `VistaPreviaMensaje.tsx`, `VariablesInsert.tsx` y `lib/utils/vista-previa-informe.ts` (16). La
  prueba «rojo si un archivo REAL del censo vuelve a un formateador implícito» los cubre sin cambiarla.
- **Censo «sin IVA» de R4** (test nuevo): los 8 archivos de la pantalla de Tarifas, con
  `quitarComentarios` y su contraprueba.
- **Cableado (test nuevo), en vez de un default que nadie vigila:**
  - `serviciosDeTarifas(prisma, "IGV")`: el servicio valida con «IGV» y el repositorio escribe
    «IGV» en el historial (con el cliente doble de `servicios-composicion.test.ts`);
  - `lib/actions/tarifas.ts`: el `serviciosDeTarifas(` de `guardarValoresTarifa` recibe un segundo
    argumento que sale de `paisParaPantallasDelActor(`, y la lectura está fuera del bucle (lectura del
    fuente sin comentarios, con contraprueba);
  - `guardarValoresTarifa` con tres cambios y `construirPaisService` doblado: `paraPantallas` se llama
    una vez (R7);
  - `lib/actions/plantillas.ts`: el `new PlantillaMensajeService(` recibe `monedaDeVistaPrevia` y sale
    de `paisParaPantallasDelActor(`.
- **`pais-sin-literales` (R20):** se quitan las 5 entradas de SLT-241, `TOPE_EXCEPCIONES = 14` y una
  línea nueva en «Bajadas» del comentario de cabecera. La guardia exige la baja: una excepción sin
  literales hace fallar «la lista solo baja». `FichaQueLoRetira` y `FICHAS_ADMITIDAS` no se tocan
  (SLT-240 P2). El test nuevo comprueba que no queda ninguna entrada con `ficha === "SLT-241"`.

## 10. Autorización y módulos

No hay operación, acción ni ruta nueva. Las acciones tocadas conservan su comprobación de sesión y de
rol, que va **antes** de leer el país. La empresa del país sale de la sesión
(`empresaDeLaPeticion()`), nunca del input. El memo es por `organizacionId` (SLT-235 R8). Ranking es un
módulo con puerta (`modulo: "ranking"`): su puerta no cambia. El resto es núcleo.

## 11. Mapa R → test

Archivo nuevo: `tests/components/moneda-del-pais-tarifas.test.tsx`. Cada caso de pantalla se monta con
`MonedaDelPaisProvider` y `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor. Los
fixtures de Tarifas son los de `tests/fixtures/tarifas-pantalla.ts`.

| R | Test |
|---|---|
| R1 | `moneda-del-pais-tarifas.test.tsx`: `textoValorSinIva` / `textoReferencia` (monto y «Varía») con `MONEDA_DE_PRUEBA` = `formatearMontoEn(MONEDA_DE_PRUEBA, v, SIN_MONTO_RAYA)`; `TarifasValores` montado con el proveedor de prueba pinta «€» con espacio de miles; `TarifasGrupos`, `TarifasTiendas` y `TarifasMensajeros` en una celda cada uno |
| R2 | `moneda-del-pais-tarifas.test.tsx`: `etiquetaModo("monto", MONEDA_DE_PRUEBA)` = «Monto €»; `TarifasVehiculo` con el proveedor de prueba dice «En €» |
| R3 | `moneda-del-pais-tarifas.test.tsx`: `porcentajeParaVer("3.50", MONEDA_DE_PRUEBA)` = «3.5» y con `MONEDA_CR` «3,5» |
| R4 | `moneda-del-pais-tarifas.test.tsx`: con «IGV», el encabezado de la columna, la etiqueta accesible «IGV de …», «+ 13 % IGV», las dos notas, la base del mensajero y el error de `planDeGuardado` con impuesto vacío; censo «sin IVA» de los 8 archivos con contraprueba |
| R5 | `tarifa-valor-service.test.ts`: `new TarifaValorService(repo, "IGV")` con un `ivaPct` mal formado → el mensaje dice «El IGV debe ser…»; un pago con `ivaPct` → «… no llevan IGV.» |
| R6 | `tarifa-valor-service.test.ts` (repositorio real con el doble de Prisma): con «IGV», `"monto 1500.00 IGV 13.00"` → `"monto 1800.00 IGV 13.00"`; un pago queda `"monto 800.00"` |
| R7 | `moneda-del-pais-tarifas.test.tsx`: `guardarValoresTarifa` con tres cambios, `empresaDeLaPeticion` y `construirPaisService` doblados (país de prueba) y `serviciosDeTarifas` espiado con un servicio doble → `paraPantallas` llamado una vez y `serviciosDeTarifas` con «IGV»; `serviciosDeTarifas(prisma, "IGV")` llega al servicio y al repositorio (§9) |
| R8 | `moneda-del-pais-tarifas.test.tsx`: igual que R7 con `paraPantallas` que lanza → `serviciosDeTarifas` recibe `IMPUESTO_ROTULO`, el resultado es `ok` y el error queda en `console.error`. La caída por país sin impuesto ya la prueba `pais-para-pantallas.test.ts` (SLT-235) |
| R9 | `pais-sin-literales.guardia.test.ts` en verde con `resolver-tarifas.ts` fuera de la lista; `tarifas-flexibles-resolver.test.ts` verde sin tocarlo |
| R10 | `moneda-del-pais-tarifas.test.tsx`: `UsuariosModule` con el aviso de impacto abierto y el proveedor de prueba pinta el total en «€» |
| R11 | `moneda-del-pais-tarifas.test.tsx`: `RankingPodio`, `PremioInputRow` y `RankingHistoricoModule` (tabla y tarjeta) con el proveedor de prueba; premio `null` → el texto de hoy |
| R12 | `moneda-del-pais-tarifas.test.tsx`: `PlantillaMensajeService.preview("Total {{monto}}")` con `monedaDeVistaPrevia` → `MONEDA_DE_PRUEBA` da `Total €12 500`, igual a `renderPlantilla` + `resolverValoresPlantilla(…, MONEDA_DE_PRUEBA)`; sin `{{monto}}` no la pide; cableado de `buildPlantillaService` |
| R13 | `moneda-del-pais-tarifas.test.tsx`: `VistaPreviaMensaje` con el cuerpo «Por cobrar {{por_cobrar}}» y las variables de `catalogoDeVariables("transito")` con el proveedor de prueba → «€322 900»; `{{vencidos}}` sigue «7» |
| R14 | `pais-sin-literales.guardia.test.ts` en verde con `plantilla-datos.ts` e `informe.ts` fuera de la lista |
| R15 | `plantilla-mensaje-utils.test.ts` (el ejemplo de `{{monto}}` que va a Meta) y `catalogo-de-variables.test.ts` verdes sin tocarlos |
| R16 | Cada caso de R1–R13 con `MONEDA_CR` + «IVA» da el mismo texto que sin proveedor. Y siguen verdes sin cambiar ningún valor esperado: `TarifasValores.test.tsx`, `TarifasVehiculo.test.tsx`, `TarifasGrupos.test.tsx`, `TarifasTiendas.test.tsx`, `TarifasModulo.test.tsx`, `TarifasFulfillmentSoloTienda.test.tsx`, `esquemas-escritura.test.ts`, `tarifa-schemas.test.ts`, `tarifas-flexibles-escritura.test.ts`, el resto de `tarifa-valor-service.test.ts`, `RankingPodio.test.tsx`, `RankingHistoricoModule.test.tsx`, `plantilla-datos.test.ts`, `preview-mismo-motor.test.ts` e `informe-transito-informe.test.ts` |
| R17 | `moneda-del-pais-tarifas.test.tsx`: sin proveedor, cada pantalla = `formatearMontoEn(MONEDA_PLATAFORMA, v)` y los rótulos con `IMPUESTO_ROTULO` |
| R18 | El reviewer comprueba en el diff: ninguna migración ni escritura sobre `historial_accion` existente; las dos `*-descarga-columnas.ts` del ranking sin cambios; ningún «IVA» cambiado fuera de los archivos de §4, §5 y §6; ningún archivo de wallet ni de plataforma |
| R19 | `moneda-del-pais-pantallas.test.tsx > censo de R18` con los 16 archivos de §9 |
| R20 | `pais-sin-literales.guardia.test.ts` en verde (sin las 5 entradas, tope 14), y en `moneda-del-pais-tarifas.test.tsx` `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-241")` = `[]` y `TOPE_EXCEPCIONES` = 14 |

## 12. Riesgos

- **Defaults en la cadena de escritura.** `serviciosDeTarifas`, `TarifaValorService` y
  `TarifaValorRepository` caen a `IMPUESTO_ROTULO` si nadie les pasa el impuesto. Con CR no se nota;
  con otro país, el historial diría «IVA». Lo cierra el test de cableado de §9, que falla si la acción
  deja de pasarlo.
- **Artículo del impuesto (P2, cerrada).** «Digita el <impuesto>…» supone un nombre masculino. El
  humano decidió dejarlo así y ajustarlo si llega un impuesto de nombre femenino.
- **Textos del historial mezclados.** Una empresa cuyo país cambie de impuesto verá filas viejas con el
  nombre anterior y nuevas con el nuevo. Es lo correcto para un dato congelado.
- **Memo de 10 min.** Un cambio del nombre del impuesto tarda hasta 10 min en llegar al historial y a
  los mensajes por instancia. Es el coste aceptado en SLT-235.
- **Recorte a 60.** Un nombre de impuesto muy largo recorta la cola del texto del valor
  (`valorDeCatalogo`). Con los nombres reales (IVA, IGV, ITBMS) cabe de sobra.
- **Llamantes que aparezcan al implementar** de `etiquetaModo`, `porcentajeParaVer`, `textoValor*`,
  `textoReferencia`, `planDeGuardado`, `componerVistaPrevia` o `textoAvisoZona`: el typecheck los
  señala. Si son de otra pantalla, se avisa al leader antes de añadirlos.

## 13. Alternativas descartadas

1. **Leer el impuesto con el puerto `IReglasPaisEmpresa.nombreImpuesto()` dentro de
   `TarifaValorService`** (y `.moneda()` en la vista previa). Es el camino de lo que el servidor envía
   (WhatsApp, PDF), y la 2.ª guardia de `pais-sin-literales` vigilaría su composition root. Pero
   **lanza** `PaisSinImpuesto` si el país no lo tiene, y la decisión cerrada dice que una pantalla cae
   a lo de la plataforma y no falla: el maestro no podría guardar tarifas. Además no tiene memo entre
   peticiones. Estos textos son de pantalla: se usa la lectura de pantallas de SLT-235, con su memo y
   sus caídas.
2. **Pasar el impuesto en cada llamada** (`fijarValor(input, actor, impuesto)`, un campo más en
   `FijarValorDatos`). Es lo más explícito, pero cambia dos interfaces y obliga a tocar unos 45
   llamantes en `tarifa-valor-service.test.ts`, `tarifas-action.test.ts` y `tarifa-activacion.test.ts`.
   El impuesto es el mismo para toda la petición: es una dependencia del servicio, no un argumento.
3. **Guardar en el historial un texto neutro** («monto 1500.00 + 13.00 %»). No necesita el país, pero
   cambia el texto para Costa Rica (contra R16) y pierde el nombre que la persona ve en la pantalla.
4. **Nombrar el impuesto del país en el error interno del resolver.** Obligaría a leer el país en el
   cálculo de cierres para un mensaje que el CHECK hace inalcanzable y que nadie lee en pantalla. Se
   nombra la columna.
5. **Formatear el ejemplo del informe en el servidor** (`listarInformes(actor, moneda)`). Cambia la
   firma síncrona de `IWhatsappEnvioService.listarInformes` y sus tests, y mete la moneda del país en un
   catálogo de módulo. La pantalla ya tiene la moneda por el hook: el servidor manda el importe crudo y
   la pantalla lo pinta, como el resto de importes.
6. **Un archivo nuevo `tarifas-impuesto.ts` en `configuracion/tarifas/_components/`.** Separa los
   textos del impuesto, pero rompe el censo «Los 13 archivos de la pantalla nueva» de
   `TarifasDisposicion.test.tsx`. Van dentro de `tarifas-textos.ts`, que ya es el sitio de los textos.

## 14. Tamaño

Ver `tasks.md > Tamaño`: 34 archivos (29 de producción, 5 de tests), el 85% del tope de 40. Pasa del
aviso del 80%; el humano lo aceptó el 2026-11-21 (P1 en «Decisiones cerradas», máximo 40).

## Dependencias de terceros

Ninguna nueva.
