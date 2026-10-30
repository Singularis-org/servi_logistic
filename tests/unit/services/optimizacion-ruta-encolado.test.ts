import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEDUPE_PREFIX,
  dedupeKeyDebounce,
  encolarOptimizacionDebounce,
} from "@/lib/services/jobs/optimizacion-ruta-encolado";
import type { EnqueueOpts, IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
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
    const opts = { ahora: T0, debounceS: 60 };

    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, opts);
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, opts);

    expect(filas).toHaveLength(1);
  });

  it("la segunda recogida NO adelanta el runAfter de la primera", async () => {
    const { repo, filas } = colaEnMemoria();

    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });
    const runAfterPrimero = filas[0].opts.runAfter;
    // 20 s despues, dentro de la misma ventana de destino.
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 20_000),
      debounceS: 60,
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].opts.runAfter).toBe(runAfterPrimero);
  });

  it("el runAfter es ahora + debounceS y el payload lleva SOLO el mensajeroId (PII)", async () => {
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });

    expect(filas[0].tipo).toBe("optimizacion_ruta");
    expect(filas[0].payload).toEqual({ mensajeroId: MENSAJERO });
    expect(filas[0].opts.runAfter?.getTime()).toBe(T0.getTime() + 60_000);
  });
});

describe("R23 — una gestion con un job de debounce en vuelo no crea otro ni lo adelanta", () => {
  it("recogida y luego gestion en la misma ventana -> UNA fila, con el runAfter de la recogida", async () => {
    const { repo, filas } = colaEnMemoria();

    // Recogida y gestion pasan por el MISMO helper desde SLT-59: lo que las distingue es el instante.
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });
    const runAfterRecogida = filas[0].opts.runAfter;
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 15_000),
      debounceS: 60,
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].opts.runAfter).toBe(runAfterRecogida);
    expect(filas[0].opts.dedupeKey).toContain(":debounce:");
  });

  it("ya no existe el namespace `:inmediato:`: ninguna fila lo usa", async () => {
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });
    expect(filas.every((f) => !String(f.opts.dedupeKey).includes(":inmediato:"))).toBe(true);
  });
});

describe("R24 — la clave de la gestion nunca queda ocupada para siempre por una fila `done`", () => {
  it("una gestion en la ventana SIGUIENTE inserta su propia fila aunque la anterior siga en la tabla", async () => {
    const { repo, filas } = colaEnMemoria();

    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });
    // La fila anterior sigue ahi (como una `done` que no se purga); 2 minutos despues es otra ventana.
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, {
      ahora: new Date(T0.getTime() + 120_000),
      debounceS: 60,
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
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });
    expect(filas[0].opts.maxIntentos).toBe(3);
  });

  it("con RUTA_OPT_MAX_INTENTOS=2, el job se encola con 2", async () => {
    process.env.RUTA_OPT_MAX_INTENTOS = "2";
    const { repo, filas } = colaEnMemoria();
    await encolarOptimizacionDebounce(repo, undefined, MENSAJERO, { ahora: T0, debounceS: 60 });
    expect(filas[0].opts.maxIntentos).toBe(2);
  });
});
