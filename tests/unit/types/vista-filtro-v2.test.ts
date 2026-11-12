import { describe, expect, it } from "vitest";

import {
  deV1,
  guardarVistaFiltroSchema,
  leerPayloadGuardado,
  VERSIONES_LEGIBLES,
  VISTA_FILTRO_VERSION,
  vistaFiltroPayloadSchema,
  type VistaFiltroPayloadV1,
} from "@/lib/types/vista-filtro";

// SLT-47 (T3.1; R22–R24; design §4.3) — las vistas guardadas pasan a la version 2; las de la version 1
// se traducen al leerlas, sin escribir nada.

const V1: VistaFiltroPayloadV1 = {
  v: 1,
  termino: "guia",
  activos: ["zona_id", "provincia_id", "canton_id", "distrito_id", "status_id"],
  seleccion: { zona_id: ["z1"], provincia_id: ["p1"], canton_id: ["c1", "c2"], distrito_id: ["d1"], status_id: ["s1"] },
};

describe("SLT-47 R22 — se guarda en la version 2", () => {
  it("la version vigente es 2 y el esquema de guardar solo acepta `v: 2`", () => {
    expect(VISTA_FILTRO_VERSION).toBe(2);
    const filtro = { v: 2, termino: "", activos: ["nivel_2"], seleccion: { nivel_2: ["c1"] } };
    expect(guardarVistaFiltroSchema.safeParse({ superficie: "ordenes", nombre: "x", filtro }).success).toBe(true);
    expect(guardarVistaFiltroSchema.safeParse({ superficie: "ordenes", nombre: "x", filtro: { ...filtro, v: 1 } }).success).toBe(false);
  });
});

describe("SLT-47 R23 — una vista v1 se lee como v2", () => {
  it("cada clave de lugar vieja pasa a la de su nivel, en la seleccion y en los controles; el resto igual", () => {
    expect(deV1(V1)).toEqual({
      v: 2,
      termino: "guia",
      activos: ["zona_id", "nivel_1", "nivel_2", "nivel_3", "status_id"],
      seleccion: { zona_id: ["z1"], nivel_1: ["p1"], nivel_2: ["c1", "c2"], nivel_3: ["d1"], status_id: ["s1"] },
    });
  });

  it("`leerPayloadGuardado` traduce la v1 (tambien venida de la base como JSON) y da un v2 valido", () => {
    const leida = leerPayloadGuardado(JSON.parse(JSON.stringify(V1)));
    expect(leida).toEqual(deV1(V1));
    expect(vistaFiltroPayloadSchema.safeParse(leida).success).toBe(true);
  });

  it("una v1 sin claves de lugar sale igual, salvo la version", () => {
    const sinLugar: VistaFiltroPayloadV1 = { v: 1, termino: "", activos: ["zona_id"], seleccion: { zona_id: ["z1"] } };
    expect(leerPayloadGuardado(sinLugar)).toEqual({ ...sinLugar, v: 2 });
  });

  it("traducir no muta el documento leido (no se reescribe nada)", () => {
    const copia = JSON.parse(JSON.stringify(V1));
    deV1(copia);
    expect(copia).toEqual(V1);
  });

  it("una v2 se lee tal cual", () => {
    const v2 = { v: 2, termino: "", activos: ["nivel_3"], seleccion: { nivel_3: ["d1"] } };
    expect(leerPayloadGuardado(v2)).toEqual(v2);
  });
});

describe("SLT-47 R24 — otra version, o un documento que no cumple su esquema, sale ilegible", () => {
  it("solo se leen la 1 y la 2", () => {
    expect([...VERSIONES_LEGIBLES].sort()).toEqual([1, 2]);
    expect(leerPayloadGuardado({ ...V1, v: 3 })).toBeNull();
    expect(leerPayloadGuardado({ ...V1, v: 0 })).toBeNull();
  });

  it("una v1 o una v2 rotas devuelven `null`, no una lectura parcial", () => {
    expect(leerPayloadGuardado({ v: 1, termino: 5 })).toBeNull();
    expect(leerPayloadGuardado({ ...V1, sobra: true })).toBeNull();
    expect(leerPayloadGuardado({ v: 2, termino: "", activos: [], seleccion: { x: [1] } })).toBeNull();
  });
});
