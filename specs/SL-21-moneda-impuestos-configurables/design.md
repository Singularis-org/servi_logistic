# SL-21 — Moneda e impuestos configurables por país · design

> Alcance, «Lo que NO entra» y las decisiones cerradas están en `requirements.md`; aquí solo va el
> cómo. Las referencias `R<n>` son las de `requirements.md`.

## Lo que ya existe

Busqué el 2026-11-19 con `moneda`, `monedaConfig`, `CRC`, `₡`, `IVA`, `IMPUESTO_ROTULO`, `impuesto`
y `decimales`, en tres sitios:
- `feature_list.json`, en todos los estados;
- `specs/`;
- el código.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SL-20 «Geografía configurable por país» (`done`) | `specs/SL-20-pais-geografia-configurable/` | Se **reutiliza**: la tabla `pais`, su RLS de lectura, el `REVOKE` a `servi_app`, las fábricas `XA`–`XZ` y `lib/db/errores-pais.ts`. |
| SLT-42 «Teléfono, documento y hora por país» (`done`) | `specs/SLT-42-telefono-documento-hora-por-pais/`, `docs/architecture.md` (§ Teléfono, documento y hora) | Es el patrón de la decisión cerrada. Se **reutilizan**: las columnas NULL-ables en `pais` con `CHECK` y el `UPDATE` de CR; el puerto `IReglasPaisEmpresa` con su memoria por marco; `construirReglasPaisEmpresa`; los errores tipados; la guardia `pais-sin-literales` con su lista de excepciones y su segunda parte (composition roots); y `paisIncompleto` del alta de empresa. |
| SLT-81 «Datos del país: pantalla del superadmin y formularios» (`in_progress`, mismo assignee) | `feature_list.json` | No se solapa: aquí no hay escritura ni pantalla. Comparte archivos (`lib/types/pais.ts`, `PaisRepository`, fábricas de tests); ver §9. |
| SLT-235, SLT-236, SLT-237, SLT-238 | `feature_list.json` | Fichas del corte. Esta ficha deja a cada una su costura: la moneda de la plataforma con nombre (SLT-235, SLT-237), las columnas listas para editar (SLT-236) y `monto-cobrar.ts` sin tocar (SLT-238). |
| SL-39 «Wallet: IVA aparte de las ganancias» | `lib/constants/impuesto-rotulo.ts` | `IMPUESTO_ROTULO = "IVA"` es de pantalla (sus 4 consumidores son UI). Se queda; solo cambia su comentario («SL-21 decidirá» pasa a SLT-235). |
| Formateador único de dinero (fichas 201, 230, 359; SLT-67) | `lib/config/moneda.ts`, `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` | Se **amplía**, no se duplica. La lógica de hoy (cuadre por cadena, cola solo cuando existe, signo) pasa a recibir la moneda. Los 6 caminos de hoy quedan como envoltorios con la moneda de la plataforma, y la guardia 359 censa el séptimo (§3). |
| Literales de moneda prohibidos en el tablero (feature 127, R25) | `tests/unit/guards/tablero-financiero.guardia.test.ts` | Mismo criterio de detección (`₡`, código ISO) aplicado al servidor (§7). |
| `importeDocumento` de los PDF de factura (SLT-199) | `lib/facturas-plataforma/resumen.ts` | Se queda donde está, con la moneda de los planes como parámetro explícito. |

No apareció ninguna ficha ni código que ya resuelva esto.

## 1. Resumen

1. `pais` gana seis columnas: moneda (código, símbolo, dos separadores, decimales) y nombre del
   impuesto. Todas NULL, con `CHECK`; Costa Rica se carga en la migración (R1–R4).
2. Hay un tipo puro `FormatoMoneda` y un formateador `formatearMontoEn(moneda, valor)` en
   `lib/config/moneda.ts`. Los 6 formateadores de hoy delegan en él con `MONEDA_PLATAFORMA`
   (R8, R9).
