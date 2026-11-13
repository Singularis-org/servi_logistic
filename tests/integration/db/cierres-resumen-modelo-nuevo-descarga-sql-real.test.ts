import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (T3.1; R379-R383) — las cifras que
 * el «Resumen» de `/cierres-admin` lleva para la hoja «Cierres», leidas con los servicios y
 * repositorios REALES contra Postgres, en una transaccion que SIEMPRE se revierte.
 *
 * Los tests de servicio usan dobles: no ven el `WHERE` de alcance de la lectura en lote, ni cuantas
 * consultas cuesta, ni si las gestiones congeladas dan de verdad las cifras del detalle. Aqui solo
 * pasa lo que Postgres devuelve de verdad.
 *
 * EL CORPUS. Zona Centro = alcance de la satelite S; zona Norte, fuera de el. Un mensajero por cierre
 * (los conjuntos se recortan con el filtro de mensajero, el mismo de la pantalla):
 *   - N1 (id `…abcd1234`) central, nuevo, aprobado, con la marca. Snapshots: efectivo 70 000,00 ·
 *     SINPE 30 000,00 · transferencia 0,00 · general 100 000,00 · pago al mensajero 3 000,00 · ingreso
 *     de bodega por rechazos 500,00.
 *       G1 «Tienda Norte», entrega 70 000,00 efectivo + 30 000,00 SINPE: flete 4 000,00 + IVA 13 % y
 *          comision 1 % (1 000,00) + IVA 13 %; un ajuste de pago.
 *       G2 «Tienda Sur», novedad: flete de no entregadas 2 000,00 + IVA 13 %.
 *       Un pago vigente al mensajero de 1 200,00; ningun premio.
 *   - N2 igual que N1 pero `solicitado` y SIN la marca (la escribe la aprobacion, SLT-123 R321): un
 *     nuevo que solo se clasifica bien por `incluyeModeloNuevo`.
 *   - V1 central, modelo VIEJO, aprobado (señuelo de modelo).
 *   - N4 y N5 central, nuevos, aprobados, una gestion cada uno (los 3 nuevos del conteo).
 *   - N3 satelite Norte, nuevo, aprobado (señuelo de alcance para S).
 *   - S1 satelite Centro, nuevo, aprobado (la audiencia satelite).
 *
 * Cifras de N1 ESCRITAS A MANO (memoria «asercion contra su propia fuente»): pago a la tienda 94 350,00 ·
 * total facturado 7 910,00 · IVA 910,00 · gana la tienda 92 090,00 · le queda a la empresa 3 500,00 ·
 * 2 gestiones · 1 pago ajustado · pendiente 1 800,00 · pago entregado 1 200,00 · por tienda: Norte
 * 100 000,00 / 94 350,00 / 94 350,00 y Sur 0,00 / 0,00 / −2 260,00.
 *
 * Sin base se SALTA (`describe.skip`, visible); con base y sin catalogos, FALLA ruidosamente.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

/**
 * T0.4 (R383) — consultas de `listarHistoricoCierresAdminCompleto` con un conjunto SOLO viejo, medidas
 * con el codigo ANTERIOR a esta ficha (`progress/impl_SLT-140.md`). Un cierre viejo no puede costar
 * ni una consulta mas que antes.
 */
const CONSULTAS_SOLO_VIEJOS_LINEA_BASE = 7;

const ESCRITURA = /^\s*(INSERT|UPDATE|DELETE)\b/i;

interface Corpus {
  tx: TxDeTest;
  svc: CierresAdminService;
  repo: CierresAdminRepository;
  maestro: Actor;
  satelite: Actor;
  m: Record<"N1" | "N2" | "V1" | "N3" | "N4" | "N5" | "S1", string>;
  cierre: Record<"N1" | "N2" | "V1" | "N3" | "N4" | "N5" | "S1", string>;
  alcanceS: Alcance;
}

