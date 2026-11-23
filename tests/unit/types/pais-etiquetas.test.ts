import { describe, it, expect } from "vitest";

import { etiquetasDePais, type NombresDeNivelesDePais } from "@/lib/types/pais";

// SLT-46 R51 (design §2.4, P10) — un país de 2 niveles guarda `''` en `nivel_3_*`; sus empresas ven
// como etiqueta del nivel 3 la del nivel 2, nunca un texto vacío. Con nombre, el nombre.

const DOS_NIVELES: NombresDeNivelesDePais = {
  nivel1Singular: "Departamento",
  nivel1Plural: "Departamentos",
  nivel2Singular: "Municipio",
  nivel2Plural: "Municipios",
  nivel3Singular: "",
  nivel3Plural: "",
};

const TRES_NIVELES: NombresDeNivelesDePais = {
  nivel1Singular: "Provincia",
  nivel1Plural: "Provincias",
  nivel2Singular: "Cantón",
  nivel2Plural: "Cantones",
  nivel3Singular: "Distrito",
  nivel3Plural: "Distritos",
};

describe("R51 — etiqueta del nivel 3 de un país de 2 niveles", () => {
  it("con el nivel 3 vacío devuelve la etiqueta del nivel 2, singular y plural", () => {
    const e = etiquetasDePais(DOS_NIVELES);
    expect(e.distrito).toEqual({ singular: "Municipio", plural: "Municipios" });
    expect(e.canton).toEqual({ singular: "Municipio", plural: "Municipios" });
    expect(e.provincia).toEqual({ singular: "Departamento", plural: "Departamentos" });
  });

  it("nunca devuelve un texto vacío en ninguna etiqueta", () => {
    const textos = Object.values(etiquetasDePais(DOS_NIVELES)).flatMap((x) => [x.singular, x.plural]);
    expect(textos.every((t) => t !== "")).toBe(true);
  });

  it("con nombre en el nivel 3 devuelve ese nombre, como en SL-20", () => {
    expect(etiquetasDePais(TRES_NIVELES)).toEqual({
      provincia: { singular: "Provincia", plural: "Provincias" },
      canton: { singular: "Cantón", plural: "Cantones" },
      distrito: { singular: "Distrito", plural: "Distritos" },
    });
  });

  it("la etiqueta repetida es una copia: tocar una no cambia la otra", () => {
    const e = etiquetasDePais(DOS_NIVELES);
    expect(e.distrito).not.toBe(e.canton);
  });
});
