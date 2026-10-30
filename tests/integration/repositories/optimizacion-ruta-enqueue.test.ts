import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import type {
  EnqueueOpts,
  IJobRepository,
  JobDTO,
  JobTxClient,
} from "@/lib/interfaces/repositories/IJobRepository";
import type { JobTipo } from "@prisma/client";
import { dedupeKeyDebounce } from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { idEstado, sembrarCatalogoEstados } from "@/tests/fixtures/catalogo-estados";

// Feature 92 (R16/R17/R19) — encolado TRANSACTIONAL OUTBOX desde los DOS writers del
// mensajero. Prisma va mockeado (patron de `orden-geocode-enqueue.test.ts`), pero el
// `$transaction` fake respeta lo que importa: si el callback LANZA, nada de lo hecho
// dentro cuenta. La cola en memoria honra la unicidad de `dedupe_key` igual que el indice
// unico parcial de la migracion de la 90 — asi el efecto de la clave se observa como
// FILAS, no como llamadas.

const MENSAJERO = "m-1";
const T0 = new Date("2026-07-20T12:00:00.000Z");
/**
 * Feature 261 (B5): `recogerLote` recibe el DIA DE COSTA RICA EN CURSO ya resuelto por el
 * servicio, y lo mete en su `WHERE`. Este archivo mide el ENCOLADO de la reoptimizacion, no el
 * predicado del dia (eso vive en `tests/integration/db/recoger-lote-dia-reserva.int.test.ts`,
 * contra Postgres real): aqui basta con un dia valido y constante.
 */
const DIA_CR = new Date("2026-07-20T00:00:00.000Z");

interface Fila {
  tipo: JobTipo;
  payload: Record<string, unknown>;
  opts: EnqueueOpts;
  tx?: JobTxClient;
}

class ColaEnMemoria implements IJobRepository {
  readonly filas: Fila[] = [];

  async enqueue(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts: EnqueueOpts = {},
    tx?: JobTxClient,
  ): Promise<JobDTO | null> {
    const key = opts.dedupeKey ?? null;
    // ON CONFLICT ("dedupe_key") WHERE dedupe_key IS NOT NULL DO NOTHING.
    if (key !== null && this.filas.some((f) => f.opts.dedupeKey === key)) return null;
    this.filas.push({ tipo, payload, opts, tx });
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
}

/** Prisma fake de `recogerLote`: `$queryRaw` devuelve los ids que ganaron la guarda. */
function prismaRecoger(idsGanadores: { id: string }[], falla = false) {
  const tx = {
    $queryRaw: vi.fn(async () => idsGanadores),
    ordenHistorialEstado: {
      createMany: vi.fn(async () => {
        if (falla) throw new Error("append boom");
        return { count: idsGanadores.length };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<number>) => cb(tx)),
  };
  return { prisma, tx };
}

/** Prisma fake de `registrarGestionPendiente` (antes `crearGestionYTransicionar`). */
// ⏳ 2026-09-23 (FICHA 454, T1.4): `crearGestionYTransicionar` se sustituye por
// `registrarGestionPendiente` (registra sin transicionar). La reoptimizacion inmediata sigue en la
// MISMA transaccion. El doble gana el candado + re-lectura (`$queryRaw`) y el evento de registro.
// ⏳ 2026-10-29 (SLT-59, T3.1): la re-lectura de gestionable trae ademas `tiene_coordenadas` (R21,
// R22); `coordenadas` lo fija y `gestionable: false` simula que la re-lectura no devuelve fila (R25).
function prismaGestion(
  opts: { gestionId?: string; falla?: boolean; coordenadas?: boolean; gestionable?: boolean } = {},
) {
  const tx = {
    $queryRaw: vi.fn(async (q: unknown) => {
      const partes = Array.isArray(q) ? q : ((q as { strings?: string[] }).strings ?? []);
      const sql = partes.join(" ");
      if (sql.includes("webhook_suscripcion")) return [];
      if (sql.includes("tiene_coordenadas")) {
        return opts.gestionable === false
          ? []
          : [{ id: "o1", tiene_coordenadas: opts.coordenadas ?? true }];
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
    orden: { update: vi.fn(async () => ({})), findFirst: vi.fn(async () => ({ estatusId: idEstado("en_reparto") })) },
    usuario: { update: vi.fn(async () => ({})) },
    ordenHistorialEstado: { createMany: vi.fn(async () => ({ count: 1 })) },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<string>) => cb(tx)),
  };
  return { prisma, tx };
}

function repoRecoger(prisma: unknown, cola: ColaEnMemoria, ahora: Date = T0) {
  return new GestionOrdenRepository(prisma as unknown as PrismaClient, cola, () => ahora);
}

const GESTION_INPUT = {
  ordenId: "o1",
  mensajeroId: MENSAJERO,
  gestion: { resultado: "entregado" as const, montoRecibido: 100, metodoPago: "efectivo" as const },
};

beforeEach(async () => {
  await sembrarCatalogoEstados(); // feature 140: la guardia del choke point es de fallo CERRADO (catalogo real + pares legales)
});

describe("R16 — recoger encola una reoptimizacion DIFERIDA", () => {
  it("una recogida deja UN job optimizacion_ruta con runAfter = ahora + debounce", async () => {
    const { prisma } = prismaRecoger([{ id: "o1" }]);
    const cola = new ColaEnMemoria();

    await repoRecoger(prisma, cola).recogerLote(["o1"], MENSAJERO, idEstado("mensajero_recogiendo_en_bodega"), idEstado("en_reparto"), DIA_CR);

    expect(cola.ruta).toHaveLength(1);
    // PII: el payload lleva SOLO el id del mensajero.
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO });
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
    expect(cola.ruta[0].opts.dedupeKey).toBe(
      dedupeKeyDebounce(MENSAJERO, new Date(T0.getTime() + 60_000)),
    );
  });

  it("recoger 8 paquetes de golpe encola UN solo job, no ocho", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => ({ id: `o${i}` }));
    const { prisma } = prismaRecoger(ids);
    const cola = new ColaEnMemoria();

    await repoRecoger(prisma, cola).recogerLote(
      ids.map((i) => i.id),
      MENSAJERO,
      idEstado("mensajero_recogiendo_en_bodega"),
      idEstado("en_reparto"),
      DIA_CR,
    );

    expect(cola.ruta).toHaveLength(1);
  });

