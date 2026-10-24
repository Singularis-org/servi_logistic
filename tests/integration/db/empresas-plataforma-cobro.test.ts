import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import { crearOrganizacion } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  type TxDeTest,
} from "./_postgres-real";
import { CLAVE_LOCK_TARIFA_GLOBAL } from "./_fixtures/cobro-plataforma-40";

// SL-40 T5 (R1, R2, R5, R7, R10) — el repositorio de la configuración del cobro por orden y el
// listado de «Empresas», con su SQL contra Postgres real. El test del servicio usa un doble y no ve
// el `WHERE`: una excepción escrita sobre TODAS las empresas lo deja verde. Aquí cada caso tiene una
// segunda empresa que NO debe cambiar.
//
// Todo corre en una transacción que se revierte: nada queda en la base. Las lecturas de control van
// por SQL directo sobre la misma transacción, no por el repositorio que se prueba.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let prisma: PrismaClient;

async function excepcionDe(tx: TxDeTest, organizacionId: string): Promise<string | null> {
  const filas = await tx.$queryRawUnsafe<{ m: string | null }[]>(
    `SELECT "cobro_plataforma_por_orden"::text AS m FROM "organizacion" WHERE "id" = $1`,
    organizacionId,
  );
  // Control de no vacuidad: la empresa existe de verdad; si no, `null` pasaría por «sin excepción».
  expect(filas, `la organización ${organizacionId} no existe`).toHaveLength(1);
  return filas[0].m;
}

/** Dos empresas propias del caso, y los dos repositorios reales sobre la transacción. */
function conDosEmpresas<T>(
  fn: (c: { tx: TxDeTest; a: string; b: string; tarifas: CobroPlataformaTarifaRepository; empresas: EmpresasPlataformaRepository }) => Promise<T>,
): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    const a = (await crearOrganizacion(tx)).id;
    const b = (await crearOrganizacion(tx)).id;
    const cliente = clienteConTransaccionAnidada(tx);
    return fn({ tx, a, b, tarifas: new CobroPlataformaTarifaRepository(cliente), empresas: new EmpresasPlataformaRepository(cliente) });
  });
}

class Revertir extends Error {}

/**
 * El valor global es UNA fila para toda la base. Se toca en una transacción propia que se revierte,
 * con el lock del valor global que usan los demás tests de SL-40 (`_fixtures/cobro-plataforma-40.ts`)
 * tomado como primera sentencia: mientras otro archivo lo tiene, este espera.
 */
async function conGlobalRevertido(fn: (tarifas: CobroPlataformaTarifaRepository, tx: TxDeTest) => Promise<void>): Promise<void> {
  let corrio = false;
  await prisma
    .$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_TARIFA_GLOBAL})`);
        await fn(new CobroPlataformaTarifaRepository(clienteConTransaccionAnidada(tx)), tx);
        corrio = true;
        throw new Revertir();
      },
      { timeout: 120_000, maxWait: 15_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof Revertir)) throw error;
    });
  expect(corrio, "el cuerpo del caso no llegó al final").toBe(true);
}

describeSiHayBase("SL-40 — configuración del cobro por orden contra Postgres", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R2: fijar la excepción de A la escribe en A y deja a B sin tocar", async () => {
    const r = await conDosEmpresas(async ({ tx, a, b, tarifas }) => {
      const escrita = await tarifas.fijarDeEmpresa(a, "300.00");
      return { escrita, a: await excepcionDe(tx, a), b: await excepcionDe(tx, b) };
    });
    expect(r).toEqual({ escrita: true, a: "300.00", b: null });
  });

  it("R5: quitar la excepción de A la deja en NULL y conserva la de B", async () => {
    const r = await conDosEmpresas(async ({ tx, a, b, tarifas }) => {
      await tarifas.fijarDeEmpresa(a, "300.00");
      await tarifas.fijarDeEmpresa(b, "250.50");
      const quitada = await tarifas.fijarDeEmpresa(a, null);
      return { quitada, a: await excepcionDe(tx, a), b: await excepcionDe(tx, b) };
    });
    expect(r).toEqual({ quitada: true, a: null, b: "250.50" });
  });

  it("R7: una empresa que no existe no se encuentra y no se escribe ninguna fila", async () => {
    const r = await conDosEmpresas(async ({ tx, a, tarifas }) => {
      const fantasma = randomUUID();
      const antes = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "organizacion" WHERE "cobro_plataforma_por_orden" IS NOT NULL`,
      );
      const resultado = {
        existeFantasma: await tarifas.existeEmpresa(fantasma),
        existeA: await tarifas.existeEmpresa(a),
        escrita: await tarifas.fijarDeEmpresa(fantasma, "1.00"),
      };
      const despues = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "organizacion" WHERE "cobro_plataforma_por_orden" IS NOT NULL`,
      );
      return { ...resultado, mismas: antes[0].n === despues[0].n, a: await excepcionDe(tx, a) };
    });
    expect(r).toEqual({ existeFantasma: false, existeA: true, escrita: false, mismas: true, a: null });
  });

  it("R10: el listado trae cobroPorOrden de cada empresa: el importe propio con dos decimales, o null si usa el global", async () => {
    const r = await conDosEmpresas(async ({ a, b, tarifas, empresas }) => {
      await tarifas.fijarDeEmpresa(a, "300");
      const listado = await empresas.listar();
      return { a: listado.find((e) => e.id === a), b: listado.find((e) => e.id === b) };
    });
    expect(r.a?.cobroPorOrden).toBe("300.00");
    expect(r.b).toBeDefined();
    expect(r.b?.cobroPorOrden).toBeNull();
  });

  it("R1/R3: sin fila el global es null; fijarlo crea la fila única y fijarlo otra vez la reemplaza", async () => {
    await conGlobalRevertido(async (tarifas, tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_tarifa"`);
      expect(await tarifas.leerGlobal()).toBeNull();

      await tarifas.fijarGlobal("500");
      expect(await tarifas.leerGlobal()).toBe("500.00");

      await tarifas.fijarGlobal("600.5");
      expect(await tarifas.leerGlobal()).toBe("600.50");
      const filas = await tx.$queryRawUnsafe<{ monto: string }[]>(`SELECT "monto"::text AS monto FROM "cobro_plataforma_tarifa"`);
      expect(filas).toEqual([{ monto: "600.50" }]);
    });
  });

  it("R1/R4: el CHECK de la base rechaza un global negativo aunque alguien salte el schema", async () => {
    await conGlobalRevertido(async (tarifas, tx) => {
      await tx.$executeRawUnsafe(`SAVEPOINT negativo`);
      await expect(tarifas.fijarGlobal("-1.00")).rejects.toThrow();
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT negativo`);
    });
  });
});
