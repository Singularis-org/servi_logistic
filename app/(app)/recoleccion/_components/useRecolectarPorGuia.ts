"use client";

import { useCallback } from "react";

import { recolectarEnTiendaPorQr } from "@/lib/actions/recoleccion-tienda";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { ResumenRecepcion } from "@/lib/interfaces/repositories/IOrdenRepository";
import { nombreDeEstado } from "@/lib/types/order-status";
import type { DesenlaceRecepcion } from "@/lib/utils/sesion-escaneo";

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
//
// SLT-168 «Escaneo continuo en las recogidas del mensajero»: devuelve el DESENLACE de la fila
// de la sesión continua (R596) y ya no lanza toasts (R590). `conocidas` (las dos listas
// cargadas) solo da destinatario y tienda (R832); NO rechaza en cliente (167/R12 sigue).

export interface UseRecolectarPorGuia {
  /**
   * Confirma la recolección de la orden de ese `numGuia`. Devuelve `recibida` si la orden quedó
   * en ruta a la bodega central, `ya_recibida` si ya lo estaba (las dos refrescan al cerrar),
   * `no_encontrada` si no es suya, y si no `no_se_pudo` con el motivo de siempre. Sin toasts.
   */
  recolectar: (numGuia: number) => Promise<DesenlaceRecepcion>;
}

export function useRecolectarPorGuia(
  /** Solo para el `resumen` (R832): «Por recolectar» + «Recogidos en tienda hoy» cargadas. */
  conocidas: readonly MiAsignacionDTO[],
): UseRecolectarPorGuia {
  const recolectar = useCallback(
    async (numGuia: number): Promise<DesenlaceRecepcion> => {
      const rechazar = (motivo: string): DesenlaceRecepcion => ({ tipo: "no_se_pudo", motivo });
      /** R832: de la orden cargada con esa guía; si no está, sin resumen («—»). */
      const resumen = (): ResumenRecepcion | undefined => {
        const orden = conocidas.find((o) => o.numGuia === numGuia);
        return orden ? { destinatario: orden.destinatario, tienda: orden.tiendaNombre } : undefined;
      };
      const result = await recolectarEnTiendaPorQr({ numGuia });
      // Un desenlace DISTINTO por resultado (R13): en una recolección de decenas de paquetes,
      // "ya la habías escaneado" y "esa no es tuya" piden reacciones opuestas del mensajero.
      switch (result.status) {
        case "ok":
          return { tipo: "recibida", resumen: resumen() };
        case "ya_recolectada":
          // Idempotente: escanear dos veces la misma etiqueta es normal, no un error.
          return { tipo: "ya_recibida", resumen: resumen() };
        case "estado_invalido":
          // FICHA 455 (2026-09-24, design §2.1; R3): el estado por su NOMBRE, nunca el código crudo.
          return rechazar(
            `La guía ${numGuia} ya no está por recolectar (está en «${nombreDeEstado(result.estado)}»).`,
          );
        case "no_encontrada":
          // R12: lo decide el servidor, que es quien sabe de quién es la orden (R596).
          return { tipo: "no_encontrada" };
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
    [conocidas],
  );

  return { recolectar };
}
