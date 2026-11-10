# SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — design

> 2026-11-10. Baja a ejecutable el plan S6 del spec madre (`specs/SLT-95-detalle-cierre-rediseno/
> design.md > 1. Detalle del cierre`, `> Props → quién las usa` fila «Detalle · bodega · central ·
> decidir / solo lectura · modal», `> Qué sustituye cada componente` fila «Cuerpo del modal
> "Detalle del cierre de bodega"…»; `tasks.md > Plan de las demás rebanadas > S6`). Hereda de él,
> sin repetirlo, la arquitectura de los cuatro componentes, la autorización y las alternativas
> descartadas del madre. Aquí está solo lo que S6 decide.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «cierre de bodega», «conciliación», «consolidación», «Ver su cierre»,
  «Mensajeros»;
- `specs/`: «Ver su cierre», «Mensajeros (n)», «Conciliación», «Aún nadie», «Falta por recibir»,
  «hrefDetalleCierre», «columnaMensajero»;
- código (Grep/Read; el índice del grafo de este worktree no existe — `index_status` responde
  «project not found» —): `CierresBodegaAdminModule`, `DetalleCierre`, `DetalleBodegaVista`,
  `vistaBodegaDesdeAdmin`, `lineasDinero`, `pestanasDe`, `accionesDe`, `pieTextoDe`, `avisosDe`,
  `GestionesCierre`, `ItemGestion`, `columnasDe`, `senalesDe`, `Cuenta`, `LineaCuenta`,
  `ConciliacionAcciones`, `estadoConciliacionDe`, `ESTADO_CONCILIACION_*`, `hrefDetalleCierre`,
  `verCierreBodegaDetalle`, `CierreBodegaDetalleServiceResult`, `CierreBodegaDetalleCierre`,
  `CierreBodegaResumen`, `verCierreDetalle`, `resolveAlcance`, `findCierreByIdEnAlcance`,
  `alcanceWhere`, `COLUMNAS_DESCARGA_DETALLE_CIERRE`, `pagosAjustados` (cola).

**Resultado:**
- **Board:** ninguna ficha hace esto. Hermanas: SLT-105 «Cola de bodega de la central: Por conciliar y
  Conciliados» (la cola que abre este detalle), SLT-107 «Bodega satélite: Solicitados y su cierre de
  bodega en lectura» (el mismo detalle con audiencia satélite), SLT-114 «Estado de cuenta de la
  satélite: conciliación en pestaña» (enlaza a este detalle). Ninguna lee un cierre del día de la
  satélite desde la central (PA1).
- **Specs que fijaron lo que el modal de bodega pinta hoy y S6 respeta:** 40 (detalle agregado), 393
  (dos cascadas, «Para la central» = `paraLaCentral`), 396 (`partesPorTienda` y sus tres umbrales),
  431 (conciliación en lugar de aprobar/rechazar; `ConciliacionAcciones`), 473 (corregir el monto
  recibido), 478 (gestiones de bodega en pestañas con fila desplegable, solo lectura), 481
  (fulfillment solo para la central), SLT-56 (gestiones ajustadas por cierre del día), SLT-73
  (declarado = `paraLaCentral`; la marca asienta), SLT-76 (`desmarcable`).
