import { describe, expect, it, vi } from "vitest";

import { verFacturasDeEmpresa, verFacturasDeMiPlan } from "@/lib/actions/_shared/facturas-plataforma";
import * as acciones from "@/lib/actions/facturas-plataforma";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import type { IFacturaPlataformaService } from "@/lib/interfaces/services/IFacturaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { FacturaPlataformaService } from "@/lib/services/FacturaPlataformaService";

// SLT-119 · T3.2 (design §5; R13) — el borde de las facturas. Lo que se mide: el actor que llega al servicio es
// el de la sesión (`getActor`), nunca uno del cliente; la empresa del superadmin es la LIGADA en el servidor
// (primer argumento), no la que traiga el `input`; y sin el rol que toca, nada llega a la base (el servicio real
// con un repositorio que lanza si se le llama). Las reglas en sí las mide `factura-plataforma-service.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const SUPERADMIN: Actor = { usuarioId: "u-super", rol: "superadmin" };

const LIGADA = "0b7c6a2e-5d1f-4e3a-9c8b-1a2b3c4d5e6f";
const OTRA = "1c8d7b3f-6e2a-4f4b-8d9c-2b3c4d5e6f70";
const FACTURA = "6f5e4d3c-2b1a-4c9d-8e7f-a1b2c3d4e5f6";

function servicioEspia(): IFacturaPlataformaService & { [K in keyof IFacturaPlataformaService]: ReturnType<typeof vi.fn> } {
  return {
    deMiEmpresa: vi.fn(async () => ({ estado: "ok" as const, facturas: [] })),
    detalleDeMiEmpresa: vi.fn(async () => ({ estado: "not_found" as const })),
    deEmpresa: vi.fn(async () => ({ estado: "ok" as const, facturas: [] })),
    detalleDeEmpresa: vi.fn(async () => ({ estado: "not_found" as const })),
  };
}

/** El servicio real sobre un repositorio que lanza en cualquier llamada: un `forbidden` no lee la base. */
function servicioSinBase(): IFacturaPlataformaService {
  const lanza = () => {
    throw new Error("la base no debía leerse");
  };
  const repo: IFacturaPlataformaRepository = {
    empresasACerrar: lanza,
    cerrar: lanza,
    deLaEmpresa: lanza,
    deEmpresaParaPlataforma: lanza,
    detalleDeLaEmpresa: lanza,
    detalleParaPlataforma: lanza,
  };
  return new FacturaPlataformaService(repo);
}

const sesion = (actor: Actor | null) => async () => actor;

describe("SLT-119 — el borde de las facturas de la plataforma (R13)", () => {
  it("R16: solo dos actions, las dos de lectura del detalle", () => {
    expect(Object.keys(acciones).sort()).toEqual(["verDetalleFacturaEmpresaAction", "verDetalleFacturaMiPlanAction"]);
  });

  it("R13: el detalle del maestro pasa el actor de la sesión y la entrada tal cual; ninguna empresa del cliente", async () => {
    const service = servicioEspia();
    const input = { facturaId: FACTURA, pagina: 2, organizacionId: OTRA };
    await acciones.verDetalleFacturaMiPlanAction(input, { service, getActor: sesion(MAESTRO) });
    expect(service.detalleDeMiEmpresa).toHaveBeenCalledWith(MAESTRO, input);
    // La vía del maestro no recibe empresa: el servicio lee la de la sesión (`detalleDeLaEmpresa`).
    expect(service.detalleDeEmpresa).not.toHaveBeenCalled();
  });

  it("R13: el detalle del superadmin usa la empresa ligada en el servidor, aunque el cliente mande otra", async () => {
    const service = servicioEspia();
    await acciones.verDetalleFacturaEmpresaAction(LIGADA, { facturaId: FACTURA, pagina: 3, organizacionId: OTRA }, {
      service,
      getActor: sesion(SUPERADMIN),
    });
    expect(service.detalleDeEmpresa).toHaveBeenCalledWith(SUPERADMIN, { facturaId: FACTURA, pagina: 3, organizacionId: LIGADA });
  });

  it("R13: con una entrada que no es objeto, el superadmin sigue pidiendo la empresa ligada (el servicio valida)", async () => {
    const service = servicioEspia();
    await acciones.verDetalleFacturaEmpresaAction(LIGADA, "basura", { service, getActor: sesion(SUPERADMIN) });
    expect(service.detalleDeEmpresa).toHaveBeenCalledWith(SUPERADMIN, { organizacionId: LIGADA });
  });

  it.each([
    ["sin sesión", null],
    ["el admin", ADMIN],
    ["el superadmin", SUPERADMIN],
  ])("R13: %s pide el detalle por la vía del maestro → forbidden sin leer la base", async (_, actor) => {
    await expect(
      acciones.verDetalleFacturaMiPlanAction({ facturaId: FACTURA }, { service: servicioSinBase(), getActor: sesion(actor) }),
    ).resolves.toEqual({ estado: "forbidden" });
  });

  it.each([
    ["sin sesión", null],
    ["el maestro", MAESTRO],
    ["el admin", ADMIN],
  ])("R13: %s pide el detalle de una empresa por su id → forbidden sin leer la base", async (_, actor) => {
    await expect(
      acciones.verDetalleFacturaEmpresaAction(LIGADA, { facturaId: FACTURA }, { service: servicioSinBase(), getActor: sesion(actor) }),
    ).resolves.toEqual({ estado: "forbidden" });
  });

  it("R13: las listas de las páginas pasan el actor que les dan y, la del superadmin, la empresa de la URL", async () => {
    const service = servicioEspia();
    await verFacturasDeMiPlan(MAESTRO, service);
    await verFacturasDeEmpresa(SUPERADMIN, { organizacionId: LIGADA }, service);
    expect(service.deMiEmpresa).toHaveBeenCalledWith(MAESTRO);
    expect(service.deEmpresa).toHaveBeenCalledWith(SUPERADMIN, { organizacionId: LIGADA });
  });

  it("R13: las listas sin el rol que toca → forbidden sin leer la base", async () => {
    await expect(verFacturasDeMiPlan(ADMIN, servicioSinBase())).resolves.toEqual({ estado: "forbidden" });
    await expect(verFacturasDeMiPlan(null, servicioSinBase())).resolves.toEqual({ estado: "forbidden" });
    await expect(verFacturasDeEmpresa(MAESTRO, { organizacionId: LIGADA }, servicioSinBase())).resolves.toEqual({
      estado: "forbidden",
    });
  });
});
