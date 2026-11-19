import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-215 (design §1, §2; R1, R6, R36) — las tablas de los niveles contra Postgres real. Todo en una transacción
// del dueño que se revierte.
//   · R1: `plan_nivel` guarda la lista en su orden, de 0 a 10 niveles;
//   · R6: cada CHECK rechaza lo que llegue sin pasar por la app, y `servi_app` no lee ni escribe `plan_nivel`;
//   · R36: con `servi_app`, cada empresa lee solo su nivel y su historial, y nadie los escribe ni llama a las
//     funciones que los escriben.
//
// Después de un `comoApp` la transacción corre como `servi_app`; `RESET ROLE` la devuelve al dueño.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const INSERTAR = `INSERT INTO "plan_nivel" ("plan_id", "nivel", "meta", "descuento_pct", "descuento_monto") VALUES ($1, $2, $3, $4::numeric, $5::numeric)`;

/** `ok`, o el SQLSTATE y la constraint que nombra el error (si nombra una de las tablas de niveles). */
async function intento(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string> {
  const error = await capturar(tx, () => tx.$executeRawUnsafe(sql, ...args));
  if (error === null) return "ok";
  const constraint = /plan_nivel\w*_(?:check|pkey|fkey|una_forma|mes_y_ordenes|un_cierre_por_mes)\b/.exec(
    String((error as { message?: string }).message ?? error),
  )?.[0];
  return `${sqlstateDe(error)}${constraint ? ` ${constraint}` : ""}`;
}

/** Las filas que ve la transacción en su rol actual (`servi_app` o el dueño), o el SQLSTATE si no puede leer. */
async function leer(tx: TxDeTest, sql: string): Promise<unknown[] | string> {
  let filas: unknown[] = [];
  const error = await capturar(tx, async () => {
    filas = await tx.$queryRawUnsafe<unknown[]>(sql);
  });
  return error === null ? filas : sqlstateDe(error);
}

/** Una empresa con plan y su fila de nivel (por la toma del plan) y una fila de historial (por un recálculo). */
async function empresaConNivel(tx: TxDeTest): Promise<string> {
  const planId = await crearPlan(tx);
  const { id } = await crearOrganizacion(tx);
  await asignarPlan(tx, id, planId);
  await tx.$executeRawUnsafe(`SELECT plan_nivel_tomar_plan($1, '2026-10-15 12:00:00'::timestamp)`, id);
  await tx.$executeRawUnsafe(
    `SELECT plan_nivel_recalcular($1, '2026-11-10 12:00:00'::timestamp, 'cambio_niveles')`,
    id,
  );
  return id;
}

describeSiHayBase("SLT-215 R1, R6 — la tabla plan_nivel", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: guarda los niveles de un plan en su orden, hasta 10, y un plan puede no tener ninguno", async () => {
    const r = await revertida(base, async (tx) => {
      const con = await crearPlan(tx);
      const sin = await crearPlan(tx);
      // Al revés a propósito: el orden lo da `nivel`, no el de inserción.
      for (let n = 10; n >= 1; n--) {
        await tx.$executeRawUnsafe(INSERTAR, con, n, n * 100, n % 2 ? "5" : null, n % 2 ? null : "250");
      }
      const leidos = await tx.planNivel.findMany({ where: { planId: con }, orderBy: { nivel: "asc" } });
      return {
        con: leidos.map((f) => [f.nivel, f.meta, f.descuentoPct?.toFixed(2) ?? null, f.descuentoMonto?.toFixed(2) ?? null]),
        sin: await tx.planNivel.count({ where: { planId: sin } }),
      };
    });
    expect(r.con).toEqual(
      Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return [n, n * 100, n % 2 ? "5.00" : null, n % 2 ? null : "250.00"];
      }),
    );
    expect(r.sin).toBe(0);
  });

  it("R6: los CHECK rechazan número fuera de 1 a 10, meta menor que 1, ningún descuento o los dos, porcentaje fuera de (0, 100] y monto no positivo", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlan(tx);
      return {
        valido100: await intento(tx, INSERTAR, planId, 1, 1, "100", null),
        validoMonto: await intento(tx, INSERTAR, planId, 10, 5000, null, "0.01"),
        nivelCero: await intento(tx, INSERTAR, planId, 0, 1, "10", null),
        nivelOnce: await intento(tx, INSERTAR, planId, 11, 1, "10", null),
        metaCero: await intento(tx, INSERTAR, planId, 2, 0, "10", null),
        metaNegativa: await intento(tx, INSERTAR, planId, 2, -3, "10", null),
        sinDescuento: await intento(tx, INSERTAR, planId, 2, 5, null, null),
        losDos: await intento(tx, INSERTAR, planId, 2, 5, "10", "100"),
        pctCero: await intento(tx, INSERTAR, planId, 2, 5, "0", null),
        pctNegativo: await intento(tx, INSERTAR, planId, 2, 5, "-1", null),
        pctDeMas: await intento(tx, INSERTAR, planId, 2, 5, "100.01", null),
        montoCero: await intento(tx, INSERTAR, planId, 2, 5, null, "0"),
        montoNegativo: await intento(tx, INSERTAR, planId, 2, 5, null, "-10"),
        repetido: await intento(tx, INSERTAR, planId, 1, 7, "10", null),
        planQueNoExiste: await intento(tx, INSERTAR, "no-existe", 1, 1, "10", null),
      };
    });
    expect(r).toEqual({
      valido100: "ok",
      validoMonto: "ok",
      nivelCero: "23514 plan_nivel_nivel_check",
      nivelOnce: "23514 plan_nivel_nivel_check",
      metaCero: "23514 plan_nivel_meta_check",
      metaNegativa: "23514 plan_nivel_meta_check",
      sinDescuento: "23514 plan_nivel_una_forma",
      losDos: "23514 plan_nivel_una_forma",
      pctCero: "23514 plan_nivel_pct_check",
      pctNegativo: "23514 plan_nivel_pct_check",
      pctDeMas: "23514 plan_nivel_pct_check",
      montoCero: "23514 plan_nivel_monto_check",
      montoNegativo: "23514 plan_nivel_monto_check",
      repetido: "23505 plan_nivel_pkey",
      planQueNoExiste: "23503 plan_nivel_plan_id_fkey",
    });
  });

  it("R6: servi_app no lee ni escribe plan_nivel, ni con la empresa del plan en el contexto (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlan(tx);
      const { id: empresa } = await crearOrganizacion(tx);
      await asignarPlan(tx, empresa, planId);
      await tx.$executeRawUnsafe(INSERTAR, planId, 1, 100, "10", null);
      // Control: el dueño sí la lee (el 42501 de abajo es de privilegios, no de una tabla vacía).
      const control = await tx.planNivel.count({ where: { planId } });
      await comoApp(tx, empresa);
      const salida = {
        select: await intento(tx, `SELECT * FROM "plan_nivel" WHERE "plan_id" = $1`, planId),
        insert: await intento(tx, INSERTAR, planId, 2, 200, "10", null),
        update: await intento(tx, `UPDATE "plan_nivel" SET "meta" = 1 WHERE "plan_id" = $1`, planId),
        delete: await intento(tx, `DELETE FROM "plan_nivel" WHERE "plan_id" = $1`, planId),
      };
      await tx.$executeRawUnsafe("RESET ROLE");
      return { control, salida, despues: await tx.planNivel.count({ where: { planId, meta: 100 } }) };
    });
    expect(r.control).toBe(1);
    expect(r.salida).toEqual({ select: "42501", insert: "42501", update: "42501", delete: "42501" });
    expect(r.despues).toBe(1);
  });
});

