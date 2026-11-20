import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { SQLSTATE_EMPRESA_CRUZADA } from "@/lib/db/contexto-empresa";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { anular, asignar, crearEmpresa, crearOrden, crearPlanConCosto } from "./_fixtures/cobro-porcentual";
import { revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-85 (design §1.3, §6; R21–R24, R26) — quién lee y quién escribe la traza de facturación. La garantía
// es de la BASE: todo va por SQL a mano, con dos empresas.
//
//   · como `servi_app` (`comoApp`, sin BYPASSRLS): el SELECT devuelve solo las filas de la empresa del
//     contexto, y ninguna sin contexto (la política); INSERT, UPDATE y DELETE → 42501 (el REVOKE);
//   · como dueño (lo que usa el superadmin, `comoPlataforma`; sin RLS): lee las dos empresas; un UPDATE →
//     SL085 (trigger de inmutabilidad, P3); una traza de A que apunta a una orden, un movimiento o una
//     traza de B → SL017 (triggers de misma empresa), y cambiarle la empresa → SL017.
//
// La traza de control la escribe el trigger de verdad: cada empresa tiene un plan fijo de 100 y una orden
// anulada (un cargo y un reverso). Cada caso en una transacción revertida; los rechazos van en SAVEPOINT
// para no abortarla.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Lado {
  id: string;
  orden: string;
  movCargo: string;
  movReverso: string;
  trazaCargo: string;
  trazaReverso: string;
}

/** Una empresa con plan fijo de 100 y una orden anulada: dos movimientos y sus dos trazas. */
async function lado(tx: TxDeTest): Promise<Lado> {
  const e = await crearEmpresa(tx);
  await asignar(tx, e, await crearPlanConCosto(tx, { fijo: "100" }));
  const orden = await crearOrden(tx, e);
  await anular(tx, orden, true);
  const filas = await tx.$queryRawUnsafe<{ mov: string; traza: string; tipo: string }[]>(
    `SELECT m."id" AS mov, t."id" AS traza, m."tipo"::text AS tipo
       FROM "cobro_plataforma_movimiento" m JOIN "cobro_plataforma_traza" t ON t."movimiento_id" = m."id"
      WHERE m."orden_id" = $1 ORDER BY m."secuencia"`,
    orden,
  );
  if (filas.map((f) => f.tipo).join() !== "cargo,reverso") throw new Error(`siembra inesperada: ${JSON.stringify(filas)}`);
  return { id: e.id, orden, movCargo: filas[0].mov, movReverso: filas[1].mov, trazaCargo: filas[0].traza, trazaReverso: filas[1].traza };
}

