import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { CierresBodegaAdminService } from "@/lib/services/CierresBodegaAdminService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { ZONA_DE_CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T3.1; R70, R72, R260, R261,
// R263, R264, R265) — el reparto en % que emiten los dos detalles, con los SERVICIOS REALES sobre
// los REPOSITORIOS REALES, contra Postgres.
//
// POR QUE CONTRA POSTGRES. Los importes que se reparten salen de lo congelado: `totales.general`
// del snapshot del cierre, y el flete y la comision re-derivados de `cierre_detail`. Un test de
// servicio con dobles le dice al repositorio que devolver; aqui la unica forma de que un caso pase
// es que el SQL devuelva lo sembrado y que el servicio pase las partes correctas, en su orden.
//
// EL CORPUS (cifras escritas A MANO; son el contrato — derivarlas con las funciones de produccion
// las compararia contra su propia fuente):
//
//   MA — mensajero, zona CENTRAL. Una entrega de 100 000,00 cobrada 70 000,00 en efectivo +
//        30 000,00 por SINPE. Tarifa congelada: flete 4 000,00 + IVA 13 % = 4 520,00; comision COD
//        1,00 % de 100 000,00 = 1 000,00 + IVA 13 % = 1 130,00.
//        pagoTienda = 100 000,00 − 4 520,00 − 1 130,00 = 94 350,00 · sale de lo recaudado 5 650,00
//        94,35 % / 5,65 % → pisos 94 / 5, restos 0,35 / 0,65 → [94, 6].
//   MB — mensajero, zona SATELITE. Tres entregas de 10 000,00 en efectivo, flete 1 000,00 + IVA 13 %
//        cada una, sin comision → 30 000,00; sale 3 390,00; tienda 26 610,00.
//        88,7 % / 11,3 % → [89, 11]. Igual para la central (maestro) y para el adminSatelite.
//   MC — mensajero, zona satelite. Una entrega PREPAGADA (sin monto a cobrar): general 0,00, flete
//        1 000,00 + IVA 13 % → pagoTienda −1 130,00 → `null`.
//   BX — cierre de bodega: general 100 000,00, pago a mensajeros 3 000,00, gana la bodega 500,00
//        → para la central 96 500,00. 96,5 / 3 / 0,5 → pisos 96 / 3 / 0, restos 0,5 / 0 / 0,5
//        (empate: gana la primera) → [97, 3, 0]. Dos cierres del dia.
//   BY — cierre de bodega: general 1 000,00, pago 1 500,00, bodega 0,00 → para la central
//        −500,00 → `null`. Un cierre del dia (en otra zona: solo un `solicitado` por zona).
//
// TODO corre en una transaccion que SIEMPRE se revierte. Sin base se SALTA; con base y sin
// catalogos, `crearFksDeOrden` LANZA. Nada de `return` temprano.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

interface Corpus {
  tx: TxDeTest;
  ma: string;
  mb: string;
  mc: string;
  bx: string;
  by: string;
  maestro: Actor;
  /** adminSatelite de la zona de MB. */
  adminSatelite: Actor;
  admin: CierresAdminService;
  bodega: CierresBodegaAdminService;
}

/** Huella de lo que el detalle lee: si una lectura escribiera, cambiaria. */
async function huella(tx: TxDeTest, cierresDia: string[], cierresBodega: string[]): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ fila: string }[]>(
    `SELECT to_jsonb(x)::text AS fila FROM (
       SELECT to_jsonb(cd) AS j, cd.id FROM "cierre_dia" cd WHERE cd.id = ANY($1::text[])
       UNION ALL
       SELECT to_jsonb(cb), cb.id FROM "cierre_bodega" cb WHERE cb.id = ANY($2::text[])
       UNION ALL
       SELECT to_jsonb(d), d.id FROM "cierre_detail" d WHERE d.cierre_id = ANY($1::text[])
       UNION ALL
       SELECT to_jsonb(g), g.id FROM "gestion_orden" g WHERE g.cierre_id = ANY($1::text[])
     ) x ORDER BY x.id`,
    cierresDia,
    cierresBodega,
  );
  return filas.map((f) => f.fila);
}

