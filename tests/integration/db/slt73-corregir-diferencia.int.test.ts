import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  aprobar,
  consolidar,
  filasDeLibros,
  invarianteR8,
  marcarRecibido,
  sembrarCierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";

// SLT-73 · T4 · R13/R15/R22 — CORREGIR EL MONTO RECIBIDO ESCRIBE LA VARIACION DE LA DIFERENCIA, Y
// NUNCA TOCA LO ANTERIOR.
//
// Consolidacion con snapshot propio: total general 500,00, sin pago a mensajeros ni ganancia de la
// satelite -> esperado 500,00. La secuencia del design §6:
//
//   marca 485   -> objetivo +15, ya asentado  0 -> ajuste  +15 (egreso 15,00)
//   corrige 500 -> objetivo   0, ya asentado 15 -> ajuste  −15 (ingreso 15,00)
//   corrige 490 -> objetivo +10, ya asentado  0 -> ajuste  +10 (egreso 10,00)
//
// Neto de los tres ajustes = +10 = esperado − 490. Cifras ESCRITAS A MANO.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

async function sembrarConsolidacion(tx: TxDeTest) {
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const corrector = await crearUsuarioDePrueba(tx, "admin");
  const zona = await tx.zona.create({
    data: {
      nombre: `Zona SLT-73 corregir ${Date.now().toString(36)}`,
      sinpeNumero: "80000000",
      sinpeNombre: "Titular de Prueba",
      esCentral: false,
    },
    select: { id: true },
  });
  const cb = await tx.cierreBodega.create({
    data: {
      zonaId: zona.id,
      solicitadoPor: maestro.id,
      estado: "solicitado",
      totalEfectivo: new Prisma.Decimal("400.00"),
      totalSimpe: new Prisma.Decimal("100.00"),
      totalGeneral: new Prisma.Decimal("500.00"),
    },
    select: { id: true },
  });
  return { id: cb.id, maestroId: maestro.id, correctorId: corrector.id };
}

async function ajustesDe(tx: TxDeTest, cierreBodegaId: string) {
  const filas = await tx.conciliacionBodegaAjuste.findMany({
    where: { cierreBodegaId },
    orderBy: { createdAt: "asc" },
  });
  const movs = await tx.walletMovimiento.findMany({
    where: { origenTipo: "conciliacion_bodega_ajuste", origenId: { in: filas.map((f) => f.id) } },
    select: { id: true, origenId: true, tipo: true, categoria: true, monto: true, fechaMovimiento: true },
  });
  return { filas, movs };
}

