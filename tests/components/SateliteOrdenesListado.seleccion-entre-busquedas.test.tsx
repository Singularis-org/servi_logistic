// @vitest-environment jsdom
// SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos» (T3) — el
// listado «Órdenes de la bodega» del `adminSatelite` con el MISMO modelo que `/ordenes`: la
// selección es un `Map id -> fila` que sobrevive a búsquedas, filtros y páginas; las acciones,
// su estado común y el contador miran TODAS las marcadas; «Limpiar» y una acción con éxito la
// vacían; y la poda comprueba contra el listado de la bodega SIN filtros.
//
// Se monta la pantalla REAL (`RecepcionSateliteModule`) con dobles en el borde: la lectura
// paginada filtra de verdad por término y estado sobre un conjunto mutable, y la vigencia
// responde aplicando lo que reciba (así, si la pantalla le mandara el término, la marca de la
// búsqueda anterior se podaría y el caso de R1514 lo vería).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import { catalogoSatelite, paginaBodega } from "@/tests/fixtures/satelite-bodega";

const { paginadoMock, vigenciaMock, enviarACentralMock } = vi.hoisted(() => ({
  paginadoMock: vi.fn(),
  vigenciaMock: vi.fn(),
  enviarACentralMock: vi.fn(),
}));

vi.mock("@/lib/actions/recepcion-satelite", () => ({
  recibirPorQr: vi.fn(),
  asignarDesdeSatelite: vi.fn(),
  listarRecepcionSatelite: vi.fn(),
  listarOrdenesBodegaPaginado: (...a: unknown[]) => paginadoMock(...a),
  listarOrdenesBodegaCompleto: vi.fn(async () => ({ status: "ok", items: [], total: 0 })),
  listarIdsVigentesBodega: (...a: unknown[]) => vigenciaMock(...a),
}));
vi.mock("@/lib/actions/envio-devolucion-central", () => ({
  enviarACentral: (...a: unknown[]) => enviarACentralMock(...a),
}));
vi.mock("@/lib/actions/resolver-novedad", () => ({ recuperarABodega: vi.fn() }));
vi.mock("@/lib/actions/order-status", () => ({
  listarOrderStatus: vi.fn(async () => listarOrderStatusOk()),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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
vi.mock("html5-qrcode", () => ({ Html5Qrcode: vi.fn() }));

import { listarOrderStatusOk } from "@/tests/fixtures/order-status-catalogo";
import { ORDER_STATUS_LABELS } from "@/app/(app)/ordenes/_components/EstatusBadge";
import { RecepcionSateliteModule } from "@/app/(app)/recepcion-satelite/_components/RecepcionSateliteModule";
import { CAMPOS_BASE_ORDEN } from "@/tests/fixtures/fila-bodega-satelite";

const ZONA = "Limón";
const PAGE_SIZE = 3;
const LISTADO = "Órdenes de la bodega";
const ESPERA = { timeout: 3000 };

function etiqueta(i: number): string {
  return `REM-${String(i).padStart(2, "0")}`;
}

/** 1-3: en bodega satélite. 4-6: por devolver a central. */
function orden(i: number): RecepcionSateliteDTO {
  return {
    ...CAMPOS_BASE_ORDEN,
    id: `o-${i}`,
    numGuia: 1000 + i,
    numRemision: etiqueta(i),
    estatusValue: i <= 3 ? "en_bodega_satelite" : "por_devolver_a_bodega_central",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1, casa 2",
    producto: "Caja mediana",
    montoCobrar: 150,
    tiendaNombre: "Tienda X",
    zonaNombre: ZONA,
    intentosEntrega: 0,
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
  };
}

const CONJUNTO: RecepcionSateliteDTO[] = Array.from({ length: 6 }, (_, k) => orden(k + 1));

interface Entrada {
  page?: number;
  pageSize?: number;
  estados?: string[];
  q?: string;
  ids?: string[];
}

/** Lo que el SERVIDOR tiene ahora mismo (mutable: una orden puede cambiar o salir). */
let vivas: RecepcionSateliteDTO[] = [];

function aplicaFiltro(o: RecepcionSateliteDTO, input: Entrada): boolean {
  if (input.estados?.length && !input.estados.includes(o.estatusValue)) return false;
  if (input.q && !o.numRemision.toLowerCase().includes(input.q.toLowerCase())) return false;
  return true;
}

function montar() {
  vivas = CONJUNTO.map((o) => ({ ...o }));
  paginadoMock.mockImplementation(async (input: Entrada = {}) => {
    const filtradas = vivas.filter((o) => aplicaFiltro(o, input));
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? PAGE_SIZE;
    const desde = (page - 1) * pageSize;
    return {
      status: "ok",
      items: filtradas.slice(desde, desde + pageSize),
      page,
      pageSize,
      total: filtradas.length,
    };
  });
  // La vigencia aplica lo que reciba: con filtros, podaría lo marcado en otra búsqueda.
  vigenciaMock.mockImplementation(async (input: Entrada = {}) => ({
    status: "ok",
    ids: (input.ids ?? []).filter((id) =>
      vivas.some((o) => o.id === id && aplicaFiltro(o, input)),
    ),
  }));
  enviarACentralMock.mockResolvedValue({ status: "ok" });
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <RecepcionSateliteModule
        ordenesBodega={paginaBodega(CONJUNTO.slice(0, PAGE_SIZE), {
          total: CONJUNTO.length,
          pageSize: PAGE_SIZE,
        })}
        catalogoFiltros={catalogoSatelite(CONJUNTO)}
        zonaNombre={ZONA}
        sinZona={false}
        mensajeros={[{ id: "m1", nombre: "Ana Mensajera" }]}
        bloqueoBodega={{ bloqueada: false, porMensajeros: false, porCierreBodega: false }}
      />
    </SWRConfig>,
  );
}

function tabla(): HTMLElement {
  return screen.getByRole("table", { name: LISTADO });
}

function region(): HTMLElement {
  return screen.getByRole("region", { name: LISTADO });
}

function remisionesVisibles(): string[] {
  return within(tabla())
    .queryAllByRole("checkbox")
    .map((c) => c.getAttribute("aria-label") ?? "")
    .filter((n) => n.startsWith("Seleccionar REM-"))
    .map((n) => n.replace("Seleccionar ", ""));
}

function casilla(remision: string): HTMLElement {
  return within(tabla()).getByRole("checkbox", { name: `Seleccionar ${remision}` });
}

/** La barra de selección: la región `status` con texto (la otra es el aviso del buscador). */
function barra(): HTMLElement {
  const status = within(region())
    .getAllByRole("status")
    .filter((n) => (n.textContent ?? "").trim() !== "");
  return status[status.length - 1]!;
}

function ultimoTermino(): string | undefined {
  return (paginadoMock.mock.calls.at(-1)?.[0] as Entrada | undefined)?.q;
}

/** Escribe el término (como la pistola) y espera a que la tabla enseñe `visibles`. */
async function buscar(
  user: ReturnType<typeof userEvent.setup>,
  termino: string,
  visibles: string[],
) {
  const campo = screen.getByRole("searchbox", { name: "Buscar órdenes de la bodega" });
  await user.clear(campo);
  await user.type(campo, termino);
  await waitFor(() => expect(ultimoTermino()).toBe(termino), ESPERA);
  await waitFor(() => expect(remisionesVisibles()).toEqual(visibles), ESPERA);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SLT-222 — bodega satélite: la selección sobrevive a la búsqueda", () => {
  it("R1500 + R1501 + R1505 + R1506: buscar, marcar, buscar otra, marcar: la barra cuenta 2 y «Asignar» recibe las dos", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-01", [etiqueta(1)]);
    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-02", [etiqueta(2)]);
    await user.click(casilla(etiqueta(2)));

    expect(barra()).toHaveTextContent("2 seleccionadas · 1 fuera de esta búsqueda");
    const asignar = within(region()).getByRole("button", { name: "Asignar" });
    expect(asignar).toBeEnabled();
    await user.click(asignar);

    const dialogo = await screen.findByRole("dialog", { name: "Asignar mensajero" });
    expect(dialogo).toHaveTextContent("Asigna un mensajero a 2 orden(es) seleccionada(s)");
  });

  it("R1505: ya NO se dice que lo marcado fuera de la vista se queda fuera de la acción (Q-K7)", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-02", [etiqueta(2)]);

    expect(within(region()).queryByText(/marcadas en otras páginas/)).toBeNull();
    expect(barra()).toHaveTextContent("1 seleccionada · 1 fuera de esta búsqueda");
  });

  it("R1505: el estado común se mira sobre TODAS las marcadas, vistas o no", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-01", [etiqueta(1)]);
    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-04", [etiqueta(4)]);
    await user.click(casilla(etiqueta(4)));

    // Una en bodega (fuera de la vista) y una por devolver: estados mezclados ⇒ ninguna
    // transición habilitada, aunque la de la vista sola admitiría «Enviar a central».
    expect(barra()).toHaveTextContent("estados mezclados");
    expect(within(region()).getByRole("button", { name: "Asignar" })).toBeDisabled();
    expect(within(region()).getByRole("button", { name: "Enviar a central" })).toBeDisabled();
  });

  it("R1504: al volver a la búsqueda anterior, la casilla sale marcada", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-01", [etiqueta(1)]);
    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-02", [etiqueta(2)]);
    await buscar(user, "REM-01", [etiqueta(1)]);

    expect(casilla(etiqueta(1))).toBeChecked();
  });

  it("R1506: con una búsqueda SIN resultados la barra sigue, con su «Limpiar»", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-99", []);

    expect(barra()).toHaveTextContent("1 seleccionada · 1 fuera de esta búsqueda");
    expect(within(region()).getByRole("button", { name: "Limpiar" })).toBeInTheDocument();
  });

  it("R1502: filtrar por estado y «Limpiar todo» de la barra conservan lo marcado", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(casilla(etiqueta(1)));
    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    await user.click(
      within(await screen.findByRole("listbox", { name: "Filtros" })).getByRole("option", {
        name: "Estado",
      }),
    );
    const estado = screen.queryByRole("listbox", { name: "Estado" });
    const lista =
      estado ??
      (await (async () => {
        await user.click(screen.getByRole("button", { name: /^Estado:/ }));
        return screen.getByRole("listbox", { name: "Estado" });
      })());
    await user.click(
      within(lista).getByRole("option", {
        name: ORDER_STATUS_LABELS.por_devolver_a_bodega_central,
      }),
    );
    await user.keyboard("{Escape}");
    await waitFor(
      () => expect(remisionesVisibles()).toEqual([etiqueta(4), etiqueta(5), etiqueta(6)]),
      ESPERA,
    );
    expect(barra()).toHaveTextContent("1 seleccionada · 1 fuera de esta búsqueda");

    await user.click(screen.getByRole("button", { name: "Limpiar todo" }));
    await waitFor(
      () => expect(remisionesVisibles()).toEqual([etiqueta(1), etiqueta(2), etiqueta(3)]),
      ESPERA,
    );
    expect(casilla(etiqueta(1))).toBeChecked();
  });

  it("R1507: «Limpiar» desmarca todo, también lo que no se ve", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-02", [etiqueta(2)]);
    await user.click(casilla(etiqueta(2)));

    await user.click(within(region()).getByRole("button", { name: "Limpiar" }));
    expect(barra()).not.toHaveTextContent(/seleccionada/);
    expect(casilla(etiqueta(2))).not.toBeChecked();

    await buscar(user, "REM-01", [etiqueta(1)]);
    expect(casilla(etiqueta(1))).not.toBeChecked();
  });

  it("R1508: tras «Enviar a central» con éxito, sobre las de dos búsquedas, no queda nada marcado", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-04", [etiqueta(4)]);
    await user.click(casilla(etiqueta(4)));
    await buscar(user, "REM-05", [etiqueta(5)]);
    await user.click(casilla(etiqueta(5)));
    await user.click(within(region()).getByRole("button", { name: "Enviar a central" }));

    await waitFor(() => expect(enviarACentralMock).toHaveBeenCalledTimes(2));
    expect(enviarACentralMock.mock.calls.map((c) => (c[0] as { ordenId: string }).ordenId).sort())
      .toEqual(["o-4", "o-5"]);
    await waitFor(() => expect(barra()).not.toHaveTextContent(/seleccionada/));
    expect(casilla(etiqueta(5))).not.toBeChecked();
  });

  it("R1509: una marcada que el servidor devuelve con otro estado decide la acción con ese estado", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-01", [etiqueta(1)]);
    await user.click(casilla(etiqueta(1)));
    // En el servidor la 01 pasa a «por devolver»; una búsqueda que la trae refresca su fila…
    vivas = vivas.map((o) =>
      o.id === "o-1" ? { ...o, estatusValue: "por_devolver_a_bodega_central" } : o,
    );
    await buscar(user, "REM-0", [etiqueta(1), etiqueta(2), etiqueta(3)]);
    // …y cuando deja de verse, la barra ofrece la acción de su estado NUEVO.
    await buscar(user, "REM-05", [etiqueta(5)]);

    expect(within(region()).getByRole("button", { name: "Enviar a central" })).toBeEnabled();
    expect(within(region()).queryByRole("button", { name: "Asignar" })).toBeNull();
  });

  it("R1512 + R1513: «seleccionar todo» añade y quita SOLO lo visible", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-01", [etiqueta(1)]);
    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-0", [etiqueta(1), etiqueta(2), etiqueta(3)]);
    await buscar(user, "REM-04", [etiqueta(4)]);

    const todas = within(tabla()).getByRole("checkbox", {
      name: "Seleccionar todas las órdenes de esta página",
    });
    await user.click(todas);
    expect(barra()).toHaveTextContent("2 seleccionadas · 1 fuera de esta búsqueda");

    await user.click(todas);
    expect(barra()).toHaveTextContent("1 seleccionada · 1 fuera de esta búsqueda");
    expect(casilla(etiqueta(4))).not.toBeChecked();
  });

  it("R1514: la vigencia se pregunta SIN filtros ni término, y lo marcado en otra búsqueda no se poda", async () => {
    const user = userEvent.setup();
    montar();

    await buscar(user, "REM-01", [etiqueta(1)]);
    await user.click(casilla(etiqueta(1)));
    await buscar(user, "REM-02", [etiqueta(2)]);

    await waitFor(() => expect(vigenciaMock).toHaveBeenCalled());
    for (const [input] of vigenciaMock.mock.calls) {
      expect(input).toEqual({ ids: ["o-1"] });
    }
    expect(barra()).toHaveTextContent("1 seleccionada · 1 fuera de esta búsqueda");
  });
});
