import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JobTipo, PrismaClient } from "@prisma/client";

import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { crearPlanAvisoCorreoHandler, crearPlanRecordatorioCambioHandler } from "@/lib/planes/jobs-cambio-plan";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, EditarPlanInput, TipoCobro } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { crearPlan, entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// SL-24 · T12 (design §16.2, §16.4; R41, R42, R45) — los correos del cambio de un plan contra
// Postgres: `PlanesService` y `PlanesRepository` reales encolan en su transacción (outbox), y los
// handlers REALES de `plan_recordatorio_cambio` y `plan_aviso_correo` corren sobre los trabajos
// encolados con un emisor doble que guarda lo enviado. Todo en una transacción que se revierte.
//
// Mutación 9 de §16.7 («el recordatorio no comprueba que siga pendiente»): la miden «R39 (mutación
// 9)…» en sus dos puntos, el reparto del recordatorio y el envío del aviso.
//
// SLT-128 (design §3.1, §3.6, §4; R20–R22; sustituye SL-24 R42 por plan): cada empresa recibe el correo de
// guardado con SU recepción y lo que cambia respecto de SU versión, y sus recordatorios CON empresa, contados
// hasta su recepción (7 y 1, 3 y 1, o solo 1). Un recordatorio avisa solo a su empresa, una vez por fecha, y no
// sale si ya lo recibió, si dejó el plan o si su recepción ya es otra. Las fechas de los correos son las de cada
// empresa: quincenal con F = 16 de noviembre → 16 nov; mensual → 1 dic.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
/** El instante en que rige una fecha `AAAA-MM-DD` (00:00 a −06:00), en ISO. */
const cero = (fecha: string) => `${fecha}T06:00:00.000Z`;

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

/** SLT-128 (§4): el recordatorio de `dias` días de UNA empresa. */
async function recordatorioDe(tx: TxDeTest, planId: string, organizacionId: string, dias: number): Promise<FilaJob> {
  const job = (await trabajos(tx, "plan_recordatorio_cambio", planId)).find(
    (j) => j.organizacionId === organizacionId && j.payload.dias === dias,
  );
  if (job === undefined) throw new Error(`sin recordatorio de ${dias} días para ${organizacionId}`);
  return job;
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
  const handler = crearPlanAvisoCorreoHandler(planesEnTx(tx), () => ({ sender, contacto: null, reglasPais: reglasPaisFijas() }));
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
 * Un plan con `empresas` empresas (cuántas, todas mensuales, o el tipo de cobro de cada una); cada una con un
 * maestro activo, y la primera además con un segundo maestro activo, uno inactivo y un admin (que no reciben,
 * salvo el segundo maestro activo).
 */
async function preparar(tx: TxDeTest, plan: Partial<CrearPlanInput> = {}, empresas: number | readonly TipoCobro[] = 2) {
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const entrada = entradaAsignable(plan);
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(creado)}`);
  const tipos: readonly TipoCobro[] = typeof empresas === "number" ? Array.from({ length: empresas }, () => "mensual") : empresas;
  const orgs: { id: string; nombre: string; maestros: string[] }[] = [];
  for (const [i, tipoCobro] of tipos.entries()) {
    const nombre = `SL24 correos ${i} ${randomUUID().slice(0, 6)}`;
    const { id } = await crearOrganizacion(tx, { nombre });
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId: creado.planId, tipoCobro });
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
  /** `ahora`: el reloj del servicio al guardar (por defecto `AHORA`). */
  const editar = async (vigenteDesde: string | null, cambio: Partial<EditarPlanInput> = {}, ahora: Date = AHORA) => {
    await fijarEmpresa(tx, "");
    return new PlanesService(planesEnTx(tx), () => ahora).editar(SUPERADMIN, {
      planId: creado.planId,
      nombre: entrada.nombre,
      topes: entrada.topes,
      modulos: entrada.modulos,
      precio: entrada.precio,
      costoPorOrden: entrada.costoPorOrden, // SLT-66 R8: campo obligatorio nuevo; no cambia lo que se comprueba.
      costoPorOrdenPorcentual: null, // SLT-83: campo obligatorio nuevo; no cambia lo que se comprueba.
      vigenteDesde,
      ...cambio,
    });
  };
  /** SLT-128 (§3.3): la cola da el pendiente a UNA empresa en su recepción. */
  const recibir = async (organizacionId: string, ahora: Date) => {
    const { id: cambioId } = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: creado.planId }, select: { id: true } });
    const r = await planesEnTx(tx).recibirCambio({ planId: creado.planId, cambioId }, organizacionId, ahora);
    if (r.estado !== "aplicado") throw new Error(`recibirCambio: ${JSON.stringify(r)}`);
  };
  return { servicio, planId: creado.planId, entrada, orgs, editar, recibir };
}

const destinatarios = (enviados: EmailMessage[]) => enviados.map((m) => m.to).sort();

describeSiHayBase("SL-24 — los correos del cambio de un plan (R41, R42, R45; SLT-128 R20–R22)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R41: la edición inmediata avisa a los maestros activos de cada empresa del plan, con los topes que ya pasa cada una", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { porRol: { admin: 5 }, apiKeys: null } });
      // Otra empresa con maestro, sin el plan: no recibe.
      const { id: ajena } = await crearOrganizacion(tx);
      await maestro(tx, ajena);
      await fijarEmpresa(tx, "");
      // SLT-86 (R8): el tope que cambia junto al de admin es el de API keys (ya no hay tope de órdenes).
      const resultado = await p.editar(null, { topes: { porRol: { admin: 0 }, apiKeys: 40 } });
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
      expect(m.text).toContain("API keys activas: sin límite → 40");
      expect(m.text).not.toContain("Órdenes por ciclo");
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

  it("SLT-128 R20, R21: programar con F = 16 avisa a cada empresa con SU fecha y le deja SUS recordatorios (más de 7 días: a 7 y a 1)", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      const resultado = await p.editar("2026-11-16", { nombre: "Plan dieciséis" });
      const { id } = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: p.planId }, select: { id: true } });
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender);
      return {
        p,
        id,
        resultado,
        recordatorios: await trabajos(tx, "plan_recordatorio_cambio", p.planId),
        avisos: await trabajos(tx, "plan_aviso_correo", p.planId),
        enviados: sender.enviados,
      };
    });
    const [quincenal, mensual] = r.p.orgs;
    expect(r.resultado).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2026-11-16" });
    // Ninguno sin empresa: cada empresa, los suyos, contados hasta SU recepción (19 y 34 días desde el 28).
    const esperado = (org: string, recibe: string, dias: 7 | 1, runAfter: string) => [
      org,
      runAfter,
      `plan_recordatorio:${r.id}:${org}:${cero(recibe)}:${dias}`,
      { planId: r.p.planId, cambioId: r.id, dias, recibeAt: cero(recibe) },
    ];
    const vistos = r.recordatorios.map((j) => [j.organizacionId, j.runAfter.toISOString(), j.dedupeKey, j.payload]);
    expect(vistos.sort()).toEqual(
      [
        esperado(quincenal.id, "2026-11-16", 7, cero("2026-11-09")),
        esperado(quincenal.id, "2026-11-16", 1, cero("2026-11-15")),
        esperado(mensual.id, "2026-12-01", 7, cero("2026-11-24")),
        esperado(mensual.id, "2026-12-01", 1, cero("2026-11-30")),
      ].sort(),
    );
    // R20: el de guardado sale ya, uno por empresa, con su recepción.
    expect(r.avisos.map((a) => [a.organizacionId, a.dedupeKey, a.payload.vigenteDesde]).sort()).toEqual(
      [
        [quincenal.id, `plan_aviso:${r.id}:guardado:${quincenal.id}`, cero("2026-11-16")],
        [mensual.id, `plan_aviso:${r.id}:guardado:${mensual.id}`, cero("2026-12-01")],
      ].sort(),
    );
    expect(destinatarios(r.enviados)).toEqual([...quincenal.maestros, ...mensual.maestros].sort());
    for (const m of r.enviados) {
      const fecha = quincenal.maestros.includes(m.to) ? "16 nov 2026" : "1 dic 2026";
      expect(m.text).toContain(`cambia a partir del ${fecha}.`);
      expect(m.text).toContain(`Nombre del plan: ${r.p.entrada.nombre} → Plan dieciséis`);
      expect(m.text).not.toContain("reemplaza");
    }
  });

  it("SLT-128 R21, R22: guardado el 11 con recepción el 16 → recordatorios el 13 (3 días) y el 15; el de 3 días sale una vez con su texto", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal"]);
      const [org] = p.orgs;
      await p.editar("2026-11-16", { nombre: "Plan en tres" }, new Date("2026-11-11T15:00:00.000Z"));
      const recordatorios = await trabajos(tx, "plan_recordatorio_cambio", p.planId);
      const hechos = await drenarAvisos(tx, p.planId, emisor()); // el de guardado
      const tres = await recordatorioDe(tx, p.planId, org.id, 3);
      await correrRecordatorio(tx, tres);
      await correrRecordatorio(tx, tres); // doble ejecución (reintento): no duplica
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "recordatorio_3");
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, org, recordatorios, avisos, enviados: sender.enviados };
    });
    expect(r.recordatorios.map((j) => [j.organizacionId, j.payload.dias, j.runAfter.toISOString()]).sort()).toEqual(
      [
        [r.org.id, 3, cero("2026-11-13")],
        [r.org.id, 1, cero("2026-11-15")],
      ].sort(),
    );
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatchObject({ organizacionId: r.org.id, payload: { tipo: "recordatorio_3", vigenteDesde: cero("2026-11-16") } });
    expect(destinatarios(r.enviados)).toEqual([...r.org.maestros].sort());
    for (const m of r.enviados) {
      expect(m.subject).toBe(`El plan ${r.p.entrada.nombre} cambia en 3 días`);
      expect(m.text).toContain(`Faltan 3 días: el plan ${r.p.entrada.nombre} de ${r.org.nombre} cambia a partir del 16 nov 2026.`);
    }
  });

  it("SLT-128 R21: con 3 días o menos hasta SU recepción, solo el de 1 día; con más de 3 la otra empresa del mismo plan lleva los suyos", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      // Guardado el 13 a las 09:00 de la plataforma: la quincenal lo recibe el 16 (3 días), la mensual el 1 (18).
      await p.editar("2026-11-16", { nombre: "Plan cercano" }, new Date("2026-11-13T15:00:00.000Z"));
      return { p, recordatorios: await trabajos(tx, "plan_recordatorio_cambio", p.planId) };
    });
    const [quincenal, mensual] = r.p.orgs;
    expect(r.recordatorios.map((j) => [j.organizacionId, j.payload.dias, j.runAfter.toISOString()]).sort()).toEqual(
      [
        [quincenal.id, 1, cero("2026-11-15")],
        [mensual.id, 7, cero("2026-11-24")],
        [mensual.id, 1, cero("2026-11-30")],
      ].sort(),
    );
  });

  it("SLT-128 R22, R17: el recordatorio avisa solo a SU empresa, con sus topes de ese momento, una vez aunque corra dos veces; la que entra antes de F tiene los suyos y no el de guardado", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { porRol: { admin: 5 }, apiKeys: null } }, 1);
      await p.editar("2026-11-07", { topes: { porRol: { admin: 1 }, apiKeys: null } });
      // Después de programar (y antes de F): una empresa nueva con el plan y dos admins (pasa el tope 1).
      const nueva = await crearOrganizacion(tx, { nombre: `SL24 nueva ${randomUUID().slice(0, 6)}` });
      const asignada = await p.servicio.asignar(SUPERADMIN, { organizacionId: nueva.id, planId: p.planId, tipoCobro: "mensual" });
      if (asignada.estado !== "ok") throw new Error(JSON.stringify(asignada));
      const maestroNueva = await maestro(tx, nueva.id);
      for (let i = 0; i < 2; i++) await crearUsuarioDePrueba(tx, "admin");
      await fijarEmpresa(tx, "");

      const [vieja] = p.orgs;
      const guardadosDeLaNueva = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter(
        (a) => a.organizacionId === nueva.id && a.payload.tipo === "guardado",
      ).length;
      // Los avisos del guardado ya salieron (la vieja); se drenan para separarlos de los recordatorios.
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      const deLaVieja = await recordatorioDe(tx, p.planId, vieja.id, 7);
      await correrRecordatorio(tx, deLaVieja);
      await correrRecordatorio(tx, deLaVieja); // doble ejecución (reintento): no duplica
      const trasLaVieja = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "recordatorio_7");
      await correrRecordatorio(tx, await recordatorioDe(tx, p.planId, nueva.id, 7));
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "recordatorio_7");
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, vieja, nueva, maestroNueva, guardadosDeLaNueva, trasLaVieja, avisos, enviados: sender.enviados };
    });
    expect(r.guardadosDeLaNueva).toBe(0);
    // El de la vieja solo avisa a la vieja (no a todas las del plan, como SL-24 R42).
    expect(r.trasLaVieja.map((a) => a.organizacionId)).toEqual([r.vieja.id]);
    expect(r.avisos.map((a) => a.organizacionId).sort()).toEqual([r.vieja.id, r.nueva.id].sort());
    expect(new Set(r.avisos.map((a) => a.dedupeKey)).size).toBe(2);
    // Un correo por maestro activo de las dos empresas, no dos.
    expect(destinatarios(r.enviados)).toEqual([...r.vieja.maestros, r.maestroNueva].sort());
    for (const m of r.enviados) {
      expect(m.subject).toBe(`El plan ${r.p.entrada.nombre} cambia en 7 días`);
      expect(m.text).toContain("Faltan 7 días");
      // Mensuales con F = 7 de noviembre: las dos lo reciben el 1 de diciembre.
      expect(m.text).toContain("1 dic 2026");
    }
    // Los topes del momento del recordatorio: la empresa nueva ya pasa el tope programado.
    const deNueva = r.enviados.find((m) => m.to === r.maestroNueva)!;
    expect(deNueva.text).toContain("ya tiene 2 usuarios activos con el rol Administrador y el plan permite 1.");
  });

  it("SLT-128 R22: no sale el recordatorio de una empresa que ya lo recibió, que dejó el plan o cuya recepción ya es otra", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual", "mensual"]);
      const [recibida, seVa, movida] = p.orgs;
      await p.editar("2026-11-16", { nombre: "Ya no avisa" });
      // a) La quincenal lo recibe el 16; su recordatorio de 1 día (el 15) corre tarde.
      await p.recibir(recibida.id, new Date("2026-11-16T06:01:00.000Z"));
      await correrRecordatorio(tx, await recordatorioDe(tx, p.planId, recibida.id, 1));
      // b) Una mensual deja el plan el 20 (un cambio de empresa ya guardado, por SQL) antes de su recepción.
      const otroPlan = await crearPlan(tx);
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "plan_cambio_id" = $2, "plan_cambio_plan_id" = $3, "plan_cambio_tipo_cobro" = 'mensual',
                "plan_cambio_desde_at" = $4::timestamp, "plan_cambio_actor_id" = $5 WHERE "id" = $1`,
        seVa.id,
        randomUUID(),
        otroPlan,
        "2026-11-20 06:00:00",
        SUPERADMIN.usuarioId,
      );
      const [{ cambio }] = await tx.$queryRawUnsafe<{ cambio: string }[]>(
        `SELECT "plan_cambio_id" AS cambio FROM "organizacion" WHERE "id" = $1`,
        seVa.id,
      );
      const salio = await planesEnTx(tx).aplicarCambioDeEmpresa({ organizacionId: seVa.id, cambioId: cambio }, new Date("2026-11-20T06:01:00.000Z"));
      await correrRecordatorio(tx, await recordatorioDe(tx, p.planId, seVa.id, 7));
      // c) La recepción de la otra mensual ya es otra fecha (como la deja un cambio de tipo, R19).
      const delMovido = await recordatorioDe(tx, p.planId, movida.id, 7);
      await tx.planCambioRecepcion.updateMany({ where: { empresaId: movida.id }, data: { recibeAt: new Date(cero("2027-01-01")) } });
      await correrRecordatorio(tx, delMovido);
      return {
        salio,
        recordatorios: (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => String(a.payload.tipo).startsWith("recordatorio")),
      };
    });
    expect(r.salio).toEqual({ estado: "aplicado" });
    expect(r.recordatorios).toEqual([]);
  });

  it("SLT-128 R20: un reemplazo dice a cada empresa a qué recepción suya reemplaza; la que ya recibió el primero no, y su lista sale contra SU versión", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      const [quincenal] = p.orgs;
      await p.editar("2026-11-16", { nombre: "Primero" });
      await p.recibir(quincenal.id, new Date("2026-11-16T06:01:00.000Z"));
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      await p.editar("2026-11-20", { nombre: "Segundo" }, new Date("2026-11-17T15:00:00.000Z"));
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => !hechos.has(a.id));
      return { p, avisos };
    });
    const [quincenal, mensual] = r.p.orgs;
    const deLa = (org: string) => r.avisos.find((a) => a.organizacionId === org)?.payload;
    expect(r.avisos.map((a) => a.payload.tipo)).toEqual(["guardado", "guardado"]);
    // Las dos lo reciben el 1 de diciembre.
    expect(deLa(quincenal.id)).toMatchObject({
      vigenteDesde: cero("2026-12-01"),
      reemplazaA: null,
      planNombre: "Primero",
      cambios: { nombre: { antes: "Primero", despues: "Segundo" } },
    });
    expect(deLa(mensual.id)).toMatchObject({
      vigenteDesde: cero("2026-12-01"),
      reemplazaA: cero("2026-12-01"),
      planNombre: r.p.entrada.nombre,
      cambios: { nombre: { antes: r.p.entrada.nombre, despues: "Segundo" } },
    });
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

  it("R45, SLT-128 R20: cancelar a mano avisa a los maestros activos de cada empresa con el texto de R45 y SU fecha", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      await p.editar("2026-11-16", { nombre: "No llega" });
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: p.planId }, select: { id: true } });
      await fijarEmpresa(tx, "");
      const cancelado = await p.servicio.cancelarCambio(SUPERADMIN, { planId: p.planId });
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "cancelado");
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, pendiente, cancelado, avisos, enviados: sender.enviados };
    });
    const [quincenal] = r.p.orgs;
    expect(r.cancelado).toMatchObject({ estado: "ok" });
    expect(r.avisos.map((a) => [a.organizacionId, a.dedupeKey]).sort()).toEqual(
      r.p.orgs.map((o) => [o.id, `plan_aviso:${r.pendiente.id}:cancelado:${o.id}`]).sort(),
    );
    expect(destinatarios(r.enviados)).toEqual(r.p.orgs.flatMap((o) => o.maestros).sort());
    for (const m of r.enviados) {
      const fecha = quincenal.maestros.includes(m.to) ? "16 nov 2026" : "1 dic 2026";
      expect(m.text).toContain(`El cambio del plan ${r.p.entrada.nombre} previsto para ${fecha} se canceló; tu plan sigue igual.`);
    }
  });

  it("SLT-128 R15: archivar con un cambio que sus empresas aún no recibieron se rechaza y no avisa de ninguna cancelación; sin pendiente, archiva sin avisos", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, 1);
      await p.editar("2026-11-07", { nombre: "Archivado antes" });
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      await fijarEmpresa(tx, "");
      const archivado = await p.servicio.archivar(SUPERADMIN, { planId: p.planId });
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);

      const sinPendiente = await preparar(tx, {}, 1);
      const archivadoSin = await sinPendiente.servicio.archivar(SUPERADMIN, { planId: sinPendiente.planId });
      return { archivado, archivadoSin, enviados: sender.enviados, avisosSinPendiente: await trabajos(tx, "plan_aviso_correo", sinPendiente.planId) };
    });
    expect(r.archivado).toEqual({ estado: "cambio_a_medias" });
    expect(r.enviados).toEqual([]);
    expect(r.archivadoSin).toMatchObject({ estado: "ok", cambio: true });
    expect(r.avisosSinPendiente).toEqual([]);
  });

  it("R45: reemplazar no envía correo de cancelación: un solo correo por maestro, con la línea del reemplazo de SU fecha", async () => {
    const r = await revertida(base, async (tx) => {
      // SLT-128: quincenales, para que las dos fechas sean distintas (16 de noviembre → 1 de diciembre).
      const p = await preparar(tx, {}, ["quincenal", "quincenal"]);
      await p.editar("2026-11-07", { nombre: "Primero" });
      const hechos = await drenarAvisos(tx, p.planId, emisor());
      await p.editar("2026-11-20", { nombre: "Segundo" });
      const avisos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => !hechos.has(a.id));
      const sender = emisor();
      await drenarAvisos(tx, p.planId, sender, hechos);
      return { p, avisos, enviados: sender.enviados };
    });
    expect(r.avisos.map((a) => a.payload.tipo)).toEqual(r.p.orgs.map(() => "guardado"));
    expect(r.avisos.every((a) => a.payload.reemplazaA === cero("2026-11-16"))).toBe(true);
    // Uno por maestro, sin duplicados.
    expect(destinatarios(r.enviados)).toEqual(r.p.orgs.flatMap((o) => o.maestros).sort());
    for (const m of r.enviados) {
      expect(m.subject).toBe(`Cambios en el plan ${r.p.entrada.nombre}`);
      expect(m.text).toContain("cambia a partir del 1 dic 2026.");
      expect(m.text).toContain("Este cambio reemplaza al previsto para 16 nov 2026.");
      expect(m.text).not.toContain("se canceló");
    }
  });

  it("R41/R45: un fallo del emisor falla el trabajo, pero la edición y la cancelación persisten", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { porRol: {}, apiKeys: 100 } }, 1);
      await p.editar(null, { topes: { porRol: {}, apiKeys: 7 } });
      let errorEdicion: unknown = null;
      try {
        await drenarAvisos(tx, p.planId, emisor(true));
      } catch (e) {
        errorEdicion = e;
      }
      const tope = (await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { topeApiKeys: true } })).topeApiKeys;

      await p.editar("2026-11-07", { nombre: "Se cancela" });
      await fijarEmpresa(tx, "");
      await p.servicio.cancelarCambio(SUPERADMIN, { planId: p.planId });
      const cancelados = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((a) => a.payload.tipo === "cancelado");
      let errorCancelacion: unknown = null;
      await crearPlanAvisoCorreoHandler(planesEnTx(tx), () => ({ sender: emisor(true), contacto: null, reglasPais: reglasPaisFijas() }))(cancelados[0]).catch(
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