- **Código que se reutiliza tal cual:**
  - `components/private/cierres/detalle/DetalleCierre.tsx` con `tipo="bodega"`: cabecera, estado,
    franja, las cuatro cifras, «Dinero» (reparto, «Lo que va a la central», «Lo que se le factura a
    la tienda», «De lo facturado, le queda a la empresa», «Por tienda» del agregado), pestañas, un
    solo scroll y pie. Sus slots `SlotsBodega` (`gestiones`, `mensajeros`, `conciliacion`) y
    `acciones.conciliacion` existen desde S1 para esta rebanada. **Sin cambios.**
  - `detalle-cierre-vista.ts`: `vistaBodegaDesdeAdmin`, `cifrasDe`, `avisosDe`, `pestanasDe`,
    `accionesDe` (la tabla de bodega · central ya pone «Cerrar» secundario + conciliación en decidir
    y conciliación + «Cerrar» principal en solo lectura, como el canvas), `pieTextoDe`, `fechaHora`.
  - `components/private/cierres/fila/GestionesCierre.tsx` con `audiencia="solo lectura"` y
    `columnaMensajero` (la prop la dejó SLT-101 para esta ficha); `senalesDe` ya pinta en «solo
    lectura» «Dañado» en lugar de «Dañado · sin indemnizar», como el canvas.
  - `Cuenta.tsx` (formato cascada, `data-signo`), `ConciliacionAcciones` (sin cambios),
    `estadoConciliacionDe`, `RECIBIDO_LABEL`, `FALTA_POR_RECIBIR_LABEL`,
    `DEBE_LLEGAR_A_LA_CENTRAL_LABEL`, `hrefDetalleCierre`, `money()`, `fechaHora`,
    `pagosAjustados` de `cola-cierres-labels.ts` (mismo texto que la señal de la cola),
    `DescargarDatasetButton`, `filaDescargaDetalleCierre`, `VisorEvidencia`.
  - Datos: `CierreBodegaDetalleServiceResult` ya trae todo lo de R41-R43 (`cierres[]` con
    `mensajeroNombre`, `grupos`, `totales.general`, `totalPagoMensajero`, `paraLaCentral`,
    `gestionesAjustadas`; y en `cierre`: `montoRecibido`, `faltaPorRecibir`, `conciliadoAt`,
    `conciliadoPorNombre`, `conciliadoNota`, `desmarcable`). **Sin cambios de servidor** salvo PA1 y
    PA3.
- **Lo que existe y no sirve tal cual:**
  - `DetalleBodegaVista` no lleva `montoRecibido` (lo pide «− Recibido»): se añade (aditivo).
  - `LineaCuenta.monto` es siempre un importe: «— sin marca» (R43) necesita una línea que pinte «—».
    Se añade un campo opcional (abajo).
  - `COLUMNAS_DESCARGA_DETALLE_CIERRE` no tiene «Mensajero»: se añade la variante de bodega.
  - `GestionesCierre` recibe UN `congeladoAt` para toda la lista; en bodega hay un cierre del día por
    mensajero (PA3).
  - El enlace `hrefDetalleCierre` funciona, pero la central no puede leer el cierre al que apunta
    (PA1).

## Fidelidad al canvas («sé fiel al diseño»)

Recorrido de `Main.dc.html` con `tipo` bodega y audiencia central: «Central 8» (`Bodega.dc.html`,
modo decidir) y «Central 9» (`BodegaRecibido.dc.html`, modo solo lectura), y la fila
`FilaSoloLectura.dc.html`.

**Lo que se pinta como el canvas:**

| # | Canvas | Spec |
|---|---|---|
| F1 | Cabecera «Cierre de bodega · Limón», «Bodega satélite · lo solicitó … · 2 mensajeros», folio monoespaciado, fechas | S1 (R2); R40 |
| F2 | Pastilla «Pendiente de conciliar» ámbar (decidir) / «Recibido» verde (solo lectura) | R111 |
| F3 | Franja «Por revisar: 2 pagos al mensajero ajustados · falta marcar el dinero recibido» solo en decidir | S1 (R4); R111 elige el modo |
| F4 | Cuatro cifras: Recaudado (con métodos), Debe llegar a la central («Aún no se marca recibido» / «Recibido completo»), Pago a mensajeros («2 mensajeros · 2 ajustes»), Le queda a la empresa | S1 (R6, R8) |
| F5 | Pestañas Dinero · Gestiones · Mensajeros · Conciliación, abre en Dinero | S1 (R10) |
| F6 | «Dinero» en tres columnas: «Lo que va a la central», «Lo que se le factura a la tienda», «De lo facturado, le queda a la empresa»; reparto; «Por tienda» | S1 (R16) |
| F7 | «Gestiones»: filtros con conteo, «Descargar» a la derecha, columnas Guía · Destinatario · tienda · **Mensajero** · Resultado · Recibido · Cobro a tienda · Pago mensajero · Señales, chevron para desplegar | R41, R113 |
| F8 | Fila desplegada «solo lectura»: sin acciones, con Fulfillment, «Ver evidencia» | R31, R113 |
| F9 | «Mensajeros»: Mensajero · Gestiones · Recaudado · Pago · A la central · Señales · «Ver su cierre»; señal «2 pagos ajustados» en ámbar o «—» | R42, R114 |
| F10 | «Conciliación»: cuenta de ancho limitado (520 px), «Debe llegar a la central», «− Recibido» («—» sin marca), «Falta por recibir» en negrita con raya, «Marcó: Aún nadie» / «Marcó: Carlos R. · 08/11/2026 09:12» bajo raya punteada | R43, R117 |
| F11 | Pie: «Declarado ₡… · márcalo recibido cuando llegue» (decidir) / «Declarado ₡…» (solo lectura) | S1 (R12); R112 |
| F12 | Pie decidir: «Cerrar» (borde) + «Marcar recibido» (negro); solo lectura: «Desmarcar» + «Cerrar» (negro) | R112 (orden y variante de «Cerrar» = canvas) |
| F13 | Modal del 75 % con «Cerrar» (X) arriba | S1 (R13); R119 |

