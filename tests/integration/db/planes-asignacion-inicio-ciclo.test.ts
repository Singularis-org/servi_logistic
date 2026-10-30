import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma, inicioDelSiguienteCiclo } from "@/lib/planes/ciclo";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { CupoPlanRepository } from "@/lib/repositories/CupoPlanRepository";
import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, TopesPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaDePlan, planesEnTx, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SLT-58 · T14 (design §11.4; R31–R34, R36, R37, R39, R42) — la primera asignación con fecha de inicio
// del ciclo contra Postgres, con `PlanesService` y `PlanesRepository` REALES. El repositorio abre su
// transacción como SAVEPOINT de la del caso, y la del caso SIEMPRE se revierte: nada queda en la base.
//
// El servicio usa el reloj real: las fechas del caso salen de «hoy» de la plataforma (hoy, hace N
// días, dentro de N días), siempre dentro del rango de R30. `now()` de la base es el instante de la
// transacción del caso.
//
// «Mover el reloj de la base» (R34) no se puede: se mueven hacia atrás, la misma cantidad, todos los
// instantes del caso (ancla, inicio del ciclo corto y `created_at` de las órdenes). Es lo mismo que
// adelantar `now()`, porque el ciclo solo depende de las diferencias.
//
// La suite de SL-24 (`planes-asignacion.test.ts`) sigue midiendo la asignación sin fecha (R12, P14).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
const UN_DIA_MS = 24 * 60 * 60 * 1000;

const jobsNoOp = {
  enqueue: async () => null,
  claimBatch: async () => [],
  findByDedupeKeys: async () => [],
  complete: async () => {},
  fail: async () => {},
} as unknown as IJobRepository;

/** La fecha de la plataforma de hoy ± `dias`. */
const dia = (dias: number) => fechaCalendarioCR(new Date(Date.now() + dias * UN_DIA_MS));

let base: PrismaClient;

interface Caso {
  tx: TxDeTest;
  servicio: PlanesService;
  plan: (topes?: Partial<TopesPlan>, p?: Partial<CrearPlanInput>) => Promise<string>;
  asignar: (organizacionId: string, planId: string, inicioCiclo?: string) => ReturnType<PlanesService["asignar"]>;
  previa: (organizacionId: string, planId: string, inicioCiclo: string) => ReturnType<PlanesService["previsualizarAsignacion"]>;
  empresa: () => Promise<string>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const servicio = new PlanesService(planesEnTx(tx));
  return {
    tx,
    servicio,
    plan: async (topes = {}, p = {}) => {
      const r = await servicio.crear(
        SUPERADMIN,
        entradaDePlan({ topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null, ...topes }, ...p }),
      );
      if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
      return r.planId;
    },
    asignar: (organizacionId, planId, inicioCiclo) =>
      servicio.asignar(
        SUPERADMIN,
        inicioCiclo === undefined ? { organizacionId, planId } : { organizacionId, planId, inicioCiclo },
      ),
    previa: (organizacionId, planId, inicioCiclo) =>
      servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId, planId, inicioCiclo }),
    empresa: async () => (await crearOrganizacion(tx)).id,
  };
}

async function organizacion(tx: TxDeTest, organizacionId: string) {
  return tx.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { planId: true, planCicloAnclaAt: true, planCicloCortoDesdeAt: true },
  });
}

async function asignaciones(tx: TxDeTest, organizacionId: string) {
  return tx.historialAccion.findMany({
    where: { organizacionId, accion: "plan_asignado" },
    orderBy: { createdAt: "asc" },
    select: { valorNuevo: true, entidadId: true },
  });
}

/** `true` si la columna es exactamente `now()` UTC de la base (la de la transacción del caso). */
async function esAhora(tx: TxDeTest, organizacionId: string, columna: "plan_ciclo_ancla_at" | "plan_ciclo_corto_desde_at") {
  const [{ igual }] = await tx.$queryRawUnsafe<{ igual: boolean }[]>(
    `SELECT "${columna}" = (now() AT TIME ZONE 'UTC')::timestamp(3) AS igual FROM "organizacion" WHERE "id" = $1`,
    organizacionId,
  );
  return igual;
}

