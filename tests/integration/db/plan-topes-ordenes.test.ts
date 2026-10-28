import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { CreateOrdenData } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { CupoPlanRepository } from "@/lib/repositories/CupoPlanRepository";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type FksDeOrden, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SL-24 / T3 (design §4.3) — el tope de órdenes por ciclo, contado por la base dentro de la
// transacción del alta. R14, R18, R19, R21, R30, más R6 (un plan archivado sigue topando) y R8 (el
// cupo de otra empresa no se lee).
//
// Las órdenes entran por los repositorios REALES de las dos rutas de alta —`createManyOrdenes`
// (carga por pantalla) y `createManyOrdenesConGuia` (API key)— y se anulan por las dos vías reales
// (`softDelete` y `softDeleteViaApi`). `clienteConSavepoint` convierte su `$transaction` en un
// SAVEPOINT de verdad: un rechazo del trigger deshace ese lote y el caso sigue.
//
// Todo corre en una transacción del dueño que SIEMPRE se revierte. El dueño no pasa por la RLS, pero
// el trigger no depende de ella: toma la empresa de la tabla de transición. La vía de `servi_app` con
// SQL a mano se prueba aparte (R18).
//
// Control de no vacuidad: cada caso comprueba que el trigger está en `pg_trigger` y que la empresa
// tiene el plan antes de afirmar un rechazo. Sin trigger, «no se creó ninguna» no probaría nada.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const jobsNoOp = {
  enqueue: async () => null,
  claimBatch: async () => [],
  findByDedupeKeys: async () => [],
  complete: async () => {},
  fail: async () => {},
} as unknown as IJobRepository;

let base: PrismaClient;

interface Empresa {
  id: string;
  fks: FksDeOrden;
  repo: OrdenRepository;
}

/** Una empresa con su tienda y su zona, creadas dentro de la transacción del caso. */
async function empresa(tx: TxDeTest): Promise<Empresa> {
  const { id } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, id);
  const fks = await crearFksDeOrden(tx);
  return { id, fks, repo: new OrdenRepository(clienteConSavepoint(tx), jobsNoOp) };
}

function filas(e: Empresa, n: number): CreateOrdenData[] {
  return Array.from({ length: n }, () => ({
    numRemision: `SL24-${randomUUID().slice(0, 12)}`,
    estatusId: e.fks.estatusId,
    destinatario: "Destinatario SL-24",
    telefonoDest: "88880000",
    tiendaId: e.fks.tiendaId,
    zonaId: e.fks.zonaId,
    provinciaId: e.fks.provinciaId,
    cantonId: e.fks.cantonId,
    distritoId: null,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: null,
    montoCobrar: null,
  }));
}

type Via = "pantalla" | "api";

/** Un alta de `n` órdenes por la ruta real. Devuelve los ids creados o el error tal cual. */
async function alta(tx: TxDeTest, e: Empresa, n: number, via: Via = "pantalla"): Promise<string[] | { error: unknown }> {
  await fijarEmpresa(tx, e.id);
  const datos = filas(e, n);
  const lote = { cargaId: null, usuarioCargaId: e.fks.tiendaId, totalFiles: n, name: null };
  try {
    if (via === "pantalla") {
      await e.repo.createManyOrdenes(datos, 500, { actorUsuarioId: e.fks.tiendaId, origenTipo: "carga_masiva" }, lote);
    } else {
      await e.repo.createManyOrdenesConGuia(datos, 500, { actorUsuarioId: e.fks.tiendaId, origenTipo: "carga_api" }, lote);
    }
  } catch (error) {
    return { error };
  }
  const creadas = await tx.orden.findMany({
    where: { numRemision: { in: datos.map((d) => d.numRemision) } },
    select: { id: true },
  });
  return creadas.map((o) => o.id);
}

function ids(r: string[] | { error: unknown }): string[] {
  if (!Array.isArray(r)) throw new Error(`el alta falló: ${sqlstateDe(r.error)} ${String((r.error as Error).message)}`);
  return r;
}

function tope(r: string[] | { error: unknown }): TopeDelPlanAlcanzado {
  if (Array.isArray(r)) throw new Error(`el alta pasó y creó ${r.length}: se esperaba el tope`);
  const t = traducirErrorDeTope(r.error);
  if (!(t instanceof TopeDelPlanAlcanzado)) throw new Error(`otro error: ${sqlstateDe(r.error)} ${String((r.error as Error).message)}`);
  return t;
}

const vivas = (tx: TxDeTest, organizacionId: string) => tx.orden.count({ where: { organizacionId, deletedAt: null } });

