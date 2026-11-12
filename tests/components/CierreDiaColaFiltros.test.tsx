// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { listarCierresPasadosPaginado } from "@/lib/actions/cierre-dia";
import { descargarDatos } from "@/components/shared/descarga-datos";
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { FiltrosColaPropia } from "@/lib/types/filtros-cierres";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

/**
 * SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» (T2.3; R167, R174-R178). Monta
 * `CierreDiaModule` con la acción paginada simulada y mira lo que la pantalla PIDE al servidor y lo
 * que enseña con la respuesta. Los textos esperados son literales del spec, escritos a mano.
 */

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
  listarCierresPasadosCompleto: vi.fn(),
}));
vi.mock("@/components/shared/descarga-datos", () => ({
  descargarDatos: vi.fn(async () => ({ status: "ok", items: [] })),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierre-dia",
  useSearchParams: () => new URLSearchParams(),
}));
// «Descargar» simulado: al pulsarlo pide las filas, que es lo que hace el de verdad.
vi.mock("@/components/shared/DescargarDatasetButton", () => ({
  DescargarDatasetButton: (p: { titulo: string; obtenerFilas: () => Promise<unknown> }) => (
    <button
      type="button"
      aria-label={`Descargar ${p.titulo}`}
      onClick={() => void p.obtenerFilas().catch(() => undefined)}
    >
      Descargar
    </button>
  ),
}));

const CERO = { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" };

function cierre(id: string, estado: CierrePasadoDTO["estado"]): CierrePasadoDTO {
  return {
    cierreId: id,
    estado,
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    totales: CERO,
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-07-11T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    pendientePagoMensajero: null,
  };
}

const TODOS = [
  cierre("c0000000-0000-4000-8000-0000aaaa1111", "solicitado"),
  cierre("c0000000-0000-4000-8000-0000bbbb2222", "vencido"),
];
const VENCIDO = [cierre("c0000000-0000-4000-8000-0000bbbb2222", "vencido")];

/** La acción declara su entrada como `unknown` (la valida zod); esta es la forma que manda la pantalla. */
type Entrada = { page: number; pageSize: number; filtros?: FiltrosColaPropia };

/**
 * El servidor simulado: sin filtros, 30 cierres; con cualquier filtro, 3; con folio «ZZ», ninguno. La
 * respuesta depende de la ENTRADA, así que una pantalla que no mande los filtros enseña otra cosa.
 */
function servidor(input: Entrada) {
  const f = input.filtros;
  if (f?.folio === "ZZ") return { status: "ok" as const, page: input.page, items: [], total: 0, pageSize: input.pageSize };
  if (f !== undefined) return { status: "ok" as const, page: input.page, items: VENCIDO, total: 3, pageSize: input.pageSize };
  return { status: "ok" as const, page: input.page, items: TODOS, total: 30, pageSize: input.pageSize };
}

function montar() {
  vi.mocked(listarCierresPasadosPaginado).mockImplementation(async (i) => servidor(i as Entrada));
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={{ entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] }}
        totales={CERO}
        totalPagoMensajero="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        cierresPasados={paginaInicial(TODOS, { total: 30 })}
        bloqueo={SIN_BLOQUEO}
      />
    </SWRConfig>,
  );
  return screen.getByRole("region", { name: "Filtros de tus cierres" });
}

/** La última entrada con la que la pantalla pidió una página. */
function ultimaPeticion(): Entrada {
  const llamadas = vi.mocked(listarCierresPasadosPaginado).mock.calls;
  expect(llamadas.length, "la pantalla no pidió ninguna página").toBeGreaterThan(0);
  return llamadas[llamadas.length - 1][0] as Entrada;
}

async function pedirFiltro(user: ReturnType<typeof userEvent.setup>, barra: HTMLElement, label: string) {
  if (screen.queryByRole("listbox", { name: "Filtros" }) === null) {
    await user.click(within(barra).getByRole("button", { name: /^Filtros/ }));
  }
  await user.click(
    within(await screen.findByRole("listbox", { name: "Filtros" })).getByRole("option", { name: label }),
  );
}

async function abrirEstado(user: ReturnType<typeof userEvent.setup>, barra: HTMLElement) {
  await pedirFiltro(user, barra, "Estado");
  await user.click(within(barra).getByRole("button", { name: /^Estado:/ }));
  return screen.findByRole("listbox", { name: "Estado" });
}

