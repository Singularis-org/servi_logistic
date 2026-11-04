// @vitest-environment jsdom
// SL-24 (R36): crear o activar una API key con el tope del plan lleno muestra el mensaje del
// servidor tal cual en el aviso, en vez del genérico.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

import { ToastProvider } from "@/providers/ToastProvider";
import type { ApiKeyListItemDTO } from "@/lib/types/api-key";

const listarApiKeysMock = vi.fn();
const generarApiKeyMock = vi.fn();
const activarApiKeyMock = vi.fn();
const desactivarApiKeyMock = vi.fn();
vi.mock("@/lib/actions/api-keys", () => ({
  listarApiKeys: (...a: unknown[]) => listarApiKeysMock(...a),
  generarApiKey: (...a: unknown[]) => generarApiKeyMock(...a),
  rotarApiKey: vi.fn(),
  activarApiKey: (...a: unknown[]) => activarApiKeyMock(...a),
  desactivarApiKey: (...a: unknown[]) => desactivarApiKeyMock(...a),
}));

const obtenerWebhookMock = vi.fn();
vi.mock("@/lib/actions/webhooks", () => ({
  obtenerWebhook: (...a: unknown[]) => obtenerWebhookMock(...a),
  registrarWebhook: vi.fn(),
  desactivarWebhook: vi.fn(),
  rotarSecretoWebhook: vi.fn(),
}));

const listarAdminTiendasMock = vi.fn();
vi.mock("@/lib/actions/usuarios-por-rol", () => ({
  listarAdminTiendas: (...a: unknown[]) => listarAdminTiendasMock(...a),
  listarUsuariosPorRol: vi.fn(),
}));

import { ApiKeysModule } from "@/app/(app)/configuracion/api/_components/ApiKeysModule";
import { ApiKeyAccionCell } from "@/app/(app)/configuracion/api/_components/ApiKeyAccionCell";

const MENSAJE =
  "Tu plan permite 2 API keys activas. Ya tienes 2. Desactiva o elimina alguna, o pide un cambio de plan.";

const ITEM: ApiKeyListItemDTO = {
  id: "11111111-1111-1111-1111-111111111111",
  identificador: "integracion-erp",
  keyPrefix: "svl_ab12cd3",
  estado: "activa",
  usuarioId: "u1",
  usuarioEmail: "apikey+integracion-erp@apikey.invalid",
  tiendaDestinoId: null,
  tiendaDestinoNombre: null,
  eliminable: false,
  motivoNoEliminable: "activa",
  createdAt: new Date("2026-01-01T12:00:00Z"),
};

const ITEM_INACTIVA: ApiKeyListItemDTO = {
  ...ITEM,
  estado: "inactiva",
  eliminable: true,
  motivoNoEliminable: null,
};

function renderConProveedores(ui: ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarApiKeysMock.mockResolvedValue({
    status: "ok",
    items: [ITEM],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  obtenerWebhookMock.mockResolvedValue({ status: "ok", webhook: null });
  listarAdminTiendasMock.mockResolvedValue({ status: "ok", usuarios: [] });
});

afterEach(() => {
  cleanup();
});

describe("API keys — tope del plan (SL-24)", () => {
  it("R36: crear con tope_plan muestra el mensaje del servidor y el modal sigue abierto", async () => {
    generarApiKeyMock.mockResolvedValue({ status: "tope_plan", mensaje: MENSAJE });
    const user = userEvent.setup();
    renderConProveedores(
      <ApiKeysModule initialData={{ items: [ITEM], total: 1, pageSize: 25 }} />,
    );

    await user.click(screen.getByRole("button", { name: "Generar API key" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Identificador"), "nueva-integracion");
    await user.click(within(dialog).getByRole("button", { name: "Generar" }));

    expect((await screen.findAllByText(MENSAJE)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Revisa los datos e inténtalo de nuevo.")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByLabelText("Clave de API generada")).toBeNull();
  });

  it("R36: activar con tope_plan muestra el mensaje del servidor y no refresca", async () => {
    activarApiKeyMock.mockResolvedValue({ status: "tope_plan", mensaje: MENSAJE });
    const onMutated = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderConProveedores(
      <ApiKeyAccionCell row={ITEM_INACTIVA} onMutated={onMutated} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Activar la API key integracion-erp" }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Sí, activar",
      }),
    );

    expect((await screen.findAllByText(MENSAJE)).length).toBeGreaterThan(0);
    expect(activarApiKeyMock).toHaveBeenCalledWith({ id: ITEM_INACTIVA.id });
    expect(onMutated).not.toHaveBeenCalled();
  });
});
