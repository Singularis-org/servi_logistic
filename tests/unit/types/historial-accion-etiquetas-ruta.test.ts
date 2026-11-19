// SLT-48 (R44, R38) — LAS ETIQUETAS DE LUGAR DEL HISTORIAL DE ACCIONES: LA RUTA ENTERA, DE CUALQUIER PROFUNDIDAD.
//
// La columna «Sobre qué» de un lugar es la ruta de la hoja a la raíz con el separador de hoy (« · »). En
// Costa Rica sale igual que hoy, y las filas ya escritas con la forma vieja (`provincia`, `canton`,
// `distrito`) se leen igual. Los ejemplos son los de la maqueta aprobada (sección 3).
import { describe, expect, it } from "vitest";

import {
  ETIQUETA_DESCONOCIDA,
  ETIQUETA_MAX_CHARS,
  SEPARADOR_DE_RUTA,
  VALOR_MAX_CHARS,
  etiquetaDeEntidad,
  rutaDeHojaARaiz,
  valorDeRuta,
} from "@/lib/types/historial-accion-etiquetas";

const RUTA_10 = [
  "Lote 7",
  "Manzana 12",
  "El Mirador",
  "Sector 4",
  "La Loma",
  "San Pedro",
  "Cordillera",
  "Andina",
  "Alto Norte",
  "Norte",
];

describe("SLT-48 / R44 — la etiqueta de un lugar es su ruta entera, de la hoja a la raíz", () => {
  it("Costa Rica: igual que hoy, y la forma nueva coincide con la vieja de `distrito`", () => {
    const nueva = etiquetaDeEntidad("nodo_geografico", { nombres: ["San Rafael", "Escazú", "San José"] });
    expect(nueva).toBe("San Rafael · Escazú · San José");
    expect(nueva).toBe(
      etiquetaDeEntidad("distrito", { nombre: "San Rafael", cantonNombre: "Escazú", provinciaNombre: "San José" }),
    );
  });

  it("las filas ya escritas con la forma vieja se leen igual que hoy", () => {
    expect(etiquetaDeEntidad("provincia", { nombre: "San José" })).toBe("San José");
    expect(etiquetaDeEntidad("canton", { nombre: "Escazú", provinciaNombre: "San José" })).toBe("Escazú · San José");
    expect(
      etiquetaDeEntidad("distrito", { nombre: "San Rafael", cantonNombre: "Escazú", provinciaNombre: "San José" }),
    ).toBe("San Rafael · Escazú · San José");
  });

  it("país de 2 niveles", () => {
    expect(etiquetaDeEntidad("nodo_geografico", { nombres: ["Turbaco", "Bolívar"] })).toBe("Turbaco · Bolívar");
  });

  it("país de 4 niveles: los cuatro nombres, no solo los tres primeros", () => {
    expect(etiquetaDeEntidad("nodo_geografico", { nombres: ["Miraflores", "Viña", "Litoral", "Costa"] })).toBe(
      "Miraflores · Viña · Litoral · Costa",
    );
  });

  it("país de 10 niveles: la ruta entera mientras quepa en la columna", () => {
    const etiqueta = etiquetaDeEntidad("nodo_geografico", { nombres: RUTA_10 });
    expect(etiqueta).toBe(RUTA_10.join(SEPARADOR_DE_RUTA));
    expect(etiqueta.split(SEPARADOR_DE_RUTA)).toHaveLength(10);
  });

  it("una ruta más larga que la columna se recorta a su anchura, nunca la desborda", () => {
    const largos = Array.from({ length: 10 }, (_, i) => `${"Nombre muy largo de un lugar".padEnd(40, "x")} ${i}`);
    const etiqueta = etiquetaDeEntidad("nodo_geografico", { nombres: largos });
    expect(etiqueta.length).toBe(ETIQUETA_MAX_CHARS);
    expect(etiqueta.startsWith(largos[0]!)).toBe(true);
  });

  it("se salta los nombres vacíos y nunca deja la etiqueta en blanco", () => {
    expect(rutaDeHojaARaiz(["Miraflores", "", null, "  Costa  "])).toBe("Miraflores · Costa");
    expect(etiquetaDeEntidad("nodo_geografico", { nombres: [] })).toBe(ETIQUETA_DESCONOCIDA);
  });
});

describe("SLT-48 / R38 — la ruta como valor anterior o nuevo (la del padre de un nodo movido)", () => {
  it("es la ruta con el separador de la casa (ejemplo de la maqueta)", () => {
    expect(valorDeRuta(["Escazú", "San José"])).toBe("Escazú · San José");
    expect(valorDeRuta(["Santa Ana", "San José"])).toBe("Santa Ana · San José");
  });

  it("se recorta a la anchura de `valor_anterior`/`valor_nuevo`: Postgres no trunca", () => {
    expect(valorDeRuta(RUTA_10.slice(1)).length).toBeLessThanOrEqual(VALOR_MAX_CHARS);
    expect(valorDeRuta(RUTA_10.slice(1)).startsWith("Manzana 12 · El Mirador")).toBe(true);
  });
});
