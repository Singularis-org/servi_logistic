// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import AyudaDocumentoPage from "@/app/(app)/ayuda/[...slug]/page";
import { AccionesGuiaApi } from "@/app/(app)/ayuda/_components/AccionesGuiaApi";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

// SLT-80 «Guía de integración por API en la ayuda» — R1306 y R1308.
//
// ⚠️ LOS HREF SE COMPARAN CONTRA LITERALES DEL SPEC, no contra `lib/ayuda/guia-api.ts`: el literal
// ES el contrato. Comparar contra la constante dejaría el test verde aunque alguien cambiara la ruta.
//
// La página es la real, con el catálogo real de `docs/ayuda/**` (patrón de
// `AyudaDocumentoPage.test.tsx`): solo se mockean la sesión y `notFound()`.

class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  usePathname: () => "/ayuda/oficina/guia-integracion-api",
}));

vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: vi.fn(),
}));

const resolveActorMock = vi.mocked(resolveActorFromSession);

function props(slug: string[]) {
  return { params: Promise.resolve({ slug }) };
}

function entra(rol: RolValue) {
  resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol, zonaId: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("R1308 — las tres acciones de la guía", () => {
  it("«Descargar PDF», «Swagger» y «Postman» con sus rutas exactas", () => {
    render(<AccionesGuiaApi />);

    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute(
      "href",
      "/ayuda/descargas/guia-integracion-api",
    );
    expect(screen.getByRole("link", { name: "Colección de Postman" })).toHaveAttribute(
      "href",
      "/ayuda/descargas/postman",
    );

    const swagger = screen.getByRole("link", { name: /Referencia interactiva \(Swagger\)/ });
    expect(swagger).toHaveAttribute("href", "/api-docs");
    // «abre en una pestaña nueva», y sin darle `window.opener` a la pestaña abierta.
    expect(swagger).toHaveAttribute("target", "_blank");
    expect(swagger).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("las acciones van en un grupo con nombre accesible", () => {
    render(<AccionesGuiaApi />);
    const grupo = screen.getByRole("navigation", { name: "Descargas y referencia de la API" });
    expect(within(grupo).getAllByRole("link")).toHaveLength(3);
  });
});

describe("R1306/R1308 — la página de la guía las pinta; ningún otro documento", () => {
  it.each(["maestro", "admin"] as const)(
    "⭑ %s abre la guía: el cuerpo del `.md` y las tres acciones",
    async (rol) => {
      entra(rol);
      render(await AyudaDocumentoPage(props(["oficina", "guia-integracion-api"])));

      // R1301/R1306: el texto sale del `.md` de la guía, leído por `leerDocumentoAyuda`.
      expect(
        screen.getByRole("heading", { level: 2, name: "Guía de integración — API de Servi Logistic" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Qué NO resuelve" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute(
        "href",
        "/ayuda/descargas/guia-integracion-api",
      );
      expect(screen.getByRole("link", { name: "Colección de Postman" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Referencia interactiva \(Swagger\)/ }),
      ).toBeInTheDocument();
    },
  );

  it("⭑ control negativo: otro documento de Ayuda NO lleva las acciones", async () => {
    entra("maestro");
    render(await AyudaDocumentoPage(props(["oficina", "wallet-caja"])));

    // Control positivo: el documento SÍ se pintó; sin él, un render vacío pasaría lo de abajo.
    expect(screen.getByRole("heading", { level: 2, name: "Wallet · Caja" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Colección de Postman" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Swagger/ })).toBeNull();
  });
});
