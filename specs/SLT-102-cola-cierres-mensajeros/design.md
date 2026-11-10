# SLT-102 «Cola de cierres única: mensajeros (central y satélite)» — design

> 2026-11-10. Baja a ejecutable el plan S4 del spec madre (`specs/SLT-95-detalle-cierre-rediseno/
> design.md > 2. Cola de cierres — ColaCierres`, `> Props → quién las usa` filas «Cola · mensajero
> · central / satélite», `> Qué sustituye cada componente`; `tasks.md > Plan de las demás
> rebanadas > S4`). Hereda de él, sin repetirlo, la arquitectura de los cuatro componentes, la
> autorización y las alternativas descartadas 1-6. Aquí está solo lo que S4 decide.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «cola», «cierres del día», «pendientes», «resueltos», «pago
  entregado», «señales», «registrar pago»;
- `specs/`: «ColaCierres», «Pendientes de decisión», «Pago entregado», «Bloqueante hasta
  re-solicitud», «Mensajero bloqueado», «Retiene», «columnasCola»;
- código (Grep/Read; el índice del grafo de este worktree no existe — `index_status` responde
  «project not found» —): `CierresAdminModule`, `CierresAdminHistoricoLista`, `ListaComprobantes`,
  `CierreFacturaResumen`, `AccionesCola`, `FiltrosCierresBarra`, `BuscadorFiltros`,
  `DescargarCierresButton`, `DataTable`, `Tabs` (`components/ui/tabs`), `SegmentedToggle`,
  `PanelConmutado`, `CierresTabs`, `AppPage`, `MensajeroBloqueadoBadge`,
  `RetieneReprogramadasBadge`, `RechazadoBloqueanteBadge`, `PendienteLiquidarBadge`,
  `hayPendienteDeLiquidar`, `RegistrarPagoMensajeroDialog`, `EstadoCierreBadge`, `folioDe`,
  `fechaHora`, `modoAdminDe`, `contarPorCierre`, `RESULTADOS_QUE_VUELVEN`,
  `CatalogoFiltrosCierresDTO`.

**Resultado:**
- **Board:** ninguna ficha hace esto. Hermanas: SLT-105 «Cola de bodega de la central: Por conciliar
  y Conciliados», SLT-106 «Bodega satélite: A consolidar con la cola única» y SLT-108 «/cierre-dia:
  detalle y cola únicos para el mensajero» montarán el mismo `ColaCierres` con otro `tipo`/`rol`;
  SLT-111 «Cifras del servidor: reparto en % y señales de la cola» tiene hoy los conteos de señales
  (PA1). `components/private/cierres/cola/` no existe.
- **Specs que fijaron lo que la cola pinta hoy y S4 respeta:** 38 (cola + histórico), 109/R31
  (rechazado bloqueante), 111 (destrabar un vencido), 170 (paginación en el servidor, contador del
  `total`), 172 (pendiente de liquidar, registrar pago), 184 (descargas por pestaña), 271/R48
  (mensajero bloqueado en la fila), 386 (filtro de estado), 462 (reprogramadas retenidas, «una
  mutación por superficie»), pedido humano del 2026-08-16 (pestañas, una barra para las dos listas,
  descarga alineada).
