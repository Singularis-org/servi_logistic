"use client";

import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import { RecepcionContinuaPagina } from "@/components/shared/RecepcionContinuaPagina";
import { recibirEnOrigenPorQr } from "@/lib/actions/recepcion-origen";
import type { DesenlaceRecepcion, ModoRecepcion } from "@/lib/utils/sesion-escaneo";
import type { RecibirEnOrigenResult } from "@/lib/types/recepcion-origen";

import { estatusLabel } from "./estatus-label";

// Escáner de la tienda en `/ordenes`: cierra el flujo de devolución. El adminTienda
// escanea el QR de la etiqueta de una orden que viaja de vuelta ("En ruta a origen")
// y la marca como recibida en su tienda (`devolviendo_a_tienda` -> `devuelta_a_tienda`).
// Mismo patrón que `EscanerRecepcion` de la bodega satélite: resuelve el num_guia del
// texto decodificado, llama a la Server Action y traduce el resultado a un toast.
//
// A diferencia del escáner de `/qr`, este NO navega: la acción es marcar la recepción
// sin salir del listado, para poder escanear varias seguidas.
//
// SLT-158: cada lectura DEVUELVE su resultado a la tarjeta (acierto, o error con el mismo
// motivo del toast). Sin guard `procesando` propio: la tarjeta encola las lecturas (R574).
// Tarjeta y botón dicen «Recibir paquete», como el disparador (D5, decisión de Carlos del
// 2026-11-14).

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
  modo: Exclude<ModoRecepcion, "suelta">;
  /** SLT-159 (R613): en `pagina`, adónde vuelve «Terminar recepción». */
  volverA?: string;
}

const sinRefresco = () => {};

/** SLT-159 (R583): la respuesta traducida a desenlace de la fila, con los motivos del toast. */
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
