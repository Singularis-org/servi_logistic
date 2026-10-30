import { describe, it, expect, vi } from "vitest";

import {
  anularIncentivoMensajeroAction,
  registrarIncentivoMensajeroAction,
} from "@/lib/actions/incentivo-mensajero";
import type { IIncentivoMensajeroService } from "@/lib/interfaces/services/IIncentivoMensajeroService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-68 (design §6.1, §7) — el BORDE del incentivo: sesion antes que nada (R2) y cada campo
// invalido es `validation_error` con SU clave, sin llegar al servicio (R3).
// ═════════════════════════════════════════════════════════════════════════════════════════════

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const MENSAJERO = "6a1d1f4e-6f0a-4d43-9d1b-2b8d6f1c0a01";
const CLAVE = "1b7a4f0e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";

function fd(campos: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
  return f;
}

const VALIDO = { mensajeroId: MENSAJERO, monto: "2500.00", motivo: "Rutas extra", claveIdempotencia: CLAVE };

function servicio() {
  const s = {
    registrar: vi.fn(async () => ({ status: "ya_registrado" as const })),
    anular: vi.fn(async () => ({ status: "ok" as const })),
  };
  return s as typeof s & IIncentivoMensajeroService;
}

/** Mañana en Costa Rica, `YYYY-MM-DD`. */
function manana(): string {
  return fechaCalendarioCR(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

describe("SLT-68 R2 — sin sesion, `unauthenticated` antes del schema", () => {
  it("registrar: una peticion INVALIDA sin sesion responde `unauthenticated`, no `validation_error`", async () => {
    const s = servicio();
    const r = await registrarIncentivoMensajeroAction(fd({ monto: "-1" }), { service: s, getActor: async () => null });
    expect(r).toEqual({ status: "unauthenticated" });
    expect(s.registrar).not.toHaveBeenCalled();
  });

  it("anular: igual", async () => {
    const s = servicio();
    const r = await anularIncentivoMensajeroAction({ monto: "1" }, { service: s, getActor: async () => null });
    expect(r).toEqual({ status: "unauthenticated" });
    expect(s.anular).not.toHaveBeenCalled();
  });
});

describe("SLT-68 R3 — cada campo invalido es `validation_error` con su clave y no llega al servicio", () => {
  const casos: [string, Record<string, string | undefined>, string][] = [
    ["sin mensajero", { ...VALIDO, mensajeroId: undefined }, "mensajeroId"],
    ["mensajero que no es un id", { ...VALIDO, mensajeroId: "juan" }, "mensajeroId"],
    ["sin monto", { ...VALIDO, monto: undefined }, "monto"],
    ["monto cero", { ...VALIDO, monto: "0" }, "monto"],
    ["monto negativo", { ...VALIDO, monto: "-5.00" }, "monto"],
    ["monto con tres decimales", { ...VALIDO, monto: "10.555" }, "monto"],
    ["monto no numerico", { ...VALIDO, monto: "diez" }, "monto"],
    ["sin motivo", { ...VALIDO, motivo: undefined }, "motivo"],
    ["motivo solo espacios", { ...VALIDO, motivo: "   " }, "motivo"],
    ["fecha con otro formato", { ...VALIDO, fecha: "01-10-2026" }, "fecha"],
    ["fecha que no existe", { ...VALIDO, fecha: "2026-02-31" }, "fecha"],
    ["fecha futura", { ...VALIDO, fecha: manana() }, "fecha"],
    ["sin clave de idempotencia", { ...VALIDO, claveIdempotencia: undefined }, "claveIdempotencia"],
  ];

  for (const [nombre, campos, clave] of casos) {
    it(`${nombre} → validation_error en «${clave}»`, async () => {
      const s = servicio();
      const r = await registrarIncentivoMensajeroAction(fd(campos), { service: s, getActor: async () => MAESTRO });
      expect(r.status).toBe("validation_error");
      if (r.status !== "validation_error") throw new Error("imposible");
      expect(Object.keys(r.fieldErrors)).toContain(clave);
      expect(s.registrar).not.toHaveBeenCalled();
    });
  }

  it("`.strict()`: un `cierreId` colado es `validation_error` y no llega al servicio", async () => {
    const s = servicio();
    const r = await registrarIncentivoMensajeroAction(fd({ ...VALIDO, cierreId: MENSAJERO }), { service: s, getActor: async () => MAESTRO });
    expect(r.status).toBe("validation_error");
    expect(s.registrar).not.toHaveBeenCalled();
  });

  it("valido (sin fecha y con la fecha vacia del dialogo) llega al servicio con el motivo recortado y sin fecha", async () => {
    for (const fecha of [undefined, ""]) {
      const s = servicio();
      const r = await registrarIncentivoMensajeroAction(fd({ ...VALIDO, motivo: "  Rutas extra  ", fecha }), {
        service: s,
        getActor: async () => MAESTRO,
      });
      expect(r).toEqual({ status: "ya_registrado" });
      expect(s.registrar).toHaveBeenCalledWith(
        { mensajeroId: MENSAJERO, monto: "2500.00", motivo: "Rutas extra", claveIdempotencia: CLAVE },
        MAESTRO,
      );
    }
  });

  it("anular: sin motivo, o con un monto colado, es `validation_error`", async () => {
    for (const input of [
      { incentivoId: MENSAJERO, motivo: "  " },
      { incentivoId: MENSAJERO, motivo: "x", monto: "1.00" },
      { incentivoId: "no-uuid", motivo: "x" },
    ]) {
      const s = servicio();
      const r = await anularIncentivoMensajeroAction(input, { service: s, getActor: async () => MAESTRO });
      expect(r.status).toBe("validation_error");
      expect(s.anular).not.toHaveBeenCalled();
    }
  });
});
