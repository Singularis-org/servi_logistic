import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CifrasBodegaLoteRepository } from "@/lib/repositories/CifrasBodegaLoteRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CierresBodegaAdminService } from "@/lib/services/CierresBodegaAdminService";
import { cifrasAgregadasBodega } from "@/lib/utils/cifras-cierre-bodega";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { folioCierre } from "@/lib/utils/folio-cierre";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

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
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T3.1; R384, R386-R389) — las cifras
 * que las descargas de cierres de bodega llevan para la hoja «Cierres», leidas con los servicios y
 * repositorios REALES contra Postgres, en una transaccion que SIEMPRE se revierte.
 *
 * Los tests de servicio usan dobles: no ven el `WHERE` de alcance de la lectura en lote, ni cuantas
 * consultas cuesta, ni si las gestiones congeladas dan de verdad las cifras del detalle. Aqui solo
 * pasa lo que Postgres devuelve.
 *
 * EL CORPUS (`design.md > Verificacion`), sembrado entero por el test (la base solo trae catalogos):
 * zona Centro = alcance de la satelite S; Norte, Este y Oeste fuera de el.
 *   - BN cierre de bodega Centro, modelo NUEVO, id `…b0de9a01`, aprobado y conciliado con 96 000,00
 *     por «Ana Pérez» el 2026-11-07 02:30 UTC (20:30 del 06 en Costa Rica): recibido incompleto, asi
 *     que vive en la cola (Pendientes). Snapshot agregado = el de D1.
 *       D1 (M1, aprobado, con la marca): efectivo 70 000,00 · SINPE 30 000,00 · P 3 000,00 · ingreso
 *       de bodega 500,00.
 *         G1 entregada, T1, efectivo 70 000,00, flete 4 000,00 + IVA 13 %; un ajuste de pago.
 *         G2 entregada, T2, SINPE 30 000,00, comision 1 000,00 + IVA 13 %.
 *         G3 rechazo, T1, flete de no entregadas 2 000,00 + IVA 13 %.
 *         Un `pago_satelite` de 3 000,00 contra D1 (SLT-139).
 *   - BV cierre de bodega Centro, modelo VIEJO, conciliado completo (Historico): señuelo de R384 y
 *     del caso mixto de la satelite.
 *   - BZ cierre de bodega Norte, modelo nuevo: señuelo de alcance para S.
 *   - B2 (Este) y B3 (Oeste), nuevos, sin conciliar (cola): los otros dos del conteo «1 contra 3».
 *     B2 tiene a proposito un snapshot AGREGADO distinto de la suma de su dia (general 12 000,00 y P
 *     800,00 contra 10 000,00 y 600,00): el minuendo es el agregado (393, R13), y asi la mutacion
 *     «suma de los cierres del dia en vez del snapshot agregado» se ve.
 *
 * CIFRAS ESCRITAS A MANO (memoria «asercion contra su propia fuente»; calculo en
 * `progress/impl_SLT-141.md > T0.2` y abajo en cada literal).
 *
 * Sin base se SALTA (`describe.skip`, visible); con base y sin catalogos, FALLA ruidosamente.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

/**
 * T0.3 (R384) — consultas de `listarHistoricoCierresBodegaCompleto` con un conjunto SOLO viejo, medidas
 * con el codigo ANTERIOR a esta ficha (`progress/impl_SLT-141.md > T0.3`). Un cierre de bodega viejo no
 * puede costar ni una consulta mas que antes.
 */
const CONSULTAS_SOLO_VIEJOS_LINEA_BASE = 9;

const ESCRITURA = /^\s*(INSERT|UPDATE|DELETE)\b/i;

type ClaveBodega = "BN" | "BV" | "BZ" | "B2" | "B3";

interface Corpus {
  svc: CierresBodegaAdminService;
  svcSatelite: CierreBodegaService;
  lote: CifrasBodegaLoteRepository;
  maestro: Actor;
  satelite: Actor;
  zona: Record<"C" | "N" | "E" | "O", string>;
  bodega: Record<ClaveBodega, string>;
  d1: string;
  tienda: Record<"T1" | "T2", string>;
}

