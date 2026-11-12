import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { TipoCobro } from "@/lib/types/planes";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { capturar, entradaAsignable, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-128 · T7.2 (design §1, §2.1, §3.6; R2, R12, R26) — la versión del plan POR EMPRESA contra Postgres, con
// `PlanesService` y `PlanesRepository` REALES. Todo en una transacción del dueño que se revierte; el repositorio
// abre las suyas como SAVEPOINT.
//
// El escenario de R2: un plan con tope de 3 `admin` y cobro por orden 100, editado a 1 y 80 con F = 16 de
// noviembre. Dos empresas: la quincenal lo recibe el 16 (la cola, a mano con su reloj) y la mensual el 1 de
// diciembre, que aún no llega. Así, en el mismo instante, las dos corren versiones distintas del mismo plan:
//   · R2: los triggers de topes (por SQL a mano con `servi_app`, como en `plan-topes-usuarios.test.ts`) y la tarifa
//     (`cobro_plataforma_tarifa_de`) leen la versión de CADA empresa;
//   · R12: «Mi plan» (`plan_de_la_empresa`) y el detalle del superadmin (`planDeEmpresa`) muestran la versión de
//     cada una, y el cambio programado con SU recepción solo a la que aún no lo recibió;
//   · R26: `servi_app` no lee ni escribe las dos tablas ni ejecuta los dos lectores internos (`42501`).
//
// Después de un `comoApp` la transacción corre como `servi_app`; `RESET ROLE` la devuelve al dueño.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUPERADMIN: Actor = { usuarioId: randomUUID(), rol: "superadmin", organizacionId: null };
/** 2026-10-28 12:00 UTC = 06:00 en la plataforma. */
const AHORA = new Date("2026-10-28T12:00:00.000Z");

let base: PrismaClient;

interface Escenario {
  planId: string;
  nombreViejo: string;
  quincenal: string;
  mensual: string;
  /** Un `admin` inactivo de cada empresa: activarlo es un alta (trigger `plan_tope_usuario_cambio`). */
  inactivo: Record<"quincenal" | "mensual", string>;
}

async function escenario(tx: TxDeTest): Promise<Escenario> {
  const servicio = new PlanesService(planesEnTx(tx), () => AHORA);
  const entrada = entradaAsignable({
    nombre: `SLT128 versión ${randomUUID().slice(0, 6)}`,
    topes: { porRol: { admin: 3 }, apiKeys: null },
    costoPorOrden: "100.00",
  });
  const creado = await servicio.crear(SUPERADMIN, entrada);
  if (creado.estado !== "ok") throw new Error(`crear: ${JSON.stringify(creado)}`);
  const ids: string[] = [];
  const inactivos: string[] = [];
  for (const tipoCobro of ["quincenal", "mensual"] as const satisfies readonly TipoCobro[]) {
    const { id } = await crearOrganizacion(tx);
    const r = await servicio.asignar(SUPERADMIN, { organizacionId: id, planId: creado.planId, tipoCobro });
    if (r.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(r)}`);
    await fijarEmpresa(tx, id);
    await crearUsuarioDePrueba(tx, "admin");
    const inactivo = await crearUsuarioDePrueba(tx, "admin");
    await tx.usuario.update({ where: { id: inactivo.id }, data: { estado: "inactivo" } });
    ids.push(id);
    inactivos.push(inactivo.id);
  }
  await fijarEmpresa(tx, "");
  const programado = await servicio.editar(SUPERADMIN, {
    planId: creado.planId,
    nombre: "SLT128 versión nueva",
    topes: { porRol: { admin: 1 }, apiKeys: null },
    modulos: entrada.modulos,
    precio: entrada.precio,
    costoPorOrden: "80.00",
    costoPorOrdenPorcentual: null,
    vigenteDesde: "2026-11-16",
  });
  if (programado.estado !== "ok") throw new Error(`programar: ${JSON.stringify(programado)}`);
  const [quincenal, mensual] = ids;
  const { id: cambioId } = await tx.planCambioProgramado.findUniqueOrThrow({ where: { planId: creado.planId }, select: { id: true } });
  const recibido = await planesEnTx(tx).recibirCambio(
    { planId: creado.planId, cambioId },
    quincenal,
    new Date("2026-11-16T06:01:00.000Z"),
  );
  if (recibido.estado !== "aplicado") throw new Error(`recibirCambio: ${JSON.stringify(recibido)}`);
  return {
    planId: creado.planId,
    nombreViejo: entrada.nombre,
    quincenal,
    mensual,
    inactivo: { quincenal: inactivos[0], mensual: inactivos[1] },
  };
}

/** Corre `sql` en un SAVEPOINT: el SQLSTATE del rechazo, o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const error = await capturar(tx, () => tx.$executeRawUnsafe(sql, ...args));
  return error === null ? null : sqlstateDe(error);
}

/** «Mi plan» de la empresa del contexto, tal cual lo devuelve la función (jsonb parseado o texto). */
async function miPlan(tx: TxDeTest, organizacionId: string): Promise<Record<string, unknown>> {
  const [f] = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, organizacionId);
  return (typeof f.plan === "string" ? JSON.parse(f.plan) : f.plan) as Record<string, unknown>;
}

async function tarifa(tx: TxDeTest, organizacionId: string): Promise<string | null> {
  const [f] = await tx.$queryRawUnsafe<{ monto: string | null }[]>(
    `SELECT t."monto"::text AS monto FROM cobro_plataforma_tarifa_de($1) t`,
    organizacionId,
  );
  return f?.monto ?? null;
}

describeSiHayBase("SLT-128 — la versión del plan por empresa (R2, R12, R26)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2: a mitad del cambio, los triggers de topes (SQL a mano con servi_app) y la tarifa leen la versión de CADA empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const tarifas = { quincenal: await tarifa(tx, e.quincenal), mensual: await tarifa(tx, e.mensual) };
      await comoApp(tx, e.quincenal);
      const rol = (await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`))[0].r;
      // La quincenal ya corre el tope 1: con 1 admin activo, activar otro lo pasa.
      const quincenal = await intentar(tx, `UPDATE "usuario" SET "estado" = 'activo' WHERE "id" = $1`, e.inactivo.quincenal);
      // La mensual sigue con el tope 3 hasta el 1 de diciembre: el segundo entra.
      await fijarEmpresa(tx, e.mensual);
      const mensual = await intentar(tx, `UPDATE "usuario" SET "estado" = 'activo' WHERE "id" = $1`, e.inactivo.mensual);
      await tx.$executeRawUnsafe("RESET ROLE");
      const activos = async (organizacionId: string) =>
        tx.usuario.count({ where: { organizacionId, estado: "activo", rol: { value: "admin" } } });
      return {
        rol,
        quincenal,
        mensual,
        tarifas,
        activos: { quincenal: await activos(e.quincenal), mensual: await activos(e.mensual) },
      };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.quincenal).toBe("SL024");
    expect(r.mensual).toBeNull();
    expect(r.activos).toEqual({ quincenal: 1, mensual: 2 });
    // La siguiente orden de la quincenal se cobra con el cobro nuevo; la de la mensual, con el de antes.
    expect(r.tarifas).toEqual({ quincenal: "80.00", mensual: "100.00" });
  });

  it("R12: «Mi plan» y el detalle del superadmin muestran la versión de cada empresa y el cambio con SU recepción solo a la que no lo recibió", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await comoApp(tx, e.quincenal);
      const miQuincenal = await miPlan(tx, e.quincenal);
      await fijarEmpresa(tx, e.mensual);
      const miMensual = await miPlan(tx, e.mensual);
      await tx.$executeRawUnsafe("RESET ROLE");
      await fijarEmpresa(tx, "");
      const repo = planesEnTx(tx);
      return { e, miQuincenal, miMensual, detalleQuincenal: await repo.planDeEmpresa(e.quincenal), detalleMensual: await repo.planDeEmpresa(e.mensual) };
    });
    // «Mi plan» de la quincenal: la versión nueva y ningún cambio programado.
    expect(r.miQuincenal).toMatchObject({
      nombre: "SLT128 versión nueva",
      costo_por_orden: "80.00",
      topes_rol: [{ rol: "admin", maximo: 1 }],
      cambio: null,
    });
    // «Mi plan» de la mensual: la de antes, con el cambio desde SU recepción (1 de diciembre), no desde F.
    expect(r.miMensual).toMatchObject({
      nombre: r.e.nombreViejo,
      costo_por_orden: "100.00",
      topes_rol: [{ rol: "admin", maximo: 3 }],
      cambio: { version: { nombre: "SLT128 versión nueva" } },
    });
    expect(String((r.miMensual.cambio as { vigente_desde: unknown }).vigente_desde)).toMatch(/^2026-12-01T06:00:00/);
    // El detalle de empresa del superadmin, igual.
    expect(r.detalleQuincenal?.plan).toMatchObject({
      dto: { nombre: "SLT128 versión nueva", costoPorOrden: "80.00", topes: { porRol: { admin: 1 } } },
      vigente: { nombre: "SLT128 versión nueva" },
      cambio: null,
    });
    expect(r.detalleMensual?.plan).toMatchObject({
      dto: { nombre: r.e.nombreViejo, costoPorOrden: "100.00", topes: { porRol: { admin: 3 } } },
      cambio: { vigenteDesde: new Date("2026-12-01T06:00:00.000Z"), version: { nombre: "SLT128 versión nueva" } },
    });
  });

  it("R26: servi_app no lee ni escribe plan_cambio_recepcion ni plan_version_empresa, ni con su propia empresa (42501); tampoco ejecuta los lectores internos", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      // Control: el dueño sí las lee (el 42501 de abajo es de privilegios, no de una tabla vacía o ausente).
      const control = {
        recepciones: await tx.planCambioRecepcion.count({ where: { empresaId: { in: [e.quincenal, e.mensual] } } }),
        versiones: await tx.planVersionEmpresa.count({ where: { empresaId: e.quincenal } }),
      };
      await comoApp(tx, e.quincenal);
      const salida = {
        selectRecepcion: await intentar(tx, `SELECT * FROM "plan_cambio_recepcion" WHERE "empresa_id" = $1`, e.quincenal),
        selectVersion: await intentar(tx, `SELECT * FROM "plan_version_empresa" WHERE "empresa_id" = $1`, e.quincenal),
        insertRecepcion: await intentar(
          tx,
          `INSERT INTO "plan_cambio_recepcion" ("cambio_id", "empresa_id", "recibe_at") VALUES ($1, $2, '2026-12-01 06:00:00')`,
          randomUUID(),
          e.quincenal,
        ),
        insertVersion: await intentar(
          tx,
          `INSERT INTO "plan_version_empresa" ("empresa_id", "plan_id", "cambio_id", "version", "desde_at")
           VALUES ($1, $2, 'x', '{}'::jsonb, '2026-12-01 06:00:00')`,
          e.mensual,
          e.planId,
        ),
        updateRecepcion: await intentar(tx, `UPDATE "plan_cambio_recepcion" SET "recibido_at" = NULL WHERE "empresa_id" = $1`, e.quincenal),
        updateVersion: await intentar(tx, `UPDATE "plan_version_empresa" SET "version" = '{}'::jsonb WHERE "empresa_id" = $1`, e.quincenal),
        deleteRecepcion: await intentar(tx, `DELETE FROM "plan_cambio_recepcion" WHERE "empresa_id" = $1`, e.quincenal),
        deleteVersion: await intentar(tx, `DELETE FROM "plan_version_empresa" WHERE "empresa_id" = $1`, e.quincenal),
        planVersionDe: await intentar(tx, `SELECT * FROM plan_version_de($1, $2)`, e.quincenal, e.planId),
        planTopeRolDe: await intentar(tx, `SELECT plan_tope_rol_de($1, $2, 'admin'::rol_value)`, e.quincenal, e.planId),
      };
      // Su versión sí la ve, por la única puerta: `plan_de_la_empresa`.
      const miPlanNombre = (await miPlan(tx, e.quincenal)).nombre;
      await tx.$executeRawUnsafe("RESET ROLE");
      return {
        control,
        salida,
        miPlanNombre,
        despues: {
          recepciones: await tx.planCambioRecepcion.count({ where: { empresaId: { in: [e.quincenal, e.mensual] } } }),
          versiones: await tx.planVersionEmpresa.count({ where: { empresaId: e.quincenal } }),
        },
      };
    });
    expect(r.control).toEqual({ recepciones: 2, versiones: 1 });
    for (const [caso, sqlstate] of Object.entries(r.salida)) expect(sqlstate, caso).toBe("42501");
    expect(r.miPlanNombre).toBe("SLT128 versión nueva");
    expect(r.despues).toEqual(r.control);
  });
});
