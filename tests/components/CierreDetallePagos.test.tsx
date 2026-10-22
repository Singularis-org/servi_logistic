// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CierreFacturaDetalle,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { METODO_LABEL } from "@/app/(app)/cierres-admin/_components/cierre-labels";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
} from "@/lib/interfaces/services/ICierreDiaService";

/**
 * Feature 213 (T9) — la PRESENTACIÓN del desglose de pago en el comprobante tipo factura
 * (`cierre-factura`): el que ve el admin en el detalle de un cierre —de mensajero y, desde la
 * 478, también de bodega— y el que ve el mensajero al abrir un cierre pasado. El otro sitio —la
 * tabla del cierre del día— tiene sus casos gemelos en `CierreDiaModule.test.tsx`, donde ya vive
 * el arnés de ese módulo.
 *
 * Lo que se afirma aquí (R20/R21/R22/R24/R25): que lo pintado sale del DESGLOSE y no del campo
 * escalar (R23), en el orden del DTO, con las etiquetas de `METODO_LABEL` y la moneda de
 * configuración.
 *
 * FICHA 482 (2026-10-15): aquí había un segundo bloque, «una columna por medio de pago», sobre
 * la tabla del detalle de bodega (`DetalleSecciones`). Esa tabla se retiró (478) y se borró
 * (482); las mismas R siguen afirmadas abajo sobre la superficie que la sustituyó.
 */

function makeGestion(
  over: Partial<CierreDetalleGestion> & {
    gestionId: string;
    resultado: CierreResultado;
  },
): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-07-11",
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Ana Pérez",
    direccion: "Calle 1, casa 2",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja mediana",
    tiendaNombre: "Tienda X",
    montoRecibido: null,
    metodoPago: null,
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false, // feature 237 (D6/R41): la registro el mensajero, no la tienda
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

function emptyGrupos(): CierreGrupos {
  return {
    entregado: [],
    reprogramado: [],
    novedad: [],
    devolucion_a_origen_por_rechazo: [],
    incidente: [],
  };
}

/** Una entrega de 8.000 con el desglose que le pase el caso. */
function gruposConEntrega(over: Partial<CierreDetalleGestion>): CierreGrupos {
  return {
    ...emptyGrupos(),
    entregado: [
      makeGestion({
        gestionId: "g1",
        resultado: "entregado",
        montoRecibido: "8000.00",
        ...over,
      }),
    ],
  };
}

const CABECERA: CierreFacturaCabecera = {
  cierreId: "c1",
  estado: "solicitado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "GAM",
  totales: {
    efectivo: "5000.00",
    simpe: "0.00",
    transferencia: "3000.00",
    general: "8000.00",
  },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-08-11T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
};

/** Abre el renglón de la orden en el comprobante y devuelve el texto de la fila «Recibido». */
async function recibidoEnFactura(grupos: CierreGrupos): Promise<string> {
  const user = userEvent.setup();
  render(<CierreFacturaDetalle cierre={CABECERA} grupos={grupos} />);
  await user.click(
    screen.getByRole("button", { name: "Detalle de la orden REM-001 · Ana Pérez" }),
  );
  const rotulo = screen.getByText("Recibido:");
  const fila = rotulo.parentElement as HTMLElement;
  return fila.textContent?.replace("Recibido:", "").trim() ?? "";
}

afterEach(() => {
  cleanup();
});

describe("Feature 213 — desglose de pago en el comprobante (cierre-factura)", () => {
  it("R20: una sola línea deja la fila «Recibido» EXACTAMENTE como antes: monto · etiqueta", async () => {
    const texto = await recibidoEnFactura(
      gruposConEntrega({ pagos: [{ metodo: "SINPE", monto: "8000.00" }] }),
    );

    expect(texto).toBe("₡8.000 · SINPE");
  });

  it("R21: dos líneas ponen los DOS métodos con su monto junto a lo recibido", async () => {
    const texto = await recibidoEnFactura(
      gruposConEntrega({
        pagos: [
          { metodo: "efectivo", monto: "5000.00" },
          { metodo: "transferencia", monto: "3000.00" },
        ],
      }),
    );

    expect(texto).toBe("₡8.000 · Efectivo ₡5.000 + Transferencia ₡3.000");
  });

  it("R22/R23: sin líneas la fila muestra SOLO el monto —lo mismo que hoy—, aunque la gestión traiga el escalar", async () => {
    // El marcador de ausencia de ESTA fila es no decir nada del método (`DatoFila` no pinta
    // lo que no aplica): sin líneas no aparece separador ni texto nuevo (R22). Y con
    // `metodoPago` puesto seguiría igual, que es lo que prueba R23.
    const texto = await recibidoEnFactura(
      gruposConEntrega({ metodoPago: "SINPE", pagos: [] }),
    );

    expect(texto).toBe("₡8.000");
  });

  it("R24: se pinta el ORDEN del DTO, no el alfabético", async () => {
    const texto = await recibidoEnFactura(
      gruposConEntrega({
        pagos: [
          { metodo: "transferencia", monto: "3000.00" },
          { metodo: "SINPE", monto: "2000.00" },
          { metodo: "efectivo", monto: "3000.00" },
        ],
      }),
    );

    expect(texto).toBe(
      "₡8.000 · Transferencia ₡3.000 + SINPE ₡2.000 + Efectivo ₡3.000",
    );
  });

  it("R25: la etiqueta sale de METODO_LABEL (mutarla cambia lo pintado)", async () => {
    const original = METODO_LABEL.SINPE;
    try {
      METODO_LABEL.SINPE = "SINPE-MUTADO";
      const texto = await recibidoEnFactura(
        gruposConEntrega({ pagos: [{ metodo: "SINPE", monto: "8000.00" }] }),
      );
      expect(texto).toBe("₡8.000 · SINPE-MUTADO");
    } finally {
      METODO_LABEL.SINPE = original;
    }
  });
});