/** `n` órdenes por la ruta real de la carga. Devuelve sus ids o el error tal cual. */
async function ordenes(tx: TxDeTest, organizacionId: string, n: number): Promise<string[] | { error: unknown }> {
  await fijarEmpresa(tx, organizacionId);
  const fks = await crearFksDeOrden(tx);
  const repo = new OrdenRepository(clienteConSavepoint(tx), jobsNoOp);
  const datos = Array.from({ length: n }, () => ({
    numRemision: `SLT58-${randomUUID().slice(0, 12)}`,
    estatusId: fks.estatusId,
    destinatario: "Destinatario SLT-58",
    telefonoDest: "88880000",
    tiendaId: fks.tiendaId,
    zonaId: fks.zonaId,
    provinciaId: fks.provinciaId,
    cantonId: fks.cantonId,
    distritoId: null,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: null,
    montoCobrar: null,
  }));
  try {
    await repo.createManyOrdenes(
      datos,
      500,
      { actorUsuarioId: fks.tiendaId, origenTipo: "carga_masiva" },
      { cargaId: null, usuarioCargaId: fks.tiendaId, totalFiles: n, name: null },
    );
  } catch (error) {
    return { error };
  }
  const creadas = await tx.orden.findMany({ where: { numRemision: { in: datos.map((d) => d.numRemision) } }, select: { id: true } });
  return creadas.map((o) => o.id);
}

function ids(r: string[] | { error: unknown }): string[] {
  if (!Array.isArray(r)) throw new Error(`el alta falló: ${sqlstateDe(r.error)} ${String((r.error as Error).message)}`);
  return r;
}

/** El rechazo de un alta por el tope del plan (SL024), venga crudo o ya traducido. */
function esTope(e: unknown): boolean {
  if (e === null) return false;
  return traducirErrorDeTope(e) instanceof TopeDelPlanAlcanzado || sqlstateDe(e) === "SL024";
}

function topeDe(r: string[] | { error: unknown }): boolean {
  return !Array.isArray(r) && esTope(r.error);
}

/** Lleva el `created_at` de esas órdenes a `now()` UTC menos `intervalo`. */
async function antiguas(tx: TxDeTest, idsDeOrden: string[], intervalo: string): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "orden" SET "created_at" = (now() AT TIME ZONE 'UTC') - $1::interval WHERE "id" = ANY($2::text[])`,
    intervalo,
    idsDeOrden,
  );
}

const anular = (tx: TxDeTest, idsDeOrden: string[]) =>
  tx.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = ANY($1::text[])`, idsDeOrden);

/** Las tres lecturas del uso de órdenes que deben coincidir (R33): cupo, «Mi plan» y el detalle. */
async function usoLeido(tx: TxDeTest, organizacionId: string) {
  await fijarEmpresa(tx, organizacionId);
  const cupo = await new CupoPlanRepository(tx).cupoOrdenes();
  const miPlan = await new MiPlanRepository(tx).planDeLaEmpresa();
  const detalle = await planesEnTx(tx).planDeEmpresa(organizacionId);
  return { cupo: cupo?.usados ?? null, miPlan: miPlan?.uso.ordenes ?? null, detalle: detalle?.plan?.uso.ordenes ?? null };
}

async function tiendas(tx: TxDeTest, organizacionId: string, n: number): Promise<string[]> {
  await fijarEmpresa(tx, organizacionId);
  const creadas: string[] = [];
  for (let i = 0; i < n; i++) creadas.push((await crearUsuarioDePrueba(tx, "adminTienda")).id);
  return creadas;
}

const estadoUsuario = (tx: TxDeTest, idsDeUsuario: string[], estado: "activo" | "inactivo") =>
  tx.$executeRawUnsafe(`UPDATE "usuario" SET "estado" = $1::"estado_usuario" WHERE "id" = ANY($2::text[])`, estado, idsDeUsuario);

