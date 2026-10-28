// @vitest-environment jsdom
// SLT-49 (T6) — «Imprimir etiquetas» por lote para la tienda en `/ordenes`.
//
// La tienda recibe `puedeImprimirEtiquetasPropias` (y `puedeEliminar`, como en la página real) y
// NO `accionesLote`. Se prueba con el componente REAL (`OrdenesListado` + `EtiquetasGuiaModal`);
// solo se mockea el borde (Server Actions), el toast, el router y lo que jsdom no pinta (PDF,
// QR, código de barras). Los textos esperados van LITERALES: es lo que la persona lee, no lo que
// una constante devuelve.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { OrdenListItemDTO } from "@/lib/types/orden";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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

const listarOrderStatusMock = vi.fn();
vi.mock("@/lib/actions/order-status", () => ({
  listarOrderStatus: (...a: unknown[]) => listarOrderStatusMock(...a),
}));

const listarOrdenesMock = vi.fn();
vi.mock("@/lib/actions/ordenes", () => ({
  listarOrdenes: (...a: unknown[]) => listarOrdenesMock(...a),
}));

const listarMensajerosMock = vi.fn();
vi.mock("@/lib/actions/ordenes-guia", () => ({
  listarMensajerosParaAsignacion: (...a: unknown[]) => listarMensajerosMock(...a),
  generarGuia: vi.fn(),
  asignarDesdeBodega: vi.fn(),
  listarZonasBloqueadasPorCierre: vi
    .fn()
    .mockResolvedValue({ status: "ok", zonasBloqueadasIds: [] }),
}));

const generarEtiquetasMock = vi.fn();
vi.mock("@/lib/actions/etiquetas-guia", () => ({
  generarEtiquetas: (...a: unknown[]) => generarEtiquetasMock(...a),
  obtenerEtiquetaPorGuia: vi.fn(),
}));

vi.mock("@/lib/actions/eliminar-orden", () => ({
  eliminarOrdenes: vi.fn(),
}));

vi.mock("@/app/(app)/ordenes/_components/etiquetas-pdf", () => ({
  descargarEtiquetasPdf: vi.fn(),
}));
vi.mock("@/app/(app)/ordenes/_components/DevolverATiendaModal", () => ({
  DevolverATiendaModal: () => null,
}));
vi.mock("qrcode.react", () => ({
  QRCodeCanvas: () => <canvas data-testid="qr-stub" />,
}));
vi.mock("react-barcode", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="barcode-stub" data-value={value} />
  ),
}));
vi.mock("html5-qrcode", () => ({ Html5Qrcode: vi.fn() }));

import { OrdenesListado } from "@/app/(app)/ordenes/_components/OrdenesListado";

const CATALOGO = [
  { id: "est-por_recolectar_en_tienda", value: "por_recolectar_en_tienda" },
  { id: "est-recolectando", value: "recolectando" },
  { id: "est-mensajero_recogiendo_en_bodega", value: "mensajero_recogiendo_en_bodega" },
  { id: "est-en_preparacion", value: "en_preparacion" },
  { id: "est-en_bodega_central", value: "en_bodega_central" },
];

function makeOrden(
  over: Partial<OrdenListItemDTO> & { id: string; estatusValue: string },
): OrdenListItemDTO {
  return {
    numGuia: 1001,
    numRemision: `REM-${over.id}`,
    estatusId: `est-${over.estatusValue}`,
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: "tienda-1",
    tiendaNombre: "Tienda X",
    zonaId: "zona-1",
    zonaNombre: "Central",
    zonaEsGam: true,
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    eliminable: false,
    relaciones: {
      estatus: { id: `est-${over.estatusValue}`, value: over.estatusValue },
      tienda: null,
      zona: { id: "zona-1", nombre: "Central", esCentral: true },
      provincia: null,
      canton: null,
      distrito: null,
      mensajeroAsignado: null,
    },
    createdAt: new Date("2026-10-28T00:00:00Z"),
    updatedAt: new Date("2026-10-28T00:00:00Z"),
    ...over,
  } as OrdenListItemDTO;
}

function etiquetaDe(ordenId: string, numGuia: number) {
  return {
    ordenId,
    numGuia,
    numRemision: `REM-${ordenId}`,
    destinatario: "Destino",
    telefonoDest: "0999999999",
    direccion: "Dir",
    producto: "Producto",
    montoCobrar: 100,
    tiendaNombre: "Tienda X",
    zonaNombre: "Central",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: null,
    fechaCreacion: "2026-10-28",
    qrValue: String(numGuia),
    barcodeValue: String(numGuia),
  };
}

