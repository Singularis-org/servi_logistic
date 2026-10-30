import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { comoApp, datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-24 / T1 (design §2.4, §2.5) — una empresa no lee ni escribe planes, sus topes, sus módulos ni su
// rastro, ni escribe su propia asignación, por ninguna vía (R8). Y ve solo su asignación, nunca la de
// otra (R30).
//
// POR QUE `comoApp`. La conexión del test es la del dueño: con ella no cuentan ni la RLS ni los
// privilegios. `comoApp` baja la transacción a `servi_app`, como hace la app; el cliente de la app
// (`conAislamientoPorEmpresa` + `conEmpresa`) prueba además la vía por modelo.
//
// SIEMBRA OBLIGATORIA. A y B, un custom de A asignado a A con su tope, su módulo y una fila de rastro,
// y un público asignado a B, se commitean en `beforeAll` como dueño y se COMPRUEBAN: si no están, el
// archivo entero falla. Un 42501 sobre una tabla vacía diría lo mismo, pero «B no ve el plan de A»
// necesita que A tenga uno.
//
// T3b (design §16.1): la misma regla para `plan_cambio_programado`, el cambio pendiente de un plan.
// La siembra le añade una fila, programada sobre el custom de A.
//
// Lo que queda para T3: `plan_cupo_ordenes` con la empresa de otro (`42501`) se prueba cuando exista la
// función (design §4.2).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let app: PrismaClient;
let A: string;
let B: string;
let planA: string;
let planB: string;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transacción del dueño que siempre se revierte. El lock de aviso de la 227 va primero. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** SQLSTATE de un error de SQL a mano por Prisma 7 + adapter-pg (P2010 con la causa del driver). */
function sqlstateDe(e: unknown): string {
  const o = e as { message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } };
  const causa = o.meta?.driverAdapterError?.cause;
  return (
    causa?.originalCode ??
    causa?.code ??
    /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ??
    `?? ${String(o.message ?? e).slice(0, 160)}`
  );
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transacción del caso. SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$queryRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

/** Lo que el dueño ve de la siembra: si cambia, alguna escritura de `servi_app` pasó. */
async function foto(c: PrismaClient | TxDeTest) {
  const planes = await c.plan.findMany({
    where: { id: { in: [planA, planB] } },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      topeOrdenesCiclo: true,
      archivadoAt: true,
      topesPorRol: { select: { rol: true, maximo: true } },
      modulos: { select: { modulo: true } },
    },
  });
  const rastro = await c.planRastro.count({ where: { planId: { in: [planA, planB] } } });
  const cambios = await c.planCambioProgramado.findMany({
    where: { planId: { in: [planA, planB] } },
    select: { id: true, planId: true, vigenteDesde: true, version: true },
  });
  const empresas = await c.organizacion.findMany({
    where: { id: { in: [A, B] } },
    orderBy: { id: "asc" },
    select: { id: true, planId: true, planCicloAnclaAt: true },
  });
  return { planes, rastro, cambios, empresas };
}

const TABLAS = ["plan", "plan_tope_rol", "plan_modulo", "plan_rastro", "plan_cambio_programado"] as const;

