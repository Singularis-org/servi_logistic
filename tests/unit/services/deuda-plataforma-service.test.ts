import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type { ICobroPlataformaMovimientoRepository } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { DeudaPlataformaService } from "@/lib/services/DeudaPlataformaService";

// SL-40 (design §11.3, R25) — la deuda la ven los de acceso total, y a cualquier otro se le rechaza
// antes de tocar el repositorio.

function repoDoble() {
  const sumasPorTipo = vi.fn<ICobroPlataformaMovimientoRepository["sumasPorTipo"]>(async () => [
    { tipo: "cargo", monto: "2100.00" },
    { tipo: "reverso", monto: "500.00" },
  ]);
  return { repo: { sumasPorTipo } satisfies ICobroPlataformaMovimientoRepository, sumasPorTipo };
}

const actor = (rol: RolValue, organizacionId: string | null = "org-a"): Actor => ({
  usuarioId: "u-1",
  rol,
  organizacionId,
});

const ACCESO_TOTAL: RolValue[] = [RolValue.maestro, RolValue.admin];
const SIN_ACCESO_TOTAL = Object.values(RolValue).filter((r) => !ACCESO_TOTAL.includes(r));

describe("SL-40 — DeudaPlataformaService.verDeuda (R25)", () => {
  it.each(ACCESO_TOTAL)("el rol %s ve la deuda de su empresa, derivada de las sumas", async (rol) => {
    const { repo, sumasPorTipo } = repoDoble();
    const r = await new DeudaPlataformaService(repo).verDeuda(actor(rol));
    expect(r).toEqual({ status: "ok", deudaPlataforma: { deuda: "1600.00" } });
    expect(sumasPorTipo).toHaveBeenCalledTimes(1);
    expect(sumasPorTipo).toHaveBeenCalledWith("org-a");
  });

  it("hay roles sin acceso total que comprobar", () => {
    expect(SIN_ACCESO_TOTAL.length).toBeGreaterThan(0);
  });

  it.each(SIN_ACCESO_TOTAL)("el rol %s recibe forbidden sin consultar el repositorio", async (rol) => {
    const { repo, sumasPorTipo } = repoDoble();
    expect(await new DeudaPlataformaService(repo).verDeuda(actor(rol))).toEqual({ status: "forbidden" });
    expect(sumasPorTipo).not.toHaveBeenCalled();
  });

  it("sin actor, forbidden sin consultar el repositorio", async () => {
    const { repo, sumasPorTipo } = repoDoble();
    expect(await new DeudaPlataformaService(repo).verDeuda(null)).toEqual({ status: "forbidden" });
    expect(sumasPorTipo).not.toHaveBeenCalled();
  });

  it("un actor de acceso total sin empresa recibe forbidden y no se lee sin filtro", async () => {
    const { repo, sumasPorTipo } = repoDoble();
    expect(await new DeudaPlataformaService(repo).verDeuda(actor(RolValue.maestro, null))).toEqual({
      status: "forbidden",
    });
    expect(sumasPorTipo).not.toHaveBeenCalled();
  });
});