**Desviaciones que se conservan, con su motivo** (las que dependen de Carlos van como PA):

| Canvas | Se pinta | Por qué |
|---|---|---|
| «Marcar recibido» / «Desmarcar» del alto del pie, «Desmarcar» con borde | `ConciliacionAcciones` tal cual: tamaño `sm`, «Desmarcar» `ghost`, «Corregir» `outline` en un recibido incompleto | Componente **compartido** con `/wallet/satelites` (ficha 431: «mismo botón para la misma fila»). PA5. |
| «Desmarcar» siempre en «Recibido» | solo si `desmarcable` (SLT-76) | Una marca ya asentada en la caja no se puede desmarcar; ofrecerlo era un botón que siempre fallaba. Lo localiza el paso 3 de `e2e/cierre-bodega-satelite.spec.ts`. |
| «Gestiones 31», «Mensajeros 2» | «Gestiones (31)», «Mensajeros (2)» | `conConteo` de S1 (R10 del madre), común a todo el detalle; no se cambia en una rebanada. Para el Preview. |
| «07/11/2026 19:05» | «2026-11-07 19:05» (`fechaHora`) | Formateador del detalle; SLT-92 unifica fechas. Para el Preview. |
| «Ver su cierre» abre el cierre del día | solo si PA1 = (a) | Hoy la central no puede leer un cierre del día de la satélite (PA1). |
| «Tarifas tal como estaban al crear el cierre (07/11/2026 18:42)» | con la fecha de su cierre del día si PA3 = sí; sin fecha si no | La fecha por gestión no llega hoy en el detalle de bodega (PA3). Nunca la del cierre de bodega: sería otra fecha. |
| — (no dibuja) cascadas y «Por tienda» por cierre del día, «Ingreso de la empresa» por concepto, motivo de rechazo histórico | no van en el detalle de bodega (R118) | Lo de cada cierre del día está en su propio detalle («Ver su cierre», PA1); el desglose por concepto lo cubre «Lo que se le factura a la tienda»; `rechazado` lo retiró la 431. |

## Arquitectura

```
components/private/cierres/detalle/   (pantalla)
  detalle-cierre-vista.ts        + DetalleBodegaVista.montoRecibido; gestionesDeBodega, filasMensajeros,
                                   cuentaConciliacion, marcaConciliacion, modoBodegaDe (PUROS)
  detalle-cierre-labels.ts       + textos nuevos en «tú» de Mensajeros y Conciliación
  MensajerosCierreBodega.tsx     NUEVO: la tabla de «Mensajeros» (R42, R114, R115)
  ConciliacionCierreBodega.tsx   NUEVO: la cuenta de «Conciliación» (R43, R117)
  Cuenta.tsx                     + LineaCuenta.sinImporte (pinta «—»)
  detalle-cierre-descarga-columnas.ts  + variante con «Mensajero» (R113)

components/private/cierres/fila/ (solo PA3)
  fila-gestion-vista.ts          + ItemGestion.congeladoAt?
  GestionesCierre.tsx            usa el congeladoAt del item si llega

app/(app)/cierres-admin/_components/
  CierresBodegaAdminModule.tsx   el Modal de hoy → <DetalleCierre tipo="bodega" …/> (R40, R118)
  CierresAdminModule.tsx         (solo PA1) cierre de satélite → solo lectura forzado (R116)

lib/ (solo PA1 y PA3, backend_dev)
  services/CierresAdminService.ts, repositories/CierresAdminRepository.ts   lectura del detalle (PA1)
  interfaces/services/ICierreBodegaService.ts, services/CierresBodegaAdminService.ts,
  repositories/CierreBodegaRepository.ts                                    solicitadoAt por cierre (PA3)
```

