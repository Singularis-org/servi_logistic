import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JobTipo, PrismaClient } from "@prisma/client";

import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { crearPlanAvisoCorreoHandler, crearPlanRecordatorioCambioHandler } from "@/lib/planes/jobs-cambio-plan";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, EditarPlanInput } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { entradaDePlan, planesEnTx, revertida } from "./_fixtures/planes";

// SL-24 · T12 (design §16.2, §16.4; R41, R42, R45) — los correos del cambio de un plan contra
// Postgres: `PlanesService` y `PlanesRepository` reales encolan en su transacción (outbox), y los
// handlers REALES de `plan_recordatorio_cambio` y `plan_aviso_correo` corren sobre los trabajos
// encolados con un emisor doble que guarda lo enviado. Todo en una transacción que se revierte.
//
// Mutación 9 de §16.7 («el recordatorio no comprueba que siga pendiente»): la miden «R39 (mutación
// 9)…» en sus dos puntos, el reparto del recordatorio y el envío del aviso.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");

let base: PrismaClient;

type FilaJob = JobDTO & { organizacionId: string | null };

/** Los trabajos de un tipo para un plan, en orden estable, con su empresa. */
async function trabajos(tx: TxDeTest, tipo: JobTipo, planId: string): Promise<FilaJob[]> {
  const filas = await tx.$queryRaw<
    { id: string; payload: Record<string, unknown>; run_after: Date; dedupe_key: string | null; organizacion_id: string | null }[]
  >`SELECT "id", "payload", "run_after", "dedupe_key", "organizacion_id" FROM "jobs"
     WHERE "tipo" = ${tipo}::"job_tipo" AND "payload"->>'planId' = ${planId}
     ORDER BY "organizacion_id" NULLS FIRST, "dedupe_key", "id"`;
  return filas.map((f) => ({
    id: f.id,
    tipo,
    payload: f.payload,
    estado: "pending",
    intentos: 0,
    maxIntentos: 5,
    runAfter: f.run_after,
    lockedAt: null,
    lastError: null,
    dedupeKey: f.dedupe_key,
    createdAt: f.run_after,
    updatedAt: f.run_after,
    organizacionId: f.organizacion_id,
  }));
}

/** Un emisor doble que guarda lo enviado; `falla` lo hace lanzar en cada envío. */
function emisor(falla = false): IEmailSender & { enviados: EmailMessage[] } {
  const enviados: EmailMessage[] = [];
  return {
    enviados,
    enviar: async (m) => {
      if (falla) throw new Error("SMTP caído");
      enviados.push(m);
      return { messageId: null };
    },
  };
}

/**
 * Corre el handler REAL de `plan_aviso_correo` sobre cada aviso del plan aún no drenado (`hechos`
 * evita reenviar los de una pasada anterior, como haría la cola al marcarlos `done`).
 */
async function drenarAvisos(tx: TxDeTest, planId: string, sender: IEmailSender, hechos = new Set<string>()) {
  const handler = crearPlanAvisoCorreoHandler(planesEnTx(tx), () => ({ sender, contacto: null }));
  for (const job of await trabajos(tx, "plan_aviso_correo", planId)) {
    if (hechos.has(job.id)) continue;
    hechos.add(job.id);
    await handler(job);
  }
  return hechos;
}

/** Corre el handler REAL de `plan_recordatorio_cambio` sobre un trabajo encolado. */
function correrRecordatorio(tx: TxDeTest, job: JobDTO): Promise<void> {
  return crearPlanRecordatorioCambioHandler(planesEnTx(tx))(job);
}

async function maestro(tx: TxDeTest, organizacionId: string, estado: "activo" | "inactivo" = "activo"): Promise<string> {
  await fijarEmpresa(tx, organizacionId);
  const { id } = await crearUsuarioDePrueba(tx, "maestro");
  if (estado !== "activo") await tx.usuario.update({ where: { id }, data: { estado } });
  return (await tx.usuario.findUniqueOrThrow({ where: { id }, select: { email: true } })).email;
}

/**
 * Un plan con `empresas` empresas; cada una con un maestro activo, y la primera además con un segundo
 * maestro activo, uno inactivo y un admin (que no reciben, salvo el segundo maestro activo).
 */
