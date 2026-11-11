import { spawnSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { condicionesDeLugar, whereDeLugares } from "@/lib/repositories/_shared/lugares-del-filtro";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";
import { crearCaptura } from "@/scripts/geo-equivalencia/captura-consultas";
import { paginaSateliteSql } from "@/scripts/geo-equivalencia/filtros-de-hoy";
import { CORRIDAS, type LadoMedido } from "@/scripts/geo-equivalencia/medicion";
import {
  codigoDeSalida,
  elegirObjetivos,
  hayRegresion,
  lineaDeObjetivos,
  lineaDeResultado,
  medirLecturas,
  TAMANO_DE_PAGINA,
  type ResultadoDeLectura,
} from "@/scripts/geo-explain-filtros";
import { delegadosDelCatalogo } from "@/tests/unit/analytics/_catalogo-facetas";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo47, DATOS_PERSONALES_GEO47 } from "./_fixtures/geo-47";
import { comoDueno } from "./_fixtures/pais-20";
import { revertidaLarga as revertidaLargaDe71 } from "./_fixtures/geo-71";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, urlDeBaseDeDatos, type TxDeTest } from "./_postgres-real";

// SLT-47 (T2.5; R29, R30; design §9) — `geo:explain-filtros`: la regla, que el «despues» congelado es el
// SQL que emite `lib/`, y la medicion sobre Postgres real con el fixture `geo-47`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const RAIZ = path.resolve(__dirname, "../../..");

function lado(medianaMs: number, seqScanSobreOrden = 0): LadoMedido {
  return { consultas: 1, corridasMs: [medianaMs], medianaMs, seqScanSobreOrden, paredMediaMs: medianaMs };
}

describe("SLT-47 R29 — la regla de regresion y el codigo de salida", () => {
  it("+19 % no es regresion; +21 % si; un Seq Scan sobre `orden` nuevo si; uno que ya estaba, no", () => {
    expect(hayRegresion({ antes: lado(100), despues: lado(119) })).toBe(false);
    expect(hayRegresion({ antes: lado(100), despues: lado(121) })).toBe(true);
    expect(hayRegresion({ antes: lado(100), despues: lado(100, 1) })).toBe(true);
    expect(hayRegresion({ antes: lado(100, 1), despues: lado(100, 1) })).toBe(false);
  });

  it("0 sin regresion, 1 con regresion, 2 si una lectura fallo", () => {
    const medida = (despues: number): ResultadoDeLectura => ({
      estado: "medida",
      medicion: { lectura: "listado-ordenes:canton", bloqueaPorPorcentaje: true, antes: lado(100), despues: lado(despues), completadas: 0 },
    });
    expect(codigoDeSalida([medida(110)])).toBe(0);
    expect(codigoDeSalida([medida(130)])).toBe(1);
    expect(codigoDeSalida([medida(110), { estado: "fallida", lectura: "pagina-satelite:canton", error: "Error" }])).toBe(2);
  });
});

describe("SLT-47 R29 — el «despues» congelado es el SQL que emite `lib/`", () => {
  it("la pagina satelite: mismo texto y mismos parametros que `findRecepcionSatelitePaginada`", async () => {
    const consultas: Prisma.Sql[] = [];
    const prisma = {
      $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
        consultas.push(sql);
        return [];
      }),
      ...delegadosDelCatalogo(),
    } as unknown as PrismaClient;
    await new OrdenRepository(prisma).findRecepcionSatelitePaginada(
      { zonaId: "z-1", estatusValues: [...ESTADOS_BODEGA_SATELITE], lugarIds: ["c1"] },
      { skip: 0, take: TAMANO_DE_PAGINA },
    );
    const congelada = paginaSateliteSql("z-1", condicionesDeLugar({ lugar: ["c1", "d1"] }), TAMANO_DE_PAGINA);
    const forma = (s: Prisma.Sql) => s.sql.replace(/\s+/g, " ").trim();
    expect(forma(consultas[0]!)).toBe(forma(congelada));
    expect(consultas[0]!.values).toEqual(congelada.values);
  });

  it("el listado: el `where` de geografia es el de `OrdenRepository.list`", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = { orden: { findMany, count: vi.fn(async () => 0) }, ...delegadosDelCatalogo() } as unknown as PrismaClient;
    await new OrdenRepository(prisma).list({ where: { lugarIds: ["c1"] }, sortBy: "created_at", sortDir: "desc", skip: 0, take: 50 });
    const where = (findMany.mock.calls[0] as unknown as [{ where: Prisma.OrdenWhereInput }])[0].where;
    expect(where).toEqual({ deletedAt: null, ...whereDeLugares({ lugar: ["c1", "d1"] }) });
  });
});

