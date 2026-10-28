// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecuperarContrasenaForm } from "@/app/recuperar-contrasena/_components/RecuperarContrasenaForm";
import {
  solicitarRecuperacion,
  crearContrasenaConEnlace,
} from "@/lib/actions/password-reset";

// Mock de las Server Actions reales que consume el formulario. Nunca se toca
// lib/actions/password-reset.ts; solo se reemplaza su implementacion.
// SL-18 (R20): ya no hay `verificarCodigoRecuperacion` ni `restablecerContrasena`.
vi.mock("@/lib/actions/password-reset", () => ({
  solicitarRecuperacion: vi.fn(),
  crearContrasenaConEnlace: vi.fn(),
}));

// next/link como ancla simple (sin router de app).
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockedSolicitar = vi.mocked(solicitarRecuperacion);
const mockedCrear = vi.mocked(crearContrasenaConEnlace);

const ENLACE = "c0ffee00-0000-4000-8000-000000000001.SeCrEtO_de_43_caracteres-xxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

// SL-18: la fase de la contraseña solo se alcanza con el enlace del correo.
async function avanzarAFasePassword() {
  window.history.replaceState(null, "", `/recuperar-contrasena#enlace=${ENLACE}`);
  render(<RecuperarContrasenaForm />);
  await screen.findByLabelText("Nueva contraseña");
}

describe("RecuperarContrasenaForm — paso 1 acaba en «Revisa tu correo» (SL-18 R16, R20)", () => {
  it("SL-18 R20: tras solicitar, muestra «Revisa tu correo» con un enlace por cuenta y sin paso de código", async () => {
    const user = userEvent.setup();
    render(<RecuperarContrasenaForm />);

    mockedSolicitar.mockResolvedValue({ status: "ok" });
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    await waitFor(() =>
      expect(mockedSolicitar).toHaveBeenCalledWith({ email: "ana@example.com" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Revisa tu correo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Si el correo existe, te enviamos un enlace para cada cuenta. Revisa tu correo."),
    ).toBeInTheDocument();
    // R20: no hay paso de código ni campos que pedir.
    expect(screen.queryByLabelText("Código de verificación")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("SL-18 R20: el paso 1 no menciona ningún código", () => {
    render(<RecuperarContrasenaForm />);

    expect(screen.queryByText(/código/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar código" })).not.toBeInTheDocument();
  });

  it("bloquea el envío y no invoca la action con un correo inválido", async () => {
    const user = userEvent.setup();
    render(<RecuperarContrasenaForm />);

    await user.type(screen.getByLabelText("Correo electrónico"), "no-es-correo");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByText("Correo electrónico inválido")).toBeInTheDocument();
    expect(mockedSolicitar).not.toHaveBeenCalled();
  });

  it("validation_error del servidor deja el paso 1 con el error del campo", async () => {
    const user = userEvent.setup();
    render(<RecuperarContrasenaForm />);

    mockedSolicitar.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { email: ["Correo no aceptado"] },
    });
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByText("Correo no aceptado")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Revisa tu correo" })).not.toBeInTheDocument();
  });
});

describe("RecuperarContrasenaForm — fase contraseña con enlace (R7)", () => {
  it("bloquea el envío con confirmación distinta y no invoca la action", async () => {
    const user = userEvent.setup();
    await avanzarAFasePassword();

    await user.type(screen.getByLabelText("Nueva contraseña"), "Abcdef1!");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Distinta1!");
    await user.click(screen.getByRole("button", { name: "Crear contraseña" }));

    expect(await screen.findByText("Las contraseñas no coinciden")).toBeInTheDocument();
    expect(mockedCrear).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Feature 286 — el ojito, en la fase de contraseña
// ─────────────────────────────────────────────────────────────────────────────────────

describe("RecuperarContrasenaForm — el ojito de cada contraseña (286: R1, R9, R13, R14)", () => {
  it("R1/R14: los dos campos de la fase tienen ojito, con su propio nombre accesible", async () => {
    await avanzarAFasePassword();

    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("Confirmar contraseña")).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("button", { name: "Nueva contraseña: oculta. Mostrar." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar contraseña: oculta. Mostrar." }),
    ).toBeInTheDocument();
  });

  it("R9: revelar «Nueva contraseña» NO revela «Confirmar contraseña», ni al reves", async () => {
    const user = userEvent.setup();
    await avanzarAFasePassword();

    const nueva = screen.getByLabelText("Nueva contraseña");
    const confirmar = screen.getByLabelText("Confirmar contraseña");

    await user.click(
      screen.getByRole("button", { name: "Nueva contraseña: oculta. Mostrar." }),
    );
    expect(nueva).toHaveAttribute("type", "text");
    expect(confirmar).toHaveAttribute("type", "password");

    await user.click(
      screen.getByRole("button", { name: "Confirmar contraseña: oculta. Mostrar." }),
    );
    expect(nueva).toHaveAttribute("type", "text");
    expect(confirmar).toHaveAttribute("type", "text");

    await user.click(
      screen.getByRole("button", { name: "Nueva contraseña: visible. Ocultar." }),
    );
    expect(nueva).toHaveAttribute("type", "password");
    expect(confirmar).toHaveAttribute("type", "text");
  });

  it("R10: pulsar el ojito no restablece nada ni pierde lo tecleado", async () => {
    const user = userEvent.setup();
    await avanzarAFasePassword();

    await user.type(screen.getByLabelText("Nueva contraseña"), "Abcdef1!");
    await user.click(
      screen.getByRole("button", { name: "Nueva contraseña: oculta. Mostrar." }),
    );

    expect(mockedCrear).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nueva contraseña")).toHaveValue("Abcdef1!");
  });

  it("R13: el `ref` sigue llegando al input — al fallar la validacion, el foco va al campo", async () => {
    const user = userEvent.setup();
    await avanzarAFasePassword();

    // Contraseña que no cumple la politica: la validacion de cliente falla y el
    // formulario mueve el foco al campo por su `ref`. Si el `ref` se hubiera quedado en
    // el envoltorio, esto dejaria de enfocar el input y nadie se enteraria.
    await user.type(screen.getByLabelText("Nueva contraseña"), "corta");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "corta");
    await user.click(screen.getByRole("button", { name: "Crear contraseña" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Nueva contraseña")).toHaveFocus(),
    );
    expect(mockedCrear).not.toHaveBeenCalled();
  });
});