/** «Por tienda» de BN, a mano. T1: 70 000 − 4 520 = 65 480 y 70 000 − (4 520 + 2 260) = 63 220. T2: 30 000 − 1 130. */
function partesBN(t: Corpus["tienda"]) {
  return [
    { tiendaId: t.T1, tiendaNombre: "Tienda Uno", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
    { tiendaId: t.T2, tiendaNombre: "Tienda Dos", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
  ];
}

/**
 * Las cifras de BN para la descarga, a mano: facturado 4 520 + 1 130 + 2 260 = 7 910; IVA 520 + 130 +
 * 260 = 910; neto (7 910 − 910) − 3 000 − 500 = 3 500; gana 100 000 − 7 910 = 92 090.
 */
function cifrasBN(c: Corpus) {
  return {
    cierreBodegaId: c.bodega.BN,
    gestiones: 3,
    pagosAjustados: 1,
    totalFacturado: "7910.00",
    ivaFacturado: "910.00",
    netoEmpresa: "3500.00",
    ganaLaTienda: "92090.00",
    partesPorTienda: partesBN(c.tienda),
  };
}

/**
 * B2, a mano, con el snapshot AGREGADO como minuendo: facturado 1 000 + 130 = 1 130; neto (1 130 −
 * 130) − 800 − 0 = 200; gana 12 000 − 1 130 = 10 870. «Por tienda» sale de la gestion: 10 000 /
 * 8 870 / 8 870. «Pago entregado» = el de D2 (P del DIA 600, efectivo 10 000 cubre: pendiente 0).
 */
function cifrasB2(c: Corpus) {
  return {
    cierreBodegaId: c.bodega.B2,
    gestiones: 1,
    pagosAjustados: 0,
    totalFacturado: "1130.00",
    ivaFacturado: "130.00",
    netoEmpresa: "200.00",
    ganaLaTienda: "10870.00",
    partesPorTienda: [
      { tiendaId: c.tienda.T1, tiendaNombre: "Tienda Uno", recaudado: "10000.00", pagoTienda: "8870.00", ganaLaTienda: "8870.00" },
    ],
    pagoEntregado: "600.00",
  };
}

/** B3, a mano: snapshot = su dia (10 000, P 0); facturado 1 130; neto 1 000; gana 8 870; entregado 0. */
function cifrasB3(c: Corpus) {
  return {
    cierreBodegaId: c.bodega.B3,
    gestiones: 1,
    pagosAjustados: 0,
    totalFacturado: "1130.00",
    ivaFacturado: "130.00",
    netoEmpresa: "1000.00",
    ganaLaTienda: "8870.00",
    partesPorTienda: [
      { tiendaId: c.tienda.T2, tiendaNombre: "Tienda Dos", recaudado: "10000.00", pagoTienda: "8870.00", ganaLaTienda: "8870.00" },
    ],
    pagoEntregado: "0.00",
  };
}

interface Snapshots {
  efectivo: string;
  simpe: string;
  general: string;
  pago: string;
  bodega: string;
}

function snapshotsDb(s: Snapshots) {
  return {
    totalEfectivo: new Prisma.Decimal(s.efectivo),
    totalSimpe: new Prisma.Decimal(s.simpe),
    totalTransferencia: new Prisma.Decimal("0.00"),
    totalGeneral: new Prisma.Decimal(s.general),
    totalPagoMensajero: new Prisma.Decimal(s.pago),
    totalIngresoBodegaRechazos: new Prisma.Decimal(s.bodega),
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
  const zona = { C: await nuevaZona("Centro"), N: await nuevaZona("Norte"), E: await nuevaZona("Este"), O: await nuevaZona("Oeste") };

  const tienda = {
    T1: (await crearUsuarioDePrueba(tx, "adminTienda")).id,
    T2: (await crearUsuarioDePrueba(tx, "adminTienda")).id,
  };
  const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
  const ana = (await crearUsuarioDePrueba(tx, "maestro")).id;
  await tx.usuario.update({ where: { id: ana }, data: { nombre: "Ana", primerApellido: "Pérez", segundoApellido: null } });
  const satelite = (await crearUsuarioDePrueba(tx, "adminSatelite")).id;
  await tx.usuario.update({ where: { id: satelite }, data: { zonaId: zona.C } });
  const mensajero = async () => (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const m = { M1: await mensajero(), MV: await mensajero(), MZ: await mensajero(), M2: await mensajero(), M3: await mensajero() };

  const nuevaBodega = async (args: {
    id?: string;
    zonaId: string;
    s: Snapshots;
    conciliado?: { monto: string; at: Date };
  }) =>
    (
      await tx.cierreBodega.create({
        data: {
          ...(args.id !== undefined ? { id: args.id } : {}),
          zonaId: args.zonaId,
          solicitadoPor: satelite,
          solicitadoAt: new Date("2026-11-06T22:00:00.000Z"),
          ...snapshotsDb(args.s),
          // CHECK `cierre_bodega_conciliacion_coherente`: `aprobado` <=> conciliado (las cuatro juntas).
          ...(args.conciliado !== undefined
            ? {
                estado: "aprobado" as const,
                resueltoPor: maestro,
                resueltoAt: new Date("2026-11-06T23:00:00.000Z"),
                conciliadoAt: args.conciliado.at,
                conciliadoPor: ana,
                montoRecibido: new Prisma.Decimal(args.conciliado.monto),
              }
            : { estado: "solicitado" as const }),
        },
        select: { id: true },
      })
    ).id;
  const nuevoDia = async (args: { bodegaId: string; zonaId: string; mensajeroId: string; marca: boolean; s: Snapshots }) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId: args.mensajeroId,
          estado: "aprobado",
          destinoTipo: "bodega_satelite",
          destinoZonaId: args.zonaId,
          pagoIndependienteEfectivo: args.marca,
          cierreBodegaId: args.bodegaId,
          solicitadoAt: new Date("2026-11-06T18:00:00.000Z"),
          resueltoAt: new Date("2026-11-06T20:00:00.000Z"),
          ...snapshotsDb(args.s),
        },
        select: { id: true },
      })
    ).id;

  const sBN: Snapshots = { efectivo: "70000.00", simpe: "30000.00", general: "100000.00", pago: "3000.00", bodega: "500.00" };
  const sDiez: Snapshots = { efectivo: "10000.00", simpe: "0.00", general: "10000.00", pago: "0.00", bodega: "0.00" };
  const bodega: Corpus["bodega"] = {
    // El id acaba en `b0de9a01`: el folio es «B0DE9A01».
    BN: await nuevaBodega({
      id: `${randomUUID().slice(0, 28)}b0de9a01`,
      zonaId: zona.C,
      s: sBN,
      conciliado: { monto: "96000.00", at: new Date("2026-11-07T02:30:00.000Z") },
    }),
    // Conciliado COMPLETO (esperado 10 000 − 0 − 0): va al Historico, no a la cola.
    BV: await nuevaBodega({
      zonaId: zona.C,
      s: sDiez,
      conciliado: { monto: "10000.00", at: new Date("2026-11-07T02:30:00.000Z") },
    }),
    BZ: await nuevaBodega({ zonaId: zona.N, s: sDiez }),
    B2: await nuevaBodega({ zonaId: zona.E, s: { ...sDiez, efectivo: "12000.00", general: "12000.00", pago: "800.00" } }),
    B3: await nuevaBodega({ zonaId: zona.O, s: sDiez }),
  };
  const d1 = await nuevoDia({ bodegaId: bodega.BN, zonaId: zona.C, mensajeroId: m.M1, marca: true, s: sBN });
  const dV = await nuevoDia({ bodegaId: bodega.BV, zonaId: zona.C, mensajeroId: m.MV, marca: false, s: sDiez });
  const dZ = await nuevoDia({ bodegaId: bodega.BZ, zonaId: zona.N, mensajeroId: m.MZ, marca: true, s: sDiez });
  const d2 = await nuevoDia({
    bodegaId: bodega.B2,
    zonaId: zona.E,
    mensajeroId: m.M2,
    marca: false,
    s: { ...sDiez, pago: "600.00" },
  });
  const d3 = await nuevoDia({ bodegaId: bodega.B3, zonaId: zona.O, mensajeroId: m.M3, marca: false, s: sDiez });

  let n = 0;
  /** Una orden, su fila congelada (modelo `modelo`) y su gestion en `cierreId`. */
  const gestion = async (args: {
    cierreId: string;
    zonaId: string;
    mensajeroId: string;
    tiendaId: string;
    tiendaNombre: string;
    resultado: "entregado" | "devolucion_a_origen_por_rechazo";
    montoCobrar: string;
    cobraComision: boolean;
    modelo: "viejo" | "nuevo";
    conceptos: Array<{ concepto: string; valor: string }>;
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
          zonaId: args.zonaId,
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
          zonaId: args.zonaId,
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
          zonaNombre: "Zona",
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
          modo: "monto",
          valor: new Prisma.Decimal(c.valor),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "tienda_general",
          tarifaValorId: null,
        },
        select: { id: true },
      });
    }
    const pagos = args.pagos ?? [];
    const gestionId = (
      await tx.gestionOrden.create({
        data: {
          ordenId,
          mensajeroId: args.mensajeroId,
          resultado: args.resultado,
          cierreId: args.cierreId,
          ...(args.resultado === "entregado" && pagos.length > 0
            ? { montoRecibido: new Prisma.Decimal(args.montoCobrar), metodoPago: pagos[0].metodo }
            : {}),
          pagoMensajero: new Prisma.Decimal("0.00"),
          ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
        },
        select: { id: true },
      })
    ).id;
    for (const p of pagos) {
      await tx.gestionOrdenPago.create({
        data: { gestionId, metodo: p.metodo, monto: new Prisma.Decimal(p.monto) },
        select: { id: true },
      });
    }
    return gestionId;
  };

  const T1 = { tiendaId: tienda.T1, tiendaNombre: "Tienda Uno" };
  const T2 = { tiendaId: tienda.T2, tiendaNombre: "Tienda Dos" };
  const enD1 = { cierreId: d1, zonaId: zona.C, mensajeroId: m.M1, modelo: "nuevo" as const };
  const g1 = await gestion({
    ...enD1,
    ...T1,
    resultado: "entregado",
    montoCobrar: "70000.00",
    cobraComision: false,
    conceptos: [{ concepto: "tienda_flete_entregado", valor: "4000.00" }],
    pagos: [{ metodo: "efectivo", monto: "70000.00" }],
  });
  await gestion({
    ...enD1,
    ...T2,
    resultado: "entregado",
    montoCobrar: "30000.00",
    cobraComision: true,
    conceptos: [{ concepto: "tienda_comision_cod", valor: "1000.00" }],
    pagos: [{ metodo: "SINPE", monto: "30000.00" }],
  });
  await gestion({
    ...enD1,
    ...T1,
    resultado: "devolucion_a_origen_por_rechazo",
    montoCobrar: "10000.00",
    cobraComision: false,
    conceptos: [{ concepto: "tienda_flete_rechazo", valor: "2000.00" }],
  });
  const unaDeDiez = (cierreId: string, zonaId: string, mensajeroId: string, t: typeof T1, modelo: "viejo" | "nuevo") =>
    gestion({
      cierreId,
      zonaId,
      mensajeroId,
      ...t,
      modelo,
      resultado: "entregado",
      montoCobrar: "10000.00",
      cobraComision: false,
      conceptos: modelo === "nuevo" ? [{ concepto: "tienda_flete_entregado", valor: "1000.00" }] : [],
      pagos: [{ metodo: "efectivo", monto: "10000.00" }],
    });
  await unaDeDiez(dV, zona.C, m.MV, T1, "viejo");
  await unaDeDiez(dZ, zona.N, m.MZ, T1, "nuevo");
  await unaDeDiez(d2, zona.E, m.M2, T1, "nuevo");
  await unaDeDiez(d3, zona.O, m.M3, T2, "nuevo");

  // El ajuste de pago de G1 («Pagos ajustados» = 1) y lo pagado por la satelite contra D1 (SLT-139).
  await tx.gestionPagoMensajeroAjuste.create({
    data: {
      gestionId: g1,
      cierreId: d1,
      pagoAnterior: new Prisma.Decimal("3000.00"),
      pagoNuevo: new Prisma.Decimal("2500.00"),
      actorUsuarioId: maestro,
      actorRol: "maestro",
      motivo: "Ruta corta",
    },
    select: { id: true },
  });
  await tx.pagoMensajeroMovimiento.create({
    data: {
      mensajeroId: m.M1,
      tipo: "pago",
      categoria: "pago_satelite",
      monto: new Prisma.Decimal("3000.00"),
      origenTipo: "cierre_dia",
      origenId: d1,
      registradoPor: null,
    },
    select: { id: true },
  });

  // Autocomprobacion: lo sembrado, leido en la misma transaccion (un corpus vacio no prueba nada).
  const dias = [d1, dV, dZ, d2, d3];
  const gestionesSembradas = await tx.gestionOrden.count({ where: { cierreId: { in: dias } } });
  if (gestionesSembradas !== 7) throw new Error(`corpus incompleto: ${gestionesSembradas} gestiones de 7`);
  const consolidados = await tx.cierreDia.count({ where: { cierreBodegaId: { in: Object.values(bodega) } } });
  if (consolidados !== 5) throw new Error(`corpus incompleto: ${consolidados} cierres del dia consolidados de 5`);

  const organizacionId = (
    await tx.cierreBodega.findUniqueOrThrow({ where: { id: bodega.BN }, select: { organizacionId: true } })
  ).organizacionId;

  const c = clienteConSavepoint(tx);
  const lote = new CifrasBodegaLoteRepository(c);
  const svc = new CierresBodegaAdminService(
    new CierresBodegaAdminRepository(c),
    URLS_NO_USADAS,
    reglasPaisFijas(),
    new OrdenRepository(c),
    lote,
    { liquidaciones: new LiquidacionPagoRepository(c), premios: new PagoMensajeroMovimientoRepository(c) },
  );
  const svcSatelite = new CierreBodegaService(
    new CierreBodegaRepository(c),
    new OrdenRepository(c),
    reglasPaisFijas(),
    undefined,
    lote,
  );
  return {
    svc,
    svcSatelite,
    lote,
    maestro: { usuarioId: maestro, rol: "maestro", organizacionId },
    satelite: { usuarioId: satelite, rol: "adminSatelite", organizacionId },
    zona,
    bodega,
    d1,
    tienda,
  };
}