3. `IReglasPaisEmpresa` gana `moneda()` y `nombreImpuesto()`. Fallan con `PaisSinMoneda` y
   `PaisSinImpuesto` (R5–R7).
4. Lo que arma el servidor pide la moneda al puerto **solo si va a pintar un importe** (R10–R14):
   - las plantillas de WhatsApp (chat, bienvenida, acción del chat);
   - el informe de tránsito;
   - el PDF de etiquetas de la carga por API.
5. Las facturas de planes usan `MONEDA_DE_LOS_PLANES`, la moneda de la plataforma con nombre. El país
   no interviene (R15).
6. El alta de empresa exige moneda e impuesto (R17).
7. La guardia `pais-sin-literales` amplía su censo a «₡», `CRC`, `IVA` y los formateadores
   implícitos (R20, R21).

**Fuera, explícito.** Todo es de SLT-235 y queda en la lista de excepciones de R20:
- las pantallas;
- la vista previa de plantillas en el navegador;
- el PDF de etiquetas que genera el navegador (`app/(app)/ordenes/_components/etiquetas-pdf.ts`);
- `app/paquete/[numGuia]/page.tsx`;
- el campo `moneda` de `AnaliticaFinancieraService`;
- el texto «IVA 13.00» del historial de tarifas (`TarifaValorRepository.textoDelValor`).

El precio de los planes por moneda es de SLT-237. Los céntimos en la carga, de SLT-238.

## 2. Modelo de datos

`pais` es una tabla **de plataforma**: no tiene `organizacion_id` y está en `MODELOS_DE_PLATAFORMA`.
No hay tabla de negocio nueva ni índice único nuevo.

### 2.1 Migración `20261124120000_sl21_pais_moneda_impuesto`

```sql
BEGIN;
ALTER TABLE "pais"
  ADD COLUMN "moneda_codigo"            text     NULL,  -- ISO 4217: 'CRC'
  ADD COLUMN "moneda_simbolo"           text     NULL,  -- '₡'
  ADD COLUMN "moneda_separador_miles"   text     NULL,  -- '.'
  ADD COLUMN "moneda_separador_decimal" text     NULL,  -- ','
  ADD COLUMN "moneda_decimales"         smallint NULL,  -- 2
  ADD COLUMN "impuesto_nombre"          text     NULL;  -- 'IVA'
ALTER TABLE "pais"
  ADD CONSTRAINT "pais_moneda_todo_o_nada" CHECK (
    num_nonnulls("moneda_codigo","moneda_simbolo","moneda_separador_miles",
                 "moneda_separador_decimal","moneda_decimales") IN (0, 5)),
  ADD CONSTRAINT "pais_moneda_codigo_formato"   CHECK ("moneda_codigo" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "pais_moneda_simbolo_largo"    CHECK (char_length(btrim("moneda_simbolo")) BETWEEN 1 AND 5),
  ADD CONSTRAINT "pais_moneda_miles_un_caracter" CHECK (char_length("moneda_separador_miles") = 1),
  ADD CONSTRAINT "pais_moneda_decimal_valido"   CHECK ("moneda_separador_decimal" IN ('.', ',')),
  ADD CONSTRAINT "pais_moneda_separadores_distintos" CHECK ("moneda_separador_miles" <> "moneda_separador_decimal"),
  ADD CONSTRAINT "pais_moneda_decimales_rango"  CHECK ("moneda_decimales" BETWEEN 0 AND 2),
  ADD CONSTRAINT "pais_impuesto_nombre_largo"   CHECK (char_length(btrim("impuesto_nombre")) BETWEEN 1 AND 20);
UPDATE "pais"
   SET "moneda_codigo" = 'CRC', "moneda_simbolo" = '₡', "moneda_separador_miles" = '.',
       "moneda_separador_decimal" = ',', "moneda_decimales" = 2, "impuesto_nombre" = 'IVA'
 WHERE "id" = 'CR';   -- solo columnas nuevas (R3)
COMMIT;
```

