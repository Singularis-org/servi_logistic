import { describe, expect, it } from "vitest";

import { monedaConfig } from "@/lib/config/moneda";
import {
  DescuadreDeFactura,
  FACTURA_DESCARGA_TEXTOS,
  cantidadVisible,
  fechaNumerica,
  importeDocumento,
  nombreArchivoFactura,
  periodoNumerico,
  planVisible,
  resumirFactura,
  tarifaDeLaFactura,
} from "@/lib/facturas-plataforma/resumen";
import { cuota, datosDescarga, enPlataforma, factura, movimiento } from "../../components/_facturas-plataforma";

// SLT-136 (T2.1) — el resumen puro de la descarga: R9, R10, R11, R15, R17 y R18.

describe("SLT-136 R9, R10 — el resumen con los importes de la base", () => {
  it("R9: cuenta cargos y reversos de los movimientos y toma los importes de la base", () => {
    const r = resumirFactura(datosDescarga());
    expect(r.cargos).toEqual({ cantidad: 2, importe: "600.00" });
    expect(r.reversos).toEqual({ cantidad: 1, importe: "-300.00" });
    expect(r.totalOrdenes).toEqual({ cantidad: 1, importe: "300.00" });
  });

  it("R9: la cuota del plan es la cuota de la emisión más la primera cuota", () => {
    const f = factura({
      cuota: cuota({ cuota: "1000.00" }),
      primeraCuota: cuota({ cuota: "433.33" }),
      total: "1733.33",
    });
    expect(resumirFactura(datosDescarga({ factura: f })).cuota).toBe("1433.33");
  });

  it("R9: sin cuota de emisión ni primera cuota, la cuota es 0.00", () => {
    expect(resumirFactura(datosDescarga()).cuota).toBe("0.00");
  });

  it("R10: el total y los movimientos son los de la base, sin recalcular", () => {
    const f = factura({ total: "1234.56", cuota: cuota({ cuota: "934.56" }) });
    const r = resumirFactura(datosDescarga({ factura: f }));
    expect(r.total).toBe("1234.56");
    expect(r.movimientos).toBe(3);
  });
});

describe("SLT-136 R11 — el desglose por día en la hora de la plataforma", () => {
  it("una fila por día con movimientos, ascendente, con netas e importe exacto", () => {
    const r = resumirFactura(datosDescarga());
    expect(r.dias).toEqual([
      { dia: "2026-11-17", cargos: 1, reversos: 0, netas: 1, importe: "300.00" },
      { dia: "2026-11-18", cargos: 1, reversos: 1, netas: 0, importe: "0.00" },
    ]);
  });

  it("un movimiento a las 23:30 de la plataforma cuenta en ese día, no en el siguiente de UTC", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "0.10", reversos: "0.00", totalOrdenes: "0.10", movimientos: 1, total: "0.10" }),
      movimientos: [movimiento({ instante: enPlataforma("2026-11-20", "23:30"), valor: "0.10" })],
    });
    expect(resumirFactura(datos).dias.map((d) => d.dia)).toEqual(["2026-11-20"]);
  });

  it("un día con solo reversos tiene netas negativas e importe negativo; la suma es exacta en céntimos", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "0.30", reversos: "0.20", totalOrdenes: "0.10", movimientos: 5, total: "0.10" }),
      movimientos: [
        movimiento({ id: "1", instante: enPlataforma("2026-11-17", "08:00"), valor: "0.10" }),
        movimiento({ id: "2", instante: enPlataforma("2026-11-17", "09:00"), valor: "0.10" }),
        movimiento({ id: "3", instante: enPlataforma("2026-11-17", "10:00"), valor: "0.10" }),
        movimiento({ id: "4", instante: enPlataforma("2026-11-19", "08:00"), tipo: "reverso", valor: "-0.10" }),
        movimiento({ id: "5", instante: enPlataforma("2026-11-19", "09:00"), tipo: "reverso", valor: "-0.10" }),
      ],
    });
    const r = resumirFactura(datos);
    expect(r.dias).toEqual([
      { dia: "2026-11-17", cargos: 3, reversos: 0, netas: 3, importe: "0.30" },
      { dia: "2026-11-19", cargos: 0, reversos: 2, netas: -2, importe: "-0.20" },
    ]);
  });
});

describe("SLT-136 R15 — un descuadre con la base no produce archivo", () => {
  it("lanza DescuadreDeFactura si la suma de los días no es el total de órdenes de la base", () => {
    const datos = datosDescarga({ factura: factura({ totalOrdenes: "300.01" }) });
    expect(() => resumirFactura(datos)).toThrow(DescuadreDeFactura);
  });

  it("lanza DescuadreDeFactura si cargos más reversos no son los movimientos de la base", () => {
    const datos = datosDescarga({ factura: factura({ movimientos: 4 }) });
    expect(() => resumirFactura(datos)).toThrow(DescuadreDeFactura);
  });
});

describe("SLT-136 R17 — una factura cerrada sin movimientos", () => {
  it("no tiene días y sus conteos están en cero", () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "0.00", reversos: "0.00", totalOrdenes: "0.00", movimientos: 0, total: "0.00" }),
      movimientos: [],
    });
    const r = resumirFactura(datos);
    expect(r.dias).toEqual([]);
    expect(r.cargos.cantidad).toBe(0);
    expect(r.reversos).toEqual({ cantidad: 0, importe: "0.00" });
    expect(r.totalOrdenes).toEqual({ cantidad: 0, importe: "0.00" });
  });
});

