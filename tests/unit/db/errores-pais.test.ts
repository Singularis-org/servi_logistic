import { describe, expect, it } from "vitest";

import { GeografiaDeOtroPais, PaisInmutable, traducirErrorDePais } from "@/lib/db/errores-pais";

// SL-20 (T1.4; design §2.5) — `traducirErrorDePais` con las formas en que llega un SQLSTATE propio.
// Las formas REALES de Prisma 7 + adapter-pg las ejercen `geografia-por-pais.test.ts` (SL021) y
// `organizacion-pais-inmutable.test.ts` (SL020) contra Postgres; aquí, lo que no se traduce.

describe("traducirErrorDePais", () => {
  it("SL020 del driver se traduce a PaisInmutable con el original en cause", () => {
    const original = { code: "SL020", message: "el país de una empresa no cambia" };
    const traducido = traducirErrorDePais(original);
    expect(traducido).toBeInstanceOf(PaisInmutable);
    expect((traducido as Error).cause).toBe(original);
  });

  it("SL021 dentro de un P2010 de SQL a mano se traduce a GeografiaDeOtroPais", () => {
    const original = { code: "P2010", message: "Raw query failed. Code: `SL021`. Message: geografía de otro país" };
    expect(traducirErrorDePais(original)).toBeInstanceOf(GeografiaDeOtroPais);
  });

  it("SL021 anidado en meta.driverAdapterError.cause se traduce", () => {
    const original = { meta: { driverAdapterError: { cause: { kind: "postgres", originalCode: "SL021" } } } };
    expect(traducirErrorDePais(original)).toBeInstanceOf(GeografiaDeOtroPais);
  });

  it("cualquier otro error se devuelve tal cual, también el SL017 de empresa cruzada", () => {
    const otro = new Error("otra cosa");
    const deEmpresa = { code: "SL017" };
    expect(traducirErrorDePais(otro)).toBe(otro);
    expect(traducirErrorDePais(deEmpresa)).toBe(deEmpresa);
    expect(traducirErrorDePais(null)).toBeNull();
  });

  it("un error ya traducido no se vuelve a envolver", () => {
    const ya = new PaisInmutable();
    expect(traducirErrorDePais(ya)).toBe(ya);
  });
});
