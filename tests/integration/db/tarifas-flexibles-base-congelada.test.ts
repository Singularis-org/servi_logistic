import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TarifaConcepto } from "@prisma/client";

import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ContextoPagoGestion, TarifaPago } from "@/lib/types/tarifa-flexible";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-52 T5.5 (design §13, R28, R52-R55) — LA BASE DEL % DEL PAGO SALE DEL COBRO CONGELADO, CONTRA
// POSTGRES REAL. La base del pago al mensajero y a la satelite en porcentaje es el flete sin IVA que
// ESE cierre le cobra a la tienda por ESA gestion, y no lo que diria hoy el resolver con los valores
// y el `monto_cobrar` vivos. Se mide en los cuatro caminos que escriben el pago dentro de un cierre:
// la correccion 398 (R52), la re-solicitud 477 (R53), los modelos cruzados (R54) y la creacion del
// cierre por la solicitud y por el corte diario (R55).
//
// Por que contra Postgres: lo que decide es que se lea el `cierre_detail` y su
// `cierre_detail_concepto` de ESA orden en ESE cierre dentro de la tx; un doble no ve ese `select`.
//
// TODO DENTRO DE UNA TRANSACCION QUE SIEMPRE SE REVIERTE. El codigo de produccion corre con el rol
// `servi_app` y la empresa fijada (`comoApp`); siembras, mutaciones y lecturas de control como dueño.
// SIN DATOS FALLA: cada caso afirma primero lo que sembro y la siembra LANZA sin geografia/catalogos.
// Los esperados son LITERALES escritos a mano junto a su aritmetica.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };
const RECHAZO = "devolucion_a_origen_por_rechazo" as const;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

// --------------------------------------------------------------------------------------------
// Siembra
// --------------------------------------------------------------------------------------------

let siguienteGuia = 950_000_000 + Math.floor(Math.random() * 20_000_000);

interface Escenario {
  A: string;
  fks: FksDeOrden;
  Z: string;
  M: string;
  admin: string;
  d1: string;
  ordenId: string;
  gestionId: string;
  /** id de cada `tarifa_valor` sembrado, por etiqueta. */
  v: Record<string, string>;
}

