import { describe, it, expect } from "vitest";
import { actualizarZonaSchema, crearZonaSchema, listarZonasSchema } from "@/lib/types/zona";

function base(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "GAM",
    cobroVehiculo: false,
    distritoIds: ["d1"],
    tarifas: [],
    // ⭑ FICHA 429 (R11): crear una bodega EXIGE el numero y el titular. Valores FICTICIOS: el
    // repositorio es publico y aqui no se escribe ningun SINPE real.
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    ...overrides,
  };
}

const tarifaSinVeh = { cobroEntregado: 10, cobroRechazado: 5 };
const tarifaConVeh = (vehiculoId: string) => ({ cobroEntregado: 10, cobroRechazado: 5, vehiculoId });

describe("crearZonaSchema — base", () => {
  it("acepta zona minima (cobroVehiculo=false, sin tarifas)", () => {
    expect(crearZonaSchema.safeParse(base()).success).toBe(true);
  });

  it("rechaza distritoIds vacio", () => {
    const r = crearZonaSchema.safeParse(base({ distritoIds: [] }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors).toHaveProperty("distritoIds");
  });

  it("rechaza campos desconocidos (strict)", () => {
    expect(crearZonaSchema.safeParse(base({ extra: 1 })).success).toBe(false);
  });
});

describe("crearZonaSchema — regla cobroVehiculo=true", () => {
  it("acepta >=1 tarifa todas con vehiculoId distinto", () => {
    const r = crearZonaSchema.safeParse(
      base({ cobroVehiculo: true, tarifas: [tarifaConVeh("v1"), tarifaConVeh("v2")] }),
    );
    expect(r.success).toBe(true);
  });

  it("rechaza cobroVehiculo=true sin tarifas", () => {
    const r = crearZonaSchema.safeParse(base({ cobroVehiculo: true, tarifas: [] }));
    expect(r.success).toBe(false);
  });

  it("rechaza una tarifa sin vehiculoId cuando cobroVehiculo=true", () => {
    const r = crearZonaSchema.safeParse(
      base({ cobroVehiculo: true, tarifas: [tarifaConVeh("v1"), tarifaSinVeh] }),
    );
    expect(r.success).toBe(false);
  });

  it("rechaza vehiculoId repetido cuando cobroVehiculo=true", () => {
    const r = crearZonaSchema.safeParse(
      base({ cobroVehiculo: true, tarifas: [tarifaConVeh("v1"), tarifaConVeh("v1")] }),
    );
    expect(r.success).toBe(false);
  });
});

describe("crearZonaSchema — regla cobroVehiculo=false", () => {
  it("acepta exactamente una tarifa sin vehiculoId", () => {
    const r = crearZonaSchema.safeParse(base({ cobroVehiculo: false, tarifas: [tarifaSinVeh] }));
    expect(r.success).toBe(true);
  });

  it("rechaza mas de una tarifa cuando cobroVehiculo=false", () => {
    const r = crearZonaSchema.safeParse(
      base({ cobroVehiculo: false, tarifas: [tarifaSinVeh, tarifaSinVeh] }),
    );
    expect(r.success).toBe(false);
  });

  it("rechaza una tarifa con vehiculoId cuando cobroVehiculo=false", () => {
    const r = crearZonaSchema.safeParse(
      base({ cobroVehiculo: false, tarifas: [tarifaConVeh("v1")] }),
    );
    expect(r.success).toBe(false);
  });
});

describe("listarZonasSchema — include", () => {
  it("aplica defaults y sin include", () => {
    const r = listarZonasSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBe(1);
  });

  it("acepta include ['tarifas']", () => {
    expect(listarZonasSchema.safeParse({ include: ["tarifas"] }).success).toBe(true);
  });

  it("rechaza include con valores fuera del catalogo", () => {
    expect(listarZonasSchema.safeParse({ include: ["distritos"] }).success).toBe(false);
  });
});

/**
 * SLT-89 · R5 (design §6) — «al menos uno» se mide entre `distritoIds` y `nodoIds`, y el error sigue
 * en `distritoIds`, el campo de hoy.
 */
describe("SLT-89 · R5 — una zona necesita al menos un lugar, distrito u otro nodo", () => {
  it("crear solo con un nodo que no es distrito es valido", () => {
    const r = crearZonaSchema.safeParse(base({ distritoIds: [], nodoIds: ["canton-1"] }));
    expect(r.success).toBe(true);
  });

  it("crear sin distritos ni nodos → error en `distritoIds`", () => {
    const r = crearZonaSchema.safeParse(base({ distritoIds: [], nodoIds: [] }));
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.error.flatten().fieldErrors)).toEqual(["distritoIds"]);
  });

  it("actualizar sin distritos ni nodos → error en `distritoIds`", () => {
    const r = actualizarZonaSchema.safeParse({
      nombre: "GAM",
      distritoIds: [],
      antes: { distritoIds: ["d1"], nodoIds: [] },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.error.flatten().fieldErrors)).toEqual(["distritoIds"]);
  });

  it("`nodoIds` ausente sigue siendo valido y no se materializa", () => {
    const r = crearZonaSchema.parse(base());
    expect(r.nodoIds).toBeUndefined();
  });
});
