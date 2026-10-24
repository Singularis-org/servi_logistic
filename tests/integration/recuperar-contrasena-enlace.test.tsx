// @vitest-environment jsdom
// SL-41 (R18, R19, R21) — `/recuperar-contrasena` EN MODO ENLACE.
//
// El maestro llega desde el correo de bienvenida con el secreto en el fragmento. Se mide lo que
// ve y lo que queda en la barra de direcciones: el secreto sale de ahí al montar, el formulario es
// «Crea tu contraseña», guarda con el enlace (no con email y código), y un enlace muerto lleva al
// paso 1 del flujo normal.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecuperarContrasenaForm } from "@/app/recuperar-contrasena/_components/RecuperarContrasenaForm";
import {
  crearContrasenaConEnlace,
  restablecerContrasena,
} from "@/lib/actions/password-reset";

// Mismo patrón que `recuperar-contrasena-form.test.tsx`: se reemplazan las Server Actions.
vi.mock("@/lib/actions/password-reset", () => ({
  solicitarRecuperacion: vi.fn(),
  verificarCodigoRecuperacion: vi.fn(),
  restablecerContrasena: vi.fn(),
  crearContrasenaConEnlace: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockedCrear = vi.mocked(crearContrasenaConEnlace);
const mockedRestablecer = vi.mocked(restablecerContrasena);

const RUTA = "/recuperar-contrasena";
const ENLACE = "c0ffee00-0000-4000-8000-000000000001.SeCrEtO_de_43_caracteres-xxxxxxxxxxxxxxxxxx";
const CONTRASENA = "Abcdef1!";

function abrirCon(hash: string) {
  window.history.replaceState(null, "", `${RUTA}${hash}`);
}

async function crearContrasena(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Nueva contraseña"), CONTRASENA);
  await user.type(screen.getByLabelText("Confirmar contraseña"), CONTRASENA);
  await user.click(screen.getByRole("button", { name: "Crear contraseña" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("SL-41 (R21) — el secreto sale de la barra al montar", () => {
  it("con #enlace= borra el fragmento nada más montar y no pinta el secreto", () => {
    abrirCon(`#enlace=${ENLACE}`);

    render(<RecuperarContrasenaForm />);

    // Sin esperar a nada: antes de que el maestro pueda escribir.
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe(RUTA);
    expect(document.body.innerHTML).not.toContain("SeCrEtO");
  });

  it("con otro fragmento no toca la barra y arranca en el paso del email", () => {
    abrirCon("#otra-cosa");

    render(<RecuperarContrasenaForm />);

    expect(window.location.hash).toBe("#otra-cosa");
    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
  });
});

describe("SL-41 (R18) — crear la contraseña con el enlace", () => {
  it("el título es «Crea tu contraseña», con los dos campos del paso 3", async () => {
    abrirCon(`#enlace=${ENLACE}`);

    render(<RecuperarContrasenaForm />);

    expect(
      await screen.findByRole("heading", { name: "Crea tu contraseña" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recuperar contraseña" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Nueva contraseña" })).toBeNull();
    expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Correo electrónico")).toBeNull();
  });

  it("con ok envía el enlace (no email y código) y lleva al éxito con /login", async () => {
    const user = userEvent.setup();
    abrirCon(`#enlace=${ENLACE}`);
    mockedCrear.mockResolvedValue({ status: "ok" });
    render(<RecuperarContrasenaForm />);

    await crearContrasena(user);

    await waitFor(() =>
      expect(mockedCrear).toHaveBeenCalledWith({
        enlace: ENLACE,
        password: CONTRASENA,
        confirmPassword: CONTRASENA,
      }),
    );
    expect(mockedRestablecer).not.toHaveBeenCalled();
    // El texto sigue al flujo: con el enlace de bienvenida la contraseña se CREA, no se
    // restablece (el texto de recuperación lo fija `recuperar-contrasena-form.test.tsx`).
    expect(
      await screen.findByRole("heading", { name: "Contraseña creada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tu contraseña se creó correctamente. Ya puedes iniciar sesión con ella."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Contraseña actualizada")).toBeNull();
    expect(screen.queryByText(/restableció/)).toBeNull();
    expect(screen.getByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("con validation_error pinta el error del campo y sigue en «Crea tu contraseña»", async () => {
    const user = userEvent.setup();
    abrirCon(`#enlace=${ENLACE}`);
    mockedCrear.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { password: ["La contraseña no cumple la política"] },
    });
    render(<RecuperarContrasenaForm />);

    await crearContrasena(user);

    expect(await screen.findByText("La contraseña no cumple la política")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Crea tu contraseña" })).toBeInTheDocument();
  });
});

describe("SL-41 (R19) — el enlace que ya no sirve", () => {
  it("con invalid_or_expired muestra el genérico y «Pedir un código por correo» vuelve al paso 1", async () => {
    const user = userEvent.setup();
    abrirCon(`#enlace=${ENLACE}`);
    mockedCrear.mockResolvedValue({ status: "invalid_or_expired" });
    render(<RecuperarContrasenaForm />);

    await crearContrasena(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El enlace no es válido o ya venció.",
    );
    // Un enlace muerto no se reintenta: el formulario desaparece.
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Pedir un código por correo" }));

    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.queryByText("El enlace no es válido o ya venció.")).toBeNull();
  });

  it("con validation_error del ENLACE (mal formado) muestra el genérico y «Pedir un código por correo»", async () => {
    // El borde valida la forma con zod y devuelve `fieldErrors.enlace`. La pantalla no tiene campo
    // para el enlace: si ese error se tratara como de campo, el maestro pulsaría y no vería nada.
    const user = userEvent.setup();
    abrirCon(`#enlace=${ENLACE}`);
    mockedCrear.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { enlace: ["Enlace no válido"] },
    });
    render(<RecuperarContrasenaForm />);

    await crearContrasena(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El enlace no es válido o ya venció.",
    );
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    expect(screen.queryByText("Enlace no válido")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Pedir un código por correo" }));

    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
  });

  it("con #enlace= vacío muestra el genérico sin llamar a la action", () => {
    abrirCon("#enlace=");

    render(<RecuperarContrasenaForm />);

    expect(window.location.hash).toBe("");
    expect(screen.getByRole("alert")).toHaveTextContent("El enlace no es válido o ya venció.");
    expect(screen.getByRole("button", { name: "Pedir un código por correo" })).toBeInTheDocument();
    expect(mockedCrear).not.toHaveBeenCalled();
  });
});
