import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { JobRepository } from "@/lib/repositories/JobRepository";
import type { JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";

// SLT-59 (R76, R77; design §12.2 nota D29) — `JobRepository.encolarOMoverPendiente`. Prisma va
// mockeado (patron del resto de tests/integration/repositories: la suite de vitest NO levanta
// Postgres). Dos cosas se miden por separado:
//   1. la FORMA del SQL: `ON CONFLICT … DO UPDATE … WHERE "jobs"."estado" = 'pending'` sobre el indice
//      unico parcial de `dedupe_key`, sin migracion (R40);
//   2. lo que el repo hace con lo que Postgres devolveria: el fake EJECUTA la semantica de ese
//      `ON CONFLICT` sobre una tabla en memoria —inserta, mueve si sigue `pending`, no toca si no— y
//      el repo traduce `RETURNING` a `JobDTO | null`.

interface FilaJob {
  id: string;
  tipo: string;
  payload: unknown;
  estado: string;
  intentos: number;
  max_intentos: number;
  run_after: Date;
  locked_at: Date | null;
  last_error: string | null;
  dedupe_key: string | null;
  created_at: Date;
  updated_at: Date;
}

const CLAVE = "ruta-opt:primera-recogida:m-1:2026-07-20";
const T0 = new Date("2026-07-20T12:00:00.000Z");
const MIN = 60_000;

/**
 * `$queryRaw` fake. Los valores interpolados llegan en el orden del `VALUES` del repo: id, tipo,
 * payload (JSON), max_intentos, run_after, dedupe_key. El `ON CONFLICT` se interpreta leyendo el SQL:
 * sin `DO UPDATE` es `DO NOTHING`; con el `WHERE … 'pending'` solo actualiza filas `pending`.
 */
function buildPrisma(tabla: FilaJob[]) {
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join(" ");
    const [id, tipo, payloadJson, maxIntentos, runAfter, dedupeKey] = values as [
      string,
      string,
      string,
      number,
      Date,
      string | null,
    ];
    const existente = dedupeKey === null ? undefined : tabla.find((f) => f.dedupe_key === dedupeKey);
    if (existente !== undefined) {
      if (!sql.includes("DO UPDATE")) return [];
      const soloPending = /WHERE\s+"jobs"\."estado"\s*=\s*'pending'/.test(sql);
      if (soloPending && existente.estado !== "pending") return [];
      existente.run_after = runAfter;
      existente.payload = JSON.parse(payloadJson);
      existente.updated_at = new Date();
      return [{ ...existente }];
    }
    const fila: FilaJob = {
      id,
      tipo,
      payload: JSON.parse(payloadJson),
      estado: "pending",
      intentos: 0,
      max_intentos: maxIntentos,
      run_after: runAfter,
      locked_at: null,
      last_error: null,
      dedupe_key: dedupeKey,
      created_at: new Date(),
      updated_at: new Date(),
    };
    tabla.push(fila);
    return [{ ...fila }];
  });
  return { prisma: { $queryRaw } as unknown as PrismaClient, $queryRaw };
}

function mover(repo: JobRepository, runAfter: Date, origen: string, tx?: JobTxClient) {
  return repo.encolarOMoverPendiente(
    "optimizacion_ruta",
    { mensajeroId: "m-1", origen },
    { runAfter, dedupeKey: CLAVE, maxIntentos: 3 },
    tx,
  );
}

let tabla: FilaJob[];
beforeEach(() => {
  tabla = [];
});

