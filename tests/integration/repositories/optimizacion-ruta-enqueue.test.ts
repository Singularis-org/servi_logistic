import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type {
  EncolarOMoverOpts,
  EnqueueOpts,
  IJobRepositoryMovible,
  JobDTO,
  JobTxClient,
} from "@/lib/interfaces/repositories/IJobRepository";
import type { JobTipo } from "@prisma/client";
import {
  dedupeKeyDebounce,
  dedupeKeyPrimeraRecogida,
} from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { idEstado, sembrarCatalogoEstados } from "@/tests/fixtures/catalogo-estados";

// Feature 92 (R16/R17/R19) -> SLT-59 (R57-R61, R76, R77) — encolado TRANSACTIONAL OUTBOX desde los
// writers del mensajero. Prisma va mockeado (patron de `orden-geocode-enqueue.test.ts`). El
// `$transaction` fake respeta lo que importa: si el callback LANZA, la cola vuelve a como estaba.
// La cola en memoria honra la unicidad de `dedupe_key` igual que el indice unico parcial de la
// migracion de la 90, y el `DO UPDATE … WHERE estado = 'pending'` de `encolarOMoverPendiente`
// igual que `JobRepository` (el SQL en si lo fija `job-repo-posponer.test.ts`). Asi el efecto de
// la clave se observa como FILAS, no como llamadas.

const MENSAJERO = "m-1";
const T0 = new Date("2026-07-20T12:00:00.000Z");
/**
 * Feature 261 (B5): `recogerLote` recibe el DIA DE COSTA RICA EN CURSO ya resuelto por el
 * servicio. Medianoche UTC de la fecha calendario: el 20 de julio.
 */
const DIA_CR = new Date("2026-07-20T00:00:00.000Z");
const DIA_TEXTO = "2026-07-20";
/** El dia CR del 20 empieza a las 06:00Z: esto es «hoy» y lo de abajo, «ayer». */
const CALCULADA_HOY = new Date("2026-07-20T07:00:00.000Z");
const CALCULADA_AYER = new Date("2026-07-19T22:00:00.000Z");
const MIN = 60_000;
const POR_RECOGER = idEstado("mensajero_recogiendo_en_bodega");
const EN_REPARTO = idEstado("en_reparto");
const CLAVE_DEL_DIA = dedupeKeyPrimeraRecogida(MENSAJERO, DIA_TEXTO);

interface Fila {
  tipo: JobTipo;
  payload: Record<string, unknown>;
  opts: EnqueueOpts;
  tx?: JobTxClient;
  estado: "pending" | "processing" | "done" | "failed";
  /** Por donde entro: `enqueue` (ventana) o `encolarOMoverPendiente` (clave por dia). */
  via: "enqueue" | "mover";
}

class ColaEnMemoria implements IJobRepositoryMovible {
  filas: Fila[] = [];

  async enqueue(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts: EnqueueOpts = {},
    tx?: JobTxClient,
  ): Promise<JobDTO | null> {
    const key = opts.dedupeKey ?? null;
    // ON CONFLICT ("dedupe_key") WHERE dedupe_key IS NOT NULL DO NOTHING.
    if (key !== null && this.filas.some((f) => f.opts.dedupeKey === key)) return null;
    this.filas.push({ tipo, payload, opts, tx, estado: "pending", via: "enqueue" });
    return null;
  }
  async encolarOMoverPendiente(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts: EncolarOMoverOpts,
    tx?: JobTxClient,
  ): Promise<JobDTO | null> {
    const existente = this.filas.find((f) => f.opts.dedupeKey === opts.dedupeKey);
    if (existente === undefined) {
      this.filas.push({ tipo, payload, opts: { ...opts }, tx, estado: "pending", via: "mover" });
      return null;
    }
    // ON CONFLICT … DO UPDATE SET run_after, payload … WHERE "jobs"."estado" = 'pending'.
    if (existente.estado === "pending") {
      existente.opts = { ...existente.opts, runAfter: opts.runAfter };
      existente.payload = payload;
      existente.tx = tx;
    }
    return null;
  }
  async claimBatch(): Promise<JobDTO[]> {
    return [];
  }
  async complete(): Promise<void> {}
  async fail(): Promise<void> {}
  async descartar(): Promise<void> {}
  async findByDedupeKeys(): Promise<JobDTO[]> {
    return [];
  }