- **Código que se reutiliza tal cual:**
  - `components/shared/DataTable.tsx`: la tabla genérica de la app (cabecera, `align: "right"` para
    dinero, vacío, error, carga, scroll horizontal). Sin props nuevas.
  - `components/ui/tabs.tsx` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`), con las mismas
    clases de subrayado que ya usa `DetalleCierre.tsx:259-279`: es la pestaña del canvas.
  - `FiltrosCierresBarra` (`BuscadorFiltros` + `FilterComponent`), sin cambios, y
    `DescargarCierresButton` (→ `DescargarDatasetButton`), sin cambios.
  - `Pagination`, `EstadoCierreBadge`, `RegistrarPagoMensajeroDialog`, `money()`,
    `hayPendienteDeLiquidar`, `PAGO_MENSAJERO_TEXTO.sinPendiente` («Liquidado»),
    `MENSAJERO_BLOQUEADO_LABEL` + `notaMensajeroBloqueado`, `RECHAZADO_BLOQUEANTE_LABEL` +
    `RECHAZADO_BLOQUEANTE_NOTA`, `retieneReprogramadas` + `notaRetieneReprogramadas`, `folioDe`,
    `fechaHora`, `modoAdminDe`, `descargaColaCierres`, `descargaHistoricoCierres`,
    `PAGINACION_HISTORICO_LABEL`, `CierresTabs`.
  - Datos: `CierreAdminResumen` ya trae todo lo de R33-R35 (`mensajeroNombre`, `estado`,
    `solicitadoAt`, `resueltoAt`, `totales.general`, `totalPagoMensajero`,
    `pendientePagoMensajero`, `bloqueoMensajero`, `reprogramadasRetenidasHoy`). **Sin cambios de
    servidor** salvo PA1.
- **Lo que existe y no sirve tal cual:**
  - `ListaComprobantes` + `CierreFacturaResumen`: cada cierre es una tarjeta-comprobante, no una
    fila de tabla; la comparten las colas de bodega, que no cambian aquí. Se deja de montar solo en
    `CierresAdminModule`.
  - `SegmentedToggle` + `PanelConmutado` como pestañas: el canvas dibuja un `tablist` con
    subrayado, y Carlos pidió no usar `SegmentedToggle` (S3-4). Se sustituyen por `Tabs`.
    `CierresTabs` (el conmutador Bodega/Mensajero) **no** se toca (R37).
  - Los badges de señales (`MensajeroBloqueadoBadge`, …) pintan pastillas; el canvas pinta texto
    ámbar unido por « · ». Se reutilizan sus **textos y notas**, no el componente.
  - `PendienteLiquidarBadge` pinta solo el importe; el canvas y R34 piden «Pendiente <monto>».
    Se reutiliza `hayPendienteDeLiquidar`, no el badge.

## Fidelidad al canvas («sé fiel al diseño»)

Recorrido de `ColaCierres.dc.html` (rama `tipo` mensajero, líneas 137-162) con `rol` central
(«Central 1» y «Central 3») y satélite («Satélite 1»).

**Lo que se pinta como el canvas:**

| # | Canvas | Spec |
|---|---|---|
| F1 | Pestañas `tablist` subrayadas «Pendientes 3» / «Resueltos 12», nombre «Cierres del día por estado» | R99, con `Tabs` |
| F2 | Barra de hoy entre pestañas y tabla, «Descargar» a la derecha de la misma fila | R100 |
| F3 | Columnas Folio · Mensajero · Solicitado/Resuelto · Estado · Recaudado · Pago al mensajero · (Pago entregado) · Señales · acciones | R33, R34 |
| F4 | Folio «#8F2A11C4» monoespaciado; importes a la derecha; estado en pastilla | R101 |
| F5 | Señales como texto ámbar pequeño unido por « · » | R102 |
| F6 | «Ver / decidir» principal (negro); «Ver» y «Destrabar» secundarios (borde); «Registrar pago» principal | R105 (variantes `default` / `outline` del `Button`) |
| F7 | «Pago entregado»: «Pendiente ₡47.500,00», «Liquidado», «—» | R103 |
| F8 | Satélite: misma cola, sin «Pago entregado» ni «Registrar pago» | R34 |
| F9 | Descripción por rol en «tú» | R106 (zona: PA3) |
| F10 | Pie de Pendientes «Un cierre vencido se puede destrabar como excepción.» | R106 |
| F11 | Sin tarjetas de cifras en la cola de mensajeros | R32 (alcance) |
| F12 | Pastilla de estado con el color del canvas: «Solicitado» ámbar, «Aprobado» verde, «Rechazado» y «Vencido» rojo (decisión de Carlos 2026-11-10; `EstadoCierreBadge` con los tokens `warning`/`success`/`danger`, el detalle lo hereda) | R101 — igual al canvas |
| F13 | Barra con Fecha de solicitud · Mensajero · Estado, sin «Bodega» (enmienda de R100, Carlos 2026-11-10) | R100 — igual al canvas |

**Desviaciones que se conservan, con su motivo:**

| Canvas | Se pinta | Por qué |
|---|---|---|
| «Cierres del día» dentro del componente | el título de `AppPage` | Un solo `h1` por página; el componente no repite el título (R32, alcance). |
| Conmutador a la derecha del título | donde está hoy, encima de la cola | R37 y PA2. |
| «1 incidente sin indemnizar · 6 vuelven a bodega», «1 pago ajustado» | solo si PA1 = sí | El servidor no emite esos conteos por fila (R70, SLT-111). |
| `aria-label="Cierres resueltos"` en la tabla de Resueltos | región «Histórico» | No se ve; es el nombre que localizan 4 E2E y los tests (R104). |
| «Mostrando 3 de 12 · 10 por página» | `Pagination` de hoy («1-10 de 12» + tamaño de página) | Es el control paginado de la ficha 170 que vigilan `contadores-cabecera` y `paginacion-transversal`. |
| «07/11 18:42» | «2026-11-07 18:42» (`fechaHora`) | Formateador del detalle; ningún formateador «dd/MM» existe y no se inventa uno: SLT-92 unifica fechas. |
| «₡285.275,00» | `money()` de hoy | Formateador compartido (moneda del país). |
| «Destrabar» (rótulo) | «Destrabar» visible, nombre accesible «Destrabar cierre vencido abandonado de <mensajero>» | Conserva el nombre de hoy (feature 111, E2E `reglas-bloqueos-cierre`). |
| Placeholder «Usa los filtros…» | «Usá los filtros…» | `FiltrosCierresBarra` la comparten las mitades de bodega; el trato «tú» de lo reutilizado es de SLT-103. |
| — (no dibuja) destino, métodos, ingreso de bodega, «Ver detalles», motivo de rechazo | no van (R108) | Regla de Carlos en SLT-101 PA2; PA5. Siguen en el detalle. |

## Arquitectura

```
components/private/cierres/cola/ (pantalla, nuevo)
  ColaCierres.tsx          descripción + Tabs + barra + DataTable de la pestaña activa + pie
  cola-cierres-vista.ts    PURO: columnas por (tipo, rol, pestaña), celdas, señales, acciones
  cola-cierres-labels.ts   textos nuevos (trato «tú»): descripciones, pie, «Pendiente », nombres

