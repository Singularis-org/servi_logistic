import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModuloApagable, PrismaClient } from "@prisma/client";

import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  crearPlanAplicarCambioHandler,
  crearPlanCambiosVencidosHandler,
  crearPlanRecordatorioCambioHandler,
} from "@/lib/planes/jobs-cambio-plan";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, EditarPlanInput, TipoCobro } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, crearPlan, entradaAsignable, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-128 · T7.1 (design §3, §4; R1, R4–R6, R10, R11, R13–R19) — el cambio programado de un plan llega a cada
// empresa en SU recepción, contra Postgres, con `PlanesService`, `PlanesRepository` y los handlers REALES de la
// cola. Todo en una transacción del dueño que se revierte; el repositorio abre las suyas como SAVEPOINT.
//
// El reloj va inyectado: el del servicio al guardar (por defecto el 28 de octubre de 2026) y el de cada trabajo o
// llamada del repositorio (la cola corre a las 00:00 de la plataforma, −06:00). La cola se corre a mano: cada
// recepción con `recibirCambio` (o su handler con empresa), el sin empresa con `aplicarCambioProgramado` y el
// barrido con su handler.
//
// Las fechas de los casos salen del spec: F = 16 de noviembre → la quincenal lo recibe el 16, la mensual el 1 de
// diciembre, la bimestral y la anual el 1 de enero de 2027.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
/** Las 00:00 de la plataforma de `fecha` (`AAAA-MM-DD`), más `minutos`. */
const a = (fecha: string, minutos = 0) => new Date(new Date(`${fecha}T06:00:00.000Z`).getTime() + minutos * 60_000);

let base: PrismaClient;

type Trabajo = JobDTO & { organizacionId: string | null };

/**
 * Un plan con una empresa por cada tipo de `tipos`, asignadas el 28 de octubre por el servicio. `programar` edita
 * con fecha (o sin ella) con el reloj que se le pase; `recibir` es la cola dando ESE pendiente a una empresa.
 */
