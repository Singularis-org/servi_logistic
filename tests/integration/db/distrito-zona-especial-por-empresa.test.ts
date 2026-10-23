import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { SQLSTATE_EMPRESA_CRUZADA, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { actualizarDistritosEspeciales } from "@/lib/actions/geografia";
import { DistritoZonaEspecialRepository } from "@/lib/repositories/DistritoZonaEspecialRepository";
import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SL-38 / T2 (design §2.1, §6) — la marca de zona especial ES DE LA EMPRESA, contra Postgres real:
// R1 (una marca por empresa y distrito), R3 (B no ve ni escribe la marca de A: tabla, lectura
// anidada desde `distrito` y desde `orden`, SQL a mano), R4 (SL017 al cambiar de empresa) y R10
// (B desmarca y la marca de A sigue; `distrito` no cambia). T6 suma R10 y R13 (un id inexistente no
// deja nada del lote) por el repositorio REAL con el cliente extendido.
//
// POR QUE `comoApp` Y EL CLIENTE DE LA APP. La conexion del test es la del dueno de las tablas: con
// ella la RLS no actua. El SQL a mano baja a `servi_app` con `comoApp`; la lectura anidada pasa por
// `conAislamientoPorEmpresa` + `conEmpresa`, que es lo que hace la app (la extension no ve los
// `select` anidados: los filtra la RLS, SL-17 §6.2). T2 va antes que el repositorio (T6): las
// lecturas por repositorio real las mide `zona-especial-dos-empresas.test.ts` (T8).
//
// SIEMBRA OBLIGATORIA. La marca de A sobre el distrito D se commitea en `beforeAll` (el cliente de
// la app abre su propia transaccion y no veria una sin commitear) y se COMPRUEBA como dueno: si no
// esta, el `beforeAll` falla y con el todo el archivo. Ningun caso puede pasar «porque no habia
// nada». Cada caso de B mide ademas, como dueno, que la marca de A sigue ahi.
//
// Mutaciones (progress/impl_SL-38.md, T1-T2 y T6-T7): sin la politica, o con una que deja ver todo,
// caen los casos de `comoApp(B)` y del cliente de la app; sin el trigger, cae el de SL017; un
// repositorio sin transaccion o que traga el error de FK, cae el de R13.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Semillas = {
  A: string;
  B: string;
  /** Distrito de Cartago/Cartago que A marca y B no. */
  D: string;
  /** Otro distrito del mismo canton, para que B tenga una marca propia y «no ve» no sea un vacio. */
  D2: string;
  marcaA: string;
  fksA: FksDeOrden;
  fksB: FksDeOrden;
  ordenA: string;
  ordenB: string;
};

let base: PrismaClient;
let app: PrismaClient;
let s: Semillas;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transaccion del dueno que siempre se revierte. El lock de aviso de la 227 va primero. */
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
  return causa?.originalCode ?? causa?.code ?? /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ?? `?? ${String(o.message ?? e).slice(0, 160)}`;
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transaccion del caso. SQLSTATE o `null`. */
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

/** Las marcas de `distrito`, medidas como dueno: `[organizacion_id]` ordenadas. */
async function marcasDe(tx: TxDeTest, distrito: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ organizacion_id: string }[]>(
    `SELECT organizacion_id FROM distrito_zona_especial WHERE distrito_id = $1 ORDER BY organizacion_id`,
    distrito,
  );
  return filas.map((f) => f.organizacion_id);
}

/** Las marcas de `distrito` leidas por la conexion del dueno, fuera de cualquier transaccion. */
async function marcasDeBase(distrito: string): Promise<string[]> {
  const filas = await base.distritoZonaEspecial.findMany({
    where: { distritoId: distrito },
    select: { organizacionId: true },
    orderBy: { organizacionId: "asc" },
  });
  return filas.map((f) => f.organizacionId);
}

async function insertarOrden(tx: TxDeTest, fks: FksDeOrden, distritoId: string): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
                        provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
     VALUES ($1, $2, $3, 'Destinatario SL38', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`,
    id,
    `SL38-${id.slice(0, 8)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
    distritoId,
  );
  return id;
}

