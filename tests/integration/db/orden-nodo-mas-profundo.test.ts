import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crearEscenarioGeo43, crearOrdenGeo43, insertarNodo, type EscenarioGeo43 } from "./_fixtures/geo-43";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R28, R29 (T1.5; design §2.3) — EL TRIGGER DE `orden` CONSERVA UN NODO QUE CUELGA DE SU LUGAR.
 *
 * Contra Postgres real, con SQL directo (nada en SLT-89 escribe todavía un nodo más profundo: lo hará
 * SLT-48) y dentro de una transacción que siempre se revierte. El lugar de una orden es
 * `COALESCE(distrito_id, canton_id)`.
 *
 *   · R29: sin nodo, o con el nodo igual al lugar, queda el lugar (lo de SLT-43), también al mover el
 *     lugar sin tocar el nodo y al vaciar el distrito (la orden pasa al cantón).
 *   · R28: un nodo de profundidad 4 bajo el distrito se conserva; uno fuera de la rama se pisa con el
 *     lugar; cambiar el distrito deja fuera de la rama al nodo que traía y se pisa.
 *
 * El escenario es el de SLT-43 en el país de prueba `XA` (provincia, cantón y dos distritos), con un
 * tipo `nivel_4` y un sector bajo cada distrito.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Escenario extends EscenarioGeo43 {
  sectorId: string;
  sectorDelOtroId: string;
}

async function escenario(tx: TxDeTest): Promise<Escenario> {
  const e = await crearEscenarioGeo43(tx);
  await comoDueno(tx);
  const tipo4 = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, 'XA', 'nivel_4', 'Sector', 'Sectores')`,
    tipo4,
  );
  const sector = (padreId: string) =>
    insertarNodo(tx, { paisId: "XA", tipoId: tipo4, padreId, profundidad: 4, nombre: `Sector ${randomUUID().slice(0, 8)}` });
  return { ...e, sectorId: await sector(e.geo.distritoId), sectorDelOtroId: await sector(e.geo.otroDistritoId) };
}

async function nodoDe(tx: TxDeTest, ordenId: string): Promise<string | null> {
  const [fila] = await tx.$queryRawUnsafe<{ nodo: string | null }[]>(
    `SELECT nodo_geografico_id AS nodo FROM orden WHERE id = $1`,
    ordenId,
  );
  return fila.nodo;
}

/** Inserta una orden copiada de la del escenario con el lugar y el nodo dados. */
async function insertarOrden(
  tx: TxDeTest,
  e: Escenario,
  lugar: { distritoId: string | null },
  nodoId: string | null,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
         provincia_id, canton_id, distrito_id, nodo_geografico_id, producto, created_at, updated_at)
       SELECT $1, $2, estatus_id, destinatario, telefono_dest, tienda_id, zona_id, provincia_id, canton_id, $3, $4,
              producto, created_at, updated_at
         FROM orden WHERE id = $5`,
    id,
    `SLT89-${id.slice(0, 8)}`,
    lugar.distritoId,
    nodoId,
    e.ordenConDistritoId,
  );
  return id;
}

