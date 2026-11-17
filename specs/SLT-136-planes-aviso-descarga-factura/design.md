# SLT-136 — planes-aviso-descarga-factura · design.md

> Requisitos: `requirements.md` (R1–R33). Todas las decisiones están cerradas por el humano (2026-11-17), y el
> tamaño, aceptado en un solo PR. Escrito por `spec_author` el 2026-11-17.
>
> - **Una migración**, solo de enums, con su `down.sql`.
> - **Sin dependencias nuevas:** jsPDF y exceljs ya están aprobados en `docs/dependencias.md`.
> - **Enmiendas explícitas:** SLT-118 R25 (el cierre ahora avisa) y la guardia de SLT-91 R10 (`/mi-plan` en el
>   catálogo de avisos y en el correo).

## Lo que ya existe

Buscado el 2026-11-17 con `factura_plataforma`, `descarga`, `jsPDF`, `buildXlsxLibro`, `plan_aviso_correo`,
`NotificacionEvento`, `emitir`, `factura emitida` y `mi-plan`, en el board (`feature_list.json`), en `specs/` y en el
código. El grafo `codebase-memory-mcp` no tiene índice de este worktree (`index_status`: «project not found»): busqué
con Grep y Read.

- **Board:** esta ficha. SLT-132 tiene los correos del pago (fuera). SLT-118 «Planes: factura por empresa y período
  con la cuota y las órdenes» y SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro» están hechas y
  dejan los datos y las pantallas. Ninguna otra ficha descarga facturas ni avisa al cerrarlas.
- **`specs/`:** SLT-118 R25 prohíbe avisar al cerrar (se enmienda, §8). SLT-119 lo deja todo en solo lectura y sin
  descarga (`DetalleDeFactura.tsx:38`, `docs/architecture.md:393`).
- **Código que se reutiliza:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| `deLaEmpresa()`, `deEmpresaParaPlataforma()`, `detalleDeLaEmpresa()`, `conEmpresa` | `lib/repositories/FacturaPlataformaRepository.ts` | La cabecera de la descarga sale de `deLaEmpresa()`, la misma que la lista (R1). La del superadmin va por `conEmpresa`, como `detalleParaPlataforma` (R2) |
| `cerrar(org, ahora)` → `SELECT factura_plataforma_cerrar(...)`; la función fija `cerrada_at = p_ahora` (`20261111130100…/migration.sql:536`) | idem | Se envuelve en una transacción que, tras cerrar, lee las cerradas con `cerrada_at = ahora` y encola sus avisos (R21) |
| Outbox `encolarEnEmpresas(tx, …)` + `JobRepository.enqueue(…, { dedupeKey }, tx)` con `ON CONFLICT (dedupe_key) DO NOTHING` | `lib/repositories/PlanesRepository.ts:619-657`, `IJobRepository.ts:70-81` | Mismo patrón, en el repositorio de facturas (R21) |
| `crearPlanAvisoCorreoHandler`: un correo por maestro activo; si un envío falla, sigue y después falla; sin datos personales en `last_error` | `lib/planes/jobs-cambio-plan.ts:406-464` | Molde del manejador nuevo (R26–R28) |
| `PlanesRepository.destinatariosDelAviso(org, null)` → `{ empresaNombre, maestros }` activos | `PlanesRepository.ts:2128` | **Se reutiliza** para los destinatarios del correo (R26, R28) |
| `componerCorreo` (bloques `parrafo`, `boton`, `nota`; logo por CID) | `lib/services/email/plantillas/plantilla-marca.ts` | Plantilla nueva sobre ella (R26, R29) |
| `baseUrlDeLaApp()` | `lib/config/app-url.ts` | La URL del botón (R26, R29) |
| `emitirFilas`, la dedupe estructural `notificacion_dedupe_key` (evento, entidad, destinatario) y `repoReal()` (push y WhatsApp) | `lib/notificaciones/emitir.ts`, `notificadores.ts` | El aviso nuevo (R22, R23) |
| Catálogos exhaustivos `Record<NotificacionEvento, …>` | `catalogo-avisos.ts`, `push-elegibles.ts`, `lib/whatsapp-envios/eventos.ts` | Una entrada cada uno (R23) |
| Migraciones de enum de la campana y su `down.sql` con `pg_temp.quitar_valores_de_enum_462` | `db/migrations/20260925130000_…/` | Molde de la migración (R31) |
| jsPDF A4, `fuenteEtiqueta`, `registrarFuente`, `cubreCodePoint` (el `₡`), altura de fila fija y paginación con cabecera repetida | `lib/whatsapp-envios/informes/transito/pdf.ts`, `lib/pdf/etiquetas-fuente*.ts` | Molde del PDF (R7–R14) |
| `buildXlsxLibro`, `XlsxColumn.formato: "monto"` → `celdaMonto` + `#,##0.00` | `lib/utils/xlsx-template.ts`, `xlsx-monto.ts` | El Excel (R16) |
| `descargarBlob` | `components/shared/descargar-blob` | Bajar el archivo en el navegador |
| `FACTURAS_TEXTOS`, `estadoVisible`, `numeroVisible`, `sumaDeCuotas`, `aCentimos`/`aTexto`, `money`, `fechaCalendario`, `horaDePared`, `ZONA_CR` | `components/shared/facturas/facturas-vista.ts`, `lib/planes/centimos.ts`, `lib/config/moneda.ts`, `lib/utils/calendario-zona.ts` | Formato y sumas exactas (R8–R13) |
| Logos en `public/brand/` (solo Servi Logistic) y `MARCA` | `lib/config/marca.ts` | Se suma el logo provisional de Singularis y su ruta (R7, R14) |

