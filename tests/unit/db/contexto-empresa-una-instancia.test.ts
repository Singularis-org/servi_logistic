import { describe, expect, it, vi } from "vitest";

// Reproduce lo que hace `next dev`: el middleware y la app cargan dos copias de
// `contexto-empresa.ts` en el mismo proceso, y la extension del cliente singleton lee el contexto
// de UNA de ellas. Si cada copia tuviera su propio `AsyncLocalStorage`, el `comoPlataforma` de la
// otra no se veria y la operacion caeria en `EmpresaNoResuelta` (bug evidenciado en SL-32 T9).

type Modulo = typeof import("@/lib/db/contexto-empresa");

async function dosCopias(): Promise<[Modulo, Modulo]> {
  vi.resetModules();
  const a: Modulo = await import("@/lib/db/contexto-empresa");
  vi.resetModules();
  const b: Modulo = await import("@/lib/db/contexto-empresa");
  return [a, b];
}

describe("contexto-empresa: un solo almacen por proceso", () => {
  it("las dos copias son modulos distintos (si no, el test no prueba nada)", async () => {
    const [a, b] = await dosCopias();
    expect(a).not.toBe(b);
    expect(a.contextoActual).not.toBe(b.contextoActual);
  });

  it("comoPlataforma de una copia lo ve contextoActual de la otra", async () => {
    const [a, b] = await dosCopias();
    const visto = await a.comoPlataforma("SL-32", "prueba de dos copias", async () => b.contextoActual());
    expect(visto).toEqual({ tipo: "plataforma", ficha: "SL-32", motivo: "prueba de dos copias" });
  });

  it("conEmpresa de una copia lo ve contextoActual de la otra", async () => {
    const [a, b] = await dosCopias();
    const visto = await b.conEmpresa("org-1", async () => a.contextoActual());
    expect(visto).toEqual({ tipo: "empresa", organizacionId: "org-1" });
  });

  it("dentroDeTransaccionDeEmpresa de una copia lo ve la otra", async () => {
    const [a, b] = await dosCopias();
    const visto = await a.dentroDeTransaccionDeEmpresa("org-2", async () => b.contextoActual());
    expect(visto).toEqual({ tipo: "empresa", organizacionId: "org-2", enTransaccion: true });
  });

  it("fuera de todo contexto, ninguna copia ve nada", async () => {
    const [a, b] = await dosCopias();
    expect(a.contextoActual()).toBeUndefined();
    expect(b.contextoActual()).toBeUndefined();
  });
});
