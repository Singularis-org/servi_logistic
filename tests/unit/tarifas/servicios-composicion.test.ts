import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { TarifaValorService } from "@/lib/services/TarifaValorService";
import { GrupoDistritosService } from "@/lib/services/GrupoDistritosService";
import { TarifaActivacionService } from "@/lib/services/TarifaActivacionService";
import { TarifasPantallaService } from "@/lib/services/TarifasPantallaService";
import { TarifaActivacionRepository } from "@/lib/repositories/TarifaActivacionRepository";
import { TarifasPantallaRepository } from "@/lib/repositories/TarifasPantallaRepository";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import type { Actor } from "@/lib/interfaces/services/ITarifaValorService";

// SLT-52 T6.3 (design §8 y §9, R13) — la fabrica PASA cada dependencia, no solo la importa: cada
// service lleva el repositorio REAL (no `undefined`, no un doble), ese repositorio lleva EL cliente
// que se le dio, y una llamada al service llega hasta el cliente a traves de el.

const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

function clienteDoble() {
  const cliente = {
    tarifaValor: { findMany: vi.fn().mockResolvedValue([]) },
    grupoDistritos: { findMany: vi.fn().mockResolvedValue([]) },
    tarifaActivacion: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "act", activadaAt: new Date("2026-11-04") }) },
    zona: { findMany: vi.fn().mockResolvedValue([{ id: "z1", nombre: "Norte", esCentral: false }]) },
    vehiculo: { findMany: vi.fn().mockResolvedValue([]) },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ nombre: "Ana", primerApellido: "Mora", rol: { value: "maestro" } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    historialAccion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(cliente)),
  };
  return cliente;
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

  it("SLT-54 T2.3 — TarifasPantallaService recibe su repositorio real con el cliente dado", () => {
    const prisma = clienteDoble();
    const { tarifasPantalla } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    expect(tarifasPantalla).toBeInstanceOf(TarifasPantallaService);
    const repo = dependencia(tarifasPantalla, "repo");
    expect(repo).toBeInstanceOf(TarifasPantallaRepository);
    expect(dependencia(repo as object, "prisma")).toBe(prisma);
  });

  it("SLT-54 T2.3 — TarifaActivacionService recibe su repositorio real y LA fuente de faltantes de la pantalla", () => {
    const prisma = clienteDoble();
    const { tarifaActivacion, tarifasPantalla } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    expect(tarifaActivacion).toBeInstanceOf(TarifaActivacionService);
    const repo = dependencia(tarifaActivacion, "repo");
    expect(repo).toBeInstanceOf(TarifaActivacionRepository);
    expect(dependencia(repo as object, "prisma")).toBe(prisma);
    expect(dependencia(tarifaActivacion, "faltantes")).toBe(tarifasPantalla);
  });

  // No basta con que la fabrica importe los faltantes: aqui se comprueba que alguien los PASA. Sale de la
  // fabrica, llega hasta el cliente, y la zona sin valores del doble es la que frena la activacion (R6).
  it("SLT-54 T2.3 — activar por la fabrica pide confirmacion con los faltantes que lee del cliente, sin escribir", async () => {
    const prisma = clienteDoble();
    const { tarifaActivacion } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    const res = await tarifaActivacion.activar({ confirmaFaltantes: false }, MAESTRO);

    expect(res).toEqual({
      status: "confirmacion_requerida",
      faltantes: [
        {
          zonaId: "z1",
          zonaNombre: "Norte",
          faltantes: [
            { concepto: "tienda_flete_entregado" },
            { concepto: "tienda_flete_rechazo" },
            { concepto: "mensajero_entregado" },
          ],
          usaZona: [],
        },
      ],
    });
    expect(prisma.zona.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.tarifaValor.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tarifaActivacion.create).not.toHaveBeenCalled();
  });

  it("SLT-54 T2.3 — activar por la fabrica, confirmando, ya no falla: escribe con el total que leyo", async () => {
    const prisma = clienteDoble();
    const { tarifaActivacion } = serviciosDeTarifas(prisma as unknown as PrismaClient);

    const res = await tarifaActivacion.activar({ confirmaFaltantes: true }, MAESTRO);

    expect(res.status).toBe("ok");
    expect(prisma.tarifaActivacion.create).toHaveBeenCalledTimes(1);
    expect(prisma.historialAccion.createMany.mock.calls[0][0].data[0]).toMatchObject({
      accion: "tarifas_activadas",
      valorNuevo: "faltantes: 3",
    });
  });

  it("SLT-55 T3.1 — la pantalla por la fabrica lee mensajeros y valores propios del cliente dado", async () => {
    const prisma = clienteDoble();
    const res = await serviciosDeTarifas(prisma as unknown as PrismaClient).tarifasPantalla.cargarPantalla(ADMIN);

    expect(res).toMatchObject({ status: "ok", mensajeros: [], valoresMensajero: [] });
    const lecturasDeValores = prisma.tarifaValor.findMany.mock.calls.map(([args]) => args.where);
    expect(lecturasDeValores).toContainEqual({ mensajeroId: { not: null } });
    const lecturasDeUsuarios = prisma.usuario.findMany.mock.calls.map(([args]) => args.where);
    expect(lecturasDeUsuarios).toContainEqual({
      OR: [{ rol: { value: "mensajero" } }, { tarifaValoresComoMensajero: { some: {} } }],
    });
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
