import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ejecutar,
  equivalenciaGeografia,
  informeDeEquivalenciaGeografia,
  leerArgumentos,
} from "@/scripts/geo-backfill-nodo";
import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { insertarNodo, tiposDeNivel } from "./_fixtures/geo-43";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T8.1; design §10) — modo `--equivalencia-geografia` de `scripts/geo-backfill-nodo.ts` (R13),
// contra Postgres real: fila a fila, la geografía vieja frente a los nodos de profundidad 1–3.
//
// Cada caso crea un país propio (`XQ`) con una rama 1 → 3 escrita en el NODO (la copia de SLT-46 deja
// las filas viejas iguales) dentro de una transacción del dueño que se revierte. La comparación se
// acota a ese país: la base es compartida y no se puede afirmar nada del resto. La salida del modo
// (`ejecutar`, que compara todos los países) se mira solo cuando el país propio ya basta para que
// difiera.
//
// Para desviar una fila sin que la copia o la sincronía la vuelvan a igualar se apagan los triggers con
// `SET LOCAL session_replication_role = replica`: vale solo para esta transacción y no toma el
// AccessExclusiveLock de un `DISABLE TRIGGER` (que en la base compartida bloquearía a otros archivos).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS = "XQ";
const EQUIVALENCIA_GEOGRAFIA = leerArgumentos(["--equivalencia-geografia"]);

let base: PrismaClient;

interface Rama {
  tx: TxDeTest;
  p: string;
  c: string;
  d: string;
}

/** País `XQ` con una rama 1 → 3 escrita en el nodo; las filas viejas las pone la copia. */
async function conRama<T>(fn: (r: Rama) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    await comoDueno(tx);
    await crearPaisDePrueba(tx, PAIS);
    const t = await tiposDeNivel(tx, PAIS);
    const s = randomUUID().replace(/-/g, "").slice(0, 8);
    const p = await insertarNodo(tx, { paisId: PAIS, tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `Región ${s}`, codigoOficial: "R1" });
    const c = await insertarNodo(tx, { paisId: PAIS, tipoId: t.nivel2, padreId: p, profundidad: 2, nombre: `Comuna ${s}`, codigoOficial: "C1" });
    const d = await insertarNodo(tx, { paisId: PAIS, tipoId: t.nivel3, padreId: c, profundidad: 3, nombre: `Barrio ${s}` });
    return fn({ tx, p, c, d });
  });
}