- **NULL a propósito**, como en SLT-42 §2.1. Un país dado de alta por la pantalla de SL-20 no tiene
  moneda, y no se le inventa una. Las consecuencias:
  - no admite empresas (R17);
  - lo que necesita su moneda falla con `PaisSinMoneda` (R6).
- **Todo o nada** (R2). Un formato a medias no se puede pintar. El nombre del impuesto va aparte
  porque el formato no lo usa.
- **Decimales de 0 a 2** (decisión del 2026-11-20). Los importes son `DECIMAL(12,2)`, así que una
  moneda de 3 decimales no cabe. Con 0, una resta A − B = C puede verse descuadrada en ±1: riesgo
  aceptado, y no afecta a CR.
- **Separador de miles: un solo carácter cualquiera.** Admite el punto, la coma, el espacio, el
  espacio duro y el apóstrofo. El decimal, solo punto o coma, que es lo que usa el mundo.
- **Precondición** (en la migración, aborta si falla): existe la fila `CR`. Si no, `RAISE EXCEPTION`
  y no cambia nada.
- **Seguridad (R4).** `pais` ya tiene `pais_lectura` (SELECT para `servi_app`) y `REVOKE INSERT,
  UPDATE, DELETE … FROM servi_app` (SL-20). Las columnas nuevas lo heredan; no hay política nueva.
- **`down.sql`:** quita los 8 `CHECK` y las 6 columnas. Solo borra lo que creó la subida.
- **Prisma:** seis campos opcionales en `model Pais`:
  - `monedaCodigo String? @map("moneda_codigo")`;
  - `monedaSimbolo`, `monedaSeparadorMiles` y `monedaSeparadorDecimal`, de tipo `String?`;
  - `monedaDecimales Int? @db.SmallInt`;
  - `impuestoNombre String?`.

  Cada uno con un comentario `///`, como los de SLT-42.

### 2.2 Comprobaciones previas en producción (solo lectura, las corre una persona)

Patrón de SLT-42 §2.5. Si alguna no da lo esperado, se para y decide el humano.

1. `SELECT count(*) FROM organizacion WHERE pais_id <> 'CR'` → 0. Si no da 0, esas empresas
   quedarían sin moneda y sus WhatsApp con importe fallarían (R6).
2. **Las variables `MONEDA_*` del despliegue de producción no están puestas, o valen lo mismo que
   los valores por defecto** (`CRC`, `₡`, `.`, `,`). Si valieran otra cosa, la siembra de CR de la
   migración no coincidiría con lo que ven hoy los usuarios, y R16 no se cumpliría. Lo comprueba el
   humano en la consola de Vercel; ningún agente lee secretos.

El ensayo de la migración y de su `down.sql` se hace sobre una copia de producción, nunca sobre
producción.

## 3. El formato: `lib/config/moneda.ts` (R8, R9)

Es un módulo puro y apto para el cliente, como hoy.

```ts
/** La moneda con la que se pinta un importe. La del país sale de `pais`; la de la plataforma, de aquí. */
export interface FormatoMoneda {
  codigo: string;            // ISO 4217
  simbolo: string;
  separadorMiles: string;
  separadorDecimal: string;
  decimales: 0 | 1 | 2;
}

/** La de hoy: `monedaConfig` (env MONEDA_*), con la escala de presentación. */
export const MONEDA_PLATAFORMA: FormatoMoneda;
/** Las facturas y los textos de planes. Es la de la plataforma hasta SLT-237. */
export const MONEDA_DE_LOS_PLANES: FormatoMoneda = MONEDA_PLATAFORMA;

/** R8: el séptimo camino público. `number` entra por `toFixed(decimales)`, como `formatMonto`. */
export function formatearMontoEn(
  moneda: FormatoMoneda,
  valor: string | number | null,
  sinMonto?: string,
): string;
```

- `cuadrarAEscala`, `agruparMiles` y `componer` reciben la moneda en vez de leer `monedaConfig` y
  `ESCALA`. Se mantienen las reglas de la ficha 359, el cuadre por cadena sin `Number(` y el signo.
  Con `decimales = 0`, el cuadre mira el primer dígito decimal y no hay cola.
