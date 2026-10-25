import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { EmpresaCruzada, SQLSTATE_EMPRESA_CRUZADA, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { nombreTrigger } from "@/lib/db/fk-de-negocio";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";
import { exigirSinSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SL-17 / T3.7 (design §3 M3, §9.2) — R37 y R38 contra Postgres real. La garantia es de la BASE:
// los casos de SQL a mano no pasan por servicio ni por extension, y se repiten como dueno de las
// tablas (sin RLS) y como `servi_app`. El caso por Prisma comprueba que lo que llega a la app es
// `EmpresaCruzada`, no el error crudo del driver.
//
// Las semillas (empresas A y B con tienda y zona cada una, y un usuario sin empresa) se commitean
// en `beforeAll`: el cliente extendido abre su propia transaccion en otra conexion y no veria las
// de una transaccion revertida. Se borran en `afterAll`. Cada caso escribe en una transaccion
// revertida.
//
// SL-32: el usuario sin empresa es un superadmin de verdad (el `CHECK` de R28 ya no admite un
// `maestro` sin empresa), y la base admite uno solo (R27): el archivo toma el lock de
// `tomarLockDeSuperadmin` desde antes de sembrarlo hasta despues de borrarlo.
//
// Mutacion de T3.7: `DROP TRIGGER sme_orden_tienda_id_… ON orden` (nombre de `nombreTrigger`) en la
// base desechable pone en rojo los tres casos de R37 sobre `orden.tienda_id`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const TRIGGER_ORDEN_TIENDA = nombreTrigger("orden", "tienda_id");

type Semillas = {
  a: { organizacionId: string; fks: FksDeOrden };
  b: { organizacionId: string; fks: FksDeOrden };
  superadminId: string;
};

let base: PrismaClient;
let s: Semillas;
let soltarSuperadmin: () => Promise<void> = async () => {};

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("revertir");
  }
}

/**
 * Transaccion del cliente base que siempre se revierte. Sin empresa fijada: cada caso dice la suya.
 * El lock de aviso va primero (convencion de `serializarEscriturasReales`): estos casos escriben en
 * `orden` y `usuario` reales, como los archivos que hacen DDL sobre ellas.
 */
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

type Resultado = { ok: true } | { ok: false; sqlstate: string; mensaje: string };

// El SQLSTATE y el texto de Postgres, del error de Prisma 7 + adapter-pg: en SQL a mano llega como
// P2010 con `meta.driverAdapterError.cause`. Se lee esa forma y, si no esta, el mensaje.
function leerError(e: unknown): { sqlstate: string; mensaje: string } {
  const o = e as { message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; originalMessage?: string; message?: string } } } };
  const causa = o.meta?.driverAdapterError?.cause;
  const mensaje = String(causa?.originalMessage ?? causa?.message ?? o.message ?? e);
  const sqlstate = causa?.originalCode ?? causa?.code ?? /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ?? "??";
  return { sqlstate, mensaje };
}

/** Ejecuta `sql` en un SAVEPOINT: un rechazo no aborta la transaccion del caso. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<Resultado> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return { ok: true };
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return { ok: false, ...leerError(e) };
  }
}

/**
 * INSERT de una orden por SQL a mano. Sin `organizacion_id`: lo pone el `DEFAULT` desde la empresa
 * fijada, como en produccion. Devuelve el id para los casos de UPDATE.
 */
function insertarOrden(
  tx: TxDeTest,
  fks: FksDeOrden,
  extra?: { mensajeroAsignadoId?: string | null },
): Promise<Resultado> & { id: string } {
  const id = randomUUID();
  const p = intentar(
    tx,
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
                        provincia_id, canton_id, producto, mensajero_asignado_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'Destinatario T37', '88880000', $4, $5, $6, $7, 'caja', $8, now(), now())`,
    id,
    `T37-${id.slice(0, 8)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
    extra?.mensajeroAsignadoId ?? null,
  );
  return Object.assign(p, { id });
}

