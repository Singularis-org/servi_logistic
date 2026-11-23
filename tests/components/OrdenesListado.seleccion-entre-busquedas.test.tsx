// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { OrdenesListado } from "@/app/(app)/ordenes/_components/OrdenesListado";
import { ToastProvider } from "@/providers/ToastProvider";
import { listarOrdenes } from "@/lib/actions/ordenes";
import { listarOrderStatus } from "@/lib/actions/order-status";
import { listarMensajerosParaAsignacion, generarGuia } from "@/lib/actions/ordenes-guia";
import { generarEtiquetas } from "@/lib/actions/etiquetas-guia";
import type { EtiquetaGuiaDTO } from "@/lib/types/etiqueta-guia";
import type { OrdenListItemDTO } from "@/lib/types/orden";

// SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos» (T2) —
// en la superficie REAL de `/ordenes`: buscar A, marcar, buscar B, marcar, y la acción en
// lote (con su encadenado a etiquetas) recibe las dos; quién vacía la selección y quién no.
// Solo se stubea el borde: server actions, PDF, QR/barcode, y la entrada de «Recibir
// paquete» (su escáner necesita cámara; aquí basta con disparar `onRecibida`).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/actions/ordenes", () => ({ listarOrdenes: vi.fn() }));
vi.mock("@/lib/actions/order-status", () => ({ listarOrderStatus: vi.fn() }));
vi.mock("@/lib/actions/ordenes-guia", () => ({
  listarMensajerosParaAsignacion: vi.fn(),
  generarGuia: vi.fn(),
  asignarDesdeBodega: vi.fn(),
}));
vi.mock("@/lib/actions/etiquetas-guia", () => ({
  generarEtiquetas: vi.fn(),
  obtenerEtiquetaPorGuia: vi.fn(),
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
  default: ({ value }: { value: string }) => <div data-testid="barcode-stub" data-value={value} />,
}));
vi.mock("@/components/shared/RecibirPaquetesEntrada", () => ({
  RecibirPaquetesEntrada: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral", () => ({
  EscanerRecepcionBodegaCentral: ({ onRecibida }: { onRecibida?: () => void }) => (
    <button type="button" onClick={() => onRecibida?.()}>
      Simular paquete recibido
    </button>
  ),
}));

const listarOrdenesMock = vi.mocked(listarOrdenes);
const listarOrderStatusMock = vi.mocked(listarOrderStatus);
const listarMensajerosMock = vi.mocked(listarMensajerosParaAsignacion);
const generarGuiaMock = vi.mocked(generarGuia);
const generarEtiquetasMock = vi.mocked(generarEtiquetas);

const ESPERA = { timeout: 3000 };

