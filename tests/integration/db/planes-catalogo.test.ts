import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import { CLAVE_LOCK_ESCRITURA_REAL, HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-24 / T1 (design §2.1–§2.4) — el catálogo de planes contra Postgres real, como dueño (que es como
// escribe el superadmin, en `comoPlataforma`):
//   · R1: un plan se guarda con nombre, visibilidad, topes (órdenes, por rol, API keys), módulos y
//     precio, y nace sin archivar;
//   · R3: los CHECK aceptan las cinco formas del precio y rechazan las demás con SQL a mano;
//   · R25: el CHECK de `plan_tope_rol` admite los cinco roles con tope y rechaza `apiKey` y `superadmin`;
//   · R6: archivar conserva el plan, su asignación y sus topes; un plan en uso no se puede borrar;
//   · R7: la lectura de públicos nunca trae un custom ni un archivado, y la de asignables de una empresa
//     trae sus custom y nunca los de otra.
// R2 a nivel de base (custom ⇔ empresa) entra con los CHECK.
//
// Cada caso corre en una transacción del dueño que SIEMPRE se revierte: no deja planes ni empresas.
// Las lecturas filtran por los ids creados en el caso, porque la base es compartida.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

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
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

type Precio = {
  negociable?: boolean;
  mensual?: string | null;
  anual?: string | null;
  pct?: string | null;
};

/** `INSERT` a mano de un plan público con el precio dado. Devuelve el SQLSTATE o `null`. */
function insertarPublicoConPrecio(tx: TxDeTest, p: Precio): Promise<string | null> {
  return intentar(
    tx,
    `INSERT INTO "plan" ("id", "nombre", "visibilidad", "precio_negociable", "precio_mensual", "precio_anual", "descuento_anual_pct")
     VALUES ($1, 'Plan de prueba', 'publico', $2, $3::numeric, $4::numeric, $5::numeric)`,
    randomUUID(),
    p.negociable ?? false,
    p.mensual ?? null,
    p.anual ?? null,
    p.pct ?? null,
  );
}

async function crearEmpresa(tx: TxDeTest): Promise<string> {
  const { id } = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
  return id;
}

async function crearPlan(
  tx: TxDeTest,
  o: { nombre?: string; custom?: string; archivado?: boolean } = {},
): Promise<string> {
  const { id } = await tx.plan.create({
    data: {
      nombre: o.nombre ?? `Plan ${randomUUID().slice(0, 8)}`,
      visibilidad: o.custom ? "custom" : "publico",
      organizacionExclusivaId: o.custom ?? null,
      archivadoAt: o.archivado ? new Date() : null,
    },
    select: { id: true },
  });
  return id;
}

describeSiHayBase("SL-24 — catálogo de planes en la base (R1, R2, R3, R6, R7, R25)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("control: las cuatro tablas, los CHECK y el índice parcial existen", async () => {
    const tablas = await base.$queryRawUnsafe<{ t: string }[]>(
      `SELECT table_name AS t FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('plan', 'plan_tope_rol', 'plan_modulo', 'plan_rastro')
        ORDER BY 1`,
    );
    expect(tablas.map((f) => f.t)).toEqual(["plan", "plan_modulo", "plan_rastro", "plan_tope_rol"]);
    const checks = await base.$queryRawUnsafe<{ c: string }[]>(
      `SELECT c.conname AS c FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND c.contype = 'c' AND c.conname IN ('plan_precio_forma', 'plan_custom_con_empresa', 'plan_tope_rol_rol_check', 'organizacion_plan_ciclo_ancla_check')
        ORDER BY 1`,
    );
    expect(checks.map((f) => f.c)).toEqual([
      "organizacion_plan_ciclo_ancla_check",
      "plan_custom_con_empresa",
      "plan_precio_forma",
      "plan_tope_rol_rol_check",
    ]);
    const indice = await base.$queryRawUnsafe<{ d: string }[]>(
      `SELECT indexdef AS d FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orden_organizacion_id_created_at_vivas_idx'`,
    );
    expect(indice).toHaveLength(1);
    expect(indice[0].d).toMatch(/\(organizacion_id, created_at\) WHERE \(deleted_at IS NULL\)/);
  });

  it("R1 — un plan se guarda con nombre, visibilidad, topes, módulos y precio, y nace sin archivar", async () => {
    const leido = await revertida(async (tx) => {
      const { id } = await tx.plan.create({
        data: {
          nombre: "Plan Crecimiento",
          visibilidad: "publico",
          topeOrdenesCiclo: 500,
          topeApiKeys: 2,
          precioMensual: "49.90",
          descuentoAnualPct: "15.00",
          topesPorRol: {
            create: [
              { rol: "adminTienda", maximo: 3 },
              { rol: "mensajero", maximo: 10 },
            ],
          },
          modulos: { create: [{ modulo: "analitica" }, { modulo: "monitoreo" }] },
        },
        select: { id: true },
      });
      return tx.plan.findUniqueOrThrow({
        where: { id },
        include: { topesPorRol: { orderBy: { rol: "asc" } }, modulos: { orderBy: { modulo: "asc" } } },
      });
    });
    expect(leido.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(leido.nombre).toBe("Plan Crecimiento");
    expect(leido.visibilidad).toBe("publico");
    expect(leido.organizacionExclusivaId).toBeNull();
    expect(leido.topeOrdenesCiclo).toBe(500);
    expect(leido.topeApiKeys).toBe(2);
    expect(leido.precioNegociable).toBe(false);
    expect(leido.precioMensual?.toFixed(2)).toBe("49.90");
    expect(leido.precioAnual).toBeNull();
    expect(leido.descuentoAnualPct?.toFixed(2)).toBe("15.00");
    expect(leido.archivadoAt).toBeNull();
    expect(leido.topesPorRol.map((t) => [t.rol, t.maximo])).toEqual([
      ["mensajero", 10],
      ["adminTienda", 3],
    ]);
    expect(leido.modulos.map((m) => m.modulo)).toEqual(["analitica", "monitoreo"]);
  });

  it("R1 — sin topes ni precio también es un plan válido (cada tope es opcional)", async () => {
    const leido = await revertida(async (tx) => {
      const id = await crearPlan(tx, { nombre: "Plan libre" });
      return tx.plan.findUniqueOrThrow({ where: { id }, include: { topesPorRol: true, modulos: true } });
    });
    expect([leido.topeOrdenesCiclo, leido.topeApiKeys, leido.precioMensual, leido.archivadoAt]).toEqual([null, null, null, null]);
    expect(leido.topesPorRol).toEqual([]);
    expect(leido.modulos).toEqual([]);
  });

  it("R3 — las cinco formas del precio entran", async () => {
    const resultados = await revertida(async (tx) => ({
      sinPrecio: await insertarPublicoConPrecio(tx, {}),
      negociable: await insertarPublicoConPrecio(tx, { negociable: true }),
      mensual: await insertarPublicoConPrecio(tx, { mensual: "10.00" }),
      mensualYAnual: await insertarPublicoConPrecio(tx, { mensual: "10.00", anual: "100.00" }),
      mensualYPct: await insertarPublicoConPrecio(tx, { mensual: "10.00", pct: "100" }),
      montosCero: await insertarPublicoConPrecio(tx, { mensual: "0", anual: "0" }),
    }));
    expect(resultados).toEqual({
      sinPrecio: null,
      negociable: null,
      mensual: null,
      mensualYAnual: null,
      mensualYPct: null,
      montosCero: null,
    });
  });

  it("R3 — las combinaciones prohibidas y los rangos fuera de límite dan 23514", async () => {
    const resultados = await revertida(async (tx) => ({
      negociableConMensual: await insertarPublicoConPrecio(tx, { negociable: true, mensual: "10.00" }),
      negociableConAnual: await insertarPublicoConPrecio(tx, { negociable: true, anual: "10.00" }),
      negociableConPct: await insertarPublicoConPrecio(tx, { negociable: true, pct: "10" }),
      anualYPct: await insertarPublicoConPrecio(tx, { mensual: "10.00", anual: "100.00", pct: "10" }),
      anualSinMensual: await insertarPublicoConPrecio(tx, { anual: "100.00" }),
      pctSinMensual: await insertarPublicoConPrecio(tx, { pct: "10" }),
      pctCero: await insertarPublicoConPrecio(tx, { mensual: "10.00", pct: "0" }),
      pctMayorQue100: await insertarPublicoConPrecio(tx, { mensual: "10.00", pct: "100.01" }),
      mensualNegativo: await insertarPublicoConPrecio(tx, { mensual: "-0.01" }),
      anualNegativo: await insertarPublicoConPrecio(tx, { mensual: "1.00", anual: "-1.00" }),
    }));
    for (const [caso, sqlstate] of Object.entries(resultados)) {
      expect(sqlstate, caso).toBe("23514");
    }
  });

  it("R3 — un monto que no cabe en DECIMAL(12,2) no entra (22003)", async () => {
    const sqlstate = await revertida((tx) => insertarPublicoConPrecio(tx, { mensual: "10000000000.00" }));
    expect(sqlstate).toBe("22003");
  });

  it("R1, R2 — nombre en blanco, topes negativos y visibilidad sin su empresa (o con empresa sobrante) dan 23514", async () => {
    const r = await revertida(async (tx) => {
      const A = await crearEmpresa(tx);
      const ins = (cols: string, vals: string, ...args: unknown[]) =>
        intentar(tx, `INSERT INTO "plan" ("id", ${cols}) VALUES ($1, ${vals})`, randomUUID(), ...args);
      return {
        nombreBlanco: await ins(`"nombre", "visibilidad"`, `'   ', 'publico'`),
        topeOrdenesNegativo: await ins(`"nombre", "visibilidad", "tope_ordenes_ciclo"`, `'P', 'publico', -1`),
        topeApiKeysNegativo: await ins(`"nombre", "visibilidad", "tope_api_keys"`, `'P', 'publico', -1`),
        customSinEmpresa: await ins(`"nombre", "visibilidad"`, `'P', 'custom'`),
        publicoConEmpresa: await ins(`"nombre", "visibilidad", "organizacion_exclusiva_id"`, `'P', 'publico', $2`, A),
        customDeEmpresaInexistente: await ins(
          `"nombre", "visibilidad", "organizacion_exclusiva_id"`,
          `'P', 'custom', $2`,
          randomUUID(),
        ),
        customConEmpresa: await ins(`"nombre", "visibilidad", "organizacion_exclusiva_id"`, `'P', 'custom', $2`, A),
        topesEnCero: await ins(`"nombre", "visibilidad", "tope_ordenes_ciclo", "tope_api_keys"`, `'P', 'publico', 0, 0`),
      };
    });
    expect(r).toEqual({
      nombreBlanco: "23514",
      topeOrdenesNegativo: "23514",
      topeApiKeysNegativo: "23514",
      customSinEmpresa: "23514",
      publicoConEmpresa: "23514",
      customDeEmpresaInexistente: "23503",
      customConEmpresa: null,
      topesEnCero: null,
    });
  });

  it("R25 — el tope por rol admite los cinco roles con tope y rechaza apiKey y superadmin (23514)", async () => {
    const r = await revertida(async (tx) => {
      const plan = await crearPlan(tx);
      const tope = (rol: string, maximo = 1) =>
        intentar(tx, `INSERT INTO "plan_tope_rol" ("plan_id", "rol", "maximo") VALUES ($1, $2::"rol_value", $3)`, plan, rol, maximo);
      const salida: Record<string, string | null> = {};
      for (const rol of ["maestro", "admin", "mensajero", "Admin Tienda", "adminSatelite", "apiKey", "superadmin"]) {
        salida[rol] = await tope(rol);
      }
      salida.maximoNegativo = await intentar(
        tx,
        `UPDATE "plan_tope_rol" SET "maximo" = -1 WHERE "plan_id" = $1 AND "rol" = 'maestro'`,
        plan,
      );
      salida.duplicado = await tope("admin", 5);
      const filas = await tx.planTopeRol.findMany({ where: { planId: plan }, select: { rol: true } });
      salida.guardados = filas
        .map((f) => f.rol)
        .sort()
        .join(",");
      return salida;
    });
    expect(r).toEqual({
      maestro: null,
      admin: null,
      mensajero: null,
      "Admin Tienda": null,
      adminSatelite: null,
      apiKey: "23514",
      superadmin: "23514",
      maximoNegativo: "23514",
      duplicado: "23505",
      guardados: "admin,adminSatelite,adminTienda,maestro,mensajero",
    });
  });

  it("R1 — los módulos incluidos son del enum de SL-23: uno que no existe no entra (22P02)", async () => {
    const r = await revertida(async (tx) => {
      const plan = await crearPlan(tx);
      const mod = (m: string) =>
        intentar(tx, `INSERT INTO "plan_modulo" ("plan_id", "modulo") VALUES ($1, $2::"modulo_apagable")`, plan, m);
      return { ranking: await mod("ranking"), inventado: await mod("ordenes"), repetido: await mod("ranking") };
    });
    expect(r).toEqual({ ranking: null, inventado: "22P02", repetido: "23505" });
  });

  it("R9 (base) — una empresa con plan tiene ancla; sin ancla da 23514, y un plan inexistente da 23503", async () => {
    const r = await revertida(async (tx) => {
      const A = await crearEmpresa(tx);
      const plan = await crearPlan(tx);
      return {
        sinAncla: await intentar(tx, `UPDATE "organizacion" SET "plan_id" = $1 WHERE "id" = $2`, plan, A),
        planInexistente: await intentar(
          tx,
          `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = CURRENT_TIMESTAMP WHERE "id" = $2`,
          randomUUID(),
          A,
        ),
        conAncla: await intentar(
          tx,
          `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = CURRENT_TIMESTAMP WHERE "id" = $2`,
          plan,
          A,
        ),
      };
    });
    expect(r).toEqual({ sinAncla: "23514", planInexistente: "23503", conAncla: null });
  });

  it("R6 — archivar conserva el plan, sus topes y su asignación; un plan en uso no se puede borrar", async () => {
    const r = await revertida(async (tx) => {
      const A = await crearEmpresa(tx);
      const { id: plan } = await tx.plan.create({
        data: {
          nombre: "Plan a archivar",
          visibilidad: "publico",
          topeOrdenesCiclo: 10,
          topesPorRol: { create: [{ rol: "admin", maximo: 2 }] },
          modulos: { create: [{ modulo: "monitoreo" }] },
        },
        select: { id: true },
      });
      await tx.organizacion.update({ where: { id: A }, data: { planId: plan, planCicloAnclaAt: new Date() } });

      await tx.plan.update({ where: { id: plan }, data: { archivadoAt: new Date() } });

      const tras = await tx.plan.findUniqueOrThrow({
        where: { id: plan },
        include: { topesPorRol: true, modulos: true, empresas: { select: { id: true } } },
      });
      const borrar = await intentar(tx, `DELETE FROM "plan" WHERE "id" = $1`, plan);
      return {
        archivado: tras.archivadoAt !== null,
        tope: tras.topeOrdenesCiclo,
        topesRol: tras.topesPorRol.map((t) => [t.rol, t.maximo]),
        modulos: tras.modulos.map((m) => m.modulo),
        empresas: tras.empresas.map((e) => e.id),
        A,
        borrar,
        sigue: await tx.plan.count({ where: { id: plan } }),
      };
    });
    expect(r.archivado).toBe(true);
    expect(r.tope).toBe(10);
    expect(r.topesRol).toEqual([["admin", 2]]);
    expect(r.modulos).toEqual(["monitoreo"]);
    expect(r.empresas).toEqual([r.A]);
    expect(r.borrar).toBe("23503");
    expect(r.sigue).toBe(1);
  });

  it("R6, §2.4 — borrar una empresa con su propio custom asignado no falla: el custom cae con ella (CASCADE + NO ACTION)", async () => {
    const r = await revertida(async (tx) => {
      const A = await crearEmpresa(tx);
      const B = await crearEmpresa(tx);
      const customA = await crearPlan(tx, { custom: A });
      const publico = await crearPlan(tx);
      await tx.organizacion.update({ where: { id: A }, data: { planId: customA, planCicloAnclaAt: new Date() } });
      await tx.organizacion.update({ where: { id: B }, data: { planId: publico, planCicloAnclaAt: new Date() } });
      const borrarA = await intentar(tx, `DELETE FROM "organizacion" WHERE "id" = $1`, A);
      return {
        borrarA,
        customA: await tx.plan.count({ where: { id: customA } }),
        publico: await tx.plan.count({ where: { id: publico } }),
        planDeB: (await tx.organizacion.findUniqueOrThrow({ where: { id: B }, select: { planId: true } })).planId,
        publicoId: publico,
      };
    });
    expect(r.borrarA).toBeNull();
    expect(r.customA).toBe(0);
    expect(r.publico).toBe(1);
    expect(r.planDeB).toBe(r.publicoId);
  });

  it("R7 — públicos: solo los públicos no archivados; asignables de A: esos y los custom vigentes de A, nunca los de B", async () => {
    const r = await revertida(async (tx) => {
      const A = await crearEmpresa(tx);
      const B = await crearEmpresa(tx);
      const ids = {
        publico: await crearPlan(tx, { nombre: "Público vigente" }),
        publicoArchivado: await crearPlan(tx, { nombre: "Público archivado", archivado: true }),
        customA: await crearPlan(tx, { nombre: "Custom de A", custom: A }),
        customAArchivado: await crearPlan(tx, { nombre: "Custom de A archivado", custom: A, archivado: true }),
        customB: await crearPlan(tx, { nombre: "Custom de B", custom: B }),
      };
      const creados = Object.values(ids);
      const nombreDe = new Map(Object.entries(ids).map(([k, v]) => [v, k]));
      const nombres = (filas: { id: string }[]) =>
        filas
          .filter((f) => creados.includes(f.id))
          .map((f) => nombreDe.get(f.id))
          .sort();

      const publicos = await tx.plan.findMany({
        where: { visibilidad: "publico", archivadoAt: null },
        select: { id: true },
      });
      const asignables = (empresa: string) =>
        tx.plan.findMany({
          where: {
            archivadoAt: null,
            OR: [{ visibilidad: "publico" }, { visibilidad: "custom", organizacionExclusivaId: empresa }],
          },
          select: { id: true },
        });
      return {
        publicos: nombres(publicos),
        deA: nombres(await asignables(A)),
        deB: nombres(await asignables(B)),
      };
    });
    expect(r.publicos).toEqual(["publico"]);
    expect(r.deA).toEqual(["customA", "publico"]);
    expect(r.deB).toEqual(["customB", "publico"]);
  });

  it("R14 — una empresa recién creada nace sin plan ni ancla", async () => {
    const r = await revertida(async (tx) => {
      const A = await crearEmpresa(tx);
      return tx.organizacion.findUniqueOrThrow({ where: { id: A }, select: { planId: true, planCicloAnclaAt: true } });
    });
    expect(r).toEqual({ planId: null, planCicloAnclaAt: null });
  });
});
