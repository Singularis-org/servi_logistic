import { describe, it, expect } from "vitest";

import {
  PAIS_FUERA_DEL_CATALOGO,
  PAIS_NIVELES_MAX,
  PAIS_NIVELES_MIN,
  PAIS_NOMBRE_MAX,
  PAIS_NOMBRE_MIN,
  agregarNivelPaisSchema,
  crearPaisSchema,
  renombrarTipoNivelSchema,
  reordenarTiposSchema,
  TIPO_REPETIDO_AL_REORDENAR,
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
    expect(crearPaisSchema.safeParse({ id: "GT", tipos: tipos(2) }).success).toBe(true);
    const diez = crearPaisSchema.parse({ id: "GT", tipos: tipos(10) });
    expect(diez.tipos.map((t) => t.singular)).toEqual(tipos(10).map((t) => t.singular));
  });

  it("rechaza 1 y 11 tipos en `tipos`", () => {
    for (const n of [0, 1, 11]) {
      const r = crearPaisSchema.safeParse({ id: "GT", tipos: tipos(n) });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].path).toEqual(["tipos"]);
    }
  });

  it("rechaza un nombre de tipo fuera de 2–40 caracteres, singular o plural", () => {
    const corto = [...tipos(2)];
    corto[1] = { singular: "M", plural: "Municipios" };
    const largo = [...tipos(3)];
    largo[2] = { singular: "Aldea", plural: "x".repeat(PAIS_NOMBRE_MAX + 1) };
    expect(crearPaisSchema.safeParse({ id: "GT", tipos: corto }).success).toBe(false);
    expect(crearPaisSchema.safeParse({ id: "GT", tipos: largo }).success).toBe(false);
    expect(PAIS_NOMBRE_MIN).toBe(2);
  });

  it("recorta y colapsa los nombres, que es lo que se guarda", () => {
    const r = crearPaisSchema.parse({
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
    const fuera = crearPaisSchema.safeParse({ id: "XA", tipos: tipos(3) });
    expect(fuera.success).toBe(false);
    expect(fuera.error?.issues[0].message).toBe(PAIS_FUERA_DEL_CATALOGO);
    expect(crearPaisSchema.safeParse({ id: "GT", tipos: tipos(3), nombre: "Otro" }).success).toBe(false);
    expect(
      crearPaisSchema.safeParse({ id: "GT", tipos: [...tipos(2), { singular: "Aldea", plural: "Aldeas", clave: "nivel_9" }] })
        .success,
    ).toBe(false);
  });
});

describe("R63 — el alta de país acepta `disponible` (decisión humana 2026-11-09)", () => {
  it("acepta `disponible` true y false y lo conserva", () => {
    expect(crearPaisSchema.parse({ id: "GT", tipos: tipos(3), disponible: false }).disponible).toBe(false);
    expect(crearPaisSchema.parse({ id: "GT", tipos: tipos(2), disponible: true }).disponible).toBe(true);
  });

  it("es opcional: sin él la entrada sigue valiendo y no se inventa un valor", () => {
    const r = crearPaisSchema.parse({ id: "GT", tipos: tipos(3) });
    expect("disponible" in r).toBe(false);
  });

  it("rechaza un `disponible` que no es booleano, en su campo", () => {
    for (const valor of ["true", 1, null]) {
      const r = crearPaisSchema.safeParse({ id: "GT", tipos: tipos(3), disponible: valor });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].path).toEqual(["disponible"]);
    }
  });
});

