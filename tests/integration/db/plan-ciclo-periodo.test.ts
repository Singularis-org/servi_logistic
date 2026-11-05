import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { finDelPeriodoCalendario, inicioDelPeriodoCalendario, periodoEnCurso } from "@/lib/planes/ciclo";
import type { TipoCobro } from "@/lib/types/planes";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type FksDeOrden, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { CASOS_ENTRADA, CASOS_PERIODO } from "./_fixtures/periodo-calendario";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";
import { carpetasDeMigracion, sqlDe } from "./_fixtures/ida-y-vuelta-32";

// SLT-86 (design §3.1, §3.3; R4–R7, R26, R32) — el período de calendario en Postgres, con la MISMA tabla que
// las gemelas TS (`tests/unit/planes/ciclo-periodo.test.ts`): si se separan, el texto diría un período
// distinto del que cuenta la base (R6).
//
// - R4–R6: `plan_inicio_periodo_calendario`, `plan_fin_periodo_calendario` y `plan_inicio_ciclo_de` contra la
//   tabla, comparadas fila a fila con el resultado esperado Y con la gemela TS.
// - R7: `plan_de_la_empresa` cuenta las órdenes vivas desde el inicio del período en curso (o de su tramo);
//   las del período anterior y las de antes de la entrada no cuentan.
// - R26 (decisión del 2026-11-05) y R32: sin plan y con una primera asignación pendiente, la lectura
//   acotada devuelve el pendiente sin el actor (migración 20261106130000).
//
// Los `TIMESTAMP` sin zona se pasan como texto sin `Z` para que la zona de la sesión no los mueva. Todo lo
// que escribe va en una transacción del dueño que SIEMPRE se revierte (`revertida`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const sinZona = (iso: string) => iso.replace("T", " ").replace("Z", "");
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

const M_PERIODO = "20261106120000_plan_periodo_facturacion";
const M_SIN_PLAN = "20261106130000_plan_de_la_empresa_pendiente_sin_plan";

let base: PrismaClient;

/** Una de las tres funciones con sus argumentos como texto, y el resultado en ISO con `Z`. */
async function enLaBase(fn: string, ...args: string[]): Promise<string> {
  const tipos = fn === "plan_inicio_ciclo_de" ? ["timestamp", "text", "timestamp"] : ["text", "timestamp"];
  const llamada = `${fn}(${args.map((_, i) => `$${i + 1}::${tipos[i]}`).join(", ")})`;
  const filas = await base.$queryRawUnsafe<{ r: string }[]>(`SELECT to_char(${llamada}, ${ISO}) AS r`, ...args);
  return filas[0].r;
}

/** Cómo sale un `timestamp` dentro de un `jsonb`: sin zona y sin milisegundos si son cero. */
const comoEnJson = (d: Date) => d.toISOString().replace(".000Z", "").replace("Z", "");

/** El JSON de la lectura acotada tal cual llega por Prisma (jsonb ya parseado, o texto si el driver no lo hace). */
async function leerPlan(tx: TxDeTest, organizacionId: string): Promise<Record<string, unknown> | null> {
  const filas = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, organizacionId);
  const v = filas[0]?.plan ?? null;
  return (typeof v === "string" ? JSON.parse(v) : v) as Record<string, unknown> | null;
}

/** El `now()` de la transacción en UTC sin zona, el mismo que lee `plan_de_la_empresa`. */
async function ahoraDeLaTx(tx: TxDeTest): Promise<Date> {
  const filas = await tx.$queryRawUnsafe<{ ahora: string }[]>(`SELECT to_char(now() AT TIME ZONE 'UTC', ${ISO}) AS ahora`);
  return new Date(filas[0].ahora);
}

