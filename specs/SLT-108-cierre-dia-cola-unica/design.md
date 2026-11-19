# SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» — design (v3, S10a)

> Hereda el diseño del madre (`specs/SLT-95-detalle-cierre-rediseno/design.md`) y el de dos hermanas:
> SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» y SLT-101 «Fila de gestión única
> y lista con filtros». Aquí solo va lo que S10a añade o decide.
>
> Pasan a SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros»:
> - la cola con rol mensajero y sus filtros;
> - el pendiente de pago en el servidor, con su diseño, su prueba de integración y sus mutaciones
>   (`requirements.md > Fuera de alcance`).

## Lo que ya existe

**Términos buscados:**
- «cierre-dia», «Cierres solicitados»;
- «cierre pasado» (`verCierrePasado`, `CierrePasadoDTO`), «audiencia mensajero»;
- «Ganancia» + «Incidente».

**Dónde:**
- `feature_list.json` y `specs/`;
- el código, con Grep/Read. El índice del grafo no tiene este worktree («project not found»), y no se
  usó el de otro.

**Qué apareció:**

| Qué | Dónde | Uso aquí |
|---|---|---|
| SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» | board (nueva, depende de SLT-108) | Recibe la cola, sus filtros, el censo y el pendiente de pago. |
| SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» | board, `pending` | Sin solape: S10a no toca los paneles del día. |
| `DetalleCierre` con `audiencia` mensajero | `components/private/cierres/detalle/DetalleCierre.tsx` | Se usa tal cual: tres cifras, pestañas «Gestiones» / «Rechazados», pie «Cerrar» y la nota de montos congelados (`PIE_MENSAJERO_LECTURA`). |
| `vistaMensajeroDesdeAdmin` | `detalle-cierre-vista.ts:693` | Patrón del adaptador nuevo. |
| `GestionesCierre` / `FilaGestion` con audiencia mensajero | `components/private/cierres/fila/` | Se usan tal cual, con la API de evidencia que dejó SLT-103 «Diálogos del módulo de cierres y trato tú». |
| `SeccionSinGestion`, `RechazosDeTiendaCierre` | `cierre-factura.tsx`, `detalle/` | Se montan como en `CierresAdminModule.tsx:1367-1374`. |
| `filaDescargaDetalleCierre`, `COLUMNAS_DESCARGA_DETALLE_CIERRE` | `detalle-cierre-descarga-columnas.ts` | Se añade la variante del mensajero. |
| `GANANCIA_COL`, `columnaPago` | `cierre-dia-descarga-columnas.ts`, `CierreDiaModule.tsx` | «Ganancia» de Incidente es la misma columna de las otras secciones. |

No hay ficha ni código que ya haga lo de S10a: se reutiliza lo de arriba.

## Zona y capas

**Frontend** (`frontend_dev`). Solo se toca `app/(app)/cierre-dia/_components/` y
`components/private/cierres/detalle/`. Todo el dato ya llega:
- `CierrePasadoDTO` y `verCierrePasado` (grupos, órdenes sin gestión con su marca y rechazos de
  tienda);
- `CierreDetalleGestion.pagoMensajero`.

Sin cambios en `lib/`, `db/` ni Server Actions.

## Detalle de un cierre pasado (R59, R150-R154, R161)

### Adaptador puro — `detalle-cierre-vista.ts`

```ts
export function vistaMensajeroDesdeCierreDia(
  c: CierrePasadoDTO,
  d: { grupos: CierreGrupos; ordenesSinGestion: CierreOrdenSinGestion[]; rechazosDeTienda: CierreRechazoDeTienda[] },
): DetalleMensajeroVista
```

| Campo | Valor |
|---|---|
| `mensajeroNombre` | `""` (con audiencia mensajero el título es `TU_CIERRE_TITULO`) |
| `destino` | `destinoLegible(c.destinoTipo, "")` → solo el tipo, como la tira de hoy (el DTO no trae el nombre de la zona) |
| `folio`, `estado`, `solicitadoAt`, `resueltoAt`, `motivoRechazo` | del DTO (`?? null`) |
| `totales`, `totalPagoMensajero` | del DTO (snapshot congelado) |
| `empresa` | `null` (R9, R150) |
| `reprogramadasRetenidasHoy` | `0` (dato de la cola del admin) |
| `conteos.gestiones`, `entregadas`, `noEntregadas`, `paquetesVuelven` | de los grupos, igual que `vistaMensajeroDesdeAdmin` |
| `conteos.rechazosDeTienda` | `d.rechazosDeTienda.length` |
| `conteos.pagosAjustados`, `incidentesSinIndemnizar`, `tiendas` | `0`. Al mensajero no le llegan ajustes (SLT-56 Q2) ni indemnización (feature 158). «Tiendas» solo lo usa una cifra de la empresa. |

### Montaje en `CierreDiaModule.tsx`

