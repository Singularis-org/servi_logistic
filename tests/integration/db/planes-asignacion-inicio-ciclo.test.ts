import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, TopesPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaDePlan, planesEnTx, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SLT-58 · T14 (design §11.4; R31, R36, R37, R39, R42) — la primera asignación con fecha de inicio contra
// Postgres, con `PlanesService` y `PlanesRepository` REALES. El repositorio abre su transacción como
// SAVEPOINT de la del caso, y la del caso SIEMPRE se revierte: nada queda en la base.
//
// El servicio usa el reloj real: las fechas del caso salen de «hoy» de la plataforma (hoy, hace N días,
// dentro de N días), siempre dentro del rango de R30.
//
// SLT-86 (R2, R8, R16; P4 = a) cambia lo que este archivo medía de SLT-58:
//   · «hoy» también entra a las 00:00 (sustituye a R32 y P9) y una fecha futura deja la asignación
//     pendiente, sin ciclo corto (R34 y R40 se retiran; lo mide `planes-cambio-empresa.test.ts`);
//   · un cambio de plan lleva fecha de efecto y la entrada pasa a esa fecha (R17);
//   · sin tope de órdenes (R8): se retiraron R33 (órdenes contadas desde la fecha elegida; el conteo del
//     período lo miden `plan-ciclo-periodo` y `plan-de-la-empresa-periodo`), R36 de órdenes y el
//     siguiente ciclo de la vista previa (P10).
//
// La suite de SL-24 (`planes-asignacion.test.ts`) sigue midiendo la asignación sin fecha (R12, P14).
//
// SLT-118 (R31): un cambio con «hoy» solo se aplica en el acto si «hoy» es el primer día de un período. Los
// dos casos que cambian de plan mensual → mensual con «hoy» usan un reloj fijo en un 1 de mes (`HOY_FIJO`);
// con el reloj real quedarían pendientes hasta el próximo 1.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** La fecha de la plataforma de hoy ± `dias`. */
const dia = (dias: number) => fechaCalendarioCR(new Date(Date.now() + dias * UN_DIA_MS));

/** SLT-118 (R31): «hoy» fijo en un inicio de período mensual, y la fecha de la plataforma de ese «hoy» ± `dias`. */
const HOY_FIJO = "2026-11-01";
const AHORA_FIJO = new Date(`${HOY_FIJO}T18:00:00.000Z`);
const diaFijo = (dias: number) => fechaCalendarioCR(new Date(AHORA_FIJO.getTime() + dias * UN_DIA_MS));

let base: PrismaClient;

interface Caso {
  tx: TxDeTest;
  servicio: PlanesService;
  plan: (topes?: Partial<TopesPlan>, p?: Partial<CrearPlanInput>) => Promise<string>;
  asignar: (organizacionId: string, planId: string, fechas?: { inicioCiclo?: string; vigenteDesde?: string }) => ReturnType<PlanesService["asignar"]>;
  previa: (organizacionId: string, planId: string, inicioCiclo: string) => ReturnType<PlanesService["previsualizarAsignacion"]>;
  empresa: () => Promise<string>;
}

/** `ahora`: el reloj del servicio; sin él, el real. */
async function caso(tx: TxDeTest, ahora?: Date): Promise<Caso> {
  const servicio = new PlanesService(planesEnTx(tx), ahora === undefined ? undefined : () => ahora);
  return {
    tx,
    servicio,
    plan: async (topes = {}, p = {}) => {
      const r = await servicio.crear(
        SUPERADMIN,
        // SLT-66 R28: solo se asigna un plan con costo concreto; el ayudante crea uno de monto con costo por orden.
        entradaDePlan({
          topes: { porRol: {}, apiKeys: null, ...topes },
          precio: { tipo: "monto", mensual: "1000.00", descuentos: {} },
          costoPorOrden: "100.00",
          ...p,
        }),
      );
      if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
      return r.planId;
    },
    asignar: (organizacionId, planId, fechas = {}) => servicio.asignar(SUPERADMIN, { organizacionId, planId, tipoCobro: "mensual", ...fechas }),
    previa: (organizacionId, planId, inicioCiclo) =>
      servicio.previsualizarAsignacion(SUPERADMIN, { organizacionId, planId, inicioCiclo }),
    empresa: async () => (await crearOrganizacion(tx)).id,
  };
}

async function organizacion(tx: TxDeTest, organizacionId: string) {
  return tx.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { planId: true, planCicloAnclaAt: true, planCambioId: true },
  });
}