/** Desvía a mano sin triggers (ni copia ni sincronía) y los vuelve a encender. */
async function sinTriggers(tx: TxDeTest, sql: string, ...valores: unknown[]): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
  await tx.$executeRawUnsafe(sql, ...valores);
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = origin`);
}

async function correrModo(tx: TxDeTest) {
  if (EQUIVALENCIA_GEOGRAFIA === null) throw new Error("--equivalencia-geografia no se reconoce");
  // Solo lectura: no exige --destino ni --base, así que la URL no importa.
  return ejecutar(tx, EQUIVALENCIA_GEOGRAFIA, undefined);
}

describeSiHayBase("SLT-46 — equivalencia fila a fila entre la geografía vieja y los nodos (R13)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R13: el modo se reconoce, sin --destino ni --base, y no se combina con otro modo", () => {
    expect(EQUIVALENCIA_GEOGRAFIA?.modo).toBe("equivalencia-geografia");
    expect(leerArgumentos(["--equivalencia-geografia", "--aplicar"])).toBeNull();
    expect(leerArgumentos(["--equivalencia-geografia", "--equivalencia"])).toBeNull();
  });

  it("R13: con todo igual, el país no tiene diferencias y el informe sale con código 0", async () => {
    const r = await conRama(async ({ tx }) => equivalenciaGeografia(tx, { paisId: PAIS }));
    expect(r).toEqual({ filasViejas: 3, nodos: 3, diferencias: [], iguales: true });
    const informe = informeDeEquivalenciaGeografia(r);
    expect(informe.codigoDeSalida).toBe(0);
    expect(informe.lineas).toEqual(["geografia filas viejas=3 nodos 1-3=3", "Geografía equivalente."]);
  });

  it("R13: el código de salida del modo es 0 si y solo si toda la base coincide", async () => {
    const r = await conRama(async ({ tx }) => ({
      resumen: await equivalenciaGeografia(tx),
      salida: await correrModo(tx),
    }));
    expect(r.salida.codigoDeSalida).toBe(r.resumen.iguales ? 0 : 1);
    expect(r.salida.lineas.at(-1)).toBe(r.resumen.iguales ? "Geografía equivalente." : "Geografía NO equivalente.");
  });

  it("R13: una provincia con otro nombre hace salir con código ≠ 0 y nombra el campo, sin el nombre", async () => {
    const r = await conRama(async ({ tx, p }) => {
      await sinTriggers(tx, `UPDATE provincia SET nombre = nombre || ' (otro)' WHERE id = $1`, p);
      return { p, resumen: await equivalenciaGeografia(tx, { paisId: PAIS }), salida: await correrModo(tx) };
    });
    expect(r.resumen.diferencias).toEqual([
      { paisId: PAIS, profundidad: 1, id: r.p, motivo: "distinta", campos: ["nombre"] },
    ]);
    expect(r.salida.codigoDeSalida).not.toBe(0);
    expect(r.salida.lineas).toContain(`fila ${PAIS}/1 ${r.p}: distinta (nombre)`);
    expect(r.salida.lineas.join("\n")).not.toContain("(otro)");
    expect(r.salida.lineas.at(-1)).toBe("Geografía NO equivalente.");
  });

  it("R13: código, activo y padre distintos también cuentan, cada uno con su campo", async () => {
    const r = await conRama(async ({ tx, p, c, d }) => {
      const t = await tiposDeNivel(tx, PAIS);
      const otraRegion = await insertarNodo(tx, { paisId: PAIS, tipoId: t.nivel1, padreId: null, profundidad: 1, nombre: `Otra ${randomUUID().slice(0, 8)}` });
      await sinTriggers(tx, `UPDATE provincia SET codigo_dta = 'R9' WHERE id = $1`, p);
      await sinTriggers(tx, `UPDATE canton SET provincia_id = $2 WHERE id = $1`, c, otraRegion);
      await sinTriggers(tx, `UPDATE distrito SET activo = false WHERE id = $1`, d);
      return { p, c, d, resumen: await equivalenciaGeografia(tx, { paisId: PAIS }) };
    });
    expect(r.resumen.diferencias).toEqual(
      [
        { paisId: PAIS, profundidad: 1, id: r.p, motivo: "distinta", campos: ["codigo"] },
        { paisId: PAIS, profundidad: 2, id: r.c, motivo: "distinta", campos: ["padre"] },
        { paisId: PAIS, profundidad: 3, id: r.d, motivo: "distinta", campos: ["activo"] },
      ],
    );
    expect(informeDeEquivalenciaGeografia(r.resumen).codigoDeSalida).not.toBe(0);
  });

  it("R13: un nodo sin su fila vieja hace salir con código ≠ 0", async () => {
    const r = await conRama(async ({ tx, d }) => {
      await sinTriggers(tx, `DELETE FROM distrito WHERE id = $1`, d);
      return { d, resumen: await equivalenciaGeografia(tx, { paisId: PAIS }), salida: await correrModo(tx) };
    });
    expect(r.resumen).toMatchObject({ filasViejas: 2, nodos: 3, iguales: false });
    expect(r.resumen.diferencias).toEqual([
      { paisId: PAIS, profundidad: 3, id: r.d, motivo: "sin_fila_vieja", campos: [] },
    ]);
    expect(r.salida.codigoDeSalida).not.toBe(0);
    expect(r.salida.lineas).toContain(`geografia ${PAIS}/3: sin nodo=0 sin fila vieja=1 distintas=0`);
  });

  it("R13: una fila vieja sin su nodo hace salir con código ≠ 0", async () => {
    const r = await conRama(async ({ tx, c }) => {
      const id = randomUUID();
      // Con los triggers apagados nadie pone el país del distrito: va explícito.
      await sinTriggers(
        tx,
        `INSERT INTO distrito (id, nombre, canton_id, pais_id, activo) VALUES ($1, $2, $3, $4, true)`,
        id,
        `Barrio sin nodo ${id.slice(0, 8)}`,
        c,
        PAIS,
      );
      return { id, resumen: await equivalenciaGeografia(tx, { paisId: PAIS }), salida: await correrModo(tx) };
    });
    expect(r.resumen).toMatchObject({ filasViejas: 4, nodos: 3, iguales: false });
    expect(r.resumen.diferencias).toEqual([
      { paisId: PAIS, profundidad: 3, id: r.id, motivo: "sin_nodo", campos: [] },
    ]);
    expect(r.salida.codigoDeSalida).not.toBe(0);
    expect(r.salida.lineas).toContain(`fila ${PAIS}/3 ${r.id}: sin_nodo`);
  });
});
