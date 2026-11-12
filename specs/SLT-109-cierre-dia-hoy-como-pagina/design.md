# SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» — design

> Zona frontend. Sin esquema, sin migraciones, sin RLS nueva, sin Server Actions nuevas ni
> cambiadas, sin dependencias nuevas. Todo dato llega ya del servidor por acciones que existen.

## Lo que ya existe

Buscado en el worktree (sin índice del grafo para este worktree: `index_status` no lo encuentra; se
exploró con Grep/Read).

| Pieza | Dónde | Estado |
|---|---|---|
| `DetalleCierre` con `marco: "pagina"`, modos `en curso`/`rechazado`/`vencido`, slot `corregir` | `components/private/cierres/detalle/DetalleCierre.tsx` | Hecho en S1 (SLT-95). Nadie lo monta aún en marco página. |
| Pestañas, franja y pie del mensajero por modo (`pestanasDe`, `avisosDelMensajero`, `accionesDeLaTabla`, `pieTextoDe`) | `detalle-cierre-vista.ts` | Hecho en S1. La franja de bloqueo solo sale en `vencido` (R246 la extiende). |
| Textos «Sin solicitar», «Solicitud nueva», «Hoy · sin solicitar», «Antes de cerrar:», «Tu cierre está bloqueado:», pies del mensajero | `detalle-cierre-labels.ts` | Hechos. |
| `vistaMensajeroDesdeCierreDia(cierre, detalle)` | `detalle-cierre-vista.ts:759` | Hecho en SLT-108 para un cierre pasado. Sirve tal cual para el rechazado y el vencido. |
| «Devolver a gestión» en la fila única (`acciones.devolver`, solo audiencia mensajero) | `FilaGestion.tsx:196`, `fila-gestion-vista.ts:533` | Hecho en S3. **Le falta** el deshabilitado de la ficha 237 (tienda) y el «en vuelo». |
| `GestionesCierre` con filtros por resultado (`BuscadorFiltros` + `FilterComponent`) y slot `descargar` | `components/private/cierres/fila/GestionesCierre.tsx` | Hecho en S3. |
| Columnas de descarga del mensajero (R152) | `detalle-cierre-descarga-columnas.ts` | Hecho en SLT-108. |
| `verCierrePasado({ cierreId })` → `cierre` + `grupos` + `ordenesSinGestion` + `rechazosDeTienda` | `lib/actions/cierre-dia.ts:218` | Existe. El `WHERE` es `id` + `mensajeroId`, **sin filtro de estado**: lee también un vencido o un rechazado. |
| `bloqueo.aReenviarPrimero` (`cierreId`, `estado`) y `correcciones[]` | `page.tsx`, `listarCierreDia` | Existen. |
| `/cierre-dia` en curso, rechazado o vencido **como página** | — | **No existe.** Hoy son paneles sueltos en `CierreDiaModule.tsx:731-1037`. |

No hay nada que duplique esta ficha: se especifica.

## Modelo de datos

Ninguno nuevo. Ni tablas, ni columnas, ni `organizacion_id`, ni RLS, ni migraciones (R72). La
autorización no cambia: `page.tsx` hace `notFound()` a quien no es mensajero, y `verCierrePasado`,
`deshacerGestion` y `solicitarCierre` acotan por `actor.usuarioId` en el servidor. Ningún módulo
nuevo que encender. Datos del país: los importes llegan como string y se pintan con `money()`
(moneda de la empresa); las fechas con los formateadores de la zona que ya usa el detalle.

## Flujo de datos

