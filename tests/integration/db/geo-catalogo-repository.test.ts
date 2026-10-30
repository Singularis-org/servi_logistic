import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta, comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { CatalogoYAsignaciones } from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo44, type EmpresaGeo44, type EscenarioGeo44 } from "./_fixtures/geo-44";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  crearPrismaDeTestConEspia,
  type TxDeTest,
} from "./_postgres-real";

// SLT-44 (T3.2; R9, R10, R11; design §3, §4) — la carga del catalogo y de las asignaciones, contra
// Postgres real.
//
// POR QUE `comoApp` + `clienteConSavepoint`. El escenario vive en una transaccion del dueño que se
// revierte; el repositorio la ve por `clienteConSavepoint(tx)` (su `$transaction` abre un SAVEPOINT)
// y `comoApp` baja la transaccion a `servi_app` con la empresa fijada, que es lo que hace la extension
// en produccion: sin la bajada de rol la RLS no actua y R9 pasaria aunque la politica no existiera.
// `conEmpresa` solo pone la empresa en el contexto, que es la clave de la memoria (R11).
//
// R10 se mide ademas con la EXTENSION REAL sobre un cliente que apunta cada consulta: en plataforma
// y sin contexto, ninguna consulta llega a la base.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** Cuantas cargas y cuantas consultas de nodos hace el repositorio por este cliente. */
interface Cuenta {
  transacciones: number;
  consultasDeNodos: number;
}

/**
 * `clienteConSavepoint(tx)` con un contador. Envuelve tambien el cliente que recibe la funcion de la
 * transaccion, que es por donde el repositorio consulta. `fallarLaPrimera` hace que la primera
 * carga lance antes de tocar la base.
 */
function clienteQueCuenta(tx: TxDeTest, o?: { fallarLaPrimera?: boolean }): { cliente: PrismaClient; cuenta: Cuenta } {
  const cuenta: Cuenta = { transacciones: 0, consultasDeNodos: 0 };
  const conSavepoint = clienteConSavepoint(tx);
  const envolver = (c: object): object =>
    new Proxy(c, {
      get(objetivo, prop) {
        if (prop === "nodoGeografico") {
          const delegado = Reflect.get(objetivo, prop) as { findMany: (a: unknown) => Promise<unknown> };
          return {
            findMany: (a: unknown) => {
              cuenta.consultasDeNodos++;
              return delegado.findMany(a);
            },
          };
        }
        if (prop === "$transaction") {
          const original = Reflect.get(objetivo, prop) as (fn: (t: object) => unknown, op?: unknown) => Promise<unknown>;
          return async (fn: (t: object) => unknown, op?: unknown) => {
            cuenta.transacciones++;
            if (o?.fallarLaPrimera && cuenta.transacciones === 1) throw new Error("caida PROVOCADA de la carga");
            return original.call(objetivo, (t) => fn(envolver(t)), op);
          };
        }
        const valor = Reflect.get(objetivo, prop) as unknown;
        return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
      },
    });
  return { cliente: envolver(conSavepoint) as PrismaClient, cuenta };
}

/** La carga de la empresa, como la app: con su empresa en la transaccion y en el contexto. */
async function cargarComo(
  tx: TxDeTest,
  repo: CatalogoGeograficoRepository,
  empresa: EmpresaGeo44,
): Promise<CatalogoYAsignaciones> {
  await comoApp(tx, empresa.empresaId);
  const r = await conEmpresa(empresa.empresaId, () => repo.deLaEmpresa());
  await comoDueno(tx);
  return r;
}

/** Ids de los nodos y de los tipos de un pais, medidos como dueño. */
async function delPais(tx: TxDeTest, paisId: string): Promise<{ nodos: string[]; tipos: string[] }> {
  const nodos = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM nodo_geografico WHERE pais_id = $1`, paisId);
  const tipos = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM tipo_nivel_geografico WHERE pais_id = $1`,
    paisId,
  );
  return { nodos: nodos.map((n) => n.id).sort(), tipos: tipos.map((t) => t.id).sort() };
}

