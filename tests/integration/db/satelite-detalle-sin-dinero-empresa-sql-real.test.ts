import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { verCierreBodegaDetalle } from "@/lib/actions/cierre-bodega";
import { verCierreDetalle } from "@/lib/actions/cierres-admin";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { CierreDetalleGestion, CierreGrupos } from "@/lib/interfaces/services/ICierreDiaService";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-154 «Vista de la bodega satélite: solo lo suyo» (T1, R460-R467) — contra Postgres real, POR
 * LAS SERVER ACTIONS Y COMMITEANDO (como `satelite-cierre-bodega-lectura.int.test.ts`): cada action
 * arma su servicio con `getPrismaClient()` (extension por empresa + `set_config` + rol `servi_app`,
 * que activa la RLS) y su composition root, asi que el corte se mide sobre el SQL y el cableado
 * reales. La siembra se borra en el `afterAll`.
 *
 * LA SIEMBRA (importes escritos a mano). Zona satelite C; S = adminSatelite de C; M = maestro.
 * Tarifa vieja de la tienda: flete 2 000,00 (tambien GAM), flete devuelto 1 500,00, IVA 13 %, sin
 * comision (`cobraComision` false). Ninguna orden es central ni de zona especial.
 * Cierre de bodega BX (snapshot: efectivo 1 400, SINPE 3 000, general 4 400, pago 6 500, bodega 100)
 * con tres cierres del dia aprobados:
 *   A (anterior): efectivo 500, SINPE 2 500 → general 3 000; pago 700; bodega 100.
 *       gA1 entregada, recibido 3 000, pago 700, bodega 0  → flete 2 000 + IVA 260 = 2 260.
 *       gA2 rechazada, sin recibido, pago 0, bodega 100   → devuelto 1 500 + IVA 195 = 1 695.
 *   B (anterior): efectivo 900 → general 900; pago 800; bodega 0.
 *       gB1 entregada, recibido 900, pago 800             → 2 260 (IVA 260).
 *   N (nuevo, `pago_independiente_efectivo`): SINPE 500 → general 500; pago 5 000; bodega 0.
 *       gN1 entregada, recibido 500, pago 5 000, modelo nuevo con `tienda_flete_entregado` monto
 *       3 500 e IVA 13 % → 3 500 + 455 = 3 955.
 *
 * Cuentas a mano (las mismas en `progress/impl_SLT-154.md > T1`):
 *   A: facturado 2 260 + 1 695 = 3 955; IVA 260 + 195 = 455; sin IVA 3 500.
 *      Le queda a la empresa 3 500 − 700 − 100 = 2 700. Se le paga a la tienda (SLT-169: todo lo
 *      facturado) 3 000 − 3 955 = −955, igual que «gana la tienda». Reparto [tienda −955, empresa
 *      3 955]: una parte negativa → `null` (antes [740, 2 260] = [25, 75]).
 *      Debe llegar a la central 3 000 − 700 − 100 = 2 200; efectivo 500 < 700 + 100 → NO cubre
 *      (aunque el general 3 000 si alcanzaria: la regla mira el efectivo).
 *      Reparto [2 200, 700, 100] / 3 000: 73,33 / 23,33 / 3,33 → pisos 73, 23, 3 (99); los tres
 *      restos son iguales (1/3) y gana el primero = [74, 23, 3].
 *   B: debe llegar 900 − 800 − 0 = 100; efectivo 900 ≥ 800 → cubre. Reparto [100, 800, 0] / 900:
 *      11,11 / 88,89 / 0 → pisos 11, 88, 0 (99); el mayor resto es el de 800 → [11, 89, 0].
 *   N: debe llegar 500 − 5 000 − 0 = −4 500; efectivo 0 < 5 000 → no cubre.
 *   BX: facturado 3 955 + 2 260 + 3 955 = 10 170; IVA 455 + 260 + 455 = 1 170; sin IVA 9 000.
 *       Le queda a la empresa 9 000 − 6 500 − 100 = 2 400. Se le paga a las tiendas
 *       4 400 − 10 170 = −5 770 (SLT-169; antes −4 075). Debe llegar 4 400 − 6 500 − 100 = −2 200.
 *       La central debe: efectivo de A y B = 1 400; pagos [700, 800]: 700 se paga, 700 + 800 =
 *       1 500 > 1 400 → 800 queda = «800.00». (Contando N: [700, 800, 5 000] → 5 800.)
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface Siembra {
  organizacionId: string;
  maestro: Actor;
  satelite: Actor;
  bx: string;
  cierre: { A: string; B: string; N: string };
  gestion: { gA1: string; gA2: string; gB1: string; gN1: string };
}