```
page.tsx (Server Component)
  ├─ listarCierreDia()            → grupos, totales, totalPagoMensajero, puedesSolicitar,
  │                                 motivoBloqueo, correcciones
  ├─ listarCierresPasadosPaginado → cola (SLT-137)
  ├─ estadoBloqueoMensajero()     → bloqueo (aReenviarPrimero)
  └─ SI bloqueo.aReenviarPrimero: verCierrePasado({ cierreId })   ← NUEVO aquí, acción existente
        → reenviable: { estado: "ok", cierre, grupos, ordenesSinGestion, sinGestionRegistrado,
                        rechazosDeTienda } | { estado: "error" }
CierreDiaModule (cliente)
  ├─ cierreDeLaPagina(props) → { modo: "en curso" | "rechazado" | "vencido" | "error", … }  (puro)
  ├─ <DetalleCierre marco="pagina" …/>      (o el aviso de R253)
  ├─ cola «Cierres solicitados»             (SLT-137, sin tocar salvo el «Ver» de un rechazado)
  └─ Modales de hoy: solicitar, vencido, rechazado, deshacer; visor de evidencia
```

La lectura del reenviable se hace **en el servidor de la página**, no con un `useEffect`: la página
llega pintada, sin un estado de carga entre el render y el detalle, y `router.refresh()` (tras
deshacer o reenviar) la relee por el mismo camino. Solo ocurre si el mensajero está por reenviar,
que es el caso raro.

## Contratos

### `page.tsx` → `CierreDiaModule`

```ts
// Prop nueva, opcional para no romper los dobles de los tests de hoy.
reenviable?:
  | { estado: "ok"; cierre: CierrePasadoDTO; grupos: CierreGrupos;
      ordenesSinGestion: CierreOrdenSinGestion[]; sinGestionRegistrado: boolean;
      rechazosDeTienda: CierreRechazoDeTienda[] }
  | { estado: "error"; reenviableEstado: "vencido" | "rechazado" };
```

`no_encontrada`, `forbidden` o una excepción → `{ estado: "error" }` (R253). La página no hace
`notFound()` por esto: el mensajero tiene que poder reenviar.

### Elección del cierre (puro, en `detalle-cierre-vista.ts`, junto a los otros adaptadores)

```ts
type CierreDeLaPagina =
  | { modo: "en curso"; detalle: DetalleMensajeroVista }
  | { modo: "rechazado" | "vencido"; detalle: DetalleMensajeroVista; cierreId: string }
  | { modo: "error"; reenviableEstado: "vencido" | "rechazado" };

function cierreDeLaPagina(input: {
  grupos; totales; totalPagoMensajero; motivoBloqueo; puedesSolicitar; bloqueo; reenviable?;
}): CierreDeLaPagina;
```

- Con `bloqueo.aReenviarPrimero` y `reenviable.estado === "ok"`: `vistaMensajeroDesdeCierreDia`
  (la de SLT-108) + `bloqueo`; modo = `cierre.estado`.
- Sin reenviable: `vistaMensajeroEnCurso` (nueva, en `detalle-cierre-vista.ts`):
  `estado: null`, `folio: null`, `destino: ""` (PA2), `solicitadoAt: null`, `empresa: null`,
  `totales`, `totalPagoMensajero`, `motivoBloqueo: puedesSolicitar ? null : motivoBloqueo`,
  `bloqueo`, y los conteos contados de `grupos` (enteros, nunca dinero; R71). `rechazosDeTienda: 0`
  (PA3).

### Cambios en el detalle único

