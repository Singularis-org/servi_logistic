// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

// SLT-125 (design §3, §5; R8, R10) — LA «UBICACIÓN» DE UNA LÍNEA EN LAS TRES PANTALLAS DE DETALLE:
// el cierre de día del mensajero (`CierreDiaModule`), el comprobante de cierres admin
// (`CierreFacturaDetalle`, que usa `ubicacion` de `cierre-detalle-shared`) y el detalle de recepción
// satélite (`RecepcionDetalle`).
//
// Las tres arman la línea igual que las descargas (R7): la zona y TODOS los nombres de la ruta
// (`lugarRuta`, del nivel 1 al lugar), unidos por « · », sin tramos vacíos; «—» si no queda ninguno.
// Sin `lugarRuta`, los tres nombres de hoy: en Costa Rica, lo mismo que antes. Los textos esperados son
// literales. Los nombres de las rutas de 2, 4 y 10 niveles son inventados: ninguno es un tipo (R42).

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import {
  CierreFacturaDetalle,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { RecepcionDetalle } from "@/app/(app)/recepcion-satelite/_components/RecepcionDetalle";
import { listarCierresPasadosPaginado } from "@/lib/actions/cierre-dia";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreTotales,
} from "@/lib/interfaces/services/ICierreDiaService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { CIERRE_DIA_CR, SATELITE_CR } from "@/tests/fixtures/descargas-cr/entrada";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

const paso = (nombre: string, i: number) => ({ id: `n-${i}`, nombre });

const RUTAS = [
  ["2 niveles", ["Alfa", "Beta"], "Zona Central · Alfa · Beta"],
  ["3 niveles", ["Alfa", "Beta", "Gama"], "Zona Central · Alfa · Beta · Gama"],
  ["4 niveles", ["Alfa", "Beta", "Gama", "Delta"], "Zona Central · Alfa · Beta · Gama · Delta"],
  [
    "10 niveles",
    ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10"],
    "Zona Central · N1 · N2 · N3 · N4 · N5 · N6 · N7 · N8 · N9 · N10",
  ],
] as const;

/** Costa Rica, antes de SLT-125: la fila «carmen» de la entrada CR. */
const LINEA_CR = "Zona Central · San José · San José · Carmen";

const ZERO_TOTALES: CierreTotales = { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" };

function gruposCon(g: CierreDetalleGestion): CierreGrupos {
  return { entregado: [g], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

/** La gestión entregada de la entrada CR, con la ruta y la zona que pida el caso. */
function gestion(over: Partial<CierreDetalleGestion> = {}): CierreDetalleGestion {
  return { ...CIERRE_DIA_CR[0]!, ...over };
}

function renderCierreDia(g: CierreDetalleGestion) {
  const pagina = paginaInicial([]);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={gruposCon(g)}
        totales={ZERO_TOTALES}
        totalPagoMensajero="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        cierresPasados={pagina}
        bloqueo={SIN_BLOQUEO}
      />
    </SWRConfig>,
  );
  return within(screen.getByRole("region", { name: "Entregado" }));
}

const CABECERA: CierreFacturaCabecera = {
  cierreId: "c1",
  estado: "solicitado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "GAM",
  totales: { efectivo: "15000.00", simpe: "0.00", transferencia: "0.00", general: "15000.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-11-11T23:10:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
};

async function renderComprobante(g: CierreDetalleGestion) {
  const user = userEvent.setup();
  render(<CierreFacturaDetalle cierre={CABECERA} grupos={gruposCon(g)} />);
  await user.click(screen.getByRole("button", { name: /de la orden REM-125-001 · Destinatario Uno$/ }));
}

function ubicacionSatelite(over: Record<string, unknown> = {}): string {
  render(<RecepcionDetalle orden={{ ...SATELITE_CR[0]!, ...over }} />);
  const dt = screen.getByText("Ubicación");
  return dt.parentElement!.querySelector("dd")!.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("R8 — cierre de día del mensajero: «Ubicación» con toda la ruta", () => {
  it.each(RUTAS)("%s", (_, nombres, linea) => {
    const region = renderCierreDia(gestion({ lugarRuta: nombres.map(paso) }));
    expect(region.getByText(linea)).toBeInTheDocument();
  });

  it("R10: Costa Rica sin `lugarRuta` y con la ruta del catálogo, la misma línea de hoy", () => {
    const region = renderCierreDia(gestion());
    expect(region.getByText(LINEA_CR)).toBeInTheDocument();
    cleanup();
    const conRuta = renderCierreDia(
      gestion({ lugarRuta: [paso("San José", 0), paso("San José", 1), paso("Carmen", 2)] }),
    );
    expect(conRuta.getByText(LINEA_CR)).toBeInTheDocument();
  });

  it("sin ningún tramo, «—»", () => {
    const region = renderCierreDia(gestion({ zonaNombre: "", lugarRuta: [] }));
    expect(region.queryByText(/San José/)).toBeNull();
    expect(region.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("R8 — comprobante de cierres admin: «Ubicación» con toda la ruta", () => {
  it.each(RUTAS)("%s", async (_, nombres, linea) => {
    await renderComprobante(gestion({ lugarRuta: nombres.map(paso) }));
    expect(screen.getByText(linea)).toBeInTheDocument();
  });

  it("omite los tramos vacíos", async () => {
    await renderComprobante(gestion({ zonaNombre: "", lugarRuta: [paso("Alfa", 0), paso("", 1), paso("Gama", 2)] }));
    expect(screen.getByText("Alfa · Gama")).toBeInTheDocument();
  });

  it("R10: Costa Rica sin `lugarRuta`, la línea de hoy", async () => {
    await renderComprobante(gestion());
    expect(screen.getByText(LINEA_CR)).toBeInTheDocument();
  });
});

describe("R8 — detalle de recepción satélite: «Ubicación» con toda la ruta", () => {
  it.each(RUTAS)("%s", (_, nombres, linea) => {
    expect(ubicacionSatelite({ lugarRuta: nombres.map(paso) })).toBe(linea);
  });

  it("sin ningún tramo, «—»", () => {
    expect(ubicacionSatelite({ zonaNombre: "", lugarRuta: [] })).toBe("—");
  });

  it("R10: Costa Rica sin `lugarRuta` y con la ruta del catálogo, la misma línea de hoy", () => {
    expect(ubicacionSatelite()).toBe(LINEA_CR);
    cleanup();
    expect(ubicacionSatelite({ lugarRuta: [paso("San José", 0), paso("San José", 1), paso("Carmen", 2)] })).toBe(
      LINEA_CR,
    );
  });
});
