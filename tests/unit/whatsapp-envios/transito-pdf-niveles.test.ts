import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { fuentesDePagina, objetos, paginas, textoLegible, textosDePagina } from "../pdf/pdf-inspector";
import { NIVELES_CR, rutaDeCR } from "../../fixtures/transito-ruta";
import { clasificar } from "@/lib/whatsapp-envios/informes/transito/calculo";
import { pdfInformeTransito } from "@/lib/whatsapp-envios/informes/transito/pdf";
import { PARAMETROS_POR_DEFECTO, type ZonaInforme } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { FilaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";
import type { NivelDelPais, Ruta } from "@/lib/utils/ubicacion-presentacion";

// SLT-125 (T2.6) — R13 y R15 (parte del PDF): la columna de lugar del informe de transito se titula con
// los tipos de los dos niveles mas hondos que puede tener una orden del pais, en mayusculas y unidos por
// « · », y cada celda pinta esos dos niveles de la ruta de la orden (P7 opcion a). Se lee el texto del
// PDF REAL con el /ToUnicode que declara (la fuente embebida escribe en Identity-H).

const UN_DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-10-05T11:00:00.000Z");
const GAM: ZonaInforme = { id: randomUUID(), nombre: "GAM", esCentral: true };

function leerTodo(bytes: Uint8Array): string[] {
  const n = paginas(objetos(bytes)).length;
  return Array.from({ length: n }, (_, i) => {
    const fuentes = fuentesDePagina(bytes, i);
    return textosDePagina(bytes, i).map((t) => textoLegible(t, fuentes.get(t.fuenteRes)));
  }).flat();
}

function fila(numRemision: string, ruta: Ruta, niveles: readonly NivelDelPais[]): FilaTransito {
  return {
    ordenId: randomUUID(),
    numRemision,
    numGuia: 48000,
    estado: "en_reparto",
    zonaId: GAM.id,
    destinatario: "Cliente",
    canton: ruta[1]?.nombre ?? "",
    distrito: ruta[2]?.nombre ?? null,
    ruta,
    niveles,
    montoCobrar: "1000.00",
    hitoAt: new Date(AHORA.getTime() - 12 * UN_DIA),
    ultimaTransicionAt: new Date(AHORA.getTime() - UN_DIA),
  };
}

function textoDelPdf(filas: FilaTransito[]): string[] {
  return leerTodo(pdfInformeTransito(clasificar(filas, [GAM], PARAMETROS_POR_DEFECTO, AHORA, 0)));
}

/** El texto de la celda de lugar de la fila `remision` (6ª columna, tras remision, guia, dias, estado y cliente). */
function celdaDeLugar(todo: string[], remision: string): string {
  return todo[todo.indexOf(remision) + 5];
}

const paso = (nombre: string): Ruta[number] => ({ id: randomUUID(), nombre });

describe("SLT-125 R15 — Costa Rica: el PDF de transito se ve como hoy", () => {
  const todo = textoDelPdf([
    fila("CR-1", rutaDeCR("San José", "Hatillo"), NIVELES_CR),
    fila("CR-2", rutaDeCR("Heredia", null), NIVELES_CR),
  ]);

  it("titula la columna «CANTÓN · DISTRITO»", () => {
    expect(todo).toContain("CANTÓN · DISTRITO");
  });

  it("con distrito, «San José · Hatillo»; sin distrito, solo el canton (P7 opcion a)", () => {
    expect(celdaDeLugar(todo, "CR-1")).toBe("San José · Hatillo");
    expect(celdaDeLugar(todo, "CR-2")).toBe("Heredia");
  });
});

describe("SLT-125 R13 — el titulo y la celda salen de los niveles del pais", () => {
  it("pais de 4 niveles: «COMUNA · BARRIO» y los niveles 2·3 de la ruta (hasta SLT-48)", () => {
    const niveles: NivelDelPais[] = [
      { profundidad: 1, singular: "Región" },
      { profundidad: 2, singular: "Comuna" },
      { profundidad: 3, singular: "Barrio" },
      { profundidad: 4, singular: "Manzana" },
    ];
    const todo = textoDelPdf([fila("P4-1", [paso("Metropolitana"), paso("Ñuñoa"), paso("Villa Olímpica")], niveles)]);
    expect(todo).toContain("COMUNA · BARRIO");
    expect(todo).not.toContain("CANTÓN · DISTRITO");
    expect(celdaDeLugar(todo, "P4-1")).toBe("Ñuñoa · Villa Olímpica");
  });

  it("pais de 2 niveles: los tipos y los nombres de los niveles 1·2", () => {
    const niveles: NivelDelPais[] = [
      { profundidad: 1, singular: "Departamento" },
      { profundidad: 2, singular: "Municipio" },
    ];
    const todo = textoDelPdf([fila("P2-1", [paso("Antioquia"), paso("Envigado")], niveles)]);
    expect(todo).toContain("DEPARTAMENTO · MUNICIPIO");
    expect(celdaDeLugar(todo, "P2-1")).toBe("Antioquia · Envigado");
  });

  it("pais de 3 niveles con otros tipos: no queda ningun texto de nivel de Costa Rica", () => {
    const niveles: NivelDelPais[] = [
      { profundidad: 1, singular: "Estado" },
      { profundidad: 2, singular: "Municipio" },
      { profundidad: 3, singular: "Colonia" },
    ];
    const todo = textoDelPdf([fila("P3-1", [paso("Jalisco"), paso("Zapopan"), paso("Centro")], niveles)]);
    expect(todo).toContain("MUNICIPIO · COLONIA");
    expect(todo.some((t) => /CANTÓN|DISTRITO/.test(t))).toBe(false);
    expect(celdaDeLugar(todo, "P3-1")).toBe("Zapopan · Centro");
  });

  it("una orden cuya ruta no llega al nivel mas hondo pinta solo el que tiene (P7 opcion a)", () => {
    const niveles: NivelDelPais[] = [
      { profundidad: 1, singular: "Región" },
      { profundidad: 2, singular: "Comuna" },
      { profundidad: 3, singular: "Barrio" },
      { profundidad: 4, singular: "Manzana" },
    ];
    const todo = textoDelPdf([fila("P4-2", [paso("Metropolitana"), paso("Ñuñoa")], niveles)]);
    expect(celdaDeLugar(todo, "P4-2")).toBe("Ñuñoa");
  });
});
