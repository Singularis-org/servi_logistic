import { describe, it, expect, vi, beforeEach } from "vitest";

import { UsuarioService } from "@/lib/services/UsuarioService";
import type { Actor } from "@/lib/interfaces/services/IUsuarioService";
import type {
  IUserRepository,
  RolItem,
  UsuarioPublico,
} from "@/lib/interfaces/repositories/IUserRepository";

// SL-32 (R8, R9, R11) — el `maestro` no ve, no asigna ni toca al superadmin. Dobles: aquí se
// prueba lo que DECIDE el servicio y que no escribe. Lo que filtra el `WHERE` del listado (R10)
// lo prueba `tests/integration/db/usuarios-sin-superadmin.test.ts` contra Postgres.
//
// `hashPassword` es un espía: «antes del hash» (R9) se afirma viendo que no se llamó.

const hashPassword = vi.hoisted(() => vi.fn(async () => "hash"));
vi.mock("@/lib/utils/password", () => ({ hashPassword }));

const MAESTRO: Actor = { usuarioId: "maestro-1", rol: "maestro" };

const ROLES: RolItem[] = [
  { id: "rol-maestro", value: "maestro" },
  { id: "rol-admin", value: "admin" },
  { id: "rol-mensajero", value: "mensajero" },
  { id: "rol-superadmin", value: "superadmin" },
];

function usuario(overrides: Partial<UsuarioPublico> = {}): UsuarioPublico {
  return {
    id: "usr-1",
    nombre: "Ana Torres",
    email: "ana@example.com",
    telefono: "099",
    estado: "activo",
    cedula: "1710034065",
    tipoIdentificacionId: "tipo-1",
    rolId: "rol-admin",
    fulfillment: false,
    zonaId: null,
    vehiculoId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

const SUPERADMIN = usuario({ id: "usr-super", rolId: "rol-superadmin" });

/** Todos los métodos son espías, para contar escrituras. */
function repoDoble(objetivo: UsuarioPublico | null = SUPERADMIN): IUserRepository {
  return {
    findCuentasPorEmailConHash: vi.fn(),
    findById: vi.fn().mockResolvedValue(objetivo),
    findCuentasPorEmail: vi.fn(),
    findCuentaPorId: vi.fn(), // SLT-32: exigido por IUserRepository; no ejercitado aqui
    create: vi.fn().mockResolvedValue(usuario()),
    restablecerContrasena: vi.fn(),
    updatePasswordHash: vi.fn(),
    listMensajeros: vi.fn(),
    listMensajerosParaFiltro: vi.fn(),
    listByRol: vi.fn(),
    listCuentasTienda: vi.fn(),
    obtenerCuentaTienda: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    update: vi.fn().mockResolvedValue(usuario()),
    setEstado: vi.fn().mockResolvedValue(usuario()),
    listTiposIdentificacion: vi.fn(),
    listRoles: vi.fn().mockResolvedValue(ROLES),
    contarAdminSatelitesActivos: vi.fn().mockResolvedValue(0),
  };
}

const ESCRITURAS = ["create", "update", "setEstado", "restablecerContrasena", "updatePasswordHash"] as const;

function escriturasDe(repo: IUserRepository): number {
  return ESCRITURAS.reduce(
    (n, m) => n + (repo[m] as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    0,
  );
}

function servicio(repo: IUserRepository) {
  const sesiones = { deleteAllByUserId: vi.fn().mockResolvedValue(0) };
  const cierres = { resumirConsolidablesPendientes: vi.fn() };
  const zonas = { findById: vi.fn() };
  const service = new UsuarioService(
    repo,
    zonas as never,
    undefined,
    sesiones,
    cierres as never,
  );
  return { service, sesiones, cierres };
}

const ALTA = {
  nombre: "Nadie",
  email: "nadie@example.com",
  telefono: "88880000",
  tipoIdentificacionId: "tipo-1",
  cedula: "123456789",
  passwordMode: "generate" as const,
};

beforeEach(() => {
  hashPassword.mockClear();
});

describe("R8 — la lista de roles asignables no trae al superadmin", () => {
  it("listarRoles devuelve los demás roles del repositorio, sin superadmin", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).service.listarRoles(MAESTRO);
    expect(r).toEqual({ status: "ok", roles: ROLES.filter((x) => x.value !== "superadmin") });
  });
});

describe("R9 — ni el alta ni la edición asignan el rol superadmin", () => {
  it("crear con rolId de superadmin: validation_error en rolId, sin hash ni escrituras", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).service.crear({ ...ALTA, rolId: "rol-superadmin" }, MAESTRO);
    expect(r).toEqual({ status: "validation_error", fieldErrors: { rolId: [expect.any(String)] } });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(escriturasDe(repo)).toBe(0);
  });

  it("CONTROL: crear con otro rol sí escribe (el caso de arriba no es vacuo)", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).service.crear({ ...ALTA, rolId: "rol-admin" }, MAESTRO);
    expect(r.status).toBe("ok");
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("actualizar a un admin con rolId de superadmin: validation_error en rolId, sin escrituras", async () => {
    const repo = repoDoble(usuario());
    const r = await servicio(repo).service.actualizar("usr-1", { rolId: "rol-superadmin" }, MAESTRO);
    expect(r).toEqual({ status: "validation_error", fieldErrors: { rolId: [expect.any(String)] } });
    expect(escriturasDe(repo)).toBe(0);
  });
});