describeSiHayBase("SL-24 — planes sin acceso para servi_app; asignación de solo lectura y por empresa (R8, R30)", () => {
  let antes: Awaited<ReturnType<typeof foto>>;

  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    await bajoLockDeEscrituraReal(async () => {
      A = (await base.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } })).id;
      B = (await base.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } })).id;
      planA = (
        await base.plan.create({
          data: {
            nombre: `sl24 acceso custom A ${randomUUID().slice(0, 8)}`,
            visibilidad: "custom",
            organizacionExclusivaId: A,
            topeOrdenesCiclo: 100,
            topesPorRol: { create: [{ rol: "adminTienda", maximo: 3 }] },
            modulos: { create: [{ modulo: "analitica" }] },
          },
          select: { id: true },
        })
      ).id;
      planB = (
        await base.plan.create({
          data: { nombre: `sl24 acceso publico B ${randomUUID().slice(0, 8)}`, visibilidad: "publico", topeOrdenesCiclo: 5 },
          select: { id: true },
        })
      ).id;
      await base.planRastro.create({
        data: {
          planId: planA,
          planNombre: "custom A",
          accion: "creado",
          cambios: { nombre: { antes: null, despues: "custom A" } },
          actorUsuarioId: randomUUID(),
          actorNombre: "Superadmin de prueba",
        },
      });
      await base.planCambioProgramado.create({
        data: {
          planId: planA,
          vigenteDesde: new Date("2099-01-01T06:00:00.000Z"),
          version: { nombre: "custom A v2", topeOrdenesCiclo: 50 },
          avisosAlProgramar: [],
          actorUsuarioId: randomUUID(),
          actorNombre: "Superadmin de prueba",
        },
      });
      const ancla = new Date("2026-10-15T12:00:00.000Z");
      await base.organizacion.update({ where: { id: A }, data: { planId: planA, planCicloAnclaAt: ancla } });
      await base.organizacion.update({ where: { id: B }, data: { planId: planB, planCicloAnclaAt: ancla } });
    });
    antes = await foto(base);
    expect(antes.planes).toHaveLength(2);
    expect(antes.rastro).toBe(1);
    expect(antes.cambios.map((c) => c.planId)).toEqual([planA]);
    expect(antes.empresas.map((e) => e.planId).sort()).toEqual([planA, planB].sort());
    expect(antes.planes.find((p) => p.id === planA)?.topesPorRol).toEqual([{ rol: "adminTienda", maximo: 3 }]);
    expect(antes.planes.find((p) => p.id === planA)?.modulos).toEqual([{ modulo: "analitica" }]);
  }, 60_000);

  afterAll(async () => {
    if (!base) return;
    await bajoLockDeEscrituraReal(async () => {
      // El custom de A cae con A (CASCADE); el público hay que soltarlo de B y borrarlo a mano.
      await base.organizacion.updateMany({ where: { id: { in: [A, B].filter(Boolean) } }, data: { planId: null, planCicloAnclaAt: null } });
      await base.planRastro.deleteMany({ where: { planId: { in: [planA, planB].filter(Boolean) } } });
      await base.plan.deleteMany({ where: { id: { in: [planA, planB].filter(Boolean) } } });
      await base.organizacion.deleteMany({ where: { id: { in: [A, B].filter(Boolean) } } });
    });
    await base.$disconnect();
  }, 120_000);

  it("R8 — control: el dueño sí lee las cinco tablas (el 42501 de abajo es de privilegios, no de una tabla ausente)", async () => {
    await revertida(async (tx) => {
      for (const t of TABLAS) {
        expect(await intentar(tx, `SELECT 1 FROM "${t}" LIMIT 1`), t).toBeNull();
      }
    });
  });

  it("R8 — SQL a mano con servi_app: SELECT de las cinco tablas da 42501, aun filtrando por el plan propio", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, A);
      const salida: Record<string, string | null> = {};
      for (const t of TABLAS) salida[t] = await intentar(tx, `SELECT * FROM "${t}"`);
      salida.planPropio = await intentar(tx, `SELECT * FROM "plan" WHERE "id" = $1`, planA);
      salida.topesPropios = await intentar(tx, `SELECT * FROM "plan_tope_rol" WHERE "plan_id" = $1`, planA);
      salida.cambioPropio = await intentar(tx, `SELECT * FROM "plan_cambio_programado" WHERE "plan_id" = $1`, planA);
      return salida;
    });
    expect(r).toEqual({
      plan: "42501",
      plan_tope_rol: "42501",
      plan_modulo: "42501",
      plan_rastro: "42501",
      plan_cambio_programado: "42501",
      planPropio: "42501",
      topesPropios: "42501",
      cambioPropio: "42501",
    });
  });

  it("R8 — SQL a mano con servi_app: INSERT, UPDATE y DELETE en las cinco tablas dan 42501 y nada cambia", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, A);
      return {
        insertPlan: await intentar(
          tx,
          `INSERT INTO "plan" ("id", "nombre", "visibilidad") VALUES ($1, 'Mi plan', 'publico')`,
          randomUUID(),
        ),
        updatePlan: await intentar(tx, `UPDATE "plan" SET "tope_ordenes_ciclo" = NULL WHERE "id" = $1`, planA),
        deletePlan: await intentar(tx, `DELETE FROM "plan" WHERE "id" = $1`, planA),
        insertTope: await intentar(
          tx,
          `INSERT INTO "plan_tope_rol" ("plan_id", "rol", "maximo") VALUES ($1, 'admin', 99)`,
          planA,
        ),
        updateTope: await intentar(tx, `UPDATE "plan_tope_rol" SET "maximo" = 99 WHERE "plan_id" = $1`, planA),
        deleteTope: await intentar(tx, `DELETE FROM "plan_tope_rol" WHERE "plan_id" = $1`, planA),
        insertModulo: await intentar(tx, `INSERT INTO "plan_modulo" ("plan_id", "modulo") VALUES ($1, 'monitoreo')`, planA),
        updateModulo: await intentar(tx, `UPDATE "plan_modulo" SET "modulo" = 'monitoreo' WHERE "plan_id" = $1`, planA),
        deleteModulo: await intentar(tx, `DELETE FROM "plan_modulo" WHERE "plan_id" = $1`, planA),
        insertRastro: await intentar(
          tx,
          `INSERT INTO "plan_rastro" ("id", "plan_id", "plan_nombre", "accion", "cambios", "actor_usuario_id", "actor_nombre")
           VALUES ($1, $2, 'x', 'editado', '{}'::jsonb, 'x', 'x')`,
          randomUUID(),
          planA,
        ),
        updateRastro: await intentar(tx, `UPDATE "plan_rastro" SET "plan_nombre" = 'x' WHERE "plan_id" = $1`, planA),
        deleteRastro: await intentar(tx, `DELETE FROM "plan_rastro" WHERE "plan_id" = $1`, planA),
        insertCambio: await intentar(
          tx,
          `INSERT INTO "plan_cambio_programado"
             ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar", "actor_usuario_id", "actor_nombre")
           VALUES ($1, $2, '2099-02-01 06:00:00', '{}'::jsonb, '[]'::jsonb, 'x', 'x')`,
          randomUUID(),
          planB,
        ),
        updateCambio: await intentar(
          tx,
          `UPDATE "plan_cambio_programado" SET "vigente_desde" = CURRENT_TIMESTAMP WHERE "plan_id" = $1`,
          planA,
        ),
        deleteCambio: await intentar(tx, `DELETE FROM "plan_cambio_programado" WHERE "plan_id" = $1`, planA),
      };
    });
    for (const [caso, sqlstate] of Object.entries(r)) expect(sqlstate, caso).toBe("42501");
    expect(await foto(base)).toEqual(antes);
  });

  it("R8 — servi_app no escribe su propia asignación: cambiar o quitar el plan y mover el ancla dan 42501", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, A);
      return {
        quitarPlan: await intentar(tx, `UPDATE "organizacion" SET "plan_id" = NULL, "plan_ciclo_ancla_at" = NULL WHERE "id" = $1`, A),
        cambiarPlan: await intentar(tx, `UPDATE "organizacion" SET "plan_id" = $1 WHERE "id" = $2`, planB, A),
        moverAncla: await intentar(tx, `UPDATE "organizacion" SET "plan_ciclo_ancla_at" = CURRENT_TIMESTAMP WHERE "id" = $1`, A),
        asignarAOtra: await intentar(tx, `UPDATE "organizacion" SET "plan_id" = $1 WHERE "id" = $2`, planA, B),
      };
    });
    for (const [caso, sqlstate] of Object.entries(r)) expect(sqlstate, caso).toBe("42501");
    expect(await foto(base)).toEqual(antes);
  });

  it("R8 — por el cliente de la app en contexto de empresa: leer o escribir planes se rechaza y la base no cambia", async () => {
    const rechazo = /42501|permiso denegado|permission denied/;
    await expect(conEmpresa(A, () => app.plan.findMany())).rejects.toThrow(rechazo);
    await expect(conEmpresa(A, () => app.planTopeRol.findMany())).rejects.toThrow(rechazo);
    await expect(conEmpresa(A, () => app.planModulo.findMany())).rejects.toThrow(rechazo);
    await expect(conEmpresa(A, () => app.planRastro.findMany())).rejects.toThrow(rechazo);
    await expect(conEmpresa(A, () => app.planCambioProgramado.findMany())).rejects.toThrow(rechazo);
    await expect(
      conEmpresa(A, () => app.planCambioProgramado.deleteMany({ where: { planId: planA } })),
    ).rejects.toThrow(rechazo);
    await expect(
      conEmpresa(A, () => app.plan.create({ data: { nombre: "Mi plan", visibilidad: "publico" } })),
    ).rejects.toThrow(rechazo);
    await expect(
      conEmpresa(A, () => app.organizacion.update({ where: { id: A }, data: { planId: planB } })),
    ).rejects.toThrow(rechazo);
    expect(await foto(base)).toEqual(antes);
  });

  it("R30 — cada empresa ve solo su asignación: A lee su plan_id y no la fila de B, aunque la pida por id", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, A);
      const visibles = await tx.$queryRawUnsafe<{ id: string; plan_id: string | null }[]>(
        `SELECT "id", "plan_id" FROM "organizacion"`,
      );
      const deB = await tx.$queryRawUnsafe<unknown[]>(`SELECT "plan_id" FROM "organizacion" WHERE "id" = $1`, B);
      return { visibles, deB };
    });
    expect(r.visibles).toEqual([{ id: A, plan_id: planA }]);
    expect(r.deB).toEqual([]);

    const porModelo = await conEmpresa(B, () =>
      app.organizacion.findMany({ select: { id: true, planId: true } }),
    );
    expect(porModelo).toEqual([{ id: B, planId: planB }]);
  });
});