  it("el encolado ocurre DENTRO de la transaccion que transiciona las ordenes", async () => {
    const { prisma, tx } = prismaRecoger([{ id: "o1" }]);
    const cola = new ColaEnMemoria();

    await repoRecoger(prisma, cola).recogerLote(["o1"], MENSAJERO, idEstado("mensajero_recogiendo_en_bodega"), idEstado("en_reparto"), DIA_CR);

    // El 4.º argumento de `enqueue` es el cliente transaccional del writer (outbox).
    expect(cola.ruta[0].tx).toBe(tx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("si NINGUNA orden gano la guarda, no se encola nada (no hay nada que reoptimizar)", async () => {
    const { prisma } = prismaRecoger([]);
    const cola = new ColaEnMemoria();

    await repoRecoger(prisma, cola).recogerLote(["o1"], MENSAJERO, idEstado("mensajero_recogiendo_en_bodega"), idEstado("en_reparto"), DIA_CR);

    expect(cola.ruta).toHaveLength(0);
  });
});

describe("R17 — dos recogidas en la MISMA ventana producen UNA fila", () => {
  it("la segunda recogida choca con la clave y se descarta sin adelantar la primera", async () => {
    const cola = new ColaEnMemoria();

    const primera = prismaRecoger([{ id: "o1" }]);
    await repoRecoger(primera.prisma, cola, T0).recogerLote(
      ["o1"],
      MENSAJERO,
      idEstado("mensajero_recogiendo_en_bodega"),
      idEstado("en_reparto"),
      DIA_CR,
    );
    const runAfterPrimero = cola.ruta[0].opts.runAfter;

    // 20 s despues: el `runAfter` cae en la misma ventana de destino.
    const segunda = prismaRecoger([{ id: "o2" }]);
    await repoRecoger(segunda.prisma, cola, new Date(T0.getTime() + 20_000)).recogerLote(
      ["o2"],
      MENSAJERO,
      idEstado("mensajero_recogiendo_en_bodega"),
      idEstado("en_reparto"),
      DIA_CR,
    );

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter).toBe(runAfterPrimero);
  });

  it("mensajeros DISTINTOS en la misma ventana no se pisan", async () => {
    const cola = new ColaEnMemoria();
    for (const m of ["m-1", "m-2"]) {
      const { prisma } = prismaRecoger([{ id: "o1" }]);
      await repoRecoger(prisma, cola, T0).recogerLote(["o1"], m, idEstado("mensajero_recogiendo_en_bodega"), idEstado("en_reparto"), DIA_CR);
    }
    expect(cola.ruta).toHaveLength(2);
  });
});

// ⏳ 2026-10-29 (SLT-59, D2/D12): este bloque probaba 92/R19 (gestion INMEDIATA, namespace propio).
// La gestion pasa a debounce y comparte la clave de la recogida; los casos de abajo lo sustituyen.
describe("SLT-59 R21 — una gestion sobre una orden CON coordenadas encola con debounce", () => {
  it("deja UNA fila con runAfter = ahora + RUTA_DEBOUNCE_S y la clave `:debounce:`", async () => {
    const { prisma } = prismaGestion({ gestionId: "gestion-77" });
    const cola = new ColaEnMemoria();

    await repoRecoger(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO });
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
    expect(cola.ruta[0].opts.dedupeKey).toBe(
      dedupeKeyDebounce(MENSAJERO, new Date(T0.getTime() + 60_000)),
    );
  });

  it("el encolado va DENTRO de la transaccion de la gestion", async () => {
    const { prisma, tx } = prismaGestion();
    const cola = new ColaEnMemoria();
    await repoRecoger(prisma, cola).registrarGestionPendiente(GESTION_INPUT);
    expect(cola.ruta[0].tx).toBe(tx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("las coordenadas salen de la MISMA re-lectura de gestionable: ninguna consulta nueva", async () => {
    const { prisma, tx } = prismaGestion();
    const cola = new ColaEnMemoria();
    await repoRecoger(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    const sentencias = tx.$queryRaw.mock.calls.map((c) => {
      const q = c[0] as unknown;
      return (Array.isArray(q) ? q : ((q as { strings?: string[] }).strings ?? [])).join(" ");
    });
    // Una sola sentencia lleva las coordenadas, y es la re-lectura de gestionable (la que filtra
    // por el mensajero asignado), no una consulta aparte.
    const conCoordenadas = sentencias.filter((q) => q.includes("tiene_coordenadas"));
    expect(conCoordenadas).toHaveLength(1);
    expect(conCoordenadas[0]).toContain("mensajero_asignado_id");
  });
});

describe("SLT-59 R22 — una gestion sobre una orden SIN coordenadas no encola", () => {
  it("no deja ninguna fila de optimizacion_ruta, pero la gestion se registra", async () => {
    const { prisma } = prismaGestion({ coordenadas: false, gestionId: "gestion-9" });
    const cola = new ColaEnMemoria();

    const res = await repoRecoger(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(res?.gestionId).toBe("gestion-9");
    expect(cola.ruta).toHaveLength(0);
  });
});

describe("SLT-59 R23 — con un debounce en vuelo, la gestion NO crea otro job ni lo adelanta", () => {
  it("recogida y luego gestion en la misma ventana -> UNA fila con el runAfter de la recogida", async () => {
    const cola = new ColaEnMemoria();

    const recogida = prismaRecoger([{ id: "o1" }]);
    await repoRecoger(recogida.prisma, cola, T0).recogerLote(
      ["o1"],
      MENSAJERO,
      idEstado("mensajero_recogiendo_en_bodega"),
      idEstado("en_reparto"),
      DIA_CR,
    );
    const runAfterRecogida = cola.ruta[0].opts.runAfter;

    const gestion = prismaGestion({ gestionId: "gestion-77" });
    await repoRecoger(gestion.prisma, cola, new Date(T0.getTime() + 20_000)).registrarGestionPendiente(
      GESTION_INPUT,
    );

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter).toBe(runAfterRecogida);
  });

  it("dos gestiones en la misma ventana -> UNA fila", async () => {
    const cola = new ColaEnMemoria();

    const primera = prismaGestion({ gestionId: "gestion-1" });
    await repoRecoger(primera.prisma, cola, T0).registrarGestionPendiente(GESTION_INPUT);
    const runAfterPrimera = cola.ruta[0].opts.runAfter;
    const segunda = prismaGestion({ gestionId: "gestion-2" });
    await repoRecoger(segunda.prisma, cola, new Date(T0.getTime() + 20_000)).registrarGestionPendiente({
      ...GESTION_INPUT,
      ordenId: "o2",
    });

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].opts.runAfter).toBe(runAfterPrimera);
  });
});

describe("SLT-59 R25 — una gestion no gestionable no deja job", () => {
  it("si la re-lectura no devuelve fila, responde null y no encola", async () => {
    const { prisma } = prismaGestion({ gestionable: false });
    const cola = new ColaEnMemoria();

    const res = await repoRecoger(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(res).toBeNull();
    expect(cola.ruta).toHaveLength(0);
  });
});

describe("SLT-59 R26 — el encolado de la recogida no cambia", () => {
  it("la recogida sigue dejando su fila con debounce, la misma clave y el payload de siempre", async () => {
    const { prisma, tx } = prismaRecoger([{ id: "o1" }]);
    const cola = new ColaEnMemoria();

    await repoRecoger(prisma, cola).recogerLote(["o1"], MENSAJERO, idEstado("mensajero_recogiendo_en_bodega"), idEstado("en_reparto"), DIA_CR);

    expect(cola.ruta).toHaveLength(1);
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO });
    expect(cola.ruta[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
    expect(cola.ruta[0].opts.dedupeKey).toBe(
      dedupeKeyDebounce(MENSAJERO, new Date(T0.getTime() + 60_000)),
    );
    expect(cola.ruta[0].tx).toBe(tx);
  });
});

describe("R16 y SLT-59 R25 — una transaccion REVERTIDA no deja jobs huerfanos", () => {
  it("si el append del historial revienta en recogerLote, no queda job", async () => {
    const { prisma } = prismaRecoger([{ id: "o1" }], true);
    const cola = new ColaEnMemoria();

    await expect(
      repoRecoger(prisma, cola).recogerLote(["o1"], MENSAJERO, idEstado("mensajero_recogiendo_en_bodega"), idEstado("en_reparto"), DIA_CR),
    ).rejects.toThrow();

    // El encolado va DESPUES del append en la misma tx: nunca llego a ejecutarse.
    expect(cola.ruta).toHaveLength(0);
  });

  it("si el INSERT de la gestion revienta, tampoco queda job", async () => {
    const { prisma } = prismaGestion({ falla: true });
    const cola = new ColaEnMemoria();

    await expect(
      repoRecoger(prisma, cola).registrarGestionPendiente(GESTION_INPUT),
    ).rejects.toThrow();

    expect(cola.ruta).toHaveLength(0);
  });
});
