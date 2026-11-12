import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import {
  codigoDeSalida,
  compararEmpresaFiltros,
  hayDiferencias,
  leerArgumentos,
  lineasDeInforme,
  MUESTRA_POR_DEFECTO,
  soloDifierenEnIncoherentes,
  type InformeDeFiltros,
} from "@/scripts/geo-equivalencia-filtros";
import { crearClienteDeSoloLectura } from "@/scripts/geo-equivalencia-dinero";
import { LUGAR_INEXISTENTE, lugarDeFacetas } from "@/scripts/geo-equivalencia/filtros-de-hoy";
import { crearCatalogo, type NodoDelCatalogo } from "@/lib/services/geografia-dominio";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo47, DATOS_PERSONALES_GEO47, type EmpresaGeo47 } from "./_fixtures/geo-47";
import { sembrarOrdenIncoherente } from "./_fixtures/geo-65";
import { comoDueno, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, urlDeBaseDeDatos, type TxDeTest } from "./_postgres-real";

// SLT-47 (T2.5; R28, R30; design §7) — `geo:equivalencia-filtros` sobre Postgres real, en el fixture
// `geo-47` con una orden de cadena incoherente en CR (P1).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RAIZ = path.resolve(__dirname, "../../..");

let base: PrismaClient;

async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo47, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.base.empresaId);
  try {
    return await fn();
  } finally {
    await comoDueno(tx);
  }
}

describe("SLT-47 R28 — traduccion de las facetas de hoy y reglas del informe (sin base)", () => {
  const n = (id: string, padreId: string | null, profundidad: number): NodoDelCatalogo => ({
    id,
    padreId,
    profundidad,
    tipoId: `t${profundidad}`,
    nombre: id,
    nombreNormalizado: id,
    codigoOficial: null,
    activo: true,
  });
  const cat = crearCatalogo("XA", [], [n("P1", null, 1), n("P2", null, 1), n("C1", "P1", 2), n("C2", "P2", 2), n("D1", "C1", 3)]);

  it("un nivel: los ids validos de esa profundidad; la combinacion coherente, el nivel hondo", () => {
    expect(lugarDeFacetas(cat, {})).toBeUndefined();
    expect(lugarDeFacetas(cat, { canton_id: ["C2", "C1"] })).toEqual(["C1", "C2"]);
    expect(lugarDeFacetas(cat, { provincia_id: ["P1"], canton_id: ["C1"] })).toEqual(["C1"]);
    expect(lugarDeFacetas(cat, { provincia_id: ["P1"], distrito_id: ["D1"] })).toEqual(["D1"]);
  });

  it("un id de otro nivel, inexistente o incoherente con el de arriba es cero (`LUGAR_INEXISTENTE`)", () => {
    expect(lugarDeFacetas(cat, { distrito_id: ["C1"] })).toEqual([LUGAR_INEXISTENTE]);
    expect(lugarDeFacetas(cat, { canton_id: ["nope"] })).toEqual([LUGAR_INEXISTENTE]);
    expect(lugarDeFacetas(cat, { provincia_id: ["P2"], canton_id: ["C1"] })).toEqual([LUGAR_INEXISTENTE]);
  });

  it("solo se disculpa una diferencia hecha de ordenes incoherentes", () => {
    const inc = new Set(["x"]);
    expect(soloDifierenEnIncoherentes(new Set(["a", "x"]), new Set(["a"]), inc)).toBe(true);
    expect(soloDifierenEnIncoherentes(new Set(["a", "b"]), new Set(["a"]), inc)).toBe(false);
  });

  it("argumentos y codigo de salida", () => {
    expect(leerArgumentos([])).toEqual({ muestra: MUESTRA_POR_DEFECTO, empresa: null });
    expect(leerArgumentos(["--muestra", "3", "--empresa", "e1"])).toEqual({ muestra: 3, empresa: "e1" });
    expect(leerArgumentos(["--otra"])).toBeNull();
    const limpio = { ordenes: { comparados: 1, distintos: 0 }, satelite: { comparados: 0, distintos: 0 }, analitica: { comparados: 1, distintos: 0 } };
    const sucio = { ...limpio, satelite: { comparados: 1, distintos: 1 } };
    expect(codigoDeSalida([limpio as InformeDeFiltros], 0)).toBe(0);
    expect(codigoDeSalida([sucio as InformeDeFiltros], 0)).toBe(1);
    expect(codigoDeSalida([limpio as InformeDeFiltros], 1)).toBe(2);
  });
});

