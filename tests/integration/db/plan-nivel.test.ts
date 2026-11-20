import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import type { Nivel } from "@/lib/planes/niveles";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO } from "@/lib/types/planes";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, capturar, crearPlan, entradaDePlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-215 (design §1, §2; R1, R6, R36) — las tablas de los niveles contra Postgres real. Todo en una transacción
// del dueño que se revierte.
//   · R1: `plan_nivel` guarda la lista en su orden, de 0 a 10 niveles;
//   · R6: cada CHECK rechaza lo que llegue sin pasar por la app, y `servi_app` no lee ni escribe `plan_nivel`;
//   · R36: con `servi_app`, cada empresa lee solo su nivel y su historial, y nadie los escribe ni llama a las
//     funciones que los escriben;
//   · T4 — R15, R17, R18: `PlanesService` y `PlanesRepository` REALES crean, programan y promueven la lista (el
//     repositorio abre sus transacciones como SAVEPOINT de la del caso), como los beneficios de SLT-214.
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

/* -------------------------------------------------------------------------- */
/* T4 — la lista del plan por el servicio y el repositorio reales              */
/* -------------------------------------------------------------------------- */

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 10 de noviembre de 2026, 09:00 en la plataforma; la edición rige el 20, sin empresas: promueve en F. */
const AHORA = new Date("2026-11-10T15:00:00.000Z");
const PROGRAMADA = "2026-11-20";

const servicio = (tx: TxDeTest) => new PlanesService(planesEnTx(tx), () => AHORA);

async function crearConServicio(tx: TxDeTest, niveles: unknown): Promise<string> {
  const r = await servicio(tx).crear(SUPERADMIN, { ...entradaDePlan(), niveles } as Parameters<PlanesService["crear"]>[1]);
  if (r.estado !== "ok") throw new Error(`crear: ${JSON.stringify(r)}`);
  return r.planId;
}

/** Las filas de `plan_nivel` del plan, en orden, con los importes como texto de dos decimales. */
async function nivelesDe(tx: TxDeTest, planId: string): Promise<[number, number, string | null, string | null][]> {
  const filas = await tx.planNivel.findMany({ where: { planId }, orderBy: { nivel: "asc" } });
  return filas.map((f) => [f.nivel, f.meta, f.descuentoPct?.toFixed(2) ?? null, f.descuentoMonto?.toFixed(2) ?? null]);
}

