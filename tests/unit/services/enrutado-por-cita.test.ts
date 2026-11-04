// SLT-40 (design §4.1) — decision pura de enrutado por mensaje citado (R6-R12, D1-D4).
import { describe, expect, it } from "vitest";

import type { HiloCitado } from "@/lib/interfaces/repositories/IChatConversacionRepository";
import { decidirEnrutadoPorCita } from "@/lib/services/whatsapp/enrutado-por-cita";
import { normalizarTelefonoWa } from "@/lib/utils/whatsapp-telefono";

const FROM = "50688887777";

function hilo(parcial: Partial<HiloCitado> = {}): HiloCitado {
  return {
    conversacionId: "conv-1",
    ordenId: "orden-1",
    telefonoE164: FROM,
    ordenEliminada: false,
    ordenMensajeroAsignadoId: "mensajero-actual",
    ...parcial,
  };
}

describe("decidirEnrutadoPorCita", () => {
  it("R4: con hilo valido enruta por cita a la orden y numero del hilo citado", () => {
    expect(decidirEnrutadoPorCita(FROM, hilo())).toEqual({
      via: "cita",
      ordenId: "orden-1",
      mensajeroId: "mensajero-actual",
      telefonoE164: FROM,
    });
  });

  it("R6: el mensajero resultante es el asignado ACTUAL de la orden, no otro", () => {
    const decision = decidirEnrutadoPorCita(
      FROM,
      hilo({ ordenMensajeroAsignadoId: "mensajero-B" }),
    );
    expect(decision).toMatchObject({ via: "cita", mensajeroId: "mensajero-B" });
  });

  it("R7: saliente no encontrado (inexistente, entrante u otra empresa) -> regla actual", () => {
    expect(decidirEnrutadoPorCita(FROM, null)).toEqual({
      via: "regla_actual",
      motivo: "saliente_no_encontrado",
    });
  });

  it("R8: orden citada eliminada -> regla actual por orden_eliminada", () => {
    expect(decidirEnrutadoPorCita(FROM, hilo({ ordenEliminada: true }))).toEqual({
      via: "regla_actual",
      motivo: "orden_eliminada",
    });
  });

  it("R8: la eliminacion gana aunque tampoco haya mensajero", () => {
    const decision = decidirEnrutadoPorCita(
      FROM,
      hilo({ ordenEliminada: true, ordenMensajeroAsignadoId: null }),
    );
    expect(decision).toEqual({ via: "regla_actual", motivo: "orden_eliminada" });
  });

  it("R9: una orden en estado terminal pero no eliminada se enruta por cita", () => {
    // El estado terminal (entregado, devuelta_a_tienda, incidente) no es entrada de la
    // decision: solo `ordenEliminada` corta (D1a). Una orden terminal llega como no eliminada.
    const decision = decidirEnrutadoPorCita(FROM, hilo({ ordenEliminada: false }));
    expect(decision.via).toBe("cita");
  });

  it("R10: orden citada sin mensajero asignado -> regla actual por orden_sin_mensajero", () => {
    expect(decidirEnrutadoPorCita(FROM, hilo({ ordenMensajeroAsignadoId: null }))).toEqual({
      via: "regla_actual",
      motivo: "orden_sin_mensajero",
    });
  });

  it("R11: from distinto del numero del hilo -> regla actual por numero_distinto", () => {
    expect(decidirEnrutadoPorCita("50677776666", hilo())).toEqual({
      via: "regla_actual",
      motivo: "numero_distinto",
    });
  });

  it("R11: from con o sin '+' y hilo en formato local casan tras normalizar", () => {
    const hiloLocal = hilo({ telefonoE164: "88887777" });
    for (const crudo of ["+50688887777", "50688887777", "+506 8888-7777"]) {
      expect(decidirEnrutadoPorCita(normalizarTelefonoWa(crudo), hiloLocal).via).toBe("cita");
    }
  });

  it("R12: un wamid de una entrega automatica no esta en chat_mensaje -> regla actual", () => {
    // D2a: el repositorio no consulta whatsapp_envio_entrega, asi que ese wamid llega como null.
    expect(decidirEnrutadoPorCita(FROM, null)).toEqual({
      via: "regla_actual",
      motivo: "saliente_no_encontrado",
    });
  });
});
