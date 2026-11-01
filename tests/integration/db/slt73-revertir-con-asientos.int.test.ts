import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { aprobar, consolidar, filasDeLibros, marcarRecibido, sembrarCierreAprobable } from "./_fixtures/slt73-cierre-aprobable";

// SLT-73 · R14 / D11 — REVERTIR UNA MARCA QUE YA ASENTO EL DINERO RESPONDE `con_asientos` Y NO TOCA NADA.
//
// Vive aqui y no en `marca-conciliacion.int.test.ts` porque aquel archivo esta en `tests/baseline-rojos.json`
// (depende de usuarios sembrados): en el CI su rojo no cuenta, y el conteo previo de
// `CierresBodegaAdminRepository.revertirConciliacion` quedaba sin proteccion SQL (review SLT-73, m2).
//
// TODO lo crea el test por el camino real (fixtures de `slt73-cierre-aprobable`: empresa, usuarios,
// cierre satelite, aprobacion, consolidacion y marca). Si algo no se siembra, los fixtures lanzan y el
// test FALLA; no hay rama que lo salte en verde. Transaccion siempre revertida; sin base, se salta.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Conteo total de los tres libros y de las diferencias: cualquier escritura de revertir lo mueve. */
async function totales(tx: TxDeTest) {
  const [r] = await tx.$queryRawUnsafe<{ caja: number; tienda: number; mensajero: number; ajustes: number }[]>(
    `SELECT (SELECT count(*)::int FROM wallet_movimiento) AS caja,
            (SELECT count(*)::int FROM wallet_tienda_movimiento) AS tienda,
            (SELECT count(*)::int FROM pago_mensajero_movimiento) AS mensajero,
            (SELECT count(*)::int FROM conciliacion_bodega_ajuste) AS ajustes`,
  );
  return r;
}

describeSiHayBase("SLT-73 R14 — revertir una conciliacion con asientos (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R14: revertir una marca que YA asento el dinero -> `con_asientos`; la marca y los tres libros quedan intactos", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      if ((await aprobar(k)) !== "ok") throw new Error("no se aprobo el cierre satelite");
      const id = await consolidar(tx, k.adminSatelite);
      const marca = await marcarRecibido(tx, id, "18000.00", k.maestroId);

      const foto = async () => ({
        consolidacion: await tx.cierreBodega.findUniqueOrThrow({
          where: { id },
          select: { estado: true, conciliadoAt: true, conciliadoPor: true, montoRecibido: true, conciliadoNota: true },
        }),
        libros: await filasDeLibros(tx, k.cierreId),
        totales: await totales(tx),
        ajustes: await tx.conciliacionBodegaAjuste.count({ where: { cierreBodegaId: id } }),
        historial: await tx.historialAccion.count({ where: { entidadId: id } }),
      });
      const antes = await foto();
      const repo = new CierresBodegaAdminRepository(tx as unknown as PrismaClient);
      const res = await repo.revertirConciliacion({ id, actorUsuarioId: k.maestroId });
      return { marca, res, antes, despues: await foto() };
    });

    expect(r.marca).toBe("updated");
    // Control (escrito a mano): la marca SI asento las 7 filas de caja, las 5 de tienda y las 2 del
    // mensajero del cierre, y dejo una diferencia (18.500 − 18.000); la consolidacion quedo conciliada.
    expect(r.antes.libros.caja).toHaveLength(7);
    expect(r.antes.libros.tienda).toHaveLength(5);
    expect(r.antes.libros.mensajero).toHaveLength(2);
    expect(r.antes.consolidacion.estado).toBe("aprobado");
    expect(r.antes.ajustes).toBe(1);
    expect(r.antes.consolidacion.conciliadoAt).not.toBeNull();
    expect(r.antes.consolidacion.montoRecibido?.toFixed(2)).toBe("18000.00");

    expect(r.res).toBe("con_asientos");
    // La marca intacta (columnas y rastro), y ni una fila de mas o de menos en los tres libros.
    expect(r.despues.consolidacion).toEqual(r.antes.consolidacion);
    expect(r.despues.historial).toBe(r.antes.historial);
    expect(r.despues.libros).toEqual(r.antes.libros);
    expect(r.despues.totales).toEqual(r.antes.totales);
    expect(r.despues.ajustes).toBe(r.antes.ajustes);
  });
});
