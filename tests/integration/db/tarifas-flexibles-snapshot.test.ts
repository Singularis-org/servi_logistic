import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TarifaConcepto } from "@prisma/client";

import { prepararConsultaProductos } from "@/lib/analytics/productos-consulta";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierreAporteRepository } from "@/lib/repositories/CierreAporteRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { DineroProductosRepository } from "@/lib/repositories/DineroProductosRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { CRITERIO_DE_APORTE } from "@/lib/utils/aporte-por-orden";
import { costoRealDe } from "@/lib/utils/api-orden-costo";
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

// SLT-52 T5.4 (design §2.5, §7, §12.1) — EL CONGELADO DEL CIERRE Y SU LECTURA, CONTRA POSTGRES REAL.
//
// Por que aqui y no con dobles: lo que se prueba es SQL. Que `crearCierre` escriba
// `cierre_detail_concepto` y `gestion_pago_congelado` en la misma transaccion (R40), que la
// re-solicitud 477 y el corte diario congelen igual (R24, R33), y sobre todo que despues de cambiar
// y BORRAR valores y grupos el detalle, la aprobacion (los dos feeds de wallet que la aprobacion
// escribe), el aporte por orden, Analitica y el `costoReal` de la API lean lo congelado y no lo vivo
// (R41). Un doble no ve el `select` de la relacion `conceptos` ni el `json_agg` de Analitica.
//
// TODO DENTRO DE UNA TRANSACCION QUE SIEMPRE SE REVIERTE: ningun `tarifa_valor` sembrado aqui sale
// del test (un valor commiteado pasaria a esa empresa al modelo nuevo). El codigo de produccion corre
// con el rol `servi_app` y la empresa fijada (`comoApp`): la RLS filtra como en produccion. Las
// siembras, las mutaciones y las lecturas de control van como dueño.
//
// SIN DATOS FALLA: cada caso afirma primero lo que sembro; la siembra LANZA sin geografia o
// catalogos (`crearFksDeOrden`). Sin base, se SALTA con nombre.
//
// Los esperados son LITERALES, escritos a mano junto a su aritmetica.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };

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

/** Guia unica por corrida: `orden.num_guia` es UNIQUE global (SL-18). */
let siguienteGuia = 930_000_000 + Math.floor(Math.random() * 20_000_000);

interface Orden {
  ordenId: string;
  gestionId: string;
}

interface Escenario {
  A: string;
  fks: FksDeOrden;
  T: string;
  Z: string;
  M: string;
  admin: string;
  /** d1 en G1, d2 en G2, d3 en la zona sin grupo. */
  d1: string;
  d2: string;
  d3: string;
  G1: string;
  G2: string;
  /** id de cada `tarifa_valor` sembrado, por etiqueta. */
  v: Record<string, string>;
  /** o1 (d1), o2 (d2), o3 (d3): una gestion `entregado` de M cada una, sin cierre. */
  o1: Orden;
  o2: Orden;
  o3: Orden;
}