app/(app)/cierres-admin/
  _components/CierresAdminModule.tsx   monta ColaCierres; quita ListaComprobantes, CierreFacturaResumen,
                                       CierresAdminHistoricoLista, SegmentedToggle y PanelConmutado de la cola;
                                       «Registrar pago» desde la fila
  page.tsx                             sin `description` en AppPage; pasa el nombre de zona (PA3)
```

Mismo patrón que `detalle/` y `fila/`: el `.ts` puro **elige y ordena textos**; los importes son
strings del servidor que solo pasan por `money()`; el `.tsx` pinta.

Si PA1 = sí, además (servidor, `backend_dev`):

```
lib/interfaces/repositories/ICierresAdminRepository.ts   contarSenalesPorCierre(cierreIds)
lib/repositories/CierresAdminRepository.ts               UNA consulta agregada por página
lib/interfaces/services/ICierresAdminService.ts          CierreAdminResumen.senalesCola? (aditivo)
lib/services/CierresAdminService.ts                      conPendiente() la llama una vez por página
```

## `ColaCierres`

Se implementa el subconjunto de props del madre que usan la central y la satélite; `tarjetas`,
`aviso` y `pie.boton` los añaden SLT-106 y SLT-108 cuando los monten (no hay consumidor aquí y no se
construye código sin superficie, guardia `superficie-de-uso`).

```ts
type TipoCola = "mensajero";                 // "bodega" lo añaden SLT-105/106
type RolCola = "central" | "satelite";       // "mensajero" lo añade SLT-108
type PestanaCola = "pendientes" | "resueltos";