type Rol = "tienda" | "maestro";

function renderListado(items: OrdenListItemDTO[], rol: Rol = "tienda") {
  listarOrdenesMock.mockResolvedValue({
    status: "ok",
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
  });
  const props =
    rol === "tienda"
      ? { puedeImprimirEtiquetasPropias: true, puedeEliminar: true }
      : { accionesLote: true, puedeEliminar: true };
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <OrdenesListado {...props} />
    </SWRConfig>,
  );
}

async function marcar(user: ReturnType<typeof userEvent.setup>, numRemision: string) {
  await user.click(
    await screen.findByRole("checkbox", { name: `Seleccionar orden ${numRemision}` }),
  );
}

/** Nombres de los botones de la barra de selección (incluye «Limpiar»). */
async function botonesDeLaBarra(): Promise<string[]> {
  const contador = await screen.findByText(/^\d+ seleccionadas?$/);
  const barra = contador.parentElement as HTMLElement;
  return within(barra)
    .getAllByRole("button")
    .map((b) => b.textContent?.trim() ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  listarOrderStatusMock.mockResolvedValue({ status: "ok", estatus: CATALOGO });
  listarMensajerosMock.mockResolvedValue({
    status: "ok",
    mensajeros: [],
    bloqueadosIds: [],
    noAsignablesIds: [],
    conRepartoIds: [],
    conRecoleccionIds: [],
  });
});

afterEach(() => {
  cleanup();
});

