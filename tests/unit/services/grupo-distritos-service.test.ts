import { describe, it, expect, vi, type Mock } from "vitest";
import { Prisma, type RolValue } from "@prisma/client";

import { GrupoDistritosService } from "@/lib/services/GrupoDistritosService";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import type { IGrupoDistritosRepository } from "@/lib/interfaces/repositories/IGrupoDistritosRepository";
import type { Actor } from "@/lib/interfaces/services/IGrupoDistritosService";

// SLT-52 T6.2 (design §8) — GrupoDistritosService. Cubre R10, R11, R13, R14.
// Las reglas con un doble del repositorio; el historial «en la misma transaccion» (R14) y la
// traduccion de lo que rechaza la base (R11) con el repositorio REAL sobre un doble de Prisma.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const NO_ESCRIBEN: Actor[] = [
  ADMIN,
  { usuarioId: "u-tienda", rol: "adminTienda" },
  { usuarioId: "u-mens", rol: "mensajero" },
  { usuarioId: "u-sat", rol: "adminSatelite" },
  { usuarioId: "u-key", rol: "apiKey" },
  { usuarioId: "u-super", rol: "superadmin" },
  { usuarioId: "u-x", rol: "invitado" as RolValue },
];
const NO_LEEN = NO_ESCRIBEN.filter((a) => a.rol !== "admin");

type RepoDoble = IGrupoDistritosRepository & { [K in keyof IGrupoDistritosRepository]: Mock };

