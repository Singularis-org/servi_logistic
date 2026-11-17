import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GeografiaDeOtroPais, traducirErrorDePais } from "@/lib/db/errores-pais";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  crearGeografiaDePrueba,
  crearNodoDeNivel,
  crearOrganizacionEnPais,
  crearPaisDePrueba,
  type GeografiaDePrueba,
} from "@/tests/fabricas/paises";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { errorEnSavepoint, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type FksDeOrden, type TxDeTest } from "./_postgres-real";

/**
 * SLT-48 · R7, R8, R9 (T1.6; design §2.1.4–§2.1.5) — los triggers de `orden`, `zona_distrito` y
 * `distrito_zona_especial` tras pasar las tablas viejas a vistas, contra Postgres real y dentro de
 * transacciones que siempre se revierten.
 *
 *   · R7: una orden con un nodo de otro país se rechaza (`SL021` → `GeografiaDeOtroPais`), al insertar
 *     y al cambiar su nodo, con las 3 FK en NULL: la comprobación lee el nodo.
 *   · R8: una fila de zona o de marca especial con geografía de otro país se rechaza, al insertar y al
 *     cambiar el distrito (cuando el nodo todavía es el de antes).
 *   · R9: una orden con FK y sin nodo recibe como nodo su lugar; una orden con nodo lo conserva.
 *
 * Empresa en el país de prueba `XA`; la geografía «de otro país» es la de Costa Rica que trae la base.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, nodo_geografico_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-48', '88880000', $4, $5, $6, $7, $8, $9, 'caja', now(), now())`;

interface Lugar {
  provinciaId?: string | null;
  cantonId?: string | null;
  distritoId?: string | null;
  nodoId?: string | null;
}

function argsDeOrden(fks: FksDeOrden, l: Lugar): unknown[] {
  const id = randomUUID();
  return [
    id,
    `SLT48-${id.slice(0, 8)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    l.provinciaId ?? null,
    l.cantonId ?? null,
    l.distritoId ?? null,
    l.nodoId ?? null,
  ];
}

interface Mundo {
  fks: FksDeOrden;
  xa: GeografiaDePrueba;
  otroDistritoXA: string;
  cr: GeografiaDePrueba;
}

/** Empresa en `XA` con su geografía; la de CR es Cartago/Cartago y su primer distrito. */
async function mundo(tx: TxDeTest): Promise<Mundo> {
  const { id: paisId } = await crearPaisDePrueba(tx, "XA");
  const empresa = await crearOrganizacionEnPais(tx, paisId);
  const xa = await crearGeografiaDePrueba(tx, paisId);
  const otro = await crearNodoDeNivel(tx, 3, { nombre: `Barrio otro ${randomUUID()}`, padreId: xa.cantonId });
  await fijarEmpresa(tx, empresa.id);
  const fks = await crearFksDeOrden(tx);
  const [cr] = await tx.$queryRawUnsafe<GeografiaDePrueba[]>(
    `SELECT p.id AS "provinciaId", c.id AS "cantonId", d.id AS "distritoId"
       FROM provincia p JOIN canton c ON c.provincia_id = p.id JOIN distrito d ON d.canton_id = c.id
      WHERE p.nombre = 'Cartago' AND c.nombre = 'Cartago' AND p.pais_id = 'CR'
      ORDER BY d.nombre LIMIT 1`,
  );
  if (cr === undefined) throw new Error("falta Cartago/Cartago en la base migrada");
  return { fks, xa, otroDistritoXA: otro.id, cr };
}

async function nodoDe(tx: TxDeTest, ordenId: string): Promise<string | null> {
  const [f] = await tx.$queryRawUnsafe<{ n: string | null }[]>(
    `SELECT nodo_geografico_id AS n FROM orden WHERE id = $1`,
    ordenId,
  );
  return f?.n ?? null;
}

