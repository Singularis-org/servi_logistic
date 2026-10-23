import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { EmpresaCruzada, EmpresaNoResuelta, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { comoApp, crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  type TxDeTest,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  urlDeBaseDeDatos,
} from "./_postgres-real";

// SL-17 / T3.5 (design §4, §9.2) — la RLS por empresa como defensa en profundidad: R17–R22, R40,
// y por el cliente de la app R18, R10 y R11.
//
// POR QUE `comoApp` Y NO `fijarEmpresa`. La conexion de los tests es la del dueno de las tablas
// (superusuario en local y en CI): con el, la RLS no se aplica y todo SQL a mano ve las dos
// empresas. Solo con el rol `servi_app` —el que pone la envoltura de la app— las politicas actuan.
// Cada caso mide el antes y el despues como dueno, que ve todo y no depende de la politica.
//
// DOS FORMAS DE DATOS. (1) En una transaccion revertida, A y B con filas en `zona`, `notificacion`,
// `usuario`, `"Session"` y `trusted_device`: para el SQL a mano, que puede escribir sin dejar rastro.
// (2) Commiteadas en `beforeAll` (zonas de A y de B): el cliente de la app y la conexion unica de
// R21 abren SUS transacciones, y una fila de una transaccion ajena sin commitear no la verian. Se
// borran en `afterAll`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

type Org = { id: string };
type ConOrg = { id: string; organizacion_id: string };

/** SQLSTATE de un error de Prisma con driver adapter («Code: `42501`») o de `pg` (`code`). */
function sqlstateDe(error: unknown): string {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) + String((error as Error)?.message ?? "");
  const conCode = /Code: `([0-9A-Z]{5})`/.exec(texto) ?? /"code":"([0-9A-Z]{5})"/.exec(texto);
  return conCode?.[1] ?? `?? ${String((error as Error)?.message ?? error).replace(/\s+/g, " ").slice(0, 160)}`;
}

/** Corre `sql` en un SAVEPOINT: un fallo no aborta la transaccion del test. SQLSTATE o `null`. */
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

/** Vuelve al dueno dentro de la misma transaccion, para medir sin la RLS de por medio. */
async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/**
 * Transaccion que siempre se revierte. El lock de aviso va PRIMERO (feature 227): estos casos
 * escriben en `usuario`, como los demas tests serializados.
 */
async function revertida<T>(cliente: PrismaClient, fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await cliente.$transaction(
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

interface Sembrado {
  zonas: string[];
  notificacion: string;
  usuario: string;
  sesion: string;
  dispositivo: string;
}

/**
 * Filas de una empresa en varias tablas de negocio y de autenticacion. Sin `organizacion_id` en el
 * SQL: lo pone el `DEFAULT` de M2 desde la empresa fijada, como en el SQL a mano de la app.
 */
async function sembrar(tx: TxDeTest, org: string, etiqueta: string): Promise<Sembrado> {
  await fijarEmpresa(tx, org);
  const zonas = [randomUUID(), randomUUID()];
  for (const [i, id] of zonas.entries()) {
    await tx.$executeRawUnsafe(
      `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre) VALUES ($1, $2, '60000000', 'Titular')`,
      id,
      `rls-${etiqueta}-${i}-${RUN}`,
    );
  }
  const notificacion = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO notificacion (id, tipo, evento, descripcion, entidad_tipo, destinatario_rol)
     VALUES ($1, 'alert', 'orden_rechazada', $2, 'orden', 'admin')`,
    notificacion,
    `rls ${etiqueta} ${RUN}`,
  );
  const usuario = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO usuario (id, nombre, email, telefono, password_hash, cedula, tipo_identificacion_id, rol_id, updated_at)
     VALUES ($1, 'Persona de prueba', $2, '88887777', 'x', $3,
             (SELECT id FROM tipo_identificacion LIMIT 1), (SELECT id FROM rol WHERE value = 'admin'), now())`,
    usuario,
    `rls-${etiqueta}-${RUN}@ejemplo.test`,
    `rls-${etiqueta}-${RUN}`,
  );
  const sesion = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "Session" (id, "userId", "expiresAt") VALUES ($1, $2, now() + interval '1 day')`,
    sesion,
    usuario,
  );
  const dispositivo = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO trusted_device (id, usuario_id, device_hash, ip_address) VALUES ($1, $2, $3, '127.0.0.1')`,
    dispositivo,
    usuario,
    `hash-${etiqueta}-${RUN}`,
  );
  return { zonas, notificacion, usuario, sesion, dispositivo };
}

