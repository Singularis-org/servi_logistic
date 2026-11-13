# SLT-106 «Bodega satélite: A consolidar con la cola única» — design

> Hereda el diseño del madre (`specs/SLT-95-detalle-cierre-rediseno/design.md`, `> 2. Cola de
> cierres`, `> De dónde sale cada cifra`) y el de SLT-102 «Cola de cierres única: mensajeros (central
> y satélite)» y SLT-127 «Cola de bodega de la central con la cola única». Aquí solo va lo que S8
> añade o decide.

## Lo que ya existe

**Términos buscados:** «consolidar», «A consolidar», «Solicitar cierre de bodega», «paraLaCentral»,
«ColaCierres», «satélite», «Central debe», «sin resolver».

**Dónde:** `feature_list.json` (todos los estados), `specs/` y el código con Grep/Read. El índice del
grafo no tiene este worktree (`index_status`: «project not found»); no se usó el de otro.

**Qué apareció:**

| Qué | Dónde | Uso aquí |
|---|---|---|
| SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» | board, `pending` | Se lleva «Solicitados»; aquí solo se mete como pestaña con la lista de hoy (R201). |
| SLT-123 «Pago al mensajero independiente del efectivo» | board, `pending` | Cambiará cómo se deriva «Central debe»; aquí se pinta lo que emite el servidor hoy. |
| SLT-134 «Textos de pantalla de cierres en tú, con guardia» | board, `pending` | Los voseos de `ConsolidacionBodegaModule.tsx` (toasts, sin zona) son suyos; no se tocan. |
| SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» | board, `in_progress` (Carlos) | Toca `components/private/cierres/cola/` (añade `rol` mensajero). Mismo dueño: no es candado; el leader ordena los merges. |
| `ColaCierres` con `tipo` mensajero (central, satélite) y bodega (central) | `components/private/cierres/cola/ColaCierres.tsx` | Se le añade la variante bodega · satélite. |
| `columnasCola`, `tablistCola`, `folioCola`, `pagosAjustados` | `cola-cierres-vista.ts`, `cola-cierres-labels.ts` | Se reusan; se añaden las columnas y textos de la satélite. |
| `CifrasCierre` + `Cifra` (`metodosVisibles`, `destacada`) | `components/private/cierres/detalle/` | Las tarjetas de «A consolidar» son las mismas cajas que las cifras del detalle. |
| `paraLaCentral()` | `lib/utils/ingreso-empresa.ts:806` | La única derivación de «Debe llegar a la central» (R67). |
| `toBodegaResumenRow` deriva `paraLaCentral` en el mapper del repositorio (feature 393, R38) | `lib/repositories/CierreBodegaRepository.ts:108-144` | Mismo patrón para el consolidable (`toConsolidableRow`). |
| `_count` de gestiones con ajuste (`gestionesAjustadas`, SLT-56) | `lib/repositories/CierresBodegaAdminRepository.ts:182` | La misma subconsulta para el consolidable (R194). |
| `contarCierresDiaSolicitados` | `CierreBodegaRepository.ts:401` | Su `where` se extrae y lo comparte la lectura de nombres (R199). |
| Resumen en el diálogo (`RESUMEN_SOLICITUD_TEXTO`, `<dl>`) | `components/private/cierres/dialogos/dialogos-labels.ts`, `CierreDiaModule.tsx` (SLT-103, R140) | Mismo patrón para R207. |
| «Ver su cierre» con `router.push(hrefDetalleCierre(...))` | `CierresBodegaAdminModule.tsx:532` (SLT-104) | Mismo camino para R193: el `?cierre=` lo abre `CierresAdminModule`, montado en el panel oculto. |
| `FiltrosCierresBarra sinMensajero`, `descargaConsolidables`, `descargaBodegaSolicitados`, `Pagination` | `ConsolidacionBodegaModule.tsx`, `CierresBodegaSolicitadosLista.tsx` | Tal cual. |

No hay ficha ni código que ya haga S8: se reutiliza lo de arriba.

