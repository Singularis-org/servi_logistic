"use client";

import { useCallback, useState } from "react";

import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { useToast } from "@/hooks/useToast";
import { recibirEnOrigenPorQr } from "@/lib/actions/recepcion-origen";
import { leerGuia } from "@/lib/utils/paquete-url";
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
  /** Se invoca tras una recepción efectiva o idempotente (ok/ya_recibida). */
  onRecibida: () => void;
}

export function EscanerRecepcionOrigen({
  onRecibida,
}: Readonly<EscanerRecepcionOrigenProps>) {
  const toast = useToast();
  const [ultimaRecibida, setUltimaRecibida] = useState<number | null>(null);

  /** Rechazo: el toast de siempre y el mismo motivo para la tarjeta (SLT-158). */
  const rechazar = useCallback(
    (motivo: string): ResultadoLectura => {
      toast.error(motivo);
      return { tipo: "error", motivo };
    },
    [toast],
  );

  /** Traduce cada resultado de la acción a un toast y al resultado de la lectura. */
  const notificar = useCallback(
    (result: RecibirEnOrigenResult, numGuia: number): ResultadoLectura => {
      switch (result.status) {
        case "ok":
          toast.success(`Guía ${numGuia} recibida en tienda.`);
          setUltimaRecibida(numGuia);
          onRecibida();
          return { tipo: "acierto" };
        case "ya_recibida":
          // La lectura fue buena: el paquete ya estaba dentro. Suena como acierto.
          toast.info(`La guía ${numGuia} ya estaba recibida.`);
          onRecibida();
          return { tipo: "acierto" };
        case "tienda_ajena":
          return rechazar("Esta orden es de otra tienda.");
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
          return rechazar("La orden cambió de estado. Vuelve a escanear.");
      }
    },
    [toast, onRecibida, rechazar],
  );

  /**
   * Cámara, tecleo o pistola: el QR (`<origin>/paquete/<numGuia>`) o el CODE128 (dígitos) de
   * la etiqueta, los dos por `leerGuia` (SLT-157). El camino tecleado es un pedido humano del
   * 2026-08-10: sin cámara disponible, o con una etiqueta ilegible, no había forma de recibir.
   * Un texto que no resuelve a num_guia (p. ej. el UUID de una etiqueta vieja) se rechaza
   * aquí con "Código inválido.", sin llamar a la acción.
   */
  const procesar = useCallback(
    async (escaneado: string): Promise<ResultadoLectura> => {
      const numGuia = leerGuia(escaneado);
      if (numGuia === null) return rechazar("Código inválido.");
      const result = await recibirEnOrigenPorQr({ numGuia });
      return notificar(result, numGuia);
    },
    [notificar, rechazar],
  );

  return (
    <EscanerGuiaCard
      ariaLabel="Recepción en tienda por escaneo"
      titulo="Recibir paquete"
      descripcion="Escanea el código de la guía devuelta o ingresa su número"
      manual={{ onSubmit: procesar, submitLabel: "Recibir paquete" }}
      onDecoded={procesar}
      mensajeErrorCamara="No se pudo abrir la cámara."
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