  /** Filas de reoptimizacion de ruta encoladas. */
  get ruta(): Fila[] {
    return this.filas.filter((f) => f.tipo === "optimizacion_ruta");
  }
  foto(): Fila[] {
    return this.filas.map((f) => ({ ...f, opts: { ...f.opts }, payload: { ...f.payload } }));
  }
}

/** `$transaction` fake con rollback de la cola: si el callback lanza, nada de lo encolado queda. */
function transaccionCon<T>(cola: ColaEnMemoria, tx: T) {
  return vi.fn(async (cb: (t: T) => Promise<unknown>) => {
    const foto = cola.foto();
    try {
      return await cb(tx);
    } catch (e) {
      cola.filas = foto;
      throw e;
    }
  });
}

function sqlDe(q: unknown): string {
  return (Array.isArray(q) ? q : ((q as { strings?: string[] }).strings ?? [])).join(" ");
}

/**
 * Prisma fake de `recogerLote`. El `UPDATE … RETURNING` devuelve los ids que ganaron la guarda; la
 * consulta de §12.2 devuelve si quedan por recoger y el `calculada_at` de la ruta (null = nunca).
 */
function prismaRecoger(
  cola: ColaEnMemoria,
  idsGanadores: { id: string }[],
  opts: { quedan?: boolean; calculadaAt?: Date | null; falla?: boolean } = {},
) {
  const tx = {
    $queryRaw: vi.fn(async (q: unknown) => {
      if (sqlDe(q).includes("quedan_por_recoger")) {
        return [{ quedan_por_recoger: opts.quedan ?? false, calculada_at: opts.calculadaAt ?? null }];
      }
      return idsGanadores;
    }),
    ordenHistorialEstado: {
      createMany: vi.fn(async () => {
        if (opts.falla) throw new Error("append boom");
        return { count: idsGanadores.length };
      }),
    },
  };
  return { prisma: { $transaction: transaccionCon(cola, tx) }, tx };
}

/**
 * Prisma fake de `registrarGestionPendiente`. La re-lectura de gestionable trae `tiene_coordenadas`
 * (R21, R22) y, desde SLT-59 R59, `calculada_at` de la ruta. Por defecto la ruta es de HOY: la
 * primera ruta del dia ya existe y rige lo de siempre.
 */
function prismaGestion(
  cola: ColaEnMemoria,
  opts: {
    gestionId?: string;
    falla?: boolean;
    coordenadas?: boolean;
    gestionable?: boolean;
    calculadaAt?: Date | null;
  } = {},
) {
  const calculadaAt = opts.calculadaAt === undefined ? CALCULADA_HOY : opts.calculadaAt;
  const tx = {
    $queryRaw: vi.fn(async (q: unknown) => {
      const sql = sqlDe(q);
      if (sql.includes("webhook_suscripcion")) return [];
      if (sql.includes("tiene_coordenadas")) {
        return opts.gestionable === false
          ? []
          : [{ id: "o1", tiene_coordenadas: opts.coordenadas ?? true, calculada_at: calculadaAt }];
      }
      return [{ id: "o1" }];
    }),
    ordenEvento: { create: vi.fn(async () => ({ id: "ev-1" })) },
    gestionOrden: {
      create: vi.fn(async () => {
        if (opts.falla) throw new Error("create boom");
        return { id: opts.gestionId ?? "gestion-1" };
      }),
    },
    orden: {
      update: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => ({ estatusId: idEstado("en_reparto") })),
    },
    usuario: { update: vi.fn(async () => ({})) },
    ordenHistorialEstado: { createMany: vi.fn(async () => ({ count: 1 })) },
  };
  return { prisma: { $transaction: transaccionCon(cola, tx) }, tx };
}

function repoGestion(prisma: unknown, cola: ColaEnMemoria, ahora: Date = T0) {
  return new GestionOrdenRepository(prisma as unknown as PrismaClient, cola, () => ahora);
}

function recoger(
  cola: ColaEnMemoria,
  ahora: Date,
  ids: string[],
  opts: { quedan?: boolean; calculadaAt?: Date | null; falla?: boolean } = {},
) {
  const fake = prismaRecoger(cola, ids.map((id) => ({ id })), opts);
  const promesa = repoGestion(fake.prisma, cola, ahora).recogerLote(
    ids,
    MENSAJERO,
    POR_RECOGER,
    EN_REPARTO,
    DIA_CR,
  );
  return { promesa, ...fake };
}

