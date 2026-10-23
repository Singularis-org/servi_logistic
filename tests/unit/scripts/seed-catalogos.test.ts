import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedRoles } from "@/scripts/seed-catalogos";

// Tests de la logica de seed sin DB real: se inyecta un FAKE in-memory del
// cliente Prisma que replica la semantica del upsert por `value` (indice unico
// `rol_value_key`). El fake modela ademas la traduccion que Prisma aplica al
// escribir en Postgres: el miembro del enum `adminTienda` se persiste como el
// label real 'Admin Tienda' (declarado con @map en db/schema.prisma), de modo
// que la grafia almacenada coincide con lo que devolveria `SELECT value FROM
// rol` (R8). La verificacion contra Postgres real queda DIFERIDA (sin DB).

// Mapa nombre-de-miembro-Prisma -> label real del enum en la DB.
// Feature 19: adminSatelite es identidad (sin @map): el nombre del miembro y
// el label DB coinciden.
// Feature 81 [D1]: apiKey tambien es identidad (sin @map). El seed lo crea porque
// ROLES_SEED = Object.values(RolValue); su rol queda SIN filas en `rol_permiso`
// (fallo seguro), cosa que este archivo ya cubre en "no toca otras tablas (R12)".
const DB_LABEL: Record<string, string> = {
  maestro: "maestro",
  admin: "admin",
  mensajero: "mensajero",
  adminTienda: "Admin Tienda",
  adminSatelite: "adminSatelite",
  apiKey: "apiKey",
  // SL-32 (R1): identidad (sin @map). La fila la siembra antes la migracion con un `id` fijo.
  superadmin: "superadmin",
};

interface RolRow {
  id: string;
  value: string;
}

function createFakeRol() {
  // Map keyeado por el valor que Prisma recibe en `where.value` (nombre del
  // miembro del enum); el `value` de la fila guarda el label real de la DB.
  const rows = new Map<string, RolRow>();
  let idSeq = 0;
  const upsert = vi.fn(
    async (args: {
      where: { value: string };
      update: Record<string, unknown>;
      create: { value: string };
    }): Promise<RolRow> => {
      const key = args.where.value;
      const existing = rows.get(key);
      if (existing) {
        // update no-op: conserva la fila y su id (R9).
        return existing;
      }
      const row: RolRow = {
        id: `rol-${++idSeq}`,
        value: DB_LABEL[args.create.value] ?? args.create.value,
      };
      rows.set(key, row);
      return row;
    }
  );
  return { rows, upsert };
}

describe("seedRoles crea los siete roles con grafia exacta (R8, R7; SL-32 R1)", () => {
  it("persiste una fila por cada valor del enum con el label real de la DB", async () => {
    const fake = createFakeRol();
    await seedRoles({ rol: { upsert: fake.upsert } } as unknown as Pick<
      PrismaClient,
      "rol"
    >);

    const valores = [...fake.rows.values()].map((r) => r.value).sort();
    expect(valores).toEqual(
      // Feature 81 [D1]: 6.º rol `apiKey` (sin @map, label DB = slug camelCase).
      ["Admin Tienda", "admin", "adminSatelite", "maestro", "mensajero", "apiKey", "superadmin"].sort()
    );
  });

  it("incluye una fila con value = 'adminSatelite' (R7)", async () => {
    const fake = createFakeRol();
    await seedRoles({ rol: { upsert: fake.upsert } } as unknown as Pick<
      PrismaClient,
      "rol"
    >);
    const valores = [...fake.rows.values()].map((r) => r.value);
    expect(valores).toContain("adminSatelite");
  });
});

describe("seedRoles es idempotente (R9, R10)", () => {
  it("dos ejecuciones dejan exactamente 7 filas, sin duplicados y con id estable", async () => {
    const fake = createFakeRol();
    const client = { rol: { upsert: fake.upsert } } as unknown as Pick<
      PrismaClient,
      "rol"
    >;

    await seedRoles(client);
    expect(fake.rows.size).toBe(7);
    const idsPrimera = new Map(
      [...fake.rows.entries()].map(([k, v]) => [k, v.id])
    );

    await seedRoles(client);
    expect(fake.rows.size).toBe(7); // no crecen (R10)

    for (const [k, v] of fake.rows.entries()) {
      expect(v.id).toBe(idsPrimera.get(k)); // id estable (R9)
    }
  });
});