- `formatMontoString`, `money`, `formatMonto`, `montoExacto`, `formatMontoTope` y `moneyTope`
  pasan a ser `formatearMontoEn(MONEDA_PLATAFORMA, …)`, o su variante de cota. Dan el mismo texto
  que hoy (R9).
- `monedaConfig` y `ESCALA_PRESENTACION` se siguen exportando para sus consumidores de pantalla
  (SLT-235). `montoParaCampo` no cambia.
- **Guardia 359:** `formatearMontoEn` entra en el censo de caminos públicos, con
  `MONEDA_PLATAFORMA`, en las dos listas (cadena y número). El recuento pasa de 6 a 7 y la
  expresión de nombres exportados del diente 6 lo incluye. Así se garantiza por el mismo corpus que
  da el mismo texto que los otros seis (R9).
- **CR de la migración = plataforma:** un test compara `MONEDA_PLATAFORMA` (con env vacío) con la
  `FormatoMoneda` que sale de la fila `CR` migrada. Es lo que hace que R16 valga para CR.

## 4. Datos que dependen del país y de dónde salen

| Dato | Fuente | Quién lo lee |
|---|---|---|
| Moneda (código, símbolo, separadores, decimales) | `pais.moneda_*` | `IReglasPaisEmpresa.moneda()` → plantillas de WhatsApp, informe de tránsito, PDF de etiquetas por API |
| Nombre del impuesto | `pais.impuesto_nombre` | `IReglasPaisEmpresa.nombreImpuesto()` y el alta de empresa. Ningún texto del servidor lo pinta hoy; lo consumirá SLT-235. |
| Moneda de los planes | `MONEDA_DE_LOS_PLANES` (= plataforma, env `MONEDA_*`) | Facturas de planes: correo, PDF, anexo, nota, `textoDelCobroVigente` |
| Tasa de impuesto | cada tarifa (`tarifa_valor.iva_pct`) | Sin cambios |
| Métodos de pago, SINPE | — | Fuera (SL-22) |

## 5. Capas y contratos

### 5.1 Tipos, repositorio y puerto (R5–R7)

- `lib/types/pais.ts > PaisDTO` gana dos campos:
  - `moneda: FormatoMoneda | null`, armado por el repositorio con las 5 columnas (el `CHECK` todo o
    nada garantiza que no hay mitades);
  - `impuestoNombre: string | null`.
- `PaisRepository`: su `select` añade las 6 columnas y las mapea.
- `lib/db/errores-pais.ts`: `PaisSinMoneda` y `PaisSinImpuesto`, con la forma de
  `PaisSinZonaHoraria`: un `paisId` y un mensaje que solo nombra el código ISO. Igual que
  `PaisIncompleto`, `withErrorHandler` no los tiene en su mapa y salen como `{ status: "error" }`
  genérico.
- `IReglasPaisEmpresa` gana:

```ts
/** R5, R6: la moneda del país de la empresa en curso. Lanza PaisSinMoneda si no la tiene. */
moneda(): Promise<FormatoMoneda>;
/** R5, R7: el nombre del impuesto. Lanza PaisSinImpuesto si no lo tiene. */
nombreImpuesto(): Promise<string>;
```

  `ReglasPais` (lo que devuelve `deLaEmpresa`) **no cambia**, para no romper los dobles que lo
  construyen a mano.
- `ReglasPaisEmpresaService` implementa los dos métodos sobre `paisDeLaEmpresa` (la misma memoria
  por marco que SLT-42, sin caché entre empresas: R5).
- `tests/fabricas/reglas-pais.ts`: `ReglasPaisFijas` gana `moneda` e `impuestoNombre`, con CR por
  defecto. Además exporta `MONEDA_DE_PRUEBA`, una moneda distinta en todo de la de CR:

