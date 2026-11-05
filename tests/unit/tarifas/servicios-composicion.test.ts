import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { TarifaValorService } from "@/lib/services/TarifaValorService";
import { GrupoDistritosService } from "@/lib/services/GrupoDistritosService";
import { TarifaActivacionService } from "@/lib/services/TarifaActivacionService";
import { TarifaActivacionRepository } from "@/lib/repositories/TarifaActivacionRepository";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import type { Actor } from "@/lib/interfaces/services/ITarifaValorService";

// SLT-52 T6.3 (design §8 y §9, R13) — la fabrica PASA cada dependencia, no solo la importa: cada
// service lleva el repositorio REAL (no `undefined`, no un doble), ese repositorio lleva EL cliente
// que se le dio, y una llamada al service llega hasta el cliente a traves de el.

const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };

function clienteDoble() {
  return {
    tarifaValor: { findMany: vi.fn().mockResolvedValue([]) },
    grupoDistritos: { findMany: vi.fn().mockResolvedValue([]) },
    tarifaActivacion: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    $transaction: vi.fn(),
  };
}

/** Lee la dependencia privada que la fabrica inyecto: es justo lo que se quiere comprobar. */
function dependencia(objeto: object, campo: string): unknown {
  return (objeto as Record<string, unknown>)[campo];
}

describe("T6.3 — serviciosDeTarifas compone con instancias reales", () => {
  it("TarifaValorService recibe un TarifaValorRepository real construido con el cliente dado", () => {
    const prisma = clienteDoble();
    const { tarifaValor } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    expect(tarifaValor).toBeInstanceOf(TarifaValorService);
    const repo = dependencia(tarifaValor, "repo");
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(TarifaValorRepository);
    expect(dependencia(repo as object, "prisma")).toBe(prisma);
  });

  it("GrupoDistritosService recibe un GrupoDistritosRepository real construido con el cliente dado", () => {
    const prisma = clienteDoble();
    const { grupoDistritos } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    expect(grupoDistritos).toBeInstanceOf(GrupoDistritosService);
    const repo = dependencia(grupoDistritos, "repo");
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(GrupoDistritosRepository);
    expect(dependencia(repo as object, "prisma")).toBe(prisma);
  });

  it("SLT-54 — TarifaActivacionService recibe su repositorio real con el cliente dado y una fuente de faltantes", () => {
    const prisma = clienteDoble();
    const { tarifaActivacion } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    expect(tarifaActivacion).toBeInstanceOf(TarifaActivacionService);
    const repo = dependencia(tarifaActivacion, "repo");
    expect(repo).toBeInstanceOf(TarifaActivacionRepository);
    expect(dependencia(repo as object, "prisma")).toBe(prisma);
    expect(dependencia(tarifaActivacion, "faltantes")).toBeDefined();
  });

  // T2.3 ata los faltantes reales y cambia ESTE caso. Mientras tanto, activar no puede escribir: con una
  // lista vacia, una empresa con faltantes se activaria sin la confirmacion de R6.
  it("SLT-54 T1.4 — sin los faltantes atados, activar lanza sin escribir, aun confirmando", async () => {
    const prisma = clienteDoble();
    const { tarifaActivacion } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    await expect(
      tarifaActivacion.activar({ confirmaFaltantes: true }, { usuarioId: "u-maestro", rol: "maestro" }),
    ).rejects.toThrow("T2.3");
    expect(prisma.tarifaActivacion.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tarifaActivacion.create).not.toHaveBeenCalled();
  });

  it("listar valores llega al cliente a traves del repositorio inyectado", async () => {
    const prisma = clienteDoble();
    const res = await serviciosDeTarifas(prisma as unknown as PrismaClient).tarifaValor.listarValores(
      { zonaId: "zona-1" },
      ADMIN,
    );
    expect(res).toEqual({ status: "ok", items: [] });
    expect(prisma.tarifaValor.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.tarifaValor.findMany.mock.calls[0][0].where).toEqual({ zonaId: "zona-1" });
  });

  it("listar grupos llega al cliente a traves del repositorio inyectado", async () => {
    const prisma = clienteDoble();
    const res = await serviciosDeTarifas(prisma as unknown as PrismaClient).grupoDistritos.listarGrupos(
      "zona-1",
      ADMIN,
    );
    expect(res).toEqual({ status: "ok", items: [] });
    expect(prisma.grupoDistritos.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.grupoDistritos.findMany.mock.calls[0][0].where).toEqual({ zonaId: "zona-1" });
  });
});
