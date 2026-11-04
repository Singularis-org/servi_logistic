// SLT-40 (design §4.1) — decide si un entrante que cita un saliente va al hilo citado o cae en
// la regla actual por numero. Vive aparte del service para que las decisiones D1-D4 se cambien
// en un solo sitio y se prueben sin fakes. El motivo no se loguea ni sale en el resumen: existe
// para que los tests afirmen POR QUE se cayo a la regla actual.
import type { HiloCitado } from "@/lib/interfaces/repositories/IChatConversacionRepository";
import { normalizarTelefonoWa } from "@/lib/utils/whatsapp-telefono";

export type MotivoSinCita =
  | "sin_cita"
  | "saliente_no_encontrado"
  | "orden_eliminada"
  | "orden_sin_mensajero"
  | "numero_distinto";

export type DecisionCita =
  | { via: "cita"; ordenId: string; mensajeroId: string; telefonoE164: string }
  | { via: "regla_actual"; motivo: MotivoSinCita };

/**
 * `fromNormalizado` ya viene pasado por `normalizarTelefonoWa`; el numero del hilo se normaliza
 * aqui porque un hilo antiguo puede haberse guardado antes de la normalizacion.
 */
export function decidirEnrutadoPorCita(
  fromNormalizado: string,
  hilo: HiloCitado | null,
): DecisionCita {
  // R7/R12/R13: el repositorio ya filtro por empresa y por direccion saliente.
  if (hilo === null) return { via: "regla_actual", motivo: "saliente_no_encontrado" };
  // D1: una orden eliminada no sale en las pantallas del mensajero; el estado terminal NO se
  // mira (R9) porque la regla actual tampoco lo mira.
  if (hilo.ordenEliminada) return { via: "regla_actual", motivo: "orden_eliminada" };
  // D4: el hilo lo lleva quien lleva la orden hoy; sin mensajero nadie lo veria.
  if (hilo.ordenMensajeroAsignadoId === null) {
    return { via: "regla_actual", motivo: "orden_sin_mensajero" };
  }
  // D3: defensa ante un hilo cuyo numero cambio por correccion de datos del cliente.
  if (normalizarTelefonoWa(hilo.telefonoE164) !== fromNormalizado) {
    return { via: "regla_actual", motivo: "numero_distinto" };
  }
  return {
    via: "cita",
    ordenId: hilo.ordenId,
    mensajeroId: hilo.ordenMensajeroAsignadoId,
    telefonoE164: hilo.telefonoE164,
  };
}
