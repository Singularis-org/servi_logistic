// @vitest-environment jsdom
// FICHA 374 (H5 · R38) — LA PÁGINA `/configuracion/geografia` AUTORIZA ANTES DE LEER.
// SL-32 (R26): la puerta pasa de `maestro` a la plataforma (`esPlataforma`), con `notFound()`.
//
// Lo que se mide aquí es la FRONTERA servidor→cliente, no la pantalla: que un rol que no es de la
// plataforma no vea el árbol Y que la página ni siquiera lo pida. Lo segundo importa tanto como lo
// primero: una página que consulta y luego decide no pintar ya sacó los datos de la base.
//
// El módulo cliente va STUBBEADO y captura sus props: montar el árbol real metería en el camino los
// toasts y las cuatro Server Actions sin añadir nada a lo que este archivo afirma.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { ProvinciaArbolDTO } from "@/lib/types/geografia-nodo";

// El topbar de `AppPage` monta el botón de salir, que es cliente y pide el router de Next: se
// stubbea para aislar la frontera de props, igual que hace `wallet-page-cobros-pendientes`.
vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

// `notFound()` de Next lanza; el doble lanza un error con el mismo texto para poder esperarlo.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: vi.fn(),
}));

const listarArbolGeograficoMock = vi.fn();
vi.mock("@/lib/actions/geografia", () => ({
  listarArbolGeografico: (...args: unknown[]) => listarArbolGeograficoMock(...args),
  crearNodoGeografico: vi.fn(),
  cambiarActivacionGeografica: vi.fn(),
  contarOrdenesSinEntregarDeNodo: vi.fn(),
}));

const propsRecibidas: { initialProvincias: ProvinciaArbolDTO[] }[] = [];
vi.mock(
  "@/app/(app)/configuracion/geografia/_components/GeografiaAdminModule",
  () => ({
    GeografiaAdminModule: (props: { initialProvincias: ProvinciaArbolDTO[] }) => {
      propsRecibidas.push(props);
      return <div data-testid="geografia-module-stub" />;
    },
  }),
);

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import GeografiaPage from "@/app/(app)/configuracion/geografia/page";

const ARBOL: ProvinciaArbolDTO[] = [
  {
    id: "p-pu",
    nombre: "Puntarenas",
    activo: true,
    cantones: [
      {
        id: "c-ba",
        nombre: "Buenos Aires",
        activo: true,
        distritos: [
          {
            id: "d-cab",
            nombre: "Cabagra",
            zonaId: "z-sur",
            zonaNombre: "Zona Sur",
            zonaEspecial: false,
            activo: true,
          },
        ],
      },
    ],
  },
];

function actorDe(rol: string) {
  return { usuarioId: "u-1", rol } as unknown as Awaited<
    ReturnType<typeof resolveActorFromSession>
  >;
}

beforeEach(() => {
  vi.clearAllMocks();
  propsRecibidas.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("SL-32 (R26) — /configuracion/geografia solo para la plataforma", () => {
  it.each(["maestro", "admin", "mensajero", "adminTienda", "adminSatelite", "apiKey"])(
    "el rol %s recibe notFound() y la página NO consulta el catálogo",
    async (rol) => {
      vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe(rol));

      await expect(GeografiaPage()).rejects.toThrow("NEXT_NOT_FOUND");
      // ⭑ Lo que hace que este test no sea decorativo: la lectura NI SIQUIERA SE PIDE.
      expect(listarArbolGeograficoMock).not.toHaveBeenCalled();
      expect(propsRecibidas).toHaveLength(0);
    },
  );

  it("sin sesión tampoco: `resolveActorFromSession` devuelve null", async () => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(null);

    await expect(GeografiaPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listarArbolGeograficoMock).not.toHaveBeenCalled();
  });

  it("el `superadmin` sí ve el árbol, y le baja por PROPS desde el servidor", async () => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe("superadmin"));
    listarArbolGeograficoMock.mockResolvedValue({ status: "ok", provincias: ARBOL });

    render(await GeografiaPage());

    expect(listarArbolGeograficoMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("geografia-module-stub")).toBeInTheDocument();
    expect(propsRecibidas).toHaveLength(1);
    expect(propsRecibidas[0].initialProvincias).toEqual(ARBOL);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si la lectura falla, la página lo dice y monta el módulo vacío", async () => {
    vi.mocked(resolveActorFromSession).mockResolvedValue(actorDe("superadmin"));
    listarArbolGeograficoMock.mockResolvedValue({ status: "forbidden" });

    render(await GeografiaPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo cargar el catálogo geográfico.",
    );
    expect(propsRecibidas[0].initialProvincias).toEqual([]);
  });
});