describeSiHayBase("SLT-48 — triggers de país y de nodo sobre el árbol", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R7: una orden con solo nodo (FK en NULL) de otro país se rechaza con SL021 → GeografiaDeOtroPais; con el suyo entra", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await mundo(tx);
      const ajena = await errorEnSavepoint(tx, () =>
        tx.$executeRawUnsafe(INSERTAR_ORDEN, ...argsDeOrden(m.fks, { nodoId: m.cr.distritoId })),
      );
      const args = argsDeOrden(m.fks, { nodoId: m.xa.distritoId });
      const propia = await intentar(tx, INSERTAR_ORDEN, ...args);
      return {
        ajena: ajena === null ? null : String((ajena as Error).message).match(/orden\.nodo_geografico_id/) !== null,
        traducido: traducirErrorDePais(ajena) instanceof GeografiaDeOtroPais,
        propia,
        nodoPropia: await nodoDe(tx, args[0] as string),
        xa: m.xa.distritoId,
      };
    });
    expect(r).toEqual({ ajena: true, traducido: true, propia: null, nodoPropia: r.xa, xa: r.xa });
  });

  it("R7: cambiar el nodo de una orden a uno de otro país se rechaza y la orden queda como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await mundo(tx);
      const args = argsDeOrden(m.fks, { nodoId: m.xa.distritoId });
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, ...args);
      const id = args[0] as string;
      const fallo = await intentar(tx, `UPDATE orden SET nodo_geografico_id = $1 WHERE id = $2`, m.cr.distritoId, id);
      const bien = await intentar(tx, `UPDATE orden SET nodo_geografico_id = $1 WHERE id = $2`, m.otroDistritoXA, id);
      return { fallo, bien, nodo: await nodoDe(tx, id), esperado: m.otroDistritoXA };
    });
    expect(r).toEqual({ fallo: "SL021", bien: null, nodo: r.esperado, esperado: r.esperado });
  });

  it("R7: una orden de SQL a mano con FK de otro país (y sin nodo) se sigue rechazando", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await mundo(tx);
      return {
        distrito: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(m.fks, { ...m.xa, distritoId: m.cr.distritoId })),
        canton: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(m.fks, { ...m.xa, cantonId: m.cr.cantonId })),
        provincia: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(m.fks, { ...m.xa, provinciaId: m.cr.provinciaId })),
      };
    });
    expect(r).toEqual({ distrito: "SL021", canton: "SL021", provincia: "SL021" });
  });

  it("R8: zona_distrito y distrito_zona_especial rechazan un distrito de otro país al insertar y al cambiarlo", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await mundo(tx);
      const zonaCR = await intentar(
        tx,
        `INSERT INTO zona_distrito (id, zona_id, distrito_id) VALUES ($1, $2, $3)`,
        randomUUID(),
        m.fks.zonaId,
        m.cr.distritoId,
      );
      const marcaCR = await intentar(
        tx,
        `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`,
        randomUUID(),
        m.cr.distritoId,
      );
      const zonaDistritoId = randomUUID();
      const marcaId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO zona_distrito (id, zona_id, distrito_id) VALUES ($1, $2, $3)`,
        zonaDistritoId,
        m.fks.zonaId,
        m.xa.distritoId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`,
        marcaId,
        m.xa.distritoId,
      );
      // Al cambiar `distrito_id`, el nodo de la fila es todavía el de antes cuando corre el de país.
      const zonaACR = await intentar(tx, `UPDATE zona_distrito SET distrito_id = $1 WHERE id = $2`, m.cr.distritoId, zonaDistritoId);
      const marcaACR = await intentar(
        tx,
        `UPDATE distrito_zona_especial SET distrito_id = $1 WHERE id = $2`,
        m.cr.distritoId,
        marcaId,
      );
      const nodoACR = await intentar(
        tx,
        `UPDATE zona_distrito SET nodo_geografico_id = $1 WHERE id = $2`,
        m.cr.distritoId,
        zonaDistritoId,
      );
      const [tras] = await tx.$queryRawUnsafe<{ zd: string; zdn: string; dze: string }[]>(
        `SELECT (SELECT distrito_id FROM zona_distrito WHERE id = $1) AS zd,
                (SELECT nodo_geografico_id FROM zona_distrito WHERE id = $1) AS zdn,
                (SELECT distrito_id FROM distrito_zona_especial WHERE id = $2) AS dze`,
        zonaDistritoId,
        marcaId,
      );
      return { zonaCR, marcaCR, zonaACR, marcaACR, nodoACR, tras, xa: m.xa.distritoId };
    });
    expect(r).toEqual({
      zonaCR: "SL021",
      marcaCR: "SL021",
      zonaACR: "SL021",
      marcaACR: "SL021",
      nodoACR: "SL021",
      tras: { zd: r.xa, zdn: r.xa, dze: r.xa },
      xa: r.xa,
    });
  });

  it("R9: una orden con FK y sin nodo recibe su lugar (el distrito o, sin distrito, el cantón)", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await mundo(tx);
      const conDistrito = argsDeOrden(m.fks, m.xa);
      const sinDistrito = argsDeOrden(m.fks, { ...m.xa, distritoId: null });
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, ...conDistrito);
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, ...sinDistrito);
      return {
        conDistrito: await nodoDe(tx, conDistrito[0] as string),
        sinDistrito: await nodoDe(tx, sinDistrito[0] as string),
        xa: m.xa,
      };
    });
    expect(r.conDistrito).toBe(r.xa.distritoId);
    expect(r.sinDistrito).toBe(r.xa.cantonId);
  });

  it("R9: una orden que trae nodo lo conserva, con FK que apuntan a otro lugar o sin FK", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await mundo(tx);
      const conOtrasFk = argsDeOrden(m.fks, { ...m.xa, nodoId: m.otroDistritoXA });
      const soloNodo = argsDeOrden(m.fks, { nodoId: m.xa.cantonId });
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, ...conOtrasFk);
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, ...soloNodo);
      const [fks] = await tx.$queryRawUnsafe<{ p: string | null; c: string | null; d: string | null }[]>(
        `SELECT provincia_id AS p, canton_id AS c, distrito_id AS d FROM orden WHERE id = $1`,
        soloNodo[0],
      );
      return {
        conOtrasFk: await nodoDe(tx, conOtrasFk[0] as string),
        soloNodo: await nodoDe(tx, soloNodo[0] as string),
        fksSoloNodo: fks,
        m,
      };
    });
    expect(r.conOtrasFk).toBe(r.m.otroDistritoXA);
    expect(r.soloNodo).toBe(r.m.xa.cantonId);
    expect(r.fksSoloNodo).toEqual({ p: null, c: null, d: null });
  });
});
