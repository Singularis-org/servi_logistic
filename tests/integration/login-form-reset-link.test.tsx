// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginForm } from "@/app/login/_components/LoginForm";

// Historia: enlace retirado el 2026-09-04 (el correo no salía) y repuesto el 2026-10-22 por
// SL-32 (R38). Este archivo exige el enlace (R18 de la feature 20).

// Las Server Actions no se ejercitan en este test; se mockean para aislar el render.
vi.mock("@/lib/actions/auth", () => ({
  login: vi.fn(),
  verifyChallenge: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("LoginForm — enlace de recuperación (R38 de SL-32)", () => {
  it("muestra un enlace hacia la ruta de reset en la fase de credenciales", () => {
    render(<LoginForm redirectParam={null} />);

    const link = screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" });
    expect(link).toHaveAttribute("href", "/recuperar-contrasena");
  });

  it("conserva el enlace de postulación pública", () => {
    render(<LoginForm redirectParam={null} />);

    // El otro enlace del bloque: reponer el de recuperación no puede llevarse por delante el de
    // postulación (feature 21, única vía de auto-registro).
    const postulacion = screen.getByRole("link", {
      name: "¿Quieres ser mensajero? Postúlate aquí",
    });
    expect(postulacion).toHaveAttribute("href", "/postulacion");
  });

  it("el enlace no estrena una región viva en la pantalla de credenciales", () => {
    render(<LoginForm redirectParam={null} />);

    // La suite de LoginForm usa `findByRole("alert")` en singular para los errores: una región
    // viva en el render inicial la volvería ambigua.
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});
