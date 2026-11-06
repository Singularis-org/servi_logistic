import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TarifaConcepto } from "@prisma/client";

import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { resolverPagosCon } from "@/lib/repositories/_shared/resolver-tarifas";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CorteDiarioRepository } from "@/lib/repositories/CorteDiarioRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import type { ContextoPagoGestion, FijarValorInput, TarifaPago } from "@/lib/types/tarifa-flexible";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { reglasPaisFijas, ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";
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

// SLT-55 T2.1 (R12-R22, R24, R25) — EL VALOR PROPIO EN LOS CINCO CAMINOS DEL CIERRE, CONTRA POSTGRES REAL:
// vista previa, solicitud, corte diario, re-solicitud 477 y correccion 398.
//
// Por que aqui y no con dobles: los cinco caminos terminan en el mismo resolver, pero cada uno le pasa una zona,
// un vehiculo y un mensajero distintos, y lee el cobro congelado por su lado. Lo que se prueba es esa costura y
// el SQL que hay debajo, incluido el `gestion_pago_congelado` que queda escrito.
//
// A DIFERENCIA DE LOS MOLDES (`tarifas-flexibles-snapshot`, `-base-congelada`), la zona y el vehiculo salen de
// las columnas del usuario por el `OrdenRepository` real, y el corte selecciona con el `CorteDiarioRepository`
// real: R13, R20 y R25 hablan justo de esas filas. El unico doble es la zona central, que la empresa de prueba no
// tiene marcada, y las URL firmadas.
//
// TODO DENTRO DE UNA TRANSACCION QUE SE REVIERTE. El codigo de produccion corre con `servi_app` y la empresa
// fijada (`comoApp`); siembras, mutaciones y lecturas de control, como dueño. Cada caso afirma lo que sembro y la
// siembra LANZA si falta algo: sin base, `describe.skip` VISIBLE; con base, nunca un verde sin datos.
//
// Los esperados son LITERALES escritos a mano junto a su aritmetica.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };
const RECHAZO = "devolucion_a_origen_por_rechazo" as const;

type ResultadoDeGestion = "entregado" | "reprogramado" | "novedad" | typeof RECHAZO;

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

let siguienteGuia = 970_000_000 + Math.floor(Math.random() * 20_000_000);

interface Base {
  A: string;
  fks: FksDeOrden;
  /** La zona de M y de las ordenes; el test la trata como la central. */
  Z: string;
  /** Otra zona de la empresa, sin ningun distrito en comun. */
  Z2: string;
  V: string;
  /** Mensajero con la zona Z y el vehiculo V. */
  M: string;
  /** Otro mensajero con la misma zona Z y el mismo vehiculo V. */
  M2: string;
  admin: string;
  maestro: Actor;
  /** Distrito de Z, dentro del grupo G1. */
  d1: string;
  G1: string;
  /** id de cada `tarifa_valor` sembrado, por etiqueta. */
  v: Record<string, string>;
}

