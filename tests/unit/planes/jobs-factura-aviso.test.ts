import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { DestinatariosDelAviso } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";
import type { FacturaEmitidaContexto } from "@/lib/notificaciones/emitir";
import type { DepsAvisoFactura } from "@/lib/planes/jobs-factura-aviso";
import type { FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";

// SLT-136 · T5.5 (design §7.2; R22, R24, R25, R28, R30) — el trabajo `factura_plataforma_aviso`, sin correo
// (los pasos 1–4; el correo es la tanda 6). Con dobles: emite el aviso de la campanita una vez, en el orden
// de §7.2; no hace nada con una factura que ya no está o no está cerrada; termina sin maestros; un aviso que
// lanza falla el trabajo; y el tipo está registrado en la cola, de núcleo y no recurrente.

// Las deps del handler cableado: un doble que registra en qué contexto se usan. El resto del módulo es el real.
const registro: { paso: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
let depsCableadas: DepsAvisoFactura | null = null;

vi.mock("@/lib/planes/jobs-factura-aviso", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planes/jobs-factura-aviso")>();
  return {
    ...real,
    buildDepsAvisoFactura: () => depsCableadas ?? real.buildDepsAvisoFactura(),
  };
});

const { buildHandlers, buildRecurrencias, RECURRENTES_DE_PLATAFORMA } = await import("@/app/api/cron/procesar-jobs/route");
const { crearFacturaAvisoHandler, facturaDelPayload } = await import("@/lib/planes/jobs-factura-aviso");

const AHORA = new Date("2026-12-01T06:20:00.000Z");
const ORG = "org-a";
const ID = "f0000000-0000-4000-8000-000000000001";

function job(extra: Partial<JobDTO> & { organizacionId?: string | null } = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "factura_plataforma_aviso",
    payload: { facturaId: ID },
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: `factura_plataforma_aviso:${ID}`,
    createdAt: AHORA,
    updatedAt: AHORA,
    organizacionId: ORG,
    ...extra,
  } as JobDTO;
}

function factura(over: Partial<FacturaPlataformaDTO> = {}): FacturaPlataformaDTO {
  return {
    id: ID,
    estado: "cerrada",
    numero: 2,
    desde: new Date("2026-11-16T06:00:00.000Z"),
    hasta: new Date("2026-12-01T06:00:00.000Z"),
    hastaPrevisto: false,
    periodicidad: "quincenal",
    plan: null,
    cargos: "600.00",
    reversos: "300.00",
    movimientos: 3,
    totalOrdenes: "300.00",
    cuota: null,
    primeraCuota: null,
    total: "300.00",
    cerradaAt: new Date("2026-12-01T06:10:00.000Z"),
    ...over,
  };
}

const DOS_MAESTROS: DestinatariosDelAviso = {
  empresaNombre: "Tienda Uno",
  maestros: [
    { email: "a@uno.test", nombre: "Ana" },
    { email: "b@uno.test", nombre: "Beto" },
  ],
};

interface Dobles {
  deps: DepsAvisoFactura;
  pasos: string[];
  avisos: FacturaEmitidaContexto[];
  consultas: [string, string | null][];
}

function dobles(o: {
  facturas?: FacturaPlataformaDTO[];
  destino?: DestinatariosDelAviso | null;
  emitir?: (ctx: FacturaEmitidaContexto) => Promise<number>;
} = {}): Dobles {
  const pasos: string[] = [];
  const avisos: FacturaEmitidaContexto[] = [];
  const consultas: [string, string | null][] = [];
  const deps: DepsAvisoFactura = {
    facturas: {
      deLaEmpresa: async () => {
        pasos.push("leer factura");
        registro.push({ paso: "deLaEmpresa", contexto: contextoActual(), args: [] });
        return o.facturas ?? [factura()];
      },
    },
    destinatarios: {
      destinatariosDelAviso: async (org, cambio) => {
        pasos.push("leer maestros");
        consultas.push([org, cambio]);
        return o.destino === undefined ? DOS_MAESTROS : o.destino;
      },
    },
    emitirAviso: async (ctx) => {
      pasos.push("aviso");
      avisos.push(ctx);
      return o.emitir ? o.emitir(ctx) : 1;
    },
  };
  return { deps, pasos, avisos, consultas };
}

describe("SLT-136/R22 — el trabajo avisa una vez, en el orden de §7.2", () => {
  it("⭑ lee la factura, crea el aviso con su número y su período y después lee los maestros activos de la empresa", async () => {
    const d = dobles();
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros"]);
    expect(d.avisos).toEqual([
      {
        facturaId: ID,
        numero: 2,
        desde: new Date("2026-11-16T06:00:00.000Z"),
        hasta: new Date("2026-12-01T06:00:00.000Z"),
      },
    ]);
    // R24: los destinatarios son los maestros de ESA empresa, sin cambio pendiente (null).
    expect(d.consultas).toEqual([[ORG, null]]);
  });

  it("⭑ R22: un aviso que lanza falla el trabajo antes de leer los destinatarios (se reintenta)", async () => {
    const d = dobles({ emitir: async () => Promise.reject(new Error("base caida")) });
    await expect(crearFacturaAvisoHandler(() => d.deps)(job())).rejects.toThrow("base caida");
    expect(d.pasos).toEqual(["leer factura", "aviso"]);
  });

  it("R22: el reintento vuelve a pedir el aviso; la dedupe por factura del emisor lo absorbe (0 filas) sin fallar", async () => {
    let veces = 0;
    const d = dobles({ emitir: async () => (veces++ === 0 ? 1 : 0) });
    const handler = crearFacturaAvisoHandler(() => d.deps);
    await handler(job());
    await handler(job());
    expect(d.avisos.map((a) => a.facturaId)).toEqual([ID, ID]);
  });
});

