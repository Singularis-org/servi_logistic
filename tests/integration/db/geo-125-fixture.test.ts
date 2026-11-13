import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearEscenarioGeo125 } from "./_fixtures/geo-125";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SLT-125 (T1.3) — el fixture `geo-125` se siembra entero sobre Postgres real y deja lo que promete:
// en CR y en XA, tres ordenes (con y sin distrito) de un mensajero propio, cada una con su gestion
// vigente sin cierre, y el nivel 4 de XA en el catalogo. No afirma ningun requisito: eso lo hacen los
// tests de T2 que lo usan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

describeSiHayBase("SLT-125 — fixture geo-125", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("siembra en CR y XA las ordenes con y sin distrito y las gestiones sin cierre de un mensajero propio", async () => {
    await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      for (const emp of [e.cr, e.xa]) {
        const ordenes = await tx.orden.findMany({
          where: { id: { in: Object.values(emp.ordenes) } },
          select: { id: true, distritoId: true, organizacionId: true },
        });
        expect(ordenes).toHaveLength(3);
        expect(new Set(ordenes.map((o) => o.organizacionId))).toEqual(new Set([emp.empresaId]));
        expect(ordenes.find((o) => o.id === emp.ordenes.sinDistritoId)?.distritoId).toBeNull();
        expect(ordenes.filter((o) => o.distritoId !== null)).toHaveLength(2);

        const gestiones = await tx.gestionOrden.findMany({
          where: { mensajeroId: emp.mensajeroId },
          select: { id: true, cierreId: true },
        });
        expect(new Set(gestiones.map((g) => g.id))).toEqual(new Set(emp.gestionesSinCierreIds));
        expect(gestiones.every((g) => g.cierreId === null)).toBe(true);
        expect(emp.paraSolicitarCierre.mensajeroId).toBe(emp.mensajeroId);
      }
      const nivel4 = await tx.tipoNivelGeografico.count({ where: { id: e.geo47.xa.cuarto.tipoNivel4Id } });
      expect(nivel4).toBe(1);
    });
  }, 60_000);
});
