// @vitest-environment jsdom
// SLT-210 «Satélite: Vistas y ordenamiento en Órdenes de la bodega, como en Órdenes» — la barra de
// «Órdenes de la bodega» gana el control «Vistas» y los dos conmutadores de orden de `/ordenes`.
//
// Se monta el MÓDULO real (`RecepcionSateliteModule` + `SateliteOrdenesListado`): lo que se mide
// es el efecto —qué se le pide al servidor, en qué página, en qué orden pinta la tabla y qué se
// guarda en una vista—, no los componentes compartidos, que ya tienen sus suites. Solo se doblan
// el borde (Server Actions), el toast, el router y la cámara. Literales a mano.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import type { CatalogoFiltrosOrdenesDTO } from "@/lib/types/filtros-ordenes";
import type { VistaFiltroDTO } from "@/lib/types/vista-filtro";
import { CAMPOS_BASE_ORDEN } from "@/tests/fixtures/fila-bodega-satelite";
import { catalogoSatelite, paginaBodega } from "@/tests/fixtures/satelite-bodega";

const { paginadoMock, completoMock, listarVistasMock, guardarVistaMock } = vi.hoisted(() => ({
  paginadoMock: vi.fn(),
  completoMock: vi.fn(),
  listarVistasMock: vi.fn(),
  guardarVistaMock: vi.fn(),
}));

vi.mock("@/lib/actions/recepcion-satelite", () => ({
  recibirPorQr: vi.fn(),
  asignarDesdeSatelite: vi.fn(),
  listarRecepcionSatelite: vi.fn(),
  listarOrdenesBodegaPaginado: (...a: unknown[]) => paginadoMock(...a),
  listarOrdenesBodegaCompleto: (...a: unknown[]) => completoMock(...a),
  listarIdsVigentesBodega: vi.fn(async () => ({ status: "ok", ids: [] })),
}));
vi.mock("@/lib/actions/envio-devolucion-central", () => ({ enviarACentral: vi.fn() }));
vi.mock("@/lib/actions/resolver-novedad", () => ({ recuperarABodega: vi.fn() }));
vi.mock("@/lib/actions/incidentes", () => ({ reportarIncidente: vi.fn() }));
vi.mock("@/lib/actions/vistas-filtro", () => ({
  listarVistasFiltro: (...a: unknown[]) => listarVistasMock(...a),
  guardarVistaFiltro: (...a: unknown[]) => guardarVistaMock(...a),
  renombrarVistaFiltro: vi.fn(),
  actualizarVistaFiltro: vi.fn(),
  eliminarVistaFiltro: vi.fn(),
}));
vi.mock("@/lib/actions/order-status", () => ({
  listarOrderStatus: vi.fn(async () => listarOrderStatusOk()),
}));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: vi.fn() }));
vi.mock("@/lib/utils/xlsx-template", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/xlsx-template")>();
  return { ...actual, buildXlsxRows: vi.fn(async () => new ArrayBuffer(8)) };
});
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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/recepcion-satelite/en-bodega",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("html5-qrcode", () => ({ Html5Qrcode: vi.fn() }));
vi.mock("@/hooks/use-etiquetas-geograficas", async () => {
  const { ETIQUETAS_CR } = await import("../fabricas/etiquetas-geograficas");
  return { useEtiquetasGeograficas: () => ETIQUETAS_CR };
});

import { listarOrderStatusOk } from "@/tests/fixtures/order-status-catalogo";
import { RecepcionSateliteModule } from "@/app/(app)/recepcion-satelite/_components/RecepcionSateliteModule";

function makeOrden(id: string, numRemision: string): RecepcionSateliteDTO {
  return {
    ...CAMPOS_BASE_ORDEN,
    id,
    numGuia: 1000 + Number(id.replace(/\D/g, "") || 0),
    numRemision,
    estatusValue: "en_bodega_satelite",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1",
    producto: "Caja",
    montoCobrar: 150,
    tiendaNombre: "Tienda X",
    zonaNombre: "Limón",
    provinciaNombre: "Limón",
    cantonNombre: "Central",
    distritoNombre: "Limón",
  };
}

/** La página que pre-carga el servidor (orden por defecto) y la del orden por remisión. */
const PRECARGADA = [makeOrden("o1", "NA-30"), makeOrden("o2", "NA-10"), makeOrden("o3", "NA-20")];
const POR_REMISION = [makeOrden("o2", "NA-10"), makeOrden("o3", "NA-20"), makeOrden("o1", "NA-30")];