async function empresaDeOrden(tx: TxDeTest, id: string): Promise<string | null> {
  const filas = await tx.$queryRawUnsafe<{ organizacion_id: string }[]>(
    `SELECT organizacion_id FROM orden WHERE id = $1`,
    id,
  );
  return filas[0]?.organizacion_id ?? null;
}

async function rolActual(tx: TxDeTest): Promise<string> {
  const [{ rol }] = await tx.$queryRawUnsafe<{ rol: string }[]>(`SELECT current_user::text AS rol`);
  return rol;
}

const empresaCruzada = (columna: string) => ({
  ok: false,
  sqlstate: SQLSTATE_EMPRESA_CRUZADA,
  mensaje: expect.stringContaining(`referencia a otra empresa: ${columna}`) as unknown as string,
});

describeSiHayBase("SL-17 T3.7 — misma empresa en cada FK, en la base (R37, R38)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(base);
    s = await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        const orgA = (await crearOrganizacion(tx, { nombre: "Empresa A T37" })).id;
        const orgB = (await crearOrganizacion(tx, { nombre: "Empresa B T37" })).id;
        await fijarEmpresa(tx, orgA);
        const fksA = await crearFksDeOrden(tx);
        await fijarEmpresa(tx, orgB);
        const fksB = await crearFksDeOrden(tx);
        // '' vuelve NULL el DEFAULT de `usuario.organizacion_id`: el superadmin (D15).
        await fijarEmpresa(tx, "");
        const superadmin = await crearUsuarioDePrueba(tx, "superadmin");
        return {
          a: { organizacionId: orgA, fks: fksA },
          b: { organizacionId: orgB, fks: fksB },
          superadminId: superadmin.id,
        };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );

    // Sin semillas con la empresa esperada, los casos podrian pasar por la razon equivocada.
    const usuarios = await base.usuario.findMany({
      where: { id: { in: [s.a.fks.tiendaId, s.b.fks.tiendaId, s.superadminId] } },
      select: { id: true, organizacionId: true },
    });
    const zonas = await base.zona.findMany({
      where: { id: { in: [s.a.fks.zonaId, s.b.fks.zonaId] } },
      select: { id: true, organizacionId: true },
    });
    const empresaDe = new Map([...usuarios, ...zonas].map((f) => [f.id, f.organizacionId]));
    expect(empresaDe.get(s.a.fks.tiendaId)).toBe(s.a.organizacionId);
    expect(empresaDe.get(s.a.fks.zonaId)).toBe(s.a.organizacionId);
    expect(empresaDe.get(s.b.fks.tiendaId)).toBe(s.b.organizacionId);
    expect(empresaDe.get(s.b.fks.zonaId)).toBe(s.b.organizacionId);
    expect(empresaDe.get(s.superadminId)).toBeNull();
  });

  afterAll(async () => {
    if (s !== undefined) {
      // Solo hay ordenes commiteadas si el caso por la app dejo pasar la cruzada (regresion o la
      // mutacion): sin borrarlas, las semillas quedarian sin poder borrarse.
      // Bajo el lock de la 227, como la siembra: el borrado en cascada de `usuario`/`organizacion`
      // recorre sus hijas en un orden distinto al de un `down.sql` serializado (40P01).
      await bajoLockDeEscrituraReal(async () => {
        await base.orden.deleteMany({ where: { tiendaId: { in: [s.a.fks.tiendaId, s.b.fks.tiendaId] } } });
        await base.usuario.deleteMany({ where: { id: { in: [s.a.fks.tiendaId, s.b.fks.tiendaId, s.superadminId] } } });
        await base.zona.deleteMany({ where: { id: { in: [s.a.fks.zonaId, s.b.fks.zonaId] } } });
        await base.organizacion.deleteMany({ where: { id: { in: [s.a.organizacionId, s.b.organizacionId] } } });
      });
    }
    // Con el superadmin del archivo ya borrado.
    await soltarSuperadmin();
    await base?.$disconnect();
  }, 120_000);

  it("el trigger de orden.tienda_id existe con el nombre de nombreTrigger (si no, la mutacion no mataria nada)", async () => {
    const filas = await base.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_trigger WHERE tgrelid = 'public.orden'::regclass AND tgname = $1`,
      TRIGGER_ORDEN_TIENDA,
    );
    expect(Number(filas[0].n)).toBe(1);
  });

  it("control: la orden de B con tienda y zona de B pasa, como dueno y como servi_app", async () => {
    await revertida(async (tx) => {
      await fijarEmpresa(tx, s.b.organizacionId);
      const comoDueno = insertarOrden(tx, s.b.fks);
      expect(await comoDueno).toEqual({ ok: true });
      expect(await empresaDeOrden(tx, comoDueno.id)).toBe(s.b.organizacionId);

      await comoApp(tx, s.b.organizacionId);
      expect(await rolActual(tx)).toBe("servi_app");
      const app = insertarOrden(tx, s.b.fks);
      expect(await app).toEqual({ ok: true });
      expect(await empresaDeOrden(tx, app.id)).toBe(s.b.organizacionId);
    });
  });

  it("R37: INSERT por SQL a mano, como dueno, de una orden de B con la tienda de A → SL017 que nombra orden.tienda_id", async () => {
    await revertida(async (tx) => {
      await fijarEmpresa(tx, s.b.organizacionId);
      // Dueno de las tablas: sin RLS. El rechazo solo puede venir del trigger.
      expect(await rolActual(tx)).not.toBe("servi_app");
      const intento = insertarOrden(tx, { ...s.b.fks, tiendaId: s.a.fks.tiendaId });
      expect(await intento).toEqual(empresaCruzada("orden.tienda_id"));
      expect(await empresaDeOrden(tx, intento.id)).toBeNull();
    });
  });

  it("R37: el mismo INSERT como servi_app (comoApp(B)) → SL017 que nombra orden.tienda_id", async () => {
    await revertida(async (tx) => {
      await comoApp(tx, s.b.organizacionId);
      expect(await rolActual(tx)).toBe("servi_app");
      const intento = insertarOrden(tx, { ...s.b.fks, tiendaId: s.a.fks.tiendaId });
      expect(await intento).toEqual(empresaCruzada("orden.tienda_id"));
      expect(await empresaDeOrden(tx, intento.id)).toBeNull();
    });
  });

  it("R37: UPDATE que mueve orden.zona_id de una orden de B a la zona de A → SL017, y la fila no cambia", async () => {
    await revertida(async (tx) => {
      await fijarEmpresa(tx, s.b.organizacionId);
      const orden = insertarOrden(tx, s.b.fks);
      expect(await orden).toEqual({ ok: true });

      expect(await intentar(tx, `UPDATE orden SET zona_id = $1 WHERE id = $2`, s.a.fks.zonaId, orden.id)).toEqual(
        empresaCruzada("orden.zona_id"),
      );
      const [fila] = await tx.$queryRawUnsafe<{ zona_id: string }[]>(`SELECT zona_id FROM orden WHERE id = $1`, orden.id);
      expect(fila.zona_id).toBe(s.b.fks.zonaId);
    });
  });

  it("R38: cambiar el organizacion_id de una orden existente → SL017 del trigger sin_cambio_de_empresa", async () => {
    await revertida(async (tx) => {
      await fijarEmpresa(tx, s.b.organizacionId);
      const orden = insertarOrden(tx, s.b.fks);
      expect(await orden).toEqual({ ok: true });

      const r = await intentar(tx, `UPDATE orden SET organizacion_id = $1 WHERE id = $2`, s.a.organizacionId, orden.id);
      expect(r).toEqual({
        ok: false,
        sqlstate: SQLSTATE_EMPRESA_CRUZADA,
        mensaje: expect.stringContaining("una fila no cambia de empresa: orden"),
      });
      expect(await empresaDeOrden(tx, orden.id)).toBe(s.b.organizacionId);
    });
  });

  it("excepcion: un historial_accion de A con el superadmin (sin empresa) como actor pasa", async () => {
    await revertida(async (tx) => {
      await fijarEmpresa(tx, s.a.organizacionId);
      const id = randomUUID();
      const r = await intentar(
        tx,
        `INSERT INTO historial_accion (id, accion, entidad_tipo, entidad_id, entidad_etiqueta,
                                       actor_usuario_id, actor_nombre, actor_rol, lote_id)
         VALUES ($1, 'cierre_dia_aprobado', 'orden', $2, 'Etiqueta T37', $3, 'Superadmin T37', 'maestro', $4)`,
        id,
        randomUUID(),
        s.superadminId,
        randomUUID(),
      );
      expect(r).toEqual({ ok: true });
      const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; actor_usuario_id: string }[]>(
        `SELECT organizacion_id, actor_usuario_id FROM historial_accion WHERE id = $1`,
        id,
      );
      expect(filas).toEqual([{ organizacion_id: s.a.organizacionId, actor_usuario_id: s.superadminId }]);
    });
  });

  it("excepcion: una FK de negocio nula (orden.mensajero_asignado_id) pasa", async () => {
    await revertida(async (tx) => {
      await comoApp(tx, s.b.organizacionId);
      const orden = insertarOrden(tx, s.b.fks, { mensajeroAsignadoId: null });
      expect(await orden).toEqual({ ok: true });
      // Y un UPDATE que la deja nula tambien: el trigger se dispara (UPDATE OF la columna) y la deja pasar.
      expect(await intentar(tx, `UPDATE orden SET mensajero_asignado_id = NULL WHERE id = $1`, orden.id)).toEqual({ ok: true });
    });
  });

  it("excepcion: una tienda_id inexistente la rechaza la FK (23503), no el trigger", async () => {
    await revertida(async (tx) => {
      await fijarEmpresa(tx, s.b.organizacionId);
      const r = await insertarOrden(tx, { ...s.b.fks, tiendaId: randomUUID() });
      expect(r).toMatchObject({ ok: false, sqlstate: "23503" });
    });
  });

  it("R37 por el cliente de la app: create de una orden de B con la tienda de A (sin lectura previa) → EmpresaCruzada", async () => {
    const app = conAislamientoPorEmpresa(base, async () => null);
    const numRemision = `T37-app-${randomUUID().slice(0, 8)}`;
    const datos = (tiendaId: string) => ({
      numRemision,
      estatusId: s.b.fks.estatusId,
      destinatario: "Destinatario T37",
      telefonoDest: "88880000",
      tiendaId,
      zonaId: s.b.fks.zonaId,
      provinciaId: s.b.fks.provinciaId,
      cantonId: s.b.fks.cantonId,
      producto: "caja",
    });

    let error: unknown = null;
    try {
      await conEmpresa(s.b.organizacionId, async () => {
        await app.orden.create({ data: datos(s.a.fks.tiendaId), select: { id: true } });
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EmpresaCruzada);
    // El original viaja en `cause`: es el del trigger de orden.tienda_id, no otro rechazo.
    expect(String((error as EmpresaCruzada).cause)).toContain("referencia a otra empresa: orden.tienda_id");
    expect(await base.orden.count({ where: { numRemision } })).toBe(0);

    // Control por el mismo camino: con la tienda de B la orden se crea (y se revierte).
    const creada = await conEmpresa(s.b.organizacionId, () =>
      app
        .$transaction(async (tx) => {
          const o = await tx.orden.create({ data: datos(s.b.fks.tiendaId), select: { id: true, organizacionId: true } });
          throw new Revertir(o);
        })
        .catch((e: unknown) => {
          if (e instanceof Revertir) return e.valor as { id: string; organizacionId: string };
          throw e;
        }),
    );
    expect(creada.organizacionId).toBe(s.b.organizacionId);
    expect(await base.orden.count({ where: { numRemision } })).toBe(0);
  });
});
