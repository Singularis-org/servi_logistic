import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

import { UsuarioService } from "@/lib/services/UsuarioService";
import type { IUserRepository, UsuarioPublico } from "@/lib/interfaces/repositories/IUserRepository";
import type { Actor, IUsuarioService } from "@/lib/interfaces/services/IUsuarioService";
import { cambiarEstadoUsuario } from "@/lib/actions/usuarios";

// SL-24 (R27, design §6.3) — `UsuarioService` traduce el rechazo del trigger de `usuario` (SQLSTATE
// SL024) a su resultado: `fieldErrors.rolId` al crear y al cambiar el rol, `tope_plan` al activar.
// Repositorio mockeado (sin base): que el trigger rechace de verdad por las cuatro vías lo prueba
// `tests/integration/db/plan-topes-usuarios.test.ts`.

vi.mock("@/lib/utils/password", () => ({
  hashPassword: vi.fn(async (plain: string) => `hash(${plain})`),
  verifyPassword: vi.fn(),
}));

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };

const TOPE_ROL = 'tope_plan {"rol": "adminTienda", "tope": "rol", "maximo": 3, "usados": 3, "pedidas": 1}';
const MENSAJE =
  "Tu plan permite 3 usuarios activos con el rol Admin de tienda. Ya tienes 3. Inactiva alguno o pide un cambio de plan.";

/** La forma con la que llega el error de una operación de modelo bajo `@prisma/adapter-pg`. */
function errorDelTrigger(mensaje = TOPE_ROL) {
  return Object.assign(new Error(mensaje), {
    name: "DriverAdapterError",
    cause: { kind: "postgres", code: "SL024", originalCode: "SL024", message: mensaje },
  });
}

/** La misma, desde SQL a mano (P2010): el SQLSTATE solo viaja en el texto. */
function errorDelTriggerP2010(mensaje = TOPE_ROL) {
  return new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`SL024\`. Message: \`${mensaje}\``, {
    code: "P2010",
    clientVersion: "7.8.0",
  });
}

function usuario(overrides: Partial<UsuarioPublico> = {}): UsuarioPublico {
  return {
    id: "usr-1",
    nombre: "Ana Torres",
    email: "ana@example.com",
    telefono: "099",
    estado: "inactivo",
    cedula: "1710034065",
    tipoIdentificacionId: "tipo-1",
    rolId: "rol-tienda",
    fulfillment: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function buildRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findById: vi.fn().mockResolvedValue(usuario()),
    create: vi.fn().mockResolvedValue(usuario({ estado: "activo" })),
    update: vi.fn().mockResolvedValue(usuario()),
    setEstado: vi.fn().mockResolvedValue(usuario({ estado: "activo" })),
    listRoles: vi.fn().mockResolvedValue([
      { id: "rol-tienda", value: "adminTienda" },
      { id: "rol-admin", value: "admin" },
    ]),
    ...overrides,
  } as unknown as IUserRepository;
}

const altaTienda = {
  nombre: "Ana Torres",
  email: "ana@example.com",
  telefono: "099",
  tipoIdentificacionId: "tipo-1",
  cedula: "1710034065",
  rolId: "rol-tienda",
  passwordMode: "manual" as const,
  password: "Abcdef1!",
};

let repo: IUserRepository;
let service: UsuarioService;

beforeEach(() => {
  vi.clearAllMocks();
  repo = buildRepo();
  service = new UsuarioService(repo);
});