async function nuevaKey(tx: TxDeTest, organizacionId: string): Promise<string> {
  await fijarEmpresa(tx, organizacionId);
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const key = await new ApiKeyRepository(clienteConSavepoint(tx)).createConUsuario({
    identificador: `slt58 ${sufijo}`,
    slug: `slt58-${sufijo}`,
    email: `apikey-slt58-${sufijo}@example.test`,
    cedula: `apikey-slt58-${sufijo}`,
    passwordHash: "x",
    keyPrefix: `s58${sufijo.slice(0, 5)}`,
    keyHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
    createdById: maestro.id,
    tiendaDestinoId: null,
  });
  return key.id;
}

const estadoKey = (tx: TxDeTest, idsDeKey: string[], estado: "activa" | "inactiva") =>
  tx.$executeRawUnsafe(`UPDATE "api_key" SET "estado" = $1::"estado_api_key" WHERE "id" = ANY($2::text[])`, estado, idsDeKey);

describeSiHayBase("SLT-58 — primera asignación con fecha de inicio del ciclo (R31–R34, R36, R37, R39, R42)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R32, R39: hoy ancla en now() UTC; pasada y futura en las 00:00 de la plataforma (06:00 UTC); la fecha queda en valor_nuevo", async () => {
    const [hoy, pasada, futura] = [dia(0), dia(-15), dia(7)];
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const [a, b, f] = [await c.empresa(), await c.empresa(), await c.empresa()];
      const res = [await c.asignar(a, plan, hoy), await c.asignar(b, plan, pasada), await c.asignar(f, plan, futura)];
      return {
        res,
        hoy: { ...(await organizacion(tx, a)), anclaEsAhora: await esAhora(tx, a, "plan_ciclo_ancla_at") },
        pasada: await organizacion(tx, b),
        futura: { ...(await organizacion(tx, f)), cortoEsAhora: await esAhora(tx, f, "plan_ciclo_corto_desde_at") },
        historial: [await asignaciones(tx, a), await asignaciones(tx, b), await asignaciones(tx, f)],
      };
    });
    for (const x of r.res) expect(x).toMatchObject({ estado: "ok", cambio: true, avisos: [] });
    expect(r.hoy.anclaEsAhora).toBe(true);
    expect(r.hoy.planCicloCortoDesdeAt).toBeNull();
    expect(r.pasada.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(pasada).toISOString());
    expect(r.pasada.planCicloCortoDesdeAt).toBeNull();
    expect(r.futura.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(futura).toISOString());
    expect(r.futura.cortoEsAhora).toBe(true);
    // R39: la fecha elegida, AAAA-MM-DD, en la fila `plan_asignado` de la misma transacción.
    expect(r.historial.map((h) => h.map((x) => x.valorNuevo))).toEqual([[hoy], [pasada], [futura]]);
  });

  it("R39: un cambio de plan posterior deja valor_nuevo en NULL y conserva el ancla elegida (P2a)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos] = [await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.asignar(org, uno, dia(-10));
      const antes = await organizacion(tx, org);
      const cambio = await c.asignar(org, dos);
      return { antes, cambio, despues: await organizacion(tx, org), historial: await asignaciones(tx, org), dos };
    });
    expect(r.cambio).toEqual({ estado: "ok", planId: r.dos, cambio: true, avisos: [], vigenteDesde: null });
    expect(r.historial.map((h) => h.valorNuevo)).toEqual([dia(-10), null]);
    expect(r.despues).toEqual({ ...r.antes, planId: r.dos });
  });

  it("R31: con plan + fecha se rechaza sin escribir; también si el plan llegó entre el servicio y el cerrojo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos] = [await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.asignar(org, uno);
      const foto = async () => ({ ...(await organizacion(tx, org)), historial: await asignaciones(tx, org) });
      const antes = await foto();
      const porServicio = await c.asignar(org, dos, dia(0));
      // La carrera: el servicio vio la empresa sin plan; el repositorio la ve con plan bajo el cerrojo.
      const porRepositorio = await planesEnTx(tx).asignar(org, dos, SUPERADMIN.usuarioId, { fecha: dia(0), ancla: "ahora" });
      const mismoPlan = await planesEnTx(tx).asignar(org, uno, SUPERADMIN.usuarioId, { fecha: dia(0), ancla: "ahora" });
      return { antes, porServicio, porRepositorio, mismoPlan, despues: await foto() };
    });
    const rechazo = { estado: "validation_error", fieldErrors: { inicioCiclo: ["La fecha de inicio solo se elige en la primera asignación."] } };
    expect(r.porServicio).toEqual(rechazo);
    expect(r.porRepositorio).toEqual(rechazo);
    expect(r.mismoPlan).toEqual(rechazo);
    expect(r.despues).toEqual(r.antes);
    expect(r.antes.historial).toHaveLength(1);
  });

  it("R33: con fecha pasada cuentan las órdenes vivas desde esa fecha, aunque sean de antes de asignar; cupo, «Mi plan», detalle y trigger cuentan lo mismo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ ordenesPorCiclo: 3 });
      const org = await c.empresa();
      // Sin plan, el trigger no topa: se crean y se llevan al pasado.
      const [d1, d2, anulada, vieja] = ids(await ordenes(tx, org, 4));
      await antiguas(tx, [d1, d2, anulada], "10 days");
      await antiguas(tx, [vieja], "20 days");
      await anular(tx, [anulada]);
      const res = await c.asignar(org, plan, dia(-15));
      const uso = await usoLeido(tx, org);
      expect(await triggerActivo(tx, "plan_tope_ordenes", "orden")).toBe(true);
      // Uso 2 de 3: entra una (el trigger no cuenta la vieja ni la anulada) y la siguiente pasa el tope
      // (sí cuenta las dos de hace 10 días).
      const una = await ordenes(tx, org, 1);
      const otra = await ordenes(tx, org, 1);
      return { res, uso, una, otra };
    });
    expect(r.res).toMatchObject({ estado: "ok", cambio: true, avisos: [] });
    expect(r.uso).toEqual({ cupo: 2, miPlan: 2, detalle: 2 });
    expect(Array.isArray(r.una) && r.una.length).toBe(1);
    expect(topeDe(r.otra)).toBe(true);
  });

  it("R34: con fecha futura, las órdenes previas no cuentan y las posteriores sí; pasada la fecha, el uso vuelve a 0 y el ciclo empieza ese día", async () => {
    const futura = dia(7);
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ ordenesPorCiclo: 10 });
      const org = await c.empresa();
      const [previa] = ids(await ordenes(tx, org, 1));
      await antiguas(tx, [previa], "1 hour");
      const res = await c.asignar(org, plan, futura);
      ids(await ordenes(tx, org, 1));
      const enCorto = await usoLeido(tx, org);
      // «8 días después»: todo el caso 8 días atrás (ancla, ciclo corto y órdenes).
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "plan_ciclo_ancla_at" = "plan_ciclo_ancla_at" - interval '8 days',
                "plan_ciclo_corto_desde_at" = "plan_ciclo_corto_desde_at" - interval '8 days' WHERE "id" = $1`,
        org,
      );
      await tx.$executeRawUnsafe(`UPDATE "orden" SET "created_at" = "created_at" - interval '8 days' WHERE "organizacion_id" = $1`, org);
      const pasada = await usoLeido(tx, org);
      const [{ inicio, ancla }] = await tx.$queryRawUnsafe<{ inicio: string; ancla: string }[]>(
        `SELECT plan_de_la_empresa($1)->>'ciclo_inicio' AS inicio, plan_de_la_empresa($1)->>'ciclo_ancla' AS ancla`,
        org,
      );
      return { res, enCorto, pasada, inicio, ancla };
    });
    expect(r.res).toMatchObject({ estado: "ok", avisos: [] });
    expect(r.enCorto).toEqual({ cupo: 1, miPlan: 1, detalle: 1 });
    expect(r.pasada).toEqual({ cupo: 0, miPlan: 0, detalle: 0 });
    expect(r.inicio).toBe(r.ancla);
  });

  it("R36: órdenes del ciclo por encima del tope → asignada con aviso 3/2; crear una se rechaza; anular dos y crear una entra; igual al tope no avisa", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ ordenesPorCiclo: 2 });
      const justo = await c.plan({ ordenesPorCiclo: 3 });
      const [org, otra] = [await c.empresa(), await c.empresa()];
      const delCiclo = ids(await ordenes(tx, org, 3));
      await antiguas(tx, delCiclo, "2 days");
      await antiguas(tx, ids(await ordenes(tx, otra, 3)), "2 days");
      const res = await c.asignar(org, plan, dia(-5));
      const asignada = await organizacion(tx, org);
      const rechazada = await ordenes(tx, org, 1);
      await anular(tx, delCiclo.slice(0, 2));
      const entra = await ordenes(tx, org, 1);
      return { org, plan, res, asignada, rechazada, entra, igual: await c.asignar(otra, justo, dia(-5)) };
    });
    expect(r.res).toEqual({
      estado: "ok",
      planId: r.plan,
      cambio: true,
      avisos: [{ organizacionId: r.org, empresa: expect.any(String), tope: "ordenes", usados: 3, maximo: 2 }],
      vigenteDesde: null,
    });
    expect(r.asignada.planId).toBe(r.plan);
    expect(topeDe(r.rechazada)).toBe(true);
    expect(Array.isArray(r.entra) && r.entra.length).toBe(1);
    expect(r.igual).toMatchObject({ estado: "ok", avisos: [] });
  });

  it("R42: 3 adminTienda activos y tope 2 → asignada con aviso 3/2; crear o activar uno se rechaza; inactivar dos y crear uno entra", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ porRol: { adminTienda: 2 } });
      const org = await c.empresa();
      const activos = await tiendas(tx, org, 3);
      const [dormido] = await tiendas(tx, org, 1);
      await estadoUsuario(tx, [dormido], "inactivo");
      const res = await c.asignar(org, plan, dia(0));
      expect(await triggerActivo(tx, "plan_tope_usuario_cambio", "usuario")).toBe(true);
      const crear = await capturar(tx, () => tiendas(tx, org, 1));
      const activar = await capturar(tx, () => estadoUsuario(tx, [dormido], "activo"));
      await estadoUsuario(tx, activos.slice(0, 2), "inactivo");
      const entra = await capturar(tx, () => tiendas(tx, org, 1));
      return { org, plan, res, crear, activar, entra };
    });
    expect(r.res).toEqual({
      estado: "ok",
      planId: r.plan,
      cambio: true,
      avisos: [{ organizacionId: r.org, empresa: expect.any(String), tope: "adminTienda", usados: 3, maximo: 2 }],
      vigenteDesde: null,
    });
    expect(esTope(r.crear)).toBe(true);
    expect(esTope(r.activar)).toBe(true);
    expect(r.entra).toBeNull();
  });

  it("R42: 2 API keys activas y tope 1 → asignada con aviso 2/1; crear o activar una se rechaza; con las dos inactivas, crear una entra", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ apiKeys: 1 });
      const org = await c.empresa();
      const activas = [await nuevaKey(tx, org), await nuevaKey(tx, org)];
      const dormida = await nuevaKey(tx, org);
      await estadoKey(tx, [dormida], "inactiva");
      const res = await c.asignar(org, plan, dia(-3));
      const crear = await capturar(tx, () => nuevaKey(tx, org));
      const activar = await capturar(tx, () => estadoKey(tx, [dormida], "activa"));
      await estadoKey(tx, activas, "inactiva");
      const entra = await capturar(tx, () => nuevaKey(tx, org));
      return { org, plan, res, crear, activar, entra };
    });
    expect(r.res).toEqual({
      estado: "ok",
      planId: r.plan,
      cambio: true,
      avisos: [{ organizacionId: r.org, empresa: expect.any(String), tope: "api_keys", usados: 2, maximo: 1 }],
      vigenteDesde: null,
    });
    expect(esTope(r.crear)).toBe(true);
    expect(esTope(r.activar)).toBe(true);
    expect(r.entra).toBeNull();
  });

  it("P14, R42: sin fecha, la primera asignación sigue rechazando (tope_excedido); un cambio a un plan menor, también", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const grande = await c.plan({ porRol: { adminTienda: 10 } });
      const chico = await c.plan({ porRol: { adminTienda: 2 } });
      const [sinFecha, conPlan] = [await c.empresa(), await c.empresa()];
      await tiendas(tx, sinFecha, 3);
      await c.asignar(conPlan, grande, dia(0));
      await tiendas(tx, conPlan, 3);
      return {
        sinFecha: await c.asignar(sinFecha, chico),
        trasSinFecha: await organizacion(tx, sinFecha),
        cambio: await c.asignar(conPlan, chico),
        trasCambio: (await organizacion(tx, conPlan)).planId,
        grande,
      };
    });
    expect(r.sinFecha).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "adminTienda", usados: 3, maximo: 2 }] });
    expect(r.trasSinFecha).toEqual({ planId: null, planCicloAnclaAt: null, planCicloCortoDesdeAt: null });
    expect(r.cambio).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "adminTienda", usados: 3, maximo: 2 }] });
    expect(r.trasCambio).toBe(r.grande);
  });

  it("R37: la vista previa no escribe y avisa exactamente lo que la asignación devuelve (órdenes, rol y API keys)", async () => {
    const pasada = dia(-10);
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ ordenesPorCiclo: 2, porRol: { adminTienda: 1 }, apiKeys: 1 });
      const org = await c.empresa();
      await antiguas(tx, ids(await ordenes(tx, org, 3)), "3 days");
      await tiendas(tx, org, 2);
      await nuevaKey(tx, org);
      await nuevaKey(tx, org);
      const antes = { ...(await organizacion(tx, org)), historial: await asignaciones(tx, org) };
      const previa = await c.previa(org, plan, pasada);
      const trasPrevia = { ...(await organizacion(tx, org)), historial: await asignaciones(tx, org) };
      const res = await c.asignar(org, plan, pasada);
      const [{ ahora }] = await tx.$queryRawUnsafe<{ ahora: Date }[]>(`SELECT (now() AT TIME ZONE 'UTC') AS ahora`);
      return { antes, previa, trasPrevia, res, ahora };
    });
    expect(r.trasPrevia).toEqual(r.antes);
    expect(r.previa.estado).toBe("ok");
    expect(r.res.estado).toBe("ok");
    if (r.previa.estado !== "ok" || r.res.estado !== "ok") return;
    expect(r.previa.avisos.map((a) => [a.tope, a.usados, a.maximo])).toEqual([
      ["ordenes", 3, 2],
      // Las 2 creadas más la tienda que `crearFksDeOrden` da de alta para las órdenes.
      ["adminTienda", 3, 1],
      ["api_keys", 2, 1],
    ]);
    expect(r.res.avisos).toEqual(r.previa.avisos);
    // P10: el día en que empieza el siguiente ciclo con esa ancla.
    expect(r.previa.siguienteCiclo).toBe(fechaCalendarioCR(inicioDelSiguienteCiclo(inicioDelDiaPlataforma(pasada), r.ahora)));
  });

  it("R37: con fecha futura, el siguiente ciclo es la fecha elegida (fin del ciclo corto) y sin topes pasados no hay avisos", async () => {
    const futura = dia(7);
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ ordenesPorCiclo: 2 });
      const org = await c.empresa();
      // Previas a la asignación: con fecha futura no cuentan (R34), así que no avisan.
      await antiguas(tx, ids(await ordenes(tx, org, 3)), "1 hour");
      return c.previa(org, plan, futura);
    });
    expect(r).toEqual({ estado: "ok", avisos: [], siguienteCiclo: futura });
  });
});
