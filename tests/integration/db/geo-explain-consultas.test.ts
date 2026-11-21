import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import {
  crearCaptura,
  esDeContexto,
  esDeControl,
  leerPlan,
  type ConsultaCapturada,
} from "@/scripts/geo-equivalencia/captura-consultas";
import {
  CORRIDAS,
  codigoDeSalida,
  consultasQueCompletanAntes,
  crearClienteDeMedicion,
  elegirObjetivos,
  esBaseLocal,
  hayRegresion,
  leerArgumentos,
  lineaDeResultado,
  lineasDeObjetivos,
  mediana,
  medirConteoEnPlataforma,
  medirLecturasDeEmpresa,
  type LadoMedido,
  type MedicionDeLectura,
  type NombreDeLectura,
  type ResultadoDeLectura,
} from "@/scripts/geo-explain-consultas";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo65, DATOS_PERSONALES_GEO65 } from "./_fixtures/geo-65";
import { comoDueno, sqlstateDe } from "./_fixtures/pais-20";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SLT-65 (T6.1, T6.3; R24, R25; design §10, §14) — EL SCRIPT DE RENDIMIENTO, `geo:explain-consultas`.
//
// La regla (`hayRegresion`, la mediana, el codigo de salida) se prueba sin base. La captura y la
// medicion, contra Postgres real con el escenario de `geo-65.ts`: el cliente del test captura en el
// adaptador como el del script, pero repite cada `EXPLAIN` en SU transaccion (`su-transaccion`),
// porque el fixture solo existe dentro de la transaccion revertida del test. La barrera de solo
// lectura del cliente del script se prueba aparte, con su propio cliente (R24).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const LECTURAS: NombreDeLectura[] = [
  "listado-ordenes",
  "listado-api",
  "cierre-descriptivos",
  "reconciliacion",
  "conteo-sin-entregar",
];

// ---------------------------------------------------------------------------------------------
// R25 — la regla, sin base
// ---------------------------------------------------------------------------------------------

function lado(medianaMs: number, seqScanSobreOrden = 0): LadoMedido {
  return { consultas: 1, corridasMs: [medianaMs], medianaMs, seqScanSobreOrden, paredMediaMs: 0 };
}

function medicion(antes: LadoMedido, despues: LadoMedido, bloqueaPorPorcentaje = true): MedicionDeLectura {
  return { lectura: "listado-ordenes", bloqueaPorPorcentaje, antes, despues, completadas: 0 };
}

