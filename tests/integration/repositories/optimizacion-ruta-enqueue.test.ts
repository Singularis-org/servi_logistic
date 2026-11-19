import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type {
  EnqueueOpts,
  IJobRepository,
  JobDTO,
  JobTxClient,
} from "@/lib/interfaces/repositories/IJobRepository";
import type { JobTipo } from "@prisma/client";
import { dedupeKeyDebounce } from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { idEstado, sembrarCatalogoEstados } from "@/tests/fixtures/catalogo-estados";
import { inicioDelDiaCR } from "@/tests/fabricas/reglas-pais";

// Feature 92 (R16/R17/R19) -> SLT-59 (R57-R61, R76, R77) — encolado TRANSACTIONAL OUTBOX desde los
// writers del mensajero. Prisma va mockeado (patron de `orden-geocode-enqueue.test.ts`). El
// `$transaction` fake respeta lo que importa: si el callback LANZA, la cola vuelve a como estaba.
// La cola en memoria honra la unicidad de `dedupe_key` igual que el indice unico parcial de la
// migracion de la 90. Asi el efecto de la clave se observa como FILAS, no como llamadas.
//
// SLT-79 (2026-11-03, decision humana «todo manual»): la primera ruta del dia la calcula SOLO el
// boton. Recoger ya no encola (SLT-59 R57/R58/R76/R77 retirados) y la primera gestion tampoco
// (R59 retirado). El traspaso ya solo encolaba con la primera ruta hecha (R60) y sigue igual.

const MENSAJERO = "m-1";
const T0 = new Date("2026-07-20T12:00:00.000Z");
/**
 * Feature 261 (B5): `recogerLote` recibe el DIA DE COSTA RICA EN CURSO ya resuelto por el
 * servicio. Medianoche UTC de la fecha calendario: el 20 de julio.
 */
const DIA_CR = new Date("2026-07-20T00:00:00.000Z");
/** El dia CR del 20 empieza a las 06:00Z: esto es «hoy» y lo de abajo, «ayer». */
const CALCULADA_HOY = new Date("2026-07-20T07:00:00.000Z");
const CALCULADA_AYER = new Date("2026-07-19T22:00:00.000Z");
const POR_RECOGER = idEstado("mensajero_recogiendo_en_bodega");
const EN_REPARTO = idEstado("en_reparto");

interface Fila {
  tipo: JobTipo;
  payload: Record<string, unknown>;
  opts: EnqueueOpts;
  tx?: JobTxClient;
  estado: "pending" | "processing" | "done" | "failed";
}