interface ColaCierresProps {
  tipo: TipoCola;
  rol: RolCola;
  descripcion: string;                                      // R106
  pestanas: readonly { id: PestanaCola; label: string; conteo: number }[]; // R99: conteo = total del servidor
  pestanaActiva: PestanaCola;
  onPestana: (id: PestanaCola) => void;
  barra: ReactNode;                                          // <FiltrosCierresBarra …/> tal cual (R100)
  descargar: ReactNode;                                      // <DescargarCierresButton …/> de la pestaña activa
  filas: readonly CierreAdminResumen[];                      // la página de la pestaña activa
  cargando: boolean;
  error: string | null;                                      // texto ya redactado (R104)
  vacio: string;                                             // texto del vacío (R104)
  region: string;                                            // «Pendientes de decisión» | «Histórico» (R104)
  acciones: AccionesCola;                                    // callbacks; ausente = no se ofrece
  pie?: string;                                              // R106
  paginacion: ReactNode;                                     // <Pagination …/> de hoy
}

interface AccionesCola {
  abrir: (cierreId: string) => void;                         // «Ver / decidir», «Ver» (R36)
  destrabar: (c: CierreAdminResumen) => void;                // «Destrabar» (R105)
  registrarPago?: (c: CierreAdminResumen, pendiente: string) => void; // solo central con permiso (R34, R103)
}
```

Estructura (de arriba abajo):

1. `<p>` con `descripcion`.
2. `<Tabs value={pestanaActiva} onValueChange={onPestana}>` con `TabsList aria-label="Cierres del
   día por estado"` y un `TabsTrigger` por pestaña con el texto `${label} ${conteo}` (R99). Las clases
   de subrayado son las de `DetalleCierre.tsx:262-268`.
3. Fila `flex` con `barra` (`flex-1`) y `descargar` (`shrink-0`) — **fuera** de los paneles, para que
   cambiar de pestaña no desmonte la barra ni pierda su estado (R99, R100).
4. Un único `TabsContent` (el activo) con `<section aria-label={region}>` y dentro
   `<DataTable ariaLabel={region} columns={…} data={filas} rowKey="cierreId" isLoading={cargando}
   error={error} emptyMessage={vacio} />`.
5. Pie: `pie` (texto) y `paginacion`.

Las columnas `Column<CierreAdminResumen>[]` se construyen en `ColaCierres` a partir de
`columnasCola(tipo, rol, pestana)` (puro), que da `{ id, label, align? }`; el `render` de cada id lo
pone el `.tsx` con las funciones puras de abajo.

## `cola-cierres-vista.ts` (puro)

| Función | Qué devuelve | R |
|---|---|---|
| `columnasCola(tipo, rol, pestana)` | ids y rótulos en el orden de R33/R34: `folio`, `mensajero`, `fecha` («Solicitado»/«Resuelto»), `estado`, `recaudado` (right), `pago` (right), `pagoEntregado` (solo central + resueltos), `senales`, `acciones` (rótulo vacío, `sr-only` «Acciones») | R33, R34 |
| `folioCola(c)` | `#${folioDe(c.cierreId)}` | R101 |
| `fechaCola(c, pestana)` | `fechaHora(c.solicitadoAt)` o `fechaHora(c.resueltoAt)` | R101 |
| `pagoEntregadoDe(pendiente)` | `{ tipo: "nulo" }` («—») · `{ tipo: "liquidado" }` · `{ tipo: "pendiente", monto }` con `hayPendienteDeLiquidar` (comparación de texto, sin `Number`) | R103 |
| `senalesDe(c)` | lista ordenada `{ texto, nota }` de R102 (y R110 si PA1) | R102, R110 |
| `accionesFilaDe(c, rol, pestana, puedeRegistrarPago)` | `["verDecidir"]` (solicitado) · `["ver","destrabar"]` (vencido) · `["ver"]` (resueltos) · `+ "registrarPago"` solo si `rol === "central"`, `puedeRegistrarPago`, `estado === "aprobado"` y pendiente > 0 | R33, R34 |

