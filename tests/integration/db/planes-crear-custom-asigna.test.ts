import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelCicloPorDefecto, inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CrearPlanInput, TipoCobro } from "@/lib/types/planes";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaAsignable, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// Ajuste planes-custom (D2, D4, D6; 2026-10-31) — crear un custom con empresa lo crea Y lo asigna en UNA
// transacción, contra Postgres, con `PlanesService` y `PlanesRepository` REALES (el repositorio abre su
// transacción como SAVEPOINT de la del caso, que siempre se revierte).
//
// D2: si la asignación se rechaza (tope, R31 bajo cerrojo, el historial que falla), NO queda nada: ni la
// fila de `plan`, ni su `creado` de `plan_rastro`, ni la asignación, ni el historial. Si sale bien, la
// empresa queda con `plan_id`, ancla, tipo de cobro y su fila `plan_asignado`.
// D6: el tipo de cobro se guarda en `organizacion.plan_tipo_cobro` en cada asignación y queda en el
// `valor_nuevo` de `plan_asignado`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };

let base: PrismaClient;

function custom(organizacionId: string, extra: Partial<CrearPlanInput> = {}): CrearPlanInput {
  return entradaAsignable({
    nombre: `custom ${randomUUID().slice(0, 8)}`,
    visibilidad: "custom",
    organizacionId,
    tipoCobro: "mensual",
    ...extra,
  });
}

async function empresa(tx: TxDeTest, organizacionId: string) {
  return tx.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { planId: true, planTipoCobro: true, planCicloAnclaAt: true, planCicloCortoDesdeAt: true },
  });
}

/** Todo lo que crear y asignar pueden escribir: si un rechazo deja algo, aquí se ve. */
async function rastroDe(tx: TxDeTest, organizacionId: string, nombre: string) {
  return {
    planes: await tx.plan.count({ where: { nombre } }),
    rastro: await tx.planRastro.count({ where: { planNombre: nombre } }),
    empresa: await empresa(tx, organizacionId),
    historial: await tx.historialAccion.count({ where: { organizacionId } }),
  };
}

