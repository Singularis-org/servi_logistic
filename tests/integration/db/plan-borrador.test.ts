import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { PlanBorradorService } from "@/lib/services/PlanBorradorService";
import { PlanesService } from "@/lib/services/PlanesService";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, crearPlan, entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-129 · T6.1 (design §1, §5.4; R2, R4, R5, R8–R14, R22) — el borrador de planes contra Postgres, con
// `PlanBorradorService`, `PlanesService` y `PlanesRepository` REALES.
//
// Casi todo corre en una transacción del dueño que se revierte (`revertida`); el repositorio abre las suyas como
// SAVEPOINT. Los casos de concurrencia (R4, R5) no pueden: necesitan dos conexiones de verdad que vean lo
// commiteado. Ahí cada «superadmin» es un cliente Prisma propio, la siembra y la limpieza commitean bajo el lock
// de la 227 (`bajoLockDeEscrituraReal`), y la simultaneidad se FUERZA, no se espera a la suerte: una tercera
// conexión toma la fila que los dos van a escribir, los dos guardados arrancan y se quedan esperándola
// (`pg_blocking_pids`), y solo entonces se suelta.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** 2026-10-28 12:00 UTC = 06:00 en la plataforma (el reloj de SLT-128). */
const AHORA = new Date("2026-10-28T12:00:00.000Z");

let base: PrismaClient;

const GENERAL = (nombre = `borrador ${randomUUID().slice(0, 8)}`) => ({ nombre, visibilidad: "publico", organizacionId: null });
const PRECIO = {
  precio: {
    tipo: "monto",
    mensual: "50000.00",
    descuentos: [
      { periodo: "anual", tipo: "porcentaje", valor: "10" },
      { periodo: "quincenal", tipo: "monto", valor: "500.00" },
    ],
  },
};
const ORDEN = { costoPorOrden: "100.00", costoPorOrdenPorcentual: null, periodicidadOrdenes: "quincenal" };
const TOPES = { topes: { porRol: { admin: 2 }, apiKeys: 3 } };
const MODULOS = { modulos: ["ranking"] };

/** Un superadmin con nombre: una fila de `usuario` real (el nombre se congela de ella) con el rol de la sesión. */
async function superadmin(tx: TxDeTest): Promise<{ actor: Actor; nombre: string }> {
  const org = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, org);
  const u = await crearUsuarioDePrueba(tx, "admin");
  await fijarEmpresa(tx, "");
  return {
    actor: { usuarioId: u.id, rol: "superadmin", organizacionId: null },
    nombre: [u.nombre, u.primerApellido].filter(Boolean).join(" "),
  };
}

function servicios(repo: PlanesRepository, ahora: () => Date = () => new Date()) {
  const planes = new PlanesService(repo, ahora);
  return { planes, borradores: new PlanBorradorService(repo, planes) };
}

const crear = (borradorId: string | null, paso: string, valores: unknown) => ({ modo: "crear", borradorId, paso, valores });
const editar = (planId: string, paso: string, valores: unknown) => ({ modo: "editar", planId, paso, valores });

function idDe(r: { estado: string; borradorId?: string }): string {
  if (r.estado !== "ok" || r.borradorId === undefined) throw new Error(`guardar: ${JSON.stringify(r)}`);
  return r.borradorId;
}

async function fila(c: PrismaClient | TxDeTest, id: string) {
  return c.planBorrador.findUnique({ where: { id } });
}

