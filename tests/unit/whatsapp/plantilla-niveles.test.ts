import { describe, expect, it } from "vitest";

import {
  CAMPOS_PLANTILLA,
  CAMPOS_PLANTILLA_OFRECIDOS,
  CAMPOS_PLANTILLA_POR_CLAVE,
  CLAVES_OCULTAS_EN_SELECTOR,
  DATOS_PLANTILLA_EJEMPLO,
  resolverValoresPlantilla,
  valorDeCampo,
  type DatosPlantilla,
} from "@/lib/types/plantilla-datos";
import { clavesSinCampo, extraerVariables, previewConEjemplos, renderPlantilla } from "@/lib/utils/plantilla-mensaje";
import { datosPlantillaDesdeAsignacion } from "@/lib/utils/whatsapp-envio-valores";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { datosPlantillaFixture } from "@/tests/fixtures/plantilla-datos";

// SLT-125 (design §4.6; R28, R29, R31) — LAS VARIABLES DE LUGAR DE LAS PLANTILLAS A N NIVELES.
//
// `{{provincia}}`, `{{canton}}` y `{{distrito}}` siguen siendo los niveles 1, 2 y 3 de la ruta; se suman
// `{{nivel_1}}`…`{{nivel_10}}` y `{{ubicacion}}` (P3: del mas hondo al nivel 1, «, », sin zona). Los
// paises de 2, 4 y 10 niveles son inventados: lo que se prueba es la forma.

const ruta = (...nombres: string[]) => nombres.map((nombre, i) => ({ id: `n${i + 1}`, nombre }));

function conRuta(lugarRuta: { nombre: string }[] | null, orden: Partial<DatosPlantilla["orden"]> = {}) {
  return datosPlantillaFixture({ orden: { ...orden, lugarRuta } });
}

const resolver = (cuerpo: string, datos: DatosPlantilla) =>
  renderPlantilla(cuerpo, resolverValoresPlantilla(extraerVariables(cuerpo), datos));

// Las claves de lugar de hoy, como estaban antes de SLT-125.
const CLAVES_DE_HOY = ["provincia", "canton", "distrito"] as const;

describe("R28 — provincia, canton y distrito son los niveles 1, 2 y 3 de la ruta", () => {
  it("con ruta, salen de ella aunque los nombres viejos digan otra cosa", () => {
    const d = conRuta(ruta("Region Sur", "Comuna Uno", "Barrio Alto"), {
      provinciaNombre: "viejo-1",
      cantonNombre: "viejo-2",
      distritoNombre: "viejo-3",
    });
    expect(valorDeCampo("provincia", d)).toBe("Region Sur");
    expect(valorDeCampo("canton", d)).toBe("Comuna Uno");
    expect(valorDeCampo("distrito", d)).toBe("Barrio Alto");
  });

  it("vacios si la ruta no llega (país de 2 niveles, ruta vacia)", () => {
    const dos = conRuta(ruta("Norte", "Villa Alta"));
    expect(valorDeCampo("provincia", dos)).toBe("Norte");
    expect(valorDeCampo("canton", dos)).toBe("Villa Alta");
    expect(valorDeCampo("distrito", dos)).toBe("");
    const vacia = conRuta([]);
    for (const clave of CLAVES_DE_HOY) expect(valorDeCampo(clave, vacia)).toBe("");
  });

  it("sin ruta (`null`), caen a los nombres de hoy", () => {
    const d = conRuta(null, { provinciaNombre: "San José", cantonNombre: "Escazú", distritoNombre: null });
    expect(valorDeCampo("provincia", d)).toBe("San José");
    expect(valorDeCampo("canton", d)).toBe("Escazú");
    expect(valorDeCampo("distrito", d)).toBe("");
  });

  it("ninguna clave de hoy deja de resolver ni pasa a `clavesSinCampo`", () => {
    // Las 42 claves de antes de SLT-125: el catalogo de hoy menos las 11 nuevas.
    const nuevas = new Set(["ubicacion", ...Array.from({ length: 10 }, (_, i) => `nivel_${i + 1}`)]);
    const deHoy = CAMPOS_PLANTILLA.map((c) => c.clave).filter((c) => !nuevas.has(c));
    expect(deHoy).toHaveLength(42);
    for (const clave of deHoy) expect(CAMPOS_PLANTILLA_POR_CLAVE.has(clave)).toBe(true);
    expect(clavesSinCampo(deHoy.map((c) => `{{${c}}}`).join(" "), {})).toEqual([]);
    // Las de lugar siguen ocultas en el selector, y resolviendo.
    for (const clave of CLAVES_DE_HOY) expect(CLAVES_OCULTAS_EN_SELECTOR.has(clave)).toBe(true);
  });
});

