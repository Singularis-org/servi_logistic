import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import type { EnqueueOpts, IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";

// SLT-118 · T6.4 (design §4; R3, R12, R25) — el trabajo que cierra las facturas de la plataforma: su
// registro en la cola, la recurrencia horaria a los :10, la siembra y el handler. El SQL del cierre (qué
// cierra, con qué cifras y cuándo espera) lo prueba `tests/integration/db/factura-plataforma-cierre.test.ts`;
// aquí, con un doble del repositorio, que el handler recorre todas las empresas con un solo «ahora», que un
// fallo de una no frena a las demás y que no hace nada más que cerrar.

// El repositorio del handler cableado: un doble que registra en qué contexto lo llaman. El resto del módulo
// es el real (`importOriginal`).
const llamadas: { metodo: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
const dobleCableado: Pick<IFacturaPlataformaRepository, "empresasACerrar" | "cerrar"> = {
  empresasACerrar: async () => {
    llamadas.push({ metodo: "empresasACerrar", contexto: contextoActual(), args: [] });
    return ["org-a", "org-b"];
  },
  cerrar: async (...args) => {
    llamadas.push({ metodo: "cerrar", contexto: contextoActual(), args });
    return 1;
  },
};
let usarDoble = false;

vi.mock("@/lib/planes/jobs-factura-plataforma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planes/jobs-factura-plataforma")>();
  return {
    ...real,
    buildFacturaPlataformaRepositoryDeJobs: () =>
      usarDoble ? (dobleCableado as IFacturaPlataformaRepository) : real.buildFacturaPlataformaRepositoryDeJobs(),
  };
});

const { buildHandlers, buildRecurrencias, RECURRENTES_DE_PLATAFORMA } = await import("@/app/api/cron/procesar-jobs/route");
const { SIEMBRAS_RECURRENTES } = await import("@/scripts/siembra-jobs-recurrentes");
const {
  DEDUPE_PREFIX_CIERRE_FACTURAS,
  crearCierreFacturasHandler,
  dedupeKeyCierreFacturas,
  proximaCorridaCierreFacturas,
  recurrenciaCierreFacturas,
  sembrarCierreFacturas,
} = await import("@/lib/planes/jobs-factura-plataforma");

const AHORA = new Date("2026-11-16T06:10:00.000Z");

function job(extra: Partial<JobDTO> = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "factura_plataforma_cerrar",
    payload: {},
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    ...extra,
  } as JobDTO;
}

/** Un repositorio que solo sabe cerrar: cualquier otro acceso (avisos, correos, escrituras) lanzaría. */
function repo(
  empresas: string[],
  cerrar: IFacturaPlataformaRepository["cerrar"] = async () => 1,
): Pick<IFacturaPlataformaRepository, "empresasACerrar" | "cerrar"> & { cerrar: ReturnType<typeof vi.fn> } {
  return { empresasACerrar: vi.fn(async () => empresas), cerrar: vi.fn(cerrar) };
}

describe("SLT-118 — el handler del cierre de facturas (R3, R12)", () => {
  it("R3: sin que nadie lo pida, cierra CADA empresa con el mismo «ahora» del reloj de la cola", async () => {
    const r = repo(["org-a", "org-b", "org-c"]);
    let relojes = 0;
    const handler = crearCierreFacturasHandler(r, () => {
      relojes += 1;
      return AHORA;
    });
    await handler(job());
    expect(r.cerrar.mock.calls).toEqual([
      ["org-a", AHORA],
      ["org-b", AHORA],
      ["org-c", AHORA],
    ]);
    // Un solo «ahora» para toda la corrida: dos empresas no cierran con relojes distintos.
    expect(relojes).toBe(1);
  });

  it("R3: sin empresas, la corrida termina bien sin cerrar nada", async () => {
    const r = repo([]);
    await expect(crearCierreFacturasHandler(r, () => AHORA)(job())).resolves.toBeUndefined();
    expect(r.cerrar).not.toHaveBeenCalled();
  });

  it("R3: una empresa sin nada vencido (o en espera de un cambio, R39) devuelve 0 y no es un fallo", async () => {
    const r = repo(["org-a", "org-b"], async () => 0);
    await expect(crearCierreFacturasHandler(r, () => AHORA)(job())).resolves.toBeUndefined();
    expect(r.cerrar).toHaveBeenCalledTimes(2);
  });

  it("R12: si una empresa falla, cierra las demás y DESPUÉS falla nombrándola, para que la cola reintente", async () => {
    const r = repo(["org-a", "org-b", "org-c", "org-d"], async (organizacionId) => {
      if (organizacionId === "org-b" || organizacionId === "org-d") throw new Error("roto");
      return 1;
    });
    await expect(crearCierreFacturasHandler(r, () => AHORA)(job())).rejects.toThrow(
      /fallo al cerrar 2 empresa\(s\): org-b, org-d/,
    );
    // Cada empresa una sola vez y en su orden: las que cerraron bien no se repiten en esta corrida.
    expect(r.cerrar.mock.calls.map((c) => c[0])).toEqual(["org-a", "org-b", "org-c", "org-d"]);
  });

  it("R12: un fallo al listar las empresas falla la corrida sin cerrar ninguna", async () => {
    const r = repo([]);
    r.empresasACerrar = vi.fn(async () => {
      throw new Error("base caída");
    });
    await expect(crearCierreFacturasHandler(r, () => AHORA)(job())).rejects.toThrow(/base caída/);
    expect(r.cerrar).not.toHaveBeenCalled();
  });
});