describe("SLT-59 D29 — el SQL de encolarOMoverPendiente", () => {
  it("es el INSERT de la cola con ON CONFLICT … DO UPDATE de run_after y payload, solo si sigue pending", async () => {
    const { prisma, $queryRaw } = buildPrisma(tabla);
    await mover(new JobRepository(prisma), new Date(T0.getTime() + 10 * MIN), "recogida_parcial");

    const sql = ($queryRaw.mock.calls[0][0] as unknown as string[]).join(" ");
    expect(sql).toMatch(/INSERT INTO "jobs"/);
    // El MISMO indice unico parcial que `enqueue` (sin migracion, R40).
    expect(sql).toMatch(/ON CONFLICT \("dedupe_key"\) WHERE "dedupe_key" IS NOT NULL DO UPDATE/);
    expect(sql).toMatch(/"run_after" = EXCLUDED\."run_after"/);
    expect(sql).toMatch(/"payload" = EXCLUDED\."payload"/);
    expect(sql).toMatch(/"updated_at" = CURRENT_TIMESTAMP/);
    // R77: el filtro de estado va en el `DO UPDATE`, no en otro sitio.
    expect(sql).toMatch(/DO UPDATE[\s\S]*WHERE "jobs"\."estado" = 'pending'[\s\S]*RETURNING \*/);
    expect(sql).not.toMatch(/DO NOTHING/);
    // No toca intentos, max_intentos, last_error ni la empresa de la fila existente.
    const set = sql.slice(sql.indexOf("DO UPDATE"), sql.indexOf("RETURNING"));
    for (const columna of ['"intentos"', '"max_intentos"', '"last_error"', '"organizacion_id"']) {
      expect(set).not.toContain(columna);
    }
  });

  it("`enqueue` no cambia: sigue con DO NOTHING", async () => {
    const { prisma, $queryRaw } = buildPrisma(tabla);
    await new JobRepository(prisma).enqueue("optimizacion_ruta", { mensajeroId: "m-1" }, { dedupeKey: "k" });
    const sql = ($queryRaw.mock.calls[0][0] as unknown as string[]).join(" ");
    expect(sql).toMatch(/DO NOTHING/);
    expect(sql).not.toMatch(/DO UPDATE/);
  });

  it("usa el `tx` del writer si se pasa (outbox), no el cliente propio", async () => {
    const propio = buildPrisma(tabla);
    const externo = buildPrisma(tabla);
    await mover(
      new JobRepository(propio.prisma),
      T0,
      "recogida",
      externo.prisma as unknown as JobTxClient,
    );
    expect(externo.$queryRaw).toHaveBeenCalledTimes(1);
    expect(propio.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("SLT-59 R76 — crea la fila y luego la MUEVE mientras siga pending", () => {
  it("la primera llamada inserta una fila pending con su runAfter, payload y max_intentos", async () => {
    const { prisma } = buildPrisma(tabla);
    const runAfter = new Date(T0.getTime() + 10 * MIN);

    const job = await mover(new JobRepository(prisma), runAfter, "recogida_parcial");

    expect(tabla).toHaveLength(1);
    expect(job?.estado).toBe("pending");
    expect(job?.runAfter).toEqual(runAfter);
    expect(job?.dedupeKey).toBe(CLAVE);
    expect(job?.maxIntentos).toBe(3);
    expect(job?.payload).toEqual({ mensajeroId: "m-1", origen: "recogida_parcial" });
  });

  it("una segunda llamada con la misma clave mueve run_after y reescribe payload: sigue habiendo UNA fila", async () => {
    const { prisma } = buildPrisma(tabla);
    const repo = new JobRepository(prisma);
    const primero = await mover(repo, new Date(T0.getTime() + 10 * MIN), "recogida_parcial");
    const nuevo = new Date(T0.getTime() + 7 * MIN + 60_000);

    const movido = await mover(repo, nuevo, "recogida");

    expect(tabla).toHaveLength(1);
    expect(movido?.id).toBe(primero?.id);
    expect(movido?.runAfter).toEqual(nuevo);
    expect(movido?.payload).toEqual({ mensajeroId: "m-1", origen: "recogida" });
  });
});

describe("SLT-59 R77 — con la fila del dia fuera de pending no crea ni mueve", () => {
  for (const estado of ["processing", "done", "failed", "descartado"]) {
    it(`fila \`${estado}\` -> null, sin fila nueva y con su run_after intacto`, async () => {
      const { prisma } = buildPrisma(tabla);
      const repo = new JobRepository(prisma);
      const runAfterOriginal = new Date(T0.getTime() + 10 * MIN);
      await mover(repo, runAfterOriginal, "recogida_parcial");
      tabla[0].estado = estado;

      const res = await mover(repo, new Date(T0.getTime() + 30 * MIN), "recogida");

      expect(res).toBeNull();
      expect(tabla).toHaveLength(1);
      expect(tabla[0].run_after).toEqual(runAfterOriginal);
      expect(tabla[0].payload).toEqual({ mensajeroId: "m-1", origen: "recogida_parcial" });
    });
  }
});
