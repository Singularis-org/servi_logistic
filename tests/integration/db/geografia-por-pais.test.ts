import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeografiaDeOtroPais, traducirErrorDePais } from "@/lib/db/errores-pais";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  crearGeografiaDePrueba,
  crearOrganizacionEnPais,
  crearPaisDePrueba,
  type GeografiaDePrueba,
} from "@/tests/fabricas/paises";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, errorEnSavepoint, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type FksDeOrden, type TxDeTest } from "./_postgres-real";

// SL-20 (T1.2, T1.4, T1.7; design §2.3–§2.5) — la geografía cuelga del país, contra Postgres real.
//   · R2: los 585 nodos de Costa Rica están en `CR`, y cada cantón y distrito en el país de su padre.
//   · R11: el país del cantón y del distrito lo pone el trigger desde el padre; la FK compuesta
//     rechaza un hijo en otro país, también si alguien cambia el país del padre (ON UPDATE RESTRICT).
//   · R15/R16: nombre de provincia y código únicos POR PAÍS; dos países pueden repetirlos.
//   · R12: con la RLS, una empresa solo ve la geografía de su país.
//   · R13/R38: una orden, una zona–distrito o una marca de zona especial con geografía de otro país
//     falla con SL021, y `traducirErrorDePais` lo convierte en `GeografiaDeOtroPais`.
//
// Todo corre en transacciones del dueño que se revierten. El país de prueba es `XA` (fábrica
// `tests/fabricas/paises.ts`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** Un país `XA` con su geografía mínima, en la transacción del caso. */
async function paisXA(tx: TxDeTest, codigos?: Parameters<typeof crearGeografiaDePrueba>[2]): Promise<GeografiaDePrueba> {
  await crearPaisDePrueba(tx, "XA");
  return crearGeografiaDePrueba(tx, "XA", codigos);
}

async function paisDe(tx: TxDeTest, tabla: "provincia" | "canton" | "distrito", id: string): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ pais_id: string }[]>(`SELECT pais_id FROM ${tabla} WHERE id = $1`, id);
  return filas[0]?.pais_id ?? "(no existe)";
}