## Zona y capas

**Fullstack.** Servidor (`backend_dev`): repositorio y servicio del cierre de bodega (lecturas, sin
escritura). Pantalla (`frontend_dev`): la cola, sus tarjetas y el módulo. Sin cambios en `db/` ni en
`lib/actions/`.

## Modelo de datos, RLS y migraciones

**Ninguno.** Sin tablas, columnas, índices, políticas ni migraciones (por tanto sin `down.sql`).
Las lecturas nuevas son de `cierre_dia` (ya con `organizacion_id`, RLS por empresa e índices
`[destinoTipo, destinoZonaId]`, `[estado]` y `[cierreBodegaId]`), `gestion_orden` y su relación de
ajustes, por Prisma con el cliente de la sesión: la empresa la pone la extensión del cliente y la RLS,
como en el resto del repositorio. Ningún SQL a mano.

## Autorización

Sin cambios. `listarConsolidacion` y `listarConsolidablesPaginado` siguen respondiendo `forbidden` a
quien no es `adminSatelite` antes de tocar el repositorio, y la zona sale del usuario
(`findUsuarioZonaId`), nunca de la petición. La lectura nueva de nombres usa esa misma zona en el
`WHERE`. «Ver su cierre» abre un cierre del día de la zona del actor por el camino de hoy (`?cierre=`,
`verCierreDetalle`, que ya acota por zona). Módulo: cierres cuelga de `nucleo`.

## Datos que dependen del país

- **Moneda:** todos los importes son strings del servidor y la pantalla los formatea con `money()`.
- **Fecha «Aprobado»:** el instante viaja en ISO y se pinta con `fechaHora` de
  `detalle-cierre-vista.ts`, el formateador de la cola de mensajeros (columna «Solicitado»/«Resuelto»).
- Sin impuestos, geografía ni métodos de pago nuevos. Los métodos de «Recaudado» salen de
  `metodosVisibles` (D4).

## Servidor

### `ICierreBodegaRepository` / `CierreBodegaRepository`

`CierreDiaConsolidableRow` gana tres campos **requeridos** (una superficie nueva no puede nacer sin
ellos y que el compilador calle, mismo motivo que `paraLaCentral` en la 393):

```ts
paraLaCentral: string;        // R67: paraLaCentral(general, pago, bodega) de ESTE cierre, con su signo
aprobadoAt: string | null;    // R194: cierre_dia.resuelto_at en ISO
gestionesAjustadas: number;   // R194: gestiones de este cierre con al menos un ajuste
```

- `CONSOLIDABLE_SELECT` añade `resueltoAt: true` y amplía el `_count` en la misma sentencia:
  `_count: { select: { ...CONTEO_DETALLE_MODELO_NUEVO.select, gestiones: { where: {
  ajustesPagoMensajero: { some: {} } } } } }` (la misma subconsulta que
  `CierresBodegaAdminRepository.DETALLE_CIERRE_SELECT`). Sin consulta por fila.
- `toConsolidableRow` deriva `paraLaCentral` con la función de `lib/utils/ingreso-empresa.ts`, sobre
  los snapshots ya pasados a string. Como el mapper lo comparten la página, el conjunto completo y la
  descarga, las tres lecturas emiten lo mismo.
- **Nombres sin resolver (R199):** se extrae `sinResolverWhere(zonaId)` (`destinoTipo` satélite,
  `destinoZonaId` = zona, `estado` = `solicitado`), que pasan a usar `contarCierresDiaSolicitados`
  (sin cambio de comportamiento) y el método nuevo:

  ```ts
  /** Un nombre por cierre `solicitado` de la zona (con repetidos); el servicio los junta. */
  findMensajerosConCierreSinResolver(zonaId: string): Promise<string[]>;
  ```

  `findMany({ where: sinResolverWhere(zonaId), select: { mensajero: { select: NOMBRE_USUARIO_SELECT } } })`
  → `nombreCompletoUsuario`. Un solo `where` declarado: el aviso y la puerta de `solicitar` no pueden
  contar conjuntos distintos.

