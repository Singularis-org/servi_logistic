import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  aprobarCierreBodega,
  listarCierresBodegaSolicitadosPaginado,
  listarConsolidacion,
  rechazarCierreBodega,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { reglasPaisFijas, ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  tomarLockDeEscrituraReal,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T1.5) — contra Postgres
 * real, POR LAS SERVER ACTIONS Y COMMITEANDO (como `cierre-detalle-central-lee-satelite-sql-real`):
 * cada action arma su servicio con `getPrismaClient()` (extension por empresa + `set_config` + rol
 * `servi_app`, que activa la RLS) y con su composition root. Las llamadas pasan SOLO `getActor`: si
 * `buildCierresBodegaAdminService` no inyectara `OrdenRepository`, la satelite seria `forbidden`
 * (memoria «el composition root que no inyecta»).
 *
 * LA SIEMBRA (importes escritos a mano; «hace N dias» = el dia calendario de Costa Rica, a las 12:00):
 *   Empresa A, zona Z1 (satelite S1):
 *     CB1 pendiente:                 general 50 000,00 − pago 4 000,00 − bodega 1 000,00 = 45 000,00.
 *         Con UN cierre del dia y dos gestiones: A del modelo NUEVO con fulfillment cargado (cargo
 *         2026-11-06 15:00) y C del modelo VIEJO con tarifa de fulfillment 450,00.
 *     CB2 recibido completo hace 3 dias:    30 000,00 − 2 000,00 = 28 000,00; recibido 28 000,00.
 *     CB3 recibido incompleto hace 10 dias: 20 000,00 − 1 500,00 − 500,00 = 18 000,00; recibido 15 000,00.
 *     CB4 recibido completo hace 45 dias:   12 000,00 − 1 000,00 = 11 000,00; recibido 11 000,00.
 *     CB8 recibido completo el dia 31 hacia atras (hace 30 dias): 6 000,00; recibido 6 000,00.
 *   Empresa A, zona Z2 (satelite S2): CB5 pendiente 9 999,00; CB6 recibido 7 777,00 hace 2 dias.
 *   Empresa B, zona ZB: CB7 pendiente 5 555,00.
 *   S0: adminSatelite de A sin zona.
 *
 * Antes de afirmar se cuenta lo sembrado y se falla si falta. La siembra se borra en el `afterAll`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Costa Rica es UTC−6 todo el año: las 12:00 de allí son las 18:00 UTC. */
const MEDIODIA_CR_EN_UTC = 18;

