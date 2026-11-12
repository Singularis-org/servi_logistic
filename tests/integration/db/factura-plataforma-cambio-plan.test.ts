import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { EfectoElegido } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { TipoCobro } from "@/lib/types/planes";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrden, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-118 · T6.2 (design §2.3–§2.5, §4.4, §8; R5, R8, R15–R17, R28, R29, R39) — las facturas de la plataforma
// cuando cambia el plan de la empresa, con `PlanesRepository` REAL (`aplicarEnTx` llama a
// `factura_plataforma_tomar_cambio`) y el cierre por `FacturaPlataformaRepository.cerrar`. Cada caso en una
// transacción que se revierte; el repositorio de planes abre las suyas como SAVEPOINT.
//
// El reloj va por parámetro: el «ahora» de `asignar` y de `aplicarCambioDeEmpresa` (la cola del cambio
// pendiente, que corre a las 00:00 del efecto) y el `p_ahora` del cierre (la corrida de las :10). Los
// cambios pendientes de antes de esta ficha o hechos por otra vía se escriben por SQL a mano en
// `organizacion.plan_cambio_*` y los aplica la cola real.
//
// R30 por P9 (T11.2): un cambio a un tipo más largo guardado por `PlanesService` con su reloj fijo.
// T15.3: R36 (la periodicidad de órdenes del plan editada en los dos sentidos, por `PlanesService`) y R38 (un
// cambio a un plan de órdenes mensuales con efecto en un corte; el caso «R16: un plan con órdenes mensuales
// tomado por una factura quincenal…» es el mismo con tipo quincenal → mensual). R33 queda fuera de este archivo.
// Review m4 (R39, humano 2026-11-11): el cierre espera también a una edición programada de la periodicidad del
// plan que el barrido aún no aplicó, y no abre la siguiente con la periodicidad vieja.
// SLT-128 (design §2.2; R7, R9): m4 se rehace con la recepción de cada empresa. El cierre espera a la recepción
// pendiente de la empresa (de cualquier edición programada, no solo de la periodicidad); cada empresa cambia de
// periodicidad en SU recepción y la factura que se cierra después lleva el nombre nuevo en la cuota.
//
// Precios: quincenal 15 500 = 31 000 al mes con tipo quincenal; mensual 31 000; anual 372 000. Las horas son
// las de la plataforma (−06:00): las 00:00 del día D son `cero(D)`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const MINUTO_MS = 60_000;
const ACTOR = randomUUID();
const SUPERADMIN: Actor = { usuarioId: ACTOR, rol: "superadmin", organizacionId: null };

const mas = (iso: string, minutos: number) => new Date(new Date(iso).getTime() + minutos * MINUTO_MS).toISOString();
/** La corrida de las 00:10 de la plataforma del día `fecha`. */
const corrida = (fecha: string) => mas(cero(fecha), 10);
/** La cola del cambio pendiente: 30 segundos después de las 00:00 del día `fecha`. */
const cola = (fecha: string) => new Date(new Date(cero(fecha)).getTime() + 30_000).toISOString();

let base: PrismaClient;

/* -------------------------------------------------------------------------- */
/* Lectura                                                                     */
/* -------------------------------------------------------------------------- */

interface Factura {
  id: string;
  numero: number | null;
  estado: string;
  desde: string;
  hasta: string | null;
  periodicidad: string;
  plan_id: string | null;
  tipo_cobro: string | null;
  cargos: string | null;
  total_ordenes: string | null;
  cuota_plan_id: string | null;
  cuota_tipo_cobro: string | null;
  cuota_desde: string | null;
  cuota_hasta: string | null;
  cuota: string | null;
  dias_cobrados: number | null;
  dias_periodo: number | null;
  marca: string | null;
  primera_cuota_hasta: string | null;
  primera_cuota_plan_id: string | null;
  primera_cuota_tipo_cobro: string | null;
  primera_cuota_precio_mensual: string | null;
  primera_cuota: string | null;
  primera_cuota_dias_cobrados: number | null;
  primera_cuota_dias_periodo: number | null;
  total: string | null;
}

async function facturas(tx: TxDeTest, organizacionId: string): Promise<Factura[]> {
  return tx.$queryRawUnsafe<Factura[]>(
    `SELECT "id", "numero", "estado", to_char("desde_at", ${ISO}) AS desde, to_char("hasta_at", ${ISO}) AS hasta,
            "periodicidad", "plan_id", "tipo_cobro", "cargos"::text AS cargos, "total_ordenes"::text AS total_ordenes,
            "cuota_plan_id", "cuota_tipo_cobro", to_char("cuota_desde_at", ${ISO}) AS cuota_desde,
            to_char("cuota_hasta_at", ${ISO}) AS cuota_hasta, "cuota"::text AS cuota, "dias_cobrados", "dias_periodo",
            to_char("primera_cuota_desde_at", ${ISO}) AS marca, to_char("primera_cuota_hasta_at", ${ISO}) AS primera_cuota_hasta,
            "primera_cuota_plan_id", "primera_cuota_tipo_cobro", "primera_cuota_precio_mensual"::text AS primera_cuota_precio_mensual,
            "primera_cuota"::text AS primera_cuota, "primera_cuota_dias_cobrados", "primera_cuota_dias_periodo",
            "total"::text AS total
       FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "desde_at"`,
    organizacionId,
  );
}

/** Cada fila entera en texto: lo que un cambio a medias movería. */
async function fotoDeFilas(tx: TxDeTest, organizacionId: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT f::text AS l FROM "factura_plataforma" f WHERE f."organizacion_id" = $1 ORDER BY f."desde_at"`,
    organizacionId,
  );
  return filas.map((f) => f.l);
}

/** Lo esencial de cada factura: intervalo, plan de las órdenes, la cuota de la emisión y la primera cuota. */
const resumen = (f: Factura) => ({
  estado: f.estado,
  desde: f.desde,
  hasta: f.hasta,
  plan: f.plan_id,
  cuota: f.cuota,
  cuotaDesde: f.cuota_desde,
  primera: f.primera_cuota,
  marca: f.marca,
});

/* -------------------------------------------------------------------------- */
/* Escritura (como dueño) y el reloj                                           */
/* -------------------------------------------------------------------------- */

async function planConPrecio(tx: TxDeTest, mensual: string, periodicidad: "quincenal" | "mensual" = "quincenal"): Promise<string> {
  const id = await crearPlan(tx);
  await tx.$executeRawUnsafe(`UPDATE "plan" SET "precio_mensual" = $2::numeric, "periodicidad_ordenes" = $3 WHERE "id" = $1`, id, mensual, periodicidad);
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = $2::numeric WHERE "plan_id" = $1`, id, mensual);
  return id;
}

/** Una empresa con su alta en `alta`; con plan, como si lo tuviera desde el alta (sin marca de primera cuota). */
async function empresa(tx: TxDeTest, alta: string, plan?: { id: string; tipo: TipoCobro }): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, e.id, alta);
  if (plan) {
    await tx.$executeRawUnsafe(
      `UPDATE "organizacion" SET "plan_id" = $2, "plan_tipo_cobro" = $3, "plan_ciclo_ancla_at" = $4::timestamp WHERE "id" = $1`,
      e.id,
      plan.id,
      plan.tipo,
      alta,
    );
  }
  return e;
}

/** Un cargo de una orden nueva con su instante (el cargo del alta de la orden, con el reloj real, se borra). */
async function cargo(tx: TxDeTest, e: EmpresaPorcentual, monto: string, en: string): Promise<void> {
  const orden = await crearOrden(tx, e);
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, orden);
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     VALUES ($1, $2, $3, 1, 'cargo', 'plan', $4::numeric, $5::timestamp)`,
    `slt118-${randomUUID()}`,
    e.id,
    orden,
    monto,
    en,
  );
}

function cerrar(tx: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(tx).cerrar(organizacionId, new Date(ahora));
}

const efecto = (clase: EfectoElegido["clase"], fecha: string): EfectoElegido => ({
  clase,
  fecha,
  desde: inicioDelDiaPlataforma(fecha),
  elegida: true,
});

/** «Asignar» del superadmin por el repositorio real; `ahora` decide si se aplica en el acto o queda pendiente. */
async function asignar(
  tx: TxDeTest,
  organizacionId: string,
  plan: string,
  clase: EfectoElegido["clase"],
  fecha: string,
  tipo: TipoCobro,
  ahora: string,
): Promise<{ pendiente: boolean }> {
  await fijarEmpresa(tx, "");
  const r = await planesEnTx(tx).asignar(organizacionId, plan, ACTOR, efecto(clase, fecha), tipo, new Date(ahora));
  if (r.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(r)}`);
  return { pendiente: r.pendiente };
}

