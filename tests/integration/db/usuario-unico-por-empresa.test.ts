import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import {
  UsuarioDuplicadoError,
  type CreateUsuarioInput,
} from "@/lib/interfaces/repositories/IUserRepository";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { ApiKeyService } from "@/lib/services/ApiKeyService";
import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";
import { idDeRol, liberarHuecoDeSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SL-18 T1.4/T1.5 — email y cedula de `usuario` unicos POR EMPRESA (migracion
// `20261026090000_usuario_unico_por_empresa`), contra Postgres real.
//
// DOS FORMAS DE MEDIR, cada una donde vale:
//   - R1, R2, R3 (plataforma + empresa) y R5 van por la tabla REAL y por el codigo real
//     (`UserRepository.create`, `ApiKeyService.generar`), en una transaccion que siempre se revierte.
//     El `$transaction` de los repositorios es un SAVEPOINT real (`clienteConSavepoint`), asi que un
//     duplicado deshace lo que el repositorio llego a escribir.
//   - R3 (dos cuentas sin empresa) y R4 van sobre un CLON de `usuario` en un esquema desechable, con
//     los indices copiados VIVOS de `public` (patron de SL-17 T3.9). En la tabla real, dos cuentas
//     sin empresa chocan antes con `usuario_un_solo_superadmin` (SL-32) y no se sabria si el
//     `NULLS NOT DISTINCT` del email hace su parte. Y el `down.sql` tiene que correr sobre algo que
//     no compartan los demas archivos de la suite.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

const RAIZ = path.resolve(__dirname, "../../..");
const MIGRACION = path.join(RAIZ, "db", "migrations", "20261026090000_usuario_unico_por_empresa");
const sqlDe = (archivo: "migration.sql" | "down.sql") => readFileSync(path.join(MIGRACION, archivo), "utf8");

/* -------------------------------------------------------------------------- */
/* Tabla real                                                                  */
/* -------------------------------------------------------------------------- */

interface Catalogos {
  rolMaestro: string;
  rolSuperadmin: string;
  tipoCedula: string;
}

async function catalogos(tx: TxDeTest): Promise<Catalogos> {
  const tipo = await tx.tipoIdentificacion.findFirstOrThrow({ where: { value: "cedula" }, select: { id: true } });
  return {
    rolMaestro: await idDeRol(tx, "maestro"),
    rolSuperadmin: await idDeRol(tx, "superadmin"),
    tipoCedula: tipo.id,
  };
}

function datosDeUsuario(c: Catalogos, tag: string, extra: Partial<CreateUsuarioInput> = {}): CreateUsuarioInput {
  return {
    nombre: `Persona ${tag} ${RUN}`,
    email: `sl18-${tag}-${RUN}@ejemplo.test`,
    telefono: "88887777",
    cedula: `sl18-${tag}-${RUN}`,
    tipoIdentificacionId: c.tipoCedula,
    rolId: c.rolMaestro,
    passwordHash: "no-utilizable",
    estado: "activo",
    ...extra,
  };
}

/**
 * Crea por el repositorio real en la empresa dada. `fijarEmpresa` pone el DEFAULT de
 * `organizacion_id` en la transaccion del test; `conEmpresa`, el contexto de la app.
 */
async function crearEn(tx: TxDeTest, org: string, datos: CreateUsuarioInput): Promise<string> {
  await fijarEmpresa(tx, org);
  const repo = new UserRepository(clienteConSavepoint(tx));
  return conEmpresa(org, async () => (await repo.create(datos, null)).id);
}

/** Como `crearEn`, pero devuelve el error con que falla (o `null`). */
async function errorAlCrearEn(tx: TxDeTest, org: string, datos: CreateUsuarioInput): Promise<unknown> {
  return crearEn(tx, org, datos).then(
    () => null,
    (e: unknown) => e,
  );
}

/** Prisma `create` en un SAVEPOINT: devuelve el codigo Prisma del error, o `null` si paso. */
async function codigoPrismaDe(tx: TxDeTest, fn: () => Promise<unknown>): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await fn();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return String((error as { code?: unknown }).code ?? (error as Error).message);
  }
}