Ninguna función recibe ni devuelve un número de dinero; los importes viajan como el string del
servidor hasta `money()` en el `.tsx` (R71).

## Montaje en `/cierres-admin` (R107)

`CierresAdminModule` conserva todo su estado y sus lecturas de hoy (filtros, `tab`, páginas y
tamaños de cada lista, `useSWR` de las dos páginas, `refrescarListas`, `abrirDetalle`,
`setDestrabar`). Sustituye el bloque `SegmentedToggle` + `DescargarCierresButton` + dos
`PanelConmutado` (líneas 1157-1299 de hoy) por:

```tsx
<ColaCierres
  tipo="mensajero"
  rol={audiencia === "admin" ? "central" : "satelite"}
  descripcion={descripcionCola(rol, zonaNombre)}
  pestanas={[
    { id: TAB_PENDIENTES, label: TAB_PENDIENTES_LABEL, conteo: colaPendientes.total },
    { id: TAB_RESUELTOS, label: TAB_RESUELTOS_LABEL, conteo: historicoPagina.total },
  ]}
  pestanaActiva={tab} onPestana={setTab}
  barra={<FiltrosCierresBarra catalogo={…} onChange={aplicarFiltros} disabled={…} conEstado />}
  descargar={<DescargarCierresButton resumen={tab === TAB_PENDIENTES ? descargaColaCierres(filtros) : descargaHistoricoCierres(filtros)} … />}
  filas={tab === TAB_PENDIENTES ? colaPendientes.items : historicoPagina.items}
  …
/>
```

- La forma `conteo: X.total` es la que exige `contadores-cabecera.guardia` (`CONTADOR_EN_PESTANA`):
  se escribe en `CierresAdminModule`, que sigue montando `<Pagination>` (ahora también la de
  Resueltos, que hoy vive en `CierresAdminHistoricoLista`).
- **Registrar pago desde la fila (R103).** El estado `ofertaPago` de hoy se generaliza a
  `pagoAbierto: { cierreId, mensajeroNombre, pendiente, trasAprobar: boolean } | null`. Tras
  aprobar se abre con `trasAprobar: true` (comportamiento de hoy, sin cambios); desde la fila, con
  `false`. El `onRegistrado` es el de hoy: `mutate(clavePagosDeCierre(id))` + `refrescarListas()`.
  `registrarPago` solo se pasa a la cola si `puedeRegistrarPago` (permiso resuelto en el servidor).
- `CierresAdminHistoricoLista.tsx` conserva sus exports `descargaHistoricoCierres` y
  `PAGINACION_HISTORICO_LABEL` (los sigue importando el módulo); el **componente**
  `CierresAdminHistoricoLista` queda sin superficie y lleva la anotación `@sin-superficie` («SLT-102
  sustituyó la lista por la cola única; lo retira SLT-115»). Lo mismo para `CierreFacturaResumen` si
  T0.1 confirma que no lo monta otra ruta (hoy: solo esos dos archivos).
- `page.tsx`: quita `description` de `AppPage` (R106: la descripción vieja está en voseo y habla
  de mensajeros también en la mitad de bodega) y pasa a `CierresAdminModule` el nombre de zona de
  PA3 (`zonaNombre: string | null`), resuelto con datos que la página ya tiene (`actor.zonaId` y
  `catalogoFiltros.zonas`), sin lectura nueva.
- El `sinZona` temprano (`CierresAdminModule.tsx:629`) no cambia.

## Señales del servidor (solo si PA1 = sí)