```tsx
<DetalleCierre tipo="mensajero" audiencia="mensajero" modo="solo lectura" marco="modal"
  detalle={vistaMensajeroDesdeCierreDia(cierreAbierto, detallePasado)}
  onCerrar={() => setCierreAbierto(null)} acciones={{}}
  pestanas={{
    gestiones: <div className="flex flex-col gap-4">
      <GestionesCierre gestiones={gestionesEnOrden(detallePasado.grupos).map((gestion) => ({ gestion }))}
        audiencia="mensajero" quienMiraEsCentral={false} congeladoAt={cierreAbierto.solicitadoAt}
        acciones={{}} onVerEvidencia={/* el visor de /cierre-dia, con la API que dejó SLT-103 */}
        descargar={<DescargarDatasetButton titulo={…} columnas={COLUMNAS_DESCARGA_DETALLE_MENSAJERO}
          obtenerFilas={async () => ({ status: "ok", filas: …map(filaDescargaDetalleMensajero) })} />} />
      <SeccionSinGestion ordenes={detallePasado.ordenesSinGestion} registrado={detallePasado.sinGestionRegistrado} />
    </div>,
    rechazos: <RechazosDeTiendaCierre rechazos={detallePasado.rechazosDeTienda} />,
  }} />
```

- **Cuándo se abre.** Solo con la lectura hecha (`detallePasado !== null`). Mientras carga, el «Ver»
  de esa tarjeta queda deshabilitado (`aria-busy`); no hay un modal vacío.
- **Errores (R153).** Los dos casos van por `toast.error` con los textos de hoy, igual que
  `CierresAdminModule.abrirDetalle` (`:747-756`). `detalleError` desaparece.
- **El `Modal` de hoy** («Detalle del cierre» + `CierreFacturaDetalle`) se borra entero.
- **La tira «Cierres solicitados» no se toca.** `ListaComprobantes` + `CierreFacturaResumenPropio`
  siguen llamando a `abrirDetalle(c)`.
- **Un cierre `rechazado` abierto desde la tira.** Se abre en solo lectura (R59), y en ese modo la
  franja del detalle no pinta el motivo: `avisosDelMensajero` solo lo pinta en modo «rechazado», que
  es SLT-109. El motivo sigue a la vista en dos sitios, así que no se pierde:
  - la tarjeta-comprobante de la tira;
  - el panel de corrección del día.

### Descarga del detalle (R152) — `detalle-cierre-descarga-columnas.ts`

```ts
export const COLUMNAS_DESCARGA_DETALLE_MENSAJERO: DescargaColumna[] = [
  numGuia «Nº Guía», destinatario «Destinatario», tienda «Tienda», resultado RESULTADO_COL,
  recibido RECIBIDO_LABEL, ganancia GANANCIA_COL («Ganancia»), senales COL_SENALES,
];
export function filaDescargaDetalleMensajero(g: CierreDetalleGestion): DescargaFila
// numGuia, destinatario, tienda, resultado, recibido como filaDescargaDetalleCierre;
// ganancia: g.pagoMensajero; senales: textoSenales(g, "mensajero") || null. Sin cobroTienda.
```

## «Ganancia» en «Incidente» (R58, R162)

- **Pantalla** (`columnasPorResultado`, rama `incidente`). `columnaPago` va entre
  `columnaEvidencia(verEvidencia)` y `columnaAcciones`, el mismo sitio que en «rechazada». Mismo
  rótulo («Ganancia») y mismo «—» para `null`.
- **Descarga.**
  - `COLUMNAS_DESCARGA_DIA_INCIDENTES` añade `{ clave: "ganancia", encabezado: GANANCIA_COL }` al
    final.
  - `filaDescargaDiaIncidente` añade `ganancia: gestion.pagoMensajero`.
- **La indemnización** sigue sin viajar: la consulta no la selecciona.
- **Comentarios.** Se reescriben los de la feature 158 que dicen «un incidente no se paga» (D8).

## Autorización y multi-empresa

Sin cambios:
- `/cierre-dia/page.tsx` sigue siendo solo del rol mensajero.
- `verCierrePasado` acota por `mensajero_id` (= `actor.usuarioId`) en el `WHERE`.
- El módulo de cierres sigue colgando de `nucleo`.

## Modelo de datos, RLS y migraciones

Ninguno.

## Datos que dependen del país

- **Moneda:** `money()`.
- **Fechas:** `fechaCalendarioCR` / `fechaHora`, en la zona de la empresa.
- **Métodos de pago:** `METODO_LABEL` en `CifrasCierre`.
- **Impuestos:** no hay ninguno a la vista del mensajero.

## Tests y guardias que cambian

Censo con Grep sobre `tests/` y `e2e/`. T0.2 lo repite tras actualizar desde `dev`.

