import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import {
  baseAdmitida,
  codigoDeSalida,
  compararEmpresaPresentacion,
  crearClienteDelScript,
  IDS_MAXIMOS,
  leerArgumentos,
  LOTE_POR_DEFECTO,
  lineasDeInforme,
  type InformeDePresentacion,
} from "@/scripts/geo-equivalencia-presentacion";
import { consultaDeHoy } from "@/scripts/geo-equivalencia/geocode-de-hoy";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo125, DATOS_PERSONALES_GEO125, type EmpresaGeo125 } from "./_fixtures/geo-125";
import { comoDueno, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, urlDeBaseDeDatos, type TxDeTest } from "./_postgres-real";

// SLT-125 (T2.7; design §8; R34) — `geo:equivalencia-presentacion` sobre Postgres real y el fixture `geo-125`:
// en CR los nombres de la ruta del catalogo y la consulta de geocodificacion son los de hoy (0 y salida 0);
// el script no escribe (un INSERT con su cliente falla con 25006), no se conecta a una base que no es local
// sin `--destino`, y su salida no lleva datos del fixture: ni destinatarios, ni direcciones, ni lugares.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");

let base: PrismaClient;

async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo125, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.empresaId);
  try {
    return await fn();
  } finally {
    await comoDueno(tx);
  }
}

/**
 * El cliente con el nombre de UN nodo retocado en lo que lee el catalogo. Envuelve tambien el cliente que
 * entrega `$transaction`, que es el que usa la carga. Renombrar el nodo en la base no sirve: la sincronia de
 * SLT-43/SLT-46 llevaria el nombre a la tabla vieja y no habria diferencia que contar.
 */
function conNodoRenombrado(cliente: PrismaClient, nodoId: string): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "nodoGeografico") {
          const real = Reflect.get(o, prop) as { findMany: (a: unknown) => Promise<{ id: string; nombre: string }[]> };
          return {
            findMany: async (args: unknown) =>
              (await real.findMany(args)).map((n) => (n.id === nodoId ? { ...n, nombre: `${n.nombre} (renombrado)` } : n)),
          };
        }
        if (prop === "$transaction") {
          const real = Reflect.get(o, prop) as (fn: (t: object) => unknown, op?: unknown) => Promise<unknown>;
          return (fn: (t: unknown) => unknown, op?: unknown) => real.call(o, (t: object) => fn(envolver(t)), op);
        }
        const valor = Reflect.get(o, prop) as unknown;
        return typeof valor === "function" ? valor.bind(o) : valor;
      },
    });
    return proxy as PrismaClient;
  };
  return envolver(cliente as unknown as object);
}

describe("SLT-125 R34 — argumentos, base admitida e informe (sin base)", () => {
  it("argumentos", () => {
    expect(leerArgumentos([])).toEqual({ empresa: null, lote: LOTE_POR_DEFECTO, destino: null });
    expect(leerArgumentos(["--empresa", "e1", "--lote", "5", "--destino", "copia"])).toEqual({
      empresa: "e1",
      lote: 5,
      destino: "copia",
    });
    expect(leerArgumentos(["--lote", "0"])).toBeNull();
    expect(leerArgumentos(["--destino"])).toBeNull();
    expect(leerArgumentos(["--otra"])).toBeNull();
  });

  it("solo localhost, o la base que nombra --destino", () => {
    expect(baseAdmitida("postgresql://u:p@localhost:5432/x", null)).toBe(true);
    expect(baseAdmitida("postgresql://u:p@copia.ejemplo.invalid:5432/x", null)).toBe(false);
    expect(baseAdmitida("postgresql://u:p@copia.ejemplo.invalid:5432/x", "otra.invalid")).toBe(false);
    expect(baseAdmitida("postgresql://u:p@copia.ejemplo.invalid:5432/x", "copia.ejemplo.invalid")).toBe(true);
    expect(baseAdmitida(undefined, "x")).toBe(false);
  });

  it("codigo de salida y lista de ids acotada", () => {
    const limpio: InformeDePresentacion = {
      organizacionId: "e1",
      ordenes: 2,
      nombresDistintos: [],
      conConsulta: 2,
      consultasDistintas: [],
      huellasDistintas: [],
    };
    const ids = Array.from({ length: IDS_MAXIMOS + 3 }, (_, i) => `o${i}`);
    const sucio = { ...limpio, nombresDistintos: ids };
    expect(codigoDeSalida([limpio], 0)).toBe(0);
    expect(codigoDeSalida([sucio], 0)).toBe(1);
    expect(codigoDeSalida([limpio], 1)).toBe(2);
    const lineas = lineasDeInforme(sucio);
    expect(lineas.filter((l) => l.includes("[nombres] o"))).toHaveLength(IDS_MAXIMOS);
    expect(lineas.at(-1)).toContain("y 3 mas");
  });

  it("la consulta de hoy congelada es la de antes de SLT-125", () => {
    expect(
      consultaDeHoy({ direccion: "Av. Central 100", distritoNombre: "Carmen", cantonNombre: "San José", provinciaNombre: "San José" }),
    ).toBe("Av. Central 100, Carmen, San José, San José, Costa Rica");
    expect(consultaDeHoy({ direccion: " ", distritoNombre: null, cantonNombre: "x", provinciaNombre: "y" })).toBeNull();
  });
});

