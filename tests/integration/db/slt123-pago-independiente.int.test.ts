import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IncentivoTxRunner } from "@/lib/interfaces/services/IIncentivoMensajeroService";
import type { LiquidacionTxRunner } from "@/lib/interfaces/services/ILiquidacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { WalletMensajeroFeedTxClient } from "@/lib/interfaces/services/IWalletMensajeroFeedService";
import { asentarCierreDia } from "@/lib/repositories/_shared/asientos-cierre-dia";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { LiquidacionRepartoRepository } from "@/lib/repositories/LiquidacionRepartoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CajaIncentivoMensajeroFeedService } from "@/lib/services/CajaIncentivoMensajeroFeedService";
import { CajaPagoTiendaFeedService } from "@/lib/services/CajaPagoTiendaFeedService";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { IncentivoMensajeroService } from "@/lib/services/IncentivoMensajeroService";
import { LiquidacionService } from "@/lib/services/LiquidacionService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  INDEMNIZACION_SLT73,
  consolidar,
  filasDeLibros,
  marcarRecibido,
  sembrarCierreAprobable,
  type CierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";

/**
 * SLT-123 «Pago al mensajero independiente del efectivo» (T6.1; design §11.1) — los ocho casos contra
 * Postgres real, con los servicios y repositorios REALES, en una transaccion que SIEMPRE se revierte.
 *
 * La siembra de cada cierre es la de `_fixtures/slt73-cierre-aprobable.ts` (una entrega de 20 000,00 en
 * efectivo y un incidente indemnizado con 6 000,00); aqui se fijan P y E de cada uno:
 *
 *   V1  central   marca false  P 3 000 / E 1 000  aprobado por la fixture con el feed de `dev`
 *                                                  (`asentarCierreDia` con la marca en `false`),
 *                                                  `resuelto_at` FIJO 2026-11-13 (posterior al despliegue)
 *   N1  central   —            P 3 000 / E 5 000  `solicitado`, se aprueba con `resolverCierre` real
 *   V2  satelite  marca false  P 6 000 / E     0  aprobado por la fixture, consolidado y conciliado real
 *   S1  satelite  —            P 2 500 / E 4 000  se aprueba, consolida y concilia con el codigo real
 *                                                  (el caso «entre los dos merges», design §13).
 *                                                  SLT-139 (R336): la aprobacion real ya le pone la
 *                                                  marca; se mide y despues se le devuelve a `false`
 *                                                  (un cierre aprobado con el codigo de SLT-123, que es
 *                                                  lo que este caso caracteriza, R340)
 *   N3  central   —            P     0 / E 1 000  `solicitado`, se aprueba (P = 0)
 *   R1  central   —            P 3 000 / E 5 000  `solicitado`, se RECHAZA
 *
 * Los importes esperados van ESCRITOS A MANO (memoria «asercion contra su propia fuente»).
 *
 * El cliente de los servicios de aprobacion es `clienteVigilado`: dentro de una `$transaction`, tocar
 * `cierreDia` por el cliente de FUERA (`this.prisma` en vez de `tx`) lanza. Con el savepoint del arnes
 * las dos rutas van por la misma conexion y un rollback las revertiria igual; sin esta vigilancia una
 * escritura de la marca fuera de la transaccion (mutacion M13) pasaria en verde aqui y en produccion
 * dejaria la marca sin su aprobacion.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

/** V1 se aprobo «despues del despliegue» con el codigo viejo: una regla por fecha la confundiria (M8). */
const RESUELTO_V1 = new Date("2026-11-13T12:00:00.000Z");