const VISTA: VistaFiltroDTO = {
  id: "v-sat",
  nombre: "Por devolver de hoy",
  superficie: "ordenes-bodega-satelite",
  filtro: { v: 1, termino: "NA-2", activos: ["estado"], seleccion: { estado: ["novedad"] } },
  actualizadaEn: "2026-11-19T00:00:00.000Z",
};

/** Total mayor que una página: hace falta para medir el reset a la página 1 desde la 2. */
const TOTAL = 60;

interface Llamada {
  page?: number;
  sortBy?: string;
  sortDir?: string;
  q?: string;
  estados?: string[];
}

function ultimaLlamada(): Llamada {
  return (paginadoMock.mock.calls.at(-1)?.[0] ?? {}) as Llamada;
}

function renderModulo(catalogo: CatalogoFiltrosOrdenesDTO | null = catalogoSatelite(PRECARGADA)) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <RecepcionSateliteModule
        ordenesBodega={paginaBodega(PRECARGADA, { total: TOTAL })}
        catalogoFiltros={catalogo}
        zonaNombre="Limón"
        sinZona={false}
        mensajeros={[]}
        bloqueoBodega={{ bloqueada: false, porMensajeros: false, porCierreBodega: false }}
      />
    </SWRConfig>,
  );
}

const grupoCampo = () => screen.getByRole("group", { name: "Ordenar por" });
const grupoDireccion = (campo: "fecha de creación" | "número de remisión") =>
  screen.getByRole("group", { name: `Dirección del orden por ${campo}` });
const campoBuscar = () =>
  screen.getByRole("searchbox", { name: "Buscar órdenes de la bodega" }) as HTMLInputElement;
const remisionesEnTabla = () =>
  within(screen.getByRole("table", { name: "Órdenes de la bodega" }))
    .getAllByText(/^NA-\d+$/)
    .map((n) => n.textContent);

async function abrirVistas(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Vistas guardadas" }));
  await waitFor(() => expect(listarVistasMock).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  paginadoMock.mockImplementation(async (input: Llamada) => ({
    status: "ok",
    items: input.sortBy === "num_remision" ? POR_REMISION : PRECARGADA,
    page: input.page ?? 1,
    pageSize: 25,
    total: TOTAL,
  }));
  completoMock.mockResolvedValue({ status: "ok", items: PRECARGADA, total: PRECARGADA.length });
  listarVistasMock.mockResolvedValue({ status: "ok", vistas: [VISTA] });
});

afterEach(() => cleanup());

