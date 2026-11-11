// @vitest-environment jsdom
/**
 * SLT-127 «Cola de bodega de la central con la cola única» (T3.3) — `CierresBodegaAdminModule` monta
 * `ColaCierres` de verdad (sin doble de la cola): conteos del servidor, una barra para las dos
 * listas, la descarga y la paginación de la pestaña activa, y que la pantalla de antes (segmentado
 * y tarjetas-comprobante) ya no está. Textos y nombres escritos a mano (R127, R128, R131-R133).
 *
 * Mutaciones que lo tumban: contar las pestañas con `items.length`; pedir «Conciliados» sin
 * `filtros`; que filtrar devuelva a la página 1 solo la cola.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CatalogoFiltrosCierresDTO } from "@/lib/types/filtros-cierres";

vi.mock("@/lib/actions/cierre-bodega", () => ({
  verCierreBodegaDetalle: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaCompleto: vi.fn(),
  listarGestionesCierresBodegaCompleto: vi.fn(),
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
} from "@/lib/actions/cierre-bodega";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";

const pendientesMock = vi.mocked(listarPendientesCierresBodegaPaginado);
const conciliadosMock = vi.mocked(listarHistoricoCierresBodegaPaginado);

const ZONA_LIMON = "33333333-3333-4333-8333-333333333333";
const CATALOGO: CatalogoFiltrosCierresDTO = {
  zonas: [
    { id: ZONA_LIMON, nombre: "Bodega Limón" },
    { id: "44444444-4444-4444-8444-444444444444", nombre: "Bodega Heredia" },
  ],
  mensajeros: [],
  mensajerosFiltro: [],
};

function cabecera(id: string, zonaNombre: string, conciliado: boolean): CierreBodegaResumen {
  return {
    cierreBodegaId: id,
    zonaId: ZONA_LIMON,
    zonaNombre,
    solicitadoPorId: "u1",
    solicitadoPorNombre: "Sara Satélite",
    estado: conciliado ? "aprobado" : "solicitado",
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
    ...(conciliado
      ? { conciliado: true, montoRecibido: "9000.00", faltaPorRecibir: "0.00", conciliadoAt: "2026-09-02T10:00:00.000Z" }
      : {}),
  };
}

const PENDIENTE = cabecera("b1b1b1b1-1111-4111-8111-b1b1b1b1b1b1", "Limón", false);
const CONCILIADO = cabecera("c2c2c2c2-2222-4222-8222-c2c2c2c2c2c2", "Heredia", true);

// Una página de 10 con `total` 37 / 21: el conteo de la pestaña tiene que ser el del servidor.
const PENDIENTES = paginaInicial([PENDIENTE], { total: 37, pageSize: 10 });
const CONCILIADOS = paginaInicial([CONCILIADO], { total: 21, pageSize: 10 });

beforeEach(() => {
  vi.clearAllMocks();
  pendientesMock.mockResolvedValue({ status: "ok", page: 1, ...PENDIENTES });
  conciliadosMock.mockResolvedValue({ status: "ok", page: 1, ...CONCILIADOS });
});
afterEach(cleanup);

function montar(pendientes = PENDIENTES, historico = CONCILIADOS) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresBodegaAdminModule
        pendientes={pendientes}
        historico={historico}
        catalogoFiltros={CATALOGO}
        puedeConciliar
        audiencia="admin"
      />
    </SWRConfig>,
  );
}

const PIE = "Un cierre «Recibido incompleto» se queda aquí hasta que la diferencia se reciba o se corrija.";

async function irAConciliados(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Conciliados 21" }));
  await screen.findByRole("region", { name: "Cierres de bodega conciliados" });
}

async function filtrarPorLimon(user: ReturnType<typeof userEvent.setup>) {
  const barra = screen.getByRole("region", { name: "Filtros de los cierres del día" });
  await user.click(within(barra).getByRole("button", { name: /^Filtros/ }));
  await user.click(
    within(await screen.findByRole("listbox", { name: "Filtros" })).getByRole("option", { name: "Bodega" }),
  );
  await user.click(within(barra).getByRole("button", { name: /Bodega/ }));
  await user.click(await screen.findByRole("option", { name: "Bodega Limón" }));
}

describe("CierresBodegaAdminModule — la cola única (R133)", () => {
  it("monta la cola: tablist y tabla; ni el segmentado ni las tarjetas-comprobante de antes", () => {
    montar();
    expect(screen.getByRole("tablist", { name: "Cierres de bodega por estado" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Cierres de bodega por conciliar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" })).toBeInTheDocument();
    // Lo de antes: el `group` segmentado, la lista de comprobantes y su botón.
    expect(screen.queryByRole("group", { name: "Cierres de bodega por estado" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Cierres de bodega pendientes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver / decidir el cierre de bodega de Limón" })).toBeNull();
  });

  it("descripción, pestañas con el total del servidor y arranque en «Por conciliar» (R127, R131)", () => {
    montar();
    expect(
      screen.getByText("Los cierres que mandan las bodegas satélite. Márcalos recibidos cuando llegue el dinero."),
    ).toBeInTheDocument();
    const lista = screen.getByRole("tablist", { name: "Cierres de bodega por estado" });
    expect(within(lista).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Por conciliar 37",
      "Conciliados 21",
    ]);
    expect(within(lista).getByRole("tab", { name: "Por conciliar 37" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(PIE)).toBeInTheDocument();
  });

  it("«Conciliados»: su región, su fila, su paginación y su descarga; sin el pie (R127, R128, R131)", async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.getByRole("button", { name: "Descargar Cierres de bodega pendientes" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginación de los cierres de bodega por conciliar" })).toBeInTheDocument();

    await irAConciliados(user);

    expect(screen.queryByRole("region", { name: "Cierres de bodega por conciliar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver el cierre de bodega de Heredia" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginación de los cierres de bodega conciliados" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar Cierres de bodega resueltos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar Cierres de bodega pendientes" })).toBeNull();
    expect(screen.queryByText(PIE)).toBeNull();
  });
});

describe("CierresBodegaAdminModule — una barra para las dos listas (R127, R128)", () => {
  it("la barra no ofrece Mensajero", async () => {
    const user = userEvent.setup();
    montar();
    const barra = screen.getByRole("region", { name: "Filtros de los cierres del día" });
    await user.click(within(barra).getByRole("button", { name: /^Filtros/ }));
    const opciones = within(await screen.findByRole("listbox", { name: "Filtros" }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toContain("Bodega");
    expect(opciones.some((o) => /Mensajero/.test(o ?? ""))).toBe(false);
  });

  it("filtrar lleva el filtro a LAS DOS lecturas y las devuelve a la página 1", async () => {
    const user = userEvent.setup();
    montar();

    // Página 2 de cada lista antes de filtrar.
    await user.click(
      within(screen.getByRole("navigation", { name: "Paginación de los cierres de bodega por conciliar" })).getByRole(
        "button",
        { name: "Página siguiente" },
      ),
    );
    await waitFor(() => expect(pendientesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    await irAConciliados(user);
    await user.click(
      within(screen.getByRole("navigation", { name: "Paginación de los cierres de bodega conciliados" })).getByRole(
        "button",
        { name: "Página siguiente" },
      ),
    );
    await waitFor(() => expect(conciliadosMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));

    pendientesMock.mockClear();
    conciliadosMock.mockClear();
    await filtrarPorLimon(user);

    const conFiltro = { page: 1, filtros: { destinoZonaIds: [ZONA_LIMON] } };
    await waitFor(() => expect(pendientesMock).toHaveBeenCalledWith(expect.objectContaining(conFiltro)));
    await waitFor(() => expect(conciliadosMock).toHaveBeenCalledWith(expect.objectContaining(conFiltro)));
    expect(conciliadosMock).not.toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("cambiar de pestaña conserva el filtro y la página de cada lista", async () => {
    const user = userEvent.setup();
    montar();
    await filtrarPorLimon(user);
    await waitFor(() =>
      expect(pendientesMock).toHaveBeenCalledWith(expect.objectContaining({ filtros: { destinoZonaIds: [ZONA_LIMON] } })),
    );
    await user.keyboard("{Escape}");

    const navPC = () => screen.getByRole("navigation", { name: "Paginación de los cierres de bodega por conciliar" });
    await user.click(within(navPC()).getByRole("button", { name: "Página siguiente" }));
    await waitFor(() =>
      expect(within(navPC()).getByRole("button", { current: "page" })).toHaveTextContent("2"),
    );

    await irAConciliados(user);
    pendientesMock.mockClear();
    await user.click(screen.getByRole("tab", { name: /^Por conciliar/ }));

    expect(within(navPC()).getByRole("button", { current: "page" })).toHaveTextContent("2");
    expect(screen.getByRole("region", { name: "Filtros de los cierres del día" })).toHaveTextContent("Bodega Limón");
    expect(pendientesMock).not.toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });
});

describe("CierresBodegaAdminModule — vacío y error de cada pestaña (R132)", () => {
  it("vacío: los textos de cada pestaña", async () => {
    pendientesMock.mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([]) });
    conciliadosMock.mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([]) });
    const user = userEvent.setup();
    montar(paginaInicial([]), paginaInicial([]));
    expect(screen.getByText("No hay cierres de bodega por conciliar.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Conciliados 0" }));
    expect(await screen.findByText("Aún no hay cierres de bodega conciliados.")).toBeInTheDocument();
  });

  it("error: los textos de cada pestaña", async () => {
    pendientesMock.mockResolvedValue({ status: "forbidden" } as never);
    conciliadosMock.mockResolvedValue({ status: "forbidden" } as never);
    const user = userEvent.setup();
    montar();
    expect(await screen.findByText("No se pudieron cargar los cierres de bodega por conciliar.")).toBeInTheDocument();
    await irAConciliados(user);
    expect(await screen.findByText("No se pudieron cargar los cierres de bodega conciliados.")).toBeInTheDocument();
  });
});
