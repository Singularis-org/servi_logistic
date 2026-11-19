import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";
import { PlanesService } from "@/lib/services/PlanesService";
import type { TipoCobro, TopeExcedido, TopesPlan } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { entradaAsignable, planesEnTx, revertida } from "./_fixtures/planes";

// SLT-144 · T1.3 (design §3.1; R21) — la vista previa del cambio contra Postgres, con `PlanesService` y
// `PlanesRepository` reales. Lo que enseña «Cuándo rige» tiene que ser lo que programar el cambio escribe en
// `plan_cambio_recepcion.recibe_at` y devuelve en `avisos`, y leerla no escribe nada. Todo en una transacción del
// dueño que se revierte; el repositorio abre las suyas como SAVEPOINT. El reloj va fijo en el 28 de octubre de 2026.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");
const TOPES_NUEVOS: TopesPlan = { porRol: { admin: 1 }, apiKeys: null };

let base: PrismaClient;

/**
 * Un plan con tope de 5 admins y una empresa por cada tipo de `tipos`. La primera tiene 2 admins: con los topes
 * nuevos (1 admin) los pasa. `programar` edita con fecha y los topes nuevos, como el formulario al confirmar.
 */
async function preparar(tx: TxDeTest, tipos: readonly TipoCobro[]) {
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const entrada = entradaAsignable({ topes: { porRol: { admin: 5 }, apiKeys: null } });
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`crear: ${JSON.stringify(creado)}`);
  const planId = creado.planId;
  const orgs: string[] = [];
  for (const [i, tipoCobro] of tipos.entries()) {
    const { id } = await crearOrganizacion(tx, { nombre: `SLT144 ${i} ${tipoCobro} ${randomUUID().slice(0, 6)}` });
    if (i === 0) {
      await fijarEmpresa(tx, id);
      for (let n = 0; n < 2; n++) await crearUsuarioDePrueba(tx, "admin");
    }
    await fijarEmpresa(tx, "");
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId, tipoCobro });
    if (r.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(r)}`);
    orgs.push(id);
  }
  await fijarEmpresa(tx, "");
  const previsualizar = (vigenteDesde: string | null, topes: TopesPlan = TOPES_NUEVOS) =>
    servicio.previsualizarCambio(SUPERADMIN, { planId, vigenteDesde, topes });
  const programar = async (vigenteDesde: string, nombre: string) => {
    await fijarEmpresa(tx, "");
    return servicio.editar(SUPERADMIN, {
      planId,
      nombre,
      topes: TOPES_NUEVOS,
      modulos: entrada.modulos,
      precio: entrada.precio,
      costoPorOrden: entrada.costoPorOrden,
      costoPorOrdenPorcentual: null,
      vigenteDesde,
    });
  };
  return { planId, orgs, previsualizar, programar };
}

/** Los avisos ordenados por empresa y tope: la vista previa va por nombre y programar por id. */
const ordenados = (avisos: readonly TopeExcedido[]) =>
  [...avisos].sort((x, y) => x.organizacionId.localeCompare(y.organizacionId) || x.tope.localeCompare(y.tope));

/** Lo que leer no debe mover: el pendiente, sus recepciones y la cola, enteros. */
async function foto(tx: TxDeTest) {
  const [jobs] = await tx.$queryRaw<{ n: bigint; max: Date | null }[]>`SELECT count(*) AS n, max("updated_at") AS max FROM "jobs"`;
  return {
    pendientes: await tx.planCambioProgramado.findMany({ orderBy: { id: "asc" }, select: { id: true, vigenteDesde: true, version: true } }),
    recepciones: await tx.planCambioRecepcion.findMany({
      orderBy: [{ cambioId: "asc" }, { empresaId: "asc" }],
      select: { cambioId: true, empresaId: true, recibeAt: true, recibidoAt: true, noAplicadaAt: true },
    }),
    jobs: { n: Number(jobs.n), max: jobs.max?.toISOString() ?? null },
  };
}

describeSiHayBase("SLT-144 — la fecha de cada empresa antes de programar el cambio", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R21: misma fecha y mismos avisos que programar", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, ["quincenal", "mensual", "bimestral", "anual"]);
      const vista = await p.previsualizar("2026-11-20");
      const programado = await p.programar("2026-11-20", "Con la vista previa");
      const cambio = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: p.planId }, select: { id: true } });
      const recepciones = await tx.planCambioRecepcion.findMany({ where: { cambioId: cambio.id }, select: { empresaId: true, recibeAt: true } });
      const nombres = await tx.organizacion.findMany({ where: { id: { in: p.orgs } }, select: { id: true, nombre: true } });
      return { orgs: p.orgs, vista, programado, recepciones, nombres };
    });
    if (r.vista.estado !== "ok") throw new Error(JSON.stringify(r.vista));
    if (r.programado.estado !== "ok") throw new Error(JSON.stringify(r.programado));

    // Las empresas que hoy tienen el plan, por nombre, con su tipo.
    const porNombre = [...r.nombres].sort((x, y) => x.nombre.localeCompare(y.nombre)).map((e) => e.id);
    expect(r.vista.empresas.map((e) => e.empresaId)).toEqual(porNombre);
    expect(r.vista.empresas.map((e) => e.tipoCobro)).toEqual(["quincenal", "mensual", "bimestral", "anual"]);

    // La fecha de cada una es el día de su `recibe_at` al programar con la misma F.
    const escrita = Object.fromEntries(r.recepciones.map((x) => [x.empresaId, fechaCalendarioPlataforma(x.recibeAt)]));
    expect(Object.fromEntries(r.vista.empresas.map((e) => [e.empresaId, e.recibeEl]))).toEqual(escrita);
    expect(r.vista.empresas.map((e) => e.recibeEl)).toEqual(["2026-12-01", "2026-12-01", "2027-01-01", "2027-01-01"]);

    // Los mismos avisos que el `ok` de programar: la primera pasa el tope de admins.
    expect(ordenados(r.vista.avisos)).toEqual(ordenados(r.programado.avisos));
    expect(r.vista.avisos).toEqual([expect.objectContaining({ organizacionId: r.orgs[0], tope: "admin", usados: 2, maximo: 1 })]);
  });

  it("R21: leer no escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, ["quincenal", "mensual"]);
      // Con un pendiente ya programado, para que haya recepciones y trabajos que se pudieran tocar.
      const ya = await p.programar("2026-11-16", "Ya programado");
      const antes = await foto(tx);
      const vistas = [
        await p.previsualizar("2026-12-01"),
        await p.previsualizar(null),
        await p.previsualizar("2026-11-20", { porRol: {}, apiKeys: 0 }),
      ];
      const despues = await foto(tx);
      return { ya, antes, despues, vistas, recepciones: antes.recepciones.length };
    });
    expect(r.ya).toMatchObject({ estado: "ok", cambio: true });
    expect(r.recepciones).toBeGreaterThan(0);
    // SLT-135 (R13): sin F es validation_error, y tampoco escribe.
    expect(r.vistas.map((v) => v.estado)).toEqual(["ok", "validation_error", "ok"]);
    expect(r.despues).toEqual(r.antes);
  });

  it("R21: un plan que no existe es not_found y uno sin empresas, una lista vacía", async () => {
    const r = await revertida(base, async (tx) => {
      const p = await preparar(tx, []);
      return {
        inexistente: await new PlanesService(planesEnTx(tx), () => AHORA).previsualizarCambio(SUPERADMIN, {
          planId: randomUUID(),
          vigenteDesde: "2026-11-16",
          topes: TOPES_NUEVOS,
        }),
        sinEmpresas: await p.previsualizar("2026-11-16"),
      };
    });
    expect(r.inexistente).toEqual({ estado: "not_found" });
    expect(r.sinEmpresas).toEqual({ estado: "ok", empresas: [], avisos: [] });
  });
});
