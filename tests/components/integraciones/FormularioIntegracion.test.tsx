// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FormularioIntegracion,
  type RespuestaFormularioIntegracion,
} from "@/app/(app)/configuracion/integraciones/_components/FormularioIntegracion";

// SL-36 (R35, R36) — el formulario de alta y edición. Las etiquetas se buscan con `selector: "input"`
// porque el botón del ojo de cada contraseña también se nombra con la etiqueta del campo.

const campo = (etiqueta: string) => screen.getByLabelText(new RegExp(`^${etiqueta}`), { selector: "input" });

afterEach(cleanup);

describe("FormularioIntegracion (SL-36)", () => {
  it("SL-36/R36: secretos password sin valor; tras rechazo solo lo no secreto", async () => {
    const user = userEvent.setup();
    const onEnviar = vi.fn(
      async (): Promise<RespuestaFormularioIntegracion> => ({ ok: false, mensaje: "WhatsApp rechazó la credencial." }),
    );
    render(<FormularioIntegracion servicio="whatsapp" modo="alta" onEnviar={onEnviar} onCancelar={vi.fn()} />);

    // Los dos secretos de WhatsApp: contraseña y vacíos desde el primer render.
    for (const etiqueta of ["Token de acceso", "App Secret"]) {
      expect(campo(etiqueta)).toHaveAttribute("type", "password");
      expect(campo(etiqueta)).toHaveValue("");
    }
    // Lo no secreto es texto normal.
    expect(campo("Phone Number ID")).toHaveAttribute("type", "text");

    await user.type(campo("Nombre visible"), "Mensajería Central");
    await user.type(campo("Phone Number ID"), "109876543210");
    await user.type(campo("WABA ID"), "200000000001");
    await user.type(campo("Token de acceso"), "EAAG-secreto-de-prueba");
    await user.type(campo("App Secret"), "app-secret-de-prueba");
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));

    // El envío sí llevó los secretos...
    expect(onEnviar).toHaveBeenCalledWith({
      nombreVisible: "Mensajería Central",
      numeroId: "109876543210",
      wabaId: "200000000001",
      token_acceso: "EAAG-secreto-de-prueba",
      app_secret: "app-secret-de-prueba",
    });
    // ...y tras el rechazo el formulario conserva solo lo no secreto.
    expect(await screen.findByRole("alert")).toHaveTextContent("WhatsApp rechazó la credencial.");
    await waitFor(() => expect(campo("Token de acceso")).toHaveValue(""));
    expect(campo("App Secret")).toHaveValue("");
    expect(campo("Token de acceso")).toHaveAttribute("type", "password");
    expect(campo("Nombre visible")).toHaveValue("Mensajería Central");
    expect(campo("Phone Number ID")).toHaveValue("109876543210");
    expect(campo("WABA ID")).toHaveValue("200000000001");
    expect(document.body.innerHTML).not.toContain("EAAG-secreto-de-prueba");
  });

  it("SL-36/R36: el JSON de la cuenta de servicio también es una contraseña sin valor", () => {
    render(<FormularioIntegracion servicio="optimizacion_rutas" modo="alta" onEnviar={vi.fn()} onCancelar={vi.fn()} />);
    const json = campo("JSON de la clave de la cuenta de servicio");
    expect(json).toHaveAttribute("type", "password");
    expect(json).toHaveValue("");
  });

  it("SL-36/R14, R36: en edición precarga lo no secreto, deja los secretos vacíos y no manda el secreto vacío", async () => {
    const user = userEvent.setup();
    const onEnviar = vi.fn(async (): Promise<RespuestaFormularioIntegracion> => ({ ok: true }));
    render(
      <FormularioIntegracion
        servicio="whatsapp"
        modo="edicion"
        valoresIniciales={{ nombreVisible: "Central", numeroId: "111", wabaId: "222", telefonoVisible: "+00 0000" }}
        onEnviar={onEnviar}
        onCancelar={vi.fn()}
      />,
    );
    expect(campo("Phone Number ID")).toHaveValue("111");
    expect(campo("Token de acceso")).toHaveValue("");
    expect(campo("App Secret")).toHaveValue("");

    await user.type(campo("App Secret"), "nuevo-app-secret");
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));
    expect(onEnviar).toHaveBeenCalledWith({
      nombreVisible: "Central",
      numeroId: "111",
      wabaId: "222",
      app_secret: "nuevo-app-secret",
    });
  });

  it("SL-36/R35: el formulario enlaza la guía de su servicio", () => {
    render(<FormularioIntegracion servicio="google_maps" modo="alta" onEnviar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Ver la guía paso a paso/ })).toHaveAttribute(
      "href",
      "/ayuda/oficina/integracion-google-maps",
    );
  });

  it("muestra los errores por campo de invalid_input junto al campo", async () => {
    const user = userEvent.setup();
    render(
      <FormularioIntegracion
        servicio="asistente"
        modo="alta"
        onEnviar={async () => ({ ok: false, mensaje: "Revisa los campos marcados.", fieldErrors: { clave_api: ["Escribe la clave."] } })}
        onCancelar={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));
    expect(await screen.findByText("Escribe la clave.")).toBeInTheDocument();
    expect(campo("Clave de API")).toHaveAttribute("aria-invalid", "true");
  });
});