const GESTION_INPUT = {
  ordenId: "o1",
  mensajeroId: MENSAJERO,
  gestion: { resultado: "entregado" as const, montoRecibido: 100, metodoPago: "efectivo" as const },
};

beforeEach(async () => {
  await sembrarCatalogoEstados(); // feature 140: la guardia del choke point es de fallo CERRADO
  // Los defaults de la config: 60 s de debounce, 10 min de debounce de la primera ruta (D29).
  vi.stubEnv("RUTA_DEBOUNCE_S", "");
  vi.stubEnv("RUTA_PRIMERA_DEBOUNCE_MIN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------------------------------ */
/* La recogida: R57, R58, R76, R77                                                             */
/* ------------------------------------------------------------------------------------------ */

describe("SLT-59 R57/R76 — recogida parcial con la primera ruta pendiente: un job del dia a +10 min", () => {
  it("R76: deja UN job con runAfter = ahora + RUTA_PRIMERA_DEBOUNCE_MIN y origen = recogida_parcial", async () => {
    const cola = new ColaEnMemoria();
    const { promesa, tx } = recoger(cola, T0, ["o1"], { quedan: true });
    await promesa;

    expect(cola.ruta).toHaveLength(1);
    const job = cola.ruta[0];
    expect(job.via).toBe("mover");
    expect(job.opts.dedupeKey).toBe(CLAVE_DEL_DIA);
    expect(job.opts.dedupeKey).toBe(`ruta-opt:primera-recogida:${MENSAJERO}:${DIA_TEXTO}`);
    expect(job.opts.runAfter?.getTime()).toBe(T0.getTime() + 10 * MIN);
    // PII: el mensajero y el origen del evento; nada mas.
    expect(job.payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida_parcial" });
    // Outbox: va con el cliente de la transaccion de la recogida.
    expect(job.tx).toBe(tx);
  });

  it("R76: una segunda recogida parcial a los 4 min MUEVE el mismo job a ahora + 10 min", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: true }).promesa;
    const t4 = new Date(T0.getTime() + 4 * MIN);
    await recoger(cola, t4, ["o2"], { quedan: true }).promesa;

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(t4.getTime() + 10 * MIN);
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida_parcial" });
  });

  it("R76/R58: la ultima recogida mueve el MISMO job a ahora + RUTA_DEBOUNCE_S con origen = recogida", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: true }).promesa;
    const t7 = new Date(T0.getTime() + 7 * MIN);
    await recoger(cola, t7, ["o2"], { quedan: false }).promesa;

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.dedupeKey).toBe(CLAVE_DEL_DIA);
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(t7.getTime() + 60_000);
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida" });
  });

  it("R76: RUTA_PRIMERA_DEBOUNCE_MIN se lee de la config (override a 3 min)", async () => {
    vi.stubEnv("RUTA_PRIMERA_DEBOUNCE_MIN", "3");
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: true }).promesa;
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 3 * MIN);
  });

  it("R76: la clave es por DIA y por MENSAJERO: otro mensajero tiene su propio job", async () => {
    const cola = new ColaEnMemoria();
    for (const m of ["m-1", "m-2"]) {
      const { prisma } = prismaRecoger(cola, [{ id: "o1" }], { quedan: true });
      await repoGestion(prisma, cola, T0).recogerLote(["o1"], m, POR_RECOGER, EN_REPARTO, DIA_CR);
    }
    expect(cola.ruta.map((f) => f.opts.dedupeKey).sort()).toEqual([
      dedupeKeyPrimeraRecogida("m-1", DIA_TEXTO),
      dedupeKeyPrimeraRecogida("m-2", DIA_TEXTO),
    ]);
  });
});

