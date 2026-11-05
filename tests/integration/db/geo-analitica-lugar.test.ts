import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { prepararConteoEntregas, type ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { prepararConsultaProductos, type ConsultaProductos } from "@/lib/analytics/productos-consulta";
import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { CicloVidaRepository, condicionesDeCiclo } from "@/lib/repositories/CicloVidaRepository";
import { CohorteCargaRepository } from "@/lib/repositories/CohorteCargaRepository";
import {
  ConteoCargadasPorDiaRepository,
  condicionesDeCargadas,
} from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import {
  ConteoDevolucionesRepository,
  condicionesDeDevoluciones,
} from "@/lib/repositories/ConteoDevolucionesRepository";
import { ConteoEntregasRepository } from "@/lib/repositories/ConteoEntregasRepository";
import { ConteoHoyGestionRepository } from "@/lib/repositories/ConteoHoyGestionRepository";
import { ConteoPorStatusRepository, condicionesDeConsulta } from "@/lib/repositories/ConteoPorStatusRepository";
import { ConteoProductosRepository } from "@/lib/repositories/ConteoProductosRepository";
import { DineroProductosRepository } from "@/lib/repositories/DineroProductosRepository";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { lugaresDelFiltro } from "@/lib/repositories/_shared/lugares-del-filtro";
import * as hoy from "@/scripts/geo-equivalencia/analitica-de-hoy";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo71, type EmpresaGeo71 } from "./_fixtures/geo-71";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-71 (T3.4; R1–R5, R7, R13; design §3, §11) — LAS LECTURAS DE ANALITICA FILTRAN POR EL LUGAR DE LA
// ORDEN, contra la copia congelada de hoy (`scripts/geo-equivalencia/analitica-de-hoy.ts`) y sobre
// Postgres real, en el fixture `geo-71`.
//
// Se lee como la app: `servi_app` con la RLS de la empresa (`comoApp`) y el contexto `conEmpresa`, con
// un repositorio nuevo por lectura (como las composiciones). La profundidad 4 no se puede escribir en
// la base (las FK de `orden` son a `distrito`): se prueba cambiando la ENTRADA del catalogo, con un
// cliente que anade un nodo a `nodoGeografico.findMany` (tecnica de SLT-44/65).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

// ---------------------------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------------------------

interface Registro {
  /** Cada `$queryRaw`, reconstruido como lo manda Prisma. */
  sql: Prisma.Sql[];
  /** Los ids que devolvio cada `nodoGeografico.findMany`. */
  cargasDeNodos: string[][];
}

interface NodoInyectado {
  id: string;
  padreId: string;
  profundidad: number;
}

/**
 * El cliente de la transaccion con un registro de lo que se lee y, si se pide, nodos de mas en el
 * catalogo (la entrada cambiada).
 */
