import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PrecioPlan, TipoCobro, VersionPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-86 · T9 (design §1.2, §5.4; R15, R22) — el historial de precio de un plan contra Postgres, con
// `PlanesService` y `PlanesRepository` REALES. Todo en una transacción que se revierte.
//
// R15: el costo de un período o tramo usa el precio vigente cuando ESE período empieza: la fila del
// historial con el mayor `desde_at` que no pase de su inicio. Dos formas de medirlo:
//   · por `plan_de_la_empresa`, que lee la empresa con el reloj real de la base (el «hoy» del caso);
//   · con fechas fijas (el ejemplo de R15: precio con fecha el 5, la quincenal lo ve desde el 16 y la anual
//     desde el 1 de enero), evaluando la misma regla que `plan_de_la_empresa` — `desde_at <=
//     plan_inicio_ciclo_de(entrada, tipo, ahora)` — porque dentro de la transacción `now()` no se mueve.
// `desde_at` se lee como texto: la fila de alta es `-infinity`, que no cabe en un `Date`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const HOY = fechaCalendarioCR(new Date());
const dia = (dias: number) => fechaCalendarioCR(new Date(Date.now() + dias * UN_DIA_MS));
const a0000 = (fecha: string) => `${fecha} 06:00:00`;

const P31: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: {} };
const P35: PrecioPlan = { tipo: "monto", mensual: "35000.00", descuentos: {} };

let base: PrismaClient;

interface FilaHistorial {
  desde: string;
  mensual: string | null;
  descuentos: unknown;
}

async function historial(tx: TxDeTest, planId: string): Promise<FilaHistorial[]> {
  return tx.$queryRawUnsafe<FilaHistorial[]>(
    `SELECT "desde_at"::text AS desde, "precio_mensual"::text AS mensual, "descuentos"
       FROM "plan_precio_historial" WHERE "plan_id" = $1 ORDER BY "desde_at"`,
    planId,
  );
}

/** La regla de `plan_de_la_empresa` (§1.2) con un «ahora» fijo: el mensual que rige al empezar ese período. */
async function precioEn(tx: TxDeTest, planId: string, entrada: string, tipo: TipoCobro, ahora: string): Promise<string | null> {
  const [fila] = await tx.$queryRawUnsafe<{ mensual: string | null }[]>(
    `SELECT h."precio_mensual"::text AS mensual FROM "plan_precio_historial" h
      WHERE h."plan_id" = $1 AND h."desde_at" <= plan_inicio_ciclo_de($2::timestamp, $3, $4::timestamp)
      ORDER BY h."desde_at" DESC LIMIT 1`,
    planId,
    entrada,
    tipo,
    ahora,
  );
  return fila?.mensual ?? null;
}

/** El precio del período en curso que lee la empresa (como lo pinta «Mi plan»). */
async function precioDelPeriodo(tx: TxDeTest, organizacionId: string): Promise<unknown> {
  await fijarEmpresa(tx, organizacionId);
  const [f] = await tx.$queryRawUnsafe<{ p: unknown }[]>(`SELECT plan_de_la_empresa($1)->'precio_del_periodo' AS p`, organizacionId);
  await fijarEmpresa(tx, "");
  return typeof f.p === "string" ? JSON.parse(f.p) : f.p;
}

async function conPlan(tx: TxDeTest, planId: string, tipo: TipoCobro, entrada: string): Promise<string> {
  const { id } = await crearOrganizacion(tx);
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_tipo_cobro" = $2, "plan_ciclo_ancla_at" = $3::timestamp WHERE "id" = $4`,
    planId,
    tipo,
    entrada,
    id,
  );
  return id;
}

async function empresa(tx: TxDeTest, id: string) {
  return tx.organizacion.findUniqueOrThrow({ where: { id }, select: { planId: true, planTipoCobro: true, planCicloAnclaAt: true } });
}

function version(precio: PrecioPlan, extra: Partial<VersionPlan> = {}) {
  const e = entradaAsignable();
  return {
    nombre: "Plan historial",
    topes: e.topes,
    modulos: e.modulos,
    precio,
    costoPorOrden: e.costoPorOrden,
    costoPorOrdenPorcentual: null,
    ...extra,
  };
}

async function crearPlan(servicio: PlanesService, precio: PrecioPlan = P31): Promise<string> {
  const r = await servicio.crear(SUPERADMIN, entradaAsignable({ nombre: "Plan historial", precio }));
  if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
  return r.planId;
}

