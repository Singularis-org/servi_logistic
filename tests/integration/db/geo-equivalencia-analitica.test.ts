import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import {
  codigoDeSalida,
  compararEmpresaAnalitica,
  filtrosDeLaEmpresa,
  hayDiferencias,
  leerArgumentos,
  lineasDeInforme,
  MUESTRA_POR_DEFECTO,
  type InformeDeEmpresa,
} from "@/scripts/geo-equivalencia-analitica";
import { crearClienteDeSoloLectura } from "@/scripts/geo-equivalencia-dinero";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { DATOS_PERSONALES_GEO65 } from "./_fixtures/geo-65";
import { crearEscenarioGeo71, type EmpresaGeo71, type EscenarioGeo71 } from "./_fixtures/geo-71";
import { comoDueno, sqlstateDe } from "./_fixtures/pais-20";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SLT-71 (T5.2; R17, R18; design §8, §11) — EL SCRIPT DE EQUIVALENCIA DE ANALITICA Y TRANSITO,
// `geo:equivalencia-analitica`, contra Postgres real y con el escenario de `geo-71.ts` (CR y `XA`).
//
// Las comparaciones corren sobre la transaccion del test (que se revierte), como `servi_app` con la
// empresa fijada: la copia de hoy y los repositorios ven la misma foto y la misma RLS. La barrera de
// solo lectura y la de localhost se prueban aparte, con el cliente y el proceso del script (R18).
//
// LA CONTRAPRUEBA mueve un canton a OTRA provincia en el catalogo que lee la lectura NUEVA (un cliente
// que cambia el `padreId` en lo que devuelve `nodoGeografico.findMany`; tecnica de SLT-44/65): las
// provincias cuentan distinto que por la columna, y el script lo tiene que nombrar y salir con 1.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");

let base: PrismaClient;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** `revertida` de `pais-20.ts` con mas tiempo: nueve lecturas por filtro, decenas de filtros. */
async function revertidaLarga<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 240_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo71) => Promise<T>): Promise<T> {
  return revertidaLarga(async (tx) => fn(tx, await crearEscenarioGeo71(tx)));
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion. */
async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo71, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.base.empresaId);
  try {
    return await fn();
  } finally {
    await comoDueno(tx);
  }
}

/** El cliente de la lectura NUEVA con el nodo `nodoId` colgado de `padreId` en el catalogo. */
function conNodoMovido(cliente: PrismaClient, nodoId: string, padreId: string): PrismaClient {
  const envolver = (objetivo: object): PrismaClient =>
    new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "nodoGeografico") {
          const real = Reflect.get(o, prop) as PrismaClient["nodoGeografico"];
          return {
            findMany: async (args: unknown) =>
              ((await real.findMany(args as never)) as unknown as { id: string }[]).map((n) =>
                n.id === nodoId ? { ...n, padreId } : n,
              ),
          };
        }
        if (prop === "$transaction") {
          const real = Reflect.get(o, prop) as (fn: (t: object) => unknown, op?: unknown) => Promise<unknown>;
          return (fn: (t: object) => unknown, op?: unknown) => real.call(o, (t: object) => fn(envolver(t)), op);
        }
        const valor = Reflect.get(o, prop) as unknown;
        return typeof valor === "function" ? valor.bind(o) : valor;
      },
    }) as unknown as PrismaClient;
  return envolver(cliente as unknown as object);
}

async function contarFilas(tx: TxDeTest) {
  await comoDueno(tx);
  return {
    orden: await tx.orden.count(),
    gestionOrden: await tx.gestionOrden.count(),
    historial: await tx.ordenHistorialEstado.count(),
    nodos: await tx.nodoGeografico.count(),
  };
}

/** Los nombres de los nodos del fixture de una empresa: ninguno puede salir en el informe (R18). */
async function nombresDeNodos(tx: TxDeTest, e: EmpresaGeo71): Promise<string[]> {
  const ids = [...Object.values(e.base.base.geo), ...Object.values(e.segunda)];
  return (await tx.nodoGeografico.findMany({ where: { id: { in: ids } }, select: { nombre: true } })).map((n) => n.nombre);
}

