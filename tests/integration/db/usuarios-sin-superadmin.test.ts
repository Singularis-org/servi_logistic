import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { UserRepository } from "@/lib/repositories/UserRepository";
import { UsuarioService } from "@/lib/services/UsuarioService";
import type { Actor } from "@/lib/interfaces/services/IUsuarioService";
import { listarUsuariosSchema } from "@/lib/types/usuario";
import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  idDeRol,
  insertarUsuario,
  liberarHuecoDeSuperadmin,
  tomarLockDeSuperadmin,
} from "./_fixtures/superadmin-32";

// SL-32 / T7 (R10) — el `WHERE` del listado de usuarios deja fuera al superadmin, contra Postgres.
//
// Los tests del servicio usan dobles y no ven el SQL: quitar el `notIn` del `where` de
// `UserRepository.list` los deja en verde. Aqui el repositorio REAL corre sobre la transaccion del
// test con el cliente BASE (sin la extension de empresa), asi que lo unico que puede dejar fuera al
// superadmin es ese `where`.
//
// Datos propios: un superadmin sin empresa y un mensajero con la empresa del test, los dos con un
// sufijo unico en el nombre. Todo en una transaccion revertida. El archivo toma el lock de
// `tomarLockDeSuperadmin` (crea un superadmin) y, en cada caso, el de la 227 como primera sentencia.
//
// Mutacion de T7: sin `notIn: [...ROLES_PLATAFORMA]` en `UserRepository.list` caen todos los casos.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `sl32t7${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const MAESTRO: Actor = { usuarioId: "maestro-t7", rol: "maestro" };
const TAKE_TODO = 2000;

let prisma: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

interface Contexto {
  tx: TxDeTest;
  repo: UserRepository;
  servicio: UsuarioService;
  superadminId: string;
  mensajeroId: string;
}

/** Siembra el superadmin y el mensajero, y corre `fn` con el repositorio real sobre `tx`. */
function conDatos<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    await serializarEscriturasReales(tx);
    const rolSuperadmin = await idDeRol(tx, "superadmin");
    const rolMensajero = await idDeRol(tx, "mensajero");
    await liberarHuecoDeSuperadmin(tx, rolSuperadmin);

    const superadmin = await insertarUsuario(tx, rolSuperadmin, null);
    const mensajero = await insertarUsuario(tx, rolMensajero, "por_defecto");
    if (!superadmin.desenlace.ok || !mensajero.desenlace.ok) {
      throw new Error(`no se sembraron los dos usuarios: ${JSON.stringify([superadmin.desenlace, mensajero.desenlace])}`);
    }
    // El sufijo en el nombre de los dos: buscarlo devuelve solo lo sembrado aqui.
    await tx.$executeRawUnsafe(
      `UPDATE "usuario" SET "nombre" = 'Prueba ' || $1 WHERE "id" = ANY($2::text[])`,
      SUFIJO,
      [superadmin.id, mensajero.id],
    );

    const repo = new UserRepository(clienteConTransaccionAnidada(tx));
    return fn({ tx, repo, servicio: new UsuarioService(repo), superadminId: superadmin.id, mensajeroId: mensajero.id });
  });
}

/** Cuantos usuarios hay, con y sin el superadmin, por SQL a mano (no por el `where` bajo prueba). */
async function conteos(tx: TxDeTest): Promise<{ todos: number; deEmpresa: number }> {
  const [fila] = await tx.$queryRawUnsafe<{ todos: number; de_empresa: number }[]>(
    `SELECT count(*)::int AS todos,
            count(*) FILTER (WHERE r."value"::text <> 'superadmin')::int AS de_empresa
       FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id"`,
  );
  return { todos: fila.todos, deEmpresa: fila.de_empresa };
}

