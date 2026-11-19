# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — design (v2)

> v2 del 2026-11-09. Conserva del v1: la carpeta-módulo puro (`detalle-cierre-vista.ts`), el
> origen de cada cifra existente, el nombre accesible conservado, los diálogos con callbacks y las
> alternativas descartadas 1-4. Cambia: cuatro componentes en vez de uno, viven en
> `components/private/cierres/` (los usan `/cierres-admin`, `/cierre-dia` y `/wallet/satelites`),
> las cifras de la nota p1 se derivan en el servidor, el Excel nuevo y el corte en 17 rebanadas.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`, todos los estados): «cierre», «conciliación», «consolidación»,
  «cierre de bodega», «cierre-dia», «Excel», «trato»;
- `specs/`: «un solo componente», «fila desplegada», «Ver cómo se calculó», «Por conciliar», «A
  consolidar», «Le queda a la empresa»;
- código (Grep/Read; ver la nota del grafo): `CierreFacturaDetalle`, `CascadasCierreMensajero`,
  `CascadaDinero`, `GestionesPorResultado`, `CierresAdminModule`, `CierresBodegaAdminModule`,
  `ConsolidacionBodegaModule`, `ConciliacionSatelite`, `BuscadorFiltros`, `DescargarDatasetButton`,
  `Modal`, `paraLaCentral`, `derivarPendienteCierre`, `cierre_detail_concepto`,
  `gestion_pago_congelado`, `orden_fulfillment_movimiento`, `hojasAdicionales`.

**Resultado:**
- **Board:** ninguna ficha, viva ni cerrada, rediseña el módulo. Relacionadas, sin solaparse:
  - SLT-96 «Consolidación de ₡0 no se puede marcar recibida» (`done`): `ConciliacionAcciones` se
    reutiliza tal cual.
  - SLT-57 «Tarifas flexibles: retirar el modelo viejo» (`pending`): retirará el modelo viejo; hasta
    entonces el rediseño pinta los dos (D19).
  - SLT-65 «Geografía jerárquica: consultas de órdenes, cierres y zonas sobre el nodo»
    (`in_progress`): toca consultas de cierres en el servidor. Las rebanadas fullstack (S5, S7, S8,
    S9, S12-S15) pasan el candado de archivos contra ella antes de tomarse.
  - SLT-94 «Cobro de fulfillment por paquete y marca «se recoge en tienda»» (`done`): de ella sale
    `orden_fulfillment_movimiento`, origen de la fecha del cargo (R65).
- **Specs:** fijaron lo que estas pantallas pintan y esta feature respeta: 393 (cascadas de bodega),
  395 (cascadas del mensajero), 396 (por tienda), 425 (rechazos de tienda), 431 (conciliación),
  462 (retención), 478 y 486 (fila y evidencias), 481 (fulfillment solo central), SL-39 (IVA
  aparte), SLT-56 (ajuste del pago), SLT-73 (conciliar en la central), 170/184/464 (paginación,
  descargas, libros de varias hojas). Ninguna es este rediseño.
- **Grafo:** el índice del worktree
  (`R-job-singularis-projects-servi_logistic-.worktrees-SLT-95-detalle-cierre-rediseno`) no existe.
  Se exploró con Grep/Read sobre el worktree.

## Zona por rebanada

| Rebanada | Zona | Por qué |
|---|---|---|
| S1, S2, S3, S4, S6, S10, S11, S16, S17 | frontend | Solo presentación; todo dato ya llega. |
| S5 | fullstack | Los textos con voseo o sin tildes también salen del servidor (`CierreDiaService` `motivoBloqueo`, `ConsolidacionBodegaService` bloqueos y errores). Solo cambian strings. |
| S7 | fullstack | «Por conciliar / Conciliados» cambia el `WHERE` de las listas de bodega de la central (`CierresBodegaAdminRepository`). |
| S8 | fullstack | Nuevas derivaciones en `ConsolidacionBodegaService` (R67) y el bloqueo con nombres (R47). |
| S9 | fullstack | **Permiso nuevo**: el adminSatelite lee el detalle de SU cierre de bodega (R50); filtro de fecha en «Solicitados» (R52); tarjetas (R68). |
| S12, S13, S14 | fullstack | Cifras de la nota p1 (R64-R70). |
| S15 | fullstack | Las filas de la descarga necesitan los campos de S12. |

## Modelo de datos, RLS y migraciones

**Ninguno en ninguna rebanada.** No hay tablas, columnas, índices, RLS ni migraciones; por tanto no
hay `down.sql`. Las lecturas nuevas (S9, S12-S14) van sobre tablas que ya tienen `organizacion_id`
y RLS por empresa (`cierre_detail_concepto`, `gestion_pago_congelado`, `tarifa_valor`,
`orden_fulfillment_movimiento`, `pago_mensajero` y sus imputaciones), con el mismo filtro de empresa
que ya aplican sus repositorios. Los contratos de servicio crecen **solo con campos aditivos**; no
se quita ni renombra ninguno (S16 retira código de pantalla, no contratos).

## Autorización

Todo se decide en el servidor y baja por props; los componentes no conocen roles, solo `audiencia`,
`rol` y la presencia o ausencia de callbacks.

- `/cierres-admin/page.tsx` sigue calculando `audiencia`, `puedeRegistrarPago`,
  `puedeCorregirPagos`, `puedeCorregirResultado`, `puedeAjustarPagoMensajero` y `puedeConciliar`
  como hoy (inventario-central §A). La audiencia `central` = `esAccesoTotal`; `satelite` =
  adminSatelite.
- `/cierre-dia/page.tsx` sigue siendo solo del rol mensajero (`notFound` para los demás).
- **Único cambio de permiso (S9, R50):** `CierresBodegaAdminService.verDetalle` hoy responde
  `forbidden` a todo lo que no es `esAccesoTotal`. Se admite además al adminSatelite **solo** para
  cierres de bodega con `zona_id` = la zona del actor; el filtro de zona va en el `WHERE` del
  repositorio (no se lee y se descarta). Fuera de su zona, `forbidden`; sin zona, `forbidden`. El
  resultado lleva `audiencia: "satelite"` y el servicio **no emite** `fulfillment`/`ivaFulfillment`
  ni la marca `desmarcable` para esa audiencia (vacía el dato en el servidor, no lo oculta la
  pantalla). Test de integración contra la base, con un cierre de otra zona que debe dar
  `forbidden` (memoria «probar el WHERE donde vive»).
- Módulo: el de cierres sigue colgando de `nucleo` (`lib/modulos/reparto.ts`); no cambia.

## Datos que dependen del país

- **Moneda:** solo vía `money()` (config de país). Ningún símbolo escrito en los componentes.
- **Métodos de pago:** rótulos de `METODO_LABEL`, como hoy.
- **Impuestos:** el IVA llega calculado (snapshots y `cierre_detail_concepto.iva_pct`); el «IVA
  13 %» de la maqueta se pinta con el `iva_pct` congelado, nunca escrito.
- **Fechas:** «este mes» y «30 días» (R68, R69) se cortan en la zona horaria de la empresa con las
  utilidades de `lib/utils/fecha-cr.ts` que ya usa el módulo (SLT-92 «Pantallas: fechas y teléfonos
  en la zona y el prefijo del país de la empresa» las generalizará; no se adelanta).

## Arquitectura: cuatro componentes

Carpeta nueva `components/private/cierres/` (datos de dinero por props desde el Server Component;
`docs/architecture.md > Componentes`). Se usa desde tres módulos, por eso no vive en
`app/(app)/cierres-admin/_components/`.

```
components/private/cierres/
  detalle/   DetalleCierre.tsx · CifrasCierre.tsx · DineroCierre.tsx · Cuenta.tsx
             detalle-cierre-vista.ts (puro) · detalle-cierre-labels.ts
  fila/      GestionesCierre.tsx · FilaGestion.tsx · fila-gestion-vista.ts (puro)        (S3)
  cola/      ColaCierres.tsx · cola-cierres-vista.ts (puro) · cola-cierres-labels.ts      (S4)
  dialogos/  VisorEvidencia.tsx · dialogos-labels.ts                                      (S5)