describe("R25/R26 — editar los nombres de un tipo", () => {
  // SLT-46 (2026-11-09, §4.1): la entrada gana `anterior` (obligatorio); aquí siempre válido, para que
  // cada caso mida lo que dice su nombre.
  const ANTES = { anterior: { nombreSingular: "Provincia", nombrePlural: "Provincias" } };

  it("acepta `{tipoId, nombreSingular, nombrePlural}` con nombres de 2–40", () => {
    expect(
      renombrarTipoNivelSchema.safeParse({ ...ANTES, tipoId: "t1", nombreSingular: "Región", nombrePlural: "Regiones" }).success,
    ).toBe(true);
  });

  it("rechaza nombres fuera de 2–40, un tipo vacío y claves desconocidas", () => {
    expect(renombrarTipoNivelSchema.safeParse({ ...ANTES, tipoId: "t1", nombreSingular: "R", nombrePlural: "Regiones" }).success).toBe(
      false,
    );
    expect(
      renombrarTipoNivelSchema.safeParse({ ...ANTES, tipoId: "t1", nombreSingular: "Región", nombrePlural: "x".repeat(41) }).success,
    ).toBe(false);
    expect(renombrarTipoNivelSchema.safeParse({ ...ANTES, tipoId: "", nombreSingular: "Región", nombrePlural: "Regiones" }).success).toBe(
      false,
    );
    expect(
      renombrarTipoNivelSchema.safeParse({ ...ANTES, tipoId: "t1", nombreSingular: "Región", nombrePlural: "Regiones", clave: "nivel_2" })
        .success,
    ).toBe(false);
  });
});

