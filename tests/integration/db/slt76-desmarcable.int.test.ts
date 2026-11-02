import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { SaldosSatelitesRepository } from "@/lib/repositories/SaldosSatelitesRepository";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  aprobar,
  consolidar,
  marcarRecibido,
  sembrarCierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-76 · T2 · R3/R4 — «DESMARCAR» SE OFRECE SOLO CUANDO REVERTIR NO DEVOLVERIA `con_asientos`.
//
// Tres consolidaciones CONCILIADAS de la MISMA bodega satelite, todas por el camino real de la marca:
//   (i)   con asientos `cierre_dia`: un cierre satelite aprobado, consolidado y marcado por lo
//         esperado (18.500 = 20.000 − 1.500), asi que la marca asienta el cierre y NO deja ajuste;
//   (ii)  sin asientos y con un ajuste: consolidacion sin cierres del dia marcada por 4.600 de 5.000;
//   (iii) sin ninguno de los dos: consolidacion sin cierres del dia marcada por lo esperado (3.000).
//
// Se leen las superficies que pintan el boton —las de `/cierres-admin` (repositorio del maestro: lista
// y detalle; repositorio de la satelite: su pagina) y el desglose de `/wallet/satelites`— y se espera
// `desmarcable` = false, false, true en todas. Despues, `revertirConciliacion` sobre cada una devuelve
// `con_asientos`, `con_asientos`, `updated`: el boton y el servidor dicen lo mismo (R4).
//
// Transaccion SIEMPRE revertida. Los CONTROL fallan si la siembra no dejo lo que el escenario dice.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const PAGINA = { skip: 0, take: 100 };

/** Una consolidacion sin cierres del dia, en la zona dada, marcada recibida por `recibido`. */
async function conciliadaSinCierres(
  tx: TxDeTest,
  zonaId: string,
  solicitadoPor: string,
  maestroId: string,
  general: string,
  recibido: string,
): Promise<string> {
  const { id } = await tx.cierreBodega.create({
    data: {
      zonaId,
      solicitadoPor,
      estado: "solicitado",
      totalEfectivo: new Prisma.Decimal(general),
      totalGeneral: new Prisma.Decimal(general),
    },
    select: { id: true },
  });
  const marca = await marcarRecibido(tx, id, recibido, maestroId);
  if (marca !== "updated") throw new Error(`no se marco la consolidacion: ${marca}`);
  return id;
}

async function dineroDe(tx: TxDeTest, id: string) {
  const [f] = await tx.$queryRawUnsafe<{ asientos: number; ajustes: number }[]>(
    `SELECT (SELECT count(*)::int FROM wallet_movimiento w JOIN cierre_dia cd ON cd.id = w.origen_id
              WHERE w.origen_tipo = 'cierre_dia' AND cd.cierre_bodega_id = $1) AS asientos,
            (SELECT count(*)::int FROM conciliacion_bodega_ajuste WHERE cierre_bodega_id = $1) AS ajustes`,
    id,
  );
  return f;
}

describeSiHayBase("SLT-76 R3/R4 — `desmarcable` en las dos superficies (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R3/R4: (i) asientos -> false, (ii) ajuste -> false, (iii) nada -> true en /cierres-admin y /wallet/satelites; revertir dice lo mismo", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      if ((await aprobar(k)) !== "ok") throw new Error("no se aprobo el cierre satelite");
      const conAsientos = await consolidar(tx, k.adminSatelite);
      const marca = await marcarRecibido(tx, conAsientos, "18500.00", k.maestroId);
      if (marca !== "updated") throw new Error(`no se marco (i): ${marca}`);
      const solicitante = (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
      const conAjuste = await conciliadaSinCierres(tx, k.zonaId, solicitante, k.maestroId, "5000.00", "4600.00");
      const sinNada = await conciliadaSinCierres(tx, k.zonaId, solicitante, k.maestroId, "3000.00", "3000.00");
      const ids = [conAsientos, conAjuste, sinNada];

      const control = await Promise.all(ids.map((id) => dineroDe(tx, id)));

      const cliente = tx as unknown as PrismaClient;
      const admin = new CierresBodegaAdminRepository(cliente);
      const deLista = <T extends { cierreBodegaId: string; desmarcable: boolean }>(filas: T[]) =>
        ids.map((id) => filas.find((f) => f.cierreBodegaId === id)?.desmarcable ?? "ausente");

      const historicoMaestro = deLista((await admin.findHistoricoPaginado(PAGINA)).items);
      const historicoCompleto = deLista(await admin.findHistoricoCompleto());
      const detalleMaestro = await Promise.all(
        ids.map(async (id) => (await admin.findCierreBodegaConDetalle(id))?.cierre.desmarcable ?? "ausente"),
      );
      const paginaSatelite = deLista(
        (await new CierreBodegaRepository(cliente).findCierresBodegaByZonaPaginado(k.zonaId, PAGINA)).items,
      );
      const desglose = deLista(
        (await new SaldosSatelitesRepository(cliente).findConsolidacionesPaginado(k.zonaId, PAGINA)).items,
      );

      const revertir: string[] = [];
      for (const id of ids) {
        revertir.push(await admin.revertirConciliacion({ id, actorUsuarioId: k.maestroId }));
      }
      return { control, historicoMaestro, historicoCompleto, detalleMaestro, paginaSatelite, desglose, revertir };
    });

    // CONTROL: cada escenario tiene exactamente el dinero que dice su nombre.
    expect(r.control[0].asientos).toBeGreaterThan(0);
    expect(r.control[0].ajustes).toBe(0);
    expect(r.control[1]).toEqual({ asientos: 0, ajustes: 1 });
    expect(r.control[2]).toEqual({ asientos: 0, ajustes: 0 });

    const esperado = [false, false, true];
    expect(r.historicoMaestro).toEqual(esperado);
    expect(r.historicoCompleto).toEqual(esperado);
    expect(r.detalleMaestro).toEqual(esperado);
    expect(r.paginaSatelite).toEqual(esperado);
    expect(r.desglose).toEqual(esperado);

    // R4: se ofrece «Desmarcar» <=> revertir NO devuelve `con_asientos`.
    expect(r.revertir).toEqual(["con_asientos", "con_asientos", "updated"]);
  });

  it("una consolidacion SIN conciliar nunca es desmarcable (no hay nada que desmarcar)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      if ((await aprobar(k)) !== "ok") throw new Error("no se aprobo el cierre satelite");
      const id = await consolidar(tx, k.adminSatelite);
      const cliente = tx as unknown as PrismaClient;
      const fila = (
        await new SaldosSatelitesRepository(cliente).findConsolidacionesPaginado(k.zonaId, PAGINA)
      ).items.find((f) => f.cierreBodegaId === id);
      const cabecera = (await new CierresBodegaAdminRepository(cliente).findCierreBodegaConDetalle(id))?.cierre;
      return { fila, cabecera };
    });
    expect(r.fila?.conciliado).toBe(false);
    expect(r.fila?.desmarcable).toBe(false);
    expect(r.cabecera?.conciliado).toBe(false);
    expect(r.cabecera?.desmarcable).toBe(false);
  });
});
