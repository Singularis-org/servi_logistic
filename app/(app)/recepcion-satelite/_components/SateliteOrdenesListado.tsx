"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  type Column,
  type DescargaFilasResult,
} from "@/components/shared/DataTable";
import {
  FilterComponent,
  type FilterSelection,
} from "@/components/shared/FilterComponent";
import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import type {
  DireccionOrden,
  OrdenamientoListado,
} from "@/lib/types/ordenamiento-listado";
import {
  VISTA_FILTRO_VERSION,
  type VistaFiltroPayload,
} from "@/lib/types/vista-filtro";
import {
  catalogoCargado,
  catalogoNoDisponible,
  type CatalogoVistas,
} from "@/lib/utils/vista-filtro-aplicabilidad";
import {
  conBadgePrioridad,
  resaltarFilaPrioridad,
} from "@/components/shared/PrioridadResalte";
import { SelectAllCheckbox } from "@/components/shared/SelectAllCheckbox";
import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import type { OrderStatusLiteRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { CatalogoFiltrosOrdenesDTO } from "@/lib/types/filtros-ordenes";
import { BUSQUEDA_MIN_CHARS } from "@/lib/types/orden";
import { listarOrderStatus } from "@/lib/actions/order-status";
import {
  CATALOGO_FILTROS_VACIO,
  CLAVE_BUSQUEDA,
  PLACEHOLDER_BUSQUEDA,
} from "@/app/(app)/ordenes/_components/ordenes-filtros-def";
// SLT-210 (R1400): los conmutadores de orden de `/ordenes`, IMPORTADOS —opciones, etiquetas,
// iconos y valores iniciales—. Mismo precedente que `ordenes-filtros-def` de arriba: las dos
// barras no pueden llamar a lo mismo de dos maneras.
import {
  CAMPO_ORDEN_INICIAL,
  DIRECCION_ORDEN_INICIAL,
  ETIQUETA_CAMPO_ORDEN,
  ETIQUETA_DIRECCION,
  OPCIONES_CAMPO_ORDEN,
  OPCIONES_DIRECCION,
  type CampoOrdenOfrecido,
} from "@/app/(app)/ordenes/_components/ordenamiento-ordenes";

// Feature 158 (T2.7, decisión del humano del 2026-07-30): el reporte de incidente también
// vive en la bodega satélite. Se IMPORTA el mismo disparador y el mismo modal de `/ordenes`;
// esta superficie sólo aporta SU regla de disponibilidad (alcance por zona, R48).
import { ReportarIncidenteAccion } from "@/app/(app)/ordenes/_components/ReportarIncidenteAccion";
// FICHA 367: el botón de historial (feature 49) también vive aquí. Se IMPORTA el MISMO
// componente que monta `/ordenes` (`OrdenesModule`, columna `acciones`) — no una copia — y la
// fila hidrata con el mismo include (`WITH_ESTATUS_Y_TIENDA`), así que trae lo único que el
// drawer necesita (`id`, `numRemision`). El `adminSatelite` ya usa este botón en `/ordenes`, así
// que la Server Action `obtenerHistorialOrden` ya lo autoriza para ese rol: no hay nada nuevo
// que autorizar aquí.
import { HistorialOrdenSheet } from "@/app/(app)/ordenes/_components/HistorialOrdenSheet";
// Feature 262 (F4, R13/R18): la etiqueta del botón se IMPORTA del modal que abre, para que las
// dos superficies —ésta y `/ordenes`— no puedan llamar a la misma acción de dos maneras.
import { CAMBIAR_DIA_ACCION } from "@/app/(app)/ordenes/_components/CambiarDiaRepartoModal";
// SLT-222 (D2): el MISMO modelo de selección acumulada que `/ordenes` (`OrdenesModule`).
import {
  contarFueraDeVista,
  filasSeleccionadas,
  refrescarSeleccion,
  textoContadorSeleccion,
} from "@/app/(app)/ordenes/_components/seleccion-acumulada";
import { puedeReportarIncidenteSatelite } from "./incidente-satelite";
import { recibidasColumns } from "./recibidas-columns";
import { columnasDescargaSatelite } from "./satelite-descarga-columnas";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import {
  CLAVE_ESTADO,
  construirFiltrosSatelite,
  estadosFueraDelListado,
  etiquetaEstado,
  seleccionAFiltroSatelite,
  type FiltroBodegaSatelite,
} from "./satelite-ordenes-filtros";

// Pedido humano: la bodega satélite deja de tener una sección (y una tabla) por estado y
// pasa a UN SOLO listado con barra de filtros, como el del admin en `/ordenes`.
//
// Qué cambia y qué no:
//   - Una tabla con las órdenes de los CINCO estados que ve el adminSatelite. El filtro
//     de estado ofrece exactamente esos cinco (ver `satelite-ordenes-filtros.ts`).
//   - Las acciones que antes vivían en la cabecera de cada sección ahora son acciones DE
//     LOTE sobre la selección, y se habilitan según el estado de lo seleccionado: asignar
//     mensajero (recibidas), deshacer asignación (por recoger, feature 149/R35), enviar a
//     central (por devolver) y recuperar (devueltas). Con una selección MIXTA no se ofrece
//     ninguna: son transiciones distintas.
//   - "Por recibir" NO entra aquí: se acepta por escáner/lote y vive en su propia sección.
//
// Feature 170 — FASE 2 (T K.3): la tabla pinta UNA PÁGINA que resuelve el servidor. Este
// componente ya NO consulta ni recorta nada: recibe la página, el total del conjunto y el
// catálogo de opciones, y EMITE los filtros elegidos (`onFiltroChange`) para que el módulo
// —que es quien tiene los datos— pida la página que toca. Lo que sí decide aquí es lo que
// es suyo: qué filas están marcadas y qué acción de lote se ofrece sobre ellas (R47/R48).

/**
 * Feature 170 (T A.2) — título del dataset: encabezado de la sección, nombre accesible de
 * la tabla, nombre de la hoja y base del nombre de archivo
 * (`ordenes-de-la-bodega-YYYY-MM-DD.xlsx`, R12), y parte del nombre accesible del control
 * de descarga (R13). Se EXPORTA porque desde T K.3 la descarga la arma el módulo —es quien
 * conoce el origen del conjunto completo— y las dos partes tienen que decir lo mismo.
 */
export const TITULO_BODEGA = "Órdenes de la bodega";

/** Estados sobre los que cada acción de lote es válida. */
const ESTADO_ASIGNABLE = "en_bodega_satelite";
/** Feature 149 (R35): asignada a un mensajero que aún NO la recogió; la asignación se deshace. */
const ESTADO_POR_RECOGER = "mensajero_recogiendo_en_bodega";
const ESTADO_POR_DEVOLVER = "por_devolver_a_bodega_central";
const ESTADO_DEVUELTA = "novedad";

/**
 * FICHA 355 — el catálogo `order_status` para el desplegable de estado.
 *
 * MISMO fetcher que `/ordenes` (`OrdenesListado.catalogoFetcher`): la Server Action autoriza
 * a «todos excepto mensajero», y el `adminSatelite` está dentro (feature 63/R2). Un fallo
 * degrada a lista vacía —el control se declara sin opciones y la tabla sigue viva—, que es
 * exactamente lo que hace la central.
 */
async function estatusFetcher(): Promise<OrderStatusLiteRow[]> {
  const res = await listarOrderStatus();
  if (res.status !== "ok") return [];
  return res.estatus;
}

/**
 * FICHA 355 — el vacío EXPLICADO.
 *
 * El desplegable ofrece el catálogo entero, así que se puede elegir un estado que este listado
 * no alcanza nunca (`entregada`: la orden ya salió de la bodega). Ese vacío es correcto, pero
 * una tabla en blanco con «Ninguna orden coincide con los filtros» se lee como un fallo. Aquí
 * se dice QUÉ pasa y en qué estados, con las mismas etiquetas del desplegable.
 *
 * Recibe las ETIQUETAS ya resueltas —no los `value`— para que el texto no dependa del catálogo
 * y se pueda probar y traducir en un solo sitio.
 *
 * DÓNDE SE PINTA, y es una decisión medida en el navegador, no una preferencia: va bajo el
 * CONTADOR, no en el mensaje de vacío de la tabla. El vacío del `DataTable` vive en un `<td>`
 * con `colSpan` dentro de un contenedor con scroll horizontal, y a 390 px esa celda queda fuera
 * de la vista: la pantalla enseñaba una tabla en blanco sin ninguna explicación (comprobado con
 * Playwright a 390×844). Bajo el contador se lee a las dos anchuras, y además cae dentro del
 * `role="status"` de la barra, así que un lector de pantalla lo anuncia al cambiar el filtro.
 *
 * `todosFuera` distingue los dos casos: si TODO lo elegido es inalcanzable el resultado es cero
 * y hay que decir por qué; si es una mezcla, el resultado es correcto y sólo hace falta avisar
 * de que esa parte no aporta —o parecería un filtro ignorado en silencio—.
 */
export function mensajeEstadosFueraDelListado(
  etiquetas: readonly string[],
  todosFuera: boolean,
): string {
  const lista = etiquetas.map((e) => `«${e}»`).join(", ");
  const uno = etiquetas.length === 1;
  if (todosFuera) {
    return uno
      ? `Ninguna orden de esta bodega puede estar en ${lista}: ese estado no forma parte de este listado.`
      : `Ninguna orden de esta bodega puede estar en ${lista}: esos estados no forman parte de este listado.`;
  }
  return uno
    ? `${lista} no es un estado de este listado: no suma órdenes.`
    : `${lista} no son estados de este listado: no suman órdenes.`;
}

export interface SateliteOrdenesListadoProps {
  /**
   * Feature 170 — FASE 2 (T K.3, R40): la PÁGINA visible que devolvió el servidor, ya
   * filtrada y ordenada por él. NO es el conjunto: para hablar del conjunto están `total`
   * y `totalSinFiltros`.
   */
  ordenes: RecepcionSateliteDTO[];
  /**
   * R41/R42: total de órdenes que corresponden a los filtros vigentes y al alcance del
   * actor, tal como lo devolvió el servidor. NUNCA `ordenes.length`.
   */
  total: number;
  /**
   * R42: total del conjunto del actor SIN filtros (la página 1 que pre-cargó el Server
   * Component). Es el «de Y» del contador; también viene del servidor.
   */
  totalSinFiltros: number;
  /**
   * T K.2 (R46): opciones de la GEOGRAFÍA, independientes de la página visible.
   *
   * Pedido humano (2026-08-19): es el catálogo de `/ordenes` (`obtenerCatalogoFiltrosOrdenes`),
   * que para el adminSatelite viene acotado a SU zona —geografía de la zona, sin zonas y sin
   * cuentas tienda—. `null` si no cargó: la barra se monta igual, con sus controles sin
   * opciones y la tabla viva (R64 de la 144).
   */
  catalogo: CatalogoFiltrosOrdenesDTO | null;
  /** Emite los tres filtros elegidos; el módulo pide con ellos la página al servidor (R45). */
  onFiltroChange: (filtro: FiltroBodegaSatelite) => void;
  /**
   * SLT-210 (R1402) — emite el orden elegido en los conmutadores; el módulo lo mete en la clave
   * de SWR, vuelve a la página 1 y lo pasa a la descarga. Opcional: sin él los conmutadores se
   * pintan igual, pero el orden no llega al servidor.
   */
  onOrdenChange?: (orden: OrdenamientoListado<CampoOrdenOfrecido>) => void;
  /**
   * R52 — filas del CONJUNTO COMPLETO con los filtros vigentes, para el archivo.
   *
   * Es un CALLBACK, no unos filtros: esta tabla pinta la página que le llega por props y no
   * conoce el origen del conjunto ni los filtros vigentes; quien los conoce es
   * `RecepcionSateliteModule`, que cierra sobre ellos. Mismo patrón que `WalletLedger` /
   * `DesglosePagos` (T C.4), y lo que manda el design §5: nunca los filtros a la tabla. Las
   * COLUMNAS del archivo las declara esta tabla, que es la que sabe qué enseña.
   */
  obtenerFilasDescarga: () => Promise<DescargaFilasResult>;
  /**
   * Feature 184 — Tanda A (T A.5, R18/R19/R22) — cuáles de estos identificadores SIGUEN en el
   * conjunto filtrado, según el SERVIDOR.
   *
   * Es un callback por lo mismo que `obtenerFilasDescarga`: los filtros vigentes los conoce el
   * módulo, no esta tabla. Devuelve los VIGENTES —nunca los caducados— para que una respuesta
   * corta por error no pueda leerse como «desmarca todo», y `null` cuando la comprobación no
   * se pudo hacer, que aquí significa NO PODAR (R22).
   *
   * Opcional: sin él la selección se comporta como antes de la tanda A.
   *
   * SLT-222 R1514: desde que la selección sobrevive a la búsqueda, el conjunto contra el que se
   * pregunta es el listado de la bodega SIN filtros ni término (si no, la búsqueda siguiente
   * podaría lo marcado en la anterior). Lo decide el módulo, que es quien arma la consulta.
   */
  comprobarVigencia?: (ids: string[]) => Promise<readonly string[] | null>;
  /**
   * SLT-222 R1508 — señal de «la selección ya se consumió»: cada vez que este número cambia se
   * desmarca TODO, visible o no. Mismo contrato que `OrdenesModule.resetSeleccion`: quien sabe
   * que una acción por lote terminó bien es el módulo; la selección vive aquí.
   */
  resetSeleccion?: number;
  /** `true` mientras no hay ninguna página que pintar (primer viaje al servidor). */
  cargando?: boolean;
  /** Mensaje de error de la carga de la página, ya redactado; `null` si no lo hay. */
  errorCarga?: string | null;
  /** Zona del actor, para el estado legible de la columna. */
  zonaNombre: string | null;
  /** `false` con la bodega bloqueada: no se puede asignar (defensa suave). */
  puedeAsignar: boolean;
  /** Abre el modal de asignación con las órdenes seleccionadas. */
  onAsignar: (ordenes: RecepcionSateliteDTO[]) => void;
  /** Envía a bodega central las órdenes seleccionadas (`por_devolver`). */
  onEnviarACentral: (ordenes: RecepcionSateliteDTO[]) => void;
  /** Recupera a bodega las órdenes seleccionadas (`devuelta`). */
  onRecuperar: (ordenes: RecepcionSateliteDTO[]) => void;
  /**
   * Feature 149 (R35/R37): abre el modal de "Deshacer asignación" con las seleccionadas
   * (`por_recoger`). NO depende de `puedeAsignar`: el cierre de día pendiente de un
   * mensajero bloquea asignar, pero no revertir (Q1 CERRADA, R19).
   */
  onDeshacerAsignacion: (ordenes: RecepcionSateliteDTO[]) => void;
  /**
   * Feature 262 (F4, R13/R14): abre el modal de «Cambiar día de reparto» con las seleccionadas
   * (`por_recoger`). Como «Deshacer asignación», NO depende de `puedeAsignar`: un cierre de día
   * pendiente bloquea asignar, pero no corregir el día — es la regla 2 de la 241 y el mismo
   * criterio con el que la 149 cerró su Q1. La corrección no mueve dinero, no crea una gestión y
   * no cambia de estado.
   */
  onCambiarDiaReparto: (ordenes: RecepcionSateliteDTO[]) => void;
  /** `true` mientras el envío a central está en vuelo (deshabilita el botón). */
  enviandoACentral?: boolean;
  /** `true` mientras la recuperación está en vuelo. */
  recuperando?: boolean;
  /**
   * Feature 158 (R48): `true` si el actor no tiene zona asignada. Sin zona no tiene alcance
   * sobre NADA, así que no se le ofrece reportar incidentes sobre ninguna fila.
   */
  sinZona?: boolean;
  /** Feature 158 (T2.7): qué hacer tras reportar un incidente (el módulo relee del servidor). */
  onIncidenteReportado?: () => void;
}

export function SateliteOrdenesListado({
  ordenes,
  total,
  totalSinFiltros,
  catalogo,
  onFiltroChange,
  onOrdenChange,
  obtenerFilasDescarga,
  comprobarVigencia,
  resetSeleccion = 0,
  cargando = false,
  errorCarga = null,
  zonaNombre,
  puedeAsignar,
  onAsignar,
  onEnviarACentral,
  onRecuperar,
  onDeshacerAsignacion,
  onCambiarDiaReparto,
  enviandoACentral = false,
  recuperando = false,
  sinZona = false,
  onIncidenteReportado,
}: Readonly<SateliteOrdenesListadoProps>) {
  // SL-20 (R19): columnas, filtros y descarga con los nombres de nivel del país de la empresa.
  const etiquetas = useEtiquetasGeograficas();
  const [seleccion, setSeleccion] = useState<FilterSelection>({});
  /**
   * SLT-222 (R1500, D2) — las órdenes MARCADAS, por id y con su fila: el modelo de `/ordenes`.
   * Antes era un `Set` de ids acotado a la página visible; con la fila guardada, una marcada
   * en otra búsqueda o página puede entrar en la acción aunque no se vea. Sobrevive a
   * búsquedas, filtros, vistas, «Limpiar todo» y páginas; la vacían «Limpiar» y
   * `resetSeleccion`, y la poda retira las que salieron del listado.
   */
  const [marcadas, setMarcadas] = useState<ReadonlyMap<string, RecepcionSateliteDTO>>(
    new Map(),
  );
  const seleccionados = useMemo(() => new Set(marcadas.keys()), [marcadas]);

  // R1509: la fila guardada de una marcada se sustituye por la que acaba de llegar del
  // servidor. Patrón "ajustar estado durante el render", como en `OrdenesModule`.
  const [ordenesPrevias, setOrdenesPrevias] = useState(ordenes);
  if (ordenes !== ordenesPrevias) {
    setOrdenesPrevias(ordenes);
    const refrescada = refrescarSeleccion(marcadas, ordenes);
    if (refrescada !== marcadas) setMarcadas(refrescada);
  }

  // R1508: tras una acción por lote con éxito el módulo incrementa la señal y se desmarca todo.
  const [resetSeleccionPrevio, setResetSeleccionPrevio] = useState(resetSeleccion);
  if (resetSeleccion !== resetSeleccionPrevio) {
    setResetSeleccionPrevio(resetSeleccion);
    setMarcadas(new Map());
  }

  /**
   * Término del BUSCADOR, aparte de la selección agregada: `FilterComponent` emite SU
   * selección completa en cada cambio, así que guardarlo ahí dentro lo borraría al marcar un
   * cantón. Mismo reparto que en `/ordenes`.
   */
  const [termino, setTermino] = useState("");
  /** Claves de los filtros PUESTOS en la barra desde el selector (la barra nace con el buscador). */
  const [filtrosActivos, setFiltrosActivos] = useState<string[]>([]);
  /** Contador de "Limpiar todo": `FilterComponent` es dueño de su selección, se remonta limpio. */
  const [resetFiltros, setResetFiltros] = useState(0);

  /**
   * SLT-210 (R1408-R1410) — las vistas guardadas, con la MISMA costura que `OrdenesListado`
   * (ficha 453): la señal de siembra repone el término y la selección en los dos canónicos sin
   * remontarlos, y `vistaPuestaId` dice qué vista está puesta hasta el primer cambio del filtro.
   * El ORDEN no entra en la vista (P1 de la 453): aplicar una no reordena la tabla.
   */
  const [senalSiembra, setSenalSiembra] = useState(0);
  const [siembraTermino, setSiembraTermino] = useState("");
  const [siembraSeleccion, setSiembraSeleccion] = useState<FilterSelection>({});
  const [vistaPuestaId, setVistaPuestaId] = useState<string | null>(null);

  /**
   * SLT-210 (R1401/R1402) — el orden, en sus DOS dimensiones y con los valores iniciales de
   * `/ordenes`. Dos estados y no uno: cambiar el campo no toca la dirección. El servidor lo
   * aplica DENTRO de cada grupo de estado (P2), así que entrar enseña el listado de siempre.
   */
  const [sortBy, setSortBy] = useState<CampoOrdenOfrecido>(CAMPO_ORDEN_INICIAL);
  const [sortDir, setSortDir] = useState<DireccionOrden>(DIRECCION_ORDEN_INICIAL);

  function cambiarCampoOrden(campo: CampoOrdenOfrecido) {
    setSortBy(campo);
    onOrdenChange?.({ sortBy: campo, sortDir });
  }

  function cambiarDireccionOrden(direccion: DireccionOrden) {
    setSortDir(direccion);
    onOrdenChange?.({ sortBy, sortDir: direccion });
  }

  /**
   * FICHA 355 — el catálogo `order_status`, con la MISMA clave de SWR que `/ordenes`
   * (`"order-status:catalogo"`): las dos pantallas leen exactamente lo mismo, así que
   * compartir la entrada de caché es lo correcto y no una casualidad.
   *
   * Va aquí y no por props porque no es un dato sensible ni acotado por rol: es el catálogo
   * de estados, legible por todo el personal interno (feature 63/R2). Mismo reparto que en
   * la central, que también lo pide desde el cliente.
   */
  const { data: estatus } = useSWR<OrderStatusLiteRow[]>(
    "order-status:catalogo",
    estatusFetcher,
  );

  // R46: las opciones salen del CATÁLOGO de la zona, no de la página visible. Elegir un
  // cantón tampoco borra los demás del desplegable: el catálogo no depende de la selección.
  // Sin catálogo, los controles se declaran igual pero deshabilitados (R64 de la 144).
  //
  // FICHA 355: el de ESTADO viene de OTRA fuente (`estatus`), así que ni se deshabilita con el
  // catálogo geográfico caído ni espera a él — exactamente el reparto de `/ordenes`.
  const filtros = useMemo(
    () =>
      construirFiltrosSatelite(catalogo ?? CATALOGO_FILTROS_VACIO, {
        estatus,
        etiquetas,
      }).map((f) =>
        catalogo === null && f.key !== CLAVE_ESTADO ? { ...f, disabled: true } : f,
      ),
    [catalogo, estatus, etiquetas],
  );

  /** Lo que ofrece el selector de la barra: cada filtro declarado, por su clave y su etiqueta. */
  const filtrosOfrecidos = useMemo(
    () => filtros.map((f) => ({ key: f.key, label: f.label })),
    [filtros],
  );

  /** Solo se montan los filtros PEDIDOS, en el orden en que se declararon. */
  const filtrosMontados = useMemo(
    () => filtros.filter((f) => filtrosActivos.includes(f.key)),
    [filtros, filtrosActivos],
  );

  /**
   * SLT-210 (R1414) — ¿se puede comprobar una vista ahora? El mismo criterio que `/ordenes`
   * (R29 de la 453): con el catálogo geográfico o el de estados sin cargar, ninguna vista se
   * presenta como incompleta. «El catálogo no está» no es «el valor desapareció».
   */
  const catalogoVistas = useMemo<CatalogoVistas>(
    () =>
      catalogo !== null && (estatus?.length ?? 0) > 0
        ? catalogoCargado(filtros)
        : catalogoNoDisponible(),
    [catalogo, estatus, filtros],
  );

  /** SLT-210 (R1408) — lo que hay puesto ahora, en el formato que se guarda. Sin el orden. */
  const filtroActual = useMemo<VistaFiltroPayload>(
    () => ({
      v: VISTA_FILTRO_VERSION,
      termino,
      activos: filtrosActivos,
      seleccion,
    }),
    [termino, filtrosActivos, seleccion],
  );

  /** `true` si hay algún filtro marcado (cambia el contador y el mensaje de vacío). */
  const hayFiltros =
    termino !== "" || Object.values(seleccion).some((valores) => valores.length > 0);

  /*
   * FICHA 355 — los estados elegidos que este listado no alcanza, y qué se dice de ellos.
   *
   * Se derivan de la SELECCIÓN vigente, no de un estado paralelo: así lo que la pantalla
   * explica y lo que se le pidió al servidor no pueden desincronizarse ni por un render.
   *
   * `soloEstadosFuera` separa los dos casos, que NO dicen lo mismo:
   *   - MEZCLA (`entregada` + `devuelta`): el resultado es correcto —las devueltas—, pero sin
   *     avisar parecería un filtro ignorado en silencio.
   *   - SOLO INALCANZABLES (`entregada` a secas): el resultado es CERO y hay que decir por qué.
   *
   * Los dos se pintan en el MISMO sitio (bajo el contador) y con el mismo tamaño; sólo cambia
   * el texto. El porqué de ese sitio está en `mensajeEstadosFueraDelListado`.
   */
  const estadosElegidos = seleccion[CLAVE_ESTADO] ?? [];
  const etiquetasFuera = estadosFueraDelListado(seleccion).map(etiquetaEstado);
  const soloEstadosFuera =
    estadosElegidos.length > 0 && etiquetasFuera.length === estadosElegidos.length;

  function emitir(nueva: FilterSelection, terminoNuevo: string) {
    // SLT-222 R1501/R1502: emitir un filtro o un término NO toca lo marcado (antes lo vaciaba,
    // R27 de la 188): la persona busca, marca, busca la siguiente… y actúa sobre todas.
    // El término entra como UN filtro más, bajo su misma clave, para que
    // `seleccionAFiltroSatelite` siga siendo el único punto que conoce la forma del filtro.
    const completa: FilterSelection =
      terminoNuevo !== "" ? { ...nueva, [CLAVE_BUSQUEDA]: [terminoNuevo] } : nueva;
    onFiltroChange(seleccionAFiltroSatelite(completa));
  }

  /**
   * Filtrar cambia el CONJUNTO, así que la página que se está viendo puede no existir en el
   * nuevo resultado. Se emite el filtro (el módulo vuelve a la página 1). Las marcadas se
   * quedan (SLT-222 R1502): el contador dice cuántas no se ven.
   */
  // SLT-210 (R1410): los tres cambios del filtro apagan la vista puesta.
  function cambiarFiltros(nueva: FilterSelection) {
    setSeleccion(nueva);
    setVistaPuestaId(null);
    emitir(nueva, termino);
  }

  function cambiarTermino(nuevo: string) {
    setTermino(nuevo);
    setVistaPuestaId(null);
    emitir(seleccion, nuevo);
  }

  function cambiarActivos(claves: string[]) {
    setFiltrosActivos(claves);
    setVistaPuestaId(null);
  }

  /**
   * Deja la barra como recién abierta: sin término, sin valores y sin filtros puestos.
   * SLT-210 (R1407/R1410): apaga la vista puesta y NO toca el orden —«Limpiar todo» deshace lo
   * que esconde filas, y el orden no esconde ninguna (mismo criterio que `/ordenes`, ficha 356)—.
   */
  function limpiarFiltros() {
    setSeleccion({});
    setTermino("");
    setFiltrosActivos([]);
    setResetFiltros((n) => n + 1);
    // SLT-222 R1502: «Limpiar todo» limpia la BARRA, no lo marcado (eso es «Limpiar»).
    setVistaPuestaId(null);
    onFiltroChange({});
  }

  /**
   * SLT-210 (R1409) — REPONER UNA VISTA: los tres estados de la barra a la vez, la señal de las
   * dos siembras y la vista marcada como puesta. Las siembras no emiten, así que el filtro nuevo
   * se emite aquí una sola vez (el módulo vuelve a la página 1). El orden no se toca.
   */
  function aplicarVista(vistaId: string, filtro: VistaFiltroPayload) {
    // Un valor puesto sin su control montado sería un filtro invisible y aplicado.
    const activos = [
      ...filtro.activos,
      ...Object.keys(filtro.seleccion).filter((clave) => !filtro.activos.includes(clave)),
    ];
    setFiltrosActivos(activos);
    setSeleccion(filtro.seleccion);
    setTermino(filtro.termino);
    setSiembraTermino(filtro.termino);
    setSiembraSeleccion(filtro.seleccion);
    setSenalSiembra((n) => n + 1);
    setVistaPuestaId(vistaId);
    emitir(filtro.seleccion, filtro.termino);
  }

  function toggleUno(orden: RecepcionSateliteDTO, checked: boolean) {
    setMarcadas((prev) => {
      const next = new Map(prev);
      if (checked) next.set(orden.id, orden);
      else next.delete(orden.id);
      return next;
    });
  }

  // R1512/R1513: marca o desmarca SOLO las filas visibles; lo de fuera se queda.
  function toggleTodos(filas: readonly RecepcionSateliteDTO[], checked: boolean) {
    setMarcadas((prev) => {
      const next = new Map(prev);
      for (const orden of filas) {
        if (checked) next.set(orden.id, orden);
        else next.delete(orden.id);
      }
      return next;
    });
  }

  /**
   * SLT-222 R1505 — las seleccionadas que ACTÚAN son TODAS las marcadas: las de la página
   * visible (dato fresco) y las de otras búsquedas o páginas, con su fila guardada. Sustituye
   * a R47 de la 170, que acotaba la acción a la página visible y avisaba de lo que quedaba
   * fuera (Q-K7). Ahora el contador dice cuántas no se ven y la acción se las lleva.
   */
  const seleccionadas = useMemo(
    () => filasSeleccionadas(marcadas, ordenes),
    [marcadas, ordenes],
  );

  /**
   * Feature 184 — Tanda A (T A.5, R18-R26) — LA PODA de la selección.
   *
   * La selección sobrevive a páginas y búsquedas (a propósito, SLT-222), pero una orden
   * marcada puede dejar de estar en el listado —por ejemplo al reportarle un incidente, que la
   * saca del flujo—. Sin poda la marca seguiría viva, invisible, y el contador contaría
   * órdenes que ya no existen ahí.
   *
   * Qué hace: tras cada lectura del listado, si hay marcas FUERA de la página visible,
   * pregunta al servidor cuáles siguen en el listado de la bodega y se queda con
   * `marcadas ∩ (idsPágina ∪ vigentes)`. La pertenencia la decide el servidor sobre el
   * listado entero SIN filtros ni término (SLT-222 R1514, antes R19/R25: el conjunto
   * filtrado), nunca la página ni la búsqueda vigente: una marca no se pierde por el solo
   * hecho de no verse (R20) ni por no cumplir la búsqueda actual.
   *
   * Q3 CERRADA (decisión del humano): al podar NO se avisa. La poda corrige un número que
   * estaba mal; el contador simplemente pasa a ser correcto, y un tercer mensaje en una barra
   * que ya dice dos cosas sería ruido — el mismo criterio con el que se decidió el aviso.
   *
   * El disparador es la IDENTIDAD de la página recibida, que cambia una vez por lectura del
   * servidor (navegar, `mutate()` tras una acción, revalidar). La selección se lee de una ref
   * y no de las dependencias, para que podar —que cambia la selección— no encadene otra
   * comprobación (R24).
   */
  const podaRef = useRef({ seleccionados, comprobarVigencia });
  useEffect(() => {
    podaRef.current = { seleccionados, comprobarVigencia };
  });

  useEffect(() => {
    // Sin página que comparar no hay nada que decidir: durante la carga `ordenes` está vacío
    // y todo lo marcado parecería estar fuera (R28: la carga no consulta vigencia).
    if (cargando) return;
    const { comprobarVigencia: comprobar, seleccionados: marcados } = podaRef.current;
    if (!comprobar || marcados.size === 0) return;
    const enPagina = new Set(ordenes.map((orden) => orden.id));
    const fuera = [...marcados].filter((id) => !enPagina.has(id));
    // R23: sin marcas fuera de la vista no hay nada que comprobar — ni una consulta.
    if (fuera.length === 0) return;

    let vigente = true;
    void comprobar(fuera).then((vigentes) => {
      // La respuesta de una página que ya no está a la vista se descarta: `enPagina` sería de
      // otra página y la intersección conservaría lo que no debe.
      if (!vigente || vigentes === null) return; // R22: no se pudo comprobar ⇒ no se poda
      const conservar = new Set(vigentes);
      setMarcadas((prev) => {
        const podado = new Map(
          [...prev].filter(([id]) => enPagina.has(id) || conservar.has(id)),
        );
        // R24: si no retira nada, NO se reemplaza el Map. Uno nuevo equivalente sería un
        // re-render y, con él, una segunda comprobación que no cambia nada.
        return podado.size === prev.size ? prev : podado;
      });
    });
    return () => {
      vigente = false;
    };
  }, [ordenes, cargando]);

  // La acción disponible sale del estado COMÚN de lo seleccionado: con una selección
  // mixta no hay transición única que ofrecer.
  const estadosSeleccionados = new Set(
    seleccionadas.map((orden) => orden.estatusValue),
  );
  const estadoUnico =
    estadosSeleccionados.size === 1 ? [...estadosSeleccionados][0] : null;
  const haySeleccion = seleccionadas.length > 0;
  // El texto del contador de selección (`role="status"`): el TOTAL marcado y cuántas no se ven
  // (SLT-222 R1506/D8, mismo texto que `/ordenes`), más el estado común de TODAS las marcadas.
  const textoSeleccion = `${textoContadorSeleccion(
    seleccionadas.length,
    contarFueraDeVista(marcadas, ordenes),
  )}${estadoUnico === null ? " · estados mezclados" : ` · ${etiquetaEstado(estadoUnico)}`}`;

  /**
   * R48 — `true` si hay al menos una orden de ese estado ENTRE LAS SELECCIONADAS.
   *
   * Antes miraba el conjunto a la vista, que era todo el conjunto del actor. Con la tabla
   * paginada eso se rompe en los dos sentidos: un botón dejaría de ofrecerse por estar sus
   * órdenes en otra página, y —lo grave— una acción de lote decidida sobre el contenido del
   * listado puede acabar moviendo paquetes que el usuario no eligió. La decisión se toma
   * sobre lo SELECCIONADO, que es también lo que la acción recibe.
   */
  function hayEstado(estado: string): boolean {
    return seleccionadas.some((orden) => orden.estatusValue === estado);
  }

  // Feature 101 (R8/R10): el resalte por plazo de reasignación solo aplica a las órdenes que
  // ESPERAN reasignación en la bodega (`en_bodega_satelite`). Al juntar los cinco estados en
  // una tabla, una devuelta con `prioridad=true` heredada del DTO habría empezado a resaltar;
  // se neutraliza el flag para el resto de estados, que es lo que ya hacía tener una tabla
  // por grupo. No se toca el DTO original: la copia es solo para pintar.
  const filas = useMemo(
    () =>
      ordenes.map((orden) =>
        orden.estatusValue === ESTADO_ASIGNABLE || !orden.prioridad
          ? orden
          : { ...orden, prioridad: false },
      ),
    [ordenes],
  );

  const columnas = useMemo<Column<RecepcionSateliteDTO>[]>(
    () => [
      {
        id: "seleccionar",
        value: "Seleccionar",
        // R47 / SLT-222 R1512-R1513: "seleccionar todo" marca y desmarca EXACTAMENTE las filas
        // de la página visible; lo marcado fuera de ella se queda.
        renderHeader: () => {
          const ids = ordenes.map((orden) => orden.id);
          return (
            <SelectAllCheckbox
              selectableIds={ids}
              selectedIds={seleccionados}
              onToggleAll={(checked) => toggleTodos(ordenes, checked)}
              ariaLabel="Seleccionar todas las órdenes de esta página"
            />
          );
        },
        render: (orden: RecepcionSateliteDTO) => (
          <Checkbox
            checked={seleccionados.has(orden.id)}
            onCheckedChange={(checked) => toggleUno(orden, checked === true)}
            aria-label={`Seleccionar ${orden.numRemision}`}
          />
        ),
      },
      // Feature 101/R8: badge "Prioritaria" sobre la primera columna de datos.
      //
      // FICHA 349 — `recibidasColumns()` ya no recibe la zona del actor, y no es un descuido:
      // las columnas son las de `/ordenes` tal cual, y allí el chip de estado lee la zona DE
      // LA FILA (`relaciones.zona.nombre`), no la del actor. `zonaNombre` sigue haciendo falta
      // más abajo, para la regla de disponibilidad del incidente (R48).
      ...conBadgePrioridad(recibidasColumns(etiquetas)),
      // FICHA 367 — la columna pasa de "Incidente" a "Acciones" y agrupa DOS disparadores,
      // igual que `/ordenes` (`OrdenesModule`, columna `acciones`):
      //
      //   · Historial (feature 49): SIEMPRE se pinta. Es de solo lectura y no cuelga de
      //     ninguna regla de disponibilidad por fila — la autoriza la Server Action por
      //     visibilidad de la orden, no por estado.
      //   · Incidente (feature 158, T2.7): la fila la ofrece siempre que el estado sea un
      //     origen válido (R41) Y la orden esté en la zona del actor (R48).
      //     `puedeReportarIncidenteSatelite` sigue decidiendo ESO Y SOLO ESO —la regla NO se
      //     relaja—; el componente no renderiza nada cuando no está disponible.
      {
        id: "acciones",
        value: "Acciones",
        render: (orden: RecepcionSateliteDTO) => (
          <div className="flex items-center gap-1">
            <HistorialOrdenSheet ordenId={orden.id} referencia={orden.numRemision} />
            <ReportarIncidenteAccion
              orden={orden}
              disponible={puedeReportarIncidenteSatelite(orden, zonaNombre, sinZona)}
              onSuccess={onIncidenteReportado}
            />
          </div>
        ),
      },
    ],
    [seleccionados, zonaNombre, ordenes, sinZona, onIncidenteReportado, etiquetas],
  );

  return (
    <section aria-label={TITULO_BODEGA} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{TITULO_BODEGA}</h2>

      {/* Barra de acciones de lote: aparece con la selección y ofrece SOLO la transición
          válida para el estado común de lo seleccionado. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-muted-foreground">
          {haySeleccion
            ? textoSeleccion
            : /* R42: los DOS números son totales del servidor. El de la izquierda responde
                 a los filtros vigentes; el de la derecha es el conjunto del actor. Ninguno
                 sale de las filas de la página, que es lo que R42 prohíbe. */
              hayFiltros
              ? `${total} de ${totalSinFiltros} órdenes`
              : `${total} órdenes`}
          {/* SLT-222 R1505: aquí vivía el aviso Q-K7 («…marcadas en otras páginas que no
              entran en esta acción»). Ya no aplica: la acción se lleva TODAS las marcadas y
              el contador dice cuántas no se ven («· M fuera de esta búsqueda»). */}
          {/* FICHA 355 — la explicación de los estados que este listado no alcanza.
              Una nota subordinada al contador, no un tercer mensaje al mismo nivel. Y aquí
              y no en el vacío de la
              tabla porque a 390 px aquella celda queda fuera de la vista (ver
              `mensajeEstadosFueraDelListado`). */}
          {etiquetasFuera.length > 0 ? (
            <span className="mt-0.5 block text-xs">
              {mensajeEstadosFueraDelListado(etiquetasFuera, soloEstadosFuera)}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* R48: cada acción se ofrece si hay órdenes de su estado SELECCIONADAS, y se
              habilita solo cuando lo seleccionado es todo de ese estado: son transiciones
              distintas y no se mezclan en un mismo lote. Sin nada marcado no se ofrece
              ninguna —no hay nada sobre lo que actuar—. */}
          {hayEstado(ESTADO_ASIGNABLE) ? (
            <Button
              type="button"
              onClick={() => onAsignar(seleccionadas)}
              disabled={estadoUnico !== ESTADO_ASIGNABLE || !puedeAsignar}
            >
              Asignar
            </Button>
          ) : null}
          {/* Feature 149 (R35/R36): solo `por_recoger`. El caso (b)
              (`en_ruta_bodega_satelite`) no llega a este listado —vive en "Por recibir"— y
              es competencia de la bodega central. */}
          {hayEstado(ESTADO_POR_RECOGER) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onDeshacerAsignacion(seleccionadas)}
              disabled={estadoUnico !== ESTADO_POR_RECOGER}
            >
              Deshacer asignación
            </Button>
          ) : null}
          {/* Feature 262 (F4, R13, design §4.1) — el adminSatelite llega a la corrección SIN
              pasar por `/ordenes`, que le hace `notFound()`. Es la razón de que esta ficha
              tenga DOS superficies y no una: quien elige el día al asignar tiene que poder
              arreglarlo, y esa exclusión no está en ninguna regla de rol —está en un
              `notFound()` de una página, donde ningún test de rol la vería.

              Sólo `por_recoger`: los otros dos estados donde el día sigue vivo (`en_reparto`,
              `ayuda_tienda`) no están entre los cinco que este listado ofrece. Ésa es la
              escalera de dos peldaños del límite declarado 5, y el de arriba —maestro/admin
              desde `/ordenes`, cualquier zona— llega a todo.

              Mismo `disabled` por estado mixto que las demás acciones de esta barra: son
              transiciones distintas y no se mezclan en un mismo lote. */}
          {hayEstado(ESTADO_POR_RECOGER) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onCambiarDiaReparto(seleccionadas)}
              disabled={estadoUnico !== ESTADO_POR_RECOGER}
            >
              {CAMBIAR_DIA_ACCION}
            </Button>
          ) : null}
          {hayEstado(ESTADO_POR_DEVOLVER) ? (
            <Button
              type="button"
              onClick={() => onEnviarACentral(seleccionadas)}
              disabled={estadoUnico !== ESTADO_POR_DEVOLVER || enviandoACentral}
            >
              {enviandoACentral ? "Enviando…" : "Enviar a central"}
            </Button>
          ) : null}
          {hayEstado(ESTADO_DEVUELTA) ? (
            <Button
              type="button"
              onClick={() => onRecuperar(seleccionadas)}
              disabled={estadoUnico !== ESTADO_DEVUELTA || recuperando}
            >
              {recuperando ? "Recuperando…" : "Recuperar"}
            </Button>
          ) : null}
          {haySeleccion && estadoUnico === null ? (
            <p className="text-sm text-muted-foreground">
              Selecciona órdenes del mismo estado para actuar sobre ellas.
            </p>
          ) : null}
          {/* SLT-222 R1507: «Limpiar» desmarca TODO, visible o no, como en `/ordenes`. Es la
              única forma de quitar de golpe lo marcado en otras búsquedas. */}
          {haySeleccion ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setMarcadas(new Map())}>
              Limpiar
            </Button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={columnas}
        data={filas}
        rowKey="id"
        ariaLabel={TITULO_BODEGA}
        // Pedido humano (2026-08-25): la barra va DENTRO de la tabla, en la misma línea que el
        // control de descarga — exactamente como en `/ordenes`. Antes colgaba encima de la
        // sección, así que las dos superficies que comparten los MISMOS controles los
        // presentaban en dos sitios distintos. La tabla no mira lo que le pasan (`filtros` es un
        // `ReactNode` opaco): solo lo coloca.
        filtros={
          <BuscadorFiltros
            escaneo
            // SLT-160 (R772, DC2): nombre accesible propio del listado.
            label="Buscar órdenes de la bodega"
            placeholder={PLACEHOLDER_BUSQUEDA}
            minChars={BUSQUEDA_MIN_CHARS}
            onChange={cambiarTermino}
            filtros={filtrosOfrecidos}
            activos={filtrosActivos}
            onActivosChange={cambiarActivos}
            // SLT-210 (R1409): la costura de la 453 para reponer el término de una vista.
            siembra={{ senal: senalSiembra, termino: siembraTermino }}
            // SLT-210 (R1400/R1411): el control «Vistas», al principio de la fila, con su
            // superficie PROPIA. Las vistas son de cada usuario (P1), como en `/ordenes`.
            vistas={{
              superficie: "ordenes-bodega-satelite",
              filtroActual,
              catalogo: catalogoVistas,
              vistaPuestaId,
              onAplicar: aplicarVista,
              onGuardada: setVistaPuestaId,
            }}
            // "Limpiar todo" lo pone la barra al final de la fila, igual que en `/ordenes`.
            onLimpiarTodo={limpiarFiltros}
            hayFiltrosAplicados={filtrosActivos.length > 0 || hayFiltros}
          >
            {/* SLT-210 (R1400/R1413) — los dos conmutadores de orden de `/ordenes`, en el mismo
                sitio (primeros hijos, tras «Vistas»), en solo icono y con el mismo tamaño: no
                se les pasa ninguna clase propia. */}
            <SegmentedToggle
              ariaLabel={ETIQUETA_CAMPO_ORDEN}
              options={OPCIONES_CAMPO_ORDEN}
              valor={sortBy}
              onChange={cambiarCampoOrden}
              soloIcono
            />
            <SegmentedToggle
              ariaLabel={ETIQUETA_DIRECCION[sortBy]}
              options={OPCIONES_DIRECCION[sortBy]}
              valor={sortDir}
              onChange={cambiarDireccionOrden}
              soloIcono
            />
            {filtrosMontados.length > 0 ? (
              <FilterComponent
                key={resetFiltros}
                filters={filtrosMontados}
                onChange={cambiarFiltros}
                debounceMs={0}
                siembra={{ senal: senalSiembra, seleccion: siembraSeleccion }}
              />
            ) : null}
          </BuscadorFiltros>
        }
        // R52: el control descarga el CONJUNTO con los filtros vigentes; el callback lo baja
        // el módulo. Las columnas del archivo las declara esta tabla (T A.2).
        descarga={{
          titulo: TITULO_BODEGA,
          columnas: columnasDescargaSatelite(etiquetas),
          obtenerFilas: obtenerFilasDescarga,
        }}
        isLoading={cargando}
        error={errorCarga}
        rowClassName={resaltarFilaPrioridad}
        emptyMessage={
          /* FICHA 355: el vacío por un estado inalcanzable NO se explica aquí, sino bajo el
             contador. Este `<td>` vive dentro del scroll horizontal de la tabla y a 390 px
             queda fuera de la vista; ahí la explicación no llegaría a leerse nunca. */
          hayFiltros
            ? "Ninguna orden coincide con los filtros."
            : "No hay órdenes en la bodega."
        }
      />
    </section>
  );
}
