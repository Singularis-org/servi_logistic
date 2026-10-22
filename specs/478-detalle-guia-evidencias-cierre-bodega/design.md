# 478 — Detalle por guía y evidencias en el cierre de bodega · design

> Sobre `dev` @ `502dc2de`. Búsqueda hecha con el MCP `codebase-memory`
> (`R-job-singularis-projects-ordenex`) y cada símbolo confirmado en el archivo real; donde el
> grafo no alcanzó (timeouts de `search_code`) se leyó el archivo con `grep`/lectura directa.

## 1. Medición: ¿falta dato o falta pantalla?

**Falta pantalla. El dato ya llega completo.**

### 1.1 El dato es el mismo en los dos detalles

| Paso | Detalle de mensajero | Detalle de bodega |
| --- | --- | --- |
| Lectura de gestiones | `CierresAdminRepository.findCierreByIdEnAlcance` — `lib/repositories/CierresAdminRepository.ts:1290-1298` con `GESTION_ADMIN_SELECT` + `DETALLE_ADMIN_SELECT` | `CierresBodegaAdminRepository.findCierreBodegaConDetalle` — `lib/repositories/CierresBodegaAdminRepository.ts:355-363` con **los mismos** `GESTION_ADMIN_SELECT` + `DETALLE_ADMIN_SELECT` (importados en `:29-35`) |
| Mapper fila | `toPendienteRowDesdeSnapshot` — `CierresAdminRepository.ts:1345` | **el mismo** `toPendienteRowDesdeSnapshot` — `CierresBodegaAdminRepository.ts:374` |
| Campos que la fila desplegada necesita | `GESTION_ADMIN_SELECT` lee `evidenciaStoragePath` (`CierresAdminRepository.ts:275`), `pagos` (`:285`), `pagoMensajero`, `ingresoBodegaRechazo`, `causaIncidente`, `indemnizacion` (`:276-279`) y `historialEstados` para `esRechazoSla`/`desdeAyudaTienda` (`:301-305`); `DETALLE_ADMIN_SELECT` trae dirección, ubicación, tienda y la tarifa congelada (`:204-242`); el mapper arma `ingresoOrdenex` (`:477`) | idénticos (misma proyección, mismo mapper) |
| Firma de evidencias | `CierresAdminService` firma en lote (`lib/services/CierresAdminService.ts:763-774`) | `CierresBodegaAdminService.verCierreBodegaDetalle` firma en lote las evidencias de **todas** las gestiones de **todos** los `cierre_dia`, sin filtrar por resultado (`lib/services/CierresBodegaAdminService.ts:277-285`) |
| DTO | `toDetalleDTO` (`lib/services/CierreDiaService.ts:983-1043`; `evidenciaUrl` en `:1016`, `ingresoOrdenex` en `:1041`) | **el mismo** `toDetalleDTO` (`CierresBodegaAdminService.ts:298`), agrupado en `CierreGrupos` con las cinco claves (`:290-296`) |

Conclusión de datos: cada `cierres[i].grupos[resultado][j]` del detalle de bodega es un
`CierreDetalleGestion` con `evidenciaUrl` firmada (para cualquier resultado) e `ingresoOrdenex`,
exactamente como el `grupos` del detalle de mensajero. **No hace falta tocar repositorio, servicio,
acción ni tipos.** Sin migración.

### 1.2 La pantalla es distinta

- Detalle de mensajero: `CierresAdminModule.tsx:1254` monta `CierreFacturaDetalle`
  (`cierre-factura.tsx:2282`), cuyas gestiones van en pestañas (`:2523-2575`) y cada una en
  `FilaGestion` (`cierre-factura.tsx:1609-1891`). `FilaGestion` ofrece «Ver evidencia» para
  **cualquier** resultado con `evidenciaUrl` (`:1834-1845`) y monta `DesgloseIngresoOrdenex`
  (`:1882-1886`), que es quien pinta «Desglose de ingreso» y «Cobros de esta gestión»
  (`cierre-detalle-shared.tsx:1072`, `:1156`).
