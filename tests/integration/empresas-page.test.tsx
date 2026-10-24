// @vitest-environment jsdom
// SL-32 (R35, R29) — LA PÁGINA `/plataforma/empresas` AUTORIZA ANTES DE LEER.
//
// Se mide la frontera servidor→cliente: que ningún rol de empresa vea la pantalla, y que la página
// ni siquiera pida el listado ni el catálogo (una página que consulta y luego decide no pintar ya
// sacó los datos de todas las empresas). Con el superadmin se monta el `EmpresasModule` REAL con
// el listado que baja por props, y se lee la tabla que pinta.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

const { listarMock, tiposMock, pendientesMock } = vi.hoisted(() => ({
  listarMock: vi.fn(),
  tiposMock: vi.fn(),
  pendientesMock: vi.fn(),
}));
vi.mock("@/lib/actions/_shared/empresas-plataforma", () => ({
  listarEmpresasPlataforma: (...a: unknown[]) => listarMock(...a),
}));
vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));
vi.mock("@/lib/repositories/UserRepository", () => ({
  UserRepository: class {
    listTiposIdentificacion = () => tiposMock();
  },
}));
vi.mock("@/lib/actions/organizaciones", () => ({
  altaEmpresaAction: vi.fn(),
  reenviarBienvenidaAction: vi.fn(),
  bienvenidasPendientesAction: () => pendientesMock(),
}));