describeSiHayBase("SL-18 — email y cedula de usuario, unicos por empresa (tabla real)", () => {
  let prisma: PrismaClient;
  let soltarSuperadmin: () => Promise<void> = async () => {};

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    // R3 aparta y crea el superadmin dentro de su transaccion revertida: el hueco unico (SL-32 R27)
    // es de este archivo mientras vive. Este lock va ANTES que el de la 227.
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });

  afterAll(async () => {
    await soltarSuperadmin();
    await prisma?.$disconnect();
  });

  /** Una transaccion revertida, serializada, con dos empresas nuevas y los catalogos. */
  function conDosEmpresas<T>(fn: (tx: TxDeTest, a: string, b: string, c: Catalogos) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const a = (await crearOrganizacion(tx, { nombre: `A ${RUN}` })).id;
      const b = (await crearOrganizacion(tx, { nombre: `B ${RUN}` })).id;
      return fn(tx, a, b, await catalogos(tx));
    });
  }

  it("R1: el mismo email y la misma cedula se crean en A y en B, cada cuenta en su empresa", async () => {
    const r = await conDosEmpresas(async (tx, a, b, c) => {
      const datos = datosDeUsuario(c, "r1");
      const enA = await crearEn(tx, a, datos);
      const enB = await crearEn(tx, b, { ...datos, nombre: `Otra persona ${RUN}` });
      const filas = await tx.usuario.findMany({
        where: { id: { in: [enA, enB] } },
        select: { id: true, email: true, cedula: true, organizacionId: true },
      });
      return { enA, enB, a, b, datos, filas };
    });

    expect(r.filas).toHaveLength(2);
    const porId = new Map(r.filas.map((f) => [f.id, f]));
    expect(porId.get(r.enA)).toMatchObject({ email: r.datos.email, cedula: r.datos.cedula, organizacionId: r.a });
    expect(porId.get(r.enB)).toMatchObject({ email: r.datos.email, cedula: r.datos.cedula, organizacionId: r.b });
  });

  it("R2: el email repetido en la MISMA empresa da UsuarioDuplicadoError('email') y no escribe", async () => {
    const r = await conDosEmpresas(async (tx, a, _b, c) => {
      const datos = datosDeUsuario(c, "r2-email");
      await crearEn(tx, a, datos);
      const error = await errorAlCrearEn(tx, a, { ...datos, cedula: `sl18-r2-otra-${RUN}` });
      const enA = await tx.usuario.count({ where: { email: datos.email, organizacionId: a } });
      const otraCedula = await tx.usuario.count({ where: { cedula: `sl18-r2-otra-${RUN}` } });
      return { error, enA, otraCedula };
    });

    expect(r.error).toEqual(new UsuarioDuplicadoError("email"));
    expect((r.error as UsuarioDuplicadoError).campo).toBe("email");
    expect(r.enA).toBe(1);
    expect(r.otraCedula).toBe(0);
  });

  it("R2: la cedula repetida en la MISMA empresa da UsuarioDuplicadoError('cedula') y no escribe", async () => {
    const r = await conDosEmpresas(async (tx, _a, b, c) => {
      const datos = datosDeUsuario(c, "r2-cedula");
      await crearEn(tx, b, datos);
      const otroEmail = `sl18-r2-otro-${RUN}@ejemplo.test`;
      const error = await errorAlCrearEn(tx, b, { ...datos, email: otroEmail });
      const enB = await tx.usuario.count({ where: { cedula: datos.cedula, organizacionId: b } });
      const conOtroEmail = await tx.usuario.count({ where: { email: otroEmail } });
      return { error, enB, conOtroEmail };
    });

    expect(r.error).toEqual(new UsuarioDuplicadoError("cedula"));
    expect((r.error as UsuarioDuplicadoError).campo).toBe("cedula");
    expect(r.enB).toBe(1);
    expect(r.conOtroEmail).toBe(0);
  });

  it("R3: el superadmin (sin empresa) entra con el email y la cedula de una cuenta de A; una segunda cuenta sin empresa con ese email da P2002", async () => {
    const r = await conDosEmpresas(async (tx, a, _b, c) => {
      // Una base de desarrollo puede traer su superadmin: se aparta dentro de esta transaccion.
      await liberarHuecoDeSuperadmin(tx, c.rolSuperadmin);
      const datos = datosDeUsuario(c, "r3");
      const deA = await crearEn(tx, a, datos);

      const superadmin = await codigoPrismaDe(tx, () =>
        tx.usuario.create({ data: { ...datos, rolId: c.rolSuperadmin, organizacionId: null } }),
      );
      // Otra cuenta sin empresa con el mismo email (y otra cedula): la base la rechaza.
      const segunda = await codigoPrismaDe(tx, () =>
        tx.usuario.create({
          data: { ...datos, cedula: `sl18-r3-otra-${RUN}`, rolId: c.rolSuperadmin, organizacionId: null },
        }),
      );
      const filas = await tx.usuario.findMany({
        where: { email: datos.email },
        select: { id: true, organizacionId: true, cedula: true },
      });
      return { deA, a, superadmin, segunda, filas, cedula: datos.cedula };
    });

    expect(r.superadmin).toBeNull();
    expect(r.segunda).toBe("P2002");
    expect(new Set(r.filas.map((f) => f.organizacionId))).toEqual(new Set([r.a, null]));
    expect(r.filas.every((f) => f.cedula === r.cedula)).toBe(true);
  });

  it("R5: la key «tienda-x» se crea en A y en B; repetida en A responde `conflict` y no escribe", async () => {
    const r = await conDosEmpresas(async (tx, a, b, c) => {
      const servicio = new ApiKeyService(new ApiKeyRepository(clienteConSavepoint(tx)));
      const generarEn = async (org: string, maestroId: string) => {
        await fijarEmpresa(tx, org);
        return conEmpresa(org, () =>
          servicio.generar({ identificador: "tienda-x", tiendaDestinoId: undefined }, { usuarioId: maestroId, rol: "maestro" }),
        );
      };
      const maestroA = await crearEn(tx, a, datosDeUsuario(c, "r5-maestro-a"));
      const maestroB = await crearEn(tx, b, datosDeUsuario(c, "r5-maestro-b"));

      const enA = await generarEn(a, maestroA);
      const enB = await generarEn(b, maestroB);
      const otraVezEnA = await generarEn(a, maestroA);

      const keys = await tx.apiKey.findMany({
        where: { slug: "tienda-x", organizacionId: { in: [a, b] } },
        select: { organizacionId: true, usuario: { select: { email: true, organizacionId: true } } },
      });
      return { a, b, enA, enB, otraVezEnA, keys };
    });

    expect(r.enA.status).toBe("ok");
    expect(r.enB.status).toBe("ok");
    // El email y la cedula sinteticos chocan los dos; cual salta primero depende del orden en que
    // Postgres recorre los indices (su OID), no del codigo. Medido: tras recrear `usuario_email_key`
    // (la mutacion de T1.4) sale `cedula`. Lo que R5 fija es el `conflict`, «igual que hoy».
    expect(r.otraVezEnA.status).toBe("conflict");
    expect(["email", "cedula"]).toContain((r.otraVezEnA as { campo?: string }).campo);
    // Una key por empresa, cada una con su cuenta sintetica en su empresa y el MISMO email.
    expect(r.keys).toHaveLength(2);
    expect(new Set(r.keys.map((k) => k.organizacionId))).toEqual(new Set([r.a, r.b]));
    for (const k of r.keys) {
      expect(k.usuario.organizacionId).toBe(k.organizacionId);
      expect(k.usuario.email).toBe("apikey+tienda-x@apikey.invalid");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Clon de `usuario` en un esquema desechable (R3 sin empresa, R4)              */
/* -------------------------------------------------------------------------- */

interface Conexion {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

interface Pool {
  connect(): Promise<{ query: Conexion["query"]; release(): void }>;
  end(): Promise<void>;
}

/**
 * UNA conexion fija sacada del pool del driver adapter (sin dependencia nueva): el `search_path`,
 * la transaccion y sus savepoints tienen que vivir en ella (igual que `unicos-por-empresa.test.ts`).
 */
async function conectar(): Promise<Conexion> {
  const adaptador = await new PrismaPg({ connectionString: urlDeBaseDeDatos() as string, max: 1 }).connect();
  const pool = adaptador.underlyingDriver() as unknown as Pool;
  const cliente = await pool.connect();
  return {
    query: (texto, valores) => cliente.query(texto, valores),
    end: async () => {
      cliente.release();
      await pool.end();
    },
  };
}

// El DDL de los esquemas desechables va bajo el lock de la 227, en sesion (SL-17 T4.3b).
const tomarLock = (c: Conexion) => c.query(`SELECT pg_advisory_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
const soltarLock = (c: Conexion) => c.query(`SELECT pg_advisory_unlock(${CLAVE_LOCK_ESCRITURA_REAL})`);

const INDICES_DE_LA_MIGRACION = ["usuario_email_key", "usuario_cedula_key", "usuario_email_idx"];

/** Clona `usuario` (sin FK, CHECK ni indices) y le copia, VIVOS de `public`, los de la migracion. */
async function clonarUsuario(c: Conexion, esquema: string): Promise<void> {
  await c.query(`CREATE SCHEMA "${esquema}"`);
  await c.query(`CREATE TABLE "${esquema}"."usuario" (LIKE public."usuario" INCLUDING DEFAULTS)`);
  const { rows } = await c.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [INDICES_DE_LA_MIGRACION],
  );
  // Sin esto, un nombre mal escrito dejaria la tabla sin indice y todo INSERT pasaria.
  expect(rows.map((r) => r.indexname).sort()).toEqual([...INDICES_DE_LA_MIGRACION].sort());
  for (const r of rows) {
    await c.query(String(r.indexdef).replace(/ ON public\./, ` ON "${esquema}".`));
  }
}

async function fotoDeIndices(c: Conexion, esquema: string): Promise<string[]> {
  const { rows } = await c.query(
    `SELECT replace(indexdef, $1, 'S.') AS l FROM pg_indexes WHERE schemaname = $2 ORDER BY 1`,
    [`${esquema}.`, esquema],
  );
  return rows.map((r) => String(r.l)).sort();
}

/** Una fila minima de `usuario` en el clon: sin FK, cualquier texto vale para los catalogos. */
function insertarEnClon(
  c: Conexion,
  esquema: string,
  v: { email: string; cedula: string; organizacionId: string | null },
): Promise<unknown> {
  return c.query(
    `INSERT INTO "${esquema}"."usuario"
       ("id", "nombre", "email", "telefono", "password_hash", "cedula", "tipo_identificacion_id", "rol_id",
        "updated_at", "organizacion_id")
     VALUES (gen_random_uuid()::text, 'Clon SL-18', $1, '88887777', 'x', $2, 'tipo', 'rol', now(), $3)`,
    [v.email, v.cedula, v.organizacionId],
  );
}

/** Corre `fn` en un savepoint y devuelve el SQLSTATE y el mensaje con que fallo, o `null` si paso. */
async function falloDe(c: Conexion, fn: () => Promise<unknown>): Promise<{ code: string; message: string } | null> {
  await c.query("SAVEPOINT caso");
  try {
    await fn();
    await c.query("RELEASE SAVEPOINT caso");
    return null;
  } catch (error) {
    await c.query("ROLLBACK TO SAVEPOINT caso");
    const e = error as { code?: unknown; message?: unknown; constraint?: unknown };
    return { code: String(e.code), message: `${String(e.message)} ${String(e.constraint ?? "")}` };
  }
}

const nuevoEsquema = (etiqueta: string) => `sl18_m1_${etiqueta}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

/** Lo que el `down.sql` deja: los dos unicos globales de antes, con su nombre (el contrato de R4). */
const GLOBALES_DEL_DOWN = [
  "CREATE UNIQUE INDEX usuario_cedula_key ON S.usuario USING btree (cedula)",
  "CREATE UNIQUE INDEX usuario_email_key ON S.usuario USING btree (email)",
].sort();

/** Lo que deja la migracion: los compuestos con la empresa primero y el indice del login (R25). */
const CON_LA_MIGRACION = [
  "CREATE INDEX usuario_email_idx ON S.usuario USING btree (email)",
  "CREATE UNIQUE INDEX usuario_cedula_key ON S.usuario USING btree (organizacion_id, cedula) NULLS NOT DISTINCT",
  "CREATE UNIQUE INDEX usuario_email_key ON S.usuario USING btree (organizacion_id, email) NULLS NOT DISTINCT",
].sort();

describeSiHayBase("SL-18 — los indices de la migracion, sobre un clon de usuario", () => {
  let c: Conexion;
  const esquema = nuevoEsquema("uq");

  beforeAll(async () => {
    c = await conectar();
    await tomarLock(c);
    try {
      await clonarUsuario(c, esquema);
    } finally {
      await soltarLock(c);
    }
    // Lo que sigue solo inserta en el clon, dentro de una transaccion que no se confirma.
    await c.query("BEGIN");
  }, 120_000);

  afterAll(async () => {
    if (!c) return;
    await c.query("ROLLBACK");
    await tomarLock(c);
    try {
      await c.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
    } finally {
      await soltarLock(c);
      await c.end();
    }
  }, 120_000);

  it("control: en public quedan los compuestos con organizacion_id primero, NULLS NOT DISTINCT, y usuario_email_idx", async () => {
    expect(await fotoDeIndices(c, esquema)).toEqual(CON_LA_MIGRACION);
  });

  it("R3: dos cuentas SIN empresa con el mismo email chocan en usuario_email_key (NULLS NOT DISTINCT)", async () => {
    const email = `sin-empresa-${RUN}@ejemplo.test`;
    expect(await falloDe(c, () => insertarEnClon(c, esquema, { email, cedula: `c1-${RUN}`, organizacionId: null }))).toBeNull();

    const fallo = await falloDe(c, () => insertarEnClon(c, esquema, { email, cedula: `c2-${RUN}`, organizacionId: null }));

    expect(fallo?.code).toBe("23505");
    expect(fallo?.message).toContain("usuario_email_key");
    // Y la cuenta de plataforma convive con una de empresa con el mismo email (R3, primera mitad).
    expect(await falloDe(c, () => insertarEnClon(c, esquema, { email, cedula: `c3-${RUN}`, organizacionId: "org-a" }))).toBeNull();
  });

  it("R3: dos cuentas SIN empresa con la misma cedula chocan en usuario_cedula_key (NULLS NOT DISTINCT)", async () => {
    const cedula = `ced-sin-empresa-${RUN}`;
    expect(
      await falloDe(c, () => insertarEnClon(c, esquema, { email: `e1-${RUN}@x.test`, cedula, organizacionId: null })),
    ).toBeNull();

    const fallo = await falloDe(c, () =>
      insertarEnClon(c, esquema, { email: `e2-${RUN}@x.test`, cedula, organizacionId: null }),
    );

    expect(fallo?.code).toBe("23505");
    expect(fallo?.message).toContain("usuario_cedula_key");
  });
});

describeSiHayBase("SL-18 — R4: ida y vuelta de `20261026090000_usuario_unico_por_empresa`", () => {
  let c: Conexion;
  const esquema = nuevoEsquema("iv");
  let fotoConLaMigracion: string[];

  beforeAll(async () => {
    c = await conectar();
    // DDL en su esquema (clon, down y migration): el lock se sostiene de aqui al `afterAll`.
    await tomarLock(c);
    await clonarUsuario(c, esquema);
    fotoConLaMigracion = await fotoDeIndices(c, esquema);
    await c.query(`SET search_path TO "${esquema}"`);
    // Si el `SET` no hubiera surtido efecto, el down de abajo actuaria sobre `public`.
    const { rows } = await c.query("SELECT current_schemas(false)::text AS s");
    expect(rows[0].s).toBe(`{${esquema}}`);
  }, 120_000);

  afterAll(async () => {
    if (!c) return;
    try {
      await c.query("ROLLBACK").catch(() => undefined);
      await c.query("RESET search_path");
      await c.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
      await soltarLock(c);
    } finally {
      // Cerrar la conexion suelta el lock aunque algo de arriba haya fallado.
      await c.end();
    }
  }, 120_000);

  it("R4: sin repetidos, down.sql deja los dos unicos globales de antes; migration.sql vuelve a dejarlos por empresa", async () => {
    expect(fotoConLaMigracion).toEqual(CON_LA_MIGRACION);
    await insertarEnClon(c, esquema, { email: `uno-${RUN}@x.test`, cedula: `uno-${RUN}`, organizacionId: "o1" });
    await insertarEnClon(c, esquema, { email: `dos-${RUN}@x.test`, cedula: `dos-${RUN}`, organizacionId: "o2" });

    await c.query(sqlDe("down.sql"));
    expect(await fotoDeIndices(c, esquema)).toEqual(GLOBALES_DEL_DOWN);

    await c.query(sqlDe("migration.sql"));
    expect(await fotoDeIndices(c, esquema)).toEqual(fotoConLaMigracion);
  });

  async function downFallido(): Promise<string> {
    let mensaje = "";
    try {
      await c.query(sqlDe("down.sql"));
    } catch (error) {
      mensaje = String((error as Error).message);
    }
    await c.query("ROLLBACK");
    return mensaje;
  }

  it("R4: con un email repetido entre empresas, down.sql aborta nombrando usuario_email_key y no cambia nada", async () => {
    await insertarEnClon(c, esquema, { email: `rep-${RUN}@x.test`, cedula: `rep-a-${RUN}`, organizacionId: "o1" });
    await insertarEnClon(c, esquema, { email: `rep-${RUN}@x.test`, cedula: `rep-b-${RUN}`, organizacionId: "o2" });

    const mensaje = await downFallido();

    expect(mensaje).toContain("no se puede volver a los unicos globales de usuario");
    expect(mensaje).toContain("usuario_email_key");
    expect(mensaje).not.toContain("usuario_cedula_key");
    expect(await fotoDeIndices(c, esquema)).toEqual(fotoConLaMigracion);
  });

  it("R4: con la cedula repetida tambien, el mensaje nombra los dos indices y no cambia nada", async () => {
    await insertarEnClon(c, esquema, { email: `ced-a-${RUN}@x.test`, cedula: `ced-rep-${RUN}`, organizacionId: "o1" });
    await insertarEnClon(c, esquema, { email: `ced-b-${RUN}@x.test`, cedula: `ced-rep-${RUN}`, organizacionId: "o2" });

    const mensaje = await downFallido();

    expect(mensaje).toContain("usuario_email_key");
    expect(mensaje).toContain("usuario_cedula_key");
    expect(await fotoDeIndices(c, esquema)).toEqual(fotoConLaMigracion);
  });
});
