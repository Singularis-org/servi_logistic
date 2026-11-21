import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearEscenarioGeo65, sembrarOrdenIncoherente, type EmpresaGeo65 } from "./_fixtures/geo-65";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-65 (T0.2; design §14) — ANTIVACIO del fixture `geo-65.ts`: cuenta lo que siembra, para que un
// fixture roto no deje en verde, por vacios, los tests de ordenes, cierres, conteo y zona.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function contar(tx: TxDeTest, e: EmpresaGeo65) {
  const ordenIds = Object.values(e.ordenes);
  return {
    ordenes: await tx.orden.count({ where: { id: { in: ordenIds }, tiendaId: e.base.tiendaId } }),
    sinDistrito: await tx.orden.count({ where: { id: { in: ordenIds }, distritoId: null } }),
    conMarca: await tx.orden.count({ where: { id: { in: ordenIds }, distritoId: { in: e.base.marcas } } }),
    gestionesSinCierre: await tx.gestionOrden.count({
      where: { mensajeroId: e.mensajeroId, cierreId: null, anuladaAt: null },
    }),
    gestionesEnCierre: await tx.gestionOrden.count({ where: { cierreId: e.cierreId } }),
    detallesDelCierre: await tx.cierreDetail.count({ where: { cierreId: e.cierreId } }),
    enEstante: await tx.orden.count({
      where: { id: { in: ordenIds }, estatus: { value: "en_bodega_satelite" } },
    }),
    desalineadasConLaCentral: await tx.orden.count({
      where: { distritoId: e.base.geo.distritoCentralId, zonaId: { not: e.base.zonas.centralId } },
    }),
  };
}

describeSiHayBase("SLT-65 T0.2 — fixture geo-65 (antivacio)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("siembra en cada empresa las ordenes, gestiones, el cierre y la orden incoherente que prometen", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const incoherente = await sembrarOrdenIncoherente(tx, e.cr.base);
      const cadena = await tx.orden.findUniqueOrThrow({
        where: { id: incoherente },
        select: { cantonId: true, distrito: { select: { cantonId: true } } },
      });
      return { cr: await contar(tx, e.cr), xa: await contar(tx, e.xa), cadena, paises: [e.cr.base.paisId, e.xa.base.paisId] };
    });

    expect(r.paises).toEqual(["CR", "XA"]);
    for (const cuenta of [r.cr, r.xa]) {
      expect(cuenta).toEqual({
        ordenes: 11,
        sinDistrito: 3,
        conMarca: 2 + 3, // conDistritoConMarca, bajoCantonRetirado y las tres desalineadas del central
        gestionesSinCierre: 4,
        gestionesEnCierre: 1,
        detallesDelCierre: 1,
        enEstante: 1,
        desalineadasConLaCentral: 3,
      });
    }
    // La incoherente: su distrito cuelga de otro canton que el suyo.
    expect(r.cadena.distrito?.cantonId).not.toBe(r.cadena.cantonId);
  });
});