describeSiHayBase("SLT-215 R6, R35, R36 — el nivel y el historial de cada empresa", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R6, R35: los CHECK de plan_nivel_empresa y plan_nivel_historial rechazan valores fuera de rango", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresaConNivel(tx);
      const historial = `INSERT INTO "plan_nivel_historial" ("organizacion_id", "plan_id", "nivel", "nivel_anterior", "motivo", "desde_at", "mes_inicio_at", "ordenes_efectivas")
        VALUES ($1, 'p', $2, $3, $4, '2026-12-01 06:00:00', $5::timestamp, $6)`;
      return {
        nivelOnce: await intento(tx, `UPDATE "plan_nivel_empresa" SET "nivel" = 11 WHERE "organizacion_id" = $1`, a),
        nivelNegativo: await intento(tx, `UPDATE "plan_nivel_empresa" SET "nivel" = -1 WHERE "organizacion_id" = $1`, a),
        cuentaDos: await intento(tx, `UPDATE "plan_nivel_empresa" SET "meses_sin_cumplir" = 2 WHERE "organizacion_id" = $1`, a),
        motivo: await intento(tx, historial, a, 1, 0, "manual", "2026-11-01 06:00:00", 10),
        nivelHistorial: await intento(tx, historial, a, 11, 0, "subida", "2026-11-01 06:00:00", 10),
        ordenesNegativas: await intento(tx, historial, a, 1, 0, "subida", "2026-11-01 06:00:00", -1),
        mesSinOrdenes: await intento(tx, historial, a, 1, 0, "subida", "2026-11-01 06:00:00", null),
        ordenesSinMes: await intento(tx, historial, a, 1, 0, "subida", null, 3),
        subida: await intento(tx, historial, a, 1, 0, "subida", "2026-09-01 06:00:00", 10),
        // R29: el único parcial impide cerrar dos veces el mismo mes de una empresa.
        mismoMes: await intento(tx, historial, a, 0, 1, "bajada", "2026-09-01 06:00:00", 2),
        // El recálculo no entra en el único: su motivo no es subida ni bajada.
        recalculoMismoMes: await intento(tx, historial, a, 1, 1, "cambio_niveles", "2026-09-01 06:00:00", 10),
      };
    });
    expect(r).toEqual({
      nivelOnce: "23514 plan_nivel_empresa_nivel_check",
      nivelNegativo: "23514 plan_nivel_empresa_nivel_check",
      cuentaDos: "23514 plan_nivel_empresa_meses_check",
      motivo: "23514 plan_nivel_historial_motivo_check",
      nivelHistorial: "23514 plan_nivel_historial_nivel_check",
      ordenesNegativas: "23514 plan_nivel_historial_ordenes_check",
      mesSinOrdenes: "23514 plan_nivel_historial_mes_y_ordenes",
      ordenesSinMes: "23514 plan_nivel_historial_mes_y_ordenes",
      subida: "ok",
      mismoMes: "23505 plan_nivel_historial_un_cierre_por_mes",
      recalculoMismoMes: "ok",
    });
  });

  it("R36: con servi_app, A ve solo su nivel y su historial, nunca los de B", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresaConNivel(tx);
      const b = await empresaConNivel(tx);
      // Control: como dueño, las dos tienen su fila y su historial.
      const control = {
        nivel: await tx.planNivelEmpresa.count({ where: { organizacionId: { in: [a, b] } } }),
        historial: await tx.planNivelHistorial.count({ where: { organizacionId: { in: [a, b] } } }),
      };
      await comoApp(tx, a);
      const nivel = await leer(tx, `SELECT "organizacion_id" FROM "plan_nivel_empresa"`);
      const historial = await leer(tx, `SELECT "organizacion_id" FROM "plan_nivel_historial"`);
      const deB = {
        nivel: await leer(tx, `SELECT 1 FROM "plan_nivel_empresa" WHERE "organizacion_id" = '${b}'`),
        historial: await leer(tx, `SELECT 1 FROM "plan_nivel_historial" WHERE "organizacion_id" = '${b}'`),
      };
      await tx.$executeRawUnsafe("RESET ROLE");
      return { a, control, nivel, historial, deB };
    });
    expect(r.control).toEqual({ nivel: 2, historial: 2 });
    expect(r.nivel).toEqual([{ organizacion_id: r.a }]);
    expect(r.historial).toEqual([{ organizacion_id: r.a }]);
    expect(r.deB).toEqual({ nivel: [], historial: [] });
  });

  it("R36: con servi_app nadie inserta, cambia ni borra un nivel o su historial, ni llama a las funciones que los escriben", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresaConNivel(tx);
      await comoApp(tx, a);
      const salida = {
        insertNivel: await intento(
          tx,
          `INSERT INTO "plan_nivel_empresa" ("organizacion_id", "nivel", "meses_sin_cumplir", "entrada_at", "cerrado_hasta_at") VALUES ($1, 3, 0, now(), now())`,
          a,
        ),
        updateNivel: await intento(tx, `UPDATE "plan_nivel_empresa" SET "nivel" = 3 WHERE "organizacion_id" = $1`, a),
        deleteNivel: await intento(tx, `DELETE FROM "plan_nivel_empresa" WHERE "organizacion_id" = $1`, a),
        insertHistorial: await intento(
          tx,
          `INSERT INTO "plan_nivel_historial" ("organizacion_id", "plan_id", "nivel", "nivel_anterior", "motivo", "desde_at") VALUES ($1, 'p', 3, 0, 'cambio_niveles', now())`,
          a,
        ),
        updateHistorial: await intento(tx, `UPDATE "plan_nivel_historial" SET "nivel" = 3 WHERE "organizacion_id" = $1`, a),
        deleteHistorial: await intento(tx, `DELETE FROM "plan_nivel_historial" WHERE "organizacion_id" = $1`, a),
        cerrar: await intento(tx, `SELECT plan_nivel_cerrar_meses($1, now()::timestamp)`, a),
        recalcular: await intento(tx, `SELECT plan_nivel_recalcular($1, now()::timestamp, 'cambio_niveles')`, a),
        tomar: await intento(tx, `SELECT plan_nivel_tomar_plan($1, now()::timestamp)`, a),
        ordenes: await intento(tx, `SELECT plan_nivel_ordenes_efectivas($1, now()::timestamp, now()::timestamp)`, a),
        metas: await intento(tx, `SELECT plan_nivel_metas_de_la_empresa($1)`, a),
      };
      await tx.$executeRawUnsafe("RESET ROLE");
      const despues = await tx.planNivelEmpresa.findUniqueOrThrow({ where: { organizacionId: a } });
      return {
        salida,
        despues: { nivel: despues.nivel, historial: await tx.planNivelHistorial.count({ where: { organizacionId: a } }) },
      };
    });
    expect(r.salida).toEqual({
      insertNivel: "42501",
      updateNivel: "42501",
      deleteNivel: "42501",
      insertHistorial: "42501",
      updateHistorial: "42501",
      deleteHistorial: "42501",
      cerrar: "42501",
      recalcular: "42501",
      tomar: "42501",
      ordenes: "42501",
      metas: "42501",
    });
    expect(r.despues).toEqual({ nivel: 0, historial: 1 });
  });

  it("R36: la empresa no se cambia de una fila de nivel ni de historial, ni como dueño (SL017)", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresaConNivel(tx);
      const { id: otra } = await crearOrganizacion(tx);
      return {
        nivel: await intento(tx, `UPDATE "plan_nivel_empresa" SET "organizacion_id" = $2 WHERE "organizacion_id" = $1`, a, otra),
        historial: await intento(tx, `UPDATE "plan_nivel_historial" SET "organizacion_id" = $2 WHERE "organizacion_id" = $1`, a, otra),
      };
    });
    expect(r).toEqual({ nivel: "SL017", historial: "SL017" });
  });
});