async function nuevaOrdenConGestion(
  tx: TxDeTest,
  fks: FksDeOrden,
  mensajeroId: string,
  distritoId: string,
  monto: string,
): Promise<Orden> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT52-${randomUUID().slice(0, 12)}`,
      destinatario: "Snapshot SLT-52",
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
  const gestion = await gestionEntregada(tx, orden.id, mensajeroId, monto);
  return { ordenId: orden.id, gestionId: gestion };
}

async function gestionEntregada(
  tx: TxDeTest,
  ordenId: string,
  mensajeroId: string,
  monto: string,
): Promise<string> {
  const g = await tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId,
      resultado: "entregado",
      montoRecibido: new Prisma.Decimal(monto),
      pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(monto) }] },
    },
    select: { id: true },
  });
  return g.id;
}

type ValorSembrado = {
  concepto: TarifaConcepto;
  modo?: "monto" | "porcentaje";
  valor: string;
  grupoId: string;
};

/**
 * La empresa A en el modelo NUEVO (tiene `tarifa_valor`). Todos los valores son de GRUPO de la zona Z,
 * sin tienda ni vehiculo: asi el pago distinto por grupo (R19/R20) y la orden «sin tarifa» (d3, que
 * no esta en ningun grupo y la zona no tiene valor) salen solos de la precedencia.
 *
 *   G1 (d1): flete entregado 1500.00 (IVA 13 %), fulfillment 450.00 (IVA 13 %), mensajero 800.00
 *   G2 (d2): flete entregado 2000.00 (IVA 13 %), mensajero 10 % del flete sin IVA, satelite 50.00
 *   d3     : nada -> cada concepto cuenta 0 y el cierre se crea igual (R24)
 */
const VALORES_SEMBRADOS = 6;

async function sembrarNuevo(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx);
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const admin = (await crearUsuarioDePrueba(tx, "admin")).id;
  const distritos = await tx.distrito.findMany({
    where: { cantonId: fks.cantonId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 3,
  });
  if (distritos.length < 3) throw new Error("Cartago/Cartago necesita al menos 3 distritos");
  const [d1, d2, d3] = distritos.map((d) => d.id) as [string, string, string];
  const Z = fks.zonaId;
  await tx.zonaDistrito.createMany({
    data: [
      { zonaId: Z, distritoId: d1 },
      { zonaId: Z, distritoId: d2 },
      { zonaId: Z, distritoId: d3 },
    ],
  });
  const grupo = async (nombre: string, distritoId: string) => {
    const g = await tx.grupoDistritos.create({ data: { zonaId: Z, nombre }, select: { id: true } });
    await tx.grupoDistritosDistrito.create({ data: { grupoId: g.id, zonaId: Z, distritoId } });
    return g.id;
  };
  const G1 = await grupo("G1", d1);
  const G2 = await grupo("G2", d2);

  const v: Record<string, string> = {};
  const s = async (etiqueta: string, d: ValorSembrado) => {
    const esTienda = d.concepto.startsWith("tienda_");
    const fila = await tx.tarifaValor.create({
      data: {
        concepto: d.concepto,
        modo: d.modo ?? "monto",
        valor: d.valor,
        ivaPct: esTienda ? "13.00" : null,
        zonaId: Z,
        grupoId: d.grupoId,
      },
      select: { id: true },
    });
    v[etiqueta] = fila.id;
  };
  await s("FE_G1", { concepto: "tienda_flete_entregado", valor: "1500.00", grupoId: G1 });
  await s("FF_G1", { concepto: "tienda_fulfillment", valor: "450.00", grupoId: G1 });
  await s("ME_G1", { concepto: "mensajero_entregado", valor: "800.00", grupoId: G1 });
  await s("FE_G2", { concepto: "tienda_flete_entregado", valor: "2000.00", grupoId: G2 });
  await s("ME_G2", { concepto: "mensajero_entregado", modo: "porcentaje", valor: "10.00", grupoId: G2 });
  await s("SE_G2", { concepto: "satelite_entregado", valor: "50.00", grupoId: G2 });

  const o1 = await nuevaOrdenConGestion(tx, fks, M, d1, "10000.00");
  const o2 = await nuevaOrdenConGestion(tx, fks, M, d2, "20000.00");
  const o3 = await nuevaOrdenConGestion(tx, fks, M, d3, "5000.00");
  return { A, fks, T: fks.tiendaId, Z, M, admin, d1, d2, d3, G1, G2, v, o1, o2, o3 };
}

/** Lo sembrado, afirmado ANTES de nada: sin esto un caso podria pasar con la base vacia. */
async function afirmarSembrado(tx: TxDeTest, e: Escenario) {
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(VALORES_SEMBRADOS);
  expect(await tx.grupoDistritosDistrito.count({ where: { organizacionId: e.A } })).toBe(2);
  expect(
    await tx.gestionOrden.count({ where: { mensajeroId: e.M, cierreId: null, anuladaAt: null } }),
  ).toBe(3);
}

// --------------------------------------------------------------------------------------------
// Produccion, con el rol de la app
// --------------------------------------------------------------------------------------------

/** Ejecuta `fn` con el rol de la app y la empresa `org` (la RLS filtra), y vuelve a dueño. */
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

/**
 * El servicio REAL de la solicitud (y de la re-solicitud 477) sobre el repositorio y el resolver
 * reales. Dobles solo para lo que no es de esta ficha: la zona del mensajero (Z, que ademas es la
 * central -> `bodega_central`), su vehiculo (ninguno), el bloqueo (ninguno) y las URLs firmadas.
 */
function servicioCierre(cli: PrismaClient, e: Escenario) {
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
    new TarifaZonaMensajeroRepository(cli),
  );
}

async function solicitar(tx: TxDeTest, e: Escenario): Promise<string> {
  const actor: Actor = { usuarioId: e.M, rol: "mensajero" };
  const r = await comoEmpresa(tx, e.A, () =>
    servicioCierre(clienteConSavepoint(tx), e).solicitarCierre(actor),
  );
  if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) {
    throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(r)}`);
  }
  return r.cierreId;
}

