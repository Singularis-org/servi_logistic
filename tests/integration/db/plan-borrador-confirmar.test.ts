import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { PlanBorradorService } from "@/lib/services/PlanBorradorService";
import { PlanesService } from "@/lib/services/PlanesService";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-129 · T6.2 (design §5.2, §5.4; R17–R20) — confirmar un borrador contra Postgres, con `PlanBorradorService`,
// `PlanesService` y `PlanesRepository` REALES: «Crear plan» y «Programar cambios» pasan por crear y editar de hoy,
// y el borrador se consume en su misma transacción (FOR UPDATE al empezar, DELETE solo en `ok`).
//
// Todo en una transacción del dueño que se revierte, salvo R20 con dos confirmaciones a la vez: necesita dos
// conexiones que vean lo commiteado. Ahí la siembra, la corrida y la limpieza van bajo el lock de la 227, y la
// simultaneidad se FUERZA: una tercera conexión toma el borrador en FOR UPDATE, las dos confirmaciones arrancan y
// se quedan esperándolo (`pg_blocking_pids`), y solo entonces se suelta.
//
// El reloj de los cambios es el de SLT-128: el 28 de octubre de 2026, F = 16 de noviembre → la quincenal lo recibe
// el 16 y la mensual el 1 de diciembre.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");

let base: PrismaClient;

const PRECIO_DE_ENTRADA = { precio: { tipo: "monto", mensual: "1000.00", descuentos: [] } };
const ORDEN = { costoPorOrden: "100.00", costoPorOrdenPorcentual: null, periodicidadOrdenes: "quincenal" };
const TOPES = { topes: { porRol: { admin: 4 }, apiKeys: 2 } };
const MODULOS = { modulos: ["ranking"] };

function servicios(repo: PlanesRepository, ahora: () => Date = () => new Date()) {
  const planes = new PlanesService(repo, ahora);
  return { planes, borradores: new PlanBorradorService(repo, planes) };
}

type Borradores = PlanBorradorService;

function idDe(r: { estado: string; borradorId?: string }): string {
  if (r.estado !== "ok" || r.borradorId === undefined) throw new Error(`guardar: ${JSON.stringify(r)}`);
  return r.borradorId;
}

/** Un borrador de creación con los cinco pasos; `pasos` pisa los que se quieran cambiar. */
async function borradorDeCreacion(b: Borradores, pasos: Record<string, unknown> = {}): Promise<string> {
  const todos: Record<string, unknown> = {
    general: { nombre: `borrador ${randomUUID().slice(0, 8)}`, visibilidad: "publico", organizacionId: null },
    precio: { precio: { tipo: "monto", mensual: "50000.00", descuentos: [{ periodo: "anual", tipo: "porcentaje", valor: "10" }] } },
    orden: ORDEN,
    topes: TOPES,
    modulos: MODULOS,
    ...pasos,
  };
  const id = idDe(await b.guardarPaso(SUPERADMIN, { modo: "crear", borradorId: null, paso: "general", valores: todos.general }));
  for (const paso of ["precio", "orden", "topes", "modulos"]) {
    const r = await b.guardarPaso(SUPERADMIN, { modo: "crear", borradorId: id, paso, valores: todos[paso] });
    if (r.estado !== "ok") throw new Error(`guardar ${paso}: ${JSON.stringify(r)}`);
  }
  return id;
}

/** El borrador de cambio de `planId` con los seis pasos; `pasos` pisa los que se quieran cambiar. */
async function borradorDeCambio(b: Borradores, planId: string, pasos: Record<string, unknown>): Promise<string> {
  const todos: Record<string, unknown> = {
    general: { nombre: "Desde el borrador" },
    precio: PRECIO_DE_ENTRADA,
    orden: ORDEN,
    topes: TOPES,
    modulos: MODULOS,
    vigencia: { vigenteDesde: "2026-11-16" },
    ...pasos,
  };
  let id = "";
  for (const paso of ["general", "precio", "orden", "topes", "modulos", "vigencia"]) {
    id = idDe(await b.guardarPaso(SUPERADMIN, { modo: "editar", planId, paso, valores: todos[paso] }));
  }
  return id;
}