function repoDoble(overrides: Partial<RepoDoble> = {}): RepoDoble {
  return {
    existeZona: vi.fn().mockResolvedValue(true),
    buscar: vi.fn().mockResolvedValue({ id: "g-1", zonaId: "zona-1", nombre: "Oeste" }),
    nombreOcupado: vi.fn().mockResolvedValue(false),
    distritosDeLaZona: vi.fn(async (_z: string, ids: readonly string[]) => [...ids]),
    nombresDeDistritos: vi.fn().mockResolvedValue(new Map<string, string>()),
    distritosEnOtroGrupo: vi.fn().mockResolvedValue([]),
    crear: vi.fn().mockResolvedValue({ status: "ok", id: "g-nuevo" }),
    renombrar: vi.fn().mockResolvedValue("ok"),
    fijarDistritos: vi.fn().mockResolvedValue("ok"),
    borrar: vi.fn().mockResolvedValue("ok"),
    listar: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

type Repo = ReturnType<typeof repoDoble>;

function escrituras(repo: Repo) {
  return [repo.crear, repo.renombrar, repo.fijarDistritos, repo.borrar];
}

const CREAR = { zonaId: "zona-1", nombre: "Oeste", distritoIds: ["d-pavas", "d-hatillo"] };

/**
 * SLT-89 (T5.6, R43–R45; decision del 2026-11-09): el «antes» obligatorio de renombrar, fijar miembros
 * y borrar, igual a lo que el doble da por sembrado. Solo entrada (y las aserciones de llamada sobre el
 * doble, que ganan el «antes» en su posicion).
 */
const ANTES_MIEMBROS = { distritoIds: [] as string[], nodoIds: [] as string[] };
const ANTES_BORRAR = { nombre: "Oeste", distritoIds: [] as string[], nodoIds: [] as string[], valores: 0 };

describe("R13 — matriz de roles", () => {
  it.each(NO_ESCRIBEN)("$rol recibe forbidden en las cuatro escrituras y no se escribe nada", async (actor) => {
    const repo = repoDoble();
    const svc = new GrupoDistritosService(repo);
    expect(await svc.crearGrupo(CREAR, actor)).toEqual({ status: "forbidden" });
    expect(await svc.renombrarGrupo("g-1", "Otro", "Oeste", actor)).toEqual({ status: "forbidden" });
    expect(await svc.fijarDistritos("g-1", ["d-pavas"], ANTES_MIEMBROS, actor)).toEqual({ status: "forbidden" });
    expect(await svc.borrarGrupo("g-1", ANTES_BORRAR, actor)).toEqual({ status: "forbidden" });
    for (const w of escrituras(repo)) expect(w).not.toHaveBeenCalled();
  });

  it("el maestro crea, renombra, mueve distritos y borra", async () => {
    const repo = repoDoble();
    const svc = new GrupoDistritosService(repo);
    expect(await svc.crearGrupo(CREAR, MAESTRO)).toEqual({ status: "ok", id: "g-nuevo" });
    expect(await svc.renombrarGrupo("g-1", "Oeste 2", "Oeste", MAESTRO)).toEqual({ status: "ok" });
    expect(await svc.fijarDistritos("g-1", ["d-pavas"], ANTES_MIEMBROS, MAESTRO)).toEqual({ status: "ok" });
    expect(await svc.borrarGrupo("g-1", ANTES_BORRAR, MAESTRO)).toEqual({ status: "ok" });
    expect(repo.crear.mock.calls[0][1]).toBe("u-maestro");
    expect(repo.borrar).toHaveBeenCalledWith("g-1", ANTES_BORRAR, "u-maestro");
  });

  it.each([MAESTRO, ADMIN])("$rol lee los grupos de una zona", async (actor) => {
    const repo = repoDoble();
    expect(await new GrupoDistritosService(repo).listarGrupos("zona-1", actor)).toEqual({ status: "ok", items: [] });
    expect(repo.listar).toHaveBeenCalledWith("zona-1");
  });

  it.each(NO_LEEN)("$rol recibe forbidden al leer y no se consulta", async (actor) => {
    const repo = repoDoble();
    expect(await new GrupoDistritosService(repo).listarGrupos("zona-1", actor)).toEqual({ status: "forbidden" });
    expect(repo.listar).not.toHaveBeenCalled();
  });
});

describe("R10 — el grupo es de una zona de la empresa con nombre unico en ella", () => {
  it("crea el grupo en su zona con los distritos sin repetir", async () => {
    const repo = repoDoble();
    await new GrupoDistritosService(repo).crearGrupo(
      { zonaId: "zona-1", nombre: "  Oeste  ", distritoIds: ["d-pavas", "d-pavas", "d-hatillo"] },
      MAESTRO,
    );
    expect(repo.crear.mock.calls[0][0]).toEqual({
      zonaId: "zona-1",
      nombre: "Oeste",
      distritoIds: ["d-pavas", "d-hatillo"],
    });
  });

  it("una zona que no existe en la empresa se rechaza en zonaId sin escribir", async () => {
    const repo = repoDoble({ existeZona: vi.fn().mockResolvedValue(false) });
    const res = await new GrupoDistritosService(repo).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({ status: "validation_error", fieldErrors: { zonaId: ["La zona indicada no existe."] } });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un nombre ya usado en la zona se rechaza en nombre sin escribir", async () => {
    const repo = repoDoble({ nombreOcupado: vi.fn().mockResolvedValue(true) });
    const res = await new GrupoDistritosService(repo).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { nombre: ["Ya hay un grupo con ese nombre en la zona."] },
    });
    expect(repo.nombreOcupado).toHaveBeenCalledWith("zona-1", "Oeste", null);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("renombrar a un nombre de otro grupo de la zona se rechaza, excluyendo al propio", async () => {
    const repo = repoDoble({ nombreOcupado: vi.fn().mockResolvedValue(true) });
    const res = await new GrupoDistritosService(repo).renombrarGrupo("g-1", "Este", "Oeste", MAESTRO);
    expect(res.status).toBe("validation_error");
    expect(repo.nombreOcupado).toHaveBeenCalledWith("zona-1", "Este", "g-1");
    expect(repo.renombrar).not.toHaveBeenCalled();
  });

  it.each([
    ["en blanco", "   "],
    ["de mas de 60 caracteres", "x".repeat(61)],
  ])("un nombre %s se rechaza en nombre sin escribir", async (_c, nombre) => {
    const repo = repoDoble();
    const res = await new GrupoDistritosService(repo).crearGrupo({ ...CREAR, nombre }, MAESTRO);
    expect(res.status).toBe("validation_error");
    if (res.status !== "validation_error") throw new Error("inalcanzable");
    expect(Object.keys(res.fieldErrors)).toEqual(["nombre"]);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("renombrar o mover distritos de un grupo que no existe es not_found", async () => {
    const repo = repoDoble({ buscar: vi.fn().mockResolvedValue(null) });
    const svc = new GrupoDistritosService(repo);
    expect(await svc.renombrarGrupo("g-x", "Otro", "Oeste", MAESTRO)).toEqual({ status: "not_found" });
    expect(await svc.fijarDistritos("g-x", ["d-pavas"], ANTES_MIEMBROS, MAESTRO)).toEqual({ status: "not_found" });
    expect(repo.renombrar).not.toHaveBeenCalled();
    expect(repo.fijarDistritos).not.toHaveBeenCalled();
  });

  it("borrar un grupo que no existe es not_found", async () => {
    const repo = repoDoble({ borrar: vi.fn().mockResolvedValue("not_found") });
    expect(await new GrupoDistritosService(repo).borrarGrupo("g-x", ANTES_BORRAR, MAESTRO)).toEqual({ status: "not_found" });
  });
});

describe("R11 — distrito ajeno a la zona o ya en otro grupo, nombrando el distrito", () => {
  it("un distrito que no es de la zona se rechaza nombrandolo y no se escribe", async () => {
    const repo = repoDoble({
      distritosDeLaZona: vi.fn().mockResolvedValue(["d-hatillo"]),
      nombresDeDistritos: vi.fn().mockResolvedValue(new Map([["d-pavas", "Pavas"]])),
    });
    const res = await new GrupoDistritosService(repo).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Pavas no pertenece a la zona."] },
    });
    expect(repo.nombresDeDistritos).toHaveBeenCalledWith(["d-pavas"]);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un distrito ya en otro grupo de la zona se rechaza nombrando distrito y grupo", async () => {
    const repo = repoDoble({
      distritosEnOtroGrupo: vi
        .fn()
        .mockResolvedValue([{ distritoId: "d-hatillo", distritoNombre: "Hatillo", grupoNombre: "Sur" }]),
    });
    const res = await new GrupoDistritosService(repo).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Hatillo ya está en el grupo Sur."] },
    });
    expect(repo.distritosEnOtroGrupo).toHaveBeenCalledWith("zona-1", ["d-pavas", "d-hatillo"], null);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("al mover distritos, el grupo propio no cuenta como «otro grupo» y se usa SU zona", async () => {
    const repo = repoDoble({
      distritosEnOtroGrupo: vi
        .fn()
        .mockResolvedValue([{ distritoId: "d-hatillo", distritoNombre: "Hatillo", grupoNombre: "Sur" }]),
    });
    const res = await new GrupoDistritosService(repo).fijarDistritos("g-1", ["d-hatillo"], ANTES_MIEMBROS, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Hatillo ya está en el grupo Sur."] },
    });
    expect(repo.distritosDeLaZona).toHaveBeenCalledWith("zona-1", ["d-hatillo"]);
    expect(repo.distritosEnOtroGrupo).toHaveBeenCalledWith("zona-1", ["d-hatillo"], "g-1");
    expect(repo.fijarDistritos).not.toHaveBeenCalled();
  });

  it("lo que rechaza la base en una carrera sale con el mismo campo distritoIds", async () => {
    const repo = repoDoble({ crear: vi.fn().mockResolvedValue({ status: "distrito_rechazado" }) });
    const res = await new GrupoDistritosService(repo).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Alguno de los elegidos ya está en otro grupo de la zona o no pertenece a ella."] },
    });
  });
});