```ts
{ codigo: "XTS", simbolo: "€", separadorMiles: " ", separadorDecimal: ".", decimales: 0 }
```

  `XTS` es el código que ISO 4217 reserva para pruebas. «€» porque la fuente embebida de las
  etiquetas lo cubre (U+20AC): con un símbolo que no cubriera, el test de R14 fallaría por la
  fuente y no por la moneda.

  Los dobles escritos a mano que implementan el puerto entero ganan los dos métodos.

### 5.2 Plantillas de WhatsApp (R10, R11)

`lib/types/plantilla-datos.ts`, mismo patrón que la zona en SLT-42:

- `CampoPlantilla` gana `usaMoneda?: true`. Lo llevan `monto` y sus alias.
- Nueva función `necesitaMoneda(variables)`, gemela de `necesitaZona`.
- `transform`, `valorDeCampo` y `resolverValoresPlantilla` ganan un cuarto argumento opcional
  `moneda?: FormatoMoneda`. `dinero` usa `formatearMontoEn(moneda ?? MONEDA_PLATAFORMA, v)`.
  - **Sin moneda, la de la plataforma, solo para la vista previa del navegador** (SLT-235). Es la
    razón de que este archivo esté en la lista de R20.
  - Los tests de cada llamante de servidor fijan que la pasa (R10).
- Llamantes de servidor: `ChatWhatsappService` (envío del chat), `lib/actions/chat-whatsapp.ts` y
  `whatsapp-bienvenida-handler.ts`. Cada uno hace lo mismo que con la zona:
  `necesitaMoneda(vars) ? await reglasPais.moneda() : undefined`.
  - Sin importe en la plantilla, no hay lectura (R11).
  - Con importe y sin moneda, `PaisSinMoneda` sale antes de encolar o enviar nada (R6).
- Los `Pick<IReglasPaisEmpresa, "zonaHoraria">` de esos llamantes pasan a
  `Pick<…, "zonaHoraria" | "moneda">`. Sus composition roots ya pasan el real.

### 5.3 Informes de WhatsApp (R12, R13)

- `ContextoInforme` (`lib/whatsapp-envios/informes/tipos.ts`) gana
  `moneda?: () => Promise<FormatoMoneda>`. Es **perezosa**: la pide solo el informe que pinta
  importes, así que picking, aviso interno y prueba no la leen (R13).
- `EjecucionEnvioService` la llena con `() => this.deps.reglasPais.moneda()`.
- `transito/informe.ts > generar`:
  - pide `await ctx.moneda?.()`;
  - si no hay función, lanza (un llamante que la olvidó, como `fechaHora` sin zona);
  - pasa la moneda a `variables(modelo, moneda)` y a `pdfInformeTransito(modelo, moneda)`.
- `seleccionarTransito` y `clasificar` **no cambian**: la vista previa del panel
  (`previsualizarInformeTransito`) solo cuenta paquetes y no necesita moneda.
- `calculo.ts > variables` y `pdf.ts`: `formatMontoString(x)` pasa a `formatearMontoEn(moneda, x)`.

### 5.4 PDF de etiquetas por API (R14)

- `lib/pdf/etiquetas-dibujo.ts`: `datosDeEtiqueta`, `textosConFuenteEmbebida` y `drawEtiqueta`
  ganan un último argumento opcional `moneda?: FormatoMoneda`. Sin él, se usa la de la plataforma:
  es el generador del navegador (SLT-235), que no cambia. Este archivo entra en la lista de R20.
- `lib/pdf/etiquetas-pdf-lote.ts > buildEtiquetasLotePdf(etiquetas, moneda?)` la pasa a
  `drawEtiqueta`.
- `EtiquetasLotePdfService` gana `reglasPais?: Pick<IReglasPaisEmpresa, "moneda">` como último
  argumento del constructor:
  - en `generarYAlmacenar` y en `generarYAlmacenarPorOrden` lee la moneda **después** de saber que
    hay etiquetas y **antes** de `build`;
  - sin `reglasPais` lanza, como `zonaDeLaEmpresa`;
  - el `build` inyectable pasa a `(dtos, moneda) => Promise<Uint8Array>`.