```

`Cuenta.tsx` es la tarjeta en formato cascada de D16 (partida por línea, «−»/«+» delante del
rótulo, subtotal con raya punteada, total en negrita con raya continua). La usan «Dinero», la fila,
«Ver cómo se calculó», «Conciliación» y `/wallet/satelites` (R15, R78). Cada línea lleva
`data-signo` para que `DineroIdentidadesEnPantalla.test.tsx` siga pudiendo leer y comprobar las
restas del DOM.

### 1. Detalle del cierre — `DetalleCierre`

```ts
type Audiencia = "central" | "satelite" | "mensajero";
type Modo = "decidir" | "solo lectura" | "vencido" | "en curso" | "rechazado";
type Marco = "modal" | "pagina";

type DetalleCierreProps =
  | { tipo: "mensajero"; detalle: DetalleMensajeroVista; audiencia: Audiencia; modo: Modo; marco: Marco;
      pestanas: SlotsMensajero; acciones: AccionesPie; onCerrar?: () => void }
  | { tipo: "bodega"; detalle: DetalleBodegaVista; audiencia: Exclude<Audiencia, "mensajero">;
      modo: "decidir" | "solo lectura"; marco: "modal";
      pestanas: SlotsBodega; acciones: AccionesPie; onCerrar: () => void };

