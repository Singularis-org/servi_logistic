import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MARCA_FACTURA } from "@/lib/config/marca";
import { monedaConfig } from "@/lib/config/moneda";
import { construirPdfFactura, type LogoDelPdf } from "@/lib/facturas-plataforma/pdf";
import { COLORES, MEDIDAS } from "@/lib/facturas-plataforma/pdf-comun";
import { importeDocumento as imp, resumirFactura } from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura, MovimientoDeFactura } from "@/lib/types/factura-plataforma";
import { cuota, datosDescarga, enPlataforma, factura, movimiento } from "../../components/_facturas-plataforma";
import { contenidoDePagina, imagenesDePagina, objetos, paginas } from "../pdf/pdf-inspector";
import { PT, leerPdf, mismoColor, rectangulosConColor, tras } from "./_pdf-leido";

// SLT-199 (T2.1) — R8–R14 y R26 sobre el PDF REAL de la factura: el texto se lee con la fuente que declara el propio
// documento (la embebida escribe en Identity-H y un grep no lo vería) y los colores del content stream.

const RAIZ = path.resolve(__dirname, "../../..");
const LOGO: LogoDelPdf = new Uint8Array(readFileSync(path.join(RAIZ, "public", MARCA_FACTURA.logo.ruta)));
const EMPRESA = "Mensajería Ñandú S.A.";
const { simbolo: S, separadorDecimal: D } = monedaConfig;

function pdfDe(datos: DatosDescargaFactura, logo: LogoDelPdf | null = LOGO) {
  return leerPdf(construirPdfFactura(datos, resumirFactura(datos), logo));
}

const SIN_MOVIMIENTOS = datosDescarga({
  factura: factura({ cargos: "0.00", reversos: "0.00", totalOrdenes: "0.00", movimientos: 0, total: "0.00" }),
  movimientos: [],
});

describe("SLT-199 R8 — A4 vertical, banda con logo y barra degradada", () => {
  const { bytes, textos } = pdfDe(datosDescarga());

  it("todas las páginas son A4 vertical", () => {
    for (const p of paginas(objetos(bytes))) {
      const caja = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(p.dict);
      expect(Number(caja![1])).toBeCloseTo(595.28, 1);
      expect(Number(caja![2])).toBeCloseTo(841.89, 1);
    }
  });

  it("logo a la izquierda y, a la derecha, «FACTURA DE PLATAFORMA», el número y el cliente", () => {
    expect(imagenesDePagina(bytes, 0)).toHaveLength(1);
    expect(textos[0].slice(0, 3)).toEqual(["FACTURA DE PLATAFORMA", "Factura N.º 1", `Cliente: ${EMPRESA}`]);
    expect(textos[0]).not.toContain(MARCA_FACTURA.emisor);
  });

  it("la barra degradada bajo la banda", () => {
    const tiras = rectangulosConColor(contenidoDePagina(bytes, 0)).filter((r) => Math.abs(r.h - MEDIDAS.altoBarra * PT) < 0.01);
    expect(tiras).toHaveLength(MEDIDAS.tiras);
  });

  it("R6: sin logo, «Singularis» en texto y el PDF se genera igual", () => {
    for (const logo of [null, new Uint8Array([1, 2, 3, 4])]) {
      const sin = pdfDe(datosDescarga(), logo);
      expect(imagenesDePagina(sin.bytes, 0)).toHaveLength(0);
      expect(sin.textos[0]).toEqual(expect.arrayContaining([MARCA_FACTURA.emisor, "Factura N.º 1"]));
    }
  });
});

describe("SLT-199 R9 — seis tarjetas en dos columnas y tres filas", () => {
  const { pags, textos } = pdfDe(datosDescarga());
  const p1 = textos[0];
  const etiquetas = ["CLIENTE", "ESTADO", "PERÍODO FACTURADO", "FECHA DE EMISIÓN (CIERRE)", "PERIODICIDAD", "PLAN"];

  it("los valores de SLT-136, con el estado «Emitida»", () => {
    expect(tras(p1, "CLIENTE")).toEqual([EMPRESA]);
    expect(tras(p1, "ESTADO")).toEqual(["Emitida"]);
    expect(tras(p1, "PERÍODO FACTURADO")).toEqual(["16/11/2026 al 30/11/2026"]);
    expect(tras(p1, "FECHA DE EMISIÓN (CIERRE)")).toEqual(["01/12/2026"]);
    expect(tras(p1, "PERIODICIDAD")).toEqual(["Quincenal"]);
    expect(tras(p1, "PLAN")).toEqual(["Crecer · sin cuota de plan"]);
  });

  it("en este orden: dos columnas (x) y tres filas (y), el valor en negrita", () => {
    const pos = etiquetas.map((e) => pags[0].find((t) => t.texto === e)!);
    expect(new Set(pos.map((t) => t.x.toFixed(1))).size).toBe(2);
    expect(new Set(pos.map((t) => t.y.toFixed(1))).size).toBe(3);
    for (let i = 0; i < 6; i += 2) {
      expect(pos[i].y).toBeCloseTo(pos[i + 1].y, 1);
      expect(pos[i].x).toBeLessThan(pos[i + 1].x);
    }
    expect(pos[0].y).toBeGreaterThan(pos[2].y);
    expect(pos[2].y).toBeGreaterThan(pos[4].y);
    expect(pags[0].find((t) => t.texto === "Emitida")?.fuente).toBe("Helvetica-Bold");
  });

  it("sin plan, «Sin plan asignado · sin cuota de plan»; con cuota, el plan solo", () => {
    expect(tras(pdfDe(datosDescarga({ factura: factura({ plan: null }) })).textos[0], "PLAN")).toEqual([
      "Sin plan asignado · sin cuota de plan",
    ]);
    const conCuota = factura({ cuota: cuota(), total: "1300.00", periodicidad: "mensual" });
    const otra = pdfDe(datosDescarga({ factura: conCuota })).textos[0];
    expect(tras(otra, "PLAN")).toEqual(["Crecer"]);
    expect(tras(otra, "PERIODICIDAD")).toEqual(["Mensual"]);
  });
});

