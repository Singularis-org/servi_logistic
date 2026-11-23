// SLT-40 (design §4.1) — decision pura de enrutado por mensaje citado (R6-R12, D1-D4).
import { describe, expect, it } from "vitest";

import type { HiloCitado } from "@/lib/interfaces/repositories/IChatConversacionRepository";
import { decidirEnrutadoPorCita } from "@/lib/services/whatsapp/enrutado-por-cita";
import { normalizarTelefono, type ReglasTelefono } from "@/lib/utils/telefono-pais";

// SLT-42 (R18): la decision compara con las reglas del pais de la empresa.
const TEL_CR: ReglasTelefono = { prefijo: "506", digitosNacionales: 8 };
const TEL_OTRO: ReglasTelefono = { prefijo: "507", digitosNacionales: 7 };

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
    expect(decidirEnrutadoPorCita(FROM, hilo(), TEL_CR)).toEqual({
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
      TEL_CR,
    );
    expect(decision).toMatchObject({ via: "cita", mensajeroId: "mensajero-B" });
  });

  it("R7: saliente no encontrado (inexistente, entrante u otra empresa) -> regla actual", () => {
    expect(decidirEnrutadoPorCita(FROM, null, TEL_CR)).toEqual({
      via: "regla_actual",
      motivo: "saliente_no_encontrado",
    });
  });

  it("R8: orden citada eliminada -> regla actual por orden_eliminada", () => {
    expect(decidirEnrutadoPorCita(FROM, hilo({ ordenEliminada: true }), TEL_CR)).toEqual({
      via: "regla_actual",
      motivo: "orden_eliminada",
    });
  });

  it("R8: la eliminacion gana aunque tampoco haya mensajero", () => {
    const decision = decidirEnrutadoPorCita(
      FROM,
      hilo({ ordenEliminada: true, ordenMensajeroAsignadoId: null }),
      TEL_CR,
    );
    expect(decision).toEqual({ via: "regla_actual", motivo: "orden_eliminada" });
  });

  it("R9: una orden en estado terminal pero no eliminada se enruta por cita", () => {
    // El estado terminal (entregado, devuelta_a_tienda, incidente) no es entrada de la
    // decision: solo `ordenEliminada` corta (D1a). Una orden terminal llega como no eliminada.
    const decision = decidirEnrutadoPorCita(FROM, hilo({ ordenEliminada: false }), TEL_CR);
    expect(decision.via).toBe("cita");
  });

  it("R10: orden citada sin mensajero asignado -> regla actual por orden_sin_mensajero", () => {
    expect(decidirEnrutadoPorCita(FROM, hilo({ ordenMensajeroAsignadoId: null }), TEL_CR)).toEqual({
      via: "regla_actual",
      motivo: "orden_sin_mensajero",
    });
  });

  it("R11: from distinto del numero del hilo -> regla actual por numero_distinto", () => {
    expect(decidirEnrutadoPorCita("50677776666", hilo(), TEL_CR)).toEqual({
      via: "regla_actual",
      motivo: "numero_distinto",
    });
  });

  it("R11: from con o sin '+' y hilo en formato local casan tras normalizar", () => {
    const hiloLocal = hilo({ telefonoE164: "88887777" });
    for (const crudo of ["+50688887777", "50688887777", "+506 8888-7777"]) {
      expect(decidirEnrutadoPorCita(normalizarTelefono(crudo, TEL_CR), hiloLocal, TEL_CR).via).toBe("cita");
    }
  });

  it("SLT-42 R18: el hilo local se compara con el prefijo del pais de la empresa, no con el de CR", () => {
    const hiloLocal = hilo({ telefonoE164: "612-3456" });
    expect(decidirEnrutadoPorCita(normalizarTelefono("+507 612 3456", TEL_OTRO), hiloLocal, TEL_OTRO).via).toBe("cita");
    // Con las reglas de CR ese local de 7 digitos no se prefija y no casa.
    expect(decidirEnrutadoPorCita("5076123456", hiloLocal, TEL_CR)).toEqual({
      via: "regla_actual",
      motivo: "numero_distinto",
    });
  });

  it("R12: un wamid de una entrega automatica no esta en chat_mensaje -> regla actual", () => {
    // D2a: el repositorio no consulta whatsapp_envio_entrega, asi que ese wamid llega como null.
    expect(decidirEnrutadoPorCita(FROM, null, TEL_CR)).toEqual({
      via: "regla_actual",
      motivo: "saliente_no_encontrado",
    });
  });
});