// Ausente = no se ofrece (R12). Los flujos viven en el módulo que monta el detalle.
type AccionesPie = Partial<Record<"rechazar" | "aprobar" | "destrabar" | "solicitar" |
  "solicitarRechazado" | "solicitarVencido", () => void>> & { conciliacion?: ReactNode };

// Cuerpos de pestaña que no son «Dinero»: los monta quien usa el detalle (S2, S3, S6, S11).
type SlotsMensajero = { gestiones: ReactNode; rechazos: ReactNode; pago?: ReactNode; corregir?: ReactNode };
type SlotsBodega = { gestiones: ReactNode; mensajeros: ReactNode; conciliacion: ReactNode };
```

`DetalleMensajeroVista` y `DetalleBodegaVista` los produce `detalle-cierre-vista.ts` a partir de
`CierreDetalleAdminServiceResult`, `CierreBodegaDetalleServiceResult` y, para el mensajero, del
resultado de `CierreDiaService` (S10, S11). La vista solo **elige y cuenta**: los importes son
referencias a los strings del servidor.

Funciones puras de `detalle-cierre-vista.ts` (S1): `cifrasDe(tipo, audiencia, detalle)`,
`metodosVisibles(totales)`, `avisosDe(tipo, audiencia, modo, detalle)`, `pestanasDe(tipo,
audiencia, modo, opciones)`, `accionesDe(tipo, audiencia, modo, permisos)`, `lineasDinero(tipo,
detalle)`.

Rejilla (R11): `flex-col` con `max-h-[calc(100dvh-2rem)]` en modal y `h-full` en página; cabecera,
franja, cifras y `tablist` con `shrink-0`; el `tabpanel` con `flex-1 min-h-0 overflow-auto` (único
scroll); pie `shrink-0`. Modal sobre el `Dialog` de `components/ui` (como en el v1: `Modal` impone
su propio pie de confirmar/cancelar y el detalle tiene un pie de acciones propio); ancho del 75 %.
Nombre accesible (R13): título visible = identidad; prefijo `sr-only` «Detalle del cierre · » o
«Detalle del cierre de bodega · », que es lo que localizan los E2E de hoy.

### 2. Cola de cierres — `ColaCierres` (S4, S7, S8, S9, S10)

```ts
type ColaCierresProps = {
  tipo: "mensajero" | "bodega"; rol: "central" | "satelite" | "mensajero";
  pestanas: { id: string; label: string; conteo: number }[]; pestanaActiva: string; onPestana: (id: string) => void;
  barra: ReactNode;               // FiltrosCierresBarra (BuscadorFiltros) + DescargarDatasetButton, tal cual
  aviso?: string;                 // bloqueo de «Solicitar cierre de bodega» (R46, R47)
  tarjetas?: TarjetaCifra[];      // A consolidar, Solicitados, mensajero (R45, R49, R60)
  filas: FilaCola[];              // columnas por (tipo, rol, pestaña) de cola-cierres-vista.ts
  pie?: { texto: string; boton?: { label: string; deshabilitado: boolean; onClick: () => void } };
  paginacion?: ReactNode;         // la de hoy (ListaComprobantes / paginado 170)
};
```

Las columnas por `(tipo, rol, pestaña)` salen de `columnasCola()` en `cola-cierres-vista.ts`
(tabla de R33, R34, R44, R45, R49, R60), probada sin montar nada.

### 3. Fila de una gestión — `FilaGestion` (S3)

```ts
type FilaGestionProps = {
  gestion: GestionVista; audiencia: "central" | "satelite" | "mensajero" | "solo lectura";
  quienMiraEsCentral: boolean;    // decide Fulfillment en «solo lectura» (R25, R30)
  acciones: Partial<Record<"corregirMetodos" | "ajustarPago" | "corregirResultado" | "devolver", (g) => void>>;
  onVerEvidencia: (urls: string[], inicio: number) => void;
};
```

Lo que se ve por audiencia sale de `fila-gestion-vista.ts` (tablas de R25 y R26). La regla de hoy de
cuándo se ofrece cada acción (estado `solicitado`/`vencido`, resultado, `pagos.length`, `pagoMensajero
!== null`; inventario-central §A) se mueve sin cambios desde `cierre-factura.tsx` a esa función.

### 4. Diálogos (S5)

No hay un componente nuevo de caja: es el `Modal` existente (D17). S5 aporta `VisorEvidencia`
(Anterior/Siguiente, «foto i de n»; R54) y `dialogos-labels.ts` con los textos en «tú». Los 18
diálogos de R53 siguen en sus archivos de hoy; quién monta cada uno:

| Diálogo | Archivo de hoy | Quién lo ve |
|---|---|---|
| Rechazar, Confirmar paquetes, Indemnizar, Destrabar | `CierresAdminModule.tsx`, `cierre-confirmacion-fisica.tsx` | central y satélite |
| Ajustar pago | `AjustarPagoMensajeroDialog.tsx` | central y satélite |
| Corregir métodos, Corregir el resultado | `CorregirPagosDialog.tsx`, `CorregirResultadoDialog.tsx` | central |
| Registrar pago, Anular pago | `RegistrarPagoMensajeroDialog.tsx`, `components/shared/liquidacion/*` | central |
| Evidencia | `VisorEvidencia.tsx` (nuevo, sustituye los dos visores idénticos de hoy) | todos |
| Solicitar cierre de bodega | `ConsolidacionBodegaModule.tsx` → módulo que monte la cola satélite (S8) | satélite |
| Marcar recibido, Corregir recibido, Desmarcar | `components/shared/conciliacion/*` | central |
| Solicitar cierre del día, Enviar vencido, Enviar rechazado, Devolver a gestión | `CierreDiaModule.tsx` | mensajero |

### Props → quién las usa

| Componente y props | Pantalla (canvas) | Rebanada |
|---|---|---|
| Detalle · mensajero · central · decidir · modal | Central 2 «Ver / decidir» | S2 |
| Detalle · mensajero · central · solo lectura · modal | Central 4 «Cierre aprobado» (con «Pago al mensajero») | S2 |
| Detalle · mensajero · central · vencido · modal | Central 5 «Destrabar» | S2 |
| Detalle · mensajero · satélite · decidir / solo lectura / vencido · modal | Satélite 2 | S2 |
| Detalle · bodega · central · decidir / solo lectura · modal | Central 8 y 9 | S6 |
| Detalle · bodega · satélite · solo lectura · modal | Satélite 6 (nuevo) | S9 |
| Detalle · mensajero · mensajero · solo lectura · modal | Mensajero 5 | S10 |
| Detalle · mensajero · mensajero · en curso / rechazado / vencido · página | Mensajero 1, 2, 3 | S11 |
| Cola · mensajero · central | Central 1 y 3 | S4 |
| Cola · mensajero · satélite | Satélite 1 | S4 |
| Cola · bodega · central | Central 7 | S7 |
| Cola · bodega · satélite | Satélite 3, 4, 5 | S8, S9 |
| Cola · rol mensajero | Mensajero 4 | S10 |
| Fila · central / satélite / mensajero / solo lectura | Componente Fila + 3 instancias | S3 (mensajero: S10) |

### Qué sustituye cada componente

| Hoy | Lo sustituye | Rebanada | Se borra en |
|---|---|---|---|
| Cuerpo del modal «Detalle del cierre» de `CierresAdminModule.tsx` (incluye «Decisión del cierre») | `DetalleCierre` tipo mensajero | S2 | S16 |
| `CascadasCierreMensajero.tsx` | `DineroCierre` | S2 | S16 |
| `CierreFacturaDetalle` (audiencia admin: KPIs, Totales, Ingreso de la empresa, Liquidación/«Debe», hoja de impresión) | `DetalleCierre` + `CifrasCierre` | S2 | S16 |
| `CierreFacturaDetalle` (audiencia mensajero, modal de `/cierre-dia`) | `DetalleCierre` audiencia mensajero | S10 | S16 |
| Impresión del detalle del admin (`HojaFactura`/`HojaResumen` de `cierre-factura.tsx`, `@media print` del flujo, ficha 223) | «Descargar» (`DescargarDatasetButton`) | S2 | S16 (la hoja del mensajero cae con S10) |
| `GestionesPorResultado` (5 pestañas + fila desplegada) | `GestionesCierre` + `FilaGestion` | S3, S10 | S16 |
| `CierreFacturaResumen`, `CierresAdminHistoricoLista.tsx`, `ListaComprobantes.tsx` (tarjetas de cola) | `ColaCierres` | S4 | S16 |
| Cuerpo del modal «Detalle del cierre de bodega», `TotalesPanel`/`TotalesIngresoPanel` y bloques por cierre del día de `CierresBodegaAdminModule.tsx` | `DetalleCierre` tipo bodega | S6 | S16 |
| `CierresBodegaSolicitadosLista.tsx`, `CierresBodegaResueltosLista.tsx` | `ColaCierres` bodega · central | S7 | S16 |
| `ConsolidacionBodegaModule.tsx` (A consolidar / Solicitados) | `ColaCierres` bodega · satélite | S8, S9 | S16 |
| Paneles de `/cierre-dia` (Totales del día, Ganancia, secciones por resultado, `PanelCorreccion`, «Cierres solicitados») | `DetalleCierre` página + `ColaCierres` rol mensajero | S10, S11 | S16 |
| Fila desplegada de `ConciliacionSatelite.tsx` | dos `Cuenta` + enlace al detalle | S17 | — (se edita en sitio) |
| Botones «Ver evidencia 1…n» (`botones-evidencia.tsx`) y los dos visores | un botón + `VisorEvidencia` | S5 | S16 |
| `CascadaDinero.tsx` | `Cuenta.tsx` | S2-S6 | S16 |

### Qué se reutiliza tal cual

`BuscadorFiltros` (vía `FiltrosCierresBarra`), `DescargarDatasetButton`, `Modal`, `Dialog` de
`components/ui`, `CierresTabs` (conmutador), `EstadoCierreBadge`, `estadoConciliacionDe`,
`esMontoCero`, `esMontoNegativo`, `money()`, los `*_LABEL` existentes, `ConciliacionAcciones`,
`PagoMensajeroSeccion`, `PagosRegistradosTabla`, `RegistrarPagoDialog`, `AnularPagoDialog`,
`DesglosePagoField`, `EscanerGuiaCard` y el cuerpo de la confirmación física, `MarcaAjustado`,
`RetieneReprogramadasBadge`, `PendienteLiquidarBadge`, `DesglosePorTienda` (`marcaDeVariasTiendas`),
`hrefDetalleCierre`, `avisoBloqueo`, `construirDescarga` con `hojasAdicionales` (464). Se mueven sin
cambiar ni una línea `lineasCascadaCentral` y `lineasCascadaDueno` a
`app/(app)/cierres-admin/_components/cascadas-bodega.ts` (S1).

## De dónde sale cada cifra

### Cifras que ya llegan (sin cambios de servidor)

| Cifra | Campo |
|---|---|
| Recaudado + métodos | `totales.{general,efectivo,simpe,transferencia}` |
| Se le paga hoy a la tienda / A la tienda hoy | `pagoTienda` |
| ganan en total / Gana en total | `ganaLaTienda`, `partesPorTienda[].ganaLaTienda` |
| Se lo cobra la empresa / Sale de lo recaudado | `cobradoSobreRecaudado` |
| Debe llegar a la central / A la central (bodega y por cierre del día del detalle) | `paraLaCentral`, `cierres[].paraLaCentral` |
| Pago al mensajero / a mensajeros / Tu ganancia | `totalPagoMensajero` |
| Pago a la bodega / Gana la bodega satélite | `totalIngresoBodegaRechazos` |
| Facturado por concepto, Total facturado | `totalesIngreso.{fleteConIva,comisionConIva,fleteDevolucionConIva,total}` |
| − IVA | `ivaFacturado` |
| Le queda a la empresa | `netoEmpresa` |
| Conciliación | `montoRecibido`, `faltaPorRecibir`, `conciliadoAt`, `conciliadoPorNombre`, `conciliadoNota`, `desmarcable` |
| Pago entregado | `pendientePagoMensajero` (`null` = no aprobado) |
| A consolidar: Recaudado, Pago a mensajeros, Gana la bodega, La central debe | `totalesAgregados`, `totalPagoMensajeroAgregado`, `totalIngresoBodegaRechazosAgregado`, `totalCentralDebeAgregado` |
| Fila: recibido, métodos, cobro y conceptos, pago, ajuste, fulfillment | `montoRecibido`, `pagos[]`, `ingresoEmpresa.*`, `pagoMensajero`, `ajustesPago[]`, `ingresoEmpresa.{fulfillment,ivaFulfillment}` |
| Fila: tarifa del modelo viejo | `ingresoEmpresa.tarifa` + `esCentral` + `*Origen` (como hoy) |
| Mensajero: Gestiones, Tu ganancia, Recaudado | `listarCierreDia` (grupos, `totalPagoMensajero`, `totales`) |

**Desaparece de la pantalla:** `ganancia` (y con ella «Debe», D3). Sigue en el contrato.

### Cifras nuevas (nota p1): se derivan en el servidor

Todas con `Prisma.Decimal` en el servicio y emitidas como string de escala 2 (conteos y porcentajes
como enteros). Ninguna escribe nada.

| Cifra (R) | Derivación | Dónde |
|---|---|---|
| Reparto en % (R70) | Porcentajes enteros por **mayor resto** (suman 100) de las partes sobre `totales.general`. Mensajero: [`pagoTienda`, `cobradoSobreRecaudado`]. Bodega: [`paraLaCentral`, `totalPagoMensajero`, `totalIngresoBodegaRechazos`]. `null` si `general` ≤ 0 o alguna parte < 0. Empate de restos: gana la primera parte. | util puro nuevo `lib/utils/porcentajes-reparto.ts`; lo llaman `CierresAdminService.verCierreDetalle` y `CierresBodegaAdminService.verDetalle` |
| Señales de la cola (R70) | Por cierre de la página: nº de `incidente` con `indemnizacion IS NULL`, nº de gestiones con al menos un ajuste de pago, nº de gestiones retornables (`gestion-retorno.ts`). Una sola consulta agregada por página, patrón `contarPorCierre`. | `CierresAdminRepository` + servicio |
| Debe llegar a la central, A consolidar (R67) | `paraLaCentral(totalesAgregados.general, totalPagoMensajeroAgregado, totalIngresoBodegaRechazosAgregado)` y, por cada `CierreBodegaResumenLite`, `paraLaCentral` de sus propios snapshots. Misma función de `lib/utils/ingreso-empresa.ts`. | `ConsolidacionBodegaService` (`ICierreBodegaService`) |
| Tarjetas de Solicitados (R68) | Por llegar = Σ `paraLaCentral` con `conciliado = false`; Recibido (30 días) = Σ `montoRecibido` con `conciliadoAt` en los últimos 30 días calendario; Falta = Σ `faltaPorRecibir` > 0 con `conciliado = true`. Con sus conteos. Zona del actor; sin filtro de fecha. | `CierreBodegaRepository` + `ConsolidacionBodegaService` |
| Ganancia pendiente de pago (R69) | Σ `pendientePagoMensajero` de los cierres `aprobado` del mensajero (misma `derivarPendienteCierre` y `sumarVigentesPorCierre` de la cola) y nº de cierres con pendiente > 0. | `CierreDiaService` |
| Ganancia pagada este mes (R69) | Σ montos de los pagos **vigentes** al mensajero con fecha del pago en el mes en curso; nº de pagos. | `CierreDiaService` + repositorio de pagos de liquidación |
| Tarifa de cada concepto, modelo nuevo (R64) | Lectura de `cierre_detail_concepto` (`modo`, `valor`, `iva_pct`, `nivel`) + nombre de grupo/zona de su `tarifa_valor`. La base de un porcentaje es la que usa `derivarIngresoOrden` para ese concepto (T0 de S12 la confirma con la línea). | repositorios del detalle (mensajero y bodega) |
| IVA incluido en el cobro (R65) | `ivaFlete` + `ivaComisionCod` + `ivaFleteDevolucion` de la gestión. | servicios del detalle |
| Fulfillment «Se cobró» y fecha del cargo (R65) | `fulfillment` + `ivaFulfillment`; fecha = `created_at` del último movimiento `cargo` sin reverso posterior de la orden en `orden_fulfillment_movimiento`. Solo para audiencia central. | servicios del detalle |
| Pago por tarifa y ajuste (R66) | `gestion_pago_congelado.importe` (actor mensajero) con `modo`/`nivel`/`valor`; ajuste = `pagoMensajero` − importe, con signo. T0 de S12 confirma que un ajuste (SLT-56) no re-congela `importe`; si lo hiciera, el «por tarifa» sale del `anterior` del primer ajuste. | servicios del detalle |
| Sin tarifa de pago en admin (R66) | `tarifaFaltante` real (hoy llega `false` en admin), con la misma regla que `/cierre-dia`. | `CierresAdminService` |

### Números escritos a mano para los tests

Escenario «cierre de mensajero, modelo viejo» (S1 los usa en dobles; S2 los siembra en E2E):

| Dato | Valor |
|---|---|
| Efectivo / SINPE / Transferencia | 70 000,00 / 30 000,00 / 0,00 → Recaudado **100 000,00** (Transferencia no aparece) |
| Flete con IVA | 4 520,00 (4 000,00 + 520,00) |
| Comisión COD con IVA | 1 130,00 (1 000,00 + 130,00) |
| Sale de lo recaudado | **5 650,00** |
| Se le paga hoy a la tienda | 100 000,00 − 5 650,00 = **94 350,00** |
| Flete de no entrega con IVA | 2 260,00 (2 000,00 + 260,00) |
| Total facturado | 4 520,00 + 1 130,00 + 2 260,00 = **7 910,00** |
| IVA facturado | 520,00 + 130,00 + 260,00 = **910,00** |
| Pago al mensajero / Pago a la bodega | 3 000,00 / 500,00 |
| Le queda a la empresa | 7 910,00 − 910,00 − 3 000,00 − 500,00 = **3 500,00** |
| Gana la tienda en total | 100 000,00 − 7 910,00 = **92 090,00** |
| Reparto (S13) | 94,35 % / 5,65 % → **94 % / 6 %** |

Escenario «cierre de bodega» con los mismos números agregados: Debe llegar a la central =
100 000,00 − 3 000,00 − 500,00 = **96 500,00**; reparto 96,5 % / 3 % / 0,5 % → **97 % / 3 % / 0 %**
(empate de restos 0,5: gana la primera).

Escenario «gestión del modelo nuevo» (S12): flete monto fijo 3 500,00 + IVA 13 % 455,00 =
**3 955,00**; comisión 2 % de 25 000,00 = 500,00 + IVA 65,00 = **565,00**; se le cobra **4 520,00**,
de eso IVA **520,00**; pago por tarifa 2 500,00, ajuste −700,00, se le paga **1 800,00**; fulfillment
600,00 + IVA 78,00 = **678,00**.

Un caso negativo: `netoEmpresa` = −250,00 se pinta «−₡250,00» (o la forma de `money()`), nunca 0.

## Excel (S15) — propuesta para aprobar (PA3)

**Regla de formato (R73-R75):** el modelo de cada cierre sale de `cierre_detail.tarifa_modelo`
(`incluyeModeloNuevo` en los resúmenes; `tarifaModelo` por fila de gestión). Solo viejo → formato
actual, idéntico byte a byte en columnas, títulos y claves. Solo nuevo → documento nuevo. Mixto →
libro con las hojas del documento nuevo (cierres del modelo nuevo) seguidas de «Cierres modelo
anterior» y «Gestiones modelo anterior» con el formato actual (cierres del viejo); ningún cierre en
dos hojas del mismo tipo. Hoy en prod todo es viejo (D19): el formato actual es el que se usa.

**Documento nuevo (modelo nuevo):**

| Hoja | Una fila por | Columnas |
|---|---|---|
| Cierres | cierre | Folio · Mensajero (o Bodega) · Destino · Estado · Solicitado · Resuelto · Efectivo · SINPE · Transferencia · Recaudado · Se le paga a la tienda (mensajero) / Debe llegar a la central (bodega) · Gana la tienda en total · Pago al mensajero · Pago a la bodega satélite · Total facturado · IVA facturado · Le queda a la empresa · Gestiones · Pagos ajustados · Pago entregado (solo central) · *bodega:* Cierres incluidos · Recibido · Falta por recibir · Estado de conciliación · Conciliado por · Conciliado el |
| Gestiones | gestión | Folio del cierre · Mensajero · Fecha de gestión · Nº Guía · Nº Remisión · Destinatario · Tienda · Resultado · Motivo · Recibido · Efectivo · SINPE · Transferencia · Flete por entregado · Tarifa del flete · IVA del flete · Comisión COD · Tarifa de la comisión · IVA de la comisión · Flete de no entregadas · Tarifa del flete de no entregadas · IVA del flete de no entregadas · Se le cobra a la tienda · De eso, IVA · Pago por tarifa · Tarifa del pago · Ajuste · Pago al mensajero · Motivo del ajuste · Ajustó · Gana la bodega satélite · Fulfillment · IVA de fulfillment · Fulfillment cargado el (las tres solo central) · Señales |
| Por tienda | cierre × tienda | Folio · Tienda · Recaudado · Se le paga hoy · Gana en total |
| Rechazados por la tienda | rechazo | Folio · Nº Guía · Destinatario · Motivo · Tienda · Fecha del rechazo |

«Tarifa de …» = texto «<modo> <valor> · <nivel> · <grupo o zona>» (p. ej. «Monto fijo ₡3.500,00 ·
grupo · San José centro»). Los importes van como en las descargas de hoy (mismo formateador de
celda). La satélite no recibe las columnas de fulfillment ni «Pago entregado». La descarga del
mensajero en `/cierre-dia` no cambia de documento; solo gana «Ganancia» en Incidente (R58).

## Trato «tú» (S5)

Se cambian los textos, no las claves ni la lógica. Alcance: los labels de
`app/(app)/cierres-admin/_components/*-labels.ts`, `cierre-labels.ts`, `pago-mensajero-labels.ts`,
los literales de `CierresAdminModule.tsx`, `CierreDiaModule.tsx`, `ConsolidacionBodegaModule.tsx`,
`components/shared/liquidacion/liquidacion-labels.ts`, `components/shared/conciliacion/*`,
`lib/constants/bloqueo-mensajero.ts`, y los mensajes de `CierreDiaService` y
`ConsolidacionBodegaService` que la pantalla muestra (con tildes: «No tienes gestiones…», «se envió a
aprobación»). Guardia nueva `tests/unit/guards/cierres-trato-tu.guardia.test.ts`: recorre ese censo
y falla con una lista de formas de voseo (`\b(tenés|podés|indicá|resolvé|intentá|iniciá|escaneá|
confirmá|rechazá|escribile|contactá|avisá|revisá|gestionalos)\b` y similares), con una contraprueba
que la pone en rojo.

## Verificación de lo que ve el usuario

- **Componentes (S1):** dobles con los números de arriba; se leen del DOM con literales escritos en
  el test, nunca con la función que los produce (memoria «aserción contra su propia fuente»).
- **E2E por rol, ambos modelos (R77):** `e2e/cierres-rediseno.spec.ts`, sembrado con
  `e2e/_escenarios/cierres.ts` (un cierre del modelo viejo y uno del nuevo activando tarifas como
  `e2e/tarifas-activacion.spec.ts`):
  - central (S2): 4 cifras, métodos, dos cascadas, sin «Debe», pie visible tras desplazar, Aprobar;
  - satélite (S2, S9): mismas cifras, sin «Pago al mensajero» ni fulfillment; su cierre de bodega;
  - mensajero (S10, S11): 3 cifras, sin dinero de la empresa, «Ganancia» en Incidente;
  - fila (S3, S12): modelo viejo con la tarifa congelada de hoy; modelo nuevo con la tarifa del
    concepto.

  Cada rebanada amplía el mismo archivo con su `describe`.
- **Mutación antes de creer el verde:** cambiar `netoEmpresa` por `ganancia` en `cifrasDe` y el
  `WHERE` de alcance de S9 deben poner rojo su test.
- **Antes de promover:** Carlos aprueba cada rebanada en Preview (memoria del proyecto), con
  capturas de un cierre real al lado del detalle viejo.

## Alternativas descartadas

1. **Reescribir `CierreFacturaDetalle` en su sitio.** Arrastra la hoja de impresión y su guardia y
   una docena de tests que la protegen, y mezcla tres audiencias en un archivo de 2 849 líneas. Un
   componente nuevo se monta por rebanada y el viejo se retira al final (S16).
2. **Un componente por rol o por tipo** (detalle de central, de satélite, de mensajero). Contradice
   D1 y D15: «componentes iguales con props distintas, nunca uno por rol».
3. **Calcular en el cliente las cifras que faltan** (porcentajes, IVA incluido, fulfillment con IVA,
   sumas de las tarjetas). Rompe la regla money-safe (`liquidacion-money-safe`, 395): se derivan en
   el servidor (S12-S14).
4. **Mover los diálogos y sus Server Actions dentro del detalle.** Mueve lógica de aprobar en
   rebanadas que son de presentación. Los diálogos se quedan en los módulos; el detalle dispara
   callbacks.
5. **Reutilizar `CascadaDinero` para D16.** Pinta el operador pegado al importe («−₡3.000»); el
   canvas lo pone delante de la partida («− Pago al mensajero … ₡3.000»). Cambiarla movería a la
   vez las pantallas viejas que la usan. `Cuenta.tsx` nace con el formato aprobado y `CascadaDinero`
   se borra en S16.
6. **Un solo PR con `tamano-pr-aceptado`.** ~300 archivos y miles de líneas: imposible de revisar.
   Se parte en 17 rebanadas (D9).

## Dependencias de terceros

Ninguna nueva. Se usan `Dialog`, `Tabs` y `Badge` de `components/ui` y `exceljs` (ya aprobado) vía
`construirDescarga`.
