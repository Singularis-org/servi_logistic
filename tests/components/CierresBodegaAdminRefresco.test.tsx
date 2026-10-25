// @vitest-environment jsdom
/**
 * SL-44 (defecto destapado por el E2E `e2e/cierre-bodega-satelite.spec.ts`) — al marcar recibida
 * una consolidación, «Resueltos» se vuelve a leer sin recargar.
 *
 * El defecto: `refrescarListas` de `CierresBodegaAdminModule` revalidaba solo la COLA
 * («cierres-bodega:pendientes»). Las dos pestañas siguen montadas (`PanelConmutado`) y cada una
 * con su caché de SWR, así que la consolidación recién marcada salía de «Pendientes» pero no
 * entraba en «Resueltos» hasta recargar (medido en el E2E). `CierresAdminModule` ya revalida su
 * par (pendientes + histórico); aquí faltaba la mitad.
 *
 * Mutación que lo tumba: quitar la clave «cierres-bodega:resueltos» de `refrescarListas`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";

vi.mock("@/lib/actions/cierre-bodega", () => ({
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaCompleto: vi.fn(),
  listarGestionesCierresBodegaCompleto: vi.fn(),
}));
vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  marcarConsolidacionRecibidaAction: vi.fn(),
  corregirConsolidacionRecibidaAction: vi.fn(),
  revertirConciliacionAction: vi.fn(),
  listarSaldosSatelitesAction: vi.fn(),
  listarSaldosSatelitesCompletoAction: vi.fn(),
  listarConsolidacionesSateliteAction: vi.fn(),
  listarConsolidacionesSateliteCompletoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { marcarConsolidacionRecibidaAction } from "@/lib/actions/conciliacion-satelites";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";

const CERO_INGRESO: TotalesIngresoEmpresa = {
  montoCobrar: "0.00",
  flete: "0.00",
  ivaFlete: "0.00",
  fleteDevolucion: "0.00",
  ivaFleteDevolucion: "0.00",
  comisionCod: "0.00",
  ivaComisionCod: "0.00",
  fleteConIva: "0.00",
  comisionConIva: "0.00",
  fleteDevolucionConIva: "0.00",
  total: "0.00",
};

const CABECERA: CierreBodegaResumen = {
  cierreBodegaId: "b1b1b1b1-1111-4111-8111-b1b1b1b1b1b1",
  zonaId: "33333333-3333-4333-8333-333333333333",
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 1,
  solicitadoAt: "2026-09-01T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "9000.00",
  efectivoCubreDescuentos: true,
  ...marcaSinConciliar("9000.00"),
};

const DETALLE = {
  status: "ok" as const,
  cierre: CABECERA,
  cierres: [],
  totalesIngreso: CERO_INGRESO,
  ivaFacturado: "0.00",
  ganancia: "0.00",
  pagoTienda: "9000.00",
  cobradoSobreRecaudado: "0.00",
  netoEmpresa: "0.00",
  ganaLaTienda: "9000.00",
  partesPorTienda: [],
  paraLaCentral: "9000.00",
  efectivoCubreDescuentos: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("CierresBodegaAdminModule — refresco tras marcar recibida (SL-44)", () => {
  it("vuelve a leer «Resueltos» además de «Pendientes»", async () => {
    vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([CABECERA]) });
    vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([]) });
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue(DETALLE);
    vi.mocked(marcarConsolidacionRecibidaAction).mockResolvedValue({ status: "ok" } as never);

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CierresBodegaAdminModule pendientes={paginaInicial([CABECERA])} historico={paginaInicial([])} puedeConciliar />
      </SWRConfig>,
    );
    await waitFor(() => expect(listarHistoricoCierresBodegaPaginado).toHaveBeenCalled());
    const lecturasResueltos = vi.mocked(listarHistoricoCierresBodegaPaginado).mock.calls.length;
    const lecturasPendientes = vi.mocked(listarPendientesCierresBodegaPaginado).mock.calls.length;

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ver / decidir el cierre de bodega de Limón" }));
    await user.click(await screen.findByRole("button", { name: /^Marcar recibido la consolidación de Limón/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Marcar recibido" })).getByRole("button", { name: "Marcar recibido" }));

    expect(marcarConsolidacionRecibidaAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(vi.mocked(listarPendientesCierresBodegaPaginado).mock.calls.length).toBeGreaterThan(lecturasPendientes),
    );
    await waitFor(() =>
      expect(vi.mocked(listarHistoricoCierresBodegaPaginado).mock.calls.length).toBeGreaterThan(lecturasResueltos),
    );
  });
});