| Archivo | Por qué |
|---|---|
| `tests/components/CierreDiaModule.test.tsx` | «el histórico ofrece 'Ver' y abre el comprobante…» y «si el cierre ya no está disponible…» pasan al detalle único y al toast. Los dos casos de la tira no cambian. |
| `tests/components/CierreDiaModuleIncidente.test.tsx` | «la tabla de incidentes NO tiene columna de ganancia ni de ningún monto» se invierte (R58). Se conserva el negativo de la indemnización. |
| `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts` | Incidentes con «Ganancia» al final. |
| `tests/components/CierreDiaComprobanteMarcasDeOrigen.test.tsx` | La mitad «cierre pasado» abre el detalle único. Por S3-PA6, la fila ya no lleva la marca «La tienda». La mitad en vivo no cambia. |
| `tests/components/CierreEvidenciasVarias486.test.tsx` | El caso del mensajero abre la evidencia desde el detalle único (R154). |
| `tests/unit/utils/detalle-cierre-vista.test.ts` | `vistaMensajeroDesdeCierreDia`. |
| `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` | Columnas del mensajero. |
| `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` | `CierreFacturaDetalle` se queda sin montajes en `app/`: el primer `describe` pasa a afirmar cero usos, con la autocomprobación sobre `tsxDeApp`. `SUPERFICIES_DETALLE_UNICO` gana `CierreDiaModule.tsx`. |
| `tests/unit/guards/impresion-flujo.guardia.test.ts` | Caso gemelo del de SLT-100 para `MODULO_MENSAJERO`: sin `CierreFacturaDetalle` ni `HojaFactura`, con `DetalleCierre`. |
| `e2e/cierre-dia.spec.ts` | Caso nuevo: «Ganancia» en Incidente con literal. |
| `e2e/cierres-rediseno.spec.ts` | El mensajero abre su cierre en los escenarios A y B (R77). |

Nuevo: `tests/components/CierreDiaDetalleUnico.test.tsx`.

Van con SLT-137 y no cambian aquí:
- `censo-tablas.ts`;
- `cascada-central-en-las-dos-pantallas.guardia.test.ts`: la tira sigue montando
  `CierreFacturaResumenPropio`;
- `BajoRiesgoPaginacion.test.tsx` y `paginacion-transversal.test.tsx`;
- `cierre-dia-pasados-paginado.test.ts`.

## Verificación de lo que ve el usuario

Literales escritos a mano (memoria «Aserción contra su propia fuente»), sacados de las cabeceras de
los E2E de hoy.

**Escenario A** (`cierres-rediseno.spec.ts`): entregas de 70 000 en efectivo y 30 000 por SINPE, y
un rechazo. Mensajero a 1 500 por entrega.
- «Recaudado» 100.000, con Efectivo 70.000 y SINPE 30.000, sin Transferencia.
- «Gestiones» 3, «Tu ganancia» 3.000, y 1.500 en cada entrega.
- No aparecen ₡3.500, «Le queda a la empresa» ni «Cobro a la tienda».

**Escenario B** (modelo nuevo):
- Recaudado 10.000, «Gestiones» 1, «Tu ganancia» 2.200.
- No aparecen ₡900 ni ₡3.503.

**Incidente** (`cierre-dia.spec.ts`). Ningún spec escribe el `pagoMensajero` de un incidente. T0.3
lo mide una vez en la base desechable y lo escribe a mano, con su derivación.

Antes del PR, E2E en local con base desechable (`docs/perfil-agentes.md`). Después, Preview con
Carlos.

## Alternativas descartadas

1. **Mantener el `Modal` de hoy y meter `DetalleCierre` dentro.**
   - Quedan dos cajas, dos X, dos pies y dos scrolls.
   - `DetalleCierre` con marco modal ya es el diálogo (R11 y R13 del madre).
2. **Cambiar ya la tira por la cola.**
   - Es S10b, y Carlos la separó en SLT-137 por tamaño.
   - Hacerlo aquí rompería el corte acordado.
3. **Traer aquí el pendiente de pago en el servidor.**
   - Nacería sin pantalla, porque la celda «Pago» es de SLT-137 (backend sin pantalla no es
     entrega).
   - Además ponía la ficha en el tope de 1 000 líneas.
   - Carlos lo movió a SLT-137.
4. **Reutilizar `CierreFacturaDetalle` en variante mensajero con estilos nuevos.**
   - Contradice R1 del madre: un solo detalle para todo el módulo.
   - Contradice D12, que quita la hoja imprimible.

## Dependencias de terceros

Ninguna nueva.

## Riesgos

- **Negativos frágiles.** Las ausencias se afirman con valores imposibles por casualidad (₡3.500,
  ₡3.503), nunca con un dígito suelto.
- **API de evidencia de SLT-103.** El cableado se hace contra la que esté en `origin/dev` (T0.1),
  no contra la de antes de #131.
