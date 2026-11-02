import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEDUPE_PREFIX,
  dedupeKeyDebounce,
  encolarOptimizacionDebounce,
  dedupeKeyPrimeraRecogida,
  encolarPrimeraRutaPorRecogida,
  primeraRutaPendiente,
} from "@/lib/services/jobs/optimizacion-ruta-encolado";
import type {
  EncolarOMoverOpts,
  EnqueueOpts,
  IJobRepository,
  IJobRepositoryMovible,
} from "@/lib/interfaces/repositories/IJobRepository";
import type { JobTipo } from "@prisma/client";

// Feature 92 (R17/R18) y SLT-59 (R23, R24, R32) — las claves de idempotencia del job de
// optimizacion.
//
// La trampa que este archivo protege: la clave del debounce lleva una VENTANA TEMPORAL. Sin ella
// quedaria ocupada PARA SIEMPRE por la primera fila `done` (el indice unico de `dedupe_key` no esta
// acotado por estado y las filas completadas no se purgan). Es la trampa exacta de F1.4-Q4/91, y
// desde SLT-59 tambien es la de la gestion (R24), que ya usa esta misma clave.
//
// ⏳ 2026-10-29 (SLT-59, T3.2): se retiraron los casos del disparo INMEDIATO (namespace
// `:inmediato:`): la gestion ahora comparte el espacio `:debounce:` y que un job en vuelo la trague
// es lo buscado (R23).

const MENSAJERO = "m-1";
const T0 = new Date("2026-07-20T10:00:00.000Z");

/** Cola en memoria con la MISMA regla de unicidad que el indice de `jobs`. */
function colaEnMemoria() {
  const filas: { tipo: JobTipo; payload: Record<string, unknown>; opts: EnqueueOpts }[] = [];
  const repo = {
    enqueue: vi.fn(async (tipo: JobTipo, payload: Record<string, unknown>, opts: EnqueueOpts = {}) => {
      const key = opts.dedupeKey ?? null;
      // ON CONFLICT ("dedupe_key") WHERE dedupe_key IS NOT NULL DO NOTHING.
      if (key !== null && filas.some((f) => f.opts.dedupeKey === key)) return null;
      filas.push({ tipo, payload, opts });
      return null;
    }),
    claimBatch: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    findByDedupeKeys: vi.fn(async () => []),
  } as unknown as IJobRepository;
  return { repo, filas };
}

describe("R18 — la clave del debounce lleva ventana temporal", () => {
  it("dos runAfter del MISMO minuto producen la MISMA clave", () => {
    const a = new Date("2026-07-20T10:05:00.000Z");
    const b = new Date("2026-07-20T10:05:59.999Z");
    expect(dedupeKeyDebounce(MENSAJERO, a)).toBe(dedupeKeyDebounce(MENSAJERO, b));
  });

  it("el minuto SIGUIENTE produce una clave DISTINTA (la clave nunca queda ocupada para siempre)", () => {
    const a = new Date("2026-07-20T10:05:59.999Z");
    const b = new Date("2026-07-20T10:06:00.000Z");
    expect(dedupeKeyDebounce(MENSAJERO, a)).not.toBe(dedupeKeyDebounce(MENSAJERO, b));
  });

  it("la clave CONTIENE un componente que avanza con el reloj", () => {
    const clave = dedupeKeyDebounce(MENSAJERO, T0);
    const ventana = Math.floor(T0.getTime() / 60_000);
    expect(clave).toBe(`${DEDUPE_PREFIX}:${MENSAJERO}:debounce:${ventana}`);
    // Y una hora despues el sufijo ES otro numero: no es una constante disfrazada.
    const despues = dedupeKeyDebounce(MENSAJERO, new Date(T0.getTime() + 3_600_000));
    expect(despues).not.toBe(clave);
  });

  it("mensajeros distintos nunca comparten clave en la misma ventana", () => {
    expect(dedupeKeyDebounce("m-1", T0)).not.toBe(dedupeKeyDebounce("m-2", T0));
  });
});

describe("R17 — el debounce colapsa eventos de la misma ventana", () => {
  it("dos recogidas en el mismo instante -> UNA sola fila de job", async () => {
    const { repo, filas } = colaEnMemoria();
    const opts = { ahora: T0, debounceS: 60, origen: "gestion" as const };

    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, opts);
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, opts);

    expect(filas).toHaveLength(1);
  });

  it("la segunda recogida NO adelanta el runAfter de la primera", async () => {
    const { repo, filas } = colaEnMemoria();

    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });
    const runAfterPrimero = filas[0].opts.runAfter;
    // 20 s despues, dentro de la misma ventana de destino.
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 20_000),
      debounceS: 60,
      origen: "gestion",
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].opts.runAfter).toBe(runAfterPrimero);
  });

  // SLT-59 (D28): y el `origen` del evento, que no es PII.
  it("el runAfter es ahora + debounceS y el payload lleva SOLO el mensajeroId y el origen (PII)", async () => {
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });

    expect(filas[0].tipo).toBe("optimizacion_ruta");
    expect(filas[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "gestion" });
    expect(filas[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
  });
});

