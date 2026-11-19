import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CATEGORIA_PAGO_LABEL } from "@/app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels";
import type { ConsultaAnalitica } from "@/lib/analytics/consulta";
import { getMetrica } from "@/lib/analytics/metrics";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { ITarifaZonaMensajeroRepository } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { LiquidacionTxRunner } from "@/lib/interfaces/services/ILiquidacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { asentarCierreDia } from "@/lib/repositories/_shared/asientos-cierre-dia";
import { CierreAporteRepository } from "@/lib/repositories/CierreAporteRepository";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CuentasPorPagarAnaliticaRepository } from "@/lib/repositories/CuentasPorPagarAnaliticaRepository";
import { EstadoCuentaRepository } from "@/lib/repositories/EstadoCuentaRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { LiquidacionRepartoRepository } from "@/lib/repositories/LiquidacionRepartoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CajaPagoTiendaFeedService } from "@/lib/services/CajaPagoTiendaFeedService";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { DetalleMovimientoService } from "@/lib/services/DetalleMovimientoService";
import { LiquidacionService } from "@/lib/services/LiquidacionService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletMensajeroService } from "@/lib/services/WalletMensajeroService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { listarPagosDeMensajeroSchema } from "@/lib/types/wallet-mensajero";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { reglasPaisFijas, ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { busquedaPorGuiaDe } from "./_fixtures/busqueda-469";
import {
  INDEMNIZACION_SLT73,
  consolidar,
  filasDeLibros,
  marcarRecibido,
  sembrarCierreAprobable,
  type CierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";

/**
 * SLT-139 «Pago al mensajero independiente del efectivo: satelite» (T10.1; design §13.1) — los trece
 * casos contra Postgres real, con los servicios y repositorios REALES, en una transaccion que SIEMPRE
 * se revierte. La siembra de cada cierre es la de `_fixtures/slt73-cierre-aprobable.ts` (una entrega de
 * 20 000,00 en efectivo y un incidente indemnizado con 6 000,00); aqui se fijan P, E y el general:
 *
 *   VC  satelite  marca false  P 3 000 / E 1 000 / G 5 000  aprobado, consolidado y conciliado con el feed
 *                                                          viejo (otra zona) — la FOTO (R342)
 *   VS  satelite  marca false  P 3 000 / E 2 000 / G 5 000  aprobado «entre los dos merges» (fixture), Z1
 *   NS  satelite  —            P 2 500 / E 1 000 / G 4 000  `solicitado` -> aprobado con el codigo real, Z1
 *   NS0 satelite  —            P     0 / E 3 000 / G 3 000  `solicitado` -> aprobado, Z1
 *   NR  satelite  —            P 1 000 / E 1 000 / G 1 000  `solicitado` -> rechazado, Z1
 *   NC  central   —            P 3 000 / E 5 000 / G 5 000  `solicitado` -> aprobado
 *
 * K1 = la consolidacion de Z1 (VS, NS, NS0), con el servicio real, conciliada con `marcarConciliado`.
 * Los importes van ESCRITOS A MANO (memoria «asercion contra su propia fuente») y estan elegidos para
 * que la regla vieja y la nueva den numeros distintos (NS con E < P; K1 con efectivo total suficiente y
 * el de los viejos insuficiente).
 *
 * El cliente de las aprobaciones es `clienteVigilado`: dentro de una `$transaction`, tocar `cierreDia`
 * por el cliente de FUERA lanza. Sin esa vigilancia, una marca escrita fuera de la transaccion (M6)
 * pasaria en verde: con el savepoint del arnes las dos rutas van por la misma conexion.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

/** Caja de un cierre de esta siembra con P = 2 500 (NS): la de la fixture con su egreso de pago (R341). */
const CAJA_NS = [
  { tipo: "egreso", categoria: "egreso_indemnizacion", monto: "6000.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "2500.00" },
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

class EscrituraFueraDeTx extends Error {}
class FalloForzado extends Error {}

/**
 * `clienteConSavepoint(tx)` con una vigilancia: mientras corre una `$transaction`, pedir `cierreDia` al
 * cliente de FUERA lanza. Con `fallarEnIndemnizacion`, el cliente de DENTRO lanza al tocar
 * `gestionOrden` (lo primero que hace la aprobacion despues del `updateMany` que aprueba).
 */
function clienteVigilado(tx: TxDeTest, fallarEnIndemnizacion = false): PrismaClient {
  const base = clienteConSavepoint(tx);
  let dentro = 0;
  const vigilado: unknown = new Proxy(base as object, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        const original = Reflect.get(objetivo, prop) as (fn: (t: unknown) => unknown) => Promise<unknown>;
        return async (fn: (t: unknown) => unknown) => {
          dentro += 1;
          try {
            return await original((t: unknown) => {
              if (!fallarEnIndemnizacion) return fn(t);
              const interno = new Proxy(t as object, {
                get(o, p) {
                  if (p === "gestionOrden") throw new FalloForzado("fallo forzado despues de aprobar (SLT-139 caso 2)");
                  const v = Reflect.get(o, p) as unknown;
                  return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(o) : v;
                },
              });
              return fn(interno);
            });
          } finally {
            dentro -= 1;
          }
        };
      }
      if (prop === "cierreDia" && dentro > 0) {
        throw new EscrituraFueraDeTx("cierre_dia tocado FUERA de la transaccion de la aprobacion");
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  });
  return vigilado as PrismaClient;
}

/** `CierresAdminService` cableado como su composition root; `libro` permite espiar la lectura (caso 13). */
function admin(
  tx: TxDeTest,
  opciones: { fallarEnIndemnizacion?: boolean; libro?: PagoMensajeroMovimientoRepository } = {},
): CierresAdminService {
  const c = clienteVigilado(tx, opciones.fallarEnIndemnizacion === true);
  const mensajeroRepo = opciones.libro ?? new PagoMensajeroMovimientoRepository(c);
  return new CierresAdminService(
    new CierresAdminRepository(
      c,
      new WalletMovimientoRepository(c),
      new WalletFeedService(),
      new WalletTiendaMovimientoRepository(c),
      new WalletTiendaFeedService(),
      mensajeroRepo,
      new WalletMensajeroFeedService(),
      new WalletIndemnizacionFeedService(),
    ),
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
  );
}

/** `CierreDiaService` con las lecturas del pendiente reales (`/cierre-dia`). */
function cierreDia(tx: TxDeTest): CierreDiaService {
  const c = clienteConSavepoint(tx);
  return new CierreDiaService(
    new CierreDiaRepository(c, {} as unknown as ITarifaVigenteRepository),
    {} as unknown as IZonaRepository,
    {} as unknown as IOrdenRepository,
    {} as unknown as ISignedUrlProvider,
    {} as unknown as ITarifaZonaMensajeroRepository,
    undefined,
    undefined,
    reglasPaisFijas(),
    { liquidaciones: new LiquidacionPagoRepository(c), premios: new PagoMensajeroMovimientoRepository(c) },
  );
}

function liquidacion(tx: TxDeTest): LiquidacionService {
  const c = clienteConSavepoint(tx);
  const runTx = ((fn: (t: never) => Promise<unknown>) =>
    c.$transaction((t) => fn(t as never))) as unknown as LiquidacionTxRunner;
  return new LiquidacionService(
    new LiquidacionPagoRepository(c),
    new WalletTiendaMovimientoRepository(c),
    new PagoMensajeroMovimientoRepository(c),
    runTx,
    new CajaPagoTiendaFeedService(new WalletMovimientoRepository(c)),
    new LiquidacionRepartoRepository(c),
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
}

function bodega(tx: TxDeTest): CierreBodegaService {
  const c = clienteConSavepoint(tx);
  return new CierreBodegaService(new CierreBodegaRepository(c), new OrdenRepository(c), reglasPaisFijas());
}

/** Fija los snapshots de dinero del cierre (la fixture siembra P 1 500 / E 20 000). */
async function fijar(tx: TxDeTest, cierreId: string, d: { P: string; E: string; S: string; G: string }): Promise<void> {
  await tx.cierreDia.update({
    where: { id: cierreId },
    data: {
      totalPagoMensajero: new Prisma.Decimal(d.P),
      totalEfectivo: new Prisma.Decimal(d.E),
      totalSimpe: new Prisma.Decimal(d.S),
      totalGeneral: new Prisma.Decimal(d.G),
    },
  });
}

/** Un cierre aprobado ANTES de SLT-139: lo que hacia la aprobacion de `dev`, sin pasar por ella. */
async function aprobarComoAntes(tx: TxDeTest, k: CierreAprobable, aprobadorId: string): Promise<void> {
  await tx.gestionOrden.update({
    where: { id: k.gestionIncidenteId },
    data: { indemnizacion: new Prisma.Decimal(INDEMNIZACION_SLT73) },
  });
  await tx.cierreDia.update({
    where: { id: k.cierreId },
    data: { estado: "aprobado", resueltoPor: aprobadorId, resueltoAt: new Date("2026-11-12T12:00:00.000Z") },
  });
}

async function aprobarCon(servicio: CierresAdminService, k: CierreAprobable, aprobador: Actor): Promise<string> {
  const r = await servicio.aprobarCierre(
    k.cierreId,
    aprobador,
    [{ gestionId: k.gestionIncidenteId, monto: INDEMNIZACION_SLT73 }],
    [],
  );
  return r.status;
}

async function marca(tx: TxDeTest, cierreId: string): Promise<boolean> {
  return (
    await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { pagoIndependienteEfectivo: true } })
  ).pagoIndependienteEfectivo;
}

async function mensajeroDe(tx: TxDeTest, cierreId: string): Promise<string> {
  return (await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { mensajeroId: true } }))
    .mensajeroId;
}

