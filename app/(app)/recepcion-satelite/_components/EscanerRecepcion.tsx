"use client";

import { useCallback, useState } from "react";

import { EscanerModal } from "@/components/shared/EscanerModal";
import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { useToast } from "@/hooks/useToast";
import { recibirPorQr } from "@/lib/actions/recepcion-satelite";
import { leerGuia } from "@/lib/utils/paquete-url";
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
  /** Se invoca tras una recepción efectiva o idempotente (ok/ya_recibida). */
  onRecibida: () => void;
}

export function EscanerRecepcion({ onRecibida }: EscanerRecepcionProps) {
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
        case "zona_ajena":
          return rechazar("Esta orden pertenece a otra zona.");
        case "estado_invalido":
          return rechazar(
            `No se puede recibir: la orden está en "${estatusLabel(result.estado)}".`,
          );
        case "no_encontrada":
          return rechazar("Orden no encontrada.");
        case "validation_error":
          return rechazar("Código inválido.");
        case "sin_zona":
          return rechazar("No tienes una zona asignada.");
        case "forbidden":
          return rechazar("No tienes permiso para recibir órdenes.");
        case "unauthenticated":
          return rechazar("Tu sesión expiró. Inicia sesión de nuevo.");
        case "conflict":
          return rechazar("La orden cambió de estado. Vuelve a escanear.");
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
    <EscanerModal>
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
