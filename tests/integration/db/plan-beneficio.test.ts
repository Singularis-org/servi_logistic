import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { PlanesService } from "@/lib/services/PlanesService";
import type { PlanDTO } from "@/lib/types/planes";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, capturar, crearPlan, entradaDePlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-214 (design §1.1, §3.3, §3.4; R1, R6, R15, R17, R18) — la tabla `plan_beneficio` contra Postgres real. Todo
// en una transacción del dueño que se revierte.
//   · R1: guarda la lista en su orden, vacía o larga;
//   · R6: los tres CHECK rechazan lo que llegue sin pasar por la app, y `servi_app` no lee ni escribe la tabla;
//     la empresa solo ve los beneficios por `plan_de_la_empresa`, y solo los de su plan;
//   · R15, R17, R18: `PlanesService` y `PlanesRepository` REALES crean, programan y promueven la lista (el
//     repositorio abre sus transacciones como SAVEPOINT de la del caso).
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

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 10 de noviembre de 2026, 09:00 en la plataforma; la edición rige el 20, sin empresas: promueve en F. */
const AHORA = new Date("2026-11-10T15:00:00.000Z");
const PROGRAMADA = "2026-11-20";

const servicio = (tx: TxDeTest) => new PlanesService(planesEnTx(tx), () => AHORA);

async function crearConServicio(tx: TxDeTest, beneficios: unknown): Promise<string> {
  const r = await servicio(tx).crear(SUPERADMIN, { ...entradaDePlan(), beneficios });
  if (r.estado !== "ok") throw new Error(`crear: ${JSON.stringify(r)}`);
  return r.planId;
}

/** La edición que manda el formulario a partir del plan leído, con `cambio` encima; sin `beneficios` si no van. */
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
  });
  if (r.estado !== "ok") throw new Error(`programar: ${JSON.stringify(r)}`);
  return r;
}

/** Lo que hace la cola en F con un plan sin empresas: promover el cambio. */
async function promover(tx: TxDeTest, planId: string) {
  const { id: cambioId, version } = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId }, select: { id: true, version: true } });
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

  it("R15: crear con 3 beneficios los guarda y los lee en su orden, recortados (R2); sin `beneficios`, el plan queda sin ninguno", async () => {
    const r = await revertida(base, async (tx) => {
      const con = await crearConServicio(tx, [
        { icono: "soporte", texto: "  Soporte 24 h " },
        { icono: "camion", texto: "Envíos prioritarios" },
        { icono: "rayo", texto: "Acceso anticipado" },
      ]);
      const sin = await crearConServicio(tx, undefined);
      const repo = planesEnTx(tx);
      return {
        filas: await beneficiosDe(tx, con),
        dto: (await repo.plan(con))?.beneficios,
        sinFilas: await beneficiosDe(tx, sin),
        sinDto: (await repo.plan(sin))?.beneficios,
      };
    });
    const esperados = [
      { icono: "soporte", texto: "Soporte 24 h" },
      { icono: "camion", texto: "Envíos prioritarios" },
      { icono: "rayo", texto: "Acceso anticipado" },
    ];
    expect(r.filas).toEqual(esperados.map((b, posicion) => ({ posicion, ...b })));
    expect(r.dto).toEqual(esperados);
    expect(r.sinFilas).toEqual([]);
    expect(r.sinDto).toEqual([]);
  });

  it("R17: promover el cambio deja la lista del plan igual a la de la versión (texto, ícono y orden), con su rastro", async () => {
    const antes = [
      { icono: "check", texto: "Soporte por correo" },
      { icono: "camion", texto: "Envíos estándar" },
      { icono: "regalo", texto: "Mes de prueba" },
    ];
    const despues = [
      { icono: "camion", texto: "Envíos estándar" },
      { icono: "soporte", texto: "Soporte 24 h" },
    ];
    const r = await revertida(base, async (tx) => {
      const planId = await crearConServicio(tx, antes);
      await programar(tx, planId, { beneficios: despues });
      const trasProgramar = await beneficiosDe(tx, planId);
      const { version, aplicado } = await promover(tx, planId);
      return {
        trasProgramar,
        version,
        aplicado,
        final: await beneficiosDe(tx, planId),
        dto: (await planesEnTx(tx).plan(planId))?.beneficios,
        rastro: await rastroDe(tx, planId),
      };
    });
    expect(r.trasProgramar.map(({ icono, texto }) => ({ icono, texto }))).toEqual(antes);
    expect(r.version).toMatchObject({ beneficios: despues });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.final).toEqual(despues.map((b, posicion) => ({ posicion, ...b })));
    expect(r.dto).toEqual(despues);
    const porAccion = Object.fromEntries(r.rastro.map((f) => [f.accion, f.cambios.beneficios]));
    expect(porAccion.creado).toEqual({ antes: null, despues: antes });
    expect(porAccion.cambio_programado).toEqual({ antes, despues });
    expect(porAccion.cambio_aplicado).toEqual({ antes, despues });
  });

  it("R18: una versión programada sin `beneficios` (como las de antes de la ficha) deja la lista del plan como estaba", async () => {
    const delPlan = [
      { icono: "check", texto: "Soporte por correo" },
      { icono: "estrella", texto: "Gestor de cuenta" },
    ];
    const r = await revertida(base, async (tx) => {
      const planId = await crearConServicio(tx, delPlan);
      // Sin la clave: así se guardaron las versiones de antes de SLT-214.
      await programar(tx, planId, { nombre: `sin beneficios ${randomUUID().slice(0, 6)}` });
      const { version, aplicado } = await promover(tx, planId);
      return {
        version,
        aplicado,
        final: await beneficiosDe(tx, planId),
        rastro: await rastroDe(tx, planId),
      };
    });
    expect(r.version).not.toHaveProperty("beneficios");
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.final).toEqual(delPlan.map((b, posicion) => ({ posicion, ...b })));
    // Ni el programado ni el aplicado cuentan un cambio de beneficios.
    expect(r.rastro.filter((f) => f.accion !== "creado").map((f) => "beneficios" in f.cambios)).toEqual([false, false]);
  });
});
