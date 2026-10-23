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

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SL-39 (C0, design §12.7, R21–R23, R25) — en el detalle de cierres de `cierres-admin`, la
// «Ganancia» y «Lo que le queda a la empresa» salen SIN el IVA, que va en su propia linea.
//
// POR QUE CONTRA POSTGRES Y CON LOS SERVICIOS REALES. La cifra sale de re-derivar cada gestion a
// partir de lo congelado en `cierre_detail` (`CierresAdminRepository.toIngresoEmpresa`) y de restar
// en el servicio. Un test de servicio con dobles le dice al repositorio que devolver y no ve si la
// tasa congelada llega a la resta; aqui la unica forma de que un caso pase es que el SQL devuelva
// las filas sembradas y que el servicio reste lo correcto.
//
// LA SIEMBRA (design §12.4). Una zona satelite con un cierre de bodega que agrupa dos cierres del
// dia de dos mensajeros; tarifa congelada con IVA 13,00 % en flete y en comision:
//
//   CIERRE A — una entrega de 20.000,00 cobrada en efectivo; pago al mensajero 1.500,00.
//     flete 2.500,00 + IVA 325,00 · comision COD 3,50 % = 700,00 + IVA 91,00
//     facturado 3.616,00 · IVA 416,00 · sin IVA 3.200,00
//     ganancia = neto = 3.200,00 − 1.500,00 = 1.700,00          (hoy: 3.616,00 − 1.500,00 = 2.116,00)
//
//   CIERRE B — un rechazo, sin cobro; pago al mensajero 2.100,00.
//     flete por devolucion 2.000,00 + IVA 260,00
//     facturado 2.260,00 · IVA 260,00 · sin IVA 2.000,00
//     ganancia = neto = 2.000,00 − 2.100,00 = −100,00           (hoy: 2.260,00 − 2.100,00 = 160,00)
//
//   BODEGA (agregado de A y B) — pago a mensajeros 3.600,00, ingreso de bodega 0,00.
//     facturado 5.876,00 · IVA 676,00 · sin IVA 5.200,00
//     ganancia = neto = 5.200,00 − 3.600,00 = 1.600,00          (hoy: 5.876,00 − 3.600,00 = 2.276,00)
//
// Las cifras van ESCRITAS A MANO: son el contrato. Derivarlas aqui con las funciones de produccion
// las compararia contra su propia fuente y el test quedaria siempre verde.
//
// El flete normal y el GAM valen lo mismo (y los dos devueltos tambien) para que la columna que
// elija `resolverFlete` no cambie la cifra: lo que se mide es el IVA, no la eleccion de columna.
//
// TODO corre dentro de una transaccion que SIEMPRE se revierte (`enTransaccionRevertida`, que fija
// la empresa del test: el `DEFAULT` de `organizacion_id` la pone en cada fila). Sin base se SALTA;
// con base pero sin catalogos, `crearFksDeOrden` LANZA.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

interface Corpus {
  cliente: PrismaClient;
  /** La tx del cliente BASE (dueno de las tablas, sin extension ni RLS): la que lee el control. */
  tx: TxDeTest;
  cierreA: string;
  cierreB: string;
  cierreBodegaId: string;
  /** Actor del detalle del mensajero: el alcance satelite casa con `destino_zona_id`. */
  adminSatelite: Actor;
  /** Actor del detalle de bodega (acceso total). */
  maestro: Actor;
  admin: CierresAdminService;
  bodega: CierresBodegaAdminService;
}

/** La huella de `cierre_detail` de los dos cierres: cada fila entera, en JSON, por id. */
async function huellaCierreDetail(tx: TxDeTest, cierres: string[]): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ fila: string }[]>(
    `SELECT to_jsonb(cd)::text AS fila
       FROM "cierre_detail" cd
      WHERE cd.cierre_id = ANY($1::text[])
      ORDER BY cd.id`,
    cierres,
  );
  return filas.map((f) => f.fila);
}

