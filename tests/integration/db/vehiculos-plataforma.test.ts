import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { appendRastroVehiculo } from "@/lib/repositories/registrar-rastro-vehiculo";
import { VehiculoRepository } from "@/lib/repositories/VehiculoRepository";
import {
  cambiarActivacionVehiculoAction,
  crearVehiculoAction,
  listarVehiculosPlataformaAction,
  renombrarVehiculoAction,
  type VehiculosPlataformaDeps,
} from "@/lib/actions/vehiculos-plataforma";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { VehiculoService } from "@/lib/services/VehiculoService";
import {
  comoApp,
  crearOrganizacion,
  datosDeOrganizacionDePrueba,
  fijarEmpresa,
} from "@/tests/fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";
import { intentar, revertida } from "./_fixtures/pais-20";
import {
  idDeRol,
  insertarUsuario,
  liberarHuecoDeSuperadmin,
  tomarLockDeSuperadmin,
} from "./_fixtures/superadmin-32";

// SL-42 — el catálogo de vehículos como dato de plataforma, contra Postgres real.
//
// T1.2 (design §2.2, R22): una empresa no lee ni escribe `vehiculo_rastro` por ninguna vía. La conexión
// del test es la del dueño; `comoApp` baja la transacción a `servi_app`, como hace la app, y el cliente
// de la app (`conAislamientoPorEmpresa` + `conEmpresa`) prueba además la vía por modelo.
//
// SIEMBRA DENTRO DE LA TRANSACCIÓN REVERTIDA: la fila de rastro se escribe como dueño con el escritor
// único y se COMPRUEBA antes de bajar a `servi_app`. Un 42501 sobre una tabla vacía diría lo mismo,
// pero «no lee la fila que existe» necesita que exista.
//
// T2 añade aquí R6, R7 y R21.

describe.skipIf(!HAY_BASE_DE_DATOS)("SL-42 — `vehiculo_rastro` sin acceso para servi_app (R22)", () => {
  let base: PrismaClient;
  let app: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R22 — SQL a mano con servi_app: SELECT, INSERT, UPDATE y DELETE de `vehiculo_rastro` dan 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const vehiculoId = randomUUID();
      await appendRastroVehiculo(tx, {
        accion: "vehiculo_creado",
        vehiculoId,
        vehiculoNombre: "sl42 rastro",
        actorUsuarioId: randomUUID(),
        actorNombre: "Superadmin de prueba",
      });
      // Control como dueño: la fila está y la tabla se lee (el 42501 de abajo es de privilegios).
      const sembradas = await tx.vehiculoRastro.count({ where: { vehiculoId } });
      const { id } = await tx.organizacion.create({
        data: datosDeOrganizacionDePrueba(),
        select: { id: true },
      });
      await comoApp(tx, id);
      return {
        sembradas,
        leer: await intentar(tx, `SELECT * FROM "vehiculo_rastro"`),
        leerLaPropia: await intentar(
          tx,
          `SELECT * FROM "vehiculo_rastro" WHERE "vehiculo_id" = $1`,
          vehiculoId,
        ),
        insertar: await intentar(
          tx,
          `INSERT INTO "vehiculo_rastro" ("id", "vehiculo_id", "vehiculo_nombre", "accion", "actor_usuario_id", "actor_nombre")
           VALUES ($1, $2, 'x', 'vehiculo_activado', 'x', 'x')`,
          randomUUID(),
          vehiculoId,
        ),
        actualizar: await intentar(
          tx,
          `UPDATE "vehiculo_rastro" SET "vehiculo_nombre" = 'x' WHERE "vehiculo_id" = $1`,
          vehiculoId,
        ),
        borrar: await intentar(tx, `DELETE FROM "vehiculo_rastro" WHERE "vehiculo_id" = $1`, vehiculoId),
      };
    });
    const { sembradas, ...sqlstates } = r;
    expect(sembradas).toBe(1);
    for (const [caso, sqlstate] of Object.entries(sqlstates)) expect(sqlstate, caso).toBe("42501");
  });

  it("R22 — por el cliente de la app en contexto de empresa: leer o escribir el rastro se rechaza", async () => {
    const rechazo = /42501|permiso denegado|permission denied/;
    const A = randomUUID();
    await expect(conEmpresa(A, () => app.vehiculoRastro.findMany())).rejects.toThrow(rechazo);
    await expect(
      conEmpresa(A, () =>
        app.vehiculoRastro.create({
          data: {
            accion: "vehiculo_creado",
            vehiculoId: randomUUID(),
            vehiculoNombre: "x",
            actorUsuarioId: "x",
            actorNombre: "x",
          },
        }),
      ),
    ).rejects.toThrow(rechazo);
  });
});