describe("SLT-199 R10, R11, R14, R26 — Resumen con tarifa, TOTAL A PAGAR y la nota", () => {
  const conCuotas = factura({
    cargos: "600.00",
    cuota: cuota({ cuota: "1000.00" }),
    primeraCuota: cuota({ cuota: "234.56" }),
    total: "1534.56",
  });
  const { bytes, pags, textos } = pdfDe(datosDescarga({ factura: conCuotas }));
  const p1 = textos[0];
  const de = (t: string) => pags[0].filter((x) => x.texto === t);

  it("R10: Concepto · Cantidad · Tarifa · Importe", () => {
    expect(tras(p1, "Concepto", 3)).toEqual(["Cantidad", "Tarifa", "Importe"]);
  });

  it("R10, R14: las cuatro filas con los conteos y los importes de la base, en formato de documento", () => {
    expect(tras(p1, "Cargos por orden", 3)).toEqual(["2", `${S}300${D}00`, `${S}600${D}00`]);
    expect(tras(p1, "Reversos de cargos", 3)).toEqual(["1", imp("300.00"), `-${S}300${D}00`]);
    expect(tras(p1, "Total órdenes", 2)).toEqual(["1", imp("300.00")]);
    expect(tras(p1, "Cuota del plan", 3)).toEqual(["—", "—", imp("1234.56")]);
  });

  it("R10: el importe de los reversos en rojo, la tarifa no", () => {
    const reverso = de(`-${S}300${D}00`);
    expect(reverso).toHaveLength(1);
    expect(mismoColor(reverso[0].color, COLORES.rojo)).toBe(true);
    expect(de(imp("300.00")).every((t) => !mismoColor(t.color, COLORES.rojo))).toBe(true);
  });

  it("R10: «Total órdenes» en negrita con un filete violeta encima", () => {
    const fila = de("Total órdenes")[0];
    expect(fila.fuente).toBe("Helvetica-Bold");
    const filete = rectangulosConColor(contenidoDePagina(bytes, 0)).filter(
      (r) => mismoColor(r.color, COLORES.violeta) && Math.abs(r.h - 0.53 * PT) < 0.01,
    );
    expect(filete).toHaveLength(1);
    expect(filete[0].y).toBeGreaterThan(fila.y);
    expect(filete[0].y - fila.y).toBeLessThan(MEDIDAS.filaAmplia.alto * PT);
  });

  it("R11: banda «TOTAL A PAGAR» con el total de la base sin redondear", () => {
    expect(tras(p1, "TOTAL A PAGAR")).toEqual([`${S}1 534${D}56`]);
  });

  it("R11, R26: la nota con movimientos, tarifa única y la moneda de la configuración, en ese orden", () => {
    expect(p1.join(" ")).toContain(
      `Movimientos en total: 3. Los cargos y reversos se cobran a ${S}300${D}00 por orden. ` +
        `Montos en ${monedaConfig.currency} (${S}).`,
    );
  });

  it("R26: con valores distintos la tarifa es «Varias» y la nota lo dice", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "500.00", reversos: "300.00", totalOrdenes: "200.00", total: "200.00" }),
      movimientos: [
        movimiento({ id: "1", valor: "200.00" }),
        movimiento({ id: "2", valor: "300.00" }),
        movimiento({ id: "3", tipo: "reverso", valor: "-300.00" }),
      ],
    });
    const p = pdfDe(datos).textos[0];
    expect(tras(p, "Cargos por orden", 2)).toEqual(["2", "Varias"]);
    expect(p.join(" ")).toContain("Movimientos en total: 3. Los cargos y reversos se cobran con varias tarifas por orden. Montos en");
  });

  it("R26: sin movimientos, la tarifa es «—» y la nota no la cita", () => {
    const p = pdfDe(SIN_MOVIMIENTOS).textos[0];
    expect(tras(p, "Cargos por orden", 3)).toEqual(["0", "—", imp("0.00")]);
    expect(p.join(" ")).toContain(`Movimientos en total: 0. Montos en ${monedaConfig.currency}`);
    expect(p.join(" ")).not.toContain("se cobran");
  });
});

