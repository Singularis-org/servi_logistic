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

// SL-45 (R28): un cargo de 500 y un pago vigente de 200 → debe 300,00 y ha pagado 200,00.
const groupBy = vi.fn(async () => [{ organizacionId: "org-1", tipo: "cargo", _sum: { monto: new Prisma.Decimal("500") } }]);
const findManyLibro = vi.fn(async (args: { where: { categoria?: string } }) =>
  args.where.categoria === "egreso_pago_plataforma"
    ? [{ id: "pago-1", organizacionId: "org-1", monto: new Prisma.Decimal("200.00") }]
    : [],
);

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    organizacion: { findMany },
    cobroPlataformaMovimiento: { groupBy },
    walletMovimiento: { findMany: findManyLibro },
  }),
  PRISMA_OMIT: {},
}));

const { listarEmpresasPlataforma } = await import("@/lib/actions/_shared/empresas-plataforma");

beforeEach(() => {
  findMany.mockClear();
  groupBy.mockClear();
  findManyLibro.mockClear();
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
          deudaPlataforma: { deuda: "300.00", estado: "debe", importe: "300.00" },
          pagadoPlataforma: "200.00",
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
      expect(groupBy).not.toHaveBeenCalled();
      expect(findManyLibro).not.toHaveBeenCalled();
    },
  );

  it("sin actor, forbidden y no se lee nada", async () => {
    expect(await listarEmpresasPlataforma(null)).toEqual({ status: "forbidden" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