async function sembrarBase(tx: TxDeTest, opciones: { activada: boolean }): Promise<Base> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx);
  const Z = fks.zonaId;
  const Z2 = (
    await tx.zona.create({
      data: { nombre: `Zona dos ${randomUUID().slice(0, 12)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    })
  ).id;
  const V = (await tx.vehiculo.create({ data: { name: `slt55-${randomUUID().slice(0, 8)}` }, select: { id: true } })).id;
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const M2 = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  await tx.usuario.updateMany({ where: { id: { in: [M, M2] } }, data: { zonaId: Z, vehiculoId: V } });
  const admin = (await crearUsuarioDePrueba(tx, "admin")).id;
  const maestroId = (await crearUsuarioDePrueba(tx, "maestro")).id;
  const d1 = (await tx.distrito.findFirstOrThrow({ where: { cantonId: fks.cantonId }, select: { id: true } })).id;
  await tx.zonaDistrito.create({ data: { zonaId: Z, distritoId: d1 } });
  const G1 = (await tx.grupoDistritos.create({ data: { zonaId: Z, nombre: "G1" }, select: { id: true } })).id;
  await tx.grupoDistritosDistrito.create({ data: { grupoId: G1, zonaId: Z, distritoId: d1 } });
  if (opciones.activada) await sembrarActivacion(tx, A);
  return { A, fks, Z, Z2, V, M, M2, admin, maestro: { usuarioId: maestroId, rol: "maestro" }, d1, G1, v: {} };
}

interface ValorSembrado {
  concepto: TarifaConcepto;
  modo?: "monto" | "porcentaje";
  valor: string;
  zonaId?: string | null;
  grupoId?: string | null;
  vehiculoId?: string | null;
  tiendaId?: string | null;
  mensajeroId?: string | null;
}

async function valor(tx: TxDeTest, e: Pick<Base, "v">, etiqueta: string, d: ValorSembrado) {
  const fila = await tx.tarifaValor.create({
    data: {
      concepto: d.concepto,
      modo: d.modo ?? "monto",
      valor: d.valor,
      ivaPct: d.concepto.startsWith("tienda_") ? "13.00" : null,
      zonaId: d.zonaId ?? null,
      grupoId: d.grupoId ?? null,
      vehiculoId: d.vehiculoId ?? null,
      tiendaId: d.tiendaId ?? null,
      mensajeroId: d.mensajeroId ?? null,
    },
    select: { id: true },
  });
  e.v[etiqueta] = fila.id;
}

/** Los cinco niveles de pago de un concepto: propio 501, grupo+vehiculo 502, grupo 503, zona+vehiculo 504, zona 505. */
async function sembrarCincoNiveles(tx: TxDeTest, e: Base, concepto: TarifaConcepto, prefijo: string) {
  await valor(tx, e, `${prefijo}_propio`, { concepto, valor: "501.00", mensajeroId: e.M });
  await valor(tx, e, `${prefijo}_gv`, { concepto, valor: "502.00", zonaId: e.Z, grupoId: e.G1, vehiculoId: e.V });
  await valor(tx, e, `${prefijo}_g`, { concepto, valor: "503.00", zonaId: e.Z, grupoId: e.G1 });
  await valor(tx, e, `${prefijo}_zv`, { concepto, valor: "504.00", zonaId: e.Z, vehiculoId: e.V });
  await valor(tx, e, `${prefijo}_z`, { concepto, valor: "505.00", zonaId: e.Z });
}

async function nuevaOrden(tx: TxDeTest, e: Pick<Base, "fks" | "d1" | "Z">, monto = "20000.00"): Promise<string> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT55-${randomUUID().slice(0, 12)}`,
      destinatario: "Valor propio SLT-55",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: e.fks.estatusId,
      tiendaId: e.fks.tiendaId,
      zonaId: e.Z,
      provinciaId: e.fks.provinciaId,
      cantonId: e.fks.cantonId,
      distritoId: e.d1,
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
  resultado: ResultadoDeGestion,
  monto = "20000.00",
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
        : {
            ordenId,
            mensajeroId,
            resultado,
            motivo: "no lo quiso",
            ...(resultado === "reprogramado" ? { fechaReprogramacion: new Date("2026-12-01T00:00:00.000Z") } : {}),
          },
    select: { id: true },
  });
  return g.id;
}

interface Escenario extends Base {
  ordenId: string;
  gestionId: string;
}

/**
 * El escenario de `tasks.md`: empresa activada; M con vehiculo y orden en un distrito de grupo; los cinco niveles
 * de `mensajero_entregado` y de `mensajero_rechazo`; flete y satelite en la zona. Una gestion entregada de M.
 */
async function sembrarCompleto(tx: TxDeTest): Promise<Escenario> {
  const b = await sembrarBase(tx, { activada: true });
  await sembrarCincoNiveles(tx, b, "mensajero_entregado", "ME");
  await sembrarCincoNiveles(tx, b, "mensajero_rechazo", "MR");
  await valor(tx, b, "FE", { concepto: "tienda_flete_entregado", valor: "3000.00", zonaId: b.Z });
  await valor(tx, b, "FR", { concepto: "tienda_flete_rechazo", valor: "2000.00", zonaId: b.Z });
  await valor(tx, b, "SE", { concepto: "satelite_entregado", valor: "50.00", zonaId: b.Z });
  await valor(tx, b, "SR", { concepto: "satelite_rechazo", valor: "40.00", zonaId: b.Z });
  const ordenId = await nuevaOrden(tx, b);
  const gestionId = await gestion(tx, ordenId, b.M, "entregado");
  const e: Escenario = { ...b, ordenId, gestionId };
  // 5 + 5 de pago, 2 de flete y 2 de satelite: sin esto un caso podria pasar con la base vacia.
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(14);
  expect(await tx.gestionOrden.count({ where: { mensajeroId: e.M, cierreId: null, anuladaAt: null } })).toBe(1);
  return e;
}

// --------------------------------------------------------------------------------------------
// Produccion, con el rol de la app
// --------------------------------------------------------------------------------------------

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

type Resolvedor = Pick<TarifaZonaMensajeroRepository, "resolvePagos">;

function cierreDiaRepo(cli: PrismaClient) {
  return new CierreDiaRepository(cli, new TarifaVigenteRepository(cli));
}

function servicioCierre(cli: PrismaClient, e: Pick<Base, "Z">, pagos: Resolvedor = new TarifaZonaMensajeroRepository(cli)) {
  return new CierreDiaService(
    cierreDiaRepo(cli),
    { findCentralZonaId: async () => e.Z } as never,
    new OrdenRepository(cli),
    { createSignedUrls: async () => ({}) } as never,
    pagos as never,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
}

function actorDe(mensajeroId: string): Actor {
  return { usuarioId: mensajeroId, rol: "mensajero" };
}

async function solicitar(tx: TxDeTest, e: Pick<Base, "A" | "Z">, mensajeroId: string) {
  return comoEmpresa(tx, e.A, () => servicioCierre(clienteConSavepoint(tx), e).solicitarCierre(actorDe(mensajeroId)));
}

async function solicitarNuevo(tx: TxDeTest, e: Pick<Base, "A" | "Z">, mensajeroId: string): Promise<string> {
  const r = await solicitar(tx, e, mensajeroId);
  if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) {
    throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(r)}`);
  }
  return r.cierreId;
}

/** La vista previa del mensajero, y lo que el resolver le dio: el DTO de la pantalla no trae el nivel. */
async function vistaPrevia(tx: TxDeTest, e: Pick<Base, "A" | "Z">, mensajeroId: string) {
  return comoEmpresa(tx, e.A, async () => {
    const cli = clienteConSavepoint(tx);
    const real = new TarifaZonaMensajeroRepository(cli);
    const resuelto = new Map<string, TarifaPago | null>();
    const espia: Resolvedor = {
      async resolvePagos(ctxs: readonly ContextoPagoGestion[]) {
        const r = await real.resolvePagos(ctxs);
        for (const [k, t] of r) resuelto.set(k, t);
        return r;
      },
    };
    const r = await servicioCierre(cli, e, espia).listarCierreDia(actorDe(mensajeroId));
    if (r.status !== "ok") throw new Error(`la vista previa salio ${r.status}`);
    return { ...r, resuelto };
  });
}

function corteReal(cli: PrismaClient, e: Pick<Base, "Z">) {
  return new CorteDiarioService(
    new CorteDiarioRepository(cli),
    cierreDiaRepo(cli),
    { findCentralZonaId: async () => e.Z } as never,
    new OrdenRepository(cli),
    new TarifaZonaMensajeroRepository(cli),
    { warn: () => undefined },
    undefined,
    reglasPaisFijas(),
  );
}

async function cortar(tx: TxDeTest, e: Pick<Base, "A" | "Z">) {
  return comoEmpresa(tx, e.A, () => corteReal(clienteConSavepoint(tx), e).ejecutarCorte());
}

function repoAdmin(cli: PrismaClient) {
  return new CierresAdminRepository(cli, ...([{}, {}, {}, {}, {}, {}, {}] as [never, never, never, never, never, never, never]));
}

/** La 398 como la llama produccion, con el rol de la app. La orden pasa antes a `entregado`. */
async function corregirARechazada(tx: TxDeTest, e: Pick<Base, "A" | "admin">, ordenId: string, gestionId: string) {
  const entregada = await tx.orderStatus.findUniqueOrThrow({ where: { value: "entregado" }, select: { id: true } });
  const rechazada = await tx.orderStatus.findUniqueOrThrow({ where: { value: RECHAZO }, select: { id: true } });
  await tx.orden.update({ where: { id: ordenId }, data: { estatusId: entregada.id } });
  return comoEmpresa(tx, e.A, () =>
    repoAdmin(clienteConSavepoint(tx)).corregirResultadoGestionEnCierre({
      gestionId,
      alcance: ALCANCE_CENTRAL,
      motivo: "la tienda dice que lo rechazaron",
      corregidoPor: e.admin,
      estatusEntregadaId: entregada.id,
      estatusRechazadaId: rechazada.id,
    }),
  );
}

async function resolverCierre(tx: TxDeTest, cierreId: string, adminId: string, estado: "aprobado" | "rechazado") {
  await tx.cierreDia.update({
    where: { id: cierreId },
    data: {
      estado,
      resueltoPor: adminId,
      resueltoAt: new Date(),
      motivoRechazo: estado === "rechazado" ? "falta un comprobante" : null,
    },
  });
}

/** El mensajero deshace la gestion del cierre rechazado y la rehace: la rehecha nace sin cierre. */
async function rehacer(tx: TxDeTest, e: Pick<Base, "M">, ordenId: string, gestionId: string, resultado: ResultadoDeGestion) {
  await tx.gestionOrden.update({ where: { id: gestionId }, data: { anuladaAt: new Date() } });
  const rehecha = await gestion(tx, ordenId, e.M, resultado);
  expect(await tx.gestionOrden.count({ where: { id: rehecha, cierreId: null } })).toBe(1);
  return rehecha;
}

// --------------------------------------------------------------------------------------------
// Lecturas de control, como dueño
// --------------------------------------------------------------------------------------------

const txt = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));

async function congelados(tx: TxDeTest, gestionIds: string[]) {
  const filas = await tx.gestionPagoCongelado.findMany({
    where: { gestionOrdenId: { in: gestionIds } },
    select: {
      gestionOrdenId: true,
      actor: true,
      concepto: true,
      modo: true,
      valor: true,
      nivel: true,
      tarifaValorId: true,
      base: true,
      importe: true,
    },
  });
  return filas
    .map((f) => ({
      gestion: f.gestionOrdenId,
      actor: f.actor,
      concepto: f.concepto,
      modo: f.modo,
      valor: txt(f.valor),
      nivel: f.nivel,
      tarifaValorId: f.tarifaValorId,
      base: txt(f.base),
      importe: txt(f.importe),
    }))
    .sort((a, b) => `${a.gestion}${a.actor}`.localeCompare(`${b.gestion}${b.actor}`));
}

/** Lo que se congelo al pagarle a M por esa gestion, sin la fila de la satelite. */
async function congeladoDelMensajero(tx: TxDeTest, gestionId: string) {
  return (await congelados(tx, [gestionId])).filter((f) => f.actor === "mensajero");
}

async function pagoDe(tx: TxDeTest, gestionId: string) {
  const g = await tx.gestionOrden.findUniqueOrThrow({
    where: { id: gestionId },
    select: { pagoMensajero: true, ingresoBodegaRechazo: true, cierreId: true },
  });
  return { pago: txt(g.pagoMensajero), ingreso: txt(g.ingresoBodegaRechazo), cierreId: g.cierreId };
}

async function totalPago(tx: TxDeTest, cierreId: string) {
  const c = await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { totalPagoMensajero: true } });
  return txt(c.totalPagoMensajero);
}

/** La fila congelada que se espera del pago al mensajero. */
function filaMensajero(
  gestionId: string,
  concepto: TarifaConcepto,
  d: { modo?: "monto" | "porcentaje"; valor: string; nivel: string; tarifaValorId: string | null; base?: string | null; importe: string },
) {
  return {
    gestion: gestionId,
    actor: "mensajero",
    concepto,
    modo: d.modo ?? "monto",
    valor: d.valor,
    nivel: d.nivel,
    tarifaValorId: d.tarifaValorId,
    base: d.base ?? null,
    importe: d.importe,
  };
}

/** Todo lo que un cierre ya hecho le dice a alguien: totales, gestiones, congelado, detalle y wallets. */
async function fotoDelCierre(tx: TxDeTest, e: Pick<Base, "A">, cierreId: string, gestionIds: string[]) {
  const cierre = await tx.cierreDia.findUniqueOrThrow({
    where: { id: cierreId },
    select: { totalPagoMensajero: true, totalIngresoBodegaRechazos: true, totalGeneral: true, totalEfectivo: true },
  });
  const gestiones = await Promise.all(gestionIds.map((id) => pagoDe(tx, id)));
  const pagos = await congelados(tx, gestionIds);
  const detalles = await tx.cierreDetail.findMany({
    where: { cierreId },
    select: { conceptos: { select: { concepto: true, valor: true, nivel: true }, orderBy: { concepto: "asc" } } },
  });
  const lecturas = await comoEmpresa(tx, e.A, async () => {
    const detalle = await repoAdmin(clienteConSavepoint(tx)).findCierreByIdEnAlcance(cierreId, ALCANCE_CENTRAL, ZONA_DE_CR);
    if (detalle === null) throw new Error("el detalle del cierre no se encontro en su alcance");
    const ingreso = await new WalletFeedService().construirMovimientosDeIngreso(cierreId, tx);
    const pago = await new WalletMensajeroFeedService().construirMovimientosDePago(cierreId, tx);
    return {
      detalle: detalle.gestiones.map((g) => ({ gestionId: g.gestionId, pago: g.pagoMensajero, ingreso: g.ingresoEmpresa })),
      walletEmpresa: ingreso.map((m) => `${m.categoria}:${m.monto}`).sort(),
      libroMensajero: pago.libro.map((m) => `${m.categoria}:${m.monto}`).sort(),
      egresoCaja: pago.egresoCaja.map((m) => `${m.categoria}:${m.monto}`).sort(),
    };
  });
  return {
    totales: {
      pago: txt(cierre.totalPagoMensajero),
      ingreso: txt(cierre.totalIngresoBodegaRechazos),
      general: txt(cierre.totalGeneral),
      efectivo: txt(cierre.totalEfectivo),
    },
    gestiones,
    pagos,
    conceptos: detalles.flatMap((d) => d.conceptos.map((c) => `${c.concepto}:${txt(c.valor)}:${c.nivel}`)),
    ...lecturas,
  };
}

/** La foto sin la traza del valor de origen, lo unico que un borrado puede cambiar (FK SET NULL). */
function sinTraza<T>(x: T): unknown {
  return JSON.parse(JSON.stringify(x, (k, v: unknown) => (k === "tarifaValorId" ? undefined : v)));
}

function propio(mensajeroId: string, o: Partial<FijarValorInput> = {}): FijarValorInput {
  return {
    concepto: "mensajero_entregado",
    modo: "monto",
    valor: "501",
    zonaId: null,
    grupoId: null,
    tiendaId: null,
    vehiculoId: null,
    mensajeroId,
    ...o,
  };
}

async function fijarPorElServicio(tx: TxDeTest, e: Pick<Base, "A" | "maestro">, input: FijarValorInput): Promise<string> {
  const r = await comoEmpresa(tx, e.A, () => serviciosDeTarifas(clienteConSavepoint(tx)).tarifaValor.fijarValor(input, e.maestro));
  if (r.status !== "ok") throw new Error(`fijar ${input.concepto}: ${JSON.stringify(r)}`);
  return r.id;
}

async function quitarPorElServicio(tx: TxDeTest, e: Pick<Base, "A" | "maestro">, id: string) {
  const r = await comoEmpresa(tx, e.A, () => serviciosDeTarifas(clienteConSavepoint(tx)).tarifaValor.quitarValor(id, e.maestro));
  if (r.status !== "ok") throw new Error(`quitar: ${JSON.stringify(r)}`);
}

// --------------------------------------------------------------------------------------------
// Los cinco caminos, con una misma forma
// --------------------------------------------------------------------------------------------

type Camino = "vista previa" | "solicitud" | "corte" | "re-solicitud 477" | "correccion 398";

interface PagoDelCamino {
  /** El importe que ese camino le da a M por su gestion. */
  pago: string | null;
  /** El total de pago: del cierre o, en la vista previa, el derivado. */
  total: string | null;
  /** La gestion que se paga: en la 477 es la rehecha. */
  gestionId: string;
  /** Lo que queda congelado; en la vista previa, lo que dio el resolver: esa no congela. */
  elegido: { concepto: string; modo: string; valor: string | null; nivel: string; tarifaValorId: string | null };
}

/**
 * Lleva el escenario hasta el pago por ese camino. `antes` corre justo antes del paso que resuelve el pago: en la
 * 477 y la 398 eso es despues de crear el cierre, que es de lo que hablan R13 y el control sin propio.
 */
async function recorrer(tx: TxDeTest, e: Escenario, camino: Camino, antes: () => Promise<void> = async () => undefined): Promise<PagoDelCamino> {
  const desdeCongelado = async (gestionId: string, total: string | null): Promise<PagoDelCamino> => {
    const filas = await congeladoDelMensajero(tx, gestionId);
    expect(filas).toHaveLength(1);
    const f = filas[0];
    if (f === undefined) throw new Error("sin fila congelada");
    expect(f.importe).toBe((await pagoDe(tx, gestionId)).pago); // `importe` es exactamente la columna
    return {
      pago: f.importe,
      total,
      gestionId,
      elegido: { concepto: f.concepto, modo: f.modo, valor: f.valor, nivel: f.nivel, tarifaValorId: f.tarifaValorId },
    };
  };

  if (camino === "vista previa") {
    await antes();
    const r = await vistaPrevia(tx, e, e.M);
    expect(r.grupos.entregado).toHaveLength(1);
    const t = r.resuelto.get(e.gestionId);
    if (t?.modelo !== "nuevo" || t.mensajero === null) throw new Error(`resolver inesperado: ${JSON.stringify(t)}`);
    const { concepto, modo, valor: v, nivel, tarifaValorId } = t.mensajero;
    return {
      pago: r.grupos.entregado[0]?.pagoMensajero ?? null,
      total: r.totalPagoMensajero,
      gestionId: e.gestionId,
      elegido: { concepto, modo, valor: v, nivel, tarifaValorId },
    };
  }
  if (camino === "solicitud") {
    await antes();
    const cierreId = await solicitarNuevo(tx, e, e.M);
    return desdeCongelado(e.gestionId, await totalPago(tx, cierreId));
  }
  if (camino === "corte") {
    await antes();
    const salida = await cortar(tx, e);
    expect(salida).toEqual({ mensajerosEvaluados: 1, vencidosCreados: 1, mensajerosSinZona: 0 });
    const cierre = await tx.cierreDia.findFirstOrThrow({ where: { mensajeroId: e.M }, select: { id: true, estado: true } });
    expect(cierre.estado).toBe("vencido");
    return desdeCongelado(e.gestionId, await totalPago(tx, cierre.id));
  }
  const cierreId = await solicitarNuevo(tx, e, e.M);
  if (camino === "re-solicitud 477") {
    await resolverCierre(tx, cierreId, e.admin, "rechazado");
    const rehecha = await rehacer(tx, e, e.ordenId, e.gestionId, "entregado");
    await antes();
    const salida = await solicitar(tx, e, e.M);
    expect(salida).toEqual({ status: "ok", via: "resolicitado" });
    return desdeCongelado(rehecha, await totalPago(tx, cierreId));
  }
  await antes();
  const salida = await corregirARechazada(tx, e, e.ordenId, e.gestionId);
  expect(salida.status).toBe("updated");
  return desdeCongelado(e.gestionId, await totalPago(tx, cierreId));
}

/** Cada camino, con el concepto que paga y el prefijo de los valores sembrados. La 398 siempre pasa a rechazo. */
const CAMINOS: [Camino, TarifaConcepto, "ME" | "MR"][] = [
  ["vista previa", "mensajero_entregado", "ME"],
  ["solicitud", "mensajero_entregado", "ME"],
  ["corte", "mensajero_entregado", "ME"],
  ["re-solicitud 477", "mensajero_entregado", "ME"],
  ["correccion 398", "mensajero_rechazo", "MR"],
];

// --------------------------------------------------------------------------------------------
// Casos
// --------------------------------------------------------------------------------------------

describeSiHayBase("SLT-55 T2.1 — el valor propio en los caminos del cierre (Postgres real)", () => {
  describe("R12 — el propio gana a los otros cuatro niveles y se congela con su origen", () => {
    it.each(CAMINOS)("%s paga 501 con nivel mensajero", async (camino, concepto, prefijo) => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        return { e, pago: await recorrer(tx, e, camino) };
      });
      expect(r.pago.pago).toBe("501.00");
      expect(r.pago.total).toBe("501.00");
      expect(r.pago.elegido).toEqual({
        concepto,
        modo: "monto",
        valor: "501.00",
        nivel: "mensajero",
        tarifaValorId: r.e.v[`${prefijo}_propio`],
      });
    });

    // Sin esto, los 501 de arriba no prueban que el propio ganaba: podria ser el unico valor que llega.
    it.each(CAMINOS)("%s, quitando el propio, paga 502 de grupo por vehiculo", async (camino, concepto, prefijo) => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        const pago = await recorrer(tx, e, camino, async () => {
          await tx.tarifaValor.deleteMany({ where: { id: { in: [e.v.ME_propio as string, e.v.MR_propio as string] } } });
        });
        return { e, pago };
      });
      expect(r.pago.pago).toBe("502.00");
      expect(r.pago.total).toBe("502.00");
      expect(r.pago.elegido).toEqual({
        concepto,
        modo: "monto",
        valor: "502.00",
        nivel: "grupo_vehiculo",
        tarifaValorId: r.e.v[`${prefijo}_gv`],
      });
    });
  });

  describe("R13 — el propio no depende de la zona ni del vehiculo", () => {
    it.each(CAMINOS)("%s con M en otra zona y sin vehiculo sigue pagando 501", async (camino, concepto, prefijo) => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        // La zona nueva tiene su propio valor: si el propio dejara de aplicar, se veria en el importe.
        await valor(tx, e, "ME_Z2", { concepto: "mensajero_entregado", valor: "777.00", zonaId: e.Z2 });
        const pago = await recorrer(tx, e, camino, async () => {
          await tx.usuario.update({ where: { id: e.M }, data: { zonaId: e.Z2, vehiculoId: null } });
        });
        const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: e.M }, select: { zonaId: true, vehiculoId: true } });
        return { e, pago, usuario };
      });
      expect(r.usuario).toEqual({ zonaId: r.e.Z2, vehiculoId: null });
      expect(r.pago.pago).toBe("501.00");
      expect(r.pago.elegido).toMatchObject({ concepto, nivel: "mensajero", tarifaValorId: r.e.v[`${prefijo}_propio`] });
    });

    it("control: sin el propio, ese mismo M en esa zona paga el 777 de la zona", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        await valor(tx, e, "ME_Z2", { concepto: "mensajero_entregado", valor: "777.00", zonaId: e.Z2 });
        const pago = await recorrer(tx, e, "solicitud", async () => {
          await tx.tarifaValor.delete({ where: { id: e.v.ME_propio } });
          await tx.usuario.update({ where: { id: e.M }, data: { zonaId: e.Z2, vehiculoId: null } });
        });
        return { e, pago };
      });
      expect(r.pago.pago).toBe("777.00");
      expect(r.pago.elegido).toMatchObject({ nivel: "zona", tarifaValorId: r.e.v.ME_Z2 });
    });
  });

  it("R14 — propio solo en entregado: el rechazo paga por grupo, y sin ningun nivel paga 0 y el cierre se crea", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const b = await sembrarBase(tx, { activada: true });
      await valor(tx, b, "ME_propio", { concepto: "mensajero_entregado", valor: "501.00", mensajeroId: b.M });
      await valor(tx, b, "MR_g", { concepto: "mensajero_rechazo", valor: "603.00", zonaId: b.Z, grupoId: b.G1 });
      const gE = await gestion(tx, await nuevaOrden(tx, b), b.M, "entregado");
      const gR = await gestion(tx, await nuevaOrden(tx, b), b.M, RECHAZO);
      const gN = await gestion(tx, await nuevaOrden(tx, b), b.M, "novedad");
      expect(await tx.tarifaValor.count({ where: { mensajeroId: b.M } })).toBe(1);
      const cierreId = await solicitarNuevo(tx, b, b.M);
      return {
        b,
        gE,
        gR,
        gN,
        total: await totalPago(tx, cierreId),
        filas: await congelados(tx, [gE, gR, gN]),
        pagoN: await pagoDe(tx, gN),
        cierreId,
      };
    });
    const esperado = [
      filaMensajero(r.gE, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: r.b.v.ME_propio as string, importe: "501.00" }),
      filaMensajero(r.gR, "mensajero_rechazo", { valor: "603.00", nivel: "grupo", tarifaValorId: r.b.v.MR_g as string, importe: "603.00" }),
    ].sort((a, b) => a.gestion.localeCompare(b.gestion));
    expect(r.filas).toEqual(esperado);
    // La novedad no tiene valor en ningun nivel: 0 y sin fila, y el cierre existe igual (SLT-52 R24).
    expect(r.pagoN).toEqual({ pago: "0.00", ingreso: "0.00", cierreId: r.cierreId });
    // 501.00 + 603.00 + 0.00 = 1104.00
    expect(r.total).toBe("1104.00");
  });

  it("R15 — un propio de 0 sobre una zona de 505 paga 0,00 con nivel mensajero, no cae al siguiente", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const b = await sembrarBase(tx, { activada: true });
      await valor(tx, b, "ME_propio", { concepto: "mensajero_entregado", valor: "0.00", mensajeroId: b.M });
      await valor(tx, b, "ME_z", { concepto: "mensajero_entregado", valor: "505.00", zonaId: b.Z });
      const g = await gestion(tx, await nuevaOrden(tx, b), b.M, "entregado");
      const previa = await vistaPrevia(tx, b, b.M);
      const cierreId = await solicitarNuevo(tx, b, b.M);
      return { b, g, previa: previa.totalPagoMensajero, total: await totalPago(tx, cierreId), filas: await congeladoDelMensajero(tx, g) };
    });
    expect(r.previa).toBe("0.00");
    expect(r.total).toBe("0.00");
    expect(r.filas).toEqual([
      filaMensajero(r.g, "mensajero_entregado", { valor: "0.00", nivel: "mensajero", tarifaValorId: r.b.v.ME_propio as string, importe: "0.00" }),
    ]);
  });

  describe("R16 — el propio de M no toca a nadie mas", () => {
    it("en un mismo lote del resolver, M cobra 501, M2 cobra 502 y la satelite cobra lo suyo", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        const contexto = (gestionId: string, mensajeroId: string): ContextoPagoGestion => ({
          gestionId,
          resultado: "entregado",
          mensajeroId,
          zonaId: e.Z,
          vehiculoId: e.V,
          distritoId: e.d1,
          tiendaId: e.fks.tiendaId,
          zonaOrdenId: e.Z,
          montoCobrar: "20000.00",
          cobraComision: false,
        });
        const lote = await comoEmpresa(tx, e.A, () =>
          resolverPagosCon(clienteConSavepoint(tx) as never, [contexto("g-M", e.M), contexto("g-M2", e.M2)]),
        );
        return { e, lote };
      });
      const gM = r.lote.get("g-M");
      const gM2 = r.lote.get("g-M2");
      expect(gM).toMatchObject({
        modelo: "nuevo",
        mensajero: { valor: "501.00", nivel: "mensajero", tarifaValorId: r.e.v.ME_propio },
        satelite: { valor: "50.00", nivel: "zona", tarifaValorId: r.e.v.SE },
      });
      expect(gM2).toMatchObject({
        modelo: "nuevo",
        mensajero: { valor: "502.00", nivel: "grupo_vehiculo", tarifaValorId: r.e.v.ME_gv },
        satelite: { valor: "50.00", nivel: "zona", tarifaValorId: r.e.v.SE },
      });
    });

    it("en el corte, M cobra 501 y M2 502; las dos satelites cobran su 50, con el propio o sin el", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        const g2 = await gestion(tx, await nuevaOrden(tx, e), e.M2, "entregado");
        const salida = await cortar(tx, e);
        return {
          e,
          g2,
          salida,
          filasM: await congelados(tx, [e.gestionId]),
          filasM2: await congelados(tx, [g2]),
          columnasM: await pagoDe(tx, e.gestionId),
          columnasM2: await pagoDe(tx, g2),
        };
      });
      expect(r.salida).toEqual({ mensajerosEvaluados: 2, vencidosCreados: 2, mensajerosSinZona: 0 });
      const satelite = (gestionId: string) => ({
        gestion: gestionId,
        actor: "satelite",
        concepto: "satelite_entregado",
        modo: "monto",
        valor: "50.00",
        nivel: "zona",
        tarifaValorId: r.e.v.SE,
        base: null,
        importe: "50.00",
      });
      expect(r.filasM).toEqual([
        filaMensajero(r.e.gestionId, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: r.e.v.ME_propio as string, importe: "501.00" }),
        satelite(r.e.gestionId),
      ]);
      expect(r.filasM2).toEqual([
        filaMensajero(r.g2, "mensajero_entregado", { valor: "502.00", nivel: "grupo_vehiculo", tarifaValorId: r.e.v.ME_gv as string, importe: "502.00" }),
        satelite(r.g2),
      ]);
      expect(r.columnasM).toMatchObject({ pago: "501.00", ingreso: "50.00" });
      expect(r.columnasM2).toMatchObject({ pago: "502.00", ingreso: "50.00" });
    });
  });

  describe("R17 — el % se calcula sobre el flete sin IVA de la orden, con la zona de M sin ningun valor de pago", () => {
    const CIFRAS: {
      nombre: string;
      fletes: { etiqueta: string; modo?: "monto" | "porcentaje"; valor: string; tienda?: boolean }[];
      base: string;
      pago: string;
    }[] = [
      // 3000.00 x 20 % = 600.00; con IVA serian 3390.00 x 20 % = 678.00.
      { nombre: "flete de 3.000 + 13 %: 600,00 y no 678,00", fletes: [{ etiqueta: "F", valor: "3000.00" }], base: "3000.00", pago: "600.00" },
      // Gana el pacto de la tienda: 2500.00 x 20 % = 500.00.
      {
        nombre: "precio de tienda de 2.500: 500,00",
        fletes: [
          { etiqueta: "F", valor: "3000.00" },
          { etiqueta: "FT", valor: "2500.00", tienda: true },
        ],
        base: "2500.00",
        pago: "500.00",
      },
      // 10 % x 20000.00 = 2000.00; 2000.00 x 20 % = 400.00.
      { nombre: "flete de 10 % sobre 20.000: 400,00", fletes: [{ etiqueta: "F", modo: "porcentaje", valor: "10.00" }], base: "2000.00", pago: "400.00" },
      // 3333.33 x 20 % = 666.666, que redondea hacia arriba.
      { nombre: "flete de 3.333,33: 666,67", fletes: [{ etiqueta: "F", valor: "3333.33" }], base: "3333.33", pago: "666.67" },
    ];

    it.each(CIFRAS)("$nombre", async ({ fletes, base: baseEsperada, pago }) => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const b = await sembrarBase(tx, { activada: true });
        // M en Z2 (sin valores) y la orden en Z: si la base saliera de la zona del mensajero, daria 0.
        await tx.usuario.update({ where: { id: b.M }, data: { zonaId: b.Z2 } });
        await valor(tx, b, "ME_propio", { concepto: "mensajero_entregado", modo: "porcentaje", valor: "20.00", mensajeroId: b.M });
        for (const f of fletes) {
          await valor(tx, b, f.etiqueta, {
            concepto: "tienda_flete_entregado",
            modo: f.modo ?? "monto",
            valor: f.valor,
            zonaId: b.Z,
            tiendaId: f.tienda === true ? b.fks.tiendaId : null,
          });
        }
        expect(await tx.tarifaValor.count({ where: { organizacionId: b.A, zonaId: b.Z2 } })).toBe(0);
        const g = await gestion(tx, await nuevaOrden(tx, b), b.M, "entregado");
        const previa = await vistaPrevia(tx, b, b.M);
        const cierreId = await solicitarNuevo(tx, b, b.M);
        return { b, g, previa: previa.totalPagoMensajero, total: await totalPago(tx, cierreId), filas: await congeladoDelMensajero(tx, g) };
      });
      expect(r.previa).toBe(pago);
      expect(r.total).toBe(pago);
      expect(r.filas).toEqual([
        filaMensajero(r.g, "mensajero_entregado", {
          modo: "porcentaje",
          valor: "20.00",
          nivel: "mensajero",
          tarifaValorId: r.b.v.ME_propio as string,
          base: baseEsperada,
          importe: pago,
        }),
      ]);
    });
  });

  it("R18 — reprogramado al 20 % sin flete de la tienda: 0,00, con la fila congelada de base 0,00", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const b = await sembrarBase(tx, { activada: true });
      await valor(tx, b, "MP_propio", { concepto: "mensajero_reprogramado", modo: "porcentaje", valor: "20.00", mensajeroId: b.M });
      // El flete por entregado existe: que no se tome por error como base del reprogramado.
      await valor(tx, b, "FE", { concepto: "tienda_flete_entregado", valor: "3000.00", zonaId: b.Z });
      const g = await gestion(tx, await nuevaOrden(tx, b), b.M, "reprogramado");
      const cierreId = await solicitarNuevo(tx, b, b.M);
      return { b, g, total: await totalPago(tx, cierreId), filas: await congeladoDelMensajero(tx, g), columnas: await pagoDe(tx, g) };
    });
    expect(r.total).toBe("0.00");
    expect(r.columnas.pago).toBe("0.00");
    expect(r.filas).toEqual([
      filaMensajero(r.g, "mensajero_reprogramado", {
        modo: "porcentaje",
        valor: "20.00",
        nivel: "mensajero",
        tarifaValorId: r.b.v.MP_propio as string,
        base: "0.00",
        importe: "0.00",
      }),
    ]);
  });

  describe("R19 — la base del % en 477 y 398 es el cobro congelado, no el de hoy", () => {
    /** Flete por rechazo de 10 % sobre un pedido de 20.000: 2000.00 congelados. Propio de rechazo al 50 %. */
    async function sembrarNuevo(tx: TxDeTest) {
      const b = await sembrarBase(tx, { activada: true });
      await valor(tx, b, "FE", { concepto: "tienda_flete_entregado", valor: "3000.00", zonaId: b.Z });
      await valor(tx, b, "FR", { concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: "10.00", zonaId: b.Z });
      await valor(tx, b, "ME_propio", { concepto: "mensajero_entregado", valor: "501.00", mensajeroId: b.M });
      await valor(tx, b, "MR_propio", { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "50.00", mensajeroId: b.M });
      const ordenId = await nuevaOrden(tx, b);
      const gestionId = await gestion(tx, ordenId, b.M, "entregado");
      const cierreId = await solicitarNuevo(tx, b, b.M);
      return { ...b, ordenId, gestionId, cierreId };
    }

    /** Despues de congelar, la tienda pasa de 10 % a 20 % y el pedido a 50.000: con lo vivo la base seria 10000.00. */
    async function cambiarLoVivo(tx: TxDeTest, e: Awaited<ReturnType<typeof sembrarNuevo>>) {
      await tx.tarifaValor.update({ where: { id: e.v.FR }, data: { valor: "20.00" } });
      await tx.orden.update({ where: { id: e.ordenId }, data: { montoCobrar: new Prisma.Decimal("50000.00") } });
      const congelado = await tx.cierreDetailConcepto.findFirstOrThrow({
        where: { cierreDetail: { cierreId: e.cierreId, ordenId: e.ordenId }, concepto: "tienda_flete_rechazo" },
        select: { valor: true },
      });
      expect(txt(congelado.valor)).toBe("10.00");
    }

    const esperadoNuevo = (gestionId: string, tarifaValorId: string) => [
      filaMensajero(gestionId, "mensajero_rechazo", {
        modo: "porcentaje",
        valor: "50.00",
        nivel: "mensajero",
        tarifaValorId,
        base: "2000.00", // 10 % x 20000.00; con lo vivo seria 20 % x 50000.00 = 10000.00
        importe: "1000.00",
      }),
    ];

    it("398: el valor de la tienda cambio tras congelar y la base sigue en 2.000", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarNuevo(tx);
        await cambiarLoVivo(tx, e);
        const salida = await corregirARechazada(tx, e, e.ordenId, e.gestionId);
        return { e, salida: salida.status, filas: await congeladoDelMensajero(tx, e.gestionId), total: await totalPago(tx, e.cierreId) };
      });
      expect(r.salida).toBe("updated");
      expect(r.filas).toEqual(esperadoNuevo(r.e.gestionId, r.e.v.MR_propio as string));
      expect(r.total).toBe("1000.00");
    });

    it("477: el valor de la tienda cambio tras congelar y la base sigue en 2.000", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarNuevo(tx);
        await resolverCierre(tx, e.cierreId, e.admin, "rechazado");
        await cambiarLoVivo(tx, e);
        const rehecha = await rehacer(tx, e, e.ordenId, e.gestionId, RECHAZO);
        const salida = await solicitar(tx, e, e.M);
        return { e, rehecha, salida, filas: await congeladoDelMensajero(tx, rehecha), total: await totalPago(tx, e.cierreId) };
      });
      expect(r.salida).toEqual({ status: "ok", via: "resolicitado" });
      expect(r.filas).toEqual(esperadoNuevo(r.rehecha, r.e.v.MR_propio as string));
      expect(r.total).toBe("1000.00");
    });

    /** Cierre congelado en el modelo VIEJO (flete devuelto 1000.00). La activacion y el propio llegan despues. */
    async function sembrarViejo(tx: TxDeTest) {
      const b = await sembrarBase(tx, { activada: false });
      const tarifa = await sembrarTarifaVieja(tx, b);
      const ordenId = await nuevaOrden(tx, b);
      const gestionId = await gestion(tx, ordenId, b.M, "entregado");
      const cierreId = await solicitarNuevo(tx, b, b.M);
      const detalle = await tx.cierreDetail.findFirstOrThrow({
        where: { cierreId, ordenId },
        select: { tarifaModelo: true, tarifaId: true },
      });
      expect(detalle).toEqual({ tarifaModelo: "viejo", tarifaId: tarifa });
      return { ...b, ordenId, gestionId, cierreId };
    }

    async function pasarAlNuevo(tx: TxDeTest, e: Base) {
      await sembrarActivacion(tx, e.A);
      // El flete nuevo (10 % del pedido = 2000.00) NO es lo que este cierre le cobra a la tienda.
      await valor(tx, e, "FR", { concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: "10.00", zonaId: e.Z });
      await valor(tx, e, "MR_propio", { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "50.00", mensajeroId: e.M });
    }

    const esperadoViejo = (gestionId: string, tarifaValorId: string) => [
      filaMensajero(gestionId, "mensajero_rechazo", {
        modo: "porcentaje",
        valor: "50.00",
        nivel: "mensajero",
        tarifaValorId,
        base: "1000.00", // el flete devuelto del viejo congelado
        importe: "500.00",
      }),
    ];

    it("398: cobro congelado del viejo y pago del nuevo: la base es el flete devuelto de 1.000", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarViejo(tx);
        await pasarAlNuevo(tx, e);
        const salida = await corregirARechazada(tx, e, e.ordenId, e.gestionId);
        return { e, salida: salida.status, filas: await congeladoDelMensajero(tx, e.gestionId), total: await totalPago(tx, e.cierreId) };
      });
      expect(r.salida).toBe("updated");
      expect(r.filas).toEqual(esperadoViejo(r.e.gestionId, r.e.v.MR_propio as string));
      expect(r.total).toBe("500.00");
    });

    it("477: cobro congelado del viejo y pago del nuevo: la base es el flete devuelto de 1.000", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarViejo(tx);
        await resolverCierre(tx, e.cierreId, e.admin, "rechazado");
        await pasarAlNuevo(tx, e);
        const rehecha = await rehacer(tx, e, e.ordenId, e.gestionId, RECHAZO);
        const salida = await solicitar(tx, e, e.M);
        return { e, rehecha, salida, filas: await congeladoDelMensajero(tx, rehecha), total: await totalPago(tx, e.cierreId) };
      });
      expect(r.salida).toEqual({ status: "ok", via: "resolicitado" });
      expect(r.filas).toEqual(esperadoViejo(r.rehecha, r.e.v.MR_propio as string));
      expect(r.total).toBe("500.00");
    });
  });

  it("R20 — M sin zona: la solicitud responde validation_error en zona, el corte lo cuenta y la vista previa da 0", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarCompleto(tx);
      await tx.usuario.update({ where: { id: e.M }, data: { zonaId: null } });
      const propios = await tx.tarifaValor.count({ where: { mensajeroId: e.M, concepto: "mensajero_entregado" } });
      const previa = await vistaPrevia(tx, e, e.M);
      const solicitud = await solicitar(tx, e, e.M);
      const corte = await cortar(tx, e);
      const cierres = await tx.cierreDia.count({ where: { mensajeroId: e.M } });
      // Control: el 0 lo pone la falta de zona, porque al devolverle la zona la misma vista paga el propio.
      await tx.usuario.update({ where: { id: e.M }, data: { zonaId: e.Z } });
      const conZona = await vistaPrevia(tx, e, e.M);
      return {
        propios,
        previa: { total: previa.totalPagoMensajero, pago: previa.grupos.entregado[0]?.pagoMensajero },
        solicitud,
        corte,
        cierres,
        conZona: conZona.totalPagoMensajero,
      };
    });
    expect(r.propios).toBe(1);
    expect(r.previa).toEqual({ total: "0.00", pago: "0.00" });
    expect(r.solicitud).toEqual({
      status: "validation_error",
      fieldErrors: { zona: ["No tenes una zona asignada; contacta a tu administrador."] },
    });
    expect(r.corte).toEqual({ mensajerosEvaluados: 1, vencidosCreados: 0, mensajerosSinZona: 1 });
    expect(r.cierres).toBe(0);
    expect(r.conZona).toBe("501.00");
  });

  // Los dos casos dan los MISMOS literales: el valor propio no mueve ni un centavo del modelo viejo.
  it.each([
    ["sin valor propio", false],
    ["con valor propio digitado", true],
  ])("R21 — sin activar, %s: paga el modelo viejo y fijar o quitar no crea activacion", async (_nombre, conPropio) => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const b = await sembrarBase(tx, { activada: false });
      const tarifaId = await sembrarTarifaVieja(tx, b);
      const g = await gestion(tx, await nuevaOrden(tx, b), b.M, "entregado");
      if (conPropio) {
        await fijarPorElServicio(tx, b, propio(b.M));
        const rechazo = await fijarPorElServicio(tx, b, propio(b.M, { concepto: "mensajero_rechazo" }));
        await quitarPorElServicio(tx, b, rechazo);
        expect(await tx.tarifaValor.count({ where: { mensajeroId: b.M } })).toBe(1);
      }
      const activaciones = await tx.tarifaActivacion.count({ where: { organizacionId: b.A } });
      const previa = await vistaPrevia(tx, b, b.M);
      const cierreId = await solicitarNuevo(tx, b, b.M);
      const detalle = await tx.cierreDetail.findFirstOrThrow({ where: { cierreId }, select: { tarifaModelo: true, tarifaId: true } });
      return {
        tarifaId,
        activaciones,
        previa: previa.totalPagoMensajero,
        detalle,
        total: await totalPago(tx, cierreId),
        pago: (await pagoDe(tx, g)).pago,
        filas: await congelados(tx, [g]),
      };
    });
    expect(r.activaciones).toBe(0);
    expect(r.previa).toBe("1500.00");
    expect(r.total).toBe("1500.00");
    expect(r.pago).toBe("1500.00");
    expect(r.detalle).toEqual({ tarifaModelo: "viejo", tarifaId: r.tarifaId });
    expect(r.filas).toEqual([]); // el viejo no congela pago por gestion
  });

  it("R22 — digita y activa: el cierre previo no cambia y el siguiente paga el propio", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const b = await sembrarBase(tx, { activada: false });
      await sembrarTarifaVieja(tx, b);
      const g1 = await gestion(tx, await nuevaOrden(tx, b), b.M, "entregado");
      const idPropio = await fijarPorElServicio(tx, b, propio(b.M));
      const c1 = await solicitarNuevo(tx, b, b.M);
      const antes = await fotoDelCierre(tx, b, c1, [g1]);

      await sembrarActivacion(tx, b.A);
      await valor(tx, b, "FE", { concepto: "tienda_flete_entregado", valor: "3000.00", zonaId: b.Z });
      const despues = await fotoDelCierre(tx, b, c1, [g1]);

      const g2 = await gestion(tx, await nuevaOrden(tx, b), b.M, "entregado");
      const c2 = await solicitarNuevo(tx, b, b.M);
      return { b, g2, idPropio, antes, despues, siguiente: await congeladoDelMensajero(tx, g2), total2: await totalPago(tx, c2) };
    });
    expect(r.antes.totales.pago).toBe("1500.00");
    expect(r.antes.pagos).toEqual([]);
    expect(r.despues).toEqual(r.antes);
    expect(r.total2).toBe("501.00");
    expect(r.siguiente).toEqual([
      filaMensajero(r.g2, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: r.idPropio, importe: "501.00" }),
    ]);
  });

  it("R24 — cambiar y quitar el propio tras congelar no mueve el cierre, y el siguiente usa lo nuevo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarCompleto(tx);
      const idPropio = e.v.ME_propio as string;
      const c1 = await solicitarNuevo(tx, e, e.M);
      const antes = await fotoDelCierre(tx, e, c1, [e.gestionId]);

      // Cambia: el reemplazo conserva el id de la fila.
      const idTrasCambio = await fijarPorElServicio(tx, e, propio(e.M, { valor: "777" }));
      const vivoTrasCambio = txt((await tx.tarifaValor.findUniqueOrThrow({ where: { id: idPropio }, select: { valor: true } })).valor);
      const trasCambio = await fotoDelCierre(tx, e, c1, [e.gestionId]);

      const g2 = await gestion(tx, await nuevaOrden(tx, e), e.M, "entregado");
      const c2 = await solicitarNuevo(tx, e, e.M);
      const filasC2 = await congeladoDelMensajero(tx, g2);

      // La aprobacion no mueve nada de lo que se leyo. Se aprueban los dos: con dos abiertos M estaria bloqueado.
      await resolverCierre(tx, c1, e.admin, "aprobado");
      await resolverCierre(tx, c2, e.admin, "aprobado");
      const trasAprobar = await fotoDelCierre(tx, e, c1, [e.gestionId]);

      // Se quita.
      await quitarPorElServicio(tx, e, idPropio);
      const quedan = await tx.tarifaValor.count({ where: { id: idPropio } });
      const trasQuitar = await fotoDelCierre(tx, e, c1, [e.gestionId]);
      const filaC2TrasQuitar = await congeladoDelMensajero(tx, g2);

      const g3 = await gestion(tx, await nuevaOrden(tx, e), e.M, "entregado");
      await solicitarNuevo(tx, e, e.M);
      const filasC3 = await congeladoDelMensajero(tx, g3);
      return { e, idPropio, idTrasCambio, vivoTrasCambio, antes, trasCambio, trasAprobar, trasQuitar, quedan, g2, filasC2, filaC2TrasQuitar, g3, filasC3 };
    });
    const g = r.e.gestionId;
    // El cierre, escrito a mano: 3000.00 + 13 % = 390.00 de IVA; 501.00 al mensajero y 50.00 a la satelite.
    expect(r.antes.totales).toEqual({ pago: "501.00", ingreso: "50.00", general: "20000.00", efectivo: "20000.00" });
    expect(r.antes.gestiones).toMatchObject([{ pago: "501.00", ingreso: "50.00" }]);
    // El detalle congela los dos fletes de la zona: el de rechazo es la base de una 398 posterior (SLT-52 R52).
    expect(r.antes.conceptos).toEqual(["tienda_flete_entregado:3000.00:zona", "tienda_flete_rechazo:2000.00:zona"]);
    expect(r.antes.walletEmpresa).toEqual(["ingreso_flete:3000.00", "ingreso_iva_flete:390.00"]);
    expect(r.antes.libroMensajero).toEqual(["pago_devengado:501.00", "pago_efectivo:501.00"]);
    expect(r.antes.egresoCaja).toEqual(["egreso_pago_mensajero:501.00"]);
    expect(r.antes.pagos.filter((p) => p.actor === "mensajero")).toEqual([
      filaMensajero(g, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: r.idPropio, importe: "501.00" }),
    ]);

    // El cambio ocurrio de verdad y no se movio nada, ni la traza: la fila es la misma.
    expect(r.idTrasCambio).toBe(r.idPropio);
    expect(r.vivoTrasCambio).toBe("777.00");
    expect(r.trasCambio).toEqual(r.antes);
    expect(r.trasAprobar).toEqual(r.antes);

    // Quitado: la fila se fue, los importes siguen iguales y la traza queda en NULL (FK SET NULL).
    expect(r.quedan).toBe(0);
    expect(sinTraza(r.trasQuitar)).toEqual(sinTraza(r.antes));
    expect(r.trasQuitar.pagos.filter((p) => p.actor === "mensajero")).toEqual([
      filaMensajero(g, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: null, importe: "501.00" }),
    ]);

    // El siguiente cierre tras cambiar paga 777; tras quitar, el nivel siguiente, 502.
    expect(r.filasC2).toEqual([
      filaMensajero(r.g2, "mensajero_entregado", { valor: "777.00", nivel: "mensajero", tarifaValorId: r.idPropio, importe: "777.00" }),
    ]);
    expect(r.filaC2TrasQuitar).toEqual([
      filaMensajero(r.g2, "mensajero_entregado", { valor: "777.00", nivel: "mensajero", tarifaValorId: null, importe: "777.00" }),
    ]);
    expect(r.filasC3).toEqual([
      filaMensajero(r.g3, "mensajero_entregado", { valor: "502.00", nivel: "grupo_vehiculo", tarifaValorId: r.e.v.ME_gv as string, importe: "502.00" }),
    ]);
  });

  describe("R25 — dado de baja o retirado: el corte le paga su propio por la gestion pendiente", () => {
    it.each(["inactivo", "bloqueado"] as const)("estado %s", async (estado) => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        await tx.usuario.update({ where: { id: e.M }, data: { estado } });
        const salida = await cortar(tx, e);
        return {
          e,
          salida,
          leido: await tx.usuario.findUniqueOrThrow({ where: { id: e.M }, select: { estado: true } }),
          propios: await tx.tarifaValor.count({ where: { mensajeroId: e.M } }),
          filas: await congeladoDelMensajero(tx, e.gestionId),
        };
      });
      expect(r.leido.estado).toBe(estado);
      expect(r.propios).toBe(2); // se conservan: entregado y rechazo
      expect(r.salida).toEqual({ mensajerosEvaluados: 1, vencidosCreados: 1, mensajerosSinZona: 0 });
      expect(r.filas).toEqual([
        filaMensajero(r.e.gestionId, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: r.e.v.ME_propio as string, importe: "501.00" }),
      ]);
    });

    it("cambio de rol: lo mismo con quien dejo de ser mensajero", async () => {
      const r = await enTransaccionRevertida(base, async (tx) => {
        const e = await sembrarCompleto(tx);
        const rolAdmin = await tx.rol.findUniqueOrThrow({ where: { value: "admin" }, select: { id: true } });
        await tx.usuario.update({ where: { id: e.M }, data: { rolId: rolAdmin.id } });
        const salida = await cortar(tx, e);
        return {
          e,
          salida,
          rol: (await tx.usuario.findUniqueOrThrow({ where: { id: e.M }, select: { rol: { select: { value: true } } } })).rol.value,
          propios: await tx.tarifaValor.count({ where: { mensajeroId: e.M } }),
          filas: await congeladoDelMensajero(tx, e.gestionId),
        };
      });
      expect(r.rol).toBe("admin");
      expect(r.propios).toBe(2);
      expect(r.salida).toEqual({ mensajerosEvaluados: 1, vencidosCreados: 1, mensajerosSinZona: 0 });
      expect(r.filas).toEqual([
        filaMensajero(r.e.gestionId, "mensajero_entregado", { valor: "501.00", nivel: "mensajero", tarifaValorId: r.e.v.ME_propio as string, importe: "501.00" }),
      ]);
    });
  });
});

/** Tarifa VIEJA de la tienda (flete 2000.00, devuelto 1000.00) y pago viejo de la zona (1500.00 y 700.00). */
async function sembrarTarifaVieja(tx: TxDeTest, b: Base): Promise<string> {
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
  return tarifa.id;
}