/** Siembra el corpus de §12.4 en la tx revertida y monta los servicios REALES sobre ella. */
async function sembrar(tx: TxDeTest): Promise<Corpus> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const fks = await crearFksDeOrden(tx);
  const mensajeroA = await crearUsuarioDePrueba(tx, "mensajero");
  const mensajeroB = await crearUsuarioDePrueba(tx, "mensajero");
  const satelite = await crearUsuarioDePrueba(tx, "adminSatelite");
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  // El adminSatelite ve los cierres cuyo `destino_zona_id` es SU zona.
  await tx.usuario.update({ where: { id: satelite.id }, data: { zonaId: fks.zonaId } });

  const tarifa = await tx.tarifa.create({
    data: {
      tiendaId: fks.tiendaId,
      zonaId: null,
      valorFlete: new Prisma.Decimal("2500.00"),
      valorFleteGam: new Prisma.Decimal("2500.00"),
      valorFleteDevuelto: new Prisma.Decimal("2000.00"),
      valorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
      fulfillment: new Prisma.Decimal("0.00"),
      comisionCod: new Prisma.Decimal("3.50"),
      ivaFlete: new Prisma.Decimal("13.00"),
      ivaComisionCod: new Prisma.Decimal("13.00"),
    },
    select: { id: true },
  });

  const cierreBodega = await tx.cierreBodega.create({
    data: {
      zonaId: fks.zonaId,
      solicitadoPor: satelite.id,
      estado: "solicitado",
      totalEfectivo: new Prisma.Decimal("20000.00"),
      totalSimpe: new Prisma.Decimal("0.00"),
      totalTransferencia: new Prisma.Decimal("0.00"),
      totalGeneral: new Prisma.Decimal("20000.00"),
      totalPagoMensajero: new Prisma.Decimal("3600.00"),
      totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
    },
    select: { id: true },
  });

  const nuevoCierreDia = async (mensajeroId: string, general: string, pagoMensajero: string) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId,
          estado: "solicitado",
          destinoTipo: "bodega_satelite",
          destinoZonaId: fks.zonaId,
          cierreBodegaId: cierreBodega.id,
          totalEfectivo: new Prisma.Decimal(general),
          totalSimpe: new Prisma.Decimal("0.00"),
          totalTransferencia: new Prisma.Decimal("0.00"),
          totalGeneral: new Prisma.Decimal(general),
          totalPagoMensajero: new Prisma.Decimal(pagoMensajero),
          totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
        },
        select: { id: true },
      })
    ).id;

  const cierreA = await nuevoCierreDia(mensajeroA.id, "20000.00", "1500.00");
  const cierreB = await nuevoCierreDia(mensajeroB.id, "0.00", "2100.00");

  /** Una orden + su gestion + su fila CONGELADA de `cierre_detail` (tasas 13,00). */
  const gestion = async (o: {
    clave: string;
    cierreId: string;
    mensajeroId: string;
    montoCobrar: string;
    resultado: "entregado" | "devolucion_a_origen_por_rechazo";
    pagado: string | null;
  }) => {
    const numRemision = `SL39-${o.clave}-${sufijo}`;
    const orden = await tx.orden.create({
      data: {
        numRemision,
        destinatario: `Destinatario ${o.clave}`,
        telefonoDest: "88880000",
        producto: `Producto ${o.clave}`,
        montoCobrar: new Prisma.Decimal(o.montoCobrar),
        cobraComision: true,
        estatusId: fks.estatusId,
        mensajeroAsignadoId: o.mensajeroId,
        tiendaId: fks.tiendaId,
        zonaId: fks.zonaId,
        provinciaId: fks.provinciaId,
        cantonId: fks.cantonId,
      },
      select: { id: true },
    });
    await tx.gestionOrden.create({
      data: {
        ordenId: orden.id,
        mensajeroId: o.mensajeroId,
        resultado: o.resultado,
        cierreId: o.cierreId,
        montoRecibido: o.pagado === null ? null : new Prisma.Decimal(o.pagado),
        metodoPago: o.pagado === null ? null : "efectivo",
        pagos:
          o.pagado === null
            ? undefined
            : { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(o.pagado) }] },
      },
      select: { id: true },
    });
    await tx.cierreDetail.create({
      data: {
        cierreId: o.cierreId,
        ordenId: orden.id,
        montoCobrar: new Prisma.Decimal(o.montoCobrar),
        cobraComision: true,
        zonaId: fks.zonaId,
        tiendaId: fks.tiendaId,
        esCentral: false,
        esZonaEspecial: false,
        tarifaId: tarifa.id,
        tarifaValorFlete: new Prisma.Decimal("2500.00"),
        tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
        tarifaValorFleteDevuelto: new Prisma.Decimal("2000.00"),
        tarifaValorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
        tarifaComisionCod: new Prisma.Decimal("3.50"),
        tarifaIvaFlete: new Prisma.Decimal("13.00"),
        tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
        tarifaFulfillment: new Prisma.Decimal("0.00"),
        numRemision,
        destinatario: `Destinatario ${o.clave}`,
        producto: `Producto ${o.clave}`,
        tiendaNombre: "Tienda SL-39",
        zonaNombre: "Zona SL-39",
        provinciaNombre: "Cartago",
        cantonNombre: "Cartago",
      },
      select: { id: true },
    });
  };

  await gestion({
    clave: "a-entrega",
    cierreId: cierreA,
    mensajeroId: mensajeroA.id,
    montoCobrar: "20000.00",
    resultado: "entregado",
    pagado: "20000.00",
  });
  await gestion({
    clave: "b-rechazo",
    cierreId: cierreB,
    mensajeroId: mensajeroB.id,
    montoCobrar: "15000.00",
    resultado: "devolucion_a_origen_por_rechazo",
    pagado: null,
  });

  // Los servicios REALES, cableados como sus `buildService()` sobre la tx del test (el molde de
  // `montarServicios459`). Solo se LEE: ningun feed llega a escribir.
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
    await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreA }, select: { organizacionId: true } })
  ).organizacionId;

  return {
    cliente: c,
    tx,
    cierreA,
    cierreB,
    cierreBodegaId: cierreBodega.id,
    adminSatelite: { usuarioId: satelite.id, rol: "adminSatelite", organizacionId },
    maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
    admin: new CierresAdminService(
      adminRepo,
      new ZonaRepository(c),
      new OrdenRepository(c),
      URLS_NO_USADAS,
      new LiquidacionPagoRepository(c),
      mensajeroRepo,
      sinRetenidas(),
    ),
    bodega: new CierresBodegaAdminService(new CierresBodegaAdminRepository(c), URLS_NO_USADAS),
  };
}