/** Un plan con una empresa por tipo, asignadas el 28 de octubre (molde: `planes-cambio-por-empresa`). */
async function planConEmpresas(tx: TxDeTest, tipos: readonly ("quincenal" | "mensual")[]) {
  const { planes } = servicios(planesEnTx(tx), () => AHORA);
  const entrada = entradaAsignable({ topes: TOPES.topes, modulos: ["ranking"] });
  const creado = await planes.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`crear: ${JSON.stringify(creado)}`);
  const orgs: string[] = [];
  for (const tipoCobro of tipos) {
    const { id } = await crearOrganizacion(tx);
    const r = await planes.asignar(SUPERADMIN, { organizacionId: id, planId: creado.planId, tipoCobro });
    if (r.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(r)}`);
    orgs.push(id);
  }
  await fijarEmpresa(tx, "");
  return { planId: creado.planId, nombre: entrada.nombre, orgs };
}

/** Lo que una confirmación rechazada no puede mover de un plan: sus filas y las de sus hijas, y la cola. */
async function fotoDelPlan(tx: TxDeTest, planId: string) {
  const tabla = async (sql: string) =>
    (await tx.$queryRawUnsafe<{ j: unknown }[]>(`SELECT coalesce(jsonb_agg(f ORDER BY f::text), '[]'::jsonb) AS j FROM (${sql}) x(f)`, planId))[0].j;
  return {
    plan: await tabla(`SELECT to_jsonb(t) FROM "plan" t WHERE t."id" = $1`),
    topes: await tabla(`SELECT to_jsonb(t) FROM "plan_tope_rol" t WHERE t."plan_id" = $1`),
    modulos: await tabla(`SELECT to_jsonb(t) FROM "plan_modulo" t WHERE t."plan_id" = $1`),
    precios: await tabla(`SELECT to_jsonb(t) FROM "plan_precio_historial" t WHERE t."plan_id" = $1`),
    pendiente: await tabla(`SELECT to_jsonb(t) FROM "plan_cambio_programado" t WHERE t."plan_id" = $1`),
    recepciones: await tabla(
      `SELECT to_jsonb(r) FROM "plan_cambio_recepcion" r JOIN "plan_cambio_programado" c ON c."id" = r."cambio_id" WHERE c."plan_id" = $1`,
    ),
    versiones: await tabla(`SELECT to_jsonb(t) FROM "plan_version_empresa" t WHERE t."plan_id" = $1`),
    rastro: await tabla(`SELECT to_jsonb(t) FROM "plan_rastro" t WHERE t."plan_id" = $1`),
    jobs: await tabla(`SELECT to_jsonb(t) FROM "jobs" t WHERE t."payload"::text LIKE '%' || $1 || '%'`),
  };
}

async function trabajos(tx: TxDeTest, planId: string) {
  return tx.$queryRaw<{ tipo: string; organizacion_id: string | null; aviso: string | null; recibe: string | null }[]>`
    SELECT "tipo"::text AS "tipo", "organizacion_id", "payload"->>'tipo' AS "aviso", "payload"->>'recibeAt' AS "recibe"
      FROM "jobs" WHERE "payload"->>'planId' = ${planId} AND "estado" = 'pending'
     ORDER BY 1, 2 NULLS FIRST, 3, 4`;
}

/* -------------------------------------------------------------------------- */
/* Concurrencia forzada (como en `plan-borrador.test.ts`)                     */
/* -------------------------------------------------------------------------- */

async function sostener(cliente: PrismaClient, tomar: (tx: TxDeTest) => Promise<unknown>) {
  let soltar: () => void = () => undefined;
  const suelta = new Promise<void>((r) => {
    soltar = r;
  });
  let listo: (pid: number) => void = () => undefined;
  const pid = new Promise<number>((r) => {
    listo = r;
  });
  const fin = cliente.$transaction(
    async (tx) => {
      const [{ p }] = await tx.$queryRawUnsafe<{ p: number }[]>(`SELECT pg_backend_pid() AS p`);
      await tomar(tx);
      listo(p);
      await suelta;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  return { pid: await pid, soltar, fin };
}

/** `n` backends bloqueados por `pid`, directa o indirectamente. Falla a los 4 s (las transacciones caducan a los 5). */
async function esperarBloqueados(c: PrismaClient, pid: number, n: number): Promise<void> {
  const limite = Date.now() + 4_000;
  for (;;) {
    const [{ k }] = await c.$queryRawUnsafe<{ k: number }[]>(
      `WITH RECURSIVE espera(pid) AS (
         SELECT a.pid FROM pg_stat_activity a WHERE $1 = ANY(pg_blocking_pids(a.pid))
         UNION
         SELECT a.pid FROM pg_stat_activity a JOIN espera e ON e.pid = ANY(pg_blocking_pids(a.pid))
       )
       SELECT count(*)::int AS k FROM espera`,
      pid,
    );
    if (k >= n) return;
    if (Date.now() > limite) throw new Error(`solo ${k} de ${n} confirmaciones esperan a ${pid}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describeSiHayBase("SLT-129 — confirmar un borrador de plan (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  /* --------------------------------- Crear --------------------------------- */

  it("R17 — crear un público desde el borrador (plan con el id del borrador, rastro «creado», borrador borrado)", async () => {
    const r = await revertida(base, async (tx) => {
      const { borradores } = servicios(planesEnTx(tx));
      const id = await borradorDeCreacion(borradores);
      const nombre = ((await tx.planBorrador.findUniqueOrThrow({ where: { id } })).pasos as { general: { nombre: string } }).general.nombre;
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      return {
        id,
        nombre,
        res,
        plan: await tx.plan.findUnique({
          where: { id },
          select: {
            nombre: true,
            visibilidad: true,
            precioMensual: true,
            costoPorOrden: true,
            periodicidadOrdenes: true,
            topeApiKeys: true,
            topesPorRol: { select: { rol: true, maximo: true } },
            modulos: { select: { modulo: true } },
          },
        }),
        descuentos: await tx.$queryRaw<{ periodo: string }[]>`SELECT "periodo"::text AS "periodo" FROM "plan_descuento_periodo" WHERE "plan_id" = ${id}`,
        rastro: await tx.planRastro.findMany({ where: { planId: id }, select: { accion: true, actorUsuarioId: true } }),
        borrador: await tx.planBorrador.count({ where: { id } }),
      };
    });
    expect(r.res).toEqual({ estado: "ok", planId: r.id, cambio: true, avisos: [], vigenteDesde: null });
    expect(r.plan).toMatchObject({
      nombre: r.nombre,
      visibilidad: "publico",
      periodicidadOrdenes: "quincenal",
      topeApiKeys: 2,
      topesPorRol: [{ rol: "admin", maximo: 4 }],
      modulos: [{ modulo: "ranking" }],
    });
    expect(r.plan?.precioMensual?.toFixed(2)).toBe("50000.00");
    expect(r.plan?.costoPorOrden?.toFixed(2)).toBe("100.00");
    expect(r.descuentos).toEqual([{ periodo: "anual" }]);
    expect(r.rastro).toEqual([{ accion: "creado", actorUsuarioId: SUPERADMIN.usuarioId }]);
    expect(r.borrador).toBe(0);
  });

  it("R17 — crear un custom desde el borrador lo asigna a su empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const { borradores } = servicios(planesEnTx(tx));
      const id = await borradorDeCreacion(borradores, {
        general: { nombre: `custom ${randomUUID().slice(0, 8)}`, visibilidad: "custom", organizacionId: org, tipoCobro: "anual" },
      });
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      return {
        id,
        org,
        res,
        plan: await tx.plan.findUnique({ where: { id }, select: { visibilidad: true, organizacionExclusivaId: true } }),
        empresa: await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planId: true, planTipoCobro: true } }),
        asignado: await tx.historialAccion.count({ where: { organizacionId: org, accion: "plan_asignado", entidadId: id } }),
        rastro: await tx.planRastro.findMany({ where: { planId: id }, select: { accion: true } }),
        borrador: await tx.planBorrador.count({ where: { id } }),
      };
    });
    expect(r.res).toMatchObject({ estado: "ok", planId: r.id, cambio: true });
    expect(r.plan).toEqual({ visibilidad: "custom", organizacionExclusivaId: r.org });
    expect(r.empresa).toEqual({ planId: r.id, planTipoCobro: "anual" });
    expect(r.asignado).toBe(1);
    expect(r.rastro).toEqual([{ accion: "creado" }]);
    expect(r.borrador).toBe(0);
  });

  /* -------------------------------- Programar -------------------------------- */

  it("R18 — programar desde el borrador crea el pendiente y una recepción por empresa (trabajos de aviso, rastro, borrador borrado)", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await planConEmpresas(tx, ["quincenal", "mensual"]);
      const { borradores } = servicios(planesEnTx(tx), () => AHORA);
      const id = await borradorDeCambio(borradores, p.planId, { topes: { topes: { porRol: { admin: 1 }, apiKeys: 1 } } });
      const antes = { trabajos: await trabajos(tx, p.planId), nombre: (await tx.plan.findUniqueOrThrow({ where: { id: p.planId } })).nombre };
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      const pendiente = await tx.planCambioProgramado.findUnique({ where: { planId: p.planId }, select: { id: true, version: true } });
      return {
        p,
        antes,
        res,
        pendiente,
        recepciones: await tx.planCambioRecepcion.findMany({
          where: { cambioId: pendiente?.id ?? "" },
          select: { empresaId: true, recibeAt: true, recibidoAt: true },
        }),
        trabajos: await trabajos(tx, p.planId),
        plan: (await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { nombre: true } })).nombre,
        rastro: await tx.planRastro.findMany({ where: { planId: p.planId }, select: { accion: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
        borrador: await tx.planBorrador.count({ where: { id } }),
      };
    });
    const [quincenal, mensual] = r.p.orgs;
    expect(r.res).toEqual({ estado: "ok", planId: r.p.planId, cambio: true, avisos: [], vigenteDesde: "2026-11-16" });
    // Programado, no aplicado: el plan sigue con su nombre hasta las recepciones (SLT-128).
    expect(r.plan).toBe(r.antes.nombre);
    expect(r.pendiente?.version).toMatchObject({ nombre: "Desde el borrador", topes: { porRol: { admin: 1 }, apiKeys: 1 } });
    expect(Object.fromEntries(r.recepciones.map((x) => [x.empresaId, [x.recibeAt.toISOString(), x.recibidoAt]]))).toEqual({
      [quincenal]: ["2026-11-16T06:00:00.000Z", null],
      [mensual]: ["2026-12-01T06:00:00.000Z", null],
    });
    // Ningún trabajo antes; después, por empresa: su recepción, sus dos recordatorios y el aviso de «guardado».
    expect(r.antes.trabajos).toEqual([]);
    const de = (org: string) => r.trabajos.filter((t) => t.organizacion_id === org).map((t) => [t.tipo, t.aviso ?? t.recibe]);
    for (const [org, recibe] of [
      [quincenal, "2026-11-16T06:00:00.000Z"],
      [mensual, "2026-12-01T06:00:00.000Z"],
    ]) {
      expect(de(org)).toContainEqual(["plan_aplicar_cambio", recibe]);
      expect(de(org).filter(([tipo]) => tipo === "plan_recordatorio_cambio")).toHaveLength(2);
      expect(de(org)).toContainEqual(["plan_aviso_correo", "guardado"]);
    }
    expect(r.rastro.map((x) => x.accion)).toEqual(["creado", "cambio_programado"]);
    expect(r.borrador).toBe(0);
  });

  /* ------------------------- Rechazos: el borrador queda ------------------------- */

  it("R19 — un custom con tipo quincenal y facturación mensual da validation_error y el borrador queda", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const { borradores } = servicios(planesEnTx(tx));
      const nombre = `custom ${randomUUID().slice(0, 8)}`;
      const id = await borradorDeCreacion(borradores, {
        general: { nombre, visibilidad: "custom", organizacionId: org, tipoCobro: "quincenal" },
        orden: { ...ORDEN, periodicidadOrdenes: "mensual" },
      });
      const antes = await tx.planBorrador.findUniqueOrThrow({ where: { id } });
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      return {
        res,
        antes,
        despues: await tx.planBorrador.findUnique({ where: { id } }),
        planes: await tx.plan.count({ where: { OR: [{ id }, { nombre }] } }),
        rastro: await tx.planRastro.count({ where: { OR: [{ planId: id }, { planNombre: nombre }] } }),
        empresa: await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planId: true, planCambioPlanId: true } }),
      };
    });
    expect(r.res).toMatchObject({ estado: "validation_error", fieldErrors: { tipoCobro: [expect.any(String)] } });
    expect(r.despues).toEqual(r.antes);
    expect(r.planes).toBe(0);
    expect(r.rastro).toBe(0);
    expect(r.empresa).toEqual({ planId: null, planCambioPlanId: null });
  });

  it("R19 — una fecha de efecto pasada da validation_error en vigenteDesde y el borrador queda", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await planConEmpresas(tx, ["mensual"]);
      const { borradores } = servicios(planesEnTx(tx), () => AHORA);
      const id = await borradorDeCambio(borradores, p.planId, { vigencia: { vigenteDesde: "2026-10-01" } });
      const antes = { borrador: await tx.planBorrador.findUniqueOrThrow({ where: { id } }), plan: await fotoDelPlan(tx, p.planId) };
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      return { res, antes, despues: { borrador: await tx.planBorrador.findUnique({ where: { id } }), plan: await fotoDelPlan(tx, p.planId) } };
    });
    expect(r.res).toMatchObject({ estado: "validation_error", fieldErrors: { vigenteDesde: [expect.any(String)] } });
    expect(r.despues).toEqual(r.antes);
  });

  // SLT-135 (R11; sustituye el caso «De inmediato rechazado por el repositorio», que ya no existe): un borrador que
  // guardó `vigencia` sin fecha antes de esta ficha. La fila se escribe a mano: hoy el esquema ya no lo deja guardar.
  it("R11: una vigencia sin fecha guardada antes queda pendiente al confirmar", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await planConEmpresas(tx, ["quincenal", "mensual"]);
      const { borradores } = servicios(planesEnTx(tx), () => AHORA);
      const id = await borradorDeCambio(borradores, p.planId, {});
      await tx.$executeRawUnsafe(
        `UPDATE "plan_borrador" SET "pasos" = jsonb_set("pasos", '{vigencia}', '{"vigenteDesde": null}'::jsonb) WHERE "id" = $1`,
        id,
      );
      const antes = { borrador: await tx.planBorrador.findUniqueOrThrow({ where: { id } }), plan: await fotoDelPlan(tx, p.planId) };
      const leido = await borradores.leer(SUPERADMIN, { borradorId: id });
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      return { leido, res, antes, despues: { borrador: await tx.planBorrador.findUnique({ where: { id } }), plan: await fotoDelPlan(tx, p.planId) } };
    });
    // Leer lo da sin «Cuándo rige»; confirmar lo pide y no escribe nada.
    expect(r.leido).toMatchObject({ estado: "ok", borrador: { pasosGuardados: ["general", "precio", "orden", "topes", "modulos"] } });
    expect(r.leido.estado === "ok" ? r.leido.borrador?.pasos : undefined).not.toHaveProperty("vigencia");
    expect(r.res).toEqual({ estado: "pasos_pendientes", pasos: ["vigencia"] });
    expect(r.despues).toEqual(r.antes);
  });

  // SLT-135 (R12): el 16 de noviembre a las 15:00, confirmar con F = 16 programa como editar (R4): la quincenal lo
  // recibe con las 00:00 del 16, sin recordatorios, y la mensual el 1 de diciembre. El plan no cambia al confirmar.
  it("R12: confirmar con F hoy programa", async () => {
    const el16 = new Date("2026-11-16T21:00:00.000Z");
    const r = await revertida(base, async (tx) => {
      const p = await planConEmpresas(tx, ["quincenal", "mensual"]);
      const { borradores } = servicios(planesEnTx(tx), () => el16);
      const id = await borradorDeCambio(borradores, p.planId, { vigencia: { vigenteDesde: "2026-11-16" } });
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      const pendiente = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: p.planId }, select: { id: true, vigenteDesde: true } });
      const recepciones = await tx.planCambioRecepcion.findMany({ where: { cambioId: pendiente.id }, select: { empresaId: true, recibeAt: true } });
      const planAlConfirmar = (await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { nombre: true } })).nombre;
      const jobs = await trabajos(tx, p.planId);
      // La siguiente pasada de la cola: la quincenal lo recibe hoy.
      const recibido = await planesEnTx(tx).recibirCambio({ planId: p.planId, cambioId: pendiente.id }, p.orgs[0], new Date("2026-11-16T21:01:00.000Z"));
      const version = await tx.planVersionEmpresa.findUnique({ where: { empresaId: p.orgs[0] }, select: { version: true, desdeAt: true } });
      return { p, res, pendiente, recepciones, planAlConfirmar, jobs, recibido, version, borrador: await tx.planBorrador.count({ where: { id } }) };
    });
    const [quincenal, mensual] = r.p.orgs;
    expect(r.res).toMatchObject({ estado: "ok", planId: r.p.planId, cambio: true, vigenteDesde: "2026-11-16" });
    expect(r.pendiente.vigenteDesde).toEqual(new Date("2026-11-16T06:00:00.000Z"));
    expect(Object.fromEntries(r.recepciones.map((x) => [x.empresaId, x.recibeAt.toISOString()]))).toEqual({
      [quincenal]: "2026-11-16T06:00:00.000Z",
      [mensual]: "2026-12-01T06:00:00.000Z",
    });
    expect(r.planAlConfirmar).toBe(r.p.nombre);
    const de = (org: string) => r.jobs.filter((t) => t.organizacion_id === org).map((t) => [t.tipo, t.aviso ?? t.recibe]);
    // SLT-128 R21: para la recepción de hoy no hay recordatorio; la del 1 de diciembre sí los tiene.
    expect(de(quincenal).filter(([tipo]) => tipo === "plan_recordatorio_cambio")).toEqual([]);
    expect(de(quincenal)).toContainEqual(["plan_aplicar_cambio", "2026-11-16T06:00:00.000Z"]);
    expect(de(mensual).filter(([tipo]) => tipo === "plan_recordatorio_cambio").length).toBeGreaterThan(0);
    expect(r.recibido).toEqual({ estado: "aplicado" });
    expect(r.version).toMatchObject({ version: { nombre: "Desde el borrador" }, desdeAt: new Date("2026-11-16T06:00:00.000Z") });
    expect(r.borrador).toBe(0);
  });
  it("R18 (decisión del implementer) — confirmar un cambio sin diferencias da ok con cambio:false y también borra el borrador", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await planConEmpresas(tx, ["mensual"]);
      const { borradores } = servicios(planesEnTx(tx), () => AHORA);
      const id = await borradorDeCambio(borradores, p.planId, {
        general: { nombre: p.nombre },
        // SLT-135: con fecha (ya no hay «De inmediato»); sin diferencias no programa nada (R7).
        vigencia: { vigenteDesde: "2026-11-16" },
      });
      const antes = await fotoDelPlan(tx, p.planId);
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      return { res, antes, despues: await fotoDelPlan(tx, p.planId), borrador: await tx.planBorrador.count({ where: { id } }) };
    });
    expect(r.res).toMatchObject({ estado: "ok", cambio: false });
    expect(r.despues).toEqual(r.antes);
    expect(r.borrador).toBe(0);
  });

  /* ----------------------------- El borrador ya no está ----------------------------- */

  it("R20 — confirmar un borrador descartado da borrador_no_encontrado", async () => {
    const r = await revertida(base, async (tx) => {
      const { borradores } = servicios(planesEnTx(tx));
      const id = await borradorDeCreacion(borradores);
      const descartado = await borradores.descartar(SUPERADMIN, { borradorId: id });
      const planes = await tx.plan.count();
      const res = await borradores.confirmar(SUPERADMIN, { borradorId: id });
      // Y si desaparece después de leerlo, el repositorio lo ve bajo el FOR UPDATE y no crea nada.
      const otro = await borradorDeCreacion(borradores);
      const leido = await tx.planBorrador.findUniqueOrThrow({ where: { id: otro } });
      await tx.planBorrador.delete({ where: { id: otro } });
      const repo = planesEnTx(tx);
      // El repositorio real con la lectura de antes del borrado: el servicio cree que sigue ahí.
      const conLecturaVieja = Object.assign(Object.create(repo) as PlanesRepository, {
        borrador: async () => ({ ...leido, pasos: leido.pasos as Record<string, unknown> }),
      });
      const enCarrera = new PlanBorradorService(conLecturaVieja, new PlanesService(repo));
      const tarde = await enCarrera.confirmar(SUPERADMIN, { borradorId: otro });
      return { descartado, res, tarde, planes, planesDespues: await tx.plan.count(), conEsosIds: await tx.plan.count({ where: { id: { in: [id, otro] } } }) };
    });
    expect(r.descartado).toEqual({ estado: "ok" });
    expect(r.res).toEqual({ estado: "borrador_no_encontrado" });
    expect(r.tarde).toEqual({ estado: "borrador_no_encontrado" });
    expect(r.planesDespues).toBe(r.planes);
    expect(r.conEsosIds).toBe(0);
  });

  it("R20 — dos confirmaciones simultáneas crean un solo plan (dos conexiones en paralelo)", async () => {
    const [a, b, sujeta] = [crearPrismaDeTest(), crearPrismaDeTest(), crearPrismaDeTest()];
    let id: string | null = null;
    try {
      const r = await bajoLockDeEscrituraReal(async () => {
        id = await borradorDeCreacion(servicios(new PlanesRepository(a)).borradores);
        const borradorId = id;
        const fila = await sostener(sujeta, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM "plan_borrador" WHERE "id" = $1 FOR UPDATE`, borradorId));
        const deA = servicios(new PlanesRepository(a)).borradores.confirmar(SUPERADMIN, { borradorId });
        const deB = servicios(new PlanesRepository(b)).borradores.confirmar(SUPERADMIN, { borradorId });
        try {
          await esperarBloqueados(base, fila.pid, 2);
        } finally {
          fila.soltar();
          await fila.fin;
        }
        return {
          res: await Promise.all([deA, deB]),
          planes: await base.plan.count({ where: { id: borradorId } }),
          rastro: await base.planRastro.count({ where: { planId: borradorId } }),
          borrador: await base.planBorrador.count({ where: { id: borradorId } }),
        };
      });
      expect(r.res.map((x) => x.estado).sort()).toEqual(["borrador_no_encontrado", "ok"]);
      expect(r.res.find((x) => x.estado === "ok")).toMatchObject({ planId: id });
      expect(r).toMatchObject({ planes: 1, rastro: 1, borrador: 0 });
    } finally {
      if (id !== null) {
        const borradorId = id;
        await bajoLockDeEscrituraReal(async () => {
          await base.planBorrador.deleteMany({ where: { id: borradorId } });
          await base.planRastro.deleteMany({ where: { planId: borradorId } });
          await base.plan.deleteMany({ where: { id: borradorId } });
        });
      }
      await Promise.all([a.$disconnect(), b.$disconnect(), sujeta.$disconnect()]);
    }
  });
});
