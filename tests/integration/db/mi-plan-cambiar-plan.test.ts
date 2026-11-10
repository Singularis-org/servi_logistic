import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { EfectoElegido } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaDeEfectoPorDefecto, inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { cobroDelPlan, montoDelPeriodo } from "@/lib/planes/cobro";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import { TIPOS_COBRO, type CrearPlanInput, type PrecioPlan, type TipoCobro, type TopesPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, crearPlan, entradaAsignable, planesEnTx, revertida, superadminEnTx } from "./_fixtures/planes";
import { tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-99 · T2 (design §3; R2, R10–R17) — el maestro cambia el plan de SU empresa contra Postgres, con
// `PlanesRepository` REAL. Sus métodos abren su transacción como SAVEPOINT de la del caso, y la del caso SIEMPRE
// se revierte. El pendiente es el de SLT-86 (columnas `organizacion.plan_cambio_*` y su trabajo), así que aplicar
// es `aplicarCambioDeEmpresa` sin cambios.
//
// Relojes: los casos que necesitan un día concreto (el corte de cada tipo) pasan un `ahora` explícito al
// repositorio, que no lee el reloj de la base. Los que mezclan al superadmin (su servicio usa el reloj real)
// usan fechas relativas a hoy.
//
// LOCKS: el de superadmin (SL-32) desde el `beforeAll`: los planes los crea el superadmin; el de la 227 lo toma
// cada `revertida`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const UNA_HORA_MS = 60 * 60 * 1000;

/** La fecha de la plataforma de hoy ± `dias`. */
const dia = (dias: number) => fechaCalendarioCR(new Date(Date.now() + dias * UN_DIA_MS));

const MENSUAL_31000: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: {} };
/** Con descuentos por período, para que el costo del período nuevo no sea el mensual × n. */
const CON_DESCUENTOS: PrecioPlan = {
  tipo: "monto",
  mensual: "10000.00",
  descuentos: { bimestral: { tipo: "porcentaje", porcentaje: "5.00" }, anual: { tipo: "monto", monto: "12000.00" } },
};

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

interface Empresa {
  id: string;
  maestro: string;
}

interface Caso {
  superadmin: Actor;
  servicio: PlanesService;
  plan: (p?: { topes?: Partial<TopesPlan>; modulos?: CrearPlanInput["modulos"]; precio?: PrecioPlan }) => Promise<string>;
  /** Una empresa con su maestro y, si se pide, su primer plan con entrada el 3 de noviembre de 2026. */
  empresa: (primer?: { planId: string; tipo: TipoCobro }) => Promise<Empresa>;
}

