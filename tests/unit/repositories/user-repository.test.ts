import { conRegistroDeAcciones } from "../../fixtures/registro-de-acciones";
import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { UserRepository } from "@/lib/repositories/UserRepository";
import {
  CatalogoInvalidoError,
  UsuarioDuplicadoError,
} from "@/lib/interfaces/repositories/IUserRepository";

type MockedUserPrisma = Pick<
  PrismaClient,
  "usuario" | "tipoIdentificacion" | "rol" | "$transaction" | "historialAccion"
>;

function buildMockPrisma(overrides: Partial<{
  usuarioFindUnique: ReturnType<typeof vi.fn>;
  usuarioCreate: ReturnType<typeof vi.fn>;
  tipoIdentificacionFindUnique: ReturnType<typeof vi.fn>;
  rolFindUnique: ReturnType<typeof vi.fn>;
}> = {}): MockedUserPrisma {
  // FICHA 362: el alta corre en `$transaction` y registra `usuario_creado` en ella.
  return conRegistroDeAcciones({
    usuario: {
      findUnique: overrides.usuarioFindUnique ?? vi.fn(),
      create: overrides.usuarioCreate ?? vi.fn(),
    },
    tipoIdentificacion: {
      findUnique: overrides.tipoIdentificacionFindUnique ?? vi.fn().mockResolvedValue({ id: "tipo-1", value: "cedula" }),
    },
    rol: {
      findUnique: overrides.rolFindUnique ?? vi.fn().mockResolvedValue({ id: "rol-1", value: "usuario" }),
    },
  }) as unknown as MockedUserPrisma;
}

const CREATE_INPUT = {
  nombre: "Ana Torres",
  email: "ana@example.com",
  telefono: "0991234567",
  passwordHash: "hash-simulado",
  cedula: "1710034065",
  tipoIdentificacionId: "tipo-1",
  rolId: "rol-1",
};

