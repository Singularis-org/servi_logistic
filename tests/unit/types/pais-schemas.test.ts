import { describe, it, expect } from "vitest";

import {
  PAIS_FUERA_DEL_CATALOGO,
  PAIS_NIVELES_MAX,
  PAIS_NIVELES_MIN,
  PAIS_NOMBRE_MAX,
  PAIS_NOMBRE_MIN,
  agregarNivelPaisSchema,
  crearPaisConTiposSchema,
  renombrarTipoNivelSchema,
} from "@/lib/types/pais";

// SLT-46 (design §4.1) — el borde del alta de país con su lista de tipos (R23, R24, P2), de la
// edición de los nombres de un tipo (R25, R26) y de «agregar nivel» (R48, R49, P3).
//
// `CR` y `GT` son solo códigos del catálogo ISO para la entrada; el schema no distingue países.

/** `n` tipos con nombres válidos y distintos. */
function tipos(n: number): { singular: string; plural: string }[] {
  return Array.from({ length: n }, (_, i) => ({ singular: `Nivel ${i + 1}`, plural: `Niveles ${i + 1}` }));
}

describe("R24/P2 — el alta de país trae de 2 a 10 tipos", () => {
  it("acepta 2 y 10 tipos, y conserva su orden (el primero será `nivel_1`)", () => {
    expect(PAIS_NIVELES_MIN).toBe(2);
    expect(PAIS_NIVELES_MAX).toBe(10);
    expect(crearPaisConTiposSchema.safeParse({ id: "GT", tipos: tipos(2) }).success).toBe(true);
    const diez = crearPaisConTiposSchema.parse({ id: "GT", tipos: tipos(10) });
    expect(diez.tipos.map((t) => t.singular)).toEqual(tipos(10).map((t) => t.singular));
  });

  it("rechaza 1 y 11 tipos en `tipos`", () => {
    for (const n of [0, 1, 11]) {
      const r = crearPaisConTiposSchema.safeParse({ id: "GT", tipos: tipos(n) });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].path).toEqual(["tipos"]);
    }
  });

  it("rechaza un nombre de tipo fuera de 2–40 caracteres, singular o plural", () => {
    const corto = [...tipos(2)];
    corto[1] = { singular: "M", plural: "Municipios" };
    const largo = [...tipos(3)];
    largo[2] = { singular: "Aldea", plural: "x".repeat(PAIS_NOMBRE_MAX + 1) };
    expect(crearPaisConTiposSchema.safeParse({ id: "GT", tipos: corto }).success).toBe(false);
    expect(crearPaisConTiposSchema.safeParse({ id: "GT", tipos: largo }).success).toBe(false);
    expect(PAIS_NOMBRE_MIN).toBe(2);
  });

  it("recorta y colapsa los nombres, que es lo que se guarda", () => {
    const r = crearPaisConTiposSchema.parse({
      id: " GT ",
      tipos: [
        { singular: "  Departamento ", plural: "Departamentos" },
        { singular: "Municipio", plural: "Municipios   de   GT" },
      ],
    });
    expect(r.id).toBe("GT");
    expect(r.tipos[0].singular).toBe("Departamento");
    expect(r.tipos[1].plural).toBe("Municipios de GT");
  });

  it("los demás rechazos siguen como en SL-20: código fuera del catálogo, claves desconocidas", () => {
    const fuera = crearPaisConTiposSchema.safeParse({ id: "XA", tipos: tipos(3) });
    expect(fuera.success).toBe(false);
    expect(fuera.error?.issues[0].message).toBe(PAIS_FUERA_DEL_CATALOGO);
    expect(crearPaisConTiposSchema.safeParse({ id: "GT", tipos: tipos(3), nombre: "Otro" }).success).toBe(false);
    expect(
      crearPaisConTiposSchema.safeParse({ id: "GT", tipos: [...tipos(2), { singular: "Aldea", plural: "Aldeas", clave: "nivel_9" }] })
        .success,
    ).toBe(false);
  });
});

describe("R25/R26 — editar los nombres de un tipo", () => {
  it("acepta `{tipoId, nombreSingular, nombrePlural}` con nombres de 2–40", () => {
    expect(
      renombrarTipoNivelSchema.safeParse({ tipoId: "t1", nombreSingular: "Región", nombrePlural: "Regiones" }).success,
    ).toBe(true);
  });

  it("rechaza nombres fuera de 2–40, un tipo vacío y claves desconocidas", () => {
    expect(renombrarTipoNivelSchema.safeParse({ tipoId: "t1", nombreSingular: "R", nombrePlural: "Regiones" }).success).toBe(
      false,
    );
    expect(
      renombrarTipoNivelSchema.safeParse({ tipoId: "t1", nombreSingular: "Región", nombrePlural: "x".repeat(41) }).success,
    ).toBe(false);
    expect(renombrarTipoNivelSchema.safeParse({ tipoId: "", nombreSingular: "Región", nombrePlural: "Regiones" }).success).toBe(
      false,
    );
    expect(
      renombrarTipoNivelSchema.safeParse({ tipoId: "t1", nombreSingular: "Región", nombrePlural: "Regiones", clave: "nivel_2" })
        .success,
    ).toBe(false);
  });
});

describe("R49/P3 — agregar un nivel al final", () => {
  it("acepta `{paisId, nombreSingular, nombrePlural}`", () => {
    const r = agregarNivelPaisSchema.parse({ paisId: "CR", nombreSingular: " Barrio ", nombrePlural: "Barrios" });
    expect(r).toEqual({ paisId: "CR", nombreSingular: "Barrio", nombrePlural: "Barrios" });
  });

  it("rechaza nombres fuera de 2–40 caracteres", () => {
    expect(agregarNivelPaisSchema.safeParse({ paisId: "CR", nombreSingular: "B", nombrePlural: "Barrios" }).success).toBe(false);
    expect(
      agregarNivelPaisSchema.safeParse({ paisId: "CR", nombreSingular: "Barrio", nombrePlural: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("no admite posición: siempre va al final, y el país es un código alfa-2", () => {
    expect(
      agregarNivelPaisSchema.safeParse({ paisId: "CR", nombreSingular: "Barrio", nombrePlural: "Barrios", posicion: 2 }).success,
    ).toBe(false);
    expect(agregarNivelPaisSchema.safeParse({ paisId: "cr", nombreSingular: "Barrio", nombrePlural: "Barrios" }).success).toBe(
      false,
    );
  });
});