const ESPERA = { timeout: 3000 };

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-138 · /cierre-dia: la barra de «Cierres solicitados»", () => {
  it("R167/R177: la barra usa el buscador y los filtros de la app, con folio, fecha y estado", async () => {
    const user = userEvent.setup();
    const barra = montar();

    const campo = within(barra).getByRole("searchbox", { name: "Buscar" });
    expect(campo).toHaveAttribute("placeholder", "Busca por folio");

    await user.click(within(barra).getByRole("button", { name: /^Filtros/ }));
    const selector = await screen.findByRole("listbox", { name: "Filtros" });
    expect(within(selector).getAllByRole("option").map((o) => o.textContent?.trim())).toEqual([
      "Fecha de solicitud",
      "Estado",
    ]);
    expect(within(selector).queryByRole("option", { name: "Bodega" })).toBeNull();
    expect(within(selector).queryByRole("option", { name: "Mensajero" })).toBeNull();
  });

  it("R177: «Estado» lista los cuatro estados con su etiqueta, sin grupos, y no hay aviso de filtro activo", async () => {
    const user = userEvent.setup();
    const barra = montar();

    const lista = await abrirEstado(user, barra);
    expect(within(lista).getAllByRole("option").map((o) => o.textContent?.trim())).toEqual([
      "Todos",
      "Solicitado",
      "Vencido",
      "Aprobado",
      "Rechazado",
    ]);
    expect(within(lista).queryAllByRole("group")).toHaveLength(0);

    await user.click(within(lista).getByRole("option", { name: "Vencido" }));
    await waitFor(() => expect(ultimaPeticion().filtros).toEqual({ estados: ["vencido"] }), ESPERA);
    expect(screen.queryByText(/Filtro activo/)).toBeNull();
    expect(within(barra).queryByRole("note")).toBeNull();
  });

  it("R175: desde la página 2, cambiar el estado pide la página 1 con filtros y la pestaña dice su total", async () => {
    const user = userEvent.setup();
    const barra = montar();
    expect(screen.getByRole("tab", { name: "Cierres solicitados 30" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(ultimaPeticion()).toEqual({ page: 2, pageSize: 25 }), ESPERA);

    const lista = await abrirEstado(user, barra);
    await user.click(within(lista).getByRole("option", { name: "Vencido" }));

    await waitFor(
      () => expect(ultimaPeticion()).toEqual({ page: 1, pageSize: 25, filtros: { estados: ["vencido"] } }),
      ESPERA,
    );
    expect(await screen.findByRole("tab", { name: "Cierres solicitados 3" }, ESPERA)).toBeInTheDocument();
  });

  it("R175: escribir un folio pide con `folio` y el campo conserva el foco y el texto", async () => {
    const user = userEvent.setup();
    const barra = montar();
    const campo = within(barra).getByRole("searchbox", { name: "Buscar" });

    await user.click(campo);
    await user.type(campo, "bbbb");

    await waitFor(
      () => expect(ultimaPeticion()).toEqual({ page: 1, pageSize: 25, filtros: { folio: "bbbb" } }),
      ESPERA,
    );
    expect(await screen.findByRole("tab", { name: "Cierres solicitados 3" }, ESPERA)).toBeInTheDocument();
    expect(campo).toHaveFocus();
    expect(campo).toHaveValue("bbbb");
    expect(campo).toBeEnabled();
  });

  it("R176: con un filtro que no deja nada, «Ningún cierre coincide con los filtros.»", async () => {
    const user = userEvent.setup();
    const barra = montar();

    await user.type(within(barra).getByRole("searchbox", { name: "Buscar" }), "ZZ");

    expect(await screen.findByText("Ningún cierre coincide con los filtros.", undefined, ESPERA)).toBeInTheDocument();
    expect(screen.queryByText("Aún no has solicitado ningún cierre.")).toBeNull();
    expect(screen.getByRole("tab", { name: "Cierres solicitados 0" })).toBeInTheDocument();
  });

  it("R178: «Limpiar todo» vacía campo y filtros y pide la página 1 sin `filtros`", async () => {
    const user = userEvent.setup();
    const barra = montar();
    const campo = within(barra).getByRole("searchbox", { name: "Buscar" });

    await user.type(campo, "ZZ");
    await screen.findByText("Ningún cierre coincide con los filtros.", undefined, ESPERA);
    const lista = await abrirEstado(user, barra);
    await user.click(within(lista).getByRole("option", { name: "Vencido" }));
    await waitFor(
      () => expect(ultimaPeticion().filtros).toEqual({ estados: ["vencido"], folio: "ZZ" }),
      ESPERA,
    );
    await user.keyboard("{Escape}");

    const antes = vi.mocked(listarCierresPasadosPaginado).mock.calls.length;
    await user.click(within(barra).getByRole("button", { name: "Limpiar todo" }));

    expect(campo).toHaveValue("");
    expect(within(barra).queryByRole("button", { name: /^Estado:/ })).toBeNull();
    await waitFor(() => {
      expect(vi.mocked(listarCierresPasadosPaginado).mock.calls.length).toBeGreaterThan(antes);
      expect(ultimaPeticion()).toEqual({ page: 1, pageSize: 25 });
    }, ESPERA);
    expect(await screen.findByRole("tab", { name: "Cierres solicitados 30" }, ESPERA)).toBeInTheDocument();
    expect(screen.queryByText("Ningún cierre coincide con los filtros.")).toBeNull();
  });

  it("R174: «Descargar» con un filtro manda `{ filtros }`; sin filtros, sin entrada", async () => {
    const user = userEvent.setup();
    const barra = montar();
    const descargar = screen.getByRole("button", { name: "Descargar Cierres solicitados" });

    await user.click(descargar);
    await waitFor(() => expect(descargarDatos).toHaveBeenCalledTimes(1));
    expect(vi.mocked(descargarDatos).mock.calls[0]).toEqual(["listarCierresPasadosCompleto", undefined]);

    const lista = await abrirEstado(user, barra);
    await user.click(within(lista).getByRole("option", { name: "Aprobado" }));
    await waitFor(() => expect(ultimaPeticion().filtros).toEqual({ estados: ["aprobado"] }), ESPERA);
    await user.keyboard("{Escape}");

    await user.click(descargar);
    await waitFor(() => expect(descargarDatos).toHaveBeenCalledTimes(2));
    expect(vi.mocked(descargarDatos).mock.calls[1]).toEqual([
      "listarCierresPasadosCompleto",
      { filtros: { estados: ["aprobado"] } },
    ]);
  });
});
