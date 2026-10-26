import type { ModuloApagable } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ForbiddenError } from "@/lib/errors/app-error";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SL-23 · T5 (design §5.1; R9, R16, R17, R33) — las puertas de lectura. El repositorio se sustituye
// por uno en memoria cuya lista cambia entre llamadas: así se ve que la puerta pregunta a la fuente
// cada vez (sin memo entre peticiones, R9) y que el superadmin no la consulta.

const estado = vi.hoisted(() => ({ activos: [] as string[], consultas: 0 }));

vi.mock("@/lib/repositories/ModulosActivosRepository", () => ({
  ModulosActivosRepository: class {
    async activos() {
      estado.consultas++;
      return [...estado.activos];
    }
  },
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));

class NotFoundSenal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundSenal();
  },
}));

const { exigirModuloActivo, exigirModuloEnRuta, moduloActivo, modulosDelMenu } = await import(
  "@/lib/modulos/exigir-modulo"
);
const { ModuloInactivoError } = await import("@/lib/modulos/modulo-inactivo-error");

function encender(...ms: ModuloApagable[]): void {
  estado.activos = ms;
}

async function errorDe(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("se esperaba que la puerta rechazara");
}

const maestro: Actor = { usuarioId: "u-1", rol: "maestro" };
const superadmin: Actor = { usuarioId: "u-2", rol: "superadmin" };

beforeEach(() => {
  estado.activos = [];
  estado.consultas = 0;
});

describe("SL-23 · exigirModuloActivo (R17, R33)", () => {
  it("R17 — apagado: lanza ModuloInactivoError, un 403 con details.codigo = modulo_inactivo", async () => {
    encender("wallet");
    const e = await errorDe(exigirModuloActivo("ranking"));
    expect(e).toBeInstanceOf(ModuloInactivoError);
    expect(e).toBeInstanceOf(ForbiddenError);
    const err = e as AppError;
    expect(err.code).toBe("FORBIDDEN");
    expect(err.details).toEqual({ codigo: "modulo_inactivo", modulo: "ranking" });
    expect(err.message).toBe("El módulo Ranking no está activo para esta empresa.");
    expect(err.toShape()).toEqual({
      status: "error",
      code: "FORBIDDEN",
      message: "El módulo Ranking no está activo para esta empresa.",
      details: { codigo: "modulo_inactivo", modulo: "ranking" },
    });
  });

  it("R17 — encendido: pasa sin lanzar", async () => {
    encender("ranking");
    await expect(exigirModuloActivo("ranking")).resolves.toBeUndefined();
    await expect(moduloActivo("ranking")).resolves.toBe(true);
    await expect(moduloActivo("wallet")).resolves.toBe(false);
  });

  it("R17 — sin ninguna fila (empresa nueva): todo módulo está apagado", async () => {
    const e = await errorDe(exigirModuloActivo("analitica"));
    expect((e as AppError).details).toMatchObject({ modulo: "analitica" });
  });

  describe("R33 — dos claves (pieza compartida)", () => {
    it("las dos encendidas: pasa", async () => {
      encender("wallet", "ranking");
      await expect(exigirModuloActivo("wallet", "ranking")).resolves.toBeUndefined();
    });

    it("falta la segunda: apagada, y details.modulo nombra la apagada", async () => {
      encender("wallet");
      const e = await errorDe(exigirModuloActivo("wallet", "ranking"));
      expect((e as AppError).details).toEqual({ codigo: "modulo_inactivo", modulo: "ranking" });
    });

    it("falta la primera: apagada, y details.modulo nombra la apagada", async () => {
      encender("ranking");
      const e = await errorDe(exigirModuloActivo("wallet", "ranking"));
      expect((e as AppError).details).toEqual({ codigo: "modulo_inactivo", modulo: "wallet" });
    });

    it("faltan las dos: nombra la primera en el orden pedido", async () => {
      const e = await errorDe(exigirModuloActivo("api_integraciones", "analitica"));
      expect((e as AppError).details).toMatchObject({ modulo: "api_integraciones" });
    });
  });
});

describe("SL-23 · exigirModuloEnRuta (R16, R33)", () => {
  it("R16 — apagado: notFound(), la misma pantalla que un rol sin acceso", async () => {
    encender("wallet");
    await expect(exigirModuloEnRuta("ranking")).rejects.toBeInstanceOf(NotFoundSenal);
  });

  it("R16 — encendido: pasa", async () => {
    encender("ranking");
    await expect(exigirModuloEnRuta("ranking")).resolves.toBeUndefined();
  });

  it("R33 — dos claves: notFound() si falta cualquiera; pasa con las dos", async () => {
    encender("wallet");
    await expect(exigirModuloEnRuta("wallet", "ranking")).rejects.toBeInstanceOf(NotFoundSenal);
    encender("ranking");
    await expect(exigirModuloEnRuta("wallet", "ranking")).rejects.toBeInstanceOf(NotFoundSenal);
    encender("wallet", "ranking");
    await expect(exigirModuloEnRuta("wallet", "ranking")).resolves.toBeUndefined();
  });
});

describe("SL-23 · modulosDelMenu", () => {
  it("superadmin: conjunto vacío sin consultar la base", async () => {
    encender("wallet", "ranking");
    expect([...(await modulosDelMenu(superadmin))]).toEqual([]);
    expect(estado.consultas).toBe(0);
  });

  it("sin sesión: conjunto vacío sin consultar la base", async () => {
    encender("wallet");
    expect([...(await modulosDelMenu(null))]).toEqual([]);
    expect(estado.consultas).toBe(0);
  });

  it("un rol de empresa: los módulos encendidos de su empresa", async () => {
    encender("wallet", "ranking");
    expect([...(await modulosDelMenu(maestro))].sort()).toEqual(["ranking", "wallet"]);
    expect(estado.consultas).toBe(1);
  });
});

describe("SL-23 · sin memo entre peticiones (R9)", () => {
  it("apagar entre dos peticiones se ve en la segunda, sin esperar a ninguna caché", async () => {
    encender("ranking");
    await expect(exigirModuloActivo("ranking")).resolves.toBeUndefined();
    encender();
    await expect(exigirModuloActivo("ranking")).rejects.toBeInstanceOf(ModuloInactivoError);
    await expect(exigirModuloEnRuta("ranking")).rejects.toBeInstanceOf(NotFoundSenal);
    encender("ranking");
    await expect(exigirModuloActivo("ranking")).resolves.toBeUndefined();
    expect(estado.consultas).toBe(4);
  });
});
