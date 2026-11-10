import { describe, expect, it } from "vitest";

import {
  COLUMNAS_DESCARGA_DETALLE_CIERRE,
  filaDescargaDetalleCierre,
} from "@/components/private/cierres/detalle/detalle-cierre-descarga-columnas";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";

// SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (T2.2, R21, R82) — las columnas
// de «Descargar» en la pestaña «Gestiones» del detalle único. Los esperados van ESCRITOS A MANO: el
// orden y el texto de las cabeceras son lo que llega al archivo del usuario, y compararlos contra la
// propia constante sería una tautología siempre verde.

function gestion(extra: Partial<CierreDetalleGestion> = {}): CierreDetalleGestion {
  return {
    gestionId: "g-1",
    ordenId: "o-1",
    numGuia: 1044,
    destinatario: "Laura Vega",
    tiendaNombre: "Tienda Norte",
    resultado: "entregado",
    montoRecibido: "70000.00",
    pagoMensajero: "1500.00",
    ingresoEmpresa: { total: "3165.00" },
    ...extra,
  } as CierreDetalleGestion;
}

describe("SLT-100 — columnas de «Descargar» del detalle del cierre (R82)", () => {
  it("son siete, en este orden, con estas cabeceras", () => {
    expect(COLUMNAS_DESCARGA_DETALLE_CIERRE.map((c) => c.clave)).toEqual([
      "numGuia",
      "destinatario",
      "tienda",
      "resultado",
      "recibido",
      "cobroTienda",
      "pagoMensajero",
    ]);
    expect(COLUMNAS_DESCARGA_DETALLE_CIERRE.map((c) => c.encabezado)).toEqual([
      "Nº Guía",
      "Destinatario",
      "Tienda",
      "Resultado",
      "Recibido",
      "Cobro a la tienda",
      "Pago al mensajero",
    ]);
  });

  it("una fila lleva los strings del servidor tal cual y el resultado legible", () => {
    expect(filaDescargaDetalleCierre(gestion())).toEqual({
      numGuia: 1044,
      destinatario: "Laura Vega",
      tienda: "Tienda Norte",
      resultado: "Entregado",
      recibido: "70000.00",
      cobroTienda: "3165.00",
      pagoMensajero: "1500.00",
    });
  });

  it("un importe ausente sale como celda vacía (null), nunca «0»", () => {
    const fila = filaDescargaDetalleCierre(
      gestion({ resultado: "reprogramado", montoRecibido: null, pagoMensajero: null, ingresoEmpresa: null }),
    );
    expect(fila.recibido).toBeNull();
    expect(fila.cobroTienda).toBeNull();
    expect(fila.pagoMensajero).toBeNull();
    expect(Object.values(fila)).not.toContain("0");
    expect(Object.values(fila)).not.toContain("0.00");
  });

  it("sin `ingresoEmpresa` en el doble (campo opcional) también sale vacía", () => {
    const sinCampo = gestion();
    delete (sinCampo as Partial<CierreDetalleGestion>).ingresoEmpresa;
    expect(filaDescargaDetalleCierre(sinCampo).cobroTienda).toBeNull();
  });
});
