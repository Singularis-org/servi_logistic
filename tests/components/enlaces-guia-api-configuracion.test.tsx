// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

// SLT-80 «Guía de integración por API en la ayuda» — R1313 y R1314: la guía y su PDF desde la
// cabecera de `/configuracion/api` y `/configuracion/integraciones`, solo en la rama del maestro.
//
// ⚠️ LOS HREF SON LITERALES DEL SPEC, no `lib/ayuda/guia-api.ts`: el literal ES el contrato.
//
// Patrón de `ConfiguracionApiPage.test.tsx`: page real (Server Component), sesión y lecturas
// mockeadas, módulo cliente stubeado.

vi.mock("@/lib/modulos/exigir-modulo", async () =>
  (await import("@/tests/fabricas/modulos")).puertasAbiertas());

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

const resolveActorMock = vi.fn();
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: () => resolveActorMock(),
}));

vi.mock("@/lib/actions/api-keys", () => ({
  listarApiKeys: async () => ({ status: "ok", items: [], page: 1, pageSize: 25, total: 0 }),
}));
vi.mock("@/app/(app)/configuracion/api/_components/ApiKeysModule", () => ({
  ApiKeysModule: () => <div data-testid="api-keys-module-stub" />,
}));

vi.mock("@/lib/actions/integraciones", () => ({
  listarIntegraciones: async () => ({ status: "ok", servicios: [] }),
}));
vi.mock("@/app/(app)/configuracion/integraciones/_components/IntegracionesModule", () => ({
  IntegracionesModule: () => <div data-testid="integraciones-module-stub" />,
}));

const PANTALLAS = [
  {
    ruta: "/configuracion/api",
    modulo: "api-keys-module-stub",
    pagina: async () => (await import("@/app/(app)/configuracion/api/page")).default,
  },
  {
    ruta: "/configuracion/integraciones",
    modulo: "integraciones-module-stub",
    pagina: async () => (await import("@/app/(app)/configuracion/integraciones/page")).default,
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("R1313/R1314 — el maestro tiene la guía y su PDF en la cabecera", () => {
  it.each(PANTALLAS)("⭑ $ruta: «Guía de integración» y «Descargar guía en PDF»", async (p) => {
    resolveActorMock.mockResolvedValue({ usuarioId: "m", rol: "maestro" });
    const Pagina = await p.pagina();
    render(await Pagina());

    // Control positivo: es la rama del maestro (el módulo se pintó).
    expect(screen.getByTestId(p.modulo)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Guía de integración" })).toHaveAttribute(
      "href",
      "/ayuda/oficina/guia-integracion-api",
    );
    expect(screen.getByRole("link", { name: "Descargar guía en PDF" })).toHaveAttribute(
      "href",
      "/ayuda/descargas/guia-integracion-api",
    );
  });
});

describe("R1313/R1314 — la rama «sin permiso» no los lleva", () => {
  const otros: (RolValue | null)[] = [null, "admin", "adminTienda", "adminSatelite", "mensajero"];

  it.each(PANTALLAS)("$ruta: sin sesión ni otro rol, ningún enlace a la guía", async (p) => {
    const Pagina = await p.pagina();
    for (const rol of otros) {
      resolveActorMock.mockResolvedValue(rol === null ? null : { usuarioId: "x", rol });
      render(await Pagina());

      // Control positivo: es la rama «sin permiso» y la cabecera sí se pintó.
      expect(screen.getByText(/No tienes permiso/i), String(rol)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Guía de integración" }), String(rol)).toBeNull();
      expect(screen.queryByRole("link", { name: "Descargar guía en PDF" }), String(rol)).toBeNull();
      cleanup();
    }
  });
});
