import { describe, it, expect, vi, beforeEach } from "vitest";
import { RolValue } from "@prisma/client";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { VehiculoService } from "@/lib/services/VehiculoService";
import type { IVehiculoRepository } from "@/lib/interfaces/repositories/IVehiculoRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type { VehiculoDTO } from "@/lib/types/vehiculos";

// SL-42 (design §3, §4.2) — autz y reglas del catalogo de vehiculos con un repositorio doble. La
// ausencia de sesion (`unauthenticated`) se cubre en el borde
// (`tests/unit/actions/vehiculos-plataforma-action.test.ts`); el SQL, en
// `tests/integration/db/vehiculos-plataforma.test.ts`.

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };
const SUPERADMIN: Actor = { usuarioId: "sa1", rol: "superadmin" };
const DESCONOCIDO: Actor = { usuarioId: "x", rol: "invitado" as RolValue };

/** Todo rol que no es de la plataforma, sacado del enum: un rol nuevo entra solo en el barrido. */
const ROLES_DE_EMPRESA: Actor[] = Object.values(RolValue)
  .filter((rol) => !(ROLES_PLATAFORMA as readonly string[]).includes(rol))
  .map((rol) => ({ usuarioId: `u-${rol}`, rol }));

const NO_MAESTRO: Actor[] = [
  ...ROLES_DE_EMPRESA.filter((a) => a.rol !== "maestro"),
  SUPERADMIN,
  DESCONOCIDO,
];
const NO_GESTION: Actor[] = [...ROLES_DE_EMPRESA, DESCONOCIDO];

const MOTO: VehiculoDTO = { id: "veh-3", name: "moto", activo: true };
const SEED_ROWS: VehiculoDTO[] = [
  { id: "veh-1", name: "camion", activo: true },
  { id: "veh-2", name: "carro", activo: false },
  MOTO,
];

function buildRepo(overrides: Partial<IVehiculoRepository> = {}): IVehiculoRepository {
  return {
    findMany: vi.fn().mockResolvedValue(SEED_ROWS),
    findById: vi.fn().mockResolvedValue(MOTO),
    findByName: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (name: string) => ({ id: "veh-nuevo", name, activo: true })),
    rename: vi.fn(async (id: string, name: string) => ({ id, name, activo: true })),
    setActivo: vi.fn(async (id: string, activo: boolean) => ({ ...MOTO, id, activo })),
    ...overrides,
  };
}

/** Los metodos del repositorio que escriben. */
function escrituras(repo: IVehiculoRepository) {
  return [repo.create, repo.rename, repo.setActivo];
}

let repo: IVehiculoRepository;
let service: VehiculoService;

beforeEach(() => {
  repo = buildRepo();
  service = new VehiculoService(repo);
});

describe("listar — la lectura de empresa (R17)", () => {
  it("R17: el maestro sigue listando el catalogo", async () => {
    const r = await service.listar(MAESTRO);
    expect(r).toEqual({ status: "ok", items: SEED_ROWS });
    expect(repo.findMany).toHaveBeenCalledTimes(1);
  });

  it("cualquier otro rol (tambien el superadmin, que usa listarTodos) -> forbidden sin tocar el repo", async () => {
    for (const actor of NO_MAESTRO) expect((await service.listar(actor)).status, actor.rol).toBe("forbidden");
    expect(repo.findMany).not.toHaveBeenCalled();
  });
});

describe("listarTodos — la pantalla del superadmin (R2)", () => {
  it("R2: el superadmin recibe activos e inactivos, sin filtro de activos", async () => {
    const r = await service.listarTodos(SUPERADMIN);
    expect(r).toEqual({ status: "ok", items: SEED_ROWS });
    expect(repo.findMany).toHaveBeenCalledWith();
  });

  it("R14: un rol de empresa recibe forbidden sin tocar el repo", async () => {
    for (const actor of NO_GESTION) expect((await service.listarTodos(actor)).status, actor.rol).toBe("forbidden");
    expect(repo.findMany).not.toHaveBeenCalled();
  });
});