describeSiHayBase("SLT-47 R28, R30 — geo:equivalencia-filtros sobre el fixture", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R28: todo coincide en CR y en XA; la orden incoherente sale aparte, con su id, y la salida es 0", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const incoherenteId = await sembrarOrdenIncoherente(tx, e.cr.base.base);
      await comoDueno(tx);
      const antes = await tx.orden.count();
      const informes: InformeDeFiltros[] = [];
      for (const emp of [e.cr, e.xa]) {
        informes.push(
          await comoLaEmpresa(tx, emp, () =>
            compararEmpresaFiltros(clienteConSavepoint(tx), emp.base.base.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
          ),
        );
      }
      const despues = await tx.orden.count();
      const nombres = (
        await tx.nodoGeografico.findMany({
          where: { id: { in: [...Object.values(e.cr.base.base.geo), e.cr.homonimos.provinciaCentralId, e.cr.homonimos.sanRafael1Id] } },
          select: { nombre: true },
        })
      ).map((x) => x.nombre);
      return { informes, incoherenteId, antes, despues, nombres };
    });
    const [cr, xa] = r.informes;
    for (const i of r.informes) {
      const texto = lineasDeInforme(i).join("\n");
      expect(i.diferencias, texto).toEqual([]);
      expect(hayDiferencias(i)).toBe(false);
      // Antivacio: provincias, cantones, distritos, la combinacion y el inexistente.
      expect(i.filtros).toBeGreaterThanOrEqual(2 + 4 + 6 + 2);
      expect(i.ordenes.comparados).toBe(i.filtros);
      expect(i.analitica.comparados).toBe(i.filtros);
      // Una comparacion por zona no central y filtro (norte y sur, mas las que traiga el pais de prueba).
      expect(i.satelite.comparados % i.filtros).toBe(0);
      expect(i.satelite.comparados).toBeGreaterThanOrEqual(2 * i.filtros);
    }
    expect(cr.cadenaIncoherente).toEqual([r.incoherenteId]);
    expect(xa.cadenaIncoherente).toEqual([]);
    expect(cr.soloIncoherentes).toBeGreaterThan(0);
    expect(lineasDeInforme(cr).join("\n")).toContain(r.incoherenteId);
    expect(codigoDeSalida([cr, xa], 0)).toBe(0);
    // R30: no escribe y no imprime datos personales, nombres de lugar ni SQL.
    expect(r.despues).toBe(r.antes);
    const salida = r.informes.flatMap(lineasDeInforme).join("\n");
    for (const dato of DATOS_PERSONALES_GEO47) expect(salida).not.toContain(dato);
    expect(r.nombres.length).toBeGreaterThan(5);
    for (const nombre of r.nombres) expect(salida).not.toContain(nombre);
    expect(salida).not.toMatch(/SELECT|FROM|WHERE|"public"|\$1|ANY\(/);
  }, 300_000);

  it("R30: con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
    const cliente = crearClienteDeSoloLectura(urlDeBaseDeDatos());
    try {
      const error = await comoPlataforma("SLT-47", "test de la barrera de solo lectura", () =>
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

  it("R30: con una DATABASE_URL que no es local, sale con 2 sin conectar y sin imprimir la URL", () => {
    const destino = new URL("postgresql://db.ejemplo.invalid:5432/produccion");
    destino.username = "usuario";
    destino.password = "secreto-slt47";
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/geo-equivalencia-filtros.ts"], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: destino.toString() },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.status).toBe(2);
    const salida = `${r.stdout}\n${r.stderr}`;
    expect(salida).toContain("ABORTA");
    expect(salida).not.toContain("secreto-slt47");
    expect(salida).not.toContain("db.ejemplo.invalid");
  }, 90_000);
});