/** Lo pendiente tal como lo pinta `/cierres-admin` (`conPendiente`) para ese actor. */
async function pendientesAdmin(servicio: CierresAdminService, actor: Actor): Promise<Record<string, string | null>> {
  const r = await servicio.listarCierresAdmin(actor);
  if (r.status !== "ok") throw new Error(`listarCierresAdmin: ${r.status}`);
  return Object.fromEntries([...r.historico, ...r.pendientes].map((c) => [c.cierreId, c.pendientePagoMensajero]));
}

/** Lo pendiente tal como lo pinta `/cierre-dia` del propio mensajero. */
async function pendienteMensajero(tx: TxDeTest, mensajeroId: string, cierreId: string): Promise<string | null | undefined> {
  const r = await cierreDia(tx).listarCierresPasadosPaginado({ page: 1, pageSize: 50 }, { usuarioId: mensajeroId, rol: "mensajero" });
  if (r.status !== "ok") throw new Error(`listarCierresPasadosPaginado: ${r.status}`);
  return r.items.find((c) => c.cierreId === cierreId)?.pendientePagoMensajero;
}

/** Las filas `pago_satelite` de un cierre, enteras (id, monto y fecha incluidos). */
async function filasPagoSatelite(tx: TxDeTest, cierreId: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT row_to_json(m)::text AS l FROM pago_mensajero_movimiento m
      WHERE m.origen_tipo = 'cierre_dia' AND m.origen_id = $1 AND m.categoria = 'pago_satelite' ORDER BY m.id`,
    cierreId,
  );
  return filas.map((f) => f.l);
}

/** R342: todas las filas de dinero de VC, enteras y en orden estable (su consolidacion incluida). */
async function fotoVC(tx: TxDeTest, id: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT 'cierre_dia ' || row_to_json(c)::text AS l FROM cierre_dia c WHERE c.id = $1
     UNION ALL SELECT 'pmm ' || row_to_json(m)::text FROM pago_mensajero_movimiento m
       WHERE m.origen_tipo = 'cierre_dia' AND m.origen_id = $1
     UNION ALL SELECT 'wm ' || row_to_json(w)::text FROM wallet_movimiento w
       WHERE w.origen_tipo = 'cierre_dia' AND w.origen_id = $1
     UNION ALL SELECT 'lp ' || row_to_json(p)::text FROM liquidacion_pago p WHERE p.cierre_id = $1
     UNION ALL SELECT 'cb ' || row_to_json(b)::text FROM cierre_bodega b
       WHERE b.id = (SELECT cierre_bodega_id FROM cierre_dia WHERE id = $1)
     ORDER BY 1`,
    id,
  );
  return filas.map((f) => f.l);
}

