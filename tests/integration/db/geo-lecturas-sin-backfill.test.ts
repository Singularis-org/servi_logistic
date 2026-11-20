import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearBasePropia43, type BasePropia43 } from "./_fixtures/base-propia-43";
import { TRIGGERS_DE_COLUMNAS_NUEVAS, vaciarColumnasNuevas } from "./_fixtures/geo-43";
import { crearEscenarioGeo44, type EmpresaGeo44 } from "./_fixtures/geo-44";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, type TxDeTest } from "./_postgres-real";

// SLT-44 (T4.6; R12; design §10) — LAS LECTURAS DE R18 Y R20 NO DEPENDEN DEL BACKFILL DE SLT-43.
//
// Se leen dos veces sobre el mismo escenario: con `nodo_geografico_id` lleno (lo llenan los triggers
// de SLT-43 al sembrar) y despues con la columna en NULL en `zona_distrito` y
// `distrito_zona_especial`, como estaria una base en la que el script de datos no corrio. El
// resultado tiene que ser el mismo: el nodo de cada asignacion y de cada marca sale de su
// `distrito_id`. Un tercer paso desvia la columna de `zona_distrito` a otro distrito: si alguna
// lectura la usara, la zona saltaria de distrito.
//
// BASE PROPIA (`slt43_nb_…`, `_fixtures/base-propia-43.ts`): vaciar la columna exige apagar los
// triggers que la llenan, y `ALTER TABLE … DISABLE TRIGGER` toma AccessExclusiveLock hasta el final
// de la transaccion; en la base compartida bloquearia a los archivos que corren a la vez.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let propia: BasePropia43 | undefined;

/** R18 (las tres lecturas de la resolucion por nombres) y R20 (el Excel), como la app. */
async function leerComoLaApp(tx: TxDeTest, empresa: EmpresaGeo44) {
  await comoApp(tx, empresa.empresaId);
  try {
    return await conEmpresa(empresa.empresaId, async () => {
      // Repositorios nuevos en cada lectura: la memoria del catalogo es por instancia (design §4).
      const ordenes = new OrdenRepository(clienteConSavepoint(tx));
      const provincias = await ordenes.findAllProvincias();
      const cantones = await ordenes.findCantonesByProvinciaIds(provincias.map((p) => p.id));
      const distritos = await ordenes.findDistritosByCantonIds(cantones.map((c) => c.id));
      const cobertura = await new CoberturaRepository(clienteConSavepoint(tx)).listDistritos();
      const ordenar = <T>(filas: T[]) => [...filas].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return {
        provincias: ordenar(provincias),
        cantones: ordenar(cantones),
        distritos: ordenar(distritos),
        cobertura: ordenar(cobertura.map((f) => ({ ...f, zonas: [...f.zonas].sort((a, b) => a.id.localeCompare(b.id)) }))),
      };
    });
  } finally {
    await comoDueno(tx);
  }
}

/** Cuantas filas de las dos tablas tienen la columna llena y cuantas en NULL. */
async function estadoDeLaColumna(tx: TxDeTest): Promise<{ llenas: number; vacias: number }> {
  const [fila] = await tx.$queryRawUnsafe<{ llenas: number; vacias: number }[]>(
    `SELECT
       (SELECT count(*) FROM zona_distrito WHERE nodo_geografico_id IS NOT NULL)::int
       + (SELECT count(*) FROM distrito_zona_especial WHERE nodo_geografico_id IS NOT NULL)::int AS llenas,
       (SELECT count(*) FROM zona_distrito WHERE nodo_geografico_id IS NULL)::int
       + (SELECT count(*) FROM distrito_zona_especial WHERE nodo_geografico_id IS NULL)::int AS vacias`,
  );
  return fila;
}

async function idsDe(tx: TxDeTest, tabla: "zona_distrito" | "distrito_zona_especial"): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${tabla}`);
  return filas.map((f) => f.id);
}

describeSiHayBase("SLT-44 R12 — las lecturas no leen `nodo_geografico_id` (base propia)", () => {
  beforeAll(async () => {
    propia = await crearBasePropia43("nb");
  }, 600_000);
  afterAll(async () => {
    await propia?.cerrar();
  }, 60_000);

  it("con la columna en NULL y con ella desviada, R18 y R20 dan lo mismo que con la columna llena", async () => {
    const base: PrismaClient = propia!.prisma;
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const antes = await estadoDeLaColumna(tx);
      const llena = { cr: await leerComoLaApp(tx, e.cr), xa: await leerComoLaApp(tx, e.xa) };

      await vaciarColumnasNuevas(tx, {
        zonaDistrito: await idsDe(tx, "zona_distrito"),
        distritoZonaEspecial: await idsDe(tx, "distrito_zona_especial"),
      });
      // Y la lectura con los triggers de columna APAGADOS, como pide el diseño: si una lectura
      // escribiera la columna de paso, no la rellenarian ellos.
      for (const { tabla, trigger } of TRIGGERS_DE_COLUMNAS_NUEVAS) {
        await tx.$executeRawUnsafe(`ALTER TABLE ${tabla} DISABLE TRIGGER ${trigger}`);
      }
      const trasVaciar = await estadoDeLaColumna(tx);
      const enNull = { cr: await leerComoLaApp(tx, e.cr), xa: await leerComoLaApp(tx, e.xa) };

      // Desviada: cada fila de zona de CR apunta al distrito «sin zona».
      await tx.$executeRawUnsafe(
        `UPDATE zona_distrito SET nodo_geografico_id = $1 WHERE organizacion_id = $2`,
        e.cr.geo.distritoSinZonaId,
        e.cr.empresaId,
      );
      const desviada = { cr: await leerComoLaApp(tx, e.cr) };
      return { e, antes, trasVaciar, llena, enNull, desviada };
    });

    // Anti-vacuidad: antes habia filas llenas, despues ninguna; y el escenario esta en las lecturas.
    expect(r.antes.llenas).toBeGreaterThanOrEqual(14);
    expect(r.trasVaciar).toEqual({ llenas: 0, vacias: r.antes.llenas + r.antes.vacias });
    const central = r.llena.cr.distritos.find((d) => d.id === r.e.cr.geo.distritoCentralId);
    expect(central).toMatchObject({ zonaId: r.e.cr.zonas.centralId, esZonaEspecial: true });
    expect(r.llena.xa.cobertura.some((f) => f.distrito.zonaEspecial)).toBe(true);

    expect(r.enNull.cr).toEqual(r.llena.cr);
    expect(r.enNull.xa).toEqual(r.llena.xa);
    expect(r.desviada.cr).toEqual(r.llena.cr);
  }, 120_000);
});
