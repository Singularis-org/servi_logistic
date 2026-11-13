import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";

import { HOJAS_ETIQUETA, type HojaEtiqueta } from "@/lib/config/etiquetas-hoja";
import { datosDeEtiqueta, drawEtiqueta, geografiaLegible } from "@/lib/pdf/etiquetas-dibujo";
import { fuenteEtiqueta } from "@/lib/pdf/etiquetas-fuente";
import { registrarFuente } from "@/lib/pdf/etiquetas-fuente-registro";
import { crearLayout } from "@/lib/pdf/etiquetas-layout";
import type { EtiquetaGuiaDTO } from "@/lib/types/etiqueta-guia";

// SLT-125 (design §5 «Etiqueta con 10 niveles»; R9, R10) — LA LINEA DE GEOGRAFIA DE LA ETIQUETA A N NIVELES.
//
// La etiqueta (PDF y vista previa, que comparten `geografiaLegible`) une la zona y TODOS los nombres de la
// ruta (`lugarRuta`, del nivel 1 al lugar) con « / », sin tramos vacios. Sin `lugarRuta`, los tres
// nombres de hoy: en Costa Rica sale igual que antes. La maqueta de la etiqueta no cambia: una ruta de 10
// niveles se reparte en las lineas que ya tiene el bloque de destino.
//
// Los nombres de lugar de las rutas de 2, 4 y 10 niveles son inventados: ninguno es un tipo (R42).

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** El peor caso de direccion medido en produccion (887 etiquetas): 286 caracteres. */
const SEMILLA =
  "Del supermercado La Central de Barrio Escalante, doscientos metros al sur y ciento cincuenta al oeste, casa esquinera de dos plantas color verde agua con porton negro y tapia baja, frente al parqueo del taller de motos, entrada por el callejon sin salida contiguo a la panaderia. ";
const DIRECCION_PEOR_CASO = SEMILLA.repeat(2).slice(0, 286);

const paso = (nombre: string, i: number) => ({ id: `n-${i}`, nombre });

/** Diez nombres de 12 caracteres: con la zona, la linea de geografia sale de 153 caracteres. */
const DIEZ = "ABCDEFGHIJ".split("").map((letra) => `San Isidro ${letra}`);

function dto(over: Partial<EtiquetaGuiaDTO> = {}): EtiquetaGuiaDTO {
  return {
    ordenId: "ord-1",
    numGuia: 19887906,
    numRemision: "REM-2201",
    destinatario: "Jose Andres Pena",
    telefonoDest: "8888 7777",
    direccion: "Frente a la escuela",
    producto: "Caja x2",
    montoCobrar: 18000,
    tiendaNombre: "Tienda Rios",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    fechaCreacion: "2026-08-25",
    qrValue: "19887906",
    barcodeValue: "19887906",
    ...over,
  };
}

/** La linea de antes de SLT-125, escrita a mano (nunca con `geografiaLegible`). */
const LINEA_CR = "GAM / San José / Escazú / San Rafael";

describe("R9 — la etiqueta une la zona y toda la ruta con « / »", () => {
  it.each([
    ["2 niveles", ["Alfa", "Beta"]],
    ["3 niveles", ["Alfa", "Beta", "Gama"]],
    ["4 niveles", ["Alfa", "Beta", "Gama", "Delta"]],
    ["10 niveles", DIEZ],
  ])("%s", (_, nombres) => {
    const e = dto({ lugarRuta: nombres.map(paso) });
    expect(geografiaLegible(e)).toBe(["GAM", ...nombres].join(" / "));
    expect(datosDeEtiqueta(e).find((d) => d.id === "ubicacion")?.valor).toBe(["GAM", ...nombres].join(" / "));
  });

  it("omite los tramos vacios (zona vacia y un nombre vacio)", () => {
    expect(geografiaLegible(dto({ zonaNombre: "", lugarRuta: [paso("Alfa", 0), paso("", 1), paso("Gama", 2)] }))).toBe(
      "Alfa / Gama",
    );
  });

  it("una ruta vacia (lugar fuera del catalogo) deja solo la zona: no vuelve a los tres nombres", () => {
    expect(geografiaLegible(dto({ lugarRuta: [] }))).toBe("GAM");
  });
});

describe("R10 — Costa Rica: la linea sale igual que antes", () => {
  it("sin `lugarRuta`, los tres nombres de hoy", () => {
    expect(geografiaLegible(dto())).toBe(LINEA_CR);
  });

  it("con la ruta del catalogo, la misma linea", () => {
    const ruta = [paso("San José", 0), paso("Escazú", 1), paso("San Rafael", 2)];
    expect(geografiaLegible(dto({ lugarRuta: ruta }))).toBe(LINEA_CR);
  });

  it("sin distrito, sin el tramo vacio", () => {
    expect(geografiaLegible(dto({ distritoNombre: null }))).toBe("GAM / San José / Escazú");
    expect(geografiaLegible(dto({ lugarRuta: [paso("San José", 0), paso("Escazú", 1)] }))).toBe("GAM / San José / Escazú");
  });
});

describe("design §5 — una ruta de 10 niveles cabe en la maqueta de siempre", () => {
  function emite(hoja: HojaEtiqueta, e: EtiquetaGuiaDTO): boolean {
    const doc = new jsPDF({ unit: "mm", format: [hoja.anchoMm, hoja.altoMm] });
    registrarFuente(doc, fuenteEtiqueta);
    try {
      drawEtiqueta(doc, crearLayout(hoja), e, { qr: PNG_1X1, barcode: PNG_1X1 }, fuenteEtiqueta);
      return true;
    } catch {
      return false;
    }
  }

  it("la linea de 10 niveles es larga de verdad (mas de 150 caracteres)", () => {
    expect(geografiaLegible(dto({ lugarRuta: DIEZ.map(paso) })).length).toBeGreaterThan(150);
  });

  it.each(HOJAS_ETIQUETA.map((h) => [h.id, h] as const))(
    "%s: 10 niveles con la direccion del peor caso de produccion (286) se imprime",
    (_, hoja) => {
      expect(emite(hoja, dto({ lugarRuta: DIEZ.map(paso), direccion: DIRECCION_PEOR_CASO }))).toBe(true);
    },
    60_000,
  );

  it("contraprueba: la medida es real, una direccion desmesurada con 10 niveles no cabe en 100x100", () => {
    const hoja = HOJAS_ETIQUETA.find((h) => h.id === "100x100")!;
    expect(emite(hoja, dto({ lugarRuta: DIEZ.map(paso), direccion: SEMILLA.repeat(4) }))).toBe(false);
  });
});