/** Dos empresas con datos dentro de `tx`, medidas como dueno: sin filas de A, el caso no vale. */
async function dosEmpresas(tx: TxDeTest): Promise<{ A: string; B: string; a: Sembrado; b: Sembrado }> {
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;
  const a = await sembrar(tx, A, "a");
  const b = await sembrar(tx, B, "b");
  const [cuenta] = await tx.$queryRawUnsafe<{ a: number; b: number }[]>(
    `SELECT count(*) FILTER (WHERE organizacion_id = $1)::int AS a,
            count(*) FILTER (WHERE organizacion_id = $2)::int AS b FROM zona`,
    A,
    B,
  );
  expect(cuenta).toEqual({ a: 2, b: 2 });
  return { A, B, a, b };
}

async function ids(tx: TxDeTest, sql: string): Promise<ConOrg[]> {
  return tx.$queryRawUnsafe<ConOrg[]>(sql);
}

describeSiHayBase("SL-17 T3.5 — RLS por empresa, SQL a mano y catalogos", () => {
  let base: PrismaClient;
  let app: PrismaClient;
  let unaConexion: PrismaClient;
  let dueno: string;
  // Commiteadas, para el cliente de la app y la conexion unica.
  let orgA: Org;
  let orgB: Org;
  let zonaA: string;
  let zonaB: string;
  let distritoComun: string;

  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesion: el resolver no da empresa. El contexto lo pone cada caso con `conEmpresa`.
    app = conAislamientoPorEmpresa(base, async () => null);
    // Pool de UNA conexion (como el spike T1.1): dos transacciones seguidas comparten conexion.
    unaConexion = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 1 }),
      omit: PRISMA_OMIT,
    }) as unknown as PrismaClient;

    const [{ usuario }] = await base.$queryRaw<{ usuario: string }[]>`SELECT current_user::text AS usuario`;
    dueno = usuario;

    // Commitea hijas de `organizacion` fuera de una transaccion revertida: bajo el lock de la 227,
    // para no cruzarse con un `down.sql` serializado (ver `bajoLockDeEscrituraReal`).
    await bajoLockDeEscrituraReal(async () => {
      orgA = await crearOrganizacion(base);
      orgB = await crearOrganizacion(base);
      const datos = (org: string, etiqueta: string) => ({
        nombre: `rls-commit-${etiqueta}-${RUN}`,
        sinpeNumero: "60000000",
        sinpeNombre: "Titular",
        organizacionId: org,
      });
      zonaA = (await base.zona.create({ data: datos(orgA.id, "a"), select: { id: true } })).id;
      zonaB = (await base.zona.create({ data: datos(orgB.id, "b"), select: { id: true } })).id;
      // Un distrito del catalogo que cubren las DOS zonas (T3.10): dos empresas que reparten en la
      // misma ciudad.
      const distrito = await base.distrito.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
      if (distrito === null) throw new Error("no hay distritos: aplica las migraciones");
      distritoComun = distrito.id;
      await base.zonaDistrito.createMany({
        data: [
          { zonaId: zonaA, distritoId: distritoComun, organizacionId: orgA.id },
          { zonaId: zonaB, distritoId: distritoComun, organizacionId: orgB.id },
        ],
      });
    });
  }, 120_000);

  afterAll(async () => {
    const orgs = [orgA?.id, orgB?.id].filter((x): x is string => x !== undefined);
    try {
      await bajoLockDeEscrituraReal(async () => {
        await base.zonaDistrito.deleteMany({ where: { organizacionId: { in: orgs } } });
        await base.zona.deleteMany({ where: { organizacionId: { in: orgs } } });
        await base.organizacion.deleteMany({ where: { id: { in: orgs } } });
      });
    } finally {
      await unaConexion.$disconnect();
      await base.$disconnect();
    }
  }, 120_000);

  /* ------------------------------------------------------------------------ */
  /* SQL a mano con el rol de la app                                           */
  /* ------------------------------------------------------------------------ */

  it("R17/R20: con la empresa B, SELECT/UPDATE/DELETE sin WHERE solo ven y tocan filas de B; las de A quedan intactas", async () => {
    const r = await revertida(base, async (tx) => {
      const { A, B, a, b } = await dosEmpresas(tx);
      await comoApp(tx, B);

      const zonas = await ids(tx, `SELECT id, organizacion_id FROM zona`);
      const notificaciones = await ids(tx, `SELECT id, organizacion_id FROM notificacion`);
      const actualizadas = await tx.$executeRawUnsafe(`UPDATE zona SET sinpe_nombre = 'Tocada por B'`);
      const borradasNotif = await tx.$executeRawUnsafe(`DELETE FROM notificacion`);
      const borradasZona = await tx.$executeRawUnsafe(`DELETE FROM zona`);

      await comoDueno(tx);
      const zonasDeA = await tx.$queryRawUnsafe<{ id: string; sinpe_nombre: string }[]>(
        `SELECT id, sinpe_nombre FROM zona WHERE organizacion_id = $1 ORDER BY id`,
        A,
      );
      const [quedan] = await tx.$queryRawUnsafe<{ zb: number; na: number; nb: number }[]>(
        `SELECT (SELECT count(*)::int FROM zona WHERE organizacion_id = $2) AS zb,
                (SELECT count(*)::int FROM notificacion WHERE organizacion_id = $1) AS na,
                (SELECT count(*)::int FROM notificacion WHERE organizacion_id = $2) AS nb`,
        A,
        B,
      );
      return { A, B, a, b, zonas, notificaciones, actualizadas, borradasNotif, borradasZona, zonasDeA, quedan };
    });

    // Lectura: B ve sus filas (no un vacio que haria pasar todo) y ninguna de A.
    expect(r.zonas.map((z) => z.id).sort()).toEqual([...r.b.zonas].sort());
    expect(r.zonas.every((z) => z.organizacion_id === r.B)).toBe(true);
    expect(r.notificaciones.map((n) => n.id)).toEqual([r.b.notificacion]);
    // Escritura: solo las 2 zonas y la notificacion de B.
    expect(r.actualizadas).toBe(2);
    expect(r.borradasNotif).toBe(1);
    expect(r.borradasZona).toBe(2);
    // Medido como dueno: A sigue entera y sin el cambio; de B no queda nada.
    expect(r.zonasDeA).toEqual(
      [...r.a.zonas].sort().map((id) => ({ id, sinpe_nombre: "Titular" })),
    );
    expect(r.quedan).toEqual({ zb: 0, na: 1, nb: 0 });
  });

  it("R17: con la empresa B, el SQL a mano no puede crear ni mover filas a la empresa A (WITH CHECK)", async () => {
    const r = await revertida(base, async (tx) => {
      const { A, B } = await dosEmpresas(tx);
      await comoApp(tx, B);
      const insertarEnA = await intentar(
        tx,
        `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id) VALUES ($1, $2, '60000000', 'T', $3)`,
        randomUUID(),
        `rls-intrusa-${RUN}`,
        A,
      );
      const insertarEnB = await intentar(
        tx,
        `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre) VALUES ($1, $2, '60000000', 'T')`,
        randomUUID(),
        `rls-propia-${RUN}`,
      );
      await comoDueno(tx);
      const [n] = await tx.$queryRawUnsafe<{ intrusa: number; propia: string | null }[]>(
        `SELECT (SELECT count(*)::int FROM zona WHERE nombre = $1) AS intrusa,
                (SELECT organizacion_id FROM zona WHERE nombre = $2) AS propia`,
        `rls-intrusa-${RUN}`,
        `rls-propia-${RUN}`,
      );
      return { B, insertarEnA, insertarEnB, n };
    });
    expect(r.insertarEnA).toBe("42501");
    expect(r.insertarEnB).toBeNull();
    expect(r.n).toEqual({ intrusa: 0, propia: r.B });
  });

  it("R19: con el rol de la app y sin empresa, las tablas de negocio dan 0 filas y todo INSERT falla", async () => {
    const r = await revertida(base, async (tx) => {
      const { A } = await dosEmpresas(tx);
      await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', '', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE servi_app`);
      const [rol] = await tx.$queryRawUnsafe<{ u: string }[]>(`SELECT current_user::text AS u`);
      const [cuentas] = await tx.$queryRawUnsafe<{ zona: number; notificacion: number; usuario: number }[]>(
        `SELECT (SELECT count(*)::int FROM zona) AS zona,
                (SELECT count(*)::int FROM notificacion) AS notificacion,
                (SELECT count(*)::int FROM usuario) AS usuario`,
      );
      const sinOrg = await intentar(
        tx,
        `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre) VALUES ($1, $2, '60000000', 'T')`,
        randomUUID(),
        `rls-sin-org-${RUN}`,
      );
      const conOrgA = await intentar(
        tx,
        `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id) VALUES ($1, $2, '60000000', 'T', $3)`,
        randomUUID(),
        `rls-con-org-${RUN}`,
        A,
      );
      await comoDueno(tx);
      const [escritas] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM zona WHERE nombre IN ($1, $2)`,
        `rls-sin-org-${RUN}`,
        `rls-con-org-${RUN}`,
      );
      return { rol: rol.u, cuentas, sinOrg, conOrgA, escritas: escritas.n };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.cuentas).toEqual({ zona: 0, notificacion: 0, usuario: 0 });
    // Medido: la politica (WITH CHECK) rechaza antes que el NOT NULL del DEFAULT vacio, asi que
    // las dos inserciones dan 42501.
    expect(r.sinOrg).toBe("42501");
    expect(r.conOrgA).toBe("42501");
    expect(r.escritas).toBe(0);
  });

  it("R21: la empresa y el rol no sobreviven a la transaccion en la misma conexion; la siguiente se comporta como R19", async () => {
    const primera = await unaConexion.$transaction(async (tx) => {
      await comoApp(tx, orgB.id);
      const [f] = await tx.$queryRawUnsafe<{ pid: number; u: string; org: string; n: number }[]>(
        `SELECT pg_backend_pid() AS pid, current_user::text AS u,
                current_setting('app.organizacion_id', true) AS org, (SELECT count(*)::int FROM zona) AS n`,
      );
      return f;
    });
    // La primera ve justo la zona commiteada de B: el ajuste estaba puesto.
    expect(primera).toMatchObject({ u: "servi_app", org: orgB.id, n: 1 });

    const segunda = await revertida(unaConexion, async (tx) => {
      const [f] = await tx.$queryRawUnsafe<{ pid: number; u: string; org: string | null }[]>(
        `SELECT pg_backend_pid() AS pid, current_user::text AS u, current_setting('app.organizacion_id', true) AS org`,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE servi_app`);
      const [n] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM zona`);
      const insertar = await intentar(
        tx,
        `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre) VALUES ($1, $2, '60000000', 'T')`,
        randomUUID(),
        `rls-r21-${RUN}`,
      );
      return { ...f, n: n.n, insertar };
    });
    expect(segunda.pid).toBe(primera.pid);
    expect(segunda.u).toBe(dueno);
    expect(segunda.org).toBe("");
    expect(segunda.n).toBe(0);
    expect(segunda.insertar).toBe("42501");
  });

  /* ------------------------------------------------------------------------ */
  /* Catalogos, geografia y autenticacion                                      */
  /* ------------------------------------------------------------------------ */

  it("R22: con la empresa B se leen catalogos y geografia; Session, trusted_device y usuario solo muestran usuarios de B", async () => {
    const r = await revertida(base, async (tx) => {
      const { B, b } = await dosEmpresas(tx);
      // `vehiculos` llega vacia de las migraciones: sin una fila, «se lee» no probaria nada.
      await tx.$executeRawUnsafe(`INSERT INTO vehiculos (id, name) VALUES ($1, $2)`, randomUUID(), `rls-veh-${RUN}`);
      const [comoDuenoCuentas] = await tx.$queryRawUnsafe<Record<string, number>[]>(SQL_CATALOGOS);
      await comoApp(tx, B);
      const [comoB] = await tx.$queryRawUnsafe<Record<string, number>[]>(SQL_CATALOGOS);
      const sesiones = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Session"`);
      const dispositivos = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM trusted_device`);
      const usuarios = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM usuario`);
      return { b, comoDuenoCuentas, comoB, sesiones, dispositivos, usuarios };
    });
    // Los catalogos que siembran las migraciones existen, y B los ve todos.
    for (const t of ["provincia", "canton", "rol", "tipo_identificacion", "order_status", "vehiculos"]) {
      expect(r.comoDuenoCuentas[t], t).toBeGreaterThan(0);
    }
    expect(r.comoB).toEqual(r.comoDuenoCuentas);
    expect(r.sesiones.map((s) => s.id)).toEqual([r.b.sesion]);
    expect(r.dispositivos.map((d) => d.id)).toEqual([r.b.dispositivo]);
    expect(r.usuarios.map((u) => u.id)).toEqual([r.b.usuario]);
  });

  it("R40: INSERT/UPDATE/DELETE en vehiculos y en provincia con la empresa B dan permission denied y la fila no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const { B } = await dosEmpresas(tx);
      const vehiculo = randomUUID();
      await tx.$executeRawUnsafe(`INSERT INTO vehiculos (id, name) VALUES ($1, $2)`, vehiculo, `rls-veh-${RUN}`);
      const [prov] = await tx.$queryRawUnsafe<{ id: string; nombre: string }[]>(
        `SELECT id, nombre FROM provincia ORDER BY id LIMIT 1`,
      );
      const antes = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT (SELECT count(*)::int FROM vehiculos) + (SELECT count(*)::int FROM provincia) AS n`,
      );

      await comoApp(tx, B);
      const codigos = {
        vehiculosInsert: await intentar(tx, `INSERT INTO vehiculos (id, name) VALUES ($1, 'intrusa')`, randomUUID()),
        vehiculosUpdate: await intentar(tx, `UPDATE vehiculos SET name = 'cambiada' WHERE id = $1`, vehiculo),
        vehiculosDelete: await intentar(tx, `DELETE FROM vehiculos WHERE id = $1`, vehiculo),
        provinciaInsert: await intentar(tx, `INSERT INTO provincia (id, nombre) VALUES ($1, 'intrusa')`, randomUUID()),
        provinciaUpdate: await intentar(tx, `UPDATE provincia SET nombre = 'cambiada' WHERE id = $1`, prov.id),
        provinciaDelete: await intentar(tx, `DELETE FROM provincia WHERE id = $1`, prov.id),
      };

      await comoDueno(tx);
      const [despuesVeh] = await tx.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM vehiculos WHERE id = $1`, vehiculo);
      const [despuesProv] = await tx.$queryRawUnsafe<{ nombre: string }[]>(`SELECT nombre FROM provincia WHERE id = $1`, prov.id);
      const despues = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT (SELECT count(*)::int FROM vehiculos) + (SELECT count(*)::int FROM provincia) AS n`,
      );
      return { codigos, vehiculoNombre: despuesVeh?.name, prov, provNombre: despuesProv?.nombre, antes, despues };
    });
    expect(r.codigos).toEqual({
      vehiculosInsert: "42501",
      vehiculosUpdate: "42501",
      vehiculosDelete: "42501",
      provinciaInsert: "42501",
      provinciaUpdate: "42501",
      provinciaDelete: "42501",
    });
    expect(r.vehiculoNombre).toBe(`rls-veh-${RUN}`);
    expect(r.provNombre).toBe(r.prov.nombre);
    expect(r.despues).toEqual(r.antes);
  });

  /* ------------------------------------------------------------------------ */
  /* El cliente de la app (extension) contra la base                           */
  /* ------------------------------------------------------------------------ */

  it("R18: el cliente de la app con la empresa B baja a servi_app y un $queryRaw sin filtro solo ve filas de B (fuera y dentro de $transaction)", async () => {
    // Las dos zonas commiteadas existen: si no, ver «solo B» no probaria nada.
    expect(await base.zona.count({ where: { id: { in: [zonaA, zonaB] } } })).toBe(2);

    const fuera = await conEmpresa(orgB.id, async () => {
      const filas = await app.$queryRaw<ConOrg[]>`SELECT id, organizacion_id FROM zona`;
      const [quien] = await app.$queryRaw<{ u: string; org: string }[]>`
        SELECT current_user::text AS u, current_setting('app.organizacion_id', true) AS org`;
      return { filas, quien };
    });
    expect(fuera.quien).toEqual({ u: "servi_app", org: orgB.id });
    expect(fuera.filas).toEqual([{ id: zonaB, organizacion_id: orgB.id }]);

    const dentro = await conEmpresa(orgB.id, () =>
      app.$transaction(async (tx) => {
        const filas = await tx.$queryRaw<ConOrg[]>`SELECT id, organizacion_id FROM zona`;
        const [quien] = await tx.$queryRaw<{ u: string }[]>`SELECT current_user::text AS u`;
        return { filas, quien };
      }),
    );
    expect(dentro.quien.u).toBe("servi_app");
    expect(dentro.filas).toEqual([{ id: zonaB, organizacion_id: orgB.id }]);
  });

  it("R10: el cliente de la app con la empresa B rechaza create/update que traen la empresa A, sin escribir nada", async () => {
    const nombre = `rls-r10-${RUN}`;
    const enB = <T>(fn: () => Promise<T>) => conEmpresa(orgB.id, fn);

    await expect(
      enB(() =>
        app.zona.create({ data: { nombre, sinpeNumero: "60000000", sinpeNombre: "T", organizacionId: orgA.id } }),
      ),
    ).rejects.toBeInstanceOf(EmpresaCruzada);
    await expect(
      enB(() =>
        app.zona.create({
          data: { nombre, sinpeNumero: "60000000", sinpeNombre: "T", organizacion: { connect: { id: orgA.id } } },
        }),
      ),
    ).rejects.toBeInstanceOf(EmpresaCruzada);
    await expect(
      enB(() => app.zona.update({ where: { id: zonaB }, data: { organizacionId: orgA.id, nombre } })),
    ).rejects.toBeInstanceOf(EmpresaCruzada);
    await expect(
      enB(() => app.zona.updateMany({ data: { organizacionId: { set: orgA.id }, nombre } })),
    ).rejects.toBeInstanceOf(EmpresaCruzada);

    expect(await base.zona.count({ where: { nombre } })).toBe(0);
    expect(await base.zona.findUnique({ where: { id: zonaB }, select: { organizacionId: true, nombre: true } })).toEqual({
      organizacionId: orgB.id,
      nombre: `rls-commit-b-${RUN}`,
    });
  });

  it("R11: SQL a mano por el cliente de la app sin empresa en contexto da EmpresaNoResuelta y no se ejecuta", async () => {
    const nombre = `rls-r11-${RUN}`;
    await expect(app.$queryRaw`SELECT id FROM zona`).rejects.toBeInstanceOf(EmpresaNoResuelta);
    // Como dueno, este INSERT pasaria: que no exista despues prueba que no se ejecuto.
    await expect(
      app.$executeRaw`INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id)
                      VALUES (${randomUUID()}, ${nombre}, '60000000', 'T', ${orgA.id})`,
    ).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(await base.zona.count({ where: { nombre } })).toBe(0);
  });

  /* Modelos de plataforma por el cliente de la app (T3.10) */

  it("R7/R18: el cliente de la app con la empresa B lee un distrito con sus zonas y solo trae la de B", async () => {
    // Las dos filas existen: si no, «solo la de B» no probaria nada.
    expect(
      (await base.zonaDistrito.findMany({ where: { distritoId: distritoComun, zonaId: { in: [zonaA, zonaB] } }, select: { zonaId: true } }))
        .map((z) => z.zonaId)
        .sort(),
    ).toEqual([zonaA, zonaB].sort());

    const leer = () =>
      app.distrito.findUniqueOrThrow({ where: { id: distritoComun }, select: { zonas: { select: { zonaId: true } } } });
    // Fuera de una transaccion (la envoltura) y dentro de una de empresa: las dos via RLS.
    const fuera = await conEmpresa(orgB.id, leer);
    const dentro = await conEmpresa(orgB.id, () =>
      app.$transaction((tx) =>
        tx.distrito.findUniqueOrThrow({ where: { id: distritoComun }, select: { zonas: { select: { zonaId: true } } } }),
      ),
    );
    expect(fuera.zonas).toEqual([{ zonaId: zonaB }]);
    expect(dentro.zonas).toEqual([{ zonaId: zonaB }]);
    // Control: A ve la suya por el mismo camino.
    expect((await conEmpresa(orgA.id, leer)).zonas).toEqual([{ zonaId: zonaA }]);
  });

  it("R40: el cliente de la app con la empresa B no puede crear, renombrar ni borrar un vehiculo (permission denied) y la fila no cambia", async () => {
    const nombre = `rls-veh-app-${RUN}`;
    const vehiculo = (await base.vehiculo.create({ data: { name: nombre }, select: { id: true } })).id;
    try {
      // Por operacion de modelo, Prisma no deja el SQLSTATE en el texto: se reconoce el mensaje de
      // Postgres (en ingles o en espanol, segun el `lc_messages` del servidor).
      const PERMISO_DENEGADO = /permission denied for table vehiculos|permiso denegado a la tabla vehiculos/;
      const enB = <T>(fn: () => Promise<T>) =>
        conEmpresa(orgB.id, fn).then(
          () => null,
          (e: unknown) => {
            const s = sqlstateDe(e);
            return s === "42501" || PERMISO_DENEGADO.test(s) ? "42501" : s;
          },
        );
      const codigos = {
        create: await enB(() => app.vehiculo.create({ data: { name: `rls-veh-intrusa-${RUN}` } })),
        update: await enB(() => app.vehiculo.update({ where: { id: vehiculo }, data: { name: "cambiada" } })),
        updateMany: await enB(() => app.vehiculo.updateMany({ where: { id: vehiculo }, data: { name: "cambiada" } })),
        delete: await enB(() => app.vehiculo.delete({ where: { id: vehiculo } })),
        deleteMany: await enB(() => app.vehiculo.deleteMany({ where: { id: vehiculo } })),
      };
      expect(codigos).toEqual({ create: "42501", update: "42501", updateMany: "42501", delete: "42501", deleteMany: "42501" });
      expect(await base.vehiculo.findUnique({ where: { id: vehiculo }, select: { name: true } })).toEqual({ name: nombre });
      expect(await base.vehiculo.count({ where: { name: `rls-veh-intrusa-${RUN}` } })).toBe(0);
      // Leerlo si puede (solo SELECT, R22).
      expect(await conEmpresa(orgB.id, () => app.vehiculo.findUnique({ where: { id: vehiculo }, select: { name: true } }))).toEqual({
        name: nombre,
      });
    } finally {
      await base.vehiculo.deleteMany({ where: { id: vehiculo } });
    }
  });
});

/** Filas visibles de cada catalogo y tabla de geografia (R22). */
const SQL_CATALOGOS = `SELECT
  (SELECT count(*)::int FROM provincia) AS provincia,
  (SELECT count(*)::int FROM canton) AS canton,
  (SELECT count(*)::int FROM distrito) AS distrito,
  (SELECT count(*)::int FROM rol) AS rol,
  (SELECT count(*)::int FROM permiso) AS permiso,
  (SELECT count(*)::int FROM tipo_identificacion) AS tipo_identificacion,
  (SELECT count(*)::int FROM order_status) AS order_status,
  (SELECT count(*)::int FROM vehiculos) AS vehiculos`;
