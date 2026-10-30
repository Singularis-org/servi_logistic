import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import type {
  AjustarPagoMensajeroInput,
  Alcance,
} from "@/lib/interfaces/repositories/ICierresAdminRepository";
import { sumarSnapshotsCongelados } from "@/lib/utils/cierre-totales";

import {
  INGRESO_BODEGA_INICIAL,
  PAGO_A,
  PAGO_B,
  TOTAL_PAGO_INICIAL,
  sembrarCierre56,
  type Corpus56,
  type OpcionesCorpus56,
} from "./_fixtures/cierre-ajuste-56";
import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

/**
 * 💰 SLT-56 / T5 — EL AJUSTE DEL PAGO AL MENSAJERO, CONTRA POSTGRES REAL.
 *
 * Los tests de servicio usan dobles y no ven el SQL: una mutacion del `WHERE` los pasa en verde.
 * Todo lo que decide QUE FILAS SE TOCAN —el sello, el total, el rastro, el historial— y sobre todo
 * LO QUE NO SE TOCA (recaudo, ingreso de bodega, otras gestiones, tarifa) se mide aqui.
 *
 * Cada caso corre en una transaccion que SIEMPRE se revierte, con su corpus sembrado dentro
 * (`sembrarCierre56`). El repositorio recibe `clienteConSavepoint(tx)`: su `$transaction` abre un
 * SAVEPOINT de verdad, sin el un `throw` dentro del metodo no revertiria nada y los casos de
 * atomicidad (R17) pasarian en verde por accidente.
 *
 * Mutaciones del sello (progress/impl_SLT-56.md): quitar el estado abierto pone rojos los casos de
 * `aprobado`/`rechazado`; quitar el alcance, los de otro alcance; quitar `pagoAnterior`, los de R9.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };
const MOTIVO = "rechazo con traslado de 40 km; se reconoce el viaje";

/** La tarifa REAL que sembro el corpus: el ajuste no puede tocarla (R12). */
const TARIFA = { cobroEntregado: "1500.00", cobroRechazado: "1000.00" };

interface Ctx {
  tx: TxDeTest;
  c: Corpus56;
  repo: CierresAdminRepository;
}