async function controles(tx: TxDeTest, organizacionId: string, planId: string): Promise<void> {
  expect(await triggerActivo(tx, "plan_tope_ordenes", "orden")).toBe(true);
  const org = await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { planId: true } });
  expect(org.planId).toBe(planId);
}

describeSiHayBase("SL-24 — tope de órdenes por ciclo en la base (R14, R18, R19, R21, R30, R6, R8)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it.each<Via>(["pantalla", "api"])(
    "R21 (%s): una carga que pasa el tope no crea ninguna; la que lo deja justo en el tope entra",
    async (via) => {
      const r = await revertida(base, async (tx) => {
        const a = await empresa(tx);
        const plan = await crearPlan(tx, { ordenes: 3 });
        await asignarPlan(tx, a.id, plan);
        await controles(tx, a.id, plan);

        ids(await alta(tx, a, 2, via));
        const rechazo = tope(await alta(tx, a, 2, via));
        const trasRechazo = await vivas(tx, a.id);
        const justo = await alta(tx, a, 1, via);
        return { detalles: rechazo.details, mensaje: rechazo.message, trasRechazo, justo: ids(justo).length, final: await vivas(tx, a.id) };
      });
      expect(r.detalles).toEqual({ codigo: "tope_plan", tope: "ordenes", maximo: 3, usados: 2, pedidas: 2 });
      expect(r.mensaje).toContain("Tu plan permite 3 órdenes por ciclo. Llevas 2 y esta carga trae 2.");
      expect(r.trasRechazo).toBe(2);
      expect(r.justo).toBe(1);
      expect(r.final).toBe(3);
    },
  );

  it("R21: el conteo es por sentencia: un lote de 3 sobre un tope de 3 entra entero; uno más se rechaza", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 3 });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      const lote = ids(await alta(tx, a, 3));
      const uno = tope(await alta(tx, a, 1));
      return { lote: lote.length, uno: uno.details, final: await vivas(tx, a.id) };
    });
    expect(r.lote).toBe(3);
    expect(r.uno).toMatchObject({ maximo: 3, usados: 3, pedidas: 1 });
    expect(r.final).toBe(3);
  });

  it("R19: anular por pantalla y por API libera cupo al momento", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 2 });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      const [o1, o2] = ids(await alta(tx, a, 2));
      tope(await alta(tx, a, 1));

      const porPantalla = await a.repo.softDelete({ ids: [o1], ownerId: null, actorUsuarioId: a.fks.tiendaId });
      const trasPantalla = ids(await alta(tx, a, 1)).length;
      tope(await alta(tx, a, 1));

      const porApi = await a.repo.softDeleteViaApi({
        ordenId: o2,
        ownerId: a.fks.tiendaId,
        estadosPermitidos: ["en_preparacion"],
        actorUsuarioId: a.fks.tiendaId,
      });
      const trasApi = ids(await alta(tx, a, 1)).length;
      return { porPantalla, trasPantalla, porApi, trasApi, final: await vivas(tx, a.id) };
    });
    expect(r).toEqual({ porPantalla: 1, trasPantalla: 1, porApi: 1, trasApi: 1, final: 2 });
  });

  it("R19: una orden del ciclo anterior no cuenta, y anularla no abre cupo en el ciclo en curso", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const [vieja] = ids(await alta(tx, a, 1));
      const plan = await crearPlan(tx, { ordenes: 1 });
      // Alta hace 45 días: el ciclo en curso empezó hace dos semanas largas. La vieja se lleva a un día
      // antes de ese inicio, dentro del ciclo anterior (escrita como dueño).
      await asignarPlan(tx, a.id, plan, "45 days");
      await tx.$executeRawUnsafe(
        `UPDATE "orden" o SET "created_at" = plan_inicio_ciclo(g."plan_ciclo_ancla_at", now()::timestamp) - interval '1 day'
           FROM "organizacion" g WHERE g."id" = o."organizacion_id" AND o."id" = $1`,
        vieja,
      );
      await controles(tx, a.id, plan);
      const enAnterior = await tx.$queryRawUnsafe<{ fuera: boolean }[]>(
        `SELECT o."created_at" < plan_inicio_ciclo(g."plan_ciclo_ancla_at", now()::timestamp)
                AND o."created_at" >= g."plan_ciclo_ancla_at" AS fuera
           FROM "orden" o JOIN "organizacion" g ON g."id" = o."organizacion_id" WHERE o."id" = $1`,
        vieja,
      );

      const nueva = ids(await alta(tx, a, 1)).length;
      const alTope = tope(await alta(tx, a, 1)).details;
      await a.repo.softDelete({ ids: [vieja], ownerId: null, actorUsuarioId: a.fks.tiendaId });
      const trasAnularVieja = tope(await alta(tx, a, 1)).details;
      return { enAnterior: enAnterior[0].fuera, nueva, alTope, trasAnularVieja };
    });
    expect(r.enAnterior).toBe(true);
    expect(r.nueva).toBe(1);
    expect(r.alTope).toMatchObject({ maximo: 1, usados: 1, pedidas: 1 });
    expect(r.trasAnularVieja).toMatchObject({ maximo: 1, usados: 1, pedidas: 1 });
  });

  it("R19: recuperar al tope no se bloquea (no es un alta); la siguiente alta sí, con el uso por encima", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 1 });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      const [o1] = ids(await alta(tx, a, 1));
      await a.repo.softDelete({ ids: [o1], ownerId: null, actorUsuarioId: a.fks.tiendaId });
      ids(await alta(tx, a, 1));
      const recuperadas = await a.repo.restore([o1], a.fks.tiendaId);
      const siguiente = tope(await alta(tx, a, 1)).details;
      return { recuperadas, vivas: await vivas(tx, a.id), siguiente };
    });
    expect(r.recuperadas).toBe(1);
    expect(r.vivas).toBe(2);
    expect(r.siguiente).toMatchObject({ maximo: 1, usados: 2, pedidas: 1 });
  });

  it("R30: A al tope y B con el MISMO plan sigue creando; el uso es por empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const b = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 1 });
      await asignarPlan(tx, a.id, plan);
      await asignarPlan(tx, b.id, plan);
      await controles(tx, a.id, plan);
      await controles(tx, b.id, plan);
      ids(await alta(tx, a, 1));
      tope(await alta(tx, a, 1));
      return { b: ids(await alta(tx, b, 1)).length, enA: await vivas(tx, a.id), enB: await vivas(tx, b.id) };
    });
    expect(r).toEqual({ b: 1, enA: 1, enB: 1 });
  });

  it("R14: una empresa sin plan crea por encima de cualquier tope de otro plan", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const sinPlan = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 1 });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      ids(await alta(tx, a, 1));
      tope(await alta(tx, a, 1));
      const org = await tx.organizacion.findUniqueOrThrow({ where: { id: sinPlan.id }, select: { planId: true } });
      const primera = ids(await alta(tx, sinPlan, 3)).length;
      const segunda = ids(await alta(tx, sinPlan, 3, "api")).length;
      return { planDeLaOtra: org.planId, primera, segunda };
    });
    expect(r).toEqual({ planDeLaOtra: null, primera: 3, segunda: 3 });
  });

  it("sin tope de órdenes (NULL) no hay límite aunque la empresa tenga plan", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: null, porRol: { admin: 1 } });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      return ids(await alta(tx, a, 5)).length;
    });
    expect(r).toBe(5);
  });

  it("R6: un plan archivado sigue topando a la empresa que ya lo tiene", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 1, archivado: true });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      ids(await alta(tx, a, 1));
      return tope(await alta(tx, a, 1)).details;
    });
    expect(r).toMatchObject({ tope: "ordenes", maximo: 1, usados: 1, pedidas: 1 });
  });

  it("R18: un INSERT a mano con servi_app, sin pasar por ningún servicio, también se rechaza", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 1 });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      ids(await alta(tx, a, 1));
      await comoApp(tx, a.id);
      const insertar = () =>
        tx.$executeRawUnsafe(
          `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                                "provincia_id", "canton_id", "producto", "updated_at")
           VALUES ($1, $2, $3, 'Destinatario SL-24', '88880000', $4, $5, $6, $7, 'Caja', now())`,
          randomUUID(),
          `SL24-${randomUUID().slice(0, 12)}`,
          a.fks.estatusId,
          a.fks.tiendaId,
          a.fks.zonaId,
          a.fks.provinciaId,
          a.fks.cantonId,
        );
      const error = await capturar(tx, insertar);
      const rol = await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`);
      const n = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "orden" WHERE "deleted_at" IS NULL`);
      return { sqlstate: sqlstateDe(error), traducido: traducirErrorDeTope(error), rol: rol[0].r, visibles: n[0].n };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.sqlstate).toBe("SL024");
    expect(r.traducido).toBeInstanceOf(TopeDelPlanAlcanzado);
    expect((r.traducido as TopeDelPlanAlcanzado).details).toMatchObject({ maximo: 1, usados: 1, pedidas: 1 });
    expect(r.visibles).toBe(1);
  });

  it("§4.1: el JSON viaja en MESSAGE por las dos formas de error de Prisma (SQL a mano P2010 y operación de modelo)", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 0 });
      await asignarPlan(tx, a.id, plan);
      await controles(tx, a.id, plan);
      const [fila] = filas(a, 1);
      const porModelo = await capturar(tx, () => tx.orden.create({ data: { id: randomUUID(), ...fila } }));
      const aMano = await capturar(tx, () =>
        tx.$executeRawUnsafe(
          `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                                "provincia_id", "canton_id", "producto", "updated_at")
           VALUES ($1, $2, $3, 'x', '88880000', $4, $5, $6, $7, 'Caja', now())`,
          randomUUID(),
          `SL24-${randomUUID().slice(0, 12)}`,
          a.fks.estatusId,
          a.fks.tiendaId,
          a.fks.zonaId,
          a.fks.provinciaId,
          a.fks.cantonId,
        ),
      );
      return { porModelo, aMano };
    });
    const forma = (e: unknown) => {
      const o = e as { name?: string; code?: string; message?: string };
      return { name: o.name, code: o.code, conJson: String(o.message).includes('tope_plan {"tope": "ordenes"') };
    };
    // Las dos formas son distintas (si Prisma unificara, este test lo dice) y las dos traen el JSON.
    expect(forma(r.aMano)).toMatchObject({ code: "P2010", conJson: true });
    expect(forma(r.porModelo).code).not.toBe("P2010");
    for (const e of [r.porModelo, r.aMano]) {
      const t = traducirErrorDeTope(e);
      expect(t).toBeInstanceOf(TopeDelPlanAlcanzado);
      expect((t as TopeDelPlanAlcanzado).details).toEqual({ codigo: "tope_plan", tope: "ordenes", maximo: 0, usados: 0, pedidas: 1 });
    }
  });

  it("R8: plan_cupo_ordenes da a servi_app el cupo de SU empresa; el de otra es 42501; sin plan, nada", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const b = await empresa(tx);
      const sinPlan = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 5 });
      await asignarPlan(tx, a.id, plan);
      await asignarPlan(tx, b.id, plan);
      await controles(tx, a.id, plan);
      ids(await alta(tx, a, 2));
      ids(await alta(tx, b, 1));

      await comoApp(tx, a.id);
      const propio = await tx.$queryRawUnsafe<{ maximo: number; usados: number }[]>(`SELECT * FROM plan_cupo_ordenes($1)`, a.id);
      const deOtra = sqlstateDe(await capturar(tx, () => tx.$queryRawUnsafe(`SELECT * FROM plan_cupo_ordenes($1)`, b.id)));
      const conteoDirecto = sqlstateDe(
        await capturar(tx, () => tx.$queryRawUnsafe(`SELECT plan_uso_ordenes($1, now()::timestamp - interval '1 year')`, a.id)),
      );
      await comoApp(tx, sinPlan.id);
      const vacio = await tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM plan_cupo_ordenes($1)`, sinPlan.id);
      return { propio, deOtra, conteoDirecto, vacio };
    });
    expect(r.propio).toEqual([{ maximo: 5, usados: 2 }]);
    expect(r.deOtra).toBe("42501");
    // Las funciones de conteo no se exponen: solo el dueño y los triggers las llaman.
    expect(r.conteoDirecto).toBe("42501");
    expect(r.vacio).toEqual([]);
  });
  it("T6: CupoPlanRepository lee el cupo de la empresa fijada en app.organizacion_id; sin plan, null", async () => {
    // El SQL real del repositorio (`current_setting('app.organizacion_id', true)`), como servi_app y
    // con la empresa que fija la envoltura de la extensión.
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const b = await empresa(tx);
      const sinPlan = await empresa(tx);
      const plan = await crearPlan(tx, { ordenes: 5 });
      await asignarPlan(tx, a.id, plan);
      await asignarPlan(tx, b.id, plan);
      await controles(tx, a.id, plan);
      ids(await alta(tx, a, 2));
      ids(await alta(tx, b, 1));

      await comoApp(tx, a.id);
      const deA = await new CupoPlanRepository(tx).cupoOrdenes();
      await comoApp(tx, b.id);
      const deB = await new CupoPlanRepository(tx).cupoOrdenes();
      await comoApp(tx, sinPlan.id);
      const vacio = await new CupoPlanRepository(tx).cupoOrdenes();
      return { deA, deB, vacio };
    });
    expect(r.deA).toEqual({ maximo: 5, usados: 2 });
    expect(r.deB).toEqual({ maximo: 5, usados: 1 });
    expect(r.vacio).toBeNull();
  });
});
