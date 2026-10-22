// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { OrdenesListado } from "@/app/(app)/ordenes/_components/OrdenesListado";
import { ToastProvider } from "@/providers/ToastProvider";
import { listarOrdenes } from "@/lib/actions/ordenes";
import { listarOrderStatus } from "@/lib/actions/order-status";
import { listarMensajerosParaAsignacion } from "@/lib/actions/ordenes-guia";
import type { OrdenListItemDTO } from "@/lib/types/orden";

// FICHA 419 (F1) — la acción por lote «Confirmar entrega a la tienda» en `/ordenes`.
//   - R17: con `accionesLote` (maestro/admin), una orden `devolviendo_a_tienda` es seleccionable
//     y ofrece la acción; si la selección MEZCLA estados, la acción lleva el conteo y el modal
//     recibe SOLO las órdenes `devolviendo_a_tienda`.
//   - R21: sin `accionesLote` (adminTienda; adminSatelite y mensajero ni llegan a la página) la
//     acción no existe.
// El modal se sustituye por un doble que expone qué órdenes recibió: aquí se prueba la barra, no
// el modal (que tiene su propio archivo).
vi.mock("@/lib/actions/ordenes", () => ({ listarOrdenes: vi.fn() }));
vi.mock("@/lib/actions/order-status", () => ({ listarOrderStatus: vi.fn() }));
vi.mock("@/lib/actions/ordenes-guia", () => ({
  listarMensajerosParaAsignacion: vi.fn(),
}));
vi.mock("@/app/(app)/ordenes/_components/GenerarGuiaModal", () => ({
  GenerarGuiaModal: () => null,
}));
vi.mock("@/app/(app)/ordenes/_components/AsignarBodegaModal", () => ({
  AsignarBodegaModal: () => null,
}));
vi.mock("@/app/(app)/ordenes/_components/EtiquetasGuiaModal", () => ({
  EtiquetasGuiaModal: () => null,
}));
vi.mock("@/app/(app)/ordenes/_components/RecuperarABodegaModal", () => ({
  RecuperarABodegaModal: () => null,
}));
vi.mock("@/app/(app)/ordenes/_components/DevolverATiendaModal", () => ({
  DevolverATiendaModal: () => null,
}));
vi.mock("@/app/(app)/ordenes/_components/ConfirmarEntregaTiendaModal", () => ({
  CONFIRMAR_ENTREGA_TIENDA_ACCION: "Confirmar entrega a la tienda",
  ConfirmarEntregaTiendaModal: ({
    open,
    ordenes,
  }: {
    open: boolean;
    ordenes: { numRemision: string }[];
  }) =>
    open ? (
      <div role="dialog" aria-label="doble confirmar entrega">
        {ordenes.map((o) => o.numRemision).join(",")}
      </div>
    ) : null,
}));

const listarOrdenesMock = vi.mocked(listarOrdenes);
const listarOrderStatusMock = vi.mocked(listarOrderStatus);
const listarMensajerosMock = vi.mocked(listarMensajerosParaAsignacion);

function makeOrden(ref: string, estatusValue: string): OrdenListItemDTO {
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

const CATALOGO = [
  { id: "id-dat", value: "devolviendo_a_tienda" },
  { id: "id-pdt", value: "por_devolver_a_tienda" },
];

function renderListado(items: OrdenListItemDTO[], accionesLote: boolean) {
  listarOrderStatusMock.mockResolvedValue({ status: "ok", estatus: CATALOGO });
  listarOrdenesMock.mockImplementation(async (input) => {
    const { page, pageSize } = input as { page: number; pageSize: number };
    return { status: "ok", items, page, pageSize, total: items.length };
  });
  render(
    <ToastProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <OrdenesListado accionesLote={accionesLote} />
      </SWRConfig>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarMensajerosMock.mockResolvedValue({
    status: "ok",
    mensajeros: [{ id: "m1", nombre: "Juan" }],
    bloqueadosIds: [],
  });
});
afterEach(cleanup);

describe("419/R17 — maestro/admin: la acción por lote existe", () => {
  it("una orden `devolviendo_a_tienda` se selecciona y ofrece «Confirmar entrega a la tienda»", async () => {
    const user = userEvent.setup();
    renderListado([makeOrden("REM-DAT-1", "devolviendo_a_tienda")], true);

    await user.click(
      await screen.findByRole("checkbox", { name: "Seleccionar orden REM-DAT-1" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirmar entrega a la tienda" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "doble confirmar entrega" }),
    ).toHaveTextContent("REM-DAT-1");
  });

  it("selección MIXTA: la acción lleva el conteo y el modal recibe SOLO las `devolviendo_a_tienda`", async () => {
    const user = userEvent.setup();
    renderListado(
      [
        makeOrden("REM-DAT-1", "devolviendo_a_tienda"),
        makeOrden("REM-DAT-2", "devolviendo_a_tienda"),
        makeOrden("REM-PDT-1", "por_devolver_a_tienda"),
      ],
      true,
    );

    for (const ref of ["REM-DAT-1", "REM-DAT-2", "REM-PDT-1"]) {
      await user.click(
        await screen.findByRole("checkbox", { name: `Seleccionar orden ${ref}` }),
      );
    }
    // La de la otra acción también lleva su conteo: cada una aplica a una parte.
    expect(
      await screen.findByRole("button", { name: "Enviar a la tienda (1)" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar entrega a la tienda (2)" }));

    const dialogo = await screen.findByRole("dialog", { name: "doble confirmar entrega" });
    expect(dialogo).toHaveTextContent("REM-DAT-1,REM-DAT-2");
    expect(within(dialogo).queryByText(/REM-PDT-1/)).toBeNull();
  });
});

describe("419/R21 — sin acciones por lote (adminTienda) la acción no existe", () => {
  it("la orden `devolviendo_a_tienda` se lista sin casilla y sin la acción", async () => {
    renderListado([makeOrden("REM-DAT-1", "devolviendo_a_tienda")], false);

    const tabla = await screen.findByRole("table");
    expect(within(tabla).getByText("REM-DAT-1")).toBeInTheDocument();
    expect(within(tabla).queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Confirmar entrega a la tienda/ }),
    ).toBeNull();
  });
});
