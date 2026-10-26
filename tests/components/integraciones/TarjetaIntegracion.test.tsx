// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { TarjetaIntegracion } from "@/app/(app)/configuracion/integraciones/_components/TarjetaIntegracion";
import type { VistaIntegracion } from "@/lib/interfaces/services/IIntegracionesService";

import { vista } from "./vistas";

// SL-36 (R34, R35) — la tarjeta de un servicio. Los textos esperados van escritos aquí a mano:
// compararlos contra las constantes que los pintan saldría verde aunque la tarjeta dijera otra cosa.

const ERROR_VIEJO = "Meta rechazó el token al enviar un mensaje. Vuelve a escribir el token de acceso.";
const FECHA = /\d{1,2}\/\d{1,2}\/\d{2,4}/;

function pintar(v: VistaIntegracion) {
  render(
    <TarjetaIntegracion
      vista={v}
      onConfigurar={vi.fn()}
      onProbar={vi.fn()}
      onRegenerarToken={vi.fn()}
      onDesconectar={vi.fn()}
    />,
  );
  return screen.getByRole("region");
}

afterEach(cleanup);

describe("TarjetaIntegracion (SL-36)", () => {
  it("SL-36/R34: estado, marca, error solo en error, hora de prueba y del webhook", () => {
    // En «error»: estado, marca, el texto del error y las dos horas de WhatsApp.
    let tarjeta = pintar(
      vista("whatsapp", {
        id: "i-1",
        estado: "error",
        ultimoErrorTexto: ERROR_VIEJO,
        ultimaPruebaAt: "2026-10-20T15:30:00.000Z",
        ultimoWebhookAt: "2026-10-21T09:05:00.000Z",
      }),
    );
    expect(within(tarjeta).getByRole("heading", { name: "WhatsApp Business" })).toBeInTheDocument();
    expect(within(tarjeta).getByTestId("estado-integracion")).toHaveTextContent("Error");
    expect(within(tarjeta).getByTestId("marca-integracion")).toHaveTextContent("Requerido");
    expect(within(tarjeta).getByRole("alert")).toHaveTextContent(ERROR_VIEJO);
    expect(within(tarjeta).getByTestId("ultima-prueba")).toHaveTextContent(FECHA);
    expect(within(tarjeta).getByTestId("ultimo-webhook")).toHaveTextContent(FECHA);
    cleanup();

    // «Conectada» con un texto de error viejo en la vista: el error NO se pinta.
    tarjeta = pintar(
      vista("whatsapp", {
        id: "i-1",
        estado: "conectada",
        ultimoErrorTexto: ERROR_VIEJO,
        ultimaPruebaAt: "2026-10-20T15:30:00.000Z",
        ultimoWebhookAt: null,
      }),
    );
    expect(within(tarjeta).getByTestId("estado-integracion")).toHaveTextContent("Conectada");
    expect(within(tarjeta).queryByRole("alert")).toBeNull();
    expect(within(tarjeta).queryByText(ERROR_VIEJO)).toBeNull();
    expect(within(tarjeta).getByTestId("ultimo-webhook")).toHaveTextContent("El webhook todavía no ha contactado");
    cleanup();

    // Fuera de WhatsApp no hay hora del webhook; la marca de un servicio recomendado.
    tarjeta = pintar(vista("asistente", { id: "i-2", estado: "conectada", ultimaPruebaAt: null }));
    expect(within(tarjeta).getByTestId("marca-integracion")).toHaveTextContent("Recomendado");
    expect(within(tarjeta).getByTestId("ultima-prueba")).toHaveTextContent("Todavía no se ha probado");
    expect(within(tarjeta).queryByTestId("ultimo-webhook")).toBeNull();
    cleanup();

    // «Sin configurar»: ni error ni horas, y la única acción es configurar.
    tarjeta = pintar(vista("google_maps"));
    expect(within(tarjeta).getByTestId("estado-integracion")).toHaveTextContent("Sin configurar");
    expect(within(tarjeta).getByTestId("marca-integracion")).toHaveTextContent("Requerido");
    expect(within(tarjeta).queryByTestId("ultima-prueba")).toBeNull();
    expect(within(tarjeta).getByRole("button", { name: "Configurar" })).toBeInTheDocument();
    expect(within(tarjeta).queryByRole("button", { name: "Desconectar" })).toBeNull();
  });

  it("SL-36/R35: enlace a la guía", () => {
    // Rutas del design §8, copiadas a mano.
    const guias = [
      ["whatsapp", "/ayuda/oficina/integracion-whatsapp"],
      ["google_maps", "/ayuda/oficina/integracion-google-maps"],
      ["optimizacion_rutas", "/ayuda/oficina/integracion-optimizacion-rutas"],
      ["asistente", "/ayuda/oficina/integracion-asistente"],
    ] as const;
    for (const [servicio, ruta] of guias) {
      const tarjeta = pintar(vista(servicio));
      expect(within(tarjeta).getByRole("link", { name: /Ver la guía paso a paso/ })).toHaveAttribute("href", ruta);
      cleanup();
    }
  });
});
