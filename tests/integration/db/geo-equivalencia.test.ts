import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { aplicar, ejecutar, equivalencia, leerArgumentos } from "@/scripts/geo-backfill-nodo";
import { crearEscenarioGeo43, vaciarColumnasNuevas, type EscenarioGeo43 } from "./_fixtures/geo-43";
import { crearBasePropia43, type BasePropia43 } from "./_fixtures/base-propia-43";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, type TxDeTest } from "./_postgres-real";

// SLT-43 (T5.3; design §4) — modo `--equivalencia` de `scripts/geo-backfill-nodo.ts` (R32), contra
// Postgres real: por país, conteos de cada nivel viejo frente a los nodos de esa profundidad; por zona,
// los distritos de `zona_distrito` frente a sus nodos; y las órdenes sin nodo.
//
// Cada caso parte del escenario `XA` con el script ya aplicado (todo igual) y desvía UNA cosa a mano,
// dentro de una transacción del dueño que se revierte. Los triggers que hay que apagar para desviar se
// apagan y se encienden dentro de esa transacción, en una BASE PROPIA (`slt43_eq_…`, design §7): el
// `DISABLE TRIGGER` toma AccessExclusiveLock y en la base compartida bloquearía a otros archivos.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let propia: BasePropia43;
let base: PrismaClient;

const EQUIVALENCIA = leerArgumentos(["--equivalencia"]);

/** Escenario `XA` con el script aplicado: el punto de partida «iguales». */
async function escenarioAplicado(tx: TxDeTest): Promise<EscenarioGeo43> {
  const e = await crearEscenarioGeo43(tx);
  await comoDueno(tx);
  const r = await aplicar(tx);
  if (r.rechazado) throw new Error("la base de test tiene órdenes con la jerarquía rota: el caso no es medible");
  return e;
}

async function correr(tx: TxDeTest) {
  if (EQUIVALENCIA === null) throw new Error("--equivalencia no se reconoce");
  return { resumen: await equivalencia(tx), salida: await ejecutar(tx, EQUIVALENCIA, propia.url) };
}

describeSiHayBase("SLT-43 — equivalencia entre la geografía vieja y la nueva (R32)", () => {
  beforeAll(async () => {
    propia = await crearBasePropia43("eq");
    base = propia.prisma;
  }, 600_000);
  afterAll(async () => {
    await propia?.cerrar();
  }, 60_000);

  it("R32: tras el script, todo coincide y sale con código 0", async () => {
    const r = await revertida(base, async (tx) => {
      await escenarioAplicado(tx);
      return correr(tx);
    });
    expect(r.resumen).toEqual({ niveles: [], zonasDistintas: [], ordenesSinNodo: 0, iguales: true });
    expect(r.salida.codigoDeSalida).toBe(0);
    expect(r.salida.lineas).toContain("Equivalentes.");
  }, 60_000);

  it("R32: una fila de zona_distrito cuyo nodo se desvió a mano hace salir con código ≠ 0 y nombra la zona", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioAplicado(tx);
      await tx.$executeRawUnsafe(`ALTER TABLE zona_distrito DISABLE TRIGGER zona_distrito_nodo_geografico`);
      await tx.$executeRawUnsafe(
        `UPDATE zona_distrito SET nodo_geografico_id = $2 WHERE id = $1`,
        e.zonaDistritoId,
        e.geo.otroDistritoId,
      );
      await tx.$executeRawUnsafe(`ALTER TABLE zona_distrito ENABLE TRIGGER zona_distrito_nodo_geografico`);
      return { e, ...(await correr(tx)) };
    });
    expect(r.resumen.zonasDistintas).toContain(r.e.zonaId);
    expect(r.resumen.iguales).toBe(false);
    expect(r.salida.codigoDeSalida).not.toBe(0);
    expect(r.salida.lineas).toContain(`zona distinta ${r.e.zonaId}`);
  }, 60_000);

  it("R32: una orden con nodo vacío hace salir con código ≠ 0", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioAplicado(tx);
      await vaciarColumnasNuevas(tx, { orden: [e.ordenSinDistritoId] });
      return correr(tx);
    });
    expect(r.resumen.ordenesSinNodo).toBe(1);
    expect(r.resumen.zonasDistintas).toEqual([]);
    expect(r.resumen.niveles).toEqual([]);
    expect(r.salida.codigoDeSalida).not.toBe(0);
    expect(r.salida.lineas).toContain("ordenes sin nodo=1");
  }, 60_000);

  it("R32: un distrito sin nodo descuadra el conteo del nivel 3 de su país y sale con código ≠ 0", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioAplicado(tx);
      // Solo se llega aquí con la sincronía apagada a mano: la app no puede crear un distrito sin nodo.
      await tx.$executeRawUnsafe(`ALTER TABLE distrito DISABLE TRIGGER distrito_sincroniza_nodo_geografico`);
      await tx.distrito.create({
        data: { nombre: `Barrio sin nodo ${randomUUID().slice(0, 8)}`, cantonId: e.geo.cantonId },
        select: { id: true },
      });
      await tx.$executeRawUnsafe(`ALTER TABLE distrito ENABLE TRIGGER distrito_sincroniza_nodo_geografico`);
      return { e, ...(await correr(tx)) };
    });
    expect(r.resumen.niveles).toEqual([
      expect.objectContaining({ paisId: r.e.paisId, profundidad: 3 }),
    ]);
    const [n] = r.resumen.niveles;
    expect(n.vieja - n.nueva).toBe(1);
    expect(r.salida.codigoDeSalida).not.toBe(0);
  }, 60_000);
});