function makeOrden(id: string): OrdenListItemDTO {
  return {
    id,
    numGuia: null,
    numRemision: `REM-${id}`,
    estatusId: "est-preparacion",
    estatusValue: "en_preparacion",
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: "tienda-uuid",
    tiendaNombre: "Tienda X",
    zonaId: "zona-libre",
    zonaEsGam: true,
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function makeEtiqueta(ordenId: string, numGuia: number): EtiquetaGuiaDTO {
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
    zonaNombre: "Zona A",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: null,
    fechaCreacion: "2026-08-27",
    qrValue: String(numGuia),
    barcodeValue: String(numGuia),
  };
}

/** Qué devuelve el servidor por término: «juan» → o1, «pedro» → o2, sin término → las dos. */
const POR_TERMINO: Record<string, OrdenListItemDTO[]> = {
  juan: [makeOrden("o1")],
  pedro: [makeOrden("o2")],
};

function renderListado(props: { puedeRecibirBodegaCentral?: boolean } = {}) {
  listarOrderStatusMock.mockResolvedValue({
    status: "ok",
    estatus: [{ id: "est-preparacion", value: "en_preparacion" }],
  });
  listarOrdenesMock.mockImplementation(async (input) => {
    const { page, pageSize, filter } = input as {
      page: number;
      pageSize: number;
      filter?: { q?: string };
    };
    const items = filter?.q
      ? (POR_TERMINO[filter.q] ?? [])
      : [makeOrden("o1"), makeOrden("o2")];
    return { status: "ok", items, page, pageSize, total: items.length };
  });
  render(
    <ToastProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <OrdenesListado accionesLote {...props} />
      </SWRConfig>
    </ToastProvider>,
  );
}

function ultimoTermino(): string | undefined {
  const ultima = listarOrdenesMock.mock.calls.at(-1)?.[0] as
    | { filter?: { q?: string } }
    | undefined;
  return ultima?.filter?.q;
}

/** Escribe el término en el buscador (como lo haría la pistola) y espera su consulta. */
async function buscar(user: ReturnType<typeof userEvent.setup>, termino: string) {
  const campo = await screen.findByRole("searchbox", { name: "Buscar órdenes" });
  await user.clear(campo);
  await user.type(campo, termino);
  await waitFor(() => expect(ultimoTermino()).toBe(termino), ESPERA);
}

async function marcar(user: ReturnType<typeof userEvent.setup>, numRemision: string) {
  await user.click(
    await screen.findByRole("checkbox", { name: `Seleccionar orden ${numRemision}` }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarMensajerosMock.mockResolvedValue({
    status: "ok",
    mensajeros: [{ id: "m1", nombre: "Ana Mensajera" }],
    bloqueadosIds: [],
  });
});

afterEach(() => cleanup());

describe("SLT-222 — /ordenes (superficie real)", () => {
  it("R1501 + R1505 + R1508: buscar, marcar, buscar otra, marcar: «Generar guía» y sus etiquetas reciben las DOS; tras el éxito se desmarca todo", async () => {
    const user = userEvent.setup();
    generarGuiaMock.mockResolvedValue({
      status: "ok",
      resultados: [
        { ordenId: "o1", numGuia: 5001, estado: "en_bodega_central" },
        { ordenId: "o2", numGuia: 5002, estado: "en_bodega_central" },
      ],
    });
    generarEtiquetasMock.mockResolvedValue({
      status: "ok",
      etiquetas: [makeEtiqueta("o1", 5001), makeEtiqueta("o2", 5002)],
      omitidas: [],
    });
    renderListado();

    await buscar(user, "juan");
    await marcar(user, "REM-o1");
    await buscar(user, "pedro");
    await marcar(user, "REM-o2");

    expect(
      await screen.findByText("2 seleccionadas · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generar guía" }));
    const guiaDialog = await screen.findByRole("dialog", { name: "Generar guía" });
    await user.click(within(guiaDialog).getByRole("button", { name: "Generar guía" }));
    await waitFor(() => expect(generarGuiaMock).toHaveBeenCalledTimes(1));
    const { ordenIds } = generarGuiaMock.mock.calls[0]![0] as { ordenIds: string[] };
    expect([...ordenIds].sort()).toEqual(["o1", "o2"]);

    // Encadenado guía → etiquetas: recibe el MISMO lote aunque la selección ya se vació.
    await user.click(within(guiaDialog).getByRole("button", { name: "Cerrar" }));
    await screen.findByRole("dialog", { name: "Imprimir etiquetas" });
    const pedidoEtiquetas = generarEtiquetasMock.mock.calls[0]![0] as { ordenIds: string[] };
    expect([...pedidoEtiquetas.ordenIds].sort()).toEqual(["o1", "o2"]);

    // R1508: tras el éxito, nada queda marcado (tampoco la o1, que no está a la vista).
    expect(screen.queryByText(/seleccionada/)).toBeNull();
  });

  it("R1502: «Limpiar todo» de la barra de filtros conserva lo marcado", async () => {
    const user = userEvent.setup();
    renderListado();

    await buscar(user, "juan");
    await marcar(user, "REM-o1");
    await user.click(screen.getByRole("button", { name: "Limpiar todo" }));
    await waitFor(() => expect(ultimoTermino()).toBeUndefined(), ESPERA);

    expect(await screen.findByText("1 seleccionada")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar orden REM-o1" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("R1510: terminar una recepción por escaneo revalida el listado y NO desmarca", async () => {
    const user = userEvent.setup();
    renderListado({ puedeRecibirBodegaCentral: true });

    await buscar(user, "juan");
    await marcar(user, "REM-o1");
    await screen.findByText("1 seleccionada");
    const llamadasAntes = listarOrdenesMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Simular paquete recibido" }));

    await waitFor(() =>
      expect(listarOrdenesMock.mock.calls.length).toBeGreaterThan(llamadasAntes),
    );
    expect(screen.getByText("1 seleccionada")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar orden REM-o1" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