function repoSobre(cliente: PrismaClient): CierresAdminRepository {
  return new CierresAdminRepository(
    cliente,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

/**
 * Un cliente cuyo `cierreDia.updateMany` DENTRO de la transaccion del repositorio no casa ninguna
 * fila: simula que el cierre se cerro entre el sello y el paso 3 (el caso que una sola conexion no
 * puede producir). Lo demas pasa al `tx` real.
 */
function conPaso3Roto(cliente: PrismaClient): PrismaClient {
  const envolver = (t: object): object =>
    new Proxy(t, {
      get(o, p) {
        if (p === "cierreDia") return { updateMany: async () => ({ count: 0 }) };
        const v = Reflect.get(o, p) as unknown;
        return typeof v === "function" ? v.bind(o) : v;
      },
    });
  return new Proxy(cliente as object, {
    get(o, p) {
      if (p === "$transaction") {
        return (fn: (t: unknown) => unknown) =>
          (cliente.$transaction as (f: (t: object) => unknown) => Promise<unknown>)((t) => fn(envolver(t)));
      }
      const v = Reflect.get(o, p) as unknown;
      return typeof v === "function" ? v.bind(o) : v;
    },
  }) as PrismaClient;
}

describeSiHayBase("💰 SLT-56 — ajustar el pago al mensajero de una gestion de un cierre abierto", () => {
  let prisma: PrismaClient;

  const conCorpus = <T>(fn: (ctx: Ctx) => Promise<T>, opciones: OpcionesCorpus56 = {}): Promise<T> =>
    enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const c = await sembrarCierre56(tx, opciones);
      return fn({ tx, c, repo: repoSobre(clienteConSavepoint(tx)) });
    });

  const ajustar = (
    ctx: Ctx,
    campos: Partial<AjustarPagoMensajeroInput> = {},
    repo: CierresAdminRepository = ctx.repo,
  ) =>
    repo.ajustarPagoMensajeroEnCierre({
      gestionId: ctx.c.gestionRechazo,
      alcance: ALCANCE_CENTRAL,
      pagoAnterior: "0.00",
      pagoNuevo: "1000.00",
      motivo: MOTIVO,
      ajustadoPor: ctx.c.admin.id,
      ...campos,
    });

  /** Todo lo que un ajuste podria escribir, como texto, para comparar antes/despues. */
  async function foto(ctx: Ctx) {
    const { tx, c } = ctx;
    const cierre = await tx.cierreDia.findUniqueOrThrow({
      where: { id: c.cierreId },
      select: {
        totalEfectivo: true,
        totalSimpe: true,
        totalTransferencia: true,
        totalGeneral: true,
        totalPagoMensajero: true,
        totalIngresoBodegaRechazos: true,
      },
    });
    const gestiones = await tx.gestionOrden.findMany({
      where: { cierreId: c.cierreId },
      select: { id: true, pagoMensajero: true, ingresoBodegaRechazo: true, montoRecibido: true },
      orderBy: { id: "asc" },
    });
    const tarifa = await tx.tarifaZonaMensajero.findUniqueOrThrow({
      where: { id: c.tarifaId },
      select: { cobroEntregado: true, cobroRechazado: true },
    });
    const lineas = await tx.gestionOrdenPago.findMany({
      where: { gestion: { cierreId: c.cierreId } },
      select: { gestionId: true, metodo: true, monto: true },
      orderBy: [{ gestionId: "asc" }, { metodo: "asc" }],
    });
    const ajustes = await tx.gestionPagoMensajeroAjuste.count({ where: { cierreId: c.cierreId } });
    const historial = await tx.historialAccion.count({
      where: { accion: "cierre_dia_pago_mensajero_ajustado" },
    });
    const txt = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));
    return {
      cierre: Object.fromEntries(Object.entries(cierre).map(([k, v]) => [k, txt(v)])),
      gestiones: gestiones.map((g) => ({
        id: g.id,
        pago: txt(g.pagoMensajero),
        ingreso: txt(g.ingresoBodegaRechazo),
        recibido: txt(g.montoRecibido),
      })),
      tarifa: { cobroEntregado: txt(tarifa.cobroEntregado), cobroRechazado: txt(tarifa.cobroRechazado) },
      lineas: lineas.map((l) => `${l.gestionId}:${l.metodo}:${l.monto.toFixed(2)}`),
      ajustes,
      historial,
    };
  }

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------------------------
  // R10 / R12 — lo que se escribe y lo que NO
  // -------------------------------------------------------------------------------------------

  it("R6/R10 — ajustar un rechazo de 0 a 1000 deja ese pago y total_pago_mensajero = suma de los pagos vigentes", async () => {
    const r = await conCorpus(async (ctx) => {
      const salida = await ajustar(ctx);
      const despues = await foto(ctx);
      const pagos = await ctx.tx.gestionOrden.findMany({
        where: { cierreId: ctx.c.cierreId, anuladaAt: null },
        select: { pagoMensajero: true },
      });
      return { salida, despues, suma: sumarSnapshotsCongelados(pagos.map((g) => g.pagoMensajero)), c: ctx.c };
    });
    expect(r.salida).toMatchObject({ status: "updated", pagoMensajero: "1000.00", totalPagoMensajero: "3400.00" });
    expect(r.despues.gestiones.find((g) => g.id === r.c.gestionRechazo)?.pago).toBe("1000.00");
    expect(r.despues.cierre.totalPagoMensajero).toBe("3400.00");
    expect(r.despues.cierre.totalPagoMensajero).toBe(r.suma);
  });

  it("R10/R12 — recaudo, ingreso de bodega por rechazos, el pago de las OTRAS gestiones, sus lineas y la tarifa quedan intactos", async () => {
    const r = await conCorpus(async (ctx) => {
      const antes = await foto(ctx);
      await ajustar(ctx);
      return { antes, despues: await foto(ctx), c: ctx.c };
    });
    // Control: el corpus es el que dice ser.
    expect(r.antes.cierre.totalPagoMensajero).toBe(TOTAL_PAGO_INICIAL);
    // Lo UNICO que cambia del cierre es el total de pago al mensajero.
    expect({ ...r.despues.cierre, totalPagoMensajero: null }).toEqual({ ...r.antes.cierre, totalPagoMensajero: null });
    expect(r.despues.cierre.totalIngresoBodegaRechazos).toBe(INGRESO_BODEGA_INICIAL);
    expect(r.despues.cierre.totalGeneral).toBe("14000.00");
    // Las otras dos gestiones, igual; de la ajustada solo cambia el pago.
    const de = (f: typeof r.antes, id: string) => f.gestiones.find((g) => g.id === id);
    expect(de(r.despues, r.c.gestionA)).toEqual(de(r.antes, r.c.gestionA));
    expect(de(r.despues, r.c.gestionA)?.pago).toBe(PAGO_A);
    expect(de(r.despues, r.c.gestionB)).toEqual(de(r.antes, r.c.gestionB));
    expect(de(r.despues, r.c.gestionB)?.pago).toBe(PAGO_B);
    expect({ ...de(r.despues, r.c.gestionRechazo), pago: null }).toEqual({ ...de(r.antes, r.c.gestionRechazo), pago: null });
    expect(r.despues.lineas).toEqual(r.antes.lineas);
    expect(r.despues.lineas.length).toBe(2);
    expect(r.despues.tarifa).toEqual(TARIFA);
  });

  it("R6 — una entrega tambien se ajusta, y un cierre `vencido` esta abierto", async () => {
    const r = await conCorpus(
      async (ctx) => ({
        salida: await ajustar(ctx, { gestionId: ctx.c.gestionA, pagoAnterior: PAGO_A, pagoNuevo: "1750.50" }),
        despues: await foto(ctx),
      }),
      { estado: "vencido" },
    );
    expect(r.salida).toMatchObject({ status: "updated", pagoMensajero: "1750.50", totalPagoMensajero: "2650.50" });
    expect(r.despues.cierre.totalPagoMensajero).toBe("2650.50");
  });

  // -------------------------------------------------------------------------------------------
  // R17 / R18 — el rastro y el historial
  // -------------------------------------------------------------------------------------------

  it("R17 — una fila de rastro con actor, rol congelado, cierre, anterior, nuevo y motivo", async () => {
    const r = await conCorpus(async (ctx) => {
      const salida = await ajustar(ctx);
      const filas = await ctx.tx.gestionPagoMensajeroAjuste.findMany({
        where: { gestionId: ctx.c.gestionRechazo },
        select: {
          cierreId: true,
          actorUsuarioId: true,
          actorRol: true,
          pagoAnterior: true,
          pagoNuevo: true,
          motivo: true,
          organizacionId: true,
        },
      });
      return { salida, filas, c: ctx.c };
    });
    expect(r.filas).toHaveLength(1);
    const [f] = r.filas;
    expect({
      ...f,
      pagoAnterior: f.pagoAnterior.toFixed(2),
      pagoNuevo: f.pagoNuevo.toFixed(2),
    }).toEqual({
      cierreId: r.c.cierreId,
      actorUsuarioId: r.c.admin.id,
      actorRol: "admin",
      pagoAnterior: "0.00",
      pagoNuevo: "1000.00",
      motivo: MOTIVO,
      organizacionId: r.c.organizacionId,
    });
    // Lo que devuelve es lo escrito, con el nombre congelado del actor.
    expect(r.salida.status === "updated" && r.salida.ajuste).toMatchObject({
      actorNombre: `${r.c.admin.nombre} ${r.c.admin.primerApellido}`,
      actorRol: "admin",
      pagoAnterior: "0.00",
      pagoNuevo: "1000.00",
      motivo: MOTIVO,
    });
  });

  it("R18 — una fila de historial `cierre_dia_pago_mensajero_ajustado` con monto = pago nuevo, por guia, sin motivo", async () => {
    const r = await conCorpus(async (ctx) => {
      await ajustar(ctx);
      const filas = await ctx.tx.historialAccion.findMany({
        where: { entidadId: ctx.c.gestionRechazo },
      });
      return { filas, c: ctx.c };
    });
    expect(r.filas).toHaveLength(1);
    const [h] = r.filas;
    expect(h.accion).toBe("cierre_dia_pago_mensajero_ajustado");
    expect(h.entidadTipo).toBe("gestion_orden");
    expect(h.monto?.toFixed(2)).toBe("1000.00");
    expect(h.valorAnterior).toBeNull();
    expect(h.valorNuevo).toBeNull();
    expect(h.actorUsuarioId).toBe(r.c.admin.id);
    expect(h.actorRol).toBe("admin");
    // Ningun campo de la fila lleva el motivo (362/R5).
    expect(JSON.stringify(h)).not.toContain("traslado");
  });

  // -------------------------------------------------------------------------------------------
  // R5 — cierre no abierto
  // -------------------------------------------------------------------------------------------

  for (const estado of ["aprobado", "rechazado"] as const) {
    it(`R5 — un cierre \`${estado}\` no se ajusta: conflict y NADA escrito`, async () => {
      const r = await conCorpus(
        async (ctx) => {
          const antes = await foto(ctx);
          const salida = await ajustar(ctx);
          return { antes, salida, despues: await foto(ctx) };
        },
        { estado },
      );
      expect(r.salida).toEqual({ status: "conflict" });
      expect(r.despues).toEqual(r.antes);
      expect(r.despues.ajustes).toBe(0);
      expect(r.despues.historial).toBe(r.antes.historial);
    });
  }

  // -------------------------------------------------------------------------------------------
  // R3 / R2 — el alcance
  // -------------------------------------------------------------------------------------------

  it("R3 — desde una satelite, un cierre de la central es `fuera_de_alcance`, y nada escrito", async () => {
    const r = await conCorpus(async (ctx) => {
      const antes = await foto(ctx);
      const salida = await ajustar(ctx, {
        alcance: { destinoTipo: "bodega_satelite", destinoZonaId: ctx.c.destinoZonaId },
      });
      return { antes, salida, despues: await foto(ctx) };
    });
    expect(r.salida).toEqual({ status: "fuera_de_alcance" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R3 — un cierre de OTRA satelite es `fuera_de_alcance`; el de la central desde la central tambien si es satelite", async () => {
    const r = await conCorpus(
      async (ctx) => {
        const antes = await foto(ctx);
        const ajena = await ajustar(ctx, {
          alcance: { destinoTipo: "bodega_satelite", destinoZonaId: "zona-de-otra-satelite" },
        });
        const central = await ajustar(ctx, { alcance: ALCANCE_CENTRAL });
        return { antes, ajena, central, despues: await foto(ctx) };
      },
      { destinoTipo: "bodega_satelite" },
    );
    expect(r.ajena).toEqual({ status: "fuera_de_alcance" });
    expect(r.central).toEqual({ status: "fuera_de_alcance" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R2 — la satelite ajusta un cierre de SU zona en el acto", async () => {
    const r = await conCorpus(
      async (ctx) => ({
        salida: await ajustar(ctx, {
          alcance: { destinoTipo: "bodega_satelite", destinoZonaId: ctx.c.destinoZonaId },
        }),
        despues: await foto(ctx),
      }),
      { destinoTipo: "bodega_satelite" },
    );
    expect(r.salida).toMatchObject({ status: "updated", totalPagoMensajero: "3400.00" });
    expect(r.despues.ajustes).toBe(1);
  });

  it("una gestion ANULADA no se ajusta aunque siga colgando del cierre: conflict y nada escrito", async () => {
    const r = await conCorpus(async (ctx) => {
      await ctx.tx.gestionOrden.update({ where: { id: ctx.c.gestionRechazo }, data: { anuladaAt: new Date() } });
      const antes = await foto(ctx);
      const salida = await ajustar(ctx);
      return { antes, salida, despues: await foto(ctx) };
    });
    expect(r.salida).toEqual({ status: "conflict" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R3 — una gestion que no existe es `fuera_de_alcance`", async () => {
    const r = await conCorpus((ctx) => ajustar(ctx, { gestionId: "00000000-0000-4000-8000-000000000000" }));
    expect(r).toEqual({ status: "fuera_de_alcance" });
  });

  // -------------------------------------------------------------------------------------------
  // R9 — el pago que la pantalla mostro ya no es el vigente
  // -------------------------------------------------------------------------------------------

  it("R9 — un `pagoAnterior` que no es el vigente es conflict, y nada escrito", async () => {
    const r = await conCorpus(async (ctx) => {
      const antes = await foto(ctx);
      const salida = await ajustar(ctx, { pagoAnterior: "500.00" });
      return { antes, salida, despues: await foto(ctx) };
    });
    expect(r.salida).toEqual({ status: "conflict" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R9 — dos ajustes sobre la misma pantalla: el segundo con el anterior viejo choca; con el vigente entra y suma dos filas", async () => {
    const r = await conCorpus(async (ctx) => {
      const primero = await ajustar(ctx);
      const viejo = await ajustar(ctx, { pagoAnterior: "0.00", pagoNuevo: "1200.00" });
      const fresco = await ajustar(ctx, { pagoAnterior: "1000.00", pagoNuevo: "1200.00" });
      return { primero, viejo, fresco, despues: await foto(ctx) };
    });
    expect(r.primero.status).toBe("updated");
    expect(r.viejo).toEqual({ status: "conflict" });
    expect(r.fresco).toMatchObject({ status: "updated", totalPagoMensajero: "3600.00" });
    expect(r.despues.ajustes).toBe(2);
    expect(r.despues.historial).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------------------------
  // R17 — todo o nada
  // -------------------------------------------------------------------------------------------

  it("R17 — si el paso 3 (el total del cierre) falla, no queda ni el pago, ni el rastro, ni el historial", async () => {
    const r = await conCorpus(async (ctx) => {
      const antes = await foto(ctx);
      const roto = repoSobre(conPaso3Roto(clienteConSavepoint(ctx.tx)));
      let error: unknown = null;
      try {
        await ajustar(ctx, {}, roto);
      } catch (e) {
        error = e;
      }
      return { antes, error, despues: await foto(ctx) };
    });
    expect(String(r.error)).toMatch(/cierre no actualizado por el ajuste de pago/);
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.ajustes).toBe(0);
  });

  it("R17 — si el historial de acciones falla, tampoco queda nada", async () => {
    const r = await conCorpus(async (ctx) => {
      const antes = await foto(ctx);
      const roto = repoSobre(clienteConSavepoint(ctx.tx, true));
      let error: unknown = null;
      try {
        await ajustar(ctx, {}, roto);
      } catch (e) {
        error = e;
      }
      return { antes, error, despues: await foto(ctx) };
    });
    expect(r.error).toBeInstanceOf(RegistroCaido);
    expect(r.despues).toEqual(r.antes);
  });

  // -------------------------------------------------------------------------------------------
  // R15 — rechazar y re-solicitar conserva el ajuste
  // -------------------------------------------------------------------------------------------

  it("R15 — rechazar el cierre y re-solicitarlo conserva el pago ajustado y su total, aunque la tarifa diga otra cosa", async () => {
    const r = await conCorpus(async (ctx) => {
      const { tx, c } = ctx;
      expect((await ajustar(ctx)).status).toBe("updated");
      // El rechazo, como lo deja `resolverCierre`.
      await tx.cierreDia.update({
        where: { id: c.cierreId },
        data: { estado: "rechazado", motivoRechazo: "faltan comprobantes", resueltoPor: c.admin.id, resueltoAt: new Date() },
      });
      const cierreDia = new CierreDiaRepository(clienteConSavepoint(tx) as never, {} as never);
      const reabierto = await cierreDia.resolicitarCierreRechazado({
        cierreId: c.cierreId,
        mensajeroId: c.mensajero.id,
        // Una tarifa DISTINTA a la congelada: si la re-solicitud re-derivara, el pago cambiaria.
        tarifa: { cobroEntregado: "9999.00", cobroRechazado: "8888.00" },
      });
      const estado = await tx.cierreDia.findUniqueOrThrow({ where: { id: c.cierreId }, select: { estado: true } });
      return { reabierto, estado: estado.estado, despues: await foto(ctx), c };
    });
    expect(r.reabierto).toBe(true);
    expect(r.estado).toBe("solicitado");
    expect(r.despues.gestiones.find((g) => g.id === r.c.gestionRechazo)?.pago).toBe("1000.00");
    expect(r.despues.cierre.totalPagoMensajero).toBe("3400.00");
    expect(r.despues.ajustes).toBe(1);
  });
});
