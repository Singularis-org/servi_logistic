// @vitest-environment jsdom
/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R456) — el buscador por
 * folio de la barra de `/cierres-admin`, por el lado de la PANTALLA.
 *
 * Lo que el servidor hace con el texto (normalizar, «imposible» → vacío, `total`, alcance) está en
 * `tests/unit/services/cierres-filtro-folio.test.ts` y en
 * `tests/integration/db/cierres-filtro-folio-sql-real.test.ts`. Aquí se afirma lo que solo se ve
 * montando la pantalla:
 *  1. el campo dice «Busca por folio» (escrito a mano, no la constante);
 *  2. lo escrito VIAJA a las Server Actions de las dos listas dentro de `filtros.folio`, y las dos
 *     vuelven a la página 1;
 *  3. con el campo vacío la clave no viaja (negativo con un texto imposible de tener por casualidad);
 *  4. lo que emite la barra en las pantallas de bodega lo acepta su borde `.strict()`.
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

const { pendientes, historico, consolidables, solicitados } = vi.hoisted(() => ({
  pendientes: vi.fn(),
  historico: vi.fn(),
  consolidables: vi.fn(),
  solicitados: vi.fn(),
}));

vi.mock("@/lib/actions/cierres-admin", () => ({
  listarGestionesCierresAdminCompleto: vi.fn(),
  verCierreDetalle: vi.fn(),
  aprobarCierre: vi.fn(),
  rechazarCierre: vi.fn(),
  listarCierresAdmin: vi.fn(),
  forzarSolicitudVencido: vi.fn(),
  listarHistoricoCierresAdminPaginado: (...a: unknown[]) => historico(...a),
  listarPendientesCierresAdminPaginado: (...a: unknown[]) => pendientes(...a),
  listarHistoricoCierresAdminCompleto: vi.fn(),
  listarPendientesCierresAdminCompleto: vi.fn(),
  obtenerCatalogoFiltrosCierres: vi.fn(),
}));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarGestionesCierresBodegaCompleto: vi.fn(),
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  solicitarCierreBodega: vi.fn(),
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

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { CierresAdminModule } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import { ConsolidacionBodegaModule } from "@/app/(app)/cierres-admin/_components/ConsolidacionBodegaModule";
import { FiltrosCierresBarra } from "@/app/(app)/cierres-admin/_components/FiltrosCierresBarra";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreConsolidableCola, ResumenSolicitados } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import {
  filtrosCierresBodegaSchema,
  type CatalogoFiltrosCierresDTO,
  type FiltrosCierres,
} from "@/lib/types/filtros-cierres";

