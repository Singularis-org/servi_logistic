"use client";

import { useCallback, useState } from "react";

import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
import { useToast } from "@/hooks/useToast";
import { recibirEnOrigenPorQr } from "@/lib/actions/recepcion-origen";
import { leerGuia } from "@/lib/utils/paquete-url";
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
  /** SLT-159: `suelta` (lo de hoy), `continua` (el diálogo con lista) o `pagina`. */
  modo?: ModoRecepcion;
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
  modo = "suelta",
}: Readonly<EscanerRecepcionOrigenProps>) {
  if (modo === "continua") {
    return (
      <TarjetaEscaneoContinuo
        recibir={recibirOrigen}
        alCerrarConRecepcion={onRecibida}
        ariaLabel="Recepción continua en tienda"
        titulo="Recibir paquetes"
        descripcion="Escanea las guías una tras otra"
        submitLabel="Recibir"
      />
    );
  }
  return <RecepcionOrigenSuelta onRecibida={onRecibida} />;
}

function RecepcionOrigenSuelta({ onRecibida }: Readonly<{ onRecibida: () => void }>) {
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
      const desenlace = desenlaceOrigen(result);
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
        case "no_encontrada":
          return rechazar("Orden no encontrada.");
        default:
          return rechazar(desenlace.tipo === "no_se_pudo" ? desenlace.motivo : "");
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