async function sembrar(tx: TxDeTest): Promise<Corpus> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const fks = await crearFksDeOrden(tx); // zona satelite «fixture» (la de MB, MC y BX)
  const zonaSatelite = fks.zonaId;
  const zonaCentral = (
    await tx.zona.create({
      data: {
        nombre: `Central SLT-111 ${sufijo}`,
        esCentral: true,
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
      },
      select: { id: true },
    })
  ).id;
  const zonaSatelite2 = (
    await tx.zona.create({
      data: { nombre: `Satelite 2 SLT-111 ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    })
  ).id;

  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const satelite = await crearUsuarioDePrueba(tx, "adminSatelite");
  await tx.usuario.update({ where: { id: satelite.id }, data: { zonaId: zonaSatelite } });
  const mensajero = async () => (await crearUsuarioDePrueba(tx, "mensajero")).id;

  const tarifa = await tx.tarifa.create({
    data: {
      tiendaId: fks.tiendaId,
      zonaId: null,
      valorFlete: new Prisma.Decimal("1000.00"),
      valorFleteGam: new Prisma.Decimal("1000.00"),
      valorFleteDevuelto: new Prisma.Decimal("1000.00"),
      valorFleteDevueltoGam: new Prisma.Decimal("1000.00"),
      fulfillment: new Prisma.Decimal("0.00"),
      comisionCod: new Prisma.Decimal("0.00"),
      ivaFlete: new Prisma.Decimal("13.00"),
      ivaComisionCod: new Prisma.Decimal("13.00"),
    },
    select: { id: true },
  });

  const cierreDia = async (o: {
    mensajeroId: string;
    destinoTipo: "bodega_central" | "bodega_satelite";
    zonaId: string;
    efectivo: string;
    simpe: string;
    general: string;
    pago: string;
    bodega: string;
    cierreBodegaId?: string;
  }) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId: o.mensajeroId,
          estado: "solicitado",
          destinoTipo: o.destinoTipo,
          destinoZonaId: o.zonaId,
          cierreBodegaId: o.cierreBodegaId ?? null,
          totalEfectivo: new Prisma.Decimal(o.efectivo),
          totalSimpe: new Prisma.Decimal(o.simpe),
          totalTransferencia: new Prisma.Decimal("0.00"),
          totalGeneral: new Prisma.Decimal(o.general),
          totalPagoMensajero: new Prisma.Decimal(o.pago),
          totalIngresoBodegaRechazos: new Prisma.Decimal(o.bodega),
        },
        select: { id: true },
      })
    ).id;

  /** Una orden + su gestion entregada + su fila CONGELADA de `cierre_detail`. */
  const entrega = async (o: {
    clave: string;
    cierreId: string;
    mensajeroId: string;
    zonaId: string;
    esCentral: boolean;
    /** `null` = prepagada (sin monto a cobrar). */
    montoCobrar: string | null;
    flete: string;
    comisionPct: string;
    pagos: Array<{ metodo: "efectivo" | "SINPE"; monto: string }>;
  }) => {
    const numRemision = `SLT111-${o.clave}-${sufijo}`;
    const cobraComision = o.comisionPct !== "0.00";
    const orden = await tx.orden.create({
      data: {
        numRemision,
        destinatario: `Destinatario ${o.clave}`,
        telefonoDest: "88880000",
        producto: `Producto ${o.clave}`,
        montoCobrar: o.montoCobrar === null ? null : new Prisma.Decimal(o.montoCobrar),
        cobraComision,
        estatusId: fks.estatusId,
        mensajeroAsignadoId: o.mensajeroId,
        tiendaId: fks.tiendaId,
        zonaId: o.zonaId,
        provinciaId: fks.provinciaId,
        cantonId: fks.cantonId,
      },
      select: { id: true },
    });
    const recibido = o.pagos.reduce((s, p) => s.plus(p.monto), new Prisma.Decimal(0));
    await tx.gestionOrden.create({
      data: {
        ordenId: orden.id,
        mensajeroId: o.mensajeroId,
        resultado: "entregado",
        cierreId: o.cierreId,
        montoRecibido: o.pagos.length === 0 ? null : recibido,
        metodoPago: o.pagos.length === 0 ? null : o.pagos[0].metodo,
        pagos:
          o.pagos.length === 0
            ? undefined
            : { create: o.pagos.map((p) => ({ metodo: p.metodo, monto: new Prisma.Decimal(p.monto) })) },
      },
      select: { id: true },
    });
    await tx.cierreDetail.create({
      data: {
        cierreId: o.cierreId,
        ordenId: orden.id,
        montoCobrar: o.montoCobrar === null ? null : new Prisma.Decimal(o.montoCobrar),
        cobraComision,
        zonaId: o.zonaId,
        tiendaId: fks.tiendaId,
        esCentral: o.esCentral,
        esZonaEspecial: false,
        tarifaId: tarifa.id,
        tarifaValorFlete: new Prisma.Decimal(o.flete),
        tarifaValorFleteGam: new Prisma.Decimal(o.flete),
        tarifaValorFleteDevuelto: new Prisma.Decimal(o.flete),
        tarifaValorFleteDevueltoGam: new Prisma.Decimal(o.flete),
        tarifaComisionCod: new Prisma.Decimal(o.comisionPct),
        tarifaIvaFlete: new Prisma.Decimal("13.00"),
        tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
        tarifaFulfillment: new Prisma.Decimal("0.00"),
        numRemision,
        destinatario: `Destinatario ${o.clave}`,
        producto: `Producto ${o.clave}`,
        tiendaNombre: "Tienda SLT-111",
        zonaNombre: "Zona SLT-111",
        provinciaNombre: "Cartago",
        cantonNombre: "Cartago",
      },
      select: { id: true },
    });
  };

  // MA — central, una entrega de 100 000,00 (70 000,00 efectivo + 30 000,00 SINPE).
  const mensajeroA = await mensajero();
  const ma = await cierreDia({
    mensajeroId: mensajeroA,
    destinoTipo: "bodega_central",
    zonaId: zonaCentral,
    efectivo: "70000.00",
    simpe: "30000.00",
    general: "100000.00",
    pago: "0.00",
    bodega: "0.00",
  });
  await entrega({
    clave: "ma",
    cierreId: ma,
    mensajeroId: mensajeroA,
    zonaId: zonaCentral,
    esCentral: true,
    montoCobrar: "100000.00",
    flete: "4000.00",
    comisionPct: "1.00",
    pagos: [
      { metodo: "efectivo", monto: "70000.00" },
      { metodo: "SINPE", monto: "30000.00" },
    ],
  });

  // MB — satelite, tres entregas de 10 000,00 en efectivo, flete 1 000,00 + IVA, sin comision.
  const mensajeroB = await mensajero();
  const mb = await cierreDia({
    mensajeroId: mensajeroB,
    destinoTipo: "bodega_satelite",
    zonaId: zonaSatelite,
    efectivo: "30000.00",
    simpe: "0.00",
    general: "30000.00",
    pago: "0.00",
    bodega: "0.00",
  });
  for (const clave of ["mb-1", "mb-2", "mb-3"]) {
    await entrega({
      clave,
      cierreId: mb,
      mensajeroId: mensajeroB,
      zonaId: zonaSatelite,
      esCentral: false,
      montoCobrar: "10000.00",
      flete: "1000.00",
      comisionPct: "0.00",
      pagos: [{ metodo: "efectivo", monto: "10000.00" }],
    });
  }

  // MC — satelite, una entrega prepagada: nada recaudado, flete 1 000,00 + IVA.
  const mensajeroC = await mensajero();
  const mc = await cierreDia({
    mensajeroId: mensajeroC,
    destinoTipo: "bodega_satelite",
    zonaId: zonaSatelite,
    efectivo: "0.00",
    simpe: "0.00",
    general: "0.00",
    pago: "0.00",
    bodega: "0.00",
  });
  await entrega({
    clave: "mc",
    cierreId: mc,
    mensajeroId: mensajeroC,
    zonaId: zonaSatelite,
    esCentral: false,
    montoCobrar: null,
    flete: "1000.00",
    comisionPct: "0.00",
    pagos: [],
  });

  const cierreBodega = async (o: { zonaId: string; general: string; pago: string; bodega: string }) =>
    (
      await tx.cierreBodega.create({
        data: {
          zonaId: o.zonaId,
          solicitadoPor: satelite.id,
          estado: "solicitado",
          totalEfectivo: new Prisma.Decimal(o.general),
          totalSimpe: new Prisma.Decimal("0.00"),
          totalTransferencia: new Prisma.Decimal("0.00"),
          totalGeneral: new Prisma.Decimal(o.general),
          totalPagoMensajero: new Prisma.Decimal(o.pago),
          totalIngresoBodegaRechazos: new Prisma.Decimal(o.bodega),
        },
        select: { id: true },
      })
    ).id;

  // BX — dos cierres del dia (60 000,00 + 40 000,00), cada uno con una entrega.
  const bx = await cierreBodega({ zonaId: zonaSatelite, general: "100000.00", pago: "3000.00", bodega: "500.00" });
  for (const dia of [
    { clave: "bx-1", general: "60000.00", pago: "2000.00", bodega: "500.00" },
    { clave: "bx-2", general: "40000.00", pago: "1000.00", bodega: "0.00" },
  ]) {
    const m = await mensajero();
    const cd = await cierreDia({
      mensajeroId: m,
      destinoTipo: "bodega_satelite",
      zonaId: zonaSatelite,
      efectivo: dia.general,
      simpe: "0.00",
      general: dia.general,
      pago: dia.pago,
      bodega: dia.bodega,
      cierreBodegaId: bx,
    });
    await entrega({
      clave: dia.clave,
      cierreId: cd,
      mensajeroId: m,
      zonaId: zonaSatelite,
      esCentral: false,
      montoCobrar: dia.general,
      flete: "1000.00",
      comisionPct: "0.00",
      pagos: [{ metodo: "efectivo", monto: dia.general }],
    });
  }

  // BY — un cierre del dia, en la segunda zona satelite.
  const by = await cierreBodega({ zonaId: zonaSatelite2, general: "1000.00", pago: "1500.00", bodega: "0.00" });
  const mensajeroY = await mensajero();
  const cdY = await cierreDia({
    mensajeroId: mensajeroY,
    destinoTipo: "bodega_satelite",
    zonaId: zonaSatelite2,
    efectivo: "1000.00",
    simpe: "0.00",
    general: "1000.00",
    pago: "1500.00",
    bodega: "0.00",
    cierreBodegaId: by,
  });
  await entrega({
    clave: "by-1",
    cierreId: cdY,
    mensajeroId: mensajeroY,
    zonaId: zonaSatelite2,
    esCentral: false,
    montoCobrar: "1000.00",
    flete: "1000.00",
    comisionPct: "0.00",
    pagos: [{ metodo: "efectivo", monto: "1000.00" }],
  });

  // Los servicios REALES, cableados como sus `buildService()` sobre la tx del test (molde de
  // `cierre-iva-aparte-sl39.test.ts`). Solo se LEE.
  const c = clienteConSavepoint(tx);
  const mensajeroRepo = new PagoMensajeroMovimientoRepository(c);
  const adminRepo = new CierresAdminRepository(
    c,
    new WalletMovimientoRepository(c),
    new WalletFeedService(),
    new WalletTiendaMovimientoRepository(c),
    new WalletTiendaFeedService({ TIENDA_DEBITA_FLETE_DEVOLUCION: true }),
    mensajeroRepo,
    new WalletMensajeroFeedService(),
    new WalletIndemnizacionFeedService(),
  );
  const organizacionId = (
    await tx.cierreDia.findUniqueOrThrow({ where: { id: ma }, select: { organizacionId: true } })
  ).organizacionId;

  return {
    tx,
    ma,
    mb,
    mc,
    bx,
    by,
    maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
    adminSatelite: { usuarioId: satelite.id, rol: "adminSatelite", organizacionId },
    admin: new CierresAdminService(
      adminRepo,
      new ZonaRepository(c),
      new OrdenRepository(c),
      URLS_NO_USADAS,
      new LiquidacionPagoRepository(c),
      mensajeroRepo,
      sinRetenidas(),
      undefined,
      undefined,
      undefined,
      undefined,
      reglasPaisFijas(),
    ),
    bodega: new CierresBodegaAdminService(
      new CierresBodegaAdminRepository(c),
      URLS_NO_USADAS,
      reglasPaisFijas(),
    ),
  };
}

describeSiHayBase("SLT-111 — reparto en % de lo recaudado en los dos detalles, contra Postgres real", () => {
  let prisma: PrismaClient;
  let eventos: EventoSqlDeTest[];

  const conCorpus = <T>(fn: (k: Corpus) => Promise<T>): Promise<T> =>
    enTransaccionRevertida(prisma, async (tx) => {
      // PRIMERA sentencia: serializa contra los otros archivos que escriben en `public`.
      await serializarEscriturasReales(tx);
      return fn(await sembrar(tx));
    });

  /** Sentencias SQL que emite `fn`, medidas con el espia del cliente. */
  const sentencias = async <T>(fn: () => Promise<T>): Promise<{ valor: T; n: number }> => {
    const antes = eventos.length;
    const valor = await fn();
    return { valor, n: eventos.length - antes };
  };

  beforeAll(() => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("CONTROL: lo sembrado esta en la base (gestiones por cierre, cierres del dia por bodega, snapshots)", async () => {
    const medido = await conCorpus(async (k) => ({
      gestiones: {
        ma: await k.tx.gestionOrden.count({ where: { cierreId: k.ma } }),
        mb: await k.tx.gestionOrden.count({ where: { cierreId: k.mb } }),
        mc: await k.tx.gestionOrden.count({ where: { cierreId: k.mc } }),
      },
      detalles: await k.tx.cierreDetail.count({ where: { cierreId: { in: [k.ma, k.mb, k.mc] } } }),
      dias: {
        bx: await k.tx.cierreDia.count({ where: { cierreBodegaId: k.bx } }),
        by: await k.tx.cierreDia.count({ where: { cierreBodegaId: k.by } }),
      },
      generales: (
        await k.tx.cierreDia.findMany({
          where: { id: { in: [k.ma, k.mb, k.mc] } },
          select: { id: true, totalGeneral: true },
        })
      ).map((r) => [r.id === k.ma ? "ma" : r.id === k.mb ? "mb" : "mc", r.totalGeneral.toFixed(2)]),
    }));

    expect(medido.gestiones).toEqual({ ma: 1, mb: 3, mc: 1 });
    expect(medido.detalles).toBe(5);
    expect(medido.dias).toEqual({ bx: 2, by: 1 });
    expect(Object.fromEntries(medido.generales)).toEqual({
      ma: "100000.00",
      mb: "30000.00",
      mc: "0.00",
    });
  });

  it("R263/R260 MA (central): 94 350,00 / 5 650,00 sobre 100 000,00 → [94, 6]", async () => {
    const r = await conCorpus((k) => k.admin.verCierreDetalle(k.ma, k.maestro));
    if (r.status !== "ok") throw new Error(`detalle de MA: ${r.status}`);
    // Las partes, para que un rojo diga si fallo el importe o el reparto.
    expect({ tienda: r.pagoTienda, empresa: r.cobradoSobreRecaudado, general: r.cierre.totales.general }).toEqual({
      tienda: "94350.00",
      empresa: "5650.00",
      general: "100000.00",
    });
    expect(r.porcentajesReparto).toEqual([94, 6]);
  });

  it("R263/R260 MB (satelite): [89, 11] igual para la central y para el adminSatelite de su zona", async () => {
    const medido = await conCorpus(async (k) => ({
      central: await k.admin.verCierreDetalle(k.mb, k.maestro),
      satelite: await k.admin.verCierreDetalle(k.mb, k.adminSatelite),
    }));
    if (medido.central.status !== "ok") throw new Error(`MB central: ${medido.central.status}`);
    if (medido.satelite.status !== "ok") throw new Error(`MB satelite: ${medido.satelite.status}`);
    expect({ tienda: medido.central.pagoTienda, empresa: medido.central.cobradoSobreRecaudado }).toEqual({
      tienda: "26610.00",
      empresa: "3390.00",
    });
    expect(medido.central.porcentajesReparto).toEqual([89, 11]);
    expect(medido.satelite.porcentajesReparto).toEqual([89, 11]);
  });

  it("R261 MC (prepagada): general 0,00 y tienda −1 130,00 → null", async () => {
    const r = await conCorpus((k) => k.admin.verCierreDetalle(k.mc, k.maestro));
    if (r.status !== "ok") throw new Error(`detalle de MC: ${r.status}`);
    expect({ tienda: r.pagoTienda, general: r.cierre.totales.general }).toEqual({
      tienda: "-1130.00",
      general: "0.00",
    });
    // `null` explicito: ni ausente ni array.
    expect(r.porcentajesReparto).toBeNull();
  });

  it("R264/R260 BX (bodega): 96 500,00 / 3 000,00 / 500,00 sobre 100 000,00 → [97, 3, 0]", async () => {
    const r = await conCorpus((k) => k.bodega.verCierreBodegaDetalle(k.bx, k.maestro));
    if (r.status !== "ok") throw new Error(`detalle de BX: ${r.status}`);
    expect({
      central: r.paraLaCentral,
      pago: r.cierre.totalPagoMensajero,
      bodega: r.cierre.totalIngresoBodegaRechazos,
      general: r.cierre.totales.general,
    }).toEqual({ central: "96500.00", pago: "3000.00", bodega: "500.00", general: "100000.00" });
    expect(r.porcentajesReparto).toEqual([97, 3, 0]);
  });

  it("R261/R264 BY (bodega): para la central −500,00 → null", async () => {
    const r = await conCorpus((k) => k.bodega.verCierreBodegaDetalle(k.by, k.maestro));
    if (r.status !== "ok") throw new Error(`detalle de BY: ${r.status}`);
    expect(r.paraLaCentral).toBe("-500.00");
    expect(r.porcentajesReparto).toBeNull();
  });

  it("R265/R72: sin escrituras, y el reparto no añade ninguna sentencia SQL a ninguno de los dos detalles", async () => {
    const medido = await conCorpus(async (k) => {
      const repoBodega = new CierresBodegaAdminRepository(clienteConSavepoint(k.tx));
      const antes = await huella(k.tx, [k.ma, k.mb, k.mc], [k.bx, k.by]);
      const ma = await sentencias(() => k.admin.verCierreDetalle(k.ma, k.maestro));
      const mb = await sentencias(() => k.admin.verCierreDetalle(k.mb, k.maestro));
      const bx = await sentencias(() => k.bodega.verCierreBodegaDetalle(k.bx, k.maestro));
      const by = await sentencias(() => k.bodega.verCierreBodegaDetalle(k.by, k.maestro));
      // La lectura del repositorio SOLA: el servicio de bodega no debe emitir ni una sentencia mas.
      const repoBx = await sentencias(() => repoBodega.findCierreBodegaConDetalle(k.bx, ZONA_DE_CR, { lectura: "toda_la_empresa" }));
      const repoBy = await sentencias(() => repoBodega.findCierreBodegaConDetalle(k.by, ZONA_DE_CR, { lectura: "toda_la_empresa" }));
      const despues = await huella(k.tx, [k.ma, k.mb, k.mc], [k.bx, k.by]);
      return {
        antes,
        despues,
        estados: [ma.valor.status, mb.valor.status, bx.valor.status, by.valor.status],
        repoLeyo: [repoBx.valor !== null, repoBy.valor !== null],
        n: { ma: ma.n, mb: mb.n, bx: bx.n, by: by.n, repoBx: repoBx.n, repoBy: repoBy.n },
      };
    });

    expect(medido.estados).toEqual(["ok", "ok", "ok", "ok"]);
    expect(medido.repoLeyo).toEqual([true, true]);
    // No vacuidad: 3 cierres del dia + 2 de bodega, 5 `cierre_detail` y 5 gestiones.
    expect(medido.antes).toHaveLength(15);
    expect(medido.despues).toEqual(medido.antes);
    expect(medido.n.ma).toBeGreaterThan(0);
    expect(medido.n.repoBx).toBeGreaterThan(0);
    // Mensajero: las mismas sentencias con 1 gestion (MA) que con 3 (MB).
    expect(medido.n.mb).toBe(medido.n.ma);
    // Bodega: el servicio emite EXACTAMENTE las sentencias de su repositorio, con 2 dias y con 1.
    //
    // DEUDA DE LA EPICA (T0.3, medido en `dev` antes de tocar nada): `findCierreBodegaConDetalle`
    // lee gestiones y `cierre_detail` POR cierre del dia, asi que sus sentencias SI crecen con el
    // numero de dias (BX 40, BY 24). Es previo a SLT-111 y no se arregla aqui. R265 ya esta
    // reescrito para bodega (el reparto no añade lecturas: servicio = repositorio), y ese N+1 queda
    // como deuda de la epica (decision del leader del 2026-11-12, `progress/features/SLT-111.md`).
    expect({ bx: medido.n.bx, by: medido.n.by }).toEqual({ bx: medido.n.repoBx, by: medido.n.repoBy });
  });
});