Mismo patrón que `detalle/`, `fila/` y `cola/`: el `.ts` puro **elige y ordena**; los importes son
strings del servidor que solo pasan por `money()`; el `.tsx` pinta.

## Funciones puras nuevas (`detalle-cierre-vista.ts`)

| Función | Qué devuelve | R |
|---|---|---|
| `modoBodegaDe(c: { conciliado: boolean })` | `"decidir"` sin marca; `"solo lectura"` con marca (recibido o incompleto) | R111 |
| `gestionesDeBodega(cierres)` | `ItemGestion[]`: por cada resultado de `ORDEN_RESULTADOS`, las gestiones de cada `cierres[i]` en el orden del servidor, con `mensajeroNombre` (y `congeladoAt` si PA3) | R41, R113 |
| `filasMensajeros(cierres)` | `{ cierreDiaId, mensajero, gestiones: number, recaudado, pago, aLaCentral, senal: string, href }[]` en el orden de `cierres[]`; `senal` = `pagosAjustados(n)` si `gestionesAjustadas > 0`, «—» si no; `href` = `hrefDetalleCierre(cierreDiaId)` | R42, R114 |
| `cuentaConciliacion(d)` | `CuentaVista` con las tres líneas de R117 (la de «Recibido» con `sinImporte: true` si `montoRecibido` es `null`) | R43, R117 |
| `marcaConciliacion(d)` | «Marcó: <nombre> · <fechaHora(conciliadoAt)>» o «Marcó: Aún nadie» | R43, R117 |

`vistaBodegaDesdeAdmin` añade `montoRecibido: c.montoRecibido` y, según PA2, el conteo de la
pestaña: `pestanasDe("bodega", …, { mensajeros: r.cierres.length })` mientras
`conteos.mensajeros` (cabecera «N mensajeros» y contexto de la cifra 3) sigue contando distintos.
Ninguna función recibe ni devuelve un número de dinero (R71).

### `LineaCuenta.sinImporte`

```ts
export interface LineaCuenta {
  label: string;
  monto: string;          // sin cambios
  signo: SignoLinea;
  tipo: "partida" | "subtotal" | "total";
  notas?: readonly string[];
  /** SLT-104 (R43): se pinta «—» en lugar de `money(monto)`; `monto` queda "" y no entra en las identidades. */
  sinImporte?: boolean;
}
```

Opcional y apagado por defecto: el DOM de todas las cuentas de hoy no cambia. `Cuenta` pinta `—`
con `data-monto=""` (las identidades de `DineroIdentidadesEnPantalla` saltan esa línea, que no es un
importe).

## Componentes nuevos

### `MensajerosCierreBodega`

```ts
interface MensajerosCierreBodegaProps {
  filas: ReturnType<typeof filasMensajeros>;
  /** R115: cierra el detalle de bodega y navega a `href`. Ausente (PA1 = b) → el enlace no navega. */
  onVerSuCierre?: (href: string) => void;
}
```

Tabla con rejilla CSS como el canvas (`1.6fr 90px 1fr 1fr 1fr 1.2fr 120px`), dentro de la tarjeta
blanca de borde fino, con cabecera de columnas en gris de 12 px; `role="table"` con
`aria-label="Mensajeros del cierre de bodega"`, `row`/`columnheader`/`cell`. Números a la derecha,
`money()` en los tres importes, Señales en ámbar de 12 px. «Ver su cierre» es un `<a href>` (Next
`Link`) con nombre accesible «Ver el cierre de <mensajero>» que llama a `onVerSuCierre(href)` en el
`onClick` (primero cierra el detalle, luego `router.push`). Mismo patrón de rejilla que
`GestionesCierre`; no se usa `DataTable` por el motivo de la alternativa 2.

