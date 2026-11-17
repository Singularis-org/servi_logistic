import { describe, expect, it } from "vitest";

import {
  PROFUNDIDAD_MINIMA_DEL_GRUPO,
  distritoDeTarifa,
  distritoDeTarifaDelNodo,
} from "@/lib/services/geografia-dominio";
import { catalogoEnMemoria } from "../../fixtures/doble-catalogo-geografico";

// SLT-48 (T2.4; design §6; R31, R32; decision P3) — EL LUGAR DEL GRUPO DE TARIFAS DE UNA ORDEN, DESDE SU NODO.
//
// `ParTarifa.distritoId` (nombre interno heredado) ya no sale de `orden.distrito_id`: lo calcula
// `distritoDeTarifa(cat, nodo)`. En todo pais, el propio nodo si esta en el nivel 3 o mas hondo; mas
// arriba, `null` (sin grupo, tarifa base: SLT-89 R20).
//
// Para una orden vieja de Costa Rica el nodo es `COALESCE(distrito_id, canton_id)`: con distrito, el
// distrito (nivel 3) → el mismo que daba `orden.distrito_id`; sin distrito, el canton (nivel 2) → `null`,
// el mismo que daba `orden.distrito_id = NULL`. Ese es el «mismo resultado» de R32.

// Costa Rica: provincia › canton › distrito; un canton sin distritos.
const CR = catalogoEnMemoria([
  { id: "SJ", nombre: "San José" },
  { id: "ESC", padreId: "SJ", nombre: "Escazú" },
  { id: "SR", padreId: "ESC", nombre: "San Rafael" },
  { id: "SOLO", padreId: "SJ", nombre: "Solitario" },
]);

// Un pais de 4 niveles y uno de 2.
const CUATRO = catalogoEnMemoria([
  { id: "X", nombre: "Equis" },
  { id: "X1", padreId: "X", nombre: "Uno" },
  { id: "X2", padreId: "X1", nombre: "Dos" },
  { id: "X3", padreId: "X2", nombre: "Tres" },
]);
const DOS = catalogoEnMemoria([
  { id: "A", nombre: "Alfa" },
  { id: "A1", padreId: "A", nombre: "Uno" },
]);

/** Lo que leia hoy el precio de una orden vieja de CR: su `distrito_id`. */
function distritoIdDeHoy(fk: { cantonId: string; distritoId: string | null }): string | null {
  return fk.distritoId;
}

describe("SLT-48 R31/R32 — `distritoDeTarifa`: el grupo se busca desde el nodo si esta en el nivel 3 o mas hondo (P3)", () => {
  it("el umbral es el nivel 3", () => {
    expect(PROFUNDIDAD_MINIMA_DEL_GRUPO).toBe(3);
  });

  it("R32: para una orden vieja de CR con distrito da su distrito, igual que `orden.distrito_id`", () => {
    const fk = { cantonId: "ESC", distritoId: "SR" };
    const nodo = fk.distritoId ?? fk.cantonId;
    expect(distritoDeTarifa(CR, nodo)).toBe(distritoIdDeHoy(fk));
    expect(distritoDeTarifa(CR, nodo)).toBe("SR");
  });

  it("R31/R32: una orden sin distrito (un canton sin distritos) sigue sin grupo, igual que hoy", () => {
    const fk = { cantonId: "SOLO", distritoId: null };
    const nodo = fk.distritoId ?? fk.cantonId;
    expect(distritoDeTarifa(CR, nodo)).toBeNull();
    expect(distritoDeTarifa(CR, nodo)).toBe(distritoIdDeHoy(fk));
  });

  it("P3: en un pais de 4 niveles, los nodos de nivel 3 y 4 buscan su grupo desde si mismos; los de 1 y 2 van sin grupo", () => {
    expect(["X", "X1", "X2", "X3"].map((id) => distritoDeTarifa(CUATRO, id))).toEqual([null, null, "X2", "X3"]);
  });

  it("P3: en un pais de 2 niveles ninguna orden tiene grupo", () => {
    expect(["A", "A1"].map((id) => distritoDeTarifa(DOS, id))).toEqual([null, null]);
  });

  it("un nodo fuera del catalogo, o una orden sin nodo, no inventan un grupo", () => {
    expect(distritoDeTarifa(CR, "no-existe")).toBeNull();
    expect(distritoDeTarifa(CR, null)).toBeNull();
  });

  it("`distritoDeTarifaDelNodo` aplica la misma regla con el nodo en la mano", () => {
    expect(distritoDeTarifaDelNodo({ id: "d", profundidad: 3 })).toBe("d");
    expect(distritoDeTarifaDelNodo({ id: "b", profundidad: 10 })).toBe("b");
    expect(distritoDeTarifaDelNodo({ id: "c", profundidad: 2 })).toBeNull();
    expect(distritoDeTarifaDelNodo(null)).toBeNull();
  });
});