describe("SL-24 R27 — UsuarioService.crear con el tope del rol lleno", () => {
  it("devuelve el mensaje bajo `rolId` (la clave del campo de rol en UsuarioForm)", async () => {
    repo = buildRepo({ create: vi.fn().mockRejectedValue(errorDelTrigger()) });
    service = new UsuarioService(repo);

    const r = await service.crear(altaTienda, MAESTRO);

    expect(r).toEqual({ status: "validation_error", fieldErrors: { rolId: [MENSAJE] } });
  });

  it("también desde SQL a mano (P2010)", async () => {
    repo = buildRepo({ create: vi.fn().mockRejectedValue(errorDelTriggerP2010()) });
    service = new UsuarioService(repo);

    expect(await service.crear(altaTienda, MAESTRO)).toEqual({
      status: "validation_error",
      fieldErrors: { rolId: [MENSAJE] },
    });
  });

  it("un error que no es del tope sigue saliendo tal cual (no se disfraza de tope)", async () => {
    const otro = new Error("conexion caida");
    repo = buildRepo({ create: vi.fn().mockRejectedValue(otro) });
    service = new UsuarioService(repo);

    await expect(service.crear(altaTienda, MAESTRO)).rejects.toBe(otro);
  });

  it("un SL024 sin el JSON del tope no es un tope: sale tal cual", async () => {
    const roto = errorDelTrigger("tope_plan sin json");
    repo = buildRepo({ create: vi.fn().mockRejectedValue(roto) });
    service = new UsuarioService(repo);

    await expect(service.crear(altaTienda, MAESTRO)).rejects.toBe(roto);
  });
});

describe("SL-24 R27 — UsuarioService.actualizar al cambiar a un rol con el tope lleno", () => {
  it("devuelve el mensaje bajo `rolId`", async () => {
    repo = buildRepo({
      findById: vi.fn().mockResolvedValue(usuario({ estado: "activo", rolId: "rol-admin" })),
      update: vi.fn().mockRejectedValue(errorDelTrigger()),
    });
    service = new UsuarioService(repo);

    const r = await service.actualizar("usr-1", { rolId: "rol-tienda" }, MAESTRO);

    expect(r).toEqual({ status: "validation_error", fieldErrors: { rolId: [MENSAJE] } });
  });
});

describe("SL-24 R27 — UsuarioService.cambiarEstado al activar con el tope lleno", () => {
  it("activar desde `inactivo` devuelve `tope_plan` con el mensaje", async () => {
    repo = buildRepo({ setEstado: vi.fn().mockRejectedValue(errorDelTrigger()) });
    service = new UsuarioService(repo);

    const r = await service.cambiarEstado("usr-1", { estado: "activo" }, MAESTRO);

    expect(r).toEqual({ status: "tope_plan", mensaje: MENSAJE });
  });

  it("activar desde `bloqueado` es un alta igual (decisión P4)", async () => {
    repo = buildRepo({
      findById: vi.fn().mockResolvedValue(usuario({ estado: "bloqueado" })),
      setEstado: vi.fn().mockRejectedValue(errorDelTrigger()),
    });
    service = new UsuarioService(repo);

    expect(await service.cambiarEstado("usr-1", { estado: "activo" }, MAESTRO)).toEqual({
      status: "tope_plan",
      mensaje: MENSAJE,
    });
  });

  it("un error que no es del tope sigue saliendo tal cual", async () => {
    const otro = new Error("conexion caida");
    repo = buildRepo({ setEstado: vi.fn().mockRejectedValue(otro) });
    service = new UsuarioService(repo);

    await expect(service.cambiarEstado("usr-1", { estado: "activo" }, MAESTRO)).rejects.toBe(otro);
  });

  it("sin tope el camino de siempre no cambia", async () => {
    const r = await service.cambiarEstado("usr-1", { estado: "activo" }, MAESTRO);
    expect(r.status).toBe("ok");
  });
});

describe("SL-24 R28 — la action entrega `tope_plan` a la pantalla sin transformarlo", () => {
  it("cambiarEstadoUsuario devuelve { status: 'tope_plan', mensaje }", async () => {
    repo = buildRepo({ setEstado: vi.fn().mockRejectedValue(errorDelTrigger()) });
    const usuarioService: IUsuarioService = new UsuarioService(repo);

    const r = await cambiarEstadoUsuario("usr-1", { estado: "activo" }, {
      usuarioService,
      getActor: async () => MAESTRO,
    });

    expect(r).toEqual({ status: "tope_plan", mensaje: MENSAJE });
  });
});
