import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { PremioRankingRepository } from "@/lib/repositories/PremioRankingRepository";
import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";

// Feature 76 (R8/R9/R10) — repo de PREMIOS con Prisma mockeado (sin DB). Money-safe: Decimal
// -> STRING escala 2; null se preserva (sin premio). descripcion (cambio de alcance) es texto
// libre independiente del monto.

describe("PremioRankingRepository.listar (R8/R9/R12)", () => {
  it("lista las 3 posiciones ordenadas asc; Decimal->STRING y null preservado", async () => {
    const findMany = vi.fn(async () => [
      { posicion: 1, monto: new Prisma.Decimal("15000.00"), descripcion: "Bono oro" },
      { posicion: 2, monto: new Prisma.Decimal("5000"), descripcion: null },
      { posicion: 3, monto: null, descripcion: null }, // R9: sin premio, no cero
    ]);
    const repo = new PremioRankingRepository({ premioRanking: { findMany } } as unknown as PrismaClient);

    const rows = await repo.listar();

    expect(rows).toEqual([
      { posicion: 1, monto: "15000.00", descripcion: "Bono oro" },
      { posicion: 2, monto: "5000.00", descripcion: null },
      { posicion: 3, monto: null, descripcion: null }, // R9: null != "0.00"
    ]);
    expect((findMany.mock.calls[0] as unknown[])[0]).toEqual({ orderBy: { posicion: "asc" } });
  });
});

describe("PremioRankingRepository.upsertPremio (R10)", () => {
  it("STRING -> Decimal en monto y persiste la descripcion", async () => {
    const update = vi.fn(async () => ({
      posicion: 1,
      monto: new Prisma.Decimal("15000.00"),
      descripcion: "Bono oro",
    }));
    const repo = new PremioRankingRepository({ premioRanking: { update } } as unknown as PrismaClient);

    const dto = await conEmpresa("org-a", () => repo.upsertPremio(1, { monto: "15000", descripcion: "Bono oro" }));

    const arg = (update.mock.calls[0] as unknown[])[0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    // SL-17 T3.9: el unico es (organizacion_id, posicion); la empresa sale del contexto.
    expect(arg.where).toEqual({ organizacionId_posicion: { organizacionId: "org-a", posicion: 1 } });
    expect(arg.data.monto).toBeInstanceOf(Prisma.Decimal);
    expect((arg.data.monto as Prisma.Decimal).toString()).toBe("15000");
    expect(arg.data.descripcion).toBe("Bono oro");
    expect(dto).toEqual({ posicion: 1, monto: "15000.00", descripcion: "Bono oro" });
  });

  it("monto null -> persiste null (sin premio, R9), descripcion null tambien", async () => {
    const update = vi.fn(async () => ({ posicion: 2, monto: null, descripcion: null }));
    const repo = new PremioRankingRepository({ premioRanking: { update } } as unknown as PrismaClient);

    const dto = await conEmpresa("org-a", () => repo.upsertPremio(2, { monto: null, descripcion: null }));

    const arg = (update.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> };
    expect(arg.data.monto).toBeNull();
    expect(arg.data.descripcion).toBeNull();
    expect(dto).toEqual({ posicion: 2, monto: null, descripcion: null });
  });

  it("SL-17 T3.9: sin empresa en contexto no toca ningun podio (EmpresaNoResuelta)", async () => {
    const update = vi.fn();
    const repo = new PremioRankingRepository({ premioRanking: { update } } as unknown as PrismaClient);

    await expect(repo.upsertPremio(1, { monto: "1", descripcion: null })).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(
      comoPlataforma("SL-17", "test", () => repo.upsertPremio(1, { monto: "1", descripcion: null })),
    ).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(update).not.toHaveBeenCalled();
  });
});