| Pieza | Cambio | Por qué |
|---|---|---|
| `avisosDelMensajero` | Con `d.bloqueo?.bloqueado`, añade la franja «Tu cierre está bloqueado:» en **cualquier** modo (hoy solo en `vencido`); en `rechazado` va detrás del motivo; en `en curso`, antes de «Antes de cerrar:». | R4 del madre («vencido o bloqueado») y R246. |
| `accionesDeLaTabla` (mensajero, `rechazado`) | `[solicitarRechazado, cerrar]`, filtrado por `disponibles` como siempre. | R252: el modal sin envío ofrece «Cerrar». En la página no hay `onCerrar`, así que no aparece. |
| `pieTextoDe` (mensajero, `rechazado`, sin `solicitarRechazado`) | Línea «Lo envías desde esta página cuando sea el siguiente por enviar.» | R252. Texto **propuesto**: no está en el canvas. |
| `DetalleCierreProps` | `deshabilitadas?: Partial<Record<AccionId, string>>`: el botón sale `disabled` con el string como `title` y `aria-describedby` a un `<span class="sr-only">`. | R245: hoy «Solicitar cierre» sale deshabilitado con su motivo, y el canvas lo pinta. |
| Cabecera (`Cuerpo`) | Une `sub · folio · fechas` sin las partes vacías. | R241: sin destino no debe quedar « · Solicitud nueva». |
| Marco página | `section` con `h-[calc(100dvh-<alto de la cabecera de AppPage>)]` y `min-h-[28rem]`; dentro, la rejilla de siempre (un solo scroll en el `tabpanel`). | R254: el pie se ve en un teléfono sin desplazar la página; la cola sigue debajo, en el scroll de la página. |

### Fila única

`AccionesFila.devolver` sigue igual. `accionesDe` devuelve, además del booleano, el motivo:

```ts
devolver: boolean;
devolverDeshabilitado: string | null; // DESHACER_BLOQUEO_TIENDA si g.desdeAyudaTienda (R244)
```

`FilaGestion` recibe `enVuelo?: string | null` (el `gestionId` en vuelo; lo pasa `GestionesCierre`).
El texto de la tienda **se muda** de `CierreDiaModule.tsx` a `fila-gestion-labels.ts` sin cambiar un
carácter: sigue siendo la mitad cliente de `MSG_GESTION_DE_LA_TIENDA` (el comentario de la 237 viaja
con él).

### Pestaña «Corregir» — `CorregirCierre.tsx` (nuevo, `components/private/cierres/detalle/`)

```ts
function CorregirCierre(props: { ordenesEnCorreccion: readonly OrdenEnCorreccionDTO[] }): JSX.Element;
```

Solo pinta: «Cómo corregir» + `CORRECCION_EXPLICACION` + `CORRECCION_AVISO_CORTE`, y «Órdenes por
volver a gestionar» si hay alguna (R248), con «Ir a Entregas» por fila pendiente (canvas). Los textos
`CORRECCION_*` se mudan de `CierreDiaModule.tsx` a `detalle-cierre-labels.ts` sin cambiar. El
deshacer **no** vive aquí: va en la fila de «Gestiones» (canvas: `devolver: mens && (enCurso ||
rechazado)`), así que la lista de «Gestiones del cierre» del panel de hoy desaparece.

`OrdenEnCorreccionDTO` no trae la tienda: la columna «Tienda» del canvas no se pinta (dato que no
llega; no es un requisito, D18 dice que los datos del canvas son de muestra).

### Montaje en `CierreDiaModule`

| Modo | `pestanas` | `acciones` | Otros |
|---|---|---|---|
| en curso | `gestiones`: `GestionesCierre` (audiencia mensajero, `acciones.devolver`, `congeladoAt: null`, descarga «Gestiones del cierre de hoy»); `rechazos`: `RechazosDeTiendaCierre rechazos={[]}` | `solicitar` | `deshabilitadas.solicitar = motivoBloqueo` si `!puedesSolicitar` |
| rechazado | `corregir`: `CorregirCierre` con `correcciones.find(cierreId)`; `gestiones`: `GestionesCierre` con `devolver` + `SeccionSinGestion`; `rechazos` | `solicitarRechazado` | — |
| vencido | `gestiones`: `GestionesCierre` sin `devolver` + `SeccionSinGestion`; `rechazos` | `solicitarVencido` | — |
| error | — (aviso de R253 + botón de reenvío) | — | — |