/** Un nodo de Costa Rica que viene de la migración: Cartago/Cartago y su primer distrito. */
async function geografiaCR(tx: TxDeTest): Promise<GeografiaDePrueba> {
  const canton = await tx.canton.findFirst({
    where: { nombre: "Cartago", provincia: { nombre: "Cartago", paisId: "CR" } },
    select: { id: true, provinciaId: true, distritos: { select: { id: true }, take: 1, orderBy: { nombre: "asc" } } },
  });
  if (canton === null || canton.distritos.length === 0) throw new Error("falta Cartago/Cartago en la base migrada");
  return { provinciaId: canton.provinciaId, cantonId: canton.id, distritoId: canton.distritos[0].id };
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SL20', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`;

function argsDeOrden(fks: FksDeOrden, geo: { provinciaId: string; cantonId: string; distritoId: string | null }): unknown[] {
  const id = randomUUID();
  return [id, `SL20-${id.slice(0, 8)}`, fks.estatusId, fks.tiendaId, fks.zonaId, geo.provinciaId, geo.cantonId, geo.distritoId];
}

describeSiHayBase("SL-20 — geografía por país", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2: los 585 nodos de la migración están en CR y cada hijo en el país de su padre", async () => {
    const [fila] = await base.$queryRawUnsafe<{ cr: number; huerfanos: number; desalineados: number }[]>(`
      SELECT
        (SELECT count(*) FROM provincia WHERE pais_id = 'CR' AND codigo_dta IS NOT NULL)
          + (SELECT count(*) FROM canton WHERE pais_id = 'CR' AND codigo_dta IS NOT NULL)
          + (SELECT count(*) FROM distrito WHERE pais_id = 'CR' AND codigo_dta IS NOT NULL) AS cr,
        (SELECT count(*) FROM provincia WHERE pais_id IS NULL) AS huerfanos,
        (SELECT count(*) FROM canton c JOIN provincia p ON p.id = c.provincia_id WHERE c.pais_id <> p.pais_id)
          + (SELECT count(*) FROM distrito d JOIN canton c ON c.id = d.canton_id WHERE d.pais_id <> c.pais_id) AS desalineados`);
    // Con código oficial: son los nodos de la DTA que trae la migración. Los que crean otros tests
    // en paralelo no llevan código y no cuentan.
    expect({ cr: Number(fila.cr), huerfanos: Number(fila.huerfanos), desalineados: Number(fila.desalineados) }).toEqual({
      cr: 585,
      huerfanos: 0,
      desalineados: 0,
    });
  });

  it("R10: una provincia creada sin país queda en CR", async () => {
    const pais = await revertida(base, async (tx) => {
      const p = await tx.provincia.create({ data: { nombre: `Sin país ${randomUUID()}` }, select: { paisId: true } });
      return p.paisId;
    });
    expect(pais).toBe("CR");
  });

  it("R11: el cantón y el distrito heredan el país del padre aunque se pida otro", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      // Se pide CR para un cantón de una provincia de XA: el trigger lo pisa con XA.
      const canton = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO canton (id, nombre, provincia_id, pais_id) VALUES ($1, $2, $3, 'CR')`,
        canton,
        `Cantón ${canton}`,
        xa.provinciaId,
      );
      return {
        canton: await paisDe(tx, "canton", xa.cantonId),
        distrito: await paisDe(tx, "distrito", xa.distritoId),
        pedidoCR: await paisDe(tx, "canton", canton),
        distritoCR: await paisDe(tx, "distrito", cr.distritoId),
      };
    });
    expect(r).toEqual({ canton: "XA", distrito: "XA", pedidoCR: "XA", distritoCR: "CR" });
  });

  it("R11: un nodo en otro país que su padre lo rechaza la base (23503) y nada cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      return {
        cantonAOtroPais: await intentar(tx, `UPDATE canton SET pais_id = 'CR' WHERE id = $1`, xa.cantonId),
        distritoAOtroPais: await intentar(tx, `UPDATE distrito SET pais_id = 'XA' WHERE id = $1`, cr.distritoId),
        // ON UPDATE RESTRICT: mover la provincia de país no arrastra a sus cantones.
        provinciaConHijos: await intentar(tx, `UPDATE provincia SET pais_id = 'CR' WHERE id = $1`, xa.provinciaId),
        padreInexistente: await intentar(tx, `INSERT INTO canton (id, nombre, provincia_id) VALUES ($1, 'x', 'no-existe')`, randomUUID()),
        tras: [
          await paisDe(tx, "provincia", xa.provinciaId),
          await paisDe(tx, "canton", xa.cantonId),
          await paisDe(tx, "distrito", cr.distritoId),
        ],
      };
    });
    expect(r).toEqual({
      cantonAOtroPais: "23503",
      distritoAOtroPais: "23503",
      provinciaConHijos: "23503",
      padreInexistente: "23503",
      tras: ["XA", "XA", "CR"],
    });
  });

  it("R11: mover un cantón a una provincia de otro país con distritos lo rechaza la base", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      return intentar(tx, `UPDATE canton SET provincia_id = $1 WHERE id = $2`, cr.provinciaId, xa.cantonId);
    });
    expect(r).toBe("23503");
  });

  it("R15/R16: nombre de provincia y códigos únicos dentro del país; otro país puede repetirlos", async () => {
    const r = await revertida(base, async (tx) => {
      const cr = await tx.provincia.findFirst({ where: { paisId: "CR", nombre: "Cartago" }, select: { codigoDta: true } });
      const cantonCR = await tx.canton.findFirst({ where: { paisId: "CR", codigoDta: { not: null } }, select: { codigoDta: true } });
      const distritoCR = await tx.distrito.findFirst({ where: { paisId: "CR", codigoDta: { not: null } }, select: { codigoDta: true } });
      // XA repite el nombre «Cartago» y los tres códigos de CR: vale.
      await crearPaisDePrueba(tx, "XA");
      const repetidos = await errorEnSavepoint(tx, async () => {
        const p = await tx.provincia.create({ data: { nombre: "Cartago", paisId: "XA", codigoDta: cr?.codigoDta } });
        const c = await tx.canton.create({ data: { nombre: "Cartago", provinciaId: p.id, codigoDta: cantonCR?.codigoDta } });
        await tx.distrito.create({ data: { nombre: "Cartago", cantonId: c.id, codigoDta: distritoCR?.codigoDta } });
      });
      const xa = await crearGeografiaDePrueba(tx, "XA");
      return {
        otroPaisRepite: repetidos,
        mismoPaisNombre: await intentar(tx, `INSERT INTO provincia (id, nombre, pais_id) VALUES ($1, 'Cartago', 'XA')`, randomUUID()),
        mismoPaisCodigoProvincia: await intentar(
          tx,
          `INSERT INTO provincia (id, nombre, pais_id, codigo_dta) VALUES ($1, $2, 'XA', $3)`,
          randomUUID(),
          `Otra ${randomUUID()}`,
          cr?.codigoDta,
        ),
        mismoPaisCodigoCanton: await intentar(
          tx,
          `INSERT INTO canton (id, nombre, provincia_id, codigo_dta) VALUES ($1, 'Otro', $2, $3)`,
          randomUUID(),
          xa.provinciaId,
          cantonCR?.codigoDta,
        ),
        mismoPaisCodigoDistrito: await intentar(
          tx,
          `INSERT INTO distrito (id, nombre, canton_id, codigo_dta) VALUES ($1, 'Otro', $2, $3)`,
          randomUUID(),
          xa.cantonId,
          distritoCR?.codigoDta,
        ),
        // Los NULL no compiten: dos provincias sin código en el mismo país.
        sinCodigo: await intentar(tx, `INSERT INTO provincia (id, nombre, pais_id) VALUES ($1, $2, 'XA')`, randomUUID(), `Sin código ${randomUUID()}`),
      };
    });
    expect(r).toEqual({
      otroPaisRepite: null,
      mismoPaisNombre: "23505",
      mismoPaisCodigoProvincia: "23505",
      mismoPaisCodigoCanton: "23505",
      mismoPaisCodigoDistrito: "23505",
      sinCodigo: null,
    });
  });

  it("R12: con la RLS, una empresa de XA solo ve la geografía de XA y una de CR no la ve", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      const empresaXA = await crearOrganizacionEnPais(tx, "XA");
      const empresaCR = await crearOrganizacion(tx);

      const ver = async () => ({
        paises: (
          await tx.$queryRawUnsafe<{ pais_id: string }[]>(
            `SELECT DISTINCT pais_id FROM (SELECT pais_id FROM provincia UNION ALL SELECT pais_id FROM canton
               UNION ALL SELECT pais_id FROM distrito) t ORDER BY 1`,
          )
        ).map((f) => f.pais_id),
        nodosXA: Number(
          (
            await tx.$queryRawUnsafe<{ n: number }[]>(
              `SELECT (SELECT count(*) FROM provincia WHERE id = $1) + (SELECT count(*) FROM canton WHERE id = $2)
                 + (SELECT count(*) FROM distrito WHERE id = $3) AS n`,
              xa.provinciaId,
              xa.cantonId,
              xa.distritoId,
            )
          )[0].n,
        ),
        distritoCR: Number(
          (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*) AS n FROM distrito WHERE id = $1`, cr.distritoId))[0].n,
        ),
      });

      await comoApp(tx, empresaXA.id);
      const vistaXA = await ver();
      await comoDueno(tx);
      await comoApp(tx, empresaCR.id);
      const vistaCR = await ver();
      await comoDueno(tx);
      return { vistaXA, vistaCR };
    });
    expect(r).toEqual({
      vistaXA: { paises: ["XA"], nodosXA: 3, distritoCR: 0 },
      vistaCR: { paises: ["CR"], nodosXA: 0, distritoCR: 1 },
    });
  });

  it("R13/R14: una orden de una empresa de CR con geografía de XA falla con SL021; con la suya, y sin distrito, entra", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      const empresa = await crearOrganizacion(tx);
      await fijarEmpresa(tx, empresa.id);
      const fks = await crearFksDeOrden(tx);
      return {
        provinciaXA: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, { ...cr, provinciaId: xa.provinciaId })),
        cantonXA: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, { ...cr, cantonId: xa.cantonId })),
        distritoXA: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, { ...cr, distritoId: xa.distritoId })),
        propia: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, cr)),
        sinDistrito: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, { ...cr, distritoId: null })),
      };
    });
    expect(r).toEqual({ provinciaXA: "SL021", cantonXA: "SL021", distritoXA: "SL021", propia: null, sinDistrito: null });
  });

  it("R13: cambiar la geografía de una orden a la de otro país falla con SL021 y la orden queda como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      const empresa = await crearOrganizacion(tx);
      await fijarEmpresa(tx, empresa.id);
      const fks = await crearFksDeOrden(tx);
      const args = argsDeOrden(fks, cr);
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, ...args);
      const id = args[0] as string;
      const fallo = await intentar(tx, `UPDATE orden SET distrito_id = $1 WHERE id = $2`, xa.distritoId, id);
      const tras = await tx.orden.findUnique({ where: { id }, select: { distritoId: true } });
      return { fallo, distritoTras: tras?.distritoId === cr.distritoId };
    });
    expect(r).toEqual({ fallo: "SL021", distritoTras: true });
  });

  it("R13/R38: una empresa de XA tampoco apunta a CR: orden, zona–distrito y marca de zona especial fallan con SL021", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const cr = await geografiaCR(tx);
      const empresa = await crearOrganizacionEnPais(tx, "XA");
      await fijarEmpresa(tx, empresa.id);
      const fks = await crearFksDeOrden(tx);
      const zona = fks.zonaId;
      return {
        ordenCR: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, cr)),
        ordenXA: await intentar(tx, INSERTAR_ORDEN, ...argsDeOrden(fks, xa)),
        zonaDistritoCR: await intentar(tx, `INSERT INTO zona_distrito (id, zona_id, distrito_id) VALUES ($1, $2, $3)`, randomUUID(), zona, cr.distritoId),
        zonaDistritoXA: await intentar(tx, `INSERT INTO zona_distrito (id, zona_id, distrito_id) VALUES ($1, $2, $3)`, randomUUID(), zona, xa.distritoId),
        marcaCR: await intentar(tx, `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, randomUUID(), cr.distritoId),
        marcaXA: await intentar(tx, `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, randomUUID(), xa.distritoId),
      };
    });
    expect(r).toEqual({
      ordenCR: "SL021",
      ordenXA: null,
      zonaDistritoCR: "SL021",
      zonaDistritoXA: null,
      marcaCR: "SL021",
      marcaXA: null,
    });
  });

  it("R13: el SL021 que llega por Prisma (SQL a mano y operación de modelo) se traduce a GeografiaDeOtroPais", async () => {
    const r = await revertida(base, async (tx) => {
      const xa = await paisXA(tx);
      const empresa = await crearOrganizacion(tx);
      await fijarEmpresa(tx, empresa.id);
      const deSql = await errorEnSavepoint(tx, () =>
        tx.$executeRawUnsafe(`INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, randomUUID(), xa.distritoId),
      );
      const deModelo = await errorEnSavepoint(tx, () =>
        tx.distritoZonaEspecial.create({ data: { id: randomUUID(), distritoId: xa.distritoId } }),
      );
      return { deSql: traducirErrorDePais(deSql), deModelo: traducirErrorDePais(deModelo) };
    });
    expect(r.deSql).toBeInstanceOf(GeografiaDeOtroPais);
    expect(r.deModelo).toBeInstanceOf(GeografiaDeOtroPais);
  });
});
