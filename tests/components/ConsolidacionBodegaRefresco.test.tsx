// @vitest-environment jsdom
/**
 * SL-44 (defecto destapado por el E2E `e2e/cierre-bodega-satelite.spec.ts`) — tras «Solicitar
 * cierre de bodega», las DOS listas de la consolidación se vuelven a leer sin recargar.
 *
 * El defecto: `confirmarSolicitud` solo llamaba a `router.refresh()`. Las dos listas son `useSWR`
 * con la página del Server Component como `fallbackData`, que SWR usa una sola vez; con la caché
 * ya llena, la consolidación recién creada no salía en «Solicitados» (medido en el E2E: «Aún no
 * has solicitado ningún cierre de bodega.» después del aviso de éxito) y lo consolidado seguía en
 * «A consolidar». Mismo defecto y mismo arreglo que ya tienen `CierreDiaModule` y
 * `CierresAdminModule` (pedido humano del 2026-08-19).
 *
 * Mutación que lo tumba: quitar el `mutate(...)` de `confirmarSolicitud`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreBodegaResumenLite } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";

const { consolidables, solicitados, solicitar } = vi.hoisted(() => ({
  consolidables: vi.fn(),
  solicitados: vi.fn(),
  solicitar: vi.fn(),
}));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarGestionesCierresBodegaCompleto: vi.fn(),
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  solicitarCierreBodega: (...a: unknown[]) => solicitar(...a),
  listarCierresBodegaAdmin: vi.fn(),
  listarConsolidacion: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarConsolidablesPaginado: (...a: unknown[]) => consolidables(...a),
  listarCierresBodegaSolicitadosPaginado: (...a: unknown[]) => solicitados(...a),
  listarConsolidablesCompleto: vi.fn(),
  listarCierresBodegaSolicitadosCompleto: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import { ConsolidacionBodegaModule } from "@/app/(app)/cierres-admin/_components/ConsolidacionBodegaModule";

const TOTALES: CierreTotales = { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" };

const CONSOLIDABLE: CierreBodegaResumenLite = {
  cierreDiaId: "cd-1",
  mensajeroId: "m-1",
  mensajeroNombre: "Mensajero Uno",
  totales: TOTALES,
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
};

function pagina<T>(items: T[]) {
  return { status: "ok" as const, items, page: 1, pageSize: 10, total: items.length };
}

function montar() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConsolidacionBodegaModule
        consolidables={{ items: [CONSOLIDABLE], total: 1, pageSize: 10 }}
        totalesAgregados={TOTALES}
        totalPagoMensajeroAgregado="1500.00"
        totalIngresoBodegaRechazosAgregado="0.00"
        totalNetoAgregado="7500.00"
        totalCentralDebeAgregado="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        cierresBodegaPasados={{ items: [], total: 0, pageSize: 10 }}
        sinZona={false}
      />
    </SWRConfig>,
  );
}

describe("ConsolidacionBodegaModule — refresco tras solicitar el cierre de bodega (SL-44)", () => {
  beforeEach(() => {
    consolidables.mockReset();
    solicitados.mockReset();
    solicitar.mockReset();
  });

  it("vuelve a leer «A consolidar» y «Solicitados» y pinta lo que devuelve el servidor", async () => {
    // Antes de solicitar: un consolidable y ningún solicitado. Después: al revés.
    let solicitado = false;
    consolidables.mockImplementation(async () => pagina(solicitado ? [] : [CONSOLIDABLE]));
    solicitados.mockImplementation(async () => pagina([]));
    solicitar.mockImplementation(async () => {
      solicitado = true;
      return { status: "ok", cierreBodegaId: "b-1", totales: TOTALES };
    });
    montar();
    await waitFor(() => expect(consolidables).toHaveBeenCalled());
    await waitFor(() => expect(solicitados).toHaveBeenCalled());
    const lecturasConsolidables = consolidables.mock.calls.length;
    const lecturasSolicitados = solicitados.mock.calls.length;

    const usuario = userEvent.setup();
    await usuario.click(
      within(screen.getByRole("region", { name: "Solicitar cierre de bodega" })).getByRole("button", {
        name: "Solicitar cierre de bodega",
      }),
    );
    await usuario.click(
      within(screen.getByRole("dialog", { name: "Solicitar cierre de bodega" })).getByRole("button", {
        name: "Solicitar cierre de bodega",
      }),
    );

    expect(solicitar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(consolidables.mock.calls.length).toBeGreaterThan(lecturasConsolidables));
    await waitFor(() => expect(solicitados.mock.calls.length).toBeGreaterThan(lecturasSolicitados));
    // Lo que ve el usuario: el consolidado ya no está en «A consolidar».
    await waitFor(() =>
      expect(screen.getByText("No hay cierres del día aprobados para consolidar.")).toBeTruthy(),
    );
  });
});
