import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import {
  anular,
  asignar,
  cambiarEstado,
  cambiarMonto,
  cargo,
  condicionDe,
  crearEmpresa,
  crearOrden,
  crearOrdenes,
  crearPlanConCosto,
  deuda,
  fijarCostoDelPlan,
  movimientos,
  reverso,
  type EmpresaPorcentual,
  type EstadoDeOrden,
} from "./_fixtures/cobro-porcentual";
import { revertida } from "./_fixtures/planes";

// SLT-83 (design §3, §9.1; R6–R8, R10–R16, R18) — el cobro porcentual de una orden, contra Postgres.
//
// Recorre el ejemplo numérico de design §3.5 fila a fila (movimientos de TODAS las órdenes y deuda de A
// tras cada paso), y luego un caso por requisito. Todo como dueño, por SQL a mano sobre `orden`, en una
// transacción que se revierte: quien escribe condiciones y movimientos es el trigger.
//
// El valor global (una sola fila para toda la base) se fija a 500,00 bajo el lock de
// `_fixtures/cobro-plataforma-40`, que lo deja como estaba en el `afterAll`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const GLOBAL = "500.00";
const FINALES: readonly EstadoDeOrden[] = ["entregado", "devuelta_a_tienda", "incidente"];

let base: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

/** A con un plan porcentual (2 %, mínimo 500, salvo que se pida otro). */
async function empresaPorcentual(tx: TxDeTest, pct = "2", minimo: string | null = "500"): Promise<{ e: EmpresaPorcentual; plan: string }> {
  const e = await crearEmpresa(tx);
  const plan = await crearPlanConCosto(tx, { pct, minimo });
  await asignar(tx, e, plan);
  return { e, plan };
}

/** Corre `fn` en un SAVEPOINT y lo deshace: lo que deje su operación no debe sobrevivir (R16). */
async function yDeshacer(tx: TxDeTest, fn: () => Promise<unknown>): Promise<void> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  await fn();
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
}

/**
 * R15: cargo vigente ⇔ la orden no está anulada y está en un estado final; la deuda de la orden es 0 o
 * el importe de su último cargo; y los movimientos alternan cargo, reverso, cargo…
 */
async function invariante(tx: TxDeTest, ordenId: string): Promise<{ ok: boolean; detalle: unknown }> {
  const [o] = await tx.$queryRawUnsafe<{ debe: boolean }[]>(
    `SELECT (o."deleted_at" IS NULL AND orden_estado_es_final(o."estatus_id")) AS debe FROM "orden" o WHERE o."id" = $1`,
    ordenId,
  );
  const m = await movimientos(tx, ordenId);
  const ultimo = m.at(-1);
  const tiene = ultimo?.tipo === "cargo";
  const alterna = m.every((x, i) => x.secuencia === i + 1 && x.tipo === (i % 2 === 0 ? "cargo" : "reverso"));
  const deudaOrden = m.reduce((s, x) => s + (x.tipo === "cargo" ? 1 : -1) * Math.round(Number(x.monto) * 100), 0);
  const deudaOk = tiene ? deudaOrden === Math.round(Number(ultimo.monto) * 100) : deudaOrden === 0;
  return { ok: o.debe === tiene && alterna && deudaOk, detalle: { debe: o.debe, m } };
}