| Campo aditivo en `CierreAdminResumen` | Derivación | Dónde |
|---|---|---|
| `senalesCola?: { incidentesSinIndemnizar: number; pagosAjustados: number; vuelvenABodega: number }` | Por `cierre_dia_id` de la página: nº de gestiones `resultado = 'incidente'` con `indemnizacion IS NULL`; nº de gestiones con al menos un ajuste de pago; nº de gestiones con `resultado IN RESULTADOS_QUE_VUELVEN`. UNA consulta (`groupBy` o `$queryRaw` con `COUNT(*) FILTER`), `WHERE cierre_dia_id IN (…) AND organizacion_id = <empresa>`. | `CierresAdminRepository.contarSenalesPorCierre` + `CierresAdminService.conPendiente` (junto a `contarPorCierre`, mismo patrón: una llamada por página, también con la lista vacía) |

- T0.2 confirma con archivo:línea las tablas y columnas reales (la de ajustes de pago de SLT-56 y
  dónde vive `indemnizacion`) y que el detalle cuenta «Pago ajustado» y «Vuelve a bodega» con la
  misma regla, para que R109 («igual a la lista Gestiones») sea cierto por construcción.
- Opcional en el tipo: los dobles y consumidores de hoy siguen compilando; ausente = la fila no
  pinta esas tres señales (no afirma «0»).
- Sin migración, sin escritura, sin RLS nueva: tablas que ya tienen `organizacion_id` y RLS.
- Test de integración contra la base (memoria «probar el WHERE donde vive»): un cierre con 1
  incidente sin indemnizar, 1 indemnizado, 1 gestión ajustada dos veces (cuenta 1), 2 que vuelven;
  un cierre de **otra empresa** con gestiones que no se cuelan; la mutación «quitar el filtro de
  empresa» o «quitar `IS NULL`» lo pone rojo.

## Autorización

Sin cambios. El rol de la cola sale del mismo predicado que ya decide la audiencia del detalle
(`audiencia === "admin"` ⇔ `esAccesoTotal`, resuelto en `page.tsx`). «Registrar pago» exige
`puedeRegistrarPago` (servidor, `esAccesoTotal`) y la Server Action que registra el pago (la de
hoy, ficha 172) sigue respondiendo `forbidden` a quien no lo tenga: ocultar el botón no es la defensa. La consulta de
PA1 se acota en el `WHERE` por empresa y por los cierres de una página que el servicio ya filtró por
alcance (zona del adminSatelite). Módulo: el de cierres sigue en `nucleo`.

## Modelo de datos, RLS y migraciones

Ninguno. No hay tablas, columnas, índices, RLS ni migraciones; no hay `down.sql`. Con PA1 = sí, solo
una lectura sobre tablas con `organizacion_id` y RLS existentes.

## Datos que dependen del país

- Moneda: solo `money()`.
- Fechas: `fechaHora` (calendario y hora de Costa Rica, `lib/utils/fecha-cr.ts`, como todo el
  módulo); SLT-92 las llevará a la zona de la empresa.
- Ningún impuesto ni método de pago en la cola.

## Tests y guardias que cambian

Censo inicial (T0.1 lo confirma con `grep -l`; si aparece uno más, se añade a `## Archivos
esperados` y se avisa):

- **Componentes que montan `CierresAdminModule` y localizan un cierre por la tarjeta**
  («Comprobante del cierre de …», `Ver detalles del cierre de …`, «Pendiente de liquidar» como
  badge) o por el `SegmentedToggle` (`group` «Cierres del día por estado» + `button`): pasan a
  `getByRole("tab", { name: /^Resueltos/ })` y a la fila (`getByRole("row")` filtrada por el
  nombre del mensajero). Mismo comportamiento vigilado.
- `CierresAdminRetieneReprogramadas.test.tsx`: la mutación «pintar con 0» de la ficha 462 sigue
  siendo una por superficie: la superficie «cola» pasa a ser la celda Señales de `ColaCierres`.
- `CierreAdminBloqueoMensajero.test.tsx` monta `CierreFacturaResumen` suelto: sigue verde sin
  cambios; R102 añade el caso en la cola.
