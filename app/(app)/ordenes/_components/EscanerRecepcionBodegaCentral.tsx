"use client";

import { useCallback, useState } from "react";

import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { useToast } from "@/hooks/useToast";
import { recibirEnBodegaCentralPorQr } from "@/lib/actions/recepcion-bodega-central";
import { leerGuia } from "@/lib/utils/paquete-url";
import type { RecibirEnBodegaCentralResult } from "@/lib/types/recepcion-bodega-central";

import { estatusLabel } from "./estatus-label";

// Feature 138 — Receptor en `/ordenes` (encabezado, solo maestro/admin): cierra el
// callejón de `en_ruta_bodega_central`. Espejo de `EscanerRecepcionOrigen`, con DOS
// entradas equivalentes (R12): (a) escaneo de QR por cámara y (b) entrada manual del
// número de guía. Ambas funelan a la MISMA Server Action `recibirEnBodegaCentralPorQr`
// y traducen el resultado a un toast por estado (R15). Tras `ok`/`ya_recibida` invoca
// `onRecibida` para refrescar el listado (R14).
//
// SLT-158: cada lectura DEVUELVE su resultado a la tarjeta (acierto, o error con el mismo
// motivo del toast) para el tono, la marca y la línea de error. Sin guard `procesando`
// propio: la tarjeta encola las lecturas y las envía de a una (R574); el guard tiraba la
// segunda lectura de la pistola.
//
// El rol (maestro/admin) NO se decide aquí: el padre (OrdenesListado) solo monta este
// control cuando `puedeRecibirBodegaCentral`, y el service revalida server-side (R16).

export interface EscanerRecepcionBodegaCentralProps {
  /** Se invoca tras una recepción efectiva o idempotente (ok/ya_recibida). */
  onRecibida: () => void;
}

export function EscanerRecepcionBodegaCentral({
  onRecibida,
}: Readonly<EscanerRecepcionBodegaCentralProps>) {
  const toast = useToast();
  // Confirmacion PERSISTENTE del ultimo acierto: el toast se va solo y quien recibe
  // una tanda seguida necesita ver que la anterior si entro.
  const [ultimaRecibida, setUltimaRecibida] = useState<number | null>(null);

  /** Rechazo: el toast de siempre y el mismo motivo para la tarjeta (SLT-158). */
  const rechazar = useCallback(
    (motivo: string): ResultadoLectura => {
      toast.error(motivo);
      return { tipo: "error", motivo };
    },
    [toast],
  );

  /** Traduce cada resultado de la acción a un toast (R15, los 8 estados). */
  const notificar = useCallback(
    (result: RecibirEnBodegaCentralResult, numGuia: number): ResultadoLectura => {
      switch (result.status) {
        case "ok":
          // Feature 139/T3.5: la recepción central es STATE-AWARE. Si la orden venía
          // en `devolviendo_a_bodega_central`, la acción la deja en `por_devolver_a_tienda`
          // (no en bodega central): el toast nombra ese destino real. El caso 138
          // (`en_bodega_central`) conserva su mensaje.
          toast.success(
            result.estado === "por_devolver_a_tienda"
              ? `Guía ${numGuia} recibida; queda por devolver a la tienda.`
              : `Guía ${numGuia} recibida en bodega central.`,
          );
          setUltimaRecibida(numGuia);
          onRecibida();
          return { tipo: "acierto" };
        case "ya_recibida":
          // La lectura fue buena: el paquete ya estaba dentro. Suena como acierto.
          toast.info(`La guía ${numGuia} ya estaba recibida.`);
          onRecibida();
          return { tipo: "acierto" };
        case "estado_invalido":
          return rechazar(
            `No se puede recibir: la orden está en "${estatusLabel(result.estado)}".`,
          );
        case "no_encontrada":
          return rechazar("Orden no encontrada.");
        case "validation_error":
          return rechazar("Código inválido.");
        case "forbidden":
          return rechazar("No tienes permiso para recibir órdenes.");
        case "unauthenticated":
          return rechazar("Tu sesión expiró. Inicia sesión de nuevo.");
        case "conflict":
          return rechazar("La orden cambió de estado. Vuelve a intentar.");
      }
    },
    [toast, onRecibida, rechazar],
  );

  /**
   * Cámara, tecleo o pistola: el QR (`<origin>/paquete/<numGuia>`) o el CODE128 (dígitos) de
   * la etiqueta, los dos por `leerGuia` (SLT-157), así la pistola 2D que teclea la URL del QR
   * también vale. Un texto que no resuelve a num_guia (p. ej. el UUID de una etiqueta vieja)
   * se rechaza aquí con "Código inválido", sin llamar a la acción (R10).
   */
  const procesar = useCallback(
    async (escaneado: string): Promise<ResultadoLectura> => {
      const numGuia = leerGuia(escaneado);
      if (numGuia === null) return rechazar("Código inválido.");
      const result = await recibirEnBodegaCentralPorQr({ numGuia });
      return notificar(result, numGuia);
    },
    [notificar, rechazar],
  );

  return (
    <EscanerGuiaCard
      ariaLabel="Recepción en bodega central"
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
  );
}
