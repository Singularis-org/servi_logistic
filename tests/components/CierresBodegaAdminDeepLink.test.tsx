// @vitest-environment jsdom
/**
 * SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña» (T2, R238) — `?cierreBodega=<id>`
 * en `/cierres-admin`: `CierresTabs` arranca en «Bodega» y `CierresBodegaAdminModule` abre el detalle
 * único de ESE cierre con la misma lectura que «Ver / decidir» de la cola; al cerrarlo, quita el
 * parámetro con `replace` conservando los demás. Espejo de `CierresAdminDeepLink.test.tsx`.
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const url = vi.hoisted(() => ({ parametros: new URLSearchParams() }));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  show: vi.fn(),
  dismiss: vi.fn(),
}));

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
  useRouter: () => nav,
  usePathname: () => "/cierres-admin",
  useSearchParams: () => url.parametros,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { CierresTabs } from "@/app/(app)/cierres-admin/_components/CierresTabs";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";

type Ok = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;

/** Un id que no está en la cola: el enlace abre por id, no buscando la fila. */
const ID_FUERA_DE_LA_COLA = "b7e4d2c1-9a8f-4e3d-8c2b-71f05a6e9d3c";

const PENDIENTE: CierreBodegaResumen = {
  cierreBodegaId: "b1b1b1b1-1111-4111-8111-0000c07b3e19",
  zonaId: "33333333-3333-4333-8333-333333333333",
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "34000.00", simpe: "0.00", transferencia: "0.00", general: "34000.00" },
  totalPagoMensajero: "3300.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 2,
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "30700.00",
  efectivoCubreDescuentos: true,
  ...marcaSinConciliar("34000.00"),
};

const CERO_INGRESO = {
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

function detalle(cierre: CierreBodegaResumen): Ok {
  return {
    status: "ok",
    cierre,
    cierres: [],
    totalesIngreso: CERO_INGRESO,
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: cierre.paraLaCentral,
    efectivoCubreDescuentos: true,
  } as unknown as Ok;
}

const NOMBRE_DIALOGO = "Detalle del cierre de bodega · Cierre de bodega · Limón";

beforeEach(() => {
  vi.clearAllMocks();
  url.parametros = new URLSearchParams();
  vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([PENDIENTE]) });
  vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([]) });
});
afterEach(cleanup);

function montarPantalla() {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresTabs
        bodega={
          <CierresBodegaAdminModule
            pendientes={paginaInicial([PENDIENTE])}
            historico={paginaInicial([])}
            puedeConciliar
            audiencia="admin"
          />
        }
        mensajero={<p>Cierres del día de los mensajeros</p>}
      />
    </SWRConfig>,
  );
  return userEvent.setup();
}

/** El panel de una mitad (`PanelConmutado`); el oculto no se alcanza por rol, así que va por atributo. */
function panel(nombre: string): HTMLElement {
  const el = document.querySelector(`[role="group"][aria-label="${nombre}"]`);
  if (!el) throw new Error(`No hay panel «${nombre}»`);
  return el as HTMLElement;
}

describe("R238 — `?cierreBodega=<id>` abre el detalle único en la mitad «Bodega»", () => {
  it("arranca en «Bodega» y abre el detalle de ESE id con la lectura de la cola", async () => {
    url.parametros = new URLSearchParams({ cierreBodega: ID_FUERA_DE_LA_COLA });
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(PENDIENTE));
    montarPantalla();

    expect(panel("Bodega").hidden).toBe(false);
    expect(panel("Mensajero").hidden).toBe(true);

    const dialogo = await screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
    expect(dialogo).toBeTruthy();
    expect(verCierreBodegaDetalle).toHaveBeenCalledTimes(1);
    expect(verCierreBodegaDetalle).toHaveBeenCalledWith({ cierreBodegaId: ID_FUERA_DE_LA_COLA });
  });

  it("sin el parámetro arranca en «Mensajero» y no abre ningún detalle (como hoy)", async () => {
    montarPantalla();
    expect(panel("Mensajero").hidden).toBe(false);
    expect(panel("Bodega").hidden).toBe(true);
    await waitFor(() => expect(listarPendientesCierresBodegaPaginado).toHaveBeenCalled());
    expect(verCierreBodegaDetalle).not.toHaveBeenCalled();
  });

  it("al cerrar, quita `cierreBodega` con replace y conserva los demás parámetros", async () => {
    url.parametros = new URLSearchParams({ cierreBodega: ID_FUERA_DE_LA_COLA, vista: "tabla-zeta" });
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(PENDIENTE));
    const user = montarPantalla();

    const dialogo = await screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
    const footer = dialogo.querySelector("footer") as HTMLElement;
    await user.click(within(footer).getByRole("button", { name: "Cerrar" }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/cierres-admin?vista=tabla-zeta", { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("el detalle abierto desde la cola no toca la dirección al cerrar", async () => {
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(PENDIENTE));
    const user = montarPantalla();
    await user.click(screen.getByRole("button", { name: "Bodega" }));
    await user.click(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }));
    const dialogo = await screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
    await user.click(within(dialogo.querySelector("footer") as HTMLElement).getByRole("button", { name: "Cerrar" }));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("SI la lectura responde `no_encontrada`, avisa como la cola y deja la cola visible", async () => {
    url.parametros = new URLSearchParams({ cierreBodega: ID_FUERA_DE_LA_COLA });
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue({ status: "no_encontrada" } as unknown as Ok);
    montarPantalla();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("El cierre de bodega ya no está disponible. Actualizando la lista."),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" })).toBeTruthy();
  });

  // Review 1 (menor 5): si el parámetro se quedara, recargar repetiría el mismo aviso de error.
  it.each([["no_encontrada"], ["forbidden"]])(
    "si la lectura responde `%s`, quita `cierreBodega` con replace y conserva los demás",
    async (status) => {
      url.parametros = new URLSearchParams({ cierreBodega: ID_FUERA_DE_LA_COLA, vista: "tabla-zeta" });
      vi.mocked(verCierreBodegaDetalle).mockResolvedValue({ status } as unknown as Ok);
      montarPantalla();

      await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
      expect(nav.replace).toHaveBeenCalledWith("/cierres-admin?vista=tabla-zeta", { scroll: false });
      expect(nav.push).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
});
