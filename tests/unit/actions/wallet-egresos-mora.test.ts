import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";

import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { anularEgresoCajaAction } from "@/lib/actions/wallet-anulacion";
import { permisoEnMoraActual } from "@/lib/db/permiso-en-mora";
import { EmpresaCongelada } from "@/lib/planes/empresa-congelada";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IWalletEgresoService } from "@/lib/interfaces/services/IWalletEgresoService";
import type { IEgresoCajaAnulacionService } from "@/lib/interfaces/services/IEgresoCajaAnulacionService";

// La zona del pais sin sesion ni base, como en `wallet-egresos-actions.test.ts`.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => reglasPaisFijas(),
  };
});

// SLT-121 (design §6.1; R11, R12, decision P3) — con la empresa congelada, la wallet solo deja pagar a la
// plataforma (y anular un pago propio por confirmar). El permiso lo concede la action y lo lee la envoltura
// de la extension; aqui se mide QUE permiso esta vigente cuando el servicio escribe. Que la base rechace sin
// el lo prueba `tests/integration/db/bloqueo-por-mora.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const MOV_ID = "00000000-0000-4000-8000-000000000001";

const egreso = (tipoEgreso: string) => ({
  claveIdempotencia: randomUUID(),
  tipoEgreso,
  monto: "100.00",
  descripcion: "x",
  ...(tipoEgreso === "pago_plataforma" ? {} : { contraparteNombre: "Proveedor" }),
});

/** Un servicio que anota el permiso con el que lo llamaron y responde lo que se le pida. */
function servicioQueAnota(responder: () => Promise<unknown> = async () => ({ status: "ok" as const })) {
  const permisos: (string | null)[] = [];
  const service = {
    registrarEgreso: vi.fn(async () => {
      permisos.push(permisoEnMoraActual());
      return responder();
    }),
    reversarEgreso: vi.fn(),
    verDesgloseEgresos: vi.fn(),
  } as unknown as IWalletEgresoService;
  return { service, permisos };
}

describe("R11 — registrar un egreso: el permiso solo para el pago a la plataforma", () => {
  it("el pago a la plataforma corre con el permiso pago_plataforma", async () => {
    const { service, permisos } = servicioQueAnota();
    const r = await registrarEgresoAdministrativoAction(egreso("pago_plataforma"), { service, getActor: async () => MAESTRO });
    expect(r).toEqual({ status: "ok" });
    expect(permisos).toEqual(["pago_plataforma"]);
  });

  it.each(["gasto_variable", "sueldo"])("%s corre sin permiso (el trigger aplica)", async (tipo) => {
    const { service, permisos } = servicioQueAnota();
    await registrarEgresoAdministrativoAction(egreso(tipo), { service, getActor: async () => MAESTRO });
    expect(permisos).toEqual([null]);
  });

  it("el permiso no queda vigente al volver de la action", async () => {
    const { service } = servicioQueAnota();
    await registrarEgresoAdministrativoAction(egreso("pago_plataforma"), { service, getActor: async () => MAESTRO });
    expect(permisoEnMoraActual()).toBeNull();
  });

  it("una forma invalida no llega al servicio ni concede nada", async () => {
    const { service } = servicioQueAnota();
    const r = await registrarEgresoAdministrativoAction(
      { ...egreso("pago_plataforma"), monto: "-1" },
      { service, getActor: async () => MAESTRO },
    );
    expect(r).toMatchObject({ status: "validation_error" });
    expect(service.registrarEgreso).not.toHaveBeenCalled();
  });
});

describe("R12 — un gasto con la empresa congelada: forbidden, no un error sin traducir", () => {
  it("la base rechaza (EmpresaCongelada) y la action responde forbidden", async () => {
    const { service } = servicioQueAnota(async () => {
      throw new EmpresaCongelada();
    });
    const r = await registrarEgresoAdministrativoAction(egreso("gasto_variable"), { service, getActor: async () => MAESTRO });
    expect(r).toEqual({ status: "forbidden" });
  });
});

describe("decision P3 — anular un egreso: el permiso solo para el pago a la plataforma", () => {
  function anulacionQueAnota() {
    const permisos: (string | null)[] = [];
    const egresos: IEgresoCajaAnulacionService = {
      anular: vi.fn(async () => {
        permisos.push(permisoEnMoraActual());
        return { status: "ok" as const };
      }),
    };
    return { egresos, permisos };
  }

  it("anular un pago a la plataforma corre con el permiso pago_plataforma", async () => {
    const { egresos, permisos } = anulacionQueAnota();
    const categoriaDelEgreso = vi.fn(async () => "egreso_pago_plataforma");
    const r = await anularEgresoCajaAction(
      { movimientoId: MOV_ID, motivo: "me equivoque" },
      { egresos, categoriaDelEgreso, getActor: async () => MAESTRO },
    );
    expect(r).toEqual({ status: "ok" });
    expect(categoriaDelEgreso).toHaveBeenCalledWith(MOV_ID);
    expect(permisos).toEqual(["pago_plataforma"]);
  });

  it.each(["egreso_sueldo", "egreso_gasto_variable", null])("categoria %s corre sin permiso", async (categoria) => {
    const { egresos, permisos } = anulacionQueAnota();
    await anularEgresoCajaAction(
      { movimientoId: MOV_ID, motivo: "x" },
      { egresos, categoriaDelEgreso: async () => categoria, getActor: async () => MAESTRO },
    );
    expect(permisos).toEqual([null]);
  });

  it("la anulacion rechazada por la mora responde forbidden", async () => {
    const egresos: IEgresoCajaAnulacionService = {
      anular: vi.fn(async () => {
        throw new EmpresaCongelada();
      }),
    };
    const r = await anularEgresoCajaAction(
      { movimientoId: MOV_ID, motivo: "x" },
      { egresos, categoriaDelEgreso: async () => "egreso_sueldo", getActor: async () => MAESTRO },
    );
    expect(r).toEqual({ status: "forbidden" });
  });
});
