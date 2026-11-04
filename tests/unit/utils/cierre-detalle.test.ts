import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { tarifaDe, detalleDe, CierreDetalleFaltanteError } from "@/lib/utils/cierre-detalle";
import type { CierreDetalleRow, ConceptoCongeladoRow } from "@/lib/utils/cierre-detalle";

// Feature 69 — tests unit de la lectura COMPARTIDA del snapshot. `tarifaDe` no tenia test
// propio y por ahi se colo la desviacion de R11 (`toString()` en vez de `toFixed(2)`): un
// Decimal("1000.00") salia "1000". Este archivo fija el CONTRATO de formato, que es lo que
// R11 pide y lo que hace que las dos procedencias de la tarifa (resolver vivo y snapshot)
// sean indistinguibles para el consumidor.

function detalleRow(overrides: Partial<CierreDetalleRow> = {}): CierreDetalleRow {
  return {
    ordenId: "o1",
    tarifaModelo: "viejo",
    conceptos: [],
    montoCobrar: new Prisma.Decimal("12500.00"),
    cobraComision: true,
    esCentral: false,
    tiendaId: "t1",
    tarifaId: "tar1",
    tarifaValorFlete: new Prisma.Decimal("1000.00"),
    tarifaValorFleteGam: new Prisma.Decimal("1200.5"),
    tarifaValorFleteDevuelto: new Prisma.Decimal("500"),
    tarifaValorFleteDevueltoGam: new Prisma.Decimal("600.00"),
    tarifaComisionCod: new Prisma.Decimal("3"),
    tarifaIvaFlete: new Prisma.Decimal("13"),
    tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
    ...overrides,
  } as CierreDetalleRow;
}