describe("SLT-59 D28 — el job agrupado por debounce conserva el origen del PRIMER evento", () => {
  it("traspaso y luego gestion en la misma ventana -> una fila con origen traspaso", async () => {
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: T0,
      debounceS: 60,
      origen: "traspaso",
    });
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 10_000),
      debounceS: 60,
      origen: "gestion",
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "traspaso" });
  });
});

describe("R23 — una gestion con un job de debounce en vuelo no crea otro ni lo adelanta", () => {
  it("recogida y luego gestion en la misma ventana -> UNA fila, con el runAfter de la recogida", async () => {
    const { repo, filas } = colaEnMemoria();

    // Recogida y gestion pasan por el MISMO helper desde SLT-59: lo que las distingue es el instante.
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });
    const runAfterRecogida = filas[0].opts.runAfter;
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 15_000),
      debounceS: 60,
      origen: "gestion",
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].opts.runAfter).toBe(runAfterRecogida);
    expect(filas[0].opts.dedupeKey).toContain(":debounce:");
  });

  it("ya no existe el namespace `:inmediato:`: ninguna fila lo usa", async () => {
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });
    expect(filas.every((f) => !String(f.opts.dedupeKey).includes(":inmediato:"))).toBe(true);
  });
});

describe("R24 — la clave de la gestion nunca queda ocupada para siempre por una fila `done`", () => {
  it("una gestion en la ventana SIGUIENTE inserta su propia fila aunque la anterior siga en la tabla", async () => {
    const { repo, filas } = colaEnMemoria();

    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });
    // La fila anterior sigue ahi (como una `done` que no se purga); 2 minutos despues es otra ventana.
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 120_000),
      debounceS: 60,
      origen: "gestion",
    });

    expect(filas).toHaveLength(2);
    expect(filas[0].opts.dedupeKey).not.toBe(filas[1].opts.dedupeKey);
  });
});

describe("R32 — max_intentos de la reoptimizacion sale de RUTA_OPT_MAX_INTENTOS", () => {
  const previo = process.env.RUTA_OPT_MAX_INTENTOS;
  afterEach(() => {
    if (previo === undefined) delete process.env.RUTA_OPT_MAX_INTENTOS;
    else process.env.RUTA_OPT_MAX_INTENTOS = previo;
  });

  it("sin override, el job se encola con 3 intentos (D9), no con los 5 de antes", async () => {
    delete process.env.RUTA_OPT_MAX_INTENTOS;
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });
    expect(filas[0].opts.maxIntentos).toBe(3);
  });

  it("con RUTA_OPT_MAX_INTENTOS=2, el job se encola con 2", async () => {
    process.env.RUTA_OPT_MAX_INTENTOS = "2";
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60, origen: "gestion" });
    expect(filas[0].opts.maxIntentos).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
// SLT-59 (R57, R58, R76, R77; design §12.2 nota D29) — la primera ruta del dia por recogida.
// ══════════════════════════════════════════════════════════════════════════════════════

describe("SLT-59 R76 — la clave de la primera ruta es por mensajero y DIA, sin ventana", () => {
  it("tiene la forma `ruta-opt:primera-recogida:<mensajeroId>:<diaCR>`", () => {
    expect(dedupeKeyPrimeraRecogida(MENSAJERO, "2026-07-20")).toBe(
      "ruta-opt:primera-recogida:m-1:2026-07-20",
    );
  });

  it("el dia siguiente es otra clave: la fila de ayer no bloquea la primera ruta de hoy", () => {
    expect(dedupeKeyPrimeraRecogida(MENSAJERO, "2026-07-21")).not.toBe(
      dedupeKeyPrimeraRecogida(MENSAJERO, "2026-07-20"),
    );
  });

  it("no comparte espacio con la clave de ventana `:debounce:` (no traga ni es tragada)", () => {
    const ventana = dedupeKeyDebounce(MENSAJERO, T0);
    expect(dedupeKeyPrimeraRecogida(MENSAJERO, "2026-07-20")).not.toContain(":debounce:");
    expect(ventana.startsWith("ruta-opt:primera-recogida:")).toBe(false);
  });
});

