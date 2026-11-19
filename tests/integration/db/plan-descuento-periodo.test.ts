import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PrecioPlan, VersionPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignar, crearEmpresa, crearOrden, crearPlanConCosto, movimientos } from "./_fixtures/cobro-porcentual";
import { capturar, entradaAsignable, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-86 · T9 (design §1.1, §5.4; R10, R11, R13, R14, R31, R32) — los descuentos por período de un plan
// contra Postgres, con `PlanesService` y `PlanesRepository` REALES: los CHECK de la tabla, que crear y
// editar guardan exactamente los descuentos del precio con su rastro, que «sin precio» deja el plan sin
// descuentos, que ni un descuento ni el tipo de cobro tocan el cargo de una orden ni la wallet, y que
// `servi_app` no ve la tabla. Todo en una transacción que se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
const HOY = fechaCalendarioCR(new Date());

const CON_DESCUENTOS: PrecioPlan = {
  tipo: "monto",
  mensual: "50000",
  descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" }, bimestral: { tipo: "monto", monto: "5000" } },
};

let base: PrismaClient;

async function descuentos(tx: TxDeTest, planId: string) {
  return tx.$queryRawUnsafe<{ periodo: string; porcentaje: string | null; monto: string | null }[]>(
    `SELECT "periodo", "porcentaje"::text AS porcentaje, "monto"::text AS monto
       FROM "plan_descuento_periodo" WHERE "plan_id" = $1 ORDER BY "periodo"`,
    planId,
  );
}

async function rastro(tx: TxDeTest, planId: string) {
  return tx.planRastro.findMany({ where: { planId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { accion: true, cambios: true } });
}

/**
 * SLT-135: editar ya no aplica en el acto, programa. Un plan sin empresas lo promueve la pasada de la cola en F
 * (`aplicarCambioProgramado`); aquí, con el reloj de ahora, que ya pasó las 00:00 de hoy.
 */
async function aplicarPendiente(tx: TxDeTest, planId: string, ahora: Date = new Date()) {
  const { id } = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId }, select: { id: true } });
  return planesEnTx(tx).aplicarCambioProgramado({ planId, cambioId: id }, ahora);
}

/** Una empresa con `planId`, de tipo `tipo` y entrada el 1 de enero de 2026 (a mano: solo prepara datos). */
async function conPlan(tx: TxDeTest, planId: string, tipo: string): Promise<string> {
  const { id } = await crearOrganizacion(tx);
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_tipo_cobro" = $2, "plan_ciclo_ancla_at" = '2026-01-01 06:00:00' WHERE "id" = $3`,
    planId,
    tipo,
    id,
  );
  return id;
}

function version(precio: PrecioPlan, extra: Partial<VersionPlan> = {}) {
  const e = entradaAsignable();
  return { nombre: "Plan descuentos", topes: e.topes, modulos: e.modulos, precio, costoPorOrden: e.costoPorOrden, costoPorOrdenPorcentual: null, ...extra };
}