## 1. Modelo de datos y migración

**Ninguna tabla ni columna nueva.** La descarga solo lee `factura_plataforma` y `cobro_plataforma_traza` con la RLS
de siempre, y `orden.num_remision` por la FK `ordenId` de la traza.

**Migración `db/migrations/20261117120000_factura_plataforma_aviso_enums/`** (R31). Su timestamp es posterior a
`20261116120000_pago_plataforma_confirmacion`. Si `dev` avanzó al abrir el PR, se renumera antes de aplicarla, nunca
después.

```sql
ALTER TYPE "notificacion_evento"       ADD VALUE IF NOT EXISTS 'factura_plataforma_emitida';
ALTER TYPE "notificacion_entidad_tipo" ADD VALUE IF NOT EXISTS 'factura_plataforma';
ALTER TYPE "job_tipo"                  ADD VALUE IF NOT EXISTS 'factura_plataforma_aviso';
```

- Solo añade valores: el primer uso es en runtime (`55P04`). No tiene backfill, no toca la RLS y no crea índices.
- `down.sql` copia la función de la 462 con el sufijo `_136`. Lee la lista vigente de `pg_enum` y quita solo estos
  tres valores. Si una fila de cualquier columna de esos tipos los usa, aborta con `RAISE` (por ejemplo, un aviso en
  `notificacion`, un cupo en `push_envio_dia` o un trabajo en `jobs`).
- `db/schema.prisma`: los tres valores con su comentario en `NotificacionEvento`, `NotificacionEntidadTipo` y `JobTipo`.
- Nombres: ningún nombre de evento contiene «plan», así que la guardia de SLT-91 R9 sigue verde.
- `organizacion_id`: el aviso y el trabajo lo toman del DEFAULT `app.organizacion_id` (SL-17), fijado por empresa en el
  outbox (§4) y por `conSuEmpresa` en el trabajo.

**Datos que dependen del país.**
- **Moneda:** `money()` de la app, la de SL-21, sin conversión.
- **Hora:** `ZONA_CR`, la de la plataforma hasta SLT-90, igual que las pantallas de SLT-119. El correo usa la misma
  zona que el PDF y las pantallas para que el período coincida. No usa la del país de la empresa, que sí usa
  `plan_aviso_correo`.
- **Impuestos y métodos de pago:** ninguno (estado de cuenta interno).

## 2. Lectura para la descarga (R1–R6)

### 2.1 Tipos (`lib/types/factura-plataforma.ts`)

```ts
/** R1, R6: un movimiento de la factura, entero (sin paginar), con la remisión de su orden. */
export interface MovimientoDeFactura { id: string; instante: Date; numGuia: number | null; numRemision: string;
  tipo: TipoLineaFactura; valor: string /* con signo, 2 decimales */ }
export interface DatosDescargaFactura { factura: FacturaPlataformaDTO; empresaNombre: string; movimientos: MovimientoDeFactura[] }
export type DescargaFacturaResult =
  | { estado: "ok"; datos: DatosDescargaFactura } | { estado: "forbidden" } | { estado: "not_found" }
  | { estado: "validation_error"; errores: Record<string, string> };
export const descargaFacturaSchema = z.object({ facturaId: z.uuid() });                         // maestro
export const descargaFacturaEmpresaSchema = descargaFacturaSchema.extend({ organizacionId: z.uuid() }); // superadmin
```

### 2.2 Repositorio

`IFacturaPlataformaRepository` gana dos métodos de lectura:

```ts
datosDescargaDeLaEmpresa(facturaId: string): Promise<DatosDescargaFactura | null>;
datosDescargaParaPlataforma(organizacionId: string, facturaId: string): Promise<DatosDescargaFactura | null>;
```

