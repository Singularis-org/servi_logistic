import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { ModulosActivosRepository } from "@/lib/repositories/ModulosActivosRepository";
import { OrganizacionRepository } from "@/lib/repositories/OrganizacionRepository";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import { comoApp, datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-23 / T2 (design §4.1) — la tabla `organizacion_modulo` contra Postgres real, con dos empresas:
//   · R4: un módulo está encendido si y solo si tiene fila; una fila como mucho por empresa y módulo.
//   · R7, R25: cada empresa ve solo sus filas (por el cliente de la app y por SQL a mano) y no escribe
//     ninguna, ni las suyas: `INSERT`, `UPDATE` y `DELETE` con `servi_app` dan 42501.
//   · R25: quitar un módulo de A no toca el de B.
//   · R6: un alta por `OrganizacionService` deja la empresa sin ninguna fila.
//
// POR QUE `comoApp` Y EL CLIENTE DE LA APP. La conexión del test es la del dueño de las tablas: con ella
// la RLS no actúa y los privilegios no cuentan. El SQL a mano baja a `servi_app` con `comoApp`; la
// lectura por modelo pasa por `conAislamientoPorEmpresa` + `conEmpresa`, que es lo que hace la app.
//
// SIEMBRA OBLIGATORIA. Las activaciones de A y B se commitean en `beforeAll` como dueño (la escritura
// real es del superadmin, que corre como dueño; su servicio es T6) y se COMPRUEBAN: si no están, el
// `beforeAll` falla y con él todo el archivo. Ningún caso puede pasar «porque no había nada».
//
// Mutaciones (progress/impl_SL-23.md, Tanda 1): sin la política, B ve las filas de A; sin el REVOKE,
// los INSERT/DELETE de `servi_app` sobre su propia empresa dejan de dar 42501; sin el único, entra un
// duplicado.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Lo que enciende cada empresa en la siembra. Distinto a propósito: «ve solo lo suyo» no es un vacío. */
const DE_A = ["analitica", "ranking"] as const;
const DE_B = ["ranking", "monitoreo"] as const;

let base: PrismaClient;
let app: PrismaClient;
let A: string;
let B: string;
const empresasCreadas: string[] = [];

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transacción del dueño que siempre se revierte. El lock de aviso de la 227 va primero. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** SQLSTATE de un error de SQL a mano por Prisma 7 + adapter-pg (P2010 con la causa del driver). */
function sqlstateDe(e: unknown): string {
  const o = e as { message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } };
  const causa = o.meta?.driverAdapterError?.cause;
  return (
    causa?.originalCode ??
    causa?.code ??
    /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ??
    `?? ${String(o.message ?? e).slice(0, 160)}`
  );
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transacción del caso. SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

/** Los módulos de una empresa medidos como dueño, sin RLS, en el orden del enum. */
async function modulosComoDueno(c: TxDeTest | PrismaClient, organizacionId: string): Promise<string[]> {
  const filas = await c.$queryRawUnsafe<{ m: string }[]>(
    `SELECT "modulo"::text AS m FROM "organizacion_modulo" WHERE "organizacion_id" = $1 ORDER BY "modulo"`,
    organizacionId,
  );
  return filas.map((f) => f.m);
}

/** Lo que ve `servi_app` con la empresa fijada: `[organizacion_id, modulo]`, sin filtro en el texto. */
async function loQueVeLaApp(tx: TxDeTest): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ o: string; m: string }[]>(
    `SELECT "organizacion_id" AS o, "modulo"::text AS m FROM "organizacion_modulo" ORDER BY "modulo"`,
  );
  return filas.map((f) => `${f.o}:${f.m}`);
}

const enOrdenDelEnum = (ms: readonly string[]) => {
  const orden = ["analitica", "monitoreo", "ranking"];
  return [...ms].sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
};

