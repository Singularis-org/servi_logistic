// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import {
  CierreFacturaDetalle,
  CierreFacturaResumen,
  CierreFacturaResumenPropio,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreGrupos, CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";

/**
 * FICHA 480 — un cierre REENVIADO tras un rechazo (feature 477) vuelve a `solicitado`, pero la
 * columna `motivo_rechazo` conserva el texto del rechazo anterior. Las tres superficies del
 * comprobante del cierre de mensajero pintaban «Motivo de rechazo: ...» con solo existir el
 * texto. Ahora el motivo se ve SOLO con el cierre en `rechazado`.
 *
 * Cada caso del `solicitado` trae el motivo PRESENTE en el dato: es justo el escenario real del
 * reenvío. Si alguien vuelve a condicionar solo por `motivoRechazo`, estos casos se ponen rojos.
 */

const MOTIVO = "Falta el efectivo de la guía 1001";
const ETIQUETA = "Motivo de rechazo";

const TOTALES = {
  efectivo: "1000.00",
  simpe: "0.00",
  transferencia: "0.00",
  general: "1000.00",
};

function resumen(estado: CierreAdminResumen["estado"]): CierreAdminResumen {
  return {
    cierreId: "c1000001",
    mensajeroId: "m1",
    mensajeroNombre: "Ana Pérez",
    estado,
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: TOTALES,
    totalPagoMensajero: "1200.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-08-13T10:00:00.000Z",
    resueltoAt: estado === "rechazado" ? "2026-08-13T12:00:00.000Z" : null,
    motivoRechazo: MOTIVO,
  };
}

function propio(estado: CierrePasadoDTO["estado"]): CierrePasadoDTO {
  return {
    cierreId: "c1000001",
    estado,
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    totales: TOTALES,
    totalPagoMensajero: "1200.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-08-13T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: MOTIVO,
  };
}

function cabecera(estado: CierreFacturaCabecera["estado"]): CierreFacturaCabecera {
  return {
    cierreId: "c1000001",
    estado,
    destinoTipo: "bodega_central",
    destinoZonaNombre: "GAM",
    mensajeroNombre: "Ana Pérez",
    totales: TOTALES,
    totalPagoMensajero: "1200.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-08-13T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: MOTIVO,
  };
}

const GRUPOS: CierreGrupos = {
  entregado: [],
  reprogramado: [],
  novedad: [],
  devolucion_a_origen_por_rechazo: [],
  incidente: [],
};

function hojaAdmin(): HTMLElement {
  return screen.getByRole("region", { name: "Comprobante del cierre de Ana Pérez" });
}

function hojaPropia(): HTMLElement {
  return screen.getByRole("region", { name: /^Comprobante de tu cierre del / });
}

function hojaDetalle(): HTMLElement {
  return screen.getByRole("region", {
    name: "Comprobante detallado del cierre de Ana Pérez",
  });
}

afterEach(() => {
  cleanup();
});

describe("480 · el motivo de rechazo solo se ve con el cierre rechazado", () => {
  describe("comprobante compacto del admin (cola e histórico)", () => {
    it("rechazado: se ve el motivo", () => {
      render(<CierreFacturaResumen cierre={resumen("rechazado")} />);
      expect(hojaAdmin()).toHaveTextContent(`${ETIQUETA}: ${MOTIVO}`);
    });

    it("solicitado (reenviado) con motivo presente: no se ve", () => {
      render(<CierreFacturaResumen cierre={resumen("solicitado")} />);
      expect(hojaAdmin()).not.toHaveTextContent(ETIQUETA);
      expect(hojaAdmin()).not.toHaveTextContent(MOTIVO);
    });
  });

  describe("comprobante compacto del mensajero (su histórico)", () => {
    it("rechazado: se ve el motivo", () => {
      render(<CierreFacturaResumenPropio cierre={propio("rechazado")} />);
      expect(hojaPropia()).toHaveTextContent(`${ETIQUETA}: ${MOTIVO}`);
    });

    it("solicitado (reenviado) con motivo presente: no se ve", () => {
      render(<CierreFacturaResumenPropio cierre={propio("solicitado")} />);
      expect(hojaPropia()).not.toHaveTextContent(ETIQUETA);
      expect(hojaPropia()).not.toHaveTextContent(MOTIVO);
    });
  });

  describe("comprobante detallado", () => {
    it("rechazado: se ve el motivo en el pie", () => {
      render(<CierreFacturaDetalle cierre={cabecera("rechazado")} grupos={GRUPOS} />);
      expect(hojaDetalle()).toHaveTextContent(`${ETIQUETA}: ${MOTIVO}`);
    });

    it("solicitado (reenviado) con motivo presente: no se ve", () => {
      render(<CierreFacturaDetalle cierre={cabecera("solicitado")} grupos={GRUPOS} />);
      expect(hojaDetalle()).not.toHaveTextContent(ETIQUETA);
      expect(hojaDetalle()).not.toHaveTextContent(MOTIVO);
    });
  });
});
