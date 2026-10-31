import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import * as hoy from "@/scripts/geo-equivalencia/lecturas-de-hoy";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo44, type EmpresaGeo44, type EscenarioGeo44 } from "./_fixtures/geo-44";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-44 (T4.5; R14–R20; design §5, §10) — CADA LECTURA NUEVA FRENTE A SU COPIA DE HOY, contra
// Postgres real y con el escenario de `geo-44.ts` (una empresa en Costa Rica y otra en `XA`).
//
// «Hoy» es `scripts/geo-equivalencia/lecturas-de-hoy.ts`, la copia literal de `dev` antes de SLT-44:
// lee las tablas viejas. Lo nuevo lee el catalogo (`nodo_geografico`) y las asignaciones por
// `distrito_id`. Las dos corren en la MISMA transaccion, como `servi_app` con la empresa fijada
// (`comoApp`): la RLS por pais y por empresa actua igual para las dos. Lo nuevo va por
// `clienteConSavepoint`, porque su carga abre su propia transaccion.
//
// EMPATES. Entre dos nombres iguales el orden de hoy no esta definido (design §3): las listas se
// comparan por grupos de nombres consecutivos iguales, y dentro de cada grupo como conjunto (por id).
// Las lecturas sin orden de hoy (`findCantonesByProvinciaIds`, `listDistritos`, ...) se comparan como
// conjunto entero.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa<T>(tx: TxDeTest, empresa: EmpresaGeo44, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresa.empresaId);
  try {
    return await conEmpresa(empresa.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

interface ConNombre {
  id?: string;
  nombre: string;
}

/**
 * La lista partida en grupos de nombres consecutivos iguales (`iguales`), con cada grupo ordenado
 * por id. Dos listas con el mismo orden salvo empates dan los mismos grupos.
 */
function porGruposDeNombre<T extends ConNombre>(
  filas: readonly T[],
  iguales: (a: string, b: string) => boolean = (a, b) => a === b,
): T[][] {
  const grupos: T[][] = [];
  for (const f of filas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && iguales(ultimo[0].nombre, f.nombre)) ultimo.push(f);
    else grupos.push([f]);
  }
  return grupos.map((g) => [...g].sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

/** Igualdad del `localeCompare` con el que hoy se reordena la geografia de una zona. */
const igualesEnEspanol = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;

/** Un arbol con sus hijos canonizados por grupos de nombre, a cualquier profundidad. */
function arbolCanonico(nodos: readonly ConNombre[]): unknown {
  return porGruposDeNombre(nodos).map((grupo) =>
    grupo.map((n) => {
      const copia: Record<string, unknown> = { ...n };
      for (const hijos of ["cantones", "distritos"]) {
        if (Array.isArray(copia[hijos])) copia[hijos] = arbolCanonico(copia[hijos] as ConNombre[]);
      }
      return copia;
    }),
  );
}

/** Como conjunto: ordenado por su JSON (con las listas internas ya ordenadas por quien llama). */
function comoConjunto<T>(filas: readonly T[]): T[] {
  return [...filas].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describeSiHayBase("SLT-44 T4.5 — las lecturas del catalogo dan lo mismo que las de hoy (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  /** El escenario y, para cada caso, repositorios nuevos (memoria vacia) sobre la transaccion. */
  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo44) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo44(tx)));
  }

  describe("R14 — las listas planas de los filtros", () => {
    it("provincias, cantones y distritos: mismos ids, nombres, padres, disponibilidad y orden", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const nuevo = await comoLaEmpresa(tx, empresa, async () => {
            const geo = new GeoRepository(clienteConSavepoint(tx));
            return Promise.all([geo.listProvinciasLite(), geo.listCantonesLite(), geo.listDistritosLite()]);
          });
          // En serie: las tres comparten la conexion de la transaccion del test.
          const deHoy = await comoLaEmpresa(tx, empresa, async () => [
            await hoy.listProvinciasLite(tx),
            await hoy.listCantonesLite(tx),
            await hoy.listDistritosLite(tx),
          ] as const);
          salida.push({ empresa, nuevo, deHoy });
        }
        return salida;
      });

      for (const { empresa, nuevo, deHoy } of r) {
        for (let nivel = 0; nivel < 3; nivel++) {
          expect(porGruposDeNombre(nuevo[nivel])).toEqual(porGruposDeNombre(deHoy[nivel]));
        }
        // Anti-vacuidad: los nodos del escenario estan, con la disponibilidad en cascada.
        const [, cantones, distritos] = nuevo;
        expect(cantones.find((c) => c.id === empresa.geo.cantonRetiradoId)).toMatchObject({ disponible: false });
        expect(distritos.find((d) => d.id === empresa.geo.distritoBajoCantonRetiradoId)).toMatchObject({
          padreId: empresa.geo.cantonRetiradoId,
          disponible: false,
        });
        expect(distritos.find((d) => d.id === empresa.geo.distritoCentralId)).toMatchObject({ disponible: true });
      }
      // Cada empresa ve solo su pais.
      const [cr, xa] = r;
      expect(cr.nuevo[2].some((d) => d.id === xa.empresa.geo.distritoCentralId)).toBe(false);
      expect(xa.nuevo[2].some((d) => d.id === cr.empresa.geo.distritoCentralId)).toBe(false);
      expect(cr.nuevo[2].length).toBeGreaterThan(400);
    });
  });

  describe("R15 — la geografia de una zona", () => {
    it("cada zona del escenario, una zona sin distritos y una zona de otra empresa", async () => {
      const r = await conEscenario(async (tx, e) => {
        await fijarEmpresa(tx, e.cr.empresaId);
        const vacia = await tx.zona.create({
          data: { nombre: `Zona vacia SLT44 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        });
        const casos = [
          { empresa: e.cr, zonaId: e.cr.zonas.centralId },
          { empresa: e.cr, zonaId: e.cr.zonas.norteId },
          { empresa: e.cr, zonaId: e.cr.zonas.surId },
          { empresa: e.cr, zonaId: vacia.id },
          { empresa: e.cr, zonaId: e.xa.zonas.norteId },
          { empresa: e.xa, zonaId: e.xa.zonas.norteId },
          { empresa: e.xa, zonaId: e.xa.geo43.zonaId },
          { empresa: e.xa, zonaId: e.cr.zonas.surId },
        ];
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          // Un repositorio por empresa, como en una peticion: el catalogo se carga una vez.
          const leidas = await comoLaEmpresa(tx, empresa, async () => {
            const geo = new GeoRepository(clienteConSavepoint(tx));
            const filas = [];
            for (const caso of casos.filter((c) => c.empresa === empresa)) {
              filas.push({
                ...caso,
                nuevo: await geo.listGeografiaLitePorZona(caso.zonaId),
                deHoy: await hoy.listGeografiaLitePorZona(tx, caso.zonaId),
              });
            }
            return filas;
          });
          salida.push(...leidas);
        }
        return { e, vaciaId: vacia.id, salida };
      });

      for (const { nuevo, deHoy } of r.salida) {
        for (const nivel of ["provincias", "cantones", "distritos"] as const) {
          expect(porGruposDeNombre(nuevo[nivel], igualesEnEspanol)).toEqual(porGruposDeNombre(deHoy[nivel], igualesEnEspanol));
        }
      }

      const de = (empresaId: string, zonaId: string) =>
        r.salida.find((s) => s.empresa.empresaId === empresaId && s.zonaId === zonaId)!.nuevo;
      const { cr, xa } = r.e;
      // Anti-vacuidad: la zona norte de CR tiene el distrito de dos zonas y el retirado, su canton y
      // su provincia.
      expect(de(cr.empresaId, cr.zonas.norteId).distritos.map((d) => d.id).sort()).toEqual(
        [cr.geo.distritoDosZonasId, cr.geo.distritoRetiradoId].sort(),
      );
      expect(de(cr.empresaId, cr.zonas.norteId).cantones.map((c) => c.id)).toEqual([cr.geo.cantonId]);
      expect(de(cr.empresaId, cr.zonas.norteId).provincias.map((p) => p.id)).toEqual([cr.geo.provinciaId]);
      // La zona sur cuelga del canton retirado: sale, no disponible.
      expect(de(cr.empresaId, cr.zonas.surId).cantones).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: cr.geo.cantonRetiradoId, disponible: false })]),
      );
      // Zona sin distritos y zona de otra empresa: las tres listas vacias.
      const vacio = { provincias: [], cantones: [], distritos: [] };
      expect(de(cr.empresaId, r.vaciaId)).toEqual(vacio);
      expect(de(cr.empresaId, xa.zonas.norteId)).toEqual(vacio);
      expect(de(xa.empresaId, cr.zonas.surId)).toEqual(vacio);
    });
  });

  describe("R16 — el arbol de la empresa (tarifas)", () => {
    it("mismo arbol, con el flag propio, la zona que cubre cada distrito y su marca", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const nuevo = await comoLaEmpresa(tx, empresa, () => new GeoRepository(clienteConSavepoint(tx)).listArbol());
          const deHoy = await comoLaEmpresa(tx, empresa, () => hoy.listArbol(tx));
          salida.push({ empresa, nuevo, deHoy });
        }
        return salida;
      });

      for (const { empresa, nuevo, deHoy } of r) {
        expect(arbolCanonico(nuevo)).toEqual(arbolCanonico(deHoy));

        // Anti-vacuidad: el escenario esta en el arbol, con zona, marca y flag propio.
        const provincia = nuevo.find((p) => p.id === empresa.geo.provinciaId)!;
        const canton = provincia.cantones.find((c) => c.id === empresa.geo.cantonId)!;
        const retirado = provincia.cantones.find((c) => c.id === empresa.geo.cantonRetiradoId)!;
        const distrito = (id: string) => [...canton.distritos, ...retirado.distritos].find((d) => d.id === id);
        expect(retirado.activo).toBe(false);
        expect(distrito(empresa.geo.distritoCentralId)).toMatchObject({ zonaId: empresa.zonas.centralId, zonaEspecial: true });
        expect(distrito(empresa.geo.distritoDosZonasId)).toMatchObject({ zonaId: null, zonaNombre: null });
        expect(distrito(empresa.geo.distritoSinZonaId)).toMatchObject({ zonaId: null, zonaEspecial: false });
        expect(distrito(empresa.geo.distritoRetiradoId)).toMatchObject({ zonaId: empresa.zonas.norteId, activo: false });
        expect(distrito(empresa.geo.distritoBajoCantonRetiradoId)).toMatchObject({
          zonaId: empresa.zonas.surId,
          zonaEspecial: true,
          activo: true,
        });
      }
    });
  });

  describe("R17 — el arbol de un pais para el superadmin", () => {
    it("CR y XA: mismos ids, nombres, codigos y flags propios", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const paisId of ["CR", "XA"]) {
          const nuevo = await comoPlataforma("SLT-44", "test de R17", () =>
            new GeoRepository(clienteConSavepoint(tx)).listArbolDePais(paisId),
          );
          const deHoy = await hoy.listArbolDePais(tx, paisId);
          salida.push({ paisId, nuevo, deHoy });
        }
        return { e, salida };
      });

      for (const { nuevo, deHoy } of r.salida) {
        expect(arbolCanonico(nuevo)).toEqual(arbolCanonico(deHoy));
        expect(nuevo.length).toBeGreaterThan(0);
      }
      const xa = r.salida.find((s) => s.paisId === "XA")!.nuevo;
      expect(xa.find((p) => p.id === r.e.xa.geo43.geo.provinciaId)).toMatchObject({ codigo: "1" });
      expect(xa.some((p) => p.id === r.e.cr.geo.provinciaId)).toBe(false);
    });
  });

  describe("R18 — la resolucion por nombres (carga masiva y cotizacion)", () => {
    it("las tres lecturas, con todas las provincias y cantones del pais, dan las mismas filas", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const nuevo = await comoLaEmpresa(tx, empresa, async () => {
            const repo = new OrdenRepository(clienteConSavepoint(tx));
            const provincias = await repo.findAllProvincias();
            const cantones = await repo.findCantonesByProvinciaIds(provincias.map((p) => p.id));
            const distritos = await repo.findDistritosByCantonIds(cantones.map((c) => c.id));
            return { provincias, cantones, distritos };
          });
          const deHoy = await comoLaEmpresa(tx, empresa, async () => {
            const provincias = await hoy.findAllProvincias(tx);
            const cantones = await hoy.findCantonesByProvinciaIds(tx, provincias.map((p) => p.id));
            const distritos = await hoy.findDistritosByCantonIds(tx, cantones.map((c) => c.id));
            return { provincias, cantones, distritos };
          });
          const vacias = await comoLaEmpresa(tx, empresa, async () => {
            const repo = new OrdenRepository(clienteConSavepoint(tx));
            return [await repo.findCantonesByProvinciaIds([]), await repo.findDistritosByCantonIds([])];
          });
          salida.push({ empresa, nuevo, deHoy, vacias });
        }
        return salida;
      });

      for (const { empresa, nuevo, deHoy, vacias } of r) {
        expect(comoConjunto(nuevo.provincias)).toEqual(comoConjunto(deHoy.provincias));
        expect(comoConjunto(nuevo.cantones)).toEqual(comoConjunto(deHoy.cantones));
        expect(comoConjunto(nuevo.distritos)).toEqual(comoConjunto(deHoy.distritos));
        expect(vacias).toEqual([[], []]);

        const d = (id: string) => nuevo.distritos.find((x) => x.id === id);
        expect(d(empresa.geo.distritoCentralId)).toMatchObject({
          zonaId: empresa.zonas.centralId,
          esCentral: true,
          esZonaEspecial: true,
          disponible: true,
        });
        expect(d(empresa.geo.distritoDosZonasId)).toMatchObject({ zonaId: null, esCentral: false });
        expect(d(empresa.geo.distritoBajoCantonRetiradoId)).toMatchObject({
          zonaId: empresa.zonas.surId,
          esZonaEspecial: true,
          disponible: false,
        });
      }
    });

    it("con un subconjunto de padres, solo sus hijos (el `in` de hoy)", async () => {
      const r = await conEscenario(async (tx, e) => {
        const nuevo = await comoLaEmpresa(tx, e.cr, async () => {
          const repo = new OrdenRepository(clienteConSavepoint(tx));
          return {
            cantones: await repo.findCantonesByProvinciaIds([e.cr.geo.provinciaId]),
            distritos: await repo.findDistritosByCantonIds([e.cr.geo.cantonRetiradoId]),
          };
        });
        const deHoy = await comoLaEmpresa(tx, e.cr, async () => ({
          cantones: await hoy.findCantonesByProvinciaIds(tx, [e.cr.geo.provinciaId]),
          distritos: await hoy.findDistritosByCantonIds(tx, [e.cr.geo.cantonRetiradoId]),
        }));
        return { e, nuevo, deHoy };
      });
      expect(comoConjunto(r.nuevo.cantones)).toEqual(comoConjunto(r.deHoy.cantones));
      expect(comoConjunto(r.nuevo.distritos)).toEqual(comoConjunto(r.deHoy.distritos));
      expect(r.nuevo.cantones.map((c) => c.id).sort()).toEqual([r.e.cr.geo.cantonId, r.e.cr.geo.cantonRetiradoId].sort());
      expect(r.nuevo.distritos.map((d) => d.id)).toEqual([r.e.cr.geo.distritoBajoCantonRetiradoId]);
    });
  });

  describe("R19 — el distrito propuesto en la correccion de datos", () => {
    it("distritos, retirado, dos zonas, id de canton o provincia, id de otro pais e id inexistente", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const [empresa, otra] of [
          [e.cr, e.xa],
          [e.xa, e.cr],
        ] as const) {
          const ids = [
            ...Object.values(empresa.geo),
            otra.geo.distritoCentralId,
            randomUUID(),
          ];
          // Un repositorio por empresa, como en una peticion: el catalogo se carga una vez.
          const leidas = await comoLaEmpresa(tx, empresa, async () => {
            const repo = new OrdenRepository(clienteConSavepoint(tx));
            const filas = [];
            for (const id of ids) {
              filas.push({ id, nuevo: await repo.findDistritoParaCorreccion(id), deHoy: await hoy.findDistritoParaCorreccion(tx, id) });
            }
            return filas;
          });
          for (const fila of leidas) salida.push({ empresa, otra, ...fila });
        }
        return salida;
      });

      for (const { nuevo, deHoy } of r) expect(nuevo).toEqual(deHoy);

      const de = (empresa: EmpresaGeo44, id: string) =>
        r.find((s) => s.empresa.empresaId === empresa.empresaId && s.id === id)!.nuevo;
      for (const { empresa, otra } of r) {
        expect(de(empresa, empresa.geo.distritoCentralId)).toEqual({
          id: empresa.geo.distritoCentralId,
          nombre: expect.stringContaining("Central SLT44"),
          cantonId: empresa.geo.cantonId,
          provinciaId: empresa.geo.provinciaId,
          zonaId: empresa.zonas.centralId,
          zonaNombre: expect.stringContaining("Zona central SLT44"),
          esCentral: true,
          esZonaEspecial: true,
          disponible: true,
        });
        expect(de(empresa, empresa.geo.distritoRetiradoId)).toMatchObject({ disponible: false, zonaId: empresa.zonas.norteId });
        expect(de(empresa, empresa.geo.distritoDosZonasId)).toMatchObject({ zonaId: null, zonaNombre: null, esCentral: false });
        expect(de(empresa, empresa.geo.distritoBajoCantonRetiradoId)).toMatchObject({
          cantonId: empresa.geo.cantonRetiradoId,
          disponible: false,
        });
        expect(de(empresa, empresa.geo.cantonId)).toBeNull();
        expect(de(empresa, empresa.geo.provinciaId)).toBeNull();
        expect(de(empresa, otra.geo.distritoCentralId)).toBeNull();
      }
    });
  });

  describe("R20 — el Excel de cobertura", () => {
    it("cada distrito del pais con las mismas zonas candidatas, marca, flags y disponibilidad", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const nuevo = await comoLaEmpresa(tx, empresa, () =>
            new CoberturaRepository(clienteConSavepoint(tx)).listDistritos(),
          );
          const deHoy = await comoLaEmpresa(tx, empresa, () => hoy.listDistritos(tx));
          salida.push({ empresa, nuevo, deHoy });
        }
        return salida;
      });

      // Las zonas de una fila no tienen orden garantizado (ni hoy ni ahora): se ordenan por id.
      const normal = (filas: typeof r[number]["nuevo"]) =>
        comoConjunto(filas.map((f) => ({ ...f, zonas: [...f.zonas].sort((a, b) => a.id.localeCompare(b.id)) })));
      for (const { empresa, nuevo, deHoy } of r) {
        expect(nuevo).toHaveLength(deHoy.length);
        expect(normal(nuevo)).toEqual(normal(deHoy));

        // Cada empresa ve solo su pais, y en el hay un solo escenario de `geo-44.ts`.
        const fila = (nombre: string) => nuevo.find((f) => f.distrito.nombre.startsWith(`${nombre} SLT44`));
        expect(fila("Central")).toMatchObject({ distrito: { zonaEspecial: true }, zonas: [{ id: empresa.zonas.centralId, esCentral: true }] });
        expect(fila("Dos zonas")?.zonas.map((z) => z.id).sort()).toEqual([empresa.zonas.norteId, empresa.zonas.surId].sort());
        expect(fila("Bajo retirado")).toMatchObject({ disponible: false, canton: { activo: false }, distrito: { zonaEspecial: true } });
        expect(fila("Sin zona")).toMatchObject({ zonas: [], disponible: true });
      }
    });
  });
});