describeSiHayBase("SLT-125 R34 — geo:equivalencia-presentacion sobre el fixture geo-125", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("CR: 0 nombres y 0 consultas distintas, salida 0; no escribe ni imprime datos del fixture", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      await comoDueno(tx);
      const antes = await tx.orden.count();
      // Lote de 2 sobre 3 ordenes: el recorrido por lotes pasa por mas de uno.
      const cr = await comoLaEmpresa(tx, e.cr, () =>
        compararEmpresaPresentacion(clienteConSavepoint(tx), e.cr.empresaId, { lote: 2 }),
      );
      const despues = await tx.orden.count();
      const ordenes = await tx.orden.findMany({
        where: { id: { in: Object.values(e.cr.ordenes) } },
        select: { provincia: { select: { nombre: true } }, canton: { select: { nombre: true } }, distrito: { select: { nombre: true } } },
      });
      const nombres = ordenes.flatMap((o) => [o.provincia.nombre, o.canton.nombre, o.distrito?.nombre ?? null]);
      return { cr, antes, despues, nombres: [...new Set(nombres.filter((n): n is string => n !== null))] };
    });
    const texto = lineasDeInforme(r.cr).join("\n");
    // Antivacio: las 3 ordenes del fixture, todas con direccion.
    expect(r.cr.ordenes, texto).toBeGreaterThanOrEqual(3);
    expect(r.cr.conConsulta).toBeGreaterThanOrEqual(3);
    expect(r.cr.nombresDistintos, texto).toEqual([]);
    expect(r.cr.consultasDistintas, texto).toEqual([]);
    expect(r.cr.huellasDistintas).toEqual([]);
    expect(codigoDeSalida([r.cr], 0)).toBe(0);
    expect(r.despues).toBe(r.antes);
    for (const dato of DATOS_PERSONALES_GEO125) expect(texto).not.toContain(dato);
    expect(r.nombres.length).toBeGreaterThanOrEqual(3);
    for (const nombre of r.nombres) expect(texto).not.toContain(nombre);
    expect(texto).not.toContain("Costa Rica");
    expect(texto).not.toMatch(/SELECT|FROM|WHERE|"public"|\$1|ANY\(/);
  }, 300_000);

  it("un nombre del catalogo distinto del de la tabla vieja se cuenta, con el id de la orden y sin el nombre", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      await comoDueno(tx);
      const o = await tx.orden.findUniqueOrThrow({ where: { id: e.cr.ordenes.sinDistritoId }, select: { cantonId: true } });
      const canton = await tx.nodoGeografico.findUniqueOrThrow({ where: { id: o.cantonId }, select: { nombre: true } });
      const cr = await comoLaEmpresa(tx, e.cr, () =>
        compararEmpresaPresentacion(conNodoRenombrado(clienteConSavepoint(tx), o.cantonId), e.cr.empresaId, {
          lote: LOTE_POR_DEFECTO,
        }),
      );
      // Todas las ordenes vivas de la empresa en ese canton, medidas como dueño: las de este fixture y las
      // de los fixtures de debajo (`geo-47`, `geo-65`).
      const enElCanton = await tx.orden.findMany({
        where: { organizacionId: e.cr.empresaId, cantonId: o.cantonId, deletedAt: null },
        select: { id: true },
      });
      return { cr, e, canton: canton.nombre, enElCanton: enElCanton.map((x) => x.id).sort() };
    });
    const texto = lineasDeInforme(r.cr).join("\n");
    // El canton de `sinDistrito` es tambien el de `conDistrito`: las dos estan entre las afectadas.
    const afectadas = r.enElCanton;
    expect(afectadas).toEqual(expect.arrayContaining([r.e.cr.ordenes.conDistritoId, r.e.cr.ordenes.sinDistritoId]));
    expect([...r.cr.nombresDistintos].sort()).toEqual(afectadas);
    expect([...r.cr.consultasDistintas].sort()).toEqual(afectadas);
    expect([...r.cr.huellasDistintas].sort()).toEqual(afectadas);
    expect(codigoDeSalida([r.cr], 0)).toBe(1);
    for (const id of afectadas) expect(texto).toContain(id);
    expect(texto).not.toContain(r.canton);
  }, 300_000);

  it("con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
    const cliente = crearClienteDelScript(urlDeBaseDeDatos());
    try {
      const error = await comoPlataforma("SLT-125", "test de la barrera de solo lectura", () =>
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

  it("con una DATABASE_URL que no es local y sin --destino, sale con 2 sin conectar y sin imprimir la URL", () => {
    const destino = new URL("postgresql://db.ejemplo.invalid:5432/produccion");
    destino.username = "usuario";
    destino.password = "secreto-slt125";
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/geo-equivalencia-presentacion.ts"], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: destino.toString() },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.status).toBe(2);
    const salida = `${r.stdout}\n${r.stderr}`;
    expect(salida).toContain("ABORTA");
    expect(salida).not.toContain("secreto-slt125");
    expect(salida).not.toContain("db.ejemplo.invalid");
  }, 90_000);
});