/**
 * R36: el superadmin edita en el acto la periodicidad de órdenes del plan el 10 de noviembre por `PlanesService`
 * (con el repositorio real), mandando el resto del plan tal cual.
 */
async function editarPeriodicidad(
  tx: TxDeTest,
  planId: string,
  periodicidadOrdenes: "quincenal" | "mensual",
  programada: { vigenteDesde: string; nombre?: string } | null = null,
) {
  const plan = await planesEnTx(tx).plan(planId);
  if (plan === null) throw new Error(`no existe el plan ${planId}`);
  await fijarEmpresa(tx, "");
  const servicio = new PlanesService(planesEnTx(tx), () => new Date("2026-11-10T15:00:00.000Z"));
  return servicio.editar(SUPERADMIN, {
    planId,
    nombre: programada?.nombre ?? plan.nombre,
    topes: plan.topes,
    modulos: plan.modulos,
    precio: plan.precio,
    costoPorOrden: plan.costoPorOrden,
    costoPorOrdenPorcentual: plan.costoPorOrdenPorcentual,
    periodicidadOrdenes,
    vigenteDesde: programada?.vigenteDesde ?? null,
  });
}

/**
 * SLT-128 (design §3.3): la cola (o el barrido) da a UNA empresa la edición programada del plan, en su recepción,
 * con su reloj.
 */
async function recibirEdicionProgramada(tx: TxDeTest, planId: string, organizacionId: string, ahora: string): Promise<void> {
  const [{ cambio }] = await tx.$queryRawUnsafe<{ cambio: string }[]>(
    `SELECT "id" AS cambio FROM "plan_cambio_programado" WHERE "plan_id" = $1`,
    planId,
  );
  await fijarEmpresa(tx, "");
  const r = await planesEnTx(tx).recibirCambio({ planId, cambioId: cambio }, organizacionId, new Date(ahora));
  if (r.estado !== "aplicado") throw new Error(`recibirCambio: ${JSON.stringify(r)}`);
}

/** La recepción aún sin recibir de la empresa, como `cero(...)`; `null` si no tiene. */
async function recepcionDe(tx: TxDeTest, organizacionId: string): Promise<string | null> {
  const filas = await tx.$queryRawUnsafe<{ recibe: string }[]>(
    `SELECT to_char("recibe_at", ${ISO}) AS recibe FROM "plan_cambio_recepcion" WHERE "empresa_id" = $1 AND "recibido_at" IS NULL`,
    organizacionId,
  );
  return filas[0]?.recibe ?? null;
}