function sinDatosDeMas(salida: string, nombres: readonly string[]): void {
  for (const dato of DATOS_PERSONALES_GEO65) expect(salida).not.toContain(dato);
  expect(nombres.length).toBeGreaterThan(5);
  for (const nombre of nombres) expect(salida).not.toContain(nombre);
  expect(salida).not.toMatch(/SELECT|FROM|WHERE|"public"|\$1|ANY\(/);
}

// ---------------------------------------------------------------------------------------------
// Sin base
// ---------------------------------------------------------------------------------------------

describe("SLT-71 R17 — argumentos y codigo de salida de geo:equivalencia-analitica", () => {
  it("--muestra por defecto 20; --muestra y --empresa se leen; lo demas es error de uso", () => {
    expect(MUESTRA_POR_DEFECTO).toBe(20);
    expect(leerArgumentos([])).toEqual({ muestra: 20, empresa: null });
    expect(leerArgumentos(["--muestra", "5", "--empresa", "abc"])).toEqual({ muestra: 5, empresa: "abc" });
    expect(leerArgumentos(["--muestra", "0"])).toBeNull();
    expect(leerArgumentos(["--muestra"])).toBeNull();
    expect(leerArgumentos(["--destino", "prod"])).toBeNull();
  });

  it("0 si coincide (aunque haya incoherentes), 1 si difiere un bloque, 2 si una empresa fallo", () => {
    const cero = { comparados: 3, distintos: 0 };
    const igual: InformeDeEmpresa = {
      organizacionId: "a",
      filtros: 2,
      analitica: cero,
      compartenRecorte: cero,
      transito: cero,
      soloIncoherentes: 4,
      cadenaIncoherente: ["x"],
      diferencias: [],
    };
    expect(hayDiferencias(igual)).toBe(false);
    expect(codigoDeSalida([igual], 0)).toBe(0);
    for (const bloque of ["analitica", "compartenRecorte", "transito"] as const) {
      expect(codigoDeSalida([igual, { ...igual, [bloque]: { comparados: 3, distintos: 1 } }], 0)).toBe(1);
    }
    expect(codigoDeSalida([igual], 1)).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Contra Postgres real
// ---------------------------------------------------------------------------------------------

describeSiHayBase("SLT-71 T5.2 — geo:equivalencia-analitica (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R17: sobre el fixture todo coincide en las dos empresas; la orden incoherente sale solo en `cadena-incoherente` y la salida es 0", async () => {
    const r = await conEscenario(async (tx, e) => {
      const salida: { empresa: EmpresaGeo71; informe: InformeDeEmpresa }[] = [];
      for (const empresa of [e.cr, e.xa]) {
        const informe = await comoLaEmpresa(tx, empresa, () =>
          compararEmpresaAnalitica(clienteConSavepoint(tx), empresa.base.base.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
        );
        salida.push({ empresa, informe });
      }
      return { salida, incoherenteId: e.incoherenteId };
    });

    for (const { empresa, informe } of r.salida) {
      const texto = lineasDeInforme(informe).join("\n");
      expect(informe.diferencias, texto).toEqual([]);
      expect(hayDiferencias(informe), texto).toBe(false);
      expect(informe.organizacionId).toBe(empresa.base.base.empresaId);
      // Antivacio: dos provincias, tres cantones y varios distritos con ordenes, sin y con `mes`;
      // las cinco lecturas y las cuatro que comparten el recorte en cada filtro.
      expect(informe.filtros).toBeGreaterThanOrEqual(2 * (1 + 2 + 3 + 5 + 2));
      expect(informe.analitica.comparados).toBe(5 * informe.filtros);
      expect(informe.compartenRecorte.comparados).toBe(4 * informe.filtros);
      // Las dos ordenes en transito de la empresa, con y sin distrito.
      expect(informe.transito).toEqual({ comparados: 2, distintos: 0 });
    }
    const [cr, xa] = r.salida.map((x) => x.informe);
    // La orden incoherente es de CR: se nombra por id y solo alli.
    expect(r.incoherenteId).not.toBeNull();
    expect(cr.cadenaIncoherente).toEqual([r.incoherenteId]);
    expect(xa.cadenaIncoherente).toEqual([]);
    // Difiere de verdad (el canton activo la cuenta por columna, no por lugar), y no cuenta.
    expect(cr.soloIncoherentes).toBeGreaterThan(0);
    expect(xa.soloIncoherentes).toBe(0);
    const lineas = lineasDeInforme(cr);
    expect(lineas).toContain(`empresa ${cr.organizacionId} cadena-incoherente: ordenes=1`);
    expect(lineas.join("\n")).toContain(String(r.incoherenteId));
    expect(codigoDeSalida([cr, xa], 0)).toBe(0);
  }, 300_000);

  it("R17 contraprueba: un canton movido a otra provincia en el catalogo nuevo da diferencias en `analitica`, nombradas por filtro, y salida 1", async () => {
    const r = await conEscenario(async (tx, e) => {
      const empresa = e.xa;
      const g = empresa.base.base.geo;
      const informe = await comoLaEmpresa(tx, empresa, () => {
        const cliente = clienteConSavepoint(tx);
        return compararEmpresaAnalitica(cliente, empresa.base.base.empresaId, {
          muestra: MUESTRA_POR_DEFECTO,
          clienteNuevo: conNodoMovido(cliente, g.cantonId, empresa.segunda.provinciaId),
        });
      });
      return { informe, primera: g.provinciaId, segunda: empresa.segunda.provinciaId, nombres: await nombresDeNodos(tx, empresa) };
    });

    const { informe } = r;
    expect(hayDiferencias(informe)).toBe(true);
    expect(informe.analitica.distintos).toBeGreaterThan(0);
    expect(codigoDeSalida([informe], 0)).toBe(1);
    // XA no tiene ordenes incoherentes: nada se disculpa.
    expect(informe.soloIncoherentes).toBe(0);
    const deAnalitica = informe.diferencias.filter((d) => d.bloque === "analitica");
    for (const provincia of [r.primera, r.segunda]) {
      expect(deAnalitica.some((d) => d.id === `provincia=${provincia}` && d.campo === "por-status")).toBe(true);
    }
    // Sin la provincia en el filtro, nada cambia.
    expect(informe.diferencias.some((d) => d.id === "sin-filtro" || d.id === "sin-filtro mes")).toBe(false);
    const salida = lineasDeInforme(informe).join("\n");
    expect(salida).toMatch(new RegExp(`\\[analitica\\] provincia=${r.segunda} por-status: hoy=n=\\d+ nuevo=n=\\d+`));
    sinDatosDeMas(salida, r.nombres);
  }, 300_000);

  it("R17: --muestra fija cuantos cantones y distritos entran, los de mas ordenes vivas", async () => {
    const r = await conEscenario(async (tx, e) =>
      comoLaEmpresa(tx, e.cr, () =>
        conEmpresa(e.cr.base.base.empresaId, async () => {
          const cliente = clienteConSavepoint(tx);
          const { catalogo } = await new CatalogoGeograficoRepository(cliente).deLaEmpresa();
          const etiquetas = async (muestra: number) => (await filtrosDeLaEmpresa(cliente, catalogo, muestra)).map((f) => f.etiqueta);
          return { uno: await etiquetas(1), tres: await etiquetas(3), cantonId: e.cr.base.base.geo.cantonId };
        }),
      ),
    );
    const contar = (etiquetas: string[], prefijo: string) =>
      etiquetas.filter((x) => x.startsWith(prefijo) && !x.endsWith(" mes") && !x.includes("nivel-equivocado")).length;
    expect(contar(r.uno, "canton=")).toBe(1);
    expect(contar(r.uno, "distrito=")).toBe(1);
    expect(contar(r.tres, "canton=")).toBe(3);
    expect(contar(r.tres, "distrito=")).toBe(3);
    // El canton con mas ordenes vivas de CR es el activo de `geo-65`.
    expect(r.uno).toContain(`canton=${r.cantonId}`);
    expect(r.uno).toContain(`distrito=${r.cantonId} (nivel-equivocado)`);
    expect(r.uno.some((x) => x.startsWith("provincia=") && x.includes(`+canton=${r.cantonId}`))).toBe(true);
    // Cada filtro, sin rango y con `mes`.
    expect(r.uno.filter((x) => x.endsWith(" mes"))).toHaveLength(r.uno.length / 2);
  }, 300_000);

  describe("R18 — no escribe, solo contra localhost y no imprime datos personales ni nombres", () => {
    it("las filas quedan iguales y la salida no lleva datos personales, nombres de lugar ni SQL", async () => {
      const r = await conEscenario(async (tx, e) => {
        const antes = await contarFilas(tx);
        const informe = await comoLaEmpresa(tx, e.cr, () =>
          compararEmpresaAnalitica(clienteConSavepoint(tx), e.cr.base.base.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
        );
        const despues = await contarFilas(tx);
        return { antes, despues, informe, nombres: await nombresDeNodos(tx, e.cr) };
      });
      expect(r.despues).toEqual(r.antes);
      sinDatosDeMas(lineasDeInforme(r.informe).join("\n"), r.nombres);
    }, 300_000);

    it("con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
      const cliente = crearClienteDeSoloLectura(urlDeBaseDeDatos());
      try {
        const error = await comoPlataforma("SLT-71", "test de la barrera de solo lectura", () =>
          cliente.$executeRawUnsafe(`INSERT INTO orden (id) VALUES ('${randomUUID()}')`),
        ).then(
          () => null,
          (err: unknown) => err,
        );
        expect(error).not.toBeNull();
        expect(sqlstateDe(error)).toBe("25006");
      } finally {
        await cliente.$disconnect();
      }
    });

    it("con una DATABASE_URL que no es local, el script sale con 2 sin conectar y sin imprimir la URL", () => {
      const url = "postgresql://usuario:secreto-slt71@db.ejemplo.invalid:5432/produccion";
      const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/geo-equivalencia-analitica.ts"], {
        cwd: RAIZ,
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(r.status).toBe(2);
      const salida = `${r.stdout}\n${r.stderr}`;
      expect(salida).toContain("ABORTA");
      expect(salida).not.toContain("secreto-slt71");
      expect(salida).not.toContain("db.ejemplo.invalid");
    }, 90_000);
  });
});