describe("SLT-59 R57 — con la primera ruta del dia ya calculada, recoger NO encola", () => {
  it("recogida parcial con la ruta calculada HOY -> 0 jobs", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: true, calculadaAt: CALCULADA_HOY }).promesa;
    expect(cola.ruta).toHaveLength(0);
  });

  it("el ultimo paquete con la ruta calculada HOY -> 0 jobs (R58 solo con la primera pendiente)", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: false, calculadaAt: CALCULADA_HOY }).promesa;
    expect(cola.ruta).toHaveLength(0);
  });

  it("una ruta calculada AYER no cuenta: la primera de hoy sigue pendiente y se encola", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: false, calculadaAt: CALCULADA_AYER }).promesa;
    expect(cola.ruta).toHaveLength(1);
  });

  it("si NINGUNA orden gano la guarda, ni consulta ni encola", async () => {
    const cola = new ColaEnMemoria();
    // Se pide `o1`, pero el `UPDATE … RETURNING` no devuelve ninguna (perdio la guarda).
    const fake = prismaRecoger(cola, [], { quedan: false });
    await repoGestion(fake.prisma, cola, T0).recogerLote(["o1"], MENSAJERO, POR_RECOGER, EN_REPARTO, DIA_CR);

    expect(cola.ruta).toHaveLength(0);
    // Solo el UPDATE: la consulta de la primera ruta no corre si nada cambio.
    expect(fake.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-59 R58 — la recogida que deja sin paquetes por recoger encola a + RUTA_DEBOUNCE_S", () => {
  it("el ultimo paquete con la primera pendiente -> 1 job a ahora + 60 s, origen = recogida", async () => {
    const cola = new ColaEnMemoria();
    const { promesa, tx } = recoger(cola, T0, ["o1"], { quedan: false });
    await promesa;

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
    expect(cola.ruta[0].opts.dedupeKey).toBe(CLAVE_DEL_DIA);
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida" });
    expect(cola.ruta[0].tx).toBe(tx);
  });

  it("«recoger todas» (8 paquetes, una transaccion) -> UN solo job", async () => {
    const cola = new ColaEnMemoria();
    const ids = Array.from({ length: 8 }, (_, i) => `o${i}`);
    const { promesa, prisma } = recoger(cola, T0, ids, { quedan: false });
    await promesa;

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(cola.ruta).toHaveLength(1);
  });

  it("R67: UNA sola consulta extra, con el MISMO predicado de dia que el UPDATE (una reservada para mañana no cuenta)", async () => {
    // Con un doble el SQL no se ejecuta: esto fija la FORMA. Que Postgres excluya la de mañana lo
    // prueba el predicado copiado del `UPDATE`, que `recoger-lote-dia-reserva.int.test.ts` mide
    // contra la base real.
    const cola = new ColaEnMemoria();
    const { promesa, tx } = recoger(cola, T0, ["o1"], { quedan: true });
    await promesa;

    const sentencias = tx.$queryRaw.mock.calls.map((c) => ({
      sql: sqlDe(c[0]),
      valores: c.slice(1) as unknown[],
    }));
    // Ademas del UPDATE y de las lecturas del choke point de estados (`appendCambioEstado`), UNA
    // sola sentencia nueva, y despues del UPDATE.
    const nuevas = sentencias.filter((s) => s.sql.includes("ruta_optimizada"));
    expect(nuevas).toHaveLength(1);
    const consulta = nuevas[0];
    const iUpdate = sentencias.findIndex((s) => s.sql.includes('UPDATE "orden"'));
    expect(iUpdate).toBeGreaterThanOrEqual(0);
    expect(sentencias.indexOf(consulta)).toBeGreaterThan(iUpdate);
    expect(consulta.sql).toContain("quedan_por_recoger");
    expect(consulta.sql).toContain("calculada_at");
    expect(consulta.sql).toContain("ruta_optimizada");
    expect(consulta.sql).toMatch(/"fecha_reparto" IS NULL OR "fecha_reparto" <=/);
    expect(consulta.sql).toMatch(/::date/);
    expect(consulta.sql).toMatch(/"deleted_at" IS NULL/);
    expect(consulta.valores).toContain(DIA_TEXTO);
    expect(consulta.valores).toContain(POR_RECOGER);
    expect(consulta.valores).toContain(MENSAJERO);
    expect(consulta.valores.some((v) => v instanceof Date)).toBe(false);
  });
});

describe("SLT-59 R77 — el job del dia que ya no esta `pending` no se crea ni se mueve", () => {
  for (const estado of ["processing", "done", "failed"] as const) {
    it(`con el job del dia en \`${estado}\`, otra recogida no crea otro ni le cambia el runAfter`, async () => {
      const cola = new ColaEnMemoria();
      await recoger(cola, T0, ["o1"], { quedan: true }).promesa;
      cola.ruta[0].estado = estado;
      const runAfterOriginal = cola.ruta[0].opts.runAfter?.getTime();

      await recoger(cola, new Date(T0.getTime() + 4 * MIN), ["o2"], { quedan: true }).promesa;
      await recoger(cola, new Date(T0.getTime() + 6 * MIN), ["o3"], { quedan: false }).promesa;

      expect(cola.ruta).toHaveLength(1);
      expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(runAfterOriginal);
      expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida_parcial" });
    });
  }
});

describe("R16 y SLT-59 R25/R58 — una transaccion REVERTIDA no deja jobs huerfanos", () => {
  it("si el append del historial revienta en recogerLote, no queda job", async () => {
    const cola = new ColaEnMemoria();
    await expect(recoger(cola, T0, ["o1"], { quedan: false, falla: true }).promesa).rejects.toThrow();
    expect(cola.ruta).toHaveLength(0);
  });

  it("si la transaccion revierte DESPUES de mover el job, el movimiento tambien se deshace", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"], { quedan: true }).promesa;
    const runAfterOriginal = cola.ruta[0].opts.runAfter?.getTime();

    // El job va por el `tx` de la recogida: si esa transaccion no confirma, el `DO UPDATE` se va
    // con ella. El doble lo modela con un `$transaction` que falla al confirmar.
    const fake = prismaRecoger(cola, [{ id: "o2" }], { quedan: false });
    const transaccion = fake.prisma.$transaction;
    const falloAlConfirmar = vi.fn(async (cb: (t: typeof fake.tx) => Promise<unknown>) =>
      transaccion(async (t) => {
        await cb(t);
        throw new Error("commit boom");
      }),
    );
    await expect(
      repoGestion({ $transaction: falloAlConfirmar }, cola, new Date(T0.getTime() + MIN)).recogerLote(
        ["o2"],
        MENSAJERO,
        POR_RECOGER,
        EN_REPARTO,
        DIA_CR,
      ),
    ).rejects.toThrow("commit boom");

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(runAfterOriginal);
    expect(cola.ruta[0].tx).not.toBe(fake.tx);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* La gestion: R21-R25 y R59 (R22 acotado)                                                     */
/* ------------------------------------------------------------------------------------------ */

// ⏳ 2026-10-29 (SLT-59, D2/D12): este bloque probaba 92/R19 (gestion INMEDIATA, namespace propio).
// La gestion pasa a debounce y comparte la clave de la ventana; los casos de abajo lo sustituyen.
describe("SLT-59 R21 — una gestion sobre una orden CON coordenadas encola con debounce", () => {
  it("deja UNA fila con runAfter = ahora + RUTA_DEBOUNCE_S y la clave `:debounce:`", async () => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, { gestionId: "gestion-77" });

    await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO });
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
    expect(cola.ruta[0].opts.dedupeKey).toBe(
      dedupeKeyDebounce(MENSAJERO, new Date(T0.getTime() + 60_000)),
    );
  });

  it("el encolado va DENTRO de la transaccion de la gestion", async () => {
    const cola = new ColaEnMemoria();
    const { prisma, tx } = prismaGestion(cola);
    await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);
    expect(cola.ruta[0].tx).toBe(tx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("R59/R67: coordenadas y `calculada_at` salen de la MISMA re-lectura de gestionable", async () => {
    const cola = new ColaEnMemoria();
    const { prisma, tx } = prismaGestion(cola);
    await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    const sentencias = tx.$queryRaw.mock.calls.map((c) => sqlDe(c[0]));
    // Una sola sentencia lleva las coordenadas y la ruta, y es la re-lectura de gestionable (la que
    // filtra por el mensajero asignado), no una consulta aparte.
    const conCoordenadas = sentencias.filter((q) => q.includes("tiene_coordenadas"));
    expect(conCoordenadas).toHaveLength(1);
    expect(conCoordenadas[0]).toContain("mensajero_asignado_id");
    expect(conCoordenadas[0]).toContain("calculada_at");
    expect(sentencias.filter((q) => q.includes("ruta_optimizada"))).toHaveLength(1);
  });
});

describe("SLT-59 R22 (acotado por R59) — una gestion SIN coordenadas", () => {
  it("con la primera ruta del dia YA calculada: no deja fila, pero la gestion se registra", async () => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, {
      coordenadas: false,
      gestionId: "gestion-9",
      calculadaAt: CALCULADA_HOY,
    });

    const res = await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(res?.gestionId).toBe("gestion-9");
    expect(cola.ruta).toHaveLength(0);
  });

  it("R59: con la primera ruta del dia PENDIENTE (nunca calculada) -> 1 job con debounce", async () => {
    const cola = new ColaEnMemoria();
    const { prisma, tx } = prismaGestion(cola, { coordenadas: false, calculadaAt: null });

    await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
    expect(cola.ruta[0].opts.dedupeKey).toBe(
      dedupeKeyDebounce(MENSAJERO, new Date(T0.getTime() + 60_000)),
    );
    expect(cola.ruta[0].tx).toBe(tx);
  });

  it("R59: una ruta calculada AYER tambien deja la primera de hoy pendiente -> 1 job", async () => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, { coordenadas: false, calculadaAt: CALCULADA_AYER });
    await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);
    expect(cola.ruta).toHaveLength(1);
  });
});