describe("R29 — nivel_1..nivel_10 y ubicacion", () => {
  it("el catalogo suma nivel_1..nivel_10, con su atributo `nivel`, y ubicacion", () => {
    for (let k = 1; k <= 10; k++) {
      const campo = CAMPOS_PLANTILLA_POR_CLAVE.get(`nivel_${k}`);
      expect(campo?.nivel).toBe(k);
      expect(campo?.ocultoEnSelector).toBeUndefined();
    }
    expect(CAMPOS_PLANTILLA_POR_CLAVE.has("ubicacion")).toBe(true);
    expect(clavesSinCampo("{{ubicacion}} {{nivel_1}} {{nivel_10}}", {})).toEqual([]);
    expect(CAMPOS_PLANTILLA_POR_CLAVE.has("nivel_11")).toBe(false);
  });

  it("ubicacion se ofrece en el selector; los nivel_k no (los pone el selector segun el pais)", () => {
    const ofrecidas = CAMPOS_PLANTILLA_OFRECIDOS.map((c) => c.clave);
    expect(ofrecidas).toContain("ubicacion");
    expect(ofrecidas.filter((c) => c.startsWith("nivel_"))).toEqual([]);
    expect(CLAVES_OCULTAS_EN_SELECTOR.size).toBe(27);
  });

  it.each([
    ["2 niveles", ["Norte", "Villa Alta"]],
    ["4 niveles (ruta de 3, P1)", ["Region Sur", "Comuna Uno", "Barrio Alto"]],
    ["10 niveles", Array.from({ length: 10 }, (_, i) => `L${i + 1}`)],
  ])("%s: nivel_k es el nombre del nivel k, vacio donde la ruta no llega", (_caso, nombres) => {
    const d = conRuta(ruta(...nombres));
    for (let k = 1; k <= 10; k++) {
      expect(valorDeCampo(`nivel_${k}`, d)).toBe(nombres[k - 1] ?? "");
    }
    expect(valorDeCampo("ubicacion", d)).toBe([...nombres].reverse().join(", "));
  });

  it("ubicacion: del mas hondo al nivel 1, sin la zona y sin tramos vacios", () => {
    const d = conRuta([{ nombre: "Region Sur" }, { nombre: "  " }, { nombre: "Barrio Alto" }], {
      zonaNombre: "GAM Norte",
    });
    expect(valorDeCampo("ubicacion", d)).toBe("Barrio Alto, Region Sur");
    expect(valorDeCampo("ubicacion", conRuta([]))).toBe("");
  });

  it("los datos de ejemplo resuelven ubicacion a «Carmen, San José, San José»; nivel_4..10 sin ejemplo", () => {
    expect(valorDeCampo("ubicacion", DATOS_PLANTILLA_EJEMPLO)).toBe("Carmen, San José, San José");
    expect(CAMPOS_PLANTILLA_POR_CLAVE.get("ubicacion")?.ejemplo).toBe("Carmen, San José, San José");
    expect(previewConEjemplos("{{ubicacion}}")).toBe("Carmen, San José, San José");
    expect(["nivel_1", "nivel_2", "nivel_3"].map((c) => CAMPOS_PLANTILLA_POR_CLAVE.get(c)?.ejemplo)).toEqual([
      "San José",
      "San José",
      "Carmen",
    ]);
    for (let k = 4; k <= 10; k++) {
      expect(CAMPOS_PLANTILLA_POR_CLAVE.get(`nivel_${k}`)?.ejemplo).toBe("");
      expect(valorDeCampo(`nivel_${k}`, DATOS_PLANTILLA_EJEMPLO)).toBe("");
    }
  });
});

describe("R31 — Costa Rica: un cuerpo con las claves de hoy produce el mismo texto que hoy", () => {
  const CUERPO = "Hola {{cliente}}, tu pedido va a {{distrito}}, {{canton}}, {{provincia}} ({{zona}}).";
  // El texto de hoy, literal, con los nombres de la orden de CR.
  const HOY = "Hola Juan Perez, tu pedido va a Carmen, San José, San José (GAM Norte).";

  it("en el envio: con la ruta del catalogo, igual que con los tres nombres de hoy", () => {
    const deHoy = conRuta(null, { provinciaNombre: "San José", cantonNombre: "San José", distritoNombre: "Carmen" });
    const conCatalogo = conRuta(ruta("San José", "San José", "Carmen"), {
      provinciaNombre: "San José",
      cantonNombre: "San José",
      distritoNombre: "Carmen",
    });
    expect(resolver(CUERPO, deHoy)).toBe(HOY);
    expect(resolver(CUERPO, conCatalogo)).toBe(HOY);
  });

  it("orden de CR sin distrito: igual que hoy (el distrito sale vacio)", () => {
    const deHoy = conRuta(null, { provinciaNombre: "San José", cantonNombre: "San José", distritoNombre: null });
    const conCatalogo = conRuta(ruta("San José", "San José"), { distritoNombre: null });
    expect(resolver(CUERPO, conCatalogo)).toBe(resolver(CUERPO, deHoy));
    expect(resolver(CUERPO, conCatalogo)).toBe("Hola Juan Perez, tu pedido va a , San José, San José (GAM Norte).");
  });

  it("en la vista previa: los datos de ejemplo dan el texto de hoy", () => {
    expect(previewConEjemplos("{{distrito}}, {{canton}}, {{provincia}}")).toBe("Carmen, San José, San José");
  });

  it("en la vista previa del mensajero: la ruta del DTO llega a las variables", () => {
    const dto = {
      id: "o1",
      numGuia: 1,
      numRemision: "R1",
      estatusValue: "en_reparto",
      destinatario: "Juan Perez",
      telefonoDest: "88887777",
      direccion: "Calle 1",
      producto: "caja",
      peso: null,
      notas: null,
      montoCobrar: null,
      latitud: null,
      longitud: null,
      tiendaNombre: null,
      zonaNombre: "GAM Norte",
      provinciaNombre: "San José",
      cantonNombre: "San José",
      distritoNombre: "Carmen",
      lugarRuta: ruta("San José", "San José", "Carmen"),
      sinpeNumero: "",
      sinpeNombre: "",
    } as unknown as MiAsignacionDTO;
    const d = datosPlantillaDesdeAsignacion(dto);
    expect(resolver(CUERPO, d)).toBe(HOY);
    expect(valorDeCampo("ubicacion", d)).toBe("Carmen, San José, San José");
    expect(valorDeCampo("nivel_3", d)).toBe("Carmen");
  });
});
