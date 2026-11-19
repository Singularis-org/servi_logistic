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
// SLT-48 T5.1: se retiraron los 4 casos R13 que desviaban una fila de la tabla vieja a mano. Desde
// SLT-48 la tabla vieja es una vista del nodo (SLT-48 R1) y no puede diferir de él.

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
});