async function preparar(tx: TxDeTest, plan: Partial<CrearPlanInput>, tipos: readonly TipoCobro[]) {
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const entrada = entradaAsignable(plan);
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`crear: ${JSON.stringify(creado)}`);
  const planId = creado.planId;
  const orgs: string[] = [];
  for (const [i, tipoCobro] of tipos.entries()) {
    const { id } = await crearOrganizacion(tx, { nombre: `SLT128 ${tipoCobro} ${i} ${randomUUID().slice(0, 6)}` });
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId, tipoCobro });
    if (r.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(r)}`);
    orgs.push(id);
  }
  await fijarEmpresa(tx, "");
  const programar = async (vigenteDesde: string | null, cambio: Partial<EditarPlanInput> = {}, ahora: Date = AHORA) => {
    // El superadmin no tiene empresa: lo que encola sin empresa nace con `organizacion_id` NULL.
    await fijarEmpresa(tx, "");
    return new PlanesService(planesEnTx(tx), () => ahora).editar(SUPERADMIN, {
      planId,
      nombre: entrada.nombre,
      topes: entrada.topes,
      modulos: entrada.modulos,
      precio: entrada.precio,
      costoPorOrden: entrada.costoPorOrden,
      costoPorOrdenPorcentual: null,
      vigenteDesde,
      ...cambio,
    });
  };
  const pendiente = async () => (await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId }, select: { id: true } })).id;
  const recibir = async (organizacionId: string, ahora: Date) => {
    await fijarEmpresa(tx, "");
    return planesEnTx(tx).recibirCambio({ planId, cambioId: await pendiente() }, organizacionId, ahora);
  };
  return { servicio, planId, entrada, orgs, programar, pendiente, recibir };
}

/** Las recepciones del pendiente `cambioId`: empresa → [recibe_at, recibido o no]. */
async function recepciones(tx: TxDeTest, cambioId: string): Promise<Record<string, [string, boolean]>> {
  const filas = await tx.planCambioRecepcion.findMany({ where: { cambioId }, select: { empresaId: true, recibeAt: true, recibidoAt: true } });
  return Object.fromEntries(filas.map((f) => [f.empresaId, [f.recibeAt.toISOString(), f.recibidoAt !== null]]));
}

async function trabajos(tx: TxDeTest, tipo: "plan_aplicar_cambio" | "plan_recordatorio_cambio" | "plan_aviso_correo", planId: string) {
  const filas = await tx.$queryRaw<
    { id: string; payload: Record<string, unknown>; run_after: Date; dedupe_key: string | null; organizacion_id: string | null }[]
  >`SELECT "id", "payload", "run_after", "dedupe_key", "organizacion_id" FROM "jobs"
     WHERE "tipo" = ${tipo}::"job_tipo" AND "payload"->>'planId' = ${planId} ORDER BY "organizacion_id" NULLS FIRST, "dedupe_key", "id"`;
  return filas.map(
    (f): Trabajo => ({
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
    }),
  );
}

async function modulos(tx: TxDeTest, organizacionId: string): Promise<ModuloApagable[]> {
  const filas = await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } });
  return filas.map((f) => f.modulo).sort();
}

async function fotoDelPlan(tx: TxDeTest, planId: string) {
  const p = await tx.plan.findUniqueOrThrow({
    where: { id: planId },
    select: {
      nombre: true,
      precioMensual: true,
      topeApiKeys: true,
      topesPorRol: { select: { rol: true, maximo: true }, orderBy: { rol: "asc" } },
      modulos: { select: { modulo: true }, orderBy: { modulo: "asc" } },
    },
  });
  return {
    nombre: p.nombre,
    mensual: p.precioMensual?.toFixed(2) ?? null,
    apiKeys: p.topeApiKeys,
    porRol: p.topesPorRol.map((t) => [t.rol, t.maximo]),
    modulos: p.modulos.map((m) => m.modulo),
  };
}

/** Lo que una operación rechazada no debe mover: el plan, su rastro, su pendiente, sus recepciones y versiones. */
async function fotoDelCambio(tx: TxDeTest, planId: string) {
  const pendiente = await tx.planCambioProgramado.findUnique({ where: { planId }, select: { id: true, version: true } });
  return {
    plan: await fotoDelPlan(tx, planId),
    rastro: await tx.planRastro.count({ where: { planId } }),
    pendiente,
    recepciones: pendiente === null ? {} : await recepciones(tx, pendiente.id),
    versiones: await tx.planVersionEmpresa.count({ where: { planId } }),
    avisos: (await trabajos(tx, "plan_aviso_correo", planId)).length,
  };
}

/** El precio del historial que rige un período que empieza en `inicio` (SLT-86 R15). */
async function precioDelPeriodo(tx: TxDeTest, planId: string, inicio: Date): Promise<string | null> {
  const [f] = await tx.$queryRawUnsafe<{ m: string | null }[]>(
    `SELECT "precio_mensual"::text AS m FROM "plan_precio_historial" WHERE "plan_id" = $1 AND "desde_at" <= $2::timestamp
      ORDER BY "desde_at" DESC LIMIT 1`,
    planId,
    inicio.toISOString().replace("T", " ").replace("Z", ""),
  );
  return f?.m ?? null;
}

/** Un cambio de empresa ya guardado (otra vía: SLT-86/SLT-99), escrito por SQL; lo aplica la cola real. */
async function pendienteDeEmpresaPorSql(tx: TxDeTest, organizacionId: string, planId: string, tipo: TipoCobro, desde: Date) {
  const cambioId = randomUUID();
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_cambio_id" = $2, "plan_cambio_plan_id" = $3, "plan_cambio_tipo_cobro" = $4,
            "plan_cambio_desde_at" = $5::timestamp, "plan_cambio_actor_id" = $6 WHERE "id" = $1`,
    organizacionId,
    cambioId,
    planId,
    tipo,
    desde.toISOString().replace("T", " ").replace("Z", ""),
    SUPERADMIN.usuarioId,
  );
  return cambioId;
}

