import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  ASIENTOS_POR_DEFECTO,
  asentarCierreDia,
  type AsientosCierreDiaDeps,
} from "@/lib/repositories/_shared/asientos-cierre-dia";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  aprobar,
  consolidar,
  filasDeLibros,
  marcarRecibido,
  sembrarCierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";

// SLT-73 · T4 · R10/R11/R12/R20/R22 — MARCAR RECIBIDA UNA CONSOLIDACION ASIENTA EL DINERO DE SUS
// CIERRES SATELITE, Y LA DIFERENCIA SI LO RECIBIDO NO CUADRA.
//
// Flujo REAL de punta a punta, contra Postgres y en una transaccion que SIEMPRE se revierte:
//   sembrar → aprobar (el adminSatelite; T3: no escribe dinero) → consolidar (servicio real de la
//   satelite) → marcar recibido (repositorio real, con el default del constructor).
//
// La siembra es la de `slt73-aprobar-central-igual` (mismos importes), mas un `total_ingreso_bodega_
// rechazos` de 300,00 en el snapshot del cierre, para que el esperado tenga los TRES terminos:
//
//   esperado = paraLaCentral(20.000,00 − 1.500,00 − 300,00) = 18.200,00
//   (`total_efectivo` es 20.000,00: un esperado sobre el efectivo daria otra cifra)
//
// Las filas esperadas van ESCRITAS A MANO y NO se leen de los feeds (memoria «asercion contra su
// propia fuente»). Son las MISMAS que la aprobacion de la central escribe (R10).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const CAJA = [
  { tipo: "egreso", categoria: "egreso_indemnizacion", monto: "6000.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "1500.00" },
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "20000.00" },
  { tipo: "ingreso", categoria: "ingreso_comision_cod", monto: "700.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "2500.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "91.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "325.00" },
];

const TIENDA = [
  { tipo: "credito", categoria: "cod_recaudado", monto: "20000.00" },
  { tipo: "debito", categoria: "comision_cod", monto: "700.00" },
  { tipo: "debito", categoria: "flete", monto: "2500.00" },
  { tipo: "debito", categoria: "iva_comision_cod", monto: "91.00" },
  { tipo: "debito", categoria: "iva_flete", monto: "325.00" },
];

const MENSAJERO = [
  { tipo: "devengo", categoria: "pago_devengado", monto: "1500.00" },
  { tipo: "pago", categoria: "pago_efectivo", monto: "1500.00" },
];

const VACIO = { caja: [], tienda: [], mensajero: [] };

/**
 * Un cierre satelite aprobado y CONSOLIDADO, mas OTRO cierre satelite aprobado que NO entra en la
 * consolidacion (otra zona, sin consolidar): la marca no lo debe tocar.
 */
async function prepararSatelite(tx: TxDeTest) {
  const k = await sembrarCierreAprobable(tx, "bodega_satelite");
  await tx.cierreDia.update({
    where: { id: k.cierreId },
    data: { totalIngresoBodegaRechazos: new Prisma.Decimal("300.00") },
  });
  if ((await aprobar(k)) !== "ok") throw new Error("no se aprobo el cierre satelite");
  const otro = await sembrarCierreAprobable(tx, "bodega_satelite");
  if ((await aprobar(otro)) !== "ok") throw new Error("no se aprobo el otro cierre satelite");
  const cierreBodegaId = await consolidar(tx, k.adminSatelite);
  return { k, otro, cierreBodegaId };
}

/** Los ajustes de la consolidacion y sus movimientos de diferencia en la caja. */
async function diferencias(tx: TxDeTest, cierreBodegaId: string) {
  const ajustes = await tx.conciliacionBodegaAjuste.findMany({
    where: { cierreBodegaId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      evento: true,
      montoEsperado: true,
      montoRecibido: true,
      diferencia: true,
      creadoPor: true,
    },
  });
  const caja = await tx.$queryRawUnsafe<{ tipo: string; categoria: string; monto: string }[]>(
    `SELECT w.tipo::text, w.categoria::text, w.monto::text FROM wallet_movimiento w
       JOIN conciliacion_bodega_ajuste a ON a.id = w.origen_id
      WHERE w.origen_tipo = 'conciliacion_bodega_ajuste' AND a.cierre_bodega_id = $1
      ORDER BY a.created_at, w.categoria`,
    cierreBodegaId,
  );
  return {
    ajustes: ajustes.map((a) => ({
      evento: a.evento,
      esperado: a.montoEsperado.toFixed(2),
      recibido: a.montoRecibido.toFixed(2),
      diferencia: a.diferencia.toFixed(2),
      creadoPor: a.creadoPor,
    })),
    caja,
  };
}

