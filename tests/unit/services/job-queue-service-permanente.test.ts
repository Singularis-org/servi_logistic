import type { JobTipo } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { JobsConfig } from "@/lib/config/jobs";
import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { JobQueueService } from "@/lib/services/JobQueueService";
import { JobFallidoPermanente } from "@/lib/services/jobs/job-fallido-permanente";

// SLT-59 · T4.1 (design §4 pasos 3-4; R29, R33, R34) — el drenador ante un `JobFallidoPermanente`:
// dead-letter en ESTE intento aunque le queden, sin backoff. Un error normal sigue su backoff de
// siempre, en `optimizacion_ruta` y en cualquier otro tipo.

const AHORA = new Date("2026-10-30T12:00:00.000Z");
const CONFIG: JobsConfig = {
  JOBS_BATCH_SIZE: 10,
  JOBS_MAX_ATTEMPTS: 5,
  JOBS_BACKOFF_BASE_MS: 30_000,
  JOBS_BACKOFF_CAP_MS: 3_600_000,
  JOBS_VISIBILITY_TIMEOUT_MS: 300_000,
} as JobsConfig;

function job(id: string, tipo: JobTipo, intentos = 1, maxIntentos = 3): JobDTO {
  return {
    id,
    tipo,
    payload: {},
    estado: "processing",
    intentos,
    maxIntentos,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
}

function cola(jobs: JobDTO[]) {
  const llamadas = {
    complete: [] as string[],
    fail: [] as { id: string; error: string; runAfter: Date | null }[],
    descartar: [] as string[],
    enqueue: [] as { tipo: JobTipo; dedupeKey?: string }[],
  };
  const repo: IJobRepository = {
    async claimBatch() {
      return jobs;
    },
    async complete(id) {
      llamadas.complete.push(id);
    },
    async fail(id, error, runAfter) {
      llamadas.fail.push({ id, error, runAfter });
    },
    async descartar(id) {
      llamadas.descartar.push(id);
    },
    async findByDedupeKeys() {
      return [];
    },
    async enqueue(tipo, _payload, opts) {
      llamadas.enqueue.push({ tipo, dedupeKey: opts?.dedupeKey });
      return null;
    },
  };
  return { repo, llamadas };
}

function drenador(repo: IJobRepository, handlers: [JobTipo, JobHandler][], recurrencias = new Map<JobTipo, RecurrenciaSpec>()) {
  return new JobQueueService(repo, new Map(handlers), recurrencias, CONFIG, () => AHORA, { warn: () => {} });
}

const permanente: JobHandler = async () => {
  throw new JobFallidoPermanente("optimizar ruta: credencial rechazada (HTTP 401)");
};
const transitorio: JobHandler = async () => {
  throw new Error("optimizar ruta: HTTP 503");
};

describe("SLT-59 · JobQueueService — fallo permanente (R29)", () => {
  it("dead-letter en el intento 1 de 3: `runAfter` null, sin backoff, cuenta como fallido y muerto", async () => {
    const { repo, llamadas } = cola([job("j-1", "optimizacion_ruta", 1, 3)]);

    const r = await drenador(repo, [["optimizacion_ruta", permanente]]).drenar(10);

    expect(r).toEqual({ procesados: 1, ok: 0, fallidos: 1, reintentados: 0, muertos: 1, descartados: 0 });
    expect(llamadas.fail).toEqual([
      { id: "j-1", error: "optimizar ruta: credencial rechazada (HTTP 401)", runAfter: null },
    ]);
    expect(llamadas.complete).toEqual([]);
    expect(llamadas.descartar).toEqual([]);
  });

  it("no aborta la corrida: el siguiente job del lote se procesa", async () => {
    const { repo, llamadas } = cola([job("j-1", "optimizacion_ruta"), job("j-2", "push_web")]);
    const r = await drenador(repo, [
      ["optimizacion_ruta", permanente],
      ["push_web", async () => {}],
    ]).drenar(10);
    expect(r).toMatchObject({ ok: 1, muertos: 1 });
    expect(llamadas.complete).toEqual(["j-2"]);
  });

  it("un tipo recurrente agenda igual su siguiente ocurrencia, como en cualquier dead-letter (R24)", async () => {
    const { repo, llamadas } = cola([job("j-1", "analitica_rollup_diario")]);
    const recurrencias = new Map<JobTipo, RecurrenciaSpec>([
      [
        "analitica_rollup_diario",
        {
          siguiente: () => ({ runAfter: new Date("2026-10-31T06:30:00.000Z"), dedupeKey: "rollup:2026-10-31" }),
        } as RecurrenciaSpec,
      ],
    ]);
    await drenador(repo, [["analitica_rollup_diario", permanente]], recurrencias).drenar(10);
    expect(llamadas.enqueue).toEqual([{ tipo: "analitica_rollup_diario", dedupeKey: "rollup:2026-10-31" }]);
  });
});

describe("SLT-59 · JobQueueService — un error normal sigue con backoff (R33)", () => {
  it("intento 1 de 3 -> reintento a base, no dead-letter", async () => {
    const { repo, llamadas } = cola([job("j-1", "optimizacion_ruta", 1, 3)]);
    const r = await drenador(repo, [["optimizacion_ruta", transitorio]]).drenar(10);
    expect(r).toMatchObject({ fallidos: 1, reintentados: 1, muertos: 0 });
    expect(llamadas.fail).toEqual([
      { id: "j-1", error: "optimizar ruta: HTTP 503", runAfter: new Date(AHORA.getTime() + 30_000) },
    ]);
  });

  it("intento 3 de 3 -> dead-letter al agotar los intentos, como siempre", async () => {
    const { repo, llamadas } = cola([job("j-1", "optimizacion_ruta", 3, 3)]);
    const r = await drenador(repo, [["optimizacion_ruta", transitorio]]).drenar(10);
    expect(r).toMatchObject({ reintentados: 0, muertos: 1 });
    expect(llamadas.fail[0].runAfter).toBeNull();
  });
});

describe("SLT-59 · JobQueueService — los demas tipos de job no cambian (R34)", () => {
  it.each<JobTipo>(["geocodificacion", "push_web", "webhook_evento"])(
    "%s con un error normal en el intento 2 de 3 -> backoff exponencial (base x2), igual que antes",
    async (tipo) => {
      const { repo, llamadas } = cola([job("j-1", tipo, 2, 3)]);
      const r = await drenador(repo, [[tipo, transitorio]]).drenar(10);
      expect(r).toMatchObject({ fallidos: 1, reintentados: 1, muertos: 0 });
      expect(llamadas.fail).toEqual([
        { id: "j-1", error: "optimizar ruta: HTTP 503", runAfter: new Date(AHORA.getTime() + 60_000) },
      ]);
    },
  );
});