### `ConciliacionCierreBodega`

`<Cuenta titulo="Conciliación" lineas={cuentaConciliacion(d)} notas={[marcaConciliacion(d)]}
className="max-w-[520px]" />`. Las `notas` de `Cuenta` ya pintan el bloque gris bajo raya punteada
del canvas.

## Montaje en `CierresBodegaAdminModule` (R40, R112, R113, R118, R119)

Se conserva todo lo de hoy salvo el `<Modal>` y su cuerpo (líneas 542-803): `abrirDetalle` (con sus
cuatro avisos de error), `refrescarListas`, `cerrarDetalle`, el estado `detalle` y el visor de
evidencia. `DetalleAbierto` pasa a guardar el resultado `ok` entero (`cierre`, `cierres` y los
derivados) para construir la vista con `vistaBodegaDesdeAdmin`.

```tsx
{detalle ? (
  <DetalleCierre
    tipo="bodega"
    marco="modal"
    audiencia="central"
    detalle={vistaBodegaDesdeAdmin(detalle)}
    modo={modoBodegaDe(detalle.cierre)}
    pestanas={{
      gestiones: (
        <GestionesCierre
          gestiones={gestionesDeBodega(detalle.cierres)}
          audiencia="solo lectura"
          columnaMensajero
          quienMiraEsCentral={audiencia === "admin"}
          congeladoAt={null}                 // PA3 = sí: la fecha va por item
          acciones={{}}
          onVerEvidencia={setEvidencia}
          descargar={<DescargarDatasetButton
            titulo={tituloDescargaGestiones(folioDe(detalle.cierre.cierreBodegaId))}
            columnas={COLUMNAS_DESCARGA_DETALLE_BODEGA}
            obtenerFilas={async () => ({ status: "ok", filas: gestionesDeBodega(detalle.cierres)
              .map((i) => filaDescargaDetalleBodega(i.gestion, i.mensajeroNombre)) })} />}
        />
      ),
      mensajeros: <MensajerosCierreBodega filas={filasMensajeros(detalle.cierres)}
                    onVerSuCierre={(href) => { cerrarDetalle(); router.push(href); }} />,
      conciliacion: <ConciliacionCierreBodega detalle={vistaBodegaDesdeAdmin(detalle)} />,
    }}
    acciones={{
      conciliacion: puedeConciliar ? (
        <ConciliacionAcciones … mismas props que hoy … onCambio={() => { cerrarDetalle(); refrescarListas(); }} />
      ) : undefined,
    }}
    onCerrar={cerrarDetalle}
  />
) : null}
```

- La `audiencia` de la descarga detallada de la pantalla y de `quienMiraEsCentral` es la prop que ya
  existe (`"admin"` para la central; default `"satelite"`, falla cerrado).
- `vistaBodegaDesdeAdmin` se calcula una vez por render (`useMemo` sobre `detalle`).
- Imports que se quitan del módulo: `Modal`, `TotalesPanel`, `TotalesIngresoPanel`, `CascadaDinero`,
  `lineasCascadaCentral`, `lineasCascadaDueno`, `DesglosePorTienda`, `marcaDeVariasTiendas`,
  `GestionesPorResultado`, `CON_AJUSTES_BADGE_LABEL`, `conAjustesNota`, `Badge` (si queda sin uso),
  `EMPRESA`, `CASCADA_*_TITULO`. Los que sigan usándose en la cola (`CierreBodegaFacturaResumen`,
  `ListaComprobantes`, `SegmentedToggle`, `PanelConmutado`, `FiltrosCierresBarra`, descargas) no se
  tocan.