- Las 3 rutas (`api-key/carga`, `carga/[cargaId]/generate`, `orden/[id]/generate`) pasan
  `construirReglasPaisEmpresa(prisma)`. La segunda parte de la guardia lo exige sin tocarla: detecta
  sola los constructores con `reglasPais` opcional (R21).
- **Errores:** `PaisSinMoneda` sigue la política best-effort de la carga por API (`etiquetasPdf: {
  error }`, feature 136 R12). Las órdenes se crean y el PDF no.
- **Fuente embebida:** un símbolo que la fuente del PDF no cubre ya lo para `exigirCobertura` (R21 de
  la 282) con su error de hoy. No se amplía la fuente: con CR no cambia nada, y el símbolo de cada
  país nuevo se revisa en SLT-236.

### 5.5 Facturas de planes (R15)

Sin lectura de país. Solo dejan de depender de `monedaConfig` y de `money` implícitos:
- `lib/facturas-plataforma/resumen.ts`: `notaMoneda` e `importeDocumento` leen
  `MONEDA_DE_LOS_PLANES`.
- `lib/services/email/plantillas/factura-emitida.ts`: `money(x)` pasa a
  `formatearMontoEn(MONEDA_DE_LOS_PLANES, x, SIN_MONTO_RAYA)`.
- `lib/planes/mensajes.ts > textoDelCobroVigente`: lo mismo.

Ninguno pinta impuesto (SLT-118). R15 lo fija un test con una empresa de país de prueba y
`reglasPaisFijas` con `MONEDA_DE_PRUEBA`: el correo, la nota y el importe del PDF salen con la moneda
de la plataforma y sin «IVA» ni el nombre del impuesto de prueba.

### 5.6 Alta de empresa (R17)

`OrganizacionService > paisIncompleto(pais)` añade `pais.moneda === null || pais.impuestoNombre ===
null`. La respuesta es la de hoy: `{ ok: false, campo: "paisId" }` → `validation_error` en `paisId`.

### 5.7 Lo que no cambia (R18, R19)

- `lib/utils/monto-cobrar.ts > normalizarMontoCobrar` no se toca. Un test con una empresa de país de
  prueba de 2 decimales fija que `"125.50"` se redondea a la unidad como hoy.
- No hay migración de enums ni de conceptos. `lib/api/openapi-spec.ts` no se toca y su test de
  contrato existente sigue verde.

## 6. Autorización y módulos

- **Escritura de los datos del país:** solo plataforma, y en esta ficha solo por migración. La base
  lo garantiza con el `REVOKE` a `servi_app` (R4). La edición es de SLT-236.
- **Lectura:** la empresa lee su país por `pais_lectura` y por el puerto, que nunca recibe la empresa
  de quien llama.
- **Operaciones** (envíos de WhatsApp, informes, PDF de etiquetas, alta de empresa): la autorización
  de siempre, en sus bordes. Esta ficha no cambia quién puede hacer qué.
- **Módulos:** todo es núcleo. No hay puerta de módulo nueva.

## 7. Guardia (R20, R21)

`tests/unit/guards/pais-sin-literales.guardia.test.ts` amplía `literalesDelPais`. Mira el mismo
árbol que hoy y siempre después de `quitarComentarios`:
- `₡`;
- `\bCRC\b`;
- `\bIVA\b` (en mayúsculas y como palabra: `ingreso_iva` o `ACTIVA` no casan);
- un import de `money`, `moneyTope`, `formatMonto`, `formatMontoString`, `formatMontoTope`,
  `montoExacto` o `monedaConfig` desde `@/lib/config/moneda`.

Lleva sus casos de autocomprobación con fuentes inventadas, como los de hoy.

**Lista de excepciones** (`_pais-sin-literales-excepciones.ts`):
- Las fichas admitidas pasan a ser `SLT-81`, `SLT-90`, `SL-22`, `SLT-235` y `SLT-237`, más
  `permanente` para lo que no se retira nunca. Una entrada `permanente` lleva en el motivo la fecha de
  la decisión.