/** Caja de un cierre de la central de esta siembra con P = 3 000 (V1 y N1 por igual, R314/R331). */
const CAJA_P3000 = [
  { tipo: "egreso", categoria: "egreso_indemnizacion", monto: "6000.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "3000.00" },
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

/**
 * `clienteConSavepoint(tx)` con una vigilancia: mientras corre una `$transaction`, pedir `cierreDia` al
 * cliente de FUERA lanza `EscrituraFueraDeTx`. El cliente que recibe el callback (el de dentro) no
 * esta vigilado.
 */
function clienteVigilado(tx: TxDeTest): PrismaClient {
  const base = clienteConSavepoint(tx);
  let dentro = 0;
  const vigilado: unknown = new Proxy(base as object, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        const original = Reflect.get(objetivo, prop) as (fn: (t: unknown) => unknown) => Promise<unknown>;
        return async (fn: (t: unknown) => unknown) => {
          dentro += 1;
          try {
            return await original(fn);
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

/** El feed REAL del mensajero que, ademas, anota la marca que ve al asentar (lee la misma fila). */
class FeedQueAnota extends WalletMensajeroFeedService {
  marcaVista: boolean | null = null;
  constructor(private readonly fallar: boolean) {
    super();
  }
  override async construirMovimientosDePago(cierreId: string, tx: WalletMensajeroFeedTxClient) {
    const fila = await tx.cierreDia.findUnique({
      where: { id: cierreId },
      select: { pagoIndependienteEfectivo: true },
    });
    this.marcaVista = fila?.pagoIndependienteEfectivo ?? null;
    if (this.fallar) throw new Error("fallo forzado despues de escribir la marca (SLT-123 caso 2)");
    return super.construirMovimientosDePago(cierreId, tx);
  }
}

/** `CierresAdminService` cableado como su composition root, sobre el cliente vigilado. */
function adminVigilado(tx: TxDeTest, feedMensajero: WalletMensajeroFeedService = new WalletMensajeroFeedService()) {
  const c = clienteVigilado(tx);
  const mensajeroRepo = new PagoMensajeroMovimientoRepository(c);
  return new CierresAdminService(
    new CierresAdminRepository(
      c,
      new WalletMovimientoRepository(c),
      new WalletFeedService(),
      new WalletTiendaMovimientoRepository(c),
      new WalletTiendaFeedService(),
      mensajeroRepo,
      feedMensajero,
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

function incentivos(tx: TxDeTest): IncentivoMensajeroService {
  const c = clienteConSavepoint(tx);
  const runTx = ((fn: (t: never) => Promise<unknown>) =>
    c.$transaction((t) => fn(t as never))) as unknown as IncentivoTxRunner;
  return new IncentivoMensajeroService(
    new LiquidacionPagoRepository(c),
    new PagoMensajeroMovimientoRepository(c),
    new CajaIncentivoMensajeroFeedService(new WalletMovimientoRepository(c)),
    runTx,
    undefined,
    reglasPaisFijas(),
  );
}

async function fijarPE(tx: TxDeTest, cierreId: string, P: string, E: string): Promise<void> {
  await tx.cierreDia.update({
    where: { id: cierreId },
    data: {
      totalPagoMensajero: new Prisma.Decimal(P),
      totalEfectivo: new Prisma.Decimal(E),
      totalGeneral: new Prisma.Decimal(E),
    },
  });
}

/** Un cierre aprobado ANTES del despliegue: lo que hacia la aprobacion de `dev`, sin pasar por ella. */
async function aprobarComoDev(tx: TxDeTest, k: CierreAprobable, resueltoAt: Date): Promise<void> {
  await tx.gestionOrden.update({
    where: { id: k.gestionIncidenteId },
    data: { indemnizacion: new Prisma.Decimal(INDEMNIZACION_SLT73) },
  });
  await tx.cierreDia.update({
    where: { id: k.cierreId },
    data: { estado: "aprobado", resueltoPor: k.aprobador.usuarioId, resueltoAt },
  });
}

async function aprobarCon(admin: CierresAdminService, k: CierreAprobable): Promise<string> {
  const r = await admin.aprobarCierre(
    k.cierreId,
    k.aprobador,
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

/** Lo pendiente de cada cierre tal como lo pinta `/cierres-admin` (historico, `conPendiente`). */
async function pendientes(admin: CierresAdminService, actor: Actor): Promise<Record<string, string | null>> {
  const r = await admin.listarCierresAdmin(actor);
  if (r.status !== "ok") throw new Error(`listarCierresAdmin: ${r.status}`);
  return Object.fromEntries(
    [...r.historico, ...r.pendientes].map((c) => [c.cierreId, c.pendientePagoMensajero]),
  );
}

async function cuentaPorPagar(tx: TxDeTest, mensajeroId: string): Promise<string> {
  const a = await new PagoMensajeroMovimientoRepository(clienteConSavepoint(tx)).agregarCuentaPorPagar(mensajeroId, {});
  return new Prisma.Decimal(a.devengado).sub(new Prisma.Decimal(a.pagado)).toFixed(2);
}

/** R326: todas las filas de dinero de los cierres viejos, enteras y en orden estable. */
async function fotoViejos(tx: TxDeTest, ids: string[]): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT 'cierre_dia ' || row_to_json(c)::text AS l FROM cierre_dia c WHERE c.id = ANY($1::text[])
     UNION ALL SELECT 'pmm ' || row_to_json(m)::text FROM pago_mensajero_movimiento m
       WHERE m.origen_tipo = 'cierre_dia' AND m.origen_id = ANY($1::text[])
     UNION ALL SELECT 'wm ' || row_to_json(w)::text FROM wallet_movimiento w
       WHERE w.origen_tipo = 'cierre_dia' AND w.origen_id = ANY($1::text[])
     UNION ALL SELECT 'wtm ' || row_to_json(t)::text FROM wallet_tienda_movimiento t
       WHERE t.origen_tipo = 'cierre_dia' AND t.origen_id = ANY($1::text[])
     UNION ALL SELECT 'lp ' || row_to_json(p)::text FROM liquidacion_pago p WHERE p.cierre_id = ANY($1::text[])
     ORDER BY 1`,
    ids,
  );
  return filas.map((f) => f.l);
}

interface Medida {
  ids: { V1: string; N1: string; V2: string; S1: string; N3: string; R1: string };
  aprobaciones: Record<"N1" | "S1" | "N3", string>;
  rechazo: string;
  marcas: Record<string, boolean>;
  libros: Record<"V1" | "N1" | "V2" | "S1" | "N3", Awaited<ReturnType<typeof filasDeLibros>>>;
  marcaVistaPorElFeedN1: boolean | null;
  pendientesCentral: Record<string, string | null>;
  pendientesV2: Record<string, string | null>;
  pendientesS1: Record<string, string | null>;
  centralDebeS1AntesDeConsolidar: string;
  paraLaCentralS1: string | null;
  repartoN1: Record<string, string>;
  repartoV1: Record<string, string>;
  cuentaN1: { antes: string; trasAprobar: string; trasPagar: string; trasAnular: string };
  pagoN1: { status: string; restante?: string };
  pendienteN1TrasPagar: string | null;
  anulacionN1: { status: string; restante?: string };
  incentivoN1: string;
  marcasTrasAcciones: Record<string, boolean>;
  premios: Record<string, string>;
  fotoAntes: string[];
  fotoDespues: string[];
}

describeSiHayBase("SLT-123 — pago al mensajero independiente del efectivo, contra Postgres real", () => {
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

        // ── Los cierres VIEJOS, en su estado final de `dev` ─────────────────────────────────
        const V1 = await sembrarCierreAprobable(tx, "bodega_central");
        await fijarPE(tx, V1.cierreId, "3000.00", "1000.00");
        await aprobarComoDev(tx, V1, RESUELTO_V1);
        await asentarCierreDia(clienteConSavepoint(tx), V1.cierreId); // el feed de `dev`: marca false

        const V2 = await sembrarCierreAprobable(tx, "bodega_satelite");
        await fijarPE(tx, V2.cierreId, "6000.00", "0.00");
        await aprobarComoDev(tx, V2, new Date("2026-11-10T12:00:00.000Z"));
        const bodegaV2 = await consolidar(tx, V2.adminSatelite);
        const conciliaV2 = await marcarRecibido(tx, bodegaV2, "20000.00", V2.maestroId);
        if (conciliaV2 !== "updated" && conciliaV2 !== "ok") {
          throw new Error(`no se concilio V2: ${conciliaV2}`);
        }

        const fotoAntes = await fotoViejos(tx, [V1.cierreId, V2.cierreId]);

        // ── Los cierres que pasan por el codigo NUEVO ───────────────────────────────────────
        const N1 = await sembrarCierreAprobable(tx, "bodega_central");
        await fijarPE(tx, N1.cierreId, "3000.00", "5000.00");
        const S1 = await sembrarCierreAprobable(tx, "bodega_satelite");
        await fijarPE(tx, S1.cierreId, "2500.00", "4000.00");
        const N3 = await sembrarCierreAprobable(tx, "bodega_central");
        await fijarPE(tx, N3.cierreId, "0.00", "1000.00");
        const R1 = await sembrarCierreAprobable(tx, "bodega_central");
        await fijarPE(tx, R1.cierreId, "3000.00", "5000.00");

        const cuentaAntes = await cuentaPorPagar(tx, await mensajeroDe(tx, N1.cierreId));

        const feedN1 = new FeedQueAnota(false);
        const aprobacionN1 = await aprobarCon(adminVigilado(tx, feedN1), N1);
        const aprobacionS1 = await aprobarCon(adminVigilado(tx), S1);
        const aprobacionN3 = await aprobarCon(adminVigilado(tx), N3);
        const rechazo = (await adminVigilado(tx).rechazarCierre(R1.cierreId, "Faltan comprobantes", R1.aprobador)).status;

        const mensajeroN1 = await mensajeroDe(tx, N1.cierreId);
        const cuentaTrasAprobar = await cuentaPorPagar(tx, mensajeroN1);

        const marcas = {
          V1: await marca(tx, V1.cierreId),
          N1: await marca(tx, N1.cierreId),
          V2: await marca(tx, V2.cierreId),
          S1: await marca(tx, S1.cierreId),
          N3: await marca(tx, N3.cierreId),
          R1: await marca(tx, R1.cierreId),
        };
        // SLT-139 (R336 sustituye a R310): S1 sale de la aprobacion CON la marca. Para seguir
        // caracterizando «aprobado entre los dos merges» (codigo de SLT-123, marca `false`) se le
        // devuelve a `false`: desde aqui S1 es un cierre VIEJO de satelite (R340).
        await tx.cierreDia.update({ where: { id: S1.cierreId }, data: { pagoIndependienteEfectivo: false } });

        // S1 antes de consolidar: «La central debe» de su consolidacion (E 4 000 >= P 2 500).
        const bodegaService = new CierreBodegaService(
          new CierreBodegaRepository(clienteConSavepoint(tx)),
          new OrdenRepository(clienteConSavepoint(tx)),
          reglasPaisFijas(),
        );
        const consolidacionS1 = await bodegaService.listarConsolidacion(S1.adminSatelite);
        if (consolidacionS1.status !== "ok") throw new Error(`listarConsolidacion S1: ${consolidacionS1.status}`);
        // R331: la fila de «A consolidar» de S1, con su «Debe llegar a la central» (`paraLaCentral`).
        const colaS1 = await bodegaService.listarConsolidablesPaginado({ page: 1, pageSize: 50 }, S1.adminSatelite);
        if (colaS1.status !== "ok") throw new Error(`listarConsolidablesPaginado S1: ${colaS1.status}`);
        const bodegaS1 = await consolidar(tx, S1.adminSatelite);
        const conciliaS1 = await marcarRecibido(tx, bodegaS1, "20000.00", S1.maestroId);
        if (conciliaS1 !== "updated" && conciliaS1 !== "ok") throw new Error(`no se concilio S1: ${conciliaS1}`);

        const libros = {
          V1: await filasDeLibros(tx, V1.cierreId),
          N1: await filasDeLibros(tx, N1.cierreId),
          V2: await filasDeLibros(tx, V2.cierreId),
          S1: await filasDeLibros(tx, S1.cierreId),
          N3: await filasDeLibros(tx, N3.cierreId),
        };

        const maestro = N1.aprobador;
        const pendientesCentral = await pendientes(adminVigilado(tx), maestro);
        const pendientesV2 = await pendientes(adminVigilado(tx), V2.adminSatelite);
        const pendientesS1 = await pendientes(adminVigilado(tx), S1.adminSatelite);
        const premiosLeidos = await new PagoMensajeroMovimientoRepository(clienteConSavepoint(tx)).sumarPremiosVivosPorCierre(
          [V1.cierreId, N1.cierreId],
        );

        // ── Caso 4 y 7: pagar, anular e incentivar sobre N1 ─────────────────────────────────
        const pago = await liquidacion(tx).registrarPagoMensajero(
          {
            claveIdempotencia: "1a2b3c4d-0000-4000-8000-000000000123",
            cierreId: N1.cierreId,
            monto: "3000.00",
            metodo: "SINPE",
            referencia: "SLT123",
            nota: "Pago del cierre nuevo",
            fechaPago: "2026-11-14",
          },
          maestro,
        );
        const cuentaTrasPagar = await cuentaPorPagar(tx, mensajeroN1);
        const pendienteN1TrasPagar = (await pendientes(adminVigilado(tx), maestro))[N1.cierreId] ?? null;
        const pagoId = (
          await tx.liquidacionPago.findFirstOrThrow({ where: { cierreId: N1.cierreId }, select: { id: true } })
        ).id;
        const anulacion = await liquidacion(tx).anularPago({ pagoId, motivo: "Monto mal registrado" }, maestro);
        const cuentaTrasAnular = await cuentaPorPagar(tx, mensajeroN1);
        // R321 (review 1): el reparto «Pagar» de /wallet/mensajeros con el repositorio REAL
        // (`listarCierresImputablesEnAlcance`), con N1 otra vez en su pendiente tras la anulacion.
        const repartoN1 = await repartoDe(tx, mensajeroN1, maestro);
        const repartoV1 = await repartoDe(tx, await mensajeroDe(tx, V1.cierreId), maestro);
        const incentivo = await incentivos(tx).registrar(
          {
            mensajeroId: mensajeroN1,
            monto: "500.00",
            motivo: "Incentivo SLT-123",
            claveIdempotencia: "1a2b3c4d-0000-4000-8000-000000000124",
          },
          maestro,
        );

        const marcasTrasAcciones = {
          V1: await marca(tx, V1.cierreId),
          N1: await marca(tx, N1.cierreId),
          V2: await marca(tx, V2.cierreId),
          S1: await marca(tx, S1.cierreId),
          R1: await marca(tx, R1.cierreId),
        };

        const fotoDespues = await fotoViejos(tx, [V1.cierreId, V2.cierreId]);

        return {
          ids: { V1: V1.cierreId, N1: N1.cierreId, V2: V2.cierreId, S1: S1.cierreId, N3: N3.cierreId, R1: R1.cierreId },
          aprobaciones: { N1: aprobacionN1, S1: aprobacionS1, N3: aprobacionN3 },
          rechazo,
          marcas,
          libros,
          marcaVistaPorElFeedN1: feedN1.marcaVista,
          pendientesCentral,
          pendientesV2,
          pendientesS1,
          centralDebeS1AntesDeConsolidar: consolidacionS1.totalCentralDebeAgregado,
          paraLaCentralS1:
            colaS1.items.find((c) => c.cierreDiaId === S1.cierreId)?.paraLaCentral ?? null,
          repartoN1,
          repartoV1,
          cuentaN1: { antes: cuentaAntes, trasAprobar: cuentaTrasAprobar, trasPagar: cuentaTrasPagar, trasAnular: cuentaTrasAnular },
          pagoN1: pago as { status: string; restante?: string },
          pendienteN1TrasPagar,
          anulacionN1: anulacion as { status: string; restante?: string },
          incentivoN1: incentivo.status,
          marcasTrasAcciones,
          premios: premiosLeidos,
          fotoAntes,
          fotoDespues,
        };
      });
    } catch (e) {
      fallo = e;
    }
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: cada aprobacion y el rechazo salieron ok, y los viejos tienen filas que fotografiar", () => {
    const r = m();
    expect(r.aprobaciones).toEqual({ N1: "ok", S1: "ok", N3: "ok" });
    expect(r.rechazo).toBe("ok");
    expect(r.fotoAntes.length).toBeGreaterThan(10);
  });

  it("caso 1 (R326): las filas de dinero de V1 y V2 son identicas antes y despues de todo", () => {
    const r = m();
    expect(r.fotoDespues).toEqual(r.fotoAntes);
  });

  it("caso 2 (R310 -> SLT-139 R336): N1 y S1 aprobados llevan la marca (todo destino); V1, V2 y R1 no", () => {
    expect(m().marcas).toEqual({ V1: false, N1: true, V2: false, S1: true, N3: true, R1: false });
  });

  it("caso 2 (R310): la marca ya estaba escrita cuando el feed asento N1 (va ANTES de los asientos)", () => {
    expect(m().marcaVistaPorElFeedN1).toBe(true);
  });

  it("caso 2 (R313/R314): libro de N1 = solo el devengo 3000.00; caja con el egreso de 3000.00", () => {
    const { libros } = m();
    expect(libros.N1.mensajero).toEqual([{ tipo: "devengo", categoria: "pago_devengado", monto: "3000.00" }]);
    expect(libros.N1.caja).toEqual(CAJA_P3000);
  });

  it("caso 3 (R313/R315/R325/R327): pendiente V1 2000.00, N1 3000.00, N3 0.00; N3 sin libro del mensajero", () => {
    const { pendientesCentral, ids, libros } = m();
    expect(pendientesCentral[ids.V1]).toBe("2000.00");
    expect(pendientesCentral[ids.N1]).toBe("3000.00");
    expect(pendientesCentral[ids.N3]).toBe("0.00");
    expect(libros.N3.mensajero).toEqual([]);
    // V1 conserva el libro de la 44 que escribio `dev`.
    expect(libros.V1.mensajero).toEqual([
      { tipo: "devengo", categoria: "pago_devengado", monto: "3000.00" },
      { tipo: "pago", categoria: "pago_efectivo", monto: "1000.00" },
    ]);
  });

  it("caso 4 (R316/R328): la cuenta por pagar sube 3000.00 al aprobar y baja 3000.00 al pagar; pendiente 0.00", () => {
    const r = m();
    expect(r.cuentaN1.antes).toBe("0.00");
    expect(r.cuentaN1.trasAprobar).toBe("3000.00");
    expect(r.pagoN1).toMatchObject({ status: "ok", restante: "0.00" });
    expect(r.cuentaN1.trasPagar).toBe("0.00");
    expect(r.pendienteN1TrasPagar).toBe("0.00");
  });

  it("R321: anular el pago de 3 000 contra N1 devuelve restante 3000.00 y la cuenta vuelve a 3000.00", () => {
    const r = m();
    expect(r.anulacionN1).toMatchObject({ status: "ok", restante: "3000.00" });
    expect(r.cuentaN1.trasAnular).toBe("3000.00");
  });

  it("caso 5 (R325): V2 conciliado: devengo 6000.00 sin pago_efectivo (E = 0) y pendiente 6000.00", () => {
    const { libros, pendientesV2, ids } = m();
    expect(libros.V2.mensajero).toEqual([{ tipo: "devengo", categoria: "pago_devengado", monto: "6000.00" }]);
    expect(pendientesV2[ids.V2]).toBe("6000.00");
  });

  it("caso 6 (R325/R327, SLT-139 R340): S1 viejo (marca devuelta a false); «La central debe» 0.00; conciliado con la regla de la 44; pendiente 0.00", () => {
    const { libros, pendientesS1, ids, centralDebeS1AntesDeConsolidar } = m();
    expect(centralDebeS1AntesDeConsolidar).toBe("0.00");
    expect(libros.S1.mensajero).toEqual([
      { tipo: "devengo", categoria: "pago_devengado", monto: "2500.00" },
      { tipo: "pago", categoria: "pago_efectivo", monto: "2500.00" },
    ]);
    expect(pendientesS1[ids.S1]).toBe("0.00");
  });

  it("caso 7 (R311): rechazar, conciliar, pagar, anular e incentivar no tocan la marca", () => {
    const r = m();
    expect(r.incentivoN1).toBe("ok");
    expect(r.marcasTrasAcciones).toEqual({ V1: false, N1: true, V2: false, S1: false, R1: false });
  });

  it("caso 8 (R331): caja y tienda del cierre nuevo iguales a las del viejo de mismos snapshots; premios 0.00", () => {
    const { libros, premios, ids } = m();
    expect(libros.V1.caja).toEqual(CAJA_P3000);
    expect(libros.N1.caja).toEqual(libros.V1.caja);
    expect(libros.V1.tienda).toEqual(TIENDA);
    expect(libros.N1.tienda).toEqual(TIENDA);
    expect(premios).toEqual({ [ids.V1]: "0.00", [ids.N1]: "0.00" });
  });

  it("caso 8 (R331): «Debe llegar a la central» de S1, aprobado con el codigo nuevo, = general 4 000 − P 2 500 = 1500.00", () => {
    expect(m().paraLaCentralS1).toBe("1500.00");
  });

  it("R321: el reparto «Pagar» con el repositorio real imputa 3000.00 a N1 (P) y 2000.00 a V1 (regla vieja)", () => {
    const { repartoN1, repartoV1, ids } = m();
    expect(repartoN1).toEqual({ [ids.N1]: "3000.00" });
    expect(repartoV1).toEqual({ [ids.V1]: "2000.00" });
  });

  it("caso 2 (R310): si la transaccion lanza despues de escribir la marca, N1 sigue `solicitado` y sin marca", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const k = await sembrarCierreAprobable(tx, "bodega_central");
      await fijarPE(tx, k.cierreId, "3000.00", "5000.00");
      const feed = new FeedQueAnota(true);
      let error: unknown = null;
      try {
        await aprobarCon(adminVigilado(tx, feed), k);
      } catch (e) {
        error = e;
      }
      const fila = await tx.cierreDia.findUniqueOrThrow({
        where: { id: k.cierreId },
        select: { estado: true, pagoIndependienteEfectivo: true },
      });
      return { error, marcaVista: feed.marcaVista, fila, libros: await filasDeLibros(tx, k.cierreId) };
    });
    expect(String(r.error)).toContain("fallo forzado");
    expect(r.marcaVista, "el feed no vio la marca escrita: la escritura no va antes de los asientos").toBe(true);
    expect(r.fila).toEqual({ estado: "solicitado", pagoIndependienteEfectivo: false });
    expect(r.libros).toEqual({ caja: [], tienda: [], mensajero: [] });
  }, 120_000);
});

/** Imputable de cada cierre en el reparto «Pagar» (`previsualizarRepartoMensajero`), con el monto holgado. */
async function repartoDe(tx: TxDeTest, mensajeroId: string, actor: Actor): Promise<Record<string, string>> {
  const r = await liquidacion(tx).previsualizarRepartoMensajero({ mensajeroId, monto: "100000.00" }, actor);
  if (r.status !== "ok") throw new Error(`previsualizarRepartoMensajero: ${r.status}`);
  return Object.fromEntries(r.previsualizacion.imputaciones.map((i) => [i.cierreId, i.pendienteActual]));
}

async function mensajeroDe(tx: TxDeTest, cierreId: string): Promise<string> {
  return (await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { mensajeroId: true } }))
    .mensajeroId;
}
