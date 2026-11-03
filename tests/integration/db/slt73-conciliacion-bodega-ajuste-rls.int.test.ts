import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-73 · T1 (design §1.2, R21) — LA TABLA DEL EVENTO DE CONCILIACION ES DE NEGOCIO: RLS POR
// EMPRESA, MISMA EMPRESA EN SUS FK, NO CAMBIA DE EMPRESA Y SUS CHECK MANDAN.
//
// POR QUE `comoApp`. La conexion del test es la del dueno de las tablas: con ella la RLS no actua y
// cualquier SQL ve las dos empresas. Solo con el rol `servi_app` —el que pone la app— la politica
// `conciliacion_bodega_ajuste_por_empresa` se aplica. Cada caso mide el antes y el despues como
// dueno (`SET LOCAL ROLE NONE`), que no depende de la politica.
//
// TODO corre en una transaccion que SIEMPRE se revierte. Los datos se crean aqui y el caso FALLA si
// no los encuentra (control de no vacuidad en cada uno): nada de `if (!x) return`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** SQLSTATE de un error de Prisma con driver adapter («Code: `42501`») o de `pg` (`code`). */
function sqlstateDe(error: unknown): string {
  const texto =
    JSON.stringify(error, Object.getOwnPropertyNames(error as object)) +
    String((error as Error)?.message ?? "");
  const conCode = /Code: `([0-9A-Z]{5})`/.exec(texto) ?? /"code":"([0-9A-Z]{5})"/.exec(texto);
  return conCode?.[1] ?? `?? ${String((error as Error)?.message ?? error).replace(/\s+/g, " ").slice(0, 160)}`;
}

/** Corre `sql` en un SAVEPOINT: un fallo no aborta la transaccion del test. SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}

interface Sembrado {
  empresaA: string;
  empresaB: string;
  cierreBodegaA: string;
  maestroA: string;
  ajusteA: string;
}

/** Una consolidacion de la empresa A con UN evento de diferencia; y una empresa B vacia. */
async function sembrar(tx: TxDeTest): Promise<Sembrado> {
  await serializarEscriturasReales(tx);
  const empresaA = (
    await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT NULLIF(current_setting('app.organizacion_id', true), '') AS id`,
    )
  )[0].id;
  const fks = await crearFksDeOrden(tx);
  const adminSat = await crearUsuarioDePrueba(tx, "adminSatelite");
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const cierreBodega = await tx.cierreBodega.create({
    data: {
      zonaId: fks.zonaId,
      solicitadoPor: adminSat.id,
      estado: "solicitado",
      totalGeneral: new Prisma.Decimal("10000.00"),
    },
    select: { id: true },
  });
  const ajusteA = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO conciliacion_bodega_ajuste
       (id, cierre_bodega_id, evento, monto_esperado, monto_recibido, diferencia, creado_por)
     VALUES ($1, $2, 'marca', 10000.00, 9500.00, 500.00, $3)`,
    ajusteA,
    cierreBodega.id,
    maestro.id,
  );
  const empresaB = (await crearOrganizacion(tx)).id;
  return { empresaA, empresaB, cierreBodegaA: cierreBodega.id, maestroA: maestro.id, ajusteA };
}

async function filaComoDueno(tx: TxDeTest, id: string) {
  const filas = await tx.$queryRawUnsafe<
    { organizacion_id: string; evento: string; diferencia: string; monto_recibido: string }[]
  >(
    `SELECT organizacion_id, evento, diferencia::text AS diferencia, monto_recibido::text AS monto_recibido
       FROM conciliacion_bodega_ajuste WHERE id = $1`,
    id,
  );
  return filas[0] ?? null;
}