describe("R11 — toda operación sobre el superadmin es not_found, sin escribir", () => {
  it("obtener", async () => {
    const repo = repoDoble();
    expect(await servicio(repo).service.obtener("usr-super", MAESTRO)).toEqual({ status: "not_found" });
    expect(escriturasDe(repo)).toBe(0);
  });

  it("actualizar", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).service.actualizar("usr-super", { telefono: "77770000" }, MAESTRO);
    expect(r).toEqual({ status: "not_found" });
    expect(escriturasDe(repo)).toBe(0);
  });

  it("cambiarEstado", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).service.cambiarEstado("usr-super", { estado: "inactivo" }, MAESTRO);
    expect(r).toEqual({ status: "not_found" });
    expect(escriturasDe(repo)).toBe(0);
  });

  it("restablecerContrasena, sin revocar sesiones ni generar hash", async () => {
    const repo = repoDoble();
    const { service, sesiones } = servicio(repo);
    expect(await service.restablecerContrasena("usr-super", MAESTRO)).toEqual({ status: "not_found" });
    expect(sesiones.deleteAllByUserId).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(escriturasDe(repo)).toBe(0);
  });

  it("consultarImpactoCambio, sin leer el dinero", async () => {
    const repo = repoDoble(usuario({ id: "usr-super", rolId: "rol-superadmin", zonaId: "z1" }));
    const { service, cierres } = servicio(repo);
    const r = await service.consultarImpactoCambio("usr-super", { estado: "inactivo" }, MAESTRO);
    expect(r).toEqual({ status: "not_found" });
    expect(cierres.resumirConsolidablesPendientes).not.toHaveBeenCalled();
    expect(repo.contarAdminSatelitesActivos).not.toHaveBeenCalled();
  });

  it("CONTROL: las mismas operaciones sobre un admin sí llegan a escribir", async () => {
    const repo = repoDoble(usuario());
    const { service } = servicio(repo);
    expect((await service.obtener("usr-1", MAESTRO)).status).toBe("ok");
    expect((await service.actualizar("usr-1", { telefono: "77770000" }, MAESTRO)).status).toBe("ok");
    expect((await service.cambiarEstado("usr-1", { estado: "inactivo" }, MAESTRO)).status).toBe("ok");
    expect((await service.restablecerContrasena("usr-1", MAESTRO)).status).toBe("ok");
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.setEstado).toHaveBeenCalledTimes(1);
    expect(repo.restablecerContrasena).toHaveBeenCalledTimes(1);
  });
});
