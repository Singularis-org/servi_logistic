// @vitest-environment jsdom
// SL-23 (design §7; R8, R14) — LA PÁGINA `/plataforma/empresas/[organizacionId]` AUTORIZA ANTES DE LEER.
//
// Se mide la frontera servidor→cliente, como en `empresas-page.test.tsx`: ningún rol de empresa ve
// la pantalla y la página ni siquiera pide los módulos de la empresa. Con el superadmin se monta el
// `ModulosEmpresa` REAL con lo que baja por props, y se lee lo que pinta: 8 interruptores y el núcleo,
// con sus 8 nombres y sin control.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import { MODULOS_APAGABLES, NUCLEO, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import type { VerModulosEmpresaResult } from "@/lib/types/modulos-empresa";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

const { verMock, fijarMock } = vi.hoisted(() => ({ verMock: vi.fn(), fijarMock: vi.fn() }));
vi.mock("@/lib/actions/_shared/modulos-empresa", () => ({
  verModulosEmpresa: (...a: unknown[]) => verMock(...a),
}));
vi.mock("@/lib/actions/modulos-empresa", () => ({
  fijarModuloEmpresaAction: (...a: unknown[]) => fijarMock(...a),
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { ToastProvider } from "@/providers/ToastProvider";
import EmpresaDetallePage from "@/app/(app)/plataforma/empresas/[organizacionId]/page";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const params = (organizacionId = ORG) => Promise.resolve({ organizacionId });

const ROLES_DE_EMPRESA: RolValue[] = [
  "maestro",
  "admin",
  "mensajero",
  "adminTienda",
  "adminSatelite",
  "apiKey",
];

const OK: VerModulosEmpresaResult = {
  estado: "ok",
  empresa: {
    organizacionId: ORG,
    nombre: "Envíos Norte",
    modulos: ORDEN_MODULOS.map((clave) => ({
      clave,
      nombre: MODULOS_APAGABLES[clave].nombre,
      activo: clave === "wallet" || clave === "monitoreo",
    })),
  },
};

const actorMock = vi.mocked(resolveActorFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  verMock.mockResolvedValue(OK);
});

afterEach(() => cleanup());

describe("SL-23 (R14) — el detalle solo para la plataforma", () => {
  it.each(ROLES_DE_EMPRESA)("%s → notFound(), sin leer los módulos", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    await expect(EmpresaDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(verMock).not.toHaveBeenCalled();
  });

  it("sin sesión → notFound(), sin leer nada", async () => {
    actorMock.mockResolvedValue(null);

    await expect(EmpresaDetallePage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(verMock).not.toHaveBeenCalled();
  });
});

describe("SL-23 (R8) — con el superadmin, la página pinta los módulos", () => {
  const superadmin = { usuarioId: "sa-1", rol: "superadmin" as const };

  it("lee con su actor y la empresa de la URL; 8 interruptores con su estado y el núcleo sin control", async () => {
    actorMock.mockResolvedValue(superadmin);

    render(<ToastProvider>{await EmpresaDetallePage({ params: params() })}</ToastProvider>);

    expect(verMock).toHaveBeenCalledWith(superadmin, { organizacionId: ORG });
    expect(screen.getByRole("heading", { level: 1, name: "Envíos Norte" })).toBeInTheDocument();

    const modulos = screen.getByRole("region", { name: "Módulos" });
    const switches = within(modulos).getAllByRole("switch");
    expect(switches).toHaveLength(4);
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual(
      ORDEN_MODULOS.map((c) => MODULOS_APAGABLES[c].nombre),
    );
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(
      ORDEN_MODULOS.map((c) => String(c === "wallet" || c === "monitoreo")),
    );

    const nucleo = screen.getByRole("region", { name: "Núcleo (siempre activo)" });
    expect(within(nucleo).getAllByRole("listitem").map((li) => li.textContent)).toEqual([...NUCLEO]);
    expect(NUCLEO).toHaveLength(12);
    expect(within(nucleo).queryByRole("switch")).toBeNull();
    expect(within(nucleo).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(4);

    expect(screen.getByRole("link", { name: "Volver a Empresas" })).toHaveAttribute(
      "href",
      "/plataforma/empresas",
    );
  });

  it.each<VerModulosEmpresaResult>([{ estado: "not_found" }, { estado: "validation_error" }])(
    "empresa inexistente o id inválido ($estado) → notFound()",
    async (respuesta) => {
      actorMock.mockResolvedValue(superadmin);
      verMock.mockResolvedValue(respuesta);

      await expect(EmpresaDetallePage({ params: params("no-existe") })).rejects.toThrow("NEXT_NOT_FOUND");
    },
  );
});
