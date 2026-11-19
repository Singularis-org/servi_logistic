import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { registrarIncentivoMensajeroAction, anularIncentivoMensajeroAction } from "@/lib/actions/incentivo-mensajero";
import {
  anularPremioAction,
  listarPremiosDelDiaAction,
  registrarPremioAction,
} from "@/lib/actions/premio-ranking-devengo";
import { obtenerRankingAction } from "@/lib/actions/ranking";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { PremioTx } from "@/lib/interfaces/services/IPremioRankingDevengoService";
import type { IncentivoTx } from "@/lib/interfaces/services/IIncentivoMensajeroService";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { PremioRankingRepository } from "@/lib/repositories/PremioRankingRepository";
import { RankingRepository } from "@/lib/repositories/RankingRepository";
import { RankingSnapshotRepository } from "@/lib/repositories/RankingSnapshotRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { CajaIncentivoMensajeroFeedService } from "@/lib/services/CajaIncentivoMensajeroFeedService";
import { CajaPremioRankingFeedService } from "@/lib/services/CajaPremioRankingFeedService";
import { RankingSnapshotService } from "@/lib/services/RankingSnapshotService";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { conCandado459, limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// La zona del pais de la empresa es la de CR (molde `pago-mensajero-bodega-duena.test.ts`): las reglas
// reales leen el pais con el cliente global, que fuera de `conEmpresa` no tiene empresa.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas: fijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => fijas(),
  };
});