describe("SLT-199 R12 — el desglose por día en página nueva", () => {
  const { pags, textos } = pdfDe(datosDescarga());

  it("empieza en la página 2 con sus columnas", () => {
    expect(textos[0]).not.toContain("Desglose por día");
    expect(tras(textos[1], "Desglose por día", 5)).toEqual(["Día", "Cargos", "Reversos", "Órdenes netas", "Importe neto"]);
  });

  it("una fila por día, la fila Total en negrita y la nota que remite al anexo", () => {
    const p2 = textos[1];
    expect(tras(p2, "17/11/2026", 4)).toEqual(["1", "0", "1", imp("300.00")]);
    expect(tras(p2, "18/11/2026", 4)).toEqual(["1", "1", "0", imp("0.00")]);
    expect(tras(p2, "Total", 4)).toEqual(["2", "1", "1", imp("300.00")]);
    expect(pags[1].find((t) => t.texto === "Total")?.fuente).toBe("Helvetica-Bold");
    expect(p2.join(" ")).toContain(
      `El detalle completo de los 3 movimientos va en el anexo «Factura 1 · ${EMPRESA} · Detalle de movimientos».`,
    );
    expect(p2.some((t) => t.includes("Excel"))).toBe(false);
  });

  it("órdenes netas negativas y el importe neto negativo en rojo", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "300.00", reversos: "300.00", totalOrdenes: "0.00", movimientos: 2, total: "0.00" }),
      movimientos: [
        movimiento({ id: "1", instante: enPlataforma("2026-11-17", "08:00") }),
        movimiento({ id: "2", instante: enPlataforma("2026-11-19", "08:00"), tipo: "reverso", valor: "-300.00" }),
      ],
    });
    const p2 = pdfDe(datos).pags[1];
    expect(tras(p2.map((t) => t.texto), "19/11/2026", 4)).toEqual(["0", "1", "-1", `-${S}300${D}00`]);
    expect(mismoColor(p2.find((t) => t.texto === `-${S}300${D}00`)!.color, COLORES.rojo)).toBe(true);
  });

  it("R4: las cantidades de la fila Total con espacio de miles («2 365»)", () => {
    const movs = Array.from({ length: 2365 }, (_, i) => movimiento({ id: `m${i}`, valor: "1.00" }));
    const datos = datosDescarga({
      factura: factura({ cargos: "2365.00", reversos: "0.00", totalOrdenes: "2365.00", movimientos: 2365, total: "2365.00" }),
      movimientos: movs,
    });
    const p2 = pdfDe(datos).textos[1];
    expect(tras(p2, "Total", 4)).toEqual(["2 365", "0", "2 365", `${S}2 365${D}00`]);
    expect(p2.join(" ")).toContain("de los 2 365 movimientos");
  });

  it("sin movimientos: «Sin movimientos en el período» y el Total en cero", () => {
    const p2 = pdfDe(SIN_MOVIMIENTOS).textos[1];
    expect(p2).toContain("Sin movimientos en el período");
    expect(tras(p2, "Total", 4)).toEqual(["0", "0", "0", imp("0.00")]);
  });
});

describe("SLT-199 R5, R13 — paginación y pie", () => {
  // 60 días con un cargo cada uno, del 1/10 al 29/11.
  const movs: MovimientoDeFactura[] = Array.from({ length: 60 }, (_, i) =>
    movimiento({
      id: `m-${String(i).padStart(2, "0")}`,
      instante: new Date(enPlataforma("2026-10-01", "12:00").getTime() + i * 86_400_000),
      valor: "100.00",
    }),
  );
  const datos = datosDescarga({
    factura: factura({
      desde: enPlataforma("2026-10-01"),
      cargos: "6000.00",
      reversos: "0.00",
      totalOrdenes: "6000.00",
      movimientos: 60,
      total: "6000.00",
    }),
    movimientos: movs,
  });
  const { textos } = pdfDe(datos);
  const esDia = (t: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(t);

  it("el desglose ocupa dos o más páginas y cada una repite la cabecera de la tabla", () => {
    expect(textos.length).toBeGreaterThanOrEqual(3);
    for (const p of textos.slice(1)) expect(tras(p, "Día", 4)).toEqual(["Cargos", "Reversos", "Órdenes netas", "Importe neto"]);
  });

  it("sin perder ni duplicar filas", () => {
    const dias = textos.slice(1).flatMap((p) => p.filter(esDia));
    expect(dias).toHaveLength(60);
    expect(new Set(dias).size).toBe(60);
    expect([dias[0], dias[59]]).toEqual(["01/10/2026", "29/11/2026"]);
  });

  it("R13: cada página lleva «Singularis · Plataforma Servi Logistic · Factura N.º n · empresa» y «Página x de y»", () => {
    textos.forEach((p, i) => {
      expect(p).toContain(`${MARCA_FACTURA.pie} · Factura N.º 1 · ${EMPRESA}`);
      expect(p).toContain(`Página ${i + 1} de ${textos.length}`);
    });
  });
});
