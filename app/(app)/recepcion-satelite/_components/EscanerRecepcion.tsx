"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { EscanerModal } from "@/components/shared/EscanerModal";
import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import { RecepcionContinuaPagina } from "@/components/shared/RecepcionContinuaPagina";
import { RecibirPaquetesEntrada } from "@/components/shared/RecibirPaquetesEntrada";
import { useToast } from "@/hooks/useToast";
import { recibirPorQr } from "@/lib/actions/recepcion-satelite";
import { leerGuia } from "@/lib/utils/paquete-url";
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

export interface EscanerRecepcionProps {
  /**
   * Se invoca tras una recepción efectiva o idempotente (ok/ya_recibida). SLT-159 (R592): en
   * `continua`, una sola vez al cerrar el diálogo si hubo alguna.
   */
  onRecibida?: () => void;
  /** SLT-159: `suelta` (lo de hoy, con su modal), `continua` (solo la tarjeta) o `pagina`. */
  modo?: ModoRecepcion;
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
  modo = "suelta",
  volverA = "/recepcion-satelite/por-recibir",
}: EscanerRecepcionProps) {
  if (modo === "pagina") {
    return (
      <RecepcionContinuaPagina recibir={recibirSatelite} volverA={volverA} nombreRecepcion="Bodega satélite" />
    );
  }
  if (modo === "continua") {
    return (
      <TarjetaEscaneoContinuo
        recibir={recibirSatelite}
        alCerrarConRecepcion={onRecibida}
        ariaLabel="Recepción continua en bodega satélite"
        titulo="Recibir paquetes"
        descripcion="Escanea las guías una tras otra"
        submitLabel="Recibir"
      />
    );
  }
  return <RecepcionSateliteSuelta onRecibida={onRecibida} />;
}

function RecepcionSateliteSuelta({ onRecibida }: Readonly<{ onRecibida: () => void }>) {
  const hrefRecibirPaquetes = useHrefRecibirPaquetes();
  const toast = useToast();
  // Confirmacion PERSISTENTE del ultimo acierto: el toast se va solo y en una tanda
  // de escaneos seguidos el mensajero necesita ver que la anterior si entro.
  const [ultimaRecibida, setUltimaRecibida] = useState<number | null>(null);

  /** Rechazo: el toast de siempre y el mismo motivo para la tarjeta (SLT-158). */
  const rechazar = useCallback(
    (motivo: string): ResultadoLectura => {
      toast.error(motivo);
      return { tipo: "error", motivo };
    },
    [toast],
  );

  /**
   * Traduce cada resultado de la acción a un toast por ítem (R12–R16). El
   * `num_guia` es el del escaneo (el mismo con el que la acción resolvió la
   * orden): es lo que el humano ve impreso en la etiqueta, a diferencia del
   * `result.ordenId`, que es el UUID interno y no le dice nada.
   */
  const notificar = useCallback(
    (result: RecibirResult, numGuia: number): ResultadoLectura => {
      const desenlace = desenlaceSatelite(result);
      switch (result.status) {
        case "ok":
          toast.success(`Guía ${numGuia} recibida.`);
          setUltimaRecibida(numGuia);
          onRecibida();
          return { tipo: "acierto" };
        case "ya_recibida":
          // La lectura fue buena: el paquete ya estaba dentro. Suena como acierto.
          toast.info(`La guía ${numGuia} ya estaba recibida.`);
          onRecibida();
          return { tipo: "acierto" };
        case "no_encontrada":
          return rechazar("Orden no encontrada.");
        default:
          return rechazar(desenlace.tipo === "no_se_pudo" ? desenlace.motivo : "");
      }
    },
    [toast, onRecibida, rechazar],
  );

  /**
   * Dado el texto leído (cámara, tecleo o pistola), recibe la orden. Todos lo leen con
   * `leerGuia` (SLT-157): el QR (`<origin>/paquete/<numGuia>`) o el CODE128 (dígitos) de la
   * etiqueta. CORTE LIMPIO: un texto que no resuelve a num_guia (p. ej. el UUID de una
   * etiqueta vieja) se rechaza aquí con el mismo mensaje que el `validation_error` del
   * borde, sin llamar a la acción. La cámara ya cerró el visor antes de invocarnos.
   */
  const procesar = useCallback(
    async (escaneado: string): Promise<ResultadoLectura> => {
      const numGuia = leerGuia(escaneado);
      if (numGuia === null) return rechazar("Código inválido.");
      const result = await recibirPorQr({ numGuia });
      return notificar(result, numGuia);
    },
    [notificar, rechazar],
  );

  return (
    /* 2026-07-31 (decisión del humano): la tarjeta vive TRAS su disparador, como en el resto
       de la app — desde el 2026-08-10, en modal. Sin él, `QrScanner` quedaba montado todo el
       tiempo que la bodega tuviera la pantalla abierta, con la cámara encendida detrás del
       listado. El label es el que `EscanerModal` trae por defecto. */
    <EscanerModal
      acciones={
        <RecibirPaquetesEntrada href={hrefRecibirPaquetes}>
          <EscanerRecepcion modo="continua" onRecibida={onRecibida} />
        </RecibirPaquetesEntrada>
      }
    >
      <EscanerGuiaCard
        ariaLabel="Recibir por número de guía o escaneo"
        titulo="Recibir paquete"
        descripcion="Escanea o ingresa el número de guía"
        onDecoded={procesar}
        mensajeErrorCamara="No se pudo abrir la cámara."
        manual={{ onSubmit: procesar, submitLabel: "Recibir" }}
        exito={
          ultimaRecibida === null ? undefined : (
            <>
              Guía <span className="font-semibold">{ultimaRecibida}</span> recibida
              correctamente.
            </>
          )
        }
      />
    </EscanerModal>
  );
}