describe("tarifaDe (R11)", () => {
  it("R11: los 7 campos salen como STRING escala 2 FIJA (toFixed(2), no toString)", () => {
    const congelada = tarifaDe(detalleRow(), []);
    // SLT-52 (R42): el viejo sale envuelto en su sobre; lo de dentro es lo de siempre.
    expect(congelada?.modelo).toBe("viejo");
    const t = congelada?.modelo === "viejo" ? congelada.tarifa : null;

    // El caso que la desviacion rompia: "1000.00", no "1000".
    expect(t).toEqual({
      valorFlete: "1000.00",
      valorFleteGam: "1200.50",
      valorFleteDevuelto: "500.00",
      valorFleteDevueltoGam: "600.00",
      comisionCod: "3.00",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
      // Los dos pactos por distrito especial: esta fila no pacta nada, y `null` (no "0.00")
      // es la unica forma de decirlo sin inventar un cobro de cero.
      tarifaEspecial: null,
      tarifaEspecialDevuelta: null,
    });
    // Escala 2 en TODOS los MONTOS, sea cual sea la escala con que Postgres devuelva el
    // Decimal. Los dos pactos se excluyen del barrido porque su `null` es un valor legitimo.
    const valores = Object.values(t ?? {}).filter((v) => v !== null);
    expect(valores).toHaveLength(7);
    for (const v of valores) {
      expect(typeof v).toBe("string");
      expect(v).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("R11: mismo formato que el resolver vivo para el MISMO valor (no divergen)", () => {
    // El resolver (`TarifaVigenteRepository`) emite `toFixed(2)`. Si el snapshot
    // emitiera otro texto para el mismo Decimal, un cierre backfilleado y uno nuevo
    // liquidarian "igual" pero con entradas distintas al ojo: eso es lo que se prohibe.
    const valor = new Prisma.Decimal("1000.00");
    const t = tarifaDe(detalleRow({ tarifaValorFlete: valor }), []);
    expect(t?.modelo === "viejo" ? t.tarifa.valorFlete : null).toBe(valor.toFixed(2));
  });

  it("R9/decision (c): tarifa_id null -> null (gap preservado, no se inventa tarifa 0)", () => {
    expect(tarifaDe(detalleRow({ tarifaId: null }), [])).toBeNull();
  });
});

// SLT-52 (design §7, R41, R42) — la rama nueva: los valores salen de las filas congeladas de
// `cierre_detail_concepto`, nunca de `tarifa_valor`. Importes escritos a mano.
function concepto(o: Partial<ConceptoCongeladoRow> & Pick<ConceptoCongeladoRow, "concepto">): ConceptoCongeladoRow {
  return {
    modo: "monto",
    valor: new Prisma.Decimal("1500"),
    ivaPct: new Prisma.Decimal("13"),
    nivel: "zona",
    tarifaValorId: "tv-1",
    ...o,
  };
}

describe("tarifaDe — modelo nuevo (SLT-52 R41/R42)", () => {
  const nuevo = (o: Partial<CierreDetalleRow> = {}) =>
    detalleRow({
      tarifaModelo: "nuevo",
      tarifaId: null,
      tarifaValorFlete: null,
      tarifaValorFleteGam: null,
      tarifaValorFleteDevuelto: null,
      tarifaValorFleteDevueltoGam: null,
      tarifaComisionCod: null,
      tarifaIvaFlete: null,
      tarifaIvaComisionCod: null,
      ...o,
    });

  it("SLT-52 R41 — cada fila congelada es un valor, con su modo, % de IVA y nivel en escala 2", () => {
    const t = tarifaDe(nuevo(), [
      concepto({ concepto: "tienda_flete_entregado", valor: new Prisma.Decimal("1500"), nivel: "grupo" }),
      concepto({
        concepto: "tienda_fulfillment",
        modo: "porcentaje",
        valor: new Prisma.Decimal("2.5"),
        ivaPct: new Prisma.Decimal("13"),
        tarifaValorId: "tv-ff",
      }),
    ]);
    expect(t).toEqual({
      modelo: "nuevo",
      valores: {
        tienda_flete_entregado: {
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: "1500.00",
          ivaPct: "13.00",
          nivel: "grupo",
          tarifaValorId: "tv-1",
        },
        tienda_fulfillment: {
          concepto: "tienda_fulfillment",
          modo: "porcentaje",
          valor: "2.50",
          ivaPct: "13.00",
          nivel: "zona",
          tarifaValorId: "tv-ff",
        },
      },
    });
  });

  it("SLT-52 R41 — el valor de origen borrado (FK SET NULL) se lee con `tarifaValorId: null` y el mismo importe", () => {
    const t = tarifaDe(nuevo(), [concepto({ concepto: "tienda_flete_entregado", tarifaValorId: null })]);
    expect(t?.modelo === "nuevo" ? t.valores.tienda_flete_entregado : undefined).toEqual({
      concepto: "tienda_flete_entregado",
      modo: "monto",
      valor: "1500.00",
      ivaPct: "13.00",
      nivel: "zona",
      tarifaValorId: null,
    });
  });

  it("SLT-52 R24 — sin filas no es `null`: es el nuevo sin conceptos (cada uno cuenta 0)", () => {
    expect(tarifaDe(nuevo(), [])).toEqual({ modelo: "nuevo", valores: {} });
  });

  it("SLT-52 R42 — un detalle viejo ignora cualquier fila de concepto (el viejo no escribe ninguna)", () => {
    const t = tarifaDe(detalleRow(), [concepto({ concepto: "tienda_flete_entregado" })]);
    expect(t?.modelo).toBe("viejo");
  });

  it("SLT-52 — una fila que no es de la tienda se para, no se cobra", () => {
    expect(() => tarifaDe(nuevo(), [concepto({ concepto: "mensajero_entregado" })])).toThrow(
      /no es un cobro a la tienda/,
    );
  });
});

describe("detalleDe (R14)", () => {
  it("R14: fila presente -> se devuelve", () => {
    const d = detalleRow();
    const byOrden = new Map([["o1", d]]);
    expect(detalleDe(byOrden, "c1", "o1")).toBe(d);
  });

  it("R14/decision (a): fila ausente -> error DURO, sin fallback a datos vivos", () => {
    const byOrden = new Map<string, CierreDetalleRow>();
    expect(() => detalleDe(byOrden, "c1", "o-huerfana")).toThrow(CierreDetalleFaltanteError);
    // El error dice QUE cierre y QUE orden: una aprobacion abortada tiene que ser accionable.
    expect(() => detalleDe(byOrden, "c1", "o-huerfana")).toThrow(/o-huerfana/);
    expect(() => detalleDe(byOrden, "c1", "o-huerfana")).toThrow(/c1/);
  });
});