// ---------------------------------------------------------------------------------------------
// R11 (respaldo de la base) y R14 con el repositorio REAL.
// ---------------------------------------------------------------------------------------------

function prismaDoble(grupo: { nombre: string; distritos: number; valores: number; actuales?: string[] } | null) {
  const tx = {
    // SLT-89 (design §5.4): el `SELECT ... FOR UPDATE` del grupo. No devuelve nada que se lea.
    $queryRaw: vi.fn().mockResolvedValue([]),
    // SLT-89 (design §5.2): la tabla de miembros que no son distritos asignados, vacia.
    grupoDistritosNodo: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // SLT-89 (design §5.2): el reparto por tabla; todos los pedidos estan asignados a la zona.
    zonaDistrito: {
      findMany: vi.fn(async (args: { where: { distritoId: { in: string[] } } }) =>
        args.where.distritoId.in.map((distritoId) => ({ distritoId })),
      ),
    },
    grupoDistritos: {
      create: vi.fn().mockResolvedValue({ id: "g-nuevo" }),
      update: vi.fn().mockResolvedValue({ id: "g-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(async (args: { select: Record<string, unknown> }) => {
        if (grupo === null) return null;
        if ("distritos" in args.select && !("_count" in args.select)) {
          return { zonaId: "zona-1", distritos: (grupo.actuales ?? []).map((distritoId) => ({ distritoId })) };
        }
        return {
          nombre: grupo.nombre,
          zona: { nombre: "Central" },
          _count: { distritos: grupo.distritos, nodos: 0, valores: grupo.valores },
        };
      }),
    },
    grupoDistritosDistrito: {
      // SLT-89 (R45): los miembros que `borrar` compara con el «antes».
      findMany: vi.fn().mockResolvedValue((grupo?.actuales ?? []).map((distritoId) => ({ distritoId }))),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ nombre: "Ana", primerApellido: "Mora", rol: { value: "maestro" } }),
    },
    historialAccion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const raiz = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    historialAccion: { createMany: vi.fn() },
    grupoDistritos: {
      findFirst: vi.fn(async (args: { where: { nombre?: string } }) =>
        args.where.nombre !== undefined ? null : { id: "g-1", zonaId: "zona-1", nombre: grupo?.nombre ?? "" },
      ),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    grupoDistritosDistrito: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn(), deleteMany: vi.fn() },
    // SLT-89 (R18): la segunda tabla de miembros, vacia, que ahora tambien se mira al validar.
    grupoDistritosNodo: { findMany: vi.fn().mockResolvedValue([]) },
    zonaDistrito: {
      findMany: vi.fn(async (args: { where: { distritoId: { in: string[] } } }) =>
        args.where.distritoId.in.map((distritoId) => ({ distritoId })),
      ),
    },
    distrito: { findMany: vi.fn().mockResolvedValue([]) },
    zona: { findFirst: vi.fn().mockResolvedValue({ id: "zona-1" }) },
    usuario: { findUnique: vi.fn() },
  };
  return { tx, raiz };
}