### `ICierreBodegaService` / `CierreBodegaService`

```ts
/** Lo que pinta la fila de «A consolidar» (la página). El conjunto de la descarga sigue siendo Lite. */
export interface CierreConsolidableCola extends CierreBodegaResumenLite {
  paraLaCentral: string;
  aprobadoAt: string | null;
  gestionesAjustadas: number;
}

export type BloqueoConsolidacion = "sin_zona" | "sin_resolver" | "vacio";
```

- `ListarConsolidablesServiceResult.items: CierreConsolidableCola[]` (la página). El resultado del
  conjunto completo (`ListarConsolidablesCompletoServiceResult`) y `CierreBodegaResumenLite` **no
  cambian**: la descarga y `cierre-factura.tsx` siguen con su tipo, y el row más rico es asignable.
- `ListarConsolidacionServiceResult` (`status: "ok"`) gana:

  ```ts
  paraLaCentralAgregado: string;     // R67: paraLaCentral(totalesAgregados.general, totalPagoMensajeroAgregado, totalIngresoBodegaRechazosAgregado)
  cierresAConsolidar: number;        // R195: consolidables.length (conjunto completo)
  mensajerosAConsolidar: number;     // R195: new Set(consolidables.map(c => c.mensajeroId)).size
  bloqueo: BloqueoConsolidacion | null; // R195: el motivo del gate, para el pie (R197)
  ```

  Sin zona: `"0.00"`, `0`, `0`, `"sin_zona"`.
- `listarConsolidacion` deja de llamar a `contarCierresDiaSolicitados` y llama a
  `findMensajerosConCierreSinResolver`. Con al menos un nombre: `puedesSolicitar = false`,
  `bloqueo = "sin_resolver"`, `motivoBloqueo = motivoSinResolver(nombres)`. Sin nombres y sin
  consolidables: `bloqueo = "vacio"`, `MSG_VACIO` (el de hoy). El orden de prioridad es el de hoy.
- `motivoSinResolver(nombres: string[]): string` (función pura del servicio, exportada para el test):
  quita repetidos, ordena con `localeCompare(…, "es")`, une con «, » y « y » el último, y elige la
  forma por número de cierres (`nombres.length`) y de mensajeros (R199).
- **`solicitarCierreBodega` no se toca** (R200, R72): sigue con `contarCierresDiaSolicitados` y
  `MSG_PENDIENTES`. Es una Server Action de escritura.

Ninguna cifra nueva toca dinero: `paraLaCentralAgregado` es la misma resta de la 393 sobre los tres
agregados que ya existen (`Prisma.Decimal`, string de escala 2); y, como la resta es lineal, la suma
de los `paraLaCentral` de las filas es el agregado (el test lo comprueba con literales).

## Pantalla

### `ColaCierres` — variante bodega · satélite

La unión discriminada de SLT-127 gana un tercer miembro. `ColaCierresBodegaProps` (central) fija
`rol: "central"` para que la narrativa por `tipo` + `rol` funcione.

```ts
export type PestanaCola = "pendientes" | "resueltos" | "aConsolidar" | "solicitados";

export interface AccionesColaConsolidar {
  verSuCierre: (cierreDiaId: string) => void;        // R193
}

/** La cola de bodega de la satélite (SLT-106). */
export interface ColaCierresConsolidarProps extends ColaComun {
  tipo: "bodega";
  rol: "satelite";
  filas: readonly CierreConsolidableCola[];          // página de «A consolidar»
  acciones: AccionesColaConsolidar;
  tarjetas: readonly Cifra[];                        // R196, de tarjetasAConsolidar()
  totales: CierreTotales;                            // métodos de «Recaudado» (D4)
  aviso: string | null;                              // R46, R198
  botonPie: { deshabilitado: boolean; onClick: () => void }; // R197
  /** R201: contenido de «Solicitados» hasta SLT-107 (la lista de hoy). */
  solicitados: ReactNode;
}
```

