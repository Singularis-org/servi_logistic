import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-214 (design §1.1, §3.4; R1, R6) — la tabla `plan_beneficio` contra Postgres real. Todo en una transacción
// del dueño que se revierte.
//   · R1: guarda la lista en su orden, vacía o larga;
//   · R6: los tres CHECK rechazan lo que llegue sin pasar por la app, y `servi_app` no lee ni escribe la tabla;
//     la empresa solo ve los beneficios por `plan_de_la_empresa`, y solo los de su plan.
//
// Después de un `comoApp` la transacción corre como `servi_app`; `RESET ROLE` la devuelve al dueño.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const INSERTAR = `INSERT INTO "plan_beneficio" ("plan_id", "posicion", "icono", "texto") VALUES ($1, $2, $3, $4)`;

/** `ok`, o el SQLSTATE y la constraint que nombra el error (si nombra una de `plan_beneficio`). */
async function intento(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string> {
  const error = await capturar(tx, () => tx.$executeRawUnsafe(sql, ...args));
  if (error === null) return "ok";
  const constraint = /plan_beneficio_\w+/.exec(String((error as { message?: string }).message ?? error))?.[0];
  return `${sqlstateDe(error)}${constraint ? ` ${constraint}` : ""}`;
}

async function beneficiosDe(tx: TxDeTest, planId: string): Promise<{ posicion: number; icono: string; texto: string }[]> {
  return tx.planBeneficio.findMany({
    where: { planId },
    orderBy: { posicion: "asc" },
    select: { posicion: true, icono: true, texto: true },
  });
}

async function miPlan(tx: TxDeTest, organizacionId: string): Promise<Record<string, unknown>> {
  const [f] = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, organizacionId);
  return (typeof f.plan === "string" ? JSON.parse(f.plan) : f.plan) as Record<string, unknown>;
}