/** Las asignaciones sembradas de una empresa: nodo → ids de zona, y los nodos con marca. */
function asignacionesSembradas(e: EmpresaGeo44, extra?: { zonas: [string, string][]; marcas: string[] }) {
  const zonas: [string, string][] = [
    [e.geo.distritoCentralId, e.zonas.centralId],
    [e.geo.distritoDosZonasId, e.zonas.norteId],
    [e.geo.distritoDosZonasId, e.zonas.surId],
    [e.geo.distritoRetiradoId, e.zonas.norteId],
    [e.geo.distritoBajoCantonRetiradoId, e.zonas.surId],
    ...(extra?.zonas ?? []),
  ];
  return {
    zonas: zonas.map(([n, z]) => `${n}→${z}`).sort(),
    marcas: [...e.marcas, ...(extra?.marcas ?? [])].sort(),
  };
}

function asignacionesLeidas(r: CatalogoYAsignaciones) {
  return {
    zonas: [...r.asignaciones.zonasPorNodo].flatMap(([n, zs]) => zs.map((z) => `${n}→${z.id}`)).sort(),
    marcas: [...r.asignaciones.nodosConMarca].sort(),
  };
}

describeSiHayBase("SLT-44 T3.2 — CatalogoGeograficoRepository contra Postgres real", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R9: cada empresa ve solo los nodos y tipos de su pais, sus zonas y sus marcas", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const repo = new CatalogoGeograficoRepository(clienteConSavepoint(tx));
      const cr = await cargarComo(tx, repo, e.cr);
      const xa = await cargarComo(tx, repo, e.xa);
      return { e, cr, xa, paisCr: await delPais(tx, "CR"), paisXa: await delPais(tx, "XA") };
    });

    expect(r.cr.catalogo.paisId).toBe("CR");
    expect(r.cr.catalogo.nodos.map((n) => n.id).sort()).toEqual(r.paisCr.nodos);
    expect(r.cr.catalogo.tipos.map((t) => t.id).sort()).toEqual(r.paisCr.tipos);
    expect(r.cr.catalogo.porId.has(r.e.cr.geo.distritoCentralId)).toBe(true);
    expect(r.cr.catalogo.porId.has(r.e.xa.geo.distritoCentralId)).toBe(false);
    expect(asignacionesLeidas(r.cr)).toEqual(asignacionesSembradas(r.e.cr));

    expect(r.xa.catalogo.paisId).toBe("XA");
    expect(r.xa.catalogo.nodos.map((n) => n.id).sort()).toEqual(r.paisXa.nodos);
    expect(r.xa.catalogo.tipos.map((t) => t.id).sort()).toEqual(r.paisXa.tipos);
    expect(r.xa.catalogo.porId.has(r.e.cr.geo.distritoCentralId)).toBe(false);
    const g43 = r.e.xa.geo43;
    expect(asignacionesLeidas(r.xa)).toEqual(
      asignacionesSembradas(r.e.xa, { zonas: [[g43.geo.distritoId, g43.zonaId]], marcas: [g43.geo.otroDistritoId] }),
    );

    // Anti-vacuidad: Costa Rica trae su geografia de la migracion, mas la del escenario.
    expect(r.paisCr.nodos.length).toBeGreaterThan(100);
    expect(r.paisXa.nodos.length).toBeGreaterThanOrEqual(12);
  });

  it("R9: el catalogo trae los campos del nodo y de los tipos, con el flag propio y en orden por nombre", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const repo = new CatalogoGeograficoRepository(clienteConSavepoint(tx));
      const xa = await cargarComo(tx, repo, e.xa);
      const enOrden = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM nodo_geografico WHERE pais_id = 'XA' ORDER BY nombre, id`,
      );
      return { e, xa, enOrden: enOrden.map((n) => n.id) };
    });
    const cat = r.xa.catalogo;
    const canton = cat.porId.get(r.e.xa.geo.cantonRetiradoId);
    expect(canton).toMatchObject({ padreId: r.e.xa.geo.provinciaId, profundidad: 2, activo: false });
    expect(cat.porId.get(r.e.xa.geo.distritoBajoCantonRetiradoId)).toMatchObject({ profundidad: 3, activo: true });
    expect(cat.porId.get(r.e.xa.geo43.geo.provinciaId)?.codigoOficial).toBe("1");
    expect(cat.tipos.map((t) => t.clave)).toEqual(["nivel_1", "nivel_2", "nivel_3"]);
    expect(cat.tipos.map((t) => t.nombreSingular)).toEqual(["Región", "Comuna", "Barrio"]);
    // El orden lo da la base (nombre, id) con su collation, no `localeCompare`.
    expect(cat.nodos.map((n) => n.id)).toEqual(r.enOrden);
    // Los hijos conservan el orden del catalogo.
    const hijos = (cat.hijos.get(r.e.xa.geo.cantonId) ?? []).map((n) => n.id);
    expect(hijos).toEqual(cat.nodos.filter((n) => n.padreId === r.e.xa.geo.cantonId).map((n) => n.id));
    expect(hijos).toHaveLength(4);
  });

  it("R10: en plataforma, `deLaEmpresa()` lanza `EmpresaNoResuelta` sin consultar; `dePais` trae solo ese pais", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const { cliente, cuenta } = clienteQueCuenta(tx);
      const repo = new CatalogoGeograficoRepository(cliente);
      const error = await comoPlataforma("SLT-44", "test de R10", () => repo.deLaEmpresa()).catch((x: unknown) => x);
      const tras = { ...cuenta };
      const xa = await comoPlataforma("SLT-44", "test de R10", () => repo.dePais("XA"));
      return { e, error, tras, xa, paisXa: await delPais(tx, "XA") };
    });
    expect(r.error).toBeInstanceOf(EmpresaNoResuelta);
    expect(r.tras).toEqual({ transacciones: 0, consultasDeNodos: 0 });
    expect(r.xa.paisId).toBe("XA");
    expect(r.xa.nodos.map((n) => n.id).sort()).toEqual(r.paisXa.nodos);
    expect(r.xa.porId.has(r.e.cr.geo.distritoCentralId)).toBe(false);
  });

  it("R10: con la extension real, en plataforma y sin contexto, ninguna consulta llega a la base", async () => {
    const { prisma: espiado, eventos } = crearPrismaDeTestConEspia();
    try {
      const app = conAislamientoPorEmpresa(espiado, async () => null);
      const repo = new CatalogoGeograficoRepository(app);

      const enPlataforma = await comoPlataforma("SLT-44", "test de R10", () => repo.deLaEmpresa()).catch((x: unknown) => x);
      expect(enPlataforma).toBeInstanceOf(EmpresaNoResuelta);
      expect(eventos).toEqual([]);

      // Sin contexto la empresa saldria de la sesion; no hay. La extension abre la transaccion y
      // rechaza la primera lectura (`zona_distrito`, de negocio) antes de ejecutarla: el control de
      // la transaccion es lo unico que viaja.
      const sinContexto = await repo.deLaEmpresa().catch((x: unknown) => x);
      expect(sinContexto).toBeInstanceOf(EmpresaNoResuelta);
      const consultas = eventos.map((e) => e.query.trim()).filter((q) => !/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(q));
      expect(consultas).toEqual([]);
    } finally {
      await espiado.$disconnect();
    }
  });

  it("R11: tres lecturas por la misma instancia, seguidas o en `Promise.all`, hacen una sola carga", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      await comoApp(tx, e.cr.empresaId);

      const seguidas = clienteQueCuenta(tx);
      const repoA = new CatalogoGeograficoRepository(seguidas.cliente);
      const a = await conEmpresa(e.cr.empresaId, async () => [
        await repoA.deLaEmpresa(),
        await repoA.deLaEmpresa(),
        await repoA.deLaEmpresa(),
      ]);

      const paralelas = clienteQueCuenta(tx);
      const repoB = new CatalogoGeograficoRepository(paralelas.cliente);
      const b = await conEmpresa(e.cr.empresaId, () =>
        Promise.all([repoB.deLaEmpresa(), repoB.deLaEmpresa(), repoB.deLaEmpresa()]),
      );

      // Sin `conEmpresa` la empresa sale de la sesion: tambien una sola carga.
      const sesion = clienteQueCuenta(tx);
      const repoC = new CatalogoGeograficoRepository(sesion.cliente);
      await Promise.all([repoC.deLaEmpresa(), repoC.deLaEmpresa(), repoC.deLaEmpresa()]);
      await comoDueno(tx);
      return { a, b, seguidas: seguidas.cuenta, paralelas: paralelas.cuenta, sesion: sesion.cuenta };
    });
    expect(r.seguidas).toEqual({ transacciones: 1, consultasDeNodos: 1 });
    expect(r.paralelas).toEqual({ transacciones: 1, consultasDeNodos: 1 });
    expect(r.sesion).toEqual({ transacciones: 1, consultasDeNodos: 1 });
    expect(r.a[1]).toBe(r.a[0]);
    expect(r.b[2]).toBe(r.b[0]);
    expect(r.a[0].catalogo.nodos.length).toBeGreaterThan(100);
  });

  it("R11: dos empresas por la misma instancia hacen dos cargas, cada una con lo suyo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const { cliente, cuenta } = clienteQueCuenta(tx);
      const repo = new CatalogoGeograficoRepository(cliente);
      const cr = await cargarComo(tx, repo, e.cr);
      const xa = await cargarComo(tx, repo, e.xa);
      const crOtraVez = await cargarComo(tx, repo, e.cr);
      return { e, cr, xa, crOtraVez, cuenta: { ...cuenta } };
    });
    expect(r.cuenta).toEqual({ transacciones: 2, consultasDeNodos: 2 });
    expect(r.cr.catalogo.paisId).toBe("CR");
    expect(r.xa.catalogo.paisId).toBe("XA");
    expect(r.crOtraVez).toBe(r.cr);
    expect(asignacionesLeidas(r.cr).marcas).toEqual([...r.e.cr.marcas].sort());
    expect(asignacionesLeidas(r.xa).marcas).not.toContain(r.e.cr.marcas[0]);
  });

  it("R11: una instancia nueva ve un distrito renombrado; la de antes conserva su carga", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const vieja = new CatalogoGeograficoRepository(clienteConSavepoint(tx));
      const antes = await cargarComo(tx, vieja, e.cr);
      await tx.distrito.update({ where: { id: e.cr.geo.distritoSinZonaId }, data: { nombre: "Renombrado SLT44" } });
      const nueva = new CatalogoGeograficoRepository(clienteConSavepoint(tx));
      const despues = await cargarComo(tx, nueva, e.cr);
      const deLaVieja = await cargarComo(tx, vieja, e.cr);
      return { e, antes, despues, deLaVieja };
    });
    const id = r.e.cr.geo.distritoSinZonaId;
    expect(r.antes.catalogo.porId.get(id)?.nombre).not.toBe("Renombrado SLT44");
    expect(r.despues.catalogo.porId.get(id)?.nombre).toBe("Renombrado SLT44");
    expect(r.deLaVieja).toBe(r.antes);
  });

  it("R11: si la carga falla, el siguiente intento vuelve a leer", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const { cliente, cuenta } = clienteQueCuenta(tx, { fallarLaPrimera: true });
      const repo = new CatalogoGeograficoRepository(cliente);
      const primera = await cargarComo(tx, repo, e.cr).catch((x: unknown) => x);
      await comoDueno(tx);
      const segunda = await cargarComo(tx, repo, e.cr);
      return { primera, segunda, cuenta: { ...cuenta } };
    });
    expect(r.primera).toBeInstanceOf(Error);
    expect((r.primera as Error).message).toMatch(/PROVOCADA/);
    expect(r.segunda.catalogo.paisId).toBe("CR");
    expect(r.cuenta).toEqual({ transacciones: 2, consultasDeNodos: 1 });
  });
});