`datosDescargaDeLaEmpresa`:
1. `(await this.deLaEmpresa()).find(f => f.id === facturaId)`. Si no aparece o su `estado !== "cerrada"`: `null` (R4).
   Otra empresa no la ve: la RLS y el `WHERE` de `CERRADAS_JSON` ya la dejan fuera.
2. En un `$transaction` `RepeatableRead` (una sola foto), dos lecturas:
   - `cobroPlataformaTraza.findMany({ where: { cobradoAt: { gte: desde, lt: hasta } }, orderBy: [{ cobradoAt: "asc" },
     { id: "asc" }], select: { id, cobradoAt, numGuia, tipoMovimiento, valorCobrado, orden: { select: { numRemision:
     true } } } })`;
   - `organizacion.findFirst({ select: { nombre } })`: la RLS deja ver solo la del contexto.
3. `valor = valorCobrado.toFixed(2)`. La remisión sale por la relación aunque la orden esté eliminada (R6): el borrado
   es lógico (`deleted_at`) y la FK es `CASCADE` solo ante un borrado físico. **Riesgo, probado en T1.4:** que una
   extensión de Prisma filtre las órdenes eliminadas en la relación. Si pasa, la remisión se lee con
   `orden.findMany({ where: { id: { in } } })` sin ese filtro, en la misma transacción.

`datosDescargaParaPlataforma(org, id)` = `conEmpresa(org, () => this.datosDescargaDeLaEmpresa(id))`. Es el camino de
`detalleParaPlataforma`: no pasa por `comoPlataforma` ni añade nada a `EXCEPCIONES_DE_PLATAFORMA`.

**Volumen.** No hay paginación (decisión «Contenido del Excel»: cada movimiento). La plantilla de referencia tiene
2 567 movimientos en tres semanas, unos 250 kB de respuesta. Una factura mensual de una empresa grande puede llegar a
decenas de miles: se acepta, porque es un clic explícito sobre una factura de un solo período. El límite de filas de
Excel (`lib/utils/limite-excel.ts`) se respeta en §5 igual que en `DescargarDatasetButton`.

### 2.3 Servicio y actions

`FacturaPlataformaService` gana dos métodos, con el mismo orden de comprobaciones que el detalle de SLT-119 (§4):
actor → `forbidden` (R3); esquema → `validation_error` (R5); repositorio `null` → `not_found` (R4).

| Método | Quién | Esquema | Repositorio |
|---|---|---|---|
| `descargaDeMiEmpresa(actor, input)` | `ROLES_MI_PLAN.includes(actor.rol)` | `descargaFacturaSchema` | `datosDescargaDeLaEmpresa` |
| `descargaDeEmpresa(actor, input)` | `esPlataforma(actor.rol)` | `descargaFacturaEmpresaSchema` | `datosDescargaParaPlataforma` |

`lib/actions/facturas-plataforma.ts` (`"use server"`) gana dos actions:
- `descargarFacturaMiPlanAction(input)`.
- `descargarFacturaEmpresaAction(organizacionId, input)`, ligada en la página con `.bind(null, organizacionId)`. Un
  `organizacionId` en `input` no cuenta: manda el ligado (R2).

El reparto no cambia: el archivo de actions ya es `nucleo` en `MODULO_POR_ACTION`.

## 3. El resumen, puro (`lib/facturas-plataforma/resumen.ts`)

Funciones sin React y sin E/S. Las comparten el PDF y las pruebas.

```ts
export interface DiaDelDesglose { dia: string /* YYYY-MM-DD en ZONA_CR */; cargos: number; reversos: number; netas: number; importe: string }
export interface ResumenDeFactura {
  cargos: { cantidad: number; importe: string };      // importe = factura.cargos (base)
  reversos: { cantidad: number; importe: string };    // importe = "-" + factura.reversos (base)
  totalOrdenes: { cantidad: number; importe: string };// cantidad = cargos − reversos; importe = factura.totalOrdenes
  cuota: string;                                      // sumaDeCuotas(factura) ?? "0.00"  (R9: primera cuota sumada)
  total: string; movimientos: number;                 // de la base (R10)
  dias: DiaDelDesglose[];                             // solo días con movimientos, ascendentes (R11)
}
export function resumirFactura(d: DatosDescargaFactura): ResumenDeFactura; // lanza DescuadreDeFactura (R15)
```

- El día de cada movimiento es `fechaCalendario(instante, ZONA_CR)`.
- El importe por día es la suma exacta en céntimos (`aCentimos`/`aTexto`), nunca con `Number`.
- **Comprobación (R15):** si Σ de los importes por día ≠ `totalOrdenes`, o el número de cargos + el de reversos ≠
  `movimientos`, se lanza `DescuadreDeFactura`. La base garantiza los dos invariantes (SLT-118 R7), así que un
  descuadre es un fallo, no un caso de presentación. No se emite un archivo con dos totales que no casan.
