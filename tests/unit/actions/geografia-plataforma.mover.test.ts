import { describe, expect, it, vi } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import { moverNodoAction, vistaPreviaMoverNodoAction } from "@/lib/actions/geografia-plataforma";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { DesenlaceDeMover, IGeoRepository } from "@/lib/interfaces/repositories/IGeoRepository";
import type { IGeografiaService } from "@/lib/interfaces/services/IGeografiaService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { GeografiaService, type GeografiaOrdenesRepo } from "@/lib/services/GeografiaService";
import {
  catalogoConPadre,
  crearCatalogo,
  grupoYMarcaDeOrden,
  ordenesQueCambiarianAlMover,
  type OrdenAbiertaEnElArbol,
  type TarifaYMarcaDeLaEmpresa,
} from "@/lib/services/geografia-dominio";
import { MENSAJE_DE_MOTIVO_DE_MOVER, moverNodoSchema, vistaPreviaMoverNodoSchema } from "@/lib/types/geografia-nodo";
import { catalogoEnMemoria } from "../../fixtures/doble-catalogo-geografico";

// SLT-48 (T3; design §7.1, §7.2; R34–R37, R40) — mover un nodo, sin base: el borde (puerta de
// superadmin, zod), el servicio (rol y traduccion de desenlaces) y la regla pura de P1. Lo que pasa en
// Postgres (la escritura, el historial, las ordenes) lo prueban `geografia-mover-nodo.test.ts` y
// `geografia-mover-nodo-ordenes.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] };
const ROLES_DE_EMPRESA: Actor[] = [
  { usuarioId: "u-maestro", rol: RolValue.maestro },
  { usuarioId: "u-admin", rol: RolValue.admin },
  { usuarioId: "u-tienda", rol: RolValue.adminTienda },
  { usuarioId: "u-msg", rol: RolValue.mensajero },
];

const MOVER = { id: "n1", padreIdNuevo: "p2", padreIdAnterior: "p1" };
const PREVIA = { id: "n1", padreIdNuevo: "p2" };

function repoDoble(mover: DesenlaceDeMover = { estado: "movido" }) {
  return {
    mover: vi.fn(async () => mover),
    vistaPreviaMover: vi.fn(async () => ({ estado: "no_existe" as const })),
  };
}

function servicio(repo: ReturnType<typeof repoDoble>): GeografiaService {
  const ordenes = { contarSinEntregarPorNodoGeografico: vi.fn() } as unknown as GeografiaOrdenesRepo;
  return new GeografiaService(repo as unknown as IGeoRepository, ordenes);
}

describe("SLT-48 R34 — solo el superadmin mueve; ningun otro rol escribe", () => {
  it("sin sesion: `unauthenticated` en las dos actions, sin construir ni llamar al servicio", async () => {
    const geografiaService = { moverNodo: vi.fn(), vistaPreviaMoverNodo: vi.fn() };
    const deps = { getActor: async () => null, geografiaService: geografiaService as unknown as IGeografiaService };
    expect(await moverNodoAction(MOVER, deps)).toEqual({ status: "unauthenticated" });
    expect(await vistaPreviaMoverNodoAction(PREVIA, deps)).toEqual({ status: "unauthenticated" });
    expect(geografiaService.moverNodo).not.toHaveBeenCalled();
    expect(geografiaService.vistaPreviaMoverNodo).not.toHaveBeenCalled();
  });

  it.each(ROLES_DE_EMPRESA)("borde: $rol recibe `forbidden` y el servicio no se llama", async (actor) => {
    const geografiaService = { moverNodo: vi.fn(), vistaPreviaMoverNodo: vi.fn() };
    const deps = { getActor: async () => actor, geografiaService: geografiaService as unknown as IGeografiaService };
    expect(await moverNodoAction(MOVER, deps)).toEqual({ status: "forbidden" });
    expect(await vistaPreviaMoverNodoAction(PREVIA, deps)).toEqual({ status: "forbidden" });
    expect(geografiaService.moverNodo).not.toHaveBeenCalled();
    expect(geografiaService.vistaPreviaMoverNodo).not.toHaveBeenCalled();
  });

  it.each(ROLES_DE_EMPRESA)("servicio: $rol recibe `forbidden` sin leer ni escribir (segunda puerta)", async (actor) => {
    const repo = repoDoble();
    const s = servicio(repo);
    expect(await s.moverNodo(MOVER, actor)).toEqual({ status: "forbidden" });
    expect(await s.vistaPreviaMoverNodo(PREVIA, actor)).toEqual({ status: "forbidden" });
    expect(repo.mover).not.toHaveBeenCalled();
    expect(repo.vistaPreviaMover).not.toHaveBeenCalled();
  });

  it("el superadmin llega al servicio dentro de `comoPlataforma`, con la entrada validada y su actor", async () => {
    let contexto: unknown;
    const moverNodo = vi.fn(async () => {
      contexto = contextoActual();
      return { status: "ok" as const, id: "n1", padreId: "p2" };
    });
    const deps = {
      getActor: async () => SUPERADMIN,
      geografiaService: { moverNodo } as unknown as IGeografiaService,
    };
    expect(await moverNodoAction(MOVER, deps)).toEqual({ status: "ok", id: "n1", padreId: "p2" });
    expect(moverNodo).toHaveBeenCalledWith(MOVER, SUPERADMIN);
    expect(contexto).toMatchObject({ tipo: "plataforma" });
  });
});

