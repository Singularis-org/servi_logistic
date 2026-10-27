import { afterEach, describe, expect, it, vi } from "vitest";

import { contextoActual } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa } from "@/lib/db/para-cada-empresa";

// SL-23 · T11 (design §5.4; R21) — `paraCadaEmpresa({ modulo })`: corre solo en las empresas con el
// módulo encendido, en su contexto, y devuelve las demás en `saltadas`, con una línea de log de ids.
// Sin `modulo`, como antes: todas, `saltadas` vacío y un solo listado.

const MODULOS: Record<string, string[]> = {
  "org-1": ["wallet", "ranking"],
  "org-2": ["ranking"],
  "org-3": ["wallet"],
};

function cliente() {
  const listados: unknown[] = [];
  return {
    listados,
    organizacion: {
      findMany: async (args: { where?: { modulos: { some: { modulo: string } } } }) => {
        listados.push(args.where ?? null);
        const ids = Object.keys(MODULOS);
        const modulo = args.where?.modulos.some.modulo;
        return (modulo ? ids.filter((id) => MODULOS[id].includes(modulo)) : ids).map((id) => ({ id }));
      },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("SL-23 · paraCadaEmpresa con módulo (R21)", () => {
  it("corre solo en las empresas con el módulo, cada una en su contexto, y nombra las saltadas", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const c = cliente();
    const vistas: string[] = [];
    const r = await paraCadaEmpresa(
      async (id) => {
        const ctx = contextoActual();
        vistas.push(`${id}:${ctx?.tipo === "empresa" ? ctx.organizacionId : "?"}`);
      },
      { cliente: c, modulo: "wallet" },
    );
    expect(vistas).toEqual(["org-1:org-1", "org-3:org-3"]);
    expect(r).toEqual({ ok: ["org-1", "org-3"], fallidas: [], saltadas: ["org-2"] });
    expect(c.listados).toEqual([null, { modulos: { some: { modulo: "wallet" } } }]);
    expect(info).toHaveBeenCalledWith("[paraCadaEmpresa] módulo wallet apagado, se saltan: org-2");
  });

  it("sin módulo, como antes: todas, saltadas vacío y un solo listado sin filtro", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const c = cliente();
    const r = await paraCadaEmpresa(async () => {}, { cliente: c });
    expect(r).toEqual({ ok: ["org-1", "org-2", "org-3"], fallidas: [], saltadas: [] });
    expect(c.listados).toEqual([null]);
    expect(info).not.toHaveBeenCalled();
  });

  it("un fallo en una empresa no frena a las demás y no la cuenta como saltada", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await paraCadaEmpresa(
      async (id) => {
        if (id === "org-1") throw new Error("datos raros");
      },
      { cliente: cliente(), modulo: "ranking" },
    );
    expect(r.ok).toEqual(["org-2"]);
    expect(r.fallidas.map((f) => f.organizacionId)).toEqual(["org-1"]);
    expect(r.saltadas).toEqual(["org-3"]);
  });
});