- Textos y formatos de la descarga, en el mismo módulo:
  - `FACTURA_DESCARGA_TEXTOS`: todos los literales del PDF y del Excel;
  - `fechaNumerica(instante)`: `dd/mm/aaaa` en `ZONA_CR`;
  - `periodoNumerico(desde, hasta)`: R8, con `hasta − 1 ms`;
  - `nombreArchivoFactura(numero, empresa, ext)`: R18, normalizado con NFD, sin diacríticos, en minúsculas y con
    guiones.

## 4. El PDF (`lib/facturas-plataforma/pdf.ts`)

`construirPdfFactura(datos, resumen, logo: LogoDelPdf | null): ArrayBuffer`. Es función pura sobre jsPDF: la prueba lee
el texto del documento. La carga del logo vive fuera, en el componente (§6).

- **Base:** A4 vertical en mm, `fuenteEtiqueta` registrada como en `transito/pdf.ts`. Todo texto que venga de la base
  pasa por `imprimible` (R13). Para no duplicarla, se mueve de `transito/pdf.ts` a `lib/pdf/imprimible.ts`.
- **Cabecera (R7):** banda oscura con el logo a la izquierda. A la derecha, «FACTURA DE PLATAFORMA», «Factura N.º n» y
  «Cliente: …», y debajo el filete de color de la plantilla. Si `logo === null`, va «Singularis» en texto (R14).
- **Tarjetas (R8):** una rejilla de 2 × 3 con etiqueta en versalitas y valor en negrita. Valores: `estadoVisible`,
  `periodoNumerico`, `fechaNumerica(hasta)`, `FACTURAS_TEXTOS.periodicidad` y el plan según R8.
- **Resumen (R9):** tres columnas; los reversos en negativo y en rojo; «Total órdenes» en negrita con filete; «Cuota
  del plan» con «—». La franja «Total a pagar» (R10) va debajo, y después la nota de movimientos.
- **Desglose por día (R11):** empieza en página nueva, como en la plantilla, y usa altura de fila fija. Al llegar al
  límite salta de página y repite la cabecera de la tabla (R12). Debajo van la fila «Total» y la nota del Excel. Sin
  días: «Sin movimientos en el período» y el total en cero (R17).
- **Pie (R12):** se dibuja al final, recorriendo `doc.getNumberOfPages()` para conocer `m`.
  - Izquierda: `${MARCA_FACTURA.pie} · Factura N.º n · empresa`.
  - Derecha: «Página n de m».
- **Importes:** `money(importe)` sobre el texto de la base o el de la suma exacta (R13). Las cantidades van con
  separador de miles, como la plantilla.

**Marca (`lib/config/marca.ts`).** Se añade:

```ts
/** SLT-136: la marca de la factura de la plataforma. PROVISIONAL: el logo es un rectángulo negro; el humano lo
 *  reemplaza por el real con el MISMO nombre de archivo, sin tocar código. */
export const MARCA_FACTURA = {
  emisor: "Singularis",
  pie: `Singularis · Plataforma ${MARCA.nombre}`,
  logo: { ruta: "/brand/logo-singularis.png", ancho: 400, alto: 100 }, // PNG: jsPDF no pinta SVG
} as const;
```

El archivo `public/brand/logo-singularis.png` es una copia del provisional de `docs/referencias/` del checkout
principal. El `.svg` no se copia: el PDF no lo usa.

## 5. El Excel (`lib/facturas-plataforma/excel.ts`)

`construirExcelFactura(datos): Promise<ArrayBuffer>` = `buildXlsxLibro([{ nombre: "Movimientos", columns, rows }])`
(R16):

| key | header | valor |
|---|---|---|
| `fecha` | Fecha | `${fechaNumerica(instante)} ${horaDePared(instante, ZONA_CR)}` |
| `guia` | Guía | `numGuia` o `null` (celda vacía) |
| `remision` | Remisión | `numRemision` |
| `tipo` | Tipo | «Cobrado» o «Reverso» |
| `valor` | Valor | `valor` con `formato: "monto"` (número exacto, `#,##0.00`) |

- Sin movimientos, solo va la fila de cabeceras (R17).
- Si pasa el límite de filas de Excel, lanza `LimiteExcelExcedidoError` y el componente lo muestra con
  `mensajeLimiteExcel`, como `DescargarDatasetButton`.

## 6. Los botones (`components/shared/facturas/`)