describe("crear (R4, R10)", () => {
  it("R4: el superadmin crea el tipo activo con el nombre que le llega, y el actor va al repositorio", async () => {
    const r = await service.crear({ name: "Furgon 3/4" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", vehiculo: { id: "veh-nuevo", name: "Furgon 3/4", activo: true } });
    expect(repo.create).toHaveBeenCalledWith("Furgon 3/4", SUPERADMIN.usuarioId);
  });

  it("R10: un nombre que ya tiene otro tipo, activo o inactivo, es conflict sin escribir", async () => {
    for (const existente of [MOTO, { ...MOTO, activo: false }]) {
      const r2 = buildRepo({ findByName: vi.fn().mockResolvedValue(existente) });
      const r = await new VehiculoService(r2).crear({ name: "moto" }, SUPERADMIN);
      expect(r.status).toBe("conflict");
      expect(r2.create).not.toHaveBeenCalled();
    }
  });
});

describe("renombrar (R5, R10, R12)", () => {
  it("R5: el superadmin renombra con el nombre nuevo", async () => {
    const r = await service.renombrar({ id: MOTO.id, name: "Motocicleta" }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", vehiculo: { id: MOTO.id, name: "Motocicleta", activo: true } });
    expect(repo.rename).toHaveBeenCalledWith(MOTO.id, "Motocicleta", SUPERADMIN.usuarioId);
  });

  it("R5/R21: renombrar a su propio nombre es ok sin escribir", async () => {
    const r = await service.renombrar({ id: MOTO.id, name: MOTO.name }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", vehiculo: MOTO });
    for (const fn of escrituras(repo)) expect(fn).not.toHaveBeenCalled();
  });

  it("R10: al nombre de otro tipo es conflict sin escribir", async () => {
    repo = buildRepo({ findByName: vi.fn().mockResolvedValue({ id: "veh-1", name: "camion", activo: false }) });
    const r = await new VehiculoService(repo).renombrar({ id: MOTO.id, name: "camion" }, SUPERADMIN);
    expect(r.status).toBe("conflict");
    expect(repo.rename).not.toHaveBeenCalled();
  });

  it("R12: un id que no existe es not_found sin escribir", async () => {
    repo = buildRepo({ findById: vi.fn().mockResolvedValue(null) });
    const r = await new VehiculoService(repo).renombrar({ id: "nadie", name: "Moto" }, SUPERADMIN);
    expect(r.status).toBe("not_found");
    expect(repo.rename).not.toHaveBeenCalled();
  });

  it("R12: si la fila desaparece entre la lectura y la escritura, not_found", async () => {
    repo = buildRepo({ rename: vi.fn().mockResolvedValue(null) });
    const r = await new VehiculoService(repo).renombrar({ id: MOTO.id, name: "Otra" }, SUPERADMIN);
    expect(r.status).toBe("not_found");
  });
});

describe("cambiarActivacion (R6, R12)", () => {
  it("R6: el superadmin desactiva y activa", async () => {
    const off = await service.cambiarActivacion({ id: MOTO.id, activo: false }, SUPERADMIN);
    expect(off).toEqual({ status: "ok", vehiculo: { ...MOTO, activo: false } });
    expect(repo.setActivo).toHaveBeenCalledWith(MOTO.id, false, SUPERADMIN.usuarioId);

    repo = buildRepo({ findById: vi.fn().mockResolvedValue({ ...MOTO, activo: false }) });
    const on = await new VehiculoService(repo).cambiarActivacion({ id: MOTO.id, activo: true }, SUPERADMIN);
    expect(on).toEqual({ status: "ok", vehiculo: MOTO });
  });

  it("R6/R21: pedir el estado que ya tiene es ok sin escribir", async () => {
    const r = await service.cambiarActivacion({ id: MOTO.id, activo: true }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", vehiculo: MOTO });
    for (const fn of escrituras(repo)) expect(fn).not.toHaveBeenCalled();
  });

  it("R12: un id que no existe es not_found sin escribir", async () => {
    repo = buildRepo({ findById: vi.fn().mockResolvedValue(null) });
    const r = await new VehiculoService(repo).cambiarActivacion({ id: "nadie", activo: false }, SUPERADMIN);
    expect(r.status).toBe("not_found");
    expect(repo.setActivo).not.toHaveBeenCalled();
  });
});

describe("R14 — un rol de empresa no gestiona el catalogo", () => {
  it("cada rol de empresa (maestro incluido) recibe forbidden en las tres escrituras sin tocar el repo", async () => {
    expect(ROLES_DE_EMPRESA.map((a) => a.rol)).toContain("maestro");
    for (const actor of NO_GESTION) {
      expect((await service.crear({ name: "Nuevo" }, actor)).status, actor.rol).toBe("forbidden");
      expect((await service.renombrar({ id: MOTO.id, name: "Nuevo" }, actor)).status, actor.rol).toBe("forbidden");
      expect((await service.cambiarActivacion({ id: MOTO.id, activo: false }, actor)).status, actor.rol).toBe(
        "forbidden",
      );
    }
    for (const fn of [repo.findById, repo.findByName, repo.findMany, ...escrituras(repo)]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("R20 — el servicio no escribe en historial_accion", () => {
  it("las escrituras solo pasan por el repositorio del catalogo: el contrato no tiene ningun otro escritor", async () => {
    await service.crear({ name: "Nuevo" }, SUPERADMIN);
    await service.renombrar({ id: MOTO.id, name: "Otro" }, SUPERADMIN);
    await service.cambiarActivacion({ id: MOTO.id, activo: false }, SUPERADMIN);
    // El servicio recibe un unico colaborador; su contrato no expone nada de `historial_accion`.
    expect(Object.keys(repo).sort()).toEqual(
      ["create", "findById", "findByName", "findMany", "rename", "setActivo"].sort(),
    );
  });

  it("ni el servicio ni el repositorio importan el registro de historial_accion", async () => {
    const fs = await import("node:fs");
    for (const archivo of ["lib/services/VehiculoService.ts", "lib/repositories/VehiculoRepository.ts"]) {
      const fuente = fs.readFileSync(archivo, "utf8");
      expect(fuente, archivo).not.toMatch(/appendAccion\b|historialAccion|registrar-accion-plataforma/);
    }
  });
});
