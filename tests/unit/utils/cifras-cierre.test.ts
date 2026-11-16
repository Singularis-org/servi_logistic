import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { cifrasDelCierre, type SnapshotsCierre } from "@/lib/utils/cifras-cierre";
import type { GestionDeTienda } from "@/lib/utils/ingreso-empresa";

// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (T1.1; R380, R381) — el compositor
// puro de las cifras de un cierre, el MISMO que usa el detalle y el Excel.
//
// Escenario N1 de `design.md > Verificacion`, con las cifras ESCRITAS A MANO (son el contrato;
// derivarlas con las funciones de produccion compararia el codigo contra su propia fuente):
//   snapshots: efectivo 70 000,00 · SINPE 30 000,00 · transferencia 0,00 · general 100 000,00 ·
//              pago al mensajero 3 000,00 · ingreso de bodega por rechazos 500,00
//   G1 «Tienda Norte», entrega 70 000,00 efectivo + 30 000,00 SINPE: flete 4 000,00 + IVA 520,00;
//      comision 1 000,00 + IVA 130,00
//   G2 «Tienda Sur», novedad: flete de no entregadas 2 000,00 + IVA 260,00 (va al flete de devolucion)

/** Un desglose congelado: solo los conceptos que se pasan; el resto, `null` (no aplica). */
function ingreso(c: Partial<IngresoEmpresaDTO> & { total: string }): IngresoEmpresaDTO {
  return {
    montoCobrar: null,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    tarifaModelo: "nuevo",
    ...c,
  };
}

const SNAPSHOTS_N1: SnapshotsCierre = {
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  totalIngresoBodegaRechazos: "500.00",
};

const G1: GestionDeTienda = {
  resultado: "entregado",
  pagos: [
    { metodo: "efectivo", monto: "70000.00" },
    { metodo: "SINPE", monto: "30000.00" },
  ],
  tiendaId: "tienda-norte",
  tiendaNombre: "Tienda Norte",
  ingresoEmpresa: ingreso({
    montoCobrar: "100000.00",
    cobraComision: true,
    flete: "4000.00",
    ivaFlete: "520.00",
    fleteConIva: "4520.00",
    comisionCod: "1000.00",
    ivaComisionCod: "130.00",
    comisionConIva: "1130.00",
    total: "5650.00",
  }),
};

const G2: GestionDeTienda = {
  resultado: "novedad",
  pagos: [],
  tiendaId: "tienda-sur",
  tiendaNombre: "Tienda Sur",
  ingresoEmpresa: ingreso({
    montoCobrar: "10000.00",
    fleteDevolucion: "2000.00",
    ivaFleteDevolucion: "260.00",
    fleteDevolucionConIva: "2260.00",
    total: "2260.00",
  }),
};

describe("SLT-140 R380 — cifrasDelCierre: las cifras de N1 contra literales a mano", () => {
  const cifras = cifrasDelCierre(SNAPSHOTS_N1, [G1, G2]);

  it("SLT-169 R620: Se le paga a la tienda = 100 000,00 − 7 910,00 (TODO lo facturado) = 92 090,00", () => {
    expect(cifras.pagoTienda).toBe("92090.00");
  });

  it("Total facturado = 4 520,00 + 1 130,00 + 2 260,00 = 7 910,00", () => {
    expect(cifras.totalesIngreso.total).toBe("7910.00");
  });

  it("IVA facturado = 520,00 + 130,00 + 260,00 = 910,00", () => {
    expect(cifras.ivaFacturado).toBe("910.00");
  });

  it("SLT-174 (R651): las cifras del cierre ya no llevan el campo que duplicaba el pago", () => {
    expect(cifras).not.toHaveProperty("ganaLaTienda");
  });

  it("Le queda a la empresa = 7 910,00 − 910,00 − 3 000,00 − 500,00 = 3 500,00", () => {
    expect(cifras.netoEmpresa).toBe("3500.00");
  });

  it("Ganancia = 7 000,00 − 3 000,00 = 4 000,00 y la linea puente = 4 520,00 + 1 130,00 = 5 650,00", () => {
    expect(cifras.ganancia).toBe("4000.00");
    expect(cifras.cobradoSobreRecaudado).toBe("5650.00");
  });
});

describe("SLT-140 R381 — cifrasDelCierre: la particion por tienda", () => {
  const cifras = cifrasDelCierre(SNAPSHOTS_N1, [G2, G1]);

  it("una fila por tienda, de mayor a menor pago, con el pago de Tienda Sur negativo y con su signo", () => {
    expect(cifras.partesPorTienda).toEqual([
      {
        tiendaId: "tienda-norte",
        tiendaNombre: "Tienda Norte",
        recaudado: "100000.00",
        pagoTienda: "94350.00",
      },
      {
        tiendaId: "tienda-sur",
        tiendaNombre: "Tienda Sur",
        recaudado: "0.00",
        pagoTienda: "-2260.00",
      },
    ]);
  });

  it("las dos sumas de las partes dan las del cierre: 100 000,00 · 92 090,00", () => {
    // Las sumas se hacen sobre literales de dos decimales: comparar centimos enteros evita floats.
    const centimos = (s: string) => BigInt(s.replace(".", ""));
    const suma = (k: "recaudado" | "pagoTienda") =>
      cifras.partesPorTienda.reduce((acc, p) => acc + centimos(p[k]), BigInt(0));
    expect(suma("recaudado")).toBe(BigInt(10000000));
    expect(suma("pagoTienda")).toBe(BigInt(9209000));
  });
});

// SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» — R620, R622, R635.
//
// El folio #C51B7B93 de produccion (cierre aprobado): 1 entrega de ₡19.900 recaudados con
// ₡3.273,05 de flete y comision con IVA, y 12 devoluciones por rechazo de ₡2.486,00 con IVA cada
// una. Las cifras van ESCRITAS A MANO: son el contrato, no la salida de una funcion de produccion.
const SNAPSHOTS_C51B7B93: SnapshotsCierre = {
  totales: { efectivo: "19900.00", simpe: "0.00", transferencia: "0.00", general: "19900.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
};

const ENTREGA_C51B7B93: GestionDeTienda = {
  resultado: "entregado",
  pagos: [{ metodo: "efectivo", monto: "19900.00" }],
  tiendaId: "tienda-c51",
  tiendaNombre: "Tienda C51",
  ingresoEmpresa: ingreso({
    montoCobrar: "19900.00",
    cobraComision: true,
    flete: "2200.00",
    ivaFlete: "286.00",
    fleteConIva: "2486.00",
    comisionCod: "696.50",
    ivaComisionCod: "90.55",
    comisionConIva: "787.05",
    total: "3273.05",
  }),
};

/** Una devolucion por rechazo de ₡2.486,00 con IVA, con la forma de cada modelo de tarifa. */
function rechazo(modelo: "viejo" | "nuevo", resultado: GestionDeTienda["resultado"], n: number): GestionDeTienda {
  return {
    resultado,
    pagos: [],
    tiendaId: "tienda-c51",
    tiendaNombre: "Tienda C51",
    ingresoEmpresa: ingreso({
      montoCobrar: `${10000 + n}.00`,
      tarifaModelo: modelo,
      fleteDevolucion: "2200.00",
      ivaFleteDevolucion: "286.00",
      fleteDevolucionConIva: "2486.00",
      total: "2486.00",
    }),
  };
}

describe("SLT-169 R620/R622 — el pago a la tienda resta TODO lo facturado (folio #C51B7B93)", () => {
  const rechazos = Array.from({ length: 12 }, (_, i) =>
    rechazo("nuevo", "devolucion_a_origen_por_rechazo", i),
  );
  const cifras = cifrasDelCierre(SNAPSHOTS_C51B7B93, [ENTREGA_C51B7B93, ...rechazos]);

  it("#C51B7B93: 19.900 − 3.273,05 − 12 × 2.486 = −13.205,05", () => {
    expect(cifras.pagoTienda).toBe("-13205.05");
  });

  it("R622: negativo con su signo, nunca recortado a 0.00 (ni el del cierre ni el de su tienda)", () => {
    expect(cifras.pagoTienda.startsWith("-")).toBe(true);
    expect(cifras.partesPorTienda).toHaveLength(1);
    expect(cifras.partesPorTienda[0].pagoTienda).toBe("-13205.05");
  });

  it("R624: lo que se le paga + Total facturado = lo recaudado (−13.205,05 + 33.105,05 = 19.900)", () => {
    expect(cifras.totalesIngreso.total).toBe("33105.05");
    // SLT-174 (R656): la identidad misma, en céntimos enteros, contra el recaudado escrito a mano.
    const centimos = (s: string) => BigInt(s.replace(".", ""));
    expect(centimos(cifras.pagoTienda) + centimos(cifras.totalesIngreso.total)).toBe(BigInt(1990000));
  });
});

describe("SLT-169 R635 — igual en el modelo viejo y en el nuevo", () => {
  it("viejo: el flete de devolucion nace de `devolucion_a_origen_por_rechazo` y se resta", () => {
    const cifras = cifrasDelCierre(SNAPSHOTS_C51B7B93, [
      ENTREGA_C51B7B93,
      rechazo("viejo", "devolucion_a_origen_por_rechazo", 1),
    ]);
    // 19.900 − 3.273,05 − 2.486 = 14.140,95
    expect(cifras.pagoTienda).toBe("14140.95");
  });

  it("nuevo: el flete de no entregadas de un reprogramado tambien se resta", () => {
    const cifras = cifrasDelCierre(SNAPSHOTS_C51B7B93, [
      ENTREGA_C51B7B93,
      rechazo("nuevo", "reprogramado", 1),
    ]);
    expect(cifras.pagoTienda).toBe("14140.95");
  });
});

describe("SLT-140 — el modulo no toca coma flotante", () => {
  it("lib/utils/cifras-cierre.ts sin Number(, parseFloat, Math. ni toNumber(", () => {
    const fuente = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "lib", "utils", "cifras-cierre.ts"),
      "utf8",
    );
    expect(fuente).not.toMatch(/Number\(|parseFloat|Math\.|toNumber\(/);
  });
});