async function crearOrden(tx: TxDeTest, fks: FksDeOrden, creadaAt: Date, borrada = false): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                          "provincia_id", "canton_id", "producto", "updated_at", "created_at", "deleted_at")
     VALUES ($1, $2, $3, 'Destinatario SLT-86', '88880000', $4, $5, $6, $7, 'Caja', now(), $8::timestamp,
             CASE WHEN $9 THEN now() AT TIME ZONE 'UTC' END)`,
    randomUUID(),
    `SLT86-${randomUUID().slice(0, 12)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
    sinZona(creadaAt.toISOString()),
    borrada,
  );
}

/** Una empresa con un plan público mínimo, el tipo y la entrada dados. Deja la empresa en el contexto. */
async function empresaConPlan(tx: TxDeTest, tipo: TipoCobro, entrada: Date): Promise<{ id: string; planId: string }> {
  const { id } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, id);
  const { id: planId } = await tx.plan.create({
    data: { nombre: `slt86 ${randomUUID().slice(0, 8)}`, visibilidad: "publico" },
    select: { id: true },
  });
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_tipo_cobro" = $2, "plan_ciclo_ancla_at" = $3::timestamp WHERE "id" = $4`,
    planId,
    tipo,
    sinZona(entrada.toISOString()),
    id,
  );
  return { id, planId };
}

function cuerpoDe(carpeta: string, nombre: string): string {
  const texto = sqlDe(carpeta, "migration.sql");
  const inicio = texto.indexOf(`CREATE OR REPLACE FUNCTION ${nombre}(`);
  if (inicio < 0) throw new Error(`${nombre} no está en ${carpeta}`);
  const fin = texto.indexOf("END $$;", inicio);
  return texto.slice(inicio, fin + "END $$;".length);
}

describe("SLT-86 — la migración de R26 sin plan en disco", () => {
  it("va detrás de la del período, con un down.sql que repone LITERALMENTE el cuerpo de origen", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_SIN_PLAN)).toBe(carpetas.indexOf(M_PERIODO) + 1);
    const origen = cuerpoDe(M_PERIODO, "plan_de_la_empresa");
    expect(sqlDe(M_SIN_PLAN, "down.sql")).toContain(origen);
    // La subida conserva entera la consulta de la empresa con plan: solo añade la rama sin plan.
    const subida = cuerpoDe(M_SIN_PLAN, "plan_de_la_empresa");
    const consultaDeOrigen = origen.slice(origen.indexOf("SELECT jsonb_build_object("), origen.indexOf("WHERE o.\"id\" = p_organizacion_id);"));
    expect(subida).toContain(consultaDeOrigen);
    expect(subida).not.toContain("plan_cambio_actor_id\"");
  });
});

