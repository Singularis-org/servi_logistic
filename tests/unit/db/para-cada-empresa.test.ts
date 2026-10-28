import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";

// SL-17 / T1.5 (R16) — un job recurrente corre una vez por empresa, cada vez con su empresa en
// contexto; el fallo de una no frena a las demas; sin empresas no hace nada.

function clienteCon(ids: string[]) {
  const contextoAlListar: (ContextoDatos | undefined)[] = [];
  const cliente: ClienteDeOrganizaciones = {
    organizacion: {
      findMany: vi.fn(async () => {
        contextoAlListar.push(contextoActual());
        return ids.map((id) => ({ id }));
      }),
    },
  };
  return { cliente, contextoAlListar };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("paraCadaEmpresa (R16)", () => {
  it("N empresas → N ejecuciones, cada una con su empresa en contexto", async () => {
    const { cliente, contextoAlListar } = clienteCon(["a", "b", "c"]);
    const vistos: [string, ContextoDatos | undefined][] = [];

    const resumen = await paraCadaEmpresa(
      async (id) => {
        vistos.push([id, contextoActual()]);
      },
      { cliente },
    );

    expect(vistos).toEqual([
      ["a", { tipo: "empresa", organizacionId: "a" }],
      ["b", { tipo: "empresa", organizacionId: "b" }],
      ["c", { tipo: "empresa", organizacionId: "c" }],
    ]);
    expect(resumen).toEqual({ ok: ["a", "b", "c"], fallidas: [], saltadas: [] });
    // Listar es lo unico que corre como plataforma, y declarado con su ficha.
    expect(contextoAlListar).toEqual([{ tipo: "plataforma", ficha: "SL-17", motivo: expect.any(String) }]);
    // Y fuera de la funcion no queda ningun contexto pegado.
    expect(contextoActual()).toBeUndefined();
  });

  it("el fallo de una empresa no frena las demas y queda registrado con su id", async () => {
    const { cliente } = clienteCon(["a", "b", "c"]);
    const boom = new Error("boom");
    const corridas: string[] = [];

    const resumen = await paraCadaEmpresa(
      async (id) => {
        corridas.push(id);
        if (id === "b") throw boom;
      },
      { cliente },
    );

    expect(corridas).toEqual(["a", "b", "c"]);
    expect(resumen).toEqual({ ok: ["a", "c"], fallidas: [{ organizacionId: "b", error: boom }], saltadas: [] });
    expect(consola).toHaveBeenCalledWith(expect.stringContaining("b"), boom);
  });

  it("sin empresas: 0 ejecuciones y sin error", async () => {
    const { cliente } = clienteCon([]);
    const fn = vi.fn(async () => {});
    await expect(paraCadaEmpresa(fn, { cliente })).resolves.toEqual({ ok: [], fallidas: [], saltadas: [] });
    expect(fn).not.toHaveBeenCalled();
  });
});