/** Un pendiente guardado por otra vía (antes de esta ficha o por SQL), con su efecto a las 00:00 de `fecha`. */
async function pendientePorSql(tx: TxDeTest, organizacionId: string, plan: string, tipo: TipoCobro, fecha: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_cambio_id" = $2, "plan_cambio_plan_id" = $3, "plan_cambio_tipo_cobro" = $4,
            "plan_cambio_desde_at" = $5::timestamp, "plan_cambio_actor_id" = $6 WHERE "id" = $1`,
    organizacionId,
    randomUUID(),
    plan,
    tipo,
    cero(fecha),
    ACTOR,
  );
}

/** La cola aplica el pendiente de la empresa (`plan_aplicar_cambio_empresa`) con su reloj. */
async function aplicarPendiente(tx: TxDeTest, organizacionId: string, ahora: string): Promise<void> {
  const [{ cambio }] = await tx.$queryRawUnsafe<{ cambio: string | null }[]>(
    `SELECT "plan_cambio_id" AS cambio FROM "organizacion" WHERE "id" = $1`,
    organizacionId,
  );
  if (cambio === null) throw new Error("la empresa no tiene cambio pendiente");
  await fijarEmpresa(tx, "");
  const r = await planesEnTx(tx).aplicarCambioDeEmpresa({ organizacionId, cambioId: cambio }, new Date(ahora));
  if (r.estado !== "aplicado") throw new Error(`aplicarCambioDeEmpresa: ${JSON.stringify(r)}`);
}

/** Corre `sql` en un SAVEPOINT. El SQLSTATE o `null`. */
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

describeSiHayBase("SLT-118 — las facturas de la plataforma cuando cambia el plan (R5, R8, R15–R17, R28–R30, R36, R38, R39)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  /* ------------------------------- Cambios -------------------------------- */

  it("R15, R39: mensual → quincenal al 1 de diciembre: la del 16 al 30 espera a la cola y sale entera con el plan de antes y la cuota quincenal del nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const mensual = await planConPrecio(tx, "31000.00");
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: mensual, tipo: "mensual" });
      // Una corrida del 10 abre la factura en curso del 1, para que el pendiente tenga qué no tocar.
      await cerrar(tx, e.id, "2026-11-10T14:00:00.000Z");
      const antesDelCambio = await fotoDeFilas(tx, e.id);
      const guardado = await asignar(tx, e.id, quincenal, "cambio", "2026-12-01", "quincenal", "2026-11-10T15:00:00.000Z");
      const trasGuardar = await fotoDeFilas(tx, e.id);
      const el16 = await cerrar(tx, e.id, corrida("2026-11-16"));
      // R39: a las 00:10 del 1 la cola aún no aplicó el cambio: la del 16 al 30 no se cierra.
      const enEspera = await cerrar(tx, e.id, corrida("2026-12-01"));
      const esperando = await facturas(tx, e.id);
      await aplicarPendiente(tx, e.id, mas(cero("2026-12-01"), 40));
      const trasAplicar = await cerrar(tx, e.id, mas(cero("2026-12-01"), 70));
      const el16Dic = await cerrar(tx, e.id, corrida("2026-12-16"));
      return { mensual, quincenal, guardado, antesDelCambio, trasGuardar, el16, enEspera, esperando, trasAplicar, el16Dic, lista: await facturas(tx, e.id) };
    });
    expect(r.guardado.pendiente).toBe(true);
    // R17: el pendiente no toca ninguna factura.
    expect(r.antesDelCambio).toHaveLength(1);
    expect(r.trasGuardar).toEqual(r.antesDelCambio);
    expect([r.el16, r.enEspera, r.trasAplicar, r.el16Dic]).toEqual([1, 0, 1, 1]);
    expect(r.esperando.map((f) => [f.estado, f.desde, f.hasta])).toEqual([
      ["cerrada", cero("2026-11-01"), cero("2026-11-16")],
      ["por_cerrar", cero("2026-11-16"), cero("2026-12-01")],
      ["en_curso", cero("2026-12-01"), null],
    ]);
    expect(r.lista.map(resumen)).toEqual([
      { estado: "cerrada", desde: cero("2026-11-01"), hasta: cero("2026-11-16"), plan: r.mensual, cuota: null, cuotaDesde: null, primera: null, marca: null },
      // Las órdenes del 16 al 30 con el plan de antes; la cuota, la quincena del 1 de diciembre del plan nuevo.
      { estado: "cerrada", desde: cero("2026-11-16"), hasta: cero("2026-12-01"), plan: r.mensual, cuota: "15500.00", cuotaDesde: cero("2026-12-01"), primera: null, marca: null },
      { estado: "cerrada", desde: cero("2026-12-01"), hasta: cero("2026-12-16"), plan: r.quincenal, cuota: "15500.00", cuotaDesde: cero("2026-12-16"), primera: null, marca: null },
      { estado: "en_curso", desde: cero("2026-12-16"), hasta: null, plan: r.quincenal, cuota: null, cuotaDesde: null, primera: null, marca: null },
    ]);
    expect(r.lista[1]).toMatchObject({ tipo_cobro: "mensual", cuota_plan_id: r.quincenal, cuota_tipo_cobro: "quincenal" });
  });

  it("R15: un pendiente por SQL con efecto el 10 (a mitad de factura): la del 1 al 15 sale entera con el plan de antes y 15 500.00 del nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const mensual = await planConPrecio(tx, "31000.00");
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: mensual, tipo: "mensual" });
      await cargo(tx, e, "100.00", "2026-11-12T15:00:00.000Z");
      await pendientePorSql(tx, e.id, quincenal, "quincenal", "2026-11-10");
      await aplicarPendiente(tx, e.id, cola("2026-11-10"));
      const trasAplicar = await facturas(tx, e.id);
      await cerrar(tx, e.id, corrida("2026-11-16"));
      return { mensual, quincenal, trasAplicar, lista: await facturas(tx, e.id) };
    });
    // Sin corte: la en curso sigue desde el 1, con el plan, el tipo y la periodicidad de antes.
    expect(r.trasAplicar.map((f) => [f.estado, f.desde, f.hasta, f.plan_id, f.tipo_cobro, f.periodicidad])).toEqual([
      ["en_curso", cero("2026-11-01"), null, r.mensual, "mensual", "quincenal"],
    ]);
    expect(r.lista.map(resumen)).toEqual([
      { estado: "cerrada", desde: cero("2026-11-01"), hasta: cero("2026-11-16"), plan: r.mensual, cuota: "15500.00", cuotaDesde: cero("2026-11-16"), primera: null, marca: null },
      { estado: "en_curso", desde: cero("2026-11-16"), hasta: null, plan: r.quincenal, cuota: null, cuotaDesde: null, primera: null, marca: null },
    ]);
    expect(r.lista[0]).toMatchObject({ cargos: "100.00", tipo_cobro: "mensual", cuota_plan_id: r.quincenal, total: "15600.00" });
    expect(r.lista[1]).toMatchObject({ tipo_cobro: "quincenal" });
  });

  it("R8: un pendiente por SQL quincenal → mensual con efecto el 16 (a mitad del mes): la emitida el 16 sin cuota y la mensual en la del 1 de diciembre", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const mensual = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: quincenal, tipo: "quincenal" });
      await pendientePorSql(tx, e.id, mensual, "mensual", "2026-11-16");
      await aplicarPendiente(tx, e.id, cola("2026-11-16"));
      await cerrar(tx, e.id, corrida("2026-11-16"));
      await cerrar(tx, e.id, corrida("2026-12-01"));
      return { quincenal, mensual, lista: await facturas(tx, e.id) };
    });
    expect(r.lista.map(resumen)).toEqual([
      { estado: "cerrada", desde: cero("2026-11-01"), hasta: cero("2026-11-16"), plan: r.quincenal, cuota: null, cuotaDesde: null, primera: null, marca: null },
      // R16: el efecto es su `desde`: pasa entera al plan nuevo.
      { estado: "cerrada", desde: cero("2026-11-16"), hasta: cero("2026-12-01"), plan: r.mensual, cuota: "31000.00", cuotaDesde: cero("2026-12-01"), primera: null, marca: null },
      { estado: "en_curso", desde: cero("2026-12-01"), hasta: null, plan: r.mensual, cuota: null, cuotaDesde: null, primera: null, marca: null },
    ]);
    expect(r.lista[1]).toMatchObject({ cuota_tipo_cobro: "mensual", cuota_hasta: cero("2027-01-01"), dias_cobrados: 31 });
  });

  it("R16: un cambio aplicado después del cierre de su factura no cambia la cerrada; la en curso toma el plan nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const mensual = await planConPrecio(tx, "31000.00");
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: mensual, tipo: "mensual" });
      await cerrar(tx, e.id, corrida("2026-12-01"));
      const cerradas = (await fotoDeFilas(tx, e.id)).slice(0, 2);
      const total = (await facturas(tx, e.id)).length;
      // Con efecto el 1, guardado el 3 (por SQL o un pendiente de antes): se aplica en el acto.
      const aplicado = await asignar(tx, e.id, quincenal, "cambio", "2026-12-01", "quincenal", "2026-12-03T15:00:00.000Z");
      const trasAplicar = await facturas(tx, e.id);
      const cerradasTras = (await fotoDeFilas(tx, e.id)).slice(0, 2);
      await cerrar(tx, e.id, corrida("2026-12-16"));
      return { mensual, quincenal, aplicado, total, cerradas, cerradasTras, trasAplicar, lista: await facturas(tx, e.id) };
    });
    expect(r.aplicado.pendiente).toBe(false);
    expect(r.trasAplicar).toHaveLength(r.total);
    expect(r.cerradasTras).toEqual(r.cerradas);
    expect(r.trasAplicar[2]).toMatchObject({ estado: "en_curso", desde: cero("2026-12-01"), plan_id: r.quincenal, tipo_cobro: "quincenal", marca: null });
    // La de diciembre del plan de antes ya salió (31 000.00) y no se devuelve; la del 1 al 15 sale con el nuevo.
    expect(r.lista[1]).toMatchObject({ cuota: "31000.00", cuota_plan_id: r.mensual });
    expect(r.lista[2]).toMatchObject({ estado: "cerrada", plan_id: r.quincenal, cuota: "15500.00", cuota_desde: cero("2026-12-16") });
  });

  it("R16: un plan con órdenes mensuales tomado por una factura quincenal en su `desde`: su fin pasa al 1 del mes siguiente", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const mensualDeMes = await planConPrecio(tx, "31000.00", "mensual");
      const e = await empresa(tx, cero("2026-11-01"), { id: quincenal, tipo: "quincenal" });
      await asignar(tx, e.id, mensualDeMes, "cambio", "2026-12-01", "mensual", "2026-11-10T15:00:00.000Z");
      await cerrar(tx, e.id, corrida("2026-11-16"));
      await aplicarPendiente(tx, e.id, cola("2026-12-01"));
      const el1 = await cerrar(tx, e.id, corrida("2026-12-01"));
      const el16 = await cerrar(tx, e.id, corrida("2026-12-16"));
      const enCurso = (await facturas(tx, e.id)).at(-1);
      const enero = await cerrar(tx, e.id, corrida("2027-01-01"));
      return { mensualDeMes, el1, el16, enero, enCurso, lista: await facturas(tx, e.id) };
    });
    expect([r.el1, r.el16, r.enero]).toEqual([1, 0, 1]);
    expect(r.enCurso).toMatchObject({ estado: "en_curso", desde: cero("2026-12-01"), periodicidad: "mensual", plan_id: r.mensualDeMes });
    expect(r.lista.map((f) => [f.desde, f.hasta, f.periodicidad, f.cuota, f.cuota_desde])).toEqual([
      [cero("2026-11-01"), cero("2026-11-16"), "quincenal", "15500.00", cero("2026-11-16")],
      [cero("2026-11-16"), cero("2026-12-01"), "quincenal", "31000.00", cero("2026-12-01")],
      [cero("2026-12-01"), cero("2027-01-01"), "mensual", "31000.00", cero("2027-01-01")],
      [cero("2027-01-01"), null, "mensual", null, null],
    ]);
  });

  it("R17: guardar, reemplazar y cancelar un pendiente, o editar el precio del plan, no cambia ninguna factura", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const mensual = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: quincenal, tipo: "quincenal" });
      await cerrar(tx, e.id, corrida("2026-12-01"));
      const fotos = [await fotoDeFilas(tx, e.id)];
      await asignar(tx, e.id, mensual, "cambio", "2027-01-01", "mensual", "2026-12-03T15:00:00.000Z");
      fotos.push(await fotoDeFilas(tx, e.id));
      // Reemplazado por otro pendiente con otra fecha y otro tipo.
      await asignar(tx, e.id, mensual, "cambio", "2026-12-16", "quincenal", "2026-12-03T16:00:00.000Z");
      fotos.push(await fotoDeFilas(tx, e.id));
      await fijarEmpresa(tx, "");
      const cancelado = await planesEnTx(tx).cancelarCambioEmpresa(e.id, ACTOR);
      fotos.push(await fotoDeFilas(tx, e.id));
      // Un precio nuevo del plan con efecto el 5 de diciembre (lo que escribe la edición de SL-24).
      await tx.$executeRawUnsafe(
        `INSERT INTO "plan_precio_historial" ("plan_id", "desde_at", "precio_mensual", "descuentos") VALUES ($1, $2::timestamp, 40000.00, '{}')`,
        quincenal,
        cero("2026-12-05"),
      );
      fotos.push(await fotoDeFilas(tx, e.id));
      await cerrar(tx, e.id, corrida("2026-12-16"));
      return { cancelado, fotos, lista: await facturas(tx, e.id) };
    });
    expect(r.cancelado).toEqual({ estado: "ok" });
    expect(r.fotos[0]).toHaveLength(3);
    for (const f of r.fotos) expect(f).toEqual(r.fotos[0]);
    // El precio rige por R8 desde la primera cuota cuyo período empieza en su efecto o después.
    expect(r.lista.map((f) => f.cuota)).toEqual(["15500.00", "15500.00", "20000.00", null]);
  });

  it("R30 (P9): quincenal → anual guardado por `PlanesService` el 10 de noviembre rige el 1 de enero; las emitidas el 16 de noviembre y el 1 y el 16 de diciembre llevan la quincena que empieza, la del 1 de enero la anual completa y ninguna queda corta", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: plan, tipo: "quincenal" });
      // Una corrida del 10 abre la factura en curso del 1, para que el pendiente tenga qué no tocar.
      await cerrar(tx, e.id, "2026-11-10T14:00:00.000Z");
      const antesDelCambio = await fotoDeFilas(tx, e.id);
      await fijarEmpresa(tx, "");
      // «Hoy» = 10 de noviembre y la fecha elegida, la de hoy: el tipo de referencia es el anual (P9).
      const servicio = new PlanesService(planesEnTx(tx), () => new Date("2026-11-10T15:00:00.000Z"));
      const guardado = await servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: e.id, tipoCobro: "anual", vigenteDesde: "2026-11-10" });
      const [pendiente] = await tx.$queryRawUnsafe<{ tipo: string; cambioTipo: string | null; cambioDesde: string | null }[]>(
        `SELECT "plan_tipo_cobro" AS tipo, "plan_cambio_tipo_cobro" AS "cambioTipo", to_char("plan_cambio_desde_at", ${ISO}) AS "cambioDesde"
           FROM "organizacion" WHERE "id" = $1`,
        e.id,
      );
      const trasGuardar = await fotoDeFilas(tx, e.id);
      const emitidas = [
        await cerrar(tx, e.id, corrida("2026-11-16")),
        await cerrar(tx, e.id, corrida("2026-12-01")),
        await cerrar(tx, e.id, corrida("2026-12-16")),
      ];
      // El 1 de enero, en el orden normal: la cola a las 00:00:30 y el cierre a las 00:10.
      await aplicarPendiente(tx, e.id, cola("2027-01-01"));
      emitidas.push(await cerrar(tx, e.id, corrida("2027-01-01")));
      emitidas.push(await cerrar(tx, e.id, corrida("2027-01-16")));
      return { plan, guardado, pendiente, antesDelCambio, trasGuardar, emitidas, lista: await facturas(tx, e.id) };
    });
    // R30, P9: el efecto va al 1 de enero (el próximo inicio del anual), no al 16 de noviembre (el del quincenal).
    expect(r.guardado).toEqual({ estado: "ok", cambio: true, vigenteDesde: "2027-01-01" });
    expect(r.pendiente).toEqual({ tipo: "quincenal", cambioTipo: "anual", cambioDesde: cero("2027-01-01") });
    // R17: guardar el pendiente no toca ninguna factura.
    expect(r.trasGuardar).toEqual(r.antesDelCambio);
    expect(r.emitidas).toEqual([1, 1, 1, 1, 1]);
    expect(
      r.lista.map((f) => [f.estado, f.desde, f.hasta, f.plan_id, f.tipo_cobro, f.cuota_tipo_cobro, f.cuota, f.cuota_desde, f.cuota_hasta, f.primera_cuota, f.marca]),
    ).toEqual([
      // Hasta el 1 de enero la empresa sigue quincenal: cada emisión lleva la cuota de la quincena que empieza.
      ["cerrada", cero("2026-11-01"), cero("2026-11-16"), r.plan, "quincenal", "quincenal", "15500.00", cero("2026-11-16"), cero("2026-12-01"), null, null],
      ["cerrada", cero("2026-11-16"), cero("2026-12-01"), r.plan, "quincenal", "quincenal", "15500.00", cero("2026-12-01"), cero("2026-12-16"), null, null],
      ["cerrada", cero("2026-12-01"), cero("2026-12-16"), r.plan, "quincenal", "quincenal", "15500.00", cero("2026-12-16"), cero("2027-01-01"), null, null],
      // La emitida el 1 de enero: las órdenes del 16 al 31 con el tipo de antes y la cuota anual completa.
      ["cerrada", cero("2026-12-16"), cero("2027-01-01"), r.plan, "quincenal", "anual", "372000.00", cero("2027-01-01"), cero("2028-01-01"), null, null],
      // Ya anual: la emitida el 16 de enero no lleva cuota (el próximo año empieza el 1 de enero de 2028).
      ["cerrada", cero("2027-01-01"), cero("2027-01-16"), r.plan, "anual", null, null, null, null, null, null],
      ["en_curso", cero("2027-01-16"), null, r.plan, "anual", null, null, null, null, null, null],
    ]);
    // Ninguna factura corta: ni un corte el 10 ni una primera cuota proporcional; la anual cobra el año entero.
    expect(r.lista.filter((f) => f.hasta === cero("2026-11-10"))).toHaveLength(0);
    expect(r.lista[3]).toMatchObject({ dias_cobrados: 365, dias_periodo: 365 });
  });

  it("R38: mensual con órdenes quincenales a un plan mensual con órdenes mensuales, guardado el 10 de noviembre: efecto el 1 de diciembre; las dos de noviembre con el plan de antes, la emitida el 1 de diciembre con la cuota de diciembre del nuevo y la de diciembre entera con el nuevo", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await planConPrecio(tx, "31000.00");
      const nuevo = await planConPrecio(tx, "62000.00", "mensual");
      const e = await empresa(tx, cero("2026-11-01"), { id: antes, tipo: "mensual" });
      await cerrar(tx, e.id, "2026-11-10T14:00:00.000Z");
      // Guardado el 10 con la fecha del 10: el repositorio lo lleva al 1 de diciembre (R30).
      const guardado = await asignar(tx, e.id, nuevo, "cambio", "2026-11-10", "mensual", "2026-11-10T15:00:00.000Z");
      const [{ efecto }] = await tx.$queryRawUnsafe<{ efecto: string | null }[]>(
        `SELECT to_char("plan_cambio_desde_at", ${ISO}) AS efecto FROM "organizacion" WHERE "id" = $1`,
        e.id,
      );
      await cargo(tx, e, "100.00", "2026-11-20T15:00:00.000Z");
      await cargo(tx, e, "200.00", "2026-12-10T15:00:00.000Z");
      const emitidas = [await cerrar(tx, e.id, corrida("2026-11-16"))];
      await aplicarPendiente(tx, e.id, cola("2026-12-01"));
      emitidas.push(await cerrar(tx, e.id, corrida("2026-12-01")));
      emitidas.push(await cerrar(tx, e.id, corrida("2026-12-16")));
      emitidas.push(await cerrar(tx, e.id, corrida("2027-01-01")));
      return { antes, nuevo, guardado, efecto, emitidas, lista: await facturas(tx, e.id) };
    });
    expect(r.guardado.pendiente).toBe(true);
    expect(r.efecto).toBe(cero("2026-12-01"));
    // Con órdenes mensuales, el 16 de diciembre no hay corte.
    expect(r.emitidas).toEqual([1, 1, 0, 1]);
    expect(
      r.lista.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad, f.plan_id, f.cargos, f.cuota_plan_id, f.cuota, f.cuota_desde]),
    ).toEqual([
      // Las dos de noviembre: órdenes del plan de antes (quincenales). La del 16 no lleva cuota: el mensual empieza el 1.
      ["cerrada", cero("2026-11-01"), cero("2026-11-16"), "quincenal", r.antes, "0.00", null, null, null],
      // La emitida el 1 de diciembre: el cargo del 20 con el plan de antes y la cuota de diciembre del nuevo.
      ["cerrada", cero("2026-11-16"), cero("2026-12-01"), "quincenal", r.antes, "100.00", r.nuevo, "62000.00", cero("2026-12-01")],
      // Diciembre entero con el nuevo: el cargo del 10 y la cuota de enero.
      ["cerrada", cero("2026-12-01"), cero("2027-01-01"), "mensual", r.nuevo, "200.00", r.nuevo, "62000.00", cero("2027-01-01")],
      ["en_curso", cero("2027-01-01"), null, "mensual", r.nuevo, null, null, null, null],
    ]);
  });

  it("R36: la periodicidad del plan editada de quincenal a mensual el 10 de noviembre: la del 1 al 15 sigue quincenal, la siguiente va del 16 al 30 y después diciembre entero", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: plan, tipo: "mensual" });
      await cerrar(tx, e.id, "2026-11-10T14:00:00.000Z");
      const antesDeEditar = await fotoDeFilas(tx, e.id);
      const editado = await editarPeriodicidad(tx, plan, "mensual");
      const trasEditar = await fotoDeFilas(tx, e.id);
      const emitidas = [
        await cerrar(tx, e.id, corrida("2026-11-16")),
        await cerrar(tx, e.id, corrida("2026-12-01")),
        await cerrar(tx, e.id, corrida("2026-12-16")),
        await cerrar(tx, e.id, corrida("2027-01-01")),
      ];
      return { plan, editado, antesDeEditar, trasEditar, emitidas, lista: await facturas(tx, e.id) };
    });
    expect(r.editado).toMatchObject({ estado: "ok", cambio: true });
    // Editar no toca la factura en curso: sigue quincenal desde el 1.
    expect(r.trasEditar).toEqual(r.antesDeEditar);
    expect(r.emitidas).toEqual([1, 1, 0, 1]);
    expect(r.lista.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad, f.plan_id])).toEqual([
      ["cerrada", cero("2026-11-01"), cero("2026-11-16"), "quincenal", r.plan],
      // La siguiente se abre en su fin con la nueva: del 16 al fin del mes (R2).
      ["cerrada", cero("2026-11-16"), cero("2026-12-01"), "mensual", r.plan],
      ["cerrada", cero("2026-12-01"), cero("2027-01-01"), "mensual", r.plan],
      ["en_curso", cero("2027-01-01"), null, "mensual", r.plan],
    ]);
  });

  it("R36: la periodicidad del plan editada de mensual a quincenal el 10 de noviembre: la de noviembre sigue entera y la siguiente es la del 1 al 15 de diciembre", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00", "mensual");
      const e = await empresa(tx, cero("2026-11-01"), { id: plan, tipo: "mensual" });
      await cerrar(tx, e.id, "2026-11-10T14:00:00.000Z");
      const antesDeEditar = await fotoDeFilas(tx, e.id);
      const editado = await editarPeriodicidad(tx, plan, "quincenal");
      const trasEditar = await fotoDeFilas(tx, e.id);
      const emitidas = [
        await cerrar(tx, e.id, corrida("2026-11-16")),
        await cerrar(tx, e.id, corrida("2026-12-01")),
        await cerrar(tx, e.id, corrida("2026-12-16")),
      ];
      return { plan, editado, antesDeEditar, trasEditar, emitidas, lista: await facturas(tx, e.id) };
    });
    expect(r.editado).toMatchObject({ estado: "ok", cambio: true });
    expect(r.trasEditar).toEqual(r.antesDeEditar);
    // El 16 de noviembre no hay corte: la de noviembre se abrió mensual.
    expect(r.emitidas).toEqual([0, 1, 1]);
    expect(r.lista.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad, f.plan_id])).toEqual([
      ["cerrada", cero("2026-11-01"), cero("2026-12-01"), "mensual", r.plan],
      ["cerrada", cero("2026-12-01"), cero("2026-12-16"), "quincenal", r.plan],
      ["en_curso", cero("2026-12-16"), null, "quincenal", r.plan],
    ]);
  });

  it("SLT-128 R7, R9 (m4): órdenes quincenales → mensuales con F = 16 y dos empresas: la mensual cambia el 1 de diciembre y la bimestral el 1 de enero; cada cierre espera a SU recepción", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00");
      const mensual = await empresa(tx, cero("2026-11-01"), { id: plan, tipo: "mensual" });
      const bimestral = await empresa(tx, cero("2026-11-01"), { id: plan, tipo: "bimestral" });
      await cerrar(tx, mensual.id, "2026-11-10T14:00:00.000Z");
      await cerrar(tx, bimestral.id, "2026-11-10T14:00:00.000Z");
      const programada = await editarPeriodicidad(tx, plan, "mensual", { vigenteDesde: "2026-11-16" });
      const recepciones = { mensual: await recepcionDe(tx, mensual.id), bimestral: await recepcionDe(tx, bimestral.id) };
      // Control: una edición programada al 16 que no cambia la periodicidad (solo el nombre), con una empresa
      // mensual: su recepción es el 1 de diciembre, así que el cierre del 16 no la espera.
      const otro = await planConPrecio(tx, "31000.00");
      const control = await empresa(tx, cero("2026-11-01"), { id: otro, tipo: "mensual" });
      await editarPeriodicidad(tx, otro, "quincenal", { vigenteDesde: "2026-11-16", nombre: `Otro ${randomUUID().slice(0, 8)}` });
      const controlEl16 = await cerrar(tx, control.id, corrida("2026-11-16"));

      const deLaMensual: number[] = [];
      const deLaBimestral: number[] = [];
      deLaMensual.push(await cerrar(tx, mensual.id, corrida("2026-11-16")));
      deLaBimestral.push(await cerrar(tx, bimestral.id, corrida("2026-11-16")));
      // El 1 de diciembre la cola va tarde con la mensual: a las 00:10 la del 16 al 30 no se cierra.
      deLaMensual.push(await cerrar(tx, mensual.id, corrida("2026-12-01")));
      const mensualEsperando = await facturas(tx, mensual.id);
      deLaBimestral.push(await cerrar(tx, bimestral.id, corrida("2026-12-01")));
      await recibirEdicionProgramada(tx, plan, mensual.id, mas(cero("2026-12-01"), 40));
      deLaMensual.push(await cerrar(tx, mensual.id, mas(cero("2026-12-01"), 70)));
      deLaMensual.push(await cerrar(tx, mensual.id, corrida("2026-12-16")));
      deLaBimestral.push(await cerrar(tx, bimestral.id, corrida("2026-12-16")));
      // El 1 de enero, lo mismo con la bimestral; su recepción es la última y promueve el plan.
      deLaBimestral.push(await cerrar(tx, bimestral.id, corrida("2027-01-01")));
      const bimestralEsperando = await facturas(tx, bimestral.id);
      await recibirEdicionProgramada(tx, plan, bimestral.id, mas(cero("2027-01-01"), 40));
      deLaBimestral.push(await cerrar(tx, bimestral.id, mas(cero("2027-01-01"), 70)));
      deLaMensual.push(await cerrar(tx, mensual.id, corrida("2027-01-01")));
      for (const fecha of ["2027-01-16", "2027-02-01"]) {
        deLaMensual.push(await cerrar(tx, mensual.id, corrida(fecha)));
        deLaBimestral.push(await cerrar(tx, bimestral.id, corrida(fecha)));
      }
      const [columna] = await tx.$queryRawUnsafe<{ p: string }[]>(`SELECT "periodicidad_ordenes" AS p FROM "plan" WHERE "id" = $1`, plan);
      return {
        programada,
        recepciones,
        controlEl16,
        deLaMensual,
        deLaBimestral,
        mensualEsperando,
        bimestralEsperando,
        columna: columna.p,
        mensual: await facturas(tx, mensual.id),
        bimestral: await facturas(tx, bimestral.id),
      };
    });
    expect(r.programada).toMatchObject({ estado: "ok", cambio: true });
    expect(r.recepciones).toEqual({ mensual: cero("2026-12-01"), bimestral: cero("2027-01-01") });
    expect(r.controlEl16).toBe(1);
    // Mensual: 16 nov, 1 dic (espera), 1 dic tras recibir, 16 dic (sin corte), 1 ene, 16 ene (sin corte), 1 feb.
    expect(r.deLaMensual).toEqual([1, 0, 1, 0, 1, 0, 1]);
    // Bimestral: 16 nov, 1 dic, 16 dic, 1 ene (espera), 1 ene tras recibir, 16 ene (sin corte), 1 feb.
    expect(r.deLaBimestral).toEqual([1, 1, 1, 0, 1, 0, 1]);
    // En espera no se fija ni se abre la siguiente con la periodicidad vieja.
    expect(r.mensualEsperando.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad])).toEqual([
      ["cerrada", cero("2026-11-01"), cero("2026-11-16"), "quincenal"],
      ["en_curso", cero("2026-11-16"), null, "quincenal"],
    ]);
    expect(r.bimestralEsperando.at(-1)).toMatchObject({ estado: "en_curso", desde: cero("2026-12-16"), hasta: null, periodicidad: "quincenal" });
    // R7: la en curso cierra con la periodicidad con la que se abrió; la siguiente abre en la recepción con la nueva.
    expect(r.mensual.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad])).toEqual([
      ["cerrada", cero("2026-11-01"), cero("2026-11-16"), "quincenal"],
      ["cerrada", cero("2026-11-16"), cero("2026-12-01"), "quincenal"],
      ["cerrada", cero("2026-12-01"), cero("2027-01-01"), "mensual"],
      ["cerrada", cero("2027-01-01"), cero("2027-02-01"), "mensual"],
      ["en_curso", cero("2027-02-01"), null, "mensual"],
    ]);
    expect(r.bimestral.map((f) => [f.estado, f.desde, f.hasta, f.periodicidad])).toEqual([
      ["cerrada", cero("2026-11-01"), cero("2026-11-16"), "quincenal"],
      ["cerrada", cero("2026-11-16"), cero("2026-12-01"), "quincenal"],
      ["cerrada", cero("2026-12-01"), cero("2026-12-16"), "quincenal"],
      ["cerrada", cero("2026-12-16"), cero("2027-01-01"), "quincenal"],
      ["cerrada", cero("2027-01-01"), cero("2027-02-01"), "mensual"],
      ["en_curso", cero("2027-02-01"), null, "mensual"],
    ]);
    // R10: el plan pasa a mensual con la última recepción (la bimestral).
    expect(r.columna).toBe("mensual");
  });

  it("SLT-128 R9: una edición programada de solo el nombre con recepción el 16 que la cola aún no aplicó a las 00:10: la del 1 al 15 espera; recibida, se cierra con el nombre nuevo en la cuota", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: plan, tipo: "quincenal" });
      await cerrar(tx, e.id, "2026-11-10T14:00:00.000Z");
      const nombre = `Nuevo ${randomUUID().slice(0, 8)}`;
      const programada = await editarPeriodicidad(tx, plan, "quincenal", { vigenteDesde: "2026-11-16", nombre });
      const recepcion = await recepcionDe(tx, e.id);
      const enEspera = await cerrar(tx, e.id, corrida("2026-11-16"));
      const esperando = await facturas(tx, e.id);
      await recibirEdicionProgramada(tx, plan, e.id, mas(cero("2026-11-16"), 40));
      const trasRecibir = await cerrar(tx, e.id, mas(cero("2026-11-16"), 70));
      const nombres = await tx.$queryRawUnsafe<{ desde: string; plan_nombre: string | null; cuota_plan_nombre: string | null }[]>(
        `SELECT to_char("desde_at", ${ISO}) AS desde, "plan_nombre", "cuota_plan_nombre"
           FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "desde_at"`,
        e.id,
      );
      const [{ delPlan }] = await tx.$queryRawUnsafe<{ delPlan: string }[]>(`SELECT "nombre" AS "delPlan" FROM "plan" WHERE "id" = $1`, plan);
      return { plan, programada, recepcion, enEspera, esperando, trasRecibir, nombres, nombre, delPlan, lista: await facturas(tx, e.id) };
    });
    expect(r.programada).toMatchObject({ estado: "ok", cambio: true });
    expect(r.recepcion).toBe(cero("2026-11-16"));
    expect([r.enEspera, r.trasRecibir]).toEqual([0, 1]);
    expect(r.esperando.map((f) => [f.estado, f.desde, f.hasta])).toEqual([["en_curso", cero("2026-11-01"), null]]);
    expect(r.lista.map(resumen)).toEqual([
      { estado: "cerrada", desde: cero("2026-11-01"), hasta: cero("2026-11-16"), plan: r.plan, cuota: "15500.00", cuotaDesde: cero("2026-11-16"), primera: null, marca: null },
      { estado: "en_curso", desde: cero("2026-11-16"), hasta: null, plan: r.plan, cuota: null, cuotaDesde: null, primera: null, marca: null },
    ]);
    // La cerrada lleva el nombre nuevo en la cuota (la de la quincena que empieza en la recepción) y la siguiente se
    // abre con él. Al ser la única empresa, el plan ya pasó a la versión nueva (R10).
    expect(r.nombres.map((f) => [f.desde, f.cuota_plan_nombre])).toEqual([
      [cero("2026-11-01"), r.nombre],
      [cero("2026-11-16"), null],
    ]);
    expect(r.nombres[1].plan_nombre).toBe(r.nombre);
    expect(r.delPlan).toBe(r.nombre);
  });

  /* ------------------------- Primera asignación ------------------------- */

  it("R16, R5: quincenal con inicio el 1 aplicado el 12: nada se emite al aplicar; la del 16 lleva las órdenes del 1 al 15 y las dos cuotas", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-10-16"));
      await cerrar(tx, e.id, corrida("2026-11-01"));
      await cargo(tx, e, "100.00", "2026-11-05T15:00:00.000Z");
      const antes = await facturas(tx, e.id);
      const aplicado = await asignar(tx, e.id, quincenal, "inicio", "2026-11-01", "quincenal", "2026-11-12T15:00:00.000Z");
      const trasAplicar = await facturas(tx, e.id);
      const el16 = await cerrar(tx, e.id, corrida("2026-11-16"));
      return { quincenal, antes, aplicado, trasAplicar, el16, lista: await facturas(tx, e.id) };
    });
    expect(r.aplicado.pendiente).toBe(false);
    // P18: sin corte ni factura nueva; la en curso pasa entera al plan y lleva la marca de su `desde`.
    expect(r.trasAplicar.map((f) => [f.id, f.estado, f.desde, f.hasta])).toEqual(r.antes.map((f) => [f.id, f.estado, f.desde, f.hasta]));
    expect(r.trasAplicar[1]).toMatchObject({ estado: "en_curso", plan_id: r.quincenal, tipo_cobro: "quincenal", marca: cero("2026-11-01") });
    expect(r.el16).toBe(1);
    // R5: las dos cuotas, cada una con su plan, su tramo, su precio y sus días.
    expect(r.lista[1]).toMatchObject({
      estado: "cerrada",
      desde: cero("2026-11-01"),
      hasta: cero("2026-11-16"),
      plan_id: r.quincenal,
      cargos: "100.00",
      marca: cero("2026-11-01"),
      primera_cuota_hasta: cero("2026-11-16"),
      primera_cuota_plan_id: r.quincenal,
      primera_cuota_tipo_cobro: "quincenal",
      primera_cuota_precio_mensual: "31000.00",
      primera_cuota: "15500.00",
      primera_cuota_dias_cobrados: 15,
      primera_cuota_dias_periodo: 15,
      cuota_plan_id: r.quincenal,
      cuota_tipo_cobro: "quincenal",
      cuota_desde: cero("2026-11-16"),
      cuota_hasta: cero("2026-12-01"),
      cuota: "15500.00",
      dias_cobrados: 15,
      dias_periodo: 15,
      total: "31100.00",
    });
    // La emitida el 1, ya cerrada, no cambia.
    expect(r.lista[0]).toMatchObject({ estado: "cerrada", plan_id: null, cuota: null, primera_cuota: null });
  });

  it("R16, R29: mensual con inicio el 1 aplicado el 12: 31 000.00 de noviembre en la emitida el 16 y la de diciembre en la del 1", async () => {
    const r = await revertida(base, async (tx) => {
      const mensual = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-10-16"));
      await cerrar(tx, e.id, corrida("2026-11-01"));
      await asignar(tx, e.id, mensual, "inicio", "2026-11-01", "mensual", "2026-11-12T15:00:00.000Z");
      await cerrar(tx, e.id, corrida("2026-12-01"));
      return { mensual, lista: await facturas(tx, e.id) };
    });
    expect(r.lista.slice(1).map(resumen)).toEqual([
      { estado: "cerrada", desde: cero("2026-11-01"), hasta: cero("2026-11-16"), plan: r.mensual, cuota: null, cuotaDesde: null, primera: "31000.00", marca: cero("2026-11-01") },
      { estado: "cerrada", desde: cero("2026-11-16"), hasta: cero("2026-12-01"), plan: r.mensual, cuota: "31000.00", cuotaDesde: cero("2026-12-01"), primera: null, marca: null },
      { estado: "en_curso", desde: cero("2026-12-01"), hasta: null, plan: r.mensual, cuota: null, cuotaDesde: null, primera: null, marca: null },
    ]);
    expect(r.lista[1]).toMatchObject({ primera_cuota_hasta: cero("2026-12-01"), primera_cuota_dias_cobrados: 30, primera_cuota_dias_periodo: 30 });
  });

  it("R16: quincenal con inicio el 1 aplicado el 20: las dos quincenas en la emitida el 1 de diciembre y la cerrada del 1 al 15 igual", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-10-16"));
      await cerrar(tx, e.id, corrida("2026-11-16"));
      const cerradas = await fotoDeFilas(tx, e.id);
      await asignar(tx, e.id, quincenal, "inicio", "2026-11-01", "quincenal", "2026-11-20T15:00:00.000Z");
      const trasAplicar = await fotoDeFilas(tx, e.id);
      await cerrar(tx, e.id, corrida("2026-12-01"));
      return { quincenal, cerradas, trasAplicar, lista: await facturas(tx, e.id) };
    });
    // P4: la quincena del 1 al 15 no se cobra; su factura ya salió y no cambia.
    expect(r.trasAplicar.slice(0, 2)).toEqual(r.cerradas.slice(0, 2));
    expect(r.trasAplicar).toHaveLength(r.cerradas.length);
    expect(r.lista.map(resumen)).toEqual([
      { estado: "cerrada", desde: cero("2026-10-16"), hasta: cero("2026-11-01"), plan: null, cuota: null, cuotaDesde: null, primera: null, marca: null },
      { estado: "cerrada", desde: cero("2026-11-01"), hasta: cero("2026-11-16"), plan: null, cuota: null, cuotaDesde: null, primera: null, marca: null },
      { estado: "cerrada", desde: cero("2026-11-16"), hasta: cero("2026-12-01"), plan: r.quincenal, cuota: "15500.00", cuotaDesde: cero("2026-12-01"), primera: "15500.00", marca: cero("2026-11-16") },
      { estado: "en_curso", desde: cero("2026-12-01"), hasta: null, plan: r.quincenal, cuota: null, cuotaDesde: null, primera: null, marca: null },
    ]);
  });

  it("R16, R28, R29: alta el 10 con plan desde el 10 (P19): ninguna factura al aplicar; la del 16 con las órdenes del 10 al 15, 6 200.00 y 15 500.00", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, "2026-11-10T15:00:00.000Z");
      const aplicado = await asignar(tx, e.id, quincenal, "inicio", "2026-11-10", "quincenal", "2026-11-10T15:05:00.000Z");
      const trasAplicar = await facturas(tx, e.id);
      // Aunque corra el cierre ese mismo día: no hay factura que acabe el 10.
      const elMismoDia = await cerrar(tx, e.id, "2026-11-10T23:00:00.000Z");
      await cargo(tx, e, "100.00", "2026-11-12T15:00:00.000Z");
      const el16 = await cerrar(tx, e.id, corrida("2026-11-16"));
      const el1 = await cerrar(tx, e.id, corrida("2026-12-01"));
      const [{ conHastaEl10 }] = await tx.$queryRawUnsafe<{ conHastaEl10: number }[]>(
        `SELECT count(*)::int AS "conHastaEl10" FROM "factura_plataforma" WHERE "organizacion_id" = $1 AND "hasta_at" = $2::timestamp`,
        e.id,
        cero("2026-11-10"),
      );
      return { quincenal, aplicado, trasAplicar, elMismoDia, el16, el1, conHastaEl10, lista: await facturas(tx, e.id) };
    });
    expect(r.aplicado.pendiente).toBe(false);
    expect(r.trasAplicar.map((f) => [f.estado, f.desde, f.hasta, f.plan_id, f.marca])).toEqual([
      ["en_curso", cero("2026-11-10"), null, r.quincenal, cero("2026-11-10")],
    ]);
    expect([r.elMismoDia, r.el16, r.el1, r.conHastaEl10]).toEqual([0, 1, 1, 0]);
    expect(r.lista[0]).toMatchObject({
      desde: cero("2026-11-10"),
      hasta: cero("2026-11-16"),
      cargos: "100.00",
      primera_cuota: "6200.00",
      primera_cuota_hasta: cero("2026-11-16"),
      primera_cuota_dias_cobrados: 6,
      primera_cuota_dias_periodo: 15,
      cuota: "15500.00",
      cuota_desde: cero("2026-11-16"),
      cuota_hasta: cero("2026-12-01"),
      total: "21800.00",
    });
    expect(r.lista[1]).toMatchObject({ desde: cero("2026-11-16"), hasta: cero("2026-12-01"), cuota: "15500.00", primera_cuota: null, marca: null });
  });

  it("R16, R39: inicio el 16 que aplica la cola: la marca va en la emitida el 16, sin corte; si el cierre llega antes que la cola, espera", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      // La cola a las 00:00:30 y el cierre a las 00:10 (el orden normal).
      const enHora = await empresa(tx, cero("2026-11-01"));
      await asignar(tx, enHora.id, quincenal, "inicio", "2026-11-16", "quincenal", "2026-11-10T15:00:00.000Z");
      await aplicarPendiente(tx, enHora.id, cola("2026-11-16"));
      const trasAplicar = await facturas(tx, enHora.id);
      await cerrar(tx, enHora.id, corrida("2026-11-16"));
      // El cierre antes que la cola (R39): espera; tras la cola, la corrida siguiente la cierra igual.
      const tarde = await empresa(tx, cero("2026-11-01"));
      await asignar(tx, tarde.id, quincenal, "inicio", "2026-11-16", "quincenal", "2026-11-10T15:00:00.000Z");
      const enEspera = await cerrar(tx, tarde.id, corrida("2026-11-16"));
      await aplicarPendiente(tx, tarde.id, mas(cero("2026-11-16"), 40));
      const trasLaCola = await cerrar(tx, tarde.id, mas(cero("2026-11-16"), 70));
      return { quincenal, trasAplicar, enHora: await facturas(tx, enHora.id), enEspera, trasLaCola, tarde: await facturas(tx, tarde.id) };
    });
    expect(r.trasAplicar.map((f) => [f.estado, f.desde, f.hasta, f.plan_id, f.marca])).toEqual([
      ["por_cerrar", cero("2026-11-01"), cero("2026-11-16"), null, cero("2026-11-16")],
      ["en_curso", cero("2026-11-16"), null, r.quincenal, null],
    ]);
    expect([r.enEspera, r.trasLaCola]).toEqual([0, 1]);
    for (const lista of [r.enHora, r.tarde]) {
      // Las órdenes sin plan del 1 al 15 y la primera cuota por adelantado, una sola vez (sin la cuota de la emisión).
      expect(lista[0]).toMatchObject({
        estado: "cerrada",
        plan_id: null,
        marca: cero("2026-11-16"),
        primera_cuota: "15500.00",
        primera_cuota_plan_id: r.quincenal,
        primera_cuota_hasta: cero("2026-12-01"),
        cuota: null,
        total: "15500.00",
      });
    }
  });

  it("R28, R29: quincenal con inicio el 5 aplicado en el acto: una sola factura emitida el 5 con las órdenes sin plan y 11 366.67", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"));
      await cargo(tx, e, "100.00", "2026-11-03T15:00:00.000Z");
      await asignar(tx, e.id, quincenal, "inicio", "2026-11-05", "quincenal", "2026-11-07T15:00:00.000Z");
      const trasAplicar = await facturas(tx, e.id);
      await cerrar(tx, e.id, corrida("2026-11-08"));
      await cerrar(tx, e.id, corrida("2026-11-16"));
      return { quincenal, trasAplicar, lista: await facturas(tx, e.id) };
    });
    expect(r.trasAplicar.map((f) => [f.estado, f.desde, f.hasta, f.plan_id, f.periodicidad, f.marca])).toEqual([
      ["por_cerrar", cero("2026-11-01"), cero("2026-11-05"), null, "quincenal", cero("2026-11-05")],
      ["en_curso", cero("2026-11-05"), null, r.quincenal, "quincenal", null],
    ]);
    expect(r.lista.filter((f) => f.hasta === cero("2026-11-05"))).toHaveLength(1);
    expect(r.lista[0]).toMatchObject({
      estado: "cerrada",
      plan_id: null,
      cargos: "100.00",
      primera_cuota: "11366.67",
      primera_cuota_plan_id: r.quincenal,
      primera_cuota_hasta: cero("2026-11-16"),
      primera_cuota_dias_cobrados: 11,
      primera_cuota_dias_periodo: 15,
      cuota: null,
      total: "11466.67",
    });
    expect(r.lista[1]).toMatchObject({ estado: "cerrada", desde: cero("2026-11-05"), hasta: cero("2026-11-16"), plan_id: r.quincenal, cuota: "15500.00", primera_cuota: null });
  });

  it("R28, R29: inicio el 18 (futuro, lo aplica la cola): una sola factura del 16 al 17 con 13 433.33, quincenal y mensual", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const mensual = await planConPrecio(tx, "31000.00");
      const casos: { plan: string; tipo: TipoCobro; lista: Factura[] }[] = [];
      for (const [plan, tipo] of [[quincenal, "quincenal"], [mensual, "mensual"]] as const) {
        const e = await empresa(tx, cero("2026-11-01"));
        await cerrar(tx, e.id, corrida("2026-11-16"));
        await asignar(tx, e.id, plan, "inicio", "2026-11-18", tipo, "2026-11-10T15:00:00.000Z");
        await aplicarPendiente(tx, e.id, cola("2026-11-18"));
        await cerrar(tx, e.id, corrida("2026-11-18"));
        await cerrar(tx, e.id, corrida("2026-12-01"));
        casos.push({ plan, tipo, lista: await facturas(tx, e.id) });
      }
      return casos;
    });
    for (const c of r) {
      expect(c.lista.filter((f) => f.hasta === cero("2026-11-18"))).toHaveLength(1);
      expect(c.lista[1]).toMatchObject({
        desde: cero("2026-11-16"),
        hasta: cero("2026-11-18"),
        plan_id: null,
        primera_cuota: "13433.33",
        primera_cuota_plan_id: c.plan,
        primera_cuota_tipo_cobro: c.tipo,
        primera_cuota_hasta: cero("2026-12-01"),
        primera_cuota_dias_cobrados: 13,
        primera_cuota_dias_periodo: c.tipo === "quincenal" ? 15 : 30,
        cuota: null,
      });
      // La emitida el 1 de diciembre: la quincena del 1 o la mensual de diciembre, del plan nuevo.
      expect(c.lista[2]).toMatchObject({
        desde: cero("2026-11-18"),
        hasta: cero("2026-12-01"),
        plan_id: c.plan,
        cuota: c.tipo === "quincenal" ? "15500.00" : "31000.00",
        primera_cuota: null,
      });
    }
  });

  it("R29: anual desde el 18 con órdenes quincenales: 44 de 365 en la emitida el 18, ninguna en diciembre y la anual el 1 de enero", async () => {
    const r = await revertida(base, async (tx) => {
      const anual = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"));
      await cerrar(tx, e.id, corrida("2026-11-16"));
      await asignar(tx, e.id, anual, "inicio", "2026-11-18", "anual", "2026-11-10T15:00:00.000Z");
      await aplicarPendiente(tx, e.id, cola("2026-11-18"));
      await cerrar(tx, e.id, corrida("2027-01-01"));
      return { anual, lista: await facturas(tx, e.id) };
    });
    expect(r.lista.slice(1).map((f) => [f.desde, f.hasta, f.primera_cuota, f.cuota, f.cuota_desde])).toEqual([
      [cero("2026-11-16"), cero("2026-11-18"), "44843.84", null, null],
      [cero("2026-11-18"), cero("2026-12-01"), null, null, null],
      [cero("2026-12-01"), cero("2026-12-16"), null, null, null],
      [cero("2026-12-16"), cero("2027-01-01"), null, "372000.00", cero("2027-01-01")],
      [cero("2027-01-01"), null, null, null, null],
    ]);
    expect(r.lista[1]).toMatchObject({
      primera_cuota_tipo_cobro: "anual",
      primera_cuota_hasta: cero("2027-01-01"),
      primera_cuota_dias_cobrados: 44,
      primera_cuota_dias_periodo: 365,
    });
  });

  /* ------------------------- Inmutabilidad (SL118) ------------------------- */

  it("R16: una por cerrar no cambia su plan ni su periodicidad, y una marca ya puesta no cambia: SL118 (la marca nula sí se pone)", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-11-01"));
      // A las 00:04 del 16: la del 1 al 15 queda por cerrar.
      await cerrar(tx, e.id, "2026-11-16T06:04:00.000Z");
      const [porCerrar, enCurso] = await facturas(tx, e.id);
      const antes = await fotoDeFilas(tx, e.id);
      const rechazos = {
        periodicidad: await intentar(tx, `UPDATE "factura_plataforma" SET "periodicidad" = 'mensual' WHERE "id" = $1`, porCerrar.id),
        plan: await intentar(
          tx,
          `UPDATE "factura_plataforma" SET "plan_id" = $2, "plan_nombre" = 'x', "tipo_cobro" = 'quincenal' WHERE "id" = $1`,
          porCerrar.id,
          quincenal,
        ),
        fechas: await intentar(tx, `UPDATE "factura_plataforma" SET "hasta_at" = "hasta_at" + interval '1 day' WHERE "id" = $1`, porCerrar.id),
      };
      const despuesDeRechazos = await fotoDeFilas(tx, e.id);
      // Control: la marca pasa de nula a un valor en una por cerrar y en la en curso...
      const ponerMarca = await intentar(tx, `UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = "hasta_at" WHERE "id" = $1`, porCerrar.id);
      const ponerMarcaEnCurso = await intentar(tx, `UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = "desde_at" WHERE "id" = $1`, enCurso.id);
      // ...y ya puesta no cambia ni se quita.
      const cambiarMarca = await intentar(tx, `UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = "desde_at" WHERE "id" = $1`, porCerrar.id);
      const quitarMarca = await intentar(tx, `UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = NULL WHERE "id" = $1`, enCurso.id);
      return { antes, despuesDeRechazos, rechazos, ponerMarca, ponerMarcaEnCurso, cambiarMarca, quitarMarca };
    });
    expect(r.rechazos).toEqual({ periodicidad: "SL118", plan: "SL118", fechas: "SL118" });
    expect(r.despuesDeRechazos).toEqual(r.antes);
    expect([r.ponerMarca, r.ponerMarcaEnCurso]).toEqual([null, null]);
    expect([r.cambiarMarca, r.quitarMarca]).toEqual(["SL118", "SL118"]);
  });
});
