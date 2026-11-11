import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { ListOrdenesWhere } from "@/lib/interfaces/repositories/IOrdenRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";
import { ESTATUS_POR_GRUPO } from "@/lib/types/novedad-grupo";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo47, type EmpresaGeo47 } from "./_fixtures/geo-47";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-47 (T2.3; R11–R15, R27, R37; design §3) — `/ordenes` y la bodega satelite filtran por el lugar
// elegido sobre Postgres real, en el fixture `geo-47` (homonimos en CR y en `XA`).
//
// Se lee como la app: `servi_app` con la RLS de la empresa y el contexto `conEmpresa`, con un
// repositorio nuevo por lectura. «Hoy» es el filtro por la columna de su nivel, leido con Prisma sobre
// la misma transaccion (el `criterioColumna` que la feature retira).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function comoLaEmpresa<T>(tx: TxDeTest, empresaId: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresaId);
  try {
    return await conEmpresa(empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** Los ids del listado de `/ordenes` con ese `where`, ordenados. */
async function listado(tx: TxDeTest, where: ListOrdenesWhere): Promise<string[]> {
  const r = await new OrdenRepository(tx as unknown as PrismaClient).list({
    where,
    sortBy: "created_at",
    sortDir: "desc",
    skip: 0,
    take: 500,
  });
  return r.items.map((o) => o.id).sort();
}

type Columna = "provinciaId" | "cantonId" | "distritoId";

/** «Hoy»: las ordenes vivas con la columna del nivel en `ids`. */
async function deHoy(tx: TxDeTest, columna: Columna, ids: string[]): Promise<string[]> {
  const filas = await tx.orden.findMany({ where: { deletedAt: null, [columna]: { in: ids } }, select: { id: true } });
  return filas.map((f) => f.id).sort();
}

/** Cada lugar de la empresa con la columna de su nivel, para la equivalencia (R27). */
function lugaresDeLaEmpresa(e: EmpresaGeo47): [Columna, string][] {
  const g = e.base.base.geo;
  const h = e.homonimos;
  return [
    ["provinciaId", g.provinciaId],
    ["provinciaId", h.provinciaCentralId],
    ["cantonId", g.cantonId],
    ["cantonId", g.cantonRetiradoId],
    ["cantonId", h.cantonCentral1Id],
    ["cantonId", h.cantonCentral2Id],
    ["distritoId", g.distritoCentralId],
    ["distritoId", g.distritoDosZonasId],
    ["distritoId", g.distritoSinZonaId],
    ["distritoId", g.distritoBajoCantonRetiradoId],
    ["distritoId", h.sanRafael1Id],
    ["distritoId", h.sanRafael2Id],
  ];
}

describeSiHayBase("SLT-47 — filtro de lugar en /ordenes y en la bodega satelite (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R11, R13: dos «San Rafael» y dos «Central» no se confunden, en CR y en XA", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const salida = [];
      for (const emp of [e.cr, e.xa]) {
        const h = emp.homonimos;
        salida.push(
          await comoLaEmpresa(tx, emp.base.base.empresaId, async () => ({
            o: emp.ordenes,
            sanRafael1: await listado(tx, { lugarIds: [h.sanRafael1Id] }),
            central1: await listado(tx, { lugarIds: [h.cantonCentral1Id] }),
            provinciaCentral: await listado(tx, { lugarIds: [h.provinciaCentralId] }),
          })),
        );
      }
      return salida;
    });
    for (const x of r) {
      expect(x.sanRafael1).toEqual([x.o.enSanRafael1Id]);
      expect(x.central1).toEqual([x.o.enSanRafael1Id, x.o.sinDistritoCentral1Id].sort());
      // La provincia «Central» trae lo suyo y nada del canton «Central» de la otra provincia.
      expect(x.provinciaCentral).toEqual([x.o.enSanRafael2Id, x.o.sinDistritoCentral2Id].sort());
    }
  }, 120_000);

  it("R27: con la cadena coherente, cada lugar de cualquier nivel da las mismas ordenes que hoy por su columna", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const difs: string[] = [];
      let conFilas = 0;
      for (const emp of [e.cr, e.xa]) {
        await comoLaEmpresa(tx, emp.base.base.empresaId, async () => {
          for (const [columna, id] of lugaresDeLaEmpresa(emp)) {
            const nuevo = await listado(tx, { lugarIds: [id] });
            const hoy = await deHoy(tx, columna, [id]);
            if (JSON.stringify(nuevo) !== JSON.stringify(hoy)) difs.push(`${columna}=${id}`);
            if (nuevo.length > 0) conFilas++;
          }
        });
      }
      return { difs, conFilas };
    });
    expect(r.difs).toEqual([]);
    // Antivacio: la mayoria de los lugares tiene ordenes.
    expect(r.conFilas).toBeGreaterThanOrEqual(16);
  }, 120_000);

  it("R12, R37: un id fuera del catalogo, o de otro pais, da cero ordenes y nunca «sin filtro»", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      return comoLaEmpresa(tx, e.cr.base.base.empresaId, async () => ({
        todas: await listado(tx, {}),
        inexistente: await listado(tx, { lugarIds: ["slt47-no-existe"] }),
        deOtroPais: await listado(tx, { lugarIds: [e.xa.base.base.geo.provinciaId, e.xa.homonimos.sanRafael1Id] }),
        mezcla: await listado(tx, { lugarIds: ["slt47-no-existe", e.cr.homonimos.sanRafael2Id] }),
        o: e.cr.ordenes,
      }));
    });
    expect(r.todas.length).toBeGreaterThan(10);
    expect(r.inexistente).toEqual([]);
    expect(r.deOtroPais).toEqual([]);
    expect(r.mezcla).toEqual([r.o.enSanRafael2Id]);
  }, 120_000);

  it("R14: el lugar se suma en AND a la zona y a la tienda", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const b = e.cr.base.base;
      return comoLaEmpresa(tx, b.empresaId, async () => ({
        cantonNorte: await listado(tx, { lugarIds: [b.geo.cantonId], zonaId: [b.zonas.norteId] }),
        hoyCantonNorte: (
          await tx.orden.findMany({
            where: { deletedAt: null, cantonId: b.geo.cantonId, zonaId: b.zonas.norteId },
            select: { id: true },
          })
        )
          .map((o) => o.id)
          .sort(),
        otraTienda: await listado(tx, { lugarIds: [b.geo.provinciaId], tiendaId: "slt47-otra-tienda" }),
      }));
    });
    expect(r.cantonNorte.length).toBeGreaterThan(0);
    expect(r.cantonNorte).toEqual(r.hoyCantonNorte);
    expect(r.otraTienda).toEqual([]);
  }, 120_000);

  it("R15: el resultado es el mismo con `orden.nodo_geografico_id` en NULL (sin backfill)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const emp = e.xa;
      const lugares = lugaresDeLaEmpresa(emp).map(([, id]) => id);
      const leer = () =>
        comoLaEmpresa(tx, emp.base.base.empresaId, async () => {
          const salida: string[][] = [];
          for (const id of lugares) salida.push(await listado(tx, { lugarIds: [id] }));
          return salida;
        });
      const antes = await leer();
      await tx.$executeRawUnsafe(`UPDATE orden SET nodo_geografico_id = NULL WHERE organizacion_id = $1`, emp.base.base.empresaId);
      const despues = await leer();
      return { antes, despues };
    });
    expect(r.antes.some((ids) => ids.length > 0)).toBe(true);
    expect(r.despues).toEqual(r.antes);
  }, 120_000);

  it("R11, R14: la bodega satelite filtra por el lugar dentro de SU zona (pagina, conjunto y vigencia)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const b = e.cr.base.base;
      const estante = e.cr.base.ordenes.desalineadaEnEstanteId; // zona norte, distrito central
      return comoLaEmpresa(tx, b.empresaId, async () => {
        const repo = new OrdenRepository(tx as unknown as PrismaClient);
        const filtro = (lugarIds?: string[]) => ({
          zonaId: b.zonas.norteId,
          estatusValues: [...ESTADOS_BODEGA_SATELITE],
          ...(lugarIds ? { lugarIds } : {}),
        });
        const pagina = async (lugarIds?: string[]) =>
          (await repo.findRecepcionSatelitePaginada(filtro(lugarIds), { skip: 0, take: 50 })).items.map((o) => o.id);
        return {
          estante,
          sinLugar: await pagina(),
          porProvincia: await pagina([b.geo.provinciaId]),
          porDistrito: await pagina([b.geo.distritoCentralId]),
          otroLugar: await pagina([e.cr.homonimos.cantonCentral1Id]),
          deOtraZona: await pagina([b.geo.distritoBajoCantonRetiradoId]),
          conjunto: (await repo.findRecepcionSateliteCompleta(filtro([b.geo.distritoCentralId]))).map((o) => o.id),
          vigencia: await repo.findIdsVigentesEnBodega(filtro([e.cr.homonimos.sanRafael1Id]), [estante]),
        };
      });
    });
    expect(r.sinLugar).toContain(r.estante);
    expect(r.porProvincia).toContain(r.estante);
    expect(r.porDistrito).toEqual([r.estante]);
    expect(r.otroLugar).toEqual([]);
    expect(r.deOtraZona).toEqual([]);
    expect(r.conjunto).toEqual([r.estante]);
    expect(r.vigencia).toEqual([]);
  }, 120_000);

  it("R37: en plataforma, con lugar, el listado falla con EmpresaNoResuelta", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      return comoPlataforma("SLT-47", "test: listado con lugar en plataforma", () =>
        listado(tx, { lugarIds: [e.cr.base.base.geo.cantonId] }).then(
          () => null,
          (err: unknown) => err,
        ),
      );
    });
    expect(r).toBeInstanceOf(EmpresaNoResuelta);
  }, 120_000);

  it("R36: el rol de zona recibe los lugares de su zona a cualquier profundidad, sin los de asignacion propia de otra", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const b = e.xa.base.base;
      return comoLaEmpresa(tx, b.empresaId, async () => {
        const geo = new GeoRepository(tx as unknown as PrismaClient);
        return {
          c: e.xa.cuarto,
          provinciaId: b.geo.provinciaId,
          norte: await geo.listLugaresDeFiltro(b.zonas.norteId),
          sur: await geo.listLugaresDeFiltro(b.zonas.surId),
          todo: await geo.listLugaresDeFiltro(),
        };
      });
    });
    const ids = (l: { lugares: { id: string }[] }) => new Set(l.lugares.map((x) => x.id));
    // Cuatro niveles en XA, rotulados con los tipos del pais.
    expect(r.todo.niveles.map((n) => n.profundidad)).toEqual([1, 2, 3, 4]);
    expect(r.todo.niveles[3].singular).toBe("Sector");
    expect(ids(r.todo).has(r.c.sectorPropioId)).toBe(true);
    // Norte cubre el distrito «Con sector» y el sector que hereda; el de asignacion propia es de sur.
    expect(ids(r.norte).has(r.c.distritoConSectorId)).toBe(true);
    expect(ids(r.norte).has(r.c.sectorHeredaId)).toBe(true);
    expect(ids(r.norte).has(r.c.sectorPropioId)).toBe(false);
    // Sur recibe su sector (profundidad 4) con sus ancestros hasta la provincia.
    expect(ids(r.sur).has(r.c.sectorPropioId)).toBe(true);
    expect(ids(r.sur).has(r.c.distritoConSectorId)).toBe(true);
    expect(ids(r.sur).has(r.provinciaId)).toBe(true);
    expect(r.sur.lugares.find((l) => l.id === r.c.sectorPropioId)).toMatchObject({ profundidad: 4, padreId: r.c.distritoConSectorId });
  }, 120_000);

  it("R36 (medida): tamaño del JSON del catalogo de filtros de Costa Rica antes y despues", async () => {
    const r = await revertida(base, async (tx) => {
      const org = await tx.organizacion.create({ data: { nombre: `CR SLT47 ${Date.now()}`, slug: `cr-slt47-${Date.now()}` }, select: { id: true } });
      return comoLaEmpresa(tx, org.id, async () => {
        const geo = new GeoRepository(tx as unknown as PrismaClient);
        const antes = {
          provincias: await geo.listProvinciasLite(),
          cantones: await geo.listCantonesLite(),
          distritos: await geo.listDistritosLite(),
        };
        const despues = { ...antes, ...(await geo.listLugaresDeFiltro()) };
        return { antes: JSON.stringify(antes).length, despues: JSON.stringify(despues).length, nodos: despues.lugares.length };
      });
    });
    console.log(`SLT-47 catalogo CR: antes=${r.antes} bytes despues=${r.despues} bytes lugares=${r.nodos}`);
    expect(r.nodos).toBeGreaterThan(0);
    expect(r.despues).toBeGreaterThan(r.antes);
  }, 120_000);

  it("R16, R13: asignaciones y novedades traen la ruta de su lugar por id; dos «San Rafael» no se confunden", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo47(tx);
      const emp = e.cr;
      const b = emp.base.base;
      const o = emp.ordenes;
      const ids = [o.enSanRafael1Id, o.enSanRafael2Id, o.sinDistritoCentral1Id];
      // Como dueño: las tres del mensajero de `geo-65`, y dos de ellas devueltas (novedades).
      await tx.orden.updateMany({ where: { id: { in: ids } }, data: { mensajeroAsignadoId: emp.base.mensajeroId } });
      const devuelta = await tx.orderStatus.findUniqueOrThrow({ where: { value: ESTATUS_POR_GRUPO.devolucion }, select: { id: true } });
      await tx.orden.updateMany({ where: { id: { in: [o.enSanRafael1Id, o.enSanRafael2Id] } }, data: { estatusId: devuelta.id } });
      return comoLaEmpresa(tx, b.empresaId, async () => {
        const gestion = new GestionOrdenRepository(tx as unknown as PrismaClient);
        const asignadas = await gestion.findMisAsignaciones(emp.base.mensajeroId, ["en_preparacion", ESTATUS_POR_GRUPO.devolucion]);
        const novedades = await new OrdenRepository(tx as unknown as PrismaClient).findNovedadesByTienda(b.tiendaId, "devolucion", {
          skip: 0,
          take: 50,
        });
        return { emp, asignadas, novedades };
      });
    });
    const { emp } = r;
    const h = emp.homonimos;
    const p1 = emp.base.base.geo.provinciaId;
    const rutaDe = (filas: { id: string; lugarRuta?: { id: string; nombre: string }[] }[], id: string) =>
      filas.find((f) => f.id === id)?.lugarRuta?.map((p) => p.id);
    expect(rutaDe(r.asignadas, emp.ordenes.enSanRafael1Id)).toEqual([p1, h.cantonCentral1Id, h.sanRafael1Id]);
    expect(rutaDe(r.asignadas, emp.ordenes.enSanRafael2Id)).toEqual([h.provinciaCentralId, h.cantonCentral2Id, h.sanRafael2Id]);
    expect(rutaDe(r.asignadas, emp.ordenes.sinDistritoCentral1Id)).toEqual([p1, h.cantonCentral1Id]);
    expect(rutaDe(r.novedades, emp.ordenes.enSanRafael1Id)).toEqual([p1, h.cantonCentral1Id, h.sanRafael1Id]);
    expect(rutaDe(r.novedades, emp.ordenes.enSanRafael2Id)).toEqual([h.provinciaCentralId, h.cantonCentral2Id, h.sanRafael2Id]);
    // Mismos nombres, ids distintos (R13); y solo id y nombre por paso (sin dato personal nuevo).
    const n1 = r.novedades.find((f) => f.id === emp.ordenes.enSanRafael1Id)!.lugarRuta!;
    const n2 = r.novedades.find((f) => f.id === emp.ordenes.enSanRafael2Id)!.lugarRuta!;
    expect(n1.at(-1)!.nombre).toBe(n2.at(-1)!.nombre);
    for (const paso of n1) expect(Object.keys(paso).sort()).toEqual(["id", "nombre"]);
  }, 120_000);
});
