import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-58 / T1 (design §2) — `plan_de_la_empresa(text)`: la única lectura del plan que una empresa
// puede hacer. Lo que se mide aquí es el SQL REAL de la migración contra Postgres, como `servi_app`
// (`comoApp`), que es como llama la app:
//
// - R2: el uso que devuelve es exactamente el de `plan_uso_*` y `plan_inicio_ciclo_en_curso` (los de
//   los triggers desde SLT-58 §11.2), comparado en la MISMA transacción y además con números
//   concretos sembrados.
// - R6: una empresa sin plan recibe `NULL`.
// - R9: la propia se lee; la de otra y sin contexto dan 42501; las tablas `plan*` siguen cerradas;
//   del cambio programado no salen `avisos_al_programar` ni el actor.
// - R25: la función es STABLE (no escribe), y corre en una transacción de solo lectura.
// - R26: el nombre en español sale de `pg_proc`; el `down.sql` real la quita y el ROLLBACK la deja.
//
// Todo corre en una transacción del dueño que SIEMPRE se revierte (`revertida`, con el lock de la 227).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const DOWN_SQL = join(process.cwd(), "db/migrations/20261029120000_plan_de_la_empresa/down.sql");

/** Nombres que NO pueden salir en la respuesta (R9): el actor y la empresa que nombran los avisos. */
const ACTOR = `Superadmin SLT58 ${randomUUID().slice(0, 8)}`;
const OTRA_EMPRESA_EN_AVISOS = `Empresa ajena SLT58 ${randomUUID().slice(0, 8)}`;

let base: PrismaClient;

interface Escenario {
  A: string;
  B: string;
  planA: string;
  actorId: string;
}

/**
 * A con un custom (precio, topes, un módulo y un cambio programado con avisos y actor), asignado una
 * hora atrás, con 3 órdenes vivas y 1 borrada en el ciclo, un maestro y un admin de tienda activos y un
 * admin pendiente (no cuenta). B sin plan. Se deja la empresa del contexto en A.
 */
async function escenario(tx: TxDeTest): Promise<Escenario> {
  const { id: A } = await crearOrganizacion(tx);
  const { id: B } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, A);

  const planA = await crearPlan(tx, {
    custom: A,
    ordenes: 1000,
    apiKeys: 4,
    porRol: { maestro: 2, adminTienda: 5 },
  });
  await tx.plan.update({
    where: { id: planA },
    data: {
      precioMensual: "49.90",
      descuentoAnualPct: "16.67",
      modulos: { create: [{ modulo: "analitica" }] },
    },
  });
  const actorId = randomUUID();
  await tx.planCambioProgramado.create({
    data: {
      planId: planA,
      vigenteDesde: new Date("2099-01-01T06:00:00.000Z"),
      version: { nombre: "custom A v2", topeOrdenesCiclo: 50 },
      avisosAlProgramar: [{ organizacionId: B, nombre: OTRA_EMPRESA_EN_AVISOS }],
      actorUsuarioId: actorId,
      actorNombre: ACTOR,
    },
  });
  await asignarPlan(tx, A, planA);

  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx); // crea un admin de tienda activo
  await crearUsuarioDePrueba(tx, "maestro");
  const pendiente = await crearUsuarioDePrueba(tx, "admin");
  await tx.usuario.update({ where: { id: pendiente.id }, data: { estado: "pendiente" } });
  for (let i = 0; i < 4; i++) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                            "provincia_id", "canton_id", "producto", "updated_at", "created_at", "deleted_at")
       VALUES ($1, $2, $3, 'Destinatario SLT-58', '88880000', $4, $5, $6, $7, 'Caja', now(), now() AT TIME ZONE 'UTC',
               CASE WHEN $8 THEN now() AT TIME ZONE 'UTC' END)`,
      randomUUID(),
      `SLT58-${randomUUID().slice(0, 12)}`,
      fks.estatusId,
      fks.tiendaId,
      fks.zonaId,
      fks.provinciaId,
      fks.cantonId,
      i === 3,
    );
  }
  return { A, B, planA, actorId };
}

/** El JSON de la función tal cual llega por Prisma (jsonb ya parseado, o texto si el driver no lo hace). */
async function leerPlan(tx: TxDeTest, organizacionId: string): Promise<Record<string, unknown> | null> {
  const filas = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, organizacionId);
  const v = filas[0]?.plan ?? null;
  return (typeof v === "string" ? JSON.parse(v) : v) as Record<string, unknown> | null;
}

/**
 * Lo que dicen las funciones de los triggers de A, como dueño y con el mismo `now()` de la
 * transacción. Desde SLT-58 §11.2 (R33, R34, R41) el ciclo en curso es `plan_inicio_ciclo_en_curso`,
 * la envoltura que usan el trigger y el cupo; sin ciclo corto da lo mismo que `plan_inicio_ciclo`.
 */
async function usoSegunLosTriggers(tx: TxDeTest, A: string) {
  const filas = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT plan_uso_ordenes(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", now() AT TIME ZONE 'UTC')) AS ordenes,
            plan_uso_api_keys(o."id") AS api_keys,
            plan_uso_rol(o."id", 'maestro'::rol_value) AS maestro,
            plan_uso_rol(o."id", 'admin'::rol_value) AS admin,
            plan_uso_rol(o."id", 'mensajero'::rol_value) AS mensajero,
            plan_uso_rol(o."id", 'Admin Tienda'::rol_value) AS admin_tienda,
            plan_uso_rol(o."id", 'adminSatelite'::rol_value) AS admin_satelite,
            to_jsonb(plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", now() AT TIME ZONE 'UTC')) #>> '{}' AS ciclo_inicio,
            to_jsonb(o."plan_ciclo_ancla_at") #>> '{}' AS ciclo_ancla,
            to_jsonb(o."plan_ciclo_corto_desde_at") #>> '{}' AS ciclo_corto_desde
       FROM "organizacion" o WHERE o."id" = $1`,
    A,
  );
  const { ciclo_inicio, ciclo_ancla, ciclo_corto_desde, ...uso } = filas[0];
  return { uso, ciclo_inicio, ciclo_ancla, ciclo_corto_desde };
}