describeSiHayBase("SLT-73 T4 — marcar recibida asienta los cierres satelite", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: aprobado y consolidado, el cierre satelite NO tiene filas y la consolidacion lleva su snapshot", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, otro, cierreBodegaId } = await prepararSatelite(tx);
      return {
        consolidacion: await tx.cierreBodega.findUniqueOrThrow({
          where: { id: cierreBodegaId },
          select: {
            estado: true,
            totalGeneral: true,
            totalEfectivo: true,
            totalPagoMensajero: true,
            totalIngresoBodegaRechazos: true,
          },
        }),
        enlace: await tx.cierreDia.findUniqueOrThrow({
          where: { id: k.cierreId },
          select: { cierreBodegaId: true, estado: true },
        }),
        otroEnlace: await tx.cierreDia.findUniqueOrThrow({
          where: { id: otro.cierreId },
          select: { cierreBodegaId: true, estado: true },
        }),
        cierreBodegaId,
        libros: await filasDeLibros(tx, k.cierreId),
      };
    });
    expect(r.consolidacion.estado).toBe("solicitado");
    expect(r.consolidacion.totalGeneral.toFixed(2)).toBe("20000.00");
    expect(r.consolidacion.totalEfectivo.toFixed(2)).toBe("20000.00");
    expect(r.consolidacion.totalPagoMensajero.toFixed(2)).toBe("1500.00");
    expect(r.consolidacion.totalIngresoBodegaRechazos.toFixed(2)).toBe("300.00");
    expect(r.enlace).toEqual({ cierreBodegaId: r.cierreBodegaId, estado: "aprobado" });
    expect(r.otroEnlace).toEqual({ cierreBodegaId: null, estado: "aprobado" });
    expect(r.libros).toEqual(VACIO);
  });

  it("R10: tras marcar, los tres libros del cierre tienen las filas de la central (literal), y el cierre NO incluido sigue sin ninguna", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, otro, cierreBodegaId } = await prepararSatelite(tx);
      // Sin `asientos`: el default del constructor, como en produccion (design §2.6).
      const res = await marcarRecibido(tx, cierreBodegaId, "18200.00", k.maestroId);
      return {
        res,
        libros: await filasDeLibros(tx, k.cierreId),
        otro: await filasDeLibros(tx, otro.cierreId),
        dif: await diferencias(tx, cierreBodegaId),
      };
    });
    expect(r.res).toBe("updated");
    expect(r.libros.caja).toEqual(CAJA);
    expect(r.libros.tienda).toEqual(TIENDA);
    expect(r.libros.mensajero).toEqual(MENSAJERO);
    expect(r.otro).toEqual(VACIO);
    // Recibido = esperado: ni ajuste ni movimiento de diferencia (R11, tercer caso).
    expect(r.dif).toEqual({ ajustes: [], caja: [] });
  });

  it("R10: un cierre de la CENTRAL enlazado a la consolidacion no se asienta en la marca (centinela del filtro de destino)", async () => {
    // Estado que el flujo no produce (la consolidacion solo enlaza satelites): se fuerza para que el
    // filtro `destinoTipo` tenga algo que dejar fuera. Si la marca lo asentara, tendria filas.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      const central = await sembrarCierreAprobable(tx, "bodega_central");
      await tx.cierreDia.update({
        where: { id: central.cierreId },
        data: { estado: "aprobado", cierreBodegaId },
      });
      const res = await marcarRecibido(tx, cierreBodegaId, "18200.00", k.maestroId);
      return { res, central: await filasDeLibros(tx, central.cierreId) };
    });
    expect(r.res).toBe("updated");
    expect(r.central).toEqual(VACIO);
  });

  it("R11/R15: recibido MENOS que el esperado -> UN egreso de diferencia por 200,00 y su ajuste `marca`", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      const res = await marcarRecibido(tx, cierreBodegaId, "18000.00", k.maestroId);
      return {
        res,
        maestroId: k.maestroId,
        dif: await diferencias(tx, cierreBodegaId),
        libros: await filasDeLibros(tx, k.cierreId),
      };
    });
    expect(r.res).toBe("updated");
    expect(r.dif.ajustes).toEqual([
      {
        evento: "marca",
        esperado: "18200.00",
        recibido: "18000.00",
        diferencia: "200.00",
        creadoPor: r.maestroId,
      },
    ]);
    expect(r.dif.caja).toEqual([
      { tipo: "egreso", categoria: "egreso_diferencia_satelite", monto: "200.00" },
    ]);
    // Q1-A (D10): los asientos del cierre entran COMPLETOS aunque se reciba menos.
    expect(r.libros.caja).toEqual(CAJA);
  });

  it("R11: recibido MAS que el esperado -> UN ingreso de diferencia por 300,00", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      await marcarRecibido(tx, cierreBodegaId, "18500.00", k.maestroId);
      return diferencias(tx, cierreBodegaId);
    });
    expect(r.ajustes.map((a) => [a.evento, a.esperado, a.recibido, a.diferencia])).toEqual([
      ["marca", "18200.00", "18500.00", "-300.00"],
    ]);
    expect(r.caja).toEqual([
      { tipo: "ingreso", categoria: "ingreso_diferencia_satelite", monto: "300.00" },
    ]);
  });

  it("R12: si un feed falla, la marca entera revierte (ni marca, ni libros, ni ajuste, ni historial); reintentar asienta una vez", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      const roto: AsientosCierreDiaDeps = {
        ...ASIENTOS_POR_DEFECTO,
        walletMensajeroFeedService: {
          construirMovimientosDePago: async () => {
            throw new Error("fallo PROVOCADO del feed del mensajero");
          },
        },
      };
      let error: unknown = null;
      try {
        await marcarRecibido(tx, cierreBodegaId, "18000.00", k.maestroId, roto);
      } catch (e) {
        error = e;
      }
      const tras = {
        consolidacion: await tx.cierreBodega.findUniqueOrThrow({
          where: { id: cierreBodegaId },
          select: { estado: true, conciliadoAt: true, montoRecibido: true },
        }),
        libros: await filasDeLibros(tx, k.cierreId),
        dif: await diferencias(tx, cierreBodegaId),
        historial: await tx.historialAccion.count({ where: { entidadId: cierreBodegaId } }),
      };
      const reintento = await marcarRecibido(tx, cierreBodegaId, "18000.00", k.maestroId);
      return {
        error: error instanceof Error ? error.message : String(error),
        tras,
        reintento,
        libros: await filasDeLibros(tx, k.cierreId),
        dif: await diferencias(tx, cierreBodegaId),
      };
    });
    expect(r.error).toContain("fallo PROVOCADO");
    expect(r.tras.consolidacion).toEqual({ estado: "solicitado", conciliadoAt: null, montoRecibido: null });
    expect(r.tras.libros).toEqual(VACIO);
    expect(r.tras.dif).toEqual({ ajustes: [], caja: [] });
    expect(r.tras.historial).toBe(0);
    expect(r.reintento).toBe("updated");
    expect(r.libros).toEqual({ caja: CAJA, tienda: TIENDA, mensajero: MENSAJERO });
    expect(r.dif.caja).toEqual([
      { tipo: "egreso", categoria: "egreso_diferencia_satelite", monto: "200.00" },
    ]);
  });

  it("R12: un asiento YA escrito no se duplica al marcar, y una segunda marca es `conflict` sin escribir nada", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      // Lo que dejo escrito la aprobacion de antes del hotfix (o un reintento): el cierre ya tiene
      // sus asientos cuando llega la marca.
      await asentarCierreDia(clienteConSavepoint(tx), k.cierreId);
      const primera = await marcarRecibido(tx, cierreBodegaId, "18000.00", k.maestroId);
      const segunda = await marcarRecibido(tx, cierreBodegaId, "1.00", k.maestroId);
      return {
        primera,
        segunda,
        libros: await filasDeLibros(tx, k.cierreId),
        dif: await diferencias(tx, cierreBodegaId),
      };
    });
    expect([r.primera, r.segunda]).toEqual(["updated", "conflict"]);
    expect(r.libros).toEqual({ caja: CAJA, tienda: TIENDA, mensajero: MENSAJERO });
    expect(r.dif.caja).toEqual([
      { tipo: "egreso", categoria: "egreso_diferencia_satelite", monto: "200.00" },
    ]);
  });

  it("R20: un cierre cuyos asientos se retiraron (migracion C) los vuelve a recibir al marcar", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      await asentarCierreDia(clienteConSavepoint(tx), k.cierreId);
      const antes = await filasDeLibros(tx, k.cierreId);
      // Lo que hace la migracion C: retira las filas `cierre_dia` del cierre de los tres libros.
      for (const tabla of ["wallet_movimiento", "wallet_tienda_movimiento", "pago_mensajero_movimiento"]) {
        await tx.$executeRawUnsafe(
          `DELETE FROM ${tabla} WHERE origen_tipo = 'cierre_dia' AND origen_id = $1`,
          k.cierreId,
        );
      }
      const retirado = await filasDeLibros(tx, k.cierreId);
      const res = await marcarRecibido(tx, cierreBodegaId, "18200.00", k.maestroId);
      return { antes, retirado, res, libros: await filasDeLibros(tx, k.cierreId) };
    });
    expect(r.antes.caja).toEqual(CAJA);
    expect(r.retirado).toEqual(VACIO);
    expect(r.res).toBe("updated");
    expect(r.libros).toEqual({ caja: CAJA, tienda: TIENDA, mensajero: MENSAJERO });
  });

  it("R22: todas las filas de la marca van fechadas en el instante de la conciliacion, no en el de la aprobacion", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const { k, cierreBodegaId } = await prepararSatelite(tx);
      const aprobadoAt = (
        await tx.cierreDia.findUniqueOrThrow({ where: { id: k.cierreId }, select: { resueltoAt: true } })
      ).resueltoAt;
      const antesDeMarcar = new Date();
      await marcarRecibido(tx, cierreBodegaId, "18000.00", k.maestroId);
      const conciliadoAt = (
        await tx.cierreBodega.findUniqueOrThrow({
          where: { id: cierreBodegaId },
          select: { conciliadoAt: true },
        })
      ).conciliadoAt;
      const fechas = await tx.$queryRawUnsafe<{ tabla: string; fecha: Date }[]>(
        `SELECT 'caja' AS tabla, fecha_movimiento AS fecha FROM wallet_movimiento
          WHERE origen_tipo = 'cierre_dia' AND origen_id = $1
         UNION ALL
         SELECT 'tienda', fecha_movimiento FROM wallet_tienda_movimiento
          WHERE origen_tipo = 'cierre_dia' AND origen_id = $1
         UNION ALL
         SELECT 'mensajero', fecha_movimiento FROM pago_mensajero_movimiento
          WHERE origen_tipo = 'cierre_dia' AND origen_id = $1
         UNION ALL
         SELECT 'diferencia', w.fecha_movimiento FROM wallet_movimiento w
           JOIN conciliacion_bodega_ajuste a ON a.id = w.origen_id
          WHERE w.origen_tipo = 'conciliacion_bodega_ajuste' AND a.cierre_bodega_id = $2`,
        k.cierreId,
        cierreBodegaId,
      );
      return { aprobadoAt, antesDeMarcar, conciliadoAt, fechas };
    });
    // 7 de caja + 5 de tienda + 2 del mensajero + 1 de diferencia.
    expect(r.fechas).toHaveLength(15);
    expect(r.conciliadoAt).not.toBeNull();
    expect(r.aprobadoAt).not.toBeNull();
    for (const f of r.fechas) {
      expect(f.fecha.getTime()).toBeGreaterThanOrEqual(r.antesDeMarcar.getTime());
      expect(f.fecha.getTime()).toBe(r.conciliadoAt?.getTime());
      expect(f.fecha.getTime()).toBeGreaterThan(r.aprobadoAt?.getTime() ?? Number.POSITIVE_INFINITY);
    }
  });
});