async function asignaciones(tx: TxDeTest, organizacionId: string) {
  return tx.historialAccion.findMany({
    where: { organizacionId, accion: "plan_asignado" },
    orderBy: { createdAt: "asc" },
    select: { valorNuevo: true, entidadId: true },
  });
}

/** El rechazo de un alta por el tope del plan (SL024), venga crudo o ya traducido. */
function esTope(e: unknown): boolean {
  if (e === null) return false;
  return traducirErrorDeTope(e) instanceof TopeDelPlanAlcanzado || sqlstateDe(e) === "SL024";
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

describeSiHayBase("SLT-58 — primera asignación con fecha de inicio (R31, R36, R37, R39, R42), con SLT-86", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R39, SLT-86 R2: hoy y pasada entran a las 00:00 de la plataforma; futura queda pendiente sin plan; la fecha va al historial al aplicarse", async () => {
    const [hoy, pasada, futura] = [dia(0), dia(-15), dia(7)];
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const [a, b, f] = [await c.empresa(), await c.empresa(), await c.empresa()];
      const res = [
        await c.asignar(a, plan, { inicioCiclo: hoy }),
        await c.asignar(b, plan, { inicioCiclo: pasada }),
        await c.asignar(f, plan, { inicioCiclo: futura }),
      ];
      return {
        res,
        hoy: await organizacion(tx, a),
        pasada: await organizacion(tx, b),
        futura: await organizacion(tx, f),
        historial: [await asignaciones(tx, a), await asignaciones(tx, b), await asignaciones(tx, f)],
      };
    });
    expect(r.res.map((x) => x.estado === "ok" && x.vigenteDesde)).toEqual([null, null, futura]);
    for (const x of r.res) expect(x).toMatchObject({ estado: "ok", cambio: true, avisos: [] });
    expect(r.hoy.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(hoy).toISOString());
    expect(r.pasada.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(pasada).toISOString());
    // P4 = a: sin ciclo corto. Hasta la fecha, la empresa sigue sin plan y el cambio queda pendiente.
    expect(r.futura).toMatchObject({ planId: null, planCicloAnclaAt: null });
    expect(r.futura.planCambioId).not.toBeNull();
    // R39: la fecha elegida, AAAA-MM-DD, seguida del tipo de cobro (D6). La futura escribe su fila al aplicarse.
    expect(r.historial.map((h) => h.map((x) => x.valorNuevo))).toEqual([[`${hoy} · mensual`], [`${pasada} · mensual`], []]);
  });

  it("R39, SLT-86 R16/R17: un cambio de plan posterior lleva su fecha de efecto en valor_nuevo y la entrada pasa a esa fecha", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx, AHORA_FIJO);
      const [uno, dos] = [await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.asignar(org, uno, { inicioCiclo: diaFijo(-10) });
      const antes = await organizacion(tx, org);
      const cambio = await c.asignar(org, dos, { vigenteDesde: HOY_FIJO });
      return { antes, cambio, despues: await organizacion(tx, org), historial: await asignaciones(tx, org), dos };
    });
    expect(r.cambio).toEqual({ estado: "ok", planId: r.dos, cambio: true, avisos: [], vigenteDesde: null });
    expect(r.historial.map((h) => h.valorNuevo)).toEqual([`${diaFijo(-10)} · mensual`, `${HOY_FIJO} · mensual`]);
    expect(r.antes.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(diaFijo(-10)).toISOString());
    expect(r.despues).toEqual({ planId: r.dos, planCicloAnclaAt: inicioDelDiaPlataforma(HOY_FIJO), planCambioId: null });
  });

  it("R31: con plan + fecha de inicio se rechaza sin escribir; también si el plan llegó entre el servicio y el cerrojo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [uno, dos] = [await c.plan(), await c.plan()];
      const org = await c.empresa();
      await c.asignar(org, uno);
      const foto = async () => ({ ...(await organizacion(tx, org)), historial: await asignaciones(tx, org) });
      const antes = await foto();
      const porServicio = await c.asignar(org, dos, { inicioCiclo: dia(0) });
      // La carrera: el servicio vio la empresa sin plan; el repositorio la ve con plan bajo el cerrojo.
      const efecto = { clase: "inicio", fecha: dia(0), desde: inicioDelDiaPlataforma(dia(0)), elegida: true } as const;
      const porRepositorio = await planesEnTx(tx).asignar(org, dos, SUPERADMIN.usuarioId, efecto, "mensual", new Date());
      const mismoPlan = await planesEnTx(tx).asignar(org, uno, SUPERADMIN.usuarioId, efecto, "mensual", new Date());
      return { antes, porServicio, porRepositorio, mismoPlan, despues: await foto() };
    });
    const rechazo = { estado: "validation_error", fieldErrors: { inicioCiclo: ["La fecha de inicio solo se elige en la primera asignación."] } };
    expect(r.porServicio).toEqual(rechazo);
    expect(r.porRepositorio).toEqual(rechazo);
    expect(r.mismoPlan).toEqual(rechazo);
    expect(r.despues).toEqual(r.antes);
    expect(r.antes.historial).toHaveLength(1);
  });

  it("R42: 3 adminTienda activos y tope 2 → asignada con aviso 3/2; crear o activar uno se rechaza; inactivar dos y crear uno entra", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ porRol: { adminTienda: 2 } });
      const org = await c.empresa();
      const activos = await tiendas(tx, org, 3);
      const [dormido] = await tiendas(tx, org, 1);
      await estadoUsuario(tx, [dormido], "inactivo");
      const res = await c.asignar(org, plan, { inicioCiclo: dia(0) });
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
      const res = await c.asignar(org, plan, { inicioCiclo: dia(-3) });
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

  it("P14, R42: sin fecha, la primera asignación sigue rechazando (tope_excedido); un cambio a un plan menor con fecha de hoy, también (SLT-86 R18)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx, AHORA_FIJO);
      const grande = await c.plan({ porRol: { adminTienda: 10 } });
      const chico = await c.plan({ porRol: { adminTienda: 2 } });
      const [sinFecha, conPlan] = [await c.empresa(), await c.empresa()];
      await tiendas(tx, sinFecha, 3);
      await c.asignar(conPlan, grande, { inicioCiclo: HOY_FIJO });
      await tiendas(tx, conPlan, 3);
      return {
        sinFecha: await c.asignar(sinFecha, chico),
        trasSinFecha: await organizacion(tx, sinFecha),
        cambio: await c.asignar(conPlan, chico, { vigenteDesde: HOY_FIJO }),
        trasCambio: (await organizacion(tx, conPlan)).planId,
        grande,
      };
    });
    expect(r.sinFecha).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "adminTienda", usados: 3, maximo: 2 }] });
    expect(r.trasSinFecha).toEqual({ planId: null, planCicloAnclaAt: null, planCambioId: null });
    expect(r.cambio).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "adminTienda", usados: 3, maximo: 2 }] });
    expect(r.trasCambio).toBe(r.grande);
  });

  it("R37: la vista previa no escribe y avisa exactamente lo que la asignación devuelve (rol y API keys; SLT-86 R8: sin órdenes ni siguiente ciclo)", async () => {
    const pasada = dia(-10);
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan({ porRol: { adminTienda: 1 }, apiKeys: 1 });
      const org = await c.empresa();
      await tiendas(tx, org, 2);
      await nuevaKey(tx, org);
      await nuevaKey(tx, org);
      const antes = { ...(await organizacion(tx, org)), historial: await asignaciones(tx, org) };
      const previa = await c.previa(org, plan, pasada);
      const trasPrevia = { ...(await organizacion(tx, org)), historial: await asignaciones(tx, org) };
      const res = await c.asignar(org, plan, { inicioCiclo: pasada });
      return { antes, previa, trasPrevia, res };
    });
    expect(r.trasPrevia).toEqual(r.antes);
    expect(r.previa.estado).toBe("ok");
    expect(r.res.estado).toBe("ok");
    if (r.previa.estado !== "ok" || r.res.estado !== "ok") return;
    expect(r.previa).toEqual({ estado: "ok", avisos: r.previa.avisos });
    expect(r.previa.avisos.map((a) => [a.tope, a.usados, a.maximo])).toEqual([
      ["adminTienda", 2, 1],
      ["api_keys", 2, 1],
    ]);
    expect(r.res.avisos).toEqual(r.previa.avisos);
  });

  it("R37: con fecha futura avisa lo mismo (los topes que quedan no dependen de la fecha) y sin topes pasados no hay avisos", async () => {
    const futura = dia(7);
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [justo, holgado] = [await c.plan({ porRol: { adminTienda: 1 } }), await c.plan({ porRol: { adminTienda: 5 } })];
      const org = await c.empresa();
      await tiendas(tx, org, 2);
      return { pasa: await c.previa(org, justo, futura), holgado: await c.previa(org, holgado, futura), org };
    });
    expect(r.pasa).toEqual({
      estado: "ok",
      avisos: [{ organizacionId: r.org, empresa: expect.any(String), tope: "adminTienda", usados: 2, maximo: 1 }],
    });
    expect(r.holgado).toEqual({ estado: "ok", avisos: [] });
  });
});