- El tope sube una sola vez, al número exacto que dé el censo al terminar T5.1, y desde ahí solo
  baja.

Entradas previstas; el implementer confirma la lista con la salida de la guardia:

| Archivo | Ficha | Motivo |
|---|---|---|
| `lib/config/moneda.ts` | SLT-237 | Valores por defecto de la moneda de la plataforma (`CRC`, `₡`), la de los planes |
| `lib/types/plantilla-datos.ts` | SLT-235 | Ejemplo «₡12.500» del selector y moneda de la plataforma en la vista previa del navegador |
| `lib/whatsapp-envios/informes/transito/informe.ts` | SLT-235 | Ejemplo «₡322.900» del panel de variables |
| `lib/pdf/etiquetas-dibujo.ts` | SLT-235 | Moneda de la plataforma para el generador del navegador |
| `lib/services/AnaliticaFinancieraService.ts` | SLT-235 | `monedaConfig.currency` del DTO que pintan las pantallas |
| `app/paquete/[numGuia]/page.tsx` | SLT-235 | Página pública |
| `lib/constants/impuesto-rotulo.ts`, `lib/constants/wallet-rotulos.ts`, `lib/analytics/metrics.ts`, `lib/types/tarifa-flexible.ts` | SLT-235 | Rótulos y mensajes de pantalla con «IVA» |
| `lib/repositories/TarifaValorRepository.ts` | SLT-235 | Texto «IVA 13.00» del historial de tarifas (decisión del 2026-11-20) |
| `lib/repositories/_shared/resolver-tarifas.ts` | SLT-235 | Mensaje interno de error con «IVA» |
| `lib/api/openapi-spec.ts` | permanente | Documento OpenAPI estático, público y común a todas las empresas (decisión del 2026-11-20) |
| Las `page.tsx` de `app/` que escriban «IVA», si las hay | SLT-235 | Pantalla |

**Segunda parte (R21):** no cambia de código. Detecta `reglasPais?` en el constructor de
`EtiquetasLotePdfService` y exige el real en sus 3 rutas.

## 8. Mapa R → test

