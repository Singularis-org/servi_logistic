import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MARCA_FACTURA } from "@/lib/config/marca";
import { money } from "@/lib/config/moneda";
import { construirPdfFactura, type LogoDelPdf } from "@/lib/facturas-plataforma/pdf";
import { resumirFactura } from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura, MovimientoDeFactura } from "@/lib/types/factura-plataforma";
import { cuota, datosDescarga, enPlataforma, factura, movimiento } from "../../components/_facturas-plataforma";
import {
  fuentesDePagina,
  imagenesDePagina,
  objetos,
  paginas,
  textoLegible,
  textosDePagina,
} from "../pdf/pdf-inspector";

// SLT-136 (T2.4) — R7–R14 y R17 sobre el PDF REAL: el texto se lee con el /ToUnicode que declara el propio
// documento (la fuente embebida escribe en Identity-H y un grep no lo vería).

const RAIZ = path.resolve(__dirname, "../../..");
const LOGO: LogoDelPdf = new Uint8Array(readFileSync(path.join(RAIZ, "public", MARCA_FACTURA.logo.ruta)));

function pdfDe(datos: DatosDescargaFactura, logo: LogoDelPdf | null = LOGO) {
  const bytes = new Uint8Array(construirPdfFactura(datos, resumirFactura(datos), logo));
  const n = paginas(objetos(bytes)).length;
  const pags = Array.from({ length: n }, (_, i) => {
    const fuentes = fuentesDePagina(bytes, i);
    return textosDePagina(bytes, i).map((t) => textoLegible(t, fuentes.get(t.fuenteRes)));
  });
  return { bytes, pags, todo: pags.flat() };
}

/** El texto que se dibujó justo después de `etiqueta` en la página. */
function tras(pagina: string[], etiqueta: string, saltos = 1): string[] {
  const i = pagina.indexOf(etiqueta);
  expect(i, `no está «${etiqueta}»`).toBeGreaterThanOrEqual(0);
  return pagina.slice(i + 1, i + 1 + saltos);
}

const EMPRESA = "Mensajería Ñandú S.A.";

describe("SLT-136 R7 — A4 vertical y cabecera con marca", () => {
  const { bytes, pags } = pdfDe(datosDescarga());

  it("todas las páginas son A4 vertical", () => {
    for (const p of paginas(objetos(bytes))) {
      const caja = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(p.dict);
      expect(caja).not.toBeNull();
      expect(Number(caja![1])).toBeCloseTo(595.28, 1);
      expect(Number(caja![2])).toBeCloseTo(841.89, 1);
    }
  });

  it("la cabecera lleva el logo, «FACTURA DE PLATAFORMA», el número y el cliente", () => {
    expect(imagenesDePagina(bytes, 0)).toHaveLength(1);
    expect(pags[0]).toEqual(
      expect.arrayContaining(["FACTURA DE PLATAFORMA", "Factura N.º 1", `Cliente: ${EMPRESA}`]),
    );
    expect(pags[0]).not.toContain(MARCA_FACTURA.emisor);
  });
});

describe("SLT-136 R14 — sin logo, «Singularis» en texto y el PDF se genera igual", () => {
  it("logo null", () => {
    const { bytes, pags } = pdfDe(datosDescarga(), null);
    expect(imagenesDePagina(bytes, 0)).toHaveLength(0);
    expect(pags[0]).toContain("Singularis");
    expect(pags[0]).toContain("Factura N.º 1");
  });

  it("unos bytes que no son un PNG cuentan como logo que no se pudo cargar", () => {
    const { bytes, pags } = pdfDe(datosDescarga(), new Uint8Array([1, 2, 3, 4]));
    expect(imagenesDePagina(bytes, 0)).toHaveLength(0);
    expect(pags[0]).toContain("Singularis");
  });
});

describe("SLT-136 R8 — las seis tarjetas", () => {
  it("cliente, «Emitida», período, emisión, periodicidad y plan sin cuota", () => {
    const { pags } = pdfDe(datosDescarga());
    const p1 = pags[0];
    expect(tras(p1, "CLIENTE")).toEqual([EMPRESA]);
    expect(tras(p1, "ESTADO")).toEqual(["Emitida"]);
    expect(tras(p1, "PERÍODO FACTURADO")).toEqual(["16/11/2026 al 30/11/2026"]);
    expect(tras(p1, "FECHA DE EMISIÓN (CIERRE)")).toEqual(["01/12/2026"]);
    expect(tras(p1, "PERIODICIDAD")).toEqual(["Quincenal"]);
    expect(tras(p1, "PLAN")).toEqual(["Crecer · sin cuota de plan"]);
  });

  it("sin plan: «Sin plan asignado»; con cuota, el plan sin la coletilla", () => {
    // Un valor largo parte en dos líneas de la tarjeta, sin perder nada.
    expect(tras(pdfDe(datosDescarga({ factura: factura({ plan: null }) })).pags[0], "PLAN", 2).join(" ")).toBe(
      "Sin plan asignado · sin cuota de plan",
    );
    const conCuota = factura({ cuota: cuota(), total: "1300.00", periodicidad: "mensual" });
    const p1 = pdfDe(datosDescarga({ factura: conCuota })).pags[0];
    expect(tras(p1, "PLAN")).toEqual(["Crecer"]);
    expect(tras(p1, "PERIODICIDAD")).toEqual(["Mensual"]);
  });
});

