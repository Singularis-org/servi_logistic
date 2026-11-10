import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IGrupoDistritosService";
import { gruposDeDistritos } from "@/lib/repositories/_shared/resolver-tarifas";
import { TarifasPantallaRepository } from "@/lib/repositories/TarifasPantallaRepository";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";

import { antesDeMiembros } from "./_fixtures/antes-de-grupo";
import { comoLaEmpresa, crearEscenarioSlt89, guardado, repoDeZonas, type EscenarioSlt89 } from "./_fixtures/slt89-zonas";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R17, R18, R19, R20, R21, R31 (T5.4; design §4.3, §5.1 paso 7, §5.2) — LOS GRUPOS DE
 * TARIFAS SOBRE EL NODO, contra Postgres real (`slt89-zonas.ts`, empresa `XA`, como la app):
 *
 *   · R17: un canton, una provincia y un distrito heredado son miembros validos; van a
 *     `grupo_distritos_nodo` y el listado los devuelve (distritos y demas nodos por separado);
 *   · R18: un nodo fuera de la cobertura de la zona o ya en otro grupo se rechaza nombrandolo;
 *   · R19: el grupo de un par (zona, distrito) es el del miembro mas cercano: distrito > canton >
 *     provincia (lo mismo para cobro y pago: los dos pasan por `gruposDeDistritos`);
 *   · R20: un par sin distrito no tiene grupo aunque su canton sea miembro;
 *   · R21: guardar la zona normaliza: asignado ↔ heredado conserva el grupo (cambia de tabla); lo que
 *     sale de la cobertura sale del grupo con una fila `grupo_distritos_cambiado` por grupo;
 *   · R31: el historial de los grupos cuenta los miembros de las dos tablas;
 *   · R23 (servidor, T5.3): Tarifas ofrece los distritos que la zona cubre (tambien heredados, sin las
 *     excepciones) y el sub-arbol cubierto con los nombres de nivel del pais.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Contexto {
  tx: TxDeTest;
  e: EscenarioSlt89;
  actor: Actor;
  como: <T>(fn: (s: ReturnType<typeof serviciosDeTarifas>) => Promise<T>) => Promise<T>;
  /** Guarda la zona con esos distritos y nodos, con el «antes» de la base. */
  guardarZona: (zonaId: string, distritoIds: string[], nodoIds: string[]) => Promise<void>;
  crearGrupo: (zonaId: string, nombre: string, miembros: string[]) => Promise<string>;
  grupoDe: (zonaId: string, distritoId: string | null) => Promise<string | null>;
}

