import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EstadoUsuario, PrismaClient, RolValue } from "@prisma/client";

import { UserRepository } from "@/lib/repositories/UserRepository";
import { AprobacionPostulacionRepository } from "@/lib/repositories/AprobacionPostulacionRepository";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SL-24 / T3 (design §4.3, P4) — el tope de usuarios activos por rol, contado por la base. R14, R25,
// R26, R27.
//
// Las vías son los repositorios REALES, sin tocarlos (SLT-32): `UserRepository.create` (crear),
// `UserRepository.setEstado` (activar desde `inactivo` o `bloqueado`), `UserRepository.update` (cambiar
// el rol), `AprobacionPostulacionRepository.actualizarEstadoSiPendiente` (aprobar una postulación) y
// `ApiKeyRepository.createConUsuario` (la cuenta dedicada, rol `apiKey`). Más el `UPDATE` a mano con
// `servi_app`. `clienteConSavepoint` hace de cada `$transaction` un SAVEPOINT real: si el trigger
// rechaza, el alta y su historial se deshacen y el caso sigue.
//
// Todo corre en una transacción del dueño que SIEMPRE se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Caso {
  tx: TxDeTest;
  org: string;
  usuarios: UserRepository;
  postulaciones: AprobacionPostulacionRepository;
  rolId: (r: RolValue) => Promise<string>;
  /** Crea un usuario por `UserRepository.create`. Devuelve el id o el error. */
  crear: (rol: RolValue, estado?: EstadoUsuario) => Promise<{ id: string } | { error: unknown }>;
  activos: (rol: RolValue) => Promise<number>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const { id: org } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, org);
  const usuarios = new UserRepository(clienteConSavepoint(tx));
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const rolId = async (r: RolValue) => (await tx.rol.findUniqueOrThrow({ where: { value: r }, select: { id: true } })).id;
  return {
    tx,
    org,
    usuarios,
    postulaciones: new AprobacionPostulacionRepository(clienteConSavepoint(tx)),
    rolId,
    crear: async (rol, estado = "activo") => {
      const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
      try {
        const u = await usuarios.create(
          {
            nombre: `SL24 ${rol}`,
            email: `sl24-${sufijo}@example.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: `sl24-${sufijo}`,
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
    activos: (rol) => tx.usuario.count({ where: { organizacionId: org, rol: { value: rol }, estado: "activo" } }),
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

async function rechazo<T>(fn: () => Promise<T>): Promise<TopeDelPlanAlcanzado> {
  try {
    await fn();
  } catch (e) {
    return topeDe(e);
  }
  return topeDe(null);
}

async function conPlan(c: Caso, porRol: Partial<Record<RolValue, number>>): Promise<string> {
  const plan = await crearPlan(c.tx, { porRol });
  await asignarPlan(c.tx, c.org, plan);
  expect(await triggerActivo(c.tx, "plan_tope_usuario_alta", "usuario")).toBe(true);
  expect(await triggerActivo(c.tx, "plan_tope_usuario_cambio", "usuario")).toBe(true);
  return plan;
}

const estadoDe = async (tx: TxDeTest, usuarioId: string) =>
  (await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { estado: true } })).estado;

describeSiHayBase("SL-24 — tope de usuarios activos por rol en la base (R14, R25, R26, R27)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R27 crear: con el tope de tiendas en 2, la tercera activa se rechaza y no queda", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { adminTienda: 2 });
      id(await c.crear("adminTienda"));
      id(await c.crear("adminTienda"));
      const tercera = await c.crear("adminTienda");
      if (!("error" in tercera)) throw new Error("la tercera tienda se creó");
      const t = topeDe(tercera.error);
      return { details: t.details, mensaje: t.message, activas: await c.activos("adminTienda"), total: await tx.usuario.count({ where: { organizacionId: c.org } }) };
    });
    expect(r.details).toEqual({ codigo: "tope_plan", tope: "rol", rol: "adminTienda", maximo: 2, usados: 2, pedidas: 1 });
    expect(r.mensaje).toBe("Tu plan permite 2 usuarios activos con el rol Admin de tienda. Ya tienes 2. Inactiva alguno o pide un cambio de plan.");
    expect(r.activas).toBe(2);
    expect(r.total).toBe(2);
  });

  it("R26: pendiente, inactivo y bloqueado no cuentan ni se rechazan al crearlos", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { adminTienda: 2 });
      id(await c.crear("adminTienda"));
      id(await c.crear("adminTienda"));
      for (const estado of ["pendiente", "inactivo", "bloqueado"] as const) id(await c.crear("adminTienda", estado));
      return { activas: await c.activos("adminTienda"), total: await tx.usuario.count({ where: { organizacionId: c.org } }) };
    });
    expect(r).toEqual({ activas: 2, total: 5 });
  });

  it("R27 activar desde inactivo: al tope se rechaza y sigue inactivo; inactivar a otro libera cupo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { adminTienda: 1 });
      const activa = id(await c.crear("adminTienda"));
      const inactiva = id(await c.crear("adminTienda", "inactivo"));
      const t = await rechazo(() => c.usuarios.setEstado(inactiva, "activo", null));
      const sigue = await estadoDe(tx, inactiva);
      // Inactivar no es alta: nunca se rechaza por tope.
      await c.usuarios.setEstado(activa, "inactivo", null);
      await c.usuarios.setEstado(inactiva, "activo", null);
      return { details: t.details, sigue, ahora: await estadoDe(tx, inactiva), activas: await c.activos("adminTienda") };
    });
    expect(r.details).toMatchObject({ tope: "rol", rol: "adminTienda", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.sigue).toBe("inactivo");
    expect(r.ahora).toBe("activo");
    expect(r.activas).toBe(1);
  });

  it("R27 activar desde bloqueado es un alta: al tope se rechaza y sigue bloqueado", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { mensajero: 1 });
      const activo = id(await c.crear("mensajero"));
      const bloqueado = id(await c.crear("mensajero", "bloqueado"));
      const t = await rechazo(() => c.usuarios.setEstado(bloqueado, "activo", null));
      const sigue = await estadoDe(tx, bloqueado);
      const activos = await c.activos("mensajero");
      // Bloquear no es alta: se bloquea al activo aunque el rol esté al tope.
      await c.usuarios.setEstado(activo, "bloqueado", null);
      return { details: t.details, sigue, activos, alBloquear: await estadoDe(tx, activo) };
    });
    expect(r.details).toMatchObject({ tope: "rol", rol: "mensajero", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.sigue).toBe("bloqueado");
    expect(r.activos).toBe(1);
    expect(r.alBloquear).toBe("bloqueado");
  });

  it("R27 aprobar una postulación es un alta: al tope se rechaza y sigue pendiente; rechazarla sí se puede", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { mensajero: 1 });
      id(await c.crear("mensajero"));
      const postulante = id(await c.crear("mensajero", "pendiente"));
      const t = await rechazo(() => c.postulaciones.actualizarEstadoSiPendiente(postulante, "activo", null));
      const sigue = await estadoDe(tx, postulante);
      const alRechazar = await c.postulaciones.actualizarEstadoSiPendiente(postulante, "inactivo", null);
      return { details: t.details, sigue, alRechazar, final: await estadoDe(tx, postulante) };
    });
    expect(r.details).toMatchObject({ tope: "rol", rol: "mensajero", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.sigue).toBe("pendiente");
    expect(r.alRechazar).toBe(1);
    expect(r.final).toBe("inactivo");
  });

  it("R27 cambiar el rol es un alta del rol nuevo: al tope se rechaza y el rol no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { adminTienda: 1 });
      id(await c.crear("adminTienda"));
      const admin = id(await c.crear("admin"));
      const rolTienda = await c.rolId("adminTienda");
      const t = await rechazo(() => c.usuarios.update(admin, { rolId: rolTienda }, null));
      const rol = await tx.usuario.findUniqueOrThrow({ where: { id: admin }, select: { rol: { select: { value: true } } } });
      return { details: t.details, rol: rol.rol.value, tiendas: await c.activos("adminTienda") };
    });
    expect(r.details).toMatchObject({ tope: "rol", rol: "adminTienda", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.rol).toBe("admin");
    expect(r.tiendas).toBe(1);
  });

  it("R27 por SQL a mano con servi_app: activar o cambiar el rol al tope da SL024", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { adminTienda: 1 });
      id(await c.crear("adminTienda"));
      const inactiva = id(await c.crear("adminTienda", "inactivo"));
      const admin = id(await c.crear("admin"));
      const rolTienda = await c.rolId("adminTienda");
      await comoApp(tx, c.org);
      const activar = await capturar(tx, () => tx.$executeRawUnsafe(`UPDATE "usuario" SET "estado" = 'activo' WHERE "id" = $1`, inactiva));
      const cambiarRol = await capturar(tx, () => tx.$executeRawUnsafe(`UPDATE "usuario" SET "rol_id" = $1 WHERE "id" = $2`, rolTienda, admin));
      const rol = await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`);
      return { activar: sqlstateDe(activar), cambiarRol: sqlstateDe(cambiarRol), rol: rol[0].r, traducido: traducirErrorDeTope(activar) };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.activar).toBe("SL024");
    expect(r.cambiarRol).toBe("SL024");
    expect((r.traducido as TopeDelPlanAlcanzado).details).toMatchObject({ tope: "rol", rol: "adminTienda" });
  });

  it("un rol sin tope en el plan no tiene límite", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(c, { adminTienda: 0 });
      for (let i = 0; i < 3; i += 1) id(await c.crear("admin"));
      return c.activos("admin");
    });
    expect(r).toBe(3);
  });

  it("R25: crear una API key (cuenta dedicada `apiKey`) no mueve ningún uso de rol, aunque todos estén al tope", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      const maestro = id(await c.crear("maestro"));
      // SLT-66 R1, R3: el maestro ya no lleva tope (su alta al tope es aceptación en `plan-maestro-sin-tope`).
      const roles: RolValue[] = ["admin", "mensajero", "adminTienda", "adminSatelite"];
      const antes = await Promise.all(roles.map((rol) => c.activos(rol)));
      // Cada rol con tope justo en su uso: cualquier alta de un rol con tope se rechazaría.
      await conPlan(c, Object.fromEntries(roles.map((rol, i) => [rol, antes[i]])));
      // SLT-66 R2: el rechazo de control se prueba con admin.
      expect(await rechazo(() => c.crear("admin").then((x) => ("error" in x ? Promise.reject(x.error) : x)))).toBeInstanceOf(
        TopeDelPlanAlcanzado,
      );
      const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
      const key = await new ApiKeyRepository(clienteConSavepoint(tx)).createConUsuario({
        identificador: `sl24 ${sufijo}`,
        slug: `sl24-${sufijo}`,
        email: `apikey-sl24-${sufijo}@example.test`,
        cedula: `apikey-sl24-${sufijo}`,
        passwordHash: "x",
        keyPrefix: `sl24${sufijo.slice(0, 4)}`,
        keyHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        createdById: maestro,
        tiendaDestinoId: null,
      });
      const despues = await Promise.all(roles.map((rol) => c.activos(rol)));
      const cuenta = await tx.usuario.findUniqueOrThrow({
        where: { id: key.usuarioId },
        select: { estado: true, rol: { select: { value: true } } },
      });
      return { antes, despues, cuenta: { estado: cuenta.estado, rol: cuenta.rol.value } };
    });
    expect(r.despues).toEqual(r.antes);
    expect(r.cuenta).toEqual({ estado: "activo", rol: "apiKey" });
  });

  it("R14: una empresa sin plan crea usuarios activos sin límite", async () => {
    const r = await revertida(base, async (tx) => {
      const conTope = await caso(tx);
      await conPlan(conTope, { adminTienda: 0 });
      const c = await caso(tx);
      for (let i = 0; i < 3; i += 1) id(await c.crear("adminTienda"));
      const org = await tx.organizacion.findUniqueOrThrow({ where: { id: c.org }, select: { planId: true } });
      return { planId: org.planId, tiendas: await c.activos("adminTienda") };
    });
    expect(r).toEqual({ planId: null, tiendas: 3 });
  });
});