describe("SLT-59 R23 — con un debounce en vuelo, la gestion NO crea otro job ni lo adelanta", () => {
  it("dos gestiones en la misma ventana -> UNA fila", async () => {
    const cola = new ColaEnMemoria();

    const primera = prismaGestion(cola, { gestionId: "gestion-1" });
    await repoGestion(primera.prisma, cola, T0).registrarGestionPendiente(GESTION_INPUT);
    const runAfterPrimera = cola.ruta[0].opts.runAfter;
    const segunda = prismaGestion(cola, { gestionId: "gestion-2" });
    await repoGestion(segunda.prisma, cola, new Date(T0.getTime() + 20_000)).registrarGestionPendiente(
      { ...GESTION_INPUT, ordenId: "o2" },
    );

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter).toBe(runAfterPrimera);
  });
});

describe("SLT-59 R25 — una gestion no gestionable o revertida no deja job", () => {
  it("si la re-lectura no devuelve fila, responde null y no encola", async () => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, { gestionable: false, calculadaAt: null });

    const res = await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(res).toBeNull();
    expect(cola.ruta).toHaveLength(0);
  });

  it("si el INSERT de la gestion revienta, tampoco queda job", async () => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, { falla: true, calculadaAt: null });

    await expect(repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT)).rejects.toThrow();

    expect(cola.ruta).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* El traspaso (R60) y la nueva asignacion (R61)                                               */
