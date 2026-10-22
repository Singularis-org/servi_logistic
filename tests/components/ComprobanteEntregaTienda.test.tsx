// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { HistorialOrdenSheet } from "@/app/(app)/ordenes/_components/HistorialOrdenSheet";
import { OrdenesModule } from "@/app/(app)/ordenes/_components/OrdenesModule";
import { listarOrdenes } from "@/lib/actions/ordenes";
import { verComprobanteDevolucionTienda } from "@/lib/actions/devolucion-tienda";
import { obtenerHistorialOrden, type ObtenerHistorialOrdenResult } from "@/lib/actions/orden-historial";
import type { VerComprobanteDevolucionTiendaResult } from "@/lib/types/devolucion-tienda";
import type { OrdenListItemDTO } from "@/lib/types/orden";

// FICHA 419 (F3, R22) — «Ver comprobante de entrega» en el historial de una orden.
//   - Se ofrece SOLO si quien monta el drawer lo pide (`/ordenes` lo pide para maestro/admin y
//     solo en filas `devuelta_a_tienda`): sin la prop, ni rastro del botón.
//   - Al pulsar, pide las URLs firmadas y abre cada foto en una pestaña nueva; si el servidor
//     dice `no_encontrado`, lo dice en lenguaje claro; si falla, lo dice y deja reintentar.
vi.mock("@/lib/actions/ordenes", () => ({ listarOrdenes: vi.fn() }));
vi.mock("@/lib/actions/devolucion-tienda", () => ({
  verComprobanteDevolucionTienda: vi.fn(),
}));
vi.mock("@/lib/actions/orden-historial", () => ({ obtenerHistorialOrden: vi.fn() }));

const listarOrdenesMock = vi.mocked(listarOrdenes);
const verMock = vi.mocked(verComprobanteDevolucionTienda);
const historialMock = vi.mocked(obtenerHistorialOrden);

const HISTORIAL_OK: ObtenerHistorialOrdenResult = {
  status: "ok",
  entradas: [],
  intentos: 0,
  umbral: 3,
  gestionPendiente: null,
  ayudaAbierta: false,
};