async function nuevaOrden(tx: TxDeTest, fks: FksDeOrden, distritoId: string, monto: string): Promise<string> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT52B-${randomUUID().slice(0, 12)}`,
      destinatario: "Base congelada SLT-52",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: fks.estatusId,
      tiendaId: fks.tiendaId,
      zonaId: fks.zonaId,
      provinciaId: fks.provinciaId,
      cantonId: fks.cantonId,
      distritoId,
      montoCobrar: new Prisma.Decimal(monto),
      cobraComision: false,
    },
    select: { id: true },
  });
  return orden.id;
}

async function gestion(
  tx: TxDeTest,
  ordenId: string,
  mensajeroId: string,
  resultado: "entregado" | typeof RECHAZO,
  monto: string,
): Promise<string> {
  const g = await tx.gestionOrden.create({
    data:
      resultado === "entregado"
        ? {
            ordenId,
            mensajeroId,
            resultado,
            montoRecibido: new Prisma.Decimal(monto),
            pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(monto) }] },
          }
        : { ordenId, mensajeroId, resultado, motivo: "no lo quiso" },
    select: { id: true },
  });
  return g.id;
}

interface ValorSembrado {
  concepto: TarifaConcepto;
  modo: "monto" | "porcentaje";
  valor: string;
  /** Sin grupo = valor de la zona. */
  grupoId?: string | null;
}

async function valor(tx: TxDeTest, e: Pick<Escenario, "Z" | "v">, etiqueta: string, d: ValorSembrado) {
  const fila = await tx.tarifaValor.create({
    data: {
      concepto: d.concepto,
      modo: d.modo,
      valor: d.valor,
      ivaPct: d.concepto.startsWith("tienda_") ? "13.00" : null,
      zonaId: e.Z,
      grupoId: d.grupoId ?? null,
    },
    select: { id: true },
  });
  e.v[etiqueta] = fila.id;
}

/** Empresa, zona Z (la central del test), distrito d1 en Z, mensajero, admin. Sin tarifas. */
async function sembrarBase(tx: TxDeTest) {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx);
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const admin = (await crearUsuarioDePrueba(tx, "admin")).id;
  const d1 = (await tx.distrito.findFirstOrThrow({ where: { cantonId: fks.cantonId }, select: { id: true } })).id;
  const Z = fks.zonaId;
  await tx.zonaDistrito.create({ data: { zonaId: Z, distritoId: d1 } });
  return { A, fks, Z, M, admin, d1, v: {} as Record<string, string> };
}

/**
 * La empresa en el modelo NUEVO, todo en el grupo G1 de Z (d1), pedido de 20000.00:
 *   tienda_flete_entregado 1500.00 (IVA 13 %)          tienda_flete_rechazo 10 % del pedido (A)
 *   mensajero_entregado    800.00                      mensajero_rechazo    50 % del flete sin IVA
 *   satelite_rechazo       25 % del flete sin IVA
 * Con el cobro congelado, la base de un rechazo es 10 % x 20000.00 = 2000.00: mensajero 1000.00 y
 * satelite 500.00. `conRechazo: false` siembra todo menos `tienda_flete_rechazo`.
 */
async function sembrarNuevo(tx: TxDeTest, opciones: { conRechazo: boolean }): Promise<Escenario & { G1: string }> {
  const b = await sembrarBase(tx);
  const g = await tx.grupoDistritos.create({ data: { zonaId: b.Z, nombre: "G1" }, select: { id: true } });
  await tx.grupoDistritosDistrito.create({ data: { grupoId: g.id, zonaId: b.Z, distritoId: b.d1 } });
  const G1 = g.id;
  await valor(tx, b, "FE", { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", grupoId: G1 });
  if (opciones.conRechazo) {
    await valor(tx, b, "FR", { concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: "10.00", grupoId: G1 });
  }
  await valor(tx, b, "ME", { concepto: "mensajero_entregado", modo: "monto", valor: "800.00", grupoId: G1 });
  await valor(tx, b, "MR", { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "50.00", grupoId: G1 });
  await valor(tx, b, "SR", { concepto: "satelite_rechazo", modo: "porcentaje", valor: "25.00", grupoId: G1 });
  const ordenId = await nuevaOrden(tx, b.fks, b.d1, "20000.00");
  const gestionId = await gestion(tx, ordenId, b.M, "entregado", "20000.00");
  return { ...b, G1, ordenId, gestionId };
}

async function afirmarSembrado(tx: TxDeTest, e: Escenario, valores: number) {
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(valores);
  expect(await tx.gestionOrden.count({ where: { mensajeroId: e.M, cierreId: null, anuladaAt: null } })).toBe(1);
}

// --------------------------------------------------------------------------------------------
// Produccion, con el rol de la app
// --------------------------------------------------------------------------------------------

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    // `enTransaccionRevertida` deja en `contextoActual` su empresa por defecto, no `org`: el catalogo
    // (SLT-44/SLT-65) pide `organizacion` por el id del contexto, y con la RLS de `org` no la hallaria.
    return await conEmpresa(org, fn);
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

function cierreDiaRepo(cli: PrismaClient) {
  return new CierreDiaRepository(cli, new TarifaVigenteRepository(cli));
}

type ResolvedorDePagos = Pick<TarifaZonaMensajeroRepository, "resolvePagos">;

/**
 * El resolver REAL del pago, que tras resolver ejecuta `despues` como dueño (fuera de la RLS) y
 * vuelve al rol de la app. Es «el valor cambia entre la resolucion del servicio y el congelado de
 * `crearCierre`» (R55), sin dobles en el camino del dinero. Guarda lo que resolvio.
 */
function resolverQueCambiaDespues(
  tx: TxDeTest,
  org: string,
  despues: () => Promise<void>,
): ResolvedorDePagos & { resuelto: Map<string, TarifaPago | null>[] } {
  const real = new TarifaZonaMensajeroRepository(clienteConSavepoint(tx));
  const resuelto: Map<string, TarifaPago | null>[] = [];
  return {
    resuelto,
    async resolvePagos(ctxs: readonly ContextoPagoGestion[]) {
      const r = await real.resolvePagos(ctxs);
      resuelto.push(r);
      await tx.$executeRawUnsafe("RESET ROLE");
      await despues();
      await comoApp(tx, org);
      return r;
    },
  };
}

function servicioCierre(cli: PrismaClient, e: Pick<Escenario, "Z">, pagos: ResolvedorDePagos) {
  return new CierreDiaService(
    cierreDiaRepo(cli),
    { findCentralZonaId: async () => e.Z } as never,
    {
      findUsuarioZonaId: async () => e.Z,
      findUsuarioVehiculoId: async () => null,
      findEstatusIdByValue: async () => null,
      findOrdenesEnCorreccion: async () => new Set<string>(),
      findBloqueoDetalle: async () => ({
        bloqueado: false,
        cierresAbiertos: 0,
        cierresPorReenviar: 0,
        aResolverPrimero: null,
        resolicitableMasViejo: null,
      }),
    } as never,
    {} as never,
    pagos as never,
  );
}

async function solicitar(
  tx: TxDeTest,
  e: Pick<Escenario, "A" | "Z" | "M">,
  pagos: ResolvedorDePagos = new TarifaZonaMensajeroRepository(clienteConSavepoint(tx)),
) {
  const actor: Actor = { usuarioId: e.M, rol: "mensajero" };
  return comoEmpresa(tx, e.A, () => servicioCierre(clienteConSavepoint(tx), e, pagos).solicitarCierre(actor));
}

async function solicitarNuevo(tx: TxDeTest, e: Pick<Escenario, "A" | "Z" | "M">): Promise<string> {
  const r = await solicitar(tx, e);
  if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) {
    throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(r)}`);
  }
  return r.cierreId;
}