- Si al quitar el último consumidor de `app/` algún export queda sin superficie
  (`lineasCascadaDueno`, `CascadaDinero` lo sigue montando `CascadasCierreMensajero` y
  `ConciliacionSatelite`), lleva `@sin-superficie` («SLT-104 sustituyó el modal de bodega; lo retira
  SLT-115») según lo que diga T0.1 de `superficie-de-uso`.

## Lectura de un cierre del día de la satélite por la central (solo si PA1 = a)

| Pieza | Cambio | Dónde |
|---|---|---|
| Alcance de **lectura** del detalle | Con `esAccesoTotal`, `verCierreDetalle` busca el cierre por id **sin** exigir `destinoTipo = bodega_central` (cualquier destino de la empresa). El resto de métodos (listas, aprobar, rechazar, destrabar, corregir, ajustar, pagar) siguen con `resolveAlcance` de hoy. | `CierresAdminService.verCierreDetalle` + un `alcanceLectura` explícito en `CierresAdminRepository.findCierreByIdEnAlcance` (o un parámetro), nunca cambiando `alcanceWhere`, que comparten las listas |
| Empresa | La acota lo mismo que hoy acota toda lectura del repositorio (cliente por empresa + RLS en `cierre_dia`). T0.2 lo confirma con archivo:línea antes de tocar nada; si el filtro de empresa estuviera en `alcanceWhere`, se repite en el `WHERE` nuevo. | — |
| Pantalla | SI `audiencia === "admin"` y `cierre.destinoTipo === "bodega_satelite"`: `modo = "solo lectura"`, `audienciaFila = "solo lectura"`, sin `pago`, sin `rechazar`/`aprobar`/`destrabar`, `acciones` de fila vacías. | `CierresAdminModule.tsx` (junto a `esResoluble` / `ofrecer*`) |

- Defensa: ocultar botones no es la defensa. Las Server Actions de escritura siguen resolviendo su
  propio alcance (`bodega_central` para la central) y responden `no_encontrada` sobre un cierre de
  satélite (R116); el test de servicio lo afirma.
- Test de integración contra la base (memoria «probar el WHERE donde vive»): la central lee un
  cierre del día de satélite de su empresa; **no** lee uno de otra empresa; el adminSatelite de
  otra zona sigue sin leerlo. La mutación «quitar el filtro de empresa» lo pone rojo.

## `solicitadoAt` por cierre del día (solo si PA3 = sí)

Campo aditivo `solicitadoAt: string` en `CierreBodegaDetalleCierre` (ISO, el de su `cierre_dia`),
poblado donde se arma `cierres[]` (`CierresBodegaAdminService.ts:332`, `cd.resumen`; T0.2 dice si
`cd.resumen` ya lo trae o hay que pedirlo en `CierreBodegaRepository`). `ItemGestion.congeladoAt?`
opcional; `GestionesCierre` pasa `item.congeladoAt ?? congeladoAt` a la fila. Sin migración.

## Autorización

Sin cambios salvo PA1. El detalle de bodega lo lee `verCierreBodegaDetalle` (acceso total, como
hoy). Las acciones de conciliación exigen `puedeConciliar` (servidor, `esAccesoTotal`) y las
Server Actions de la conciliación siguen respondiendo `forbidden` a quien no lo tenga. Módulo: el de
cierres sigue en `nucleo`.

## Modelo de datos, RLS y migraciones

Ninguno. No hay tablas, columnas, índices, RLS ni migraciones; no hay `down.sql`. PA1 y PA3 son
lecturas sobre tablas con `organizacion_id` y RLS existentes (`cierre_dia`, `cierre_bodega`).

## Datos que dependen del país

- Moneda: solo `money()`.
- Fechas: `fechaHora` (Costa Rica, `lib/utils/fecha-cr.ts`) y el día de la consolidación con
  `fechaCalendarioCR` como hoy; SLT-92 las llevará a la zona de la empresa.
- Impuesto: el rótulo de «Le queda a la empresa» ya sale de `IMPUESTO_ROTULO` (S1).

## Tests y guardias que cambian

Censo inicial (T0.1 lo confirma con `grep -l`; si aparece uno más, se añade a `## Archivos
esperados` y se avisa):