function servicioReal(raiz: unknown): GrupoDistritosService {
  return new GrupoDistritosService(
    new GrupoDistritosRepository(raiz as ConstructorParameters<typeof GrupoDistritosRepository>[0]),
  );
}

function filaDeHistorial(tx: ReturnType<typeof prismaDoble>["tx"]) {
  expect(tx.historialAccion.createMany).toHaveBeenCalledTimes(1);
  return tx.historialAccion.createMany.mock.calls[0][0].data[0];
}

describe("R14 — historial con antes y despues, en la misma transaccion (repositorio real)", () => {
  it("crear: grupo y distritos por la tx, y `grupo_distritos_creado` por la misma tx", async () => {
    const { tx, raiz } = prismaDoble({ nombre: "Oeste", distritos: 2, valores: 0 });
    const res = await servicioReal(raiz).crearGrupo(CREAR, MAESTRO);

    expect(res).toEqual({ status: "ok", id: "g-nuevo" });
    expect(tx.grupoDistritos.create).toHaveBeenCalledWith({
      data: { zonaId: "zona-1", nombre: "Oeste" },
      select: { id: true },
    });
    expect(tx.grupoDistritosDistrito.createMany).toHaveBeenCalledWith({
      data: [
        { grupoId: "g-nuevo", zonaId: "zona-1", distritoId: "d-pavas" },
        { grupoId: "g-nuevo", zonaId: "zona-1", distritoId: "d-hatillo" },
      ],
    });
    expect(filaDeHistorial(tx)).toMatchObject({
      accion: "grupo_distritos_creado",
      entidadTipo: "grupo_distritos",
      entidadId: "g-nuevo",
      entidadEtiqueta: "Oeste · Central",
      actorUsuarioId: "u-maestro",
      valorAnterior: null,
      valorNuevo: "2 distritos",
    });
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
    expect(raiz.grupoDistritos.create).not.toHaveBeenCalled();
  });

  it("renombrar: el historial lleva el nombre de antes y el de ahora", async () => {
    const { tx, raiz } = prismaDoble({ nombre: "Oeste", distritos: 2, valores: 0 });
    const res = await servicioReal(raiz).renombrarGrupo("g-1", "Poniente", "Oeste", MAESTRO);

    expect(res).toEqual({ status: "ok" });
    expect(tx.grupoDistritos.update).toHaveBeenCalledWith({
      where: { id: "g-1" },
      data: { nombre: "Poniente" },
      select: { id: true },
    });
    expect(filaDeHistorial(tx)).toMatchObject({
      accion: "grupo_distritos_cambiado",
      valorAnterior: "Oeste",
      valorNuevo: "Poniente",
    });
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
  });

  it("fijar distritos: saca solo los que salen, mete solo los que entran, y cuenta antes y despues", async () => {
    const { tx, raiz } = prismaDoble({
      nombre: "Oeste",
      distritos: 3,
      valores: 0,
      actuales: ["d-pavas", "d-hatillo", "d-uruca"],
    });
    const res = await servicioReal(raiz).fijarDistritos(
      "g-1",
      ["d-pavas", "d-mata"],
      { distritoIds: ["d-pavas", "d-hatillo", "d-uruca"], nodoIds: [] },
      MAESTRO,
    );

    expect(res).toEqual({ status: "ok" });
    expect(tx.grupoDistritosDistrito.deleteMany).toHaveBeenCalledWith({
      where: { grupoId: "g-1", distritoId: { in: ["d-hatillo", "d-uruca"] } },
    });
    expect(tx.grupoDistritosDistrito.createMany).toHaveBeenCalledWith({
      data: [{ grupoId: "g-1", zonaId: "zona-1", distritoId: "d-mata" }],
    });
    expect(filaDeHistorial(tx)).toMatchObject({
      accion: "grupo_distritos_cambiado",
      valorAnterior: "3 distritos",
      valorNuevo: "2 distritos",
    });
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
  });

  it("borrar: el historial dice cuantos distritos y valores se fueron con el grupo (R12)", async () => {
    const { tx, raiz } = prismaDoble({ nombre: "Oeste", distritos: 2, valores: 3 });
    const res = await servicioReal(raiz).borrarGrupo("g-1", { ...ANTES_BORRAR, valores: 3 }, MAESTRO);

    expect(res).toEqual({ status: "ok" });
    expect(tx.grupoDistritos.deleteMany).toHaveBeenCalledWith({ where: { id: "g-1" } });
    expect(filaDeHistorial(tx)).toMatchObject({
      accion: "grupo_distritos_borrado",
      entidadEtiqueta: "Oeste · Central",
      valorAnterior: "2 distritos, 3 valores",
      valorNuevo: null,
    });
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
  });

  it("borrar un grupo que no existe no borra ni deja historial", async () => {
    const { tx, raiz } = prismaDoble(null);
    expect(await servicioReal(raiz).borrarGrupo("g-x", ANTES_BORRAR, MAESTRO)).toEqual({ status: "not_found" });
    expect(tx.grupoDistritos.deleteMany).not.toHaveBeenCalled();
    expect(tx.historialAccion.createMany).not.toHaveBeenCalled();
  });
});

