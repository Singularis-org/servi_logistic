import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EstadoUsuario, PrismaClient, RolValue } from "@prisma/client";

import { UserRepository } from "@/lib/repositories/UserRepository";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type FksDeOrden, type TxDeTest } from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SLT-66 / T3 (design §8) — el maestro deja de tener tope de usuarios. R1, R2, R3, R6.
//
// R3 sale por construcción: sin fila de tope de `maestro` el trigger de usuario no la cuenta, y el
// CHECK de `plan_tope_rol` (M1) impide que vuelva a haber una. Por eso R1 se prueba en la base y R3
// con una empresa que tiene TODOS los demás topes llenos: si el maestro contara, cualquiera de sus
// cuatro altas chocaría. Las vías son los repositorios reales (como en `plan-topes-usuarios`).
//
// Control de no vacuidad: cada caso comprueba que los triggers de tope están en `pg_trigger`. Sin
// ellos, «el maestro entra» no probaría nada.
//
// Todo corre en una transacción del dueño que SIEMPRE se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ROLES_CON_TOPE = ["admin", "mensajero", "adminTienda", "adminSatelite"] as const satisfies readonly RolValue[];

const jobsNoOp = {
  enqueue: async () => null,
  claimBatch: async () => [],
  findByDedupeKeys: async () => [],
  complete: async () => {},
  fail: async () => {},
} as unknown as IJobRepository;

let base: PrismaClient;

