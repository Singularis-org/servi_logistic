import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModuloApagable, PrismaClient } from "@prisma/client";

import type { EnqueueOpts, IJobRepository, JobDTO, JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  crearPlanAplicarCambioHandler,
  crearPlanCambiosVencidosHandler,
  recurrenciaPlanCambiosVencidos,
  sembrarPlanCambiosVencidos,
} from "@/lib/planes/jobs-cambio-plan";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, EditarPlanInput } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaDePlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SL-24 · T11 (design §16.2, §16.3; R17, R37, R38, R39, R40, R16 en lo programado) — el cambio
// programado contra Postgres, con `PlanesService`, `PlanesRepository` y los handlers REALES de la cola.
// El reloj de la app es inyectado (servicio y handlers): el corte «ya rige» es el de Node, en la misma
// escala que `run_after` de la cola, que también escribe Node. Todo en una transacción que se revierte.
//
// Mutaciones de §16.7 que miden estos casos: la 8 (el aplicador no compara el `cambioId`: el trabajo
// del cambio reemplazado aplica el nuevo) y la 10 (programar vuelve a rechazar cuando una empresa ya
// pasa el tope nuevo).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
/** El instante en que rige una fecha `AAAA-MM-DD` (00:00 a −06:00). */
const rige = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
const despuesDe = (d: Date, minutos = 1) => new Date(d.getTime() + minutos * 60_000);

let base: PrismaClient;

async function preparar(tx: TxDeTest, plan: Partial<CrearPlanInput>, empresas = 1) {
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const entrada = entradaDePlan(plan);
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(creado)}`);
  const orgs: string[] = [];
  for (let i = 0; i < empresas; i++) {
    const { id } = await crearOrganizacion(tx, { nombre: `SL24 programado ${i} ${randomUUID().slice(0, 6)}` });
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId: creado.planId });
    if (r.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(r)}`);
    orgs.push(id);
  }
  const programar = async (vigenteDesde: string, cambio: Partial<EditarPlanInput> = {}) => {
    // El superadmin no tiene empresa: el trabajo encolado nace sin ella (DEFAULT de `jobs`).
    await fijarEmpresa(tx, "");
    return servicio.editar(SUPERADMIN, {
      planId: creado.planId,
      nombre: entrada.nombre,
      topes: entrada.topes,
      modulos: entrada.modulos,
      precio: entrada.precio,
      vigenteDesde,
      ...cambio,
    });
  };
  return { servicio, planId: creado.planId, entrada, orgs, programar };
}

async function fotoDelPlan(tx: TxDeTest, planId: string) {
  const p = await tx.plan.findUniqueOrThrow({
    where: { id: planId },
    select: {
      nombre: true,
      topeOrdenesCiclo: true,
      precioNegociable: true,
      precioMensual: true,
      topesPorRol: { select: { rol: true, maximo: true }, orderBy: { rol: "asc" } },
      modulos: { select: { modulo: true }, orderBy: { modulo: "asc" } },
    },
  });
  return {
    nombre: p.nombre,
    ordenes: p.topeOrdenesCiclo,
    negociable: p.precioNegociable,
    mensual: p.precioMensual?.toFixed(2) ?? null,
    porRol: p.topesPorRol.map((t) => [t.rol, t.maximo]),
    modulos: p.modulos.map((m) => m.modulo),
  };
}

async function modulos(tx: TxDeTest, organizacionId: string): Promise<ModuloApagable[]> {
  const filas = await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } });
  return filas.map((f) => f.modulo).sort();
}

async function trabajosDeAplicar(tx: TxDeTest, planId: string): Promise<(JobDTO & { organizacionId: string | null })[]> {
  const filas = await tx.$queryRaw<
    { id: string; payload: Record<string, unknown>; run_after: Date; dedupe_key: string | null; max_intentos: number; organizacion_id: string | null }[]
  >`SELECT "id", "payload", "run_after", "dedupe_key", "max_intentos", "organizacion_id" FROM "jobs"
     WHERE "tipo" = 'plan_aplicar_cambio' AND "payload"->>'planId' = ${planId} ORDER BY "created_at", "id"`;
  return filas.map((f) => ({
    id: f.id,
    tipo: "plan_aplicar_cambio",
    payload: f.payload,
    estado: "pending",
    intentos: 0,
    maxIntentos: Number(f.max_intentos),
    runAfter: f.run_after,
    lockedAt: null,
    lastError: null,
    dedupeKey: f.dedupe_key,
    createdAt: f.run_after,
    updatedAt: f.run_after,
    organizacionId: f.organizacion_id,
  }));
}