describeSiHayBase("SLT-214 R1, R6 — la tabla plan_beneficio", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: guarda una lista ordenada de beneficios, sin tope de cantidad, y un plan puede no tener ninguno", async () => {
    const r = await revertida(base, async (tx) => {
      const conBeneficios = await crearPlan(tx);
      const sinBeneficios = await crearPlan(tx);
      const textos = Array.from({ length: 30 }, (_, i) => `Beneficio ${String(i).padStart(2, "0")}`);
      // Al revés a propósito: el orden lo da `posicion`, no el de inserción.
      for (let i = textos.length - 1; i >= 0; i--) await tx.$executeRawUnsafe(INSERTAR, conBeneficios, i, "check", textos[i]);
      return {
        textos,
        con: await beneficiosDe(tx, conBeneficios),
        sin: await beneficiosDe(tx, sinBeneficios),
      };
    });
    expect(r.con.map((b) => b.texto)).toEqual(r.textos);
    expect(r.con.map((b) => b.posicion)).toEqual(r.textos.map((_, i) => i));
    expect(r.sin).toEqual([]);
  });

  it("R6: los CHECK rechazan texto vacío, de más de 120, con espacios en los extremos, un ícono fuera del catálogo y una posición negativa", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlan(tx);
      return {
        valido120: await intento(tx, INSERTAR, planId, 0, "corazon", "a".repeat(120)),
        validoReloj: await intento(tx, INSERTAR, planId, 1, "reloj_24h", "Soporte 24 h"),
        vacio: await intento(tx, INSERTAR, planId, 2, "check", ""),
        soloEspacios: await intento(tx, INSERTAR, planId, 3, "check", "   "),
        espacioDelante: await intento(tx, INSERTAR, planId, 4, "check", " Soporte"),
        espacioDetras: await intento(tx, INSERTAR, planId, 5, "check", "Soporte "),
        // 121 caracteres no caben en el VARCHAR(120): lo para el tipo antes que el CHECK.
        largo: await intento(tx, INSERTAR, planId, 6, "check", "a".repeat(121)),
        iconoFuera: await intento(tx, INSERTAR, planId, 7, "Users", "Equipo"),
        iconoMayusculas: await intento(tx, INSERTAR, planId, 8, "CHECK", "Equipo"),
        posicionNegativa: await intento(tx, INSERTAR, planId, -1, "check", "Equipo"),
        posicionRepetida: await intento(tx, INSERTAR, planId, 0, "check", "Otro"),
        planQueNoExiste: await intento(tx, INSERTAR, randomUUID(), 0, "check", "Equipo"),
      };
    });
    expect(r).toEqual({
      valido120: "ok",
      validoReloj: "ok",
      vacio: "23514 plan_beneficio_texto_check",
      soloEspacios: "23514 plan_beneficio_texto_check",
      espacioDelante: "23514 plan_beneficio_texto_check",
      espacioDetras: "23514 plan_beneficio_texto_check",
      largo: "22001",
      iconoFuera: "23514 plan_beneficio_icono_check",
      iconoMayusculas: "23514 plan_beneficio_icono_check",
      posicionNegativa: "23514 plan_beneficio_posicion_check",
      posicionRepetida: "23505 plan_beneficio_pkey",
      planQueNoExiste: "23503 plan_beneficio_plan_id_fkey",
    });
  });

  it("R6: servi_app no lee ni escribe plan_beneficio, ni con la empresa del plan en el contexto (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      const planId = await crearPlan(tx);
      const { id: empresa } = await crearOrganizacion(tx);
      await asignarPlan(tx, empresa, planId);
      await tx.$executeRawUnsafe(INSERTAR, planId, 0, "soporte", "Soporte 24 h");
      // Control: el dueño sí la lee (el 42501 de abajo es de privilegios, no de una tabla vacía).
      const control = (await beneficiosDe(tx, planId)).length;
      await comoApp(tx, empresa);
      const salida = {
        select: await intento(tx, `SELECT * FROM "plan_beneficio" WHERE "plan_id" = $1`, planId),
        insert: await intento(tx, INSERTAR, planId, 1, "check", "Otro"),
        update: await intento(tx, `UPDATE "plan_beneficio" SET "texto" = 'X' WHERE "plan_id" = $1`, planId),
        delete: await intento(tx, `DELETE FROM "plan_beneficio" WHERE "plan_id" = $1`, planId),
      };
      await tx.$executeRawUnsafe("RESET ROLE");
      return { control, salida, despues: await beneficiosDe(tx, planId) };
    });
    expect(r.control).toBe(1);
    expect(r.salida).toEqual({ select: "42501", insert: "42501", update: "42501", delete: "42501" });
    expect(r.despues).toEqual([{ posicion: 0, icono: "soporte", texto: "Soporte 24 h" }]);
  });

  it("R6: la empresa ve los beneficios solo por plan_de_la_empresa, los de su plan y en orden; el de otra empresa da 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const suyo = await crearPlan(tx);
      const ajeno = await crearPlan(tx);
      const { id: empresa } = await crearOrganizacion(tx);
      const { id: otra } = await crearOrganizacion(tx);
      await asignarPlan(tx, empresa, suyo);
      await asignarPlan(tx, otra, ajeno);
      await tx.$executeRawUnsafe(INSERTAR, suyo, 1, "rayo", "Acceso anticipado");
      await tx.$executeRawUnsafe(INSERTAR, suyo, 0, "soporte", "Soporte 24 h");
      await tx.$executeRawUnsafe(INSERTAR, ajeno, 0, "regalo", "Del plan ajeno");
      await comoApp(tx, empresa);
      const propio = (await miPlan(tx, empresa)).beneficios;
      const deOtra = await intento(tx, `SELECT plan_de_la_empresa($1)`, otra);
      await tx.$executeRawUnsafe("RESET ROLE");
      return { propio, deOtra };
    });
    expect(r.propio).toEqual([
      { icono: "soporte", texto: "Soporte 24 h" },
      { icono: "rayo", texto: "Acceso anticipado" },
    ]);
    expect(r.deOtra).toBe("42501");
  });
});