/* ------------------------------------------------------------------------------------------ */

const ORIGEN = "m-origen";
const DESTINO = "m-destino";

/**
 * Prisma fake de `OrdenRepository.traspasarMensajeroLote`: la foto bajo candado devuelve las ordenes
 * del origen en `en_reparto`, cada `UPDATE` gana, no hay gestion pendiente, y la lectura de la ruta
 * (R60) devuelve `rutas`. Un mensajero sin fila en `rutas` no tiene ruta: primera pendiente.
 */
function prismaTraspaso(cola: ColaEnMemoria, rutas: { mensajero_id: string; calculada_at: Date | null }[]) {
  const tx = {
    $queryRaw: vi.fn(async (q: unknown) => {
      const sql = sqlDe(q);
      if (sql.includes("ruta_optimizada")) return rutas;
      if (sql.includes("FOR UPDATE")) {
        return ["o1", "o2"].map((id) => ({
          id,
          mensajero_asignado_id: ORIGEN,
          estatus_id: EN_REPARTO,
          fecha_reparto: null,
          deleted_at: null,
        }));
      }
      if (sql.includes("chat_conversacion")) return [];
      // El `UPDATE "orden" … RETURNING "id"`, uno por orden.
      return [{ id: "o" }];
    }),
    orden: { findMany: vi.fn(async () => []) },
    usuario: { updateMany: vi.fn(async () => ({ count: 0 })) },
    ordenTraspasoMensajero: { createMany: vi.fn(async () => ({ count: 2 })) },
  };
  return { prisma: { $transaction: transaccionCon(cola, tx) }, tx };
}

function traspasar(cola: ColaEnMemoria, rutas: { mensajero_id: string; calculada_at: Date | null }[]) {
  const fake = prismaTraspaso(cola, rutas);
  const repo = new OrdenRepository(fake.prisma as never, cola, () => T0);
  const promesa = repo.traspasarMensajeroLote({
    loteId: "lote-1",
    mensajeroOrigenId: ORIGEN,
    mensajeroDestinoId: DESTINO,
    ordenes: ["o1", "o2"].map((ordenId) => ({ ordenId, estatusIdEsperado: EN_REPARTO })),
    actor: { usuarioId: "maestro-1", rol: "maestro" as never },
    motivo: "se enfermo",
  });
  return { promesa, ...fake };
}

