import { describe, expect, it } from "vitest";

import {
  nivelesDelCatalogo,
  rutaConTipos,
  rutaDelLugar,
  TipoDeNivelAusente,
} from "@/lib/repositories/_shared/ruta-del-lugar";
import { crearCatalogo, type NodoDelCatalogo, type TipoDeNivel } from "@/lib/services/geografia-dominio";
import {
  dosMasHondos,
  lineaDeUbicacion,
  rutaInvertida,
  tiposDeDosMasHondos,
  type NivelDelPais,
  type Ruta,
} from "@/lib/utils/ubicacion-presentacion";

// SLT-125 T2.1 (design §3, §4.1; R7, R11, R13, R14) — el nucleo puro de la presentacion de un lugar.
// Los textos de Costa Rica van literales a proposito (R42: solo los tests de CR los llevan).

const CR: NivelDelPais[] = [
  { profundidad: 1, singular: "Provincia" },
  { profundidad: 2, singular: "Cantón" },
  { profundidad: 3, singular: "Distrito" },
];
const DOS: NivelDelPais[] = [
  { profundidad: 1, singular: "Región" },
  { profundidad: 2, singular: "Comuna" },
];
const CUATRO: NivelDelPais[] = [
  { profundidad: 1, singular: "Región" },
  { profundidad: 2, singular: "Comuna" },
  { profundidad: 3, singular: "Barrio" },
  { profundidad: 4, singular: "Sector" },
];
const DIEZ: NivelDelPais[] = Array.from({ length: 10 }, (_, i) => ({ profundidad: i + 1, singular: `Tramo ${i + 1}` }));

const ruta = (...nombres: string[]): Ruta => nombres.map((nombre, i) => ({ id: `n${i + 1}`, nombre }));

describe("lineaDeUbicacion (R7)", () => {
  it("une la zona y toda la ruta del nivel 1 al lugar con el separador de la superficie", () => {
    expect(lineaDeUbicacion("Oeste", ruta("San José", "San José", "Carmen"), " · ")).toBe(
      "Oeste · San José · San José · Carmen",
    );
    expect(lineaDeUbicacion("Oeste", ruta("San José", "San José", "Carmen"), " / ")).toBe(
      "Oeste / San José / San José / Carmen",
    );
  });

  it("lleva todos los niveles de la ruta, no solo tres", () => {
    const larga = ruta(...DIEZ.map((n) => `Lugar ${n.profundidad}`));
    expect(lineaDeUbicacion(null, larga, " · ")).toBe(DIEZ.map((n) => `Lugar ${n.profundidad}`).join(" · "));
  });

  it("omite los tramos vacios: sin zona, nombre vacio o ruta corta", () => {
    expect(lineaDeUbicacion(null, ruta("San José", "San José"), " · ")).toBe("San José · San José");
    expect(lineaDeUbicacion("", ruta("A", "", "C"), " · ")).toBe("A · C");
  });

  it("sin ningun tramo devuelve null (celda vacia)", () => {
    expect(lineaDeUbicacion(null, [], " · ")).toBeNull();
    expect(lineaDeUbicacion("", ruta(""), " · ")).toBeNull();
  });
});

describe("dosMasHondos (R11; P7 opcion a)", () => {
  it("CR con distrito: canton arriba y distrito abajo, como hoy", () => {
    expect(dosMasHondos(ruta("San José", "San José", "Carmen"), 3)).toEqual({ arriba: "San José", abajo: "Carmen" });
  });

  it("CR sin distrito: solo el canton, como hoy (P7 = a)", () => {
    expect(dosMasHondos(ruta("San José", "Escazú"), 3)).toEqual({ arriba: "Escazú", abajo: null });
  });

  it("pais de 4 niveles: los niveles 2·3 de la ruta de la orden hasta SLT-48", () => {
    expect(dosMasHondos(ruta("Metropolitana", "Providencia", "Bellavista"), 4)).toEqual({
      arriba: "Providencia",
      abajo: "Bellavista",
    });
  });

  it("pais de 2 niveles: los niveles 1·2", () => {
    expect(dosMasHondos(ruta("Norte", "Arica"), 2)).toEqual({ arriba: "Norte", abajo: "Arica" });
  });

  it("pais de 10 niveles: tambien los niveles 2·3, porque una orden no pasa del 3", () => {
    expect(dosMasHondos(ruta("A", "B", "C"), 10)).toEqual({ arriba: "B", abajo: "C" });
  });

  it("ruta vacia (lugar fuera del catalogo, R18): los dos null, sin fallar", () => {
    expect(dosMasHondos([], 3)).toEqual({ arriba: null, abajo: null });
  });
});