describe("R11 — lo que la base rechaza se traduce al mismo error (repositorio real)", () => {
  it("un P2002 del unico de distritos en la carrera sale como validation_error en distritoIds", async () => {
    const { raiz } = prismaDoble({ nombre: "Oeste", distritos: 0, valores: 0 });
    raiz.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["organizacion_id", "zona_id", "distrito_id"] },
      }),
    );
    const res = await servicioReal(raiz).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Alguno de los elegidos ya está en otro grupo de la zona o no pertenece a ella."] },
    });
  });

  it("un P2002 del unico del nombre en la carrera sale como validation_error en nombre", async () => {
    const { raiz } = prismaDoble({ nombre: "Oeste", distritos: 0, valores: 0 });
    raiz.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["organizacion_id", "zona_id", "nombre"] },
      }),
    );
    const res = await servicioReal(raiz).crearGrupo(CREAR, MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { nombre: ["Ya hay un grupo con ese nombre en la zona."] },
    });
  });
});

/**
 * SLT-89 · R37, R43–R46 (design §5.4, §5.5) — el «antes» obligatorio y el cambio concurrente.
 * Orden: rol → esquema (falta de «antes» → `validation_error` en su campo, sin tocar el repositorio)
 * → `not_found` → `conflict`.
 */
describe("SLT-89 — el «antes» y el cambio concurrente", () => {
  /** Un repositorio que FALLA si se le toca: el rechazo tiene que salir antes. */
  function repoQueFalla(): RepoDoble {
    const falla = () =>
      vi.fn(async () => {
        throw new Error("el repositorio no debia tocarse");
      });
    return repoDoble({
      buscar: falla(),
      nombreOcupado: falla(),
      distritosDeLaZona: falla(),
      distritosEnOtroGrupo: falla(),
      renombrar: falla(),
      fijarDistritos: falla(),
      borrar: falla(),
    });
  }

  it("⭑ R44: renombrar sin `nombreAnterior` → `validation_error` en `nombreAnterior`, sin leer ni escribir", async () => {
    const svc = new GrupoDistritosService(repoQueFalla());
    for (const nombreAnterior of [undefined, "", "   "]) {
      const res = await svc.renombrarGrupo("g-1", "Oeste", nombreAnterior as unknown as string, MAESTRO);
      expect(res.status).toBe("validation_error");
      if (res.status === "validation_error") expect(Object.keys(res.fieldErrors)).toEqual(["nombreAnterior"]);
    }
    // Tambien con un grupo inexistente y con el nombre pedido igual al actual («Oeste»).
    const inexistente = await svc.renombrarGrupo("g-x", "Otro", undefined as unknown as string, MAESTRO);
    expect(inexistente.status).toBe("validation_error");
  });

  it("⭑ R43: cambiar miembros sin `antes` → `validation_error` en `antes`, sin leer ni escribir (tambien con un grupo inexistente)", async () => {
    const svc = new GrupoDistritosService(repoQueFalla());
    for (const id of ["g-1", "g-x"]) {
      const res = await svc.fijarDistritos(id, ["d-pavas"], undefined as unknown as typeof ANTES_MIEMBROS, MAESTRO);
      expect(res.status).toBe("validation_error");
      if (res.status === "validation_error") expect(Object.keys(res.fieldErrors)).toEqual(["antes"]);
    }
  });

  it("⭑ R45: borrar sin `antes` → `validation_error` en `antes`, sin leer ni escribir (tambien con un grupo inexistente)", async () => {
    const svc = new GrupoDistritosService(repoQueFalla());
    for (const id of ["g-1", "g-x"]) {
      const res = await svc.borrarGrupo(id, undefined as unknown as typeof ANTES_BORRAR, MAESTRO);
      expect(res.status).toBe("validation_error");
      if (res.status === "validation_error") expect(Object.keys(res.fieldErrors)).toEqual(["antes"]);
    }
    const sinValores = await svc.borrarGrupo("g-1", { ...ANTES_BORRAR, valores: -1 }, MAESTRO);
    expect(sinValores.status).toBe("validation_error");
  });

  it("R37: un rol que no es maestro → `forbidden` antes de mirar el «antes» o el repositorio", async () => {
    const svc = new GrupoDistritosService(repoQueFalla());
    for (const actor of NO_ESCRIBEN) {
      expect(await svc.renombrarGrupo("g-1", "Oeste", undefined as unknown as string, actor)).toEqual({ status: "forbidden" });
      expect(await svc.fijarDistritos("g-1", [], undefined as unknown as typeof ANTES_MIEMBROS, actor)).toEqual({ status: "forbidden" });
      expect(await svc.borrarGrupo("g-1", undefined as unknown as typeof ANTES_BORRAR, actor)).toEqual({ status: "forbidden" });
    }
  });

  it("⭑ R43–R45: `cambio_concurrente` del repositorio → `conflict` con motivo en las tres escrituras", async () => {
    const repo = repoDoble({
      renombrar: vi.fn().mockResolvedValue("cambio_concurrente"),
      fijarDistritos: vi.fn().mockResolvedValue("cambio_concurrente"),
      borrar: vi.fn().mockResolvedValue("cambio_concurrente"),
    });
    const svc = new GrupoDistritosService(repo);
    const conflicto = { status: "conflict", motivo: "cambio_concurrente" };
    expect(await svc.renombrarGrupo("g-1", "Este", "Oeste", MAESTRO)).toEqual(conflicto);
    expect(await svc.fijarDistritos("g-1", ["d-pavas"], ANTES_MIEMBROS, MAESTRO)).toEqual(conflicto);
    expect(await svc.borrarGrupo("g-1", ANTES_BORRAR, MAESTRO)).toEqual(conflicto);
  });

  it("R43: el «antes» y los miembros llegan al repositorio; los nodos van con los distritos (R17)", async () => {
    const repo = repoDoble();
    const antes = { distritoIds: ["d-pavas"], nodoIds: ["c-escazu"] };
    await new GrupoDistritosService(repo).fijarDistritos("g-1", ["d-pavas", "c-escazu", "d-pavas"], antes, MAESTRO);
    expect(repo.fijarDistritos).toHaveBeenCalledWith("g-1", ["d-pavas", "c-escazu"], antes, "u-maestro");
  });

  it("R46: crear sin «antes» sigue `ok`, con los nodos como miembros", async () => {
    const repo = repoDoble();
    const res = await new GrupoDistritosService(repo).crearGrupo(
      { zonaId: "zona-1", nombre: "Mixto", distritoIds: ["d-pavas"], nodoIds: ["c-escazu"] },
      MAESTRO,
    );
    expect(res).toEqual({ status: "ok", id: "g-nuevo" });
    expect(repo.crear.mock.calls[0][0]).toEqual({ zonaId: "zona-1", nombre: "Mixto", distritoIds: ["d-pavas", "c-escazu"] });
  });
});