describeSiHayBase("SLT-86 — el período de calendario en Postgres (R4–R7, R26, R32)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("control: las tres funciones existen, son IMMUTABLE y servi_app no las ejecuta (REVOKE … FROM PUBLIC)", async () => {
    const filas = await base.$queryRawUnsafe<{ nombre: string; volatilidad: string; app: boolean }[]>(
      `SELECT p.proname AS nombre, p.provolatile::text AS volatilidad,
              has_function_privilege('servi_app', p.oid, 'EXECUTE') AS app
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('plan_inicio_periodo_calendario', 'plan_fin_periodo_calendario', 'plan_inicio_ciclo_de')
        ORDER BY p.proname`,
    );
    expect(filas).toEqual([
      { nombre: "plan_fin_periodo_calendario", volatilidad: "i", app: false },
      { nombre: "plan_inicio_ciclo_de", volatilidad: "i", app: false },
      { nombre: "plan_inicio_periodo_calendario", volatilidad: "i", app: false },
    ]);
  });

  it("un tipo desconocido es 22023, no un período inventado", async () => {
    for (const tipo of ["semanal", "Mensual"]) {
      const e = await base
        .$queryRawUnsafe(`SELECT plan_inicio_periodo_calendario($1::text, now()::timestamp)`, tipo)
        .then(() => null, (err: unknown) => err);
      expect(sqlstateDe(e)).toBe("22023");
    }
  });

  describe("R4, R6 — la tabla de bordes: base = esperado = TS", () => {
    it.each(CASOS_PERIODO)("$caso", async ({ tipo, ahora, inicio, fin }) => {
      const finBase = await enLaBase("plan_fin_periodo_calendario", tipo, sinZona(ahora));
      expect(finBase).toBe(fin);
      expect(finDelPeriodoCalendario(tipo, new Date(ahora)).toISOString()).toBe(finBase);
      const inicioBase = await enLaBase("plan_inicio_periodo_calendario", tipo, sinZona(ahora));
      if (inicio !== null) expect(inicioBase).toBe(inicio);
      expect(inicioDelPeriodoCalendario(tipo, new Date(ahora)).toISOString()).toBe(inicioBase);
    });
  });

  describe("R5, R6 — el período en curso con la entrada: base = esperado = TS", () => {
    it.each(CASOS_ENTRADA)("$caso", async ({ tipo, entrada, ahora, desde, hasta }) => {
      const desdeBase = await enLaBase("plan_inicio_ciclo_de", sinZona(entrada), tipo, sinZona(ahora));
      const hastaBase = await enLaBase("plan_fin_periodo_calendario", tipo, sinZona(ahora));
      expect({ desde: desdeBase, hasta: hastaBase }).toEqual({ desde, hasta });
      const ts = periodoEnCurso(new Date(entrada), tipo, new Date(ahora));
      expect({ desde: ts.desde.toISOString(), hasta: ts.hasta.toISOString() }).toEqual({ desde: desdeBase, hasta: hastaBase });
    });
  });

  describe("R7 — plan_de_la_empresa cuenta las órdenes vivas del período en curso", () => {
    it("período completo: cuentan las del inicio de calendario en adelante; las del período anterior, no (vuelve a 0)", async () => {
      const r = await revertida(base, async (tx) => {
        const ahora = await ahoraDeLaTx(tx);
        const empresa = await empresaConPlan(tx, "mensual", new Date("2020-01-01T06:00:00.000Z"));
        const fks = await crearFksDeOrden(tx);
        const inicio = inicioDelPeriodoCalendario("mensual", ahora);
        await crearOrden(tx, fks, new Date(inicio.getTime() - 1)); // último milisegundo del período anterior
        await crearOrden(tx, fks, new Date(inicio.getTime() - 86_400_000)); // un día antes
        await crearOrden(tx, fks, inicio); // el borde exacto cuenta
        await crearOrden(tx, fks, ahora);
        await crearOrden(tx, fks, ahora, true); // borrada: no está viva
        await comoApp(tx, empresa.id);
        return { plan: await leerPlan(tx, empresa.id), ahora };
      });
      const esperado = periodoEnCurso(new Date("2020-01-01T06:00:00.000Z"), "mensual", r.ahora);
      expect(r.plan).toMatchObject({
        tipo_cobro: "mensual",
        uso: { ordenes: 2 },
        ciclo_inicio: comoEnJson(esperado.desde),
        ciclo_fin: comoEnJson(esperado.hasta),
      });
    });

    it("tramo: con la entrada hoy a las 00:00, las de antes de la entrada no cuentan aunque sean del mismo período", async () => {
      const r = await revertida(base, async (tx) => {
        const ahora = await ahoraDeLaTx(tx);
        const hoy = new Date(`${new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10)}T06:00:00.000Z`);
        const empresa = await empresaConPlan(tx, "anual", hoy);
        const fks = await crearFksDeOrden(tx);
        await crearOrden(tx, fks, new Date(hoy.getTime() - 1));
        await crearOrden(tx, fks, hoy);
        await crearOrden(tx, fks, ahora);
        await comoApp(tx, empresa.id);
        return { plan: await leerPlan(tx, empresa.id), ahora, hoy };
      });
      const esperado = periodoEnCurso(r.hoy, "anual", r.ahora);
      // Hoy no es 1 de enero salvo un día al año: entonces la entrada coincide con el inicio y no es tramo.
      expect(esperado.desde.toISOString()).toBe(r.hoy.toISOString());
      expect(r.plan).toMatchObject({
        tipo_cobro: "anual",
        uso: { ordenes: 2 },
        ciclo_inicio: comoEnJson(r.hoy),
        ciclo_fin: comoEnJson(esperado.hasta),
      });
    });
  });

  describe("R26, R32 — el pendiente de una empresa sin plan (decisión del 2026-11-05)", () => {
    async function conPendiente(tx: TxDeTest, organizacionId: string, planId: string, actorId: string) {
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "plan_cambio_id" = $1, "plan_cambio_plan_id" = $2, "plan_cambio_tipo_cobro" = 'quincenal',
                "plan_cambio_desde_at" = '2099-03-16 06:00:00', "plan_cambio_actor_id" = $3 WHERE "id" = $4`,
        randomUUID(),
        planId,
        actorId,
        organizacionId,
      );
    }

    it("sin plan y con una primera asignación pendiente: «sin_plan» y el pendiente, sin el actor", async () => {
      const actorId = `actor-${randomUUID()}`;
      const r = await revertida(base, async (tx) => {
        const { id } = await crearOrganizacion(tx);
        const nombre = `slt86 pro ${randomUUID().slice(0, 8)}`;
        const { id: planId } = await tx.plan.create({ data: { nombre, visibilidad: "publico" }, select: { id: true } });
        await conPendiente(tx, id, planId, actorId);
        await comoApp(tx, id);
        return { plan: await leerPlan(tx, id), nombre };
      });
      expect(r.plan).toEqual({
        sin_plan: true,
        cambio_empresa: { plan_nombre: r.nombre, tipo_cobro: "quincenal", desde: "2099-03-16T06:00:00" },
      });
      expect(JSON.stringify(r.plan)).not.toContain(actorId);
    });

    it("sin plan y sin pendiente: NULL, como antes (SLT-58 R6)", async () => {
      const r = await revertida(base, async (tx) => {
        const { id } = await crearOrganizacion(tx);
        await comoApp(tx, id);
        return leerPlan(tx, id);
      });
      expect(r).toBeNull();
    });

    it("con plan y pendiente: la forma de siempre, con cambio_empresa y sin el actor ni «sin_plan»", async () => {
      const actorId = `actor-${randomUUID()}`;
      const r = await revertida(base, async (tx) => {
        const empresa = await empresaConPlan(tx, "mensual", new Date("2026-01-01T06:00:00.000Z"));
        const { id: otro } = await tx.plan.create({
          data: { nombre: "slt86 otro", visibilidad: "publico" },
          select: { id: true },
        });
        await conPendiente(tx, empresa.id, otro, actorId);
        await comoApp(tx, empresa.id);
        return leerPlan(tx, empresa.id);
      });
      expect(r).toMatchObject({
        tipo_cobro: "mensual",
        cambio_empresa: { plan_nombre: "slt86 otro", tipo_cobro: "quincenal", desde: "2099-03-16T06:00:00" },
      });
      expect(r).not.toHaveProperty("sin_plan");
      expect(JSON.stringify(r)).not.toContain(actorId);
    });

    it("el pendiente sin plan de otra empresa no se lee: 42501", async () => {
      const e = await revertida(base, async (tx) => {
        const { id: A } = await crearOrganizacion(tx);
        const { id: B } = await crearOrganizacion(tx);
        const { id: planId } = await tx.plan.create({ data: { nombre: "slt86 b", visibilidad: "publico" }, select: { id: true } });
        await conPendiente(tx, B, planId, "actor");
        await comoApp(tx, A);
        return capturar(tx, () => leerPlan(tx, B));
      });
      expect(sqlstateDe(e)).toBe("42501");
    });
  });
});