describe("tiposDeDosMasHondos (R13)", () => {
  it("CR: Cantón y Distrito", () => {
    expect(tiposDeDosMasHondos(CR)).toEqual(["Cantón", "Distrito"]);
  });

  it("pais de 4 niveles: los tipos de los niveles 2 y 3 (Comuna · Barrio)", () => {
    expect(tiposDeDosMasHondos(CUATRO)).toEqual(["Comuna", "Barrio"]);
  });

  it("pais de 2 niveles: los tipos de los niveles 1 y 2", () => {
    expect(tiposDeDosMasHondos(DOS)).toEqual(["Región", "Comuna"]);
  });

  it("no depende del orden en que llegan los niveles", () => {
    expect(tiposDeDosMasHondos([...CUATRO].reverse())).toEqual(["Comuna", "Barrio"]);
  });

  it("pais de 10 niveles: los niveles 2 y 3", () => {
    expect(tiposDeDosMasHondos(DIEZ)).toEqual(["Tramo 2", "Tramo 3"]);
  });
});

describe("rutaInvertida (R14, R32)", () => {
  it("del mas hondo al nivel 1, sin vacios", () => {
    expect(rutaInvertida(ruta("San José", "San José", "Carmen"))).toEqual(["Carmen", "San José", "San José"]);
    expect(rutaInvertida(ruta("San José", "", "Carmen"))).toEqual(["Carmen", "San José"]);
    expect(rutaInvertida([])).toEqual([]);
  });

  it("el destino de navegacion de hoy sale igual: direccion y ruta invertida unidas por «, »", () => {
    const texto = ["Av 2, casa 5", ...rutaInvertida(ruta("San José", "San José", "Carmen"))].join(", ");
    expect(texto).toBe("Av 2, casa 5, Carmen, San José, San José");
  });
});

// --- ruta-del-lugar (design §4.1) ---

function tipo(k: number, singular: string): TipoDeNivel {
  return {
    id: `t${k}`,
    clave: `nivel_${k}`,
    nombreSingular: singular,
    nombrePlural: `${singular}s`,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  };
}

function nodoDe(id: string, padreId: string | null, profundidad: number, nombre: string): NodoDelCatalogo {
  return {
    id,
    padreId,
    profundidad,
    tipoId: `t${profundidad}`,
    nombre,
    nombreNormalizado: nombre.toLowerCase(),
    codigoOficial: null,
    activo: true,
  };
}

const CATALOGO_4 = crearCatalogo(
  "XA",
  // Desordenados a proposito: `nivelesDelCatalogo` los ordena por k.
  [tipo(3, "Barrio"), tipo(1, "Región"), tipo(4, "Sector"), tipo(2, "Comuna")],
  [
    nodoDe("r1", null, 1, "Metropolitana"),
    nodoDe("c1", "r1", 2, "Providencia"),
    nodoDe("b1", "c1", 3, "Bellavista"),
    nodoDe("s1", "b1", 4, "Sector Uno"),
  ],
);

describe("nivelesDelCatalogo", () => {
  it("los tipos nivel_1..P del pais, ordenados por profundidad", () => {
    expect(nivelesDelCatalogo(CATALOGO_4)).toEqual(CUATRO);
  });

  it("un tipo que no es nivel_<k> no entra", () => {
    const cat = crearCatalogo("XA", [tipo(1, "Región"), { ...tipo(9, "Otro"), clave: "especial" }], []);
    expect(nivelesDelCatalogo(cat)).toEqual([{ profundidad: 1, singular: "Región" }]);
  });
});

describe("rutaConTipos (R21)", () => {
  it("anade a cada paso su profundidad y el tipo de ese nivel; la ruta sigue saliendo de lugarDeLaOrden (P1)", () => {
    const r = rutaDelLugar(CATALOGO_4, { cantonId: "c1", distritoId: "b1" });
    expect(rutaConTipos(CATALOGO_4, r)).toEqual([
      { profundidad: 1, tipo: "Región", nombre: "Metropolitana", id: "r1" },
      { profundidad: 2, tipo: "Comuna", nombre: "Providencia", id: "c1" },
      { profundidad: 3, tipo: "Barrio", nombre: "Bellavista", id: "b1" },
    ]);
  });

  it("ruta vacia da []", () => {
    expect(rutaConTipos(CATALOGO_4, [])).toEqual([]);
  });

  it("un nivel sin tipo en el pais lanza: no se congela un tipo inventado (R23)", () => {
    const sinTipos = crearCatalogo("XA", [], CATALOGO_4.nodos);
    expect(() => rutaConTipos(sinTipos, [{ id: "r1", nombre: "Metropolitana" }])).toThrow(TipoDeNivelAusente);
  });
});