// SL-32 (R1, R27): la migracion 20261023100100_seed_rol_superadmin siembra `superadmin` con un `id`
// fijo, y el indice de un solo superadmin y el CHECK de empresa filtran por ese literal. Si
// `seedRoles` lo reemplazara, ambos quedarian protegiendo un `id` que no tiene nadie.
describe("seedRoles conserva el id fijo de superadmin que sembro la migracion (SL-32 R1, R27)", () => {
  it("con la fila ya creada, hace upsert por value sin tocarla y el id sigue siendo el de la migracion", async () => {
    const fake = createFakeRol();
    const ID_DE_LA_MIGRACION = "e070603f-a477-466f-8bc1-92fcfaceb6f4";
    fake.rows.set("superadmin", { id: ID_DE_LA_MIGRACION, value: "superadmin" });

    await seedRoles({ rol: { upsert: fake.upsert } } as unknown as Pick<PrismaClient, "rol">);

    expect(fake.upsert).toHaveBeenCalledWith({
      where: { value: "superadmin" },
      update: {},
      create: { value: "superadmin" },
    });
    expect(fake.rows.get("superadmin")).toEqual({ id: ID_DE_LA_MIGRACION, value: "superadmin" });
  });
});

describe("seedRoles NO siembra 'usuario' (R11)", () => {
  it("tras el seed no existe ninguna fila con value 'usuario'", async () => {
    const fake = createFakeRol();
    await seedRoles({ rol: { upsert: fake.upsert } } as unknown as Pick<
      PrismaClient,
      "rol"
    >);

    const valores = [...fake.rows.values()].map((r) => r.value);
    expect(valores).not.toContain("usuario");
    expect(fake.rows.has("usuario")).toBe(false);
  });
});

describe("seedRoles no toca otras tablas (R12)", () => {
  it("solo usa prisma.rol.upsert; usuario/tipo_identificacion/permiso/rol_permiso intactos", async () => {
    const fake = createFakeRol();
    const otras = {
      tipoIdentificacion: { upsert: vi.fn() },
      usuario: { upsert: vi.fn(), create: vi.fn(), delete: vi.fn() },
      permiso: { upsert: vi.fn(), create: vi.fn() },
      rolPermiso: { upsert: vi.fn(), create: vi.fn() },
    };
    const client = {
      rol: { upsert: fake.upsert },
      ...otras,
    } as unknown as Pick<PrismaClient, "rol">;

    await seedRoles(client);

    // Feature 81 [D1] y SL-32: 7 upserts (un rol por miembro del enum). `rolPermiso` sigue intacto: la key nace
    // SIN permisos y solo el humano puede concederselos explicitamente.
    expect(fake.upsert).toHaveBeenCalledTimes(7);
    expect(otras.tipoIdentificacion.upsert).not.toHaveBeenCalled();
    expect(otras.usuario.upsert).not.toHaveBeenCalled();
    expect(otras.usuario.create).not.toHaveBeenCalled();
    expect(otras.usuario.delete).not.toHaveBeenCalled();
    expect(otras.permiso.upsert).not.toHaveBeenCalled();
    expect(otras.permiso.create).not.toHaveBeenCalled();
    expect(otras.rolPermiso.upsert).not.toHaveBeenCalled();
    expect(otras.rolPermiso.create).not.toHaveBeenCalled();
  });
});

describe("seedRoles propaga el fallo de upsert (R14)", () => {
  it("si un upsert rechaza, seedRoles rechaza (habilita process.exit(1) en main)", async () => {
    const failing = {
      rol: {
        upsert: vi.fn(async () => {
          throw new Error("conexion caida");
        }),
      },
    } as unknown as Pick<PrismaClient, "rol">;

    await expect(seedRoles(failing)).rejects.toThrow("conexion caida");
  });
});