- **`DescargarFactura.tsx`** (`"use client"`, nuevo).
  - Props: `facturaId: string` y `descargar: (input: { facturaId: string }) => Promise<DescargaFacturaResult>`.
  - Pinta «Descargar PDF» y «Descargar Excel». Al pulsar uno, deshabilita los dos (R20).
  - Primero llama `descargar`. Con `ok`, carga el logo: `fetch(MARCA_FACTURA.logo.ruta)` → `Uint8Array`; si falla,
    `null` (R14).
  - Después: `resumirFactura`, `construirPdfFactura` o `construirExcelFactura`, y `descargarBlob(nombreArchivoFactura…)`.
  - Cualquier throw o estado distinto de `ok` muestra «No se pudo descargar la factura» en un texto `role="alert"`
    dentro del panel, que sigue abierto (R15, R20).
  - jsPDF y exceljs se importan con `import()` dinámico: no pesan en la carga de la pantalla.
- **`DetalleDeFactura.tsx`**: prop nueva `descargar`. Pinta `<DescargarFactura>` bajo la cabecera solo si
  `!esNoCerrada(factura)` (R19). Se actualiza el comentario de la línea 38 («solo lectura»: las descargas no escriben).
- **`FacturasDeLaEmpresa.tsx`**: pasa `descargar` al detalle.
- **`facturas-vista.ts`**: textos de los botones y del error en `FACTURAS_TEXTOS.descarga`.
- **«Mi plan»:** `app/(app)/mi-plan/page.tsx` pasa `descargar: descargarFacturaMiPlanAction` dentro de `facturas`, y
  `MiPlanModule.tsx` lo reenvía; `FACTURAS_NO_RECIBIDAS` lleva un `descargar` que devuelve `not_found`. Ningún archivo
  nuevo nombra la ruta.
- **Superadmin:** `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` pasa
  `descargar={descargarFacturaEmpresaAction.bind(null, empresa.organizacionId)}`.

## 7. El aviso al cerrar (R21–R30)

### 7.1 El cierre encola (outbox)

`FacturaPlataformaRepository.cerrar(org, ahora)` sigue en `comoPlataforma` y sigue devolviendo el número de cerradas
(contrato sin cambios). Por dentro pasa a ser un `$transaction`:
1. `SELECT factura_plataforma_cerrar(org, ahora)`. La función toma la empresa en `FOR UPDATE` y el candado dura hasta el
   commit.
2. `SELECT id FROM factura_plataforma WHERE organizacion_id = org AND estado = 'cerrada' AND cerrada_at = ahora`: las
   que cerró esta llamada (la función fija `cerrada_at = p_ahora`).
3. Para cada id, con `encolarEnEmpresas`, se encola en esa empresa:
   `new JobRepository(tx).enqueue("factura_plataforma_aviso", { facturaId }, { dedupeKey:
   "factura_plataforma_aviso:<facturaId>" }, tx)`.

   `encolarEnEmpresas` se mueve de `PlanesRepository` a `lib/repositories/_shared/encolar-en-empresas.ts` y los dos lo
   importan. Su comportamiento no cambia.

Cierre y avisos se confirman o se pierden juntos (R21). La `dedupe_key` hace que un encolado repetido no duplique nada.
El manejador del cierre (`crearCierreFacturasHandler`) no cambia y no importa ningún emisor.

### 7.2 El trabajo `factura_plataforma_aviso` (`lib/planes/jobs-factura-aviso.ts`)

- Es puntual, con empresa, de núcleo (`MODULO_POR_JOB`) y está cableado en `buildHandlers` (R30).
- Payload: `{ facturaId }`, validado con zod. Si está malformado, falla con su motivo en `last_error`.

```ts
export interface DepsAvisoFactura {
  facturas: Pick<IFacturaPlataformaRepository, "deLaEmpresa">;
  destinatarios: Pick<IPlanesRepository, "destinatariosDelAviso">;
  emitirAviso: (ctx: FacturaEmitidaContexto) => Promise<number>; // emitirFacturaEmitidaReal
  sender: IEmailSender; contacto: string | null; urlApp: string | null;
}
export function crearFacturaAvisoHandler(deps: () => DepsAvisoFactura): JobHandler;
```

1. Lee la empresa con `empresaDelJob(job)`; si el trabajo no la tiene, falla.
2. Busca la factura en `deLaEmpresa()` por id. Si no aparece o no está cerrada, termina sin hacer nada (R28).
3. Ejecuta `emitirAviso({ facturaId, numero, desde, hasta })`. **No es best-effort:** si lanza, el trabajo falla antes
   de enviar ningún correo y se reintenta. El reintento no duplica el aviso: la entidad es la factura y la clave única
   lo absorbe (R22, R27).
4. Lee `destinatariosDelAviso(org, null)`. Con `null` o sin maestros, termina con el aviso ya creado (R28).
5. Envía un correo por maestro con `plantillaFacturaEmitida` (§7.4). Si alguno falla, sigue con los demás y después
   lanza `factura_plataforma_aviso: fallaron N de M envío(s) a la empresa <org>`, sin correos en el mensaje (R27).

