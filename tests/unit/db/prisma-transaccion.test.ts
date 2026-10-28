import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SL-43 — los tiempos de transacción del cliente de la app, por entorno. La app no pone las
// variables: su cliente tiene que seguir naciendo con los de Prisma (2 s y 5 s). La demo de QA sí
// las pone en su proceso, y ahí el cliente tiene que recibirlas.

const construidos = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(opciones: Record<string, unknown>) {
      construidos.push(opciones);
    }
    $extends() {
      return this;
    }
    $on() {}
  },
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    connect() {
      throw new Error("este test no conecta");
    }
  },
}));

import { ENV_TX_MAX_WAIT_MS, ENV_TX_TIMEOUT_MS, getPrismaClient, opcionesDeTransaccion } from "@/lib/db/prisma-client";

const entorno = (vars: Record<string, string | undefined>) => vars as NodeJS.ProcessEnv;

describe("opcionesDeTransaccion", () => {
  it("sin las variables no fija nada: quedan los tiempos de Prisma", () => {
    expect(opcionesDeTransaccion(entorno({}))).toBeUndefined();
  });

  it("lee las dos variables, en milisegundos", () => {
    expect(opcionesDeTransaccion(entorno({ [ENV_TX_MAX_WAIT_MS]: "30000", [ENV_TX_TIMEOUT_MS]: "60000" }))).toEqual({
      maxWait: 30_000,
      timeout: 60_000,
    });
  });

  it("una sola variable fija solo esa", () => {
    expect(opcionesDeTransaccion(entorno({ [ENV_TX_TIMEOUT_MS]: "60000" }))).toEqual({ timeout: 60_000 });
  });

  it.each(["", "0", "-5", "abc", "5s", "1.5"])("«%s» no es un tiempo válido y se ignora", (valor) => {
    expect(opcionesDeTransaccion(entorno({ [ENV_TX_MAX_WAIT_MS]: valor, [ENV_TX_TIMEOUT_MS]: valor }))).toBeUndefined();
  });
});

describe("getPrismaClient — el cliente recibe los tiempos del entorno", () => {
  const guardado = { maxWait: process.env[ENV_TX_MAX_WAIT_MS], timeout: process.env[ENV_TX_TIMEOUT_MS] };

  beforeEach(() => {
    construidos.length = 0;
    globalThis.__prisma__ = undefined;
  });
  afterEach(() => {
    globalThis.__prisma__ = undefined;
    for (const [clave, valor] of [
      [ENV_TX_MAX_WAIT_MS, guardado.maxWait],
      [ENV_TX_TIMEOUT_MS, guardado.timeout],
    ] as const) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  });

  it("sin las variables (la app): `transactionOptions` vacío, como antes de SL-43", () => {
    delete process.env[ENV_TX_MAX_WAIT_MS];
    delete process.env[ENV_TX_TIMEOUT_MS];
    getPrismaClient();
    expect(construidos).toHaveLength(1);
    expect(construidos[0].transactionOptions).toBeUndefined();
  });

  it("con las variables (la demo de QA): el constructor las recibe", () => {
    process.env[ENV_TX_MAX_WAIT_MS] = "30000";
    process.env[ENV_TX_TIMEOUT_MS] = "60000";
    getPrismaClient();
    expect(construidos).toHaveLength(1);
    expect(construidos[0].transactionOptions).toEqual({ maxWait: 30_000, timeout: 60_000 });
  });
});