const BARRA = "Filtros de los cierres del día";
const TOTALES: CierreTotales = { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" };
const ZONA_A = "11111111-1111-4111-8111-111111111111";
const CATALOGO: CatalogoFiltrosCierresDTO = {
  zonas: [{ id: ZONA_A, nombre: "Bodega Heredia" }],
  mensajeros: [],
  mensajerosFiltro: [],
};

function cierre(cierreId: string): CierreAdminResumen {
  return {
    cierreId,
    mensajeroId: `m-${cierreId}`,
    mensajeroNombre: "Diana Mora",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z-central",
    destinoZonaNombre: "Central",
    totales: TOTALES,
    totalPagoMensajero: "10.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-08-10T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
  };
}

function pagina<T>(items: T[], total = items.length, pageSize = 25) {
  return { status: "ok" as const, items, page: 1, pageSize, total };
}

/** El campo del buscador de la barra (su nombre accesible es «Buscar»). */
function campo(): HTMLInputElement {
  const barra = screen.getByRole("region", { name: BARRA });
  return within(barra).getByRole("searchbox", { name: "Buscar" }) as HTMLInputElement;
}

/** El `filtros` de cada llamada a un doble, en orden. */
function filtrosDe(doble: ReturnType<typeof vi.fn>): (FiltrosCierres | undefined)[] {
  return doble.mock.calls.map((c) => (c[0] as { filtros?: FiltrosCierres }).filtros);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("R456 — cierres de mensajeros: el buscador pone `filtros.folio`", () => {
  function montar() {
    pendientes.mockResolvedValue(pagina([cierre("c1")], 60));
    historico.mockResolvedValue(pagina([]));
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CierresAdminModule
          pendientes={{ items: [cierre("c1")], total: 60, pageSize: 25 }}
          historico={{ items: [], total: 0, pageSize: 25 }}
          sinZona={false}
          catalogoFiltros={CATALOGO}
        />
      </SWRConfig>,
    );
  }

  it("el campo dice «Busca por folio»", async () => {
    montar();
    await screen.findByRole("region", { name: BARRA });
    expect(campo()).toHaveAttribute("placeholder", "Busca por folio");
    expect(campo()).not.toHaveAttribute("placeholder", "Usa los filtros para acotar los cierres");
  });

  it("escribir «  #3f2a » llega a las DOS listas en `filtros.folio`, y las dos vuelven a la página 1", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("region", { name: BARRA });

    // A la página 2 de la cola; desde allí se busca.
    const nav = screen.getByRole("navigation", { name: "Paginación de los cierres del día pendientes" });
    await user.click(within(nav).getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(pendientes).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));

    await user.type(campo(), "  #3f2a ");

    // El texto viaja recortado y SIN normalizar: «#», minúsculas y el resto los resuelve el servidor
    // (`normalizarFolio`, R171), que es quien sabe qué es imposible.
    await waitFor(() =>
      expect(pendientes).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, filtros: { folio: "#3f2a" } })),
    );
    expect(historico).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, filtros: { folio: "#3f2a" } }));
  });

  it("negativo: con el campo vacío, la clave `folio` no viaja (ni antes de escribir ni tras borrar)", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("region", { name: BARRA });
    // Un texto que ningún folio real puede contener por casualidad: «Q» no es hexadecimal.
    await user.type(campo(), "QZQ7Q");
    await waitFor(() => expect(filtrosDe(pendientes).some((f) => f?.folio === "QZQ7Q")).toBe(true));

    pendientes.mockClear();
    historico.mockClear();
    await user.clear(campo());
    await waitFor(() => expect(pendientes).toHaveBeenCalled());
    for (const f of [...filtrosDe(pendientes), ...filtrosDe(historico)]) {
      expect(f === undefined || !("folio" in f)).toBe(true);
      expect(JSON.stringify(f ?? {})).not.toContain("QZQ7Q");
    }
  });
});

describe("R457 — pegar el id entero (36) no deja las listas en error", () => {
  it("el campo se queda en 20 caracteres, la action recibe como mucho 20 y no sale «No se pudo cargar…»", async () => {
    // El doble hace lo que el borde: más de 20 → `validation_error`.
    const comoElBorde = (a: unknown) => {
      const folio = (a as { filtros?: FiltrosCierres }).filtros?.folio;
      if (folio !== undefined && folio.length > 20) {
        return Promise.resolve({ status: "validation_error" as const, message: "texto largo" });
      }
      return Promise.resolve(pagina([]));
    };
    pendientes.mockImplementation(comoElBorde);
    historico.mockImplementation(comoElBorde);
    const user = userEvent.setup();
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CierresAdminModule
          pendientes={{ items: [cierre("c1")], total: 1, pageSize: 25 }}
          historico={{ items: [], total: 0, pageSize: 25 }}
          sinZona={false}
          catalogoFiltros={CATALOGO}
        />
      </SWRConfig>,
    );
    await screen.findByRole("region", { name: BARRA });
    const ID_ENTERO = "3f2a9c1e-7b4d-4e8a-9c2f-0d1e2f3a4b5c";
    expect(ID_ENTERO).toHaveLength(36);

    await user.click(campo());
    await user.paste(ID_ENTERO);

    expect(campo().value).toBe("3f2a9c1e-7b4d-4e8a-9");
    await waitFor(() => expect(filtrosDe(pendientes).some((f) => f?.folio !== undefined)).toBe(true));
    for (const f of [...filtrosDe(pendientes), ...filtrosDe(historico)]) {
      expect((f?.folio ?? "").length).toBeLessThanOrEqual(20);
    }
    expect(screen.queryByText("No se pudo cargar el histórico de cierres.")).toBeNull();
  });
});

