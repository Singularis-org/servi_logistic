import type { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";

import { conConsultasEnSeriePorTransaccion, crearSerie, serializarTransaccion } from "@/lib/db/consultas-en-serie";

// SL-43 (medición del build de QA, 2026-10-26) — una consulta a la vez por transacción. Prisma 7.8
// lanza los hijos de un `include` a la vez y, dentro de una transacción, van todos a la misma conexión
// de `pg` (`DeprecationWarning: Calling client.query() when the client is already executing a query`).

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una transacción falsa que anota cuántas consultas tiene en vuelo a la vez. */
function transaccionFalsa() {
  let enVuelo = 0;
  let maximo = 0;
  const orden: string[] = [];
  const ejecutar = async (q: { sql: string }) => {
    enVuelo++;
    maximo = Math.max(maximo, enVuelo);
    orden.push(`empieza ${q.sql}`);
    await esperar(q.sql === "lenta" ? 20 : 2);
    orden.push(`termina ${q.sql}`);
    enVuelo--;
    if (q.sql === "falla") throw new Error("falla");
  };
  const tx = {
    queryRaw: async (q: { sql: string }) => {
      await ejecutar(q);
      return { columnNames: [], columnTypes: [], rows: [] };
    },
    executeRaw: async (q: { sql: string }) => {
      await ejecutar(q);
      return 1;
    },
  };
  return { tx, maximo: () => maximo, orden };
}

const consulta = (sql: string) => ({ sql, args: [], argTypes: [] }) as never;

describe("crearSerie", () => {
  it("cada trabajo empieza cuando terminó el anterior, también si el anterior falló", async () => {
    const enSerie = crearSerie();
    const traza: string[] = [];
    const trabajo = (n: string, ms: number, falla = false) => async () => {
      traza.push(`+${n}`);
      await esperar(ms);
      traza.push(`-${n}`);
      if (falla) throw new Error(n);
      return n;
    };
    const resultados = await Promise.allSettled([enSerie(trabajo("a", 15, true)), enSerie(trabajo("b", 1)), enSerie(trabajo("c", 1))]);
    expect(traza).toEqual(["+a", "-a", "+b", "-b", "+c", "-c"]);
    expect(resultados.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
  });
});

describe("serializarTransaccion", () => {
  it("queryRaw y executeRaw lanzados a la vez no se solapan, y conservan el orden de llegada", async () => {
    const f = transaccionFalsa();
    const tx = serializarTransaccion(f.tx);
    const r = await Promise.all([
      tx.queryRaw(consulta("lenta")),
      tx.executeRaw(consulta("update")),
      tx.queryRaw(consulta("tercera")),
    ]);
    expect(f.maximo()).toBe(1);
    expect(f.orden).toEqual([
      "empieza lenta",
      "termina lenta",
      "empieza update",
      "termina update",
      "empieza tercera",
      "termina tercera",
    ]);
    expect(r[1]).toBe(1);
  });

  it("control: sin serializar, la misma transacción falsa sí las solapa", async () => {
    const f = transaccionFalsa();
    await Promise.all([f.tx.queryRaw({ sql: "lenta" }), f.tx.queryRaw({ sql: "otra" })]);
    expect(f.maximo()).toBe(2);
  });

  it("una consulta que falla no bloquea a las siguientes", async () => {
    const f = transaccionFalsa();
    const tx = serializarTransaccion(f.tx);
    const [mala, buena] = await Promise.allSettled([tx.queryRaw(consulta("falla")), tx.queryRaw(consulta("despues"))]);
    expect(mala.status).toBe("rejected");
    expect(buena.status).toBe("fulfilled");
  });
});

describe("conConsultasEnSeriePorTransaccion", () => {
  it("serializa las transacciones que abre el adaptador y deja igual las consultas fuera de ellas", async () => {
    const dentro = transaccionFalsa();
    const fuera = transaccionFalsa();
    const adaptador = {
      queryRaw: fuera.tx.queryRaw,
      startTransaction: async () => dentro.tx,
    };
    const fabrica = { connect: async () => adaptador } as unknown as PrismaPg;
    const a = await conConsultasEnSeriePorTransaccion(fabrica).connect();
    const tx = await a.startTransaction();
    await Promise.all([tx.queryRaw(consulta("lenta")), tx.queryRaw(consulta("otra"))]);
    expect(dentro.maximo()).toBe(1);
    // Fuera de transacción cada consulta va por su conexión del pool: no se tocan.
    await Promise.all([a.queryRaw(consulta("lenta")), a.queryRaw(consulta("otra"))]);
    expect(fuera.maximo()).toBe(2);
  });
});