describeSiHayBase("SLT-86 — el historial de precio de un plan (R15, R22)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("crear siembra la fila «desde siempre» (-infinity) con el precio de alta y sus descuentos con dos decimales", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const planId = await crearPlan(servicio, { tipo: "monto", mensual: "31000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } });
      return historial(tx, planId);
    });
    expect(r).toEqual([{ desde: "-infinity", mensual: "31000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } }]);
  });

  it("R15 (caso base): precio con fecha el 5 → la quincenal lo ve desde el 16 y la anual desde el 1 de enero; nadie se reancla", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlan(new PlanesService(planesEnTx(tx)));
      const quincenal = await conPlan(tx, planId, "quincenal", "2026-01-01 06:00:00");
      const anual = await conPlan(tx, planId, "anual", "2025-01-01 06:00:00");
      const antes = [await empresa(tx, quincenal), await empresa(tx, anual)];
      const editado = await planesEnTx(tx).editar(planId, version(P35), SUPERADMIN.usuarioId, new Date("2026-11-05T06:00:00.000Z"));
      const q = (ahora: string) => precioEn(tx, planId, "2026-01-01 06:00:00", "quincenal", ahora);
      const a = (ahora: string) => precioEn(tx, planId, "2025-01-01 06:00:00", "anual", ahora);
      return {
        editado,
        antes,
        despues: [await empresa(tx, quincenal), await empresa(tx, anual)],
        filas: await historial(tx, planId),
        quincenal: [await q("2026-11-10 12:00:00"), await q("2026-11-16 05:59:59.999"), await q("2026-11-16 06:00:00"), await q("2026-11-20 12:00:00")],
        anual: [await a("2026-11-10 12:00:00"), await a("2026-12-31 12:00:00"), await a("2027-01-01 06:00:00")],
      };
    });
    expect(r.editado).toMatchObject({ estado: "ok", cambio: true });
    expect(r.filas.map((f) => [f.desde, f.mensual])).toEqual([
      ["-infinity", "31000.00"],
      ["2026-11-05 06:00:00", "35000.00"],
    ]);
    // La quincena del 1 al 15 empezó antes del 5: precio viejo. La del 16 empieza después: el nuevo, desde
    // sus 00:00 exactas (06:00 UTC), no un milisegundo antes.
    expect(r.quincenal).toEqual(["31000.00", "31000.00", "35000.00", "35000.00"]);
    // El año empezó el 1 de enero de 2026: precio viejo todo el año; el nuevo, desde el 1 de enero de 2027.
    expect(r.anual).toEqual(["31000.00", "31000.00", "35000.00"]);
    // R15: editar el precio no toca la entrada, el tipo ni el período de ninguna empresa.
    expect(r.despues).toEqual(r.antes);
  });

  it("R15: un período que empieza exactamente a las 00:00 de la fecha de efecto ya usa el precio nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlan(new PlanesService(planesEnTx(tx)));
      await planesEnTx(tx).editar(planId, version(P35), SUPERADMIN.usuarioId, new Date("2026-11-16T06:00:00.000Z"));
      return {
        quincena: await precioEn(tx, planId, "2026-01-01 06:00:00", "quincenal", "2026-11-16 06:00:00"),
        tramo: await precioEn(tx, planId, "2026-11-16 06:00:00", "anual", "2026-11-20 12:00:00"),
        tramoAntes: await precioEn(tx, planId, "2026-11-15 06:00:00", "anual", "2026-11-20 12:00:00"),
      };
    });
    // La quincena del 16 y el tramo anual que entra el 16 empiezan en F: rige el nuevo; el que entró el 15, no.
    expect(r).toEqual({ quincena: "35000.00", tramo: "35000.00", tramoAntes: "31000.00" });
  });

  it("R15, R22: con la fecha de hoy se aplica en el acto; lo ve el período que empieza hoy y no el que empezó antes", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const planId = await crearPlan(servicio);
      // La quincenal entra hoy (tramo desde las 00:00 de hoy); la anual, hace más de un año.
      const quincenal = await conPlan(tx, planId, "quincenal", a0000(HOY));
      const anual = await conPlan(tx, planId, "anual", "2025-01-01 06:00:00");
      const antes = [await empresa(tx, quincenal), await empresa(tx, anual)];
      const res = await servicio.editar(SUPERADMIN, { planId, ...version(P35), vigenteDesde: HOY });
      return {
        res,
        antes,
        despues: [await empresa(tx, quincenal), await empresa(tx, anual)],
        filas: await historial(tx, planId),
        vigente: (await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { precioMensual: true } })).precioMensual?.toFixed(2),
        quincenal: await precioDelPeriodo(tx, quincenal),
        anual: await precioDelPeriodo(tx, anual),
      };
    });
    expect(r.res).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: null });
    expect(r.vigente).toBe("35000.00");
    expect(r.filas.map((f) => [f.desde, f.mensual])).toEqual([
      ["-infinity", "31000.00"],
      [a0000(HOY), "35000.00"],
    ]);
    expect(r.quincenal).toEqual({ precio_mensual: "35000.00", descuentos: {} });
    // El año en curso empezó el 1 de enero: si hoy es justo esa fecha, también empieza en F.
    const anualEmpiezaHoy = HOY.endsWith("-01-01");
    expect(r.anual).toEqual({ precio_mensual: anualEmpiezaHoy ? "35000.00" : "31000.00", descuentos: {} });
    expect(r.despues).toEqual(r.antes);
  });

  it("R15, R22: con fecha futura queda programado sin fila; el trabajo, al aplicarlo, añade la fila desde esa fecha", async () => {
    const futura = dia(3);
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const planId = await crearPlan(servicio);
      const res = await servicio.editar(SUPERADMIN, { planId, ...version(P35), vigenteDesde: futura });
      const trasProgramar = await historial(tx, planId);
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId }, select: { id: true } });
      const desde = inicioDelDiaPlataforma(futura);
      const aplicado = await planesEnTx(tx).aplicarCambioProgramado(
        { planId, cambioId: pendiente.id },
        new Date(desde.getTime() + 60_000),
      );
      return { res, trasProgramar, aplicado, filas: await historial(tx, planId) };
    });
    expect(r.res).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: futura });
    expect(r.trasProgramar.map((f) => f.desde)).toEqual(["-infinity"]);
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.filas.map((f) => [f.desde, f.mensual])).toEqual([
      ["-infinity", "31000.00"],
      [a0000(futura), "35000.00"],
    ]);
  });

  it("R15: un cambio de precio programado y cancelado no deja fila", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const planId = await crearPlan(servicio);
      await servicio.editar(SUPERADMIN, { planId, ...version(P35), vigenteDesde: dia(5) });
      const cancelado = await servicio.cancelarCambio(SUPERADMIN, { planId });
      return { cancelado, filas: await historial(tx, planId) };
    });
    expect(r.cancelado).toMatchObject({ estado: "ok" });
    expect(r.filas.map((f) => [f.desde, f.mensual])).toEqual([["-infinity", "31000.00"]]);
  });

  it("dos ediciones del mismo día dejan la última; una edición sin cambio de precio no añade fila; la última fila coincide con el precio vigente", async () => {
    const r = await revertida(base, async (tx) => {
      const repo = planesEnTx(tx);
      const planId = await crearPlan(new PlanesService(repo));
      const hoy = inicioDelDiaPlataforma(HOY);
      await repo.editar(planId, version(P35), SUPERADMIN.usuarioId, hoy);
      const conDescuento: PrecioPlan = { tipo: "monto", mensual: "36000", descuentos: { bimestral: { tipo: "monto", monto: "500" } } };
      await repo.editar(planId, version(conDescuento), SUPERADMIN.usuarioId, hoy);
      const trasDos = await historial(tx, planId);
      await repo.editar(planId, version(conDescuento, { nombre: "Solo el nombre" }), SUPERADMIN.usuarioId, hoy);
      const vigente = await repo.plan(planId);
      return { trasDos, final: await historial(tx, planId), vigente };
    });
    expect(r.trasDos).toEqual([
      { desde: "-infinity", mensual: "31000.00", descuentos: {} },
      { desde: a0000(HOY), mensual: "36000.00", descuentos: { bimestral: { tipo: "monto", monto: "500.00" } } },
    ]);
    expect(r.final).toEqual(r.trasDos);
    // Coherencia (§1.2): la última fila con `desde_at ≤ now()` es el precio vigente del plan.
    const ultima = r.final.at(-1) as FilaHistorial;
    expect(r.vigente?.precio).toEqual({ tipo: "monto", mensual: ultima.mensual, descuentos: ultima.descuentos });
  });

  it("R22: cambiar el precio sin fecha o con una pasada es validation_error en vigenteDesde y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const planId = await crearPlan(servicio);
      const sinFecha = await servicio.editar(SUPERADMIN, { planId, ...version(P35), vigenteDesde: null });
      const ayer = await servicio.editar(SUPERADMIN, { planId, ...version(P35), vigenteDesde: dia(-1) });
      return {
        sinFecha,
        ayer,
        filas: await historial(tx, planId),
        vigente: (await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { precioMensual: true } })).precioMensual?.toFixed(2),
        pendientes: await tx.planCambioProgramado.count({ where: { planId } }),
      };
    });
    for (const x of [r.sinFecha, r.ayer]) {
      expect(x.estado).toBe("validation_error");
      if (x.estado === "validation_error") expect(Object.keys(x.fieldErrors)).toEqual(["vigenteDesde"]);
    }
    expect(r.filas.map((f) => f.desde)).toEqual(["-infinity"]);
    expect(r.vigente).toBe("31000.00");
    expect(r.pendientes).toBe(0);
  });
});
