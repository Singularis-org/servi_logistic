import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsuarioService } from "@/lib/services/UsuarioService";
import { CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import {
  type IUserRepository,
  type UsuarioPublico,
} from "@/lib/interfaces/repositories/IUserRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IVehiculoRepository } from "@/lib/interfaces/repositories/IVehiculoRepository";
import type { Actor } from "@/lib/interfaces/services/IUsuarioService";

// Feature 21: asociacion de un vehiculo del catalogo al usuario `mensajero`.
// El vehiculo es OPCIONAL para el rol (a diferencia de la zona) y se fuerza a null
// para cualquier otro rol, sin confiar en lo que envie la UI.

vi.mock("@/lib/utils/password", () => ({
  hashPassword: vi.fn(async (p: string) => `hash(${p})`),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/utils/password-generator", () => ({
  generateStrongPassword: vi.fn(() => "Gen3rada!X"),
}));

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };

const ROLES = [
  { id: "rol-msg", value: "mensajero" as const },
  { id: "rol-sat", value: "adminSatelite" as const },
  { id: "rol-admin", value: "admin" as const },
];

function usuario(over: Partial<UsuarioPublico> = {}): UsuarioPublico {
  return {
    id: "usr-1",
    nombre: "Ana",
    email: "ana@example.com",
    telefono: "88880000",
    estado: "activo",
    cedula: "171003406",
    tipoIdentificacionId: "tipo-cr-cedula",
    rolId: "rol-msg",
    fulfillment: false,
    zonaId: "z1",
    vehiculoId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

function buildRepo(over: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findCuentasPorEmailConHash: vi.fn(),
    findById: vi.fn().mockResolvedValue(usuario()),
    findCuentasPorEmail: vi.fn(),
    findCuentaPorId: vi.fn(), // SLT-32: exigido por IUserRepository; no ejercitado aqui
    create: vi.fn().mockResolvedValue(usuario()),
    updatePasswordHash: vi.fn(),
    listMensajeros: vi.fn(),
    listMensajerosParaFiltro: vi.fn(),
    listByRol: vi.fn().mockResolvedValue([]),
    listCuentasTienda: vi.fn().mockResolvedValue([]),
    obtenerCuentaTienda: vi.fn().mockResolvedValue(null), // exigido por IUserRepository (ficha 381); no ejercitado aqui
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue(usuario()),
    setEstado: vi.fn(),
    listTiposIdentificacion: vi.fn(),
    listRoles: vi.fn().mockResolvedValue(ROLES),
    contarAdminSatelitesActivos: vi.fn().mockResolvedValue(0), // ficha 379: exigido por IUserRepository
    restablecerContrasena: vi.fn(), // ficha 362
    ...over,
  };
}

// La zona es obligatoria para mensajero/adminSatelite: se inyecta un repo que
// siempre resuelve para que estos tests midan SOLO el vehiculo.
function buildZonaRepo(): IZonaRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      id: "z1",
      nombre: "GAM",
      cobroVehiculo: false,
      distritosCount: 0,
      esCentral: false,
    }),
    list: vi.fn(),
    listLite: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    hardDelete: vi.fn(),
    countExistingDistritos: vi.fn(),
    countExistingVehiculos: vi.fn(),
    findCentralZonaId: vi.fn().mockResolvedValue(null),
    // FICHA 376 (Q4): lectura de solo lectura; este archivo no la ejercita.
    contarOrdenesVivasPorZona: vi.fn().mockResolvedValue([]),
    // FICHA 429: los metodos de la superficie del SINPE por bodega. El doble los declara
    // para seguir cumpliendo `IZonaRepository`; esta suite no los ejercita.
    listarSinpe: vi.fn().mockResolvedValue([]),
    findSinpeByZona: vi.fn().mockResolvedValue(null),
    zonaIdDeUsuario: vi.fn().mockResolvedValue(null),
    guardarSinpe: vi.fn().mockResolvedValue(null),
    confirmarSinpe: vi.fn().mockResolvedValue(null),
  };
}

