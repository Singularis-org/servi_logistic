import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import {
  ArranqueSuperadminRepository,
  CLAVE_LOCK_ARRANQUE_SUPERADMIN,
} from "@/lib/repositories/ArranqueSuperadminRepository";
import { ArranqueSuperadminService } from "@/lib/services/ArranqueSuperadminService";
import type { VariableArranqueSuperadmin } from "@/lib/types/arranque-superadmin";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";
import {
  CLAVE_LOCK_SUPERADMIN,
  exigirSinSuperadmin,
  idDeRol,
  insertarUsuario,
  intentar,
  tomarLockDeSuperadmin,
} from "./_fixtures/superadmin-32";

// SL-32 / T8 (R12, R14, R15, R17, R27) — el comando de arranque contra Postgres real.
//
// Los casos que tienen que confirmar (crear, repetir, dos ejecuciones a la vez, otro escritor que
// gana la carrera) van con el cliente de la APP: el de produccion, con la extension de empresa, que
// exige el `organizacionId: null` escrito (R35 de SL-17). Commitean bajo el lock de la 227 y cada
// caso borra su superadmin al acabar. Los que no deben escribir nada (conflicto, catalogo sin rol)
// corren en una transaccion revertida.
//
// El archivo toma el lock de `tomarLockDeSuperadmin` en `beforeAll` y exige una base sin
// superadmin: commitea el suyo, y el hueco del indice de R27 es uno solo para toda la base.
//
// Datos propios: emails `@example.com` y documentos con un sufijo aleatorio.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");
const TSX_CLI = path.join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs");
const PASSWORD = "Prueba#2026sl32";

let base: PrismaClient;
let app: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