const OK: VerComprobanteDevolucionTiendaResult = {
  status: "ok",
  confirmadoAt: "2026-10-21T15:30:00.000Z",
  confirmadoPor: "Ana Admin",
  archivos: [
    { url: "https://firmada.example/a?token=1", contentType: "image/jpeg", indice: 0 },
    { url: "https://firmada.example/b?token=2", contentType: "image/png", indice: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  historialMock.mockResolvedValue(HISTORIAL_OK);
});
afterEach(cleanup);

async function abrirHistorial(user: ReturnType<typeof userEvent.setup>, ref: string) {
  await user.click(
    await screen.findByRole("button", { name: `Ver historial de la orden ${ref}` }),
  );
  return screen.findByRole("dialog");
}

describe("419/R22 — HistorialOrdenSheet", () => {
  it("con la prop, ofrece el botón; al pulsar pide el comprobante de ESA orden y enlaza cada foto", async () => {
    const user = userEvent.setup();
    const verComprobante = vi.fn(async () => OK);
    render(
      <HistorialOrdenSheet
        ordenId="orden-1"
        referencia="REM-1"
        obtenerHistorial={async () => HISTORIAL_OK}
        ofrecerComprobanteEntrega
        verComprobante={verComprobante}
      />,
    );
    const dialogo = await abrirHistorial(user, "REM-1");
    // Se pide al pulsar, no al abrir el drawer: una URL firmada caduca.
    expect(verComprobante).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Ver comprobante de entrega" }));
    expect(verComprobante).toHaveBeenCalledWith("orden-1");

    expect(
      await within(dialogo).findByText(/^Entrega confirmada por Ana Admin el /),
    ).toBeInTheDocument();
    const enlaces = within(
      within(dialogo).getByRole("list", { name: "Archivos del comprobante" }),
    ).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual([
      "https://firmada.example/a?token=1",
      "https://firmada.example/b?token=2",
    ]);
    expect(enlaces[0]).toHaveAttribute("target", "_blank");
    expect(enlaces[0]).toHaveAccessibleName("Abrir foto 1 del comprobante");
  });

  it("sin la prop no hay botón", async () => {
    const user = userEvent.setup();
    render(
      <HistorialOrdenSheet
        ordenId="orden-1"
        referencia="REM-1"
        obtenerHistorial={async () => HISTORIAL_OK}
      />,
    );
    const dialogo = await abrirHistorial(user, "REM-1");
    expect(
      within(dialogo).queryByRole("button", { name: "Ver comprobante de entrega" }),
    ).toBeNull();
  });

  it("`no_encontrado` se dice en lenguaje claro", async () => {
    const user = userEvent.setup();
    render(
      <HistorialOrdenSheet
        ordenId="orden-1"
        referencia="REM-1"
        obtenerHistorial={async () => HISTORIAL_OK}
        ofrecerComprobanteEntrega
        verComprobante={async () => ({ status: "no_encontrado" })}
      />,
    );
    const dialogo = await abrirHistorial(user, "REM-1");
    await user.click(within(dialogo).getByRole("button", { name: "Ver comprobante de entrega" }));
    expect(
      await within(dialogo).findByText(
        "Esta orden no tiene comprobante de entrega. Puede que la tienda la haya recibido con su escáner.",
      ),
    ).toBeInTheDocument();
  });

  it("si la petición falla lo dice y deja reintentar", async () => {
    const user = userEvent.setup();
    const verComprobante = vi
      .fn<() => Promise<VerComprobanteDevolucionTiendaResult>>()
      .mockRejectedValueOnce(new Error("red"))
      .mockResolvedValueOnce(OK);
    render(
      <HistorialOrdenSheet
        ordenId="orden-1"
        referencia="REM-1"
        obtenerHistorial={async () => HISTORIAL_OK}
        ofrecerComprobanteEntrega
        verComprobante={verComprobante}
      />,
    );
    const dialogo = await abrirHistorial(user, "REM-1");
    await user.click(within(dialogo).getByRole("button", { name: "Ver comprobante de entrega" }));
    expect(await within(dialogo).findByText("No se pudo cargar el comprobante.")).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Reintentar" }));
    expect(
      await within(dialogo).findByText(/^Entrega confirmada por Ana Admin el /),
    ).toBeInTheDocument();
  });
});

describe("419/R22 — OrdenesModule: solo con el permiso Y en `devuelta_a_tienda`", () => {
  function fila(ref: string, estatusValue: string): OrdenListItemDTO {
    return {
      id: `id-${ref}`,
      numGuia: 1000,
      numRemision: ref,
      estatusId: "id-estatus",
      estatusValue,
      destinatario: "Destino",
      telefonoDest: "0999999999",
      tiendaId: "tienda-uuid",
      tiendaNombre: "Tienda X",
      zonaId: "zona-1",
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

  function montar(puedeVerComprobanteEntrega: boolean) {
    const items = [fila("REM-DEV", "devuelta_a_tienda"), fila("REM-OTRA", "devolviendo_a_tienda")];
    listarOrdenesMock.mockImplementation(async (input) => {
      const { page, pageSize } = input as { page: number; pageSize: number };
      return { status: "ok", items, page, pageSize, total: items.length };
    });
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <OrdenesModule mostrarHistorial puedeVerComprobanteEntrega={puedeVerComprobanteEntrega} />
      </SWRConfig>,
    );
  }

  it("con el permiso: la `devuelta_a_tienda` ofrece el botón y llama a la action real con su id", async () => {
    const user = userEvent.setup();
    verMock.mockResolvedValue(OK);
    montar(true);
    const dialogo = await abrirHistorial(user, "REM-DEV");
    await user.click(within(dialogo).getByRole("button", { name: "Ver comprobante de entrega" }));
    expect(verMock).toHaveBeenCalledWith({ ordenId: "id-REM-DEV" });
  });

  it("con el permiso: otra orden en otro estado NO ofrece el botón", async () => {
    const user = userEvent.setup();
    montar(true);
    const dialogo = await abrirHistorial(user, "REM-OTRA");
    expect(
      within(dialogo).queryByRole("button", { name: "Ver comprobante de entrega" }),
    ).toBeNull();
  });

  it("sin el permiso: ni la `devuelta_a_tienda` ofrece el botón", async () => {
    const user = userEvent.setup();
    montar(false);
    const dialogo = await abrirHistorial(user, "REM-DEV");
    expect(
      within(dialogo).queryByRole("button", { name: "Ver comprobante de entrega" }),
    ).toBeNull();
  });
});