async function walletDe(tx: TxDeTest, organizacionId: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "wallet_movimiento" WHERE "organizacion_id" = $1`,
    organizacionId,
  );
  return n;
}

describeSiHayBase("SLT-83 — el cobro porcentual de una orden (Postgres, R6–R8, R10–R16, R18)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    tarifaGlobal = await tomarTarifaGlobal();
    await tarifaGlobal.fijar(GLOBAL);
  }, 60_000);

  afterAll(async () => {
    await tarifaGlobal?.soltar();
    await base?.$disconnect();
  });

  /* ------------------------------- §3.5 ---------------------------------- */

  it("§3.5: el ejemplo numérico del design, paso a paso (R6–R8, R11–R13, R18)", async () => {
    const r = await revertida(base, async (tx) => {
      const pasos: Record<string, unknown> = {};
      const { e: A, plan: P } = await empresaPorcentual(tx, "2", "500");
      const B = await crearEmpresa(tx);
      // SLT-126: sin valor propio, la otra empresa (p1) se cobra al crear con un plan fijo de 80,00.
      await asignar(tx, B, await crearPlanConCosto(tx, { fijo: "80.00" }));
      const o: Record<string, string> = {};
      const foto = async () => ({
        o1: await movimientos(tx, o.o1),
        o2: await movimientos(tx, o.o2),
        o3: o.o3 ? await movimientos(tx, o.o3) : null,
        p1: await movimientos(tx, o.p1),
        deudaA: await deuda(tx, A.id),
      });

      [o.o1, o.o2] = await crearOrdenes(tx, A, [{ montoCobrar: "100000" }, { montoCobrar: "10000" }]);
      o.p1 = await crearOrden(tx, B);
      pasos.alta = { ...(await foto()), c1: await condicionDe(tx, o.o1), c2: await condicionDe(tx, o.o2), cp1: await condicionDe(tx, o.p1) };

      await cambiarEstado(tx, o.o1, "entregado");
      pasos.o1Entregada = await foto();

      await cambiarEstado(tx, o.o2, "devuelta_a_tienda");
      pasos.o2Devuelta = await foto();

      await fijarCostoDelPlan(tx, P, { pct: "5", minimo: null });
      o.o3 = await crearOrden(tx, A, { montoCobrar: null });
      pasos.o3Creada = { ...(await foto()), c3: await condicionDe(tx, o.o3) };

      await cambiarEstado(tx, o.o1, "en_reparto");
      pasos.o1Sale = await foto();

      await cambiarMonto(tx, o.o1, "120000");
      await cambiarEstado(tx, o.o1, "entregado");
      pasos.o1Vuelve = await foto();

      await cambiarEstado(tx, o.o3, "incidente");
      pasos.o3Incidente = await foto();

      await cambiarMonto(tx, o.o1, "150000");
      pasos.montoEnFinal = await foto();
      return pasos;
    });

    expect(r.alta).toEqual({
      o1: [],
      o2: [],
      o3: null,
      p1: [cargo("80.00")],
      deudaA: "0.00",
      c1: { porcentaje: "2.00", minimo: "500.00" },
      c2: { porcentaje: "2.00", minimo: "500.00" },
      cp1: null,
    });
    expect(r.o1Entregada).toMatchObject({ o1: [cargo("2000.00")], o2: [], deudaA: "2000.00" });
    expect(r.o2Devuelta).toMatchObject({ o1: [cargo("2000.00")], o2: [cargo("500.00")], deudaA: "2500.00" });
    expect(r.o3Creada).toMatchObject({ o3: [], c3: { porcentaje: "5.00", minimo: null }, deudaA: "2500.00" });
    expect(r.o1Sale).toMatchObject({ o1: [cargo("2000.00"), reverso("2000.00", 2)], deudaA: "500.00" });
    expect(r.o1Vuelve).toMatchObject({ o1: [cargo("2000.00"), reverso("2000.00", 2), cargo("2400.00", 3)], deudaA: "2900.00" });
    expect(r.o3Incidente).toMatchObject({ o3: [cargo("0.00")], deudaA: "2900.00" });
    expect(r.montoEnFinal).toEqual(r.o3Incidente);
  });

  /* -------------------------------- R6 ----------------------------------- */

  it("R6: un alta de tres órdenes en una sola sentencia congela tres condiciones y no registra ningún cargo", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx, "2.5", "1500");
      const ids = await crearOrdenes(tx, e, [{ montoCobrar: "1000" }, { montoCobrar: "2000" }, {}]);
      return {
        condiciones: await Promise.all(ids.map((id) => condicionDe(tx, id))),
        movimientos: await Promise.all(ids.map((id) => movimientos(tx, id))),
        deuda: await deuda(tx, e.id),
      };
    });
    expect(r.condiciones).toEqual(Array(3).fill({ porcentaje: "2.50", minimo: "1500.00" }));
    expect(r.movimientos).toEqual([[], [], []]);
    expect(r.deuda).toBe("0.00");
  });

  /* -------------------------------- R7 ----------------------------------- */

  it("R7: con plan fijo o vacío el cobro sigue siendo el de SLT-66 (cargo al crear, plan o global)", async () => {
    const r = await revertida(base, async (tx) => {
      const fija = await crearEmpresa(tx);
      await asignar(tx, fija, await crearPlanConCosto(tx, { fijo: "100.00" }));
      const vacia = await crearEmpresa(tx);
      await asignar(tx, vacia, await crearPlanConCosto(tx, {}));
      const of = await crearOrden(tx, fija);
      const ov = await crearOrden(tx, vacia);
      return { fija: await movimientos(tx, of), cf: await condicionDe(tx, of), vacia: await movimientos(tx, ov), cv: await condicionDe(tx, ov) };
    });
    expect(r).toEqual({ fija: [cargo("100.00")], cf: null, vacia: [cargo(GLOBAL, 1, "global")], cv: null });
  });

  /* -------------------------------- R8 ----------------------------------- */

  it.each(FINALES)("R8: entrar a %s registra el cargo porcentual con el monto_cobrar del instante", async (estado) => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { montoCobrar: "50000" });
      await cambiarEstado(tx, id, "en_reparto");
      const antes = await movimientos(tx, id);
      await cambiarMonto(tx, id, "100000");
      await cambiarEstado(tx, id, estado);
      return { antes, despues: await movimientos(tx, id) };
    });
    expect(r.antes).toEqual([]);
    expect(r.despues).toEqual([cargo("2000.00")]);
  });

  it.each(FINALES)("R8: una orden que nace en %s se cobra al nacer", async (estado) => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { estado, montoCobrar: "100000" });
      return { m: await movimientos(tx, id), c: await condicionDe(tx, id) };
    });
    expect(r).toEqual({ m: [cargo("2000.00")], c: { porcentaje: "2.00", minimo: "500.00" } });
  });

  it("R8: una orden que nace anulada no se cobra aunque nazca en un estado final", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { estado: "entregado", montoCobrar: "100000", anulada: true });
      return { m: await movimientos(tx, id), c: await condicionDe(tx, id) };
    });
    expect(r).toEqual({ m: [], c: { porcentaje: "2.00", minimo: "500.00" } });
  });

  /* -------------------------------- R10 ---------------------------------- */

  // SLT-86 (R13, §12): el descuento anual de SLT-83 R10 es ahora un descuento de período en
  // `plan_descuento_periodo`; ni ese ni el tipo de cobro tocan el cargo de la orden.
  it("R10, SLT-86 R13: el cargo porcentual no lleva el descuento del período ni impuestos", async () => {
    const r = await revertida(base, async (tx) => {
      const { e, plan } = await empresaPorcentual(tx, "2", null);
      await tx.$executeRawUnsafe(
        `INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje") VALUES ($1, 'anual', 20)`,
        plan,
      );
      await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_tipo_cobro" = 'anual' WHERE "id" = $1`, e.id);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, id, "entregado");
      return movimientos(tx, id);
    });
    expect(r).toEqual([cargo("2000.00")]);
  });

  /* -------------------------------- R11 ---------------------------------- */

  it("R11: cambie lo que cambie después del alta (plan, global, otro plan), se cobra con lo congelado", async () => {
    const r = await revertida(base, async (tx) => {
      const { e, plan } = await empresaPorcentual(tx, "2", "500");
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await fijarCostoDelPlan(tx, plan, { pct: "5", minimo: null });
      await fijarCostoDelPlan(tx, plan, { fijo: "999.00" });
      await tx.$executeRawUnsafe(`UPDATE "cobro_plataforma_tarifa" SET "monto" = 7.00`);
      await asignar(tx, e, await crearPlanConCosto(tx, { pct: "10", minimo: "0" }));
      await cambiarEstado(tx, id, "entregado");
      return { m: await movimientos(tx, id), c: await condicionDe(tx, id) };
    });
    expect(r).toEqual({ m: [cargo("2000.00")], c: { porcentaje: "2.00", minimo: "500.00" } });
  });

  it("R11: una orden creada con modo fijo conserva su cargo fijo aunque el plan pase a porcentual", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      const plan = await crearPlanConCosto(tx, { fijo: "100.00" });
      await asignar(tx, e, plan);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await fijarCostoDelPlan(tx, plan, { pct: "2", minimo: "500" });
      await cambiarEstado(tx, id, "entregado");
      await cambiarEstado(tx, id, "en_reparto");
      return { m: await movimientos(tx, id), c: await condicionDe(tx, id) };
    });
    expect(r).toEqual({ m: [cargo("100.00")], c: null });
  });

  /* -------------------------------- R12 ---------------------------------- */

  it("R12: salir de un estado final revierte por el mismo importe; volver cobra con el monto del instante", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx, "2", null);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, id, "incidente");
      await cambiarMonto(tx, id, "50000");
      await cambiarEstado(tx, id, "en_reparto");
      const fuera = await movimientos(tx, id);
      await cambiarEstado(tx, id, "entregado");
      return { fuera, vuelta: await movimientos(tx, id) };
    });
    expect(r.fuera).toEqual([cargo("2000.00"), reverso("2000.00", 2)]);
    expect(r.vuelta).toEqual([cargo("2000.00"), reverso("2000.00", 2), cargo("1000.00", 3)]);
  });

  it("R12: pasar de un estado final a otro no registra nada", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, id, "entregado");
      await cambiarMonto(tx, id, "300000");
      await cambiarEstado(tx, id, "incidente");
      await cambiarEstado(tx, id, "devuelta_a_tienda");
      return movimientos(tx, id);
    });
    expect(r).toEqual([cargo("2000.00")]);
  });

  /* -------------------------------- R13 ---------------------------------- */

  it("R13: cambiar el monto_cobrar de una orden ya en estado final no toca su cargo", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, id, "entregado");
      const antes = await movimientos(tx, id);
      await cambiarMonto(tx, id, "900000");
      await cambiarMonto(tx, id, null);
      return { antes, despues: await movimientos(tx, id) };
    });
    expect(r.despues).toEqual(r.antes);
    expect(r.despues).toEqual([cargo("2000.00")]);
  });

  /* -------------------------------- R14 ---------------------------------- */

  it("R14: anular sin cargo vigente no registra nada; recuperar sin estado final tampoco", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await anular(tx, id, true);
      const anulada = await movimientos(tx, id);
      await anular(tx, id, false);
      return { anulada, recuperada: await movimientos(tx, id) };
    });
    expect(r).toEqual({ anulada: [], recuperada: [] });
  });

  it("R14: anular con cargo vigente revierte por el mismo importe; recuperar en estado final cobra con el monto del instante", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx, "2", null);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await cambiarEstado(tx, id, "entregado");
      await anular(tx, id, true);
      const anulada = await movimientos(tx, id);
      const [{ cuando }] = await tx.$queryRawUnsafe<{ cuando: boolean }[]>(
        `SELECT m."ocurrido_at" = o."deleted_at" AS cuando FROM "cobro_plataforma_movimiento" m JOIN "orden" o ON o."id" = m."orden_id"
          WHERE m."orden_id" = $1 AND m."secuencia" = 2`,
        id,
      );
      await cambiarMonto(tx, id, "70000");
      await anular(tx, id, false);
      return { anulada, cuando, recuperada: await movimientos(tx, id) };
    });
    expect(r.anulada).toEqual([cargo("2000.00"), reverso("2000.00", 2)]);
    expect(r.cuando).toBe(true);
    expect(r.recuperada).toEqual([cargo("2000.00"), reverso("2000.00", 2), cargo("1400.00", 3)]);
  });

  /* -------------------------------- R15 ---------------------------------- */

  it("R15: el invariante se cumple tras cada paso de una secuencia larga, y repetir no registra nada", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { montoCobrar: "40000" });
      const pasos: Array<() => Promise<unknown>> = [
        () => cambiarEstado(tx, id, "en_reparto"),
        () => cambiarEstado(tx, id, "entregado"),
        () => cambiarEstado(tx, id, "entregado"),
        () => anular(tx, id, true),
        () => anular(tx, id, true),
        () => cambiarEstado(tx, id, "en_reparto"),
        () => cambiarEstado(tx, id, "incidente"),
        () => anular(tx, id, false),
        () => tx.$executeRawUnsafe(`SELECT cobro_plataforma_porcentual_conciliar($1)`, id),
        () => cambiarMonto(tx, id, "60000"),
        () => cambiarEstado(tx, id, "en_reparto"),
        () => tx.$executeRawUnsafe(`SELECT cobro_plataforma_porcentual_conciliar($1)`, id),
        () => cambiarEstado(tx, id, "devuelta_a_tienda"),
        () => anular(tx, id, true),
        () => anular(tx, id, false),
      ];
      const fallos: unknown[] = [];
      for (const [i, paso] of pasos.entries()) {
        await paso();
        const inv = await invariante(tx, id);
        if (!inv.ok) fallos.push({ paso: i, ...(inv.detalle as object) });
      }
      return { fallos, final: await movimientos(tx, id) };
    });
    expect(r.fallos).toEqual([]);
    // entregado (800) → anulada (rev) → incidente sin vida → recuperada (cargo 800) → en_reparto (rev) →
    // devuelta con 60.000 (1.200) → anulada (rev) → recuperada (cargo 1.200).
    expect(r.final).toEqual([
      cargo("800.00", 1),
      reverso("800.00", 2),
      cargo("800.00", 3),
      reverso("800.00", 4),
      cargo("1200.00", 5),
      reverso("1200.00", 6),
      cargo("1200.00", 7),
    ]);
  });

  it("R15: una sentencia que cambia estado y anulación a la vez deja lo mismo que las dos por separado", async () => {
    // «Lo mismo» es el resultado del invariante: si queda cargo vigente y cuánto debe la orden. La lista
    // de movimientos de dos sentencias depende de su orden (entregar y luego anular deja cargo y reverso;
    // anular y luego entregar, nada), y las dos dejan la orden sin cargo vigente y con deuda 0.
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const [junta, entregaYAnula, anulaYEntrega, juntaVuelta, separadaVuelta] = await crearOrdenes(tx, e, [
        { montoCobrar: "100000" },
        { montoCobrar: "100000" },
        { montoCobrar: "100000" },
        { estado: "entregado", montoCobrar: "100000" },
        { estado: "entregado", montoCobrar: "100000" },
      ]);
      const idDe = async (v: string) =>
        (await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "order_status" WHERE "value" = $1`, v))[0].id;
      const juntas = `UPDATE orden SET estatus_id = $2, deleted_at = now() AT TIME ZONE 'UTC' WHERE id = $1`;
      // Entra a un estado final y se anula.
      await tx.$executeRawUnsafe(juntas, junta, await idDe("entregado"));
      await cambiarEstado(tx, entregaYAnula, "entregado");
      await anular(tx, entregaYAnula, true);
      await anular(tx, anulaYEntrega, true);
      await cambiarEstado(tx, anulaYEntrega, "entregado");
      // Sale del estado final y se anula.
      await tx.$executeRawUnsafe(juntas, juntaVuelta, await idDe("en_reparto"));
      await cambiarEstado(tx, separadaVuelta, "en_reparto");
      await anular(tx, separadaVuelta, true);
      const resultado = async (id: string) => {
        const m = await movimientos(tx, id);
        const vigente = m.at(-1)?.tipo === "cargo";
        const centimos = m.reduce((s, x) => s + (x.tipo === "cargo" ? 1 : -1) * Math.round(Number(x.monto) * 100), 0);
        return { vigente, deuda: centimos, invariante: (await invariante(tx, id)).ok };
      };
      return {
        junta: await resultado(junta),
        entregaYAnula: await resultado(entregaYAnula),
        anulaYEntrega: await resultado(anulaYEntrega),
        juntaVuelta: await movimientos(tx, juntaVuelta),
        separadaVuelta: await movimientos(tx, separadaVuelta),
      };
    });
    const sinCargo = { vigente: false, deuda: 0, invariante: true };
    expect(r.junta).toEqual(sinCargo);
    expect(r.entregaYAnula).toEqual(sinCargo);
    expect(r.anulaYEntrega).toEqual(sinCargo);
    expect(r.juntaVuelta).toEqual(r.separadaVuelta);
    expect(r.separadaVuelta).toEqual([cargo("2000.00"), reverso("2000.00", 2)]);
  });

  /* -------------------------------- R16 ---------------------------------- */

  it("R16: si la operación no se confirma, no quedan condiciones, cargos ni reversos de ella", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      let deshechas: string[] = [];
      await yDeshacer(tx, async () => {
        deshechas = await crearOrdenes(tx, e, [{ montoCobrar: "1000" }, { estado: "entregado", montoCobrar: "1000" }]);
      });
      const tras = {
        condiciones: await Promise.all(deshechas.map((id) => condicionDe(tx, id))),
        movimientos: await Promise.all(deshechas.map((id) => movimientos(tx, id))),
      };
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      await yDeshacer(tx, () => cambiarEstado(tx, id, "entregado"));
      const trasEstado = await movimientos(tx, id);
      await cambiarEstado(tx, id, "entregado");
      await yDeshacer(tx, () => anular(tx, id, true));
      const trasAnular = await movimientos(tx, id);
      return { tras, trasEstado, trasAnular, deuda: await deuda(tx, e.id) };
    });
    expect(r.tras).toEqual({ condiciones: [null, null], movimientos: [[], []] });
    expect(r.trasEstado).toEqual([]);
    expect(r.trasAnular).toEqual([cargo("2000.00")]);
    expect(r.deuda).toBe("2000.00");
  });

  /* -------------------------------- R18 ---------------------------------- */

  it("R18: la deuda de la wallet sube con el cargo porcentual y baja con su reverso; la caja no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const { e } = await empresaPorcentual(tx);
      const id = await crearOrden(tx, e, { montoCobrar: "100000" });
      const walletAntes = await walletDe(tx, e.id);
      const d0 = await deuda(tx, e.id);
      await cambiarEstado(tx, id, "entregado");
      const d1 = await deuda(tx, e.id);
      await cambiarEstado(tx, id, "en_reparto");
      const d2 = await deuda(tx, e.id);
      return { d0, d1, d2, walletAntes, walletDespues: await walletDe(tx, e.id) };
    });
    expect([r.d0, r.d1, r.d2]).toEqual(["0.00", "2000.00", "0.00"]);
    expect(r.walletDespues).toBe(r.walletAntes);
  });
});
