import { describe, expect, it } from "vitest";

import { seleccionAFilter } from "@/app/(app)/ordenes/_components/seleccion-a-filter";
import { seleccionAFiltroSatelite } from "@/app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros";
import { ordenFilterSchema } from "@/lib/types/orden";

// SLT-47 (T4.1; R9, design §5.1) — `/ordenes` y la bodega satelite expresan el lugar con UN solo
// parametro, `lugar_id`: los ids de la lista de nivel mas honda con eleccion. Las claves `nivel_<k>`
// son internas de la barra, y `provincia_id`/`canton_id`/`distrito_id` ya no viajan nunca.

const CLAVES_VIEJAS = ["provincia_id", "canton_id", "distrito_id"] as const;

function sinClavesViejasNiInternas(filter: Record<string, unknown>) {
  for (const clave of CLAVES_VIEJAS) expect(filter).not.toHaveProperty(clave);
  expect(Object.keys(filter).some((k) => k.startsWith("nivel_"))).toBe(false);
}

describe("R9 — seleccionAFilter emite solo `lugar_id`", () => {
  it("la cadena completa viaja como los ids del nivel mas hondo", () => {
    const filter = seleccionAFilter({ nivel_1: ["p1"], nivel_2: ["c1"], nivel_3: ["d1", "d2"] });
    expect(filter).toEqual({ lugar_id: ["d1", "d2"] });
    sinClavesViejasNiInternas(filter);
    expect(ordenFilterSchema.safeParse(filter).success).toBe(true);
  });

  it("se para en cualquier nivel: con provincia y canton, el canton", () => {
    expect(seleccionAFilter({ nivel_1: ["p1", "p2"], nivel_2: ["c1"] })).toEqual({ lugar_id: ["c1"] });
    expect(seleccionAFilter({ nivel_1: ["p1"] })).toEqual({ lugar_id: ["p1"] });
  });

  it("una lista honda vacia no cuenta: gana la mas honda CON eleccion", () => {
    expect(seleccionAFilter({ nivel_1: ["p1"], nivel_2: [] })).toEqual({ lugar_id: ["p1"] });
  });

  it("sin eleccion de lugar no hay `lugar_id` (nunca una lista vacia)", () => {
    const filter = seleccionAFilter({ nivel_1: [], zona_id: ["z1"] });
    expect(filter).toEqual({ zona_id: ["z1"] });
    sinClavesViejasNiInternas(filter);
  });

  it("con N niveles (4), el lugar sigue siendo un solo parametro", () => {
    const filter = seleccionAFilter({ nivel_1: ["a"], nivel_2: ["b"], nivel_3: ["c"], nivel_4: ["d"] });
    expect(filter).toEqual({ lugar_id: ["d"] });
  });

  it("convive con el resto de la barra sin tocarlo", () => {
    const filter = seleccionAFilter({
      zona_id: ["z1"],
      nivel_1: ["p1"],
      nivel_2: ["c1"],
      created: ["30d", "", ""],
      q: ["juan"],
    });
    expect(filter).toEqual({ zona_id: ["z1"], lugar_id: ["c1"], created_preset: "30d", q: "juan" });
    sinClavesViejasNiInternas(filter);
    expect(ordenFilterSchema.safeParse(filter).success).toBe(true);
  });

  it("el borde rechaza las claves viejas: por eso no deben salir de aqui", () => {
    expect(ordenFilterSchema.safeParse({ provincia_id: ["p1"] }).success).toBe(false);
  });
});

describe("R9 — la bodega satelite hereda la misma traduccion", () => {
  it("`lugar_id` con el nivel mas hondo, y los estados aparte", () => {
    const filtro = seleccionAFiltroSatelite({ estado: ["en_bodega_satelite"], nivel_1: ["p1"], nivel_2: ["c1"] });
    expect(filtro).toEqual({ estados: ["en_bodega_satelite"], lugar_id: ["c1"] });
    sinClavesViejasNiInternas(filtro as Record<string, unknown>);
  });
});
