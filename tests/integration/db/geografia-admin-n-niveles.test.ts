import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearNodoAction, type GeografiaPlataformaDeps } from "@/lib/actions/geografia-plataforma";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { esViolacionDeUnico } from "@/lib/repositories/_shared/prisma-unique";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { GeografiaService } from "@/lib/services/GeografiaService";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import {
  PAIS_CUATRO_NIVELES,
  claveDeRuta,
  residuosDePaisesDePrueba,
  sembrarPaisDePruebaGeo,
} from "@/tests/fixtures/paises-de-prueba-geo";
import { errorEnSavepoint, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T5.1; design §4.3, §4.4, §11; R14–R19) — la administración de un país de 4 NIVELES por el
// service, contra Postgres. Lo que SL-20 probaba en los tres niveles de Costa Rica, aquí a la
// profundidad que la geografía vieja no tiene: el nodo 4 nace con el tipo `nivel_4` (R14), un país
// sin tipo para la profundidad pedida no escribe (R15), los choques de nombre y de código son
// `conflict` (R16), y renombre, retiro y reactivación tocan SOLO su nodo, con «pedir lo que ya tiene»
// como éxito sin escribir ni historial (R18, R19; P12).
//
// Cada caso va en una transacción del dueño que se revierte (`revertida`): el país `XP`, sus tipos,
// sus nodos, la empresa y el actor se van con ella. El `afterAll` exige que no quede nada.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const QUILPUE = ["Valparaíso", "Marga Marga", "Quilpué"];
const EL_BELLOTO = [...QUILPUE, "El Belloto"];
const CHILLAN = ["Ñuble", "Diguillín", "Chillán"];

let base: PrismaClient;

interface Contexto {
  tx: TxDeTest;
  service: GeografiaService;
  actor: Actor;
  deps: GeografiaPlataformaDeps;
  paisId: string;
  nodo: (ruta: readonly string[]) => string;
}

/** Siembra XP con un actor real y entrega el service sobre un cliente con SAVEPOINT real. */
async function conPaisDeCuatro<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    const org = await crearOrganizacion(tx);
    const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
    if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
    const { paisId, nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
    const cliente = clienteConSavepoint(tx);
    const service = new GeografiaService(new GeoRepository(cliente), new OrdenRepository(cliente));
    // El rol de la sesión es el del superadmin; el usuario real solo da nombre al historial.
    const actor: Actor = { usuarioId: u.id, rol: "superadmin" };
    const nodo = (ruta: readonly string[]): string => {
      const id = nodoPorRuta.get(claveDeRuta(ruta));
      if (id === undefined) throw new Error(`XP sin ${claveDeRuta(ruta)}`);
      return id;
    };
    return fn({ tx, service, actor, deps: { getActor: async () => actor, geografiaService: service }, paisId, nodo });
  });
}

/** Todos los nodos del país, en un orden estable, y las filas de su historial. */
async function foto(tx: TxDeTest, paisId: string) {
  return {
    nodos: await tx.nodoGeografico.findMany({
      where: { paisId },
      orderBy: { id: "asc" },
      select: { id: true, nombre: true, codigoOficial: true, activo: true, padreId: true, tipoId: true, profundidad: true },
    }),
    historial: await tx.historialPlataforma.count({ where: { paisId } }),
  };
}

async function tipoDe(tx: TxDeTest, paisId: string, profundidad: number): Promise<string> {
  const t = await tx.tipoNivelGeografico.findUniqueOrThrow({
    where: { paisId_clave: { paisId, clave: `nivel_${profundidad}` } },
    select: { id: true },
  });
  return t.id;
}