describeSiHayBase("SLT-141 — cifras de la hoja «Cierres» de bodega del modelo nuevo, contra Postgres real", () => {
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

  it("R387/R388: BN en Pendientes contra literales a mano (cifras, «Pago entregado» y la fila de hoy)", async () => {
    await conCorpus(async (c) => {
      const r = await c.svc.listarPendientesCierresBodegaCompleto(c.maestro, { destinoZonaIds: [c.zona.C] });
      if (r.status !== "ok") throw new Error(`status ${r.status}`);
      expect(r.items.map((i) => i.cierreBodegaId)).toEqual([c.bodega.BN]);
      // «Pago entregado» de D1 con la marca: pendiente 3 000 + 0 − 0 − 3 000 = 0 → (3 000 + 0) − 0.
      expect(r.cifrasModeloNuevo).toEqual([{ ...cifrasBN(c), pagoEntregado: "3000.00" }]);

      const item = r.items[0];
      expect(folioCierre(item.cierreBodegaId)).toBe("B0DE9A01");
      expect(item.incluyeModeloNuevo).toBe(true);
      expect(item.totales).toEqual({ efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" });
      expect(item.paraLaCentral).toBe("96500.00"); // 100 000 − 3 000 − 500
      expect(item.totalPagoMensajero).toBe("3000.00");
      expect(item.totalIngresoBodegaRechazos).toBe("500.00");
      expect(item.cantidadCierres).toBe(1);
      expect(item.montoRecibido).toBe("96000.00");
      expect(item.faltaPorRecibir).toBe("500.00"); // 96 500 − 96 000: «Recibido incompleto»
      expect(item.conciliado).toBe(true);
      expect(item.conciliadoAt).toBe("2026-11-07T02:30:00.000Z"); // 2026-11-06 20:30 en Costa Rica
      expect(item.conciliadoPorNombre).toBe("Ana Pérez");
    });
  });

  it("R387 paridad: `cifrasAgregadasBodega` sobre el lote = el detalle de BN, con la central y con S", async () => {
    await conCorpus(async (c) => {
      for (const [actor, alcance] of [
        [c.maestro, { lectura: "toda_la_empresa" }],
        [c.satelite, { lectura: "zona", zonaId: c.zona.C }],
      ] as const) {
        const d = await c.svc.verCierreBodegaDetalle(c.bodega.BN, actor);
        if (d.status !== "ok") throw new Error(`detalle ${d.status} (${actor.rol})`);
        const filas = await c.lote.leerCierresDiaDeBodegas([c.bodega.BN], alcance, ZONA_CR);
        expect(filas.map((f) => f.cierreDiaId)).toEqual([c.d1]);
        const lote = cifrasAgregadasBodega(d.cierre, filas.flatMap((f) => f.gestiones));
        expect(lote).toEqual({
          totalesIngreso: d.totalesIngreso,
          ivaFacturado: d.ivaFacturado,
          ganancia: d.ganancia,
          pagoTienda: d.pagoTienda,
          cobradoSobreRecaudado: d.cobradoSobreRecaudado,
          netoEmpresa: d.netoEmpresa,
          ganaLaTienda: d.ganaLaTienda,
          partesPorTienda: d.partesPorTienda,
        });
        // Y el detalle, contra los literales a mano (Σ «Se le paga hoy» 65 480 + 28 870 = 94 350).
        expect(d.pagoTienda).toBe("94350.00");
        expect(d.netoEmpresa).toBe("3500.00");
        expect(d.ganaLaTienda).toBe("92090.00");
        expect(d.partesPorTienda).toEqual(partesBN(c.tienda));
        expect(d.cierres.reduce((s, cd) => s + Object.values(cd.grupos).reduce((t, g) => t + g.length, 0), 0)).toBe(3);
      }
    });
  });

  it("R386/R389: «Solicitados» de S (mixto BN + BV): solo BN con cifras, sin `pagoEntregado`; nunca BZ", async () => {
    await conCorpus(async (c) => {
      const r = await c.svcSatelite.listarCierresBodegaSolicitadosCompleto(c.satelite);
      if (r.status !== "ok") throw new Error(`status ${r.status}`);
      expect(r.items.map((i) => i.cierreBodegaId).sort()).toEqual([c.bodega.BN, c.bodega.BV].sort());
      expect(r.cifrasModeloNuevo).toEqual([cifrasBN(c)]);
      for (const cifras of r.cifrasModeloNuevo ?? []) expect("pagoEntregado" in cifras).toBe(false);
    });
  });

  it("R389: el alcance va en el WHERE del lote: con S e ids [BN, BZ] solo llega D1", async () => {
    await conCorpus(async (c) => {
      const zonaC = { lectura: "zona", zonaId: c.zona.C } as const;
      const mezcla = await c.lote.leerCierresDiaDeBodegas([c.bodega.BN, c.bodega.BZ], zonaC, ZONA_CR);
      expect(mezcla.map((f) => [f.cierreBodegaId, f.cierreDiaId])).toEqual([[c.bodega.BN, c.d1]]);
      expect(mezcla[0].gestiones).toHaveLength(3);
      expect(mezcla[0].gestionesAjustadas).toBe(1);
      expect(mezcla[0].pagoIndependienteEfectivo).toBe(true);
      expect(mezcla[0].totalPagoMensajero).toBe("3000.00");
      expect(mezcla[0].totalEfectivo).toBe("70000.00");
      expect(await c.lote.leerCierresDiaDeBodegas([c.bodega.BZ], zonaC, ZONA_CR)).toEqual([]);
      expect(await c.lote.leerCierresDiaDeBodegas([], zonaC, ZONA_CR)).toEqual([]);
    });
  });

  it("R387: el snapshot AGREGADO es el minuendo (B2), y B3; «Pago entregado» por dia", async () => {
    await conCorpus(async (c) => {
      const r = await c.svc.listarPendientesCierresBodegaCompleto(c.maestro, { destinoZonaIds: [c.zona.E, c.zona.O] });
      if (r.status !== "ok") throw new Error(`status ${r.status}`);
      const porId = new Map((r.cifrasModeloNuevo ?? []).map((x) => [x.cierreBodegaId, x]));
      expect(porId.get(c.bodega.B2)).toEqual(cifrasB2(c));
      expect(porId.get(c.bodega.B3)).toEqual(cifrasB3(c));
      expect(porId.size).toBe(2);
    });
  });

  it("R389: mismas consultas con 1 y con 3 cierres de bodega nuevos; sin escrituras", async () => {
    await conCorpus(async (c) => {
      const leer = vi.spyOn(c.lote, "leerCierresDiaDeBodegas");
      const uno = await medir(() => c.svc.listarPendientesCierresBodegaCompleto(c.maestro, { destinoZonaIds: [c.zona.C] }));
      const tres = await medir(() =>
        c.svc.listarPendientesCierresBodegaCompleto(c.maestro, { destinoZonaIds: [c.zona.C, c.zona.E, c.zona.O] }),
      );
      if (uno.r.status !== "ok" || tres.r.status !== "ok") throw new Error("status");
      expect(uno.r.cifrasModeloNuevo).toHaveLength(1);
      expect(tres.r.cifrasModeloNuevo?.map((x) => x.cierreBodegaId).sort()).toEqual(
        [c.bodega.BN, c.bodega.B2, c.bodega.B3].sort(),
      );
      expect(uno.sql.length).toBeGreaterThan(0);
      expect(tres.sql.length).toBe(uno.sql.length);
      expect(leer).toHaveBeenCalledTimes(2);
      for (const s of [...uno.sql, ...tres.sql]) expect(s).not.toMatch(ESCRITURA);
    });
  });

  it("R384: con solo BV (viejo) en el conjunto, ni la clave ni el lote: las consultas de la linea base", async () => {
    await conCorpus(async (c) => {
      const leer = vi.spyOn(c.lote, "leerCierresDiaDeBodegas");
      const viejos = await medir(() => c.svc.listarHistoricoCierresBodegaCompleto(c.maestro, { destinoZonaIds: [c.zona.C] }));
      if (viejos.r.status !== "ok") throw new Error(`status ${viejos.r.status}`);
      expect(viejos.r.items.map((i) => i.cierreBodegaId)).toEqual([c.bodega.BV]);
      expect(viejos.r.items[0].incluyeModeloNuevo).toBe(false);
      expect("cifrasModeloNuevo" in viejos.r).toBe(false);
      expect(leer).not.toHaveBeenCalled();
      expect(viejos.sql.length).toBe(CONSULTAS_SOLO_VIEJOS_LINEA_BASE);
      for (const s of viejos.sql) expect(s).not.toMatch(ESCRITURA);
    });
  });
});
