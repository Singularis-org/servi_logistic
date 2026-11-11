import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { SQLSTATE_EMPRESA_CRUZADA } from "@/lib/db/contexto-empresa";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-118 · T6.5 (design §1.1, §1.3, §2; R13, R21–R23) — quién lee y quién escribe las facturas de la
// plataforma. La garantía es de la BASE: todo va por SQL a mano, con dos empresas.
//
//   · como `servi_app` (`comoApp`, sin BYPASSRLS): el SELECT devuelve solo las facturas de la empresa del
//     contexto y ninguna sin contexto (la política); INSERT, UPDATE y DELETE → 42501 (el REVOKE), y ninguna
//     función que escribe facturas se puede ejecutar (42501, `REVOKE EXECUTE … FROM PUBLIC`);
//   · como dueño (lo que usa el superadmin, `comoPlataforma`; sin RLS): lee las de las dos empresas, y no
//     cambia una cerrada (SL118, R13) ni la empresa de ninguna (SL017).
//
// Cada empresa: alta el 1 de noviembre con un plan quincenal de 15 500 y el cierre corrido hasta las 00:10
// del 1 de diciembre: dos cerradas con cuota y una en curso. La lectura en curso para la empresa
// (`factura_plataforma_en_curso`, R24) la añade T9.2. Cada caso en una transacción revertida; los rechazos
// van en SAVEPOINT para no abortarla.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Lado {
  id: string;
  cerradas: string[];
  enCurso: string;
}

/** Una empresa con dos facturas cerradas (con cuota) y una en curso, escritas por las funciones del dueño. */
async function lado(tx: TxDeTest, plan: string): Promise<Lado> {
  const { id } = await crearOrganizacion(tx);
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "created_at" = $2::timestamp, "plan_id" = $3, "plan_tipo_cobro" = 'quincenal',
            "plan_ciclo_ancla_at" = $2::timestamp WHERE "id" = $1`,
    id,
    cero("2026-11-01"),
    plan,
  );
  await tx.$queryRawUnsafe(`SELECT factura_plataforma_cerrar($1, $2::timestamp)`, id, "2026-12-01T06:10:00.000Z");
  const filas = await tx.$queryRawUnsafe<{ id: string; estado: string }[]>(
    `SELECT "id", "estado" FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "desde_at"`,
    id,
  );
  if (filas.map((f) => f.estado).join() !== "cerrada,cerrada,en_curso") throw new Error(`siembra inesperada: ${JSON.stringify(filas)}`);
  return { id, cerradas: [filas[0].id, filas[1].id], enCurso: filas[2].id };
}

async function sembrar(tx: TxDeTest): Promise<{ a: Lado; b: Lado }> {
  const plan = await crearPlan(tx);
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = 31000 WHERE "plan_id" = $1`, plan);
  const a = await lado(tx, plan);
  const b = await lado(tx, plan);
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

