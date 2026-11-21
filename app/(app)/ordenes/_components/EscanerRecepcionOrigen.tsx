"use client";

import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import { RecepcionContinuaPagina } from "@/components/shared/RecepcionContinuaPagina";
import { recibirEnOrigenPorQr } from "@/lib/actions/recepcion-origen";
import type { DesenlaceRecepcion, ModoRecepcion } from "@/lib/utils/sesion-escaneo";
import type { RecibirEnOrigenResult } from "@/lib/types/recepcion-origen";

import { estatusLabel } from "./estatus-label";

// Receptor de la tienda en `/ordenes`: cierra el flujo de devolución. El adminTienda lee la guía
// de una orden que viaja de vuelta («En ruta a origen») y la marca recibida en su tienda
// (`devolviendo_a_tienda` -> `devuelta_a_tienda`). Llama a `recibirEnOrigenPorQr` y traduce cada
// respuesta a la fila de la sesión continua (`desenlaceOrigen`, SLT-159 R583), con los motivos de
// la guía suelta de prod.
//
// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (Carlos,
// 2026-11-18): la guía suelta (tarjeta y toast por lectura) se quitó; queda la recepción continua,
// en diálogo (`continua`) o en página (`pagina`).

export interface EscanerRecepcionOrigenProps {
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

/** SLT-159 (R583): la respuesta traducida a desenlace de la fila, con los motivos de prod. */
export function desenlaceOrigen(result: RecibirEnOrigenResult): DesenlaceRecepcion {
  const noSePudo = (motivo: string): DesenlaceRecepcion => ({ tipo: "no_se_pudo", motivo });
  switch (result.status) {
    case "ok":
      return { tipo: "recibida", resumen: result.resumen };
    case "ya_recibida":
      return { tipo: "ya_recibida", resumen: result.resumen };
    case "no_encontrada":
      return { tipo: "no_encontrada" };
    case "tienda_ajena":
      return noSePudo("Esta orden es de otra tienda.");
    case "estado_invalido":
      return noSePudo(`No se puede recibir: la orden está en "${estatusLabel(result.estado)}".`);
    case "validation_error":
      return noSePudo("Código inválido.");
    case "forbidden":
      return noSePudo("No tienes permiso para recibir órdenes.");
    case "unauthenticated":
      return noSePudo("Tu sesión expiró. Inicia sesión de nuevo.");
    case "conflict":
      return noSePudo("La orden cambió de estado. Vuelve a escanear.");
  }
}

async function recibirOrigen(numGuia: number): Promise<DesenlaceRecepcion> {
  return desenlaceOrigen(await recibirEnOrigenPorQr({ numGuia }));
}

export function EscanerRecepcionOrigen({
  onRecibida = sinRefresco,
  modo,
  volverA = "/ordenes",
}: Readonly<EscanerRecepcionOrigenProps>) {
  if (modo === "pagina") {
    return (
      <RecepcionContinuaPagina recibir={recibirOrigen} volverA={volverA} nombreRecepcion="Tienda" />
    );
  }
  // SLT-202 (Carlos, 2026-11-18): la guía suelta se quitó; `/ordenes` tiene un solo «Recibir paquete»,
  // que abre la continua (SLT-159). Fuera de `pagina`, la tarjeta continua.
  return (
    // SLT-193 (R927): vive en el diálogo de `RecibirPaquetesEntrada`, que lleva el título en su barra.
    <TarjetaEscaneoContinuo
      sinEncabezado
      recibir={recibirOrigen}
      alCerrarConRecepcion={onRecibida}
      ariaLabel="Recepción continua en tienda"
      titulo="Recibir paquetes"
      descripcion="Escanea las guías una tras otra"
      submitLabel="Recibir"
    />
  );
}
