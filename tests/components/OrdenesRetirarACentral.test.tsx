// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { RolValue } from "@prisma/client";

import OrdenesPage from "@/app/(app)/ordenes/page";
import { ToastProvider } from "@/providers/ToastProvider";
import { listarOrdenes } from "@/lib/actions/ordenes";
import { listarOrderStatus } from "@/lib/actions/order-status";
import {
  listarMensajerosParaAsignacion,
  retirarABodegaCentral,
} from "@/lib/actions/ordenes-guia";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import type { CatalogoFiltrosOrdenesDTO } from "@/lib/types/filtros-ordenes";

/**
 * SLT-197 (T6.2, R980) — «Retirar a bodega central» en `/ordenes`.
 *
 * Monta la PÁGINA REAL y varía el ROL del actor, no la prop `accionesLote`: el eslabón que decide
 * quién ve la acción es `rol → esAccesoTotal(rol) → accionesLote` (mismo arnés que
 * `OrdenesRutearSatelite.test.tsx`). Literales escritos a mano.
 */

vi.mock("@/lib/actions/_shared/zona-del-borde", async () => {
  const { ZONA_DE_CR } = await import("@/tests/fabricas/reglas-pais");
  return { zonaDelBorde: async () => ZONA_DE_CR };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/actions/ordenes", () => ({ listarOrdenes: vi.fn() }));
vi.mock("@/lib/actions/order-status", () => ({ listarOrderStatus: vi.fn() }));
// Módulo completo: lo importan también los otros modales por lote que la página monta.
vi.mock("@/lib/actions/ordenes-guia", () => ({
  generarGuia: vi.fn(),
  asignarDesdeBodega: vi.fn(),
  asignarRecoleccion: vi.fn(),
  desasignarRecoleccion: vi.fn(),
  listarMensajerosParaAsignacion: vi.fn(),
  rutearABodegaSatelite: vi.fn(),
  retirarABodegaCentral: vi.fn(),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: vi.fn(async () => null),
}));

vi.mock("@/lib/actions/reprogramadas-retenidas", () => ({
  resumenReprogramadasRetenidasCentral: vi.fn(async () => ({
    status: "ok" as const,
    resumen: { diaCR: "2026-01-01", total: 0, porForma: { reprogramado: 0, enReparto: 0 }, cierres: [], sinCierre: [] },
  })),
}));

vi.mock("@/lib/actions/filtros-ordenes", () => ({
  obtenerCatalogoFiltrosOrdenes: vi.fn(async () => ({
    status: "ok" as const,
    catalogo: {
      zonas: [],
      tiendas: [],
      mensajeros: [],
      provincias: [],
      cantones: [],
      distritos: [],
    } satisfies CatalogoFiltrosOrdenesDTO,
  })),
}));

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

const listarOrdenesMock = vi.mocked(listarOrdenes);
const listarOrderStatusMock = vi.mocked(listarOrderStatus);
const listarMensajerosMock = vi.mocked(listarMensajerosParaAsignacion);
const retirarMock = vi.mocked(retirarABodegaCentral);
const resolveActorMock = vi.mocked(resolveActorFromSession);

const ACCION = "Retirar a bodega central";

const CATALOGO = [
  { id: "id-sat", value: "en_bodega_satelite" },
  { id: "id-bc", value: "en_bodega_central" },
  { id: "id-rbc", value: "en_ruta_bodega_central" },
];

function makeOrden(
  overrides: Partial<OrdenListItemDTO> & { id: string; numRemision: string },
): OrdenListItemDTO {
  return {
    numGuia: 1000,
    estatusId: "id-sat",
    estatusValue: "en_bodega_satelite",
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: "tienda-uuid",
    tiendaNombre: "Tienda X",
    zonaId: "zona-satelite-1",
    zonaEsGam: false,
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function renderPageComo(rol: RolValue, items: OrdenListItemDTO[]) {
  resolveActorMock.mockResolvedValue({ usuarioId: "u-1", rol });
  listarOrderStatusMock.mockResolvedValue({ status: "ok", estatus: CATALOGO });
  listarOrdenesMock.mockImplementation(async (input) => {
    const { page, pageSize } = input as { page: number; pageSize: number };
    return { status: "ok", items, page, pageSize, total: items.length };
  });

  render(
    <ToastProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        {await OrdenesPage()}
      </SWRConfig>
    </ToastProvider>,
  );
}

async function marcar(user: ReturnType<typeof userEvent.setup>, ref: string) {
  await user.click(await screen.findByRole("checkbox", { name: `Seleccionar orden ${ref}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listarMensajerosMock.mockResolvedValue({
    status: "ok",
    mensajeros: [{ id: "m1", nombre: "Juan" }],
    bloqueadosIds: [],
  });
});

afterEach(() => {
  cleanup();
});

describe("/ordenes — «Retirar a bodega central» (SLT-197, R980)", () => {
  it.each([RolValue.maestro, RolValue.admin])(
    "R980: el %s la ve al seleccionar una orden en bodega satélite",
    async (rol) => {
      const user = userEvent.setup();
      await renderPageComo(rol, [makeOrden({ id: "o1", numRemision: "REM-SAT-1" })]);

      await marcar(user, "REM-SAT-1");

      expect(await screen.findByRole("button", { name: ACCION })).toBeInTheDocument();
    },
  );

  it("R980: sin acceso total (adminTienda) no hay selección por lote ni acción sobre la MISMA orden", async () => {
    await renderPageComo(RolValue.adminTienda, [
      makeOrden({ id: "o1", numRemision: "REM-SAT-1" }),
    ]);

    // Ancla: la fila ya está pintada; la ausencia se afirma sobre la vista final.
    const tabla = await screen.findByRole("table");
    expect(await within(tabla).findByText("REM-SAT-1")).toBeInTheDocument();
    expect(within(tabla).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: ACCION })).toBeNull();
  });

  it("R980: en bodega central NO se ofrece (ancla: su acción hermana «Rutear a bodega satélite» sí)", async () => {
    const user = userEvent.setup();
    await renderPageComo(RolValue.maestro, [
      makeOrden({
        id: "o1",
        numRemision: "REM-BC-1",
        estatusId: "id-bc",
        estatusValue: "en_bodega_central",
      }),
    ]);

    await marcar(user, "REM-BC-1");

    expect(
      await screen.findByRole("button", { name: "Rutear a bodega satélite" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ACCION })).toBeNull();
  });

  it("R980: en ruta a bodega central NO se ofrece: su fila no tiene casilla aunque haya una del estante", async () => {
    const user = userEvent.setup();
    await renderPageComo(RolValue.maestro, [
      makeOrden({ id: "o1", numRemision: "REM-SAT-1" }),
      makeOrden({
        id: "o2",
        numRemision: "REM-RBC-1",
        estatusId: "id-rbc",
        estatusValue: "en_ruta_bodega_central",
      }),
    ]);

    // Ancla: con la del estante marcada, la acción está. La columna de casillas se monta
    // porque esa fila tiene acción.
    await marcar(user, "REM-SAT-1");
    expect(await screen.findByRole("button", { name: ACCION })).toBeInTheDocument();
    await marcar(user, "REM-SAT-1");
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: ACCION })).toBeNull(),
    );

    // La de `en_ruta_bodega_central` no tiene acciones de lote: su fila está pintada pero sin
    // casilla, así que no hay forma de llevarla a «Retirar a bodega central».
    expect(screen.getByText("REM-RBC-1")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Seleccionar orden REM-RBC-1" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: ACCION })).toBeNull();
  });

  it("R980/R985: al confirmar, la action recibe en UNA llamada las del estante de dos satélites", async () => {
    const user = userEvent.setup();
    retirarMock.mockResolvedValue({
      status: "ok",
      resultados: [
        { ordenId: "o1", estado: "en_ruta_bodega_central" },
        { ordenId: "o2", estado: "en_ruta_bodega_central" },
      ],
    });
    await renderPageComo(RolValue.maestro, [
      makeOrden({ id: "o1", numRemision: "REM-SAT-1", zonaId: "zona-satelite-1" }),
      makeOrden({ id: "o2", numRemision: "REM-SAT-2", zonaId: "zona-satelite-2" }),
    ]);

    await marcar(user, "REM-SAT-1");
    await marcar(user, "REM-SAT-2");
    await user.click(await screen.findByRole("button", { name: ACCION }));

    // El disparador de la barra y el confirmar del modal comparten etiqueta: se acota al diálogo.
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Se retirarán 2 orden(es)");
    await user.click(within(dialogo).getByRole("button", { name: ACCION }));

    await vi.waitFor(() =>
      expect(retirarMock).toHaveBeenCalledWith({ ordenIds: ["o1", "o2"] }),
    );
    expect(retirarMock).toHaveBeenCalledTimes(1);
  });
});