// SL-40 (R9): el valor global del cobro por orden también se lee en la página.
const { verCobroMock } = vi.hoisted(() => ({ verCobroMock: vi.fn() }));
vi.mock("@/lib/actions/cobro-plataforma", () => ({
  verCobroGlobalAction: () => verCobroMock(),
  fijarCobroGlobalAction: vi.fn(),
  fijarCobroEmpresaAction: vi.fn(),
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import EmpresasPage from "@/app/(app)/plataforma/empresas/page";

const EMPRESAS: EmpresaListada[] = [
  {
    id: "org-b",
    nombre: "Envíos Norte",
    slug: "envios-norte",
    creadaEn: new Date("2026-10-20T12:00:00Z"),
    maestros: [{ nombre: "Ana Pérez", email: "ana@norte.test" }],
    cobroPorOrden: null,
    // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
  },
  {
    id: "org-a",
    nombre: "Reparto Sur",
    slug: "reparto-sur",
    creadaEn: new Date("2026-09-05T12:00:00Z"),
    maestros: [],
    cobroPorOrden: null,
    // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
  },
];

const ROLES_DE_EMPRESA: RolValue[] = [
  "maestro",
  "admin",
  "mensajero",
  "adminTienda",
  "adminSatelite",
  "apiKey",
];

const actorMock = vi.mocked(resolveActorFromSession);

beforeEach(() => {
  vi.clearAllMocks();
  listarMock.mockResolvedValue({ status: "ok", empresas: EMPRESAS });
  tiposMock.mockResolvedValue([{ id: "t-1", value: "cedula" }]);
  pendientesMock.mockResolvedValue({ estado: "ok", organizacionIds: ["org-b"] });
  verCobroMock.mockResolvedValue({ status: "ok", cobroGlobal: { monto: null } });
});

afterEach(() => cleanup());

describe("SL-32 (R35) — /plataforma/empresas solo para la plataforma", () => {
  it.each(ROLES_DE_EMPRESA)("%s → notFound(), sin leer el listado ni el catálogo", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u-1", rol });

    await expect(EmpresasPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listarMock).not.toHaveBeenCalled();
    expect(tiposMock).not.toHaveBeenCalled();
    expect(pendientesMock).not.toHaveBeenCalled();
    expect(verCobroMock).not.toHaveBeenCalled();
  });

  it("sin sesión → notFound(), sin leer nada", async () => {
    actorMock.mockResolvedValue(null);

    await expect(EmpresasPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listarMock).not.toHaveBeenCalled();
    expect(tiposMock).not.toHaveBeenCalled();
    expect(pendientesMock).not.toHaveBeenCalled();
    expect(verCobroMock).not.toHaveBeenCalled();
  });
});

describe("SL-32 (R29, R35) — con el superadmin, la página pinta el listado", () => {
  it("pide el listado con su actor y pinta una fila por empresa, en el orden del servidor", async () => {
    const actor = { usuarioId: "sa-1", rol: "superadmin" as const };
    actorMock.mockResolvedValue(actor);

    render(await EmpresasPage());

    expect(listarMock).toHaveBeenCalledWith(actor);
    expect(screen.getByRole("heading", { level: 1, name: "Empresas" })).toBeInTheDocument();
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas.map((f) => within(f).getAllByRole("cell")[0].textContent)).toEqual([
      "Envíos Norte",
      "Reparto Sur",
    ]);
    expect(within(filas[0]).getByText("Ana Pérez · ana@norte.test")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Crear empresa" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("el catálogo de tipos de documento baja al selector del formulario", async () => {
    actorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });
    tiposMock.mockResolvedValue([
      { id: "t-1", value: "cedula" },
      { id: "t-2", value: "pasaporte" },
    ]);

    render(await EmpresasPage());

    expect(tiposMock).toHaveBeenCalledTimes(1);
    screen.getByRole("combobox", { name: "Tipo de documento" }).click();
    const opciones = await screen.findAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual(["cedula", "pasaporte"]);
  });

  // SL-41 (R38): la página pasa al módulo qué bienvenidas siguen pendientes.
  it("R38: con la lectura de pendientes, solo la fila pendiente lleva «Reenviar bienvenida»", async () => {
    actorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });
    listarMock.mockResolvedValue({
      status: "ok",
      empresas: [EMPRESAS[0], { ...EMPRESAS[0], id: "org-c", nombre: "Carga Este", slug: "carga-este" }],
    });

    render(await EmpresasPage());

    expect(pendientesMock).toHaveBeenCalledTimes(1);
    const filas = screen.getAllByRole("row").slice(1);
    expect(within(filas[0]).getByRole("button", { name: "Reenviar bienvenida" })).toBeInTheDocument();
    expect(within(filas[1]).queryByRole("button", { name: "Reenviar bienvenida" })).toBeNull();
  });

  it("R38: si la lectura de pendientes falla, vale R29 y toda fila con maestros lleva el botón", async () => {
    actorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });
    pendientesMock.mockResolvedValue({ estado: "error" });
    listarMock.mockResolvedValue({
      status: "ok",
      empresas: [EMPRESAS[0], { ...EMPRESAS[0], id: "org-c", nombre: "Carga Este", slug: "carga-este" }],
    });

    render(await EmpresasPage());

    const filas = screen.getAllByRole("row").slice(1);
    for (const fila of filas) {
      expect(within(fila).getByRole("button", { name: "Reenviar bienvenida" })).toBeInTheDocument();
    }
  });

  it("si el listado no llega, lo dice y no inventa empresas", async () => {
    actorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });
    listarMock.mockResolvedValue({ status: "forbidden" });

    render(await EmpresasPage());

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el listado de empresas.");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("SL-40 (R9) — la página baja el valor global al bloque «Cobro por orden»", () => {
  it("lee el valor global y lo pinta; sin configurar dice «Sin configurar (0,00)»", async () => {
    actorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });

    render(await EmpresasPage());

    expect(verCobroMock).toHaveBeenCalledTimes(1);
    const bloque = screen.getByRole("region", { name: "Cobro por orden" });
    expect(bloque).toHaveTextContent("Valor global: Sin configurar (0,00)");
  });

  it("si no se pudo leer, el bloque lo dice en vez de inventar un 0,00", async () => {
    actorMock.mockResolvedValue({ usuarioId: "sa-1", rol: "superadmin" });
    verCobroMock.mockResolvedValue({ status: "forbidden" });

    render(await EmpresasPage());

    const bloque = screen.getByRole("region", { name: "Cobro por orden" });
    expect(bloque).toHaveTextContent("No se pudo leer el valor global.");
    expect(bloque).not.toHaveTextContent("Sin configurar (0,00)");
  });
});