- Detalle de bodega: `CierresBodegaAdminModule.tsx:824-828` monta `DetalleSecciones`
  (`cierre-detalle-shared.tsx:1598-1697`): una `DataTable` ancha por resultado. La columna de
  evidencia (`COLUMNA_EVIDENCIA`, `:1327-1345`) **solo** está en Incidente (`:1410`) y en
  Devolución por rechazo (`:1501`); Entregado (`:1414-1435`), Reprogramado (`:1436-1458`) y
  Novedad (`:1459-1485`) no la tienen. **La URL firmada de una entrega llega al navegador y
  ninguna celda la pinta.** El resto de datos sí está en columnas, pero en una tabla de siete
  columnas comunes con anchos mínimos de 250 + 120 + 200 + 300 px (`:1359-1380`) dentro de un modal
  al 75 % con scroll: lo económico queda fuera de la vista sin desplazar en horizontal (a confirmar
  en T0.1 con captura).
- El visor de evidencia ya está montado en el módulo de bodega (`CierresBodegaAdminModule.tsx:886`),
  con su estado `evidencia` (`:387`).
- `FilaGestion` **no está exportada** (`cierre-factura.tsx:1609`, `function` sin `export`): hoy
  no se puede reusar desde otro archivo.

### 1.3 Lo que hay que medir y no se pudo medir desde el spec (T0)

- **T0.1** — Captura con Playwright del detalle de bodega actual (maestro), para fijar el «antes»
  que vio el humano: qué columnas quedan a la vista sin scroll y que Entregado no tiene evidencia.
- **T0.2** — En la base local (y, en solo lectura, en producción vía MCP `supabase` confirmando el
  ref con `get_project_url`): cuántas gestiones de `cierre_dia` con `cierre_bodega_id IS NOT NULL`
  tienen `evidencia_storage_path IS NOT NULL`, por `resultado`. Si en entregas es 0, R10 sigue
  siendo correcto pero el recorrido de T6 no podrá enseñar el botón en una entrega sin crear el dato.

## 2. Decisión: extraer la lista de gestiones del comprobante y montarla en la bodega

### 2.1 Pieza nueva (extracción, no reescritura)

En `app/(app)/cierres-admin/_components/cierre-factura.tsx`:

- Extraer el bloque «Órdenes en pestañas por resultado» de `CierreFacturaDetalle`
  (`:2312-2316` estado de la pestaña + `:2523-2575` render) a un componente **exportado**
  `GestionesPorResultado`. `CierreFacturaDetalle` pasa a montarlo con las mismas props que hoy
  usa por dentro: el render del comprobante de mensajero queda carácter a carácter igual (R18).
- `FilaGestion` sigue sin exportarse: su único consumidor es `GestionesPorResultado`.

Contrato (TypeScript, solo presentación):

```ts
export interface GestionesPorResultadoProps {
  grupos: CierreGrupos;
  /** Vista del mensajero: las dos cifras de la fila son lo RECIBIDO y SU pago. */
  esMensajero?: boolean;
  onVerEvidencia?: (url: string) => void;
  /** Ausente = no se ofrece (R14). */
  onCorregirPagos?: (g: CierreDetalleGestion) => void;
  /** Ausente = no se ofrece (R14). */
  onCorregirResultado?: (g: CierreDetalleGestion) => void;
  /**
   * De quién son estas gestiones. Ausente = el nombre accesible de hoy
   * (`FACTURA_ORDENES_TITULO`), que es el del comprobante de mensajero (R18).
   * Presente = `${FACTURA_ORDENES_TITULO} · ${contexto}` (R17).
   */
  contexto?: string;
}
```

- El estado de la pestaña vive DENTRO de `GestionesPorResultado` (un `useState` por instancia):
  eso da R4 (cada mensajero, su pestaña) sin estado nuevo en el módulo.
- Pestaña inicial: la misma expresión que hoy (`ORDEN_RESULTADOS.find(...) ?? "entregado"`) — R2.
- La región interna conserva `aria-label={RESULTADO_LABEL[tab]}` (los tests y el E2E del
  comprobante la usan). En la bodega habrá N regiones «Entregadas»; las distingue la región
  exterior con `contexto` (R17). Si un test de la bodega necesita la interna, la busca `within` de
  la exterior.

### 2.2 Montaje en el detalle de bodega

En `CierresBodegaAdminModule.tsx`, dentro del bloque de cada mensajero (`:761-829`), sustituir
`<DetalleSecciones … />` (`:824-828`) por:

