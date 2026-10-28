import { describe, expect, it } from "vitest";

import { ordenarPorFk, type Paso } from "@/scripts/demo-qa/borrar";

// SL-43 (medición del build, 2026-10-26) — el orden de la pasada única del borrado: cada tabla antes
// que aquellas a las que apunta. Lo que no se puede ordenar (un ciclo) va al final, y entonces la
// pasada falla y el borrado sigue por pasadas con SAVEPOINT (R8, en `demo-qa-borrado.test.ts`).

const paso = (tabla: string, columna = "organizacion_id"): Paso => ({ tabla, columna, ids: "empresas" });

describe("ordenarPorFk", () => {
  it("las hijas van antes que sus madres, aunque lleguen después", () => {
    const pasos = [paso("orden"), paso("zona"), paso("gestion_orden"), paso("gestion_orden_pago")];
    const aristas = [
      { hija: "orden", madre: "zona" },
      { hija: "gestion_orden", madre: "orden" },
      { hija: "gestion_orden_pago", madre: "gestion_orden" },
    ];
    expect(ordenarPorFk(pasos, aristas).map((p) => p.tabla)).toEqual(["gestion_orden_pago", "gestion_orden", "orden", "zona"]);
  });

  it("sin FK entre ellas, conserva el orden de llegada; varias columnas de una tabla quedan juntas", () => {
    const pasos = [paso("b"), paso("a", "creado_por"), paso("c"), paso("a", "aprobado_por")];
    expect(ordenarPorFk(pasos, []).map((p) => `${p.tabla}.${p.columna}`)).toEqual([
      "b.organizacion_id",
      "a.creado_por",
      "a.aprobado_por",
      "c.organizacion_id",
    ]);
  });

  it("un ciclo no se pierde: sus tablas van al final, en su orden", () => {
    const pasos = [paso("x"), paso("y"), paso("libre")];
    const aristas = [
      { hija: "x", madre: "y" },
      { hija: "y", madre: "x" },
    ];
    expect(ordenarPorFk(pasos, aristas).map((p) => p.tabla)).toEqual(["libre", "x", "y"]);
  });

  it("una FK hacia una tabla de fuera de los pasos no cuenta", () => {
    const pasos = [paso("orden")];
    expect(ordenarPorFk(pasos, [{ hija: "orden", madre: "organizacion" }]).map((p) => p.tabla)).toEqual(["orden"]);
  });
});
