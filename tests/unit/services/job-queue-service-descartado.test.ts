import type { JobTipo } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { JobsConfig } from "@/lib/config/jobs";
import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { JobQueueService } from "@/lib/services/JobQueueService";
import { JobDescartado } from "@/lib/services/jobs/job-descartado";

// SL-23 · T11 (design §4.2, §5.4; R20) — el drenador ante un `JobDescartado`: lo marca `descartado`
// con el módulo en el motivo, no lo cuenta como ok ni como fallido, no pasa por el backoff ni por el
// dead-letter, y si el tipo es recurrente agenda la siguiente ocurrencia igual que tras un éxito.

const AHORA = new Date("2026-10-26T12:00:00.000Z");
const CONFIG: JobsConfig = {
  JOBS_BATCH_SIZE: 10,
  JOBS_MAX_ATTEMPTS: 5,
  JOBS_BACKOFF_BASE_MS: 30_000,
  JOBS_BACKOFF_CAP_MS: 3_600_000,
  JOBS_VISIBILITY_TIMEOUT_MS: 300_000,
} as JobsConfig;

function job(id: string, tipo: JobTipo, intentos = 1, maxIntentos = 5): JobDTO {
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
    descartar: [] as { id: string; motivo: string }[],
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
    async descartar(id, motivo) {
      llamadas.descartar.push({ id, motivo });
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

const descarta = (modulo: "whatsapp" | "api_integraciones"): JobHandler => async () => {
  throw new JobDescartado(modulo);
};
const RECURRENCIA: RecurrenciaSpec = {
  siguiente: () => ({ runAfter: new Date("2026-10-27T09:30:00.000Z"), dedupeKey: "wa_mant:2026-10-27" }),
} as RecurrenciaSpec;

describe("SL-23 · JobQueueService — job de un módulo apagado (R20)", () => {
  it("lo marca descartado con el módulo en el motivo, sin contarlo como ok ni fallido, sin backoff", async () => {
    const { repo, llamadas } = cola([job("j-1", "webhook_evento"), job("j-2", "push_web")]);
    const handlers = new Map<JobTipo, JobHandler>([
      ["webhook_evento", descarta("api_integraciones")],
      ["push_web", async () => {}],
    ]);
    const r = await new JobQueueService(repo, handlers, new Map(), CONFIG, () => AHORA, { warn: () => {} }).drenar(10);

    expect(r).toEqual({ procesados: 2, ok: 1, fallidos: 0, reintentados: 0, muertos: 0, descartados: 1 });
    expect(llamadas.descartar).toEqual([{ id: "j-1", motivo: "modulo_inactivo:api_integraciones" }]);
    expect(llamadas.complete).toEqual(["j-2"]);
    expect(llamadas.fail).toEqual([]);
  });

  it("en su último intento tampoco va a dead-letter: sigue siendo un descarte", async () => {
    const { repo, llamadas } = cola([job("j-1", "webhook_estado", 5, 5)]);
    const handlers = new Map<JobTipo, JobHandler>([["webhook_estado", descarta("api_integraciones")]]);
    const r = await new JobQueueService(repo, handlers, new Map(), CONFIG, () => AHORA, { warn: () => {} }).drenar(10);
    expect(r.muertos).toBe(0);
    expect(r.descartados).toBe(1);
    expect(llamadas.fail).toEqual([]);
  });

  it("un recurrente descartado agenda igualmente su siguiente ocurrencia", async () => {
    const { repo, llamadas } = cola([job("j-1", "whatsapp_envio_mantenimiento")]);
    const handlers = new Map<JobTipo, JobHandler>([["whatsapp_envio_mantenimiento", descarta("whatsapp")]]);
    const recurrencias = new Map<JobTipo, RecurrenciaSpec>([["whatsapp_envio_mantenimiento", RECURRENCIA]]);
    const r = await new JobQueueService(repo, handlers, recurrencias, CONFIG, () => AHORA, { warn: () => {} }).drenar(10);
    expect(r.descartados).toBe(1);
    expect(llamadas.enqueue).toEqual([{ tipo: "whatsapp_envio_mantenimiento", dedupeKey: "wa_mant:2026-10-27" }]);
  });

  it("un error cualquiera sigue siendo un fallo con backoff: el descarte no se traga errores", async () => {
    const { repo, llamadas } = cola([job("j-1", "webhook_evento")]);
    const handlers = new Map<JobTipo, JobHandler>([
      [
        "webhook_evento",
        async () => {
          throw new Error("callback caído");
        },
      ],
    ]);
    const r = await new JobQueueService(repo, handlers, new Map(), CONFIG, () => AHORA, { warn: () => {} }).drenar(10);
    expect(r).toMatchObject({ fallidos: 1, reintentados: 1, descartados: 0 });
    expect(llamadas.descartar).toEqual([]);
    expect(llamadas.fail).toHaveLength(1);
  });
});