describeSiHayBase("SL-23 — organizacion_modulo: estado por empresa, RLS y solo lectura (R4, R6, R7, R25)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    await bajoLockDeEscrituraReal(async () => {
      for (const [modulos, fijar] of [
        [DE_A, (id: string) => (A = id)],
        [DE_B, (id: string) => (B = id)],
      ] as const) {
        const { id } = await base.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
        empresasCreadas.push(id);
        fijar(id);
        await base.organizacionModulo.createMany({
          data: modulos.map((modulo) => ({ organizacionId: id, modulo })),
        });
      }
    });
    expect(await modulosComoDueno(base, A)).toEqual(enOrdenDelEnum(DE_A));
    expect(await modulosComoDueno(base, B)).toEqual(enOrdenDelEnum(DE_B));
  }, 60_000);

  afterAll(async () => {
    if (!base) return;
    const ids = empresasCreadas.filter(Boolean);
    const usuarios = await base.usuario.findMany({ where: { organizacionId: { in: ids } }, select: { id: true } });
    const uids = usuarios.map((u) => u.id);
    // Las activaciones caen con su empresa (ON DELETE CASCADE, design §4.1).
    await bajoLockDeEscrituraReal(async () => {
      await base.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: uids } } });
      await base.premioRanking.deleteMany({ where: { organizacionId: { in: ids } } });
      await base.usuario.deleteMany({ where: { id: { in: uids } } });
      await base.organizacion.deleteMany({ where: { id: { in: ids } } });
    });
    await base.$disconnect();
  }, 120_000);

  it("R4, R25 — por el cliente de la app, cada empresa lee exactamente sus módulos encendidos", async () => {
    const leer = (id: string) =>
      conEmpresa(id, () =>
        app.organizacionModulo.findMany({ select: { organizacionId: true, modulo: true }, orderBy: { modulo: "asc" } }),
      );
    expect(await leer(A)).toEqual(enOrdenDelEnum(DE_A).map((modulo) => ({ organizacionId: A, modulo })));
    expect(await leer(B)).toEqual(enOrdenDelEnum(DE_B).map((modulo) => ({ organizacionId: B, modulo })));
  });

  it("R4 — sin fila, el módulo está apagado: A no tiene `monitoreo` aunque B sí", async () => {
    const encendido = (id: string, modulo: "monitoreo" | "ranking") =>
      conEmpresa(id, async () => (await app.organizacionModulo.findFirst({ where: { modulo } })) !== null);
    expect(await encendido(A, "monitoreo")).toBe(false);
    expect(await encendido(B, "monitoreo")).toBe(true);
    expect(await encendido(A, "ranking")).toBe(true);
  });

  it("R4 — una fila como mucho por empresa y módulo: el duplicado da 23505 y un módulo distinto sí entra", async () => {
    await revertida(async (tx) => {
      expect(
        await intentar(tx, `INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo") VALUES ($1, $2, 'ranking')`, randomUUID(), A),
      ).toBe("23505");
      expect(
        await intentar(tx, `INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo") VALUES ($1, $2, 'monitoreo')`, randomUUID(), A),
      ).toBeNull();
      expect(await modulosComoDueno(tx, A)).toEqual(enOrdenDelEnum([...DE_A, "monitoreo"]));
    });
    expect(await modulosComoDueno(base, A)).toEqual(enOrdenDelEnum(DE_A));
  });

  it("R7 — SQL a mano con servi_app: B ve solo lo suyo, aunque pida las filas de A por su id", async () => {
    await revertida(async (tx) => {
      await comoApp(tx, B);
      expect(await loQueVeLaApp(tx)).toEqual(enOrdenDelEnum(DE_B).map((m) => `${B}:${m}`));
      const deA = await tx.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM "organizacion_modulo" WHERE "organizacion_id" = $1`,
        A,
      );
      expect(deA).toEqual([]);
    });
  });

  it("R7 — servi_app no escribe ninguna activación, ni de su empresa ni de otra: 42501", async () => {
    await revertida(async (tx) => {
      await comoApp(tx, A);
      // De su propia empresa: la RLS lo dejaría pasar; lo frena el REVOKE.
      expect(
        await intentar(tx, `INSERT INTO "organizacion_modulo" ("id", "modulo") VALUES ($1, 'monitoreo')`, randomUUID()),
      ).toBe("42501");
      expect(await intentar(tx, `DELETE FROM "organizacion_modulo" WHERE "modulo" = 'ranking'`)).toBe("42501");
      expect(
        await intentar(tx, `UPDATE "organizacion_modulo" SET "modulo" = 'monitoreo' WHERE "modulo" = 'ranking'`),
      ).toBe("42501");
      // De otra empresa.
      expect(
        await intentar(
          tx,
          `INSERT INTO "organizacion_modulo" ("id", "organizacion_id", "modulo") VALUES ($1, $2, 'monitoreo')`,
          randomUUID(),
          B,
        ),
      ).toBe("42501");
      expect(await intentar(tx, `DELETE FROM "organizacion_modulo" WHERE "organizacion_id" = $1`, B)).toBe("42501");
    });
    expect(await modulosComoDueno(base, A)).toEqual(enOrdenDelEnum(DE_A));
    expect(await modulosComoDueno(base, B)).toEqual(enOrdenDelEnum(DE_B));
  });

  it("R7 — por el cliente de la app en contexto de empresa tampoco se escribe, y la base no cambia", async () => {
    const rechazo = /42501|permiso denegado|permission denied/;
    await expect(
      conEmpresa(A, () => app.organizacionModulo.create({ data: { modulo: "monitoreo" } })),
    ).rejects.toThrow(rechazo);
    await expect(
      conEmpresa(A, () => app.organizacionModulo.deleteMany({ where: { modulo: "ranking" } })),
    ).rejects.toThrow(rechazo);
    expect(await modulosComoDueno(base, A)).toEqual(enOrdenDelEnum(DE_A));
  });

  it("R9, R25 — ModulosActivosRepository (la lectura de las puertas) da los de la empresa en curso; sin empresa no consulta", async () => {
    const repo = new ModulosActivosRepository(app);
    expect(enOrdenDelEnum(await conEmpresa(A, () => repo.activos()))).toEqual(enOrdenDelEnum(DE_A));
    expect(enOrdenDelEnum(await conEmpresa(B, () => repo.activos()))).toEqual(enOrdenDelEnum(DE_B));
    // Sin contexto ni sesión (el resolutor del cliente de la app devuelve null): falla cerrado.
    await expect(repo.activos()).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });

  it("R25 — quitar `ranking` a A no cambia nada en B", async () => {
    await revertida(async (tx) => {
      const borradas = await tx.$executeRawUnsafe(
        `DELETE FROM "organizacion_modulo" WHERE "organizacion_id" = $1 AND "modulo" = 'ranking'`,
        A,
      );
      expect(borradas).toBe(1);
      expect(await modulosComoDueno(tx, A)).toEqual(enOrdenDelEnum(DE_A.filter((m) => m !== "ranking")));
      expect(await modulosComoDueno(tx, B)).toEqual(enOrdenDelEnum(DE_B));
      await comoApp(tx, B);
      expect(await loQueVeLaApp(tx)).toEqual(enOrdenDelEnum(DE_B).map((m) => `${B}:${m}`));
    });
  });

  it("R6 — una empresa dada de alta por OrganizacionService nace sin ningún módulo encendido", async () => {
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
    const servicio = new OrganizacionService(new OrganizacionRepository(app));
    const r = await bajoLockDeEscrituraReal(() =>
      comoPlataforma("SL-23", "test: alta sin módulos (R6)", () =>
        servicio.altaEmpresa({
          nombre: `Empresa sl23 ${sufijo}`,
          slug: `sl23-alta-${sufijo}`,
          maestro: {
            nombre: "Maestra de prueba",
            email: `sl23-alta-${sufijo}@ejemplo.test`,
            telefono: "88887777",
            documento: `doc-sl23-${sufijo}`,
            tipoDocumento: "cedula",
          },
        }),
      ),
    );
    expect(r.estado).toBe("creada");
    if (r.estado !== "creada") return;
    empresasCreadas.push(r.organizacionId);

    // Control: la empresa existe y el alta escribió (su maestro); si no, «cero módulos» no diría nada.
    expect(await base.organizacion.count({ where: { id: r.organizacionId } })).toBe(1);
    expect(await base.usuario.count({ where: { organizacionId: r.organizacionId } })).toBe(1);
    expect(await modulosComoDueno(base, r.organizacionId)).toEqual([]);
    expect(
      await conEmpresa(r.organizacionId, () => app.organizacionModulo.count()),
    ).toBe(0);
  }, 60_000);
});