describe("SLT-118 — registro y recurrencia del cierre de facturas (R25)", () => {
  it("R25: tiene handler, es RECURRENTE y corre UNA vez en plataforma, no una por empresa", () => {
    expect(buildHandlers(() => AHORA).has("factura_plataforma_cerrar")).toBe(true);
    expect(buildRecurrencias().get("factura_plataforma_cerrar")).toBe(recurrenciaCierreFacturas);
    expect(RECURRENTES_DE_PLATAFORMA.has("factura_plataforma_cerrar")).toBe(true);
  });

  it("R25: es de núcleo de la cola: ningún módulo apagado lo descarta", () => {
    expect(MODULO_POR_JOB.factura_plataforma_cerrar).toBe("nucleo");
  });

  it("R25: el handler cableado recorre todas las empresas en plataforma con el reloj del drenador", async () => {
    usarDoble = true;
    llamadas.length = 0;
    try {
      await buildHandlers(() => AHORA).get("factura_plataforma_cerrar")!(job({ organizacionId: null } as Partial<JobDTO>));
      expect(llamadas.map((l) => [l.metodo, l.args])).toEqual([
        ["empresasACerrar", []],
        ["cerrar", ["org-a", AHORA]],
        ["cerrar", ["org-b", AHORA]],
      ]);
      for (const l of llamadas) expect(l.contexto).toMatchObject({ tipo: "plataforma" });
    } finally {
      usarDoble = false;
    }
  });

  it.each([
    { caso: "a las :05 → a las :10 de esa hora", ahora: "2026-11-16T06:05:00.000Z", corrida: "2026-11-16T06:10:00.000Z" },
    { caso: "justo a las :10 → a las :10 de la hora siguiente", ahora: "2026-11-16T06:10:00.000Z", corrida: "2026-11-16T07:10:00.000Z" },
    { caso: "a las :10 y 1 ms → la hora siguiente", ahora: "2026-11-16T06:10:00.001Z", corrida: "2026-11-16T07:10:00.000Z" },
    { caso: "a las 23:59 UTC → las 00:10 del día siguiente", ahora: "2026-11-30T23:59:00.000Z", corrida: "2026-12-01T00:10:00.000Z" },
  ])("R25: cada hora a los 10 minutos — $caso", ({ ahora, corrida }) => {
    expect(proximaCorridaCierreFacturas(new Date(ahora)).toISOString()).toBe(corrida);
    const { runAfter, dedupeKey } = recurrenciaCierreFacturas.siguiente(new Date(ahora), []);
    expect(runAfter.toISOString()).toBe(corrida);
    expect(dedupeKey).toBe(`factura_plataforma_cerrar:${corrida.slice(0, 13)}`);
    expect(dedupeKeyCierreFacturas(runAfter)).toBe(dedupeKey);
  });

  it("R25: la recurrencia ignora las zonas de la cola (es de plataforma)", () => {
    const sin = recurrenciaCierreFacturas.siguiente(AHORA, []);
    const con = recurrenciaCierreFacturas.siguiente(AHORA, ["America/Costa_Rica", "America/Bogota"]);
    expect(con).toEqual(sin);
  });

  it("R25: el despliegue siembra la primera corrida con la MISMA dedupe_key que la recurrencia", async () => {
    const encolados: { tipo: string; payload: Record<string, unknown>; opts?: EnqueueOpts }[] = [];
    const jobs = {
      enqueue: async (tipo: string, payload: Record<string, unknown>, opts?: EnqueueOpts) => {
        encolados.push({ tipo, payload, opts });
        return null;
      },
    } as unknown as IJobRepository;
    await sembrarCierreFacturas(jobs, new Date("2026-11-11T15:47:00.000Z"));
    expect(encolados).toEqual([
      {
        tipo: DEDUPE_PREFIX_CIERRE_FACTURAS,
        payload: {},
        opts: { runAfter: new Date("2026-11-11T16:10:00.000Z"), dedupeKey: "factura_plataforma_cerrar:2026-11-11T16" },
      },
    ]);
    expect(DEDUPE_PREFIX_CIERRE_FACTURAS).toBe("factura_plataforma_cerrar");
    // Y el inventario de siembras del despliegue lo registra con ese sembrador.
    const siembra = SIEMBRAS_RECURRENTES.find((s) => s.tipo === "factura_plataforma_cerrar");
    expect(siembra?.sembrar).toBe(sembrarCierreFacturas);
    expect(siembra?.script).toBe("lib/planes/jobs-factura-plataforma.ts");
  });

  it("R25: el cierre no envía correos ni avisos: su módulo no importa ningún emisor", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../../../lib/planes/jobs-factura-plataforma.ts"), "utf8");
    const importaciones = [...fuente.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(importaciones.length).toBeGreaterThan(0);
    expect(importaciones.filter((i) => /correo|email|mail|notific|aviso|push|whatsapp/i.test(i))).toEqual([]);
  });
});