const SIN_LIMITE: ConsultaAnalitica = { rango: { hasta: new Date("2100-01-01T00:00:00.000Z") } } as unknown as ConsultaAnalitica;

/** Σ por tipo del libro del mensajero para la analitica de cuentas por pagar (toda la empresa). */
async function analiticaPorTipo(tx: TxDeTest): Promise<Record<string, Prisma.Decimal>> {
  const filas = await new CuentasPorPagarAnaliticaRepository(clienteConSavepoint(tx)).cuentaPorPagarMensajerosAlCorte(SIN_LIMITE);
  return Object.fromEntries(filas.map((f) => [f.tipo, new Prisma.Decimal(f.suma)]));
}

function delta(antes: Record<string, Prisma.Decimal>, despues: Record<string, Prisma.Decimal>, tipo: string): string {
  return (despues[tipo] ?? new Prisma.Decimal(0)).sub(antes[tipo] ?? new Prisma.Decimal(0)).toFixed(2);
}

interface Medida {
  ids: Record<"VC" | "VS" | "NS" | "NS0" | "NR" | "NC", string>;
  aprobaciones: Record<"NS" | "NS0" | "NC", string>;
  rechazo: string;
  conciliacion: string;
  marcas: Record<string, boolean>;
  pendientesAntes: Record<string, string | null>;
  pendienteNSMensajeroAntes: string | null | undefined;
  librosAntes: Record<"NS" | "NS0", Awaited<ReturnType<typeof filasDeLibros>>>;
  consolidacion: { centralDebe: string; neto: string; paraLaCentral: string; pago: string };
  paraLaCentralNS: string | null;
  libros: Record<"VS" | "NS" | "NS0" | "NC", Awaited<ReturnType<typeof filasDeLibros>>>;
  fechasNS: { conciliadoAt: string; fechas: string[] };
  pendientesDespues: Record<string, string | null>;
  pendienteNSMensajeroDespues: string | null | undefined;
  pendientesCentral: Record<string, string | null>;
  cuentaNS: { devengado: string; pagado: string; cuentaPorPagar: string };
  conceptosNS: string[];
  librosNSReasentado: Awaited<ReturnType<typeof filasDeLibros>>;
  pagoSateliteNS: string[];
  corregir: string;
  pagoSateliteTrasCorregir: string[];
  revertir: string;
  pagoSateliteTrasRevertir: string[];
  premiosNS: string;
  pagoCentralContraNS: string;
  liquidacionesNS: number;
  detalleNS: { status: string; monto?: string; total?: number; aportes?: string };
  analitica: { devengo: string; pago: string };
  llamadasLectura: string[][];
  empresa: { desdeA: Record<string, string>; desdeASoloNC: Record<string, string>; desdeB: Record<string, string> };
  fotoAntes: string[];
  fotoDespues: string[];
}

