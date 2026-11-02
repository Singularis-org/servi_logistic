"use client";

import { useCallback, useState } from "react";

import { useToast } from "@/hooks/useToast";
import {
  listarMisAsignaciones,
  recogerAsignaciones,
} from "@/lib/actions/mis-asignaciones";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
// Feature 261 (F1, R13/R15): el motivo del rechazo por reserva sale de la fuente ÚNICA, la misma
// frase que pinta la card y la misma que devuelve el servidor. Aquí no se redacta nada.
import { avisoReservaParaOtroDia } from "@/lib/utils/dia-reparto-textos";
import { nombreDeEstado } from "@/lib/types/order-status";

// Feature 96 (DRY): lógica compartida por el escáner de cámara (`EscanerRecoger`) y el
// input de número de guía (`InputRecoger`). Resuelve un `num_guia` contra las órdenes
// "por recoger" del PROPIO mensajero para obtener el UUID y ACEPTA la orden con la MISMA
// Server Action `recogerAsignaciones` (por_recoger -> en_reparto), traduciendo
// el resultado a toasts. Restricción "asignada a mí": una guía que NO esté entre las
// "por recoger" cargadas NO se rechaza a ciegas: SLT-69 (hotfix 2026-10-30) relee UNA vez la
// lista vigente del servidor (`listarMisAsignaciones`, la misma lectura de la página) y, si
// tampoco está ahí, la rechaza con toast SIN llamar a la action. Sin esto, una orden asignada
// con la pantalla abierta se rechazaba en el teléfono sin preguntar al servidor. El backend
// sigue siendo la defensa real: R17 en el service + WHERE del repo.
//
// Feature 261 (F1, R13): el MISMO molde cubre un segundo rechazo — la orden RESERVADA para un
// día posterior. Son dos rechazos suaves con la misma forma y la misma defensa real detrás (el
// servidor), y el texto del segundo sale de la fuente única, no se redacta aquí.
//
// NO parsea URLs de QR: el llamador entrega ya el `num_guia` (el escáner via
// `extractNumGuiaFromScan`; el input, el texto tecleado tal cual). Tampoco decide la
// revalidación: `recoger` devuelve `true` en éxito y el consumidor dispara su refresh.

export interface UseRecogerPorGuia {
  /**
   * Recoge la orden cuyo `numGuia` coincide con `numGuia`. Devuelve `true` SOLO si la
   * recogida fue exitosa (el consumidor revalida la lista y limpia su control). Si la
   * guía no está entre las "por recoger" cargadas, relee una vez la lista del servidor; si
   * tampoco está ahí, muestra un toast de rechazo y NO llama a la action.
   */
  recoger: (numGuia: number) => Promise<boolean>;
  /** `true` mientras hay una recogida o una relectura en curso (para deshabilitar controles). */
  procesando: boolean;
}

export function useRecogerPorGuia(
  porRecoger: MiAsignacionDTO[],
): UseRecogerPorGuia {
  const toast = useToast();
  const [procesando, setProcesando] = useState(false);

  const recoger = useCallback(
    async (numGuia: number): Promise<boolean> => {
      if (procesando) return false;
      // SLT-69 (R10): la guía que SÍ está en la lista cargada sigue el camino de siempre, sin
      // un viaje extra al servidor.
      let orden = porRecoger.find((o) => o.numGuia === numGuia);
      // `procesando` se enciende ANTES de cualquier espera (relectura o recogida), para que un
      // segundo envío salga por la guarda de arriba (SLT-69/R9), y un solo `try/finally` lo
      // apaga en todos los caminos, incluida una relectura que lance.
      setProcesando(true);
      try {
        if (!orden) {
          // SLT-69 (R1-R5): la lista de la pantalla es la de cuando se abrió; una orden asignada
          // después no está en ella. Antes de rechazar se relee UNA vez la lista vigente con la
          // MISMA lectura de la página y se reintenta con ella. Sin segunda relectura.
          let vigente: Awaited<ReturnType<typeof listarMisAsignaciones>>;
          try {
            vigente = await listarMisAsignaciones();
          } catch {
            // No se traga en silencio: se convierte en el desenlace visible de reintento (R5).
            toast.error("No se pudo registrar la recogida. Intentá de nuevo.");
            return false;
          }
          if (vigente.status === "unauthenticated") {
            toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
            return false;
          }
          if (vigente.status !== "ok") {
            toast.error("No se pudo registrar la recogida. Intentá de nuevo.");
            return false;
          }
          orden = vigente.porRecoger.find((o) => o.numGuia === numGuia);
          if (!orden) {
            toast.error(`La guía ${numGuia} no está entre tus órdenes para recoger.`);
            return false;
          }
        }
        // Feature 261 (F1, R13) — LA ORDEN ESTÁ RESERVADA PARA UN DÍA POSTERIOR: se rechaza AQUÍ,
        // con el MISMO molde que el rechazo de arriba y SIN llamar a la action. El mensaje nombra
        // el motivo real y el día desde el que podrá; no se presenta como un error de la orden ni
        // como un código inválido, que es exactamente lo que R13 prohíbe. SLT-69 (R4): vale igual
        // para la orden que llegó con la relectura, con la fecha que ella trae.
        //
        // Defensa SUAVE, como la del mensajero bloqueado por cierre: la defensa real es del
        // servidor (R1/R4/R5) y vive además en el `WHERE` de la escritura. `esParaManana` lo
        // decidió el SERVIDOR (R14): el navegador no compara ninguna fecha.
        if (orden.esParaManana) {
          toast.error(avisoReservaParaOtroDia(orden.fechaRepartoISO));
          return false;
        }
        const result = await recogerAsignaciones({ ordenIds: [orden.id] });
        if (result.status === "ok") {
          toast.success(`Guía ${numGuia} recogida.`);
          return true;
        }
        switch (result.status) {
          case "conflict":
            // Feature 261 (F1, R13): la CARRERA PERDIDA. Si el cliente dejó pasar la acción —la
            // lista venía de antes de que alguien reservara la orden— el servidor la rechaza y
            // dice por qué con un CÓDIGO DE MÁQUINA, no con prosa que haya que comparar. Se pinta
            // la misma frase de arriba, con el día que la orden trae consigo: una regla, dos
            // sitios, un texto. Sin esto, el mensajero leería «la orden ya no está por recoger»,
            // que es falso y le mandaría a actualizar para siempre.
            toast.error(
              result.detalle.some((d) => d.codigo === "reservada_para_otro_dia")
                ? avisoReservaParaOtroDia(orden.fechaRepartoISO)
                : `La orden ya no está en «${nombreDeEstado("mensajero_recogiendo_en_bodega")}». Actualiza y vuelve a intentar.`,
            );
            break;
          case "forbidden":
            toast.error("No tienes permiso para recoger esta orden.");
            break;
          case "unauthenticated":
            toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
            break;
          case "validation_error":
            toast.error("Código inválido.");
            break;
          // FICHA 440: el tropiezo de base. Este `switch` NO tiene `default`, así que sin este
          // caso el desenlace nuevo no pintaría NADA: el spinner se apagaría y la guía se
          // quedaría sin recoger en silencio, que es exactamente el fallo mudo que la ficha vino
          // a tapar. No se le dice qué falló —no es asunto suyo ni lo puede arreglar—, se le dice
          // que puede volver a intentarlo, que aquí sí suele funcionar a la segunda.
          case "error":
            toast.error("No se pudo registrar la recogida. Intentá de nuevo.");
            break;
        }
        return false;
      } finally {
        setProcesando(false);
      }
    },
    [porRecoger, procesando, toast],
  );

  return { recoger, procesando };
}