describe("SLT-136 R9, R10, R13 — Resumen, Total a pagar y la nota", () => {
  const conCuotas = factura({
    cargos: "600.00",
    cuota: cuota({ cuota: "1000.00" }),
    primeraCuota: cuota({ cuota: "234.56" }),
    total: "1534.56",
  });
  const { pags, todo } = pdfDe(datosDescarga({ factura: conCuotas }));
  const p1 = pags[0];

  it("R9: Concepto · Cantidad · Importe, sin columna de tarifa", () => {
    expect(tras(p1, "Concepto", 2)).toEqual(["Cantidad", "Importe"]);
    expect(todo.some((t) => /tarifa/i.test(t))).toBe(false);
  });

  it("R9: las cuatro filas con conteos y los importes de la base; la cuota suma la primera cuota", () => {
    expect(tras(p1, "Cargos por orden", 2)).toEqual(["2", money("600.00")]);
    expect(tras(p1, "Reversos de cargos", 2)).toEqual(["1", money("-300.00")]);
    expect(tras(p1, "Total órdenes", 2)).toEqual(["1", money("300.00")]);
    expect(tras(p1, "Cuota del plan", 2)).toEqual(["—", money("1234.56")]);
  });

  it("R10, R13: el total de la base sin redondear, con ₡, y la nota sin tarifa", () => {
    expect(tras(p1, "TOTAL A PAGAR")).toEqual([money("1534.56")]);
    expect(money("1534.56")).toContain("₡");
    expect(money("1534.56")).toContain("534,56");
    expect(p1).toContain("Movimientos en total: 3.");
  });

  it("R13: un carácter que la fuente no cubre sale como «?»", () => {
    const { pags: otro } = pdfDe(datosDescarga({ empresaNombre: "Envíos 日本" }));
    expect(tras(otro[0], "CLIENTE")).toEqual(["Envíos ??"]);
  });
});

describe("SLT-136 R11 — el desglose por día en página aparte", () => {
  const { pags } = pdfDe(datosDescarga());

  it("empieza en la página 2 con sus columnas", () => {
    expect(pags[0]).not.toContain("Desglose por día");
    expect(tras(pags[1], "Desglose por día", 5)).toEqual(["Día", "Cargos", "Reversos", "Órdenes netas", "Importe neto"]);
  });

  it("una fila por día, la fila Total con el total de órdenes de la base y la nota del Excel", () => {
    const p2 = pags[1];
    expect(tras(p2, "17/11/2026", 4)).toEqual(["1", "0", "1", money("300.00")]);
    expect(tras(p2, "18/11/2026", 4)).toEqual(["1", "1", "0", money("0.00")]);
    expect(tras(p2, "Total", 4)).toEqual(["2", "1", "1", money("300.00")]);
    expect(p2.some((t) => t.includes("Excel"))).toBe(true);
  });

  it("órdenes netas negativas en un día solo de reversos", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "300.00", reversos: "300.00", totalOrdenes: "0.00", movimientos: 2, total: "0.00" }),
      movimientos: [
        movimiento({ id: "1", instante: enPlataforma("2026-11-17", "08:00") }),
        movimiento({ id: "2", instante: enPlataforma("2026-11-19", "08:00"), tipo: "reverso", valor: "-300.00" }),
      ],
    });
    expect(tras(pdfDe(datos).pags[1], "19/11/2026", 4)).toEqual(["0", "1", "-1", money("-300.00")]);
  });
});

describe("SLT-136 R17 — sin movimientos", () => {
  it("el desglose dice «Sin movimientos en el período» y su Total va en cero", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "0.00", reversos: "0.00", totalOrdenes: "0.00", movimientos: 0, total: "0.00" }),
      movimientos: [],
    });
    const p2 = pdfDe(datos).pags[1];
    expect(p2).toContain("Sin movimientos en el período");
    expect(tras(p2, "Total", 4)).toEqual(["0", "0", "0", money("0.00")]);
  });
});

describe("SLT-136 R12 — paginación y pie", () => {
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
  const { pags } = pdfDe(datos);
  const esDia = (t: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(t);

  it("el desglose ocupa dos o más páginas y cada una repite la cabecera de la tabla", () => {
    expect(pags.length).toBeGreaterThanOrEqual(3);
    for (const p of pags.slice(1)) {
      expect(tras(p, "Día", 4)).toEqual(["Cargos", "Reversos", "Órdenes netas", "Importe neto"]);
    }
  });

  it("sin perder ni duplicar filas", () => {
    const dias = pags.slice(1).flatMap((p) => p.filter(esDia));
    expect(dias).toHaveLength(60);
    expect(new Set(dias).size).toBe(60);
    expect(dias[0]).toBe("01/10/2026");
    expect(dias[59]).toBe("29/11/2026");
  });

  it("cada página lleva el pie de marca y «Página n de m»", () => {
    const m = pags.length;
    pags.forEach((p, i) => {
      expect(p).toContain(`${MARCA_FACTURA.pie} · Factura N.º 1 · ${EMPRESA}`);
      expect(p).toContain(`Página ${i + 1} de ${m}`);
    });
  });
});
