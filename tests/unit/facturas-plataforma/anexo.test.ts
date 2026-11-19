import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MARCA_FACTURA } from "@/lib/config/marca";
import { monedaConfig } from "@/lib/config/moneda";
import { construirPdfAnexo } from "@/lib/facturas-plataforma/anexo";
import { COLORES, MEDIDAS, type LogoDelPdf } from "@/lib/facturas-plataforma/pdf-comun";
import { DescuadreDeFactura, importeDocumento as imp, resumirFactura } from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura, MovimientoDeFactura } from "@/lib/types/factura-plataforma";
import { datosDescarga, enPlataforma, factura, movimiento } from "../../components/_facturas-plataforma";
import { contenidoDePagina, imagenesDePagina } from "../pdf/pdf-inspector";
import { PT, leerPdf, mismoColor, rectangulosConColor, tras } from "./_pdf-leido";

// SLT-199 (T3.1) — R15–R21 y R7 sobre el PDF REAL del anexo de movimientos.

const RAIZ = path.resolve(__dirname, "../../..");
const LOGO: LogoDelPdf = new Uint8Array(readFileSync(path.join(RAIZ, "public", MARCA_FACTURA.logo.ruta)));
const EMPRESA = "Mensajería Ñandú S.A.";
const { simbolo: S, separadorDecimal: D } = monedaConfig;
const COLUMNAS = ["#", "Fecha", "Tipo", "Guía", "Remisión", "Importe"];

function anexoDe(datos: DatosDescargaFactura, logo: LogoDelPdf | null = LOGO) {
  return leerPdf(construirPdfAnexo(datos, resumirFactura(datos), logo));
}

/** `n` cargos de 200 el mismo día, con guía y remisión distintas. */
function cargos(n: number): DatosDescargaFactura {
  const total = `${n * 200}.00`;
  return datosDescarga({
    factura: factura({ cargos: total, reversos: "0.00", totalOrdenes: total, movimientos: n, total }),
    movimientos: Array.from({ length: n }, (_, i) =>
      movimiento({ id: `m${i}`, numGuia: 5000 + i, numRemision: `REM-${i + 1}`, valor: "200.00" }),
    ),
  });
}

const SIN_MOVIMIENTOS = datosDescarga({
  factura: factura({ cargos: "0.00", reversos: "0.00", totalOrdenes: "0.00", movimientos: 0, total: "0.00" }),
  movimientos: [],
});

describe("SLT-199 R15, R16 — A4 vertical y la cabecera solo en la primera página", () => {
  const { bytes, textos } = anexoDe(cargos(130));

  it("la banda con el logo y «ANEXO · FACTURA N.º n», «Detalle de movimientos» y el cliente", () => {
    expect(imagenesDePagina(bytes, 0)).toHaveLength(1);
    expect(textos[0].slice(0, 3)).toEqual(["ANEXO · FACTURA N.º 1", "Detalle de movimientos", `Cliente: ${EMPRESA}`]);
    const barra = rectangulosConColor(contenidoDePagina(bytes, 0)).filter((r) => Math.abs(r.h - MEDIDAS.altoBarra * PT) < 0.01);
    expect(barra).toHaveLength(MEDIDAS.tiras);
  });

  it("las páginas siguientes no llevan banda, barra ni logo", () => {
    expect(textos.length).toBeGreaterThan(1);
    textos.slice(1).forEach((p, i) => {
      expect(p).not.toContain("Detalle de movimientos");
      expect(imagenesDePagina(bytes, i + 1)).toHaveLength(0);
      const barra = rectangulosConColor(contenidoDePagina(bytes, i + 1)).filter(
        (r) => Math.abs(r.h - MEDIDAS.altoBarra * PT) < 0.01,
      );
      expect(barra).toHaveLength(0);
    });
  });

  it("R6: sin logo, «Singularis» en texto", () => {
    const sin = anexoDe(datosDescarga(), null);
    expect(imagenesDePagina(sin.bytes, 0)).toHaveLength(0);
    expect(sin.textos[0]).toContain(MARCA_FACTURA.emisor);
  });
});