class ColaEnMemoria implements IJobRepository {
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
    this.filas.push({ tipo, payload, opts, tx, estado: "pending" });
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
 * Prisma fake de `recogerLote`. El `UPDATE … RETURNING` devuelve los ids que ganaron la guarda. Si
 * alguien vuelve a leer la ruta para decidir un job (lo que hacia SLT-59 §12.2), contesta «primera
 * pendiente»: el test lo veria como un job encolado.
 */
function prismaRecoger(
  cola: ColaEnMemoria,
  idsGanadores: { id: string }[],
  opts: { falla?: boolean } = {},
) {
  const tx = {
    $queryRaw: vi.fn(async (q: unknown) => {
      if (sqlDe(q).includes("ruta_optimizada")) {
        return [{ quedan_por_recoger: true, calculada_at: null }];
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

function recoger(cola: ColaEnMemoria, ahora: Date, ids: string[], opts: { falla?: boolean } = {}) {
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
  inicioDelDia: inicioDelDiaCR(T0),
};

beforeEach(async () => {
  await sembrarCatalogoEstados(); // feature 140: la guardia del choke point es de fallo CERRADO
  // Los defaults de la config: 60 s de debounce y 5 min de espera de la primera ruta (SLT-74/SLT-79).
  vi.stubEnv("RUTA_DEBOUNCE_S", "");
  vi.stubEnv("RUTA_PRIMERA_DEBOUNCE_MIN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------------------------------------ */
/* La recogida — SLT-79: no encola nada (SLT-59 R57, R58, R76, R77 retirados)                  */
/* ------------------------------------------------------------------------------------------ */

describe("SLT-79 — recoger NO encola ningun job, con o sin la primera ruta del dia", () => {
  it("una recogida parcial -> 0 jobs (antes R76: job del dia a +5 min)", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"]).promesa;
    expect(cola.filas).toHaveLength(0);
  });

  it("dos recogidas parciales seguidas -> 0 jobs", async () => {
    const cola = new ColaEnMemoria();
    await recoger(cola, T0, ["o1"]).promesa;
    await recoger(cola, new Date(T0.getTime() + 4 * 60_000), ["o2"]).promesa;
    expect(cola.filas).toHaveLength(0);
  });

  it("«recoger todas» (8 paquetes, el ultimo incluido) -> 0 jobs (antes R58: job a +60 s)", async () => {
    const cola = new ColaEnMemoria();
    const ids = Array.from({ length: 8 }, (_, i) => `o${i}`);
    const { promesa, prisma } = recoger(cola, T0, ids);
    expect(await promesa).toBe(8);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(cola.filas).toHaveLength(0);
  });

  it("la recogida ya no lee la ruta: ninguna sentencia nombra `ruta_optimizada`", async () => {
    const cola = new ColaEnMemoria();
    const { promesa, tx } = recoger(cola, T0, ["o1"]);
    await promesa;
    const sentencias = tx.$queryRaw.mock.calls.map((c) => sqlDe(c[0]));
    expect(sentencias.some((q) => q.includes('UPDATE "orden"'))).toBe(true);
    expect(sentencias.some((q) => q.includes("ruta_optimizada"))).toBe(false);
  });

  it("si el append del historial revienta, la recogida falla y no queda nada en la cola", async () => {
    const cola = new ColaEnMemoria();
    await expect(recoger(cola, T0, ["o1"], { falla: true }).promesa).rejects.toThrow();
    expect(cola.filas).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* La gestion: R21-R25; R59 retirado en SLT-79                                                */
/* ------------------------------------------------------------------------------------------ */

// ⏳ 2026-10-29 (SLT-59, D2/D12): este bloque probaba 92/R19 (gestion INMEDIATA, namespace propio).
// La gestion pasa a debounce y comparte la clave de la ventana; los casos de abajo lo sustituyen.
describe("SLT-59 R21 — una gestion sobre una orden CON coordenadas encola con debounce", () => {
  it("deja UNA fila con runAfter = ahora + RUTA_DEBOUNCE_S y la clave `:debounce:`", async () => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, { gestionId: "gestion-77" });

    await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);

    expect(cola.ruta).toHaveLength(1);
    // SLT-59 (D28, T8.3): la gestion deja su `origen` en el payload.
    expect(cola.ruta[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "gestion" });
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

  it("R67: coordenadas y `calculada_at` salen de la MISMA re-lectura de gestionable", async () => {
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

describe("SLT-79 — la gestion solo encola con la primera ruta del dia ya calculada", () => {
  it("SIN coordenadas y la primera ruta YA calculada: no deja fila, pero la gestion se registra (R22)", async () => {
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

  it.each([
    ["SIN coordenadas, nunca calculada (antes R59: 1 job)", false, null],
    ["SIN coordenadas, ruta de AYER (antes R59: 1 job)", false, CALCULADA_AYER],
    ["CON coordenadas, nunca calculada", true, null],
    ["CON coordenadas, ruta de AYER", true, CALCULADA_AYER],
  ])("la primera gestion del dia con la primera ruta PENDIENTE (%s) -> 0 jobs", async (_c, coordenadas, calculadaAt) => {
    const cola = new ColaEnMemoria();
    const { prisma } = prismaGestion(cola, { coordenadas, calculadaAt, gestionId: "gestion-1" });
    const res = await repoGestion(prisma, cola).registrarGestionPendiente(GESTION_INPUT);
    expect(res?.gestionId).toBe("gestion-1");
    expect(cola.ruta).toHaveLength(0);
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
    inicioDelDia: inicioDelDiaCR(T0),
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
      expect(f.opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
      expect(f.tx).toBe(tx);
      // SLT-59 (D28, T8.3): el traspaso deja su `origen` en el payload.
      expect(f.payload.origen).toBe("traspaso");
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
  it("asignarBodegaLote (crea ordenes por recoger) -> 0 jobs", async () => {
    const cola = new ColaEnMemoria();
    const enqueue = vi.spyOn(cola, "enqueue");
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
  });
});