describe("SLT-59 glosario — primera ruta pendiente (puro, R67)", () => {
  // El dia CR del 20 empieza a las 06:00Z (`inicioDelDiaCREnUtc`), no a medianoche UTC.
  it.each([
    ["nunca calculada", null, true],
    ["calculada ayer por la noche en CR (05:59Z del 20)", new Date("2026-07-20T05:59:59.999Z"), true],
    ["calculada justo al empezar el dia CR (06:00Z)", new Date("2026-07-20T06:00:00.000Z"), false],
    ["calculada hoy a mediodia", new Date("2026-07-20T18:00:00.000Z"), false],
  ])("%s -> %s", (_caso, calculadaAt, esperado) => {
    expect(primeraRutaPendiente(calculadaAt, "2026-07-20")).toBe(esperado);
  });
});

/** Cola que registra lo que se pide a `encolarOMoverPendiente` (la semantica la miden los repos). */
function colaMovible() {
  const llamadas: { tipo: JobTipo; payload: Record<string, unknown>; opts: EncolarOMoverOpts }[] = [];
  const repo = {
    ...colaEnMemoria().repo,
    encolarOMoverPendiente: vi.fn(
      async (tipo: JobTipo, payload: Record<string, unknown>, opts: EncolarOMoverOpts) => {
        llamadas.push({ tipo, payload, opts });
        return null;
      },
    ),
  } as unknown as IJobRepositoryMovible;
  return { repo, llamadas };
}

describe("SLT-59 R58/R76 — encolarPrimeraRutaPorRecogida decide cuando corre y con que origen", () => {
  const VARS = ["RUTA_DEBOUNCE_S", "RUTA_PRIMERA_DEBOUNCE_MIN", "RUTA_OPT_MAX_INTENTOS"] as const;
  const previos = new Map(VARS.map((v) => [v, process.env[v]]));
  afterEach(() => {
    for (const [k, v] of previos) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  function limpiar() {
    for (const v of VARS) delete process.env[v];
  }

  it("R76: quedan por recoger -> ahora + 5 min, origen recogida_parcial, clave del dia", async () => {
    limpiar();
    const { repo, llamadas } = colaMovible();
    await encolarPrimeraRutaPorRecogida(repo, undefined, MENSAJERO, {
      ahora: T0,
      diaCR: "2026-07-20",
      quedanPorRecoger: true,
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].tipo).toBe("optimizacion_ruta");
    expect(llamadas[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida_parcial" });
    expect(llamadas[0].opts.runAfter.getTime()).toBe(T0.getTime() + 5 * 60_000);
    expect(llamadas[0].opts.dedupeKey).toBe(dedupeKeyPrimeraRecogida(MENSAJERO, "2026-07-20"));
    expect(llamadas[0].opts.maxIntentos).toBe(3);
  });

  it("R58: no quedan -> ahora + RUTA_DEBOUNCE_S, origen recogida, MISMA clave", async () => {
    limpiar();
    const { repo, llamadas } = colaMovible();
    await encolarPrimeraRutaPorRecogida(repo, undefined, MENSAJERO, {
      ahora: T0,
      diaCR: "2026-07-20",
      quedanPorRecoger: false,
    });
    expect(llamadas[0].payload).toEqual({ mensajeroId: MENSAJERO, origen: "recogida" });
    expect(llamadas[0].opts.runAfter.getTime()).toBe(T0.getTime() + 60_000);
    expect(llamadas[0].opts.dedupeKey).toBe(dedupeKeyPrimeraRecogida(MENSAJERO, "2026-07-20"));
  });

  it("las dos esperas salen de la config (RUTA_PRIMERA_DEBOUNCE_MIN=4, RUTA_DEBOUNCE_S=30)", async () => {
    limpiar();
    process.env.RUTA_PRIMERA_DEBOUNCE_MIN = "4";
    process.env.RUTA_DEBOUNCE_S = "30";
    const { repo, llamadas } = colaMovible();
    for (const quedanPorRecoger of [true, false]) {
      await encolarPrimeraRutaPorRecogida(repo, undefined, MENSAJERO, {
        ahora: T0,
        diaCR: "2026-07-20",
        quedanPorRecoger,
      });
    }
    expect(llamadas.map((l) => l.opts.runAfter.getTime() - T0.getTime())).toEqual([
      4 * 60_000,
      30_000,
    ]);
  });

  it("nunca usa `enqueue` (DO NOTHING): siempre `encolarOMoverPendiente`", async () => {
    limpiar();
    const { repo } = colaMovible();
    await encolarPrimeraRutaPorRecogida(repo, undefined, MENSAJERO, {
      ahora: T0,
      diaCR: "2026-07-20",
      quedanPorRecoger: true,
    });
    expect(repo.enqueue).not.toHaveBeenCalled();
  });
});
