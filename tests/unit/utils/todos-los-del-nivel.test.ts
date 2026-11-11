import { describe, expect, it } from "vitest";

import { todosLosDelNivel } from "@/lib/utils/filtro-ubicacion-asignaciones";

// SLT-47 (R7; decision de la tanda 2) — la opcion «todos» de cada lista de lugar de mis-asignaciones
// toma el genero del SINGULAR del tipo de nivel, no del plural: con el plural, «Regiones» salia
// «Todos los regiones».

describe("todosLosDelNivel: genero por el singular", () => {
  it.each([
    ["Provincia", "Provincias", "Todas las provincias"],
    ["Cantón", "Cantones", "Todos los cantones"],
    ["Distrito", "Distritos", "Todos los distritos"],
    ["Región", "Regiones", "Todas las regiones"],
    ["Comuna", "Comunas", "Todas las comunas"],
    ["Barrio", "Barrios", "Todos los barrios"],
    ["Ciudad", "Ciudades", "Todas las ciudades"],
    ["Municipio", "Municipios", "Todos los municipios"],
  ])("%s → «%s»", (singular, plural, esperado) => {
    expect(todosLosDelNivel(singular, plural)).toBe(esperado);
  });

  it("no distingue mayusculas ni tildes en la terminacion", () => {
    expect(todosLosDelNivel("REGION", "REGIONES")).toBe("Todas las regiones");
    expect(todosLosDelNivel("Mitad", "Mitades")).toBe("Todas las mitades");
  });

  it("Costa Rica queda como hoy: «Todos los» para Cantón y Distrito", () => {
    expect(todosLosDelNivel("Cantón", "Cantones")).toMatch(/^Todos los /);
    expect(todosLosDelNivel("Distrito", "Distritos")).toMatch(/^Todos los /);
  });
});