// T2.2 (design §2.2, §4.2; R6, R7, R21) — el repositorio contra Postgres, con un superadmin SIN
// empresa como actor. Todo dentro de una transaccion del dueño que se revierte: el superadmin se
// siembra en ella (apartando el que hubiera, `liberarHuecoDeSuperadmin`), asi que no queda nada. El
// repositorio corre sobre `clienteConSavepoint`, que abre un SAVEPOINT real en su `$transaction`.
// Que el borde lo haga sin `EmpresaNoResuelta` por el cliente de la app lo prueba el bloque de T2.4.

interface FilaRastro {
  accion: string;
  vehiculo_id: string;
  vehiculo_nombre: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  actor_usuario_id: string;
  actor_nombre: string;
}

async function rastroDe(tx: TxDeTest, vehiculoId: string): Promise<FilaRastro[]> {
  return tx.$queryRawUnsafe<FilaRastro[]>(
    `SELECT "accion"::text AS accion, "vehiculo_id", "vehiculo_nombre", "valor_anterior", "valor_nuevo",
            "actor_usuario_id", "actor_nombre"
       FROM "vehiculo_rastro" WHERE "vehiculo_id" = $1 ORDER BY "created_at", "id"`,
    vehiculoId,
  );
}

const NOMBRE_DEL_SUPERADMIN = "Prueba SL-32";

/**
 * El superadmin sin empresa de cada caso, DENTRO de la tx revertida. En CI la base no tiene ninguno
 * y se siembra uno (`insertarUsuario`). En una base de desarrollo el que existe suele tener filas que
 * lo referencian: no se puede borrar (23503) ni pasar a una empresa (SL017), y el indice
 * `usuario_un_solo_superadmin` no deja sembrar otro. Entonces se usa ese, con el nombre fijado solo
 * dentro de esta tx para que el congelado sea determinista. El rollback lo devuelve tal cual.
 */
