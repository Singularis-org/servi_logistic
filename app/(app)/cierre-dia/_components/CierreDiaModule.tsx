"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/Modal";
import {
  VisorEvidencia,
  type EvidenciaAbierta,
} from "@/components/private/cierres/dialogos/VisorEvidencia";
import { RESUMEN_SOLICITUD_TEXTO } from "@/components/private/cierres/dialogos/dialogos-labels";
import type { DataTableDescarga } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { useToast } from "@/hooks/useToast";
import { cierreConfig } from "@/lib/config/cierre";
import { money } from "@/lib/config/moneda";
import {
  deshacerGestion,
  listarCierresPasadosPaginado,
  solicitarCierre,
  verCierrePasado,
} from "@/lib/actions/cierre-dia";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreOrdenSinGestion,
  CierreRechazoDeTienda,
  CierreTotales,
  CierrePasadoDTO,
  CorreccionCierreDTO,
  ResumenGananciaMensajero,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
// SLT-108 (R59, R161): el detalle de un cierre pasado es el detalle único del módulo, con audiencia
// mensajero. SLT-109 (R61-R63, R240): también el cierre de hoy, el rechazado y el vencido, en página.
import { SeccionSinGestion } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { DetalleCierre } from "@/components/private/cierres/detalle/DetalleCierre";
import { CorregirCierre } from "@/components/private/cierres/detalle/CorregirCierre";
import { RechazosDeTiendaCierre } from "@/components/private/cierres/detalle/RechazosDeTiendaCierre";
import {
  cierreDeLaPagina,
  folioDe,
  vistaMensajeroDesdeCierreDia,
  type CierreReenviable,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import {
  COLUMNAS_DESCARGA_DETALLE_MENSAJERO,
  filaDescargaDetalleMensajero,
} from "@/components/private/cierres/detalle/detalle-cierre-descarga-columnas";
import {
  DESCARGA_GESTIONES_HOY,
  REENVIABLE_ERROR,
  tituloDescargaGestiones,
} from "@/components/private/cierres/detalle/detalle-cierre-labels";
import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
import { gestionesEnOrden } from "@/components/private/cierres/fila/fila-gestion-vista";
// SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (R60): «Cierres solicitados» es
// la cola única de cierres con rol mensajero, en vez de la tira de comprobantes de 2026-08-16.
import { ColaCierres } from "@/components/private/cierres/cola/ColaCierres";
import {
  DESCRIPCION_PROPIA,
  PESTANA_PROPIA,
  REGION_PROPIA,
  VACIO_FILTRADO_PROPIA,
  VACIO_PROPIA,
  tarjetasGanancia,
} from "@/components/private/cierres/cola/cola-propia-vista";
// SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» (R167): la barra de la cola.
import { FiltrosColaPropiaBarra } from "./FiltrosColaPropiaBarra";
import { sinFiltrosPropios, type FiltrosColaPropia } from "@/lib/types/filtros-cierres";
import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import {
  filasLocales,
  filasDesdeResultado,
} from "@/components/shared/descarga-resultado";
import {
  AMBITO_DESCARGA_DIA_CIERRES_PASADOS,
  COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS,
  filaDescargaDiaCierrePasado,
} from "./cierre-dia-descarga-columnas";
import { descargarDatos } from "@/components/shared/descarga-datos";

// Feature 37 (T15, R3-R7/R10/R11/R18): módulo cliente del "Cierre del día". Recibe del Server
// Component padre las gestiones del día, los totales, el gate `puedesSolicitar` + su `motivoBloqueo`,
// el bloqueo y la primera página de «Cierres solicitados». Las mutaciones (Solicitar cierre; feature
// 67: Devolver a gestión) van por Server Action y refrescan la ruta para releer el estado del
// servidor. Los montos llegan como STRING (money-safe): se pintan tal cual, sin `parseFloat`/`Number`.
//
// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página»: la parte de arriba deja de
// ser una pila de paneles («Totales del día», «Ganancia», una tabla por resultado, el aviso de
// bloqueo suelto, «Cierre vencido», «Cierre rechazado», «Corregir el cierre rechazado» y «Solicitar
// cierre») y pasa a ser UN detalle único (`DetalleCierre`) en marco página: el cierre que pide acción
// (R240). Qué cierre es lo decide `cierreDeLaPagina`, pura.

/**
 * Feature 264 (Q1/R30) — lo que el visor de un cierre PASADO tiene cargado del servidor. Es una
 * sola lectura (`verCierrePasado`) y por eso es un solo estado.
 *
 * `sinGestionRegistrado` no se deriva de que la lista esté vacía: `[]` con `true` es «no hubo
 * ninguna» y `[]` con `false` es «no lo sabemos» (R28). Son dos pantallas distintas.
 */
interface DetalleCierrePasado {
  grupos: CierreGrupos;
  ordenesSinGestion: CierreOrdenSinGestion[];
  sinGestionRegistrado: boolean;
  /** FICHA 425 (R14): los rechazos de tienda de ESTE cierre, de la misma lectura que `grupos`. */
  rechazosDeTienda: CierreRechazoDeTienda[];
}

/** Feature 170 — FASE 2 (T I.2): la página de «Cierres solicitados» tal como la da el servidor. */
export interface CierresPasadosPagina {
  items: CierrePasadoDTO[];
  total: number;
  pageSize: number;
}

export interface CierreDiaModuleProps {
  grupos: CierreGrupos;
  totales: CierreTotales;
  /** Feature 39/R11: total DERIVADO a pagar al mensajero (STRING), separado de `totales`. */
  totalPagoMensajero: string;
  puedesSolicitar: boolean;
  motivoBloqueo: string | null;
  /**
   * Feature 170 — FASE 2 (T I.2, R40/R41): PÁGINA 1 de «Cierres solicitados» (R18), ya
   * resuelta server-side, más el `total` del conjunto. Es la ÚNICA lista de esta pantalla que pagina.
   */
  cierresPasados: CierresPasadosPagina;
  /**
   * FEATURE 271 (T9.3): el DETALLE del bloqueo. Trae el veredicto de la regla N/V y DOS cierres:
   * `aResolverPrimero` (el abierto más viejo) y `aReenviarPrimero` (el RE-SOLICITABLE más viejo, lo
   * que él puede tocar, R18). Todo derivado server-side por el MISMO predicado que aplica el servidor
   * al rechazar: la pantalla no re-deriva nada.
   */
  bloqueo: BloqueoDetalle;
  /**
   * FICHA 477 (R25/R26): por cada cierre `rechazado` propio, su motivo, sus gestiones vigentes y
   * sus órdenes en corrección (`listarCierreDia.correcciones`). SLT-109: alimenta la pestaña
   * «Corregir» del rechazado de la página y la del que se abre desde la cola.
   */
  correcciones?: CorreccionCierreDTO[];
  /**
   * SLT-109 (R240, R253): la lectura del cierre por reenviar (`aReenviarPrimero`) que hace
   * `page.tsx`. Opcional para no romper los dobles; ausente con un cierre por reenviar = `error`.
   */
  reenviable?: CierreReenviable;
  /**
   * SLT-112 (R358, R357): las cifras de la ganancia que lee `page.tsx`. Ausente (el servidor no las
   * emitió o la lectura falló) = la cola sin tarjetas. No llega por SWR: no depende de la página ni
   * de los filtros (R354).
   */
  resumenGanancia?: ResumenGananciaMensajero;
}

// =================================================================================================
// Feature 111/R13 + 109/R31 -> FEATURE 271 — LOS ENVÍOS DE UN CIERRE POR REENVIAR (textos separados).
// =================================================================================================
//
// SLT-109: los botones son el pie del detalle único (`ACCION_SOLICITAR_VENCIDO`/`_RECHAZADO`), y los
// avisos sueltos que había encima se fueron: la franja del detalle dice el motivo del rechazo y el
// bloqueo (R246). Aquí quedan las confirmaciones y los avisos de éxito, que no cambian.
//
// ⚠️ Las confirmaciones no prometen que enviar el cierre DESTRABA: desde la 271 el mensajero puede
// arrastrar dos, y enviar el que falta no lo desbloquea —sigue bloqueado hasta que la bodega apruebe
// el más antiguo (R8)—. Lo que pasa después lo dice el aviso de bloqueo de la franja.

const VENCIDO_CTA_LABEL = "Solicitar aprobación del cierre vencido";
const VENCIDO_CONFIRM_TITULO = "Solicitar aprobación del cierre vencido";
const VENCIDO_CONFIRM_DETALLE =
  "Se enviará tu cierre vencido a tu bodega para aprobación. No se recalculan los montos ya registrados.";
const VENCIDO_OK = "Cierre vencido enviado a aprobación.";

// Un cierre `rechazado` NO es terminal: bloquea, y es RE-SOLICITABLE (espejo del `vencido`).
const RECHAZADO_CTA_LABEL = "Solicitar aprobación del cierre rechazado";
const RECHAZADO_CONFIRM_TITULO = "Solicitar aprobación del cierre rechazado";
// FICHA 477 (R28): la confirmación ya NO dice «No se recalculan los montos ya registrados». Desde
// la 477 es falso para un `rechazado`: al reenviarlo, el servidor vincula las gestiones rehechas,
// poda las órdenes que se quedaron sin gestión y recalcula los seis totales (design D5). El
// `vencido` conserva su frase: su re-solicitud sigue cambiando solo el estado (R21).
export const RECHAZADO_CONFIRM_DETALLE =
  "Se enviará de nuevo tu cierre rechazado a tu bodega para aprobación, con los totales de las gestiones que tenga al enviarlo.";
/**
 * FICHA 477 (R28): cuántas órdenes en corrección de ESE cierre siguen sin volver a gestionarse.
 * Salen del cierre al reenviarlo (R18, Pregunta abierta 3 por defecto): se dice ANTES de confirmar.
 */
export function rechazadoConfirmSinRehacer(n: number): string {
  return n === 1
    ? "Hay 1 orden que deshiciste y no volviste a gestionar: saldrá del cierre al enviarlo."
    : `Hay ${n} órdenes que deshiciste y no volviste a gestionar: saldrán del cierre al enviarlo.`;
}
const RECHAZADO_OK = "Cierre rechazado enviado a aprobación.";

// `REENVIAR_OK` es el toast de «Solicitar cierre» cuando el servidor responde `resolicitado` en vez de
// `creado` (el botón genérico no sabe qué acaba de mover, R18).
const REENVIAR_OK = "Cierre enviado a aprobación.";

// Pedido humano: "ver" el detalle de un cierre YA solicitado (textos separados, i18n-ready). El
// texto del botón «Ver» vive con la cola (`VER_PROPIA`, SLT-137).
const DETALLE_ERROR = "No se pudo cargar el detalle de este cierre.";
const DETALLE_NO_ENCONTRADA = "Este cierre ya no está disponible.";

// Feature 67 (R35-R38): textos del deshacer (separados de la lógica, i18n-ready). El botón de la fila
// y su motivo de la tienda (feature 237) viven con la fila única (`fila-gestion-labels.ts`).
const DESHACER_LABEL = "Devolver a gestión";
const DESHACER_TITULO = "Devolver la orden a gestión";
const DESHACER_DETALLE =
  "La gestión quedará anulada (queda el registro de quién la hizo y cuándo) y la orden volverá a tu lista para gestionar.";
const DESHACER_OK = "Gestión deshecha; la orden volvió a tu lista para gestionar.";
const DESHACER_FORBIDDEN = "No podés deshacer esta gestión.";
const DESHACER_ERROR = "No se pudo deshacer la gestión. Intentá de nuevo.";

/** Nombre visible del histórico: hoja, base del archivo y nombre del control (R12/R13). */
const TITULO_DESCARGA_PASADOS = "Cierres solicitados";
/** Nombre accesible del control de paginación (R43). */
export const PAGINACION_PASADOS_LABEL = "Paginación de los cierres solicitados";
const ERROR_PASADOS = "No se pudieron cargar tus cierres solicitados.";

/**
 * La configuración de descarga del HISTÓRICO de cierres solicitados del mensajero. Es un objeto con
 * nombre para que el ámbito de la ficha 314 viaje como una PROPIEDAD `ambitoColumnas:` y
 * `ambito-columnas.guardia` lo vea.
 *
 * SLT-138: es una función de los filtros de la barra; el objeto devuelto es el mismo (y
 * `ambitoColumnas:` sigue siendo una propiedad).
 */
function descargaCierresPasados(filtros: FiltrosColaPropia): DataTableDescarga {
  return {
    titulo: TITULO_DESCARGA_PASADOS,
    columnas: COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS,
    ambitoColumnas: AMBITO_DESCARGA_DIA_CIERRES_PASADOS,
    // SLT-138 (R174): con filtros puestos, el archivo es el de esos filtros (todas las páginas). Sin
    // ninguno, la llamada es la de antes, sin entrada (R173).
    obtenerFilas: () =>
      filasDesdeResultado(
        descargarDatos(
          "listarCierresPasadosCompleto",
          sinFiltrosPropios(filtros) ? undefined : { filtros },
        ),
        filaDescargaDiaCierrePasado,
      ),
  };
}

// R40: el tamaño sale de la config del dominio (T H.1), nunca de un literal de pantalla.
const PAGE_SIZE_OPTIONS = [10, 25, 50].filter((s) => s <= cierreConfig.MAX_PAGE_SIZE);

/**
 * Feature 170 — FASE 2 (T I.2, R40/R41/R44): una página de los cierres solicitados POR ESTE
 * mensajero. El `mensajero_id` no viaja en el input: lo pone el servidor desde la sesión.
 *
 * SLT-138 (R173): `filtros` viaja SOLO si recorta algo; sin filtros la petición es la de antes.
 */
async function leerCierresPasados(
  page: number,
  pageSize: number,
  filtros: FiltrosColaPropia,
): Promise<CierresPasadosPagina> {
  const res = await listarCierresPasadosPaginado(
    sinFiltrosPropios(filtros) ? { page, pageSize } : { page, pageSize, filtros },
  );
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

export function CierreDiaModule({
  grupos,
  totales,
  totalPagoMensajero,
  puedesSolicitar,
  motivoBloqueo,
  cierresPasados,
  bloqueo,
  correcciones = [],
  reenviable,
  resumenGanancia,
}: CierreDiaModuleProps) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  // R240: el cierre que pinta la página. Con uno por reenviar, ESE (`aReenviarPrimero`, el mismo que
  // mueve `solicitarCierre`, que no recibe id: si se pintara otro, su botón enviaría un cierre
  // distinto del que se ve). Sin nada que reenviar, el de hoy.
  const pagina = cierreDeLaPagina({
    grupos,
    totales,
    totalPagoMensajero,
    motivoBloqueo,
    puedesSolicitar,
    bloqueo,
    reenviable,
  });
  const leido = reenviable?.estado === "ok" ? reenviable : null;

  // FICHA 477 (R28): las órdenes en corrección del cierre que reenvía el pie (el mismo
  // `aReenviarPrimero` que transiciona el servidor) que aún no se volvieron a gestionar.
  const porReenviar = bloqueo.aReenviarPrimero;
  const sinRehacerDelReenviable =
    porReenviar?.estado === "rechazado"
      ? (correcciones
          .find((c) => c.cierreId === porReenviar.cierreId)
          ?.ordenesEnCorreccion.filter((o) => !o.regestionada).length ?? 0)
      : 0;
  const rechazadoConfirmDetalle =
    sinRehacerDelReenviable > 0
      ? `${RECHAZADO_CONFIRM_DETALLE} ${rechazadoConfirmSinRehacer(sinRehacerDelReenviable)}`
      : RECHAZADO_CONFIRM_DETALLE;

  // SLT-103 (R140): «Gestiones» del resumen = las gestiones del día. Es un conteo, no dinero.
  const gestionesDeHoy = gestionesEnOrden(grupos);

  // Confirmación de "Solicitar cierre"; true = modal abierto.
  const [confirmar, setConfirmar] = useState(false);
  // Feature 111/R13: confirmación del envío del cierre `vencido`; true = modal abierto.
  const [confirmarVencido, setConfirmarVencido] = useState(false);
  // Feature 109/R31: confirmación del envío del cierre `rechazado`; true = modal abierto.
  const [confirmarRechazado, setConfirmarRechazado] = useState(false);
  // Evidencia (URL firmada, R5) en el visor; null = cerrado.
  const [evidencia, setEvidencia] = useState<EvidenciaAbierta | null>(null);
  // Feature 67/R36: fila pendiente de confirmar el deshacer; null = modal cerrado.
  const [deshacerFila, setDeshacerFila] = useState<CierreDetalleGestion | null>(null);
  // Feature 67: gestionId del deshacer EN VUELO; deshabilita el botón de ESA fila (R244).
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
  // Pedido humano: cierre pasado ABIERTO en el detalle; null = cerrado. SLT-108: solo se fija con la
  // lectura hecha; no hay un diálogo vacío mientras carga.
  const [cierreAbierto, setCierreAbierto] = useState<CierrePasadoDTO | null>(null);
  const [detallePasado, setDetallePasado] = useState<DetalleCierrePasado | null>(null);
  // SLT-108: el cierre cuyo detalle se está leyendo; su «Ver» queda deshabilitado (`aria-busy`).
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);

  /**
   * Pedido humano del 2026-08-19 — solicitar el cierre tiene que verse en «Cierres solicitados» sin
   * recargar: se revalidan todas las páginas de la lista y se relee la ruta.
   */
  function refrescarListas() {
    void mutate((clave) => Array.isArray(clave) && clave[0] === "cierre-dia:pasados");
    router.refresh();
  }

  /**
   * Lee el detalle de un cierre pasado y, con la lectura hecha, lo abre. SLT-108 (R153): los dos
   * errores van por toast y el detalle NO se abre.
   */
  async function abrirDetalle(cierre: CierrePasadoDTO) {
    setCargandoDetalle(cierre.cierreId);
    try {
      const result = await verCierrePasado({ cierreId: cierre.cierreId });
      if (result.status === "ok") {
        setDetallePasado({
          grupos: result.grupos,
          ordenesSinGestion: result.ordenesSinGestion,
          sinGestionRegistrado: result.sinGestionRegistrado,
          rechazosDeTienda: result.rechazosDeTienda,
        });
        setCierreAbierto(cierre);
        return;
      }
      toast.error(result.status === "no_encontrada" ? DETALLE_NO_ENCONTRADA : DETALLE_ERROR);
    } catch {
      toast.error(DETALLE_ERROR);
    } finally {
      setCargandoDetalle(null);
    }
  }

  function cerrarDetalle() {
    setCierreAbierto(null);
    setDetallePasado(null);
  }

  // Feature 170 — FASE 2 (T I.2, R40/R43): página visible de «Cierres solicitados».
  const [pasadosPage, setPasadosPage] = useState(1);
  const [pasadosPageSize, setPasadosPageSize] = useState(cierresPasados.pageSize);
  // SLT-138 (R175): los filtros de la barra van en la clave; cambiarlos vuelve a la página 1. La
  // página del Server Component solo vale como `fallbackData` sin filtros.
  const [filtrosPropios, setFiltrosPropios] = useState<FiltrosColaPropia>({});
  function aplicarFiltrosPropios(next: FiltrosColaPropia) {
    setFiltrosPropios(next);
    setPasadosPage(1);
  }
  const { data: pasadosData, error: pasadosError } = useSWR(
    ["cierre-dia:pasados", pasadosPage, pasadosPageSize, filtrosPropios],
    () => leerCierresPasados(pasadosPage, pasadosPageSize, filtrosPropios),
    {
      fallbackData:
        pasadosPage === 1 &&
        pasadosPageSize === cierresPasados.pageSize &&
        sinFiltrosPropios(filtrosPropios)
          ? cierresPasados
          : undefined,
    },
  );
  // R44: el esqueleto de carga se muestra sólo cuando NO hay nada que pintar.
  const pasadosCargando = pasadosData === undefined;

  /**
   * Feature 37 + 111/R13 + 109/R31: envía el cierre. Un mismo camino sirve para "Solicitar cierre"
   * (crea) y los envíos del `vencido`/`rechazado`: el backend enruta según el estado abierto del
   * mensajero. Cierra los tres modales pase lo que pase.
   */
  async function confirmarSolicitud(okReenvio: string) {
    const result = await solicitarCierre();
    if (result.status === "ok") {
      toast.success(
        result.via === "resolicitado" ? okReenvio : "Cierre solicitado correctamente.",
      );
      cerrarConfirmaciones();
      refrescarListas();
      return;
    }
    const mensaje =
      result.status === "conflict" || result.status === "validation_error"
        ? mensajeError(result, "No se pudo solicitar el cierre.")
        : result.status === "forbidden"
          ? "No tenés permiso para solicitar el cierre."
          : "No se pudo solicitar el cierre. Intentá de nuevo.";
    toast.error(mensaje);
    cerrarConfirmaciones();
  }

  /** Cierra los tres modales de solicitud/reenvío pase lo que pase. */
  function cerrarConfirmaciones() {
    setConfirmar(false);
    setConfirmarVencido(false);
    setConfirmarRechazado(false);
  }

  /**
   * Feature 67/R36-R38, SLT-109 (R243, R252): ejecuta el deshacer ya confirmado. `ok` → toast y se
   * relee el servidor (la fila se va y las cifras se recalculan allá, nunca se mutan acá); si el
   * deshacer salió del modal de un rechazado, ese cierre se relee y el modal queda abierto con la
   * lectura nueva. Error → toast accionable y NI la lista NI las cifras se tocan (R38).
   */
  async function confirmarDeshacer() {
    const fila = deshacerFila;
    if (!fila) return;
    setDeshaciendo(fila.gestionId);
    const result = await deshacerGestion({ gestionId: fila.gestionId });
    if (result.status === "ok") {
      toast.success(DESHACER_OK);
      setDeshacerFila(null);
      // `deshaciendo` NO se limpia: la fila se va con el refresh y su botón se desmonta;
      // re-habilitarlo solo abriría la ventana a un segundo envío que el server rechazaría.
      refrescarListas();
      if (cierreAbierto) void abrirDetalle(cierreAbierto);
      return;
    }
    const mensaje =
      result.status === "conflict" || result.status === "validation_error"
        ? // R38: el `motivo` del conflict YA viene accionable del server (no se reescribe acá).
          mensajeError(result, DESHACER_ERROR)
        : result.status === "forbidden"
          ? DESHACER_FORBIDDEN
          : DESHACER_ERROR;
    toast.error(mensaje);
    setDeshaciendo(null);
    setDeshacerFila(null);
  }

  /**
   * La pestaña «Gestiones» de un cierre del mensajero: la lista y la fila únicas (R242, R151) con
   * «Descargar» y las columnas del mensajero (R256, R152) y, si viene, la sección de las órdenes que
   * el corte pasó a «Novedad interna» (264). `devolver` solo en el en curso y en un rechazado (canvas).
   */
  function gestionesDe(p: {
    grupos: CierreGrupos;
    congeladoAt: string | null;
    devolver: boolean;
    titulo: string;
    sinGestion?: { ordenes: CierreOrdenSinGestion[]; registrado: boolean };
  }): ReactNode {
    const lista = gestionesEnOrden(p.grupos);
    return (
      <div className="flex flex-col gap-4">
        <GestionesCierre
          gestiones={lista.map((gestion) => ({ gestion }))}
          audiencia="mensajero"
          quienMiraEsCentral={false}
          congeladoAt={p.congeladoAt}
          acciones={p.devolver ? { devolver: setDeshacerFila } : {}}
          enVuelo={deshaciendo}
          // R154: el visor de evidencia de esta pantalla, con las URL firmadas del servidor.
          onVerEvidencia={setEvidencia}
          descargar={
            <DescargarDatasetButton
              titulo={p.titulo}
              columnas={COLUMNAS_DESCARGA_DETALLE_MENSAJERO}
              // El adaptador común aplica el tope de filas (`ControlDescargaTransversal`).
              obtenerFilas={() => filasLocales(lista, filaDescargaDetalleMensajero)}
            />
          }
        />
        {p.sinGestion ? (
          <SeccionSinGestion ordenes={p.sinGestion.ordenes} registrado={p.sinGestion.registrado} />
        ) : null}
      </div>
    );
  }

  /** R248: las órdenes en corrección de ESE cierre rechazado (`[]` si no tiene). */
  function corregirDe(cierreId: string): ReactNode {
    const correccion = correcciones.find((c) => c.cierreId === cierreId);
    return <CorregirCierre ordenesEnCorreccion={correccion?.ordenesEnCorreccion ?? []} />;
  }

  /** R61-R63, R240: el cierre de la página, en su modo; o el aviso de R253 con su envío. */
  function cierreDeLaPaginaPintado(): ReactNode {
    if (pagina.modo === "error") {
      // R253: sin el detalle (no se pudo leer), pero con el envío de su estado y su confirmación.
      const esVencido = pagina.reenviableEstado === "vencido";
      return (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p role="alert" className="m-0 text-sm text-destructive">
            {REENVIABLE_ERROR}
          </p>
          <Button
            type="button"
            className="w-fit"
            onClick={() => (esVencido ? setConfirmarVencido(true) : setConfirmarRechazado(true))}
          >
            {esVencido ? VENCIDO_CTA_LABEL : RECHAZADO_CTA_LABEL}
          </Button>
        </div>
      );
    }
    if (pagina.modo === "en curso") {
      return (
        <DetalleCierre
          tipo="mensajero"
          audiencia="mensajero"
          modo="en curso"
          marco="pagina"
          detalle={pagina.detalle}
          acciones={{ solicitar: () => setConfirmar(true) }}
          // R245: deshabilitado con el motivo del servidor, que también dice la franja.
          deshabilitadas={puedesSolicitar ? undefined : { solicitar: motivoBloqueo ?? "" }}
          pestanas={{
            gestiones: gestionesDe({
              grupos,
              congeladoAt: null,
              devolver: true,
              titulo: DESCARGA_GESTIONES_HOY,
            }),
            // R242 (D11, PA3): siempre visible, con su estado vacío.
            rechazos: <RechazosDeTiendaCierre rechazos={[]} />,
          }}
        />
      );
    }
    // Rechazado o vencido: `cierreDeLaPagina` solo los devuelve con la lectura `ok`.
    if (!leido) return null;
    const rechazado = pagina.modo === "rechazado";
    return (
      <DetalleCierre
        tipo="mensajero"
        audiencia="mensajero"
        modo={pagina.modo}
        marco="pagina"
        detalle={pagina.detalle}
        acciones={
          rechazado
            ? { solicitarRechazado: () => setConfirmarRechazado(true) }
            : { solicitarVencido: () => setConfirmarVencido(true) }
        }
        pestanas={{
          // R248: solo el rechazado tiene «Corregir» (`pestanasDe` la pone primera).
          corregir: rechazado ? corregirDe(pagina.cierreId) : undefined,
          gestiones: gestionesDe({
            grupos: leido.grupos,
            congeladoAt: leido.cierre.solicitadoAt,
            // R247 / R249: «Devolver a gestión» en el rechazado, nunca en el vencido.
            devolver: rechazado,
            titulo: tituloDescargaGestiones(folioDe(pagina.cierreId)),
            sinGestion: { ordenes: leido.ordenesSinGestion, registrado: leido.sinGestionRegistrado },
          }),
          rechazos: <RechazosDeTiendaCierre rechazos={leido.rechazosDeTienda} />,
        }}
      />
    );
  }

  const abiertoRechazado = cierreAbierto?.estado === "rechazado";

  return (
    <div className="flex flex-col gap-8">
      {cierreDeLaPaginaPintado()}

      {/* ---------- Cierres solicitados (histórico, R18) ----------
          SLT-137 (R60, R155): la cola única con rol mensajero. La `<section>` no lleva nombre: la
          región «Cierres solicitados» la da `ColaCierres`. Feature 170 (R52): «Descargar» es el
          CONJUNTO COMPLETO de este mensajero, acotado en el servidor desde la sesión (R159), con los
          filtros de la barra si hay alguno (SLT-138, R174). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Cierres solicitados</h2>
        <ColaCierres
          tipo="propios"
          rol="mensajero"
          descripcion={DESCRIPCION_PROPIA}
          pestanas={[{ id: "pendientes", label: PESTANA_PROPIA, conteo: pasadosData?.total ?? 0 }]}
          pestanaActiva="pendientes"
          onPestana={() => {}}
          barra={<FiltrosColaPropiaBarra onChange={aplicarFiltrosPropios} />}
          descargar={<DescargarDatasetButton {...descargaCierresPasados(filtrosPropios)} />}
          cargando={pasadosCargando}
          error={pasadosError ? ERROR_PASADOS : null}
          // R176: con un filtro puesto, el vacío dice que nada coincide, no que no hay cierres.
          vacio={sinFiltrosPropios(filtrosPropios) ? VACIO_PROPIA : VACIO_FILTRADO_PROPIA}
          region={REGION_PROPIA}
          paginacion={
            <Pagination
              page={pasadosPage}
              pageSize={pasadosPageSize}
              total={pasadosData?.total ?? 0}
              disabled={pasadosCargando}
              showFirstLast
              siblingCount={1}
              ariaLabel={PAGINACION_PASADOS_LABEL}
              onPageChange={setPasadosPage}
              onPageSizeChange={(s) => {
                setPasadosPageSize(s);
                setPasadosPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          }
          filas={pasadosData?.items ?? []}
          acciones={{ abrir: abrirDetalle, leyendo: cargandoDetalle }}
          tarjetas={resumenGanancia ? tarjetasGanancia(resumenGanancia) : undefined}
        />
      </section>

      {/* Confirmación de "Solicitar cierre" (R245). */}
      <Modal
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Solicitar cierre del día"
        description="Se agruparán todas tus gestiones pendientes en una solicitud de cierre. Esta acción no se puede deshacer."
        confirmLabel="Solicitar cierre"
        onConfirm={() => confirmarSolicitud(REENVIAR_OK)}
        closeOnConfirm={false}
      >
        {/* SLT-103 (R55, R140): resumen con las MISMAS cifras de la página, tal como las da el
            servidor; no se suma dinero en el cliente. «Gestiones» cuenta las gestiones del día. */}
        <dl aria-label={RESUMEN_SOLICITUD_TEXTO.region} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_TEXTO.gestiones}</dt>
          <dd className="text-right font-medium">{gestionesDeHoy.length}</dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_TEXTO.recaudado}</dt>
          <dd className="text-right font-medium">{money(totales.general)}</dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_TEXTO.tuGanancia}</dt>
          <dd className="text-right font-semibold">{money(totalPagoMensajero)}</dd>
        </dl>
      </Modal>

      {/* Feature 111/R13, SLT-109 (R251): confirmación del envío del cierre vencido. */}
      <Modal
        open={confirmarVencido}
        onOpenChange={setConfirmarVencido}
        title={VENCIDO_CONFIRM_TITULO}
        description={VENCIDO_CONFIRM_DETALLE}
        confirmLabel="Solicitar aprobación"
        onConfirm={() => confirmarSolicitud(VENCIDO_OK)}
        closeOnConfirm={false}
      />

      {/* Feature 109/R31, SLT-109 (R250): confirmación del envío del cierre rechazado. */}
      <Modal
        open={confirmarRechazado}
        onOpenChange={setConfirmarRechazado}
        title={RECHAZADO_CONFIRM_TITULO}
        description={rechazadoConfirmDetalle}
        confirmLabel="Solicitar aprobación"
        onConfirm={() => confirmarSolicitud(RECHAZADO_OK)}
        closeOnConfirm={false}
      />

      {/* Feature 67/R36, SLT-109 (R243): confirmación explícita del deshacer (una sola por módulo,
          parametrizada con la fila elegida: el Modal ya es un focus-trap accesible). */}
      <Modal
        open={deshacerFila !== null}
        onOpenChange={(next) => {
          if (!next) setDeshacerFila(null);
        }}
        title={DESHACER_TITULO}
        description={
          deshacerFila
            ? `Orden ${deshacerFila.numRemision} · ${deshacerFila.destinatario}. ${DESHACER_DETALLE}`
            : undefined
        }
        confirmLabel={DESHACER_LABEL}
        onConfirm={confirmarDeshacer}
        closeOnConfirm={false}
      />

      {/* SLT-108 (R59, R150-R154, R161): el detalle de un cierre de la cola, en marco modal y solo
          lectura. SLT-109 (R252): un rechazado se abre en modo rechazado —«Corregir» y «Devolver a
          gestión»— y sin envío: en el pie solo «Cerrar». */}
      {cierreAbierto && detallePasado ? (
        <DetalleCierre
          tipo="mensajero"
          audiencia="mensajero"
          modo={abiertoRechazado ? "rechazado" : "solo lectura"}
          marco="modal"
          detalle={vistaMensajeroDesdeCierreDia(cierreAbierto, detallePasado)}
          acciones={{}}
          onCerrar={cerrarDetalle}
          pestanas={{
            corregir: abiertoRechazado ? corregirDe(cierreAbierto.cierreId) : undefined,
            gestiones: gestionesDe({
              grupos: detallePasado.grupos,
              congeladoAt: cierreAbierto.solicitadoAt,
              devolver: abiertoRechazado,
              titulo: tituloDescargaGestiones(folioDe(cierreAbierto.cierreId)),
              // R151 — las órdenes que el corte pasó a «Novedad interna» (264), con su marca.
              sinGestion: {
                ordenes: detallePasado.ordenesSinGestion,
                registrado: detallePasado.sinGestionRegistrado,
              },
            }),
            // R151 — siempre visible, también con 0 (D11).
            rechazos: <RechazosDeTiendaCierre rechazos={detallePasado.rechazosDeTienda} />,
          }}
        />
      ) : null}

      {/* Visor de evidencia (URL firmada, R5; visor único SLT-103 R137). */}
      <VisorEvidencia evidencia={evidencia} onClose={() => setEvidencia(null)} />
    </div>
  );
}

/**
 * Devuelve el mensaje accionable de un resultado de dominio de error. El `motivo` de un
 * `conflict` lo redacta el SERVER (ya es accionable): acá no se reescribe. `fallback` es
 * el texto de la operación que llama, para el caso degenerado de `fieldErrors` vacío.
 */
function mensajeError(
  result:
    | { status: "conflict"; motivo: string }
    | { status: "validation_error"; fieldErrors: Record<string, string[]> },
  fallback: string,
): string {
  if (result.status === "conflict") return result.motivo;
  const primero = Object.values(result.fieldErrors)[0]?.[0];
  return primero ?? fallback;
}