describe("UserRepository", () => {
  it("crea un usuario cuando los catalogos existen", async () => {
    const usuarioCreate = vi.fn().mockResolvedValue({
      id: "usr-1",
      nombre: CREATE_INPUT.nombre,
      email: CREATE_INPUT.email,
      telefono: CREATE_INPUT.telefono,
      estado: "pendiente",
      cedula: CREATE_INPUT.cedula,
      tipoIdentificacionId: CREATE_INPUT.tipoIdentificacionId,
      rolId: CREATE_INPUT.rolId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const prisma = buildMockPrisma({ usuarioCreate });
    const repo = new UserRepository(prisma);

    const usuario = await repo.create(CREATE_INPUT, "actor-1");

    expect(usuario.id).toBe("usr-1");
    expect(usuarioCreate).toHaveBeenCalledTimes(1);
    expect(usuario).not.toHaveProperty("passwordHash"); // R7
  });

  it("rechaza la creacion si tipo_identificacion_id no existe (R10)", async () => {
    const prisma = buildMockPrisma({
      tipoIdentificacionFindUnique: vi.fn().mockResolvedValue(null),
    });
    const repo = new UserRepository(prisma);

    await expect(repo.create(CREATE_INPUT, "actor-1")).rejects.toBeInstanceOf(CatalogoInvalidoError);
  });

  it("rechaza la creacion si rol_id no existe (R10)", async () => {
    const prisma = buildMockPrisma({
      rolFindUnique: vi.fn().mockResolvedValue(null),
    });
    const repo = new UserRepository(prisma);

    await expect(repo.create(CREATE_INPUT, "actor-1")).rejects.toBeInstanceOf(CatalogoInvalidoError);
  });

  it("traduce violacion de unicidad de email a UsuarioDuplicadoError (R4)", async () => {
    const usuarioCreate = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: { target: ["email"] },
      }),
    );
    const prisma = buildMockPrisma({ usuarioCreate });
    const repo = new UserRepository(prisma);

    const error = await repo.create(CREATE_INPUT, "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UsuarioDuplicadoError);
    expect((error as UsuarioDuplicadoError).campo).toBe("email");
  });

  it("traduce violacion de unicidad de cedula a UsuarioDuplicadoError (R5)", async () => {
    const usuarioCreate = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: { target: ["cedula"] },
      }),
    );
    const prisma = buildMockPrisma({ usuarioCreate });
    const repo = new UserRepository(prisma);

    const error = await repo.create(CREATE_INPUT, "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UsuarioDuplicadoError);
    expect((error as UsuarioDuplicadoError).campo).toBe("cedula");
  });

  // --- Fix P2002 driver adapter (PrismaPg): meta.target === undefined; el
  // nombre de la constraint vive en meta.driverAdapterError.cause.originalMessage.
  function p2002Adapter(constraint: string) {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.8.0",
      meta: {
        modelName: "Usuario",
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            originalCode: "23505",
            originalMessage: `llave duplicada viola restriccion de unicidad «${constraint}»`,
            kind: "UniqueConstraintViolation",
          },
        },
      },
    });
  }

  it("adapter: P2002 de email (sin meta.target) -> UsuarioDuplicadoError('email') (R4)", async () => {
    const usuarioCreate = vi.fn().mockRejectedValue(p2002Adapter("usuario_email_key"));
    const repo = new UserRepository(buildMockPrisma({ usuarioCreate }));

    const error = await repo.create(CREATE_INPUT, "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UsuarioDuplicadoError);
    expect((error as UsuarioDuplicadoError).campo).toBe("email");
  });

  it("adapter: P2002 de cedula (sin meta.target) -> UsuarioDuplicadoError('cedula') (R5)", async () => {
    const usuarioCreate = vi.fn().mockRejectedValue(p2002Adapter("usuario_cedula_key"));
    const repo = new UserRepository(buildMockPrisma({ usuarioCreate }));

    const error = await repo.create(CREATE_INPUT, "actor-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UsuarioDuplicadoError);
    expect((error as UsuarioDuplicadoError).campo).toBe("cedula");
  });

  it("P2002 de constraint desconocida -> re-lanza el error original (no traduce)", async () => {
    const original = p2002Adapter("usuario_otra_constraint_key");
    const usuarioCreate = vi.fn().mockRejectedValue(original);
    const repo = new UserRepository(buildMockPrisma({ usuarioCreate }));

    await expect(repo.create(CREATE_INPUT, "actor-1")).rejects.toBe(original);
  });

  // --- SL-18 T1.3 (design §3.1): las cuentas de un email, una por empresa mas la de plataforma.
  // Las filas llegan en un orden cualquiera a proposito: el orden lo fija el repositorio.
  function filaCuenta(id: string, empresa: string | null, passwordHash: string) {
    return {
      id,
      email: "ana@example.com",
      estado: "activo",
      organizacionId: empresa === null ? null : `org-${id}`,
      rol: { value: empresa === null ? "superadmin" : "maestro" },
      organizacion: empresa === null ? null : { nombre: empresa },
      passwordHash,
    };
  }

  const FILAS_DESORDENADAS = [
    filaCuenta("plat", null, "hash-plat"),
    filaCuenta("zeta", "Zeta Envios", "hash-zeta"),
    filaCuenta("alfa", "Álamo Logística", "hash-alfa"),
  ];

  it("SL-18: findCuentasPorEmailConHash busca por email sin empresa y expone el hash (unico metodo autorizado)", async () => {
    const usuarioFindMany = vi.fn().mockResolvedValue(FILAS_DESORDENADAS);
    const repo = new UserRepository(conRegistroDeAcciones({ usuario: { findMany: usuarioFindMany } }) as unknown as MockedUserPrisma);

    const cuentas = await repo.findCuentasPorEmailConHash("ana@example.com");

    const arg = usuarioFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ email: "ana@example.com" });
    expect(arg.select).toMatchObject({
      id: true,
      email: true,
      passwordHash: true,
      estado: true,
      organizacionId: true,
      rol: { select: { value: true } },
      organizacion: { select: { nombre: true } },
    });
    expect(cuentas.map((c) => c.passwordHash)).toEqual(["hash-alfa", "hash-zeta", "hash-plat"]);
  });

  it("SL-18: las cuentas salen ordenadas por nombre de empresa y la de plataforma (sin empresa) al final", async () => {
    const usuarioFindMany = vi.fn().mockResolvedValue(FILAS_DESORDENADAS);
    const repo = new UserRepository(conRegistroDeAcciones({ usuario: { findMany: usuarioFindMany } }) as unknown as MockedUserPrisma);

    const cuentas = await repo.findCuentasPorEmailConHash("ana@example.com");

    expect(cuentas.map((c) => [c.id, c.organizacionId, c.empresaNombre, c.rol])).toEqual([
      ["alfa", "org-alfa", "Álamo Logística", "maestro"],
      ["zeta", "org-zeta", "Zeta Envios", "maestro"],
      ["plat", null, null, "superadmin"],
    ]);
  });

  it("SL-18: findCuentasPorEmail no selecciona passwordHash (R7) y conserva el mismo orden", async () => {
    const usuarioFindMany = vi.fn().mockResolvedValue(
      FILAS_DESORDENADAS.map((fila) => {
        const resto: Partial<typeof fila> = { ...fila };
        delete resto.passwordHash;
        return resto;
      }),
    );
    const repo = new UserRepository(conRegistroDeAcciones({ usuario: { findMany: usuarioFindMany } }) as unknown as MockedUserPrisma);

    const cuentas = await repo.findCuentasPorEmail("ana@example.com");

    const arg = usuarioFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ email: "ana@example.com" });
    expect(arg.select).not.toHaveProperty("passwordHash");
    expect(cuentas.map((c) => c.id)).toEqual(["alfa", "zeta", "plat"]);
    for (const c of cuentas) expect(c).not.toHaveProperty("passwordHash");
  });

  it("SL-18: sin cuentas con ese email devuelve una lista vacia", async () => {
    const usuarioFindMany = vi.fn().mockResolvedValue([]);
    const repo = new UserRepository(conRegistroDeAcciones({ usuario: { findMany: usuarioFindMany } }) as unknown as MockedUserPrisma);

    expect(await repo.findCuentasPorEmail("nadie@example.com")).toEqual([]);
    expect(await repo.findCuentasPorEmailConHash("nadie@example.com")).toEqual([]);
  });
});