describeSiHayBase("SLT-73 T1 · `conciliacion_bodega_ajuste` es de negocio (R21)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: la fila sembrada existe y es de la empresa A (el DEFAULT de organizacion_id la puso)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      return { s, fila: await filaComoDueno(tx, s.ajusteA) };
    });
    expect(r.fila).not.toBeNull();
    expect(r.fila?.organizacion_id).toBe(r.s.empresaA);
    expect(r.fila?.diferencia).toBe("500.00");
  });

  it("RLS: como la app de la empresa B no la ve, no la cambia ni la borra; como A, si la ve", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const antes = await filaComoDueno(tx, s.ajusteA);

      await comoApp(tx, s.empresaB);
      const vistasB = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM conciliacion_bodega_ajuste WHERE id = $1`,
        s.ajusteA,
      );
      const cambiadasB = await tx.$executeRawUnsafe(
        `UPDATE conciliacion_bodega_ajuste SET monto_recibido = 1.00 WHERE id = $1`,
        s.ajusteA,
      );
      const borradasB = await tx.$executeRawUnsafe(
        `DELETE FROM conciliacion_bodega_ajuste WHERE id = $1`,
        s.ajusteA,
      );
      await comoDueno(tx);

      await comoApp(tx, s.empresaA);
      const vistasA = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM conciliacion_bodega_ajuste WHERE id = $1`,
        s.ajusteA,
      );
      await comoDueno(tx);

      return {
        antes,
        vistasB: vistasB[0].n,
        cambiadasB,
        borradasB,
        vistasA: vistasA[0].n,
        despues: await filaComoDueno(tx, s.ajusteA),
      };
    });

    expect(r.antes).not.toBeNull();
    expect({ vistasB: r.vistasB, cambiadasB: r.cambiadasB, borradasB: r.borradasB }).toEqual({
      vistasB: 0,
      cambiadasB: 0,
      borradasB: 0,
    });
    expect(r.vistasA).toBe(1);
    expect(r.despues).toEqual(r.antes);
  });

  it("RLS WITH CHECK: la app de A no puede escribir una fila a nombre de B (42501)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      // Una consolidacion y un usuario de B, para que la fila «de B» pase los triggers de misma
      // empresa y quien la pare sea la POLITICA (si no, el SL017 taparia la RLS).
      await fijarEmpresa(tx, s.empresaB);
      const zonaB = await tx.zona.create({
        data: { nombre: `Zona B ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular B" },
        select: { id: true },
      });
      const adminSatB = await crearUsuarioDePrueba(tx, "adminSatelite");
      const maestroB = await crearUsuarioDePrueba(tx, "maestro");
      const cierreBodegaB = await tx.cierreBodega.create({
        data: { zonaId: zonaB.id, solicitadoPor: adminSatB.id, estado: "solicitado" },
        select: { id: true },
      });
      await comoApp(tx, s.empresaA);
      const estado = await intentar(
        tx,
        `INSERT INTO conciliacion_bodega_ajuste
           (id, organizacion_id, cierre_bodega_id, evento, monto_esperado, monto_recibido, diferencia, creado_por)
         VALUES ($1, $2, $3, 'correccion', 10000.00, 9000.00, 500.00, $4)`,
        randomUUID(),
        s.empresaB,
        cierreBodegaB.id,
        maestroB.id,
      );
      await comoDueno(tx);
      const n = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM conciliacion_bodega_ajuste WHERE cierre_bodega_id = $1`,
        cierreBodegaB.id,
      );
      return { estado, n: n[0].n };
    });
    expect(r.estado).toBe("42501");
    expect(r.n).toBe(0);
  });

  it("misma empresa: B no puede colgar un evento de la consolidacion ni del usuario de A (SL017)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const maestroB = await (async () => {
        await fijarEmpresa(tx, s.empresaB);
        const u = await crearUsuarioDePrueba(tx, "maestro");
        return u.id;
      })();
      await comoApp(tx, s.empresaB);
      const porConsolidacion = await intentar(
        tx,
        `INSERT INTO conciliacion_bodega_ajuste
           (id, cierre_bodega_id, evento, monto_esperado, monto_recibido, diferencia, creado_por)
         VALUES ($1, $2, 'correccion', 10000.00, 9000.00, 500.00, $3)`,
        randomUUID(),
        s.cierreBodegaA,
        maestroB,
      );
      await comoDueno(tx);
      return { porConsolidacion };
    });
    expect(r.porConsolidacion).toBe("SL017");
  });

  it("una fila no cambia de empresa (SL017), ni como dueno", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const estado = await intentar(
        tx,
        `UPDATE conciliacion_bodega_ajuste SET organizacion_id = $1 WHERE id = $2`,
        s.empresaB,
        s.ajusteA,
      );
      return { estado, fila: await filaComoDueno(tx, s.ajusteA), s };
    });
    expect(r.estado).toBe("SL017");
    expect(r.fila?.organizacion_id).toBe(r.s.empresaA);
  });

  it("CHECK: un evento que no es marca/correccion y una diferencia 0 se rechazan (23514)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const insertar = (evento: string, diferencia: string) =>
        intentar(
          tx,
          `INSERT INTO conciliacion_bodega_ajuste
             (id, cierre_bodega_id, evento, monto_esperado, monto_recibido, diferencia, creado_por)
           VALUES ($1, $2, $3, 10000.00, 10000.00, $4::numeric, $5)`,
          randomUUID(),
          s.cierreBodegaA,
          evento,
          diferencia,
          s.maestroA,
        );
      return {
        eventoRaro: await insertar("reversion", "1.00"),
        diferenciaCero: await insertar("marca", "0.00"),
        // Contraprueba: la forma legitima entra (si no, los dos rechazos de arriba no dirian nada).
        legitima: await insertar("correccion", "-10.00"),
      };
    });
    expect(r).toEqual({ eventoRaro: "23514", diferenciaCero: "23514", legitima: null });
  });
});
