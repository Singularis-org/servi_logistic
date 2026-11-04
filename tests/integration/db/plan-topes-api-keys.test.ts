import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { asignarPlan, capturar, crearPlan, revertida, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SL-24 / T3 (design §4.3, §6.5) — el tope de API keys activas, contado por la base (R35).
//
// Las vías son las REALES de `ApiKeyRepository`, que no se toca: `createConUsuario` (crea la cuenta
// dedicada y la key en una transacción) y `setEstado` (activar o desactivar), más `eliminar` y el SQL
// a mano con `servi_app`. `clienteConSavepoint` hace de cada `$transaction` un SAVEPOINT real: si el
// trigger rechaza la key, también se deshace la cuenta dedicada creada en la misma transacción.
//
// Todo corre en una transacción del dueño que SIEMPRE se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Caso {
  org: string;
  repo: ApiKeyRepository;
  /** Crea una key por `createConUsuario`. Devuelve la key y su email, o el error y el email. */
  crear: () => Promise<{ id: string; usuarioId: string; email: string } | { error: unknown; email: string }>;
  activas: () => Promise<number>;
}

async function caso(tx: TxDeTest): Promise<Caso> {
  const { id: org } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, org);
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const repo = new ApiKeyRepository(clienteConSavepoint(tx));
  return {
    org,
    repo,
    crear: async () => {
      const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
      const email = `apikey-sl24-${sufijo}@example.test`;
      await fijarEmpresa(tx, org);
      try {
        const k = await repo.createConUsuario({
          identificador: `sl24 ${sufijo}`,
          slug: `sl24-${sufijo}`,
          email,
          cedula: `apikey-sl24-${sufijo}`,
          passwordHash: "x",
          keyPrefix: `sl24${sufijo.slice(0, 4)}`,
          keyHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
          createdById: maestro.id,
          tiendaDestinoId: null,
        });
        return { id: k.id, usuarioId: k.usuarioId, email };
      } catch (error) {
        return { error, email };
      }
    },
    activas: () => tx.apiKey.count({ where: { organizacionId: org, estado: "activa" } }),
  };
}

type Creada = { id: string; usuarioId: string; email: string };

function creada(r: Creada | { error: unknown; email: string }): Creada {
  if ("error" in r) throw new Error(`la key no se creó: ${sqlstateDe(r.error)} ${String((r.error as Error).message)}`);
  return r;
}

function topeDe(error: unknown): TopeDelPlanAlcanzado {
  const t = traducirErrorDeTope(error);
  if (!(t instanceof TopeDelPlanAlcanzado)) {
    throw new Error(error === null ? "no hubo error: se esperaba el tope" : `otro error: ${sqlstateDe(error)} ${String((error as Error).message)}`);
  }
  return t;
}

async function conPlan(tx: TxDeTest, org: string, apiKeys: number | null): Promise<void> {
  const plan = await crearPlan(tx, { apiKeys, ordenes: 1000 });
  await asignarPlan(tx, org, plan);
  expect(await triggerActivo(tx, "plan_tope_api_key_alta", "api_key")).toBe(true);
  expect(await triggerActivo(tx, "plan_tope_api_key_cambio", "api_key")).toBe(true);
}

describeSiHayBase("SL-24 — tope de API keys activas en la base (R35)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("crear al tope se rechaza y no queda ni la key ni su cuenta dedicada", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(tx, c.org, 2);
      creada(await c.crear());
      creada(await c.crear());
      const tercera = await c.crear();
      if (!("error" in tercera)) throw new Error("la tercera key se creó");
      const t = topeDe(tercera.error);
      return {
        details: t.details,
        mensaje: t.message,
        activas: await c.activas(),
        cuenta: await tx.usuario.count({ where: { email: tercera.email } }),
        keys: await tx.apiKey.count({ where: { organizacionId: c.org } }),
      };
    });
    expect(r.details).toEqual({ codigo: "tope_plan", tope: "api_keys", maximo: 2, usados: 2, pedidas: 1 });
    expect(r.mensaje).toBe("Tu plan permite 2 API keys activas. Ya tienes 2. Desactiva o elimina alguna, o pide un cambio de plan.");
    expect(r.activas).toBe(2);
    expect(r.cuenta).toBe(0);
    expect(r.keys).toBe(2);
  });

  it("activar una inactiva al tope se rechaza y sigue inactiva", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(tx, c.org, 1);
      const primera = creada(await c.crear());
      await c.repo.setEstado(primera.id, "inactiva", null);
      creada(await c.crear());
      const error = await c.repo.setEstado(primera.id, "activa", null).then(
        () => null,
        (e: unknown) => e,
      );
      const estado = await tx.apiKey.findUniqueOrThrow({ where: { id: primera.id }, select: { estado: true } });
      return { details: topeDe(error).details, estado: estado.estado, activas: await c.activas() };
    });
    expect(r.details).toEqual({ codigo: "tope_plan", tope: "api_keys", maximo: 1, usados: 1, pedidas: 1 });
    expect(r.estado).toBe("inactiva");
    expect(r.activas).toBe(1);
  });

  it("desactivar libera cupo; desactivar y eliminar nunca se rechazan, aunque se esté al tope", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(tx, c.org, 1);
      const primera = creada(await c.crear());
      const sobrante = await c.crear();
      topeDe("error" in sobrante ? sobrante.error : null);
      await c.repo.setEstado(primera.id, "inactiva", null);
      const segunda = creada(await c.crear());
      // Al tope otra vez: desactivar la activa y eliminar la inactiva pasan.
      await c.repo.setEstado(segunda.id, "inactiva", null);
      const eliminada = await c.repo.eliminar(primera.id, null);
      const tercera = creada(await c.crear());
      return {
        eliminada: eliminada.status,
        existe: await tx.apiKey.count({ where: { id: primera.id } }),
        tercera: Boolean(tercera.id),
        activas: await c.activas(),
      };
    });
    expect(r).toEqual({ eliminada: "ok", existe: 0, tercera: true, activas: 1 });
  });

  it("por SQL a mano con servi_app: activar una inactiva al tope da SL024", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await caso(tx);
      await conPlan(tx, c.org, 1);
      const primera = creada(await c.crear());
      await c.repo.setEstado(primera.id, "inactiva", null);
      creada(await c.crear());
      await comoApp(tx, c.org);
      const error = await capturar(tx, () => tx.$executeRawUnsafe(`UPDATE "api_key" SET "estado" = 'activa' WHERE "id" = $1`, primera.id));
      const rol = await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`);
      return { sqlstate: sqlstateDe(error), rol: rol[0].r, details: topeDe(error).details };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.sqlstate).toBe("SL024");
    expect(r.details).toMatchObject({ tope: "api_keys", maximo: 1, usados: 1, pedidas: 1 });
  });

  it("sin tope de API keys (NULL) no hay límite; sin plan tampoco (R14)", async () => {
    const r = await revertida(base, async (tx) => {
      const conPlanSinTope = await caso(tx);
      await conPlan(tx, conPlanSinTope.org, null);
      for (let i = 0; i < 3; i += 1) creada(await conPlanSinTope.crear());
      const sinPlan = await caso(tx);
      for (let i = 0; i < 3; i += 1) creada(await sinPlan.crear());
      return { conPlanSinTope: await conPlanSinTope.activas(), sinPlan: await sinPlan.activas() };
    });
    expect(r).toEqual({ conPlanSinTope: 3, sinPlan: 3 });
  });
});
