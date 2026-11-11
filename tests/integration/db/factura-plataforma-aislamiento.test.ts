import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta, SQLSTATE_EMPRESA_CRUZADA, comoPlataforma } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { EfectoElegido } from "@/lib/interfaces/repositories/IPlanesRepository";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import type { CuotaDeLaFactura, FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";
import type { TipoCobro } from "@/lib/types/planes";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

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
// del 1 de diciembre: dos cerradas con cuota y una en curso. Cada caso en una transacción revertida; los
// rechazos van en SAVEPOINT para no abortarla.
//
// T9.2 (design §2.6, §3; R24): la lectura de la empresa por `FacturaPlataformaRepository.deLaEmpresa`, como
// `servi_app` con la empresa en el contexto: las cerradas y las no cerradas (`factura_plataforma_en_curso`),
// con su fin y sus cuotas previstas. La función no recibe el reloj: sus cuotas no dependen de él y las
// órdenes de estos casos no tienen cargos, así que nada de lo que se mira cambia con la fecha del CI.
//
// T8.1, T9.2 (R23, R24 del superadmin): `deEmpresaParaPlataforma` fija la empresa con `conEmpresa`, y eso solo
// lo lee la extensión del cliente (`conAislamientoPorEmpresa`), que abre su propia transacción en otra
// conexión: no ve lo de una transacción revertida. Por eso ese bloque, el último, commitea su siembra bajo el
// lock de escritura real y la borra en su `afterAll` (las facturas se van con la empresa, ON DELETE CASCADE).

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

/* -------------------------------------------------------------------------- */
/* R24: la lectura de la empresa                                               */
/* -------------------------------------------------------------------------- */

const ACTOR = randomUUID();
/** La corrida de las 00:10 de la plataforma del día `fecha`. */
const corrida = (fecha: string) => new Date(new Date(cero(fecha)).getTime() + 10 * 60_000).toISOString();

/** Un plan con costo base `mensual` en el historial «desde siempre». */
async function planConPrecio(tx: TxDeTest, mensual: string): Promise<{ id: string; nombre: string }> {
  const id = await crearPlan(tx);
  await tx.$executeRawUnsafe(`UPDATE "plan" SET "precio_mensual" = $2::numeric WHERE "id" = $1`, id, mensual);
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = $2::numeric WHERE "plan_id" = $1`, id, mensual);
  const [{ nombre }] = await tx.$queryRawUnsafe<{ nombre: string }[]>(`SELECT "nombre" FROM "plan" WHERE "id" = $1`, id);
  return { id, nombre };
}

/** Una empresa con su alta en `alta`; con plan, como si lo tuviera desde el alta (sin marca de primera cuota). */
async function empresaDesde(tx: TxDeTest, alta: string, plan?: { id: string; tipo: TipoCobro }): Promise<string> {
  const { id } = await crearOrganizacion(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, id, alta);
  if (plan) {
    await tx.$executeRawUnsafe(
      `UPDATE "organizacion" SET "plan_id" = $2, "plan_tipo_cobro" = $3, "plan_ciclo_ancla_at" = $4::timestamp WHERE "id" = $1`,
      id,
      plan.id,
      plan.tipo,
      alta,
    );
  }
  return id;
}

function cerrarEn(tx: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(tx).cerrar(organizacionId, new Date(ahora));
}

/** `deLaEmpresa` como la app: `servi_app` con la empresa en el contexto. Vuelve al dueño al terminar. */
async function leerComoEmpresa(tx: TxDeTest, organizacionId: string): Promise<FacturaPlataformaDTO[]> {
  await comoApp(tx, organizacionId);
  try {
    return await new FacturaPlataformaRepository(tx).deLaEmpresa();
  } finally {
    await tx.$executeRawUnsafe(`RESET ROLE`);
  }
}

/** Una cuota con sus instantes en ISO, para compararla entera. */
const cuotaVista = (c: CuotaDeLaFactura | null) =>
  c === null ? null : { ...c, desde: c.desde.toISOString(), hasta: c.hasta.toISOString() };

/** Lo que R24 pide de cada factura, con los instantes en ISO. */
const vista = (f: FacturaPlataformaDTO) => ({
  estado: f.estado,
  numero: f.numero,
  desde: f.desde.toISOString(),
  hasta: f.hasta.toISOString(),
  hastaPrevisto: f.hastaPrevisto,
  periodicidad: f.periodicidad,
  planId: f.plan?.planId ?? null,
  totalOrdenes: f.totalOrdenes,
  cuota: cuotaVista(f.cuota),
  primeraCuota: cuotaVista(f.primeraCuota),
  total: f.total,
});

/** Una cuota completa (sin prorrateo) de un período de calendario `[desde, hasta)`. */
const cuotaCompleta = (
  plan: { id: string; nombre: string },
  tipoCobro: TipoCobro,
  desde: string,
  hasta: string,
  precioMensual: string,
  cuota: string,
  dias: number,
) => ({
  planId: plan.id,
  planNombre: plan.nombre,
  tipoCobro,
  desde: cero(desde),
  hasta: cero(hasta),
  precioMensual,
  cuota,
  diasCobrados: dias,
  diasPeriodo: dias,
});

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

  /* ---------------------- R24: la lectura de la empresa ---------------------- */

  it("R24: plan mensual: la del 1 al 15 sin cuota prevista; con la del 16 al 30 abierta, esa lleva la cuota de diciembre prevista y la del 1 al 15, por cerrar, ninguna", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00");
      const e = await empresaDesde(tx, cero("2026-11-01"), { id: plan.id, tipo: "mensual" });
      await cerrarEn(tx, e, "2026-11-10T14:00:00.000Z");
      const el10 = await leerComoEmpresa(tx, e);
      // A las 00:01 del 16: la del 1 al 15 queda fijada (por cerrar, dentro del margen) y se abre la del 16.
      await cerrarEn(tx, e, "2026-11-16T06:01:00.000Z");
      const el16 = await leerComoEmpresa(tx, e);
      return { plan, el10: el10.map(vista), el16: el16.map(vista) };
    });
    const primera = {
      numero: null,
      desde: cero("2026-11-01"),
      hasta: cero("2026-11-16"),
      periodicidad: "quincenal",
      planId: r.plan.id,
      totalOrdenes: "0.00",
      cuota: null,
      primeraCuota: null,
      total: "0.00",
    };
    // El 16 no es inicio de un mes: la emitida ese día no lleva cuota.
    expect(r.el10).toEqual([{ ...primera, estado: "en_curso", hastaPrevisto: true }]);
    expect(r.el16).toEqual([
      { ...primera, estado: "por_cerrar", hastaPrevisto: false },
      {
        estado: "en_curso",
        numero: null,
        desde: cero("2026-11-16"),
        hasta: cero("2026-12-01"),
        hastaPrevisto: true,
        periodicidad: "quincenal",
        planId: r.plan.id,
        totalOrdenes: "0.00",
        cuota: cuotaCompleta(r.plan, "mensual", "2026-12-01", "2027-01-01", "31000.00", "31000.00", 31),
        primeraCuota: null,
        total: "31000.00",
      },
    ]);
  });

  it("R24: con un cambio pendiente cuyo efecto es el fin de la en curso, la cuota prevista es la del plan nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const actual = await planConPrecio(tx, "31000.00");
      const nuevo = await planConPrecio(tx, "40000.00");
      const e = await empresaDesde(tx, cero("2026-11-01"), { id: actual.id, tipo: "quincenal" });
      await cerrarEn(tx, e, "2026-11-10T14:00:00.000Z");
      const sinCambio = await leerComoEmpresa(tx, e);
      // Un pendiente al 16 (el fin previsto de la en curso), escrito como lo deja guardado el superadmin.
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "plan_cambio_id" = $2, "plan_cambio_plan_id" = $3, "plan_cambio_tipo_cobro" = 'quincenal',
                "plan_cambio_desde_at" = $4::timestamp, "plan_cambio_actor_id" = $5 WHERE "id" = $1`,
        e,
        randomUUID(),
        nuevo.id,
        cero("2026-11-16"),
        ACTOR,
      );
      const conCambio = await leerComoEmpresa(tx, e);
      return { actual, nuevo, sinCambio: sinCambio.map(vista), conCambio: conCambio.map(vista) };
    });
    expect(r.sinCambio.map((f) => f.cuota)).toEqual([
      cuotaCompleta(r.actual, "quincenal", "2026-11-16", "2026-12-01", "31000.00", "15500.00", 15),
    ]);
    // Las órdenes siguen con el plan de antes; solo la cuota que se emitirá el 16 es la del plan nuevo.
    expect(r.conCambio).toEqual([
      {
        ...r.sinCambio[0],
        cuota: cuotaCompleta(r.nuevo, "quincenal", "2026-11-16", "2026-12-01", "40000.00", "20000.00", 15),
        total: "20000.00",
      },
    ]);
    expect(r.conCambio[0].planId).toBe(r.actual.id);
  });

  it("R24: quincenal con inicio el 1 aplicado el 12: la en curso lleva las dos previstas, la primera del 1 al 15 y la de la quincena del 16", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00");
      const e = await empresaDesde(tx, cero("2026-10-16"));
      await cerrarEn(tx, e, corrida("2026-11-01"));
      await fijarEmpresa(tx, "");
      const efecto: EfectoElegido = { clase: "inicio", fecha: "2026-11-01", desde: inicioDelDiaPlataforma("2026-11-01"), elegida: true };
      const asignado = await planesEnTx(tx).asignar(e, plan.id, ACTOR, efecto, "quincenal", new Date("2026-11-12T15:00:00.000Z"));
      const lectura = await leerComoEmpresa(tx, e);
      return { plan, asignado, lectura: lectura.map(vista) };
    });
    expect(r.asignado).toMatchObject({ estado: "ok", pendiente: false });
    // La emitida el 1 (sin plan) sigue cerrada y sin cuotas; la en curso, del 1 al 15, con las dos previstas.
    expect(r.lectura).toEqual([
      {
        estado: "cerrada",
        numero: 1,
        desde: cero("2026-10-16"),
        hasta: cero("2026-11-01"),
        hastaPrevisto: false,
        periodicidad: "quincenal",
        planId: null,
        totalOrdenes: "0.00",
        cuota: null,
        primeraCuota: null,
        total: "0.00",
      },
      {
        estado: "en_curso",
        numero: null,
        desde: cero("2026-11-01"),
        hasta: cero("2026-11-16"),
        hastaPrevisto: true,
        periodicidad: "quincenal",
        planId: r.plan.id,
        totalOrdenes: "0.00",
        cuota: cuotaCompleta(r.plan, "quincenal", "2026-11-16", "2026-12-01", "31000.00", "15500.00", 15),
        primeraCuota: cuotaCompleta(r.plan, "quincenal", "2026-11-01", "2026-11-16", "31000.00", "15500.00", 15),
        total: "31000.00",
      },
    ]);
  });

  it("R24, R21: la empresa A lee las suyas, cerradas con su número y sus cuotas emitidas; la de otra empresa o sin empresa, 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const { a, b } = await sembrar(tx);
      const deA = await leerComoEmpresa(tx, a.id);
      await comoApp(tx, a.id);
      const deB = await intentar(tx, `SELECT factura_plataforma_en_curso($1)`, b.id);
      await comoApp(tx, "");
      const sinEmpresa = await intentar(tx, `SELECT factura_plataforma_en_curso($1)`, a.id);
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { a, deA, deB, sinEmpresa };
    });
    expect(r.deB).toBe("42501");
    expect(r.sinEmpresa).toBe("42501");
    expect(r.deA.map((f) => f.id)).toEqual([...r.a.cerradas, r.a.enCurso]);
    expect(r.deA.map((f) => [f.estado, f.numero, f.cuota?.cuota ?? null, f.cuota?.desde.toISOString() ?? null, f.total])).toEqual([
      ["cerrada", 1, "15500.00", cero("2026-11-16"), "15500.00"],
      ["cerrada", 2, "15500.00", cero("2026-12-01"), "15500.00"],
      // La del 1 al 15 de diciembre: la cuota de la segunda quincena (16 días), prevista.
      ["en_curso", null, "15500.00", cero("2026-12-16"), "15500.00"],
    ]);
    expect(r.deA[2]).toMatchObject({ hastaPrevisto: true, cerradaAt: null, primeraCuota: null });
    expect(r.deA[2].cuota).toMatchObject({ diasCobrados: 16, diasPeriodo: 16 });
    expect(r.deA[0].cerradaAt?.toISOString()).toBe("2026-12-01T06:10:00.000Z");
  });
});

