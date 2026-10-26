import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SL-43 (medición del build de QA, 2026-10-26) — los clientes de la demo nacen con tiempos de
// transacción de base lejana. Con los de Prisma (2 s esperando conexión, 5 s de vida), la carga
// masiva de la tienda con bodega cayó con P2028 a 160 ms por ida y vuelta. Sin abrir conexiones:
// Prisma no conecta hasta la primera consulta, y aquí los dos constructores son dobles.

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
    async $disconnect() {}
  },
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    connect() {
      throw new Error("este test no conecta");
    }
  },
}));

import { ENV_TX_MAX_WAIT_MS, ENV_TX_TIMEOUT_MS, getPrismaClient } from "@/lib/db/prisma-client";
import { conectarDemo, TRANSACCION_DE_LA_DEMO } from "@/scripts/demo-qa";

const VARIABLES = ["DATABASE_URL", "DB_POOL_MAX", ENV_TX_MAX_WAIT_MS, ENV_TX_TIMEOUT_MS] as const;

describe("conectarDemo — tiempos de transacción de la demo", () => {
  const guardado = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));

  beforeEach(() => {
    construidos.length = 0;
    globalThis.__prisma__ = undefined;
    for (const v of VARIABLES) delete process.env[v];
  });
  afterEach(() => {
    globalThis.__prisma__ = undefined;
    for (const v of VARIABLES) {
      if (guardado[v] === undefined) delete process.env[v];
      else process.env[v] = guardado[v];
    }
  });

  it("dan margen sobre los de Prisma (2 s y 5 s), que con 160 ms por ida y vuelta no alcanzan", () => {
    expect(TRANSACCION_DE_LA_DEMO.maxWait).toBeGreaterThan(2_000);
    expect(TRANSACCION_DE_LA_DEMO.timeout).toBeGreaterThan(5_000);
  });

  it("el dueño y el lector nacen con ellos", async () => {
    await conectarDemo({ DIRECT_URL: "postgresql://u:p@127.0.0.1:1/x" });
    expect(construidos).toHaveLength(2);
    for (const opciones of construidos) expect(opciones.transactionOptions).toEqual(TRANSACCION_DE_LA_DEMO);
  });

  it("el cliente de la app del proceso también, por su entorno, y solo después de conectar", async () => {
    await conectarDemo({ DIRECT_URL: "postgresql://u:p@127.0.0.1:1/x" });
    expect(process.env[ENV_TX_MAX_WAIT_MS]).toBe(String(TRANSACCION_DE_LA_DEMO.maxWait));
    expect(process.env[ENV_TX_TIMEOUT_MS]).toBe(String(TRANSACCION_DE_LA_DEMO.timeout));
    getPrismaClient();
    expect(construidos).toHaveLength(3);
    expect(construidos[2].transactionOptions).toEqual(TRANSACCION_DE_LA_DEMO);
  });
});
