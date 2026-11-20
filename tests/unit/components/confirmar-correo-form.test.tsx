// @vitest-environment jsdom
// SLT-221 «Maestro: corregir correo y cédula de un usuario» (design §4.3, §7; R1622-R1624, R1626):
// la página pública `/recuperar-contrasena/confirmar-correo`. Se mide lo que ve la persona según lo
// que responde la acción, y que abrir la página no llama a nada.
//
// Los textos van escritos a mano, no leídos de `TEXTOS_CONFIRMAR_CORREO`: son el contrato de R1623 y
// R1624, y compararlos contra su propia fuente saldría verde aunque el texto cambiara.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmarCorreoForm } from "@/app/recuperar-contrasena/confirmar-correo/_components/ConfirmarCorreoForm";
import { confirmarCambioCorreo } from "@/lib/actions/confirmar-correo";

vi.mock("@/lib/actions/confirmar-correo", () => ({
  confirmarCambioCorreo: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockedConfirmar = vi.mocked(confirmarCambioCorreo);

const RUTA = "/recuperar-contrasena/confirmar-correo";
const ENLACE = "c0ffee00-0000-4000-8000-000000000221.SeCrEtO_de_43_caracteres-xxxxxxxxxxxxxxxxxx";

const R1623 = "El enlace no es válido o ya venció. Pide a tu administrador que te envíe otro.";
const R1624 = "Ese correo ya lo usa otra cuenta de tu empresa. Habla con tu administrador.";

function abrirCon(hash: string) {
  window.history.replaceState(null, "", `${RUTA}${hash}`);
}

async function pulsarConfirmar() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Confirmar correo" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("SLT-221 R1626 — abrir la página no cambia nada", () => {
  it("al montar con enlace no llama a la acción y saca el secreto de la barra", () => {
    abrirCon(`#enlace=${ENLACE}`);

    render(<ConfirmarCorreoForm />);

    expect(mockedConfirmar).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Confirma tu correo" })).toBeInTheDocument();
    // El correo aún no ha cambiado: la página dice que se PIDIÓ (review PR 3, m3).
    expect(
      screen.getByText(
        "Tu administrador pidió cambiar el correo de tu cuenta. Confírmalo para empezar a entrar con el correo nuevo.",
      ),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(document.body.innerHTML).not.toContain("SeCrEtO");
  });
});

describe("SLT-221 R1622 — confirmar con un enlace válido", () => {
  it("manda el enlace del fragmento y muestra «Correo confirmado»", async () => {
    mockedConfirmar.mockResolvedValue({ status: "ok" } as Awaited<ReturnType<typeof confirmarCambioCorreo>>);
    abrirCon(`#enlace=${ENLACE}`);
    render(<ConfirmarCorreoForm />);

    await pulsarConfirmar();

    expect(mockedConfirmar).toHaveBeenCalledTimes(1);
    expect(mockedConfirmar).toHaveBeenCalledWith({ enlace: ENLACE });
    expect(await screen.findByRole("heading", { name: "Correo confirmado" })).toBeInTheDocument();
  });
});

describe("SLT-221 R1624 — el correo nuevo ya lo usa otra cuenta", () => {
  it("con `correo_en_uso` muestra el texto de R1624, no el genérico", async () => {
    mockedConfirmar.mockResolvedValue({ status: "correo_en_uso" } as Awaited<
      ReturnType<typeof confirmarCambioCorreo>
    >);
    abrirCon(`#enlace=${ENLACE}`);
    render(<ConfirmarCorreoForm />);

    await pulsarConfirmar();

    expect(await screen.findByRole("alert")).toHaveTextContent(R1624);
    expect(screen.queryByText(R1623)).toBeNull();
  });
});

describe("SLT-221 R1623 — enlace no válido: un solo mensaje genérico", () => {
  it.each(["invalid_or_expired", "validation_error"] as const)(
    "con `%s` muestra el texto de R1623",
    async (status) => {
      mockedConfirmar.mockResolvedValue({ status } as Awaited<ReturnType<typeof confirmarCambioCorreo>>);
      abrirCon(`#enlace=${ENLACE}`);
      render(<ConfirmarCorreoForm />);

      await pulsarConfirmar();

      expect(await screen.findByRole("alert")).toHaveTextContent(R1623);
      expect(screen.queryByText(R1624)).toBeNull();
    },
  );

  it("sin `#enlace=` en la URL muestra el texto de R1623 sin llamar a la acción", async () => {
    abrirCon("");
    render(<ConfirmarCorreoForm />);

    await pulsarConfirmar();

    expect(await screen.findByRole("alert")).toHaveTextContent(R1623);
    expect(mockedConfirmar).not.toHaveBeenCalled();
  });
});
