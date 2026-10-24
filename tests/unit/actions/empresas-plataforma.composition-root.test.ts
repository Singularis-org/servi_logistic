import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import { contextoActual } from "@/lib/db/contexto-empresa";

// SL-32 T14b — EL COMPOSITION ROOT DEL LISTADO, EJERCITADO DE VERDAD (memoria «el composition root
// que no inyecta»). Que `lib/actions/_shared/empresas-plataforma.ts` importe el repositorio y
// `esPlataforma` no prueba que los PASE: aqui se llama sin servicio inyectado y se exige que la
// lectura llegue al cliente de `getPrismaClient`, dentro del contexto de plataforma de SL-32, y
// que la decida `esPlataforma` y no un predicado de test.

const contextos: unknown[] = [];
const findMany = vi.fn(async () => {
  contextos.push(contextoActual());
  return [
    {
      id: "org-1",
      nombre: "Empresa Ficticia",
      slug: "empresa-ficticia",
      createdAt: new Date("2026-10-23T10:00:00Z"),
      // SL-40 (R10): la excepción del cobro por orden sale de la base como Decimal y llega como texto.
      cobroPlataformaPorOrden: new Prisma.Decimal("300"),
      usuarios: [{ nombre: "Maestro Ficticio", email: "maestro@example.test" }],
    },
  ];
});

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ organizacion: { findMany } }),
  PRISMA_OMIT: {},
}));

const { listarEmpresasPlataforma } = await import("@/lib/actions/_shared/empresas-plataforma");

beforeEach(() => {
  findMany.mockClear();
  contextos.length = 0;
});

describe("SL-32 — listarEmpresasPlataforma cablea el repositorio real y esPlataforma (R29, R35)", () => {
  it("el superadmin recibe el listado, leido en plataforma con la ficha SL-32", async () => {
    const r = await listarEmpresasPlataforma({ rol: RolValue.superadmin });

    expect(r).toEqual({
      status: "ok",
      empresas: [
        {
          id: "org-1",
          nombre: "Empresa Ficticia",
          slug: "empresa-ficticia",
          creadaEn: new Date("2026-10-23T10:00:00Z"),
          maestros: [{ nombre: "Maestro Ficticio", email: "maestro@example.test" }],
          cobroPorOrden: "300.00",
        },
      ],
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(contextos).toEqual([
      { tipo: "plataforma", ficha: "SL-32", motivo: "listado de empresas del superadmin" },
    ]);
  });

  it.each(Object.values(RolValue).filter((rol) => rol !== RolValue.superadmin))(
    "el rol %s recibe forbidden y no se lee nada",
    async (rol) => {
      expect(await listarEmpresasPlataforma({ rol })).toEqual({ status: "forbidden" });
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it("sin actor, forbidden y no se lee nada", async () => {
    expect(await listarEmpresasPlataforma(null)).toEqual({ status: "forbidden" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