- **Componentes que abren el modal de bodega y leen sus paneles** («Totales del cierre de bodega»,
  «Lo que va a la central · cierre de bodega», «Cierre del día · <X>», «Órdenes del cierre · <X>»,
  «Con ajustes»): `CierreBodegaDetalleCascadas`, `CierreBodegaDesglosePorTienda`,
  `CierreBodegaDetalleGestiones`, `CierresBodegaAdminRefresco`, `cierre-detalle-ajuste-badge`,
  `DineroIdentidadesEnPantalla` (bloque de bodega). Pasan al detalle único con los **mismos
  importes**: el agregado en «Dinero» y en las cifras; cada cierre del día en su fila de
  «Mensajeros» («A la central», «Pago», «N pagos ajustados»); las gestiones en «Gestiones» con
  «Ajustado» y su historial en la fila. Lo que vigilaban de cada cierre del día y ya no se pinta en
  bodega (sus dos cascadas, su «Por tienda»), si PA1 = (a), se vigila en el detalle de mensajero
  abierto por «Ver su cierre»; si no, se anota en `impl_SLT-104.md` como vigilancia retirada con su
  motivo (R118) y el leader lo lleva a Carlos.
- `cierre-bodega-vocabulario.guardia.test.ts`: su autocomprobación exige que los rótulos de la 393
  (`CASCADA_CENTRAL_TITULO`, `GANA_BODEGA_SATELITE_LABEL`) y el vocabulario de la conciliación
  (`ConciliacionAcciones`, `RECIBIDO_LABEL`, `FALTA_POR_RECIBIR_LABEL`) aparezcan en
  `CierresBodegaAdminModule.tsx`. Tras S6 los rótulos de las cascadas viven en
  `detalle-cierre-vista.ts` y la conciliación en `ConciliacionCierreBodega.tsx` /
  `detalle-cierre-vista.ts`: el censo se **amplía** a `MensajerosCierreBodega.tsx` y
  `ConciliacionCierreBodega.tsx` (archivos enteros de bodega) y la autocomprobación se apunta a
  ellos. Los cuatro censos («Ajustes», cifra suelta, «Central debe», aprobación) siguen sin
  aflojarse y con su canario. `detalle-cierre-vista.ts` **no** entra entero (trae «Aprobado» /
  «Rechazado» del detalle de mensajero, D3 de la 431).
- `cascada-central-en-las-dos-pantallas.guardia.test.ts`: vigila las tarjetas
  `CierreBodegaFacturaResumen` de la cola, que S6 no toca. T0.1 confirma que sigue verde sin
  cambios; si mira el cuerpo del modal (p. ej. cuenta usos de `lineasCascadaCentral`), se ajusta
  para que mire `detalle-cierre-vista.ts` (`cuentaCentral`).
- `liquidacion-money-safe`: su barrido recorre `components/private/cierres/` (S1) y exige que todo
  archivo de ese árbol esté en `ARCHIVOS_DE_LA_FEATURE`, así que los dos `.tsx` nuevos se censan ahí
  (corregido en T5: no caían dentro sin tocarla). Contraprueba en T5.
- `superficie-de-uso`: anotaciones `@sin-superficie` que pida T0.1.
- E2E:
  - `e2e/cierre-bodega-satelite.spec.ts` (paso 2 y 3, modelo viejo): del modal a la región del
    detalle único; «Totales del cierre de bodega» → cifra «Recaudado»; «Cierre del día · X» →
    «Mensajeros» y «Gestiones» (filtro «Devolución a origen por rechazo», desplegar, «Ver evidencia»);
    «Marcar recibido» en el pie; literales de T0.3 en las cuatro cifras, «Mensajeros» y
    «Conciliación» antes (— y 7.000) y después de marcar (7.000 y 0,00).
  - `e2e/ajuste-pago-mensajero-cierre.spec.ts` (paso satélite): el bucle «agregado y por mensajero»
    pasa a «Lo que va a la central» de «Dinero» (agregado) y a la fila de «Mensajeros» (por
    mensajero: Pago 1.800, A la central 7.200, «1 pago ajustado»); el historial del ajuste, en la
    fila de «Gestiones».
  - `e2e/cierres-rediseno.spec.ts`: `describe` S6 con un cierre de bodega del **modelo nuevo**
    (escenario B + consolidación) para R77; si PA1 = (a), «Ver su cierre» abre el detalle del
    cierre del día en solo lectura sin «Aprobar» ni «Ajustar pago».
  - Helper `solicitarCierreBodega(r, adminSatelite)` en `e2e/_escenarios/cierres.ts` (servicio, no
    UI), para no repetir los clics del paso 1 en el `describe` nuevo.

