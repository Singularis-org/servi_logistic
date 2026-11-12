import { describe, expect, it } from "vitest";

import { rutaDelLugar } from "@/lib/repositories/_shared/ruta-del-lugar";
import { crearCatalogo, type NodoDelCatalogo, type TipoDeNivel } from "@/lib/services/geografia-dominio";

// SLT-47 (T2.1; R16; design §3.4) — la ruta del lugar de una orden, del nivel 1 al lugar, sobre el
// catalogo y `lugarDeLaOrden` (distrito si lo tiene, si no el canton).
//
//   P1 ── C1 ─┬─ D1
//             └─ D2 (mismo nombre que D1 en otro canton: «San Rafael»)
//   P2 ── C2 ─── D3 «San Rafael»

const TIPOS: TipoDeNivel[] = [1, 2, 3].map((k) => ({
  id: `t${k}`,
  clave: `nivel_${k}`,
  nombreSingular: `Nivel ${k}`,
  nombrePlural: `Niveles ${k}`,
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
}));

function n(id: string, padreId: string | null, profundidad: number, nombre = `Nombre ${id}`): NodoDelCatalogo {
  return { id, padreId, profundidad, tipoId: `t${profundidad}`, nombre, nombreNormalizado: nombre.toLowerCase(), codigoOficial: null, activo: true };
}

const cat = crearCatalogo("XA", TIPOS, [
  n("P1", null, 1),
  n("P2", null, 1),
  n("C1", "P1", 2),
  n("C2", "P2", 2),
  n("D1", "C1", 3, "San Rafael"),
  n("D2", "C1", 3),
  n("D3", "C2", 3, "San Rafael"),
]);

describe("SLT-47 — rutaDelLugar (R16)", () => {
  it("con distrito: del nivel 1 al distrito, con ids y nombres", () => {
    expect(rutaDelLugar(cat, { distritoId: "D1", cantonId: "C1" })).toEqual([
      { id: "P1", nombre: "Nombre P1" },
      { id: "C1", nombre: "Nombre C1" },
      { id: "D1", nombre: "San Rafael" },
    ]);
  });

  it("sin distrito: termina en el canton", () => {
    expect(rutaDelLugar(cat, { distritoId: null, cantonId: "C2" })).toEqual([
      { id: "P2", nombre: "Nombre P2" },
      { id: "C2", nombre: "Nombre C2" },
    ]);
  });

  it("R13: dos distritos con el mismo nombre dan rutas con ids distintos", () => {
    const a = rutaDelLugar(cat, { distritoId: "D1", cantonId: "C1" });
    const b = rutaDelLugar(cat, { distritoId: "D3", cantonId: "C2" });
    expect(a.at(-1)?.nombre).toBe(b.at(-1)?.nombre);
    expect(a.map((p) => p.id)).not.toEqual(b.map((p) => p.id));
  });

  it("un lugar fuera del catalogo da []", () => {
    expect(rutaDelLugar(cat, { distritoId: "nope", cantonId: "C1" })).toEqual([]);
  });

  it("solo lleva id y nombre, ningun otro campo", () => {
    for (const paso of rutaDelLugar(cat, { distritoId: "D2", cantonId: "C1" })) {
      expect(Object.keys(paso).sort()).toEqual(["id", "nombre"]);
    }
  });
});
