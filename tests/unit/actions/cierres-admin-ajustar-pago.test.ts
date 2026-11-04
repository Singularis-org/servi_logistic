import { describe, it, expect, vi } from "vitest";

import { ajustarPagoMensajeroGestion } from "@/lib/actions/cierres-admin";
import type { ICierresAdminService } from "@/lib/interfaces/services/ICierresAdminService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-56 (T6) — EL BORDE del ajuste del pago al mensajero. Decide solo dos cosas: que no hay sesión
// (`unauthenticated`, antes de parsear) y que la FORMA es la del contrato (`validation_error` de zod).
// Rol, alcance, estado e importes contra la base los decide el servicio.

const ADMIN_SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };
const GESTION = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const MOTIVO = "dos viajes por la misma orden";
const ENTRADA = { gestionId: GESTION, pagoAnterior: "0.00", pagoNuevo: "1500.00", motivo: MOTIVO };

const OK = {
  status: "ok" as const,
  gestionId: GESTION,
  pagoMensajero: "1500.00",
  totalPagoMensajero: "4500.00",
  ajuste: {
    creadoAt: "2026-10-29T15:00:00.000Z",
    actorNombre: "Sara Satélite",
    actorRol: "adminSatelite" as const,
    pagoAnterior: "0.00",
    pagoNuevo: "1500.00",
    motivo: MOTIVO,
  },
};

function fakeService() {
  return {
    ajustarPagoMensajeroGestion: vi.fn(async () => OK),
  } as unknown as ICierresAdminService;
}

describe("SLT-56/R4 — sin sesión", () => {
  it("es `unauthenticated` ANTES de parsear: ni con un payload inválido se revela la forma", async () => {
    const service = fakeService();
    for (const input of [ENTRADA, { basura: true }]) {
      const r = await ajustarPagoMensajeroGestion(input, { service, getActor: async () => null });
      expect(r).toEqual({ status: "unauthenticated" });
    }
    expect(service.ajustarPagoMensajeroGestion).not.toHaveBeenCalled();
  });
});

describe("SLT-56/T6 — con sesión, delega en el servicio", () => {
  it("pasa el payload PARSEADO (motivo recortado) y el actor; el ok cruza tal cual con importes string", async () => {
    const service = fakeService();
    const r = await ajustarPagoMensajeroGestion(
      { ...ENTRADA, motivo: `  ${MOTIVO}  ` },
      { service, getActor: async () => ADMIN_SATELITE },
    );
    expect(r).toEqual(OK);
    expect(vi.mocked(service.ajustarPagoMensajeroGestion).mock.calls[0]).toEqual([
      ENTRADA,
      ADMIN_SATELITE,
    ]);
    if (r.status === "ok") {
      expect(typeof r.pagoMensajero).toBe("string");
      expect(typeof r.totalPagoMensajero).toBe("string");
    }
  });

  it("los desenlaces del servicio cruzan sin traducirse", async () => {
    for (const salida of [
      { status: "forbidden" as const },
      { status: "no_encontrada" as const },
      { status: "conflict" as const },
      { status: "validation_error" as const, fieldErrors: { pagoNuevo: ["x"] } },
    ]) {
      const service = {
        ajustarPagoMensajeroGestion: vi.fn(async () => salida),
      } as unknown as ICierresAdminService;
      const r = await ajustarPagoMensajeroGestion(ENTRADA, {
        service,
        getActor: async () => ADMIN_SATELITE,
      });
      expect(r).toEqual(salida);
    }
  });
});

describe("SLT-56/R7, R8 — forma inválida es `validation_error` y el servicio no se toca", () => {
  it.each([
    ["motivo en blanco", { ...ENTRADA, motivo: "   " }, "motivo"],
    ["sin motivo", { gestionId: GESTION, pagoAnterior: "0.00", pagoNuevo: "1.00" }, "motivo"],
    ["pagoNuevo negativo", { ...ENTRADA, pagoNuevo: "-1.00" }, "pagoNuevo"],
    ["pagoNuevo con 3 decimales", { ...ENTRADA, pagoNuevo: "1.005" }, "pagoNuevo"],
    ["pagoNuevo de 11 dígitos", { ...ENTRADA, pagoNuevo: "12345678901" }, "pagoNuevo"],
    ["pagoNuevo como number", { ...ENTRADA, pagoNuevo: 1500 }, "pagoNuevo"],
  ])("%s → fieldErrors.%s", async (_n, input, campo) => {
    const service = fakeService();
    const r = await ajustarPagoMensajeroGestion(input, {
      service,
      getActor: async () => ADMIN_SATELITE,
    });
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") {
      expect((r.fieldErrors as Record<string, string[] | undefined>)[campo]?.length).toBeGreaterThan(0);
    }
    expect(service.ajustarPagoMensajeroGestion).not.toHaveBeenCalled();
  });

  it.each([
    ["gestionId no uuid", { ...ENTRADA, gestionId: "g-1" }],
    ["clave ajena (.strict)", { ...ENTRADA, totalPagoMensajero: "0.00" }],
    ["payload nulo", null],
  ])("%s → validation_error", async (_n, input) => {
    const service = fakeService();
    const r = await ajustarPagoMensajeroGestion(input, {
      service,
      getActor: async () => ADMIN_SATELITE,
    });
    expect(r.status).toBe("validation_error");
    expect(service.ajustarPagoMensajeroGestion).not.toHaveBeenCalled();
  });
});