Orden en pantalla (canvas): descripción · `tablist` · barra + Descargar · **aviso** · **tarjetas** ·
región con la tabla · pie. Con `pestanaActiva === "solicitados"` el panel pinta `solicitados` y no
pinta aviso, tarjetas, tabla ni botón (R201); el módulo pasa `paginacion={null}` y `pie` vacío
(la lista de hoy trae su paginación).

- **Aviso:** `<div role="status" id={idAviso}>` con el texto del servidor; el `Button` del pie lleva
  `aria-describedby={idAviso}` y el `title` de hoy (R198).
- **Tarjetas:** `<CifrasCierre cifras={tarjetas} totales={totales} ariaLabel="Cifras a consolidar" />`.
- **Pie:** texto (izquierda), `paginacion`, y el `Button` «Solicitar cierre de bodega» a la derecha.
- **Tabla:** `TablaColaConsolidar`, sobre la misma `TablaCola` genérica (una sola `<DataTable>` en el
  censo), `rowKey="cierreDiaId"`. Celdas: `money()` como único contacto con un importe (R71); «A la
  central» con `font-semibold` y la clase de negativo de hoy si `esMontoNegativo`; Señales con
  `L.pagosAjustados(n)` si n > 0; acción `Button variant="outline"` «Ver su cierre» con
  `aria-label={L.nombreVerSuCierre(mensajero)}`.

### `cola-cierres-vista.ts` (puro)

```ts
export function columnasCola(tipo, rol, pestana): ColumnaCola[];
// bodega · satélite · aConsolidar → Folio · Mensajero · Aprobado · Recaudado · Pago · Gana bodega ·
//   A la central · Señales · acciones (sr-only). Ids nuevos: "aprobado", "ganaBodega", "aLaCentral".
export function tablistCola(tipo: TipoCola, rol: RolCola): string;  // + «Cierre de bodega por etapa»
export function folioConsolidable(c: Pick<CierreConsolidableCola, "cierreDiaId">): string;
export function aprobadoCola(c: Pick<CierreConsolidableCola, "aprobadoAt">): string;  // fechaHora o «—»
export function senalesConsolidable(c: Pick<CierreConsolidableCola, "gestionesAjustadas">): string | null;
export function tarjetasAConsolidar(a: {
  totales: CierreTotales; pagoMensajeros: string; ganaBodega: string; paraLaCentral: string;
  centralDebe: string; mensajeros: number; incluyeModeloNuevo: boolean;
}): Cifra[];                                        // R196; «La central debe» solo si ≠ "0.00" (esMontoCero)
export function piePorConsolidar(bloqueo: BloqueoConsolidacion | null, cierres: number): string | undefined; // R197
```

`tablistCola` pasa a recibir el `rol`; sus dos llamadas de hoy se actualizan (mensajero y bodega
central no cambian de nombre, R206). La comparación con cero de «La central debe» es de texto
(`esMontoCero` de `components/shared/monto-cliente.ts`), sin convertir nada.

### `CifrasCierre` / `Cifra` (aditivo)

- `CifraId` añade `"ganaBodega"` y `"centralDebe"`.
- `Cifra` añade `aviso?: boolean` → caja en tono de aviso (canvas `warn`): la cifra en
  `text-warning-strong` (el de la «Falta» resaltada de la cola) sobre `bg-warning-soft` con borde
  `border-warning/60`: los tres tokens existen en `app/globals.css` (`--color-warning`,
  `--color-warning-soft`, `--color-warning-strong`), y `warning-strong` está medido contra
  `warning-soft` (6.37:1).
- `CifrasCierreProps` añade `ariaLabel?: string` (por defecto `CIFRAS_REGION_LABEL`) y la rejilla
  admite 5 cajas (`lg:grid-cols-5`). Con 3 y 4 cajas, idéntica a hoy: el detalle no cambia.

### Textos nuevos (`cola-cierres-labels.ts`, «tú»)