function mensajerosEncolados(cola: ColaEnMemoria): string[] {
  return cola.ruta.map((f) => f.payload.mensajeroId as string).sort();
}

describe("SLT-59 R60 — el traspaso solo encola a quien ya tiene su primera ruta del dia", () => {
  it("destino pendiente y origen con ruta de hoy -> solo encola el ORIGEN", async () => {
    const cola = new ColaEnMemoria();
    await traspasar(cola, [{ mensajero_id: ORIGEN, calculada_at: CALCULADA_HOY }]).promesa;
    expect(mensajerosEncolados(cola)).toEqual([ORIGEN]);
  });

  it("origen pendiente (ruta de ayer) y destino con ruta de hoy -> solo encola el DESTINO", async () => {
    const cola = new ColaEnMemoria();
    await traspasar(cola, [
      { mensajero_id: ORIGEN, calculada_at: CALCULADA_AYER },
      { mensajero_id: DESTINO, calculada_at: CALCULADA_HOY },
    ]).promesa;
    expect(mensajerosEncolados(cola)).toEqual([DESTINO]);
  });

  it("los dos pendientes -> 0 jobs", async () => {
    const cola = new ColaEnMemoria();
    await traspasar(cola, [{ mensajero_id: DESTINO, calculada_at: null }]).promesa;
    expect(cola.ruta).toHaveLength(0);
  });

  it("los dos con ruta de hoy -> 2 jobs con debounce, como hoy (92/R32)", async () => {
    const cola = new ColaEnMemoria();
    const { promesa, tx } = traspasar(cola, [
      { mensajero_id: ORIGEN, calculada_at: CALCULADA_HOY },
      { mensajero_id: DESTINO, calculada_at: CALCULADA_HOY },
    ]);
    await promesa;

    expect(mensajerosEncolados(cola)).toEqual([DESTINO, ORIGEN].sort());
    for (const f of cola.ruta) {
      expect(f.via).toBe("enqueue");
      expect(f.opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
      expect(f.tx).toBe(tx);
    }
  });

  it("R67: UNA lectura de la ruta para los dos mensajeros, dentro de la transaccion", async () => {
    const cola = new ColaEnMemoria();
    const { promesa, tx } = traspasar(cola, []);
    await promesa;

    const lecturas = tx.$queryRaw.mock.calls.filter((c) => sqlDe(c[0]).includes("ruta_optimizada"));
    expect(lecturas).toHaveLength(1);
    const valores = lecturas[0].slice(1).flatMap((v) => {
      const sql = v as { values?: unknown[] };
      return Array.isArray(sql.values) ? sql.values : [v];
    });
    expect(valores).toEqual(expect.arrayContaining([ORIGEN, DESTINO]));
  });
});

describe("SLT-59 R61 — una nueva asignacion NO encola ninguna reoptimizacion", () => {
  it("asignarBodegaLote (crea ordenes por recoger) -> 0 jobs, ni por `enqueue` ni por `encolarOMoverPendiente`", async () => {
    const cola = new ColaEnMemoria();
    const enqueue = vi.spyOn(cola, "enqueue");
    const mover = vi.spyOn(cola, "encolarOMoverPendiente");
    const tx = {
      orden: {
        findMany: vi.fn(async () => [{ id: "o1", estatusId: idEstado("en_bodega_central") }]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      ordenHistorialEstado: { createMany: vi.fn(async () => ({ count: 1 })) },
    };
    const prisma = { $transaction: transaccionCon(cola, tx) };
    const repo = new OrdenRepository(prisma as never, cola, () => T0);

    const n = await repo.asignarBodegaLote(
      ["o1"],
      MENSAJERO,
      POR_RECOGER,
      { actorUsuarioId: "maestro-1", origenTipo: "asignacion_bodega" },
      DIA_CR,
    );

    expect(n).toBe(1);
    expect(cola.ruta).toHaveLength(0);
    expect(enqueue).not.toHaveBeenCalled();
    expect(mover).not.toHaveBeenCalled();
  });
});