async function asignaciones(tx: TxDeTest, organizacionId: string) {
  return tx.historialAccion.findMany({
    where: { organizacionId, accion: "plan_asignado" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { entidadId: true, valorNuevo: true },
  });
}

describeSiHayBase("Ajuste planes-custom — crear un custom con empresa lo asigna en la misma transacción (D2, D4, D6)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("D2, D6: empresa sin plan → el custom queda creado, asignado con su tipo de cobro, con rastro e historial", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const entrada = custom(org, { tipoCobro: "anual" });
      // D8: el cobro es solo informativo; crear y asignar no mueve dinero.
      const dinero = async () => ({ wallet: await tx.walletMovimiento.count(), cobro: await tx.cobroPlataformaMovimiento.count() });
      const dineroAntes = await dinero();
      const res = await new PlanesService(planesEnTx(tx)).crear(SUPERADMIN, entrada);
      const planId = res.estado === "ok" ? res.planId : "";
      return {
        res,
        dineroAntes,
        dineroDespues: await dinero(),
        planId,
        plan: await tx.plan.findUnique({ where: { id: planId }, select: { visibilidad: true, organizacionExclusivaId: true } }),
        rastro: await tx.planRastro.findMany({ where: { planId }, select: { accion: true } }),
        empresa: await empresa(tx, org),
        asignaciones: await asignaciones(tx, org),
        org,
      };
    });
    expect(r.res).toEqual({ estado: "ok", planId: expect.any(String), cambio: true, avisos: [], vigenteDesde: null });
    expect(r.plan).toEqual({ visibilidad: "custom", organizacionExclusivaId: r.org });
    expect(r.rastro).toEqual([{ accion: "creado" }]);
    // La lista de empresas ya no dice «Sin plan»: `organizacion.plan_id` es el custom recién creado.
    expect(r.empresa.planId).toBe(r.planId);
    expect(r.empresa.planTipoCobro).toBe("anual");
    expect(r.empresa.planCicloAnclaAt).not.toBeNull();
    expect(r.empresa.planCicloCortoDesdeAt).toBeNull();
    expect(r.asignaciones).toEqual([{ entidadId: r.planId, valorNuevo: "anual" }]);
    expect(r.dineroDespues).toEqual(r.dineroAntes);
  });

  it("D4, D5: con el inicio del ciclo por defecto (mañana), el ancla es esa fecha y hay ciclo corto hasta ella", async () => {
    const manana = inicioDelCicloPorDefecto(new Date());
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const res = await new PlanesService(planesEnTx(tx)).crear(SUPERADMIN, custom(org, { inicioCiclo: manana }));
      return { res, empresa: await empresa(tx, org), asignaciones: await asignaciones(tx, org) };
    });
    expect(r.res.estado).toBe("ok");
    expect(r.empresa.planCicloAnclaAt?.toISOString()).toBe(inicioDelDiaPlataforma(manana).toISOString());
    expect(r.empresa.planCicloCortoDesdeAt).not.toBeNull();
    expect(r.empresa.planTipoCobro).toBe("mensual");
    expect(r.asignaciones.map((a) => a.valorNuevo)).toEqual([`${manana} · mensual`]);
  });

  it("D2, SL-24 R12: la empresa ya pasa un tope del custom → tope_excedido y no se crea NADA", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const org = (await crearOrganizacion(tx)).id;
      const grande = await servicio.crear(SUPERADMIN, entradaAsignable({ topes: { ordenesPorCiclo: null, porRol: { adminTienda: 10 }, apiKeys: null } }));
      if (grande.estado !== "ok") throw new Error(grande.estado);
      await servicio.asignar(SUPERADMIN, { organizacionId: org, planId: grande.planId, tipoCobro: "anual" });
      await fijarEmpresa(tx, org);
      for (let i = 0; i < 3; i++) await crearUsuarioDePrueba(tx, "adminTienda");
      await fijarEmpresa(tx, "");

      const entrada = custom(org, { topes: { ordenesPorCiclo: null, porRol: { adminTienda: 2 }, apiKeys: null } });
      const antes = await rastroDe(tx, org, entrada.nombre);
      const rechazo = await servicio.crear(SUPERADMIN, entrada);
      return { rechazo, antes, despues: await rastroDe(tx, org, entrada.nombre), grande: grande.planId };
    });
    expect(r.rechazo).toMatchObject({ estado: "tope_excedido", excedidos: [{ tope: "adminTienda", usados: 3, maximo: 2 }] });
    // Control: antes tampoco había nada con ese nombre, y la empresa seguía con su plan anual.
    expect(r.antes).toMatchObject({ planes: 0, rastro: 0, empresa: { planId: r.grande, planTipoCobro: "anual" } });
    expect(r.despues).toEqual(r.antes);
  });

  it("D2, SLT-58 R31 bajo cerrojo: el repositorio rechaza la fecha si la empresa ya tiene plan, y no crea nada", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const org = (await crearOrganizacion(tx)).id;
      const otro = await servicio.crear(SUPERADMIN, entradaAsignable());
      if (otro.estado !== "ok") throw new Error(otro.estado);
      await servicio.asignar(SUPERADMIN, { organizacionId: org, planId: otro.planId, tipoCobro: "mensual" });
      const entrada = custom(org);
      const antes = await rastroDe(tx, org, entrada.nombre);
      // Directo al repositorio: como si otra petición hubiera asignado entre la lectura del servicio y el cerrojo.
      const rechazo = await planesEnTx(tx).crearYAsignar({ ...entrada, organizacionId: org }, SUPERADMIN.usuarioId, {
        tipoCobro: "anual",
        inicio: { fecha: "2026-11-01", ancla: new Date("2026-11-01T06:00:00.000Z") },
      });
      return { rechazo, antes, despues: await rastroDe(tx, org, entrada.nombre) };
    });
    expect(r.rechazo).toMatchObject({ estado: "validation_error", fieldErrors: { inicioCiclo: [expect.any(String)] } });
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.empresa.planTipoCobro).toBe("mensual");
  });

  it("D2: si el historial de la asignación falla, se revierte también el plan recién creado", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const entrada = custom(org);
      const antes = await rastroDe(tx, org, entrada.nombre);
      const error = await new PlanesService(planesEnTx(tx, "historial")).crear(SUPERADMIN, entrada).catch((e: unknown) => e);
      return { error, antes, despues: await rastroDe(tx, org, entrada.nombre) };
    });
    expect(r.error).toBeInstanceOf(Error);
    expect(r.despues).toEqual(r.antes);
    expect(r.despues.planes).toBe(0);
  });

  it("D2: una empresa que no existe → not_found sin crear el plan", async () => {
    const r = await revertida(base, async (tx) => {
      const nombre = `custom ${randomUUID().slice(0, 8)}`;
      const res = await planesEnTx(tx).crearYAsignar(
        { ...custom(randomUUID(), { nombre }), organizacionId: randomUUID() },
        SUPERADMIN.usuarioId,
        { tipoCobro: "mensual" },
      );
      return { res, planes: await tx.plan.count({ where: { nombre } }) };
    });
    expect(r.res).toEqual({ estado: "not_found" });
    expect(r.planes).toBe(0);
  });
});