function sufijo(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Un entorno valido con email y documento que no son de nadie. */
function entorno(cambios: Partial<Record<VariableArranqueSuperadmin, string>> = {}) {
  const s = sufijo();
  return {
    SUPERADMIN_EMAIL: `sl32t8-${s}@example.com`,
    SUPERADMIN_PASSWORD: PASSWORD,
    SUPERADMIN_NOMBRE: "Superadmin de prueba SL-32",
    SUPERADMIN_TELEFONO: "88880000",
    SUPERADMIN_DOCUMENTO: `sl32t8-${s}`,
    SUPERADMIN_TIPO_DOCUMENTO: "cedula",
    ...cambios,
  } satisfies Record<VariableArranqueSuperadmin, string>;
}

function servicio(cliente: Pick<PrismaClient, "$transaction">): ArranqueSuperadminService {
  return new ArranqueSuperadminService(new ArranqueSuperadminRepository(cliente));
}

type FilaSuperadmin = {
  id: string;
  email: string;
  cedula: string;
  estado: string;
  organizacion_id: string | null;
  password_hash: string;
  tipo: string;
  fila: Record<string, unknown>;
};

/** Los superadmins de la base, con la fila entera en JSON para comparar «sin escrituras». */
async function superadmins(cliente: Pick<PrismaClient, "$queryRawUnsafe">): Promise<FilaSuperadmin[]> {
  return cliente.$queryRawUnsafe<FilaSuperadmin[]>(
    `SELECT u."id", u."email", u."cedula", u."estado"::text AS estado, u."organizacion_id", u."password_hash",
            ti."value" AS tipo, to_jsonb(u.*) AS fila
       FROM "usuario" u
       JOIN "rol" r ON r."id" = u."rol_id"
       JOIN "tipo_identificacion" ti ON ti."id" = u."tipo_identificacion_id"
      WHERE r."value"::text = 'superadmin'
      ORDER BY u."created_at"`,
  );
}

async function contarUsuarios(cliente: Pick<PrismaClient, "$queryRawUnsafe">): Promise<number> {
  const [fila] = await cliente.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "usuario"`);
  return fila.n;
}

/** Borra el superadmin que haya dejado el caso. Con el lock tomado y la base exigida sin el, es nuestro. */
async function borrarSuperadmins(): Promise<void> {
  await bajoLockDeEscrituraReal(() =>
    base.$executeRawUnsafe(
      `DELETE FROM "usuario" WHERE "rol_id" = (SELECT "id" FROM "rol" WHERE "value"::text = 'superadmin')`,
    ),
  );
}

/** El comando de verdad, en su propio proceso, como lo corre `pnpm arranque:superadmin`. */
function correrComando(
  variables: Record<string, string>,
): Promise<{ codigo: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [TSX_CLI, "scripts/arranque-superadmin.ts"], {
      cwd: RAIZ,
      // DATABASE_URL explicita: el hijo no puede ir a otra base que la del test.
      env: { ...process.env, DATABASE_URL: urlDeBaseDeDatos(), ...variables },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    hijo.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    hijo.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    hijo.on("error", reject);
    hijo.on("close", (codigo) => resolve({ codigo, stdout, stderr }));
  });
}

/** Espera a que `sql` (un `count(*)::int AS n`) de mas de 0; lanza con `motivo` si no llega. */
async function esperarHasta(observador: PrismaClient, sql: string, motivo: string): Promise<void> {
  const limite = Date.now() + 20_000;
  while (Date.now() < limite) {
    const [fila] = await observador.$queryRawUnsafe<{ n: number }[]>(sql);
    if (fila.n > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(motivo);
}

const INSERT_BLOQUEADO = `SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND wait_event_type = 'Lock'
    AND query ILIKE 'INSERT INTO "public"."usuario"%'`;

// Un lock de aviso con clave de 64 bits sale en `pg_locks` partido en `classid` (32 altos) y `objid`
// (32 bajos), con `objsubid = 1`. La clave cabe en 32 bits: `classid = 0`.
const ESPERA_AL_CERROJO = `SELECT count(*)::int AS n FROM pg_locks
  WHERE locktype = 'advisory' AND NOT granted
    AND classid = 0 AND objid = ${CLAVE_LOCK_ARRANQUE_SUPERADMIN} AND objsubid = 1`;

/** Contexto de un caso que no debe escribir: transaccion revertida y serializada. */
function enCasoRevertido<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  return enTransaccionRevertida(base, async (tx) => {
    await serializarEscriturasReales(tx);
    return fn(tx);
  });
}

describeSiHayBase("SL-32 — el comando de arranque del superadmin contra Postgres (R12-R17)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(crearPrismaDeTest(), async () => null);
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(base);
  });

  afterEach(async () => {
    await borrarSuperadmins();
  });

  afterAll(async () => {
    try {
      await borrarSuperadmins();
    } finally {
      await soltarSuperadmin();
      await app?.$disconnect();
      await base?.$disconnect();
    }
  });

  it("el cerrojo del comando no es el del test: con el mismo, el comando esperaria al test", () => {
    expect(CLAVE_LOCK_ARRANQUE_SUPERADMIN).not.toBe(CLAVE_LOCK_SUPERADMIN);
  });

  it("la primera ejecucion crea el superadmin activo, sin empresa y con el hash de la contrasena (R12)", async () => {
    const env = entorno();

    const r = await bajoLockDeEscrituraReal(() => servicio(app).arrancar(env));

    expect(r).toEqual({ status: "creado" });
    const filas = await superadmins(base);
    expect(filas).toHaveLength(1);
    const [s] = filas;
    expect(s.email).toBe(env.SUPERADMIN_EMAIL);
    expect(s.cedula).toBe(env.SUPERADMIN_DOCUMENTO);
    expect(s.tipo).toBe("cedula");
    expect(s.estado).toBe("activo");
    expect(s.organizacion_id).toBeNull();
    expect(s.password_hash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, s.password_hash)).toBe(true);
    expect(s.fila).toMatchObject({ zona_id: null, vehiculo_id: null, placa: null, fulfillment: false });
  });

  it("repetida, da ya_existe y no escribe nada: ni la contrasena, ni el nombre, ni ningun otro campo (R14)", async () => {
    // Un solo tramo del lock de escritura real, de la primera ejecucion a la ultima lectura: el
    // recuento es de la base ENTERA, y entre dos tramos sueltos otro archivo que respeta el lock
    // (la demo de SL-43 crea y borra usuarios) podia commitear y moverlo sin que el comando escribiera.
    const { r, antes, usuariosAntes, despues, usuariosDespues } = await bajoLockDeEscrituraReal(async () => {
      await servicio(app).arrancar(entorno());
      const filasAntes = await superadmins(base);
      const totalAntes = await contarUsuarios(base);

      const repetida = await servicio(app).arrancar(
        entorno({ SUPERADMIN_PASSWORD: "OtraPrueba#2026x", SUPERADMIN_NOMBRE: "Otro nombre", SUPERADMIN_TELEFONO: "77770000" }),
      );
      return {
        r: repetida,
        antes: filasAntes,
        usuariosAntes: totalAntes,
        despues: await superadmins(base),
        usuariosDespues: await contarUsuarios(base),
      };
    });

    expect(r).toEqual({ status: "ya_existe" });
    expect(antes).toHaveLength(1);
    expect(despues).toEqual(antes);
    expect(usuariosDespues).toBe(usuariosAntes);
  });

  it.each(["email", "documento"] as const)(
    "con el %s ocupado por otro usuario da conflicto, sin crear nada ni cambiar el rol del otro (R15)",
    async (campo) => {
      const r = await enCasoRevertido(async (tx) => {
        const rolMaestro = await idDeRol(tx, "maestro");
        const otro = await insertarUsuario(tx, rolMaestro, "por_defecto");
        if (!otro.desenlace.ok) throw new Error(`no se sembro el otro usuario: ${JSON.stringify(otro.desenlace)}`);
        const [{ email, cedula }] = await tx.$queryRawUnsafe<{ email: string; cedula: string }[]>(
          `SELECT "email", "cedula" FROM "usuario" WHERE "id" = $1`,
          otro.id,
        );
        const usuariosAntes = await contarUsuarios(tx);

        const desenlace = await servicio(clienteConTransaccionAnidada(tx)).arrancar(
          campo === "email" ? entorno({ SUPERADMIN_EMAIL: email }) : entorno({ SUPERADMIN_DOCUMENTO: cedula }),
        );

        const [{ rol }] = await tx.$queryRawUnsafe<{ rol: string }[]>(
          `SELECT r."value"::text AS rol FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id" WHERE u."id" = $1`,
          otro.id,
        );
        return { desenlace, rol, superadmins: await superadmins(tx), usuarios: (await contarUsuarios(tx)) - usuariosAntes };
      });

      expect(r.desenlace).toEqual({ status: "conflicto", campo });
      expect(r.rol).toBe("maestro");
      expect(r.superadmins).toEqual([]);
      expect(r.usuarios).toBe(0);
    },
  );

  it("sin el tipo de documento en el catalogo da catalogo_incompleto y no crea nada", async () => {
    const r = await servicio(app).arrancar(entorno({ SUPERADMIN_TIPO_DOCUMENTO: "inexistente-sl32" }));

    expect(r).toEqual({ status: "catalogo_incompleto", falta: "tipo_identificacion" });
    expect(await superadmins(base)).toEqual([]);
  });

  it("sin el rol superadmin en el catalogo da catalogo_incompleto y no crea nada", async () => {
    const r = await enCasoRevertido(async (tx) => {
      const borrado = await intentar(tx, `DELETE FROM "rol" WHERE "value"::text = 'superadmin'`);
      if (!borrado.ok) throw new Error(`no se pudo apartar el rol: ${JSON.stringify(borrado)}`);
      const usuariosAntes = await contarUsuarios(tx);
      const desenlace = await servicio(clienteConTransaccionAnidada(tx)).arrancar(entorno());
      return { desenlace, usuarios: (await contarUsuarios(tx)) - usuariosAntes };
    });

    expect(r.desenlace).toEqual({ status: "catalogo_incompleto", falta: "rol" });
    expect(r.usuarios).toBe(0);
  });

  it(
    "el comando toma el cerrojo antes de comprobar nada: espera a quien lo tiene y despues ve su superadmin (R17)",
    async () => {
      const observador = crearPrismaDeTest();
      try {
        const r = await bajoLockDeEscrituraReal(async () => {
          let comando: Promise<unknown> | undefined;
          // Esta transaccion hace de una primera ejecucion: tiene el cerrojo y crea su superadmin. La
          // segunda (el comando) tiene que quedarse esperando el cerrojo, no en el indice.
          await base.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ARRANQUE_SUPERADMIN})`);
              comando = servicio(app).arrancar(entorno());
              comando.catch(() => {});
              await esperarHasta(observador, ESPERA_AL_CERROJO, "el comando no espero al cerrojo de R17");
              const rolSuperadmin = await idDeRol(tx, "superadmin");
              const primero = await insertarUsuario(tx, rolSuperadmin, null);
              if (!primero.desenlace.ok) throw new Error(`no se sembro el primero: ${JSON.stringify(primero.desenlace)}`);
            },
            { timeout: 30_000, maxWait: 15_000 },
          );
          return comando;
        });

        expect(r).toEqual({ status: "ya_existe" });
        expect(await superadmins(base)).toHaveLength(1);
      } finally {
        await observador.$disconnect();
      }
    },
    60_000,
  );

  it(
    "dos ejecuciones del comando a la vez dejan un solo superadmin y terminan las dos con codigo 0 (R17)",
    async () => {
      const env = entorno();

      const [a, b] = await bajoLockDeEscrituraReal(() => Promise.all([correrComando(env), correrComando(env)]));

      expect([a.codigo, b.codigo]).toEqual([0, 0]);
      expect([a.stdout.trim(), b.stdout.trim()].sort()).toEqual(
        ["Superadmin creado.", "Ya existe un superadmin. No se ha cambiado nada."].sort(),
      );
      const todo = a.stdout + a.stderr + b.stdout + b.stderr;
      for (const valor of [PASSWORD, env.SUPERADMIN_EMAIL, env.SUPERADMIN_DOCUMENTO]) {
        expect(todo).not.toContain(valor);
      }
      const filas = await superadmins(base);
      expect(filas).toHaveLength(1);
      expect(filas[0].email).toBe(env.SUPERADMIN_EMAIL);
    },
    90_000,
  );

  it(
    "si otro escritor confirma un superadmin entre las comprobaciones y el INSERT, el P2002 del indice es ya_existe (R17, R27)",
    async () => {
      const observador = crearPrismaDeTest();
      try {
        const r = await bajoLockDeEscrituraReal(async () => {
          let comando: Promise<unknown> | undefined;
          // El otro escritor no pasa por el cerrojo del comando: su INSERT queda sin confirmar mientras
          // el comando comprueba (no lo ve), y el INSERT del comando espera en el indice hasta que el
          // otro confirma. Entonces Postgres le responde 23505 por `usuario_un_solo_superadmin`.
          await base.$transaction(
            async (tx) => {
              const rolSuperadmin = await idDeRol(tx, "superadmin");
              const otro = await insertarUsuario(tx, rolSuperadmin, null);
              if (!otro.desenlace.ok) throw new Error(`no se sembro el otro superadmin: ${JSON.stringify(otro.desenlace)}`);
              comando = servicio(app).arrancar(entorno());
              // Sin un rechazo sin manejar si el comando fallara antes de que lo esperemos.
              comando.catch(() => {});
              await esperarHasta(
                observador,
                INSERT_BLOQUEADO,
                "el comando no llego a bloquearse en su INSERT: el caso no probaria el P2002",
              );
            },
            { timeout: 30_000, maxWait: 15_000 },
          );
          return comando;
        });

        expect(r).toEqual({ status: "ya_existe" });
        expect(await superadmins(base)).toHaveLength(1);
      } finally {
        await observador.$disconnect();
      }
    },
    60_000,
  );
});