describe("SLT-65 R25 — la regla de regresion de geo:explain-consultas", () => {
  it("+19 % no es regresion; +21 % si", () => {
    expect(hayRegresion(medicion(lado(100), lado(119)))).toBe(false);
    expect(hayRegresion(medicion(lado(100), lado(121)))).toBe(true);
    // Justo 20 % no es «mas de 20 %».
    expect(hayRegresion(medicion(lado(100), lado(120)))).toBe(false);
  });

  it("un Seq Scan sobre `orden` solo en despues es regresion; en los dos lados, no", () => {
    expect(hayRegresion(medicion(lado(100, 0), lado(100, 1)))).toBe(true);
    expect(hayRegresion(medicion(lado(100, 1), lado(100, 1)))).toBe(false);
    expect(hayRegresion(medicion(lado(100, 2), lado(100, 1)))).toBe(false);
    expect(hayRegresion(medicion(lado(100, 1), lado(100, 0)))).toBe(false);
  });

  it("el 20 % solo bloquea en las lecturas calientes; el Seq Scan nuevo, en todas", () => {
    expect(hayRegresion(medicion(lado(100), lado(500), false))).toBe(false);
    expect(hayRegresion(medicion(lado(100, 0), lado(100, 1), false))).toBe(true);
  });

  it("la mediana de 5 corridas, y el codigo de salida: 0 sin regresion, 1 con regresion, 2 si una lectura fallo", () => {
    expect(mediana([5, 1, 4, 2, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    const sin: ResultadoDeLectura = { estado: "medida", medicion: medicion(lado(100), lado(110)) };
    const con: ResultadoDeLectura = { estado: "medida", medicion: medicion(lado(100), lado(130)) };
    const fallida: ResultadoDeLectura = { estado: "fallida", lectura: "listado-api", error: "Error" };
    const vacia: ResultadoDeLectura = { estado: "sin-muestra", lectura: "cierre-descriptivos", motivo: "sin cierres" };
    expect(codigoDeSalida([sin, vacia])).toBe(0);
    expect(codigoDeSalida([sin, con])).toBe(1);
    expect(codigoDeSalida([sin, con, fallida])).toBe(2);
  });

  it("el plan: suma el Execution Time y cuenta los Seq Scan sobre `orden` a cualquier profundidad", () => {
    const plan = [
      {
        "Execution Time": 1.5,
        Plan: {
          "Node Type": "Hash Join",
          Plans: [
            { "Node Type": "Seq Scan", "Relation Name": "orden" },
            { "Node Type": "Hash", Plans: [{ "Node Type": "Seq Scan", "Relation Name": "zona" }] },
            { "Node Type": "Index Scan", "Relation Name": "orden" },
          ],
        },
      },
    ];
    expect(leerPlan(plan)).toEqual({ tiempoMs: 1.5, seqScanSobreOrden: 1 });
    expect(() => leerPlan([{ Plan: {} }])).toThrow();
  });

  it("antes se completa con las consultas de despues que no leen geografia y que antes no tiene", () => {
    const c = (sql: string): ConsultaCapturada => ({
      consulta: { sql, args: [], argTypes: [] },
      contexto: [],
      origen: { queryRaw: () => Promise.reject(new Error("no")), executeRaw: () => Promise.reject(new Error("no")) },
    });
    const pagina = 'SELECT 1 FROM "public"."orden" LIMIT $1';
    const antes = [c(pagina), c('SELECT 1 FROM "public"."distrito" LEFT JOIN "public"."distrito_zona_especial"')];
    const despues = [
      c(pagina),
      c('SELECT COUNT(*) FROM "public"."orden"'),
      c('SELECT 1 FROM "public"."tarifas"'),
      c('SELECT 1 FROM "public"."distrito"'),
      c('SELECT 1 FROM "public"."nodo_geografico"'),
      c('SELECT 1 FROM "public"."zona" WHERE "id" IN ($1)'),
      c('SELECT 1 FROM "public"."organizacion"'),
    ];
    expect(consultasQueCompletanAntes(antes, despues).map((x) => x.consulta.sql)).toEqual([
      'SELECT COUNT(*) FROM "public"."orden"',
      'SELECT 1 FROM "public"."tarifas"',
    ]);
  });

  it("solo localhost, y solo `--empresa <id>` como argumento", () => {
    expect(esBaseLocal("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(esBaseLocal("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(esBaseLocal("postgresql://u:p@[::1]:5432/db")).toBe(true);
    expect(esBaseLocal("postgresql://u:p@db.ejemplo.supabase.co:5432/postgres")).toBe(false);
    expect(esBaseLocal("postgresql://u:p@localhost.ejemplo.com:5432/db")).toBe(false);
    expect(esBaseLocal(undefined)).toBe(false);
    expect(esBaseLocal("no es una url")).toBe(false);
    expect(leerArgumentos([])).toEqual({ empresa: null });
    expect(leerArgumentos(["--empresa", "abc"])).toEqual({ empresa: "abc" });
    expect(leerArgumentos(["--empresa"])).toBeNull();
    expect(leerArgumentos(["--destino", "prod"])).toBeNull();
  });

  it("R24: la captura solo explica lecturas; una escritura no llega a la base", async () => {
    let llamadas = 0;
    const origen = {
      queryRaw: () => {
        llamadas++;
        return Promise.reject(new Error("no debia llamarse"));
      },
      executeRaw: () => {
        llamadas++;
        return Promise.reject(new Error("no debia llamarse"));
      },
    };
    const captura = crearCaptura("su-transaccion");
    await expect(
      captura.explicar({ consulta: { sql: 'INSERT INTO "public"."orden" (id) VALUES ($1)', args: ["x"], argTypes: [] }, contexto: [], origen }),
    ).rejects.toThrow(/solo se explican lecturas/);
    expect(llamadas).toBe(0);
    expect(esDeControl("COMMIT")).toBe(true);
    expect(esDeControl('-- Implicit "COMMIT" query via underlying driver')).toBe(true);
    expect(esDeContexto("SELECT set_config('app.organizacion_id', $1, true), set_config('role', 'servi_app', true)")).toBe(true);
    expect(esDeContexto("SET LOCAL ROLE NONE")).toBe(true);
    expect(esDeContexto('SELECT 1 FROM "public"."orden"')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Contra Postgres real
// ---------------------------------------------------------------------------------------------

const captura = crearCaptura("su-transaccion");
let base: PrismaClient;

/** El cliente del test: el de `crearPrismaDeTest`, con la captura y la serializacion del script. */
function crearClienteConCaptura(): PrismaClient {
  const adapter = conConsultasEnSeriePorTransaccion(
    captura.envolver(new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 })),
  );
  return new PrismaClient({ adapter, omit: PRISMA_OMIT }) as unknown as PrismaClient;
}

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** `revertida` de `pais-20.ts` con mas tiempo: cinco lecturas, cinco corridas por lado. */
async function revertidaLarga<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

async function contarFilas(tx: TxDeTest) {
  await comoDueno(tx);
  return {
    orden: await tx.orden.count(),
    zonaDistrito: await tx.zonaDistrito.count(),
    marcas: await tx.distritoZonaEspecial.count(),
    cierreDetail: await tx.cierreDetail.count(),
  };
}

describeSiHayBase("SLT-65 T6 — geo:explain-consultas (Postgres real)", () => {
  beforeAll(() => {
    base = crearClienteConCaptura();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("T6.1: el adaptador expone el SQL y los parametros tipados de `listByOwner`, y la consulta se puede explicar", async () => {
    const r = await revertidaLarga(async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const empresa = e.cr.base;
      await comoApp(tx, empresa.empresaId);
      const { valor, consultas } = await captura.grabar(() =>
        conEmpresa(empresa.empresaId, () =>
          new OrdenRepository(clienteConSavepoint(tx)).listByOwner({ ownerId: empresa.tiendaId, skip: 0, take: 50 }),
        ),
      );
      const pagina = consultas.find((c) => c.consulta.sql.includes('FROM "public"."orden"') && c.consulta.sql.includes("LIMIT"));
      const plan = pagina === undefined ? null : await captura.explicar(pagina);
      await comoDueno(tx);
      return { tiendaId: empresa.tiendaId, empresaId: empresa.empresaId, total: valor.total, consultas, plan };
    });

    expect(r.total).toBeGreaterThan(0);
    // La pagina, el `count` y la carga del catalogo: varias consultas, ninguna de control.
    expect(r.consultas.length).toBeGreaterThanOrEqual(3);
    for (const c of r.consultas) {
      expect(esDeControl(c.consulta.sql)).toBe(false);
      expect(esDeContexto(c.consulta.sql)).toBe(false);
      expect(c.consulta.argTypes).toHaveLength(c.consulta.args.length);
      // El contexto de la RLS que fijo `comoApp` viaja con cada consulta.
      expect(c.contexto.some((x) => x.args.includes(r.empresaId))).toBe(true);
    }
    expect(r.consultas.some((c) => c.consulta.sql.includes('"public"."orden"') && c.consulta.args.includes(r.tiendaId))).toBe(true);
    expect(r.consultas.some((c) => c.consulta.sql.includes('"public"."nodo_geografico"'))).toBe(true);
    expect(r.plan).not.toBeNull();
    expect(r.plan?.tiempoMs).toBeGreaterThanOrEqual(0);
  });

  it("R25, R24: mide las cinco lecturas con 5 corridas por lado, no escribe y no imprime SQL ni datos personales", async () => {
    const r = await revertidaLarga(async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const empresa = e.cr.base;
      const cliente = clienteConSavepoint(tx);
      const entorno = { cliente, captura };
      const filasAntes = await contarFilas(tx);
      await comoApp(tx, empresa.empresaId);
      const objetivos = await elegirObjetivos(cliente, empresa.empresaId);
      const deEmpresa = await medirLecturasDeEmpresa(entorno, objetivos);
      // El conteo corre en plataforma: como dueño, sin RLS de empresa (como `geo-consultas-conteo`).
      await comoDueno(tx);
      const conteo = await medirConteoEnPlataforma(entorno, objetivos.provinciaId);
      const filasDespues = await contarFilas(tx);
      return { e, objetivos, resultados: [...deEmpresa, conteo], filasAntes, filasDespues };
    });

    const { e, objetivos, resultados } = r;
    expect(objetivos.tiendaId).toBe(e.cr.base.tiendaId);
    expect(objetivos.provinciaId).toBe(e.cr.base.geo.provinciaId);
    expect(objetivos.zona?.distritoIds.length).toBeGreaterThan(0);
    expect(objetivos.filasDelCierre?.length).toBe(1);

    expect(resultados.map((x) => (x.estado === "medida" ? x.medicion.lectura : x.lectura)).sort()).toEqual([...LECTURAS].sort());
    for (const x of resultados) {
      expect(x.estado, lineaDeResultado(x)).toBe("medida");
      if (x.estado !== "medida") continue;
      const m = x.medicion;
      expect(m.antes.corridasMs).toHaveLength(CORRIDAS);
      expect(m.despues.corridasMs).toHaveLength(CORRIDAS);
      expect(m.antes.consultas).toBeGreaterThan(0);
      expect(m.despues.consultas).toBeGreaterThan(0);
      expect(Number.isFinite(m.antes.medianaMs) && Number.isFinite(m.despues.medianaMs)).toBe(true);
      expect(m.bloqueaPorPorcentaje).toBe(["listado-ordenes", "listado-api", "cierre-descriptivos"].includes(m.lectura));
      // Los listados se completan al menos con su `count`, que la copia no trae.
      if (m.lectura === "listado-ordenes" || m.lectura === "listado-api") expect(m.completadas).toBeGreaterThan(0);
      else expect(m.completadas).toBe(0);
    }

    // R24: ninguna escritura.
    expect(r.filasDespues).toEqual(r.filasAntes);

    // R24: la salida son etiquetas y numeros.
    const salida = [...lineasDeObjetivos(objetivos), ...resultados.map(lineaDeResultado)].join("\n");
    for (const dato of DATOS_PERSONALES_GEO65) expect(salida).not.toContain(dato);
    expect(salida).not.toContain(e.cr.base.tiendaId);
    expect(salida).not.toMatch(/SELECT|FROM|INSERT|"public"|\$1/);
    for (const nombre of LECTURAS) expect(salida).toContain(`lectura ${nombre}:`);
  });

  it("R24: con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
    const cliente = crearClienteDeMedicion(urlDeBaseDeDatos(), crearCaptura("transaccion-nueva"));
    try {
      // En plataforma la extension deja pasar el SQL a mano tal cual: el que lo para es Postgres.
      const error = await comoPlataforma("SLT-65", "test de la barrera de solo lectura", () =>
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
});