describeSiHayBase("SLT-128 — el cambio programado llega a cada empresa en su recepción", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: al guardar, cada empresa queda con SU recepción según su tipo, con su trabajo; con F = 1 de diciembre, la quincenal y la mensual el 1", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual", "bimestral", "anual"]);
      await p.programar("2026-11-16", { nombre: "F dieciséis" });
      const cambio = await p.pendiente();
      const q = await preparar(tx, {}, ["quincenal", "mensual"]);
      await q.programar("2026-12-01", { nombre: "F uno" });
      const deEmpresa = (await trabajos(tx, "plan_aplicar_cambio", p.planId)).filter((t) => t.organizacionId !== null);
      return {
        orgs: p.orgs,
        cambio,
        recepciones: await recepciones(tx, cambio),
        trabajos: Object.fromEntries(deEmpresa.map((t) => [t.organizacionId, [t.runAfter.toISOString(), t.payload.recibeAt, t.dedupeKey]])),
        q: { orgs: q.orgs, recepciones: await recepciones(tx, await q.pendiente()) },
      };
    });
    const [quincenal, mensual, bimestral, anual] = r.orgs;
    const fechas = {
      [quincenal]: "2026-11-16T06:00:00.000Z",
      [mensual]: "2026-12-01T06:00:00.000Z",
      [bimestral]: "2027-01-01T06:00:00.000Z",
      [anual]: "2027-01-01T06:00:00.000Z",
    };
    expect(r.recepciones).toEqual(Object.fromEntries(Object.entries(fechas).map(([org, f]) => [org, [f, false]])));
    // Un `plan_aplicar_cambio` con empresa por recepción, en su fecha (§4).
    expect(r.trabajos).toEqual(
      Object.fromEntries(Object.entries(fechas).map(([org, f]) => [org, [f, f, `plan_cambio:${r.cambio}:${org}:${f}`]])),
    );
    expect(r.q.recepciones).toEqual({
      [r.q.orgs[0]]: ["2026-12-01T06:00:00.000Z", false],
      [r.q.orgs[1]]: ["2026-12-01T06:00:00.000Z", false],
    });
  });

  it("R5, R10, R11: el barrido da a cada una su recepción, una sola vez y sin adelantarla; el detalle cuenta N de M; la última promueve el plan; el ciclo no se mueve", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      const [quincenal, mensual] = p.orgs;
      await p.programar("2026-11-16", { nombre: "Por partes" });
      const ciclo = async () =>
        tx.organizacion.findMany({
          where: { id: { in: p.orgs } },
          orderBy: { id: "asc" },
          select: { id: true, planTipoCobro: true, planCicloAnclaAt: true },
        });
      const cicloAntes = await ciclo();
      const barrido = (ahora: Date) => crearPlanCambiosVencidosHandler(planesEnTx(tx), () => ahora)({} as JobDTO);
      // La mensual con el reloj del 16: no se adelanta.
      const adelantada = await p.recibir(mensual, a("2026-11-16", 1));
      // El barrido de la 01:30 del 16: la quincenal; el plan espera a la mensual.
      await barrido(a("2026-11-16", 90));
      await barrido(a("2026-11-16", 150)); // otra pasada: nada nuevo
      const repetida = await p.recibir(quincenal, a("2026-11-16", 151));
      const aMedias = {
        detalle: (await planesEnTx(tx).detalle(p.planId))?.pendiente,
        plan: (await fotoDelPlan(tx, p.planId)).nombre,
        recepciones: await recepciones(tx, await p.pendiente()),
        versiones: await tx.planVersionEmpresa.findMany({ where: { planId: p.planId }, select: { empresaId: true, desdeAt: true } }),
      };
      await barrido(a("2026-12-01", 90));
      const detalleFinal = (await planesEnTx(tx).detalle(p.planId))?.pendiente;
      return {
        quincenal,
        mensual,
        adelantada,
        repetida,
        aMedias,
        detalleFinal,
        plan: (await fotoDelPlan(tx, p.planId)).nombre,
        versiones: await tx.planVersionEmpresa.count({ where: { planId: p.planId } }),
        pendientes: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
        aplicados: await tx.planRastro.count({ where: { planId: p.planId, accion: "cambio_aplicado" } }),
        cicloAntes,
        cicloDespues: await ciclo(),
      };
    });
    expect(r.adelantada).toEqual({ estado: "aun_no_rige" });
    expect(r.repetida).toEqual({ estado: "sin_pendiente" });
    // R11: el pendiente sigue en el detalle con 1 de 2; el plan, en la versión de antes (R10).
    expect(r.aMedias.detalle).toMatchObject({ vigenteDesde: a("2026-11-16"), recibidas: 1, total: 2 });
    expect(r.aMedias.plan).not.toBe("Por partes");
    expect(r.aMedias.recepciones).toEqual({
      [r.quincenal]: ["2026-11-16T06:00:00.000Z", true],
      [r.mensual]: ["2026-12-01T06:00:00.000Z", false],
    });
    expect(r.aMedias.versiones).toEqual([{ empresaId: r.quincenal, desdeAt: a("2026-11-16") }]);
    // La mensual el 1 de diciembre: la última; el plan pasa a la versión nueva, sin pendiente ni versiones propias.
    expect(r.detalleFinal).toBeNull();
    expect(r).toMatchObject({ plan: "Por partes", versiones: 0, pendientes: 0, aplicados: 1 });
    // R5: ni la entrada ni el tipo de ninguna empresa cambian al recibir.
    expect(r.cicloDespues).toEqual(r.cicloAntes);
  });

  it("R4, R10: cada empresa enciende y apaga solo lo que cambia respecto de SU versión, sin tocar sus excepciones; promover no toca los módulos de nadie", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { modulos: ["analitica", "ranking"] }, ["quincenal", "mensual"]);
      const [quincenal, mensual] = p.orgs;
      // Excepción de la quincenal (SL-23): sin analítica, que el plan incluye.
      await tx.organizacionModulo.deleteMany({ where: { organizacionId: quincenal, modulo: "analitica" } });
      await p.programar("2026-11-16", { modulos: ["analitica", "monitoreo"] });
      // Por id y no por `created_at`: dentro de una transacción `now()` no avanza y el orden no separa el antes.
      const historialAntes = (
        await tx.historialAccion.findMany({ where: { organizacionId: { in: p.orgs } }, select: { id: true } })
      ).map((f) => f.id);
      await p.recibir(quincenal, a("2026-11-16", 1));
      const aMedias = { quincenal: await modulos(tx, quincenal), mensual: await modulos(tx, mensual) };
      // Otra excepción de la quincenal después de recibirlo: apaga monitoreo.
      await tx.organizacionModulo.deleteMany({ where: { organizacionId: quincenal, modulo: "monitoreo" } });
      await p.recibir(mensual, a("2026-12-01", 1));
      const filas = await tx.historialAccion.findMany({
        where: { organizacionId: { in: p.orgs }, id: { notIn: historialAntes } },
        select: { organizacionId: true, accion: true, valorNuevo: true },
      });
      return {
        quincenal,
        mensual,
        aMedias,
        final: { quincenal: await modulos(tx, quincenal), mensual: await modulos(tx, mensual) },
        plan: (await fotoDelPlan(tx, p.planId)).modulos,
        filas,
      };
    });
    // La quincenal: monitoreo entra, ranking sale, su analítica apagada sigue apagada; la mensual, intacta.
    expect(r.aMedias).toEqual({ quincenal: ["monitoreo"], mensual: ["analitica", "ranking"] });
    // Al promover (con la recepción de la mensual) la excepción de la quincenal se respeta.
    expect(r.final).toEqual({ quincenal: [], mensual: ["analitica", "monitoreo"] });
    expect(r.plan).toEqual(["analitica", "monitoreo"]);
    const de = (org: string) => r.filas.filter((f) => f.organizacionId === org).map((f) => [f.accion, f.valorNuevo]).sort();
    expect(de(r.quincenal)).toEqual([
      ["modulo_activado", "monitoreo"],
      ["modulo_desactivado", "ranking"],
    ]);
    expect(de(r.mensual)).toEqual([
      ["modulo_activado", "monitoreo"],
      ["modulo_desactivado", "ranking"],
    ]);
  });

  it("R6: al guardar avisa del tope ya pasado; al recibir se aplica igual, lo creado no se toca y las altas que pasan el tope se rechazan hasta que el uso baje", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { porRol: { admin: 5 }, apiKeys: null } }, ["quincenal"]);
      const [org] = p.orgs;
      await fijarEmpresa(tx, org);
      const admins = [];
      for (let i = 0; i < 3; i++) admins.push((await crearUsuarioDePrueba(tx, "admin")).id);
      const guardado = await p.programar("2026-11-16", { topes: { porRol: { admin: 1 }, apiKeys: null } });
      const recibido = await p.recibir(org, a("2026-11-16", 1));
      const activos = () => tx.usuario.count({ where: { organizacionId: org, estado: "activo", rol: { value: "admin" } } });
      const trasRecibir = await activos();
      const alta = async () => {
        await fijarEmpresa(tx, org);
        const error = await capturar(tx, () => crearUsuarioDePrueba(tx, "admin"));
        return error === null ? null : sqlstateDe(error);
      };
      const conTres = await alta();
      // Inactivar dos deja el uso en el tope (1): otra alta lo pasaría.
      await tx.usuario.updateMany({ where: { id: { in: admins.slice(0, 2) } }, data: { estado: "inactivo" } });
      const conUno = await alta();
      // Con el uso por debajo del tope, entra.
      await tx.usuario.update({ where: { id: admins[2] }, data: { estado: "inactivo" } });
      const conCero = await capturar(tx, async () => {
        await fijarEmpresa(tx, org);
        await crearUsuarioDePrueba(tx, "admin");
      });
      return { org, guardado, recibido, trasRecibir, conTres, conUno, conCero, final: await activos() };
    });
    expect(r.guardado).toMatchObject({
      estado: "ok",
      avisos: [{ organizacionId: r.org, tope: "admin", usados: 3, maximo: 1 }],
    });
    expect(r.recibido).toEqual({ estado: "aplicado" });
    expect(r.trasRecibir).toBe(3);
    expect(r.conTres).toBe("SL024");
    expect(r.conUno).toBe("SL024");
    expect(r.conCero).toBeNull();
    expect(r.final).toBe(1);
  });

  it("R13 (P6): «+10 000» con F = 16 y luego «+5 000 más» con F = 21: la quincenal recibe el primero el 16 y el final el 1 de diciembre; la mensual solo el final", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { precio: { tipo: "monto", mensual: "31000.00", descuentos: {} } }, ["quincenal", "mensual"]);
      const [quincenal, mensual] = p.orgs;
      await p.programar("2026-11-16", { precio: { tipo: "monto", mensual: "41000.00", descuentos: {} } });
      const primero = await p.pendiente();
      await p.recibir(quincenal, a("2026-11-16", 1));
      // Guardado el 20 con F = 21 (P9: un precio con fecha de hoy se aplica en el acto en esta rebanada).
      const reemplazo = await p.programar(
        "2026-11-21",
        { precio: { tipo: "monto", mensual: "46000.00", descuentos: {} } },
        new Date("2026-11-20T15:00:00.000Z"),
      );
      const final = await p.pendiente();
      const recepcionesFinal = await recepciones(tx, final);
      const propiaTrasReemplazo = await tx.planVersionEmpresa.findUnique({ where: { empresaId: quincenal }, select: { cambioId: true, version: true } });
      // La mensual nunca recibe el primero: su recepción del 1 de diciembre ya no existe.
      const delPrimero = (await trabajos(tx, "plan_aplicar_cambio", p.planId)).find(
        (t) => t.organizacionId === mensual && t.payload.cambioId === primero,
      );
      if (delPrimero === undefined) throw new Error("falta la recepción del primero de la mensual");
      await crearPlanAplicarCambioHandler(planesEnTx(tx), () => a("2026-12-01", 1))(delPrimero);
      const mensualTrasViejo = await tx.planVersionEmpresa.count({ where: { empresaId: mensual } });
      await p.recibir(quincenal, a("2026-12-01", 1));
      await p.recibir(mensual, a("2026-12-01", 2));
      return {
        quincenal,
        mensual,
        primero,
        reemplazo,
        recepcionesFinal,
        propiaTrasReemplazo,
        mensualTrasViejo,
        plan: await fotoDelPlan(tx, p.planId),
        pendientes: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
        precios: {
          quincenalDel16: await precioDelPeriodo(tx, p.planId, a("2026-11-16")),
          mensualDeNoviembre: await precioDelPeriodo(tx, p.planId, a("2026-11-01")),
          diciembre: await precioDelPeriodo(tx, p.planId, a("2026-12-01")),
        },
      };
    });
    expect(r.reemplazo).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2026-11-21" });
    expect(r.recepcionesFinal).toEqual({
      [r.quincenal]: ["2026-12-01T06:00:00.000Z", false],
      [r.mensual]: ["2026-12-01T06:00:00.000Z", false],
    });
    // Lo recibido no se deshace: la quincenal conserva el primero (su `cambio_id` no tiene FK) hasta el final.
    expect(r.propiaTrasReemplazo?.cambioId).toBe(r.primero);
    expect(Number((r.propiaTrasReemplazo?.version as { precio: { mensual: string } }).precio.mensual)).toBe(41000);
    expect(r.mensualTrasViejo).toBe(0);
    expect(r.plan.mensual).toBe("46000.00");
    expect(r.pendientes).toBe(0);
    // R3 por empresa: la quincena del 16 con el primero; noviembre de la mensual con el de antes; diciembre, el final.
    expect(r.precios).toEqual({ quincenalDel16: "41000.00", mensualDeNoviembre: "31000.00", diciembre: "46000.00" });
  });

  it("R14 (P1, P8): «Cancelar cambio» cancela si nadie lo recibió; si alguna lo recibió, o recibió uno que este reemplazó, se rechaza sin escribir nada", async () => {
    const r = await revertida(base, async (tx) => {
      const nadie = await preparar(tx, {}, ["quincenal", "mensual"]);
      await nadie.programar("2026-11-16", { nombre: "Nadie lo recibe" });
      const cancelado = await nadie.servicio.cancelarCambio(SUPERADMIN, { planId: nadie.planId });
      const trasCancelar = await fotoDelCambio(tx, nadie.planId);

      const alguna = await preparar(tx, {}, ["quincenal", "mensual"]);
      await alguna.programar("2026-11-16", { nombre: "Uno lo recibe" });
      await alguna.recibir(alguna.orgs[0], a("2026-11-16", 1));
      const antes = await fotoDelCambio(tx, alguna.planId);
      const conUna = await alguna.servicio.cancelarCambio(SUPERADMIN, { planId: alguna.planId });
      const trasConUna = await fotoDelCambio(tx, alguna.planId);
      // P8: un reemplazo que nadie recibió todavía, con el plan partido por el anterior.
      await alguna.programar("2026-11-20", { nombre: "Reemplazo" }, new Date("2026-11-17T15:00:00.000Z"));
      const antesP8 = await fotoDelCambio(tx, alguna.planId);
      const conPartido = await alguna.servicio.cancelarCambio(SUPERADMIN, { planId: alguna.planId });
      return { cancelado, trasCancelar, antes, conUna, trasConUna, antesP8, conPartido, despuesP8: await fotoDelCambio(tx, alguna.planId) };
    });
    expect(r.cancelado).toMatchObject({ estado: "ok" });
    expect(r.trasCancelar).toMatchObject({ pendiente: null, recepciones: {}, versiones: 0 });
    expect(r.conUna).toEqual({ estado: "cambio_a_medias" });
    expect(r.trasConUna).toEqual(r.antes);
    expect(r.antesP8.recepciones).not.toEqual(r.antes.recepciones);
    expect(Object.values(r.antesP8.recepciones).every(([, recibido]) => !recibido)).toBe(true);
    expect(r.conPartido).toEqual({ estado: "cambio_a_medias" });
    expect(r.despuesP8).toEqual(r.antesP8);
  });

  it("R15: archivar con el cambio a medias se rechaza sin escribir nada; un pendiente de un plan sin empresas se cancela al archivar", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      await p.programar("2026-11-16", { nombre: "A medias" });
      await p.recibir(p.orgs[0], a("2026-11-16", 1));
      const antes = await fotoDelCambio(tx, p.planId);
      const aMedias = await p.servicio.archivar(SUPERADMIN, { planId: p.planId });
      const despues = await fotoDelCambio(tx, p.planId);
      const archivadoAt = (await tx.plan.findUniqueOrThrow({ where: { id: p.planId }, select: { archivadoAt: true } })).archivadoAt;

      const vacio = await preparar(tx, {}, []);
      await vacio.programar("2026-11-16", { nombre: "Sin empresas" });
      const sinEmpresas = await vacio.servicio.archivar(SUPERADMIN, { planId: vacio.planId });
      return { aMedias, antes, despues, archivadoAt, sinEmpresas, pendienteVacio: await tx.planCambioProgramado.count({ where: { planId: vacio.planId } }) };
    });
    expect(r.aMedias).toEqual({ estado: "cambio_a_medias" });
    expect(r.despues).toEqual(r.antes);
    expect(r.archivadoAt).toBeNull();
    expect(r.sinEmpresas).toMatchObject({ estado: "ok", cambio: true });
    expect(r.pendienteVacio).toBe(0);
  });

  it("R16 (P7): «De inmediato» sigue como hoy sin el plan partido; con alguna empresa que ya lo recibió se rechaza sin escribir nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      await p.programar("2026-11-16", { nombre: "Programado" });
      const sinPartir = await p.programar(null, { nombre: "Inmediato" });
      const trasInmediato = await fotoDelCambio(tx, p.planId);
      await p.recibir(p.orgs[0], a("2026-11-16", 1));
      const antes = await fotoDelCambio(tx, p.planId);
      const partido = await p.programar(null, { nombre: "Otra vez inmediato" }, new Date("2026-11-17T15:00:00.000Z"));
      return { sinPartir, trasInmediato, antes, partido, despues: await fotoDelCambio(tx, p.planId) };
    });
    expect(r.sinPartir).toMatchObject({ estado: "ok", cambio: true });
    // SL-24 R15: a todas en el acto; el pendiente sigue.
    expect(r.trasInmediato.plan.nombre).toBe("Inmediato");
    expect(r.trasInmediato.pendiente).not.toBeNull();
    expect(r.partido).toEqual({ estado: "cambio_a_medias" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R17 (P4, P10 b): antes de F entra con la versión del plan y su recepción (recordatorios sin correo de guardado); en F o después, con la programada; los topes se miran contra ella", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, { topes: { porRol: { admin: 5 }, apiKeys: null }, modulos: ["ranking"] }, ["mensual"]);
      const [vieja] = p.orgs;
      await p.programar("2026-11-16", { nombre: "Entra la nueva", topes: { porRol: { admin: 1 }, apiKeys: null }, modulos: ["monitoreo"] });
      const cambio = await p.pendiente();
      // B entra el 28 de octubre (antes de F), quincenal: con la versión del plan y su recepción el 16.
      const { id: antesDeF } = await crearOrganizacion(tx);
      const asignadaAntes = await p.servicio.asignar(SUPERADMIN, { organizacionId: antesDeF, planId: p.planId, tipoCobro: "quincenal" });
      const deB = {
        modulos: await modulos(tx, antesDeF),
        version: await tx.planVersionEmpresa.count({ where: { empresaId: antesDeF } }),
        recordatorios: (await trabajos(tx, "plan_recordatorio_cambio", p.planId))
          .filter((t) => t.organizacionId === antesDeF)
          .map((t) => [t.payload.dias, t.runAfter.toISOString()]),
        guardados: (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((t) => t.organizacionId === antesDeF).length,
      };
      await p.recibir(antesDeF, a("2026-11-16", 1));
      // C entra el 20 de noviembre (después de F), mensual: con la versión programada, sin recepción.
      const el20 = new PlanesService(planesEnTx(tx), () => new Date("2026-11-20T15:00:00.000Z"));
      const { id: despuesDeF } = await crearOrganizacion(tx);
      const asignadaDespues = await el20.asignar(SUPERADMIN, { organizacionId: despuesDeF, planId: p.planId, tipoCobro: "mensual" });
      const deC = {
        modulos: await modulos(tx, despuesDeF),
        version: await tx.planVersionEmpresa.findUnique({ where: { empresaId: despuesDeF }, select: { cambioId: true, desdeAt: true, version: true } }),
      };
      // D entra el 20 con 2 admins: el plan permite 5, la versión programada 1 → se rechaza (SL-24 R12 contra ella).
      const { id: conAdmins } = await crearOrganizacion(tx);
      await fijarEmpresa(tx, conAdmins);
      for (let i = 0; i < 2; i++) await crearUsuarioDePrueba(tx, "admin");
      await fijarEmpresa(tx, "");
      const rechazada = await el20.asignar(SUPERADMIN, { organizacionId: conAdmins, planId: p.planId, tipoCobro: "mensual" });
      const planDeD = (await tx.organizacion.findUniqueOrThrow({ where: { id: conAdmins }, select: { planId: true } })).planId;
      const aMedias = { recepciones: await recepciones(tx, cambio), detalle: (await planesEnTx(tx).detalle(p.planId))?.pendiente };
      // La vieja (mensual) lo recibe el 1 de diciembre: la última; el plan pasa a la versión y C queda sin versión propia.
      await p.recibir(vieja, a("2026-12-01", 1));
      return {
        vieja,
        antesDeF,
        asignadaAntes,
        deB,
        asignadaDespues,
        deC,
        cambio,
        rechazada,
        planDeD,
        aMedias,
        versionesFinal: await tx.planVersionEmpresa.count({ where: { planId: p.planId } }),
        moduloDeC: await modulos(tx, despuesDeF),
        plan: await fotoDelPlan(tx, p.planId),
      };
    });
    expect(r.asignadaAntes).toMatchObject({ estado: "ok", cambio: true });
    expect(r.deB).toEqual({
      modulos: ["ranking"],
      version: 0,
      // Contados desde su entrada (el 28 de octubre, 19 días antes del 16): a 7 y a 1 día.
      recordatorios: [
        [1, "2026-11-15T06:00:00.000Z"],
        [7, "2026-11-09T06:00:00.000Z"],
      ],
      guardados: 0,
    });
    expect(r.asignadaDespues).toMatchObject({ estado: "ok", cambio: true });
    expect(r.deC.modulos).toEqual(["monitoreo"]);
    expect(r.deC.version).toMatchObject({ cambioId: r.cambio, desdeAt: a("2026-11-20"), version: { nombre: "Entra la nueva" } });
    expect(r.rechazada).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "admin", usados: 2, maximo: 1 }] });
    expect(r.planDeD).toBeNull();
    // C no tiene recepción: el «N de M» sigue con B y la vieja.
    expect(Object.keys(r.aMedias.recepciones).sort()).toEqual([r.vieja, r.antesDeF].sort());
    expect(r.aMedias.detalle).toMatchObject({ recibidas: 1, total: 2 });
    expect(r.versionesFinal).toBe(0);
    expect(r.moduloDeC).toEqual(["monitoreo"]);
    expect(r.plan).toMatchObject({ nombre: "Entra la nueva", porRol: [["admin", 1]], modulos: ["monitoreo"] });
  });

  it("R18: la última sin recibirlo deja el plan después de F: su recepción se borra, el plan se promueve en esa transacción y su trabajo ya encolado no hace nada", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["quincenal", "mensual"]);
      const [quincenal, mensual] = p.orgs;
      await p.programar("2026-11-16", { nombre: "Se va la última" });
      const cambio = await p.pendiente();
      const suTrabajo = (await trabajos(tx, "plan_aplicar_cambio", p.planId)).find((t) => t.organizacionId === mensual);
      if (suTrabajo === undefined) throw new Error("falta la recepción de la mensual");
      await p.recibir(quincenal, a("2026-11-16", 1));
      // La mensual cambia a otro plan el 20 (un cambio de empresa ya guardado), antes de su recepción del 1.
      const otro = await crearPlan(tx);
      const cambioDeEmpresa = await pendienteDeEmpresaPorSql(tx, mensual, otro, "mensual", a("2026-11-20"));
      const salio = await planesEnTx(tx).aplicarCambioDeEmpresa({ organizacionId: mensual, cambioId: cambioDeEmpresa }, a("2026-11-20", 1));
      const tras = {
        recepcion: await tx.planCambioRecepcion.count({ where: { empresaId: mensual } }),
        pendientes: await tx.planCambioProgramado.count({ where: { planId: p.planId } }),
        versiones: await tx.planVersionEmpresa.count({ where: { planId: p.planId } }),
        plan: (await fotoDelPlan(tx, p.planId)).nombre,
        aplicados: await tx.planRastro.count({ where: { planId: p.planId, accion: "cambio_aplicado" } }),
        planDeLaMensual: (await tx.organizacion.findUniqueOrThrow({ where: { id: mensual }, select: { planId: true } })).planId,
      };
      const modulosAntes = await modulos(tx, mensual);
      await crearPlanAplicarCambioHandler(planesEnTx(tx), () => a("2026-12-01", 1))(suTrabajo);
      return { cambio, otro, salio, tras, modulosAntes, modulosDespues: await modulos(tx, mensual) };
    });
    expect(r.salio).toEqual({ estado: "aplicado" });
    expect(r.tras).toEqual({
      recepcion: 0,
      pendientes: 0,
      versiones: 0,
      plan: "Se va la última",
      aplicados: 1,
      planDeLaMensual: r.otro,
    });
    expect(r.modulosDespues).toEqual(r.modulosAntes);
  });

  it("R19, R22: mensual → bimestral con efecto el 1 de enero y F = 5 de enero: su recepción pasa del 1 de febrero al 1 de marzo; lo encolado para la fecha vieja no hace nada; si el cambio de tipo rige el mismo instante, no se mueve", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, {}, ["mensual", "mensual"]);
      const [aBimestral, aQuincenal] = p.orgs;
      await p.programar("2027-01-05", { nombre: "Enero" });
      const cambio = await p.pendiente();
      const antes = await recepciones(tx, cambio);
      const viejos = {
        aplicar: (await trabajos(tx, "plan_aplicar_cambio", p.planId)).find((t) => t.organizacionId === aBimestral),
        recordatorio: (await trabajos(tx, "plan_recordatorio_cambio", p.planId)).find(
          (t) => t.organizacionId === aBimestral && t.payload.dias === 7,
        ),
      };
      if (viejos.aplicar === undefined || viejos.recordatorio === undefined) throw new Error("faltan los trabajos de la fecha vieja");
      // Mensual → bimestral con efecto el 1 de enero (guardado el 28 de octubre; lo aplica la cola el 1).
      const tipo = await p.servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: aBimestral, tipoCobro: "bimestral", vigenteDesde: "2027-01-01" });
      const pendienteDeTipo = async (organizacionId: string) =>
        (await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { planCambioId: true } })).planCambioId as string;
      const repo = planesEnTx(tx);
      const aplicado = await repo.aplicarCambioDeEmpresa({ organizacionId: aBimestral, cambioId: await pendienteDeTipo(aBimestral) }, a("2027-01-01", 1));
      const tras = await recepciones(tx, cambio);
      const nuevos = (await trabajos(tx, "plan_recordatorio_cambio", p.planId))
        .filter((t) => t.organizacionId === aBimestral && t.payload.recibeAt === "2027-03-01T06:00:00.000Z")
        .map((t) => [t.payload.dias, t.runAfter.toISOString()]);
      // Lo de la fecha vieja: la recepción el 1 de febrero aún no rige (es el 1 de marzo) y el recordatorio no avisa.
      await crearPlanAplicarCambioHandler(repo, () => a("2027-02-01", 1))(viejos.aplicar);
      await crearPlanRecordatorioCambioHandler(repo)(viejos.recordatorio);
      const avisosViejos = (await trabajos(tx, "plan_aviso_correo", p.planId)).filter((t) => String(t.payload.tipo).startsWith("recordatorio"));
      // La otra mensual → quincenal con efecto el 1 de febrero: el mismo instante que su recepción, que no se mueve.
      const tipoMismo = await p.servicio.cambiarTipoCobro(SUPERADMIN, { organizacionId: aQuincenal, tipoCobro: "quincenal", vigenteDesde: "2027-02-01" });
      await repo.aplicarCambioDeEmpresa({ organizacionId: aQuincenal, cambioId: await pendienteDeTipo(aQuincenal) }, a("2027-02-01", 0.5));
      return {
        aBimestral,
        aQuincenal,
        antes,
        tipo,
        aplicado,
        tras,
        nuevos,
        avisosViejos,
        tipoMismo,
        final: await recepciones(tx, cambio),
        tipos: await tx.organizacion.findMany({ where: { id: { in: p.orgs } }, select: { id: true, planTipoCobro: true } }),
      };
    });
    expect(r.antes).toEqual({
      [r.aBimestral]: ["2027-02-01T06:00:00.000Z", false],
      [r.aQuincenal]: ["2027-02-01T06:00:00.000Z", false],
    });
    expect(r.tipo).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2027-01-01" });
    expect(r.aplicado).toEqual({ estado: "aplicado" });
    expect(r.tras[r.aBimestral]).toEqual(["2027-03-01T06:00:00.000Z", false]);
    // Los recordatorios de la fecha nueva, contados desde que se aplica el cambio de tipo (59 días): a 7 y a 1.
    expect(r.nuevos.sort()).toEqual(
      [
        [1, "2027-02-28T06:00:00.000Z"],
        [7, "2027-02-22T06:00:00.000Z"],
      ].sort(),
    );
    expect(r.avisosViejos).toEqual([]);
    expect(r.tipoMismo).toMatchObject({ estado: "ok", cambio: true, vigenteDesde: "2027-02-01" });
    expect(r.final[r.aQuincenal]).toEqual(["2027-02-01T06:00:00.000Z", false]);
    expect(Object.fromEntries(r.tipos.map((t) => [t.id, t.planTipoCobro]))).toEqual({
      [r.aBimestral]: "bimestral",
      [r.aQuincenal]: "quincenal",
    });
  });
});
