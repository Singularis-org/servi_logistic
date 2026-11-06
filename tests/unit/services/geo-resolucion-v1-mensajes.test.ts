import { describe, expect, it } from "vitest";

import { indexBy, normalize, resolveGeo } from "@/lib/services/geo-resolucion";
import type { CantonRow, DistritoRow, ProvinciaRow } from "@/lib/interfaces/repositories/IOrdenRepository";

// SLT-45 (T2.2; R3, design §2.1) — LOS 11 MENSAJES DE v1, CON SU CLAVE Y SU PRECEDENCIA.
//
// v1 sigue resolviendo con `resolveGeo` sin cambios; el motor de N niveles es solo de v2. Esta tabla
// fija lo que v1 dice hoy para que un cambio de SLT-45 (o de quien venga) no lo mueva sin verse:
// clave, texto exacto y el orden provincia → canton → distrito vacio → distrito → retirado → zona.
// Los literales van escritos a mano a proposito: importar las constantes de `geo-resolucion.ts`
// haria que la prueba cambiara junto con lo que prueba.

interface Mundo {
  provincias: ProvinciaRow[];
  cantones: CantonRow[];
  distritos: DistritoRow[];
}

const P = (id: string, nombre: string, disponible = true): ProvinciaRow => ({ id, nombre, disponible });
const C = (id: string, provinciaId: string, nombre: string, disponible = true): CantonRow => ({
  id,
  nombre,
  provinciaId,
  disponible,
});
const D = (id: string, cantonId: string, nombre: string, o: { zonaId?: string | null; disponible?: boolean } = {}): DistritoRow => ({
  id,
  nombre,
  cantonId,
  zonaId: o.zonaId === undefined ? "z1" : o.zonaId,
  esCentral: false,
  esZonaEspecial: false,
  disponible: o.disponible ?? true,
});

// Un mundo con un caso de cada mensaje. Los ambiguos son dos filas con el mismo nombre normalizado
// bajo el mismo padre, igual que los indices de la carga real.
const MUNDO: Mundo = {
  provincias: [
    P("p1", "Montaña"),
    P("p2", "Doble"),
    P("p3", "doble"),
    P("p4", "Retirada", false),
  ],
  cantones: [
    C("c1", "p1", "Río Claro"),
    C("c2", "p1", "Gemelo"),
    C("c3", "p1", "gemelo"),
    C("c4", "p1", "Cerrado", false),
    C("c5", "p4", "Bajo"),
  ],
  distritos: [
    D("d1", "c1", "Peñas"),
    D("d2", "c1", "Par"),
    D("d3", "c1", "par"),
    D("d4", "c1", "Llano", { disponible: false, zonaId: null }),
    D("d5", "c1", "Valle", { zonaId: null }),
    D("d6", "c4", "Cima"),
  ],
};

function resolver(terna: { provincia: string; canton: string; distrito: string }, m: Mundo = MUNDO) {
  return resolveGeo(
    terna,
    indexBy(m.provincias, (p) => normalize(p.nombre)),
    indexBy(m.cantones, (c) => `${c.provinciaId}::${normalize(c.nombre)}`),
    indexBy(m.distritos, (d) => `${d.cantonId}::${normalize(d.nombre)}`),
  );
}

const TABLA: { caso: string; terna: [string, string, string]; clave: string; mensaje: string }[] = [
  { caso: "provincia no encontrada", terna: ["Nada", "Río Claro", "Peñas"], clave: "provincia", mensaje: "provincia no encontrada" },
  { caso: "provincia ambigua", terna: ["Doble", "Río Claro", "Peñas"], clave: "provincia", mensaje: "provincia ambigua" },
  {
    caso: "provincia retirada",
    terna: ["Retirada", "Bajo", "Cualquiera"],
    clave: "provincia",
    mensaje: "la provincia esta retirada del catalogo",
  },
  {
    caso: "canton no encontrado",
    terna: ["Montaña", "Nada", "Peñas"],
    clave: "canton",
    mensaje: "canton no encontrado en la provincia",
  },
  { caso: "canton ambiguo", terna: ["Montaña", "Gemelo", "Peñas"], clave: "canton", mensaje: "canton ambiguo en la provincia" },
  { caso: "canton retirado", terna: ["Montaña", "Cerrado", "Cima"], clave: "canton", mensaje: "el canton esta retirado del catalogo" },
  {
    caso: "distrito vacio",
    terna: ["Montaña", "Río Claro", "   "],
    clave: "distrito",
    mensaje: "distrito requerido: la zona de la orden se deriva del distrito",
  },
  {
    caso: "distrito no encontrado",
    terna: ["Montaña", "Río Claro", "Nada"],
    clave: "distrito",
    mensaje: "distrito no encontrado en el canton",
  },
  { caso: "distrito ambiguo", terna: ["Montaña", "Río Claro", "Par"], clave: "distrito", mensaje: "distrito ambiguo en el canton" },
  {
    caso: "distrito retirado",
    terna: ["Montaña", "Río Claro", " Llano "],
    clave: "distrito",
    mensaje: "el distrito 'Llano' esta retirado del catalogo",
  },
  {
    caso: "distrito sin zona",
    terna: ["Montaña", "Río Claro", " Valle "],
    clave: "distrito",
    mensaje: "el distrito 'Valle' no tiene zona asignada",
  },
];