// La puerta de modulo con todo encendido: aqui no se prueba el modulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-124 «Ranking de la central sin mensajeros de satelite» — T8, contra Postgres real.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Premio e incentivo entran por las server actions con el COMPOSITION ROOT real (servicio,
// repositorios, extension de empresa y RLS de verdad); solo se inyecta el actor. El congelado del
// ranking se arma con las MISMAS piezas que el cron (`app/api/cron/snapshot-ranking/route.ts`).
// Siembra commiteada bajo el candado 459, cada `it` con su escenario y limpieza en un `finally`.
//
// Lo que se afirma se mide con el cliente BASE (dueno, sin RLS): filas del libro del mensajero, de la
// caja y del historial de acciones, antes y despues.
//
// MUTACIONES (obligatorias, T8), resultado anotado en `progress/impl_SLT-124.md`:
//   1. quitar `...alcanceWhere(alcance)` de `CierreDelDiaRepository.resolverCierreDelDia` -> rojos a-d;
//   2. volver a las lecturas sin alcance en `IncentivoMensajeroService.registrar` -> rojos e y f;
//   3. quitar `zona: { esCentral: true }` de `UserRepository.listMensajeros` -> rojos h y j.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Fechas calendario CR, todas en el pasado. La ventana del dia es `[06:00Z, 06:00Z + 24 h)`. */
const DIA_PODIO = "2026-10-05";
const DIA_ANULAR = "2026-10-06";
const DIA_RANKING = "2026-10-07";
const DIA_HISTORICO = "2026-10-04";
const DIA_SIN_CENTRAL = "2026-10-08";
const dentroDelDia = (f: string) => new Date(`${f}T15:00:00.000Z`);
const comoFecha = (f: string) => new Date(`${f}T00:00:00.000Z`);
/** `now` del cron que congela `f`: el cron congela AYER, asi que corre el dia siguiente. */
const nowQueCongela = (f: string) => new Date(new Date(`${f}T18:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);

const deps = (actor: Actor) => ({ getActor: async () => actor });

type Destino = "bodega_central" | "bodega_satelite";

describeSiHayBase("SLT-124 — la central no cuelga dinero de cierres de satelite ni los rankea (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  // ── Siembra ─────────────────────────────────────────────────────────────────────────────────

  interface Ctx {
    personas: Personas459[];
    zonas: string[];
  }

  async function zona(ctx: Ctx, p: Personas459, nombre: string, esCentral: boolean): Promise<string> {
    const z = await prisma.zona.create({
      data: {
        organizacionId: p.organizacionId,
        nombre: `${nombre} SLT-124 ${randomUUID().slice(0, 8)}`,
        esCentral,
        sinpeNumero: "80000124",
        sinpeNombre: "Titular SLT-124",
      },
      select: { id: true },
    });
    ctx.zonas.push(z.id);
    return z.id;
  }

  async function mensajero(p: Personas459, nombre: string, zonaId: string | null): Promise<string> {
    const rol = await prisma.rol.findFirstOrThrow({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
    const clave = randomUUID().slice(0, 8);
    const u = await prisma.usuario.create({
      data: {
        nombre,
        email: `mensajero-slt124-${clave}@example.test`,
        telefono: "88880124",
        passwordHash: "x",
        cedula: `SLT124-${clave}`,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
        estado: "activo",
        organizacionId: p.organizacionId,
        zonaId,
      },
      select: { id: true },
    });
    p.usuarios.push(u.id); // `limpiar459` lo borra con los demas
    return u.id;
  }

  async function cierre(
    p: Personas459,
    mensajeroId: string,
    destino: { tipo: Destino; zonaId: string },
    estado: "aprobado" | "solicitado",
    solicitadoAt: Date,
  ): Promise<string> {
    const c = await prisma.cierreDia.create({
      data: {
        organizacionId: p.organizacionId,
        mensajeroId,
        estado,
        destinoTipo: destino.tipo,
        destinoZonaId: destino.zonaId,
        totalEfectivo: new Prisma.Decimal("0.00"),
        totalPagoMensajero: new Prisma.Decimal("0.00"),
        solicitadoAt,
        ...(estado === "aprobado" ? { resueltoPor: p.maestro.usuarioId, resueltoAt: new Date() } : {}),
      },
      select: { id: true },
    });
    return c.id;
  }

  /**
   * Una orden asignada a `mensajeroId` para el dia `dia` y, si `cierreId` no es `undefined`, una
   * gestion `entregado` VIGENTE de ese dia. Es lo que ata un dia a un cierre (premio) y lo que cuenta
   * el ranking (entregadas / asignadas).
   */
  async function ordenEntregada(
    p: Personas459,
    zonaId: string,
    mensajeroId: string,
    dia: string,
    cierreId: string | null,
  ): Promise<void> {
    const estatus = await prisma.orderStatus.findUniqueOrThrow({ where: { value: "entregado" }, select: { id: true } });
    const canton = await prisma.canton.findFirstOrThrow({
      where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
      select: { id: true, provinciaId: true },
    });
    const orden = await prisma.orden.create({
      data: {
        organizacionId: p.organizacionId,
        numRemision: `SLT124-${randomUUID().slice(0, 12)}`,
        estatusId: estatus.id,
        destinatario: "Destinatario SLT-124",
        telefonoDest: "00000000",
        tiendaId: p.tiendaId,
        zonaId,
        provinciaId: canton.provinciaId,
        cantonId: canton.id,
        producto: "Caja",
        mensajeroAsignadoId: mensajeroId,
        asignadoAt: dentroDelDia(dia),
        fechaReparto: comoFecha(dia),
      },
      select: { id: true },
    });
    await prisma.gestionOrden.create({
      data: {
        organizacionId: p.organizacionId,
        ordenId: orden.id,
        mensajeroId,
        resultado: "entregado",
        cierreId,
        createdAt: dentroDelDia(dia),
      },
    });
  }

  /** El podio congelado de `dia`, sembrado tal cual (es historia: el cron no lo reescribe). */
  async function podio(
    p: Personas459,
    dia: string,
    filas: { mensajeroId: string; nombre: string; posicion: number; monto: string }[],
  ): Promise<string[]> {
    const s = await prisma.rankingSnapshotDia.create({
      data: { organizacionId: p.organizacionId, fecha: comoFecha(dia), minAsignadasPodio: 1, filas: filas.length },
      select: { id: true },
    });
    const ids: string[] = [];
    for (const [i, f] of filas.entries()) {
      const fila = await prisma.rankingSnapshotFila.create({
        data: {
          organizacionId: p.organizacionId,
          snapshotId: s.id,
          puesto: i + 1,
          posicion: f.posicion,
          mensajeroId: f.mensajeroId,
          mensajeroNombre: f.nombre,
          entregadas: 1,
          asignadas: 1,
          premioMonto: new Prisma.Decimal(f.monto),
          premioDescripcion: null,
        },
        select: { id: true },
      });
      ids.push(fila.id);
    }
    return ids;
  }

  async function limpiar(ctx: Ctx): Promise<void> {
    const usuarios = ctx.personas.flatMap((p) => p.usuarios);
    const orgs = ctx.personas.map((p) => p.organizacionId);
    try {
      const filas = await prisma.rankingSnapshotFila.findMany({ where: { organizacionId: { in: orgs } }, select: { id: true } });
      await prisma.historialAccion.deleteMany({ where: { entidadId: { in: filas.map((f) => f.id) } } });
      await prisma.walletMovimiento.deleteMany({ where: { registradoPor: { in: usuarios } } });
      await prisma.pagoMensajeroMovimiento.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.gestionOrden.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.orden.deleteMany({ where: { tiendaId: { in: usuarios } } });
      await prisma.rankingSnapshotDia.deleteMany({ where: { organizacionId: { in: orgs } } });
      await prisma.cierreDia.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.usuario.updateMany({ where: { id: { in: usuarios } }, data: { zonaId: null } });
      await prisma.zona.deleteMany({ where: { id: { in: ctx.zonas } } });
    } finally {
      for (const p of ctx.personas) await limpiar459(prisma, p);
    }
  }

  async function conCtx(cuerpo: (ctx: Ctx) => Promise<void>): Promise<void> {
    await conCandado459(prisma, async () => {
      const ctx: Ctx = { personas: [], zonas: [] };
      try {
        await cuerpo(ctx);
      } finally {
        await limpiar(ctx);
      }
    });
  }

  async function personas(ctx: Ctx): Promise<Personas459> {
    const p = await sembrarPersonas459(prisma);
    ctx.personas.push(p);
    return p;
  }

  // ── Escenario del premio (a-d) ──────────────────────────────────────────────────────────────

  interface EscenarioPodio {
    p: Personas459;
    /** (a) solo un cierre de satelite `aprobado` ese dia. */
    soloSatelite: { mensajeroId: string; filaId: string; cierreSatelite: string };
    /** (b) satelite `aprobado` pedido ANTES y central `aprobado`. */
    mixtoAprobado: { mensajeroId: string; filaId: string; cierreSatelite: string; cierreCentral: string };
    /** (c) satelite `aprobado` pedido ANTES y central `solicitado`. */
    mixtoSolicitado: { mensajeroId: string; filaId: string; cierreSatelite: string; cierreCentral: string };
  }

  async function escenarioPodio(ctx: Ctx): Promise<EscenarioPodio> {
    const p = await personas(ctx);
    const central = await zona(ctx, p, "Central", true);
    const satelite = await zona(ctx, p, "Satelite", false);
    const mA = await mensajero(p, "Mensajero A SLT124", satelite);
    const mB = await mensajero(p, "Mensajero B SLT124", central);
    const mC = await mensajero(p, "Mensajero C SLT124", central);
    // El de satelite se pide SIEMPRE antes: sin el filtro en el WHERE, `findFirst` lo elegiria.
    const temprano = new Date(`${DIA_PODIO}T23:00:00.000Z`);
    const tarde = new Date(`${DIA_PODIO}T23:30:00.000Z`);

    const satA = await cierre(p, mA, { tipo: "bodega_satelite", zonaId: satelite }, "aprobado", temprano);
    await ordenEntregada(p, satelite, mA, DIA_PODIO, satA);

    const satB = await cierre(p, mB, { tipo: "bodega_satelite", zonaId: satelite }, "aprobado", temprano);
    const cenB = await cierre(p, mB, { tipo: "bodega_central", zonaId: central }, "aprobado", tarde);
    await ordenEntregada(p, satelite, mB, DIA_PODIO, satB);
    await ordenEntregada(p, central, mB, DIA_PODIO, cenB);

    const satC = await cierre(p, mC, { tipo: "bodega_satelite", zonaId: satelite }, "aprobado", temprano);
    const cenC = await cierre(p, mC, { tipo: "bodega_central", zonaId: central }, "solicitado", tarde);
    await ordenEntregada(p, satelite, mC, DIA_PODIO, satC);
    await ordenEntregada(p, central, mC, DIA_PODIO, cenC);

    const [fA, fB, fC] = await podio(p, DIA_PODIO, [
      { mensajeroId: mA, nombre: "Mensajero A SLT124", posicion: 1, monto: "5000.00" },
      { mensajeroId: mB, nombre: "Mensajero B SLT124", posicion: 2, monto: "3000.00" },
      { mensajeroId: mC, nombre: "Mensajero C SLT124", posicion: 3, monto: "1000.00" },
    ]);
    return {
      p,
      soloSatelite: { mensajeroId: mA, filaId: fA!, cierreSatelite: satA },
      mixtoAprobado: { mensajeroId: mB, filaId: fB!, cierreSatelite: satB, cierreCentral: cenB },
      mixtoSolicitado: { mensajeroId: mC, filaId: fC!, cierreSatelite: satC, cierreCentral: cenC },
    };
  }

  /** Lo sembrado existe y es lo que el caso cree que es. Sin esto, un `sin_cierre` no prueba nada. */
  async function afirmarPodioSembrado(e: EscenarioPodio): Promise<void> {
    const destinos = await prisma.cierreDia.findMany({
      where: { mensajeroId: { in: [e.soloSatelite.mensajeroId, e.mixtoAprobado.mensajeroId, e.mixtoSolicitado.mensajeroId] } },
      select: { id: true, destinoTipo: true, estado: true, _count: { select: { gestiones: true } } },
    });
    const de = (id: string) => destinos.find((c) => c.id === id);
    expect(de(e.soloSatelite.cierreSatelite)).toMatchObject({ destinoTipo: "bodega_satelite", estado: "aprobado", _count: { gestiones: 1 } });
    expect(de(e.mixtoAprobado.cierreSatelite)).toMatchObject({ destinoTipo: "bodega_satelite", estado: "aprobado", _count: { gestiones: 1 } });
    expect(de(e.mixtoAprobado.cierreCentral)).toMatchObject({ destinoTipo: "bodega_central", estado: "aprobado", _count: { gestiones: 1 } });
    expect(de(e.mixtoSolicitado.cierreSatelite)).toMatchObject({ destinoTipo: "bodega_satelite", estado: "aprobado", _count: { gestiones: 1 } });
    expect(de(e.mixtoSolicitado.cierreCentral)).toMatchObject({ destinoTipo: "bodega_central", estado: "solicitado", _count: { gestiones: 1 } });
    expect(destinos).toHaveLength(5);
    expect(
      await prisma.rankingSnapshotFila.count({
        where: { id: { in: [e.soloSatelite.filaId, e.mixtoAprobado.filaId, e.mixtoSolicitado.filaId] }, posicion: { not: null } },
      }),
    ).toBe(3);
  }

  async function escrituras(mensajeroId: string, filaId: string) {
    return {
      libro: await prisma.pagoMensajeroMovimiento.count({ where: { mensajeroId } }),
      caja: await prisma.walletMovimiento.count({ where: { origenId: filaId } }),
      acciones: await prisma.historialAccion.count({ where: { entidadId: filaId, accion: "premio_ranking_registrado" } }),
    };
  }

  // ── (a) R2 ──────────────────────────────────────────────────────────────────────────────────

  it("(a) R2: solo un cierre de satelite aprobado ese dia -> `sin_cierre`, sin libro, caja ni accion", async () => {
    await conCtx(async (ctx) => {
      const e = await escenarioPodio(ctx);
      await afirmarPodioSembrado(e);
      const { mensajeroId, filaId } = e.soloSatelite;
      expect(await escrituras(mensajeroId, filaId)).toEqual({ libro: 0, caja: 0, acciones: 0 });

      const r = await conEmpresa(e.p.organizacionId, () => registrarPremioAction({ filaId }, deps(e.p.maestro)));

      expect(r).toEqual({ status: "sin_cierre" });
      expect(await escrituras(mensajeroId, filaId)).toEqual({ libro: 0, caja: 0, acciones: 0 });
    });
  });

  // ── (b) R1, R3 ──────────────────────────────────────────────────────────────────────────────

  it("(b) R1/R3: caso mixto con los dos aprobados -> el premio se imputa al CENTRAL aunque el de satelite se pidio antes", async () => {
    await conCtx(async (ctx) => {
      const e = await escenarioPodio(ctx);
      await afirmarPodioSembrado(e);
      const { mensajeroId, filaId, cierreCentral, cierreSatelite } = e.mixtoAprobado;

      const r = await conEmpresa(e.p.organizacionId, () => registrarPremioAction({ filaId }, deps(e.p.admin)));

      expect(r).toEqual({ status: "ok", monto: "3000.00", cierreId: cierreCentral });
      const libro = await prisma.pagoMensajeroMovimiento.findMany({
        where: { mensajeroId },
        select: { categoria: true, origenTipo: true, origenId: true, monto: true },
      });
      expect(libro.map((m) => ({ ...m, monto: m.monto.toFixed(2) }))).toEqual([
        { categoria: "premio_ranking", origenTipo: "cierre_dia", origenId: cierreCentral, monto: "3000.00" },
      ]);
      expect(libro.some((m) => m.origenId === cierreSatelite)).toBe(false);
      expect(await escrituras(mensajeroId, filaId)).toEqual({ libro: 1, caja: 1, acciones: 1 });
    });
  });

  // ── (c) R3 ──────────────────────────────────────────────────────────────────────────────────

  it("(c) R3: satelite aprobado y central solicitado -> `cierre_no_aprobado` con el estado DEL CENTRAL, sin escribir", async () => {
    await conCtx(async (ctx) => {
      const e = await escenarioPodio(ctx);
      await afirmarPodioSembrado(e);
      const { mensajeroId, filaId } = e.mixtoSolicitado;

      const r = await conEmpresa(e.p.organizacionId, () => registrarPremioAction({ filaId }, deps(e.p.maestro)));

      expect(r).toEqual({ status: "cierre_no_aprobado", estado: "solicitado" });
      expect(await escrituras(mensajeroId, filaId)).toEqual({ libro: 0, caja: 0, acciones: 0 });
    });
  });

  // ── (d) R4 ──────────────────────────────────────────────────────────────────────────────────

  it("(d) R4: el listado de la fecha deriva cada estado con la misma resolucion (a, b y c)", async () => {
    await conCtx(async (ctx) => {
      const e = await escenarioPodio(ctx);
      await afirmarPodioSembrado(e);

      const r = await conEmpresa(e.p.organizacionId, () =>
        listarPremiosDelDiaAction({ fecha: DIA_PODIO }, deps(e.p.maestro)),
      );

      if (!("hayPodio" in r)) throw new Error(`esperaba el listado, llego ${JSON.stringify(r)}`);
      expect(r.hayPodio).toBe(true);
      expect(r.filas.map((f) => ({ filaId: f.filaId, estado: f.estado, cierreEstado: f.cierreEstado }))).toEqual([
        { filaId: e.soloSatelite.filaId, estado: "sin_cierre", cierreEstado: null },
        { filaId: e.mixtoAprobado.filaId, estado: "no_registrado", cierreEstado: "aprobado" },
        { filaId: e.mixtoSolicitado.filaId, estado: "cierre_no_aprobado", cierreEstado: "solicitado" },
      ]);
    });
  });

  // ── (e, f) R8, R9 ───────────────────────────────────────────────────────────────────────────

  function formIncentivo(mensajeroId: string): FormData {
    const f = new FormData();
    f.set("mensajeroId", mensajeroId);
    f.set("monto", "2500.00");
    f.set("motivo", "Cubrio dos rutas extra SLT-124");
    f.set("claveIdempotencia", randomUUID());
    return f;
  }

  it("(e) R8: con un aprobado de satelite MAS RECIENTE que el central, el incentivo se imputa al central", async () => {
    await conCtx(async (ctx) => {
      const p = await personas(ctx);
      const central = await zona(ctx, p, "Central", true);
      const satelite = await zona(ctx, p, "Satelite", false);
      const m = await mensajero(p, "Mensajero E SLT124", central);
      const cenViejo = await cierre(p, m, { tipo: "bodega_central", zonaId: central }, "aprobado", new Date("2026-10-01T23:00:00.000Z"));
      const satNuevo = await cierre(p, m, { tipo: "bodega_satelite", zonaId: satelite }, "aprobado", new Date("2026-10-10T23:00:00.000Z"));
      expect(await prisma.cierreDia.count({ where: { mensajeroId: m, estado: "aprobado" } })).toBe(2);

      const r = await conEmpresa(p.organizacionId, () => registrarIncentivoMensajeroAction(formIncentivo(m), deps(p.maestro)));

      expect(r).toMatchObject({ status: "ok", incentivo: { cierreId: cenViejo, monto: "2500.00" } });
      const libro = await prisma.pagoMensajeroMovimiento.findMany({ where: { mensajeroId: m }, select: { categoria: true, origenId: true } });
      expect(libro).toEqual([{ categoria: "incentivo", origenId: cenViejo }]);
      expect(libro.some((x) => x.origenId === satNuevo)).toBe(false);
    });
  });

  it("(f) R9: solo cierres aprobados de satelite -> `sin_cierre_aprobado`, 0 filas en el libro y en la caja", async () => {
    await conCtx(async (ctx) => {
      const p = await personas(ctx);
      const satelite = await zona(ctx, p, "Satelite", false);
      const m = await mensajero(p, "Mensajero F SLT124", satelite);
      await cierre(p, m, { tipo: "bodega_satelite", zonaId: satelite }, "aprobado", new Date("2026-10-10T23:00:00.000Z"));
      expect(await prisma.cierreDia.count({ where: { mensajeroId: m, estado: "aprobado", destinoTipo: "bodega_satelite" } })).toBe(1);

      const r = await conEmpresa(p.organizacionId, () => registrarIncentivoMensajeroAction(formIncentivo(m), deps(p.admin)));

      expect(r).toEqual({ status: "sin_cierre_aprobado" });
      expect(await prisma.pagoMensajeroMovimiento.count({ where: { mensajeroId: m } })).toBe(0);
      expect(await prisma.walletMovimiento.count({ where: { registradoPor: { in: p.usuarios } } })).toBe(0);
    });
  });

  // ── (g) R7, R11 ─────────────────────────────────────────────────────────────────────────────

  it("(g) R7/R11: un premio y un incentivo YA registrados contra un cierre de satelite se anulan como hoy", async () => {
    await conCtx(async (ctx) => {
      const p = await personas(ctx);
      const satelite = await zona(ctx, p, "Satelite", false);
      const m = await mensajero(p, "Mensajero G SLT124", satelite);
      const sat = await cierre(p, m, { tipo: "bodega_satelite", zonaId: satelite }, "aprobado", new Date(`${DIA_ANULAR}T23:00:00.000Z`));
      await ordenEntregada(p, satelite, m, DIA_ANULAR, sat);
      const [filaId] = await podio(p, DIA_ANULAR, [{ mensajeroId: m, nombre: "Mensajero G SLT124", posicion: 1, monto: "4000.00" }]);
      const incentivoId = randomUUID();

      // El premio y el incentivo de ANTES de esta ficha, escritos con las mismas piezas que los
      // registraban: devengo en el libro + egreso en la caja, colgados del cierre de satelite.
      await conEmpresa(p.organizacionId, async () => {
        const cliente = getPrismaClient();
        const libro = new PagoMensajeroMovimientoRepository(cliente);
        const cajaRepo = new WalletMovimientoRepository(cliente);
        await cliente.$transaction(async (tx) => {
          await libro.crearMovimientos(tx as unknown as PremioTx, [
            {
              mensajeroId: m,
              tipo: "devengo",
              categoria: "premio_ranking",
              monto: "4000.00",
              origenTipo: "cierre_dia",
              origenId: sat,
              premioDia: comoFecha(DIA_ANULAR),
              descripcion: "Premio sembrado SLT-124",
              registradoPor: p.maestro.usuarioId,
            },
            {
              id: incentivoId,
              mensajeroId: m,
              tipo: "devengo",
              categoria: "incentivo",
              monto: "2500.00",
              origenTipo: "cierre_dia",
              origenId: sat,
              descripcion: "Incentivo sembrado SLT-124",
              registradoPor: p.maestro.usuarioId,
            },
          ]);
          await new CajaPremioRankingFeedService(cajaRepo).emitirEgresoPremio(tx as unknown as PremioTx, {
            filaId: filaId!,
            monto: "4000.00",
            descripcion: "Premio sembrado SLT-124",
            registradoPor: p.maestro.usuarioId,
          });
          await new CajaIncentivoMensajeroFeedService(cajaRepo).emitirEgreso(tx as unknown as IncentivoTx, {
            incentivoId,
            monto: "2500.00",
            descripcion: "Incentivo sembrado SLT-124",
            registradoPor: p.maestro.usuarioId,
          });
        });
      });
      expect(
        await prisma.pagoMensajeroMovimiento.count({ where: { mensajeroId: m, tipo: "devengo", origenId: sat } }),
      ).toBe(2);

      const premio = await conEmpresa(p.organizacionId, () =>
        anularPremioAction({ filaId, motivo: "Error de registro SLT-124" }, deps(p.maestro)),
      );
      const incentivo = await conEmpresa(p.organizacionId, () =>
        anularIncentivoMensajeroAction({ incentivoId, motivo: "Error de registro SLT-124" }, deps(p.maestro)),
      );

      expect(premio).toEqual({ status: "ok" });
      expect(incentivo).toEqual({ status: "ok" });
      const compensaciones = await prisma.pagoMensajeroMovimiento.findMany({
        where: { mensajeroId: m, tipo: "pago" },
        select: { categoria: true, origenTipo: true, origenId: true, monto: true },
        orderBy: { categoria: "asc" },
      });
      expect(compensaciones.map((c) => ({ ...c, monto: c.monto.toFixed(2) }))).toEqual([
        // R7: la compensacion del premio, contra ESE MISMO cierre de satelite.
        { categoria: "ajuste_pago", origenTipo: "cierre_dia", origenId: sat, monto: "4000.00" },
        // R11: el reverso del incentivo, contra el propio incentivo.
        { categoria: "reverso_incentivo", origenTipo: "incentivo_mensajero", origenId: incentivoId, monto: "2500.00" },
      ]);
      const reversosCaja = await prisma.walletMovimiento.findMany({
        where: { origenId: { in: [filaId!, incentivoId] }, tipo: "ingreso" },
        select: { categoria: true, origenTipo: true },
        // `origen_tipo` es un enum: ordena por el orden de declaracion, no alfabetico.
        orderBy: { origenTipo: "asc" },
      });
      expect(reversosCaja).toEqual([
        { categoria: "ingreso_ajuste", origenTipo: "ranking_snapshot_fila" },
        { categoria: "ingreso_ajuste", origenTipo: "incentivo_mensajero" },
      ]);
    });
  });

  // ── (h, i) R12, R13 ─────────────────────────────────────────────────────────────────────────

  function servicioDelCron(): RankingSnapshotService {
    const cliente = getPrismaClient();
    return new RankingSnapshotService(
      new RankingSnapshotRepository(cliente),
      new RankingRepository(cliente),
      new UserRepository(cliente),
      new PremioRankingRepository(cliente),
      { MIN_ASIGNADAS_PODIO: 1 },
      reglasPaisFijas(),
    );
  }

  it("(h) R12: un mensajero de satelite con MAS entregas no aparece ni en el vivo ni en el congelado; el podio es de la central", async () => {
    await conCtx(async (ctx) => {
      const p = await personas(ctx);
      const central = await zona(ctx, p, "Central", true);
      const satelite = await zona(ctx, p, "Satelite", false);
      const c = await mensajero(p, "Central Uno SLT124", central);
      const s = await mensajero(p, "Satelite Uno SLT124", satelite);
      await ordenEntregada(p, central, c, DIA_RANKING, null);
      for (let i = 0; i < 3; i += 1) await ordenEntregada(p, satelite, s, DIA_RANKING, null);
      // El mensajero de `sembrarPersonas459` no tiene zona: tampoco entra. Se le da actividad para
      // que no quede fuera solo por estar en 0/0.
      await ordenEntregada(p, satelite, p.mensajero.usuarioId, DIA_RANKING, null);
      expect(await prisma.gestionOrden.count({ where: { mensajeroId: s } })).toBe(3);
      expect(await prisma.usuario.findUniqueOrThrow({ where: { id: s }, select: { zonaId: true } })).toEqual({ zonaId: satelite });

      const vivo = await conEmpresa(p.organizacionId, () =>
        obtenerRankingAction({ ...deps(p.maestro), now: new Date(`${DIA_RANKING}T20:00:00.000Z`) }),
      );
      if (vivo.status !== "ok") throw new Error(`esperaba el ranking, llego ${vivo.status}`);
      expect(vivo.data.ranking.map((f) => ({ nombre: f.nombre, posicion: f.posicion, entregadas: f.entregadasHoy, asignadas: f.asignadasHoy }))).toEqual([
        { nombre: "Central Uno SLT124", posicion: 1, entregadas: 1, asignadas: 1 },
      ]);

      const congelado = await conEmpresa(p.organizacionId, () => servicioDelCron().congelar(nowQueCongela(DIA_RANKING)));
      expect(congelado).toEqual({ status: "creado", fecha: DIA_RANKING, filas: 1 });
      const filas = await prisma.rankingSnapshotFila.findMany({
        where: { organizacionId: p.organizacionId, snapshot: { fecha: comoFecha(DIA_RANKING) } },
        select: { mensajeroId: true, posicion: true, puesto: true },
      });
      expect(filas).toEqual([{ mensajeroId: c, posicion: 1, puesto: 1 }]);
    });
  });

  it("(i) R13: un snapshot congelado ANTES, con un mensajero de satelite en el podio, se lee igual", async () => {
    await conCtx(async (ctx) => {
      const p = await personas(ctx);
      await zona(ctx, p, "Central", true);
      const satelite = await zona(ctx, p, "Satelite", false);
      const s = await mensajero(p, "Satelite Historico SLT124", satelite);
      const [filaId] = await podio(p, DIA_HISTORICO, [{ mensajeroId: s, nombre: "Satelite Historico SLT124", posicion: 1, monto: "5000.00" }]);
      expect(await prisma.rankingSnapshotFila.count({ where: { id: filaId } })).toBe(1);

      const historico = await conEmpresa(p.organizacionId, () => servicioDelCron().obtenerPorFecha(p.maestro, DIA_HISTORICO));
      if (historico.status !== "ok") throw new Error(`esperaba el historico, llego ${historico.status}`);
      expect(historico.data.filas.map((f) => ({ nombre: f.nombre, posicion: f.posicion, premio: f.premioMonto }))).toEqual([
        { nombre: "Satelite Historico SLT124", posicion: 1, premio: "5000.00" },
      ]);

      const premios = await conEmpresa(p.organizacionId, () =>
        listarPremiosDelDiaAction({ fecha: DIA_HISTORICO }, deps(p.maestro)),
      );
      if (!("hayPodio" in premios)) throw new Error(`esperaba el listado, llego ${JSON.stringify(premios)}`);
      expect(premios.filas.map((f) => ({ filaId: f.filaId, mensajeroNombre: f.mensajeroNombre, estado: f.estado }))).toEqual([
        { filaId, mensajeroNombre: "Satelite Historico SLT124", estado: "sin_cierre" },
      ]);
    });
  });

  // ── (j) R14 ─────────────────────────────────────────────────────────────────────────────────

  it("(j) R14: empresa sin zona central -> vivo sin filas, congelado con cabecera y 0 filas, premios sin podio", async () => {
    await conCtx(async (ctx) => {
      const p = await personas(ctx);
      const satelite = await zona(ctx, p, "Satelite", false);
      const s = await mensajero(p, "Satelite Sola SLT124", satelite);
      await ordenEntregada(p, satelite, s, DIA_SIN_CENTRAL, null);
      expect(await prisma.zona.count({ where: { organizacionId: p.organizacionId, esCentral: true } })).toBe(0);
      expect(await prisma.gestionOrden.count({ where: { mensajeroId: s } })).toBe(1);

      const vivo = await conEmpresa(p.organizacionId, () =>
        obtenerRankingAction({ ...deps(p.maestro), now: new Date(`${DIA_SIN_CENTRAL}T20:00:00.000Z`) }),
      );
      if (vivo.status !== "ok") throw new Error(`esperaba el ranking, llego ${vivo.status}`);
      expect(vivo.data.ranking).toEqual([]);

      const congelado = await conEmpresa(p.organizacionId, () => servicioDelCron().congelar(nowQueCongela(DIA_SIN_CENTRAL)));
      expect(congelado).toEqual({ status: "creado", fecha: DIA_SIN_CENTRAL, filas: 0 });
      expect(
        await prisma.rankingSnapshotDia.findMany({
          where: { organizacionId: p.organizacionId },
          select: { fecha: true, filas: true, _count: { select: { filasSnapshot: true } } },
        }),
      ).toEqual([{ fecha: comoFecha(DIA_SIN_CENTRAL), filas: 0, _count: { filasSnapshot: 0 } }]);

      const premios = await conEmpresa(p.organizacionId, () =>
        listarPremiosDelDiaAction({ fecha: DIA_SIN_CENTRAL }, deps(p.maestro)),
      );
      expect(premios).toEqual({ status: "ok", fecha: DIA_SIN_CENTRAL, hayPodio: true, filas: [] });
    });
  });
});
