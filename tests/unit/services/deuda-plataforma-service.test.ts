import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type { ICobroPlataformaMovimientoRepository } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { IPagoPlataformaRepository } from "@/lib/interfaces/repositories/IPagoPlataformaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { DeudaPlataformaService } from "@/lib/services/DeudaPlataformaService";

// SL-40 (design §11.3, R25) — la deuda la ven los de acceso total, y a cualquier otro se le rechaza
// antes de tocar el repositorio. SL-45 (design §12.3, R13, R14): la deuda resta los pagos vigentes,
// y el estado y el importe salen del servidor. SLT-60 (design §4.7, R7): resta solo los pagos
// CONFIRMADOS (`sumaPagosConfirmados`); los vigentes por confirmar no bajan la deuda.

function repoDoble(pagosConfirmados = "0.00") {
  const sumasPorTipo = vi.fn<ICobroPlataformaMovimientoRepository["sumasPorTipo"]>(async () => [
    { tipo: "cargo", monto: "2100.00" },
    { tipo: "reverso", monto: "500.00" },
  ]);
  const sumaPagosConfirmados = vi.fn<IPagoPlataformaRepository["sumaPagosConfirmados"]>(async () => pagosConfirmados);
  // SLT-60 (R7): si el servicio leyera los pagos vigentes (por confirmar incluidos), daría otra cifra.
  const sumaPagosVigentes = vi.fn<IPagoPlataformaRepository["sumaPagosVigentes"]>(async () => "9999.00");
  const disponibleParaRegistrar = vi.fn<IPagoPlataformaRepository["disponibleParaRegistrar"]>(async () => "0.00");
  const bloquear = vi.fn<IPagoPlataformaRepository["bloquear"]>(async () => undefined);
  const claveYaRegistrada = vi.fn<IPagoPlataformaRepository["claveYaRegistrada"]>(async () => false);
  return {
    repo: { sumasPorTipo } satisfies ICobroPlataformaMovimientoRepository,
    pagos: {
      sumaPagosConfirmados,
      sumaPagosVigentes,
      disponibleParaRegistrar,
      bloquear,
      claveYaRegistrada,
    } satisfies IPagoPlataformaRepository,
    sumasPorTipo,
    sumaPagosConfirmados,
    sumaPagosVigentes,
  };
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
    const { repo, pagos, sumasPorTipo, sumaPagosConfirmados, sumaPagosVigentes } = repoDoble();
    const r = await new DeudaPlataformaService(repo, pagos).verDeuda(actor(rol));
    expect(r).toEqual({ status: "ok", deudaPlataforma: { deuda: "1600.00", estado: "debe", importe: "1600.00" } });
    expect(sumasPorTipo).toHaveBeenCalledTimes(1);
    expect(sumasPorTipo).toHaveBeenCalledWith("org-a");
    expect(sumaPagosConfirmados).toHaveBeenCalledWith("org-a");
    expect(sumaPagosVigentes).not.toHaveBeenCalled();
  });

  it("hay roles sin acceso total que comprobar", () => {
    expect(SIN_ACCESO_TOTAL.length).toBeGreaterThan(0);
  });

  it.each(SIN_ACCESO_TOTAL)("el rol %s recibe forbidden sin consultar ningún repositorio", async (rol) => {
    const { repo, pagos, sumasPorTipo, sumaPagosConfirmados } = repoDoble();
    expect(await new DeudaPlataformaService(repo, pagos).verDeuda(actor(rol))).toEqual({ status: "forbidden" });
    expect(sumasPorTipo).not.toHaveBeenCalled();
    expect(sumaPagosConfirmados).not.toHaveBeenCalled();
  });

  it("sin actor, forbidden sin consultar ningún repositorio", async () => {
    const { repo, pagos, sumasPorTipo, sumaPagosConfirmados } = repoDoble();
    expect(await new DeudaPlataformaService(repo, pagos).verDeuda(null)).toEqual({ status: "forbidden" });
    expect(sumasPorTipo).not.toHaveBeenCalled();
    expect(sumaPagosConfirmados).not.toHaveBeenCalled();
  });

  it("un actor de acceso total sin empresa recibe forbidden y no se lee sin filtro", async () => {
    const { repo, pagos, sumasPorTipo, sumaPagosConfirmados } = repoDoble();
    expect(await new DeudaPlataformaService(repo, pagos).verDeuda(actor(RolValue.maestro, null))).toEqual({
      status: "forbidden",
    });
    expect(sumasPorTipo).not.toHaveBeenCalled();
    expect(sumaPagosConfirmados).not.toHaveBeenCalled();
  });
});

describe("SL-45 / SLT-60 — la deuda con los pagos confirmados (SL-45 R13, R14; SLT-60 R7)", () => {
  it("1.600 de cargos netos y 1.000 confirmados → debe 600,00", async () => {
    const { repo, pagos } = repoDoble("1000.00");
    expect(await new DeudaPlataformaService(repo, pagos).verDeuda(actor(RolValue.maestro))).toEqual({
      status: "ok",
      deudaPlataforma: { deuda: "600.00", estado: "debe", importe: "600.00" },
    });
  });

  it("confirmado todo → al día", async () => {
    const { repo, pagos } = repoDoble("1600.00");
    expect(await new DeudaPlataformaService(repo, pagos).verDeuda(actor(RolValue.admin))).toEqual({
      status: "ok",
      deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    });
  });

  it("confirmado más de lo que hoy se debe (por reversos) → a favor, con el importe en positivo", async () => {
    const { repo, pagos } = repoDoble("2100.00");
    expect(await new DeudaPlataformaService(repo, pagos).verDeuda(actor(RolValue.maestro))).toEqual({
      status: "ok",
      deudaPlataforma: { deuda: "-500.00", estado: "a_favor", importe: "500.00" },
    });
  });
});