function repoAdmin(cli: PrismaClient) {
  return new CierresAdminRepository(
    cli,
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
 * Las CINCO lecturas del congelado (design §7) mas la de la API: el detalle del cierre de
 * administracion, los dos feeds que la APROBACION escribe en las wallets, el aporte por orden y
 * Analitica. Todas con el rol de la app.
 */
async function lecturas(tx: TxDeTest, e: Escenario, cierreId: string) {
  return comoEmpresa(tx, e.A, async () => {
    const cli = clienteConSavepoint(tx);
    const detalle = await repoAdmin(cli).findCierreByIdEnAlcance(cierreId, ALCANCE_CENTRAL);
    if (detalle === null) throw new Error("el detalle del cierre no se encontro en su alcance");
    const ingresoPorGestion = Object.fromEntries(
      detalle.gestiones.map((g) => [g.gestionId, g.ingresoEmpresa]),
    );
    const walletEmpresa = await new WalletFeedService().construirMovimientosDeIngreso(cierreId, tx);
    const walletTienda = await new WalletTiendaFeedService().construirMovimientosPorTienda(cierreId, tx);
    const aporte = await new CierreAporteRepository(tx).listarOrdenesQueAportan({
      cierreId,
      criterio: CRITERIO_DE_APORTE.ingreso_flete,
      rango: { skip: 0, take: 25 },
    });
    const dinero = await new DineroProductosRepository(tx).leerDineroPorOrden(consultaDeLaTienda(e.T));
    if (dinero.estado !== "ok") throw new Error("Analitica no devolvio filas");
    return {
      ingresoPorGestion,
      walletEmpresa: walletEmpresa.map((m) => `${m.categoria}:${m.monto}`).sort(),
      walletTienda: walletTienda.map((m) => JSON.stringify(m)).sort(),
      aporte: aporte.items,
      dinero: dinero.filas
        .map((f) => ({ ordenId: f.ordenId, congelada: f.congelada, fulfillment: f.fulfillment }))
        .sort((a, b) => a.ordenId.localeCompare(b.ordenId)),
    };
  });
}

function consultaDeLaTienda(tiendaId: string) {
  const preparada = prepararConsultaProductos(
    { tienda_id: [tiendaId] },
    { usuarioId: "maestro-del-test", rol: "maestro" } as never,
  );
  if (preparada.status !== "ok") throw new Error(`la consulta de prueba salio ${preparada.status}`);
  return preparada.consulta;
}

// --------------------------------------------------------------------------------------------
// Lecturas de control, como dueño
// --------------------------------------------------------------------------------------------

const txt = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));

/** La lectura sin la traza del valor de origen, que es lo unico que un borrado puede cambiar (SET NULL). */
function sinTraza<T>(x: T): unknown {
  return JSON.parse(JSON.stringify(x, (k, v: unknown) => (k === "tarifaValorId" ? undefined : v)));
}

async function conceptosCongelados(tx: TxDeTest, cierreId: string) {
  const filas = await tx.cierreDetail.findMany({
    where: { cierreId },
    select: {
      ordenId: true,
      tarifaModelo: true,
      tarifaId: true,
      conceptos: {
        select: { concepto: true, modo: true, valor: true, ivaPct: true, nivel: true, tarifaValorId: true },
        orderBy: { concepto: "asc" },
      },
    },
  });
  return Object.fromEntries(
    filas.map((f) => [
      f.ordenId,
      {
        tarifaModelo: f.tarifaModelo,
        tarifaId: f.tarifaId,
        conceptos: f.conceptos.map((c) => ({
          concepto: c.concepto,
          modo: c.modo,
          valor: txt(c.valor),
          ivaPct: txt(c.ivaPct),
          nivel: c.nivel,
          tarifaValorId: c.tarifaValorId,
        })),
      },
    ]),
  );
}