/** Las facturas de unas empresas, enteras y en texto, leídas como dueño: lo que un cambio a medias movería. */
async function foto(tx: TxDeTest, empresas: string[]): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT f::text AS l FROM "factura_plataforma" f WHERE f."organizacion_id" = ANY($1::text[]) ORDER BY f."id"`,
    empresas,
  );
  return filas.map((f) => f.l);
}

describeSiHayBase("SLT-118 — quién lee y quién escribe las facturas de la plataforma (R13, R21–R23)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R21: la app en la empresa A solo lee las facturas de A, también con SQL a mano; sin contexto, ninguna", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const leer = () =>
        tx.$queryRawUnsafe<{ id: string; organizacion_id: string }[]>(
          `SELECT "id", "organizacion_id" FROM "factura_plataforma" WHERE "organizacion_id" = ANY($1::text[])`,
          [a.id, b.id],
        );
      await comoApp(tx, a.id);
      const enA = await leer();
      const [{ ajenas }] = await tx.$queryRawUnsafe<{ ajenas: number }[]>(
        `SELECT count(*)::int AS ajenas FROM "factura_plataforma" WHERE "organizacion_id" <> $1`,
        a.id,
      );
      const deB = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "factura_plataforma" WHERE "id" = ANY($1::text[])`, [
        ...b.cerradas,
        b.enCurso,
      ]);
      await comoApp(tx, "");
      const sinContexto = await leer();
      const [{ todas }] = await tx.$queryRawUnsafe<{ todas: number }[]>(`SELECT count(*)::int AS todas FROM "factura_plataforma"`);
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { a, enA, ajenas, deB, sinContexto, todas };
    });
    expect(r.enA.map((f) => f.organizacion_id)).toEqual([r.a.id, r.a.id, r.a.id]);
    expect(new Set(r.enA.map((f) => f.id))).toEqual(new Set([...r.a.cerradas, r.a.enCurso]));
    expect(r.ajenas).toBe(0);
    expect(r.deB).toEqual([]);
    expect(r.sinContexto).toEqual([]);
    expect(r.todas).toBe(0);
  });

  it("R21: una factura no cambia de empresa, ni la en curso ni la cerrada, tampoco el dueño: SL017", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const antes = await foto(tx, [a.id, b.id]);
      const enCurso = await intentar(tx, `UPDATE "factura_plataforma" SET "organizacion_id" = $2 WHERE "id" = $1`, a.enCurso, b.id);
      const cerrada = await intentar(tx, `UPDATE "factura_plataforma" SET "organizacion_id" = $2 WHERE "id" = $1`, a.cerradas[0], b.id);
      return { enCurso, cerrada, antes, despues: await foto(tx, [a.id, b.id]) };
    });
    expect({ enCurso: r.enCurso, cerrada: r.cerrada }).toEqual({
      enCurso: SQLSTATE_EMPRESA_CRUZADA,
      cerrada: SQLSTATE_EMPRESA_CRUZADA,
    });
    expect(r.despues).toEqual(r.antes);
  });

  it("R22: la app no inserta, no cambia y no borra facturas, ni las suyas: 42501 sin cambios", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const antes = await foto(tx, [a.id, b.id]);
      await comoApp(tx, a.id);
      const intentos = {
        insertar: await intentar(
          tx,
          `INSERT INTO "factura_plataforma" ("organizacion_id", "estado", "desde_at", "periodicidad")
           VALUES ($1, 'en_curso', '2030-01-01 06:00', 'quincenal')`,
          a.id,
        ),
        actualizar: await intentar(tx, `UPDATE "factura_plataforma" SET "periodicidad" = 'mensual' WHERE "id" = $1`, a.enCurso),
        actualizarCerrada: await intentar(tx, `UPDATE "factura_plataforma" SET "cuota" = 0 WHERE "id" = $1`, a.cerradas[0]),
        borrar: await intentar(tx, `DELETE FROM "factura_plataforma" WHERE "organizacion_id" = $1`, a.id),
      };
      // Control: la app SÍ lee sus filas. Si no pudiera ni leer, el 42501 podría venir de otro sitio.
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "factura_plataforma"`);
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { intentos, n, antes, despues: await foto(tx, [a.id, b.id]) };
    });
    expect(r.intentos).toEqual({ insertar: "42501", actualizar: "42501", actualizarCerrada: "42501", borrar: "42501" });
    expect(r.n).toBe(3);
    expect(r.antes).toHaveLength(6);
    expect(r.despues).toEqual(r.antes);
  });

  it("R22: la app no ejecuta el cierre, la toma de un cambio ni ninguna función que escribe facturas: 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const [{ plan }] = await tx.$queryRawUnsafe<{ plan: string }[]>(`SELECT "plan_id" AS plan FROM "organizacion" WHERE "id" = $1`, a.id);
      const antes = await foto(tx, [a.id, b.id]);
      await comoApp(tx, a.id);
      const llamadas = {
        cerrar: await intentar(tx, `SELECT factura_plataforma_cerrar($1, '2027-06-01 06:10'::timestamp)`, a.id),
        tomarCambio: await intentar(
          tx,
          `SELECT factura_plataforma_tomar_cambio($1, '2026-12-16 06:00'::timestamp, $2, 'quincenal')`,
          a.id,
          plan,
        ),
        avanzar: await intentar(tx, `SELECT factura_plataforma_avanzar($1, '2027-06-01 06:00'::timestamp)`, a.id),
        abrir: await intentar(tx, `SELECT factura_plataforma_abrir($1, '2030-01-01 06:00'::timestamp)`, a.id),
        ordenes: await intentar(
          tx,
          `SELECT * FROM factura_plataforma_ordenes($1, '2026-11-01 06:00'::timestamp, '2026-12-01 06:00'::timestamp)`,
          a.id,
        ),
        cuota: await intentar(
          tx,
          `SELECT * FROM factura_plataforma_cuota($1, '2026-12-16 06:00'::timestamp, $2, 'quincenal', false)`,
          a.id,
          plan,
        ),
      };
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { llamadas, antes, despues: await foto(tx, [a.id, b.id]) };
    });
    expect(r.llamadas).toEqual({
      cerrar: "42501",
      tomarCambio: "42501",
      avanzar: "42501",
      abrir: "42501",
      ordenes: "42501",
      cuota: "42501",
    });
    expect(r.despues).toEqual(r.antes);
  });

  it("R23: la plataforma (el dueño, como el superadmin) lee las facturas de las dos empresas", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; estado: string }[]>(
        `SELECT "organizacion_id", "estado" FROM "factura_plataforma" WHERE "organizacion_id" = ANY($1::text[])`,
        [a.id, b.id],
      );
      return { a, b, filas };
    });
    for (const id of [r.a.id, r.b.id]) {
      expect(r.filas.filter((f) => f.organizacion_id === id).map((f) => f.estado).sort()).toEqual([
        "cerrada",
        "cerrada",
        "en_curso",
      ]);
    }
  });

  it("R13: nadie cambia una factura cerrada, tampoco el dueño: SL118 sin cambiar nada", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const antes = await foto(tx, [a.id, b.id]);
      const [cerrada] = a.cerradas;
      const cambios = {
        cuota: await intentar(tx, `UPDATE "factura_plataforma" SET "cuota" = 0, "total" = "total_ordenes" WHERE "id" = $1`, cerrada),
        cargos: await intentar(tx, `UPDATE "factura_plataforma" SET "cargos" = "cargos" + 1 WHERE "id" = $1`, cerrada),
        numero: await intentar(tx, `UPDATE "factura_plataforma" SET "numero" = 99 WHERE "id" = $1`, cerrada),
        reabrir: await intentar(
          tx,
          `UPDATE "factura_plataforma" SET "estado" = 'por_cerrar', "numero" = NULL, "cargos" = NULL, "reversos" = NULL,
                  "total_ordenes" = NULL, "movimientos" = NULL, "total" = NULL, "cerrada_at" = NULL WHERE "id" = $1`,
          cerrada,
        ),
        fechas: await intentar(tx, `UPDATE "factura_plataforma" SET "hasta_at" = "hasta_at" + interval '1 day' WHERE "id" = $1`, cerrada),
        marca: await intentar(tx, `UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = "desde_at" WHERE "id" = $1`, cerrada),
        mismoValor: await intentar(tx, `UPDATE "factura_plataforma" SET "total" = "total" WHERE "organizacion_id" = $1 AND "estado" = 'cerrada'`, b.id),
      };
      // Y la app, aunque la fila sea suya: la frena antes el REVOKE.
      await comoApp(tx, a.id);
      const app = await intentar(tx, `UPDATE "factura_plataforma" SET "cuota" = 0 WHERE "id" = $1`, cerrada);
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { cambios, app, antes, despues: await foto(tx, [a.id, b.id]) };
    });
    expect(r.cambios).toEqual({
      cuota: "SL118",
      cargos: "SL118",
      numero: "SL118",
      reabrir: "SL118",
      fechas: "SL118",
      marca: "SL118",
      mismoValor: "SL118",
    });
    expect(r.app).toBe("42501");
    expect(r.antes).toHaveLength(6);
    expect(r.despues).toEqual(r.antes);
  });
});