/** La fecha calendario de hoy en Costa Rica, `YYYY-MM-DD`. Independiente de `calendario-zona`. */
function hoyCR(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
/** El instante de las 12:00 de Costa Rica de hace `dias` dias calendario. */
function mediodiaCRHace(dias: number): Date {
  const [y, m, d] = hoyCR().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias, MEDIODIA_CR_EN_UTC));
}
function fechaCRHace(dias: number): string {
  return new Date(mediodiaCRHace(dias).getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface CierreSembrado {
  general: string;
  pago?: string;
  bodega?: string;
  solicitadoHace: number;
  recibido?: { monto: string; hace: number };
}

interface EmpresaA {
  organizacionId: string;
  maestro: Actor;
  s1: Actor;
  s2: Actor;
  s0: Actor;
  z1: string;
  z2: string;
  cb: Record<"CB1" | "CB2" | "CB3" | "CB4" | "CB5" | "CB6" | "CB8", string>;
  gestion: { A: string; C: string };
}
interface EmpresaB {
  organizacionId: string;
  maestro: Actor;
  cb7: string;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function cierreBodega(
  tx: Tx,
  zonaId: string,
  solicitadoPor: string,
  maestroId: string,
  c: CierreSembrado,
): Promise<string> {
  const recibido = c.recibido;
  const { id } = await tx.cierreBodega.create({
    data: {
      zonaId,
      solicitadoPor,
      // El `CHECK` de la 431: con marca, `aprobado` + `conciliado_por` + `monto_recibido`.
      estado: recibido ? "aprobado" : "solicitado",
      totalEfectivo: new Prisma.Decimal(c.general),
      totalGeneral: new Prisma.Decimal(c.general),
      totalPagoMensajero: new Prisma.Decimal(c.pago ?? "0.00"),
      totalIngresoBodegaRechazos: new Prisma.Decimal(c.bodega ?? "0.00"),
      solicitadoAt: mediodiaCRHace(c.solicitadoHace),
      ...(recibido
        ? {
            conciliadoAt: mediodiaCRHace(recibido.hace),
            conciliadoPor: maestroId,
            montoRecibido: new Prisma.Decimal(recibido.monto),
            resueltoAt: mediodiaCRHace(recibido.hace),
            resueltoPor: maestroId,
          }
        : {}),
    },
    select: { id: true },
  });
  return id;
}

async function zona(tx: Tx, nombre: string): Promise<string> {
  const sufijo = randomUUID().slice(0, 8);
  return (
    await tx.zona.create({
      data: { nombre: `${nombre} SLT-107 ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    })
  ).id;
}

async function satelite(tx: Tx, zonaId: string | null, organizacionId: string): Promise<Actor> {
  const u = await crearUsuarioDePrueba(tx, "adminSatelite");
  if (zonaId !== null) await tx.usuario.update({ where: { id: u.id }, data: { zonaId } });
  return { usuarioId: u.id, rol: "adminSatelite", organizacionId };
}

/** El cierre del dia de CB1: dos gestiones, una de cada modelo, con fulfillment. */
async function cierreDiaConGestiones(tx: Tx, z1: string, cb1: string, sufijo: string) {
  const estatus = await tx.orderStatus.findUnique({ where: { value: "en_reparto" }, select: { id: true } });
  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  if (estatus === null || canton === null) {
    throw new Error("faltan catalogos (`order_status`, `canton`): migrate deploy + db:seed");
  }
  const tienda = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const tarifaVieja = await tx.tarifa.create({
    data: {
      tiendaId: tienda,
      zonaId: null,
      valorFlete: new Prisma.Decimal("2000.00"),
      valorFleteGam: new Prisma.Decimal("2500.00"),
      valorFleteDevuelto: new Prisma.Decimal("1500.00"),
      valorFleteDevueltoGam: new Prisma.Decimal("1800.00"),
      fulfillment: new Prisma.Decimal("450.00"),
      comisionCod: new Prisma.Decimal("3.00"),
      ivaFlete: new Prisma.Decimal("13.00"),
      ivaComisionCod: new Prisma.Decimal("13.00"),
    },
    select: { id: true },
  });
  const cierreDiaId = (
    await tx.cierreDia.create({
      data: {
        mensajeroId: mensajero,
        estado: "aprobado",
        destinoTipo: "bodega_satelite",
        destinoZonaId: z1,
        cierreBodegaId: cb1,
      },
      select: { id: true },
    })
  ).id;
  const orden = async (clave: string, montoCobrar: string) =>
    (
      await tx.orden.create({
        data: {
          numRemision: `R-${sufijo}-${clave}`,
          destinatario: `Dest ${clave}`,
          telefonoDest: "88880000",
          producto: `Prod ${clave}`,
          montoCobrar: new Prisma.Decimal(montoCobrar),
          cobraComision: false,
          estatusId: estatus.id,
          mensajeroAsignadoId: mensajero,
          tiendaId: tienda,
          zonaId: z1,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
        },
        select: { id: true },
      })
    ).id;
  const ordenA = await orden("A", "25000.00");
  const ordenC = await orden("C", "10000.00");
  const detalle = (ordenId: string, clave: string, montoCobrar: string, modelo: "viejo" | "nuevo") =>
    tx.cierreDetail.create({
      data: {
        cierreId: cierreDiaId,
        ordenId,
        montoCobrar: new Prisma.Decimal(montoCobrar),
        cobraComision: false,
        zonaId: z1,
        tiendaId: tienda,
        esCentral: false,
        esZonaEspecial: false,
        tarifaModelo: modelo,
        ...(modelo === "viejo"
          ? {
              tarifaId: tarifaVieja.id,
              tarifaValorFlete: new Prisma.Decimal("2000.00"),
              tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
              tarifaValorFleteDevuelto: new Prisma.Decimal("1500.00"),
              tarifaValorFleteDevueltoGam: new Prisma.Decimal("1800.00"),
              tarifaComisionCod: new Prisma.Decimal("3.00"),
              tarifaIvaFlete: new Prisma.Decimal("13.00"),
              tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
              tarifaFulfillment: new Prisma.Decimal("450.00"),
            }
          : {}),
        numRemision: `R-${sufijo}-${clave}`,
        destinatario: `Dest ${clave}`,
        producto: `Prod ${clave}`,
        tiendaNombre: "Tienda SLT-107",
        zonaNombre: "Z1 SLT-107",
        provinciaNombre: "Provincia",
        cantonNombre: "Canton",
      },
      select: { id: true },
    });
  const detA = (await detalle(ordenA, "A", "25000.00", "nuevo")).id;
  await detalle(ordenC, "C", "10000.00", "viejo");
  await tx.cierreDetailConcepto.create({
    data: {
      cierreDetailId: detA,
      concepto: "tienda_flete_entregado",
      modo: "monto",
      valor: new Prisma.Decimal("3500.00"),
      ivaPct: new Prisma.Decimal("13.00"),
      nivel: "zona",
      tarifaValorId: null,
    },
  });
  await tx.cierreDetailConcepto.create({
    data: {
      cierreDetailId: detA,
      concepto: "tienda_fulfillment",
      modo: "monto",
      valor: new Prisma.Decimal("600.00"),
      ivaPct: new Prisma.Decimal("13.00"),
      nivel: "tienda_general",
      tarifaValorId: null,
    },
  });
  const gestion = async (ordenId: string, monto: string) =>
    (
      await tx.gestionOrden.create({
        data: {
          ordenId,
          mensajeroId: mensajero,
          resultado: "entregado",
          montoRecibido: new Prisma.Decimal(monto),
          metodoPago: "efectivo",
          cierreId: cierreDiaId,
          pagoMensajero: new Prisma.Decimal("0.00"),
          ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
        },
        select: { id: true },
      })
    ).id;
  const A = await gestion(ordenA, "25000.00");
  const C = await gestion(ordenC, "10000.00");
  // El cargo de fulfillment de A: la app no lo puede escribir (REVOKE, SLT-94); se inserta como el
  // trigger, con el cliente dueño.
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden_fulfillment_movimiento" ("id", "orden_id", "tienda_id", "secuencia", "tipo",
       "causa", "monto", "iva_pct", "iva", "ocurrido_at")
     VALUES ($1, $2, $3, 1, 'cargo'::"orden_fulfillment_movimiento_tipo",
       'creacion'::"orden_fulfillment_movimiento_causa", 600, 13, 78, '2026-11-06 15:00:00'::timestamp)`,
    randomUUID(),
    ordenA,
    tienda,
  );
  return { A, C };
}

async function sembrarA(base: PrismaClient): Promise<EmpresaA> {
  const organizacionId = (await crearOrganizacion(base, { nombre: "Empresa A de SLT-107" })).id;
  return base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const z1 = await zona(tx, "Z1");
      const z2 = await zona(tx, "Z2");
      const s1 = await satelite(tx, z1, organizacionId);
      const s2 = await satelite(tx, z2, organizacionId);
      const s0 = await satelite(tx, null, organizacionId);
      const de = (z: string, s: Actor, c: CierreSembrado) => cierreBodega(tx, z, s.usuarioId, maestro.id, c);
      const cb = {
        CB1: await de(z1, s1, { general: "50000.00", pago: "4000.00", bodega: "1000.00", solicitadoHace: 1 }),
        CB2: await de(z1, s1, {
          general: "30000.00",
          pago: "2000.00",
          solicitadoHace: 4,
          recibido: { monto: "28000.00", hace: 3 },
        }),
        CB3: await de(z1, s1, {
          general: "20000.00",
          pago: "1500.00",
          bodega: "500.00",
          solicitadoHace: 11,
          recibido: { monto: "15000.00", hace: 10 },
        }),
        CB4: await de(z1, s1, {
          general: "12000.00",
          pago: "1000.00",
          solicitadoHace: 46,
          recibido: { monto: "11000.00", hace: 45 },
        }),
        // El dia 31 contando hoy: fuera de «Recibido por la central (30 días)».
        CB8: await de(z1, s1, { general: "6000.00", solicitadoHace: 31, recibido: { monto: "6000.00", hace: 30 } }),
        CB5: await de(z2, s2, { general: "9999.00", solicitadoHace: 1 }),
        CB6: await de(z2, s2, { general: "7777.00", solicitadoHace: 3, recibido: { monto: "7777.00", hace: 2 } }),
      };
      const gestion = await cierreDiaConGestiones(tx, z1, cb.CB1, randomUUID().slice(0, 8));
      return {
        organizacionId,
        maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
        s1,
        s2,
        s0,
        z1,
        z2,
        cb,
        gestion,
      };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

async function sembrarB(base: PrismaClient): Promise<EmpresaB> {
  const organizacionId = (await crearOrganizacion(base, { nombre: "Empresa B de SLT-107" })).id;
  return base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const zb = await zona(tx, "ZB");
      const sb = await satelite(tx, zb, organizacionId);
      const cb7 = await cierreBodega(tx, zb, sb.usuarioId, maestro.id, { general: "5555.00", solicitadoHace: 1 });
      return { organizacionId, maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId }, cb7 };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/** Tablas con `organizacion_id`, para borrar todo lo de las empresas sembradas. */
async function tablasDeNegocio(base: PrismaClient): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ t: string }[]>(
    `SELECT c.table_name AS t
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  return filas.map((f) => f.t);
}

/** Borra por pasadas (cada borrado en su SAVEPOINT) hasta que no queda nada; si una pasada no avanza, falla. */
async function limpiar(base: PrismaClient, tablas: string[], ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await base.$transaction(
    async (tx) => {
      let pendientes = [...tablas];
      while (pendientes.length > 0) {
        const fallidas: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT limpiar_slt107`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organizacion_id = ANY($1::text[])`, ids);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT limpiar_slt107`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT limpiar_slt107`);
            fallidas.push(t);
          }
        }
        if (fallidas.length === pendientes.length) {
          throw new Error(`SLT-107: no se pudo limpiar ${fallidas.join(", ")}`);
        }
        pendientes = fallidas;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE id = ANY($1::text[])`, ids);
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/** Los seis campos del fulfillment de R283, anulados: lo que la satelite debe recibir. */
function sinFulfillment(i: IngresoEmpresaDTO | null | undefined) {
  if (i === null || i === undefined) return i;
  return {
    ...i,
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: i.tarifa === null ? null : { ...i.tarifa, fulfillment: null },
    fulfillmentConIva: null,
    ivaPctFulfillment: null,
    fulfillmentCargadoAt: null,
  };
}

describeSiHayBase("SLT-107 — la satélite lee su cierre de bodega y sus cifras de «Solicitados» (Postgres real)", () => {
  let base: PrismaClient;
  let tablas: string[];
  let A: EmpresaA;
  let B: EmpresaB;
  let soltarLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    soltarLock = await tomarLockDeEscrituraReal();
    base = crearPrismaDeTest();
    tablas = await tablasDeNegocio(base);
    if (!tablas.includes("cierre_bodega")) {
      throw new Error("`cierre_bodega` no tiene `organizacion_id`: aplica las migraciones");
    }
    A = await sembrarA(base);
    B = await sembrarB(base);
  }, 120_000);

  afterAll(async () => {
    try {
      await limpiar(
        base,
        tablas,
        [A?.organizacionId, B?.organizacionId].filter((x): x is string => x !== undefined),
      );
    } finally {
      await base?.$disconnect();
      await soltarLock?.();
    }
  }, 120_000);

  const ver = (org: string, quien: Actor, cierreBodegaId: string) =>
    conEmpresa(org, () => verCierreBodegaDetalle({ cierreBodegaId }, { getActor: async () => quien }));

  it("la siembra existe: 7 cierres de bodega en A (5 en Z1, 2 en Z2), 1 en B, el cierre del dia de CB1 y su cargo", async () => {
    const porZona = await base.cierreBodega.groupBy({
      by: ["organizacionId", "zonaId"],
      where: { organizacionId: { in: [A.organizacionId, B.organizacionId] } },
      _count: { _all: true },
    });
    const cuenta = new Map(porZona.map((f) => [`${f.organizacionId}/${f.zonaId}`, f._count._all]));
    expect(cuenta.get(`${A.organizacionId}/${A.z1}`)).toBe(5);
    expect(cuenta.get(`${A.organizacionId}/${A.z2}`)).toBe(2);
    expect(porZona.filter((f) => f.organizacionId === B.organizacionId).map((f) => f._count._all)).toEqual([1]);
    const conciliados = await base.cierreBodega.count({
      where: { id: { in: Object.values(A.cb) }, conciliadoAt: { not: null } },
    });
    expect(conciliados).toBe(5); // CB2, CB3, CB4, CB8 y CB6
    expect(await base.gestionOrden.count({ where: { id: { in: [A.gestion.A, A.gestion.C] } } })).toBe(2);
    expect(await base.cierreDia.count({ where: { cierreBodegaId: A.cb.CB1 } })).toBe(1);
    const cargos = await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM orden_fulfillment_movimiento m
         JOIN gestion_orden g ON g.orden_id = m.orden_id WHERE g.id = $1`,
      A.gestion.A,
    );
    expect(cargos[0].n).toBe(1);
  });

  it("R280/R283: S1 lee CB1 de su zona por la Server Action (solo `getActor`): ok, fulfillment en null en las dos gestiones", async () => {
    const r = await ver(A.organizacionId, A.s1, A.cb.CB1);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.cierre.cierreBodegaId).toBe(A.cb.CB1);
    expect(r.cierre.paraLaCentral).toBe("45000.00");
    const gestiones = r.cierres.flatMap((c) => c.grupos.entregado);
    expect(gestiones.map((g) => g.gestionId).sort()).toEqual([A.gestion.A, A.gestion.C].sort());
    for (const g of gestiones) {
      const i = g.ingresoEmpresa;
      expect(i).toBeTruthy();
      expect([i?.fulfillment, i?.ivaFulfillment, i?.tarifa?.fulfillment ?? null]).toEqual([null, null, null]);
      expect([i?.fulfillmentConIva ?? null, i?.ivaPctFulfillment ?? null, i?.fulfillmentCargadoAt ?? null]).toEqual([
        null,
        null,
        null,
      ]);
    }
    expect(r.cierre.desmarcable).toBe(false);
  });

  it("R284: S1 y el maestro leen CB1 igual, salvo los campos de R283 (la central SÍ ve el fulfillment de la base)", async () => {
    const central = await ver(A.organizacionId, A.maestro, A.cb.CB1);
    const sat = await ver(A.organizacionId, A.s1, A.cb.CB1);
    if (central.status !== "ok" || sat.status !== "ok") throw new Error(`esperaba ok: ${central.status}/${sat.status}`);

    // Control: la base SÍ tiene fulfillment, y la central lo recibe.
    const gA = central.cierres.flatMap((c) => c.grupos.entregado).find((g) => g.gestionId === A.gestion.A);
    const gC = central.cierres.flatMap((c) => c.grupos.entregado).find((g) => g.gestionId === A.gestion.C);
    expect(gA?.ingresoEmpresa?.fulfillmentCargadoAt).toBe("2026-11-06T15:00:00.000Z");
    expect(gC?.ingresoEmpresa?.tarifa?.fulfillment).toBe("450.00");

    const normal = (x: typeof central) => ({
      ...x,
      cierres: x.cierres.map((c) => ({
        ...c,
        grupos: Object.fromEntries(
          Object.entries(c.grupos).map(([k, gs]) => [
            k,
            gs.map((g) => ({ ...g, ingresoEmpresa: sinFulfillment(g.ingresoEmpresa) })),
          ]),
        ),
      })),
    });
    expect(normal(sat)).toEqual(normal(central));
    expect(sat.porcentajesReparto).toEqual(central.porcentajesReparto);
  });

  it("R283 sobre la base: CB2 (conciliado, sin asientos ni ajuste) es desmarcable para el maestro y no para S1", async () => {
    const central = await ver(A.organizacionId, A.maestro, A.cb.CB2);
    const sat = await ver(A.organizacionId, A.s1, A.cb.CB2);
    if (central.status !== "ok" || sat.status !== "ok") throw new Error(`esperaba ok: ${central.status}/${sat.status}`);
    expect(central.cierre.desmarcable).toBe(true);
    expect(sat.cierre.desmarcable).toBe(false);
    expect({ ...sat.cierre, desmarcable: true }).toEqual(central.cierre);
  });

  it("R281: S1 no lee CB5 (otra zona) ni un id inexistente; S0 (sin zona) no lee CB1 — todo `forbidden`", async () => {
    expect(await ver(A.organizacionId, A.s1, A.cb.CB5)).toEqual({ status: "forbidden" });
    expect(await ver(A.organizacionId, A.s1, randomUUID())).toEqual({ status: "forbidden" });
    expect(await ver(A.organizacionId, A.s0, A.cb.CB1)).toEqual({ status: "forbidden" });
    // Control: S2 sí lee el suyo.
    expect((await ver(A.organizacionId, A.s2, A.cb.CB5)).status).toBe("ok");
  });

  it("empresa cruzada: el maestro de A no lee CB7 (de B) -> `no_encontrada`; el de B sí", async () => {
    expect(await ver(A.organizacionId, A.maestro, B.cb7)).toEqual({ status: "no_encontrada" });
    expect((await ver(B.organizacionId, B.maestro, B.cb7)).status).toBe("ok");
  });

  it("R287: las cifras de «Solicitados» de S1, con literales (Z2 y B no entran; CB4 y CB8 fuera de los 30 días)", async () => {
    const r = await conEmpresa(A.organizacionId, () => listarConsolidacion({ getActor: async () => A.s1 }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.solicitadosResumen).toEqual({
      porLlegar: { monto: "45000.00", cierres: 1 }, // CB1
      recibido30Dias: { monto: "43000.00", cierres: 2 }, // CB2 28 000,00 + CB3 15 000,00
      faltaPorRecibir: { monto: "3000.00", cierres: 1 }, // CB3: 18 000,00 − 15 000,00
    });
  });

  it("R287: las de S2 son las de Z2 (9 999,00 por llegar; 7 777,00 recibido); S0 sin zona, ceros", async () => {
    const r2 = await conEmpresa(A.organizacionId, () => listarConsolidacion({ getActor: async () => A.s2 }));
    if (r2.status !== "ok") throw new Error(`esperaba ok: ${r2.status}`);
    expect(r2.solicitadosResumen).toEqual({
      porLlegar: { monto: "9999.00", cierres: 1 },
      recibido30Dias: { monto: "7777.00", cierres: 1 },
      faltaPorRecibir: { monto: "0.00", cierres: 0 },
    });
    const r0 = await conEmpresa(A.organizacionId, () => listarConsolidacion({ getActor: async () => A.s0 }));
    if (r0.status !== "ok") throw new Error(`esperaba ok: ${r0.status}`);
    expect(r0.solicitadosResumen).toEqual({
      porLlegar: { monto: "0.00", cierres: 0 },
      recibido30Dias: { monto: "0.00", cierres: 0 },
      faltaPorRecibir: { monto: "0.00", cierres: 0 },
    });
  });

  it("T0.3 (a): CB4, recibido hace 45 días y corregido hoy con «Corregir recibido», cuenta en los 30 días", async () => {
    const r = await enTransaccionRevertida(
      base,
      async (tx) => {
        const c = clienteConSavepoint(tx);
        const corregido = await new CierresBodegaAdminRepository(c).corregirConciliacion({
          id: A.cb.CB4,
          montoRecibido: "10500.00",
          nota: null,
          actorUsuarioId: A.maestro.usuarioId,
          zonaHoraria: ZONA_DE_CR,
        });
        const lista = await new CierreBodegaService(
          new CierreBodegaRepository(c),
          { findUsuarioZonaId: async () => A.z1 },
          reglasPaisFijas(),
        ).listarConsolidacion(A.s1);
        return { corregido, lista };
      },
      { organizacionId: A.organizacionId },
    );
    expect(r.corregido).toBe("updated");
    if (r.lista.status !== "ok") throw new Error(`esperaba ok: ${r.lista.status}`);
    expect(r.lista.solicitadosResumen).toEqual({
      porLlegar: { monto: "45000.00", cierres: 1 },
      recibido30Dias: { monto: "53500.00", cierres: 3 }, // + CB4 corregido: 10 500,00
      faltaPorRecibir: { monto: "3500.00", cierres: 2 }, // + CB4: 11 000,00 − 10 500,00
    });
  });

  it("R52: la lista de S1 respeta el rango de `solicitadoAt` (hace 20 días a hoy deja fuera CB4 y CB8) y su `total`", async () => {
    const pedir = (filtros?: { desde: string; hasta: string }) =>
      conEmpresa(A.organizacionId, () =>
        listarCierresBodegaSolicitadosPaginado(
          { page: 1, pageSize: 50, ...(filtros ? { filtros } : {}) },
          { getActor: async () => A.s1 },
        ),
      );
    const todo = await pedir();
    if (todo.status !== "ok") throw new Error(`esperaba ok: ${JSON.stringify(todo)}`);
    expect(todo.total).toBe(5);
    expect(new Set(todo.items.map((i) => i.cierreBodegaId))).toEqual(
      new Set([A.cb.CB1, A.cb.CB2, A.cb.CB3, A.cb.CB4, A.cb.CB8]),
    );

    const rango = await pedir({ desde: fechaCRHace(20), hasta: hoyCR() });
    if (rango.status !== "ok") throw new Error(`esperaba ok: ${JSON.stringify(rango)}`);
    expect(rango.total).toBe(3);
    expect(rango.items.map((i) => i.cierreBodegaId)).toEqual([A.cb.CB1, A.cb.CB2, A.cb.CB3]); // solicitadoAt desc
  });

  it("R285: aprobar y rechazar siguen `forbidden` para S1 por la Server Action", async () => {
    const deps = { getActor: async () => A.s1 };
    const r = await conEmpresa(A.organizacionId, async () => ({
      aprobar: await aprobarCierreBodega({ cierreBodegaId: A.cb.CB1 }, deps),
      rechazar: await rechazarCierreBodega({ cierreBodegaId: A.cb.CB1, motivo: "no" }, deps),
    }));
    expect(r.aprobar).toEqual({ status: "forbidden" });
    expect(r.rechazar).toEqual({ status: "forbidden" });
  });
});