describeSiHayBase("SL-38 T2/T6 — la marca de zona especial es de la empresa (R1, R3, R4, R10, R13)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesion: la empresa la pone cada caso con `conEmpresa`.
    app = conAislamientoPorEmpresa(base, async () => null);

    s = await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        const A = (await crearOrganizacion(tx, { nombre: "Empresa A SL38" })).id;
        const B = (await crearOrganizacion(tx, { nombre: "Empresa B SL38" })).id;
        await fijarEmpresa(tx, A);
        const fksA = await crearFksDeOrden(tx);
        await fijarEmpresa(tx, B);
        const fksB = await crearFksDeOrden(tx);
        // Los dos distritos salen del canton de las ordenes (Cartago/Cartago, de las migraciones).
        const distritos = await tx.distrito.findMany({
          where: { cantonId: fksA.cantonId },
          orderBy: { id: "asc" },
          take: 2,
          select: { id: true },
        });
        if (distritos.length < 2) throw new Error("faltan distritos de Cartago/Cartago: aplica las migraciones");
        const [D, D2] = distritos.map((d) => d.id);
        // La marca de A, sin `organizacion_id` en los datos: la pone el DEFAULT de M1 (R2).
        await fijarEmpresa(tx, A);
        const marcaA = (await tx.distritoZonaEspecial.create({ data: { distritoId: D }, select: { id: true } })).id;
        const ordenA = await insertarOrden(tx, fksA, D);
        await fijarEmpresa(tx, B);
        const ordenB = await insertarOrden(tx, fksB, D);
        return { A, B, D, D2, marcaA, fksA, fksB, ordenA, ordenB };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );

    // La siembra, medida como dueno. Sin la marca de A en D, nada de lo de abajo mediria nada.
    const marcas = await base.distritoZonaEspecial.findMany({
      where: { distritoId: { in: [s.D, s.D2] } },
      select: { id: true, distritoId: true, organizacionId: true },
    });
    expect(marcas).toEqual([{ id: s.marcaA, distritoId: s.D, organizacionId: s.A }]);
    const ordenes = await base.orden.findMany({
      where: { id: { in: [s.ordenA, s.ordenB] } },
      select: { id: true, organizacionId: true, distritoId: true },
      orderBy: { id: "asc" },
    });
    expect(ordenes).toEqual(
      [
        { id: s.ordenA, organizacionId: s.A, distritoId: s.D },
        { id: s.ordenB, organizacionId: s.B, distritoId: s.D },
      ].sort((x, y) => x.id.localeCompare(y.id)),
    );
  }, 120_000);

  afterAll(async () => {
    if (s !== undefined) {
      const orgs = [s.A, s.B];
      // En el orden que piden las FK, bajo el lock de la 227 como la siembra.
      await bajoLockDeEscrituraReal(async () => {
        for (const tabla of ["orden", "distrito_zona_especial", "usuario", "zona", "organizacion"]) {
          const columna = tabla === "organizacion" ? "id" : "organizacion_id";
          await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "${columna}" = ANY($1::text[])`, orgs);
        }
      });
    }
    await base?.$disconnect();
  }, 120_000);

  /* ---------------------------------- R1 ---------------------------------- */

  it("R1: una segunda marca del mismo (empresa, distrito) falla con 23505; la misma marca en otra empresa pasa", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, s.A);
      const duplicadaEnA = await intentar(tx, `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, randomUUID(), s.D);
      await fijarEmpresa(tx, s.B);
      const mismaEnB = await intentar(tx, `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, randomUUID(), s.D);
      return { duplicadaEnA, mismaEnB, marcas: await marcasDe(tx, s.D) };
    });
    expect(r.duplicadaEnA).toBe("23505");
    expect(r.mismaEnB).toBeNull();
    expect(r.marcas).toEqual([s.A, s.B].sort());
  });

  /* ---------------------------------- R3 ---------------------------------- */

  it("R3: con comoApp(B), la tabla, el join desde distrito y el join desde orden no traen la marca de A; B si ve la suya", async () => {
    const r = await revertida(async (tx) => {
      // B marca D2: «B no ve la de A» tiene que convivir con «B ve la suya», o un vacio pasaria.
      await fijarEmpresa(tx, s.B);
      const marcaB = randomUUID();
      await tx.$executeRawUnsafe(`INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, marcaB, s.D2);

      await comoApp(tx, s.B);
      const tabla = await tx.$queryRawUnsafe<{ id: string; organizacion_id: string }[]>(
        `SELECT id, organizacion_id FROM distrito_zona_especial`,
      );
      const desdeDistrito = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT m.id FROM distrito d JOIN distrito_zona_especial m ON m.distrito_id = d.id WHERE d.id = $1`,
        s.D,
      );
      const desdeOrden = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT m.id FROM orden o JOIN distrito_zona_especial m ON m.distrito_id = o.distrito_id WHERE o.id = $1`,
        s.ordenB,
      );
      // La orden de B si se ve (el join no vale si la orden tampoco se viera).
      const ordenB = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM orden WHERE id = $1`, s.ordenB);

      await comoDueno(tx);
      return { marcaB, tabla, desdeDistrito, desdeOrden, ordenB, marcasD: await marcasDe(tx, s.D) };
    });
    expect(r.tabla).toEqual([{ id: r.marcaB, organizacion_id: s.B }]);
    expect(r.desdeDistrito).toEqual([]);
    expect(r.ordenB).toEqual([{ id: s.ordenB }]);
    expect(r.desdeOrden).toEqual([]);
    // Como dueno, la marca de A seguia ahi todo el rato.
    expect(r.marcasD).toEqual([s.A]);
  });

  it("R3: con comoApp(B), insertar una marca con la empresa de A da 42501 y no escribe nada", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, s.B);
      const conEmpresaA = await intentar(
        tx,
        `INSERT INTO distrito_zona_especial (id, distrito_id, organizacion_id) VALUES ($1, $2, $3)`,
        randomUUID(),
        s.D2,
        s.A,
      );
      const propia = await intentar(tx, `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, randomUUID(), s.D2);
      await comoDueno(tx);
      return { conEmpresaA, propia, marcasD2: await marcasDe(tx, s.D2) };
    });
    expect(r.conEmpresaA).toBe("42501");
    // Control: la de B por el mismo camino pasa (si no, el 42501 no diria nada de la politica).
    expect(r.propia).toBeNull();
    expect(r.marcasD2).toEqual([s.B]);
  });

  it("R3: el cliente de la app con la empresa B lee el distrito D y la orden de B sin la marca de A; con A, la trae", async () => {
    const leerDistrito = () =>
      app.distrito.findUniqueOrThrow({
        where: { id: s.D },
        select: { zonasEspeciales: { select: { id: true, organizacionId: true } } },
      });
    const leerOrden = (id: string) =>
      app.orden.findUniqueOrThrow({
        where: { id },
        select: { distrito: { select: { zonasEspeciales: { select: { id: true, organizacionId: true } } } } },
      });

    // La marca de A existe ahora mismo, medida como dueno.
    expect(await base.distritoZonaEspecial.count({ where: { id: s.marcaA, organizacionId: s.A } })).toBe(1);

    const enB = await conEmpresa(s.B, async () => ({
      distrito: await leerDistrito(),
      orden: await leerOrden(s.ordenB),
    }));
    expect(enB.distrito.zonasEspeciales).toEqual([]);
    expect(enB.orden.distrito?.zonasEspeciales).toEqual([]);

    // Control: A ve la suya por los mismos dos caminos.
    const enA = await conEmpresa(s.A, async () => ({
      distrito: await leerDistrito(),
      orden: await leerOrden(s.ordenA),
    }));
    const deA = [{ id: s.marcaA, organizacionId: s.A }];
    expect(enA.distrito.zonasEspeciales).toEqual(deA);
    expect(enA.orden.distrito?.zonasEspeciales).toEqual(deA);
  });

  /* ---------------------------------- R4 ---------------------------------- */

  it("R4: cambiar el organizacion_id de una marca da SL017 como dueno, y la marca no cambia", async () => {
    const r = await revertida(async (tx) => {
      const comoDuenoDeTablas = await intentar(
        tx,
        `UPDATE distrito_zona_especial SET organizacion_id = $1 WHERE id = $2`,
        s.B,
        s.marcaA,
      );
      const [fila] = await tx.$queryRawUnsafe<{ organizacion_id: string }[]>(
        `SELECT organizacion_id FROM distrito_zona_especial WHERE id = $1`,
        s.marcaA,
      );
      return { comoDuenoDeTablas, empresa: fila?.organizacion_id };
    });
    expect(r.comoDuenoDeTablas).toBe(SQLSTATE_EMPRESA_CRUZADA);
    expect(r.empresa).toBe(s.A);
  });

  it("R4: con comoApp(B), mover la marca propia de B a la empresa A da SL017 (el trigger va antes que la politica)", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, s.B);
      const marcaB = randomUUID();
      await tx.$executeRawUnsafe(`INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, marcaB, s.D2);
      const mover = await intentar(tx, `UPDATE distrito_zona_especial SET organizacion_id = $1 WHERE id = $2`, s.A, marcaB);
      await comoDueno(tx);
      return { mover, marcasD2: await marcasDe(tx, s.D2) };
    });
    expect(r.mover).toBe(SQLSTATE_EMPRESA_CRUZADA);
    expect(r.marcasD2).toEqual([s.B]);
  });

  /* ---------------------------------- R10 --------------------------------- */

  it("R10: con comoApp(B), B marca y desmarca D: borra solo la suya, la de A sigue y la fila de distrito no cambia", async () => {
    const r = await revertida(async (tx) => {
      const distritoAntes = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM distrito WHERE id = $1`, s.D);
      await comoApp(tx, s.B);
      const marcadas = await tx.$executeRawUnsafe(
        `INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`,
        randomUUID(),
        s.D,
      );
      const desmarcadas = await tx.$executeRawUnsafe(`DELETE FROM distrito_zona_especial WHERE distrito_id = $1`, s.D);
      // Otra vez: ya sin marca de B, el DELETE no encuentra nada que sea suyo.
      const segunda = await tx.$executeRawUnsafe(`DELETE FROM distrito_zona_especial WHERE distrito_id = $1`, s.D);
      await comoDueno(tx);
      const distritoDespues = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM distrito WHERE id = $1`, s.D);
      return { distritoAntes, distritoDespues, marcadas, desmarcadas, segunda, marcasD: await marcasDe(tx, s.D) };
    });
    expect(r.marcadas).toBe(1);
    expect(r.desmarcadas).toBe(1);
    expect(r.segunda).toBe(0);
    expect(r.marcasD).toEqual([s.A]);
    expect(r.distritoAntes).toHaveLength(1);
    expect(r.distritoDespues).toEqual(r.distritoAntes);
  });

  /* ------------------- R10 y R13 por el repositorio real (T6) ------------------- */

  /** Las marcas de B, medidas como dueno, para limpiar lo que el repositorio commitea. */
  async function borrarMarcasDeB(): Promise<void> {
    await bajoLockDeEscrituraReal(() =>
      base.$executeRawUnsafe(`DELETE FROM distrito_zona_especial WHERE organizacion_id = $1`, s.B),
    );
  }

  it("R10: por el repositorio real, B marca y desmarca D y la marca de A sigue; la fila de distrito no cambia", async () => {
    const repo = new DistritoZonaEspecialRepository(app);
    const distritoAntes = await base.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM distrito WHERE id = $1`, s.D);
    try {
      const marcar = await conEmpresa(s.B, () => repo.aplicarCambios({ marcar: [s.D], desmarcar: [] }));
      expect(await marcasDeBase(s.D)).toEqual([s.A, s.B].sort());
      // Marcar otra vez lo ya marcado no duplica ni cuenta (R9).
      const otraVez = await conEmpresa(s.B, () => repo.aplicarCambios({ marcar: [s.D], desmarcar: [] }));
      const desmarcar = await conEmpresa(s.B, () => repo.aplicarCambios({ marcar: [], desmarcar: [s.D] }));
      // Ya sin la suya, B desmarca de nuevo: no encuentra nada que sea suyo, y la de A no se toca.
      const segunda = await conEmpresa(s.B, () => repo.aplicarCambios({ marcar: [], desmarcar: [s.D] }));
      expect(marcar).toEqual({ estado: "ok", creadas: 1, borradas: 0 });
      expect(otraVez).toEqual({ estado: "ok", creadas: 0, borradas: 0 });
      expect(desmarcar).toEqual({ estado: "ok", creadas: 0, borradas: 1 });
      expect(segunda).toEqual({ estado: "ok", creadas: 0, borradas: 0 });
      expect(await marcasDeBase(s.D)).toEqual([s.A]);
      const distritoDespues = await base.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM distrito WHERE id = $1`, s.D);
      expect(distritoAntes).toHaveLength(1);
      expect(distritoDespues).toEqual(distritoAntes);
    } finally {
      await borrarMarcasDeB();
    }
  });

  it("R13: un id inexistente en marcar da validation_error y no deja nada del lote, ni el desmarcado", async () => {
    const repo = new DistritoZonaEspecialRepository(app);
    const service = new DistritoZonaEspecialService(repo);
    try {
      // B tiene marcado D2: el lote que falla intenta desmarcarlo. Si el borrado no fuera en la
      // misma transaccion que la creacion, la marca de B desapareceria aunque el lote fallara.
      expect(await conEmpresa(s.B, () => repo.aplicarCambios({ marcar: [s.D2], desmarcar: [] }))).toEqual({
        estado: "ok",
        creadas: 1,
        borradas: 0,
      });
      const antes = await base.distritoZonaEspecial.count();
      const inexistente = `no-existe-${randomUUID()}`;

      const porRepo = await conEmpresa(s.B, () => repo.aplicarCambios({ marcar: [s.D, inexistente], desmarcar: [s.D2] }));
      const porAccion = await conEmpresa(s.B, () =>
        actualizarDistritosEspeciales(
          { marcar: [inexistente, s.D], desmarcar: [s.D2] },
          { getActor: async () => ({ usuarioId: "u-maestro-b", rol: "maestro" }), distritoZonaEspecialService: service },
        ),
      );

      expect(porRepo).toEqual({ estado: "distrito_inexistente" });
      expect(porAccion).toEqual({ status: "validation_error" });
      expect(await base.distritoZonaEspecial.count()).toBe(antes);
      expect(await marcasDeBase(s.D2)).toEqual([s.B]);
      expect(await marcasDeBase(s.D)).toEqual([s.A]);
    } finally {
      await borrarMarcasDeB();
    }
  });
});
