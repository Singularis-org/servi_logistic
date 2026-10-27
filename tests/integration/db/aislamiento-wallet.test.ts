import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { anularAbonoTiendaAction, registrarAbonoTiendaAction } from "@/lib/actions/abono-tienda";
import { verEstadoCuentaAction } from "@/lib/actions/estado-cuenta";
import { registrarPagoMensajeroAction, registrarPagoTiendaAction } from "@/lib/actions/liquidacion";
import {
  anularAjusteCajaAction,
  listarMovimientosAction,
  registrarMovimientoManualAction,
  verResumenCajaAction,
} from "@/lib/actions/wallet";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { listarCuentasPorPagarPaginadoAction, listarPagosDeMensajeroAction } from "@/lib/actions/wallet-mensajero";
import {
  anularCobroTiendaAction,
  listarMovimientosDeTiendaAction,
  listarSaldosTiendasPaginadoAction,
  registrarCobroTiendaAction,
} from "@/lib/actions/wallet-tienda";
import { EmpresaCruzada, conEmpresa } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import {
  acreditar459,
  conCandado459,
  endeudar457,
  formData459,
  limpiar459,
  sembrarPersonas459,
  type Personas459,
} from "./_fixtures/escrituras-459";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-17 / T3.2 — LA WALLET CON DOS EMPRESAS (R29; R37 en el caso de la base), contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Patron de design §9.2 con el COMPOSITION ROOT real: cada caso entra por las server actions que usan
// las pantallas de `/wallet` (caja, tiendas, mensajeros, estado de cuenta, anular) SIN inyectar el
// servicio; lo construye su `buildService()` con `getPrismaClient()`, la extension y la envoltura que
// baja a `servi_app`. Solo se inyecta el actor: la empresa sale de `conEmpresa`, como en una peticion.
// Por eso commitea (molde de la 459) y limpia en un `finally`.
//
// Lo que se afirma se mide con el cliente BASE (dueno, sin RLS): la huella de A antes y despues, y el
// conjunto exacto de filas de B. A siembra importes grandes y B pequenos: cualquier fila de A que se
// colara en una cifra de B la moveria. B tambien siembra y SI ve lo suyo; sin eso, un listado vacio
// pasaria por aislamiento.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Montos {
  credito: string;
  cobro: string;
  deuda: string;
  abono: string;
  ajuste: string;
  devengo: string;
  pagoMensajero: string;
  cierre: string;
}

const MONTOS_A: Montos = {
  credito: "80000.00",
  cobro: "9000.00",
  deuda: "50000.00",
  abono: "20000.00",
  ajuste: "7777.77",
  devengo: "45000.00",
  pagoMensajero: "7000.00",
  cierre: "30000.00",
};
const MONTOS_B: Montos = {
  credito: "3000.00",
  cobro: "250.00",
  deuda: "2000.00",
  abono: "600.00",
  ajuste: "111.11",
  devengo: "1500.00",
  pagoMensajero: "500.00",
  cierre: "900.00",
};

interface Empresa {
  p: Personas459;
  cobroId: string;
  /** La linea de la caja (cargo) del cobro. */
  cargoCobroId: string;
  abonoId: string;
  ajusteId: string;
  cierreId: string;
}

interface Escenario {
  a: Empresa;
  b: Empresa;
  /** El resumen de la caja de B leido ANTES de sembrar el dinero de A. */
  resumenB0: unknown;
}

const deps = (actor: Actor | null) => ({ getActor: async () => actor });