describe("SLT-136 R8 — fechas, período y plan de las tarjetas", () => {
  it("dd/mm/aaaa en la hora de la plataforma", () => {
    expect(fechaNumerica(enPlataforma("2026-11-05", "23:59"))).toBe("05/11/2026");
  });

  it("el último día del período es el de hasta − 1 ms", () => {
    expect(periodoNumerico(enPlataforma("2026-11-16"), enPlataforma("2026-12-01"))).toBe("16/11/2026 al 30/11/2026");
  });

  it("sin plan y sin cuota: «Sin plan asignado · sin cuota de plan»; con cuota, solo el nombre", () => {
    expect(planVisible(datosDescarga({ factura: factura({ plan: null }) }))).toBe(
      `${FACTURA_DESCARGA_TEXTOS.sinPlan} · ${FACTURA_DESCARGA_TEXTOS.sinCuota}`,
    );
    expect(planVisible(datosDescarga({ factura: factura({ cuota: cuota() }) }))).toBe("Crecer");
    expect(planVisible(datosDescarga())).toBe("Crecer · sin cuota de plan");
  });
});

describe("SLT-199 R4 — las cantidades de los PDF", () => {
  it("en grupos de tres cifras separados por un espacio, también en negativo", () => {
    expect(cantidadVisible(2567)).toBe("2 567");
    expect(cantidadVisible(2365)).toBe("2 365");
    expect(cantidadVisible(-15)).toBe("-15");
    expect(cantidadVisible(-1234)).toBe("-1 234");
    expect(cantidadVisible(0)).toBe("0");
    expect(cantidadVisible(1000000)).toBe("1 000 000");
  });
});

describe("SLT-199 R3 — los importes de los PDF", () => {
  const { simbolo: s, separadorDecimal: d } = monedaConfig;

  it("símbolo delante, miles con espacio, separador decimal de la moneda y siempre dos decimales", () => {
    expect(importeDocumento("0.00")).toBe(`${s}0${d}00`);
    expect(importeDocumento("200.00")).toBe(`${s}200${d}00`);
    expect(importeDocumento("473000.00")).toBe(`${s}473 000${d}00`);
    expect(importeDocumento("99999999999.99")).toBe(`${s}99 999 999 999${d}99`);
  });

  it("un negativo lleva «-» delante del símbolo; «-0.00» no es negativo", () => {
    expect(importeDocumento("-40400.00")).toBe(`-${s}40 400${d}00`);
    expect(importeDocumento("-0.10")).toBe(`-${s}0${d}10`);
    expect(importeDocumento("-0.00")).toBe(`${s}0${d}00`);
  });

  it("una forma que no es la de la base lanza en vez de pintarse", () => {
    for (const malo of ["", "200", "200.0", "1,00", "abc", "1e3.00", " 200.00"]) {
      expect(() => importeDocumento(malo), malo).toThrow(/importe no válido/);
    }
  });
});

describe("SLT-199 R26 — la tarifa sale de los movimientos", () => {
  it("cargos y reversos con el mismo valor absoluto: esa es la tarifa, en positivo", () => {
    expect(tarifaDeLaFactura(datosDescarga())).toEqual({ tipo: "unica", importe: "300.00" });
  });

  it("dos valores absolutos distintos: varias", () => {
    const datos = datosDescarga({
      movimientos: [
        movimiento({ id: "1", valor: "300.00" }),
        movimiento({ id: "2", tipo: "reverso", valor: "-250.00" }),
      ],
    });
    expect(tarifaDeLaFactura(datos)).toEqual({ tipo: "varias" });
  });

  it("sin movimientos: ninguna", () => {
    expect(tarifaDeLaFactura(datosDescarga({ movimientos: [] }))).toEqual({ tipo: "sin" });
  });
});

describe("SLT-199 R11, R12 — textos de las notas", () => {
  it("la frase de moneda sale de la configuración", () => {
    expect(FACTURA_DESCARGA_TEXTOS.notaMoneda).toBe(`Montos en ${monedaConfig.currency} (${monedaConfig.simbolo}).`);
  });

  it("la nota del desglose remite al anexo con el número y la empresa", () => {
    expect(FACTURA_DESCARGA_TEXTOS.desglose.notaAnexo("2 567", 1, "Ordenex")).toBe(
      "El detalle completo de los 2 567 movimientos va en el anexo «Factura 1 · Ordenex · Detalle de movimientos».",
    );
  });
});

describe("SLT-199 R24 — el nombre de los archivos", () => {
  it("la factura: factura-<n>-<empresa>.pdf en minúsculas, sin tildes y con guiones", () => {
    expect(nombreArchivoFactura(1, "Mensajería Ñandú S.A.", "factura")).toBe("factura-1-mensajeria-nandu-s-a.pdf");
    expect(nombreArchivoFactura(12, "  Envíos  Rápidos ", "factura")).toBe("factura-12-envios-rapidos.pdf");
  });

  it("el anexo: factura-<n>-<empresa>-anexo.pdf", () => {
    expect(nombreArchivoFactura(1, "Mensajería Ñandú S.A.", "anexo")).toBe("factura-1-mensajeria-nandu-s-a-anexo.pdf");
    expect(nombreArchivoFactura(3, "日本", "anexo")).toBe("factura-3-anexo.pdf");
  });
});