async function pagosCongelados(tx: TxDeTest, gestionIds: string[]) {
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

async function pagosDeGestiones(tx: TxDeTest, gestionIds: string[]) {
  const filas = await tx.gestionOrden.findMany({
    where: { id: { in: gestionIds } },
    select: { id: true, pagoMensajero: true, ingresoBodegaRechazo: true, cierreId: true },
  });
  return Object.fromEntries(
    filas.map((g) => [g.id, { pago: txt(g.pagoMensajero), ingreso: txt(g.ingresoBodegaRechazo), cierreId: g.cierreId }]),
  );
}

/** Los conceptos congelados que se esperan de cada orden, escritos a mano (ver `sembrarNuevo`). */
function conceptosEsperados(e: Escenario, ids: { fe1?: string | null; ff1?: string | null; fe2?: string | null } = {}) {
  const tv = (k: "fe1" | "ff1" | "fe2", def: string) => (k in ids ? ids[k] : def) as string | null;
  return {
    [e.o1.ordenId]: {
      tarifaModelo: "nuevo",
      tarifaId: null,
      conceptos: [
        { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00", nivel: "grupo", tarifaValorId: tv("fe1", e.v.FE_G1) },
        { concepto: "tienda_fulfillment", modo: "monto", valor: "450.00", ivaPct: "13.00", nivel: "grupo", tarifaValorId: tv("ff1", e.v.FF_G1) },
      ],
    },
    [e.o2.ordenId]: {
      tarifaModelo: "nuevo",
      tarifaId: null,
      conceptos: [
        { concepto: "tienda_flete_entregado", modo: "monto", valor: "2000.00", ivaPct: "13.00", nivel: "grupo", tarifaValorId: tv("fe2", e.v.FE_G2) },
      ],
    },
    // R24: d3 no tiene ningun valor -> sin filas, y el detalle existe igual.
    [e.o3.ordenId]: { tarifaModelo: "nuevo", tarifaId: null, conceptos: [] },
  };
}

/** El pago congelado esperado de las gestiones de o1 y o2 (o3 no tiene: sin tarifa, R24). */
function pagosEsperados(g1: string, g2: string, e: Escenario, ids: { me1?: string | null; me2?: string | null } = {}) {
  const tv = (k: "me1" | "me2", def: string) => (k in ids ? ids[k] : def) as string | null;
  return [
    // G1: monto 800.00 -> el importe es el valor; sin base (solo el % la lleva) y sin IVA (R34).
    { gestion: g1, actor: "mensajero", concepto: "mensajero_entregado", modo: "monto", valor: "800.00", nivel: "grupo", tarifaValorId: tv("me1", e.v.ME_G1), base: null, importe: "800.00" },
    // G2: 10 % sobre el flete SIN IVA de ESTA gestion (2000.00) = 200.00 (R28, P1).
    { gestion: g2, actor: "mensajero", concepto: "mensajero_entregado", modo: "porcentaje", valor: "10.00", nivel: "grupo", tarifaValorId: tv("me2", e.v.ME_G2), base: "2000.00", importe: "200.00" },
    { gestion: g2, actor: "satelite", concepto: "satelite_entregado", modo: "monto", valor: "50.00", nivel: "grupo", tarifaValorId: e.v.SE_G2, base: null, importe: "50.00" },
  ].sort((a, b) => `${a.gestion}${a.actor}`.localeCompare(`${b.gestion}${b.actor}`));
}

async function costoRealDeLaApi(tx: TxDeTest, org: string, tiendaId: string) {
  const r = await comoEmpresa(tx, org, () =>
    new OrdenRepository(clienteConSavepoint(tx)).listByOwner({ ownerId: tiendaId, skip: 0, take: 20 }),
  );
  return Object.fromEntries(
    r.items.map((i) => {
      const c = i.costeo.congelado;
      return [
        i.numRemision,
        c === null
          ? null
          : costoRealDe(c.tarifa, c.fulfillment, {
              esCentral: c.esCentral,
              esZonaEspecial: c.esZonaEspecial,
              montoCobrar: c.montoCobrar,
              cobraComision: c.cobraComision,
            }),
      ];
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

async function remisionDe(tx: TxDeTest, ordenId: string) {
  return (await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { numRemision: true } })).numRemision;
}

// --------------------------------------------------------------------------------------------
// Casos
// --------------------------------------------------------------------------------------------

describeSiHayBase("SLT-52 T5.4 — el cierre congela el modelo nuevo y lo lee congelado (Postgres real)", () => {
  it("R40/R24/R33/R19/R20 — la solicitud congela cobro y pago por gestion; pago distinto por grupo; sin tarifa = 0", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx);
      await afirmarSembrado(tx, e);
      const cierreId = await solicitar(tx, e);
      const gestiones = [e.o1.gestionId, e.o2.gestionId, e.o3.gestionId];
      const cierre = await tx.cierreDia.findUniqueOrThrow({
        where: { id: cierreId },
        select: { estado: true, totalPagoMensajero: true, totalIngresoBodegaRechazos: true, totalGeneral: true },
      });
      return {
        e,
        cierre: { estado: cierre.estado, pago: txt(cierre.totalPagoMensajero), ingreso: txt(cierre.totalIngresoBodegaRechazos), general: txt(cierre.totalGeneral) },
        conceptos: await conceptosCongelados(tx, cierreId),
        pagos: await pagosCongelados(tx, gestiones),
        columnas: await pagosDeGestiones(tx, gestiones),
        cierreId,
      };
    });
    const { e } = r;
    // El cierre se creo aunque d3 no tenga tarifa (R24).
    expect(r.cierre).toEqual({ estado: "solicitado", pago: "1000.00", ingreso: "50.00", general: "35000.00" });
    // R40: un concepto de cobro por fila, con modo, valor, IVA, nivel y valor de origen.
    expect(r.conceptos).toEqual(conceptosEsperados(e));
    // R40/R34: el pago de cada gestion, sin IVA; distinto por grupo (R19/R20); o3 sin fila (R24).
    expect(r.pagos).toEqual(pagosEsperados(e.o1.gestionId, e.o2.gestionId, e));
    // `importe` es EXACTAMENTE lo escrito en `pago_mensajero` / `ingreso_bodega_rechazo`.
    expect(r.columnas).toEqual({
      [e.o1.gestionId]: { pago: "800.00", ingreso: "0.00", cierreId: r.cierreId },
      [e.o2.gestionId]: { pago: "200.00", ingreso: "50.00", cierreId: r.cierreId },
      [e.o3.gestionId]: { pago: "0.00", ingreso: "0.00", cierreId: r.cierreId },
    });
  });

  it("R41/R46 — cambiar y BORRAR valores y grupos despues no mueve el detalle, la aprobacion, las wallets, el aporte ni Analitica", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx);
      await afirmarSembrado(tx, e);
      const cierreId = await solicitar(tx, e);
      const antes = await lecturas(tx, e, cierreId);

      // Se cambia todo lo que el cierre uso...
      await tx.tarifaValor.update({ where: { id: e.v.FE_G1 }, data: { valor: "9999.00", ivaPct: "0.00" } });
      await tx.tarifaValor.update({ where: { id: e.v.FF_G1 }, data: { valor: "7777.00" } });
      await tx.tarifaValor.update({ where: { id: e.v.ME_G1 }, data: { valor: "5555.00" } });
      const intermedio = await lecturas(tx, e, cierreId);
      // ...y se borra: dos valores sueltos y el grupo G1 entero (su CASCADE se lleva sus valores).
      await tx.tarifaValor.deleteMany({ where: { id: { in: [e.v.FE_G2, e.v.ME_G2] } } });
      await tx.grupoDistritos.delete({ where: { id: e.G1 } });
      const quedan = await tx.tarifaValor.count({ where: { organizacionId: e.A } });
      const despues = await lecturas(tx, e, cierreId);
      const conceptos = await conceptosCongelados(tx, cierreId);
      const pagos = await pagosCongelados(tx, [e.o1.gestionId, e.o2.gestionId, e.o3.gestionId]);

      // La API lee el congelado de un cierre APROBADO (415/R26).
      await resolverCierre(tx, cierreId, e.admin, "aprobado");
      const costo = await costoRealDeLaApi(tx, e.A, e.T);
      return {
        e, antes, intermedio, despues, quedan, conceptos, pagos, costo,
        rem1: await remisionDe(tx, e.o1.ordenId),
        rem2: await remisionDe(tx, e.o2.ordenId),
      };
    });
    const { e } = r;

    // Lo leido ANTES, con importes a mano. Detalle: o1 = 1500 + 13 % = 1695.00; el fulfillment
    // 450.00 y su IVA 58.50 (450 x 13 %) van FUERA del total (R31, R46).
    expect(r.antes.ingresoPorGestion[e.o1.gestionId]).toMatchObject({
      flete: "1500.00",
      ivaFlete: "195.00",
      total: "1695.00",
      fulfillment: "450.00",
      ivaFulfillment: "58.50",
      tarifa: null,
    });
    expect(r.antes.ingresoPorGestion[e.o2.gestionId]).toMatchObject({
      flete: "2000.00",
      ivaFlete: "260.00",
      total: "2260.00",
      fulfillment: "0.00",
      ivaFulfillment: "0.00",
    });
    expect(r.antes.ingresoPorGestion[e.o3.gestionId]).toMatchObject({
      total: "0.00",
      fulfillment: "0.00",
      ivaFulfillment: "0.00",
    });
    // La aprobacion escribe en la wallet de la empresa flete 3500.00 e IVA 455.00 (1500+2000;
    // 195+260); el fulfillment no entra (R31).
    expect(r.antes.walletEmpresa).toEqual(["ingreso_flete:3500.00", "ingreso_iva_flete:455.00"]);
    // Aporte por orden: las tres ordenes del cierre nuevo tienen «tarifa congelada».
    expect(r.antes.aporte.map((a) => a.ordenId).sort()).toEqual(
      [e.o1.ordenId, e.o2.ordenId, e.o3.ordenId].sort(),
    );
    // Analitica: el fulfillment de o1 sale del concepto congelado (R46).
    expect(r.antes.dinero.find((d) => d.ordenId === e.o1.ordenId)?.fulfillment).toBe("450.00");
    expect(r.antes.dinero.find((d) => d.ordenId === e.o2.ordenId)?.fulfillment).toBe("0.00");

    // R41: ni el cambio ni el borrado mueven un centimo de ninguna lectura.
    expect(r.quedan).toBe(1); // solo SE_G2 sigue vivo: la mutacion ocurrio de verdad
    expect(r.intermedio).toEqual(r.antes);
    // Tras BORRAR, lo unico que cambia es la traza (`tarifaValorId` -> null, FK SET NULL): ni un importe.
    expect(sinTraza(r.despues)).toEqual(sinTraza(r.antes));
    expect(JSON.stringify(r.despues)).not.toContain(e.v.FE_G1); // la traza si se fue: el borrado ocurrio
    // Lo congelado conserva los importes; la traza de los valores borrados queda en NULL (SET NULL).
    expect(r.conceptos).toEqual(conceptosEsperados(e, { fe1: null, ff1: null, fe2: null }));
    expect(r.pagos).toEqual(pagosEsperados(e.o1.gestionId, e.o2.gestionId, e, { me1: null, me2: null }));

    // R46 en la API: el `costoReal` de o1 trae el fulfillment y su IVA del congelado.
    expect(r.costo[r.rem1]).toEqual({
      flete: "1500.00",
      iva: "195.00",
      comision: "0.00",
      ivaComision: "0.00",
      fulfillment: "450.00",
      ivaFulfillment: "58.50",
    });
    expect(r.costo[r.rem2]).toEqual({
      flete: "2000.00",
      iva: "260.00",
      comision: "0.00",
      ivaComision: "0.00",
      fulfillment: "0.00",
      ivaFulfillment: "0.00",
    });
  });

  it("R41 — Analitica exige la empresa en el `json_agg`: una fila hija de OTRA empresa colgada del detalle no entra", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx);
      await afirmarSembrado(tx, e);
      const cierreId = await solicitar(tx, e);
      const B = (await crearOrganizacion(tx)).id;
      const detalleO2 = await tx.cierreDetail.findFirstOrThrow({
        where: { cierreId, ordenId: e.o2.ordenId },
        select: { id: true },
      });
      // La fila que el trigger de misma empresa y la RLS impiden en produccion, forzada como dueño
      // con los triggers apagados DENTRO de la transaccion revertida: mide el `WHERE` solo.
      await tx.$executeRawUnsafe(`ALTER TABLE "cierre_detail_concepto" DISABLE TRIGGER USER`);
      await tx.$executeRawUnsafe(
        `INSERT INTO "cierre_detail_concepto" ("id", "organizacion_id", "cierre_detail_id", "concepto", "modo", "valor", "iva_pct", "nivel")
         VALUES ($1, $2, $3, 'tienda_fulfillment', 'monto', 999, 13, 'zona')`,
        randomUUID(),
        B,
        detalleO2.id,
      );
      await tx.$executeRawUnsafe(`ALTER TABLE "cierre_detail_concepto" ENABLE TRIGGER USER`);
      const ajenas = await tx.cierreDetailConcepto.count({ where: { cierreDetailId: detalleO2.id, organizacionId: B } });
      // Como dueño (sin RLS): lo unico que separa a B de A en esa lectura es el `WHERE`.
      const dinero = await new DineroProductosRepository(tx).leerDineroPorOrden(consultaDeLaTienda(e.T));
      if (dinero.estado !== "ok") throw new Error("Analitica no devolvio filas");
      return { e, ajenas, filaO2: dinero.filas.find((f) => f.ordenId === e.o2.ordenId) };
    });
    expect(r.ajenas).toBe(1); // la fila ajena existe de verdad
    expect(r.filaO2?.fulfillment).toBe("0.00");
    const t = r.filaO2?.congelada?.tarifa;
    expect(t?.modelo === "nuevo" ? Object.keys(t.valores) : null).toEqual(["tienda_flete_entregado"]);
  });

  it("R24/R33/R40 — la re-solicitud de un rechazado (477) congela la rehecha igual que la solicitud", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx);
      await afirmarSembrado(tx, e);
      const cierreId = await solicitar(tx, e);
      // El admin lo rechaza; el mensajero deshace la gestion de o2 y la rehace (la rehecha nace sin cierre).
      await resolverCierre(tx, cierreId, e.admin, "rechazado");
      await tx.gestionOrden.update({ where: { id: e.o2.gestionId }, data: { anuladaAt: new Date() } });
      const rehecha = await gestionEntregada(tx, e.o2.ordenId, e.M, "20000.00");
      expect(await tx.gestionOrden.count({ where: { id: rehecha, cierreId: null } })).toBe(1);

      const actor: Actor = { usuarioId: e.M, rol: "mensajero" };
      const salida = await comoEmpresa(tx, e.A, () =>
        servicioCierre(clienteConSavepoint(tx), e).solicitarCierre(actor),
      );
      const cierre = await tx.cierreDia.findUniqueOrThrow({
        where: { id: cierreId },
        select: { estado: true, totalPagoMensajero: true },
      });
      return {
        e,
        salida,
        rehecha,
        estado: cierre.estado,
        totalPago: txt(cierre.totalPagoMensajero),
        pagos: await pagosCongelados(tx, [rehecha]),
        columnas: await pagosDeGestiones(tx, [rehecha]),
        cierreId,
      };
    });
    expect(r.salida).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.estado).toBe("solicitado");
    // La rehecha de o2 (G2) se congela con la MISMA forma que en la solicitud: 10 % de 2000.00 al
    // mensajero y 50.00 a la satelite, sin IVA, y `importe` = la columna (R40, R34).
    expect(r.pagos).toEqual(
      pagosEsperados("x", r.rehecha, r.e).filter((p) => p.gestion === r.rehecha),
    );
    expect(r.columnas).toEqual({ [r.rehecha]: { pago: "200.00", ingreso: "50.00", cierreId: r.cierreId } });
    // 800.00 (o1) + 200.00 (rehecha de o2) + 0.00 (o3, sin tarifa) — la anulada ya no suma.
    expect(r.totalPago).toBe("1000.00");
  });

  it("R24/R33/R40 — el corte diario congela igual: el `vencido` lleva sus conceptos y su pago por gestion", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await sembrarNuevo(tx);
      await afirmarSembrado(tx, e);
      const corte = new CorteDiarioService(
        { findMensajerosConActividadSinCierre: async () => [{ mensajeroId: e.M, zonaId: e.Z }] } as never,
        cierreDiaRepo(clienteConSavepoint(tx)),
        { findCentralZonaId: async () => e.Z } as never,
        { findUsuarioVehiculoId: async () => null, findEstatusIdByValue: async () => null } as never,
        new TarifaZonaMensajeroRepository(clienteConSavepoint(tx)),
        { warn: () => undefined },
      );
      const salida = await comoEmpresa(tx, e.A, () => corte.ejecutarCorte());
      const cierre = await tx.cierreDia.findFirstOrThrow({
        where: { mensajeroId: e.M },
        select: { id: true, estado: true },
      });
      const gestiones = [e.o1.gestionId, e.o2.gestionId, e.o3.gestionId];
      return {
        e,
        vencidos: salida.vencidosCreados,
        cierre,
        conceptos: await conceptosCongelados(tx, cierre.id),
        pagos: await pagosCongelados(tx, gestiones),
        columnas: await pagosDeGestiones(tx, gestiones),
      };
    });
    const { e } = r;
    expect(r.vencidos).toBe(1);
    expect(r.cierre.estado).toBe("vencido");
    expect(r.conceptos).toEqual(conceptosEsperados(e));
    expect(r.pagos).toEqual(pagosEsperados(e.o1.gestionId, e.o2.gestionId, e));
    expect(r.columnas).toEqual({
      [e.o1.gestionId]: { pago: "800.00", ingreso: "0.00", cierreId: r.cierre.id },
      [e.o2.gestionId]: { pago: "200.00", ingreso: "50.00", cierreId: r.cierre.id },
      [e.o3.gestionId]: { pago: "0.00", ingreso: "0.00", cierreId: r.cierre.id },
    });
  });

  it("R42/R47 — un cierre del modelo VIEJO se congela y se lee exactamente como antes", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const A = (await crearOrganizacion(tx)).id;
      await fijarEmpresa(tx, A);
      const fks = await crearFksDeOrden(tx);
      const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      const admin = (await crearUsuarioDePrueba(tx, "admin")).id;
      const distrito = await tx.distrito.findFirstOrThrow({ where: { cantonId: fks.cantonId }, select: { id: true } });
      // Tarifa VIEJA de la tienda en su zona y pago viejo de la zona. Ningun `tarifa_valor`.
      const tarifa = await tx.tarifa.create({
        data: {
          tiendaId: fks.tiendaId,
          zonaId: fks.zonaId,
          valorFlete: "2000.00",
          valorFleteDevuelto: "1000.00",
          valorFleteGam: "2500.00",
          valorFleteDevueltoGam: "1200.00",
          comisionCod: "0.00",
          ivaFlete: "13.00",
          ivaComisionCod: "13.00",
          fulfillment: "300.00",
        },
        select: { id: true },
      });
      await tx.tarifaZonaMensajero.create({
        data: { zonaId: fks.zonaId, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "1000.00" },
      });
      const o = await nuevaOrdenConGestion(tx, fks, M, distrito.id, "10000.00");
      expect(await tx.tarifaValor.count({ where: { organizacionId: A } })).toBe(0);
      expect(await tx.gestionOrden.count({ where: { mensajeroId: M, cierreId: null } })).toBe(1);

      const e = { A, Z: fks.zonaId, M } as Escenario;
      const cierreId = await solicitar(tx, e);
      const leer = () =>
        comoEmpresa(tx, A, () => repoAdmin(clienteConSavepoint(tx)).findCierreByIdEnAlcance(cierreId, ALCANCE_CENTRAL));
      const antes = (await leer())?.gestiones.find((g) => g.gestionId === o.gestionId)?.ingresoEmpresa;
      // La tarifa viva cambia despues: el viejo tambien lee lo congelado (69/R18).
      await tx.tarifa.update({ where: { id: tarifa.id }, data: { valorFlete: "5000.00", fulfillment: "900.00" } });
      const despues = (await leer())?.gestiones.find((g) => g.gestionId === o.gestionId)?.ingresoEmpresa;
      await resolverCierre(tx, cierreId, admin, "aprobado");
      const costo = await costoRealDeLaApi(tx, A, fks.tiendaId);
      return {
        tarifaId: tarifa.id,
        antes,
        despues,
        conceptos: await conceptosCongelados(tx, cierreId),
        pagos: await pagosCongelados(tx, [o.gestionId]),
        columnas: await pagosDeGestiones(tx, [o.gestionId]),
        costo: costo[await remisionDe(tx, o.ordenId)],
        ordenId: o.ordenId,
      };
    });
    // Congelado viejo: columnas de `tarifas`, ni conceptos ni pago congelado (R36).
    expect(r.conceptos).toEqual({ [r.ordenId]: { tarifaModelo: "viejo", tarifaId: r.tarifaId, conceptos: [] } });
    expect(r.pagos).toEqual([]);
    expect(Object.values(r.columnas)[0]).toMatchObject({ pago: "1500.00", ingreso: "0.00" });
    // Lectura de siempre: 2000 + 13 % = 2260.00; el fulfillment de la columna (300.00) y IVA 0 (R47).
    expect(r.antes).toMatchObject({
      flete: "2000.00",
      ivaFlete: "260.00",
      total: "2260.00",
      fulfillment: "300.00",
      ivaFulfillment: "0.00",
    });
    expect(r.antes?.tarifa).toMatchObject({ tarifaId: r.tarifaId, valorFlete: "2000.00", fulfillment: "300.00" });
    expect(r.despues).toEqual(r.antes);
    expect(r.costo).toEqual({
      flete: "2000.00",
      iva: "260.00",
      comision: "0.00",
      ivaComision: "0.00",
      fulfillment: "300.00",
      ivaFulfillment: "0.00",
    });
  });
});