/** La edición que manda el formulario a partir del plan leído, con `cambio` encima; sin `niveles` si no van. */
async function programar(tx: TxDeTest, planId: string, cambio: Record<string, unknown>) {
  const plan = (await planesEnTx(tx).plan(planId)) as PlanDTO;
  await fijarEmpresa(tx, "");
  const { id, nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = plan;
  const r = await servicio(tx).editar(SUPERADMIN, {
    planId: id,
    nombre,
    topes,
    modulos,
    precio,
    costoPorOrden,
    costoPorOrdenPorcentual,
    vigenteDesde: PROGRAMADA,
    ...cambio,
  } as Parameters<PlanesService["editar"]>[1]);
  if (r.estado !== "ok") throw new Error(`programar: ${JSON.stringify(r)}`);
  return r;
}

/** Lo que hace la cola en F con un plan sin empresas: promover el cambio. */
async function promover(tx: TxDeTest, planId: string) {
  const { id: cambioId, version } = await tx.planCambioProgramado.findUniqueOrThrow({
    where: { planId },
    select: { id: true, version: true },
  });
  const aplicado = await planesEnTx(tx).aplicarCambioProgramado(
    { planId, cambioId },
    new Date(inicioDelDiaPlataforma(PROGRAMADA).getTime() + 60_000),
  );
  return { version, aplicado };
}

async function rastroDe(tx: TxDeTest, planId: string) {
  const filas = await tx.planRastro.findMany({
    where: { planId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { accion: true, cambios: true },
  });
  return filas.map((f) => ({ accion: f.accion, cambios: f.cambios as Record<string, unknown> }));
}

const pct = (meta: number, porcentaje: string): Nivel => ({ meta, descuento: { tipo: "porcentaje", porcentaje } });
const monto = (meta: number, m: string): Nivel => ({ meta, descuento: { tipo: "monto", monto: m } });

/** La forma del rastro: los importes con dos decimales, como `importeCanonico`. */
const canon = (l: Nivel[]) =>
  l.map((n) => ({
    meta: n.meta,
    descuento:
      n.descuento.tipo === "porcentaje"
        ? { tipo: "porcentaje", porcentaje: Number(n.descuento.porcentaje).toFixed(2) }
        : { tipo: "monto", monto: Number(n.descuento.monto).toFixed(2) },
  }));

describeSiHayBase("SLT-215 T4 R15, R17, R18 — la lista de niveles del plan", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R15: crear con 3 niveles los guarda y los lee en su orden; sin `niveles`, el plan queda sin ninguno", async () => {
    const r = await revertida(base, async (tx) => {
      const con = await crearConServicio(tx, [pct(100, "5"), monto(500, "1500"), pct(1000, "12.5")]);
      const sin = await crearConServicio(tx, undefined);
      const repo = planesEnTx(tx);
      return {
        filas: await nivelesDe(tx, con),
        dto: (await repo.plan(con))?.niveles,
        sinFilas: await nivelesDe(tx, sin),
        sinDto: (await repo.plan(sin))?.niveles,
        rastroCon: await rastroDe(tx, con),
        rastroSin: await rastroDe(tx, sin),
      };
    });
    expect(r.filas).toEqual([
      [1, 100, "5.00", null],
      [2, 500, null, "1500.00"],
      [3, 1000, "12.50", null],
    ]);
    expect(r.dto).toEqual([pct(100, "5.00"), monto(500, "1500.00"), pct(1000, "12.50")]);
    expect(r.sinFilas).toEqual([]);
    expect(r.sinDto).toEqual([]);
    // R19: el alta con niveles los guarda en su fila «creado»; un alta sin niveles no añade nada al rastro.
    expect(r.rastroCon.map((f) => [f.accion, f.cambios.niveles])).toEqual([
      ["creado", { antes: null, despues: canon([pct(100, "5"), monto(500, "1500"), pct(1000, "12.5")]) }],
    ]);
    expect(r.rastroSin.map((f) => [f.accion, "niveles" in f.cambios])).toEqual([["creado", false]]);
  });

  it("R15: crear con metas que no crecen se rechaza sin escribir el plan", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await tx.plan.count();
      const res = await servicio(tx).crear(SUPERADMIN, {
        ...entradaDePlan(),
        niveles: [pct(100, "5"), pct(100, "10")],
      } as Parameters<PlanesService["crear"]>[1]);
      return { res, despues: (await tx.plan.count()) - antes };
    });
    expect(r.res.estado).not.toBe("ok");
    expect(r.despues).toBe(0);
  });

  it("R17: promover el cambio deja la lista del plan igual a la de la versión (meta, descuento y orden), con su rastro", async () => {
    const antes = [pct(100, "5"), pct(500, "10")];
    const despues = [monto(50, "200"), pct(300, "7.5"), pct(900, "15")];
    const r = await revertida(base, async (tx) => {
      const planId = await crearConServicio(tx, antes);
      await programar(tx, planId, { niveles: despues });
      const trasProgramar = await nivelesDe(tx, planId);
      const { version, aplicado } = await promover(tx, planId);
      return {
        trasProgramar,
        version,
        aplicado,
        final: await nivelesDe(tx, planId),
        dto: (await planesEnTx(tx).plan(planId))?.niveles,
        rastro: await rastroDe(tx, planId),
      };
    });
    // R16: programar no cambia la lista del plan.
    expect(r.trasProgramar).toEqual([
      [1, 100, "5.00", null],
      [2, 500, "10.00", null],
    ]);
    expect(r.version).toMatchObject({ niveles: despues });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.final).toEqual([
      [1, 50, null, "200.00"],
      [2, 300, "7.50", null],
      [3, 900, "15.00", null],
    ]);
    expect(r.dto).toEqual([monto(50, "200.00"), pct(300, "7.50"), pct(900, "15.00")]);
    // R19: el rastro guarda la lista de antes y la de después, con los importes normalizados.
    const porAccion = Object.fromEntries(r.rastro.map((f) => [f.accion, f.cambios.niveles]));
    expect(porAccion.creado).toEqual({ antes: null, despues: canon(antes) });
    expect(porAccion.cambio_programado).toEqual({ antes: canon(antes), despues: canon(despues) });
    expect(porAccion.cambio_aplicado).toEqual({ antes: canon(antes), despues: canon(despues) });
  });

  it("R17: una versión con la lista vacía deja el plan sin niveles", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearConServicio(tx, [pct(100, "5")]);
      await programar(tx, planId, { niveles: [] });
      const { aplicado } = await promover(tx, planId);
      return { aplicado, final: await nivelesDe(tx, planId) };
    });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.final).toEqual([]);
  });

  it("R18: una versión programada sin `niveles` (como las de antes de la ficha) deja la lista del plan como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearConServicio(tx, [pct(100, "5"), monto(400, "250")]);
      // Sin la clave: así se guardaron las versiones de antes de SLT-215.
      await programar(tx, planId, { nombre: `sin niveles ${randomUUID().slice(0, 6)}` });
      const { version, aplicado } = await promover(tx, planId);
      return { version, aplicado, final: await nivelesDe(tx, planId), rastro: await rastroDe(tx, planId) };
    });
    expect(r.version).not.toHaveProperty("niveles");
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.final).toEqual([
      [1, 100, "5.00", null],
      [2, 400, null, "250.00"],
    ]);
    // Ni el programado ni el aplicado cuentan un cambio de niveles.
    expect(r.rastro.filter((f) => f.accion !== "creado").map((f) => "niveles" in f.cambios)).toEqual([false, false]);
  });
});
