// SLT-159 «Escaneo continuo en recepciones y recogidas» (R612, R613) — las dos páginas «Recibir
// paquetes». Los `page.tsx` reales se ejercitan sin render: se mira qué superficie devuelven y con
// qué props, o que llaman a `notFound()` antes de nada. Se doblan la sesión y las tres acciones de
// recepción (ninguna debe llamarse al entrar).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const { resolveActorMock, notFoundMock, accionesMock } = vi.hoisted(() => ({
  resolveActorMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  accionesMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: () => resolveActorMock(),
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/actions/recepcion-bodega-central", () => ({
  recibirEnBodegaCentralPorQr: accionesMock,
}));
vi.mock("@/lib/actions/recepcion-origen", () => ({ recibirEnOrigenPorQr: accionesMock }));
vi.mock("@/lib/actions/recepcion-satelite", () => ({ recibirPorQr: accionesMock }));

import OrdenesRecibirPage from "@/app/(app)/ordenes/recibir/page";
import SateliteRecibirPage from "@/app/(app)/recepcion-satelite/recibir/page";
import { EscanerRecepcionBodegaCentral } from "@/app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral";
import { EscanerRecepcionOrigen } from "@/app/(app)/ordenes/_components/EscanerRecepcionOrigen";
import { EscanerRecepcion } from "@/app/(app)/recepcion-satelite/_components/EscanerRecepcion";

const actor = (rol: string) => ({ usuarioId: "u1", rol });

async function satelite(desde?: string | string[]) {
  return (await SateliteRecibirPage({
    searchParams: Promise.resolve(desde === undefined ? {} : { desde }),
  })) as ReactElement<{ modo: string; volverA: string }>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/ordenes/recibir (R612, R613)", () => {
  it.each(["maestro", "admin"])("%s monta la recepción en bodega central y vuelve a /ordenes", async (rol) => {
    resolveActorMock.mockResolvedValue(actor(rol));

    const el = (await OrdenesRecibirPage()) as ReactElement;

    expect(el.type).toBe(EscanerRecepcionBodegaCentral);
    expect(el.props).toEqual({ modo: "pagina", volverA: "/ordenes" });
  });

  it("adminTienda monta la recepción en tienda", async () => {
    resolveActorMock.mockResolvedValue(actor("adminTienda"));

    const el = (await OrdenesRecibirPage()) as ReactElement;

    expect(el.type).toBe(EscanerRecepcionOrigen);
    expect(el.props).toEqual({ modo: "pagina", volverA: "/ordenes" });
  });

  it.each([["adminSatelite"], ["mensajero"], [null]])(
    "%s → notFound() sin llamar a ninguna acción",
    async (rol) => {
      resolveActorMock.mockResolvedValue(rol === null ? null : actor(rol));

      await expect(OrdenesRecibirPage()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFoundMock).toHaveBeenCalled();
      expect(accionesMock).not.toHaveBeenCalled();
    },
  );
});

describe("/recepcion-satelite/recibir (R612, R613)", () => {
  it("adminSatelite monta la recepción de la satélite", async () => {
    resolveActorMock.mockResolvedValue(actor("adminSatelite"));

    const el = await satelite("en-bodega");

    expect(el.type).toBe(EscanerRecepcion);
    expect(el.props).toEqual({ modo: "pagina", volverA: "/recepcion-satelite/en-bodega" });
  });

  it.each([
    ["https://evil.test", "/recepcion-satelite/por-recibir"],
    [undefined, "/recepcion-satelite/por-recibir"],
    [["en-bodega", "x"], "/recepcion-satelite/por-recibir"],
    ["por-recibir", "/recepcion-satelite/por-recibir"],
  ])("desde=%s vuelve a %s", async (desde, volverA) => {
    resolveActorMock.mockResolvedValue(actor("adminSatelite"));

    expect((await satelite(desde as string | undefined)).props.volverA).toBe(volverA);
  });

  it.each([["maestro"], ["adminTienda"], ["mensajero"], [null]])(
    "%s → notFound() sin llamar a ninguna acción",
    async (rol) => {
      resolveActorMock.mockResolvedValue(rol === null ? null : actor(rol));

      await expect(satelite("en-bodega")).rejects.toThrow("NEXT_NOT_FOUND");
      expect(accionesMock).not.toHaveBeenCalled();
    },
  );
});
