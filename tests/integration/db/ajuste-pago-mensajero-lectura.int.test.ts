import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { toDetalleDTO } from "@/lib/services/CierreDiaService";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";

import { sembrarCierre56, type Corpus56 } from "./_fixtures/cierre-ajuste-56";
import { crearUsuarioDePrueba, type UsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

/**
 * SLT-56 / T7 — LA LECTURA DE LOS AJUSTES (R19, R20, Q2), CONTRA POSTGRES REAL.
 *
 * Los dobles no ven el `select` ni el `orderBy`: aqui la unica forma de que un caso pase es que
 * Postgres devuelva de verdad las filas de `gestion_pago_mensajero_ajuste` por la relacion anidada
 * de `GESTION_ADMIN_SELECT`, en orden cronologico, y el `_count` filtrado del cierre de bodega.
 *
 * EL CORPUS (sobre `sembrarCierre56`, con su `cierre_detail` por orden y metido en un cierre de
 * bodega satelite): la gestion de RECHAZO tiene DOS ajustes, de dos personas con roles distintos,
 * INSERTADOS DEL MAS NUEVO AL MAS VIEJO (sin el `orderBy` Postgres los devuelve en orden de
 * insercion y el caso se pone rojo). La entrega A tiene UNO. La entrega B, ninguno. Asi el cierre
 * tiene 3 filas de ajuste pero 2 GESTIONES ajustadas: un `_count` que contara filas daria 3.
 *
 * Los ajustes se insertan directos y no por el repositorio: dentro de una transaccion `now()` es
 * el mismo instante para todos y el orden no se podria medir. El camino de escritura ya lo mide
 * `ajuste-pago-mensajero-cierre.int.test.ts`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const T1 = new Date("2026-10-28T14:00:00.000Z");
const T2 = new Date("2026-10-28T16:30:00.000Z");
const T3 = new Date("2026-10-28T17:00:00.000Z");

interface Ctx {
  tx: TxDeTest;
  c: Corpus56;
  satelite: UsuarioDePrueba;
  alcance: Alcance;
  cierreBodegaId: string;
  admin: CierresAdminRepository;
  bodega: CierresBodegaAdminRepository;
  mensajero: CierreDiaRepository;
}

describeSiHayBase("SLT-56 — el detalle de admin lee los ajustes del pago al mensajero", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const conCorpus = <T>(fn: (ctx: Ctx) => Promise<T>, conAjustes = true): Promise<T> =>
    enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const c = await sembrarCierre56(tx, { destinoTipo: "bodega_satelite" });
      const satelite = await crearUsuarioDePrueba(tx, "adminSatelite");

      // El detalle de admin compone cada gestion con la fila CONGELADA de su orden: sin ella el
      // repositorio lanza `CierreDetalleFaltanteError` (no hay fallback a datos vivos).
      const gestiones = await tx.gestionOrden.findMany({
        where: { cierreId: c.cierreId },
        select: {
          orden: {
            select: {
              id: true,
              numGuia: true,
              numRemision: true,
              destinatario: true,
              producto: true,
              tiendaId: true,
              zonaId: true,
            },
          },
        },
      });
      for (const { orden } of gestiones) {
        await tx.cierreDetail.create({
          data: {
            cierreId: c.cierreId,
            ordenId: orden.id,
            cobraComision: false,
            zonaId: orden.zonaId,
            tiendaId: orden.tiendaId,
            esCentral: false,
            numGuia: orden.numGuia,
            numRemision: orden.numRemision,
            destinatario: orden.destinatario,
            producto: orden.producto,
            tiendaNombre: "Tienda 56",
            zonaNombre: "Zona 56",
            provinciaNombre: "Provincia 56",
            cantonNombre: "Canton 56",
          },
          select: { id: true },
        });
      }

      const cierreBodega = await tx.cierreBodega.create({
        data: {
          zonaId: c.destinoZonaId,
          solicitadoPor: satelite.id,
          estado: "solicitado",
          totalEfectivo: new Prisma.Decimal("0.00"),
          totalSimpe: new Prisma.Decimal("0.00"),
          totalTransferencia: new Prisma.Decimal("0.00"),
          totalGeneral: new Prisma.Decimal("0.00"),
          totalPagoMensajero: new Prisma.Decimal("0.00"),
          totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
        },
        select: { id: true },
      });
      await tx.cierreDia.update({
        where: { id: c.cierreId },
        data: { cierreBodegaId: cierreBodega.id },
        select: { id: true },
      });

      const ajuste = (
        gestionId: string,
        actor: UsuarioDePrueba,
        actorRol: "admin" | "adminSatelite",
        anterior: string,
        nuevo: string,
        motivo: string,
        createdAt: Date,
      ) =>
        tx.gestionPagoMensajeroAjuste.create({
          data: {
            gestionId,
            cierreId: c.cierreId,
            pagoAnterior: new Prisma.Decimal(anterior),
            pagoNuevo: new Prisma.Decimal(nuevo),
            actorUsuarioId: actor.id,
            actorRol,
            motivo,
            createdAt,
          },
          select: { id: true },
        });
      // Del MAS NUEVO al MAS VIEJO a proposito (ver cabecera).
      if (conAjustes) {
      await ajuste(c.gestionRechazo, c.admin, "admin", "1000", "1200.5", "se suma el peaje", T3);
      await ajuste(c.gestionA, satelite, "adminSatelite", "1500", "1700", "entrega con escalera", T2);
      await ajuste(c.gestionRechazo, satelite, "adminSatelite", "0", "1000", "viaje de 40 km", T1);
      }

      const cliente = tx as unknown as PrismaClient;
      const nada = {} as never;
      return fn({
        tx,
        c,
        satelite,
        alcance: { destinoTipo: "bodega_satelite", destinoZonaId: c.destinoZonaId },
        cierreBodegaId: cierreBodega.id,
        admin: new CierresAdminRepository(cliente, nada, nada, nada, nada, nada, nada, nada),
        bodega: new CierresBodegaAdminRepository(cliente),
        mensajero: new CierreDiaRepository(cliente, {} as unknown as ITarifaVigenteRepository),
      });
    });

  /** Lo que el detalle tiene que traer, ya con nombre y rol de quien ajusto. */
  function esperados(ctx: Ctx) {
    // Escrito a mano desde lo que sembro el fixture, NO con `nombreCompletoUsuario`: compararlo
    // contra la funcion que genera el texto estaria verde aunque el select no trajera el actor.
    const nombreAdmin = `${ctx.c.admin.nombre} ${ctx.c.admin.primerApellido}`;
    const nombreSat = `${ctx.satelite.nombre} ${ctx.satelite.primerApellido}`;
    return {
      rechazo: [
        {
          creadoAt: T1.toISOString(),
          actorNombre: nombreSat,
          actorRol: "adminSatelite",
          pagoAnterior: "0.00",
          pagoNuevo: "1000.00",
          motivo: "viaje de 40 km",
        },
        {
          creadoAt: T3.toISOString(),
          actorNombre: nombreAdmin,
          actorRol: "admin",
          pagoAnterior: "1000.00",
          pagoNuevo: "1200.50",
          motivo: "se suma el peaje",
        },
      ],
      a: [
        {
          creadoAt: T2.toISOString(),
          actorNombre: nombreSat,
          actorRol: "adminSatelite",
          pagoAnterior: "1500.00",
          pagoNuevo: "1700.00",
          motivo: "entrega con escalera",
        },
      ],
    };
  }

  function porGestion(ctx: Ctx, gestiones: CierreGestionPendienteRow[]) {
    const m = new Map(gestiones.map((g) => [g.gestionId, g]));
    // Control positivo: las tres gestiones del corpus llegaron.
    expect(gestiones).toHaveLength(3);
    return {
      rechazo: m.get(ctx.c.gestionRechazo)!,
      a: m.get(ctx.c.gestionA)!,
      b: m.get(ctx.c.gestionB)!,
    };
  }

  it("CONTROL POSITIVO: el corpus tiene 3 filas de ajuste en el cierre", async () => {
    const n = await conCorpus((ctx) =>
      ctx.tx.gestionPagoMensajeroAjuste.count({ where: { cierreId: ctx.c.cierreId } }),
    );
    expect(n).toBe(3);
  });

  it("R19 — el detalle del cierre del dia trae los ajustes en orden cronologico con nombre, rol, importes y motivo", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.admin.findCierreByIdEnAlcance(ctx.c.cierreId, ctx.alcance);
      expect(r).not.toBeNull();
      const g = porGestion(ctx, r!.gestiones);
      const e = esperados(ctx);
      expect(g.rechazo.ajustesPago).toEqual(e.rechazo);
      expect(g.a.ajustesPago).toEqual(e.a);
      // Sin ajustes: lista VACIA (no ausente), que es lo que deja la marca «Ajustado» apagada.
      expect(g.b.ajustesPago).toEqual([]);
      // Importes STRING escala 2 (R16).
      for (const a of g.rechazo.ajustesPago!) {
        expect(typeof a.pagoAnterior).toBe("string");
        expect(a.pagoNuevo).toMatch(/^\d+\.\d{2}$/);
      }
    });
  });

  it("R20 — el detalle del cierre de bodega trae `gestionesAjustadas` (gestiones, no filas) y los ajustes por gestion", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.bodega.findCierreBodegaConDetalle(ctx.cierreBodegaId);
      expect(r).not.toBeNull();
      expect(r!.cierresDia).toHaveLength(1);
      const cd = r!.cierresDia[0]!;
      // 3 filas de ajuste, pero 2 gestiones ajustadas.
      expect(cd.resumen.gestionesAjustadas).toBe(2);
      const g = porGestion(ctx, cd.gestiones);
      const e = esperados(ctx);
      expect(g.rechazo.ajustesPago).toEqual(e.rechazo);
      expect(g.a.ajustesPago).toEqual(e.a);
      expect(g.b.ajustesPago).toEqual([]);
    });
  });

  it("R20 — un cierre del dia SIN ajustes cuenta 0 en el cierre de bodega", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.bodega.findCierreBodegaConDetalle(ctx.cierreBodegaId);
      expect(r!.cierresDia).toHaveLength(1); // control positivo
      expect(r!.cierresDia[0]!.resumen.gestionesAjustadas).toBe(0);
      expect(r!.cierresDia[0]!.gestiones.every((g) => g.ajustesPago?.length === 0)).toBe(true);
    }, false);
  });

  it("Q2 — la vista del mensajero de su cierre NO trae `ajustesPago` (ni en la fila ni en el DTO), solo el pago vigente", async () => {
    await conCorpus(async (ctx) => {
      // El pago vigente que ve el mensajero es el de la columna: lo dejamos en el ultimo ajuste.
      await ctx.tx.gestionOrden.update({
        where: { id: ctx.c.gestionRechazo },
        data: { pagoMensajero: new Prisma.Decimal("1200.50") },
        select: { id: true },
      });
      const r = await ctx.mensajero.findCierrePropioConGestiones(ctx.c.cierreId, ctx.c.mensajero.id);
      expect(r).not.toBeNull();
      expect(r!.gestiones).toHaveLength(3); // control positivo
      for (const fila of r!.gestiones) {
        expect(Object.keys(fila)).not.toContain("ajustesPago");
        expect(Object.keys(toDetalleDTO(fila, {}))).not.toContain("ajustesPago");
      }
      const rechazo = r!.gestiones.find((g) => g.gestionId === ctx.c.gestionRechazo)!;
      expect(rechazo.pagoMensajero).toBe("1200.50");
    });
  });
});
