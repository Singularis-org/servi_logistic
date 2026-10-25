// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import { IntegracionesModule } from "@/app/(app)/configuracion/integraciones/_components/IntegracionesModule";
import type { VistaIntegracion } from "@/lib/interfaces/services/IIntegracionesService";

import { vista } from "./vistas";

// SL-36 (R18) — el token del webhook se ve UNA vez. Vive solo en el estado del módulo: sobrevive al
// re-render del alta (las props nuevas que manda el servidor tras revalidar), desaparece al cerrar
// el diálogo y no vuelve al remontar, que es lo que pasa al recargar la página.

const acciones = vi.hoisted(() => ({
  altaIntegracion: vi.fn(),
  editarIntegracion: vi.fn(),
  probarIntegracion: vi.fn(),
  regenerarTokenIntegracion: vi.fn(),
  desconectarIntegracion: vi.fn(),
}));
vi.mock("@/lib/actions/integraciones", () => acciones);

const TOKEN = "tok_8c1f0e9a7b6d5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c";
const TOKEN_NUEVO = "tok_regenerado_0f1e2d3c4b5a69788796a5b4c3d2e1f0";
const URL_WEBHOOK = "https://app.ejemplo.test/api/webhooks/whatsapp";

const sinConfigurar = (): VistaIntegracion[] => [
  vista("whatsapp"),
  vista("google_maps"),
  vista("optimizacion_rutas"),
  vista("asistente"),
];
const conWhatsapp = (): VistaIntegracion[] => [
  vista("whatsapp", {
    id: "int-wa",
    estado: "conectada",
    datosPublicos: { nombreVisible: "Central", numeroId: "111", wabaId: "222", telefonoVisible: "+00 0000", nombreVerificado: "" },
    ultimaPruebaAt: "2026-10-25T10:00:00.000Z",
  }),
  vista("google_maps"),
  vista("optimizacion_rutas"),
  vista("asistente"),
];

function pintar(servicios: VistaIntegracion[]) {
  return render(
    <ToastProvider>
      <IntegracionesModule servicios={servicios} />
    </ToastProvider>,
  );
}

const tarjetaWhatsapp = () => screen.getByRole("region", { name: "WhatsApp Business" });
const campo = (etiqueta: string) => screen.getByLabelText(new RegExp(`^${etiqueta}`), { selector: "input" });

async function cerrarRevelado(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox", { name: /Ya pegué el token/ }));
  await user.click(screen.getByRole("button", { name: "Cerrar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("IntegracionesModule (SL-36)", () => {
  it("SL-36/R18: el token del alta se muestra una vez y desaparece al cerrar o al remontar", async () => {
    const user = userEvent.setup();
    acciones.altaIntegracion.mockResolvedValue({
      status: "creada",
      vista: conWhatsapp()[0],
      verificacion: { token: TOKEN, urlWebhook: URL_WEBHOOK },
    });
    const { rerender, unmount } = pintar(sinConfigurar());

    await user.click(within(tarjetaWhatsapp()).getByRole("button", { name: "Configurar" }));
    await user.type(campo("Nombre visible"), "Central");
    await user.type(campo("Phone Number ID"), "111");
    await user.type(campo("WABA ID"), "222");
    await user.type(campo("Token de acceso"), "EAAG-x");
    await user.type(campo("App Secret"), "app-x");
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));

    expect(acciones.altaIntegracion).toHaveBeenCalledWith({
      servicio: "whatsapp",
      campos: { nombreVisible: "Central", numeroId: "111", wabaId: "222", token_acceso: "EAAG-x", app_secret: "app-x" },
    });
    expect(await screen.findByDisplayValue(TOKEN)).toBeInTheDocument();
    expect(screen.getByDisplayValue(URL_WEBHOOK)).toBeInTheDocument();

    // El alta revalida: el servidor manda las vistas nuevas y el token sigue en pantalla.
    rerender(
      <ToastProvider>
        <IntegracionesModule servicios={conWhatsapp()} />
      </ToastProvider>,
    );
    expect(screen.getByDisplayValue(TOKEN)).toBeInTheDocument();

    // Al cerrar ya no existe en ningún sitio del documento.
    await cerrarRevelado(user);
    await waitFor(() => expect(screen.queryByDisplayValue(TOKEN)).toBeNull());
    expect(document.body.innerHTML).not.toContain(TOKEN);

    // Remontar (recargar) con las mismas vistas no lo trae de vuelta: no viaja en las props.
    unmount();
    pintar(conWhatsapp());
    expect(screen.queryByDisplayValue(TOKEN)).toBeNull();
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it("SL-36/R18: remontar sin cerrar el diálogo tampoco conserva el token", async () => {
    const user = userEvent.setup();
    acciones.regenerarTokenIntegracion.mockResolvedValue({ status: "regenerado", token: TOKEN_NUEVO, urlWebhook: URL_WEBHOOK });
    const { unmount } = pintar(conWhatsapp());

    await user.click(within(tarjetaWhatsapp()).getByRole("button", { name: "Regenerar token del webhook" }));
    await user.click(await screen.findByRole("button", { name: "Regenerar" }));

    expect(acciones.regenerarTokenIntegracion).toHaveBeenCalledWith({ id: "int-wa" });
    expect(await screen.findByDisplayValue(TOKEN_NUEVO)).toBeInTheDocument();

    unmount();
    pintar(conWhatsapp());
    expect(screen.queryByDisplayValue(TOKEN_NUEVO)).toBeNull();
    expect(document.body.innerHTML).not.toContain(TOKEN_NUEVO);
  });

  it("SL-36/R13, R36: un alta rechazada muestra el texto de la prueba y no revela ningún token", async () => {
    const user = userEvent.setup();
    acciones.altaIntegracion.mockResolvedValue({
      status: "prueba_fallida",
      codigo: "prueba_fallida.asistente.credencial_rechazada",
      texto: "Anthropic rechazó la credencial.",
    });
    pintar(sinConfigurar());
    const tarjeta = screen.getByRole("region", { name: "Asistente IA" });
    await user.click(within(tarjeta).getByRole("button", { name: "Configurar" }));
    await user.type(campo("Clave de API"), "sk-mala");
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));

    expect(await within(tarjeta).findByText("Anthropic rechazó la credencial.")).toBeInTheDocument();
    expect(campo("Clave de API")).toHaveValue("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("SL-36/R31, R32: desconectar pide confirmación y solo entonces llama a la action", async () => {
    const user = userEvent.setup();
    acciones.desconectarIntegracion.mockResolvedValue({ status: "desconectada", servicio: "whatsapp" });
    pintar(conWhatsapp());

    await user.click(within(tarjetaWhatsapp()).getByRole("button", { name: "Desconectar" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Desconectar WhatsApp Business?" });
    expect(acciones.desconectarIntegracion).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(acciones.desconectarIntegracion).toHaveBeenCalledWith({ id: "int-wa" }));
  });
});