describe("SLT-199 R17 — cuatro tarjetas y la línea del período", () => {
  const { pags, textos } = anexoDe(datosDescarga());
  const p1 = textos[0];

  it("Movimientos, Cargos «n · importe», Reversos «n · -importe» y Total neto, en una fila", () => {
    expect(tras(p1, "MOVIMIENTOS")).toEqual(["3"]);
    expect(tras(p1, "CARGOS")).toEqual([`2 · ${S}600${D}00`]);
    expect(tras(p1, "REVERSOS")).toEqual([`1 · -${S}300${D}00`]);
    expect(tras(p1, "TOTAL NETO")).toEqual([imp("300.00")]);
    const ys = ["MOVIMIENTOS", "CARGOS", "REVERSOS", "TOTAL NETO"].map((e) => pags[0].find((t) => t.texto === e)!.y);
    expect(new Set(ys.map((y) => y.toFixed(1))).size).toBe(1);
  });

  it("«Periodo facturado: … al … .» y la tarifa única", () => {
    expect(p1.join(" ")).toContain(`Periodo facturado: 16/11/2026 al 30/11/2026. Tarifa: ${S}300${D}00 por orden.`);
  });

  it("R26: varias tarifas y sin movimientos", () => {
    const varias = datosDescarga({
      factura: factura({ cargos: "500.00", reversos: "300.00", totalOrdenes: "200.00", total: "200.00" }),
      movimientos: [
        movimiento({ id: "1", valor: "200.00" }),
        movimiento({ id: "2", valor: "300.00" }),
        movimiento({ id: "3", tipo: "reverso", valor: "-300.00" }),
      ],
    });
    expect(anexoDe(varias).textos[0].join(" ")).toContain("al 30/11/2026. Tarifa: varias por orden.");
    expect(anexoDe(SIN_MOVIMIENTOS).textos[0].join(" ")).toContain("al 30/11/2026. Tarifa: —.");
  });
});

describe("SLT-199 R18 — la tabla «Movimientos»", () => {
  const { pags, textos } = anexoDe(datosDescarga());
  const p1 = textos[0];
  const de = (t: string) => pags[0].filter((x) => x.texto === t);

  it("el título y las columnas #, Fecha, Tipo, Guía, Remisión e Importe", () => {
    expect(tras(p1, "Movimientos", 6)).toEqual(COLUMNAS);
  });

  it("una fila por movimiento en el orden de la lectura, con «—» si no hay guía", () => {
    const tabla = p1.slice(p1.indexOf("Importe"));
    expect(tras(tabla, "1", 5)).toEqual(["17/11/2026", "Cargo", "1001", "R-1001", imp("300.00")]);
    expect(tras(tabla, "2", 5)).toEqual(["18/11/2026", "Cargo", "1002", "R-1002", imp("300.00")]);
    expect(tras(tabla, "3", 5)).toEqual(["18/11/2026", "Reverso", "—", "R-1001", `-${S}300${D}00`]);
  });

  it("«Cargo» en verde azulado; «Reverso» en negrita y rojo; el importe negativo en rojo", () => {
    for (const c of de("Cargo")) expect(mismoColor(c.color, COLORES.verdeAzulado)).toBe(true);
    const [reverso] = de("Reverso");
    expect(mismoColor(reverso.color, COLORES.rojo)).toBe(true);
    expect(reverso.fuente).toBe("Helvetica-Bold");
    expect(de("Cargo")[0].fuente).toBe("Helvetica");
    const negativo = de(`-${S}300${D}00`).at(-1)!;
    expect(mismoColor(negativo.color, COLORES.rojo)).toBe(true);
    expect(de(imp("300.00")).some((t) => mismoColor(t.color, COLORES.rojo))).toBe(false);
  });
});

