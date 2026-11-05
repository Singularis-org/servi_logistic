import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { crearCaptura } from "@/scripts/geo-equivalencia/captura-consultas";
import { CORRIDAS, leeElCatalogo, type LadoMedido } from "@/scripts/geo-equivalencia/medicion";
import {
  BLOQUEAN_POR_PORCENTAJE,
  codigoDeSalida,
  LECTURAS,
  lineaDeObjetivos,
  lineaDeResultado,
  medirLecturas,
  provinciaConMasOrdenes,
  veredicto,
  type MedicionDeLectura,
  type NombreDeLectura,
  type ResultadoDeLectura,
} from "@/scripts/geo-explain-analitica";
import { crearClienteDeMedicion } from "@/scripts/geo-explain-consultas";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { DATOS_PERSONALES_GEO65 } from "./_fixtures/geo-65";
import { crearEscenarioGeo71 } from "./_fixtures/geo-71";
import { comoDueno, sqlstateDe } from "./_fixtures/pais-20";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SLT-71 (T6.2; R18–R22; design §9, §11) — EL SCRIPT DE RENDIMIENTO, `geo:explain-analitica`.
//
// La regla (`veredicto`, R20 y R21) y el codigo de salida (R22) se prueban sin base. La medicion de
// las seis lecturas, contra Postgres real con el escenario de `geo-71.ts`: el cliente del test captura
// en el adaptador como el del script, pero repite cada `EXPLAIN` en SU transaccion (`su-transaccion`),
// porque el fixture solo existe dentro de la transaccion revertida del test (como el test de SLT-65).
// Las barreras de solo lectura y de localhost se prueban con el cliente y el proceso del script (R18).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");

// ---------------------------------------------------------------------------------------------
// R20, R21, R22 — la regla, sin base
// ---------------------------------------------------------------------------------------------

function lado(medianaMs: number, sinCatalogoMs = medianaMs, seqScanSobreOrden = 0): LadoMedido {
  return {
    consultas: 1,
    corridasMs: [medianaMs],
    medianaMs,
    seqScanSobreOrden,
    paredMediaMs: 0,
    sinCatalogo: { corridasMs: [sinCatalogoMs], medianaMs: sinCatalogoMs, consultas: 1 },
  };
}

function medicion(lectura: NombreDeLectura, antes: LadoMedido, despues: LadoMedido): MedicionDeLectura {
  return { lectura, bloqueaPorPorcentaje: BLOQUEAN_POR_PORCENTAJE.has(lectura), antes, despues, completadas: 0 };
}