/** Lo que un borrador NO puede mover de un plan (R12): sus filas y las de sus hijas, y la cola. */
async function fotoDelPlan(tx: TxDeTest, planId: string) {
  const tabla = async (sql: string) =>
    (await tx.$queryRawUnsafe<{ j: unknown }[]>(`SELECT coalesce(jsonb_agg(f ORDER BY f::text), '[]'::jsonb) AS j FROM (${sql}) x(f)`, planId))[0].j;
  return {
    plan: await tabla(`SELECT to_jsonb(t) FROM "plan" t WHERE t."id" = $1`),
    topes: await tabla(`SELECT to_jsonb(t) FROM "plan_tope_rol" t WHERE t."plan_id" = $1`),
    modulos: await tabla(`SELECT to_jsonb(t) FROM "plan_modulo" t WHERE t."plan_id" = $1`),
    descuentos: await tabla(`SELECT to_jsonb(t) FROM "plan_descuento_periodo" t WHERE t."plan_id" = $1`),
    precios: await tabla(`SELECT to_jsonb(t) FROM "plan_precio_historial" t WHERE t."plan_id" = $1`),
    pendiente: await tabla(`SELECT to_jsonb(t) FROM "plan_cambio_programado" t WHERE t."plan_id" = $1`),
    recepciones: await tabla(
      `SELECT to_jsonb(r) FROM "plan_cambio_recepcion" r JOIN "plan_cambio_programado" c ON c."id" = r."cambio_id" WHERE c."plan_id" = $1`,
    ),
    versiones: await tabla(`SELECT to_jsonb(t) FROM "plan_version_empresa" t WHERE t."plan_id" = $1`),
    empresas: await tabla(`SELECT to_jsonb(t) FROM "organizacion" t WHERE t."plan_id" = $1 OR t."plan_cambio_plan_id" = $1`),
    rastro: await tabla(`SELECT to_jsonb(t) FROM "plan_rastro" t WHERE t."plan_id" = $1`),
    jobs: await tabla(`SELECT to_jsonb(t) FROM "jobs" t WHERE t."payload"::text LIKE '%' || $1 || '%'`),
  };
}

/* -------------------------------------------------------------------------- */
/* Concurrencia forzada: dos conexiones que esperan a una tercera              */
/* -------------------------------------------------------------------------- */

/**
 * Abre una transacción en otra conexión, corre `tomar` (que bloquea una fila) y la sostiene hasta `soltar()`.
 * `pid` es su backend, para saber quién la está esperando.
 */
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

