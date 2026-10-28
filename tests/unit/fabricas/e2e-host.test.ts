import { afterEach, describe, expect, it, vi } from "vitest";

// SL-44 T3.1 (R10, R11, R12) — el guardián de host de la fábrica de los E2E y la forma de sus
// correos. Sin red: `pg` se sustituye por un doble que registra si alguien intentó conectar.

const conexiones = vi.hoisted(() => ({ abiertas: 0 }));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    // Lo que PrismaClient mira del adaptador al construirse; conectar, no lo hace hasta la 1.ª consulta.
    readonly provider = "postgres";
    readonly adapterName = "@prisma/adapter-pg";
    constructor() {
      conexiones.abiertas += 1;
    }
  },
}));

import { abrirBaseE2E, catalogosQueFaltan, correoE2E, validarUrlBaseE2E } from "@/tests/fabricas/e2e";
import { ORDER_STATUS_SEED } from "@/lib/types/order-status";
import { ROLES_SEED } from "@/lib/types/roles";
import { VEHICULOS_SEED } from "@/lib/types/vehiculos";

const URL_ORIGINAL = process.env.DATABASE_URL;
afterEach(() => {
  if (URL_ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = URL_ORIGINAL;
  conexiones.abiertas = 0;
});

describe("SL-44 · guardián de host de la base del E2E (R12)", () => {
  it("un host remoto inventado lanza antes de abrir conexión", () => {
    process.env.DATABASE_URL = "postgresql://u:password@db.remoto-inventado.example:5432/postgres";
    expect(() => abrirBaseE2E()).toThrow(/host distinto de localhost o 127\.0\.0\.1/);
    expect(conexiones.abiertas).toBe(0);
  });

  it("el mensaje no lleva la URL (lleva la contraseña)", () => {
    expect(() => validarUrlBaseE2E("postgresql://u:password@db.remoto-inventado.example/x")).toThrow(
      expect.objectContaining({ message: expect.not.stringMatching(/password|remoto-inventado/) }),
    );
  });

  it("un host local delante y uno remoto en `?host=` también lanza", () => {
    expect(() => validarUrlBaseE2E("postgresql://u:p@localhost:5432/x?host=db.remoto-inventado.example")).toThrow(
      /host distinto/,
    );
    expect(() => validarUrlBaseE2E("postgresql://u:p@127.0.0.1/x?hostaddr=10.0.0.9")).toThrow(/host distinto/);
  });

  it("un host que solo empieza por localhost lanza", () => {
    expect(() => validarUrlBaseE2E("postgresql://u:p@localhost.remoto-inventado.example/x")).toThrow(/host distinto/);
  });

  it("localhost y 127.0.0.1 se aceptan", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5444/sl44_e2e";
    expect(() => abrirBaseE2E()).not.toThrow();
    expect(conexiones.abiertas).toBe(1);
    expect(validarUrlBaseE2E("postgresql://u:p@127.0.0.1:5432/x")).toBe("postgresql://u:p@127.0.0.1:5432/x");
    expect(validarUrlBaseE2E("postgresql://u:p@LOCALHOST/x")).toBe("postgresql://u:p@LOCALHOST/x");
  });
});

describe("SL-44 · base del E2E ausente o sin catálogos (R11)", () => {
  it("sin DATABASE_URL lanza con un mensaje que lo dice", () => {
    delete process.env.DATABASE_URL;
    expect(() => abrirBaseE2E()).toThrow(/falta DATABASE_URL/);
    expect(() => validarUrlBaseE2E("  ")).toThrow(/falta DATABASE_URL/);
    expect(conexiones.abiertas).toBe(0);
  });

  it("una URL que no se puede leer lanza", () => {
    expect(() => validarUrlBaseE2E("no es una url")).toThrow(/no es una URL válida/);
  });

  const completos = {
    roles: [...ROLES_SEED],
    estatusDeOrden: [...ORDER_STATUS_SEED],
    vehiculos: [...VEHICULOS_SEED],
    tiposIdentificacion: ["cedula", "ruc", "pasaporte"],
    provincias: 7,
  };

  it("con todos los catálogos no falta nada", () => {
    expect(catalogosQueFaltan(completos)).toEqual([]);
  });

  it("nombra el catálogo y el valor que falta", () => {
    expect(catalogosQueFaltan({ ...completos, roles: completos.roles.filter((r) => r !== "mensajero") })).toEqual([
      "rol: mensajero",
    ]);
    expect(catalogosQueFaltan({ ...completos, estatusDeOrden: [] })[0]).toMatch(/^order_status: /);
    expect(catalogosQueFaltan({ ...completos, tiposIdentificacion: [] })).toEqual(["tipo_identificacion: cedula"]);
    expect(catalogosQueFaltan({ ...completos, vehiculos: [] })[0]).toMatch(/^vehiculo: /);
    expect(catalogosQueFaltan({ ...completos, provincias: 0 })).toEqual(["provincia: ninguna (¿base sin migrar?)"]);
  });
});

describe("SL-44 · correos de la corrida (R10)", () => {
  it("son @example.test, con el rol y un sufijo aleatorio", () => {
    expect(correoE2E("adminTienda")).toMatch(/^e2e-admintienda-[0-9a-f]{12}@example\.test$/);
    expect(correoE2E("mensajero")).toMatch(/^e2e-mensajero-[0-9a-f]{12}@example\.test$/);
  });

  it("dos llamadas dan correos distintos", () => {
    expect(correoE2E("maestro")).not.toBe(correoE2E("maestro"));
  });
});
