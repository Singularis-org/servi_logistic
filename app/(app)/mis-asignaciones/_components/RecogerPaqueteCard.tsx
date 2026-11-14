"use client";

import { useCallback, useState } from "react";
import { PackageCheck } from "lucide-react";

import { EscanerModal } from "@/components/shared/EscanerModal";
import {
  EscanerGuiaCard,
  type ResultadoLectura,
} from "@/components/shared/EscanerGuiaCard";
import { useToast } from "@/hooks/useToast";
import { leerGuia } from "@/lib/utils/paquete-url";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

import { useRecogerPorGuia } from "./useRecogerPorGuia";

// Feature 96 — la recogida del mensajero, en UN solo control: los DOS caminos que antes
// eran dos secciones sueltas (`EscanerRecoger` + `InputRecoger`) viven ahora en la misma
// tarjeta, cada uno a un lado del separador. La logica no cambia: ambos resuelven el
// num_guia contra `porRecoger` (restriccion "asignada a mi") y aceptan con la MISMA
// action via `useRecogerPorGuia`, directo al confirmar (sin modal).
//
// SLT-157: los dos caminos leen con la MISMA `leerGuia`: la camara puede leer el QR (URL
// del paquete) o el CODE128 (digitos), y la pistola teclea cualquiera de los dos. Lo que
// no es guia se rechaza con mensaje por los dos caminos.
//
// SLT-158: la lectura DEVUELVE su resultado a la tarjeta (tono, marca, línea de error) y ya no
// se deshabilita nada mientras se procesa: la tarjeta encola las lecturas (R574).

export interface RecogerPaqueteCardProps {
  /** Órdenes en `por_recoger`: resuelven numGuia -> id. */
  porRecoger: MiAsignacionDTO[];
  /** Se invoca tras una recogida exitosa (el módulo lo conecta a router.refresh()). */
  onRecogida: () => void;
}

export function RecogerPaqueteCard({
  porRecoger,
  onRecogida,
}: Readonly<RecogerPaqueteCardProps>) {
  const toast = useToast();
  const { recoger } = useRecogerPorGuia(porRecoger);
  // Confirmación PERSISTENTE de la última recogida: el toast se va solo y en una tanda
  // seguida el mensajero necesita ver que la anterior sí entró.
  const [ultimaRecogida, setUltimaRecogida] = useState<number | null>(null);

  /**
   * Cámara, tecleo o pistola: misma `leerGuia` para todos. Lo que no es guía se rechaza con
   * mensaje y no se llama a la action.
   */
  const procesar = useCallback(
    async (texto: string): Promise<ResultadoLectura> => {
      const numGuia = leerGuia(texto);
      if (numGuia === null) {
        toast.error("Código inválido.");
        return { tipo: "error", motivo: "Código inválido." };
      }
      const resultado = await recoger(numGuia);
      if (resultado.tipo === "acierto") {
        setUltimaRecogida(numGuia);
        onRecogida();
      }
      return resultado;
    },
    [recoger, onRecogida, toast],
  );

  return (
    /* 2026-07-31 (decisión del humano): la tarjeta vive TRAS su disparador, como en el resto
       de la app — desde el 2026-08-10, en modal. Sin él, `QrScanner` quedaba montado todo el
       tiempo que el mensajero tuviera abierta la pantalla — o sea, la cámara encendida en la
       calle. La confirmación de la última recogida vive FUERA de la tarjeta (en el estado de
       este componente), así que cerrar y reabrir no la pierde.
       El label NO es el de por defecto: aquí se RECOGE, no se recibe. */
    <EscanerModal label="Recoger paquete">
      <EscanerGuiaCard
        ariaLabel="Recoger por número de guía o escaneo"
        titulo="Recoger paquete"
        descripcion="Escanea o ingresa el número de guía"
        icono={PackageCheck}
        onDecoded={procesar}
        mensajeErrorCamara="No se pudo abrir la cámara."
        manual={{ onSubmit: procesar, submitLabel: "Recoger" }}
        exito={
          ultimaRecogida === null ? undefined : (
            <>
              Guía <span className="font-semibold">{ultimaRecogida}</span> recogida
              correctamente.
            </>
          )
        }
      />
    </EscanerModal>
  );
}