describe("SLT-210 · R1400/R1401 — la barra trae «Vistas» y los dos conmutadores de `/ordenes`", () => {
  it("en ese orden, al inicio de la fila, con sus nombres y arrancando en «Fecha de creación» + «Más recientes»", async () => {
    renderModulo();

    const vistas = screen.getByRole("button", { name: "Vistas guardadas" });
    const campo = grupoCampo();
    const direccion = grupoDireccion("fecha de creación");
    // Orden en el documento: Vistas → campo → dirección → buscador.
    expect(vistas.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(campo.compareDocumentPosition(direccion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      direccion.compareDocumentPosition(campoBuscar()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Las mismas opciones y nombres accesibles que `/ordenes` (R1400), puestas en el inicio (R1401).
    expect(within(campo).getByRole("button", { name: "Fecha de creación" })).toHaveAttribute("aria-pressed", "true");
    expect(within(campo).getByRole("button", { name: "Número de remisión" })).toHaveAttribute("aria-pressed", "false");
    expect(within(direccion).getByRole("button", { name: "Más recientes" })).toHaveAttribute("aria-pressed", "true");
    expect(within(direccion).getByRole("button", { name: "Más antiguas" })).toHaveAttribute("aria-pressed", "false");

    // R1401: lo que se pide al entrar es el orden de siempre, y la tabla pinta la pre-cargada.
    await waitFor(() => expect(paginadoMock).toHaveBeenCalled());
    expect(paginadoMock.mock.calls[0]![0]).toMatchObject({ sortBy: "created_at", sortDir: "desc" });
    expect(remisionesEnTabla()).toEqual(["NA-30", "NA-10", "NA-20"]);
  });
});

describe("SLT-210 · R1402 — cambiar el orden pide la página 1 con ese orden y la pinta en ese orden", () => {
  it("desde la página 2; el campo no toca la dirección; la pre-cargada no se pinta como respuesta", async () => {
    const user = userEvent.setup();
    renderModulo();
    await waitFor(() => expect(paginadoMock).toHaveBeenCalled());

    await user.click(await screen.findByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(ultimaLlamada().page).toBe(2));

    // El servidor tarda en responder el orden nuevo: mientras, la tabla NO puede enseñar la
    // página pre-cargada (orden por defecto) como si fuera la respuesta.
    let responder: (v: unknown) => void = () => {};
    paginadoMock.mockImplementationOnce(
      (input: Llamada) =>
        new Promise((r) => {
          responder = () =>
            r({ status: "ok", items: POR_REMISION, page: input.page, pageSize: 25, total: TOTAL });
        }),
    );
    await user.click(within(grupoCampo()).getByRole("button", { name: "Número de remisión" }));

    await waitFor(() =>
      expect(ultimaLlamada()).toMatchObject({ page: 1, sortBy: "num_remision", sortDir: "desc" }),
    );
    expect(screen.queryByText("NA-30")).toBeNull();

    responder(undefined);
    await waitFor(() => expect(remisionesEnTabla()).toEqual(["NA-10", "NA-20", "NA-30"]));
    // Cambiar el campo NO cambió la dirección: sigue la primera opción («desc»), ahora «Más altas».
    expect(
      within(grupoDireccion("número de remisión")).getByRole("button", { name: "Más altas" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Y la dirección se cambia sola, sin tocar el campo.
    await user.click(
      within(grupoDireccion("número de remisión")).getByRole("button", { name: "Más bajas" }),
    );
    await waitFor(() =>
      expect(ultimaLlamada()).toMatchObject({ page: 1, sortBy: "num_remision", sortDir: "asc" }),
    );
  });
});

describe("SLT-210 · R1406 — la descarga sale en el orden vigente", () => {
  it("el conjunto del archivo se pide con el campo y la dirección puestos en pantalla", async () => {
    const user = userEvent.setup();
    renderModulo();
    await user.click(
      within(grupoDireccion("fecha de creación")).getByRole("button", { name: "Más antiguas" }),
    );
    await waitFor(() => expect(ultimaLlamada().sortDir).toBe("asc"));

    await user.click(screen.getByRole("button", { name: "Descargar Órdenes de la bodega" }));

    await waitFor(() => expect(completoMock).toHaveBeenCalledTimes(1));
    expect(completoMock.mock.calls[0]![0]).toEqual({ sortBy: "created_at", sortDir: "asc" });
  });
});

describe("SLT-210 · R1407 — «Limpiar todo» vacía búsqueda y filtros, y no toca el orden", () => {
  it("el orden puesto sobrevive a la limpieza", async () => {
    const user = userEvent.setup();
    renderModulo();
    await user.click(within(grupoCampo()).getByRole("button", { name: "Número de remisión" }));
    await user.type(campoBuscar(), "NA-1");
    await waitFor(() => expect(ultimaLlamada()).toMatchObject({ q: "NA-1", sortBy: "num_remision" }));

    await user.click(screen.getByRole("button", { name: /Limpiar todo/ }));

    await waitFor(() => expect(ultimaLlamada().q).toBeUndefined());
    expect(campoBuscar().value).toBe("");
    expect(ultimaLlamada()).toMatchObject({ sortBy: "num_remision", sortDir: "desc" });
    expect(within(grupoCampo()).getByRole("button", { name: "Número de remisión" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("SLT-210 · R1408/R1411 — guardar una vista: su superficie, sus tres piezas y NO el orden", () => {
  it("lista y guarda en «ordenes-bodega-satelite», con término, filtros y valores, sin campo ni dirección", async () => {
    const user = userEvent.setup();
    listarVistasMock.mockResolvedValue({ status: "ok", vistas: [] });
    guardarVistaMock.mockResolvedValue({ status: "ok", vista: { ...VISTA, id: "v-nueva", nombre: "Nueva" } });
    renderModulo();
    await user.click(within(grupoCampo()).getByRole("button", { name: "Número de remisión" }));
    await user.type(campoBuscar(), "NA-9");
    await waitFor(() => expect(ultimaLlamada().q).toBe("NA-9"));

    await abrirVistas(user);
    // R1411: la lista que se pide es la de ESTA superficie, nunca la de `/ordenes`.
    expect(listarVistasMock).toHaveBeenCalledWith({ superficie: "ordenes-bodega-satelite" });
    await user.click(screen.getByRole("button", { name: /Guardar filtros actuales/ }));
    const modal = screen.getByRole("dialog");
    await user.type(within(modal).getByRole("textbox", { name: "Nombre" }), "Nueva");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(guardarVistaMock).toHaveBeenCalledWith({
        superficie: "ordenes-bodega-satelite",
        nombre: "Nueva",
        filtro: { v: 1, termino: "NA-9", activos: [], seleccion: {} },
      }),
    );
  });
});

describe("SLT-210 · R1409/R1410 — aplicar una vista y dejar de tenerla puesta", () => {
  it("repone término, filtro y valor; vuelve a la página 1; la marca; y no cambia el orden", async () => {
    const user = userEvent.setup();
    renderModulo();
    await waitFor(() => expect(paginadoMock).toHaveBeenCalled());
    await user.click(
      within(grupoDireccion("fecha de creación")).getByRole("button", { name: "Más antiguas" }),
    );
    await user.click(await screen.findByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(ultimaLlamada()).toMatchObject({ page: 2, sortDir: "asc" }));

    await abrirVistas(user);
    await user.click(await screen.findByRole("button", { name: "Aplicar «Por devolver de hoy»" }));

    await waitFor(() =>
      expect(ultimaLlamada()).toMatchObject({
        page: 1,
        q: "NA-2",
        estados: ["novedad"],
        sortBy: "created_at",
        sortDir: "asc",
      }),
    );
    expect(campoBuscar().value).toBe("NA-2");
    // El control de estado, MONTADO y con su valor.
    expect(await screen.findByRole("button", { name: /^Estado:/ })).toBeInTheDocument();
    expect(
      within(grupoDireccion("fecha de creación")).getByRole("button", { name: "Más antiguas" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Una emisión tardía de los canónicos apagaría la marca después de aplicar: se espera antes
    // de mirarla (mismo cuidado que en `/ordenes`).
    await new Promise((listo) => setTimeout(listo, 700));
    await abrirVistas(user);
    expect(await screen.findByText("Puesta ahora")).toBeInTheDocument();

    // R1410: cambiar la búsqueda apaga la marca.
    await user.keyboard("{Escape}");
    await user.type(campoBuscar(), "0");
    await waitFor(() => expect(ultimaLlamada().q).toBe("NA-20"));
    await abrirVistas(user);
    expect(screen.queryByText("Puesta ahora")).toBeNull();
  });

  it("R1410: «Limpiar todo» también la apaga", async () => {
    const user = userEvent.setup();
    renderModulo();
    await abrirVistas(user);
    await user.click(await screen.findByRole("button", { name: "Aplicar «Por devolver de hoy»" }));
    await waitFor(() => expect(ultimaLlamada().q).toBe("NA-2"));
    await new Promise((listo) => setTimeout(listo, 700));
    await abrirVistas(user);
    expect(await screen.findByText("Puesta ahora")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /Limpiar todo/ }));
    await waitFor(() => expect(ultimaLlamada().q).toBeUndefined());

    await abrirVistas(user);
    expect(screen.queryByText("Puesta ahora")).toBeNull();
  });
});

describe("SLT-210 · R1414 — sin catálogo no se presenta ninguna vista como incompleta", () => {
  it("con la geografía caída el botón no aplica y no sale «Incompleta»", async () => {
    const user = userEvent.setup();
    renderModulo(null);
    await abrirVistas(user);

    expect(await screen.findByRole("button", { name: "Aplicar «Por devolver de hoy»" })).toBeDisabled();
    expect(screen.queryByText("Incompleta")).toBeNull();
  });
});

describe("SLT-210 · R1413 — el mismo tamaño que hoy en `/ordenes` (P3: sin tocar los compartidos)", () => {
  it("«Vistas» mide `h-8` y los cuatro botones `size-8`, sin el alto táctil de móvil", () => {
    renderModulo();
    const vistas = screen.getByRole("button", { name: "Vistas guardadas" });
    expect(vistas.className).toContain("h-8");
    expect(vistas.className).not.toContain("max-md:h-11");
    const botones = [
      ...within(grupoCampo()).getAllByRole("button"),
      ...within(grupoDireccion("fecha de creación")).getAllByRole("button"),
    ];
    expect(botones).toHaveLength(4);
    for (const b of botones) {
      expect(b.className, b.getAttribute("aria-label") ?? "").toContain("size-8");
      expect(b.className, b.getAttribute("aria-label") ?? "").not.toContain("max-md:h-11");
    }
  });
});
