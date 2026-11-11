import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearEscenarioGeo47 } from "./_fixtures/geo-47";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SLT-47 (T1.2) — el fixture `geo-47` se siembra entero sobre Postgres real y deja lo que promete:
// los homonimos de R13 en las dos empresas y el cuarto nivel de `XA` con su zona propia (R36).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

describeSiHayBase("SLT-47 — fixture geo-47", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("siembra homonimos en CR y XA, y el cuarto nivel de XA", async () => {
    await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      for (const emp of [e.cr, e.xa]) {
        const nodos = await tx.nodoGeografico.findMany({
          where: { id: { in: [emp.homonimos.provinciaCentralId, emp.homonimos.cantonCentral1Id, emp.homonimos.cantonCentral2Id] } },
          select: { nombre: true },
        });
        expect(new Set(nodos.map((n) => n.nombre))).toEqual(new Set([emp.homonimos.nombreCentral]));
        expect(nodos).toHaveLength(3);
        const ordenes = await tx.orden.count({ where: { id: { in: Object.values(emp.ordenes) } } });
        expect(ordenes).toBe(4);
      }
      const sectores = await tx.nodoGeografico.findMany({
        where: { padreId: e.xa.cuarto.distritoConSectorId },
        select: { profundidad: true },
      });
      expect(sectores.map((s) => s.profundidad)).toEqual([4, 4]);
      const propia = await tx.zonaNodo.count({ where: { nodoGeograficoId: e.xa.cuarto.sectorPropioId } });
      expect(propia).toBe(1);
    });
  }, 60_000);
});