async function sembrar(tx: TxDeTest): Promise<{ a: Lado; b: Lado }> {
  const a = await lado(tx);
  const b = await lado(tx);
  await fijarEmpresa(tx, "");
  return { a, b };
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transacción del caso. El SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

/** Las filas de traza de unas órdenes, enteras y en texto: lo que un cambio a medias movería. */
async function foto(tx: TxDeTest, ordenes: string[]): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT t::text AS l FROM "cobro_plataforma_traza" t WHERE t."orden_id" = ANY($1::text[]) ORDER BY t."id"`,
    ordenes,
  );
  return filas.map((f) => f.l);
}

/** INSERT de una traza a mano, válida salvo por lo que se pida. */
function insertarTraza(over: { organizacion: string; orden: string; movimiento: string; reversoDe?: string }) {
  const reverso = over.reversoDe !== undefined;
  return [
    `INSERT INTO "cobro_plataforma_traza" ("id", "organizacion_id", "orden_id", "movimiento_id", "tipo_movimiento",
       "reverso_de", "tipo_cobro", "fuente", "valor_fijo", "valor_cobrado", "cobrado_at")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4::cobro_plataforma_tipo, $5, 'fijo', 'plan', 100.00, $6::numeric,
             now() AT TIME ZONE 'UTC')`,
    over.organizacion,
    over.orden,
    over.movimiento,
    reverso ? "reverso" : "cargo",
    over.reversoDe ?? null,
    reverso ? "-100.00" : "100.00",
  ] as const;
}

describeSiHayBase("SLT-85 — quién lee y quién escribe la traza de facturación (R21–R24, R26)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R21 — la app en la empresa A solo lee las de A; sin contexto, ninguna", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const leer = () =>
        tx.$queryRawUnsafe<{ id: string; organizacion_id: string }[]>(
          `SELECT "id", "organizacion_id" FROM "cobro_plataforma_traza" WHERE "orden_id" = ANY($1::text[]) ORDER BY "cobrado_at", "id"`,
          [a.orden, b.orden],
        );
      await comoApp(tx, a.id);
      const enA = await leer();
      const [{ total }] = await tx.$queryRawUnsafe<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM "cobro_plataforma_traza" WHERE "organizacion_id" <> $1`,
        a.id,
      );
      await comoApp(tx, "");
      const sinContexto = await leer();
      const [{ todas }] = await tx.$queryRawUnsafe<{ todas: number }[]>(`SELECT count(*)::int AS todas FROM "cobro_plataforma_traza"`);
      return { a, enA, total, sinContexto, todas };
    });
    expect(r.enA.map((f) => f.organizacion_id)).toEqual([r.a.id, r.a.id]);
    expect(new Set(r.enA.map((f) => f.id))).toEqual(new Set([r.a.trazaCargo, r.a.trazaReverso]));
    expect(r.total).toBe(0);
    expect(r.sinContexto).toEqual([]);
    expect(r.todas).toBe(0);
  });

  it("R22 — la plataforma lee las de las dos empresas", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const filas = await tx.$queryRawUnsafe<{ organizacion_id: string }[]>(
        `SELECT "organizacion_id" FROM "cobro_plataforma_traza" WHERE "orden_id" = ANY($1::text[])`,
        [a.orden, b.orden],
      );
      return { a, b, filas };
    });
    expect(r.filas.map((f) => f.organizacion_id).sort()).toEqual([r.a.id, r.a.id, r.b.id, r.b.id].sort());
  });

  it("R23 — la app no inserta, no cambia y no borra: 42501 sin cambios", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const antes = await foto(tx, [a.orden, b.orden]);
      // Una traza nueva para un movimiento de A sin traza: el dueño la quita antes de bajar a la app.
      await tx.$executeRawUnsafe(`ALTER TABLE "cobro_plataforma_movimiento" DISABLE TRIGGER "cobro_plataforma_traza_al_registrar"`);
      await fijarEmpresa(tx, a.id);
      await tx.$executeRawUnsafe(
        `INSERT INTO "cobro_plataforma_movimiento" ("id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
         VALUES ($1, $2, 3, 'cargo', 'plan', 100.00, now() AT TIME ZONE 'UTC')`,
        `slt85-${randomUUID()}`,
        a.orden,
      );
      await tx.$executeRawUnsafe(`ALTER TABLE "cobro_plataforma_movimiento" ENABLE TRIGGER "cobro_plataforma_traza_al_registrar"`);
      const [{ id: movSinTraza }] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 AND "secuencia" = 3`,
        a.orden,
      );
      await comoApp(tx, a.id);
      const insertar = await intentar(tx, ...insertarTraza({ organizacion: a.id, orden: a.orden, movimiento: movSinTraza }));
      const actualizar = await intentar(tx, `UPDATE "cobro_plataforma_traza" SET "valor_cobrado" = 0 WHERE "orden_id" = $1`, a.orden);
      const borrar = await intentar(tx, `DELETE FROM "cobro_plataforma_traza" WHERE "orden_id" = $1`, a.orden);
      // Control: la app SÍ lee sus filas. Si no pudiera ni leer, el 42501 podría venir de otro sitio.
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "cobro_plataforma_traza" WHERE "orden_id" = $1`,
        a.orden,
      );
      await tx.$executeRawUnsafe(`RESET ROLE`);
      const [{ sinTraza }] = await tx.$queryRawUnsafe<{ sinTraza: number }[]>(
        `SELECT count(*)::int AS "sinTraza" FROM "cobro_plataforma_traza" WHERE "movimiento_id" = $1`,
        movSinTraza,
      );
      return { insertar, actualizar, borrar, n, sinTraza, antes, despues: await foto(tx, [a.orden, b.orden]) };
    });
    expect({ insertar: r.insertar, actualizar: r.actualizar, borrar: r.borrar }).toEqual({
      insertar: "42501",
      actualizar: "42501",
      borrar: "42501",
    });
    expect(r.n).toBe(2);
    expect(r.sinTraza).toBe(0);
    expect(r.antes).toHaveLength(4);
    expect(r.despues).toEqual(r.antes);
  });

  it("R24 — nadie cambia una fila, tampoco el dueño: SL085", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const antes = await foto(tx, [a.orden, b.orden]);
      const cambios = {
        valor: await intentar(tx, `UPDATE "cobro_plataforma_traza" SET "valor_cobrado" = 0 WHERE "id" = $1`, a.trazaCargo),
        guia: await intentar(tx, `UPDATE "cobro_plataforma_traza" SET "num_guia" = 1 WHERE "id" = $1`, a.trazaCargo),
        reconstruido: await intentar(tx, `UPDATE "cobro_plataforma_traza" SET "reconstruido" = true WHERE "id" = $1`, b.trazaReverso),
        mismoValor: await intentar(tx, `UPDATE "cobro_plataforma_traza" SET "fuente" = "fuente" WHERE "orden_id" = $1`, b.orden),
      };
      // Y la app, aunque la fila sea suya: la frena antes el REVOKE.
      await comoApp(tx, a.id);
      const app = await intentar(tx, `UPDATE "cobro_plataforma_traza" SET "valor_cobrado" = 0 WHERE "id" = $1`, a.trazaCargo);
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { cambios, app, antes, despues: await foto(tx, [a.orden, b.orden]) };
    });
    expect(r.cambios).toEqual({ valor: "SL085", guia: "SL085", reconstruido: "SL085", mismoValor: "SL085" });
    expect(r.app).toBe("42501");
    expect(r.antes).toHaveLength(4);
    expect(r.despues).toEqual(r.antes);
  });

  it("R26 — una traza no apunta a orden, movimiento ni traza de otra empresa ni cambia de empresa: SL017", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const antes = await foto(tx, [a.orden, b.orden]);
      const ordenDeB = await intentar(tx, ...insertarTraza({ organizacion: a.id, orden: b.orden, movimiento: a.movCargo }));
      const movimientoDeB = await intentar(tx, ...insertarTraza({ organizacion: a.id, orden: a.orden, movimiento: b.movCargo }));
      const trazaDeB = await intentar(
        tx,
        ...insertarTraza({ organizacion: a.id, orden: a.orden, movimiento: a.movReverso, reversoDe: b.trazaCargo }),
      );
      const cambiaDeEmpresa = await intentar(
        tx,
        `UPDATE "cobro_plataforma_traza" SET "organizacion_id" = $2 WHERE "id" = $1`,
        a.trazaCargo,
        b.id,
      );
      // Control: la misma traza con todo de A pasa los triggers de empresa y choca con el único de R1.
      const todoDeA = await intentar(
        tx,
        ...insertarTraza({ organizacion: a.id, orden: a.orden, movimiento: a.movReverso, reversoDe: a.trazaCargo }),
      );
      return { ordenDeB, movimientoDeB, trazaDeB, cambiaDeEmpresa, todoDeA, antes, despues: await foto(tx, [a.orden, b.orden]) };
    });
    expect({ ordenDeB: r.ordenDeB, movimientoDeB: r.movimientoDeB, trazaDeB: r.trazaDeB, cambiaDeEmpresa: r.cambiaDeEmpresa }).toEqual({
      ordenDeB: SQLSTATE_EMPRESA_CRUZADA,
      movimientoDeB: SQLSTATE_EMPRESA_CRUZADA,
      trazaDeB: SQLSTATE_EMPRESA_CRUZADA,
      cambiaDeEmpresa: SQLSTATE_EMPRESA_CRUZADA,
    });
    expect(r.todoDeA).toBe("23505");
    expect(r.despues).toEqual(r.antes);
  });
});