// ---------------------------------------------------------------------------------------------

const captura = crearCaptura("su-transaccion");
let base: PrismaClient;

function crearClienteConCaptura(): PrismaClient {
  const adapter = conConsultasEnSeriePorTransaccion(captura.envolver(new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 })));
  return new PrismaClient({ adapter, omit: PRISMA_OMIT }) as unknown as PrismaClient;
}

function revertidaLarga<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  return revertidaLargaDe71(base, fn, 180_000);
}

describeSiHayBase("SLT-47 R29, R30 — geo:explain-filtros (Postgres real)", () => {
  beforeAll(() => {
    base = crearClienteConCaptura();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R29: mide listado y pagina satelite con provincia, canton y distrito, 5 corridas por lado, sin escribir ni imprimir SQL", async () => {
    const r = await revertidaLarga(async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const empresa = e.cr.base.base;
      await comoDueno(tx);
      const ordenesAntes = await tx.orden.count();
      const cliente = clienteConSavepoint(tx);
      await comoApp(tx, empresa.empresaId);
      const objetivos = await elegirObjetivos(cliente, empresa.empresaId);
      const resultados = await medirLecturas({ cliente, captura }, objetivos);
      await comoDueno(tx);
      const ordenesDespues = await tx.orden.count();
      const nombres = (
        await tx.nodoGeografico.findMany({ where: { id: { in: Object.values(empresa.geo) } }, select: { nombre: true } })
      ).map((n) => n.nombre);
      return { objetivos, resultados, ordenesAntes, ordenesDespues, nombres };
    });

    expect(r.ordenesDespues).toBe(r.ordenesAntes);
    expect(Object.values(r.objetivos.lugares).every((id) => id !== null)).toBe(true);
    expect(r.objetivos.zonaId).not.toBeNull();
    expect(r.resultados.map((x) => (x.estado === "medida" ? x.medicion.lectura : x.lectura))).toEqual([
      "listado-ordenes:provincia",
      "pagina-satelite:provincia",
      "listado-ordenes:canton",
      "pagina-satelite:canton",
      "listado-ordenes:distrito",
      "pagina-satelite:distrito",
    ]);
    for (const x of r.resultados) {
      expect(x.estado, lineaDeResultado(x)).toBe("medida");
      if (x.estado !== "medida") continue;
      expect(x.medicion.antes.corridasMs).toHaveLength(CORRIDAS);
      expect(x.medicion.despues.corridasMs).toHaveLength(CORRIDAS);
      expect(x.medicion.antes.consultas).toBeGreaterThan(0);
      expect(x.medicion.despues.consultas).toBeGreaterThan(0);
    }
    const salida = [lineaDeObjetivos(r.objetivos), ...r.resultados.map(lineaDeResultado)].join("\n");
    for (const dato of DATOS_PERSONALES_GEO47) expect(salida).not.toContain(dato);
    for (const nombre of r.nombres) expect(salida).not.toContain(nombre);
    expect(salida).not.toMatch(/SELECT|FROM|WHERE|"public"|\$1|ANY\(/);
  }, 240_000);

  it("R30: con una DATABASE_URL que no es local, sale con 2 sin conectar y sin imprimir la URL", () => {
    const destino = new URL("postgresql://db.ejemplo.invalid:5432/produccion");
    destino.username = "usuario";
    destino.password = "secreto-slt47-explain";
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/geo-explain-filtros.ts"], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: destino.toString() },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.status).toBe(2);
    const salida = `${r.stdout}\n${r.stderr}`;
    expect(salida).toContain("ABORTA");
    expect(salida).not.toContain("secreto-slt47-explain");
    expect(salida).not.toContain("db.ejemplo.invalid");
  }, 90_000);
});