describe("SLT-49 — la tienda imprime etiquetas por lote en `/ordenes`", () => {
  it("R1 — la tienda puede marcar sus órdenes con guía en los 3 estados de recogida", async () => {
    renderListado([
      makeOrden({ id: "a", estatusValue: "por_recolectar_en_tienda", numGuia: 2001 }),
      makeOrden({ id: "b", estatusValue: "recolectando", numGuia: 2002 }),
      makeOrden({ id: "c", estatusValue: "mensajero_recogiendo_en_bodega", numGuia: 2003 }),
    ]);
    for (const rem of ["REM-a", "REM-b", "REM-c"]) {
      expect(
        await screen.findByRole("checkbox", { name: `Seleccionar orden ${rem}` }),
      ).toBeInTheDocument();
    }
  });

  it("R2 — con toda la selección elegible, la barra ofrece «Imprimir etiquetas» sin conteo", async () => {
    const user = userEvent.setup();
    renderListado([
      makeOrden({ id: "a", estatusValue: "por_recolectar_en_tienda", numGuia: 2001 }),
      makeOrden({ id: "b", estatusValue: "recolectando", numGuia: 2002 }),
    ]);
    await marcar(user, "REM-a");
    await marcar(user, "REM-b");
    expect(await screen.findByRole("button", { name: "Imprimir etiquetas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir etiquetas \(/ })).toBeNull();
  });

  it("R2 — si no toda la selección es elegible, el botón dice cuántas: «Imprimir etiquetas (1)»", async () => {
    const user = userEvent.setup();
    renderListado([
      makeOrden({ id: "a", estatusValue: "mensajero_recogiendo_en_bodega", numGuia: 2001 }),
      // Marcable solo por «Eliminar»: no está en un estado de recogida.
      makeOrden({ id: "p", estatusValue: "en_preparacion", numGuia: null, eliminable: true }),
    ]);
    await marcar(user, "REM-a");
    await marcar(user, "REM-p");
    expect(
      await screen.findByRole("button", { name: "Imprimir etiquetas (1)" }),
    ).toBeInTheDocument();
  });

  it("R4 — la barra de la tienda no trae ninguna otra acción de flujo; «Eliminar» sí, si la orden es eliminable", async () => {
    const user = userEvent.setup();
    renderListado([
      makeOrden({ id: "a", estatusValue: "por_recolectar_en_tienda", numGuia: 2001, eliminable: true }),
      makeOrden({ id: "b", estatusValue: "recolectando", numGuia: 2002, eliminable: true }),
      makeOrden({ id: "c", estatusValue: "mensajero_recogiendo_en_bodega", numGuia: 2003, eliminable: true }),
    ]);
    await marcar(user, "REM-a");
    await marcar(user, "REM-b");
    await marcar(user, "REM-c");
    // Exactamente estas, en este orden: «Eliminar» la última, «Limpiar» no es acción.
    expect(await botonesDeLaBarra()).toEqual(["Imprimir etiquetas", "Eliminar", "Limpiar"]);
    expect(
      screen.queryByRole("button", { name: "Asignar mensajero para recolección" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Quitar mensajero" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deshacer asignación" })).toBeNull();
  });

  it("R5 — una orden de recogida SIN guía no se marca y el «!» dice «Sin guía todavía», aunque sea eliminable", async () => {
    renderListado([
      makeOrden({ id: "a", estatusValue: "por_recolectar_en_tienda", numGuia: 2001 }),
      makeOrden({ id: "s", estatusValue: "recolectando", numGuia: null, eliminable: true }),
    ]);
    await screen.findByRole("checkbox", { name: "Seleccionar orden REM-a" });
    expect(screen.queryByRole("checkbox", { name: "Seleccionar orden REM-s" })).toBeNull();
    expect(
      screen.getByRole("img", {
        name: "No se puede seleccionar la orden REM-s: Sin guía todavía",
      }),
    ).toBeInTheDocument();
  });

  it("R6 — si ninguna marcada está en recogida con guía, «Imprimir etiquetas» no aparece", async () => {
    const user = userEvent.setup();
    renderListado([
      makeOrden({ id: "a", estatusValue: "por_recolectar_en_tienda", numGuia: 2001 }),
      makeOrden({ id: "p", estatusValue: "en_preparacion", numGuia: null, eliminable: true }),
    ]);
    await marcar(user, "REM-p");
    expect(await botonesDeLaBarra()).toEqual(["Eliminar", "Limpiar"]);
    expect(screen.queryByRole("button", { name: /Imprimir etiquetas/ })).toBeNull();
  });

  it("R6/R5 — una página solo con órdenes de recogida sin guía no monta casillas: ninguna lleva a «Imprimir etiquetas»", async () => {
    renderListado([
      makeOrden({ id: "s1", estatusValue: "por_recolectar_en_tienda", numGuia: null }),
      makeOrden({ id: "s2", estatusValue: "mensajero_recogiendo_en_bodega", numGuia: null }),
    ]);
    await screen.findByText("REM-s1");
    expect(
      screen.queryByRole("checkbox", { name: "Seleccionar todas las órdenes" }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Seleccionar orden/ })).toBeNull();
  });

  it("R3 (parcial, componente) — pulsar «Imprimir etiquetas (2)» abre la vista previa con SOLO esas órdenes", async () => {
    const user = userEvent.setup();
    generarEtiquetasMock.mockResolvedValue({
      status: "ok",
      etiquetas: [etiquetaDe("a", 2001), etiquetaDe("c", 2003)],
      omitidas: [],
    });
    renderListado([
      makeOrden({ id: "a", estatusValue: "por_recolectar_en_tienda", numGuia: 2001 }),
      makeOrden({ id: "c", estatusValue: "mensajero_recogiendo_en_bodega", numGuia: 2003 }),
      makeOrden({ id: "p", estatusValue: "en_preparacion", numGuia: null, eliminable: true }),
    ]);
    await marcar(user, "REM-a");
    await marcar(user, "REM-c");
    await marcar(user, "REM-p");
    await user.click(await screen.findByRole("button", { name: "Imprimir etiquetas (2)" }));

    const dialogo = await screen.findByRole("dialog", { name: "Imprimir etiquetas" });
    expect(await within(dialogo).findAllByTestId("etiqueta-guia")).toHaveLength(2);
    expect(generarEtiquetasMock).toHaveBeenCalledTimes(1);
    expect(generarEtiquetasMock).toHaveBeenCalledWith({ ordenIds: ["a", "c"] });
    expect(
      within(dialogo).getByRole("button", { name: "Descargar etiquetas" }),
    ).toBeInTheDocument();
  });

  it("R15 — el maestro (con `accionesLote`) sigue imprimiendo en `en_bodega_central` y el modal abre", async () => {
    const user = userEvent.setup();
    generarEtiquetasMock.mockResolvedValue({
      status: "ok",
      etiquetas: [etiquetaDe("b", 3001)],
      omitidas: [],
    });
    renderListado(
      [makeOrden({ id: "b", estatusValue: "en_bodega_central", numGuia: 3001 })],
      "maestro",
    );
    await marcar(user, "REM-b");
    await user.click(await screen.findByRole("button", { name: "Imprimir etiquetas" }));

    const dialogo = await screen.findByRole("dialog", { name: "Imprimir etiquetas" });
    expect(await within(dialogo).findByTestId("etiqueta-guia")).toBeInTheDocument();
    expect(generarEtiquetasMock).toHaveBeenCalledWith({ ordenIds: ["b"] });
    // Montado UNA sola vez: no hay dos diálogos de etiquetas.
    expect(screen.getAllByRole("dialog", { name: "Imprimir etiquetas" })).toHaveLength(1);
  });
});