describe("SLT-71 R20, R21, R22 — la regla de geo:explain-analitica", () => {
  it("bloquean por 20 % transito y los cuatro conteos; ciclo de vida no", () => {
    expect([...LECTURAS].sort()).toEqual(
      ["ciclo-vida", "conteo-cargadas-por-dia", "conteo-devoluciones", "conteo-entregas", "conteo-por-status", "transito-filas"].sort(),
    );
    expect([...BLOQUEAN_POR_PORCENTAJE].sort()).toEqual(LECTURAS.filter((l) => l !== "ciclo-vida").sort());
  });

  it("+21 % total y +21 % sin catalogo → regresion; +21 % total y +5 % sin catalogo → costo fijo del catalogo; +19 % → ok", () => {
    for (const l of BLOQUEAN_POR_PORCENTAJE) {
      expect(veredicto(medicion(l, lado(100, 80), lado(121, 96.8))), l).toBe("regresion");
      expect(veredicto(medicion(l, lado(100, 100), lado(121, 105))), l).toBe("costo-fijo-del-catalogo");
      expect(veredicto(medicion(l, lado(100), lado(119))), l).toBe("ok");
      // Justo 20 % no es «mas de 20 %».
      expect(veredicto(medicion(l, lado(100), lado(120))), l).toBe("ok");
    }
  });

  it("ciclo de vida con +50 % (total y sin catalogo) es ok: se imprime y no bloquea", () => {
    const m = medicion("ciclo-vida", lado(100), lado(150));
    expect(veredicto(m)).toBe("ok");
    const linea = lineaDeResultado({ estado: "medida", medicion: m });
    expect(linea).toContain("(+50.0 %)");
    expect(linea).toContain("bloquea-20%=no veredicto=ok");
  });

  it("un Seq Scan sobre `orden` que antes no estaba es regresion en las seis; uno que ya estaba, no", () => {
    for (const l of LECTURAS) {
      expect(veredicto(medicion(l, lado(100, 100, 0), lado(100, 100, 1))), l).toBe("regresion");
      expect(veredicto(medicion(l, lado(100, 100, 1), lado(100, 100, 1))), l).toBe("ok");
      // Ni siquiera el costo fijo del catalogo disculpa un Seq Scan nuevo.
      expect(veredicto(medicion(l, lado(100, 100, 0), lado(130, 100, 1))), l).toBe("regresion");
    }
  });

  it("el costo fijo del catalogo se imprime con las dos medianas sin catalogo, sin SQL", () => {
    const linea = lineaDeResultado({ estado: "medida", medicion: medicion("conteo-por-status", lado(10, 10), lado(15, 10.5)) });
    expect(linea).toContain("veredicto=costo-fijo-del-catalogo");
    expect(linea).toContain("sin catalogo antes=10.000 ms despues=10.500 ms (+5.0 %)");
    expect(linea).toContain("antes=10.000 ms despues=15.000 ms (+50.0 %)");
  });

  it("R22: 0 sin regresion (el costo fijo no cuenta), 1 con regresion, 2 si una lectura fallo", () => {
    const ok: ResultadoDeLectura = { estado: "medida", medicion: medicion("conteo-entregas", lado(100), lado(110)) };
    const costo: ResultadoDeLectura = { estado: "medida", medicion: medicion("transito-filas", lado(100, 100), lado(150, 100)) };
    const con: ResultadoDeLectura = { estado: "medida", medicion: medicion("conteo-devoluciones", lado(100), lado(130)) };
    const fallida: ResultadoDeLectura = { estado: "fallida", lectura: "ciclo-vida", error: "Error" };
    const vacia: ResultadoDeLectura = { estado: "sin-muestra", lectura: "conteo-por-status", motivo: "sin ordenes vivas" };
    expect(codigoDeSalida([ok, costo, vacia])).toBe(0);
    expect(codigoDeSalida([ok, con])).toBe(1);
    expect(codigoDeSalida([ok, con, fallida])).toBe(2);
  });

  it("las tablas del catalogo se reconocen; las de la lectura de hoy (`canton`, `distrito`, `orden`) no", () => {
    expect(leeElCatalogo('SELECT 1 FROM "public"."nodo_geografico"')).toBe(true);
    expect(leeElCatalogo('SELECT 1 FROM "public"."organizacion"')).toBe(true);
    expect(leeElCatalogo('SELECT 1 FROM "public"."zona_distrito"')).toBe(true);
    expect(leeElCatalogo('SELECT 1 FROM "orden" o JOIN "canton" k ON k."id" = o."canton_id" LEFT JOIN "distrito" d')).toBe(false);
    expect(leeElCatalogo('SELECT 1 FROM "orden" o WHERE o."zona_id" = $1')).toBe(false);
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

/** `revertida` de `pais-20.ts` con mas tiempo: seis lecturas, cinco corridas por lado. */
async function revertidaLarga<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 180_000, maxWait: 15_000 },
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
    gestionOrden: await tx.gestionOrden.count(),
    historial: await tx.ordenHistorialEstado.count(),
    nodos: await tx.nodoGeografico.count(),
  };
}

/** El cliente con la carga de nodos rota: la lectura nueva de analitica y de transito falla. */
function conCatalogoRoto(cliente: PrismaClient): PrismaClient {
  const envolver = (objetivo: object): PrismaClient =>
    new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "nodoGeografico") return { findMany: () => Promise.reject(new Error("catalogo roto del test")) };
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

describeSiHayBase("SLT-71 T6.2 — geo:explain-analitica (Postgres real)", () => {
  beforeAll(() => {
    base = crearClienteConCaptura();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R19, R18: mide las seis lecturas con 5 corridas por lado, no escribe y no imprime SQL, nombres ni datos personales", async () => {
    const r = await revertidaLarga(async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const empresa = e.cr.base.base;
      const cliente = clienteConSavepoint(tx);
      const filasAntes = await contarFilas(tx);
      await comoApp(tx, empresa.empresaId);
      const provinciaId = await provinciaConMasOrdenes(cliente, empresa.empresaId);
      const resultados = await medirLecturas({ cliente, captura }, empresa.empresaId, provinciaId);
      const filasDespues = await contarFilas(tx);
      const ids = [...Object.values(empresa.geo), ...Object.values(e.cr.segunda)];
      const nombres = (await tx.nodoGeografico.findMany({ where: { id: { in: ids } }, select: { nombre: true } })).map((n) => n.nombre);
      return { e, provinciaId, resultados, filasAntes, filasDespues, nombres };
    });

    // La provincia con mas ordenes vivas de CR es la de `geo-65`.
    expect(r.provinciaId).toBe(r.e.cr.base.base.geo.provinciaId);
    expect(r.resultados.map((x) => (x.estado === "medida" ? x.medicion.lectura : x.lectura))).toEqual([...LECTURAS]);
    for (const x of r.resultados) {
      expect(x.estado, lineaDeResultado(x)).toBe("medida");
      if (x.estado !== "medida") continue;
      const m = x.medicion;
      expect(m.antes.corridasMs).toHaveLength(CORRIDAS);
      expect(m.despues.corridasMs).toHaveLength(CORRIDAS);
      expect(m.antes.sinCatalogo?.corridasMs).toHaveLength(CORRIDAS);
      expect(m.despues.sinCatalogo?.corridasMs).toHaveLength(CORRIDAS);
      expect(m.antes.consultas).toBeGreaterThan(0);
      // Despues carga el catalogo (faceta de provincia; en transito, hay filas en alerta).
      expect(m.despues.consultas).toBeGreaterThan(m.antes.consultas);
      // En antes, total y sin catalogo son lo mismo: la union con `canton` va dentro de la consulta.
      expect(m.antes.sinCatalogo?.medianaMs).toBe(m.antes.medianaMs);
      // Review v1 (m2): lo que «sin catalogo» descuenta es solo la carga del catalogo. Ninguna
      // consulta de antes casa con `leeElCatalogo` (si una consulta medida de la lectura nombrara
      // `"zona"`, una regresion se veria como costo fijo); y despues, sin el catalogo, quedan tantas
      // consultas como antes: las de la lectura.
      expect(m.antes.sinCatalogo?.consultas, m.lectura).toBe(m.antes.consultas);
      expect(m.despues.sinCatalogo?.consultas, m.lectura).toBe(m.antes.consultas);
      expect(m.despues.sinCatalogo?.medianaMs ?? Infinity).toBeLessThanOrEqual(m.despues.medianaMs);
      expect(Number.isFinite(m.antes.medianaMs) && Number.isFinite(m.despues.medianaMs)).toBe(true);
      expect(m.bloqueaPorPorcentaje).toBe(m.lectura !== "ciclo-vida");
      expect(m.completadas).toBe(0);
    }

    // R18: ninguna escritura.
    expect(r.filasDespues).toEqual(r.filasAntes);

    // R18: la salida son etiquetas, ids y numeros.
    const salida = [lineaDeObjetivos(r.e.cr.base.base.empresaId, r.provinciaId), ...r.resultados.map(lineaDeResultado)].join("\n");
    for (const dato of DATOS_PERSONALES_GEO65) expect(salida).not.toContain(dato);
    expect(r.nombres.length).toBeGreaterThan(5);
    for (const nombre of r.nombres) expect(salida).not.toContain(nombre);
    expect(salida).not.toContain(r.e.cr.base.base.tiendaId);
    expect(salida).not.toMatch(/SELECT|FROM|INSERT|"public"|\$1|ANY\(/);
    for (const nombre of LECTURAS) expect(salida).toContain(`lectura ${nombre}:`);
  }, 240_000);

  it("R22: si la lectura nueva falla al leer, la lectura sale como fallida y el codigo es 2", async () => {
    const r = await revertidaLarga(async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const empresa = e.xa.base.base;
      await comoApp(tx, empresa.empresaId);
      const cliente = conCatalogoRoto(clienteConSavepoint(tx));
      return medirLecturas({ cliente, captura, corridas: 1 }, empresa.empresaId, empresa.geo.provinciaId);
    });
    const fallidas = r.filter((x) => x.estado === "fallida").map((x) => (x.estado === "fallida" ? x.lectura : ""));
    // Las seis cargan el catalogo despues: las seis fallan, y solo dicen el nombre del error.
    expect(fallidas).toEqual([...LECTURAS]);
    for (const x of r) expect(lineaDeResultado(x)).toMatch(/^lectura [a-z-]+: fallo al leer \(Error\)$/);
    expect(codigoDeSalida(r)).toBe(2);
  }, 240_000);

  it("R18: con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
    const cliente = crearClienteDeMedicion(urlDeBaseDeDatos(), crearCaptura("transaccion-nueva"));
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

  it("R18: con una DATABASE_URL que no es local, el script sale con 2 sin conectar y sin imprimir la URL", () => {
    // La URL se arma por partes: una URL con credenciales escrita entera es forma de secreto (SL-34).
    const destino = new URL("postgresql://db.ejemplo.invalid:5432/produccion");
    destino.username = "usuario";
    destino.password = "secreto-slt71";
    const url = destino.toString();
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/geo-explain-analitica.ts"], {
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