```tsx
<GestionesPorResultado
  grupos={cierreDia.grupos}
  onVerEvidencia={setEvidencia}
  contexto={cierreDia.mensajeroNombre}
/>
```

- **Sin** `onCorregirPagos` ni `onCorregirResultado` (R14, P1). Como la fila ya decide los
  botones por la presencia del callback (`cierre-factura.tsx:1849`, `:1866`), no hace falta ningún
  `if` de rol ni de estado en la bodega.
- **Sin** `esMensajero` (vista de admin: cobrado / ingreso total, marca automático/manual) — R5, R7.
- `onVerEvidencia={setEvidencia}` reutiliza el visor ya montado (`:886`) — R12.
- El resto del bloque (cabecera, `TotalesPanel`, las dos `CascadaDinero`, `DesglosePorTienda`,
  `TotalesIngresoPanel`) no se toca.
- El import de `DetalleSecciones` desaparece del módulo; el de `VisorEvidencia` se queda.

### 2.3 P2 — datos que la tabla tenía y la fila no (valor por defecto: añadirlos)

En `FilaGestion`, tres `DatoFila` más, que por construcción no pintan nada si el valor es nulo
(`DatoFila`, `cierre-factura.tsx:1588-1601`):

- Causa del incidente: `CAUSA_INCIDENTE_LABEL[g.causaIncidente]` (la etiqueta del SEED, nunca el
  slug; la misma fuente que `COLUMNA_CAUSA_INCIDENTE`, `cierre-detalle-shared.tsx:1298-1302`).
- Indemnización: en `incidente`, `money(g.indemnizacion)` o, si es `null`, el marcador con
  `INDEMNIZACION_PENDIENTE_NOTA` (misma lectura que `COLUMNA_INDEMNIZACION`, `:1309-1320`).
- Fulfillment: `money(g.ingresoOrdenex?.tarifa?.fulfillment)` solo si no es nulo.

Esto también aparece en el comprobante de mensajero (la fila es una). Es aditivo: R18 lo admite
como única salvedad. En la vista `esMensajero` la indemnización y el fulfillment NO se pintan (son
datos de la empresa; la vista del mensajero no los recibe hoy: `indemnizacion` es siempre `null` en
su repo, `CierreDiaService.ts:1033-1038`, e `ingresoOrdenex` no viene). Si el humano elige la
alternativa de P2 (paridad estricta), esta sección y R19 se retiran y nada más cambia.

### 2.4 Dinero

Ninguna aritmética nueva: la fila formatea con `money()` strings que llegan del servidor. No se
toca ninguna fórmula ni snapshot. No hay nombres de dinero nuevos en `lib/`; el `--rapido` no
debería ampliarse a `tests/integration/db` (si el gate lo hace por algún nombre, se corre: no se
discute).

## 3. Modelo de datos, rutas, contratos, integraciones

- **Tablas / RLS / migraciones:** ninguna. Se lee lo que ya se lee.
- **Rutas:** ninguna nueva. `/cierres-admin` ya monta el módulo.
- **Server Actions:** ninguna nueva ni modificada. `verCierreBodegaDetalle`
  (`lib/actions/cierre-bodega.ts:372-384`) y su contrato `CierreBodegaDetalleServiceResult` quedan
  igual.
- **Permisos:** `verCierreBodegaDetalle` ya corta con `esAccesoTotal` antes de leer
  (`CierresBodegaAdminService.ts:272`) — R16 es un requisito de no-regresión. No se añade ni se
  quita ninguna acción de decisión: la bodega ya no monta «Aprobar/Rechazar» desde la ficha 431
  (`CierresBodegaAdminModule.tsx:501-519`) y el bloque de cada mensajero nunca tuvo esas acciones
  (R15). `CierresAdminService` y su alcance NO se tocan (fuera de alcance).
- **Integraciones:** Storage solo vía el `ISignedUrlProvider` ya inyectado; TTL
  `cierreConfig.SIGNED_URL_TTL_SECONDS`, sin cambio.

## 4. Guardias y tests existentes que el cambio roza