describe("SLT-199 R19, R21 — tabla partida, total neto y pie", () => {
  const { bytes, textos, pags } = anexoDe(cargos(130));

  it("cada página repite la cabecera de la tabla", () => {
    for (const p of textos) {
      const i = p.indexOf("#");
      expect(p.slice(i, i + 6)).toEqual(COLUMNAS);
    }
  });

  it("# de 1 a 130, en orden, sin perder ni duplicar filas", () => {
    const remisiones = textos.flatMap((p) => p.filter((t) => /^REM-\d+$/.test(t)));
    expect(remisiones).toEqual(Array.from({ length: 130 }, (_, i) => `REM-${i + 1}`));
    for (const p of textos) {
      p.forEach((t, i) => {
        if (/^REM-\d+$/.test(t)) expect(p[i - 4]).toBe(t.slice(4));
      });
    }
  });

  it("la última fila es «Total neto (130 movimientos)» con el total de la base, en negrita y con filete", () => {
    const ultima = textos.at(-1)!;
    expect(tras(ultima, "Total neto (130 movimientos)")).toEqual([imp("26000.00")]);
    const fila = pags.at(-1)!.find((t) => t.texto === "Total neto (130 movimientos)")!;
    expect(fila.fuente).toBe("Helvetica-Bold");
    const filete = rectangulosConColor(contenidoDePagina(bytes, textos.length - 1)).filter(
      (r) => mismoColor(r.color, COLORES.violeta) && Math.abs(r.h - 0.53 * PT) < 0.01,
    );
    expect(filete).toHaveLength(1);
  });

  it("R21: cada página lleva «Singularis · Plataforma Servi Logistic · Anexo: detalle de movimientos» y «Página x de y»", () => {
    textos.forEach((p, i) => {
      expect(p).toContain(`${MARCA_FACTURA.pie} · Anexo: detalle de movimientos`);
      expect(p).toContain(`Página ${i + 1} de ${textos.length}`);
    });
  });
});

describe("SLT-199 R20 — sin movimientos", () => {
  it("«Sin movimientos en el período» y «Total neto (0 movimientos)» en cero", () => {
    const { textos } = anexoDe(SIN_MOVIMIENTOS);
    expect(textos).toHaveLength(1);
    expect(textos[0]).toContain("Sin movimientos en el período");
    expect(tras(textos[0], "Total neto (0 movimientos)")).toEqual([`${S}0${D}00`]);
  });
});

describe("SLT-199 R7 — un descuadre no genera el anexo", () => {
  it("resumirFactura lanza antes de dibujar", () => {
    const datos = datosDescarga({ factura: factura({ movimientos: 4 }) });
    expect(() => construirPdfAnexo(datos, resumirFactura(datos), LOGO)).toThrow(DescuadreDeFactura);
  });
});

describe("SLT-199 T3.1 — volumen: 3 000 movimientos", () => {
  it("se genera entero y mide tiempo y peso", () => {
    const movs: MovimientoDeFactura[] = Array.from({ length: 3000 }, (_, i) =>
      movimiento({
        id: `v${i}`,
        instante: new Date(enPlataforma("2026-11-16", "08:00").getTime() + i * 60_000),
        numGuia: 10_000_000 + i,
        numRemision: `NUF-${60_000 + i}`,
        valor: "200.00",
      }),
    );
    const datos = datosDescarga({
      factura: factura({
        cargos: "600000.00",
        reversos: "0.00",
        totalOrdenes: "600000.00",
        movimientos: 3000,
        total: "600000.00",
      }),
      movimientos: movs,
    });
    const inicio = performance.now();
    const bytes = construirPdfAnexo(datos, resumirFactura(datos), LOGO);
    const ms = performance.now() - inicio;
    const { textos } = leerPdf(bytes);
    expect(textos.at(-1)).toContain("Total neto (3 000 movimientos)");
    expect(textos.flat().filter((t) => /^NUF-\d+$/.test(t))).toHaveLength(3000);
    // Medido en Node el 2026-11-18: 1,1–1,6 s, 259 kB, 52 páginas (progress/impl_SLT-199.md). Techos holgados.
    expect(ms).toBeLessThan(10_000);
    expect(bytes.byteLength).toBeLessThan(2 * 1024 * 1024);
  });
});