describeSiHayBase("Ajuste planes-custom — el tipo de cobro de cada asignación (D6)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("una empresa nueva nace en mensual (DEFAULT); cada asignación guarda el tipo elegido y lo deja en el historial", async () => {
    const r = await revertida(base, async (tx) => {
      const servicio = new PlanesService(planesEnTx(tx));
      const org = (await crearOrganizacion(tx)).id;
      const nueva = (await empresa(tx, org)).planTipoCobro;
      const [uno, dos] = [await servicio.crear(SUPERADMIN, entradaAsignable()), await servicio.crear(SUPERADMIN, entradaAsignable())];
      if (uno.estado !== "ok" || dos.estado !== "ok") throw new Error("no se crearon los planes");
      const tipos: TipoCobro[] = [];
      await servicio.asignar(SUPERADMIN, { organizacionId: org, planId: uno.planId, tipoCobro: "anual" });
      tipos.push((await empresa(tx, org)).planTipoCobro as TipoCobro);
      await servicio.asignar(SUPERADMIN, { organizacionId: org, planId: dos.planId, tipoCobro: "mensual" });
      tipos.push((await empresa(tx, org)).planTipoCobro as TipoCobro);
      return { nueva, tipos, historial: (await asignaciones(tx, org)).map((a) => a.valorNuevo) };
    });
    expect(r.nueva).toBe("mensual");
    expect(r.tipos).toEqual(["anual", "mensual"]);
    expect(r.historial).toEqual(["anual", "mensual"]);
  });

  it("sin tipo, el repositorio asigna en mensual (la firma de SL-24 sigue valiendo)", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const plan = await new PlanesService(planesEnTx(tx)).crear(SUPERADMIN, entradaAsignable());
      if (plan.estado !== "ok") throw new Error(plan.estado);
      await tx.organizacion.update({ where: { id: org }, data: { planTipoCobro: "anual" } });
      const res = await planesEnTx(tx).asignar(org, plan.planId, SUPERADMIN.usuarioId);
      return { res, tipo: (await empresa(tx, org)).planTipoCobro };
    });
    expect(r.res).toEqual({ estado: "ok", cambio: true });
    expect(r.tipo).toBe("mensual");
  });

  it("el CHECK rechaza un tipo que no es mensual ni anual (23514)", async () => {
    const r = await revertida(base, async (tx) => {
      const org = (await crearOrganizacion(tx)).id;
      const fijar = (tipo: string) =>
        capturar(tx, () => tx.$executeRawUnsafe(`UPDATE "organizacion" SET "plan_tipo_cobro" = $1 WHERE "id" = $2`, tipo, org));
      return { malo: await fijar("trimestral"), anual: await fijar("anual") };
    });
    expect(sqlstateDe(r.malo)).toBe("23514");
    expect(r.anual).toBeNull();
  });
});