```ts
DESCRIPCION_BODEGA_SATELITE = "Junta los cierres aprobados de tus mensajeros y envíalos a la central.";
descripcionColaSatelite(zonaNombre: string | null): string;   // «Bodega satélite · <zona>. …»
TABS_COLA_CONSOLIDACION_LABEL = "Cierre de bodega por etapa";  // el nombre de hoy
PESTANA_A_CONSOLIDAR = "A consolidar"; PESTANA_SOLICITADOS = "Solicitados";
REGION_A_CONSOLIDAR = "Cierres del día a consolidar";          // el de hoy
VACIO_A_CONSOLIDAR = "No hay cierres del día aprobados para consolidar.";   // el de hoy
ERROR_A_CONSOLIDAR = "No se pudieron cargar los cierres a consolidar.";     // el de hoy
COLUMNA_APROBADO = "Aprobado"; COLUMNA_PAGO_CORTO = "Pago"; COLUMNA_GANA_BODEGA = "Gana bodega";
COLUMNA_A_LA_CENTRAL = "A la central";
ACCION_VER_SU_CIERRE = "Ver su cierre"; nombreVerSuCierre = (m) => `Ver el cierre de ${m}`;
TARJETA_GANA_BODEGA = "Gana la bodega satélite"; TARJETA_CENTRAL_DEBE = "La central debe";
notaPagoMensajeros(n) // «1 mensajero · se paga del efectivo» / «<n> mensajeros · se paga del efectivo»
NOTA_GANA_BODEGA_VIEJO = "por devoluciones a origen";
NOTA_DEBE_LLEGAR = "recaudado − mensajeros − bodega";
NOTA_CENTRAL_DEBE = "el efectivo no alcanzó para pagar a todos los mensajeros";
pieSePuedeSolicitar(n) // R197
PIE_SIN_RESOLVER = "Se habilita cuando no quede ningún cierre de mensajero por resolver.";
BOTON_SOLICITAR_BODEGA = "Solicitar cierre de bodega";
```

«Recaudado», «Pago a mensajeros» y «Debe llegar a la central» se importan de
`detalle-cierre-labels.ts` (ya existen). `cierre-bodega-vocabulario.guardia` no censa `cola/`; aun
así ningún texto nuevo usa «Central debe» suelto ni el vocabulario de la aprobación.

### `dialogos-labels.ts` (R207)

```ts
export const RESUMEN_SOLICITUD_BODEGA_TEXTO = {
  region: "Resumen del cierre de bodega a solicitar",
  recaudado: "Recaudado", pagoMensajeros: "Pago a mensajeros",
  ganaBodega: "Gana la bodega satélite", debeLlegar: "Debe llegar a la central",
} as const;
```

### `ConsolidacionBodegaModule.tsx`

- Props nuevas: `paraLaCentralAgregado`, `cierresAConsolidar`, `mensajerosAConsolidar`, `bloqueo`,
  `zonaNombre`; `consolidables.items` pasa a `CierreConsolidableCola[]`.
- Estado: `tab` (`"aConsolidar" | "solicitados"`), `filtros`, `page`, `pageSize`, `confirmar` como hoy.
  Las pestañas se escriben `{ id: "aConsolidar", label: PESTANA_A_CONSOLIDAR, conteo: pagina.total }`
  y `{ id: "solicitados", …, conteo: cierresBodegaPasados.total }`: la forma `conteo: X.total` es la
  que vigila `contadores-cabecera.guardia` (R42 de la 170), que así no se toca.
- «Ver su cierre»: `router.push(hrefDetalleCierre(cierreDiaId))`, como SLT-104.
- El `Modal` de hoy gana cuerpo: `<dl aria-label={RESUMEN_SOLICITUD_BODEGA_TEXTO.region}>` con los
  cuatro pares y `money()` de los mismos props que las tarjetas (R48, R207). Título, descripción,
  `confirmLabel` y `confirmarSolicitud` (toasts, `mutate`, `refresh`) no cambian (R200, R205).