describeSiHayBase("SL-17/T3.2 — wallet aislada por empresa (Postgres real, R29)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const hoy = () => fechaCalendarioCR(new Date());
  const en = <T>(e: Empresa, fn: () => Promise<T>) => conEmpresa(e.p.organizacionId, fn);

  /** El dinero de una empresa, escrito por sus actions (y a mano lo que no tiene action). */
  async function sembrarDinero(p: Personas459, m: Montos, zonas: string[]): Promise<Empresa> {
    return conEmpresa(p.organizacionId, async () => {
      await acreditar459(prisma, p.tiendaId, m.credito);
      const cobro = await registrarCobroTiendaAction(
        { claveIdempotencia: randomUUID(), tiendaId: p.tiendaId, monto: m.cobro, descripcion: "Cobro SL-17" },
        deps(p.maestro),
      );
      if (cobro.status !== "ok") throw new Error(`siembra: cobro ${JSON.stringify(cobro)}`);
      const cargo = await prisma.walletMovimiento.findFirstOrThrow({
        where: { origenTipo: "cobro_tienda", origenId: cobro.cobro.id },
        select: { id: true },
      });

      await endeudar457(prisma, p.otraTiendaId, m.deuda);
      const abono = await registrarAbonoTiendaAction(
        formData459({
          claveIdempotencia: randomUUID(),
          tiendaId: p.otraTiendaId,
          monto: m.abono,
          metodo: "SINPE",
          referencia: "170017",
          motivo: "Pago SL-17",
          fechaPago: hoy(),
        }),
        deps(p.maestro),
      );
      if (abono.status !== "ok") throw new Error(`siembra: abono ${JSON.stringify(abono)}`);

      const ajuste = await registrarMovimientoManualAction(
        { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: m.ajuste, descripcion: "Ajuste SL-17" },
        deps(p.maestro),
      );
      if (ajuste.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(ajuste)}`);

      // El libro del mensajero y su cierre aprobado no tienen action de alta: los escribe el corte
      // diario. Van a mano, con la empresa explicita (el cliente base no pasa por la extension).
      const organizacionId = p.organizacionId;
      const mensajeroId = p.mensajero.usuarioId;
      await prisma.pagoMensajeroMovimiento.create({
        data: { organizacionId, mensajeroId, tipo: "devengo", categoria: "pago_devengado", monto: m.devengo, origenTipo: "cierre_dia", origenId: randomUUID(), descripcion: "Devengo SL-17" },
      });
      await prisma.pagoMensajeroMovimiento.create({
        data: { organizacionId, mensajeroId, tipo: "pago", categoria: "liquidacion", monto: m.pagoMensajero, origenTipo: "pago_mensajero", origenId: randomUUID(), descripcion: "Pago SL-17" },
      });
      const zona = await prisma.zona.create({
        data: { organizacionId, nombre: `Zona SL-17 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000017", sinpeNombre: "Titular SL-17" },
        select: { id: true },
      });
      zonas.push(zona.id);
      const cierre = await prisma.cierreDia.create({
        data: {
          organizacionId,
          mensajeroId,
          estado: "aprobado",
          destinoTipo: "bodega_satelite",
          destinoZonaId: zona.id,
          totalEfectivo: m.cierre,
          totalGeneral: m.cierre,
          totalPagoMensajero: m.cierre,
          resueltoPor: p.maestro.usuarioId,
          resueltoAt: new Date(),
        },
        select: { id: true },
      });

      return { p, cobroId: cobro.cobro.id, cargoCobroId: cargo.id, abonoId: abono.abono.id, ajusteId: ajuste.movimiento.id, cierreId: cierre.id };
    });
  }

  /** Lo que la siembra deja fuera de `limpiar459`, y luego las dos empresas. */
  async function limpiar(personas: Personas459[], zonas: string[]): Promise<void> {
    const usuarios = personas.flatMap((p) => p.usuarios);
    try {
      await prisma.liquidacionPago.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.pagoMensajeroMovimiento.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.cierreDia.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.zona.deleteMany({ where: { id: { in: zonas } } });
    } finally {
      for (const p of personas) await limpiar459(prisma, p);
    }
  }

  async function conDosEmpresas(cuerpo: (e: Escenario) => Promise<void>): Promise<void> {
    await conCandado459(prisma, async () => {
      const personas: Personas459[] = [];
      const zonas: string[] = [];
      try {
        const pA = await sembrarPersonas459(prisma);
        personas.push(pA);
        const pB = await sembrarPersonas459(prisma);
        personas.push(pB);
        const b = await sembrarDinero(pB, MONTOS_B, zonas);
        const r0 = await conEmpresa(pB.organizacionId, () => verResumenCajaAction({}, deps(pB.maestro)));
        const a = await sembrarDinero(pA, MONTOS_A, zonas);
        await cuerpo({ a, b, resumenB0: r0 });
      } finally {
        await limpiar(personas, zonas);
      }
    });
  }

  const dinero = (v: Prisma.Decimal | null) => (v === null ? "0.00" : v.toFixed(2));

  /**
   * Todo el dinero de una empresa, leido como dueno. Cuenta tambien por PERSONA y no solo por
   * `organizacion_id`: una fila de B con la tienda de A moveria el saldo de A aunque llevara la
   * empresa de B.
   */
  async function huella(e: Empresa) {
    const org = { organizacionId: e.p.organizacionId };
    const suyos = { in: e.p.usuarios };
    const [caja, tienda, mensajero, tiendaPorPersona, mensajeroPorPersona] = await Promise.all([
      prisma.walletMovimiento.aggregate({ where: org, _count: { _all: true }, _sum: { monto: true } }),
      prisma.walletTiendaMovimiento.aggregate({ where: org, _count: { _all: true }, _sum: { monto: true } }),
      prisma.pagoMensajeroMovimiento.aggregate({ where: org, _count: { _all: true }, _sum: { monto: true } }),
      prisma.walletTiendaMovimiento.groupBy({ by: ["tiendaId", "tipo"], where: { tiendaId: suyos }, _sum: { monto: true }, orderBy: [{ tiendaId: "asc" }, { tipo: "asc" }] }),
      prisma.pagoMensajeroMovimiento.groupBy({ by: ["mensajeroId", "tipo"], where: { mensajeroId: suyos }, _sum: { monto: true }, orderBy: [{ mensajeroId: "asc" }, { tipo: "asc" }] }),
    ]);
    const [abonos, abonosAnulados, cobrosAnulados, ajustesAnulados, pagos, historial, cierres] = await Promise.all([
      prisma.abonoTienda.count({ where: org }),
      prisma.abonoTiendaAnulacion.count({ where: org }),
      prisma.cobroTiendaAnulacion.count({ where: org }),
      prisma.ajusteCajaAnulacion.count({ where: org }),
      prisma.liquidacionPago.count({ where: { OR: [org, { tiendaId: suyos }, { mensajeroId: suyos }] } }),
      prisma.historialAccion.count({ where: org }),
      prisma.cierreDia.findMany({ where: org, select: { id: true, estado: true, updatedAt: true }, orderBy: { id: "asc" } }),
    ]);
    return {
      caja: [caja._count._all, dinero(caja._sum.monto)],
      tienda: [tienda._count._all, dinero(tienda._sum.monto)],
      mensajero: [mensajero._count._all, dinero(mensajero._sum.monto)],
      tiendaPorPersona: tiendaPorPersona.map((g) => [g.tiendaId, g.tipo, dinero(g._sum.monto)]),
      mensajeroPorPersona: mensajeroPorPersona.map((g) => [g.mensajeroId, g.tipo, dinero(g._sum.monto)]),
      abonos,
      abonosAnulados,
      cobrosAnulados,
      ajustesAnulados,
      pagos,
      historial,
      cierres: cierres.map((c) => [c.id, c.estado, c.updatedAt.toISOString()]),
    };
  }

  it("R29 caja principal: el resumen de B no se mueve al sembrar el dinero de A, y su libro trae exactamente sus filas", async () => {
    await conDosEmpresas(async ({ a, b, resumenB0 }) => {
      const r0 = resumenB0 as Awaited<ReturnType<typeof verResumenCajaAction>>;
      if (r0.status !== "ok") throw new Error(`resumen B antes: ${JSON.stringify(r0)}`);
      expect(r0.resumen.entradas).not.toBe("0.00"); // B tiene dinero propio: el «igual» mide algo

      const r1 = await en(b, () => verResumenCajaAction({}, deps(b.p.maestro)));
      expect(r1).toEqual(r0);

      // Control: A si tiene otra caja (con sus importes), y la ve.
      const rA = await en(a, () => verResumenCajaAction({}, deps(a.p.maestro)));
      if (rA.status !== "ok") throw new Error(`resumen A: ${JSON.stringify(rA)}`);
      expect(rA.resumen.entradas).not.toBe(r0.resumen.entradas);

      const filasA = await prisma.walletMovimiento.findMany({ where: { organizacionId: a.p.organizacionId }, select: { id: true } });
      const filasB = await prisma.walletMovimiento.findMany({ where: { organizacionId: b.p.organizacionId }, select: { id: true } });
      expect(filasA.map((f) => f.id)).toEqual(expect.arrayContaining([a.cargoCobroId, a.ajusteId]));
      expect(filasB.map((f) => f.id)).toEqual(expect.arrayContaining([b.cargoCobroId, b.ajusteId]));

      const libro = await en(b, () => listarMovimientosAction({ page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (libro.status !== "ok") throw new Error(`libro B: ${JSON.stringify(libro)}`);
      const idsDelLibro = libro.data.movimientos.map((m) => m.id);
      expect(new Set(idsDelLibro)).toEqual(new Set(filasB.map((f) => f.id)));
      expect(libro.data.total).toBe(filasB.length);
      for (const f of filasA) expect(idsDelLibro).not.toContain(f.id);
    });
  }, 180_000);

  it("R29 tiendas: saldos, desglose y estado de cuenta de B solo traen sus tiendas; una tienda de A no existe para B", async () => {
    await conDosEmpresas(async ({ a, b }) => {
      const saldosB = await en(b, () => listarSaldosTiendasPaginadoAction({ page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (saldosB.status !== "ok") throw new Error(`saldos B: ${JSON.stringify(saldosB)}`);
      const porTienda = new Map(saldosB.items.map((t) => [t.tiendaId, t.saldo]));
      expect(porTienda.get(b.p.tiendaId)).toBe("2750.00"); // 3 000 − 250
      expect(porTienda.get(b.p.otraTiendaId)).toBe("-1400.00"); // −2 000 + 600
      for (const id of porTienda.keys()) expect(b.p.usuarios).toContain(id);
      expect(saldosB.total).toBe(saldosB.items.length);

      const saldosA = await en(a, () => listarSaldosTiendasPaginadoAction({ page: 1, pageSize: 100 }, deps(a.p.maestro)));
      if (saldosA.status !== "ok") throw new Error(`saldos A: ${JSON.stringify(saldosA)}`);
      expect(saldosA.items.find((t) => t.tiendaId === a.p.tiendaId)?.saldo).toBe("71000.00"); // control: A ve lo suyo

      const desgloseDeA = await en(b, () => listarMovimientosDeTiendaAction({ tiendaId: a.p.tiendaId, page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (desgloseDeA.status !== "ok") throw new Error(`desglose de A: ${JSON.stringify(desgloseDeA)}`);
      expect(desgloseDeA.data.movimientos).toEqual([]);
      expect(desgloseDeA.data.total).toBe(0);
      const desgloseDeB = await en(b, () => listarMovimientosDeTiendaAction({ tiendaId: b.p.tiendaId, page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (desgloseDeB.status !== "ok") throw new Error(`desglose de B: ${JSON.stringify(desgloseDeB)}`);
      expect(desgloseDeB.data.total).toBe(2); // el credito sembrado y el cobro

      const cuenta = (id: string) => ({ cuenta: { tipo: "tienda" as const, id }, page: 1, pageSize: 50 });
      expect(await en(b, () => verEstadoCuentaAction(cuenta(a.p.tiendaId), deps(b.p.maestro)))).toEqual({ status: "no_encontrado" });
      const propio = await en(b, () => verEstadoCuentaAction(cuenta(b.p.tiendaId), deps(b.p.maestro)));
      if (propio.status !== "ok") throw new Error(`estado de cuenta B: ${JSON.stringify(propio)}`);
      expect(propio.estado.saldoActual).toBe("2750.00");
    });
  }, 180_000);

  it("R29 mensajeros: la cuenta por pagar, los pagos y el estado de cuenta de B no traen al mensajero de A", async () => {
    await conDosEmpresas(async ({ a, b }) => {
      const cuentasB = await en(b, () => listarCuentasPorPagarPaginadoAction({ page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (cuentasB.status !== "ok") throw new Error(`cuentas B: ${JSON.stringify(cuentasB)}`);
      for (const c of cuentasB.items) expect(b.p.usuarios).toContain(c.mensajeroId);
      expect(cuentasB.items.find((c) => c.mensajeroId === b.p.mensajero.usuarioId)?.cuentaPorPagar).toBe("1000.00"); // 1 500 − 500

      const cuentasA = await en(a, () => listarCuentasPorPagarPaginadoAction({ page: 1, pageSize: 100 }, deps(a.p.maestro)));
      if (cuentasA.status !== "ok") throw new Error(`cuentas A: ${JSON.stringify(cuentasA)}`);
      expect(cuentasA.items.find((c) => c.mensajeroId === a.p.mensajero.usuarioId)?.cuentaPorPagar).toBe("38000.00"); // control

      const pagosDeA = await en(b, () => listarPagosDeMensajeroAction({ mensajeroId: a.p.mensajero.usuarioId, page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (pagosDeA.status !== "ok") throw new Error(`pagos de A: ${JSON.stringify(pagosDeA)}`);
      expect(pagosDeA.data.movimientos).toEqual([]);
      expect(pagosDeA.data.total).toBe(0);
      expect(pagosDeA.data.cuenta.cuentaPorPagar).toBe("0.00");
      const pagosDeB = await en(b, () => listarPagosDeMensajeroAction({ mensajeroId: b.p.mensajero.usuarioId, page: 1, pageSize: 100 }, deps(b.p.maestro)));
      if (pagosDeB.status !== "ok") throw new Error(`pagos de B: ${JSON.stringify(pagosDeB)}`);
      expect(pagosDeB.data.total).toBe(2);
      expect(pagosDeB.data.cuenta.cuentaPorPagar).toBe("1000.00");

      const cuenta = (id: string) => ({ cuenta: { tipo: "mensajero" as const, id }, page: 1, pageSize: 50 });
      expect(await en(b, () => verEstadoCuentaAction(cuenta(a.p.mensajero.usuarioId), deps(b.p.maestro)))).toEqual({ status: "no_encontrado" });
      const propio = await en(b, () => verEstadoCuentaAction(cuenta(b.p.mensajero.usuarioId), deps(b.p.maestro)));
      expect(propio.status).toBe("ok");
    });
  }, 180_000);

  it("R29/R37 escrituras de B con una tienda, un mensajero o un cierre de A: se rechazan sin escribir y el dinero de A no cambia", async () => {
    await conDosEmpresas(async ({ a, b }) => {
      const antesA = await huella(a);
      const antesB = await huella(b);
      const maestroB = deps(b.p.maestro);

      const cobro = await en(b, () =>
        registrarCobroTiendaAction({ claveIdempotencia: randomUUID(), tiendaId: a.p.tiendaId, monto: "10.00", descripcion: "Cruzado" }, maestroB),
      );
      expect(cobro.status).toBe("validation_error");
      if (cobro.status === "validation_error") expect(Object.keys(cobro.fieldErrors)).toEqual(["tiendaId"]);

      const abono = await en(b, () =>
        registrarAbonoTiendaAction(
          formData459({ claveIdempotencia: randomUUID(), tiendaId: a.p.otraTiendaId, monto: "10.00", metodo: "SINPE", referencia: "170017", motivo: "Cruzado", fechaPago: hoy() }),
          maestroB,
        ),
      );
      expect(abono.status).toBe("validation_error");
      if (abono.status === "validation_error") expect(Object.keys(abono.fieldErrors)).toEqual(["tiendaId"]);

      // La tienda de A tiene 71 000 a favor; B no ve ni un colon de ellos.
      const pagoTienda = await en(b, () =>
        registrarPagoTiendaAction({ claveIdempotencia: randomUUID(), tiendaId: a.p.tiendaId, monto: "10.00", metodo: "efectivo", fechaPago: hoy() }, maestroB),
      );
      expect(pagoTienda).toEqual({ status: "sin_saldo" });

      const pagoMensajero = await en(b, () =>
        registrarPagoMensajeroAction({ claveIdempotencia: randomUUID(), cierreId: a.cierreId, monto: "10.00", metodo: "efectivo", fechaPago: hoy() }, maestroB),
      );
      expect(pagoMensajero).toEqual({ status: "no_encontrado" });

      // R37: el repositorio real escribe SIN lectura previa; la base rechaza la tienda de A (SL017).
      const cliente = getPrismaClient();
      const repo = new WalletTiendaMovimientoRepository(cliente);
      await expect(
        en(b, () =>
          cliente.$transaction((tx) =>
            repo.crearMovimientos(tx, [
              { tiendaId: a.p.tiendaId, tipo: "credito", categoria: "ajuste_credito", monto: "10.00", origenTipo: "manual", origenId: null, descripcion: "Cruzado SL-17", registradoPor: b.p.maestro.usuarioId },
            ]),
          ),
        ),
      ).rejects.toBeInstanceOf(EmpresaCruzada);

      expect(await huella(a)).toEqual(antesA);
      expect(await huella(b)).toEqual(antesB);
    });
  }, 180_000);

  it("R29 anular por id un movimiento o un documento de A desde B: «no encontrado» y A intacta; B si anula lo suyo", async () => {
    await conDosEmpresas(async ({ a, b }) => {
      const antesA = await huella(a);
      const antesB = await huella(b);
      const maestroB = deps(b.p.maestro);
      const motivo = "Cruzado SL-17";

      expect(await en(b, () => anularCobroTiendaAction({ cobroId: a.cobroId, motivo }, maestroB))).toEqual({ status: "no_encontrado" });
      expect(await en(b, () => anularAbonoTiendaAction({ abonoId: a.abonoId, motivo }, maestroB))).toEqual({ status: "no_encontrado" });
      expect(await en(b, () => anularAjusteCajaAction({ movimientoId: a.ajusteId, motivo }, maestroB))).toEqual({ status: "no_encontrado" });
      // La accion unica de «Anular…» del panel «Ver», por los tres tipos de destino.
      for (const destino of [
        { libro: "caja" as const, movimientoId: a.cargoCobroId },
        { libro: "tienda" as const, movimientoId: a.cobroId },
        { documento: "abono_tienda" as const, id: a.abonoId },
      ]) {
        expect(await en(b, () => anularMovimientoAction({ destino, motivo }, maestroB))).toEqual({ status: "no_encontrado" });
      }

      expect(await huella(a)).toEqual(antesA);
      expect(await huella(b)).toEqual(antesB);

      // Control: la misma action, en B, sobre lo de B, si anula (el «no encontrado» no es tuberia rota).
      expect(await en(b, () => anularCobroTiendaAction({ cobroId: b.cobroId, motivo }, maestroB))).toMatchObject({ status: "ok" });
      expect(await prisma.cobroTiendaAnulacion.count({ where: { cobroId: b.cobroId } })).toBe(1);
      expect(await huella(a)).toEqual(antesA);
    });
  }, 180_000);
});