describe("SLT-48 — el borde: `.strict()` y los fallos de la base", () => {
  it("mover exige el padre de antes y no admite otros campos (mover no renombra)", () => {
    expect(moverNodoSchema.safeParse(MOVER).success).toBe(true);
    expect(moverNodoSchema.safeParse(PREVIA).success).toBe(false);
    expect(moverNodoSchema.safeParse({ ...MOVER, nombre: "Otro" }).success).toBe(false);
    expect(vistaPreviaMoverNodoSchema.safeParse(PREVIA).success).toBe(true);
    expect(vistaPreviaMoverNodoSchema.safeParse({ ...PREVIA, padreIdAnterior: "p1" }).success).toBe(false);
  });

  it("una entrada invalida es `validation_error` sin llamar al servicio", async () => {
    const moverNodo = vi.fn();
    const deps = { getActor: async () => SUPERADMIN, geografiaService: { moverNodo } as unknown as IGeografiaService };
    const r = await moverNodoAction({ id: "n1", padreIdNuevo: "p2" }, deps);
    expect(r.status).toBe("validation_error");
    expect(moverNodo).not.toHaveBeenCalled();
  });

  it("R35: el unico de la base (un hermano con ese nombre creado en carrera) es `conflict`; otro fallo, `error`", async () => {
    const unico = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const conUnico = { getActor: async () => SUPERADMIN, geografiaService: { moverNodo: vi.fn(async () => Promise.reject(unico)) } as unknown as IGeografiaService };
    const conOtro = { getActor: async () => SUPERADMIN, geografiaService: { moverNodo: vi.fn(async () => Promise.reject(new Error("caida"))) } as unknown as IGeografiaService };
    expect(await moverNodoAction(MOVER, conUnico)).toEqual({ status: "conflict" });
    expect(await moverNodoAction(MOVER, conOtro)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe("SLT-48 P1, review vuelta 2 — `mover` cede: el borde lo dice como `ocupado`, sin log", () => {
  const ocupados: [string, unknown][] = [
    ["55P03 (lock_timeout), con la forma del driver adapter", Object.assign(new Error("lock"), { cause: { originalCode: "55P03" } })],
    ["57014 (statement_timeout), en el mensaje de un SQL a mano", new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `57014`. Message: `canceling statement due to statement timeout`", { code: "P2010", clientVersion: "7" })],
    ["40P01 (interbloqueo), anidado en meta", Object.assign(new Error("deadlock"), { meta: { driverAdapterError: { cause: { originalCode: "40P01" } } } })],
    ["P2028 (timeout de la transaccion de Prisma)", new Prisma.PrismaClientKnownRequestError("Transaction already closed", { code: "P2028", clientVersion: "7" })],
    ["P2034 (conflicto o interbloqueo, forma de Prisma)", new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock", { code: "P2034", clientVersion: "7" })],
  ];

  it.each(ocupados)("%s es `conflict` con motivo `ocupado`, sin `console.error`", async (_caso, error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = { getActor: async () => SUPERADMIN, geografiaService: { moverNodo: vi.fn(async () => Promise.reject(error)) } as unknown as IGeografiaService };
    expect(await moverNodoAction(MOVER, deps)).toEqual({ status: "conflict", motivo: "ocupado" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("un SQLSTATE que no es de ceder (23503, FK) sigue siendo `error` con log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fk = Object.assign(new Error("fk"), { cause: { originalCode: "23503" } });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: { moverNodo: vi.fn(async () => Promise.reject(fk)) } as unknown as IGeografiaService };
    expect(await moverNodoAction(MOVER, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe("SLT-48 R35–R37, R40 — el servicio traduce cada desenlace del repositorio", () => {
  const bloqueo = { ordenes: 3, empresas: [{ id: "e1", nombre: "Tienda Uno", ordenes: 2 }, { id: "e2", nombre: "Tienda Dos", ordenes: 1 }] };

  it.each([
    [{ estado: "no_existe" }, { status: "not_found" }],
    [{ estado: "invalido", motivo: "es_raiz" }, { status: "validation_error", fieldErrors: { id: [MENSAJE_DE_MOTIVO_DE_MOVER.es_raiz] } }],
    [
      { estado: "invalido", motivo: "destino_retirado" },
      { status: "validation_error", fieldErrors: { padreIdNuevo: [MENSAJE_DE_MOTIVO_DE_MOVER.destino_retirado] } },
    ],
    [{ estado: "conflict" }, { status: "conflict" }],
    [{ estado: "cambio_concurrente" }, { status: "conflict", motivo: "cambio_concurrente" }],
    [{ estado: "movido" }, { status: "ok", id: "n1", padreId: "p2" }],
  ] as [DesenlaceDeMover, unknown][])("%o → %o", async (desenlace, esperado) => {
    const repo = repoDoble(desenlace);
    expect(await servicio(repo).moverNodo(MOVER, SUPERADMIN)).toEqual(esperado);
    expect(repo.mover).toHaveBeenCalledWith(MOVER, SUPERADMIN.usuarioId);
  });

  it("P1: bloqueado es `validation_error` en `id` con el bloqueo, y el mensaje dice cuantas y de que empresas", async () => {
    const r = await servicio(repoDoble({ estado: "bloqueado", bloqueo })).moverNodo(MOVER, SUPERADMIN);
    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { id: ["No se puede mover: 3 órdenes abiertas cambiarían de precio o de zona especial (Tienda Uno (2), Tienda Dos (1))."] },
      bloqueo,
    });
  });

  it("R35: cada motivo tiene su mensaje propio", () => {
    const mensajes = Object.values(MENSAJE_DE_MOTIVO_DE_MOVER);
    expect(mensajes).toHaveLength(6);
    expect(new Set(mensajes).size).toBe(6);
  });
});

// =================================================================================================
// La regla pura de P1 (design §7.2)
// =================================================================================================

describe("SLT-48 P1 — `catalogoConPadre` y `ordenesQueCambiarianAlMover`", () => {
  //   A (grupo heredado gA, marca) ── A1 ── A1x (distrito)
  //   B (sin grupo ni marca)       ── B1
  const cat = catalogoEnMemoria([
    { id: "A", nombre: "Alfa" },
    { id: "A1", padreId: "A", nombre: "Uno" },
    { id: "A1x", padreId: "A1", nombre: "Equis" },
    { id: "B", nombre: "Beta" },
    { id: "B1", padreId: "B", nombre: "Dos" },
  ]);
  const orden = (nodoId: string, organizacionId = "e1"): OrdenAbiertaEnElArbol => ({
    id: `o-${nodoId}-${organizacionId}`,
    organizacionId,
    zonaId: "z1",
    nodoId,
  });
  const empresa = (o: Partial<TarifaYMarcaDeLaEmpresa> = {}): TarifaYMarcaDeLaEmpresa => ({
    gruposPorDistrito: new Map(),
    miembrosPorZona: new Map(),
    marcas: new Set(),
    ...o,
  });

  it("solo cambia el padre del nodo; sus descendientes lo siguen y la profundidad no cambia", () => {
    const despues = catalogoConPadre(cat, "A1", "B");
    expect(despues.porId.get("A1")).toMatchObject({ padreId: "B", profundidad: 2 });
    expect(despues.porId.get("A1x")?.padreId).toBe("A1");
    expect(despues.hijos.get("B")?.map((n) => n.id).sort()).toEqual(["A1", "B1"]);
    expect(despues.hijos.get("A")).toBeUndefined();
    // El catalogo de antes no se toca.
    expect(cat.porId.get("A1")?.padreId).toBe("A");
    expect(crearCatalogo(cat.paisId, cat.tipos, cat.nodos).porId.get("A1")?.padreId).toBe("A");
  });

  it("un grupo heredado del padre viejo cambia: la orden bloquea", () => {
    const e = empresa({ miembrosPorZona: new Map([["z1", new Map([["A", "gA"]])]]) });
    const despues = catalogoConPadre(cat, "A1", "B");
    expect(grupoYMarcaDeOrden(cat, orden("A1x"), e).grupo).toBe("gA");
    expect(grupoYMarcaDeOrden(despues, orden("A1x"), e).grupo).toBeNull();
    expect(ordenesQueCambiarianAlMover(cat, despues, [orden("A1x")], () => e)).toEqual([orden("A1x")]);
  });

  it("una marca heredada del padre viejo cambia: la orden bloquea", () => {
    const e = empresa({ marcas: new Set(["A"]) });
    const despues = catalogoConPadre(cat, "A1", "B");
    expect(ordenesQueCambiarianAlMover(cat, despues, [orden("A1x")], () => e)).toEqual([orden("A1x")]);
  });

  it("un grupo o una marca PROPIOS del nodo, o el grupo exacto del distrito, no cambian nunca", () => {
    const propios = empresa({
      miembrosPorZona: new Map([["z1", new Map([["A1", "gPropio"]])]]),
      marcas: new Set(["A1x"]),
    });
    const exacto = empresa({
      gruposPorDistrito: new Map([["z1|A1x", "gExacto"]]),
      miembrosPorZona: new Map([["z1", new Map([["A", "gA"]])]]),
    });
    const despues = catalogoConPadre(cat, "A1", "B");
    expect(ordenesQueCambiarianAlMover(cat, despues, [orden("A1x")], () => propios)).toEqual([]);
    expect(grupoYMarcaDeOrden(despues, orden("A1x"), exacto).grupo).toBe("gExacto");
    expect(ordenesQueCambiarianAlMover(cat, despues, [orden("A1x")], () => exacto)).toEqual([]);
  });

  it("P3: una orden por encima del nivel 3 no tiene grupo ni antes ni despues; una empresa sin datos no bloquea", () => {
    const e = empresa({ miembrosPorZona: new Map([["z1", new Map([["A", "gA"]])]]) });
    const despues = catalogoConPadre(cat, "A1", "B");
    expect(ordenesQueCambiarianAlMover(cat, despues, [orden("A1")], () => e)).toEqual([]);
    expect(ordenesQueCambiarianAlMover(cat, despues, [orden("A1x", "otra")], () => undefined)).toEqual([]);
  });

  it("con dos empresas, solo bloquea la orden de la empresa cuyo grupo cambia", () => {
    const conGrupo = empresa({ miembrosPorZona: new Map([["z1", new Map([["A", "gA"]])]]) });
    const despues = catalogoConPadre(cat, "A1", "B");
    const ordenes = [orden("A1x", "e1"), orden("A1x", "e2")];
    expect(ordenesQueCambiarianAlMover(cat, despues, ordenes, (id) => (id === "e1" ? conGrupo : empresa()))).toEqual([
      orden("A1x", "e1"),
    ]);
  });
});