/** Lo que la hoja «Cierres» espera de N1 (y de N2, que comparte gestiones y snapshots), a mano. */
function cifrasN1(cierreId: string, pagoEntregado: string | null) {
  return {
    cierreId,
    pagoTienda: "94350.00",
    ganaLaTienda: "92090.00",
    totalFacturado: "7910.00",
    ivaFacturado: "910.00",
    netoEmpresa: "3500.00",
    gestiones: 2,
    pagoEntregado,
    partesPorTienda: [
      { tiendaNombre: "Tienda Norte", recaudado: "100000.00", pagoTienda: "94350.00", ganaLaTienda: "94350.00" },
      { tiendaNombre: "Tienda Sur", recaudado: "0.00", pagoTienda: "0.00", ganaLaTienda: "-2260.00" },
    ],
  };
}

async function sembrar(tx: TxDeTest): Promise<Corpus> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const estatus = await tx.orderStatus.findUnique({ where: { value: "en_reparto" }, select: { id: true } });
  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  if (estatus === null || canton === null) {
    throw new Error("faltan catalogos (`order_status` o `canton`): corre `prisma migrate deploy` y `pnpm run db:seed`.");
  }

  const nuevaZona = async (nombre: string) =>
    (
      await tx.zona.create({
        data: { nombre: `${nombre} ${sufijo}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
        select: { id: true },
      })
    ).id;
  const zonaC = await nuevaZona("Centro");
  const zonaN = await nuevaZona("Norte");

  const tiendaNorte = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const tiendaSur = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
  const satelite = (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
  await tx.usuario.update({ where: { id: satelite }, data: { zonaId: zonaC } });
  const claves = ["N1", "N2", "V1", "N3", "N4", "N5", "S1"] as const;
  const m = {} as Corpus["m"];
  for (const k of claves) m[k] = (await crearUsuarioDePrueba(tx, "mensajero")).id;

  const snapshotsN1 = {
    totalEfectivo: new Prisma.Decimal("70000.00"),
    totalSimpe: new Prisma.Decimal("30000.00"),
    totalTransferencia: new Prisma.Decimal("0.00"),
    totalGeneral: new Prisma.Decimal("100000.00"),
    totalPagoMensajero: new Prisma.Decimal("3000.00"),
    totalIngresoBodegaRechazos: new Prisma.Decimal("500.00"),
  };
  const nuevoCierre = async (args: {
    id?: string;
    mensajeroId: string;
    estado: "aprobado" | "solicitado";
    destinoTipo: "bodega_central" | "bodega_satelite";
    destinoZonaId: string;
    marca: boolean;
    snapshots?: typeof snapshotsN1;
  }) =>
    (
      await tx.cierreDia.create({
        data: {
          ...(args.id !== undefined ? { id: args.id } : {}),
          mensajeroId: args.mensajeroId,
          estado: args.estado,
          destinoTipo: args.destinoTipo,
          destinoZonaId: args.destinoZonaId,
          pagoIndependienteEfectivo: args.marca,
          solicitadoAt: new Date("2026-11-06T18:00:00.000Z"),
          ...(args.estado === "aprobado" ? { resueltoAt: new Date("2026-11-06T20:00:00.000Z") } : {}),
          ...(args.snapshots ?? {}),
        },
        select: { id: true },
      })
    ).id;
  const central = "bodega_central" as const;
  const sat = "bodega_satelite" as const;
  const cierre: Corpus["cierre"] = {
    // El id acaba en `abcd1234`: el folio es «ABCD1234».
    N1: await nuevoCierre({
      id: `${randomUUID().slice(0, 28)}abcd1234`,
      mensajeroId: m.N1,
      estado: "aprobado",
      destinoTipo: central,
      destinoZonaId: zonaC,
      marca: true,
      snapshots: snapshotsN1,
    }),
    N2: await nuevoCierre({
      mensajeroId: m.N2,
      estado: "solicitado",
      destinoTipo: central,
      destinoZonaId: zonaC,
      marca: false,
      snapshots: snapshotsN1,
    }),
    V1: await nuevoCierre({ mensajeroId: m.V1, estado: "aprobado", destinoTipo: central, destinoZonaId: zonaC, marca: false }),
    N3: await nuevoCierre({ mensajeroId: m.N3, estado: "aprobado", destinoTipo: sat, destinoZonaId: zonaN, marca: true }),
    N4: await nuevoCierre({ mensajeroId: m.N4, estado: "aprobado", destinoTipo: central, destinoZonaId: zonaC, marca: true }),
    N5: await nuevoCierre({ mensajeroId: m.N5, estado: "aprobado", destinoTipo: central, destinoZonaId: zonaC, marca: true }),
    S1: await nuevoCierre({
      mensajeroId: m.S1,
      estado: "aprobado",
      destinoTipo: sat,
      destinoZonaId: zonaC,
      marca: true,
      snapshots: snapshotsN1,
    }),
  };

  let n = 0;
  /** Una orden, su fila congelada (modelo `modelo`) y su gestion en `cierreId`. */
  const gestion = async (args: {
    cierreId: string;
    mensajeroId: string;
    tiendaId: string;
    tiendaNombre: string;
    resultado: "entregado" | "novedad";
    montoCobrar: string;
    cobraComision: boolean;
    modelo: "viejo" | "nuevo";
    conceptos: Array<{ concepto: string; modo: "monto" | "porcentaje"; valor: string }>;
    pagos?: Array<{ metodo: "efectivo" | "SINPE"; monto: string }>;
  }) => {
    n += 1;
    const clave = `${sufijo}-${n}`;
    const ordenId = (
      await tx.orden.create({
        data: {
          numRemision: `R-${clave}`,
          destinatario: `Dest ${clave}`,
          telefonoDest: "88880000",
          producto: `Prod ${clave}`,
          montoCobrar: new Prisma.Decimal(args.montoCobrar),
          cobraComision: args.cobraComision,
          estatusId: estatus.id,
          mensajeroAsignadoId: args.mensajeroId,
          tiendaId: args.tiendaId,
          zonaId: zonaC,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
        },
        select: { id: true },
      })
    ).id;
    const detalleId = (
      await tx.cierreDetail.create({
        data: {
          cierreId: args.cierreId,
          ordenId,
          montoCobrar: new Prisma.Decimal(args.montoCobrar),
          cobraComision: args.cobraComision,
          zonaId: zonaC,
          tiendaId: args.tiendaId,
          esCentral: false,
          esZonaEspecial: false,
          tarifaModelo: args.modelo,
          ...(args.modelo === "viejo"
            ? {
                tarifaValorFlete: new Prisma.Decimal("2000.00"),
                tarifaValorFleteGam: new Prisma.Decimal("2000.00"),
                tarifaValorFleteDevuelto: new Prisma.Decimal("1500.00"),
                tarifaValorFleteDevueltoGam: new Prisma.Decimal("1500.00"),
                tarifaComisionCod: new Prisma.Decimal("0.00"),
                tarifaIvaFlete: new Prisma.Decimal("13.00"),
                tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
                tarifaFulfillment: new Prisma.Decimal("0.00"),
              }
            : {}),
          numRemision: `R-${clave}`,
          destinatario: `Dest ${clave}`,
          producto: `Prod ${clave}`,
          tiendaNombre: args.tiendaNombre,
          zonaNombre: "Centro",
          provinciaNombre: "Provincia",
          cantonNombre: "Canton",
        },
        select: { id: true },
      })
    ).id;
    for (const c of args.conceptos) {
      await tx.cierreDetailConcepto.create({
        data: {
          cierreDetailId: detalleId,
          concepto: c.concepto as Prisma.CierreDetailConceptoUncheckedCreateInput["concepto"],
          modo: c.modo,
          valor: new Prisma.Decimal(c.valor),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "tienda_general",
          tarifaValorId: null,
        },
        select: { id: true },
      });
    }
    const gestionId = (
      await tx.gestionOrden.create({
        data: {
          ordenId,
          mensajeroId: args.mensajeroId,
          resultado: args.resultado,
          cierreId: args.cierreId,
          ...(args.resultado === "entregado"
            ? { montoRecibido: new Prisma.Decimal(args.montoCobrar), metodoPago: "efectivo" as const }
            : {}),
          pagoMensajero: new Prisma.Decimal("0.00"),
          ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
        },
        select: { id: true },
      })
    ).id;
    for (const p of args.pagos ?? []) {
      await tx.gestionOrdenPago.create({
        data: { gestionId, metodo: p.metodo, monto: new Prisma.Decimal(p.monto) },
        select: { id: true },
      });
    }
    return gestionId;
  };

  /** G1 + G2 de N1 en el cierre `cierreId` (N1, N2 y S1 comparten la forma). */
  const gestionesN1 = async (cierreId: string, mensajeroId: string) => {
    const g1 = await gestion({
      cierreId,
      mensajeroId,
      tiendaId: tiendaNorte,
      tiendaNombre: "Tienda Norte",
      resultado: "entregado",
      montoCobrar: "100000.00",
      cobraComision: true,
      modelo: "nuevo",
      conceptos: [
        { concepto: "tienda_flete_entregado", modo: "monto", valor: "4000.00" },
        { concepto: "tienda_comision_cod", modo: "porcentaje", valor: "1.00" },
      ],
      pagos: [
        { metodo: "efectivo", monto: "70000.00" },
        { metodo: "SINPE", monto: "30000.00" },
      ],
    });
    await gestion({
      cierreId,
      mensajeroId,
      tiendaId: tiendaSur,
      tiendaNombre: "Tienda Sur",
      resultado: "novedad",
      montoCobrar: "10000.00",
      cobraComision: false,
      modelo: "nuevo",
      conceptos: [{ concepto: "tienda_flete_novedad", modo: "monto", valor: "2000.00" }],
    });
    return g1;
  };
  const g1N1 = await gestionesN1(cierre.N1, m.N1);
  await gestionesN1(cierre.N2, m.N2);
  await gestionesN1(cierre.S1, m.S1);
  const una = (cierreId: string, mensajeroId: string, modelo: "viejo" | "nuevo") =>
    gestion({
      cierreId,
      mensajeroId,
      tiendaId: tiendaNorte,
      tiendaNombre: "Tienda Norte",
      resultado: "entregado",
      montoCobrar: "10000.00",
      cobraComision: false,
      modelo,
      conceptos: modelo === "nuevo" ? [{ concepto: "tienda_flete_entregado", modo: "monto", valor: "1000.00" }] : [],
      pagos: [{ metodo: "efectivo", monto: "10000.00" }],
    });
  await una(cierre.V1, m.V1, "viejo");
  await una(cierre.N3, m.N3, "nuevo");
  await una(cierre.N4, m.N4, "nuevo");
  await una(cierre.N5, m.N5, "nuevo");

  // El ajuste de pago de G1 (la señal «Pagos ajustados» = 1) y el pago vigente de 1 200,00 de N1.
  await tx.gestionPagoMensajeroAjuste.create({
    data: {
      gestionId: g1N1,
      cierreId: cierre.N1,
      pagoAnterior: new Prisma.Decimal("3000.00"),
      pagoNuevo: new Prisma.Decimal("2500.00"),
      actorUsuarioId: maestro,
      actorRol: "maestro",
      motivo: "Ruta corta",
    },
    select: { id: true },
  });
  await tx.liquidacionPago.create({
    data: {
      claveIdempotencia: randomUUID(),
      mensajeroId: m.N1,
      cierreId: cierre.N1,
      monto: new Prisma.Decimal("1200.00"),
      metodo: "efectivo",
      fechaPago: new Date("2026-11-07T00:00:00.000Z"),
      registradoPor: maestro,
    },
  });

  // Autocomprobacion: lo sembrado, leido en la misma transaccion (un corpus vacio no prueba nada).
  const gestionesSembradas = await tx.gestionOrden.count({ where: { cierreId: { in: Object.values(cierre) } } });
  if (gestionesSembradas !== 10) throw new Error(`corpus incompleto: ${gestionesSembradas} gestiones de 10`);

  const organizacionId = (
    await tx.cierreDia.findUniqueOrThrow({ where: { id: cierre.N1 }, select: { organizacionId: true } })
  ).organizacionId;

  const c = clienteConSavepoint(tx);
  const libro = new PagoMensajeroMovimientoRepository(c);
  const repo = new CierresAdminRepository(
    c,
    new WalletMovimientoRepository(c),
    new WalletFeedService(),
    new WalletTiendaMovimientoRepository(c),
    new WalletTiendaFeedService(),
    libro,
    new WalletMensajeroFeedService(),
    new WalletIndemnizacionFeedService(),
  );
  const svc = new CierresAdminService(
    repo,
    new ZonaRepository(c),
    new OrdenRepository(c),
    URLS_NO_USADAS,
    new LiquidacionPagoRepository(c),
    libro,
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
  return {
    tx,
    svc,
    repo,
    maestro: { usuarioId: maestro, rol: "maestro", organizacionId },
    satelite: { usuarioId: satelite, rol: "adminSatelite", organizacionId },
    m,
    cierre,
    alcanceS: { destinoTipo: "bodega_satelite", destinoZonaId: zonaC },
  };
}

describeSiHayBase("SLT-140 — cifras de la hoja «Cierres» del modelo nuevo, contra Postgres real", () => {
  let prisma: PrismaClient;
  let eventos: EventoSqlDeTest[];
  let conCorpus: <T>(fn: (c: Corpus) => Promise<T>) => Promise<T>;

  /** Corre `fn` y devuelve su resultado con las sentencias SQL que emitio. */
  async function medir<T>(fn: () => Promise<T>): Promise<{ r: T; sql: string[] }> {
    const desde = eventos.length;
    const r = await fn();
    return { r, sql: eventos.slice(desde).map((e) => e.query) };
  }

  beforeAll(() => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());
    conCorpus = (fn) => enTransaccionRevertida(prisma, async (tx) => fn(await sembrar(tx)));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R380/R382: N1 contra literales a mano, y lo mismo que su detalle (paridad con la pantalla)", async () => {
    await conCorpus(async (c) => {
      const r = await c.svc.listarHistoricoCierresAdminCompleto(c.maestro, { mensajeroIds: [c.m.N1, c.m.V1] });
      if (r.status !== "ok") throw new Error(`status ${r.status}`);
      expect(r.items.map((i) => i.cierreId).sort()).toEqual([c.cierre.N1, c.cierre.V1].sort());
      // Solo N1 es nuevo: V1 (viejo) no trae cifras.
      expect(r.cifrasModeloNuevo).toEqual([cifrasN1(c.cierre.N1, "1200.00")]);
      const item = r.items.find((i) => i.cierreId === c.cierre.N1);
      expect(item?.pendientePagoMensajero).toBe("1800.00");
      expect(item?.senalesCola?.pagosAjustados).toBe(1);

      const d = await c.svc.verCierreDetalle(c.cierre.N1, c.maestro);
      if (d.status !== "ok") throw new Error(`detalle ${d.status}`);
      const cifras = r.cifrasModeloNuevo?.[0];
      expect(cifras?.pagoTienda).toBe(d.pagoTienda);
      expect(cifras?.ganaLaTienda).toBe(d.ganaLaTienda);
      expect(cifras?.totalFacturado).toBe(d.totalesIngreso.total);
      expect(cifras?.ivaFacturado).toBe(d.ivaFacturado);
      expect(cifras?.netoEmpresa).toBe(d.netoEmpresa);
      expect(cifras?.gestiones).toBe(Object.values(d.grupos).reduce((s, g) => s + g.length, 0));
      expect(cifras?.partesPorTienda).toEqual(
        d.partesPorTienda.map((p) => ({
          tiendaNombre: p.tiendaNombre,
          recaudado: p.recaudado,
          pagoTienda: p.pagoTienda,
          ganaLaTienda: p.ganaLaTienda,
        })),
      );
      expect(d.cierre.pendientePagoMensajero).toBe("1800.00");
    });
  });

  it("R379: «Pagos ajustados» del Excel = el de la pagina de la cola", async () => {
    await conCorpus(async (c) => {
      const completo = await c.svc.listarHistoricoCierresAdminCompleto(c.maestro, { mensajeroIds: [c.m.N1] });
      const pagina = await c.svc.listarHistoricoCierresAdminPaginado(
        { page: 1, pageSize: 20, filtros: { mensajeroIds: [c.m.N1] } },
        c.maestro,
      );
      if (completo.status !== "ok" || pagina.status !== "ok") throw new Error("status");
      expect(completo.items[0].senalesCola?.pagosAjustados).toBe(1);
      expect(pagina.items[0].senalesCola?.pagosAjustados).toBe(completo.items[0].senalesCola?.pagosAjustados);
    });
  });

  it("R380/R382: N2 (`solicitado`, sin la marca) en Pendientes: cifras de N1 y sin «Pago entregado»; paridad", async () => {
    await conCorpus(async (c) => {
      const r = await c.svc.listarPendientesCierresAdminCompleto(c.maestro, { mensajeroIds: [c.m.N2] });
      if (r.status !== "ok") throw new Error(`status ${r.status}`);
      expect(r.cifrasModeloNuevo).toEqual([cifrasN1(c.cierre.N2, null)]);
      const d = await c.svc.verCierreDetalle(c.cierre.N2, c.maestro);
      if (d.status !== "ok") throw new Error(`detalle ${d.status}`);
      expect(r.cifrasModeloNuevo?.[0].netoEmpresa).toBe(d.netoEmpresa);
      expect(r.cifrasModeloNuevo?.[0].pagoTienda).toBe(d.pagoTienda);
      expect(r.cifrasModeloNuevo?.[0].ganaLaTienda).toBe(d.ganaLaTienda);
    });
  });

  it("R382/R383: la satelite solo recibe S1 (nunca N3 de otra zona) y sin «Pago entregado»", async () => {
    await conCorpus(async (c) => {
      const r = await c.svc.listarHistoricoCierresAdminCompleto(c.satelite);
      if (r.status !== "ok") throw new Error(`status ${r.status}`);
      expect(r.items.map((i) => i.cierreId)).toEqual([c.cierre.S1]);
      expect(r.cifrasModeloNuevo).toEqual([cifrasN1(c.cierre.S1, null)]);
    });
  });

  it("R383: el alcance va en el WHERE de la lectura en lote: un id de otra zona pasado a mano no devuelve nada", async () => {
    await conCorpus(async (c) => {
      const soloAjeno = await c.repo.findGestionesDeCierresEnAlcance([c.cierre.N3], c.alcanceS, ZONA_CR);
      expect([...soloAjeno.keys()]).toEqual([]);
      const mezcla = await c.repo.findGestionesDeCierresEnAlcance([c.cierre.S1, c.cierre.N3], c.alcanceS, ZONA_CR);
      expect([...mezcla.keys()]).toEqual([c.cierre.S1]);
      expect(mezcla.get(c.cierre.S1)?.map((g) => g.tiendaNombre).sort()).toEqual(["Tienda Norte", "Tienda Sur"]);
      expect(await c.repo.findGestionesDeCierresEnAlcance([], c.alcanceS, ZONA_CR)).toEqual(new Map());
    });
  });

  it("R383: mismas consultas con 1 y con 3 cierres nuevos; solo viejos = linea base, sin leer gestiones; sin escrituras", async () => {
    await conCorpus(async (c) => {
      const lote = vi.spyOn(c.repo, "findGestionesDeCierresEnAlcance");
      const uno = await medir(() =>
        c.svc.listarHistoricoCierresAdminCompleto(c.maestro, { mensajeroIds: [c.m.N1, c.m.V1] }),
      );
      const tres = await medir(() =>
        c.svc.listarHistoricoCierresAdminCompleto(c.maestro, { mensajeroIds: [c.m.N1, c.m.N4, c.m.N5, c.m.V1] }),
      );
      if (uno.r.status !== "ok" || tres.r.status !== "ok") throw new Error("status");
      expect(uno.r.cifrasModeloNuevo).toHaveLength(1);
      expect(tres.r.cifrasModeloNuevo).toHaveLength(3);
      expect(tres.sql.length).toBe(uno.sql.length);
      expect(lote).toHaveBeenCalledTimes(2);

      lote.mockClear();
      const viejos = await medir(() => c.svc.listarHistoricoCierresAdminCompleto(c.maestro, { mensajeroIds: [c.m.V1] }));
      if (viejos.r.status !== "ok") throw new Error("status");
      expect(viejos.r.items.map((i) => i.cierreId)).toEqual([c.cierre.V1]);
      expect("cifrasModeloNuevo" in viejos.r).toBe(false);
      expect(lote).not.toHaveBeenCalled();
      expect(viejos.sql.length).toBe(CONSULTAS_SOLO_VIEJOS_LINEA_BASE);

      for (const s of [...uno.sql, ...tres.sql, ...viejos.sql]) expect(s).not.toMatch(ESCRITURA);
    });
  });
});