describeSiHayBase("SL-39 R21–R23, R25 — el detalle del cierre separa el IVA de la ganancia", () => {
  let prisma: PrismaClient;

  const conCorpus = <T>(fn: (k: Corpus) => Promise<T>): Promise<T> =>
    enTransaccionRevertida(prisma, async (tx) => {
      // PRIMERA sentencia: serializa contra los otros archivos que escriben en `public`.
      await serializarEscriturasReales(tx);
      return fn(await sembrar(tx));
    });

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("CONTROL: las dos gestiones y sus dos `cierre_detail` existen, con las tasas 13,00, en la base", async () => {
    // Sin esto, todo lo de abajo podria medir el vacio. Se lee con la tx del cliente BASE, no con
    // los servicios bajo test.
    const medido = await conCorpus(async (k) => ({
      gestiones: await k.tx.gestionOrden.findMany({
        where: { cierreId: { in: [k.cierreA, k.cierreB] } },
        select: { cierreId: true, resultado: true },
      }),
      detalle: await k.tx.cierreDetail.findMany({
        where: { cierreId: { in: [k.cierreA, k.cierreB] } },
        select: { cierreId: true, tarifaIvaFlete: true, tarifaIvaComisionCod: true },
      }),
      dias: await k.tx.cierreDia.count({ where: { cierreBodegaId: k.cierreBodegaId } }),
      esperado: { a: k.cierreA, b: k.cierreB },
    }));

    expect(medido.dias).toBe(2);
    expect(medido.gestiones).toHaveLength(2);
    expect(new Map(medido.gestiones.map((g) => [g.cierreId, g.resultado]))).toEqual(
      new Map([
        [medido.esperado.a, "entregado"],
        [medido.esperado.b, "devolucion_a_origen_por_rechazo"],
      ]),
    );
    expect(medido.detalle).toHaveLength(2);
    expect(medido.detalle.map((d) => d.cierreId).sort()).toEqual(
      [medido.esperado.a, medido.esperado.b].sort(),
    );
    for (const d of medido.detalle) {
      expect(d.tarifaIvaFlete?.toFixed(2)).toBe("13.00");
      expect(d.tarifaIvaComisionCod?.toFixed(2)).toBe("13.00");
    }
  });

  it("R21–R23 cierre A: ganancia y neto sin IVA (1.700,00), IVA facturado 416,00 aparte, facturado 3.616,00", async () => {
    const r = await conCorpus((k) => k.admin.verCierreDetalle(k.cierreA, k.adminSatelite));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error(`detalle de A: ${r.status}`);

    // Primero la ganancia: es el rojo que se espera hoy ("2116.00", con IVA).
    expect(r.ganancia).toBe("1700.00");
    expect(r.netoEmpresa).toBe("1700.00");
    expect(r.ivaFacturado).toBe("416.00");
    // Lo facturado NO cambia: sigue llevando IVA (R26).
    expect(r.totalesIngreso.total).toBe("3616.00");
  });

  it("R22 cierre B: un rechazo cuyo IVA tapaba la perdida da ganancia −100,00", async () => {
    const r = await conCorpus((k) => k.admin.verCierreDetalle(k.cierreB, k.adminSatelite));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error(`detalle de B: ${r.status}`);

    // Primero la ganancia: hoy da "160.00" y la tarjeta «Debe» no aparece.
    expect(r.ganancia).toBe("-100.00");
    expect(r.netoEmpresa).toBe("-100.00");
    expect(r.ivaFacturado).toBe("260.00");
    expect(r.totalesIngreso.total).toBe("2260.00");
  });

  it("R21–R23 bodega, nivel de cada cierre del dia: A da 1.700,00 y B −100,00, cada uno con su IVA", async () => {
    const medido = await conCorpus(async (k) => ({
      r: await k.bodega.verCierreBodegaDetalle(k.cierreBodegaId, k.maestro),
      a: k.cierreA,
      b: k.cierreB,
    }));
    expect(medido.r.status).toBe("ok");
    if (medido.r.status !== "ok") throw new Error(`detalle de bodega: ${medido.r.status}`);
    expect(medido.r.cierres).toHaveLength(2);
    const porId = new Map(medido.r.cierres.map((cd) => [cd.cierreDiaId, cd]));
    const a = porId.get(medido.a);
    const b = porId.get(medido.b);
    if (a === undefined || b === undefined) throw new Error("falta A o B en el detalle de bodega");

    // Las dos ganancias en UNA aserción, para que el rojo de hoy enseñe las dos cifras a la vez.
    expect({ a: a.ganancia, b: b.ganancia }).toEqual({ a: "1700.00", b: "-100.00" });
    expect({ a: a.netoEmpresa, b: b.netoEmpresa }).toEqual({ a: "1700.00", b: "-100.00" });
    expect({ a: a.ivaFacturado, b: b.ivaFacturado }).toEqual({ a: "416.00", b: "260.00" });
    expect({ a: a.totalesIngreso.total, b: b.totalesIngreso.total }).toEqual({
      a: "3616.00",
      b: "2260.00",
    });
  });

  it("R21–R23 bodega, nivel agregado: ganancia y neto 1.600,00 sin IVA, IVA 676,00, facturado 5.876,00", async () => {
    const r = await conCorpus((k) => k.bodega.verCierreBodegaDetalle(k.cierreBodegaId, k.maestro));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error(`detalle de bodega: ${r.status}`);

    // Hoy da "2276.00" (5.876,00 con IVA − 3.600,00).
    expect(r.ganancia).toBe("1600.00");
    expect(r.netoEmpresa).toBe("1600.00");
    expect(r.ivaFacturado).toBe("676.00");
    expect(r.totalesIngreso.total).toBe("5876.00");
  });

  it("R25: leer los detalles no cambia ni una fila de `cierre_detail` (el IVA se separa al leer)", async () => {
    const medido = await conCorpus(async (k) => {
      const cierres = [k.cierreA, k.cierreB];
      const antes = await huellaCierreDetail(k.tx, cierres);
      const lecturas = [
        (await k.admin.verCierreDetalle(k.cierreA, k.adminSatelite)).status,
        (await k.admin.verCierreDetalle(k.cierreB, k.adminSatelite)).status,
        (await k.bodega.verCierreBodegaDetalle(k.cierreBodegaId, k.maestro)).status,
      ];
      const despues = await huellaCierreDetail(k.tx, cierres);
      return { antes, despues, lecturas };
    });

    // No vacuidad: dos filas, y las tres lecturas ocurrieron de verdad.
    expect(medido.antes).toHaveLength(2);
    expect(medido.lecturas).toEqual(["ok", "ok", "ok"]);
    expect(medido.despues).toEqual(medido.antes);
  });
});