Los cuatro modales (`Modal` existente) y sus textos **no cambian**; los abren los callbacks del pie.
El modal de un cierre pasado (SLT-108) sigue igual salvo para un cierre `rechazado`: `abrirDetalle`
lo abre con `modo="rechazado"`, `pestanas.corregir` y `acciones={}` + `onCerrar` (R252). Tras un
deshacer `ok` dentro de ese modal, `confirmarDeshacer` vuelve a llamar a `abrirDetalle(cierre)`
además de `refrescarListas()`.

Se borra de `CierreDiaModule.tsx` lo que deja de usarse (lint lo exige): `TotalItem`,
`COLUMNAS_COMUNES`, `columnasPara`, `columnaEvidencia`, `botonDeshacer`, `PanelCorreccion`,
`DESCARGA_POR_RESULTADO`, `ORDEN_RESULTADOS`, `ubicacion`, `VENCIDO_AVISO`, `RECHAZADO_AVISO` y sus
imports. `cierre-dia-descarga-columnas.ts` **no se borra** (lo usa la cola; sus columnas por
resultado las retira SLT-115, D13): si una guardia exige que cada export tenga un consumidor, T0.3
lo detecta y se anota.

## Descarga

Un `DescargarDatasetButton` dentro de `GestionesCierre` (slot `descargar`), con
`COLUMNAS_DESCARGA_DETALLE_MENSAJERO` y `filaDescargaDetalleMensajero` sobre `filasLocales(…)`, como
en SLT-108. Sin ámbito nuevo de columnas. Título: `tituloDescargaGestiones(folio)` en un cierre con
folio y «Gestiones del cierre de hoy» en curso (texto nuevo en `detalle-cierre-labels.ts`). Las cinco
descargas por resultado desaparecen (PA4): sale de `censo-tablas.ts` y de las guardias de descarga
la entrada «secciones del cierre del día»; la de «Cierres solicitados» sigue.

## Alternativas descartadas

1. **Leer el cierre por reenviar en el cliente** (`useEffect` + `verCierrePasado` al montar, como el
   «Ver» de un pasado). Descartada: la página nacería con un hueco o un esqueleto donde va lo único
   que el mensajero tiene que hacer, habría un estado más (cargando) que probar, y tras
   `router.refresh()` el detalle quedaría desfasado hasta la segunda lectura. En el servidor de la
   página es una lectura más, solo en el caso raro, y se relee sola con el refresh.
2. **Seguir el orden literal de la PA2 del madre** (vencido primero aunque haya un rechazado más
   viejo). Descartada: `solicitarCierre()` no recibe el id y el servidor reenvía el más viejo; el
   botón enviaría un cierre distinto del pintado (PA1).
3. **Ocultar «Solicitar cierre» cuando no se puede** en vez de deshabilitarlo (sin tocar
   `DetalleCierre`). Descartada: el canvas lo pinta, hoy sale deshabilitado con su motivo y un pie
   vacío deja al mensajero sin saber qué botón le falta.
4. **Un componente de página propio para `/cierre-dia`.** Descartada por D15: el detalle es uno.
5. **Dejar el «Devolver a gestión» dentro de «Corregir»** (como el panel de hoy). Descartada: el
   canvas lo pone en la fila de «Gestiones», igual que en curso; tenerlo en dos sitios del mismo
   detalle es dos botones para la misma acción.

## Dependencias de terceros

Ninguna nueva.

## Riesgos

- **Choque con SLT-137** en `CierreDiaModule.tsx` y sus tests: se parte de `dev` con SLT-137 dentro
  (T0.1). Si SLT-137 aún no está en `dev`, el implementer para y avisa.
- **Guardias que leen `CierreDiaModule.tsx` como texto** (anclas `desglosePantalla`, `InfoEstado`,
  `motivoGestionLegible`, contadores de cabecera, censo de tablas): al irse las secciones, sus
  entradas se mueven o se quitan. T0.2 hace el censo.
- **E2E** que buscan «Totales del día» o «Cierre vencido» (7 archivos): pasan a las cifras y al pie
  del detalle.