interface CierreDiaSembrado {
  efectivo: string;
  simpe: string;
  general: string;
  pago: string;
  bodega: string;
  nuevo: boolean;
}

interface GestionSembrada {
  clave: string;
  resultado: "entregado" | "devolucion_a_origen_por_rechazo";
  recibido: string | null;
  pago: string;
  bodega: string;
  modelo: "viejo" | "nuevo";
}

async function sembrar(base: PrismaClient): Promise<Siembra> {
  const organizacionId = (await crearOrganizacion(base, { nombre: "Empresa de SLT-154" })).id;
  return base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const estatus = await tx.orderStatus.findUnique({ where: { value: "en_reparto" }, select: { id: true } });
      const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
      if (estatus === null || canton === null) {
        throw new Error("faltan catalogos (`order_status`, `canton`): migrate deploy + db:seed");
      }
      const sufijo = randomUUID().slice(0, 8);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const zonaC = (
        await tx.zona.create({
          data: { nombre: `C SLT-154 ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        })
      ).id;
      const sat = await crearUsuarioDePrueba(tx, "adminSatelite");
      await tx.usuario.update({ where: { id: sat.id }, data: { zonaId: zonaC } });
      const tienda = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
      const tarifa = await tx.tarifa.create({
        data: {
          tiendaId: tienda,
          zonaId: null,
          valorFlete: new Prisma.Decimal("2000.00"),
          valorFleteGam: new Prisma.Decimal("2000.00"),
          valorFleteDevuelto: new Prisma.Decimal("1500.00"),
          valorFleteDevueltoGam: new Prisma.Decimal("1500.00"),
          fulfillment: new Prisma.Decimal("0.00"),
          comisionCod: new Prisma.Decimal("0.00"),
          ivaFlete: new Prisma.Decimal("13.00"),
          ivaComisionCod: new Prisma.Decimal("13.00"),
        },
        select: { id: true },
      });

      const bx = (
        await tx.cierreBodega.create({
          data: {
            zonaId: zonaC,
            solicitadoPor: sat.id,
            estado: "solicitado",
            totalEfectivo: new Prisma.Decimal("1400.00"),
            totalSimpe: new Prisma.Decimal("3000.00"),
            totalGeneral: new Prisma.Decimal("4400.00"),
            totalPagoMensajero: new Prisma.Decimal("6500.00"),
            totalIngresoBodegaRechazos: new Prisma.Decimal("100.00"),
          },
          select: { id: true },
        })
      ).id;

      const cierreDia = async (c: CierreDiaSembrado): Promise<{ id: string; mensajero: string }> => {
        const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
        const { id } = await tx.cierreDia.create({
          data: {
            mensajeroId: mensajero,
            estado: "aprobado",
            destinoTipo: "bodega_satelite",
            destinoZonaId: zonaC,
            cierreBodegaId: bx,
            totalEfectivo: new Prisma.Decimal(c.efectivo),
            totalSimpe: new Prisma.Decimal(c.simpe),
            totalGeneral: new Prisma.Decimal(c.general),
            totalPagoMensajero: new Prisma.Decimal(c.pago),
            totalIngresoBodegaRechazos: new Prisma.Decimal(c.bodega),
            pagoIndependienteEfectivo: c.nuevo,
          },
          select: { id: true },
        });
        return { id, mensajero };
      };

      const gestion = async (cierre: { id: string; mensajero: string }, g: GestionSembrada): Promise<string> => {
        const ordenId = (
          await tx.orden.create({
            data: {
              numRemision: `R-${sufijo}-${g.clave}`,
              destinatario: `Dest ${g.clave}`,
              telefonoDest: "88880000",
              producto: `Prod ${g.clave}`,
              montoCobrar: new Prisma.Decimal(g.recibido ?? "0.00"),
              cobraComision: false,
              estatusId: estatus.id,
              mensajeroAsignadoId: cierre.mensajero,
              tiendaId: tienda,
              zonaId: zonaC,
              provinciaId: canton.provinciaId,
              cantonId: canton.id,
            },
            select: { id: true },
          })
        ).id;
        const detalle = await tx.cierreDetail.create({
          data: {
            cierreId: cierre.id,
            ordenId,
            montoCobrar: new Prisma.Decimal(g.recibido ?? "0.00"),
            cobraComision: false,
            zonaId: zonaC,
            tiendaId: tienda,
            esCentral: false,
            esZonaEspecial: false,
            tarifaModelo: g.modelo,
            ...(g.modelo === "viejo"
              ? {
                  tarifaId: tarifa.id,
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
            numRemision: `R-${sufijo}-${g.clave}`,
            destinatario: `Dest ${g.clave}`,
            producto: `Prod ${g.clave}`,
            tiendaNombre: "Tienda SLT-154",
            zonaNombre: "C SLT-154",
            provinciaNombre: "Provincia",
            cantonNombre: "Canton",
          },
          select: { id: true },
        });
        if (g.modelo === "nuevo") {
          await tx.cierreDetailConcepto.create({
            data: {
              cierreDetailId: detalle.id,
              concepto: "tienda_flete_entregado",
              modo: "monto",
              valor: new Prisma.Decimal("3500.00"),
              ivaPct: new Prisma.Decimal("13.00"),
              nivel: "zona",
              tarifaValorId: null,
            },
          });
        }
        return (
          await tx.gestionOrden.create({
            data: {
              ordenId,
              mensajeroId: cierre.mensajero,
              resultado: g.resultado,
              montoRecibido: g.recibido === null ? null : new Prisma.Decimal(g.recibido),
              metodoPago: g.recibido === null ? null : "efectivo",
              cierreId: cierre.id,
              pagoMensajero: new Prisma.Decimal(g.pago),
              ingresoBodegaRechazo: new Prisma.Decimal(g.bodega),
            },
            select: { id: true },
          })
        ).id;
      };

      const A = await cierreDia({ efectivo: "500.00", simpe: "2500.00", general: "3000.00", pago: "700.00", bodega: "100.00", nuevo: false });
      const B = await cierreDia({ efectivo: "900.00", simpe: "0.00", general: "900.00", pago: "800.00", bodega: "0.00", nuevo: false });
      const N = await cierreDia({ efectivo: "0.00", simpe: "500.00", general: "500.00", pago: "5000.00", bodega: "0.00", nuevo: true });
      const gA1 = await gestion(A, { clave: "A1", resultado: "entregado", recibido: "3000.00", pago: "700.00", bodega: "0.00", modelo: "viejo" });
      const gA2 = await gestion(A, {
        clave: "A2",
        resultado: "devolucion_a_origen_por_rechazo",
        recibido: null,
        pago: "0.00",
        bodega: "100.00",
        modelo: "viejo",
      });
      const gB1 = await gestion(B, { clave: "B1", resultado: "entregado", recibido: "900.00", pago: "800.00", bodega: "0.00", modelo: "viejo" });
      const gN1 = await gestion(N, { clave: "N1", resultado: "entregado", recibido: "500.00", pago: "5000.00", bodega: "0.00", modelo: "nuevo" });

      return {
        organizacionId,
        maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
        satelite: { usuarioId: sat.id, rol: "adminSatelite", organizacionId },
        bx,
        cierre: { A: A.id, B: B.id, N: N.id },
        gestion: { gA1, gA2, gB1, gN1 },
      };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/** Tablas con `organizacion_id`, para borrar todo lo de la empresa sembrada. */
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
    async (tx: Tx) => {
      let pendientes = [...tablas];
      while (pendientes.length > 0) {
        const fallidas: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT limpiar_slt154`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organizacion_id = ANY($1::text[])`, ids);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT limpiar_slt154`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT limpiar_slt154`);
            fallidas.push(t);
          }
        }
        if (fallidas.length === pendientes.length) {
          throw new Error(`SLT-154: no se pudo limpiar ${fallidas.join(", ")}`);
        }
        pendientes = fallidas;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE id = ANY($1::text[])`, ids);
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/** Todas las gestiones de los cinco grupos. */
function gestionesDe(grupos: CierreGrupos): CierreDetalleGestion[] {
  return Object.values(grupos).flat();
}

/** La rama `ok` o un error ruidoso: nunca un test que pasa sin comprobar nada. */
function ok<R extends { status: string }>(r: R): Extract<R, { status: "ok" }> {
  if (r.status !== "ok") throw new Error(`esperaba ok y llego ${JSON.stringify(r)}`);
  return r as Extract<R, { status: "ok" }>;
}

describeSiHayBase("SLT-154 — la satélite lee sus dos detalles sin las cifras de la empresa (Postgres real)", () => {
  let base: PrismaClient;
  let tablas: string[];
  let S: Siembra;
  let soltarLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    soltarLock = await tomarLockDeEscrituraReal();
    base = crearPrismaDeTest();
    tablas = await tablasDeNegocio(base);
    if (!tablas.includes("cierre_bodega")) {
      throw new Error("`cierre_bodega` no tiene `organizacion_id`: aplica las migraciones");
    }
    S = await sembrar(base);
  }, 120_000);

  afterAll(async () => {
    try {
      await limpiar(base, tablas, S?.organizacionId === undefined ? [] : [S.organizacionId]);
    } finally {
      await base?.$disconnect();
      await soltarLock?.();
    }
  }, 120_000);

  const verBodega = async (quien: Actor) =>
    ok(
      await conEmpresa(S.organizacionId, () =>
        verCierreBodegaDetalle({ cierreBodegaId: S.bx }, { getActor: async () => quien }),
      ),
    );
  const verMensajero = async (quien: Actor, cierreId: string) =>
    ok(await conEmpresa(S.organizacionId, () => verCierreDetalle({ cierreId }, { getActor: async () => quien })));

  it("la siembra existe: BX con tres cierres del día (uno nuevo) y cuatro gestiones", async () => {
    const cierres = await base.cierreDia.findMany({
      where: { cierreBodegaId: S.bx },
      select: { id: true, pagoIndependienteEfectivo: true },
    });
    expect(cierres.map((c) => c.id).sort()).toEqual([S.cierre.A, S.cierre.B, S.cierre.N].sort());
    expect(cierres.filter((c) => c.pagoIndependienteEfectivo).map((c) => c.id)).toEqual([S.cierre.N]);
    expect(await base.gestionOrden.count({ where: { cierreId: { in: [S.cierre.A, S.cierre.B, S.cierre.N] } } })).toBe(4);
    expect(await base.cierreDetail.count({ where: { cierreId: { in: [S.cierre.A, S.cierre.B, S.cierre.N] } } })).toBe(4);
  });

  it("R460: la satélite recibe el detalle de bodega sin las ocho cifras de la empresa", async () => {
    const r = await verBodega(S.satelite);
    // Control: el detalle llegó con lo suyo (snapshot de BX: 4 400 − 6 500 − 100).
    expect(r.cierre.paraLaCentral).toBe("-2200.00");
    expect(r.totalesIngreso).toBeNull();
    expect(r.ivaFacturado).toBeNull();
    expect(r.ganancia).toBeNull();
    expect(r.pagoTienda).toBeNull();
    expect(r.cobradoSobreRecaudado).toBeNull();
    expect(r.netoEmpresa).toBeNull();
    expect(r.ganaLaTienda).toBeNull();
    expect(r.partesPorTienda).toBeNull();
  });

  it("R461: cada cierre del día llega sin cifras de la empresa y con sus cifras propias", async () => {
    const r = await verBodega(S.satelite);
    expect(r.cierres.map((c) => c.cierreDiaId).sort()).toEqual([S.cierre.A, S.cierre.B, S.cierre.N].sort());
    for (const c of r.cierres) {
      expect(c.totalesIngreso).toBeNull();
      expect(c.ivaFacturado).toBeNull();
      expect(c.ganancia).toBeNull();
      expect(c.pagoTienda).toBeNull();
      expect(c.cobradoSobreRecaudado).toBeNull();
      expect(c.netoEmpresa).toBeNull();
      expect(c.ganaLaTienda).toBeNull();
      expect(c.partesPorTienda).toBeNull();
    }
    const propias = (id: string) => {
      const c = r.cierres.find((x) => x.cierreDiaId === id);
      if (c === undefined) throw new Error(`falta el cierre del día ${id}`);
      return {
        totales: c.totales,
        pago: c.totalPagoMensajero,
        bodega: c.totalIngresoBodegaRechazos,
        central: c.paraLaCentral,
        cubre: c.efectivoCubreDescuentos,
      };
    };
    expect(propias(S.cierre.A)).toEqual({
      totales: { efectivo: "500.00", simpe: "2500.00", transferencia: "0.00", general: "3000.00" },
      pago: "700.00",
      bodega: "100.00",
      central: "2200.00", // 3 000 − 700 − 100
      cubre: false, // 500 < 700 + 100
    });
    expect(propias(S.cierre.B)).toEqual({
      totales: { efectivo: "900.00", simpe: "0.00", transferencia: "0.00", general: "900.00" },
      pago: "800.00",
      bodega: "0.00",
      central: "100.00", // 900 − 800 − 0
      cubre: true, // 900 ≥ 800
    });
    expect(propias(S.cierre.N)).toEqual({
      totales: { efectivo: "0.00", simpe: "500.00", transferencia: "0.00", general: "500.00" },
      pago: "5000.00",
      bodega: "0.00",
      central: "-4500.00", // 500 − 5 000 − 0
      cubre: false, // 0 < 5 000
    });
  });

  it("R462: la satélite recibe el detalle del cierre del mensajero sin las cifras de la empresa", async () => {
    const r = await verMensajero(S.satelite, S.cierre.A);
    // Control: el detalle llegó con lo suyo.
    expect(r.cierre.totales.general).toBe("3000.00");
    expect(r.desgloseIngresoBodegaRechazos.total).toBe("100.00");
    expect(r.totalesIngreso).toBeNull();
    expect(r.ivaFacturado).toBeNull();
    expect(r.ganancia).toBeNull();
    expect(r.pagoTienda).toBeNull();
    expect(r.cobradoSobreRecaudado).toBeNull();
    expect(r.netoEmpresa).toBeNull();
    expect(r.ganaLaTienda).toBeNull();
    expect(r.fleteRechazoYaCobradoATienda).toBeNull();
    expect(r.partesPorTienda).toBeNull();
    expect(r.porcentajesReparto).toBeNull();
  });

  it("R463: cada gestión llega sin cobro a la tienda y con su modelo de tarifa", async () => {
    const bodegaS = await verBodega(S.satelite);
    const bodegaM = await verBodega(S.maestro);
    const mensajeroS = await verMensajero(S.satelite, S.cierre.A);
    const mensajeroM = await verMensajero(S.maestro, S.cierre.A);
    const deBodega = (r: typeof bodegaS) => r.cierres.flatMap((c) => gestionesDe(c.grupos));
    const sat = [...deBodega(bodegaS), ...gestionesDe(mensajeroS.grupos)];
    const central = [...deBodega(bodegaM), ...gestionesDe(mensajeroM.grupos)];
    // 4 gestiones del detalle de bodega + 2 del cierre A.
    expect(sat.map((g) => g.gestionId).sort()).toEqual(
      [S.gestion.gA1, S.gestion.gA2, S.gestion.gB1, S.gestion.gN1, S.gestion.gA1, S.gestion.gA2].sort(),
    );
    const modelo: Record<string, "viejo" | "nuevo"> = {
      [S.gestion.gA1]: "viejo",
      [S.gestion.gA2]: "viejo",
      [S.gestion.gB1]: "viejo",
      [S.gestion.gN1]: "nuevo",
    };
    for (const g of sat) {
      expect(g.ingresoEmpresa).toBeNull();
      expect(g.tarifaModelo).toBe(modelo[g.gestionId]);
    }
    // Lo de la satélite, sin cambio: literales a mano y lo mismo que lee la central.
    const propio = (g: CierreDetalleGestion) => ({
      recibido: g.montoRecibido,
      pagos: g.pagos,
      pago: g.pagoMensajero,
      bodega: g.ingresoBodegaRechazo,
    });
    const gA1 = sat.find((g) => g.gestionId === S.gestion.gA1);
    const gA2 = sat.find((g) => g.gestionId === S.gestion.gA2);
    expect([gA1?.montoRecibido, gA1?.pagoMensajero, gA1?.ingresoBodegaRechazo]).toEqual(["3000.00", "700.00", "0.00"]);
    expect([gA2?.montoRecibido, gA2?.pagoMensajero, gA2?.ingresoBodegaRechazo]).toEqual([null, "0.00", "100.00"]);
    const porId = (gs: CierreDetalleGestion[]) =>
      gs.map((g) => [g.gestionId, propio(g)] as const).sort(([a], [b]) => a.localeCompare(b));
    expect(porId(sat)).toEqual(porId(central));
  });

  it("R465: el maestro recibe los dos detalles con las cifras de la empresa (SLT-169: pago neto de todo lo facturado)", async () => {
    const bodega = await verBodega(S.maestro);
    expect(bodega.netoEmpresa).toBe("2400.00"); // 9 000 sin IVA − 6 500 − 100
    expect(bodega.pagoTienda).toBe("-5770.00"); // SLT-169 R623: 4 400 − 10 170 (antes −4 075)
    expect(bodega.totalesIngreso?.total).toBe("10170.00"); // 3 955 + 2 260 + 3 955
    const diaA = bodega.cierres.find((c) => c.cierreDiaId === S.cierre.A);
    expect(diaA?.netoEmpresa).toBe("2700.00"); // 3 500 − 700 − 100
    expect(diaA?.pagoTienda).toBe("-955.00"); // SLT-169 R623: 3 000 − 3 955 (antes 740)

    const mensajero = await verMensajero(S.maestro, S.cierre.A);
    expect(mensajero.netoEmpresa).toBe("2700.00");
    expect(mensajero.pagoTienda).toBe("-955.00"); // SLT-169 R620/R622: con su signo
    expect(mensajero.ganaLaTienda).toBe("-955.00"); // 3 000 − 3 955 (alias)
    expect(mensajero.ivaFacturado).toBe("455.00"); // 260 + 195
    // SLT-169 R624: con el pago a la tienda negativo, el reparto va sin porcentajes (antes [25, 75]).
    expect(mensajero.porcentajesReparto).toBeNull();

    const gestiones = [...bodega.cierres.flatMap((c) => gestionesDe(c.grupos)), ...gestionesDe(mensajero.grupos)];
    const gA1 = gestiones.filter((g) => g.gestionId === S.gestion.gA1);
    expect(gA1.map((g) => g.ingresoEmpresa?.total)).toEqual(["2260.00", "2260.00"]); // 2 000 + 13 %
    const gN1 = gestiones.find((g) => g.gestionId === S.gestion.gN1);
    expect(gN1?.ingresoEmpresa?.total).toBe("3955.00"); // 3 500 + 13 %
    // La central lee el modelo dentro de `ingresoEmpresa`, como antes: no viaja aparte.
    for (const g of gestiones) expect("tarifaModelo" in g).toBe(false);
  });

  it("R466: La central debe del cierre de bodega: reparte el efectivo de los cierres del modelo anterior", async () => {
    // Efectivo de A y B = 1 400; pagos [700, 800]: se paga 700; 1 500 > 1 400 → quedan 800.
    expect((await verBodega(S.satelite)).centralDebe).toBe("800.00");
    expect((await verBodega(S.maestro)).centralDebe).toBe("800.00");
  });

  it("R467: el detalle del cierre del mensajero trae lo que debe llegar a la central y su reparto", async () => {
    for (const quien of [S.satelite, S.maestro]) {
      const r = await verMensajero(quien, S.cierre.A);
      expect(r.paraLaCentral).toBe("2200.00"); // 3 000 − 700 − 100
      expect(r.efectivoCubreDescuentos).toBe(false); // efectivo 500 < 800 (el general 3 000 no cuenta)
      expect(r.porcentajesRepartoCentral).toEqual([74, 23, 3]);
    }
    // B sí cubre: 900 ≥ 800; reparto [100, 800, 0] / 900 → [11, 89, 0].
    const b = await verMensajero(S.satelite, S.cierre.B);
    expect(b.paraLaCentral).toBe("100.00");
    expect(b.efectivoCubreDescuentos).toBe(true);
    expect(b.porcentajesRepartoCentral).toEqual([11, 89, 0]);
    // N no tiene barra: una parte negativa (500 − 5 000).
    const n = await verMensajero(S.satelite, S.cierre.N);
    expect(n.paraLaCentral).toBe("-4500.00");
    expect(n.porcentajesRepartoCentral).toBeNull();
  });
});