Una factura de ₡0 sigue el mismo camino, sin ninguna rama aparte (R25). La entrega es «al menos una vez», como
`plan_aviso_correo`: si el SMTP envía y el trabajo falla antes de marcarse hecho, el correo se repite. Ese residuo ya
está aceptado en SLT-128.

### 7.3 La campanita y el push

- **`lib/notificaciones/emitir.ts`:**
  - `textoFacturaEmitida(numero, periodo)` →
    `Se emitió la factura N.º ${numero} de la plataforma, del ${periodo}.`. El período es «dd/mm/aaaa al dd/mm/aaaa»;
    sin montos (146 §4.6).
  - `emitirFacturaEmitida(repo, ctx)` crea una fila `alert`:

    ```ts
    { evento: "factura_plataforma_emitida", entidadTipo: "factura_plataforma", entidadId: facturaId,
      destinatario: { tipo: "rol", rol: "maestro" }, anexo: null }
    ```

    La entidad es la factura: se cierra una sola vez, así que la clave única da un aviso por factura para siempre, que
    es justo lo que se quiere.
  - Solo hay fila para el rol `maestro`, ninguna de `admin` ni de usuario; el superadmin no tiene empresa (R24).
  - Se emite `alert` y no `warning`: es dinero que la empresa debe a la plataforma.
- **`notificadores.ts`:** `emitirFacturaEmitidaReal = (ctx) => emitirFacturaEmitida(repoReal(), ctx)`. Usa
  `repoReal()` para heredar el push sin construir `new NotificacionRepository` (guardia 410/R51), y no es best-effort
  (§7.2).
- **`catalogo-avisos.ts`:** la entrada es accionable, con atajo «Ver factura» a `/mi-plan` y `destinatarios:
  ["maestro"]` (R23). La guardia R5 del catálogo comprueba que el maestro ve esa ruta.
- **`push-elegibles.ts`:** la entrada es `{ push: "si", roles: ["maestro"] }`, porque tiene dinero (R23).
- **`lib/whatsapp-envios/eventos.ts`:** la entrada es `disponible: false`, con este motivo: «Aviso del dinero de la
  empresa con la plataforma, solo para su maestro; ya le llega por correo». Los envíos por WhatsApp no son parte del
  alcance.
- **`lib/types/notificacion.ts`:** los dos literales, con su comentario.

### 7.4 El correo (`lib/services/email/plantillas/factura-emitida.ts`)

`plantillaFacturaEmitida({ to, nombre, empresaNombre, factura, contacto, urlApp }): EmailMessage`, sobre
`componerCorreo`:
- **Asunto:** `Factura N.º ${n} de la plataforma — ${empresaNombre}`.
- **Preheader:** `Total a pagar ${money(total)}`.
- **Bloques:**
  - párrafo con el saludo;
  - párrafo con el período (`periodoNumerico`);
  - una lista con «Cuota del plan» (`sumaDeCuotas ?? "0.00"`), «Cargos por orden», «Reversos de cargos» (en
    negativo) y «Total a pagar», todos con `money()` sobre el texto de la base;
  - el botón «Ver factura» → `${urlApp}/mi-plan`.
- **Sin URL de la app:** sin botón, y una `nota` con «Encuéntrala en Mi plan, dentro de la app.» (R29).
- **Adjuntos:** ninguno (R26).
- **Escape:** todo dato variable pasa por `escaparHtml`, porque lo hace `componerCorreo`.

El correo lleva importes; la campanita no (regla 146 §4.6). Es la decisión «Contenido del correo».

**Composition root.** `buildDepsAvisoFactura()` vive en `jobs-factura-aviso.ts` y arma:
- `FacturaPlataformaRepository(getPrismaClient())`;
- `PlanesRepository(getPrismaClient())`;
- `emitirFacturaEmitidaReal`;
- `crearEmailSender()`, `emailContacto()` y `baseUrlDeLaApp()`.

El cron (`app/api/cron/procesar-jobs/route.ts`) registra
`handlers.set("factura_plataforma_aviso", crearFacturaAvisoHandler(buildDepsAvisoFactura))`. El tipo no es recurrente.

## 8. Enmiendas explícitas