- Guardias: `liquidacion-money-safe` (censo con `cola/`), `contadores-cabecera` (debe seguir verde
  sin cambios; si T0.1 ve que mira `CierresAdminHistoricoLista`, se ajusta la ruta),
  `paginacion-dominios` y `paginacion-transversal` (la paginación de Resueltos pasa al módulo),
  `superficie-de-uso` (anotaciones `@sin-superficie`), `factura-contraste` (si ancla líneas que se
  mueven).
- E2E: un helper `filaDeCola(region, nombre)` en `e2e/_escenarios/cierres.ts` sustituye al par
  «región Pendientes/Histórico → región Comprobante del cierre de X» en los 11 specs que lo usan.
  `tarifas-activacion.spec.ts:330-335` leía «Ingreso de bodega» de la tarjeta de Resueltos de la
  satélite: pasa a leerlo en el detalle (línea «− Ingreso de bodega…» de «De lo facturado, le queda
  a la empresa»), con los mismos importes (570 y 300).

## Verificación de lo que ve el usuario

- **Componente (`tests/components/ColaCierres.test.tsx`)**, con dobles y literales escritos en el
  test (memoria «aserción contra su propia fuente»): central Pendientes (solicitado y vencido con
  bloqueo y retenidas), central Resueltos (aprobado con pendiente `"45000.55"` → «Pendiente » +
  el literal que `money()` da hoy para ese importe, escrito a mano en T0.3; aprobado con `"0.00"` →
  «Liquidado»;
  rechazado → «—» y «Bloqueante hasta re-solicitud»), satélite Resueltos (sin columna ni botón).
- **Módulo (`CierresAdminModule.test.tsx`)**: conteos de las pestañas desde `total` (página de 10 con
  `total` 37 → «Pendientes 37»); cambiar de pestaña conserva el filtro; «Ver / decidir» abre el
  detalle en modo decidir; «Registrar pago» abre el diálogo sin «Ahora no» y al registrar relee.
- **E2E (`e2e/cierres-rediseno.spec.ts`, `describe` de S4)**, base desechable nueva, escenario A:
  la central ve la fila con Recaudado y Pago al mensajero al céntimo (literales de T0.3), aprueba,
  pasa a Resueltos y ve «Pendiente <monto>» y «Registrar pago», registra y ve «Liquidado»; la
  satélite ve su fila sin «Pago entregado» ni «Registrar pago». Si PA1 = sí, además las tres
  señales con su conteo.
- **Mutaciones antes de creer el verde:** mostrar «Registrar pago» a la satélite; contar las
  pestañas con `items.length`; pintar «Retiene 0…»; (PA1) quitar el filtro de empresa del `WHERE`.

## Alternativas descartadas

1. **Seguir con las tarjetas-comprobante y añadirles las columnas.** Contradice el canvas aprobado
   (D18: una tabla con una fila por cierre) y deja dos formas de pintar la misma cola.
2. **Una tabla propia con rejilla CSS, como el canvas y `GestionesCierre`.** Duplicaría lo que
   `DataTable` ya resuelve y vigila (alineación del dinero, vacío, error, carga, scroll horizontal
   medido en la ficha 356) y que comparten 30 listados. La fila de una gestión sí necesita rejilla
   propia (se despliega en tarjetas); la de un cierre no.
3. **Meter la barra en el hueco `filtros` de `DataTable`.** `DataTable` vive dentro del panel de la
   pestaña: cambiar de pestaña desmontaría `FiltrosCierresBarra`, que guarda su selección en estado
   propio, y se perderían los filtros. La barra va fuera de los paneles (R99).
4. **Pestañas con `SegmentedToggle` (lo de hoy).** El canvas dibuja un `tablist` y Carlos pidió no
   usar `SegmentedToggle` (S3-4); `Tabs` ya existe y es el de las pestañas del detalle.
5. **Contar las señales de PA1 en el cliente** leyendo el detalle de cada cierre: N+1 lecturas por
   página y regla duplicada; el madre las deriva en el servidor (D10).
6. **Un componente de cola por rol** (`ColaCentral`, `ColaSatelite`): contradice D15 y S4-2.

## Dependencias de terceros

Ninguna nueva.
