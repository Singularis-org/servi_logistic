import { describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { INivelesEmpresaRepository } from "@/lib/interfaces/repositories/INivelesEmpresaRepository";
import type { EnqueueOpts, IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";

// SLT-215 · T7 (design §5; P1, R29, R30) — el trabajo diario que cierra los meses de los niveles por volumen: su
// registro en la cola, la recurrencia a las 06:20 UTC, la siembra y el handler. El SQL del cierre lo prueba
// `tests/integration/db/plan-nivel-cierre.test.ts`; aquí, con un doble del repositorio, que el handler recorre las
// empresas con meses pendientes con un solo «ahora» y que un fallo de una no frena a las demás.

// El repositorio del handler cableado: un doble que registra en qué contexto lo llaman. El resto del módulo es el
// real (`importOriginal`).
const llamadas: { metodo: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
const dobleCableado: INivelesEmpresaRepository = {
  empresasConMesPendiente: async (...args) => {
    llamadas.push({ metodo: "empresasConMesPendiente", contexto: contextoActual(), args });
    return ["org-a", "org-b"];
  },
  cerrarMeses: async (...args) => {
    llamadas.push({ metodo: "cerrarMeses", contexto: contextoActual(), args });
    return 1;
  },
};
let usarDoble = false;

vi.mock("@/lib/planes/jobs-niveles", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planes/jobs-niveles")>();
  return {
    ...real,
    buildNivelesEmpresaRepositoryDeJobs: () => (usarDoble ? dobleCableado : real.buildNivelesEmpresaRepositoryDeJobs()),
  };
});

const { buildHandlers, buildRecurrencias, RECURRENTES_DE_PLATAFORMA } = await import("@/app/api/cron/procesar-jobs/route");
const { SIEMBRAS_RECURRENTES } = await import("@/scripts/siembra-jobs-recurrentes");
const {
  DEDUPE_PREFIX_CIERRE_NIVELES,
  crearCierreNivelesHandler,
  dedupeKeyCierreNiveles,
  proximaCorridaCierreNiveles,
  recurrenciaCierreNiveles,
  sembrarCierreNiveles,
} = await import("@/lib/planes/jobs-niveles");

const AHORA = new Date("2026-12-01T06:20:00.000Z");

function job(extra: Partial<JobDTO> = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "plan_niveles_cerrar",
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

/** Un repositorio que solo sabe listar y cerrar. */
function repo(
  empresas: string[],
  cerrarMeses: INivelesEmpresaRepository["cerrarMeses"] = async () => 1,
): INivelesEmpresaRepository & { cerrarMeses: ReturnType<typeof vi.fn>; empresasConMesPendiente: ReturnType<typeof vi.fn> } {
  return { empresasConMesPendiente: vi.fn(async () => empresas), cerrarMeses: vi.fn(cerrarMeses) };
}

describe("SLT-215 — el handler del cierre de los niveles (R29, R30)", () => {
  it("R29: lista las empresas con meses pendientes y cierra CADA una con el mismo «ahora»", async () => {
    const r = repo(["org-a", "org-b", "org-c"]);
    let relojes = 0;
    await crearCierreNivelesHandler(r, () => {
      relojes += 1;
      return AHORA;
    })(job());
    expect(r.empresasConMesPendiente.mock.calls).toEqual([[AHORA]]);
    expect(r.cerrarMeses.mock.calls).toEqual([
      ["org-a", AHORA],
      ["org-b", AHORA],
      ["org-c", AHORA],
    ]);
    expect(relojes).toBe(1);
  });

  it("R29: un día sin meses pendientes termina bien sin cerrar nada", async () => {
    const r = repo([]);
    await expect(crearCierreNivelesHandler(r, () => AHORA)(job())).resolves.toBeUndefined();
    expect(r.cerrarMeses).not.toHaveBeenCalled();
  });

  it("R30: si una empresa falla, cierra las demás y DESPUÉS falla con sus ids y causas, para que la cola reintente", async () => {
    const r = repo(["org-a", "org-b", "org-c", "org-d"], async (organizacionId) => {
      if (organizacionId === "org-b") throw new Error("deadlock detectado");
      if (organizacionId === "org-d") throw "sin Error";
      return 1;
    });
    const error = await crearCierreNivelesHandler(r, () => AHORA)(job()).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toMatch(/^plan_niveles_cerrar: fallo al cerrar 2 empresa\(s\): org-b, org-d/);
    expect(error?.message).toContain("org-b: deadlock detectado");
    expect(error?.message).toContain("org-d: sin Error");
    expect(error?.message).not.toContain("org-a");
    // Cada empresa una sola vez y en su orden: las que cerraron no se repiten en esta corrida.
    expect(r.cerrarMeses.mock.calls.map((c) => c[0])).toEqual(["org-a", "org-b", "org-c", "org-d"]);
  });

  it("R30: un fallo al listar las empresas falla la corrida sin cerrar ninguna", async () => {
    const r = repo([]);
    r.empresasConMesPendiente.mockRejectedValueOnce(new Error("base caída"));
    await expect(crearCierreNivelesHandler(r, () => AHORA)(job())).rejects.toThrow(/base caída/);
    expect(r.cerrarMeses).not.toHaveBeenCalled();
  });
});

describe("SLT-215 — registro, recurrencia y siembra del cierre de los niveles (P1, R29)", () => {
  it("tiene handler, es RECURRENTE, corre UNA vez en plataforma y es de núcleo", () => {
    expect(buildHandlers(() => AHORA).has("plan_niveles_cerrar")).toBe(true);
    expect(buildRecurrencias().get("plan_niveles_cerrar")).toBe(recurrenciaCierreNiveles);
    expect(RECURRENTES_DE_PLATAFORMA.has("plan_niveles_cerrar")).toBe(true);
    expect(MODULO_POR_JOB.plan_niveles_cerrar).toBe("nucleo");
  });

  it("el handler cableado recorre las empresas en plataforma con el reloj del drenador", async () => {
    usarDoble = true;
    llamadas.length = 0;
    try {
      await buildHandlers(() => AHORA).get("plan_niveles_cerrar")!(job({ organizacionId: null } as Partial<JobDTO>));
      expect(llamadas.map((l) => [l.metodo, l.args])).toEqual([
        ["empresasConMesPendiente", [AHORA]],
        ["cerrarMeses", ["org-a", AHORA]],
        ["cerrarMeses", ["org-b", AHORA]],
      ]);
      for (const l of llamadas) expect(l.contexto).toMatchObject({ tipo: "plataforma" });
    } finally {
      usarDoble = false;
    }
  });

  it.each([
    { caso: "antes de las 06:20 → las 06:20 de ese día", ahora: "2026-12-01T05:59:00.000Z", corrida: "2026-12-01T06:20:00.000Z" },
    { caso: "justo a las 06:20 → las 06:20 del día siguiente", ahora: "2026-12-01T06:20:00.000Z", corrida: "2026-12-02T06:20:00.000Z" },
    { caso: "a las 06:20 y 1 ms → el día siguiente", ahora: "2026-12-01T06:20:00.001Z", corrida: "2026-12-02T06:20:00.000Z" },
    { caso: "el 31 a las 23:59 UTC → el 1 del mes siguiente", ahora: "2026-12-31T23:59:00.000Z", corrida: "2027-01-01T06:20:00.000Z" },
  ])("P1: una vez al día a las 06:20 UTC (00:20 de la plataforma) — $caso", ({ ahora, corrida }) => {
    expect(proximaCorridaCierreNiveles(new Date(ahora)).toISOString()).toBe(corrida);
    const { runAfter, dedupeKey } = recurrenciaCierreNiveles.siguiente(new Date(ahora), []);
    expect(runAfter.toISOString()).toBe(corrida);
    // Una `dedupe_key` por día: dos siembras o dos re-agendados del mismo día no duplican la corrida.
    expect(dedupeKey).toBe(`plan_niveles_cerrar:${corrida.slice(0, 10)}`);
    expect(dedupeKeyCierreNiveles(runAfter)).toBe(dedupeKey);
  });

  it("dos corridas del mismo día comparten la dedupe_key; la del día siguiente no", () => {
    const delDia = dedupeKeyCierreNiveles(new Date("2026-12-01T06:20:00.000Z"));
    expect(dedupeKeyCierreNiveles(new Date("2026-12-01T23:00:00.000Z"))).toBe(delDia);
    expect(dedupeKeyCierreNiveles(new Date("2026-12-02T06:20:00.000Z"))).not.toBe(delDia);
  });

  it("la recurrencia ignora las zonas de la cola (es de plataforma)", () => {
    const sin = recurrenciaCierreNiveles.siguiente(AHORA, []);
    const con = recurrenciaCierreNiveles.siguiente(AHORA, ["America/Costa_Rica", "America/Bogota"]);
    expect(con).toEqual(sin);
  });

  it("el despliegue siembra la primera corrida con la MISMA dedupe_key que la recurrencia", async () => {
    const encolados: { tipo: string; payload: Record<string, unknown>; opts?: EnqueueOpts }[] = [];
    const jobs = {
      enqueue: async (tipo: string, payload: Record<string, unknown>, opts?: EnqueueOpts) => {
        encolados.push({ tipo, payload, opts });
        return null;
      },
    } as unknown as IJobRepository;
    await sembrarCierreNiveles(jobs, new Date("2026-11-19T15:47:00.000Z"));
    expect(encolados).toEqual([
      {
        tipo: "plan_niveles_cerrar",
        payload: {},
        opts: { runAfter: new Date("2026-11-20T06:20:00.000Z"), dedupeKey: "plan_niveles_cerrar:2026-11-20" },
      },
    ]);
    expect(DEDUPE_PREFIX_CIERRE_NIVELES).toBe("plan_niveles_cerrar");
    const siembra = SIEMBRAS_RECURRENTES.find((s) => s.tipo === "plan_niveles_cerrar");
    expect(siembra?.sembrar).toBe(sembrarCierreNiveles);
    expect(siembra?.script).toBe("lib/planes/jobs-niveles.ts");
  });
});
