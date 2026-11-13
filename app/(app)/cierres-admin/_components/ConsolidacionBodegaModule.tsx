"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Modal } from "@/components/shared/Modal";
import { Pagination } from "@/components/shared/Pagination";
import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import { ColaCierres } from "@/components/private/cierres/cola/ColaCierres";
import * as L from "@/components/private/cierres/cola/cola-cierres-labels";
import {
  piePorConsolidar,
  tarjetasAConsolidar,
  tarjetasSolicitados,
  type PestanaConsolidar,
} from "@/components/private/cierres/cola/cola-cierres-vista";
// SLT-107 (R292, R295): el mismo montaje del detalle de bodega que la central, con audiencia satélite.
import {
  DetalleCierreBodegaAbierto,
  type CierreBodegaDetalleOk,
} from "@/components/private/cierres/detalle/DetalleCierreBodegaAbierto";
import {
  VisorEvidencia,
  type EvidenciaAbierta,
} from "@/components/private/cierres/dialogos/VisorEvidencia";
import { RESUMEN_SOLICITUD_BODEGA_TEXTO } from "@/components/private/cierres/dialogos/dialogos-labels";
import { money } from "@/lib/config/moneda";
import type { DataTableDescarga } from "@/components/shared/DataTable";
import {
  CATALOGO_FILTROS_CIERRES_VACIO,
  type CatalogoFiltrosCierresDTO,
  type FiltrosCierresBodega,
} from "@/lib/types/filtros-cierres";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import { useToast } from "@/hooks/useToast";
import { cierreConfig } from "@/lib/config/cierre";
import { cierreBodegaConfig } from "@/lib/config/cierre-bodega";
import {
  solicitarCierreBodega,
  listarConsolidablesPaginado,
  listarCierresBodegaSolicitadosPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import type {
  BloqueoConsolidacion,
  CierreBodegaResumen,
  CierreConsolidableCola,
  ResumenSolicitados,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import { hrefDetalleCierre } from "./cierre-enlace";
import { FiltrosCierresBarra } from "./FiltrosCierresBarra";
import {
  AMBITO_DESCARGA_BODEGA_SOLICITADOS,
  AMBITO_DESCARGA_CONSOLIDABLES,
  COLUMNAS_DESCARGA_BODEGA_SOLICITADOS,
  COLUMNAS_DESCARGA_CONSOLIDABLES,
  filaDescargaBodegaSolicitado,
  filaDescargaConsolidable,
} from "./cierres-bodega-descarga-columnas";
import { descargarDatos } from "@/components/shared/descarga-datos";
import { obtenerResumenCierresBodega } from "./cierres-bodega-modelo-nuevo-descarga";

/** Nombre visible del listado de consolidables: hoja, archivo y control (R12/R13). */
const TITULO_DESCARGA_CONSOLIDABLES = "Cierres del día a consolidar";
/** Nombre accesible del control (R43). Propio: la pantalla monta dos listados paginados. */
export const PAGINACION_CONSOLIDABLES_LABEL =
  "Paginación de los cierres del día a consolidar";

/** `true` si el objeto no recorta nada: entonces la página pre-cargada del servidor sirve. */
function sinFiltrosBodega(filtros: FiltrosCierresBodega): boolean {
  return Object.values(filtros).every((v) => v === undefined);
}

// --- Pedido humano del 2026-08-16: las dos mitades de esta sección, en pestañas ---
//
// LOS NOMBRES NO SON «Pendientes/Resueltos», y es una decisión, no un descuido. En las otras
// dos secciones esa pareja es exacta —hay una cola de decisión y un histórico de resueltos—;
// aquí las dos mitades son OTRA COSA: lo que todavía no se ha consolidado (cierres del día
// `aprobado` de la zona) y los cierres de BODEGA que esta zona ya solicitó, que incluyen los
// que siguen esperando decisión del maestro. Llamar «Resueltos» a un conjunto que contiene
// solicitudes sin resolver sería una etiqueta falsa en una pantalla de dinero.
// SLT-106: son las pestañas de la cola única (`PestanaConsolidar`); sus textos, en la cola.
const TAB_CONSOLIDAR = "aConsolidar";
const TAB_SOLICITADOS = "solicitados";

// R40: el tamaño sale de la config del dominio (T H.1), nunca de un literal de pantalla.
// Es `cierreConfig` y no `cierreBodegaConfig` porque los comprobantes de este listado son `cierre_dia`
// (T J.1, decisión 9): con la config de bodega, ajustar el tamaño de página de los cierres de
// bodega movería también el de una tabla de cierres del día.
const PAGE_SIZE_OPTIONS = [10, 25, 50].filter((s) => s <= cierreConfig.MAX_PAGE_SIZE);
/** «Solicitados» son cierres de BODEGA: su tope es el de `cierreBodegaConfig`, el de su lista de hoy. */
const PAGE_SIZE_OPTIONS_SOLICITADOS = [10, 25, 50].filter(
  (s) => s <= cierreBodegaConfig.MAX_PAGE_SIZE,
);

/**
 * Feature 170 — FASE 2 (T J.2, R40/R41): la PÁGINA de los consolidables. `total` es el del
 * CONJUNTO —de él sale el contador de cabecera (R42)— y nunca `items.length`.
 */
export interface ConsolidablesPagina {
  /** SLT-106 (R192): la fila de la cola, con «A la central», «Aprobado» y las gestiones ajustadas. */
  items: CierreConsolidableCola[];
  total: number;
  pageSize: number;
}

/**
 * Feature 170 — FASE 2 (T J.2): una página de consolidables. La zona NO viaja en el input: la
 * resuelve el servicio desde la sesión, igual que el listado sin paginar (R44).
 */
async function leerConsolidables(
  page: number,
  pageSize: number,
  filtros: FiltrosCierresBodega,
): Promise<ConsolidablesPagina> {
  const res = await listarConsolidablesPaginado({ page, pageSize, filtros });
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

/**
 * SLT-107 (R52, R290): una página de «Solicitados» CON los filtros de la barra, los mismos que su
 * descarga. La zona no viaja: la resuelve el servicio desde la sesión (R44). SLT-115 (R403): sin
 * zona no se lee nada; la pantalla enseña solo el aviso.
 */
async function leerSolicitados(
  page: number,
  pageSize: number,
  filtros: FiltrosCierresBodega,
): Promise<CierresBodegaSolicitadosPagina> {
  const res = await listarCierresBodegaSolicitadosPaginado({ page, pageSize, filtros });
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

// Feature 40 (T8) — módulo cliente del "Cierre de bodega" del adminSatelite (lado
// SOLICITAR, espejo de la 37 un nivel arriba). Recibe del Server Component padre los
// cierre_dia aprobados consolidables de SU zona (R5), los totales agregados (R10),
// el gate `puedesSolicitar`/`motivoBloqueo` (R6/R7) y su histórico propio (F1.4-h),
// todo ya acotado server-side (R1/R3). La única mutación (Solicitar cierre de
// bodega) va por Server Action y refresca la ruta. Money-safe (R13): los montos son
// STRING; se renderizan con `money()` sin `parseFloat`/`Number`.

export interface ConsolidacionBodegaModuleProps {
  /**
   * Feature 170 — FASE 2 (T J.2, R40/R41): PÁGINA 1 de los cierre_dia `aprobado` sin cierre
   * de bodega de la zona (R5), ya resuelta server-side, más el `total` del conjunto.
   */
  consolidables: ConsolidablesPagina;
  /**
   * Suma snapshot de los consolidables (R10).
   *
   * Feature 170 — FASE 2 (T J.2, R49/R50): los CINCO agregados de dinero de esta pantalla
   * siguen llegando por props, calculados sobre el CONJUNTO COMPLETO en `listarConsolidacion`.
   * NO se derivan de la página, y no es disciplina: dos de ellos —`totalNetoAgregado` y
   * `totalCentralDebeAgregado`— salen de repartir el efectivo entre los pagos INDIVIDUALES
   * ordenados de menor a mayor, y eso no lo produce ni una página ni un `SUM`. Sobre la página
   * visible la pantalla podría decir que la central no debe nada cuando debe 500, y sobre ese
   * número se decide si se cierra la bodega. Como no dependen de la página, R50 sale gratis:
   * cambiar de página no los toca.
   */
  totalesAgregados: CierreTotales;
  /** Feature 39/R18: suma snapshot del pago a mensajeros (STRING), separado de los totales. */
  totalPagoMensajeroAgregado: string;
  /** Feature 56/R17: suma snapshot del ingreso de bodega por rechazos (STRING), separado. */
  totalIngresoBodegaRechazosAgregado: string;
  /**
   * SLT-54 (R71): alguno de los consolidables del CONJUNTO COMPLETO incluye el modelo nuevo. Nombra el
   * total de arriba, así que tampoco se deriva de la página (R49). Obligatorio para que el compilador
   * no deje a la página sin pasarlo.
   */
  incluyeModeloNuevoAgregado: boolean;
  /**
   * Pago a mensajeros que el efectivo NO cubrió (STRING, DERIVADO server-side); lo debe la
   * central. `"0.00"` si el efectivo alcanzó para todos.
   */
  totalCentralDebeAgregado: string;
  /** Gate de "Solicitar cierre de bodega" (R6/R7). */
  puedesSolicitar: boolean;
  /** Texto accionable del bloqueo si `!puedesSolicitar`. */
  motivoBloqueo: string | null;
  /**
   * SLT-106 (R67): «Debe llegar a la central» del CONJUNTO completo, derivado en el servidor con
   * `paraLaCentral()`. Acá no se resta (R71).
   */
  paraLaCentralAgregado: string;
  /** SLT-106 (R195): cierres del conjunto completo, para el texto del pie (R197). */
  cierresAConsolidar: number;
  /** SLT-106 (R195): mensajeros distintos del conjunto, para la nota de «Pago a mensajeros». */
  mensajerosAConsolidar: number;
  /** SLT-106 (R195): por qué no se puede solicitar; `null` = se puede. Elige el texto del pie. */
  bloqueo: BloqueoConsolidacion | null;
  /** SLT-106 (R203): el nombre de la zona para la descripción; `null` si no llega. */
  zonaNombre: string | null;
  /**
   * Feature 170 — FASE 2 (T I.2, R40/R41): PÁGINA 1 del histórico de cierres de bodega de la
   * zona (solo lectura, F1.4-h), ya resuelta server-side, más el `total` del conjunto.
   */
  cierresBodegaPasados: CierresBodegaSolicitadosPagina;
  /**
   * SLT-107 (R68, R287): las cifras de las tarjetas de «Solicitados», de la zona entera y sin
   * filtros, calculadas en `listarConsolidacion`. Aquí no se suma nada (R71).
   */
  solicitadosResumen: ResumenSolicitados;
  /** `true` si el adminSatelite no tiene zona asignada (R4). */
  sinZona: boolean;
  /** Opciones de los filtros (bodegas), resueltas por el Server Component. */
  catalogoFiltros?: CatalogoFiltrosCierresDTO;
}

/**
 * La configuración de descarga de «Cierres del día a consolidar», para la fila de las pestañas.
 *
 * Feature 170 (T J.2, R52) — el listado pinta UNA página; el archivo es el CONJUNTO COMPLETO de
 * consolidables de SU zona, y esa zona la resuelve el servidor desde la sesión: descargar no
 * amplía el alcance ni una fila (R14/R44). Feature 184 — Tanda B (T B.2, R1/R6/R10): lo entrega
 * una lectura DEDICADA, que cuesta una consulta y cero aritmética de dinero. Los cinco agregados
 * de la cabecera siguen llegando por props desde `listarConsolidacion` (R49/R50 de la 170).
 *
 * Pedido humano del 2026-08-16 — con los mismos filtros que la página.
 */
function descargaConsolidables(filtros: FiltrosCierresBodega): DataTableDescarga {
  return {
    titulo: TITULO_DESCARGA_CONSOLIDABLES,
    columnas: COLUMNAS_DESCARGA_CONSOLIDABLES,
    // Ficha 314: enciende el selector de columnas de esta descarga (ámbito propio, R10).
    ambitoColumnas: AMBITO_DESCARGA_CONSOLIDABLES,
    obtenerFilas: () =>
      filasDesdeResultado(
        descargarDatos("listarConsolidablesCompleto", { filtros }),
        filaDescargaConsolidable,
      ),
  };
}

/** La página que pre-carga el Server Component (R44: es la que el usuario ve al entrar). */
export interface CierresBodegaSolicitadosPagina {
  items: CierreBodegaResumen[];
  total: number;
  pageSize: number;
}

/** Nombre visible del listado: hoja, base del archivo y nombre del control (R12/R13). */
const TITULO_DESCARGA = "Cierres de bodega solicitados";
/** Nombre accesible del control (R43). Propio: la pantalla monta varios listados. */
export const PAGINACION_BODEGA_SOLICITADOS_LABEL =
  "Paginación de los cierres de bodega solicitados";

/**
 * La configuración de descarga de «Cierres de bodega solicitados», para que la monte quien
 * pinta la fila de las pestañas (pedido humano del 2026-08-16: el botón va alineado con las pestañas, no en una
 * fila propia encima de la lista). Vive aquí, con el listado del que habla: el título, las
 * columnas y la lectura de la que sale el archivo son suyos.
 *
 * Feature 170 (T I.2, R52) — el listado pinta UNA página; el archivo es el CONJUNTO, cortado en
 * la BASE con el mismo criterio y el mismo orden que la página, y con el tope de filas evaluado
 * en el servidor (R6). El alcance lo aplica el servicio desde la sesión: descargar no amplía lo
 * que el actor podía ver (R44). Pedido humano del 2026-08-16: «el CONJUNTO» pasa a significar
 * «el conjunto FILTRADO» — los `filtros` viajan porque el usuario los puso; el alcance, nunca.
 */
export function descargaBodegaSolicitados(filtros: FiltrosCierresBodega): DataTableDescarga {
  return {
    titulo: TITULO_DESCARGA,
    columnas: COLUMNAS_DESCARGA_BODEGA_SOLICITADOS,
    // Ficha 314: enciende el selector de columnas de esta descarga (ámbito propio, R10).
    ambitoColumnas: AMBITO_DESCARGA_BODEGA_SOLICITADOS,
    // SLT-141 (R384, R385, PA4): «Solicitados» es el «Resumen» de la satélite. Con cierres de bodega
    // del modelo nuevo, el libro (sin «Pago entregado», R386); sin ellos, el archivo de hoy. Esta
    // descarga no pasa las columnas marcadas a `obtenerFilas`: «Cierres modelo anterior» sale con
    // todas las de hoy, en su orden (PA3).
    obtenerFilas: () =>
      obtenerResumenCierresBodega(
        () => descargarDatos("listarCierresBodegaSolicitadosCompleto", { filtros }),
        filaDescargaBodegaSolicitado,
        COLUMNAS_DESCARGA_BODEGA_SOLICITADOS,
        "satelite",
      ),
  };
}

export function ConsolidacionBodegaModule({
  consolidables,
  totalesAgregados,
  totalPagoMensajeroAgregado,
  totalIngresoBodegaRechazosAgregado,
  incluyeModeloNuevoAgregado,
  totalCentralDebeAgregado,
  puedesSolicitar,
  motivoBloqueo,
  paraLaCentralAgregado,
  cierresAConsolidar,
  mensajerosAConsolidar,
  bloqueo,
  zonaNombre,
  cierresBodegaPasados,
  solicitadosResumen,
  sinZona,
  catalogoFiltros = CATALOGO_FILTROS_CIERRES_VACIO,
}: ConsolidacionBodegaModuleProps) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  // Confirmación de "Solicitar cierre de bodega"; true = modal abierto.
  const [confirmar, setConfirmar] = useState(false);

  // Feature 170 — FASE 2 (T J.2, R40/R42/R43): página visible de los consolidables. El control
  // vive AQUÍ, junto al contador (decisión de Q-I6): así la guardia de T H.3 ve esta pantalla
  // como paginada y vigila que el número salga del `total` del servidor.
  //
  // R49/R50: los cinco agregados de dinero NO se tocan. Siguen siendo las props que calculó
  // `listarConsolidacion` sobre el conjunto completo; esta lectura solo recorta lo que la
  // tabla PINTA.
  /**
   * Pedido humano del 2026-08-16 — las dos mitades pasan a ser PESTAÑAS. Arranca en «A
   * consolidar»: es la que tiene trabajo (y de la que salen los cinco agregados de dinero y el
   * botón de solicitar).
   */
  const [tab, setTab] = useState<PestanaConsolidar>(TAB_CONSOLIDAR);

  /**
   * Pedido humano del 2026-08-16 — la misma barra que la mitad del maestro, sin el filtro de
   * mensajero. En esta pantalla el de bodega es casi siempre trivial (el actor tiene UNA zona),
   * pero se ofrece igual: la barra es la misma y lo que ofrece hace lo que dice.
   */
  const [filtros, setFiltros] = useState<FiltrosCierresBodega>({});

  /**
   * Filtrar pide las DOS pestañas con el filtro y devuelve las dos a su página 1 (R291): pedir la 7
   * de un conjunto recién recortado da vacío. Cambiar de pestaña no toca ni filtros ni páginas.
   */
  function aplicarFiltros(next: FiltrosCierresBodega) {
    setFiltros(next);
    setPage(1);
    setPageSolicitados(1);
  }

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(consolidables.pageSize);
  const { data, error } = useSWR(
    ["cierre-bodega:consolidables", page, pageSize, filtros],
    () => leerConsolidables(page, pageSize, filtros),
    {
      // Con un filtro puesto la página 1 pre-cargada es la del conjunto SIN filtrar: servirla
      // sería enseñar cierres que el filtro excluye.
      fallbackData:
        page === 1 && pageSize === consolidables.pageSize && sinFiltrosBodega(filtros)
          ? consolidables
          : undefined,
    },
  );
  const pagina: ConsolidablesPagina = data ?? { items: [], total: 0, pageSize };
  // R44: el esqueleto sólo cuando NO hay nada que pintar (`isLoading` de SWR sigue en `true`
  // mientras revalida aunque haya `fallbackData`).
  const cargando = data === undefined;

  // SLT-107 (R52, R290, R291): «Solicitados» con los MISMOS filtros que «A consolidar». La clave
  // conserva el prefijo de hoy para que el `mutate` tras solicitar la siga revalidando (SL-44).
  const [pageSolicitados, setPageSolicitados] = useState(1);
  const [pageSizeSolicitados, setPageSizeSolicitados] = useState(cierresBodegaPasados.pageSize);
  const { data: dataSolicitados, error: errorSolicitados } = useSWR(
    // Sin zona no hay cola: lo que se ve es la lista de hoy, que lee por su cuenta (R202).
    sinZona ? null : ["cierres-bodega:solicitados", pageSolicitados, pageSizeSolicitados, filtros],
    () => leerSolicitados(pageSolicitados, pageSizeSolicitados, filtros),
    {
      // Igual que «A consolidar»: la página 1 pre-cargada solo vale sin filtros (R290).
      fallbackData:
        pageSolicitados === 1 &&
        pageSizeSolicitados === cierresBodegaPasados.pageSize &&
        sinFiltrosBodega(filtros)
          ? cierresBodegaPasados
          : undefined,
    },
  );
  const paginaSolicitados: CierresBodegaSolicitadosPagina = dataSolicitados ?? {
    items: [],
    total: 0,
    pageSize: pageSizeSolicitados,
  };
  const cargandoSolicitados = dataSolicitados === undefined;

  // SLT-107 (R292): el cierre de bodega abierto en lectura; `null` = cerrado.
  const [detalle, setDetalle] = useState<CierreBodegaDetalleOk | null>(null);
  const [evidencia, setEvidencia] = useState<EvidenciaAbierta | null>(null);

  /**
   * «Ver» (R292, R293): lee el detalle por la MISMA Server Action que la central; el servidor decide
   * si es de su zona. Si no responde `ok`, no se abre nada y se avisa: «no es tuyo» y «no existe»
   * dicen lo mismo, como en el servidor (R50, R281).
   */
  async function abrirDetalle(cierreBodegaId: string) {
    const result = await verCierreBodegaDetalle({ cierreBodegaId });
    if (result.status === "ok") {
      setDetalle(result);
      return;
    }
    if (result.status === "forbidden" || result.status === "no_encontrada") {
      toast.error("No tienes permiso para ver este cierre de bodega.");
    } else if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
    } else {
      toast.error("No se pudo abrir el detalle del cierre de bodega. Inténtalo de nuevo.");
    }
  }

  /** R6-R10: crea la solicitud de cierre de bodega de la zona. */
  async function confirmarSolicitud() {
    const result = await solicitarCierreBodega();
    if (result.status === "ok") {
      toast.success("Cierre de bodega solicitado correctamente.");
      setConfirmar(false);
      // SL-44 (destapado por el E2E `cierre-bodega-satelite`): `router.refresh()` a secas no
      // basta. Las dos listas son `useSWR` con la página del Server Component como
      // `fallbackData`, que SWR usa una sola vez: con datos ya en caché, la consolidación recién
      // creada no salía en «Solicitados» y los cierres consolidados seguían en «A consolidar»
      // hasta recargar. Mismo arreglo que `CierreDiaModule` y `CierresAdminModule`: revalidar
      // todas las páginas de las dos listas.
      void mutate(
        (clave) =>
          Array.isArray(clave) &&
          (clave[0] === "cierre-bodega:consolidables" || clave[0] === "cierres-bodega:solicitados"),
      );
      router.refresh();
      return;
    }
    // conflict (R6 pendientes / R7 vacío / R8 duplicado) → motivo accionable.
    if (result.status === "conflict") {
      toast.error(result.motivo);
    } else if (result.status === "validation_error") {
      // R4: sin zona.
      const primero = Object.values(result.fieldErrors)[0]?.[0];
      toast.error(primero ?? "No se pudo solicitar el cierre de bodega.");
    } else if (result.status === "forbidden") {
      toast.error("No tienes permiso para solicitar el cierre de bodega.");
    } else if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
    } else {
      toast.error("No se pudo solicitar el cierre de bodega. Inténtalo de nuevo.");
    }
    setConfirmar(false);
    router.refresh();
  }

  // R196: las tarjetas pintan el CONJUNTO completo (las props de `listarConsolidacion`), nunca la
  // página: cambiar de página o de filtro no las toca (R49/R50 de la 170).
  const tarjetas = tarjetasAConsolidar({
    totales: totalesAgregados,
    pagoMensajeros: totalPagoMensajeroAgregado,
    ganaBodega: totalIngresoBodegaRechazosAgregado,
    paraLaCentral: paraLaCentralAgregado,
    centralDebe: totalCentralDebeAgregado,
    mensajeros: mensajerosAConsolidar,
    incluyeModeloNuevo: incluyeModeloNuevoAgregado,
  });
  const enConsolidar = tab === TAB_CONSOLIDAR;

  return (
    <section aria-label="Cierre de bodega" className="flex flex-col gap-4">
      {/* R4, SLT-115 (R403): adminSatelite sin zona → SOLO el aviso accionable; ni cola ni lista. */}
      {sinZona ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          No tienes una zona asignada; contacta a tu administrador.
        </p>
      ) : (
        /* ---------- La cola única (SLT-106, R32, R204) ----------
           `ColaCierres` con `tipo` bodega y `rol` satélite: descripción, pestañas con conteo, UNA
           barra con «Descargar» de la pestaña activa, y en «A consolidar» aviso, tarjetas, tabla y
           pie con el botón. SLT-107: «Solicitados» con sus tarjetas, su tabla y su pie (R286-R289).

           LOS CONTEOS salen del `total` del SERVIDOR (R42, R190), nunca de `items.length`. Lo
           vigila `tests/unit/descarga/contadores-cabecera.guardia.test.ts`. Los dos llevan los
           filtros puestos (R290). */
        <ColaCierres
          tipo="bodega"
          rol="satelite"
          descripcion={L.descripcionColaSatelite(zonaNombre)}
          pestanas={[
            { id: TAB_CONSOLIDAR, label: L.PESTANA_A_CONSOLIDAR, conteo: pagina.total },
            // R290: el `total` filtrado del servidor, el mismo que pagina la tabla.
            { id: TAB_SOLICITADOS, label: L.PESTANA_SOLICITADOS, conteo: paginaSolicitados.total },
          ]}
          pestanaActiva={tab}
          onPestana={setTab}
          barra={
            <FiltrosCierresBarra
              catalogo={catalogoFiltros}
              onChange={aplicarFiltros}
              disabled={cargando || cargandoSolicitados}
              sinMensajero
            />
          }
          descargar={
            <DescargarDatasetButton
              {...(enConsolidar ? descargaConsolidables(filtros) : descargaBodegaSolicitados(filtros))}
            />
          }
          filas={pagina.items}
          cargando={cargando}
          error={error ? L.ERROR_A_CONSOLIDAR : null}
          vacio={L.VACIO_A_CONSOLIDAR}
          region={L.REGION_A_CONSOLIDAR}
          acciones={{
            // R193: el mismo camino que el enlace del detalle (`?cierre=`), como SLT-104.
            verSuCierre: (cierreDiaId) => router.push(hrefDetalleCierre(cierreDiaId)),
          }}
          tarjetas={tarjetas}
          totales={totalesAgregados}
          aviso={puedesSolicitar ? null : motivoBloqueo}
          botonPie={{ deshabilitado: !puedesSolicitar, onClick: () => setConfirmar(true) }}
          pie={enConsolidar ? piePorConsolidar(bloqueo, cierresAConsolidar) : undefined}
          paginacion={
            enConsolidar ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={pagina.total}
                disabled={cargando}
                showFirstLast
                siblingCount={1}
                ariaLabel={PAGINACION_CONSOLIDABLES_LABEL}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            ) : null
          }
          solicitados={{
            tarjetas: tarjetasSolicitados(solicitadosResumen),
            filas: paginaSolicitados.items,
            acciones: { ver: (id) => void abrirDetalle(id) },
            cargando: cargandoSolicitados,
            error: errorSolicitados ? L.ERROR_SOLICITADOS : null,
            paginacion: (
              <Pagination
                page={pageSolicitados}
                pageSize={pageSizeSolicitados}
                total={paginaSolicitados.total}
                disabled={cargandoSolicitados}
                showFirstLast
                siblingCount={1}
                ariaLabel={PAGINACION_BODEGA_SOLICITADOS_LABEL}
                onPageChange={setPageSolicitados}
                onPageSizeChange={(s) => {
                  setPageSizeSolicitados(s);
                  setPageSolicitados(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS_SOLICITADOS}
              />
            ),
          }}
        />
      )}

      {/* SLT-107 (R50, R51, R292): el detalle de bodega en lectura. Sin `conciliacion`: el pie solo
          tiene «Cerrar» y no hay fulfillment (lo anula el servidor, R283, y la vista, R51). */}
      {detalle ? (
        <DetalleCierreBodegaAbierto
          detalle={detalle}
          audiencia="satelite"
          onCerrar={() => setDetalle(null)}
          // R294: el mismo camino que la central: cerrar y abrir el cierre del día por su enlace.
          onVerSuCierre={(href) => {
            setDetalle(null);
            router.push(href);
          }}
          onVerEvidencia={setEvidencia}
        />
      ) : null}
      <VisorEvidencia evidencia={evidencia} onClose={() => setEvidencia(null)} />

      {/* Confirmación de "Solicitar cierre de bodega". R48/R207: el resumen con las MISMAS
          props que las tarjetas, formateadas con `money()`. */}
      <Modal
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Solicitar cierre de bodega"
        description="Se consolidarán todos los cierres del día aprobados de tu zona en una solicitud a la bodega central. Esta acción no se puede deshacer."
        confirmLabel="Solicitar cierre de bodega"
        onConfirm={confirmarSolicitud}
        closeOnConfirm={false}
      >
        <dl
          aria-label={RESUMEN_SOLICITUD_BODEGA_TEXTO.region}
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm"
        >
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.recaudado}</dt>
          <dd className="text-right font-medium tabular-nums">{money(totalesAgregados.general)}</dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.pagoMensajeros}</dt>
          <dd className="text-right font-medium tabular-nums">
            {money(totalPagoMensajeroAgregado)}
          </dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.ganaBodega}</dt>
          <dd className="text-right font-medium tabular-nums">
            {money(totalIngresoBodegaRechazosAgregado)}
          </dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.debeLlegar}</dt>
          <dd className="text-right font-semibold tabular-nums">{money(paraLaCentralAgregado)}</dd>
        </dl>
      </Modal>
    </section>
  );
}