- **SLT-118 R25.** Su última frase («NO DEBE enviar correos ni avisos al cerrar») queda enmendada por R21 de esta ficha.
  - En `specs/SLT-118-…/requirements.md` no se toca el texto (spec cerrado). El cambio se anota en
    `docs/architecture.md > Facturas de la plataforma`.
  - El test `tests/unit/planes/jobs-factura-plataforma.test.ts > «R25: el cierre no envía correos ni avisos»` se
    renombra a «R25 (enmendado por SLT-136 R21): el manejador del cierre no envía nada; los avisos salen por la cola».
    Sigue afirmando que `jobs-factura-plataforma.ts` no importa emisores, y se suma un caso que comprueba que el
    tipo `factura_plataforma_aviso` está registrado.
- **Guardia de SLT-91 R10** (`tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`, R32). Se sigue prohibiendo
  nombrar la ruta fuera de la lista; la lista cambia así:
  - `permitidos` suma `lib/notificaciones/catalogo-avisos.ts` y `lib/services/email/plantillas/factura-emitida.ts`;
  - la lista exacta de `href` a la ruta pasa a ser `["lib/auth/menu-visibility.ts",
    "lib/notificaciones/catalogo-avisos.ts"]`;
  - la autocomprobación del barrido exige que aparezcan los dos archivos nuevos.

  R9 de SLT-91 («ningún evento habla del plan») no cambia y sigue verde (§1).
- **SLT-119:** el comentario de `DetalleDeFactura.tsx:38` y `docs/architecture.md:393` («sin descarga (SLT-136)») pasan
  a describir la descarga. Las descargas no escriben, así que SLT-119 R16 se mantiene y la guardia
  `cobro-plataforma-solo-por-trigger` sigue barriendo.