describeSiHayBase("SLT-46 T5.1 — administración de un país de 4 niveles por el service (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = base === undefined ? null : await residuosDePaisesDePrueba(base);
    await base?.$disconnect();
    expect(residuos).toEqual({ paises: 0, tipos: 0, nodos: 0, organizaciones: 0 });
  });

  // ===============================================================================================
  // R14 / R16 — el alta a profundidad 4
  // ===============================================================================================

  it("R14/R16: el alta bajo una comuna da un nodo de profundidad 4, ACTIVO, con el tipo `nivel_4` y su padre", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const alta = await service.crear({ padreId: nodo(QUILPUE), nombre: "Los Pinos", codigo: "0580102" }, actor);
      if (alta.status !== "ok") throw new Error(`alta: ${JSON.stringify(alta)}`);
      const fila = await tx.nodoGeografico.findUniqueOrThrow({ where: { id: alta.id } });
      return { fila, tipo4: await tipoDe(tx, paisId, 4), padre: nodo(QUILPUE) };
    });

    expect(r.fila).toMatchObject({
      paisId: "XP",
      padreId: r.padre,
      profundidad: 4,
      tipoId: r.tipo4,
      nombre: "Los Pinos",
      codigoOficial: "0580102",
      activo: true,
    });
  });

  it("R14: cada alta toma el tipo de SU profundidad (raíz → nivel_1 … nieto del nieto → nivel_4)", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId }) => {
      const ids: string[] = [];
      let destino: { paisId: string } | { padreId: string } = { paisId };
      for (const nombre of ["Biobío", "Concepción", "Talcahuano", "Las Higueras"]) {
        const alta = await service.crear({ ...destino, nombre }, actor);
        if (alta.status !== "ok") throw new Error(`alta de ${nombre}: ${JSON.stringify(alta)}`);
        ids.push(alta.id);
        destino = { padreId: alta.id };
      }
      const filas = await tx.nodoGeografico.findMany({ where: { id: { in: ids } }, select: { id: true, tipoId: true, profundidad: true } });
      const tipos = await Promise.all([1, 2, 3, 4].map((k) => tipoDe(tx, paisId, k)));
      return ids.map((id) => {
        const f = filas.find((x) => x.id === id);
        return { profundidad: f?.profundidad, esSuTipo: f?.tipoId === tipos[(f?.profundidad ?? 0) - 1] };
      });
    });

    expect(r).toEqual([1, 2, 3, 4].map((profundidad) => ({ profundidad, esSuTipo: true })));
  });

  it("R16: bajo un padre RETIRADO el nodo 4 nace igualmente activo", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, nodo }) => {
      const villaAlemana = nodo(["Valparaíso", "Marga Marga", "Villa Alemana"]);
      const alta = await service.crear({ padreId: villaAlemana, nombre: "El Sauce" }, actor);
      if (alta.status !== "ok") throw new Error(`alta: ${JSON.stringify(alta)}`);
      const padre = await tx.nodoGeografico.findUniqueOrThrow({ where: { id: villaAlemana }, select: { activo: true } });
      const hijo = await tx.nodoGeografico.findUniqueOrThrow({ where: { id: alta.id }, select: { activo: true, profundidad: true } });
      return { padre, hijo };
    });

    expect(r).toEqual({ padre: { activo: false }, hijo: { activo: true, profundidad: 4 } });
  });

  it("R15: bajo un nodo de la profundidad máxima (4) no hay tipo 5 → `validation_error` en `padreId`, sin escribir", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const antes = await foto(tx, paisId);
      const alta = await service.crear({ padreId: nodo(EL_BELLOTO), nombre: "Manzana 1" }, actor);
      return { alta, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r.alta).toEqual({
      status: "validation_error",
      fieldErrors: { padreId: ["Este país no tiene un nivel por debajo de Sector"] },
    });
    expect(r.igual).toBe(true);
  });

  it("R16: un hermano de profundidad 4 con el mismo nombre normalizado → `conflict`, sin escribir", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const antes = await foto(tx, paisId);
      const alta = await service.crear({ padreId: nodo(QUILPUE), nombre: "el belloto" }, actor);
      return { alta, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ alta: { status: "conflict" }, igual: true });
  });

  it("R16: el código de otro nodo del MISMO tipo (nivel_4) → `conflict` por el borde, sin escribir nodo ni historial", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, deps, paisId, nodo }) => {
      const antes = await foto(tx, paisId);
      // `0580101` es el código de El Belloto (nivel_4). Otro nodo 4, bajo OTRA comuna, lo pide.
      const entrada = { padreId: nodo(CHILLAN), nombre: "Las Rosas", codigo: "0580101" };
      // El service no compara códigos: el único `(pais_id, tipo_id, codigo_oficial)` de la base lo frena…
      const error = await errorEnSavepoint(tx, () => service.crear(entrada, actor));
      // …y la action lo traduce a `conflict` (R16, design §4.2).
      const accion = await crearNodoAction(entrada, deps);
      return { esUnico: esViolacionDeUnico(error), accion, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ esUnico: true, accion: { status: "conflict" }, igual: true });
  });

  it("CONTRAPRUEBA R16: el mismo código en OTRO tipo (un nodo 3) sí entra: el único es por país y tipo", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, nodo }) => {
      const alta = await service.crear({ padreId: nodo(["Valparaíso", "Marga Marga"]), nombre: "Limache", codigo: "0580101" }, actor);
      if (alta.status !== "ok") return alta;
      return tx.nodoGeografico.findUniqueOrThrow({ where: { id: alta.id }, select: { profundidad: true, codigoOficial: true } });
    });

    expect(r).toEqual({ profundidad: 3, codigoOficial: "0580101" });
  });

  it("R16: un padre o un país que no existen → `not_found`, sin escribir", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId }) => {
      const antes = await foto(tx, paisId);
      const sinPadre = await service.crear({ padreId: "00000000-0000-4000-8000-000000000000", nombre: "Huérfano" }, actor);
      const sinPais = await service.crear({ paisId: "XQ", nombre: "Raíz" }, actor);
      return { sinPadre, sinPais, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ sinPadre: { status: "not_found" }, sinPais: { status: "not_found" }, igual: true });
  });

  // ===============================================================================================
  // R18 — renombre a profundidad 4
  // ===============================================================================================

  it("R18: renombrar un nodo 4 cambia SOLO su nombre y deja UNA fila de historial; el resto del país, igual", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const id = nodo(EL_BELLOTO);
      const antes = await foto(tx, paisId);
      const res = await service.renombrar({ id, nombre: "Belloto Norte", nombreAnterior: "El Belloto" }, actor);
      return { res, id, antes, despues: await foto(tx, paisId) };
    });

    expect(r.res).toEqual({ status: "ok", id: r.id, nombre: "Belloto Norte" });
    const esperado = r.antes.nodos.map((n) => (n.id === r.id ? { ...n, nombre: "Belloto Norte" } : n));
    expect(r.despues.nodos).toEqual(esperado);
    expect(r.despues.historial).toBe(r.antes.historial + 1);
  });

  it("R18: renombrar un nodo 3 deja intactos a sus descendientes de profundidad 4", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const id = nodo(QUILPUE);
      const antes = await foto(tx, paisId);
      const res = await service.renombrar({ id, nombre: "Quilpué Centro", nombreAnterior: "Quilpué" }, actor);
      return { res, id, antes, despues: await foto(tx, paisId) };
    });

    expect(r.res.status).toBe("ok");
    expect(r.despues.nodos.filter((n) => n.id !== r.id)).toEqual(r.antes.nodos.filter((n) => n.id !== r.id));
  });

  it("R18: pedir el nombre que ya tiene → `ok` sin escribir ni historial", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const id = nodo(EL_BELLOTO);
      const antes = await foto(tx, paisId);
      const res = await service.renombrar({ id, nombre: "El Belloto", nombreAnterior: "El Belloto" }, actor);
      return { res, id, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ res: { status: "ok", id: r.id, nombre: "El Belloto" }, id: r.id, igual: true });
  });

  it("R18: el nombre normalizado de un hermano de profundidad 4 → `conflict`; un id que no existe → `not_found`; sin escribir", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const hermano = await service.crear({ padreId: nodo(QUILPUE), nombre: "Los Pinos" }, actor);
      if (hermano.status !== "ok") throw new Error(`alta del hermano: ${JSON.stringify(hermano)}`);
      const antes = await foto(tx, paisId);
      const choque = await service.renombrar({ id: nodo(EL_BELLOTO), nombre: "LOS PINOS", nombreAnterior: "El Belloto" }, actor);
      const fantasma = await service.renombrar(
        { id: "00000000-0000-4000-8000-000000000000", nombre: "Nadie", nombreAnterior: "Nadie" },
        actor,
      );
      return { choque, fantasma, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ choque: { status: "conflict" }, fantasma: { status: "not_found" }, igual: true });
  });

  // ===============================================================================================
  // R19 — retiro y reactivación a profundidad 4 (P12)
  // ===============================================================================================

  it("R19: retirar y reactivar un nodo 4 cambia SOLO su `activo`, con una fila de historial cada vez", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const id = nodo(EL_BELLOTO);
      const antes = await foto(tx, paisId);
      const retiro = await service.cambiarActivacion({ id, activo: false }, actor);
      const retirado = await foto(tx, paisId);
      const reactivacion = await service.cambiarActivacion({ id, activo: true }, actor);
      const acciones = await tx.historialPlataforma.findMany({
        where: { paisId, entidadId: id },
        orderBy: { createdAt: "asc" },
        select: { accion: true },
      });
      return { id, retiro, reactivacion, antes, retirado, despues: await foto(tx, paisId), acciones };
    });

    expect(r.retiro).toEqual({ status: "ok", id: r.id, activo: false });
    expect(r.reactivacion).toEqual({ status: "ok", id: r.id, activo: true });
    expect(r.retirado.nodos).toEqual(r.antes.nodos.map((n) => (n.id === r.id ? { ...n, activo: false } : n)));
    // Reactivar devuelve el país EXACTAMENTE como estaba (reversible).
    expect(r.despues.nodos).toEqual(r.antes.nodos);
    expect(r.acciones.map((a) => a.accion).sort()).toEqual(["nodo_geografico_activado", "nodo_geografico_desactivado"]);
  });

  it("R19: retirar un nodo 3 NO toca el `activo` propio de sus descendientes de profundidad 4", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const id = nodo(QUILPUE);
      const antes = await foto(tx, paisId);
      const res = await service.cambiarActivacion({ id, activo: false }, actor);
      const hijo = await tx.nodoGeografico.findUniqueOrThrow({ where: { id: nodo(EL_BELLOTO) }, select: { activo: true } });
      return { res, id, hijo, antes, despues: await foto(tx, paisId) };
    });

    expect(r.res).toEqual({ status: "ok", id: r.id, activo: false });
    expect(r.hijo).toEqual({ activo: true });
    expect(r.despues.nodos.filter((n) => n.id !== r.id)).toEqual(r.antes.nodos.filter((n) => n.id !== r.id));
  });

  it("R19/P12: pedir el estado que ya tiene (retirar un retirado, reactivar un activo) → `ok` sin escribir ni historial", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId, nodo }) => {
      const antes = await foto(tx, paisId);
      const yaActivo = await service.cambiarActivacion({ id: nodo(EL_BELLOTO), activo: true }, actor);
      const villaAlemana = nodo(["Valparaíso", "Marga Marga", "Villa Alemana"]);
      const yaRetirado = await service.cambiarActivacion({ id: villaAlemana, activo: false }, actor);
      return {
        yaActivo,
        yaRetirado,
        ids: { belloto: nodo(EL_BELLOTO), villaAlemana },
        igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes),
      };
    });

    expect(r.yaActivo).toEqual({ status: "ok", id: r.ids.belloto, activo: true });
    expect(r.yaRetirado).toEqual({ status: "ok", id: r.ids.villaAlemana, activo: false });
    expect(r.igual).toBe(true);
  });

  it("R19: un id que no existe → `not_found`, sin escribir", async () => {
    const r = await conPaisDeCuatro(async ({ tx, service, actor, paisId }) => {
      const antes = await foto(tx, paisId);
      const res = await service.cambiarActivacion({ id: "00000000-0000-4000-8000-000000000000", activo: false }, actor);
      return { res, igual: JSON.stringify(await foto(tx, paisId)) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ res: { status: "not_found" }, igual: true });
  });
});
