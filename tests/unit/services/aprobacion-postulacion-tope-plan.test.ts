import { describe, it, expect, vi } from "vitest";

import { AprobacionPostulacionService } from "@/lib/services/AprobacionPostulacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IAprobacionPostulacionRepository } from "@/lib/interfaces/repositories/IAprobacionPostulacionRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import { aprobarPostulacion } from "@/lib/actions/aprobacion-postulaciones";

// SL-24 (R27, design §6.3) — aprobar una postulación es un alta de `mensajero`. Con su tope lleno el
// trigger de `usuario` la rechaza (SQLSTATE SL024) y el servicio devuelve `tope_plan` con el mensaje.
// Repositorio mockeado: el rechazo real con `AprobacionPostulacionRepository` lo prueba
// `tests/integration/db/plan-topes-usuarios.test.ts`.

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };

const TOPE = 'tope_plan {"rol": "mensajero", "tope": "rol", "maximo": 5, "usados": 5, "pedidas": 1}';
const MENSAJE =
  "Tu plan permite 5 usuarios activos con el rol Mensajero. Ya tienes 5. Inactiva alguno o pide un cambio de plan.";

function errorDelTrigger(mensaje = TOPE) {
  return Object.assign(new Error(mensaje), {
    name: "DriverAdapterError",
    cause: { kind: "postgres", code: "SL024", originalCode: "SL024", message: mensaje },
  });
}

function servicio(actualizar: IAprobacionPostulacionRepository["actualizarEstadoSiPendiente"]) {
  const repo = {
    actualizarEstadoSiPendiente: vi.fn(actualizar),
    findMensajeroById: vi.fn().mockResolvedValue({ id: "usr-1", estado: "pendiente" }),
    listPendientes: vi.fn(),
  } as unknown as IAprobacionPostulacionRepository;
  const urls = { createSignedUrl: vi.fn(), createSignedUrls: vi.fn() } as unknown as ISignedUrlProvider;
  return { repo, service: new AprobacionPostulacionService(repo, urls) };
}

describe("SL-24 R27 — AprobacionPostulacionService.aprobar con el tope de mensajero lleno", () => {
  it("devuelve `tope_plan` con el mensaje y no reconsulta la postulación", async () => {
    const { repo, service } = servicio(async () => {
      throw errorDelTrigger();
    });

    const r = await service.aprobar("usr-1", MAESTRO);

    expect(r).toEqual({ status: "tope_plan", mensaje: MENSAJE });
    expect(repo.findMensajeroById).not.toHaveBeenCalled();
  });

  it("un error que no es del tope sigue saliendo tal cual", async () => {
    const otro = new Error("conexion caida");
    const { service } = servicio(async () => {
      throw otro;
    });

    await expect(service.aprobar("usr-1", MAESTRO)).rejects.toBe(otro);
  });

  it("sin tope el camino de siempre no cambia", async () => {
    const { service } = servicio(async () => 1);
    expect(await service.aprobar("usr-1", MAESTRO)).toEqual({
      status: "ok",
      usuarioId: "usr-1",
      estado: "activo",
    });
  });
});

describe("SL-24 R28 — la action entrega `tope_plan` al panel sin transformarlo", () => {
  it("aprobarPostulacion devuelve { status: 'tope_plan', mensaje }", async () => {
    const { service } = servicio(async () => {
      throw errorDelTrigger();
    });

    const r = await aprobarPostulacion("usr-1", { service, getActor: async () => MAESTRO });

    expect(r).toEqual({ status: "tope_plan", mensaje: MENSAJE });
  });
});