describe("SLT-136/R25 — una factura de ₡0 avisa igual", () => {
  it("⭑ con total 0 y sin movimientos, el aviso sale por el mismo camino", async () => {
    const d = dobles({
      facturas: [factura({ cargos: "0.00", reversos: "0.00", movimientos: 0, totalOrdenes: "0.00", total: "0.00" })],
    });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros"]);
    expect(d.avisos).toHaveLength(1);
  });
});

describe("SLT-136/R28 — sin maestros o sin factura", () => {
  it("⭑ sin maestros activos: crea el aviso y termina sin fallar", async () => {
    const d = dobles({ destino: { empresaNombre: "Tienda Uno", maestros: [] } });
    await expect(crearFacturaAvisoHandler(() => d.deps)(job())).resolves.toBeUndefined();
    expect(d.avisos).toHaveLength(1);
  });

  it("sin destinatarios (la empresa ya no se lee): crea el aviso y termina", async () => {
    const d = dobles({ destino: null });
    await expect(crearFacturaAvisoHandler(() => d.deps)(job())).resolves.toBeUndefined();
    expect(d.avisos).toHaveLength(1);
  });

  it("⭑ la factura ya no existe: termina sin avisar ni leer maestros", async () => {
    const d = dobles({ facturas: [factura({ id: "otra" })] });
    await crearFacturaAvisoHandler(() => d.deps)(job());
    expect(d.pasos).toEqual(["leer factura"]);
    expect(d.avisos).toEqual([]);
  });

  it("una factura que no está cerrada (en curso o por cerrar) no avisa", async () => {
    for (const estado of ["en_curso", "por_cerrar"] as const) {
      const d = dobles({ facturas: [factura({ estado, numero: null })] });
      await crearFacturaAvisoHandler(() => d.deps)(job());
      expect(d.avisos, estado).toEqual([]);
    }
  });
});

describe("SLT-136 — bordes del trabajo", () => {
  it("un payload sin el id de la factura falla con su motivo", async () => {
    const d = dobles();
    await expect(crearFacturaAvisoHandler(() => d.deps)(job({ payload: {} }))).rejects.toThrow(
      "factura_plataforma_aviso: el payload no trae el id de la factura",
    );
    expect(() => facturaDelPayload({ payload: { facturaId: "" } })).toThrow();
    expect(d.pasos).toEqual([]);
  });

  it("un trabajo sin empresa falla sin leer nada", async () => {
    const d = dobles();
    await expect(crearFacturaAvisoHandler(() => d.deps)(job({ organizacionId: null }))).rejects.toThrow(
      "factura_plataforma_aviso: el trabajo no tiene empresa",
    );
    expect(d.pasos).toEqual([]);
  });

  it("R24: el manejador no envía nada a otro rol: solo usa el emisor del maestro y los maestros", () => {
    const fuente = readFileSync(path.join(__dirname, "..", "..", "..", "lib", "planes", "jobs-factura-aviso.ts"), "utf8");
    expect(fuente).not.toMatch(/"admin"|"superadmin"|destinatariosAlerta/);
  });
});

describe("SLT-136/R30 — en la cola: con manejador, de núcleo y no recurrente", () => {
  it("⭑ `buildHandlers` lo registra y no es recurrente ni de plataforma", () => {
    expect(buildHandlers(() => AHORA).has("factura_plataforma_aviso")).toBe(true);
    expect(buildRecurrencias().has("factura_plataforma_aviso")).toBe(false);
    expect(RECURRENTES_DE_PLATAFORMA.has("factura_plataforma_aviso")).toBe(false);
  });

  it("⭑ es de núcleo: ningún módulo apagado lo descarta", () => {
    expect(MODULO_POR_JOB.factura_plataforma_aviso).toBe("nucleo");
  });

  it("⭑ el handler cableado corre en la empresa del trabajo (`conSuEmpresa`)", async () => {
    const d = dobles();
    depsCableadas = d.deps;
    registro.length = 0;
    try {
      await buildHandlers(() => AHORA).get("factura_plataforma_aviso")!(job());
      expect(d.pasos).toEqual(["leer factura", "aviso", "leer maestros"]);
      expect(registro[0]?.contexto).toMatchObject({ organizacionId: ORG });
    } finally {
      depsCableadas = null;
    }
  });
});
