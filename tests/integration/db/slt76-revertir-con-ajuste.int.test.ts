import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { marcarRecibido } from "./_fixtures/slt73-cierre-aprobable";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-76 · T3 · R5 — REVERTIR UNA CONCILIACION CON AJUSTE DE DIFERENCIA Y SIN ASIENTOS `cierre_dia`
// RESPONDE `con_asientos` Y NO TOCA NADA (m4 de SLT-73).
//
// La consolidacion no incluye ningun cierre del dia: la marca REAL (`marcarConciliado`) no tiene nada
// que asentar de los cierres y solo escribe la diferencia (un ajuste `marca` y su egreso
// `egreso_diferencia_satelite`). Es exactamente el caso que el conteo de SLT-73 dejaba revertir: sin
// filas `cierre_dia` en la caja, la marca se deshacia y la diferencia se quedaba en «Por cobrar a
// satelites» con la consolidacion otra vez pendiente.
//
// Transaccion SIEMPRE revertida; los datos los crea el test y los CONTROL fallan si no estan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

async function sembrarConAjusteSinAsientos(tx: TxDeTest) {
  const fks = await crearFksDeOrden(tx);
  const adminSat = await crearUsuarioDePrueba(tx, "adminSatelite");
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const { id } = await tx.cierreBodega.create({
    data: {
      zonaId: fks.zonaId,
      solicitadoPor: adminSat.id,
      estado: "solicitado",
      totalEfectivo: new Prisma.Decimal("5000.00"),
      totalGeneral: new Prisma.Decimal("5000.00"),
    },
    select: { id: true },
  });
  // Esperado 5.000, recibido 4.600: la marca escribe un ajuste de 400 y su egreso de caja.
  const marca = await marcarRecibido(tx, id, "4600.00", maestro.id);
  if (marca !== "updated") throw new Error(`no se marco la consolidacion: ${marca}`);
  return { id, maestroId: maestro.id };
}

async function foto(tx: TxDeTest, id: string) {
  const [libros] = await tx.$queryRawUnsafe<
    { caja: number; caja_suma: string; ajustes: number; ajustes_suma: string }[]
  >(
    `SELECT (SELECT count(*)::int FROM wallet_movimiento) AS caja,
            (SELECT COALESCE(sum(monto), 0)::text FROM wallet_movimiento) AS caja_suma,
            (SELECT count(*)::int FROM conciliacion_bodega_ajuste) AS ajustes,
            (SELECT COALESCE(sum(diferencia), 0)::text FROM conciliacion_bodega_ajuste) AS ajustes_suma`,
  );
  return {
    consolidacion: await tx.cierreBodega.findUniqueOrThrow({
      where: { id },
      select: { estado: true, conciliadoAt: true, conciliadoPor: true, montoRecibido: true },
    }),
    libros,
    ajustesDeEsta: (
      await tx.conciliacionBodegaAjuste.findMany({
        where: { cierreBodegaId: id },
        select: { diferencia: true },
      })
    ).map((a) => a.diferencia.toFixed(2)),
    cierreDiaAsentados: await tx.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM wallet_movimiento w JOIN cierre_dia cd ON cd.id = w.origen_id
        WHERE w.origen_tipo = 'cierre_dia' AND cd.cierre_bodega_id = $1`,
      id,
    ),
    historial: await tx.historialAccion.count({ where: { entidadId: id } }),
  };
}

describeSiHayBase("SLT-76 R5 — revertir con ajuste y sin asientos (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R5: con un ajuste de diferencia y sin asientos `cierre_dia` -> `con_asientos`; marca, ajustes, caja e historial intactos", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { id, maestroId } = await sembrarConAjusteSinAsientos(tx);
      const antes = await foto(tx, id);
      const repo = new CierresBodegaAdminRepository(tx as unknown as PrismaClient);
      const res = await repo.revertirConciliacion({ id, actorUsuarioId: maestroId });
      return { res, antes, despues: await foto(tx, id) };
    });

    // CONTROL (a mano): conciliada por 4.600, UN ajuste de 400 y NINGUN asiento de sus cierres.
    expect(r.antes.consolidacion.estado).toBe("aprobado");
    expect(r.antes.consolidacion.conciliadoAt).not.toBeNull();
    expect(r.antes.consolidacion.montoRecibido?.toFixed(2)).toBe("4600.00");
    expect(r.antes.ajustesDeEsta).toEqual(["400.00"]);
    expect(r.antes.cierreDiaAsentados).toEqual([{ n: 0 }]);

    expect(r.res).toBe("con_asientos");
    expect(r.despues.consolidacion).toEqual(r.antes.consolidacion);
    expect(r.despues.ajustesDeEsta).toEqual(r.antes.ajustesDeEsta);
    expect(r.despues.libros).toEqual(r.antes.libros); // conteo y suma de caja y de ajustes
    expect(r.despues.historial).toBe(r.antes.historial);
  });
});