describe("R456 — consolidación de la satélite: el folio llega a «A consolidar» y «Solicitados»", () => {
  const CONSOLIDABLE: CierreConsolidableCola = {
    cierreDiaId: "cd-1",
    mensajeroId: "m-1",
    mensajeroNombre: "Mensajero Uno",
    totales: TOTALES,
    totalPagoMensajero: "1500.00",
    totalIngresoBodegaRechazos: "0.00",
    paraLaCentral: "7500.00",
    aprobadoAt: "2026-11-08T01:10:00.000Z",
    gestionesAjustadas: 0,
  };
  const RESUMEN: ResumenSolicitados = {
    porLlegar: { monto: "0.00", cierres: 0 },
    recibido30Dias: { monto: "0.00", cierres: 0 },
    faltaPorRecibir: { monto: "0.00", cierres: 0 },
  };

  it("escribir un folio pide las dos listas con `filtros.folio` y la página 1", async () => {
    consolidables.mockResolvedValue(pagina([], 0, 10));
    solicitados.mockResolvedValue(pagina([], 0, 10));
    const user = userEvent.setup();
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ConsolidacionBodegaModule
          consolidables={{ items: [CONSOLIDABLE], total: 1, pageSize: 10 }}
          totalesAgregados={TOTALES}
          totalPagoMensajeroAgregado="1500.00"
          totalIngresoBodegaRechazosAgregado="0.00"
          incluyeModeloNuevoAgregado={false}
          totalCentralDebeAgregado="0.00"
          puedesSolicitar
          motivoBloqueo={null}
          paraLaCentralAgregado="7500.00"
          cierresAConsolidar={1}
          mensajerosAConsolidar={1}
          bloqueo={null}
          zonaNombre="Limón"
          cierresBodegaPasados={{ items: [], total: 0, pageSize: 10 }}
          solicitadosResumen={RESUMEN}
          sinZona={false}
          catalogoFiltros={CATALOGO}
        />
      </SWRConfig>,
    );
    await screen.findByRole("region", { name: BARRA });
    expect(campo()).toHaveAttribute("placeholder", "Busca por folio");

    await user.type(campo(), "a7b3");

    await waitFor(() =>
      expect(consolidables).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, filtros: { folio: "a7b3" } })),
    );
    await waitFor(() =>
      expect(solicitados).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, filtros: { folio: "a7b3" } })),
    );
  });
});

describe("R456 — en las pantallas de bodega, lo emitido lo acepta su borde `.strict()`", () => {
  it("con `sinMensajero`, el bloque con folio pasa `filtrosCierresBodegaSchema`", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(f: FiltrosCierres) => void>();
    render(<FiltrosCierresBarra catalogo={CATALOGO} onChange={onChange} sinMensajero />);
    await user.type(campo(), "#C07B");
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const ultimo = onChange.mock.calls[onChange.mock.calls.length - 1]![0];
    expect(ultimo.folio).toBe("#C07B");
    // La barra emite sus claves vacías como `undefined` (así desde 2026-08-16); el paso por la Server
    // Action no las lleva al servidor. Se quitan aquí igual que allí para mirar SOLO lo que viaja.
    const queViaja = JSON.parse(JSON.stringify(ultimo)) as unknown;
    expect(queViaja).toEqual({ folio: "#C07B" });
    expect(filtrosCierresBodegaSchema.safeParse(queViaja).success).toBe(true);
  });
});
