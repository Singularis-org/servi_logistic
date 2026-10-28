import { describe, expect, it, vi } from "vitest";

import {
  CLAVE_CANDADO,
  INTERVALO_REINTENTO_MS,
  soltarCandado,
  tomarCandado,
  type ClienteCandado,
} from "@/scripts/demo-qa/candado";

// SL-43 (design §10.2; R32) — el candado entre ejecuciones, con un doble del cliente dueño. Que dos
// ejecuciones reales sobre la misma base se esperen lo mide T10 en integración (mutación 12).

/** Un doble de `$queryRaw` que contesta `tomado` según la lista, y anota el SQL y sus valores. */
function cliente(respuestas: boolean[] = [], opciones: { fallaAlSoltar?: boolean } = {}) {
  const llamadas: { sql: string; valores: unknown[] }[] = [];
  const $queryRaw = vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const sql = partes.join("?");
    llamadas.push({ sql, valores });
    if (sql.includes("pg_advisory_unlock")) {
      if (opciones.fallaAlSoltar) throw new Error("Connection terminated");
      return [{ soltado: true }];
    }
    return [{ tomado: respuestas.shift() ?? false }];
  });
  return { doble: { $queryRaw } as unknown as ClienteCandado, llamadas };
}

const sinCancelar = () => false;

describe("tomarCandado", () => {
  it("libre: lo toma al primer intento, con pg_try_advisory_lock(hashtext(clave)), sin esperar ni avisar", async () => {
    const { doble, llamadas } = cliente([true]);
    const esperar = vi.fn(async () => undefined);
    const avisar = vi.fn();
    expect(await tomarCandado(doble, { esperar, avisar, cancelado: sinCancelar })).toBe(true);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].sql).toMatch(/pg_try_advisory_lock\(hashtext\(\?\)\)/);
    expect(llamadas[0].valores).toEqual([CLAVE_CANDADO]);
    expect(CLAVE_CANDADO).toBe("servi_logistic:demo-qa");
    expect(esperar).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });

  it("ocupado: avisa que espera a otra ejecución y reintenta cada 5 s hasta tomarlo", async () => {
    const { doble, llamadas } = cliente([false, false, true]);
    const esperar = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    const avisar = vi.fn();
    expect(await tomarCandado(doble, { esperar, avisar, cancelado: sinCancelar })).toBe(true);
    expect(llamadas).toHaveLength(3);
    expect(INTERVALO_REINTENTO_MS).toBe(5_000);
    expect(esperar.mock.calls).toEqual([[5_000], [5_000]]);
    // Una línea al empezar a esperar, no una por intento.
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar.mock.calls[0][0]).toMatch(/^\[demo-qa\] .*espera a otra ejecución/);
  });

  it("el intervalo es inyectable", async () => {
    const { doble } = cliente([false, true]);
    const esperar = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    await tomarCandado(doble, { esperar, avisar: () => {}, cancelado: sinCancelar, intervaloMs: 7 });
    expect(esperar.mock.calls).toEqual([[7]]);
  });

  it("cancelado por el tope: deja de reintentar y devuelve false", async () => {
    const { doble, llamadas } = cliente([false, false, false, false]);
    let intentos = 0;
    const r = await tomarCandado(doble, {
      esperar: async () => {
        intentos++;
      },
      avisar: () => {},
      cancelado: () => intentos >= 2,
    });
    expect(r).toBe(false);
    expect(llamadas).toHaveLength(2);
  });
});

describe("soltarCandado", () => {
  it("suelta con pg_advisory_unlock sobre la misma clave", async () => {
    const { doble, llamadas } = cliente();
    await soltarCandado(doble);
    expect(llamadas[0].sql).toMatch(/pg_advisory_unlock\(hashtext\(\?\)\)/);
    expect(llamadas[0].valores).toEqual([CLAVE_CANDADO]);
  });

  it("si la conexión ya cayó no lanza: el candado de sesión cayó con ella (suelta también en error)", async () => {
    const { doble } = cliente([], { fallaAlSoltar: true });
    await expect(soltarCandado(doble)).resolves.toBeUndefined();
  });
});
