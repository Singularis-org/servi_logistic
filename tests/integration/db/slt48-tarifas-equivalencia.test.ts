import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo65, type EmpresaGeo65 } from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-48 (T2.4; design §6; R31, R32) — EL PRECIO LEE EL NODO Y NO LAS 3 FK, Y DA LO MISMO.
//
// Sobre el fixture `geo-65` (CR y `XA`, ordenes con y sin distrito, con y sin marca), cada lectura que
// alimenta un cobro se hace dos veces sobre la MISMA orden vieja: con sus 3 FK, como esta en produccion,
// y con las 3 FK en NULL (el nodo intacto), como una orden nueva. Si el precio leyera una FK, la
// segunda lectura cambiaria. Las lecturas son las que dan el par de tarifa y la marca:
//  - el cobro de la devolucion (`findBaseCobroDevolucion`: zona, lugar del grupo, marca);
//  - la API v1 (`listByOwner`: el `costeo` con zona, lugar del grupo y marca);
//  - el listado de `/ordenes` (`findListItemsByIds`: el flete y su origen, ya resueltos).
// Y el lugar del grupo de una orden con distrito es su distrito; sin distrito, ninguno (R31).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo65, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.empresaId);
  try {
    return await conEmpresa(e.base.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** Lo que el dinero lee de las ordenes de la empresa, en el orden de `ids`. */
async function lecturasDeCobro(tx: TxDeTest, e: EmpresaGeo65, ids: readonly string[]) {
  return comoLaEmpresa(tx, e, async () => {
    const repo = new OrdenRepository(clienteConSavepoint(tx));
    const devolucion = [];
    for (const id of ids) devolucion.push(await repo.findBaseCobroDevolucion(id));
    const api = await repo.listByOwner({ ownerId: e.base.tiendaId, skip: 0, take: 500 });
    const costeo = new Map(api.items.map((i) => [i.numRemision, i.costeo]));
    const listado = await repo.findListItemsByIds(ids, { tipo: "global" });
    const fleteDe = new Map(
      listado.map((i) => [i.id, { fleteConIva: i.fleteConIva, fleteOrigen: i.fleteOrigen, zonaId: i.zonaId }]),
    );
    return { devolucion, costeo, fleteDe };
  });
}

/** Vacia las 3 FK de esas ordenes, como dueño; el nodo no cambia (el trigger lo conserva). */
async function vaciarFks(tx: TxDeTest, ids: readonly string[]): Promise<void> {
  await comoDueno(tx);
  await tx.$executeRawUnsafe(
    `UPDATE orden SET provincia_id = NULL, canton_id = NULL, distrito_id = NULL WHERE id = ANY($1::text[])`,
    [...ids],
  );
}

describeSiHayBase("SLT-48 R31/R32 — el precio de una orden vieja no cambia al leer el nodo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("con y sin las 3 FK, mismo par de tarifa, misma marca y mismo flete en CR y en XA", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const salida = [];
      for (const empresa of [e.cr, e.xa]) {
        const ids = Object.values(empresa.ordenes);
        const nodos = await tx.$queryRawUnsafe<{ id: string; nodo: string | null; distrito: string | null }[]>(
          `SELECT id, nodo_geografico_id AS nodo, distrito_id AS distrito FROM orden WHERE id = ANY($1::text[])`,
          ids,
        );
        const antes = await lecturasDeCobro(tx, empresa, ids);
        await vaciarFks(tx, ids);
        const nodosDespues = await tx.$queryRawUnsafe<{ id: string; nodo: string | null }[]>(
          `SELECT id, nodo_geografico_id AS nodo FROM orden WHERE id = ANY($1::text[])`,
          ids,
        );
        const despues = await lecturasDeCobro(tx, empresa, ids);
        salida.push({ ids, nodos, nodosDespues, antes, despues });
      }
      return salida;
    });

    for (const { ids, nodos, nodosDespues, antes, despues } of r) {
      // Antivacio: todas las ordenes del fixture, con y sin distrito, se leyeron por las tres vias.
      expect(ids.length).toBeGreaterThanOrEqual(10);
      expect(nodos.some((n) => n.distrito === null)).toBe(true);
      expect(antes.devolucion.every((d) => d !== null)).toBe(true);
      expect(antes.costeo.size).toBeGreaterThanOrEqual(ids.length);
      // El nodo no cambio al vaciar las FK.
      expect(new Map(nodosDespues.map((n) => [n.id, n.nodo]))).toEqual(new Map(nodos.map((n) => [n.id, n.nodo])));
      // R32: lo mismo con y sin FK.
      expect(despues.devolucion).toEqual(antes.devolucion);
      expect(despues.costeo).toEqual(antes.costeo);
      expect(despues.fleteDe).toEqual(antes.fleteDe);
      // R31: el lugar del grupo es el distrito de la orden; sin distrito, ninguno.
      const distritoDe = new Map(nodos.map((n) => [n.id, n.distrito]));
      ids.forEach((id, i) => expect(antes.devolucion[i]?.distritoId, id).toBe(distritoDe.get(id)));
    }
  }, 180_000);
});
