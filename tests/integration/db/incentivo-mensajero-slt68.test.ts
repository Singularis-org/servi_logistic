import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  anularIncentivoMensajeroAction,
  registrarIncentivoMensajeroAction,
} from "@/lib/actions/incentivo-mensajero";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import type { ConsultaAnalitica } from "@/lib/analytics/consulta";
import type { LiquidacionTxRunner } from "@/lib/interfaces/services/ILiquidacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { IncentivoCajaDocumentosRepository } from "@/lib/repositories/EgresoCajaDocumentosRepository";
import { LibroCajaAutoriaRepository } from "@/lib/repositories/LibroCajaAutoriaRepository";
import { condicionAQuienSql } from "@/lib/repositories/libro-caja-a-quien-sql";
import { LibroCajaAutoriaService } from "@/lib/services/LibroCajaAutoriaService";
import { ConciliacionCierresAnaliticaRepository } from "@/lib/repositories/ConciliacionCierresAnaliticaRepository";
import { EstadoCuentaRepository } from "@/lib/repositories/EstadoCuentaRepository";
import { OrigenLegibleRepository } from "@/lib/repositories/OrigenLegibleRepository";
import { RechazoTiendaCobroAnulacionRepository } from "@/lib/repositories/RechazoTiendaCobroAnulacionRepository";
import { EstadoCuentaService } from "@/lib/services/EstadoCuentaService";
import { OrigenLegibleService } from "@/lib/services/OrigenLegibleService";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { LiquidacionRepartoRepository } from "@/lib/repositories/LiquidacionRepartoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { CajaPagoTiendaFeedService } from "@/lib/services/CajaPagoTiendaFeedService";
import { LiquidacionService } from "@/lib/services/LiquidacionService";
import type { AgregadoCajaRow } from "@/lib/types/wallet";
import { derivarCaja } from "@/lib/utils/caja-tesoreria";
import { derivarCuentaPorPagar } from "@/lib/utils/cuenta-por-pagar";
import { fechaCalendarioCR, inicioDelDiaCREnUtc } from "@/lib/utils/fecha-cr";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, urlDeBaseDeDatos } from "./_postgres-real";
import {
  clienteConEmpresa459,
  conEmpresa459,
  limpiar459,
  sembrarPersonas459,
  type Personas459,
} from "./_fixtures/escrituras-459";
import { busquedaPorGuiaDe } from "./_fixtures/busqueda-469";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-68 (design §3, §4, §5, §10) — el INCENTIVO MANUAL A UN MENSAJERO contra Postgres de verdad.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUE [PG]. El CHECK tipo<->categoria, el CHECK de origen, el unico de origen con `incentivo`
// fuera, la suma de lo pagable del cierre, la exclusion de la conciliacion y la RLS por empresa son
// hechos de la BASE: un doble no los ve (memoria «probar el WHERE donde vive»).
//
// POR QUE POR LA ACTION Y COMMITEANDO. El registro y la anulacion se piden a
// `registrarIncentivoMensajeroAction`/`anularIncentivoMensajeroAction` SIN `service`: la action
// construye el suyo con `getPrismaClient()`, asi que se mide el composition root REAL (que inyecta
// cada pieza) y la RLS de `servi_app` (dos empresas, R4). Commitea, y cada caso limpia lo suyo en un
// `finally` (molde: `_fixtures/escrituras-459.ts`). La concurrencia (R10, R15) solo existe con
// transacciones de verdad en conexiones distintas.
//
// SIN BASE SE SALTA (`describe.skip`). Ningun caso tiene `if (!x) return;`: cada lectura que el caso
// necesita lleva su `expect` de que existe.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M = "2500.00";