describe("R49/P3 — agregar un nivel al final", () => {
  // SLT-46 (2026-11-09, §4.1): la entrada gana `profundidad` (3–10, obligatoria); aquí siempre válida.
  it("acepta `{paisId, nombreSingular, nombrePlural}`", () => {
    const r = agregarNivelPaisSchema.parse({ paisId: "CR", nombreSingular: " Barrio ", nombrePlural: "Barrios", profundidad: 4 });
    expect(r).toEqual({ paisId: "CR", nombreSingular: "Barrio", nombrePlural: "Barrios", profundidad: 4 });
  });

  it("rechaza nombres fuera de 2–40 caracteres", () => {
    expect(agregarNivelPaisSchema.safeParse({ profundidad: 4, paisId: "CR", nombreSingular: "B", nombrePlural: "Barrios" }).success).toBe(false);
    expect(
      agregarNivelPaisSchema.safeParse({ profundidad: 4, paisId: "CR", nombreSingular: "Barrio", nombrePlural: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("no admite posición: siempre va al final, y el país es un código alfa-2", () => {
    expect(
      agregarNivelPaisSchema.safeParse({ profundidad: 4, paisId: "CR", nombreSingular: "Barrio", nombrePlural: "Barrios", posicion: 2 }).success,
    ).toBe(false);
    expect(agregarNivelPaisSchema.safeParse({ profundidad: 4, paisId: "cr", nombreSingular: "Barrio", nombrePlural: "Barrios" }).success).toBe(
      false,
    );
  });
});

// SLT-46 (2026-11-09, design §4.1, §4.7) — el «antes» que viaja con cada escritura de tipos (R61) y el
// esquema del reordenamiento (R57).

describe("R61 — el «antes» es obligatorio en la edición de un tipo y en agregar nivel", () => {
  const RENOMBRE = { tipoId: "t1", nombreSingular: "Región", nombrePlural: "Regiones" };
  const NIVEL = { paisId: "CR", nombreSingular: "Barrio", nombrePlural: "Barrios" };

  it("renombrar un tipo sin `anterior`, o con un `anterior` incompleto o con campos de más, no entra", () => {
    const sin = renombrarTipoNivelSchema.safeParse(RENOMBRE);
    expect(sin.success).toBe(false);
    if (!sin.success) expect(Object.keys(sin.error.flatten().fieldErrors)).toContain("anterior");
    expect(renombrarTipoNivelSchema.safeParse({ ...RENOMBRE, anterior: { nombreSingular: "Provincia" } }).success).toBe(false);
    expect(
      renombrarTipoNivelSchema.safeParse({
        ...RENOMBRE,
        anterior: { nombreSingular: "Provincia", nombrePlural: "Provincias", clave: "nivel_1" },
      }).success,
    ).toBe(false);
    // CONTRAPRUEBA: con el «antes» completo, entra (normalizado igual que los nombres).
    const con = renombrarTipoNivelSchema.parse({
      ...RENOMBRE,
      anterior: { nombreSingular: " Provincia ", nombrePlural: "Provincias" },
    });
    expect(con.anterior).toEqual({ nombreSingular: "Provincia", nombrePlural: "Provincias" });
  });

  it("agregar nivel sin `profundidad`, o con una fuera de 3–10 o no entera, no entra; 3 y 10 sí", () => {
    const sin = agregarNivelPaisSchema.safeParse(NIVEL);
    expect(sin.success).toBe(false);
    if (!sin.success) expect(Object.keys(sin.error.flatten().fieldErrors)).toContain("profundidad");
    for (const profundidad of [2, 11, 3.5, "4"]) {
      expect(agregarNivelPaisSchema.safeParse({ ...NIVEL, profundidad }).success, String(profundidad)).toBe(false);
    }
    for (const profundidad of [3, PAIS_NIVELES_MAX]) {
      expect(agregarNivelPaisSchema.safeParse({ ...NIVEL, profundidad }).success, String(profundidad)).toBe(true);
    }
  });
});

describe("R57 — el esquema del reordenamiento", () => {
  /** `n` niveles con ids y nombres válidos y distintos. */
  const niveles = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      tipoId: `t${i + 1}`,
      nombreSingular: `Nivel ${i + 1}`,
      nombrePlural: `Niveles ${i + 1}`,
    }));

  it("acepta 2 y 10 niveles distintos, con los nombres normalizados y en el orden recibido", () => {
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: niveles(PAIS_NIVELES_MIN) }).success).toBe(true);
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: niveles(PAIS_NIVELES_MAX) }).success).toBe(true);
    const r = reordenarTiposSchema.parse({
      paisId: "CR",
      niveles: [
        { tipoId: "t2", nombreSingular: "  Can  tón ", nombrePlural: "Cantones" },
        { tipoId: "t1", nombreSingular: "Provincia", nombrePlural: "Provincias" },
      ],
    });
    expect(r.niveles.map((n) => [n.tipoId, n.nombreSingular])).toEqual([
      ["t2", "Can tón"],
      ["t1", "Provincia"],
    ]);
  });

  it("rechaza 1 y 11 niveles, con el error en `niveles`", () => {
    for (const n of [PAIS_NIVELES_MIN - 1, PAIS_NIVELES_MAX + 1]) {
      const r = reordenarTiposSchema.safeParse({ paisId: "CR", niveles: niveles(n) });
      expect(r.success, String(n)).toBe(false);
      if (!r.success) expect(Object.keys(r.error.flatten().fieldErrors)).toEqual(["niveles"]);
    }
  });

  it("rechaza un tipo repetido con su mensaje en `niveles`; CONTRAPRUEBA: los mismos ids sin repetir entran", () => {
    const repetidos = [...niveles(3), niveles(3)[0]];
    const r = reordenarTiposSchema.safeParse({ paisId: "CR", niveles: repetidos });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.niveles).toContain(TIPO_REPETIDO_AL_REORDENAR);
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: niveles(3) }).success).toBe(true);
  });

  it("rechaza nombres fuera de 2–40, un tipo vacío, claves de más y un país que no es alfa-2", () => {
    const con = (cambio: Record<string, unknown>) => [{ ...niveles(1)[0], ...cambio }, niveles(2)[1]];
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: con({ nombreSingular: "R" }) }).success).toBe(false);
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: con({ nombrePlural: "x".repeat(41) }) }).success).toBe(
      false,
    );
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: con({ tipoId: "" }) }).success).toBe(false);
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: con({ clave: "nivel_1" }) }).success).toBe(false);
    expect(reordenarTiposSchema.safeParse({ paisId: "cr", niveles: niveles(2) }).success).toBe(false);
    expect(reordenarTiposSchema.safeParse({ paisId: "CR", niveles: niveles(2), profundidad: 1 }).success).toBe(false);
  });
});