describeSiHayBase("SLT-139 — pago al mensajero independiente del efectivo: satelite, contra Postgres real", () => {
  let prisma: PrismaClient;
  let medida: Medida | undefined;
  let fallo: unknown;

  function m(): Medida {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llego a tomarse");
    return medida;
  }

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    try {
      medida = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);

        // ── VC: un cierre VIEJO de satelite ya conciliado con el feed viejo (la foto, R342) ─────
        const VC = await sembrarCierreAprobable(tx, "bodega_satelite");
        await fijar(tx, VC.cierreId, { P: "3000.00", E: "1000.00", S: "4000.00", G: "5000.00" });
        await aprobarComoAntes(tx, VC, VC.adminSatelite.usuarioId);
        const bodegaVC = await consolidar(tx, VC.adminSatelite);
        const conciliaVC = await marcarRecibido(tx, bodegaVC, "2000.00", VC.maestroId);
        if (conciliaVC !== "updated") throw new Error(`no se concilio VC: ${conciliaVC}`);
        const fotoAntes = await fotoVC(tx, VC.cierreId);

        // ── Z1: VS, NS, NS0 y NR en la MISMA zona (la de VS), con su adminSatelite ─────────────
        const VS = await sembrarCierreAprobable(tx, "bodega_satelite");
        const NS = await sembrarCierreAprobable(tx, "bodega_satelite");
        const NS0 = await sembrarCierreAprobable(tx, "bodega_satelite");
        const NR = await sembrarCierreAprobable(tx, "bodega_satelite");
        const adminZ1 = VS.adminSatelite;
        for (const k of [NS, NS0, NR]) {
          await tx.cierreDia.update({ where: { id: k.cierreId }, data: { destinoZonaId: VS.zonaId } });
        }
        await fijar(tx, VS.cierreId, { P: "3000.00", E: "2000.00", S: "3000.00", G: "5000.00" });
        await fijar(tx, NS.cierreId, { P: "2500.00", E: "1000.00", S: "3000.00", G: "4000.00" });
        await fijar(tx, NS0.cierreId, { P: "0.00", E: "3000.00", S: "0.00", G: "3000.00" });
        await fijar(tx, NR.cierreId, { P: "1000.00", E: "1000.00", S: "0.00", G: "1000.00" });
        // R329: el pago al mensajero de la gestion de NS = su P, para el detalle por guia.
        await tx.gestionOrden.update({
          where: { id: NS.gestionEntregaId },
          data: { pagoMensajero: new Prisma.Decimal("2500.00") },
        });
        await aprobarComoAntes(tx, VS, adminZ1.usuarioId); // «aprobado entre los dos merges»

        const NC = await sembrarCierreAprobable(tx, "bodega_central");
        await fijar(tx, NC.cierreId, { P: "3000.00", E: "5000.00", S: "0.00", G: "5000.00" });

        const aprobaciones = {
          NS: await aprobarCon(admin(tx), NS, adminZ1),
          NS0: await aprobarCon(admin(tx), NS0, adminZ1),
          NC: await aprobarCon(admin(tx), NC, NC.aprobador),
        };
        const rechazo = (await admin(tx).rechazarCierre(NR.cierreId, "Faltan comprobantes", adminZ1)).status;

        const ids = {
          VC: VC.cierreId,
          VS: VS.cierreId,
          NS: NS.cierreId,
          NS0: NS0.cierreId,
          NR: NR.cierreId,
          NC: NC.cierreId,
        };
        const marcas: Record<string, boolean> = {};
        for (const [n, id] of Object.entries(ids)) marcas[n] = await marca(tx, id);

        // ── Caso 3: antes de conciliar ──────────────────────────────────────────────────────
        const mensajeroNS = await mensajeroDe(tx, NS.cierreId);
        const pendientesAntes = await pendientesAdmin(admin(tx), adminZ1);
        const pendienteNSMensajeroAntes = await pendienteMensajero(tx, mensajeroNS, NS.cierreId);
        const librosAntes = {
          NS: await filasDeLibros(tx, NS.cierreId),
          NS0: await filasDeLibros(tx, NS0.cierreId),
        };

        // ── Caso 4: la consolidacion mixta ──────────────────────────────────────────────────
        const cons = await bodega(tx).listarConsolidacion(adminZ1);
        if (cons.status !== "ok") throw new Error(`listarConsolidacion: ${cons.status}`);
        const cola = await bodega(tx).listarConsolidablesPaginado({ page: 1, pageSize: 50 }, adminZ1);
        if (cola.status !== "ok") throw new Error(`listarConsolidablesPaginado: ${cola.status}`);

        const analiticaAntes = await analiticaPorTipo(tx);

        // ── Caso 5: conciliar K1 ────────────────────────────────────────────────────────────
        const K1 = await consolidar(tx, adminZ1);
        const conciliacion = await marcarRecibido(tx, K1, "6500.00", VS.maestroId);
        const conciliadoAt = (
          await tx.cierreBodega.findUniqueOrThrow({ where: { id: K1 }, select: { conciliadoAt: true } })
        ).conciliadoAt;
        const fechas = await tx.pagoMensajeroMovimiento.findMany({
          where: { origenTipo: "cierre_dia", origenId: NS.cierreId },
          select: { fechaMovimiento: true },
        });
        const analiticaDespues = await analiticaPorTipo(tx);

        const libros = {
          VS: await filasDeLibros(tx, VS.cierreId),
          NS: await filasDeLibros(tx, NS.cierreId),
          NS0: await filasDeLibros(tx, NS0.cierreId),
          NC: await filasDeLibros(tx, NC.cierreId),
        };

        // ── Caso 6: despues de conciliar ────────────────────────────────────────────────────
        const pendientesDespues = await pendientesAdmin(admin(tx), adminZ1);
        const pendienteNSMensajeroDespues = await pendienteMensajero(tx, mensajeroNS, NS.cierreId);
        const maestro: Actor = NC.aprobador;
        const pendientesCentral = await pendientesAdmin(admin(tx), maestro);
        const estado = await new WalletMensajeroService(
          new PagoMensajeroMovimientoRepository(clienteConSavepoint(tx)),
        ).listarPagosDeMensajero(
          listarPagosDeMensajeroSchema(ZONA_DE_CR).parse({ mensajeroId: mensajeroNS, cierreId: NS.cierreId, page: 1, pageSize: 50 }),
          maestro,
        );
        if (estado.status !== "ok") throw new Error(`listarPagosDeMensajero: ${estado.status}`);

        // ── Caso 7: re-asentar NS no duplica ────────────────────────────────────────────────
        await asentarCierreDia(clienteConSavepoint(tx), NS.cierreId);
        const librosNSReasentado = await filasDeLibros(tx, NS.cierreId);

        // ── Caso 8: corregir y desmarcar no tocan `pago_satelite` ──────────────────────────
        const pagoSateliteNS = await filasPagoSatelite(tx, NS.cierreId);
        const repoBodega = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
        const corregir = await repoBodega.corregirConciliacion({
          id: K1,
          montoRecibido: "6000.00",
          nota: null,
          actorUsuarioId: VS.maestroId,
          zonaHoraria: ZONA_DE_CR,
        });
        const pagoSateliteTrasCorregir = await filasPagoSatelite(tx, NS.cierreId);
        const revertir = await repoBodega.revertirConciliacion({ id: K1, actorUsuarioId: VS.maestroId, zonaHoraria: ZONA_DE_CR });
        const pagoSateliteTrasRevertir = await filasPagoSatelite(tx, NS.cierreId);

        // ── Caso 9: lo que no cambia ────────────────────────────────────────────────────────
        const premiosNS =
          (await new PagoMensajeroMovimientoRepository(clienteConSavepoint(tx)).sumarPremiosVivosPorCierre([NS.cierreId]))[
            NS.cierreId
          ] ?? "sin entrada";
        const pagoCentral = await liquidacion(tx).registrarPagoMensajero(
          {
            claveIdempotencia: "5c1b0139-0000-4000-8000-000000000139",
            cierreId: NS.cierreId,
            monto: "100.00",
            metodo: "SINPE",
            referencia: "SLT139",
            nota: "La central no paga cierres de satelite",
            fechaPago: "2026-11-15",
          },
          maestro,
        );
        const liquidacionesNS = await tx.liquidacionPago.count({ where: { cierreId: NS.cierreId } });

        // ── Caso 12: la categoria en el detalle por guia ────────────────────────────────────
        const idPagoSatelite = (
          await tx.pagoMensajeroMovimiento.findFirstOrThrow({
            where: { origenTipo: "cierre_dia", origenId: NS.cierreId, categoria: "pago_satelite" },
            select: { id: true },
          })
        ).id;
        const c = clienteConSavepoint(tx);
        const detalle = await new DetalleMovimientoService(
          new WalletMovimientoRepository(c),
          new WalletTiendaMovimientoRepository(c),
          new CierreAporteRepository(c),
          new EstadoCuentaRepository(c),
          busquedaPorGuiaDe(c),
        ).verDetalleDeFilaDeCuenta(
          { cuenta: { tipo: "mensajero", id: mensajeroNS }, movimientoId: idPagoSatelite, page: 1, pageSize: 50 },
          maestro,
        );
        const detalleNS =
          detalle.status === "ok"
            ? {
                status: detalle.status,
                monto: detalle.data.monto,
                total: detalle.data.total,
                aportes: detalle.data.ordenes
                  .reduce((acc, o) => acc.add(new Prisma.Decimal(o.aporte)), new Prisma.Decimal(0))
                  .toFixed(2),
              }
            : { status: detalle.status };

        // ── Caso 13: una sola lectura por pagina, con el repositorio REAL espiado ──────────
        const libroEspiado = new PagoMensajeroMovimientoRepository(clienteVigilado(tx));
        const espia = vi.spyOn(libroEspiado, "sumarPagadoSatelitePorCierre");
        await pendientesAdmin(admin(tx, { libro: libroEspiado }), adminZ1);
        const llamadasLectura = espia.mock.calls.map(([idsPedidos]) => [...idsPedidos].sort());

        const fotoDespues = await fotoVC(tx, VC.cierreId);

        // ── Caso 11: empresa (al final: baja la transaccion al rol de la app) ──────────────
        const orgA = (
          await tx.cierreDia.findUniqueOrThrow({ where: { id: NS.cierreId }, select: { organizacionId: true } })
        ).organizacionId;
        const orgB = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO "organizacion" ("id","nombre","slug") VALUES ($1,'SLT139 empresa B',$2)`,
          orgB,
          `slt139-b-${orgB.slice(0, 8)}`,
        );
        const rol = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "rol" WHERE "value" = 'mensajero'`);
        const tipoId = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "tipo_identificacion" LIMIT 1`);
        const mensajeroB = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
           VALUES ($1,'Mensajero B SLT139',$2,'88880000','x',$3,$4,$5,$6,now())`,
          mensajeroB,
          `slt139-b-${mensajeroB.slice(0, 8)}@example.test`,
          `SLT139B-${mensajeroB.slice(0, 8)}`,
          tipoId[0]!.id,
          rol[0]!.id,
          orgB,
        );
        // Un `pago_satelite` de la empresa B colgado del MISMO id de cierre que NS.
        await tx.$executeRawUnsafe(
          `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
           VALUES ($1,$2,'pago','pago_satelite',999.00,'cierre_dia',$3,$4)`,
          randomUUID(),
          mensajeroB,
          NS.cierreId,
          orgB,
        );
        const cierreDeB = randomUUID(); // un id que solo existe en B (y no tiene filas)
        await comoApp(tx, orgA);
        const lecturaA = new PagoMensajeroMovimientoRepository(clienteConSavepoint(tx));
        const desdeA = await lecturaA.sumarPagadoSatelitePorCierre([NS.cierreId, cierreDeB]);
        const desdeASoloNC = await lecturaA.sumarPagadoSatelitePorCierre([NC.cierreId]);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
        await comoApp(tx, orgB);
        const desdeB = await new PagoMensajeroMovimientoRepository(clienteConSavepoint(tx)).sumarPagadoSatelitePorCierre([
          NS.cierreId,
        ]);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);

        return {
          ids,
          aprobaciones,
          rechazo,
          conciliacion,
          marcas,
          pendientesAntes,
          pendienteNSMensajeroAntes,
          librosAntes,
          consolidacion: {
            centralDebe: cons.totalCentralDebeAgregado,
            neto: cons.totalNetoAgregado,
            paraLaCentral: cons.paraLaCentralAgregado,
            pago: cons.totalPagoMensajeroAgregado,
          },
          paraLaCentralNS: cola.items.find((x) => x.cierreDiaId === NS.cierreId)?.paraLaCentral ?? null,
          libros,
          fechasNS: {
            conciliadoAt: conciliadoAt?.toISOString() ?? "sin conciliar",
            fechas: fechas.map((f) => f.fechaMovimiento.toISOString()),
          },
          pendientesDespues,
          pendienteNSMensajeroDespues,
          pendientesCentral,
          cuentaNS: {
            devengado: estado.data.cuenta.devengado,
            pagado: estado.data.cuenta.pagado,
            cuentaPorPagar: estado.data.cuenta.cuentaPorPagar,
          },
          conceptosNS: estado.data.movimientos.map((x) => `${CATEGORIA_PAGO_LABEL[x.categoria]} ${x.monto}`).sort(),
          librosNSReasentado,
          pagoSateliteNS,
          corregir,
          pagoSateliteTrasCorregir,
          revertir,
          pagoSateliteTrasRevertir,
          premiosNS,
          pagoCentralContraNS: pagoCentral.status,
          liquidacionesNS,
          detalleNS,
          analitica: {
            devengo: delta(analiticaAntes, analiticaDespues, "devengo"),
            pago: delta(analiticaAntes, analiticaDespues, "pago"),
          },
          llamadasLectura,
          empresa: { desdeA, desdeASoloNC, desdeB },
          fotoAntes,
          fotoDespues,
        };
      });
    } catch (e) {
      fallo = e;
    }
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: aprobaciones, rechazo y conciliacion salieron ok; VC tiene filas que fotografiar", () => {
    const r = m();
    expect(r.aprobaciones).toEqual({ NS: "ok", NS0: "ok", NC: "ok" });
    expect(r.rechazo).toBe("ok");
    expect(r.conciliacion).toBe("updated");
    expect(r.fotoAntes.length).toBeGreaterThan(5);
  });

  it("caso 1 (R342): las filas de dinero de VC son identicas antes y despues de todo", () => {
    const r = m();
    expect(r.fotoDespues).toEqual(r.fotoAntes);
  });

  it("caso 2 (R336): NS, NS0 y NC aprobados llevan la marca; VS, VC y NR (rechazado) no", () => {
    expect(m().marcas).toEqual({ VC: false, VS: false, NS: true, NS0: true, NR: false, NC: true });
  });

  it("caso 3 (R319): antes de conciliar, NS 2500.00 (regla vieja 1500.00), NS0 0.00, VS 1000.00; sin libro", () => {
    const { pendientesAntes, pendienteNSMensajeroAntes, librosAntes, ids } = m();
    expect(pendientesAntes[ids.NS]).toBe("2500.00");
    expect(pendientesAntes[ids.NS0]).toBe("0.00");
    expect(pendientesAntes[ids.VS]).toBe("1000.00");
    expect(pendienteNSMensajeroAntes).toBe("2500.00");
    expect(librosAntes.NS.mensajero).toEqual([]);
    expect(librosAntes.NS0.mensajero).toEqual([]);
  });

  it("caso 4 (R322/R323/R341): K1 «La central debe» 3000.00, neto 9500.00; «Debe llegar» 6500.00 y pago 5500.00", () => {
    expect(m().consolidacion).toEqual({
      centralDebe: "3000.00",
      neto: "9500.00",
      paraLaCentral: "6500.00",
      pago: "5500.00",
    });
  });

  it("caso 5 (R317/R340/R341): NS devengo 2500.00 + pago_satelite 2500.00; VS con la regla de la 44; NS0 sin libro", () => {
    const { libros } = m();
    expect(libros.NS.mensajero).toEqual([
      { tipo: "devengo", categoria: "pago_devengado", monto: "2500.00" },
      { tipo: "pago", categoria: "pago_satelite", monto: "2500.00" },
    ]);
    expect(libros.VS.mensajero).toEqual([
      { tipo: "devengo", categoria: "pago_devengado", monto: "3000.00" },
      { tipo: "pago", categoria: "pago_efectivo", monto: "2000.00" },
    ]);
    expect(libros.NS0.mensajero).toEqual([]);
    expect(libros.NS0.caja.filter((f) => f.categoria === "egreso_pago_mensajero")).toEqual([]);
    expect(libros.NS.caja).toEqual(CAJA_NS);
    expect(libros.VS.caja.filter((f) => f.categoria === "egreso_pago_mensajero")).toEqual([
      { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "3000.00" },
    ]);
  });

  it("caso 5 (R317/R345): las dos filas de NS van fechadas en el instante de la conciliacion", () => {
    const { fechasNS } = m();
    expect(fechasNS.fechas).toHaveLength(2);
    for (const f of fechasNS.fechas) expect(f).toBe(fechasNS.conciliadoAt);
  });

  it("caso 6 (R319): tras conciliar, NS 0.00 (en /cierres-admin y /cierre-dia), VS 1000.00; su cuenta por pagar 0.00", () => {
    const { pendientesDespues, pendienteNSMensajeroDespues, cuentaNS, ids } = m();
    expect(pendientesDespues[ids.NS]).toBe("0.00");
    expect(pendientesDespues[ids.VS]).toBe("1000.00");
    expect(pendienteNSMensajeroDespues).toBe("0.00");
    expect(cuentaNS).toEqual({ devengado: "2500.00", pagado: "2500.00", cuentaPorPagar: "0.00" });
  });

  it("caso 7 (R318): volver a asentar NS deja las mismas filas", () => {
    const { librosNSReasentado, libros } = m();
    expect(librosNSReasentado).toEqual(libros.NS);
  });

  it("caso 8 (R345): corregir el recibido no toca pago_satelite; desmarcar se niega con `con_asientos`", () => {
    const r = m();
    expect(r.pagoSateliteNS).toHaveLength(1);
    expect(r.pagoSateliteNS[0]).toContain('"monto":2500');
    expect(r.corregir).toBe("updated");
    expect(r.pagoSateliteTrasCorregir).toEqual(r.pagoSateliteNS);
    expect(r.revertir).toBe("con_asientos");
    expect(r.pagoSateliteTrasRevertir).toEqual(r.pagoSateliteNS);
  });

  it("caso 9 (R341): «Debe llegar» de NS 1500.00, premios 0.00, la tienda igual y la central no paga NS", () => {
    const r = m();
    expect(r.paraLaCentralNS).toBe("1500.00");
    expect(r.premiosNS).toBe("0.00");
    expect(r.libros.NS.tienda).toEqual(TIENDA);
    expect(r.libros.VS.tienda).toEqual(TIENDA);
    expect(r.pagoCentralContraNS).toBe("no_encontrado");
    expect(r.liquidacionesNS).toBe(0);
  });

  it("caso 10 (regresion de SLT-123): NC con solo el devengo 3000.00 y pendiente 3000.00", () => {
    const { libros, pendientesCentral, ids } = m();
    expect(libros.NC.mensajero).toEqual([{ tipo: "devengo", categoria: "pago_devengado", monto: "3000.00" }]);
    expect(pendientesCentral[ids.NC]).toBe("3000.00");
  });

  it("caso 11 (R333): la lectura se queda en la empresa: A ve NS 2500.00, B ve su 999.00", () => {
    const { empresa, ids } = m();
    expect(Object.keys(empresa.desdeA)).toHaveLength(2);
    expect(empresa.desdeA[ids.NS]).toBe("2500.00");
    expect(Object.values(empresa.desdeA).filter((v) => v === "0.00")).toHaveLength(1);
    expect(empresa.desdeASoloNC).toEqual({ [ids.NC]: "0.00" });
    expect(empresa.desdeB).toEqual({ [ids.NS]: "999.00" });
  });

  it("caso 12 (R329): «Pagado por la satelite» en el estado de cuenta; detalle por guia 2500.00; analitica y catalogo", () => {
    const r = m();
    expect(r.conceptosNS).toEqual(["Pagado por la satélite 2500.00", "Pago devengado 2500.00"].sort());
    expect(r.detalleNS).toEqual({ status: "ok", monto: "2500.00", total: 1, aportes: "2500.00" });
    // K1 escribe devengo 2500 (NS) + 3000 (VS) y pago 2500 (NS, pago_satelite) + 2000 (VS, pago_efectivo).
    expect(r.analitica).toEqual({ devengo: "5500.00", pago: "4500.00" });
    expect(getMetrica("cuenta_por_pagar_mensajero")?.definicion).toMatchObject({
      categorias: expect.arrayContaining(["pago_satelite"]),
    });
  });

  it("caso 13 (R334): el listado de Z1 lee lo pagado por la satelite UNA vez, con NS y NS0", () => {
    const { llamadasLectura, ids } = m();
    expect(llamadasLectura).toEqual([[ids.NS, ids.NS0].sort()]);
  });

  it("caso 2 (R336): si la aprobacion de un cierre de satelite lanza despues de aprobar, queda `solicitado` y sin marca", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_satelite");
      let error: unknown = null;
      try {
        await aprobarCon(admin(tx, { fallarEnIndemnizacion: true }), k, k.aprobador);
      } catch (e) {
        error = e;
      }
      const fila = await tx.cierreDia.findUniqueOrThrow({
        where: { id: k.cierreId },
        select: { estado: true, pagoIndependienteEfectivo: true },
      });
      return { error, fila };
    });
    expect(r.error).toBeInstanceOf(FalloForzado);
    expect(r.fila).toEqual({ estado: "solicitado", pagoIndependienteEfectivo: false });
  }, 120_000);
});
