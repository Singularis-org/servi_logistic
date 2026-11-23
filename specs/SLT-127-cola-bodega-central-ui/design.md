# SLT-127 «Cola de bodega de la central con la cola única» — design (C2)

> 2026-11-11. Baja a ejecutable la parte de **pantalla** de la S7 del madre
> (`specs/SLT-95-detalle-cierre-rediseno/design.md > 2. Cola de cierres — ColaCierres`, fila «Cola ·
> bodega · central | Central 7 | S7» y «Qué sustituye cada componente»). El servidor lo dejó listo
> SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» (C1, PR #124).

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «cola», «conciliad», «bodega» en los títulos; «Por conciliar»,
  «cola única» en las descripciones;
- `specs/`: «R127»…«R135», «Por conciliar», «Conciliados», «ColaCierres», «montajesPrevistos»;
- código (Grep/Read: el grafo **no tiene índice** de este worktree — `index_status` responde «project
  not found» —): `ColaCierres`, `columnasCola`, `TipoCola`, `accionesFilaDe`, `TABS_COLA_LABEL`,
  `CierresBodegaAdminModule`, `CierresBodegaResueltosLista`, `CierreBodegaFacturaResumen`,
  `ESTADO_CONCILIACION_LABEL`, `estadoConciliacionDe`, `hayFaltantePorRecibir`, `folioDe`,
  `fechaHora`, `filaDeCola`, `pestanaDeCola`, `CONTADOR_EN_PESTANA`, `@sin-superficie`.

**Resultado:**
- **Board:** ninguna otra ficha hace esto. SLT-105 es C1 (servidor, en `dev`). SLT-106 «Bodega
  satélite: A consolidar con la cola única» y SLT-107 «Bodega satélite: Solicitados y su cierre de
  bodega en lectura» (`pending`) añadirán a `ColaCierres` el `rol` satélite de bodega: tocarán los
  mismos tres archivos de `components/private/cierres/cola/` **después** (dependen de esta forma).
  SLT-115 «Retirar los componentes de cierre sustituidos» borra lo que aquí queda sin montar.
- **Specs:** los R127-R135 solo existen como lista en `SLT-105 > Fuera de alcance`; se copian aquí.
- **Código que se reutiliza tal cual:**
  - `ColaCierres` (`components/private/cierres/cola/ColaCierres.tsx`): descripción, `Tabs` con conteo,
    barra fuera de los paneles, `DataTable` de la pestaña activa, pie. Hoy solo admite `tipo`
    mensajero (`TipoCola = "mensajero"`, filas `CierreAdminResumen`, `rowKey="cierreId"`, `tablist`
    fijo «Cierres del día por estado»).
  - `FiltrosCierresBarra` con `sinMensajero` (= `BuscadorFiltros`), `DescargarCierresButton`
    (= `DescargarDatasetButton`) con `descargaColaBodega(filtros)` y `descargaBodegaResueltos(filtros)`,
    `Pagination`, `DataTable`, `Badge`.
  - Del dominio: `folioDe`, `fechaHora` (`detalle-cierre-vista.ts`); `ESTADO_CONCILIACION_LABEL`,
    `ESTADO_CONCILIACION_VARIANT`, `estadoConciliacionDe`, `hayFaltantePorRecibir` (`cierre-labels.ts`);
    `money()`.
  - Del módulo de hoy: `abrirDetalle`, `refrescarListas` (revalida las claves
    `cierres-bodega:pendientes` y `cierres-bodega:resueltos`), el `useSWR` de la cola, el detalle único
    de bodega (SLT-104) y `ConciliacionAcciones`.
  - `CierreBodegaResumen` ya trae todo lo que pinta la fila (`zonaNombre`, `solicitadoPorNombre`,
    `solicitadoAt`, `cantidadCierres`, `paraLaCentral`, `montoRecibido`, `faltaPorRecibir`,
    `conciliado`): **no hace falta servidor**.
  - E2E: `filaDeCola(region, nombre)` y `pestanaDeCola(page, nombre)` de `e2e/_escenarios/cierres.ts`.
- **Lo que existe y no sirve tal cual:**
  - `CierresBodegaResueltosLista` pide su página **sin filtros** (`listarHistoricoCierresBodegaPaginado({
    page, pageSize })`) y guarda su `total` dentro: la pestaña no puede contarla (comentario del módulo,
    líneas 355-360) y la barra no la filtra, aunque su descarga sí. R127 y R128 piden lo contrario. La
    Server Action ya acepta `filtros` (mismo `listarCierresBodegaPaginadoSchema` que la cola).

## Zona y capas

Solo **pantalla** (`components/private/cierres/cola/`, `app/(app)/cierres-admin/_components/`) y tests.
Ni repositorio, ni servicio, ni Server Actions, ni `page.tsx` cambian: el Server Component ya pasa
`pendientes` e `historico` pre-cargados (página 1 sin filtros). La ficha es `fullstack` en el board;
el trabajo es de `frontend_dev`.

## Fidelidad al canvas

| Canvas (rama bodega · central) | Lo que se pinta | Por qué |
|---|---|---|
| Descripción, `tabsAria` «Cierres de bodega por estado», pestañas «Por conciliar 3» / «Conciliados 21» | igual | R127, R131 |
| Columnas Folio · Bodega · Solicitó · Solicitado · Cierres · Debe llegar · Recibido · Falta · Estado · (acciones) | igual, mismo orden | R44, R129 |
| «07/11 19:55» | «2026-11-07 19:55» (`fechaHora`) | El formateador de la cola de mensajeros (SLT-102); SLT-92 unifica fechas. |
| «₡438.163,27», Debe llegar en negrita | `money()` + `font-semibold` | R129 |
| Falta «₡0,00» apagada, el resto resaltada | resaltada solo con `hayFaltantePorRecibir`; un negativo (llegó de más) no se resalta | R129 (mismo criterio que la tarjeta y C1) |
| Pastillas P.sol / P.inc / P.ok | `Badge` con `ESTADO_CONCILIACION_VARIANT` (warning / warning / success) | PA6: token de hoy |
| «Ver / conciliar», «Ver / corregir» (principal), «Ver» (secundario) | igual | R130 |
| Pie «Un cierre «Recibido incompleto»…» en Por conciliar; «Mostrando 2 de 21 · 10 por página» en Conciliados | el texto en Por conciliar; en las dos, el `Pagination` de hoy | R131 |
| Placeholder «Folio o bodega» / «Usa los filtros…» | el de `FiltrosCierresBarra` de hoy | Compartido con mensajeros; trato «tú» = SLT-103. |
| — (no dibuja) recaudado, métodos, pago a mensajeros, gana la bodega, quién marcó, nota, modelo nuevo, «Ver detalles» | no van | R134, PA5 |

## Arquitectura

```
components/private/cierres/cola/
  cola-cierres-vista.ts   TipoCola += "bodega"; columnasCola(tipo, …) con la rama bodega;
                          tablistCola(tipo); folioBodegaCola, recibidoCola, faltaResaltada,
                          accionBodegaDe (PURO)
  cola-cierres-labels.ts  textos nuevos de bodega (trato «tú»): descripción, pie, columnas, pestañas,
                          regiones, vacío, error, botones y nombres accesibles
  ColaCierres.tsx         props en unión discriminada por `tipo`; rama de celdas y acciones de bodega

app/(app)/cierres-admin/_components/
  CierresBodegaAdminModule.tsx   monta ColaCierres; sube la página de Conciliados al módulo (SWR con
                                 filtros); quita ListaComprobantes, CierreBodegaFacturaResumen,
                                 CierresBodegaResueltosLista, SegmentedToggle y PanelConmutado
  CierresBodegaResueltosLista.tsx  solo un comentario: el componente queda sin montar; el archivo sigue
                                 vivo por `descargaBodegaResueltos` (lo retira SLT-115)
```

Mismo reparto que SLT-102: el `.ts` puro elige textos y decide qué acción va; los importes son strings
del servidor que solo pasan por `money()` en el `.tsx` (R71).

## `ColaCierres` con `tipo` bodega

Unión discriminada, para que el compilador no deje pasar filas de un tipo con acciones del otro:

```ts
type TipoCola = "mensajero" | "bodega";

interface ColaComun {
  rol: RolCola;                 // bodega: solo "central" en esta ficha
  descripcion: string;
  pestanas: readonly PestanaColaProps[];
  pestanaActiva: PestanaCola;   // ids internos "pendientes" | "resueltos" (bodega: Por conciliar | Conciliados)
  onPestana: (id: PestanaCola) => void;
  barra: ReactNode; descargar: ReactNode;
  cargando: boolean; error: string | null; vacio: string; region: string;
  pie?: string; paginacion: ReactNode;
}

type ColaCierresProps = ColaComun & (
  | { tipo: "mensajero"; filas: readonly CierreAdminResumen[]; acciones: AccionesCola }
  | { tipo: "bodega"; filas: readonly CierreBodegaResumen[]; acciones: AccionesColaBodega }
);

interface AccionesColaBodega {
  abrir: (cierreBodegaId: string) => void;   // las tres acciones de R130 abren el detalle (R40)
}
```

- Los ids de pestaña se conservan (`"pendientes"` / `"resueltos"`): son internos; los rótulos los pasa
  el módulo. Cambiarlos tocaría la rama mensajero sin necesidad (R135).
- El `TabsList` toma su nombre de `tablistCola(tipo)`: «Cierres del día por estado» (mensajero, el de
  hoy; `TABS_COLA_LABEL` se conserva) o «Cierres de bodega por estado» (R127).
- La tabla: un `TablaColaMensajero` (el código de hoy, movido sin cambios de comportamiento) y un
  `TablaColaBodega` (`DataTable<CierreBodegaResumen>`, `rowKey="cierreBodegaId"`). El esqueleto común
  (descripción, `Tabs`, barra fuera de los paneles, `section aria-label={region}`, pie) no se duplica.
- Celdas de bodega: Folio `font-mono`; Bodega; Solicitó y Solicitado en `text-muted-foreground`;
  Cierres, Debe llegar (`font-semibold`), Recibido y Falta `tabular-nums` alineadas a la derecha;
  Falta con `text-warning-strong` solo si `faltaResaltada`; Estado `<Badge variant=…>{label}</Badge>`.
- Acciones de bodega: `Button` (principal) para «Ver / conciliar» y «Ver / corregir»; `Button
  variant="outline"` para «Ver». Las tres con `aria-label` de `L.nombreAccionBodega(accion, bodega)`.

## `cola-cierres-vista.ts` (puro)

| Función | Qué devuelve | R |
|---|---|---|
| `columnasCola("bodega", "central", pestana)` | `folio`, `bodega`, `solicito`, `fecha` («Solicitado»), `cierres` (right), `debeLlegar` (right), `recibido` (right), `falta` (right), `conciliacion` («Estado»), `acciones` (`soloLector`). Igual en las dos pestañas. La rama `"mensajero"` no cambia. | R44, R129 |
| `tablistCola(tipo)` | «Cierres del día por estado» · «Cierres de bodega por estado» | R127 |
| `folioBodegaCola(c)` | `#${folioDe(c.cierreBodegaId)}` | R129 |
| `recibidoCola(c)` | `{ tipo: "nulo" }` («—») si `montoRecibido === null`; si no, `{ tipo: "monto", monto }` con el string tal cual | R129 |
| `faltaResaltada(c)` | `hayFaltantePorRecibir(c.faltaPorRecibir)` (comparación de texto, sin `Number`) | R129 |
| `accionBodegaDe(c)` | `"verConciliar"` (pendiente) · `"verCorregir"` (incompleto) · `"ver"` (recibido), con `estadoConciliacionDe` | R130 |

Un `rechazado` heredado (cero en prod, medido en T0 de C1) llega sin marca: `estadoConciliacionDe` da
«pendiente» y la fila ofrece «Ver / conciliar», que es lo que C1 ya decidió (está en «Por conciliar»).

## `cola-cierres-labels.ts` (textos nuevos de bodega, en «tú»)

| Constante | Texto | R |
|---|---|---|
| `DESCRIPCION_BODEGA_CENTRAL` | «Los cierres que mandan las bodegas satélite. Márcalos recibidos cuando llegue el dinero.» | R131 |
| `PIE_POR_CONCILIAR` | «Un cierre «Recibido incompleto» se queda aquí hasta que la diferencia se reciba o se corrija.» | R131 |
| `PESTANA_POR_CONCILIAR`, `PESTANA_CONCILIADOS` | «Por conciliar», «Conciliados» | R127 |
| `TABS_COLA_BODEGA_LABEL` | «Cierres de bodega por estado» | R127 |
| `REGION_POR_CONCILIAR`, `REGION_CONCILIADOS` | «Cierres de bodega por conciliar», «Cierres de bodega conciliados» | R132 |
| `VACIO_POR_CONCILIAR`, `VACIO_CONCILIADOS` | «No hay cierres de bodega por conciliar.», «Aún no hay cierres de bodega conciliados.» | R132 |
| `ERROR_POR_CONCILIAR`, `ERROR_CONCILIADOS` | «No se pudieron cargar los cierres de bodega por conciliar.», «… conciliados.» | R132 |
| `COLUMNA_BODEGA`, `COLUMNA_SOLICITO`, `COLUMNA_CIERRES`, `COLUMNA_DEBE_LLEGAR`, `COLUMNA_RECIBIDO`, `COLUMNA_FALTA` | «Bodega», «Solicitó», «Cierres», «Debe llegar», «Recibido», «Falta» (Folio, Solicitado, Estado y Acciones ya existen) | R44 |
| `ACCION_VER_CONCILIAR`, `ACCION_VER_CORREGIR` | «Ver / conciliar», «Ver / corregir» («Ver» ya existe) | R130 |
| `nombreAccionBodega(accion, bodega)` | «Ver / conciliar el cierre de bodega de X» · «Ver / corregir el cierre de bodega de X» · «Ver el cierre de bodega de X» | R130 |
| `PAGINACION_POR_CONCILIAR_LABEL`, `PAGINACION_CONCILIADOS_LABEL` | «Paginación de los cierres de bodega por conciliar» / «… conciliados» (PA-P) | — (PA-P) |

## Montaje en `/cierres-admin` › Bodega (R133)

`CierresBodegaAdminModule` conserva el detalle, `abrirDetalle`, `refrescarListas`, los filtros, la cola
(`useSWR(["cierres-bodega:pendientes", page, pageSize, filtros])`) y la descarga. Cambia:

1. **La página de Conciliados sube al módulo**, con el mismo patrón que la cola:
   `useSWR(["cierres-bodega:resueltos", page, pageSize, filtros], () =>
   listarHistoricoCierresBodegaPaginado({ page, pageSize, filtros }))`, `fallbackData = historico` solo
   en página 1, tamaño inicial y sin filtros. **Se conserva la clave `cierres-bodega:resueltos`**: es la
   que revalida `refrescarListas` (R126 de C1) y la que vigila `CierresBodegaAdminRefresco.test.tsx`.
2. `aplicarFiltros` devuelve **las dos** listas a la página 1 (R128). Cambiar de pestaña no toca ni los
   filtros ni las páginas (R127): los dos estados viven en el módulo y la barra está fuera de los
   paneles de `ColaCierres`.
3. Sustituye el bloque `FiltrosCierresBarra` + `SegmentedToggle` + `DescargarCierresButton` + dos
   `PanelConmutado` por:

```tsx
<ColaCierres
  tipo="bodega" rol="central"
  descripcion={L.DESCRIPCION_BODEGA_CENTRAL}
  pestanas={[
    { id: TAB_PENDIENTES, label: L.PESTANA_POR_CONCILIAR, conteo: colaPendientes.total },
    { id: TAB_RESUELTOS, label: L.PESTANA_CONCILIADOS, conteo: conciliadosPagina.total },
  ]}
  pestanaActiva={tab} onPestana={setTab}
  barra={<FiltrosCierresBarra catalogo={catalogoFiltros} onChange={aplicarFiltros} disabled={pendientesCargando} sinMensajero />}
  descargar={<DescargarCierresButton resumen={tab === TAB_PENDIENTES ? descargaColaBodega(filtros) : descargaBodegaResueltos(filtros)} … />}
  filas={tab === TAB_PENDIENTES ? colaPendientes.items : conciliadosPagina.items}
  cargando={…} error={…} vacio={…} region={…}
  acciones={{ abrir: abrirDetalle }}
  pie={tab === TAB_PENDIENTES ? L.PIE_POR_CONCILIAR : undefined}
  paginacion={<Pagination … />}   // la de la pestaña activa, con su ariaLabel
/>
```

- `conteo: X.total` es la forma que exige `contadores-cabecera.guardia` (`CONTADOR_EN_PESTANA`); el
  `<Pagination>` de las dos listas queda en el módulo (`paginacion-dominios`, `paginacion-transversal`).
- `descargaBodegaResueltos` se sigue importando de `CierresBodegaResueltosLista.tsx`; el **componente**
  queda sin montar y lleva el comentario de `CierresAdminHistoricoLista.tsx:120-123` (sin
  `@sin-superficie`: la guardia decide por módulo y el archivo sigue alcanzable). Lo retira SLT-115.
- `CierreBodegaFacturaResumen` sigue montado por `CierresBodegaSolicitadosLista` (satélite) y por
  `CierresBodegaResueltosLista`; `ListaComprobantes` y `PanelConmutado`, por
  `ConsolidacionBodegaModule`. Ninguno queda sin superficie.
- El `<section aria-label="Cierres de bodega satélite">` que envuelve el módulo no cambia.
- **Cambio visible que trae R128:** hoy la lista de «Resueltos» **ignora** los filtros de la barra (su
  descarga sí los aplica). Con la cola, «Conciliados» los aplica a la página y al conteo. Es lo que pide
  R128 («una barra para las dos pestañas»), no un efecto colateral.

## Autorización

Sin cambios. Las dos lecturas siguen siendo `listarPendientesCierresBodegaPaginado` y
`listarHistoricoCierresBodegaPaginado`, que responden `forbidden` a quien no es `esAccesoTotal` antes de
tocar el repositorio; la empresa sale de la sesión (RLS + filtro por escrito de C1). Las acciones de la
fila solo **abren** el detalle; marcar, corregir y desmarcar siguen en `ConciliacionAcciones`, con su
permiso (`puedeConciliar`, resuelto en el servidor) y sus Server Actions de hoy. Módulo: cierres sigue
en `nucleo`.

## Modelo de datos, RLS y migraciones

Ninguno. Sin tablas, columnas, índices, RLS ni migraciones; no hay `down.sql`.

## Datos que dependen del país

- Moneda: solo `money()`.
- Fechas: `fechaHora` (calendario y hora de Costa Rica, `lib/utils/fecha-cr.ts`, como todo el módulo);
  SLT-92 las llevará a la zona de la empresa.
- Ningún impuesto ni método de pago en la fila (R134).

## Tests y guardias que cambian

Censo hecho con Grep el 2026-11-11 (T0.1 lo repite; si sale uno más, se añade a `tasks.md > Archivos
esperados` y se avisa al leader).

- **Abren el detalle con «Ver / decidir el cierre de bodega de Limón»** (pasa a «Ver / conciliar el
  cierre de bodega de Limón»; una o dos líneas cada uno): `CierresBodegaAdminDetalleUnico`,
  `CierresBodegaAdminRefresco`, `CierreBodegaDetalleCascadas`, `CierreBodegaDesglosePorTienda`,
  `CierreBodegaDetalleGestiones`, `cierre-detalle-ajuste-badge`, `DineroIdentidadesEnPantalla`.
  `CierresBodegaAdminDetalleUnico` además pasa de `group` + `button /^Resueltos/` a
  `tab /^Conciliados/` y de «Ver el cierre de bodega resuelto de Limón» a «Ver el cierre de bodega de
  Limón».
- **Descarga:** `CierresDescarga` (`pestana: /^Resueltos/` de las dos entradas de bodega →
  `/^Conciliados/`; su `abrirPestana` ya prueba `tab` antes que `button`), `CierresDescargaColumnas`
  (la entrada de bodega), `CierresBodegaDescargaDetallada` (`button /^Resueltos/` → `tab
  /^Conciliados/`). Los nombres «Descargar Cierres de bodega pendientes/resueltos» **no** cambian (PA4).
- **Paginación:** `ColasPaginacion` y `BajoRiesgoPaginacion` (región, `rol` `list` → `table`,
  `contadorEn` = `tablist`, pestaña, etiqueta de paginación), `paginacion-transversal` (la entrada
  «Cierres de bodega resueltos» pasa a `ruta` del módulo y a la constante nueva).
- **Guardias:** `cascada-central-en-las-dos-pantallas` (las superficies que montan la tarjeta de bodega
  pasan de tres a dos: sale `CierresBodegaAdminModule.tsx`); `censo-tablas.ts` (R133);
  `cierre-bodega-vocabulario` **solo si** T0.3 la ve roja (el módulo sigue montando
  `ConciliacionAcciones`, que es lo que su caso 431/T18 busca). Siguen verdes sin cambios:
  `contadores-cabecera` (la forma `conteo: X.total` se conserva), `liquidacion-money-safe` (ya censa
  `cola/`), `superficie-de-uso`, `cobertura-tablas`.
- **Sin cambios y deben seguir verdes (R135, R37):** `ColaCierres.test.tsx`,
  `CierresAdminModule.test.tsx`, `CierresAdminPage.test.tsx` y los tests de componente que montan
  `CierreBodegaFacturaResumen` o `CierresBodegaResueltosLista` sueltos (`CierreBodegaTarjetaCascada`,
  `CierreBodegaMarcaConciliacion`, `CierreFacturaFechaCR`, `DeudasD39D40ModeloEnPantalla`).
- **E2E:** `e2e/_escenarios/cierres.ts` gana `pestanaDeColaBodega(page, "Por conciliar" |
  "Conciliados")` y `regionColaBodega(page, "Por conciliar" | "Conciliados")`; con ellos y
  `filaDeCola` se reescriben los selectores de `cierre-bodega-satelite.spec.ts` (≈12 sitios, incluido
  el describe de C1), `cierres-rediseno.spec.ts:777-778` y `ajuste-pago-mensajero-cierre.spec.ts:294-295`.

**Centralizar selectores (lo que pidió el leader para bajar tamaño):** en los E2E sí ahorra (≈12 sitios
en un archivo pasan a dos helpers). En los tests de componente **no**: cada archivo cambia un único
literal, y un helper añadiría un archivo y una línea de `import` por test sin quitar ninguna. Además,
esos nombres son el contrato (memoria «Literal: contrato o polizón»): se quedan escritos en el test.

## Verificación de lo que ve el usuario

- **Componente (`tests/components/ColaCierresBodega.test.tsx`, nuevo)**, con dobles y literales escritos
  a mano en el test (memoria «Aserción contra su propia fuente»): tres filas como las del canvas —
  pendiente (`montoRecibido` null, `faltaPorRecibir` = `paraLaCentral`), incompleto (`"334100.00"` de
  `"349100.00"`, falta `"15000.00"`), recibido (falta `"0.00"`) — y un llegado de más (falta
  `"-500.00"`). Comprueba las 9 cabeceras en orden, «—» y no «₡0,00» en Recibido sin marca, la Falta
  resaltada solo en el incompleto, la pastilla con su texto y sin «Aprobado», las tres acciones con su
  nombre accesible y su variante, descripción, pie por pestaña, región, vacío y error. Los importes en
  pantalla, con el literal que `money()` da hoy escrito a mano en T0.2.
- **Módulo (`tests/components/CierresBodegaAdminCola.test.tsx`, nuevo):** conteos desde `total`
  (página de 10 con `total` 37 → «Por conciliar 37»; `total` 21 → «Conciliados 21»); arranca en «Por
  conciliar»; filtrar por bodega llama a **las dos** lecturas con el filtro y `page: 1`; cambiar de
  pestaña conserva el filtro y la página; el `tablist` existe y el `group` segmentado no; «Descargar»
  es el de la pestaña activa.
- **E2E (`e2e/cierre-bodega-satelite.spec.ts`)**, base desechable nueva: el describe de C1 adaptado
  recorre pendiente → marcar 6.000 de 7.000 → la fila sigue en «Por conciliar 1» como «Recibido
  incompleto» con «Ver / corregir» y Falta ₡1.000 → corregir a 7.000 → «Por conciliar 0», y en
  «Conciliados 1» la fila con «Recibido» y «Ver». Cubre R44, R126 (C1) y R130 de punta a punta.
- **Mutaciones antes de creer el verde:** contar las pestañas con `items.length`; ofrecer «Ver /
  conciliar» a un incompleto; pintar `money("0.00")` cuando `montoRecibido` es null; resaltar la Falta
  siempre; pedir la página de Conciliados sin `filtros`; devolver a la página 1 solo la cola.
- **Preview con Carlos** antes de promover C1 + C2 (PA3, PA5, PA6, PA-P).

## Alternativas descartadas

1. **Un `ColaCierresBodega` aparte.** Contradice R32 («un único componente de cola, parametrizado por
   `tipo` y `rol`») y D15 / S4-2. Duplicaría la cabecera, las pestañas y la barra que SLT-102 ya resolvió.
2. **Convertir `CierreBodegaResumen` en `CierreAdminResumen`** para no tocar el tipo de `ColaCierres`.
   Habría que inventar `mensajeroNombre`, `totalPagoMensajero` o `pendientePagoMensajero` para una
   consolidación: campos de dinero que mienten, y la rama mensajero podría pintarlos.
3. **Filas ya pintadas (`FilaCola[]` del boceto del madre)**, para que `ColaCierres` no conozca los
   tipos. Obliga a reescribir la rama mensajero, que ya está en prod y vigilada (R135), y sube el diff
   por encima del tope sin que lo pida ningún R. Se podrá hacer cuando entre el tercer tipo.
4. **Dejar `CierresBodegaResueltosLista` dentro del panel de «Conciliados».** Su página no lleva
   filtros y su `total` no sube al módulo: la pestaña no podría contar (R127) y la barra no filtraría
   esa lista (R128).
5. **Renombrar los ids internos de pestaña a `porConciliar` / `conciliados`.** Toca la rama mensajero,
   los tests de SLT-102 y el tipo `PestanaCola` sin cambiar nada visible.

## Dependencias de terceros

Ninguna nueva.

## Riesgos

- **Tamaño en el borde** (PA-T): ~980-1 080 líneas para un tope de 1 000. El implementer mide con
  `./init.sh` al cerrar cada tanda y para si pasa del 80 % sin la marca.
- **Choque de archivos con SLT-106 / SLT-107** (`cola/`): hoy están `pending`. El leader lo mira con
  `archivos-en-vuelo.mjs` al tomar la ficha.
- **`refrescarListas`**: si la clave de Conciliados cambiara de prefijo, marcar o corregir dejaría la
  fila en la pestaña vieja hasta recargar (lo que destapó SL-44). Se conserva el prefijo; lo vigilan
  `CierresBodegaAdminRefresco.test.tsx` y el E2E.
- **`fallbackData` con filtros**: servir la página 1 pre-cargada con un filtro puesto enseñaría filas
  que el filtro excluye. Se aplica la misma condición que la cola (`sinFiltrosBodega`).
