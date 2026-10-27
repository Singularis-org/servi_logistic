import { JobTipo as JobTipoPrisma, type JobTipo } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobsConfig } from "@/lib/config/jobs";
import type { IJobRepository, JobConEmpresa, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { JobQueueService } from "@/lib/services/JobQueueService";

// SL-23 · T11 (design §5.4, §3.3, §3.8; R19, R20, R21, R30) — el drenador con módulos apagados.
//
// Se ejercen las piezas REALES del route: `moduloDeEjecucion` (qué módulo exige cada tipo) y
// `conSuEmpresa` (la puerta), con la puerta de módulos real sobre una lista en memoria por empresa.
// El handler de cada tipo es un espía: un descartado no puede haberlo llamado.

const estado = vi.hoisted(() => ({ porEmpresa: {} as Record<string, string[]> }));

vi.mock("@/lib/repositories/ModulosActivosRepository", () => ({
  ModulosActivosRepository: class {
    async activos() {
      const { contextoActual } = await import("@/lib/db/contexto-empresa");
      const ctx = contextoActual();
      return ctx?.tipo === "empresa" ? [...(estado.porEmpresa[ctx.organizacionId] ?? [])] : [];
    }
  },
}));

const { conSuEmpresa, moduloDeEjecucion } = await import("@/app/api/cron/procesar-jobs/route");

const AHORA = new Date("2026-10-26T12:00:00.000Z");
const CONFIG = {
  JOBS_BATCH_SIZE: 10,
  JOBS_MAX_ATTEMPTS: 5,
  JOBS_BACKOFF_BASE_MS: 30_000,
  JOBS_BACKOFF_CAP_MS: 3_600_000,
  JOBS_VISIBILITY_TIMEOUT_MS: 300_000,
} as JobsConfig;

const A = "org-a";

function job(id: string, tipo: JobTipo, organizacionId: string | null = A): JobConEmpresa {
  return {
    id,
    tipo,
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
    organizacionId,
  };
}

/** Drena `jobs` con un espía por tipo, envuelto en el `conSuEmpresa` real con su módulo. */
async function drenar(jobs: JobDTO[], recurrentes: JobTipo[] = []) {
  const corridos: string[] = [];
  const descartados: { id: string; motivo: string }[] = [];
  const reagendados: JobTipo[] = [];
  const repo: IJobRepository = {
    claimBatch: async () => jobs,
    complete: async () => {},
    fail: async () => {},
    descartar: async (id, motivo) => {
      descartados.push({ id, motivo });
    },
    findByDedupeKeys: async () => [],
    enqueue: async (tipo) => {
      reagendados.push(tipo);
      return null;
    },
  };
  const tipos = new Set(jobs.map((j) => j.tipo));
  const handlers = new Map<JobTipo, JobHandler>(
    [...tipos].map((tipo) => [
      tipo,
      conSuEmpresa(async (j) => void corridos.push(j.id), recurrentes.includes(tipo), {}, moduloDeEjecucion(tipo)),
    ]),
  );
  const recurrencias = new Map<JobTipo, RecurrenciaSpec>(
    recurrentes.map((t) => [t, { siguiente: () => ({ runAfter: AHORA, dedupeKey: `${t}:x` }) }]),
  );
  const resultado = await new JobQueueService(repo, handlers, recurrencias, CONFIG, () => AHORA, {
    warn: () => {},
  }).drenar(10);
  return { resultado, corridos, descartados, reagendados };
}

beforeEach(() => {
  estado.porEmpresa = {};
});

describe("SL-23 · qué módulo exige cada tipo de job (§3.3, §3.8)", () => {
  it("todo JobTipo tiene uno; los de cálculo continuo corren como núcleo", () => {
    for (const tipo of Object.values(JobTipoPrisma)) expect(moduloDeEjecucion(tipo)).toBeDefined();
    expect(moduloDeEjecucion("analitica_rollup_diario")).toBe("nucleo");
    expect(moduloDeEjecucion("analitica_invalidacion_cache")).toBe("nucleo");
    // API e integraciones es núcleo desde el 2026-10-27.
    expect(moduloDeEjecucion("webhook_estado")).toBe("nucleo");
    expect(moduloDeEjecucion("webhook_evento")).toBe("nucleo");
    expect(moduloDeEjecucion("whatsapp_chat_envio")).toBe("whatsapp");
    expect(moduloDeEjecucion("push_web")).toBe("nucleo");
  });
});

describe("SL-23 · el drenador con módulos apagados (R19, R20, R30)", () => {
  it("R19 — webhook_estado y webhook_evento son núcleo (2026-10-27): corren con todos los módulos apagados", async () => {
    estado.porEmpresa = { [A]: [] };
    const r = await drenar([job("j-e", "webhook_estado"), job("j-v", "webhook_evento")]);
    expect(r.corridos).toEqual(["j-e", "j-v"]);
    expect(r.descartados).toEqual([]);
  });

  it("R20 — un whatsapp_* con WhatsApp apagado se descarta; uno del núcleo corre", async () => {
    estado.porEmpresa = { [A]: ["analitica"] };
    const r = await drenar([job("j-w", "whatsapp_chat_envio"), job("j-p", "push_web")]);
    expect(r.corridos).toEqual(["j-p"]);
    expect(r.descartados).toEqual([{ id: "j-w", motivo: "modulo_inactivo:whatsapp" }]);
    expect(r.resultado).toMatchObject({ ok: 1, descartados: 1, fallidos: 0 });
  });

  it("encendido, el mismo job corre", async () => {
    estado.porEmpresa = { [A]: ["whatsapp"] };
    const r = await drenar([job("j-e", "whatsapp_chat_envio")]);
    expect(r.corridos).toEqual(["j-e"]);
    expect(r.descartados).toEqual([]);
  });

  it("R20 — un recurrente con empresa y su módulo apagado se descarta y re-agenda su siguiente ocurrencia", async () => {
    const r = await drenar([job("j-m", "whatsapp_envio_mantenimiento")], ["whatsapp_envio_mantenimiento"]);
    expect(r.corridos).toEqual([]);
    expect(r.descartados).toEqual([{ id: "j-m", motivo: "modulo_inactivo:whatsapp" }]);
    expect(r.reagendados).toEqual(["whatsapp_envio_mantenimiento"]);
  });

  it("R30 — analitica_rollup_diario y analitica_invalidacion_cache corren con Analítica apagada", async () => {
    estado.porEmpresa = { [A]: [] };
    const r = await drenar([job("j-r", "analitica_rollup_diario"), job("j-i", "analitica_invalidacion_cache")]);
    expect(r.corridos).toEqual(["j-r", "j-i"]);
    expect(r.descartados).toEqual([]);
  });

  it("sin empresa y por evento corre como hoy: no hay empresa contra la que comprobar", async () => {
    const r = await drenar([job("j-s", "webhook_evento", null)]);
    expect(r.corridos).toEqual(["j-s"]);
    expect(r.descartados).toEqual([]);
  });
});

describe("SL-23 · un recurrente sin empresa se salta las que tienen su módulo apagado (R21)", () => {
  it("whatsapp_envio_mantenimiento corre solo en las empresas con WhatsApp", async () => {
    const corridas: string[] = [];
    const listados: unknown[] = [];
    const empresas = {
      organizacion: {
        findMany: async (args: { where?: unknown }) => {
          listados.push(args.where ?? null);
          return args.where ? [{ id: "org-con" }] : [{ id: "org-con" }, { id: "org-sin" }];
        },
      },
    };
    const { contextoActual } = await import("@/lib/db/contexto-empresa");
    const h = conSuEmpresa(
      async () => {
        const ctx = contextoActual();
        corridas.push(ctx?.tipo === "empresa" ? ctx.organizacionId : "?");
      },
      true,
      { empresas },
      moduloDeEjecucion("whatsapp_envio_mantenimiento"),
    );
    await h(job("j-m", "whatsapp_envio_mantenimiento", null));
    expect(corridas).toEqual(["org-con"]);
    expect(listados).toEqual([null, { modulos: { some: { modulo: "whatsapp" } } }]);
  });

  it("R30 — el recurrente de cálculo continuo (rollup) no filtra: corre en todas", async () => {
    const listados: unknown[] = [];
    const empresas = {
      organizacion: {
        findMany: async (args: { where?: unknown }) => {
          listados.push(args.where ?? null);
          return [{ id: "org-1" }, { id: "org-2" }];
        },
      },
    };
    let corridas = 0;
    await conSuEmpresa(async () => void corridas++, true, { empresas }, moduloDeEjecucion("analitica_rollup_diario"))(
      job("j-r", "analitica_rollup_diario", null),
    );
    expect(corridas).toBe(2);
    expect(listados).toEqual([null]);
  });
});