function repoAdmin(cli: PrismaClient) {
  return new CierresAdminRepository(cli, ...([{}, {}, {}, {}, {}, {}, {}] as [never, never, never, never, never, never, never]));
}

/** La 398 como la llama produccion, con el rol de la app. La orden pasa antes a `entregado`. */
async function corregirARechazada(tx: TxDeTest, e: Escenario) {
  const entregada = await tx.orderStatus.findUniqueOrThrow({ where: { value: "entregado" }, select: { id: true } });
  const rechazada = await tx.orderStatus.findUniqueOrThrow({ where: { value: RECHAZO }, select: { id: true } });
  await tx.orden.update({ where: { id: e.ordenId }, data: { estatusId: entregada.id } });
  return comoEmpresa(tx, e.A, () =>
    repoAdmin(clienteConSavepoint(tx)).corregirResultadoGestionEnCierre({
      gestionId: e.gestionId,
      alcance: ALCANCE_CENTRAL,
      motivo: "la tienda dice que lo rechazaron",
      corregidoPor: e.admin,
      estatusEntregadaId: entregada.id,
      estatusRechazadaId: rechazada.id,
    }),
  );
}

// --------------------------------------------------------------------------------------------
// Lecturas de control, como dueño
// --------------------------------------------------------------------------------------------

const txt = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));

async function pagosCongelados(tx: TxDeTest, gestionIds: string[]) {
  const filas = await tx.gestionPagoCongelado.findMany({
    where: { gestionOrdenId: { in: gestionIds } },
    select: { gestionOrdenId: true, actor: true, concepto: true, modo: true, valor: true, base: true, importe: true },
  });
  return filas
    .map((f) => ({
      gestion: f.gestionOrdenId,
      actor: f.actor,
      concepto: f.concepto,
      modo: f.modo,
      valor: txt(f.valor),
      base: txt(f.base),
      importe: txt(f.importe),
    }))
    .sort((a, b) => `${a.gestion}${a.actor}`.localeCompare(`${b.gestion}${b.actor}`));
}

async function columnas(tx: TxDeTest, gestionId: string) {
  const g = await tx.gestionOrden.findUniqueOrThrow({
    where: { id: gestionId },
    select: { resultado: true, pagoMensajero: true, ingresoBodegaRechazo: true },
  });
  return { resultado: g.resultado, pago: txt(g.pagoMensajero), ingreso: txt(g.ingresoBodegaRechazo) };
}

