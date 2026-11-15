"use client";

import { useCallback } from "react";

import { useToast } from "@/hooks/useToast";
import type { ResultadoLectura } from "@/hooks/useEntradaEscaneo";
import { recolectarEnTiendaPorQr } from "@/lib/actions/recoleccion-tienda";
import { nombreDeEstado } from "@/lib/types/order-status";

// Feature 157 (R21/R23) — espejo de `useRecogerPorGuia` para la RECOLECCIÓN EN TIENDA.
// Lógica compartida por las dos vías de entrada del apartado (escáner de cámara e input de
// número de guía): confirma la recolección con la MISMA Server Action por las dos vías
// (`recolectando` -> `en_ruta_bodega_central`) y traduce el resultado a toasts (R10/R13).
//
// Feature 167 (R12) — SIN pre-chequeo local de "esa guía no es tuya". El hook vivía dentro
// de Entregas y rechazaba en cliente toda guía que no estuviera en la lista cargada. Con el
// escáner SIEMPRE montado (R7) eso se vuelve una trampa: con lista vacía ningún escaneo
// podría tener éxito jamás, y con la página abierta desde hace rato rechazaría guías que el
// maestro ACABA de asignarle. El servidor es la autoridad y ya tiene las guardias reales
// —rol, propiedad, estado, bloqueo y carrera (`RecoleccionTiendaService`)—, y la opacidad
// de la 157/R30 hace que una guía ajena responda `no_encontrada` sin filtrar su existencia.
// Coste aceptado: un viaje de servidor por escaneo equivocado.
//
// Lo que SÍ sigue cortándose en el cliente es el código MAL FORMADO (R11): eso no consulta
// datos, solo evita mandar basura. Lo hace el llamador (`leerGuia`, la misma para cámara y
// teclado desde SLT-157) antes de entrar aquí.
//
// NO parsea URLs de QR: el llamador entrega ya el `num_guia`. Tampoco decide la
// revalidación: `recolectar` devuelve el acierto y el consumidor dispara su refresh.
//
// SLT-158: devuelve el resultado de la lectura (acierto, o error con el MISMO texto del toast)
// para la tarjeta de escaneo, y ya no lleva guarda `procesando`: la tarjeta encola las
// lecturas y las envía de a una (R574); la guarda tiraba la segunda lectura de la pistola.

export interface UseRecolectarPorGuia {
  /**
   * Confirma la recolección de la orden de ese `numGuia`. Devuelve `{ tipo: "acierto" }` SOLO
   * si la orden quedó en ruta a la bodega central —o ya lo estaba, que para el mensajero es el
   * mismo hecho consumado— para que el consumidor revalide; si no, el error con su motivo.
   */
  recolectar: (numGuia: number) => Promise<ResultadoLectura>;
}

export function useRecolectarPorGuia(): UseRecolectarPorGuia {
  const toast = useToast();

  const recolectar = useCallback(
    async (numGuia: number): Promise<ResultadoLectura> => {
      /** Rechazo: el toast de siempre y el mismo motivo para la tarjeta (SLT-158). */
      const rechazar = (motivo: string): ResultadoLectura => {
        toast.error(motivo);
        return { tipo: "error", motivo };
      };
      const result = await recolectarEnTiendaPorQr({ numGuia });
      // Un toast DISTINTO por resultado (R13): en una recolección de decenas de paquetes,
      // "ya la habías escaneado" y "esa no es tuya" piden reacciones opuestas del mensajero.
      switch (result.status) {
        case "ok":
          toast.success(`Guía ${numGuia} recolectada. Va a la bodega central.`);
          return { tipo: "acierto" };
        case "ya_recolectada":
          // Idempotente: escanear dos veces la misma etiqueta es normal, no un error.
          toast.info(`La guía ${numGuia} ya estaba recolectada.`);
          return { tipo: "acierto" };
        case "estado_invalido":
          // FICHA 455 (2026-09-24, design §2.1; R3): el estado por su NOMBRE, nunca el código crudo.
          return rechazar(
            `La guía ${numGuia} ya no está por recolectar (está en «${nombreDeEstado(result.estado)}»).`,
          );
        case "no_encontrada":
          // R12: este es el mensaje que ANTES daba el corte local. Ahora lo decide el
          // servidor, que es quien sabe de quién es la orden; el mensajero lee lo mismo.
          return rechazar(`La guía ${numGuia} no está entre tus órdenes por recolectar.`);
        case "conflict":
          return rechazar(result.motivo);
        case "forbidden":
          return rechazar("No tienes permiso para recolectar órdenes.");
        case "unauthenticated":
          return rechazar("Tu sesión expiró. Inicia sesión de nuevo.");
        case "validation_error":
          return rechazar("Código inválido.");
      }
    },
    [toast],
  );

  return { recolectar };
}