| Archivo | Por qué | Esperado |
| --- | --- | --- |
| `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` | vigila props de cada `<CierreFacturaDetalle>` en `app/**` | verde: no se monta un `CierreFacturaDetalle` nuevo |
| `tests/unit/guards/pagos-captura.guardia.test.ts:281-282` | anclas `montoPorMetodo` (shared) y `desglosePantalla` (factura) | verde: las dos siguen |
| `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts` | vocabulario del módulo de bodega | correr; si un rótulo de la fila choca, se decide en review, no se edita la guardia a ciegas |
| `tests/unit/descarga/censo-tablas.ts:278`, `contadores-cabecera.guardia.test.ts:90` | censan la `DataTable` de `cierre-detalle-shared.tsx` | verde mientras `DetalleSecciones` siga en el archivo (P4 = no borrar) |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | contraste del papel del comprobante | correr: la fila no cambia de clases |
| `tests/components/CierresAdminModule.test.tsx`, `CierreDiaModule.test.tsx`, `CierreFacturaSinGestionar.test.tsx`, `CierreRechazosDeTienda.test.tsx`, `CierreDetalleIncidente.test.tsx` | consumidores del comprobante | verde sin editar (R18) |
| `tests/components/CierreBodegaDetalleCascadas.test.tsx`, `CierreBodegaDesglosePorTienda.test.tsx`, `descarga/CierresBodegaDescargaDetallada.test.tsx`, `descarga/CierresDescarga*.test.tsx` | montan `CierresBodegaAdminModule` | verde; si alguno buscaba la descarga por sección del modal (P3), se actualiza **con la decisión P3 citada** |

## 5. Alternativas descartadas

1. **Montar `CierreFacturaDetalle` entero por cada `cierre_dia` dentro del modal de bodega.**
   Daría la paridad «gratis», pero arrastra cabecera, tarjetas, KPIs, renglones y liquidación que
   el bloque de bodega ya enseña con sus cascadas (ficha 393) — dos lecturas del mismo dinero en
   la misma pantalla —, y la guardia `cierre-detalle-superficies` exigiría `ordenesSinGestion`,
   `sinGestionRegistrado` y `rechazosDeTienda`, que el contrato de bodega no trae: habría que
   ampliar repo y servicio para algo que nadie pidió. Descartada por rediseño y por ensanchar el
   contrato.
2. **Quedarse con `DetalleSecciones` y añadir `COLUMNA_EVIDENCIA` a Entregado/Reprogramado/Novedad.**
   Es el arreglo más pequeño para la evidencia, pero no da lo pedido («la misma información que se
   ve en un cierre de mensajero», con la fila desplegable): la información económica seguiría fuera
   de la vista en una tabla de >1.500 px de ancho mínimo, y las dos pantallas seguirían pintando la
   misma gestión de dos formas distintas. Descartada: arregla el síntoma de la captura a medias.
3. **Exportar `FilaGestion` y que el módulo de bodega arme sus propias pestañas.** Duplicaría el
   `tablist`, el texto de vacío, la cabecera de columnas (`FILA_GRID_COLS`, cuya razón de ser es que
   cabecera y fila no se desalineen) y la elección de pestaña inicial: dos copias que divergen.
   Descartada a favor de extraer el bloque entero (§2.1).
4. **Traer los datos por otra lectura (nuevo endpoint o acción «gestiones del cierre de bodega»).**
   Innecesario: §1.1 demuestra que el dato ya viaja completo en `verCierreBodegaDetalle`.

## 6. Riesgos

- **Nombres accesibles repetidos.** N bloques con pestañas «Entregadas» en el mismo modal. Mitigado
  por R17 (región exterior con el mensajero). Los tests de la bodega deben usar `within`.
- **Regresión del comprobante de mensajero por la extracción.** Mitigado por R18: la suite de
  `CierresAdminModule`/`CierreDiaModule` debe pasar SIN editar ni una aserción. Si alguna hay que
  editar, la extracción no fue pura y se para.
- **P3 retira una descarga.** Si el humano no lo acepta, el diseño cambia (control de descarga por
  bloque) — por eso es decisión explícita.
- **Zona.** La ficha está en `fullstack`, pero el diseño no toca backend salvo un test unitario de
  caracterización (R13). El leader puede secuenciarla como frontend; el test de R13 lo puede
  escribir el mismo `frontend_dev` o un `backend_dev` breve antes.
- **`/design`.** No es una pantalla nueva: reutiliza un componente ya diseñado. No se pasa por
  `/design` salvo que el humano lo pida.