/* -------------------------------------------------------------------------- */
/* R23, R24: la lectura del superadmin por la app (T8.1)                       */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-118 — el superadmin lee las facturas de una empresa por la app (R23, R24; T8.1)", () => {
  let dueno: PrismaClient;
  /** El cliente de la app: la extensión de empresa sin sesión, así la empresa solo sale de `conEmpresa`. */
  let repo: FacturaPlataformaRepository;
  let plan: { id: string; nombre: string } | undefined;
  let mensual: { id: string; nombre: string } | undefined;
  const empresas: string[] = [];
  let a: Lado;
  let b: Lado;
  /** La del plan mensual, cerrada hasta las 00:01 del 16: la del 1 al 15 por cerrar y la del 16 en curso. */
  let c: string;

  beforeAll(async () => {
    dueno = crearPrismaDeTest();
    repo = new FacturaPlataformaRepository(conAislamientoPorEmpresa(dueno, async () => null));
    await bajoLockDeEscrituraReal(async () => {
      plan = await planConPrecio(dueno as unknown as TxDeTest, "31000.00");
      mensual = await planConPrecio(dueno as unknown as TxDeTest, "31000.00");
      a = await lado(dueno as unknown as TxDeTest, plan.id);
      empresas.push(a.id);
      b = await lado(dueno as unknown as TxDeTest, plan.id);
      empresas.push(b.id);
      c = await empresaDesde(dueno as unknown as TxDeTest, cero("2026-11-01"), { id: mensual.id, tipo: "mensual" });
      empresas.push(c);
      await new FacturaPlataformaRepository(dueno).cerrar(c, new Date("2026-11-16T06:01:00.000Z"));
    });
  }, 120_000);

  afterAll(async () => {
    if (dueno === undefined) return;
    try {
      await bajoLockDeEscrituraReal(async () => {
        if (empresas.length > 0) await dueno.organizacion.deleteMany({ where: { id: { in: empresas } } });
        const planes = [plan?.id, mensual?.id].filter((x): x is string => typeof x === "string");
        // El historial de precio se va con su plan (ON DELETE CASCADE).
        if (planes.length > 0) await dueno.$executeRawUnsafe(`DELETE FROM "plan" WHERE "id" = ANY($1::text[])`, planes);
      });
    } finally {
      await dueno.$disconnect();
    }
  }, 120_000);

  it("control: sin `conEmpresa`, la lectura de la empresa por el cliente de la app no corre (EmpresaNoResuelta)", async () => {
    await expect(repo.deLaEmpresa()).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });

  it("R23: el superadmin lee las de A y las de B, cada una solo con las suyas, también desde un contexto de plataforma", async () => {
    const deA = await repo.deEmpresaParaPlataforma(a.id);
    const deB = await repo.deEmpresaParaPlataforma(b.id);
    // Desde `comoPlataforma` (lo que abre una action del superadmin): manda el `conEmpresa` de dentro.
    const deAEnPlataforma = await comoPlataforma("SL-24", "SLT-118 test: el superadmin lee las facturas de A", () =>
      repo.deEmpresaParaPlataforma(a.id),
    );
    expect(deA.map((f) => f.id)).toEqual([...a.cerradas, a.enCurso]);
    expect(deB.map((f) => f.id)).toEqual([...b.cerradas, b.enCurso]);
    expect(deAEnPlataforma.map((f) => f.id)).toEqual([...a.cerradas, a.enCurso]);
    expect(deA.map((f) => [f.estado, f.numero])).toEqual([
      ["cerrada", 1],
      ["cerrada", 2],
      ["en_curso", null],
    ]);
  });

  it("R24: el superadmin ve la en curso con su total parcial y la cuota prevista, igual que la empresa; sin número", async () => {
    const lectura = (await repo.deEmpresaParaPlataforma(c)).map(vista);
    const m = mensual as { id: string; nombre: string };
    const primera = {
      numero: null,
      desde: cero("2026-11-01"),
      hasta: cero("2026-11-16"),
      periodicidad: "quincenal",
      planId: m.id,
      totalOrdenes: "0.00",
      cuota: null,
      primeraCuota: null,
      total: "0.00",
    };
    expect(lectura).toEqual([
      { ...primera, estado: "por_cerrar", hastaPrevisto: false },
      {
        estado: "en_curso",
        numero: null,
        desde: cero("2026-11-16"),
        hasta: cero("2026-12-01"),
        hastaPrevisto: true,
        periodicidad: "quincenal",
        planId: m.id,
        totalOrdenes: "0.00",
        cuota: cuotaCompleta(m, "mensual", "2026-12-01", "2027-01-01", "31000.00", "31000.00", 31),
        primeraCuota: null,
        total: "31000.00",
      },
    ]);
    // La en curso de A, del 1 al 15 de diciembre, con la cuota de la segunda quincena prevista.
    const deA = await repo.deEmpresaParaPlataforma(a.id);
    expect(deA[2]).toMatchObject({ estado: "en_curso", numero: null, hastaPrevisto: true, cerradaAt: null, total: "15500.00" });
    expect(cuotaVista(deA[2].cuota)).toMatchObject({ desde: cero("2026-12-16"), cuota: "15500.00", diasCobrados: 16 });
  });
});