| R | Test |
|---|---|
| R1, R3 | `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts`: CR queda con CRC/₡/./,/2/IVA; foto de `pais` (otras columnas) y de las demás tablas idéntica; `down` y vuelta a subir; no existe columna de tasa |
| R2, R4 | `tests/integration/db/pais-moneda-impuesto.test.ts`: cada `CHECK` con un `XA`; `servi_app` recibe 42501 al escribir y lee sus columnas |
| R5, R6, R7 | `tests/unit/services/reglas-pais-empresa-service.test.ts` (casos nuevos): dos contextos seguidos, cada uno su moneda; `XC` sin moneda → `PaisSinMoneda`; sin impuesto → `PaisSinImpuesto`; sin empresa → `EmpresaNoResuelta` |
| R8 | `tests/unit/config/moneda-formato-pais.test.ts`: tabla con `MONEDA_DE_PRUEBA` (0 decimales, espacio, punto), 1 y 2 decimales, negativos, cero, desbordes del acarreo |
| R9 | `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` (7 caminos, mismo texto) y `moneda-formato-pais.test.ts` (fila CR migrada = `MONEDA_PLATAFORMA`) |
| R10, R11 | `tests/unit/services/whatsapp-moneda-por-pais.test.ts`: los 3 llamantes con `MONEDA_DE_PRUEBA` pintan `{{monto}}` en ella; sin importe, `moneda()` no se llama aunque lance |
| R12, R13 | `tests/unit/whatsapp-envios/informe-moneda-por-pais.test.ts`: tránsito con `MONEDA_DE_PRUEBA` en `por_cobrar` y en el texto del PDF; picking, aviso y prueba con un `ctx.moneda` que lanza → generan bien |
| R14 | `tests/unit/services/etiquetas-lote-pdf-service.test.ts` (casos nuevos): `build` recibe la moneda del país en los dos modos; `PaisSinMoneda` antes de subir nada |
| R15 | `tests/unit/planes/factura-moneda-plataforma.test.ts`: con reglas de país de prueba, el correo, la nota, `importeDocumento` y `textoDelCobroVigente` salen en `MONEDA_DE_LOS_PLANES` y sin nombre de impuesto |
| R16 | Los tests existentes de plantillas, informe de tránsito, etiquetas y facturas siguen verdes sin cambiar sus valores esperados, más un caso CR en cada test nuevo de R10–R15 |
| R17 | `tests/unit/services/organizacion-service-pais.test.ts` (casos «sin moneda» y «sin impuesto») |
| R18 | `tests/unit/utils/monto-cobrar-por-pais.test.ts` |
| R19 | `migracion-sl21-ida-y-vuelta.test.ts` (enums y `wallet_movimiento` iguales) y el test de contrato existente de `openapi-spec` |
| R20, R21 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` |
| R22 | Los de integración de arriba con CR y `XA`; sin E2E |

## 9. Riesgos y coordinación

- **Choque con SLT-81 «Datos del país: pantalla del superadmin y formularios»** (en curso, mismo
  assignee). Comparten `lib/types/pais.ts`, `PaisRepository`, `OrganizacionService` y las fábricas de
  tests. Al ser de la misma persona, no es un conflicto de equipo, pero quien mergee segundo resuelve
  la mezcla de `PaisDTO`.
- **Fixtures de `PaisDTO`.** Los tests que construyen un `PaisDTO` a mano ganan los dos campos
  (`tasks.md > Archivos esperados`).
- **Tamaño del PR:** pasa el tope; lo aceptó el humano el 2026-11-20. El leader escribe la línea
  `tamano-pr-aceptado` en `progress/features/SL-21.md`.

## 10. Alternativas descartadas

1. **Un provider o contexto de React con la moneda, también en el servidor**, que el formateador
   leyera de un contexto implícito (`AsyncLocalStorage` o similar) en vez de recibirla. Ahorra
   firmas, pero vuelve a crear un global, ahora por petición. Un llamante fuera del contexto (job,
   cron, `paraCadaEmpresa`) pintaría en silencio con la moneda equivocada. Es el mismo fallo mudo
   que SLT-42 cerró pasando la zona como parámetro. Aquí la moneda es parámetro explícito de
   `formatearMontoEn`, y cada salida del servidor la pide al puerto. El provider sí tendrá sentido
   en SLT-235 para las pantallas, que no tienen puerto.
2. **Tabla `moneda` aparte con FK desde `pais`.** Normaliza bien si muchos países comparten moneda
   (USD), pero obliga a una pantalla y un `REVOKE` más y a decidir la propiedad de una fila
   compartida. Además, el separador de miles es del país, no de la moneda: `es-PA` y `en-US` usan USD
   con convenciones distintas. Con columnas en `pais` basta, y es el patrón cerrado.
3. **`Intl.NumberFormat` con locale por país.** Daría separadores y símbolo sin columnas, pero el
   repo lo descartó a propósito (feature 201): con `es-CR` pinta espacio fino como separador de
   miles, y además convierte a `number`, que las guardias de dinero prohíben. Seguir con el
   formateador por cadena conserva la exactitud de la ficha 359.
4. **Parámetro `moneda` obligatorio en `drawEtiqueta`, `resolverValoresPlantilla` y el PDF de
   tránsito.** Es más estricto, pero obliga a tocar unos 10 archivos de tests más y los 3 llamantes
   del navegador, que son de SLT-235. Se elige opcional con la moneda de la plataforma por defecto,
   solo en módulos compartidos con el navegador. La red son los tests de R10, R12 y R14 y la lista
   de excepciones de R20, que nombra esos módulos.
5. **Leer la moneda siempre al abrir un envío o un informe.** Más simple, pero una empresa de un país
   sin moneda perdería también los envíos y los informes que no pintan importes. Por eso la lectura
   es perezosa (R11, R13).

## Dependencias de terceros

Ninguna nueva.