function buildVehiculoRepo(exists: boolean): IVehiculoRepository {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(exists ? { id: "v1", name: "moto", activo: true } : null),
    findByName: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    rename: vi.fn(),
    setActivo: vi.fn(),
  };
}

const baseCrear = {
  nombre: "Ana",
  email: "ana@example.com",
  telefono: "88880000",
  tipoIdentificacionId: "tipo-cr-cedula",
  cedula: "171003406",
  passwordMode: "manual" as const,
  password: "Abcdef1!",
};

function creado(repo: IUserRepository) {
  return (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
}
function actualizado(repo: IUserRepository) {
  return (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
}

let repo: IUserRepository;
beforeEach(() => {
  vi.clearAllMocks();
  repo = buildRepo();
});

describe("crear — vehiculo por rol (feature 21)", () => {
  it("mensajero con vehiculoId existente lo persiste", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.crear(
      { ...baseCrear, rolId: "rol-msg", zonaId: "z1", vehiculoId: "v1" },
      MAESTRO,
    );
    expect(r.status).toBe("ok");
    expect(creado(repo).vehiculoId).toBe("v1");
  });

  it("mensajero SIN vehiculo -> validation_error (es obligatorio para el rol)", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.crear({ ...baseCrear, rolId: "rol-msg", zonaId: "z1" }, MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") {
      expect(r.fieldErrors.vehiculoId).toBeDefined();
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rol no aplicable (adminSatelite) fuerza vehiculoId=null aunque se envie", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    await svc.crear(
      { ...baseCrear, rolId: "rol-sat", zonaId: "z1", vehiculoId: "v1" },
      MAESTRO,
    );
    expect(creado(repo).vehiculoId).toBeNull();
  });

  it("vehiculoId inexistente -> validation_error sin tocar la base", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(false), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.crear(
      { ...baseCrear, rolId: "rol-msg", zonaId: "z1", vehiculoId: "fantasma" },
      MAESTRO,
    );
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") {
      expect(r.fieldErrors.vehiculoId).toBeDefined();
    }
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("actualizar — vehiculo por rol (feature 21)", () => {
  it("asocia un vehiculo existente a un mensajero", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.actualizar("usr-1", { vehiculoId: "v1" }, MAESTRO);
    expect(r.status).toBe("ok");
    expect(actualizado(repo).vehiculoId).toBe("v1");
  });

  it("vehiculoId=null en un mensajero -> validation_error (no se puede dejar sin vehiculo)", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.actualizar("usr-1", { vehiculoId: null }, MAESTRO);
    expect(r.status).toBe("validation_error");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("no toca el vehiculo si no se envia ni cambia el rol", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    await svc.actualizar("usr-1", { nombre: "Ana B" }, MAESTRO);
    expect(actualizado(repo)).not.toHaveProperty("vehiculoId");
  });

  it("cambiar a un rol sin vehiculo limpia el vehiculo heredado", async () => {
    repo = buildRepo({
      findById: vi.fn().mockResolvedValue(usuario({ vehiculoId: "v1" })),
    });
    const svc = new UsuarioService(repo, buildZonaRepo(), buildVehiculoRepo(true), undefined, undefined, reglasPaisFijas(CR));
    await svc.actualizar("usr-1", { rolId: "rol-admin" }, MAESTRO);
    expect(actualizado(repo).vehiculoId).toBeNull();
  });
});

// SL-42 (design §4.5; R18) — un tipo desactivado por la plataforma no se elige de nuevo, y quien
// ya lo tiene lo conserva.
describe("SL-42/R18 — vehiculo inactivo", () => {
  /** El catalogo con `v1` activo y `v-off` inactivo; cualquier otro id no existe. */
  function catalogoConInactivo(): IVehiculoRepository {
    const filas: Record<string, { id: string; name: string; activo: boolean }> = {
      v1: { id: "v1", name: "moto", activo: true },
      "v-off": { id: "v-off", name: "carreta", activo: false },
    };
    return { ...buildVehiculoRepo(true), findById: vi.fn(async (id: string) => filas[id] ?? null) };
  }

  function errorDeVehiculo(r: Awaited<ReturnType<UsuarioService["crear"]>>): string[] | undefined {
    return r.status === "validation_error" ? r.fieldErrors.vehiculoId : undefined;
  }

  it("R18: el alta de un mensajero con un tipo inactivo -> validation_error en `vehiculoId`, sin escribir", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), catalogoConInactivo(), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.crear({ ...baseCrear, rolId: "rol-msg", zonaId: "z1", vehiculoId: "v-off" }, MAESTRO);
    expect(r.status).toBe("validation_error");
    expect(errorDeVehiculo(r)?.[0]).toMatch(/ya no esta disponible/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R18: la edicion que CAMBIA a un tipo inactivo -> validation_error en `vehiculoId`, sin escribir", async () => {
    repo = buildRepo({ findById: vi.fn().mockResolvedValue(usuario({ vehiculoId: "v1" })) });
    const svc = new UsuarioService(repo, buildZonaRepo(), catalogoConInactivo(), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.actualizar("usr-1", { vehiculoId: "v-off" }, MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(r.fieldErrors.vehiculoId?.[0]).toMatch(/ya no esta disponible/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R18: la edicion que reenvia el mismo tipo inactivo que ya tiene sigue siendo valida", async () => {
    repo = buildRepo({ findById: vi.fn().mockResolvedValue(usuario({ vehiculoId: "v-off" })) });
    const svc = new UsuarioService(repo, buildZonaRepo(), catalogoConInactivo(), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.actualizar("usr-1", { vehiculoId: "v-off", nombre: "Ana B" }, MAESTRO);
    expect(r.status).toBe("ok");
    expect(actualizado(repo).vehiculoId).toBe("v-off");
  });

  it("R18: la edicion que no toca el vehiculo (otro campo, o el mismo rol) conserva el inactivo", async () => {
    repo = buildRepo({ findById: vi.fn().mockResolvedValue(usuario({ vehiculoId: "v-off" })) });
    const svc = new UsuarioService(repo, buildZonaRepo(), catalogoConInactivo(), undefined, undefined, reglasPaisFijas(CR));
    expect((await svc.actualizar("usr-1", { nombre: "Ana B" }, MAESTRO)).status).toBe("ok");
    expect(actualizado(repo)).not.toHaveProperty("vehiculoId");

    // Reenviar el rol que ya tiene recalcula el vehiculo con el actual: tampoco cae.
    vi.clearAllMocks();
    expect((await svc.actualizar("usr-1", { rolId: "rol-msg" }, MAESTRO)).status).toBe("ok");
    expect(actualizado(repo).vehiculoId).toBe("v-off");
  });

  it("R18: cambiar de un inactivo a un tipo activo es valido", async () => {
    repo = buildRepo({ findById: vi.fn().mockResolvedValue(usuario({ vehiculoId: "v-off" })) });
    const svc = new UsuarioService(repo, buildZonaRepo(), catalogoConInactivo(), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.actualizar("usr-1", { vehiculoId: "v1" }, MAESTRO);
    expect(r.status).toBe("ok");
    expect(actualizado(repo).vehiculoId).toBe("v1");
  });

  it("un id que no existe sigue diciendo que no existe, no que esta inactivo", async () => {
    const svc = new UsuarioService(repo, buildZonaRepo(), catalogoConInactivo(), undefined, undefined, reglasPaisFijas(CR));
    const r = await svc.crear({ ...baseCrear, rolId: "rol-msg", zonaId: "z1", vehiculoId: "fantasma" }, MAESTRO);
    expect(errorDeVehiculo(r)?.[0]).toMatch(/no existe/);
  });
});