describeSiHayBase("SLT-89 · R28/R29 — el nodo de la orden", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R29: sin nodo queda el lugar (distrito o, sin distrito, cantón), como SLT-43", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const conDistrito = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, null);
      const sinDistrito = await insertarOrden(tx, e, { distritoId: null }, null);
      const deCrearOrden = await crearOrdenGeo43(tx, e, { distritoId: e.geo.otroDistritoId });
      return {
        e,
        conDistrito: await nodoDe(tx, conDistrito),
        sinDistrito: await nodoDe(tx, sinDistrito),
        deCrearOrden: await nodoDe(tx, deCrearOrden),
        delEscenario: [await nodoDe(tx, e.ordenConDistritoId), await nodoDe(tx, e.ordenSinDistritoId)],
      };
    });
    expect(r.conDistrito).toBe(r.e.geo.distritoId);
    expect(r.sinDistrito).toBe(r.e.geo.cantonId);
    expect(r.deCrearOrden).toBe(r.e.geo.otroDistritoId);
    expect(r.delEscenario).toEqual([r.e.geo.distritoId, r.e.geo.cantonId]);
  });

  it("R29: con el nodo igual al lugar queda ese mismo nodo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const enDistrito = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, e.geo.distritoId);
      const enCanton = await insertarOrden(tx, e, { distritoId: null }, e.geo.cantonId);
      return { e, enDistrito: await nodoDe(tx, enDistrito), enCanton: await nodoDe(tx, enCanton) };
    });
    expect(r.enDistrito).toBe(r.e.geo.distritoId);
    expect(r.enCanton).toBe(r.e.geo.cantonId);
  });

  it("R28: un nodo de profundidad 4 que cuelga del distrito se conserva, al insertar y al actualizar", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const insertada = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, e.sectorId);
      await tx.$executeRawUnsafe(`UPDATE orden SET nodo_geografico_id = $1 WHERE id = $2`, e.sectorId, e.ordenConDistritoId);
      const actualizada = await nodoDe(tx, e.ordenConDistritoId);
      // Reescribir una columna de la lista del trigger sin mover el lugar no lo pisa.
      await tx.$executeRawUnsafe(`UPDATE orden SET provincia_id = provincia_id WHERE id = $1`, e.ordenConDistritoId);
      return { e, insertada: await nodoDe(tx, insertada), actualizada, tras: await nodoDe(tx, e.ordenConDistritoId) };
    });
    expect(r.insertada).toBe(r.e.sectorId);
    expect(r.actualizada).toBe(r.e.sectorId);
    expect(r.tras).toBe(r.e.sectorId);
  });

  it("R28: sin distrito, el lugar es el cantón y un nodo que cuelga de él a dos saltos también se conserva", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const id = await insertarOrden(tx, e, { distritoId: null }, e.sectorId);
      return { e, nodo: await nodoDe(tx, id) };
    });
    expect(r.nodo).toBe(r.e.sectorId);
  });

  it("R28: un nodo fuera de la rama del lugar se pisa con el lugar", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      // El sector del OTRO distrito, el otro distrito (hermano) y la provincia (antepasado, no descendiente).
      const sectorAjeno = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, e.sectorDelOtroId);
      const hermano = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, e.geo.otroDistritoId);
      const antepasado = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, e.geo.provinciaId);
      return {
        e,
        nodos: [await nodoDe(tx, sectorAjeno), await nodoDe(tx, hermano), await nodoDe(tx, antepasado)],
      };
    });
    expect(r.nodos).toEqual([r.e.geo.distritoId, r.e.geo.distritoId, r.e.geo.distritoId]);
  });

  it("R28: cambiar el distrito deja fuera de la rama al sector que traía y queda el distrito nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const id = await insertarOrden(tx, e, { distritoId: e.geo.distritoId }, e.sectorId);
      const antes = await nodoDe(tx, id);
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = $1 WHERE id = $2`, e.geo.otroDistritoId, id);
      return { e, antes, despues: await nodoDe(tx, id) };
    });
    expect(r.antes).toBe(r.e.sectorId);
    expect(r.despues).toBe(r.e.geo.otroDistritoId);
  });

  it("R29: mover el lugar sin tocar el nodo pone el lugar nuevo, también al vaciar el distrito (pasa al cantón)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      // Como hace la FK de `orden.distrito_id` al borrar un distrito: el distrito viejo cuelga del
      // cantón, pero no lo escribió nadie; si se quedara, su FK RESTRICT impediría borrarlo.
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = NULL WHERE id = $1`, e.ordenConDistritoId);
      const alCanton = await nodoDe(tx, e.ordenConDistritoId);
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = $1 WHERE id = $2`, e.geo.otroDistritoId, e.ordenConDistritoId);
      const alOtro = await nodoDe(tx, e.ordenConDistritoId);
      // Con un sector puesto, vaciar el distrito tampoco lo conserva: el nodo no lo escribió nadie.
      await tx.$executeRawUnsafe(
        `UPDATE orden SET distrito_id = $1, nodo_geografico_id = $2 WHERE id = $3`,
        e.geo.distritoId,
        e.sectorId,
        e.ordenConDistritoId,
      );
      const conSector = await nodoDe(tx, e.ordenConDistritoId);
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = NULL WHERE id = $1`, e.ordenConDistritoId);
      return { e, alCanton, alOtro, conSector, sectorAlCanton: await nodoDe(tx, e.ordenConDistritoId) };
    });
    expect(r.alCanton).toBe(r.e.geo.cantonId);
    expect(r.alOtro).toBe(r.e.geo.otroDistritoId);
    expect(r.conSector).toBe(r.e.sectorId);
    expect(r.sectorAlCanton).toBe(r.e.geo.cantonId);
  });
});
