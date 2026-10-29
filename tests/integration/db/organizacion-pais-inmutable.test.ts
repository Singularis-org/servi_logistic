import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { PaisInmutable, traducirErrorDePais } from "@/lib/db/errores-pais";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { errorEnSavepoint, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-20 (T1.3, T1.7; design §2.2) — el país de la empresa, contra Postgres real.
//   · R4: toda empresa tiene exactamente un país (NOT NULL + FK a `pais`).
//   · R5: las empresas que ya existían quedan en CR. Lo mide la ida y vuelta
//     (`migracion-sl20-ida-y-vuelta.test.ts`), que crea una empresa ANTES de la migración; aquí se
//     comprueba que en la base no queda ninguna sin país.
//   · R7: cambiar el país de una empresa falla con SL020 también como dueño (el superadmin y el SQL a
//     mano corren como dueño), y el país queda como estaba. `traducirErrorDePais` lo convierte en
//     `PaisInmutable`.
//   · R10: una empresa creada sin país —fábrica o SQL a mano— nace en CR.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function paisDe(tx: TxDeTest, organizacionId: string): Promise<string | undefined> {
  const o = await tx.organizacion.findUnique({ where: { id: organizacionId }, select: { paisId: true } });
  return o?.paisId;
}

describeSiHayBase("SL-20 — país de la empresa", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R4/R5: ninguna empresa de la base está sin país, y una con un país inexistente no entra (23503)", async () => {
    const r = await revertida(base, async (tx) => {
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*) AS n FROM organizacion o LEFT JOIN pais p ON p.id = o.pais_id WHERE p.id IS NULL`,
      );
      return {
        sinPais: Number(n),
        paisInexistente: await intentar(
          tx,
          `INSERT INTO organizacion (id, nombre, slug, pais_id) VALUES ($1, 'Sin país', $2, 'XZ')`,
          randomUUID(),
          `prueba-${randomUUID().slice(0, 8)}`,
        ),
        paisNulo: await intentar(
          tx,
          `INSERT INTO organizacion (id, nombre, slug, pais_id) VALUES ($1, 'Nulo', $2, NULL)`,
          randomUUID(),
          `prueba-${randomUUID().slice(0, 8)}`,
        ),
      };
    });
    expect(r).toEqual({ sinPais: 0, paisInexistente: "23503", paisNulo: "23502" });
  });

  it("R10: una empresa creada sin país, por la fábrica o por SQL a mano, nace en CR", async () => {
    const r = await revertida(base, async (tx) => {
      const deFabrica = await crearOrganizacion(tx);
      const aMano = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO organizacion (id, nombre, slug) VALUES ($1, 'A mano SL20', $2)`,
        aMano,
        `prueba-${aMano.replace(/-/g, "").slice(0, 12)}`,
      );
      return { deFabrica: await paisDe(tx, deFabrica.id), aMano: await paisDe(tx, aMano) };
    });
    expect(r).toEqual({ deFabrica: "CR", aMano: "CR" });
  });

  it("R7: cambiar el país de una empresa falla con SL020 como dueño, en los dos sentidos, y el país queda", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const enCR = await crearOrganizacion(tx);
      const enXA = await crearOrganizacionEnPais(tx, "XA");
      return {
        crAXA: await intentar(tx, `UPDATE organizacion SET pais_id = 'XA' WHERE id = $1`, enCR.id),
        xaACR: await intentar(tx, `UPDATE organizacion SET pais_id = 'CR' WHERE id = $1`, enXA.id),
        // Reescribir el mismo país no es un cambio: pasa (lo hace un `update` de Prisma con todos los campos).
        mismo: await intentar(tx, `UPDATE organizacion SET pais_id = 'CR' WHERE id = $1`, enCR.id),
        // Cambiar otra columna no toca el trigger.
        otroCampo: await intentar(tx, `UPDATE organizacion SET nombre = 'Renombrada SL20' WHERE id = $1`, enCR.id),
        tras: [await paisDe(tx, enCR.id), await paisDe(tx, enXA.id)],
      };
    });
    expect(r).toEqual({ crAXA: "SL020", xaACR: "SL020", mismo: null, otroCampo: null, tras: ["CR", "XA"] });
  });

  it("R7: el SL020 que llega por una operación de modelo de Prisma se traduce a PaisInmutable", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const empresa = await crearOrganizacion(tx);
      const error = await errorEnSavepoint(tx, () =>
        tx.organizacion.update({ where: { id: empresa.id }, data: { paisId: "XA" } }),
      );
      return { traducido: traducirErrorDePais(error), pais: await paisDe(tx, empresa.id) };
    });
    expect(r.traducido).toBeInstanceOf(PaisInmutable);
    expect(r.pais).toBe("CR");
  });
});