describeSiHayBase("SLT-86 — descuentos por período de un plan (R10, R11, R13, R14, R31, R32)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R10: la base rechaza con 23514 (o 22003 si no cabe) un descuento mal formado escrito a mano", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await planesEnTx(tx).crear(entradaAsignable(), SUPERADMIN.usuarioId);
      const insertar = (periodo: string, porcentaje: string | null, monto: string | null) =>
        capturar(tx, () =>
          tx.$executeRawUnsafe(
            `INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje", "monto") VALUES ($1, $2, $3::numeric, $4::numeric)`,
            planId,
            periodo,
            porcentaje,
            monto,
          ),
        );
      return {
        porcentajeCero: sqlstateDe(await insertar("anual", "0", null)),
        porcentajeMasDe100: sqlstateDe(await insertar("anual", "100.01", null)),
        montoNegativo: sqlstateDe(await insertar("anual", null, "-0.01")),
        lasDosFormas: sqlstateDe(await insertar("anual", "10", "100")),
        ninguna: sqlstateDe(await insertar("anual", null, null)),
        otroPeriodo: sqlstateDe(await insertar("semanal", "10", null)),
        noCabe: sqlstateDe(await insertar("anual", null, "10000000000.00")),
        bordes: [await insertar("quincenal", "100", null), await insertar("mensual", "0.01", null), await insertar("bimestral", null, "0")],
      };
    });
    expect(r).toEqual({
      porcentajeCero: "23514",
      porcentajeMasDe100: "23514",
      montoNegativo: "23514",
      lasDosFormas: "23514",
      ninguna: "23514",
      otroPeriodo: "23514",
      noCabe: "22003",
      bordes: [null, null, null],
    });
  });

  it("R10, R31: crear guarda exactamente sus descuentos y el rastro de alta trae las cuatro claves", async () => {
    const r = await revertida(base, async (tx) => {
      const res = await new PlanesService(planesEnTx(tx)).crear(SUPERADMIN, entradaAsignable({ precio: CON_DESCUENTOS }));
      if (res.estado !== "ok") throw new Error(res.estado);
      return { descuentos: await descuentos(tx, res.planId), rastro: await rastro(tx, res.planId), dto: await planesEnTx(tx).plan(res.planId) };
    });
    expect(r.descuentos).toEqual([
      { periodo: "anual", porcentaje: "10.00", monto: null },
      { periodo: "bimestral", porcentaje: null, monto: "5000.00" },
    ]);
    expect(r.dto?.precio).toEqual({
      tipo: "monto",
      mensual: "50000.00",
      descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" }, bimestral: { tipo: "monto", monto: "5000.00" } },
    });
    expect(r.rastro).toHaveLength(1);
    expect(r.rastro[0].cambios).toMatchObject({
      descuento_quincenal: { antes: null, despues: null },
      descuento_mensual: { antes: null, despues: null },
      descuento_bimestral: { antes: null, despues: { tipo: "monto", monto: "5000.00" } },
      descuento_anual: { antes: null, despues: { tipo: "porcentaje", porcentaje: "10.00" } },
    });
  });

  it("R10, R31: editar un descuento lo reemplaza y deja su antes y su después; una edición igual («10» = «10.00») no escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const creado = await servicio.crear(SUPERADMIN, entradaAsignable({ nombre: "Plan descuentos", precio: CON_DESCUENTOS }));
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const planId = creado.planId;
      const nuevo: PrecioPlan = { tipo: "monto", mensual: "50000", descuentos: { anual: { tipo: "monto", monto: "60000" }, quincenal: { tipo: "porcentaje", porcentaje: "5" } } };
      const editado = await servicio.editar(SUPERADMIN, { planId, ...version(nuevo), vigenteDesde: HOY });
      // SLT-135: con F = hoy y sin empresas, lo promueve la siguiente pasada de la cola.
      const aplicado = await aplicarPendiente(tx, planId);
      const trasEditar = await descuentos(tx, planId);
      const igual = await servicio.editar(SUPERADMIN, {
        planId,
        ...version({ tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "monto", monto: "60000.00" }, quincenal: { tipo: "porcentaje", porcentaje: "5.00" } } }),
        vigenteDesde: HOY,
      });
      return { editado, aplicado, trasEditar, igual, rastro: await rastro(tx, planId) };
    });
    expect(r.editado).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: HOY });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.trasEditar).toEqual([
      { periodo: "anual", porcentaje: null, monto: "60000.00" },
      { periodo: "quincenal", porcentaje: "5.00", monto: null },
    ]);
    // SLT-135: el antes y el después de los descuentos quedan en la fila `cambio_aplicado` (sin edición inmediata).
    expect(r.rastro.map((f) => f.accion)).toEqual(["creado", "cambio_programado", "cambio_aplicado"]);
    expect(r.rastro[2].cambios).toEqual({
      descuento_quincenal: { antes: null, despues: { tipo: "porcentaje", porcentaje: "5.00" } },
      descuento_bimestral: { antes: { tipo: "monto", monto: "5000.00" }, despues: null },
      descuento_anual: { antes: { tipo: "porcentaje", porcentaje: "10.00" }, despues: { tipo: "monto", monto: "60000.00" } },
    });
    expect(r.igual).toMatchObject({ estado: "ok", cambio: false });
  });

  it("R11: «sin precio» con descuentos es validation_error en precio; pasar a «sin precio» deja el plan sin descuentos", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const conDescuentoSinPrecio = await servicio.crear(SUPERADMIN, entradaAsignable({ precio: { tipo: "sin_precio", descuentos: {} } as never }));
      const creado = await servicio.crear(SUPERADMIN, entradaAsignable({ nombre: "Plan descuentos", precio: CON_DESCUENTOS }));
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const aSinPrecio = await servicio.editar(SUPERADMIN, { planId: creado.planId, ...version({ tipo: "sin_precio" }), vigenteDesde: HOY });
      const aplicado = await aplicarPendiente(tx, creado.planId);
      return { conDescuentoSinPrecio, aSinPrecio, aplicado, descuentos: await descuentos(tx, creado.planId) };
    });
    expect(r.conDescuentoSinPrecio).toMatchObject({ estado: "validation_error", fieldErrors: { precio: expect.any(Array) } });
    expect(r.aSinPrecio).toMatchObject({ estado: "ok", cambio: true });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.descuentos).toEqual([]);
  });

  // SLT-135 (R6): guardado el 16 de noviembre a las 15:00 con F = 16. La quincenal empieza período hoy: lo recibe
  // con las 00:00 del 16 y el descuento rige desde ahí en el historial. La mensual, el 1 de diciembre; hasta que la
  // última lo recibe, los descuentos del plan no cambian.
  it("R6: un descuento con F hoy se programa", async () => {
    const r = await revertida(base, async (tx) => {
      const creado = await new PlanesService(planesEnTx(tx)).crear(SUPERADMIN, entradaAsignable({ nombre: "Plan descuentos", precio: CON_DESCUENTOS }));
      if (creado.estado !== "ok") throw new Error(creado.estado);
      const planId = creado.planId;
      const quincenal = await conPlan(tx, planId, "quincenal");
      const mensual = await conPlan(tx, planId, "mensual");
      const guardado = new Date("2026-11-16T21:00:00.000Z");
      const nuevo: PrecioPlan = { tipo: "monto", mensual: "50000", descuentos: { mensual: { tipo: "porcentaje", porcentaje: "5" } } };
      const res = await new PlanesService(planesEnTx(tx), () => guardado).editar(SUPERADMIN, { planId, ...version(nuevo), vigenteDesde: "2026-11-16" });
      const trasGuardar = await descuentos(tx, planId);
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({
        where: { planId },
        select: { id: true, vigenteDesde: true, recepciones: { orderBy: { recibeAt: "asc" }, select: { empresaId: true, recibeAt: true } } },
      });
      const historialDescuentos = () =>
        tx.$queryRawUnsafe<{ desde: string; descuentos: unknown }[]>(
          `SELECT "desde_at"::text AS desde, "descuentos" FROM "plan_precio_historial" WHERE "plan_id" = $1 ORDER BY "desde_at"`,
          planId,
        );
      const repo = planesEnTx(tx);
      const cambio = { planId, cambioId: pendiente.id };
      const recibeQuincenal = await repo.recibirCambio(cambio, quincenal, new Date("2026-11-16T21:01:00.000Z"));
      const trasQuincenal = { descuentos: await descuentos(tx, planId), historial: await historialDescuentos() };
      const recibeMensual = await repo.recibirCambio(cambio, mensual, new Date("2026-12-01T06:01:00.000Z"));
      return { res, trasGuardar, pendiente, quincenal, mensual, recibeQuincenal, trasQuincenal, recibeMensual, final: await descuentos(tx, planId) };
    });
    expect(r.res).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2026-11-16" });
    // Al guardar no cambia nada: queda programado con las 00:00 de hoy.
    expect(r.trasGuardar).toEqual([
      { periodo: "anual", porcentaje: "10.00", monto: null },
      { periodo: "bimestral", porcentaje: null, monto: "5000.00" },
    ]);
    expect(r.pendiente.vigenteDesde).toEqual(new Date("2026-11-16T06:00:00.000Z"));
    expect(r.pendiente.recepciones).toEqual([
      { empresaId: r.quincenal, recibeAt: new Date("2026-11-16T06:00:00.000Z") },
      { empresaId: r.mensual, recibeAt: new Date("2026-12-01T06:00:00.000Z") },
    ]);
    expect([r.recibeQuincenal, r.recibeMensual]).toEqual([{ estado: "aplicado" }, { estado: "aplicado" }]);
    // La quincenal lo recibe: el descuento rige desde las 00:00 del 16 en el historial; el plan sigue igual.
    expect(r.trasQuincenal.historial).toEqual([
      { desde: "-infinity", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" }, bimestral: { tipo: "monto", monto: "5000.00" } } },
      { desde: "2026-11-16 06:00:00", descuentos: { mensual: { tipo: "porcentaje", porcentaje: "5.00" } } },
    ]);
    expect(r.trasQuincenal.descuentos).toEqual(r.trasGuardar);
    // La última recepción promueve el plan.
    expect(r.final).toEqual([{ periodo: "mensual", porcentaje: "5.00", monto: null }]);
  });

  it("R13: ni un descuento de período ni el tipo de cobro cambian el cargo de una orden", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      const plan = await crearPlanConCosto(tx, { fijo: "100" });
      await asignar(tx, e, plan);
      const sinDescuento = await crearOrden(tx, e, { montoCobrar: "50000" });
      await tx.$executeRawUnsafe(
        `INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje", "monto")
         VALUES ($1, 'quincenal', 50, NULL), ($1, 'mensual', NULL, 99999), ($1, 'bimestral', 100, NULL), ($1, 'anual', 20, NULL)`,
        plan,
      );
      const porTipo: Record<string, unknown> = {};
      for (const tipo of ["quincenal", "mensual", "bimestral", "anual"]) {
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_tipo_cobro" = $2 WHERE "id" = $1`, e.id, tipo);
        porTipo[tipo] = (await movimientos(tx, await crearOrden(tx, e, { montoCobrar: "50000" }))).map((m) => [m.tipo, m.fuente, m.monto]);
      }
      return { sinDescuento: (await movimientos(tx, sinDescuento)).map((m) => [m.tipo, m.fuente, m.monto]), porTipo };
    });
    const cargo = [["cargo", "plan", "100.00"]];
    expect(r.sinDescuento).toEqual(cargo);
    expect(r.porTipo).toEqual({ quincenal: cargo, mensual: cargo, bimestral: cargo, anual: cargo });
  });

  it("R14: crear un plan con descuentos, asignarlo y editar sus descuentos no escribe en wallet_movimiento ni en cobro_plataforma_movimiento", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      // Por empresa y no el total de la tabla: otros archivos que corren a la vez pueden confirmar filas.
      const contar = async () => ({
        wallet: await tx.walletMovimiento.count({ where: { organizacionId: e.id } }),
        cobro: await tx.cobroPlataformaMovimiento.count({ where: { organizacionId: e.id } }),
      });
      const antes = await contar();
      const servicio = new PlanesService(planesEnTx(tx));
      const creado = await servicio.crear(SUPERADMIN, entradaAsignable({ nombre: "Plan descuentos", precio: CON_DESCUENTOS }));
      if (creado.estado !== "ok") throw new Error(creado.estado);
      await servicio.asignar(SUPERADMIN, { organizacionId: e.id, planId: creado.planId, tipoCobro: "anual", inicioCiclo: HOY });
      await servicio.editar(SUPERADMIN, {
        planId: creado.planId,
        ...version({ tipo: "monto", mensual: "40000", descuentos: { mensual: { tipo: "monto", monto: "1000" } } }),
        vigenteDesde: HOY,
      });
      return { antes, despues: await contar() };
    });
    expect(r.despues).toEqual(r.antes);
  });

  it("R32: servi_app no lee ni escribe los descuentos ni el historial de precio (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      const planId = await planesEnTx(tx).crear(entradaAsignable({ precio: CON_DESCUENTOS }), SUPERADMIN.usuarioId);
      await comoApp(tx, e.id);
      const intento = async (sql: string) => sqlstateDe(await capturar(tx, () => tx.$executeRawUnsafe(sql, planId)));
      return {
        leerDescuentos: await intento(`SELECT * FROM "plan_descuento_periodo" WHERE "plan_id" = $1`),
        escribirDescuento: await intento(`INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje") VALUES ($1, 'mensual', 10)`),
        leerHistorial: await intento(`SELECT * FROM "plan_precio_historial" WHERE "plan_id" = $1`),
        escribirHistorial: await intento(`DELETE FROM "plan_precio_historial" WHERE "plan_id" = $1`),
      };
    });
    expect(r).toEqual({ leerDescuentos: "42501", escribirDescuento: "42501", leerHistorial: "42501", escribirHistorial: "42501" });
  });
});