describeSiHayBase("SL-32 — el listado de usuarios no devuelve ni cuenta al superadmin (R10)", () => {
  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });

  afterAll(async () => {
    await soltarSuperadmin();
    await prisma?.$disconnect();
  });

  it("los datos estan: el superadmin existe en la base, sin empresa, y el mensajero con la suya", async () => {
    const filas = await conDatos(async ({ tx, superadminId, mensajeroId }) =>
      tx.$queryRawUnsafe<{ id: string; org: string | null; rol: string }[]>(
        `SELECT u."id", u."organizacion_id" AS org, r."value"::text AS rol
           FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id"
          WHERE u."id" = ANY($1::text[]) ORDER BY r."value"::text`,
        [superadminId, mensajeroId],
      ),
    );
    expect(filas.map((f) => f.rol)).toEqual(["mensajero", "superadmin"]);
    expect(filas[0].org).not.toBeNull();
    expect(filas[1].org).toBeNull();
  });

  it("con busqueda por el sufijo: solo el mensajero, y el total es 1", async () => {
    const r = await conDatos(async ({ repo, mensajeroId }) => ({
      lista: await repo.list({ skip: 0, take: 50, busqueda: SUFIJO }),
      mensajeroId,
    }));
    expect(r.lista.items.map((u) => u.id)).toEqual([r.mensajeroId]);
    expect(r.lista.total).toBe(1);
  });

  it("sin filtros: no sale el superadmin y el total es el de los usuarios de empresa", async () => {
    const r = await conDatos(async ({ tx, repo, superadminId, mensajeroId }) => ({
      lista: await repo.list({ skip: 0, take: TAKE_TODO }),
      cuenta: await conteos(tx),
      superadminId,
      mensajeroId,
    }));
    // El superadmin esta en la base: el total de abajo no coincide con «todos» por casualidad.
    expect(r.cuenta.todos).toBe(r.cuenta.deEmpresa + 1);
    expect(r.cuenta.todos).toBeLessThanOrEqual(TAKE_TODO);
    const ids = r.lista.items.map((u) => u.id);
    expect(ids).toContain(r.mensajeroId);
    expect(ids).not.toContain(r.superadminId);
    expect(r.lista.total).toBe(r.cuenta.deEmpresa);
  });

  it("con filtro por rol: el de mensajero trae al mensajero, y uno que pida superadmin no trae nada", async () => {
    const r = await conDatos(async ({ repo, mensajeroId }) => ({
      mensajeros: await repo.list({ skip: 0, take: TAKE_TODO, busqueda: SUFIJO, roles: ["mensajero"] }),
      // El borde ya rechaza `rol=superadmin` (R10); aqui se pide al repositorio directamente para
      // ver que el `where` no lo deja pasar ni asi.
      superadmins: await repo.list({ skip: 0, take: TAKE_TODO, roles: ["superadmin", "mensajero"], busqueda: SUFIJO }),
      soloSuperadmin: await repo.list({ skip: 0, take: TAKE_TODO, roles: ["superadmin"] }),
      mensajeroId,
    }));
    expect(r.mensajeros.items.map((u) => u.id)).toEqual([r.mensajeroId]);
    expect(r.superadmins.items.map((u) => u.id)).toEqual([r.mensajeroId]);
    expect(r.superadmins.total).toBe(1);
    expect(r.soloSuperadmin).toEqual({ items: [], total: 0 });
  });

  it("por el servicio, listar y listarCompleto (la descarga) tampoco lo traen ni lo cuentan", async () => {
    const r = await conDatos(async ({ servicio, superadminId }) => ({
      listar: await servicio.listar(listarUsuariosSchema.parse({ q: SUFIJO, pageSize: 100 }), MAESTRO),
      completo: await servicio.listarCompleto({ q: SUFIJO, sortBy: "createdAt", sortDir: "desc" }, MAESTRO),
      superadminId,
    }));
    expect(r.listar.status === "ok" && r.listar.total).toBe(1);
    expect(r.listar.status === "ok" && r.listar.items.map((u) => u.id)).not.toContain(r.superadminId);
    expect(r.completo.status === "ok" && r.completo.total).toBe(1);
    expect(r.completo.status === "ok" && r.completo.items.map((u) => u.id)).not.toContain(r.superadminId);
  });
});
