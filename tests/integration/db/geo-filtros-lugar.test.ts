import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { ListOrdenesWhere } from "@/lib/interfaces/repositories/IOrdenRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";
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
});