async function funcionesConElNombre(c: Pick<TxDeTest, "$queryRawUnsafe">): Promise<number> {
  const filas = await c.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'plan_de_la_empresa' AND n.nspname = 'public'`,
  );
  return filas[0].n;
}

describeSiHayBase("SLT-58 — plan_de_la_empresa: la empresa lee su plan y su consumo (R2, R6, R9, R25, R26, R40, R41)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2, R9 — servi_app lee el plan de SU empresa y el uso es exactamente el de plan_uso_* (el que frena el alta)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const esperado = await usoSegunLosTriggers(tx, e.A);
      await comoApp(tx, e.A);
      const rol = await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`);
      return { e, esperado, plan: await leerPlan(tx, e.A), rol: rol[0].r };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.plan).not.toBeNull();
    const plan = r.plan as Record<string, unknown>;

    // R2: una sola definición de «uso» — la de los triggers (SL-24, con la envoltura de SLT-58 §11.2).
    expect(plan.uso).toEqual(r.esperado.uso);
    expect(plan.ciclo_inicio).toBe(r.esperado.ciclo_inicio);
    expect(plan.ciclo_ancla).toBe(r.esperado.ciclo_ancla);
    // R41: una empresa sin ciclo corto lo lee NULL (y su ciclo es el de `plan_inicio_ciclo`).
    expect(r.esperado.ciclo_corto_desde ?? null).toBeNull();
    expect(plan.ciclo_corto_desde).toBeNull();
    // Y no es una igualdad vacía: lo sembrado se cuenta (la borrada y el admin pendiente no).
    expect(plan.uso).toEqual({
      ordenes: 3,
      api_keys: 0,
      maestro: 1,
      admin: 0,
      mensajero: 0,
      admin_tienda: 1,
      admin_satelite: 0,
    });

    expect(plan.nombre).toEqual(expect.stringMatching(/^sl24 /));
    expect(plan.precio_negociable).toBe(false);
    expect(plan.precio_mensual).toBe("49.90");
    expect(plan.precio_anual).toBeNull(); // mensual + porcentaje: el CHECK `plan_precio_forma` no deja los dos
    expect(plan.descuento_anual_pct).toBe("16.67");
    expect(plan.tope_ordenes_ciclo).toBe(1000);
    expect(plan.tope_api_keys).toBe(4);
    expect(plan.topes_rol).toEqual(
      expect.arrayContaining([
        { rol: "maestro", maximo: 2 },
        { rol: "Admin Tienda", maximo: 5 },
      ]),
    );
    expect(plan.topes_rol).toHaveLength(2);
    expect(plan.modulos).toEqual(["analitica"]);
    expect(plan.cambio).toEqual({
      vigente_desde: "2099-01-01T06:00:00",
      version: { nombre: "custom A v2", topeOrdenesCiclo: 50 },
    });
  });

  it("R9 — sin avisos_al_programar ni actor: las claves de la respuesta y del cambio son exactamente las del design", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await comoApp(tx, e.A);
      return { e, plan: await leerPlan(tx, e.A) };
    });
    const plan = r.plan as Record<string, unknown>;
    expect(Object.keys(plan).sort()).toEqual(
      [
        "nombre",
        "precio_negociable",
        "precio_mensual",
        "precio_anual",
        "descuento_anual_pct",
        "tope_ordenes_ciclo",
        "tope_api_keys",
        "topes_rol",
        "modulos",
        "ciclo_inicio",
        "ciclo_ancla",
        "ciclo_corto_desde", // SLT-58 §11.2 (R40)
        "uso",
        "cambio",
      ].sort(),
    );
    expect(Object.keys(plan.cambio as object).sort()).toEqual(["version", "vigente_desde"]);
    const texto = JSON.stringify(plan);
    expect(texto).not.toContain("avisos");
    expect(texto).not.toContain("actor");
    expect(texto).not.toContain(ACTOR);
    expect(texto).not.toContain(r.e.actorId);
    expect(texto).not.toContain(OTRA_EMPRESA_EN_AVISOS);
    expect(texto).not.toContain(r.e.B);
  });

  it("R6 — una empresa sin plan recibe NULL", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const sinPlan = await tx.organizacion.findUniqueOrThrow({ where: { id: e.B }, select: { planId: true } });
      await comoApp(tx, e.B);
      return { planIdDeB: sinPlan.planId, plan: await leerPlan(tx, e.B) };
    });
    expect(r.planIdDeB).toBeNull();
    expect(r.plan).toBeNull();
  });

  it("R9 — la empresa de otro y sin contexto dan 42501; SELECT a plan con servi_app da 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const llamar = (id: string) => () => tx.$queryRawUnsafe(`SELECT plan_de_la_empresa($1)`, id);

      await comoApp(tx, e.B);
      const otraDesdeB = await capturar(tx, llamar(e.A));
      await comoApp(tx, e.A);
      const otraDesdeA = await capturar(tx, llamar(e.B));
      const tablaPlan = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT * FROM "plan" WHERE "id" = $1`, e.planA));
      const tablaCambio = await capturar(tx, () =>
        tx.$queryRawUnsafe(`SELECT "avisos_al_programar" FROM "plan_cambio_programado" WHERE "plan_id" = $1`, e.planA),
      );
      // Sin contexto: '' (lo que queda tras `fijarEmpresa(tx, '')`).
      await fijarEmpresa(tx, "");
      const sinContexto = await capturar(tx, llamar(e.A));
      const nulo = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT plan_de_la_empresa(NULL)`));
      const rol = await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`);
      return { otraDesdeB, otraDesdeA, tablaPlan, tablaCambio, sinContexto, nulo, rol: rol[0].r };
    });
    expect(r.rol).toBe("servi_app");
    expect(sqlstateDe(r.otraDesdeB)).toBe("42501");
    expect(sqlstateDe(r.otraDesdeA)).toBe("42501");
    expect(sqlstateDe(r.tablaPlan)).toBe("42501");
    expect(sqlstateDe(r.tablaCambio)).toBe("42501");
    expect(sqlstateDe(r.sinContexto)).toBe("42501");
    expect(sqlstateDe(r.nulo)).toBe("42501");
    expect(String((r.otraDesdeB as Error).message)).toContain("plan_de_la_empresa: solo se lee el plan de la empresa del contexto");
  });

  it("R9 — solo servi_app y el dueño la ejecutan: EXECUTE revocado a PUBLIC, SECURITY DEFINER y search_path fijo", async () => {
    const filas = await base.$queryRawUnsafe<
      { app: boolean; publico: boolean; definer: boolean; config: string[] | null }[]
    >(
      `SELECT has_function_privilege('servi_app', p.oid, 'EXECUTE') AS app,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
              p.prosecdef AS definer,
              p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'plan_de_la_empresa' AND n.nspname = 'public'`,
    );
    expect(filas).toEqual([{ app: true, publico: false, definer: true, config: ["search_path=public, pg_temp"] }]);
  });

  it("R25 — la función es STABLE (provolatile = 's') y se lee en una transacción de solo lectura", async () => {
    const volatilidad = await base.$queryRawUnsafe<{ v: string; args: string; ret: string }[]>(
      `SELECT p.provolatile::text AS v, pg_get_function_identity_arguments(p.oid) AS args,
              pg_get_function_result(p.oid) AS ret
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'plan_de_la_empresa' AND n.nspname = 'public'`,
    );
    expect(volatilidad).toEqual([{ v: "s", args: "p_organizacion_id text", ret: "jsonb" }]);

    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await tx.$executeRawUnsafe(`SET LOCAL transaction_read_only = on`);
      await comoApp(tx, e.A);
      const plan = await capturar(tx, () => leerPlan(tx, e.A));
      const soloLectura = await tx.$queryRawUnsafe<{ v: string }[]>(`SELECT current_setting('transaction_read_only') AS v`);
      return { error: plan, soloLectura: soloLectura[0].v };
    });
    expect(r.soloLectura).toBe("on");
    expect(r.error).toBeNull();
  });

  it("R26 — el nombre en español está en pg_proc; el down.sql en una transacción la quita y el ROLLBACK la deja", async () => {
    expect(await funcionesConElNombre(base)).toBe(1);
    const down = readFileSync(DOWN_SQL, "utf8");
    expect(down).toMatch(/DROP FUNCTION plan_de_la_empresa\(text\);/);

    const dentro = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(down);
      return funcionesConElNombre(tx);
    });
    expect(dentro).toBe(0);
    expect(await funcionesConElNombre(base)).toBe(1);
  });
});