function clienteEspia(tx: TxDeTest, extra: readonly NodoInyectado[] = []): { cliente: PrismaClient; reg: Registro } {
  const reg: Registro = { sql: [], cargasDeNodos: [] };
  const envolver = (objetivo: object): PrismaClient => new Proxy(objetivo, {
    get(o, prop) {
      // La carga del catalogo abre su transaccion: el cliente de dentro tambien se espia.
      if (prop === "$transaction") {
        const real = Reflect.get(o, prop) as ((fn: (t: object) => unknown, op?: unknown) => Promise<unknown>) | undefined;
        if (typeof real !== "function") return real;
        return (fn: (t: object) => unknown, op?: unknown) => real.call(o, (t: object) => fn(envolver(t)), op);
      }
      if (prop === "$queryRaw") {
        const real = Reflect.get(o, prop) as (...a: unknown[]) => Promise<unknown>;
        return (plantilla: TemplateStringsArray, ...valores: unknown[]) => {
          reg.sql.push(Prisma.sql(plantilla, ...valores));
          return real.call(o, plantilla, ...valores);
        };
      }
      if (prop === "nodoGeografico") {
        const real = Reflect.get(o, prop) as PrismaClient["nodoGeografico"];
        return {
          findMany: async (args: unknown) => {
            const filas = (await real.findMany(args as never)) as unknown as Record<string, unknown>[];
            const muestra = filas[0];
            const mas = extra.map((n) => ({ ...muestra, ...n, nombre: `Inyectado ${n.id}` }));
            const todas = [...filas, ...mas];
            reg.cargasDeNodos.push(todas.map((f) => String(f.id)));
            return todas;
          },
        };
      }
      const valor = Reflect.get(o, prop) as unknown;
      return typeof valor === "function" ? valor.bind(o) : valor;
    },
  }) as unknown as PrismaClient;
  return { cliente: envolver(tx as object), reg };
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa<T>(tx: TxDeTest, empresaId: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresaId);
  try {
    return await conEmpresa(empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

// ---------------------------------------------------------------------------------------------
// Consultas y lecturas
// ---------------------------------------------------------------------------------------------

type Actor = { usuarioId: string; rol: string };
const MAESTRO: Actor = { usuarioId: randomUUID(), rol: "maestro" };

function consultaEntregas(raw: object, actor: Actor = MAESTRO): ConsultaConteoEntregas {
  const p = prepararConteoEntregas(raw, actor);
  if (p.status !== "ok") throw new Error(`consulta de prueba no concedida: ${JSON.stringify(p)}`);
  return p.consulta;
}

function consultaProductos(raw: object): ConsultaProductos {
  const p = prepararConsultaProductos(raw, MAESTRO);
  if (p.status !== "ok") throw new Error(`consulta de productos no concedida: ${JSON.stringify(p)}`);
  return p.consulta;
}

/** Las cinco lecturas de analitica: nombre, la nueva y la de hoy, sobre el mismo cliente. */
const ANALITICA: readonly {
  nombre: string;
  nueva: (c: PrismaClient, q: ConsultaConteoEntregas) => Promise<unknown>;
  deHoy: (c: PrismaClient, q: ConsultaConteoEntregas) => Promise<unknown>;
}[] = [
  {
    nombre: "por-status",
    nueva: (c, q) => new ConteoPorStatusRepository(c).contarPorStatus(q),
    deHoy: (c, q) => hoy.contarPorStatusDeHoy(c, q),
  },
  {
    nombre: "entregas",
    nueva: async (c, q) => (await new ConteoEntregasRepository(new ConteoPorStatusRepository(c)).contar(q)).porDesenlace,
    deHoy: async (c, q) => hoy.plegarEnDesenlaces(await hoy.contarPorStatusDeHoy(c, q)),
  },
  {
    nombre: "cargadas",
    nueva: (c, q) => new ConteoCargadasPorDiaRepository(c).contarCargadasPorDia(q),
    deHoy: (c, q) => hoy.contarCargadasPorDiaDeHoy(c, q),
  },
  {
    nombre: "devoluciones",
    nueva: (c, q) => new ConteoDevolucionesRepository(c).contarDevolucionesPorCausa(q),
    deHoy: (c, q) => hoy.contarDevolucionesPorCausaDeHoy(c, q),
  },
  {
    nombre: "ciclo-vida",
    nueva: (c, q) => new CicloVidaRepository(c).acumularCiclos(q),
    deHoy: (c, q) => hoy.acumularCiclosDeHoy(c, q),
  },
];

/** Las cuatro que comparten el recorte (R7). `null` si la lectura no aplica a la consulta. */
const COMPARTEN: readonly {
  nombre: string;
  nueva: (c: PrismaClient, raw: object) => Promise<unknown> | null;
  deHoy: (c: PrismaClient, raw: object) => Promise<unknown> | null;
}[] = [
  {
    nombre: "productos",
    nueva: (c, raw) => new ConteoProductosRepository(c).contarProductos(consultaProductos(raw)),
    deHoy: (c, raw) => hoy.contarProductosDeHoy(c, consultaProductos(raw)),
  },
  {
    nombre: "dinero",
    nueva: (c, raw) => new DineroProductosRepository(c).leerDineroPorOrden(consultaProductos(raw)),
    deHoy: (c, raw) => hoy.dineroProductosDeHoy(c, consultaProductos(raw)),
  },
  {
    nombre: "cohorte",
    // La cohorte exige rango: sin el, el borde responde `sin_rango` antes de llegar aqui.
    nueva: (c, raw) => ("rango" in raw ? new CohorteCargaRepository(c).contarCohortes(consultaEntregas(raw)) : null),
    deHoy: (c, raw) => ("rango" in raw ? hoy.cohorteCargaDeHoy(c, consultaEntregas(raw)) : null),
  },
  {
    nombre: "hoy",
    nueva: (c, raw) => {
      const q = consultaEntregas(raw);
      const dia = consultaEntregas({ rango: "dia" }).rango;
      return dia === null ? null : new ConteoHoyGestionRepository(c).contarDeHoy(q, dia);
    },
    deHoy: (c, raw) => {
      const q = consultaEntregas(raw);
      const dia = consultaEntregas({ rango: "dia" }).rango;
      return dia === null ? null : hoy.conteoHoyGestionDeHoy(c, q, dia);
    },
  },
];

/** Los filtros de una empresa: cada nodo de cada nivel y dos combinaciones, sin y con rango. */
function filtrosDe(e: EmpresaGeo71): { nombre: string; raw: object }[] {
  const g = e.base.base.geo;
  const s = e.segunda;
  const sinRango: { nombre: string; raw: object }[] = [
    { nombre: "sin faceta", raw: {} },
    ...[g.provinciaId, s.provinciaId].map((id) => ({ nombre: `provincia ${id}`, raw: { provincia_id: [id] } })),
    ...[g.cantonId, g.cantonRetiradoId, s.cantonId].map((id) => ({ nombre: `canton ${id}`, raw: { canton_id: [id] } })),
    ...[
      g.distritoCentralId,
      g.distritoDosZonasId,
      g.distritoSinZonaId,
      g.distritoRetiradoId,
      g.distritoBajoCantonRetiradoId,
      s.distritoId,
    ].map((id) => ({ nombre: `distrito ${id}`, raw: { distrito_id: [id] } })),
    { nombre: "provincia y canton", raw: { provincia_id: [g.provinciaId], canton_id: [g.cantonId] } },
    { nombre: "canton y distrito", raw: { canton_id: [g.cantonId], distrito_id: [g.distritoCentralId] } },
    { nombre: "dos provincias y zona", raw: { provincia_id: [g.provinciaId, s.provinciaId], zona_id: [e.base.base.zonas.norteId] } },
  ];
  return [...sinRango, ...sinRango.map((f) => ({ nombre: `${f.nombre} (mes)`, raw: { ...f.raw, rango: "mes" } }))];
}

interface Diferencia {
  lectura: string;
  filtro: string;
  nueva: unknown;
  deHoy: unknown;
}

/** Para cada lectura y filtro, el resultado nuevo frente al de hoy; devuelve las diferencias. */
async function compararEmpresa(tx: TxDeTest, e: EmpresaGeo71, actor: Actor = MAESTRO): Promise<Diferencia[]> {
  const cliente = tx as unknown as PrismaClient;
  return comoLaEmpresa(tx, e.base.base.empresaId, async () => {
    const difs: Diferencia[] = [];
    for (const f of filtrosDe(e)) {
      for (const l of ANALITICA) {
        const q = consultaEntregas(f.raw, actor);
        const nueva = await l.nueva(cliente, q);
        const deHoy = await l.deHoy(cliente, q);
        if (JSON.stringify(nueva) !== JSON.stringify(deHoy)) difs.push({ lectura: l.nombre, filtro: f.nombre, nueva, deHoy });
      }
      if (actor !== MAESTRO) continue;
      for (const l of COMPARTEN) {
        const nueva = await l.nueva(cliente, f.raw);
        const deHoy = await l.deHoy(cliente, f.raw);
        if (JSON.stringify(nueva) !== JSON.stringify(deHoy)) difs.push({ lectura: l.nombre, filtro: f.nombre, nueva, deHoy });
      }
    }
    return difs;
  });
}

/** El total de ordenes del desglose por estado, nuevo y de hoy, para un filtro. */
async function totalesPorStatus(tx: TxDeTest, e: EmpresaGeo71, raw: object, cliente?: PrismaClient) {
  const c = cliente ?? (tx as unknown as PrismaClient);
  return comoLaEmpresa(tx, e.base.base.empresaId, async () => {
    const q = consultaEntregas(raw);
    const suma = (filas: readonly { conteo: number }[]) => filas.reduce((s, f) => s + f.conteo, 0);
    return {
      nueva: suma(await new ConteoPorStatusRepository(c).contarPorStatus(q)),
      deHoy: suma(await hoy.contarPorStatusDeHoy(tx as unknown as PrismaClient, q)),
    };
  });
}

// ---------------------------------------------------------------------------------------------

describeSiHayBase("SLT-71 T3.4 — analitica por el lugar de la orden (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1, R2, R4, R7: con la cadena coherente, cada lectura da lo mismo que hoy con cada faceta, combinacion y rango", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const antivacio = {
        cr: await totalesPorStatus(tx, e.cr, { provincia_id: [e.cr.segunda.provinciaId] }),
        xa: await totalesPorStatus(tx, e.xa, { canton_id: [e.xa.base.base.geo.cantonId] }),
      };
      return {
        cr: await compararEmpresa(tx, e.cr),
        xa: await compararEmpresa(tx, e.xa),
        crTienda: await compararEmpresa(tx, e.cr, { usuarioId: e.cr.base.base.tiendaId, rol: "adminTienda" }),
        antivacio,
      };
    });
    expect(r.cr).toEqual([]);
    expect(r.xa).toEqual([]);
    expect(r.crTienda).toEqual([]);
    // Antivacio: las comparaciones no son iguales por vacias.
    expect(r.antivacio.cr.nueva).toBe(3);
    expect(r.antivacio.xa.nueva).toBeGreaterThan(5);
  }, 180_000);

  it("R2: con faceta geografica, el alcance sigue siendo la primera condicion de las cinco lecturas", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const tiendaId = e.cr.base.base.tiendaId;
      return comoLaEmpresa(tx, e.cr.base.base.empresaId, async () => {
        const q = consultaEntregas(
          { provincia_id: [e.cr.base.base.geo.provinciaId], zona_id: [e.cr.base.base.zonas.norteId] },
          { usuarioId: tiendaId, rol: "adminTienda" },
        );
        const repo = new CatalogoGeograficoRepository(tx as unknown as PrismaClient);
        const lugares = await lugaresDelFiltro(() => repo, q.filtro);
        return {
          tiendaId,
          primeras: [
            condicionesDeConsulta(q, lugares)[0],
            condicionesDeCargadas(q, lugares)[0],
            condicionesDeDevoluciones(q, lugares)[0],
            condicionesDeCiclo(q, lugares)[0],
          ].map((c) => ({ sql: c.sql, values: c.values })),
        };
      });
    });
    for (const p of r.primeras) {
      expect(p.sql).toContain('o."tienda_id"');
      expect(p.values).toEqual([r.tiendaId]);
    }
  });

  it("R1 (profundidad 4): un nodo bajo el distrito pedido aporta sus ordenes, por el dominio y no por la columna", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const g = e.xa.base.base.geo;
      // El distrito «dos zonas» colgado, como nivel 4, del distrito central: pedir el central trae
      // tambien las ordenes del otro.
      const { cliente } = clienteEspia(tx, [{ id: g.distritoDosZonasId, padreId: g.distritoCentralId, profundidad: 4 }]);
      const central = await totalesPorStatus(tx, e.xa, { distrito_id: [g.distritoCentralId] }, cliente);
      const dosZonas = await totalesPorStatus(tx, e.xa, { distrito_id: [g.distritoDosZonasId] });
      return { central, dosZonas };
    });
    expect(r.dosZonas.deHoy).toBeGreaterThan(0);
    expect(r.central.nueva).toBe(r.central.deHoy + r.dosZonas.deHoy);
  });

  it("R3: un id de canton pedido como distrito, o uno de otro pais, da cero en las cinco lecturas", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const cliente = tx as unknown as PrismaClient;
      const casos = [
        { distrito_id: [e.cr.base.base.geo.cantonId] },
        { provincia_id: [e.xa.base.base.geo.provinciaId] },
        { canton_id: [e.cr.base.base.geo.provinciaId] },
      ];
      return comoLaEmpresa(tx, e.cr.base.base.empresaId, async () => {
        const salida: { nueva: unknown; deHoy: unknown }[] = [];
        for (const raw of casos) {
          for (const l of ANALITICA) {
            const q = consultaEntregas(raw);
            salida.push({ nueva: await l.nueva(cliente, q), deHoy: await l.deHoy(cliente, q) });
          }
        }
        return salida;
      });
    });
    const vacio = (v: unknown) =>
      Array.isArray(v)
        ? v.length === 0
        : typeof v === "object" && v !== null && "n" in v
          ? (v as { n: number }).n === 0
          : Object.values(v as Record<string, number>).every((n) => n === 0);
    expect(r).toHaveLength(15);
    for (const x of r) {
      expect(vacio(x.nueva)).toBe(true);
      expect(x.nueva).toEqual(x.deHoy);
    }
  });

  it("R5: sin faceta geografica no se toca el catalogo y el SQL y los parametros son los de hoy", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const nuevo = clienteEspia(tx);
      const deHoy = clienteEspia(tx);
      await comoLaEmpresa(tx, e.cr.base.base.empresaId, async () => {
        for (const raw of [{}, { zona_id: [e.cr.base.base.zonas.norteId], rango: "mes" }, { tienda_id: [e.cr.base.base.tiendaId] }]) {
          for (const l of ANALITICA) {
            const q = consultaEntregas(raw);
            await l.nueva(nuevo.cliente, q);
            await l.deHoy(deHoy.cliente, q);
          }
          for (const l of COMPARTEN) {
            await l.nueva(nuevo.cliente, raw);
            await l.deHoy(deHoy.cliente, raw);
          }
        }
      });
      // La copia es de funciones libres (un nivel de sangria menos que el metodo): el texto se
      // compara sin los espacios de sangria, que Postgres no lee.
      const forma = (s: Prisma.Sql) => ({ text: s.text.replace(/\s+/g, " ").trim(), values: s.values });
      return {
        cargas: nuevo.reg.cargasDeNodos.length,
        nuevo: nuevo.reg.sql.map(forma),
        deHoy: deHoy.reg.sql.map(forma),
      };
    });
    expect(r.cargas).toBe(0);
    expect(r.nuevo.length).toBeGreaterThan(20);
    expect(r.nuevo.every((s) => !s.text.includes("nodo_geografico"))).toBe(true);
    expect(r.nuevo).toEqual(r.deHoy);
  });

  it("la orden de cadena incoherente es la unica diferencia: R4 vale solo con la cadena coherente", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      return totalesPorStatus(tx, e.cr, { canton_id: [e.cr.base.base.geo.cantonId] });
    });
    // Hoy cuenta por `canton_id` (el canton activo); su lugar es un distrito del canton retirado.
    expect(r.deHoy - r.nueva).toBe(1);
  });

  it("R13: la empresa XA carga solo su catalogo, una vez por instancia aunque se lea dos veces", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const { cliente, reg } = clienteEspia(tx);
      await comoLaEmpresa(tx, e.xa.base.base.empresaId, async () => {
        const repo = new ConteoPorStatusRepository(cliente);
        const q = consultaEntregas({ provincia_id: [e.xa.base.base.geo.provinciaId] });
        await repo.contarPorStatus(q);
        await repo.contarPorStatus(q);
      });
      return { cargas: reg.cargasDeNodos, xa: e.xa, cr: e.cr };
    });
    expect(r.cargas).toHaveLength(1);
    const ids = new Set(r.cargas[0]);
    expect(ids.has(r.xa.base.base.geo.provinciaId)).toBe(true);
    expect(ids.has(r.xa.segunda.distritoId)).toBe(true);
    expect(ids.has(r.cr.base.base.geo.provinciaId)).toBe(false);
    expect(ids.has(r.cr.segunda.provinciaId)).toBe(false);
  });

  it("R13: en plataforma, con faceta, las cinco lecturas fallan con EmpresaNoResuelta sin devolver filas", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx, { incoherente: false });
      const cliente = tx as unknown as PrismaClient;
      const q = consultaEntregas({ canton_id: [e.cr.base.base.geo.cantonId] });
      return comoPlataforma("SLT-71", "test: analitica con faceta en plataforma", async () => {
        const errores: unknown[] = [];
        for (const l of ANALITICA) {
          errores.push(await l.nueva(cliente, q).then(() => null, (err: unknown) => err));
        }
        return errores;
      });
    });
    expect(r).toHaveLength(5);
    for (const err of r) expect(err).toBeInstanceOf(EmpresaNoResuelta);
  });
});