async function totalesDePago(tx: TxDeTest, cierreId: string) {
  const c = await tx.cierreDia.findUniqueOrThrow({
    where: { id: cierreId },
    select: { estado: true, totalPagoMensajero: true, totalIngresoBodegaRechazos: true },
  });
  return { estado: c.estado, pago: txt(c.totalPagoMensajero), ingreso: txt(c.totalIngresoBodegaRechazos) };
}

/** Lo que la APROBACION le cobra a la empresa por este cierre (feed de la caja, 42), con la app. */
async function cobroDeLaAprobacion(tx: TxDeTest, org: string, cierreId: string) {
  const movs = await comoEmpresa(tx, org, () =>
    new WalletFeedService().construirMovimientosDeIngreso(cierreId, tx),
  );
  return movs.map((m) => `${m.categoria}:${m.monto}`).sort();
}

const fila = (gestion: string, actor: "mensajero" | "satelite", concepto: string, valor: string, base: string, importe: string) => ({
  gestion,
  actor,
  concepto,
  modo: "porcentaje",
  valor,
  base,
  importe,
});

// --------------------------------------------------------------------------------------------
// Casos
// --------------------------------------------------------------------------------------------

describeSiHayBase("SLT-52 T5.5 — la base del % del pago sale del cobro congelado (Postgres real)", () => {
  it("R52 — la 398 corrige a rechazada: base = flete por rechazo CONGELADO (10 % de 20000), no el de hoy (20 % de 50000)", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx, { conRechazo: true });
      await afirmarSembrado(tx, e, 5);
      const cierreId = await solicitarNuevo(tx, e);
      // Despues de congelar: la tienda cambia su flete por rechazo de A (10 %) a B (20 %) y el
      // pedido de la orden pasa de 20000.00 a 50000.00. Con lo vivo la base seria 10000.00.
      await tx.tarifaValor.update({ where: { id: e.v.FR }, data: { valor: "20.00" } });
      await tx.orden.update({ where: { id: e.ordenId }, data: { montoCobrar: new Prisma.Decimal("50000.00") } });
      const vivo = await tx.tarifaValor.findUniqueOrThrow({ where: { id: e.v.FR }, select: { valor: true } });
      const congelado = await tx.cierreDetailConcepto.findFirstOrThrow({
        where: { cierreDetail: { cierreId, ordenId: e.ordenId }, concepto: "tienda_flete_rechazo" },
        select: { valor: true },
      });
      const salida = await corregirARechazada(tx, e);
      return {
        e,
        cierreId,
        vivo: txt(vivo.valor),
        congelado: txt(congelado.valor),
        salida: salida.status,
        pagos: await pagosCongelados(tx, [e.gestionId]),
        columnas: await columnas(tx, e.gestionId),
        totales: await totalesDePago(tx, cierreId),
        cobro: await cobroDeLaAprobacion(tx, e.A, cierreId),
      };
    });
    const g = r.e.gestionId;
    // El cambio ocurrio de verdad, y el cierre conserva A (R41).
    expect(r.vivo).toBe("20.00");
    expect(r.congelado).toBe("10.00");
    expect(r.salida).toBe("updated");
    // Base = 10 % x 20000.00 = 2000.00; mensajero 50 % = 1000.00; satelite 25 % = 500.00.
    expect(r.pagos).toEqual([
      fila(g, "mensajero", "mensajero_rechazo", "50.00", "2000.00", "1000.00"),
      fila(g, "satelite", "satelite_rechazo", "25.00", "2000.00", "500.00"),
    ]);
    expect(r.columnas).toEqual({ resultado: RECHAZO, pago: "1000.00", ingreso: "500.00" });
    expect(r.totales).toEqual({ estado: "solicitado", pago: "1000.00", ingreso: "500.00" });
    // ...y es lo MISMO que la aprobacion le cobra a la tienda por ese rechazo: 2000.00 + 13 % = 260.00.
    expect(r.cobro).toEqual(["ingreso_flete_devolucion:2000.00", "ingreso_iva_flete_devolucion:260.00"]);
  });

  it("R52/R28 — sin `tienda_flete_rechazo` al congelar (creado despues): la base es 0.00 y el pago en % da 0", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx, { conRechazo: false });
      await afirmarSembrado(tx, e, 4);
      const cierreId = await solicitarNuevo(tx, e);
      // El concepto aparece DESPUES de congelar: el cierre no lo tiene.
      await valor(tx, e, "FR", { concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: "10.00", grupoId: e.G1 });
      const congelados = await tx.cierreDetailConcepto.count({
        where: { cierreDetail: { cierreId, ordenId: e.ordenId }, concepto: "tienda_flete_rechazo" },
      });
      const salida = await corregirARechazada(tx, e);
      return {
        e,
        congelados,
        salida: salida.status,
        pagos: await pagosCongelados(tx, [e.gestionId]),
        columnas: await columnas(tx, e.gestionId),
        totales: await totalesDePago(tx, cierreId),
        cobro: await cobroDeLaAprobacion(tx, e.A, cierreId),
      };
    });
    const g = r.e.gestionId;
    expect(r.congelados).toBe(0);
    expect(r.salida).toBe("updated");
    // Con lo vivo seria 10 % de 20000.00 = 2000.00 -> 1000.00 y 500.00. Con lo congelado: nada.
    expect(r.pagos).toEqual([
      fila(g, "mensajero", "mensajero_rechazo", "50.00", "0.00", "0.00"),
      fila(g, "satelite", "satelite_rechazo", "25.00", "0.00", "0.00"),
    ]);
    expect(r.columnas).toEqual({ resultado: RECHAZO, pago: "0.00", ingreso: "0.00" });
    expect(r.totales).toEqual({ estado: "solicitado", pago: "0.00", ingreso: "0.00" });
    // La aprobacion tampoco le cobra nada a la tienda por ese rechazo.
    expect(r.cobro).toEqual([]);
  });

  it("R53 — la re-solicitud 477 vincula la rehecha (rechazo): su base sale del cobro congelado de su orden", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx, { conRechazo: true });
      await afirmarSembrado(tx, e, 5);
      const cierreId = await solicitarNuevo(tx, e);
      await tx.cierreDia.update({
        where: { id: cierreId },
        data: { estado: "rechazado", resueltoPor: e.admin, resueltoAt: new Date(), motivoRechazo: "no fue entregado" },
      });
      // Despues de congelar cambian el valor de la tienda (A 10 % -> B 20 %) y el pedido (-> 50000.00).
      await tx.tarifaValor.update({ where: { id: e.v.FR }, data: { valor: "20.00" } });
      await tx.orden.update({ where: { id: e.ordenId }, data: { montoCobrar: new Prisma.Decimal("50000.00") } });
      // El mensajero deshace la entrega y la rehace como RECHAZO (nace sin cierre).
      await tx.gestionOrden.update({ where: { id: e.gestionId }, data: { anuladaAt: new Date() } });
      const rehecha = await gestion(tx, e.ordenId, e.M, RECHAZO, "0");
      expect(await tx.gestionOrden.count({ where: { id: rehecha, cierreId: null } })).toBe(1);
      const salida = await solicitar(tx, e);
      return {
        rehecha,
        cierreId,
        salida,
        pagos: await pagosCongelados(tx, [rehecha]),
        columnas: await columnas(tx, rehecha),
        totales: await totalesDePago(tx, cierreId),
        congelado: txt(
          (
            await tx.cierreDetailConcepto.findFirstOrThrow({
              where: { cierreDetail: { cierreId, ordenId: e.ordenId }, concepto: "tienda_flete_rechazo" },
              select: { valor: true },
            })
          ).valor,
        ),
      };
    });
    expect(r.salida).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.congelado).toBe("10.00"); // la orden rehecha conserva su cobro congelado (D6 de la 477)
    // Base 10 % x 20000.00 = 2000.00 (con lo vivo: 20 % x 50000.00 = 10000.00).
    expect(r.pagos).toEqual([
      fila(r.rehecha, "mensajero", "mensajero_rechazo", "50.00", "2000.00", "1000.00"),
      fila(r.rehecha, "satelite", "satelite_rechazo", "25.00", "2000.00", "500.00"),
    ]);
    expect(r.columnas).toEqual({ resultado: RECHAZO, pago: "1000.00", ingreso: "500.00" });
    // La anulada ya no suma: el cierre solo tiene la rehecha.
    expect(r.totales).toEqual({ estado: "solicitado", pago: "1000.00", ingreso: "500.00" });
  });

  it("R54 — cobro congelado en el VIEJO y pago del nuevo: la base es el flete devuelto del viejo congelado (1000.00)", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const b = await sembrarBase(tx);
      // Tarifa VIEJA de la tienda (flete devuelto 1000.00, normal y GAM) y pago viejo de la zona.
      const tarifa = await tx.tarifa.create({
        data: {
          tiendaId: b.fks.tiendaId,
          zonaId: b.Z,
          valorFlete: "2000.00",
          valorFleteDevuelto: "1000.00",
          valorFleteGam: "2000.00",
          valorFleteDevueltoGam: "1000.00",
          comisionCod: "0.00",
          ivaFlete: "13.00",
          ivaComisionCod: "13.00",
          fulfillment: "0.00",
        },
        select: { id: true },
      });
      await tx.tarifaZonaMensajero.create({
        data: { zonaId: b.Z, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "700.00" },
      });
      const ordenId = await nuevaOrden(tx, b.fks, b.d1, "20000.00");
      const gestionId = await gestion(tx, ordenId, b.M, "entregado", "20000.00");
      const e: Escenario = { ...b, ordenId, gestionId };
      await afirmarSembrado(tx, e, 0);
      const cierreId = await solicitarNuevo(tx, e);
      const detalle = await tx.cierreDetail.findFirstOrThrow({
        where: { cierreId, ordenId },
        select: { tarifaModelo: true, tarifaId: true },
      });
      // DESPUES la empresa escribe sus valores nuevos (de la zona): el pago pasa al nuevo. El flete
      // por rechazo nuevo (10 % del pedido = 2000.00) NO es lo que este cierre le cobra a la tienda.
      await valor(tx, e, "FR", { concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: "10.00" });
      await valor(tx, e, "MR", { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "50.00" });
      await valor(tx, e, "SR", { concepto: "satelite_rechazo", modo: "porcentaje", valor: "25.00" });
      const salida = await corregirARechazada(tx, e);
      return {
        e,
        tarifaId: tarifa.id,
        detalle,
        salida: salida.status,
        pagos: await pagosCongelados(tx, [gestionId]),
        columnas: await columnas(tx, gestionId),
        totales: await totalesDePago(tx, cierreId),
        cobro: await cobroDeLaAprobacion(tx, e.A, cierreId),
      };
    });
    const g = r.e.gestionId;
    expect(r.detalle).toEqual({ tarifaModelo: "viejo", tarifaId: r.tarifaId });
    expect(r.salida).toBe("updated");
    // Base = flete devuelto del viejo congelado = 1000.00; mensajero 50 % = 500.00; satelite 25 % = 250.00.
    expect(r.pagos).toEqual([
      fila(g, "mensajero", "mensajero_rechazo", "50.00", "1000.00", "500.00"),
      fila(g, "satelite", "satelite_rechazo", "25.00", "1000.00", "250.00"),
    ]);
    expect(r.columnas).toEqual({ resultado: RECHAZO, pago: "500.00", ingreso: "250.00" });
    expect(r.totales).toEqual({ estado: "solicitado", pago: "500.00", ingreso: "250.00" });
    // Igual a lo que la aprobacion le cobra a la tienda con el viejo congelado: 1000.00 + 13 %.
    expect(r.cobro).toEqual(["ingreso_flete_devolucion:1000.00", "ingreso_iva_flete_devolucion:130.00"]);
  });

  /**
   * R55: la empresa en el nuevo con flete por entregado A = 1500.00, mensajero 10 % y satelite 5 %
   * del flete sin IVA (ambos por entregado). El servicio resuelve el pago con A (base 1500.00) y,
   * ANTES de que `crearCierre` congele, el flete pasa a B = 3000.00. Con B: mensajero 300.00 y
   * satelite 150.00 (con A serian 150.00 y 75.00).
   */
  async function sembrarR55(tx: TxDeTest) {
    const b = await sembrarBase(tx);
    await valor(tx, b, "FE", { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00" });
    await valor(tx, b, "ME", { concepto: "mensajero_entregado", modo: "porcentaje", valor: "10.00" });
    await valor(tx, b, "SE", { concepto: "satelite_entregado", modo: "porcentaje", valor: "5.00" });
    const ordenId = await nuevaOrden(tx, b.fks, b.d1, "20000.00");
    const gestionId = await gestion(tx, ordenId, b.M, "entregado", "20000.00");
    const e: Escenario = { ...b, ordenId, gestionId };
    await afirmarSembrado(tx, e, 3);
    const pagos = resolverQueCambiaDespues(tx, e.A, async () => {
      await tx.tarifaValor.update({ where: { id: e.v.FE }, data: { valor: "3000.00" } });
    });
    return { e, pagos };
  }

  async function lecturaR55(tx: TxDeTest, e: Escenario, cierreId: string) {
    const conceptos = await tx.cierreDetailConcepto.findMany({
      where: { cierreDetail: { cierreId, ordenId: e.ordenId } },
      select: { concepto: true, valor: true },
    });
    return {
      conceptos: conceptos.map((c) => `${c.concepto}:${txt(c.valor)}`).sort(),
      pagos: await pagosCongelados(tx, [e.gestionId]),
      columnas: await columnas(tx, e.gestionId),
      totales: await totalesDePago(tx, cierreId),
    };
  }

  function baseResuelta(resuelto: Map<string, TarifaPago | null>[], gestionId: string): string | null {
    const t = resuelto[0]?.get(gestionId);
    return t?.modelo === "nuevo" ? t.baseFlete : null;
  }

  function afirmarR55(
    e: Escenario,
    l: Awaited<ReturnType<typeof lecturaR55>>,
    estado: "solicitado" | "vencido",
  ) {
    const g = e.gestionId;
    expect(l.conceptos).toEqual(["tienda_flete_entregado:3000.00"]);
    expect(l.pagos).toEqual([
      fila(g, "mensajero", "mensajero_entregado", "10.00", "3000.00", "300.00"),
      fila(g, "satelite", "satelite_entregado", "5.00", "3000.00", "150.00"),
    ]);
    expect(l.columnas).toEqual({ resultado: "entregado", pago: "300.00", ingreso: "150.00" });
    expect(l.totales).toEqual({ estado, pago: "300.00", ingreso: "150.00" });
  }

  it("R55 — solicitud: el pago se resolvio con A y el cobro se congela con B -> base, pagos y totales salen de B", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const { e, pagos } = await sembrarR55(tx);
      const salida = await solicitar(tx, e, pagos);
      if (salida.status !== "ok" || salida.cierreId === undefined) throw new Error(JSON.stringify(salida));
      return { e, resuelto: pagos.resuelto, lectura: await lecturaR55(tx, e, salida.cierreId) };
    });
    // El servicio resolvio de verdad con A (base 1500.00) ANTES del cambio.
    expect(baseResuelta(r.resuelto, r.e.gestionId)).toBe("1500.00");
    afirmarR55(r.e, r.lectura, "solicitado");
  });

  it("R55 — corte diario: lo mismo en el `vencido`", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const { e, pagos } = await sembrarR55(tx);
      const corte = new CorteDiarioService(
        { findMensajerosConActividadSinCierre: async () => [{ mensajeroId: e.M, zonaId: e.Z }] } as never,
        cierreDiaRepo(clienteConSavepoint(tx)),
        { findCentralZonaId: async () => e.Z } as never,
        { findUsuarioVehiculoId: async () => null, findEstatusIdByValue: async () => null } as never,
        pagos as never,
        { warn: () => undefined },
      );
      const salida = await comoEmpresa(tx, e.A, () => corte.ejecutarCorte());
      const cierre = await tx.cierreDia.findFirstOrThrow({ where: { mensajeroId: e.M }, select: { id: true } });
      return { e, vencidos: salida.vencidosCreados, resuelto: pagos.resuelto, lectura: await lecturaR55(tx, e, cierre.id) };
    });
    expect(r.vencidos).toBe(1);
    expect(baseResuelta(r.resuelto, r.e.gestionId)).toBe("1500.00");
    afirmarR55(r.e, r.lectura, "vencido");
  });
});