function efectoInicio(fecha: string): EfectoElegido {
  return { clase: "inicio", fecha, desde: inicioDelDiaPlataforma(fecha), elegida: true };
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const id = await superadminEnTx(tx);
  const superadmin: Actor = { usuarioId: id, rol: "superadmin", organizacionId: null };
  const servicio = new PlanesService(planesEnTx(tx));
  return {
    superadmin,
    servicio,
    plan: async (p = {}) => {
      const r = await servicio.crear(
        superadmin,
        entradaAsignable({
          topes: { porRol: {}, apiKeys: null, ...p.topes },
          modulos: p.modulos ?? [],
          ...(p.precio === undefined ? {} : { precio: p.precio }),
        }),
      );
      if (r.estado !== "ok") throw new Error(`no se creó el plan: ${JSON.stringify(r)}`);
      return r.planId;
    },
    empresa: async (primer) => {
      const { id: org } = await crearOrganizacion(tx);
      await fijarEmpresa(tx, org);
      const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
      if (primer !== undefined) {
        const r = await planesEnTx(tx).asignar(
          org,
          primer.planId,
          id,
          efectoInicio("2026-11-03"),
          primer.tipo,
          new Date("2026-11-03T12:00:00.000Z"),
        );
        if (r.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(r)}`);
      }
      return { id: org, maestro };
    },
  };
}

const ACCIONES_DEL_PLAN = ["plan_asignado", "plan_tipo_cobro_cambiado", "plan_cambio_empresa_cancelado"] as const;

async function estado(tx: TxDeTest, organizacionId: string) {
  return {
    empresa: await tx.organizacion.findUniqueOrThrow({
      where: { id: organizacionId },
      select: {
        planId: true,
        planTipoCobro: true,
        planCicloAnclaAt: true,
        planCambioId: true,
        planCambioPlanId: true,
        planCambioTipoCobro: true,
        planCambioDesdeAt: true,
        planCambioActorId: true,
      },
    }),
    modulos: (await tx.organizacionModulo.findMany({ where: { organizacionId }, select: { modulo: true } }))
      .map((m) => m.modulo)
      .sort(),
    historial: (
      await tx.historialAccion.findMany({
        where: { organizacionId, accion: { in: [...ACCIONES_DEL_PLAN] } },
        select: { accion: true, entidadId: true, valorAnterior: true, valorNuevo: true, actorUsuarioId: true },
      })
    )
      .map((h) => JSON.stringify(h))
      .sort(),
    trabajos: (
      await tx.$queryRawUnsafe<{ dedupe_key: string; run_after: Date }[]>(
        `SELECT "dedupe_key", "run_after" FROM "jobs"
          WHERE "tipo" = 'plan_aplicar_cambio_empresa' AND "organizacion_id" = $1 ORDER BY "created_at", "id"`,
        organizacionId,
      )
    ).map((j) => j.dedupe_key),
  };
}

/** Aplica ESE pendiente (por su id), como lo haría su trabajo, con el reloj dado. */
function aplicar(tx: TxDeTest, organizacionId: string, cambioId: string, ahora: Date) {
  return planesEnTx(tx).aplicarCambioDeEmpresa({ organizacionId, cambioId }, ahora);
}

async function cambioIdDe(tx: TxDeTest, organizacionId: string): Promise<string | null> {
  return (await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { planCambioId: true } })).planCambioId;
}

/** Crea `n` usuarios de `rol` en la empresa; el error tal cual si un alta lo rechaza. */
async function usuarios(tx: TxDeTest, organizacionId: string, rol: "adminTienda" | "admin", n: number): Promise<unknown> {
  await fijarEmpresa(tx, organizacionId);
  return capturar(tx, async () => {
    for (let i = 0; i < n; i++) await crearUsuarioDePrueba(tx, rol);
  });
}

/** Crea `n` API keys activas por la vía real (`createConUsuario`). */
async function apiKeys(tx: TxDeTest, organizacionId: string, maestro: string, n: number): Promise<void> {
  await fijarEmpresa(tx, organizacionId);
  const repo = new ApiKeyRepository(clienteConSavepoint(tx));
  for (let i = 0; i < n; i++) {
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
    await repo.createConUsuario({
      identificador: `slt99 ${sufijo}`,
      slug: `slt99-${sufijo}`,
      email: `apikey-slt99-${sufijo}@example.test`,
      cedula: `apikey-slt99-${sufijo}`,
      passwordHash: "x",
      keyPrefix: `s99${sufijo.slice(0, 5)}`,
      keyHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      createdById: maestro,
      tiendaDestinoId: null,
    });
  }
}

/** Un `ahora` a mitad de noviembre de 2026: el corte es el 1 de diciembre (quincenal, mensual) o el 1 de enero. */
const MITAD_DE_NOVIEMBRE = new Date("2026-11-20T18:00:00.000Z");
const CORTE_ESPERADO: Record<TipoCobro, string> = {
  quincenal: "2026-12-01",
  mensual: "2026-12-01",
  bimestral: "2027-01-01",
  anual: "2027-01-01",
};

describeSiHayBase("SLT-99 — el maestro cambia el plan de su empresa (R2, R10–R17)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });

  afterAll(async () => {
    try {
      await soltarSuperadmin();
    } finally {
      await base?.$disconnect();
    }
  });

  it("R10, R11, R14: por cada tipo de cobro guarda el corte del tipo vigente, no toca nada hasta él, y al corte abre un período completo con su costo; sin dinero", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const actual = await c.plan({ precio: MENSUAL_31000, modulos: ["analitica"] });
      const nuevo = await c.plan({ precio: CON_DESCUENTOS, modulos: ["monitoreo"], topes: { porRol: { adminTienda: 1 } } });
      const filas = [];
      for (const tipo of TIPOS_COBRO) {
        const e = await c.empresa({ planId: actual, tipo });
        const contarDinero = async () => ({
          wallet: await tx.walletMovimiento.count({ where: { organizacionId: e.id } }),
          cobro: await tx.cobroPlataformaMovimiento.count({ where: { organizacionId: e.id } }),
        });
        const dineroAntes = await contarDinero();
        const antes = await estado(tx, e.id);
        const res = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, nuevo, e.maestro, MITAD_DE_NOVIEMBRE);
        const pendiente = await estado(tx, e.id);
        const cambioId = (await cambioIdDe(tx, e.id)) as string;
        // R14: un tope del plan nuevo que se pasa entre la petición y el corte no lo impide.
        const altas = await usuarios(tx, e.id, "adminTienda", 2);
        const corte = inicioDelDiaPlataforma(CORTE_ESPERADO[tipo]);
        const temprano = await aplicar(tx, e.id, cambioId, new Date(corte.getTime() - 1));
        const aplicado = await aplicar(tx, e.id, cambioId, corte);
        filas.push({ tipo, e, res, antes, pendiente, cambioId, altas, temprano, aplicado, despues: await estado(tx, e.id), dineroAntes, dineroDespues: await contarDinero() });
      }
      return { filas, nuevo };
    });
    for (const f of r.filas) {
      const corte = CORTE_ESPERADO[f.tipo];
      // R10: la misma fecha que da la función de SLT-86 con el tipo vigente.
      expect(fechaDeEfectoPorDefecto(f.tipo, MITAD_DE_NOVIEMBRE)).toBe(corte);
      expect(f.res, f.tipo).toEqual({ estado: "ok", vigenteDesde: corte });
      // R11: plan elegido, tipo vigente, fecha del corte y el maestro como actor; lo demás, como estaba.
      expect(f.pendiente.empresa).toEqual({
        ...f.antes.empresa,
        planCambioId: f.cambioId,
        planCambioPlanId: r.nuevo,
        planCambioTipoCobro: f.tipo,
        planCambioDesdeAt: inicioDelDiaPlataforma(corte),
        planCambioActorId: f.e.maestro,
      });
      expect(f.pendiente.modulos).toEqual(f.antes.modulos);
      expect(f.pendiente.historial).toEqual(f.antes.historial);
      expect(f.pendiente.trabajos).toEqual([`plan_cambio_empresa:${f.cambioId}`]);
      expect(f.altas).toBeNull();
      // Hasta las 00:00 del corte no rige.
      expect(f.temprano).toEqual({ estado: "aun_no_rige" });
      // R14: al corte, plan, tipo vigente, módulos y entrada nuevos, y `plan_asignado` firmado por el maestro.
      expect(f.aplicado).toEqual({ estado: "aplicado" });
      expect(f.despues.empresa).toEqual({
        planId: r.nuevo,
        planTipoCobro: f.tipo,
        planCicloAnclaAt: inicioDelDiaPlataforma(corte),
        planCambioId: null,
        planCambioPlanId: null,
        planCambioTipoCobro: null,
        planCambioDesdeAt: null,
        planCambioActorId: null,
      });
      expect(f.despues.modulos).toEqual(["monitoreo"]);
      expect(f.despues.historial).toEqual(
        [
          ...f.antes.historial,
          JSON.stringify({ accion: "plan_asignado", entidadId: r.nuevo, valorAnterior: null, valorNuevo: `${corte} · ${f.tipo}`, actorUsuarioId: f.e.maestro }),
        ].sort(),
      );
      // R14: el período que abre el corte es completo (sin tramo) y cuesta el período entero del plan nuevo.
      const entrada = f.despues.empresa.planCicloAnclaAt as Date;
      const cobro = cobroDelPlan(CON_DESCUENTOS, f.tipo, entrada, new Date(entrada.getTime() + UNA_HORA_MS), null);
      expect(cobro.periodo.desde, f.tipo).toBe(corte);
      expect(cobro.periodo.esTramo, f.tipo).toBe(false);
      expect(cobro.costo, f.tipo).toBe(montoDelPeriodo(CON_DESCUENTOS, f.tipo));
      // R11 (SLT-86 R14): sin dinero.
      expect(f.dineroDespues).toEqual(f.dineroAntes);
    }
  });

  it("R12: archivado, custom propio, custom ajeno, sin costo, versión programada sin costo y uno que no existe → no_disponible sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const actual = await c.plan();
      const e = await c.empresa({ planId: actual, tipo: "mensual" });
      const otra = await c.empresa();
      const archivado = await c.plan();
      const archivar = await c.servicio.archivar(c.superadmin, { planId: archivado });
      if (archivar.estado !== "ok") throw new Error(`no se archivó: ${JSON.stringify(archivar)}`);
      // Los custom y el sin costo, como dueño; los custom con costo concreto para que solo los rechace ser custom.
      const conCosto = { precioMensual: "1000.00", costoPorOrden: "100.00" };
      const customPropio = await crearPlan(tx, { custom: e.id });
      const customAjeno = await crearPlan(tx, { custom: otra.id });
      for (const id of [customPropio, customAjeno]) await tx.plan.update({ where: { id }, data: conCosto });
      const sinCosto = await crearPlan(tx);
      // Público con costo concreto, pero su versión programada (que puede regir antes del corte) no lo tiene.
      const conVersionSinCosto = await c.plan();
      await tx.planCambioProgramado.create({
        data: {
          planId: conVersionSinCosto,
          vigenteDesde: new Date("2026-11-25T06:00:00.000Z"),
          version: {
            nombre: "slt99 sin costo",
            topes: { porRol: {}, apiKeys: null },
            modulos: [],
            precio: { tipo: "sin_precio" },
            costoPorOrden: null,
            costoPorOrdenPorcentual: null,
          },
          avisosAlProgramar: [],
          actorUsuarioId: c.superadmin.usuarioId,
          actorNombre: "Superadmin",
        },
      });
      const antes = await estado(tx, e.id);
      const res: Record<string, unknown> = {};
      const pedidos = { archivado, customPropio, customAjeno, sinCosto, conVersionSinCosto, inexistente: randomUUID() };
      for (const [nombre, planId] of Object.entries(pedidos)) {
        res[nombre] = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, planId, e.maestro, MITAD_DE_NOVIEMBRE);
      }
      return { res, antes, despues: await estado(tx, e.id) };
    });
    for (const [nombre, x] of Object.entries(r.res)) expect(x, nombre).toEqual({ estado: "no_disponible" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R13: un solo rol pasado rechaza aunque la suma de «Usuarios» quepa, y también las API keys; con fecha futura y sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const actual = await c.plan();
      // «Usuarios» = 2 + 10 = 12 y la empresa tiene 3 usuarios con tope: la suma cabe, el rol no.
      const porRol = await c.plan({ topes: { porRol: { adminTienda: 2, admin: 10 } } });
      const porKeys = await c.plan({ topes: { apiKeys: 1 } });
      const e = await c.empresa({ planId: actual, tipo: "mensual" });
      const altas = await usuarios(tx, e.id, "adminTienda", 3);
      await apiKeys(tx, e.id, e.maestro, 2);
      const antes = await estado(tx, e.id);
      const rol = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, porRol, e.maestro, MITAD_DE_NOVIEMBRE);
      const keys = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, porKeys, e.maestro, MITAD_DE_NOVIEMBRE);
      return { altas, rol, keys, antes, despues: await estado(tx, e.id), e };
    });
    expect(r.altas).toBeNull();
    expect(r.rol).toEqual({
      estado: "tope_excedido",
      excedidos: [expect.objectContaining({ organizacionId: r.e.id, tope: "adminTienda", usados: 3, maximo: 2 })],
    });
    expect(r.keys).toEqual({
      estado: "tope_excedido",
      excedidos: [expect.objectContaining({ organizacionId: r.e.id, tope: "api_keys", usados: 2, maximo: 1 })],
    });
    expect(r.despues).toEqual(r.antes);
  });

  it("R15: otro plan reemplaza el pendiente sin historial (el trabajo viejo no aplica nada); su plan activo lo cancela con su fila", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, b, d] = [await c.plan(), await c.plan(), await c.plan()];
      const e = await c.empresa({ planId: actual, tipo: "quincenal" });
      const antes = await estado(tx, e.id);
      const aB = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, b, e.maestro, MITAD_DE_NOVIEMBRE);
      const viejo = (await cambioIdDe(tx, e.id)) as string;
      const aD = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, d, e.maestro, MITAD_DE_NOVIEMBRE);
      const reemplazado = await estado(tx, e.id);
      const trabajoViejo = await aplicar(tx, e.id, viejo, inicioDelDiaPlataforma("2026-12-01"));
      const trasViejo = await estado(tx, e.id);
      const alActivo = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, actual, e.maestro, MITAD_DE_NOVIEMBRE);
      const cancelado = await estado(tx, e.id);
      const otraVez = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, actual, e.maestro, MITAD_DE_NOVIEMBRE);
      return { aB, aD, viejo, antes, reemplazado, trabajoViejo, trasViejo, alActivo, cancelado, otraVez, final: await estado(tx, e.id), e, d };
    });
    expect(r.aB).toEqual({ estado: "ok", vigenteDesde: "2026-12-01" });
    expect(r.aD).toEqual({ estado: "ok", vigenteDesde: "2026-12-01" });
    expect(r.reemplazado.empresa.planCambioPlanId).toBe(r.d);
    expect(r.reemplazado.empresa.planCambioId).not.toBe(r.viejo);
    expect(r.reemplazado.historial).toEqual(r.antes.historial);
    expect(r.trabajoViejo).toEqual({ estado: "sin_pendiente" });
    expect(r.trasViejo).toEqual(r.reemplazado);
    expect(r.alActivo).toEqual({ estado: "ok", vigenteDesde: null });
    expect({ ...r.cancelado.empresa }).toEqual({ ...r.antes.empresa });
    expect(r.cancelado.historial).toEqual(
      [
        ...r.antes.historial,
        JSON.stringify({ accion: "plan_cambio_empresa_cancelado", entidadId: r.d, valorAnterior: null, valorNuevo: "2026-12-01 · quincenal", actorUsuarioId: r.e.maestro }),
      ].sort(),
    );
    // Sin pendiente, pedir su plan activo no escribe nada.
    expect(r.otraVez).toEqual({ estado: "ok", vigenteDesde: null });
    expect(r.final).toEqual(r.cancelado);
  });

  it("R16: «Cancelar cambio» quita el pendiente con la fila firmada por el maestro; sin pendiente, sin_cambio_programado sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, b] = [await c.plan(), await c.plan()];
      const e = await c.empresa({ planId: actual, tipo: "mensual" });
      const antes = await estado(tx, e.id);
      await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, b, e.maestro, MITAD_DE_NOVIEMBRE);
      const cancelar = await planesEnTx(tx).cancelarCambioPorLaEmpresa(e.id, e.maestro);
      const despues = await estado(tx, e.id);
      const otraVez = await planesEnTx(tx).cancelarCambioPorLaEmpresa(e.id, e.maestro);
      return { antes, cancelar, despues, otraVez, final: await estado(tx, e.id), e, b };
    });
    expect(r.cancelar).toEqual({ estado: "ok" });
    expect(r.despues.empresa).toEqual(r.antes.empresa);
    expect(r.despues.historial).toEqual(
      [
        ...r.antes.historial,
        JSON.stringify({ accion: "plan_cambio_empresa_cancelado", entidadId: r.b, valorAnterior: null, valorNuevo: "2026-12-01 · mensual", actorUsuarioId: r.e.maestro }),
      ].sort(),
    );
    expect(r.otraVez).toEqual({ estado: "sin_cambio_programado" });
    expect(r.final).toEqual(r.despues);
  });

  it("R17 (P3): el pendiente del superadmin con otro tipo de cobro → el maestro lo reemplaza con el tipo vigente y su corte; en otra empresa, lo cancela con su firma", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, delSuper, delMaestro] = [await c.plan(), await c.plan(), await c.plan()];
      const ahora = new Date();
      const [a, b] = [await c.empresa(), await c.empresa()];
      for (const e of [a, b]) {
        const primero = await c.servicio.asignar(c.superadmin, { organizacionId: e.id, planId: actual, tipoCobro: "mensual", inicioCiclo: dia(-3) });
        if (primero.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(primero)}`);
        const pendiente = await c.servicio.asignar(c.superadmin, { organizacionId: e.id, planId: delSuper, tipoCobro: "anual", vigenteDesde: dia(5) });
        if (pendiente.estado !== "ok" || pendiente.vigenteDesde === null) throw new Error(`no quedó pendiente: ${JSON.stringify(pendiente)}`);
      }
      const delSuperA = await estado(tx, a.id);
      const reemplazo = await planesEnTx(tx).cambiarPlanPorLaEmpresa(a.id, delMaestro, a.maestro, ahora);
      const reemplazadoA = await estado(tx, a.id);
      const antesB = await estado(tx, b.id);
      const cancelar = await planesEnTx(tx).cancelarCambioPorLaEmpresa(b.id, b.maestro);
      return { ahora, delSuperA, reemplazo, reemplazadoA, antesB, cancelar, despuesB: await estado(tx, b.id), a, b, delSuper, delMaestro, fechaSuper: dia(5) };
    });
    const corte = fechaDeEfectoPorDefecto("mensual", r.ahora);
    expect(r.delSuperA.empresa.planCambioTipoCobro).toBe("anual");
    expect(r.reemplazo).toEqual({ estado: "ok", vigenteDesde: corte });
    expect(r.reemplazadoA.empresa).toEqual({
      ...r.delSuperA.empresa,
      planCambioId: expect.any(String),
      planCambioPlanId: r.delMaestro,
      planCambioTipoCobro: "mensual",
      planCambioDesdeAt: inicioDelDiaPlataforma(corte),
      planCambioActorId: r.a.maestro,
    });
    expect(r.reemplazadoA.empresa.planCambioId).not.toBe(r.delSuperA.empresa.planCambioId);
    // SLT-86 R19: reemplazar no escribe historial.
    expect(r.reemplazadoA.historial).toEqual(r.delSuperA.historial);
    expect(r.cancelar).toEqual({ estado: "ok" });
    expect(r.despuesB.empresa.planCambioId).toBeNull();
    expect(r.despuesB.historial).toEqual(
      [
        ...r.antesB.historial,
        JSON.stringify({ accion: "plan_cambio_empresa_cancelado", entidadId: r.delSuper, valorAnterior: null, valorNuevo: `${r.fechaSuper} · anual`, actorUsuarioId: r.b.maestro }),
      ].sort(),
    );
  });

  it("R2: el cambio y la cancelación del maestro de A no tocan nada de B (columnas plan_cambio_*, historial ni trabajos)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, otro] = [await c.plan(), await c.plan()];
      const a = await c.empresa({ planId: actual, tipo: "mensual" });
      const b = await c.empresa({ planId: actual, tipo: "mensual" });
      // B con su propio pendiente, para que un error de empresa se note también al cancelar.
      await planesEnTx(tx).cambiarPlanPorLaEmpresa(b.id, otro, b.maestro, MITAD_DE_NOVIEMBRE);
      const antesB = await estado(tx, b.id);
      const cambio = await planesEnTx(tx).cambiarPlanPorLaEmpresa(a.id, otro, a.maestro, MITAD_DE_NOVIEMBRE);
      const enMedioB = await estado(tx, b.id);
      const cancelar = await planesEnTx(tx).cancelarCambioPorLaEmpresa(a.id, a.maestro);
      return { cambio, cancelar, antesB, enMedioB, despuesB: await estado(tx, b.id), a: await estado(tx, a.id) };
    });
    expect(r.cambio).toEqual({ estado: "ok", vigenteDesde: "2026-12-01" });
    expect(r.cancelar).toEqual({ estado: "ok" });
    expect(r.a.empresa.planCambioId).toBeNull();
    expect(r.antesB.empresa.planCambioId).not.toBeNull();
    expect(r.enMedioB).toEqual(r.antesB);
    expect(r.despuesB).toEqual(r.antesB);
  });

  it("R18: una empresa sin plan → sin_plan sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const e = await c.empresa();
      const antes = await estado(tx, e.id);
      const res = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, plan, e.maestro, MITAD_DE_NOVIEMBRE);
      return { antes, res, despues: await estado(tx, e.id) };
    });
    expect(r.res).toEqual({ estado: "sin_plan" });
    expect(r.despues).toEqual(r.antes);
  });

  it("R18 (P5, decisión 2026-11-10): sin plan, el maestro no cancela la primera asignación pendiente → sin_plan sin escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await c.plan();
      const e = await c.empresa();
      const primera = await c.servicio.asignar(c.superadmin, { organizacionId: e.id, planId: plan, tipoCobro: "mensual", vigenteDesde: dia(5) });
      if (primera.estado !== "ok" || primera.vigenteDesde === null) throw new Error(`no quedó pendiente: ${JSON.stringify(primera)}`);
      const antes = await estado(tx, e.id);
      const res = await planesEnTx(tx).cancelarCambioPorLaEmpresa(e.id, e.maestro);
      return { antes, res, despues: await estado(tx, e.id), plan };
    });
    // La primera asignación vive en las columnas del pendiente (SLT-86), sin plan activo.
    expect(r.antes.empresa.planId).toBeNull();
    expect(r.antes.empresa.planCambioPlanId).toBe(r.plan);
    expect(r.res).toEqual({ estado: "sin_plan" });
    // Columnas, historial y trabajos intactos.
    expect(r.despues).toEqual(r.antes);
  });

  it("m1 (decisión 2026-11-10): con un pendiente, elegir su plan activo custom lo cancela como «Cancelar cambio»", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const otro = await c.plan();
      const e = await c.empresa();
      // Custom propio con costo, asignado: no está disponible en el carrusel, pero es su plan activo.
      const custom = await crearPlan(tx, { custom: e.id });
      await tx.plan.update({ where: { id: custom }, data: { precioMensual: "1000.00", costoPorOrden: "100.00" } });
      const asignado = await planesEnTx(tx).asignar(e.id, custom, c.superadmin.usuarioId, efectoInicio("2026-11-03"), "mensual", new Date("2026-11-03T12:00:00.000Z"));
      if (asignado.estado !== "ok") throw new Error(`no se asignó: ${JSON.stringify(asignado)}`);
      const antes = await estado(tx, e.id);
      await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, otro, e.maestro, MITAD_DE_NOVIEMBRE);
      const alActivo = await planesEnTx(tx).cambiarPlanPorLaEmpresa(e.id, custom, e.maestro, MITAD_DE_NOVIEMBRE);
      return { antes, alActivo, despues: await estado(tx, e.id), e, otro };
    });
    expect(r.alActivo).toEqual({ estado: "ok", vigenteDesde: null });
    expect(r.despues.empresa).toEqual(r.antes.empresa);
    expect(r.despues.historial).toEqual(
      [
        ...r.antes.historial,
        JSON.stringify({ accion: "plan_cambio_empresa_cancelado", entidadId: r.otro, valorAnterior: null, valorNuevo: "2026-12-01 · mensual", actorUsuarioId: r.e.maestro }),
      ].sort(),
    );
  });

  it("empresaParaElMaestro: plan, si es custom, el tipo vigente y si hay pendiente (de quien sea)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const [actual, otro] = [await c.plan(), await c.plan()];
      const sinPlan = await c.empresa();
      const conPlan = await c.empresa({ planId: actual, tipo: "bimestral" });
      const leidaSinPlan = await planesEnTx(tx).empresaParaElMaestro(sinPlan.id);
      const sinPendiente = await planesEnTx(tx).empresaParaElMaestro(conPlan.id);
      await planesEnTx(tx).cambiarPlanPorLaEmpresa(conPlan.id, otro, conPlan.maestro, MITAD_DE_NOVIEMBRE);
      const conPendiente = await planesEnTx(tx).empresaParaElMaestro(conPlan.id);
      return { leidaSinPlan, sinPendiente, conPendiente, actual };
    });
    expect(r.leidaSinPlan).toEqual({ planId: null, planEsCustom: false, tipoCobro: "mensual", hayPendiente: false });
    expect(r.sinPendiente).toEqual({ planId: r.actual, planEsCustom: false, tipoCobro: "bimestral", hayPendiente: false });
    expect(r.conPendiente).toEqual({ planId: r.actual, planEsCustom: false, tipoCobro: "bimestral", hayPendiente: true });
  });
});