describeSiHayBase("SLT-73 T4 — corregir escribe la variacion de la diferencia", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R13: 485 -> 500 -> 490 deja TRES ajustes cuyo neto es esperado − 490, sin modificar los previos", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrarConsolidacion(tx);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const marca = await repo.marcarConciliado({
        id: s.id,
        montoRecibido: "485.00",
        nota: null,
        actorUsuarioId: s.maestroId,
      });
      const trasMarca = await ajustesDe(tx, s.id);
      const c1 = await repo.corregirConciliacion({
        id: s.id,
        montoRecibido: "500.00",
        nota: null,
        actorUsuarioId: s.correctorId,
      });
      const c2 = await repo.corregirConciliacion({
        id: s.id,
        montoRecibido: "490.00",
        nota: null,
        actorUsuarioId: s.correctorId,
      });
      return { s, marca, c1, c2, trasMarca, final: await ajustesDe(tx, s.id) };
    });

    expect([r.marca, r.c1, r.c2]).toEqual(["updated", "updated", "updated"]);
    expect(
      r.final.filas.map((f) => [f.evento, f.montoEsperado.toFixed(2), f.montoRecibido.toFixed(2), f.diferencia.toFixed(2)]),
    ).toEqual([
      ["marca", "500.00", "485.00", "15.00"],
      ["correccion", "500.00", "500.00", "-15.00"],
      ["correccion", "500.00", "490.00", "10.00"],
    ]);
    const neto = r.final.filas.reduce((acc, f) => acc.plus(f.diferencia), new Prisma.Decimal(0));
    expect(neto.toFixed(2)).toBe("10.00");

    // UN movimiento por ajuste, con el signo de su diferencia.
    const porAjuste = new Map(r.final.movs.map((m) => [m.origenId, m]));
    expect(r.final.movs).toHaveLength(3);
    expect(
      r.final.filas.map((f) => {
        const m = porAjuste.get(f.id);
        return [m?.tipo, m?.categoria, m?.monto.toFixed(2)];
      }),
    ).toEqual([
      ["egreso", "egreso_diferencia_satelite", "15.00"],
      ["ingreso", "ingreso_diferencia_satelite", "15.00"],
      ["egreso", "egreso_diferencia_satelite", "10.00"],
    ]);

    // Append-only: la fila de la marca y su movimiento siguen IDENTICOS tras las dos correcciones.
    expect(r.trasMarca.filas).toHaveLength(1);
    expect(r.final.filas[0]).toEqual(r.trasMarca.filas[0]);
    expect(r.final.movs.find((m) => m.id === r.trasMarca.movs[0].id)).toEqual(r.trasMarca.movs[0]);
  });

  it("R13: corregir sin que cambie la diferencia (mismo monto) NO escribe ningun ajuste ni movimiento", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrarConsolidacion(tx);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      await repo.marcarConciliado({ id: s.id, montoRecibido: "485.00", nota: null, actorUsuarioId: s.maestroId });
      const antes = await ajustesDe(tx, s.id);
      const res = await repo.corregirConciliacion({
        id: s.id,
        montoRecibido: "485.00",
        nota: "solo cambia la nota",
        actorUsuarioId: s.correctorId,
      });
      return { res, antes, despues: await ajustesDe(tx, s.id) };
    });
    expect(r.res).toBe("updated");
    expect(r.antes.filas).toHaveLength(1);
    expect(r.despues).toEqual(r.antes);
  });

  it("R15/R22: cada ajuste lleva evento, quien, el esperado, el recibido y el instante de SU evento (igual que su movimiento)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrarConsolidacion(tx);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const leerConciliadoAt = async () =>
        (await tx.cierreBodega.findUniqueOrThrow({ where: { id: s.id }, select: { conciliadoAt: true } }))
          .conciliadoAt;
      await repo.marcarConciliado({ id: s.id, montoRecibido: "485.00", nota: null, actorUsuarioId: s.maestroId });
      const instanteMarca = await leerConciliadoAt();
      await repo.corregirConciliacion({
        id: s.id,
        montoRecibido: "490.00",
        nota: null,
        actorUsuarioId: s.correctorId,
      });
      const instanteCorreccion = await leerConciliadoAt();
      return { s, instanteMarca, instanteCorreccion, a: await ajustesDe(tx, s.id) };
    });
    const [marca, correccion] = r.a.filas;
    expect(r.a.filas).toHaveLength(2);
    expect([marca.evento, marca.creadoPor, marca.montoEsperado.toFixed(2), marca.montoRecibido.toFixed(2)]).toEqual([
      "marca",
      r.s.maestroId,
      "500.00",
      "485.00",
    ]);
    expect([
      correccion.evento,
      correccion.creadoPor,
      correccion.montoEsperado.toFixed(2),
      correccion.montoRecibido.toFixed(2),
      correccion.diferencia.toFixed(2),
    ]).toEqual(["correccion", r.s.correctorId, "500.00", "490.00", "-5.00"]);
    expect(marca.createdAt.getTime()).toBe(r.instanteMarca?.getTime());
    expect(correccion.createdAt.getTime()).toBe(r.instanteCorreccion?.getTime());
    const porAjuste = new Map(r.a.movs.map((m) => [m.origenId, m]));
    expect(porAjuste.get(marca.id)?.fechaMovimiento.getTime()).toBe(r.instanteMarca?.getTime());
    expect(porAjuste.get(correccion.id)?.fechaMovimiento.getTime()).toBe(r.instanteCorreccion?.getTime());
  });

  it("R26 (T11): tras marcar con faltante y tras cada correccion, «De las tiendas» de la caja = Σ saldos de las tiendas", async () => {
    // Flujo real (sin ganancia de la satelite): esperado = 20.000,00 − 1.500,00 = 18.500,00.
    //   marca 18.000   -> egreso 500   -> por cobrar 500
    //   corrige 18.800 -> ingreso 800  -> por cobrar −300 (la central le debe a la satelite)
    //   corrige 18.400 -> egreso 400   -> por cobrar 100
    // «De las tiendas» y el saldo de la tienda se quedan en 16.384,00 en los tres momentos (D10, D12).
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      if ((await aprobar(k)) !== "ok") throw new Error("no se aprobo el cierre satelite");
      const id = await consolidar(tx, k.adminSatelite);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const marca = await marcarRecibido(tx, id, "18000.00", k.maestroId);
      const trasMarca = await invarianteR8(tx, k.cierreId, id);
      const c1 = await repo.corregirConciliacion({ id, montoRecibido: "18800.00", nota: null, actorUsuarioId: k.maestroId });
      const trasC1 = await invarianteR8(tx, k.cierreId, id);
      const c2 = await repo.corregirConciliacion({ id, montoRecibido: "18400.00", nota: null, actorUsuarioId: k.maestroId });
      const trasC2 = await invarianteR8(tx, k.cierreId, id);
      return { estados: [marca, c1, c2], momentos: [trasMarca, trasC1, trasC2] };
    });
    expect(r.estados).toEqual(["updated", "updated", "updated"]);
    expect(r.momentos.map((m) => m.porCobrarSatelites)).toEqual(["500.00", "-300.00", "100.00"]);
    for (const m of r.momentos) {
      expect(m.filasTienda).toBe(5);
      expect(m.saldoTiendas).toBe("16384.00");
      expect(m.deTerceros).toBe("16384.00");
    }
  });

  it("R13: corregir NO vuelve a asentar los cierres del dia (los asiento la marca)", async () => {
    // Si se retiran a mano las filas del cierre tras la marca, una correccion no las re-escribe: solo
    // la marca asienta (design §2.4).
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      if ((await aprobar(k)) !== "ok") throw new Error("no se aprobo el cierre satelite");
      const id = await consolidar(tx, k.adminSatelite);
      await marcarRecibido(tx, id, "18500.00", k.maestroId);
      const trasMarca = await filasDeLibros(tx, k.cierreId);
      for (const tabla of ["wallet_movimiento", "wallet_tienda_movimiento", "pago_mensajero_movimiento"]) {
        await tx.$executeRawUnsafe(
          `DELETE FROM ${tabla} WHERE origen_tipo = 'cierre_dia' AND origen_id = $1`,
          k.cierreId,
        );
      }
      const res = await new CierresBodegaAdminRepository(clienteConSavepoint(tx)).corregirConciliacion({
        id,
        montoRecibido: "18000.00",
        nota: null,
        actorUsuarioId: k.maestroId,
      });
      return { trasMarca, res, libros: await filasDeLibros(tx, k.cierreId) };
    });
    expect(r.trasMarca.caja).toHaveLength(7);
    expect(r.res).toBe("updated");
    expect(r.libros).toEqual({ caja: [], tienda: [], mensajero: [] });
  });
});