interface Caso {
  tx: TxDeTest;
  org: string;
  fks: FksDeOrden;
  usuarios: UserRepository;
  rolId: (r: RolValue) => Promise<string>;
  crear: (rol: RolValue, estado?: EstadoUsuario) => Promise<{ id: string } | { error: unknown }>;
  activos: (rol: RolValue) => Promise<number>;
  /** Un alta de una orden por la ruta real de la carga por pantalla. */
  orden: () => Promise<unknown>;
  /** Una API key por `createConUsuario`. */
  apiKey: (creadaPor: string) => Promise<unknown>;
  uso: () => Promise<Record<string, number>>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const { id: org } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, org);
  const fks = await crearFksDeOrden(tx);
  const usuarios = new UserRepository(clienteConSavepoint(tx));
  const ordenes = new OrdenRepository(clienteConSavepoint(tx), jobsNoOp);
  const keys = new ApiKeyRepository(clienteConSavepoint(tx));
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const rolId = async (r: RolValue) => (await tx.rol.findUniqueOrThrow({ where: { value: r }, select: { id: true } })).id;
  const activos = (rol: RolValue) => tx.usuario.count({ where: { organizacionId: org, rol: { value: rol }, estado: "activo" } });
  return {
    tx,
    org,
    fks,
    usuarios,
    rolId,
    activos,
    crear: async (rol, estado = "activo") => {
      const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
      try {
        const u = await usuarios.create(
          {
            nombre: `SLT66 ${rol}`,
            email: `slt66-${sufijo}@example.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: `slt66-${sufijo}`,
            tipoIdentificacionId: tipo.id,
            rolId: await rolId(rol),
            estado,
          },
          null,
        );
        return { id: u.id };
      } catch (error) {
        return { error };
      }
    },
    orden: async () => {
      await fijarEmpresa(tx, org);
      const datos = [
        {
          numRemision: `SLT66-${randomUUID().slice(0, 12)}`,
          estatusId: fks.estatusId,
          destinatario: "Destinatario SLT-66",
          telefonoDest: "88880000",
          tiendaId: fks.tiendaId,
          zonaId: fks.zonaId,
          provinciaId: fks.provinciaId,
          cantonId: fks.cantonId,
          distritoId: null,
          producto: "Caja",
          peso: null,
          notas: null,
          direccion: null,
          montoCobrar: null,
        },
      ];
      const lote = { cargaId: null, usuarioCargaId: fks.tiendaId, totalFiles: 1, name: null };
      return ordenes.createManyOrdenes(datos, 500, { actorUsuarioId: fks.tiendaId, origenTipo: "carga_masiva" }, lote);
    },
    apiKey: async (creadaPor) => {
      const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
      await fijarEmpresa(tx, org);
      return keys.createConUsuario({
        identificador: `slt66 ${sufijo}`,
        slug: `slt66-${sufijo}`,
        email: `apikey-slt66-${sufijo}@example.test`,
        cedula: `apikey-slt66-${sufijo}`,
        passwordHash: "x",
        keyPrefix: `s66${sufijo.slice(0, 5)}`,
        keyHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        createdById: creadaPor,
        tiendaDestinoId: null,
      });
    },
    uso: async () => {
      const porRol = await Promise.all(ROLES_CON_TOPE.map(async (rol) => [rol, await activos(rol)] as const));
      return {
        ...Object.fromEntries(porRol),
        ordenes: await tx.orden.count({ where: { organizacionId: org, deletedAt: null } }),
        apiKeys: await tx.apiKey.count({ where: { organizacionId: org, estado: "activa" } }),
      };
    },
  };
}

function id(r: { id: string } | { error: unknown }): string {
  if ("error" in r) throw new Error(`el alta falló: ${sqlstateDe(r.error)} ${String((r.error as Error).message)}`);
  return r.id;
}

function topeDe(error: unknown): TopeDelPlanAlcanzado {
  const t = traducirErrorDeTope(error);
  if (!(t instanceof TopeDelPlanAlcanzado)) {
    throw new Error(error === null ? "no hubo error: se esperaba el tope" : `otro error: ${sqlstateDe(error)} ${String((error as Error).message)}`);
  }
  return t;
}

async function rechazo(fn: () => Promise<unknown>): Promise<TopeDelPlanAlcanzado> {
  try {
    await fn();
  } catch (e) {
    return topeDe(e);
  }
  return topeDe(null);
}

async function controles(tx: TxDeTest): Promise<void> {
  expect(await triggerActivo(tx, "plan_tope_usuario_alta", "usuario")).toBe(true);
  expect(await triggerActivo(tx, "plan_tope_usuario_cambio", "usuario")).toBe(true);
  expect(await triggerActivo(tx, "plan_tope_ordenes", "orden")).toBe(true);
  expect(await triggerActivo(tx, "plan_tope_api_key_alta", "api_key")).toBe(true);
}

/**
 * Una empresa con plan y TODO al tope: cada rol con tope tiene un activo y tope 1, una orden con tope
 * de 1 por ciclo y una API key con tope de 1. Más un maestro (el que crea la key), un maestro
 * inactivo, un maestro pendiente y un segundo admin que luego pasa a maestro.
 */
async function empresaAlTope(tx: TxDeTest) {
  const c = await caso(tx);
  for (const rol of ROLES_CON_TOPE) {
    // `crearFksDeOrden` ya trajo una tienda activa.
    if ((await c.activos(rol)) === 0) id(await c.crear(rol));
  }
  const otroAdmin = id(await c.crear("admin"));
  const maestro = id(await c.crear("maestro"));
  const inactivo = id(await c.crear("maestro", "inactivo"));
  const pendiente = id(await c.crear("maestro", "pendiente"));
  const porRol = Object.fromEntries(await Promise.all(ROLES_CON_TOPE.map(async (rol) => [rol, await c.activos(rol)] as const)));
  const plan = await crearPlan(tx, { porRol, ordenes: 1, apiKeys: 1 });
  await asignarPlan(tx, c.org, plan);
  await controles(tx);
  await c.orden();
  await c.apiKey(maestro);
  return { c, plan, porRol, otroAdmin, maestro, inactivo, pendiente };
}

describeSiHayBase("SLT-66 — el maestro no tiene tope de usuarios (R1, R2, R3, R6)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1: la base rechaza con 23514 un tope del rol maestro; el de admin en el mismo plan entra", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      const maestro = await capturar(tx, () => tx.planTopeRol.create({ data: { planId: plan, rol: "maestro", maximo: 1 } }));
      const conPlanNuevo = await capturar(tx, () => crearPlan(tx, { porRol: { maestro: 3 } }));
      const admin = await capturar(tx, () => tx.planTopeRol.create({ data: { planId: plan, rol: "admin", maximo: 1 } }));
      const filas = await tx.planTopeRol.findMany({ where: { planId: plan }, select: { rol: true } });
      const deMaestro = await tx.planTopeRol.count({ where: { rol: "maestro" } });
      return { maestro: sqlstateDe(maestro), conPlanNuevo: sqlstateDe(conPlanNuevo), admin, filas: filas.map((f) => f.rol), deMaestro };
    });
    expect(r.maestro).toBe("23514");
    expect(r.conPlanNuevo).toBe("23514");
    expect(r.admin).toBeNull();
    expect(r.filas).toEqual(["admin"]);
    expect(r.deMaestro).toBe(0);
  });

  it.each(ROLES_CON_TOPE)("R2: el tope de %s sigue rechazando el alta que lo pasa", async (rol) => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const plan = await crearPlan(tx, { porRol: { [rol]: 1 } });
      if ((await c.activos(rol)) === 0) id(await c.crear(rol));
      await asignarPlan(tx, c.org, plan);
      await controles(tx);
      const otro = await c.crear(rol);
      if (!("error" in otro)) throw new Error(`el segundo ${rol} se creó`);
      return { details: topeDe(otro.error).details, activos: await c.activos(rol) };
    });
    expect(r.details).toMatchObject({ codigo: "tope_plan", tope: "rol", rol, maximo: 1, usados: 1, pedidas: 1 });
    expect(r.activos).toBe(1);
  });

  it("R3: con todos los topes llenos, crear, activar, aprobar y cambiar a maestro entran y ningún uso con tope cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const { c, porRol, otroAdmin, inactivo, pendiente } = await empresaAlTope(tx);
      const antes = await c.uso();
      const maestrosAntes = await c.activos("maestro");

      const creado = id(await c.crear("maestro"));
      await c.usuarios.setEstado(inactivo, "activo", null);
      // `AprobacionPostulacionRepository` solo aprueba mensajeros (su `where` fija el rol), así que la
      // aprobación de un maestro pendiente se hace con su misma sentencia sin ese filtro: es la
      // transición `pendiente → activo` que el trigger de alta mira.
      const aprobadas = await tx.$executeRawUnsafe(
        `UPDATE "usuario" SET "estado" = 'activo' WHERE "id" = $1 AND "estado" = 'pendiente'`,
        pendiente,
      );
      await c.usuarios.update(otroAdmin, { rolId: await c.rolId("maestro") }, null);

      const estados = await tx.usuario.findMany({
        where: { id: { in: [creado, inactivo, pendiente, otroAdmin] } },
        select: { id: true, estado: true, rol: { select: { value: true } } },
      });
      return { porRol, antes, despues: await c.uso(), maestrosAntes, maestros: await c.activos("maestro"), aprobadas, estados };
    });
    // Control: cada rol con tope estaba justo en su tope, así que cualquier alta de esos roles chocaría.
    for (const rol of ROLES_CON_TOPE) expect(r.antes[rol]).toBe(r.porRol[rol]);
    expect(r.antes.ordenes).toBe(1);
    expect(r.antes.apiKeys).toBe(1);
    expect(r.aprobadas).toBe(1);
    expect(r.estados).toHaveLength(4);
    for (const e of r.estados) expect(e).toMatchObject({ estado: "activo", rol: { value: "maestro" } });
    expect(r.maestros).toBe(r.maestrosAntes + 4);
    // El admin que pasó a maestro deja de contar como admin: es la única diferencia, y es una baja.
    expect(r.despues).toEqual({ ...r.antes, admin: r.antes.admin - 1 });
  });

  it("R6: con el plan lleno, el tope de órdenes y el de API keys siguen rechazando", async () => {
    const r = await revertida(base, async (tx) => {
      const { c, maestro } = await empresaAlTope(tx);
      const antes = await c.uso();
      const orden = await rechazo(() => c.orden());
      const key = await rechazo(() => c.apiKey(maestro));
      return { orden: orden.details, key: key.details, antes, despues: await c.uso() };
    });
    expect(r.orden).toMatchObject({ codigo: "tope_plan", tope: "ordenes", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.key).toMatchObject({ codigo: "tope_plan", tope: "api_keys", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.despues).toEqual(r.antes);
  });
});