/** Corre el handler REAL de `plan_aplicar_cambio` sobre un trabajo encolado, con el reloj dado. */
function correrAplicar(tx: TxDeTest, job: JobDTO, ahora: Date): Promise<void> {
  return crearPlanAplicarCambioHandler(planesEnTx(tx), () => ahora)(job);
}

async function contarJobs(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "jobs" WHERE "tipo" = 'plan_cambios_vencidos'`;
  return f.n;
}

describeSiHayBase("SL-24 — el cambio programado de un plan (R37–R40)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R37: programado a mañana guarda la versión entera, no toca la vigente y encola el trabajo que aplica", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {
        topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null },
        modulos: ["analitica"],
        precio: { tipo: "monto", mensual: "25000", anual: null },
      });
      const [org] = p.orgs;
      await fijarEmpresa(tx, org);
      await crearUsuarioDePrueba(tx, "adminTienda");
      const antes = await fotoDelPlan(tx, p.planId);
      const resultado = await p.programar("2026-10-29", {
        nombre: "Nuevo nombre",
        topes: { ordenesPorCiclo: 10, porRol: { adminTienda: 1 }, apiKeys: null },
        modulos: ["ranking"],
        precio: { tipo: "negociable" },
      });
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: p.planId } });
      const trabajos = await trabajosDeAplicar(tx, p.planId);
      // Hasta la fecha rige la vieja: la segunda tienda cabe en el tope 3, no en el 1 programado.
      const segundaTienda = await capturar(tx, async () => {
        await fijarEmpresa(tx, org);
        await crearUsuarioDePrueba(tx, "adminTienda");
      });
      return {
        antes,
        despues: await fotoDelPlan(tx, p.planId),
        resultado,
        pendiente,
        trabajos,
        segundaTienda,
        modulosOrg: await modulos(tx, org),
      };
    });
    expect(r.resultado).toEqual({ estado: "ok", planId: expect.any(String), cambio: true, avisos: [], vigenteDesde: "2026-10-29" });
    expect(r.despues).toEqual(r.antes);
    expect(r.modulosOrg).toEqual(["analitica"]);
    expect(r.pendiente.vigenteDesde.toISOString()).toBe("2026-10-29T06:00:00.000Z");
    expect(r.pendiente.version).toEqual({
      nombre: "Nuevo nombre",
      topes: { ordenesPorCiclo: 10, porRol: { adminTienda: 1 }, apiKeys: null },
      modulos: ["ranking"],
      precio: { tipo: "negociable" },
    });
    expect(r.trabajos).toHaveLength(1);
    expect(r.trabajos[0]).toMatchObject({
      payload: { planId: r.pendiente.planId, cambioId: r.pendiente.id },
      dedupeKey: `plan_cambio:${r.pendiente.id}`,
      maxIntentos: 5,
      organizacionId: null,
    });
    expect(r.trabajos[0].runAfter.toISOString()).toBe("2026-10-29T06:00:00.000Z");
    expect(r.segundaTienda).toBeNull();
  });

  it("R16 (mutación 10): programar con una empresa ya por encima del tope nuevo se guarda y avisa", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: null, porRol: { adminTienda: 5 }, apiKeys: null } });
      const [org] = p.orgs;
      await fijarEmpresa(tx, org);
      for (let i = 0; i < 3; i++) await crearUsuarioDePrueba(tx, "adminTienda");
      const nombre = (await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { nombre: true } })).nombre;
      const resultado = await p.programar("2026-11-15", { topes: { ordenesPorCiclo: null, porRol: { adminTienda: 2 }, apiKeys: null } });
      const pendiente = await tx.planCambioProgramado.findUnique({ where: { planId: p.planId }, select: { avisosAlProgramar: true } });
      return { org, nombre, resultado, pendiente };
    });
    const aviso = { organizacionId: r.org, empresa: r.nombre, tope: "adminTienda", usados: 3, maximo: 2 };
    expect(r.resultado).toMatchObject({ estado: "ok", cambio: true, avisos: [aviso], vigenteDesde: "2026-11-15" });
    expect(r.pendiente?.avisosAlProgramar).toEqual([aviso]);
  });

  it("R37: una fecha que no es posterior a ahora es validation_error y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {});
      const hoy = await p.programar("2026-10-28", { nombre: "Otro" });
      return {
        hoy,
        pendientes: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
        trabajos: (await trabajosDeAplicar(tx, p.planId)).length,
        rastro: await tx.planRastro.count({ where: { planId: p.planId } }),
      };
    });
    expect(r.hoy.estado).toBe("validation_error");
    expect(r).toMatchObject({ pendientes: 0, trabajos: 0, rastro: 1 });
  });

  it("programar la versión vigente sin pendiente no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {});
      const resultado = await p.programar("2026-11-15");
      return {
        resultado,
        pendientes: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
        trabajos: (await trabajosDeAplicar(tx, p.planId)).length,
        rastro: await tx.planRastro.count({ where: { planId: p.planId } }),
      };
    });
    expect(r.resultado).toMatchObject({ estado: "ok", cambio: false, vigenteDesde: null });
    expect(r).toMatchObject({ pendientes: 0, trabajos: 0, rastro: 1 });
  });

  it("R38/R17: llegada la fecha, el trabajo aplica topes, precio, nombre y módulos; el ciclo no se reinicia; una segunda vez no hace nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(
        tx,
        {
          topes: { ordenesPorCiclo: 100, porRol: { adminTienda: 5 }, apiKeys: null },
          modulos: ["analitica", "ranking"],
          precio: { tipo: "sin_precio" },
        },
        2,
      );
      const [conExcepcion, sinExcepcion] = p.orgs;
      await tx.organizacionModulo.create({ data: { organizacionId: conExcepcion, modulo: "wallet" } });
      await fijarEmpresa(tx, sinExcepcion);
      for (let i = 0; i < 2; i++) await crearUsuarioDePrueba(tx, "adminTienda");
      const ciclo = async () =>
        tx.$queryRaw<{ id: string; ancla: Date; uso: number }[]>`
          SELECT o."id", o."plan_ciclo_ancla_at" AS "ancla",
                 plan_uso_ordenes(o."id", plan_inicio_ciclo(o."plan_ciclo_ancla_at", now()::timestamp)) AS "uso"
            FROM "organizacion" o WHERE o."plan_id" = ${p.planId} ORDER BY o."id"`;
      const cicloAntes = await ciclo();
      await p.programar("2026-11-15", {
        nombre: "Pro 2027",
        topes: { ordenesPorCiclo: 50, porRol: { adminTienda: 1 }, apiKeys: null },
        modulos: ["analitica", "monitoreo"],
        precio: { tipo: "monto", mensual: "30000", anual: null },
      });
      const [trabajo] = await trabajosDeAplicar(tx, p.planId);
      const historialAntes = await tx.historialAccion.count({ where: { organizacionId: { in: p.orgs } } });

      // Un minuto antes de la fecha (reloj del trabajo atrasado): no se adelanta.
      await correrAplicar(tx, trabajo, despuesDe(rige("2026-11-15"), -1));
      const trasAdelantado = await fotoDelPlan(tx, p.planId);

      await correrAplicar(tx, trabajo, despuesDe(rige("2026-11-15")));
      const aplicado = await fotoDelPlan(tx, p.planId);
      const rastroTrasAplicar = await tx.planRastro.count({ where: { planId: p.planId } });
      // Idempotente: la segunda ejecución ya no encuentra el cambio.
      await correrAplicar(tx, trabajo, despuesDe(rige("2026-11-15"), 5));
      const filasDeModulos = await tx.historialAccion.findMany({
        where: { organizacionId: { in: p.orgs } },
        orderBy: { createdAt: "asc" },
        skip: historialAntes,
        select: { organizacionId: true, accion: true, valorNuevo: true, actorUsuarioId: true, actorNombre: true },
      });
      // Desde ahora lo ya usado cuenta contra el tope nuevo: 2 tiendas activas y tope 1.
      const tercera = await capturar(tx, async () => {
        await fijarEmpresa(tx, sinExcepcion);
        await crearUsuarioDePrueba(tx, "adminTienda");
      });
      return {
        trasAdelantado,
        aplicado,
        rastroTrasAplicar,
        rastroFinal: await tx.planRastro.count({ where: { planId: p.planId } }),
        pendientes: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
        conExcepcion: await modulos(tx, conExcepcion),
        sinExcepcion: await modulos(tx, sinExcepcion),
        cicloAntes,
        cicloDespues: await ciclo(),
        filasDeModulos,
        tercera: sqlstateDe(tercera),
        orgs: p.orgs,
      };
    });
    expect(r.trasAdelantado.nombre).not.toBe("Pro 2027");
    expect(r.aplicado).toEqual({
      nombre: "Pro 2027",
      ordenes: 50,
      negociable: false,
      mensual: "30000.00",
      porRol: [["adminTienda", 1]],
      modulos: ["analitica", "monitoreo"],
    });
    expect(r.pendientes).toBe(0);
    expect(r.rastroFinal).toBe(r.rastroTrasAplicar);
    expect(r.conExcepcion).toEqual(["analitica", "monitoreo", "wallet"]);
    expect(r.sinExcepcion).toEqual(["analitica", "monitoreo"]);
    expect(r.cicloDespues).toEqual(r.cicloAntes);
    for (const org of r.orgs) {
      expect(r.filasDeModulos.filter((f) => f.organizacionId === org).map((f) => [f.accion, f.valorNuevo]).sort()).toEqual([
        ["modulo_activado", "monitoreo"],
        ["modulo_desactivado", "ranking"],
      ]);
    }
    // Lo firma el sistema (R36 de la 238: los campos del actor a null).
    for (const f of r.filasDeModulos) expect(f).toMatchObject({ actorUsuarioId: null, actorNombre: null });
    expect(r.tercera).toBe("SL024");
  });

  it("R39 (mutación 8): el trabajo del cambio reemplazado no aplica nada, tampoco el nuevo; el del nuevo sí", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null } });
      await p.programar("2026-11-20", { nombre: "Primero", topes: { ordenesPorCiclo: 70, porRol: {}, apiKeys: null } });
      // El reemplazo rige ANTES que el reemplazado: cuando corre el trabajo viejo, el nuevo ya rige.
      const reemplazo = await p.programar("2026-11-10", { nombre: "Segundo", topes: { ordenesPorCiclo: 40, porRol: {}, apiKeys: null } });
      const pendientes = await tx.planCambioProgramado.findMany({ where: { planId: p.planId }, select: { id: true, vigenteDesde: true } });
      // Los dos trabajos nacen en la misma transacción (mismo `created_at`): se distinguen por su cambio.
      const trabajos = await trabajosDeAplicar(tx, p.planId);
      const nuevo = trabajos.find((t) => t.payload.cambioId === pendientes[0]?.id);
      const viejo = trabajos.find((t) => t !== nuevo);
      if (trabajos.length !== 2 || nuevo === undefined || viejo === undefined) {
        throw new Error(`se esperaban dos trabajos, uno del pendiente: ${JSON.stringify(trabajos.map((t) => t.payload))}`);
      }
      await correrAplicar(tx, viejo, despuesDe(rige("2026-11-20")));
      const trasViejo = await fotoDelPlan(tx, p.planId);
      const pendientesTrasViejo = await tx.planCambioProgramado.count({ where: { planId: p.planId } });
      await correrAplicar(tx, nuevo, despuesDe(rige("2026-11-20")));
      return {
        reemplazo,
        viejo,
        nuevo,
        pendientes,
        trasViejo,
        pendientesTrasViejo,
        trasNuevo: await fotoDelPlan(tx, p.planId),
        entrada: p.entrada,
      };
    });
    expect(r.reemplazo).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2026-11-10" });
    // Un solo pendiente: el nuevo.
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0].vigenteDesde.toISOString()).toBe("2026-11-10T06:00:00.000Z");
    expect(r.nuevo.payload.cambioId).toBe(r.pendientes[0].id);
    expect(r.viejo.payload.cambioId).not.toBe(r.pendientes[0].id);
    expect(r.trasViejo).toMatchObject({ nombre: r.entrada.nombre, ordenes: 100 });
    expect(r.pendientesTrasViejo).toBe(1);
    expect(r.trasNuevo).toMatchObject({ nombre: "Segundo", ordenes: 40 });
  });

  it("R39: cancelar borra el pendiente y su trabajo, al correr, no hace nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {});
      await p.programar("2026-11-15", { nombre: "No llega" });
      const cancelado = await p.servicio.cancelarCambio(SUPERADMIN, { planId: p.planId });
      const [trabajo] = await trabajosDeAplicar(tx, p.planId);
      await correrAplicar(tx, trabajo, despuesDe(rige("2026-11-15")));
      return { cancelado, plan: await fotoDelPlan(tx, p.planId), entrada: p.entrada };
    });
    expect(r.cancelado).toMatchObject({ estado: "ok" });
    expect(r.plan.nombre).toBe(r.entrada.nombre);
  });

  it("R40: archivar con un cambio programado lo cancela; su trabajo no aplica nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {});
      await p.programar("2026-11-15", { nombre: "No llega" });
      const archivado = await p.servicio.archivar(SUPERADMIN, { planId: p.planId });
      const pendientes = await tx.planCambioProgramado.count({ where: { planId: p.planId } });
      const [trabajo] = await trabajosDeAplicar(tx, p.planId);
      await correrAplicar(tx, trabajo, despuesDe(rige("2026-11-15")));
      return { archivado, pendientes, plan: await fotoDelPlan(tx, p.planId), entrada: p.entrada };
    });
    expect(r.archivado).toMatchObject({ estado: "ok", cambio: true });
    expect(r.pendientes).toBe(0);
    expect(r.plan.nombre).toBe(r.entrada.nombre);
  });

  it("R38: el barrido aplica los vencidos que siguen pendientes y deja los que aún no rigen", async () => {
    const r = await revertida(base, async (tx) => {
      const vencido = await preparar(tx, {}, 0);
      const futuro = await preparar(tx, {}, 0);
      await vencido.programar("2026-11-01", { nombre: "Vencido aplicado" });
      await futuro.programar("2026-12-01", { nombre: "Futuro" });
      const ahora = despuesDe(rige("2026-11-01"), 90);
      const listados = await planesEnTx(tx).cambiosVencidos(ahora);
      await crearPlanCambiosVencidosHandler(planesEnTx(tx), () => ahora)({} as JobDTO);
      return {
        listados: listados.map((c) => c.planId).filter((id) => id === vencido.planId || id === futuro.planId),
        vencido: (await fotoDelPlan(tx, vencido.planId)).nombre,
        futuro: (await fotoDelPlan(tx, futuro.planId)).nombre,
        pendienteFuturo: await tx.planCambioProgramado.count({ where: { planId: futuro.planId } }),
        pendienteVencido: await tx.planCambioProgramado.count({ where: { planId: vencido.planId } }),
        ids: [vencido.planId],
      };
    });
    expect(r.listados).toEqual(r.ids);
    expect(r.vencido).toBe("Vencido aplicado");
    expect(r.futuro).not.toBe("Futuro");
    expect(r).toMatchObject({ pendienteFuturo: 1, pendienteVencido: 0 });
  });

  it("la siembra del barrido (sembrarPlanCambiosVencidos) y su re-agendado dejan UNA fila por hora (contarJobs)", async () => {
    const r = await revertida(base, async (tx) => {
      await fijarEmpresa(tx, "");
      const real = new JobRepository(base);
      const repo = {
        enqueue: (tipo, payload, opts?: EnqueueOpts) => real.enqueue(tipo, payload, opts, tx as unknown as JobTxClient),
      } as IJobRepository;
      const antes = await contarJobs(tx);
      const primera = await sembrarPlanCambiosVencidos(repo, new Date("2026-11-01T10:05:00.000Z"));
      const segunda = await sembrarPlanCambiosVencidos(repo, new Date("2026-11-01T10:59:00.000Z"));
      const { runAfter, dedupeKey } = recurrenciaPlanCambiosVencidos.siguiente(new Date("2026-11-01T10:30:00.000Z"));
      const reencolada = await repo.enqueue("plan_cambios_vencidos", {}, { runAfter, dedupeKey });
      return { antes, despues: await contarJobs(tx), primera, segunda, reencolada };
    });
    expect(r.primera?.dedupeKey).toBe("plan_cambios_vencidos:2026-11-01T11");
    expect(r.primera?.runAfter.toISOString()).toBe("2026-11-01T11:00:00.000Z");
    expect(r.segunda).toBeNull();
    expect(r.reencolada).toBeNull();
    expect(r.despues).toBe(r.antes + 1);
  });
});
