import { describe, it, expect } from "vitest";

import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { cifrasAgregadasBodega, type SnapshotsAgregadosBodega } from "@/lib/utils/cifras-cierre-bodega";
import type { GestionDeTienda } from "@/lib/utils/ingreso-empresa";

// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T1.1; R387) — las cifras AGREGADAS de
// un cierre de bodega, las MISMAS que pinta el detalle (`verCierreBodegaDetalle`) y que llevará el Excel.
//
// Escenario BN de `design.md > Verificación`, con las cifras ESCRITAS A MANO (son el contrato;
// derivarlas con las funciones de producción compararía el código contra su propia fuente):
//   snapshots AGREGADOS del cierre de bodega: efectivo 70 000,00 · SINPE 30 000,00 · transferencia
//     0,00 · general 100 000,00 · pago al mensajero 3 000,00 · ingreso de bodega por rechazos 500,00
//   G1 tienda T1, entrega 70 000,00 efectivo: flete 4 000,00 + IVA 520,00
//   G2 tienda T2, entrega 30 000,00 SINPE: comisión 1 000,00 + IVA 130,00
//   G3 tienda T1, rechazo: flete de no entregadas 2 000,00 + IVA 260,00 (va al flete de devolución)

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

const SNAPSHOTS_BN: SnapshotsAgregadosBodega = {
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  totalIngresoBodegaRechazos: "500.00",
};

const G1: GestionDeTienda = {
  resultado: "entregado",
  pagos: [{ metodo: "efectivo", monto: "70000.00" }],
  tiendaId: "tienda-t1",
  tiendaNombre: "T1",
  ingresoEmpresa: ingreso({
    montoCobrar: "70000.00",
    flete: "4000.00",
    ivaFlete: "520.00",
    fleteConIva: "4520.00",
    total: "4520.00",
  }),
};

const G2: GestionDeTienda = {
  resultado: "entregado",
  pagos: [{ metodo: "SINPE", monto: "30000.00" }],
  tiendaId: "tienda-t2",
  tiendaNombre: "T2",
  ingresoEmpresa: ingreso({
    montoCobrar: "30000.00",
    cobraComision: true,
    comisionCod: "1000.00",
    ivaComisionCod: "130.00",
    comisionConIva: "1130.00",
    total: "1130.00",
  }),
};

const G3: GestionDeTienda = {
  resultado: "devolucion_a_origen_por_rechazo",
  pagos: [],
  tiendaId: "tienda-t1",
  tiendaNombre: "T1",
  ingresoEmpresa: ingreso({
    fleteDevolucion: "2000.00",
    ivaFleteDevolucion: "260.00",
    fleteDevolucionConIva: "2260.00",
    total: "2260.00",
  }),
};

describe("SLT-141 — cifrasAgregadasBodega (R387)", () => {
  it("BN: dos tiendas y un rechazo de T1 dan las cifras escritas a mano", () => {
    const c = cifrasAgregadasBodega(SNAPSHOTS_BN, [G1, G2, G3]);

    expect(c.totalesIngreso.total).toBe("7910.00"); // «Total facturado»: 4 520 + 1 130 + 2 260
    expect(c.ivaFacturado).toBe("910.00"); // 520 + 130 + 260
    expect(c.ganancia).toBe("4000.00"); // 7 000 (sin IVA) − 3 000
    expect(c.pagoTienda).toBe("94350.00"); // 100 000 − 4 520 − 1 130 (el rechazo no se resta)
    expect(c.cobradoSobreRecaudado).toBe("5650.00"); // 4 520 + 1 130
    expect(c.netoEmpresa).toBe("3500.00"); // 7 910 − 910 − 3 000 − 500
    expect(c.ganaLaTienda).toBe("92090.00"); // 100 000 − 7 910
  });

  it("BN: «Por tienda» en el orden del detalle (de mayor a menor pago), sin repartir el agregado", () => {
    const c = cifrasAgregadasBodega(SNAPSHOTS_BN, [G2, G1, G3]);

    expect(c.partesPorTienda).toEqual([
      { tiendaId: "tienda-t1", tiendaNombre: "T1", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
      { tiendaId: "tienda-t2", tiendaNombre: "T2", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
    ]);
  });

  it("los minuendos son el snapshot AGREGADO del cierre de bodega, no lo que suman sus gestiones", () => {
    // Asimetría honesta (ficha 396): el snapshot agregado dice 101 000,00 recaudado y 3 200,00 de pago
    // al mensajero; las gestiones suman 100 000,00. Manda el snapshot; el reparto sale de las gestiones.
    const snapshotDistinto: SnapshotsAgregadosBodega = {
      totales: { efectivo: "71000.00", simpe: "30000.00", transferencia: "0.00", general: "101000.00" },
      totalPagoMensajero: "3200.00",
      totalIngresoBodegaRechazos: "500.00",
    };
    const c = cifrasAgregadasBodega(snapshotDistinto, [G1, G2, G3]);

    expect(c.pagoTienda).toBe("95350.00"); // 101 000 − 4 520 − 1 130
    expect(c.ganaLaTienda).toBe("93090.00"); // 101 000 − 7 910
    expect(c.ganancia).toBe("3800.00"); // 7 000 − 3 200
    expect(c.netoEmpresa).toBe("3300.00"); // 7 000 − 3 200 − 500
    expect(c.partesPorTienda.map((p) => p.recaudado)).toEqual(["70000.00", "30000.00"]);
  });

  it("sin gestiones con desglose: lo facturado es cero y el neto resta los dos pagos con su signo", () => {
    const c = cifrasAgregadasBodega(SNAPSHOTS_BN, []);

    expect(c.totalesIngreso.total).toBe("0.00");
    expect(c.netoEmpresa).toBe("-3500.00");
    expect(c.ganaLaTienda).toBe("100000.00");
    expect(c.partesPorTienda).toEqual([]);
  });
});