## 9. Tests (trazabilidad R → test)

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/factura-plataforma-descarga.test.ts` (nuevo) | R1, R2, R4, R6 | Base real y cierre con `factura_plataforma_cerrar`, con estos casos: todas las líneas (130, sin paginar) en orden; remisión de una orden eliminada en su reverso; la en curso → `null`; la de otra empresa → `null`; `ParaPlataforma` = `DeLaEmpresa` |
| `tests/unit/services/factura-plataforma-service.test.ts` (se amplía) | R3, R4, R5 | Repositorio doble: `forbidden` sin llamadas (admin, sin sesión, superadmin por la vía del maestro y al revés); `validation_error`; `null` → `not_found` |
| `tests/unit/actions/facturas-plataforma.test.ts` (se amplía) | R1, R2 | El actor sale de la sesión; manda la empresa ligada, no la del input |
| `tests/unit/facturas-plataforma/resumen.test.ts` (nuevo) | R9, R10, R11, R15, R17, R18 | Conteos; cuota + primera cuota; sin cuota → «0.00»; días en `ZONA_CR` (movimiento a las 23:30 CR); netas negativas; suma exacta; descuadre de importe y de conteo → lanza; sin movimientos; nombre de archivo con tildes |
| `tests/unit/facturas-plataforma/pdf.test.ts` (nuevo) | R7, R8, R9, R10, R11, R12, R13, R14, R17 | Se extrae el texto del PDF y se comprueba: cabecera, seis tarjetas, «Emitida», sin «Tarifa», ₡ presente, importes de la base sin redondear («1234.56» → «₡1 234,56»), 60 días → 2+ páginas con cabecera repetida y sin filas perdidas ni duplicadas, «Página n de m» en todas, logo `null` → «Singularis» |
| `tests/unit/facturas-plataforma/excel.test.ts` (nuevo) | R16, R17 | Se relee con exceljs: hoja «Movimientos», columnas, celda de valor numérica con `#,##0.00` y signo, guía vacía, solo cabeceras sin movimientos |
| `tests/components/DescargarFactura.test.tsx` (nuevo) | R14, R15, R20 | Deshabilita los dos botones; `not_found`, throw y descuadre → «No se pudo descargar la factura»; fetch del logo caído → descarga igual |
| `tests/components/DetalleDeFactura.test.tsx` (se ajusta) | R19 | Botones en una cerrada y no en una en curso; sigue sin botones de escritura |
| `tests/integration/db/factura-plataforma-aviso-migration.test.ts` (nuevo) | R31 | Los tres valores al final de su enum; el `down` quita solo esos tres, aborta si hay un aviso o un trabajo que los use y es idempotente |
| Inventarios de enums existentes (se amplían a mano con el valor nuevo) | R31 | `tests/integration/db/notificacion-evento-{bloqueo-cierre,dia-reparto-corregido,gasto-fijo,postulacion-recurso,webhook-suscripcion}-migration.test.ts`, `tests/integration/db/462/notificacion-evento-reprogramadas-migration.test.ts`. Si el gate pone en rojo algún otro inventario de `job_tipo`, se amplía igual |
| `tests/integration/db/factura-plataforma-cierre-aviso.test.ts` (nuevo) | R21, R25 | Un cierre de dos facturas pendientes → dos trabajos con su empresa y su `dedupe_key`; repetir el cierre no añade nada; un cierre que falla después de encolar (transacción abortada) no deja trabajos; una factura de ₡0 también encola |
| `tests/unit/planes/jobs-factura-plataforma.test.ts` (se ajusta) | R21 (enmienda R25) | §8 |
| `tests/unit/planes/jobs-factura-aviso.test.ts` (nuevo) | R22, R24, R25, R26, R27, R28, R30 | Dobles: emite y después envía uno por maestro; un aviso que lanza → no envía; un envío que falla → sigue y después lanza sin el correo; sin maestros → solo el aviso; factura inexistente o no cerrada → nada; total 0 → igual; payload malo → lanza; registro en `buildHandlers` y `MODULO_POR_JOB` |
| `tests/unit/notificaciones/emitir-factura-emitida.test.ts` (nuevo) | R22, R24 | Una sola fila, rol `maestro`, entidad = factura, texto sin «₡» ni dígitos de importe; la segunda emisión no crea fila |
| `tests/unit/notificaciones/catalogo-avisos.test.ts`, `tests/unit/notificaciones/push-elegibles.test.ts`, `tests/unit/whatsapp-envios/eventos-envio.test.ts` (se amplían) | R23 | Accionable con «Ver factura» → `/mi-plan` para el maestro; push sí, solo el maestro; WhatsApp no disponible |
| `tests/unit/services/notificacion-notificadores-reales.test.ts` (se amplía) | R23 | `emitirFacturaEmitidaReal` pasa por `repoReal()` |
| `tests/unit/services/email/plantilla-factura-emitida.test.ts` (nuevo) | R26, R29 | Asunto, período, cuota (con primera cuota), cargos, reversos y total de la base; botón con `${url}/mi-plan`; sin URL → sin botón y con la nota; sin adjuntos; un nombre con `<` se escapa |
| `tests/unit/api/procesar-jobs-registro.test.ts` (se amplía) | R30 | El tipo nuevo tiene handler y no es recurrente |
| `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (se enmienda) | R32 | §8 |
| `e2e/facturas-plataforma.spec.ts` (se amplía, proyecto `dinero`) | R33 | Después del paso «Cerrada»: el maestro descarga los dos archivos (`page.waitForEvent("download")`); nombres; se relee el Excel con exceljs: tres filas con las guías y remisiones de las dos órdenes, dos «Cobrado» de 300 y un «Reverso» de −300; el PDF pesa más de 0 bytes y empieza por `%PDF`. La en curso no muestra los botones. El superadmin descarga el PDF desde «Facturación». La campanita no se mira aquí: el E2E cierra con la función SQL, no por el repositorio, y R21 está cubierto en integración |

## 10. Alternativas descartadas

- **Generar los archivos en el servidor**, con un route handler que devuelva el PDF o el Excel. Habría dado una sola
  lectura sin cargar todas las líneas en el navegador, pero contradice la decisión «Cómo se arman los archivos», pide
  la fuente embebida en Node y otra ruta autorizada. Descartada.
- **Agregar por día en SQL**, con `GROUP BY date(cobrado_at AT TIME ZONE …)`. El Excel necesita igual cada
  movimiento, y la suma en el cliente se hace en céntimos exactos y se contrasta con los totales de la base (R15): una
  segunda consulta no aporta nada.
- **Que el SQL `factura_plataforma_cerrar` devuelva los ids o encole él mismo.** Pide reescribir una función del dueño
  ya inmutable en `dev`, con otra migración y otro `down.sql`. Como la función ya fija `cerrada_at = p_ahora`, leer
  las cerradas en la misma transacción basta.
- **Encolar los avisos en el manejador del cierre, después de `cerrar`** (fuera de la transacción). Un fallo entre el
  cierre y el encolado perdería el aviso para siempre: el reintento no encuentra nada vencido (SLT-118 R11).
- **Reutilizar `plan_aviso_correo` con un tipo de aviso nuevo.** Evitaría el valor de `job_tipo`, pero mezcla la factura
  con el esquema de cambios de plan (`avisoSchema`), y la migración de enums hace falta igual por la campanita.
- **Campanita best-effort** (`emitirBestEffort`). Un aviso perdido no se reintentaría. Como emitir es idempotente por
  la entidad, se hace antes de los correos y que falle el trabajo es seguro.
- **Atajo del catálogo con una constante importada** en vez del literal `/mi-plan`, para esquivar la guardia de SLT-91.
  Burlaría su letra sin cambiar su intención. La decisión del humano pide enmendarla de forma explícita (§8).
- **Una fila por usuario maestro** en vez del rol. Crea N filas y N claves, y la fila de rol ya llega a todos los
  maestros de la empresa (`emitirGastoFijoCobroPendiente`, la misma forma).
