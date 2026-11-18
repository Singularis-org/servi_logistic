"use client";

import { useSyncExternalStore } from "react";

import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import { RecepcionContinuaPagina } from "@/components/shared/RecepcionContinuaPagina";
import { RecibirPaquetesEntrada } from "@/components/shared/RecibirPaquetesEntrada";
import { recibirPorQr } from "@/lib/actions/recepcion-satelite";
import type { DesenlaceRecepcion, ModoRecepcion } from "@/lib/utils/sesion-escaneo";
import type { RecibirResult } from "@/lib/types/recepcion-satelite";

import { estatusLabel } from "@/app/(app)/ordenes/_components/estatus-label";

// Feature 33 (T13, R12–R16, decisión F1.4 (a)): recepción por escaneo con la
// cámara del dispositivo, delegada al componente compartido `QrScanner`, que
// encapsula el botón, el visor y el ciclo de vida de html5-qrcode. Aquí solo
// resolvemos el numGuia del texto decodificado y llamamos a `recibirPorQr`.
// Feedback por ítem con useToast (un toast por resultado). Tras ok/ya_recibida se
// dispara `onRecibida` (el módulo lo conecta a router.refresh()).
//
// Pedido humano (rama ux): la recepción se opera IGUAL que la recogida del mensajero
// (`RecogerPaqueteCard`), con los DOS caminos en la misma tarjeta: cámara y número de
// guía TECLEADO. La diferencia entre ambos es solo de parseo — la cámara entrega la URL
// del paquete (`<origin>/paquete/<numGuia>`) y hay que extraer el número; lo tecleado ES
// el número—, así que los dos terminan en el mismo `recibirPorQr`.
//
// SLT-158: cada lectura DEVUELVE su resultado a la tarjeta (acierto, o error con el mismo
// motivo del toast). Sin guard `procesando` propio: la tarjeta encola las lecturas (R574).
//
// SLT-202 (Carlos, 2026-11-18): la tarjeta de guía suelta, con su toast por lectura, se quitó. La
// pantalla tiene un solo «Recibir paquete», que abre la recepción continua (SLT-159).

export interface EscanerRecepcionProps {
  /**
   * Se invoca tras una recepción efectiva o idempotente (ok/ya_recibida). SLT-159 (R592): en
   * `continua`, una sola vez al cerrar el diálogo si hubo alguna.
   */
  onRecibida?: () => void;
  /**
   * SLT-159: `continua` (solo la tarjeta) o `pagina`. Sin modo, el disparador «Recibir paquete» de la
   * pantalla (SLT-202: la guía suelta ya no existe; la cubre la continua).
   */
  modo?: Exclude<ModoRecepcion, "suelta">;
  /** SLT-159 (R613): en `pagina`, adónde vuelve «Terminar recepción». */
  volverA?: string;
}

const sinRefresco = () => {};

/** SLT-159 (R583): la respuesta traducida a desenlace de la fila, con los motivos del toast. */
export function desenlaceSatelite(result: RecibirResult): DesenlaceRecepcion {
  const noSePudo = (motivo: string): DesenlaceRecepcion => ({ tipo: "no_se_pudo", motivo });
  switch (result.status) {
    case "ok":
      return { tipo: "recibida", resumen: result.resumen };
    case "ya_recibida":
      return { tipo: "ya_recibida", resumen: result.resumen };
    case "no_encontrada":
      return { tipo: "no_encontrada" };
    case "zona_ajena":
      return noSePudo("Esta orden pertenece a otra zona.");
    case "estado_invalido":
      return noSePudo(`No se puede recibir: la orden está en "${estatusLabel(result.estado)}".`);
    case "validation_error":
      return noSePudo("Código inválido.");
    case "sin_zona":
      return noSePudo("No tienes una zona asignada.");
    case "forbidden":
      return noSePudo("No tienes permiso para recibir órdenes.");
    case "unauthenticated":
      return noSePudo("Tu sesión expiró. Inicia sesión de nuevo.");
    case "conflict":
      return noSePudo("La orden cambió de estado. Vuelve a escanear.");
  }
}

async function recibirSatelite(numGuia: number): Promise<DesenlaceRecepcion> {
  return desenlaceSatelite(await recibirPorQr({ numGuia }));
}

/**
 * R611/R613: «Recibir paquetes» lleva de dónde se entró, para volver ahí. Se lee la ruta del
 * navegador (en servidor, «Por recibir») y no `usePathname()`: los listados que montan esta
 * superficie se prueban con dobles de `next/navigation` que no lo traen.
 */
function useHrefRecibirPaquetes(): string {
  const enBodega = useSyncExternalStore(
    () => () => {},
    () => window.location.pathname.endsWith("/en-bodega"),
    () => false,
  );
  return `/recepcion-satelite/recibir?desde=${enBodega ? "en-bodega" : "por-recibir"}`;
}

export function EscanerRecepcion({
  onRecibida = sinRefresco,
  modo,
  volverA = "/recepcion-satelite/por-recibir",
}: EscanerRecepcionProps) {
  if (modo === "pagina") {
    return (
      <RecepcionContinuaPagina recibir={recibirSatelite} volverA={volverA} nombreRecepcion="Bodega satélite" />
    );
  }
  if (modo === "continua") {
    return (
      // SLT-193 (R927): vive en el diálogo de `RecibirPaquetesEntrada`, que lleva el título en su barra.
      <TarjetaEscaneoContinuo
        sinEncabezado
        recibir={recibirSatelite}
        alCerrarConRecepcion={onRecibida}
        ariaLabel="Recepción continua en bodega satélite"
        titulo="Recibir paquetes"
        descripcion="Escanea las guías una tras otra"
        submitLabel="Recibir"
      />
    );
  }
  return <RecepcionSateliteEntrada onRecibida={onRecibida} />;
}

/**
 * SLT-202 (Carlos, 2026-11-18): el ÚNICO disparador de recibir de «Por recibir» y «En bodega»,
 * «Recibir paquete», en el sitio del de prod, y abre la recepción continua de SLT-159. Antes había
 * dos: la guía suelta y, al lado, «Recibir paquetes». La continua cubre a la suelta: la misma acción
 * (`recibirPorQr`), los mismos motivos (`desenlaceSatelite`), campo para teclear o la pistola y
 * cámara; recibir una sola guía es una sesión de una lectura. Por eso la suelta se quitó.
 */
function RecepcionSateliteEntrada({ onRecibida }: Readonly<{ onRecibida: () => void }>) {
  const hrefRecibirPaquetes = useHrefRecibirPaquetes();
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <RecibirPaquetesEntrada href={hrefRecibirPaquetes}>
        <EscanerRecepcion modo="continua" onRecibida={onRecibida} />
      </RecibirPaquetesEntrada>
    </div>
  );
}