- Sin zona: la rama de hoy, intacta (R202).
- Salen los imports de `TotalesPanel`, `PagoMensajeroTotal`, `IngresoBodegaRechazosTotal`,
  `rotuloIngresoBodega`, `CentralDebeTotal`, `CierreConsolidableFacturaResumen`, `ListaComprobantes`,
  `PanelConmutado` y `SegmentedToggle` (R204). Sus archivos siguen (los usan otras pantallas o los
  borra SLT-115).

### `page.tsx`

Pasa las props nuevas desde `consolidacion` y el `zonaNombre` que ya calcula (SLT-102, PA3).

## Fidelidad al canvas

| Canvas | Se pinta | Por qué |
|---|---|---|
| «Cierres del día» dentro del componente | el título de `AppPage` | Un solo `h1` (SLT-102). |
| Conmutador a la derecha del título | donde está hoy | R37. |
| «07/11 19:10» | `fechaHora` | El formateador de la cola; SLT-92 unifica fechas. |
| «₡285.275,00» | `money()` | Moneda del país. |
| «Solicitados 8» con tabla, tarjetas y «Ver» | la lista de hoy, con conteo sin filtros | R201, PA2: es SLT-107. |
| Nota «por devoluciones y no entregadas» | «por devoluciones a origen» (viejo) / sin nota (nuevo) | R196, PA1 (SLT-54 R71). |
| Pie sin paginación | texto + paginación + botón | La lista es paginada en el servidor (ficha 170); sin el control no se llega a la página 2. |
| Placeholder «Folio» | el de `FiltrosCierresBarra` de hoy | D17: la barra es la de hoy; su texto es de SLT-134. |

## Alternativas descartadas

1. **Derivar `paraLaCentral` de cada fila en el servicio** (lo que dice la fila R67 del madre). Se
   descarta: hay tres lecturas del consolidable (página, conjunto, descarga) y el patrón de la 393 es
   derivar una vez en el mapper del repositorio para que no puedan divergir. La función es la misma;
   cambia solo el sitio, al que ya usa la cabecera del cierre de bodega.
2. **Cambiar `contarCierresDiaSolicitados` para que devuelva los nombres y usarlo también en
   `solicitarCierreBodega`.** Daría el mismo texto en el toast del conflicto, pero toca una Server
   Action de escritura (R72) y los dobles de su test. Se comparte solo el `where`.
3. **Llevar «Solicitados» a la cola ya, con las columnas de R49 y sin «Ver».** La satélite perdería
   lo que hoy lee en el comprobante (recaudado, pagos, conciliación) hasta que SLT-107 abra el
   detalle: una pantalla a medias. Se deja la lista de hoy dentro de la pestaña (R201).
4. **Un componente propio para «A consolidar»** (tarjetas + tabla fuera de `ColaCierres`). Contradice
   D15 / S4-2 (mismo flujo, un componente con props) y duplicaría barra, pestañas y pie.
5. **Hacer opcionales los tres campos nuevos de `CierreBodegaResumenLite`** para no tocar fixtures.
   Un importe opcional deja nacer una superficie sin él; en su lugar el tipo nuevo
   `CierreConsolidableCola` los exige solo donde se pintan, y Lite queda igual para la descarga.

## Riesgos

- **El `WHERE` de nombres** filtra por zona y estado: un error enseña a la satélite nombres de otra
  zona o bloquea con cierres ya resueltos. Se prueba contra la base con mutación (T1.3).
- **`_count` de gestiones ajustadas:** sin el `some`, contaría todas las gestiones. Integración con
  mutación (T1.3).
- **Choque con SLT-137** en `components/private/cierres/cola/`: mismo dueño; quien llegue segundo
  rebasa. El leader lo mira con `scripts/archivos-en-vuelo.mjs`.
- **`tarifas-activacion.spec.ts`** leía el rótulo de bodega por modelo en el comprobante de cada
  consolidable; ese comprobante desaparece. Pasa a leer la nota de la tarjeta (R196) y el importe de
  «Gana bodega» de cada fila con literales.