/**
 * Espera, consultando la base, a que `n` backends estén bloqueados por `pid`, directa o indirectamente (el
 * segundo en llegar a una fila espera al primero, en el lock de la tupla). Falla a los 4 s: las transacciones
 * del repositorio caducan a los 5.
 */
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
    if (Date.now() > limite) {
      const esperas = await c.$queryRawUnsafe<unknown[]>(
        `SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid)::text AS por, left(query, 80) AS q
           FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle'`,
      );
      throw new Error(`solo ${k} de ${n} guardados esperan a ${pid}: ${JSON.stringify(esperas)}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describeSiHayBase("SLT-129 — el borrador de planes en el servidor (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  /* ------------------------------- Guardar ------------------------------- */

  it("R2 — guardar General sin borrador crea uno con el iniciador y la fecha", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor, nombre } = await superadmin(tx);
      const [{ ahora }] = await tx.$queryRawUnsafe<{ ahora: Date }[]>(`SELECT (now() AT TIME ZONE 'UTC')::timestamp(3) AS ahora`);
      const general = GENERAL();
      const res = await servicios(planesEnTx(tx)).borradores.guardarPaso(actor, crear(null, "general", general));
      return { actor, nombre, ahora, general, res, fila: await fila(tx, idDe(res)) };
    });
    expect(r.res).toEqual({ estado: "ok", borradorId: expect.any(String), pasosGuardados: ["general"], actualizadoAt: expect.any(String) });
    expect(r.fila).toMatchObject({
      planId: null,
      pasos: { general: r.general },
      iniciadoPorUsuarioId: r.actor.usuarioId,
      iniciadoPorNombre: r.nombre,
    });
    // «Cuándo»: el instante de la transacción, con el reloj UTC de las demás columnas sin zona.
    expect(r.fila?.createdAt.toISOString()).toBe(r.ahora.toISOString());
    expect(r.fila?.updatedAt.toISOString()).toBe(r.ahora.toISOString());
    if (r.res.estado === "ok") expect(r.res.actualizadoAt).toBe(r.ahora.toISOString());
    // Y en UTC, como escribe Prisma: no la hora local de la sesión.
    expect(Math.abs((r.fila?.createdAt.getTime() ?? 0) - Date.now())).toBeLessThan(5 * 60_000);
  });

  it("R4 — guardar un paso no toca los demás", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const { borradores } = servicios(planesEnTx(tx));
      const id = idDe(await borradores.guardarPaso(actor, crear(null, "general", GENERAL("Primero"))));
      await borradores.guardarPaso(actor, crear(id, "precio", PRECIO));
      await borradores.guardarPaso(actor, crear(id, "topes", TOPES));
      const antes = (await fila(tx, id))?.pasos;
      const otroPrecio = { precio: { tipo: "sin_precio" } };
      const res = await borradores.guardarPaso(actor, crear(id, "precio", otroPrecio));
      return { antes, otroPrecio, res, despues: (await fila(tx, id))?.pasos };
    });
    expect(r.antes).toEqual({ general: GENERAL("Primero"), precio: PRECIO, topes: TOPES });
    expect(r.res).toMatchObject({ estado: "ok", pasosGuardados: ["general", "precio", "topes"] });
    expect(r.despues).toEqual({ general: GENERAL("Primero"), precio: r.otroPrecio, topes: TOPES });
  });

  it("R4 — dos guardados simultáneos de pasos distintos conservan los dos (dos conexiones en paralelo)", async () => {
    const [a, b, sujeta] = [crearPrismaDeTest(), crearPrismaDeTest(), crearPrismaDeTest()];
    const actor: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
    let id: string | null = null;
    try {
      id = idDe(await servicios(new PlanesRepository(a)).borradores.guardarPaso(actor, crear(null, "general", GENERAL("Paralelo"))));
      const borradorId = id;
      const r = await bajoLockDeEscrituraReal(async () => {
        const fila = await sostener(sujeta, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM "plan_borrador" WHERE "id" = $1 FOR UPDATE`, borradorId));
        const deA = servicios(new PlanesRepository(a)).borradores.guardarPaso(actor, crear(borradorId, "precio", PRECIO));
        const deB = servicios(new PlanesRepository(b)).borradores.guardarPaso(actor, crear(borradorId, "topes", TOPES));
        try {
          await esperarBloqueados(base, fila.pid, 2);
        } finally {
          fila.soltar();
          await fila.fin;
        }
        return Promise.all([deA, deB]);
      });
      expect(r.map((x) => x.estado)).toEqual(["ok", "ok"]);
      expect((await fila(base, id))?.pasos).toEqual({ general: GENERAL("Paralelo"), precio: PRECIO, topes: TOPES });
    } finally {
      if (id !== null) await bajoLockDeEscrituraReal(() => base.planBorrador.deleteMany({ where: { id: id as string } }));
      await Promise.all([a.$disconnect(), b.$disconnect(), sujeta.$disconnect()]);
    }
  });

  it("R5 — el segundo superadmin sigue el borrador del primero", async () => {
    const r = await revertida(base, async (tx) => {
      const uno = await superadmin(tx);
      const dos = await superadmin(tx);
      const planId = await crearPlan(tx);
      const { borradores } = servicios(planesEnTx(tx));
      const primero = await borradores.guardarPaso(uno.actor, editar(planId, "general", { nombre: "Cambio de uno" }));
      const segundo = await borradores.guardarPaso(dos.actor, editar(planId, "topes", TOPES));
      return { uno, planId, primero, segundo, filas: await tx.planBorrador.findMany({ where: { planId } }) };
    });
    expect(r.segundo).toMatchObject({ estado: "ok", borradorId: idDe(r.primero), pasosGuardados: ["general", "topes"] });
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      pasos: { general: { nombre: "Cambio de uno" }, topes: TOPES },
      iniciadoPorUsuarioId: r.uno.actor.usuarioId,
      iniciadoPorNombre: r.uno.nombre,
    });
  });

  it("R5 — dos primeros guardados simultáneos del mismo plan dejan un solo borrador (dos conexiones en paralelo)", async () => {
    const [a, b, sujeta] = [crearPrismaDeTest(), crearPrismaDeTest(), crearPrismaDeTest()];
    const uno: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
    const dos: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
    let planId: string | null = null;
    try {
      const r = await bajoLockDeEscrituraReal(async () => {
        planId = await crearPlan(base);
        const id = planId;
        // El plan en FOR UPDATE: los dos se quedan en su FOR SHARE, sin borrador todavía, y salen a la vez.
        const plan = await sostener(sujeta, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM "plan" WHERE "id" = $1 FOR UPDATE`, id));
        const deUno = servicios(new PlanesRepository(a)).borradores.guardarPaso(uno, editar(id, "general", { nombre: "De uno" }));
        const deDos = servicios(new PlanesRepository(b)).borradores.guardarPaso(dos, editar(id, "modulos", MODULOS));
        let antes: number;
        try {
          await esperarBloqueados(base, plan.pid, 2);
          antes = await base.planBorrador.count({ where: { planId: id } });
        } finally {
          plan.soltar();
          await plan.fin;
        }
        return { antes, res: await Promise.all([deUno, deDos]), filas: await base.planBorrador.findMany({ where: { planId: id } }) };
      });
      expect(r.antes).toBe(0);
      expect(r.res.map((x) => x.estado)).toEqual(["ok", "ok"]);
      expect(new Set(r.res.map((x) => idDe(x))).size).toBe(1);
      expect(r.filas).toHaveLength(1);
      expect(r.filas[0].pasos).toEqual({ general: { nombre: "De uno" }, modulos: MODULOS });
      // El iniciador es el del primero que entró, sea cual sea.
      expect([uno.usuarioId, dos.usuarioId]).toContain(r.filas[0].iniciadoPorUsuarioId);
    } finally {
      if (planId !== null) {
        const id = planId;
        await bajoLockDeEscrituraReal(() => base.plan.deleteMany({ where: { id } }));
      }
      await Promise.all([a.$disconnect(), b.$disconnect(), sujeta.$disconnect()]);
    }
  });

  it("R8 — plan inexistente, plan archivado y borrador inexistente no escriben", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const archivado = await crearPlan(tx, { archivado: true });
      const { borradores } = servicios(planesEnTx(tx));
      const antes = await tx.planBorrador.count();
      const res = {
        inexistente: await borradores.guardarPaso(actor, editar(randomUUID(), "general", { nombre: "X" })),
        archivado: await borradores.guardarPaso(actor, editar(archivado, "general", { nombre: "X" })),
        sinBorrador: await borradores.guardarPaso(actor, crear(randomUUID(), "precio", PRECIO)),
      };
      // Y el repositorio, que lo repite bajo el cerrojo del plan, sin la lectura previa del servicio.
      const repo = planesEnTx(tx);
      const enRepo = {
        inexistente: await repo.guardarPasoDeCambio(randomUUID(), "general", { nombre: "X" }, actor.usuarioId),
        archivado: await repo.guardarPasoDeCambio(archivado, "general", { nombre: "X" }, actor.usuarioId),
      };
      return { res, enRepo, antes, despues: await tx.planBorrador.count() };
    });
    expect(r.res).toEqual({
      inexistente: { estado: "not_found" },
      archivado: { estado: "archivado" },
      sinBorrador: { estado: "borrador_no_encontrado" },
    });
    expect(r.enRepo).toEqual({ inexistente: { estado: "not_found" }, archivado: { estado: "archivado" } });
    expect(r.despues).toBe(r.antes);
  });

  /* ---------------------------- Leer y listar ---------------------------- */

  it("R9 — otro superadmin lee el borrador tal como se guardó", async () => {
    const r = await revertida(base, async (tx) => {
      const uno = await superadmin(tx);
      const dos = await superadmin(tx);
      const planId = await crearPlan(tx);
      // Cada operación con su propio servicio y repositorio: otra «sesión».
      const id = idDe(await servicios(planesEnTx(tx)).borradores.guardarPaso(uno.actor, crear(null, "general", GENERAL("Leído"))));
      const guardado = await servicios(planesEnTx(tx)).borradores.guardarPaso(uno.actor, crear(id, "precio", PRECIO));
      const cambio = idDe(await servicios(planesEnTx(tx)).borradores.guardarPaso(uno.actor, editar(planId, "vigencia", { vigenteDesde: "2099-01-01" })));
      const f = await fila(tx, id);
      const lector = servicios(planesEnTx(tx)).borradores;
      return {
        uno,
        id,
        planId,
        cambio,
        guardado,
        f,
        porId: await lector.leer(dos.actor, { borradorId: id }),
        porPlan: await lector.leer(dos.actor, { planId }),
      };
    });
    expect(r.porId).toEqual({
      estado: "ok",
      borrador: {
        id: r.id,
        modo: "crear",
        planId: null,
        // Los descuentos en lista y en el mismo orden en que llegaron.
        pasos: { general: GENERAL("Leído"), precio: PRECIO },
        pasosGuardados: ["general", "precio"],
        iniciadoPor: r.uno.nombre,
        iniciadoAt: r.f?.createdAt.toISOString(),
        actualizadoAt: r.f?.updatedAt.toISOString(),
      },
    });
    expect(r.guardado).toMatchObject({ actualizadoAt: r.f?.updatedAt.toISOString() });
    expect(r.porPlan).toMatchObject({
      estado: "ok",
      borrador: { id: r.cambio, modo: "editar", planId: r.planId, pasos: { vigencia: { vigenteDesde: "2099-01-01" } }, pasosGuardados: ["vigencia"] },
    });
  });

  it("R9 — un plan sin borrador de cambio devuelve null", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const planId = await crearPlan(tx);
      const lector = servicios(planesEnTx(tx)).borradores;
      return { conPlan: await lector.leer(actor, { planId }), sinPlan: await lector.leer(actor, { planId: randomUUID() }) };
    });
    expect(r).toEqual({ conPlan: { estado: "ok", borrador: null }, sinPlan: { estado: "ok", borrador: null } });
  });

  it("R10 — la lista trae los borradores de los dos superadmins con su nombre", async () => {
    const r = await revertida(base, async (tx) => {
      const uno = await superadmin(tx);
      const dos = await superadmin(tx);
      const planConGeneral = await crearPlan(tx);
      const planSinGeneral = await crearPlan(tx);
      const nombreDelPlan = (await tx.plan.findUniqueOrThrow({ where: { id: planSinGeneral }, select: { nombre: true } })).nombre;
      const { borradores } = servicios(planesEnTx(tx));
      const creacion = idDe(await borradores.guardarPaso(uno.actor, crear(null, "general", GENERAL("Nuevo de uno"))));
      const cambioConGeneral = idDe(await borradores.guardarPaso(dos.actor, editar(planConGeneral, "general", { nombre: "Renombrado por dos" })));
      const cambioSinGeneral = idDe(await borradores.guardarPaso(dos.actor, editar(planSinGeneral, "topes", TOPES)));
      // Una creación sin General no se puede hacer por el servicio (R3): se siembra como dueño.
      const sinNombre = randomUUID();
      await tx.planBorrador.create({
        data: { id: sinNombre, pasos: { precio: PRECIO }, iniciadoPorUsuarioId: uno.actor.usuarioId, iniciadoPorNombre: uno.nombre },
      });
      const lista = await borradores.borradores(uno.actor);
      const mios = new Set([creacion, cambioConGeneral, cambioSinGeneral, sinNombre]);
      return {
        uno,
        dos,
        planConGeneral,
        planSinGeneral,
        nombreDelPlan,
        creacion,
        cambioConGeneral,
        cambioSinGeneral,
        sinNombre,
        estado: lista.estado,
        filas: lista.estado === "ok" ? lista.borradores.filter((b) => mios.has(b.id)) : [],
      };
    });
    expect(r.estado).toBe("ok");
    const porId = Object.fromEntries(r.filas.map((f) => [f.id, f]));
    expect(Object.keys(porId).sort()).toEqual([r.creacion, r.cambioConGeneral, r.cambioSinGeneral, r.sinNombre].sort());
    const fecha = { iniciadoAt: expect.any(String), actualizadoAt: expect.any(String) };
    expect(porId[r.creacion]).toEqual({ id: r.creacion, modo: "crear", planId: null, nombre: "Nuevo de uno", iniciadoPor: r.uno.nombre, ...fecha });
    expect(porId[r.cambioConGeneral]).toEqual({
      id: r.cambioConGeneral,
      modo: "editar",
      planId: r.planConGeneral,
      nombre: "Renombrado por dos",
      iniciadoPor: r.dos.nombre,
      ...fecha,
    });
    expect(porId[r.cambioSinGeneral]).toEqual({
      id: r.cambioSinGeneral,
      modo: "editar",
      planId: r.planSinGeneral,
      nombre: r.nombreDelPlan,
      iniciadoPor: r.dos.nombre,
      ...fecha,
    });
    expect(porId[r.sinNombre]).toEqual({ id: r.sinNombre, modo: "crear", planId: null, nombre: null, iniciadoPor: r.uno.nombre, ...fecha });
  });

  /* ------------------------ Lo que un borrador no hace ------------------------ */

  it("R11 — un borrador completo no aparece en asignables, públicos ni catálogo, y asignarlo da not_found (incluye uno custom con su empresa)", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const org = (await crearOrganizacion(tx)).id;
      const { planes, borradores } = servicios(planesEnTx(tx));
      const completo = async (general: unknown) => {
        const id = idDe(await borradores.guardarPaso(actor, crear(null, "general", general)));
        for (const [paso, valores] of [["precio", PRECIO], ["orden", ORDEN], ["topes", TOPES], ["modulos", MODULOS]] as const) {
          await borradores.guardarPaso(actor, crear(id, paso, valores));
        }
        return id;
      };
      const publico = await completo(GENERAL());
      const custom = await completo({ nombre: `custom ${randomUUID().slice(0, 8)}`, visibilidad: "custom", organizacionId: org, tipoCobro: "mensual" });
      // Control de no vacuidad: un plan de verdad sí sale en las tres lecturas.
      const real = await planes.crear(actor, entradaAsignable());
      if (real.estado !== "ok") throw new Error(`crear: ${JSON.stringify(real)}`);
      const asignables = await planes.asignables(actor, { organizacionId: org });
      const catalogo = await planes.catalogo(actor);
      const ids = (x: { estado: string; planes?: { id: string }[] }) => (x.planes ?? []).map((p) => p.id);
      return {
        publico,
        custom,
        real: real.planId,
        asignables: ids(asignables),
        publicos: (await planes.planesPublicos()).map((p) => p.id),
        catalogo: ids(catalogo),
        pendientes: await borradores.leer(actor, { borradorId: custom }),
        asignarPublico: await planes.asignar(actor, { organizacionId: org, planId: publico, tipoCobro: "mensual" }),
        asignarCustom: await planes.asignar(actor, { organizacionId: org, planId: custom, tipoCobro: "mensual" }),
        planes: await tx.plan.count({ where: { id: { in: [publico, custom] } } }),
        empresa: await tx.organizacion.findUniqueOrThrow({ where: { id: org }, select: { planId: true, planCambioPlanId: true } }),
      };
    });
    expect(r.pendientes).toMatchObject({ borrador: { pasosGuardados: ["general", "precio", "orden", "topes", "modulos"] } });
    for (const lista of [r.asignables, r.publicos, r.catalogo]) {
      expect(lista).toContain(r.real);
      expect(lista).not.toContain(r.publico);
      expect(lista).not.toContain(r.custom);
    }
    expect(r.asignarPublico).toEqual({ estado: "not_found" });
    expect(r.asignarCustom).toEqual({ estado: "not_found" });
    expect(r.planes).toBe(0);
    expect(r.empresa).toEqual({ planId: null, planCambioPlanId: null });
  });

  it("R12 — guardar los seis pasos del cambio deja el plan, el pendiente y la cola de trabajos igual", async () => {
    const r = await revertida(base, async (tx) => {
      // Asignar escribe `historial_accion` con el actor: sin fila de `usuario`, como el superadmin de los moldes.
      const actor: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
      const { planes } = servicios(planesEnTx(tx), () => AHORA);
      const entrada = entradaAsignable({ topes: { porRol: { admin: 5 }, apiKeys: 4 }, modulos: ["analitica"] });
      const creado = await planes.crear(actor, entrada);
      if (creado.estado !== "ok") throw new Error(`crear: ${JSON.stringify(creado)}`);
      const planId = creado.planId;
      for (const tipoCobro of ["quincenal", "mensual"] as const) {
        const org = (await crearOrganizacion(tx)).id;
        const a = await planes.asignar(actor, { organizacionId: org, planId, tipoCobro });
        if (a.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(a)}`);
      }
      await fijarEmpresa(tx, "");
      // Un pendiente de verdad (SLT-128), con sus recepciones y sus trabajos: lo que el borrador no debe tocar.
      const programado = await planes.editar(actor, {
        planId,
        nombre: "Programado",
        topes: entrada.topes,
        modulos: entrada.modulos,
        precio: entrada.precio,
        costoPorOrden: entrada.costoPorOrden,
        costoPorOrdenPorcentual: null,
        vigenteDesde: "2026-11-16",
      });
      if (programado.estado !== "ok") throw new Error(`programar: ${JSON.stringify(programado)}`);
      const antes = await fotoDelPlan(tx, planId);
      const { borradores } = servicios(planesEnTx(tx), () => AHORA);
      const pasos: [string, unknown][] = [
        ["general", { nombre: "Otro nombre" }],
        ["precio", { precio: { tipo: "monto", mensual: "99999.00", descuentos: [{ periodo: "mensual", tipo: "porcentaje", valor: "5" }] } }],
        ["orden", { costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: null }, periodicidadOrdenes: "mensual" }],
        ["topes", { topes: { porRol: { admin: 1 }, apiKeys: 1 } }],
        ["modulos", { modulos: ["monitoreo"] }],
        ["vigencia", { vigenteDesde: "2026-12-01" }],
      ];
      const res = [];
      for (const [paso, valores] of pasos) res.push((await borradores.guardarPaso(actor, editar(planId, paso, valores))).estado);
      return { res, antes, despues: await fotoDelPlan(tx, planId), borrador: await tx.planBorrador.findUnique({ where: { planId } }) };
    });
    expect(r.res).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    // No vacuidad: la foto tiene lo que dice tener.
    expect(r.antes.pendiente).toHaveLength(1);
    expect(r.antes.recepciones).toHaveLength(2);
    expect((r.antes.jobs as unknown[]).length).toBeGreaterThan(0);
    expect(r.despues).toEqual(r.antes);
    expect(Object.keys(r.borrador?.pasos as object).sort()).toEqual(["general", "modulos", "orden", "precio", "topes", "vigencia"]);
  });

  it("R13 — guardar y descartar no dejan rastro", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const planId = await crearPlan(tx);
      const { borradores } = servicios(planesEnTx(tx));
      const rastro = () => tx.planRastro.count();
      const antes = await rastro();
      const creacion = idDe(await borradores.guardarPaso(actor, crear(null, "general", GENERAL())));
      await borradores.guardarPaso(actor, crear(creacion, "topes", TOPES));
      const cambio = idDe(await borradores.guardarPaso(actor, editar(planId, "general", { nombre: "Sin rastro" })));
      const trasGuardar = await rastro();
      const descartes = [await borradores.descartar(actor, { borradorId: creacion }), await borradores.descartar(actor, { borradorId: cambio })];
      return { antes, trasGuardar, descartes, trasDescartar: await rastro(), delPlan: await tx.planRastro.count({ where: { planId } }) };
    });
    expect(r.descartes).toEqual([{ estado: "ok" }, { estado: "ok" }]);
    expect(r.trasGuardar).toBe(r.antes);
    expect(r.trasDescartar).toBe(r.antes);
    expect(r.delPlan).toBe(0);
  });

  /* --------------------------------- Descartar --------------------------------- */

  it("R14 — otro superadmin descarta el borrador y ya no se lee", async () => {
    const r = await revertida(base, async (tx) => {
      const uno = await superadmin(tx);
      const dos = await superadmin(tx);
      const planId = await crearPlan(tx);
      const { borradores } = servicios(planesEnTx(tx));
      const creacion = idDe(await borradores.guardarPaso(uno.actor, crear(null, "general", GENERAL())));
      await borradores.guardarPaso(uno.actor, crear(creacion, "precio", PRECIO));
      const cambio = idDe(await borradores.guardarPaso(uno.actor, editar(planId, "topes", TOPES)));
      const planAntes = await fotoDelPlan(tx, planId);
      const descartes = [await borradores.descartar(dos.actor, { borradorId: creacion }), await borradores.descartar(dos.actor, { borradorId: cambio })];
      return {
        descartes,
        porId: await borradores.leer(uno.actor, { borradorId: creacion }),
        porPlan: await borradores.leer(uno.actor, { planId }),
        filas: await tx.planBorrador.count({ where: { id: { in: [creacion, cambio] } } }),
        planAntes,
        planDespues: await fotoDelPlan(tx, planId),
      };
    });
    expect(r.descartes).toEqual([{ estado: "ok" }, { estado: "ok" }]);
    expect(r.porId).toEqual({ estado: "ok", borrador: null });
    expect(r.porPlan).toEqual({ estado: "ok", borrador: null });
    expect(r.filas).toBe(0);
    expect(r.planDespues).toEqual(r.planAntes);
  });

  it("R14 — descartar uno inexistente da borrador_no_encontrado", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const { borradores } = servicios(planesEnTx(tx));
      const id = idDe(await borradores.guardarPaso(actor, crear(null, "general", GENERAL())));
      const primero = await borradores.descartar(actor, { borradorId: id });
      return { primero, segundo: await borradores.descartar(actor, { borradorId: id }), otro: await borradores.descartar(actor, { borradorId: randomUUID() }) };
    });
    expect(r).toEqual({ primero: { estado: "ok" }, segundo: { estado: "borrador_no_encontrado" }, otro: { estado: "borrador_no_encontrado" } });
  });

  /* ----------------------------------- Datos ----------------------------------- */

  it("R22 — borrar la empresa del custom borra el borrador de su plan", async () => {
    const r = await revertida(base, async (tx) => {
      const { actor } = await superadmin(tx);
      const org = (await crearOrganizacion(tx)).id;
      const planId = await crearPlan(tx, { custom: org });
      const otroPlan = await crearPlan(tx);
      const { borradores } = servicios(planesEnTx(tx));
      const delCustom = idDe(await borradores.guardarPaso(actor, editar(planId, "general", { nombre: "Se va con la empresa" })));
      const delOtro = idDe(await borradores.guardarPaso(actor, editar(otroPlan, "general", { nombre: "Se queda" })));
      const antes = await tx.planBorrador.count({ where: { id: { in: [delCustom, delOtro] } } });
      const error = await capturar(tx, () => tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = $1`, org));
      return {
        antes,
        error,
        plan: await tx.plan.count({ where: { id: planId } }),
        delCustom: await tx.planBorrador.count({ where: { id: delCustom } }),
        delOtro: await tx.planBorrador.count({ where: { id: delOtro } }),
      };
    });
    expect(r.antes).toBe(2);
    expect(r.error).toBeNull();
    expect(r.plan).toBe(0);
    expect(r.delCustom).toBe(0);
    expect(r.delOtro).toBe(1);
  });
});
