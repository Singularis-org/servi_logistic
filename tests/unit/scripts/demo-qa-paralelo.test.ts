import { describe, expect, it } from "vitest";

import { enParalelo } from "@/scripts/demo-qa/paralelo";

// SL-43 (medición del build, 2026-10-26) — `enParalelo`: a la vez, y el fallo espera a los demás.

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("enParalelo", () => {
  it("devuelve los resultados en el orden de los trabajos, con su tipo", async () => {
    const [a, b] = await enParalelo([esperar(10).then(() => 1), Promise.resolve("dos")]);
    expect([a, b]).toEqual([1, "dos"]);
  });

  it("los trabajos corren a la vez: dos esperas de 40 ms no tardan 80", async () => {
    const inicio = Date.now();
    await enParalelo([esperar(40), esperar(40)]);
    expect(Date.now() - inicio).toBeLessThan(75);
  });

  it("un fallo se lanza cuando los demás ya terminaron, no antes", async () => {
    let lentoTermino = false;
    const lento = esperar(30).then(() => {
      lentoTermino = true;
    });
    const error = new Error("falló el primero");
    await expect(enParalelo([Promise.reject(error), lento])).rejects.toBe(error);
    expect(lentoTermino).toBe(true);
  });

  it("con varios fallos, lanza el del primer trabajo de la lista", async () => {
    const primero = new Error("primero");
    const segundo = new Error("segundo");
    await expect(enParalelo([esperar(20).then(() => Promise.reject(primero)), Promise.reject(segundo)])).rejects.toBe(primero);
  });
});
