"use client";

import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import { RecepcionContinuaPagina } from "@/components/shared/RecepcionContinuaPagina";
import { recibirEnBodegaCentralPorQr } from "@/lib/actions/recepcion-bodega-central";
import type { DesenlaceRecepcion, ModoRecepcion } from "@/lib/utils/sesion-escaneo";
import type { RecibirEnBodegaCentralResult } from "@/lib/types/recepcion-bodega-central";

import { estatusLabel } from "./estatus-label";

// Feature 138 — Receptor de la BODEGA CENTRAL en `/ordenes` (solo maestro/admin): cierra el
// callejón de `en_ruta_bodega_central`. Llama a `recibirEnBodegaCentralPorQr` y traduce cada
// respuesta a la fila de la sesión continua (`desenlaceBodegaCentral`, SLT-159 R583), con los
// motivos de la guía suelta de prod.
//
// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (Carlos,
// 2026-11-18): la guía suelta (tarjeta y toast por lectura) se quitó; queda la recepción continua,
// en diálogo (`continua`) o en página (`pagina`).
//
// El rol (maestro/admin) NO se decide aquí: el padre (OrdenesListado) solo monta este
// control cuando `puedeRecibirBodegaCentral`, y el service revalida server-side (R16).

export interface EscanerRecepcionBodegaCentralProps {
  /**
   * Se invoca tras una recepción efectiva o idempotente (ok/ya_recibida). SLT-159 (R592): en
   * `continua`, una sola vez al cerrar el diálogo si hubo alguna.
   */
  onRecibida?: () => void;
  /**
   * SLT-159: `continua` (el diálogo con lista) o `pagina`. SLT-202: la guía `suelta` se quitó (la
   * cubre la continua).
   */
  modo: ModoRecepcion;
  /** SLT-159 (R613): en `pagina`, adónde vuelve «Terminar recepción». */
  volverA?: string;
}

const sinRefresco = () => {};

/** Feature 139 (R17), SLT-202 (review B1): el destino de una devolución recibida en la central. */
export const AVISO_POR_DEVOLVER_A_TIENDA = "Queda por devolver a la tienda.";

/**
 * SLT-159 (R583): la respuesta de la acción traducida a desenlace de la fila. Los motivos son
 * los textos de prod.
 */
export function desenlaceBodegaCentral(result: RecibirEnBodegaCentralResult): DesenlaceRecepcion {
  const noSePudo = (motivo: string): DesenlaceRecepcion => ({ tipo: "no_se_pudo", motivo });
  switch (result.status) {
    case "ok":
      // Feature 139 (R17): la recepción central es STATE-AWARE. Si la orden volvía de una devolución
      // (`devolviendo_a_bodega_central`), queda en `por_devolver_a_tienda`, no en la bodega: la fila
      // lo dice, como el toast de prod (SLT-202, review B1).
      return result.estado === "por_devolver_a_tienda"
        ? { tipo: "recibida", resumen: result.resumen, aviso: AVISO_POR_DEVOLVER_A_TIENDA }
        : { tipo: "recibida", resumen: result.resumen };
    case "ya_recibida":
      return { tipo: "ya_recibida", resumen: result.resumen };
    case "no_encontrada":
      return { tipo: "no_encontrada" };
    case "estado_invalido":
      return noSePudo(`No se puede recibir: la orden está en "${estatusLabel(result.estado)}".`);
    case "validation_error":
      return noSePudo("Código inválido.");
    case "forbidden":
      return noSePudo("No tienes permiso para recibir órdenes.");
    case "unauthenticated":
      return noSePudo("Tu sesión expiró. Inicia sesión de nuevo.");
    case "conflict":
      return noSePudo("La orden cambió de estado. Vuelve a intentar.");
  }
}

async function recibirBodegaCentral(numGuia: number): Promise<DesenlaceRecepcion> {
  return desenlaceBodegaCentral(await recibirEnBodegaCentralPorQr({ numGuia }));
}

export function EscanerRecepcionBodegaCentral({
  onRecibida = sinRefresco,
  modo,
  volverA = "/ordenes",
}: Readonly<EscanerRecepcionBodegaCentralProps>) {
  if (modo === "pagina") {
    return (
      <RecepcionContinuaPagina recibir={recibirBodegaCentral} volverA={volverA} nombreRecepcion="Bodega central" />
    );
  }
  // SLT-202 (Carlos, 2026-11-18): la guía suelta se quitó; `/ordenes` tiene un solo «Recibir paquete»,
  // que abre la continua (SLT-159). Fuera de `pagina`, la tarjeta continua.
  return (
    // SLT-193 (R927): vive en el diálogo de `RecibirPaquetesEntrada`, que lleva el título en su barra.
    <TarjetaEscaneoContinuo
      sinEncabezado
      recibir={recibirBodegaCentral}
      alCerrarConRecepcion={onRecibida}
      ariaLabel="Recepción continua en bodega central"
      titulo="Recibir paquetes"
      descripcion="Escanea las guías una tras otra"
      submitLabel="Recibir"
    />
  );
}