describeSiHayBase("SLT-68 — el incentivo manual a un mensajero, contra Postgres", () => {
  let prisma: PrismaClient;
  /** Cliente con la envoltura de produccion (empresa del contexto, `servi_app`), para leer como la app. */
  let app: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
    app = clienteConEmpresa459(
      new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 4 }), omit: PRISMA_OMIT }) as unknown as PrismaClient,
    );
  });

  afterAll(async () => {
    await app?.$disconnect();
    await prisma?.$disconnect();
  });

  interface Escenario {
    p: Personas459;
    zonaId: string;
    /** Cierres aprobados del mensajero, del mas viejo al mas nuevo. */
    cierres: string[];
  }

  /** Personas COMMITEADAS, una zona y los cierres pedidos, todo de la misma empresa nueva. */
  async function sembrar(opciones: { cierres?: { estado: "aprobado" | "solicitado"; dia: string; p?: string }[] } = {}): Promise<Escenario> {
    const p = await sembrarPersonas459(prisma);
    const zona = await prisma.zona.create({
      data: { nombre: `Zona SLT68 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular", organizacionId: p.organizacionId },
      select: { id: true },
    });
    const cierres: string[] = [];
    for (const c of opciones.cierres ?? [
      { estado: "aprobado" as const, dia: "2026-10-20" },
      { estado: "aprobado" as const, dia: "2026-10-27" },
    ]) {
      const fila = await prisma.cierreDia.create({
        data: {
          mensajeroId: p.mensajero.usuarioId,
          estado: c.estado,
          destinoTipo: "bodega_central",
          destinoZonaId: zona.id,
          totalPagoMensajero: new Prisma.Decimal(c.p ?? "0.00"),
          solicitadoAt: new Date(`${c.dia}T23:00:00.000Z`),
          organizacionId: p.organizacionId,
        },
        select: { id: true },
      });
      cierres.push(fila.id);
    }
    return { p, zonaId: zona.id, cierres };
  }

  /** Borra lo que cuelga del escenario (libros, pagos, cierres, zona) y luego las personas. */
  async function limpiar(e: Escenario | null): Promise<void> {
    if (e === null) return;
    const usuarios = e.p.usuarios;
    await prisma.pagoMensajeroMovimiento.deleteMany({ where: { mensajeroId: { in: usuarios } } });
    await prisma.walletMovimiento.deleteMany({ where: { organizacionId: e.p.organizacionId } });
    await prisma.historialAccion.deleteMany({ where: { actorUsuarioId: { in: usuarios } } });
    await prisma.liquidacionPago.deleteMany({ where: { mensajeroId: { in: usuarios } } });
    await prisma.liquidacionReparto.deleteMany({ where: { mensajeroId: { in: usuarios } } });
    await prisma.cierreDia.deleteMany({ where: { mensajeroId: { in: usuarios } } });
    await prisma.zona.delete({ where: { id: e.zonaId } });
    await limpiar459(prisma, e.p);
  }

  async function conEscenario(
    cuerpo: (e: Escenario) => Promise<void>,
    opciones?: Parameters<typeof sembrar>[0],
  ): Promise<void> {
    let e: Escenario | null = null;
    try {
      e = await sembrar(opciones);
      const listo = e;
      await conEmpresa459(listo.p, () => cuerpo(listo));
    } finally {
      await limpiar(e);
    }
  }

  const como = (actor: Actor) => ({ getActor: async () => actor });

  function formulario(campos: Record<string, string | undefined>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) f.append(k, v);
    return f;
  }

  function registro(e: Escenario, over: Record<string, string | undefined> = {}): FormData {
    return formulario({
      mensajeroId: e.p.mensajero.usuarioId,
      monto: M,
      motivo: "Cubrió dos rutas extra",
      claveIdempotencia: randomUUID(),
      ...over,
    });
  }

  async function registrar(e: Escenario, over: Record<string, string | undefined> = {}, actor?: Actor) {
    return registrarIncentivoMensajeroAction(registro(e, over), como(actor ?? e.p.maestro));
  }

  async function registrarOk(e: Escenario, over: Record<string, string | undefined> = {}): Promise<string> {
    const r = await registrar(e, over);
    expect(r.status, JSON.stringify(r)).toBe("ok");
    if (r.status !== "ok") throw new Error("imposible");
    return r.incentivo.id;
  }

  async function libro(e: Escenario) {
    return prisma.pagoMensajeroMovimiento.findMany({
      where: { mensajeroId: e.p.mensajero.usuarioId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async function caja(e: Escenario) {
    return prisma.walletMovimiento.findMany({
      where: { organizacionId: e.p.organizacionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  /** Σ devengo − Σ pago del libro del mensajero, por el repositorio y la derivacion de la app. */
  async function cuentaPorPagar(e: Escenario): Promise<string> {
    const a = await new PagoMensajeroMovimientoRepository(app).agregarCuentaPorPagar(e.p.mensajero.usuarioId, {});
    return derivarCuentaPorPagar(a.devengado, a.pagado).cuentaPorPagar;
  }

  /** La ganancia de la empresa, derivada de SU caja con `derivarCaja`. */
  async function ganancia(e: Escenario): Promise<string> {
    const filas = await prisma.walletMovimiento.groupBy({
      by: ["categoria", "tipo"],
      where: { organizacionId: e.p.organizacionId },
      _sum: { monto: true },
    });
    const agregado: AgregadoCajaRow[] = filas.map((f) => ({
      categoria: f.categoria,
      tipo: f.tipo,
      total: new Prisma.Decimal(f._sum.monto ?? 0).toFixed(2),
    }));
    return derivarCaja(agregado).ganancia;
  }

  /** Lo pagable por encima del snapshot de un cierre (premios e incentivos vivos). */
  async function pagableExtra(cierreId: string): Promise<string> {
    const r = await new PagoMensajeroMovimientoRepository(app).sumarPremiosVivosPorCierre([cierreId]);
    expect(Object.keys(r)).toEqual([cierreId]);
    return r[cierreId] as string;
  }

  function liquidacion(): LiquidacionService {
    return new LiquidacionService(
      new LiquidacionPagoRepository(app),
      new WalletTiendaMovimientoRepository(app),
      new PagoMensajeroMovimientoRepository(app),
      ((fn: (tx: never) => Promise<unknown>) => app.$transaction((tx) => fn(tx as never), { timeout: 20_000 })) as unknown as LiquidacionTxRunner,
      new CajaPagoTiendaFeedService(new WalletMovimientoRepository(app)),
      new LiquidacionRepartoRepository(app),
    );
  }

  async function previsualizar(e: Escenario) {
    const r = await liquidacion().previsualizarRepartoMensajero({ mensajeroId: e.p.mensajero.usuarioId }, e.p.maestro);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("imposible");
    return r.previsualizacion;
  }

  async function anular(e: Escenario, incentivoId: string, actor?: Actor) {
    return anularIncentivoMensajeroAction({ incentivoId, motivo: "Monto equivocado" }, como(actor ?? e.p.maestro));
  }

  // ── R6 / R7 ─────────────────────────────────────────────────────────────────────────────────

  it("R6: el registro escribe UN devengo `incentivo` imputado al cierre aprobado MAS RECIENTE y UN egreso de caja, fechados el dia elegido, con motivo y actor; el cierre queda intacto", async () => {
    await conEscenario(async (e) => {
      const ayer = fechaCalendarioCR(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const clave = randomUUID();
      const cierresAntes = await prisma.cierreDia.findMany({ where: { id: { in: e.cierres } }, orderBy: { id: "asc" } });
      expect(cierresAntes).toHaveLength(2);

      const r = await registrar(e, { fecha: ayer, claveIdempotencia: clave }, e.p.admin);
      expect(r).toMatchObject({ status: "ok", incentivo: { monto: M, cierreId: e.cierres[1] }, cuentaPorPagar: M });
      if (r.status !== "ok") throw new Error("imposible");

      const l = await libro(e);
      expect(l).toHaveLength(1);
      expect(l[0]).toMatchObject({
        id: r.incentivo.id,
        tipo: "devengo",
        categoria: "incentivo",
        origenTipo: "cierre_dia",
        origenId: e.cierres[1],
        descripcion: "Incentivo · Cubrió dos rutas extra",
        registradoPor: e.p.admin.usuarioId,
        organizacionId: e.p.organizacionId,
      });
      expect(l[0]!.monto.toFixed(2)).toBe(M);
      expect(l[0]!.fechaMovimiento.toISOString()).toBe(inicioDelDiaCREnUtc(ayer).toISOString());

      const c = await caja(e);
      expect(c).toHaveLength(1);
      expect(c[0]).toMatchObject({
        tipo: "egreso",
        categoria: "egreso_pago_mensajero",
        origenTipo: "incentivo_mensajero",
        origenId: r.incentivo.id,
        descripcion: "Incentivo · Cubrió dos rutas extra",
        registradoPor: e.p.admin.usuarioId,
        claveIdempotencia: clave,
      });
      expect(c[0]!.monto.toFixed(2)).toBe(M);
      expect(c[0]!.fechaMovimiento.toISOString()).toBe(inicioDelDiaCREnUtc(ayer).toISOString());

      // El cierre no se toca: ni su total, ni su estado, ni su `updated_at`.
      expect(await prisma.cierreDia.findMany({ where: { id: { in: e.cierres } }, orderBy: { id: "asc" } })).toEqual(cierresAntes);
    });
  }, 120_000);

  it("R7/R14: la cuenta por pagar sube M y la ganancia baja M; al anular, las dos vuelven a su valor", async () => {
    await conEscenario(async (e) => {
      // Una deuda previa que no cuelga de ningun cierre, para que «vuelve» no sea 0 → 0.
      await prisma.pagoMensajeroMovimiento.create({
        data: {
          mensajeroId: e.p.mensajero.usuarioId, tipo: "devengo", categoria: "ajuste_devengo", monto: new Prisma.Decimal("300.00"),
          origenTipo: "manual", origenId: null, descripcion: "deuda previa", organizacionId: e.p.organizacionId,
        },
      });
      expect(await cuentaPorPagar(e)).toBe("300.00");
      expect(await ganancia(e)).toBe("0.00");

      const id = await registrarOk(e);
      expect(await cuentaPorPagar(e)).toBe("2800.00");
      expect(await ganancia(e)).toBe("-2500.00");

      expect(await anular(e, id)).toEqual({ status: "ok" });
      expect(await cuentaPorPagar(e)).toBe("300.00");
      expect(await ganancia(e)).toBe("0.00");
    });
  }, 120_000);

  // ── R8 / R14 ────────────────────────────────────────────────────────────────────────────────

  it("R8/R14: lo pagable del cierre sube M, la previsualizacion imputa M sin mover la deuda no imputable, un reparto por M lo salda; anulado, lo pagable vuelve", async () => {
    await conEscenario(
      async (e) => {
        const cierreId = e.cierres[0]!;
        await prisma.pagoMensajeroMovimiento.create({
          data: {
            mensajeroId: e.p.mensajero.usuarioId, tipo: "devengo", categoria: "ajuste_devengo", monto: new Prisma.Decimal("300.00"),
            origenTipo: "manual", origenId: null, descripcion: "deuda sin cierre", organizacionId: e.p.organizacionId,
          },
        });
        const antes = await previsualizar(e);
        expect([antes.imputableTotal, antes.deudaNoImputable.monto, await pagableExtra(cierreId)]).toEqual(["0.00", "300.00", "0.00"]);

        const id = await registrarOk(e);
        const con = await previsualizar(e);
        expect([con.imputableTotal, con.deudaNoImputable.monto, await pagableExtra(cierreId)]).toEqual([M, "300.00", M]);

        // Anular y volver: lo pagable de ESE cierre vuelve a 0 (R14).
        expect(await anular(e, id)).toEqual({ status: "ok" });
        expect(await pagableExtra(cierreId)).toBe("0.00");
        expect((await previsualizar(e)).imputableTotal).toBe("0.00");

        // Otro incentivo, y un reparto por M lo salda: imputable 0 y solo queda la deuda sin cierre.
        await registrarOk(e);
        const r = await liquidacion().registrarRepartoMensajero(
          { claveIdempotencia: randomUUID(), monto: M, metodo: "efectivo", fechaPago: fechaCalendarioCR(new Date()), mensajeroId: e.p.mensajero.usuarioId },
          e.p.maestro,
        );
        expect(r.status, JSON.stringify(r)).toBe("ok");
        const despues = await previsualizar(e);
        expect([despues.imputableTotal, despues.deudaNoImputable.monto, despues.cuentaPorPagar]).toEqual(["0.00", "300.00", "300.00"]);
      },
      { cierres: [{ estado: "aprobado", dia: "2026-10-27" }] },
    );
  }, 120_000);

  // ── R9 / R10 ────────────────────────────────────────────────────────────────────────────────

  it("R9: dos incentivos distintos al mismo cierre se escriben los DOS (dos devengos, dos egresos)", async () => {
    await conEscenario(async (e) => {
      const a = await registrarOk(e);
      const b = await registrarOk(e, { monto: "1000.00" });
      expect(a).not.toBe(b);
      const l = await libro(e);
      expect(l.map((f) => [f.categoria, f.origenId, f.monto.toFixed(2)])).toEqual([
        ["incentivo", e.cierres[1], M],
        ["incentivo", e.cierres[1], "1000.00"],
      ]);
      expect((await caja(e)).map((f) => [f.categoria, f.origenId])).toEqual([
        ["egreso_pago_mensajero", a],
        ["egreso_pago_mensajero", b],
      ]);
    });
  }, 120_000);

  it("R10: la misma clave dos veces, en serie, responde `ya_registrado` y deja UNA fila por libro", async () => {
    await conEscenario(async (e) => {
      const clave = randomUUID();
      const primero = await registrar(e, { claveIdempotencia: clave });
      const segundo = await registrar(e, { claveIdempotencia: clave });
      expect(primero.status).toBe("ok");
      expect(segundo).toEqual({ status: "ya_registrado" });
      expect(await libro(e)).toHaveLength(1);
      expect(await caja(e)).toHaveLength(1);
    });
  }, 120_000);

  it("R10: la misma clave dos veces A LA VEZ: una `ok`, otra `ya_registrado`, UNA fila por libro", async () => {
    await conEscenario(async (e) => {
      const clave = randomUUID();
      const [x, y] = await Promise.all([registrar(e, { claveIdempotencia: clave }), registrar(e, { claveIdempotencia: clave })]);
      expect([x.status, y.status].sort()).toEqual(["ok", "ya_registrado"]);
      expect(await libro(e)).toHaveLength(1);
      expect(await caja(e)).toHaveLength(1);
    });
  }, 120_000);

  // ── R4 / R5 ─────────────────────────────────────────────────────────────────────────────────

  it("R4: un mensajero o un incentivo de OTRA empresa son `no_encontrado` y no se escribe nada en ninguna", async () => {
    await conEscenario(async (otra) => {
      const ajeno = await registrarOk(otra);
      await conEscenario(async (e) => {
        const r = await registrarIncentivoMensajeroAction(
          formulario({ mensajeroId: otra.p.mensajero.usuarioId, monto: M, motivo: "x", claveIdempotencia: randomUUID() }),
          como(e.p.maestro),
        );
        expect(r).toEqual({ status: "no_encontrado" });
        expect(await anular(e, ajeno)).toEqual({ status: "no_encontrado" });
        expect(await libro(e)).toHaveLength(0);
        expect(await caja(e)).toHaveLength(0);
      });
      // La otra empresa conserva su incentivo, sin anular.
      const l = await libro(otra);
      expect(l.map((f) => f.categoria)).toEqual(["incentivo"]);
      expect(await caja(otra)).toHaveLength(1);
    });
  }, 180_000);

  it("R13 (review H2): anular con el id de un `pago_devengado` o de un `premio_ranking` del cierre es `no_encontrado` y no escribe contraasientos en ningun libro", async () => {
    await conEscenario(
      async (e) => {
        const cierreId = e.cierres[0]!;
        // Dos devengos del mismo cierre que NO son incentivos: misma forma de origen (cierre_dia, no
        // nulo) que un incentivo, asi que solo el filtro por categoria los separa.
        const devengado = await prisma.pagoMensajeroMovimiento.create({
          data: {
            mensajeroId: e.p.mensajero.usuarioId, tipo: "devengo", categoria: "pago_devengado", monto: new Prisma.Decimal("1000.00"),
            origenTipo: "cierre_dia", origenId: cierreId, organizacionId: e.p.organizacionId,
          },
          select: { id: true },
        });
        const premio = await prisma.pagoMensajeroMovimiento.create({
          data: {
            mensajeroId: e.p.mensajero.usuarioId, tipo: "devengo", categoria: "premio_ranking", monto: new Prisma.Decimal("700.00"),
            origenTipo: "cierre_dia", origenId: cierreId, premioDia: new Date("2026-10-27T00:00:00.000Z"), organizacionId: e.p.organizacionId,
          },
          select: { id: true },
        });
        expect((await libro(e)).map((f) => [f.categoria, f.monto.toFixed(2)])).toEqual([
          ["pago_devengado", "1000.00"],
          ["premio_ranking", "700.00"],
        ]);
        expect(await caja(e)).toHaveLength(0);

        expect(await anular(e, devengado.id)).toEqual({ status: "no_encontrado" });
        expect(await anular(e, premio.id)).toEqual({ status: "no_encontrado" });

        expect((await libro(e)).map((f) => [f.categoria, f.monto.toFixed(2)])).toEqual([
          ["pago_devengado", "1000.00"],
          ["premio_ranking", "700.00"],
        ]);
        expect(await caja(e)).toHaveLength(0);
      },
      { cierres: [{ estado: "aprobado", dia: "2026-10-27", p: "1000.00" }] },
    );
  }, 120_000);

  it("R5: sin ningun cierre `aprobado` (solo uno solicitado) responde `sin_cierre_aprobado` y no escribe", async () => {
    await conEscenario(
      async (e) => {
        expect(await registrar(e)).toEqual({ status: "sin_cierre_aprobado" });
        expect(await libro(e)).toHaveLength(0);
        expect(await caja(e)).toHaveLength(0);
      },
      { cierres: [{ estado: "solicitado", dia: "2026-10-27" }] },
    );
  }, 120_000);

  // ── R12 ─────────────────────────────────────────────────────────────────────────────────────

  it("R12: la base rechaza (23514) un `incentivo` que no es devengo o no cuelga de un cierre, y un `reverso_incentivo` que no es pago o no cuelga de un incentivo", async () => {
    await conEscenario(async (e) => {
      const base = { mensajero_id: e.p.mensajero.usuarioId, organizacion_id: e.p.organizacionId };
      const insertar = async (tipo: string, categoria: string, origenTipo: string, origenId: string | null) => {
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
             VALUES ($1,$2,$3::pago_mensajero_movimiento_tipo,$4::pago_mensajero_movimiento_categoria,10.00,$5::wallet_origen_tipo,$6,$7)`,
            randomUUID(), base.mensajero_id, tipo, categoria, origenTipo, origenId, base.organizacion_id,
          );
          return "insertado";
        } catch (error) {
          const texto = String((error as Error).message) + JSON.stringify((error as { cause?: unknown }).cause ?? null);
          const restriccion = /pago_mensajero_movimiento_\w+_check/.exec(texto)?.[0] ?? "otro";
          return `${/23514/.test(texto) ? "23514" : "?"}:${restriccion}`;
        }
      };
      const cierre = e.cierres[0]!;
      expect(await insertar("pago", "incentivo", "cierre_dia", cierre)).toBe("23514:pago_mensajero_movimiento_tipo_categoria_check");
      expect(await insertar("devengo", "incentivo", "manual", null)).toBe("23514:pago_mensajero_movimiento_incentivo_origen_check");
      expect(await insertar("devengo", "incentivo", "incentivo_mensajero", randomUUID())).toBe("23514:pago_mensajero_movimiento_incentivo_origen_check");
      expect(await insertar("devengo", "reverso_incentivo", "incentivo_mensajero", randomUUID())).toBe("23514:pago_mensajero_movimiento_tipo_categoria_check");
      expect(await insertar("pago", "reverso_incentivo", "cierre_dia", cierre)).toBe("23514:pago_mensajero_movimiento_incentivo_origen_check");
      expect(await insertar("pago", "reverso_incentivo", "incentivo_mensajero", null)).toBe("23514:pago_mensajero_movimiento_incentivo_origen_check");
      // Control: las dos formas correctas entran (sin esto, «rechaza todo» pasaria).
      expect(await insertar("devengo", "incentivo", "cierre_dia", cierre)).toBe("insertado");
      expect(await insertar("pago", "reverso_incentivo", "incentivo_mensajero", randomUUID())).toBe("insertado");
      expect(await libro(e)).toHaveLength(2);
    });
  }, 120_000);

  // ── R13 / R15 ───────────────────────────────────────────────────────────────────────────────

  it("R13: la anulacion escribe UN `reverso_incentivo` (pago, origen el incentivo) y UN `ingreso_ajuste`, con el motivo; los originales no cambian", async () => {
    await conEscenario(async (e) => {
      const id = await registrarOk(e);
      const originalesLibro = await libro(e);
      const originalesCaja = await caja(e);
      expect(originalesLibro).toHaveLength(1);
      expect(originalesCaja).toHaveLength(1);

      expect(await anular(e, id, e.p.admin)).toEqual({ status: "ok" });

      const l = await libro(e);
      expect(l).toHaveLength(2);
      expect(l[0]).toEqual(originalesLibro[0]);
      expect(l[1]).toMatchObject({
        tipo: "pago",
        categoria: "reverso_incentivo",
        origenTipo: "incentivo_mensajero",
        origenId: id,
        descripcion: "Anulación del incentivo · Monto equivocado",
        registradoPor: e.p.admin.usuarioId,
      });
      expect(l[1]!.monto.toFixed(2)).toBe(M);

      const c = await caja(e);
      expect(c).toHaveLength(2);
      expect(c[0]).toEqual(originalesCaja[0]);
      expect(c[1]).toMatchObject({
        tipo: "ingreso",
        categoria: "ingreso_ajuste",
        origenTipo: "incentivo_mensajero",
        origenId: id,
        descripcion: "Anulación del incentivo · Monto equivocado",
      });
      expect(c[1]!.monto.toFixed(2)).toBe(M);
    });
  }, 120_000);

  it("R15: anular dos veces, en serie, responde `ya_anulado` sin filas nuevas", async () => {
    await conEscenario(async (e) => {
      const id = await registrarOk(e);
      expect(await anular(e, id)).toEqual({ status: "ok" });
      expect(await anular(e, id)).toEqual({ status: "ya_anulado" });
      expect(await libro(e)).toHaveLength(2);
      expect(await caja(e)).toHaveLength(2);
      // La barrera es la BASE (el unico de origen), no la lectura previa del servicio: un segundo
      // `reverso_incentivo` del mismo incentivo, escrito a mano, lo rechaza el indice (23505).
      const segundo = await prisma
        .$executeRawUnsafe(
          `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
           VALUES ($1,$2,'pago','reverso_incentivo',2500.00,'incentivo_mensajero',$3,$4)`,
          randomUUID(), e.p.mensajero.usuarioId, id, e.p.organizacionId,
        )
        .then(
          () => "insertado",
          (error: unknown) => {
            const texto = String((error as Error).message) + JSON.stringify((error as { cause?: unknown }).cause ?? null);
            return /23505|P2002|Unique constraint|pago_mensajero_movimiento_origen_uq/.test(texto) ? "23505" : texto.slice(-300);
          },
        );
      expect(segundo).toBe("23505");
      expect(await libro(e)).toHaveLength(2);
    });
  }, 120_000);

  it("R15: anular dos veces A LA VEZ: una `ok`, otra `ya_anulado`, UN contraasiento por libro", async () => {
    await conEscenario(async (e) => {
      const id = await registrarOk(e);
      const [x, y] = await Promise.all([anular(e, id), anular(e, id)]);
      expect([x.status, y.status].sort()).toEqual(["ok", "ya_anulado"]);
      expect((await libro(e)).filter((f) => f.categoria === "reverso_incentivo")).toHaveLength(1);
      expect((await caja(e)).filter((f) => f.categoria === "ingreso_ajuste")).toHaveLength(1);
    });
  }, 120_000);

  // ── R17 ─────────────────────────────────────────────────────────────────────────────────────

  it("R17: la conciliacion de cierres ve en el libro del mensajero lo mismo con un incentivo y con su anulacion", async () => {
    await conEscenario(
      async (e) => {
        const cierreId = e.cierres[0]!;
        // Lo que el feed del cierre escribio al aprobarse: el devengo de su snapshot.
        await prisma.pagoMensajeroMovimiento.create({
          data: {
            mensajeroId: e.p.mensajero.usuarioId, tipo: "devengo", categoria: "pago_devengado", monto: new Prisma.Decimal("1000.00"),
            origenTipo: "cierre_dia", origenId: cierreId, organizacionId: e.p.organizacionId,
          },
        });
        const repo = new ConciliacionCierresAnaliticaRepository(app);
        const consulta = {} as ConsultaAnalitica; // el metodo no la lee: acota por los ids
        const delMensajero = async () =>
          (await repo.sumarLedgerPorOrigenDeCierre(consulta, [cierreId]))
            .filter((f) => f.ledger === "pago_mensajero_movimiento")
            .map((f) => [f.tipo, f.suma]);

        const antes = await delMensajero();
        expect(antes).toEqual([["devengo", "1000.00"]]);
        const id = await registrarOk(e);
        expect(await delMensajero()).toEqual(antes);
        expect(await anular(e, id)).toEqual({ status: "ok" });
        expect(await delMensajero()).toEqual(antes);
      },
      { cierres: [{ estado: "aprobado", dia: "2026-10-27", p: "1000.00" }] },
    );
  }, 120_000);

  // ── R16 / design §5 — la fila de la caja del incentivo ──────────────────────────────────────

  it("R16/§5: el egreso del incentivo es «a» su mensajero (autoria y filtro «A quién»), su documento sabe si esta anulado y la autoria lee la anulacion", async () => {
    await conEscenario(async (e) => {
      const id = await registrarOk(e);
      const [egreso] = await caja(e);
      expect(egreso, "el registro no dejo egreso de caja").toBeDefined();
      const autoria = new LibroCajaAutoriaService(new LibroCajaAutoriaRepository(app));
      const documentos = new IncentivoCajaDocumentosRepository(app);
      const filtradas = async () =>
        (
          await app.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT w."id" FROM "wallet_movimiento" w WHERE ${condicionAQuienSql({ tipo: "mensajero", id: e.p.mensajero.usuarioId })}`,
          )
        ).map((r) => r.id);

      const antes = await autoria.resolver({ movimientoIds: [egreso!.id] }, e.p.maestro);
      expect(antes.status).toBe("ok");
      if (antes.status !== "ok") throw new Error("imposible");
      expect(antes.filas).toHaveLength(1);
      expect(antes.filas[0]!.aQuien.cuenta).toEqual({ tipo: "mensajero", id: e.p.mensajero.usuarioId });
      expect(antes.filas[0]!.anulacion).toBeNull();
      expect(await filtradas()).toEqual([egreso!.id]);
      expect(await documentos.estadoDeDocumentos([id])).toEqual([{ id, anulado: false, tieneComprobante: false }]);

      expect(await anular(e, id)).toEqual({ status: "ok" });
      const despues = await autoria.resolver({ movimientoIds: [egreso!.id] }, e.p.maestro);
      if (despues.status !== "ok") throw new Error("imposible");
      expect(despues.filas[0]!.anulacion?.motivo).toBe("Anulación del incentivo · Monto equivocado");
      expect(await documentos.estadoDeDocumentos([id])).toEqual([{ id, anulado: true, tieneComprobante: false }]);
    });
  }, 120_000);

  // ── R16 — la fila del incentivo en el LIBRO DEL MENSAJERO ───────────────────────────────────

  it("R16: en el libro del mensajero el incentivo es anulable (no «nace de un cierre») y, tras su `reverso_incentivo`, dice Anulado con el motivo y deja de ser anulable", async () => {
    await conEscenario(async (e) => {
      const id = await registrarOk(e);
      // El MISMO servicio que arma `buildService()` de `lib/actions/estado-cuenta.ts`, sobre la base real.
      const servicio = new EstadoCuentaService(
        new EstadoCuentaRepository(app),
        new RechazoTiendaCobroAnulacionRepository(app),
        new OrigenLegibleService(new OrigenLegibleRepository(app)),
        busquedaPorGuiaDe(app),
      );
      const leer = async () => {
        const r = await servicio.leer(
          { cuenta: { tipo: "mensajero", id: e.p.mensajero.usuarioId }, page: 1, pageSize: 50, sortBy: "fecha", sortDir: "asc" },
          e.p.maestro,
        );
        expect(r.status, JSON.stringify(r)).toBe("ok");
        if (r.status !== "ok") throw new Error("imposible");
        // Por categoria: el orden por fecha del devengo frente al reverso no es lo que se mide aqui.
        const filas = [...r.estado.filas].sort((a, b) => a.categoria.localeCompare(b.categoria));
        return filas.map((f) => ({
          movimientoId: f.ref !== null && "movimientoId" in f.ref ? f.ref.movimientoId : null,
          categoria: f.categoria,
          anulable: f.anulable,
          naceDeUnCierre: f.naceDeUnCierre,
          esContraAsiento: f.esContraAsiento,
          motivo: f.anulacion?.motivo ?? null,
        }));
      };

      expect(await leer()).toEqual([
        { movimientoId: id, categoria: "incentivo", anulable: true, naceDeUnCierre: false, esContraAsiento: false, motivo: null },
      ]);

      expect(await anular(e, id)).toEqual({ status: "ok" });
      const despues = await leer();
      const reverso = despues.find((f) => f.categoria === "reverso_incentivo");
      expect(reverso, "la anulacion no dejo `reverso_incentivo` en el libro").toBeDefined();
      expect(despues).toEqual([
        {
          movimientoId: id,
          categoria: "incentivo",
          anulable: false,
          naceDeUnCierre: false,
          esContraAsiento: false,
          motivo: "Anulación del incentivo · Monto equivocado",
        },
        {
          movimientoId: reverso!.movimientoId,
          categoria: "reverso_incentivo",
          anulable: false,
          naceDeUnCierre: false,
          esContraAsiento: true,
          motivo: null,
        },
      ]);
    });
  }, 120_000);
});