## Verificación de lo que ve el usuario

- **Componente (`tests/components/DetalleCierreBodega.test.tsx`)**, con dobles y literales escritos
  en el test (memoria «aserción contra su propia fuente»): dos cierres del día (uno con 2 gestiones
  ajustadas, otro sin), «Mensajeros (2)» y sus dos filas con los importes que `money()` da para
  `"80000.10"`, `"9000.30"`, `"70749.55"` (literales a mano en T0.3); «2 pagos ajustados» y «—»;
  «Conciliación» sin marca («—», «Aún nadie») y con marca (`"7000.00"`, nombre y fecha); un
  `faltaPorRecibir` negativo con su signo; PA2: dos cierres del mismo mensajero → «Mensajeros (2)».
- **Módulo (`tests/components/CierresBodegaAdminDetalleUnico.test.tsx`)**: «Ver / decidir» abre el
  `dialog` «Detalle del cierre de bodega · Cierre de bodega · Limón» en modo decidir con «Marcar
  recibido» y «Cerrar»; «Ver» de Resueltos abre en solo lectura; sin `puedeConciliar` solo
  «Cerrar»; marcar llama a `onCambio` → cierra y revalida las dos claves SWR; `no_encontrada` →
  toast y relectura, sin detalle; la fila de «Gestiones» no ofrece «Ajustar pago» ni «Corregir…» y sí
  «Ver evidencia» y fulfillment; «Ver su cierre» cierra el detalle y navega a `?cierre=<id>`.
- **E2E**, base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en `gate.yml`: los dos de arriba,
  más el `describe` S6 (modelo nuevo). Literales de T0.3 escritos a mano.
- **Mutaciones antes de creer el verde:** pintar «0,00» en «− Recibido» sin marca; contar la
  pestaña con `conteos.mensajeros` (PA2); pasar `audiencia="central"` a la fila de bodega (aparece
  «Ajustar pago»); ordenar «Mensajeros» por nombre; (PA1) quitar el filtro de empresa del `WHERE`
  nuevo.

## Alternativas descartadas

1. **Dejar el modal de hoy y añadirle las pestañas.** Contradice D1/D15 (un solo detalle para todo el
   módulo) y el canvas aprobado (D18), y deja dos formas de pintar el mismo cierre de bodega.
2. **«Mensajeros» con `DataTable`.** La tabla genérica vigila cosas que esta lista no necesita
   (paginación, vacío, error, scroll horizontal) y no pinta la rejilla del canvas dentro de la
   tarjeta del detalle; el detalle ya usa rejilla propia en «Gestiones» y «Por tienda». Una lista de
   2-10 filas sin paginar no justifica otro patrón.
3. **«Ver su cierre» abriendo un detalle de mensajero armado con `cierres[i]`** (sin pedir nada al
   servidor). Le faltan estado, fechas, destino, «Rechazados por la tienda» y las retenidas: el
   detalle saldría con pestañas vacías que mienten («Rechazados por la tienda (0)» sin haberlo
   leído). Por eso PA1 propone la lectura del servidor.
4. **Abrir el cierre de la satélite con el alcance de escritura ensanchado** (cambiar `alcanceWhere`
   para la central). Ensancharía también las listas de mensajeros de la central y las Server
   Actions de escritura; R116 pide solo leer.
5. **«— sin marca» pasando `"—"` como `monto`.** `money("—")` no es un importe y rompería la
   aserción de identidades por `data-monto`; el campo `sinImporte` lo dice en el tipo.
6. **Un componente de detalle de bodega aparte** (`DetalleCierreBodega`). Contradice D15.

## Dependencias de terceros

Ninguna nueva.