describeSiHayBase("SLT-89 · R17–R21, R31 — grupos de tarifas sobre el nodo", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => {
      const e = await crearEscenarioSlt89(tx);
      const actor: Actor = { usuarioId: e.maestroId, rol: "maestro" };
      const como = <T,>(f: (s: ReturnType<typeof serviciosDeTarifas>) => Promise<T>) =>
        comoLaEmpresa(tx, e.empresaId, () => f(serviciosDeTarifas(clienteConSavepoint(tx))));
      const guardarZona = async (zonaId: string, distritoIds: string[], nodoIds: string[]) => {
        const datos = await guardado(tx, zonaId, { distritoIds, nodoIds });
        const r = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonaId, datos, e.maestroId));
        if (r.estado !== "ok") throw new Error(`guardar la zona dio ${r.estado}`);
      };
      const crearGrupo = async (zonaId: string, nombre: string, miembros: string[]) => {
        const r = await como((s) => s.grupoDistritos.crearGrupo({ zonaId, nombre, distritoIds: miembros }, actor));
        if (r.status !== "ok") throw new Error(`crear el grupo ${nombre} dio ${JSON.stringify(r)}`);
        return r.id;
      };
      const grupoDe = async (zonaId: string, distritoId: string | null) =>
        comoLaEmpresa(tx, e.empresaId, async () =>
          (await gruposDeDistritos(clienteConSavepoint(tx), [{ zonaId, distritoId }])).get(`${zonaId}|${distritoId}`) ?? null,
        );
      return fn({ tx, e, actor, como, guardarZona, crearGrupo, grupoDe });
    });
  }

  it("⭑ R17/R31: canton, provincia y distrito heredado son miembros; van a la tabla nueva y el listado los separa", async () => {
    const r = await conEscenario(async (c) => {
      const { geo, zonas } = c.e.emp.base;
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.provinciaId]);
      const gCanton = await c.crearGrupo(zonas.surId, "Canton", [geo.cantonId, c.e.sectorId]);
      const gHeredado = await c.crearGrupo(zonas.surId, "Heredado", [geo.distritoSinZonaId, geo.distritoBajoCantonRetiradoId]);
      const listado = await c.como((s) => s.grupoDistritos.listarGrupos(zonas.surId, c.actor));
      const historial = await c.tx.historialAccion.findMany({
        where: { entidadId: { in: [gCanton, gHeredado] }, accion: "grupo_distritos_creado" },
        select: { entidadId: true, valorNuevo: true },
      });
      return {
        c,
        gCanton,
        gHeredado,
        miembrosCanton: await antesDeMiembros(c.tx, gCanton),
        miembrosHeredado: await antesDeMiembros(c.tx, gHeredado),
        listado,
        historial,
      };
    });
    const { geo } = r.c.e.emp.base;
    expect(r.miembrosCanton).toEqual({ distritoIds: [], nodoIds: expect.arrayContaining([geo.cantonId, r.c.e.sectorId]) });
    // El asignado va a la tabla vieja; el heredado, a la nueva.
    expect(r.miembrosHeredado).toEqual({ distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.distritoSinZonaId] });
    expect(r.listado.status).toBe("ok");
    if (r.listado.status !== "ok") return;
    const canton = r.listado.items.find((g) => g.id === r.gCanton);
    const heredado = r.listado.items.find((g) => g.id === r.gHeredado);
    expect(canton?.distritos).toEqual([]);
    expect(canton?.nodos?.map((n) => n.id).sort()).toEqual([geo.cantonId, r.c.e.sectorId].sort());
    expect(heredado?.distritos.map((d) => d.id).sort()).toEqual([geo.distritoBajoCantonRetiradoId, geo.distritoSinZonaId].sort());
    expect(heredado?.nodos).toBeUndefined();
    expect(Object.fromEntries(r.historial.map((h) => [h.entidadId, h.valorNuevo]))).toEqual({
      [r.gCanton]: "2 distritos",
      [r.gHeredado]: "2 distritos",
    });
  });

  it("R18: un nodo fuera de la cobertura de la zona, o ya en otro grupo, se rechaza nombrandolo y no se escribe", async () => {
    const r = await conEscenario(async (c) => {
      const { geo, zonas } = c.e.emp.base;
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.cantonId]);
      await c.crearGrupo(zonas.surId, "Primero", [geo.cantonId]);
      const grupos = await c.tx.grupoDistritos.count();
      // El distrito central es excepcion de la zona central: sur no lo cubre.
      const fuera = await c.como((s) =>
        s.grupoDistritos.crearGrupo({ zonaId: zonas.surId, nombre: "Fuera", distritoIds: [geo.distritoCentralId] }, c.actor),
      );
      const enOtro = await c.como((s) =>
        s.grupoDistritos.crearGrupo({ zonaId: zonas.surId, nombre: "Otro", distritoIds: [], nodoIds: [geo.cantonId] }, c.actor),
      );
      const nombres = await c.tx.nodoGeografico.findMany({
        where: { id: { in: [geo.distritoCentralId, geo.cantonId] } },
        select: { id: true, nombre: true },
      });
      return { fuera, enOtro, grupos, despues: await c.tx.grupoDistritos.count(), nombres: Object.fromEntries(nombres.map((n) => [n.id, n.nombre])), geo };
    });
    expect(r.fuera).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: [`${r.nombres[r.geo.distritoCentralId]} no pertenece a la zona.`] },
    });
    expect(r.enOtro).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: [`${r.nombres[r.geo.cantonId]} ya está en el grupo Primero.`] },
    });
    expect(r.despues).toBe(r.grupos);
  });

  it("⭑ R19/R20: gana el miembro mas cercano (distrito > canton > provincia); sin distrito, sin grupo", async () => {
    const r = await conEscenario(async (c) => {
      const { geo, zonas } = c.e.emp.base;
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.provinciaId]);
      const gProvincia = await c.crearGrupo(zonas.surId, "Provincia", [geo.provinciaId]);
      const conProvincia = await c.grupoDe(zonas.surId, geo.distritoSinZonaId);
      const gCanton = await c.crearGrupo(zonas.surId, "Canton", [geo.cantonId]);
      const conCanton = await c.grupoDe(zonas.surId, geo.distritoSinZonaId);
      const gDistrito = await c.crearGrupo(zonas.surId, "Distrito", [geo.distritoSinZonaId]);
      const conDistrito = await c.grupoDe(zonas.surId, geo.distritoSinZonaId);
      // Otra zona no ve los grupos de sur (el pago usa la zona del mensajero: el mismo par).
      const otraZona = await c.grupoDe(zonas.norteId, geo.distritoSinZonaId);
      const sinDistrito = await c.grupoDe(zonas.surId, null);
      return { gProvincia, conProvincia, gCanton, conCanton, gDistrito, conDistrito, otraZona, sinDistrito };
    });
    expect(r.conProvincia).toBe(r.gProvincia);
    expect(r.conCanton).toBe(r.gCanton);
    expect(r.conDistrito).toBe(r.gDistrito);
    expect(r.otraZona).toBeNull();
    expect(r.sinDistrito).toBeNull();
  });

  it("⭑ R21: asignado ↔ heredado conserva el grupo (cambia de tabla); al salir de la cobertura sale del grupo con historial", async () => {
    const r = await conEscenario(async (c) => {
      const { geo, zonas } = c.e.emp.base;
      // El distrito «sin zona» asignado a sur y, ademas, el canton.
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId, geo.distritoSinZonaId], [geo.cantonId]);
      const g = await c.crearGrupo(zonas.surId, "Normalizado", [geo.distritoSinZonaId]);
      const gCanton = await c.crearGrupo(zonas.surId, "Del canton", [geo.cantonId]);
      const asignado = await antesDeMiembros(c.tx, g);

      // Sale de `zona_distrito` pero el canton lo sigue cubriendo: heredado.
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.cantonId]);
      const heredado = await antesDeMiembros(c.tx, g);
      // Vuelve a `zona_distrito`: asignado otra vez.
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId, geo.distritoSinZonaId], [geo.cantonId]);
      const reasignado = await antesDeMiembros(c.tx, g);
      // Heredado de nuevo, y luego el canton sale de sur: el distrito queda sin cobertura.
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.cantonId]);
      const historialAntes = await c.tx.historialAccion.count({ where: { accion: "grupo_distritos_cambiado", entidadId: { in: [g, gCanton] } } });
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], []);
      const fuera = await antesDeMiembros(c.tx, g);
      const fueraCanton = await antesDeMiembros(c.tx, gCanton);
      const historial = await c.tx.historialAccion.findMany({
        where: { accion: "grupo_distritos_cambiado", entidadId: { in: [g, gCanton] } },
        select: { entidadId: true, valorAnterior: true, valorNuevo: true, loteId: true },
        orderBy: { createdAt: "asc" },
      });
      return { g, gCanton, asignado, heredado, reasignado, fuera, fueraCanton, historialAntes, historial, geo };
    });
    expect(r.asignado).toEqual({ distritoIds: [r.geo.distritoSinZonaId], nodoIds: [] });
    expect(r.heredado).toEqual({ distritoIds: [], nodoIds: [r.geo.distritoSinZonaId] });
    expect(r.reasignado).toEqual({ distritoIds: [r.geo.distritoSinZonaId], nodoIds: [] });
    expect(r.fuera).toEqual({ distritoIds: [], nodoIds: [] });
    expect(r.fueraCanton).toEqual({ distritoIds: [], nodoIds: [] });
    // Asignado ↔ heredado no deja historial de grupo; salir de la cobertura, una fila por grupo.
    expect(r.historialAntes).toBe(0);
    const nuevas = r.historial.slice(r.historialAntes);
    expect(nuevas.map((h) => [h.entidadId, h.valorAnterior, h.valorNuevo]).sort()).toEqual(
      [
        [r.g, "1 distrito", "0 distritos"],
        [r.gCanton, "1 distrito", "0 distritos"],
      ].sort(),
    );
    expect(new Set(nuevas.map((h) => h.loteId)).size).toBe(1);
  });

  it("R23 (T5.3): la zona con un canton ofrece sus distritos heredados (sin excepciones) y el sub-arbol cubierto", async () => {
    const r = await conEscenario(async (c) => {
      const { geo, zonas } = c.e.emp.base;
      const repo = () => new TarifasPantallaRepository(clienteConSavepoint(c.tx));
      const antes = await comoLaEmpresa(c.tx, c.e.empresaId, () => repo().distritosDeZona(zonas.surId, { conMarca: true }));
      await c.guardarZona(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.cantonId]);
      const despues = await comoLaEmpresa(c.tx, c.e.empresaId, () => repo().distritosDeZona(zonas.surId, { conMarca: true }));
      const arbol = await comoLaEmpresa(c.tx, c.e.empresaId, () => repo().nodosDeZona(zonas.surId));
      return { antes, despues, arbol, geo, sector: c.e.sectorId };
    });
    // Sin nodos, la lectura de siempre: el distrito propio, con su marca.
    expect(r.antes.map((d) => [d.id, d.zonaEspecial])).toEqual([[r.geo.distritoBajoCantonRetiradoId, true]]);
    // Con el canton: «sin zona» heredado; «central», «dos zonas» y «retirado» son de otras zonas.
    expect(r.despues.map((d) => d.id).sort()).toEqual([r.geo.distritoBajoCantonRetiradoId, r.geo.distritoSinZonaId].sort());
    if (r.arbol === null) throw new Error("con un canton asignado la zona tiene sub-arbol");
    const arbol = r.arbol;
    const raices = arbol.raices.map((n) => n.id).sort();
    expect(raices).toEqual([r.geo.cantonId, r.geo.distritoBajoCantonRetiradoId].sort());
    const canton = arbol.raices.find((n) => n.id === r.geo.cantonId);
    expect(canton?.hijos.map((h) => h.id)).toEqual([r.geo.distritoSinZonaId]);
    expect(canton?.hijos[0]?.hijos.map((h) => h.id)).toEqual([r.sector]);
    expect(arbol.tipos.map((t) => t.profundidad)).toEqual([1, 2, 3, 4]);
  });

  it("⭑ R21 (decision del 2026-11-10): con solo distritos, el que sale de la zona sale de su grupo y deja su fila de historial", async () => {
    const r = await conEscenario(async (c) => {
      const { geo, zonas } = c.e.emp.base;
      // Norte tiene «dos zonas» y «retirado» en `zona_distrito` y ningun nodo: la tabla vieja, como hoy.
      const g = await c.crearGrupo(zonas.norteId, "Solo distritos", [geo.distritoDosZonasId, geo.distritoRetiradoId]);
      const sinCambio = await c.tx.historialAccion.count({ where: { accion: "grupo_distritos_cambiado", entidadId: g } });
      await c.guardarZona(zonas.norteId, [geo.distritoDosZonasId], []);
      const historial = await c.tx.historialAccion.findMany({
        where: { accion: "grupo_distritos_cambiado", entidadId: g },
        select: { valorAnterior: true, valorNuevo: true, entidadEtiqueta: true },
      });
      return { sinCambio, historial, miembros: await antesDeMiembros(c.tx, g), geo };
    });
    expect(r.sinCambio).toBe(0);
    expect(r.miembros).toEqual({ distritoIds: [r.geo.distritoDosZonasId], nodoIds: [] });
    expect(r.historial).toEqual([
      { valorAnterior: "2 distritos", valorNuevo: "1 distrito", entidadEtiqueta: expect.stringContaining("Solo distritos") },
    ]);
  });
});