describe("SLT-45 R3 — los 11 mensajes de v1, con su clave", () => {
  it("la tabla tiene los 11 y ninguno repetido", () => {
    expect(TABLA).toHaveLength(11);
    expect(new Set(TABLA.map((t) => t.mensaje.replace(/'[^']*'/, "''"))).size).toBe(11);
  });

  it.each(TABLA)("$caso → { $clave: [$mensaje] }", ({ terna: [provincia, canton, distrito], clave, mensaje }) => {
    const r = resolver({ provincia, canton, distrito });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({ [clave]: [mensaje] });
  });

  it("con todo bien, resuelve (control positivo)", () => {
    const r = resolver({ provincia: " MONTANA ", canton: "rio  claro", distrito: "penas" });
    expect(r).toEqual({
      ok: true,
      geo: { provinciaId: "p1", cantonId: "c1", distritoId: "d1", zonaId: "z1", esCentral: false, esZonaEspecial: false },
    });
  });
});

describe("SLT-45 R3 — la precedencia: provincia, canton, distrito vacio, distrito, retirado, zona", () => {
  // Cada fila junta dos fallos; gana el que va antes en el orden de v1.
  const PRECEDENCIA: { caso: string; terna: [string, string, string]; gana: Record<string, string[]> }[] = [
    {
      caso: "provincia no encontrada gana a canton no encontrado y distrito vacio",
      terna: ["Nada", "Nada", ""],
      gana: { provincia: ["provincia no encontrada"] },
    },
    {
      caso: "provincia retirada gana a canton no encontrado",
      terna: ["Retirada", "Nada", "Nada"],
      gana: { provincia: ["la provincia esta retirada del catalogo"] },
    },
    {
      caso: "canton no encontrado gana a distrito vacio",
      terna: ["Montaña", "Nada", ""],
      gana: { canton: ["canton no encontrado en la provincia"] },
    },
    {
      caso: "canton retirado gana a distrito vacio",
      terna: ["Montaña", "Cerrado", ""],
      gana: { canton: ["el canton esta retirado del catalogo"] },
    },
    {
      caso: "distrito vacio va antes de buscar el distrito",
      terna: ["Montaña", "Río Claro", ""],
      gana: { distrito: ["distrito requerido: la zona de la orden se deriva del distrito"] },
    },
    {
      caso: "distrito retirado gana a sin zona",
      terna: ["Montaña", "Río Claro", "Llano"],
      gana: { distrito: ["el distrito 'Llano' esta retirado del catalogo"] },
    },
  ];

  it.each(PRECEDENCIA)("$caso", ({ terna: [provincia, canton, distrito], gana }) => {
    const r = resolver({ provincia, canton, distrito });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual(gana);
  });

  it("con provincia, canton y distrito retirados a la vez, gana la provincia", () => {
    const m: Mundo = {
      provincias: [P("p", "Uno", false)],
      cantones: [C("c", "p", "Dos", false)],
      distritos: [D("d", "c", "Tres", { disponible: false, zonaId: null })],
    };
    const r = resolver({ provincia: "Uno", canton: "Dos", distrito: "Tres" }, m);
    expect(r).toEqual({ ok: false, fieldErrors: { provincia: ["la provincia esta retirada del catalogo"] } });
  });

  it("solo sale una clave: el primer fallo para la resolucion", () => {
    const r = resolver({ provincia: "Nada", canton: "Nada", distrito: "Nada" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors)).toEqual(["provincia"]);
  });
});