async function preparar(tx: TxDeTest, plan: Partial<CrearPlanInput> = {}, empresas = 2) {
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const entrada = entradaDePlan(plan);
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(creado)}`);
  const orgs: { id: string; nombre: string; maestros: string[] }[] = [];
  for (let i = 0; i < empresas; i++) {
    const nombre = `SL24 correos ${i} ${randomUUID().slice(0, 6)}`;
    const { id } = await crearOrganizacion(tx, { nombre });
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId: creado.planId });
    if (r.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(r)}`);
    const maestros = [await maestro(tx, id)];
    if (i === 0) {
      maestros.push(await maestro(tx, id));
      await maestro(tx, id, "inactivo");
      await crearUsuarioDePrueba(tx, "admin");
    }
    orgs.push({ id, nombre, maestros });
  }
  // El superadmin no tiene empresa: lo que encole sin empresa nace con `organizacion_id` NULL.
  await fijarEmpresa(tx, "");
  const editar = async (vigenteDesde: string | null, cambio: Partial<EditarPlanInput> = {}) => {
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
  return { servicio, planId: creado.planId, entrada, orgs, editar };
}

const destinatarios = (enviados: EmailMessage[]) => enviados.map((m) => m.to).sort();

describeSiHayBase("SL-24 — los correos del cambio de un plan (R41, R42, R45)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R41: la edición inmediata avisa a los maestros activos de cada empresa del plan, con los topes que ya pasa cada una", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: null, porRol: { admin: 5 }, apiKeys: null } });
      // Otra empresa con maestro, sin el plan: no recibe.
      const { id: ajena } = await crearOrganizacion(tx);
      await maestro(tx, ajena);
      await fijarEmpresa(tx, "");
      const resultado = await p.editar(null, { topes: { ordenesPorCiclo: 40, porRol: { admin: 0 }, apiKeys: null } });
      const avisos = await trabajos(tx, "plan_aviso_correo", p.planId);
      const rastro = await tx.planRastro.findFirstOrThrow({ where: { planId: p.planId, accion: "editado" }, select: { id: true } });
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender);
      return { p, resultado, avisos, rastro, enviados: sender.enviados };
    });
    expect(r.resultado).toMatchObject({ estado: "ok", cambio: true });
    // Un aviso por empresa del plan, en SU empresa, con la clave de la fila `editado`.
    expect(r.avisos.map((a) => [a.organizacionId, a.dedupeKey]).sort()).toEqual(
      r.p.orgs.map((o) => [o.id, `plan_aviso:${r.rastro.id}:guardado:${o.id}`]).sort(),
    );
    expect(r.avisos[0].payload).toMatchObject({ cambioId: null, tipo: "guardado", vigenteDesde: null, reemplazaA: null });
    // Destinatarios: los maestros activos de las empresas del plan; ni el inactivo, ni el admin, ni la ajena.
    expect(destinatarios(r.enviados)).toEqual(r.p.orgs.flatMap((o) => o.maestros).sort());
    for (const m of r.enviados) {
      expect(m.subject).toBe(`Cambios en el plan ${r.p.entrada.nombre}`);
      expect(m.text).toContain("cambió y los cambios ya rigen.");
      expect(m.text).toContain("Órdenes por ciclo: sin límite → 40");
      expect(m.text).toContain("Usuarios activos con el rol Administrador: 5 → 0");
    }
    // La primera empresa tiene un admin activo: pasa el tope nuevo (1 > 0). La segunda no.
    const [a, b] = r.p.orgs;
    const deA = r.enviados.filter((m) => a.maestros.includes(m.to));
    const deB = r.enviados.filter((m) => b.maestros.includes(m.to));
    expect(deA).toHaveLength(2);
    for (const m of deA) {
      expect(m.text).toContain(`${a.nombre} ya tiene 1 usuarios activos con el rol Administrador y el plan permite 0.`);
    }
    for (const m of deB) expect(m.text).not.toContain("ya pasa estos topes");
  });

  it("R41: una edición sin cambios no encola ningún correo", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx);
      const resultado = await p.editar(null);
      return { resultado, avisos: await trabajos(tx, "plan_aviso_correo", p.planId) };
    });
    expect(r.resultado).toMatchObject({ estado: "ok", cambio: false });
    expect(r.avisos).toEqual([]);
  });

  it("R41/R42: programar a 10 días avisa al guardar y deja los dos recordatorios; a 3 días, solo el de 1 día", async () => {
    const r = await revertida(base, async (tx) => {
      const diez = await preparar(tx, {}, 1);
      await diez.editar("2026-11-07", { nombre: "Plan diez" });
      const tres = await preparar(tx, {}, 1);
      await tres.editar("2026-10-31", { nombre: "Plan tres" });
      const sender = emisor();
      await drenarAvisos(tx, diez.planId, sender);
      return {
        diez: { p: diez, recordatorios: await trabajos(tx, "plan_recordatorio_cambio", diez.planId), avisos: await trabajos(tx, "plan_aviso_correo", diez.planId) },
        tres: await trabajos(tx, "plan_recordatorio_cambio", tres.planId),
        pendiente: await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: diez.planId }, select: { id: true } }),
        enviados: sender.enviados,
      };
    });
    const id = r.pendiente.id;
    expect(r.diez.recordatorios.map((j) => [j.runAfter.toISOString(), j.dedupeKey, j.organizacionId, j.payload])).toEqual([
      ["2026-11-06T06:00:00.000Z", `plan_recordatorio:${id}:1`, null, { planId: r.diez.p.planId, cambioId: id, dias: 1 }],
      ["2026-10-31T06:00:00.000Z", `plan_recordatorio:${id}:7`, null, { planId: r.diez.p.planId, cambioId: id, dias: 7 }],
    ]);
    expect(r.tres.map((j) => [j.runAfter.toISOString(), j.payload.dias])).toEqual([["2026-10-30T06:00:00.000Z", 1]]);
    // El aviso de guardado sale ya, uno por empresa, con la fecha.
    const [org] = r.diez.p.orgs;
    expect(r.diez.avisos.map((a) => [a.organizacionId, a.dedupeKey])).toEqual([[org.id, `plan_aviso:${id}:guardado:${org.id}`]]);
    expect(destinatarios(r.enviados)).toEqual([...org.maestros].sort());
    for (const m of r.enviados) {
      expect(m.text).toContain("cambia a partir del 7 nov 2026.");
      expect(m.text).toContain(`Nombre del plan: ${r.diez.p.entrada.nombre} → Plan diez`);
      expect(m.text).not.toContain("reemplaza");
    }
  });

  it("R42: el recordatorio va a las empresas que tienen el plan AL SALIR, con sus topes de ese momento, una vez por empresa aunque corra dos veces", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: null, porRol: { admin: 5 }, apiKeys: null } }, 1);
      await p.editar("2026-11-07", { topes: { ordenesPorCiclo: null, porRol: { admin: 1 }, apiKeys: null } });
      // Después de programar: una empresa nueva con el plan y dos admins (pasa el tope 1).
      const nueva = await crearOrganizacion(tx, { nombre: `SL24 nueva ${randomUUID().slice(0, 6)}` });
      const asignada = await p.servicio.asignar(SUPERADMIN, { organizacionId: nueva.id, planId: p.planId });
      if (asignada.estado !== "ok") throw new Error(JSON.stringify(asignada));
      const maestroNueva = await maestro(tx, nueva.id);
      for (let i = 0; i < 2; i++) await crearUsuarioDePrueba(tx, "admin");
      await fijarEmpresa(tx, "");

      // Los avisos del guardado ya salieron (una empresa); se drenan para separarlos del recordatorio.
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      const [siete] = (await trabajos(tx, "plan_recordatorio_cambio", p.planId)).filter((j) => j.payload.dias === 7);
      await correrRecordatorio(tx, siete);
      await correrRecordatorio(tx, siete); // doble ejecución (reintento): no duplica
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "recordatorio_7");
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, nueva, maestroNueva, avisos, enviados: sender.enviados };
    });
    const [vieja] = r.p.orgs;
    expect(r.avisos.map((a) => a.organizacionId).sort()).toEqual([vieja.id, r.nueva.id].sort());
    expect(new Set(r.avisos.map((a) => a.dedupeKey)).size).toBe(2);
    // Un correo por maestro activo de las dos empresas, no dos.
    expect(destinatarios(r.enviados)).toEqual([...vieja.maestros, r.maestroNueva].sort());
    for (const m of r.enviados) {
      expect(m.subject).toBe(`El plan ${r.p.entrada.nombre} cambia en 7 días`);
      expect(m.text).toContain("Faltan 7 días");
      expect(m.text).toContain("7 nov 2026");
    }
    // Los topes del momento del recordatorio: la empresa nueva ya pasa el tope programado.
    const deNueva = r.enviados.find((m) => m.to === r.maestroNueva)!;
    expect(deNueva.text).toContain("ya tiene 2 usuarios activos con el rol Administrador y el plan permite 1.");
  });

  it("R39 (mutación 9): un recordatorio de un cambio cancelado o reemplazado no reparte ni envía nada", async () => {
    const r = await revertida(base, async (tx) => {
      // a) Reemplazado: el recordatorio del cambio viejo no reparte (el nuevo sí está pendiente).
      const p = await preparar(tx, {}, 1);
      await p.editar("2026-11-07", { nombre: "Primero" });
      const [viejo] = (await trabajos(tx, "plan_recordatorio_cambio", p.planId)).filter((j) => j.payload.dias === 7);
      await p.editar("2026-11-08", { nombre: "Segundo" });
      await correrRecordatorio(tx, viejo);
      const repartidosDelViejo = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo !== "guardado");

      // b) Cancelado: el recordatorio no reparte.
      const q = await preparar(tx, {}, 1);
      await q.editar("2026-11-07", { nombre: "Cancelable" });
      const [delCancelado] = (await trabajos(tx, "plan_recordatorio_cambio", q.planId)).filter((j) => j.payload.dias === 7);
      await fijarEmpresa(tx, "");
      await q.servicio.cancelarCambio(SUPERADMIN, { planId: q.planId });
      await correrRecordatorio(tx, delCancelado);
      const repartidosDelCancelado = (await trabajos(tx, "plan_aviso_correo", q.planId)).filter((a) =>
        String(a.payload.tipo).startsWith("recordatorio"),
      );

      // c) Repartido y cancelado DESPUÉS: el aviso ya encolado no envía (el envío vuelve a comprobar).
      const s = await preparar(tx, {}, 1);
      await s.editar("2026-11-07", { nombre: "Tarde" });
      const hechos = await drenarAvisos(tx, s.planId, emisor()); // el de guardado
      const [siete] = (await trabajos(tx, "plan_recordatorio_cambio", s.planId)).filter((j) => j.payload.dias === 7);
      await correrRecordatorio(tx, siete);
      const encolados = (await trabajos(tx, "plan_aviso_correo", s.planId)).filter((a) => a.payload.tipo === "recordatorio_7");
      await fijarEmpresa(tx, "");
      await s.servicio.cancelarCambio(SUPERADMIN, { planId: s.planId });
      const sender = emisor();
      await drenarAvisos(tx, s.planId, sender, hechos);
      return {
        repartidosDelViejo,
        repartidosDelCancelado,
        encolados: encolados.length,
        recordatoriosEnviados: sender.enviados.filter((m) => !m.subject.startsWith("Se canceló")),
        canceladosEnviados: sender.enviados.filter((m) => m.subject.startsWith("Se canceló")).length,
      };
    });
    expect(r.repartidosDelViejo).toEqual([]);
    expect(r.repartidosDelCancelado).toEqual([]);
    // c) el recordatorio sí se encoló, pero no salió; sí sale el de cancelación (R45).
    expect(r.encolados).toBe(1);
    expect(r.recordatoriosEnviados).toEqual([]);
    expect(r.canceladosEnviados).toBe(2); // los dos maestros activos de la empresa
  });

  it("R45: cancelar a mano avisa a los maestros activos de cada empresa con el texto de R45", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx);
      await p.editar("2026-11-07", { nombre: "No llega" });
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: p.planId }, select: { id: true } });
      await fijarEmpresa(tx, "");
      const cancelado = await p.servicio.cancelarCambio(SUPERADMIN, { planId: p.planId });
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "cancelado");
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, pendiente, cancelado, avisos, enviados: sender.enviados };
    });
    expect(r.cancelado).toMatchObject({ estado: "ok" });
    expect(r.avisos.map((a) => [a.organizacionId, a.dedupeKey]).sort()).toEqual(
      r.p.orgs.map((o) => [o.id, `plan_aviso:${r.pendiente.id}:cancelado:${o.id}`]).sort(),
    );
    expect(destinatarios(r.enviados)).toEqual(r.p.orgs.flatMap((o) => o.maestros).sort());
    for (const m of r.enviados) {
      expect(m.text).toContain(
        `El cambio del plan ${r.p.entrada.nombre} previsto para 7 nov 2026 se canceló; tu plan sigue igual.`,
      );
    }
  });

  it("R45: archivar con un cambio pendiente avisa de la cancelación; sin pendiente, no", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, 1);
      await p.editar("2026-11-07", { nombre: "Archivado antes" });
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      await fijarEmpresa(tx, "");
      await p.servicio.archivar(SUPERADMIN, { planId: p.planId });
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);

      const sinPendiente = await preparar(tx, {}, 1);
      await sinPendiente.servicio.archivar(SUPERADMIN, { planId: sinPendiente.planId });
      return { p, enviados: sender.enviados, avisosSinPendiente: await trabajos(tx, "plan_aviso_correo", sinPendiente.planId) };
    });
    const [org] = r.p.orgs;
    expect(destinatarios(r.enviados)).toEqual([...org.maestros].sort());
    for (const m of r.enviados) expect(m.text).toContain("previsto para 7 nov 2026 se canceló; tu plan sigue igual.");
    expect(r.avisosSinPendiente).toEqual([]);
  });

  it("R45: reemplazar no envía correo de cancelación: un solo correo por maestro, con la línea del reemplazo", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx);
      await p.editar("2026-11-07", { nombre: "Primero" });
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      await p.editar("2026-11-20", { nombre: "Segundo" });
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => !hechos.has(a.id));
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, avisos, enviados: sender.enviados };
    });
    expect(r.avisos.map((a) => a.payload.tipo)).toEqual(r.p.orgs.map(() => "guardado"));
    expect(r.avisos.every((a) => a.payload.reemplazaA === "2026-11-07T06:00:00.000Z")).toBe(true);
    // Uno por maestro, sin duplicados.
    expect(destinatarios(r.enviados)).toEqual(r.p.orgs.flatMap((o) => o.maestros).sort());
    for (const m of r.enviados) {
      expect(m.subject).toBe(`Cambios en el plan ${r.p.entrada.nombre}`);
      expect(m.text).toContain("cambia a partir del 20 nov 2026.");
      expect(m.text).toContain("Este cambio reemplaza al previsto para 7 nov 2026.");
      expect(m.text).not.toContain("se canceló");
    }
  });

  it("R41/R45: un fallo del emisor falla el trabajo, pero la edición y la cancelación persisten", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { ordenesPorCiclo: 100, porRol: {}, apiKeys: null } }, 1);
      await p.editar(null, { topes: { ordenesPorCiclo: 7, porRol: {}, apiKeys: null } });
      let errorEdicion: unknown = null;
      try {
        await drenarAvisos(tx, p.planId, emisor(true));
      } catch (e) {
        errorEdicion = e;
      }
      const tope = (await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { topeOrdenesCiclo: true } })).topeOrdenesCiclo;

      await p.editar("2026-11-07", { nombre: "Se cancela" });
      await fijarEmpresa(tx, "");
      await p.servicio.cancelarCambio(SUPERADMIN, { planId: p.planId });
      const cancelados = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "cancelado");
      let errorCancelacion: unknown = null;
      await crearPlanAvisoCorreoHandler(planesEnTx(tx), () => ({ sender: emisor(true), contacto: null }))(cancelados[0]).catch(
        (e: unknown) => {
          errorCancelacion = e;
        },
      );
      return {
        errorEdicion,
        tope,
        errorCancelacion,
        pendiente: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
      };
    });
    expect(String(r.errorEdicion)).toMatch(/fallaron 2 de 2 envío/);
    expect(String(r.errorEdicion)).not.toMatch(/@/); // sin el email en el motivo
    expect(r.tope).toBe(7);
    expect(String(r.errorCancelacion)).toMatch(/fallaron 2 de 2 envío/);
    expect(r.pendiente).toBe(0);
  });
});
