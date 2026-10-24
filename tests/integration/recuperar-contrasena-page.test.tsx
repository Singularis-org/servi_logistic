// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mocks de las dependencias server-side de app/recuperar-contrasena/page.tsx.
// El page.tsx (Server Component real) se importa sin mockear: se ejercita su
// logica real de R12 (publico; redirige si hay sesion valida). El formulario se renderiza
// de verdad, sin stub; solo se mockean sus Server Actions.
//
// Historia: la pagina monto un aviso en lugar del formulario desde el 2026-09-04 (el correo
// no salia) hasta el 2026-10-22, cuando SL-32 (R38) la reactivo.
const cookieGetMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}));

const redirectMock = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const findValidByIdMock = vi.fn();
vi.mock("@/lib/repositories/SessionRepository", () => ({
  SessionRepository: vi.fn().mockImplementation(function SessionRepositoryMock(this: {
    findValidById: typeof findValidByIdMock;
  }) {
    this.findValidById = findValidByIdMock;
  }),
}));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/actions/password-reset", () => ({
  solicitarRecuperacion: vi.fn(),
  verificarCodigoRecuperacion: vi.fn(),
  restablecerContrasena: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("app/recuperar-contrasena/page.tsx — sesion activa (R12)", () => {
  it("redirige a /dashboard cuando la cookie de sesion es valida segun SessionRepository.findValidById", async () => {
    const { default: RecuperarContrasenaPage } = await import(
      "@/app/recuperar-contrasena/page"
    );
    cookieGetMock.mockReturnValue({ value: "session-abc" });
    findValidByIdMock.mockResolvedValue({
      id: "session-abc",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 1000 * 60),
      createdAt: new Date(),
    });

    await expect(RecuperarContrasenaPage()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(findValidByIdMock).toHaveBeenCalledWith("session-abc");
  });

  it("sin cookie de sesion monta el formulario de recuperacion (R38)", async () => {
    const { default: RecuperarContrasenaPage } = await import(
      "@/app/recuperar-contrasena/page"
    );
    cookieGetMock.mockReturnValue(undefined);

    const element = await RecuperarContrasenaPage();
    render(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar código" })).toBeInTheDocument();
    expect(screen.getByText("Recupera el acceso a tu cuenta de forma segura")).toBeInTheDocument();

    // Sigue sin ser un callejon sin salida: hay camino de vuelta al login.
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("con la sesion de la cookie expirada/invalida tambien monta el formulario", async () => {
    const { default: RecuperarContrasenaPage } = await import(
      "@/app/recuperar-contrasena/page"
    );
    cookieGetMock.mockReturnValue({ value: "session-expired" });
    findValidByIdMock.mockResolvedValue(null);

    const element = await RecuperarContrasenaPage();
    render(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
  });
});