async function superadminSinEmpresa(tx: TxDeTest): Promise<string> {
  const rolSuperadmin = await idDeRol(tx, "superadmin");
  const existente = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "usuario" WHERE "rol_id" = $1`,
    rolSuperadmin,
  );
  if (existente.length === 0) {
    await liberarHuecoDeSuperadmin(tx, rolSuperadmin);
    const u = await insertarUsuario(tx, rolSuperadmin, null);
    if (!u.desenlace.ok) throw new Error(`no se sembro el superadmin: ${JSON.stringify(u.desenlace)}`);
    return u.id;
  }
  const id = existente[0].id;
  await tx.$executeRawUnsafe(
    `UPDATE "usuario" SET "nombre" = $1, "primer_apellido" = NULL WHERE "id" = $2`,
    NOMBRE_DEL_SUPERADMIN,
    id,
  );
  return id;
}

function nombreUnico(prefijo: string): string {
  return `${prefijo} ${randomUUID().slice(0, 8)}`;
}

describe.skipIf(!HAY_BASE_DE_DATOS)("SL-42 — VehiculoRepository: escritura y rastro (R6, R7, R21)", () => {
  let base: PrismaClient;
  let soltarSuperadmin: () => Promise<void> = async () => {};

  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  }, 60_000);

  afterAll(async () => {
    try {
      await soltarSuperadmin();
    } finally {
      await base?.$disconnect();
    }
  });

  /** Superadmin sin empresa, sembrado en la tx revertida; y el repositorio sobre esa tx. */
  async function conSuperadmin<T>(
    fn: (c: { tx: TxDeTest; repo: VehiculoRepository; actorId: string }) => Promise<T>,
  ): Promise<T> {
    return revertida(base, async (tx) => {
      const actorId = await superadminSinEmpresa(tx);
      return fn({ tx, repo: new VehiculoRepository(clienteConSavepoint(tx)), actorId });
    });
  }

  it("R7/R21 — el alta del superadmin sin empresa guarda el tipo activo y su rastro con el actor congelado", async () => {
    const r = await conSuperadmin(async ({ tx, repo, actorId }) => {
      const sinEmpresa = await tx.usuario.findUnique({ where: { id: actorId }, select: { organizacionId: true } });
      const creado = await repo.create(nombreUnico("sl42 alta"), actorId);
      return { sinEmpresa, creado, rastro: await rastroDe(tx, creado.id), actorId };
    });
    expect(r.sinEmpresa?.organizacionId).toBeNull();
    expect(r.creado.activo).toBe(true);
    expect(r.rastro).toEqual([
      {
        accion: "vehiculo_creado",
        vehiculo_id: r.creado.id,
        vehiculo_nombre: r.creado.name,
        valor_anterior: null,
        valor_nuevo: null,
        actor_usuario_id: r.actorId,
        actor_nombre: NOMBRE_DEL_SUPERADMIN,
      },
    ]);
  });

  it("R5/R21 — el renombre deja anterior y nuevo; renombrar a su propio nombre no escribe ni deja fila", async () => {
    const r = await conSuperadmin(async ({ tx, repo, actorId }) => {
      const creado = await repo.create(nombreUnico("sl42 antes"), actorId);
      const nuevo = nombreUnico("sl42 despues");
      const renombrado = await repo.rename(creado.id, nuevo, actorId);
      const mismo = await repo.rename(creado.id, nuevo, actorId);
      return { creado, nuevo, renombrado, mismo, rastro: await rastroDe(tx, creado.id) };
    });
    expect(r.renombrado).toEqual({ id: r.creado.id, name: r.nuevo, activo: true });
    expect(r.mismo).toEqual(r.renombrado);
    expect(r.rastro.map((f) => f.accion)).toEqual(["vehiculo_creado", "vehiculo_renombrado"]);
    expect(r.rastro[1]).toMatchObject({
      vehiculo_nombre: r.nuevo,
      valor_anterior: r.creado.name,
      valor_nuevo: r.nuevo,
      actor_nombre: NOMBRE_DEL_SUPERADMIN,
    });
  });

  it("R6/R21 — desactivar no borra la fila ni toca al mensajero ni a la tarifa; el mismo estado no deja fila", async () => {
    const r = await conSuperadmin(async ({ tx, repo, actorId }) => {
      const vehiculo = await repo.create(nombreUnico("sl42 estado"), actorId);

      // Un mensajero de una empresa y una tarifa de zona que lo referencian.
      const org = await crearOrganizacion(tx);
      await fijarEmpresa(tx, org.id);
      const zona = await tx.zona.create({
        data: { nombre: nombreUnico("Zona sl42"), sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true },
      });
      const tarifa = await tx.tarifaZonaMensajero.create({
        data: { zonaId: zona.id, vehiculoId: vehiculo.id, cobroEntregado: "1500.00", cobroRechazado: "164.00" },
        select: { id: true },
      });
      const mensajero = await insertarUsuario(tx, await idDeRol(tx, "mensajero"), org.id);
      if (!mensajero.desenlace.ok) {
        throw new Error(`no se sembro el mensajero: ${JSON.stringify(mensajero.desenlace)}`);
      }
      await tx.$executeRawUnsafe(`UPDATE "usuario" SET "vehiculo_id" = $1 WHERE "id" = $2`, vehiculo.id, mensajero.id);

      const desactivado = await repo.setActivo(vehiculo.id, false, actorId);
      const otraVez = await repo.setActivo(vehiculo.id, false, actorId);
      const fila = await tx.vehiculo.findUnique({ where: { id: vehiculo.id } });
      const delMensajero = await tx.usuario.findUnique({ where: { id: mensajero.id }, select: { vehiculoId: true } });
      const deLaTarifa = await tx.tarifaZonaMensajero.findUnique({
        where: { id: tarifa.id },
        select: { vehiculoId: true },
      });
      const activos = await repo.findMany({ soloActivos: true });
      const todos = await repo.findMany();
      const reactivado = await repo.setActivo(vehiculo.id, true, actorId);
      return {
        vehiculo,
        desactivado,
        otraVez,
        fila,
        delMensajero,
        deLaTarifa,
        reactivado,
        enActivos: activos.some((v) => v.id === vehiculo.id),
        enTodos: todos.find((v) => v.id === vehiculo.id),
        rastro: await rastroDe(tx, vehiculo.id),
      };
    });
    expect(r.desactivado).toEqual({ ...r.vehiculo, activo: false });
    expect(r.otraVez).toEqual(r.desactivado);
    expect(r.fila?.activo).toBe(false);
    expect(r.delMensajero?.vehiculoId).toBe(r.vehiculo.id);
    expect(r.deLaTarifa?.vehiculoId).toBe(r.vehiculo.id);
    // R2/R18: la lista entera trae el inactivo; la de elecciones nuevas no.
    expect(r.enActivos).toBe(false);
    expect(r.enTodos).toEqual({ ...r.vehiculo, activo: false });
    expect(r.reactivado?.activo).toBe(true);
    expect(r.rastro.map((f) => f.accion)).toEqual(["vehiculo_creado", "vehiculo_desactivado", "vehiculo_activado"]);
    expect(r.rastro[1]).toMatchObject({ vehiculo_nombre: r.vehiculo.name, valor_anterior: null, valor_nuevo: null });
  });

  it("R12/R21 — renombrar o cambiar el estado de un id que no existe devuelve null y no deja rastro", async () => {
    const r = await conSuperadmin(async ({ tx, repo, actorId }) => {
      const id = randomUUID();
      return {
        renombre: await repo.rename(id, nombreUnico("sl42 nadie"), actorId),
        estado: await repo.setActivo(id, false, actorId),
        rastro: await rastroDe(tx, id),
      };
    });
    expect(r).toEqual({ renombre: null, estado: null, rastro: [] });
  });

  it("R10/R21 — el alta con un nombre que ya existe choca con el unico y no deja ni fila ni rastro", async () => {
    const r = await conSuperadmin(async ({ tx, repo, actorId }) => {
      const nombre = nombreUnico("sl42 doble");
      await repo.create(nombre, actorId);
      const antes = await tx.vehiculoRastro.count();
      let error: unknown = null;
      try {
        await repo.create(nombre, actorId);
      } catch (e) {
        error = e;
      }
      return {
        error,
        filas: await tx.vehiculo.count({ where: { name: nombre } }),
        nuevas: (await tx.vehiculoRastro.count()) - antes,
      };
    });
    expect(r.error).not.toBeNull();
    expect(r.filas).toBe(1);
    expect(r.nuevas).toBe(0);
  });
});

// T2.4 (design §3 enmienda 2026-11-04, §4.3; R7, R21) — el BORDE contra Postgres, por el cliente de
// la app (`conAislamientoPorEmpresa`) y sin empresa, como corre una peticion del superadmin. Solo se
// inyectan el actor (no hay cookie) y el servicio construido sobre ese cliente: `comoPlataforma` y
// todo lo de debajo son los reales.
//
// AQUI SE COMMITEA: el cliente de la app abre sus propias conexiones y no ve una tx revertida. Cada
// vehiculo lleva un nombre unico y `afterAll` borra sus filas y las de su rastro. El superadmin: si la
// base no tiene, se crea y se borra al final (como `carga-division.test.ts`); si ya tiene uno (base de
// desarrollo), se usa ese y no se toca. El lock de superadmin se sostiene todo el archivo.

describe.skipIf(!HAY_BASE_DE_DATOS)("SL-42 — el borde del superadmin sin empresa, por el cliente de la app (R7, R21)", () => {
  let base: PrismaClient;
  let app: PrismaClient;
  let actor: Actor;
  let actorNombre: string;
  let superadminCreado: string | null = null;
  const creados: string[] = [];
  let soltarSuperadmin: () => Promise<void> = async () => {};

  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    soltarSuperadmin = await tomarLockDeSuperadmin();
    const id = await bajoLockDeEscrituraReal(() =>
      base.$transaction(async (tx) => {
        const rol = await idDeRol(tx, "superadmin");
        const existente = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT "id" FROM "usuario" WHERE "rol_id" = $1`,
          rol,
        );
        if (existente.length > 0) return existente[0].id;
        const u = await insertarUsuario(tx, rol, null);
        if (!u.desenlace.ok) throw new Error(`no se sembro el superadmin: ${JSON.stringify(u.desenlace)}`);
        superadminCreado = u.id;
        return u.id;
      }),
    );
    const u = await base.usuario.findUniqueOrThrow({
      where: { id },
      select: { nombre: true, primerApellido: true, organizacionId: true },
    });
    if (u.organizacionId !== null) throw new Error("el superadmin de la base tiene empresa: no prueba R7");
    actor = { usuarioId: id, rol: "superadmin" };
    actorNombre = [u.nombre, u.primerApellido].filter((p) => p != null && p !== "").join(" ").slice(0, 120);
  }, 60_000);

  afterAll(async () => {
    try {
      if (base !== undefined) {
        await bajoLockDeEscrituraReal(async () => {
          if (creados.length > 0) {
            await base.vehiculoRastro.deleteMany({ where: { vehiculoId: { in: creados } } });
            await base.vehiculo.deleteMany({ where: { id: { in: creados } } });
          }
          if (superadminCreado !== null) {
            await base.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, superadminCreado);
          }
        });
      }
    } finally {
      await soltarSuperadmin();
      await base?.$disconnect();
    }
  }, 60_000);

  function depsDeApp(): VehiculosPlataformaDeps {
    return { getActor: async () => actor, vehiculoService: new VehiculoService(new VehiculoRepository(app)) };
  }

  async function rastroDeApp(vehiculoId: string) {
    return base.vehiculoRastro.findMany({
      where: { vehiculoId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { accion: true, vehiculoNombre: true, valorAnterior: true, valorNuevo: true, actorUsuarioId: true, actorNombre: true },
    });
  }

  it("control: sin `comoPlataforma`, el mismo servicio sobre el cliente de la app cae en EmpresaNoResuelta y no deja nada", async () => {
    const nombre = nombreUnico("sl42 sin contexto");
    const servicio = new VehiculoService(new VehiculoRepository(app));
    await expect(servicio.crear({ name: nombre }, actor)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(await base.vehiculo.count({ where: { name: nombre } })).toBe(0);
  });

  it("R7/R21: alta, renombre, desactivar y activar por el borde; cada una con su rastro y el actor congelado", async () => {
    const nombre = nombreUnico("sl42 borde");
    const alta = await crearVehiculoAction({ name: `  ${nombre.replace(" ", "   ")} ` }, depsDeApp());
    expect(alta.status).toBe("ok");
    if (alta.status !== "ok") return;
    creados.push(alta.vehiculo.id);
    expect(alta.vehiculo).toEqual({ id: alta.vehiculo.id, name: nombre, activo: true });

    const nuevo = nombreUnico("sl42 borde nuevo");
    expect((await renombrarVehiculoAction({ id: alta.vehiculo.id, name: nuevo }, depsDeApp())).status).toBe("ok");
    expect((await renombrarVehiculoAction({ id: alta.vehiculo.id, name: nuevo }, depsDeApp())).status).toBe("ok");
    const off = await cambiarActivacionVehiculoAction({ id: alta.vehiculo.id, activo: false }, depsDeApp());
    expect(off).toEqual({ status: "ok", vehiculo: { id: alta.vehiculo.id, name: nuevo, activo: false } });
    expect((await cambiarActivacionVehiculoAction({ id: alta.vehiculo.id, activo: false }, depsDeApp())).status).toBe("ok");
    expect((await cambiarActivacionVehiculoAction({ id: alta.vehiculo.id, activo: true }, depsDeApp())).status).toBe("ok");

    // R2: la lista del superadmin trae el tipo; la fila sigue en la base.
    const lista = await listarVehiculosPlataformaAction(depsDeApp());
    expect(lista.status === "ok" && lista.items.some((v) => v.id === alta.vehiculo.id)).toBe(true);

    const comun = { actorUsuarioId: actor.usuarioId, actorNombre };
    // Los dos no-op (mismo nombre, mismo estado) no dejan fila.
    expect(await rastroDeApp(alta.vehiculo.id)).toEqual([
      { accion: "vehiculo_creado", vehiculoNombre: nombre, valorAnterior: null, valorNuevo: null, ...comun },
      { accion: "vehiculo_renombrado", vehiculoNombre: nuevo, valorAnterior: nombre, valorNuevo: nuevo, ...comun },
      { accion: "vehiculo_desactivado", vehiculoNombre: nuevo, valorAnterior: null, valorNuevo: null, ...comun },
      { accion: "vehiculo_activado", vehiculoNombre: nuevo, valorAnterior: null, valorNuevo: null, ...comun },
    ]);
  });

  it("R10/R12 por el borde: nombre repetido -> conflict, id inexistente -> not_found, sin rastro", async () => {
    const nombre = nombreUnico("sl42 repetido");
    const alta = await crearVehiculoAction({ name: nombre }, depsDeApp());
    if (alta.status !== "ok") throw new Error(`alta: ${alta.status}`);
    creados.push(alta.vehiculo.id);

    expect(await crearVehiculoAction({ name: nombre }, depsDeApp())).toEqual({ status: "conflict" });
    const fantasma = randomUUID();
    expect(await renombrarVehiculoAction({ id: fantasma, name: nombreUnico("x") }, depsDeApp())).toEqual({
      status: "not_found",
    });
    expect(await cambiarActivacionVehiculoAction({ id: fantasma, activo: false }, depsDeApp())).toEqual({
      status: "not_found",
    });
    expect(await base.vehiculo.count({ where: { name: nombre } })).toBe(1);
    expect((await rastroDeApp(alta.vehiculo.id)).map((f) => f.accion)).toEqual(["vehiculo_creado"]);
    expect(await rastroDeApp(fantasma)).toEqual([]);
  });
});
